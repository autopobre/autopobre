import {engineLevel,firstGearRevs,SHIFT_UP} from './engine-loops.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));

// Small, bounded Web Audio instrument rack shared by effects and original music.
export class Synth {
 constructor(ctx,output,noise,max=96){this.ctx=ctx;this.output=output;this.noise=noise;this.max=max;this.voices=new Set();this.peak=0;}
 note({at=this.ctx.currentTime,hz=440,end=hz,duration=.2,gain=.1,type='sine',filter=5000,q=.6,pan=0,attack=.008,grit=0,tag='world'}){
  if(this.voices.size>=this.max)return;
  const ctx=this.ctx,t=Math.max(at,ctx.currentTime),source=type==='noise'?ctx.createBufferSource():ctx.createOscillator();
  if(type==='noise'){source.buffer=this.noise;source.loop=true;}else{source.type=type;source.frequency.setValueAtTime(Math.max(20,hz),t);source.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);}
  const tone=ctx.createBiquadFilter();tone.type=type==='noise'?'bandpass':'lowpass';tone.frequency.value=filter;tone.Q.value=q;
  const level=ctx.createGain(),stereo=ctx.createStereoPanner();stereo.pan.value=clamp(pan,-1,1);
  level.gain.setValueAtTime(0,t);level.gain.linearRampToValueAtTime(clamp(gain,0,.75),t+Math.min(attack,duration*.3));level.gain.exponentialRampToValueAtTime(.0001,t+duration);
  source.connect(tone);const nodes=[source,tone,level,stereo];
  if(grit){const shape=ctx.createWaveShaper();shape.curve=Float32Array.from({length:256},(_,i)=>Math.tanh((i/127.5-1)*grit)/Math.tanh(grit));shape.oversample='2x';tone.connect(shape);shape.connect(level);nodes.push(shape);}else tone.connect(level);
  level.connect(stereo);stereo.connect(this.output);
  const voice={source,level,nodes,tag};this.voices.add(voice);this.peak=Math.max(this.peak,this.voices.size);
  source.onended=()=>{nodes.forEach(n=>n.disconnect());this.voices.delete(voice);};
  source.start(t);source.stop(t+duration+.03);
 }
 stop(tag=null,fade=.025){const t=this.ctx.currentTime;for(const v of this.voices){if(tag&&v.tag!==tag)continue;v.level.gain.cancelScheduledValues(t);v.level.gain.setTargetAtTime(0,t,fade/3);try{v.source.stop(t+fade);}catch{}}}
}

export const EFFECT_NAMES=Object.freeze(['pitRepair','pitCoffee','click','paint','crowdWelcome','talk','donation','badJoke','noDonation','paper','fuelFill','denied','ignition','engineCatch','countdown','raceGo','flooded','batteryDead','fuelEmpty','breakdown','collision','debrisFly','debrisMiss','glassHit','glassBreak','tankDrop','towArrive','towBrake','strapSnag','strapFree','towWarning','finish','judgeStart','judgeCheck','judgeApprove','disqualified','podiumWin','podiumLoss','blazer','footstep','reserve','sip','bite','splash','wade','bonk','boing','passBy','explosion']);

export class SoundEffects {
 constructor(ctx,world,ui,noise){
  this.ctx=ctx;this.output=world;this.uiOutput=ui;this.world=new Synth(ctx,world,noise);this.ui=new Synth(ctx,ui,noise,12);this.counts={};this.last={};this.loops={};this.levels={};this.ambientAt=0;this.warningAt=0;this.wasBraking=false;
  // Recorded effects: the starter cranking comes from car_trying_to_start.mp3 once it has
  // loaded; until then, or without the file, the synthesized loop stands in.
  this.samples={};this.loadSample('starter','./assets/audio/car_trying_to_start.mp3');
  for(const [name,wave,hz,cut] of [['starter','sawtooth',95,700],['tow','sawtooth',45,550],['rival0','sawtooth',90,1100],['rival1','sawtooth',85,900],['crowd','noise',0,460],['gravel','noise',0,1400],['wind','noise',0,650],['scrape','noise',0,2700],['leak','noise',0,700],['kerb','square',60,520],['rain','noise',0,3400],['spray','noise',0,1100]]){
   const source=wave==='noise'?ctx.createBufferSource():ctx.createOscillator();
   if(wave==='noise'){source.buffer=noise;source.loop=true;}else{source.type=wave;source.frequency.value=hz;}
   const filter=ctx.createBiquadFilter();filter.type=wave==='noise'?'bandpass':'lowpass';filter.frequency.value=cut;filter.Q.value=.7;
   const level=ctx.createGain(),pan=ctx.createStereoPanner();level.gain.value=0;source.connect(filter);filter.connect(level);level.connect(pan);pan.connect(world);source.start();
   this.loops[name]={source,filter,level,pan};this.levels[name]=0;
  }
 }
 // Rival engines from recordings (engine-loops.js voices 1 and 2): each through a low-pass that closes with
 // distance (air and the other cars' bodies take the highs) and a panner; the synthesized rival loops stay
 // for when the recordings cannot play.
 useRecordedRivals(engines,tuning){
  for(const v of this.rivalVoices??[]){v.filter.disconnect();v.pan.disconnect();}
  this.engines=engines;this.tuning=tuning;this.rivalVoices=[];
  if(!engines)return;
  this.rivalVoices=[1,2].map(i=>{const filter=this.ctx.createBiquadFilter(),pan=this.ctx.createStereoPanner();filter.type='lowpass';filter.Q.value=.5;engines.outputs[i].connect(filter);filter.connect(pan);pan.connect(this.output);return {filter,pan,ref:null,distance:0,at:0,radial:0};});
 }
 loadSample(name,url){fetch(url).then(r=>{if(!r.ok)throw Error(url);return r.arrayBuffer();}).then(data=>this.ctx.decodeAudioData(data)).then(buffer=>{this.samples[name]={buffer,source:null,level:null};}).catch(()=>{});}
 // A recorded loop that sounds while its gain is above zero (from the top on each start).
 // One stretch of a recording on the interface bus (the settings' effects preview): false when it
 // has not loaded. While one plays another does not start; the bus follows the slider live.
 previewSample(name,duration=1.4){
  const s=this.samples[name],t=this.ctx.currentTime;if(!s)return false;if(this.previewUntil>t)return true;
  const source=this.ctx.createBufferSource(),level=this.ctx.createGain(),end=t+Math.min(duration,s.buffer.duration);source.buffer=s.buffer;
  level.gain.setValueAtTime(0,t);level.gain.linearRampToValueAtTime(.55,t+.03);level.gain.setValueAtTime(.55,end-.18);level.gain.linearRampToValueAtTime(0,end);
  source.connect(level);level.connect(this.uiOutput);source.onended=()=>{source.disconnect();level.disconnect();};source.start(t);source.stop(end+.02);
  this.previewUntil=end;this.counts.preview=(this.counts.preview||0)+1;return true;
 }
 sampleLoop(name,gain,rate=1){
  const s=this.samples[name],t=this.ctx.currentTime;if(!s)return;
  if(gain>0&&!s.source){const source=this.ctx.createBufferSource(),level=this.ctx.createGain();source.buffer=s.buffer;source.loop=true;level.gain.value=0;source.connect(level);level.connect(this.output);source.start();Object.assign(s,{source,level});}
  if(!s.source)return;
  s.level.gain.setTargetAtTime(gain,t,.03);s.source.playbackRate.setTargetAtTime(rate,t,.08);
  if(gain<=0){const {source,level}=s;source.onended=()=>{source.disconnect();level.disconnect();};source.stop(t+.2);s.source=s.level=null;}
 }
 play(name,options={},ui=false){
  if(!EFFECT_NAMES.includes(name))return false;
  const t=this.ctx.currentTime,minGap={collision:.3,glassHit:.15,footstep:.2,click:.06,towBrake:1.5,towWarning:2.5,splash:.35,wade:.22,passBy:.11}[name]??.08;
  if(t-(this.last[name]??-100)<minGap)return false;
  this.last[name]=t;this.counts[name]=(this.counts[name]||0)+1;
  const rack=ui?this.ui:this.world,pan=clamp(options.pan??0,-1,1),strength=clamp(options.strength??1,.2,1.5);
  const note=(hz,duration,gain,type='sine',delay=0,end=hz,filter=5000,p=pan)=>rack.note({at:t+delay,hz,end,duration,gain:gain*strength,type,filter,pan:p});
  const noise=(duration,gain,filter=1200,delay=0,p=pan)=>note(440,duration,gain,'noise',delay,440,filter,p);
  const metal=(gain=.25)=>{noise(.18,gain,950);note(157,.35,gain*.45,'triangle',0,57,2000);note(713,.25,gain*.18,'square',.01,400,1800);};
  const chime=(tones,gain=.09,spacing=.13)=>tones.forEach((n,i)=>note(n,.45,gain,'triangle',i*spacing));
  const whistle=(delay=0)=>{note(2350,.25,.065,'sine',delay,2100);noise(.2,.035,2600,delay);};
  const cheer=(duration=1.2)=>{for(let i=0;i<8;i++){const d=i*.07,p=(i%3-1)*.65;noise(duration-i*.045,.09,550+i*85,d,p);note(210+i*21,.55,.015,'sawtooth',d,330+i*20,800,p);}whistle(.3);};
  switch(name){
   case 'pitRepair':noise(.1,.14,2300);note(680,.13,.06,'square',.1,310,1800);metal(.07);break;
   case 'pitCoffee':noise(.8,.045,700);chime([440,554,659],.04);break;
   case 'click':note(820,.07,.045,'triangle',0,520);break;
   case 'paint':noise(.3,.065,3000);chime([660,990],.045);break;
   case 'crowdWelcome':cheer(1.3);break;
   case 'talk':note(170,.22,.04,'sawtooth',0,220,650);note(210,.2,.035,'sawtooth',.18,140,850);break;
   case 'donation':for(let i=0;i<5;i++){note(180+i*8,.15,.07,'sawtooth',i*.16,120,900,(i%2-.5)*.5);noise(.09,.045,650,i*.16);}chime([1568,2093,2637],.075,.1);break;
   case 'badJoke':chime([294,277,247,196],.065,.18);noise(.16,.025,1700,.7);break;
   case 'noDonation':chime([330,294],.045);break;
   case 'paper':noise(.24,.065,2200);note(130,.06,.05,'triangle',.17,85);break;
   case 'fuelFill':for(let i=0;i<9;i++)note(90+(i%4)*37,.18,.055,'sine',i*.1,200+(i%3)*45,700);noise(.9,.075,900);chime([1047,1568],.06,.18);break;
   case 'denied':note(160,.14,.07,'square',0,130,650);note(130,.2,.06,'square',.17,100,650);break;
   case 'ignition':metal(.16);note(300,.12,.055,'square',.08,120,650);break;
   case 'engineCatch':for(let i=0;i<4;i++)noise(.09,.14,350,i*.075);note(55,.9,.16,'sawtooth',.18,160,900);break;
   case 'countdown':note(660,.18,.095,'sine');break;
   case 'raceGo':note(1320,.55,.11,'sine');cheer(.8);break;
   case 'flooded':case 'breakdown':for(let i=0;i<5;i++){noise(.12,.1,320,i*.13);note(100-i*12,.16,.075,'sawtooth',i*.13,35,600);}break;
   case 'batteryDead':for(let i=0;i<4;i++)note(600-i*90,.05,.06,'square',i*.22,130,800);break;
   case 'fuelEmpty':for(let i=0;i<3;i++)noise(.16,.09,280,i*.18);chime([440,330,220],.04,.2);break;
   case 'collision':metal(.4);noise(.42,.25,350);break;
   // A car going up at the foot of a plateau's wall (explosion.js): the boom, its low roll, the crackle of the fire and metal.
   case 'explosion':noise(1.8,.55,160);noise(1.1,.4,520,.02);note(52,1.6,.45,'sine',0,24,260);note(80,.7,.25,'triangle',.03,35,400);for(let i=0;i<9;i++)noise(.1,.14,2200+i*230,.18+i*.13,(i%3-1)*.5);metal(.22);noise(2.6,.12,900,.4);break;
   case 'debrisFly':noise(.35,.09,1900,0,-.6);noise(.45,.1,3100,.3,.2);noise(.25,.07,4100,.65,.7);note(600,.65,.015,'sine',0,1600);break;
   case 'debrisMiss':noise(.25,.11,2900);noise(.08,.045,1800,.25);break;
   case 'glassHit':note(2700,.12,.095,'triangle',0,1100);noise(.22,.17,3800);metal(.08);break;
   case 'glassBreak':noise(.9,.24,4400);for(let i=0;i<10;i++)note(1200+(i*379)%4200,.16,.035,'triangle',i*.06,700+(i*503)%3000,6500,(i%3-1)*.6);break;
   case 'tankDrop':metal(.32);note(78,.8,.12,'triangle',.12,38,700);noise(.6,.12,2400,.2);break;
   case 'towArrive':note(220,.25,.08,'square',0,220,550);note(277,.25,.055,'square',0,277,650);noise(.55,.11,1000,.25);metal(.2);break;
   case 'towBrake':noise(.6,.13,1600);note(550,.18,.028,'sine',0,370);break;
   case 'strapSnag':metal(.28);note(220,.45,.08,'sawtooth',0,55,650);noise(.45,.11,2000);break;
   case 'strapFree':metal(.14);noise(.25,.08,1700,.2);chime([440,660],.045);break;
   case 'towWarning':case 'reserve':note(880,.1,.055,'sine');note(660,.1,.045,'sine',.2);break;
   case 'finish':whistle();cheer(1);break;
   case 'judgeStart':whistle();noise(.3,.075,1800,.28);break;
   case 'judgeCheck':noise(.08,.075,1900);note(500,.06,.035,'triangle',.09,300);break;
   case 'judgeApprove':noise(.08,.16,700);note(100,.12,.13,'triangle',0,50);chime([523,659,784],.065);break;
   case 'disqualified':whistle();chime([392,311,247,196],.075,.18);break;
   case 'podiumWin':cheer(2);chime([587,740,880,1175],.075,.15);break;
   case 'podiumLoss':noise(.8,.055,530);chime([370,330,294],.045,.25);break;
   case 'blazer':noise(.08,.12,650);chime([587,740,880,1175],.085);note(65,1.1,.11,'sawtooth',.5,130,850);break;
   case 'footstep':noise(.08,.1,650);note(95,.09,.045,'sine',0,45);break;
   // A sip of coffee (slurp and gulp) and a bite of pão de queijo in the pits.
   case 'sip':noise(.22,.05,1500);noise(.12,.04,900,.18);note(210,.12,.05,'sine',.34,120);break;
   case 'bite':noise(.07,.09,3200);noise(.06,.07,2600,.09);noise(.1,.05,1800,.2);break;
   // The Opala in a lake: a heavy splash with a thump and bubbles; water swishing past the wheels.
   case 'splash':note(70,.35,.14,'sine',0,38,420);noise(.9,.2,900);noise(.55,.15,2600,.03);for(let i=0;i<6;i++)note(480+(i*173)%620,.07,.028,'sine',.14+i*.075,900+(i*211)%700,3200,(i%3-1)*.4);break;
   case 'wade':noise(.34,.075,1100);noise(.24,.05,2300,.06);note(260,.12,.018,'sine',.05,430,2000);break;
   // Someone run over (by accident): a cartoon bonk and a slide whistle up as they fly;
   // a rubbery boing each time they bounce off the ground.
   case 'bonk':note(150,.12,.16,'triangle',0,70,900);noise(.08,.12,700);note(520,.75,.05,'sine',.08,1900,4000);break;
   case 'boing':note(140,.38,.09,'sine',0,360,1400);note(95,.3,.05,'triangle',.02,210,900);break;
   // A pole, rod or board flicking past the window at speed (trackside-flags.js): a short swell of air
   // falling in pitch, on its side.
   case 'passBy':for(const [delay,duration,gain,filter,side] of [[0,.13,.1,2600,1],[.03,.17,.085,1350,.8],[.07,.2,.055,700,.5]])rack.note({at:t+delay,hz:440,duration,gain:gain*strength,type:'noise',filter,q:.9,pan:pan*side,attack:.04});break;
  }
  return true;
 }
 update(scene={},audible=true){
  const t=this.ctx.currentTime,speed=clamp(scene.speed??0,0,100),factor=scene.camera==='aerial'?.5:scene.camera==='cockpit'?.68:1;
  const level=(name,value,hz,pan=0)=>{const loop=this.loops[name],v=audible?value*factor:0;this.levels[name]=v;loop.level.gain.setTargetAtTime(v,t,.045);loop.pan.pan.setTargetAtTime(pan,t,.07);if(hz&&loop.source.frequency)loop.source.frequency.setTargetAtTime(hz,t,.06);};
  const starting=scene.phase==='starting'&&scene.starter,towing=scene.phase==='tow'||scene.phase==='snag'||scene.phase==='broken';
  // The recording slows as the battery sags (it does not recover between tries); a little throttle lifts it.
  const sag=1-clamp(scene.battery??1,0,1);
  if(this.samples.starter){level('starter',0);const gain=starting&&audible?.5*factor:0;this.sampleLoop('starter',gain,1-sag*.24+(scene.pressure||0)*.08);this.levels.starter=gain;}
  else level('starter',starting?.075*(.7+.3*Math.sin(t*43))*(1-sag*.4):0,80+(scene.pressure||0)*60);
  level('tow',towing?.06+(scene.truckSpeed||0)*.012:0,40+(scene.truckSpeed||0)*9,.15);
  level('crowd',['crowd','podium'].includes(scene.phase)?.024*(.8+.2*Math.sin(t*1.3)):0);
  // Kerbs are not dirt: with the wheels' surfaces known (kerb-contact.js) the gravel waits for two of them off the kerb.
  level('gravel',(scene.kerb?scene.kerb.dirt>=.5:scene.onRoad===false)?Math.min(.19,speed*.005):0);
  // The kerb's ridges under the tyres (0.4 m apart): a buzz at their rate, on the kerb's side.
  level('kerb',scene.kerb?.level>.02?(.05+.06*scene.kerb.level)*Math.min(1,speed/12):0,scene.kerb?.hz,scene.kerb?.pan??0);
  level('wind',scene.driving?Math.min(.075,speed*.0014):0);
  // The rush of air brightens and rises with speed (650 Hz standing, about 2.4 kHz flat out; 'Sensação de velocidade' Leve and up).
  this.loops.wind.filter.frequency.setTargetAtTime(scene.windSweep?650+Math.min(speed,62)**1.35*7:650,t,.12);
  // Rain (weather.js): the downpour's hiss (duller, the roof drumming, from the cockpit) and the tyres' hiss on the wet
  // track, rising with speed.
  level('rain',(scene.rain??0)*.06);this.loops.rain.filter.frequency.setTargetAtTime(scene.camera==='cockpit'?1500:3400,t,.25);
  level('spray',(scene.wet??0)*(scene.onRoad===false?.4:1)*Math.min(.09,speed*.0018));
  level('scrape',scene.tankDetached?Math.min(.15,speed*.012):0);
  level('leak',scene.tankDetached&&scene.fuel>0?.025:0);
  for(let i=0;i<2;i++){
  const r=scene.rivals?.[i];
  if(!this.engines?.ready){level('rival'+i,r?Math.max(0,1-r.distance/95)**2*.23:0,r?65+r.speed*4:65,r?.pan||0);continue;}
  level('rival'+i,0);
  const v=this.rivalVoices[i];
  if(!r||!audible){this.engines.set(i+1,950,0,0);v.ref=null;continue;}
  // Doppler: the car's speed towards the listener, from its change of distance since the last frame.
  if(v.ref===r.ref&&t>v.at){const radial=clamp((v.distance-r.distance)/(t-v.at),-90,90);v.radial+=(radial-v.radial)*.3;}else v.radial=0;
  Object.assign(v,{ref:r.ref,distance:r.distance,at:t});
  // A rival pulling away in first sounds as the car heard does (car-audio.js).
  const car=r.ref,first=car?.mechanics?.gears?.[1]??110,kmh=r.speed*3.6,pulling=car?.gear===1&&(r.throttle??0)>.2&&kmh*first<SHIFT_UP;
  const rpm=pulling?firstGearRevs(kmh,first,this.tuning?.firstFrom??.5):r.rpm??1000+r.speed*90,load=clamp(r.throttle??.35,0,1);
  this.engines.set(i+1,rpm*clamp(343/(343-v.radial),.8,1.3),load,engineLevel(rpm,load)*Math.max(0,1-r.distance/140)**2*.75*factor);
  v.filter.frequency.setTargetAtTime(900+9000*Math.max(0,1-r.distance/90)**1.5,t,.1);v.pan.pan.setTargetAtTime(r.pan||0,t,.07);
 }
  if(!audible)return;
  const braking=scene.phase==='tow'&&(scene.truckSpeed||0)<2;
  if(braking&&!this.wasBraking)this.play('towBrake');this.wasBraking=braking;
  if(scene.phase==='tow'&&scene.towGap<3&&t>this.warningAt){this.play('towWarning');this.warningAt=t+2.7;}
  if(scene.phase==='crowd'&&t>this.ambientAt){this.play('talk',{pan:Math.sin(t)*.7,strength:.4});this.ambientAt=t+4.5;}
 }
 stopWorld(){this.world.stop();this.update({},false);}
 info(){return {counts:{...this.counts},activeVoices:this.world.voices.size+this.ui.voices.size,peakVoices:this.world.peak+this.ui.peak,loops:{...this.levels},samples:Object.keys(this.samples)};}
}
