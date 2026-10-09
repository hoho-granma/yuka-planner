"""App access authorization on an isolated demo project in a local emulator."""
import base64
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

PROJECT = 'demo-hannun-appaccess'
HOST = 'http://127.0.0.1:8788'
ROOT = f'projects/{PROJECT}/databases/(default)/documents'


def token(uid):
    def encode(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip('=')
    return encode({'alg': 'none', 'typ': 'JWT'}) + '.' + encode({
        'sub': uid, 'user_id': uid, 'aud': PROJECT,
        'iss': 'https://securetoken.google.com/' + PROJECT,
        'iat': int(time.time()), 'exp': int(time.time()) + 3600,
        'firebase': {'sign_in_provider': 'custom'},
    }) + '.'


def request(url, method='GET', data=None, uid='owner'):
    headers = {'Content-Type': 'application/json'}
    if uid:
        headers['Authorization'] = 'Bearer ' + ('owner' if uid == 'owner' else token(uid))
    req = urllib.request.Request(url, method=method, headers=headers,
                                 data=json.dumps(data).encode() if data is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return res.status, json.load(res)
    except urllib.error.HTTPError as error:
        return error.code, {}


def write(uid, owner, event, version='2.0.26', reason='app_open', server_time=True, extra=False):
    fields = {'schemaVersion': {'integerValue': '1'},
              'appVersion': {'stringValue': version}, 'reason': {'stringValue': reason}}
    if extra:
        fields['email'] = {'stringValue': 'not-allowed@example.com'}
    item = {'update': {'name': ROOT + f'/accounts/{owner}/appAccess/{event}', 'fields': fields}}
    if server_time:
        item['updateTransforms'] = [{'fieldPath': 'accessedAt', 'setToServerValue': 'REQUEST_TIME'}]
    else:
        fields['accessedAt'] = {'timestampValue': '2020-01-01T00:00:00Z'}
    return request(HOST + '/v1/' + ROOT + ':commit', 'POST', {'writes': [item]}, uid)[0]


rules = Path('firestore.rules').read_text()
status, _ = request(HOST + '/emulator/v1/projects/' + PROJECT + ':securityRules', 'PUT',
                    {'rules': {'files': [{'name': 'firestore.rules', 'content': rules}]}})
assert status == 200, ('load rules', status)
status, _ = request(HOST + '/v1/' + ROOT + '/accounts/u1', 'PATCH',
                    {'fields': {'displayName': {'stringValue': 'test'}}})
assert status == 200
event = 'event_' + str(time.time_ns())
assert write('u1', 'u1', event) == 200
assert write('u2', 'u1', event + '_other') == 403
assert write(None, 'u1', event + '_anon') == 403
assert write('missing', 'missing', event + '_missing') == 403
assert write('u1', 'u1', event + '_clock', server_time=False) == 403
assert write('u1', 'u1', event + '_extra', extra=True) == 403
assert write('u1', 'u1', event + '_reason', reason='page_view') == 403
assert write('u1', 'u1', event + '_version', version='x' * 33) == 403
assert write('u1', 'u1', event) == 403  # An existing event cannot be overwritten.
url = HOST + '/v1/' + ROOT + f'/accounts/u1/appAccess/{event}'
assert request(url, uid='u1')[0] == 200
assert request(url, uid='u2')[0] == 403
assert request(url, 'DELETE', uid='u1')[0] == 403
assert request(HOST + '/v1/' + ROOT + '/accounts/u1/appAccess', uid='u1')[0] == 200
assert request(HOST + '/v1/' + ROOT + '/accounts/u1/appAccess', uid='u2')[0] == 403
print('App access emulator authorization checks passed: 14')
