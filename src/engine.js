import {smsEmail,xml,play,conferenceXml,answerXml,accepted} from './core.js';
export class Engine {
 constructor(d){this.d=d;}
 get(){return this.d.load('call');}
 put(s){this.d.save('call',s);return s;}
 url(path){return `${this.d.origin}/${path}?parent=${this.get().parent}`;}
 caller(){const s=this.get();return conferenceXml(`pf-${s.parent}`,this.url('wait'),this.url('end'),this.url('event'),false);}
 async sms(p){
  const old=this.d.load('sms');if(old)return old;
  this.d.save('sms',{status:'sending',at:this.d.now()});
  try{const result=await this.d.mail(smsEmail(p,this.d.email));const record={status:'sent',at:this.d.now(),result};this.d.save('sms',record);return record;}
  catch(error){this.d.save('sms',{status:'uncertain',at:this.d.now(),code:error.code||'SEND_UNCONFIRMED',errorName:error.name,errorMessage:error.message});throw new Error('Email send unconfirmed; automatic resend disabled to prevent duplicates');}
 }
 async start(p){
  if(this.get())return this.caller();
  if(!this.d.allowed.includes(p.To))throw new Error('Number not allowed');
  this.put({parent:p.CallSid,from:p.From,to:p.To,phase:'validating'});
  const call=await this.d.inspectCall(p.CallSid);
  if(call.direction!=='inbound'||!['ringing','in-progress'].includes(call.status)||call.from!==p.From||call.to!==p.To){this.put({...this.get(),phase:'invalid'});throw new Error('Not an active matching inbound call');}
  this.d.prewarm(p.From,p.To);
  this.put({...this.get(),phase:'waiting'});await this.d.alarm(this.d.now()+90000);return this.caller();
 }
 async wait(){
  let s=this.get();
  if(s.phase==='waiting'){
   this.put({...s,phase:'dialing'});
   const call=await this.d.dial({To:this.d.destination,From:this.d.from,Timeout:25,Record:false,Url:this.url('answer'),Method:'POST',StatusCallback:this.url('status'),StatusCallbackMethod:'POST',StatusCallbackEvent:['ringing','answered','completed']});
   s=this.put({...this.get(),child:call.sid});
  }
  s=this.get();
  if(s.phase==='ringing'||s.phase==='screening'){
   if(!s.announced){
    const speech=await this.d.speech('connecting',s.from,s.to);
    if(speech.status==='failed'){await this.fail();return xml('<Hangup/>');}
    if(speech.status==='ready'){this.put({...s,announced:true});return xml(play([speech.url])+'<Pause length="1"/>'+`<Redirect method="POST">${this.url('wait')}</Redirect>`);}
   }
  }
  return xml(`<Pause length="1"/><Redirect method="POST">${this.url('wait')}</Redirect>`);
 }
 async status(p){const s=this.get();if(!s||p.CallSid!==s.child)return;
  if(p.CallStatus==='ringing'&&s.phase==='dialing'){this.put({...s,phase:'ringing',ringDeadline:this.d.now()+25000});await this.d.alarm(this.d.now()+25000);}
  if(['busy','no-answer','failed','canceled','completed'].includes(p.CallStatus)&&!['accepted','ended'].includes(s.phase))await this.fail();
 }
 async unavailable(){return xml(play([await this.d.audio(['unavailable'])])+'<Hangup/>');}
 async fail(){
  const s=this.get();if(!s||['accepted','ended','invalid'].includes(s.phase))return;
  this.put({...s,phase:'failed'});
  await this.d.update(s.parent,{Twiml:await this.unavailable()});
  if(s.child)await this.d.update(s.child,{Status:'completed'});
  await this.d.alarm(this.d.now()+86400000);
 }
 async answer(p){
  const s=this.get();if(!s||s.child!==p.CallSid)throw new Error('Wrong child');
  if(!['dialing','ringing','screening'].includes(s.phase))return xml('<Hangup/>');
  if(s.phase!=='screening'){
   this.put({...s,phase:'screening',speechDeadline:this.d.now()+22000,screenDeadline:this.d.now()+90000});
   await this.d.alarm(this.d.now()+90000);
  }
  const speech=await this.d.speech('incoming',s.from,s.to);
  if(speech.status==='failed'||(speech.status!=='ready'&&this.get().speechDeadline<=this.d.now())){await this.fail();return xml('<Hangup/>');}
  if(speech.status!=='ready')return xml(`<Pause length="1"/><Redirect method="POST">${this.url('answer')}</Redirect>`);
  return answerXml([speech.url],this.url('accept'));
 }
 async accept(p){
  const s=this.get();if(!s||s.child!==p.CallSid)throw new Error('Wrong child');
  if(s.phase!=='screening'&&s.phase!=='accepted')return xml('<Hangup/>');
  if(!accepted(p.Digits)){await this.fail();return xml('<Hangup/>');}
  this.put({...s,phase:'accepted'});await this.d.alarm(this.d.now()+86400000);
  return conferenceXml(`pf-${s.parent}`,'',this.url('end'),this.url('event'),true);
 }
 async event(p){const s=this.get();if(!s)return;
  if((p.CallSid===s.parent&&p.StatusCallbackEvent==='participant-leave')||p.StatusCallbackEvent==='conference-end'){
   const prior=s.phase;this.put({...s,phase:'ended'});
   if(s.child&&prior!=='accepted')await this.d.update(s.child,{Status:'completed'});
   await this.d.alarm(this.d.now()+86400000);
  }
 }
 async alarm(){
  const s=this.get();if(!s)return;
  if(['failed','ended','invalid','accepted'].includes(s.phase))return;
  if(s.phase==='screening'&&s.screenDeadline>this.d.now()){await this.d.alarm(s.screenDeadline);return;}
  if(s.phase==='ringing'&&s.ringDeadline>this.d.now()){await this.d.alarm(s.ringDeadline);return;}
  await this.fail();
 }
}
