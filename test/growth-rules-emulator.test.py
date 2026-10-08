import runpy
x=runpy.run_path('test/db-rules-emulator.test.py');check=x['check'];req=x['req']
r=dict(schemaVersion=1,childKey='c2',activityId='art',group='academy',activity='미술',recordDate='2026-10-08',title='그림',text='완성',attachment={'storagePath':'families/f1/growthRecords/art/image_'+'a'*64,'contentType':'image/png','size':100,'hash':'a'*64},createdByUid='mom',updatedByUid='mom',createdAt=1,updatedAt=1,revision=1)
p='families/f1/growthRecords/art'
check('growth adult create',p,'mom',r)
check('growth adult shared edit',p,'dad',dict(r,updatedByUid='dad',revision=2))
check('growth outsider read',p,'outsider',allowed=False)
check('growth no auth read',p,None,allowed=False)
check('growth child other edit',p,'kid',dict(r,updatedByUid='kid',revision=3),False)
check('growth stale revision',p,'mom',r,False)
check('growth unsafe attachment',p,'mom',dict(r,revision=3,attachment={**r['attachment'],'storagePath':'families/other/growthRecords/art/image_'+'a'*64}),False)
print('Growth authorization checks passed: 7')
