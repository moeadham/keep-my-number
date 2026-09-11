"""Isolated provisioning only. Never buys numbers, attaches routes, or originates calls."""
import os,json,pathlib,time,subprocess,argparse
from config import load
ROOT=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--execute', action='store_true', help='Create/update isolated Twilio resources; never changes number routes')
args=parser.parse_args()
if not args.execute:
 subprocess.run(['npm','run','bundle'],cwd=ROOT,check=True)
 print('OFFLINE PLAN: protected Function + protected supplied MP3; Sync metadata; participant-free Conversations/MCS. No credentials, synthesis, network API calls, number routing or deployments.')
 raise SystemExit(0)
config=load()
if config['LIVE_CALLS_ENABLED']!='false':raise ValueError('Deployment requires LIVE_CALLS_ENABLED=false; enable separately after review')
for key in ['TWILIO_OUTBOUND_ACCOUNT_SID','TWILIO_OUTBOUND_AUTH_TOKEN','ALLMODELS_API_KEY','CF_EMAIL_API_TOKEN']:
 if not os.environ.get(key):raise ValueError('Missing required environment variable: '+key)
asset=ROOT/'audio/unavailable.mp3'
if not asset.exists() or not 100<asset.stat().st_size<1048576:raise ValueError('Supply audio/unavailable.mp3 first (100 bytes to 1MiB)')
subprocess.run(['ffmpeg','-v','error','-i',str(asset),'-f','null','-'],check=True)
import requests
STATE=ROOT/'.state.json'; EVIDENCE=ROOT/'.evidence'; EVIDENCE.mkdir(exist_ok=True)
sid=os.environ['TWILIO_OUTBOUND_ACCOUNT_SID']; token=os.environ['TWILIO_OUTBOUND_AUTH_TOKEN']
auth=(sid,token); state=json.loads(STATE.read_text()) if STATE.exists() else {}
if state and state.get('account')!=sid:raise ValueError('Deployment state belongs to a different account')
state['account']=sid
def save(): STATE.write_text(json.dumps(state,indent=2));STATE.chmod(0o600)
def api(url,data=None,files=None):
 r=requests.request('POST' if data is not None or files else 'GET',url,auth=auth,data=data,files=files,timeout=40)
 if not r.ok:
  try: d=r.json()
  except ValueError: d={}
  raise RuntimeError({'status':r.status_code,'code':d.get('code'),'message':d.get('message')})
 return r.json()
def get_or_create(key,url,data):
 if key not in state:state[key]=api(url,data)['sid'];save()
 return state[key]
base='https://serverless.twilio.com/v1/Services'
if 'routes_before' not in state:
 d=api(f'https://api.twilio.com/2010-04-01/Accounts/{sid}/IncomingPhoneNumbers.json?PageSize=1000')
 (EVIDENCE/'routes-before.json').write_text(json.dumps(d,indent=2));state['routes_before']=True;save()
service=get_or_create('service',base,{'UniqueName':'keep-my-number-native-isolated','FriendlyName':'Keep My Number native ISOLATED','IncludeCredentials':'true'})
b=base+'/'+service
if 'environment' not in state:
 d=api(b+'/Environments',{'UniqueName':'isolated','DomainSuffix':'isolated'});state.update(environment=d['sid'],domain=d['domain_name']);save()
get_or_create('sync','https://sync.twilio.com/v1/Services',{'FriendlyName':'Keep My Number native metadata','AclEnabled':'true'})
get_or_create('media_service','https://conversations.twilio.com/v1/Services',{'FriendlyName':'Keep My Number native audio storage'})
get_or_create('media_conversation',f"https://conversations.twilio.com/v1/Services/{state['media_service']}/Conversations",{'FriendlyName':'Private generated audio (NO PARTICIPANTS)','UniqueName':'audio-storage'})
participants=api(f"https://conversations.twilio.com/v1/Services/{state['media_service']}/Conversations/{state['media_conversation']}/Participants")
assert not participants['participants']
get_or_create('function',b+'/Functions',{'FriendlyName':'Native forwarding entry'})
get_or_create('unavailable_asset',b+'/Assets',{'FriendlyName':'Unavailable Fish speech'})
# Fallback generation is a separate, explicitly billable command.
subprocess.run(['npm','run','bundle'],cwd=ROOT,check=True)
upload='https://serverless-upload.twilio.com/v1/Services/'+service
# Upload the supplied fallback on every build; never reuse a stale voice asset.
with asset.open('rb') as f:
 state['asset_version']=api(f"{upload}/Assets/{state['unavailable_asset']}/Versions",{'Path':'/unavailable.mp3','Visibility':'protected'},{'Content':('unavailable.mp3',f,'audio/mpeg')})['sid'];save()
with (ROOT/'dist/entry.cjs').open('rb') as f:
 state['function_version']=api(f"{upload}/Functions/{state['function']}/Versions",{'Path':'/entry','Visibility':'protected'},{'Content':('entry.js',f,'application/javascript')})['sid'];save()
variables={**config,'ALLMODELS_API_KEY':os.environ['ALLMODELS_API_KEY'],'SYNC_SERVICE_SID':state['sync'],'MEDIA_SERVICE_SID':state['media_service'],'MEDIA_CONVERSATION_SID':state['media_conversation']}
if os.environ.get('CF_EMAIL_API_TOKEN'):variables['CF_EMAIL_API_TOKEN']=os.environ['CF_EMAIL_API_TOKEN']
existing=api(f"{b}/Environments/{state['environment']}/Variables")['variables']; bykey={x['key']:x['sid'] for x in existing}
for k,v in variables.items():
 path=f"{b}/Environments/{state['environment']}/Variables"
 if k in bykey:api(path+'/'+bykey[k],{'Value':v})
 else:api(path,{'Key':k,'Value':v})
state['email_token_configured']='CF_EMAIL_API_TOKEN' in variables;save()
state['build']=api(b+'/Builds',{'FunctionVersions':state['function_version'],'AssetVersions':state['asset_version'],'Runtime':'node22','Dependencies':json.dumps([{'name':'twilio','version':'5.4.5'}])})['sid'];save()
for _ in range(90):
 d=api(b+'/Builds/'+state['build'])
 if d['status']=='completed':break
 if d['status']=='failed':raise RuntimeError('Build failed')
 time.sleep(2)
else:raise RuntimeError('Build pending, inspect state; do not create another build')
state['deployment']=api(f"{b}/Environments/{state['environment']}/Deployments",{'BuildSid':state['build']})['sid'];save()
readback=api(f"{b}/Environments/{state['environment']}");assert readback['build_sid']==state['build']
(EVIDENCE/'environment.json').write_text(json.dumps(readback,indent=2))
for name,url in [('sync',f"https://sync.twilio.com/v1/Services/{state['sync']}"),('media-service',f"https://conversations.twilio.com/v1/Services/{state['media_service']}"),('media-conversation',f"https://conversations.twilio.com/v1/Services/{state['media_service']}/Conversations/{state['media_conversation']}")]:
 (EVIDENCE/(name+'.json')).write_text(json.dumps(api(url),indent=2))
actual={x['key']:x['value'] for x in api(f"{b}/Environments/{state['environment']}/Variables")['variables']}
if any(actual.get(k)!=v for k,v in variables.items()):raise RuntimeError('Remote variable verification failed')
print('Deployed and read back active build and configuration; routes unchanged. Private handles in .state.json.')
