import {SoundEffects} from './sound-effects.js';
import {GameMusic} from './game-music.js';
import {RecordedMusic} from './recorded-music.js';
import {LoopEngine,engineLevel,firstGearRevs,gearRevs,SHIFT_UP} from './engine-loops.js';
import {TyreSounds} from './tyre-sounds.js';
import {CarHorn} from './car-horn.js';
import {readSoundSettings,soundDefaults} from './sound-tuning.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// Physics' gears in rpm per km/h (OPALA_MECHANICS) when the car does not bring its own.
const OPALA_GEARS=[0,110,72,52,40,32.2];
// "Aspereza": a soft clip that keeps the usual peak (half scale) where it was and lifts what is quieter.
function driveCurve(drive){
 if(!(drive>0))return null;
 const a=1+drive*12,norm=.5/Math.tanh(a*.5);
 return Float32Array.from({length:1024},(_,i)=>norm*Math.tanh(a*(i/1023*2-1)));
}
// Each car's recorded engine (scripts/gerar_loops_motor.py): its acceleration loops and its idle loop. The Opala
// pulls with an inline six (a BMW M3's) and idles as a real 1978 Opala; the Fusca pulls as a VW T2 (Kombi, the
// same air-cooled flat four) and idles as a real 1977 Fusca. Rivals sound like the car heard.
const ENGINE_SOUNDS={opala:{kind:'opala',bank:'loops_m3',idle:'lenta_opala'},fusca:{kind:'fusca',bank:'loops_fusca',idle:'lenta_fusca'}};
// The engine as heard (and on the rev counter) cannot jump: the revs climb from where they were at `rise` rpm/s
// and fall at `fall` (the car's settings: revRise, revFall, launch).
export const heardRevs=(heard,target,dt,rise,fall)=>target>heard?Math.min(target,heard+rise*dt):Math.max(target,heard-fall*dt);
// Revving free (neutral, the clutch down, or held at the start's countdown: command.held), nothing but the flywheel
// slows the engine: it winds down at `rate` rpm/s from high revs and gentler toward idle (freeFall), the "VRUMMMM"
// after a blip on the grid instead of a dry "VRU" (user, 10-24).
export const freeRevFall=(heard,rate)=>rate*(.35+.65*clamp((heard-950)/3050,0,1));

// Engine/exhaust, gearbox and tyres. The engine and tyres come from real recordings (engine-loops.js,
// tyre-sounds.js) once they have loaded; until then, or where the browser cannot play them, synthesized.
export class CarAudio {
 // options.recorded false: the synthesized engine only. options.tunings: {opala, fusca} settings the caller keeps
 // changing (the sound bench, then retune()); otherwise this browser's own sets when the player chose to use them
 // in the game (sound-tuning.js), else the defaults the team approved.
 constructor(options={}){
  this.recordedEngine=options.recorded!==false;
  const saved=options.tunings?null:readSoundSettings();
  this.tunings=options.tunings??(saved.useInGame?{opala:saved.opala,fusca:saved.fusca}:{opala:soundDefaults(),fusca:soundDefaults()});
  this.tuningSource=options.tunings||saved.useInGame?'bancada':'padrão';this.kind='opala';this.tuning=this.tunings.opala;
  this.volume=.55;this.musicVolume=.35;this.effectsVolume=1;this.focused=true;this.hasDriven=false;this.openingTime=0;this.muted=false;this.paused=true;this.context=null;this.shifts=0;this.error=null;this.synthEngine=false;
  try{const saved=JSON.parse(localStorage.getItem('opala99-audio'));if(saved){this.volume=clamp(Number(saved.volume)||0,0,1);this.muted=!!saved.muted;}}catch{}
  try{const saved=JSON.parse(localStorage.getItem('opala99-audio'));for(const key of ['musicVolume','effectsVolume'])if(Number.isFinite(saved?.[key]))this[key]=clamp(saved[key],0,1);this.musicMuted=saved?.musicMuted===true;this.effectsMuted=saved?.effectsMuted===true;}catch{}
  this.reset();
 }
 reset(){this.state={gear:'N',rpm:950,skid:0,throttle:0};this.heardRpm=this.heardAt=this.gas=null;this.shiftUntil=0;this.lastGear=null;this.lastThrottle=0;this.effects?.stopWorld();this.tyres?.silence();}
 build(ctx){
  this.context=ctx;
  this.master=ctx.createGain();this.master.gain.value=0;
  this.compressor=ctx.createDynamicsCompressor();this.compressor.threshold.value=-12;this.compressor.knee.value=15;this.compressor.ratio.value=5;
  this.compressor.attack.value=.004;this.compressor.release.value=.12;
  this.master.connect(this.compressor);this.compressor.connect(ctx.destination);
  this.analyser=ctx.createAnalyser();this.analyser.fftSize=256;this.compressor.connect(this.analyser);this.meter=new Float32Array(256);
  // The engine's chain: saturation ("Aspereza"), the cut of the highs, mids ("Médios"), bass ("Graves"), level.
  this.engineDrive=ctx.createWaveShaper();this.engineDrive.oversample='2x';
  this.engineFilter=ctx.createBiquadFilter();this.engineFilter.type='lowpass';this.engineFilter.frequency.value=1700;this.engineFilter.Q.value=.6;
  this.enginePresence=ctx.createBiquadFilter();this.enginePresence.type='peaking';this.enginePresence.frequency.value=1400;this.enginePresence.Q.value=.9;
  this.engineBass=ctx.createBiquadFilter();this.engineBass.type='lowshelf';this.engineBass.frequency.value=180;this.engineBass.gain.value=this.tuning.bass;
  this.engineGain=ctx.createGain();this.engineGain.gain.value=0;
  this.engineDrive.connect(this.engineFilter);this.engineFilter.connect(this.enginePresence);this.enginePresence.connect(this.engineBass);this.engineBass.connect(this.engineGain);this.engineGain.connect(this.master);
  const real=new Float32Array(25),imag=new Float32Array(25);
  for(let i=1;i<25;i++){real[i]=Math.cos(i*.27)/(i**.8);imag[i]=Math.sin(i*.27)/(i**.8);}
  this.synthGain=ctx.createGain();this.synthGain.connect(this.engineDrive);
  this.engine=ctx.createOscillator();this.engine.setPeriodicWave(ctx.createPeriodicWave(real,imag));this.engine.frequency.value=47.5;this.engine.connect(this.synthGain);this.engine.start();
  this.sub=ctx.createOscillator();this.sub.type='sine';this.sub.frequency.value=23.75;
  const subGain=ctx.createGain();subGain.gain.value=.16;this.sub.connect(subGain);subGain.connect(this.synthGain);this.sub.start();
  // A seamless, deterministic noise bed adds exhaust rasp and sliding rubber texture.
  const buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),samples=buffer.getChannelData(0);let seed=99;
  for(let i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;samples[i]=seed/2147483648-1;}
  this.noiseBuffer=buffer;this.noise=ctx.createBufferSource();this.noise.buffer=buffer;this.noise.loop=true;
  const exhaustFilter=ctx.createBiquadFilter();exhaustFilter.type='bandpass';exhaustFilter.frequency.value=650;exhaustFilter.Q.value=.7;
  this.rasp=ctx.createGain();this.rasp.gain.value=.05;this.noise.connect(exhaustFilter);exhaustFilter.connect(this.rasp);this.rasp.connect(this.synthGain);
  this.tyreFilter=ctx.createBiquadFilter();this.tyreFilter.type='bandpass';this.tyreFilter.frequency.value=1900;this.tyreFilter.Q.value=.8;
  this.tyreGain=ctx.createGain();this.tyreGain.gain.value=0;this.noise.connect(this.tyreFilter);this.tyreFilter.connect(this.tyreGain);this.tyreGain.connect(this.master);
  this.squeal=ctx.createOscillator();this.squeal.type='triangle';this.squeal.frequency.value=1100;
  this.squealGain=ctx.createGain();this.squealGain.gain.value=0;this.squeal.connect(this.squealGain);this.squealGain.connect(this.master);this.squeal.start();this.noise.start();
  this.uiBus=ctx.createGain();this.musicBus=ctx.createGain();this.uiBus.gain.value=this.musicBus.gain.value=0;
  // The music reaches the mix through a cut in the voice's band and a duck, both at rest (duckMusic: a narrator).
  this.voiceCut=ctx.createBiquadFilter();this.voiceCut.type='peaking';this.voiceCut.frequency.value=1500;this.voiceCut.Q.value=.6;this.voiceCut.gain.value=0;
  this.musicDuck=ctx.createGain();this.musicDuck.gain.value=1;this.ducked=0;
  this.uiBus.connect(this.compressor);this.musicBus.connect(this.voiceCut);this.voiceCut.connect(this.musicDuck);this.musicDuck.connect(this.compressor);
  this.effects=new SoundEffects(ctx,this.master,this.uiBus,buffer);this.music=new GameMusic(ctx,this.musicBus,buffer);
  // Recorded engines: voice 0 is the car heard, 1 and 2 the nearest rivals (sound-effects.js routes those).
  this.wireEngine();
  this.tyres=new TyreSounds(ctx,this.master);this.horn=new CarHorn(ctx,this.master);
  this.applyTuning();
 }
 async unlock(){
  try{
   if(!this.context){const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio){this.error='Audio indisponivel';return;}this.build(new Audio({latencyHint:'interactive'}));}
   if(this.context.state==='suspended')await this.context.resume();
   if(!this.recordings)this.recordings=new RecordedMusic(this.context,this.musicBus);
   this.setPaused(this.paused);
  }catch(e){this.error=e.message;}
 }
 setVolume(value){this.volume=clamp(value,0,1);this.save();this.applyVolume();}
 setMusicVolume(value){this.musicVolume=clamp(value,0,1);this.save();this.applyVolume();}
 setEffectsVolume(value){this.effectsVolume=clamp(value,0,1);this.save();this.applyVolume();}
 // Music and effects can each be silenced without moving their sliders (the level is kept).
 get musicLevel(){return this.musicMuted?0:this.musicVolume;}
 get effectsLevel(){return this.effectsMuted?0:this.effectsVolume;}
 setMusicMuted(value){this.musicMuted=!!value;this.save();this.applyVolume();}
 setEffectsMuted(value){this.effectsMuted=!!value;this.save();this.applyVolume();}
 toggleMute(){this.muted=!this.muted;this.save();this.applyVolume();}
 save(){try{localStorage.setItem('opala99-audio',JSON.stringify({volume:this.volume,musicVolume:this.musicVolume,effectsVolume:this.effectsVolume,muted:this.muted,musicMuted:!!this.musicMuted,effectsMuted:!!this.effectsMuted}));}catch{}}
 // The old synthesized engine for the car and the rivals instead of the recordings: only the sound bench's
 // comparison now (bancada-som.js). The game's Áudio option is gone (user, 2026-10-24): a save that had it on is
 // read as off.
 setSynthEngine(value,keep=true){this.synthEngine=!!value;if(keep)this.save();this.wireEngine();}
 // The recorded engines (player and nearest rivals) unless the synthesized one is wanted; the banks stay
 // decoded across a switch (engine-loops.js caches them).
 wireEngine(){
  if(!this.context)return;
  const wanted=this.recordedEngine&&!this.synthEngine;
  if(!wanted&&this.recorded){this.recorded.dispose();this.recorded=null;this.effects.useRecordedRivals(null);}
  if(wanted&&!this.recorded){
   this.recorded=new LoopEngine(this.context,{voices:3,shape:this.tuning});this.recorded.use(ENGINE_SOUNDS[this.kind??'opala']);
   this.recorded.outputs[0].connect(this.engineDrive);this.effects.useRecordedRivals(this.recorded,this.tuning);
  }
 }
 applyVolume(){if(!this.context)return;const t=this.context.currentTime,v=this.muted||!this.focused?0:this.volume;this.master.gain.setTargetAtTime(this.paused?0:v*this.effectsLevel,t,.025);this.uiBus.gain.setTargetAtTime(v*this.effectsLevel,t,.025);this.musicBus.gain.setTargetAtTime(v*this.musicLevel,t,.08);if(!v||!this.musicLevel)this.recordings?.suspend();if(!v){this.effects.stopWorld();this.effects.ui.stop();this.music.update(this.music.theme,false);}}
 // A narrator over the music (track-history.js; amount 0..1): while he speaks the music steps down about 8 dB and
 // gives way 10 dB in the voice's band (a wide cut round 1.5 kHz), so both are heard; it comes back up slowly when he
 // stops (a pause for a picture, the end of a line).
 duckMusic(amount){
  if(!this.context)return;const a=clamp(amount,0,1);if(Math.abs(a-this.ducked)<.01)return;
  const t=this.context.currentTime,rate=a>this.ducked?.06:.45;this.ducked=a;
  this.musicDuck.gain.setTargetAtTime(1-.6*a,t,rate);this.voiceCut.gain.setTargetAtTime(-10*a,t,rate);
 }
 setPaused(value){if(value&&!this.paused){this.effects?.stopWorld();this.recorded?.set(0,950,0,0);this.recorded?.flush();this.tyres?.silence();}this.paused=value;this.applyVolume();}
 setFocused(value){this.focused=value;this.applyVolume();}
 effect(name,options={}){if(!this.paused&&!this.muted&&this.focused&&this.volume>0&&this.effectsLevel>0&&this.context?.state==='running')this.effects.play(name,options);}
 async uiClick(){await this.unlock();if(!this.muted&&this.focused)this.effects?.play('click',{},true);}
 // Heard while the effects slider moves: a stretch of the recorded starter (mid-range, clear on
 // phone and laptop speakers; the old 55 Hz synth preview was nearly silent there), whose loudness
 // follows the slider as it plays; the synthesized catch if the recording is missing.
 async previewEffects(){await this.unlock();const t=this.context?.currentTime??0;if(this.muted||!this.focused||!this.volume||!this.effectsLevel)return;if(this.effects?.previewSample('starter'))return;if(t-(this.previewAt??-10)<.35)return;this.previewAt=t;this.effects?.play('engineCatch',{strength:.6},true);}
 updateScene(scene={},events=[],dt=0){
  // The track's water (weather.js wetness) for the tyres in update(), from the next frame.
  this.wet=scene.wet??0;
  if(!this.context)return;
  const enabled=this.focused&&!this.muted&&this.volume>0&&this.context.state==='running';
  if(!this.paused)this.hasDriven=true;
  if(enabled&&this.paused&&!this.hasDriven)this.openingTime+=dt;
  // A track's story (track-history.js) picks its own music, or none ('none').
  if(this.themeOverride){const quiet=this.themeOverride==='none',on=enabled&&this.musicLevel>0&&!quiet,theme=quiet?'menu':this.themeOverride;
   const recorded=this.recordings?.update(theme,on);this.music.update(theme,on&&!recorded);
   this.effects.update(scene,enabled&&!this.paused&&this.effectsLevel>0);this.recorded?.flush();for(const event of events)this.effect(event.name,event.options);return;}
  let theme=scene.phase==='free-finish'?(scene.won?'victory':'defeat'):this.paused?(!this.hasDriven&&(this.recordings?.has('opening')?!this.recordings.ended:this.openingTime<18)?'opening':'menu'):
   ['broken','tow','snag','disqualified'].includes(scene.phase)?'defeat':['podium','complete'].includes(scene.phase)?(scene.won?'victory':'defeat'):
   scene.driving||scene.phase==='grid'?'race':scene.phase==='crowd'?'sponsor':'menu';
  const recorded=this.recordings?.update(theme,enabled&&this.musicLevel>0);
  this.music.update(theme,enabled&&this.musicLevel>0&&!recorded);
  this.effects.update(scene,enabled&&!this.paused&&this.effectsLevel>0);
  this.recorded?.flush();
  for(const event of events)this.effect(event.name,event.options);
 }
 notifyPhone(){
  const ctx=this.context;if(this.paused||!ctx||ctx.state!=='running')return;
  const t=ctx.currentTime;
  for(const [offset,hz] of [[0,1175],[.11,1568]]){
   const tone=ctx.createOscillator(),gain=ctx.createGain();tone.type='sine';tone.frequency.value=hz;
   gain.gain.setValueAtTime(0,t+offset);gain.gain.linearRampToValueAtTime(.075,t+offset+.008);gain.gain.exponentialRampToValueAtTime(.001,t+offset+.13);
   tone.connect(gain);gain.connect(this.master);tone.start(t+offset);tone.stop(t+offset+.15);tone.onended=()=>{tone.disconnect();gain.disconnect();};
  }
 }
 shift(up){
  this.shifts++;
  const ctx=this.context;if(!ctx||ctx.state!=='running')return;
  const t=ctx.currentTime,k=this.tuning;this.shiftUntil=t+k.shiftCut;
  if(k.shiftClack>.001){
   const source=ctx.createBufferSource();source.buffer=this.noiseBuffer;
   const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=up?650:950;
   const gain=ctx.createGain();gain.gain.setValueAtTime(.001,t);gain.gain.exponentialRampToValueAtTime(k.shiftClack,t+.008);gain.gain.exponentialRampToValueAtTime(.001,t+.11);
   source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start(t);source.stop(t+.12);
   source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  }
  // A downshift off the throttle at high revs now and then cracks in the exhaust.
  if(!up&&this.lastThrottle<.1&&this.state.rpm>4500&&Math.random()<k.downshiftPops)this.tyres?.pop(.45*k.pops,.03);
 }
 update(car,command,skid,paused,mode){
  if(this.paused!==paused)this.setPaused(paused);
  if(paused)return this.state;
  // Listening to another car (a watched rival) is not a gear change.
  if(car!==this.source){this.source=car;this.lastGear=null;}
  const kind=car.mechanics?.name==='fusca'?'fusca':'opala';
  if(kind!==this.kind){this.kind=kind;this.retune();}
  this.recorded?.use(ENGINE_SOUNDS[kind]);
  const speed=Math.hypot(car.vx,car.vy)*3.6;
  const wheelspin=car.rearSlipSpeed??0,physicsGear=Number.isInteger(car.gear)&&Number.isFinite(car.rpm);
  let gear=Number.isInteger(this.state.gear)?this.state.gear:1;
  if(physicsGear)gear=Math.max(1,car.gear);
  else{
   // Hysteresis prevents repeated shifts when speed oscillates around a threshold.
   while(gear<5&&speed>gear*42+1.5)gear++;
   while(gear>1&&speed<(gear-1)*42-2.5)gear--;
  }
  // Câmbio manual (car.manualGear): the gear the player put in, at a standstill too, and neutral. Held at the start
  // (command.held: the countdown, the story's grid) the car cannot move, so the throttle revs it in neutral.
  const manual=physicsGear&&car.manualGear;
  if(command.reverse||car.gear<0)gear='R';else if(command.held||manual&&car.gear===0)gear='N';else if(wheelspin>1&&!physicsGear)gear=1;else if(!manual&&speed<2&&!(physicsGear&&command.throttle>.05))gear='N';
  if(Number.isInteger(gear)&&Number.isInteger(this.lastGear)&&gear!==this.lastGear)this.shift(gear>this.lastGear);
  if(command.engineOff)gear='N';
  this.lastGear=gear;
  const throttle=clamp(Math.max(command.throttle||0,command.reverse||0),0,1);
  const ratio=gear==='R'?150:[0,138,73,49,37,30][gear];
  // (declutched or in neutral, physics revs the engine free)
  const target=command.engineOff?0:clamp(command.held?950+throttle*3200:manual&&gear!=='R'?car.rpm+(gear==='N'?0:throttle*120):gear==='N'?950+throttle*3200:physicsGear&&gear!=='R'?car.rpm+throttle*120:950+(speed+wheelspin*3.6)*ratio+throttle*250,950,7400);
  // Pulling away, a gear's heard revs may start at the share of the rev counter the car's settings give it
  // ("Começo do som", m<gear>From; first gear 50%: its bottom sounded odd) and climb with the wheels to the
  // upshift (engine-loops.js firstGearRevs, gearRevs; not with the clutch pedal of the manual gearbox: there the
  // player revs it); from idle in first at tuning.launch rpm/s. The throttle as heard opens over gasRise s and
  // shuts over gasFall s. Revving free, the revs wind down on the flywheel (freeRevFall) and the throttle shuts over
  // freeGasFall s.
  const k=this.tuning,ctx=this.context,now=ctx?.currentTime??null,dt=now===null||this.heardAt===null||this.heardAt===undefined?0:clamp(now-this.heardAt,0,.1);this.heardAt=now;
  const gears=car.mechanics?.gears??OPALA_GEARS,share=Number.isInteger(gear)?k[`m${gear}From`]??0:0;
  const pulling=Number.isInteger(gear)&&share>0&&!manual&&physicsGear&&throttle>.2&&target<SHIFT_UP,free=gear==='N'||manual&&(command.clutch??0)>.5;
  const wanted=!pulling?target:gear===1?(speed*gears[1]<SHIFT_UP?firstGearRevs(speed,gears[1],share):target):gearRevs(target,SHIFT_UP*gears[gear]/gears[gear-1],share);
  const rpm=dt&&this.heardRpm!==null?heardRevs(this.heardRpm,wanted,dt,pulling&&gear===1?k.launch:k.revRise,free?freeRevFall(this.heardRpm,k.freeFall):k.revFall):wanted;this.heardRpm=rpm;
  const gas=dt&&this.gas!==null?this.gas+(throttle-this.gas)*(1-Math.exp(-dt/Math.max(.005,throttle>this.gas?k.gasRise:free?k.freeGasFall:k.gasFall))):throttle;this.gas=gas;
  this.state={gear,rpm,skid:car.surface.onRoad&&(speed>5||wheelspin>1)?clamp(Math.max(skid,wheelspin/20),0,1):0,throttle};
  if(!ctx)return this.state;
  const t=ctx.currentTime,param=(p,v,tau=.06)=>p.setTargetAtTime(v,t,tau);
  // (command.listen: the pilot walking away from his idling car, free-walk.js, hears it fainter.)
  const inside=mode==='cockpit',distance=(mode==='aerial'?.38:1)*(command.listen??1),shifting=t<this.shiftUntil,running=command.engineOff?0:1;
  param(this.synthGain.gain,this.recorded?.ready?0:1,.08);
  if(this.recorded?.ready){
   // The throttle picks open or closed loops (lifting at speed is the engine braking, not silence); a gear change
   // lifts it for a moment; at the limiter the ignition cuts in and out. Each gear (and neutral, reverse) has its
   // own level, pitch, bass and highs over the car's (m<gear><part>). The last gear never stutters at the limiter:
   // there it is the car's top speed (physics cuts the drive at its redline, 217 km/h for the Opala, 172 for a
   // Fusca in a tow), and from the limiter's revs (6940, 212 km/h in an Opala's fifth) on the cut made the engine
   // tremble; it pulls to the end on the open loops and holds its top note. Declutched it revs free and cuts.
   const lastGear=gear===gears.length-1&&!(manual&&(command.clutch??0)>.25);
   const cutting=!lastGear&&gas>.5&&rpm>k.limiterRpm&&Math.floor(t*k.limiterRate*2)%2===0,load=shifting||cutting?0:gas;
   const g=part=>k[`m${gear}${part}`]??(part==='Bass'?0:1);
   this.recorded.set(0,(rpm-(cutting?k.limiterDrop:0))*k.pitch*g('Pitch'),load,running*engineLevel(rpm,load,k.idle,k.lift));
   param(this.engineFilter.frequency,clamp((inside?k.cabinHighs*(1+gas*.73):k.highs*(1+gas*.8))*g('Highs'),200,20000));
   param(this.engineBass.gain,k.bass+g('Bass'),.08);
   param(this.engineGain.gain,running*k.engine*g('Volume')*(inside?k.cabinVolume:1)*(shifting?k.shiftDip:1)*distance,.05);
   this.overrun(throttle,rpm,command,t);
  }else{
   // Three firing pulses per revolution: four-stroke inline-six character.
   param(this.engine.frequency,rpm/20);param(this.sub.frequency,rpm/40);
   param(this.engineFilter.frequency,inside?1100+gas*850:1600+gas*1900);
   param(this.engineGain.gain,running*(.22+gas*.23+rpm/7400*.07)*(shifting?.3:1)*distance,.035);
   param(this.rasp.gain,.04+gas*.19);
  }
  this.lastThrottle=throttle;
  if(this.wet>0){
   // On a wet track (a drizzle or the rain) a tyre neither sings nor screeches (the pilots, 30/10): a slide, a lock-up
   // or a spin only scrapes, a dull hiss from the noise bed, and a corner at the limit is silent.
   this.tyres?.silence();param(this.squealGain.gain,0,.05);
   this.scrubLevel=this.state.skid*k.scrub*.3*distance*(inside?k.tyresInside:1);
   param(this.tyreFilter.frequency,(420+speed*2+Math.sin(t*9)*40)*k.tyrePitch);
   param(this.tyreGain.gain,this.scrubLevel,.06);
  }else if(this.tyres?.ready){
   this.scrubLevel=0;
   // Recorded tyres: they sing as the car nears its cornering grip, screech in slides, lock-ups and spins.
   param(this.tyreGain.gain,0,.05);param(this.squealGain.gain,0,.05);
   const grip=12.2*(car.mechanics?.grip??1)*(car.weatherGrip??1);
   const corner=car.surface.onRoad&&speed>30?clamp((Math.abs(car.latAccel??0)/grip-k.singFrom)/(1-k.singFrom),0,1):0;
   const skid=this.state.skid,sing=Math.max(corner*.7,skid),hard=clamp((skid-.35)/.45,0,1),level=distance*(inside?k.tyresInside:1);
   this.tyres.set('canta',level*k.sing*sing*(1-.55*hard),(.93+.1*sing+.025*Math.sin(t*1.7)+.015*Math.sin(t*4.1))*k.tyrePitch);
   this.tyres.set('arrasta',level*k.screech*hard,(.9+.14*hard+.02*Math.sin(t*2.3))*k.tyrePitch);
  }else{
   this.scrubLevel=0;
   param(this.tyreGain.gain,this.state.skid*.65*distance,.035);
   param(this.tyreFilter.frequency,1500+speed*5+Math.sin(t*13)*130);
   param(this.squeal.frequency,900+speed*4+Math.sin(t*19)*65);
   param(this.squealGain.gain,this.state.skid*.075*distance,.035);
  }
  return this.state;
 }
 // Pops in the exhaust when the throttle shuts at high revs (open to under 15% within 0.3 s; pedals and keys
 // ramp over a few frames): most lifts, one to four pops a little apart.
 overrun(throttle,rpm,command,t){
  if(throttle>.6){this.openAt=t;this.lifted=false;}
  const k=this.tuning;
  if(command.engineOff||this.lifted||!this.tyres?.ready||throttle>=.15||t-(this.openAt??-1)>.3||rpm<k.popsMinRpm)return;
  this.lifted=true;if(Math.random()>=k.popChance)return;
  for(let i=0,n=1+Math.floor(Math.random()*(rpm>5600?k.popsMax:Math.ceil(k.popsMax/2))),delay=.04;i<n;i++,delay+=.06+Math.random()*.16)this.tyres.pop((.35+.4*Math.random())*rpm/7000*k.pops,delay);
 }
 // The player's horn (car-horn.js), held while `on`: the Opala's pair or the Fusca's ('opala', 'fusca'). Not heard paused.
 honk(on,kind,mode){this.horn?.update(on&&!this.paused,kind,mode);}
 // The team's sound whatever this browser's bench sets say (a build without the sound bench).
 useDefaultSound(){this.tunings={opala:soundDefaults(),fusca:soundDefaults()};this.tuningSource='padrão';this.retune();}
 // The current car's settings again (after the sound bench changed them, or the car changed).
 retune(){this.tuning=this.tunings[this.kind]??this.tunings.opala;this.applyTuning();}
 // The settings the audio graph holds (the rest are read every frame in update).
 applyTuning(){
  if(!this.context)return;
  const k=this.tuning;
  this.enginePresence.gain.setTargetAtTime(k.presence,this.context.currentTime,.05);
  this.engineDrive.curve=driveCurve(k.drive);
  this.recorded?.shape(k);
  if(this.effects)this.effects.tuning=k;
 }
 info(){
  let rms=0;if(this.analyser){this.analyser.getFloatTimeDomainData(this.meter);rms=Math.sqrt(this.meter.reduce((s,x)=>s+x*x,0)/this.meter.length);}
  return {...this.state,volume:this.volume,musicVolume:this.musicVolume,effectsVolume:this.effectsVolume,muted:this.muted,musicMuted:!!this.musicMuted,effectsMuted:!!this.effectsMuted,focused:this.focused,paused:this.paused,context:this.context?.state??'locked',shifts:this.shifts,rms,worldGain:this.master?.gain.value??0,music:this.music?.info(),recordings:this.recordings?.info(),effects:this.effects?.info(),synthEngine:!!this.synthEngine,tuning:{source:this.tuningSource,car:this.kind},engine:this.recorded?.info()??null,tyres:this.tyres?.info()??null,wet:this.wet??0,scrub:+(this.scrubLevel??0).toFixed(3),horn:this.horn?.info()??null,error:this.error};
 }
}
