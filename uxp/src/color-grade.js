'use strict';
// Visually useful, conservative starting looks. These are guided numeric corrections,
// NOT skin detection, scene matching, or a trained colour-grading model.
function clamp(value, low, high){return Math.min(high,Math.max(low,Number(value)||0));}
function gradeFromAnalysis(source, look, intensity){
 const amount=clamp(intensity,.25,1),c=source||{};
 // SDR finishing look, deliberately stronger than the legacy restrained looks.
 // Highlight reduction cannot recover clipped source detail; this is not HDR output.
 if(look==='hdr_pop'){
  const round=v=>Number(v.toFixed(2));
  return {
   exposure_offset:round(clamp(c.exposure_offset,-.25,.25)*amount),
   contrast_offset:round((34+clamp(c.contrast_offset,-7,9))*amount),
   temperature_offset:round(clamp(c.temperature_offset,-3,3)*amount),
   saturation:round(100+18*amount),
   highlights:round(-32*amount),shadows:round(24*amount),
   whites:round(10*amount),blacks:round(-14*amount)
  };
 }
 const defaults={
  natural:{contrast:12,temperature:0,saturation:5},
  cinematic:{contrast:19,temperature:-3,saturation:-4},
  warm:{contrast:13,temperature:9,saturation:6}
 };
 const preset=defaults[look]||defaults.natural;
 const exposure=clamp(Number(c.exposure_offset||0)*amount,-.35,.35);
 const contrast=clamp((preset.contrast+clamp(c.contrast_offset,-7,9))*amount,0,30);
 const temperature=clamp((preset.temperature+clamp(c.temperature_offset,-4,4))*amount,-12,12);
 const saturation=clamp(100+preset.saturation*amount,90,112);
 const round=v=>Number(v.toFixed(2));
 return {exposure_offset:round(exposure),contrast_offset:round(contrast),temperature_offset:round(temperature),saturation:round(saturation)};
}
module.exports={gradeFromAnalysis};
