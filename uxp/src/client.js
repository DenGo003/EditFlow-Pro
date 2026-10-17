// Deliberately fixed loopback origin. Never persist or log the pairing secret.
class BackendClient {
  constructor(transport, timeout=10000) { this.transport=transport; this.timeout=timeout; this.token=''; }
  pair(token) { this.token=String(token).trim(); if (!this.token) throw Error('Enter the backend pairing token.'); }
  async request(path, body) {
    if (!this.token) throw Error('Pair the backend first.');
    let timer;
    const operation=(async()=>{
      const response=await this.transport('http://127.0.0.1:8765'+path, {
        method:body===undefined?'GET':'POST', redirect:'error',
        headers:{Authorization:'Bearer '+this.token, ...(body===undefined?{}:{'Content-Type':'application/json'})},
        ...(body===undefined?{}:{body:JSON.stringify(body)})
      });
      if (response.status===401) throw Error('Pairing expired or invalid. Enter the current backend token.');
      if (!response.ok) throw Error('Backend request failed (HTTP '+response.status+').');
      let data; try { data=await response.json(); } catch (_) { throw Error('Backend returned invalid JSON.'); }
      return data;
    })();
    try { return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Backend timed out. A submitted job may still be running; check before retrying.')),this.timeout);})]); }
    finally { clearTimeout(timer); }
  }
  async health() {
    const h=await this.request('/health');
    if (!h || typeof h.version!=='string' || ['ffmpeg','ffprobe','model_ready'].some(k=>typeof h[k]!=='boolean')) throw Error('Unexpected EditFlow health response.');
    return h;
  }
  async start(kind,data) {
    if (!['analyze','transcribe','sync'].includes(kind)) throw Error('Operation not enabled in this preview.');
    const j=await this.request('/jobs',{...data,kind}); this.checkId(j.id); return j.id;
  }
  checkId(id) { if (!/^[a-f0-9]{32}$/.test(id)) throw Error('Invalid job ID.'); }
  async job(id) { this.checkId(id); const j=await this.request('/jobs/'+id); if(j.id!==id || !['queued','running','complete','failed','cancelled'].includes(j.state)) throw Error('Invalid job response.'); return j; }
  cancel(id) { this.checkId(id); return this.request('/cancel',{id}); }
}
module.exports={BackendClient};
