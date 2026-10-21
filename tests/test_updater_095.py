import hashlib
import json
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
import zipfile
from pathlib import Path
from unittest.mock import patch

from backend import update_manager as U
from backend import server
from scripts import finish_update


def make_release(folder, release='0.9.6', tamper=None):
    root = 'EditFlow-Pro-' + release + '/'
    content = {
        'release.json': json.dumps({'version': release, 'targetPremiere': '25.6.2'}).encode(),
        'backend/server.py': b'# backend',
        'uxp/manifest.json': b'{}',
        'uxp/main.js': b'// panel',
        'scripts/launch.py': b'# launcher',
        'scripts/install_update.py': b'# installer',
    }
    manifest = json.dumps({'version': release, 'files': {
        name: hashlib.sha256(blob).hexdigest() for name, blob in content.items()
    }}).encode()
    archive = folder / f'EditFlow-Pro-{release}-Unified.zip'
    with zipfile.ZipFile(archive, 'w') as z:
        for name, blob in content.items():
            z.writestr(root + name, b'corrupt' if name == tamper else blob)
        z.writestr(root + 'package-manifest.json', manifest)
    return archive


class UpdaterTests(unittest.TestCase):
    def test_authenticated_update_endpoint_and_no_new_release(self):
        with tempfile.TemporaryDirectory() as tmp:
            service = server.Service(tmp, token='local-test-secret')
            http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.make_handler(service))
            worker = threading.Thread(target=http.serve_forever, daemon=True); worker.start()
            base = f'http://127.0.0.1:{http.server_port}'
            try:
                with self.assertRaises(urllib.error.HTTPError) as denied:
                    urllib.request.urlopen(base + '/update/status')
                self.assertEqual(denied.exception.code, 401)
                headers = {'Authorization': 'Bearer local-test-secret', 'Content-Type': 'application/json'}
                req = urllib.request.Request(base + '/update/channel', json.dumps({'url': ''}).encode(), headers)
                with urllib.request.urlopen(req) as response:
                    self.assertEqual(json.load(response)['mode'], 'GitHub Releases')
                with patch.object(U, 'prepare', return_value={'state': 'current', 'version': '0.9.5'}):
                    req = urllib.request.Request(base + '/update/apply', b'{}', headers)
                    with urllib.request.urlopen(req) as response:
                        self.assertEqual(json.load(response)['state'], 'current')
            finally:
                http.shutdown(); http.server_close(); worker.join(); service.pool.shutdown()

    def test_feed_and_version_guards(self):
        self.assertGreater(U.version('0.9.10'), U.version('0.9.6'))
        for value in ('0.9.5-dev', '../0.9.6', '01.2.3'):
            with self.assertRaises(ValueError): U.version(value)
        for url in ('http://example.com/feed.json', 'https://localhost/feed.json', 'https://user:pass@example.com/a'):
            with self.assertRaises(ValueError): U.secure_url(url)
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            self.assertEqual(U.set_channel(state, 'https://example.com/latest.json')['mode'], 'custom HTTPS feed')
            with patch.object(U, 'fetch_json', return_value={
                'version': '0.9.6', 'url': 'https://example.com/EditFlow.zip',
                'sha256': 'a'*64, 'targetPremiere': '25.6.2'
            }):
                self.assertEqual(U.newest(state, '0.9.5')['version'], '0.9.6')
            U.set_channel(state, '')
            self.assertEqual(U.channel(state), U.DEFAULT_CHANNEL)

    def test_github_release_candidate_and_legacy_skip(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            self.assertEqual(U.channel(state), U.DEFAULT_CHANNEL)
            with patch.object(U, 'fetch_json', return_value={'tag_name': 'v0.8.2'}):
                self.assertIsNone(U.newest(state, '0.9.6', state))
            asset = {'name': 'EditFlow-Pro-0.9.7-Unified.zip', 'state': 'uploaded',
                     'digest': 'sha256:' + 'a'*64,
                     'browser_download_url': 'https://github.com/DenGo003/EditFlow-Pro/releases/download/v0.9.7/EditFlow-Pro-0.9.7-Unified.zip'}
            release = {'tag_name': 'v0.9.7', 'assets': [asset]}
            with patch.object(U, 'fetch_json', return_value=release):
                candidate = U.newest(state, '0.9.6', state)
            self.assertEqual(candidate['source'], 'GitHub Releases')
            self.assertEqual(candidate['sha256'], 'a'*64)
            for key, bad in [('digest', None), ('name', 'EditFlow-Pro-Update.zip'),
                             ('browser_download_url', 'https://evil.example/EditFlow-Pro-0.9.7-Unified.zip')]:
                changed = dict(asset, **{key: bad})
                with patch.object(U, 'fetch_json', return_value={'tag_name': 'v0.9.7', 'assets': [changed]}):
                    with self.assertRaises(ValueError): U.newest(state, '0.9.6', state)

    def test_github_http_failure_and_downloads_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp); downloads = state / 'Downloads'; downloads.mkdir()
            archive = make_release(downloads, '0.9.7')
            failure = urllib.error.HTTPError(U.DEFAULT_CHANNEL, 404, 'Not Found', {}, None)
            with patch.object(U, 'fetch_json', side_effect=failure):
                self.assertEqual(U.newest(state, '0.9.6', downloads)['path'], str(archive))
            with patch.object(U, 'fetch_json', side_effect=urllib.error.URLError('offline')):
                self.assertEqual(U.newest(state, '0.9.6', downloads)['source'], 'Downloads')
            with self.assertRaisesRegex(ValueError, 'SHA256'):
                U.copy_download(archive, state/'copy.zip', '0'*64)
            self.assertFalse((state/'copy.zip').exists())

    def test_bundle_validation_staging_and_detached_install(self):
        fetch = patch.object(U, 'fetch_json', return_value={'tag_name': 'v0.8.2'})
        fetch.start(); self.addCleanup(fetch.stop)
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            state = base / 'state'; state.mkdir()
            downloads = base / 'Downloads'; downloads.mkdir()
            archive = make_release(downloads)
            self.assertIsNone(U.newest(state, '0.9.6', downloads))
            staged = U.prepare(state, '0.9.5', downloads)
            self.assertEqual(staged['state'], 'staged')
            self.assertEqual(staged['version'], '0.9.6')
            self.assertEqual(U.inspect_bundle(archive, '0.9.6', '0.9.5'), 'EditFlow-Pro-0.9.6/')
            fake_python = base / 'python.exe'; fake_python.write_bytes(b'fixture')
            (state / 'cep-launcher.json').write_text(json.dumps({
                'backendRoot': str(base / 'old'), 'backendPython': str(fake_python), 'workRoot': str(state)
            }))
            stable = state / 'current' / 'uxp'; stable.mkdir(parents=True)
            (stable / 'main.js').write_text('// old panel')
            with patch.object(finish_update, 'premiere_running', return_value=False), \
                    patch.object(finish_update, 'backend_running', return_value=False):
                self.assertTrue(finish_update.run(state, staged['folder'], staged['stage'], sleeper=lambda _: None))
            self.assertEqual(json.loads((state / 'cep-launcher.json').read_text())['release'], '0.9.6')
            self.assertEqual((state / 'current' / 'uxp' / 'main.js').read_bytes(), b'// panel')
            self.assertEqual(json.loads((state / 'update-status.json').read_text())['state'], 'installed')
            self.assertFalse(Path(staged['stage']).exists())
            self.assertEqual((state / 'backups').is_dir(), True)

    def test_corrupt_or_unsafe_package_never_stages(self):
        fetch = patch.object(U, 'fetch_json', return_value={'tag_name': 'v0.8.2'})
        fetch.start(); self.addCleanup(fetch.stop)
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp); state = base / 'state'; state.mkdir()
            downloads = base / 'Downloads'; downloads.mkdir()
            make_release(downloads, tamper='uxp/main.js')
            with self.assertRaisesRegex(ValueError, 'Corrupt update package'):
                U.prepare(state, '0.9.5', downloads)
            self.assertFalse(list((state / 'updates').glob('stage-*')))
            archive = downloads / 'EditFlow-Pro-0.9.6-Unified.zip'
            archive.unlink()
            with zipfile.ZipFile(archive, 'w') as z:
                z.writestr('EditFlow-Pro-0.9.6/../evil.py', 'x')
            with self.assertRaisesRegex(ValueError, 'Unsafe update archive member'):
                U.prepare(state, '0.9.5', downloads)
            self.assertFalse((state / 'evil.py').exists())


if __name__ == '__main__':
    unittest.main()
