import {test} from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import * as runtime from '../src/auth.js';
test('private cache single-flights complete utterances and refuses generation on audio reads',async()=>{
 assert.equal(typeof runtime.SpeechCache,'function');
 const db=new DatabaseSync(':memory:');const tasks=[];let calls=0;let release;
 const gate=new Promise(r=>release=r);
 const ctx={storage:{sql:{exec:(sql,...args)=>db.prepare(sql).all(...args)},setAlarm:async()=>{}},waitUntil:p=>tasks.push(p)};
 const cache=new runtime.SpeechCache(ctx,{ALLMODELS_API_KEY:'fake',TTS_VOICE:'test-voice'},async()=>{calls++;await gate;return new Uint8Array([73,68,51,...new Array(2000).fill(0)]).buffer;});
 const body={kind:'incoming',from:'+12025550101',to:'+12025550100'};
 const request=()=>new Request('https://internal/prepare',{method:'POST',body:JSON.stringify(body)});
 const first=await (await cache.fetch(request())).json();assert.equal(first.status,'pending');
 assert.equal((await (await cache.fetch(request())).json()).status,'pending');assert.equal(calls,1);
 assert.equal((await cache.fetch(new Request('https://internal/audio?key='+first.key))).status,404);
 release();await Promise.all(tasks);
 const ready=await (await cache.fetch(request())).json();assert.equal(ready.status,'ready');assert.equal(ready.synthesisRequests,1);assert.equal(calls,1);
 assert.equal((await cache.fetch(new Request('https://internal/audio?key='+ready.key))).status,200);
 assert.equal((await cache.fetch(new Request('https://internal/audio?key='+'0'.repeat(64)))).status,404);assert.equal(calls,1);
});
