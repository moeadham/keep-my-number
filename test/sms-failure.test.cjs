const {test}=require('node:test');const a=require('node:assert/strict');const {run}=require('../src/app.cjs');
const c={ACCOUNT_SID:'AC'+'a'.repeat(32),ALLOWED_NUMBERS:'+12025550124',EMAIL_FROM:'sms@example.com',EMAIL_TO:'owner@example.com'};
const e={AccountSid:c.ACCOUNT_SID,mode:'sms',To:c.ALLOWED_NUMBERS,From:'+12025550123',MessageSid:'SM'+'c'.repeat(32),Body:'Preserve me'};
test('missing email token fails before dedup claim so repaired configuration can retry',async()=>{let claims=0;await a.rejects(run(c,e,{create:async()=>{claims++;return true},mail:async()=>{throw Error('must not send')},set:async()=>{}}),x=>x.code==='CF_EMAIL_API_TOKEN_MISSING');a.equal(claims,0)});
test('uncertain email duplicate remains visibly unconfirmed without resend',async()=>{let sends=0;await a.rejects(run({...c,CF_EMAIL_API_TOKEN:'test'},e,{create:async()=>false,get:async()=>({phase:'uncertain'}),mail:async()=>{sends++}}),x=>x.status===502);a.equal(sends,0)});
