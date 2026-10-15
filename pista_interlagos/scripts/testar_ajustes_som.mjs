// The engine sound's settings (teste/sound-tuning.js) and how the game takes them (car-audio.js): the defaults are
// the sound the team approved; a pilot's sets are clamped, saved only where they differ, copied and pasted between
// pilots, and reach the game only when "Usar estes ajustes no jogo" is on and the build has the sound bench;
// gear by gear, a gear's "Começo do som" maps its revs from the share of the counter up to the upshift; the last
// gear pulls to top speed without the limiter's cut.
import assert from 'node:assert/strict';
import {CARS,SETTINGS,GEAR_KEYS,gearSettings,gearKey,soundDefaults,cleanValues,changedValues,readSoundSettings,writeSoundSettings,exportSoundSettings,importSoundSettings,SOUND_KEY} from '../teste/sound-tuning.js';
import {firstGearRevs,gearRevs,SHIFT_UP,COUNTER} from '../teste/engine-loops.js';
import {CarAudio,heardRevs} from '../teste/car-audio.js';
import {TestCar,OPALA_BODY,FUSCA_BODY} from '../teste/physics.js';
import {readFileSync} from 'node:fs';

const memory=()=>{const data={};return {getItem:k=>data[k]??null,setItem:(k,v)=>{data[k]=String(v);},data};};
const d=soundDefaults();
// The approved sound: the values the team settled on at the bench (2026-10-11).
for(const [key,value] of Object.entries({engine:.8,idle:.35,lift:.45,idleLoop:1,pitch:1,bass:0,highs:9000,loopSpan:1.5,onFrom:5500,launch:15000,gasRise:.15,sing:.55,screech:.6,pops:1,popChance:.75,m1From:.5,m2From:0,m5From:0,mNVolume:1,mRPitch:1,drive:0,presence:0}))
 assert.equal(d[key],value,`default ${key}`);
assert.equal(Object.keys(d).length,SETTINGS.length+GEAR_KEYS.reduce((n,g)=>n+gearSettings(g).length,0),'one value per setting');
assert.ok(!('mNFrom' in d)&&!('mRFrom' in d),'"Começo do som" is for first to fifth only');
for(const s of SETTINGS){assert.ok(s.help.length>30,`${s.key} explains itself`);assert.ok(s.min<=s.def&&s.def<=s.max,`${s.key} default in range`);}

// Clamped, known keys only; saved and shared: only what differs.
assert.deepEqual(cleanValues({engine:9,bass:-99,nope:1,pitch:'x',m3Volume:'1.5'}),{engine:2,bass:-15,m3Volume:1.5});
assert.deepEqual(changedValues({...d,engine:1.2}),{engine:1.2});
const storage=memory();
const sets={useInGame:true,opala:{...d,engine:1.1,m2Pitch:.9},fusca:{...d,idleLoop:2}};
writeSoundSettings(sets,storage);
assert.deepEqual(JSON.parse(storage.data[SOUND_KEY]),{versao:1,useInGame:true,opala:{engine:1.1,m2Pitch:.9},fusca:{idleLoop:2}});
const read=readSoundSettings(storage);
assert.equal(read.useInGame,true);assert.equal(read.opala.engine,1.1);assert.equal(read.opala.m2Pitch,.9);assert.equal(read.fusca.idleLoop,2);assert.equal(read.fusca.engine,.8);
assert.equal(readSoundSettings(memory()).useInGame,false,'nothing saved: the team sound');
const broken=memory();broken.setItem(SOUND_KEY,'{oops');assert.deepEqual(readSoundSettings(broken).opala,d,'a broken save is ignored');

// Copy and paste between pilots.
const text=exportSoundSettings(sets),pasted=importSoundSettings(text);
assert.equal(JSON.parse(text).som,'auto-pobre-racing');
for(const car of CARS)assert.deepEqual(pasted[car],{...d,...changedValues(sets[car])});
assert.equal(importSoundSettings('não é ajuste'),null);assert.equal(importSoundSettings('{"x":1}'),null);
assert.equal(importSoundSettings('{"opala":{"engine":50}}').opala.engine,2,'pasted values are clamped');

// The game: the bench's sets only when "usar no jogo" is on, and never in a build without the bench.
globalThis.localStorage=storage;
let audio=new CarAudio();
assert.equal(audio.tuningSource,'bancada');assert.equal(audio.tuning.engine,1.1);
audio.useDefaultSound();assert.equal(audio.tuningSource,'padrão');assert.equal(audio.tuning.engine,.8);
writeSoundSettings({...sets,useInGame:false},storage);
audio=new CarAudio();assert.equal(audio.tuningSource,'padrão');assert.equal(audio.tunings.opala.engine,.8);
const live={opala:{...d},fusca:{...d,engine:1.4}};
audio=new CarAudio({tunings:live});audio.kind='fusca';audio.retune();assert.equal(audio.tuning,live.fusca,'the bench edits the live sets');
delete globalThis.localStorage;

// Gear by gear: "Começo do som" maps the revs from its share of the counter to the upshift, continuously.
assert.equal(firstGearRevs(0,110,.5),.5*COUNTER);assert.equal(Math.round(firstGearRevs(SHIFT_UP/110,110,.5)),SHIFT_UP);
const low=SHIFT_UP*72/110;
assert.equal(Math.round(gearRevs(low,low,.7)),Math.round(.7*COUNTER));assert.equal(Math.round(gearRevs(SHIFT_UP,low,.7)),SHIFT_UP);
assert.ok(gearRevs(5000,low,.7)>gearRevs(4800,low,.7),'climbs with the revs');
// The heard revs climb and fall at the car's rates.
assert.equal(heardRevs(1000,5000,.1,9000,18000),1900);assert.equal(heardRevs(6000,3000,.1,9000,18000),4200);assert.equal(heardRevs(6000,3000,.1,9000,60000),3000);

// Flat out (physics.js on a level road; car-audio.js on stand-in audio nodes, 60 frames a second): the last gear
// pulls to top speed on the open loops, the revs only climbing, and holds a steady top note (a pilot heard the
// Opala's fifth tremble from 213 km/h: the limiter's cut, from its 6940 rpm on); a lower gear held flat still cuts.
const track=JSON.parse(readFileSync(new URL('../dados/pista.json',import.meta.url)));
function flatOut(body,{draft=0,seconds=40,kmh=0,gear}={}){
 const param=()=>({setTargetAtTime(){},setValueAtTime(){}}),k={...d,shiftClack:0},sent=[],frames=[];
 const sound=new CarAudio({tunings:{opala:k,fusca:k}});
 Object.assign(sound,{kind:body.mechanics.name,paused:false,context:{currentTime:0,state:'running'},recorded:{ready:true,use(){},set:(i,rpm,load,gain)=>sent.push({rpm,load,gain})}});
 for(const n of ['synthGain','engineFilter','engineBass','engineGain','tyreGain','tyreFilter','squeal','squealGain'])sound[n]={gain:param(),frequency:param()};
 const car=new TestCar(track).setBody(body);car.sample=()=>({i:0,u:0,s:500,d:0,z:0,width:1000,bank:0,grade:0,gx:0,gy:0,tx:1,ty:0,lx:0,ly:1,onRoad:true});
 car.reset();car.x=car.y=car.heading=0;car.settle();car.vx=kmh/3.6;
 const command={throttle:1,brake:0,left:0,right:0,reverse:0,handbrake:0,...(gear?{gear}:{})};
 for(let i=0;i<120*seconds;i++){car.draft=draft;car.step(command,1/120);if(i%2)continue;sound.context.currentTime+=1/60;sent.length=0;sound.update(car,command,0,false,'chase');frames.push({kmh:car.vx*3.6,gear:car.gear,...sent[0]});}
 return frames;
}
for(const [name,body,draft] of [['Opala',OPALA_BODY,0],['Fusca in a tow',FUSCA_BODY,.5]]){
 const frames=flatOut(body,{draft}),fifth=frames.filter(f=>f.gear===5).slice(20),top=frames.at(-1);
 assert.ok(top.gear===5&&top.rpm>d.limiterRpm,`${name}: fifth reaches the limiter's revs (${Math.round(top.rpm)} rpm at ${top.kmh.toFixed(1)} km/h)`);
 assert.ok(fifth.every(f=>f.load>.99),`${name}: fifth stays on the open loops to top speed`);
 assert.ok(fifth.every((f,i)=>!i||f.rpm>=fifth[i-1].rpm-5),`${name}: fifth's revs only climb`);
 const end=fifth.slice(-120).map(f=>f.rpm);assert.ok(Math.max(...end)-Math.min(...end)<10,`${name}: a steady note at top speed`);
}
assert.ok(flatOut(OPALA_BODY,{kmh:110,gear:3,seconds:6}).slice(-120).some(f=>f.load===0),'third gear held flat (Câmbio manual) still hits the limiter');
console.log('Sound settings passed: approved defaults, clamping, saving only changes, copy/paste, use in game only with the bench, gear by gear, the last gear to top speed.');
