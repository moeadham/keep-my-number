import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {Miniflare,createFetchMock} from 'miniflare';import {hmac} from '../src/auth.js';
test('deployed-style Worker gates preview and audio; runtime cache returns one whole generated MP3',async()=>{
 const code=await build({entryPoints:['src/worker.js'],bundle:true,format:'esm',write:false});
 const mocked=createFetchMock();
 const mf=new Miniflare({workers:[{name:'test',fetchMock:mocked,modules:true,script:code.outputFiles[0].text,compatibilityDate:'2026-07-30',bindings:{TWILIO_AUTH_TOKEN:'twilio',TWILIO_ACCOUNT_SID:'ACtest',AUDIO_SECRET:'audio',ALLMODELS_API_KEY:'fake',TTS_VOICE:'test-voice',ALLOWED_NUMBERS:JSON.stringify(['+12025550100'])},durableObjects:{SESSIONS:{className:'ForwardingSession',useSQLite:true},SPEECH:{className:'SpeechCache',useSQLite:true}}}]});
 try{
 const url='http://localhost/speech-preview',p=new URLSearchParams({AccountSid:'ACtest',Kind:'incoming',From:'+12025550101',To:'+12025550100'});
 assert.equal((await mf.dispatchFetch(url,{method:'POST',body:p.toString()})).status,403);
 mocked.disableNetConnect();mocked.get('https://api.allmodels.io').intercept({path:'/oai/audio/speech',method:'POST'}).reply(200,Buffer.from([73,68,51,...new Array(2000).fill(0)]),{headers:{'content-type':'audio/mpeg'}});
 const sig=await hmac(url+[...p.keys()].sort().map(k=>k+p.get(k)).join(''),'twilio','SHA-1');
 let data;for(let n=0;n<30;n++){const r=await mf.dispatchFetch(url,{method:'POST',body:p.toString(),headers:{'x-twilio-signature':sig}});assert.equal(r.status,200);data=await r.json();if(data.status==='ready')break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(data.status,'ready');assert.equal(data.synthesisRequests,1);assert.match(data.text,/two zero two \[break\] five five five/);
 const audio=await mf.dispatchFetch(data.url);assert.equal(audio.status,200);assert.equal((await audio.arrayBuffer()).byteLength,2003);
 const u=new URL(data.url);u.searchParams.delete('sig');assert.equal((await mf.dispatchFetch(u)).status,403);
 mocked.assertNoPendingInterceptors();
 }finally{await mf.dispose();}
});
