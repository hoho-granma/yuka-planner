"""연구 기록의 배포용 파생본 생성. 원본 대장·기본정보·운영 DB는 수정하지 않는다."""
from pathlib import Path
import json
import re

root = Path(__file__).resolve().parent.parent
research = root / 'output/research-sua-english-20261011'
items = []
for line in (research / '분당-영어-공통비교-조사대장.md').read_text().splitlines():
    if not line.startswith('| J10:'):
        continue
    c = [x.strip() for x in line.split('|')[1:-1]]
    m = re.search(r'\[세부원문\]\(([^)]+)\)', c[10])
    if not m:
        continue
    record = (research / m[1]).read_text()
    # 태그는 확인내용이 있는 기관에만 표시. 실패·연결보류 기록만 있으면 제외.
    added = c[9].replace(' ', '').startswith(('일부확인', '제한적확인'))
    items.append(dict(id=c[0], summary=c[6], cost=c[7], status=c[9],
                      checkedAt='2026-10-12', added=added, record=record,
                      sources=list(dict.fromkeys(re.findall(r'https?://[^\s<>|)]+', record)))))
dest = research / 'firebase-import.json'
dest.write_text(json.dumps(dict(checkedAt='2026-10-12', items=items), ensure_ascii=False, indent=2)+'\n')
print(f'조사  {len(items)}곳, 추가 태그 {sum(i["added"] for i in items)}곳')
