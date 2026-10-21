import hashlib, importlib.util, json, os, shutil, subprocess, tempfile, threading, unittest, urllib.request, urllib.error
from pathlib import Path
from unittest.mock import patch
from backend import server, visual_ai, timeline_cut
from scripts import install_update

class ReleaseTests(unittest.TestCase):
 def test_authenticated_health_and_persistent_token(self):
  with tempfile.TemporaryDirectory() as td:
   token=server.persistent_token(td);self.assertEqual(token,server.persistent_token(td))
   service=server.Service(td,token=token);http=server.ThreadingHTTPServer(('127.0.0.1',0),server.make_handler(service))
   thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
   url=f'http://127.0.0.1:{http.server_port}/health'
   try:
    with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(url)
    self.assertEqual(error.exception.code,401)
    req=urllib.request.Request(url,headers={'Authorization':'Bearer '+token})
    with urllib.request.urlopen(req) as response:health=json.load(response)
    self.assertEqual(health['version'],'0.9.6');self.assertNotIn(token,json.dumps(health))
   finally:http.shutdown();http.server_close();thread.join();service.pool.shutdown()
 def fixture(self,d):
  source=d/'source';state=d/'state';source.mkdir();state.mkdir();python=d/'python.exe';python.write_text('fixture')
  contents={'backend/server.py':'# test','uxp/manifest.json':'{}','uxp/main.js':'//test','scripts/launch.py':'#test','release.json':'{"version":"0.9.2"}'}
  for name,content in contents.items():
   p=source/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content)
  files={name:hashlib.sha256((source/name).read_bytes()).hexdigest() for name in contents}
  (source/'package-manifest.json').write_text(json.dumps({'files':files}))
  (state/'cep-launcher.json').write_text(json.dumps({'backendRoot':str(d/'old'),'backendPython':str(python),'workRoot':str(d/'work')}))
  (state/'pairing-token.txt').write_text('existing-secret')
  stable=state/'current/uxp';stable.mkdir(parents=True);(stable/'main.js').write_text('old panel')
  return source,state
 def test_update_keeps_runtime_token_and_backs_up(self):
  with tempfile.TemporaryDirectory() as td:
   source,state=self.fixture(Path(td));install_update.install(state,source)
   cfg=json.loads((state/'cep-launcher.json').read_text());self.assertEqual(cfg['release'],'0.9.2')
   self.assertEqual((state/'pairing-token.txt').read_text(),'existing-secret')
   self.assertEqual((state/'current/uxp/main.js').read_text(),'//test')
   self.assertEqual(next((state/'backups').glob('*/uxp/main.js')).read_text(),'old panel')
 def test_update_failure_restores_panel_and_config(self):
  with tempfile.TemporaryDirectory() as td:
   source,state=self.fixture(Path(td));old=(state/'cep-launcher.json').read_bytes()
   with patch.object(install_update.os,'replace',side_effect=OSError('injected failure')):
    with self.assertRaises(OSError):install_update.install(state,source)
   self.assertEqual((state/'cep-launcher.json').read_bytes(),old)
   self.assertEqual((state/'current/uxp/main.js').read_text(),'old panel')
   self.assertFalse((state/'releases/0.9.2').exists())
 def test_checksum_failure_changes_nothing(self):
  with tempfile.TemporaryDirectory() as td:
   source,state=self.fixture(Path(td));(source/'backend/server.py').write_text('bad')
   with self.assertRaises(ValueError):install_update.install(state,source)
   self.assertEqual((state/'current/uxp/main.js').read_text(),'old panel')
 @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'),'FFmpeg required')
 def test_real_frame_analysis_and_microphone_cut(self):
  with tempfile.TemporaryDirectory() as td:
   d=Path(td);camera=d/'camera.mp4';mic=d/'mic.wav'
   subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=gray:s=320x240:r=25:d=4','-f','lavfi','-i','sine=frequency=500:duration=4','-c:v','mpeg4','-c:a','aac','-shortest',str(camera)],check=True)
   subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','sine=frequency=800:duration=4','-af',"volume=0:enable='between(t,1,2)'",str(mic)],check=True)
   before=hashlib.sha256(camera.read_bytes()).hexdigest()
   rec=visual_ai.recommend({'path':str(camera),'source_in':0,'duration':4});self.assertIn('metrics',rec);self.assertTrue(-.25<=rec['color']['exposure_offset']<=.25)
   row=lambda p:{'path':str(p),'start':0,'end':4,'source_in':0,'source_out':4}
   out=timeline_cut.analyze_and_export({'video':row(camera),'mic':row(mic),'micTrack':2},{},d/'output',lambda *a:None,threading.Event())
   self.assertLess(out['kept_seconds'],3.5);self.assertGreater(out['kept_seconds'],3)
   self.assertTrue(Path(out['xml']).is_file());self.assertEqual(before,hashlib.sha256(camera.read_bytes()).hexdigest())
if __name__=='__main__':unittest.main()
