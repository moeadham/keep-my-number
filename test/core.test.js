import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/core.js';
test('SMS email uses exact subject, fixed addresses and preserves full Unicode body',()=>{
 const p={From:'+12025550102',To:'+12025550100',Body:'line one\n日本語 <>&\n'+ 'x'.repeat(4000)};
 const mail=core.smsEmail(p,{EMAIL_FROM:'sms@example.com',EMAIL_TO:'inbox@example.com'});
 assert.equal(mail.subject,`SMS From: ${p.From} To: ${p.To}`);
 assert.equal(mail.from,'sms@example.com');assert.equal(mail.to,'inbox@example.com');
 assert.equal(mail.text,`From: ${p.From}\nTo: ${p.To}\n\n${p.Body}`);
 assert.ok(mail.html.includes('&lt;&gt;&amp;'));
});
test('private answer prompt has ten-second DTMF-only gather and never bridges',()=>{
 const x=core.answerXml(['https://app/audio?a=1&b=2'],'https://app/accept');
 assert.match(x,/timeout="10"/);assert.match(x,/input="dtmf"/);assert.match(x,/numDigits="1"/);
 assert.match(x,/actionOnEmptyResult="true"/);assert.match(x,/<Gather[^>]+><Play>https:\/\/app\/audio\?a=1&amp;b=2<\/Play><\/Gather>/);
 assert.doesNotMatch(x,/<Conference|<Record|<Say/);
});
test('caller waits in non-started isolated conference and only 1 can bridge',()=>{
 const x=core.conferenceXml('opaque','https://app/wait','https://app/end','https://app/event',false);
 assert.match(x,/startConferenceOnEnter="false"/);assert.match(x,/maxParticipants="2"/);assert.match(x,/record="do-not-record"/);
 for(const digit of ['', '2', '0', '*', '#', '11'])assert.equal(core.accepted(digit),false);
 assert.equal(core.accepted('1'),true);
 assert.deepEqual(core.promptParts('connecting','+12'),['connecting','plus','1','2']);
 assert.deepEqual(core.promptParts('incoming','anonymous','+12'),['incoming','unknown','to','plus','1','2','accept']);
});
