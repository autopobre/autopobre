import * as THREE from 'three';
import {canvasTexture} from './pit-textures.js';
import {guardrailClearance,guardrailPresent} from './physics.js';

// The structures of the Circuito do Minhocão (data.scenery.minhocao, gerar_minhocao.py): the Elevado Presidente João
// Goulart and the Radial Leste-Oeste tunnel under Praça Roosevelt. The road the race drives on is the track's asphalt
// (open-circuit.js) and its Jersey walls (street-walls.js); this module builds what holds it up and closes it in, from
// the published facts (research 2026-10-11):
// - The elevated (1971): ~2.7 km of deck 15.9 m edge to edge, 2+2 lanes with a central concrete barrier broken every
//   ~36 m, precast beams under a slab (a girder ~1.75 m deep here, flat soffit, drip groove at the fascia), a low
//   concrete parapet with railings ("gradis"), lamp posts on the central barrier. A single line of pillars in the
//   median of the avenue below, each a rounded column with a hammerhead cap; pillars painted, tagged, repainted grey.
//   Where a deck runs within ~4 m of the ground (the Ana Cintra ramp, the descent toward the tunnel, the ramps' feet)
//   it stands on solid walls instead.
// - Off the lap the deck carries its own road (asphalt, lane lines, barrier, parapets); on the lap the game's asphalt
//   and walls are the road, and the deck below is built from the track's stations so they match exactly.
// - The tunnel: half-buried road under Praça Roosevelt, retaining walls behind the Jersey walls, a roof slab 4.6 m over
//   the road under the plaza's concrete paving, portal headwalls, a row of lamps in the ceiling.
// Nothing enters the driving space (the asphalt and its walls, up to 4.6 m over the road; the Jersey zone up to 2.6 m).
// Geometry is merged per material and area (a draw call each); lamp posts are instanced.
const DRIVE=4.6,JERSEY_ZONE=2.6,DEPTH=1.75,LOW=4.2,PARAPET=.55,RAIL=1.08,BEYOND_GRID=30;

// --- Small vector kit on [x, y, z] arrays in the track frame (x east, y north, z up).
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],mul=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
const mad=(a,b,k)=>[a[0]+b[0]*k,a[1]+b[1]*k,a[2]+b[2]*k],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len=a=>Math.hypot(a[0],a[1],a[2]);
const unit=a=>{const l=len(a)||1;return [a[0]/l,a[1]/l,a[2]/l];};
const Z=[0,0,1],U0=[0,0,0],F0=[-1e4,0,0,0],T0=[0,0];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),lerp=(a,b,u)=>a+(b-a)*u;
const hash1=i=>{const h=Math.sin(i*91.7+13.1)*43758.5453;return h-Math.floor(h);};
function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
// Linear colour of a CSS colour times a brightness and a warm/cool shift (tone variation per element).
const tint=(css,k=1,warm=0)=>{const c=new THREE.Color(css);return [c.r*k*(1+warm),c.g*k,c.b*k*(1-warm)];};
function gridHeight(g,x,y){
 if(!g)return null;const fx=(x-g.x0)/g.step,fy=(y-g.y0)/g.step;if(fx<0||fy<0||fx>g.nx-1||fy>g.ny-1)return null;
 const i=Math.min(g.nx-2,Math.floor(fx)),j=Math.min(g.ny-2,Math.floor(fy)),u=fx-i,v=fy-j,k=j*g.nx+i;
 return (g.z[k]*(1-u)+g.z[k+1]*u)*(1-v)+(g.z[k+g.nx]*(1-u)+g.z[k+g.nx+1]*u)*v;
}

// Geometry gathered per mesh: flat quads with a vertex colour, 'mInfo' (the concrete shader's: ground height under the
// element, perimeter metres round a column, seed, paint style) and a uv (textured meshes). Built in the track frame,
// stored in three.js world axes (x, z, -y: a rotation, so windings keep their sense).
class Mesher{
 constructor(){this.p=[];this.n=[];this.c=[];this.f=[];this.t=[];this.i=[];}
 vertex(p,n,c,f=F0,t=T0){this.p.push(p[0],p[2],-p[1]);this.n.push(n[0],n[2],-n[1]);this.c.push(c[0],c[1],c[2]);this.f.push(f[0],f[1],f[2],f[3]);this.t.push(t[0],t[1]);}
 // a b c d go round the face; out points to its outer side (fixes the winding); f: one mInfo or one per corner.
 quad(a,b,c,d,col,out,f=F0,t=null){
  let n=cross(sub(c,a),sub(d,b)),fs=Array.isArray(f[0])?f:[f,f,f,f],ts=t??[T0,T0,T0,T0];
  if(out&&dot(n,out)<0){[b,d]=[d,b];fs=[fs[0],fs[3],fs[2],fs[1]];ts=[ts[0],ts[3],ts[2],ts[1]];n=mul(n,-1);}
  if(len(n)<1e-9)return;n=unit(n);const k=this.p.length/3;
  this.vertex(a,n,col,fs[0],ts[0]);this.vertex(b,n,col,fs[1],ts[1]);this.vertex(c,n,col,fs[2],ts[2]);this.vertex(d,n,col,fs[3],ts[3]);
  this.i.push(k,k+1,k+2,k,k+2,k+3);
 }
 tri(a,b,c,col,out,f=F0){let n=cross(sub(b,a),sub(c,a));if(out&&dot(n,out)<0){[b,c]=[c,b];n=mul(n,-1);}if(len(n)<1e-9)return;n=unit(n);const k=this.p.length/3;for(const p of [a,b,c])this.vertex(p,n,col,f);this.i.push(k,k+1,k+2);}
 // A box from A to B (its axis), w across (S = T × up) and h up.
 beam(A,B,w,h,up,col,f=F0,caps=true){
  const D=sub(B,A),l=len(D);if(l<1e-3)return;const T=mul(D,1/l);let S=cross(T,up);if(len(S)<1e-3)S=cross(T,Math.abs(T[2])<.9?Z:[1,0,0]);S=unit(S);const V=cross(S,T);
  const c=(P,x,y)=>add(P,add(mul(S,x*w/2),mul(V,y*h/2)));
  for(const [x0,y0,x1,y1,o] of [[-1,1,1,1,V],[1,-1,-1,-1,mul(V,-1)],[1,1,1,-1,S],[-1,-1,-1,1,mul(S,-1)]])this.quad(c(A,x0,y0),c(B,x0,y0),c(B,x1,y1),c(A,x1,y1),col,o,f);
  if(caps){this.quad(c(A,-1,-1),c(A,1,-1),c(A,1,1),c(A,-1,1),col,mul(T,-1),f);this.quad(c(B,-1,-1),c(B,1,-1),c(B,1,1),c(B,-1,1),col,T,f);}
 }
 cyl(A,B,r0,r1,seg,col,caps=true){
  const D=sub(B,A),l=len(D);if(l<1e-4)return;const T=mul(D,1/l);let S=cross(T,Z);if(len(S)<1e-3)S=[1,0,0];S=unit(S);const V=cross(S,T);
  const dir=k=>{const t=k/seg*Math.PI*2;return add(mul(S,Math.cos(t)),mul(V,Math.sin(t)));};
  for(let k=0;k<seg;k++){const d0=dir(k),d1=dir(k+1);this.quad(mad(A,d0,r0),mad(B,d0,r1),mad(B,d1,r1),mad(A,d1,r0),col,add(d0,d1));}
  if(caps)for(let k=1;k<seg-1;k++){this.tri(mad(A,dir(0),r0),mad(A,dir(k),r0),mad(A,dir(k+1),r0),col,mul(T,-1));this.tri(mad(B,dir(0),r1),mad(B,dir(k),r1),mad(B,dir(k+1),r1),col,T);}
 }
 // Sections swept along a path (same point count each, an open profile from the inner right round the bottom to the
 // inner left, seen with the path going away): a quad per edge and step, facing out. col: one colour, one per edge
 // or (i,j)=>colour; info(i,j,edge) the mInfo of section i's point j on that edge (a face never mixes two styles).
 loft(secs,col,info=null,closed=false){
  const m=secs[0].length,edges=closed?m:m-1;
  for(let i=0;i+1<secs.length;i++){
   const A=secs[i],B=secs[i+1];let dir=[0,0,0];for(let j=0;j<m;j++)dir=add(dir,sub(B[j],A[j]));
   for(let j=0;j<edges;j++){
    const j1=(j+1)%m;let e=sub(A[j1],A[j]);if(len(e)<1e-4)e=sub(B[j1],B[j]);if(len(e)<1e-4)continue;
    const de=add(sub(B[j],A[j]),sub(B[j1],A[j1])),c=typeof col==='function'?col(i,j):Array.isArray(col[0])?col[j]:col;
    const f=info?[info(i,j,j),info(i+1,j,j),info(i+1,j1,j),info(i,j1,j)]:F0;
    this.quad(A[j],B[j],B[j1],A[j1],c,cross(e,len(de)>1e-6?de:dir),f);
   }
  }
 }
 // A flat polygon (planar, maybe concave) facing out: triangulated in its own plane.
 polygon(points,col,out,f=F0){
  if(points.length<3)return;const N=unit(out),S=unit(Math.abs(N[2])<.9?cross(Z,N):cross([1,0,0],N)),V=cross(N,S);
  const flat=points.map(p=>new THREE.Vector2(dot(p,S),dot(p,V)));if(Math.abs(THREE.ShapeUtils.area(flat))<1e-4)return;
  for(const [a,b,c] of THREE.ShapeUtils.triangulateShape(flat,[]))this.tri(points[a],points[b],points[c],col,N,f);
 }
 get triangles(){return this.i.length/3;}
 get vertices(){return this.p.length/3;}
 geometry(uv=false){
  const g=new THREE.BufferGeometry(),n=this.p.length/3;
  g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
  if(uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(this.t,2));else g.setAttribute('mInfo',new THREE.Float32BufferAttribute(this.f,4));
  g.setIndex(n>65535?new THREE.Uint32BufferAttribute(this.i,1):new THREE.Uint16BufferAttribute(this.i,1));g.computeBoundingSphere();return g;
 }
}

// --- Materials.
const NOISE=`float mnH(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float mnN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mnH(i),mnH(i+vec2(1,0)),f.x),mix(mnH(i+vec2(0,1)),mnH(i+vec2(1,1)),f.x),f.y);}
vec3 mnPal(float k){k=fract(k);return k<.18?vec3(.55,.09,.06):k<.36?vec3(.86,.5,.06):k<.52?vec3(.07,.24,.52):k<.68?vec3(.1,.38,.17):k<.84?vec3(.78,.74,.66):vec3(.42,.12,.38);}`;
const WORLD=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 mInfo;varying vec4 vMInfo;varying vec3 vMPos;varying vec3 vMN;')
 .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvMInfo=mInfo;vMPos=(modelMatrix*vec4(transformed,1.)).xyz;vMN=normalize(mat3(modelMatrix)*objectNormal);');};
// Weathered cast concrete: pores and blotches, rain streaks down the faces, the formwork's lift joints every 1.2 m,
// darker undersides, street grime at the foot (mInfo.x: the ground under the element). Paint by mInfo.w: 2 bands of
// colour (Flávio Motta's 1971 pillars), 3 graffiti, 4 the city's grey repaint over old tags, 5 tunnel soot (mInfo.x:
// the road), 6 soffit (damp patches, a little white leaching), 7 a mural over a fascia or wall (mInfo.y along it,
// mInfo.x its foot), 8 a mural round a pillar. The open trench's walls get tags too (3, over the road). mInfo.y is the metres round a column, mInfo.z a seed: no two pillars alike.
function concreteMaterial(name){
 const m=new THREE.MeshStandardMaterial({name,vertexColors:true,roughness:.92,metalness:0});
 m.onBeforeCompile=shader=>{
  WORLD(shader);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec4 vMInfo;varying vec3 vMPos;varying vec3 vMN;
${NOISE}`).replace('#include <color_fragment>',`#include <color_fragment>
{vec3 cp=vMPos,cn=normalize(vMN);float side=1.-abs(cn.y),sd=vMInfo.z,st=vMInfo.w,b=vMInfo.y,h=cp.y-vMInfo.x;
vec2 q=abs(cn.y)>.7?cp.xz:(abs(cn.x)>abs(cn.z)?vec2(cp.z,cp.y):vec2(cp.x,cp.y));vec2 sq=q+sd*37.1;
float px=max(length(fwidth(cp)),1e-4),fine=1.-smoothstep(.025,.09,px);
float pores=mnN(sq*2.7)*.45+mix(.5,mnN(sq*9.3),fine)*.3+mnN(sq*.31)*.25;
float blot=smoothstep(.35,.85,mnN(sq*.11+3.1)*.7+mnN(sq*.43)*.3);
float streak=smoothstep(.42,.92,mnN(vec2(sq.x*1.25,cp.y*.07+sd*3.)));
float lift=abs(fract(cp.y/1.2)-.5)*1.2,fw=fwidth(cp.y);
float joint=(1.-smoothstep(0.,max(fw*1.2,.006),lift-.006))*side*(1.-smoothstep(.02,.07,fw));
vec3 col=diffuseColor.rgb*(.8+.28*pores)*(1.-.2*blot)*(1.-.26*streak*side)*(1.-.12*joint)*(1.-.18*max(-cn.y,0.));
float grime=(1.-smoothstep(.05,.9+.7*mnN(vec2(q.x*.6,sd)),h))*side;
col=mix(col,col*vec3(.5,.48,.45),grime*.75);
if(st>1.5&&st<2.5){
 float top=1.6+1.8*mnH(vec2(sd,1.)),diag=step(.5,mnH(vec2(sd,2.)));
 float fb=(h+diag*mod(b,512.)*.42)/(.5+.6*mnH(vec2(sd,3.)))+sd*7.,k=floor(fb),aa=min(.5,fwidth(fb));
 vec3 paint=mix(mnPal(mnH(vec2(k,sd))),mnPal(mnH(vec2(k+1.,sd))),smoothstep(1.-aa,1.,fract(fb)));
 float hw=max(.02,fwidth(h)),msk=smoothstep(.22-hw,.22,h)*(1.-smoothstep(top-hw*2.,top,h));
 float wear=mix(.5,smoothstep(.3,.8,mnN(vec2(b*2.1,h*2.9)+sd*11.)),fine);
 col=mix(col,paint*(.72+.32*pores),msk*(.78-.38*wear));
}else if(st>2.5&&st<3.5){
 float bb=mod(b,512.);vec2 g=vec2(bb*1.1,h*1.3)+sd*13.;float n=mnN(g)*.65+mix(.5,mnN(g*2.3),fine)*.35;
 float lim=2.1+.7*mnH(vec2(sd,4.)),band=smoothstep(.2,.4,h)*(1.-smoothstep(lim,lim+.3,h));
 float fn=fwidth(n),aw=max(.012,fn*1.2),fill=smoothstep(.537-aw,.537+aw,n)*band;
 vec3 paint=mnPal(mnH(vec2(floor(mnN(g*.3+7.)*3.),sd)));
 float ow=max(.022,fn*1.5),edge=(1.-smoothstep(ow*.5,ow,abs(n-.537)))*band*(1.-.75*smoothstep(.02,.06,px));
 float tx=bb*6.5+sin(h*5.7+sd)*1.9+sd,tw=abs(sin(tx)-.04),tf=fwidth(tw),tag=(1.-smoothstep(.06,.12+tf*1.5,tw))*smoothstep(.55,.6,mnN(vec2(bb*.8,sd*3.)))*smoothstep(.98,1.02,h)*(1.-smoothstep(1.83,1.87,h))*(1.-smoothstep(.012,.035,px));
 col=mix(col,paint*(.75+.3*pores),fill*.92);col=mix(col,vec3(.015),max(edge*.85,tag*.8));
}else if(st>3.5&&st<4.5){
 float hw=max(.02,fwidth(h)),top=2.1+1.*mnH(vec2(sd,5.)),msk=smoothstep(.12-hw,.12,h)*(1.-smoothstep(top-hw,top,h));
 float ghost=smoothstep(.55,.6,mnN(vec2(mod(b,512.)*1.1,h*1.3)+sd*5.))*fine;
 col=mix(col,vec3(.19,.19,.185)*(.9+.2*pores)*(1.-.07*ghost),msk*.93);
}else if(st>4.5&&st<5.5){
 float soot=smoothstep(1.2,4.6,h)*(.65+.35*mnN(vec2(q.x*.35,h*.6)+sd));
 col*=1.-.55*soot;
}else if(st>6.5&&st<8.5){
 // "Elevado à Arte" (1998): an abstract mural over the panel (b along it, h up from its foot): colour fields cut by
 // seeded diagonals, discs and stripes, dark outlines, faded and chipped like the rest. No lettering.
 float k1=mnH(vec2(sd,11.)),k2=mnH(vec2(sd,12.)),k3=mnH(vec2(sd,13.));vec2 m=vec2(mod(b,512.),h);
 float ang=(k1-.5)*2.4,wd=1.1+2.3*k2,f=(m.x*cos(ang)+m.y*sin(ang)*1.7)/wd,id=floor(f),fa=min(.5,fwidth(f));
 vec3 paint=mix(mnPal(mnH(vec2(id,sd))),mnPal(mnH(vec2(id+1.,sd))),smoothstep(1.-fa,1.,fract(f)));
 float cs=2.2+2.8*k3;vec2 cell=floor(m/cs),cq=(fract(m/cs)-.5)*cs;float cr=length(cq),ca=max(.01,fwidth(cr));
 float disc=(1.-smoothstep(-ca,ca,cr-(.45+.75*mnH(cell+sd))))*step(.5,mnH(cell+sd*2.3));
 paint=mix(paint,mnPal(mnH(cell+sd*3.1)+.33),disc);
 float sx=m.y*2.6+m.x*.17+k1*3.,sf=fwidth(sx),sp=fract(sx),sq=smoothstep(.5-sf,.5+sf,sp)-smoothstep(1.-sf,1.,sp);
 float stripe=mix(sq,.5,smoothstep(.2,.5,sf))*step(.7,mnH(vec2(id+5.,sd)));
 paint=mix(paint,vec3(.8,.77,.68),stripe*.85);
 float line=(1.-smoothstep(0.,.05+fwidth(f)*wd,min(fract(f),1.-fract(f))*wd))*(1.-.7*smoothstep(.03,.09,px));
 float msk=st<7.5?1.:step(.2,h)*(1.-smoothstep(4.2,4.5,h));
 float fade=.84-.3*smoothstep(.45,.9,mnN(m*.55+sd*5.));
 col=mix(col,paint*(.72+.32*pores),msk*fade);col=mix(col,vec3(.03),line*msk*.6);
}else if(st>5.5&&st<6.5){
 float damp=smoothstep(.55,.85,mnN(q*.09+sd*2.)*.7+mnN(q*.37)*.3),salt=smoothstep(.72,.9,mnN(q*.21+7.3+sd));
 col=mix(col*(1.-.18*damp),vec3(.36,.35,.33),salt*.22);
}
diffuseColor.rgb=col;}`);
 };
 m.customProgramCacheKey=()=>'minhocao-concrete-v5';
 return m;
}
// The elevated's carriageways: 15.9 m nominal across (u 0..1), 24 m per repeat; parapets 0.35 m, two 3.4 m lanes a
// side, edge lines, dashed lane lines, the central barrier's yellow kerb lines; worn wheel paths.
function deckLanes(){
 return canvasTexture((ctx,w,h)=>{
  ctx.fillStyle='#4a4b4c';ctx.fillRect(0,0,w,h);const r=random(711),m=w/15.9,X=d=>(d+7.95)*m;
  for(let k=0;k<6000;k++){ctx.fillStyle=r()<.5?`rgba(18,18,20,${.1+r()*.2})`:`rgba(150,150,145,${.05+r()*.13})`;ctx.fillRect(r()*w,r()*h,1+r()*2,1+r()*2);}
  for(const c of [-5.7,-2.3,2.3,5.7])for(const o of [-.85,.85]){const x=X(c+o),g=ctx.createLinearGradient(x-.5*m,0,x+.5*m,0);g.addColorStop(0,'rgba(14,14,15,0)');g.addColorStop(.5,'rgba(14,14,15,.2)');g.addColorStop(1,'rgba(14,14,15,0)');ctx.fillStyle=g;ctx.fillRect(x-.5*m,0,m,h);}
  ctx.fillStyle='rgba(232,230,222,.88)';for(const d of [-7.35,7.2])ctx.fillRect(X(d),0,.15*m,h);
  ctx.fillStyle='rgba(222,176,40,.8)';for(const d of [-.62,.5])ctx.fillRect(X(d),0,.12*m,h);
  ctx.fillStyle='rgba(232,230,222,.85)';for(const d of [-4.0,3.9])for(const y0 of [0,12])ctx.fillRect(X(d),y0/24*h,.12*m,4/24*h);
 },512,512,true);
}
// A ramp's single carriageway: 7 m (u 0..1), edge lines and a dashed centre line.
function rampLanes(){
 return canvasTexture((ctx,w,h)=>{
  ctx.fillStyle='#4b4c4d';ctx.fillRect(0,0,w,h);const r=random(733),m=w/7,X=d=>(d+3.5)*m;
  for(let k=0;k<3000;k++){ctx.fillStyle=r()<.5?`rgba(18,18,20,${.1+r()*.2})`:`rgba(150,150,145,${.05+r()*.13})`;ctx.fillRect(r()*w,r()*h,1+r()*2,1+r()*2);}
  ctx.fillStyle='rgba(232,230,222,.88)';for(const d of [-3.25,3.1])ctx.fillRect(X(d),0,.15*m,h);
  for(const y0 of [0,12])ctx.fillRect(X(-.06),y0/24*h,.12*m,4/24*h);
 },256,512,true);
}
// Praça Roosevelt's paving (renovated 2012): grey concrete plates 1.5 x 0.75 m in a running bond, thin joints, the
// odd darker plate, stains and chewing gum (6 m per repeat; the world-position patches break the repeat).
function plazaPaving(){
 return canvasTexture((ctx,w,h)=>{
  const r=random(919),cw=w/4,ch=h/8;
  for(let j=0;j<8;j++)for(let i=-1;i<4;i++){const x=i*cw+(j%2)*cw/2,g=118+Math.floor(r()*14)-(r()<.08?16:0);ctx.fillStyle=`rgb(${g},${g-1},${g-4})`;ctx.fillRect(x,j*ch,cw,ch);}
  for(let k=0;k<26;k++){const x=r()*w,y=r()*h,s=8+r()*40,g=ctx.createRadialGradient(x,y,0,x,y,s);g.addColorStop(0,`rgba(40,38,34,${.08+r()*.12})`);g.addColorStop(1,'rgba(40,38,34,0)');ctx.fillStyle=g;ctx.fillRect(x-s,y-s,2*s,2*s);}
  for(let k=0;k<6000;k++){ctx.fillStyle=r()<.5?`rgba(35,35,35,${.05+r()*.1})`:`rgba(200,198,190,${.04+r()*.08})`;ctx.fillRect(r()*w,r()*h,1+r()*2,1+r()*2);}
  for(let k=0;k<70;k++){ctx.fillStyle=`rgba(50,50,50,${.35+r()*.3})`;ctx.beginPath();ctx.arc(r()*w,r()*h,1.2+r()*1.6,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='rgba(62,61,58,.7)';for(let j=0;j<=8;j++){ctx.fillRect(0,j*ch-1,w,2);for(let i=-1;i<=4;i++)ctx.fillRect(i*cw+(j%2)*cw/2-1,j*ch,2,ch);}
 },512,512,true);
}
// The parapets' railings ("gradis"): vertical bars every 12 cm and a bottom rail, 1.2 m per repeat (alpha).
function railBars(){
 return canvasTexture((ctx,w,h)=>{ctx.clearRect(0,0,w,h);ctx.fillStyle='#ffffff';for(let k=0;k<10;k++)ctx.fillRect(k*w/10+4,0,5,h);ctx.fillRect(0,h-7,w,7);},128,64,true);
}
// Asphalt and paving: the texture, and patches from the world position so the repeat never shows.
function surfaceMaterial(name,map,key,{offset=false}={}){
 const m=new THREE.MeshStandardMaterial({name,map,vertexColors:true,roughness:.9,metalness:0,...(offset?{polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2}:{})});
 m.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vMsPos;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvMsPos=(modelMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vMsPos;
${NOISE}`).replace('#include <color_fragment>',`#include <color_fragment>
diffuseColor.rgb*=.86+.18*mnN(vMsPos.xz*.031)+.07*mnN(vMsPos.xz*.19);`);
 };
 m.customProgramCacheKey=()=>'minhocao-surface-'+key;
 return m;
}

// ---- People: Parque Minhocão (the off-lap deck on a weekend) and Praça Roosevelt. Low-poly figures, an instanced
// mesh per group, posed in the vertex shader from each one's data (mode, phase, stride or cadence, seed) and the
// clock: nobody in step. limb: 0 body, 1/2 left/right arm, 3/4 thighs, 5/6 shins, 8 head, 9 fixed (bike, board);
// part colours them: 0 shirt, 1 trousers, 2 skin, 3 shoes, 4 hair, 5 tyres and bars, 6 frame, 7 skateboard. Facing
// +x, up +y, left -z, 1.72 m tall at scale 1. Modes: 0 standing, 1 walking, 2 jogging, 3 seated, 4 cycling,
// 5 skating (side-on, the board along z), 6 sitting on the floor leaning back.
const FIG={stand:0,walk:1,jog:2,sit:3,cycle:4,skate:5,floor:6};
function figureGeometry({riders=false,mobile=false}={}){
 const pos=[],nor=[],limb=[],part=[];
 const put=(g,l,c)=>{const n=g.index?g.toNonIndexed():g,P=n.attributes.position,Nn=n.attributes.normal;for(let i=0;i<P.count;i++){pos.push(P.getX(i),P.getY(i),P.getZ(i));nor.push(Nn.getX(i),Nn.getY(i),Nn.getZ(i));limb.push(l);part.push(c);}g.dispose();if(n!==g)n.dispose();};
 const box=(w,h,d,x,y,z)=>new THREE.BoxGeometry(w,h,d).translate(x,y,z);
 // Limbs: four sides, no ends (8 triangles; their ends are inside the body or the shoes).
 const limbPiece=(w,h,d,x,y,z)=>{const g=new THREE.CylinderGeometry(w*.7071,w*.7071,h,4,1,true).rotateY(Math.PI/4).scale(1,1,d/w).translate(x,y,z);g.computeVertexNormals();return g;};
 for(const [side,arm,thigh,shin] of [[-1,1,3,5],[1,2,4,6]]){
  const z=side*.1,za=side*.235;
  put(box(.25,.08,.1,.05,.04,z),shin,3);put(limbPiece(.11,.44,.11,0,.3,z),shin,1);put(limbPiece(.14,.44,.15,0,.72,z),thigh,1);
  put(limbPiece(.09,.3,.09,0,1.26,za),arm,0);put(limbPiece(.08,.32,.08,0,.96,za),arm,2);
 }
 put(box(.24,.16,.34,0,.94,0),0,1);put(box(.22,.5,.38,0,1.2,0),0,0);
 put(new THREE.SphereGeometry(.105,6,4).scale(.95,1.15,.9).translate(.005,1.59,0),8,2);
 put(new THREE.SphereGeometry(.112,6,2,0,Math.PI*2,0,Math.PI*.45).scale(.98,1.1,.95).translate(-.012,1.615,0),8,4);
 if(riders){
  for(const x of [-.53,.53])put(new THREE.CylinderGeometry(.34,.34,.035,mobile?7:9).rotateX(Math.PI/2).translate(x,.34,0),9,5);
  const tube=(a,b,r=.035)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);put(limbPiece(r,l,r,0,0,0).rotateZ(Math.atan2(dy,dx)-Math.PI/2).translate((a[0]+b[0])/2,(a[1]+b[1])/2,0),9,6);};
  const S=[-.13,.9],B=[0,.32],H=[.42,.86],F=[.53,.34],R=[-.53,.34];
  tube(S,B);tube(H,B);tube(S,H);tube(B,R);tube(S,R,.025);tube(H,F);tube(H,[.42,1.0]);
  put(box(.04,.04,.5,.42,1.0,0),9,5);put(box(.24,.05,.12,-.13,.93,0),9,5);
  put(box(.2,.025,.8,0,.08,0),9,7);for(const z of [-.28,.28])put(box(.07,.05,.18,0,.035,z),9,7);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
 g.setAttribute('limb',new THREE.Float32BufferAttribute(limb,1));g.setAttribute('part',new THREE.Float32BufferAttribute(part,1));g.computeBoundingSphere();return g;
}
const FIGURE_POSE=`attribute float limb;attribute float part;attribute vec4 pData;uniform float uTime;
mat3 figRz(float a){float c=cos(a),s=sin(a);return mat3(c,s,0.,-s,c,0.,0.,0.,1.);}
mat3 figRy(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}
void figPose(inout vec3 p,inout vec3 n){
 float mode=pData.x,ph=pData.y,fr=pData.z,sd=pData.w,t=uTime,w=t*fr+ph;
 // The bike only under a cyclist, the board only under a skater.
 if((part>4.5&&part<6.5&&abs(mode-4.)>.5)||(part>6.5&&abs(mode-5.)>.5)){p=vec3(0.,-60.,0.);return;}
 bool left=limb==1.||limb==3.||limb==5.;float sg=left?1.:-1.,sw=sin(w)*sg;
 float arm=0.,thigh=0.,bend=0.,lean=0.,head=0.;
 if(mode<.5){arm=.06*sin(t*.8+ph+sg);head=.55*sin(t*.21+ph*3.1)+.25*sin(t*.53+sd*9.);lean=.02*sin(t*.5+ph);}
 else if(mode<1.5){thigh=.42*sw;bend=.65*max(0.,-sin(w+.5)*sg)+.05;arm=-.38*sw;head=.2*sin(t*.3+ph);lean=-.04;}
 else if(mode<2.5){thigh=.7*sw;bend=1.1*max(0.,-sin(w+.6)*sg)+.3;arm=-.75*sw;lean=-.14;}
 else if(mode<3.5){thigh=1.5;bend=1.45+.12*sin(t*.4+ph*sg);arm=.42+.05*sin(t*.6+ph);head=.4*sin(t*.17+ph*2.);}
 else if(mode<4.5){float c=w+(left?0.:3.14159);thigh=1.05+.42*sin(c);bend=1.25+.4*cos(c);arm=1.15;lean=-.38;}
 else if(mode<5.5){thigh=.22*sg;bend=.35;arm=.5*sg+.15*sin(t*.9+ph);lean=.06*sin(t*1.1+ph);head=-1.2;}
 else{thigh=1.52;bend=.25+.1*sin(t*.3+ph*sg);arm=.2;head=.5*sin(t*.19+ph);lean=.28;}
 if(limb>2.5&&limb<6.5){
  if(limb>4.5){vec3 k=vec3(0.,.52,p.z);mat3 r=figRz(-bend);p=k+r*(p-k);n=r*n;}
  vec3 hp=vec3(0.,.92,p.z);mat3 r=figRz(thigh);p=hp+r*(p-hp);n=r*n;
 }else if(limb<8.5){
  if(limb>.5&&limb<2.5){vec3 s=vec3(0.,1.41,p.z);mat3 r=figRz(arm);p=s+r*(p-s);n=r*n;}
  if(limb>7.5){vec3 c=vec3(0.,1.46,0.);mat3 r=figRy(head);p=c+r*(p-c);n=r*n;}
  vec3 c=vec3(0.,.92,0.);mat3 r=figRz(lean);p=c+r*(p-c);n=r*n;
 }
}`;
// The figures' material and the depth material their sun shadows are drawn with (the same pose), on one clock.
function figureMaterials(){
 const clock={value:0};
 const look=new THREE.MeshStandardMaterial({name:'Pessoas_Minhocao',roughness:.82,metalness:0});
 look.onBeforeCompile=shader=>{
  shader.uniforms.uTime=clock;
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
${FIGURE_POSE}
attribute vec3 pShirt;attribute vec3 pPants;attribute vec3 pSkin;varying vec3 vFig;vec3 figPos;`)
   .replace('#include <beginnormal_vertex>','vec3 objectNormal=vec3(normal);figPos=position;figPose(figPos,objectNormal);')
   .replace('#include <begin_vertex>',`vec3 transformed=figPos;
float hairK=fract(pData.w*7.31);vec3 hair=hairK<.45?vec3(.018,.014,.012):hairK<.75?vec3(.06,.035,.02):hairK<.88?vec3(.32,.24,.12):vec3(.3,.29,.28);
vFig=part<.5?pShirt:part<1.5?pPants:part<2.5?pSkin:part<3.5?vec3(.03,.028,.027):part<4.5?hair:part<5.5?vec3(.025):part<6.5?pShirt.zxy*1.15+.03:vec3(.36,.2,.09);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vFig;').replace('#include <color_fragment>','diffuseColor.rgb=vFig;');
 };
 look.customProgramCacheKey=()=>'minhocao-figures-v1';
 const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
 depth.onBeforeCompile=shader=>{
  shader.uniforms.uTime=clock;
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
${FIGURE_POSE}`).replace('#include <begin_vertex>','vec3 transformed=vec3(position);vec3 figN=vec3(0.,1.,0.);figPose(transformed,figN);');
 };
 depth.customProgramCacheKey=()=>'minhocao-figures-depth-v1';
 return {look,depth,clock};
}
// Clothes and skin (sRGB): shirts mostly plain, some bright, a few football shirts; jeans, black, khaki, grey trousers.
const SHIRTS=['#f2f0ea','#e8e4da','#1c1d20','#2a2c31','#5d6066','#8b8f95','#1f3550','#26467a','#9a1d1d','#c2362b','#e3b51c','#f2d33a','#2f6b3a','#1c8a4a','#d76c8c','#7fa9d6','#e07a2f','#5a3f7a','#b9a27c','#0f5e9c','#ffcf00','#008c45'];
const PANTS=['#2b3a57','#34476a','#1d2a42','#171819','#2a2a2c','#a8946c','#8a7a5a','#5d6066','#47494e','#6a5040','#2e4d3a'];
const SKINS=['#f1c9a8','#e3b28e','#d39e78','#bf8a62','#a5714c','#8c5a3a','#704529','#5a361f','#43281a'];
const lin=css=>{const c=new THREE.Color(css);return [c.r,c.g,c.b];};

export function createMinhocaoStructures(data,{mobile=false,ground}={}){
 const root=new THREE.Group();root.name='Minhocao_estruturas';
 const M=data.scenery?.minhocao,stats={meshes:0,drawCalls:0,triangles:0,instances:0,mobile};
 if(!M?.deck?.length)return {root,stats};
 const A=data.samples,N=A.length,L=data.meta.reconstructed_xy_m,rand=random(5113);
 const decks=data.meta.decks??[],tunnels=data.meta.tunnels??[];
 const inRanges=(ranges,s)=>{const t=((s%L)+L)%L;return ranges.some(([a,b])=>a<=b?t>=a&&t<=b:t>=a||t<=b);};

 // --- The lap's stations: centre, road, width, crossfall, tangent, left normal, the walls' faces and backs.
 const st=A.map((p,i)=>{
  const tl=Math.hypot(p[7],p[8])||1,nl=Math.hypot(p[9],p[10])||1,s=p[0],q={i,s,x:p[1],y:p[2],z:p[3],w:p[4],cf:p[5],t:[p[7]/tl,p[8]/tl,0],n:[p[9]/nl,p[10]/nl,0],face:[0,0],back:[0,0]};
  for(const [k,side] of [[0,-1],[1,1]]){q.face[k]=p[4]/2+guardrailClearance(data,s,side);q.back[k]=q.face[k]+(guardrailPresent(data,s,side)?.75:0);}
  q.deck=inRanges(decks,s);q.tunnel=inRanges(tunnels,s);return q;
 });
 const on=(f,d,dz=0)=>[f.x+f.n[0]*d,f.y+f.n[1]*d,f.z+f.cf*d+dz];
 // Lap segments by 8 m cell (each cell lists the segments whose driving space reaches into it).
 const CELL=8,cells=new Map(),cellKey=(i,j)=>i*131071+j;
 for(let i=0;i<N;i++){
  const p=st[i],q=st[(i+1)%N],r=Math.max(p.back[0],p.back[1],q.back[0],q.back[1])+1.5;
  for(let ci=Math.floor((Math.min(p.x,q.x)-r)/CELL);ci<=Math.floor((Math.max(p.x,q.x)+r)/CELL);ci++)for(let cj=Math.floor((Math.min(p.y,q.y)-r)/CELL);cj<=Math.floor((Math.max(p.y,q.y)+r)/CELL);cj++){const k=cellKey(ci,cj);let l=cells.get(k);if(!l)cells.set(k,l=[]);l.push(i);}
 }
 // The lap's roads over (x, y): lateral offset, road height there, the walls' face and back on that side.
 function lapAt(x,y){
  const list=cells.get(cellKey(Math.floor(x/CELL),Math.floor(y/CELL))),out=[];if(!list)return out;
  for(const i of list){
   const p=st[i],q=st[(i+1)%N],dx=q.x-p.x,dy=q.y-p.y,l2=dx*dx+dy*dy||1e-9;let u=((x-p.x)*dx+(y-p.y)*dy)/l2;if(u<-.02||u>1.02)continue;u=clamp(u,0,1);
   const nx=lerp(p.n[0],q.n[0],u),ny=lerp(p.n[1],q.n[1],u),lat=(x-p.x-dx*u)*nx+(y-p.y-dy*u)*ny,k=lat>=0?1:0;
   const back=lerp(p.back[k],q.back[k],u);if(Math.abs(lat)>back+1.5)continue;
   out.push({i,s:p.s,lat,road:lerp(p.z,q.z,u)+lerp(p.cf,q.cf,u)*lat,face:lerp(p.face[k],q.face[k],u),back,deck:p.deck,tunnel:p.tunnel});
  }
  return out;
 }
 // Something of ours from z0 to z1 at (x, y) inside a lap road's driving space (its walls' backs + margin)?
 const blocked=(x,y,z0,z1,margin=0)=>lapAt(x,y).some(h=>Math.abs(h.lat)<h.back+margin&&z1>h.road-.05&&z0<h.road+DRIVE);
 // Where murals go ("Elevado à Arte"): sides and pillars the streets of the lap look at (São João, the Ana Cintra ramp,
 // Major Sertório; any street stretch if the sections are unnamed), a seeded share of them.
 const eyeNames=/s[ãa]o jo[ãa]o|ana cintra|major sert/i,sections=(data.meta.sections??[]).map(([s,name],k,all)=>({s,e:all[k+1]?.[0]??L,name:String(name)}));
 const named=sections.filter(q=>eyeNames.test(q.name));
 const eyes=st.filter((p,k)=>k%3===0&&!p.deck&&!p.tunnel&&(!named.length||named.some(q=>p.s>=q.s&&p.s<q.e)));
 const seen=(x,y,r)=>eyes.some(p=>(p.x-x)**2+(p.y-y)**2<r*r);
 const murals={fascia:0,walls:0,pillars:0},muralKeys=new Set();
 // A 36 m panel's mural on one side (its seed, 0 for bare concrete): x, y a point of that side, key the panel.
 function mural(key,x,y,r=75,share=.6){if(!seen(x,y,r))return 0;const h=hash1(key*3.17+.41);if(h>=share)return 0;return .02+hash1(key*5.31+.7)*.97;}
 const countMural=(kind,key,seed)=>{if(seed&&!muralKeys.has(kind+key)){muralKeys.add(kind+key);murals[kind]++;}};

 // --- The ground: the game's fitted terrain, the survey grid, and past the grid's edge the piers' own ground line.
 const deckPts=[];for(const p of M.deck){const q=deckPts.at(-1);if(q&&Math.hypot(p[0]-q.x,p[1]-q.y)<.5)continue;deckPts.push({x:p[0],y:p[1],z:p[2],w:p[3]});}
 const DN=deckPts.length;let arcAcc=0;
 deckPts.forEach((p,j)=>{if(j)arcAcc+=Math.hypot(p.x-deckPts[j-1].x,p.y-deckPts[j-1].y);p.arc=arcAcc;});
 deckPts.forEach((p,j)=>{const a=deckPts[Math.max(0,j-1)],b=deckPts[Math.min(DN-1,j+1)],t=unit([b.x-a.x,b.y-a.y,0]);p.t=t;p.n=[-t[1],t[0],0];});
 const DCELL=16,dcells=new Map();
 for(let j=0;j+1<DN;j++){const p=deckPts[j],q=deckPts[j+1],r=12;for(let ci=Math.floor((Math.min(p.x,q.x)-r)/DCELL);ci<=Math.floor((Math.max(p.x,q.x)+r)/DCELL);ci++)for(let cj=Math.floor((Math.min(p.y,q.y)-r)/DCELL);cj<=Math.floor((Math.max(p.y,q.y)+r)/DCELL);cj++){const k=cellKey(ci,cj);let l=dcells.get(k);if(!l)dcells.set(k,l=[]);l.push(j);}}
 // Nearest point of the deck's centre line (within 12 m): its arc, lateral offset, top and half width there.
 function deckNear(x,y){
  const list=dcells.get(cellKey(Math.floor(x/DCELL),Math.floor(y/DCELL)));let best=null;if(!list)return null;
  for(const j of list){const p=deckPts[j],q=deckPts[j+1],dx=q.x-p.x,dy=q.y-p.y,l2=dx*dx+dy*dy||1e-9;const u=clamp(((x-p.x)*dx+(y-p.y)*dy)/l2,0,1),ex=x-p.x-dx*u,ey=y-p.y-dy*u,d=Math.hypot(ex,ey);
   if(!best||d<best.d){const nx=lerp(p.n[0],q.n[0],u),ny=lerp(p.n[1],q.n[1],u);best={d,j,u,arc:lerp(p.arc,q.arc,u),lat:ex*nx+ey*ny,z:lerp(p.z,q.z,u),half:lerp(p.w,q.w,u)/2};}}
  return best;
 }
 const pierGround=(M.piers??[]).map(p=>({arc:deckNear(p[0],p[1])?.arc,g:p[2]})).filter(p=>p.arc!=null).sort((a,b)=>a.arc-b.arc);
 const groundByArc=arc=>{if(!pierGround.length)return null;if(arc<=pierGround[0].arc)return pierGround[0].g;if(arc>=pierGround.at(-1).arc)return pierGround.at(-1).g;let k=1;while(pierGround[k].arc<arc)k++;const a=pierGround[k-1],b=pierGround[k];return lerp(a.g,b.g,(arc-a.arc)/((b.arc-a.arc)||1));};
 const deckHeight=M.deck_height_m??6.4;
 function bed(x,y){
  const g=ground?.(x,y);if(g!=null&&Number.isFinite(g))return g;const r=gridHeight(data.terrain,x,y);if(r!=null)return r;
  const n=deckNear(x,y);if(n){const b=groundByArc(n.arc);return b??n.z-deckHeight;}return null;
 }
 const inGrid=(x,y)=>gridHeight(data.terrain,x,y)!=null;
 const lowest=(pts)=>{let z=Infinity;for(const [x,y] of pts){const g=bed(x,y);if(g!=null)z=Math.min(z,g);}return Number.isFinite(z)?z:null;};

 // --- Materials (one each).
 const concrete=concreteMaterial('Concreto_Minhocao');
 const laneMap=deckLanes(),rampMap=rampLanes(),pavingMap=plazaPaving();
 const deckRoad=surfaceMaterial('Asfalto_Minhocao',laneMap,'deck'),rampRoad=surfaceMaterial('Asfalto_alcas',rampMap,'ramp');
 const paving=surfaceMaterial('Piso_Praca_Roosevelt',pavingMap,'plaza',{offset:true});
 const steel=new THREE.MeshStandardMaterial({name:'Gradis_postes_Minhocao',vertexColors:true,metalness:.5,roughness:.5});
 const barsMap=railBars(),bars=new THREE.MeshStandardMaterial({name:'Gradil_barras_Minhocao',map:barsMap,vertexColors:true,alphaTest:.5,side:THREE.DoubleSide,metalness:.45,roughness:.5});
 // The bars keep their coverage far off: alpha grows with the mip level instead of fading out.
 bars.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`{vec2 px=vMapUv*vec2(128.,64.);float mip=max(0.,.5*log2(max(dot(dFdx(px),dFdx(px)),dot(dFdy(px),dFdy(px)))));diffuseColor.a*=1.+mip*.35;}
#include <alphatest_fragment>`);};
 bars.customProgramCacheKey=()=>'minhocao-bars-v1';
 // The tunnel's lamps: bright enough in the HDR pipeline to bloom (cinematic.js threshold 1.8).
 const lampLight=new THREE.MeshBasicMaterial({name:'Luminarias_tunel',color:new THREE.Color(5.2,5.0,4.4),toneMapped:false});
 // Colours (linear).
 const C={deck:tint('#9e9a92'),parapet:tint('#aaa69d'),gutter:tint('#6c6964'),soffit:tint('#827e77'),pier:tint('#a19d95'),wall:tint('#9a968e'),
  tunnel:tint('#716e68'),tunnelTop:tint('#54524e'),coping:tint('#b0aca3'),barrier:tint('#b4b0a7'),rail:tint('#5d6366'),railLight:tint('#8f979b'),post:tint('#7b8286'),road:[1,1,1]};
 const tone=(c,k=.94+rand()*.12)=>mul(c,k);

 // Chunks per material and area (800 m cells): a draw call each, culled with the frustum.
 const chunks=new Map();
 function mesh(kind,x,y){const k=kind+':'+Math.floor(x/800)+','+Math.floor(y/800);let m=chunks.get(k);if(!m){m=new Mesher();m.kind=kind;m.key=k;chunks.set(k,m);}return m;}
 const lampPosts={double:[],single:[]},obstacles=[],clearings=[],tunnelLamps=new Mesher();
 const proxy=(A,B,w,h,up,name)=>{const m=new Mesher();m.beam(A,B,w,h,up,[1,1,1]);const o=new THREE.Mesh(m.geometry());o.name=name;o.updateMatrixWorld(true);obstacles.push(o);};
 // A railing span on a parapet's top from a to b: the top rail, and the bars below it (alpha-tested texture).
 function railing(x,y,a,b,out,u0,u1){
  mesh('steel',x,y).beam(add(a,[0,0,RAIL-PARAPET]),add(b,[0,0,RAIL-PARAPET]),.06,.06,Z,C.rail,F0,false);
  if(!mobile)mesh('bars',x,y).quad(add(a,[0,0,.01]),add(b,[0,0,.01]),add(b,[0,0,RAIL-PARAPET-.03]),add(a,[0,0,RAIL-PARAPET-.03]),C.railLight,out,F0,[[u0/1.2,0],[u1/1.2,0],[u1/1.2,1],[u0/1.2,1]]);
 }
 const crossings=new Map();
 function noteCrossing(h,clear,where){const k=Math.round(h.s/20);const c=crossings.get(k);if(!c||clear<c.clearance)crossings.set(k,{street_s:+h.s.toFixed(1),over:where,clearance:+clear.toFixed(2)});}
 // Girder depth at a station: never lower than DRIVE over a road of the lap passing under (another level).
 function depthLimit(points){let d=DEPTH;for(const [x,y,zt] of points)for(const h of lapAt(x,y)){if(Math.abs(h.lat)>=h.back||h.road>zt-2.5)continue;d=Math.min(d,zt-(h.road+DRIVE+.05));}return d;}
 // Smooth envelope: depth may only change 6 cm per metre, and never exceeds a station's limit.
 function envelope(list,key='limit'){const out=list.map(o=>o[key]);for(let pass=0;pass<2;pass++)for(let i=1;i<out.length;i++){const ds=Math.abs(list[i].u-list[i-1].u);out[i]=Math.min(out[i],out[i-1]+.06*ds);}for(let i=out.length-2;i>=0;i--){const ds=Math.abs(list[i+1].u-list[i].u);out[i]=Math.min(out[i],out[i+1]+.06*ds);}return out.map(v=>Math.max(.9,v));}
 // Wall or girder: a deck within LOW of the ground stands on solid walls (hysteresis, no runs shorter than 14 m).
 function modes(list){
  const n=list.length,H=list.map((o,i)=>{let s=0,c=0;for(let k=Math.max(0,i-2);k<=Math.min(n-1,i+2);k++){s+=list[k].H;c++;}return s/c;});
  const wall=new Array(n).fill(false);let cur=H[0]<LOW;for(let i=0;i<n;i++){if(cur&&H[i]>LOW+.4)cur=false;else if(!cur&&H[i]<LOW)cur=true;wall[i]=cur;}
  for(let pass=0;pass<2;pass++){let i=0;while(i<n){let j=i;while(j+1<n&&wall[j+1]===wall[i])j++;const span=Math.abs(list[j].u-list[i].u);if(span<14&&(i>0||j<n-1)){const v=i>0?wall[i-1]:wall[j+1];for(let k=i;k<=j;k++)wall[k]=v;}i=j+1;}}
  return wall;
 }
 // The deck's profile [d, z] from the inner right edge round the bottom to the inner left (z over the road plane):
 // the gutter or road edge, parapet, fascia with its drip, cantilever, web chamfer and flat soffit. eR/eL: the outer
 // edges; cutR/cutL: an edge cut along another road (a plain face instead of the parapet); inR/inL: the inner start.
 function profile(eR,eL,depth,{cutR=false,cutL=false,inR,inL,lip=-.03}={}){
  const side=(e,cut,inner,s)=>{
   const chamfer=Math.min(2.9,Math.max(.5,e*.45)),cant=Math.min(1.7,chamfer*.6),web=Math.min(2.7,chamfer*.93);
   if(cut)return [[inner,lip],[e,lip],[e,lip],[e,lip],[e,-.55],[e,-.6],[e,-.78],[e,-depth+.12],[e,-depth]].map(([d,z])=>[s*d,z]);
   return [[inner,lip],[e-.25,lip],[e-.25,PARAPET],[e,PARAPET],[e,-.55],[e-.12,-.62],[e-cant,-.78],[e-web,-depth+.12],[e-chamfer,-depth]].map(([d,z])=>[s*d,z]);
  };
  return [...side(eR,cutR,inR,-1),...side(eL,cutL,inL,1).reverse()];
 }
 // Edge colours of that profile (18 points, 17 edges).
 const profileColors=(k=1)=>{const c=[C.gutter,C.parapet,C.parapet,C.deck,C.soffit,C.soffit,C.soffit,C.soffit];return [...c,C.soffit,...[...c].reverse()].map(x=>mul(x,k));};

 // ================================================================ The lap's own deck (ramp, elevated, descent)
 // Runs of the lap's stations where flag holds, in lap order; one across the line (s = 0) stays one run.
 function stationRuns(flag){
  const runs=[];let run=null;for(const p of st){if(flag(p)){if(run&&p.i===run.at(-1).i+1)run.push(p);else{if(run)runs.push(run);run=[p];}}else if(run){runs.push(run);run=null;}}if(run)runs.push(run);
  if(runs.length>1&&runs[0][0].i===0&&runs.at(-1).at(-1).i===N-1){const last=runs.pop();runs[0]=[...last,...runs[0]];}return runs;
 }
 // s along a run, unwrapped past the line.
 const along=(run,p)=>p.s<run[0].s?p.s+L:p.s;
 // The deck's last station is the trench's first (no gap between the two structures): only the tunnel's inside is
 // left out.
 const tunnelCore=tunnels.map(([a,b])=>[a+.5,b-.5]);
 const lapRuns=stationRuns(p=>p.deck&&!inRanges(tunnelCore,p.s));
 const lapStations=[];
 for(const run of lapRuns){
  const step=mobile?2:1,list=run.filter((p,k)=>k%step===0||k===run.length-1).map(p=>{
   const eR=p.back[0]+.42,eL=p.back[1]+.42;
   const pts=[-eR+2.9,-3,0,3,eL-2.9].map(d=>{const q=on(p,d);return [q[0],q[1],q[2]];});
   const limit=depthLimit(pts);
   const g=[on(p,-eR+1),on(p,0),on(p,eL-1)].map(q=>bed(q[0],q[1])).filter(v=>v!=null);
   return {p,u:along(run,p),eR,eL,limit,H:g.length?p.z-Math.max(...g):99};
  });
  const depth=envelope(list),wall=modes(list);
  list.forEach((o,k)=>{o.depth=Math.min(depth[k],Math.max(.9,o.H-.3));o.wall=wall[k];});
  lapStations.push(list);
  // Sections and loft (chunks by the run's own stations).
  const tones=list.map(o=>.95+.1*hash1(Math.floor(o.u/36)));
  const secs=list.map(o=>profile(o.eR,o.eL,o.depth,{inR:o.p.w/2-.02,inL:o.p.w/2-.02}).map(([d,z])=>on(o.p,d,z)));
  const cols=profileColors();
  for(let k=0;k+1<list.length;k++){
   const o=list[k],m=mesh('concrete',o.p.x,o.p.y);
   const id=Math.floor(o.u/36),panel=hash1(id+.13),side=sd=>{const e=sd<0?o.eR:o.eL,q0=on(o.p,sd*e),s=mural(id*2+(sd>0)+.5,q0[0],q0[1]);countMural('fascia',id*2+(sd>0),s);return s;},mR=side(-1),mL=side(1),q1=list[k+1];
   m.loft([secs[k],secs[k+1]],(i,j)=>mul(cols[j],tones[k]),(i,j,e)=>{const x=i?q1:o;if(e===3&&mR)return [x.p.z-.55,x.u,mR,7];if(e===13&&mL)return [x.p.z-.55,x.u,mL,7];return [-1e4,0,panel,e>=5&&e<=11?6:0];});
   // Railings on the parapets (outside the Jersey walls).
   const q=list[k+1];
   for(const [sd,e0,e1] of [[-1,o.eR,q.eR],[1,o.eL,q.eL]])railing(o.p.x,o.p.y,on(o.p,sd*(e0-.12),PARAPET),on(q.p,sd*(e1-.12),PARAPET),mul(o.p.n,sd),o.u,q.u);
  }
  // Solid walls where the deck runs low: the fascia continues down to the ground, ends closed across.
  for(let k=0;k+1<list.length;k++){
   const o=list[k],q=list[k+1];if(!o.wall&&!q.wall)continue;const m=mesh('concrete',o.p.x,o.p.y);
   for(const [sd,e0,e1] of [[-1,o.eR,q.eR],[1,o.eL,q.eL]]){
    const a=on(o.p,sd*e0,-.55),b=on(q.p,sd*e1,-.55),ga=bed(a[0]+o.p.n[0]*sd*.4,a[1]+o.p.n[1]*sd*.4),gb=bed(b[0]+q.p.n[0]*sd*.4,b[1]+q.p.n[1]*sd*.4);
    if(ga==null||gb==null||(ga>a[2]-.05&&gb>b[2]-.05))continue;
    const bay=Math.floor(o.u/36)+sd*.29,ms=mural(Math.floor(o.u/36)*2+(sd>0)+900.5,a[0],a[1]),sv=ms||hash1(bay+.5),stl=ms?7:1;countMural('walls',Math.floor(o.u/36)*2+(sd>0),ms);
    m.quad(a,b,[b[0],b[1],Math.min(gb,b[2])-.6],[a[0],a[1],Math.min(ga,a[2])-.6],mul(C.wall,.95+.08*hash1(bay)),mul(o.p.n,sd),[[ga,o.u,sv,stl],[gb,q.u,sv,stl],[gb,q.u,sv,stl],[ga,o.u,sv,stl]]);
   }
  }
  const capEnd=(o,dir)=>{
   const sec=profile(o.eR,o.eL,o.depth,{inR:o.p.w/2-.02,inL:o.p.w/2-.02}).map(([d,z])=>on(o.p,d,z));
   const m=mesh('concrete',o.p.x,o.p.y),g=lowest([[o.p.x,o.p.y],[...on(o.p,-o.eR)],[...on(o.p,o.eL)]]);
   if(o.wall&&g!=null){
    // Down to the ground under the bottom of the section: a closed abutment face.
    const bottom=sec.slice(4,14),gz=g-.6;for(let j=0;j+1<bottom.length;j++){const a=bottom[j],b=bottom[j+1];if(a[2]<=gz&&b[2]<=gz)continue;m.quad(a,b,[b[0],b[1],gz],[a[0],a[1],gz],C.wall,mul(o.p.t,dir),[g,0,.3,1]);}
   }
   m.polygon(sec,C.deck,mul(o.p.t,dir));
  };
  capEnd(list[0],-1);capEnd(list.at(-1),1);
  // Abutment faces where a wall run meets a girder run.
  for(let k=0;k+1<list.length;k++)if(list[k].wall!==list[k+1].wall){const o=list[k].wall?list[k]:list[k+1],dir=list[k].wall?1:-1;
   const sec=profile(o.eR,o.eL,o.depth,{inR:o.p.w/2-.02,inL:o.p.w/2-.02}).map(([d,z])=>on(o.p,d,z)),g=lowest([[o.p.x,o.p.y],[...on(o.p,-o.eR)],[...on(o.p,o.eL)]]);
   if(g==null)continue;const m=mesh('concrete',o.p.x,o.p.y),bottom=sec.slice(4,14),gz=g-.6;
   for(let j=0;j+1<bottom.length;j++){const a=bottom[j],b=bottom[j+1];if(a[2]<=gz&&b[2]<=gz)continue;m.quad(a,b,[b[0],b[1],gz],[a[0],a[1],gz],C.wall,mul(o.p.t,dir),[g,0,.3,1]);}
  }
  // Crossings: the street under this stretch.
  for(const o of list){if(o.wall)continue;for(const d of [-o.eR+2.9,0,o.eL-2.9]){const q=on(o.p,d,-o.depth);for(const h of lapAt(q[0],q[1]))if(Math.abs(h.lat)<h.back&&h.road<o.p.z-2.5){noteCrossing(h,q[2]-h.road,'volta s '+o.p.s.toFixed(0));o.over=true;}}}
  // Over the street the follow cameras stay under the girder (or above the road on it), never inside it.
  for(let k=0;k<list.length;k++){if(!list[k].over||list[k-1]?.over)continue;let j=k;while(list[j+1]?.over)j++;const a=list[Math.max(0,k-3)],b=list[Math.min(list.length-1,j+3)];
   proxy(on(a.p,(a.eL-a.eR)/2,-a.depth/2),on(b.p,(b.eL-b.eR)/2,-b.depth/2),a.eR+a.eL,a.depth,Z,'Viga_Minhocao_cruzamento');}
  // Lamp posts on the parapets, every 40 m, alternating sides; the arm reaches in high over the walls.
  for(let k=0;k<list.length;k++){const o=list[k];if(Math.floor(o.u/40)===Math.floor((list[k-1]?.u??-1e9)/40))continue;const sd=Math.floor(o.u/40)%2?1:-1;
   lampPosts.single.push({p:on(o.p,sd*((sd>0?o.eL:o.eR)-.14),PARAPET),dir:mul(o.p.n,-sd),seed:rand()});}
 }

 // ================================================================ The elevated off the lap
 // Every deck station, its kept pieces across: whatever lies inside the lap's driving space at that level (the lap's
 // own stretch, the gore where the Ana Cintra ramp leaves) is cut away; the lap's deck is built above from its stations.
 const gridEnd=(()=>{let first=-1,last=-1;deckPts.forEach((p,j)=>{if(inGrid(p.x,p.y)){if(first<0)first=j;last=j;}});return first<0?null:[deckPts[first].arc-BEYOND_GRID,deckPts[last].arc+BEYOND_GRID];})();
 const offDeck=[];
 for(let j=0;j<DN;j++){
  const p=deckPts[j];if(gridEnd&&(p.arc<gridEnd[0]||p.arc>gridEnd[1]))continue;
  const E=p.w/2,pts=[];for(let d=-E-.2;d<=E+.2+1e-6;d+=.25){const x=p.x+p.n[0]*d,y=p.y+p.n[1]*d;pts.push({d,x,y,free:!blocked(x,y,p.z-DEPTH-.25,p.z+RAIL+.1,.45)});}
  const pieces=[];let a=null;for(const q of pts){if(q.free){if(!a)a={lo:q.d,hi:q.d};else a.hi=q.d;}else if(a){pieces.push(a);a=null;}}if(a)pieces.push(a);
  const kept=pieces.filter(q=>q.hi-q.lo>=2.5).map(q=>({lo:Math.max(q.lo,-E),hi:Math.min(q.hi,E),cutR:q.lo>-E,cutL:q.hi<E}));
  offDeck.push({p,j,u:p.arc,E,kept});
 }
 // Strips: a kept piece continues the previous station's piece it overlaps across; a gap ends a strip.
 const strips=[];{
  let prev=[];
  for(const o of offDeck){
   const next=[],used=new Set();
   for(const piece of o.kept){
    let s=null;for(const q of prev)if(!used.has(q.s)&&q.j===o.j-1&&Math.max(q.lo,piece.lo)<Math.min(q.hi,piece.hi)){s=q.s;used.add(s);break;}
    if(!s){s=[];strips.push(s);}s.push({o,piece});next.push({s,j:o.j,lo:piece.lo,hi:piece.hi});
   }
   prev=next;
  }
 }
 const offStations=[];
 for(const strip of strips){
  if(strip.length<3)continue;
  const list=strip.map(({o,piece})=>{
   const p=o.p,eR=-piece.lo,eL=piece.hi,P=(d,z=0)=>[p.x+p.n[0]*d,p.y+p.n[1]*d,p.z+z];
   const pts=[-eR+2.9,0,eL-2.9].filter(d=>d>=-eR&&d<=eL).map(d=>P(d));
   const g=[-eR+1,0,eL-1].filter(d=>d>=-eR&&d<=eL).map(d=>bed(...P(d).slice(0,2))).filter(v=>v!=null);
   return {p,o,piece,u:p.arc,eR,eL,P,limit:depthLimit(pts),H:g.length?p.z-Math.max(...g):99};
  });
  const depth=envelope(list),wall=modes(list);
  list.forEach((o,k)=>{o.depth=Math.min(depth[k],Math.max(.9,o.H-.3));o.wall=wall[k];});
  offStations.push(list);
  const prof=o=>profile(o.eR,o.eL,o.depth,{cutR:o.piece.cutR,cutL:o.piece.cutL,inR:o.piece.cutR?o.eR:o.eR-.25,inL:o.piece.cutL?o.eL:o.eL-.25,lip:0}).map(([d,z])=>o.P(d,z));
  const secs=list.map(prof),cols=profileColors(),tones=list.map(o=>.94+.12*hash1(Math.floor(o.u/36)+7));
  for(let k=0;k+1<list.length;k++){
   const o=list[k],q=list[k+1],m=mesh('concrete',o.p.x,o.p.y);
   // The gutter edge (j 0-1) is the road's here: the asphalt below covers it.
   const id=Math.floor(o.u/36),panel=hash1(id+.57),side=sd=>{if(sd<0?o.piece.cutR:o.piece.cutL)return 0;const q0=o.P(sd*(sd<0?o.eR:o.eL)),s=mural(id*2+(sd>0)+5000.5,q0[0],q0[1]);countMural('fascia',5000+id*2+(sd>0),s);return s;},mR=side(-1),mL=side(1);
   m.loft([secs[k],secs[k+1]],(i,j)=>mul(j===0||j===16?C.parapet:cols[j],tones[k]),(i,j,e)=>{const x=i?q:o;if(e===3&&mR)return [x.p.z-.55,x.u,mR,7];if(e===13&&mL)return [x.p.z-.55,x.u,mL,7];return [-1e4,0,panel,e>=5&&e<=11?6:0];});
   // Road surface between the parapets (lane lines in the texture, u across the nominal 15.9 m).
   const r=mesh('deckRoad',o.p.x,o.p.y),dr=x=>x.piece.cutR?x.eR:x.eR-.25,dl=x=>x.piece.cutL?x.eL:x.eL-.25,U=(x,d)=>(d+x.o.E)/(2*x.o.E);
   r.quad(o.P(-dr(o),.0),q.P(-dr(q),.0),q.P(dl(q),.0),o.P(dl(o),.0),C.road,Z,F0,[[U(o,-dr(o)),o.u/24],[U(q,-dr(q)),q.u/24],[U(q,dl(q)),q.u/24],[U(o,dl(o)),o.u/24]]);
   // Railings over the real parapets.
   for(const [sd,cut0,cut1,e0,e1] of [[-1,o.piece.cutR,q.piece.cutR,o.eR,q.eR],[1,o.piece.cutL,q.piece.cutL,o.eL,q.eL]]){if(cut0||cut1)continue;
    railing(o.p.x,o.p.y,o.P(sd*(e0-.12),PARAPET),q.P(sd*(e1-.12),PARAPET),mul(o.p.n,sd),o.u,q.u);}
   // Walls where low.
   if(o.wall||q.wall)for(const [sd,cut,e0,e1] of [[-1,o.piece.cutR||q.piece.cutR,o.eR,q.eR],[1,o.piece.cutL||q.piece.cutL,o.eL,q.eL]]){
    const a=o.P(sd*e0,-.55),b=q.P(sd*e1,-.55),ga=bed(a[0]+o.p.n[0]*sd*.4,a[1]+o.p.n[1]*sd*.4),gb=bed(b[0]+q.p.n[0]*sd*.4,b[1]+q.p.n[1]*sd*.4);
    if(ga==null||gb==null||(ga>a[2]-.05&&gb>b[2]-.05))continue;
    const bay=Math.floor(o.u/36)+sd*.31+.7,ms=mural(Math.floor(o.u/36)*2+(sd>0)+7000.5,a[0],a[1]),sv=ms||hash1(bay+.5),stl=ms?7:1;countMural('walls',7000+Math.floor(o.u/36)*2+(sd>0),ms);
    m.quad(a,b,[b[0],b[1],Math.min(gb,b[2])-.6],[a[0],a[1],Math.min(ga,a[2])-.6],mul(C.wall,.95+.08*hash1(bay)),mul(o.p.n,sd),[[ga,o.u,sv,stl],[gb,q.u,sv,stl],[gb,q.u,sv,stl],[ga,o.u,sv,stl]]);
   }
  }
  // Ends of the strip closed; abutments between wall and girder runs.
  const close=(o,dir)=>{const sec=prof(o),m=mesh('concrete',o.p.x,o.p.y);m.polygon(sec,C.deck,mul(o.p.t,dir));
   if(!o.wall)return;const g=lowest([[o.p.x,o.p.y],o.P(-o.eR).slice(0,2),o.P(o.eL).slice(0,2)]);if(g==null)return;const bottom=sec.slice(4,14),gz=g-.6;
   for(let j=0;j+1<bottom.length;j++){const a=bottom[j],b=bottom[j+1];if(a[2]<=gz&&b[2]<=gz)continue;m.quad(a,b,[b[0],b[1],gz],[a[0],a[1],gz],C.wall,mul(o.p.t,dir),[g,0,.4,1]);}};
  close(list[0],-1);close(list.at(-1),1);
  for(let k=0;k+1<list.length;k++)if(list[k].wall!==list[k+1].wall){const o=list[k].wall?list[k]:list[k+1];close(o,list[k].wall?1:-1);}
  // Central barrier (New Jersey, 33 m on, 3 m off) and lamp posts on it every 36 m, where the deck is whole.
  const JB=[[-.3,0],[-.25,.08],[-.1,.33],[-.075,.81],[.075,.81],[.1,.33],[.25,.08],[.3,0]];
  let seg=null;const flush=()=>{if(seg&&seg.length>1){const m=mesh('concrete',seg[0].p.x,seg[0].p.y),secsB=seg.map(o=>JB.map(([d,z])=>o.P(d,z)));
   const bs=rand();m.loft(secsB,tone(C.barrier),()=>[-1e4,0,bs,0]);m.polygon(secsB[0],C.barrier,mul(seg[0].p.t,-1));m.polygon(secsB.at(-1),C.barrier,seg.at(-1).p.t);}seg=null;};
  for(const o of list){const whole=o.eR>2&&o.eL>2,phase=((o.u%36)+36)%36;if(whole&&phase<33){(seg??=[]).push(o);}else flush();}
  flush();
  for(const o of list)if(o.o.j%2===0)clearings.push({x:o.p.x,y:o.p.y,r:Math.max(o.eR,o.eL)+2});
  // Crossings under this stretch.
  for(const o of list){if(o.wall)continue;for(const d of [-o.eR+2.9,0,o.eL-2.9]){const q=o.P(d,-o.depth);for(const h of lapAt(q[0],q[1]))if(Math.abs(h.lat)<h.back&&h.road<o.p.z-2.5)noteCrossing(h,q[2]-h.road,'elevado arco '+o.u.toFixed(0));}}
 }
 // Lamp posts on the central barrier: one every 36 m, in the middle of a barrier block.
 for(const list of offStations){let last=-1e9;for(const o of list){const whole=o.eR>2.5&&o.eL>2.5,phase=((o.u%36)+36)%36;if(whole&&phase>=16&&phase<20&&o.u-last>30){lampPosts.double.push({p:o.P(0,.81),dir:o.p.n,seed:rand()});last=o.u;}}}

 // ================================================================ Parque Minhocão
 // Off the lap the elevated is a park at weekends: people walk, jog and cycle along it, stop to talk, sit against
 // the parapets or on folding chairs under umbrellas, kids run about, a few food carts. Only where the deck is whole
 // (its full width kept beside the lap), inside the parapets: nobody comes near the lap's driving space.
 const folk={park:[],plaza:[]},movers=[],frand=random(7741),props=new Mesher();props.kind='props';
 const pick=(list,r)=>list[Math.floor(r*list.length)%list.length];
 // A path along stations ({x, y, z, n, u}): where a point at u (metres along) and d (metres to the left) stands, and
 // the heading there.
 function pathOf(sts,u0=sts[0].u,u1=sts.at(-1).u){
  const at=(u,d)=>{let lo=0,hi=sts.length-2;while(lo<hi){const m=(lo+hi+1)>>1;if(sts[m].u<=u)lo=m;else hi=m-1;}
   const a=sts[lo],b=sts[lo+1],k=clamp((u-a.u)/((b.u-a.u)||1),0,1),nx=lerp(a.n[0],b.n[0],k),ny=lerp(a.n[1],b.n[1],k);
   return [lerp(a.x,b.x,k)+nx*d,lerp(a.y,b.y,k)+ny*d,lerp(a.z,b.z,k),Math.atan2(b.y-a.y,b.x-a.x)];};
  return {sts,u0,u1,len:u1-u0,at};
 }
 // A person (track frame): feet at x, y, z, facing yaw; a mover also has its path, place u along it, offset d, speed v
 // and direction dir (turning round at the path's ends); turn: its heading against the way it goes (skaters ride
 // side-on). Clothes, skin, height and the clock's phase are its own.
 function person(group,{x=0,y=0,z=0,yaw=0,mode=FIG.stand,kid=false,freq=1,path=null,u=0,d=0,v=0,dir=1,turn=0,lift=0}){
  const r=frand,k=.86+r()*.22,f={x,y,z,yaw,mode,scale:kid?.55+r()*.17:.91+r()*.17,data:[mode,r()*6.283,freq,r()],
   shirt:lin(pick(SHIRTS,r())).map(c=>c*k),pants:lin(pick(PANTS,r())),skin:lin(pick(SKINS,r())),path,u,d,v,dir,turn,lift,group};
  folk[group].push(f);if(path)movers.push(f);return f;
 }
 // Seated feet: the hips (.92 up the figure) on the seat.
 const seatZ=(f,seat)=>{f.z=seat+.06-.92*f.scale;return f;};
 // Props in one vertex-coloured mesh: a beach umbrella, folding chairs, a food cart.
 const umbrella=(c,z,cols,r=1.15)=>{props.cyl([c[0],c[1],z],[c[0],c[1],z+2.15],.022,.022,5,tint('#d9d9d4'),false);const segs=8,top=[c[0],c[1],z+2.35];
  for(let k=0;k<segs;k++){const a0=k/segs*Math.PI*2,a1=(k+1)/segs*Math.PI*2,p0=[c[0]+Math.cos(a0)*r,c[1]+Math.sin(a0)*r,z+1.95],p1=[c[0]+Math.cos(a1)*r,c[1]+Math.sin(a1)*r,z+1.95];props.tri(top,p0,p1,cols[k%cols.length],Z);props.tri(top,p1,p0,mul(cols[k%cols.length],.6),mul(Z,-1));}};
 const chair=(c,yaw,z,col)=>{const t=[Math.cos(yaw),Math.sin(yaw),0],n=[-t[1],t[0],0],P=(a,b,h)=>[c[0]+t[0]*a+n[0]*b,c[1]+t[1]*a+n[1]*b,z+h];
  props.beam(P(-.21,0,.43),P(.21,0,.43),.44,.04,Z,col);props.beam(P(-.24,0,.45),P(-.24,0,.88),.44,.03,t,col);
  for(const b of [-.2,.2])props.beam(P(-.22,b,0),P(.22,b,.43),.025,.025,Z,tint('#8c9196'),F0,false);};
 const cart=(c,yaw,z,col)=>{const t=[Math.cos(yaw),Math.sin(yaw),0],n=[-t[1],t[0],0],P=(a,b,h)=>[c[0]+t[0]*a+n[0]*b,c[1]+t[1]*a+n[1]*b,z+h];
  props.beam(P(-.8,0,.82),P(.8,0,.82),.85,.7,Z,col);props.beam(P(-.82,0,1.2),P(.82,0,1.2),.9,.06,Z,tint('#d8d6cf'));
  for(const a of [-.45,.45])props.cyl(P(a,-.47,.25),P(a,-.52,.25),.25,.25,8,tint('#1b1c1e'));props.beam(P(.8,0,.6),P(1.15,0,.95),.6,.04,Z,tint('#8c9196'),F0,false);};
 const parkPaths=[];
 for(const list of offStations){
  let run=[];const flush=()=>{if(run.length>1&&run.at(-1).u-run[0].u>=60)parkPaths.push(pathOf(run.map(o=>({x:o.p.x,y:o.p.y,z:o.p.z,n:o.p.n,u:o.u,E:o.o.E}))));run=[];};
  for(const o of list){if(o.eR>=o.o.E-.05&&o.eL>=o.o.E-.05)run.push(o);else flush();}flush();
 }
 const parkStats={paths:parkPaths.length,length:0,people:0,movers:0,cyclists:0,carts:0,umbrellas:0};
 const TAU=Math.PI*2;
 for(const path of parkPaths){
  parkStats.length+=path.len;const E=path.sts[0].E,spacing=mobile?26:8,n=Math.max(1,Math.floor(path.len/spacing));
  const lane=r=>(r<.5?-1:1)*(1+Math.abs(r-.5)*2*(E-2.1));
  for(let k=0;k<n;k++){
   const u=path.u0+(k+.2+frand()*.6)*path.len/n,r=frand(),sd=frand()<.5?-1:1;
   if(r<.4){const kid=frand()<.15,v=kid?1.3+frand()*1.1:1.0+frand()*.55;
    person('park',{mode:kid?FIG.jog:FIG.walk,kid,path,u,d:lane(frand()),v,dir:frand()<.5?1:-1,freq:TAU*v/(kid?1.05:1.45)});}
   else if(r<.52){const v=2.3+frand()*1.0;person('park',{mode:FIG.jog,path,u,d:lane(frand()),v,dir:frand()<.5?1:-1,freq:TAU*v/2.3});}
   else if(r<.61){const v=3.4+frand()*2.6,d=sd*(2+frand()*(E-4.2));person('park',{mode:FIG.cycle,path,u,d,v,dir:d<0?1:-1,freq:TAU*v/4.6});parkStats.cyclists++;}
   else if(r<.75){
    // Two or three talking, turned to each other.
    const [cx,cy,cz]=path.at(u,lane(frand())),m=2+(frand()<.4),a0=frand()*TAU,kid=frand()<.12;
    for(let j=0;j<m;j++){const a=a0+j*TAU/m+(frand()-.5)*.5,rr=.48+frand()*.25;person('park',{x:cx+Math.cos(a)*rr,y:cy+Math.sin(a)*rr,z:cz,yaw:a+Math.PI+(frand()-.5)*.6,kid:kid&&j===m-1});}
   }else if(r<.86){
    // Sitting on the deck against the parapet, legs out, one or two.
    const m=1+(frand()<.35);for(let j=0;j<m;j++){const uu=u+j*.75,[x,y,z,h]=path.at(uu,sd*(E-.25-.48)),f=person('park',{x,y,yaw:h+(sd<0?Math.PI/2:-Math.PI/2),mode:FIG.floor});f.z=z+.12-.92*f.scale;}
   }else if(r<.94){
    // An umbrella over folding chairs, a few people sitting, maybe one standing.
    const [x,y,z,h]=path.at(u,sd*(E-1.75)),cols=[lin(pick(['#d23a2c','#2b62b0','#e8c21c','#2e8b57','#f2f0ea','#e46a1e'],frand())),lin(pick(['#f2f0ea','#1c1d20','#e8c21c'],frand()))];
    umbrella([x,y],z,cols);parkStats.umbrellas++;const m=2+Math.floor(frand()*2);
    for(let j=0;j<m;j++){const a=h+(j-(m-1)/2)*1.1+(sd<0?Math.PI/2:-Math.PI/2)+Math.PI,cx=x+Math.cos(a)*.75,cy=y+Math.sin(a)*.75,yaw=a+Math.PI,col=lin(pick(['#2b62b0','#c2362b','#2e8b57','#e8c21c','#f2f0ea'],frand()));
     chair([cx,cy],yaw,z,col);if(frand()<.8)seatZ(person('park',{x:cx,y:cy,yaw,mode:FIG.sit}),z+.45);}
    if(frand()<.4){const [x2,y2]=path.at(u+1.4,sd*(E-2.6));person('park',{x:x2,y:y2,z,yaw:h+Math.PI*frand()});}
   }else{
    // A food cart (pastel, corn, coconut water: plain colours, no lettering), its vendor and a customer or two.
    const [x,y,z,h]=path.at(u,sd*(E-1.9));cart([x,y],h,z,lin(pick(['#e8c21c','#d23a2c','#2b62b0','#f2f0ea','#2e8b57'],frand())));parkStats.carts++;
    umbrella([x+Math.cos(h)*.3,y+Math.sin(h)*.3],z+.9,[lin('#f2f0ea'),lin(pick(['#d23a2c','#2b62b0','#e46a1e'],frand()))],1.0);
    const [vx,vy]=path.at(u,sd*(E-1.0));person('park',{x:vx,y:vy,z,yaw:h+(sd<0?Math.PI/2:-Math.PI/2)});
    const m=1+Math.floor(frand()*2);for(let j=0;j<m;j++){const [px,py]=path.at(u+(j-.5)*.8,sd*(E-3.0-frand()*.4));person('park',{x:px,y:py,z,yaw:h+(sd<0?-Math.PI/2:Math.PI/2)+(frand()-.5)*.6});}
   }
  }
 }

 // ================================================================ Pillars
 const pierStats={data:M.piers?.length??0,built:0,skipped:[]};
 // The girder over a point: the lap's deck (its station within 3 m) or the elevated off the lap.
 function girderOver(x,y){
  let best=null;
  for(const list of lapStations)for(const o of list){const dx=x-o.p.x,dy=y-o.p.y;const along=dx*o.p.t[0]+dy*o.p.t[1];if(Math.abs(along)>(mobile?2.2:1.2))continue;const lat=dx*o.p.n[0]+dy*o.p.n[1];if(lat<-o.eR+2||lat>o.eL-2)continue;
   if(!best||Math.abs(along)<best.along)best={along:Math.abs(along),t:o.p.t,n:o.p.n,soffit:o.p.z+o.p.cf*lat-o.depth,wall:o.wall,half:[o.eR,o.eL],lat,kind:'volta'};}
  for(const list of offStations)for(const o of list){const dx=x-o.p.x,dy=y-o.p.y;const along=dx*o.p.t[0]+dy*o.p.t[1];if(Math.abs(along)>2.2)continue;const lat=dx*o.p.n[0]+dy*o.p.n[1];if(lat<-o.eR+2||lat>o.eL-2)continue;
   if(!best||Math.abs(along)<best.along)best={along:Math.abs(along),t:o.p.t,n:o.p.n,soffit:o.p.z-o.depth,wall:o.wall,half:[o.eR,o.eL],lat,kind:'elevado'};}
  return best;
 }
 const styleOf=r=>r<.32?1:r<.52?2:r<.84?3:4;
 function column(m,c,t,n,zb,zt,wa,wb,rad,seg,info){
  // Rounded rectangle wa across (n) by wb along (t), corners of radius rad; perimeter metres in mInfo.y.
  const ring=[];for(const [cx,cy,a0] of [[1,1,0],[-1,1,.5],[-1,-1,1],[1,-1,1.5]])for(let k=0;k<=seg;k++){const a=(a0+k/seg*.5)*Math.PI,ox=cx*(wa/2-rad)+Math.cos(a)*rad,oy=cy*(wb/2-rad)+Math.sin(a)*rad;ring.push([ox,oy]);}
  let per=[0];for(let k=1;k<=ring.length;k++){const a=ring[k-1],b=ring[k%ring.length];per.push(per[k-1]+Math.hypot(b[0]-a[0],b[1]-a[1]));}
  const P=(o,z)=>[c[0]+n[0]*o[0]+t[0]*o[1],c[1]+n[1]*o[0]+t[1]*o[1],z];
  for(let k=0;k<ring.length;k++){const a=ring[k],b=ring[(k+1)%ring.length],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],out=[n[0]*mid[0]+t[0]*mid[1],n[1]*mid[0]+t[1]*mid[1],0];
   m.quad(P(a,zb),P(b,zb),P(b,zt),P(a,zt),info.col,out,[[info.g,per[k],info.seed,info.style],[info.g,per[k+1],info.seed,info.style],[info.g,per[k+1],info.seed,info.style],[info.g,per[k],info.seed,info.style]]);}
 }
 function pier(x,y,{kind='deck',k=0}={}){
  const gOver=girderOver(x,y);if(!gOver){pierStats.skipped.push({x:+x.toFixed(1),y:+y.toFixed(1),why:'sem tabuleiro em cima'});return false;}
  if(gOver.wall){pierStats.skipped.push({x:+x.toFixed(1),y:+y.toFixed(1),why:'trecho baixo (muro)'});return false;}
  const {t,n}=gOver,big=kind==='deck',wa=big?1.7:1.25,wb=big?1.25:1.0,capL=big?Math.min(10.4,gOver.half[0]+gOver.half[1]-5.4):Math.min(4.2,gOver.half[0]+gOver.half[1]-2.2),capH=big?1.45:1.0,capW=big?1.75:1.25;
  const top=gOver.soffit-.03,capBottom=top-capH;
  const foot=[[-1,-1],[1,-1],[1,1],[-1,1],[0,0]].map(([a,b])=>[x+n[0]*a*wa/2+t[0]*b*wb/2,y+n[1]*a*wa/2+t[1]*b*wb/2]);
  const g=lowest(foot);if(g==null){pierStats.skipped.push({x:+x.toFixed(1),y:+y.toFixed(1),why:'sem chão'});return false;}
  if(capBottom-g<1.2){pierStats.skipped.push({x:+x.toFixed(1),y:+y.toFixed(1),why:'baixo demais'});return false;}
  // Never in the driving space of a road passing beside it (the column), nor its cap over one.
  for(const [fx,fy] of foot)if(blocked(fx,fy,g,top,.3)){pierStats.skipped.push({x:+x.toFixed(1),y:+y.toFixed(1),why:'na pista'});return false;}
  let half=capL/2;for(let it=0;it<8;it++){const ends=[-1,1].map(sd=>[x+n[0]*sd*half,y+n[1]*sd*half]);if(!ends.some(([ex,ey])=>blocked(ex,ey,capBottom,top,.3)))break;half-=.6;}
  if(half<wa/2+.3){pierStats.skipped.push({x:+x.toFixed(1),y:+y.toFixed(1),why:'capitel na pista'});return false;}
  const seed=hash1(k*7.31+x*.013+y*.007),painted=seen(x,y,50)&&hash1(k*1.9+.37)<.5,style=painted?8:styleOf(hash1(k*3.7+1.3)),col=tone(C.pier,.92+.14*hash1(k+.77));if(painted)murals.pillars++;
  const m=mesh('concrete',x,y),info={g,seed,style,col};
  column(m,[x,y],t,n,g-.8,capBottom+.05,wa,wb,big?.36:.28,mobile?2:3,info);
  // Hammerhead cap: deep at the column, tapering to the tips, under the girder's flat soffit.
  const P=(a,b,z)=>[x+n[0]*a+t[0]*b,y+n[1]*a+t[1]*b,z],tip=capH*.42,cw=capW/2,capInfo=[-1e4,0,seed,0];
  const ring=sd=>[P(-half,sd*cw,top-tip),P(-wa/2-.4,sd*cw,capBottom),P(wa/2+.4,sd*cw,capBottom),P(half,sd*cw,top-tip),P(half,sd*cw,top),P(-half,sd*cw,top)];
  const r0=ring(-1),r1=ring(1);
  for(let j=0;j<6;j++){const j1=(j+1)%6,mid=add(mul(add(r0[j],r0[j1]),.5),[0,0,0]);m.quad(r0[j],r0[j1],r1[j1],r1[j],tone(C.pier,.9),sub(mid,[x,y,(top+capBottom)/2]),capInfo);}
  m.polygon(r0,col,mul(t,-1),capInfo);m.polygon(r1,col,t,capInfo);
  // Bearing pads between cap and girder: a dark line of neoprene.
  for(const a of [-half+.6,-1.4,1.4,half-.6])m.beam(P(a,-.45,top-.01),P(a,.45,top-.01),.45,.05,Z,C.gutter,capInfo);
  // A kerb round the foot (the median of the street below).
  const gb=g;m.beam(P(0,-wb/2-.55,gb+.09),P(0,wb/2+.55,gb+.09),wa+1.1,.36,Z,tone(C.parapet,.85),[gb-.2,0,seed,0]);
  pierStats.built++;
  if(blocked(x,y,g-50,g+60,25))proxy(P(0,0,g),P(0,0,top),Math.max(wa,1.2),wb,t,'Pilar_Minhocao');
  clearings.push({x,y,r:3});
  return true;
 }
 (M.piers??[]).forEach((p,k)=>pier(p[0],p[1],{k}));

 // ================================================================ The other ramps (not on the lap)
 const rampStats=[];
 for(const [ri,ramp] of (M.ramps??[]).entries()){
  const pts=[];for(const q of ramp.points){const l=pts.at(-1);if(l&&Math.hypot(q[0]-l.x,q[1]-l.y)<.5)continue;pts.push({x:q[0],y:q[1],z:q[2]});}
  if(pts.length<3)continue;let acc=0;pts.forEach((p,j)=>{if(j)acc+=Math.hypot(p.x-pts[j-1].x,p.y-pts[j-1].y);p.arc=acc;const a=pts[Math.max(0,j-1)],b=pts[Math.min(pts.length-1,j+1)],t=unit([b.x-a.x,b.y-a.y,0]);p.t=t;p.n=[-t[1],t[0],0];});
  const half=(ramp.width??7)/2+.35,rs={kind:ramp.kind,length:+acc.toFixed(0),stations:0,pillars:0};
  // Kept: off the lap's driving space and off the elevated's own deck (the ramp joins its side), above the street.
  const keep=pts.map(p=>{
   // Only over the surveyed ground (past the grid's edge the deck itself stops).
   if(!inGrid(p.x,p.y))return null;const g=bed(p.x,p.y),H=g==null?99:p.z-g;if(H<.2)return null;
   let lo=-half,hi=half;
   for(let d=-half-.3;d<=half+.3+1e-6;d+=.5){const x=p.x+p.n[0]*d,y=p.y+p.n[1]*d;if(blocked(x,y,p.z-1.6,p.z+RAIL+.1,.6))return null;const dn=deckNear(x,y);if(dn&&Math.abs(dn.lat)<dn.half+.1&&Math.abs(dn.z-p.z)<2.5)return null;}
   return {p,u:p.arc,eR:-lo,eL:hi,H,P:(d,z=0)=>[p.x+p.n[0]*d,p.y+p.n[1]*d,p.z+z]};
  });
  const runs=[];let run=null;for(const o of keep){if(o){(run??=[]).push(o);}else if(run){runs.push(run);run=null;}}if(run)runs.push(run);
  for(const list of runs){
   if(list.length<2)continue;rs.stations+=list.length;
   list.forEach(o=>{o.limit=depthLimit([o.P(0)]);});
   const depth=envelope(list),wall=modes(list);
   list.forEach((o,k)=>{o.depth=Math.min(depth[k]*.75,Math.max(.8,o.H-.3));o.wall=wall[k];});
   const prof=o=>profile(o.eR,o.eL,o.depth,{inR:o.eR-.25,inL:o.eL-.25,lip:0}).map(([d,z])=>o.P(d,z));
   const secs=list.map(prof),cols=profileColors(),k0=hash1(ri+.3);
   for(let k=0;k+1<list.length;k++){
    const o=list[k],q=list[k+1],m=mesh('concrete',o.p.x,o.p.y);
    m.loft([secs[k],secs[k+1]],(i,j)=>mul(j===0||j===16?C.parapet:cols[j],.95+.08*k0),(i,j,e)=>[-1e4,0,k0,e>=5&&e<=11?6:0]);
    const r=mesh('rampRoad',o.p.x,o.p.y),U=(x,d)=>(d+3.5)/7;
    r.quad(o.P(-(o.eR-.25)),q.P(-(q.eR-.25)),q.P(q.eL-.25),o.P(o.eL-.25),C.road,Z,F0,[[U(o,-(o.eR-.25)),o.u/24],[U(q,-(q.eR-.25)),q.u/24],[U(q,q.eL-.25),q.u/24],[U(o,o.eL-.25),o.u/24]]);
    for(const sd of [-1,1])railing(o.p.x,o.p.y,o.P(sd*(o.eR-.12),PARAPET),q.P(sd*(q.eR-.12),PARAPET),mul(o.p.n,sd),o.u,q.u);
    if(o.wall||q.wall)for(const sd of [-1,1]){const a=o.P(sd*o.eR,-.55),b=q.P(sd*q.eR,-.55),ga=bed(a[0]+o.p.n[0]*sd*.4,a[1]+o.p.n[1]*sd*.4),gb=bed(b[0]+q.p.n[0]*sd*.4,b[1]+q.p.n[1]*sd*.4);
     if(ga==null||gb==null||(ga>a[2]-.05&&gb>b[2]-.05))continue;const bay=ri*31+Math.floor(o.u/36)+sd*.3;m.quad(a,b,[b[0],b[1],Math.min(gb,b[2])-.6],[a[0],a[1],Math.min(ga,a[2])-.6],mul(C.wall,.95+.08*hash1(bay)),mul(o.p.n,sd),[[ga,0,hash1(bay+.5),1],[gb,0,hash1(bay+.5),1],[gb,0,hash1(bay+.5),1],[ga,0,hash1(bay+.5),1]]);}
    if(k%2===0)clearings.push({x:o.p.x,y:o.p.y,r:half+1.5});
   }
   const close=(o,dir)=>{const sec=prof(o),m=mesh('concrete',o.p.x,o.p.y);m.polygon(sec,C.deck,mul(o.p.t,dir));if(!o.wall)return;const g=lowest([[o.p.x,o.p.y]]);if(g==null)return;const bottom=sec.slice(4,14),gz=g-.6;
    for(let j=0;j+1<bottom.length;j++){const a=bottom[j],b=bottom[j+1];if(a[2]<=gz&&b[2]<=gz)continue;m.quad(a,b,[b[0],b[1],gz],[a[0],a[1],gz],C.wall,mul(o.p.t,dir),[g,0,.5,1]);}};
   close(list[0],-1);close(list.at(-1),1);
   for(let k=0;k+1<list.length;k++)if(list[k].wall!==list[k+1].wall){const o=list[k].wall?list[k]:list[k+1];close(o,list[k].wall?1:-1);}
   // Pillars every ~20 m where the ramp stands high.
   const offStationsBackup=offStations.length;offStations.push(list);
   let last=-1e9;for(const o of list){if(o.wall||o.u-last<20)continue;if(pier(o.p.x,o.p.y,{kind:'ramp',k:1000+ri*100+Math.round(o.u)})){rs.pillars++;last=o.u;}}
   offStations.length=offStationsBackup;
  }
  rampStats.push(rs);
 }

 // ================================================================ The tunnel under Praça Roosevelt
 // A trench run starts at the deck's last station when the lap comes down off it: the walls meet the deck's end.
 const T=M.tunnel,tunnelStats={},tunRuns=stationRuns(p=>p.tunnel||!!T&&p.s>=T.s0&&p.s<=T.s1).map(r=>{const prev=st[(r[0].i-1+N)%N];return prev.deck&&!r.includes(prev)?[prev,...r]:r;}).filter(r=>r.length>1);
 if(tunRuns.length){
  const gl=(T?.ground??[]).slice().sort((a,b)=>a[0]-b[0]);
  const above=s=>{if(!gl.length)return null;if(s<=gl[0][0])return gl[0][1];if(s>=gl.at(-1)[0])return gl.at(-1)[1];let k=1;while(gl[k][0]<s)k++;return lerp(gl[k-1][1],gl[k][1],(s-gl[k-1][0])/((gl[k][0]-gl[k-1][0])||1));};
  const cov=T?.covered??[Infinity,-Infinity],isCov=s=>s>=cov[0]&&s<=cov[1],PLAZA=9,TH=.5;
  // Paving height at a point: its level, or just over the ground where the survey rises above it (no terrain through).
  const over=(x,y,z)=>{let g=-Infinity;for(const [dx,dy] of [[0,0],[1.6,0],[-1.6,0],[0,1.6],[0,-1.6]]){const b=bed(x+dx,y+dy);if(b!=null)g=Math.max(g,b);}return Math.max(z,g+.07);};
  // The street beside an open trench, past the corridor the terrain is cut down in (survey grid; null off it).
  const street=(p,sd,din)=>{let g=-Infinity;for(const e of [4.5,6.5,8.5]){const q=on(p,sd*(din+e));const b=bed(q[0],q[1]);if(b!=null)g=Math.max(g,b);}return Number.isFinite(g)?g:null;};
  const info=p=>{
   const din=[p.back[0]+.05,p.back[1]+.05],zr=[p.z-p.cf*din[0],p.z+p.cf*din[1]],ga=above(p.s)??p.z+1.1,c=isCov(p.s);
   const soffit=Math.max(...zr)+DRIVE,plaza=Math.max(ga,soffit+.6);
   // In the open the walls retain the street on each side, as high as it stands there (at least a parapet's height).
   const tops=c?[soffit,soffit]:[0,1].map(ix=>Math.max(p.z+1.1,street(p,ix?1:-1,din[ix])??ga));
   return {p,din,zr,ga,c,soffit,plaza,tops};
  };
  const runs=tunRuns.map(r=>r.map(info)),list=runs.flat(),shade=[];
  // Wall tops smoothed along the trench (the survey's 4 m grid is lumpy), never under a parapet's height.
  for(const run of runs)for(const ix of [0,1]){const raw=run.map(o=>o.tops[ix]);run.forEach((o,k)=>{if(o.c)return;let s=0,n=0;for(let j=Math.max(0,k-3);j<=Math.min(run.length-1,k+3);j++)if(!run[j].c){s+=raw[j];n++;}o.tops[ix]=Math.max(o.p.z+1.1,s/n);});}
  // Praça Roosevelt (renovated 2012): the slab's paving runs out over the plaza on both sides, up to PLAZA_MAX past
  // the walls, stopping short of buildings, the landmarks (the Igreja da Consolação beside the north mouth) and ground
  // that is not the plaza's level (past the slope the terrain is cut down by beside the corridor, which it covers).
  const covList=list.filter(o=>o.c),PLAZA_MAX=16;
  const near=(()=>{
   if(!covList.length)return {boxes:[],polys:[]};const xs=covList.map(o=>o.p.x),ys=covList.map(o=>o.p.y),x0=Math.min(...xs)-70,x1=Math.max(...xs)+70,y0=Math.min(...ys)-70,y1=Math.max(...ys)+70;
   const b=data.scenery?.buildings,ci=Object.fromEntries((b?.columns??[]).map((c,i)=>[c,i]));
   const boxes=(b?.items??[]).filter(q=>q[ci.x]>x0&&q[ci.x]<x1&&q[ci.y]>y0&&q[ci.y]<y1).map(q=>({x:q[ci.x],y:q[ci.y],w:q[ci.w],d:q[ci.d],c:Math.cos(q[ci.heading]),s:Math.sin(q[ci.heading])}));
   return {boxes,polys:(data.scenery?.landmarks??[]).filter(l=>l.outline?.length>2).map(l=>l.outline)};
  })();
  const inPoly=(pts,x,y)=>{let c=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [xi,yi]=pts[i],[xj,yj]=pts[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/((yj-yi)||1e-9)+xi)c=!c;}return c;};
  const builtOn=(x,y,m)=>near.boxes.some(b=>{const dx=x-b.x,dy=y-b.y;return Math.abs(dx*b.c+dy*b.s)<b.w/2+m&&Math.abs(-dx*b.s+dy*b.c)<b.d/2+m;})||near.polys.some(pts=>[[0,0],[m,0],[-m,0],[0,m],[0,-m]].some(([a,b])=>inPoly(pts,x+a,y+b)));
  for(const o of covList)o.reach=[0,1].map(ix=>{const sd=ix?1:-1,w0=o.din[ix]+TH;let r=3;for(let e=3;e<=PLAZA_MAX;e++){const q=on(o.p,sd*(w0+e)),g=bed(q[0],q[1]);if(g==null||g>o.plaza+1.8||e>=7&&g<o.plaza-2.5||builtOn(q[0],q[1],1.5))break;r=e;}return r;});
  for(const ix of [0,1]){const raw=covList.map(o=>o.reach[ix]),low=raw.map((v,k)=>Math.min(...raw.slice(Math.max(0,k-2),k+3)));
   covList.forEach((o,k)=>{const w=low.slice(Math.max(0,k-3),k+4);o.reach[ix]=Math.min(raw[k],w.reduce((a,b)=>a+b,0)/w.length);});}
  const roofClear=[];
  for(const list of runs)for(let k=0;k+1<list.length;k++){
   const o=list[k],q=list[k+1],m=mesh('concrete',o.p.x,o.p.y),seed=hash1(Math.floor(o.p.s/18)*.37+.11);
   // Retaining walls behind the Jersey walls: inner face from below the road to the wall's top, a coping in the open.
   for(const [sd,ix] of [[-1,0],[1,1]]){
    const sec=x=>{const d=x.din[ix],b=x.p.z-.6,t=x.tops[ix],cp=x.c?0:1;
     // The coping overhangs outward only: over the road side nothing passes the wall's face (driving space).
     return [[d,b],[d,t],[d,t],[d,t+.16*cp],[d+(TH+.06)*cp,t+.16*cp],[d+(TH+.06)*cp,t-.1*cp],[d+TH,t-.1*cp],[d+TH,Math.min(b,(bed(...on(x.p,sd*(d+TH+.3)).slice(0,2))??b)-.4)]].map(([dd,z])=>[x.p.x+x.p.n[0]*sd*dd,x.p.y+x.p.n[1]*sd*dd,z]);};
    const A0=sec(o),B0=sec(q);
    // The section runs from the road side up, over the coping and down the back: right for the right wall (its
    // faces then point out by the loft's rule); the left wall's goes the other way round.
    const secs=sd<0?[A0,B0]:[A0.slice().reverse(),B0.slice().reverse()];
    m.loft(secs,(i,j)=>{const jj=sd<0?j:6-j;return jj===0?(o.c?C.tunnel:C.wall):jj<=5?C.coping:C.wall;},(i,j,e)=>{const ee=sd<0?e:6-e,tag=!o.c&&hash1(Math.floor(o.p.s/9)*1.7+sd)<.45;return ee===0?[o.p.z,(i?q:o).p.s,seed,tag?3:5]:[-1e4,0,seed,1];});
    if(k===0)m.polygon(A0,C.wall,mul(o.p.t,-1));if(k===list.length-2)m.polygon(B0,C.wall,q.p.t);
    if(!o.c){const r=mesh('steel',o.p.x,o.p.y),a=on(o.p,sd*(o.din[ix]+.25),0),b=on(q.p,sd*(q.din[ix]+.25),0);a[2]=o.tops[ix]+.16;b[2]=q.tops[ix]+.16;
     r.beam(add(a,[0,0,1.05]),add(b,[0,0,1.05]),.06,.06,Z,C.railLight,F0,false);if(k%2===0)r.beam(a,add(a,[0,0,1.08]),.05,.05,o.p.t,C.railLight);}
    // Paving behind the wall at its top (the street beside the trench, the plaza over the tunnel): covers the
    // terrain cut down to the road beside the corridor.
    const w0=o.din[ix]+TH+(o.c?0:.06),w1=q.din[ix]+TH+(q.c?0:.06),ro=o.c?o.reach?.[ix]??PLAZA:3.5,rq=q.c?q.reach?.[ix]??ro:3.5,zo=o.c?o.plaza:o.tops[ix]+.16,zq=q.c?q.plaza:q.tops[ix]+.16;
    const pv=mesh('paving',o.p.x,o.p.y),uv=r=>[r[0]/6,r[1]/6],cols=o.c?6:2;
    const P=(x,d,z,lift)=>{const X=x.p.x+x.p.n[0]*sd*d,Y=x.p.y+x.p.n[1]*sd*d;return [X,Y,lift?over(X,Y,z):z];};
    for(let c=0;c<cols;c++){const f0=c/cols,f1=(c+1)/cols,a0=P(o,w0+ro*f0,zo,c>0),b0=P(q,w1+rq*f0,zq,c>0),a1=P(o,w0+ro*f1,zo,true),b1=P(q,w1+rq*f1,zq,true);
     pv.quad(a0,b0,b1,a1,[1,1,1],Z,F0,[uv(a0),uv(b0),uv(b1),uv(a1)]);}
    const a1=P(o,w0+ro,zo,true),b1=P(q,w1+rq,zq,true);
    // Its outer edge down to the ground (where the ground is lower).
    const ga=bed(a1[0]+o.p.n[0]*sd*.5,a1[1]+o.p.n[1]*sd*.5),gb=bed(b1[0]+q.p.n[0]*sd*.5,b1[1]+q.p.n[1]*sd*.5);
    if(ga!=null&&gb!=null&&(ga<a1[2]-.05||gb<b1[2]-.05))m.quad(a1,b1,[b1[0],b1[1],Math.min(gb,b1[2])-.4],[a1[0],a1[1],Math.min(ga,a1[2])-.4],C.wall,mul(o.p.n,sd),[[ga,0,seed,1],[gb,0,seed,1],[gb,0,seed,1],[ga,0,seed,1]]);
   }
   // Roof slab: soffit 4.6 m over the road from wall to wall, the plaza paving across on top.
   if(o.c&&q.c){
    const a=on(o.p,-o.din[0],0),b=on(q.p,-q.din[0],0),c=on(q.p,q.din[1],0),d=on(o.p,o.din[1],0);a[2]=d[2]=o.soffit;b[2]=c[2]=q.soffit;
    m.quad(a,b,c,d,tone(C.tunnelTop,.95),mul(Z,-1),[o.p.z,0,seed,5]);
    const pv=mesh('paving',o.p.x,o.p.y),uv=r=>[r[0]/6,r[1]/6],E0=[o.din[0]+TH,o.din[1]+TH],E1=[q.din[0]+TH,q.din[1]+TH];
    const pa=on(o.p,-E0[0]),pb=on(q.p,-E1[0]),pc=on(q.p,E1[1]),pd=on(o.p,E0[1]);pa[2]=pd[2]=o.plaza;pb[2]=pc[2]=q.plaza;
    pv.quad(pa,pb,pc,pd,[1,1,1],Z,F0,[uv(pa),uv(pb),uv(pc),uv(pd)]);
    roofClear.push(o.soffit-o.p.z,o.soffit-o.zr[0],o.soffit-o.zr[1]);
    // Lamps in the ceiling over the Jersey walls, every 6 m, staggered.
    const nL=Math.floor(o.p.s/6)!==Math.floor(q.p.s/6);
    if(nL)for(const [sd,ix] of [[-1,0],[1,1]]){const d=o.din[ix]-.42,c0=on(o.p,sd*d,0);c0[2]=o.soffit-.07;const c1=add(c0,mul(o.p.t,1.3));
     tunnelLamps.beam(c0,c1,.3,.12,Z,[1,1,1],F0);const h=mesh('steel',o.p.x,o.p.y);h.beam(add(c0,[0,0,.04]),add(c1,[0,0,.04]),.38,.06,Z,C.post,F0);}
    if(k%3===0)clearings.push({x:o.p.x,y:o.p.y,r:Math.max(...o.din)+TH+.8});
    shade.push([o,q]);
   }
   if(k%2===0)clearings.push({x:o.p.x,y:o.p.y,r:Math.max(...o.din)+4});
  }
  // Raised planters round the plaza's trees (the city's street-tree survey) and a few more, concrete benches beside
  // them; on the flat slab over the tunnel skaters ride up and down, people cross and kids run.
  const plazaStats={planters:0,benches:0,people:0,skaters:0,reach:null};
  if(covList.length>2){
   plazaStats.reach=[+Math.min(...covList.flatMap(o=>o.reach)).toFixed(1),+Math.max(...covList.flatMap(o=>o.reach)).toFixed(1)];
   const bandAt=(x,y)=>{let best=null;for(const o of covList){const dx=x-o.p.x,dy=y-o.p.y,a=dx*o.p.t[0]+dy*o.p.t[1];if(Math.abs(a)>1.3)continue;const lat=dx*o.p.n[0]+dy*o.p.n[1],ix=lat>0?1:0,e=Math.abs(lat)-o.din[ix]-TH;if(!best||Math.abs(a)<best.a)best={o,ix,e,a:Math.abs(a)};}return best;};
   const spots=[];
   for(const [tx,ty] of data.scenery?.trees?.items??[]){const b=bandAt(tx,ty);if(!b||b.e<1.8||b.e>b.o.reach[b.ix]-1.8)continue;if(spots.some(q=>Math.hypot(q.x-tx,q.y-ty)<4.5))continue;spots.push({x:tx,y:ty,o:b.o,ix:b.ix,e:b.e});}
   for(let k=3;k<covList.length-3;k+=9)for(const ix of [0,1]){const o=covList[k],r=o.reach[ix];if(r<5.5)continue;const e=r*(.4+.25*hash1(k*1.3+ix)),q=on(o.p,(ix?1:-1)*(o.din[ix]+TH+e));if(spots.some(s=>Math.hypot(s.x-q[0],s.y-q[1])<9))continue;spots.push({x:q[0],y:q[1],o,ix,e});}
   const SOIL=tint('#3d2f22'),LEAF=['#3f5f2a','#4d6b2f','#36522a','#5a7036'];
   for(const sp of spots){
    const o=sp.o,t=o.p.t,n=o.p.n,sd=sp.ix?1:-1,size=2.4+hash1(sp.x*.37)*.6,h=.5,base=over(sp.x,sp.y,o.plaza)-.02,m=mesh('concrete',sp.x,sp.y),s2=size/2,rim=.18;
    const P=(a,b,z)=>[sp.x+t[0]*a+n[0]*b,sp.y+t[1]*a+n[1]*b,z],ring=(r,z)=>[P(-r,-r,z),P(r,-r,z),P(r,r,z),P(-r,r,z)];
    const outerB=ring(s2,base-.15),outerT=ring(s2,base+h),innerT=ring(s2-rim,base+h),innerB=ring(s2-rim,base+h-.12),info=[base,0,hash1(sp.y*.13),1];
    for(let j=0;j<4;j++){const j1=(j+1)%4,mid=[(outerT[j][0]+outerT[j1][0])/2-sp.x,(outerT[j][1]+outerT[j1][1])/2-sp.y,0];
     m.quad(outerB[j],outerB[j1],outerT[j1],outerT[j],C.coping,mid,info);m.quad(outerT[j],outerT[j1],innerT[j1],innerT[j],C.coping,Z,info);m.quad(innerT[j],innerT[j1],innerB[j1],innerB[j],C.wall,mul(mid,-1),info);}
    props.quad(innerB[0],innerB[1],innerB[2],innerB[3],SOIL,Z);
    // A low mound of shrubs in it, whether a tree stands there or not.
    const leaf=lin(pick(LEAF,frand())),rr=s2-rim-.15,top=[sp.x,sp.y,base+h-.12+.35+frand()*.35],segs=7;
    for(let k=0;k<segs;k++){const a0=k/segs*TAU,a1=(k+1)/segs*TAU,q0=[sp.x+Math.cos(a0)*rr,sp.y+Math.sin(a0)*rr,base+h-.1],q1=[sp.x+Math.cos(a1)*rr,sp.y+Math.sin(a1)*rr,base+h-.1];props.tri(top,q0,q1,mul(leaf,.85+.3*frand()),Z);}
    plazaStats.planters++;
    // A bench on the side toward the tunnel's axis; someone sitting on some of them, a pair talking by others.
    const bd=-sd*(s2+.85),bx=sp.x+n[0]*bd,by=sp.y+n[1]*bd,bz=over(bx,by,o.plaza)-.02,B=(a,b,z)=>[bx+t[0]*a+n[0]*b,by+t[1]*a+n[1]*b,z];
    m.beam(B(-1.05,0,bz+.21),B(1.05,0,bz+.21),.48,.46,Z,C.coping,[bz,0,hash1(bx*.31),1]);props.beam(B(-1.0,0,bz+.465),B(1.0,0,bz+.465),.44,.03,Z,tint('#7a5236'));plazaStats.benches++;
    const yaw=Math.atan2(-sd*n[1],-sd*n[0]);
    for(const a of [-.55,.45])if(frand()<(mobile?.18:.38))seatZ(person('plaza',{x:bx+t[0]*a,y:by+t[1]*a,yaw,mode:FIG.sit}),bz+.47);
    if(frand()<(mobile?.12:.35)){const a=frand()*TAU,cx=sp.x-n[0]*sd*(s2+2.4),cy=sp.y-n[1]*sd*(s2+2.4),cz=over(cx,cy,o.plaza)-.02;for(let j=0;j<2;j++){const aa=a+j*Math.PI;person('plaza',{x:cx+Math.cos(aa)*.5,y:cy+Math.sin(aa)*.5,z:cz,yaw:aa+Math.PI});}}
   }
   const roof=pathOf(covList.map(o=>({x:o.p.x,y:o.p.y,z:o.plaza,n:o.p.n,u:o.p.s})));
   const half=Math.min(...covList.map(o=>Math.min(o.din[0],o.din[1])))+TH-.9;
   const nS=mobile?3:8,nW=mobile?2:7,nK=mobile?1:3;
   for(let k=0;k<nS;k++){const L=10+frand()*14,u0=roof.u0+8+frand()*Math.max(1,roof.len-16-L),seg=pathOf(roof.sts,u0,u0+L),v=2.6+frand()*2.2;
    person('plaza',{mode:FIG.skate,path:seg,u:u0+frand()*L,d:(frand()*2-1)*half,v,dir:frand()<.5?1:-1,freq:1,turn:Math.PI/2});plazaStats.skaters++;}
   for(let k=0;k<nW;k++){const v=1+frand()*.5;person('plaza',{mode:FIG.walk,path:pathOf(roof.sts,roof.u0+3,roof.u1-3),u:roof.u0+3+frand()*(roof.len-6),d:(frand()*2-1)*half,v,dir:frand()<.5?1:-1,freq:TAU*v/1.45});}
   for(let k=0;k<nK;k++){const v=1.6+frand()*1.2;person('plaza',{mode:FIG.jog,kid:true,path:pathOf(roof.sts,roof.u0+6,roof.u1-6),u:roof.u0+6+frand()*(roof.len-12),d:(frand()*2-1)*half,v,dir:frand()<.5?1:-1,freq:TAU*v/1.05});}
   plazaStats.people=folk.plaza.length;
  }
  tunnelStats.plaza=plazaStats;
  // The road under the roof: the game's asphalt takes the sky's light as if in the open (its material knows nothing of
  // the roof), so a dark film lies on it from wall face to wall face, 1 cm up, faded in over 14 m inside each portal.
  if(shade.length){
   const SH=.5,FADE=14,pos=[],col=[],idx=[],across=[-1,-.5,0,.5,1],fade=s=>SH*clamp((s-cov[0])/FADE,0,1)*clamp((cov[1]-s)/FADE,0,1);
   const row=x=>{const base=pos.length/3,a=fade(x.p.s);for(const u of across){const r=on(x.p,u<0?u*x.p.face[0]:u*x.p.face[1],-.01);pos.push(r[0],r[2],-r[1]);col.push(0,0,0,a);}return base;};
   for(const [o,q] of shade){const a=row(o),b=row(q);for(let j=0;j+1<across.length;j++)idx.push(a+j,b+j,a+j+1,a+j+1,b+j,b+j+1);}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,4));g.setIndex(idx);g.computeBoundingSphere();
   const film=new THREE.Mesh(g,new THREE.MeshBasicMaterial({name:'Sombra_asfalto_tunel',vertexColors:true,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
   film.name='Sombra_asfalto_tunel';film.renderOrder=1;film.matrixAutoUpdate=false;root.add(film);
   stats.meshes++;stats.drawCalls++;stats.triangles+=idx.length/3;tunnelStats.roadShade={opacity:SH,fade:FADE,triangles:idx.length/3};
  }
  // Portal headwalls at both ends of the covered stretch, over the openings, with a parapet and railing on top.
  const portals=[];
  for(const [s,dir,name] of [[cov[0],-1,'norte'],[cov[1],1,'sul']]){
   const cv=list.filter(x=>x.c);if(!cv.length)continue;const o=cv.reduce((b,x)=>Math.abs(x.p.s-s)<Math.abs(b.p.s-s)?x:b,cv[0]);
   const m=mesh('concrete',o.p.x,o.p.y),wR=o.din[0]+TH+1.6,wL=o.din[1]+TH+1.6,z0=o.soffit-.0,z1=o.plaza+1.0,th=.7;
   const P=(d,along,z)=>[o.p.x+o.p.n[0]*d+o.p.t[0]*along*dir,o.p.y+o.p.n[1]*d+o.p.t[1]*along*dir,z];
   const box=[[P(-wR,0,z0),P(wL,0,z0),P(wL,th,z0),P(-wR,th,z0)],[P(-wR,0,z1),P(wL,0,z1),P(wL,th,z1),P(-wR,th,z1)]];
   const [b0,b1]=box,out=mul(o.p.t,dir);
   m.quad(b0[3],b0[2],b1[2],b1[3],tone(C.wall,1.02),out,[o.p.z,0,.71,1]);m.quad(b0[0],b0[1],b1[1],b1[0],C.wall,mul(out,-1));
   m.quad(b1[0],b1[1],b1[2],b1[3],C.coping,Z);m.quad(b0[0],b0[1],b0[2],b0[3],C.tunnelTop,mul(Z,-1),[o.p.z,0,.7,5]);
   m.quad(b0[0],b0[3],b1[3],b1[0],C.wall,mul(o.p.n,-1));m.quad(b0[1],b0[2],b1[2],b1[1],C.wall,o.p.n);
   // A darker band of the lettering-free fascia over the opening (the joint line of the precast face).
   m.quad(P(-wR,th+.01,z0+.35),P(wL,th+.01,z0+.35),P(wL,th+.01,z0+.5),P(-wR,th+.01,z0+.5),tone(C.gutter,1.1),out);
   // Side walls of the portal down to the road's walls (wing faces) below the headwall's ends.
   const r=mesh('steel',o.p.x,o.p.y);r.beam(P(-wR,th*.5,z1+1.05),P(wL,th*.5,z1+1.05),.06,.06,Z,C.railLight,F0,false);for(let d=-wR;d<=wL;d+=2)r.beam(P(d,th*.5,z1),P(d,th*.5,z1+1.08),.05,.05,o.p.n,C.railLight);
   proxy(P(0,th/2,z0),P(0,th/2,z1),wR+wL,th,o.p.t,'Portal_tunel_'+name);
   portals.push({name,s:+o.p.s.toFixed(1),clearance:+(o.soffit-o.p.z).toFixed(2),plaza:+(o.plaza-o.p.z).toFixed(2)});
  }
  // The roof for the follow cameras: they stay under it.
  for(const list of runs)for(let k=0;k<list.length;k+=8){const o=list[k],q=list[Math.min(list.length-1,k+8)];if(!o.c||!q.c)continue;const a=[o.p.x,o.p.y,(o.soffit+o.plaza)/2],b=[q.p.x,q.p.y,(q.soffit+q.plaza)/2];proxy(a,b,o.din[0]+o.din[1]+1,Math.max(.6,o.plaza-o.soffit),Z,'Teto_tunel');}
  Object.assign(tunnelStats,{stations:list.length,from:+list[0].p.s.toFixed(1),to:+list.at(-1).p.s.toFixed(1),covered:cov,portals,
   roofClearance:roofClear.length?{min:+Math.min(...roofClear).toFixed(2),max:+Math.max(...roofClear).toFixed(2)}:null,
   groundAbove:{min:+Math.min(...list.map(o=>o.ga-o.p.z)).toFixed(2),max:+Math.max(...list.map(o=>o.ga-o.p.z)).toFixed(2)}});
 }

 // ================================================================ Driving space check over everything built
 const drive={checked:0,violations:0,worst:null,samples:[]};
 for(const m of [...chunks.values(),tunnelLamps,props]){
  for(let v=0;v<m.p.length;v+=3){
   const x=m.p[v],y=-m.p[v+2],z=m.p[v+1];drive.checked++;
   for(const h of lapAt(x,y)){const a=Math.abs(h.lat),over=z-h.road;
    const bad=a<h.face?over>.02&&over<DRIVE-.05:a<h.back?over>.02&&over<JERSEY_ZONE:false;
    if(bad){drive.violations++;if(drive.samples.length<8&&!drive.samples.some(q=>Math.hypot(q.x-x,q.y-y)<6))drive.samples.push({kind:m.kind,key:m.key,s:+h.s.toFixed(1),lat:+h.lat.toFixed(2),over:+over.toFixed(2),x:+x.toFixed(1),y:+y.toFixed(1)});if(!drive.worst||over<drive.worst.over)drive.worst={kind:m.kind,s:+h.s.toFixed(1),lat:+h.lat.toFixed(2),over:+over.toFixed(2),x:+x.toFixed(1),y:+y.toFixed(1)};}}
  }
 }

 // ================================================================ Meshes
 const fine=[];
 function emit(m,material,name,{cast=true,receive=true,uv=false}={}){
  if(!m.i.length)return null;const o=new THREE.Mesh(m.geometry(uv),material);o.name=name;o.castShadow=cast;o.receiveShadow=receive;o.matrixAutoUpdate=false;root.add(o);
  stats.meshes++;stats.drawCalls++;stats.triangles+=m.triangles;(stats.parts??={})[name]=(stats.parts[name]??0)+m.triangles;return o;
 }
 for(const m of chunks.values()){
  if(m.kind==='concrete')emit(m,concrete,'Concreto_Minhocao');
  else if(m.kind==='deckRoad')emit(m,deckRoad,'Pista_Minhocao',{cast:false,uv:true});
  else if(m.kind==='rampRoad')emit(m,rampRoad,'Pista_alcas',{cast:false,uv:true});
  else if(m.kind==='paving')emit(m,paving,'Piso_Praca_Roosevelt',{cast:false,uv:true});
  else if(m.kind==='steel'){const o=emit(m,steel,'Gradis_Minhocao',{cast:!mobile});if(o)fine.push(o);}
  else if(m.kind==='bars'){const o=emit(m,bars,'Gradil_barras_Minhocao',{cast:false,uv:true});if(o)fine.push(o);}
 }
 const lampMesh=emit(tunnelLamps,lampLight,'Luminarias_tunel',{cast:false,receive:false});
 // Lamp posts (instanced): double-arm on the central barrier, single-arm on the parapets of the lap's deck.
 function postGeometry(kind){
  const m=new Mesher(),pole=tint('#8f969a'),head=tint('#3a3e42'),lens=tint('#d8dcda');
  m.cyl([0,0,0],[0,0,.4],.17,.15,8,pole);m.cyl([0,0,.4],[0,0,10.2],.12,.075,8,pole,false);
  for(const sd of kind==='double'?[-1,1]:[1]){const arm=[[0,0,9.8],[0,sd*.5,10.35],[0,sd*1.4,10.6],[0,sd*2.3,10.65]];for(let k=0;k+1<arm.length;k++)m.cyl(arm[k],arm[k+1],.055,.05,6,pole,false);
   m.beam([0,sd*2.05,10.62],[0,sd*2.95,10.6],.34,.16,Z,head);m.beam([0,sd*2.12,10.53],[0,sd*2.88,10.52],.26,.02,Z,lens);}
  return m.geometry();
 }
 for(const kind of ['double','single']){
  const list=lampPosts[kind];if(!list.length)continue;
  const geo=postGeometry(kind),im=new THREE.InstancedMesh(geo,steel,list.length);im.name=kind==='double'?'Postes_Minhocao':'Postes_volta_Minhocao';
  const mtx=new THREE.Matrix4(),q=new THREE.Quaternion(),lean=new THREE.Quaternion(),pos=new THREE.Vector3(),one=new THREE.Vector3(1,1,1),c=new THREE.Color();
  // The geometry's arms point along +y (track frame), i.e. -z in three.js; turned so +y lies along dir.
  list.forEach((l,k)=>{q.setFromAxisAngle(new THREE.Vector3(0,1,0),Math.atan2(l.dir[1],l.dir[0])-Math.PI/2);lean.setFromAxisAngle(new THREE.Vector3(1,0,0),(l.seed-.5)*.014);q.multiply(lean);
   im.setMatrixAt(k,mtx.compose(pos.set(l.p[0],l.p[2],-l.p[1]),q,one));const t=.9+l.seed*.16;im.setColorAt(k,c.setRGB(t,t,t));});
  im.castShadow=true;im.receiveShadow=true;im.computeBoundingSphere();root.add(im);fine.push(im);
  stats.instances+=list.length;stats.drawCalls++;stats.meshes++;stats.triangles+=geo.index.count/3*list.length;
 }
 // The people (instanced, posed on the GPU; the movers stepped along their paths each frame) and the props.
 const figs=figureMaterials(),place=new THREE.Matrix4(),turnY=new THREE.Quaternion(),UPY=new THREE.Vector3(0,1,0),fpos=new THREE.Vector3(),fscale=new THREE.Vector3(),crowds=[];
 function setFigure(f){
  let x=f.x,y=f.y,z=f.z,yaw=f.yaw;
  if(f.path){const r=f.path.at(f.u,f.d);x=r[0];y=r[1];z=r[2];yaw=r[3]+(f.mode===FIG.skate?f.turn:f.dir<0?Math.PI:0);}
  f.mesh.setMatrixAt(f.index,place.compose(fpos.set(x,z,-y),turnY.setFromAxisAngle(UPY,yaw),fscale.setScalar(f.scale)));
 }
 for(const group of ['park','plaza'])for(const riders of [false,true]){
  const list=folk[group].filter(f=>(f.mode===FIG.cycle||f.mode===FIG.skate)===riders);if(!list.length)continue;
  const g=figureGeometry({riders,mobile}),n=list.length,pd=new Float32Array(n*4),sh=new Float32Array(n*3),pa=new Float32Array(n*3),sk=new Float32Array(n*3);
  const im=new THREE.InstancedMesh(g,figs.look,n);im.name=(group==='park'?'Parque_Minhocao':'Praca_Roosevelt')+(riders?'_bicicletas_skates':'_pessoas');im.customDepthMaterial=figs.depth;
  const box=new THREE.Box3(),v=new THREE.Vector3();
  list.forEach((f,i)=>{pd.set(f.data,i*4);sh.set(f.shirt,i*3);pa.set(f.pants,i*3);sk.set(f.skin,i*3);f.mesh=im;f.index=i;setFigure(f);
   if(f.path){for(const s of f.path.sts)if(s.u>=f.path.u0-4&&s.u<=f.path.u1+4)box.expandByPoint(v.set(s.x,s.z,-s.y));}else box.expandByPoint(v.set(f.x,f.z,-f.y));});
  g.setAttribute('pData',new THREE.InstancedBufferAttribute(pd,4));g.setAttribute('pShirt',new THREE.InstancedBufferAttribute(sh,3));
  g.setAttribute('pPants',new THREE.InstancedBufferAttribute(pa,3));g.setAttribute('pSkin',new THREE.InstancedBufferAttribute(sk,3));
  box.expandByScalar(9);im.boundingBox=box;im.boundingSphere=box.getBoundingSphere(new THREE.Sphere());
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);im.castShadow=!mobile;im.receiveShadow=true;root.add(im);crowds.push(im);fine.push(im);
  stats.instances+=n;stats.drawCalls++;stats.meshes++;stats.triangles+=g.attributes.position.count/3*n;
 }
 const propsMesh=emit(props,new THREE.MeshStandardMaterial({name:'Objetos_parque',vertexColors:true,roughness:.7,metalness:0}),'Objetos_Parque_Minhocao');if(propsMesh)fine.push(propsMesh);
 root.updateMatrixWorld(true);
 // Far off the railings and lamp posts are a few pixels of shimmer: drawn within 700 m.
 const camAt=new THREE.Vector3();
 function update(dt,camera){
  figs.clock.value+=dt;
  if(dt>0){for(const f of movers){const p=f.path;f.u+=f.v*f.dir*dt;if(f.u>p.u1){f.u=2*p.u1-f.u;f.dir=-1;}else if(f.u<p.u0){f.u=2*p.u0-f.u;f.dir=1;}if(f.mesh.visible)setFigure(f);}
   for(const im of crowds)if(im.visible)im.instanceMatrix.needsUpdate=true;}
  if(!camera)return;camera.getWorldPosition(camAt);
  for(const o of fine){const s=o.isInstancedMesh?o.boundingSphere:o.geometry.boundingSphere;if(s)o.visible=camAt.distanceTo(s.center)-s.radius<700;}
 }
 Object.assign(stats,{trianglesK:Math.round(stats.triangles/1000),deck:{points:DN,length:+(deckPts.at(-1)?.arc??0).toFixed(0),built:gridEnd?gridEnd.map(v=>+v.toFixed(0)):null,lap:M.lap,
  lapStations:lapStations.reduce((n,l)=>n+l.length,0),offStations:offStations.reduce((n,l)=>n+l.length,0),strips:strips.length,
  wallRuns:[...lapStations,...offStations].flatMap(l=>{const out=[];let a=null;for(const o of l){if(o.wall&&!a)a=o;if(!o.wall&&a){out.push([+a.u.toFixed(0),+o.u.toFixed(0)]);a=null;}}if(a)out.push([+a.u.toFixed(0),+l.at(-1).u.toFixed(0)]);return out;}),
  depthMin:+Math.min(DEPTH,...[...lapStations,...offStations].flat().map(o=>o.depth)).toFixed(2)},
  piers:{...pierStats,skipped:pierStats.skipped.slice(0,40),skippedCount:pierStats.skipped.length},ramps:rampStats,tunnel:tunnelStats,
  crossings:[...crossings.values()].sort((a,b)=>a.street_s-b.street_s),driveSpace:drive,lampPosts:{double:lampPosts.double.length,single:lampPosts.single.length},lamps:lampMesh?tunnelLamps.triangles/12:0,clearings:clearings.length,cameraObstacles:obstacles.length,
  park:{...parkStats,length:+parkStats.length.toFixed(0),people:folk.park.length,movers:movers.filter(f=>f.group==='park').length},murals,props:props.triangles});
 return {root,obstacles,update,stats,clearings};
}
