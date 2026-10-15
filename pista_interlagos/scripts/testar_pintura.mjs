// The cars' finish (teste/car-finish.js) and the Gráficos tab's "Reflexos dos carros" (REFLECTION_LEVELS)
// without the browser: materials told apart by their names in the GLBs, a finish per level that never
// gets plainer going up, the coat's floor without multisampling, the shader patches still finding their
// place in three.js's chunks, and every clone (a team's paint, the Fusca's, a number) finished again.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {GRAPHICS_LEVELS,GRAPHICS_OPTIONS,GRAPHICS_PRESETS,REFLECTION_LEVELS} from '../teste/graphics-settings.js';
import {finishClass,FINISH_PROFILES,COAT_FLOOR,coatRoughnessFor,finishMaterial,finishMesh,setCarFinish,setCarSamples,setCarEnvironment,carFinishInfo,paintOf,coatGain,COAT_IBL_LINE,LENS_COAT,LENS_RED,GLASS_LOOK,setCarProbe} from '../teste/car-finish.js';
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
 if(l.source==='probe'){assert.ok(Number.isInteger(Math.log2(l.probe))&&l.probe>=256&&l.probe<=512,'probe size: 128 px mirrored the stands as blobs');assert.ok(l.faces>=1&&l.faces<=6&&l.far>=150);}
}
assert.ok(REFLECTION_LEVELS.dinamico_hd.probe>=REFLECTION_LEVELS.dinamico.probe&&REFLECTION_LEVELS.dinamico_hd.faces>=REFLECTION_LEVELS.dinamico.faces);
// Never plainer going up: as much coat and reflection or more, as smooth a coat and chrome or smoother. The coat's
// own reflectance and gain only among the captured maps (the grid's picture, the probes): Baixo's sky map has no
// surroundings of its own and keeps a little gain to show its painted horizon band.
for(let i=1;i<profiles.length;i++){const a=profiles[i-1],b=profiles[i];
 for(const key of ['coat','env','glass','flake'])assert.ok(b[key]>=a[key],`${order[i]} ${key} >= ${order[i-1]}`);
 if(i>1)for(const key of ['coatEnv','coatF0'])assert.ok(b[key]>=a[key],`${order[i]} ${key} >= ${order[i-1]}`);
 for(const key of ['coatRoughness','chrome','coatIBL'])assert.ok(b[key]<=a[key],`${order[i]} ${key} <= ${order[i-1]}`);
}
for(const p of profiles){assert.ok(p.coat>=.95,'a full clear coat on every level');assert.ok(p.coatF0>=.04&&p.coatF0<=.07,'a clear coat, not chrome');assert.ok(p.coatEnv>=1&&p.coatEnv<=1.3);assert.ok(p.coatIBL>=.02&&p.coatIBL<=p.coatRoughness+.01,'the coat mirrors its map at least as sharp as its glint');}
// Gloss black, not gunmetal (round 2: lift .9, gain 1.5-1.6 and a 7% coat turned the black 99's tail into a featureless
// L 36-55 primer grey): a black panel mirrors its surroundings as a lacquer does, about 4 to 6% head-on, the dark
// road and stands no more lifted than the bright sky (so the horizon line keeps its contrast). Baixo (sky map, no
// film toe) a little more.
for(const [k,p] of order.map((k,i)=>[k,profiles[i]])){
 const dark=p.coatF0*coatGain(p,.05),sky=p.coatF0*coatGain(p,1),limit=k==='ceu'?.085:.065;
 assert.ok(dark>=.04&&dark<=limit,`${k}: a black panel mirrors ${(dark*100).toFixed(1)}% of the road and shade (lacquer, not primer)`);
 assert.ok(dark/sky<=1.15,`${k}: the dark half of the reflection lifted only ${((dark/sky-1)*100).toFixed(0)}% over the sky's`);
}
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
// The coat mirrors its map at its own sharpness (the probe's full picture), not at its glint's floor: the line it
// swaps is still three.js's.
assert.ok(THREE.ShaderChunk.lights_fragment_maps.includes(COAT_IBL_LINE),'three.js still looks the coat up in this line');
assert.ok(!shader.fragmentShader.includes(COAT_IBL_LINE)&&shader.fragmentShader.includes('carCoatIBL + geometryRoughness'),'the coat\'s look-up at its own roughness');
assert.equal(shader.uniforms.carCoatIBL.value,FINISH_PROFILES.alto.coatIBL);
// A dipping reflection meets the road from the car's own surface, looked up from the probe's centre (the tail's mirror
// of the road behind it was the car's own shadow under its middle); only the race's probe has a centre.
assert.ok(shader.fragmentShader.includes('carCoatRadiance( geometryViewDir')&&shader.fragmentShader.indexOf('vec3 carCoatRadiance(')>shader.fragmentShader.indexOf('#include <envmap_physical_pars_fragment>'),'the coat\'s look-up corrected for the probe\'s centre');
assert.ok(shader.vertexShader.includes('vCarWorld=(modelMatrix*vec4(transformed,1.0)).xyz;'));
setCarProbe({x:1,y:2,z:3},1);assert.equal(shader.uniforms.carProbe.value.w,1);setCarEnvironment({image:{height:7}},'estudio');assert.ok(shader.uniforms.carProbe.value.w<-1e4,'the studio\'s map: no probe centre');setCarEnvironment(env256,'teste');
// The probe's centre is the player's car's: a rival a few metres off (on other ground) keeps the plain look-up.
assert.ok(shader.fragmentShader.includes('r=normalize(mix(hit,r,smoothstep(3.0,6.0,length(vCarWorld.xz-carProbe.xz))));'),'the correction fades 3-6 m off the probe');
// On the sky's own map (night, the story's paddock, before the grid's picture) every level's coat is Baixo's (the coat
// tuned for a captured circuit left the black 99 dull there); on a captured map, the level's own. Values only.
{
 setCarFinish('medio');setCarEnvironment(env256,'corrida',true);const u=shader.uniforms,b=FINISH_PROFILES.baixo,m=FINISH_PROFILES.medio;
 assert.ok(u.carCoatF0.value===b.coatF0&&u.carCoatEnv.value===b.coatEnv&&u.carCoatLift.value===b.lift&&carFinishInfo().skyMap,'sky map: Baixo\'s coat');
 assert.equal(u.carCoatIBL.value,m.coatIBL,'the coat\'s sharpness stays the level\'s');
 setCarEnvironment(env256,'corrida',false);assert.ok(u.carCoatF0.value===m.coatF0&&u.carCoatEnv.value===m.coatEnv&&u.carCoatLift.value===m.lift,'a captured map: the level\'s coat');
 setCarEnvironment(env256,'corrida',true);setCarFinish('alto');assert.equal(u.carCoatEnv.value,b.coatEnv,'a level switch on the sky map keeps it');
 setCarEnvironment(env256,'teste');assert.equal(u.carCoatEnv.value,FINISH_PROFILES.alto.coatEnv);
}
// The tail lamps' lens: its own clear coat (no gain, no lift: the paint's washed it amber in the sun), a deep red
// reflector a fifth metal; the ring normals and the faint glow stay.
const lens=finishMaterial(physical('Lanterna_vermelha',{color:0xff0000,emissive:0x000000})),lensShader=compile(lens);
assert.equal(lens.userData.carFinish,'lens');assert.ok(lens.metalness<=.25&&lens.color.r<=.32&&lens.color.g<.01,'deep red, a little metal');assert.deepEqual(lens.color.toArray().map(v=>+v.toFixed(3)),LENS_RED.map(v=>+v.toFixed(3)));
assert.ok(lens.normalMap&&lens.emissive.r>0,'rings and glow kept');
assert.ok(lensShader.uniforms.carCoatEnv!==shader.uniforms.carCoatEnv&&lensShader.uniforms.carCoatEnv.value===LENS_COAT.coatEnv&&lensShader.uniforms.carCoatLift.value===0,'the lens\'s own coat');
// The windows from outside: a dark mirror (darker tint, a reflectance floor), the sun's glint a small point.
assert.ok(GLASS_LOOK.f0>=.08&&GLASS_LOOK.f0<=.1&&Math.abs(((GLASS_LOOK.ior-1)/(GLASS_LOOK.ior+1))**2-GLASS_LOOK.f0)<.005,'glass reflectance floor and its ior');
assert.ok(GLASS_LOOK.sun>=8&&GLASS_LOOK.sun<=16&&GLASS_LOOK.tint>.19&&GLASS_LOOK.tint<.6,'glint and tint');
const chrome=finishMaterial(new THREE.MeshStandardMaterial({name:'Aros_polidos',metalness:.9,roughness:.14,color:new THREE.Color(.65,.68,.72)}));
assert.equal(chrome.metalness,1);assert.ok(chrome.roughness<=.08);assert.ok(chrome.color.g>.75,'brighter polished metal');
const glass=finishMaterial(physical('Policarbonato_fume',{transparent:true,opacity:.19}));shader=compile(glass);
assert.ok(shader.fragmentShader.includes('carGlass')&&shader.fragmentShader.indexOf('carAlpha')<shader.fragmentShader.indexOf('#include <opaque_fragment>'),'glass alpha before the opaque fragment');
assert.equal(glass.opacity,.19,'the tint as main.js sets it');assert.equal(glass.customProgramCacheKey(),'car-glass');
assert.ok(shader.uniforms.carGlassTint.value===GLASS_LOOK.tint&&shader.fragmentShader.includes(`vec3(${GLASS_LOOK.sun.toFixed(1)})`)&&glass.ior===GLASS_LOOK.ior,'smoked from outside, the glint capped');
assert.ok(shader.fragmentShader.includes('mix(diffuseColor.a,max(diffuseColor.a,carGlassTint),carKeep)'),'the driver\'s own windscreen keeps its plain tint');
assert.equal(compile(finishMaterial(physical('Lente_farol',{transparent:true,opacity:.35}))).uniforms.carGlassTint.value,0,'lamp lenses keep their own tint');
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
 // The 99's side number no longer cuts across the tail's corner (a white sliver at the bumper's join from behind): its
 // cells past DECAL_TAIL fold away, the rest of the number and every other sticker stay.
 {
  const model=new THREE.Group(),grid=()=>new THREE.PlaneGeometry(.48,.4,24,4).translate(-1.9,.6,.85);
  const side=new THREE.Mesh(grid(),new THREE.MeshPhysicalMaterial({name:'Adesivo_passageiro_99'})),other=new THREE.Mesh(grid(),new THREE.MeshPhysicalMaterial({name:'Adesivo_passageiro_invent'}));
  model.add(side,other);const tris=g=>{const out=[];for(let t=0;t<g.index.count;t+=3)out.push([0,1,2].map(k=>g.index.getX(t+k)));return out;};
  const before=tris(side.geometry).filter(t=>new Set(t).size===3).length,folded=L.trimDecalTails(model),after=tris(side.geometry).filter(t=>new Set(t).size===3);
  assert.ok(folded>0&&folded<before/4&&after.length===before-folded,`the corner's cells folded (${folded} of ${before})`);
  const p=side.geometry.attributes.position;assert.ok(after.every(t=>t.reduce((x,i)=>x+p.getX(i),0)/3>=L.DECAL_TAIL.x),'what stays lies ahead of the corner');
  assert.ok(tris(other.geometry).every(t=>new Set(t).size===3),'other stickers untouched');assert.equal(L.trimDecalTails(model),0,'once per geometry');
 }
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
 // The twin stripes stay on their panel (V06: bonnet top 1.02 to 2.16 m, trunk lid -2.16 to -1.54 m): longer, they ran
 // onto the windscreen and down the nose, and car 51's down the tail into the air (2026-10-15).
 for(const [slot,[x0,x1]] of [['faixas_capo',[1.02,2.16]],['faixas_tampa',[-2.16,-1.54]]]){const S=L.LIVERY_SLOTS[slot],a=S.at[0]-S.h/2,b=S.at[0]+S.h/2;
  assert.ok(a>=x0+.015&&b<=x1-.015&&S.h>(x1-x0)*.85,`${slot} ${a.toFixed(3)}..${b.toFixed(3)} inside its panel`);}
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
