import os,json,pathlib,urllib.request,urllib.parse,urllib.error,base64,time,uuid
root=pathlib.Path(__file__).resolve().parents[1]
def flow_definition(url):
 definition={'description':'SMS email and screened call forwarding; no number routes linked','flags':{'allow_concurrent_calls':True},'initial_state':'Trigger','states':[{'name':'Trigger','type':'trigger','properties':{'offset':{'x':0,'y':0}},'transitions':[{'event':'incomingMessage','next':'sms_email'},{'event':'incomingCall','next':'voice_screen'},{'event':'incomingConversationMessage'},{'event':'incomingRequest'},{'event':'incomingParent'}]}]}
 for name,mode,x in [('sms_email','sms',-200),('voice_screen','voice',200)]:definition['states'].append({'name':name,'type':'add-twiml-redirect','properties':{'url':url+'?mode='+mode,'method':'POST','timeout':'0','offset':{'x':x,'y':200}},'transitions':[{'event':'return'},{'event':'timeout'},{'event':'fail'}]})
 return definition

import argparse
parser=argparse.ArgumentParser(description='Provision isolated Twilio Functions + Studio; never changes phone-number routes.')
parser.add_argument('--apply',action='store_true')
parser.add_argument('--dry-run',action='store_true')
args=parser.parse_args()
config=json.loads((root/'wrangler.json' if args.apply else root/'wrangler.example.json').read_text())['vars']
if not args.apply:
 print(json.dumps(flow_definition('https://functions.example.com/entry'),indent=2))
 print('DRY RUN: no network calls; would create Function service, protected entrypoint, environment and Studio flow. No number routes changed.')
 raise SystemExit(0)
if args.dry_run:parser.error('Choose either --apply or --dry-run')
sid=os.environ['TWILIO_ACCOUNT_SID'];token=os.environ['TWILIO_AUTH_TOKEN']
if sid != config['TWILIO_ACCOUNT_SID']:raise ValueError('Twilio account must match Worker configuration')
if not token or set(sid[2:])=={'0'}:raise ValueError('Real credentials required for --apply')
(root/'.state').mkdir(exist_ok=True)

headers={'Authorization':'Basic '+base64.b64encode((sid+':'+token).encode()).decode(),'User-Agent':'curl/8.4.0'}
def api(url,data=None,raw=None,ctype=None):
 h=dict(headers)
 if data is not None:raw=urllib.parse.urlencode(data,doseq=True).encode();ctype='application/x-www-form-urlencoded'
 if ctype:h['Content-Type']=ctype
 try:
  with urllib.request.urlopen(urllib.request.Request(url,data=raw,headers=h),timeout=30) as r:return json.load(r)
 except urllib.error.HTTPError as e:
  d=json.load(e);raise RuntimeError(str({k:d.get(k) for k in ['code','message','status','details']}))
path=root/'.state/twilio-deployment.json';state=json.load(open(path)) if path.exists() else {}
def save():path.write_text(json.dumps(state,indent=2))
base='https://serverless.twilio.com/v1/Services'
if 'service' not in state:state['service']=api(base,{'UniqueName':os.environ.get('TWILIO_SERVICE_NAME','phone-forwarder'),'FriendlyName':'Phone forwarder','IncludeCredentials':'true'})['sid'];save()
b=base+'/'+state['service']
if 'environment' not in state:
 d=api(b+'/Environments',{'UniqueName':'isolated','DomainSuffix':'isolated'});state.update(environment=d['sid'],domain=d['domain_name']);save()
if 'function' not in state:state['function']=api(b+'/Functions',{'FriendlyName':'Forwarding entrypoint'})['sid'];save()
if True:
 boundary=uuid.uuid4().hex;body=b''
 for k,v in {'Path':'/entry','Visibility':'protected'}.items():body+=f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
 body+=f'--{boundary}\r\nContent-Disposition: form-data; name="Content"; filename="entry.js"\r\nContent-Type: application/javascript\r\n\r\n'.encode()+(root/'functions/entry.cjs').read_bytes()+f'\r\n--{boundary}--\r\n'.encode()
 state['version']=api('https://serverless-upload.twilio.com/v1/Services/'+state['service']+'/Functions/'+state['function']+'/Versions',raw=body,ctype='multipart/form-data; boundary='+boundary)['sid'];save()
if True:
 origin=config['PUBLIC_ORIGIN']
 existing=api(b+'/Environments/'+state['environment']+'/Variables')['variables']
 for k,v in {'WORKER_ORIGIN':origin,'FORWARDER_TOKEN':token}.items():
  target=next((x['sid'] for x in existing if x['key']==k),None)
  api(b+'/Environments/'+state['environment']+'/Variables'+('/'+target if target else ''),{'Key':k,'Value':v})
 state['variables']=True;save()
state['build']=api(b+'/Builds',{'FunctionVersions':[state['version']],'Runtime':'node22','Dependencies':'[]'})['sid'];save()
for _ in range(40):
 d=api(b+'/Builds/'+state['build']);print('build',d['status'],flush=True)
 if d['status']=='completed':break
 if d['status']=='failed':raise RuntimeError('Twilio build failed')
 time.sleep(2)
else:raise RuntimeError('Build still running; rerun script')
state['deployment']=api(b+'/Environments/'+state['environment']+'/Deployments',{'BuildSid':state['build']})['sid'];save()
readback=api(b+'/Environments/'+state['environment']);assert readback['build_sid']==state['build'];state['verified_build']=readback['build_sid'];save()
url='https://'+state['domain']+'/entry'
definition=flow_definition(url)
(root/'.state/studio-flow.json').write_text(json.dumps(definition,indent=2))
if 'flow' not in state:state['flow']=api('https://studio.twilio.com/v2/Flows',{'FriendlyName':'Screened calls and SMS email','Status':'published','Definition':json.dumps(definition)})['sid'];save()
api('https://studio.twilio.com/v2/Flows/'+state['flow'],{'Status':'published','Definition':json.dumps(definition)})
d=api('https://studio.twilio.com/v2/Flows/'+state['flow']);assert d['definition']==definition;state['flow_status']=d['status'];save()
(root/'.state/new-flow.json').write_text(json.dumps(d,indent=2));print(json.dumps(state,indent=2))
