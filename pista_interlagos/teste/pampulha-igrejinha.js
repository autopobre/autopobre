import * as THREE from 'three';
import {canvasTexture} from './pit-textures.js';
import {guardrailClearance,guardrailPresent} from './physics.js';
import {lightUniforms,nightLights,screenHalf} from './sea-water.js';

// The Igreja de São Francisco de Assis, the Igrejinha da Pampulha (Oscar Niemeyer, 1943; structure Joaquim Cardozo;
// Portinari's azulejos, Paulo Werneck's mosaics, Burle Marx's gardens; UNESCO, Pampulha Modern Ensemble), on the tip
// of its little peninsula 110 m north of the lap (data.scenery.landmarks kind 'igrejinha': the BHGeo cadastre's
// 15-point footprint, the 2015 laser's 9.5 m top). Drawn from the city's 20 cm 2015 orthophoto (the vaults' widths and
// the order seen from above) and Commons photos (2026-10-17). In the building's frame (u along `heading`, v to its
// left, metres from m.x, m.y):
// - the nave: one parabolic concrete vault widening toward the lake, 9.3 m wide and 6.9 m high at the altar, 14.9 m and
//   9.5 m at the front (v 11.7), clad in pale blue pastilhas; along its sides Paulo Werneck's blue and white mosaic
//   ribbon. Its front arch, a thick cream rim, is filled with vertical blue brise-soleil louvers over the glazed entrance.
// - behind it, four smaller parallel vaults side by side, from west to east 5.6 m, 4.3 m, the 9.3 m altar vault (6.6 m)
//   and 5.1 m: the wavy rear elevation that faces the avenue (and the lap), covered by Portinari's blue and white
//   azulejo panel of St Francis. Here an evocation in the same colours and 15 cm tile grid (a friar with the birds,
//   St Francis with open arms and the wolf, fish, rays, patterned fields), not a copy of the work. The small vaults'
//   ends beside the nave are white grids of frosted glass.
// - in front (facing the lake, NNE) the marquise, a thin slab at 3 m on slender posts, runs from the entrance west to
//   the separate bell tower: a 14 m slab of beige stone, narrow at the foot and wider at the top, its narrow faces a blue
//   diamond lattice with the bell inside. The steel cross stands in the forecourt east of the front.
// - the ground: the paved forecourt with its black organic calçada figure, the east terrace, Burle Marx's lawns and
//   beds (the orange lilies behind the panel), the walkway round the tip of the peninsula (one textured mesh on the
//   ground). The lap takes the street round the little square (OSM way 364055129) about 25 m behind the panel: the
//   ground stops at its walls, and the land cover's trees go from the lawn between and from the sight lines from the
//   lap to the church (approaching, passing, leaving).
// After dark (setNight) uplights at the foot wash the panel, the vaults, the front and the tower, the entrance glows warm.
// Everything is merged per material (a draw call each); nothing enters the lap's driving space (checked per vertex).

const DRIVE=4.6;
function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
// Linear colours (vertex colours are linear): an sRGB hex scaled by k.
const lin=(hex,k=1)=>{const c=new THREE.Color(hex);return [c.r*k,c.g*k,c.b*k];};
const mul=(c,k)=>[c[0]*k,c[1]*k,c[2]*k];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),lerp=(a,b,u)=>a+(b-a)*u;
// A frame: u along heading h, v to its left, z up from oz; returns track coordinates.
const frame=(ox,oy,oz,h)=>{const c=Math.cos(h),s=Math.sin(h);return (u,v,z)=>[ox+u*c-v*s,oy+u*s+v*c,oz+z];};
// Value noise for the light weathering (the church is well kept): never repeats.
const hash=(i,j)=>{const h=Math.sin(i*127.1+j*311.7)*43758.5453;return h-Math.floor(h);};
function noise(x,y){const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,su=u*u*(3-2*u),sv=v*v*(3-2*v);return (hash(i,j)*(1-su)+hash(i+1,j)*su)*(1-sv)+(hash(i,j+1)*(1-su)+hash(i+1,j+1)*su)*sv;}
const fbm=(x,y)=>.55*noise(x,y)+.3*noise(x*2.1+5.2,y*2.1+1.3)+.15*noise(x*4.3+9.1,y*4.3+7.7);
function gridHeight(g,x,y){
 if(!g)return null;const fx=(x-g.x0)/g.step,fy=(y-g.y0)/g.step;if(fx<0||fy<0||fx>g.nx-1||fy>g.ny-1)return null;
 const i=Math.min(g.nx-2,Math.floor(fx)),j=Math.min(g.ny-2,Math.floor(fy)),u=fx-i,v=fy-j,k=j*g.nx+i;
 return (g.z[k]*(1-u)+g.z[k+1]*u)*(1-v)+(g.z[k+g.nx]*(1-u)+g.z[k+g.nx+1]*u)*v;
}
function inside(x,y,pts){let c=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[i],b=pts[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
const edgeOut=(a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;return [dy/l,-dx/l];};
// A 2D polygon cut to z0 <= y <= z1 (Sutherland-Hodgman on two horizontal lines).
function clipZ(poly,z0,z1){
 const cut=(P,keep,at)=>{const out=[];for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length],ka=keep(a),kb=keep(b);if(ka)out.push(a);if(ka!==kb){const t=(at-a[1])/(b[1]-a[1]);out.push([lerp(a[0],b[0],t),at]);}}return out;};
 return cut(cut(poly,p=>p[1]>=z0,z0),p=>p[1]<=z1,z1);
}

// ---------- Geometry gathered per material in track coordinates, drawn as one mesh
// Flat-shaded triangles unless per-corner normals are given (the vaults are smooth). UVs per corner, or metres over
// `size` (level faces x and y, walls the run along them and z).
class Batch{
 constructor(size=0){this.size=size;this.p=[];this.n=[];this.c=[];this.t=[];}
 get vertices(){return this.p.length/3;}
 get triangles(){return this.p.length/9;}
 tri(a,b,c,col,uv,ns){
  const n=cross(sub(b,a),sub(c,a)),l=Math.hypot(n[0],n[1],n[2]);if(l<1e-9)return;let f=[n[0]/l,n[1]/l,n[2]/l];
  if(ns&&dot(f,[ns[0][0]+ns[1][0]+ns[2][0],ns[0][1]+ns[1][1]+ns[2][1],ns[0][2]+ns[1][2]+ns[2][2]])<0){[b,c]=[c,b];if(uv)uv=[uv[0],uv[2],uv[1]];ns=[ns[0],ns[2],ns[1]];f=mul(f,-1);}
  const q=[a,b,c];
  for(let i=0;i<3;i++){
   const p=q[i],k=typeof col==='function'?col(p):col,m=ns?ns[i]:f;this.p.push(p[0],p[2],-p[1]);this.n.push(m[0],m[2],-m[1]);this.c.push(k[0],k[1],k[2]);
   let s=0,t=0;if(uv)[s,t]=uv[i];else if(this.size){if(Math.abs(f[2])>.7){s=p[0]/this.size;t=p[1]/this.size;}else{const h=Math.hypot(f[0],f[1])||1;s=(-f[1]*p[0]+f[0]*p[1])/h/this.size;t=p[2]/this.size;}}
   this.t.push(s,t);
  }
 }
 // A planar quad a-b-c-d turned to face `out` when given.
 quad(a,b,c,d,col,out,uv,ns){
  if(out&&dot(cross(sub(c,a),sub(d,b)),out)<0){[b,d]=[d,b];if(uv)uv=[uv[0],uv[3],uv[2],uv[1]];if(ns)ns=[ns[0],ns[3],ns[2],ns[1]];}
  this.tri(a,b,c,col,uv&&[uv[0],uv[1],uv[2]],ns&&[ns[0],ns[1],ns[2]]);this.tri(a,c,d,col,uv&&[uv[0],uv[2],uv[3]],ns&&[ns[0],ns[2],ns[3]]);
 }
 // A planar polygon given in 2D (concave allowed), placed by to3(p2) and facing out; uvOf(p2) for its UVs.
 flat(pts2,to3,col,out,uvOf){
  if(pts2.length<3)return;const flat=pts2.map(p=>new THREE.Vector2(p[0],p[1]));if(Math.abs(THREE.ShapeUtils.area(flat))<1e-6)return;
  for(const [i,j,k] of THREE.ShapeUtils.triangulateShape(flat,[])){let a=pts2[i],b=pts2[j],c=pts2[k];const A=to3(a),B=to3(b),C=to3(c);
   if(dot(cross(sub(B,A),sub(C,A)),out)<0)this.tri(A,C,B,col,uvOf&&[uvOf(a),uvOf(c),uvOf(b)]);else this.tri(A,B,C,col,uvOf&&[uvOf(a),uvOf(b),uvOf(c)]);}
 }
 // A box a0..a1 × b0..b1 × z0..z1 in frame f, every face turned away from its centre.
 box(f,a0,a1,b0,b1,z0,z1,col,{bottom=false,top=true}={}){
  const P=(i,j,k)=>f(i?a1:a0,j?b1:b0,k?z1:z0),c=f((a0+a1)/2,(b0+b1)/2,(z0+z1)/2),face=(A,B,C,D)=>this.quad(A,B,C,D,col,sub([(A[0]+C[0])/2,(A[1]+C[1])/2,(A[2]+C[2])/2],c));
  face(P(0,0,0),P(0,1,0),P(0,1,1),P(0,0,1));face(P(1,0,0),P(1,1,0),P(1,1,1),P(1,0,1));face(P(0,0,0),P(1,0,0),P(1,0,1),P(0,0,1));face(P(0,1,0),P(1,1,0),P(1,1,1),P(0,1,1));
  if(bottom)face(P(0,0,0),P(1,0,0),P(1,1,0),P(0,1,0));if(top)face(P(0,0,1),P(1,0,1),P(1,1,1),P(0,1,1));
 }
 // An n-sided post from p (radius r0) to q (radius r1).
 post(p,q,r0,r1,n,col,{rot=0,top=true}={}){
  const d=unit(sub(q,p)),e1=unit(Math.abs(d[2])>.99?cross([0,1,0],d):cross(d,[0,0,1])),e2=cross(d,e1);
  const ring=(c,r)=>Array.from({length:n},(_,i)=>{const a=rot+i*2*Math.PI/n,x=Math.cos(a)*r,y=Math.sin(a)*r;return [c[0]+e1[0]*x+e2[0]*y,c[1]+e1[1]*x+e2[1]*y,c[2]+e1[2]*x+e2[2]*y];});
  const A=ring(p,r0),B=ring(q,r1);
  for(let i=0;i<n;i++){const j=(i+1)%n,m=sub([(A[i][0]+A[j][0])/2,(A[i][1]+A[j][1])/2,(A[i][2]+A[j][2])/2],p);this.quad(A[i],A[j],B[j],B[i],col,sub(m,mul(d,dot(m,d))));}
  if(top&&r1>0)for(let i=1;i<n-1;i++){const f=dot(cross(sub(B[i],B[0]),sub(B[i+1],B[0])),d)<0;this.tri(B[0],f?B[i+1]:B[i],f?B[i]:B[i+1],col);}
 }
 mesh(name,material,shadow=true){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(this.t,2));g.computeBoundingSphere();
  const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.castShadow=shadow;mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;return mesh;
 }
}

// ---------- The lap's driving space (asphalt and walls, DRIVE metres over the road)
function lapSpace(data){
 const A=data.samples,N=A.length,CELL=8,cells=new Map(),key=(i,j)=>i*131071+j;
 const st=A.map(p=>{const tl=Math.hypot(p[7],p[8])||1,nl=Math.hypot(p[9],p[10])||1,q={s:p[0],x:p[1],y:p[2],z:p[3],cf:p[5],n:[p[9]/nl,p[10]/nl],back:[0,0]};for(const [k,side] of [[0,-1],[1,1]])q.back[k]=p[4]/2+guardrailClearance(data,p[0],side)+(guardrailPresent(data,p[0],side)?.75:0);q.t=[p[7]/tl,p[8]/tl];return q;});
 for(let i=0;i<N;i++){const p=st[i],q=st[(i+1)%N],r=Math.max(...p.back,...q.back)+4;
  for(let ci=Math.floor((Math.min(p.x,q.x)-r)/CELL);ci<=Math.floor((Math.max(p.x,q.x)+r)/CELL);ci++)for(let cj=Math.floor((Math.min(p.y,q.y)-r)/CELL);cj<=Math.floor((Math.max(p.y,q.y)+r)/CELL);cj++){const k=key(ci,cj);let l=cells.get(k);if(!l)cells.set(k,l=[]);l.push(i);}}
 function at(x,y){
  const list=cells.get(key(Math.floor(x/CELL),Math.floor(y/CELL))),out=[];if(!list)return out;
  for(const i of list){const p=st[i],q=st[(i+1)%N],dx=q.x-p.x,dy=q.y-p.y,l2=dx*dx+dy*dy||1e-9;let u=((x-p.x)*dx+(y-p.y)*dy)/l2;if(u<-.02||u>1.02)continue;u=clamp(u,0,1);
   const nx=lerp(p.n[0],q.n[0],u),ny=lerp(p.n[1],q.n[1],u),lat=(x-p.x-dx*u)*nx+(y-p.y-dy*u)*ny,k=lat>=0?1:0;
   out.push({s:p.s,lat,road:lerp(p.z,q.z,u)+lerp(p.cf,q.cf,u)*lat,back:lerp(p.back[k],q.back[k],u)});}
  return out;
 }
 return {at};
}

// ---------- Textures (canvas)
const wrap=(w,h,x,y,s,fn)=>{for(const dx of [-w,0,w])for(const dy of [-h,0,h])if(x+dx+s>0&&x+dx-s<w&&y+dy+s>0&&y+dy-s<h)fn(x+dx,y+dy);};
function grain(ctx,amount,r){const img=ctx.getImageData(0,0,ctx.canvas.width,ctx.canvas.height),d=img.data;for(let i=0;i<d.length;i+=4){const n=(r()-.5)*amount;d[i]+=n;d[i+1]+=n;d[i+2]+=n;}ctx.putImageData(img,0,0);}
function blotches(ctx,w,h,r,count,light,dark,size,alpha){for(let k=0;k<count;k++){const x=r()*w,y=r()*h,s=size*(.3+r()),c=r()<.5?light:dark,a=alpha*(.4+r());wrap(w,h,x,y,s,(px,py)=>{const g=ctx.createRadialGradient(px,py,0,px,py,s);g.addColorStop(0,`rgba(${c},${a})`);g.addColorStop(1,`rgba(${c},0)`);ctx.fillStyle=g;ctx.fillRect(px-s,py-s,2*s,2*s);});}}
// The vaults' pastilhas (1.2 m: 48 × 48 glass tiles of 2.5 cm): pale sky blue, each tile its own shade, light grout.
const pastilhaTexture=()=>canvasTexture((ctx,w,h)=>{
 const r=random(41),n=48,s=w/n;ctx.fillStyle='#d3d6d4';ctx.fillRect(0,0,w,h);
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){const k=r(),v=(r()-.5)*20,c=k<.05?[182,198,222]:k<.11?[88,118,170]:[110+v,140+v,188+v*.6];ctx.fillStyle=`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;ctx.fillRect(i*s+.9,j*s+.9,s-1.8,s-1.8);}
 blotches(ctx,w,h,r,18,'235,240,248','90,100,120',90,.05);
},512,512,true);
// Smooth painted concrete (6 m): the cream rims, the marquise, the kerbs.
const concreteTexture=()=>canvasTexture((ctx,w,h)=>{const r=random(5);ctx.fillStyle='#e2ddd2';ctx.fillRect(0,0,w,h);blotches(ctx,w,h,r,60,'255,255,250','90,88,80',80,.05);for(let k=0;k<18;k++){ctx.fillStyle=`rgba(60,60,55,${.02+r()*.04})`;ctx.fillRect(0,r()*h,w,1);}grain(ctx,14,r);},512,512,true);
// The bell tower's beige stone (1.8 m: 2 × 3 slabs of 0.9 × 0.6 m), each slab its tone and veins, fine joints.
const stoneTexture=()=>canvasTexture((ctx,w,h)=>{
 const r=random(77),cw=w/2,rh=h/3;
 for(let j=0;j<3;j++)for(let i=0;i<2;i++){const k=.9+r()*.16;ctx.fillStyle=`rgb(${222*k|0},${208*k|0},${180*k|0})`;ctx.fillRect(i*cw,j*rh,cw,rh);
  for(let v=0;v<5;v++){ctx.strokeStyle=`rgba(${120+r()*40|0},${105+r()*30|0},${80|0},${.12+r()*.18})`;ctx.lineWidth=.6+r()*1.4;ctx.beginPath();let x=i*cw+r()*cw,y=j*rh;ctx.moveTo(x,y);for(let q=0;q<6;q++){x+=(r()-.45)*cw*.3;y+=rh/6;ctx.lineTo(x,y);}ctx.stroke();}}
 ctx.fillStyle='rgba(90,80,64,.55)';for(let i=0;i<=2;i++)ctx.fillRect(i*cw-1,0,2,h);for(let j=0;j<=3;j++)ctx.fillRect(0,j*rh-1,w,2);
 blotches(ctx,w,h,r,30,'250,245,230','110,95,70',60,.06);grain(ctx,10,r);
},512,512,true);

// The atlas of the painted and glazed walls (2048²). Regions in canvas pixels [x0, y0, x1, y1]:
const AW=2048,AH=2048;
const REG={
 panel:[0,0,2048,600],      // the rear elevation: u -11.4..13.3, z 0..7 (Portinari's azulejos, evoked)
 band:[0,612,2048,862],     // Werneck's ribbon along the nave's sides: 20 m along, z 0.6..3.05
 brise:[0,876,1024,1376],   // the front arch above the marquise: 14 m across, z 3.3..9.0
 glazing:[1036,876,2048,1100], // the entrance under it: 14 m × 3.3 m
 frosted:[1036,1112,1548,1376], // the small vaults' grids of frosted glass: 6 m × 5 m
 lattice:[1564,1112,1704,2040]  // the bell tower's diamond lattice: across × z 0.6..13.6
};
const PANEL={u0:-11.4,u1:13.3,z1:7};
const regUv=R=>(fx,fy)=>[(R[0]+fx*(R[2]-R[0]))/AW,1-(R[3]-fy*(R[3]-R[1]))/AH];
// Rear vaults (u0, u1, height): west to east.
const REAR=[{name:'A',u0:-11.2,u1:-5.6,h:4.9},{name:'B',u0:-5.6,u1:-1.33,h:4},{name:'C',u0:-1.33,u1:7.97,h:6.6},{name:'D',u0:7.97,u1:13.09,h:4.6}];

function muralTexture(){
 return canvasTexture((ctx,w,h)=>{
  const r=random(1943),cobalt='#1f3f9c',deep='#173273',mid='#5b7fca',white='#f3f2ea';ctx.fillStyle='#e9e8e2';ctx.fillRect(0,0,w,h);ctx.clearRect(0,REG.band[1]-6,w,REG.band[3]-REG.band[1]+12);
  // --- The rear panel: white glazed tiles; inside each arch a composition in cobalt (an evocation: the friar among the
  // birds, the fish and the waves, St Francis with open arms over the wolf, the rays, the sun and the tree).
  const [px0,py0,px1,py1]=REG.panel,X=u=>px0+(u-PANEL.u0)/(PANEL.u1-PANEL.u0)*(px1-px0),Y=z=>py1-z/PANEL.z1*(py1-py0),M=(px1-px0)/(PANEL.u1-PANEL.u0);
  ctx.fillStyle=white;ctx.fillRect(px0,py0,px1-px0,py1-py0);
  const arch=v=>{const hw=(v.u1-v.u0)/2,c=(v.u0+v.u1)/2;ctx.beginPath();ctx.moveTo(X(v.u0-.05),Y(-.2));for(let k=0;k<=40;k++){const a=-1+2*k/40;ctx.lineTo(X(c+a*hw),Y(v.h*(1-a*a)));}ctx.lineTo(X(v.u1+.05),Y(-.2));ctx.closePath();};
  const line=(pts,width=3,col=cobalt)=>{ctx.strokeStyle=col;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();pts.forEach(([u,z],i)=>{const x=X(u)+(r()-.5)*1.5,y=Y(z)+(r()-.5)*1.5;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();};
  const blob=(pts,fill)=>{ctx.fillStyle=fill;ctx.beginPath();pts.forEach(([u,z],i)=>i?ctx.lineTo(X(u),Y(z)):ctx.moveTo(X(u),Y(z)));ctx.closePath();ctx.fill();};
  const disc=(u,z,rad,fill)=>{ctx.fillStyle=fill;ctx.beginPath();ctx.arc(X(u),Y(z),rad*M,0,2*Math.PI);ctx.fill();};
  // A patterned field: deep cobalt, a small white motif on every other tile (the panel's ornamental bands).
  const field=(u0,u1,z0,z1,motif=0)=>{ctx.fillStyle=deep;ctx.fillRect(X(u0),Y(z1),X(u1)-X(u0),Y(z0)-Y(z1));ctx.fillStyle='rgba(243,242,234,.85)';
   for(let z=z0+.075;z<z1;z+=.3)for(let u=u0+.075+(Math.round(z/.3)%2)*.15;u<u1;u+=.3){const x=X(u),y=Y(z),s=.045*M;if(motif===0){ctx.fillRect(x-s,y-s*.3,2*s,s*.6);ctx.fillRect(x-s*.3,y-s,s*.6,2*s);}else if(motif===1){ctx.beginPath();ctx.arc(x,y,s*.7,0,2*Math.PI);ctx.fill();}else{ctx.beginPath();ctx.moveTo(x,y-s);ctx.lineTo(x+s,y);ctx.lineTo(x,y+s);ctx.lineTo(x-s,y);ctx.fill();}}};
  const bird=(u,z,s,fill=cobalt)=>{ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(X(u-s),Y(z+s*.35));ctx.quadraticCurveTo(X(u-s*.4),Y(z+s*.1),X(u),Y(z-s*.12));ctx.quadraticCurveTo(X(u+s*.4),Y(z+s*.1),X(u+s),Y(z+s*.4));ctx.quadraticCurveTo(X(u+s*.35),Y(z+s*.02),X(u),Y(z-s*.32));ctx.quadraticCurveTo(X(u-s*.35),Y(z+s*.02),X(u-s),Y(z+s*.35));ctx.fill();};
  const fish=(u,z,s,dir=1,fill=white)=>{ctx.fillStyle=fill;ctx.beginPath();ctx.ellipse(X(u),Y(z),s*M,s*.38*M,0,0,2*Math.PI);ctx.fill();ctx.beginPath();ctx.moveTo(X(u-dir*s*.9),Y(z));ctx.lineTo(X(u-dir*s*1.5),Y(z+s*.35));ctx.lineTo(X(u-dir*s*1.5),Y(z-s*.35));ctx.fill();ctx.fillStyle=cobalt;disc(u+dir*s*.55,z+s*.08,s*.08,cobalt);};
  const waves=(u0,u1,z,amp,rows,col=cobalt)=>{for(let k=0;k<rows;k++){const pts=[];for(let u=u0;u<=u1+.01;u+=.12)pts.push([u,z+k*amp*2.2+Math.sin(u*3.1+k*1.7)*amp]);line(pts,2.6,col);}};
  // A robed friar: hood and halo, the cord, the folds; arms 'open' (raised wide) or 'bird' (holding one).
  const friar=(c,z0,H,arms)=>{
   const sh=z0+H*.78,hw0=H*.25,hw1=H*.16;
   blob([[c-hw0,z0],[c-hw1*1.05,sh],[c-hw1*.6,sh+H*.06],[c+hw1*.6,sh+H*.06],[c+hw1*1.05,sh],[c+hw0,z0]],white);
   line([[c-hw0,z0],[c-hw1*1.05,sh],[c-hw1*.6,sh+H*.06],[c+hw1*.6,sh+H*.06],[c+hw1*1.05,sh],[c+hw0,z0],[c-hw0,z0]],3.4);
   for(let k=-2;k<=2;k++)line([[c+k*H*.045,sh-H*.12],[c+k*H*.07+(r()-.5)*.05,z0+.05]],2);
   line([[c-hw1*.95,z0+H*.5],[c+hw1*.95,z0+H*.5]],2.4);line([[c+hw1*.3,z0+H*.5],[c+hw1*.45,z0+H*.22]],2);
   disc(c,sh+H*.14,H*.115,cobalt);disc(c,sh+H*.14,H*.1,white);disc(c,sh+H*.13,H*.065,'#c9d3ea');line([[c-H*.07,sh+H*.07],[c-H*.075,sh+H*.17],[c,sh+H*.22],[c+H*.075,sh+H*.17],[c+H*.07,sh+H*.07]],2.4);
   if(arms==='open')for(const sd of [-1,1]){blob([[c+sd*hw1*.9,sh-H*.02],[c+sd*H*.42,sh+H*.2],[c+sd*H*.47,sh+H*.13],[c+sd*hw1*.95,sh-H*.16]],white);line([[c+sd*hw1*.9,sh-H*.02],[c+sd*H*.42,sh+H*.2],[c+sd*H*.47,sh+H*.13],[c+sd*hw1*.95,sh-H*.16]],2.8);disc(c+sd*H*.46,sh+H*.19,H*.03,cobalt);}
   else{line([[c-hw1*.9,sh-H*.05],[c-H*.04,sh-H*.28],[c+H*.06,sh-H*.26]],2.6);line([[c+hw1*.9,sh-H*.05],[c+H*.05,sh-H*.24]],2.6);bird(c+H*.02,sh-H*.2,H*.09);}
  };
  ctx.save();
  for(const v of REAR){ctx.save();arch(v);ctx.clip();const c=(v.u0+v.u1)/2,hw=(v.u1-v.u0)/2;
   if(v.name==='A'){field(v.u0,v.u1,2.5,v.h,0);field(v.u0,v.u0+.7,0,2.5,1);field(v.u1-.7,v.u1,0,2.5,1);for(let k=0;k<5;k++)bird(c-1.6+r()*3.2,3.3+r()*1.2,.22,white);friar(c-.15,.35,3.45,'bird');waves(v.u0,v.u1,.1,.06,2);for(let k=0;k<4;k++)bird(c+(r()<.5?-1:1)*(1.15+r()*.8),1.4+r()*1.4,.16);}
   if(v.name==='B'){field(v.u0,v.u1,2.4,v.h,1);waves(v.u0,v.u1,.25,.07,6,mid);ctx.fillStyle='rgba(31,63,156,.9)';ctx.fillRect(X(v.u0),Y(2.6),X(v.u1)-X(v.u0),Y(1.4)-Y(2.6));for(let k=0;k<5;k++)fish(v.u0+.6+r()*(2*hw-1.2),1.6+r()*.85,.22+r()*.08,r()<.5?1:-1);for(let k=0;k<3;k++)bird(c-1+r()*2,3+r()*.6,.2,white);}
   if(v.name==='C'){field(v.u0,v.u1,3.7,v.h,2);field(v.u0,v.u0+1.1,0,3.7,0);field(v.u1-1.1,v.u1,0,3.7,0);ctx.strokeStyle='rgba(243,242,234,.9)';ctx.lineWidth=3;for(let k=-7;k<=7;k++){const a=Math.PI/2+k*.13;ctx.beginPath();ctx.moveTo(X(c),Y(6.3));ctx.lineTo(X(c+Math.cos(a)*4),Y(6.3-Math.sin(a)*1.9));ctx.stroke();}
    friar(c,.55,4.25,'open');
    // The wolf at his feet (west): body, head turned up, ears, legs and tail, in cobalt.
    const wu=c-2.6,wz=.25;blob([[wu-.8,wz+.35],[wu-.7,wz+.7],[wu+.2,wz+.78],[wu+.65,wz+.95],[wu+.85,wz+1.25],[wu+1.0,wz+1.18],[wu+1.02,wz+.98],[wu+.8,wz+.62],[wu+.65,wz+.3],[wu+.55,wz],[wu+.42,wz],[wu+.4,wz+.32],[wu-.4,wz+.35],[wu-.5,wz],[wu-.62,wz],[wu-.65,wz+.35]],cobalt);
    line([[wu-.75,wz+.62],[wu-1.15,wz+.95],[wu-1.25,wz+.8]],4);line([[wu+.82,wz+1.22],[wu+.84,wz+1.42],[wu+.92,wz+1.25]],3);
    for(let k=0;k<7;k++)bird(c+1.6+r()*2.4,2+r()*2.3,.2+r()*.08);for(let k=0;k<3;k++)bird(c-3.3+r()*1.2,2.6+r()*1.2,.18);
    // A tree at the east foot.
    line([[c+3.6,.1],[c+3.55,1.6],[c+3.3,2.2]],5);for(let k=0;k<6;k++)disc(c+3.3+(r()-.5)*1.1,2+r()*1,.25+r()*.12,k%2?cobalt:mid);waves(v.u0,v.u1,.08,.05,1);}
   if(v.name==='D'){field(v.u0,v.u1,2.3,v.h,0);field(v.u0,v.u0+.6,0,2.3,2);disc(c,3.55,.55,white);disc(c,3.55,.42,'#e6c76a');for(let k=0;k<12;k++){const a=k/12*2*Math.PI;line([[c+Math.cos(a)*.62,3.55+Math.sin(a)*.62],[c+Math.cos(a)*.86,3.55+Math.sin(a)*.86]],3,white);}
    for(let k=0;k<5;k++){const u=v.u0+.5+k*.95;line([[u,.05],[u+.05,.9+r()*.5]],3);for(let q=0;q<3;q++)blob([[u,.5+q*.3],[u-.25,.7+q*.3],[u,.62+q*.3]],k%2?cobalt:mid);}for(let k=0;k<4;k++)bird(c-1.5+r()*3,1.6+r()*1,.19);}
   ctx.restore();}
  ctx.restore();
  // The tile grid over the panel (15 cm azulejos): each tile its glaze, the grout between.
  for(let z=0;z<PANEL.z1;z+=.15)for(let u=PANEL.u0;u<PANEL.u1;u+=.15){const k=r();if(k<.5)continue;ctx.fillStyle=k<.8?`rgba(255,255,255,${.04+r()*.06})`:`rgba(20,40,110,${.03+r()*.05})`;ctx.fillRect(X(u),Y(z+.15),.15*M,.15*M);}
  ctx.fillStyle='rgba(150,155,160,.35)';for(let u=PANEL.u0;u<PANEL.u1;u+=.15)ctx.fillRect(X(u)-.5,py0,1,py1-py0);for(let z=0;z<PANEL.z1;z+=.15)ctx.fillRect(px0,Y(z)-.5,px1-px0,1);

  // --- Werneck's ribbon (transparent around it): a flowing cream band between dark and mid blue waves.
  {const [x0,y0,x1,y1]=REG.band,bh=y1-y0,F=(t,z)=>[x0+t*(x1-x0),y1-z*bh];ctx.save();ctx.beginPath();ctx.rect(x0,y0,x1-x0,bh);ctx.clip();
   const wave=(t,ph,amp,base)=>base+amp*Math.sin(t*28+ph)+amp*.45*Math.sin(t*61+ph*1.7);
   const strip=(lo,hi,fill)=>{ctx.fillStyle=fill;ctx.beginPath();for(let k=0;k<=400;k++){const t=k/400,[x,y]=F(t,hi(t));k?ctx.lineTo(x,y):ctx.moveTo(x,y);}for(let k=400;k>=0;k--){const t=k/400,[x,y]=F(t,lo(t));ctx.lineTo(x,y);}ctx.closePath();ctx.fill();};
   strip(t=>wave(t,1.3,.1,.18),t=>wave(t,.2,.12,.5),deep);
   strip(t=>wave(t,.2,.12,.5),t=>wave(t,2.1,.14,.76),white);
   strip(t=>wave(t,2.1,.14,.76),t=>wave(t,4.0,.09,.9),mid);
   // Angular pieces along it (the mosaic's facets) and its tiny tiles.
   for(let k=0;k<70;k++){const t=r(),z=.35+r()*.4,[x,y]=F(t,z),s=10+r()*26;ctx.fillStyle=r()<.5?deep:r()<.5?mid:white;ctx.beginPath();ctx.moveTo(x,y-s*.6);ctx.lineTo(x+s,y);ctx.lineTo(x+s*.2,y+s*.5);ctx.closePath();ctx.globalAlpha=.85;ctx.fill();ctx.globalAlpha=1;}
   ctx.globalCompositeOperation='source-atop';ctx.fillStyle='rgba(255,255,255,.07)';for(let y=y0;y<y1;y+=3)ctx.fillRect(x0,y,x1-x0,1);for(let x=x0;x<x1;x+=3)ctx.fillRect(x,y0,1,bh);ctx.globalCompositeOperation='source-over';ctx.restore();}

  // --- The brise-soleil: vertical blue louvers in their frame (the shade of each on the next).
  {const [x0,y0,x1,y1]=REG.brise,n=40,sw=(x1-x0)/n;ctx.fillStyle='#22385f';ctx.fillRect(x0,y0,x1-x0,y1-y0);
   for(let k=0;k<n;k++){const x=x0+k*sw,g=ctx.createLinearGradient(x,0,x+sw,0);g.addColorStop(0,'#a9c2e6');g.addColorStop(.25,'#86a6da');g.addColorStop(.72,'#5f82c0');g.addColorStop(.8,'#2a426e');g.addColorStop(1,'#22385f');ctx.fillStyle=g;ctx.fillRect(x,y0,sw,y1-y0);}
   ctx.fillStyle='#e9e6dd';ctx.fillRect(x0,y1-7,x1-x0,7);for(let y=y0+(y1-y0)/3;y<y1-10;y+=(y1-y0)/3)ctx.fillRect(x0,y,x1-x0,2);}
  // --- The glazed entrance: tall panes in white frames, the dim nave behind, the baptistery's tiles on the left.
  {const [x0,y0,x1,y1]=REG.glazing,bw=(x1-x0)/10;const g=ctx.createLinearGradient(0,y0,0,y1);g.addColorStop(0,'#4d5f70');g.addColorStop(.5,'#2b3640');g.addColorStop(1,'#1b2228');ctx.fillStyle=g;ctx.fillRect(x0,y0,x1-x0,y1-y0);
   ctx.fillStyle='#e9edf2';ctx.fillRect(x0+bw*.5,y0+30,bw*2.2,y1-y0-34);ctx.fillStyle=cobalt;for(let k=0;k<26;k++){ctx.globalAlpha=.6;ctx.fillRect(x0+bw*.5+r()*bw*2,y0+34+r()*(y1-y0-60),10+r()*24,6+r()*14);}ctx.globalAlpha=1;
   ctx.fillStyle='rgba(255,236,200,.35)';for(let k=0;k<8;k++)ctx.fillRect(x0+bw*(3+r()*6.5),y0+40+r()*80,4,4);
   ctx.fillStyle='rgba(210,225,240,.18)';ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x0+bw*3,y0);ctx.lineTo(x0+bw*1.5,y1);ctx.lineTo(x0,y1);ctx.fill();
   ctx.fillStyle='#f1f2f0';for(let k=0;k<=10;k++)ctx.fillRect(x0+k*bw-3,y0,6,y1-y0);ctx.fillRect(x0,y0,x1-x0,6);ctx.fillRect(x0,y1-8,x1-x0,8);ctx.fillRect(x0,y0+(y1-y0)*.28,x1-x0,3);}
  // --- Frosted glass in a white concrete grid (0.55 m squares), a louvred pane here and there.
  {const [x0,y0,x1,y1]=REG.frosted,m=(x1-x0)/6,cell=.55*m;ctx.fillStyle='#eceeea';ctx.fillRect(x0,y0,x1-x0,y1-y0);
   for(let y=y1;y>y0;y-=cell)for(let x=x0;x<x1;x+=cell){const k=r(),v=(r()-.5)*14;ctx.fillStyle=k<.06?'#7f8b8a':`rgb(${200+v|0},${214+v|0},${208+v|0})`;ctx.fillRect(x+4,y-cell+4,cell-8,cell-8);if(k<.06){ctx.fillStyle='#d4dbd8';for(let q=0;q<5;q++)ctx.fillRect(x+4,y-cell+6+q*cell/5,cell-8,3);}
    const g=ctx.createLinearGradient(x,y-cell,x+cell,y);g.addColorStop(0,'rgba(255,255,255,.25)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(x+4,y-cell+4,cell-8,cell-8);}}
  // --- The bell tower's lattice: blue diamond bars, open between (alpha).
  {const [x0,y0,x1,y1]=REG.lattice,W=x1-x0,H=y1-y0;ctx.clearRect(x0,y0,W,H);ctx.save();ctx.beginPath();ctx.rect(x0,y0,W,H);ctx.clip();ctx.strokeStyle='#6d8fc8';ctx.lineWidth=9;const d=W/4,dh=d*1.25;
   for(let k=-12;k<=12+H/dh;k++){ctx.beginPath();ctx.moveTo(x0,y0+k*dh);ctx.lineTo(x0+W,y0+k*dh+W*1.25);ctx.stroke();ctx.beginPath();ctx.moveTo(x0+W,y0+k*dh);ctx.lineTo(x0,y0+k*dh+W*1.25);ctx.stroke();}
   ctx.strokeStyle='rgba(30,50,90,.5)';ctx.lineWidth=2;for(let k=-12;k<=12+H/dh;k++){ctx.beginPath();ctx.moveTo(x0,y0+k*dh+5);ctx.lineTo(x0+W,y0+k*dh+W*1.25+5);ctx.stroke();}
   ctx.fillStyle='#d6cbb1';ctx.fillRect(x0,y0,7,H);ctx.fillRect(x1-7,y0,7,H);ctx.restore();}
 },AW,AH,false);
}

// The site plan on the ground (u -48..52, v -28..37.6 in the building's frame): lawns, the paved forecourt and its
// black organic calçada figure, the terrace east, the beds, the walkway round the tip, the service road's kerb.
const SITE={u0:-48,u1:54,v0:-44,v1:37.6};
function siteTexture(){
 return canvasTexture((ctx,w,h)=>{
  const r=random(1959),k=w/(SITE.u1-SITE.u0),X=u=>(u-SITE.u0)*k,Y=v=>(SITE.v1-v)*k;
  const path=(pts,close=true)=>{ctx.beginPath();pts.forEach(([u,v],i)=>i?ctx.lineTo(X(u),Y(v)):ctx.moveTo(X(u),Y(v)));if(close)ctx.closePath();};
  const smooth=(pts)=>{ctx.beginPath();const n=pts.length;for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n],m=[(a[0]+b[0])/2,(a[1]+b[1])/2];if(!i){const z=pts[n-1],m0=[(z[0]+a[0])/2,(z[1]+a[1])/2];ctx.moveTo(X(m0[0]),Y(m0[1]));}ctx.quadraticCurveTo(X(a[0]),Y(a[1]),X(m[0]),Y(m[1]));}ctx.closePath();};
  // Lawn, then the grass bank toward the water; patches of lighter and drier grass.
  ctx.fillStyle='#5d743d';ctx.fillRect(0,0,w,h);blotches(ctx,w,h,r,220,'140,150,90','55,70,35',40,.14);blotches(ctx,w,h,r,60,'170,160,110','90,95,60',60,.12);
  // The walkway round the tip (asphalt, 4.5 m) and its light edging.
  const loop=[[-44,-46],[-40,-30],[-38.5,-16],[-35,-2],[-28.5,11],[-17,20.5],[-2,24.5],[13,23.6],[26,18.5],[36,11],[44,1],[50,-9],[56,-16]];
  ctx.lineCap='round';ctx.lineJoin='round';path(loop,false);ctx.strokeStyle='#cfc7b2';ctx.lineWidth=6.2*k;ctx.stroke();ctx.strokeStyle='#6b6b68';ctx.lineWidth=4.5*k;ctx.stroke();
  // The forecourt (front and east terrace): light stone setts.
  smooth([[-15,9],[-17,16],[-9,21],[3,21.5],[14,20.5],[22,15],[27,6],[28,-8],[26,-19],[16,-21],[13,-16],[13.5,-7],[12,6],[2,9]]);ctx.fillStyle='#bdb5a3';ctx.fill();
  // A light band round the church; the paths across the lawns (Burle Marx's curves).
  path([[-12.5,-15.5],[-12.5,-5],[-4,-5],[-5,10],[13,10],[14.5,-6],[14.5,-16]]);ctx.strokeStyle='#d7cfbb';ctx.lineWidth=2.4*k;ctx.stroke();
  ctx.strokeStyle='#cdc5b0';ctx.lineWidth=1.8*k;for(const p of [[[-27,-18],[-20,-8],[-24,2],[-18,10],[-15,12]],[[-10,-22],[-22,-24],[-31,-20]]]){path(p,false);ctx.stroke();}
  // Beds: dark green with flowers (orange lilies behind the panel, red cannas, Burle Marx's kidney shapes west).
  const bed=(pts,base,flowers,density)=>{smooth(pts);ctx.fillStyle=base;ctx.fill();ctx.save();smooth(pts);ctx.clip();const us=pts.map(p=>p[0]),vs=pts.map(p=>p[1]);for(let q=0;q<density;q++){const u=lerp(Math.min(...us),Math.max(...us),r()),v=lerp(Math.min(...vs),Math.max(...vs),r());ctx.fillStyle=flowers[q%flowers.length];ctx.fillRect(X(u),Y(v),1+r()*1.6,1+r()*1.6);}ctx.restore();};
  bed([[-13,-16.5],[-4,-17],[5,-16.8],[14,-17],[15,-19.5],[4,-20],[-6,-19.6],[-13.5,-19]],'#3f5e25',['#e8892a','#f0a33a','#d9761c','#58782f'],2600);
  bed([[-23,-14],[-17,-16],[-14,-11],[-17,-6],[-22,-8]],'#3b5a22',['#c3241e','#a81d1a','#4a6a2a'],900);
  bed([[-26,-2],[-20,-3],[-16,2],[-19,7],[-25,5]],'#46652a',['#5b7d31','#3d5a26','#c9b84a'],450);
  bed([[15.5,-5],[17.5,-5],[17.5,7],[15.5,8]],'#36531f',['#4c6d2a','#2f4a1b'],120);
  // The black organic figure on its white ground before the entrance, and the light swirls under the marquise.
  ctx.fillStyle='#d9d5cb';path([[-.6,13.4],[7.6,13.4],[7.6,23.2],[-.6,23.2]]);ctx.fill();
  smooth([[.6,22.2],[4.2,22.6],[6.4,21],[5.6,18.8],[3.3,18.4],[5.2,17.2],[6.6,15.4],[5,14.3],[2.4,15],[3.6,16.6],[1.6,17.6],[2.2,19],[4,20],[2.4,20.8],[.4,20.4]]);ctx.fillStyle='#1d1d1f';ctx.fill();
  ctx.fillStyle='#8d8b86';smooth([[-3,12.2],[2,11.8],[4,13],[1,14.5],[-2,14]]);ctx.fill();ctx.fillStyle='#f1efe8';smooth([[6,12],[11,12.3],[12,14],[8.5,15],[6.2,14]]);ctx.fill();
  // Light round stones set in the east terrace.
  for(let q=0;q<70;q++){const u=17+r()*10,v=-18+r()*30;ctx.fillStyle=`rgba(238,234,222,${.6+r()*.3})`;ctx.beginPath();ctx.ellipse(X(u),Y(v),(.3+r()*.6)*k,(.25+r()*.5)*k,r()*3,0,2*Math.PI);ctx.fill();}
  grain(ctx,16,r);
  // The edge fades into the land round it (alpha, dithered by the material).
  ctx.globalCompositeOperation='destination-in';ctx.filter=`blur(${(3*k)|0}px)`;path(SITE_EDGE);ctx.fillStyle='#000';ctx.fill();ctx.filter='none';ctx.globalCompositeOperation='source-over';
 },1024,820,false);
}
// The decal's outline: the walkway's outer edge plus a grass verge; behind the church it reaches under the lap's
// street round the square, where the walls cut it (its faded edge stays under the asphalt).
const SITE_EDGE=[[-47,-42],[-45,-12],[-40,2],[-33,15],[-21,25],[-3,29.5],[14,28.5],[29,23],[40,14],[48,3],[52,-8],[53,-30],[40,-40],[0,-36],[-30,-40]];

// ---------- Materials: the floodlights' wash after dark on every lit surface
// igFlood: up to 8 uplights (world position, strength), igFloodCol their colours; igNight 0..1. The entrance's glazing
// (a rectangle of the mural's UVs) glows warm.
const MAX_FLOODS=8;
function washed(m,U,key,{glowRect=null}={}){
 m.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,U);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vIgPos;varying vec3 vIgN;')
   .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvIgPos=(modelMatrix*vec4(transformed,1.)).xyz;vIgN=normalize(mat3(modelMatrix)*objectNormal);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vIgPos;varying vec3 vIgN;uniform vec4 igFlood[${MAX_FLOODS}];uniform vec3 igFloodCol[${MAX_FLOODS}];uniform float igNight;`)
   .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
if(igNight>0.){vec3 n=normalize(vIgN)*(gl_FrontFacing?1.:-1.);vec3 wash=vec3(0.);
 for(int i=0;i<${MAX_FLOODS};i++){vec3 d=igFlood[i].xyz-vIgPos;float l=length(d);wash+=igFloodCol[i]*igFlood[i].w*max(dot(n,d/l),0.)*(1./(1.+l*l/90.));}
 totalEmissiveRadiance+=diffuseColor.rgb*wash*igNight*.17;
 ${glowRect?`if(vMapUv.x>${glowRect[0].toFixed(4)}&&vMapUv.x<${glowRect[2].toFixed(4)}&&vMapUv.y>${glowRect[1].toFixed(4)}&&vMapUv.y<${glowRect[3].toFixed(4)})totalEmissiveRadiance+=diffuseColor.rgb*vec3(1.,.72,.42)*1.1*igNight+vec3(.03,.02,.012)*igNight;`:''}}`);
 };
 m.customProgramCacheKey=()=>'pampulha-igrejinha-v1-'+key;
 return m;
}

export const hasPampulhaIgrejinha=data=>(data.scenery?.landmarks??[]).some(m=>m.kind==='igrejinha');
export function createPampulhaIgrejinha(data,options={}){
 try{return build(data,options);}catch(e){console.warn('Igrejinha da Pampulha não montada:',e);const root=new THREE.Group();root.name='Marcos_Pampulha_Igrejinha';return {root,obstacles:[],clearings:[],stats:{error:String(e)},update(){}};}
}
function build(data,{ground,mobile=false}={}){
 const root=new THREE.Group();root.name='Marcos_Pampulha_Igrejinha';
 const m=(data.scenery?.landmarks??[]).find(q=>q.kind==='igrejinha'),stats={mobile};
 if(!m)return {root,obstacles:[],clearings:[],stats,update(){}};
 const gAt=(x,y)=>{const g=ground?.(x,y);if(g!=null&&Number.isFinite(g))return g;return gridHeight(data.terrain,x,y)??m.ground??0;};
 // The floor: the ground's middle under the footprint (the site is level; the plinths reach below the low side).
 const F0=frame(m.x,m.y,0,m.heading),under=[];for(let u=-11;u<=13;u+=3)for(let v=-14;v<=14;v+=3){const p=F0(u,v,0);under.push(gAt(p[0],p[1]));}
 under.sort((a,b)=>a-b);const zf=under[under.length>>1]+.08,L=frame(m.x,m.y,zf,m.heading),rand=random(3127);
 const U={igFlood:{value:Array.from({length:MAX_FLOODS},()=>new THREE.Vector4())},igFloodCol:{value:Array.from({length:MAX_FLOODS},()=>new THREE.Vector3())},igNight:{value:0}};
 const tex={pastilha:pastilhaTexture(),concrete:concreteTexture(),stone:stoneTexture(),mural:muralTexture(),site:siteTexture()};
 const g=REG.glazing,glowRect=[g[0]/AW,1-g[3]/AH,g[2]/AW,1-g[1]/AH];
 const materials={
  vault:washed(new THREE.MeshStandardMaterial({name:'Igrejinha_pastilhas',map:tex.pastilha,vertexColors:true,roughness:.55,metalness:0,envMapIntensity:.7}),U,'vault'),
  mural:washed(new THREE.MeshStandardMaterial({name:'Igrejinha_azulejos',map:tex.mural,vertexColors:true,roughness:.28,metalness:0,alphaTest:.5,side:THREE.DoubleSide}),U,'mural',{glowRect}),
  concrete:washed(new THREE.MeshStandardMaterial({name:'Igrejinha_concreto',map:tex.concrete,vertexColors:true,roughness:.85,metalness:0}),U,'concrete'),
  stone:washed(new THREE.MeshStandardMaterial({name:'Igrejinha_pedra',map:tex.stone,vertexColors:true,roughness:.6,metalness:0}),U,'stone'),
  paint:washed(new THREE.MeshStandardMaterial({name:'Igrejinha_pintura',vertexColors:true,roughness:.5,metalness:.15}),U,'paint'),
  site:new THREE.MeshStandardMaterial({name:'Igrejinha_jardim',map:tex.site,vertexColors:true,roughness:.92,metalness:0,alphaHash:true,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2})
 };
 const SIZES={concrete:6,stone:1.8},T=Object.fromEntries(Object.keys(materials).map(k=>[k,new Batch(SIZES[k]??0)]));
 const cream=lin(0xe4dccb),white=[1,1,1];
 // Tiles: barely weathered (a well-kept monument): broad soft patches, a little dust low down and on the crowns.
 const tile=p=>{const z=p[2]-zf,k=.95+.07*fbm(p[0]/5+p[2]*.1,p[1]/5)-.05*Math.max(0,1-z/.8);return [k*.9,k*.95,k];};
 const creamAt=p=>{const k=.93+.08*fbm(p[0]/3.1,p[1]/3.1+p[2]*.2)-.07*Math.max(0,1-(p[2]-zf)/.6);return mul(cream,k);};
 const NA=mobile?14:30,NAS=mobile?10:18;

 // ---------- A parabolic vault: sections sec(k) = {u, v, hw, h} for k 0..1 along it (straight sides, linear taper).
 // The shell (smooth normals, pastilha UVs in metres), its feet sunk 0.5 m (a cream foot band), and at each end
 // (rim:{k, r, depth}) the cream rim's face and soffit and the recessed end wall, filled by fill(sec, region2D).
 function vault(sec,{na,nl,ends=[]}){
  const P=(a,k)=>{const s=sec(k);return L(s.u+a*s.hw,s.v,s.h*(1-a*a));};
  const As=k=>{const s=sec(k),ae=Math.sqrt(1+.5/s.h),af=Math.sqrt(1-.22/s.h),list=[-ae];for(let i=0;i<=na;i++){const t=-1+2*i/na;list.push(af*t);}list.push(ae);return list;};
  const grid=[],nrm=[],uv=[];
  for(let j=0;j<=nl;j++){const k=j/nl,as=As(k),row=as.map(a=>P(a,k));grid.push(row);
   nrm.push(as.map(a=>{const e=1e-3,da=sub(P(a+e,k),P(a-e,k)),dk=sub(P(a,Math.min(1,k+e)),P(a,Math.max(0,k-e)));let n=unit(cross(da,dk));if(n[2]<0&&Math.abs(a)<.9||Math.abs(a)>=.9&&dot(n,sub(P(a,k),P(0,k)))<0)n=mul(n,-1);return n;}));
   let s=0;uv.push(row.map((p,i)=>{if(i)s+=Math.hypot(...sub(p,row[i-1]));return s;}));}
  const along=j=>Math.abs(sec(j/nl).v-sec(0).v);
  const W=grid[0].length;
  for(let j=0;j<nl;j++)for(let i=0;i<W-1;i++){
   const foot=i===0||i===W-2,b=foot?T.concrete:T.vault,sz=foot?6:1.2,off=foot?.015:0;
   const q=[[j,i],[j,i+1],[j+1,i+1],[j+1,i]],pts=q.map(([a,c])=>off?[grid[a][c][0]+nrm[a][c][0]*off,grid[a][c][1]+nrm[a][c][1]*off,grid[a][c][2]+nrm[a][c][2]*off]:grid[a][c]);
   b.quad(...pts,foot?creamAt:tile,null,q.map(([a,c])=>[uv[a][c]/sz,along(a)/sz]),q.map(([a,c])=>nrm[a][c]));
  }
  for(const e of ends){
   const s=sec(e.k),dir=e.k?-1:1,out=sub(L(0,dir,0),L(0,0,0)),r=e.r,hwi=s.hw-r,hi=s.h-r,ae=Math.sqrt(1+.5/s.h),n=Math.max(8,na);
   const O=[],I=[];for(let i=0;i<=n;i++){const a=-ae+2*ae*i/n;O.push([a*s.hw,s.h*(1-a*a)]);I.push([a*hwi,hi*(1-a*a)]);}
   const at=(p,dv)=>L(s.u+p[0],s.v+dir*dv,p[1]);
   for(let i=0;i<n;i++){
    T.concrete.quad(at(O[i],0),at(O[i+1],0),at(I[i+1],0),at(I[i],0),creamAt,out);
    const mid=[(I[i][0]+I[i+1][0])/2,(I[i][1]+I[i+1][1])/2],inward=sub(L(s.u,s.v,0),L(s.u+mid[0],s.v,mid[1]));
    T.concrete.quad(at(I[i],0),at(I[i+1],0),at(I[i+1],-e.depth),at(I[i],-e.depth),creamAt,inward);
   }
   // The end wall: the region inside the rim's inner curve (closed under the floor), set back by depth.
   const region=[...I.map(p=>[p[0],Math.max(p[1],-.5)])];
   e.fill?.(region,p=>at(p,-e.depth),out,s,hwi,hi);
  }
  return grid;
 }
 const fillWith=(batch,uvOf,col=white)=>(region,to3,out,s,hwi,hi)=>batch.flat(region,to3,col,out,p=>uvOf(p,s,hwi,hi));

 // ---------- The nave: from the front arch (v 11.7) to its end over the altar (v -7.2), tapering in plan and height.
 const VF=11.7,VR=-7.2,nave=k=>({u:lerp(4.07,3.32,k),v:lerp(VF,VR,k),hw:lerp(7.45,4.65,k),h:lerp(9.5,6.9,k)});
 const MARQ=3.3,brise=regUv(REG.brise),glaze=regUv(REG.glazing);
 vault(nave,{na:NA,nl:mobile?3:8,ends:[
  {k:0,r:.55,depth:.4,fill:(region,to3,out,s,hwi,hi)=>{
   // Above the marquise the louvers, under it the glazed entrance.
   T.mural.flat(clipZ(region,MARQ,hi+1),to3,white,out,p=>brise((p[0]+hwi)/(2*hwi),(p[1]-MARQ)/(hi-MARQ)));
   T.mural.flat(clipZ(region,-.5,MARQ),to3,white,out,p=>glaze((p[0]+hwi)/(2*hwi),clamp(p[1]/MARQ,0,1)));
   // The louvers' frame: a white mullion line at the marquise, an upright at the middle.
   const o=unit(out),Lf=(x,z)=>{const q=to3([x,z]);return [q[0]+o[0]*.04,q[1]+o[1]*.04,q[2]];},xh=hwi*Math.sqrt(Math.max(0,1-(MARQ+.12)/hi));T.concrete.quad(Lf(-xh,MARQ-.05),Lf(xh,MARQ-.05),Lf(xh,MARQ+.12),Lf(-xh,MARQ+.12),cream,out);
  }},
  {k:1,r:.22,depth:.12,fill:fillWith(T.vault,(p)=>[p[0]/1.2,p[1]/1.2],tile)}]});
 // Werneck's ribbon along both sides of the nave, 2.5 cm proud of the tiles, z 0.6..3.05, over most of its length.
 {const band=regUv(REG.band),Z0=.6,Z1=3.05,nz=mobile?3:5,nk=mobile?6:14,k0=.03,k1=.86;
  for(const sd of [-1,1])for(let j=0;j<nk;j++)for(let i=0;i<nz;i++){
   const pt=(kk,z)=>{const s=nave(kk),a=sd*Math.sqrt(Math.max(0,1-z/s.h)),n=unit([2*s.h*a/s.hw,1]);return L(s.u+a*s.hw+n[0]*.025,s.v,z+n[1]*.025);};
   const ka=lerp(k0,k1,j/nk),kb=lerp(k0,k1,(j+1)/nk),za=lerp(Z0,Z1,i/nz),zb=lerp(Z0,Z1,(i+1)/nz),ta=(ka-k0)/(k1-k0),tb=(kb-k0)/(k1-k0),fa=(za-Z0)/(Z1-Z0),fb=(zb-Z0)/(Z1-Z0);
   const tt=t=>sd>0?t:1-t,o=sub(L(sd,0,.4),L(0,0,0));
   T.mural.quad(pt(ka,za),pt(kb,za),pt(kb,zb),pt(ka,zb),white,o,[band(tt(ta),fa),band(tt(tb),fa),band(tt(tb),fb),band(tt(ta),fb)]);
  }}

 // ---------- The four rear vaults: the panel on their back ends (v at the cadastre's rear line), frosted grids in front.
 const vRear=u=>-14.39+(u+11.17)/24.06*-.46,vFront=u=>u<0?lerp(-6.03,-6.46,(u+11.2)/9.87):lerp(-6.5,-6.64,(u-7.97)/5.12);
 const panel=regUv(REG.panel),frosted=regUv(REG.frosted);
 for(const R of REAR){
  const c=(R.u0+R.u1)/2,hw=(R.u1-R.u0)/2,v0=R.name==='C'?-6.8:vFront(c),v1=vRear(c),sec=k=>({u:c,v:lerp(v0,v1,k),hw,h:R.h});
  const ends=[{k:1,r:.3,depth:.16,fill:(region,to3,out)=>T.mural.flat(region,to3,white,out,p=>panel((c+p[0]-PANEL.u0)/(PANEL.u1-PANEL.u0),clamp(p[1]/PANEL.z1,0,1)))}];
  if(R.name!=='C')ends.push({k:0,r:.28,depth:.18,fill:(region,to3,out,s,hwi)=>{
   T.mural.flat(region,to3,white,out,p=>frosted((p[0]+3)/6,clamp(p[1]/5,0,1)));
   // A door in the outer small vault (west), as in the photos.
   if(R.name==='A'){const D=(x,z)=>{const q=to3([x,z]);const o=unit(out);return [q[0]+o[0]*.03,q[1]+o[1]*.03,q[2]];};T.paint.quad(D(.2,0),D(1.3,0),D(1.3,2.3),D(.2,2.3),lin(0x7a4a26),out);T.paint.quad(D(.12,2.3),D(1.38,2.3),D(1.38,2.4),D(.12,2.4),lin(0xe8e6e0),out);}
  }});
  vault(sec,{na:R.name==='C'?NA:NAS,nl:mobile?1:2,ends});
 }

 // ---------- The marquise: a thin slab at 3.3 m from the entrance to the tower, on slender white posts.
 {const plan=[[-11.9,10.4],[-1.7,10.4],[-1.7,11.95],[5.78,11.95],[5.78,14.85],[-11.9,14.85]],z0=MARQ,z1=MARQ+.28,to=z=>p=>L(p[0],p[1],z);
  T.concrete.flat(plan,to(z1),cream,[0,0,1],p=>[p[0]/6,p[1]/6]);T.concrete.flat(plan,to(z0),mul(cream,.92),[0,0,-1],p=>[p[0]/6,p[1]/6]);
  for(let i=0;i<plan.length;i++){const a=plan[i],b=plan[(i+1)%plan.length],o=edgeOut(a,b);T.concrete.quad(L(a[0],a[1],z0),L(b[0],b[1],z0),L(b[0],b[1],z1+.12),L(a[0],a[1],z1+.12),cream,sub(L(o[0],o[1],0),L(0,0,0)));}
  for(const u of [-9.4,-6.2,-1.4,3.2])T.paint.post(L(u,14.3,-.3),L(u,14.3,z0),.075,.06,mobile?5:8,lin(0xf2f1ec));}

 // ---------- The bell tower: beige stone slab, the outer (west) side leaning out to 2.4 m at the top, the narrow faces
 // a blue diamond lattice (the bell seen through it), a cap.
 {const TH=14,ui=-11.9,uo=z=>-13.09-1.2*z/TH,va=12.3,vb=14.86,lat=regUv(REG.lattice),stoneCol=p=>{const k=.95+.08*fbm(p[0]*.7,p[2]*.3);return [k,k,k];};
  // Broad faces (east vertical, west leaning) in stone; the narrow faces' stone borders and the lattice between.
  T.stone.quad(L(ui,va,-.5),L(ui,vb,-.5),L(ui,vb,TH),L(ui,va,TH),stoneCol,sub(L(1,0,0),L(0,0,0)));
  T.stone.quad(L(uo(-.5),va,-.5),L(uo(-.5),vb,-.5),L(uo(TH),vb,TH),L(uo(TH),va,TH),stoneCol,sub(L(-1,0,.08),L(0,0,0)));
  const B=.16;for(const v of [va,vb]){const o=sub(L(0,v===vb?1:-1,0),L(0,0,0));
   T.stone.quad(L(ui-B,v,-.5),L(ui,v,-.5),L(ui,v,TH),L(ui-B,v,TH),stoneCol,o);T.stone.quad(L(uo(-.5),v,-.5),L(uo(-.5)+B,v,-.5),L(uo(TH)+B,v,TH),L(uo(TH),v,TH),stoneCol,o);
   T.stone.quad(L(uo(-.5),v,-.5),L(ui,v,-.5),L(ui,v,.6),L(uo(.6),v,.6),stoneCol,o);
   const Z0=.6,Z1=TH-.4;T.mural.quad(L(uo(Z0)+B,v,Z0),L(ui-B,v,Z0),L(ui-B,v,Z1),L(uo(Z1)+B,v,Z1),white,o,[lat(0,0),lat(1,0),lat(1,1),lat(0,1)]);
   T.stone.quad(L(uo(Z1),v,Z1),L(ui,v,Z1),L(ui,v,TH),L(uo(TH),v,TH),stoneCol,o);}
  T.stone.quad(L(ui,va,TH),L(ui,vb,TH),L(uo(TH),vb,TH),L(uo(TH),va,TH),stoneCol,[0,0,1]);
  // The bell under the cap, and its yoke.
  const bc=L((ui+uo(12.6))/2,(va+vb)/2,0);T.paint.post([bc[0],bc[1],zf+12.2],[bc[0],bc[1],zf+12.95],.38,.18,mobile?6:10,lin(0x6b5530));T.paint.box(L,(ui+uo(13))/2-.05,(ui+uo(13))/2+.05,va+.1,vb-.1,13.05,13.15,lin(0x2c2c2c));}

 // ---------- The steel cross in the forecourt east of the front, parallel to the façade.
 {const cu=16.3,cv=13.3,col=lin(0x33435e);T.paint.box(L,cu-.11,cu+.11,cv-.11,cv+.11,-.3,8.4,col);T.paint.box(L,cu-1.65,cu+1.65,cv-.1,cv+.1,6,6.2,col);
  T.paint.box(L,cu-.3,cu+.3,cv-.3,cv+.3,-.1,.04,lin(0x6c6c66));}

 // ---------- The site on the ground: one textured mesh following the ground, cells inside the outline, cut at the lap.
 const lap=lapSpace(data);
 {const site=regUvSite(),step=mobile?4:2,grid=new Map(),key=(i,j)=>i*4096+j,F=frame(m.x,m.y,0,m.heading);
  const vtx=(i,j)=>{const k=key(i,j);let q=grid.get(k);if(!q){const u=SITE.u0+i*step,v=SITE.v0+j*step,p=F(u,v,0);q=[p[0],p[1],gAt(p[0],p[1])+.05,u,v];grid.set(k,q);}return q;};
  const ni=Math.ceil((SITE.u1-SITE.u0)/step),nj=Math.ceil((SITE.v1-SITE.v0)/step),grass=p=>{const k=.97+.06*fbm(p[0]/7,p[1]/7);return [k,k,k];};
  // A corner is free 0.35 m behind the walls' backs; cells near them split into pieces (0.67 m, 1 m on phones), so the
  // lawn meets the wall; cells deep in the road go at once.
  const free=(x,y,margin)=>!lap.at(x,y).some(h=>Math.abs(h.lat)<h.back+margin),deep=(x,y)=>lap.at(x,y).some(h=>Math.abs(h.lat)<h.back-step),cut={whole:0,pieces:0,dropped:0};
  for(let i=0;i<ni;i++)for(let j=0;j<nj;j++){
   const corners=[[i,j],[i+1,j],[i+1,j+1],[i,j+1]].map(([a,b])=>vtx(a,b));if(!corners.some(q=>inside(q[3],q[4],SITE_EDGE)))continue;
   for(const q of corners)if(q[5]===undefined){q[5]=free(q[0],q[1],step*.75+.4);q[6]=deep(q[0],q[1]);}
   if(corners.every(q=>q[6])){cut.dropped++;continue;}
   if(corners.every(q=>q[5])){T.site.quad(...corners.map(q=>q.slice(0,3)),grass,[0,0,1],corners.map(q=>site(q[3],q[4])));cut.whole++;continue;}
   const n=mobile?step:3;for(let a=0;a<n;a++)for(let b=0;b<n;b++){
    const sub=[[a,b],[a+1,b],[a+1,b+1],[a,b+1]].map(([da,db])=>{const u=SITE.u0+(i+da/n)*step,v=SITE.v0+(j+db/n)*step,p=F(u,v,0);return [p[0],p[1],gAt(p[0],p[1])+.05,u,v];});
    if(sub.every(q=>free(q[0],q[1],.35))){T.site.quad(...sub.map(q=>q.slice(0,3)),grass,[0,0,1],sub.map(q=>site(q[3],q[4])));cut.pieces++;}else cut.dropped++;}
  }
  stats.siteCut=cut;}

 // ---------- Night: uplights at the foot (building frame u, v, z; colour; strength).
 const FLOODS=[[-8.4,-20,.3,[1,.9,.78],2.4],[3.3,-20.4,.3,[1,.92,.8],3.2],[10.5,-20,.3,[1,.9,.78],2.2],[1,22,.3,[.92,.96,1],2],[9,22,.3,[.92,.96,1],1.8],[21,1,.3,[1,.93,.82],2.4],[-17,1,.3,[1,.93,.82],2.4],[-8,19,.3,[1,.95,.85],2.2]];
 FLOODS.forEach(([u,v,z,c,s],i)=>{const p=L(u,v,z);U.igFlood.value[i].set(p[0],p[2],-p[1],s);U.igFloodCol.value[i].set(...c);});
 const night=lightUniforms(),fixtures=FLOODS.map(([u,v,z,c])=>({p:L(u,v,z+.15),c,i:.9,s:.18,g:0,on:.3,ph:0}));
 const glow=nightLights(fixtures,night,{name:'Igrejinha_refletores',minPx:1.6,floor:.5,fogKeep:.5});root.add(glow.mesh);
 for(const f of FLOODS)T.paint.box(frame(...L(f[0],f[1],0).slice(0,2),zf,m.heading+Math.atan2(-f[1],-f[0])),-.14,.14,-.12,.12,-.2,.22,lin(0x4a4e52));

 // ---------- Driving space: no vertex over the lap's asphalt and walls, up to DRIVE metres above the road.
 const drive={checked:0,violations:0,worst:null};
 for(const [k,b] of Object.entries(T))for(let v=0;v<b.p.length;v+=3){
  const x=b.p[v],y=-b.p[v+2],z=b.p[v+1];drive.checked++;
  for(const h of lap.at(x,y)){const over=z-h.road;if(Math.abs(h.lat)<h.back+.3&&over>-.05&&over<DRIVE){drive.violations++;if(!drive.worst||Math.abs(h.lat)<Math.abs(drive.worst.lat))drive.worst={material:k,s:+h.s.toFixed(1),lat:+h.lat.toFixed(2),over:+over.toFixed(2)};}}
 }
 let drawCalls=1,triangles=0;const parts={};
 for(const [k,b] of Object.entries(T)){if(!b.vertices)continue;root.add(b.mesh('Igrejinha_'+k,materials[k],k!=='site'&&k!=='mural'));drawCalls++;triangles+=b.triangles;parts[k]=b.triangles;}
 root.updateMatrixWorld(true);

 // ---------- Camera proxies (nave, rear vaults, tower) and the trees cleared off the square and the gardens.
 const obstacles=[],prism=(plan,z1,name)=>{const B=new Batch(),pts=plan.map(([u,v])=>L(u,v,0));for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];B.quad([a[0],a[1],zf-1],[b[0],b[1],zf-1],[b[0],b[1],zf+z1],[a[0],a[1],zf+z1],white);}B.flat(plan,p=>L(p[0],p[1],z1),white,[0,0,1]);const o=B.mesh('Igrejinha_obstaculo_'+name,new THREE.MeshBasicMaterial(),false);o.updateMatrixWorld(true);obstacles.push(o);};
 prism([[-3.4,11.7],[-1.3,-7],[8,-7],[11.5,11.7]],8.6,'nave');prism([[-11.2,-6],[13.1,-6.6],[12.9,-14.85],[-11.2,-14.4]],5.6,'fundos');prism([[-14.3,12.3],[-11.9,12.3],[-11.9,14.86],[-14.3,14.86]],14,'torre');
 const clearings=[];for(let u=-20;u<=24;u+=6)for(let v=-25;v<=22;v+=6){const p=L(u,v,0);clearings.push({x:p[0],y:p[1],r:6});}
 // From the lap, 110 m before the closest point to 70 m after it: no tree between the car and the church (circles
 // along each sight line, from the wall to 16 m short of the church's middle).
 {const A=data.samples,mid=L(1,-3,0);let best=0;A.forEach((p,i)=>{if(Math.hypot(p[1]-mid[0],p[2]-mid[1])<Math.hypot(A[best][1]-mid[0],A[best][2]-mid[1]))best=i;});
  const s0=A[best][0];stats.lapClosest={s:+s0.toFixed(1),distance:+Math.hypot(A[best][1]-mid[0],A[best][2]-mid[1]).toFixed(1)};
  for(const p of A){if(p[0]<s0-110||p[0]>s0+70||Math.round(p[0])%10>1)continue;const dx=mid[0]-p[1],dy=mid[1]-p[2],d=Math.hypot(dx,dy);
   for(let t=p[4]/2+3;t<d-16;t+=7)clearings.push({x:p[1]+dx/d*t,y:p[2]+dy/d*t,r:5});}}
 const centre=L(1,0,0);

 // 0 by day; dusk (.45) brings the uplights up; full at night.
 let lit=0;
 function setNight(level){lit=level;U.igNight.value=level>0?(level>=.99?1:.55):0;night.uNight.value=level;glow.mesh.visible=level>0;stats.night=level;}
 Object.assign(stats,{drawCalls,triangles,trianglesK:Math.round(triangles/1000),parts,driveSpace:drive,clearings:clearings.length,cameraObstacles:obstacles.length,
  floor:+zf.toFixed(2),centre:centre.map(v=>+v.toFixed(1)),floods:FLOODS.length,night:0});
 return {root,obstacles,clearings,stats,setNight,update(dt){if(lit>0){night.uTime.value+=dt;night.uScreen.value=screenHalf(mobile);}}};
}
// The site plan's UVs from the building's frame.
const regUvSite=()=>(u,v)=>[(u-SITE.u0)/(SITE.u1-SITE.u0),(v-SITE.v0)/(SITE.v1-SITE.v0)];
