const test = require("node:test"), assert = require("node:assert/strict");
const AS = require("../js/auth-service.js");
const svc = (changeEmail) => AS.create({ features: () => ({ accounts: true }), adapter: { changeEmail, onChange() { return () => {}; } } });
test("changeEmail: 형식·비밀번호 검증, 성공 시 인증 메일 안내, 비밀번호 오류는 전용 문구", async () => {
  let called = null;
  const ok = svc(async (e, p) => { called = [e, p]; });
  assert.equal((await ok.changeEmail({ newEmail: "bad", password: "x" })).message, AS.MSG.invalidEmail);
  assert.equal((await ok.changeEmail({ newEmail: "a@b.com", password: "" })).message, AS.MSG.wrongPassword);
  assert.equal(called, null);
  const r = await ok.changeEmail({ newEmail: " a@b.com ", password: "pw123456" });
  assert.deepEqual([r.ok, r.message, called], [true, AS.MSG.emailChangeSent, ["a@b.com", "pw123456"]]);
  const bad = svc(async () => { throw { code: "auth/invalid-credential" }; });
  assert.equal((await bad.changeEmail({ newEmail: "a@b.com", password: "no" })).message, AS.MSG.wrongPassword);
  const used = svc(async () => { throw { code: "auth/email-already-in-use" }; });
  assert.equal((await used.changeEmail({ newEmail: "a@b.com", password: "pw" })).message, AS.MSG.emailInUse);
});
