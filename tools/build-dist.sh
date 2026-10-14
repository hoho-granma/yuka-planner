#!/bin/sh
# Firebase Hosting 배포용 산출물(dist/)을 만든다. 앱 실행에 필요한 파일만 복사한다 (docs·design-previews·output 등은 제외).
# 기본은 **커밋된 HEAD** 기준이다 (작업 중인 미커밋 파일이 배포되는 사고 방지). 로컬 확인용으로만 --worktree 를 쓴다.
set -e
cd "$(dirname "$0")/.."
SRC=$(mktemp -d)
if [ "$1" = "--worktree" ]; then SRC=.; else git archive HEAD | tar -x -C "$SRC"; fi
rm -rf dist && mkdir dist
for f in index.html manifest.json sw.js curriculum-map.html learning-check-paper.html transfer.html; do cp "$SRC/$f" dist/; done
for d in css js data fonts icons vendor; do rsync -a --exclude '.DS_Store' "$SRC/$d" dist/; done
[ "$SRC" != "." ] && rm -rf "$SRC"
echo "dist/ 생성($( [ "$1" = "--worktree" ] && echo 작업트리 || echo "HEAD $(git rev-parse --short HEAD)")): $(find dist -type f | wc -l | tr -d ' ')개 파일, $(du -sh dist | cut -f1)"
