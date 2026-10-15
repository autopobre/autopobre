import * as THREE from 'three';
import {finishMaterial} from './car-finish.js';
// Tyres and spinning wheels, shared by every car built from a model (the player's, the rivals' clones,
// the car screen's): the tyres' sidewall lettering and worn tread, and the blur that hides the rims' spokes at
// speed (its disc is drawn by contact-shadows.js, one instanced draw for every car).
// The GLB tyres have no usable UVs (one ring has; the rest sit on 0,1): prepareWheels writes radial ones on the
// template's four tyre geometries at load, which every clone shares, and gives them one lettered material.

// Each model's tyre, in its wheel pivot's frame (axle along z, the outer face on the side the pivot sits):
// the tyre's material, bead and outer radius, the tread's half width (to the shoulder) and the grooves' depth.
export const TYRE_PROFILES=Object.freeze({
 opala:Object.freeze({material:'Pneu_slick_borracha',bead:.2032,radius:.316,shoulder:.078,groove:.006}),
 fusca:Object.freeze({material:'Pneu',bead:.183,radius:.27,shoulder:.064,groove:.006})
});
// Across the texture (v): the inner bead 0 to the inner shoulder .36, the tread .38-.62, the outer shoulder
// .64 to the outer bead 1, so the profile runs on without a jump from bead to bead.
export const TYRE_BANDS=Object.freeze({inner:.36,tread:[.38,.62],outer:.64});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// UV of a tyre vertex (pivot frame). outer: +1 when the outer face is +z (the right side wheels), -1 on the
// left. u runs round the tyre so the lettering reads left to right seen from outside on both sides.
export function tyreUV(x,y,z,profile,outer){
 const r=Math.hypot(x,y),side=z*outer;
 let u=outer*Math.atan2(y,x)/(2*Math.PI);u-=Math.floor(u);
 if(r>=profile.radius-profile.groove&&Math.abs(z)<=profile.shoulder+1e-3)return [u,.5+(TYRE_BANDS.tread[1]-.5)*clamp(side/profile.shoulder,-1,1)];
 const s=clamp((r-profile.bead)/(profile.radius-profile.bead),0,1);
 return [u,side>0?1-(1-TYRE_BANDS.outer)*s:TYRE_BANDS.inner*s];
}
// Triangles across the u seam (one corner near 1, another near 0) would squeeze the whole texture into one
// segment: their low corners get copies at u+1 (the texture repeats). Returns the new index and, for each
// copy, the vertex it copies.
export function splitSeam(index,u){
 const out=Array.from(index),copies=[],copyOf=new Map();
 for(let t=0;t<out.length;t+=3){
  const a=out[t],b=out[t+1],c=out[t+2];if(Math.max(u[a],u[b],u[c])-Math.min(u[a],u[b],u[c])<=.5)continue;
  for(let k=t;k<t+3;k++){const v=out[k];if(u[v]>=.5)continue;if(!copyOf.has(v)){copyOf.set(v,u.length+copies.length);copies.push(v);}out[k]=copyOf.get(v);}
 }
 return {index:out,copies};
}
// The lettering and the worn tread on one tyre geometry (shared: done once). matrix: the mesh in its pivot's frame.
function tyreGeometry(geometry,matrix,profile,outer){
 if(geometry.userData.tyreUV||!geometry.index)return;
 const p=geometry.attributes.position,n=p.count,u=new Float32Array(n),v=new Float32Array(n),q=new THREE.Vector3();
 for(let i=0;i<n;i++){q.fromBufferAttribute(p,i).applyMatrix4(matrix);[u[i],v[i]]=tyreUV(q.x,q.y,q.z,profile,outer);}
 const {index,copies}=splitSeam(geometry.index.array,u),total=n+copies.length;
 // Raw values (glTF attributes may be interleaved or normalized integers): copied as stored.
 const raw=(a,i,k)=>a.isInterleavedBufferAttribute?a.data.array[i*a.data.stride+a.offset+k]:a.array[i*a.itemSize+k];
 for(const [name,attribute] of Object.entries(geometry.attributes)){
  if(name==='uv')continue;const size=attribute.itemSize,array=new (attribute.isInterleavedBufferAttribute?attribute.data.array:attribute.array).constructor(total*size);
  for(let i=0;i<n;i++)for(let k=0;k<size;k++)array[i*size+k]=raw(attribute,i,k);
  copies.forEach((from,j)=>{for(let k=0;k<size;k++)array[(n+j)*size+k]=raw(attribute,from,k);});
  geometry.setAttribute(name,new THREE.BufferAttribute(array,size,attribute.normalized));
 }
 const uv=new Float32Array(total*2);for(let i=0;i<total;i++){const from=i<n?i:copies[i-n];uv[i*2]=i<n?u[from]:u[from]+1;uv[i*2+1]=v[from];}
 geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setIndex(index);geometry.userData.tyreUV=true;
}
// Rubber is a dark grey, not paint black (about .03 linear: the sidewall's #313234); the tread a shade darker.
// Sidewall: the moulded lettering (the game's own AUTO POBRE, with the tyre the model races on under it) twice
// round the tyre, a rim line, a darker bead; the tread a little greyer, scrubbed. Drawn upside down: the outer
// face's letters stand toward the tread.
// The letters are a worn light grey, not paint white: brake dust and rubber pick-up dull them unevenly.
export const TYRE_LETTERS=Object.freeze({v:.81,color:'#7d7a73',brand:36,small:17});
// The real cars' tyres: the Opala on Dunlop Direzza, the Fusca on Goodyear 185/70 R14.
export const TYRE_MARKINGS=Object.freeze({opala:'DUNLOP DIREZZA',fusca:'GOODYEAR 185/70 R14'});
function tyreTexture(tyre){
 const W=1024,H=256,c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d'),y=v=>(1-v)*H;
 ctx.fillStyle='#313234';ctx.fillRect(0,0,W,H);
 ctx.fillStyle='#2c2d2f';ctx.fillRect(0,y(TYRE_BANDS.tread[1]+.02),W,y(TYRE_BANDS.tread[0]-.02)-y(TYRE_BANDS.tread[1]+.02));
 let seed=7;const rand=()=>(seed=seed*16807%2147483647)/2147483647;
 // Scrubbed rubber along the tread, faint streaks round the tyre.
 for(let k=0;k<900;k++){const yy=y(TYRE_BANDS.tread[0])-rand()*(y(TYRE_BANDS.tread[0])-y(TYRE_BANDS.tread[1]));ctx.fillStyle=`rgba(${rand()<.5?60:12},${rand()<.5?60:12},${rand()<.5?62:14},${.08+rand()*.1})`;ctx.fillRect(rand()*W,yy,20+rand()*90,1+rand()*1.5);}
 ctx.fillStyle='#232426';ctx.fillRect(0,0,W,y(.965));ctx.fillRect(0,y(.035),W,H-y(.035));
 // A moulded line round the rim, and one under the shoulder.
 ctx.fillStyle='#3d3e41';ctx.fillRect(0,y(.935),W,2);ctx.fillRect(0,y(.68),W,2);
 // The letters on their own layer, so the wear (source-atop) only dulls them: dust specks and scuffs, never the
 // same twice round the tyre.
 const L=TYRE_LETTERS,lc=document.createElement('canvas');lc.width=W;lc.height=H;const lx=lc.getContext('2d');
 lx.save();lx.translate(W,y(L.v));lx.rotate(Math.PI);lx.scale(.8,1);lx.textBaseline='middle';lx.fillStyle=L.color;lx.textAlign='left';
 for(let k=0;k<2;k++){
  const x0=k*W/2/.8;
  lx.font=`italic 900 ${L.brand}px Arial,sans-serif`;lx.fillText('AUTO POBRE',x0+24,0,250);
  lx.font=`bold ${L.small}px Arial,sans-serif`;lx.fillText(tyre,x0+300,-10,210);lx.fillText('MOLE · 99',x0+300,10,180);
  lx.font=`bold ${L.small-2}px Arial,sans-serif`;lx.fillText('▲',x0+520,0);
 }
 lx.restore();lx.globalCompositeOperation='source-atop';
 for(let k=0;k<2600;k++){lx.fillStyle=`rgba(${28+rand()*30|0},${27+rand()*26|0},${25+rand()*22|0},${.18+rand()*.4})`;lx.fillRect(rand()*W,y(L.v+.11)+rand()*(y(L.v-.11)-y(L.v+.11)),1+rand()*7,1+rand()*2);}
 ctx.drawImage(lc,0,0);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;t.anisotropy=8;return t;
}
// Roughness (green): matte sidewall, the worn tread a little shinier with grain across it, the shoulder between.
export function tyreRoughness(u,v){
 const g=Math.sin(v*311)*.5+Math.sin(v*977+u*6.28)*.5,[t0,t1]=TYRE_BANDS.tread;
 if(v>=t0&&v<=t1)return clamp(.58+.05*g,0,1);
 if(v>TYRE_BANDS.inner&&v<TYRE_BANDS.outer)return .78;
 return v<.035||v>.965?.84:.9+.02*g;
}
function roughnessTexture(){
 const W=256,H=64,data=new Uint8Array(W*H*4);
 for(let j=0;j<H;j++)for(let i=0;i<W;i++){const r=Math.round(tyreRoughness((i+.5)/W,(j+.5)/H)*255),k=(j*W+i)*4;data[k]=data[k+1]=data[k+2]=r;data[k+3]=255;}
 const t=new THREE.DataTexture(data,W,H);t.wrapS=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;
}
// One lettered material per model, shared by all its cars; detail off (Baixo) puts a plain one back, the same
// rubber grey (the GLB's own was near black).
export const PLAIN_TYRE=Object.freeze({color:[.03,.031,.033],roughness:.88});
const tyres={},maps={};let detailed=true,roughnessMap=null;
function dressTyre(m,model){
 maps[model]??=tyreTexture(TYRE_MARKINGS[model]);roughnessMap??=roughnessTexture();
 if(detailed){m.map=maps[model];m.roughnessMap=roughnessMap;m.color.setRGB(1,1,1);m.roughness=1;}
 else{m.map=null;m.roughnessMap=null;m.color.setRGB(...PLAIN_TYRE.color);m.roughness=PLAIN_TYRE.roughness;}
 m.needsUpdate=true;
}
// The wheels of a model as loaded (main.js setLivery, fusca.js prepareFusca), before any clone is made.
export function prepareWheels(root,model='opala'){
 const profile=TYRE_PROFILES[model];root.updateMatrixWorld(true);
 root.traverse(pivot=>{
  if(!pivot.name.startsWith('Roda_')||!pivot.name.includes('PIVO'))return;
  const outer=pivot.position.z>0?1:-1,toPivot=pivot.matrixWorld.clone().invert();
  for(const o of pivot.children){
   if(!o.isMesh||o.material?.name!==profile.material)continue;
   tyreGeometry(o.geometry,toPivot.clone().multiply(o.matrixWorld),profile,outer);
   // The shared clone goes through the cars' finish (car-finish.js) so the reflection levels re-point its map
   // and set its strength, whichever of setLivery's passes ran first.
   if(!tyres[model]){const m=o.material.clone();tyres[model]=m;dressTyre(m,model);finishMaterial(m);}
   o.material=tyres[model];
  }
 });
}
// Gráficos: lettered tyres from Médio up. A change recompiles the tyres' program (main.js applyGraphics calls
// it with the track detail, whose change already precompiles). Returns whether anything changed.
export function setTyreDetail(on){
 if(on===detailed)return false;detailed=on;for(const [model,m] of Object.entries(tyres))dressTyre(m,model);return true;
}
export const tyreInfo=()=>({detailed,models:Object.keys(tyres),lettered:Object.values(tyres).map(m=>!!m.map)});

// Spin blur: a disc over a wheel's face, the wheel as a camera sees it turning. Drawn from each model's profile in
// polar terms (no texture): the spokes smeared round their circle over the arc the wheel turns while a film camera's
// shutter is open (blurArc), worked out exactly (a box filter over a train of pulses), so they read as spokes while
// the car pulls away and as a faint ghost at speed; between them the dark hub and the brake disc's grey band; the polished
// lip a bright ring whose rounded profile tilts the normal to catch the sky; the sidewall's letters a grey band.
// contact-shadows.js turns the pattern far slower than the wheel (nothing strobes) and smears it whole while the disc
// fades in over the real spokes.
// Per model, out to the tyre's edge (radius 1): rings [from radius, grey (sRGB), opacity, metalness, roughness]
// (what shows where no spoke is drawn); spokes [count, from, to, width at the hub and at the rim (radians), grey,
// metalness, roughness] over gaps [from radius, grey, metalness, roughness]; letters [radius, half width, grey
// added]; lip [from, to]; dome: the spokes' face tilted out toward the rim (a spun wheel's facets averaged: its upper
// half catches the sky, the lower the road); model: its number in the shader (instance colour).
export const BLUR_PROFILES=Object.freeze({
 // The Opala's polished five-spoke alloy: the cap, the lug nuts' ring, the spokes over the dark hub and the brake
 // disc, the barrel's step, the bright lip and its shadowed edge, the rubber. Smeared, the spokes' facets face every
 // way at once: a lighter, half-metal satin that takes the sky's light whatever side it is on (as a mirror metal the
 // disc reflected the one dark direction its averaged normal saw: a smooth dark hubcap in every shade, round 2).
 opala:Object.freeze({model:0,rings:[[0,196,.92,.65,.3],[.1,128,.95,.6,.38],[.2,158,.97,.6,.38],[.615,46,.975,.45,.5],[.645,240,.98,1,.12],[.7,44,.985,.2,.6],[.725,49,.985,0,.88],[.74,52,.985,0,.88]],
  spokes:[5,.17,.62,.5,.36,232,.45,.42],gaps:[[.17,38,.35,.55],[.44,128,.45,.45]],letters:[.845,.065,40],lip:[.645,.7],dome:.5}),
 // The Fusca's black steel wheel: six holes onto the dark drum, a dark cap.
 fusca:Object.freeze({model:1,rings:[[0,66,.9,.5,.3],[.12,34,.975,.3,.4],[.6,40,.975,.2,.3],[.665,26,.985,0,.85],[.7,50,.985,0,.88]],
  spokes:[6,.3,.5,.55,.55,36,.3,.4],gaps:[[.3,20,.2,.5]],letters:[.85,.06,40],lip:[.6,.665],dome:.2})
});
// The share of a pulse train (count pulses of width w round the circle, one centred on angle 0) seen through a
// box arc centred on phi: 1 on a spoke, 0 in a gap, its mean w*count/2pi once the arc spans a period.
const pulseSum=(t,P,w)=>Math.floor(t/P)*w+Math.min(t-P*Math.floor(t/P),w);
export function spokeCover(phi,arc,count,w){const P=2*Math.PI/count,a=Math.max(arc,1e-3);return clamp((pulseSum(phi+a/2+w/2,P,w)-pulseSum(phi-a/2+w/2,P,w))/a,0,1);}
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const blend=(list,rho,keys)=>{const v=list[0].slice(1,1+keys);for(let i=1;i<list.length;i++){const t=clamp((rho-list[i][0])/.014+.5,0,1);for(let k=0;k<keys;k++)v[k]+=(list[i][k+1]-list[i-1][k+1])*t;}return v;};
// The wheel's face at radius rho and angle phi with the spokes smeared over arc (radians): [grey (sRGB 0-255),
// opacity, metalness, roughness]. The shader (spinBlurMaterial) draws the same.
export function blurTexel(profile,rho,phi=0,arc=0){
 if(rho>=1)return [0,0,0,1];
 let [grey,alpha,metal,rough]=blend(profile.rings,rho,4);
 const [n,s0,s1,w0,w1,sg,sm,sr]=profile.spokes,zone=smooth(s0-.012,s0+.012,rho)*(1-smooth(s1-.012,s1+.012,rho));
 if(zone>0){const [gg,gm,gr]=blend(profile.gaps,rho,3),c=spokeCover(phi,arc,n,w0+(w1-w0)*clamp((rho-s0)/(s1-s0),0,1));
  grey+=(gg+(sg-gg)*c-grey)*zone;metal+=(gm+(sm-gm)*c-metal)*zone;rough+=(gr+(sr-gr)*c-rough)*zone;}
 const [lr,lw,lg]=profile.letters;grey+=lg*clamp(1-((rho-lr)/lw)**2,0,1);
 alpha*=clamp((1-rho)/.03,0,1);
 return [clamp(grey,0,255),clamp(alpha,0,1),clamp(metal,0,1),clamp(rough,0,1)];
}
// The lip's rounded profile as a normal's tilt along the radius (-1 inner edge, +1 outer), zero elsewhere.
export function blurLipSlope(profile,rho){const [a,b]=profile.lip;if(rho<=a||rho>=b)return 0;const t=(rho-a)/(b-a)*2-1;return clamp(t/Math.sqrt(Math.max(.05,1-t*t)),-2.5,2.5)*.6;}
// The same in GLSL, numbers written in from the profiles: one block per model.
const glf=v=>{const s=(+v).toFixed(4);return s.includes('.')?s:s+'.0';};
function blendGLSL(name,list,keys){
 let out=`vec4 ${name}=vec4(${[...list[0].slice(1,1+keys),0,0,0].slice(0,4).map(glf).join(',')});`;
 for(let i=1;i<list.length;i++)out+=`${name}+=vec4(${[...list[i].slice(1,1+keys).map((v,k)=>v-list[i-1][k+1]),0,0,0].slice(0,4).map(glf).join(',')})*clamp((rho-${glf(list[i][0])})/.014+.5,0.,1.);`;
 return out;
}
export function faceGLSL(profile){
 const [n,s0,s1,w0,w1,sg,sm,sr]=profile.spokes,[lr,lw,lg]=profile.letters,[la,lb]=profile.lip;
 return `if(abs(model-${glf(profile.model)})<.5){${blendGLSL('ring',profile.rings,4)}
 float zone=smoothstep(${glf(s0-.012)},${glf(s0+.012)},rho)*(1.-smoothstep(${glf(s1-.012)},${glf(s1+.012)},rho));
 if(zone>0.){${blendGLSL('gap',profile.gaps,3)}float c=carSpokes(phi,arc,${glf(n)},mix(${glf(w0)},${glf(w1)},clamp((rho-${glf(s0)})/${glf(s1-s0)},0.,1.)));
  ring.xzw=mix(ring.xzw,mix(gap.xyz,vec3(${glf(sg)},${glf(sm)},${glf(sr)}),c),zone);}
 float lx=(rho-${glf(lr)})/${glf(lw)};ring.x+=${glf(lg)}*clamp(1.-lx*lx,0.,1.);
 float lt=(rho-${glf(la)})/${glf(lb-la)}*2.-1.;slope=(rho>${glf(la)}&&rho<${glf(lb)}?clamp(lt/sqrt(max(.05,1.-lt*lt)),-2.5,2.5)*.6:0.)+${glf(profile.dome??0)}*zone;
 face=ring;}`;
}
// The disc's material: lit as the rim is (receives the sun's shadow under the arch) and reflecting what the cars
// reflect (car-finish.js: its own 'blur' finish, the rims' environment strength). Each instance's colour carries
// its opacity (r), its model plus the frame's smear (g: model + arc/2pi * .9) and its rims' style (b), so all cars'
// discs are one instanced draw.
export function spinBlurMaterial(){
 const m=new THREE.MeshStandardMaterial({name:'Roda_borrada',roughness:1,metalness:1,transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
  polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2,blending:THREE.CustomBlending,blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor});
 m.onBeforeCompile=s=>{
  s.vertexShader='varying vec2 vDisc;varying vec3 vDiscData,vRadial;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvDisc=position.xy;')
   .replace('#include <color_vertex>','#include <color_vertex>\nvColor=vec4(1.);\n#ifdef USE_INSTANCING_COLOR\nvDiscData=instanceColor;\n#else\nvDiscData=vec3(1.,0.,0.);\n#endif')
   .replace('#include <project_vertex>','#include <project_vertex>\n#ifdef USE_INSTANCING\nvRadial=(modelViewMatrix*(instanceMatrix*vec4(position.xy,0.,0.))).xyz;\n#else\nvRadial=(modelViewMatrix*vec4(position.xy,0.,0.)).xyz;\n#endif');
  s.fragmentShader=`varying vec2 vDisc;varying vec3 vDiscData,vRadial;
float carPulse(float t,float P,float w){float k=floor(t/P);return k*w+min(t-P*k,w);}
float carSpokes(float phi,float arc,float n,float w){float P=6.2831853/n;return clamp((carPulse(phi+arc*.5+w*.5,P,w)-carPulse(phi-arc*.5+w*.5,P,w))/arc,0.,1.);}
`+s.fragmentShader.replace('#include <map_fragment>',`float rho=length(vDisc),phi=atan(vDisc.y,vDisc.x),model=step(.95,vDiscData.g),slope=0.;
 // The smear: the frame's arc, never under a pixel's own width round the circle (the edges stay smooth).
 float arc=max((vDiscData.g-model)/.9*6.2831853,length(fwidth(vDisc))*1.2/max(rho,.03));vec4 face=vec4(0.,0.,0.,1.);
 ${Object.values(BLUR_PROFILES).map(faceGLSL).join('\n ')}
 diffuseColor.rgb=vec3(pow(clamp(face.x/255.,0.,1.),2.2));diffuseColor.a*=face.y*clamp((1.-rho)/.03,0.,1.)*vDiscData.r;
 // A rival's rims (b: car-livery.js RIM_STYLES, the Opala's only): the face inside the polished lip gold, white or black.
 float rimStyle=floor(vDiscData.b+.5),rimFace=(1.-smoothstep(.6,.64,rho))*step(.5,rimStyle)*(1.-model);
 if(rimFace>0.){vec3 tint=rimStyle<1.5?diffuseColor.rgb*vec3(1.15,.8,.34):rimStyle<2.5?diffuseColor.rgb*1.15:diffuseColor.rgb*.08;
  diffuseColor.rgb=mix(diffuseColor.rgb,tint,rimFace);if(rimStyle>1.5){face.z=mix(face.z,min(face.z,.1),rimFace);face.w=mix(face.w,.35,rimFace);}}
 float carFaceMetal=face.z,carFaceRough=face.w,carFaceSlope=slope;`)
   .replace('#include <roughnessmap_fragment>','float roughnessFactor=carFaceRough;')
   .replace('#include <metalnessmap_fragment>','float metalnessFactor=carFaceMetal;')
   .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=normalize(normal+normalize(vRadial+vec3(1e-6))*carFaceSlope*.7);');
 };
 m.customProgramCacheKey=()=>'roda-borrada-5';
 return finishMaterial(m);
}
// How far the disc's pattern turns for each turn of the wheel: about two turns a second at racing speed.
export const BLUR_TURN=.08;
// The arc a wheel turns while the shutter is open (a TV camera's 1/180 s) at this surface speed (m/s): the spokes'
// smear, a ghost of them up to about 160 km/h (at 1/120 s the disc went even, a flat hubcap), even beyond.
export const BLUR_SHUTTER=1/180;
export const blurArc=(speed,radius)=>Math.min(2*Math.PI,Math.abs(speed)/radius*BLUR_SHUTTER);
// How much a wheel turning at this surface speed (m/s) is blurred: none at a walk, full from about 60 km/h.
export const spinBlur=speed=>{const t=clamp((speed-7)/9,0,1);return t*t*(3-2*t);};
