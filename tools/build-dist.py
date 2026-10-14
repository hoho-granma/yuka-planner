#!/usr/bin/env python3
"""Firebase Hosting 산출물(dist/)을 만든다.
  --app full     현재 앱 전체 (기본, 지금 배포되는 것)
  --app hannun   성장기록·교육 묶음(tools/app-profiles.json 의 ssaeng)을 index.html·sw.js·dist 에서 뺀 한눈육아
  --worktree     커밋된 HEAD 대신 작업 트리를 쓴다(로컬 확인용). 기본은 HEAD — 미커밋 파일이 배포되는 사고 방지.
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile

p = argparse.ArgumentParser()
p.add_argument("--app", choices=["full", "hannun"], default="full")
p.add_argument("--worktree", action="store_true")
p.add_argument("--out", default="dist")
a = p.parse_args()
root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
os.chdir(root)

if a.worktree:
    src = root
else:
    src = tempfile.mkdtemp()
    arc = subprocess.Popen(["git", "archive", "HEAD"], stdout=subprocess.PIPE)
    subprocess.check_call(["tar", "-x", "-C", src], stdin=arc.stdout)
    arc.wait()

prof = json.load(open(os.path.join(src, "tools/app-profiles.json")))["ssaeng"]
drop = set(prof["js"] + prof["css"] + prof["html"] + prof["data"]) if a.app == "hannun" else set()
def dropped(path):
    path = path.lstrip("./")
    return any(path == d or path.startswith(d + "/") for d in drop)

out = os.path.join(root, a.out)
shutil.rmtree(out, ignore_errors=True)
os.makedirs(out)
for f in ["index.html", "manifest.json", "sw.js", "curriculum-map.html", "learning-check-paper.html", "transfer.html"]:
    if dropped(f):
        continue
    shutil.copy(os.path.join(src, f), out)
for d in ["css", "js", "data", "fonts", "icons", "vendor"]:
    shutil.copytree(os.path.join(src, d), os.path.join(out, d), ignore=lambda cur, names: [
        n for n in names if n == ".DS_Store" or dropped(os.path.relpath(os.path.join(cur, n), src))])

if a.app == "hannun":
    h = open(os.path.join(out, "index.html"), encoding="utf8").read()
    def keep_tag(m):
        ref = re.search(r'(?:src|href)="([^"?#]+)', m.group(0))
        return "" if ref and dropped(ref.group(1)) else m.group(0)
    h = re.sub(r"<script\b[^>]*\bsrc=\"[^\"]*\"[^>]*>\s*</script>\s*\n?", keep_tag, h)
    h = re.sub(r"<link\b[^>]*\bhref=\"[^\"]*\"[^>]*>\s*\n?", keep_tag, h)
    open(os.path.join(out, "index.html"), "w", encoding="utf8").write(h)
    s = open(os.path.join(out, "sw.js"), encoding="utf8").read()
    s = "\n".join(l for l in s.split("\n") if not (re.match(r'\s*"\./[^"]+",?\s*$', l) and dropped(re.search(r'"\./([^"]+)"', l).group(1))))
    open(os.path.join(out, "sw.js"), "w", encoding="utf8").write(s)

if src != root:
    shutil.rmtree(src)
n = sum(len(fs) for _, _, fs in os.walk(out))
print(f"{a.out}/ 생성 (app={a.app}, {'작업트리' if a.worktree else 'HEAD ' + subprocess.check_output(['git','rev-parse','--short','HEAD'], text=True).strip()}): {n}개 파일")
