const assert=require('assert');
const {AutoConnector}=require('../uxp/src/autoconnect.js');
async function run(){
  assert.equal(AutoConnector.isTransientNetworkFailure('UXP network error: Network request failed'),true);
  assert.equal(AutoConnector.isTransientNetworkFailure('UXP fetch failed: Permission denied to the url. Manifest entry not found.'),false);
  assert.equal(AutoConnector.isTransientNetworkFailure('HTTP 401: pairing token is not accepted'),false);
  assert.equal(AutoConnector.isTransientNetworkFailure('UXP network error: Failed to fetch'),true);
  const readToken=async()=> 'a'.repeat(42);
  let healthCount=0, launched=0, reports=[];
  const c=new AutoConnector({client:{pair:()=>{},health:async()=>{healthCount++;if(healthCount===1)throw Error('UXP network error: Network request failed');return {version:'test'};}},readToken,launch:async()=>{launched++;},wait:async()=>{},report:s=>reports.push(s)});
  assert.equal((await c.connect()).version,'test');assert.equal(launched,0,'Retry should not launch if backend became reachable');
  healthCount=0;launched=0;
  const d=new AutoConnector({client:{pair:()=>{},health:async()=>{healthCount++;if(healthCount<=2)throw Error('UXP network error: Network request failed');return {version:'test'};}},readToken,launch:async()=>{launched++;},wait:async()=>{},report:s=>reports.push(s)});
  assert.equal((await d.connect()).version,'test');assert.equal(launched,1,'Launch expected when first two probes are unavailable');
  const e=new AutoConnector({client:{pair:()=>{},health:async()=>{throw Error('HTTP 401: invalid pairing token');}},readToken,launch:async()=>{throw Error('should not launch');},wait:async()=>{},report:()=>{}});
  await assert.rejects(e.connect(),/HTTP 401/);
  console.log('PASS: transient UXP network error retry, launcher fallback, auth failure preservation');
}
run().catch(e=>{console.error(e);process.exitCode=1});
