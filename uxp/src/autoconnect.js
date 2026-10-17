// No clipboard or unauthenticated token endpoint. Read only the user-authorized folder.
class AutoConnector {
  constructor({client, readToken, launch, wait, report, attempts=30}) {
    Object.assign(this,{client,readToken,launch,wait,report,attempts});
  }
  async probe() {
    const token=String(await this.readToken()).trim();
    if(!/^[A-Za-z0-9_-]{40,200}$/.test(token))throw Error('Invalid pairing file.');
    this.client.pair(token);
    return this.client.health();
  }
  async connect() {
    this.report('Checking existing backend…');
    try { return await this.probe(); } catch (_) {}
    this.report('Starting backend… Approve the Adobe launch dialog if shown.');
    const error=await this.launch();
    if(error)throw Error('Backend launch was denied or failed.');
    for(let i=0;i<this.attempts;i++) {
      await this.wait(1000);
      try { return await this.probe(); } catch (_) {}
    }
    throw Error('Backend did not authenticate. Check the launcher window; launching alone is not a successful connection.');
  }
}
module.exports={AutoConnector};
