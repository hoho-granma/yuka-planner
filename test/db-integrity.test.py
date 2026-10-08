import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('audit',Path(__file__).resolve().parents[1]/'tools/db-integrity.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
def fields(d):
 def encode(v):
  if isinstance(v,list):return {'arrayValue':{'values':[encode(x)for x in v]}}
  if isinstance(v,bool):return {'booleanValue':v}
  return {'stringValue':v}
 return {k:encode(v)for k,v in d.items()}
class IntegrityTests(unittest.TestCase):
 def base(self):return {'households/h1':{},'families/KID123':{'profile':{'mapValue':{'fields':{}}}},'households/h1/children/c1':fields({'familyCode':'KID123'}),'households/h1/members/m1':fields({'uid':'u1','role':'MOM'})}
 def test_valid_modern_and_legacy_child_references(self):
  s=self.base();s['households/h1/schedules/s1']=fields({'childKeys':['c1','KID123'],'assigneeMemberId':'m1'});s['households/h1/todos/t1']=fields({'ownerKey':'CHILD:c1'});self.assertEqual(mod.audit(s,{'u1':{'householdId':'h1','memberId':'m1'}})['issues'],[])
 def test_missing_profile_is_reported_without_deleting_link(self):
  s=self.base();del s['families/KID123'];original=dict(s);self.assertEqual(mod.audit(s)['issues'][0]['kind'],'child-profile-missing');self.assertEqual(s,original)
 def test_other_family_child_is_invalid(self):
  s=self.base();s['households/h1/schedules/s1']=fields({'childKeys':['OTHER1']});self.assertEqual(mod.audit(s)['issues'][0]['kind'],'schedule-child-missing')
 def test_account_uid_mismatch(self):self.assertEqual(mod.audit(self.base(),{'u2':{'householdId':'h1','memberId':'m1'}})['issues'][0]['kind'],'account-member-mismatch')
 def test_unbound_child_account(self):
  s=self.base();s['households/h1/members/m2']=fields({'uid':'child1','role':'CHILD'});self.assertIn('child-account-unbound',[x['kind']for x in mod.audit(s)['issues']])
if __name__=='__main__':unittest.main()
