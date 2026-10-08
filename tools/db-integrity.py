#!/usr/bin/env python3
"""Read-only integrity audit of a migration snapshot. No DB mutations."""
import argparse,json,os
from pathlib import Path

def decode(value):
 if 'mapValue' in value:return {k:decode(v)for k,v in value['mapValue'].get('fields',{}).items()}
 if 'arrayValue' in value:return [decode(v)for v in value['arrayValue'].get('values',[])]
 if 'integerValue' in value:return int(value['integerValue'])
 if 'doubleValue' in value:return float(value['doubleValue'])
 return next(iter(value.values()),None)

def audit(snapshot,accounts=None):
 docs={p:{k:decode(v)for k,v in fields.items()}for p,fields in snapshot.items()};issues=[]
 def issue(kind,path,reference):issues.append({'kind':kind,'path':path,'reference':reference})
 families={p.split('/')[1]for p in docs if p.startswith('households/')and len(p.split('/'))==2}
 profiles={p.split('/')[1]for p in docs if p.startswith('families/')and len(p.split('/'))==2 and 'profile' in docs[p]}
 links={hid:{}for hid in families};members={hid:{}for hid in families}
 for p,d in docs.items():
  seg=p.split('/')
  if seg[0]=='householdCodes' and d.get('active') and d.get('householdId')not in families:issue('invite-family-missing',p,d.get('householdId'))
  if seg[0]!='households' or len(seg)!=4:continue
  hid,kind,key=seg[1:]
  if hid not in families:issue('family-root-missing',p,hid);continue
  if kind=='children' and not d.get('removedAt'):
   links[hid][key]=d
   if d.get('familyCode')not in profiles:issue('child-profile-missing',p,d.get('familyCode'))
  if kind=='members' and not d.get('deletedAt'):members[hid][key]=d
 for hid in families:
  codes=[d.get('familyCode')for d in links[hid].values()]
  if len(codes)!=len(set(codes)):issue('duplicate-active-child-link','households/'+hid,codes)
  uid_list=[d['uid']for d in members[hid].values()if d.get('uid')]
  if len(uid_list)!=len(set(uid_list)):issue('duplicate-member-uid','households/'+hid,'multiple active members for one uid')
 for p,d in docs.items():
  seg=p.split('/')
  if seg[0]!='households' or len(seg)!=4 or seg[1]not in families or d.get('deletedAt'):continue
  hid,kind,key=seg[1:];valid_children=set(links[hid])|{x['familyCode']for x in links[hid].values()}
  if kind=='schedules':
   for child in d.get('childKeys',[]):
    if child not in valid_children:issue('schedule-child-missing',p,child)
   if d.get('assigneeMemberId') and d['assigneeMemberId']not in members[hid]:issue('schedule-member-missing',p,d['assigneeMemberId'])
  if kind=='todos':
   owner=d.get('ownerKey','CHILD:'+d.get('childKey',''))
   if owner.startswith('CHILD:') and owner[6:]not in valid_children:issue('todo-child-missing',p,owner)
   if owner.startswith('MEMBER:') and owner[7:]not in members[hid]:issue('todo-member-missing',p,owner)
  if kind=='members' and d.get('role')=='CHILD' and d.get('uid') and d.get('childKey')not in links[hid]:issue('child-account-unbound',p,d.get('childKey'))
 if accounts is not None:
  for uid,d in accounts.items():
   hid,mid=d.get('householdId'),d.get('memberId')
   if not hid and not mid:continue
   if hid not in families:issue('account-family-missing','accounts/'+uid,hid);continue
   member=members[hid].get(mid)
   if not member or member.get('uid')!=uid:issue('account-member-mismatch','accounts/'+uid,mid)
 return {'sourceDocuments':len(docs),'families':len(families),'childProfiles':len(profiles),'activeChildLinks':sum(map(len,links.values())),'activeMembers':sum(map(len,members.values())),'accountsChecked':len(accounts)if accounts is not None else None,'issues':issues}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--snapshot',required=True);p.add_argument('--accounts');p.add_argument('--report',required=True);args=p.parse_args()
 result=audit(json.loads(Path(args.snapshot).read_text()),json.loads(Path(args.accounts).read_text())if args.accounts else None)
 fd=os.open(args.report,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w')as f:json.dump(result,f,ensure_ascii=False,indent=2)
 print(json.dumps({k:v for k,v in result.items()if k!='issues'},ensure_ascii=False));print('Issues:',len(result['issues']))
