#!/usr/bin/env python3
"""Admin-only, lossless collection copy. Does not delete sources. Raw Firestore typed fields retained."""
import argparse, json, os, subprocess, urllib.request, urllib.error, urllib.parse
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--backup',required=True);p.add_argument('--apply',action='store_true');p.add_argument('--baseline');p.add_argument('--report');args=p.parse_args()
# Firebase CLI's existing OAuth login; credentials never appear in output or backup.
auth_module=subprocess.check_output(['mise','which','firebase'],text=True).strip()
auth_module=str(Path(auth_module).resolve().parent.parent/'auth.js')
script="const a=require(process.argv[1]);const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[2]));a.getAccessToken(c.tokens.refresh_token,c.tokens.scopes).then(t=>process.stdout.write(t.access_token)).catch(()=>process.exit(1));"
token=subprocess.check_output(['node','-e',script,auth_module,str(Path.home()/'.config/configstore/firebase-tools.json')],text=True)
base='https://firestore.googleapis.com/v1/projects/yuka-planner/databases/(default)/documents/'
def request(path,method='GET',body=None):
 req=urllib.request.Request(base+path,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method=method,data=json.dumps(body).encode() if body is not None else None)
 try:
  with urllib.request.urlopen(req) as r:return json.load(r) if r.status!=204 else {}
 except urllib.error.HTTPError as e:
  if e.code==404:return None
  raise

def docs(collection):
 out=[];page=''
 while True:
  data=request(collection+'?pageSize=1000'+('&pageToken='+urllib.parse.quote(page) if page else '')) or {}
  out.extend(data.get('documents',[]));page=data.get('nextPageToken')
  if not page:return out

def collection_ids(path):
 out=[];page=''
 while True:
  body={'pageSize':1000}
  if page:body['pageToken']=page
  data=request(path+':listCollectionIds','POST',body) or {};out.extend(data.get('collectionIds',[]));page=data.get('nextPageToken')
  if not page:return out

snapshot={}
def visit(doc):
 path=doc['name'].split('/documents/')[1];snapshot[path]=doc.get('fields',{})
 for col in collection_ids(path):
  for child in docs(path+'/'+col):visit(child)
for root in ['families','households','householdCodes','placeStats']:
 for doc in docs(root):
  # Re-runs must never treat migrated family roots as legacy child profiles.
  if root=='families' and 'profile' not in doc.get('fields',{}):continue
  visit(doc)
backup=Path(args.backup);backup.parent.mkdir(parents=True,exist_ok=True)
if backup.exists():raise SystemExit('Backup already exists; use a new filename.')
fd=os.open(str(backup),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:json.dump(snapshot,f,ensure_ascii=False)

def destination(path):
 parts=path.split('/')
 if parts[0]=='families':parts[0]='children'
 elif parts[0]=='households':
  parts[0]='families'
  if len(parts)>2 and parts[2]=='children':parts[2]='childLinks'
 elif parts[0]=='householdCodes':parts[0]='familyInviteCodes'
 elif parts[0]=='placeStats':parts[0]='placeUsageStats'
 return '/'.join(parts)
mapping={path:destination(path) for path in snapshot}
assert len(set(mapping.values()))==len(mapping),'Destination collision'
print('Snapshot documents:',len(snapshot),'Backup:',backup)
baseline=json.loads(Path(args.baseline).read_text()) if args.baseline else {}
plan=[]; conflicts=[]; target_snapshot={}
for source,target in mapping.items():
 existing=request(target);target_snapshot[target]=existing
 current=existing.get('fields',{}) if existing else None
 if current==snapshot[source]:continue
 if current is not None and (source not in baseline or current!=baseline[source]):
  conflicts.append({'source':source,'target':target,'reason':'target changed independently or baseline unavailable'});continue
 plan.append({'source':source,'target':target,'targetUpdateTime':existing.get('updateTime') if existing else None})
# Disappeared sources are reported, never silently resurrected or deleted.
for source in baseline:
 if source not in snapshot and request(destination(source)):
  conflicts.append({'source':source,'target':destination(source),'reason':'source removed; review target preservation/deletion'})
report={'documents':len(snapshot),'copyOrRefresh':plan,'conflicts':conflicts,'sourceDeleted':False}
if args.report:
 fd=os.open(args.report,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w') as f:json.dump(report,f,ensure_ascii=False,indent=2)
print('Safe copies/refreshes:',len(plan),'Conflicts:',len(conflicts))
if args.apply:
 if conflicts:raise SystemExit('Conflict review required; no writes performed.')
 for entry in plan:
  source,target=entry['source'],entry['target']
  if (request(source) or {}).get('fields',{})!=snapshot[source]:raise SystemExit('Source changed; stop and repeat inventory: '+source)
  precondition=('currentDocument.updateTime='+urllib.parse.quote(entry['targetUpdateTime']) if entry['targetUpdateTime'] else 'currentDocument.exists=false')
  request(target+'?'+precondition,'PATCH',{'fields':snapshot[source]})
 for source,target in mapping.items():
  if (request(source) or {}).get('fields',{})!=snapshot[source]:raise SystemExit('Source changed during copy; do not switch app paths: '+source)
  if (request(target) or {}).get('fields',{})!=snapshot[source]:raise SystemExit('Verification failed: '+target)
 print('Copied/refreshed and verified:',len(plan),'documents. Source documents preserved.')
print('Collections:',{root:sum(path.split('/')[0]==root for path in mapping.values())for root in ['children','families','familyInviteCodes','placeUsageStats']})
