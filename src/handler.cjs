const {run}=require('./app.cjs');const {io}=require('./io.cjs');
// Deploy PROTECTED, never public: Twilio verifies X-Twilio-Signature before invocation.
exports.handler=async function(context,event,callback){
 const response=new Twilio.Response();response.appendHeader('Cache-Control','no-store');
 try{const result=await run(context,event,io(context));response.setStatusCode(200);response.appendHeader('Content-Type',typeof result==='string'?'text/xml':'application/json');response.setBody(result);}
 catch(ex){response.setStatusCode(ex.status||503);response.appendHeader('Content-Type','application/json');response.setBody({error:ex.status===403?'Forbidden':'Operation unconfirmed',code:ex.code||'RETRY_OR_INSPECT'});}
 // Every promise has settled here; nothing is started after callback.
 callback(null,response);
};
