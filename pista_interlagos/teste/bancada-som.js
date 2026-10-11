// Sound bench (bancada-som.html): the game's own CarAudio, driven by a small car with the Opala's gears and
// shift points, to compare recorded engines and tune them by ear without loading a race. Not published.
import {CarAudio,TUNING} from './car-audio.js';

// The game's two cars (recorded loops) and, to compare, the old synthesized engine.
const ENGINES=[
 {id:'opala',name:'Opala',where:'aceleração: seis em linha (loops do BMW M3) · marcha lenta: Opala 1978 de verdade',credit:'ikbenraar 415275/415276 CC BY 4.0 · marfisa 365175 CC0',idle:'lenta_opala',car:'opala'},
 {id:'fusca',name:'Fusca',where:'aceleração: motor a ar (loops da Kombi) · marcha lenta: Fusca 1977 de verdade',credit:'jcharly97 674591 CC0 · nhaudio 332695 CC BY 4.0 · marfisa 365174 CC0',idle:'lenta_fusca',car:'fusca'},
 {id:null,name:'Sintetizado',where:'o som antigo do jogo, para comparar',credit:'sem gravação',car:'opala'},
];
const SLIDERS=[
 ['engine','Volume do motor',0,1.6,.05],
 ['bass','Graves (dB)',-12,12,1],
 ['highs','Agudos de fora: corte em Hz (menor = mais abafado)',800,16000,100],
 ['pitch','Tom geral (mais agudo ou mais grave)',.6,1.5,.01],
 ['idle','Volume na marcha lenta',.05,1,.01],
 ['idleOpala','Lenta do Opala: volume (só o Opala)',0,3,.05],
 ['idleFusca','Lenta do Fusca: volume (só o Fusca)',0,3,.05],
 ['lift','Volume com o pé fora',.05,1,.01],
 ['onFrom','Pé embaixo: usar loops só acima de (rpm) — abaixo, o loop bom mais baixo toca mais devagar',0,6200,100],
 ['firstFrom','Primeira marcha: o som começa em (fração da barra; 0,70 = 70%)',.3,.95,.01],
 ['launch','Primeira marcha: rapidez do salto da lenta (rpm por segundo)',2000,40000,500],
 ['gasRise','Acelerador: tempo para o pé "entrar" (segundos)',0,.8,.01],
 ['loopSpan','Até onde vai o loop de marcha lenta (× giro da lenta)',1.05,2.5,.05],
 ['sing','Pneu cantando: volume',0,1.5,.05],
 ['screech','Pneu arrastando: volume',0,1.5,.05],
 ['pops','Estouros: volume',0,2,.05],
 ['popChance','Estouros: chance ao tirar o pé',0,1,.05],
];
const $=id=>document.getElementById(id);
const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
let tuning={...TUNING,...load('bancada-som-ajustes',{})},engine=load('bancada-som-motor','opala'),audio=null,mode='chase';
if(!ENGINES.some(e=>e.id===engine))engine=ENGINES[0].id;

// --- The car: physics.js's numbers (gears in rpm per km/h, torque, the N m to m/s2 factor; OPALA_MECHANICS,
// FUSCA_MECHANICS), shift points, straight road.
const IDLE=950,RED=7000,UP=6650,DOWN=3100,SHIFT=.16;
const CARS={
 opala:{gears:[0,110,72,52,40,32.2],curve:[[0,190],[1000,215],[2500,300],[4000,360],[5000,352],[5500,338],[6500,280],[7000,240],[7400,0]],accel:2.714e-4,drag:4.3e-4},
 fusca:{gears:[0,118,82,62,49,40.8],curve:[[0,80],[1000,89],[2500,105],[4000,117],[4500,120],[5500,116],[6200,107],[7000,89],[7400,0]],accel:.9/2.6526/820,drag:.5*1.2*.9/820},
};
let mech=CARS.opala,GEARS=mech.gears;
const torque=rpm=>{const c=mech.curve;for(let i=1;i<c.length;i++)if(rpm<=c[i][0]){const [r0,t0]=c[i-1],[r1,t1]=c[i];return t0+(t1-t0)*(rpm-r0)/(r1-r0);}return 0;};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const car={vx:0,vy:0,surface:{onRoad:true},gear:1,rpm:IDLE,manualGear:false,latAccel:0,rearSlipSpeed:0,mechanics:{grip:1,gears:CARS.opala.gears},weatherGrip:1,shiftTimer:0,neutral:false};
function step(input,dt){
 const v=car.vx,kmh=v*3.6;
 car.latAccel=input.corner&&v>8?12.2*.97:0;
 if(car.neutral){
  car.manualGear=true;car.gear=0;
  car.rpm=clamp(car.rpm+(input.throttle>.05?input.throttle*11000:-4200)*dt,IDLE,RED+80);
  car.vx=Math.max(0,v-(.25+4.3e-4*v*v+input.brake*11)*dt);
  return 0;
 }
 car.manualGear=false;if(car.gear<1)car.gear=1;
 car.shiftTimer=Math.max(0,car.shiftTimer-dt);
 const wheel=kmh*GEARS[car.gear];
 if(car.shiftTimer===0){
  if(car.gear<5&&wheel>UP){car.gear++;car.shiftTimer=SHIFT;}
  else if(car.gear>1&&wheel<DOWN+(input.brake>.3?700:0)&&kmh*GEARS[car.gear-1]<UP-400){car.gear--;car.shiftTimer=SHIFT*.6;}
 }
 const wheelRpm=kmh*GEARS[car.gear],engineRpm=Math.max(wheelRpm,car.gear===1?IDLE+input.throttle*2600:IDLE);
 let drive=input.throttle*torque(Math.min(engineRpm,RED))*GEARS[car.gear]*mech.accel;
 if(wheelRpm>=RED)drive=0;if(car.shiftTimer>0)drive*=.12;
 const engineBrake=input.throttle<.05&&v>1?.18+.5*clamp(wheelRpm/RED,0,1):0;
 const brakes=input.brake*11+(input.hand&&v>.5?7:0);
 car.vx=Math.max(0,v+(drive-.12-mech.drag*v*v-engineBrake-(v>.05?brakes:0))*dt);
 car.rpm=clamp(engineRpm,IDLE,RED+80);
 // Tyre marks' strength, as skid-marks.js would have it: braking past 30% at speed, the handbrake's rear pair.
 return Math.max(clamp((input.brake-.3)/.7,0,1)*clamp((v-8)/7,0,1)*.72,input.hand&&v>2?.43:0);
}

// --- The demonstration: the same 34 s for every engine.
const DEMO=[
 [2,{},'Parado, em marcha lenta'],
 [10,{throttle:1},'Pé embaixo, passando as marchas'],
 [.4,{},'Tirando o pé de uma vez (estouros?)'],
 [2.6,{brake:.85},'Freada forte, reduzindo marchas'],
 [3,{throttle:.45,corner:true},'Curva no limite, meio acelerador'],
 [8,{throttle:1},'Saída de curva, pé embaixo'],
 [.5,{},'Tirando o pé'],
 [3.5,{brake:.5},'Freando até parar'],
 [.4,{neutral:true,throttle:1},'Ponto morto: acelerada'],[.6,{neutral:true},''],
 [.4,{neutral:true,throttle:1},''],[.6,{neutral:true},''],
 [.5,{neutral:true,throttle:1},''],[1.6,{neutral:true},'Marcha lenta'],
];
const DEMO_TIME=DEMO.reduce((s,[d])=>s+d,0);
let demo=null;
function demoInput(t){
 let at=0;for(const [d,input,label] of DEMO){if(t<at+d){if(label)demo.label=label;return input;}at+=d;}
 return null;
}

// --- Controls: buttons held with the pointer, or the keys.
const held={throttle:0,brake:0,hand:false,corner:false};
const hold=(id,key,on)=>{const b=$(id);const set=v=>{held[key]=key==='hand'||key==='corner'?v:+v;b.classList.toggle('held',v);};
 b.addEventListener('pointerdown',e=>{b.setPointerCapture(e.pointerId);set(true);});
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>set(false));return set;};
const keys={gas:hold('gas','throttle'),brake:hold('brake','brake'),hand:hold('hand','hand'),corner:hold('corner','corner')};
const KEYMAP={KeyW:'gas',ArrowUp:'gas',KeyS:'brake',ArrowDown:'brake',Space:'hand',KeyA:'corner'};
addEventListener('keydown',e=>{
 if(e.target.tagName==='INPUT')return;
 if(KEYMAP[e.code]){e.preventDefault();keys[KEYMAP[e.code]](true);return;}
 if(e.repeat)return;
 if(e.code==='KeyN')toggleNeutral();else if(e.code==='KeyC')toggleCamera();else if(e.code==='KeyD')startDemo();
 else if(/^Digit[1-9]$/.test(e.code)){const i=+e.code.slice(5)-1;if(ENGINES[i])choose(ENGINES[i].id);}
});
addEventListener('keyup',e=>{if(KEYMAP[e.code])keys[KEYMAP[e.code]](false);});
const toggleNeutral=()=>{car.neutral=!car.neutral;if(!car.neutral)car.gear=1;$('neutral').classList.toggle('on',car.neutral);};
const toggleCamera=()=>{mode=mode==='chase'?'cockpit':'chase';$('camera').textContent=`Câmera: ${mode==='chase'?'fora':'dentro'}`;};
$('neutral').onclick=toggleNeutral;$('camera').onclick=toggleCamera;
function startDemo(){Object.assign(car,{vx:0,gear:1,rpm:IDLE,neutral:false,shiftTimer:0});demo={t:0,label:''};$('demoBox').hidden=false;}
$('demo').onclick=startDemo;

// --- Engines.
function cards(box,list,current,pick,keys=true){
 $(box).innerHTML='';
 list.forEach((e,i)=>{const d=document.createElement('label');d.className='engine'+(e.id===current?' on':'');
  d.innerHTML=`${keys?`<kbd>${i+1}</kbd>`:''}<b></b><span></span><small></small>`;d.querySelector('b').textContent=e.name;d.querySelector('span').textContent=e.where;d.querySelector('small').textContent=e.credit;
  d.onclick=()=>pick(e.id);$(box).append(d);});
}
function renderEngines(){cards('engines',ENGINES,engine,id=>choose(id));}
// The game's CarAudio picks each car's sounds by car.mechanics.name; the synthesized engine is recorded:false.
async function choose(id){
 const e=ENGINES.find(x=>x.id===id);
 engine=id;save('bancada-som-motor',id);mech=CARS[e?.car??'opala'];GEARS=mech.gears;Object.assign(car.mechanics,{gears:GEARS,name:e?.car??'opala'});renderEngines();
 const old=audio;audio=null;if(old?.context)old.context.close().catch(()=>{});
 const next=new CarAudio({recorded:!!id,tuning});next.musicMuted=true;next.musicVolume=0;
 await next.unlock();next.setPaused(false);next.setFocused(true);audio=next;
 $('status').textContent=id?'Carregando a gravação…':'Som sintetizado (o antigo).';
}

// --- Sliders.
function renderSliders(){
 $('sliders').innerHTML='';
 for(const [key,label,min,max,stepValue] of SLIDERS){
  const row=document.createElement('div');row.className='row';
  row.innerHTML=`<label><span></span><output></output></label><input type="range" min="${min}" max="${max}" step="${stepValue}">`;
  row.querySelector('span').textContent=label;const input=row.querySelector('input'),out=row.querySelector('output');
  const show=()=>{out.textContent=String(+(+tuning[key]).toFixed(2));};
  input.value=tuning[key];show();
  input.oninput=()=>{tuning[key]=+input.value;if(key==='fade'||key==='grain')tuning.fade=Math.min(tuning.fade,tuning.grain-.25);save('bancada-som-ajustes',tuning);audio?.tune(tuning);show();if(key==='grain')renderSliders();};
  $('sliders').append(row);
 }
}
$('reset').onclick=()=>{tuning={...TUNING};save('bancada-som-ajustes',tuning);audio?.tune(tuning);renderSliders();};
$('copy').onclick=async()=>{
 const text=JSON.stringify({motor:engine,...tuning});
 try{await navigator.clipboard.writeText(text);$('copied').textContent='Copiado! É só colar na conversa.';}
 catch{$('copied').textContent=text;}
};

// --- Frame loop.
let last=performance.now(),accumulator=0,skid=0;
function frame(now){
 const dt=Math.min(.05,(now-last)/1000);last=now;
 let input={throttle:held.throttle,brake:held.brake,hand:held.hand,corner:held.corner};
 if(demo){demo.t+=dt;const d=demoInput(demo.t);if(d){input={throttle:0,brake:0,hand:false,corner:false,...d};if(!!d.neutral!==car.neutral)toggleNeutral();}else{demo=null;if(car.neutral)toggleNeutral();$('demoBox').hidden=true;}
  if(demo){$('demoBar').style.width=`${demo.t/DEMO_TIME*100}%`;$('demoStep').textContent=demo.label;}}
 accumulator+=dt;while(accumulator>=1/120){skid=step(input,1/120);accumulator-=1/120;}
 if(audio){
  audio.update(car,{throttle:input.throttle,brake:input.brake,reverse:0},skid,false,mode);
  audio.updateScene({driving:true,phase:'race',speed:car.vx,onRoad:true,camera:mode},[],dt);
  const info=audio.info();
  $('rpm').textContent=Math.round(info.rpm);$('gear').textContent=info.gear;$('kmh').textContent=Math.round(car.vx*3.6);
  $('rpmBar').style.width=`${clamp(info.rpm/7400,0,1)*100}%`;
  $('mLoad').textContent=`${Math.round(input.throttle*100)}%`;$('mRms').textContent=(20*Math.log10(Math.max(info.rms,1e-5))).toFixed(0)+' dB';
  $('mSing').textContent=info.tyres?.loops?.canta?.toFixed(2)??'-';$('mScreech').textContent=info.tyres?.loops?.arrasta?.toFixed(2)??'-';$('mPops').textContent=info.tyres?.pops??0;
  $('mReady').textContent=!engine?'não (sintetizado)':info.engine?.ready?(info.engine.playing?`loops: ${info.engine.playing.join(' + ')||'—'}${info.engine.idleLevel>.01?' + lenta':''}`:'sim'):info.engine?.error?`erro: ${info.engine.error}`:'carregando…';
  if(engine&&info.engine?.ready&&$('status').textContent.startsWith('Carregando'))$('status').textContent=info.engine.bank+' pronto.';
 }
 requestAnimationFrame(frame);
}
renderEngines();renderSliders();
$('startButton').onclick=async()=>{$('start').remove();await choose(engine);};
requestAnimationFrame(frame);
window.bancada={audio:()=>audio,car,startDemo,choose,tuning:()=>tuning};
