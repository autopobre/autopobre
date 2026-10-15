// 'Sensação de velocidade' without a browser (speed-particles.js, tyre-smoke.js, verge-vegetation.js):
// what each level turns on and how many specks it draws (Médio within the phone budget), the box that
// wraps round the camera, frozen when paused, never in a mirror or a reflection probe; live level
// changes touch counts only; the rivals' dust and the verge grit go in the smoke's second ring, never on
// asphalt or a kerb; the verge grass takes at most WAKE_CARS cars.
//   node scripts/testar_particulas.mjs
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {SPEED_EFFECTS,speedEffects,MOTE_CAPACITY,MOTE_BOX,MOTE_AHEAD,MOTE_FLOOR,MOTE_EYE,MOTE_TINTS,MOTE_MIX,MOTE_DARK,MOTE_SHADE,MOTE_COVER,MOTE_LENGTH,MOTE_BIG,MOTE_BIG_NEAR,MOTE_ROAD_KEEP,MOTE_NEAR,MOTE_GAP,WIND,EXPOSURE,MAX_STREAK,MOTE_TRUST,moteWrap,moteCentre,moteRoadFrame,moteOffRoad,moteTrust,motePitFrame,motePitOff,moteFold,AirMotes,wakeCars,createSpeedEffects} from '../teste/speed-particles.js';
import {GRAPHICS_OPTIONS,GRAPHICS_PRESETS,GRAPHICS_LEVELS} from '../teste/graphics-settings.js';
import {TyreSmoke,BIT_LIFE,BIT_PIXELS,KERB_GRIT} from '../teste/tyre-smoke.js';
import {CAMERA_FRAMES} from '../teste/camera-rig.js';
import {TestCar,SUSPENSION_WHEELS} from '../teste/physics.js';
import {kerbSegment,surfaceKind} from '../teste/kerb-contact.js';
import {createVergeVegetation,WAKE_CARS} from '../teste/verge-vegetation.js';
import {buildTrackField,looseGround} from '../teste/landscape.js';
import {fitGround,groundHeight} from '../teste/track-clearance.js';

// --- Levels: every choice of the knob has a profile, heavier choices never switch anything off.
const choices=GRAPHICS_OPTIONS.speedEffects.choices.map(([v])=>v);
assert.deepEqual(Object.keys(SPEED_EFFECTS),choices,'one profile per speedEffects choice, in panel order');
const flags=['windSweep','kerbBuzz','rivalDust','debris','grassWake','roadSmear','kerbGrit'];
choices.forEach((c,k)=>{if(!k)return;const a=SPEED_EFFECTS[choices[k-1]],b=SPEED_EFFECTS[c];assert(b.motes>=a.motes&&b.roadStreak>=a.roadStreak,c);for(const f of flags)assert(!a[f]||b[f],`${c} keeps ${f}`);});
assert.deepEqual(SPEED_EFFECTS.off,{motes:0,windSweep:false,kerbBuzz:false,rivalDust:false,debris:false,grassWake:false,roadSmear:false,roadStreak:0,kerbGrit:false},'Desligada: nothing new on screen');
// Leve (Baixo, the cheap PC): no specks, but the asphalt shader's own streak (no extra pass) as its road cue at speed.
assert(SPEED_EFFECTS.leve.windSweep&&SPEED_EFFECTS.leve.kerbBuzz&&!SPEED_EFFECTS.leve.motes&&!SPEED_EFFECTS.leve.roadSmear&&!SPEED_EFFECTS.leve.kerbGrit&&SPEED_EFFECTS.leve.roadStreak>=.4&&SPEED_EFFECTS.leve.roadStreak<=.5,'Leve: kerb shiver, wind and the asphalt streak');
// The asphalt shader's streak (where no film smear reaches the road) grows with the knob: part on Leve and Média, all on Completa.
assert(SPEED_EFFECTS.media.roadStreak>SPEED_EFFECTS.leve.roadStreak&&SPEED_EFFECTS.media.roadStreak<1&&SPEED_EFFECTS.completa.roadStreak===1,'asphalt streak by level');
// Média (Médio, phones): a few dark specks only (its road smear sells the speed; 180 pale ones read as a broken centre
// line), rival dust, the road smear and the kerbs' grit.
assert(SPEED_EFFECTS.media.motes<=MOTE_DARK&&SPEED_EFFECTS.media.motes<=30);assert(SPEED_EFFECTS.media.rivalDust&&SPEED_EFFECTS.media.roadSmear&&SPEED_EFFECTS.media.kerbGrit&&!SPEED_EFFECTS.media.debris&&!SPEED_EFFECTS.media.grassWake,'Média: dark specks, rival dust, road smear, kerb grit');
// Completa: 60% fewer specks than the 320 that read as lane paint.
assert(SPEED_EFFECTS.completa.motes>=100&&SPEED_EFFECTS.completa.motes<=130&&SPEED_EFFECTS.completa.debris&&SPEED_EFFECTS.completa.grassWake&&SPEED_EFFECTS.completa.kerbGrit,'Completa');
assert.equal(speedEffects('???'),SPEED_EFFECTS.off,'an unknown value is off');
const perLevel=Object.fromEntries(GRAPHICS_LEVELS.map(l=>[l,speedEffects(GRAPHICS_PRESETS[l].speedEffects).motes]));
assert(perLevel.baixo===0&&perLevel.medio<=30&&perLevel.alto>=100&&perLevel.alto<=130&&perLevel.ultra<=130,'Baixo none, Médio (phones) a few dark ones, Alto and Ultra about 120');

// --- The wrap: every copy lands inside the box round its centre, a whole box of drift is the same
// place, a small drift a small step (except across a face, where the speck is faded out).
let rand=1;const r=()=>(rand=(rand*16807)%2147483647)/2147483647;
for(let k=0;k<500;k++){
 const seed=[r(),r(),r()],drift=[r()*900-450,0,r()*900-450],centre=[r()*4000-2000,r()*60,r()*4000-2000],a=moteWrap(seed,MOTE_BOX,drift,centre);
 for(let j=0;j<3;j++)assert(a[j]>=centre[j]-MOTE_BOX[j]/2-1e-6&&a[j]<centre[j]+MOTE_BOX[j]/2+1e-6,'inside the box');
 const b=moteWrap(seed,MOTE_BOX,drift.map((d,j)=>d+MOTE_BOX[j]*3),centre);for(let j=0;j<3;j++)assert(Math.abs(a[j]-b[j])<1e-6,'periodic');
 const c=moteWrap(seed,MOTE_BOX,[drift[0]+.01,0,drift[2]],centre);assert(Math.abs(c[0]-a[0]-.01)<1e-6||Math.abs(Math.abs(c[0]-a[0])-MOTE_BOX[0])<.02,'continuous');
}
// The box sits on the ground ahead of the camera, whatever the camera's height or pitch.
const centre=moteCentre([10,50,20],[0,-.5,-2],48);
assert(Math.abs(centre[1]-MOTE_BOX[1]/2-48-MOTE_FLOOR)<1e-9&&Math.abs(Math.hypot(centre[0]-10,centre[2]-20)-MOTE_AHEAD)<1e-9&&centre[2]<20,'on the ground, ahead');
assert(Math.abs(moteCentre([0,9,0],[0,-1,0],NaN)[1]-(9-1.8+MOTE_FLOOR+MOTE_BOX[1]/2))<1e-9,'no ground: under the eye');

// --- AirMotes: counts, the camera's speed as a streak, a cut is no speed, paused is frozen.
const camera=new THREE.PerspectiveCamera(58,16/9,.1,1000);camera.position.set(0,52,0);camera.lookAt(0,52,-10);camera.updateMatrixWorld();
const motes=new AirMotes();assert.equal(motes.capacity,MOTE_CAPACITY);
motes.setCount(120);assert(motes.geometry.instanceCount===120&&motes.mesh.visible);motes.setCount(0);assert(!motes.mesh.visible);motes.setCount(320);
for(let k=0;k<60;k++){camera.position.z-=55/60;camera.updateMatrixWorld();motes.update(1/60,camera,{ground:48,viewport:[1920,1080]});}
const u=motes.uniforms,streak=u.moteStreak.value.clone();
assert(Math.abs(streak.length()-Math.hypot(-WIND[0],55+WIND[2])*EXPOSURE)<.01&&streak.z<0&&streak.length()<=MAX_STREAK,'the streak trails along the way the camera came from');
assert(Math.abs(u.moteCentre.value.y-(48+MOTE_FLOOR+MOTE_BOX[1]/2))<1e-9,'the box follows the ground');
const frozen={time:u.moteTime.value,drift:u.moteDrift.value.clone()};camera.position.z-=5;camera.updateMatrixWorld();motes.update(0,camera,{ground:48});
assert(u.moteTime.value===frozen.time&&u.moteDrift.value.equals(frozen.drift)&&u.moteStreak.value.equals(streak),'paused: the breeze and the streaks stand still');
assert(Math.abs(u.moteCentre.value.z-(camera.position.z-MOTE_AHEAD))<1e-9,'paused: the box still follows a moving camera');
camera.position.z-=300;camera.updateMatrixWorld();motes.update(1/60,camera,{ground:48});assert(motes.velocity.length()<60,'a camera cut is not a speed');
for(let k=0;k<20000;k++)motes.update(1/60,camera,{ground:48});assert(Math.abs(u.moteDrift.value.x)<=MOTE_BOX[0]*64&&Math.abs(u.moteDrift.value.z)<=MOTE_BOX[2]*64,'drift stays small');
// Drawn only into the picture on screen (cinematic marks its HDR target isMainView).
for(const [target,alpha] of [[null,1],[{isMainView:true},1],[{isMainView:false},0],[{isWebGLCubeRenderTarget:true},0]]){motes.mesh.onBeforeRender({getRenderTarget:()=>target});assert.equal(u.moteAlpha.value,alpha,JSON.stringify(target));}
assert(motes.material.transparent&&!motes.material.depthWrite&&motes.mesh.frustumCulled===false,'one draw that never hides anything');
// Dust over the road, never across the sky: the box ends under the low chase views' eye and every speck fades out
// before the eye's height (in the shader, against cameraPosition), so it always lands below the horizon.
assert(MOTE_FLOOR+MOTE_BOX[1]<CAMERA_FRAMES.close.up&&MOTE_FLOOR+MOTE_BOX[1]<CAMERA_FRAMES.chase.up,'the box under the chase and close eyes');
assert(MOTE_EYE[0]>MOTE_EYE[1]&&MOTE_EYE[1]>0&&/cameraPosition\.y-moteEye\.x/.test(motes.material.vertexShader),'specks fade out below the eye');
// Grey-brown dust drawn over the picture (not added light): dull tints, mostly a mid grey-brown about as bright as
// sunlit asphalt, some dark brown and under a tenth the pale tan (68% of them were pale: broken lane paint on the
// road); the HDR alpha (the occlusion mask) is never written.
const luma=c=>.2126*c[0]+.7152*c[1]+.0722*c[2];
assert(MOTE_TINTS.length===3&&MOTE_TINTS.every(c=>Math.max(...c)<.4&&(Math.max(...c)-Math.min(...c))/Math.max(...c)<.4),'dusty tints');
assert(luma(MOTE_TINTS[0])<=.2&&luma(MOTE_TINTS[1])<=luma(MOTE_TINTS[0])*.55&&luma(MOTE_TINTS[2])<=.35&&MOTE_MIX[2]<.1&&Math.abs(MOTE_MIX.reduce((a,b)=>a+b)-1)<1e-9,'mostly mid, pale under a tenth');
assert(motes.material.blendDst===THREE.OneMinusSrcAlphaFactor&&motes.material.blendSrcAlpha===THREE.ZeroFactor&&motes.material.blendDstAlpha===THREE.OneFactor,'over the picture, alpha kept');
{
 const tint=motes.geometry.attributes.tint.array,look=motes.geometry.attributes.look.array,form=motes.geometry.attributes.form.array;let big=0,pale=0;const lengths=new Set();
 for(let i=0;i<MOTE_CAPACITY;i++){big+=tint[i*4+3];const c=[tint[i*4],tint[i*4+1],tint[i*4+2]];if(luma(c)>luma(MOTE_TINTS[0])*1.25)pale++;
  // Médio draws the first ones: every one dark.
  if(i<MOTE_DARK)assert(luma(c)<=luma(MOTE_TINTS[1])*1.16,`speck ${i} dark`);
  // Thin dust (coverage), a streak of its own length.
  if(!tint[i*4+3])assert(look[i*4+1]>=MOTE_COVER[0]&&look[i*4+1]<=MOTE_COVER[1],'coverage');assert(form[i*2]>=MOTE_LENGTH[0]&&form[i*2]<=MOTE_LENGTH[1]&&form[i*2+1]>=0&&form[i*2+1]<1);
  if(i<120)lengths.add(form[i*2].toFixed(3));}
 // Few big flecks, and those start further from the lens and always draw a short streak (never a round blot).
 assert(big/MOTE_CAPACITY<=MOTE_BIG*1.6&&MOTE_BIG_NEAR>=1.5,`big flecks ${big}`);
 assert(pale/MOTE_CAPACITY<.1,`pale specks ${pale}`);assert(lengths.size>=110,'no two dashes alike');
}
// In the shader: faded within about 2 m of the lens and near the ground behind them along the view (MOTE_GAP: a speck
// lying on the road is paint), thin at both ends, never across the followed car's box when in front of it, nearly
// none over clean asphalt, and lit as dust (a backlit speck keeps only MOTE_SHADE of its tint: no glow).
{
 const vs=motes.material.vertexShader,fs=motes.material.fragmentShader;
 assert(MOTE_NEAR.outside[0]>=2&&MOTE_NEAR.inside[0]>=2.4&&MOTE_GAP[0]>=.2&&MOTE_GAP[1]<=1,'near the lens, near the ground');
 assert(/moteCarFar>0\.&&-head\.z<moteCarFar/.test(vs)&&/inBox\(ch\)/.test(vs)&&/inBox\(ct\)/.test(vs),'never across the followed car');
 assert(/smoothstep\(0\.,\.32,vQuad\.x\)\*\(1\.-smoothstep\(\.42,1\.,vQuad\.x\)\)/.test(fs),'tapered both ends');
 assert(vs.includes(`mix(${MOTE_SHADE.toFixed(2)},1.,lit)`)&&MOTE_SHADE<=.4&&MOTE_ROAD_KEEP<=.1,'lit as dust, the road nearly empty');
 motes.setCarBox({box:[.4,.2,.6,.5],far:7});assert.deepEqual(motes.uniforms.moteCarBox.value.toArray(),[.4,.2,.6,.5]);assert.equal(motes.uniforms.moteCarFar.value,7);
 motes.setCarBox(null);assert.equal(motes.uniforms.moteCarFar.value,0,'no car box: none skipped');
}
motes.dispose();
// The road round the camera as the shader reads it (moteRoadFrame: a bowed line fitted ten metres either side): over
// the lap, the centre line and the edges 16 m either way land within a third of a metre of the survey on nearly every
// station (the road's width there is the camera's: a road widening by the pits is off by its own change).
{
 const a=JSON.parse(readFileSync(new URL('../dados/pista.json',import.meta.url))).samples,n=a.length,errs=[];
 for(let i=0;i<n;i+=3){const f=moteRoadFrame(a,i);for(let j=-8;j<=8;j+=2){const q=a[(i+j+n)%n];for(const side of [0,1,-1]){const x=q[1]+q[9]*side*q[4]/2,z=-(q[2]+q[10]*side*q[4]/2);
  errs.push(Math.abs(moteOffRoad(x,z,f)+f.half-Math.abs(side)*q[4]/2));}}}
 errs.sort((u,v)=>u-v);const p95=errs[Math.floor(errs.length*.95)];assert(p95<.33,`road band off by ${p95.toFixed(2)} m (95%)`);
 // A speck over the asphalt is folded out past the edge on its own side (the verges hold the dust); one off it stays put.
 for(let i=0;i<n;i+=37){const f=moteRoadFrame(a,i);for(let k=0;k<40;k++){const x=f.cx+(r()-.5)*30,z=f.cz+(r()-.5)*30,[fx,fz]=moteFold(x,z,f),was=moteOffRoad(x,z,f),now=moteOffRoad(fx,fz,f);
  if(was>=0)assert(fx===x&&fz===z,'off the road: kept');else assert(now>=.34&&now<=f.half*.7+.36,`folded ${was.toFixed(2)} -> ${now.toFixed(2)}`);}}
 const f=moteRoadFrame(a,100);assert(moteOffRoad(a[100][1],-a[100][2],f)<-5&&moteOffRoad(a[100][1]+a[100][9]*(a[100][4]/2+3),-(a[100][2]+a[100][10]*(a[100][4]/2+3)),f)>2.5,'asphalt in, verge out');
}
// Every circuit (Minhocão's hairpins, Piracicaba's, Floripa's streets): where the shader trusts the fit (moteTrust over
// a half: near the camera, gentle bends) the centre line and the edges land within ~a third of a metre of the survey on
// 99% of the points ±10 stations round the camera; past that the specks it sorts fade (MOTE_TRUST in the shader).
{
 for(const file of readdirSync(new URL('../dados/',import.meta.url)).filter(f=>/^pista(_[a-z]+)?\.json$/.test(f))){
  const a=JSON.parse(readFileSync(new URL('../dados/'+file,import.meta.url))).samples,n=a.length,errs=[];
  for(let i=0;i<n;i+=3){const f=moteRoadFrame(a,i);for(let j=-10;j<=10;j++){const q=a[(i+j+n)%n];for(const side of [0,1,-1]){const x=q[1]+q[9]*side*q[4]/2,z=-(q[2]+q[10]*side*q[4]/2);
   if(moteTrust(x,z,f)>.5)errs.push(Math.abs(moteOffRoad(x,z,f)+f.half-Math.abs(side)*q[4]/2));}}}
  errs.sort((u,v)=>u-v);const p99=errs[Math.floor(errs.length*.99)];assert(errs.length>n&&p99<.4,`${file}: trusted road band off by ${p99.toFixed(2)} m (99%)`);
 }
 const vs=new AirMotes(8).material.vertexShader;
 assert(vs.includes(`smoothstep(${MOTE_TRUST.along[0].toFixed(1)},${MOTE_TRUST.along[1].toFixed(1)},abs(along))`)&&vs.includes(`smoothstep(${MOTE_TRUST.turn[0].toFixed(2)},${MOTE_TRUST.turn[1].toFixed(2)},abs(moteRoadShape.y*along))`),'the shader fades by MOTE_TRUST');
 assert(MOTE_TRUST.along[1]<=17&&MOTE_TRUST.turn[1]<=.5,'trusted no further than the box reaches');
}
// The pit lane's paving is road too (Interlagos' surveyed lane beside the main straight): the band across its nearest
// station, as the shader reads it, holds the lane's paved width and nothing past it; away from the lane, none.
{
 const data=JSON.parse(readFileSync(new URL('../dados/pista.json',import.meta.url))),P=data.pit,c=Object.fromEntries(P.columns.map((k,i)=>[k,i])),p=P.samples[Math.floor(P.samples.length/2)];
 const at=d=>[p[c.x]+p[c.lx]*d,-(p[c.y]+p[c.ly]*d)],f=motePitFrame(P,...at(0));
 assert(f&&Math.abs(f.hi-f.lo-(p[c.hi]-p[c.lo]))<1e-9,'the lane found');
 assert(motePitOff(...at((p[c.lo]+p[c.hi])/2),f)<-1&&motePitOff(...at(p[c.hi]-.2),f)<0&&motePitOff(...at(p[c.lo]+.2),f)<0,'its paving in');
 assert(motePitOff(...at(p[c.hi]+1),f)>.9&&motePitOff(...at(p[c.lo]-1),f)>.9,'past its edges out');
 const s=data.samples[Math.floor(data.samples.length*.4)];assert.equal(motePitFrame(P,s[1],-s[2]),null,'away from the lane: none');
 assert.equal(motePitFrame(undefined,0,0),null,'a circuit without a surveyed lane');
}

// --- The cars that push the grass: nearest the camera first, moving ones only, at most six.
const at=(x,y,v)=>({x,y,vx:v,vy:0});
const list=[at(30,0,20),at(5,0,20),at(1,0,1),at(500,0,40),...Array.from({length:8},(_,k)=>at(10+k,2,30))];
const cam={position:new THREE.Vector3(0,0,0)},pushed=wakeCars(list,cam);
assert(pushed.length===6&&pushed[0]===list[1]&&!pushed.includes(list[2])&&!pushed.includes(list[3]),'nearest moving cars within reach');

// --- createSpeedEffects: the level decides what runs; switching changes counts, never the material.
const calls=[];const smoke={debris:null,rival:(c,dt)=>calls.push([c,dt])},land={cars:null,setCars(c){this.cars=c;}};
const fx=createSpeedEffects({smoke,level:'off'}),material=fx.motes.material,program=material.version;
const player=Object.assign(new TestCar(JSON.parse(readFileSync(new URL('../dados/pista.json',import.meta.url)))),{vx:30,vy:0});
const near={x:player.x+20,y:player.y,vx:25,vy:0},far={x:player.x+900,y:player.y,vx:25,vy:0};
const view=new THREE.PerspectiveCamera();view.position.set(player.x,player.surface.z+3,-player.y);view.updateMatrixWorld();
for(const level of choices){
 fx.setLevel(level);const p=SPEED_EFFECTS[level];calls.length=0;
 fx.update(1/60,view,{cars:[player,near,far],landscape:land});
 assert.equal(fx.info().motes.count,p.motes,level);assert.equal(fx.info().drawCalls,p.motes?1:0);assert.equal(smoke.debris,p.debris);assert.equal(smoke.kerbGrit,p.kerbGrit);
 // The road under the camera reaches the specks (the player's track: its width, its bend).
 if(p.motes){const road=fx.info().motes.road;assert(road&&Math.abs(road.half*2-player.a[player.index][4])<3,`${level}: road ${JSON.stringify(road)}`);}
 assert.deepEqual(calls.map(c=>c[0]),p.rivalDust?[near]:[],`${level}: dust only for rivals in sight`);
 assert.equal(land.cars.length,p.grassWake?2:0,`${level}: grass wake (the far rival is out of reach)`);
 assert.deepEqual(fx.sound(null),{kerb:null,windSweep:p.windSweep});
}
calls.length=0;fx.update(0,view,{cars:[player,near],landscape:land});assert.equal(calls.length,0,'paused: no dust');
assert(fx.motes.material===material&&material.version===program,'live level changes never recompile');
// The box's floor is the ground under the camera wherever it is (a watched rival far away, the TV towers), not
// the road beside the player's car that the player's station found; then it keeps up as the camera moves on.
{
 fx.setLevel('completa');const ref=new TestCar(player.data),floor=MOTE_FLOOR+MOTE_BOX[1]/2;let worst=0;
 for(let k=0;k<240;k++){const i=(player.index+Math.floor(player.n/3)+k)%player.n,p=player.a[i],x=p[1]+p[9]*2,y=p[2]+p[10]*2;
  view.position.set(x,0,-y);ref.index=i;const ground=ref.sample(x,y,i).z;view.position.y=ground+2;view.updateMatrixWorld();
  fx.update(1/60,view,{cars:[player]});worst=Math.max(worst,Math.abs(fx.motes.uniforms.moteCentre.value.y-ground-floor));}
 assert(worst<.05,`the ground under a far camera (${worst.toFixed(3)} m off)`);
}
fx.dispose();

// --- The smoke's second ring: rivals' dust on the grass, none on asphalt or on a kerb, bits only at Completa.
const data=JSON.parse(readFileSync(new URL('../dados/pista.json',import.meta.url)));data.meta.id='interlagos';
const a=data.samples,n=a.length;let run=null;
for(let i=0;i<n&&!run;i++)if([0,1,2,3,4,5,6,7,8,9].every(k=>kerbSegment(data,i+k,1)))run=i+5;
const rival=new TestCar(data),half=Math.abs(SUSPENSION_WHEELS[0].y);
const place=(d,speed)=>{const p=a[run];rival.reset(run);rival.x=p[1]+p[9]*d;rival.y=p[2]+p[10]*d;rival.heading=Math.atan2(p[8],p[7]);rival.vx=Math.cos(rival.heading)*speed;rival.vy=Math.sin(rival.heading)*speed;rival.settle();};
const ring=(smoke,frames,dt=1/60)=>{for(let k=0;k<frames;k++){smoke.rival(rival,dt);smoke.age(dt);}return smoke.info();};
const edge=a[run][4]/2;
let s=new TyreSmoke();place(edge+3.2,30);assert.equal(surfaceKind(data,rival.surface),'dirt');
let info=ring(s,60);assert(info.speedFx.dust>20&&info.speedFx.bits===0&&info.active===0&&info.total===0,'a rival on the grass raises dust in its own ring, no bits below Completa');
s.debris=true;info=ring(s,30);assert(info.speedFx.bits>0,'Completa: grass bits fly');
// Bits live a moment, never grow past BIT_PIXELS on screen and fade before the lens (no paper confetti by the camera).
assert(s.particles.slice(s.capacity).filter(p=>p.dust>=2).every(p=>p.life>=BIT_LIFE[0]-1e-9&&p.life<=BIT_LIFE[1]+1e-9)&&BIT_LIFE[1]<=.4,'short-lived bits');
assert(s.material.vertexShader.includes(`${BIT_PIXELS.toFixed(1)}*viewport/1080.`)&&/bit\?smoothstep\(1\.6,3\.6,-p\.z\)/.test(s.material.vertexShader),'small, faded near the camera');
assert(s.material.blendSrcAlpha===THREE.ZeroFactor&&s.material.blendDstAlpha===THREE.OneFactor,'smoke and dust never write the occlusion mask');
// A paved run-off (soft() false: the orthophoto's paving) throws no dust and no bits, for rivals and the player.
{const paved=new TyreSmoke();paved.debris=true;paved.soft=()=>false;ring(paved,60);assert.equal(paved.info().speedFx.total,0,'rival on a paved run-off: nothing');
 for(let k=0;k<60;k++)paved.update(rival,SUSPENSION_WHEELS.map(w=>({x:w.x,y:w.y,front:w.front,strength:0})),1/60,1080);assert.equal(paved.info().total,0,'player on a paved run-off: no dust');paved.dispose();}
// What main.js hands soft() (landscape.js looseGround): one photo pixel per metre, grass, the teal paint the terrain
// draws as run-off (field.paint), the same teal behind a barrier (drawn as grass), grey paving.
{const rgb=[[.25,.4,.15],[.3,.55,.55],[.3,.55,.55],[.5,.5,.5]],pixels=new Uint8Array(rgb.flatMap(c=>[...c.map(v=>v*255),255]));
 const ortho={pixels,lum:Float32Array.from(rgb,([r,g,b])=>.299*r+.587*g+.114*b),rough:new Float32Array(4).fill(.05),index:x=>x>=0&&x<4?Math.floor(x):-1};
 const field={paint:Float32Array.of(0,1,0,0),cell:x=>x>=0&&x<4?Math.floor(x):-1},soft=looseGround(field,ortho);
 assert.deepEqual([0,1,2,3,9].map(x=>soft(x+.5,0)),[true,false,true,false,true],'dirt off grass only: the painted run-off and the paving smoke like asphalt');}
s=new TyreSmoke();s.debris=true;place(edge+.5-half,30);info=ring(s,60);assert.equal(info.speedFx.total,0,'one side on a kerb, the other on asphalt: no dirt');
place(0,30);info=ring(s,60);assert.equal(info.speedFx.total,0,'asphalt: nothing');
place(edge+3.2,30);ring(s,1,0);assert.equal(s.info().speedFx.total,0,'paused: nothing');
place(edge+3.2,2);ring(s,60);assert.equal(s.info().speedFx.total,0,'walking pace: nothing');
// A full ring wraps over its oldest particles and never touches the player's.
s=new TyreSmoke();s.debris=true;place(edge+3.2,45);ring(s,400);info=s.info();assert(info.speedFx.total>s.extra&&info.speedFx.active<=s.extra&&info.total===0,'the ring wraps on its own');
// A rival beside the pit entry with its wheels on the surveyed pit lane: paved, as for the player (each wheel is
// sampled; the centre line's distance alone called the lane grass and threw dust off the asphalt).
{
 let spot=null;
 for(let i=0;i<n&&!spot;i++){const p=a[i];if(p[0]<3850||p[0]>4150)continue;
  for(const side of [-1,1])for(let k=0;k<=18&&!spot;k++){const d=side*(p[4]/2-1.2+k*.25);
   rival.reset(i);rival.x=p[1]+p[9]*d;rival.y=p[2]+p[10]*d;rival.heading=Math.atan2(p[8],p[7]);rival.vx=Math.cos(rival.heading)*30;rival.vy=Math.sin(rival.heading)*30;rival.settle();
   const S=rival.surface,c=Math.cos(rival.heading),sn=Math.sin(rival.heading);if(S.pit||Math.abs(S.d)<S.width/2-1.3)continue;
   const kinds=SUSPENSION_WHEELS.map(w=>{const ox=c*w.x-sn*w.y,oy=sn*w.x+c*w.y,dd=S.d+ox*S.lx+oy*S.ly;return [surfaceKind(data,rival.sample(rival.x+ox,rival.y+oy,rival.index)),surfaceKind(data,{i:S.i,d:dd,width:S.width,onRoad:Math.abs(dd)<S.width/2})];});
   if(kinds.every(([real])=>real!=='dirt')&&kinds.some(([,line])=>line==='dirt'))spot=true;}}
 assert(spot,'Interlagos pit entry: a rival whose lane wheels the centre line alone would call grass');
 const lane=new TyreSmoke();lane.debris=true;ring(lane,60);assert.equal(lane.info().speedFx.total,0,'wheels on the pit lane: no dust, no bits');lane.dispose();
}
// The player's own wheels on the kerb: no dirt cloud (a kerb is paved), on the grass: dust.
const wheels=SUSPENSION_WHEELS.map(w=>({x:w.x,y:w.y,front:w.front,strength:0}));
s=new TyreSmoke();place(edge+.5-half,30);for(let k=0;k<60;k++)s.update(rival,wheels,1/60,1080);assert.equal(s.info().total,0,'player on a kerb: no dust');
place(edge+3.2,30);for(let k=0;k<60;k++)s.update(rival,wheels,1/60,1080);assert(s.info().total>20,'player on the grass: dust');
assert.equal(s.size,s.capacity+s.extra);s.dispose();
// Média and up (kerbGrit): a wheel on a painted kerb at speed scuffs up a faint puff of grit in the second ring (thin,
// short-lived, grey dust and grit specks, never a grass blade); none on asphalt, none slow, none below Média.
{
 const g=new TyreSmoke();g.kerbGrit=true;place(edge+.5-half,36);assert(SUSPENSION_WHEELS.some(w=>{const c=Math.cos(rival.heading),sn=Math.sin(rival.heading);return surfaceKind(data,rival.sample(rival.x+c*w.x-sn*w.y,rival.y+sn*w.x+c*w.y,rival.index))==='kerb';}),'a wheel on the kerb');
 for(let k=0;k<60;k++)g.update(rival,wheels,1/60,1080);let info=g.info();
 assert(info.total===0&&info.speedFx.active>=5&&info.speedFx.active<=40,`kerb grit ${JSON.stringify(info.speedFx)}`);
 const grit=g.particles.slice(g.capacity).filter(p=>p.age<p.life);
 assert(grit.every(p=>p.dust===1?p.strength<=KERB_GRIT.strength+1e-9&&p.life<=KERB_GRIT.life[1]:p.dust>=2.6),'faint dust and grit specks, no grass');
 // (the player's own wheels' grit is tagged as such: the browser check counts it apart from the rivals' dust)
 assert(info.speedFx.kerb===info.speedFx.active,`the player's kerb grit tagged ${JSON.stringify(info.speedFx)}`);
 const calm=new TyreSmoke();calm.kerbGrit=true;place(edge+.5-half,KERB_GRIT.from-2);for(let k=0;k<60;k++)calm.update(rival,wheels,1/60,1080);assert.equal(calm.info().speedFx.total,0,'slow over a kerb: nothing');
 // A wet track lays the dust: a drizzle (.55) or the rain (1), none; damp (.15), fewer puffs than dry.
 for(const wetness of [.55,1]){const wet=new TyreSmoke();wet.kerbGrit=true;wet.wet=wetness;place(edge+.5-half,36);for(let k=0;k<60;k++)wet.update(rival,wheels,1/60,1080);assert.equal(wet.info().speedFx.total,0,`wet kerb (${wetness}): no grit`);wet.dispose();}
 {const damp=new TyreSmoke();damp.kerbGrit=true;damp.wet=.15;place(edge+.5-half,36);for(let k=0;k<60;k++)damp.update(rival,wheels,1/60,1080);const n=damp.info().speedFx.total;assert(n>0&&n<g.info().speedFx.total,`damp kerb: fewer puffs (${n})`);damp.dispose();}
 place(0,36);const road=new TyreSmoke();road.kerbGrit=true;for(let k=0;k<60;k++)road.update(rival,wheels,1/60,1080);assert.equal(road.info().speedFx.total,0,'asphalt: nothing');
 // A rival's wheels on the kerb scuff it the same way (not tagged as the player's).
 const r=new TyreSmoke();r.kerbGrit=true;place(edge+.5-half,36);for(let k=0;k<60;k++){r.rival(rival,1/60);r.age(1/60);}assert(r.info().speedFx.active>=3&&r.info().speedFx.kerb===0,'a rival on the kerb');
 for(const t of [g,calm,road,r])t.dispose();
}

// --- The verge grass: one material for every block, at most WAKE_CARS cars, a new program key.
const field=buildTrackField(data),fit=fitGround(data),ground=(x,y)=>groundHeight(data.terrain,fit.heights,x,y);
const verge=createVergeVegetation({data,field,ground,density:1,lod:130}),grass=verge.root.children[0].material;
assert.equal(grass.customProgramCacheKey(),'verge-blades-v3','a new program for the wake');
verge.setCars(Array.from({length:9},(_,k)=>({x:k,y:2*k,vx:30,vy:-4})));
assert.equal(grass.userData.wake.vergeCarCount.value,WAKE_CARS);assert.deepEqual(grass.userData.wake.vergeCars.value[3].toArray(),[3,-6,30,4],'world x/z and velocity');
verge.setCars([]);assert.equal(verge.wakeInfo().cars,0);
const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};grass.onBeforeCompile(shader);
assert(shader.vertexShader.includes(`uniform vec4 vergeCars[${WAKE_CARS}]`)&&shader.uniforms.vergeCars===grass.userData.wake.vergeCars,'the wake uniforms reach the shader');
assert(verge.root.children.every(m=>m.material===grass&&!m.castShadow),'one shared material, no shadow draws');
verge.dispose?.();field.texture.dispose();

console.log(JSON.stringify({motes:perLevel,wrapChecks:500,streak:+streak.length().toFixed(3),rivalDust:'ok',grassCars:WAKE_CARS}));
console.log('particulas: ok');
