const {test}=require('node:test');const a=require('node:assert/strict');const {spawnSync}=require('node:child_process');
const path=require('node:path');const root=path.resolve(__dirname,'..');
function python(code){return spawnSync('python3',['-c',code],{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH}});}
test('configuration rejects placeholder voice and requires all declared settings',()=>{const r=python(`import sys,json;sys.path.insert(0,'scripts');from config import validate
c=json.load(open('config.example.json'))
try:validate(c);raise AssertionError('placeholder accepted')
except ValueError:pass
c['TTS_VOICE']='permitted-test-voice';validate(c)
c.pop('EMAIL_TO')
try:validate(c);raise AssertionError('missing config accepted')
except ValueError:pass`);a.equal(r.status,0,r.stderr);});
test('billable generation requires explicit execute guard',()=>{const r=spawnSync('python3',['scripts/generate-audio.py'],{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH}});a.notEqual(r.status,0);a.match(r.stderr,/--execute is required/);});
test('deployment plan genuinely builds without credentials or private state',()=>{const r=spawnSync('python3',['scripts/deploy.py'],{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH}});a.equal(r.status,0,r.stderr);a.match(r.stdout,/OFFLINE PLAN/);});
