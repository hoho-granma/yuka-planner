"""기관별 연구 기록만 educationResearch에 저장. 기존 문서는 백업·동시변경 검사."""
import argparse, concurrent.futures, datetime, json, os, subprocess, urllib.error, urllib.request
from pathlib import Path

p=argparse.ArgumentParser();p.add_argument('--apply',action='store_true');args=p.parse_args()
root=Path(__file__).resolve().parent.parent
data=json.loads((root/'output/research-sua-english-20261011/firebase-import.json').read_text())
cli=Path(subprocess.check_output(['mise','which','firebase'],text=True).strip()).resolve()
script="const a=require(process.argv[1]);const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[2]));a.getAccessToken(c.tokens.refresh_token,c.tokens.scopes).then(t=>process.stdout.write(t.access_token)).catch(()=>process.exit(1));"
token=subprocess.check_output(['node','-e',script,str(cli.parent.parent/'auth.js'),str(Path.home()/'.config/configstore/firebase-tools.json')],text=True)
base='https://firestore.googleapis.com/v1/projects/yuka-planner/databases/(default)/documents'
def request(path,method='GET',body=None):
 req=urllib.request.Request(base+path,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method=method,data=json.dumps(body).encode()if body is not None else None)
 try:
  with urllib.request.urlopen(req,timeout=45)as r:return json.load(r)
 except urllib.error.HTTPError as e:
  if e.code==404:return None
  raise RuntimeError(f'Firestore HTTP {e.code}') from None
def value(v):
 if isinstance(v,bool):return {'booleanValue':v}
 if isinstance(v,str):return {'stringValue':v}
 if isinstance(v,list):return {'arrayValue':{'values':[value(x)for x in v]}}
 raise ValueError('unexpected type')
def decode(v):
 if 'arrayValue' in v:return [decode(x)for x in v['arrayValue'].get('values',[])]
 return next(iter(v.values()))
def same(fields,item):return all(k in fields and decode(fields[k])==v for k,v in item.items())
def fetch(item):return item,request('/educationResearch/'+item['id'])
with concurrent.futures.ThreadPoolExecutor(max_workers=8)as pool:before=list(pool.map(fetch,data['items']))
backup=root/'.local-backups/firestore'/('education-research-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'));backup.mkdir(parents=True,exist_ok=True)
f=backup/'before.json';f.write_text(json.dumps({i['id']:d for i,d in before},ensure_ascii=False));os.chmod(f,0o600)
writes=[]
for item,doc in before:
 fields={k:value(v)for k,v in item.items()}
 if doc and same(doc.get('fields',{}),item):continue
 writes.append({'update':{'name':base.replace('https://firestore.googleapis.com/v1/','')+'/educationResearch/'+item['id'],'fields':fields},'updateMask':{'fieldPaths':list(fields)},'currentDocument':{'updateTime':doc['updateTime']}if doc else {'exists':False}})
print(json.dumps({'records':len(before),'new':sum(d is None for _,d in before),'changed':len(writes),'apply':args.apply}))
if args.apply:
 for start in range(0,len(writes),40):request(':commit','POST',{'writes':writes[start:start+40]})
 with concurrent.futures.ThreadPoolExecutor(max_workers=8)as pool:after=list(pool.map(fetch,data['items']))
 assert all(d and same(d['fields'],i)for i,d in after),'readback mismatch'
 print('Firestore readback verified:',len(after))
 (root/'output/research-sua-english-20261011/firebase-save-result.json').write_text(json.dumps({'collection':'educationResearch','saved':len(after),'verified':True,'added':sum(i['added']for i in data['items']),'savedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2)+'\n')
