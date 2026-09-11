export {SpeechCache} from './auth.js';
import {Engine} from './engine.js';
import {validTwilio,validAudio,audioUrl,constantEqual} from './auth.js';
import {xml} from './core.js';
import clips from './audio.json';
const cache=env=>env.SPEECH.get(env.SPEECH.idFromName('whole-utterances-v1'));
async function speech(env,origin,kind,from,to){
 try{
  const r=await cache(env).fetch('https://speech/prepare',{method:'POST',body:JSON.stringify({kind,from,to}),signal:AbortSignal.timeout(2500)});
  if(!r.ok)return {status:'failed'};const result=await r.json();
  if(result.status==='ready')result.url=await audioUrl(origin,['utterance-'+result.key],env.AUDIO_SECRET);
  return result;
 }catch{return {status:'failed'};}
}
const twiml=s=>new Response(s,{headers:{'content-type':'text/xml','cache-control':'no-store'}});
export default {async fetch(req,env){
 const u=new URL(req.url);
 if(u.pathname==='/health')return Response.json({ok:true,app:'phone-forwarder',version:2});
 if(u.pathname==='/audio'){
  if(!await validAudio(u,env.AUDIO_SECRET))return new Response('Forbidden',{status:403});
  const part=u.searchParams.get('parts');
  if(/^utterance-[a-f0-9]{64}$/.test(part))return cache(env).fetch('https://speech/audio?key='+part.slice(10));
  // Legacy signed links remain playable for in-flight calls and rollback; new prompts never use clips.
  const parts=part.split(',');
  if(parts.length>80||parts.some(p=>!Object.hasOwn(clips,p)))return new Response('Invalid clips',{status:400});
  const chunks=parts.map(p=>Uint8Array.from(atob(clips[p].data),c=>c.charCodeAt(0)));
  return new Response(new Blob(chunks),{headers:{'content-type':'audio/mpeg','cache-control':'private, no-store'}});
 }
 if(req.method!=='POST')return new Response('Not found',{status:404});
 const body=await req.text();if(body.length>100000)return new Response('Too large',{status:413});
 const p=new URLSearchParams(body);
 if(!await validTwilio(req.url,p,req.headers.get('x-twilio-signature'),env.TWILIO_AUTH_TOKEN))return new Response('Forbidden',{status:403});
 if(p.get('AccountSid')!==env.TWILIO_ACCOUNT_SID)return new Response('Wrong account',{status:403});
 const route=u.pathname.slice(1);
 if(route==='speech-preview'){
  if(!['incoming','connecting'].includes(p.get('Kind'))||!JSON.parse(env.ALLOWED_NUMBERS).includes(p.get('To'))||String(p.get('From')||'').length>32)return new Response('Invalid preview',{status:400});
  return Response.json(await speech(env,u.origin,p.get('Kind'),p.get('From'),p.get('To')),{headers:{'cache-control':'no-store'}});
 }
 if(!['sms','start','wait','status','answer','accept','event','end','unavailable','receipt'].includes(route))return new Response('Not found',{status:404});
 const id=route==='sms'||route==='receipt'?p.get('MessageSid'):(u.searchParams.get('parent')||p.get('CallSid'));
 if(!/^(CA|SM)[a-f0-9]{32}$/.test(id||''))return new Response('Invalid SID',{status:400});
 if(['sms','start'].includes(route)&&!JSON.parse(env.ALLOWED_NUMBERS).includes(p.get('To')))return new Response('Number not allowed',{status:403});
 return env.SESSIONS.get(env.SESSIONS.idFromName(id)).fetch(new Request(req.url,{method:'POST',headers:req.headers,body}));
}};
export class ForwardingSession {
 constructor(ctx,env){this.ctx=ctx;this.env=env;ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)');}
 engine(origin){const {ctx,env}=this;const sql=ctx.storage.sql;
 const api=async(path,data)=>{const init={headers:{Authorization:'Basic '+btoa(env.TWILIO_ACCOUNT_SID+':'+env.TWILIO_AUTH_TOKEN)}};
  if(data){init.method='POST';init.headers['content-type']='application/x-www-form-urlencoded';const p=new URLSearchParams();for(const [k,v] of Object.entries(data))for(const x of Array.isArray(v)?v:[v])p.append(k,String(x));init.body=p.toString();}
  const r=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/${path}.json`,init);const out=await r.json();if(!r.ok)throw new Error('Twilio API '+out.code);return out;};
 return new Engine({origin,now:()=>Date.now(),allowed:JSON.parse(env.ALLOWED_NUMBERS),destination:env.FORWARD_TO,email:env,from:env.OUTBOUND_FROM,
 load:k=>{const r=[...sql.exec('SELECT value FROM state WHERE key=?',k)][0];return r?JSON.parse(r.value):undefined;},
 save:(k,v)=>sql.exec('INSERT OR REPLACE INTO state(key,value) VALUES (?,?)',k,JSON.stringify(v)),
 alarm:t=>ctx.storage.setAlarm(t),inspectCall:s=>api('Calls/'+s),dial:p=>api('Calls',p),update:(s,p)=>api('Calls/'+s,p),
 prewarm:(from,to)=>ctx.waitUntil(Promise.all(['connecting','incoming'].map(kind=>speech(env,origin,kind,from,to)))),
 speech:(kind,from,to)=>speech(env,origin,kind,from,to),
 audio:parts=>audioUrl(origin,parts,env.AUDIO_SECRET),mail:m=>env.EMAIL.send({...m,from:m.from})});
 }
 async fetch(req){return this.ctx.blockConcurrencyWhile(async()=>{
 const u=new URL(req.url),p=Object.fromEntries(new URLSearchParams(await req.text()));const e=this.engine(u.origin),route=u.pathname.slice(1);
 try{
 if(route==='receipt')return Response.json(e.d.load('sms')||{status:'missing'});
 if(route==='sms'){await e.sms(p);return twiml(xml(''));}
 if(route==='end')return twiml(xml('<Hangup/>'));
 const result=await e[route](p);return twiml(typeof result==='string'?result:xml(''));
 }catch(error){console.error('forwarder operation failed',route,String(error.message));return new Response('Forwarding failed',{status:500});}
 });}
 async alarm(){return this.ctx.blockConcurrencyWhile(async()=>{const e=this.engine(this.env.PUBLIC_ORIGIN);await e.alarm();});}
}
