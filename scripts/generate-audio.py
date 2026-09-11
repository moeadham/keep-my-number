"""Generate only the fixed unavailable prompt, using your configured voice."""
import os, json, pathlib, urllib.request, base64, subprocess, tempfile
root=pathlib.Path(__file__).resolve().parents[1]
def main():
 config=json.loads((root/'wrangler.json').read_text())['vars']
 voice=config['TTS_VOICE']
 if not voice:raise ValueError('Set TTS_VOICE to a voice you have permission to use')
 payload={'model':config.get('TTS_MODEL','fish/s2-1-pro'),'voice':voice,'input':'The person you are calling is unavailable. Goodbye.','response_format':'mp3'}
 req=urllib.request.Request('https://api.allmodels.io/oai/audio/speech',data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+os.environ['ALLMODELS_API_KEY'],'Content-Type':'application/json','User-Agent':'phone-forwarder'})
 with urllib.request.urlopen(req,timeout=120) as response:audio=response.read(1000001)
 if not 1000<len(audio)<=1000000:raise ValueError('Unexpected audio size')
 with tempfile.TemporaryDirectory() as tmp:
  p=pathlib.Path(tmp)/'unavailable.mp3';p.write_bytes(audio)
  subprocess.run(['ffmpeg','-v','error','-i',str(p),'-f','null','-'],check=True)
 (root/'src/audio.json').write_text(json.dumps({'unavailable':{'text':payload['input'],'data':base64.b64encode(audio).decode()}})+'\n')
 print('Generated and decoded unavailable prompt; private generated src/audio.json is ignored.')
if __name__=='__main__':main()
