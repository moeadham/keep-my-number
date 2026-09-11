import {test} from 'node:test';
import assert from 'node:assert/strict';
import {speechKey,synthesize} from '../src/auth.js';
import {smsEmail} from '../src/core.js';
import {spawnSync} from 'node:child_process';
test('cache identity includes configured voice and model',async()=>{
 const key=await speechKey('same text',{TTS_VOICE:'voice-a',TTS_MODEL:'model-a'});
 assert.notEqual(key,await speechKey('same text',{TTS_VOICE:'voice-b',TTS_MODEL:'model-a'}));
 assert.notEqual(key,await speechKey('same text',{TTS_VOICE:'voice-a',TTS_MODEL:'model-b'}));
});
test('missing voice fails before any provider request',async()=>{
 let calls=0;await assert.rejects(synthesize('test','fake',async()=>{calls++;}));assert.equal(calls,0);
});
test('model and voice overrides reach speech provider',async()=>{
 let payload;await synthesize('test','fake',async(_url,init)=>{payload=JSON.parse(init.body);return new Response(new Uint8Array([73,68,51,...new Array(1100).fill(0)]));},{TTS_MODEL:'custom-model',TTS_VOICE:'custom-voice'});
 assert.equal(payload.model,'custom-model');assert.equal(payload.voice,'custom-voice');
});
test('email sender and recipient come only from configuration',()=>{
 const mail=smsEmail({From:'+12025550100',To:'+12025550101',Body:'test'},{EMAIL_FROM:'sender@example.com',EMAIL_TO:'recipient@example.com'});
 assert.equal(mail.from,'sender@example.com');assert.equal(mail.to,'recipient@example.com');
});
test('Twilio plan is credential-free, local and contains both entry routes',()=>{
 const result=spawnSync('python3',['scripts/deploy-twilio.py','--dry-run'],{encoding:'utf8',env:{PATH:process.env.PATH}});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/mode=sms/);assert.match(result.stdout,/mode=voice/);assert.match(result.stdout,/no network calls/);
});
