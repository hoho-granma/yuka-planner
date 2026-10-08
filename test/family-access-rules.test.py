"""Authorization on isolated emulator only. Never contacts production."""
import os,base64,json,time,urllib.request,urllib.error
from pathlib import Path
PROJECT='demo-hannun-access'
FIRESTORE_PORT=int(os.environ.get('FAMILY_TEST_FIRESTORE_PORT','8788'))
assert FIRESTORE_PORT in [8788,8888]
BASE=f'http://127.0.0.1:{FIRESTORE_PORT}/v1/projects/{PROJECT}/databases/(default)/documents/'
def token(uid):
 def enc(d):return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
 return enc({'alg':'none','typ':'JWT'})+'.'+enc({'sub':uid,'user_id':uid,'aud':PROJECT,'iss':'https://securetoken.google.com/'+PROJECT,'iat':int(time.time()),'exp':int(time.time())+3600,'firebase':{'sign_in_provider':'custom'}})+'.'
def typed(v):
 if v is None:return {'nullValue':None}
 if isinstance(v,bool):return {'booleanValue':v}
 if isinstance(v,int):return {'integerValue':str(v)}
 if isinstance(v,str):return {'stringValue':v}
 if isinstance(v,list):return {'arrayValue':{'values':[typed(x)for x in v]}}
 return {'mapValue':{'fields':{k:typed(x)for k,x in v.items()}}}
def req(path,uid='owner',data=None,delete=False):
 headers={'Content-Type':'application/json'}
 if uid:headers['Authorization']='Bearer '+('owner'if uid=='owner'else token(uid))
 r=urllib.request.Request(BASE+path,headers=headers,method='DELETE'if delete else 'PATCH'if data is not None else 'GET',data=json.dumps({'fields':{k:typed(v)for k,v in data.items()}}).encode()if data is not None else None)
 try:
  with urllib.request.urlopen(r)as response:return response.status
 except urllib.error.HTTPError as e:return e.code
# Load exactly the candidate rules under test, avoiding stale emulator configuration.
rules=Path('security/firestore.approval.rules').read_text()
load=urllib.request.Request(f'http://127.0.0.1:{FIRESTORE_PORT}/emulator/v1/projects/'+PROJECT+':securityRules',method='PUT',headers={'Content-Type':'application/json'},data=json.dumps({'rules':{'files':[{'name':'firestore.rules','content':rules}]}}).encode())
with urllib.request.urlopen(load) as response: assert response.status==200
count=0
def check(label,path,uid,data=None,allowed=True,delete=False):
 global count
 status=req(path,uid,data,delete);assert (status in [200,204]if allowed else status==403),(label,status);count+=1
for uid,permission,role,status,hid in [('mom','ADMIN','MOM','ACTIVE','f1'),('dad','MEMBER','DAD','ACTIVE','f1'),('kid','MEMBER','CHILD','ACTIVE','f1'),('viewer','VIEWER','OTHER','ACTIVE','f1'),('removed','MEMBER','DAD','REVOKED','f1'),('outsider','ADMIN','MOM','ACTIVE','f2')]:
 req(f'familyAccess/{hid}/members/{uid}',data=dict(status=status,permission=permission,role=role,memberId=uid,childKey='ABC123'))
 req('accounts/'+uid,data=dict(v=1,displayName=uid,role=role,householdId=hid,memberId=uid,createdAt=1,updatedAt=1))
 req(f'families/{hid}/members/{uid}',data=dict(v=1,uid=uid,role=role,label=uid,order=1,createdAt=1,updatedAt=1))
req('families/f1',data=dict(v=1,createdAt=1,updatedAt=1))
req('families/f1/childLinks/ABC123',data=dict(v=1,familyCode='ABC123',displayName='은찬',order=1,addedAt=1))
req('childAccess/ABC123',data=dict(householdId='f1',childKey='ABC123'))
req('children/ABC123',data=dict(profile={'name':'은찬'},completed={},updatedAt=1))
s=dict(v=1,sourceType='MANUAL',title='test',category='ETC',scope='CHILD',childKeys=['ABC123'],dateKind='FIXED',allDay=True,eventDate='2026-10-08',createdAt=1,updatedAt=1)
t=dict(v=1,childKey='ABC123',ownerKey='CHILD:ABC123',title='test',done=False,order=1,createdAt=1,updatedAt=1)
r=dict(schemaVersion=1,childKey='ABC123',activityId='art',group='academy',activity='미술',recordDate='2026-10-08',title='그림',text='완성',attachment=None,createdByUid='mom',updatedByUid='mom',createdAt=1,updatedAt=1,revision=1)
for kind,doc in [('schedules',s),('todos',t),('growthRecords',r)]:req('families/f1/'+kind+'/test',data=doc)
for uid in [None,'pending','outsider','removed']:
 for p in ['families/f1','families/f1/members','families/f1/childLinks','children/ABC123','families/f1/schedules','families/f1/todos','families/f1/growthRecords']:
  check('no access despite known path',p,uid,allowed=False)
for uid in ['mom','dad','kid','viewer']:
 for p in ['families/f1','families/f1/members','families/f1/childLinks','children/ABC123','families/f1/schedules','families/f1/todos','families/f1/growthRecords']:
  check('approved reads',p,uid)
for uid in ['mom','dad','pending','outsider']:
 check('cannot grant self membership',f'familyAccess/f1/members/{uid}',uid,dict(status='ACTIVE',permission='ADMIN'),False)
 check('cannot claim empty slot','families/f1/members/empty',uid,dict(v=1,uid=uid,role='DAD',label='dad',order=2,createdAt=1,updatedAt=1),False)
 check('cannot change account binding','accounts/'+uid,uid,dict(v=1,displayName=uid,role='MOM',householdId='forged',memberId='mom',createdAt=1,updatedAt=1),False)
for p in ['familyInviteCodes/ABCD1234','familyCodes/ABC123','householdCodes/ABCD1234','privateFamilyInvites/secret','familyJoinRequests/pending','childAccess/ABC123']:
 if not p.startswith('childAccess/'):req(p,data={'householdId':'f1','active':True})
 check('no raw code/index lookup',p,'mom',allowed=False)
 check('no raw code/index write',p,'mom',{'householdId':'f2','active':True},False)
for p in ['households/f1','households/f1/members/mom','families/ABC123','families/ABC123/children/test','families/ABC123/todos/test']:
 req(p,data={'profile':{'name':'legacy'}});check('legacy access blocked',p,'mom',allowed=False)
check('adult schedule create','families/f1/schedules/new','dad',s)
check('child own schedule edit','families/f1/schedules/new','kid',dict(s,title='edited'))
check('child family schedule denied','families/f1/schedules/family','kid',dict(s,scope='FAMILY',childKeys=[]),False)
check('viewer cannot edit schedule','families/f1/schedules/new','viewer',s,False)
check('viewer cannot edit growth','families/f1/growthRecords/test','viewer',dict(r,updatedByUid='viewer',revision=2),False)
check('parent profile edit','children/ABC123','dad',dict(profile={'name':'은찬'},completed={'x':True},updatedAt=2))
check('profile deletion not any family member','children/ABC123','outsider',allowed=False,delete=True)
check('raw child link takeover','families/f1/childLinks/ABC123','dad',dict(v=1,familyCode='OTHER1',displayName='x',order=1,addedAt=1),False)
check('linked role elevation','families/f1/members/kid','kid',dict(v=1,uid='kid',role='MOM',label='kid',order=1,createdAt=1,updatedAt=1),False)
# Version 2 evidence extensions keep the same family/child authorization boundary.
r2=dict(r,schemaVersion=2,experienceId='exp1',experienceStatus='occurred',occurredDate='2026-10-08',datePrecision='day',feedbackAt=None,institutionRef=None,activitySnapshot={'label':'미술'},occurrenceRef=None,relationshipStatus='confirmed',evidenceEntries=[{'evidenceId':'e1','evidenceVersion':1,'original':'그림 완성'}])
req('families/f1/growthRecords/v2',delete=True)
check('v2 adult creation','families/f1/growthRecords/v2','mom',r2)
check('v2 adult revision','families/f1/growthRecords/v2','dad',dict(r2,updatedByUid='dad',revision=2))
r20=dict(r2,evidenceEntries=[{'evidenceId':'e'+str(i),'evidenceVersion':1}for i in range(20)])
req('families/f1/growthRecords/v2-full',delete=True)
check('v2 full evidence creation','families/f1/growthRecords/v2-full','mom',r20)
check('v2 full evidence revision','families/f1/growthRecords/v2-full','dad',dict(r20,updatedByUid='dad',revision=2))
for uid in [None,'pending','outsider','viewer','removed']:
 check('v2 unauthorized write','families/f1/growthRecords/v2-denied',uid,r2,False)
for extra in [dict(evidenceEntries=['invalid']),dict(evidenceEntries=[{'evidenceId':'x','evidenceVersion':1}]*21),dict(experienceStatus='invented'),dict(institutionRef='invalid'),dict(extraPrivateField='unexpected')]:
 check('v2 malformed evidence','families/f1/growthRecords/v2-invalid','mom',dict(r2,**extra),False)
check('v1 cannot smuggle v2 fields','families/f1/growthRecords/v1-invalid','mom',dict(r2,schemaVersion=1),False)
check('v2 cannot downgrade','families/f1/growthRecords/v2','dad',dict(r,updatedByUid='dad',revision=3),False)
# Revocation affects authorization immediately even when account pointers are retained.
req('familyAccess/f1/members/dad',data=dict(status='REVOKED',permission='MEMBER',role='DAD',memberId='dad'))
check('revoked read denied','families/f1/schedules/new','dad',allowed=False)
check('revoked write denied','families/f1/schedules/new','dad',s,False)
req('families/f1/childLinks/ABC123',data=dict(v=1,familyCode='ABC123',displayName='은찬',order=1,addedAt=1,removedAt=2))
check('removed child read denied','children/ABC123','mom',allowed=False)
check('removed child edit denied','families/f1/schedules/new','kid',s,False)
print('Family approval authorization checks passed:',count)
