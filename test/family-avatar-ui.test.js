'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const UI=require('../js/character-ui'),View=require('../js/account-view');
const app=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
function harness(save){
 const person={key:'CHILD:c1',role:'CHILD',gender:'female'},calls=[];
 const ctx={CharacterUI:UI,hh:{hid:'f1'},acct:{user:{uid:'u1'}},charPerson:()=>person,HouseholdSync:{setAvatar:save||(async(hid,d)=>{person.avatarId=d.avatarId;return {ok:true}})}};
 for(const name of ['famRender','renderAll','charHeader','acctRenderSlot','widgetSchedule','acctNoticeToast'])ctx[name]=(...args)=>calls.push([name,...args]);
 vm.createContext(ctx);vm.runInContext('let charAvatarBusy=false;'+app.slice(app.indexOf('  async function charSaveAvatar(button)'),app.indexOf("  document.addEventListener('click',ev=>{const button=ev.target.closest?.('[data-avatar-id]')")),ctx);
 return {ctx,person,calls,button:{dataset:{avatarKind:'child',avatarPerson:'c1',avatarId:'girl-3'}}};
}
test('profile shows three accessible options and the selected image without a frame',()=>{
 const html=View.renderFamCard({kind:'child',name:'아이',photo:UI.avatar('CHILD','female'),avatarOptions:UI.avatarOptions('CHILD','female'),avatarId:'girl-1',avatarKind:'child',avatarPerson:'c1'});
 assert.equal((html.match(/data-avatar-id=/g)||[]).length,3);assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);
 assert.match(html,/여아 1 · 선택됨/);assert.match(html,/fam-photo hn-face hn-avatar/);
 assert(!html.includes('undefined'));
});
test('successful selection refreshes home, calendar, profile and widget using the selected identity',async()=>{
 const f=harness();await f.ctx.charSaveAvatar(f.button);
 assert.equal(f.person.avatarId,'girl-3');assert.equal(UI.avatarChoice(f.person).color,'#a6d9cf');
 for(const method of ['renderAll','charHeader','acctRenderSlot','widgetSchedule'])assert(f.calls.some(c=>c[0]===method));
 assert(f.calls.some(c=>c[0]==='acctNoticeToast'&&c[1].includes('저장했어요')));
});
test('save failure leaves the previous icon and account changes suppress old completion UI',async()=>{
 const f=harness(async()=>{throw Error('offline')});await f.ctx.charSaveAvatar(f.button);
 assert.equal(f.person.avatarId,undefined);assert(!f.calls.some(c=>c[0]==='renderAll'));assert(f.calls.some(c=>c[1]?.includes('저장하지 못했어요')));
 let finish;const pending=new Promise(r=>finish=r),g=harness(()=>pending);const task=g.ctx.charSaveAvatar(g.button);g.ctx.hh.hid='f2';finish({ok:true});await task;
 assert(!g.calls.some(c=>['renderAll','acctNoticeToast','widgetSchedule'].includes(c[0])));
});
test('double taps are ignored while saving; incompatible variants cannot be sent',async()=>{
 let resolve,n=0;const f=harness(()=>{n++;return new Promise(r=>resolve=r)});const task=f.ctx.charSaveAvatar(f.button);await f.ctx.charSaveAvatar(f.button);assert.equal(n,1);resolve({ok:true});await task;
 f.button.dataset.avatarId='boy-2';await f.ctx.charSaveAvatar(f.button);assert.equal(n,1);
});
test('edit forms offer three role-specific choices with draft selection and save guidance',()=>{
 const HV=require('../js/household-view');
 for(const [role,gender,id] of [['MOM',null,'mom-2'],['DAD',null,'dad-3'],['CHILD','male','boy-2'],['CHILD','female','girl-3']]){
   const options=UI.avatarOptions(role,gender),html=View.renderAvatarEdit(options,id,'data-mem-avatar',false);
   assert.equal(options.length,3);assert.equal((html.match(/data-mem-avatar=/g)||[]).length,3);
   assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);assert.match(html,/저장을 누르면/);
   if(role!=='CHILD')assert.match(HV.renderMembers({enabled:true,hasHousehold:true,bare:true,acctMode:true,members:[],view:'form',form:{role,label:'이름',avatarHtml:html}}),/data-mem-avatar/);
 }
});
test('editing an icon is staged, rejects wrong roles, and cancel does not save',async()=>{
 const calls=[],ctx={CharacterUI:UI,AccountView:View,HouseholdView:require('../js/household-view'),mem:{view:'form',form:{memberId:'m1',role:'MOM',label:'엄마',avatarId:'mom-1'}},memReadLabel:()=> '입력 중인 이름',memRender:()=>{},usMembers:()=>[],acctRenderSlot:()=>{},usRefreshCalendar:()=>{},console};
 vm.createContext(ctx);
 vm.runInContext(app.match(/  function charMemberAvatarForm\(\)[\s\S]*?\n  \}/)[0]+'\n'+app.match(/  async function memOnClick\(ev\)[\s\S]*?\n  \}/)[0],ctx);
 const event=(selector,value)=>({stopPropagation(){},target:{closest:s=>s===selector?{getAttribute:()=>value}:null}});
 await ctx.memOnClick(event('[data-mem-avatar]','mom-3'));
 assert.equal(ctx.mem.form.avatarId,'mom-3');assert.equal(ctx.mem.form.label,'입력 중인 이름');
 assert.match(ctx.charMemberAvatarForm().avatarHtml,/엄마 3 · 선택됨/);
 await ctx.memOnClick(event('[data-mem-avatar]','dad-2'));assert.equal(ctx.mem.form.avatarId,'mom-3');
 await ctx.memOnClick(event('[data-mem-role]','DAD'));assert.equal(ctx.mem.form.avatarId,'dad-1');assert.match(ctx.charMemberAvatarForm().avatarHtml,/아빠 1 · 선택됨/);
 await ctx.memOnClick(event('[data-mem-action]','cancel'));assert.equal(ctx.mem.form,null);
 assert.deepEqual(calls,[]);
});
test('edit save persists role before icon and keeps failed icon changes available for retry',async()=>{
 const writes=[],member={memberId:'m1',role:'MOM',label:'엄마',avatarId:'mom-1'};
 const ctx={CharacterUI:UI,AccountView:View,HouseholdView:require('../js/household-view'),hh:{hid:'f1'},acct:{user:{uid:'u1'}},acctEnabled:()=>true,usMeId:()=> 'another',usMembers:()=>[member],mem:{view:'form',form:{memberId:'m1',role:'DAD',label:'아빠',avatarId:'dad-3'}},memReadLabel:()=> '아빠',memRender:()=>{},acctRenderSlot:()=>{},usRefreshCalendar:()=>{},console:{error(){}},HouseholdSync:{upsertMember:async(hid,data)=>{writes.push(['role',hid,data.role]);return {ok:true,memberId:'m1'}},setAvatar:async(hid,data)=>{writes.push(['avatar',hid,data.avatarId]);return {ok:true}}}};
 vm.createContext(ctx);vm.runInContext(app.match(/  async function memOnClick\(ev\)[\s\S]*?\n  \}/)[0],ctx);
 const ev={stopPropagation(){},target:{closest:s=>s==='[data-mem-action]'?{getAttribute:name=>name==='data-mem-action'?'save':'m1'}:null}};
 await ctx.memOnClick(ev);assert.deepEqual(writes,[['role','f1','DAD'],['avatar','f1','dad-3']]);assert.equal(ctx.mem.form,null);
 ctx.mem={view:'form',form:{memberId:'m1',role:'MOM',label:'엄마',avatarId:'mom-2'}};
 ctx.HouseholdSync.setAvatar=async()=>({ok:false});await ctx.memOnClick(ev);
 assert.equal(ctx.mem.view,'form');assert.equal(ctx.mem.form.avatarId,'mom-2');assert(ctx.mem.form.error);assert.equal(ctx.mem.saving,false);
});
