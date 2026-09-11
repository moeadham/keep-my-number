const {parsePhoneNumberFromString}=require('libphonenumber-js/max');
const digits='zero one two three four five six seven eight nine'.split(' ');
function spokenNumber(n){if(!/^\+[1-9]\d{1,14}$/.test(n||''))return 'unknown number';const p=parsePhoneNumberFromString(n);if(!p?.isValid()||p.number!==n)return 'unknown number';const g=p.formatInternational().match(/\d+/g);if(g.join('')!==n.slice(1))return 'unknown number';return 'plus '+g.map(x=>[...x].map(d=>digits[Number(d)]).join(' ')).join(' [break] ');}
function promptText(k,f,t){if(k==='connecting')return `You are being connected to: ${spokenNumber(t)}.`;if(k==='incoming')return `Incoming call from ${spokenNumber(f)} to ${spokenNumber(t)}, press 1 to connect, or hang up instead.`;if(k==='unavailable')return 'The person you are calling is unavailable. Please try again later.';throw Error('Invalid prompt');}
module.exports={spokenNumber,promptText};
