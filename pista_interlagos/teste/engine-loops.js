// Engines from loops, as most racing games do (banks by scripts/gerar_loops_motor.py): loops_*.mp3/.json hold
// seamless stretches of a real engine, each at one rpm with the throttle open ('on') or shut ('off'); an idle
// loop (lenta_*.mp3/.json) is a stretch of a real idle. The wanted revs pick the two nearest loops of each layer,
// speed them to those revs and cross-fade them (equal power); the throttle cross-fades the layers; at idle the
// idle loop takes over. Nothing is cut: each loop sounds as recorded. Only the loops heard play: a loop starts (at
// a random point of it, fading in from silence) when it is wanted and stops once it has been silent for SLEEP s.
// With every loop of the three voices running all the time (some 60 sources, silent ones too) a phone's audio
// fell behind and the music stuttered on the car screen (players' report). Voice 0 is the car heard, the others
// the nearest rivals (lighter: every other loop).
// (Cutting recordings into firing cycles and re-assembling them sounded like a glitch to the team; the
// whole-loop way replaced it.)

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const GAME_IDLE=950;
// Physics' upshift point (SHIFT_UP_RPM) and the top of the rev counter.
export const SHIFT_UP=6650,COUNTER=7400;
// First gear sounds like the others, which an upshift always lands high in the rev range: the bottom of the
// range in first (where physics also holds the launch revs while the clutch slips) made an odd noise. Pulling
// away in first the heard revs start at `share` of the rev counter and climb to the upshift point as the wheels'
// revs in first (km/h times the gear's rpm per km/h) climb from idle to it.
export const firstGearRevs=(kmh,perKmh,share)=>{const from=Math.min(share*COUNTER,SHIFT_UP);return from+(Math.max(GAME_IDLE,kmh*perKmh)-GAME_IDLE)*(SHIFT_UP-from)/(SHIFT_UP-GAME_IDLE);};
// The same for second to fifth, when a pilot sets where a gear's sound starts (sound-tuning.js "Começo do som"):
// from `low` (the revs an upshift lands the gear at) to the upshift point, the heard revs run from `share` of the
// counter to it.
export const gearRevs=(rpm,low,share)=>{const from=Math.min(share*COUNTER,SHIFT_UP-1);return Math.max(GAME_IDLE,from+(rpm-low)*(SHIFT_UP-from)/(SHIFT_UP-low));};
// The throttle-shut layer with no loop within this ratio of the wanted revs borrows the throttle-open loops (never
// the other way: borrowed shut loops made the engine sound as if lifting while pulling away in first).
const BORROW=Math.log(1.3);
// A silent loop stops after this long (its fade, a .03 s time constant, is long inaudible by then).
const SLEEP=.4;

// Where a decoded recording's content sits against the file it was made from: the MP3 encoder adds a delay
// the decoder may or may not remove, so each of these files starts with a click in silence (at `click`
// samples of `sampleRate`). Returns the offset in decoded samples.
export function clickOffset(meta,samples,sampleRate){
 const expected=meta.click*sampleRate/meta.sampleRate;
 let best=0,at=Math.round(expected);
 for(let i=Math.max(0,Math.round(expected-3000)),to=Math.min(samples.length,Math.round(expected+3000));i<to;i++){const v=Math.abs(samples[i]);if(v>best){best=v;at=i;}}
 return at-expected;
}

// An engine's loudness for its revs and throttle (the loops are evened out in level): at idle about 12 dB under
// itself pulling hard at high revs; shutting the throttle takes some 7 dB off.
export const engineLevel=(rpm,load,idle=.35,lift=.45)=>(lift+(1-lift)*Math.min(1,Math.max(0,load)))*(idle+(1-idle)*Math.min(1,Math.max(0,rpm)/7000)**.8);

const sounds=new Map();
function loadSound(ctx,name){
 if(!sounds.has(name))sounds.set(name,(async()=>{
  const get=(url,kind)=>fetch(url).then(r=>{if(!r.ok)throw Error(`${url}: ${r.status}`);return r[kind]();});
  const [meta,data]=await Promise.all([get(`./assets/audio/${name}.json`,'json'),get(`./assets/audio/${name}.mp3`,'arrayBuffer')]);
  const buffer=await ctx.decodeAudioData(data),sr=buffer.sampleRate,ratio=sr/meta.sampleRate,offset=clickOffset(meta,buffer.getChannelData(0),sr);
  return {meta,buffer,at:s=>(s*ratio+offset)/sr};
 })());
 return sounds.get(name);
}

// The loops of a layer around rpm with their shares: the two neighbours, or the nearest one alone at the ends.
function bracket(list,rpm){
 if(rpm<=list[0].rpm)return [[list[0],1]];
 for(let i=0;i<list.length-1;i++)if(rpm<list[i+1].rpm){const w=Math.log(rpm/list[i].rpm)/Math.log(list[i+1].rpm/list[i].rpm);return [[list[i],Math.sqrt(1-w)],[list[i+1],Math.sqrt(w)]];}
 return [[list[list.length-1],1]];
}
const distance=(list,rpm)=>list.reduce((d,l)=>Math.min(d,Math.abs(Math.log(rpm/l.rpm))),Infinity);

export class LoopEngine{
 constructor(ctx,{voices=1,shape=null}={}){
  this.ctx=ctx;this.ready=false;this.error=null;this.choice=null;this.shape(shape??{});
  this.outputs=Array.from({length:voices},()=>ctx.createGain());
  this.values=this.outputs.map(()=>({rpm:GAME_IDLE,load:0,gain:0,heard:GAME_IDLE,at:null}));this.voices=[];
 }
 // The car's sounds: {bank, idle} (loops_* and lenta_* names). The old ones play on until the new have loaded.
 use(choice){
  if(this.choice?.bank===choice.bank&&this.choice?.idle===choice.idle)return this.loading;
  this.choice=choice;
  return this.loading=Promise.all([loadSound(this.ctx,choice.bank),choice.idle?loadSound(this.ctx,choice.idle):null]).then(([bank,idle])=>{
   if(this.choice!==choice)return;
   const t=this.ctx.currentTime;
   for(const voice of this.voices)for(const loop of voice.all){loop.gain.gain.setTargetAtTime(0,t,.05);loop.source?.stop(t+.3);}
   this.voices=this.outputs.map((output,i)=>this.voice(bank,idle,output,i>0));
   this.bank=choice.bank;this.idleName=choice.idle;this.ready=true;this.error=null;
  }).catch(e=>{this.error=e.message||String(e);});
 }
 voice(bank,idle,output,light){
  // A loop's level stays on its gain; its source exists only while it is heard (wake, sleep).
  const run=(buffer,a,b)=>{const gain=this.ctx.createGain();gain.gain.value=0;gain.connect(output);return {buffer,a,b,source:null,gain,level:0,quiet:0};};
  const layers={on:[],off:[]};
  for(const loop of bank.meta.loops)layers[loop.layer].push(loop);
  for(const [name,list] of Object.entries(layers)){
   list.sort((a,b)=>a.rpm-b.rpm);
   layers[name]=(light?list.filter((_,i)=>i%2===0||i===list.length-1):list).map(loop=>({rpm:loop.rpm,...run(bank.buffer,bank.at(loop.start),bank.at(loop.end))}));
  }
  const idleLoop=idle?{rpm:idle.meta.rpm,...run(idle.buffer,idle.at(idle.meta.loop[0]),idle.at(idle.meta.loop[1]))}:null;
  return {layers,idle:idleLoop,all:[...layers.on,...layers.off,...(idleLoop?[idleLoop]:[])]};
 }
 // Fades every loop out and stops it (the synthesized engine was chosen); the decoded banks stay cached.
 dispose(){
  const t=this.ctx.currentTime;
  for(const voice of this.voices)for(const loop of voice.all){loop.gain.gain.setTargetAtTime(0,t,.03);loop.source?.stop(t+.2);}
  this.voices=[];this.ready=false;this.choice=null;
  setTimeout(()=>this.outputs.forEach(o=>o.disconnect()),300);
 }
 // rpm: the game's revs; load: throttle 0-1; gain: the voice's level.
 set(i,rpm,load,gain){const v=this.values[i];if(v)Object.assign(v,{rpm:Math.max(200,rpm),load:clamp(load,0,1),gain});}
 // The car's settings (sound-tuning.js): loopSpan, how far up the idle loop reaches; onFrom/offFrom, loops of
 // each layer under these revs are left out (the team found the bank's low open loops poor; the lowest one left
 // plays slower instead); idleLoop and idlePitch, the idle loop's level and speed; revRise/revFall, how fast a
 // voice's revs may rise and fall (an engine has inertia, the physics' revs may jump).
 shape(t){Object.assign(this,{loopSpan:Math.max(1.05,t.loopSpan??1.5),onFrom:t.onFrom??0,offFrom:t.offFrom??0,idleLoop:t.idleLoop??1,idlePitch:t.idlePitch??1,revRise:t.revRise??9000,revFall:t.revFall??18000});}
 // A loop starts playing at rate (from a random point of it: the loops start apart, as before) or goes quiet.
 wake(loop,rate,t){
  const source=this.ctx.createBufferSource();
  Object.assign(source,{buffer:loop.buffer,loop:true,loopStart:loop.a,loopEnd:loop.b});source.playbackRate.value=rate;
  source.connect(loop.gain);source.start(t,loop.a+Math.random()*(loop.b-loop.a));loop.source=source;
 }
 sleep(loop,t){if(loop.source&&loop.level===0&&t-loop.quiet>SLEEP){loop.source.stop();loop.source.disconnect();loop.source=null;}}
 // A loop's level: faded to, and the moment it went silent noted.
 fade(loop,level,t){if(level>0||loop.level>0){loop.gain.gain.setTargetAtTime(level,t,.03);if(level===0)loop.quiet=t;loop.level=level;}}
 flush(){
  if(!this.ready)return;
  const t=this.ctx.currentTime;
  this.voices.forEach((voice,i)=>{
   const v=this.values[i],dt=v.at===null?0:clamp(t-v.at,0,.1);v.at=t;
   v.heard=v.rpm>v.heard?Math.min(v.rpm,v.heard+this.revRise*dt):Math.max(v.rpm,v.heard-this.revFall*dt);
   if(dt===0)v.heard=v.rpm;
   this.play(voice,v.heard,v.load,v.gain,t);
  });
 }
 play(voice,rpm,load,gain,t){
  // The idle loop: all of it at the game's idle, none from loopSpan times idle up, less with the throttle open.
  const idle=voice.idle?clamp((this.loopSpan*GAME_IDLE-rpm)/((this.loopSpan-1)*GAME_IDLE),0,1)*(1-.55*load):0,rest=Math.sqrt(1-idle);
  let on=voice.layers.on.filter(l=>l.rpm>=this.onFrom),off=voice.layers.off.filter(l=>l.rpm>=this.offFrom);
  if(!on.length)on=voice.layers.on.slice(-1);
  if(!off.length)off=voice.layers.off.slice(-1);
  if(!off.length||distance(off,rpm)>BORROW&&distance(on,rpm)<distance(off,rpm))off=on;
  const share=new Map();
  for(const [list,part] of [[on,Math.sqrt(load)*rest],[off,Math.sqrt(1-load)*rest]])
   if(list.length&&part>0)for(const [loop,w] of bracket(list,rpm))share.set(loop,(share.get(loop)??0)+part*w);
  for(const loop of [...voice.layers.on,...voice.layers.off]){
   const level=(share.get(loop)??0)*gain;
   if(level>0){const rate=clamp(rpm/loop.rpm,.3,2);if(!loop.source)this.wake(loop,rate,t);else if(loop.level===0)loop.source.playbackRate.setValueAtTime(rate,t);else loop.source.playbackRate.setTargetAtTime(rate,t,.02);}
   this.fade(loop,level,t);this.sleep(loop,t);
  }
  if(voice.idle){
   const loop=voice.idle,level=Math.sqrt(idle)*gain*this.idleLoop,rate=clamp(rpm/GAME_IDLE*this.idlePitch,.4,3);
   if(level>0&&!loop.source)this.wake(loop,rate,t);else loop.source?.playbackRate.setTargetAtTime(rate,t,.02);
   this.fade(loop,level,t);this.sleep(loop,t);
  }
 }
 info(){
  const voice=this.voices[0],playing=voice?[...voice.layers.on.map(l=>['on',l]),...voice.layers.off.map(l=>['off',l])].filter(([,l])=>l.level>.001).map(([layer,l])=>`${layer} ${l.rpm}`):[];
  return {ready:this.ready,error:this.error,bank:this.bank??null,idle:this.idleName??null,playing,idleLevel:+(voice?.idle?.level??0).toFixed(3),
   sources:this.voices.reduce((n,v)=>n+v.all.filter(l=>l.source).length,0),
   voices:this.values.map(v=>({rpm:Math.round(v.rpm),heard:Math.round(v.heard),load:+v.load.toFixed(2),gain:+v.gain.toFixed(3)}))};
 }
}
