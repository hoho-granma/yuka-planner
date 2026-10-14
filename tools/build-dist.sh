#!/bin/sh
# Firebase Hosting 산출물(dist/) 생성 — 실제 작업은 tools/build-dist.py (옵션: --app full|hannun, --worktree).
exec python3 "$(dirname "$0")/build-dist.py" "$@"
