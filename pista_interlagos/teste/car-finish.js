import * as THREE from 'three';
import {WORLD_ENV} from './sky.js';
// The cars' finish (the Gráficos tab's "Reflexos dos carros", graphics-settings.js REFLECTION_LEVELS):
// a deep clear coat on the paint, glass that keeps its reflections, bright chrome, black rubber.
// Materials are told apart by name (the Opala's and the Fusca's GLB, the rivals' clones) and tagged
// in userData, which Material.clone() keeps; shader patches (coat, glass, metallic flake) are not kept
// by a clone, so every clone goes through finishMaterial again (immersive-visuals.js teamPaint,
// car-livery.js, fusca.js fuscaCar). Each material also gets the cars' environment map explicitly
// (car-reflections.js): only then does three.js honour its own envMapIntensity.

// Body paint and what is painted like it: the stripe, the 99's white, the Fusca's body, fenders and
// dash, the distant rivals' model. Pintura_preta_interna (inside the shell) is not on the list.
const PAINT=/^(Pintura_preta|Faixa_amarela|Branco|Pintura_fusca|Paralama_fusca|Fusca_painel|Rival_distante)$/;
const CHROME=/^(Aros_polidos|Aluminio_rodas|Espelho|Cromo|Refletor_farol|Farol_Disco|Aluminio_polido_tampa)$/;
// See-through glass and lenses (Blender's transmission becomes plain alpha: main.js, fusca.js).
const GLASS=/^(Policarbonato_fume|Vidro_fusca|Vidro_farol|Lente_farol|Seta_ambar)$/;
const TYRE=/^(Pneu_slick_borracha|Pneu)$/;
// The Opala's four round tail lamps: a clear lens over a red reflector (brake-lights.js lampUVs maps the rings).
const LENS=/^(Lanterna_vermelha)$/;
// The spinning wheels' blurred disc (car-wheels.js): reflects as the polished rims under it do.
const SPIN=/^Roda_borrada$/;
// The 99's sponsors and names, the rivals' numbers (numberSticker) and car 70's door ads.
const DECAL=/^(Adesivo_|Decal_|Logo_frontal|Jesus_|Pilotos_99_parabrisa|Invent_parabrisa|Stickers_vigia_|Numero_colado|OldStock_)/;
export const finishClass=name=>PAINT.test(name)?'paint':CHROME.test(name)?'chrome':GLASS.test(name)?'glass':TYRE.test(name)?'tyre':LENS.test(name)?'lens':SPIN.test(name)?'blur':DECAL.test(name)?'decal':'trim';

// One profile per REFLECTION_LEVELS finish, lightest first. coat/coatRoughness/coatF0: the clear coat
// (and how much it reflects head-on); coatEnv: the coat's reflection of the surroundings over the
// base's; lift: how much more the coat shows the dark half of its surroundings (asphalt, tree line, the
// stands' shade) than the bright. Both near none where the map is a real capture (the grid's picture, the
// probe): a gain of 1.5 with a lift of .9 and a 7% coat made every reflection two to three times a lacquer's,
// and the black 99 read gunmetal, a primer grey with no image in it (round-2 judges: its tail at L 36-55, the
// Forza GT's red tail in shade 33); a lacquer is a dark mirror whose grazing Fresnel shows the road and the
// stands. Baixo's map is the sky's with its painted horizon band (no stands, no asphalt of its own), drawn
// without the film look's toe: its coat keeps a little gain to show that band. coatIBL: the coat's
// reflection roughness (the map's sharpness) apart from the floor its sun glint keeps against sparkle
// (COAT_FLOOR); three.js's normal-derivative term still softens it where the body curves fast on screen.
// roughness/specular: the base layer under it (under a coat it reflects almost nothing of its own: at full
// specular its blurred sheen turned the black 99 grey satin and the red rivals pink, measured on the grid);
// env: environment strength on paint, glass and chrome; chrome: polished metal's roughness; glass: how much
// of the reflection the windows keep (Fresnel); flake: metallic flake in the base layer (the coat stays smooth).
export const FINISH_PROFILES=Object.freeze({
 baixo:Object.freeze({coat:1,coatRoughness:.09,coatF0:.065,coatEnv:1.25,lift:0,coatIBL:.06,roughness:.45,specular:.15,env:1.05,chrome:.16,glass:.6,decalCoat:1,tyreEnv:.6,flake:0}),
 medio:Object.freeze({coat:1,coatRoughness:.07,coatF0:.05,coatEnv:1.1,lift:.1,coatIBL:.045,roughness:.41,specular:.25,env:1.1,chrome:.11,glass:.8,decalCoat:1,tyreEnv:.55,flake:0}),
 alto:Object.freeze({coat:1,coatRoughness:.055,coatF0:.05,coatEnv:1.1,lift:.1,coatIBL:.04,roughness:.4,specular:.25,env:1.15,chrome:.06,glass:1,decalCoat:1,tyreEnv:.5,flake:0}),
 ultra:Object.freeze({coat:1,coatRoughness:.0525,coatF0:.05,coatEnv:1.15,lift:.1,coatIBL:.03,roughness:.4,specular:.25,env:1.15,chrome:.045,glass:1,decalCoat:1,tyreEnv:.5,flake:1})
});
// What the coat's reflection multiplies a surrounding of this luminance by (the shader's carCoatEnv/carCoatLift
// line): head-on reflectance = coatF0 times this.
export const coatGain=(profile,luminance)=>profile.coatEnv*(1+profile.lift/(1+2.5*luminance));
// Without multisampling (Médio, phones) a mirror-smooth coat sparkles on every thin edge: the coat
// roughness never goes below this floor for the antialiasing in force. three.js itself never goes
// below .0525 (the sharpest level of its prefiltered maps) and adds its own normal-derivative term.
export const COAT_FLOOR=Object.freeze({0:.085,2:.065,4:.0525});
export const coatRoughnessFor=(profile,samples=0)=>Math.max(profile.coatRoughness,COAT_FLOOR[samples>=4?4:samples>=2?2:0]);
// The rest of the car's materials keep the world's environment strength (sky.js WORLD_ENV), as the drivers and
// the crew round them do: with an explicit map three.js ignores the scene's own strength.
export const TRIM_ENV=WORLD_ENV;
// The V04 sheets that close the cabin and the fuel cell's housing under the trunk (main.js carStructure): matte,
// as an underbody is. At .32 roughness their underside mirrored the sunlit asphalt and read as a pale crate under
// the bumper from a low camera behind the car (the story's grid).
const MATTE=/^Chapa_fechamento_V04$/;
// The shell's inside (the wheel arches seen past the tyres, the panels' backs): a primer grey of about 2% (the GLB's
// .4% read as a void round every wheel).
const SHELL=/^Pintura_preta_interna$/,SHELL_GREY=.02;
// The distant rivals' model (immersive-visuals.js farProxy) is flat-sided: a mirror coat lit a whole flank at once
// when the sun lined up (a white flash and halo over a car 60 m away); a satin coat keeps a soft highlight there.
const FAR_COAT=.24;
const coatFor=(m,samples)=>m.name==='Rival_distante'?Math.max(FAR_COAT,coatRoughnessFor(state.profile,samples)):coatRoughnessFor(state.profile,samples);

const state={profile:FINISH_PROFILES.alto,name:'alto',samples:4,env:null,owner:null,sky:false};
// The tail lamps' reflector rings as a normal map (u across the lamp, v up; brake-lights.js lampUVs): a domed
// bulb boss in the middle, Fresnel steps round it, a plain rim. Built once, on first use (no canvas: Node tests).
export function lensRingHeight(u,v){
 const r=Math.hypot(u-.5,v-.5)*2;if(r>=1)return 0;
 if(r<.22)return .55*Math.sqrt(1-(r/.22)**2);
 const k=(r-.22)/.7*7,step=k-Math.floor(k);return r>.92?.1:.35*(1-step)*(1-r*.4);
}
let rings=null;
export function lensRings(){
 if(rings)return rings;const n=128,data=new Uint8Array(n*n*4),h=(i,j)=>lensRingHeight((i+.5)/n,(j+.5)/n),d=6;
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){const dx=(h(Math.min(n-1,i+1),j)-h(Math.max(0,i-1),j))*d,dy=(h(i,Math.min(n-1,j+1))-h(i,Math.max(0,j-1)))*d,l=Math.hypot(dx,dy,1),k=(j*n+i)*4;
  data[k]=Math.round((-dx/l*.5+.5)*255);data[k+1]=Math.round((-dy/l*.5+.5)*255);data[k+2]=Math.round((1/l*.5+.5)*255);data[k+3]=255;}
 rings=new THREE.DataTexture(data,n,n);rings.magFilter=THREE.LinearFilter;rings.minFilter=THREE.LinearMipmapLinearFilter;rings.generateMipmaps=true;rings.needsUpdate=true;return rings;
}
// Every tagged material, held weakly: a car let go is not kept alive by this list.
const registry=new Set(),refs=new WeakMap();
function register(m){if(refs.has(m))return;const ref=new WeakRef(m);refs.set(m,ref);registry.add(ref);m.addEventListener('dispose',forget);}
function forget(e){const ref=refs.get(e.target);if(ref){registry.delete(ref);refs.delete(e.target);}e.target.removeEventListener('dispose',forget);}
function* materials(){for(const ref of registry){const m=ref.deref();if(m)yield m;else registry.delete(ref);}}

// Shared by every patched program: changing them costs no compile.
const glassUniform={value:1},flakeUniform={value:0},coatUniform={value:.04},coatEnvUniform={value:1},liftUniform={value:0},coatIblUniform={value:.06};
// The tail lamps' clear lens has a coat of its own (a plain clear plastic, no gain on its reflection): sharing the
// paint's lift and gain washed the red to amber in the sun, read as turn indicators (round-2 judges: 135,64,24).
export const LENS_COAT=Object.freeze({coatF0:.045,coatEnv:1,lift:0}),LENS_RED=Object.freeze([.3,.006,.004]);
const lensUniforms={coat:{value:LENS_COAT.coatF0},env:{value:LENS_COAT.coatEnv},lift:{value:LENS_COAT.lift},ibl:coatIblUniform};
// The sun's glint on a mirror-smooth coat or chrome peaks past half float's 65504 at grazing angles (three.js's
// sharpest GGX, about 4e4, times the sun): an infinity in the reflection probe's cube (car-reflections.js, HalfFloat)
// that its prefilter spread over the whole map, every car drawn black in a white halo for a cycle. A glint is
// white long before this, and the sun's own disc is about 22: past 64 a glint only fed the bloom a halo wider than
// the car, so the cars' light stops here.
export const CAR_LIGHT_MAX=64;
const CLAMP_GLSL=`outgoingLight=min(outgoingLight,vec3(${CAR_LIGHT_MAX.toFixed(1)}));`;
function chromePatch(shader){shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',CLAMP_GLSL+'\n#include <opaque_fragment>');}
// Glass: non-premultiplied alpha scaled its reflection down to the tint's opacity (the Opala's windows
// are 19% opaque). Here what the glass reflects is added whole and hides what lies behind it as Fresnel
// says: a dark mirror head-on, a bright one at grazing angles (a rear window seen from the chase camera). Within a
// couple of metres of the eye (the driver's own windscreen) it stays the plain tint, as clear as before.
// GLASS_LOOK: seen from outside the smoked polycarbonate is darker (tint: its opacity there, the Opala's windows
// only) and reflects at least f0 head-on (ior: three.js's own specular at that reflectance), so a window reads as a
// dark mirror with the cage faintly behind (round 2: the rear glass at L 54 in a chase 3/4, the Forza's 116, the
// cage seen as if no glass were there); sun: the most the sun's glint adds (a small hard point the bloom turns
// into a star; at the paint's 64 it bloomed a soft 90 px lamp inside the cabin).
export const GLASS_LOOK=Object.freeze({tint:.4,f0:.09,ior:1.86,sun:10});
const glassTints=/^Policarbonato_fume$/;
function glassPatch(shader){
 shader.uniforms.carGlass=glassUniform;shader.uniforms.carGlassTint={value:glassTints.test(this.name)?GLASS_LOOK.tint:0};
 shader.fragmentShader='uniform float carGlass,carGlassTint;\n'+shader.fragmentShader.replace('#include <opaque_fragment>',`{
 float carKeep=smoothstep(1.4,2.8,length(vViewPosition))*carGlass,carFr=pow(1.0-saturate(dot(geometryNormal,geometryViewDir)),5.0);
 float carTint=mix(diffuseColor.a,max(diffuseColor.a,carGlassTint),carKeep);
 float carAlpha=carTint+(1.0-carTint)*min(1.0,(${GLASS_LOOK.f0.toFixed(3)}+${(1-GLASS_LOOK.f0).toFixed(3)}*carFr)*carKeep);
 vec3 carSpec=min(outgoingLight-totalDiffuse,vec3(${GLASS_LOOK.sun.toFixed(1)}));
 outgoingLight=(totalDiffuse*carTint+carSpec*mix(diffuseColor.a,1.0,carKeep))/max(carAlpha,1e-3);diffuseColor.a=carAlpha;}
 ${CLAMP_GLSL}
 #include <opaque_fragment>`);
}
// Paint (and the stickers under the same coat; the tail lamps' lens with its own LENS_COAT): the coat's
// head-on reflectance (carCoatF0) and its gain and lift (carCoatEnv, carCoatLift) per profile.
// Metallic flake (Ultra, CAR_FLAKE): a sparse few cells of the car's own frame (so the flakes ride with
// it) hold a tilted mirror flake that glints in the sun only when it lines up, each at its own angle,
// and only round the sun's own highlight on the body (glints all over read as dust); the base and the
// coat keep their true normals (a noise on the whole base read as sandpaper). Cells grow with
// distance to stay about a pixel wide and fade out before they would crawl.
// Road grime (a rival's, setCarDirt): in the car's own frame (a rival's merged body, the player's model), low on the
// sills and bumpers, fanned behind the wheels and up the tail, broken by noise; it dulls the coat it sits on. One
// uniform per material, nothing drawn while its amount is 0 (the player's car, the stickers, the lamps).
// A two-tone (setCarTone): a second colour below a line round the body (a rival's livery, car-livery.js), its edge a
// pixel wide. up: the car's height in the mesh's own frame ([x, y, z] dotted with the position, plus w): a rival's body
// is merged in the car's frame, the player's car keeps the GLB's nodes (a door on its hinge, a rotated part).
const dirtUniforms=new WeakMap(),toneUniforms=new WeakMap(),toneUps=new WeakMap();
// All four zero (a Vector4's w starts at 1: a tone line 1 m up on every car).
const uniformOf=(map,m)=>{if(!m)return {value:new THREE.Vector4(0,0,0,0)};if(!map.has(m))map.set(m,{value:new THREE.Vector4(0,0,0,0)});return map.get(m);};
const dirtOf=m=>uniformOf(dirtUniforms,m),toneOf=m=>uniformOf(toneUniforms,m);
const toneUpOf=m=>{if(m&&toneUps.has(m))return toneUps.get(m);const u={value:new THREE.Vector4(0,1,0,0)};if(m)toneUps.set(m,u);return u;};
export function setCarDirt(m,amount=0,seed=0){dirtOf(m).value.set(amount,seed,0,0);return m;}
export const carDirt=m=>dirtUniforms.get(m)?.value.x??0;
export function setCarTone(m,hex=null,height=0,up=[0,1,0,0]){const c=new THREE.Color().setHex(hex??0);toneOf(m).value.set(c.r,c.g,c.b,hex===null?0:height);toneUpOf(m).value.fromArray(up);return m;}
export const carTone=m=>toneUniforms.get(m)?.value.w??0;
const TONE_GLSL=`if(carTone.w>0.0){float y=dot(carToneUp.xyz,vCarBody)+carToneUp.w,e=max(fwidth(y),1e-4)*.75;diffuseColor.rgb=mix(diffuseColor.rgb,carTone.rgb,1.0-smoothstep(carTone.w-e,carTone.w+e,y));}`;
// The spray runs back along the body: streaks long in x, thin in y (a blotchy noise read as camouflage).
const DIRT_GLSL=`float carDirtMask=0.0;
if(carDirt.x>0.0){vec3 p=vCarBody;
 float low=1.0-smoothstep(.1,.5,p.y),tail=smoothstep(-1.85,-2.4,p.x)*(1.0-smoothstep(.3,.85,p.y)),arch=0.0;
 for(int k=0;k<2;k++){float ax=k==0?1.55:-1.117,d=ax-p.x;arch+=smoothstep(-.1,.25,d)*(1.0-smoothstep(.25,1.1,d))*(1.0-smoothstep(.2,.62,p.y));}
 float streak=carNoise(p*vec3(1.6,26.0,7.0)+carDirt.y)*.65+carNoise(p*vec3(5.0,61.0,17.0)+carDirt.y*1.7)*.35;
 carDirtMask=clamp((low*.7+tail*.45+arch*.45)*carDirt.x*smoothstep(.15,.85,streak*.8+low*.35),0.0,.6);
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.13,.122,.105)*(.85+.3*carH(carDirt.y)),carDirtMask);roughnessFactor=mix(roughnessFactor,.75,carDirtMask);}`;
const NOISE_GLSL=`float carH(float n){return fract(sin(n)*43758.5453);}
float carNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);float n=dot(i,vec3(1.0,57.0,113.0));
 return mix(mix(mix(carH(n),carH(n+1.0),f.x),mix(carH(n+57.0),carH(n+58.0),f.x),f.y),mix(mix(carH(n+113.0),carH(n+114.0),f.x),mix(carH(n+170.0),carH(n+171.0),f.x),f.y),f.z);}`;
// The coat's look-up of the map in three.js's chunk, swapped for one at its own sharpness (carCoatIBL).
export const COAT_IBL_LINE='clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );';
// The probe is drawn from one point a metre over the player's car (car-reflections.js), so a reflection pointing down
// found the road as seen from there: the tail's mirror of the road a metre behind it became the car's own shadow under
// its middle, and every bumper, sill and tail went a dead black. Seen from the car's own surface, a ray that dips meets
// the road (carProbe.w, its height) where it would: that point is looked up from the probe's centre (carProbe.xyz).
// Off (w under -1e4) for the sky's map and the grid's picture, drawn far from any car.
const probeUniform={value:new THREE.Vector4(0,0,0,-1e5)};
export function setCarProbe(center=null,ground=0){if(center)probeUniform.value.set(center.x,center.y,center.z,ground);else probeUniform.value.w=-1e5;}
const COAT_RADIANCE_GLSL=`#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
uniform vec4 carProbe;
vec3 carCoatRadiance(const in vec3 viewDir,const in vec3 normal,const in float roughness){
 vec3 r=inverseTransformDirection(normalize(mix(reflect(-viewDir,normal),normal,pow4(roughness))),viewMatrix);
 // (the player's car: every finish-patched car shares the probe, and a rival a few metres off stands on other ground,
 // a metre lower on a downhill; its reflection keeps the plain look-up, faded in from 3 to 6 m off the centre)
 if(carProbe.w>-1e4&&r.y<0.0&&vCarWorld.y>carProbe.w){vec3 hit=normalize(vCarWorld+r*((carProbe.w-vCarWorld.y)/min(r.y,-1e-4))-carProbe.xyz);
  r=normalize(mix(hit,r,smoothstep(3.0,6.0,length(vCarWorld.xz-carProbe.xz))));}
 return textureCubeUV(envMap,envMapRotation*r,roughness).rgb*envMapIntensity;}
#else
vec3 carCoatRadiance(const in vec3 viewDir,const in vec3 normal,const in float roughness){return vec3(0.0);}
#endif`;
function paintPatch(shader){
 const flake=shader.defines?.CAR_FLAKE!==undefined,lens=this?.userData?.carFinish==='lens';
 shader.uniforms.carCoatF0=lens?lensUniforms.coat:coatUniform;shader.uniforms.carCoatEnv=lens?lensUniforms.env:coatEnvUniform;shader.uniforms.carCoatLift=lens?lensUniforms.lift:liftUniform;shader.uniforms.carCoatIBL=coatIblUniform;
 shader.uniforms.carDirt=dirtOf(this);shader.uniforms.carTone=toneOf(this);shader.uniforms.carToneUp=toneUpOf(this);shader.uniforms.carProbe=probeUniform;
 shader.vertexShader='varying vec3 vCarBody,vCarWorld;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCarBody=position;')
  .replace('#include <project_vertex>','#include <project_vertex>\n#ifdef USE_INSTANCING\nvCarWorld=(modelMatrix*instanceMatrix*vec4(transformed,1.0)).xyz;\n#else\nvCarWorld=(modelMatrix*vec4(transformed,1.0)).xyz;\n#endif');
 const lights=THREE.ShaderChunk.lights_physical_fragment.replace('material.clearcoatF0 = vec3( 0.04 );','material.clearcoatF0 = vec3( carCoatF0 );')
  +'\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat*=1.0-carDirtMask*.7;material.clearcoatRoughness=mix(material.clearcoatRoughness,.45,carDirtMask);\n#endif';
 // The coat mirrors the map at its own roughness (carCoatIBL plus three.js's normal-derivative term, which softens
 // it where the body curves fast on screen; grime keeps it dull): the sharpest level of the map at hand, the probe's
 // full picture. The sun's glint keeps material.clearcoatRoughness and its floor against sparkle.
 // The lift fades with the brightness reflected (up to 1+lift times on the road, about a quarter of it on the
 // sky, nothing added to the sun's glint): the horizon line on a flank keeps its contrast.
 const maps=THREE.ShaderChunk.lights_fragment_maps.replace(COAT_IBL_LINE,'clearcoatRadiance += carCoatRadiance( geometryViewDir, geometryClearcoatNormal, mix( min( material.clearcoatRoughness, carCoatIBL + geometryRoughness ), material.clearcoatRoughness, carDirtMask ) );');
 shader.fragmentShader='uniform float carCoatF0,carCoatEnv,carCoatLift,carCoatIBL;uniform vec4 carDirt,carTone,carToneUp;varying vec3 vCarBody,vCarWorld;\n'+NOISE_GLSL+'\n'+shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>','#include <envmap_physical_pars_fragment>\n'+COAT_RADIANCE_GLSL).replace('#include <lights_physical_fragment>',lights)
  .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n'+TONE_GLSL+'\n'+DIRT_GLSL).replace('#include <opaque_fragment>',CLAMP_GLSL+'\n#include <opaque_fragment>')
  .replace('#include <lights_fragment_maps>',maps+'\n#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular ) && defined( USE_CLEARCOAT )\nclearcoatRadiance*=carCoatEnv*(1.0+carCoatLift/(1.0+2.5*dot(clearcoatRadiance,vec3(.2126,.7152,.0722))));\n#endif');
 if(!flake)return;
 shader.uniforms.carFlake=flakeUniform;
 shader.vertexShader='varying vec3 vCarFlake;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCarFlake=position;');
 const glint=THREE.ShaderChunk.lights_physical_pars_fragment.replace('reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );',`reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );
 if(carFlakeOn>0.0){vec3 carHalf=normalize(directLight.direction+geometryViewDir);
  reflectedLight.directSpecular+=irradiance*(.25+.75*material.diffuseColor)*pow(saturate(dot(carFlakeN,carHalf)),160.0)*pow(saturate(dot(geometryNormal,carHalf)),24.0)*carFlakeOn;}`);
 shader.fragmentShader=`uniform float carFlake;varying vec3 vCarFlake;vec3 carFlakeN=vec3(0.0,1.0,0.0);float carFlakeOn=0.0;
vec3 carHash(vec3 p){p=fract(p*vec3(.1031,.103,.0973));p+=dot(p,p.yxz+33.33);return fract((p.xxy+p.yxx)*p.zyx);}\n`+shader.fragmentShader
  .replace('#include <lights_physical_pars_fragment>',glint)
  .replace('#include <clearcoat_normal_fragment_maps>',`#include <clearcoat_normal_fragment_maps>
 {vec3 carCell=vCarFlake*1400.0;float carLod=max(0.0,log2(max(length(fwidth(carCell)),1e-4)*1.6));
 vec3 carH=carHash(floor(carCell*exp2(-floor(carLod))));carFlakeN=normalize(normal+(carH-.5)*1.1);
 carFlakeOn=carFlake*.6*step(.6,fract(carH.x*7.31+carH.y*3.17))*(1.0-smoothstep(3.0,6.0,carLod));}`);
}
const patchKey={glass:()=>'car-glass',chrome:()=>'car-chrome',paint:function(){return this.defines?.CAR_FLAKE!==undefined?'car-paint-flake':'car-paint';}};
const PATCHES={glass:glassPatch,paint:paintPatch,decal:paintPatch,lens:paintPatch,chrome:chromePatch};

// The finish of one material for the profile in force (values from the GLB kept in finishBase, so
// a repeated call never compounds); rosterFinish is a team's own (race-roster.js, #19's gold).
function apply(m){
 const kind=m.userData.carFinish,base=m.userData.finishBase,p=state.profile,own=m.userData.rosterFinish;
 m.envMap=state.env;
 if(kind==='paint'){
  if(m.isMeshPhysicalMaterial){m.clearcoat=p.coat;m.clearcoatRoughness=coatFor(m,state.samples);m.specularIntensity=p.specular;}
  // Solid colours are dielectric under the coat (the GLB's .1 dulled black); a team's own (#19's gold) stays.
  m.roughness=own?.roughness??p.roughness;m.metalness=own?.metalness??0;
  m.envMapIntensity=p.env;
  const flake=p.flake>0&&m.isMeshPhysicalMaterial;if(flake!==(m.defines?.CAR_FLAKE!==undefined)){if(flake)m.defines.CAR_FLAKE='';else delete m.defines.CAR_FLAKE;m.needsUpdate=true;}
 }else if(kind==='chrome'){
  // The GLB's polished trim (Aros_polidos, .14) takes the profile's value, rougher metals (the rims) a bit more.
  m.metalness=1;m.roughness=Math.max(.03,p.chrome*Math.sqrt(base.roughness/.14));m.envMapIntensity=p.env;
  // Polished metal a shade brighter than the GLB's grey (Aros_polidos .68).
  m.color.fromArray(base.color).multiplyScalar(base.color[1]<.75?1.2:1);
 }else if(kind==='glass'){
  if(m.specularIntensity!==undefined){m.specularIntensity=1;m.ior=GLASS_LOOK.ior;}m.roughness=Math.min(base.roughness,.04);m.envMapIntensity=p.env;
 }else if(kind==='decal'){
  // Printed film under the same coat: a little rougher than the paint's base, never paper.
  if(m.isMeshPhysicalMaterial){m.clearcoat=p.decalCoat;m.clearcoatRoughness=coatRoughnessFor(p,state.samples);m.specularIntensity=1;}m.roughness=Math.min(base.roughness,.36);m.envMapIntensity=p.env;
 }else if(kind==='lens'){
  // A smooth clear lens (the coat, LENS_COAT) over a faceted deep red reflector (ring normals, a fifth metal: at half
  // metal its warm sheen read amber in the sun); a faint glow keeps it red in the shade. brake-lights.js lights it.
  if(m.isMeshPhysicalMaterial){m.clearcoat=1;m.clearcoatRoughness=Math.max(.08,coatRoughnessFor(p,state.samples));m.specularIntensity=1;}
  m.color.setRGB(...LENS_RED);m.roughness=.3;m.metalness=.2;m.envMapIntensity=p.env;m.emissive?.setRGB(.034,.0015,.001);m.emissiveIntensity=1;
  if(m.normalMap!==lensRings()){m.normalMap=lensRings();m.normalScale.set(.8,.8);m.needsUpdate=true;}
 }else if(kind==='tyre')m.envMapIntensity=p.tyreEnv;
 else if(kind==='blur')m.envMapIntensity=p.env;
 else{m.envMapIntensity=TRIM_ENV;if(MATTE.test(m.name)){m.roughness=.9;if(m.specularIntensity!==undefined)m.specularIntensity=.35;}if(SHELL.test(m.name))m.color.fromArray(base.color).multiplyScalar(SHELL_GREY/Math.max(base.color[1],1e-3));}
}
// Tags one material (its class, the GLB's values) and finishes it. A clone arrives tagged (userData
// survives clone()) but without its patch: set again here. Returns the material.
export function finishMaterial(m,{rosterFinish=null}={}){
 if(!m||!m.isMeshStandardMaterial)return m;
 if(!m.userData.carFinish){m.userData.carFinish=finishClass(m.name);m.userData.finishBase={roughness:m.roughness,metalness:m.metalness,color:m.color.toArray()};}
 if(rosterFinish)m.userData.rosterFinish={...rosterFinish};
 const kind=m.userData.carFinish,patch=PATCHES[kind];
 if(patch&&m.onBeforeCompile!==patch){m.onBeforeCompile=patch;m.customProgramCacheKey=patchKey[kind==='glass'||kind==='chrome'?kind:'paint'];m.needsUpdate=true;}
 register(m);apply(m);return m;
}
// Paint that came from Blender without a clear coat (the 99's white: a plain MeshStandardMaterial)
// becomes physical so it can carry one; same name, colour and maps.
// force: painted whatever its name says (a rival's painted rims, car-livery.js rimMaterial).
export function physicalPaint(m,force=false){
 if(!m?.isMeshStandardMaterial||m.isMeshPhysicalMaterial||(!force&&finishClass(m.name)!=='paint'))return m;
 // The standard copy resets the defines to a standard material's: physical ones back.
 const p=new THREE.MeshPhysicalMaterial();THREE.MeshStandardMaterial.prototype.copy.call(p,m);p.defines={STANDARD:'',PHYSICAL:''};p.name=m.name;p.userData={...m.userData};return p;
}
// One mesh of a car model as loaded (main.js setLivery), in place; a material shared by several
// meshes is upgraded once.
const upgraded=new WeakMap();
export function finishMesh(o){
 if(!o.isMesh)return o;const one=m=>{if(!upgraded.has(m))upgraded.set(m,finishMaterial(physicalPaint(m)));return upgraded.get(m);};
 o.material=Array.isArray(o.material)?o.material.map(one):one(o.material);return o;
}
// Every material of a car model (fusca.js prepareFusca).
export function finishCar(root){root.traverse(finishMesh);return root;}
// The profile (FINISH_PROFILES key) and the antialiasing in force. True when programs change (the
// flake comes or goes): the caller precompiles (main.js precompileGraphics).
export function setCarFinish(name,{samples=state.samples}={}){
 const profile=FINISH_PROFILES[name]??FINISH_PROFILES.alto;
 state.name=Object.keys(FINISH_PROFILES).find(k=>FINISH_PROFILES[k]===profile);state.samples=samples;
 return useProfile(profile);
}
function useProfile(profile){
 state.profile=profile;flakeUniform.value=profile.flake;glassUniform.value=profile.glass;coatIblUniform.value=profile.coatIBL;coatValues();
 let programs=false;for(const m of materials()){const had=m.defines?.CAR_FLAKE!==undefined;apply(m);if(had!==(m.defines?.CAR_FLAKE!==undefined))programs=true;}
 return programs;
}
// The coat's strength follows the map it mirrors, not only the level: the sky's own map (Baixo's always; the other
// levels' at night, in the story's paddock, before the grid's picture is ready) holds no stands and no asphalt, and the
// coat tuned for a captured circuit (Médio and up) left the black 99 near dull on it (about a third of Baixo's
// reflection at night): on the sky's map every level wears Baixo's coat (values only, the same programs).
function coatValues(){const p=state.sky&&state.name!=='baixo'?FINISH_PROFILES.baixo:state.profile;coatUniform.value=p.coatF0;coatEnvUniform.value=p.coatEnv;liftUniform.value=p.lift;}
// Tuning shots and checks (window.interlagosPintura.tune): the profile in force with some of its values changed,
// until the next level is applied. Same programs unless the flake changes.
export function tuneCarFinish(values={}){return useProfile(Object.freeze({...FINISH_PROFILES[state.name]??state.profile,...values}));}
if(typeof window!=='undefined')window.interlagosPintura={info:()=>carFinishInfo(),tune:values=>{tuneCarFinish(values);return state.profile;}};
// The multisampling actually drawn (it drops on very large screens): only the coat floor follows it.
export function setCarSamples(samples){
 if(samples===state.samples)return;state.samples=samples;const coat=coatRoughnessFor(state.profile,samples);
 for(const m of materials())if(m.isMeshPhysicalMaterial&&m.userData.carFinish==='paint')m.clearcoatRoughness=coatFor(m,samples);else if(m.isMeshPhysicalMaterial&&m.userData.carFinish==='decal')m.clearcoatRoughness=coat;else if(m.userData.carFinish==='lens')m.clearcoatRoughness=Math.max(.08,coat);
}
// The environment every car material reflects (car-reflections.js: the sky's, the circuit's or the
// probe round the player's car; car-select.js: the studio's). owner: who asked, for info only. sky: the map is the
// sky's own (sky.js carEnvironment: the coat takes Baixo's values, coatValues). True when the map's size changed (other programs).
export function setCarEnvironment(texture,owner=null,sky=false){
 if(state.sky!==!!sky){state.sky=!!sky;coatValues();}
 // Only the race's probe has a centre to correct the road's reflection from (car-reflections.js sets it after this).
 state.owner=owner;if(owner!=='corrida'||texture!==state.env)setCarProbe(null);if(texture===state.env)return false;
 const size=t=>t?.image?.height??0,programs=size(texture)!==size(state.env);
 state.env=texture;for(const m of materials())m.envMap=texture;return programs;
}
export const carEnvironment=()=>state.env;
// For tests and the Gráficos info: the profile, the coat in force and how many materials of each kind.
export function carFinishInfo(){
 const count={};let sample=null,withEnv=0;
 for(const m of materials()){const k=m.userData.carFinish;count[k]=(count[k]??0)+1;if(state.env&&m.envMap===state.env)withEnv++;if(k==='paint'&&m.name==='Pintura_preta'&&!sample)sample=m;}
 return {profile:state.name,samples:state.samples,coatRoughness:coatRoughnessFor(state.profile,state.samples),coatEnv:coatEnvUniform.value,coatF0:coatUniform.value,skyMap:state.sky,flake:state.profile.flake,glass:glassUniform.value,owner:state.owner,
  materials:count,withEnv,paint:sample?{clearcoat:sample.clearcoat,clearcoatRoughness:sample.clearcoatRoughness,roughness:sample.roughness,envMapIntensity:sample.envMapIntensity,env:!!sample.envMap}:null};
}
// The body paint of one car (its model, a rival's root): what checks read (interlagos.carPaintInfo).
export function paintOf(root){
 let m=null;root?.traverse(o=>{if(!m&&o.isMesh)m=[o.material].flat().find(x=>x?.name==='Pintura_preta'||x?.name==='Pintura_fusca')??null;});
 return m&&{name:m.name,color:m.color.getHex(),clearcoat:m.clearcoat,clearcoatRoughness:m.clearcoatRoughness,roughness:m.roughness,metalness:m.metalness,envMapIntensity:m.envMapIntensity,
  env:!!m.envMap&&m.envMap===state.env,patched:m.onBeforeCompile===paintPatch,flake:m.defines?.CAR_FLAKE!==undefined};
}
