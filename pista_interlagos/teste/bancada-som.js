// Sound bench (bancada-som.html, published only under /dev/): the game's own CarAudio, driven by a small car with
// each car's gears and shift points, for the pilots to tune the Opala's and the Fusca's engines by ear, gear by
// gear (sound-tuning.js holds the settings, their ranges and explanations, and this browser's sets).
import {CarAudio} from './car-audio.js';
import {CARS,SETTINGS,GROUPS,GEAR_KEYS,GEAR_NAMES,gearSettings,gearKey,soundDefaults,readSoundSettings,writeSoundSettings,exportSoundSettings,importSoundSettings} from './sound-tuning.js';

const $=id=>document.getElementById(id);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const CAR_NAMES={opala:'Opala',fusca:'Fusca'};
const state=readSoundSettings();
let carName=(()=>{try{return CARS.includes(localStorage.getItem('bancada-som-carro'))?localStorage.getItem('bancada-som-carro'):'opala';}catch{return 'opala';}})();
let audio=null,mode='chase',synth=false,selectedGear='1';
const save=()=>{writeSoundSettings(state);audio?.retune();};

// --- The car: physics.js's numbers (gears in rpm per km/h, torque, the N m to m/s2 factor; OPALA_MECHANICS,
// FUSCA_MECHANICS), shift points, straight road.
const IDLE=950,RED=7000,UP=6650,DOWN=3100,SHIFT=.16;
const MECHANICS={
 opala:{gears:[0,110,72,52,40,32.2],curve:[[0,190],[1000,215],[2500,300],[4000,360],[5000,352],[5500,338],[6500,280],[7000,240],[7400,0]],accel:2.714e-4,drag:4.3e-4},
 fusca:{gears:[0,118,82,62,49,40.8],curve:[[0,80],[1000,89],[2500,105],[4000,117],[4500,120],[5500,116],[6200,107],[7000,89],[7400,0]],accel:.9/2.6526/820,drag:.5*1.2*.9/820},
};
let mech=MECHANICS[carName];
const torque=rpm=>{const c=mech.curve;for(let i=1;i<c.length;i++)if(rpm<=c[i][0]){const [r0,t0]=c[i-1],[r1,t1]=c[i];return t0+(t1-t0)*(rpm-r0)/(r1-r0);}return 0;};
const car={vx:0,vy:0,surface:{onRoad:true},gear:1,rpm:IDLE,manualGear:false,latAccel:0,rearSlipSpeed:0,mechanics:{grip:1,gears:mech.gears,name:carName},weatherGrip:1,shiftTimer:0,neutral:false};
function step(input,dt){
 const v=car.vx,kmh=v*3.6;
 car.latAccel=input.corner&&v>8?12.2*.97:0;
 if(input.reverse){
  car.manualGear=false;car.gear=-1;car.vx=Math.min(7,v+3*dt);car.rpm=IDLE+car.vx*3.6*150;
  return 0;
 }
 if(car.gear<0)car.gear=1;
 if(car.neutral){
  car.manualGear=true;car.gear=0;
  car.rpm=clamp(car.rpm+(input.throttle>.05?input.throttle*11000:-4200)*dt,IDLE,RED+80);
  car.vx=Math.max(0,v-(.25+4.3e-4*v*v+input.brake*11)*dt);
  return 0;
 }
 car.manualGear=false;if(car.gear<1)car.gear=1;
 car.shiftTimer=Math.max(0,car.shiftTimer-dt);
 const G=mech.gears,wheel=kmh*G[car.gear];
 if(car.shiftTimer===0){
  if(car.gear<5&&wheel>UP){car.gear++;car.shiftTimer=SHIFT;}
  else if(car.gear>1&&wheel<DOWN+(input.brake>.3?700:0)&&kmh*G[car.gear-1]<UP-400){car.gear--;car.shiftTimer=SHIFT*.6;}
 }
 const wheelRpm=kmh*G[car.gear],engineRpm=Math.max(wheelRpm,car.gear===1?IDLE+input.throttle*2600:IDLE);
 let drive=input.throttle*torque(Math.min(engineRpm,RED))*G[car.gear]*mech.accel;
 if(wheelRpm>=RED)drive=0;if(car.shiftTimer>0)drive*=.12;
 const engineBrake=input.throttle<.05&&v>1?.18+.5*clamp(wheelRpm/RED,0,1):0;
 const brakes=input.brake*11+(input.hand&&v>.5?7:0);
 car.vx=Math.max(0,v+(drive-.12-mech.drag*v*v-engineBrake-(v>.05?brakes:0))*dt);
 car.rpm=clamp(engineRpm,IDLE,RED+80);
 // Tyre marks' strength, as skid-marks.js would have it: braking past 30% at speed, the handbrake's rear pair.
 return Math.max(clamp((input.brake-.3)/.7,0,1)*clamp((v-8)/7,0,1)*.72,input.hand&&v>2?.43:0);
}

// --- The demonstration: the same 34 s for both cars.
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
function demoInput(t){let at=0;for(const [d,input,label] of DEMO){if(t<at+d){if(label)demo.label=label;return input;}at+=d;}return null;}

// --- Controls: buttons held with the pointer, or the keys.
const held={throttle:0,brake:0,hand:false,corner:false,reverse:0};
const hold=(id,key)=>{const b=$(id);const set=v=>{held[key]=key==='hand'||key==='corner'?v:+v;b.classList.toggle('held',v);};
 b.addEventListener('pointerdown',e=>{b.setPointerCapture(e.pointerId);set(true);});
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>set(false));return set;};
const keys={gas:hold('gas','throttle'),brake:hold('brake','brake'),hand:hold('hand','hand'),corner:hold('corner','corner'),reverse:hold('reverse','reverse')};
const KEYMAP={KeyW:'gas',ArrowUp:'gas',KeyS:'brake',ArrowDown:'brake',Space:'hand',KeyA:'corner',KeyQ:'reverse'};
addEventListener('keydown',e=>{
 if(['INPUT','TEXTAREA'].includes(e.target.tagName))return;
 if(KEYMAP[e.code]){e.preventDefault();keys[KEYMAP[e.code]](true);return;}
 if(e.repeat)return;
 if(e.code==='KeyN')toggleNeutral();else if(e.code==='KeyC')toggleCamera();else if(e.code==='KeyD')startDemo();
 else if(e.code==='Digit1')chooseCar('opala');else if(e.code==='Digit2')chooseCar('fusca');
});
addEventListener('keyup',e=>{if(KEYMAP[e.code])keys[KEYMAP[e.code]](false);});
const toggleNeutral=()=>{car.neutral=!car.neutral;if(!car.neutral)car.gear=1;$('neutral').classList.toggle('on',car.neutral);};
const toggleCamera=()=>{mode=mode==='chase'?'cockpit':'chase';$('camera').textContent=`Câmera: ${mode==='chase'?'fora':'dentro'}`;};
$('neutral').onclick=toggleNeutral;$('camera').onclick=toggleCamera;
$('synth').onclick=()=>{synth=!synth;$('synth').classList.toggle('on',synth);audio?.setSynthEngine(synth,false);};
function startDemo(){Object.assign(car,{vx:0,gear:1,rpm:IDLE,neutral:false,shiftTimer:0});$('neutral').classList.remove('on');demo={t:0,label:''};}
$('demo').onclick=startDemo;

// --- Cars.
function chooseCar(name){
 carName=name;try{localStorage.setItem('bancada-som-carro',name);}catch{}
 mech=MECHANICS[name];Object.assign(car.mechanics,{gears:mech.gears,name});Object.assign(car,{vx:0,gear:1,rpm:IDLE,shiftTimer:0});
 for(const b of document.querySelectorAll('.cartabs button'))b.classList.toggle('on',b.dataset.car===name);
 $('carTitle').textContent=CAR_NAMES[name];$('settingsTitle').textContent=`Ajustes do ${CAR_NAMES[name]}`;$('resetName').textContent=CAR_NAMES[name];
 renderSettings();
}
for(const b of document.querySelectorAll('.cartabs button'))b.onclick=()=>chooseCar(b.dataset.car);

// --- Settings: how a value reads, a slider row, the groups, gear by gear.
function show(s,v){
 if(s.unit==='da barra')return v>0?`${Math.round(v*100)}% da barra`:'segue o giro';
 if(s.unit==='da aderência')return `${Math.round(v*100)}% da aderência`;
 const decimals=s.step>=1?0:s.step>=.1?1:2,text=Number(v).toLocaleString('pt-BR',{maximumFractionDigits:decimals});
 if(s.unit==='dB')return `${v>0?'+':''}${text} dB`;
 return s.unit==='×'?`${text}×`:s.unit?`${text} ${s.unit}`:text;
}
const DEFAULTS=soundDefaults();
function row(key,s){
 const values=state[carName],div=document.createElement('div');div.className='row';div.dataset.key=key;
 div.innerHTML=`<div class="head"><span class="name"></span><span><output></output> <button class="reset" title="Voltar ao padrão">↺</button></span></div><p></p><input type="range" min="${s.min}" max="${s.max}" step="${s.step}">`;
 div.querySelector('.name').textContent=s.name;div.querySelector('p').textContent=`${s.help} Padrão: ${show(s,DEFAULTS[key])}.`;
 const input=div.querySelector('input'),out=div.querySelector('output');
 const paint=()=>{out.textContent=show(s,values[key]);div.classList.toggle('changed',Math.abs(values[key]-DEFAULTS[key])>1e-9);counts();};
 input.value=values[key];
 input.oninput=()=>{values[key]=+input.value;save();paint();};
 div.querySelector('.reset').onclick=()=>{values[key]=DEFAULTS[key];input.value=values[key];save();paint();};
 paint();return div;
}
function renderGears(){
 $('gearChips').innerHTML='';
 for(const gear of GEAR_KEYS){
  const b=document.createElement('button');b.textContent=gear==='N'||gear==='R'?gear:`${gear}ª`;b.title=GEAR_NAMES[gear];b.dataset.gear=gear;
  b.classList.toggle('on',gear===selectedGear);b.classList.toggle('live',gear===liveGear);b.onclick=()=>{$('followGear').checked=false;selectGear(gear);};
  $('gearChips').append(b);
 }
 $('gearHelp').textContent=`${GEAR_NAMES[selectedGear]} do ${CAR_NAMES[carName]}: estes ajustes valem só enquanto ${selectedGear==='N'?'o carro está em ponto morto (parado ou acelerando solto)':selectedGear==='R'?'a ré está engatada':'esta marcha está engatada'}, somados aos ajustes gerais abaixo.`;
 $('gearSliders').innerHTML='';
 for(const s of gearSettings(selectedGear))$('gearSliders').append(row(gearKey(selectedGear,s.part),s));
}
function selectGear(gear){if(gear===selectedGear)return;selectedGear=gear;renderGears();counts();}
function renderSettings(){
 renderGears();
 $('groups').innerHTML='';
 for(const g of GROUPS){
  const d=document.createElement('details');d.className='group';d.dataset.group=g.id;
  d.innerHTML=`<summary><span></span><span class="count"></span></summary><div class="body"></div>`;
  const title=d.querySelector('summary span');title.textContent=g.name+' ';const small=document.createElement('small');small.textContent=g.help;title.append(small);
  for(const s of SETTINGS.filter(s=>s.group===g.id))d.querySelector('.body').append(row(s.key,s));
  $('groups').append(d);
 }
 $('useInGame').checked=state.useInGame;counts();
}
// How many settings each group (and gear by gear, over all gears) has away from the default.
function counts(){
 const values=state[carName],changed=key=>Math.abs(values[key]-DEFAULTS[key])>1e-9;
 for(const d of document.querySelectorAll('#groups details')){const n=SETTINGS.filter(s=>s.group===d.dataset.group&&changed(s.key)).length;d.querySelector('.count').textContent=n?`${n} mudado${n>1?'s':''}`:'';}
 const gearChanged=GEAR_KEYS.filter(g=>gearSettings(g).some(s=>changed(gearKey(g,s.part))));
 $('gearCount').textContent=gearChanged.length?`mudado em: ${gearChanged.map(g=>g==='N'||g==='R'?g:`${g}ª`).join(', ')}`:'';
}
$('useInGame').onchange=e=>{state.useInGame=e.target.checked;save();};
$('resetCar').onclick=()=>{if(!confirm(`Voltar todos os ajustes do ${CAR_NAMES[carName]} ao padrão da equipe?`))return;Object.assign(state[carName],soundDefaults());save();renderSettings();};
$('copy').onclick=async()=>{
 const text=exportSoundSettings(state);
 try{await navigator.clipboard.writeText(text);$('copied').textContent='Copiado! Cole na conversa com a equipe ou mande para outro piloto (vale para o Opala e o Fusca).';}
 catch{$('copied').textContent=text;}
};
$('paste').onclick=()=>{$('pasteText').value='';$('pasteError').textContent='';$('pasteDialog').showModal();};
$('pasteCancel').onclick=()=>$('pasteDialog').close();
$('pasteApply').onclick=()=>{
 const sets=importSoundSettings($('pasteText').value);
 if(!sets){$('pasteError').textContent='Esse texto não é um ajuste da bancada. Copie de novo com o botão Copiar ajustes.';return;}
 for(const name of CARS)Object.assign(state[name],sets[name]);
 save();renderSettings();$('pasteDialog').close();$('copied').textContent='Ajustes colados no Opala e no Fusca.';
};

// --- Frame loop.
let last=performance.now(),accumulator=0,skid=0,liveGear=null;
function frame(now){
 const dt=Math.min(.05,(now-last)/1000);last=now;
 let input={...held};
 if(demo){demo.t+=dt;const d=demoInput(demo.t);if(d){input={throttle:0,brake:0,hand:false,corner:false,reverse:0,...d};if(!!d.neutral!==car.neutral)toggleNeutral();}else{demo=null;if(car.neutral)toggleNeutral();}
  $('demoStep').textContent=demo?`Demonstração ${Math.round(demo.t/DEMO_TIME*100)}% · ${demo.label}`:'';}
 accumulator+=dt;while(accumulator>=1/120){skid=step(input,1/120);accumulator-=1/120;}
 if(audio){
  audio.update(car,{throttle:input.throttle,brake:input.brake,reverse:input.reverse},skid,false,mode);
  audio.updateScene({driving:true,phase:'race',speed:car.vx,onRoad:true,camera:mode},[],dt);
  const info=audio.info(),gear=String(info.gear);
  $('rpm').textContent=Math.round(info.rpm);$('gear').textContent=info.gear;$('kmh').textContent=Math.round(car.vx*3.6);
  $('rpmBar').style.width=`${clamp(info.rpm/7400,0,1)*100}%`;
  $('mLoad').textContent=`${Math.round(Math.max(input.throttle,input.reverse)*100)}%`;$('mRms').textContent=(20*Math.log10(Math.max(info.rms,1e-5))).toFixed(0)+' dB';
  $('mSing').textContent=info.tyres?.loops?.canta?.toFixed(2)??'-';$('mScreech').textContent=info.tyres?.loops?.arrasta?.toFixed(2)??'-';$('mPops').textContent=info.tyres?.pops??0;
  $('mPlaying').textContent=synth?'som antigo (sintetizado)':info.engine?.ready?`${info.engine.playing.map(p=>p.replace('on','acel.').replace('off','pé fora')).join(' + ')||'—'}${info.engine.idleLevel>.01?' + lenta':''}`:info.engine?.error?`erro: ${info.engine.error}`:'carregando…';
  if(gear!==liveGear){liveGear=gear;for(const b of document.querySelectorAll('#gearChips button'))b.classList.toggle('live',b.dataset.gear===gear);if($('followGear').checked&&GEAR_KEYS.includes(gear))selectGear(gear);}
 }
 requestAnimationFrame(frame);
}
chooseCar(carName);
$('startButton').onclick=async()=>{
 $('start').remove();
 // The game's own audio, with these sets (both cars) as live settings; never the game's "motor sintetizado" or
 // mute from this browser's game preferences, and no music.
 audio=new CarAudio({tunings:{opala:state.opala,fusca:state.fusca}});audio.musicMuted=true;audio.musicVolume=0;audio.muted=false;
 await audio.unlock();audio.setSynthEngine(false,false);audio.setPaused(false);audio.setFocused(true);
 $('status').textContent='Som ligado. Acelere!';
};
requestAnimationFrame(frame);
window.bancada={audio:()=>audio,car,state,chooseCar,startDemo,selectGear,setValue:(key,value)=>{state[carName][key]=value;save();renderSettings();}};
