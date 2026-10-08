"""Isolated REST authorization regression. Never connects to production."""
import base64,json,time,urllib.request,urllib.error
BASE='http://127.0.0.1:8787/v1/projects/demo-hannun-db/databases/(default)/documents/'
def token(uid):
 def enc(d):return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
 return enc({'alg':'none','typ':'JWT'})+'.'+enc({'sub':uid,'user_id':uid,'aud':'demo-hannun-db','iss':'https://securetoken.google.com/demo-hannun-db','iat':int(time.time()),'exp':int(time.time())+3600,'firebase':{'sign_in_provider':'custom'}})+'.'
def typed(v):
 if isinstance(v,bool):return {'booleanValue':v}
 if isinstance(v,int):return {'integerValue':str(v)}
 if isinstance(v,str):return {'stringValue':v}
 if isinstance(v,list):return {'arrayValue':{'values':[typed(x) for x in v]}}
 return {'mapValue':{'fields':{k:typed(x) for k,x in v.items()}}}
def req(path,uid='owner',data=None):
 headers={'Content-Type':'application/json'}
 if uid:headers['Authorization']='Bearer '+('owner' if uid=='owner' else token(uid))
 r=urllib.request.Request(BASE+path,headers=headers,method='PATCH' if data is not None else 'GET',data=json.dumps({'fields':{k:typed(v)for k,v in data.items()}}).encode()if data is not None else None)
 try:
  with urllib.request.urlopen(r)as response:return response.status
 except urllib.error.HTTPError as e:return e.code
count=0
def check(label,path,uid,data=None,allowed=True):
 global count
 status=req(path,uid,data);assert (status==200 if allowed else status==403),(label,status);count+=1
for uid,role,key in [('mom','MOM',''),('dad','DAD',''),('kid','CHILD','c1'),('outsider','MOM',''),('deleted','DAD','')]:
 hid='other'if uid=='outsider'else 'f1'
 req('accounts/'+uid,data=dict(v=1,displayName=uid,role=role,householdId=hid,memberId=uid,createdAt=1,updatedAt=1))
 member=dict(v=1,role=role,label=uid,uid=uid,order=1,createdAt=1,updatedAt=1)
 if key:member['childKey']=key
 if uid=='deleted':member['deletedAt']=2
 req('families/'+hid+'/members/'+uid,data=member)
for key in ['c1','c2']:
 req('families/f1/childLinks/'+key,data=dict(v=1,familyCode='ABC123',displayName=key,order=1,addedAt=1))
s=dict(v=1,sourceType='MANUAL',title='test',category='ETC',scope='CHILD',childKeys=['c1'],dateKind='FIXED',allDay=True,eventDate='2026-10-08',createdAt=1,updatedAt=1)
t=dict(v=1,childKey='c1',ownerKey='CHILD:c1',title='test',done=False,order=1,createdAt=1,updatedAt=1)
for kind,doc in [('schedules',s),('todos',t)]:
 path='families/f1/'+kind+'/test'
 check(kind+' parent create',path,'mom',doc)
 for uid in ['mom','dad','kid']:check(kind+' member read',path,uid)
 for uid in [None,'outsider','deleted']:check(kind+' unauthorized read',path,uid,allowed=False)
 check(kind+' child own edit',path,'kid',dict(doc,title='edited'))
 check(kind+' parent joint edit',path,'dad',dict(doc,title='parent edited'))
 other=dict(doc,childKeys=['c2'])if kind=='schedules'else dict(doc,ownerKey='CHILD:c2',childKey='c2')
 check(kind+' child other create','families/f1/'+kind+'/other','kid',other,False)
 check(kind+' child ownership reassignment',path,'kid',other,False)
 check(kind+' outsider edit',path,'outsider',doc,False)
 check(kind+' immutable createdAt',path,'mom',dict(doc,createdAt=99),False)
 check(kind+' legacy writes','households/f1/'+kind+'/test','mom',doc,False)
account=dict(v=1,displayName='kid',role='MOM',householdId='f1',memberId='kid',createdAt=1,updatedAt=1)
check('child account self promotion','accounts/kid','kid',account,False)
check('child family schedule','families/f1/schedules/family','kid',dict(s,scope='FAMILY',childKeys=[]),False)
for kind in ['schedules','todos']:
 for uid in ['mom','kid']:check(kind+' member list','families/f1/'+kind,uid)
 check(kind+' outsider list','families/f1/'+kind,'outsider',allowed=False)
member=dict(v=1,role='MOM',label='kid',uid='kid',childKey='c1',order=1,createdAt=1,updatedAt=1)
check('child member role escalation','families/f1/members/kid','kid',member,False)
check('child member link reassignment','families/f1/members/kid','kid',dict(member,role='CHILD',childKey='c2'),False)
req('families/f1/childLinks/c1',data=dict(v=1,familyCode='ABC123',displayName='c1',order=1,addedAt=1,removedAt=2))
check('removed child schedule edit','families/f1/schedules/test','kid',s,False)
check('removed child todo edit','families/f1/todos/test','kid',t,False)
# Fresh signup then invite claim: the account binds only after its member UID exists.
newaccount=dict(v=1,displayName='newdad',role='DAD',createdAt=1,updatedAt=1)
check('signup self account','accounts/newdad','newdad',newaccount)
check('signup no family schedule access','families/f1/schedules/test','newdad',allowed=False)
check('new family create','families/newfamily','newdad',dict(v=1,name='new',createdAt=1,updatedAt=1))
check('new family invite create','familyInviteCodes/NEWCODE1','newdad',dict(householdId='newfamily',active=True,createdAt=1))
req('familyInviteCodes/JOIN1234',data=dict(householdId='f1',active=True,createdAt=1))
check('invite lookup','familyInviteCodes/JOIN1234','newdad')
claim=dict(v=1,role='DAD',label='dad',order=2,createdAt=1,updatedAt=1)
req('families/f1/members/invited',data=claim)
check('invite claim own uid','families/f1/members/invited','newdad',dict(claim,uid='newdad'))
check('invite account bind','accounts/newdad','newdad',dict(newaccount,householdId='f1',householdCode='JOIN1234',memberId='invited'))
check('invite joined read','families/f1/schedules/test','newdad')
check('claimed member takeover denied','families/f1/members/invited','outsider',dict(claim,uid='outsider'),False)
print('Authorization checks passed:',count)
