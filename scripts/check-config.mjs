import fs from 'node:fs';
import {parsePhoneNumberFromString} from 'libphonenumber-js/max';
const c=JSON.parse(fs.readFileSync('wrangler.json'));const v=c.vars;
for(const key of ['FORWARD_TO','OUTBOUND_FROM']){
 const n=v[key];if(!/^\+[1-9]\d{1,14}$/.test(n)||parsePhoneNumberFromString(n)?.number!==n||!parsePhoneNumberFromString(n)?.isValid())throw Error(`Invalid ${key}`);
}
const allowed=JSON.parse(v.ALLOWED_NUMBERS);
if(!allowed.length||!allowed.includes(v.OUTBOUND_FROM)||allowed.includes(v.FORWARD_TO))throw Error('Check inbound allowlist, outbound caller ID, and forwarding loop');
for(const n of allowed)if(!/^\+[1-9]\d{1,14}$/.test(n)||!parsePhoneNumberFromString(n)?.isValid())throw Error('Invalid allowed number');
if(!v.TTS_VOICE||!/^AC[a-f0-9]{32}$/.test(v.TWILIO_ACCOUNT_SID)||/^AC0+$/.test(v.TWILIO_ACCOUNT_SID))throw Error('Set your account SID and licensed voice');
if(new URL(v.PUBLIC_ORIGIN).protocol!=='https:'||v.PUBLIC_ORIGIN.endsWith('/')||v.PUBLIC_ORIGIN.includes('example.com'))throw Error('Set canonical HTTPS Worker origin, without trailing slash');
for(const key of ['EMAIL_FROM','EMAIL_TO'])if(!v[key]||v[key].endsWith('@example.com'))throw Error(`Set ${key}`);
if(!c.send_email[0].allowed_sender_addresses.includes(v.EMAIL_FROM)||!c.send_email[0].allowed_destination_addresses.includes(v.EMAIL_TO))throw Error('Email binding restrictions must match vars');
const audio=JSON.parse(fs.readFileSync('src/audio.json'));
if(!audio.unavailable?.data)throw Error('Run npm run audio before deployment');
console.log('Configuration and static audio ready');
