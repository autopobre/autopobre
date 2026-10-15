import assert from 'node:assert/strict';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {GRAPHICS_LEVELS,GRAPHICS_OPTIONS,GRAPHICS_PRESETS,SHADOW_LEVELS,VIEW_DISTANCES,SCENERY_LEVELS,MIRROR_SIZES,REFLECTION_LEVELS,CAR_DETAIL,PEOPLE_REACH,autoLevel,autoReason,gpuTier,lowerLevel,resolutionFloor,ResolutionPace,FrameWatch,normalizeGraphics,resolveGraphics,setGraphicsValue,chooseGraphicsLevel,debugCorner,FrameLimiter,DisplayCadence,adaptivePixelRatio} from '../teste/graphics-settings.js';
import {gpuName,DebugOverlay,frameStats} from '../teste/debug-overlay.js';
import {clusterGeometry} from '../teste/car-lod.js';
import {CINEMATIC_FEATURES,compileInSlices} from '../teste/cinematic.js';

const rank=(key,value)=>GRAPHICS_OPTIONS[key].choices.findIndex(([v])=>v===value);
// Four levels, each a full set of valid values, and each never lighter than the one below.
assert.deepEqual(GRAPHICS_LEVELS,['baixo','medio','alto','ultra']);
for(const level of GRAPHICS_LEVELS){
 assert.deepEqual(Object.keys(GRAPHICS_PRESETS[level]).sort(),Object.keys(GRAPHICS_OPTIONS).sort(),`${level} sets every option`);
 for(const [key,value] of Object.entries(GRAPHICS_PRESETS[level]))assert.ok(rank(key,value)>=0,`${level}.${key}=${value} is a choice`);
}
for(let i=1;i<GRAPHICS_LEVELS.length;i++)for(const key of Object.keys(GRAPHICS_OPTIONS)){
 const lower=GRAPHICS_LEVELS[i-1],upper=GRAPHICS_LEVELS[i];
 assert.ok(rank(key,GRAPHICS_PRESETS[upper][key])>=rank(key,GRAPHICS_PRESETS[lower][key]),`${upper}.${key} is not lighter than ${lower}.${key}`);
}
// Every choice the engine reads has its engine values.
for(const [key,table] of [['shadows',SHADOW_LEVELS],['viewDistance',VIEW_DISTANCES],['scenery',SCENERY_LEVELS],['mirrors',MIRROR_SIZES],['reflections',REFLECTION_LEVELS],['carDetail',CAR_DETAIL],['scenery',PEOPLE_REACH]])
 for(const [value] of GRAPHICS_OPTIONS[key].choices)assert.ok(Object.hasOwn(table,value),`${key} ${value} has engine values`);
for(const view of Object.values(VIEW_DISTANCES))assert.ok(view.fog[0]<view.fog[1]&&view.fog[1]<view.far,'fog ends before the far plane');
assert.deepEqual(Object.keys(CINEMATIC_FEATURES).sort(),['ao','lens','motionBlur','samples']);

// Médio is what phones had before the Gráficos tab, Alto what computers had.
const medio=GRAPHICS_PRESETS.medio,alto=GRAPHICS_PRESETS.alto;
assert.equal(autoLevel(true),'medio');assert.equal(autoLevel(false),'alto');
assert.deepEqual([medio.resolution,medio.antialias,medio.post,medio.motionBlur,medio.water],[1,0,'lite',false,'simples']);
assert.deepEqual([SHADOW_LEVELS[medio.shadows].size,SHADOW_LEVELS[medio.shadows].reach,SHADOW_LEVELS[medio.shadows].radius],[1024,55,2]);
assert.deepEqual([VIEW_DISTANCES[medio.viewDistance].fog,VIEW_DISTANCES[medio.viewDistance].far],[[420,2400],6500]);
assert.deepEqual(SCENERY_LEVELS[medio.scenery],{mobile:true,density:1,lod:80});assert.deepEqual(MIRROR_SIZES[medio.mirrors],[510,85]);
assert.deepEqual([alto.resolution,alto.antialias,alto.post,alto.ao,alto.lens,alto.motionBlur,alto.water],[1.5,4,'full',true,true,true,'simples']);
assert.deepEqual([SHADOW_LEVELS[alto.shadows].size,SHADOW_LEVELS[alto.shadows].reach,SHADOW_LEVELS[alto.shadows].radius],[4096,85,2]);
assert.deepEqual([VIEW_DISTANCES[alto.viewDistance].fog,VIEW_DISTANCES[alto.viewDistance].far],[[520,3300],6500]);
assert.deepEqual(SCENERY_LEVELS[alto.scenery],{mobile:false,density:1,lod:130});assert.deepEqual(MIRROR_SIZES[alto.mirrors],[1020,170]);
assert.equal(medio.fpsLimit,0);assert.equal(alto.fpsLimit,0);

// Automático follows the device; changes by hand sit on top of whatever level is in force.
let graphics=normalizeGraphics(undefined);
assert.deepEqual(graphics,{level:'auto',overrides:{}});
assert.equal(resolveGraphics(graphics,{touch:true}).level,'medio');assert.equal(resolveGraphics(graphics,{touch:false}).level,'alto');
graphics=setGraphicsValue(graphics,'water','realista',{touch:false});
assert.deepEqual(graphics,{level:'auto',overrides:{water:'realista'}});
for(const touch of [true,false]){const state=resolveGraphics(graphics,{touch});assert.equal(state.values.water,'realista');assert.deepEqual(state.changed,['water']);assert.equal(state.auto,true);}
// Back to the level's own value: no longer a change.
graphics=setGraphicsValue(graphics,'water','simples',{touch:false});assert.deepEqual(graphics.overrides,{});
// An override equal to the level in force is kept but not shown as a change (Automático on a phone).
graphics={level:'auto',overrides:{post:'lite'}};
assert.deepEqual(resolveGraphics(graphics,{touch:true}).changed,[]);assert.deepEqual(resolveGraphics(graphics,{touch:false}).changed,['post']);
// Two pixel densities the screen draws alike count as the same (a custom test).
graphics=setGraphicsValue({level:'alto',overrides:{}},'resolution',2,{same:(a,b,k)=>k==='resolution'?Math.min(a,1)===Math.min(b,1):a===b});
assert.deepEqual(graphics.overrides,{},'2x and 1.5x on a 1x screen are both the native size');
// Unknown settings or values change nothing; picking a level drops the changes by hand.
const before={level:'ultra',overrides:{shadows:'baixa'}};
assert.equal(setGraphicsValue(before,'shadows','enormes'),before);assert.equal(setGraphicsValue(before,'bloom',true),before);
assert.deepEqual(chooseGraphicsLevel('baixo'),{level:'baixo',overrides:{}});assert.deepEqual(chooseGraphicsLevel('extremo'),{level:'auto',overrides:{}});
assert.deepEqual(resolveGraphics(before).values,{...GRAPHICS_PRESETS.ultra,shadows:'baixa'});
// Old saves: realistic water and the film look become changes to Automático (only without a graphics entry).
assert.deepEqual(normalizeGraphics(undefined,{realisticWater:true,cinematic:'lite'}),{level:'auto',overrides:{water:'realista',post:'lite'}});
assert.deepEqual(normalizeGraphics({level:'medio'},{realisticWater:true}),{level:'medio',overrides:{}});
assert.deepEqual(normalizeGraphics({level:'alto',overrides:{fpsLimit:'30',antialias:8,shadows:'ultra'}}),{level:'alto',overrides:{shadows:'ultra'}});

// The FPS limit holds the average on fast screens and leaves slower ones alone.
function rendered(hz,limit,seconds=10,jitter=.3){
 const cap=new FrameLimiter(limit);let frames=0,seed=7;
 for(let i=1;i<=hz*seconds;i++){seed=(seed*16807)%2147483647;const now=i*1000/hz+(seed/2147483647-.5)*jitter;if(!cap.skip(now))frames++;}
 return frames/seconds;
}
assert.ok(Math.abs(rendered(144,60)-60)<1.5,`60 FPS on 144 Hz: ${rendered(144,60)}`);
assert.ok(Math.abs(rendered(120,60)-60)<1.5,`60 FPS on 120 Hz: ${rendered(120,60)}`);
assert.ok(Math.abs(rendered(60,30)-30)<1,`30 FPS on 60 Hz: ${rendered(60,30)}`);
assert.equal(rendered(60,60),60,'a 60 FPS limit on a 60 Hz screen skips nothing');
assert.equal(rendered(144,0),144,'no limit');
assert.ok(rendered(40,60)===40,'a slow device is never held back');
for(const limit of [90,120,144,160])assert.ok(Math.abs(rendered(165,limit)-limit)<1.5,`${limit} FPS on 165 Hz`);
// With the screen's rate known the limit keeps every frame on screen equally long: whole screen frames, never fewer
// frames than the limit asks.
function paced(hz,limit,seconds=10){
 const cap=new FrameLimiter(limit);let frames=0,last=null;const gaps=new Set();
 for(let i=1;i<=hz*seconds;i++){const now=i*1000/hz;if(!cap.skip(now,hz)){frames++;if(last!==null)gaps.add(Math.round((now-last)*10));last=now;}}
 return {fps:frames/seconds,even:gaps.size===1};
}
for(const [hz,limit,fps] of [[75,60,75],[144,60,72],[120,60,60],[60,60,60],[240,60,60],[60,30,30],[165,30,33],[144,144,144]]){
 const r=paced(hz,limit);assert.ok(Math.abs(r.fps-fps)<1,`${limit} on ${hz} Hz: ${r.fps}`);assert.ok(r.even,`${limit} on ${hz} Hz keeps an even pace`);
 assert.ok(Math.abs(new FrameLimiter(limit).rate(hz)-fps)<.01,`rate ${limit} on ${hz} Hz`);}
assert.equal(new FrameLimiter(0).rate(165),165);assert.equal(new FrameLimiter(60).rate(0),60);
assert.equal(new FrameLimiter(120).rate(165),120,'a cap far under the next whole number of frames holds');assert.equal(new FrameLimiter(60).rate(165),60);
assert.ok(Math.abs(paced(165,120).fps-120)<1.5,'120 on 165 Hz still averages 120');
assert.equal(new FrameLimiter(60).slot(165),82.5,'the frames that keep 60 on 165 Hz have two screen frames');assert.equal(new FrameLimiter(60).slot(75),75);assert.equal(new FrameLimiter(120).slot(165),120);assert.equal(new FrameLimiter(0).slot(75),75);

// Browser cadence is sampled before the limiter, then held during racing load. Moving to a
// slower screen remeasures it; a 160 FPS request must not crush resolution on a 60 Hz monitor.
const cadence=new DisplayCadence();let stamp=100;
function ticks(hz,seconds,measure){for(let i=0;i<hz*seconds;i++){stamp+=1000/hz;cadence.observe(stamp,measure);}}
ticks(160,4,true);assert.equal(cadence.hz,160);assert.equal(cadence.target(),160);
assert.equal(cadence.target(120,144),120);assert.equal(cadence.target(160,60),60);
ticks(40,4,false);assert.equal(cadence.hz,160,'GPU load does not masquerade as a monitor change');
cadence.reset();ticks(60,4,false);assert.equal(cadence.hz,60);assert.equal(cadence.target(160),60);
cadence.observe(stamp+10000);assert.equal(cadence.hz,60,'a background-tab stall is not a refresh interval');
const loadingCadence=new DisplayCadence();for(let i=1;i<=144;i++)loadingCadence.observe(i*1000/144,true);
loadingCadence.observe(15000);for(let i=1;i<=100;i++)loadingCadence.observe(15000+i*1000/30,false);
assert.equal(loadingCadence.hz,144,'a long shader compilation does not extend calibration into a GPU-heavy race');
const adapt=(frameSeconds,targetFps,min=.7,max=1.5)=>adaptivePixelRatio(1,{min,max,frameSeconds,targetFps});
assert.ok(adapt(1/85,160)<1,'high-refresh target can trade pixels for speed');
assert.ok(adapt(1/60,60)>1,'native refresh headroom recovers quality');
assert.equal(adapt(1/53,60),1,'hysteresis avoids a resize for small changes');
assert.equal(adapt(1/30,60,1),1,'never below the floor');
assert.equal(adapt(1/165,160,.7,1),1,'never above the selected density');
assert.ok(adaptivePixelRatio(1,{min:.7,max:1.5,frameSeconds:1/80,gpuSeconds:.004,targetFps:160})>1,'CPU-bound frames do not needlessly blur the picture');
assert.ok(adaptivePixelRatio(1,{min:.7,max:1.5,frameSeconds:1/80,gpuSeconds:.012,targetFps:160})<1,'GPU-bound frames trade pixels for speed');
// Baixo (tight) steps down 10% over the GPU budget and up with 15% room; the other levels keep their old 22% and 6%.
{const at=(gpu,tight)=>adaptivePixelRatio(1,{min:.5,max:1.5,frameSeconds:1/60,gpuSeconds:gpu/60,targetFps:60,tight});
 assert.ok(at(1.15,true)<1&&at(1.15,false)===1,'15% over: Baixo steps down, the others wait');
 assert.ok(at(.9,false)>1&&at(.9,true)===1,'10% under: the others step up, Baixo waits for more room');
 // Baixo holds its cap: frames missing it with the GPU busy most of the budget step down; CPU-bound frames do not.
 const missing=(gpu,frame)=>adaptivePixelRatio(1,{min:.5,max:1.5,frameSeconds:frame/60,gpuSeconds:gpu/60,targetFps:60,tight:true});
 assert.ok(missing(.93,1.12)<1&&missing(.6,1.12)>=1&&missing(.93,1.05)===1,'frames missing the cap with a busy GPU');}
assert.equal(normalizeGraphics({level:'alto',overrides:{materials:'baixo',targetFps:160,cameraMotion:0}}).overrides.targetFps,160);

// One shared asynchronous timer serves the hidden adaptive controller and the visible panel.
// A disjoint/lost context must invalidate stale results, including a saturated pending queue.
{
 let disjoint=false,lost=false,available=false,active=false,deleted=0,id=0;const listeners={};
 const gl={QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,isContextLost:()=>lost,getExtension:()=>({TIME_ELAPSED_EXT:3,GPU_DISJOINT_EXT:4}),
  getParameter:()=>disjoint,getQueryParameter:(_q,key)=>key===1?available:4e6,createQuery:()=>++id,
  beginQuery:()=>{assert(!active,'no nested GPU query');active=true;},endQuery:()=>{assert(active);active=false;},deleteQuery:()=>deleted++};
 const timer=Object.create(DebugOverlay.prototype);Object.assign(timer,{renderer:()=>({getContext:()=>gl,domElement:{addEventListener:(event,fn)=>listeners[event]=fn}}),mode:'off',gpu:null,frameGpuMs:null,window:{gpu:0,gpuFrames:0},shown:{gpu:null}});
 for(let i=0;i<8;i++){timer.gpuBegin();timer.gpuEnd();}
 assert.equal(timer.gpu.pending.length,8);timer.frameGpuMs=12;disjoint=true;timer.gpuBegin();
 assert.equal(timer.gpu.pending.length,0);assert.equal(timer.frameGpuMs,null);assert.equal(deleted,8);
 disjoint=false;available=true;timer.gpuBegin();timer.gpuEnd();timer.gpuBegin();timer.gpuEnd();assert.equal(timer.frameGpuMs,4,'hidden profiling still supplies GPU time');
 lost=true;listeners.webglcontextlost();timer.gpuBegin();assert.equal(timer.gpu,null);assert.equal(timer.frameGpuMs,null);
 lost=false;listeners.webglcontextrestored();timer.gpuBegin();timer.gpuEnd();assert.equal(timer.gpu.pending.length,1,'restored context uses a fresh timer');timer.stopGpu();
}

// The overlay: the corner and the graphics card's name.
assert.equal(debugCorner('auto',true),'tc');assert.equal(debugCorner('auto',false),'tl');assert.equal(debugCorner('br',true),'br');
assert.equal(gpuName('ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 (0x00002D05) Direct3D11 vs_5_0 ps_5_0, D3D11)'),'NVIDIA GeForce RTX 5060 · Direct3D11');
assert.equal(gpuName('ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)'),'Intel(R) UHD Graphics 620 · Direct3D11');
assert.equal(gpuName('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)'),'ANGLE Metal Renderer: Apple M2');
assert.equal(gpuName('Adreno (TM) 650'),'Adreno (TM) 650');assert.equal(gpuName(''),'desconhecida');
// Automático by the video chip: a cheap PC lands on Baixo by itself, a graphics card on Alto, phones on Médio.
const tierOf=name=>gpuTier(name).tier;
assert.equal(tierOf('ANGLE (Intel, Intel(R) UHD Graphics (0x00009BC4) Direct3D11 vs_5_0 ps_5_0, D3D11)'),'fraca');
assert.equal(tierOf('ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0)'),'fraca');
assert.equal(tierOf('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)'),'fraca');
assert.equal(tierOf('Mesa Intel(R) UHD Graphics 620 (KBL GT2)'),'fraca');
assert.equal(tierOf('ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)'),'fraca');
assert.equal(tierOf('ANGLE (AMD, AMD Radeon(TM) Vega 8 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'),'fraca');
assert.equal(tierOf('ANGLE (NVIDIA, NVIDIA GeForce GT 730 Direct3D11 vs_5_0 ps_5_0, D3D11)'),'fraca');
assert.equal(tierOf('Mali-G52 MC2'),'fraca');assert.equal(tierOf('Adreno (TM) 610'),'fraca');assert.equal(tierOf('PowerVR Rogue GE8320'),'fraca');
assert.equal(tierOf('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'),'software');
assert.equal(tierOf('llvmpipe (LLVM 15.0.7, 256 bits)'),'software');
assert.equal(tierOf('ANGLE (AMD, AMD Radeon 780M Graphics (0x000015BF) Direct3D11 vs_5_0 ps_5_0, D3D11)'),'media');
// Intel's Arc cards are graphics cards, the Arc in Core Ultra chips integrated; Vega only on the APUs; Snapdragon X Médio.
assert.equal(tierOf('ANGLE (Intel, Intel(R) Arc(TM) A750 Graphics (0x000056A1) Direct3D11 vs_5_0 ps_5_0, D3D11)'),'forte');
assert.equal(tierOf('ANGLE (Intel, Intel(R) Arc(TM) B580 Graphics (0x0000E20B) Direct3D11 vs_5_0 ps_5_0, D3D11)'),'forte');
assert.equal(tierOf('ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)'),'media');
assert.equal(tierOf('ANGLE (Intel, Intel(R) Arc(TM) 140V GPU (16GB) (0x000064A0) Direct3D11 vs_5_0 ps_5_0, D3D11)'),'media');
assert.equal(tierOf('ANGLE (AMD, Radeon RX Vega (0x0000687F) Direct3D11 vs_5_0 ps_5_0, D3D11)'),'forte');
assert.equal(tierOf('ANGLE (AMD, AMD Radeon RX Vega 56 Direct3D11 vs_5_0 ps_5_0, D3D11)'),'forte');
assert.equal(tierOf('ANGLE (Qualcomm, Qualcomm(R) Adreno(TM) X1-85 GPU Direct3D11 vs_5_0 ps_5_0, D3D11)'),'media');
assert.equal(tierOf('ANGLE (NVIDIA, NVIDIA GeForce MX250 Direct3D11 vs_5_0 ps_5_0, D3D11)'),'media');assert.equal(tierOf('Adreno (TM) 650'),'media');
assert.equal(tierOf('ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 Laptop GPU (0x00002D05) Direct3D11 vs_5_0 ps_5_0, D3D11)'),'forte');
assert.equal(tierOf('ANGLE (AMD, AMD Radeon RX 6600 (0x000073FF) Direct3D11 vs_5_0 ps_5_0, D3D11)'),'forte');
assert.equal(tierOf('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)'),'forte');
assert.equal(tierOf(''),null);assert.equal(tierOf('WebKit WebGL'),null);
const deviceOf=(renderer,drop=null)=>({renderer,...gpuTier(renderer),drop});
const uhd=deviceOf('ANGLE (Intel, Intel(R) UHD Graphics (0x00009BC4) Direct3D11 vs_5_0 ps_5_0, D3D11)'),rtx=deviceOf('ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 Laptop GPU (0x00002D05) Direct3D11 vs_5_0 ps_5_0, D3D11)');
assert.equal(autoLevel(false,uhd),'baixo');assert.equal(autoLevel(false,rtx),'alto');assert.equal(autoLevel(true,rtx),'medio','phones keep Médio');
assert.equal(autoLevel(true,deviceOf('Mali-G52 MC2')),'baixo','a small phone chip goes lighter');assert.equal(autoLevel(false,deviceOf('')),'alto');assert.equal(autoLevel(true,deviceOf('')),'medio');
assert.equal(autoLevel(false,deviceOf(rtx.renderer,'medio')),'medio','a step down taken in a race holds');
assert.equal(autoLevel(false,deviceOf(uhd.renderer,'medio')),'baixo','a remembered step never goes above the chip');
assert.equal(resolveGraphics({level:'auto',overrides:{}},{touch:false,device:uhd}).level,'baixo');
assert.equal(resolveGraphics({level:'alto',overrides:{}},{touch:false,device:uhd}).level,'alto','a level chosen by hand is kept');
assert.match(autoReason(false,uhd),/vídeo integrado/);assert.match(autoReason(false,rtx),/placa de vídeo/);assert.equal(autoReason(true,rtx),'celular');
assert.match(autoReason(false,deviceOf(rtx.renderer,'medio')),/pesou/);
assert.equal(lowerLevel('alto'),'medio');assert.equal(lowerLevel('baixo'),null);
assert.equal(resolutionFloor('baixo',false),.5);assert.equal(resolutionFloor('medio',true),.6);assert.equal(resolutionFloor('alto',false),.7);
assert.equal(resolutionFloor('baixo',true),.6,'phones keep .6 even on Baixo');
// The race watch: only a long, steady shortfall with dynamic resolution spent, once.
const watch=(fps,seconds,floor=true,w=new FrameWatch())=>{let fired=0;for(let i=0;i<fps*seconds;i++)if(w.feed(1/fps,{target:60,floor}))fired++;return {fired,w};};
assert.equal(watch(58,60).fired,0,'a steady 58 FPS is fine');assert.equal(watch(30,8).fired,0,'a short dip waits');
assert.equal(watch(30,30).fired,1,'30 FPS for half a minute at the floor steps down once');assert.equal(watch(30,30,false).fired,0,'dynamic resolution still has room');
{const w=new FrameWatch();assert.equal(w.feed(5,{target:60}),false,'a pause or a load is no frame');assert.equal(watch(100,60,true,new FrameWatch()).fired,0);
 const fast=new FrameWatch();for(let i=0;i<165*30;i++)fast.feed(1/90,{target:165});assert.equal(fast.fired,false,'90 FPS on a 165 Hz screen is no reason to lower the level');}
// Dynamic resolution's pace: a load that swings round the budget every few seconds changes the density a few times a
// minute at most, a load far over the budget steps down at once, and the first steps down come in two windows.
{const pace=new ResolutionPace();let ratio=.75,changes=0;
 for(let w=0;w<40;w++){const want=w%4<2?ratio-.1:ratio+.05,next=pace.decide(ratio,Math.max(.5,Math.min(.75,want)));if(next!==ratio){changes++;ratio=next;}}
 assert.ok(changes<=6,`${changes} changes in a minute of a swinging load`);
 const slow=new ResolutionPace();assert.equal(slow.decide(.75,.65),.75,'one slow window waits');assert.equal(slow.decide(.75,.65),.65,'two in a row step down');
 assert.equal(new ResolutionPace().decide(.75,.65,{far:true}),.65,'far over the budget: at once');
 const up=new ResolutionPace();up.since=0;for(let i=0;i<4;i++)assert.equal(up.decide(.6,.65),.6,'up waits for quick windows and time');
 let raised=false;for(let i=0;i<4&&!raised;i++)raised=up.decide(.6,.65)===.65;assert.ok(raised,'a lasting headroom raises the density');}
// The other cars' levels of detail: every choice has its distances, the light copy before the profile.
for(const [value] of GRAPHICS_OPTIONS.carDetail.choices){const d=CAR_DETAIL[value];assert.ok(d&&d.near>0&&d.near<d.far,`carDetail ${value}`);}
assert.deepEqual(GRAPHICS_LEVELS.map(l=>GRAPHICS_PRESETS[l].carDetail),['leve','medio','alto','maximo']);
// Ultra is the most complete version: every quality setting at its heaviest choice (the frame-rate ones are not quality).
for(const [key,option] of Object.entries(GRAPHICS_OPTIONS))if(!['fpsLimit','targetFps','dynamicResolution'].includes(key))
 assert.equal(rank(key,GRAPHICS_PRESETS.ultra[key]),option.choices.length-1,`ultra.${key} is the heaviest choice`);
// Frame stats for the checks (debug-overlay.js record): 1% low and hitches.
{const frames=[...Array(990).fill(16.7),...Array(10).fill(50)],s=frameStats(frames,frames.map(()=>4));
 assert.equal(s.frames,1000);assert.equal(s.low1,20);assert.equal(s.worst,50);assert.equal(s.hitches,10);assert.ok(Math.abs(s.fps-58.7)<.2,`average ${s.fps}`);assert.equal(s.cpu,4);}
// The light copy of a rival (car-lod.js): far fewer triangles, the same size.
{const sphere=new THREE.SphereGeometry(1,160,100),light=clusterGeometry(sphere,{cell:.08});sphere.computeBoundingBox();light.computeBoundingBox();
 assert.ok(light.index.count<sphere.index.count*.4,`${light.index.count/3} of ${sphere.index.count/3} triangles`);
 assert.ok(light.boundingBox.max.distanceTo(sphere.boundingBox.max)<.05&&light.boundingBox.min.distanceTo(sphere.boundingBox.min)<.05,'same size');
 for(let i=0;i<light.attributes.normal.count;i++)assert.ok(Math.abs(Math.hypot(light.attributes.normal.getX(i),light.attributes.normal.getY(i),light.attributes.normal.getZ(i))-1)<1e-3);}
// A recompile (a weather, a level) reaches a rival's close model while it is out of the scene graph (far away,
// immersive-visuals.js detailLevel): its programs are not left to the first close fight.
{const scene=new THREE.Scene(),root=new THREE.Group(),detail=new THREE.Group();detail.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()));
 root.userData.detail=detail;scene.add(root);const compiled=[];
 await compileInSlices({compile:o=>{compiled.push(o);},getRenderTarget:()=>null,setRenderTarget(){},info:{programs:[]},initTexture(){}},scene,new THREE.PerspectiveCamera());
 assert.ok(compiled.some(o=>{let hit=false;o.traverse(c=>{hit||=c===detail;});return hit;}),'the close model out of the graph is compiled');}
console.log('Graphics passed: four ordered levels, Médio/Alto as before, Automático per device and video chip, the race watch, cars\' levels of detail, Ultra complete, changes by hand, old saves, FPS limit, overlay.');
