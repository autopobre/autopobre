import * as THREE from 'three';
import {guardrailClearance,guardrailPresent} from './physics.js';
import {branchSpace} from './branch-layout.js';

// The Lagoa da Pampulha's own residents (pedido #8: "em pontos aleatórios da lagoa devem aparecer algumas capivaras,
// sempre em um único ponto por corrida, alternando o ponto entre as corridas. Eventualmente também deve aparecer
// 1 jacaré gordo repousando"). The track file lists the banks where they may stand (data.scenery.fauna.spots: 15
// lawns between the lap's walls and the water, 2.5 m from the water's edge, `room` metres deep). Each race one family
// of capybaras (5 to 8, two or three pups) lives at ONE of them, never last race's (remembered in memory and in
// localStorage), and about one race in three a fat broad-snouted caiman (jacaré-de-papo-amarelo) basks at another,
// half out of the water with its mouth open, as they do to cool off.
// - Where on the bank: the road runs 1.5 to 4.5 m above the water and the Jersey walls hide the low ground near it,
//   so the family grazes on the lawn cells the lap sees (rays from the driver's and the chase camera's eye over the
//   walls and the ground, the chain-link fence is see-through), swimmers in the water nearby, the caiman on the
//   waterline cell seen best. Trees go round every spot and along the sight lines from the lap (clearings).
// - Life: grazing heads down, heads up chewing, ears twitching, one lying down, one or two swimming with only the back
//   and the head out, the pups trotting after their mother; a car within 45 m and they lift their heads and watch it.
//   Someone on foot (free-walk.js) within 6.5 m and they amble off or slip into the water; the caiman slides back in.
// - Drawing: the capybaras are ONE instanced mesh (a rigid-part puppet: the vertex shader turns the head, neck, ears
//   and legs about their joints from per-instance pose attributes), the caiman one mesh (jaw, eyelids, head and tail
//   from uniforms), their contact shadows and the ripples round the swimmers one more. Full life within 250 m of the
//   camera, a few updates a second out to 600 m, hidden beyond. Nothing ever stands on the lap (habitat cells keep
//   2.5 m off the walls' backs; every placement is checked against the driving space).

const STORE='opala99-pampulha-fauna-v1',NEAR=250,FAR=600,TAU=Math.PI*2;
// Habitat cells (1 m): blocked (the lap), lawn flat enough to graze, the steep bank or the shore, shallow water, water
// deep enough to float in.
const BLOCKED=0,GRASS=1,BANK=2,WADE=3,SWIM=4;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),lerp=(a,b,u)=>a+(b-a)*u,smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],mul=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};
const mix3=(a,b,u)=>[lerp(a[0],b[0],u),lerp(a[1],b[1],u),lerp(a[2],b[2],u)];
// Linear colours (vertex colours are linear): an sRGB hex scaled by k.
const lin=(hex,k=1)=>{const c=new THREE.Color(hex);return [c.r*k,c.g*k,c.b*k];};
function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
const hash=(i,j)=>{const h=Math.sin(i*127.1+j*311.7)*43758.5453;return h-Math.floor(h);};
function noise(x,y){const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,su=u*u*(3-2*u),sv=v*v*(3-2*v);return (hash(i,j)*(1-su)+hash(i+1,j)*su)*(1-sv)+(hash(i,j+1)*(1-su)+hash(i+1,j+1)*su)*sv;}
const fbm=(x,y)=>.55*noise(x,y)+.3*noise(x*2.1+5.2,y*2.1+1.3)+.15*noise(x*4.3+9.1,y*4.3+7.7);
function gridHeight(g,x,y){
 if(!g)return null;const fx=(x-g.x0)/g.step,fy=(y-g.y0)/g.step;if(fx<0||fy<0||fx>g.nx-1||fy>g.ny-1)return null;
 const i=Math.min(g.nx-2,Math.floor(fx)),j=Math.min(g.ny-2,Math.floor(fy)),u=fx-i,v=fy-j,k=j*g.nx+i;
 return (g.z[k]*(1-u)+g.z[k+1]*u)*(1-v)+(g.z[k+g.nx]*(1-u)+g.z[k+g.nx+1]*u)*v;
}

// ---------- Which bank this race: never last race's; the caiman now and then at another, well apart. Kept for the
// session (a reload of the circuit keeps it) and in localStorage, so the next visit starts somewhere else too.
let memory=null;
function remembered(){
 if(memory)return memory;let m=null;try{m=JSON.parse(globalThis.localStorage?.getItem(STORE)??'null');}catch{}
 const int=(v,d)=>Number.isInteger(v)?v:d;return memory={capy:int(m?.capy,-1),caiman:int(m?.caiman,-1),missed:int(m?.missed,0),races:int(m?.races,0)};
}
function keep(m){memory=m;try{globalThis.localStorage?.setItem(STORE,JSON.stringify(m));}catch{}}
// About one race in three: a fifth after a race with it, likelier with every race without, certain after three.
const CAIMAN_ODDS=[.2,.3,.45,1];
function draw(spots,L,shown=()=>1){
 const m=remembered(),n=spots.length,r=Math.random;if(!n)return {capy:-1,caiman:-1};
 let capy=Math.floor(r()*n);if(n>1&&capy===m.capy)capy=(capy+1+Math.floor(r()*(n-1)))%n;
 let caiman=-1;
 if(n>1&&r()<CAIMAN_ODDS[Math.min(m.missed,3)]){
  // Where the lap sees its waterline well (shown: what the lap sees of it, 0..1), when there is such a bank.
  const gap=i=>{const d=Math.abs(spots[i].s-spots[capy].s)%L;return Math.min(d,L-d);},all=spots.map((_,i)=>i).filter(i=>i!==capy),far=all.filter(i=>i!==m.caiman&&gap(i)>600);
  const pool=far.length?far:all,seen=pool.filter(i=>shown(i)>=.25);caiman=(seen.length?seen:pool)[Math.floor(r()*(seen.length||pool.length))];
 }
 keep({capy,caiman,missed:caiman<0?m.missed+1:0,races:m.races+1});return {capy,caiman};
}

// ---------- The lap's driving space (asphalt and walls): pampulha-igrejinha.js's index, the same rule.
function lapSpace(data){
 // A branch road beside the lap (data.branches, branch-layout.js): its asphalt and walls are driving space too.
 const branch=branchSpace(data);
 const A=data.samples,N=A.length,CELL=8,cells=new Map(),key=(i,j)=>i*131071+j;
 const st=A.map(p=>{const nl=Math.hypot(p[9],p[10])||1,q={s:p[0],x:p[1],y:p[2],z:p[3],w:p[4],cf:p[5],n:[p[9]/nl,p[10]/nl],back:[0,0]};for(const [k,side] of [[0,-1],[1,1]])q.back[k]=p[4]/2+guardrailClearance(data,p[0],side)+(guardrailPresent(data,p[0],side)?.75:0);return q;});
 for(let i=0;i<N;i++){const p=st[i],q=st[(i+1)%N],r=Math.max(...p.back,...q.back)+4;
  for(let ci=Math.floor((Math.min(p.x,q.x)-r)/CELL);ci<=Math.floor((Math.max(p.x,q.x)+r)/CELL);ci++)for(let cj=Math.floor((Math.min(p.y,q.y)-r)/CELL);cj<=Math.floor((Math.max(p.y,q.y)+r)/CELL);cj++){const k=key(ci,cj);let l=cells.get(k);if(!l)cells.set(k,l=[]);l.push(i);}}
 function at(x,y){
  const list=cells.get(key(Math.floor(x/CELL),Math.floor(y/CELL))),out=branch.at(x,y);if(!list)return out;
  for(const i of list){const p=st[i],q=st[(i+1)%N],dx=q.x-p.x,dy=q.y-p.y,l2=dx*dx+dy*dy||1e-9;let u=((x-p.x)*dx+(y-p.y)*dy)/l2;if(u<-.02||u>1.02)continue;u=clamp(u,0,1);
   const nx=lerp(p.n[0],q.n[0],u),ny=lerp(p.n[1],q.n[1],u),lat=(x-p.x-dx*u)*nx+(y-p.y-dy*u)*ny,k=lat>=0?1:0;
   out.push({s:p.s,lat,road:lerp(p.z,q.z,u)+lerp(p.cf,q.cf,u)*lat,back:lerp(p.back[k],q.back[k],u)});}
  return out;
 }
 // Clear of the asphalt and the walls by `margin` metres.
 const free=(x,y,margin)=>!at(x,y).some(h=>Math.abs(h.lat)<h.back+margin);
 return {at,free,st};
}

// ---------- Geometry: closed surfaces over (a 0..1 pole to pole, b 0..1 round), each vertex with its part and joint
// (the vertex shaders below turn the parts about their joints). Three.js axes, the animal's own frame: x forward,
// y up, z to its right; the origin on the ground under the body.
class Geo{
 constructor(){this.p=[];this.n=[];this.c=[];this.t=[];this.part=[];this.piv=[];this.i=[];}
 get vertices(){return this.p.length/3;}
 get triangles(){return this.i.length/3;}
 surface(f,rows,cols,col,{part=0,pivot=[0,0,0],uv=(a,b)=>[a,b]}={}){
  const base=this.vertices,e=1e-3;
  for(let i=0;i<=rows;i++){const a=i/rows,aa=clamp(a,4*e,1-4*e);
   for(let j=0;j<=cols;j++){const b=j/cols,p=f(a,b),n=unit(cross(sub(f(aa,b+e),f(aa,b-e)),sub(f(aa+e,b),f(aa-e,b))));
    this.p.push(...p);this.n.push(...n);this.c.push(...col(p,a,b));this.t.push(...uv(p,a,b));this.part.push(part);this.piv.push(...pivot);}}
  for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const k=base+i*(cols+1)+j,q=k+cols+1;this.i.push(k,k+1,q,k+1,q+1,q);}
 }
 // An ellipsoid at c with radii r, its axes turned by `turn` (a function of the local offset).
 ellipsoid(c,r,rows,cols,col,opts={},turn=v=>v){
  this.surface((a,b)=>{const th=Math.PI*a,ph=TAU*b,v=[-Math.cos(th)*r[0],Math.sin(th)*Math.cos(ph)*r[1],Math.sin(th)*Math.sin(ph)*r[2]];return add(c,turn(v));},rows,cols,typeof col==='function'?col:()=>col,opts);
 }
 // A round tube from p to q (radius r0 to r1), closed at both ends.
 tube(p,q,r0,r1,sides,col,opts={}){
  const d=unit(sub(q,p)),e1=unit(Math.abs(d[1])>.9?cross(d,[1,0,0]):cross(d,[0,1,0])),e2=cross(d,e1),L=Math.hypot(...sub(q,p));
  this.surface((a,b)=>{const end=a<.1?Math.sin(a/.1*Math.PI/2):a>.9?Math.sin((1-a)/.1*Math.PI/2):1,u=clamp((a-.1)/.8,0,1),t=a<.1?-.04*(1-a/.1):a>.9?1+.04*(a-.9)/.1:u,r=lerp(r0,r1,u)*end,ph=TAU*b;
   return add(p,add(mul(d,t*L),add(mul(e1,Math.cos(ph)*r),mul(e2,Math.sin(ph)*r))));},6,sides,typeof col==='function'?col:()=>col,opts);
 }
 // A small pyramid (a scute, a tooth): base centre c, apex along n by h, base l along t, w across.
 spike(c,n,t,h,l,w,col,opts={}){
  const s=unit(cross(n,t)),a=add(c,mul(n,h)),base=[add(add(c,mul(t,l/2)),mul(s,w/2)),add(sub(c,mul(t,l/2)),mul(s,w/2)),sub(sub(c,mul(t,l/2)),mul(s,w/2)),add(sub(c,mul(s,w/2)),mul(t,l/2))];
  for(let k=0;k<4;k++){const p=base[k],q=base[(k+1)%4],fn=unit(cross(sub(q,p),sub(a,p))),v=this.vertices;
   for(const x of [p,q,a]){this.p.push(...x);this.n.push(...fn);this.c.push(...(typeof col==='function'?col(x):col));this.t.push(0,0);this.part.push(opts.part??0);this.piv.push(...(opts.pivot??[0,0,0]));}
   this.i.push(v,v+1,v+2);}
 }
 geometry(){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(this.t,2));g.setAttribute('part',new THREE.Float32BufferAttribute(this.part,1));g.setAttribute('pivot',new THREE.Float32BufferAttribute(this.piv,3));
  g.setIndex(this.i);g.computeBoundingSphere();return g;
 }
}

// ---------- Textures (canvas, grey: the colour is the vertex colours'). Linear data: a multiplier near 0.8.
function greyTexture(size,paint){const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d');paint(ctx,size);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;}
const around=(w,x,y,s,fn)=>{for(const dx of [-w,0,w])for(const dy of [-w,0,w])if(x+dx+s>0&&x+dx-s<w&&y+dy+s>0&&y+dy-s<w)fn(x+dx,y+dy);};
// Capybara fur: coarse, sparse hairs 3 to 6 cm long lying front to back (u), darker roots between (0.45 m a tile).
const furTexture=()=>greyTexture(256,(ctx,w)=>{
 const r=random(9);ctx.fillStyle='rgb(196,196,196)';ctx.fillRect(0,0,w,w);
 for(let k=0;k<380;k++){const x=r()*w,y=r()*w,s=10+r()*26,v=r()<.5?236:150;around(w,x,y,s,(px,py)=>{const g=ctx.createRadialGradient(px,py,0,px,py,s);g.addColorStop(0,`rgba(${v},${v},${v},.18)`);g.addColorStop(1,`rgba(${v},${v},${v},0)`);ctx.fillStyle=g;ctx.fillRect(px-s,py-s,2*s,2*s);});}
 ctx.lineCap='round';
 for(let k=0;k<2600;k++){const x=r()*w,y=r()*w,l=14+r()*24,a=(r()-.5)*.35,v=r()<.62?100+r()*50:228+r()*27;ctx.strokeStyle=`rgba(${v|0},${v|0},${v|0},${.22+r()*.35})`;ctx.lineWidth=.8+r()*1.3;
  around(w,x,y,l,(px,py)=>{ctx.beginPath();ctx.moveTo(px,py);ctx.quadraticCurveTo(px+Math.cos(a)*l*.5,py+Math.sin(a)*l*.5+(r()-.5)*3,px+Math.cos(a)*l,py+Math.sin(a)*l);ctx.stroke();});}
});
// The caiman's hide: rows of rectangular scales with dark grooves, each its own tone (0.30 m a tile along).
const hideTexture=()=>greyTexture(256,(ctx,w)=>{
 const r=random(23);ctx.fillStyle='rgb(92,92,92)';ctx.fillRect(0,0,w,w);const rows=8,cols=10;
 for(let j=0;j<rows;j++){const off=(j%2)*.5;for(let i=0;i<cols;i++){const x=(i+off)*w/cols,y=j*w/rows,cw=w/cols,ch=w/rows,v=178+r()*60;
  around(w,x+cw/2,y+ch/2,cw,(px,py)=>{ctx.fillStyle=`rgb(${v|0},${v|0},${v|0})`;ctx.beginPath();ctx.roundRect(px-cw/2+2.2,py-ch/2+2.2,cw-4.4,ch-4.4,4);ctx.fill();
   const g=ctx.createLinearGradient(px,py-ch/2,px,py+ch/2);g.addColorStop(0,'rgba(255,255,255,.12)');g.addColorStop(1,'rgba(0,0,0,.14)');ctx.fillStyle=g;ctx.fill();});}}
 for(let k=0;k<1500;k++){const v=r()<.5?40:255;ctx.fillStyle=`rgba(${v},${v},${v},${.05+r()*.08})`;ctx.fillRect(r()*w,r()*w,1+r()*2,1+r()*2);}
});
// Contact shadows (green channel, left half) and ripple rings (red channel, right half) in one atlas.
function fxTexture(){
 const c=document.createElement('canvas');c.width=128;c.height=64;const x=c.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,128,64);x.globalCompositeOperation='lighter';
 let g=x.createRadialGradient(32,32,0,32,32,31);g.addColorStop(0,'rgb(0,230,0)');g.addColorStop(.5,'rgb(0,150,0)');g.addColorStop(1,'rgb(0,0,0)');x.fillStyle=g;x.fillRect(0,0,64,64);
 g=x.createRadialGradient(96,32,0,96,32,31);for(const [k,v] of [[0,0],[.62,0],[.8,90],[.88,255],[.94,70],[1,0]])g.addColorStop(k,`rgb(${v},0,0)`);x.fillStyle=g;x.fillRect(64,0,64,64);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.NoColorSpace;return t;
}

// ---------- The pose shaders: a GLSL function `pose(inout vec3 p, inout vec3 n)` run on the standard material (normal
// and position) and on the shadow's depth material (position).
const ROT=`mat3 faunaRx(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}
mat3 faunaRy(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}
mat3 faunaRz(float a){float c=cos(a),s=sin(a);return mat3(c,s,0.,-s,c,0.,0.,0.,1.);}`;
function posed(material,head,key,uniforms={}){
 material.onBeforeCompile=sh=>{
  Object.assign(sh.uniforms,uniforms);
  sh.vertexShader=sh.vertexShader.replace('#include <common>',`#include <common>\n${ROT}\n${head}`);
  if(sh.vertexShader.includes('#include <beginnormal_vertex>')&&!material.isMeshDepthMaterial)
   sh.vertexShader=sh.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nvec3 faunaP=vec3(position);pose(faunaP,objectNormal);').replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed=faunaP;');
  else sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n{vec3 faunaN=vec3(0.,1.,0.);pose(transformed,faunaN);}');
 };
 material.customProgramCacheKey=()=>key+(material.isMeshDepthMaterial?'-depth':'');return material;
}
// Capybara parts: 0 body, 1 head, 2 neck, 3/4 ears, 5..8 legs (fore left, fore right, hind left, hind right),
// 9 the male's dark morrillo on the snout. Per instance: aPose (head pitch, head yaw, breath, neck drop), aLegs (gait
// phase, stride, left and right ear flick), aLook (head scale: the pups' big heads, male, lying, head roll).
const NECK=[.40,.52,0];
const CAPY_GLSL=`attribute float part;attribute vec3 pivot;attribute vec4 aPose;attribute vec4 aLegs;attribute vec4 aLook;
void pose(inout vec3 p,inout vec3 n){
 float k=floor(part+.5);vec3 N=vec3(${NECK.map(v=>v.toFixed(2)).join(',')});
 if(k>=4.5&&k<8.5){float lead=(k<5.5||k>7.5)?0.:3.14159;float a=aLegs.y*sin(aLegs.x+lead)+aLook.z*(k<6.5?-1.3:1.4);
  mat3 R=faunaRz(a);p=pivot+R*(p-pivot)*(1.-.4*aLook.z);n=R*n;p.y+=max(0.,-cos(aLegs.x+lead))*aLegs.y*.07*(1.-aLook.z);}
 if(k>2.5&&k<4.5){float f=k<3.5?aLegs.z:aLegs.w;mat3 R=faunaRz(-f)*faunaRx((k<3.5?-1.:1.)*.45*f);p=pivot+R*(p-pivot);n=R*n;}
 if(k>8.5){p=pivot+(p-pivot)*vec3(aLook.y,aLook.y,aLook.y);}
 if(k<.5){float b=1.+aPose.z*(1.-smoothstep(-.1,.45,p.x));p.yz=vec2(.43+(p.y-.43)*b,p.z*b);}
 if(k>.5&&k<4.5||k>8.5){float w=k>1.5&&k<2.5?.5:1.;mat3 R=faunaRy(aPose.y*w)*faunaRz(aPose.x*w)*faunaRx(aLook.w*w);
  vec3 q=k>1.5&&k<2.5?(p-N):(p-N)*aLook.x;p=N+R*q+aPose.w*w*vec3(.07,-.14,0.);n=R*n;}
}`;
// The caiman: parts 0 hide (the head and the tail bend by position), 1 lower jaw, 2 eyes, 3 legs (still).
const GATOR_GLSL=`attribute float part;attribute vec3 pivot;uniform float uJaw;uniform float uHeadPitch;uniform float uHeadYaw;uniform float uBlink;uniform float uTail;uniform float uBreath;
void pose(inout vec3 p,inout vec3 n){
 float k=floor(part+.5),x0=p.x;
 if(k>.5&&k<1.5){mat3 R=faunaRz(-uJaw);p=pivot+R*(p-pivot);n=R*n;}
 if(k>1.5&&k<2.5){p=pivot+(p-pivot)*vec3(1.,1.-.86*uBlink,1.);}
 if(k<.5){float b=uBreath*smoothstep(-.6,-.2,x0)*(1.-smoothstep(.3,.55,x0));p.yz=vec2(.19+(p.y-.19)*(1.+b),p.z*(1.+b*1.4));}
 if(x0<-.45&&k<2.5){float t=(-.45-x0)/1.5,a=uTail*t*t*1.3;mat3 R=faunaRy(a);vec3 o=vec3(-.45,p.y,0.);p=o+R*(p-o);n=R*n;}
 float w=k>2.5?0.:k>.5?1.:smoothstep(.40,.64,x0);
 if(w>0.){vec3 o=vec3(.52,.2,0.);mat3 R=faunaRy(uHeadYaw*w)*faunaRz(uHeadPitch*w);p=o+R*(p-o);n=R*n;}
}`;

// ---------- The capybara (adult, 1.3 m nose to rump, 0.68 m at the rump): a deep barrel with the high round rump and
// no tail, the big square head with the blunt deep muzzle, eyes and ears high on it, short thick legs, coarse
// brown fur with a reddish cast, the belly and throat lighter, the muzzle darker.
function capybaraGeometry(mobile){
 const G=new Geo(),q=mobile?.6:1,R=n=>Math.max(4,Math.round(n*q));
 const back=lin(0x6a4a33,1.15),flank=lin(0x87613f,1.15),belly=lin(0xa58763,1.1),face=lin(0x7a5638,1.1),muzzle=lin(0x4c3b2e,1.1),foot=lin(0x4a3b2e),dark=lin(0x16110d),eye=lin(0x0b0907);
 const furAt=(p,up)=>{const k=.9+.2*fbm(p[0]*7+3,p[1]*7+p[2]*5);const c=up>.35?mix3(flank,back,smooth(.35,.9,up)):mix3(belly,flank,smooth(-.75,.1,up));return mul(c,k);};
 const furUv=(p,a,b)=>[p[0]/.45,b*3];
 // The body: a deep barrel, the rump high, broad and blunt, narrowing a little to the shoulders.
 const body=(a,b)=>{const sx=-Math.cos(Math.PI*a),r=Math.pow(Math.sin(Math.PI*a),.6),ph=TAU*b,cy=Math.cos(ph),sz=Math.sin(ph),rear=Math.max(0,-sx),fore=Math.max(0,sx);
  const top=.235*(1+.13*rear)-.035*fore**2,bot=.21-.02*fore,hw=.25*(1+.05*rear)*(1-.2*fore**1.5);
  return [-.03+sx*(sx<0?.49:.47),.43+.015*rear+r*(cy>0?top:bot)*Math.sign(cy)*Math.abs(cy)**.85,r*hw*Math.sign(sz)*Math.abs(sz)**.85];};
 G.surface(body,R(18),R(16),(p,a,b)=>furAt(p,Math.cos(TAU*b)),{part:0,uv:furUv});
 // The neck: a thick collar between the shoulders and the head (it follows the head half way).
 G.ellipsoid([.34,.49,0],[.17,.17,.165],R(8),R(12),p=>furAt(p,(p[1]-.47)/.17),{part:2,pivot:NECK,uv:furUv});
 // The head, in the neck's frame, tilted nose down: boxy, as deep at the muzzle as at the cheeks, the cheeks broad.
 const tilt=-.25,ct=Math.cos(tilt),st=Math.sin(tilt),H=v=>[NECK[0]+v[0]*ct-v[1]*st,NECK[1]+v[0]*st+v[1]*ct,v[2]];
 const head=(a,b)=>{const sx=-Math.cos(Math.PI*a),r=Math.pow(Math.sin(Math.PI*a),.45),ph=TAU*b,cy=Math.cos(ph),sz=Math.sin(ph),f=(sx+1)/2;
  const hh=.128-.016*f,hw=.125-.045*f*f;return H([.17+sx*.23,r*hh*Math.sign(cy)*Math.abs(cy)**.6*(cy>0?.94:1),r*hw*Math.sign(sz)*Math.abs(sz)**.65]);};
 G.surface(head,R(12),R(12),(p,a,b)=>{const f=a,up=Math.cos(TAU*b);let c=mix3(mix3(face,back,smooth(.4,.9,up)),muzzle,smooth(.74,.97,f));if(up<-.35)c=mix3(c,belly,smooth(-.35,-.85,up)*(1-smooth(.7,.95,f))*.7);if(f>.6&&Math.abs(up+.28)<.1)c=mul(c,.5);return mul(c,.92+.16*fbm(p[0]*11,p[1]*11+p[2]*7));},{part:1,pivot:NECK,uv:furUv});
 for(const side of [-1,1]){
  G.ellipsoid(H([.09,.088,.104*side]),[.022,.021,.017],R(5),R(7),eye,{part:1,pivot:NECK});
  G.ellipsoid(H([.395,.045,.04*side]),[.013,.01,.015],4,5,dark,{part:1,pivot:NECK});
  // The ears: small round flaps, high and back.
  const ear=H([.0,.128,.085*side]);G.ellipsoid(add(ear,[0,.025,.005*side]),[.012,.03,.028],R(5),R(7),mul(face,.75),{part:side<0?3:4,pivot:ear},v=>[v[0]*.95+v[2]*.3*side,v[1],v[2]*.95-v[0]*.3*side]);
 }
 G.ellipsoid(H([.27,.118,0]),[.05,.014,.03],R(5),R(7),dark,{part:9,pivot:H([.27,.11,0])});
 // The legs: short and thick, the hind ones from the bulky thighs; dark feet with the toes forward.
 for(const [k,hip,toe,r0,r1] of [[5,[.24,.32,-.13],[.26,.03,-.14],.08,.056],[6,[.24,.32,.13],[.26,.03,.14],.08,.056],[7,[-.3,.36,-.14],[-.27,.03,-.15],.105,.058],[8,[-.3,.36,.14],[-.27,.03,.15],.105,.058]]){
  G.tube(hip,toe,r0,r1,R(8),p=>mul(mix3(foot,flank,smooth(.02,.2,p[1])),.92+.16*fbm(p[0]*9,p[1]*9)),{part:k,pivot:hip,uv:furUv});
  G.ellipsoid([toe[0]+.04,.024,toe[2]],[.07,.024,.048],R(4),R(7),foot,{part:k,pivot:hip});
 }
 return G;
}

// ---------- The fat caiman (jacaré-de-papo-amarelo, 3.1 m): broad flat body spread on the bank, the broad short snout,
// eyes on bumps, rows of osteoderms down the back and the double crest on the tail, the yellow throat, olive-grey hide
// with dark bands on the tail, legs splayed. Mouth open: the pale inside and the teeth.
function caimanGeometry(mobile){
 const G=new Geo(),q=mobile?.55:1,R=n=>Math.max(4,Math.round(n*q));
 const back=lin(0x4d4f3b,1.15),flank=lin(0x67654a,1.15),belly=lin(0xc8b884,1.1),throat=lin(0xd8c266,1.1),mouth=lin(0xd6c39a),tongue=lin(0xb98a72),tooth=lin(0xf0eadb),eyeC=lin(0x9a9440),pupil=lin(0x111108);
 // The loft's sections: [x, centre y, half width, top, bottom].
 const KEYS=[[-1.95,.08,0,0,0],[-1.9,.085,.02,.03,.03],[-1.5,.1,.05,.075,.06],[-1.0,.13,.09,.11,.09],[-.62,.16,.17,.135,.13],[-.35,.18,.36,.16,.16],[0,.19,.45,.17,.17],[.3,.19,.41,.165,.17],[.48,.2,.27,.14,.15],[.6,.21,.21,.11,.11],[.7,.21,.175,.085,.04],[.86,.2,.145,.065,.03],[1.0,.19,.125,.048,.022],[1.11,.186,.1,.036,.015],[1.15,.185,.06,.022,.01],[1.17,.185,0,0,0]];
 const section=x=>{let k=0;while(k<KEYS.length-2&&KEYS[k+1][0]<x)k++;const a=KEYS[k],b=KEYS[k+1],u=smooth(0,1,(x-a[0])/(b[0]-a[0]))*.5+clamp((x-a[0])/(b[0]-a[0]),0,1)*.5;return a.map((v,i)=>lerp(v,b[i],u));};
 const X=a=>lerp(-1.95,1.17,a),loft=(a,b)=>{const x=X(a),[,cy,hw,top,bot]=section(x),ph=TAU*b,c=Math.cos(ph),s=Math.sin(ph),ey=x>.64?(c<0?.25:.8):x<-.6?.95:.75,ez=x<-.6?.9:.55;
  return [x,cy+(c>0?top:bot)*Math.sign(c)*Math.abs(c)**ey,hw*Math.sign(s)*Math.abs(s)**ez];};
 const hideAt=(p,up)=>{const x=p[0],m=.82+.36*fbm(x*5+1.3,p[2]*5+p[1]*3);let c=up>.25?mix3(flank,back,smooth(.25,.75,up)):mix3(belly,flank,smooth(-.55,.05,up));
  if(x<-.55&&up>-.2)c=mul(c,1-.38*smooth(.25,.8,.5+.5*Math.sin((x+.1)*TAU/.22)));if(x>.42&&up<-.3)c=mix3(c,throat,smooth(-.3,-.7,up));return mul(c,m);};
 G.surface(loft,R(46),R(20),(p,a,b)=>{const up=Math.cos(TAU*b);return p[0]>.66&&up<-.55?mix3(mouth,tongue,.2+.3*fbm(p[0]*20,p[2]*20)):hideAt(p,up);},{part:0,uv:(p,a,b)=>[p[0]/.3,b*4]});
 const at=(x,ph)=>loft((x+1.95)/3.12,ph/TAU),normalAt=(x,ph)=>unit(cross(sub(at(x,ph+.01),at(x,ph-.01)),sub(at(x+.01,ph),at(x-.01,ph))));
 // The lower jaw, hinged behind the eyes: the pale floor of the mouth on top, the yellow throat below.
 const HINGE=[.62,.165,0],jaw=(a,b)=>{const x=lerp(.6,1.14,a),u=(x-.6)/.54,hw=(.135-.045*u)*Math.min(1,Math.sin(Math.PI*a)**.35)*(u>.9?Math.sqrt(Math.max(0,(1-u)/.1)):1),dep=.072-.04*u,ph=TAU*b,c=Math.cos(ph),s=Math.sin(ph);
  return [x,.165+(c>0?.006:dep)*Math.sign(c)*Math.abs(c)**(c>0?.3:.8),hw*Math.sign(s)*Math.abs(s)**.5];};
 G.surface(jaw,R(16),R(14),(p,a,b)=>{const up=Math.cos(TAU*b);return up>.72?mix3(mouth,tongue,smooth(.86,.99,up)*.7):up>.2?mul(flank,.9):mix3(throat,flank,smooth(-.1,.2,up));},{part:1,pivot:HINGE,uv:(p,a,b)=>[p[0]/.3,b*4]});
 // Teeth: down from the upper jaw's edge, up from the lower jaw's, staggered.
 const nTeeth=mobile?8:13;
 for(const side of [-1,1])for(let k=0;k<nTeeth;k++){
  const xu=.7+k*(.41/(nTeeth-1)),[,cy,hw,,bot]=section(xu);G.spike([xu,cy-bot*.6,side*(hw-.014)],[0,-1,0],[1,0,0],.024+.008*Math.sin(k*1.7),.016,.012,tooth);
  if(k<nTeeth-1){const xl=xu+.016,u=(xl-.6)/.54;G.spike([xl,.168,side*((.135-.045*u)-.016)],[0,1,0],[1,0,0],.018+.006*Math.cos(k*2.1),.014,.011,tooth,{part:1,pivot:HINGE});}
 }
 // Eyes on raised sockets behind the snout (yellow-olive with the dark slit), the nostril bump on the tip.
 for(const side of [-1,1]){
  G.ellipsoid([.735,.285,.075*side],[.05,.032,.038],R(5),R(8),p=>hideAt(p,1),{part:0});
  const ec=[.75,.305,.083*side];G.ellipsoid(ec,[.022,.018,.019],R(5),R(8),p=>Math.abs(p[0]-ec[0])<.006?pupil:eyeC,{part:2,pivot:[ec[0],.298,ec[2]]});
  G.ellipsoid([1.115,.226,.014*side],[.009,.006,.008],3,5,pupil,{part:0});
 }
 G.ellipsoid([1.1,.207,0],[.04,.022,.042],R(4),R(8),p=>hideAt(p,1),{part:0});
 // Osteoderms: keeled scutes in six rows down the back, the big nuchal pairs, the tail's double crest that joins.
 for(let x=-.55;x<.46;x+=.088)for(const ph of [.17,.43,.7])for(const side of [-1,1]){const a=side*ph,p=at(x,a),n=normalAt(x,a);G.spike(sub(p,mul(n,.004)),n,[1,0,0],.022+.012*(1-ph)+.006*noise(x*13,ph*7),.06,.045,p=>mul(back,.78+.25*noise(p[0]*30,p[2]*30)));}
 for(const [x,ph,h] of [[.53,.3,.045],[.6,.28,.04]])for(const side of [-1,1]){const p=at(x,side*ph),n=normalAt(x,side*ph);G.spike(p,n,[1,0,0],h,.06,.05,mul(back,.8));}
 for(let x=-.64;x>-1.9;x-=.075){const t=(-.64-x)/1.26,h=.05*(1-t*.6);if(x>-1.25)for(const side of [-1,1]){const p=at(x,side*.32),n=unit([0,1,side*.25]);G.spike(p,n,[1,0,0],h,.065,.016,mul(back,.75));}else G.spike(at(x,0),[0,1,0],[1,0,0],h*.9,.065,.016,mul(back,.75));}
 // Legs splayed out (fat upper limbs, elbows up), broad feet with spread toes.
 for(const side of [-1,1])for(const [sh,el,ft,r0,r1,toes] of [[[.38,.15,.28],[.43,.15,.5],[.48,.04,.56],.07,.05,5],[[-.36,.15,.32],[-.32,.15,.56],[-.24,.04,.63],.085,.055,4]]){
  const S=v=>[v[0],v[1],v[2]*side],legCol=p=>mul(mix3(hideAt(p,.15),belly,.3),1.25);
  G.tube(S(sh),S(el),r0,r0*.85,R(8),legCol,{part:3});G.ellipsoid(S(el),[r0*.9,r0*.9,r0*.9],R(5),R(7),legCol,{part:3});G.tube(S(el),S(ft),r0*.8,r1,R(8),legCol,{part:3});
  const fc=S([ft[0]+.04,.018,ft[2]+.02]);G.ellipsoid(fc,[.07,.02,.055],R(4),R(7),legCol,{part:3});
  for(let k=0;k<toes;k++){const a=(k/(toes-1)-.5)*1.5+(side>0?.25:-.25),d=[Math.cos(a),0,Math.sin(a)*side];G.ellipsoid(add(fc,mul(d,.075)),[.045,.011,.013],3,5,legCol,{part:3},v=>[v[0]*d[0]-v[2]*d[2],v[1],v[0]*d[2]+v[2]*d[0]]);}
 }
 return G;
}

// ---------- The module
export const hasPampulhaFauna=data=>!!data.scenery?.fauna?.spots?.length;
// For the browser checks (scripts/verificar_fauna_pampulha.py): the live instance, to force a spot and read the family.
export const pampulhaFauna={current:null};
export function createPampulhaFauna(data,options={}){
 try{return build(data,options);}catch(e){console.warn('Fauna da Pampulha não montada:',e);const root=new THREE.Group();root.name='Fauna_Pampulha';return {root,obstacles:[],clearings:[],stats:{error:String(e)},update(){}};}
}
function build(data,{ground,mobile=false,cars,walker}={}){
 const root=new THREE.Group();root.name='Fauna_Pampulha';
 const fauna=data.scenery.fauna,spots=fauna.spots,level=fauna.lake_level??data.meta.sea_level_m??0,L=data.meta.reconstructed_xy_m,A=data.samples;
 const G=(x,y)=>{const g=ground?.(x,y);if(g!=null&&Number.isFinite(g))return g;return gridHeight(data.terrain,x,y)??level;};
 const lap=lapSpace(data),stats={mobile,spots:spots.length,lakeLevel:level};
 const station=s=>{s=((s%L)+L)%L;let lo=0,hi=A.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(A[m][0]<=s)lo=m;else hi=m-1;}return A[lo];};

 // ---------- Habitat of each spot: 1 m cells in the spot's frame (u toward the water, v to its left), from the
 // walls' back to 9 m out into the lake, 13 m along the bank each way; every cell 2.5 m clear of the walls' backs.
 const habitats=spots.map((q,index)=>{
  const c=Math.cos(q.heading),s=Math.sin(q.heading),U0=-Math.round(Math.min(q.room,34)),U1=9,V=13,nu=U1-U0+1,nv=2*V+1,N=nu*nv,g=new Float32Array(N),kind=new Uint8Array(N);
  const at=(u,v)=>[q.x+u*c-v*s,q.y+u*s+v*c],pos=k=>at(U0+Math.floor(k/nv),k%nv-V);
  for(let k=0;k<N;k++){const [x,y]=pos(k);g[k]=G(x,y);}
  for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){const k=i*nv+j,[x,y]=pos(k);if(!lap.free(x,y,2.5))continue;
   const i0=Math.max(0,i-1),i1=Math.min(nu-1,i+1),j0=Math.max(0,j-1),j1=Math.min(nv-1,j+1),slope=Math.hypot((g[i1*nv+j]-g[i0*nv+j])/(i1-i0),(g[i*nv+j1]-g[i*nv+j0])/(j1-j0));
   kind[k]=g[k]<level-.45?SWIM:g[k]<level-.06?WADE:g[k]>level+.12&&slope<.42?GRASS:BANK;}
  const cell=(x,y)=>{const dx=x-q.x,dy=y-q.y,i=Math.round(dx*c+dy*s)-U0,j=Math.round(-dx*s+dy*c)+V;return i<0||j<0||i>=nu||j>=nv?-1:i*nv+j;};
  return {index,q,c,s,U0,nu,nv,g,kind,at,pos,cell,seen:null,count:[0,0,0,0,0].map((_,t)=>kind.reduce((n,v)=>n+(v===t),0))};
 });
 // What the lap sees of a spot's dry cells: rays from a car in the lane by the lake 70, 45 and 22 m before the spot and
 // 4 m past it, from the driver's eye (1.15 m) and from the chase camera (camera-rig.js: 5.9 m behind, 1.9 m up), to
 // 0.25 m over each cell (most of a capybara, a caiman's back): clear of the Jersey walls by 8 cm (their top 0.81 m;
 // the catch fence above is see-through) and of the ground between. A family close behind the wall is seen only when
 // passing it; a little farther off it shows over the wall on the way in.
 function clearRay(E,T){
  const dx=T[0]-E[0],dy=T[1]-E[1],dz=T[2]-E[2],D=Math.hypot(dx,dy),n=Math.ceil(D/1.1);
  for(let k=1;k<n;k++){const f=k/n,x=E[0]+dx*f,y=E[1]+dy*f,z=E[2]+dz*f;
   if(f*D<26){let on=false;for(const h of lap.at(x,y)){const a=Math.abs(h.lat);if(a<h.back+.1){on=true;if(a>h.back-1.1&&z<h.road+.94)return false;}}if(on)continue;}
   if(z<G(x,y)+.06)return false;}
  return true;
 }
 function sight(h){
  if(h.seen)return h.seen;const q=h.q,eyes=h.eyes=[];
  const eye=(s,z)=>{const p=station(s),nl=Math.hypot(p[9],p[10])||1,n=[p[9]/nl,p[10]/nl],side=Math.sign((q.x-p[1])*n[0]+(q.y-p[2])*n[1])||1,lane=side*(p[4]/2-2.6);return [p[1]+n[0]*lane,p[2]+n[1]*lane,p[3]+z];};
  for(const ds of [-70,-45,-22,4])eyes.push(eye(q.s+ds,1.15),eye(q.s+ds-5.9,1.95));
  const seen=h.seen=new Float32Array(h.kind.length);
  for(let k=0;k<seen.length;k++){if(h.kind[k]!==GRASS&&h.kind[k]!==BANK)continue;const [x,y]=h.pos(k),T=[x,y,h.g[k]+.25];let n=0;for(const E of eyes)if(clearRay(E,T))n++;seen[k]=n/eyes.length;}
  return seen;
 }

 // ---------- Meshes
 const capyGeo=capybaraGeometry(mobile).geometry(),MAXC=mobile?6:8;
 const aPose=new THREE.InstancedBufferAttribute(new Float32Array(MAXC*4),4),aLegs=new THREE.InstancedBufferAttribute(new Float32Array(MAXC*4),4),aLook=new THREE.InstancedBufferAttribute(new Float32Array(MAXC*4),4);
 for(const a of [aPose,aLegs,aLook])a.setUsage(THREE.DynamicDrawUsage);capyGeo.setAttribute('aPose',aPose);capyGeo.setAttribute('aLegs',aLegs);capyGeo.setAttribute('aLook',aLook);
 const fur=furTexture(),hide=hideTexture();
 const capyMaterial=posed(new THREE.MeshStandardMaterial({name:'Capivara_pelo',map:fur,vertexColors:true,roughness:.93,metalness:0,envMapIntensity:.6}),CAPY_GLSL,'fauna-capy-v1');
 const capyMesh=new THREE.InstancedMesh(capyGeo,capyMaterial,MAXC);capyMesh.name='Capivaras';capyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);capyMesh.count=0;
 capyMesh.castShadow=!mobile;capyMesh.receiveShadow=true;capyMesh.customDepthMaterial=posed(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}),CAPY_GLSL,'fauna-capy-v1');
 capyMesh.setColorAt(0,new THREE.Color(1,1,1));root.add(capyMesh);
 const U={uJaw:{value:.55},uHeadPitch:{value:.3},uHeadYaw:{value:0},uBlink:{value:0},uTail:{value:0},uBreath:{value:0}};
 const caimanGeo=caimanGeometry(mobile).geometry();
 const caimanMaterial=posed(new THREE.MeshStandardMaterial({name:'Jacare_couro',map:hide,vertexColors:true,roughness:.58,metalness:0,envMapIntensity:.8}),GATOR_GLSL,'fauna-gator-v1',U);
 const caimanMesh=new THREE.Mesh(caimanGeo,caimanMaterial);caimanMesh.name='Jacare_gordo';caimanMesh.matrixAutoUpdate=false;caimanMesh.castShadow=!mobile;caimanMesh.receiveShadow=true;caimanMesh.visible=false;
 caimanMesh.customDepthMaterial=posed(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}),GATOR_GLSL,'fauna-gator-v1',U);root.add(caimanMesh);
 // Contact shadows and ripples: two quads per capybara, two for the caiman. Premultiplied: the shadow darkens
 // (alpha), the ripple adds light (colour); the frame's alpha (the AO mask) is left alone.
 const FXN=MAXC*2+2,fxGeo=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),aFx=new THREE.InstancedBufferAttribute(new Float32Array(FXN*3),3);aFx.setUsage(THREE.DynamicDrawUsage);fxGeo.setAttribute('aFx',aFx);
 const fxU={map:{value:fxTexture()},uNight:{value:0}};
 const fxMaterial=new THREE.ShaderMaterial({name:'Fauna_sombras_ondas',uniforms:fxU,transparent:true,depthWrite:false,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
  vertexShader:`attribute vec3 aFx;varying vec2 vUv;varying vec2 vFx;void main(){vUv=vec2(uv.x*.5+aFx.z,uv.y);vFx=aFx.xy;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform sampler2D map;uniform float uNight;varying vec2 vUv;varying vec2 vFx;void main(){vec4 t=texture2D(map,vUv);gl_FragColor=vec4(vec3(.62,.66,.64)*t.r*vFx.y*(1.-.85*uNight),t.g*vFx.x*(1.-.5*uNight));}`});
 const fxMesh=new THREE.InstancedMesh(fxGeo,fxMaterial,FXN);fxMesh.name='Fauna_sombras_ondas';fxMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);fxMesh.count=0;fxMesh.renderOrder=1;root.add(fxMesh);
 const tris=g=>g.index.count/3;
 Object.assign(stats,{drawCalls:3,trianglesCapybara:tris(capyGeo),trianglesCaiman:tris(caimanGeo),maxCapybaras:MAXC,
  trianglesMax:tris(capyGeo)*MAXC+tris(caimanGeo)+FXN*2,habitat:habitats.map(h=>({spot:h.index,grass:h.count[GRASS],bank:h.count[BANK],wade:h.count[WADE],swim:h.count[SWIM]}))});

 // ---------- Driving space: every habitat cell (where an animal can ever stand) and every placed body.
 const drive={checked:0,violations:0,worst:null};
 const checkPoint=(x,y,z,what)=>{drive.checked++;for(const h of lap.at(x,y)){const over=z-h.road;if(Math.abs(h.lat)<h.back+.3&&over<4.6){drive.violations++;if(!drive.worst||Math.abs(h.lat)<Math.abs(drive.worst.lat))drive.worst={what,s:+h.s.toFixed(1),lat:+h.lat.toFixed(2)};}}};
 for(const h of habitats)for(let k=0;k<h.kind.length;k++)if(h.kind[k]){const [x,y]=h.pos(k);checkPoint(x,y,h.g[k],'habitat '+h.index);}
 stats.driveSpace=drive;

 // ---------- Clearings: the trees go from round every spot and from the sight lines from the lap to it.
 const clearings=[];
 for(const q of spots){
  const c=Math.cos(q.heading),s=Math.sin(q.heading);clearings.push({x:q.x,y:q.y,r:12},{x:q.x-8*c,y:q.y-8*s,r:10});for(const v of [-12,12])clearings.push({x:q.x-v*s-3*c,y:q.y+v*c-3*s,r:8});
  for(const ds of [-60,-30,0]){const p=station(q.s+ds),dx=q.x-p[1],dy=q.y-p[2],d=Math.hypot(dx,dy);for(let t=p[4]/2+3;t<d-14;t+=5)clearings.push({x:p[1]+dx/d*t,y:p[2]+dy/d*t,r:4});}
 }
 stats.clearings=clearings.length;

 // ---------- The family of this race
 const animals=[];let footTest=null,family=null,caiman=null,capyHab=null,caimanHab=null,fresh=true,clock=0,slow=0;
 const nearest=(h,from,kinds,maxD,taken,sep,rand)=>{let best=-1,bd=1e9;for(let k=0;k<h.kind.length;k++){if(!kinds.includes(h.kind[k]))continue;const [x,y]=h.pos(k),d=Math.hypot(x-from[0],y-from[1]);if(d>maxD||taken.some(t=>Math.hypot(t[0]-x,t[1]-y)<sep))continue;const sc=d+rand()*1.5;if(sc<bd){bd=sc;best=k;}}return best<0?null:h.pos(best);};
 function settle(h,rand){
  const seen=sight(h),q=h.q;
  // The family's centre: within 16 m of the spot, the lawn the lap sees best, with seen lawn round it, and near the lap
  // (a capybara 45 m off is a speck; the bank is 20 to 37 m deep).
  let best=-1,score=-1e9;for(let k=0;k<h.kind.length;k++){if(h.kind[k]!==GRASS)continue;const [x,y]=h.pos(k),d=Math.hypot(x-q.x,y-q.y);if(d>16)continue;
   let nb=0;for(let du=-2;du<=2;du++)for(let dv=-2;dv<=2;dv++){const n=h.cell(x+du,y+dv);if(n>=0&&h.kind[n]===GRASS&&seen[n]>=.5)nb++;}
   const eye=Math.min(...h.eyes.map(e=>Math.hypot(e[0]-x,e[1]-y))),sc=seen[k]*5+nb*.12-eye/14+rand()*.4;if(sc>score){score=sc;best=k;}}
  const C=best<0?[q.x,q.y]:h.pos(best),taken=[],adults=(mobile?3:3)+Math.floor(rand()*(mobile?2:3)),pups=Math.min(MAXC-adults,2+Math.floor(rand()*2)),list=[];
  const place=(kinds,maxD,sep)=>{const p=nearest(h,C,kinds,maxD,taken,sep,rand);if(p){const j=[p[0]+(rand()-.5)*.6,p[1]+(rand()-.5)*.6];taken.push(j);return j;}return null;};
  const toWater=(()=>{let sx=0,sy=0,n=0;for(let k=0;k<h.kind.length;k++)if(h.kind[k]===SWIM){const [x,y]=h.pos(k);if(Math.hypot(x-C[0],y-C[1])<12){sx+=x;sy+=y;n++;}}return n?Math.atan2(sy/n-C[1],sx/n-C[0]):q.heading;})();
  const make=(o)=>({x:o.at[0],y:o.at[1],home:o.at.slice(),yaw:o.yaw??rand()*TAU,s:o.baby?.44+rand()*.12:.9+rand()*.18,baby:!!o.baby,male:!o.baby&&rand()<.4?1:0,role:o.role,leader:o.leader??null,
   mode:o.role==='swim'?'swim':o.role==='lie'?'lie':o.role==='follow'?'follow':'graze',timer:2+rand()*8,step:1+rand()*3,tx:o.at[0],ty:o.at[1],speed:0,ph:rand()*TAU,seed:rand()*100,
   pitch:-.5,hyaw:0,neck:.5,lie:o.role==='lie'?1:0,legPh:rand()*TAU,legAmp:0,ear:[0,0],earT:[rand()*3,rand()*3],alert:0,roll:0,off:[-(.75+rand()*.45),(rand()<.5?-1:1)*(.3+rand()*.3)],
   tone:(()=>{const k=.86+rand()*.26,red=(rand()-.5)*.18;return [k*(1+red),k,k*(1-red*1.3)];})(),rate:.8+rand()*.4,y3:0,pitchBody:0,rollBody:0});
  // The mother grazes with her pups; another adult lies down near the water; one or two swim; the rest graze.
  const mother=make({at:place([GRASS],5,1.4)??C,role:'graze',yaw:toWater+(rand()-.5)*2});list.push(mother);
  for(let i=1;i<adults;i++){
   const lying=i===1&&rand()<.85,swim=!lying&&list.filter(a=>a.role==='swim').length<(adults>3?2:1)&&rand()<.75;
   const at=swim?place([SWIM],16,1.6):lying?place([GRASS],5,1.6):place([GRASS],5.5,1.4);
   if(at)list.push(make({at,role:swim?'swim':lying?'lie':'graze',yaw:swim?toWater+Math.PI/2*(rand()<.5?1:-1):toWater+(rand()-.5)*2.4}));
   else{const p=place([GRASS,BANK],7,1.3);if(p)list.push(make({at:p,role:'graze'}));}
  }
  const swimmer=list.find(a=>a.role==='swim');
  for(let i=0;i<pups;i++){const lead=swimmer&&i===pups-1&&rand()<.4?swimmer:mother,p=lead===mother?place([GRASS,BANK],6,.8):place([SWIM,WADE],16,1);if(!p)continue;const pup=make({at:p,baby:true,role:'follow',leader:lead,yaw:lead.yaw});list.push(pup);}
  for(const a of list)a.leader=a.leader&&list.includes(a.leader)?a.leader:a.role==='follow'?mother:null;
  return {centre:C,seenCentre:best<0?0:+seen[best].toFixed(2),eye:Math.round(Math.min(...h.eyes.map(e=>Math.hypot(e[0]-C[0],e[1]-C[1])))),list,toWater};
 }
 // The caiman: on the waterline cell (at most 0.6 m over the lake) the lap sees best and least steep within 14 m of
 // its spot, its tail in the water, its head up the bank.
 function bask(h,rand){
  const seen=sight(h),q=h.q;let best=-1,score=-1e9;
  for(let k=0;k<h.kind.length;k++){const t=h.kind[k];if(t!==GRASS&&t!==BANK||h.g[k]<level+.02||h.g[k]>level+.6)continue;const [x,y]=h.pos(k),d=Math.hypot(x-q.x,y-q.y);if(d>14)continue;
   let wet=false;for(let du=-2;du<=2&&!wet;du++)for(let dv=-2;dv<=2&&!wet;dv++){const n=h.cell(x+du,y+dv);if(n>=0&&h.kind[n]>=WADE)wet=true;}if(!wet)continue;
   const gx=G(x+.7,y)-G(x-.7,y),gy=G(x,y+.7)-G(x,y-.7),slope=Math.hypot(gx,gy)/1.4,sc=seen[k]*3-slope*4-d/8+rand()*.4;if(sc>score){score=sc;best=k;}}
  const P=best<0?[q.x,q.y]:h.pos(best);let sx=0,sy=0,n=0;
  for(let k=0;k<h.kind.length;k++)if(h.kind[k]>=WADE){const [x,y]=h.pos(k);if(Math.hypot(x-P[0],y-P[1])<4.5){sx+=x;sy+=y;n++;}}
  const toWater=n?Math.atan2(sy/n-P[1],sx/n-P[0]):q.heading,yaw=toWater+Math.PI+(rand()-.5)*.6,f=[Math.cos(yaw),Math.sin(yaw)];
  return {x:P[0]+f[0]*.35,y:P[1]+f[1]*.35,yaw,s:.95+rand()*.13,seen:best<0?0:+seen[best].toFixed(2),back:0,retreat:0,jaw:.55,pitchHead:.3,jawT:8+rand()*14,jawPhase:'open',blinkT:2+rand()*5,blink:0,tail:(rand()-.5)*.6,tailTo:0,tailT:6+rand()*10,yawHead:0,yawHeadTo:0,headT:10+rand()*15,seed:rand()*100};
 }
 function apply(choice){
  const rand=random((Math.random()*2**31)>>>0);
  capyHab=choice.capy>=0?habitats[choice.capy]:null;caimanHab=choice.caiman>=0?habitats[choice.caiman]:null;
  family=capyHab?settle(capyHab,rand):null;animals.length=0;if(family)animals.push(...family.list.slice(0,MAXC));
  caiman=caimanHab?bask(caimanHab,rand):null;
  capyMesh.count=animals.length;animals.forEach((a,i)=>capyMesh.setColorAt(i,new THREE.Color(...a.tone)));if(capyMesh.instanceColor)capyMesh.instanceColor.needsUpdate=true;
  if(family)capyMesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(family.centre[0],capyHab.q.z,-family.centre[1]),26);
  caimanMesh.visible=!!caiman;fxMesh.count=animals.length*2+(caiman?2:0);
  fxMesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(...(family?[family.centre[0],capyHab.q.z,-family.centre[1]]:[0,0,0])),30);fxMesh.frustumCulled=!caiman;
  // Every body's reach on the ground against the driving space.
  for(const a of animals)for(const [du,dv] of [[.75,0],[-.6,0],[0,.35],[0,-.35]]){const c=Math.cos(a.yaw),s=Math.sin(a.yaw),x=a.x+(du*c-dv*s)*a.s,y=a.y+(du*s+dv*c)*a.s;checkPoint(x,y,G(x,y),'capivara');}
  if(caiman)for(const [du,dv] of [[1.2,0],[-1.95,0],[0,.68],[0,-.68],[.5,.6],[.5,-.6]]){const c=Math.cos(caiman.yaw),s=Math.sin(caiman.yaw),x=caiman.x+(du*c-dv*s)*caiman.s,y=caiman.y+(du*s+dv*c)*caiman.s;checkPoint(x,y,G(x,y),'jacaré');}
  stats.races=(stats.races??0)+1;
  stats.current={spot:choice.capy,s:capyHab?.q.s??null,caiman:choice.caiman,caimanS:caimanHab?.q.s??null,capybaras:animals.length,pups:animals.filter(a=>a.baby).length,
   roles:animals.map(a=>a.baby?'filhote':a.role),centre:family?.centre.map(v=>+v.toFixed(1))??null,centreZ:family?+G(...family.centre).toFixed(2):null,seen:family?.seenCentre??null,eye:family?.eye??null,
   caimanAt:caiman?[+caiman.x.toFixed(1),+caiman.y.toFixed(1),+G(caiman.x,caiman.y).toFixed(2)]:null,caimanYaw:caiman?+caiman.yaw.toFixed(3):null,caimanSeen:caiman?.seen??null};
  stats.history=[...(stats.history??[]),{spot:choice.capy,caiman:choice.caiman}].slice(-12);
  clock=0;animate(0,null,true);
 }
 const shown=i=>{const h=habitats[i];return h.waterline??=bask(h,random(i+1)).seen;},choose=()=>apply(draw(spots,L,shown));

 // ---------- Life
 const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),E=new THREE.Euler(0,0,0,'YZX'),P=new THREE.Vector3(),S=new THREE.Vector3(),W=new THREE.Vector3(),cam=new THREE.Vector3();
 const habOf=(x,y)=>{if(!capyHab)return BLOCKED;const k=capyHab.cell(x,y);return k<0?BLOCKED:capyHab.kind[k];};
 const pickNear=(a,kinds,r,rand=Math.random)=>{for(let n=0;n<14;n++){const ang=rand()*TAU,d=r*(.3+.7*rand()),x=a.home[0]+Math.cos(ang)*d,y=a.home[1]+Math.sin(ang)*d;if(kinds.includes(habOf(x,y)))return [x,y];}return null;};
 function threats(){
  const out={car:null,foot:null};let best=1e9;
  for(const o of cars?.()??[]){if(!o)continue;let shown=true;for(let p=o;p;p=p.parent)if(!p.visible){shown=false;break;}if(!shown)continue;W.setFromMatrixPosition(o.matrixWorld);
   const x=W.x,y=-W.z,d=family?Math.hypot(x-family.centre[0],y-family.centre[1]):1e9;if(d<best){best=d;out.car={x,y,d};}}
  const hero=walker?.();if(hero){W.setFromMatrixPosition(hero.matrixWorld);out.foot={x:W.x,y:-W.z};}else if(footTest)out.foot={x:footTest[0],y:footTest[1]};
  return out;
 }
 function stepCapy(a,i,dt,t,th){
  a.timer-=dt;const r=Math.random;
  // Someone on foot close by: off they go, into the water when it is near.
  if(th.foot&&a.mode!=='flee'){const d=Math.hypot(a.x-th.foot.x,a.y-th.foot.y);if(d<6.5&&(a.mode!=='swim'||d<3)){
   const away=Math.atan2(a.y-th.foot.y,a.x-th.foot.x);let target=null;
   for(const dd of [0,.5,-.5,1,-1,1.5,-1.5])for(const dist of [6,4.5,3]){const x=a.x+Math.cos(away+dd)*dist,y=a.y+Math.sin(away+dd)*dist,k=habOf(x,y);if(k!==BLOCKED&&!target)target=[x,y,k];}
   if(target){a.mode='flee';a.tx=target[0];a.ty=target[1];a.speed=a.baby?1.7:1.45;a.timer=8;a.alert=1;if(a.role==='lie'){a.role='graze';}}}}
  let hp=-1,hy=0,nd=1,lie=0;const moving=['walk','flee','follow','swim'].includes(a.mode);
  if(a.mode==='graze'){hp=-.95+.07*Math.sin(t*.7*a.rate+a.ph);hy=.22*Math.sin(t*.31*a.rate+a.ph);nd=1;a.step-=dt;
   if(a.step<0&&a.alert<.5){a.step=2.5+r()*3.5;const x=a.x+Math.cos(a.yaw+(r()-.5)*.8)*(.3+r()*.5),y=a.y+Math.sin(a.yaw+(r()-.5)*.8)*(.3+r()*.5);if(habOf(x,y)===GRASS||habOf(x,y)===BANK){a.mode='walk';a.tx=x;a.ty=y;a.speed=.32;a.back='graze';}}
   if(a.timer<0){a.mode='look';a.timer=3+r()*6;}}
  else if(a.mode==='look'){hp=.1+.035*Math.sin(t*8.5+a.ph)+.05*Math.sin(t*.5+a.seed);hy=.55*Math.sin(t*.37*a.rate+a.seed);nd=0;a.roll=.12*Math.sin(t*.23+a.seed);
   if(a.timer<0){const u=r();if(u<.55){a.mode='graze';a.timer=6+r()*10;}else{const p=pickNear(a,[GRASS],3.2);if(p){a.mode='walk';a.tx=p[0];a.ty=p[1];a.speed=.45;a.back='graze';}else{a.mode='graze';a.timer=6+r()*8;}}}}
  else if(a.mode==='lie'){lie=1;hp=-.14+.06*Math.sin(t*.2+a.seed);nd=.55;hy=.2*Math.sin(t*.13+a.seed);}
  else if(a.mode==='walk'||a.mode==='flee'){hp=a.mode==='flee'?.05:-.12;nd=a.mode==='flee'?0:.25;}
  else if(a.mode==='swim'){hp=.2+.03*Math.sin(t*.9+a.ph);nd=0;hy=.25*Math.sin(t*.21+a.seed);if(a.timer<0&&Math.hypot(a.tx-a.x,a.ty-a.y)<.3){const p=pickNear(a,[SWIM],3.5);if(p){a.tx=p[0];a.ty=p[1];}a.speed=.2+r()*.1;a.timer=5+r()*8;}}
  else if(a.mode==='follow'){const L0=a.leader;if(L0){const c=Math.cos(L0.yaw),s=Math.sin(L0.yaw),gx=L0.x+(a.off[0]*c-a.off[1]*s)*L0.s,gy=L0.y+(a.off[0]*s+a.off[1]*c)*L0.s;if(habOf(gx,gy)!==BLOCKED){a.tx=gx;a.ty=gy;}
    const d=Math.hypot(a.tx-a.x,a.ty-a.y);a.speed=d>.35?clamp(d*1.2,.25,1.8):0;const lm=L0.mode;hp=lm==='graze'&&d<.6?-.95+.08*Math.sin(t*1.1+a.ph):lm==='swim'?.2:.08+.04*Math.sin(t*9+a.ph);nd=lm==='graze'&&d<.6?1:0;hy=.4*Math.sin(t*.6+a.seed);}}
  // Moving toward the target, turning first; never onto a blocked cell.
  let moved=0;if(moving&&a.speed>0){const dx=a.tx-a.x,dy=a.ty-a.y,d=Math.hypot(dx,dy);
   if(d>.12){const want=Math.atan2(dy,dx),turn=wrapAngle(want-a.yaw);a.yaw+=clamp(turn,-2.2*dt,2.2*dt);const go=Math.min(d,a.speed*dt)*Math.max(0,Math.cos(turn));const x=a.x+Math.cos(a.yaw)*go,y=a.y+Math.sin(a.yaw)*go;
    if(habOf(x,y)!==BLOCKED){a.x=x;a.y=y;moved=go;}else{a.tx=a.x;a.ty=a.y;}}
   else if(a.mode==='walk'||a.mode==='flee'){const k=habOf(a.x,a.y);if(k===SWIM||k===WADE&&a.mode==='flee'){a.mode='swim';a.role='swim';a.home=[a.x,a.y];a.timer=4;}else{a.mode=a.mode==='flee'?'look':a.back??'graze';a.home=a.mode==='look'?[a.x,a.y]:a.home;a.timer=a.mode==='look'?4+r()*4:5+r()*8;}}}
  // Cars: the heads come up and follow the nearest one passing.
  const near=th.car&&th.car.d<45||th.foot&&Math.hypot(a.x-th.foot.x,a.y-th.foot.y)<12;a.alert=clamp(a.alert+(near?2.2:-.35)*dt,0,1);
  if(a.alert>0){const tgt=th.foot&&Math.hypot(a.x-th.foot.x,a.y-th.foot.y)<12?th.foot:th.car;if(tgt){const rel=wrapAngle(Math.atan2(tgt.y-a.y,tgt.x-a.x)-a.yaw);
    hy=lerp(hy,clamp(rel,-1.15,1.15),a.alert);if(Math.abs(rel)>1.2&&!moving&&a.mode!=='lie')a.yaw+=clamp(rel,-.5*dt,.5*dt)*a.alert;}
   hp=lerp(hp,a.mode==='lie'?.1:.14,a.alert);nd=lerp(nd,a.mode==='lie'?.25:0,a.alert);}
  // Smoothing toward the pose; ears; legs.
  const k=1-Math.exp(-dt*(a.baby?5:3.2));a.pitch+=(hp-a.pitch)*k;a.hyaw+=(hy-a.hyaw)*k;a.neck+=(nd-a.neck)*k;a.lie+=(lie-a.lie)*(1-Math.exp(-dt*1.5));a.roll*=1-Math.min(1,dt*.5);
  for(let e=0;e<2;e++){a.earT[e]-=dt*(1+a.alert*1.5+(a.baby?.6:0));if(a.earT[e]<0){a.earT[e]=1.2+r()*5;a.ear[e]=1;}a.ear[e]=Math.max(0,a.ear[e]-dt*4.5);}
  const wet=habOf(a.x,a.y)===SWIM||habOf(a.x,a.y)===WADE&&G(a.x,a.y)<level-.5*a.s;
  if(moved>0){a.legPh+=moved/(.42*a.s)*TAU*.5;a.legAmp+=((a.speed>1?.62:.42)-a.legAmp)*Math.min(1,dt*5);}else if(a.mode==='swim'||wet){a.legPh+=dt*3.4;a.legAmp+=(.38-a.legAmp)*Math.min(1,dt*3);}else a.legAmp*=1-Math.min(1,dt*5);
  write(a,i,t);
 }
 function write(a,i,t){
  // The body on the ground (or floating with the back just out), pitched and rolled with the bank; a lying one low.
  const g=G(a.x,a.y),float=level-.52*a.s,c=Math.cos(a.yaw),s=Math.sin(a.yaw),floating=g<float;
  const gf=G(a.x+c*.42*a.s,a.y+s*.42*a.s),gb=G(a.x-c*.42*a.s,a.y-s*.42*a.s),gl=G(a.x-s*.22*a.s,a.y+c*.22*a.s),gr=G(a.x+s*.22*a.s,a.y-c*.22*a.s);
  const pitchB=floating?0:clamp(Math.atan2(Math.max(gf,float)-Math.max(gb,float),.84*a.s),-.38,.38),rollB=floating?0:clamp(Math.atan2(gl-gr,.44*a.s),-.25,.25)*.6;
  a.pitchBody+=(pitchB-a.pitchBody)*.2;a.rollBody+=(rollB-a.rollBody)*.2;
  const y=Math.max(g,float)-a.lie*.17*a.s+(floating?.012*Math.sin(t*1.3+a.ph)*a.s:0);a.y3=y;
  E.set(a.rollBody,a.yaw,a.pitchBody,'YZX');Q.setFromEuler(E);P.set(a.x,y,-a.y);S.setScalar(a.s);M.compose(P,Q,S);capyMesh.setMatrixAt(i,M);
  const breath=.012*Math.sin(t*(a.baby?2.4:1.6)+a.ph);
  aPose.setXYZW(i,a.pitch,a.hyaw,breath,a.neck);aLegs.setXYZW(i,a.legPh,a.legAmp,.6*Math.sin(Math.PI*a.ear[0]),.6*Math.sin(Math.PI*a.ear[1]));aLook.setXYZW(i,a.baby?1.3:1,a.male,a.lie,a.roll);
  // Contact shadow on land, two ripple rings round a swimmer.
  const fx=i*2;if(!floating&&g>level-.05){E.set(a.rollBody,a.yaw,a.pitchBody,'YZX');Q.setFromEuler(E);P.set(a.x,g+.045,-a.y);S.set((a.lie>.5?1.25:1.08)*a.s,1,(a.lie>.5?.78:.62)*a.s);M.compose(P,Q,S);fxMesh.setMatrixAt(fx,M);aFx.setXYZ(fx,a.baby?.42:.52,0,0);M.makeScale(0,0,0);fxMesh.setMatrixAt(fx+1,M);aFx.setXYZ(fx+1,0,0,.5);}
  else for(let r=0;r<2;r++){const f=(t*(a.speed>.1?.42:.28)+a.ph/TAU+r*.5)%1,k=(.6+1.9*f)*a.s;P.set(a.x+c*.25*a.s,level+.02,-(a.y+s*.25*a.s));Q.identity();S.set(k*1.3,1,k);E.set(0,a.yaw,0);Q.setFromEuler(E);M.compose(P,Q,S);fxMesh.setMatrixAt(fx+r,M);aFx.setXYZ(fx+r,0,.42*(1-f)*Math.min(1,f*6),.5);}
 }
 function stepCaiman(dt,t,th){
  const g=caiman,r=Math.random;
  if(th.foot&&!g.retreat&&Math.hypot(th.foot.x-g.x,th.foot.y-g.y)<5)g.retreat=1e-3;
  if(g.retreat>0&&g.retreat<1){g.retreat=Math.min(1,g.retreat+dt/5);g.jawPhase='shut';}
  // The jaw: open most of the time, now and then it shuts slowly, waits, opens again; the head lifts with it.
  g.jawT-=dt;if(g.jawPhase==='open'&&g.jawT<0){g.jawPhase='closing';}if(g.jawPhase==='closing'){g.jaw=Math.max(0,g.jaw-dt*.28);if(!g.jaw){g.jawPhase='closed';g.jawT=3+r()*5;}}
  if(g.jawPhase==='closed'&&g.jawT<0)g.jawPhase='opening';if(g.jawPhase==='opening'){g.jaw=Math.min(.55,g.jaw+dt*.18);if(g.jaw>=.55){g.jawPhase='open';g.jawT=14+r()*22;}}
  if(g.jawPhase==='shut')g.jaw=Math.max(0,g.jaw-dt*.8);
  g.pitchHead=.04+g.jaw/.55*.26;
  g.blinkT-=dt;if(g.blinkT<0){g.blink=1;g.blinkT=r()<.2?.45:3+r()*7;}g.blink=Math.max(0,g.blink-dt*3.6);
  g.tailT-=dt;if(g.tailT<0){g.tailTo=(r()-.5)*.9;g.tailT=10+r()*18;}g.tail+=(g.tailTo-g.tail)*(1-Math.exp(-dt*.35));
  g.headT-=dt;if(g.headT<0){g.yawHeadTo=(r()-.5)*.26;g.headT=16+r()*26;}g.yawHead+=(g.yawHeadTo-g.yawHead)*(1-Math.exp(-dt*.25));
  U.uJaw.value=g.jaw;U.uHeadPitch.value=g.pitchHead;U.uHeadYaw.value=g.yawHead;U.uBlink.value=Math.sin(Math.PI*g.blink);U.uTail.value=g.tail;U.uBreath.value=.02*Math.sin(t*TAU/5.5+g.seed);
  placeCaiman(t);
 }
 function placeCaiman(t){
  const g=caiman,c=Math.cos(g.yaw),s=Math.sin(g.yaw),back=g.retreat*2.6*g.s,x=g.x-c*back,y=g.y-s*back,float=level-.24*g.s;
  const gc=G(x,y),gh=G(x+c*.9*g.s,y+s*.9*g.s),gt=G(x-c*.5*g.s,y-s*.5*g.s),floating=gc<float;
  const pitch=floating?0:clamp(Math.atan2(gh-Math.max(gt,float-.1),1.4*g.s),-.42,.42),h=Math.max(gc-.015,float)+(floating?.01*Math.sin(t*.8):0);
  E.set(0,g.yaw,pitch,'YZX');Q.setFromEuler(E);P.set(x,h,-y);S.setScalar(g.s);caimanMesh.matrix.compose(P,Q,S);caimanMesh.matrixWorldNeedsUpdate=true;
  // Its shadow on the bank; a slow ring where the tail meets the water.
  const fx=animals.length*2;if(!floating){P.set(x,gc+.04,-y);S.set(2.3*g.s,1,1.15*g.s);M.compose(P,Q,S);fxMesh.setMatrixAt(fx,M);aFx.setXYZ(fx,.55,0,0);}else{M.makeScale(0,0,0);fxMesh.setMatrixAt(fx,M);}
  const tx=x-c*1.25*g.s,ty=y-s*1.25*g.s,f=(t*.16+g.seed)%1,k=(.8+2.2*f)*g.s;Q.identity();P.set(tx,level+.02,-ty);S.set(k*1.4,1,k);M.compose(P,Q,S);fxMesh.setMatrixAt(fx+1,M);aFx.setXYZ(fx+1,0,G(tx,ty)<level?.32*(1-f)*Math.min(1,f*5):0,.5);
 }
 function animate(dt,camera,force=false){
  clock+=dt;const t=clock;if(camera)cam.setFromMatrixPosition(camera.matrixWorld);
  const dist=(x,y,z)=>camera?Math.hypot(cam.x-x,cam.y-z,-cam.z-y):0;
  const dC=family?dist(family.centre[0],family.centre[1],capyHab.q.z):1e9,dG=caiman?dist(caiman.x,caiman.y,caimanHab.q.z):1e9;
  capyMesh.visible=!!family&&dC<FAR;caimanMesh.visible=!!caiman&&dG<FAR;fxMesh.visible=Math.min(dC,dG)<FAR*.6;
  stats.cameraDistance={capybaras:family?Math.round(dC):null,caiman:caiman?Math.round(dG):null};
  // Far off: a few updates a second; beyond FAR nothing.
  if(!force&&Math.min(dC,dG)>=FAR)return;slow+=dt;const lively=force||Math.min(dC,dG)<NEAR,tick=lively||slow>.25;if(!tick)return;const step=lively?dt:slow;slow=0;
  const th=force?{car:null,foot:null}:threats();stats.alert=th.car?Math.round(th.car.d):null;
  if(family&&(force||dC<FAR)){animals.forEach((a,i)=>force?write(a,i,t):stepCapy(a,i,Math.min(step,.1),t,th));capyMesh.instanceMatrix.needsUpdate=true;aPose.needsUpdate=aLegs.needsUpdate=aLook.needsUpdate=true;}
  if(caiman&&(force||dG<FAR))force?placeCaiman(t):stepCaiman(Math.min(step,.1),t,th);
  fxMesh.instanceMatrix.needsUpdate=true;aFx.needsUpdate=true;
 }
 // After dark they are only dim (no lights of their own); the ripples catch less light.
 function setNight(k){fxU.uNight.value=k;stats.night=k;}
 choose();
 const extra={root,obstacles:[],clearings,stats,setNight,
  // A new race (main.js beginRace: a race, a restart, a championship round): a new bank, never the last one. The
  // first call after the circuit is built keeps the choice made with it.
  newRace(){if(fresh){fresh=false;return;}choose();},
  update(dt,camera){animate(dt,camera);}};
 // For the checks: force a choice, read where they are (track coordinates), survey every spot's sight.
 pampulhaFauna.current={...extra,ground:G,options:{ground,mobile,cars,walker},foot(p){footTest=p;},waterline:shown,force(capy,cai=-1){fresh=false;apply({capy,caiman:cai});return stats.current;},
  animals:()=>animals.map(a=>({x:+a.x.toFixed(2),y:+a.y.toFixed(2),z:+a.y3.toFixed(2),yaw:+a.yaw.toFixed(2),s:+a.s.toFixed(2),mode:a.mode,baby:a.baby,alert:+a.alert.toFixed(2)})),
  caiman:()=>caiman&&{x:+(caiman.x-Math.cos(caiman.yaw)*caiman.retreat*2.6*caiman.s).toFixed(2),y:+(caiman.y-Math.sin(caiman.yaw)*caiman.retreat*2.6*caiman.s).toFixed(2),z:+G(caiman.x,caiman.y).toFixed(2),yaw:+caiman.yaw.toFixed(3),jaw:+caiman.jaw.toFixed(2),retreat:+caiman.retreat.toFixed(2)},
  survey:()=>habitats.map(h=>{const seen=sight(h);let best=0,n=0;for(let k=0;k<seen.length;k++)if(h.kind[k]===GRASS){best=Math.max(best,seen[k]);if(seen[k]>=.5)n++;}return {spot:h.index,s:h.q.s,bestSeen:+best.toFixed(2),grassSeen:n};})};
 return extra;
}
