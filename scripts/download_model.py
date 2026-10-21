"""Explicit online provisioning; the backend never downloads models."""
import hashlib,json,os,shutil,tempfile
from pathlib import Path
from huggingface_hub import snapshot_download
ROOT=Path(__file__).resolve().parents[1]
def verify(folder,lock):
 for name,expected in lock['files'].items():
  path=folder/name
  if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=expected:
   raise RuntimeError('Model checksum mismatch or file missing: '+name)

def main():
 lock=json.loads((ROOT/'model-lock.json').read_text())
 print('Downloads the multilingual small Whisper model from '+lock['repo']+'. About 500 MB. No media is uploaded.')
 root=Path(os.environ['LOCALAPPDATA'])/'EditFlowPro';root.mkdir(parents=True,exist_ok=True)
 target=root/'models/small'
 if (target/'model.bin').exists():
  verify(target,lock);print('Model checksums verified at '+str(target));return
 with tempfile.TemporaryDirectory(dir=root) as temp:
  dest=Path(temp)/'model'
  snapshot_download(repo_id=lock['repo'],revision=lock['revision'],local_dir=dest,allow_patterns=['model.bin','config.json','tokenizer.json','vocabulary.*','preprocessor_config.json'])
  if not (dest/'model.bin').is_file():raise RuntimeError('Model download incomplete')
  verify(dest,lock)
  audit={'repo':lock['repo'],'revision':lock['revision'],'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in dest.iterdir() if p.is_file()}}
  (dest/'download-audit.json').write_text(json.dumps(audit,indent=2))
  target.parent.mkdir(parents=True,exist_ok=True)
  if target.exists():raise RuntimeError('Incomplete model directory exists. Rename it and retry: '+str(target))
  shutil.move(str(dest),str(target))
 print('Model ready: '+str(target))
if __name__=='__main__':main()
