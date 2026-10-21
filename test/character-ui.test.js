const assert=require('node:assert/strict');
const UI=require('../js/character-ui');
const Todos=require('../js/child-todos');
assert.match(UI.avatar('CHILD','male'),/boy-1.webp$/);
assert.match(UI.avatar('CHILD','female'),/girl-1.webp$/);
assert.match(UI.avatar('CHILD',null),/neutral.svg$/);
assert.match(UI.familyAvatar([{gender:'male'},{gender:'female'}]),/four-lavender.webp$/);
assert.match(UI.familyAvatar([{gender:'male'},{gender:'male'}]),/neutral.svg$/);
assert.equal(UI.title('안녕하세요 학부모님\n피아노 교재 챙겨주세요\n내일 수업'), '피아노 교재 챙겨주세요');
assert.equal(UI.title('리드101'),'리드101');
const members=[{key:'CHILD:c'},{key:'MEMBER:m'},{key:'FAMILY'}];
const rows=[{id:'late',childKey:'c',dueDate:'2026-10-10',order:1},{id:'soon',childKey:'c',dueDate:'2026-10-08',order:2},{id:'none',childKey:'c',order:0},{id:'old',childKey:'c',dueDate:'2026-10-06',order:3},{id:'done',childKey:'c',dueDate:'2026-10-08',done:true,order:4},{id:'adult',childKey:'MEMBER:m',ownerKey:'MEMBER:m',dueDate:'2026-10-07',order:5}];
assert.deepEqual(UI.list(rows,members,'2026-10-07',true).map(t=>t.id),['soon','late','none','adult']);
assert.deepEqual(UI.list(rows,members,'2026-10-07',false).map(t=>t.id),['old','soon','done','late','none','adult']);
assert.deepEqual(UI.deadline('2026-10-08','2026-10-07'),{text:'~10/8',tomorrow:true});
assert.equal(UI.deadline('2027-01-01','2026-12-31').tomorrow,true);
const old=Todos.buildCreate({childKey:'c',title:'교재',list:[]},1).doc;
assert.equal(Todos.validate(old).ok,true);
assert.equal(Todos.validate({...old,ownerKey:'MEMBER:m',dueDate:'2026-10-10',category:'회사',description:'원문'}).ok,true);
for(const patch of [{ownerKey:'bad'},{dueDate:'tomorrow'},{description:'x'.repeat(501)},{other:'bad'}])assert.equal(Todos.validate({...old,...patch}).ok,false);
console.log('PASS: character assets, summary, family sorting, deadlines, legacy/extended task schema');

assert.match(UI.avatar('CHILD','F'),/girl-1.webp$/);
assert.match(UI.avatar('CHILD','M'),/boy-1.webp$/);
assert.match(UI.familyAvatar([{gender:'F'}]),/family-girl-lavender.webp$/);
assert.match(UI.familyAvatar([{gender:'F'},{gender:'M'}]),/family-four-lavender.webp$/);
const durationAssert = require('node:assert/strict');
durationAssert.equal(UI.duration('10:30','12:00',false),'1시간 30분');
durationAssert.equal(UI.duration('10:00','11:00',false),'1시간');
durationAssert.equal(UI.duration('10:00','10:30',false),'30분');
durationAssert.equal(UI.duration('10:30','',false),'');
durationAssert.equal(UI.duration('10:30','12:00',true),'');
durationAssert.equal(UI.duration('12:00','10:30',false),'');

for(const [role,gender,group] of [['MOM',null,'mom'],['DAD',null,'dad'],['CHILD','female','girl'],['CHILD','male','boy']]){
 const choices=UI.avatarOptions(role,gender);assert.equal(choices.length,3);
 assert.equal(UI.avatarChoice({role,gender}).id,group+'-1');
 for(let i=1;i<=3;i++)assert.equal(UI.avatar(role,gender,group+'-'+i),`icons/family/${group}-${i}.webp`);
 assert.equal(UI.avatarChoice({role,gender,avatarId:'invalid'}).id,group+'-1');
}
assert.notEqual(UI.tint({role:'CHILD',gender:'female',avatarId:'girl-1'}),UI.tint({role:'CHILD',gender:'female',avatarId:'girl-2'}));
assert.equal(UI.avatar('CHILD','male','girl-2'),'icons/family/boy-1.webp');
assert.equal(UI.avatar('CHILD',null,'girl-3'),'icons/family/girl-3.webp');
