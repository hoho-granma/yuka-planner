"""Storage authorization checks against demo-only localhost emulators."""
import os,base64,json,time,urllib.request,urllib.error,urllib.parse
PROJECT='demo-hannun-access'
STORAGE_PORT=int(os.environ.get('FAMILY_TEST_STORAGE_PORT','9199'))
assert STORAGE_PORT in [9199,9299]
FIRESTORE_PORT=int(os.environ.get('FAMILY_TEST_FIRESTORE_PORT','8788'))
assert FIRESTORE_PORT in [8788,8888]
BASE=f'http://127.0.0.1:{FIRESTORE_PORT}/v1/projects/{PROJECT}/databases/(default)/documents/'
def token(uid):
 def enc(d):return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
 return enc({'alg':'none','typ':'JWT'})+'.'+enc({'sub':uid,'user_id':uid,'aud':PROJECT,'iss':'https://securetoken.google.com/'+PROJECT,'iat':int(time.time()),'exp':int(time.time())+3600,'firebase':{'sign_in_provider':'custom'}})+'.'
def seed(path,data):
 fields={k:({'integerValue':str(v)}if isinstance(v,int)else{'stringValue':v})for k,v in data.items()}
 r=urllib.request.Request(BASE+path,method='PATCH',headers={'Authorization':'Bearer owner','Content-Type':'application/json'},data=json.dumps({'fields':fields}).encode())
 with urllib.request.urlopen(r)as res:assert res.status==200
for uid,permission,status,hid,role in [('storage-mom','ADMIN','ACTIVE','sf1','MOM'),('storage-dad','MEMBER','ACTIVE','sf1','DAD'),('storage-kid','MEMBER','ACTIVE','sf1','CHILD'),('storage-viewer','VIEWER','ACTIVE','sf1','OTHER'),('storage-removed','MEMBER','REVOKED','sf1','DAD'),('storage-outsider','ADMIN','ACTIVE','sf2','MOM')]:
 seed(f'familyAccess/{hid}/members/{uid}',dict(status=status,permission=permission,role=role,memberId=uid,childKey='child1'))
seed('families/sf1/childLinks/child1',{'familyCode':'ABC123'})
count=0
bucket=PROJECT+'.appspot.com'
path='families/sf1/growthRecords/record'+str(time.time_ns())+'/image_'+'a'*64

def request(uid,path=path,method='GET',contentType='image/png',childKey='child1'):
 headers={}
 if uid:headers['Authorization']='Firebase '+token(uid)
 url=f'http://127.0.0.1:{STORAGE_PORT}/v0/b/'+bucket+'/o'
 if method=='POST':
  boundary='hannun-storage-test';headers['Content-Type']='multipart/related; boundary='+boundary;headers['X-Goog-Upload-Protocol']='multipart'
  meta=json.dumps({'name':path,'contentType':contentType,'metadata':{'childKey':childKey}})
  data=(f'--{boundary}\r\nContent-Type: application/json\r\n\r\n{meta}\r\n--{boundary}\r\nContent-Type: {contentType}\r\n\r\n').encode()+b'test image'+f'\r\n--{boundary}--\r\n'.encode()
  url+='?uploadType=multipart&name='+urllib.parse.quote(path,safe='')
 else:data=None;url+='/'+urllib.parse.quote(path,safe='')+'?alt=media'
 r=urllib.request.Request(url,method=method,headers=headers,data=data)
 try:
  with urllib.request.urlopen(r)as res:return res.status
 except urllib.error.HTTPError as e:
  return e.code

def check(label,uid,allowed,**kwargs):
 global count
 status=request(uid,**kwargs);assert (status==200 if allowed else status in [401,403]),(label,status);count+=1
check('admin create','storage-mom',True,method='POST')
for uid in [None,'storage-pending','storage-outsider','storage-removed']:check('unauthorized read',uid,False)
for uid in ['storage-mom','storage-dad','storage-kid','storage-viewer']:check('approved read',uid,True)
for i,uid in enumerate(['storage-dad','storage-kid']):check('approved upload',uid,True,method='POST',path=path[:-64]+str(i)*64)
for i,uid in enumerate([None,'storage-pending','storage-outsider','storage-removed','storage-viewer']):check('unauthorized upload',uid,False,method='POST',path=path[:-64]+str(i+2)*64)
check('child other child denied','storage-kid',False,method='POST',path=path[:-64]+'b'*64,childKey='other')
check('nonimage denied','storage-mom',False,method='POST',path=path[:-64]+'c'*64,contentType='text/plain')
check('immutable overwrite','storage-mom',False,method='POST')
check('immutable delete','storage-mom',False,method='DELETE')
seed('familyAccess/sf1/members/storage-dad',{'status':'REVOKED','permission':'MEMBER','role':'DAD','memberId':'storage-dad'})
check('revocation immediate','storage-dad',False)
seed('families/sf1/childLinks/child1',{'familyCode':'ABC123','removedAt':2})
check('removed child upload denied','storage-kid',False,method='POST',path=path[:-64]+'d'*64)
print('Storage approval authorization checks passed:',count)
