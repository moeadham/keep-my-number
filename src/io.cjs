const {speech}=require('./speech.cjs');
function io(c,options={}){
 const deadline=options.deadline||Date.now()+8500,fetcher=options.fetch||fetch;
 const authorization='Basic '+Buffer.from(`${c.ACCOUNT_SID}:${c.AUTH_TOKEN}`).toString('base64');
 async function request(url,{method='GET',data,body,headers={},cap=2000,binary=false}={}){
  const remaining=deadline-Date.now();if(remaining<100)throw Error('Function budget exhausted');
  if(data){body=new URLSearchParams();for(const [k,v] of Object.entries(data))for(const item of Array.isArray(v)?v:[v])body.append(k,String(item));headers['Content-Type']='application/x-www-form-urlencoded';}
  const r=await fetcher(url,{method,body,headers:{Authorization:authorization,...headers},signal:AbortSignal.timeout(Math.min(cap,remaining))});
  if(!r.ok){let code;try{code=(await r.json()).code}catch{}throw Object.assign(Error('Upstream request failed'),{status:r.status,code});}
  if(binary){let size=0;const chunks=[];for await(const chunk of r.body){size+=chunk.length;if(size>1048576){throw Error('Audio too large');}chunks.push(Buffer.from(chunk));}if(size<100)throw Error('Empty audio');return Buffer.concat(chunks);}
  if(r.status===204)return {};return r.json();
 }
 const sync=`https://sync.twilio.com/v1/Services/${c.SYNC_SERVICE_SID}/Documents`;
 const media=`https://mcs.us1.twilio.com/v1/Services/${c.MEDIA_SERVICE_SID}/Media`;
 const calls=`https://api.twilio.com/2010-04-01/Accounts/${c.ACCOUNT_SID}/Calls`;
 const encode=x=>encodeURIComponent(x);
 function metadata(v){const text=JSON.stringify(v);if(Buffer.byteLength(text)>4096||text.includes('"type":"Buffer"'))throw Error('Sync metadata exceeds 4KiB or contains binary');return text;}
 const d={
  async get(key){try{return (await request(`${sync}/${encode(key)}`)).data}catch(ex){if(ex.status===404)return null;throw ex;}},
  async create(key,value,ttl){try{await request(sync,{method:'POST',data:{UniqueName:key,Data:metadata(value),Ttl:ttl}});return true;}catch(ex){if(ex.status===409)return false;throw ex;}},
  async set(key,value,ttl){const data={Data:metadata(value),Ttl:ttl};try{return await request(`${sync}/${encode(key)}`,{method:'POST',data});}catch(ex){if(ex.status!==404)throw ex;return request(sync,{method:'POST',data:{UniqueName:key,...data}});}},
  async synthesize(text){return request('https://api.allmodels.io/oai/audio/speech',{method:'POST',cap:5000,binary:true,headers:{Authorization:'Bearer '+c.ALLMODELS_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:c.TTS_MODEL,voice:c.TTS_VOICE,input:text,response_format:'mp3'})});},
  async upload(bytes){if(bytes.length>1048576||bytes.length<100)throw Error('Invalid audio size');return request(media,{method:'POST',cap:1800,body:bytes,headers:{'Content-Type':'audio/mpeg','Content-Size':String(bytes.length)}});},
  async media(sid){if(!/^ME[0-9a-f]{32}$/i.test(sid))throw Error('Invalid media SID');return request(`${media}/${sid}`);},
  async attach(sid){return request(`https://conversations.twilio.com/v1/Services/${c.MEDIA_SERVICE_SID}/Conversations/${c.MEDIA_CONVERSATION_SID}/Messages`,{method:'POST',data:{MediaSid:sid,Author:'audio-cache'}});},
  async mail(payload){if(!c.CF_EMAIL_API_TOKEN)throw Object.assign(Error('CF_EMAIL_API_TOKEN missing'),{code:'CF_EMAIL_API_TOKEN_MISSING'});const r=await request(`https://api.cloudflare.com/client/v4/accounts/${c.CF_ACCOUNT_ID}/email/sending/send`,{method:'POST',cap:6000,body:JSON.stringify(payload),headers:{Authorization:'Bearer '+c.CF_EMAIL_API_TOKEN,'Content-Type':'application/json'}});if(!r.success||r.result?.permanent_bounces?.length)throw Object.assign(Error('Email not accepted'),{code:'EMAIL_NOT_ACCEPTED'});return r.result;},
  call:sid=>request(`${calls}/${sid}.json`),
  dial:data=>request(`${calls}.json`,{method:'POST',data}),
  update:(sid,data)=>request(`${calls}/${sid}.json`,{method:'POST',data}),
 };
 d.speech=(kind,from,to)=>speech(c,d,kind,from,to);
 return d;
}
module.exports={io};
