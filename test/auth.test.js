import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import * as auth from '../src/auth.js';
test('Twilio HMAC authenticates exact URL and every parameter, rejects missing, changed and duplicated fields',async()=>{
 const url='https://app.example/voice?sid=CA123';const p=new URLSearchParams({To:'+12025550100',From:'+12025550102',AccountSid:'AC123'});
 const sig=createHmac('sha1','secret').update(url+[...p.keys()].sort().map(k=>k+p.get(k)).join('')).digest('base64');
 assert.equal(await auth.validTwilio(url,p,sig,'secret'),true);
 assert.equal(await auth.validTwilio(url+'x',p,sig,'secret'),false);
 assert.equal(await auth.validTwilio(url,p,'','secret'),false);
 p.append('To','+442079460123');assert.equal(await auth.validTwilio(url,p,sig,'secret'),false);
});
test('audio signatures expire, bind exact clip sequence, and cannot become open proxy',async()=>{
 const u=await auth.audioUrl('https://app.example',['incoming','1'],'secret',1000);
 assert.equal(await auth.validAudio(new URL(u),'secret',1050),true);
 assert.equal(await auth.validAudio(new URL(u),'secret',1121),false);
 const bad=new URL(u);bad.searchParams.set('parts','unavailable');assert.equal(await auth.validAudio(bad,'secret',1050),false);
 assert.equal(await auth.validAudio(new URL(u),'wrong',1050),false);
});
