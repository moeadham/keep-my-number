import {promptText} from './core.js';
// Private, account-wide cache DO. No public route can supply arbitrary TTS text.
export class SpeechCache {
 constructor(ctx,env,generate=synthesize){this.ctx=ctx;this.env=env;this.generate=generate;this.sql=ctx.storage.sql;
  this.sql.exec('CREATE TABLE IF NOT EXISTS utterances (key TEXT PRIMARY KEY,text TEXT,status TEXT,audio BLOB,created INTEGER,expires INTEGER)');
  this.sql.exec('CREATE TABLE IF NOT EXISTS budget (day INTEGER PRIMARY KEY, attempts INTEGER)');
 }
 async fetch(req){
  const u=new URL(req.url),now=Date.now();
  if(u.pathname==='/audio'){
   const row=[...this.sql.exec('SELECT audio FROM utterances WHERE key=? AND status=? AND expires>?',u.searchParams.get('key'),'ready',now)][0];
   return row?new Response(row.audio,{headers:{'content-type':'audio/mpeg','cache-control':'private, no-store'}}):new Response('Not found',{status:404});
  }
  if(u.pathname!=='/prepare'||req.method!=='POST')return new Response('Not found',{status:404});
  const {kind,from,to}=await req.json();const text=promptText(kind,from,to),key=await speechKey(text,this.env);
  this.sql.exec('DELETE FROM utterances WHERE expires<=?',now);
  let row=[...this.sql.exec('SELECT status,created FROM utterances WHERE key=?',key)][0];
  if(!row){
   const day=Math.floor(now/86400000);
   this.sql.exec('DELETE FROM budget WHERE day<?',day);
   const count=[...this.sql.exec('SELECT attempts FROM budget WHERE day=?',day)][0]?.attempts||0;
   const active=[...this.sql.exec('SELECT COUNT(*) AS n FROM utterances WHERE status=? AND created>?','pending',now-25000)][0].n;
   if(count>=100||active>=4||!this.env.ALLMODELS_API_KEY||!this.env.TTS_VOICE)return Response.json({status:'failed',key,text,model:this.env.TTS_MODEL||MODEL,voice:this.env.TTS_VOICE,reason:'speech-budget-or-capacity'});
   this.sql.exec('INSERT INTO budget(day,attempts) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET attempts=attempts+1',day);
   this.sql.exec('INSERT INTO utterances(key,text,status,created,expires) VALUES (?,?,?,?,?)',key,text,'pending',now,now+300000);
   row={status:'pending',created:now};
   this.ctx.waitUntil(this.generate(text,this.env.ALLMODELS_API_KEY,fetch,this.env).then(audio=>{
    this.sql.exec('UPDATE utterances SET status=?,audio=?,expires=? WHERE key=?','ready',new Uint8Array(audio),Date.now()+7*86400000,key);
   }).catch(()=>{this.sql.exec('UPDATE utterances SET status=? WHERE key=?','failed',key);console.error('Whole-utterance generation failed');}));
   await this.ctx.storage.setAlarm(now+86400000);
  }
  const status=row.status==='pending'&&now-row.created>=25000?'failed':row.status;
  return Response.json({status,key,text,model:this.env.TTS_MODEL||MODEL,voice:this.env.TTS_VOICE,synthesisRequests:1,created:row.created});
 }
 async alarm(){this.sql.exec('DELETE FROM utterances WHERE expires<=?',Date.now());this.sql.exec('DELETE FROM budget WHERE day<?',Math.floor(Date.now()/86400000));await this.ctx.storage.setAlarm(Date.now()+86400000);}
}
export const MODEL='fish/s2-1-pro';
export async function speechKey(text,config={}){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({model:config.TTS_MODEL||MODEL,voice:config.TTS_VOICE,input:text,response_format:'mp3'}))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function synthesize(text,secret,request=fetch,config={}){
 if(!secret||!config.TTS_VOICE||typeof text!=='string'||text.length>650)throw new Error('Speech configuration or input invalid');
 const r=await request('https://api.allmodels.io/oai/audio/speech',{method:'POST',headers:{Authorization:'Bearer '+secret,'content-type':'application/json'},body:JSON.stringify({model:config.TTS_MODEL||MODEL,voice:config.TTS_VOICE,input:text,response_format:'mp3'}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error('Speech provider status '+r.status);
 const reader=r.body.getReader(),chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1000000){await reader.cancel();throw new Error('Speech audio too large');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 if(size<1000||!((bytes[0]===73&&bytes[1]===68&&bytes[2]===51)||(bytes[0]===255&&(bytes[1]&224)===224)))throw new Error('Invalid MP3');
 return bytes.buffer;
}
const enc=new TextEncoder();
export function constantEqual(a,b){if(!a||!b||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
export async function hmac(message,secret,hash='SHA-256'){
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash},false,['sign']);
 return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(message)))));
}
export async function validTwilio(url,p,sig,secret){
 if(!secret||!sig||new Set(p.keys()).size!==[...p.keys()].length)return false;
 const msg=url+[...p.keys()].sort().map(k=>k+p.get(k)).join('');
 return constantEqual(await hmac(msg,secret,'SHA-1'),sig);
}
export async function audioUrl(origin,parts,secret,now=Math.floor(Date.now()/1000)){
 const p=parts.join(',');const exp=String(now+120);const u=new URL('/audio',origin);
 u.search=new URLSearchParams({parts:p,exp,sig:await hmac(`${p}|${exp}`,secret)}).toString();return u.href;
}
export async function validAudio(u,secret,now=Math.floor(Date.now()/1000)){
 const p=u.searchParams.get('parts'),exp=u.searchParams.get('exp');
 if(!p||!/^\d+$/.test(exp||'')||Number(exp)<now||Number(exp)>now+120)return false;
 if([...u.searchParams.keys()].length!==3)return false;
 return constantEqual(await hmac(`${p}|${exp}`,secret),u.searchParams.get('sig'));
}
