"""Probe NAVER API HUB without logging secrets or search content."""
import json
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone


def secret(name):
    result = subprocess.run(
        ['firebase', 'functions:secrets:access', name, '--project', 'yuka-planner'],
        capture_output=True, text=True, timeout=60,
    )
    if result.returncode or not result.stdout.strip():
        raise RuntimeError('Secret access failed: ' + name)
    return result.stdout.strip()


def main():
    try:
        client_id = secret('NAVER_CLIENT_ID')
        client_secret = secret('NAVER_CLIENT_SECRET')
    except (RuntimeError, subprocess.TimeoutExpired):
        print(json.dumps({'stage': 'secret_access', 'success': False}))
        return 1
    failed = False
    for kind in ['blog', 'cafearticle']:
        params = urllib.parse.urlencode({
            'query': '분당 정법수학학원 초등 후기', 'display': 3,
            'start': 1, 'sort': 'sim', 'format': 'json',
        })
        request = urllib.request.Request(
            'https://naverapihub.apigw.ntruss.com/search/v1/' + kind + '?' + params,
            headers={'X-NCP-APIGW-API-KEY-ID': client_id,
                     'X-NCP-APIGW-API-KEY': client_secret},
        )
        report = {'api': kind, 'checkedAt': datetime.now(timezone.utc).isoformat()}
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                data = json.load(response)
                items = data['items']
                if not isinstance(items, list) or not all(isinstance(i, dict) for i in items):
                    raise ValueError('Unexpected response shape')
                report.update({
                    'httpStatus': response.status, 'responseFields': sorted(data),
                    'itemCount': len(items), 'itemFields': [sorted(i) for i in items],
                    'allLinksHttp': all(urllib.parse.urlparse(str(i.get('link', ''))).scheme
                                        in ('http', 'https') for i in items),
                    'postdatePresent': ['postdate' in i for i in items],
                })
        except urllib.error.HTTPError as error:
            report['httpStatus'] = error.code
            failed = True
        except Exception as error:
            report['errorType'] = type(error).__name__
            failed = True
        # Never emit title, description, author names, URLs, credentials or error bodies.
        print(json.dumps(report, ensure_ascii=False))
    return int(failed)


if __name__ == '__main__':
    raise SystemExit(main())
