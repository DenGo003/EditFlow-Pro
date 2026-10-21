const {CAPTION_PRESETS}=require('./caption-presets.js');
function setupWorkspace(){
 const $=id=>document.getElementById(id), STORE='editflow.captionstudio.preset.v1';
 const groups={home:['home'],sync:['sync'],cut:['cut'],subs:['subs'],studio:['studio'],zoom:['zoom'],color:['color'],motion:['motion'],sfx:['sfx'],markers:['markers'],update:['update'],diag:['connection','timeline','diag','bounds']};
 function route(id){
   if(!groups[id])return;
   for(const b of document.querySelectorAll('[data-panel]'))b.classList.toggle('active',b.getAttribute('data-panel')===id);
   for(const s of document.querySelectorAll('main [data-section]'))s.classList.toggle('visible',groups[id].includes(s.getAttribute('data-section')));
   $('workspaceMain').classList.toggle('studio-mode',id==='studio');
   $('workspaceMain').scrollTop=0;
   if(id==='studio' && $('studioControlsScroll'))$('studioControlsScroll').scrollTop=0;
 }
 for(const b of document.querySelectorAll('[data-panel]'))b.addEventListener('click',()=>route(b.getAttribute('data-panel')));
 for(const b of document.querySelectorAll('[data-jump]'))b.addEventListener('click',()=>route(b.getAttribute('data-jump')));
 const ids=['studioCategory','studioWords','studioMotion','studioTextColor','studioAccent','studioSize','studioPosition','studioBg','studioOutline','studioSample'];
 const picker=$('studioPresetPicker'), cards=Array.from(document.querySelectorAll('[data-preset-index]'));
 let chosen=0, run=0, timer=null;
 const clamp=(a,min,max)=>Math.max(min,Math.min(max,a));
 function selected(){return CAPTION_PRESETS[chosen]||CAPTION_PRESETS[0];}
 function stop(){run++;if(timer!==null)clearTimeout(timer);timer=null;$('studioReplay').textContent='▶ Replay animation';}
 function displayedWords(){let s=String($('studioSample').value||'').trim();let n=$('studioWords').value==='auto'?3:Number($('studioWords').value);return s?s.split(/\s+/).filter(Boolean).slice(0,clamp(n,1,4)):[];}
 function paintWords(count=-1){
   const arr=displayedWords(),p=selected(),root=$('studioPreview');
   root.style.fontSize=String($('studioSize').value||'28')+'px';
   root.style.background=['box','pill'].includes($('studioBg').value)?'#080b12':'transparent';
   root.style.borderRadius=$('studioBg').value==='pill'?'25px':'5px';
   root.style.margin=$('studioPosition').value==='middle'?'auto 0':'auto 0';
   root.style.textAlign='center';root.style.direction='rtl';
   for(let i=0;i<4;i++){
     const w=$('studioWord'+i);if(!w)continue;
     w.textContent=arr[i]||'';
     w.style.display=i<arr.length?'inline-block':'none';
     w.style.color=i===arr.length-1?$('studioAccent').value:$('studioTextColor').value;
     w.style.textShadow=p.shadow&&p.shadow!=='none'?p.shadow:'0 2px 4px black';
     w.style.transition='none';
     w.style.opacity=(count===-1||i<count)?'1':'0';
     w.style.transform=(count!==-1&&i>=count)
       ? ($('studioMotion').value==='pop'?'scale(.78)':$('studioMotion').value==='bounce'?'translateY(16px)':$('studioMotion').value==='slide'?'translateY(14px)':'scale(1)')
       : 'translateY(0) scale(1)';
     w.style.webkitTextStroke=$('studioOutline').value+'px #151619';
     w.style.background=$('studioBg').value==='word'?'#070a10':'transparent';
   }
   $('studioMeta').textContent=p.name+' · '+arr.length+' word'+(arr.length===1?'':'s')+' · '+$('studioMotion').value;
 }
 function gallery(){
   const cat=$('studioCategory').value;let total=0;
   for(const b of cards){
     const i=Number(b.getAttribute('data-preset-index'));
     const ok=cat==='all'||b.getAttribute('data-preset-category')===cat;
     if(ok){b.classList.remove('filtered-out');total++;}else b.classList.add('filtered-out');
     if(i===chosen)b.classList.add('selected');else b.classList.remove('selected');
   }
   $('studioLibraryStatus').textContent=total+' styles visible · '+CAPTION_PRESETS.length+' total · tap a preset to preview it.';
   $('studioPresetCount').textContent=String(CAPTION_PRESETS.length);
 }
 function select(i){
   if(!CAPTION_PRESETS[i])return;stop();chosen=i;picker.value=String(i);
   const p=selected();$('studioTextColor').value=/^#[a-fA-F0-9]{6}$/.test(p.color)?p.color:'#ffffff';
   $('studioAccent').value=['yellow-key','hormozi','football','comic','karaoke','highlight-box'].includes(p.id)?'#ffde49':p.id==='fanchester'||p.id==='news'?'#f24857':'#ffb74d';
   $('studioSize').value=String(clamp(Number(p.fontSize)||28,16,42));
   $('studioBg').value=['black-box','highlight-box'].includes(p.id)?'box':p.id==='glass'?'pill':'none';
   $('studioPosition').value=p.id==='vertical'?'middle':'bottom';
   $('studioMotion').value=['karaoke','cinematic','documentary','minimal','classic-white'].includes(p.id)?'fade':['comic','mrbeast'].includes(p.id)?'bounce':'pop';
   gallery();paintWords();$('studioReplayState').textContent='Selected '+p.name+' · Replay to see the word reveal.';
 }
 function replay(){
   stop();paintWords(0);const arr=displayedWords();if(!arr.length){$('studioReplayState').textContent='Enter a preview phrase first.';return;}
   const thisRun=run,motion=$('studioMotion').value;
   $('studioReplay').textContent='▶ Playing';
   $('studioReplayState').textContent='Starting · '+motion;
   let frame=0;
   function tick(){
     if(thisRun!==run)return;
     if(frame>=arr.length){paintWords();$('studioReplayState').textContent='Finished '+arr.length+' word'+(arr.length===1?'':'s')+'. Replay any time.';$('studioReplay').textContent='▶ Replay animation';timer=null;return;}
     const w=$('studioWord'+frame);
     w.style.transition=motion==='none'?'none':'opacity 260ms ease-out, transform 380ms cubic-bezier(.2,.9,.3,1.15)';
     w.style.opacity='1';w.style.transform='translateY(0) scale(1)';
     frame++;$('studioReplayState').textContent='Playing · '+frame+'/'+arr.length+' words · '+motion;
     timer=setTimeout(tick,motion==='none'?460:720);
   }
   // A frame boundary is required for UXP to paint the hidden pose before reveal.
   timer=setTimeout(tick,90);
 }
 for(const id of ids){$(id).addEventListener('change',()=>{stop();if(id==='studioCategory')gallery();paintWords();});}
 picker.addEventListener('change',()=>select(Number(picker.value)));
 for(const b of cards)b.addEventListener('click',()=>select(Number(b.getAttribute('data-preset-index'))));
 $('studioSample').addEventListener('input',()=>{stop();paintWords();});
 $('studioReplay').addEventListener('click',replay);
 $('studioSave').addEventListener('click',()=>{let settings={preset:selected().id};for(const id of ids)settings[id]=$(id).value;
   try{localStorage.setItem(STORE,JSON.stringify(settings));$('studioSaved').textContent='Preset saved ✓ · '+selected().name;}catch(e){$('studioSaved').textContent='Could not save preset: '+(e.message||e);}
 });
 $('studioReset').addEventListener('click',()=>{stop();try{localStorage.removeItem(STORE);}catch(_){}
   for(const [id,val] of Object.entries({studioCategory:'all',studioWords:'2',studioMotion:'pop',studioTextColor:'#ffffff',studioAccent:'#f24857',studioSize:'28',studioBg:'none',studioOutline:'1',studioPosition:'bottom',studioSample:'مانشستر يونايتد محتاج قرار جريء'}))$(id).value=val;
   chosen=0;picker.value='0';gallery();paintWords();$('studioReplayState').textContent='Reset to defaults.';
 });
 try{const saved=JSON.parse(localStorage.getItem(STORE)||'null');if(saved&&typeof saved==='object'){
   const idx=CAPTION_PRESETS.findIndex(p=>p.id===saved.preset);if(idx>=0)chosen=idx;
   for(const id of ids)if(typeof saved[id]==='string'&&$(id))$(id).value=saved[id];
 }}catch(_){}
 // The preview and library are present as static HTML before this code runs.
 picker.value=String(chosen);gallery();paintWords();route('home');
}
module.exports={setupWorkspace};
