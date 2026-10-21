const assert=require('node:assert/strict');
const {CAPTION_PRESETS}=require('../uxp/src/caption-presets.js');
class FakeClassList{
 constructor(){this.items=new Set()}
 add(s){this.items.add(s)}remove(s){this.items.delete(s)}
 toggle(s,v){if(v===undefined)v=!this.items.has(s);if(v)this.add(s);else this.remove(s)}
 contains(s){return this.items.has(s)}
}
class El{
 constructor(id,attrs={}){this.id=id;this.attrs=attrs;this.style={};this.value='';this.textContent='';this.scrollTop=0;this.handlers={};this.classList=new FakeClassList();}
 addEventListener(type,fn){this.handlers[type]=fn}
 fire(type){this.handlers[type]?.()}
 getAttribute(name){return this.attrs[name]||null}
}
const names=['studioPresetPicker','studioCategory','studioWords','studioMotion','studioTextColor','studioAccent','studioSize','studioPosition','studioBg','studioOutline','studioSample','studioPresetCount','studioGallery','studioPreview','studioMeta','studioLibraryStatus','studioReplay','studioReplayState','studioSave','studioReset','studioSaved','workspaceMain','studioControlsScroll'];
const els={};for(const n of names)els[n]=new El(n);
for(let i=0;i<4;i++)els['studioWord'+i]=new El('studioWord'+i);
const cards=CAPTION_PRESETS.map((p,i)=>new El('preset'+i,{'data-preset-index':String(i),'data-preset-category':(p.category||(['fanchester','classic-white','football'].includes(p.id)?'sports':'social'))}));
const init={studioCategory:'all',studioWords:'2',studioMotion:'pop',studioTextColor:'#ffffff',studioAccent:'#ff475e',studioSize:'28',studioPosition:'bottom',studioBg:'none',studioOutline:'1',studioSample:'مانشستر يونايتد محتاج قرار جريء'};
for(const [k,v] of Object.entries(init))els[k].value=v;
global.document={getElementById:id=>els[id],querySelectorAll:selector=>selector==='[data-preset-index]'?cards:[]};
global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
require('../uxp/src/workspace.js').setupWorkspace();
assert.equal(els.studioMeta.textContent.includes('2 words'),true,'default should show two words');
assert.equal(els.studioWord0.textContent,'مانشستر');
assert.equal(els.studioWord1.textContent,'يونايتد');
assert.equal(els.studioWord2.style.display,'none');
assert.equal(cards.filter(x=>x.classList.contains('filtered-out')).length,0);
els.studioCategory.value='sports';els.studioCategory.fire('change');
assert.ok(cards.some(x=>x.classList.contains('filtered-out')),'category filters preset list');
assert.ok(cards.some(x=>!x.classList.contains('filtered-out')));
els.studioPresetPicker.value='6';els.studioPresetPicker.fire('change');
assert.equal(els.studioPresetPicker.value,'6');
els.studioReplay.fire('click');
assert.match(els.studioReplayState.textContent,/Starting/);
setTimeout(()=>{
 assert.match(els.studioReplayState.textContent,/2\/2/);
 console.log('PASS M2.3: 24 preset data, category filtering, pinned scroll routing, delayed smooth replay');
},900);
