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
# 화면용 7개 항목·전화·공식 사이트(tools/education-sections-spec.md 기준 정리 결과). 없는 기관은 필드를 붙이지 않는다.
extras = research / 'education-sections.json'
if extras.exists():
    by_id = {r['id']: r for r in json.loads(extras.read_text())}
    keys = ['fees', 'schedule', 'program', 'levelTest', 'shuttle', 'method', 'trial']
    for item in items:
        r = by_id.get(item['id'])
        if not r:
            continue
        item['sections'] = {k: r[k] for k in keys}
        item['phones'] = r.get('phones', [])
        if r.get('site'):
            item['site'] = r['site']
    print(f"화면용 정리 {sum('sections' in i for i in items)}곳, 공식 사이트 {sum('site' in i for i in items)}곳")
dest = research / 'firebase-import.json'
dest.write_text(json.dumps(dict(checkedAt='2026-10-12', items=items), ensure_ascii=False, indent=2)+'\n')
print(f'조사  {len(items)}곳, 추가 태그 {sum(i["added"] for i in items)}곳')
