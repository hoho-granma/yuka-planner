"""기관별 연구 기록만 educationResearch에 저장. 기존 문서는 백업·동시변경 검사."""
import argparse, concurrent.futures, datetime, json, os, subprocess, urllib.error, urllib.request
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('--apply',action='store_true')
p.add_argument('--input',type=Path,help='이번 묶음만 포함한 입력 JSON')
p.add_argument('--new-only',action='store_true',help='이미 존재하는 기관 ID는 수정하지 않음')
p.add_argument('--skip-readback',action='store_true',help='저장 후 재조회 생략; commit 응답만 확인')
p.add_argument('--result',type=Path,help='저장 결과를 쓸 파일(기본: 조사 폴더의 firebase-save-result.json)')
args=p.parse_args()
root=Path(__file__).resolve().parent.parent
data=json.loads((args.input or root/'output/research-sua-english-20261011/firebase-import.json').read_text())
assert len({i['id']for i in data['items']})==len(data['items']),'duplicate institution ID'
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
 if v is None:return {'nullValue':None}
 if isinstance(v,bool):return {'booleanValue':v}
 if isinstance(v,str):return {'stringValue':v}
 if isinstance(v,list):return {'arrayValue':{'values':[value(x)for x in v]}}
 if isinstance(v,dict):return {'mapValue':{'fields':{k:value(x)for k,x in v.items()}}}
 raise ValueError('unexpected type')
def decode(v):
 if 'arrayValue' in v:return [decode(x)for x in v['arrayValue'].get('values',[])]
 if 'mapValue' in v:return {k:decode(x)for k,x in v['mapValue'].get('fields',{}).items()}
 if 'nullValue' in v:return None
 return next(iter(v.values()))
def same(fields,item):return all(k in fields and decode(fields[k])==v for k,v in item.items())
def fetch(item):return item,request('/educationResearch/'+item['id'])
with concurrent.futures.ThreadPoolExecutor(max_workers=8)as pool:before=list(pool.map(fetch,data['items']))
backup=root/'.local-backups/firestore'/('education-research-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'));backup.mkdir(parents=True,exist_ok=True)
f=backup/'before.json';f.write_text(json.dumps({i['id']:d for i,d in before},ensure_ascii=False));os.chmod(f,0o600)
writes=[]
for item,doc in before:
 if args.new_only and doc:continue
 fields={k:value(v)for k,v in item.items()}
 if doc and same(doc.get('fields',{}),item):continue
 writes.append({'update':{'name':base.replace('https://firestore.googleapis.com/v1/','')+'/educationResearch/'+item['id'],'fields':fields},'updateMask':{'fieldPaths':list(fields)},'currentDocument':{'updateTime':doc['updateTime']}if doc else {'exists':False}})
print(json.dumps({'records':len(before),'new':sum(d is None for _,d in before),'changed':len(writes),'apply':args.apply}))
if args.apply:
 for start in range(0,len(writes),40):
  chunk=writes[start:start+40];response=request(':commit','POST',{'writes':chunk})
  assert response and len(response.get('writeResults',[]))==len(chunk),'commit result mismatch'
 verified=False
 if not args.skip_readback:
  with concurrent.futures.ThreadPoolExecutor(max_workers=8)as pool:after=list(pool.map(fetch,data['items']))
  assert all(d and (args.new_only or same(d['fields'],i))for i,d in after),'readback mismatch'
  verified=True
  print('Firestore readback verified:',len(after))
 else:print('Firestore commit acknowledged:',len(writes),'(readback skipped)')
 written_names={w['update']['name'].rsplit('/',1)[-1]for w in writes}
 result={'collection':'educationResearch','inputRecords':len(before),'saved':len(writes),'skippedExisting':sum(d is not None for _,d in before)if args.new_only else 0,'newOnly':args.new_only,'verified':verified,'commitAcknowledged':True,'added':sum(bool(i.get('added'))for i in data['items']if i['id']in written_names),'savedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 (args.result or root/'output/research-sua-english-20261011/firebase-save-result.json').write_text(json.dumps(result,indent=2)+'\n')
