// The player's horn (H), from recordings (assets/audio/buzinas.mp3 + .json, scripts/gerar_buzinas.py): the Opala's
// pair of horns, low and high, and the Fusca's single one. Each is a press (silence to the full note), a loop of the
// steady note held as long as the key is, and its letting go; letting go the loop plays on into the dying note.
// Heard from the cockpit it is duller (the horns sit under the hood, ahead of the bulkhead), from the aerial
// camera fainter, as the engine is.
import {clickOffset} from './engine-loops.js';

export class CarHorn{
 constructor(ctx,output){
  this.ctx=ctx;this.ready=false;this.error=null;this.horns={};this.voice=null;this.honks=0;this.last=null;
  this.tone=ctx.createBiquadFilter();this.tone.type='lowpass';this.tone.frequency.value=20000;this.tone.Q.value=.5;
  this.level=ctx.createGain();this.level.gain.value=1;this.tone.connect(this.level);this.level.connect(output);
  this.loading=this.load();
 }
 async load(){
  try{
   const get=(url,kind)=>fetch(url).then(r=>{if(!r.ok)throw Error(`${url}: ${r.status}`);return r[kind]();});
   const [meta,data]=await Promise.all([get('./assets/audio/buzinas.json','json'),get('./assets/audio/buzinas.mp3','arrayBuffer')]);
   const buffer=await this.ctx.decodeAudioData(data),sr=buffer.sampleRate,ratio=sr/meta.sampleRate,offset=clickOffset(meta,buffer.getChannelData(0),sr);
   const at=s=>(s*ratio+offset)/sr;
   this.buffer=buffer;
   for(const [name,h] of Object.entries(meta.horns))this.horns[name]={start:at(h.start),loop:[at(h.loop[0]),at(h.loop[1])],end:at(h.end)};
   this.ready=true;
  }catch(e){this.error=e.message||String(e);}
 }
 // Every frame: whether the horn is pressed, the car's ('opala' or 'fusca'), the camera and the effects' level.
 update(on,kind,mode){
  if(!this.ready)return;
  const t=this.ctx.currentTime,inside=mode==='cockpit';
  this.tone.frequency.setTargetAtTime(inside?2600:20000,t,.03);this.level.gain.setTargetAtTime(inside?.75:mode==='aerial'?.45:1,t,.03);
  if(on&&!this.voice)this.press(kind);else if(!on&&this.voice)this.letGo();
 }
 press(kind){
  const horn=this.horns[kind]??this.horns.opala;if(!horn)return;
  const source=this.ctx.createBufferSource();
  Object.assign(source,{buffer:this.buffer,loop:true,loopStart:horn.loop[0],loopEnd:horn.loop[1]});
  const at=this.ctx.currentTime;source.connect(this.tone);source.start(at,horn.start);
  source.onended=()=>source.disconnect();
  this.voice={source,horn,at};this.honks++;this.last=this.horns[kind]?kind:'opala';
 }
 // Not looping any more, the note plays on from where it is (the press, or its turn of the loop) into its dying away,
 // and stops at the horn's end (the file goes on to the other horn).
 letGo(){
  const {source,horn,at}=this.voice,t=this.ctx.currentTime,[a,b]=horn.loop;this.voice=null;
  const played=horn.start+Math.max(0,t-at),now=played<b?played:a+(played-a)%(b-a);
  source.loop=false;source.stop(t+horn.end-now+.02);
 }
 info(){return {ready:this.ready,error:this.error,on:!!this.voice,honks:this.honks,last:this.last};}
}
