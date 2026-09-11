exports.handler = async function(context,event,callback) {
 try {
  const mode=event.mode==='sms'?'sms':'start';
  const url=context.WORKER_ORIGIN+'/'+mode;
  const p={};for(const [k,v] of Object.entries(event))if(k!=='request'&&k!=='mode'&&typeof v==='string')p[k]=v;
  p.AccountSid=context.ACCOUNT_SID;
  const signature=require('crypto').createHmac('sha1',context.FORWARDER_TOKEN).update(url+Object.keys(p).sort().map(k=>k+p[k]).join('')).digest('base64');
  const body=new URLSearchParams(p).toString();
  const result=await new Promise((resolve,reject)=>{const r=require('https').request(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':signature}},res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,text}));});r.on('error',reject);r.setTimeout(8000,()=>r.destroy(new Error('Upstream timeout')));r.end(body);});
  const response=new Twilio.Response();response.setStatusCode(result.status);response.appendHeader('Content-Type','text/xml');response.setBody(result.text);callback(null,response);
 }catch(error){callback(new Error('Forwarding entrypoint failed'));}
};
