"""연구 Markdown을 독립적인 웹 검토본으로 생성. 운영 데이터는 수정하지 않는다."""
from pathlib import Path
import json
import re

root = Path(__file__).resolve().parent.parent
rows = []
for line in (root / '분당-영어-공통비교-조사대장.md').read_text().splitlines():
    if not line.startswith('| J10:'):
        continue
    c = [x.strip() for x in line.split('|')[1:-1]]
    match = re.search(r'\[세부원문\]\(([^)]+)\)', c[10])
    record = (root / match[1]).read_text() if match else ''
    batch = int(re.search(r'배치(\d+)', match[1])[1]) if match else 0
    sources = list(dict.fromkeys(re.findall(r'https?://[^\s<>|)]+', record)))
    rows.append(dict(id=c[0], name=c[1], kind=c[2], address=c[3], group=c[4],
                     summary=c[6], cost=c[7], consultation=c[8], status=c[9],
                     batch=batch, record=record, sources=sources))
done = sum(bool(r['record']) for r in rows)
priority = [r for r in rows if r['group'] in ['포함 후보', '보류 어학']]
priority_done = sum(bool(r['record']) for r in priority)
data = json.dumps(rows, ensure_ascii=False).replace('<', '\\u003c')
template = (Path(__file__).parent / 'template.html').read_text()
result = template.replace('__RECORDS__', data).replace('__DONE__', str(done)).replace(
    '__TOTAL__', str(len(rows))).replace('__PRIORITY__', str(priority_done)).replace(
    '__PRIORITY_TOTAL__', str(len(priority))).replace('__PERCENT__', f'{done/len(rows)*100:.2f}')
(Path(__file__).parent / 'index.html').write_text(result)
print(f'웹 검토본 생성: {done}/{len(rows)}, 우선 {priority_done}/{len(priority)}')
