const assert=require('node:assert/strict');
const V=require('../js/account-view');
const regions=[{code:'서울특별시',name:'서울특별시',districts:['구로구']}];
const html=V.renderSignup({unified:true,regions,form:{role:'MOM',situation:'HAS_CHILD',step:3,province:'서울특별시'},errors:{email:'이메일 확인'}});
for(const field of ['email','password','displayName','familyCode','province','district'])assert.equal((html.match(new RegExp('data-acct-input="'+field+'"','g'))||[]).length,1,field);
assert.match(html,/data-acct-radio="situation"/);assert.match(html,/data-acct-radio="role"/);assert.match(html,/이메일 확인/);assert.match(html,/data-acct-action="submit-signup"/);assert.doesNotMatch(html,/data-acct-action="next-step"|acct-prog/);
const join=V.renderSignup({unified:true,regions,form:{join:true,familyCode:'ABC123',fromLink:true,role:'DAD'},errors:{familyCode:'코드 확인'}});
assert.match(join,/ABC123/);assert.match(join,/코드 확인/);assert.match(join,/data-acct-radio="role"/);assert.doesNotMatch(join,/data-acct-input="province"/);
console.log('PASS: unified signup preserves account fields, validation errors and family invitation flow');
