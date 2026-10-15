import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {weatherProfile,weatherCaption,timeOfDay,rainLevel,TIMES_OF_DAY,RAIN_LEVELS,TIME_PROFILES,skyDirection,TIME_CHOICES,RAIN_CHOICES,RANDOM_WEATHER,timeChoice,rainChoice,drawWeather,chosenWeather,nextTimeOfDay,nextRainLevel,weatherName} from '../teste/weather.js';
import {SUN_DIRECTION} from '../teste/sky.js';
import {LOOK} from '../teste/cinematic.js';
import {beamShape,BEAM_LOW,BEAM_HIGH,LAMP_SETS,ROAD_LAMPS,ROAD_LAMPS_MAX,updateRoadLamps,lampPatch,PlayerHeadlights} from '../teste/headlights.js';
import {Rain,RAIN_DROPS,SPLASH} from '../teste/rain.js';
import {wiperAngle,WIPERS,WIPER_PROFILES} from '../teste/windscreen-rain.js';
import {createFloodlights,FLOOD} from '../teste/floodlights.js';
import {TestCar} from '../teste/physics.js';
import {RaceField} from '../teste/race-field.js';

// The weather (weather.js): the clear day is the game as it was before (sky.js, main.js sun and fill, cinematic.js LOOK).
const day=weatherProfile();
assert.equal(day.time,'dia');assert.equal(day.rain,'seco');
assert.ok(new THREE.Vector3(...day.sun.direction).normalize().distanceTo(SUN_DIRECTION)<1e-6,'the day keeps the old sun');
assert.deepEqual([day.sun.color,day.sun.intensity,day.fill.sky,day.fill.ground,day.fill.intensity,day.environment,day.exposure],['#fff1e2',7,'#c4d8f2','#4c4a38',.45,1,.78]);
assert.deepEqual(day.sky.zenith,[.07,.22,.54]);assert.deepEqual(day.sky.horizon,[.53,.645,.8]);assert.deepEqual(day.fog.color,day.sky.horizon);
assert.deepEqual(day.look,{},'the film look stays LOOK by day');
assert.deepEqual([day.grip,day.wetness,day.drops,day.spray,day.ambient,day.lights,day.fog.reach],[1,0,0,0,1,false,1]);
// Unknown values fall back to day and dry; every pair has a full profile.
assert.equal(timeOfDay('madrugada'),'dia');assert.equal(rainLevel('neve'),'seco');
for(const [t] of TIMES_OF_DAY)for(const [r] of RAIN_LEVELS){
 const p=weatherProfile(t,r);
 for(const k of ['zenith','horizon','ground','cloudShade','cloudLit','cirrus','aureole','silver','disc','sunset','city'])assert.equal(p.sky[k].length,3,`${t}/${r} sky.${k}`);
 assert.ok(p.sun.intensity>0&&p.fill.intensity>0&&p.fog.reach>0&&p.fog.reach<=1,`${t}/${r} light and fog`);
 assert.ok(Object.keys(p.look).every(k=>Object.hasOwn(LOOK,k)),`${t}/${r} changes only LOOK's keys`);
 // Dry dusk is still daylight: the cars light up only at night and in the rain (the team's call, 10-15).
 assert.equal(p.lights,t==='noite'||r!=='seco',`${t}/${r} headlights`);
}
// Dusk is a low sun, night a moon; each darker than the last; the rain dims the sun, wets the road and costs grip.
const dusk=weatherProfile('fim_de_tarde'),night=weatherProfile('noite');
assert.ok(dusk.sun.direction[1]<.2&&dusk.sun.direction[1]>.05,'the dusk sun stands a few degrees up');
assert.ok(night.sun.intensity<dusk.sun.intensity&&dusk.sun.intensity<day.sun.intensity,'night < dusk < day');
assert.ok(night.ambient<dusk.ambient&&dusk.ambient<day.ambient);
assert.ok(night.sky.stars>0&&day.sky.stars===0&&dusk.sky.stars===0,'stars only at night');
const garoa=weatherProfile('dia','garoa'),chuva=weatherProfile('dia','chuva');
assert.ok(chuva.grip<garoa.grip&&garoa.grip<1&&chuva.grip>=.7,'rain costs grip, the downpour more');
assert.ok(chuva.wetness===1&&garoa.wetness>0&&garoa.wetness<1&&chuva.drops>garoa.drops);
assert.ok(chuva.sun.intensity<garoa.sun.intensity&&garoa.sun.intensity<day.sun.intensity,'the overcast dims the sun');
assert.ok(chuva.fog.reach<garoa.fog.reach&&garoa.fog.reach<1,'rain shortens the view');
assert.equal(weatherProfile('noite','chuva').fill.intensity,night.fill.intensity,'at night the overcast does not light the track');
assert.ok(new THREE.Vector3(...skyDirection(90,0)).distanceTo(new THREE.Vector3(1,0,0))<1e-9&&new THREE.Vector3(...skyDirection(0,0)).distanceTo(new THREE.Vector3(0,0,-1))<1e-9,'bearings: east +x, north -z');
// The opening's caption: hour, temperature and track follow the weather; the day keeps it as it was.
const caption='São Paulo · 16h40 · 27 °C · pista seca';
assert.equal(weatherCaption(caption,day),caption);
assert.equal(weatherCaption(caption,weatherProfile('noite','chuva')),'São Paulo · 21h30 · 15 °C · chuva forte · pista molhada');
assert.equal(weatherCaption(caption,dusk),'São Paulo · 17h50 · 24 °C · pista seca');
assert.ok(Object.isFrozen(TIME_PROFILES));
// Aleatório: the selects' last choice, kept by the preference; a profile never races it (it falls back to day and
// dry), a draw is always a real time and rain, the nine pairs as likely; the caption names what was drawn.
assert.deepEqual(TIME_CHOICES.map(([v])=>v),['dia','fim_de_tarde','noite',RANDOM_WEATHER]);
assert.deepEqual(RAIN_CHOICES.map(([v])=>v),['seco','garoa','chuva',RANDOM_WEATHER]);
assert.deepEqual([timeChoice(RANDOM_WEATHER),rainChoice(RANDOM_WEATHER),timeChoice('madrugada'),rainChoice('neve')],[RANDOM_WEATHER,RANDOM_WEATHER,'dia','seco']);
assert.deepEqual([timeOfDay(RANDOM_WEATHER),weatherProfile(RANDOM_WEATHER,RANDOM_WEATHER).time,weatherProfile(RANDOM_WEATHER,RANDOM_WEATHER).rain],['dia','dia','seco']);
{const sequence=[0,.99,.5,.4,.999999,0];let i=0;const random=()=>sequence[i++];
 assert.deepEqual([drawWeather(random),drawWeather(random),drawWeather(random)],[{time:'dia',rain:'chuva'},{time:'fim_de_tarde',rain:'garoa'},{time:'noite',rain:'seco'}]);}
{const counts={};for(let n=0;n<9000;n++){const {time,rain}=drawWeather();counts[`${time}/${rain}`]=(counts[`${time}/${rain}`]??0)+1;}
 assert.equal(Object.keys(counts).length,9,'every pair comes');assert.ok(Object.values(counts).every(c=>c>800&&c<1200),JSON.stringify(counts));}
assert.deepEqual(chosenWeather(RANDOM_WEATHER,'garoa',{time:'noite',rain:'chuva'}),{time:'noite',rain:'garoa'});
// Y and U on the track: the next time and rain round the list, from the one raced (never Aleatório), named as the selects.
assert.deepEqual(['dia','fim_de_tarde','noite',RANDOM_WEATHER].map(nextTimeOfDay),['fim_de_tarde','noite','dia','fim_de_tarde']);
assert.deepEqual(['seco','garoa','chuva','neve'].map(nextRainLevel),['garoa','chuva','seco','garoa']);
assert.deepEqual([weatherName(TIMES_OF_DAY,'dia'),weatherName(TIMES_OF_DAY,'fim_de_tarde'),weatherName(RAIN_LEVELS,'seco'),weatherName(RAIN_LEVELS,'chuva')],['Dia','Fim de tarde','Seco','Chuva forte']);
assert.deepEqual(chosenWeather('dia',RANDOM_WEATHER,{time:'noite',rain:'chuva'}),{time:'dia',rain:'chuva'});
assert.deepEqual(chosenWeather('madrugada','neve',{time:'noite',rain:'chuva'}),{time:'dia',rain:'seco'});
assert.equal(weatherCaption(caption,weatherProfile('noite','garoa'),{time:true,rain:true}),'São Paulo · 21h30 · 17 °C · garoa · pista úmida · sorteio: noite, garoa');
assert.equal(weatherCaption(caption,day,{time:false,rain:true}),'São Paulo · 16h40 · 27 °C · pista seca · sorteio: tempo seco');
assert.equal(weatherCaption(caption,dusk,{time:true,rain:false}),'São Paulo · 17h50 · 24 °C · pista seca · sorteio: fim de tarde');
assert.equal(weatherCaption(caption,day,{time:false,rain:false}),caption);

// The beam (headlights.js beamShape): full on the road from about 20 m on, thinner close to the bumper, full a degree
// either side of the axis (the body's pitch), dimmer over it, softer to the sides.
assert.equal(beamShape(-BEAM_LOW,0),1);assert.equal(beamShape(0,0),1);assert.equal(beamShape(BEAM_HIGH,0),1);
assert.ok(beamShape(-.017,0)===1&&beamShape(-.04,0)<1,'a degree of pitch keeps the road lit');
assert.ok(beamShape(-.115,0)<.05,'5 m ahead of the lamps: little light');
assert.ok(beamShape(.2,0)<.3&&beamShape(.2,0)>.2,'a dimmer spill above');
assert.ok(beamShape(.2,0,.96)<.05,'the rain is lit only in the beam');
assert.ok(beamShape(-.02,.3)<beamShape(-.02,.1)&&beamShape(-.02,.1)<1,'softer to the sides');
// The lamps: the OMP Opala's four auxiliary lamps under its headlamps, the pairs at their middles.
assert.equal(LAMP_SETS.milha.lamps.length,4);assert.ok(LAMP_SETS.milha.lamps.every(([x,y])=>x>2.3&&y>.5&&y<.65));
for(const set of Object.values(LAMP_SETS))assert.equal(set.pairs.length,2);

// The road's lamps: nearest the eye first, head lamps before tail lamps, never past the limit.
const car=(x,z)=>{const o=new THREE.Object3D();o.position.set(x,0,z);o.updateMatrixWorld();return o;};
const eye=new THREE.Vector3(0,1,0),cars=[{obj:car(50,0),set:'milha',head:1,tail:1},{obj:car(10,0),set:'milha',head:1,tail:1},{obj:car(400,0),set:'milha',head:1,tail:1}];
assert.equal(updateRoadLamps(cars,eye,ROAD_LAMPS_MAX),4,'the car 400 m away lights nothing here');
const [first,second]=ROAD_LAMPS.roadLampPos.value;
assert.ok(first.x>10&&first.x<13&&first.w>0,'the nearest car\'s headlights first');assert.ok(second.w<0,'then its tail lamp (red, negative)');
assert.ok(Math.abs(ROAD_LAMPS.roadLampDir.value[0].x-1)<1e-9&&ROAD_LAMPS.roadLampDir.value[0].w>0,'a headlight looks down the car\'s +x');
assert.equal(updateRoadLamps(cars,eye,1),1);assert.equal(updateRoadLamps([],eye),0);
// The patch keeps the material's own hook and key, once.
{const m=new THREE.MeshStandardMaterial();let ran=0;m.onBeforeCompile=()=>{ran++;};m.customProgramCacheKey=()=>'own';
 lampPatch(lampPatch(m));const shader={uniforms:{},vertexShader:'',fragmentShader:'#include <common>\n#include <lights_fragment_end>'};m.onBeforeCompile(shader);
 assert.equal(ran,1);assert.ok(m.customProgramCacheKey().startsWith('own|farois'));assert.ok(shader.uniforms.roadLampPos&&shader.fragmentShader.includes('RE_Direct(lampLight'));}
// The player's spot lights: in the scene only when the weather wants them; H changes their strength alone.
{const holder=new THREE.Group(),lamps=new PlayerHeadlights(holder);
 assert.equal(lamps.install(true),true);assert.equal(lamps.install(true),false);assert.equal(holder.children.filter(o=>o.isSpotLight).length,2);
 assert.equal(lamps.lights[0].intensity,0);lamps.on(true);assert.ok(lamps.lights[0].intensity>0);lamps.toggle();assert.equal(lamps.lights[0].intensity,0);
 assert.ok(lamps.lights.every(l=>l.map&&!l.castShadow),'a beam cookie, no shadow pass');
 lamps.install(false);assert.equal(holder.children.length,0);}

// The rain: hidden when dry; its share of drops and the spray come with the weather.
{const rain=new Rain({count:RAIN_DROPS.baixo});
 assert.ok(RAIN_DROPS.baixo<RAIN_DROPS.medio&&RAIN_DROPS.medio<RAIN_DROPS.alto&&RAIN_DROPS.alto<RAIN_DROPS.ultra);
 rain.setWeather(day);assert.equal(rain.root.visible,false);
 rain.setWeather(chuva);assert.equal(rain.root.visible,true);assert.equal(rain.uniforms.rainDensity.value,1);
 rain.setWeather(garoa);assert.ok(rain.uniforms.rainDensity.value<.5&&rain.uniforms.rainFall.value<5,'drizzle: fewer, slower drops');
 rain.setWeather(chuva);
 const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url))),fast=new TestCar(data);fast.resetGrid();fast.vx=Math.cos(fast.heading)*40;fast.vy=Math.sin(fast.heading)*40;
 const camera=new THREE.PerspectiveCamera();camera.position.set(fast.x,fast.surface.z+2,-fast.y);camera.updateMatrixWorld();
 for(let i=0;i<60;i++)rain.update(1/60,camera,{cars:[fast]});
 assert.ok(rain.info().spray>10,'a fast car throws spray');
 const slow=new TestCar(data);slow.resetGrid();rain.clearSpray();for(let i=0;i<60;i++)rain.update(1/60,camera,{cars:[slow]});
 assert.equal(rain.info().spray,0,'a car at rest throws none');
 rain.setWeather(day);assert.equal(rain.info().spray,0);}

// The wipers: from parked up the glass and back over one period, the driver's and the passenger's sweeps.
for(const sweep of WIPERS.sweep){
 assert.equal(wiperAngle(0,sweep),0);assert.ok(Math.abs(wiperAngle(WIPERS.period/2,sweep)-sweep)<1e-9);assert.ok(Math.abs(wiperAngle(WIPERS.period,sweep))<1e-9);
 assert.ok(Math.abs(wiperAngle(WIPERS.period*.3,sweep)-wiperAngle(WIPERS.period*.7,sweep))<1e-9,'the way back mirrors the way up');
}
assert.ok(WIPERS.sweep.every(s=>s>1.4&&s<1.9)&&WIPERS.reach[1]<.5,'about a quarter turn, blades under half a metre');
// The Fusca's own: its bare blades on the windscreen's foot, a shorter sweep, the same clock.
const fw=WIPER_PROFILES.fusca;
assert.equal(fw.pivots,'outer');assert.ok(fw.sweep.every(s=>s>1&&s<1.6)&&fw.reach[1]<.5&&fw.box.max[0]<WIPER_PROFILES.opala.box.max[0]);
for(const sweep of fw.sweep)assert.ok(Math.abs(wiperAngle(WIPERS.period/2,sweep)-sweep)<1e-9);
assert.ok(SPLASH.count>0&&SPLASH.box<20,'splashes only round the eye');
// The floodlight masts along Interlagos's pit wall: lit only when asked, pointing down.
{const pista=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url))),fl=createFloodlights(pista);
 assert.ok(fl&&fl.lamps.length>20,'a mast every 30 m of the pit wall');assert.ok(fl.lamps.every(l=>l.dir.y===-1));
 fl.setLevel(0);assert.ok(fl.lamps.every(l=>l.strength===0));fl.setLevel(1);assert.ok(fl.lamps.every(l=>l.strength===FLOOD.strength));
 const eye=fl.lamps[3].pos.clone().setY(fl.lamps[3].pos.y-8);const n=updateRoadLamps([],eye,24,1,fl.lamps,FLOOD.slots);
 assert.equal(n,FLOOD.slots,'the masts nearest the eye take their places');assert.ok(ROAD_LAMPS.roadLampDir.value[0].w<0,'a cone straight down');
 assert.equal(createFloodlights({meta:{}}),null,'no surveyed pit lane, no masts');}

// The grip: braking from 100 km/h takes longer on the wet track, by about the tyres' loss.
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));
const idle={throttle:0,brake:0,left:0,right:0,reverse:0,handbrake:0};
function stopping(grip){
 const c=new TestCar(data);c.sample=()=>({i:0,u:0,s:500,d:0,z:.055,width:1000,bank:0,grade:0,gx:0,gy:0,tx:1,ty:0,lx:0,ly:1,onRoad:true});
 c.reset();c.x=c.y=c.heading=0;c.surface=c.sample();c.weatherGrip=grip;c.vx=100/3.6;let d=0;
 for(let i=0;i<1200&&Math.hypot(c.vx,c.vy)>.5;i++){const x=c.x;c.step({...idle,brake:1},1/120);d+=c.x-x;}
 return d;
}
const dry=stopping(1),wet=stopping(chuva.grip);
assert.ok(wet>dry*1.12&&wet<dry/chuva.grip*1.15,`stopping from 100 km/h: ${dry.toFixed(1)} m dry, ${wet.toFixed(1)} m wet`);
assert.equal(new TestCar(data).weatherGrip,1,'every car is dry until told otherwise');
// The field: its cars take the weather at the start; the recon driver and the rivals lap slower in the rain, cleanly.
function lap(grip){
 const player=new TestCar(data);player.resetGrid();player.weatherGrip=grip;const field=new RaceField(data,{seed:3,weatherGrip:grip});field.reset(player.surface.s,{grid:true});
 assert.ok(field.rivals.every(r=>r.car.weatherGrip===grip),'the rivals race the weather');
 let off=0,walls=0,steps=0;
 for(;steps<120*300&&player.laps<2;steps++){player.step(field.heroInput(player,1/120),1/120);field.step(player,1/120,3);if(!player.surface.onRoad)off++;if(player.wallImpactSpeed>4)walls++;}
 const rivalBest=Math.min(...field.rivals.map(r=>r.car.best??Infinity));
 return {best:player.best,off:off/steps,walls,rivalBest};
}
const dryLap=lap(1),wetLap=lap(chuva.grip);
assert.ok(Number.isFinite(dryLap.best)&&Number.isFinite(wetLap.best),'both laps complete');
assert.ok(wetLap.best>dryLap.best*1.04&&wetLap.best<dryLap.best*1.25,`the recon lap: ${dryLap.best.toFixed(2)} s dry, ${wetLap.best.toFixed(2)} s in the rain`);
assert.ok(wetLap.off<.01&&wetLap.walls===0,'in the rain it stays on the asphalt and off the walls');
assert.ok(!Number.isFinite(dryLap.rivalBest)||wetLap.rivalBest>dryLap.rivalBest,'the rivals are slower in the rain too');
console.log(`Weather passed: day unchanged, ${TIMES_OF_DAY.length}×${RAIN_LEVELS.length} profiles, beam, lamps, rain and spray; braking ${dry.toFixed(1)}→${wet.toFixed(1)} m, recon lap ${dryLap.best.toFixed(2)}→${wetLap.best.toFixed(2)} s (rivals ${dryLap.rivalBest.toFixed(2)}→${wetLap.rivalBest.toFixed(2)} s).`);
