import io,json,socket,tempfile,unittest,urllib.error
from unittest.mock import patch
from scripts import launch
class LaunchTests(unittest.TestCase):
 def test_timeout_on_free_port_allows_start(self):
  with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
  with patch('scripts.launch.urllib.request.build_opener') as factory:
   factory.return_value.open.side_effect=urllib.error.URLError(TimeoutError('timed out'))
   self.assertEqual(launch.inspect_backend('private',port)['state'],'free')
 def test_timeout_on_occupied_port_never_starts_second(self):
  with socket.socket() as s:
   s.bind(('127.0.0.1',0));s.listen();port=s.getsockname()[1]
   with patch('scripts.launch.urllib.request.build_opener') as factory:
    factory.return_value.open.side_effect=urllib.error.URLError(TimeoutError())
    with self.assertRaisesRegex(RuntimeError,'no second backend'):launch.inspect_backend('private',port)
 def test_proxy_disabled_and_matching_version_reused(self):
  with patch('scripts.launch.urllib.request.ProxyHandler') as proxy,patch('scripts.launch.urllib.request.build_opener') as factory:
   factory.return_value.open.return_value.__enter__.return_value=io.StringIO(json.dumps({'version':'0.9.6'}))
   self.assertEqual(launch.inspect_backend('private')['state'],'running');proxy.assert_called_once_with({})
 def test_auth_error_does_not_probe_or_start(self):
  with patch('scripts.launch.urllib.request.build_opener') as factory,patch('scripts.launch.port_available') as port:
   factory.return_value.open.side_effect=urllib.error.HTTPError('local',401,'unauthorized',{},None)
   with self.assertRaisesRegex(RuntimeError,'HTTP 401'):launch.inspect_backend('private')
   port.assert_not_called()
 def test_status_file_no_credentials(self):
  from pathlib import Path
  with tempfile.TemporaryDirectory() as tmp:
   launch.record(Path(tmp),'process-started',pid=123)
   self.assertEqual(json.loads((Path(tmp)/'launcher-status.json').read_text())['pid'],123)
