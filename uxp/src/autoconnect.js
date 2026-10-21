// Never expose a pairing secret in diagnostics or logs.
class AutoConnector {
  constructor({client, readToken, launch, wait, report, attempts=10}) {
    Object.assign(this,{client,readToken,launch,wait,report,attempts});
  }
  async probe() {
    let raw;
    try { raw=await this.readToken(); }
    catch(e) { throw Error('Cannot read pairing-token.txt from the selected folder. Check folder permission.'); }
    const token=String(raw).trim();
    if(!/^[A-Za-z0-9_-]{40,200}$/.test(token)) throw Error('Pairing file is empty or invalid. Re-select the EditFlowPro folder.');
    this.client.pair(token);
    return this.client.health();
  }
  static isTransientNetworkFailure(message) {
    const msg=String(message||'');
    if(/permission denied|manifest entry not found|not allowed|cors|http 401|http 403|pairing/i.test(msg))return false;
    return /network request failed|failed to fetch|networkerror|econnrefused|connection refused|unreachable|timed out|timeout|socket hang up/i.test(msg);
  }
  async connect() {
    this.report('Checking existing backend…');
    let firstError;
    try { return await this.probe(); } catch(e) { firstError=e; }
    // Premiere UXP's fetch() reports an OFFLINE backend as 'Network request failed'.
    // Never interpret HTTP 401, CORS or manifest permission failures as offline.
    if(!AutoConnector.isTransientNetworkFailure(firstError.message)) {
      throw Error('Backend connection rejected: '+firstError.message);
    }
    this.report('Backend is not reachable from UXP. Checking once more before launch…');
    try { await this.wait(500); return await this.probe(); }
    catch(e) {
      firstError=e;
      if(!AutoConnector.isTransientNetworkFailure(e.message))
        throw Error('Backend connection rejected: '+e.message);
    }
    this.report('Starting local backend… Approve the Adobe launch dialog, then leave its window open.');
    try { const result=await this.launch(); if(result) throw Error(String(result)); }
    catch(e) { throw Error('Backend launch failed: '+e.message); }
    for(let i=0;i<this.attempts;i++) {
      await this.wait(1000);
      try { return await this.probe(); }
      catch(e) {
        firstError=e;
        if(!AutoConnector.isTransientNetworkFailure(e.message))
          throw Error('Backend connection rejected: '+e.message);
        this.report('Waiting for local backend ('+(i+1)+'/'+this.attempts+') · '+e.message);
      }
    }
    throw Error('Backend not reachable after launch. Check the launcher window for a startup error. Last request: '+firstError.message);
  }
}
module.exports={AutoConnector};
