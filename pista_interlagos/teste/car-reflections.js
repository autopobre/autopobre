import * as THREE from 'three';
import {REFLECTION_LEVELS} from './graphics-settings.js';
import {setCarEnvironment,setCarFinish,setCarSamples,carEnvironment,carFinishInfo,paintOf,CAR_LIGHT_MAX} from './car-finish.js';
import {compileInSlices} from './cinematic.js';
// Where the cars' paint, glass and chrome get their surroundings (the Gráficos tab's "Reflexos dos
// carros", REFLECTION_LEVELS): the sky's map for the cars (sky.js carEnvironment, with its horizon band), the circuit seen
// once from the middle of the grid ('pista': grandstands, pit wall and asphalt, as the race starts),
// or a cube that follows the player's car ('dinamico'): a few faces redrawn per frame, the whole cube
// prefiltered (PMREM) once it is complete, so the bonnet shows the grandstand going by. Every car
// (rivals too) reflects the same map: car-finish.js sets it on each material.
const FACE_ORDER=[2,0,1,4,5,3];   // up and the sides first; straight down (the car's own shadow) last
const BAKE_DELAY=3;   // race frames before the grid's picture is taken: the track round it shows by then
// What a capture leaves out, by name among the scene's and the landscape's children: the crowd (some
// 800 thousand triangles drawn whole in every cube face, a few coloured pixels in the reflection; the
// stands stay), skid marks, the lake's splashes, falling leaves and the verge's grass tufts.
const CAPTURE_SKIP=new Set(['Torcida','Marcas_de_derrapagem','Respingos_do_lago','Folhas_caindo','Vegetacao_das_margens','Chuva']);
// The prefilter of a capture (the probe's, the bake's), its texels capped at the cars' own light (CAR_LIGHT_MAX) as
// three.js copies the cube into its own layout, before any blur. The world's smooth glass is not capped: the sun's
// glint on a window at a grazing angle (the Minhocão landmarks' panes, roughness .1) passed half float's 65504 in a
// face, and the blur spread that infinity over the whole map: every car white in a halo for a probe cycle, again
// and again down the Major Sertório. The copy is three's (r183) private material, made by its public compile call.
const CAPPED_COPY=/gl_FragColor\s*=\s*(textureCube\([^;]*\));/;
export function cappedPmrem(renderer){
 const pmrem=new THREE.PMREMGenerator(renderer);pmrem.compileCubemapShader();const m=pmrem._cubemapMaterial;
 if(m&&CAPPED_COPY.test(m.fragmentShader)){m.fragmentShader=m.fragmentShader.replace(CAPPED_COPY,`gl_FragColor=min($1,vec4(${CAR_LIGHT_MAX.toFixed(1)}));`);m.needsUpdate=true;pmrem.capped=true;}
 else console.warn('car-reflections: the prefilter copy is not capped (three.js changed)');
 return pmrem;
}
export class CarReflections {
 // cinematic: the film look (cinematic.js), whose multisampling sets how smooth the coat may be.
 constructor(renderer,sky,cinematic=null){
  this.renderer=renderer;this.sky=sky;this.cinematic=cinematic;this.key='ceu';this.level=REFLECTION_LEVELS.ceu;
  this.bakeTarget=null;this.bakeWanted=0;this.cube=null;this.cubeCamera=null;this.probePmrem=null;this.probeTarget=null;this.face=0;this.fresh=true;this.tick=0;
  this.stats={bakes:0,bakeMs:0,updates:0,faces:0,frames:0,lastFaces:0};this.hidden=[];this.pending=null;this.skyOnly=false;
 }
 // At night (weather.js) the cars wear the night sky's map only: a capture of the track there is the asphalt in the
 // headlights' pools, and every black paint came out pale. True when that changed (another map size: main.js
 // precompiles); the grid's picture and the probe wait until the day comes back.
 setSkyOnly(value){value=!!value;if(value===this.skyOnly)return false;this.skyOnly=value;if(!value&&this.level.source==='bake'&&!this.bakeTarget)this.bakeWanted=BAKE_DELAY;if(!value&&this.cube)this.fresh=true;setCarEnvironment(this.environment(true),'corrida');return true;}
 // The middle of the grid (about 80 m before the line), 1.2 m over the asphalt: next to the main
 // grandstand and the pits on the circuits here. World frame (x, height, -y).
 static gridPoint(data){
  const a=data.samples,target=data.meta.reconstructed_xy_m-80,p=a[Math.max(0,a.findIndex(q=>q[0]>=target))]??a[0];
  return new THREE.Vector3(p[1],p[3]+1.2,-p[2]);
 }
 // The multisampling the picture is drawn with (the screen's own in the Simples look): the one the film
 // look's next frame uses, not the target it still holds (a level switch rebuilds that a frame later).
 samples(){const c=this.cinematic;if(!c)return 0;return c.level==='off'?(this.renderer.getContext().getContextAttributes()?.antialias?4:0):c.samples();}
 // A Gráficos choice (REFLECTION_LEVELS key). True when programs change (other map size, flake, or a
 // capture newly asked for in the Simples look): main.js then precompiles instead of freezing a frame.
 setLevel(key){
  const level=REFLECTION_LEVELS[key]??REFLECTION_LEVELS.ceu,before=carEnvironment(),was=this.level.source;this.key=REFLECTION_LEVELS[key]?key:'ceu';this.level=level;
  let programs=setCarFinish(level.finish,{samples:this.samples()});
  if(level.source==='probe'){if(!this.cube||this.cube.width!==level.probe)this.makeProbe(level.probe);this.setFar(level.far);}else this.dropProbe();
  if(level.source!=='bake')this.dropBake();else if(!this.bakeTarget)this.bakeWanted=BAKE_DELAY;
  setCarEnvironment(this.environment(true),'corrida');
  // Against the map worn before the switch (dropProbe already lent the cars the sky's on the way).
  const size=t=>t?.image?.height??0;if(size(carEnvironment())!==size(before))programs=true;
  // A bake or a probe newly asked for draws the whole scene into its own target: in the Simples look those
  // linear programs were never compiled (compile(), held by main.js precompileGraphics).
  if(level.source!==was&&level.source!=='sky'&&this.renderer.toneMapping!==THREE.NoToneMapping)programs=true;
  return programs;
 }
 makeProbe(size){
  this.dropProbe();
  this.cube=new THREE.WebGLCubeRenderTarget(size,{type:THREE.HalfFloatType,generateMipmaps:false});
  this.cubeCamera=new THREE.CubeCamera(.3,this.level.far??250,this.cube);this.cubeCamera.coordinateSystem=this.renderer.coordinateSystem;this.cubeCamera.updateCoordinateSystem();
  // A target that keeps its faces cleared until the first capture, and a prefilter of its own size
  // (a PMREMGenerator's work targets are sized by the last map it allocated).
  const previous=this.renderer.getRenderTarget();for(let f=0;f<6;f++){this.renderer.setRenderTarget(this.cube,f);this.renderer.clear();}this.renderer.setRenderTarget(previous);
  this.probePmrem=cappedPmrem(this.renderer);this.probeTarget=this.probePmrem.fromCubemap(this.cube.texture);
  this.face=0;this.fresh=true;
 }
 setFar(far){if(!this.cubeCamera)return;for(const c of this.cubeCamera.children)if(c.far!==far){c.far=far;c.updateProjectionMatrix();}}
 dropProbe(){
  if(!this.cube)return;if(carEnvironment()===this.probeTarget.texture)setCarEnvironment(this.sky.carEnvironment,'ceu');
  this.cube.dispose();this.probeTarget.dispose();this.probePmrem.dispose();this.cube=this.cubeCamera=this.probeTarget=this.probePmrem=null;
 }
 dropBake(){if(!this.bakeTarget)return;if(carEnvironment()===this.bakeTarget.texture)setCarEnvironment(this.sky.carEnvironment,'ceu');this.bakeTarget.dispose();this.bakeTarget=null;}
 // The map the cars wear now. onTrack false (the story's paddock): the grid's picture would be the
 // wrong place, the sky's is neutral; the probe is where the car is, so it stays.
 environment(onTrack=true){
  if(this.skyOnly)return this.sky.carEnvironment;
  if(this.level.source==='probe'&&this.probeTarget)return this.probeTarget.texture;
  if(this.level.source==='bake'&&onTrack&&this.bakeTarget)return this.bakeTarget.texture;
  return this.sky.carEnvironment;
 }
 // The race's map back on the cars (the car screen's studio lends them its own) before the circuit's
 // programs compile, so they compile for the map the race shows (a probe's size is another program).
 useRaceMap(){setCarEnvironment(this.environment(true),'corrida');}
 // Hides what must not reflect (the player's car, the ghost, smoke and other screen-sized sprites, the
 // rivals' name tags) or costs a capture more than it shows (CAPTURE_SKIP), and shows the rivals as
 // their one-draw distant model. restore() undoes it.
 conceal(scene,hide,rivals,lod){
  const list=this.hidden;list.length=0;const set=(o,v)=>{if(o&&o.visible!==v){list.push(o,o.visible);o.visible=v;}};
  for(const o of hide)set(o,false);
  for(const o of scene.children){if(CAPTURE_SKIP.has(o.name))set(o,false);else if(o.name==='Paisagem')for(const c of o.children)if(CAPTURE_SKIP.has(c.name))set(c,false);}
  // The rivals' headlight glare too (headlights.js): ten times white, blurred by the prefilter it greyed every paint.
  for(const r of rivals??[]){if(!r.visible)continue;const u=r.userData;set(u.nameLabel,false);set(u.headlights,false);
   if(!lod)set(r,false);else if(u.far&&u.detail){set(u.detail,false);set(u.far,true);}}
 }
 restore(){const list=this.hidden;for(let i=list.length-2;i>=0;i-=2)list[i].visible=list[i+1];list.length=0;}
 // The circuit from the grid, once: at the race's first frame (while loading, the track, stands and
 // asphalt round the grid are not shown yet: the map came out sky and horizon only) or the first after
 // choosing Pista. Cars, ghost and sprites hidden; the sun's shadows as they are. A cube camera's six
 // faces, prefiltered as the probe's.
 bake(scene,data,{hide=[],rivals=[]}={}){
  this.bakeWanted=0;if(this.level.source!=='bake')return;
  const r=this.renderer,t0=performance.now(),pmrem=cappedPmrem(r),previous=r.getRenderTarget(),shadows=r.shadowMap.autoUpdate;
  const cube=new THREE.WebGLCubeRenderTarget(this.level.bake,{type:THREE.HalfFloatType,generateMipmaps:false}),camera=new THREE.CubeCamera(.3,this.level.far??600,cube);
  camera.coordinateSystem=r.coordinateSystem;camera.updateCoordinateSystem();camera.position.copy(CarReflections.gridPoint(data));camera.updateMatrixWorld(true);
  this.conceal(scene,hide,rivals,false);r.shadowMap.autoUpdate=false;
  try{camera.update(r,scene);this.stats.bakeDrawMs=Math.round(performance.now()-t0);const target=pmrem.fromCubemap(cube.texture);this.dropBake();this.bakeTarget=target;}
  finally{this.restore();r.shadowMap.autoUpdate=shadows;cube.dispose();pmrem.dispose();r.setRenderTarget(previous);}
  this.stats.bakes++;this.stats.bakeMs=Math.round(performance.now()-t0);
  setCarEnvironment(this.environment(true),'corrida');
 }
 // Each race frame, before the main picture: the cars take the race's map back (from the car
 // screen's studio) and the probe redraws its next faces round centre (the player's car).
 update(scene,center,{onTrack=true,hide=[],rivals=[],data=null}={}){
  if((this.tick++&31)===0)setCarSamples(this.samples());
  // While the captures' programs compile (compile()) the bake waits and the probe holds its last picture.
  const waiting=!!this.pending;
  if(!waiting&&!this.skyOnly&&this.bakeWanted>0&&data&&--this.bakeWanted===0)this.bake(scene,data,{hide,rivals});
  setCarEnvironment(this.environment(onTrack),'corrida');
  if(waiting||this.skyOnly||this.level.source!=='probe'||!this.cube)return;
  const r=this.renderer,fresh=this.fresh,faces=fresh?6:this.level.faces,previous=r.getRenderTarget(),shadows=r.shadowMap.autoUpdate;this.fresh=false;
  this.cubeCamera.position.copy(center);this.cubeCamera.updateMatrixWorld(true);
  // The sun's shadow map is the last main pass's; a capture before any exists (the race's first
  // frame, shadows just switched on) draws it, or WebGL meets a map that is not there yet.
  this.conceal(scene,hide,rivals,true);if(!(r.shadowMap.enabled&&scene.children.some(o=>o.isLight&&o.castShadow&&!o.shadow?.map)))r.shadowMap.autoUpdate=false;
  // The whole scene graph's matrices as the last picture left them (a frame old for what moves; the
  // main view updates them right after): walking every tree chunk again per face cost a millisecond.
  const matrices=scene.matrixWorldAutoUpdate;scene.matrixWorldAutoUpdate=false;
  try{
   for(let i=0;i<faces;i++){const f=FACE_ORDER[this.face];r.setRenderTarget(this.cube,f);r.render(scene,this.cubeCamera.children[f]);this.face=(this.face+1)%6;this.stats.faces++;this.stats.faceCalls=r.info.render.calls;
    if(this.face===0){this.probePmrem.fromCubemap(this.cube.texture,this.probeTarget);this.stats.updates++;}}
  }finally{this.restore();scene.matrixWorldAutoUpdate=matrices;r.shadowMap.autoUpdate=shadows;r.setRenderTarget(previous);}
  this.stats.frames++;this.stats.lastFaces=faces;
 }
 // The bake and the probe draw into targets of their own: linear, no tone mapping. With the film look
 // on (cinematic.js) the main view's programs are the same; with Simples they are others, compiled
 // here in parallel (a slice at a time, compileInSlices) instead of freezing the first capture.
 compile(scene){
  const r=this.renderer;if(this.level.source==='sky'||r.toneMapping===THREE.NoToneMapping)return Promise.resolve();
  const target=new THREE.WebGLRenderTarget(4,4,{type:THREE.HalfFloatType}),camera=new THREE.PerspectiveCamera(90,1,.3,this.level.far??250);
  const done=compileInSlices(r,scene,camera,()=>target).catch(err=>console.warn(err)).finally(()=>{target.dispose();if(this.pending===done)this.pending=null;});
  this.pending=done;return done;
 }
 // clearCircuit: the grid's picture belongs to the circuit left; the cars go back to the sky's map.
 clearCircuit(){this.dropBake();if(this.level.source==='bake')this.bakeWanted=BAKE_DELAY;this.fresh=true;setCarEnvironment(this.environment(true),'corrida');}
 // The maps no circuit clean-up may dispose (main.js clearCircuit's keep set).
 textures(){return [this.sky.carEnvironment,this.bakeTarget?.texture,this.probeTarget?.texture,this.cube?.texture].filter(Boolean);}
 // For checks: the probe's six faces as a cross (PNG data URL, simple tone curve, rows as the cube
 // stores them) and their mean brightness each; the bake's prefiltered sheet as it is stored; null
 // with neither.
 snapshot(){
  const tone=v=>255*Math.pow(v/(1+v),1/2.2);
  if(!this.cube&&this.bakeTarget){
   const t=this.bakeTarget,w=t.width,h=t.height,half=new Uint16Array(w*h*4),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
   const ctx=canvas.getContext('2d'),image=ctx.createImageData(w,h);this.renderer.readRenderTargetPixels(t,0,0,w,h,half);let sum=0;
   for(let i=0;i<w*h;i++){const o=((h-1-Math.floor(i/w))*w+i%w)*4;for(let c=0;c<3;c++){const v=THREE.DataUtils.fromHalfFloat(half[i*4+c]);sum+=v;image.data[o+c]=tone(v);}image.data[o+3]=255;}
   ctx.putImageData(image,0,0);return {url:canvas.toDataURL('image/png'),means:[sum/(w*h*3)]};
  }
  if(!this.cube)return null;const n=this.cube.width,half=new Uint16Array(n*n*4),canvas=document.createElement('canvas');canvas.width=n*4;canvas.height=n*3;
  const ctx=canvas.getContext('2d'),image=ctx.createImageData(n,n),at=[[2,1],[0,1],[1,0],[1,2],[1,1],[3,1]],means=[];
  for(let f=0;f<6;f++){this.renderer.readRenderTargetPixels(this.cube,0,0,n,n,half,f);let sum=0;
   for(let i=0;i<n*n;i++){const o=((n-1-Math.floor(i/n))*n+i%n)*4;for(let c=0;c<3;c++){const v=THREE.DataUtils.fromHalfFloat(half[i*4+c]);sum+=v;image.data[o+c]=tone(v);}image.data[o+3]=255;}
   means.push(sum/(n*n*3));ctx.putImageData(image,at[f][0]*n,at[f][1]*n);}
  return {url:canvas.toDataURL('image/png'),means};
 }
 info(){
  const env=carEnvironment(),source=env&&env===this.probeTarget?.texture?'probe':env&&env===this.bakeTarget?.texture?'bake':env===this.sky.carEnvironment?'sky':env?'outro':'nenhum';
  return {level:this.key,source:this.level.source,envSource:source,owner:carFinishInfo().owner,size:this.level.source==='probe'?this.level.probe:this.level.source==='bake'?this.level.bake:256,faces:this.level.faces??0,far:this.level.far??null,capped:this.probePmrem?this.probePmrem.capped===true:null,...this.stats};
 }
 // interlagos.carPaintInfo: the finish in force, the paint of the player's car and of a rival in
 // the race (not the 99 Stevan races), and the distant model's.
 paintInfo({player=null,rivals=[],far=null}={}){
  const rival=rivals.find(r=>r.visible&&r.userData.entry?.number!=='99')??rivals[0];
  return {...carFinishInfo(),reflections:this.info(),player:paintOf(player),rival:paintOf(rival?.userData.detail??rival),rivalNumber:rival?.userData.entry?.number??null,
   far:far?{clearcoat:far.clearcoat,env:!!far.envMap&&far.envMap===carEnvironment()}:null};
 }
 dispose(){this.dropProbe();this.dropBake();}
}
