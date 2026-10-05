#!/usr/bin/env node
/*
 * quote-check — 조사 결과의 {url, quote} 인용이 실제 페이지 본문에 있는지 자동 대조(환각 검증용). 외부 요청은 이 도구에서만 한다.
 *   node test/tools/quote-check.js items.json [--out report.md] [--delay 1000] [--timeout 20]
 *   items.json: [{ "url": "...", "quote": "...", "id": "선택" }, ...]  또는  { "items": [...] }  또는 마크다운 표(| id | url | quote |) 파일(.md)
 * 판정: 일치 / 불일치 / 접속불가(+이유). 공백·줄바꿈·nbsp·전각 공백 정규화 후 부분 문자열 비교(HTML 태그·script·style 제거, 기본 엔티티 해제).
 * 동시 요청 1개, 요청 사이 기본 1초, curl 만 사용(리다이렉트 따라감, 시간 제한). 읽기 전용 — 아무것도 저장·전송하지 않고 보고서만 쓴다.
 * 종료 코드: 불일치·접속불가가 하나라도 있으면 1.
 */
const cp = require("child_process"), fs = require("fs");

const norm = (s) => String(s == null ? "" : s).replace(/[ 　​﻿]/g, " ").replace(/\s+/g, " ").trim();
const ENT = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&middot;": "·", "&hellip;": "…", "&ldquo;": "“", "&rdquo;": "”", "&lsquo;": "‘", "&rsquo;": "’" };
function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|[a-z]+);/gi, (m, d, h) => (d ? String.fromCodePoint(Number(d)) : h ? String.fromCodePoint(parseInt(h, 16)) : ENT[m.toLowerCase()] || " "));
}
/** 본문에 quote 가 있는가(공백 정규화 비교). 따옴표·말줄임 변형은 호출 쪽이 정리한다. */
const contains = (body, quote) => { const q = norm(quote); return q.length > 0 && norm(body).includes(q); };

function parseItems(file) {
  const raw = fs.readFileSync(file, "utf8");
  if (/\.json$/i.test(file) || /^\s*[\[{]/.test(raw)) {
    const j = JSON.parse(raw);
    const arr = Array.isArray(j) ? j : Array.isArray(j.items) ? j.items : [];
    return arr.map((x, i) => ({ id: x.id != null ? String(x.id) : String(i + 1), url: x.url, quote: x.quote }));
  }
  const out = []; // 마크다운 표: 행에서 http 주소가 든 칸 = url, 가장 긴 다른 칸 = quote, 첫 칸 = id
  for (const line of raw.split(/\r?\n/)) {
    if (!/^\s*\|/.test(line) || /^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    const ui = cells.findIndex((c) => /^https?:\/\//.test(c.replace(/^<|>$/g, "")));
    if (ui < 0) continue;
    const url = cells[ui].replace(/^<|>$/g, "");
    const others = cells.filter((_, i) => i !== ui);
    const quote = others.slice().sort((a, b) => b.length - a.length)[0] || "";
    out.push({ id: cells[0] !== cells[ui] ? cells[0] : String(out.length + 1), url, quote: quote.replace(/^["“'‘]|["”'’]$/g, "") });
  }
  return out;
}

function fetchBody(url, timeoutSec) {
  const r = cp.spawnSync("curl", ["-sSL", "--max-time", String(timeoutSec), "--compressed", "-A", "Mozilla/5.0 (hannun quote-check)", "-w", "\n%{http_code}", url], { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
  if (r.error) return { ok: false, why: String(r.error.message || r.error) };
  if (r.status !== 0) return { ok: false, why: `curl 종료 ${r.status}: ${String(r.stderr || "").trim().slice(0, 120)}` };
  const out = String(r.stdout || ""), i = out.lastIndexOf("\n"), code = Number(out.slice(i + 1));
  if (!(code >= 200 && code < 300)) return { ok: false, why: `HTTP ${code}` };
  return { ok: true, body: htmlToText(out.slice(0, i)) };
}
const sleep = (ms) => { const t = Date.now() + ms; while (Date.now() < t) cp.spawnSync("sleep", ["0.05"]); };

/** 항목별 판정: { id, url, status:"일치"|"불일치"|"접속불가", why? }. 같은 주소는 한 번만 받는다(동시 1개·간격). fetcher 는 테스트용 주입. */
function check(items, opt) {
  const o = Object.assign({ delayMs: 1000, timeoutSec: 20, fetcher: fetchBody, sleeper: sleep }, opt || {});
  const cache = new Map(); let first = true;
  return items.map((it) => {
    if (!it.url || !/^https?:\/\//.test(it.url)) return { id: it.id, url: it.url || "", status: "접속불가", why: "주소 형식이 아니에요" };
    if (!norm(it.quote)) return { id: it.id, url: it.url, status: "불일치", why: "인용문이 비었어요" };
    if (!cache.has(it.url)) { if (!first) o.sleeper(o.delayMs); first = false; cache.set(it.url, o.fetcher(it.url, o.timeoutSec)); }
    const r = cache.get(it.url);
    if (!r.ok) return { id: it.id, url: it.url, status: "접속불가", why: r.why };
    return { id: it.id, url: it.url, status: contains(r.body, it.quote) ? "일치" : "불일치" };
  });
}
function report(results, items) {
  const n = (s) => results.filter((r) => r.status === s).length;
  const lines = [`# 인용 대조 결과 — 일치 ${n("일치")} · 불일치 ${n("불일치")} · 접속불가 ${n("접속불가")} (총 ${results.length})`, "", "| id | 판정 | 주소 | 인용(앞 40자) | 이유 |", "|---|---|---|---|---|"];
  results.forEach((r, i) => lines.push(`| ${r.id} | ${r.status} | ${r.url} | ${norm((items[i] && items[i].quote) || "").slice(0, 40).replace(/\|/g, "/")} | ${r.why || ""} |`));
  return lines.join("\n") + "\n";
}

if (require.main === module) {
  const a = process.argv.slice(2), file = a.find((x) => !x.startsWith("--") && fs.existsSync(x));
  const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  if (!file) { console.error("사용: node test/tools/quote-check.js items.json|items.md [--out report.md] [--delay 1000] [--timeout 20]"); process.exit(2); }
  const items = parseItems(file);
  const res = check(items, { delayMs: Number(opt("--delay", 1000)), timeoutSec: Number(opt("--timeout", 20)) });
  const text = report(res, items);
  const out = opt("--out", "");
  if (out) fs.writeFileSync(out, text); else process.stdout.write(text);
  process.exit(res.every((r) => r.status === "일치") ? 0 : 1);
}
module.exports = { norm, htmlToText, contains, parseItems, check, report };
