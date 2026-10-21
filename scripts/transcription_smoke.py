"""Real model integration test. Requires user-supplied speech and a downloaded model."""
import argparse,os,sys,threading
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.core import transcribe
p=argparse.ArgumentParser();p.add_argument('media');p.add_argument('--language',choices=['ar','en'],required=True);p.add_argument('--model-dir',type=Path,default=Path(os.getenv('LOCALAPPDATA',str(Path.home())))/'EditFlowPro/models/small');p.add_argument('--words',action='store_true');p.add_argument('--out',type=Path,default=Path('transcription-test-output'));args=p.parse_args()
r=transcribe(str(Path(args.media).resolve()),args.model_dir,args.language,args.words,args.out.resolve(),lambda message,*_:print(message,flush=True),threading.Event());print(r['text']);print('Actual transcript:',r['srt'])
