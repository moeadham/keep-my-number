const {createHash}=require('node:crypto');const {promptText}=require('./core.cjs');
const TTL=604800,MAX_ATTEMPTS=3;
function cacheKey(c,text){return 'audio-'+createHash('sha256').update(JSON.stringify([c.TTS_MODEL,c.TTS_VOICE,text])).digest('hex');}
async function speech(c,d,kind,from,to){
 const text=promptText(kind,from,to),key=cacheKey(c,text);let s=await d.get(key);
 if(s?.media){
  const media=await d.media(s.media);
  if(!s.message){const message=media.message_sid?{sid:media.message_sid}:await d.attach(s.media);s={...s,message:message.sid,status:'ready'};await d.set(key,s,TTL);}
  return {status:'ready',key,created:s.created,media:s.media,url:media.links.content_direct_temporary,text};
 }
 if(s?.status==='failed')return {status:'failed',key};
 if(s?.status==='generating'&&Date.now()-s.started<10000)return {status:'pending',key};
 const attempt=(s?.attempts||0)+1;
 if(attempt>MAX_ATTEMPTS)return {status:'failed',key};
 if(!await d.create(`${key}-attempt-${attempt}`,{at:Date.now()},TTL))return {status:'pending',key};
 s={status:'generating',attempts:attempt,started:Date.now()};await d.set(key,s,TTL);
 try{
  const bytes=await d.synthesize(text);const media=await d.upload(bytes);
  await d.set(key,{...s,status:'uploaded',media:media.sid,size:media.size,created:Date.now()},TTL);
  return {status:'pending',key};
 }catch(ex){await d.set(key,{...s,status:attempt===MAX_ATTEMPTS?'failed':'retry',code:ex.code||ex.status||ex.name},TTL);return {status:attempt===MAX_ATTEMPTS?'failed':'pending',key};}
}
module.exports={speech,cacheKey};
