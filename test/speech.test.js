import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as speech from '../src/core.js';
import * as runtime from '../src/auth.js';
test('whole sentence synthesis is exactly one request, with pinned model and voice',async()=>{
 assert.equal(typeof runtime.synthesize,'function');
 const requests=[];const text=speech.promptText('incoming','+442079460123','+442079460123');
 const result=await runtime.synthesize(text,'test-secret',async(url,init)=>{requests.push({url,init});return new Response(new Uint8Array([73,68,51,...new Array(2000).fill(0)]),{headers:{'content-type':'audio/mpeg'}});}, {TTS_VOICE:'test-voice'});
 assert.equal(requests.length,1);const body=JSON.parse(requests[0].init.body);
 assert.deepEqual(body,{model:'fish/s2-1-pro',voice:'test-voice',input:text,response_format:'mp3'});
 assert.ok(requests[0].init.signal);assert.equal(result.byteLength,2003);
});
test('international metadata groups UK and NANP numbers',()=>{
 assert.equal(speech.spokenNumber('+442079460123'),'plus four four [break] two zero [break] seven nine four six [break] zero one two three');
 assert.equal(speech.spokenNumber('+12025550100'),'plus one [break] two zero two [break] five five five [break] zero one zero zero');
 assert.equal(speech.promptText('connecting','+442079460123','+442079460123'),'You are being connected to: plus four four [break] two zero [break] seven nine four six [break] zero one two three.');
 for(const input of ['anonymous','<script>','+4402079460123','442079460123','+1 2025550100','+000'])assert.equal(speech.spokenNumber(input),'unknown number');
});
test('synthesis rejects provider failures and non-audio; complete text changes cache identity',async()=>{
 await assert.rejects(runtime.synthesize('test','fake',async()=>new Response('{}',{status:200}),{TTS_VOICE:'test-voice'}),/Invalid MP3/);
 await assert.rejects(runtime.synthesize('test','fake',async()=>new Response('bad',{status:503}),{TTS_VOICE:'test-voice'}),/provider status 503/);
 assert.notEqual(await runtime.speechKey('Incoming call one'),await runtime.speechKey('Incoming call two'));
});
test('approved grouped-digit full utterance matches exactly',()=>{
 assert.equal(typeof speech.promptText,'function');
 assert.equal(speech.promptText('incoming','+12025550101','+12025550100'),'Incoming call from plus one [break] two zero two [break] five five five [break] zero one zero one to plus one [break] two zero two [break] five five five [break] zero one zero zero, press 1 to connect, or hang up instead.');
});
