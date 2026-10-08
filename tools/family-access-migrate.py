#!/usr/bin/env python3
"""Reviewed additive migration: dry-run by default; atomic preconditions; no deletes."""
import argparse,json,subprocess,urllib.request,urllib.error,os
from pathlib import Path
from importlib.util import spec_from_file_location,module_from_spec

def encode(v):
 if isinstance(v,bool):return {'booleanValue':v}
 if isinstance(v,int):return {'integerValue':str(v)}
 if isinstance(v,str):return {'stringValue':v}
 if isinstance(v,dict):return {'mapValue':{'fields':{k:encode(x)for k,x in v.items()}}}
 raise ValueError('Unsupported migration field')
def main():
 p=argparse.ArgumentParser();p.add_argument('--snapshot',required=True);p.add_argument('--decisions',required=True);p.add_argument('--apply',action='store_true');p.add_argument('--report',required=True);args=p.parse_args()
 spec=spec_from_file_location('planner',str(Path(__file__).with_name('family-access-plan.py')));planner=module_from_spec(spec);spec.loader.exec_module(planner)
 snapshot=json.loads(Path(args.snapshot).read_text());plan=planner.plan(snapshot,json.loads(Path(args.decisions).read_text()))
 if not plan['ready']:raise SystemExit('Reviewed migration has unresolved blockers')
 cli=Path(subprocess.check_output(['mise','which','firebase'],text=True).strip()).resolve();auth=str(cli.parent.parent/'auth.js')
 script="const a=require(process.argv[1]);const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[2]));a.getAccessToken(c.tokens.refresh_token,c.tokens.scopes).then(t=>process.stdout.write(t.access_token)).catch(()=>process.exit(1));"
 token=subprocess.check_output(['node','-e',script,auth,str(Path.home()/'.config/configstore/firebase-tools.json')],text=True)
 project='projects/yuka-planner/databases/(default)';base='https://firestore.googleapis.com/v1/'+project+'/documents/'
 def get(path):
  try:
   with urllib.request.urlopen(urllib.request.Request(base+path,headers={'Authorization':'Bearer '+token}),timeout=30)as r:return json.load(r)
  except urllib.error.HTTPError as e:
   if e.code==404:return None
   raise
 checks=[]
 # Compare every reviewed source document, then protect the write with its updateTime.
 for path,fields in snapshot.items():
  doc=get(path)
  if not doc or doc.get('fields',{})!=fields:raise SystemExit('Source changed since audit; refresh snapshot before migration')
  checks.append({'verify':doc['name'],'currentDocument':{'updateTime':doc['updateTime']}})
 writes=[]
 for w in plan['proposedWrites']:
  if get(w['path']) is not None:raise SystemExit('Target authorization already exists; review required')
  writes.append({'update':{'name':project+'/documents/'+w['path'],'fields':{k:encode(v)for k,v in w['data'].items()}},'currentDocument':{'exists':False}})
 result={'ready':True,'mode':'apply'if args.apply else 'dry-run','families':plan['families'],'sourceChecks':len(checks),'authorizationCreates':len(writes),'retainedInaccessible':len(plan['retainedInaccessible']),'existingDataDeletes':0}
 if args.apply:
  body=json.dumps({'writes':checks+writes}).encode()
  with urllib.request.urlopen(urllib.request.Request('https://firestore.googleapis.com/v1/'+project+'/documents:commit',method='POST',headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},data=body),timeout=60)as r:response=json.load(r)
  result['commitTime']=response['commitTime']
 fd=os.open(args.report,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w')as f:json.dump(result,f,ensure_ascii=False,indent=2)
 print(json.dumps(result))
if __name__=='__main__':main()
