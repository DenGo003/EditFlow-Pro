const assert = require('node:assert/strict');
const Module = require('module');
const original = Module._load;
const calls=[];
const mockFS={
 async getFileForOpening(opts){calls.push(opts);return {isFile:true,name:'fanchester.srt',nativePath:'G:\\EditFlowPro\\Outputs\\fanchester.srt',async read(){return '1\n00:00:00,000 --> 00:00:01,000\nمانشستر يونايتد\n\n2\n00:00:01,000 --> 00:00:02,000\nمحتاج تغيير\n'}}},
};
Module._load=function(request,parent,isMain){
 if(request==='uxp')return {storage:{localFileSystem:mockFS}};
 return original.apply(this,arguments);
};
const elements={};
for(const id of ['studioInspectCaptions','studioChooseSrt','studioApplyOverlay','studioSrtStatus','studioRenderStatus'])elements[id]={handlers:{},textContent:'',addEventListener(event,fn){this.handlers[event]=fn}};
global.document={getElementById:id=>elements[id]};
const {setupCaptionApply} = require('../uxp/src/caption-apply.js');
setupCaptionApply();
Promise.resolve(elements.studioChooseSrt.handlers.click()).then(()=>{
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0],{types:['srt'],allowMultiple:false});
 assert.match(elements.studioSrtStatus.textContent,/2 subtitle cues/);
 assert.equal(elements.studioRenderStatus.textContent,'');
 console.log('PASS: documented UXP SRT picker requested, valid SRT accepted, 2 cues read');
}).catch(err=>{console.error(err);process.exitCode=1});
