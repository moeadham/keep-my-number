import {parsePhoneNumberFromString} from 'libphonenumber-js/max';
const digits='zero one two three four five six seven eight nine'.split(' ');
export function spokenNumber(number){
 // Never silently repair the source token. Unknown/withheld callers are safe words, not TTS input.
 if(!/^\+[1-9]\d{1,14}$/.test(number||''))return 'unknown number';
 const parsed=parsePhoneNumberFromString(number);
 if(!parsed?.isValid()||parsed.number!==number)return 'unknown number';
 const groups=parsed.formatInternational().match(/\d+/g);
 if(groups.join('')!==number.slice(1))return 'unknown number';
 return 'plus '+groups.map(g=>[...g].map(d=>digits[Number(d)]).join(' ')).join(' [break] ');
}
export function promptText(kind,from,to){
 if(kind==='connecting')return `You are being connected to: ${spokenNumber(to)}.`;
 if(kind==='incoming')return `Incoming call from ${spokenNumber(from)} to ${spokenNumber(to)}, press 1 to connect, or hang up instead.`;
 throw new Error('Unknown prompt kind');
}
export const escapeXml = s => String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function smsEmail(p,config){
 const text=`From: ${p.From}\nTo: ${p.To}\n\n${p.Body}`;
 return {from:config.EMAIL_FROM,to:config.EMAIL_TO,subject:`SMS From: ${p.From} To: ${p.To}`,text,html:`<pre>${escapeXml(text)}</pre>`};
}
export const xml = body => `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
export const play = urls => urls.map(u=>`<Play>${escapeXml(u)}</Play>`).join('');
export const accepted = digit => digit==='1';
export function promptParts(kind,from,to){
 const number=n=>/^\+[1-9]\d{1,14}$/.test(n)?['plus',...n.slice(1)]:['unknown'];
 return kind==='connecting'?['connecting',...number(from)]:['incoming',...number(from),'to',...number(to),'accept'];
}
export const answerXml=(urls,action)=>xml(`<Gather input="dtmf" numDigits="1" finishOnKey="" timeout="10" actionOnEmptyResult="true" action="${escapeXml(action)}" method="POST">${play(urls)}</Gather><Hangup/>`);
export const conferenceXml=(room,wait,end,event,start)=>xml(`<Dial action="${escapeXml(end)}" method="POST"><Conference beep="false" startConferenceOnEnter="${start}" endConferenceOnExit="true" maxParticipants="2" record="do-not-record" waitUrl="${escapeXml(wait)}" waitMethod="POST" statusCallback="${escapeXml(event)}" statusCallbackMethod="POST" statusCallbackEvent="join leave end">${escapeXml(room)}</Conference></Dial><Hangup/>`);
