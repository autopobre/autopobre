// Engines from loops, as most racing games do (banks by scripts/gerar_loops_motor.py): loops_*.mp3/.json hold
// seamless stretches of a real engine, each at one rpm with the throttle open ('on') or shut ('off'); an idle
// loop (lenta_*.mp3/.json) is a stretch of a real idle. Every loop of a voice runs all the time: the wanted revs
// pick the two nearest loops of each layer, speed them to those revs and cross-fade them (equal power); the
// throttle cross-fades the layers; at idle the idle loop takes over. Nothing is cut: each loop sounds as
// recorded. Voice 0 is the car heard, the others the nearest rivals (lighter: every other loop).
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
// The throttle-shut layer with no loop within this ratio of the wanted revs borrows the throttle-open loops (never
// the other way: borrowed shut loops made the engine sound as if lifting while pulling away in first).
const BORROW=Math.log(1.3);
// How fast a voice's revs may rise and fall (rpm/s): an engine has inertia, the physics' revs may jump.
const RISE=9000,FALL=18000;

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
   for(const voice of this.voices)for(const loop of voice.all){loop.gain.gain.setTargetAtTime(0,t,.05);loop.source.stop(t+.3);}
   this.voices=this.outputs.map((output,i)=>this.voice(bank,idle,output,i>0));
   this.bank=choice.bank;this.idleName=choice.idle;this.ready=true;this.error=null;
  }).catch(e=>{this.error=e.message||String(e);});
 }
 voice(bank,idle,output,light){
  const run=(buffer,a,b)=>{
   const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();gain.gain.value=0;
   Object.assign(source,{buffer,loop:true,loopStart:a,loopEnd:b});source.connect(gain);gain.connect(output);
   source.start(0,a+Math.random()*(b-a));return {source,gain,level:0};
  };
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
  for(const voice of this.voices)for(const loop of voice.all){loop.gain.gain.setTargetAtTime(0,t,.03);loop.source.stop(t+.2);}
  this.voices=[];this.ready=false;this.choice=null;
  setTimeout(()=>this.outputs.forEach(o=>o.disconnect()),300);
 }
 // rpm: the game's revs; load: throttle 0-1; gain: the voice's level.
 set(i,rpm,load,gain){const v=this.values[i];if(v)Object.assign(v,{rpm:Math.max(200,rpm),load:clamp(load,0,1),gain});}
 // loopSpan: how far up the idle loop reaches; onFrom: throttle-open loops under these revs are left out (the
 // team found the bank's low open loops poor; the lowest one left plays slower instead).
 // idleGains: each car's idle loop level ({opala, fusca}, the choice's kind).
 shape(tuning){this.loopSpan=Math.max(1.05,tuning.loopSpan??1.5);this.onFrom=tuning.onFrom??0;this.idleGains={opala:tuning.idleOpala??1,fusca:tuning.idleFusca??1};}
 flush(){
  if(!this.ready)return;
  const t=this.ctx.currentTime;
  this.voices.forEach((voice,i)=>{
   const v=this.values[i],dt=v.at===null?0:clamp(t-v.at,0,.1);v.at=t;
   v.heard=v.rpm>v.heard?Math.min(v.rpm,v.heard+RISE*dt):Math.max(v.rpm,v.heard-FALL*dt);
   if(dt===0)v.heard=v.rpm;
   this.play(voice,v.heard,v.load,v.gain,t);
  });
 }
 play(voice,rpm,load,gain,t){
  // The idle loop: all of it at the game's idle, none from loopSpan times idle up, less with the throttle open.
  const idle=voice.idle?clamp((this.loopSpan*GAME_IDLE-rpm)/((this.loopSpan-1)*GAME_IDLE),0,1)*(1-.55*load):0,rest=Math.sqrt(1-idle);
  let on=voice.layers.on.filter(l=>l.rpm>=this.onFrom),off=voice.layers.off;
  if(!on.length)on=voice.layers.on.slice(-1);
  if(!off.length||distance(off,rpm)>BORROW&&distance(on,rpm)<distance(off,rpm))off=on;
  const share=new Map();
  for(const [list,part] of [[on,Math.sqrt(load)*rest],[off,Math.sqrt(1-load)*rest]])
   if(list.length&&part>0)for(const [loop,w] of bracket(list,rpm))share.set(loop,(share.get(loop)??0)+part*w);
  for(const loop of [...voice.layers.on,...voice.layers.off]){
   const level=(share.get(loop)??0)*gain;
   if(level>0){const rate=clamp(rpm/loop.rpm,.3,2);if(loop.level===0)loop.source.playbackRate.setValueAtTime(rate,t);else loop.source.playbackRate.setTargetAtTime(rate,t,.02);}
   if(level>0||loop.level>0){loop.gain.gain.setTargetAtTime(level,t,.03);loop.level=level;}
  }
  if(voice.idle){
   const level=Math.sqrt(idle)*gain*(this.idleGains[this.choice?.kind]??1);
   if(level>0||voice.idle.level>0){voice.idle.gain.gain.setTargetAtTime(level,t,.03);voice.idle.level=level;}
   voice.idle.source.playbackRate.setTargetAtTime(clamp(rpm/GAME_IDLE,.7,1.8),t,.02);
  }
 }
 info(){
  const voice=this.voices[0],playing=voice?[...voice.layers.on.map(l=>['on',l]),...voice.layers.off.map(l=>['off',l])].filter(([,l])=>l.level>.001).map(([layer,l])=>`${layer} ${l.rpm}`):[];
  return {ready:this.ready,error:this.error,bank:this.bank??null,idle:this.idleName??null,playing,idleLevel:+(voice?.idle?.level??0).toFixed(3),
   voices:this.values.map(v=>({rpm:Math.round(v.rpm),heard:Math.round(v.heard),load:+v.load.toFixed(2),gain:+v.gain.toFixed(3)}))};
 }
}
