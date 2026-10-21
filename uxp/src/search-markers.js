// Transcript search and undoable sequence markers for Premiere Pro 25.6.2.
// Generated transcripts use Whisper word timestamps; imported SRT is cue-timed.
const MAX_RESULTS=50;
const MARKER_PREFIX='EF Search · ';

function normalized(value){
 return String(value||'').normalize('NFKC').toLowerCase()
  .replace(/[\u064B-\u065F\u0670\u0640]/g,'')
  .replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي')
  .replace(/[^a-z0-9\u0621-\u064a\u0660-\u0669]+/g,' ').trim().replace(/\s+/g,' ');
}
function srtTime(value){
 const m=/^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(value);
 if(!m||Number(m[2])>59||Number(m[3])>59)throw Error('Invalid SRT timestamp: '+value);
 return Number(m[1])*3600+Number(m[2])*60+Number(m[3])+Number(m[4])/1000;
}
function parseSrt(value){
 if(typeof value!=='string'||!value.trim()||value.length>5_000_000)throw Error('Choose a nonempty SRT under 5 MB.');
 const blocks=value.replace(/^\uFEFF/,'').replace(/\r/g,'').trim().split(/\n\s*\n/),cues=[];
 for(const block of blocks){
  const lines=block.split('\n'),idx=/^\d+$/.test(lines[0].trim())?1:0;
  const m=/^(\d{1,3}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{1,3}:\d{2}:\d{2}[,.]\d{3})(?:\s+.*)?$/.exec((lines[idx]||'').trim());
  if(!m)throw Error('SRT timing missing in cue '+(cues.length+1)+'.');
  const start=srtTime(m[1]),end=srtTime(m[2]),text=lines.slice(idx+1).join(' ').replace(/<[^>]*>/g,'').trim();
  if(end<=start||!text||cues.length&&start<cues[cues.length-1].start)throw Error('Invalid SRT cue '+(cues.length+1)+'.');
  cues.push({start,end,text});
 }
 return cues;
}
function validWords(words){
 if(!Array.isArray(words)||words.length>100000)return [];
 const result=[];
 for(const word of words){
  const start=Number(word.start),end=Number(word.end),text=String(word.text||'').trim();
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||!text||result.length&&start<result[result.length-1].start)return [];
  result.push({start,end,text});
 }
 return result;
}
function findMatches(source,query,limit=MAX_RESULTS){
 const terms=normalized(query).split(' ').filter(Boolean);
 if(!terms.length)return {matches:[],truncated:false};
 if(terms.length>12)throw Error('Search phrase is too long. Use 12 words or fewer.');
 const matches=[];
 if(source.words.length){
  const tokens=[];
  for(let i=0;i<source.words.length;i++)for(const part of normalized(source.words[i].text).split(' ').filter(Boolean))tokens.push({word:i,part});
  for(let i=0;i<=tokens.length-terms.length;i++){
   if(!terms.every((term,j)=>tokens[i+j].part===term))continue;
   const first=source.words[tokens[i].word],a=Math.max(0,tokens[i].word-3),b=Math.min(source.words.length,tokens[i+terms.length-1].word+4);
   matches.push({start:first.start,text:source.words.slice(a,b).map(w=>w.text).join(' ').trim(),precision:'word'});
   if(matches.length>limit)return {matches:matches.slice(0,limit),truncated:true};
  }
 }else for(const cue of source.cues){
  if(!(' '+normalized(cue.text)+' ').includes(' '+terms.join(' ')+' '))continue;
  matches.push({start:cue.start,text:cue.text,precision:'cue'});
  if(matches.length>limit)return {matches:matches.slice(0,limit),truncated:true};
 }
 return {matches,truncated:false};
}
function identityString(guid){return guid&&typeof guid.toString==='function'?guid.toString():String(guid||'');}
async function active(ppro){
 const project=await ppro.Project.getActiveProject();if(!project)throw Error('Open a Premiere project.');
 const sequence=await project.getActiveSequence();if(!sequence)throw Error('Open an active sequence.');
 const end=Number((await sequence.getEndTime()).seconds);
 if(!Number.isFinite(end)||end<0)throw Error('Premiere did not return a valid sequence duration.');
 return {project,sequence,projectId:identityString(project.guid),sequenceId:identityString(sequence.guid),end};
}
function same(a,b){return a.projectId===b.projectId&&a.sequenceId===b.sequenceId;}
async function ensureActive(ppro,source){
 const state=await active(ppro);
 if(!same(state,source))throw Error('Active sequence changed. Load or generate the transcript for this sequence again.');
 return state;
}
function timeText(seconds){const n=Math.max(0,Math.floor(seconds)),h=Math.floor(n/3600),m=Math.floor(n/60)%60,s=n%60;return [h,m,s].map(x=>String(x).padStart(2,'0')).join(':');}
async function jump(ppro,source,match){
 const state=await ensureActive(ppro,source);
 if(match.start>state.end+0.05)throw Error('Transcript time is beyond the active sequence. Choose an aligned SRT.');
 const ok=await state.sequence.setPlayerPosition(ppro.TickTime.createWithSeconds(match.start));
 if(ok!==true)throw Error('Premiere did not move the playhead.');
 return match.start;
}
async function addMarkers(ppro,source,matches){
 if(!matches.length||matches.length>MAX_RESULTS)throw Error('Choose 1–50 search matches.');
 const state=await ensureActive(ppro,source);
 const markerSet=await ppro.Markers.getMarkers(state.sequence);
 const existing=await markerSet.getMarkers(),placed=[];
 for(const marker of existing){
  const name=String(await marker.getName());
  if(name.startsWith(MARKER_PREFIX))placed.push(Number((await marker.getStart()).seconds));
 }
 const pending=[];
 for(const match of matches){
  if(!Number.isFinite(match.start)||match.start<0||match.start>state.end+0.05)throw Error('Transcript is not aligned to this sequence. No markers added.');
  if(placed.some(t=>Math.abs(t-match.start)<0.04)||pending.some(m=>Math.abs(m.start-match.start)<0.04))continue;
  pending.push(match);
 }
 if(!pending.length)return {created:0,skipped:matches.length,verified:true};
 let done=false;
 state.project.lockedAccess(()=>{
  done=state.project.executeTransaction(compound=>{
   for(const match of pending){
    const title=MARKER_PREFIX+match.text.replace(/\s+/g,' ').slice(0,56);
    const action=markerSet.createAddMarkerAction(title,'Comment',ppro.TickTime.createWithSeconds(match.start),ppro.TickTime.createWithSeconds(0),'Transcript search · '+match.precision+' timestamp');
    if(compound.addAction(action)===false)throw Error('Premiere refused a marker action.');
   }
  },'EditFlow · Mark transcript search');
 });
 if(done!==true)throw Error('Premiere rejected the marker transaction; no success reported.');
 const after=await (await ppro.Markers.getMarkers(state.sequence)).getMarkers(),verified=[];
 for(const marker of after){
  if(String(await marker.getName()).startsWith(MARKER_PREFIX))verified.push(Number((await marker.getStart()).seconds));
 }
 if(pending.some(m=>!verified.some(t=>Math.abs(t-m.start)<0.05)))throw Error('Marker transaction returned success but readback did not verify every marker. Check the timeline before retrying.');
 return {created:pending.length,skipped:matches.length-pending.length,verified:true};
}
function setup({ppro,fs,document,action,status}){
 const $=id=>document.getElementById(id);let source=null,generated=null,results={matches:[],truncated:false};
 function report(){
  $('markerSourceStatus').textContent=source?source.title+' · '+(source.words.length?'word timestamps':'SRT cue timestamps')+' · '+source.sequenceName:'Generate subtitles or choose an SRT aligned to the active sequence.';
  render();
 }
 function render(){
  results=source?findMatches(source,$('markerQuery').value):{matches:[],truncated:false};
  const root=$('markerResults');while(root.firstChild)root.removeChild(root.firstChild);
  $('markerCount').textContent=results.truncated?'More than 50 matches · refine your search':results.matches.length+' matches'+(source&&!source.words.length?' · jumps to cue start':'');
  $('markerAll').disabled=!source||!results.matches.length||results.truncated;
  for(const match of results.matches){
   const row=document.createElement('div');row.className='marker-hit';
   const stamp=document.createElement('strong');stamp.textContent=timeText(match.start);row.appendChild(stamp);
   const phrase=document.createElement('span');phrase.textContent=match.text.slice(0,160);row.appendChild(phrase);
   const go=document.createElement('button');go.textContent='Go';go.addEventListener('click',()=>action(async()=>{await jump(ppro,source,match);status('Playhead at '+timeText(match.start)+' · '+match.precision+' timestamp');}));row.appendChild(go);
   const mark=document.createElement('button');mark.textContent='Mark';mark.addEventListener('click',()=>action(async()=>{const r=await addMarkers(ppro,source,[match]);status(r.created?'Marker added · Undo available in Premiere':'Existing EditFlow marker at this time');}));row.appendChild(mark);
   root.appendChild(row);
  }
 }
 $('markerQuery').addEventListener('input',()=>{try{render();}catch(e){status('Search: '+e.message);}});
 $('markerChooseSrt').addEventListener('click',()=>action(async()=>{
  const before=await active(ppro),file=await fs.getFileForOpening({types:['srt'],allowMultiple:false});if(!file)return;
  const content=await file.read(),cues=parseSrt(content),after=await active(ppro);
  if(!same(before,after))throw Error('Active sequence changed while selecting SRT. Choose it again.');
  source={...after,title:'Chosen SRT · '+file.name,sequenceName:after.sequence.name,cues,words:[]};
  report();status('SRT loaded · '+cues.length+' cues · check timing against your sequence');
 }));
 $('markerUseGenerated').addEventListener('click',()=>action(async()=>{
  if(!generated)throw Error('Generate subtitles on this sequence first.');
  await ensureActive(ppro,generated);source=generated;report();status('Latest transcript loaded');
 }));
 $('markerAll').addEventListener('click',()=>action(async()=>{
  if(results.truncated)throw Error('Too many matches. Refine the search first.');
  const r=await addMarkers(ppro,source,results.matches);
  status(r.created+' sequence markers added · '+r.skipped+' already present · one Undo step');
 }));
 report();
 return {async loadGenerated(result,bound){
  const cues=parseSrt(result.text),words=validWords(result.words);
  generated={...bound,title:'Latest generated transcript',sequenceName:bound.sequence.name,cues,words};
  $('markerUseGenerated').disabled=false;source=generated;report();
 }};
}
module.exports={normalized,parseSrt,validWords,findMatches,active,same,jump,addMarkers,setup};
