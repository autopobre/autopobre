import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {clamp,guardrailPresent,guardrailClearance} from './physics.js';
import {sceneryBands} from './track-clearance.js';
import {LakeWaves,waveVertexCommon,waveVertex,waveFragmentCommon,waveClip} from './lake-waves.js';
import {createVergeVegetation} from './verge-vegetation.js';
import {carShadowPatch} from './car-shadow.js';
import {EFFECT_LIGHT} from './weather.js';
import {skyMirror} from './sky.js';

// Land cover is read from the 2020 GeoSampa orthophoto already packed in the
// track GLB: woods become 3D trees, orange roofs become houses, dark smooth
// areas become water. This is a visual interpretation for the game, not a survey.
const FIELD_RANGE=80;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function random(seed){let s=(seed>>>0)||1;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
const shared={time:{value:0}};
// The camera's far plane (main.js applyViewDistance): the skyline's towers are wholly fog before it cuts them.
export const SKYLINE_FAR={value:1900};

export function terrainHeight(data,x,y){
 const t=data.terrain,fx=clamp((x-t.x0)/t.step,0,t.nx-1.001),fy=clamp((y-t.y0)/t.step,0,t.ny-1.001),ix=Math.floor(fx),iy=Math.floor(fy),u=fx-ix,v=fy-iy,k=iy*t.nx+ix;
 return (t.z[k]*(1-u)+t.z[k+1]*u)*(1-v)+(t.z[k+t.nx]*(1-u)+t.z[k+t.nx+1]*u)*v;
}

export async function loadTerrainTextures(renderer){
 const loader=new THREE.TextureLoader(),names=['grama_diff_v1','mato_diff_v1','brita_diff_v1','concreto_diff_v1','grama_nor_gl_v1'];
 const maps=await Promise.all(names.map(name=>loader.loadAsync(`./assets/texturas/${name}.jpg`)));
 const anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 maps.forEach((map,i)=>{map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=anisotropy;if(i<4)map.colorSpace=THREE.SRGBColorSpace;});
 const [grass,wild,gravel,concrete,grassNormal]=maps;
 return {grass,wild,gravel,concrete,grassNormal,dispose(){maps.forEach(m=>m.dispose());}};
}

// Signed distance from every terrain texel to the nearest paved or built band
// (track, pit lane, garages, grandstands; metres), plus the lateral offset used
// for mowing stripes. Rendering and scenery placement share it.
export function buildTrackField(data,resolution=1024){
 const t=data.terrain,x0=t.x0,y0=t.y0,width=(t.nx-1)*t.step,height=(t.ny-1)*t.step;
 const nx=resolution,ny=Math.max(2,Math.round(resolution*height/width)),sx=width/nx,sy=height/ny;
 const edge=new Float32Array(nx*ny).fill(FIELD_RANGE),side=new Float32Array(nx*ny).fill(FIELD_RANGE),water=new Float32Array(nx*ny),inside=new Uint8Array(nx*ny),paint=new Float32Array(nx*ny);
 const a=data.samples,n=a.length;
 for(const band of sceneryBands(data)){
  const b=band.points,count=b.length;
  for(let i=0;i<(band.closed?count:count-1);i++){
   // Band points are [x, y, left x, left y, lo, hi]: measure from its middle line.
   const p=b[i],q=b[(i+1)%count],pc=(p[4]+p[5])/2,qc=(q[4]+q[5])/2,ph=(p[5]-p[4])/2,qh=(q[5]-q[4])/2;
   const ax=p[0]+p[2]*pc,ay=p[1]+p[3]*pc,bx=q[0]+q[2]*qc,by=q[1]+q[3]*qc,dx=bx-ax,dy=by-ay,len2=Math.max(1e-6,dx*dx+dy*dy),reach=FIELD_RANGE+Math.max(ph,qh);
   const i0=Math.max(0,Math.floor((Math.min(ax,bx)-reach-x0)/sx)),i1=Math.min(nx-1,Math.ceil((Math.max(ax,bx)+reach-x0)/sx));
   const j0=Math.max(0,Math.floor((Math.min(ay,by)-reach-y0)/sy)),j1=Math.min(ny-1,Math.ceil((Math.max(ay,by)+reach-y0)/sy));
   for(let j=j0;j<=j1;j++){
    const y=y0+(j+.5)*sy,row=j*nx;
    for(let k=i0;k<=i1;k++){
     const x=x0+(k+.5)*sx;let u=((x-ax)*dx+(y-ay)*dy)/len2;u=u<0?0:u>1?1:u;
     const ex=x-ax-u*dx,ey=y-ay-u*dy,e=Math.sqrt(ex*ex+ey*ey)-(ph+(qh-ph)*u),index=row+k;
     if(e<edge[index]){edge[index]=e;side[index]=ex*(p[2]+(q[2]-p[2])*u)+ey*(p[3]+(q[3]-p[3])*u)+pc+(qc-pc)*u;}
    }
   }
  }
 }
 // Scanline fill of the closed centre line: the infield never receives houses.
 for(let j=0;j<ny;j++){
  const y=y0+(j+.5)*sy,cuts=[];
  for(let i=0;i<n;i++){const p=a[i],q=a[(i+1)%n];if((p[2]>y)!==(q[2]>y))cuts.push(p[1]+(y-p[2])/(q[2]-p[2])*(q[1]-p[1]));}
  cuts.sort((u,v)=>u-v);
  for(let c=0;c+1<cuts.length;c+=2){const k0=Math.max(0,Math.ceil((cuts[c]-x0)/sx-.5)),k1=Math.min(nx-1,Math.floor((cuts[c+1]-x0)/sx-.5));for(let k=k0;k<=k1;k++)inside[j*nx+k]=1;}
 }
 const texture=new THREE.DataTexture(new Uint16Array(nx*ny*4),nx,ny,THREE.RGBAFormat,THREE.HalfFloatType);
 texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.generateMipmaps=false;
 // Alpha: the infield flag (CPU only) plus half the painted run-off reaching the kerb (markRunoffPaint),
 // so the shader reads the paint as fract(a)*2 (the flag only changes under the road).
 const field={nx,ny,x0,y0,width,height,sx,sy,edge,side,water,inside,paint,texture,
  cell(x,y){const k=Math.floor((x-x0)/sx),j=Math.floor((y-y0)/sy);return k<0||j<0||k>=nx||j>=ny?-1:j*nx+k;},
  upload(){const out=texture.image.data,h=THREE.DataUtils.toHalfFloat;for(let i=0;i<nx*ny;i++){out[i*4]=h(edge[i]);out[i*4+1]=h(side[i]);out[i*4+2]=h(water[i]);out[i*4+3]=h(inside[i]+Math.min(paint[i],1)*.49);}texture.needsUpdate=true;}
 };
 field.upload();
 return field;
}

// CPU copy of the orthophoto at ~1.15 m per pixel, with its UV projection
// fitted from the terrain mesh that carries it.
export function readOrtho(texture,geometry){
 const image=texture?.image;if(!image?.width||!geometry?.attributes.uv)return null;
 const w=Math.min(1400,image.width),h=Math.round(image.height*w/image.width);
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,w,h);
 const pixels=context.getImageData(0,0,w,h).data;canvas.width=canvas.height=1;
 const pos=geometry.attributes.position,uv=geometry.attributes.uv;let a=0,b=0,c=0,d=0;
 for(let i=1;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);if(x<pos.getX(a))a=i;if(x>pos.getX(b))b=i;if(z<pos.getZ(c))c=i;if(z>pos.getZ(d))d=i;}
 const ku=(uv.getX(b)-uv.getX(a))/(pos.getX(b)-pos.getX(a)),bu=uv.getX(a)-ku*pos.getX(a);
 const kv=(uv.getY(d)-uv.getY(c))/(pos.getZ(d)-pos.getZ(c)),bv=uv.getY(c)-kv*pos.getZ(c);
 const lum=new Float32Array(w*h);for(let i=0;i<w*h;i++)lum[i]=(.299*pixels[i*4]+.587*pixels[i*4+1]+.114*pixels[i*4+2])/255;
 // Local luminance variation separates flat water from textured canopies.
 const sum=new Float64Array((w+1)*(h+1)),sq=new Float64Array((w+1)*(h+1));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=lum[y*w+x],i=(y+1)*(w+1)+x+1;sum[i]=v+sum[i-1]+sum[i-w-1]-sum[i-w-2];sq[i]=v*v+sq[i-1]+sq[i-w-1]-sq[i-w-2];}
 const rough=new Float32Array(w*h),r=2;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const xa=Math.max(0,x-r),xb=Math.min(w,x+r+1),ya=Math.max(0,y-r),yb=Math.min(h,y+r+1),count=(xb-xa)*(yb-ya);
  const box=s=>s[yb*(w+1)+xb]-s[ya*(w+1)+xb]-s[yb*(w+1)+xa]+s[ya*(w+1)+xa],mean=box(sum)/count;
  rough[y*w+x]=Math.sqrt(Math.max(0,box(sq)/count-mean*mean));
 }
 return {w,h,pixels,lum,rough,
  index(x,y){const u=ku*x+bu,v=kv*(-y)+bv;return u<0||u>=1||v<0||v>=1?-1:Math.floor(v*h)*w+Math.floor(u*w);}};
}

export function landCover(ortho,i){
 const p=ortho.pixels,r=p[i*4]/255,g=p[i*4+1]/255,b=p[i*4+2]/255,lum=ortho.lum[i],mx=Math.max(r,g,b),mn=Math.min(r,g,b),sat=(mx-mn)/Math.max(mx,.001);
 return {lum,r,g,b,rough:ortho.rough[i],
  tree:smooth(0,.05,g-b)*smooth(-.06,-.01,g-r)*(1-smooth(.3,.42,lum)),
  roof:smooth(.07,.14,r-g)*smooth(.03,.1,g-b)*smooth(.3,.45,r),
  paved:(1-smooth(.1,.2,sat))*smooth(.35,.5,lum),
  // Painted run-off (blue-green), as the terrain shader reads it (paintM).
  paint:smooth(.05,.12,b-r)*smooth(.05,.12,g-r)*smooth(.3,.45,lum),
  water:(1-smooth(.13,.19,lum))*(1-smooth(.012,.03,ortho.rough[i]))};
}
// Where tyres off the track throw dirt (tyre-smoke.js soft): not on the photo's grey paving, nor on the
// painted run-off the terrain draws as teal asphalt (field.paint past the shader's .5 line; too saturated
// to read as paved).
export function looseGround(field,ortho){
 return (x,y)=>{const c=field?.cell(x,y)??-1;if(c>=0&&field.paint[c]>.5)return false;const i=ortho.index(x,y);return i<0||landCover(ortho,i).paved<.35;};
}

// Painted run-off (field.paint; the terrain shader and the verge grass both read it). It is paved from
// the track up to the barrier where there is one (the real barrier stands further out, so the photo's
// paint runs on behind it into the grass), 16 m out where there is none; blue-green further away is
// shade or water, not paint. Near the track the thin kerb tints the metre or two beside it in the
// photograph, which then read as grass: a cell takes the paint found up to 4.5 m further out.
const RUNOFF_OPEN=16;
function markRunoffPaint(field,ortho,data){
 const {nx,ny,sx,sy,x0,y0,edge,paint}=field,a=data.samples,n=a.length,L=data.meta.reconstructed_xy_m,step=Math.min(sx,sy)*.6;
 // How far out from the road edge each cell may be painted (0: not at all).
 const reach=new Float32Array(nx*ny);
 for(const side of [-1,1])for(let i=0;i<n;i++){
  const p=a[i],q=a[(i+1)%n],len=((i+1<n?q[0]:L)-p[0])||1;
  for(let f=0;f<1;f+=Math.min(1,step/len)){
   const s=p[0]+f*len,lerp=k=>p[k]+(q[k]-p[k])*f,limit=guardrailPresent(data,s,side)?guardrailClearance(data,s,side)+.3:RUNOFF_OPEN;
   const ux=-lerp(8)*side,uy=lerp(7)*side,half=lerp(4)/2,cx=lerp(1),cy=lerp(2);
   for(let d=-.5;d<=limit+Math.max(sx,sy)*1.5;d+=step){const c=field.cell(cx+ux*(half+d),cy+uy*(half+d));if(c>=0)reach[c]=Math.max(reach[c],limit);}
  }
 }
 let marked=0;
 for(let j=1;j<ny-1;j++)for(let k=1;k<nx-1;k++){
  const i=j*nx+k,e=edge[i];if(!reach[i]||e<-1)continue;
  // Outward: up the distance to the track.
  let gx=(edge[i+1]-edge[i-1])/(2*sx),gy=(edge[i+nx]-edge[i-nx])/(2*sy);const g=Math.hypot(gx,gy);if(g<1e-3)continue;gx/=g;gy/=g;
  const x=x0+(k+.5)*sx,y=y0+(j+.5)*sy;let best=0;
  for(const r of [0,1.5,3,4.5]){if(r&&(e>6||e+r>reach[i]))break;const o=ortho.index(x+gx*r,y+gy*r);if(o>=0)best=Math.max(best,landCover(ortho,o).paint);}
  if(best>.3)paint[i]=1;
 }
 // One pixel of the photo decides a cell: close the pinholes and drop the specks it leaves. Then the
 // barrier side becomes a ramp across the cell (its share inside the reach), so the shader's .5 line
 // runs smooth along the barrier instead of beading round the cells.
 const was=paint.slice(),cell=Math.max(sx,sy);
 for(let j=1;j<ny-1;j++)for(let k=1;k<nx-1;k++){
  const i=j*nx+k;if(!reach[i])continue;
  const around=was[i-1]+was[i+1]+was[i-nx]+was[i+nx];
  const on=was[i]?around>1:around>=3;
  paint[i]=on?clamp((reach[i]-edge[i])/cell+.5,0,1):0;marked+=paint[i]>.5;
 }
 return marked;
}

// Floating plants and glare leave dry specks inside a lake: close them, but keep
// real islands (holes larger than maxCells).
function fillHoles(cells,nx,maxCells){
 let k0=Infinity,k1=-1,j0=Infinity,j1=-1;
 for(const c of cells){const k=c%nx,j=(c-k)/nx;k0=Math.min(k0,k);k1=Math.max(k1,k);j0=Math.min(j0,j);j1=Math.max(j1,j);}
 const w=k1-k0+3,h=j1-j0+3,grid=new Uint8Array(w*h),stack=[];   // 1 water, 2 open land, 3 enclosed
 for(const c of cells){const k=c%nx,j=(c-k)/nx;grid[(j-j0+1)*w+k-k0+1]=1;}
 const flood=(start,mark,visit)=>{grid[start]=mark;stack.push(start);while(stack.length){const i=stack.pop(),x=i%w;visit?.(i);
  for(const n of [x>0?i-1:-1,x<w-1?i+1:-1,i-w,i+w])if(n>=0&&n<w*h&&grid[n]===0){grid[n]=mark;stack.push(n);}}};
 flood(0,2);   // the padded border reaches all land around the lake
 for(let i=0;i<w*h;i++){if(grid[i])continue;const hole=[];flood(i,3,q=>hole.push(q));
  if(hole.length<=maxCells)for(const q of hole){const x=q%w,y=(q-x)/w;cells.push((y-1+j0)*nx+x-1+k0);}}
 return cells;
}

// Lakes and rivers: dark, smooth, flat and large. Each body gets a level surface.
function findWater(field,ortho,data){
 const {nx,ny,x0,y0,sx,sy}=field,mask=new Uint8Array(nx*ny),bodies=[];
 for(let j=1;j<ny-1;j++)for(let k=1;k<nx-1;k++){
  const x=x0+(k+.5)*sx,y=y0+(j+.5)*sy,i=ortho.index(x,y);if(i<0||field.edge[j*nx+k]<6||ortho.lum[i]>.19||ortho.rough[i]>.03)continue;
  const slope=Math.hypot(terrainHeight(data,x+3,y)-terrainHeight(data,x-3,y),terrainHeight(data,x,y+3)-terrainHeight(data,x,y-3))/6;
  if(slope<.06&&landCover(ortho,i).water>.5)mask[j*nx+k]=1;
 }
 const seen=new Uint8Array(nx*ny),stack=[];
 for(let start=0;start<nx*ny;start++){
  if(!mask[start]||seen[start])continue;
  const cells=[];stack.push(start);seen[start]=1;
  while(stack.length){const c=stack.pop();cells.push(c);const k=c%nx,j=(c-k)/nx;
   for(const d of [c-1,c+1,c-nx,c+nx]){if(d<0||d>=nx*ny||seen[d]||!mask[d])continue;if((d===c-1&&k===0)||(d===c+1&&k===nx-1))continue;seen[d]=1;stack.push(d);}}
  if(cells.length*sx*sy<2500)continue;
  const heights=cells.map(c=>{const k=c%nx,j=(c-k)/nx;return terrainHeight(data,x0+(k+.5)*sx,y0+(j+.5)*sy);}).sort((u,v)=>u-v);
  bodies.push({level:heights[Math.floor(heights.length*.6)]+.12,cells:fillHoles(cells,nx,Math.round(600/(sx*sy)))});
 }
 for(const body of bodies)for(const c of body.cells)field.water[c]=1;
 return bodies;
}

// Whitewater around the car (lake-waves.js) breaks into lace: bubbles and streaks that
// fill in as the foam thickens.
const waveWhitewater=`
float waveHash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float waveNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(waveHash(i),waveHash(i+vec2(1,0)),f.x),mix(waveHash(i+vec2(0,1)),waveHash(i+vec2(1,1)),f.x),f.y);}
float waveWhite(vec2 p,float foam){
 float n=waveNoise(p*1.7)*.45+waveNoise(p*4.9+3.7)*.33+waveNoise(p*12.3-1.3)*.22,cover=foam*.72;
 return smoothstep(1.0-cover,1.12-cover,n)*min(1.0,foam*2.0)*.9;
}`;
// Stirred-up bed: brown and opaque.
const WAVE_MUD='vec3(.13,.1,.06)';

// Plain lake water; `patch` makes the mesh that follows the car, lifted by the waves.
function simpleWaterMaterial(shore,waves,patch){
 const material=new THREE.MeshStandardMaterial({name:patch?'Agua_lago_ondas':'Agua_lago',color:0x0d1a17,roughness:.06,metalness:0,envMapIntensity:1.2,polygonOffset:true,polygonOffsetFactor:-1,alphaTest:.5,alphaToCoverage:true});
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,waves.uniforms,{landTime:shared.time,shoreMap:{value:shore.texture},shoreBounds:{value:shore.bounds}});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWaterWorld;'+waveVertexCommon).replace('#include <begin_vertex>','#include <begin_vertex>'+waveVertex+'\nvWaterWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform float landTime;uniform sampler2D shoreMap;uniform vec4 shoreBounds;varying vec3 vWaterWorld;${waveFragmentCommon}${waveWhitewater}
float waterWave(vec2 p){return sin(p.x)*sin(p.y*.8+p.x*.3);}`).replace('#include <color_fragment>',`#include <color_fragment>
${waveClip('vWaterWorld.xz')}
// The water ends on the smooth shoreline, not on the grid cells it was built from.
float waterShore=texture2D(shoreMap,vec2((vWaterWorld.x-shoreBounds.x)/shoreBounds.z,(-vWaterWorld.z-shoreBounds.y)/shoreBounds.w)).r;
diffuseColor.a=smoothstep(-.3,.3,waterShore);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.1,.095,.07),(1.0-smoothstep(.0,2.8,waterShore))*.5);
vec2 waveSlope=vec2(0.0);
#ifdef LAKE_WAVES
waveSlope=vWaveSlope;
diffuseColor.rgb=mix(diffuseColor.rgb,${WAVE_MUD},vWave.y*.75);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.5,.55,.52),waveWhite(vWaterWorld.xz,vWave.x)*.85);
#endif`).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
vec2 wp=vWaterWorld.xz*.35;float t=landTime*.9;
vec2 ripple=vec2(waterWave(wp+vec2(t,.3*t))-waterWave(wp*1.7-vec2(.6*t,t)),waterWave(wp.yx*1.3+t)-waterWave(wp*.7+vec2(t*.4,-t)))*.035-waveSlope;
normal=normalize(normal+(viewMatrix*vec4(ripple.x,0.0,ripple.y,0.0)).xyz);`);
 };
 if(patch)material.defines={LAKE_WAVES:''};
 material.customProgramCacheKey=()=>'lake-simple-v4'+(patch?'-waves':'');
 // (the sky it mirrors at its full colour: sky.js SKY_REFLECTION)
 return skyMirror(material);
}

function waterMesh(field,bodies,waves,shore){
 const positions=[],indices=[],{nx,x0,y0,sx,sy}=field;
 for(const body of bodies){
  const rows=new Map();
  for(const c of body.cells){const k=c%nx,j=(c-k)/nx;if(!rows.has(j))rows.set(j,[]);rows.get(j).push(k);}
  for(const [j,ks] of rows){
   ks.sort((u,v)=>u-v);let start=ks[0],last=ks[0];
   const quad=(a,b)=>{const base=positions.length/3,xa=x0+(a-1.5)*sx,xb=x0+(b+2.5)*sx,ya=y0+(j-1)*sy,yb=y0+(j+2)*sy;positions.push(xa,body.level,-ya,xb,body.level,-ya,xb,body.level,-yb,xa,body.level,-yb);indices.push(base,base+1,base+2,base,base+2,base+3);};
   for(let i=1;i<=ks.length;i++){if(i<ks.length&&ks[i]===last+1){last=ks[i];continue;}quad(start,last);if(i<ks.length){start=last=ks[i];}}
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const mesh=new THREE.Mesh(geometry,simpleWaterMaterial(shore,waves,false));mesh.name='Lagos_e_rio';mesh.receiveShadow=true;return mesh;
}

// Signed distance to the shore in metres (positive over water), so the outline
// is a smooth curve instead of the field's staircase of cells. Every cell also
// knows its nearest lake, for the lake bed, the scenery and the car in the water.
const SHORE_RANGE=24;
function shoreField(field,bodies){
 const {nx,ny,x0,y0,sx,sy,water}=field,pad=Math.ceil(SHORE_RANGE/Math.min(sx,sy))+2;
 let k0=nx,k1=0,j0=ny,j1=0;
 for(const body of bodies)for(const c of body.cells){const k=c%nx,j=(c-k)/nx;k0=Math.min(k0,k);k1=Math.max(k1,k);j0=Math.min(j0,j);j1=Math.max(j1,j);}
 k0=Math.max(0,k0-pad);k1=Math.min(nx-1,k1+pad);j0=Math.max(0,j0-pad);j1=Math.min(ny-1,j1+pad);
 const w=k1-k0+1,h=j1-j0+1,diagonal=Math.hypot(sx,sy),half=(sx+sy)/4,owner=new Int16Array(w*h).fill(-1);
 bodies.forEach((body,b)=>{for(const c of body.cells){const k=c%nx-k0,j=(c-c%nx)/nx-j0;owner[j*w+k]=b;}});
 // Two-pass chamfer distance from every cell to the nearest cell of the other kind.
 const chamfer=(wet,nearest=null)=>{
  const d=new Float32Array(w*h);
  for(let j=0;j<h;j++)for(let k=0;k<w;k++)d[j*w+k]=(water[(j+j0)*nx+k+k0]>.5)===wet?1e6:0;
  const relax=(k,j,dk,dj,cost)=>{const kk=k+dk,jj=j+dj;if(kk<0||jj<0||kk>=w||jj>=h)return;const n=jj*w+kk,v=d[n]+cost,i=j*w+k;if(v<d[i]){d[i]=v;if(nearest)nearest[i]=nearest[n];}};
  for(let j=0;j<h;j++)for(let k=0;k<w;k++){relax(k,j,-1,0,sx);relax(k,j,0,-1,sy);relax(k,j,-1,-1,diagonal);relax(k,j,1,-1,diagonal);}
  for(let j=h-1;j>=0;j--)for(let k=w-1;k>=0;k--){relax(k,j,1,0,sx);relax(k,j,0,1,sy);relax(k,j,1,1,diagonal);relax(k,j,-1,1,diagonal);}
  return d;
 };
 const nearest=Int16Array.from(owner),toDry=chamfer(true),toWet=chamfer(false,nearest);
 const sdf=new Float32Array(w*h),out=new Uint16Array(w*h),toHalf=THREE.DataUtils.toHalfFloat;
 for(let j=0;j<h;j++)for(let k=0;k<w;k++){const i=j*w+k,wet=water[(j+j0)*nx+k+k0]>.5;sdf[i]=clamp(wet?toDry[i]-half:half-toWet[i],-SHORE_RANGE,SHORE_RANGE);out[i]=toHalf(sdf[i]);}
 // The drawn shoreline uses a blurred copy: the field follows the grid cells and its zero line
 // would show their steps. Lake contact and the lake beds keep the exact field below.
 let soft=Float32Array.from(sdf);
 for(let pass=0;pass<3;pass++){const next=new Float32Array(w*h);
  for(let j=0;j<h;j++)for(let k=0;k<w;k++){let sum=0,n=0;for(let dj=-1;dj<=1;dj++)for(let dk=-1;dk<=1;dk++){const kk=k+dk,jj=j+dj;if(kk<0||jj<0||kk>=w||jj>=h)continue;sum+=soft[jj*w+kk];n++;}next[j*w+k]=sum/n;}
  soft=next;}
 for(let i=0;i<w*h;i++)out[i]=toHalf(soft[i]);
 const texture=new THREE.DataTexture(out,w,h,THREE.RedFormat,THREE.HalfFloatType);
 texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.generateMipmaps=false;texture.needsUpdate=true;
 const bx=x0+k0*sx,by=y0+j0*sy;
 return {texture,bounds:new THREE.Vector4(bx,by,w*sx,h*sy),
  // Same bilinear lookup as the shader (texel centres); far from every lake it is -SHORE_RANGE.
  distance(x,y){
   const fx=(x-bx)/sx-.5,fy=(y-by)/sy-.5;if(fx<0||fy<0||fx>w-1||fy>h-1)return -SHORE_RANGE;
   const i=Math.min(w-2,Math.floor(fx)),j=Math.min(h-2,Math.floor(fy)),u=fx-i,v=fy-j,a=j*w+i;
   return (sdf[a]*(1-u)+sdf[a+1]*u)*(1-v)+(sdf[a+w]*(1-u)+sdf[a+w+1]*u)*v;
  },
  body(x,y){const k=Math.floor((x-bx)/sx),j=Math.floor((y-by)/sy);return k<0||j<0||k>=w||j>=h?null:bodies[nearest[j*w+k]]??null;}};
}

// The LiDAR sees the water surface, not the bed: dig a basin under every lake,
// shallow at the bank and down to LAKE_DEPTH, on any height grid shaped like
// data.terrain (the physics ground and the visible terrain mesh).
const LAKE_DEPTH=.85;
export const lakeBedDepth=shore=>Math.min(LAKE_DEPTH,.2+.1*shore);
function digLakeBeds(t,heights,shore){
 const {x,y,z,w}=shore.bounds,i0=Math.max(0,Math.floor((x-t.x0)/t.step)),i1=Math.min(t.nx-1,Math.ceil((x+z-t.x0)/t.step));
 const j0=Math.max(0,Math.floor((y-t.y0)/t.step)),j1=Math.min(t.ny-1,Math.ceil((y+w-t.y0)/t.step));let dug=0;
 for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
  const px=t.x0+i*t.step,py=t.y0+j*t.step,s=shore.distance(px,py);if(s<=-1.5)continue;
  const body=shore.body(px,py),g=j*t.nx+i;if(!body)continue;
  const bed=body.level-lakeBedDepth(s);if(heights[g]>bed){heights[g]=bed;dug++;}
 }
 return dug;
}

// --- Realistic lakes (opt-in setting) -----------------------------------------

const lakeVertex=['#include <common>','#include <common>\nvarying vec3 vLakeWorld;'+waveVertexCommon,'#include <begin_vertex>','#include <begin_vertex>'+waveVertex+'\nvLakeWorld=(modelMatrix*vec4(transformed,1.0)).xyz;'];
const lakeCommon=`#include <common>
uniform float landTime,planarWeight;uniform vec2 windDir,lakeLens;uniform vec3 lakeBed;uniform vec4 shoreBounds;uniform mat4 reflectionMatrix;uniform sampler2D shoreMap,reflectionMap;
varying vec3 vLakeWorld;${waveFragmentCommon}${waveWhitewater}
float lakeHash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float lakeNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(lakeHash(i),lakeHash(i+vec2(1,0)),f.x),mix(lakeHash(i+vec2(0,1)),lakeHash(i+vec2(1,1)),f.x),f.y);}
// Value noise with its analytic gradient (x: value, yz: d/dp).
vec3 lakeNoiseD(vec2 p){
 vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f),du=6.0*f*(1.0-f);
 float a=lakeHash(i),b=lakeHash(i+vec2(1,0)),c=lakeHash(i+vec2(0,1)),d=lakeHash(i+vec2(1,1)),e=a-b-c+d;
 return vec3(a+(b-a)*u.x+(c-a)*u.y+e*u.x*u.y,du*(vec2(b-a,c-a)+e*u.yx));
}
// Wind chop: a few long swells plus rotated octaves of noise, each drifting
// downwind at the speed of water waves of its size (c=sqrt(g/k)). Returns the
// surface slope; detail smaller than a pixel fades out and becomes roughness.
vec2 lakeSlope(vec2 p,float footprint,float strength,out float lost){
 vec2 g=vec2(0.0);lost=0.0;float wind=atan(windDir.y,windDir.x),wavelength=5.3;
 for(int i=0;i<4;i++){
  float fi=float(i),angle=wind+sin(fi*2.39+.7)*.8,k=6.2831853/wavelength,steep=.018*strength;
  vec2 d=vec2(cos(angle),sin(angle));
  float fade=1.0-smoothstep(wavelength*.15,wavelength*.5,footprint);
  g+=d*steep*fade*cos(dot(d,p)*k-sqrt(9.81*k)*landTime+fi*2.1);
  lost+=steep*steep*.5*(1.0-fade);wavelength*=.63;
 }
 float size=1.7;
 for(int i=0;i<LAKE_OCTAVES;i++){
  float fi=float(i),angle=wind+(mod(fi,2.0)-.5)*.7,turn=fi*1.1+.4,speed=sqrt(9.81*size/6.2831853);
  mat2 r=mat2(cos(turn),sin(turn),-sin(turn),cos(turn));
  vec2 drift=vec2(cos(angle),sin(angle))*speed*landTime;
  vec3 n=lakeNoiseD(r*(p-drift)/size+fi*17.3);
  float steep=.075*strength,fade=1.0-smoothstep(size*.2,size*.7,footprint);
  g+=(n.yz*r)*steep*fade;
  lost+=steep*steep*.25*(1.0-fade);size*=.52;
 }
 return g;
}`;
const lakeSurface=`
vec2 lakeP=vLakeWorld.xz;${waveClip('lakeP')}
// Shoreline from the distance field, roughened so it does not follow the grid.
float lakeShore=texture2D(shoreMap,vec2((lakeP.x-shoreBounds.x)/shoreBounds.z,(-lakeP.y-shoreBounds.y)/shoreBounds.w)).r;
lakeShore+=(lakeNoise(lakeP*.19)-.5)*2.2+(lakeNoise(lakeP*.83)-.5)*.6;
if(lakeShore<-1.2)discard;
// Pixel size on the water, leaning to its long axis: at low angles the ripples
// stay as streaks across the view instead of fading to a flat sheet.
float lakeFootA=length(dFdx(lakeP)),lakeFootB=length(dFdy(lakeP));
float lakeFootprint=pow(min(lakeFootA,lakeFootB),.4)*pow(max(lakeFootA,lakeFootB),.6);
// Gusts sweep the lake: rippled streaks drawn out downwind beside glassy water.
// Water near the banks is sheltered.
vec2 lakeAlong=vec2(dot(lakeP,windDir),dot(lakeP,vec2(-windDir.y,windDir.x)))*vec2(.009,.026)-vec2(landTime*.05,0.0);
lakeAlong+=vec2(lakeNoise(lakeAlong*1.9+5.2),lakeNoise(lakeAlong*1.9-3.7))*.8;
float lakeWind=mix(.22,1.0,smoothstep(.3,.8,lakeNoise(lakeAlong)*.6+lakeNoise(lakeAlong*2.3+9.1)*.4))*mix(.35,1.0,smoothstep(0.0,14.0,lakeShore));
float lakeLost;vec2 lakeGrad=lakeSlope(lakeP,lakeFootprint,lakeWind,lakeLost);
// Around the car: the slope of the waves it pushes and the whitewater it churns.
float lakeFoam=0.0;
#ifdef LAKE_WAVES
lakeGrad+=vWaveSlope;lakeFoam=waveWhite(lakeP,vWave.x)*smoothstep(-1.0,.5,lakeShore);
#endif
vec3 lakeNormal=normalize(vec3(-lakeGrad.x,1.0,-lakeGrad.y));
// Murky urban water over the dug basin (0.2 m at the bank, 0.85 m out in the lake):
// the bed shows only in the first metres, anything sunk in it fades within a few spans.
vec3 lakeView=normalize(cameraPosition-vLakeWorld);
float lakeCosT=sqrt(1.0-(1.0-lakeView.y*lakeView.y)/1.777),lakeDepth=clamp(.2+.1*lakeShore,.02,.85);
float lakeCover=smoothstep(-1.2,1.6,lakeShore),lakeOpacity=lakeCover*(1.0-exp(-lakeDepth*3.0/max(lakeCosT,.15)));
diffuseColor.rgb=mix(lakeBed,diffuse,smoothstep(.2,.9,lakeOpacity));
#ifdef LAKE_WAVES
// Mud the tyres stir off the bed clouds the water behind the car.
diffuseColor.rgb=mix(diffuseColor.rgb,${WAVE_MUD},vWave.y*.75);lakeOpacity=max(lakeOpacity,vWave.y*.85*lakeCover);
#endif
// Churned water behind the car: white, rough and opaque.
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.5,.55,.52),lakeFoam*.85);lakeOpacity=max(lakeOpacity,lakeFoam*.9*lakeCover);
`;
const lakeReflection=`#include <lights_fragment_maps>
#if defined( RE_IndirectSpecular )
{
 // Planar mirror of the scene. Ripples bend the reflected ray; the image shifts by that
 // angle on screen, which smears reflections downward at low angles as on a real lake.
 // The sky probe fills in where the mirror has no data.
 vec4 lakeClip=reflectionMatrix*vec4(vLakeWorld,1.0);
 vec3 lakeEye=normalize(vViewPosition),lakeFlat=normalize((viewMatrix*vec4(0.0,1.0,0.0,0.0)).xyz);
 vec3 lakeRay=reflect(-lakeEye,normal),lakeMirrorRay=reflect(-lakeEye,lakeFlat);
 vec2 lakeUv=lakeClip.xy/lakeClip.w+vec2(lakeRay.x-lakeMirrorRay.x,lakeMirrorRay.y-lakeRay.y)*lakeLens*.5;
 vec2 lakeEdge=smoothstep(vec2(0.0),vec2(.04),lakeUv)*smoothstep(vec2(0.0),vec2(.04),1.0-lakeUv);
 float lakeMix=planarWeight*lakeEdge.x*lakeEdge.y*step(0.0,lakeClip.w);
 #ifdef LAKE_WAVES
 // Steep faces of the car's waves would pick random spots off the mirror: they take the sky probe.
 lakeMix*=1.0-smoothstep(.12,.35,length(vWaveSlope));
 #endif
 if(lakeMix>0.0)radiance=mix(radiance,texture2D(reflectionMap,lakeUv).rgb,lakeMix);
}
#endif`;
// Premultiplied output: the water colour fades over the bank, the reflection stays.
const lakeOutput=`gl_FragColor=vec4(totalDiffuse*lakeOpacity+(totalSpecular+totalEmissiveRadiance)*lakeCover,lakeOpacity);`;
const lakeFog=THREE.ShaderChunk.fog_fragment.replace('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );','gl_FragColor.rgb=gl_FragColor.rgb*(1.0-fogFactor)+fogColor*fogFactor*gl_FragColor.a;');

function lakeMaterial(uniforms,mobile,patch=false){
 const material=new THREE.MeshPhysicalMaterial({name:patch?'Agua_lago_realista_ondas':'Agua_lago_realista',color:new THREE.Color(.018,.034,.026),roughness:.03,metalness:0,ior:1.333,transparent:true,depthWrite:true,
  blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneMinusSrcAlphaFactor});
 const planarWeight={value:0};
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms,{planarWeight});
  shader.vertexShader=shader.vertexShader.replace(lakeVertex[0],lakeVertex[1]).replace(lakeVertex[2],lakeVertex[3]);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',lakeCommon).replace('#include <color_fragment>',lakeSurface)
   .replace('#include <roughnessmap_fragment>','float roughnessFactor=sqrt(sqrt(pow(roughness,4.0)+2.0*lakeLost))+lakeFoam*.45;')
   .replace('#include <normal_fragment_maps>','normal=normalize((viewMatrix*vec4(lakeNormal,0.0)).xyz);')
   .replace('#include <lights_fragment_maps>',lakeReflection).replace('#include <opaque_fragment>',lakeOutput).replace('#include <fog_fragment>',lakeFog);
 };
 material.defines={LAKE_OCTAVES:mobile?4:6,...(patch?{LAKE_WAVES:''}:{})};
 material.customProgramCacheKey=()=>'lake-realistic-v3'+(mobile?'-mobile':'')+(patch?'-waves':'');
 material.userData.planarWeight=planarWeight;
 // (the sky it mirrors past the planar picture at its full colour: sky.js SKY_REFLECTION)
 return skyMirror(material);
}

// One flat surface per body over its bounding box; the shore field cuts the outline.
// A single planar reflection per frame, at the level of the nearest visible body.
// Around the car a denser patch, lifted by the waves, takes over from the flat surface.
function realisticLakes(field,bodies,shore,waves,{mobile=false}={}){
 const root=new THREE.Group();root.name='Lagos_realistas';
 const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true});
 target.texture.name='Reflexo_lagos';
 const reflectionMatrix=new THREE.Matrix4(),lens=new THREE.Vector2(1,1),uniforms={...waves.uniforms,landTime:shared.time,windDir:{value:new THREE.Vector2(.82,.57)},lakeLens:{value:lens},lakeBed:{value:new THREE.Color(.05,.045,.028)},
  shoreBounds:{value:shore.bounds},shoreMap:{value:shore.texture},reflectionMap:{value:target.texture},reflectionMatrix:{value:reflectionMatrix}};
 const {nx,x0,y0,sx,sy}=field,margin=4,lakes=[];
 for(const body of bodies){
  let k0=nx,k1=0,j0=Infinity,j1=0;
  for(const c of body.cells){const k=c%nx,j=(c-k)/nx;k0=Math.min(k0,k);k1=Math.max(k1,k);j0=Math.min(j0,j);j1=Math.max(j1,j);}
  const xa=x0+k0*sx-margin,xb=x0+(k1+1)*sx+margin,ya=y0+j0*sy-margin,yb=y0+(j1+1)*sy+margin;
  const geometry=new THREE.PlaneGeometry(xb-xa,yb-ya).rotateX(-Math.PI/2).translate((xa+xb)/2,body.level,-(ya+yb)/2);
  const material=lakeMaterial(uniforms,mobile),mesh=new THREE.Mesh(geometry,material);
  mesh.name='Lago_realista';mesh.receiveShadow=true;mesh.renderOrder=1;root.add(mesh);
  geometry.computeBoundingBox();lakes.push({mesh,level:body.level,box:geometry.boundingBox,weight:material.userData.planarWeight});
 }
 const patchMaterial=lakeMaterial(uniforms,mobile,true),patch=new THREE.Mesh(waves.patchGeometry(),patchMaterial),patchWeight=patchMaterial.userData.planarWeight;
 patch.name='Lago_realista_ondas';patch.receiveShadow=true;patch.renderOrder=1;patch.visible=false;root.add(patch);
 const virtual=new THREE.PerspectiveCamera(),frustum=new THREE.Frustum(),matrix=new THREE.Matrix4(),size=new THREE.Vector2();
 const eye=new THREE.Vector3(),look=new THREE.Vector3(),normal=new THREE.Vector3(0,1,0),plane=new THREE.Plane(),clip=new THREE.Vector4(),q=new THREE.Vector4(),point=new THREE.Vector3();
 const scale=mobile?.35:.5,state={frame:0,rendered:-1,reflections:0,level:null};
 function reflect(renderer,scene,camera){
  // Rear-view mirror and other off-screen passes use the sky probe only; the film look's
  // main view (cinematic.js marks it isMainView) counts as the screen.
  const current=renderer.getRenderTarget();
  if(current&&!current.isMainView){for(const lake of lakes)lake.weight.value=0;patchWeight.value=0;state.rendered=-1;return;}
  if(state.rendered===state.frame)return;state.rendered=state.frame;state.level=null;
  for(const lake of lakes)lake.weight.value=0;patchWeight.value=0;
  matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
  eye.setFromMatrixPosition(camera.matrixWorld);
  let best=null,bestDistance=1600;
  for(const lake of lakes){if(eye.y<=lake.level+.05||!frustum.intersectsBox(lake.box))continue;const d=lake.box.distanceToPoint(eye);if(d<bestDistance){best=lake;bestDistance=d;}}
  if(!best)return;
  const level=best.level;state.level=level;
  // Mirror the camera through the water plane (same maths as three's Reflector).
  look.set(0,0,-1).applyQuaternion(camera.getWorldQuaternion(virtual.quaternion)).add(eye);
  virtual.position.set(eye.x,2*level-eye.y,eye.z);
  virtual.up.set(0,1,0).applyQuaternion(camera.getWorldQuaternion(virtual.quaternion));virtual.up.y*=-1;
  virtual.lookAt(look.x,2*level-look.y,look.z);virtual.near=camera.near;virtual.far=camera.far;virtual.layers.mask=camera.layers.mask;
  virtual.updateMatrixWorld();virtual.projectionMatrix.copy(camera.projectionMatrix);virtual.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
  lens.set(camera.projectionMatrix.elements[0],camera.projectionMatrix.elements[5]);
  reflectionMatrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1).multiply(virtual.projectionMatrix).multiply(virtual.matrixWorldInverse);
  // Oblique near plane at the water surface keeps the lake bed out of the mirror.
  plane.setFromNormalAndCoplanarPoint(normal,point.set(0,level,0)).applyMatrix4(virtual.matrixWorldInverse);
  clip.set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
  const p=virtual.projectionMatrix.elements;
  q.set((Math.sign(clip.x)+p[8])/p[0],(Math.sign(clip.y)+p[9])/p[5],-1,(1+p[10])/p[14]);
  clip.multiplyScalar(2/clip.dot(q));p[2]=clip.x;p[6]=clip.y;p[10]=clip.z+1;p[14]=clip.w;
  renderer.getDrawingBufferSize(size);
  const w=Math.max(64,Math.round(size.x*scale)),h=Math.max(64,Math.round(size.y*scale));
  if(target.width!==w||target.height!==h)target.setSize(w,h);
  const shadows=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false;root.visible=false;
  renderer.setRenderTarget(target);renderer.state.buffers.depth.setMask(true);if(!renderer.autoClear)renderer.clear();
  renderer.render(scene,virtual);
  renderer.setRenderTarget(current);renderer.shadowMap.autoUpdate=shadows;root.visible=true;
  state.reflections++;
  for(const lake of lakes)lake.weight.value=1-smooth(.3,1.2,Math.abs(lake.level-level));
  patchWeight.value=1-smooth(.3,1.2,Math.abs(waves.level-level));
 }
 for(const lake of lakes)lake.mesh.onBeforeRender=reflect;
 patch.onBeforeRender=reflect;
 return {root,target,patch,
  update(){state.frame++;},
  info:()=>({bodies:lakes.length,reflections:state.reflections,level:state.level,size:[target.width,target.height]}),
  dispose(){target.dispose();patch.geometry.dispose();patchMaterial.dispose();for(const lake of lakes){lake.mesh.geometry.dispose();lake.mesh.material.dispose();}}};
}

// Shoreline of the current circuit's lakes, for the terrain's wet banks (set by createLandscape).
const terrainShore={shoreMap:{value:null},shoreBounds:{value:new THREE.Vector4(0,0,1,1)},shoreOn:{value:0}};
// cover: land-cover texture (R woods, G paved/built, B bare soil) of circuits built from
// open data; it replaces reading those classes from the colours of an aerial photograph.
// steep: the ground has steep slopes (a plateau's talus and gorges, Chapada dos Sonhos): there the photograph, draped
// from above, smears into streaks and the grass tiles stretch; it is read from a coarser mip and the grass laid from
// the side (LAND_STEEP). The other circuits build without it.
// city (Floripa, city-map.js): the map of a real city's ground (streets, sidewalks, squares, cycleways, lawns, car parks)
// drawn over the land with crisp edges at any distance (LAND_CITY).
export function terrainMaterial(textures,field,{ortho=null,cover=null,mobile=false,steep=false,city=null}={}){
 // Pushed back in depth: far away, roads and kerbs a few centimetres above it still win.
 const material=new THREE.MeshStandardMaterial({name:'Terreno_paisagem_v2',map:ortho,roughness:.95,metalness:0,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:2});
 if(steep)material.defines={...material.defines,LAND_STEEP:''};
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,terrainShore,{coverMap:{value:cover},grassMap:{value:textures.grass},wildMap:{value:textures.wild},concreteMap:{value:textures.concrete},gravelMap:{value:city?.asphalt??textures.gravel},grassNormalMap:{value:textures.grassNormal},
   trackField:{value:field.texture},fieldBounds:{value:new THREE.Vector4(field.x0,field.y0,field.width,field.height)},
   cityMap:{value:city?.texture??null},cityStack:{value:city?.stack??new THREE.Vector2(.5,.5)},cityBounds:{value:city?.bounds??new THREE.Vector4(0,0,1,1)},cityRange:{value:city?.range??4}});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vLandWorld;').replace('#include <begin_vertex>','#include <begin_vertex>\nvLandWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform sampler2D grassMap,wildMap,concreteMap,gravelMap,grassNormalMap,trackField,shoreMap,coverMap;uniform vec4 fieldBounds,shoreBounds;uniform float shoreOn;varying vec3 vLandWorld;
#ifdef LAND_CITY
// One texture for the city (the ground's shader is near the device's limit of texture units, more so at night): both maps
// in it, one above the other (city-map.js stack), and the asphalt on gravelMap's unit (terrainMaterial).
uniform sampler2D cityMap;uniform vec2 cityStack;uniform vec4 cityBounds;uniform float cityRange;
// Coverage of the inside of a signed distance (metres), its edge smoothed over a pixel.
float cityInside(float d){float aa=max(fwidth(d)*.7,.012);return 1.0-smoothstep(-aa,aa,d);}
// Distance to the edge of the nearest cell of a hexagonal grid of blocks size metres across (0 at the joint).
float cityHex(vec2 p,float size){p/=size;const vec2 r=vec2(1.0,1.7320508);vec2 h=r*.5;vec2 a=mod(p,r)-h,b=mod(p-h,r)-h;vec2 g=dot(a,a)<dot(b,b)?a:b;g=abs(g);return (.5-max(dot(g,normalize(r)),g.x))*size;}
#endif
float landHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float landNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(landHash(i),landHash(i+vec2(1,0)),f.x),mix(landHash(i+vec2(0,1)),landHash(i+vec2(1,1)),f.x),f.y);}
// A turn by any angle from two hashes (0..1), no trig. A few fixed turns would not do: two cells with the
// same turn match whole at some offset, and the ground shows the pair.
mat2 landTurn(vec2 h){vec2 r=normalize(h-.5+1e-4);return mat2(r.x,r.y,-r.y,r.x);}
`).replace('#include <map_fragment>',`
vec4 field=texture2D(trackField,vec2((vLandWorld.x-fieldBounds.x)/fieldBounds.z,(-vLandWorld.z-fieldBounds.y)/fieldBounds.w));
float edgeDist=field.r,lateral=field.g,waterBed=field.b,viewDist=length(vLandWorld-cameraPosition);
vec2 w=vLandWorld.xz;
#ifdef LAND_STEEP
vec3 landN=normalize(cross(dFdx(vLandWorld),dFdy(vLandWorld)));float landSteep=smoothstep(.1,.35,1.0-abs(landN.y));
#endif
float macroFar=landNoise(w*.011),macroNear=landNoise(w*.043),macro=macroFar*.6+macroNear*.4;
#ifdef USE_MAP
 vec3 ortho=texture2D(map,vMapUv,1.0).rgb,cs=pow(max(texture2D(map,vMapUv,2.2).rgb,vec3(0.0)),vec3(1.0/2.2));
 #ifdef LAND_STEEP
 ortho=mix(ortho,texture2D(map,vMapUv,4.5).rgb,landSteep);
 #endif
 float lum=dot(cs,vec3(.299,.587,.114)),mx=max(cs.r,max(cs.g,cs.b)),sat=(mx-min(cs.r,min(cs.g,cs.b)))/max(mx,.001);
 float treeM=smoothstep(0.0,.05,cs.g-cs.b)*smoothstep(-.06,-.01,cs.g-cs.r)*(1.0-smoothstep(.3,.42,lum));
 float roofM=smoothstep(.07,.14,cs.r-cs.g)*smoothstep(.03,.1,cs.g-cs.b)*smoothstep(.3,.45,cs.r);
 float pavedM=(1.0-smoothstep(.1,.2,sat))*smoothstep(.35,.5,lum);
 // Painted run-off: the photo's blue-green as markRunoffPaint kept it, between the track and the barrier
 // (behind it and far out it is shade or grass). Its cells are 1.6 m, so near the camera the paint
 // ends at a crisp, gently wavy edge; read from the photo it faded into the grass like a smudge.
 float paintM=fract(field.a)*2.0,paintAa=max(fwidth(paintM),.015);
 if(paintM>.001){
  float paintEdge=paintM+(landNoise(w*.9+4.2)-.5)*.1+(landNoise(w*3.7+1.1)-.5)*.04;
  paintM=mix(paintM,smoothstep(.5-paintAa,.5+paintAa,paintEdge),1.0-smoothstep(120.0,260.0,viewDist));
 }
 vec3 wildTint=clamp(ortho/vec3(.19,.15,.085),vec3(.5),vec3(1.7));
#else
 // Cerrado without photography: broad dry and green patches.
 float lum=.45,treeM=0.0,roofM=0.0,pavedM=0.0,paintM=0.0;
 vec3 ortho=mix(vec3(.16,.15,.07),vec3(.11,.14,.05),macro);
 vec3 wildTint=mix(vec3(1.25,1.05,.8),vec3(.85,1.0,.75),landNoise(w*.006));
#endif
float bareM=0.0;
#ifdef USE_COVER
 vec4 landCover=texture2D(coverMap,vMapUv);
 treeM=landCover.r;roofM=0.0;pavedM=landCover.g;paintM=0.0;bareM=landCover.b;
#endif
treeM*=1.0-waterBed;
#ifdef LAND_SIMPLE
 // Still one lookup, but each tile-sized cell, its edges wavy, takes the grass with its own offset and
 // turn (landTurn), so the 3.3 m tile never lines up; the explicit gradients keep the mip level at the
 // edges. The offsets need hashes of their own: derived from the turn's, they repeat whole cells.
 vec2 cellWobble=(vec2(landNoise(w*.23),landNoise(w*.23+5.2))-.5)*.9;
 vec2 grassUv=w/3.3,grassCell=floor(grassUv+cellWobble);
 vec2 grassPick=vec2(landHash(grassCell+3.1),landHash(grassCell+7.7));mat2 grassRot=landTurn(grassPick);
 vec3 grass=textureGrad(grassMap,grassRot*grassUv+grassPick*7.0,grassRot*dFdx(grassUv),grassRot*dFdy(grassUv)).rgb;
 // The rough ground the same way, on its own 4.2 m cells (the same wobble, turned).
 vec2 wildUv=w/4.2,wildCell=floor(wildUv+vec2(cellWobble.y,-cellWobble.x));
 vec2 wildPick=vec2(landHash(wildCell+5.9),landHash(wildCell+2.3));mat2 wildRot=landTurn(wildPick);
 vec3 wild=textureGrad(wildMap,wildRot*wildUv+wildPick*7.0,wildRot*dFdx(wildUv),wildRot*dFdy(wildUv)).rgb;
 vec3 concrete=texture2D(concreteMap,w/3.9).rgb;
#else
 // Rotated layers keep the blades and stones at a believable scale and break
 // repeating tiles without a huge terrain texture or extra texture fetches.
 vec2 rotated=mat2(.8,-.6,.6,.8)*w;
 float textureBlend=smoothstep(.25,.75,macro);
 vec3 grass=mix(texture2D(grassMap,w/3.3).rgb,texture2D(grassMap,rotated/4.8+.31).rgb,textureBlend);
 vec3 wild=mix(texture2D(wildMap,w/4.2).rgb,texture2D(wildMap,rotated/6.7+.17).rgb,textureBlend);
 vec3 concrete=mix(texture2D(concreteMap,w/3.9).rgb,texture2D(concreteMap,rotated/7.1+.5).rgb,.4);
#endif
#ifdef LAND_STEEP
// On a steep face the grass and the rough ground are laid from the side, as a wall would be.
vec2 landSide=abs(landN.x)>abs(landN.z)?vLandWorld.zy:vLandWorld.xy;
grass=mix(grass,texture2D(grassMap,landSide/3.3).rgb,landSteep);wild=mix(wild,texture2D(wildMap,landSide/4.2).rgb,landSteep);
#endif
// Mown verge beside the asphalt, with stripes parallel to the track. The cut lays the
// blades one way per stripe: seen along the cut a stripe is light, against it dark, so
// the pattern swaps as the view turns, like the verges of a real circuit.
float groomed=1.0-smoothstep(14.0,30.0,edgeDist);
// The mower wandered: stripes about 6 m wide that drift and change width, stronger in some stretches.
// (The broad noises already worked out above, so the drift costs nothing.)
float mowLine=lateral+(macroFar-.5)*5.0,mowStrength=.45+.75*macroNear;
#ifdef LAND_SIMPLE
float sheen=sin(mowLine*1.0472)*.25*mowStrength;
#else
vec2 fieldUV=vec2((vLandWorld.x-fieldBounds.x)/fieldBounds.z,(-vLandWorld.z-fieldBounds.y)/fieldBounds.w);
vec2 across=vec2(texture2D(trackField,fieldUV+vec2(3.0/fieldBounds.z,0.0)).g-lateral,texture2D(trackField,fieldUV+vec2(0.0,3.0/fieldBounds.w)).g-lateral);
vec2 cut=normalize(vec2(-across.y,across.x)+1e-5);cut.y=-cut.y;
float parity=step(.5,fract(mowLine/6.0))*2.0-1.0,stripeEdge=smoothstep(.0,.06,abs(fract(mowLine/6.0)-.5))*smoothstep(.0,.06,.5-abs(fract(mowLine/6.0)-.5));
vec2 mowView=normalize(vLandWorld.xz-cameraPosition.xz+1e-4);
float sheen=dot(mowView,cut)*parity*stripeEdge*min(mowStrength,1.0);
#endif
float dryPatch=smoothstep(.55,.85,landNoise(w*.021+7.3)*.7+landNoise(w*.09)*.3);
// Patches of a few metres too: the macro noise starts at 23 m.
float lawnPatch=landNoise(w*.14+3.9);
vec3 lawn=grass*vec3(.54,.73,.39)*(1.0+.12*sheen)*mix(.84,1.08,macro)*mix(.93,1.06,lawnPatch);
lawn=mix(lawn,lawn*vec3(1.22,1.02,.7),dryPatch*.55);
// Worn, dusty strip where cars run wide off the kerbs: grey-brown soil, not a yellow glow.
float worn=(1.0-smoothstep(.6,3.2,edgeDist))*smoothstep(.35,.75,landNoise(w*.28)+landNoise(w*1.3)*.25);
vec3 soil=wild*vec3(.8,.72,.6);
lawn=mix(lawn,mix(vec3(dot(soil,vec3(.3,.55,.15))),soil,.55),worn*.65);
#ifndef LAND_SIMPLE
 // Small exposed stones in the worn edge, fading before they can shimmer.
 vec3 grit=texture2D(gravelMap,w/1.4).rgb*vec3(.58,.52,.4);
 float closeDetail=1.0-smoothstep(25.0,95.0,viewDist);
 lawn=mix(lawn,grit,worn*closeDetail*.28);
#endif
vec3 ground=wild*vec3(.84,.94,.72)*mix(vec3(1.0),wildTint,.5)*mix(.8,1.1,macro);
ground=mix(ground,wild*vec3(.36,.42,.26),treeM);
ground=mix(ground,lawn,groomed*(1.0-pavedM)*(1.0-paintM));
vec3 asphalt=concrete*vec3(.33,.34,.35);
vec3 paved=mix(concrete*clamp(lum*1.25,.45,1.2),asphalt,groomed);
ground=mix(ground,paved,pavedM*(1.0-paintM));
// Painted run-off (the aerial photo's blue-green): paint long faded to a dull grey-olive, worn back to
// the asphalt in patches, with dark tyre streaks along the track where the cars went wide.
// Only where there is paint: most of the ground has none.
float runoffRubber=0.0;
if(paintM>.001){
 vec3 runoff=mix(vec3(.078,.083,.066),vec3(.066,.066,.064),smoothstep(.45,.75,landNoise(w*.31+1.7)*.65+landNoise(w*1.7)*.35));
 // The aggregate shows through the paint (the concrete lookup's grain, about a third of its contrast).
 runoff*=mix(.9,1.08,landNoise(w*.06+4.4))*mix(.94,1.05,landNoise(w*.9+2.2))*mix(1.0,clamp(dot(concrete,vec3(.3,.55,.15))/.15,.5,1.6),.35);
 runoffRubber=smoothstep(.58,.86,landNoise(vec2(lateral*2.3,0.0)+w*.035))*(1.0-smoothstep(1.5,11.0,edgeDist));
 runoff*=1.0-runoffRubber*.42;
 ground=mix(ground,runoff,paintM);
}
ground=mix(ground,concrete*.55,roofM*(1.0-groomed));
// Exposed soil keeps the colour seen from orbit (the red earth of western Paraná, dry fields).
ground=mix(ground,mix(wild*vec3(.62,.45,.32),ortho*1.3,.6),bareM*(1.0-groomed*.8));
// The aerial photograph reads correctly from afar and hides texture repetition.
ground=mix(ground,ortho*vec3(.9,.94,.86),smoothstep(220.0,1100.0,viewDist)*.75);
float cityCover=0.0,cityRough=.9;
#ifdef LAND_CITY
{
 vec2 cw=vec2(vLandWorld.x,-vLandWorld.z),cuv=(cw-cityBounds.xy)/cityBounds.zw;
 float inCity=step(0.0,cuv.x)*step(cuv.x,1.0)*step(0.0,cuv.y)*step(cuv.y,1.0);
 vec2 cuvA=vec2(cuv.x,cityStack.y+clamp(cuv.y,0.0,1.0)*cityStack.x),cuvB=vec2(cuv.x,clamp(cuv.y,0.0,1.0)*cityStack.x);
 vec3 da=(texture2D(cityMap,cuvA).rgb*2.0-1.0)*cityRange,db=(texture2D(cityMap,cuvB).rgb*2.0-1.0)*cityRange;
 float roadM=cityInside(da.r),walkM=cityInside(da.g),plazaM=cityInside(da.b),cycleM=cityInside(db.r),greenM=cityInside(db.g),parkM=cityInside(db.b);
 float cn=landNoise(cw*.07),cn2=landNoise(cw*.55+3.1),fine=1.0-smoothstep(18.0,60.0,viewDist);
 // The concrete texture lends its grain only (its own colour is a warm gravel): each surface keeps a neutral tone of its own.
 float grain=mix(1.0,dot(concrete,vec3(.3,.55,.15))/max(dot(texture2D(concreteMap,vec2(.5),12.0).rgb,vec3(.3,.55,.15)),.04),.65);
 // The city's asphalt: the race's own asphalt photograph (track-surface.js, a 2 m tile), twice at other scales and turns
 // so the tile never lines up, toned a little greyer: the side streets look like the street the lap is. (Their patches,
 // cracks and manholes lie along each street: city-streets.js.)
 vec2 aRot=mat2(.8,-.6,.6,.8)*cw;
 vec3 aTex=mix(texture2D(gravelMap,cw/2.3).rgb,texture2D(gravelMap,aRot/3.1+.37).rgb,smoothstep(.3,.7,landNoise(cw*.11)));
 vec3 asphaltC=mix(vec3(dot(aTex,vec3(.3,.55,.15))),aTex,.6)*1.85*mix(.86,1.12,cn)*mix(.94,1.05,cn2);
 // The curb: 15 cm of concrete along the road's edge, the gutter's dark line at its foot. Thinner than a pixel far away
 // it fades into the sidewalk instead of shimmering.
 float curbAa=max(fwidth(da.r),.01),curbSeen=clamp(.15/(curbAa*2.5),0.0,1.0);
 float curbM=(1.0-smoothstep(.15-curbAa,.15+curbAa,da.r))*smoothstep(-curbAa,curbAa,da.r)*curbSeen*(1.0-roadM);
 float gutterM=smoothstep(-.18,-.02,da.r)*roadM*curbSeen;
 vec3 curbC=vec3(.4,.395,.38)*grain*mix(.85,1.06,cn2);
 // Sidewalks: each stretch (40 m cells, roughly a block's frontage) its own paving: concrete slabs, the hexagonal
 // blocks of the island's streets or small Portuguese stones, each a little its own grey. The joints fade out before
 // they can shimmer.
 float style=landHash(floor(cw/41.0+.37)),jointAa=max(fwidth(cw.x),fwidth(cw.y));
 vec2 slab=abs(fract(cw+.5)-.5);float slabJoint=1.0-smoothstep(0.0,max(jointAa*1.2,.012),.5-max(slab.x,slab.y));
 float hexJoint=1.0-smoothstep(0.0,max(jointAa*1.2,.008),cityHex(cw,.3));
 float stones=landNoise(cw*14.0)*.6+landNoise(cw*31.0)*.4;
 vec3 walkC=mix(vec3(.3,.295,.285),vec3(.27,.26,.245),landHash(floor(cw/41.0+.37)+2.7))*grain*mix(.88,1.06,cn);
 float joints=style<.45?slabJoint*.35:style<.8?hexJoint*.4:0.0;
 walkC*=1.0-joints*fine;
 walkC=mix(walkC,mix(vec3(.2,.195,.185),vec3(.34,.33,.31),stones),step(.8,style)*fine*.7);
 // Grime along the curb and the building line, where the sweepers do not reach.
 walkC*=mix(.8,1.0,smoothstep(0.0,.9,-da.g))*mix(.86,1.0,smoothstep(0.0,.6,da.r));
 // Squares and the seafront promenade: interlocking concrete pavers (40 x 20 cm, running bond), grey with the odd
 // terracotta band and patches of a different batch; the joints fade out with distance.
 vec2 pv=cw/vec2(.4,.2);pv.x+=step(1.0,mod(floor(pv.y),2.0))*.5;vec2 pvf=abs(fract(pv)-.5);
 float paverJoint=1.0-smoothstep(0.0,max(jointAa*1.2,.006),min((.5-pvf.x)*.4,(.5-pvf.y)*.2));
 float band=step(.5,fract(cw.y/9.0+landNoise(cw*.02)*.6))*step(.62,landHash(floor(cw/23.0)+1.7));
 vec3 plazaC=mix(vec3(.29,.285,.27),vec3(.25,.13,.09),band*.8)*mix(1.0,mix(.9,1.06,landHash(floor(pv)+floor(cw/7.0))),fine)*mix(.92,1.04,cn);
 plazaC*=1.0-paverJoint*.3*fine;
 // Cycleways: red asphalt with a white line along each edge.
 float cycleEdge=smoothstep(-.3,-.24,db.r)*(1.0-smoothstep(-.16,-.1,db.r))*fine;
 vec3 cycleC=mix(vec3(.2,.042,.032)*grain*mix(.85,1.1,cn),vec3(.42,.42,.4),cycleEdge);
 // Lawns of squares, medians and the seafront parks, a little uneven.
 vec3 lawnC=grass*vec3(.34,.5,.24)*mix(.82,1.08,cn)*mix(.92,1.06,cn2);
 // Car parks: asphalt a shade lighter, oil darker where the cars stand.
 vec3 parkC=asphaltC*1.18*mix(1.0,.78,smoothstep(.55,.85,landNoise(cw*.35)));
 // What is left (yards and lots between the buildings, the ground under the odd shed): packed earth and old concrete,
 // weeds in patches. Woods keep their own ground.
 float weeds=smoothstep(.6,.8,landNoise(cw*.09+1.3)*.7+landNoise(cw*.5)*.3);
 vec3 lotC=mix(mix(vec3(.12,.115,.105),vec3(.17,.165,.155),landNoise(cw*.03+4.0))*grain,lawnC*.75,weeds*.45);
 lotC=mix(lotC,wild*vec3(.3,.34,.22),treeM*.8);
 lotC=mix(lotC,ortho*vec3(.9,.94,.86),smoothstep(260.0,1100.0,viewDist)*.5);
 ground=mix(ground,lotC,inCity);
 vec3 city=ground;
 city=mix(city,lawnC,greenM);
 city=mix(city,parkC,parkM);
 city=mix(city,plazaC,plazaM);
 city=mix(city,walkC,walkM);
 city=mix(city,curbC,curbM*max(walkM,max(plazaM,max(greenM,.6))));
 city=mix(city,cycleC,cycleM);
 city=mix(city,asphaltC*mix(1.0,.55,gutterM),roadM);
 cityCover=max(max(roadM,walkM),max(max(plazaM,cycleM),max(greenM,parkM)))*inCity;
 cityRough=mix(mix(.92,.86,clamp(walkM+plazaM,0.0,1.0)),.9,roadM);
 ground=mix(ground,city,inCity);
}
#endif
// Lake bed and a damp, darker bank along the smooth shoreline (the cell flags would show steps).
#ifdef LAND_CITY
float shoreD=-24.0;
#else
float shoreD=shoreOn>.5?texture2D(shoreMap,vec2((vLandWorld.x-shoreBounds.x)/shoreBounds.z,(-vLandWorld.z-shoreBounds.y)/shoreBounds.w)).r:-24.0;
#endif
float lakeBedM=shoreOn>.5?smoothstep(-.4,.5,shoreD):waterBed,bankM=smoothstep(-3.2,-.3,shoreD)*(1.0-lakeBedM)*shoreOn;
ground=mix(ground,ground*vec3(.58,.55,.46),bankM*.75);
ground=mix(ground,vec3(.035,.045,.03),lakeBedM);
diffuseColor.rgb=ground;
`).replace('#include <roughnessmap_fragment>',`float roughnessFactor=mix(.96,.8,max(pavedM,paintM))-paintM*runoffRubber*.1;
roughnessFactor=mix(roughnessFactor,cityRough,cityCover);
roughnessFactor=mix(roughnessFactor,.63,bankM*.7);`)
  .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
#ifndef LAND_SIMPLE
 vec3 grassBump=texture2D(grassNormalMap,w/3.3).xyz*2.0-1.0;
 float bumpAmount=(1.0-smoothstep(10.0,65.0,viewDist))*(1.0-pavedM)*(1.0-paintM)*(1.0-lakeBedM)*(1.0-cityCover)*.4;
 normal=normalize(normal+(viewMatrix*vec4(grassBump.x,0.0,-grassBump.y,0.0)).xyz*bumpAmount);
#endif`);
  carShadowPatch(shader);
 };
 material.defines={...(mobile?{LAND_SIMPLE:''}:{}),...(cover&&ortho?{USE_COVER:''}:{}),...(city?{LAND_CITY:''}:{})};
 material.customProgramCacheKey=()=>'terrain-landscape-v5-'+(ortho?'ortho':'cerrado')+(cover&&ortho?'-cover':'')+(mobile?'-mobile':'')+(city?'-city':'');
 // Kept on the material, so clearing the circuit (main.js) disposes the city map with it.
 if(city)material.cityMap=city.texture;
 return material;
}

// --- Instanced scenery -------------------------------------------------------
// Parts keep their index, so a vertex shared by several triangles runs the vertex shader once
// (thousands of fans and trees). p.attrs: extra per-part floats (the fans' limb) as attributes;
// p.colors: per-vertex data in place of p.color (the fans' flag cloth).
function merge(parts){
 // An attr is a float or an array (a vector attribute: the trees' lobe centre); its size from the first part that has it.
 let count=0,indexCount=0;const extra=new Map();
 for(const p of parts){p.facet??=.35;const g=p.geometry;count+=g.attributes.position.count;indexCount+=g.index?g.index.count:g.attributes.position.count;for(const [k,v] of Object.entries(p.attrs??{}))if(!extra.has(k))extra.set(k,Array.isArray(v)?v.length:1);}
 const position=new Float32Array(count*3),normal=new Float32Array(count*3),color=new Float32Array(count*3),mask=new Float32Array(count),uvs=new Float32Array(count*2);
 const index=count>65535?new Uint32Array(indexCount):new Uint16Array(indexCount),more=Object.fromEntries([...extra].map(([k,n])=>[k,new Float32Array(count*n)]));let offset=0,at=0;
 for(const p of parts){
  const pos=p.geometry.attributes.position,nor=p.geometry.attributes.normal,uv=p.leaf?p.geometry.attributes.uv:null;
  for(let i=0;i<pos.count;i++){
   const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),o=offset+i;position.set([x,y,z],o*3);
   let n=[nor.getX(i),nor.getY(i),nor.getZ(i)];
   if(p.center){const d=[x-p.center[0],y-p.center[1],z-p.center[2]],l=Math.hypot(...d)||1;n=n.map((v,k)=>v*p.facet+d[k]/l*(1-p.facet));const l2=Math.hypot(...n);n=n.map(v=>v/l2);}
   normal.set(n,o*3);color.set(p.colors?p.colors.subarray(i*3,i*3+3):p.color(x,y,z),o*3);mask[o]=p.mask;
   // Leaf cards use the cluster drawn in the atlas; everything else its solid corner.
   if(uv)uvs.set([uv.getX(i)*LEAF_SPAN,uv.getY(i)*LEAF_SPAN],o*2);else uvs.set(SOLID_UV,o*2);
  }
  for(const [k,n] of extra){const v=p.attrs?.[k]??0;if(n===1)more[k].fill(v,offset,offset+pos.count);else if(Array.isArray(v))for(let i=0;i<pos.count;i++)more[k].set(v,(offset+i)*n);}
  const idx=p.geometry.index;if(idx)for(let i=0;i<idx.count;i++)index[at++]=offset+idx.getX(i);else for(let i=0;i<pos.count;i++)index[at++]=offset+i;
  offset+=pos.count;
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(position,3));g.setAttribute('normal',new THREE.BufferAttribute(normal,3));g.setAttribute('color',new THREE.BufferAttribute(color,3));g.setAttribute('partMask',new THREE.BufferAttribute(mask,1));g.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
 for(const [k,n] of extra)g.setAttribute(k,new THREE.BufferAttribute(more[k],n));
 g.setIndex(new THREE.BufferAttribute(index,1));g.computeBoundingSphere();return g;
}
// Leaf atlas: one cluster of leaves over most of the square, and an opaque white corner
// for trunks and branches. Grey-green so each tree's own colour still tints it.
const LEAF_SPAN=.94,LEAF_RESOLUTION=512,SOLID_UV=[.985,.985];
let leafAtlas=null;
function leafTexture(){
 if(leafAtlas)return leafAtlas;
 const size=LEAF_RESOLUTION,data=new Uint8Array(size*size*4),rand=random(4242);
 for(let y=size-16;y<size;y++)for(let x=size-16;x<size;x++)data.set([255,255,255,255],(y*size+x)*4);
 const span=size*LEAF_SPAN,c=span/2;
 // Inner leaves first and darker: the cluster shades itself toward its middle.
 const leaves=[];
 for(let i=0;i<190;i++){const r=Math.sqrt(rand())*c*.8,a=rand()*Math.PI*2;leaves.push({x:c+Math.cos(a)*r,y:c+Math.sin(a)*r,r});}
 leaves.sort((u,v)=>u.r-v.r);
 for(const leaf of leaves){
  const angle=rand()*Math.PI*2,len=18+rand()*18,wid=6.4+rand()*5.2,ca=Math.cos(angle),sa=Math.sin(angle);
  const shade=.52+.4*(leaf.r/c)+rand()*.14,warm=rand()<.5,tint=warm?[1.04,1,.86]:[.9,1,.98];
  const x0=Math.max(0,Math.floor(leaf.x-len)),x1=Math.min(Math.floor(span)-1,Math.ceil(leaf.x+len)),y0=Math.max(0,Math.floor(leaf.y-len)),y1=Math.min(Math.floor(span)-1,Math.ceil(leaf.y+len));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const dx=x+.5-leaf.x,dy=y+.5-leaf.y,u=(dx*ca+dy*sa)/len,v=(-dx*sa+dy*ca)/wid;
   if(Math.abs(u)>1||Math.abs(v)>1-u*u)continue;
   // Lit half and a faint midrib.
   const k=Math.min(1,shade*(v>0?1.08:.9)*(Math.abs(v)<.12?.9:1)),i=(y*size+x)*4;
   data[i]=Math.round(255*Math.min(1,k*tint[0]));data[i+1]=Math.round(255*Math.min(1,k*tint[1]));data[i+2]=Math.round(255*Math.min(1,k*tint[2]));data[i+3]=255;
  }
 }
 const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
 texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=4;texture.needsUpdate=true;
 leafAtlas=texture;return texture;
}
// A crown of crossed leaf cards on an ellipsoid shell. Normals point out of the crown
// (soft, rounded light like a real canopy); inner and lower cards are darker.
// lobe: the first lobe id of this crown; its cards fall in three sectors round it, each a lobe of its own (TREE_SHAPE).
function leafCrown(parts,rand,{center,radii,cards,size},lobe=1){
 for(let i=0;i<cards;i++){
  const u=rand()*2-1,a=rand()*Math.PI*2,shell=.55+.45*Math.cbrt(rand()),h=Math.sqrt(1-u*u);
  const c=[center[0]+Math.cos(a)*h*radii[0]*shell,center[1]+u*radii[1]*shell,center[2]+Math.sin(a)*h*radii[2]*shell];
  const s=size*(.8+rand()*.45),depth=shell,sector=Math.floor(a/(Math.PI*2/3)),mid=(sector+.5)*Math.PI*2/3;
  const attrs={lobe:lobe+sector,lobeC:[center[0]+Math.cos(mid)*radii[0]*.4,center[1],center[2]+Math.sin(mid)*radii[2]*.4]};
  for(let k=0;k<2;k++){
   const g=new THREE.PlaneGeometry(s,s);g.rotateX((rand()-.5)*1.6);g.rotateY(rand()*Math.PI);g.rotateZ((rand()-.5)*.8);g.translate(...c);
   parts.push({geometry:g,mask:1,leaf:true,center,facet:.18,attrs,color:(x,y)=>{const low=smooth(center[1]-radii[1],center[1]+radii[1]*.8,y),v=(.5+.5*low)*(.62+.38*depth);return [v,v,v];}});
  }
 }
}
function branch(parts,from,to,r0,r1,bark,lobe=0){
 const d=new THREE.Vector3(...to).sub(new THREE.Vector3(...from)),len=d.length();
 const g=new THREE.CylinderGeometry(r1,r0,len,5,1,true).translate(0,len/2,0);
 g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));g.translate(...from);
 parts.push({geometry:g,mask:0,color:()=>bark,attrs:{lobe,lobeC:[0,0,0]}});
}
// Near trees: trunk, a few limbs and a leaf-card crown (1 m tall unit; instances scale them).
// form (near crowns of the full builds, one mesh each): 0 the plain crown; round 1 a spreading
// crown in two lobes on a forked trunk, 2 an upright oval; tall 1 a eucalyptus with a bare trunk and
// a thin crown on top, 2 a column widest halfway up. About the same cards in each.
function foliageTreeGeometry(kind,seed,detail=1,form=0){
 const rand=random(seed),parts=[],bark=[.13,.11,.09],far=detail===0;
 if(kind==='tall'){
  if(form===1){
   branch(parts,[0,0,0],[.03,.9,0],.03,.011,bark,10);
   for(let i=0;i<3;i++){const a=rand()*Math.PI*2,y=.6+i*.08;branch(parts,[.02,y,0],[Math.cos(a)*.13,y+.14,Math.sin(a)*.13],.008,.004,bark,10);}
   leafCrown(parts,rand,{center:[.03,.8,0],radii:[.25,.16,.22],cards:20,size:.2},11);leafCrown(parts,rand,{center:[-.05,.63,.04],radii:[.15,.11,.14],cards:10,size:.18},14);
  }else{
   branch(parts,[0,0,0],[0,.8,0],.028,.012,bark,10);
   if(!far)for(let i=0;i<3;i++){const a=rand()*Math.PI*2,y=.5+i*.1;branch(parts,[0,y,0],[Math.cos(a)*.11,y+.12,Math.sin(a)*.11],.009,.004,bark,10);}
   leafCrown(parts,rand,form===2?{center:[0,.62,0],radii:[.25,.32,.23],cards:30,size:.21}:{center:[0,.7,0],radii:[.2,.3,.2],cards:far?9:30,size:far?.3:.2},11);
  }
 }else if(form===1){
  branch(parts,[0,0,0],[.02,.3,0],.055,.04,bark);
  for(const [x,z] of [[.2,.05],[-.17,-.07]])branch(parts,[.02,.28,0],[x,.5,z],.035,.018,bark);
  leafCrown(parts,rand,{center:[.17,.58,.06],radii:[.32,.22,.3],cards:21,size:.29},1);leafCrown(parts,rand,{center:[-.16,.55,-.07],radii:[.3,.2,.28],cards:19,size:.28},4);
 }else{
  branch(parts,[0,0,0],[.02,form===2?.5:.42,0],.05,.03,bark);
  if(!far)for(let i=0;i<4;i++){const a=i/4*Math.PI*2+rand()*.8;branch(parts,[.02,.36+rand()*.06,0],[Math.cos(a)*.22,.6+rand()*.12,Math.sin(a)*.22],.022,.01,bark);}
  leafCrown(parts,rand,form===2?{center:[0,.68,0],radii:[.35,.33,.35],cards:40,size:.28}:{center:[0,.64,0],radii:[.44,.3,.44],cards:far?12:40,size:far?.42:.3},1);
 }
 return merge(parts);
}
// Displacement depends only on the original position, so shared corners stay welded.
function lumpy(geometry,seed,amount){const p=geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),h=Math.sin(x*12.99+y*78.23+z*37.71+seed)*43758.5453,k=1+(h-Math.floor(h)-.5)*amount;p.setXYZ(i,x*k,y*k,z*k);}return geometry;}
// A welded, smooth-shaded lump of foliage: no hard facets, and each corner shades once.
function leafBlob(detail,seed,amount){const g=mergeVertices(new THREE.IcosahedronGeometry(1,detail).deleteAttribute('normal').deleteAttribute('uv'));lumpy(g,seed,amount);g.computeVertexNormals();return g;}

// Unit trees (1 m tall, ~1 m crown); instances scale them. partMask marks foliage.
// detail 1: near crowns (rounded lumps, ~250 triangles); detail 0: distant crowns, one lump (26
// triangles), both on a trunk so a far crown never floats.
// lean (Básico): every near lump the plain one, as the light build had before the rounder crowns.
// Every part carries its lobe (attribute lobe: 0 the trunk, 1.. each lump of the crown; +10 on the tall kind) and the
// lump's centre (lobeC), so TREE_SHAPE moves and sizes each lump on its own per tree: one mesh, many crowns. A distant
// crown's one lump is lobe 9 (FAR_LUMP): the whole crown's average, sized and seated as its near lumps are together
// (each tree's near and far crowns within about a tenth of each other in size and 1 cm in height, median), so the
// switch at the block's distance (Baixo 55 m, Médio 80 m) does not make a crown jump.
const FAR_LUMP=9;
function treeGeometry(kind,seed,detail=1,lean=false){
 const rand=random(seed),parts=[],bark=[.12,.1,.075],far=detail===0,base=kind==='tall'?10:0;
 const shade=(low,high)=>(x,y)=>{const s=.5+.5*smooth(low,high,y);return [s,s,s];};
 if(kind==='tall'){
  parts.push({geometry:far?new THREE.CylinderGeometry(.02,.034,.62,3,1,true).translate(0,.31,0):new THREE.CylinderGeometry(.018,.034,.72,4,1,true).translate(0,.36,0),mask:0,color:()=>bark,attrs:{lobe:base,lobeC:[0,0,0]}});
  if(far)parts.push({geometry:leafBlob(0,rand()*100,.18).scale(.264,.352,.264).translate(0,.7,0),mask:1,center:[0,.7,0],facet:.12,color:shade(.4,1),attrs:{lobe:base+FAR_LUMP,lobeC:[0,.7,0]}});
  else for(let i=0;i<4;i++){const y=.56+i*.36/4*1.3,r=.2-i*.1/4,c=[(rand()-.5)*.08,y,(rand()-.5)*.08];
   parts.push({geometry:leafBlob(i<2&&!lean?1:0,rand()*100,.3).scale(r,r*.8,r).translate(...c),mask:1,center:c,facet:.12,color:shade(.45,1),attrs:{lobe:base+1+i,lobeC:c}});}
 }else{
  parts.push({geometry:far?new THREE.CylinderGeometry(.03,.05,.42,3,1,true).translate(0,.21,0):new THREE.CylinderGeometry(.03,.055,.5,4,1,true).translate(0,.25,0),mask:0,color:()=>bark,attrs:{lobe:0,lobeC:[0,0,0]}});
  const blobs=far?[[0,.65,0,.46]]:[[0,.72,0,.3],[.2,.58,.1,.24],[-.18,.6,.14,.23],[.05,.58,-.22,.24],[-.12,.5,-.1,.2]];
  // The two largest lumps are rounder; the small ones only break the outline.
  blobs.forEach(([x,y,z,r],i)=>{const c=[x+(rand()-.5)*.06,y,z+(rand()-.5)*.06];
   const g=leafBlob(far||lean||i>1?0:1,rand()*100,far?.28:.35).scale(r,r*(far?.77:.85),r).translate(...c);
   parts.push({geometry:g,mask:1,center:[0,.6,0],facet:.12,color:shade(.35,.95),attrs:{lobe:far?FAR_LUMP:1+i,lobeC:c}});});
 }
 return merge(parts);
}
// Unit houses. partMask: 0 plastered wall, 1 roof (instance colour), 2 fixed colour, 3 wall of a
// laje house (bare brick, block or plaster, picked in the shader).
function houseGeometry(flat){
 // A round building (the Mané Garrincha, a gymnasium): a drum in the instance colour, the
 // concourse below a white roof band. Unit diameter, height like the boxes (base sunk 0.35).
 if(flat==='round'){
  const parts=[{geometry:new THREE.CylinderGeometry(.5,.5,1.13,64,1,true).translate(0,.215,0),mask:1,color:()=>[.82,.82,.8],attrs:{towerPart:0}},
   {geometry:new THREE.CylinderGeometry(.505,.505,.22,64,1,true).translate(0,.89,0),mask:1,color:()=>[1.1,1.1,1.08]},
   {geometry:new THREE.CylinderGeometry(.505,.505,.02,64).translate(0,.99,0),mask:1,color:()=>[.9,.9,.88]}];
  return merge(parts);
 }
 if(flat==='laje'){
  const parts=[{geometry:new THREE.BoxGeometry(1,1.35,1).translate(0,.325,0),mask:3,color:()=>[1,1,1],attrs:{towerPart:0}},
   {geometry:new THREE.BoxGeometry(1.04,.05,1.04).translate(0,1.02,0),mask:1,color:()=>[1,1,1]},
   {geometry:new THREE.CylinderGeometry(.07,.07,.13,10).translate(.22,1.11,-.2),mask:2,color:()=>[.08,.2,.42]},
   {geometry:new THREE.BoxGeometry(1.02,.08,.03).translate(0,1.07,.5),mask:3,color:()=>[1,1,1]}];
  return merge(parts);
 }
 const walls=new THREE.BoxGeometry(1,1.35,1).translate(0,.325,0),parts=[{geometry:walls,mask:0,color:()=>[1,1,1],attrs:{towerPart:0}}];
 if(flat)parts.push({geometry:new THREE.BoxGeometry(1.02,.06,1.02).translate(0,1.03,0),mask:1,color:()=>[1,1,1]});
 else{
  const roof=new THREE.BufferGeometry(),e=.54,top=1.36,ridge=.22;
  const v=[[-e,1,-e],[e,1,-e],[e,1,e],[-e,1,e],[-ridge,top,0],[ridge,top,0]];
  const faces=[0,5,1,0,4,5,2,4,3,2,5,4,1,5,2,3,4,0];
  roof.setAttribute('position',new THREE.Float32BufferAttribute(faces.flatMap(i=>v[i]),3));roof.computeVertexNormals();
  parts.push({geometry:roof,mask:1,color:()=>[1,1,1]});
 }
 return merge(parts);
}
// A horizon tower: the walls in two boxes, the upper one (towerPart 1) set back on some towers (TOWER_VERTEX), its roof
// and a plant room on the roof (towerPart 2: moved, sized or left off per tower). The same unit as houseGeometry(true).
function towerGeometry(){
 return merge([{geometry:new THREE.BoxGeometry(1,1.07,1).translate(0,.185,0),mask:0,color:()=>[1,1,1],attrs:{towerPart:0}},
  {geometry:new THREE.BoxGeometry(1,.28,1).translate(0,.86,0),mask:0,color:()=>[1,1,1],attrs:{towerPart:1}},
  {geometry:new THREE.BoxGeometry(1.02,.06,1.02).translate(0,1.03,0),mask:1,color:()=>[1,1,1],attrs:{towerPart:1}},
  {geometry:new THREE.BoxGeometry(.4,.05,.36).translate(0,1.085,0),mask:1,color:()=>[.78,.78,.8],attrs:{towerPart:2}}]);
}
// Per-instance shape of a tree, from the hash of its position (the same in the colour pass and the
// shadow pass): a crown with its own lobes, height and seat on the trunk, a wider or narrower spread
// across each axis and a lean that grows up the trunk.
// The crown's form, per tree (x spread across, y squash toward its base, z lift on a longer trunk, w how far its lumps
// stray): round kind a dome, an umbrella (wide and flat, high on its trunk: tipuanas, sibipirunas), an old uneven one
// (lumps flung apart, one lower) or an oval; tall kind a column for a third of them (under a tenth of all the trees, no
// more rows of cypresses) and otherwise a eucalyptus, a rounder crown high on a bare trunk. Each lump then moves,
// sinks or rises and grows or shrinks on its own (lobe, lobeC: treeGeometry), so no two crowns are alike, and the
// whole stands a little taller or squatter. The lumps' reach is eased in under the cap the placement keeps clear
// (CROWN_REACH: .56 of the width round the trunk before the warps below, .27 for the tall kind).
const TREE_SHAPE=`
attribute float lobe;attribute vec3 lobeC;
float treeSeedOf(){return fract(sin(dot(instanceMatrix[3].xz,vec2(12.9898,78.233)))*43758.5453);}
vec4 treeForm(float seed,bool tall){
 float f=fract(seed*7.13);
 if(tall)return f<.35?vec4(1.0,1.0,0.0,.3):vec4(1.15,.6,.1,1.0);
 return f<.35?vec4(1.0,1.0,0.0,.45):f<.6?vec4(1.25,.62,.09,.6):f<.85?vec4(1.1,.92,0.0,1.0):vec4(.82,1.22,.02,.35);
}
void treeShape(inout vec3 p,float seed){
 float h1=fract(seed*91.7),h2=fract(seed*37.3),h3=fract(seed*13.1),h4=fract(seed*5.9),h5=fract(seed*23.7),h6=fract(seed*61.9);
 bool tall=lobe>9.5;vec4 form=treeForm(seed,tall);float crownBase=tall?.5:.34;
 if(partMask>.5){
  float id=lobe-(tall?10.0:0.0),l1=fract(sin(seed*113.1+id*17.37)*43758.5453),l2=fract(l1*47.3+.17),l3=fract(l1*29.1+.53);
  // A distant crown's one lump (FAR_LUMP) stands for the whole crown: no stray, the mean size and seat, and spread by
  // the form as the near lumps' centres are.
  bool whole=id>${FAR_LUMP-.5};if(whole){l1=.5;l2=.5;}
  vec2 stray=whole?vec2(0.0):vec2(cos(l3*6.283),sin(l3*6.283))*form.w*(tall?.13:.09);
  vec3 c=vec3(lobeC.xz*form.x+stray,crownBase+(lobeC.y-crownBase)*form.y+form.z+(l2-.5)*.09*form.w).xzy;
  float k=.84+.32*l1;
  p=c+(p-lobeC)*k*(whole?form.xyx:vec3(mix(1.0,form.x,.5),mix(1.0,form.y,.6),mix(1.0,form.x,.5)));
  float r=length(p.xz),cap=tall?.27:.56,knee=cap*.7;
  if(r>knee)p.xz*=(knee+(cap-knee)*(1.0-exp(-(r-knee)/(cap-knee))))/r;
  float a=atan(p.z,p.x+1e-5);
  p.xz*=1.0+.16*sin(a*3.0+h1*6.283)+.08*sin(a*5.0+h2*6.283);
  p.y=.4+(p.y-.4)*(.85+.3*h3)-.06*h4;
 }else p.y+=form.z*smoothstep(.12,.45,p.y);
 p.x*=.87+.26*h2;p.z*=.87+.26*h5;p.y*=.84+.32*h6;
 p.xz+=vec2(cos(h1*6.283+h4*3.0),sin(h1*6.283+h4*3.0))*(.015+.045*h3)*p.y*p.y;
}`;
// The tree's own vertex work, shared by the colour and shadow passes; each tree sways on its own.
const TREE_VERTEX=`
#ifdef USE_INSTANCING
 float treeSeed=treeSeedOf();
 treeShape(transformed,treeSeed);
 float sway=sin(landTime*1.4+instanceMatrix[3].x*.07+instanceMatrix[3].z*.05)*.012*(.7+.6*fract(treeSeed*3.3))*partMask*position.y;
 transformed.x+=sway;transformed.z+=sway*.6;
#endif`;
// Grandstand fans: one merged figure posed per instance (fanData: pose, seed, sun share, sky share).
// Poses: 0 seated, 1 arms folded, 2 phone up, 3 elbows on knees, 4 standing, 5 standing and cheering,
// 6 waving a flag seated, 7 standing with it. Limbs (attribute): 0 torso, 1-2 left upper arm and
// forearm, 3-4 right, 5 thighs, 6 shins, 7 head, 8 the flag in the right hand.
// The flag hand's elbow and hand (fanGeometry), and the top of the flag's stick, where its cloth hangs from.
const FAN_ELBOW=[.21,.47,.1],FAN_HAND=[.12,.35,.34],FLAG_TOP=(()=>{const d=FAN_HAND.map((v,i)=>v-FAN_ELBOW[i]),l=Math.hypot(...d);return FAN_HAND.map((v,i)=>v+d[i]/l*.62);})();
const FAN_POSE=`
const vec3 FLAG_TOP=vec3(${FLAG_TOP.map(v=>v.toFixed(4)).join(',')});
mat3 fanX(float a){float c=cos(a),s=sin(a);return mat3(1.0,0.0,0.0,0.0,c,s,0.0,-s,c);}
mat3 fanY(float a){float c=cos(a),s=sin(a);return mat3(c,0.0,-s,0.0,1.0,0.0,s,0.0,c);}
void fanPose(inout vec3 p,inout vec3 n){
 float pose=fanData.x,seed=fanData.y,t=landTime*(.7+.6*fract(seed*7.31))+seed*61.0;
 bool flagPart=limb>7.5;
 if(flagPart&&pose<5.5){p=vec3(0.0);return;}
 float side=flagPart?1.0:(p.x<0.0?-1.0:1.0);
 bool standing=pose>3.5&&pose<5.5||pose>6.5;
 // Now and then a fan gets excited: a bounce in the seat, cheering harder.
 float excite=clamp((sin(t*.21)-.5)*2.0,0.0,1.0);
 float a=0.0,b=0.0,c=0.0,lean=0.0;
 if(pose<.5)a=-.08*excite*max(0.0,sin(t*7.0));
 else if(pose<1.5){a=-.15;b=-.65;c=-side*1.25;}
 else if(pose<2.5){if(side>0.0){a=-.55;b=-1.3;c=-.45;}}
 else if(pose<3.5){a=.3;b=.4;lean=.4;}
 else if(pose<4.5){a=.22;b=1.0;}
 else if(pose<5.5){a=-2.65+(.15+.25*excite)*sin(t*6.0+side);b=.25;c=side*.3;}
 else if(side>0.0){a=-2.35+.45*sin(t*4.5);b=.1;}
 else if(standing){a=.22;b=1.0;}
 // Every flag its own size (.7-1.3, from the top of the stick); the cloth ripples away from the stick (colour:
 // distance from it, face side).
 if(flagPart&&partMask>4.5){p=FLAG_TOP+(p-FLAG_TOP)*(.7+.6*fract(seed*3.77));p+=normal*color.g*sin(t*11.0-color.r*5.0)*.06*color.r;}
 if(limb>.5&&limb<4.5||flagPart){
  vec3 S=vec3(side*.2,.76,0.0),E=vec3(side*.21,.47,.1);
  if(limb>1.5&&limb<2.5||limb>3.5){mat3 f=fanY(c)*fanX(b);p=E+f*(p-E);n=f*n;}
  mat3 u=fanX(a);p=S+u*(p-S);n=u*n;
 }
 if(limb>6.5&&limb<7.5){
  // The head looks around on its own, or down at the phone.
  float nod=pose>1.5&&pose<2.5?.38:.06*sin(t*.71);
  mat3 h=fanY((fract(seed*13.7)-.5)*.8+.18*sin(t*.37)+.06*sin(t*1.13))*fanX(nod);vec3 N=vec3(0.0,.8,0.0);p=N+h*(p-N);n=h*n;
 }
 if(lean>0.0&&(limb<4.5||limb>6.5)){mat3 l=fanX(lean);vec3 H=vec3(0.0,.3,0.0);p=H+l*(p-H);n=l*n;}
 if(standing&&limb>4.5&&limb<6.5){
  mat3 r=fanX(1.45);vec3 H=vec3(side*.09,.3,.02),K=vec3(side*.1,.3,.38);
  if(limb<5.5){p=H+r*(p-H);n=r*n;}else p+=H+r*(K-H)-K;
 }
 p.y+=standing?.33:excite*max(0.0,sin(t*7.0))*.035;
 // Build and the way they sit: slim or broad, tall or short, turned toward a neighbour or the action (about ±22°).
 vec3 build=vec3(.88+.3*fract(seed*3.31),.92+.16*fract(seed*9.17),.9+.2*fract(seed*3.31));
 mat3 y=fanY((fract(seed*5.13)-.5)*.76);p=y*(p*build);n=normalize(y*(n/build));
}`;
// A house's own shape, shared by the colour and shadow passes (houseDepthMaterial).
const HOUSE_VERTEX=`
 float houseSeed=fract(sin(dot(instanceMatrix[3].xz,vec2(12.9898,78.233)))*43758.5453);
 if(partMask>.5&&partMask<1.5&&position.y>1.07&&position.y<1.4){
  // Pitched roofs: each its own pitch, as a pyramid, a hip or a gable.
  float ridge=fract(houseSeed*23.9);
  transformed.y=1.0+(position.y-1.0)*(.65+.8*fract(houseSeed*41.3));
  if(position.y>1.3)transformed.x=position.x*(ridge<.2?.25:ridge<.6?1.0:ridge<.8?1.6:2.45);
 }
 if(partMask>1.5&&partMask<2.5){
  // A laje's water tank: on any corner, or none.
  transformed.xz*=vec2(fract(houseSeed*7.3)<.5?-1.0:1.0,fract(houseSeed*3.1)<.5?-1.0:1.0);
  if(fract(houseSeed*11.7)<.3)transformed=vec3(0.0);
 }`;
// A horizon tower (towerGeometry) set back once, about four in ten of the tall ones: the upper floors narrower from a
// height of its own, the lower block's roof a terrace. Colour pass only: the horizon casts no shadows.
const TOWER_VERTEX=`
 if(towerPart>1.5){
  // The plant room: off centre, its own size, and on about a third of the towers none.
  vec2 plantAt=(vec2(fract(houseSeed*3.7),fract(houseSeed*9.3))-.5)*.4;
  transformed.xz=plantAt+position.xz*(.6+.8*fract(houseSeed*6.1));transformed.y=1.06+(position.y-1.06)*(.4+.8*fract(houseSeed*2.9));
  if(fract(houseSeed*12.3)<.33)transformed=vec3(0.0,1.0,0.0);
 }
 if(vPartScale.y>30.0&&fract(houseSeed*17.9)<.42){
  if(abs(position.y-.72)<.005)transformed.y=.3+.5*fract(houseSeed*8.1);
  if(towerPart>.5)transformed.xz*=.6+.25*fract(houseSeed*5.3);
 }`;
function sceneryMaterial(kind,{foliage=false,plain=false}={}){
 const material=new THREE.MeshStandardMaterial({name:{tree:'Arvores_instanciadas',house:'Casas_instanciadas',crowd:'Torcida_instanciada'}[kind],vertexColors:true,roughness:kind==='tree'?.88:.82,metalness:0});
 if(foliage)Object.assign(material,{map:leafTexture(),alphaTest:.45,alphaToCoverage:true,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{
  if(foliage){
   // Keep the leaves' coverage in the smaller mipmaps (they would thin out with distance),
   // and give both faces of a card the crown's outward normal. A card seen edge-on fades out
   // instead of drawing a thin line across the crown.
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
vec4 leafTexel=texture2D(map,vMapUv);
float leafLod=max(0.0,log2(max(length(dFdx(vMapUv*${LEAF_RESOLUTION}.0)),length(dFdy(vMapUv*${LEAF_RESOLUTION}.0)))));
leafTexel.a=min(1.0,leafTexel.a*(1.0+leafLod*.3));
vec3 cardNormal=normalize(cross(dFdx(vViewPosition),dFdy(vViewPosition)));
if(vMapUv.x<.95)leafTexel.a*=mix(1.0,smoothstep(.07,.3,abs(dot(cardNormal,normalize(vViewPosition)))),1.0-smoothstep(1.5,3.5,leafLod));
diffuseColor*=leafTexel;`).replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
#if defined(DOUBLE_SIDED) && !defined(FLAT_SHADED)
 normal*=faceDirection;
 nonPerturbedNormal=normal;
#endif`).replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
 // Sunlight through the leaves when the sun is behind the crown.
 float leafBack=pow(max(dot(normalize(-vViewPosition),directionalLights[0].direction),0.0),5.0);
 reflectedLight.directDiffuse+=diffuseColor.rgb*directionalLights[0].color*leafBack*.4*step(vMapUv.x,.95);
#endif`);
  }
  shader.uniforms.landTime=shared.time;
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute float partMask;uniform float landTime;varying float vPart;varying vec3 vPartLocal,vPartNormal,vPartScale;
#ifdef CROWD
varying vec2 vFanLight;varying vec3 vFlag,vFlagB;
#endif
#ifdef HOUSES
varying float vHouseSeed;attribute float towerPart;
#endif
#if defined(TREES)&&defined(USE_INSTANCING)
${TREE_SHAPE}
#endif
#if defined(CROWD)&&defined(USE_INSTANCING)
attribute float limb;attribute vec4 fanData;
${FAN_POSE}
#endif`).replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
#if defined(CROWD)&&defined(USE_INSTANCING)
 vec3 fanP=position;fanPose(fanP,objectNormal);
#endif`).replace('#include <color_vertex>',`
vPart=partMask;vPartLocal=position;vPartNormal=normal;vPartScale=vec3(1.0);
vColor=vec4(1.0);
#ifdef USE_COLOR
 vColor.rgb*=color;
#endif
#ifdef CROWD
 vFanLight=vec2(1.0);vFlag=vec3(0.0,0.0,-1.0);vFlagB=vec3(1.0);
#endif
#ifdef HOUSES
 vHouseSeed=0.0;
#endif
#ifdef USE_INSTANCING
 vPartScale=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
#endif
#ifdef USE_INSTANCING_COLOR
 #ifdef HOUSES
  float seed=fract(sin(dot(instanceMatrix[3].xz,vec2(12.9898,78.233)))*43758.5453);vHouseSeed=seed;
  vec3 wall=seed<.3?vec3(.62,.6,.55):seed<.5?vec3(.66,.55,.36):seed<.65?vec3(.55,.36,.27):seed<.8?vec3(.38,.46,.5):vec3(.48,.47,.44);
  // Paint ages differently on every building; towers drift toward concrete, beige, terracotta or blue glass.
  wall*=.84+.26*fract(seed*7.7);
  // (A third of them dark blue-grey glass, so the skyline is not one pale grey.)
  if(vPartScale.y>9.0){float k=fract(seed*19.3);wall=mix(wall,k<.28?vec3(.5,.5,.48):k<.5?vec3(.6,.53,.42):k<.64?vec3(.46,.3,.24):vec3(.1,.13,.17),k<.64?.6:.8)*(.66+.42*fract(seed*43.1));}
  // Laje houses: mostly bare orange brick, some grey block, some painted.
  vec3 brick=seed<.55?vec3(.4,.19,.1)*(.85+.3*fract(seed*17.0)):seed<.75?vec3(.36,.36,.34):wall;
  // Water tanks: blue fibreglass, grey fibre cement or a concrete box.
  float tank=fract(seed*29.7);
  vec3 tankColor=tank<.55?vec3(1.0):tank<.8?vec3(3.75,1.5,.71):vec3(5.6,2.1,.9);
  vec3 roof=instanceColor.rgb*(.85+.3*fract(seed*61.3));
  vColor.rgb*=partMask>2.5?brick:partMask>1.5?tankColor:mix(wall,roof,partMask);
 #elif defined(CROWD)
  // partMask: 0 fixed colour, 1 shirt (instance colour), 2 skin, 3 trousers, 4 hair or cap, 5 flag cloth.
  float who=fract(sin(dot(instanceMatrix[3].xz,vec2(12.9898,78.233)))*43758.5453),who2=fract(who*91.7),who3=fract(who*37.3);
  vec3 skinTone=mix(vec3(.6,.4,.28),vec3(.16,.09,.055),who2*who2*.85+who2*.15);
  vec3 trousers=who3<.45?vec3(.05,.08,.15):who3<.7?vec3(.03,.03,.035):who3<.85?vec3(.28,.24,.16):vec3(.36,.36,.38);
  vec3 hairOrCap=who<.22?instanceColor.rgb*.8:who<.3?vec3(.7,.7,.68):who<.36?vec3(.03,.03,.035):who3<.2?vec3(.25,.18,.1):vec3(.03,.025,.02);
  #ifdef USE_INSTANCING
   // Each flag from the clubs' colours: Brazil's green (with its yellow diamond on some), Brazil's yellow, white, a
   // blue or a red team's, or the fan's own shirt; plain or in two halves, across or down (FLAG_PATTERN).
   float fk=fract(fanData.y*5.7),fp=fract(fanData.y*29.1);
   vec3 green=vec3(.02,.24,.07),yellow=vec3(.5,.4,.04),white=vec3(.55,.55,.53),blue=vec3(.03,.07,.26),red=vec3(.36,.04,.04);
   vec3 flag=fk<.3?green:fk<.45?yellow:fk<.55?white:fk<.66?blue:fk<.77?red:instanceColor.rgb;
   vFlagB=fk<.3?yellow:fk<.45?green:fk<.55?(fp<.5?red:blue):fk<.66?white:fk<.77?(fp<.5?white:vec3(.03)):white;
   vFlag=vec3(color.r,color.b,partMask>4.5?(fk<.3&&fp>.55?3.0:fp<.35?0.0:fp<.7?1.0:2.0):-1.0);
   vFanLight=fanData.zw;
  #else
   vec3 flag=instanceColor.rgb;
  #endif
  vColor.rgb=partMask>4.5?flag:vColor.rgb*(partMask<.5?vec3(1.0):partMask<1.5?instanceColor.rgb:partMask<2.5?skinTone:partMask<3.5?trousers:hairOrCap);
 #elif defined(TREES)
  // Each tree its own shade and hue on top of the palette, younger yellower leaves on top of
  // some crowns, and pale or dark bark.
  float tint=fract(sin(dot(instanceMatrix[3].xz,vec2(12.9898,78.233)))*43758.5453);
  vec3 leaf=instanceColor.rgb*(.86+.28*fract(tint*17.3))*mix(vec3(1.05,1.0,.84),vec3(.93,1.0,1.08),fract(tint*31.7));
  leaf*=mix(vec3(1.0),vec3(1.08,1.05,.84),smoothstep(.55,.95,position.y)*fract(tint*7.7));
  // Each lump a shade of its own (a younger, yellower one now and then), and the crown's shade: a lump's underside and
  // the lower lumps darker, so a crown has a lit top and a deep core instead of flat facets (the untextured crowns).
  float lump=fract(sin(tint*91.3+lobe*7.77)*4375.5);
  leaf*=(.9+.2*lump)*mix(vec3(1.0),vec3(1.07,1.04,.85),step(.78,fract(lump*13.1))*.7);
  #ifndef USE_MAP
   vec3 fromLump=position-lobeC;
   leaf*=mix(.66,1.0,smoothstep(-.8,.55,fromLump.y/max(length(fromLump),1e-3)))*mix(.86,1.0,smoothstep(lobe>9.5?.55:.48,lobe>9.5?.85:.7,lobeC.y));
  #endif
  vColor.rgb*=partMask>.5?leaf:vec3(.75+.5*fract(tint*53.1));
 #else
  vColor.rgb*=mix(vec3(1.0),instanceColor.rgb,partMask);
 #endif
#endif`).replace('#include <begin_vertex>',`#include <begin_vertex>
#if defined(TREES)
${TREE_VERTEX}
#endif
#if defined(CROWD)&&defined(USE_INSTANCING)
 transformed=fanP;
#endif
#if defined(HOUSES)&&defined(USE_INSTANCING)
${HOUSE_VERTEX}
${TOWER_VERTEX}
 vPartLocal=transformed;
#endif`);
  if(kind==='crowd'){
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vFanLight;varying vec3 vFlag,vFlagB;').replace('#include <color_fragment>',`#include <color_fragment>
// A flag's second colour (vFlag: across and down the cloth, pattern): on one half, across or down, or Brazil's diamond.
vec2 flagEdge=fwidth(vFlag.xy)+.02;
if(vFlag.z>-.5){
 float second=vFlag.z<.5?0.0:vFlag.z<1.5?smoothstep(.5-flagEdge.x,.5+flagEdge.x,vFlag.x):vFlag.z<2.5?smoothstep(.5-flagEdge.y,.5+flagEdge.y,vFlag.y):1.0-smoothstep(.4-flagEdge.x,.4+flagEdge.x,abs(vFlag.x-.5)*1.3+abs(vFlag.y-.5));
 diffuseColor.rgb=mix(diffuseColor.rgb,vFlagB,second);
}`).replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
// Under the stand's roof: the sun reaches only some rows, and the back rows see little sky.
reflectedLight.directDiffuse*=vFanLight.x;reflectedLight.directSpecular*=vFanLight.x;
reflectedLight.indirectDiffuse*=vFanLight.y;reflectedLight.indirectSpecular*=vFanLight.y;
#if NUM_DIR_LIGHTS > 0
 // Even in the roof's shade a fan has a side toward the sun (the light bounced off the sunlit track and apron) and one
 // away from it, and more sky on the shoulders than the lap: wrapped light, so torsos are not lit flat like cut-outs.
 float fanWrap=clamp((dot(normal,directionalLights[0].direction)+.6)/1.6,0.0,1.0);
 reflectedLight.indirectDiffuse*=mix(.8,1.3,fanWrap)*(.9+.16*inverseTransformDirection(normal,viewMatrix).y);
#endif`);
  }
  if(kind==='tree'){
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vPart;varying vec3 vPartLocal,vPartNormal,vPartScale;').replace('#include <color_fragment>',`#include <color_fragment>
// Fine vertical bark fissures use world metre scale and vanish before aliasing.
if(vPart<.5){
 float barkAlong=(vPartLocal.x+vPartLocal.z)*max(vPartScale.x,vPartScale.z);
 float barkUp=vPartLocal.y*vPartScale.y;
 float barkRidge=.5+.5*sin(barkAlong*57.0+sin(barkUp*3.7)*1.1);
 float barkDetail=1.0-smoothstep(.04,.15,fwidth(barkAlong));
 float rootMoss=1.0-smoothstep(.2,1.5,barkUp);
 diffuseColor.rgb*=mix(1.0,.7+barkRidge*.55,barkDetail);
 diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.75,1.04,.62),rootMoss*.45);
}
#if !defined(USE_MAP)&&!defined(TREE_PLAIN)
// Untextured crowns (the light builds): clumps of lighter and darker leaves in the crown's own space,
// so a lump reads as foliage rather than a smooth ball; gone before it would shimmer. Not on Básico
// (TREE_PLAIN): the cheapest level keeps its plain lumps and saves the eight hashes a crown pixel.
vec3 clump=vPartLocal*vec3(19.0,23.0,19.0);
float clumpDetail=(1.0-smoothstep(.35,.9,fwidth(clump.y)))*step(.5,vPart),leafBump=.5;
if(clumpDetail>0.0){
 vec3 ci=floor(clump),cf=fract(clump);cf=cf*cf*(3.0-2.0*cf);
 #define CLUMP(o) fract(sin(dot(ci+o,vec3(12.99,78.23,37.71)))*43758.55)
 float cn=mix(mix(mix(CLUMP(vec3(0,0,0)),CLUMP(vec3(1,0,0)),cf.x),mix(CLUMP(vec3(0,1,0)),CLUMP(vec3(1,1,0)),cf.x),cf.y),mix(mix(CLUMP(vec3(0,0,1)),CLUMP(vec3(1,0,1)),cf.x),mix(CLUMP(vec3(0,1,1)),CLUMP(vec3(1,1,1)),cf.x),cf.y),cf.z);
 diffuseColor.rgb*=mix(1.0,.66+.62*cn*cn,clumpDetail)*mix(vec3(1.0),vec3(1.06,1.04,.9),cn*clumpDetail);
 leafBump=cn;
}
// The clumps also stand out of the lump (about 20 cm), lit on their own: the big flat facets of a near crown break up.
vec2 leafSlope=vec2(dFdx(leafBump),dFdy(leafBump))*.22*clumpDetail;
#endif`).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
#if !defined(USE_MAP)&&!defined(TREE_PLAIN)
{
 vec3 leafSx=dFdx(-vViewPosition),leafSy=dFdy(-vViewPosition),leafR1=cross(leafSy,normal),leafR2=cross(normal,leafSx);
 float leafDet=dot(leafSx,leafR1);
 if(vPart>.5&&abs(leafDet)>1e-12)normal=normalize(abs(leafDet)*normal-sign(leafDet)*(leafSlope.x*leafR1+leafSlope.y*leafR2));
}
#endif`).replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
#ifndef USE_MAP
// Untextured crowns are solid lumps: let in the skylight a real crown gets between its leaves and
// the sun through them when it is behind the tree, so a backlit crown is dark green, not black.
if(vPart>.5){
 reflectedLight.indirectDiffuse*=1.25;
 #if NUM_DIR_LIGHTS > 0
  float leafBack=pow(max(dot(normalize(-vViewPosition),directionalLights[0].direction),0.0),4.0);
  reflectedLight.directDiffuse+=diffuseColor.rgb*directionalLights[0].color*(.03+.16*leafBack);
 #endif
}
#endif`);
  }
  if(kind!=='house')return;
  shader.uniforms.houseLight=EFFECT_LIGHT;shader.uniforms.skylineFar=SKYLINE_FAR;
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vPart,vHouseSeed;varying vec3 vPartLocal,vPartNormal,vPartScale;uniform float houseLight,skylineFar;').replace('#include <color_fragment>',`#include <color_fragment>
// Night (weather.js EFFECT_LIGHT: 1 by day, .62 at dusk, under .05 at night): a share of the windows lit from inside.
float houseWindow=0.0,houseNight=1.0-smoothstep(.08,.75,houseLight);
// Every building its own window grid: cell width and floor height, window size, ribbon glazing
// on some towers, and each window dark, lit or curtained. (Derivatives taken before the branch.)
float hs=vHouseSeed,h2=fract(hs*13.7),h3=fract(hs*29.3),h4=fract(hs*51.9);
float along=abs(vPartNormal.x)>.5?vPartLocal.z*vPartScale.z:vPartLocal.x*vPartScale.x,up=vPartLocal.y*vPartScale.y;
vec2 g=vec2(along,up)/vec2(2.4+1.6*h2,2.75+.55*h3);
// Where a cell is a few pixels wide the grid would alias: show its average instead.
float detail=1.0-smoothstep(.15,.4,max(fwidth(g.x),fwidth(g.y)));
if((vPart<.5||vPart>2.5)&&abs(vPartNormal.y)<.5){
 float tower=step(9.0,vPartScale.y),ribbon=tower*step(.55,fract(hs*3.9));
 vec2 fill=mix(vec2(.32+.3*h4,.36+.22*fract(hs*7.3)),vec2(.92,.6),ribbon),f=fract(g);
 float inside=step(.5,up)*step(up,vPartScale.y-.2);
 houseWindow=step(abs(f.x-.5),fill.x*.5)*step(abs(f.y-.55),fill.y*.5)*inside;
 float frame=step(abs(f.x-.5),fill.x*.5+.03)*step(abs(f.y-.55),fill.y*.5+.04)*(1.0-houseWindow)*inside*(1.0-ribbon);
 // Rain streaks under the sills, grime rising from the pavement, a band at each floor slab.
 float streak=(1.0-houseWindow)*step(abs(f.x-.5),fill.x*.45)*(1.0-smoothstep(0.0,.4,f.y))*.12;
 float grime=1.0-(.18+.2*fract(hs*71.1))*(1.0-smoothstep(0.0,1.4,up));
 float slab=vPartScale.y>7.0?(1.0-smoothstep(0.0,.02,abs(f.y-.06)))*.18:0.0;
 float course=vPart>2.5?(1.0-smoothstep(0.0,.12,fract(up/.2)))*.15:0.0;
 // A darker plant floor or parapet on top of a tower.
 float crown=tower*step(vPartScale.y-1.5-2.5*h3,up);
 float state=fract(sin(dot(floor(g)+hs*17.0,vec2(12.99,78.23)))*43758.55);
 vec3 glass=state<.62?vec3(.02,.025,.03):state<.86?vec3(.09,.08,.065):vec3(.17,.14,.1);
 // Tenants: blocks of a few bays and floors, each with its own blinds, glass tone and lights, so a tower far off is still
 // mottled instead of one flat pale box (blockDetail: while a block is a few pixels or more), and a plant floor of
 // louvres every 6-11 floors on the towers.
 vec2 blockSize=vec2(3.0+2.0*fract(hs*5.1),2.0+2.0*fract(hs*8.7)),gb=floor(g/blockSize);
 float blk=fract(sin(dot(gb+hs*31.0,vec2(41.3,17.9)))*43758.55),blockDetail=1.0-smoothstep(.45,1.1,max(fwidth(g.x)/blockSize.x,fwidth(g.y)/blockSize.y));
 float plantEvery=6.0+floor(6.0*fract(hs*2.3)),plant=tower*inside*step(fract(g.y/plantEvery)*plantEvery,1.0),plantDetail=1.0-smoothstep(.3,.7,fwidth(g.y));
 houseWindow*=1.0-plant;
 vec3 near=diffuseColor.rgb*grime*(1.0-streak-course)*mix(.93,1.06,blk)+slab;
 near=mix(near,vec3(.78,.77,.74),frame*.8);
 near=mix(near,glass*mix(.8,1.25,blk),houseWindow*.92);
 near=mix(near,vec3(.16,.165,.17),plant*.85);
 vec3 far=mix(diffuseColor.rgb*grime,vec3(.04,.045,.05)*mix(.7,1.8,blk*blockDetail),fill.x*fill.y*.8*inside);
 far*=mix(1.0,mix(.74,1.16,blk),blockDetail*tower)*(1.0-plant*plantDetail*.3);
 diffuseColor.rgb=mix(far,near,detail)*(1.0-crown*.3);
 // At night about a quarter of the blocks are in (warm homes, a cool office now and then): their windows lit one by one up
 // close, as the block's average glow farther off, and as the building's own share beyond that.
 if(houseNight>0.0){
  float occupied=pow(blk,2.6)*(1.0-plant);
  float lit=mix(mix(.2*fill.x*fill.y*inside,fill.x*fill.y*inside*occupied,blockDetail),houseWindow*step(fract(state*7.13),occupied*.95),detail);
  totalEmissiveRadiance+=houseNight*lit*mix(vec3(1.0,.66,.34),vec3(.72,.78,.86),step(.72,fract(blk*9.1)))*1.1;
 }
 houseWindow*=detail;
}`).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
// Glass is smooth: it mirrors the sky and the neighbours instead of looking painted on.
roughnessFactor=mix(roughnessFactor,.06,houseWindow);`).replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
// What the vertex shader reshapes above the walls (each roof's own pitch and ridge, the tanks moved or mirrored)
// takes its normal from the screen derivatives; walls and the round drums keep their own (a flat-shaded drum
// showed its 64 facets as stripes). Derivatives taken before the branch.
vec3 houseFacet=normalize(cross(dFdx(vViewPosition),dFdy(vViewPosition)));
if(vPart>.5&&vPart<2.5&&vPartLocal.y>1.0){normal=houseFacet;nonPerturbedNormal=normal;}`).replace('#include <fog_fragment>',`#ifdef USE_FOG
 // The skyline's towers stand beyond the fog's far end: their feet melt into the ground haze with the land round them,
 // but above it up to half of their own tone stays, so their facades, setbacks and lit blocks read through the haze.
 // Only where the fog reaches far (a clear day's Média view and beyond: a short view, a drizzle or the rain keep them in
 // it, as the land round them), and every tower is wholly fog before the view's far end cuts it (skylineFar: the
 // camera's far plane, main.js applyViewDistance; Curta's 1.9 km sliced the towers standing past it).
 #ifdef FOG_EXP2
  float fogFactor=1.0-exp(-fogDensity*fogDensity*vFogDepth*vFogDepth),fogReach=0.0;
 #else
  float fogFactor=smoothstep(fogNear,fogFar,vFogDepth),fogReach=fogFar;
 #endif
 if(vPartScale.y>30.0)fogFactor=min(fogFactor,mix(1.0,.45,smoothstep(6.0,55.0,up)*smoothstep(1850.0,2300.0,fogReach)));
 fogFactor=max(fogFactor,smoothstep(skylineFar*.8,skylineFar*.97,vFogDepth));
 gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,fogFactor);
#endif`);
 };
 material.defines={tree:{TREES:'',...(plain?{TREE_PLAIN:''}:{})},house:{HOUSES:''},crowd:{CROWD:''}}[kind];
 material.customProgramCacheKey=()=>'scenery-'+kind+(foliage?'-foliage':'')+(plain?'-plain':'')+'-v11';
 return material;
}
// The trees' shadows take the same shape as the trees (lean, crown): the shadow pass draws them
// with this material, which keeps the vertex work of sceneryMaterial('tree').
// (The shadow pass gives it the tree material's leaf map, cut-out and side; like the default depth
// material it replaces, its program is built on the first frame with shadows: the shadow pass draws
// without the scene's fog, so a compile at loading would build another one.)
function treeDepthMaterial(){
 const material=new THREE.MeshDepthMaterial();
 material.onBeforeCompile=shader=>{
  shader.uniforms.landTime=shared.time;
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute float partMask;uniform float landTime;
#ifdef USE_INSTANCING
${TREE_SHAPE}
#endif`).replace('#include <begin_vertex>','#include <begin_vertex>\n'+TREE_VERTEX);
 };
 material.customProgramCacheKey=()=>'scenery-tree-depth-v3';
 return material;
}
// The same for the houses that reshape (pitched roofs, laje tanks): their shadows take each roof's pitch and
// ridge and each tank's corner (or none). Built on the first frame with shadows, like the trees'.
function houseDepthMaterial(){
 const material=new THREE.MeshDepthMaterial();
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float partMask;').replace('#include <begin_vertex>',`#include <begin_vertex>
#ifdef USE_INSTANCING
${HOUSE_VERTEX}
#endif`);
 };
 material.customProgramCacheKey=()=>'scenery-house-depth-v1';
 return material;
}
// A shadow program of its own is built the first time the shadow pass draws one of its meshes. One mesh per
// such material goes unculled until then (3 s after it is first drawn at most: shadows may be off), so that
// happens on the first frames with shadows, not the first time the car nears a house mid-race.
const warmedShadows=new WeakSet();
function warmShadow(mesh){
 if(warmedShadows.has(mesh.customDepthMaterial))return;warmedShadows.add(mesh.customDepthMaterial);
 let first=0;const done=()=>{mesh.frustumCulled=true;mesh.onAfterShadow=THREE.Object3D.prototype.onAfterShadow;mesh.onBeforeRender=THREE.Object3D.prototype.onBeforeRender;};
 mesh.frustumCulled=false;mesh.onAfterShadow=done;mesh.onBeforeRender=()=>{const now=performance.now();if(!first)first=now;else if(now-first>3000)done();};
}
function chunked(name,geometry,material,items,compose,{size=380,shadows=true,depth=null}={}){
 const root=new THREE.Group(),groups=new Map(),matrix=new THREE.Matrix4(),color=new THREE.Color();root.name=name;
 for(const item of items){const key=Math.floor(item.x/size)+':'+Math.floor(item.y/size);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
 for(const list of groups.values()){
  const mesh=new THREE.InstancedMesh(geometry,material,list.length);mesh.name=name+'_bloco';
  list.forEach((item,i)=>{compose(item,matrix,color);mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,color);item.instance={mesh,index:i};});
  mesh.computeBoundingSphere();mesh.castShadow=shadows;mesh.receiveShadow=true;if(depth){mesh.customDepthMaterial=depth;if(shadows)warmShadow(mesh);}root.add(mesh);
 }
 return root;
}
// Linear-space foliage albedo: real canopies reflect little light.
const TREE_GREENS=[[.085,.15,.04],[.065,.125,.035],[.11,.17,.05],[.06,.1,.045],[.13,.16,.06],[.075,.14,.06]];
// How far a crown reaches from its trunk at worst, in tree widths: the lumps' ~.55 (tall ~.27) stretched by
// TREE_SHAPE's lobes and spread (x1.4) plus its lean. Placement narrows a crown near a road, garage or stand,
// by up to 30%, so the shaped crown keeps its clearance; tighter than that the tree is left out.
const CROWN_REACH={round:.85,tall:.45};
function fitCrown(tree,edge,clear,kind='round'){const room=(edge-clear)/CROWN_REACH[kind];if(room<tree.width*.7)return false;tree.width=Math.min(tree.width,room);return true;}
function composeTree(item,matrix,color){
 matrix.compose(new THREE.Vector3(item.x,item.z,-item.y),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),item.turn),new THREE.Vector3(item.width,item.height,item.width));
 color.setRGB(...item.color);
}
// mobile: the untextured lumps show their albedo bare, so they get a darker, greyer palette.
const muted=(c,s,k)=>{const l=.2126*c[0]+.7152*c[1]+.0722*c[2];return c.map(v=>(l+(v-l)*s)*k);};
function treeGreen(a,b,dry=0,mobile=false){const c=TREE_GREENS[Math.floor(a*TREE_GREENS.length)],k=.85+b*.3,green=[c[0]*k+dry*.05,c[1]*k+dry*.01,c[2]*k];return mobile?muted(green,.72,.93):green;}
// A flowering ipê (yellow or dusty pink, part of the São Paulo landscape), a little greyer than the paint would be.
const ipeColor=(pink,mobile)=>pink?muted([.52,.16,.3],mobile?.34:.42,mobile?.78:.9):muted([.62,.44,.04],mobile?.68:.82,mobile?.8:.92);
function treeColor(rand,dry=0,mobile=false){
 // The draws stay as they were (the trees' places follow from the same stream); a pick that once made an ipê is only
 // marked: plantIpes decides where the ipês flower.
 const pick=rand();
 if(pick<.022)return Object.assign(ipeColor(pick>=.012,mobile),{ipe:true});
 return treeGreen(rand(),rand(),dry,mobile);
}
// Ipês flower in small groves, where a slow noise peaks (about 2-3 trees in a hundred), a little shorter than the wood
// round them. A tall column or a shrub never wears the blossom: the lone mauve obelisk drew every eye.
function plantIpes(trees,others,mobile){
 for(const t of trees){
  if(valueNoise(t.x/60+11.3,t.y/60-4.1)>.78&&hash2(t.x*.37,t.y*.53)<.55){t.color=ipeColor(valueNoise(t.x/170-2.2,t.y/170+6.6)>.55,mobile);t.height*=.8;t.ipe=true;}
  else if(t.color.ipe)t.color=treeGreen(hash2(t.x*.13,t.y*.29),hash2(t.y*.71,t.x*.11),0,mobile);
 }
 for(const t of others)if(t.color.ipe)t.color=treeGreen(hash2(t.x*.13,t.y*.29),hash2(t.y*.71,t.x*.11),0,mobile);
}

// Circuits from open data pass cover (data.scenery.cover: a class per terrain cell) and
// buildings (data.scenery.buildings: real footprints as oriented rectangles) instead of
// an orthophoto; cityAngle points the distant skyline at the city (radians, track frame).
// density: trees and houses per area against the standard build (the Gráficos tab's scenery level);
// lod: how near a tree block shows its full crowns.
// lean: the cheapest scenery (Básico): plain near lumps and no shrubs.
// city: a real city's map (city-map.js): grass tufts only on its lawns and lots, never on its streets and sidewalks.
export function createLandscape({data,field,ortho=null,cover=null,buildings=null,cityAngle=Math.PI/2,mobile=false,style='urban',density=1,lod=mobile?80:130,ground=null,lean=false,city=null}){
 const root=new THREE.Group();root.name='Paisagem';const spread=1/Math.sqrt(density);
 const rand=random(data.samples.length*7919+17),stats={trees:0,houses:0,water:0};
 const trees=[],tall=[],houses=[],flats=[],lajes=[],rounds=[];
 const {x0,y0,width,height}=field;
 let bodies=[],simpleWater=null,simplePatch=null,lakes=null,shore=null,waves=null,woodAt=null;terrainShore.shoreOn.value=0;terrainShore.shoreMap.value=null;
 // Lakes for the car: the surface over a point (null on land), the nearest lake from the
 // bank, and the waves the car pushes (lake-waves.js), shown by a patch that follows it.
 const water={
  at(x,y){if(!shore)return null;const s=shore.distance(x,y);if(s<-1.5)return null;const body=shore.body(x,y);return body?{level:body.level,shore:s,depth:lakeBedDepth(s)}:null;},
  near(x,y){if(!shore)return null;const body=shore.body(x,y);return body?{level:body.level,shore:shore.distance(x,y)}:null;},
  waves:null
 };
 // Trunks and walls stay out of the water: clear of the shore, and above the level beside a lake.
 const dry=(x,y,clearance)=>{
  if(!shore)return true;const s=shore.distance(x,y);if(s>-clearance)return false;if(s<-8)return true;
  const body=shore.body(x,y);return !body||terrainHeight(data,x,y)>body.level+.35;
 };
 if(ortho){
  bodies=findWater(field,ortho,data);stats.runoffPaintCells=markRunoffPaint(field,ortho,data);field.upload();stats.water=bodies.length;
  if(bodies.length){
   shore=shoreField(field,bodies);stats.lakeBed=digLakeBeds(data.terrain,data.terrain.z,shore);
   terrainShore.shoreMap.value=shore.texture;terrainShore.shoreBounds.value.copy(shore.bounds);terrainShore.shoreOn.value=1;
   waves=water.waves=new LakeWaves(water,{mobile});
   simpleWater=waterMesh(field,bodies,waves,shore);root.add(simpleWater);
   simplePatch=new THREE.Mesh(waves.patchGeometry(),simpleWaterMaterial(shore,waves,true));simplePatch.name='Lago_ondas';simplePatch.receiveShadow=true;simplePatch.visible=false;root.add(simplePatch);
  }
  const spacing=(mobile?8.5:6)*spread;woodAt=(x,y)=>{const i=ortho.index(x,y);return i<0?0:landCover(ortho,i).tree;};
  for(let y=y0+spacing/2;y<y0+height;y+=spacing)for(let x=x0+spacing/2;x<x0+width;x+=spacing){
   const px=x+(rand()-.5)*spacing*.9,py=y+(rand()-.5)*spacing*.9,i=ortho.index(px,py),cell=field.cell(px,py);
   if(i<0||cell<0||field.water[cell]||!dry(px,py,2.5))continue;const edge=field.edge[cell],cover=landCover(ortho,i);
   if(edge>9&&cover.tree>.45&&rand()<Math.pow(cover.tree,1.4)*.9){
    const h=(edge<25?6:7.5)+rand()*6.5,list=rand()<.22?tall:trees;
    const tree={x:px,y:py,z:terrainHeight(data,px,py)-.3,height:list===tall?h*1.45:h,width:(list===tall?.75:.9)*h*(.8+rand()*.35),turn:rand()*Math.PI*2,color:treeColor(rand,0,mobile)};
    // The crown (about half the width across, more once shaped: fitCrown) stays 2 m clear of roads, garages and stands.
    if(edge>tree.width/2+2&&fitCrown(tree,edge,2,list===tall?'tall':'round'))list.push(tree);
   }
  }
  // Houses follow the local street grid: the orientation of the photo's edges.
  const houseSpacing=(mobile?11:8.2)*spread,ow=ortho.w;
  for(let y=y0+houseSpacing/2;y<y0+height;y+=houseSpacing)for(let x=x0+houseSpacing/2;x<x0+width;x+=houseSpacing){
   const px=x+(rand()-.5)*2.5,py=y+(rand()-.5)*2.5,i=ortho.index(px,py),cell=field.cell(px,py);
   if(i<0||cell<0||field.inside[cell]||field.water[cell]||field.edge[cell]<42||!dry(px,py,6))continue;
   const cover=landCover(ortho,i);if(cover.roof<.5||rand()>.92)continue;
   let xx=0,yy=0,xy=0;const cx=i%ow,cy=(i-cx)/ow;
   for(let v=-4;v<=4;v++)for(let u=-4;u<=4;u++){const a=(Math.min(ortho.h-2,Math.max(1,cy+v)))*ow+Math.min(ow-2,Math.max(1,cx+u)),gx=ortho.lum[a+1]-ortho.lum[a-1],gy=ortho.lum[a+ow]-ortho.lum[a-ow];xx+=gx*gx;yy+=gy*gy;xy+=gx*gy;}
   const turn=.5*Math.atan2(2*xy,xx-yy),tallBuilding=rand()<.04,floors=tallBuilding?3+Math.floor(rand()*5):rand()<.62?1:2;
   const w=6+rand()*3.5,d=8+rand()*5,corner=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>terrainHeight(data,px+a*w*.5,py+b*d*.5));
   const item={x:px,y:py,z:Math.min(...corner)-.15,w,d,h:floors*3+.4+rand()*.6,turn:-turn,color:tallBuilding?[.42,.43,.44]:[.42+rand()*.16,.11+rand()*.06,.04+rand()*.03]};
   if(!tallBuilding&&rand()<.4){item.color=[.47,.46,.44];lajes.push(item);}else (tallBuilding?flats:houses).push(item);
  }
 }else if(cover){
  // Woods and scrub where the land-cover grid (ESA WorldCover, OSM woods) says so.
  const classAt=(x,y)=>{const i=Math.floor((x-cover.x0)/cover.step+.5),j=Math.floor((y-cover.y0)/cover.step+.5);return i<0||j<0||i>=cover.nx||j>=cover.ny?'0':cover.classes[j*cover.nx+i];};
  const spacing=(mobile?9:6.5)*spread;woodAt=(x,y)=>classAt(x,y)==='1'?1:0;
  for(let y=y0+spacing/2;y<y0+height;y+=spacing)for(let x=x0+spacing/2;x<x0+width;x+=spacing){
   const px=x+(rand()-.5)*spacing*.9,py=y+(rand()-.5)*spacing*.9,cell=field.cell(px,py),kind=classAt(px,py);
   if(cell<0||(kind!=='1'&&kind!=='2'))continue;const edge=field.edge[cell];
   // (A city's woods stay off its streets, sidewalks and squares' paving.)
   if(city){const surface=city.surface(px,py);if(surface!=='green'&&surface!=='lot')continue;}
   if(edge<=9||rand()>(kind==='1'?.72:.22))continue;
   const h=kind==='1'?(edge<25?7:8.5)+rand()*7:3+rand()*3.5,list=kind==='1'&&rand()<.2?tall:trees;
   const tree={x:px,y:py,z:terrainHeight(data,px,py)-.3,height:list===tall?h*1.4:h,width:(list===tall?.75:.95)*h*(.8+rand()*.35),turn:rand()*Math.PI*2,color:treeColor(rand,kind==='2'?.7:0,mobile)};
   if(edge>tree.width/2+2&&fitCrown(tree,edge,2,list===tall?'tall':'round'))list.push(tree);
  }
  // Trees mapped one by one (data.scenery.trees: the DF's isolated trees still standing in 2025).
  for(const [px,py] of data.scenery?.trees?.items??[]){
   const cell=field.cell(px,py);if(cell<0)continue;const edge=field.edge[cell];if(edge<=6)continue;
   const h=6+rand()*6,list=rand()<.2?tall:trees;
   const tree={x:px,y:py,z:terrainHeight(data,px,py)-.3,height:list===tall?h*1.35:h,width:(list===tall?.8:1)*h*(.8+rand()*.35),turn:rand()*Math.PI*2,color:treeColor(rand,0,mobile)};
   if(edge>tree.width/2+1.5&&fitCrown(tree,edge,1.5,list===tall?'tall':'round'))list.push(tree);
  }
  // Real buildings: OSM and Microsoft footprints, each its own oriented rectangle; from a local
  // cadastre (the DF's) also apartment blocks ('predio') and round ones ('redondo', a drum).
  const cols=Object.fromEntries((buildings?.columns??[]).map((k,i)=>[k,i]));
  for(const b of buildings?.items??[]){
   const x=b[cols.x],y=b[cols.y],w=b[cols.w],d=b[cols.d],turn=b[cols.heading],h=b[cols.h],kind=b[cols.kind],shed=kind==='galpao',c=Math.cos(turn),sn=Math.sin(turn);
   const corner=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,e])=>terrainHeight(data,x+c*a*w/2-sn*e*d/2,y+sn*a*w/2+c*e*d/2));
   const item={x,y,z:Math.min(...corner)-.15,w,d,h,turn,color:shed?[.5+rand()*.12,.52+rand()*.1,.53+rand()*.1]:[.42+rand()*.16,.11+rand()*.06,.04+rand()*.03]};
   if(kind==='redondo'){item.color=[.86,.86,.84];rounds.push(item);}
   else if(kind==='predio'){item.color=[.56+rand()*.1,.55+rand()*.08,.5+rand()*.06];flats.push(item);}
   else if(shed)flats.push(item);else if(rand()<.35){item.color=[.47,.46,.44];lajes.push(item);}else houses.push(item);
  }
 }else if(style==='cerrado'){
  // Sparse, low cerrado trees away from the oval and the service area.
  const spacing=(mobile?16:11)*spread;
  for(let y=y0+spacing/2;y<y0+height;y+=spacing)for(let x=x0+spacing/2;x<x0+width;x+=spacing){
   const px=x+(rand()-.5)*spacing,py=y+(rand()-.5)*spacing,cell=field.cell(px,py);if(cell<0||field.edge[cell]<55||field.inside[cell]&&field.edge[cell]<70)continue;
   if(rand()>.18+.5*smooth(.55,.8,Math.sin(px*.013)*Math.cos(py*.011)*.5+.5))continue;
   const h=3.2+rand()*4.2;trees.push({x:px,y:py,z:terrainHeight(data,px,py)-.2,height:h,width:h*(1+rand()*.4),turn:rand()*Math.PI*2,color:treeColor(rand,.8,mobile)});
  }
 }
 // Forest edges: a woody understorey of shrubs and young crowns low on the open side of the edge
 // trees, so their trunks do not stand in a bare row under one crown line. Shrubs are scenery
 // only (no trunk to hit), from their own random so the trees keep their places; fewer on the light builds.
 const shrubs=[];
 if(woodAt&&!lean){
  const r=random(trees.length*31+5),probe=9;
  for(const t of trees){
   // An edge tree has wood behind it and open ground on one side (a lone tree in a field has none).
   let open=null,low=.3,openings=0;
   for(let k=0;k<6;k++){const a=k*Math.PI/3,w=woodAt(t.x+Math.cos(a)*probe,t.y+Math.sin(a)*probe);if(w<.3)openings++;if(w<low){low=w;open=a;}}
   if(open===null||openings>3||r()>(mobile?.22:.42))continue;
   for(let n=r()<.2?2:1;n>0;n--){
    const a=open+(r()-.5)*1.3,d=1.5+r()*4.5,px=t.x+Math.cos(a)*d,py=t.y+Math.sin(a)*d,cell=field.cell(px,py);
    const h=1.5+r()*2.4,item={x:px,y:py,z:terrainHeight(data,px,py)-h*(.18+r()*.2),height:h,width:h*(1.3+r()*.8),turn:r()*Math.PI*2,color:treeColor(r,.15*r(),mobile),kind:'round',shrub:true};
    if(cell<0||field.water[cell]||field.edge[cell]<=9||field.edge[cell]<=item.width/2+2||!dry(px,py,1.5)||!fitCrown(item,field.edge[cell],2))continue;
    shrubs.push(item);
   }
  }
 }
 stats.shrubs=shrubs.length;plantIpes(trees,[...tall,...shrubs],mobile);stats.ipes=trees.filter(t=>t.ipe).length;
 // Trees are chunked in 200 m blocks; each block shows its near or its distant crowns, picked every
 // frame. The distant crowns are one mesh per block. Near, on the full builds, every kind has three
 // crown forms and each tree wears the one its position picks: one mesh per form in the block (two
 // more draws only in the near blocks, and no vertex work for crowns a tree does not wear).
 const seeds={round:[11,37,59],tall:[23,71,97]},forms=mobile?1:3;
 const treeMaterial=sceneryMaterial('tree',{foliage:!mobile,plain:lean}),treeShadow=treeDepthMaterial();
 const lodBlocks=[],geometries=[],matrix=new THREE.Matrix4(),color=new THREE.Color();
 for(const [list,kind,name] of [[[...trees,...shrubs],'round','Arvores'],[tall,'tall','Arvores_altas']]){
  if(!list.length)continue;
  const far=mobile?treeGeometry(kind,seeds[kind][0],0):foliageTreeGeometry(kind,seeds[kind][0],0);
  const near=seeds[kind].slice(0,forms).map((seed,form)=>mobile?treeGeometry(kind,seed,1,lean):foliageTreeGeometry(kind,seed,1,form));geometries.push(far,...near);
  const group=new THREE.Group(),blocks=new Map();group.name=name;root.add(group);
  for(const item of list){item.kind=kind;item.form=Math.floor(hash2(item.x*.731,item.y*.917)*forms);const key=Math.floor(item.x/200)+':'+Math.floor(item.y/200);if(!blocks.has(key))blocks.set(key,[]);blocks.get(key).push(item);}
  const instanced=(geometry,items,slot)=>{
   const mesh=new THREE.InstancedMesh(geometry,treeMaterial,items.length);mesh.name=name+'_bloco';mesh.customDepthMaterial=treeShadow;mesh.castShadow=mesh.receiveShadow=true;
   items.forEach((item,i)=>{composeTree(item,matrix,color);mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,color);item[slot]={mesh,index:i};});
   mesh.computeBoundingSphere();group.add(mesh);return mesh;
  };
  for(const items of blocks.values()){
   const distant=instanced(far,items,'instance'),close=near.map((g,form)=>items.filter(item=>item.form===form)).map((own,form)=>own.length?instanced(near[form],own,'nearInstance'):null).filter(Boolean);
   for(const mesh of close)mesh.visible=false;
   lodBlocks.push({far:distant,near:close,center:distant.boundingSphere.center.clone(),radius:distant.boundingSphere.radius,close:false});
  }
 }
 const lodDistance=lod;
 const houseMaterial=sceneryMaterial('house'),composeHouse=(item,matrix,color)=>{matrix.compose(new THREE.Vector3(item.x,item.z,-item.y),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),item.turn),new THREE.Vector3(item.w,item.h,item.d));color.setRGB(...item.color);};
 const houseShadow=houses.length||lajes.length?houseDepthMaterial():null;
 if(houses.length)root.add(chunked('Casas',houseGeometry(false),houseMaterial,houses,composeHouse,{size:450,depth:houseShadow}));
 if(flats.length)root.add(chunked('Predios',houseGeometry(true),houseMaterial,flats,composeHouse,{size:900}));
 if(lajes.length)root.add(chunked('Casas_laje',houseGeometry('laje'),houseMaterial,lajes,composeHouse,{size:450,depth:houseShadow}));
 if(rounds.length)root.add(chunked('Predios_redondos',houseGeometry('round'),houseMaterial,rounds,composeHouse,{size:900}));
 // A circuit far out in the countryside (data.meta.horizon 'rural': Chapecó, 20 km from town) sees
 // farmland and the odd farmhouse to the horizon, not the city's rooftops and towers.
 const rural=data.meta?.horizon==='rural';
 const horizon=createHorizon(data,field,rand,{mobile,urban:style!=='cerrado'&&!rural,rural,cityAngle});root.add(horizon.root);
 // Only short grass belongs on maintained verges; aerial paved/built areas, painted run-offs and
 // the lakes stay bare. Use the fitted visible ground supplied by the circuit. A tuft spreads its
 // blades about a metre, so painted run-off a metre and a half away keeps it off too.
 const vegetated=(x,y)=>{
  if(city){const kind=city.surface(x,y);if(kind!=='green'&&kind!=='lot')return false;}
  if(ortho){
   // Paint as the terrain draws it (field.paint), round the tuft's metre-wide spread too.
   for(const [dx,dy] of [[0,0],[1.6,0],[-1.6,0],[0,1.6],[0,-1.6]]){const cell=field.cell(x+dx,y+dy);if(cell>=0&&field.paint[cell]>.1)return false;}
   const i=ortho.index(x,y);if(i<0)return false;const c=landCover(ortho,i);
   return c.paved<.35&&c.roof<.3&&c.water<.4;
  }
  if(cover){const i=Math.floor((x-cover.x0)/cover.step+.5),j=Math.floor((y-cover.y0)/cover.step+.5);return i>=0&&j>=0&&i<cover.nx&&j<cover.ny&&!['4','5','6'].includes(cover.classes[j*cover.nx+i]);}
  return true;
 };
 const verge=mobile?null:createVergeVegetation({data,field,ground:ground??((x,y)=>terrainHeight(data,x,y)),vegetated,dry,density,lod,time:shared.time});
 if(verge)root.add(verge.root);stats.grassTufts=verge?.count??0;
 Object.assign(stats,{trees:trees.length+tall.length,houses:houses.length+flats.length+lajes.length+rounds.length+horizon.buildings,chunks:0});root.traverse(o=>{if(o.isInstancedMesh)stats.chunks++;});
 let realistic=false;
 return {root,stats,dispose(){for(const g of geometries)g.dispose();treeShadow.dispose();verge?.dispose();lakes?.dispose();shore?.texture.dispose();waves?.dispose();simplePatch?.geometry.dispose();simplePatch?.material.dispose();},update(dt,camera){
  shared.time.value+=dt;lakes?.update();
  if(waves){waves.sync();const patch=realistic?lakes?.patch:simplePatch;if(simplePatch)simplePatch.visible=false;if(lakes)lakes.patch.visible=false;if(patch&&waves.active){patch.visible=true;waves.placePatch(patch);}}
  if(!camera)return;
  verge?.update(camera);
  for(const block of lodBlocks){const close=camera.position.distanceTo(block.center)-block.radius<lodDistance;if(block.close===close)continue;block.close=close;block.far.visible=!close;for(const mesh of block.near)mesh.visible=close;}
 },
 // Cars passing the verge grass push it (speed-particles.js wakeCars); none on the light builds.
 setCars(cars){verge?.setCars(cars);},
 // Trees give way to later trackside structures (marshal posts, TV towers): points {x,y,r} in track metres.
 clearAround(points){
  verge?.clearAround(points);
  let removed=0;const zero=new THREE.Matrix4().makeScale(0,0,0),changed=new Set();
  for(const item of [...trees,...tall,...shrubs]){
   if(item.removed||!item.instance||!points.some(q=>Math.hypot(item.x-q.x,item.y-q.y)<q.r+item.width*.45))continue;
   item.removed=true;for(const {mesh,index} of [item.instance,item.nearInstance].filter(Boolean)){mesh.setMatrixAt(index,zero);changed.add(mesh);}removed++;
  }
  for(const mesh of changed){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}
  stats.cleared=(stats.cleared??0)+removed;return removed;
 },
 // Standing trees, for their trunks (tree-contact.js): position, size, kind, colour and instance.
 trunks:()=>[...trees,...tall].filter(t=>!t.removed&&t.instance),
 // The physics ground was dug when the lakes were found; the visible terrain grid gets the same basin.
 digLakeBeds:heights=>shore?digLakeBeds(data.terrain,heights,shore):0,
 water,
 // Opt-in lakes with planar reflections; built the first time they are switched on.
 setRealisticWater(on){
  realistic=!!on;if(!bodies.length)return;
  if(realistic&&!lakes){lakes=realisticLakes(field,bodies,shore,waves,{mobile});root.add(lakes.root);}
  simpleWater.visible=!realistic;if(lakes)lakes.root.visible=realistic;
 },
 // The wave patch is hidden until the car nears a lake: show it while the programs compile at loading.
 revealWaves(on){if(!waves)return;const patch=realistic?lakes?.patch:simplePatch;if(patch)patch.visible=on||waves.active;},
 // The mirror pass renders into a linear target: compile those program variants during loading too.
 async compileWater(renderer,scene,camera){
  if(!realistic||!lakes)return;const previous=renderer.getRenderTarget();renderer.setRenderTarget(lakes.target);
  let pending;try{pending=renderer.compileAsync(scene,camera);}finally{renderer.setRenderTarget(previous);}await pending;
 },
 waterInfo:()=>({realistic,bodies:bodies.length,simpleVisible:!!simpleWater?.visible,waves:waves?.info()??null,...(realistic&&lakes?lakes.info():{reflections:0,level:null,size:null}),
  lakes:bodies.map(b=>{let x=0,y=0;for(const c of b.cells){const k=c%field.nx;x+=k;y+=(c-k)/field.nx;}return {level:b.level,area:Math.round(b.cells.length*field.sx*field.sy),center:[field.x0+(x/b.cells.length+.5)*field.sx,field.y0+(y/b.cells.length+.5)*field.sy]};})})};
}

// Brasília's TV tower (Lúcio Costa, 1967) on the horizon (data.scenery.landmarks): a concrete tripod,
// the steel shaft of triangular section tapering up, the observation deck at 75 m and the antenna mast
// with its warning light. h: total height (224 m). Its origin is the ground at the tower's centre.
function tvTower(h){
 const g=new THREE.Group(),steel=new THREE.MeshStandardMaterial({name:'Torre_TV_aco',color:0x8f969b,metalness:.45,roughness:.5});
 const concrete=new THREE.MeshStandardMaterial({name:'Torre_TV_concreto',color:0xd6d3ca,roughness:.9}),glass=new THREE.MeshStandardMaterial({name:'Torre_TV_mirante',color:0x2c3a44,metalness:.3,roughness:.25});
 const up=new THREE.Vector3(0,1,0),beam=(p,q,w,material)=>{const d=new THREE.Vector3().subVectors(q,p),m=new THREE.Mesh(new THREE.BoxGeometry(w,d.length(),w),material);m.position.copy(p).addScaledVector(d,.5);m.quaternion.setFromUnitVectors(up,d.normalize());g.add(m);return m;};
 const shaftFoot=26,shaftTop=h*.8;
 for(let k=0;k<3;k++){const a=k*2*Math.PI/3+Math.PI/6;beam(new THREE.Vector3(Math.cos(a)*17,-2,Math.sin(a)*17),new THREE.Vector3(Math.cos(a)*4.6,shaftFoot+1,Math.sin(a)*4.6),2.4,concrete);}
 const shaft=new THREE.Mesh(new THREE.CylinderGeometry(1.6,5.2,shaftTop-shaftFoot,3,1),steel);shaft.position.y=(shaftTop+shaftFoot)/2;g.add(shaft);
 // Bracing rings every 12 m read as the lattice from afar.
 for(let y=shaftFoot+6;y<shaftTop;y+=12){const r=5.2+(1.6-5.2)*(y-shaftFoot)/(shaftTop-shaftFoot),ring=new THREE.Mesh(new THREE.CylinderGeometry(r+.35,r+.35,.6,3),steel);ring.position.y=y;g.add(ring);}
 const deck=new THREE.Mesh(new THREE.CylinderGeometry(9.5,8.5,5,18),glass);deck.position.y=75;g.add(deck);
 const roof=new THREE.Mesh(new THREE.CylinderGeometry(10.2,10.2,.8,18),concrete);roof.position.y=77.9;g.add(roof);
 const mast=new THREE.Mesh(new THREE.CylinderGeometry(.35,.9,h-shaftTop,8),new THREE.MeshStandardMaterial({name:'Torre_TV_mastro',color:0xe8e6e0,roughness:.6}));mast.position.y=(h+shaftTop)/2;g.add(mast);
 const light=new THREE.Mesh(new THREE.SphereGeometry(1.1,10,8),new THREE.MeshStandardMaterial({name:'Torre_TV_luz',color:0xff2a1a,emissive:0xff2a1a,emissiveIntensity:2}));light.position.y=h+.6;g.add(light);
 g.traverse(o=>{if(o.isMesh)o.castShadow=false;});
 return g;
}

// Ground continues past the surveyed terrain, rising into hazy hills and a
// distant skyline so the world never ends at the edge of the LiDAR grid.
function createHorizon(data,field,rand,{mobile,urban,rural=false,cityAngle=Math.PI/2}){
 const t=data.terrain,root=new THREE.Group();root.name='Horizonte';
 // Over a plateau's rim the real valley is the horizon (far-terrain.js): no rings of made-up hills.
 if(data.meta?.horizon==='chapada')return {root,buildings:0};
 // A coastal city with its real relief out to the horizon (Floripa, far-terrain.js): no made-up ground either, only
 // the city's own buildings beyond the grid (data.scenery.skyline, each with its ground height z).
 const realFar=!!data.scenery?.far;
 const border=[],x1=t.x0+(t.nx-1)*t.step,y1=t.y0+(t.ny-1)*t.step,cx=(t.x0+x1)/2,cy=(t.y0+y1)/2;
 for(let i=0;i<t.nx-1;i++)border.push([t.x0+i*t.step,t.y0,0,-1]);
 for(let j=0;j<t.ny-1;j++)border.push([x1,t.y0+j*t.step,1,0]);
 for(let i=t.nx-1;i>0;i--)border.push([t.x0+i*t.step,y1,0,1]);
 for(let j=t.ny-1;j>0;j--)border.push([t.x0,t.y0+j*t.step,-1,0]);
 const rings=[0,25,90,260,620,1300,2600,5200],positions=[],colors=[],indices=[],base=t.z.reduce((s,z)=>s+z,0)/t.z.length;
 const hill=(x,y)=>{let s=0,a=1,f=.0011;for(let o=0;o<4;o++){s+=a*(Math.sin(x*f+o*1.7)*Math.cos(y*f*1.13+o*.9));a*=.5;f*=2.1;}return s;};
 border.forEach(([bx,by,nx,ny])=>{
  // Radial direction blends the edge normal into the centre direction to round the corners.
  const rx=bx-cx,ry=by-cy,rl=Math.hypot(rx,ry),dx=nx*.4+rx/rl*.6,dy=ny*.4+ry/rl*.6,dl=Math.hypot(dx,dy),edgeZ=terrainHeight(data,bx,by);
  for(const [k,dist] of rings.entries()){
   const x=bx+dx/dl*dist,y=by+dy/dl*dist,f=smooth(0,1400,dist),z=k===0?edgeZ-.05:edgeZ*(1-f)+(base+22+hill(x,y)*38+dist*.012)*f;
   positions.push(x,z,-y);const g=.75+.25*Math.sin(x*.01)*Math.cos(y*.013);
   const c=urban?[.21*g,.2*g,.17*g]:rural?[.17*g,.21*g,.11*g]:[.2*g,.2*g,.1*g];colors.push(...c);
  }
 });
 const R=rings.length,N=border.length;
 for(let i=0;i<N;i++){const j=(i+1)%N;for(let k=0;k<R-1;k++){const a=i*R+k,b=j*R+k;indices.push(a,a+1,b,b,a+1,b+1);}}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const ground=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({name:'Horizonte_solo',vertexColors:true,roughness:1}));ground.name='Horizonte_solo';ground.receiveShadow=false;if(!realFar)root.add(ground);
 let buildings=0;
 // The horizon ground's height at (x, y), as the rings are built: from the nearest edge point outwards.
 const groundAt=(x,y)=>{let best=Infinity,b=border[0];for(let i=0;i<N;i+=2){const q=border[i],d=(q[0]-x)**2+(q[1]-y)**2;if(d<best){best=d;b=q;}}
  const dist=Math.sqrt(best),f=smooth(0,1400,dist);return terrainHeight(data,b[0],b[1])*(1-f)+(base+22+hill(x,y)*38+dist*.012)*f;};
 const skyline=data.scenery?.skyline;
 if(skyline){
  // A real city around the circuit (Brasília: the DF cadastre's tall or large buildings out to 3.5 km,
  // superquadras, the Setor Noroeste, the Eixo Monumental; Goiânia: the city's registered towers and the
  // houses of the neighbourhoods around the circuit) instead of generic rooftops and towers.
  const cols=Object.fromEntries(skyline.columns.map((k,i)=>[k,i])),blocks=[],drums=[],homes=[];
  // A skyline item may carry its own ground height (cols.z: Floripa, from the city's 1 m terrain model).
  const at=(b,x,y)=>cols.z!==undefined?b[cols.z]:groundAt(x,y);
  for(const b of skyline.items){
   const x=b[cols.x],y=b[cols.y],kind=b[cols.kind];
   // Real house footprints get tiled roofs like the generic rooftops; a phone keeps half of them.
   if(kind==='casa'){if(mobile&&rand()<.5)continue;homes.push({x,y,z:at(b,x,y)-1.2,w:b[cols.w],d:b[cols.d],h:b[cols.h],turn:b[cols.heading],color:[.42+rand()*.14,.12+rand()*.05,.05]});continue;}
   const g=.5+rand()*.12,item={x,y,z:at(b,x,y)-2.5,w:b[cols.w],d:b[cols.d],h:b[cols.h]+2.5,turn:b[cols.heading],color:kind==='predio'?[g+.08,g+.06,g+.02]:[g,g+.01,g+.02]};
   (kind==='redondo'?drums:blocks).push(item);
  }
  const material=sceneryMaterial('house'),compose=(item,matrix,color)=>{matrix.compose(new THREE.Vector3(item.x,item.z,-item.y),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),item.turn),new THREE.Vector3(item.w,item.h,item.d));color.setRGB(...item.color);};
  root.add(chunked('Horizonte_cidade',houseGeometry(true),material,blocks,compose,{size:1500,shadows:false}));
  if(drums.length)root.add(chunked('Horizonte_redondos',houseGeometry('round'),material,drums,compose,{size:3000,shadows:false}));
  if(homes.length)root.add(chunked('Horizonte_casas',houseGeometry(false),material,homes,compose,{size:1100,shadows:false}));
  buildings=blocks.length+drums.length+homes.length;
  for(const mark of data.scenery.landmarks??[])if(mark.kind==='torre_tv'){const tower=tvTower(mark.h);tower.position.set(mark.x,groundAt(mark.x,mark.y)-.5,-mark.y);tower.name=mark.name;root.add(tower);buildings++;}
 }else if(urban&&!realFar){
  // Neighbourhood rooftops and, farther out, taller towers toward the city centre (north at Interlagos).
  const items=[],towers=[],count=mobile?1400:3600;
  for(let i=0;i<count;i++){
   const b=border[Math.floor(rand()*N)],rx=b[0]-cx,ry=b[1]-cy,rl=Math.hypot(rx,ry),dx=b[2]*.4+rx/rl*.6,dy=b[3]*.4+ry/rl*.6,dl=Math.hypot(dx,dy);
   const dist=12+Math.pow(rand(),1.6)*1200,x=b[0]+dx/dl*dist+(rand()-.5)*60,y=b[1]+dy/dl*dist+(rand()-.5)*60;
   const f=smooth(0,1400,dist),edgeZ=terrainHeight(data,b[0],b[1]),z=edgeZ*(1-f)+(base+22+hill(x,y)*38+dist*.012)*f;
   const floors=rand()<.08?3+Math.floor(rand()*6):1+Math.floor(rand()*2);
   // Blocks of flats get a flat roof (with the towers), not a house's pyramid on top of five floors.
   (floors>2?towers:items).push({x,y,z:z-1.2,w:6+rand()*4,d:8+rand()*6,h:floors*3+1,turn:Math.round(rand()*4)*Math.PI/2+(rand()-.5)*.3,color:floors>2?[.4,.42,.44]:[.42+rand()*.14,.12+rand()*.05,.05]});
  }
  for(let i=0;i<(mobile?90:220);i++){
   const angle=cityAngle+(rand()-.5)*2.4,dist=1700+rand()*2300,x=cx+Math.cos(angle)*dist,y=cy+Math.sin(angle)*dist+Math.max(0,dist-1500)*.2*Math.sin(cityAngle);
   // Long slab blocks, slender towers and the ordinary ones between.
   const shape=rand(),slab=shape<.25,slim=shape>.82;
   towers.push({x,y,z:base+15+hill(x,y)*38+dist*.012,w:slab?30+rand()*26:14+rand()*18,d:slab?12+rand()*5:14+rand()*18,h:slab?24+rand()*30:slim?70+rand()*80:28+Math.pow(rand(),2)*95,turn:rand()*Math.PI,color:[.26+rand()*.12,.29+rand()*.12,.33+rand()*.12]});
  }
  const material=sceneryMaterial('house'),compose=(item,matrix,color)=>{matrix.compose(new THREE.Vector3(item.x,item.z,-item.y),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),item.turn),new THREE.Vector3(item.w,item.h,item.d));color.setRGB(...item.color);};
  root.add(chunked('Horizonte_casas',houseGeometry(false),material,items,compose,{size:1100,shadows:false}));
  root.add(chunked('Horizonte_predios',towerGeometry(),material,towers,compose,{size:3000,shadows:false}));
  buildings=items.length+towers.length;
 }else if(rural){
  // Farmhouses and sheds scattered over the fields, one or two hundred metres apart.
  const items=[],count=mobile?60:160;
  for(let i=0;i<count;i++){
   const b=border[Math.floor(rand()*N)],rx=b[0]-cx,ry=b[1]-cy,rl=Math.hypot(rx,ry),dx=b[2]*.4+rx/rl*.6,dy=b[3]*.4+ry/rl*.6,dl=Math.hypot(dx,dy);
   const dist=40+Math.pow(rand(),1.3)*1500,x=b[0]+dx/dl*dist+(rand()-.5)*120,y=b[1]+dy/dl*dist+(rand()-.5)*120;
   const f=smooth(0,1400,dist),edgeZ=terrainHeight(data,b[0],b[1]),z=edgeZ*(1-f)+(base+22+hill(x,y)*38+dist*.012)*f,shed=rand()<.3;
   items.push({x,y,z:z-1.2,w:shed?12+rand()*14:7+rand()*4,d:shed?20+rand()*30:8+rand()*5,h:shed?5+rand()*2:3.6+rand()*1.2,turn:rand()*Math.PI,color:shed?[.55,.56,.57]:[.45+rand()*.14,.13+rand()*.05,.06]});
  }
  root.add(chunked('Horizonte_sitios',houseGeometry(false),sceneryMaterial('house'),items,(item,matrix,color)=>{matrix.compose(new THREE.Vector3(item.x,item.z,-item.y),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),item.turn),new THREE.Vector3(item.w,item.h,item.d));color.setRGB(...item.color);},{size:1100,shadows:false}));
  buildings=items.length;
 }
 return {root,buildings};
}

// Race-day shirts, linear albedo a little duller than paint: mostly white, black, grey and navy,
// Brazil yellow and green, a few team colours; null: any muted colour. Fan clubs fill a sector
// with their own colours: Brazil, a red team, a blue team.
const SHIRTS={white:[.58,.58,.56],black:[.03,.03,.034],grey:[.24,.24,.24],navy:[.04,.06,.15],denim:[.16,.26,.38],yellow:[.52,.42,.08],green:[.05,.19,.08],red:[.33,.06,.05],orange:[.44,.2,.06],wine:[.17,.04,.06],sky:[.3,.44,.58]};
const SHIRT_MIX=[['white',18],['black',13],['grey',8],['navy',10],['denim',5],['yellow',13],['green',7],['red',7],['orange',3],['wine',3],['sky',3],[null,10]];
const FAN_CLUBS=[null,[['yellow',45],['green',30],['navy',10],['white',15]],[['red',45],['white',25],['black',30]],[['navy',35],['sky',25],['white',30],['yellow',10]]];
const hash2=(i,j)=>{const h=Math.sin(i*127.1+j*311.7)*43758.5453;return h-Math.floor(h);};
function valueNoise(x,y){const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,su=u*u*(3-2*u),sv=v*v*(3-2*v);return (hash2(i,j)*(1-su)+hash2(i+1,j)*su)*(1-sv)+(hash2(i,j+1)*(1-su)+hash2(i+1,j+1)*su)*sv;}
// Worn and washed: a shirt is about 15% greyer than its dye (the flat, full colours read as toys).
const washed=c=>{const l=.2126*c[0]+.7152*c[1]+.0722*c[2];return c.map(v=>l+(v-l)*.85);};
function pickShirt(table,rand){
 let r=rand()*table.reduce((s,[,w])=>s+w,0);
 for(const [name,w] of table)if((r-=w)<=0){
  if(name)return washed(SHIRTS[name]);
  const c=[.08+rand()*.3,.08+rand()*.26,.08+rand()*.26],l=(c[0]+c[1]+c[2])/3;return c.map(v=>l+(v-l)*.7);
 }
 return SHIRTS.white;
}
// A seated fan facing +z (origin on the seat, limb ids for the pose in sceneryMaterial's FAN_POSE):
// torso, arms resting on the thighs, legs down to the step below, head, and a small flag on a stick
// in the right hand, folded away unless the fan waves it.
// far: the figure seen from beyond CROWD_NEAR, about a third to a half of the triangles: three-sided limbs, a four-sided
// torso, a low head and cap, no neck and no shoes (under a pixel there). The same limbs and masks, so it takes the same
// pose, colours and flag in the same program.
function fanGeometry(mobile,far=false){
 const parts=[],white=()=>[1,1,1],sides=far?3:mobile?4:6,limb=(r,from,to,mask,id)=>{
  const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),d=b.clone().sub(a),len=d.length();
  const g=new THREE.CylinderGeometry(r,r*.9,len,sides,1,true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));g.translate(...a.add(b).multiplyScalar(.5).toArray());
  parts.push({geometry:g,mask,color:white,attrs:{limb:id}});
 };
 parts.push({geometry:new THREE.CylinderGeometry(.165,.14,.5,far?4:sides+2).scale(1,1,.62).translate(0,.53,0),mask:1,color:white,attrs:{limb:0}});
 for(const x of [-1,1]){
  // T-shirt sleeves, bare forearms.
  limb(.055,[x*.2,.76,0],[x*.21,.47,.1],1,x<0?1:3);limb(.04,[x*.21,.47,.1],[x*.12,.35,.34],2,x<0?2:4);
  limb(.075,[x*.09,.3,.02],[x*.1,.31,.36],3,5);limb(.06,[x*.1,.3,.38],[x*.1,-.08,.42],3,6);
  if(!far)parts.push({geometry:new THREE.BoxGeometry(.1,.08,.24).translate(x*.1,-.13,.47),mask:0,color:()=>[.05,.05,.055],attrs:{limb:6}});
 }
 if(!far)parts.push({geometry:new THREE.CylinderGeometry(.05,.055,.1,6,1,true).translate(0,.81,0),mask:2,color:white,attrs:{limb:7}});
 parts.push({geometry:new THREE.SphereGeometry(.105,far?4:mobile?6:8,far?3:mobile?4:6).scale(.92,1.12,1).translate(0,far?.93:.95,.01),mask:2,color:white,attrs:{limb:7}});
 parts.push({geometry:new THREE.SphereGeometry(.112,far?4:mobile?6:8,far?2:3,0,Math.PI*2,0,Math.PI*.42).scale(.94,1.1,1.02).translate(0,far?.95:.97,-.01),mask:4,color:white,attrs:{limb:7}});
 // The flag: the stick carries on from the forearm (raised, it points up), the cloth hangs from its
 // top on both faces; colour data: distance from the stick and the face side, for the ripple.
 const E=new THREE.Vector3(...FAN_ELBOW),H=new THREE.Vector3(...FAN_HAND),dir=H.clone().sub(E).normalize(),top=new THREE.Vector3(...FLAG_TOP);
 const stick=new THREE.CylinderGeometry(.01,.01,.66,3,1,true);stick.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir));stick.translate(...H.clone().addScaledVector(dir,.29).toArray());
 parts.push({geometry:stick,mask:0,color:()=>[.12,.1,.08],attrs:{limb:8}});
 const across=new THREE.Vector3(1,0,0).addScaledVector(dir,-dir.x).normalize(),face=new THREE.Vector3().crossVectors(across,dir).normalize();
 for(const s of [1,-1]){
  const pos=[],nor=[],col=[],idx=[];
  for(let v=0;v<2;v++)for(let u=0;u<3;u++){pos.push(...top.clone().addScaledVector(across,u/2*.46).addScaledVector(dir,-v*.31).toArray());nor.push(...face.clone().multiplyScalar(s).toArray());col.push(u/2,s,v);}
  for(let u=0;u<2;u++)idx.push(...(s>0?[u,u+3,u+1,u+1,u+3,u+4]:[u,u+1,u+3,u+1,u+4,u+3]));
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setIndex(idx);
  parts.push({geometry:g,mask:5,colors:new Float32Array(col),attrs:{limb:8}});
 }
 return merge(parts);
}

// Seated fans on every grandstand step found in the static scene. Each step is a box; its top face
// gives the row. A step may also be {corners, face: [x, z], depth, sun}: the direction its fans look,
// how deep the row sits under a roof (0 front, 1 back) and the share of it the sun reaches.
// Friends sit together in one colour, fan clubs fill sectors, seats empty in patches; some fans
// stand, cheer or wave a flag, and everyone moves on their own clock. One draw call per circuit.
// lean (Baixo, integrated video): seats a quarter further apart, a fifth fewer fans.
// step.stand: a row of people standing (on a city's sidewalk behind the fences: city-crowd.js), none seated; step.ground(x, y):
// each one's feet on the ground there (a sidewalk climbing a hill), not on the row's highest corner.
export function createCrowd(steps,{mobile=false,lean=false}={}){
 const rand=random(steps.length*131+7),items=[],spacing=lean?1.22:mobile?.98:.69;
 for(const step of steps){
  const corners=step.corners??step,face=step.face;
  // Order the four corners around the centre so consecutive points share an edge.
  const mx=corners.reduce((v,q)=>v+q.x,0)/4,mz=corners.reduce((v,q)=>v+q.z,0)/4,top=[...corners].sort((u,v)=>Math.atan2(u.z-mz,u.x-mx)-Math.atan2(v.z-mz,v.x-mx));
  const [a,b,c,d]=top,cx=(a.x+b.x+c.x+d.x)/4,cz=(a.z+b.z+c.z+d.z)/4,y=Math.max(a.y,b.y,c.y,d.y);
  // Longest edge of the top face is the row direction.
  const edges=[[a,b],[b,c],[c,d],[d,a]].map(([p,q])=>({dx:q.x-p.x,dz:q.z-p.z,l:Math.hypot(q.x-p.x,q.z-p.z)})).sort((u,v)=>v.l-u.l),row=edges[0];
  if(row.l<4)continue;let ux=row.dx/row.l,uz=row.dz/row.l;
  // Fans look along (-uz, ux): turn the row so that is the requested direction.
  if(face&&face[1]*ux-face[0]*uz<0){ux=-ux;uz=-uz;}
  const turn=Math.atan2(-uz,ux),covered=step.depth!==undefined,sun=step.sun??1,sky=covered?.82-.48*Math.pow(step.depth,.75):1;
  // Each row starts at its own offset and seats are not evenly spaced, so fans never line up in columns.
  let group=0,shirt=null,standing=false;
  for(let t=-row.l/2+.3+rand()*spacing*.8;t<row.l/2-.3;t+=spacing*(.82+rand()*.36)){
   const px=cx+ux*t,pz=cz+uz*t;
   if(valueNoise(px*.23+7.3,pz*.23+(step.depth??0)*2.6)<.17||rand()<.04){group=0;continue;}
   const club=FAN_CLUBS[(n=>n<.27?1:n>.8?3:n>.7?2:0)(valueNoise(px/24+3.1,pz/24-1.7))];
   if(group<=0){group=1+Math.floor(Math.pow(rand(),1.7)*5);shirt=pickShirt(club&&rand()<.6?club:SHIRT_MIX,rand);standing=!!step.stand||rand()<.07;}
   group--;
   const own=rand()<.72?shirt:pickShirt(club&&rand()<.5?club:SHIRT_MIX,rand),bright=.8+rand()*.32,r=rand();
   // Poses as in FAN_POSE: seated 0, folded 1, phone 2, elbows on knees 3, standing 4, cheering 5, flag 6/7.
   const pose=standing?(r<.6?4:r<.84?5:7):r<.07?2:r<.19?1:r<.27?3:r<.31?5:r<.345?6:0;
   const depth=(rand()-.5)*.14,along=t+(rand()-.5)*.1;
   const ix=cx+ux*along-uz*depth,iy=-(cz+uz*along+ux*depth);
   items.push({x:ix,y:iy,z:step.ground?.(ix,iy)??y,turn,color:own.map(v=>v*bright),scale:.93+rand()*.14,pose,seed:rand(),sun,sky:sky*(.93+rand()*.14)});
  }
 }
 // Blocks of CROWD_CELL metres, each drawn near or far (fanGeometry far) as it looks to the camera of that draw (crowdNear:
 // within CROWD_NEAR through that camera's lens or not): the choice is made in the draw itself (onBeforeRender, one instance count or the other at
 // zero), so the main view, the cars' reflection probe and the mirrors each pick their own, with no update to call.
 // Most of a lap sees every fan far; on the main straight only the blocks beside the car are near.
 const near=fanGeometry(mobile),far=fanGeometry(mobile,true),material=sceneryMaterial('crowd'),root=new THREE.Group(),matrix=new THREE.Matrix4(),color=new THREE.Color(),blocks=new Map(),eye=new THREE.Vector3();root.name='Torcida';
 for(const item of items){const key=Math.floor(item.x/CROWD_CELL)+':'+Math.floor(item.y/CROWD_CELL);if(!blocks.has(key))blocks.set(key,[]);blocks.get(key).push(item);}
 for(const list of blocks.values()){
  // Each block its own geometries over the shared buffers, for its per-fan pose data (shared by its two meshes).
  const data=new Float32Array(list.length*4),fanData=new THREE.InstancedBufferAttribute(data,4),n=list.length;
  const [close,distant]=[near,far].map(geometry=>{
   const g=new THREE.BufferGeometry();for(const [k,v] of Object.entries(geometry.attributes))g.setAttribute(k,v);g.setIndex(geometry.index);g.boundingSphere=geometry.boundingSphere.clone();g.boundingSphere.radius+=1;g.setAttribute('fanData',fanData);
   const mesh=new THREE.InstancedMesh(g,material,n);mesh.castShadow=false;mesh.receiveShadow=true;return mesh;
  });
  close.name='Torcida_bloco';distant.name='Torcida_bloco_longe';distant.userData.farCrowd=true;
  list.forEach((item,i)=>{matrix.compose(new THREE.Vector3(item.x,item.z,-item.y),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),item.turn),new THREE.Vector3(item.scale,item.scale,item.scale));color.setRGB(...item.color);for(const mesh of [close,distant]){mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,color);}data.set([item.pose,item.seed,item.sun,item.sky],i*4);});
  close.computeBoundingSphere();distant.boundingSphere=close.boundingSphere.clone();
  // (each camera keeps its last choice for crowdNear's give; both meshes of the block agree within a pass)
  const {center,radius}=close.boundingSphere,chosen=new WeakMap(),isNear=camera=>{const near=crowdNear(eye.setFromMatrixPosition(camera.matrixWorld).distanceTo(center)-radius,camera,chosen.get(camera));chosen.set(camera,near);return near;};
  close.onBeforeRender=(renderer,scene,camera)=>{close.count=isNear(camera)?n:0;};
  distant.onBeforeRender=(renderer,scene,camera)=>{distant.count=isNear(camera)?0:n;};
  root.add(close,distant);
 }
 return {root,count:items.length};
}
const CROWD_CELL=60,CROWD_NEAR=50,CROWD_GIVE=4,LENS_REF=Math.tan(29*Math.PI/180);
// Near or far by how big a block looks, not by its metres alone: the distance shortened by the lens (the broadcast
// camera's long lens showed far fans 55-91 px tall; immersive-visuals.js detailLevel's rule, 29° the chase lens's
// half height), with CROWD_GIVE metres of give either way from the camera's last choice (was: undefined the first time),
// so a block on the line keeps its figure instead of flickering between the two from frame to frame.
export function crowdNear(distance,camera,was){
 const zoom=camera.isPerspectiveCamera?Math.tan(camera.fov*Math.PI/360)/(camera.zoom||1)/LENS_REF:1;
 return distance*zoom<CROWD_NEAR+(was===undefined?0:was?CROWD_GIVE:-CROWD_GIVE);
}

// Static circuit buildings from the GLB and the Curvelo scene get world-mapped
// concrete, ribbed garage doors and reflective glass instead of flat colours; the painted
// lines (GLB Pintura_branca, the open circuits' Pintura_borda) get wear.
export function structureMaterial(material,textures,cache=new Map()){
 if(!material||Array.isArray(material))return material;
 const kind={Concreto:'concrete',Metal:'metal',Vidros_boxes:'glass',Boxes_azul:'roof',Pintura_branca:'paint',Pintura_borda:'paint'}[material.name];
 if(!kind)return material;
 const key=material.uuid;if(cache.has(key))return cache.get(key);
 const upgraded=material.clone();upgraded.name=material.name+'_v2';
 // (the glass mirrors the sky at its full colour: sky.js SKY_REFLECTION, at the scene's strength as it always had)
 if(kind==='glass'){upgraded.color.setRGB(.02,.035,.045);upgraded.roughness=.06;upgraded.metalness=.4;skyMirror(upgraded);}
 else{
  upgraded.roughness=kind==='metal'?.42:kind==='roof'?.55:kind==='paint'?.62:.92;upgraded.metalness=kind==='metal'?.55:0;
  if(kind==='concrete')upgraded.color.setRGB(.56,.56,.54);
  upgraded.onBeforeCompile=shader=>{
   shader.uniforms.concreteMap={value:textures.concrete};
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vStructWorld,vStructNormal;').replace('#include <begin_vertex>','#include <begin_vertex>\nvStructWorld=(modelMatrix*vec4(transformed,1.0)).xyz;vStructNormal=normalize(mat3(modelMatrix)*objectNormal);');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform sampler2D concreteMap;varying vec3 vStructWorld,vStructNormal;
float structHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float structNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(structHash(i),structHash(i+vec2(1,0)),f.x),mix(structHash(i+vec2(0,1)),structHash(i+vec2(1,1)),f.x),f.y);}`).replace('#include <map_fragment>',`#include <map_fragment>
#if STRUCTURE_KIND==4
 // Painted lines, by world position (the GLB lines carry no UVs): brighter or duller at 0.3, 4 and
 // 40 m, worn through to the asphalt in places (about a tenth), smudged with rubber where cars cross.
 // The finer terms (3, 12 and 30 cm) give way to their average as a pixel grows over them (a line far ahead
 // at a grazing look), the worn edge softens with it: MSAA does not filter shading, they would crawl.
 vec2 paintW=vStructWorld.xz;float paintPx=length(fwidth(paintW));
 diffuseColor.rgb*=mix(.8,1.03,structNoise(paintW*.25)*.6+structNoise(paintW*.025)*.4)*mix(.9,1.02,mix(.5,structNoise(paintW*3.3),1.0-smoothstep(.12,.35,paintPx)));
 float paintThrough=smoothstep(.66-paintPx*.25,.8+paintPx*.25,structNoise(paintW*1.3+3.1)*.65+mix(.5,structNoise(paintW*8.0),1.0-smoothstep(.05,.15,paintPx))*.2+mix(.5,structNoise(paintW*31.0),1.0-smoothstep(.012,.04,paintPx))*.15);
 float paintRubber=smoothstep(.5,.85,structNoise(paintW*.45+7.7))*.45;
 diffuseColor.rgb=mix(diffuseColor.rgb*(1.0-paintRubber),vec3(.075,.073,.07),paintThrough*.85);
#else
vec3 blendN=pow(abs(normalize(vStructNormal)),vec3(4.0));blendN/=blendN.x+blendN.y+blendN.z;
vec3 wall=texture2D(concreteMap,vStructWorld.zy/3.2).rgb*blendN.x+texture2D(concreteMap,vStructWorld.xz/3.2).rgb*blendN.y+texture2D(concreteMap,vStructWorld.xy/3.2).rgb*blendN.z;
#endif
#if STRUCTURE_KIND==1
 // Cast concrete, not gravel: soften the aggregate toward its average and add broad weathering.
 vec3 wallAvg=texture2D(concreteMap,vStructWorld.xz/3.2,9.0).rgb;
 wall=wallAvg+(wall-wallAvg)*.2;
 float weather=texture2D(concreteMap,vStructWorld.xz/41.0+vec2(vStructWorld.y*.021,0.0)).g/max(wallAvg.g,.01);
 // Walls are cast in 3 m panels: each its own tone, sawn joints, rain streaks running down, broad stains.
 vec3 sn=normalize(vStructNormal);
 float panelAlong=abs(sn.x)>abs(sn.z)?vStructWorld.z:vStructWorld.x,upright=1.0-smoothstep(.5,.8,abs(sn.y));
 float panelId=floor(panelAlong/3.0),panelTone=.93+.14*structHash(vec2(panelId,floor(vStructWorld.y/3.0)+.5));
 float panelJoint=1.0-smoothstep(.008,.02+fwidth(panelAlong),(.5-abs(fract(panelAlong/3.0)-.5))*3.0);
 float rainStreak=structNoise(vec2(panelAlong*1.7,vStructWorld.y*.12))*.6+structNoise(vec2(panelAlong*5.0,vStructWorld.y*.3))*.4;
 float stain=structNoise(vec2(panelAlong*.08,vStructWorld.y*.16));
 diffuseColor.rgb*=wall*1.9*mix(.86,1.08,clamp(weather-.5,0.0,1.0))*(1.0-.12*blendN.y);
 diffuseColor.rgb*=mix(1.0,panelTone*(1.0-panelJoint*.35)*mix(.88,1.04,rainStreak)*mix(.9,1.05,stain),upright);
#elif STRUCTURE_KIND==2
 // Roller doors: horizontal ribs.
 float rib=smoothstep(.35,.5,abs(fract(vStructWorld.y*5.0)-.5));
 diffuseColor.rgb*=mix(.72,1.05,rib)*mix(vec3(1.0),wall*2.0,.35);
#elif STRUCTURE_KIND==3
 diffuseColor.rgb*=mix(vec3(1.0),wall*2.0,.45);
#endif`).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
#if STRUCTURE_KIND==4
 roughnessFactor=clamp(roughnessFactor+paintThrough*.25-paintRubber*.1,.3,1.0);
#endif`);
   // The lines lie in the cars' crisp shadow like the asphalt round them (car-shadow.js).
   if(kind==='paint')carShadowPatch(shader);
  };
  upgraded.defines={STRUCTURE_KIND:kind==='concrete'?1:kind==='metal'?2:kind==='paint'?4:3};
  upgraded.customProgramCacheKey=()=>'structure-'+kind+'-v3';
 }
 cache.set(key,upgraded);return upgraded;
}
