"""Run only against the isolated demo-hannun-shared Firestore emulator."""
import base64,json,time,urllib.request,urllib.error
BASE='http://127.0.0.1:8787/v1/projects/demo-hannun-shared/databases/(default)/documents/'
def token(uid):
 def enc(v):return base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
 return enc({'alg':'none','typ':'JWT'})+'.'+enc({'sub':uid,'user_id':uid,'aud':'demo-hannun-shared','iss':'https://securetoken.google.com/demo-hannun-shared','iat':int(time.time()),'exp':int(time.time())+3600,'firebase':{'sign_in_provider':'custom'}})+'.'
def typed(v):
 if v is None:return {'nullValue':None}
 if isinstance(v,int):return {'integerValue':str(v)}
 return {'stringValue':v}
def req(path,uid,data=None):
 headers={'Content-Type':'application/json'}
 if uid:headers['Authorization']='Bearer '+('owner' if uid=='owner' else token(uid))
 r=urllib.request.Request(BASE+path,headers=headers,method='PATCH' if data is not None else 'GET',data=json.dumps({'fields':{k:typed(v) for k,v in data.items()}}).encode() if data is not None else None)
 try:
  with urllib.request.urlopen(r) as response:return response.status
 except urllib.error.HTTPError as e:return e.code
for uid,role,permission,status in [('mom','MOM','ADMIN','ACTIVE'),('dad','DAD','MEMBER','ACTIVE'),('kid','CHILD','MEMBER','ACTIVE'),('viewer','OTHER','VIEWER','ACTIVE'),('pending','MOM','MEMBER','PENDING')]:
 assert req('familyAccess/f1/members/'+uid,'owner',dict(status=status,role=role,permission=permission,memberId=uid))==200
count=0
def check(label,path,uid,data=None,allowed=True):
 global count
 status=req(path,uid,data);assert status==(200 if allowed else 403),(label,status);count+=1
message=dict(title='공유 안내',message='가족이 함께 확인',imagePath=None,thumbPath=None,createdAt=1,createdByUid='mom')
path='families/f1/sharedFiles/message'
check('adult message create',path,'mom',message)
for uid in ['mom','dad','kid','viewer']:check('active family read',path,uid)
for uid in ['pending','outsider',None]:check('unauthorized read',path,uid,allowed=False)
check('adult title update',path,'dad',dict(message,title='변경',updatedAt=2))
check('immutable creator',path,'dad',dict(message,createdByUid='dad'),False)
check('immutable registration date',path,'mom',dict(message,createdAt=5),False)
for uid in ['kid','viewer','pending','outsider']:
 check('non-adult writer','families/f1/sharedFiles/'+uid,uid,dict(message,createdByUid=uid),False)
check('spoof creator','families/f1/sharedFiles/spoof','dad',message,False)
check('cross family','families/other/sharedFiles/test','mom',message,False)
check('empty message','families/f1/sharedFiles/empty','mom',dict(message,message=''),False)
photo=dict(message,message='',imagePath='families/f1/sharedFiles/photo/image.jpg',thumbPath='families/f1/sharedFiles/photo/thumb.jpg')
check('photo create','families/f1/sharedFiles/photo','mom',photo)
check('unsafe photo path','families/f1/sharedFiles/unsafe','mom',dict(photo,imagePath='families/other/sharedFiles/photo/image.jpg'),False)
replacement=dict(photo,imagePath='families/f1/sharedFiles/photo/image_version-2.jpg',thumbPath='families/f1/sharedFiles/photo/thumb_version-2.jpg',updatedAt=3)
check('replace photo with unique filenames','families/f1/sharedFiles/photo','dad',replacement)
for uid in ['kid','viewer','pending','outsider']:
 check('non-adult cannot edit','families/f1/sharedFiles/photo',uid,dict(replacement,title='edited'),False)
 check('non-adult cannot soft delete','families/f1/sharedFiles/photo',uid,dict(replacement,deletedAt=4),False)
check('adult soft delete','families/f1/sharedFiles/photo','dad',dict(replacement,deletedAt=4))
check('cannot restore deleted file','families/f1/sharedFiles/photo','mom',replacement,False)
check('cannot edit deleted file','families/f1/sharedFiles/photo','mom',dict(replacement,deletedAt=4,title='changed'),False)
print('Shared file authorization: PASS',count)
