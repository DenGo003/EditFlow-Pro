'use strict';
function sanitize(value,secret=''){
 if(typeof value==='string'){
  let text=secret?value.split(secret).join('[REDACTED]'):value;
  return text.replace(/Bearer\s+[A-Za-z0-9._-]+/gi,'Bearer [REDACTED]')
   .replace(/[A-Za-z]:[\\/][^\r\n"<>|]*/g,'[LOCAL_PATH]');
 }
 if(Array.isArray(value))return value.map(x=>sanitize(x,secret));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,/token|authorization|secret/i.test(k)?'[REDACTED]':sanitize(v,secret)]));
 return value;
}
async function collect({uxp,client,visual,ppro,panes,events}){
 const report={schema:1,release:'0.9.6',targetPremiere:'25.6.2',createdAt:new Date().toISOString(),host:{name:uxp.host&&uxp.host.name,version:uxp.host&&uxp.host.version},visualAcceptance:'pending-user-fx-toggle',panes,events};
 try{report.backend=await client.health();}catch(e){report.backend={error:String(e.message||e)};}
 try{report.colorInspection=await visual.inspectColorParamsOnTop(ppro);}catch(e){report.colorInspection={error:String(e.message||e)};}
 report.capabilities={Project:!!ppro.Project,SequenceEditor:!!ppro.SequenceEditor,TickTime:!!ppro.TickTime,VideoFilterFactory:!!ppro.VideoFilterFactory};
 return sanitize(report,client.token);
}
module.exports={sanitize,collect};
