#!/usr/bin/env python3
"""Apply only the three reviewed family TTL fields. Dry-run by default; never deploy rules or delete indexes elsewhere."""
import argparse,json,subprocess,urllib.request,os,datetime
from pathlib import Path

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');args=parser.parse_args()
 config=json.loads((Path(__file__).parent.parent/'security/firestore.retention.json').read_text())
 approved={('familyRateLimits','expiresAt'),('privateFamilyInvites','purgeAt'),('familyJoinRequests','purgeAt')}
 fields=config['fieldOverrides'];assert {(f['collectionGroup'],f['fieldPath'])for f in fields}==approved
 assert all(f['ttl'] is True and f['indexes']==[] for f in fields)
 cli=Path(subprocess.check_output(['mise','which','firebase'],text=True).strip()).resolve()
 auth=str(cli.parent.parent/'auth.js')
 script="const a=require(process.argv[1]);const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[2]));a.getAccessToken(c.tokens.refresh_token,c.tokens.scopes).then(t=>process.stdout.write(t.access_token)).catch(()=>process.exit(1));"
 token=subprocess.check_output(['node','-e',script,auth,str(Path.home()/'.config/configstore/firebase-tools.json')],text=True)
 def request(url,body=None):
  r=urllib.request.Request(url,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method='PATCH'if body else 'GET',data=json.dumps(body).encode()if body else None)
  with urllib.request.urlopen(r,timeout=30)as res:return json.load(res)
 backup=Path(__file__).parent.parent/'.local-backups/firestore'/('retention-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
 result=[]
 for f in fields:
  name='projects/yuka-planner/databases/(default)/collectionGroups/'+f['collectionGroup']+'/fields/'+f['fieldPath'];url='https://firestore.googleapis.com/v1/'+name
  before=request(url);item={'collection':f['collectionGroup'],'field':f['fieldPath'],'state':before.get('ttlConfig',{}).get('state'),'indexed':bool(before.get('indexConfig',{}).get('indexes'))}
  if args.apply and (item['state']!='ACTIVE' or item['indexed']):
   backup.mkdir(parents=True,exist_ok=True);os.chmod(backup,0o700)
   path=backup/(f['collectionGroup']+'.json');path.write_text(json.dumps(before));os.chmod(path,0o600)
   op=request(url+'?updateMask=ttlConfig,indexConfig',{'name':name,'ttlConfig':{},'indexConfig':{'indexes':[]}})
   item['operation']=op.get('name');item['done']=op.get('done',False)
  result.append(item)
 print(json.dumps({'mode':'apply'if args.apply else 'dry-run','fields':result},ensure_ascii=False))
if __name__=='__main__':main()
