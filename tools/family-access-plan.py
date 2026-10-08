#!/usr/bin/env python3
"""Offline, read-only migration planner. Explicit reviewed approvals only; no DB writes."""
import argparse,json,os
from pathlib import Path

def decode(v):
 if 'mapValue'in v:return {k:decode(x)for k,x in v['mapValue'].get('fields',{}).items()}
 if 'arrayValue'in v:return [decode(x)for x in v['arrayValue'].get('values',[])]
 if 'integerValue'in v:return int(v['integerValue'])
 return next(iter(v.values()),None)
def plan(snapshot,decisions):
 docs={p:{k:decode(v)for k,v in d.items()}for p,d in snapshot.items()};writes=[];blocked=[]
 families={p.split('/')[1]:d for p,d in docs.items()if p.startswith('families/')and len(p.split('/'))==2 and d.get('v')==1}
 child_owners={};accounts={p.split('/')[1]:d for p,d in docs.items()if p.startswith('accounts/')}
 for hid,f in families.items():
  decision=decisions.get(hid,{})
  admin=decision.get('adminUid');approved=decision.get('approvedUids',[])
  if not admin or admin not in approved:blocked.append({'family':hid,'reason':'reviewed administrator and approved members required'});continue
  active={p.split('/')[-1]:d for p,d in docs.items()if p.startswith('families/'+hid+'/members/')and d.get('uid')and not d.get('deletedAt')}
  for uid in approved:
   matches=[(mid,m)for mid,m in active.items()if m['uid']==uid];a=accounts.get(uid,{})
   if len(matches)!=1 or a.get('householdId')!=hid or a.get('memberId')!=matches[0][0]:
    blocked.append({'family':hid,'reason':'account/member identity mismatch','uid':uid});continue
   mid,m=matches[0]
   if uid==admin and m.get('role')=='CHILD':blocked.append({'family':hid,'reason':'child cannot be administrator'});continue
   access={'status':'ACTIVE','permission':'ADMIN'if uid==admin else 'MEMBER','role':m['role'],'memberId':mid,'migrationReviewed':True}
   if m.get('childKey'):access['childKey']=m['childKey']
   writes.append({'path':f'familyAccess/{hid}/members/{uid}','data':access,'sourcePath':f'families/{hid}/members/{mid}'})
  for p,link in docs.items():
   if not p.startswith(f'families/{hid}/childLinks/')or link.get('removedAt'):continue
   code=link.get('familyCode');key=p.split('/')[-1]
   if not code or 'children/'+code not in docs:blocked.append({'family':hid,'reason':'child profile missing'});continue
   if code in child_owners:blocked.append({'family':hid,'reason':'child linked to multiple families; review required'});continue
   child_owners[code]=hid
   writes.append({'path':'childAccess/'+code,'data':{'householdId':hid,'childKey':key,'migrationReviewed':True},'sourcePath':p})
 unclaimed=[p for p in docs if p.startswith('children/')and len(p.split('/'))==2 and p.split('/')[1]not in child_owners]
 policy=decisions.get('_testPolicy',{})
 retain=policy.get('allAccountsConfirmedTest')is True and policy.get('unclaimedChildren')=='retain-inaccessible'
 if unclaimed and not retain:blocked.append({'reason':'unclaimed child records require recovery or explicit archival decision','count':len(unclaimed)})
 # No partial activation: all existing account bindings need a reviewed decision.
 for uid,a in accounts.items():
  if a.get('householdId')and uid not in decisions.get(a['householdId'],{}).get('approvedUids',[]):
   blocked.append({'reason':'existing account requires approve/exclude decision','uid':uid})
 return {'ready':not blocked,'families':len(families),'proposedWrites':writes,'blocked':blocked,'retainedInaccessible':unclaimed if retain else [],'sourceMutation':False}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--snapshot',required=True);p.add_argument('--decisions');p.add_argument('--report',required=True);args=p.parse_args()
 result=plan(json.loads(Path(args.snapshot).read_text()),json.loads(Path(args.decisions).read_text())if args.decisions else {})
 fd=os.open(args.report,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w')as f:json.dump(result,f,ensure_ascii=False,indent=2)
 print(json.dumps({'ready':result['ready'],'families':result['families'],'proposedWrites':len(result['proposedWrites']),'blocked':len(result['blocked']),'sourceMutation':False}))
