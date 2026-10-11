// The cars' finish (teste/car-finish.js) and the Gráficos tab's "Reflexos dos carros" (REFLECTION_LEVELS)
// without the browser: materials told apart by their names in the GLBs, a finish per level that never
// gets plainer going up, the coat's floor without multisampling, the shader patches still finding their
// place in three.js's chunks, and every clone (a team's paint, the Fusca's, a number) finished again.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {GRAPHICS_LEVELS,GRAPHICS_OPTIONS,GRAPHICS_PRESETS,REFLECTION_LEVELS} from '../teste/graphics-settings.js';
import {finishClass,FINISH_PROFILES,COAT_FLOOR,coatRoughnessFor,finishMaterial,finishMesh,setCarFinish,setCarSamples,setCarEnvironment,carFinishInfo,paintOf} from '../teste/car-finish.js';
import {teamPaint} from '../teste/immersive-visuals.js';
import {WORLD_ENV} from '../teste/sky.js';

// Material names as the GLBs carry them (car-finish.js tells the classes apart by name).
const glbMaterials=file=>{const b=fs.readFileSync(new URL(`../teste/assets/${file}`,import.meta.url)),length=b.readUInt32LE(12);return JSON.parse(b.subarray(20,20+length).toString()).materials.map(m=>m.name);};
const opala=glbMaterials('opala99_assinaturas_omp.glb'),seiva=glbMaterials('opala99_seiva_danilo.glb'),fusca=glbMaterials('fusca_v2.glb');
const expected={
 paint:['Pintura_preta','Faixa_amarela','Branco','Pintura_fusca','Paralama_fusca','Fusca_painel'],
 chrome:['Aros_polidos','Aluminio_rodas','Espelho','Refletor_farol','Cromo','Farol_Disco'],
 glass:['Policarbonato_fume','Lente_farol','Seta_ambar','Vidro_fusca','Vidro_farol'],
 tyre:['Pneu_slick_borracha','Pneu'],
 decal:['Adesivo_motorista_99','Decal_capo','Decal_RTJ','Logo_frontal','Stickers_vigia_motorista','Pilotos_99_parabrisa']
};
const all=new Set([...opala,...seiva,...fusca]);
for(const [kind,names] of Object.entries(expected))for(const name of names){
 assert.ok(all.has(name),`${name} is still a material of the car models`);
 assert.equal(finishClass(name),kind,`${name} is ${kind}`);
}
for(const name of ['Pintura_preta','Faixa_amarela','Policarbonato_fume','Aros_polidos','Pneu_slick_borracha'])assert.ok(seiva.includes(name),`the Seiva livery has ${name} too`);
// What is not body paint keeps the world's look: the shell's inside, the cage, the Fusca's cabin.
for(const name of ['Pintura_preta_interna','Gaiola_preta','Chapa_fechamento_V04','Pintura_interna_fusca','Metal_escuro','Espelho_fusca'])assert.equal(finishClass(name),'trim',`${name} is trim`);
// Made in code: the distant rivals' model, their numbers, car 70's door ads.
assert.equal(finishClass('Rival_distante'),'paint');assert.equal(finishClass('Numero_colado'),'decal');assert.equal(finishClass('OldStock_portas'),'decal');

// Every Gráficos choice has a finish, lightest first; the presets read the four levels in order.
const order=GRAPHICS_OPTIONS.reflections.choices.map(([v])=>v);
assert.deepEqual(order,['ceu','pista','dinamico','dinamico_hd']);
assert.deepEqual(GRAPHICS_LEVELS.map(l=>GRAPHICS_PRESETS[l].reflections),order,'Baixo sky, Médio the grid, Alto the probe, Ultra the HD probe');
const profiles=order.map(k=>FINISH_PROFILES[REFLECTION_LEVELS[k].finish]);
assert.ok(profiles.every(Boolean),'each reflection level names a finish profile');
assert.deepEqual(order.map(k=>REFLECTION_LEVELS[k].source),['sky','bake','probe','probe']);
for(const k of order){const l=REFLECTION_LEVELS[k];
 if(l.source==='bake')assert.ok(l.bake===256,'the grid bake is the sky map\'s size: no other programs on phones');
 if(l.source==='probe'){assert.ok(Number.isInteger(Math.log2(l.probe))&&l.probe<=256,'probe size');assert.ok(l.faces>=1&&l.faces<=6&&l.far>=150);}
}
assert.ok(REFLECTION_LEVELS.dinamico_hd.probe>=REFLECTION_LEVELS.dinamico.probe&&REFLECTION_LEVELS.dinamico_hd.faces>=REFLECTION_LEVELS.dinamico.faces);
// Never plainer going up: as much coat and reflection or more, as smooth a coat and chrome or smoother.
for(let i=1;i<profiles.length;i++){const a=profiles[i-1],b=profiles[i];
 for(const key of ['coat','coatEnv','env','glass','coatF0','flake'])assert.ok(b[key]>=a[key],`${order[i]} ${key} >= ${order[i-1]}`);
 for(const key of ['coatRoughness','chrome'])assert.ok(b[key]<=a[key],`${order[i]} ${key} <= ${order[i-1]}`);
}
for(const p of profiles){assert.ok(p.coat>=.95,'a full clear coat on every level');assert.ok(p.coatF0>=.04&&p.coatF0<=.08,'a clear coat, not chrome');assert.ok(p.coatEnv>=1&&p.coatEnv<=1.6);}
assert.equal(FINISH_PROFILES.ultra.flake>0,true,'Ultra has the metallic flake');assert.equal(FINISH_PROFILES.alto.flake,0);
// Without multisampling (Médio: antialias 0) the coat keeps a floor against sparkle on thin edges.
assert.equal(GRAPHICS_PRESETS.medio.antialias,0);
for(const p of profiles){assert.ok(coatRoughnessFor(p,0)>=COAT_FLOOR[0]);assert.ok(coatRoughnessFor(p,4)>=.0525,'three.js never goes below .0525');assert.ok(coatRoughnessFor(p,0)>=coatRoughnessFor(p,2)&&coatRoughnessFor(p,2)>=coatRoughnessFor(p,4));}
assert.ok(COAT_FLOOR[0]>=.08,'no multisampling: a coat floor a phone does not sparkle on');

// The finish on materials: names and colours stay (verificar_carros.py reads Pintura_preta's hex).
const physical=(name,extra={})=>new THREE.MeshPhysicalMaterial({name,clearcoat:.25,roughness:.3,metalness:.1,...extra});
const env256={image:{height:256*4}},env128={image:{height:128*4}};
setCarFinish('alto',{samples:4});setCarEnvironment(env256,'teste');
const black=finishMaterial(physical('Pintura_preta',{color:0x020203}));const blackHex=black.color.getHex();
assert.equal(black.name,'Pintura_preta');assert.equal(black.userData.carFinish,'paint');
assert.equal(black.clearcoat,FINISH_PROFILES.alto.coat);assert.equal(black.clearcoatRoughness,coatRoughnessFor(FINISH_PROFILES.alto,4));assert.equal(black.envMap,env256,'an explicit map, or three.js ignores envMapIntensity');
assert.equal(black.envMapIntensity,FINISH_PROFILES.alto.env);assert.equal(typeof black.onBeforeCompile,'function');assert.equal(black.customProgramCacheKey(),'car-paint');
// The patch finds its places in this three.js: the coat's F0 and its reflection, the flake, the glass.
const compile=m=>{const shader={uniforms:{},defines:m.defines,vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};m.onBeforeCompile(shader);return shader;};
let shader=compile(black);
assert.ok(shader.fragmentShader.includes('material.clearcoatF0 = vec3( carCoatF0 );')&&shader.fragmentShader.includes('clearcoatRadiance*=carCoatEnv*(1.0+carCoatLift'),'coat patched');
assert.ok(!shader.fragmentShader.includes('#include <lights_physical_fragment>'),'the chunk is replaced');
assert.ok(shader.uniforms.carCoatF0&&shader.uniforms.carCoatEnv&&shader.uniforms.carCoatLift,'coat uniforms');
const chrome=finishMaterial(new THREE.MeshStandardMaterial({name:'Aros_polidos',metalness:.9,roughness:.14,color:new THREE.Color(.65,.68,.72)}));
assert.equal(chrome.metalness,1);assert.ok(chrome.roughness<=.08);assert.ok(chrome.color.g>.75,'brighter polished metal');
const glass=finishMaterial(physical('Policarbonato_fume',{transparent:true,opacity:.19}));shader=compile(glass);
assert.ok(shader.fragmentShader.includes('carGlass')&&shader.fragmentShader.indexOf('carAlpha')<shader.fragmentShader.indexOf('#include <opaque_fragment>'),'glass alpha before the opaque fragment');
assert.equal(glass.opacity,.19,'the tint as main.js sets it');assert.equal(glass.customProgramCacheKey(),'car-glass');
const tyre=finishMaterial(new THREE.MeshStandardMaterial({name:'Pneu_slick_borracha',roughness:.78}));assert.ok(tyre.envMapIntensity<FINISH_PROFILES.alto.env);
// The trim (black plastic, the cage, the cabin) carries the cars' map, so three.js ignores the scene's strength: it
// keeps the world's own (sky.js), as the drivers and crew beside it do.
const trim=finishMaterial(new THREE.MeshStandardMaterial({name:'Gaiola_preta',roughness:.6}));assert.equal(trim.envMapIntensity,WORLD_ENV,'trim at the world\'s environment strength');
// The 99's white comes as a plain standard material: it becomes physical to carry the coat, same name and colour.
const white=new THREE.MeshStandardMaterial({name:'Branco',color:new THREE.Color(.83,.86,.89)}),whiteMesh=finishMesh(new THREE.Mesh(new THREE.BoxGeometry(),white));
assert.ok(whiteMesh.material.isMeshPhysicalMaterial&&whiteMesh.material.name==='Branco'&&whiteMesh.material.color.equals(white.color)&&whiteMesh.material.clearcoat===1);
assert.deepEqual(whiteMesh.material.defines,{STANDARD:'',PHYSICAL:''},'a physical material\'s programs, not a standard one\'s');

// A clone loses the patch (three.js copies userData, not onBeforeCompile): finishMaterial puts it back.
const lost=black.clone();assert.notEqual(lost.onBeforeCompile,black.onBeforeCompile,'three.js still drops the patch on clone');assert.equal(lost.userData.carFinish,'paint');
finishMaterial(lost);assert.equal(lost.onBeforeCompile,black.onBeforeCompile);assert.equal(lost.envMap,env256);
// A team's paint (rivals, the player's car in another team's colours): the clone is finished, its colour the team's.
const cache=new Map(),red=teamPaint(cache,{color:0xd8261f,stripe:0xffffff})(black);
assert.notEqual(red,black);assert.equal(red.color.getHex(),0xd8261f);assert.equal(red.onBeforeCompile,black.onBeforeCompile);assert.equal(red.clearcoat,1);assert.equal(red.envMap,env256);
// #19's gold (race-roster.js finish) stays over the coat, whatever level comes next.
const gold=teamPaint(new Map(),{color:0xc9a227,stripe:0x111111,finish:{metalness:.55,roughness:.3}})(black);
assert.equal(gold.metalness,.55);assert.equal(gold.roughness,.3);assert.equal(gold.clearcoat,1);
setCarFinish('medio',{samples:0});assert.equal(gold.roughness,.3);assert.equal(gold.metalness,.55);assert.equal(gold.clearcoatRoughness,coatRoughnessFor(FINISH_PROFILES.medio,0));
assert.equal(red.roughness,FINISH_PROFILES.medio.roughness);
// The flake is a define (other programs): only switching it reports new programs; the others are uniforms.
assert.equal(setCarFinish('alto',{samples:4}),false,'Médio to Alto: uniforms only');
assert.equal(setCarFinish('ultra',{samples:4}),true,'the flake comes: new programs');
assert.ok(black.defines.CAR_FLAKE!==undefined&&red.defines.CAR_FLAKE!==undefined&&gold.defines.CAR_FLAKE!==undefined,'every paint, clones too');
assert.equal(chrome.defines?.CAR_FLAKE,undefined,'no flake on chrome');assert.equal(black.customProgramCacheKey(),'car-paint-flake');
shader=compile(black);assert.ok(shader.fragmentShader.includes('carFlakeOn')&&shader.vertexShader.includes('vCarFlake=position;'),'flake patched in the car\'s own frame');
assert.ok(!shader.fragmentShader.includes('#include <lights_physical_pars_fragment>'),'the sun glint goes into the direct light');
assert.equal(setCarFinish('alto',{samples:4}),true,'the flake goes: new programs');assert.equal(black.defines.CAR_FLAKE,undefined);
// The drawn multisampling only moves the coat's floor.
setCarSamples(0);assert.equal(black.clearcoatRoughness,COAT_FLOOR[0]);assert.equal(black.roughness,FINISH_PROFILES.alto.roughness);setCarSamples(4);
// Every finished material wears the cars' map; another map size means other programs.
assert.equal(setCarEnvironment(env256,'teste'),false);assert.equal(setCarEnvironment(env128,'corrida'),true);
for(const m of [black,red,gold,chrome,glass,tyre,lost])assert.equal(m.envMap,env128);
assert.equal(setCarEnvironment({image:{height:128*4}},'estudio'),false,'same size: the same programs');
const info=carFinishInfo();assert.equal(info.profile,'alto');assert.equal(info.owner,'estudio');assert.ok(info.materials.paint>=4&&info.materials.chrome>=1&&info.materials.glass>=1);
// A disposed material leaves the list (a rival let go is not kept).
const before=carFinishInfo().materials.paint;red.dispose();assert.equal(carFinishInfo().materials.paint,before-1);
// What interlagos.carPaintInfo reports for a car.
const car=new THREE.Group();car.add(new THREE.Mesh(new THREE.BoxGeometry(),gold));const p=paintOf(car);
assert.equal(p.name,'Pintura_preta');assert.equal(p.color,0xc9a227);assert.equal(p.patched,true);assert.equal(black.color.getHex(),blackHex,'the paint colour is never touched');

// Wiring: each clone path finishes again, and every new module is published.
const source=file=>fs.readFileSync(new URL(`../teste/${file}`,import.meta.url),'utf8');
assert.match(source('fusca.js'),/finishMaterial\(c,\{rosterFinish:entry\.finish\}\)/,'the Fusca\'s team clones');
assert.match(source('fusca.js'),/finishCar\(scene\)/,'the Fusca template');
assert.match(source('immersive-visuals.js'),/finishMaterial\(new THREE\.MeshPhysicalMaterial\(\{name:'Numero_colado'/,'the numbers under the coat');
assert.match(source('immersive-visuals.js'),/finishMaterial\(new THREE\.MeshPhysicalMaterial\(\{name:'Rival_distante'/,'the distant model keeps the highlight');
assert.match(source('main.js'),/finishMesh\(o\)/,'the loaded Opala');
const published=fs.readFileSync(new URL('./publicacao.py',import.meta.url),'utf8');
for(const file of ['car-finish.js','car-reflections.js'])assert.ok(published.includes(`'${file}'`),`${file} is published`);
// The captures' prefilter stops at the cars' light: a sun glint on the Minhocão's window glass past half float turned
// every car white for a probe cycle. Fails if three.js's private copy material changes shape.
{
 const {cappedPmrem}=await import('../teste/car-reflections.js'),{CAR_LIGHT_MAX}=await import('../teste/car-finish.js');
 const pmrem=cappedPmrem({compile(){}}),shader=pmrem._cubemapMaterial?.fragmentShader??'';
 assert.equal(pmrem.capped,true,'the prefilter copy is capped');assert.ok(shader.includes(`min(textureCube`)&&shader.includes(`vec4(${CAR_LIGHT_MAX.toFixed(1)})`),'capped at CAR_LIGHT_MAX');
 assert.equal((source('car-reflections.js').match(/new THREE\.PMREMGenerator/g)??[]).length,1,'the probe and the bake use cappedPmrem');
}

// The rivals' liveries (car-livery.js): every car of the field has sponsors on the shared canvas, sponsors and slots
// that exist, car 70's doors left to the Old Stock ads; the stripes cut before the sponsors that lie over them.
{
 const L=await import('../teste/car-livery.js'),{RIVAL_ROSTER}=await import('../teste/race-roster.js'),{clipBelow,rivalDirt}=await import('../teste/immersive-visuals.js');
 const C=await import('../teste/car-finish.js');
 for(const e of RIVAL_ROSTER){
  const parts=L.liveryParts(e.number);assert.ok(parts.length>=4,`#${e.number} carries sponsors`);
  for(const [slot,sponsor] of parts){assert.ok(L.LIVERY_SLOTS[slot],`#${e.number}: slot ${slot}`);assert.ok(sponsor===null||L.SPONSORS[sponsor],`#${e.number}: sponsor ${sponsor}`);}
  const look=L.liveryLook(e.number);if(look.rim)assert.ok(L.RIM_STYLES[look.rim],`#${e.number}: rim ${look.rim}`);if(look.tone)assert.ok(look.tone[1]>.25&&look.tone[1]<.5,`#${e.number}: tone below the stripe`);
  const [amount]=rivalDirt(e.number);assert.ok(amount>0&&amount<=.62,`#${e.number}: light grime (${amount})`);
 }
 assert.ok(!L.liveryParts('70').some(([slot])=>slot.startsWith('porta')),"car 70's doors keep the Old Stock ads");
 assert.equal(new Set(RIVAL_ROSTER.map(e=>L.LIVERY_PLANS[e.number].main)).size,RIVAL_ROSTER.length,'each car its own main sponsor');
 assert.ok(RIVAL_ROSTER.filter(e=>L.liveryLook(e.number).rim).length>=5&&RIVAL_ROSTER.filter(e=>L.liveryLook(e.number).tone).length>=4,'rims and two-tones vary the field');
 const plane=()=>new THREE.PlaneGeometry(1,1,1,1),shapes=Object.fromEntries(Object.keys(L.LIVERY_SLOTS).map(k=>[k,plane()]));
 // The roof's shape of car 00: the number, then the bonnet's stripes (its stripe colour), then the sponsors over them.
 const roof=L.liveryPlates({number:'00',stripe:0x1f4fb5},[plane(),plane(),plane(),plane()],shapes).plates[2],colors=roof.attributes.color.array,blue=new THREE.Color(0x1f4fb5),tinted=[];
 for(let i=0;i<colors.length/3;i++)if(Math.abs(colors[i*3]-blue.r)<1e-4&&Math.abs(colors[i*3+2]-blue.b)<1e-4)tinted.push(i);
 assert.deepEqual([tinted.length,tinted[0],tinted.at(-1)],[4,4,7],'the stripes right after the number, under the sponsors');
 const apart=L.liveryPlates({number:'73',stripe:0xe4e4d5},[plane(),plane(),plane(),plane()],shapes,{apart:true});
 assert.deepEqual(apart.extra.map(x=>x.hinge).sort(),['driverDoor','hood','passengerDoor'],"the player's car: what rides a hinge, one shape per hinge");
 assert.equal(L.liveryPlates({number:'1234'},[plane()],shapes),null,'a number not on the canvas');
 // Grime and two-tone start off (a Vector4's w is 1 by default: it once drew a black band 1 m up on every car).
 const m=new THREE.MeshPhysicalMaterial();assert.equal(C.carDirt(m),0);assert.equal(C.carTone(m),0);
 C.setCarTone(m,0x112233,.4);assert.equal(C.carTone(m),.4);C.setCarTone(m,null);assert.equal(C.carTone(m),0);
 const fresh=finishMaterial(physical('Pintura_preta',{color:0x020203})),patched=compile(fresh);
 assert.deepEqual([patched.uniforms.carTone.value.toArray(),patched.uniforms.carDirt.value.toArray()],[[0,0,0,0],[0,0,0,0]],'a car without grime or two-tone draws neither');
 assert.ok(patched.fragmentShader.includes('carTone.w>0.0')&&patched.fragmentShader.includes('carDirt.x>0.0'),'both patched in');
 // The distant model's lower band: the profile cut at the tone's height.
 assert.deepEqual(clipBelow([[0,0],[2,0],[2,1],[0,1]],.4),[[0,0],[2,0],[2,.4],[0,.4]]);
 // A rival's rims: one material per style for the field, painted ones under the coat, gold a metal.
 const rim=finishMaterial(new THREE.MeshStandardMaterial({name:'Aluminio_rodas',metalness:1,roughness:.08}));
 const painted=L.rimMaterial('branca',rim),golden=L.rimMaterial('ouro',rim);
 assert.ok(painted===L.rimMaterial('branca',rim)&&painted.isMeshPhysicalMaterial&&painted.userData.carFinish==='paint'&&painted.clearcoat===1&&painted.metalness===0,'white rims: painted, coated, shared');
 assert.ok(golden.userData.carFinish==='chrome'&&golden.metalness===1&&golden.color.r>golden.color.b*2,'gold rims: a metal');
 assert.equal(L.rimMaterial('nenhuma',rim),rim,'no style: the polished rim');
 // The sun's glint never overflows half float (the probe's cube): paint, glass and chrome stop at CAR_LIGHT_MAX.
 assert.ok(C.CAR_LIGHT_MAX<65504/8,'well under half float');
 for(const mat of [fresh,finishMaterial(physical('Policarbonato_fume',{transparent:true,opacity:.19})),rim]){
  const out=compile(mat).fragmentShader;assert.ok(out.indexOf('min(outgoingLight')>0&&out.indexOf('min(outgoingLight')<out.indexOf('#include <opaque_fragment>'),`${mat.name}: light clamped before the output`);
 }
 assert.equal(rim.customProgramCacheKey(),'car-chrome');
 // The field's decal and rims outlive a circuit: clearCircuit disposes them with the old field, and the next hand-out
 // puts them back on the finish (they once kept the old circuit's map and level until a reload).
 const decal=L.liveryMaterial(),probe={image:{height:256}},later={image:{height:256}};decal.dispose();painted.dispose();
 setCarEnvironment(probe,'teste');setCarFinish('medio',{samples:0});
 assert.ok(L.liveryMaterial()===decal&&decal.envMap===probe&&decal.clearcoatRoughness===coatRoughnessFor(FINISH_PROFILES.medio,0),'the decal back on the finish');
 assert.ok(L.rimMaterial('branca',rim)===painted&&painted.envMap===probe,'the painted rims back on the finish');
 setCarEnvironment(later,'teste');assert.ok(decal.envMap===later&&painted.envMap===later,'and they follow the next map');setCarFinish('alto',{samples:4});
 // The flat-sided distant model: a satin coat (a mirror one flashed whole flanks white), the same through the levels.
 const far=finishMaterial(physical('Rival_distante',{vertexColors:true}));
 for(const [level,samples] of [['baixo',0],['medio',0],['alto',4],['ultra',4]]){setCarFinish(level,{samples});assert.ok(far.clearcoat===1&&far.clearcoatRoughness>=.24&&fresh.clearcoatRoughness<.1,`${level}: far coat satin, the near one gloss`);}
 setCarSamples(0);assert.ok(far.clearcoatRoughness>=.24);setCarSamples(4);setCarFinish('alto',{samples:4});
}
console.log("Paint passed: materials by name in the three GLBs, finish per level never plainer going up, coat floor without MSAA, patches in place, clones finished again, maps on every car material, the rivals' liveries, grime, two-tones and rims.");
