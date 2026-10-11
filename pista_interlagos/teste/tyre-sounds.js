// Tyres and exhaust pops from recordings (assets/audio/pneus_estalos.mp3 + .json, scripts/gerar_sons_pneu.py):
// two looped squeals, 'canta' (a tyre singing at its limit) and 'arrasta' (a tyre screeching in a slide, a
// lock-up or a spin), always running and faded in by set(); and single exhaust pops. Until the file is ready
// (`ready` false) the caller keeps its synthesized tyres.
import {clickOffset} from './engine-loops.js';

export class TyreSounds{
 constructor(ctx,output){this.ctx=ctx;this.output=output;this.ready=false;this.error=null;this.loops={};this.pops=[];this.popCount=0;this.loading=this.load();}
 async load(){
  try{
   const get=(url,kind)=>fetch(url).then(r=>{if(!r.ok)throw Error(`${url}: ${r.status}`);return r[kind]();});
   const [meta,data]=await Promise.all([get('./assets/audio/pneus_estalos.json','json'),get('./assets/audio/pneus_estalos.mp3','arrayBuffer')]);
   const buffer=await this.ctx.decodeAudioData(data),sr=buffer.sampleRate,ratio=sr/meta.sampleRate,offset=clickOffset(meta,buffer.getChannelData(0),sr);
   const at=s=>(s*ratio+offset)/sr;
   this.buffer=buffer;
   for(const [name,[a,b]] of Object.entries(meta.loops)){
    const source=this.ctx.createBufferSource(),gain=this.ctx.createGain();gain.gain.value=0;
    Object.assign(source,{buffer,loop:true,loopStart:at(a),loopEnd:at(b)});
    source.connect(gain);gain.connect(this.output);source.start(0,at(a));
    this.loops[name]={source,gain,level:0};
   }
   this.pops=meta.pops.map(([a,b])=>[at(a),at(b)-at(a)]);this.ready=true;
  }catch(e){this.error=e.message||String(e);}
 }
 // A loop's level and speed (1 = as recorded), gliding there.
 set(name,level,rate=1){
  const loop=this.loops[name];if(!loop)return;const t=this.ctx.currentTime;
  loop.gain.gain.setTargetAtTime(level,t,.035);loop.source.playbackRate.setTargetAtTime(rate,t,.08);loop.level=level;
 }
 // One pop, `delay` seconds from now, a different one and a slightly different pitch each time.
 pop(strength=1,delay=0){
  if(!this.ready||!this.pops.length)return;
  const [start,length]=this.pops[Math.floor(Math.random()*this.pops.length)],source=this.ctx.createBufferSource(),gain=this.ctx.createGain();
  source.buffer=this.buffer;source.playbackRate.value=.88+Math.random()*.24;gain.gain.value=strength;
  source.connect(gain);gain.connect(this.output);source.start(this.ctx.currentTime+delay,start,length);
  source.onended=()=>{source.disconnect();gain.disconnect();};this.popCount++;
 }
 silence(){for(const name in this.loops)this.set(name,0);}
 info(){return {ready:this.ready,error:this.error,pops:this.popCount,loops:Object.fromEntries(Object.entries(this.loops).map(([k,v])=>[k,+v.level.toFixed(3)]))};}
}
