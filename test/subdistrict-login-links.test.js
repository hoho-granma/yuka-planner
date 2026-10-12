// 회원가입 3단계 지역(시·도 → 시·군·구 → 구)과 로그인·가입 시트의 보조 링크
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs");
const AV = require("../js/account-view.js");
const css = fs.readFileSync(__dirname + "/../css/style.css", "utf8");
const regions = JSON.parse(fs.readFileSync(__dirname + "/../data/regions.json", "utf8")).provinces;
const subs = JSON.parse(fs.readFileSync(__dirname + "/../data/subdistricts.json", "utf8"));
regions.forEach((p) => { p.subdistricts = subs[p.code] || {}; });
const base = { email: "a@b.com", password: "password123", displayName: "주연", situation: "HAS_CHILD", role: "MOM", province: "경기도", district: "성남시" };

test("data/subdistricts.json 의 시는 모두 regions.json 에 있고 성남시는 분당구를 가진다", () => {
  for (const [pc, m] of Object.entries(subs)) {
    if (pc.startsWith("_")) continue;
    const p = regions.find((x) => x.code === pc); assert.ok(p, pc);
    for (const city of Object.keys(m)) assert.ok(p.districts.includes(city), pc + city);
  }
  assert.ok(subs["경기도"]["성남시"].includes("분당구"));
});
test("가입 검증: 일반구가 있는 시는 구까지 골라야 하고, 없는 시는 구 없이 통과한다", () => {
  assert.equal(AV.validateSignup(base, new Date(), regions).errors.region, AV.MSG.errSubdistrict);
  const ok = AV.validateSignup({ ...base, subdistrict: "분당구" }, new Date(), regions);
  assert.deepEqual([ok.ok, ok.intent.province, ok.intent.district, ok.intent.subdistrict], [true, "경기도", "성남시", "분당구"]);
  assert.equal(AV.validateSignup({ ...base, subdistrict: "없는구" }, new Date(), regions).errors.region, AV.MSG.errSubdistrict);
  const flat = AV.validateSignup({ ...base, district: "과천시", subdistrict: "분당구" }, new Date(), regions);
  assert.ok(flat.ok && !("subdistrict" in flat.intent));
});
test("가입 폼: 성남시를 고르면 구 선택칸이 나오고, 시를 바꾸면 구를 비운다", () => {
  const html = AV.renderSignup({ form: { ...base, subdistrict: "분당구" }, errors: {}, regions, unified: true });
  assert.ok(html.includes('data-acct-input="subdistrict"') && html.includes('<option value="분당구" selected>'));
  assert.ok(!AV.renderSignup({ form: { ...base, district: "과천시" }, errors: {}, regions, unified: true }).includes('data-acct-input="subdistrict"'));
  const f = { ...base, district: "수원시", subdistrict: "분당구" };
  AV.syncForm(f, regions);
  assert.equal(f.subdistrict, "");
});
test("로그인 시트: 보조 링크 둘은 같은 클래스(회색·가운데·한 줄씩)이고 맨 밑 취소 버튼은 없다", () => {
  const html = AV.renderLogin({ form: {}, errors: {} });
  assert.equal((html.match(/acct-sub-link/g) || []).length, 2);
  assert.ok(html.includes('data-acct-action="reset-password"') && html.includes('data-acct-action="open-signup"'));
  assert.ok(!html.includes('data-acct-action="close"'));
  assert.match(css, /\.acct-form \.acct-sub-link\s*\{[^}]*display:\s*block[^}]*text-align:\s*center[^}]*color:\s*var\(--text-muted\)/);
});
test("가입 폼의 '이미 계정이 있어요 · 로그인'도 같은 보조 링크 스타일이다", () => {
  const html = AV.renderSignup({ form: base, errors: {}, regions, unified: true });
  assert.match(html, /class="acct-link acct-sub-link" data-acct-action="open-login"/);
});
test("내 프로필 수정: 일반구가 있는 시면 구 칸이 나오고, 값이 없으면 빈 채로 둔다", () => {
  const HV = require("../js/household-view.js");
  const st = { enabled: true, hasHousehold: true, acctMode: true, bare: true, members: [{ memberId: "m1", role: "MOM", label: "주연", order: 1 }], meId: "m1", view: "form", regions };
  const html = HV.renderMembers({ ...st, form: { memberId: "m1", role: "MOM", label: "주연", self: true, email: "a@b.com", province: "경기도", district: "성남시", subdistrict: "" } });
  assert.ok(html.includes('data-mem-region="subdistrict"') && html.includes('<option value="분당구">') && html.includes('<option value="">구</option>') && !html.includes('selected>분당구'));
  const none = HV.renderMembers({ ...st, form: { memberId: "m1", role: "MOM", label: "주연", self: true, province: "경기도", district: "과천시" } });
  assert.ok(!none.includes('data-mem-region="subdistrict"'));
});
