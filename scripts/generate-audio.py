"""Explicitly billable fallback speech generation; never places a call."""
import argparse, os, subprocess
from config import ROOT, load
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--execute', action='store_true')
args=p.parse_args()
if not args.execute:
    p.error('--execute is required: this invokes paid speech generation')
c=load()
key=os.environ['ALLMODELS_API_KEY']
import requests
path=ROOT/'audio/unavailable.mp3'
if path.exists():
    raise ValueError('Fallback already exists; deliberately remove it before regenerating')
r=requests.post('https://api.allmodels.io/oai/audio/speech', headers={'Authorization':'Bearer '+key}, json={'model':c['TTS_MODEL'],'voice':c['TTS_VOICE'],'input':'The person you are calling is unavailable. Please try again later.','response_format':'mp3'}, timeout=45)
r.raise_for_status()
if not 100<len(r.content)<1048576:
    raise ValueError('Invalid audio size')
path.parent.mkdir(exist_ok=True)
tmp=path.with_suffix('.tmp.mp3')
try:
    tmp.write_bytes(r.content)
    subprocess.run(['ffmpeg','-v','error','-i',str(tmp),'-f','null','-'],check=True)
    tmp.replace(path)
finally:
    tmp.unlink(missing_ok=True)
print('Generated and decoded audio/unavailable.mp3')
