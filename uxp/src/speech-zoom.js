'use strict';
// Timeline-aligned SRT hints for conservative punch-ins. These are text cues,
// NOT acoustic stress recognition or per-word forced alignment.
const KEYWORDS=/(?:^|[\s،,:؛!؟?.])(?:لكن|المهم|المشكلة|السبب|النتيجة|كارثة|ركز|فجأة|بالضبط|بص|اسمع|ليه|إزاي|طب|مستحيل|الواقع|للأسف|الحقيقة)(?=$|[\s،,:؛!؟?.])/u;
function time(s){const m=/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(String(s).trim());return m?Number(m[1])*3600+Number(m[2])*60+Number(m[3])+Number(m[4])/1000:NaN;}
function parseSrt(text){if(typeof text!=='string'||text.length>5_000_000)throw Error('Choose an SRT file smaller than 5 MB.');const cues=[];
 for(const block of text.replace(/^\uFEFF/,'').replace(/\r/g,'').split(/\n\s*\n/)){
  const lines=block.split('\n').map(x=>x.trim()).filter(Boolean),idx=lines.findIndex(x=>x.includes('-->'));
  if(idx<0)continue;
  const [a,b]=(lines[idx].split('-->').map(x=>x.trim()));const start=time(a),end=time((b||'').split(' ')[0]);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>20)continue;
  const textLine=lines.slice(idx+1).join(' ').replace(/<[^>]+>/g,'');if(textLine)cues.push({start,end,text:textLine,emphasis:KEYWORDS.test(textLine)||/[!؟?]/u.test(textLine)});
 }
 if(!cues.length)throw Error('No valid SRT cues found.');if(cues.length>12000)throw Error('Too many SRT cues.');return cues;
}
function filterSpeech(plan,cues,mode='emphasis'){
 if(!Array.isArray(plan)||!Array.isArray(cues))return [];
 const windows=cues.filter(c=>mode==='all'||c.emphasis);
 // Punch-in at the START of a suitable inner shot, not in the middle of a word.
 return plan.filter(z=>windows.some(c=>z.at>=c.start-1.8 && z.at<=c.end+.35));
}
module.exports={parseSrt,filterSpeech};
