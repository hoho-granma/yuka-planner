// 구성원 수정 폼: 역할 칩 5개(한 줄)·내 프로필의 이메일/지역 칸, 교육 선택의 지역 버튼 라벨
const test = require("node:test"), assert = require("node:assert");
const fs = require("fs");
const HV = require("../js/household-view.js");
const RV = require("../js/education-reference-view.js");
const css = fs.readFileSync(__dirname + "/../css/style.css", "utf8");
const regions = [{ code: "경기도", name: "경기도", districts: ["성남시", "수원시"] }];
const base = { enabled: true, hasHousehold: true, acctMode: true, bare: true, members: [{ memberId: "m1", role: "MOM", label: "주연", order: 1 }], meId: "m1", view: "form", regions };

test("계정 모드 역할 칩은 엄마·아빠·아이·돌봄·기타 5개이고 한 줄 클래스를 쓴다", () => {
  const html = HV.renderMembers({ ...base, form: { memberId: "m1", role: "MOM", label: "주연" } });
  const chips = [...html.matchAll(/data-mem-role="(\w+)"[^>]*>([^<]+)</g)].map((m) => m[2]);
  assert.deepStrictEqual(chips, ["엄마", "아빠", "아이", "돌봄", "기타"]);
  assert.ok(html.includes("hh-chips hh-chips-row"));
  assert.ok(/\.hh-chips\.hh-chips-row\s*\{\s*flex-wrap:\s*nowrap/.test(css));
});
test("내 프로필 수정에는 이메일(읽기)·거주 지역이 나오고, 다른 구성원 폼에는 나오지 않는다", () => {
  const me = HV.renderMembers({ ...base, form: { memberId: "m1", role: "MOM", label: "주연", self: true, email: "a@b.com", province: "경기도", district: "성남시" } });
  assert.ok(me.includes('value="a@b.com"') && me.includes("disabled") && me.includes('data-mem-region="province"') && me.includes('<option value="성남시" selected>'));
  const other = HV.renderMembers({ ...base, form: { memberId: "m2", role: "DAD", label: "아빠" } });
  assert.ok(!other.includes("data-mem-region") && !other.includes('type="email"'));
});
test("이미 저장된 할머니·할아버지도 읽고 저장할 수 있다", () => {
  assert.strictEqual(HV.formRoleOf({ role: "GRANDPARENT", label: "할아버지" }), "GRANDPA");
  assert.ok(HV.validateMemberForm({ role: "GRANDMA", label: "" }, { accounts: true }).ok);
});
test("교육 선택: '성남시' 라벨 span 이 없고 첫 버튼이 소속 지역명이다", () => {
  const html = RV.choice({ favorites: [], district: "" }, { directoryItems: [], regionName: "성남시" });
  assert.ok(!html.includes("<span>성남시</span>"));
  assert.match(html, /data-district="" aria-pressed="true">성남시</);
  assert.ok(!/data-district="">전체</.test(html));
});
