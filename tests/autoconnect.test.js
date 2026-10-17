const {test}=require('node:test');
const assert=require('node:assert/strict');
const {AutoConnector}=require('../uxp/src/autoconnect');
const token='a'.repeat(43);
function fixture(overrides={}) {
 const calls={launch:0,health:0,read:0,pair:[]};
 const args={client:{pair:t=>calls.pair.push(t),health:async()=>{calls.health++;return {version:'test'};}},
 readToken:async()=>{calls.read++;return token;},launch:async()=>{calls.launch++;return '';},wait:async()=>{},report:()=>{},attempts:3,...overrides};
 return {calls,args,connector:new AutoConnector(args)};
}
test('already authenticated backend is reused without launching',async()=>{
 const f=fixture();assert.deepEqual(await f.connector.connect(),{version:'test'});assert.equal(f.calls.launch,0);assert.deepEqual(f.calls.pair,[token]);
});
test('launch is followed by authentication; pairing file re-read on retry',async()=>{
 let count=0;const paired=[];
 const f=fixture({readToken:async()=> (++count===1?token:'b'.repeat(43)),client:{pair:t=>paired.push(t),health:async()=>{if(count===1)throw Error('offline');return {version:'ready'};}}});
 assert.equal((await f.connector.connect()).version,'ready');assert.equal(f.calls.launch,1);assert.deepEqual(paired,[token,'b'.repeat(43)]);
});
test('launch success alone never counts as connected',async()=>{
 const f=fixture({client:{pair:()=>{},health:async()=>{throw Error('offline');}}});
 await assert.rejects(f.connector.connect(),/did not authenticate/);assert.equal(f.calls.launch,1);assert.equal(f.calls.read,4);
});
test('launch denied stops without retrying',async()=>{
 let healthCalls=0;const f=fixture({client:{pair:()=>{},health:async()=>{healthCalls++;throw Error('offline');}},launch:async()=> 'User denied'});
 await assert.rejects(f.connector.connect(),/denied/);assert.equal(healthCalls,1);
});
test('token file created during startup is picked up',async()=>{
 let count=0;const f=fixture({readToken:async()=>{if(++count===1)throw Error('file missing');return token;}});
 await f.connector.connect();assert.equal(f.calls.launch,1);assert.equal(f.calls.health,1);
});
test('invalid token content is not sent or surfaced',async()=>{
 const f=fixture({readToken:async()=>'{"private":"value"}'});
 await assert.rejects(f.connector.connect(),/did not authenticate/);assert.equal(f.calls.health,0);assert.deepEqual(f.calls.pair,[]);
});
