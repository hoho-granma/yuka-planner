#!/bin/bash
# 한눈육아 카카오 로그인 비밀키를 서버 시크릿(HANNUN_KAKAO)에 넣는다. 키는 화면에 보이지 않고 채팅·파일에 남지 않는다.
# 쓰는 법: 터미널에서는 `!` 없이  bash tools/set-kakao-secret.sh  (`!` 는 Claude Code 입력창 전용 — zsh 에서는 히스토리 확장이 되어 옛 명령이 다시 실행된다).
# 카카오 개발자센터 > 내 애플리케이션 > 앱 키의 REST API 키와, 카카오 로그인 > 보안의 Client Secret 을 입력한다(시크릿을 쓰지 않으면 두 번째 칸은 엔터).
set -e
read -r -p "REST API 키: " id
[ -z "$id" ] && { echo "REST API 키가 비어 있어 바꾸지 않았어요."; exit 1; }
read -r -s -p "Client Secret(없으면 엔터): " sec; echo
HN_KAKAO_ID="$id" HN_KAKAO_SEC="$sec" python3 -c 'import json,os; print(json.dumps({"id":os.environ["HN_KAKAO_ID"],"secret":os.environ["HN_KAKAO_SEC"]}))' | firebase functions:secrets:set HANNUN_KAKAO --data-file - --project yuka-planner
echo "저장했어요. 이어서 함수를 배포해야 반영돼요:  firebase deploy --only functions:default:kakaoLogin --project yuka-planner"
