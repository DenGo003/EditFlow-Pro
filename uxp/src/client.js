// EditFlow UXP local-only client. Do not log the pairing token.
class BackendClient {
  constructor(transport, timeout=10000) { this.transport=transport; this.timeout=timeout; this.token=''; }
  pair(token) { this.token=String(token).trim(); if (!this.token) throw Error('Enter the backend pairing token.'); }
  async request(path, body, timeoutMs=this.timeout) {
    if (!this.token) throw Error('Pair the backend first.');
    let timer;
    const operation=(async()=>{
      let response;
      try { response=await this.transport('http://127.0.0.1:8765'+path, {
        method:body===undefined?'GET':'POST', redirect:'error',
        headers:{Authorization:'Bearer '+this.token, ...(body===undefined?{}:{'Content-Type':'application/json'})},
        ...(body===undefined?{}:{body:JSON.stringify(body)})
      }); } catch(e) { throw Error('UXP network error: '+String(e&&e.message||e).slice(0,160)); }
      if(response.status===401)throw Error('HTTP 401: pairing token is not accepted by running backend.');
      if(!response.ok){let detail='';try{const d=await response.json();detail=String(d.error||'').slice(0,240);}catch(_){}throw Error('HTTP '+response.status+(detail?': '+detail:''));}
      try{return await response.json();}catch(_){throw Error('Backend returned invalid JSON.');}
    })();
    try { return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Backend request timeout; operation may still be active.')),timeoutMs);})]); }
    finally {clearTimeout(timer);}
  }
  async health() {const h=await this.request('/health');if(!h||typeof h.version!=='string')throw Error('Unexpected health response.');return h;}
  checkId(id){if(!/^[a-f0-9]{32}$/.test(id))throw Error('Invalid job ID.');}
  async start(kind,data){if(!['analyze','export','transcribe','sync','timeline_cut','timeline_caption','sequence_caption','visual_ai'].includes(kind))throw Error('Unsupported job kind.');const j=await this.request('/jobs',{...data,kind});this.checkId(j.id);return j.id;}
  async job(id){this.checkId(id);const j=await this.request('/jobs/'+id);if(j.id!==id||!['queued','running','complete','failed','cancelled'].includes(j.state))throw Error('Invalid job response.');return j;}
  cancel(id){this.checkId(id);return this.request('/cancel',{id});}
}
module.exports={BackendClient};
