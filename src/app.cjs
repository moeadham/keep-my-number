const Twilio=require('twilio');
const {promptText}=require('./core.cjs');
function error(message,status=400){return Object.assign(new Error(message),{status});}
function empty(){return new Twilio.twiml.MessagingResponse().toString();}
async function run(c,e,d){
 if(e.AccountSid!==c.ACCOUNT_SID)throw error('Wrong account',403);
 if(e.mode==='sms'){
  if(!(c.ALLOWED_NUMBERS||'').split(',').includes(e.To)||!/^SM[0-9a-f]{32}$/i.test(e.MessageSid||''))throw error('Invalid SMS');
  const key='sms-'+e.MessageSid;
  if(!c.CF_EMAIL_API_TOKEN)throw Object.assign(error('Email token not configured',503),{code:'CF_EMAIL_API_TOKEN_MISSING'});
  if(!await d.create(key,{phase:'sending',at:Date.now()},604800)){
   const previous=await d.get(key);if(previous?.phase==='sent')return empty();
   throw Object.assign(error('Email unconfirmed; inspect before retrying',502),{code:'EMAIL_UNCONFIRMED'});
  }
  const text=`From: ${e.From}\nTo: ${e.To}\n\n${e.Body||''}`;
  try{const result=await d.mail({from:{address:c.EMAIL_FROM},to:c.EMAIL_TO,subject:`SMS From: ${e.From} To: ${e.To}`,text});await d.set(key,{phase:'sent',result,at:Date.now()},604800);}
  catch(ex){await d.set(key,{phase:'uncertain',at:Date.now(),code:ex.code||ex.status||'SEND_UNCONFIRMED'},604800);throw error('Email unconfirmed; no automatic resend',502);}
  return empty();
 }
 if(e.mode==='preview'){
  if(!(c.ALLOWED_NUMBERS||'').split(',').includes(e.To)||!['incoming','connecting','unavailable'].includes(e.kind))throw error('Invalid preview');
  return d.speech(e.kind,e.From,e.To);
 }
 if(c.LIVE_CALLS_ENABLED!=='true')throw error('Voice actions disabled in isolated deployment',403);
 const parent=e.mode==='voice'?e.CallSid:e.parent;
 if(!/^CA[0-9a-f]{32}$/i.test(parent||''))throw error('Invalid parent');
 const key='call-'+parent,url=mode=>`https://${c.DOMAIN_NAME}/entry?mode=${mode}&parent=${parent}`;
 const response=()=>new Twilio.twiml.VoiceResponse();
 const hangup=()=>{const r=response();r.hangup();return r.toString();};
 const unavailable=()=>{const r=response();r.play(`https://${c.DOMAIN_NAME}${c.UNAVAILABLE_PATH}`);r.hangup();return r.toString();};
 const loop=mode=>{const r=response();r.pause({length:1});r.redirect({method:'POST'},url(mode));return r.toString();};
 const conference=start=>{const r=response();r.dial({action:url('end'),method:'POST'}).conference({beep:false,startConferenceOnEnter:start,endConferenceOnExit:true,maxParticipants:2,record:'do-not-record',waitUrl:start?'':url('wait'),waitMethod:'POST',statusCallback:url('event'),statusCallbackMethod:'POST',statusCallbackEvent:'join leave end'},`kmn-${parent}`);r.hangup();return r.toString();};
 const fail=async()=>{
  if(await d.create(key+'-decision',{value:'failed'},86400)){
   await d.update(parent,{Twiml:unavailable()});
   const child=await d.get(key+'-child');if(child)await d.update(child.sid,{Status:'completed'});
  }
  return hangup();
 };
 if(e.mode==='voice'){
  if(!(c.ALLOWED_NUMBERS||'').split(',').includes(e.To))throw error('Number not allowed');
  const real=await d.call(parent);
  if(real.direction!=='inbound'||!['ringing','in-progress'].includes(real.status)||real.from!==e.From||real.to!==e.To)throw error('Not matching active inbound call',403);
  await d.create(key,{from:e.From,to:e.To,started:Date.now()},86400);
  return conference(false);
 }
 const s=await d.get(key);if(!s)throw error('Unknown call',404);
 if(e.mode==='wait'){
  if(e.CallSid!==parent)throw error('Wrong caller',403);
  const decision=await d.get(key+'-decision');if(decision)return decision.value==='accepted'?loop('wait'):unavailable();
  if(Date.now()-s.started>120000)return fail();
  let child=await d.get(key+'-child');
  if(!child){
   if(Date.now()-s.started>60000)return fail();
   for(const kind of ['connecting','incoming']){const p=await d.speech(kind,s.from,s.to);if(p.status==='failed')return fail();if(p.status!=='ready')return loop('wait');}
   if(await d.create(key+'-dial',{at:Date.now()},86400)){
    child=await d.dial({To:c.DESTINATION,From:c.OUTBOUND_NUMBER,Timeout:25,Record:false,Url:url('answer'),Method:'POST',StatusCallback:url('status'),StatusCallbackMethod:'POST',StatusCallbackEvent:['ringing','answered','completed']});
    await d.set(key+'-child',{sid:child.sid},86400);
   }else return loop('wait');
  }
  if(await d.create(key+'-announced',{at:Date.now()},86400)){
   const p=await d.speech('connecting',s.from,s.to);if(p.status!=='ready')return fail();const r=response();r.play(p.url);r.pause({length:1});r.redirect({method:'POST'},url('wait'));return r.toString();
  }
  return loop('wait');
 }
 const child=await d.get(key+'-child');
 if(['answer','accept','status'].includes(e.mode)&&(!child||e.CallSid!==child.sid))throw error('Wrong child',403);
 if(e.mode==='answer'){
  if(await d.get(key+'-decision'))return hangup();
  const p=await d.speech('incoming',s.from,s.to);if(p.status!=='ready')return fail();
  await d.create(key+'-screening',{at:Date.now()},86400);
  const r=response();r.gather({input:'dtmf',numDigits:1,finishOnKey:'',timeout:10,actionOnEmptyResult:true,action:url('accept'),method:'POST'}).play(p.url);r.hangup();return r.toString();
 }
 if(e.mode==='accept'){
  if(!await d.get(key+'-screening'))throw error('Not screening',403);
  if(e.Digits!=='1')return fail();
  await d.create(key+'-decision',{value:'accepted'},86400);
  const decision=await d.get(key+'-decision');return decision.value==='accepted'?conference(true):hangup();
 }
 if(e.mode==='status'){
  if(['busy','no-answer','failed','canceled','completed'].includes(e.CallStatus))await fail();
  return empty();
 }
 if(e.mode==='event'||e.mode==='end'){
  if(e.mode==='end'||e.StatusCallbackEvent==='conference-end'||(e.StatusCallbackEvent==='participant-leave'&&e.CallSid===parent)){
   await d.create(key+'-decision',{value:'ended'},86400);
   if(child)await d.update(child.sid,{Status:'completed'});
  }
  return hangup();
 }
 throw error('Unknown mode');
}
module.exports={run,error};
