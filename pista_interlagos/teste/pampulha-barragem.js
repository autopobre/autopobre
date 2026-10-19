import * as THREE from 'three';
import {canvasTexture} from './pit-textures.js';
import {guardrailClearance,guardrailPresent} from './physics.js';
import {branchSpace} from './branch-layout.js';
import {lightUniforms,nightLights,screenHalf} from './sea-water.js';

// The Barragem da Pampulha under the lap's dam stretch and its spillways (data.scenery.landmarks point kinds 'barragem'
// and 'vertedouro', gerar_pampulha.py). Facts from the city's dam emergency plan (PAE Barragem da Pampulha, Sudecap,
// table 3.1: homogeneous earth dam of 1936-38, rebuilt 1954-58; crest at 805 m (5 m local), 400 m long and 19 m wide,
// at most 18 m high; slopes 1V:2H to 1V:3.5H upstream, 1V:2H to 1V:2.5H downstream; normal water level 801 m) and
// measured on the city's 2015 orthophoto (BHGeo ORTOFOTO_2015, 10-20 cm) with OSM (way 627559665 waterway=dam, the
// footway "Calçada Compartilhada na Barragem", the BRT and Av. Dom Pedro I bridges), research 2026-10-18. The lap runs
// down the crest on Av. Dom Pedro I with the lake on its right:
// - the upstream face: the stone rip-rap from below the water up to the crest, the shared path along its top with its
//   kerb and railing, lamp posts on the path (draped on the ground the game draws, which already has the slope).
// - the downstream face: the mown grass slope down to the valley 15 m below (as photographed in 2018: the drainage
//   channels running down it at a slant, the berm's bare band, the toe drain), the long bar railing on its crest.
// - the main spillway (2002): a side channel on the left (north) abutment, a 33.2 m free weir at 801 m along the
//   shore in 8 bays under the plaza's curved deck on piers (Commons "Pampulha 2018 03 10": the deck's fascia and
//   railing, the piers in the water, the level gauge). The game's lake stands at 800.8 m, so the weir is drawn 10 cm
//   under it and a thin sheet always pours over the lip and falls into the dark channel behind (animated). The track
//   file brings the lake to the weir's face (gerar_pampulha.py VERTEDOURO_*), the lake's surface stops there
//   (meta.lake_cuts, sea-water.js); the channel under the deck is the module's own (its 5 m grid climbs back to the
//   plaza inside most bays): floor, back and end walls and the water in it are drawn first, then a seal across the
//   bays' mouths writes only depth (renderOrder .2), so the ground drawn after it (open-circuit.js terrainMesh,
//   renderOrder .25) never shows through them; from above the deck covers it all.
// - the tulip (the 1940s morning-glory spillway): a 12.5 m concrete ring in the lake (lip at 801.5 m) round its dark
//   funnel, the 2019 footbridge from the shore with the gate's hoist on its platform.
// - below the dam, 50 m east of the lap: the galleries' headwall at the valley floor, the stilling basin churning
//   white (animated) and the Ribeirão Pampulha flowing on east under the bridges.
// - the BRT MOVE busway and Av. Dom Pedro I northbound cross the valley beside the dam on two long low bridges
//   (OSM bridge=yes, 220 m; their decks between the embankments' levels): concrete decks on pier pairs, Jersey
//   barriers, lamp posts, lane paint. Kept simple.
// Everything is merged per material (a draw call each); nothing enters the lap's driving space (checked per vertex).
// After dark the lamp posts on the crest, the bridges and the spillway's deck light up (glowing sprites).

const DRIVE=4.6;
function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
// Linear colours (vertex colours are linear): an sRGB hex scaled by k.
const lin=(hex,k=1)=>{const c=new THREE.Color(hex);return [c.r*k,c.g*k,c.b*k];};
const mul=(c,k)=>[c[0]*k,c[1]*k,c[2]*k];
const mix=(a,b,u)=>[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u,a[2]+(b[2]-a[2])*u];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),lerp=(a,b,u)=>a+(b-a)*u;
// Value noise for tone that never repeats.
const hash=(i,j)=>{const h=Math.sin(i*127.1+j*311.7)*43758.5453;return h-Math.floor(h);};
function noise(x,y){const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,su=u*u*(3-2*u),sv=v*v*(3-2*v);return (hash(i,j)*(1-su)+hash(i+1,j)*su)*(1-sv)+(hash(i,j+1)*(1-su)+hash(i+1,j+1)*su)*sv;}
const fbm=(x,y)=>.55*noise(x,y)+.3*noise(x*2.1+5.2,y*2.1+1.3)+.15*noise(x*4.3+9.1,y*4.3+7.7);
function gridHeight(g,x,y){
 if(!g)return null;const fx=(x-g.x0)/g.step,fy=(y-g.y0)/g.step;if(fx<0||fy<0||fx>g.nx-1||fy>g.ny-1)return null;
 const i=Math.min(g.nx-2,Math.floor(fx)),j=Math.min(g.ny-2,Math.floor(fy)),u=fx-i,v=fy-j,k=j*g.nx+i;
 return (g.z[k]*(1-u)+g.z[k+1]*u)*(1-v)+(g.z[k+g.nx]*(1-u)+g.z[k+g.nx+1]*u)*v;
}
// A polyline by arc length: the point, the unit tangent and its left normal at d metres from the start.
function polyline(pts){
 const ds=[0];for(let i=1;i<pts.length;i++)ds.push(ds[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
 const L=ds[ds.length-1];
 const at=d=>{d=clamp(d,0,L);let i=0;while(i<pts.length-2&&ds[i+1]<d)i++;const a=pts[i],b=pts[i+1],l=ds[i+1]-ds[i]||1,u=(d-ds[i])/l,t=[(b[0]-a[0])/l,(b[1]-a[1])/l];return {p:[lerp(a[0],b[0],u),lerp(a[1],b[1],u)],t,n:[-t[1],t[0]]};};
 return {L,at};
}

// ---------- Geometry gathered per material in track coordinates, drawn as one mesh (flat-shaded triangles)
// UVs: given per corner, or metres over `size` (level faces x and y, walls the run along them and z).
class Batch{
 constructor(size=0){this.size=size;this.p=[];this.n=[];this.c=[];this.t=[];}
 get vertices(){return this.p.length/3;}
 get triangles(){return this.p.length/9;}
 tri(a,b,c,col,uv){
  const n=cross(sub(b,a),sub(c,a)),l=Math.hypot(n[0],n[1],n[2]);if(l<1e-9)return;const nx=n[0]/l,ny=n[1]/l,nz=n[2]/l,q=[a,b,c];
  for(let i=0;i<3;i++){
   const p=q[i],k=typeof col==='function'?col(p):col;this.p.push(p[0],p[2],-p[1]);this.n.push(nx,nz,-ny);this.c.push(k[0],k[1],k[2]);
   let s=0,t=0;if(uv)[s,t]=uv[i];else if(this.size){if(Math.abs(nz)>.7){s=p[0]/this.size;t=p[1]/this.size;}else{const h=Math.hypot(nx,ny)||1;s=(-ny*p[0]+nx*p[1])/h/this.size;t=p[2]/this.size;}}
   this.t.push(s,t);
  }
 }
 // A planar quad a-b-c-d turned to face `out` when given.
 quad(a,b,c,d,col,out,uv){
  if(out&&dot(cross(sub(c,a),sub(d,b)),out)<0){[b,d]=[d,b];if(uv)uv=[uv[0],uv[3],uv[2],uv[1]];}
  this.tri(a,b,c,col,uv&&[uv[0],uv[1],uv[2]]);this.tri(a,c,d,col,uv&&[uv[0],uv[2],uv[3]]);
 }
 // A planar polygon (concave allowed) facing out.
 poly(pts,col,out){
  if(pts.length<3)return;const N=unit(out),S=unit(Math.abs(N[2])<.9?cross([0,0,1],N):cross([1,0,0],N)),V=cross(N,S);
  const flat=pts.map(p=>new THREE.Vector2(dot(p,S),dot(p,V)));if(Math.abs(THREE.ShapeUtils.area(flat))<1e-6)return;
  for(const [i,j,k] of THREE.ShapeUtils.triangulateShape(flat,[])){let a=pts[i],b=pts[j],c=pts[k];if(dot(cross(sub(b,a),sub(c,a)),N)<0)[b,c]=[c,b];this.tri(a,b,c,col);}
 }
 // Rows of points (each a polyline across, the same count) joined into quads facing `out` (up by default).
 strip(rows,col,out=[0,0,1]){for(let i=0;i+1<rows.length;i++){const a=rows[i],b=rows[i+1];if(!a||!b)continue;for(let j=0;j+1<a.length;j++)this.quad(a[j],a[j+1],b[j+1],b[j],col,out);}}
 // A box with its base corners a0..a3 (a plan quad, any orientation) from z0 to z1, faces turned away from its centre.
 prism(plan,z0,z1,col,{top=true,bottom=false}={}){
  const c=[0,0];for(const p of plan){c[0]+=p[0]/plan.length;c[1]+=p[1]/plan.length;}const C=[c[0],c[1],(z0+z1)/2];
  for(let i=0;i<plan.length;i++){const a=plan[i],b=plan[(i+1)%plan.length],A=[a[0],a[1],z0],B=[b[0],b[1],z0],B1=[b[0],b[1],z1],A1=[a[0],a[1],z1];this.quad(A,B,B1,A1,col,sub([(a[0]+b[0])/2,(a[1]+b[1])/2,C[2]],C));}
  if(top)this.poly(plan.map(p=>[p[0],p[1],z1]),col,[0,0,1]);if(bottom)this.poly(plan.map(p=>[p[0],p[1],z0]),col,[0,0,-1]);
 }
 // An oriented box: centre (x, y), its length along unit direction t, its width across, from z0 to z1.
 obox(x,y,t,len,wid,z0,z1,col,opts){const n=[-t[1],t[0]],a=len/2,b=wid/2;this.prism([[x-t[0]*a-n[0]*b,y-t[1]*a-n[1]*b],[x+t[0]*a-n[0]*b,y+t[1]*a-n[1]*b],[x+t[0]*a+n[0]*b,y+t[1]*a+n[1]*b],[x-t[0]*a+n[0]*b,y-t[1]*a+n[1]*b]],z0,z1,col,opts);}
 // A bar from p to q (any direction), w × h across, open ends (a rail).
 bar(p,q,w,h,col){
  const d=unit(sub(q,p)),e1=unit(Math.abs(d[2])>.99?[1,0,0]:cross(d,[0,0,1])),e2=cross(e1,d);
  const o=(P,i,j)=>[P[0]+e1[0]*i*w/2+e2[0]*j*h/2,P[1]+e1[1]*i*w/2+e2[1]*j*h/2,P[2]+e1[2]*i*w/2+e2[2]*j*h/2];
  for(const [i0,j0,i1,j1] of [[-1,-1,1,-1],[1,-1,1,1],[1,1,-1,1],[-1,1,-1,-1]]){const A=o(p,i0,j0),B=o(p,i1,j1),m=[(i0+i1)/2,(j0+j1)/2];this.quad(A,B,o(q,i1,j1),o(q,i0,j0),col,[e1[0]*m[0]+e2[0]*m[1],e1[1]*m[0]+e2[1]*m[1],e1[2]*m[0]+e2[2]*m[1]]);}
}
 // An n-sided post from p (radius r0) to q (radius r1), any direction.
 post(p,q,r0,r1,n,col,{rot=0,top=true}={}){
  const d=unit(sub(q,p)),e1=unit(Math.abs(d[2])>.99?cross([0,1,0],d):cross(d,[0,0,1])),e2=cross(d,e1);
  const ring=(c,r)=>Array.from({length:n},(_,i)=>{const a=rot+i*2*Math.PI/n,x=Math.cos(a)*r,y=Math.sin(a)*r;return [c[0]+e1[0]*x+e2[0]*y,c[1]+e1[1]*x+e2[1]*y,c[2]+e1[2]*x+e2[2]*y];});
  const A=ring(p,r0),B=ring(q,r1);
  for(let i=0;i<n;i++){const j=(i+1)%n,m=sub([(A[i][0]+A[j][0])/2,(A[i][1]+A[j][1])/2,(A[i][2]+A[j][2])/2],p);this.quad(A[i],A[j],B[j],B[i],col,sub(m,mul(d,dot(m,d))));}
  if(top&&r1>0)this.poly(B,col,d);
 }
 mesh(name,material,shadow=true){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(this.t,2));g.computeBoundingSphere();
  const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.castShadow=shadow;mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;return mesh;
 }
}

// ---------- The lap: stations by s (centre, left normal, the walls' reach each side) and its driving space.
function lapStations(data){
 const A=data.samples,N=A.length,L=data.meta.reconstructed_xy_m;
 const back=(w,s,side)=>w/2+guardrailClearance(data,s,side)+(guardrailPresent(data,s,side)?.75:0);
 return s=>{
  s=((s%L)+L)%L;let lo=0,hi=N-1;while(hi-lo>1){const k=lo+hi>>1;if(A[k][0]<=s)lo=k;else hi=k;}
  const p=A[lo],q=A[(lo+1)%N],u=clamp((s-p[0])/(((lo+1<N)?q[0]:L)-p[0]||1),0,1),ip=k=>lerp(p[k],q[k],u),nl=Math.hypot(ip(9),ip(10))||1,tl=Math.hypot(ip(7),ip(8))||1,w=ip(4);
  // back: [right (lake), left (valley)], as lapSpace keeps them (lat < 0 right).
  return {s,x:ip(1),y:ip(2),z:ip(3),w,n:[ip(9)/nl,ip(10)/nl],t:[ip(7)/tl,ip(8)/tl],back:[back(w,s,-1),back(w,s,1)]};
 };
}
function lapSpace(data){
 // A branch road beside the lap (data.branches, branch-layout.js): its asphalt and walls are driving space too.
 const branch=branchSpace(data);
 const A=data.samples,N=A.length,CELL=8,cells=new Map(),key=(i,j)=>i*131071+j;
 const st=A.map(p=>{const tl=Math.hypot(p[7],p[8])||1,nl=Math.hypot(p[9],p[10])||1,q={s:p[0],x:p[1],y:p[2],z:p[3],cf:p[5],n:[p[9]/nl,p[10]/nl],back:[0,0]};for(const [k,side] of [[0,-1],[1,1]])q.back[k]=p[4]/2+guardrailClearance(data,p[0],side)+(guardrailPresent(data,p[0],side)?.75:0);q.t=[p[7]/tl,p[8]/tl];return q;});
 for(let i=0;i<N;i++){const p=st[i],q=st[(i+1)%N],r=Math.max(...p.back,...q.back)+2;
  for(let ci=Math.floor((Math.min(p.x,q.x)-r)/CELL);ci<=Math.floor((Math.max(p.x,q.x)+r)/CELL);ci++)for(let cj=Math.floor((Math.min(p.y,q.y)-r)/CELL);cj<=Math.floor((Math.max(p.y,q.y)+r)/CELL);cj++){const k=key(ci,cj);let l=cells.get(k);if(!l)cells.set(k,l=[]);l.push(i);}}
 function at(x,y){
  const list=cells.get(key(Math.floor(x/CELL),Math.floor(y/CELL))),out=branch.at(x,y);if(!list)return out;
  for(const i of list){const p=st[i],q=st[(i+1)%N],dx=q.x-p.x,dy=q.y-p.y,l2=dx*dx+dy*dy||1e-9;let u=((x-p.x)*dx+(y-p.y)*dy)/l2;if(u<-.3||u>1.3)continue;u=clamp(u,0,1);
   const nx=lerp(p.n[0],q.n[0],u),ny=lerp(p.n[1],q.n[1],u),lat=(x-p.x-dx*u)*nx+(y-p.y-dy*u)*ny,k=lat>=0?1:0;
   out.push({s:p.s,lat,road:lerp(p.z,q.z,u)+lerp(p.cf,q.cf,u)*lat,back:lerp(p.back[k],q.back[k],u)});}
  return out;
 }
 return {at};
}

// ---------- Textures (canvas; one repeat each)
const wrap=(w,h,x,y,s,fn)=>{for(const dx of [-w,0,w])for(const dy of [-h,0,h])if(x+dx+s>0&&x+dx-s<w&&y+dy+s>0&&y+dy-s<h)fn(x+dx,y+dy);};
function grain(ctx,amount,r){const img=ctx.getImageData(0,0,ctx.canvas.width,ctx.canvas.height),d=img.data;for(let i=0;i<d.length;i+=4){const n=(r()-.5)*amount;d[i]+=n;d[i+1]+=n;d[i+2]+=n;}ctx.putImageData(img,0,0);}
function blotches(ctx,w,h,r,count,light,dark,size,alpha){for(let k=0;k<count;k++){const x=r()*w,y=r()*h,s=size*(.3+r()),c=r()<.5?light:dark,a=alpha*(.4+r());wrap(w,h,x,y,s,(px,py)=>{const g=ctx.createRadialGradient(px,py,0,px,py,s);g.addColorStop(0,`rgba(${c},${a})`);g.addColorStop(1,`rgba(${c},0)`);ctx.fillStyle=g;ctx.fillRect(px-s,py-s,2*s,2*s);});}}
const TEX={
 // Cast concrete (6 m): pour lifts every 1.5 m, soft stains, grain.
 concrete:()=>canvasTexture((ctx,w,h)=>{const r=random(11),m=w/6;ctx.fillStyle='#d2cec5';ctx.fillRect(0,0,w,h);
  for(let y=0;y<h;y+=1.5*m){ctx.fillStyle='rgba(70,66,60,.10)';ctx.fillRect(0,y,w,2);ctx.fillStyle=`rgba(255,255,250,${.04+r()*.05})`;ctx.fillRect(0,y+2,w,1.5*m*.4);}
  blotches(ctx,w,h,r,70,'255,255,248','80,76,68',70,.06);grain(ctx,16,r);},512,512,true),
 // Rip-rap (3 m): angular gneiss blocks of 25-45 cm in grey and rust tones, dark gaps and soil between them.
 stone:()=>canvasTexture((ctx,w,h)=>{const r=random(29),m=w/3;ctx.fillStyle='#3f3a33';ctx.fillRect(0,0,w,h);blotches(ctx,w,h,r,40,'110,98,80','30,28,24',30,.3);
  const cell=.3*m;for(let j=0;j<h/cell;j++)for(let i=0;i<w/cell;i++){const cx=(i+.5+(r()-.5)*.5)*cell,cy=(j+.5+(r()-.5)*.5)*cell,rad=cell*(.42+r()*.16),n=5+(r()*3|0),a0=r()*6.3,tone=120+r()*80|0,warm=r()*18|0;
   const pts=Array.from({length:n},(_,k)=>{const a=a0+k*2*Math.PI/n+(r()-.5)*.6,rr=rad*(.75+r()*.3);return [Math.cos(a)*rr,Math.sin(a)*rr];});
   wrap(w,h,cx,cy,rad,(px,py)=>{ctx.beginPath();pts.forEach(([x,y],k)=>k?ctx.lineTo(px+x,py+y):ctx.moveTo(px+x,py+y));ctx.closePath();ctx.fillStyle=`rgb(${tone+warm},${tone+warm*.4|0},${tone-warm*.3|0})`;ctx.fill();
    // Lit from above: a light upper rim, a shadowed lower one.
    ctx.save();ctx.clip();const g=ctx.createLinearGradient(px,py-rad,px,py+rad);g.addColorStop(0,'rgba(255,255,250,.22)');g.addColorStop(.5,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.35)');ctx.fillStyle=g;ctx.fillRect(px-rad,py-rad,2*rad,2*rad);ctx.restore();});}
  grain(ctx,20,r);},512,512,true),
 // Mown grass (8 m): blades in light and dark, clover patches, faint mowing stripes.
 grass:()=>canvasTexture((ctx,w,h)=>{const r=random(37),m=w/8;ctx.fillStyle='#7d9a4a';ctx.fillRect(0,0,w,h);
  for(let x=0;x<w;x+=1.6*m){ctx.fillStyle='rgba(255,255,220,.05)';ctx.fillRect(x,0,.8*m,h);}
  blotches(ctx,w,h,r,60,'150,170,80','50,80,30',50,.18);
  for(let k=0;k<9000;k++){const x=r()*w,y=r()*h,l=2+r()*4,v=r();ctx.strokeStyle=v<.5?`rgba(40,70,25,${.25+r()*.3})`:`rgba(180,200,110,${.2+r()*.3})`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(r()-.5)*2,y-l);ctx.stroke();}
  grain(ctx,12,r);},512,512,true),
 // The crest's bar railing (one 2.5 m panel × 1.6 m): two rails and vertical bars, the rest cut out.
 fence:()=>canvasTexture((ctx,w,h)=>{ctx.clearRect(0,0,w,h);ctx.fillStyle='#9a9ea0';ctx.fillRect(0,4,w,8);ctx.fillRect(0,h-14,w,8);ctx.fillRect(0,0,6,h);
  for(let x=0;x<w;x+=w/20)ctx.fillRect(x,8,3,h-16);},256,160,true)
};

// ---------- Materials
const NOISE=`float bgH(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float bgN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(bgH(i),bgH(i+vec2(1,0)),f.x),mix(bgH(i+vec2(0,1)),bgH(i+vec2(1,1)),f.x),f.y);}`;
// Moving water: the vertex colour carries its parameters (r how white, g its speed ÷ 10 m/s, b its opacity), the UVs
// metres across (x) and down the flow (y). Streaks and boils drift down the flow at that speed (uBgTime), the white
// water froths where r is high; the rest is the lake's green-brown, a little see-through over the concrete.
// (opaque: the pour inside the spillway's bays, drawn before their seal; the same look. There a vertex opacity under .5
// marks the spray thrown up where the fall lands: only its white shows, the rest is cut away.)
function waterMaterial(U,opaque=false){
 const m=new THREE.MeshStandardMaterial({name:opaque?'Barragem_agua_queda':'Barragem_agua',vertexColors:true,roughness:.2,metalness:0,transparent:!opaque,depthWrite:opaque,side:THREE.DoubleSide});
 m.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,U);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vBgUv;').replace('#include <uv_vertex>','#include <uv_vertex>\nvBgUv=uv;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec2 vBgUv;uniform float uBgTime;
${NOISE}`).replace('#include <color_fragment>',`{float foam=vColor.r,spd=vColor.g*10.,t=uBgTime;vec2 q=vec2(vBgUv.x,vBgUv.y-t*spd);
float n=bgN(q*vec2(1.7,.5))*.6+bgN(q*vec2(4.3,1.3)+3.1)*.4;
float boil=bgN(vBgUv*.8+vec2(t*.6,-t*1.1))*bgN(vBgUv*2.1-vec2(t*1.3,t*.5))*2.2;
float white=clamp(foam*1.15-.3+(n-.5)*1.3+(boil-.35)*.7,0.,1.);white*=white*(3.-2.*white);
vec3 froth=mix(vec3(.55,.6,.6),vec3(.9,.92,.91),n);
diffuseColor.rgb=mix(vec3(.07,.1,.08)+vec3(.05,.06,.05)*n,froth,white);diffuseColor.a*=vColor.b*mix(.72,1.,white);${opaque?'if(vColor.b<.5&&white<.4)discard;':''}}`)
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.12,.85,clamp(vColor.r*1.2,0.,1.));');
 };
 m.customProgramCacheKey=()=>opaque?'pampulha-barragem-agua-queda-v1':'pampulha-barragem-agua-v1';
 return m;
}

// ---------- Measures (track coordinates: x east, y north, metres; z local = altitude − 800 m)
// OSM way 627559665 (waterway=dam): the embankment's axis, north to south.
const DAM_AXIS=[[1283,711],[1285,692],[1334,328],[1334,262]];
// The side channel spillway: its weir's lake edge (west to east) and the deck's back edge (2015 orthophoto, 10 cm).
const WEIR=[[1219.2,783.4],[1225,780],[1230,777],[1235,773.9],[1240,771.1],[1245,768.6],[1250,766.6],[1254.2,765.8]];
const DECK_BACK=[[1218.5,792],[1225,790],[1240,783.5],[1255.5,776.5],[1260.5,774]];
// The tulip: centre and radius (DN 12.54 m), its lip at 801.5 m; the footbridge to the shore.
const TULIP={c:[1239,713],r:6.27,lip:1.5,shore:[1269,751]};
// Below the dam: the galleries' headwall (facing east), the stilling basin and the Ribeirão Pampulha (OSM 11359860,
// culvert 720711335 under the bridges, 720711334 on east).
const OUTLET={x:1352.6,y:697,basin:[1353,1390],half:5.5};
const STREAM=[[1428,689],[1460,692],[1500,696],[1540,704]];
// The two bridges east of the dam (OSM 292968632 Rua República Socialista do Vietnã, Av. Dom Pedro I northbound,
// 4 lanes; 292968636 the BRT MOVE busway, 2 lanes).
const BRIDGES=[{name:'pedro_i',pts:[[1392.8,494],[1400,600],[1407.3,718]],w:15.6,asphalt:true,lanes:4,
  ends:[[[1392.8,494],[1384,374],[1385,352],[1385,338],[1390,326],[1397,316]],[[1407.3,718],[1410,739],[1411,767],[1408,784],[1394,820]]]},
 {name:'brt',pts:[[1379.8,494],[1384,560],[1397,718]],w:9.6,asphalt:false,lanes:2,
  ends:[[[1379.8,494],[1371,350],[1370,336]],[[1397,718],[1396,739],[1398,763],[1394,780],[1386,792],[1372,810]]]}];

export const hasPampulhaBarragem=data=>(data.scenery?.landmarks??[]).some(m=>m.kind==='barragem'||m.kind==='vertedouro');
export function createPampulhaBarragem(data,options={}){
 try{return build(data,options);}catch(e){console.warn('Barragem da Pampulha não montada:',e);const root=new THREE.Group();root.name='Marcos_Pampulha_Barragem';return {root,obstacles:[],clearings:[],stats:{error:String(e)},update(){}};}
}
function build(data,{ground,mobile=false}={}){
 const root=new THREE.Group();root.name='Marcos_Pampulha_Barragem';
 const marks=(data.scenery?.landmarks??[]).filter(m=>m.kind==='barragem'||m.kind==='vertedouro'),stats={mobile,landmarks:marks.length};
 if(!marks.length)return {root,obstacles:[],clearings:[],stats,update(){}};
 const gAt=(x,y)=>{const g=ground?.(x,y);if(g!=null&&Number.isFinite(g))return g;return gridHeight(data.terrain,x,y)??0;};
 const level=data.meta.sea_level_m??.8,station=lapStations(data),lap=lapSpace(data),rand=random(8123);
 const U={uBgTime:{value:0}};
 const tex={concrete:TEX.concrete(),stone:TEX.stone(),grass:TEX.grass(),fence:TEX.fence()};
 const materials={
  concrete:new THREE.MeshStandardMaterial({name:'Barragem_concreto',map:tex.concrete,vertexColors:true,roughness:.9,metalness:0}),
  riprap:new THREE.MeshStandardMaterial({name:'Barragem_enrocamento',map:tex.stone,vertexColors:true,roughness:.95,metalness:0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),
  grass:new THREE.MeshStandardMaterial({name:'Barragem_talude',map:tex.grass,vertexColors:true,roughness:.95,metalness:0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),
  // Paint and paving laid on the ground or a deck: pulled toward the eye.
  paving:new THREE.MeshStandardMaterial({name:'Barragem_pavimento',vertexColors:true,roughness:.88,metalness:0,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}),
  metal:new THREE.MeshStandardMaterial({name:'Barragem_metal',vertexColors:true,roughness:.42,metalness:.55}),
  fence:new THREE.MeshStandardMaterial({name:'Barragem_gradil',map:tex.fence,vertexColors:true,alphaTest:.5,side:THREE.DoubleSide,roughness:.5,metalness:.45}),
  water:waterMaterial(U),pour:waterMaterial(U,true),
  // The spillway bays' seal: depth only (see the header).
  seal:new THREE.MeshBasicMaterial({name:'Barragem_vedacao',colorWrite:false})
 };
 const SIZES={concrete:6,riprap:3,grass:8},T=Object.fromEntries(Object.keys(materials).map(k=>[k,new Batch(SIZES[k]??0)]));
 const lights=[],clearings=[],count=()=>Object.values(T).reduce((s,b)=>s+b.triangles,0),tris={};
 const C={concrete:lin(0xd8d4ca),dark:lin(0x2a2c2a),shade:lin(0x5c5a55),steel:lin(0x8e9496),grey:lin(0x6c7174),lamp:lin(0xfff4dc,1.4),asphalt:lin(0x4a4b4d),white:lin(0xeeeeea),yellow:lin(0xe3b628)};
 const lamp=(p,c=[1,.86,.62],i=1.2,s=.22,on=.25)=>lights.push({p,c,i,s,g:0,on,ph:rand()});
 const part=(name,fn)=>{const before=count();try{stats[name]=fn()??true;}catch(e){console.warn('Barragem da Pampulha, parte não montada:',name,e);stats[name]={error:String(e)};}tris[name]=count()-before;};

 // ---------- The dam's faces along the lap: per station, the ground's profile across each side.
 // Lake side (right): the crest's edge where the ground starts to fall, the rip-rap's foot under the water. Valley side
 // (left): the crest's edge and the toe where the slope levels out. Medians and means along the lap keep them smooth.
 const DS=mobile?5:2.5,S0=15935,S1=16445,rows=[];
 for(let s=S0;s<=S1+1e-6;s+=DS){
  const st=station(s),probe=(side,r)=>{const k=side<0?-r:r;return gAt(st.x+st.n[0]*k,st.y+st.n[1]*k);};
  const lake={from:st.back[0]+.4},vale={from:st.back[1]+.4};
  lake.crest=probe(-1,lake.from);for(let r=lake.from;r<lake.from+45;r+=.5){if(lake.top==null&&probe(-1,r)<lake.crest-.5)lake.top=r-.5;if(lake.top!=null&&probe(-1,r)<level-1.2){lake.foot=r;break;}}
  vale.crest=probe(1,vale.from);let low=Infinity,lowAt=null;
  for(let r=vale.from;r<vale.from+70;r+=.5){const g=probe(1,r);if(vale.top==null&&g<vale.crest-.5)vale.top=r-.5;if(g<low-.05){low=g;lowAt=r;}
   if(vale.top!=null&&vale.toe==null&&g<vale.crest-3&&probe(1,r)-probe(1,r+3)<.35)vale.toe=r;}
  vale.toe??=lowAt;vale.drop=vale.crest-(vale.toe!=null?probe(1,vale.toe):vale.crest);
  rows.push({s,st,lake,vale});
 }
 const smooth=(get,set)=>{const v=rows.map(get),k=mobile?1:2;rows.forEach((r,i)=>{const w=[];for(let j=i-k;j<=i+k;j++){const x=v[clamp(j,0,v.length-1)];if(x!=null)w.push(x);}if(v[i]==null||w.length<2)return;w.sort((a,b)=>a-b);set(r,w[w.length>>1]);});
  const m=rows.map(get);rows.forEach((r,i)=>{if(m[i]==null)return;let a=0,n=0;for(let j=i-k;j<=i+k;j++){const x=m[clamp(j,0,m.length-1)];if(x!=null){a+=x;n++;}}set(r,a/n);});};
 smooth(r=>r.lake.top,(r,v)=>r.lake.top=v);smooth(r=>r.lake.foot,(r,v)=>r.lake.foot=v);smooth(r=>r.vale.top,(r,v)=>r.vale.top=v);smooth(r=>r.vale.toe,(r,v)=>r.vale.toe=v);
 // Never closer to the lap than its walls' reach.
 for(const r of rows){if(r.lake.top!=null)r.lake.top=Math.max(r.lake.top,r.lake.from+.6);if(r.vale.top!=null)r.vale.top=Math.max(r.vale.top,r.vale.from+.8);}
 const at=(r,side,d,dz=0)=>{const k=side<0?-d:d,x=r.st.x+r.st.n[0]*k,y=r.st.y+r.st.n[1]*k;return [x,y,gAt(x,y)+dz];};
 const half=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2];

 // ---------- Upstream: the rip-rap, the shared path on the crest, its kerb, railing and lamps.
 part('upstream',()=>{
  const NR=mobile?5:9,stone=[],path=[],kerb=[];let railPrev=null,length=0,lamps=0;
  const stoneTone=p=>{const z=p[2]-level,k=.92+.16*fbm(p[0]/6,p[1]/6);
   // Dry stones above the wash line, a dark wet band round the water, green slime under it.
   const dry=lin(0xf2ece0,k),wet=lin(0x8e8874,k),slime=lin(0x76805a,k*.8);return z>.55?dry:z>-.05?mix(wet,dry,clamp((z+.05)/.6,0,1)):mix(slime,wet,clamp((z+.8)/.75,0,1));};
  for(const r of rows){
   const L=r.lake,ok=L.top!=null&&L.foot!=null&&L.foot-L.top>2&&L.foot-L.top<26&&L.top-L.from<16;
   if(!ok){stone.push(null);path.push(null);kerb.push(null);railPrev=null;continue;}
   length+=DS;
   stone.push(Array.from({length:NR+1},(_,j)=>at(r,-1,lerp(Math.max(L.from,L.top-.2),L.foot+.6,j/NR),.12)));
   // The path (3.6 m of grey concrete) up to the crest's edge, with the kerb along its lake side.
   const p0=Math.max(L.from,L.top-3.8),p1=L.top-.25;path.push(p1-p0>.8?[0,.5,1].map(u=>at(r,-1,lerp(p0,p1,u),.07)):null);
   kerb.push([at(r,-1,p1,.07),at(r,-1,p1,.24),at(r,-1,p1+.28,.24),at(r,-1,p1+.28,.02)]);
   // The railing on the kerb: posts every 2.5 m, two rails (mobile: the top rail only).
   const rp=at(r,-1,p1+.14,.24);
   T.metal.bar(rp,[rp[0],rp[1],rp[2]+1.1],.06,.06,C.steel);
   if(railPrev){for(const h of mobile?[1.08]:[.55,1.08])T.metal.bar([railPrev[0],railPrev[1],railPrev[2]+h],[rp[0],rp[1],rp[2]+h],.05,.05,C.steel);}
   railPrev=rp;
   // A lamp post every 30 m at the path's road side: 9 m, one arm over the path toward the road, LED head.
   if(Math.abs(((r.s-15950)%30+30)%30)<DS/2&&p0+.3<p1){const b=at(r,-1,p0+.35,.07),d=[r.st.n[0],r.st.n[1]],top=[b[0],b[1],b[2]+9],arm=[b[0]+d[0]*1.6,b[1]+d[1]*1.6,b[2]+9.25];
    T.metal.post(b,top,.11,.07,8,C.grey);T.metal.bar(top,arm,.08,.08,C.grey);T.metal.obox(arm[0],arm[1],d,.75,.32,arm[2]-.16,arm[2]+.02,C.dark);
    lamp([arm[0],arm[1],arm[2]-.22]);lamps++;}
  }
  T.riprap.strip(stone,stoneTone);T.paving.strip(path,p=>mul(lin(0xb9b4aa),.9+.12*fbm(p[0]/3,p[1]/3)));
  // The kerb: its top and lake face, joined station to station.
  for(let i=0;i+1<kerb.length;i++){const a=kerb[i],b=kerb[i+1];if(!a||!b)continue;T.concrete.quad(a[1],a[2],b[2],b[1],C.concrete,[0,0,1]);T.concrete.quad(a[2],a[3],b[3],b[2],C.concrete,sub(a[3],a[0]));T.concrete.quad(a[0],a[1],b[1],b[0],C.concrete,sub(a[0],a[3]));}
  // No trees on the face nor on the path.
  for(let i=0;i<rows.length;i+=mobile?1:2){const r=rows[i];if(r.lake.top==null)continue;const p=at(r,-1,(r.lake.top+(r.lake.foot??r.lake.top+6))/2);clearings.push({x:p[0],y:p[1],r:9});}
  return {length,lamps};
 });

 // ---------- Downstream: the grass face, its slanting drains, the berm's band, the toe drain and the crest's railing.
 part('downstream',()=>{
  const NR=mobile?6:12,face=[],fence=[];let length=0,maxDrop=0;
  for(const r of rows){
   const V=r.vale,ok=V.top!=null&&V.toe!=null&&V.drop>3&&V.toe-V.top>4;
   if(!ok){face.push(null);fence.push(null);continue;}
   length+=DS;maxDrop=Math.max(maxDrop,V.drop);
   face.push(Array.from({length:NR+1},(_,j)=>at(r,1,lerp(Math.max(V.from,V.top-.6),V.toe+3,j/NR),.1)));
   fence.push(at(r,1,Math.max(V.from+.1,V.top-.35),0));
  }
  // The grass's tone: noise patches, the berm's bare band a quarter of the way up (the 2018 photos), greener low down.
  T.grass.strip(face,p=>{const k=.66+.26*fbm(p[0]/9,p[1]/9),y=fbm(p[0]/23+4,p[1]/23);return [k*(1+.1*y),k*.93,k*(.66-.08*y)];});
  // Re-colour the berm band: a second pass, the strip of soil laid over the grass (a few cm higher).
  const band=face.map(row=>row&&[.7,.76].map(u=>{const j=u*(row.length-1),a=row[Math.floor(j)],b=row[Math.min(row.length-1,Math.floor(j)+1)],f=j-Math.floor(j);return [lerp(a[0],b[0],f),lerp(a[1],b[1],f),lerp(a[2],b[2],f)+.04];}));
  T.paving.strip(band,p=>mul(lin(0x8c7b63),.85+.2*fbm(p[0]/4,p[1]/4)));
  // The railing panels (2.5 m bars) on the crest's edge, and the toe drain.
  for(let i=0;i+1<fence.length;i++){const a=fence[i],b=fence[i+1];if(!a||!b)continue;const l=Math.hypot(b[0]-a[0],b[1]-a[1]),u0=i*DS/2.5,u1=u0+l/2.5;
   T.fence.quad(a,b,[b[0],b[1],b[2]+1.6],[a[0],a[1],a[2]+1.6],[1,1,1],null,[[u0,0],[u1,0],[u1,1],[u0,1]]);}
  const toe=face.map((row,i)=>row&&[at(rows[i],1,rows[i].vale.toe-.4,.14),at(rows[i],1,rows[i].vale.toe+.4,.14)]);
  T.paving.strip(toe,lin(0xa9a59b));
  // Concrete drains down the face every 40 m, slanting 35° off the fall line (the photographs' diagonals).
  let drains=0;
  for(let s=S0+20;s<S1-10;s+=40){
   const r0=rows.reduce((a,r)=>Math.abs(r.s-s)<Math.abs(a.s-s)?r:a);const V=r0.vale;if(V.top==null||V.toe==null||V.drop<3)continue;
   const n=mobile?6:12,pts=[];for(let k=0;k<=n;k++){const d=lerp(V.top,V.toe,k/n),st=station(s+(d-V.top)*.7),x=st.x+st.n[0]*d,y=st.y+st.n[1]*d;pts.push([x,y]);}
   const strip=[];for(let k=0;k<pts.length;k++){const a=pts[Math.max(0,k-1)],b=pts[Math.min(pts.length-1,k+1)],t=unit([b[0]-a[0],b[1]-a[1],0]),nn=[-t[1],t[0]],p=pts[k];
    strip.push([-.35,0,.35].map(o=>[p[0]+nn[0]*o,p[1]+nn[1]*o,gAt(p[0]+nn[0]*o,p[1]+nn[1]*o)+.16-(o===0?.06:0)]));}
   T.paving.strip(strip,lin(0x9d988c));drains++;}
  for(let i=0;i<rows.length;i+=mobile?1:2){const r=rows[i],V=r.vale;if(V.top==null||V.toe==null||V.drop<3)continue;for(const u of [.3,.75]){const p=at(r,1,lerp(V.top,V.toe,u));clearings.push({x:p[0],y:p[1],r:8});}}
  return {length,maxDrop:+maxDrop.toFixed(1),drains};
 });

 // ---------- The side channel spillway: the weir in 8 bays, the piers, the plaza's curved deck, the pouring water.
 part('spillway',()=>{
  const W=polyline(WEIR),bays=8,crest=level-.1,zBed=-2.7,deckZ=Math.max(...DECK_BACK.map(p=>gAt(p[0],p[1])))+.08,soffit=deckZ-.85;
  const pierW=.9,bay=W.L/bays;
  // The deck: a slab from the weir's edge back to the plaza (its top level with the plaza), fascia and soffit.
  const front=[];for(let k=0;k<=24;k++){const q=W.at(k/24*W.L);front.push([q.p[0]-q.n[0]*.25,q.p[1]-q.n[1]*.25]);}
  const plan=[...front,...[...DECK_BACK].reverse()];
  T.concrete.poly(plan.map(p=>[p[0],p[1],deckZ]),mul(C.concrete,.95),[0,0,1]);T.concrete.poly(plan.map(p=>[p[0],p[1],soffit]),C.shade,[0,0,-1]);
  for(let k=0;k+1<front.length;k++){const a=front[k],b=front[k+1],q=W.at((k+.5)/24*W.L);T.concrete.quad([a[0],a[1],soffit],[b[0],b[1],soffit],[b[0],b[1],deckZ],[a[0],a[1],deckZ],C.concrete,[-q.n[0],-q.n[1],0]);}
  // Where the plaza round the deck lies lower, the slab's back edges stand on a low wall down into the ground.
  const mid=plan.reduce((a,p)=>[a[0]+p[0]/plan.length,a[1]+p[1]/plan.length],[0,0]);
  for(let k=0;k+1<DECK_BACK.length;k++){const a=DECK_BACK[k],b=DECK_BACK[k+1],z0=Math.min(gAt(...a),gAt(...b))-.3;if(z0<deckZ-.1)T.concrete.quad([a[0],a[1],z0],[b[0],b[1],z0],[b[0],b[1],deckZ],[a[0],a[1],deckZ],C.concrete,[(a[0]+b[0])/2-mid[0],(a[1]+b[1])/2-mid[1],0]);}
  for(const [a,b] of [[front[0],DECK_BACK[0]],[DECK_BACK[DECK_BACK.length-1],front[front.length-1]]]){const z0=Math.min(gAt(...a),gAt(...b),soffit)-.3;T.concrete.quad([a[0],a[1],z0],[b[0],b[1],z0],[b[0],b[1],deckZ],[a[0],a[1],deckZ],C.concrete,[(a[0]+b[0])/2-mid[0],(a[1]+b[1])/2-mid[1],0]);}
  // The deck's paving (the plaza's pink and grey) and its railing along the curve.
  T.paving.poly(plan.map(p=>[p[0],p[1],deckZ+.02]),mul(lin(0xb39a92),.95),[0,0,1]);
  let prev=null;for(let k=0;k<=24;k++){const q=W.at(k/24*W.L),p=[q.p[0]+q.n[0]*.05,q.p[1]+q.n[1]*.05,deckZ];T.metal.bar(p,[p[0],p[1],p[2]+1.1],.06,.06,C.steel);if(prev)for(const h of [.5,1.08])T.metal.bar([prev[0],prev[1],prev[2]+h],[p[0],p[1],p[2]+h],.05,.05,C.steel);prev=p;}
  // The piers and the two end blocks (from the bed to the soffit), the level gauge on the east one.
  for(let i=0;i<=bays;i++){const q=W.at(i*bay),end=i===0||i===bays,c=[q.p[0]+q.n[0]*1.2,q.p[1]+q.n[1]*1.2];
   T.concrete.obox(c[0],c[1],q.t,end?2.2:pierW,2.9,zBed,soffit,end?C.concrete:mul(C.concrete,.97),{top:false});
   if(i===bays-1){const f=[q.p[0]-q.n[0]*.27,q.p[1]-q.n[1]*.27];for(let b=0;b<12;b++){const z0=-.4+b*.25,c0=b%2?C.white:lin(0xc23a2a),e=.18;T.paving.quad([f[0]-q.t[0]*e,f[1]-q.t[1]*e,z0],[f[0]+q.t[0]*e,f[1]+q.t[1]*e,z0],[f[0]+q.t[0]*e,f[1]+q.t[1]*e,z0+.25],[f[0]-q.t[0]*e,f[1]-q.t[1]*e,z0+.25],c0,[-q.n[0],-q.n[1],0]);}}}
  // The weir between the piers: its upstream face, the rounded crest 10 cm under the lake, the ogee falling into
  // the channel (2.4 m inward), all in the deck's shadow; the sheet over the lip and its white fall in every bay.
  const OGEE=[[0,crest],[.35,crest+.04],[.75,crest-.15],[1.2,crest-.8],[1.7,crest-1.9],[2.4,zBed+.2]],P=(q,v,z)=>[q.p[0]+q.n[0]*v,q.p[1]+q.n[1]*v,z];
  const SHEET=[[0,crest+.13,.04,.08,.6],[.35,crest+.18,.25,.18,.8],[.75,crest-.04,.45,.3,.85],[1.2,crest-.68,.6,.45,.9],[1.7,crest-1.78,.75,.55,.92],[2.4,zBed+.42,.95,.3,.95]];
  // (How many bays the ground itself leaves open past 2 m in, for the record: the track file's channel.)
  let ground=0;
  for(let i=0;i<bays;i++){
   const d0=i*bay+pierW/2,d1=(i+1)*bay-pierW/2,n=4;
   let top=-Infinity;for(let k=0;k<=4;k++){const q=W.at(lerp(d0,d1,k/4));top=Math.max(top,gAt(q.p[0]+q.n[0]*2,q.p[1]+q.n[1]*2));}if(top<crest-.2)ground++;
   for(let k=0;k<n;k++){const qa=W.at(lerp(d0,d1,k/n)),qb=W.at(lerp(d0,d1,(k+1)/n)),ua=lerp(d0,d1,k/n),ub=lerp(d0,d1,(k+1)/n);
    T.concrete.quad(P(qa,0,zBed),P(qb,0,zBed),P(qb,0,crest),P(qa,0,crest),C.concrete,[-qa.n[0],-qa.n[1],0]);
    for(let j=0;j+1<OGEE.length;j++)T.concrete.quad(P(qa,OGEE[j][0],OGEE[j][1]),P(qb,OGEE[j][0],OGEE[j][1]),P(qb,OGEE[j+1][0],OGEE[j+1][1]),P(qa,OGEE[j+1][0],OGEE[j+1][1]),j<2?C.concrete:C.shade,[-qa.n[0]*.3,-qa.n[1]*.3,1]);
    for(let j=0;j+1<SHEET.length;j++){const A=SHEET[j],B=SHEET[j+1],va=A[0]+Math.abs(A[1]-crest)*.8,vb=B[0]+Math.abs(B[1]-crest)*.8;
     T.pour.quad(P(qa,A[0],A[1]),P(qb,A[0],A[1]),P(qb,B[0],B[1]),P(qa,B[0],B[1]),[lerp(A[2],B[2],.5),lerp(A[3],B[3],.5),lerp(A[4],B[4],.5)],null,[[ua,va],[ub,va],[ub,vb],[ua,vb]]);}
    // The spray where the fall lands, thrown up past the lip into the bay's mouth (two ragged white curtains rising,
    // thinner as they climb): what the lake side sees of the pour, the fall itself hiding behind the crest.
    // (Its pattern 2.4 times finer than the water's: spray, not boils.)
    for(const [v,top,ph] of [[2.55,crest+1.05,0],[3.3,crest+.7,7.3]]){const z0=zBed+.45,foam=p=>[clamp(1.05-(p[2]-z0)/(top-z0)*.85,.2,1),.22,.3],f=2.4;
     T.pour.quad(P(qa,v,z0),P(qb,v,z0),P(qb,v,top),P(qa,v,top),foam,null,[[(ua+ph)*f,z0*f],[(ub+ph)*f,z0*f],[(ub+ph)*f,top*f],[(ua+ph)*f,top*f]]);}
   }
  }
  // The channel behind the weir, along all of it and past the piers' backs: its floor, back wall and the two end walls
  // up to the soffit, the water boiling below the fall and running east along it to the galleries' intake (its streaks
  // along the channel). Every ray through a bay's mouth ends on one of these: the seal keeps the ground out.
  const BACK=8.2,M=24,VIN=2.4,VOUT=BACK-.1,run=[[VIN,zBed+.42,.95,.3],[4.6,zBed+.5,.88,.24],[VOUT,zBed+.48,.62,.18]];
  for(let k=0;k<M;k++){const qa=W.at(k/M*W.L),qb=W.at((k+1)/M*W.L),ua=k/M*W.L,ub=(k+1)/M*W.L;
   T.concrete.quad(P(qa,VIN,zBed+.2),P(qb,VIN,zBed+.2),P(qb,BACK,zBed+.2),P(qa,BACK,zBed+.2),C.dark,[0,0,1]);
   T.concrete.quad(P(qa,BACK,zBed+.2),P(qb,BACK,zBed+.2),P(qb,BACK,soffit),P(qa,BACK,soffit),mul(C.shade,.62),[-qa.n[0],-qa.n[1],0]);
   for(let j=0;j+1<run.length;j++){const A=run[j],B=run[j+1];
    T.pour.quad(P(qa,A[0],A[1]),P(qb,A[0],A[1]),P(qb,B[0],B[1]),P(qa,B[0],B[1]),[lerp(A[2],B[2],.5),lerp(A[3],B[3],.5),.95],null,[[A[0],ua],[A[0],ub],[B[0],ub],[B[0],ua]]);}
   // The seal: the mouths from the crest up to the soffit, 2 cm in front of the lip.
   T.seal.quad(P(qa,-.02,crest),P(qb,-.02,crest),P(qb,-.02,soffit),P(qa,-.02,soffit),[0,0,0],[-qa.n[0],-qa.n[1],0]);
  }
  for(const [d,o] of [[0,1],[W.L,-1]]){const q=W.at(d);T.concrete.quad(P(q,2.6,zBed),P(q,BACK,zBed),P(q,BACK,soffit),P(q,2.6,soffit),mul(C.shade,.7),[q.t[0]*o,q.t[1]*o,0]);}
  // Lamps on the deck's railing (three bollard heads, warm).
  for(const d of [.2,.5,.8]){const q=W.at(d*W.L),p=[q.p[0]+q.n[0]*1.2,q.p[1]+q.n[1]*1.2,deckZ];T.metal.post(p,[p[0],p[1],p[2]+3.6],.07,.05,8,C.grey);T.metal.post([p[0],p[1],p[2]+3.6],[p[0],p[1],p[2]+3.95],.2,.2,10,C.lamp);lamp([p[0],p[1],p[2]+3.8],[1,.82,.55],.9,.18);}
  return {weir:+W.L.toFixed(1),bays,openBays:bays,groundOpenBays:ground,sealed:true,crest:+crest.toFixed(2),deck:+deckZ.toFixed(2)};
 });

 // ---------- The tulip in the lake and its footbridge.
 part('tulip',()=>{
  const {c,r,lip}=TULIP,n=mobile?20:36,zBed=-3,ring=(rad,z)=>Array.from({length:n},(_,i)=>{const a=i/n*2*Math.PI;return [c[0]+Math.cos(a)*rad,c[1]+Math.sin(a)*rad,z];});
  const outer=ring(r,zBed),outerTop=ring(r,lip-.15),rim=ring(r-.45,lip),inner=ring(r-1,lip-.2),throat=ring(2.6,-2.4),deep=ring(2.2,-6);
  for(let i=0;i<n;i++){const j=(i+1)%n,out=[Math.cos((i+.5)/n*2*Math.PI),Math.sin((i+.5)/n*2*Math.PI),0],inn=[-out[0],-out[1],0];
   T.concrete.quad(outer[i],outer[j],outerTop[j],outerTop[i],C.concrete,out);T.concrete.quad(outerTop[i],outerTop[j],rim[j],rim[i],C.concrete,[out[0],out[1],1]);
   T.concrete.quad(rim[i],rim[j],inner[j],inner[i],mul(C.concrete,.9),[inn[0],inn[1],1]);T.concrete.quad(inner[i],inner[j],throat[j],throat[i],C.shade,[inn[0],inn[1],.6]);T.concrete.quad(throat[i],throat[j],deep[j],deep[i],C.dark,inn);}
  T.concrete.poly(deep.map(p=>[p[0],p[1],-6]),lin(0x101210),[0,0,1]);
  // The footbridge: 2.4 m deck from the ring's platform (2.4 m local) up to the shore, posts every 6 m, railings.
  const dx=TULIP.shore[0]-c[0],dy=TULIP.shore[1]-c[1],D=Math.hypot(dx,dy),t=[dx/D,dy/D],nn=[-t[1],t[0]],zs=gAt(...TULIP.shore)+.05,z0=lip+.9,start=r-1.6;
  const P=(d,v,z)=>[c[0]+t[0]*d+nn[0]*v,c[1]+t[1]*d+nn[1]*v,z],zAt=d=>lerp(z0,zs,clamp((d-start)/(D-start),0,1));
  for(let d=start,k=0;d<D-1e-6;d+=3,k++){const e=Math.min(D,d+3);for(const [v0,v1,z,o] of [[-1.2,1.2,0,[0,0,1]],[-1.2,1.2,-.35,[0,0,-1]]])T.concrete.quad(P(d,v0,zAt(d)+z),P(e,v0,zAt(e)+z),P(e,v1,zAt(e)+z),P(d,v1,zAt(d)+z),C.concrete,o);
   for(const v of [-1.2,1.2]){T.concrete.quad(P(d,v,zAt(d)-.35),P(e,v,zAt(e)-.35),P(e,v,zAt(e)+.08),P(d,v,zAt(d)+.08),C.concrete,[nn[0]*v,nn[1]*v,0]);
    const a=P(d,v*.95,zAt(d)),b=P(e,v*.95,zAt(e));T.metal.bar([a[0],a[1],a[2]+1.05],[b[0],b[1],b[2]+1.05],.05,.05,C.steel);T.metal.bar([a[0],a[1],a[2]+.5],[b[0],b[1],b[2]+.5],.04,.04,C.steel);T.metal.bar(a,[a[0],a[1],a[2]+1.05],.05,.05,C.steel);}
   if(k%2===1&&d<D-4){const p=P(d,0,zAt(d)-.35);T.concrete.post([p[0],p[1],zBed],p,.32,.32,8,C.concrete);}}
  // The platform over the rim and the gate's hoist: two posts, a beam, the motor box (the 2019-20 renovation).
  const pc=P(r-1.2,0,z0);T.concrete.obox(pc[0],pc[1],t,3.2,3.4,z0-.35,z0,C.concrete);T.concrete.post([pc[0],pc[1],zBed],[pc[0],pc[1],z0-.35],.45,.45,8,C.concrete);
  for(const v of [-1.1,1.1]){const b=P(r-1.2,v,z0);T.metal.bar(b,[b[0],b[1],z0+2.6],.14,.14,lin(0x3d6e8c));}
  {const a=P(r-1.2,-1.1,z0+2.6),b=P(r-1.2,1.1,z0+2.6);T.metal.bar(a,b,.18,.18,lin(0x3d6e8c));const m=P(r-1.2,0,z0+2.6);T.metal.obox(m[0],m[1],nn,.8,.6,m[2]+.09,m[2]+.65,lin(0xd9a321));}
  for(const v of [-1.7,1.7]){const a=P(r-2.8,v,z0),b=P(r+.4,v,z0);T.metal.bar([a[0],a[1],z0+1.05],[b[0],b[1],z0+1.05],.05,.05,C.steel);}
  clearings.push({x:TULIP.shore[0],y:TULIP.shore[1],r:6});
  return {diameter:+(2*r).toFixed(2),lip,footbridge:+(D-start).toFixed(1)};
 });

 // ---------- Below the dam: the galleries' headwall, the stilling basin and the stream.
 part('outlet',()=>{
  const {x,y,basin,half}=OUTLET,gH=gAt(x+1.5,y),zTop=gH+9;
  // The headwall: a block into the toe of the slope, two dark mouths (the side channel's 5.5 × 7.5 m gallery and the
  // tulip's 3 m horseshoe), wing walls flaring out to the basin's walls.
  T.concrete.prism([[x-4,y-half-1.5],[x,y-half-1.5],[x,y+half+1.5],[x-4,y+half+1.5]],gH-1,zTop,C.concrete);
  const mouth=(y0,y1,h)=>T.paving.quad([x+.03,y0,gH+.2],[x+.03,y1,gH+.2],[x+.03,y1,gH+.2+h],[x+.03,y0,gH+.2+h],lin(0x0c0d0c),[1,0,0]);
  mouth(y-half+.4,y-half+5.9,5.6);mouth(y+1.2,y+4.2,3);
  // The basin's walls along both sides (following the ground) and its water: white from the mouths, settling east.
  const N=mobile?8:16,wall=[],water=[];
  for(let k=0;k<=N;k++){const xx=lerp(basin[0],basin[1],k/N),gs=[gAt(xx,y-half),gAt(xx,y),gAt(xx,y+half)],gm=Math.min(...gs);
   wall.push([gs[0],gs[2]]);water.push([-half+.3,-half/2,0,half/2,half-.3].map(o=>{const p=[xx,y+o,Math.max(gAt(xx,y+o),gm)+.4];return p;}));}
  for(let k=0;k<N;k++){const xa=lerp(basin[0],basin[1],k/N),xb=lerp(basin[0],basin[1],(k+1)/N);
   for(const [side,i] of [[-1,0],[1,1]]){const yy=y+side*half,za=wall[k][i],zb=wall[k+1][i];T.concrete.obox((xa+xb)/2,yy+side*.2,[1,0],xb-xa,.4,Math.min(za,zb)-1.2,Math.max(za,zb)+1.4,C.concrete);}}
  for(let k=0;k<N;k++){const a=water[k],b=water[k+1],ua=a[0][0]-basin[0],ub=b[0][0]-basin[0];
   for(let j=0;j+1<a.length;j++){const f=u=>clamp(1-u/(basin[1]-basin[0])*.75,.2,1);T.water.quad(a[j],a[j+1],b[j+1],b[j],[f(ua),.16,.95],[0,0,1],[[a[j][1],ua],[a[j+1][1],ua],[b[j+1][1],ub],[b[j][1],ub]]);}}
  // The jets out of the mouths: falling white tongues 6 m out.
  for(const [y0,y1,h] of [[y-half+.4,y-half+5.9,1.2],[y+1.2,y+4.2,.9]]){const z0=gH+.2+h,z1=Math.max(gAt(x+6,(y0+y1)/2),gH-.5)+.45;
   T.water.quad([x+.05,y0,z0],[x+.05,y1,z0],[x+6,y1,z1],[x+6,y0,z1],[1,.35,.95],[0,0,1],[[y0,0],[y1,0],[y1,6],[y0,6]]);}
  // The culvert's mouth under the bridges and the open stream beyond, on east.
  T.concrete.prism([[basin[1],y-half-1],[basin[1]+1.2,y-half-1],[basin[1]+1.2,y+half+1],[basin[1],y+half+1]],gAt(basin[1],y)-1,gAt(basin[1],y)+3.4,C.concrete);
  T.paving.quad([basin[1]-.02,y-2.2,gAt(basin[1],y)+.3],[basin[1]-.02,y+2.2,gAt(basin[1],y)+.3],[basin[1]-.02,y+2.2,gAt(basin[1],y)+2.8],[basin[1]-.02,y-2.2,gAt(basin[1],y)+2.8],lin(0x0c0d0c),[-1,0,0]);
  const S=polyline(STREAM),M=Math.ceil(S.L/(mobile?8:4)),bank=[];let v=0;
  for(let k=0;k<=M;k++){const q=S.at(k/M*S.L),w=2.6;bank.push([-w,0,w].map(o=>{const px=q.p[0]+q.n[0]*o,py=q.p[1]+q.n[1]*o;return [px,py,gAt(px,py)+.3];}));}
  for(let k=0;k<M;k++){const va=v,vb=v+=S.L/M;for(let j=0;j<2;j++)T.water.quad(bank[k][j],bank[k][j+1],bank[k+1][j+1],bank[k+1][j],[.12,.1,.85],[0,0,1],[[j*2.6,va],[(j+1)*2.6,va],[(j+1)*2.6,vb],[j*2.6,vb]]);}
  // The ground round the basin and along the stream kept clear of trees.
  for(let xx=basin[0];xx<=basin[1];xx+=8)clearings.push({x:xx,y,r:9});for(let k=0;k<=S.L;k+=10){const q=S.at(k);clearings.push({x:q.p[0],y:q.p[1],r:5});}
  return {headwall:+gH.toFixed(1),basin:basin[1]-basin[0]};
 });

 // ---------- The BRT and Av. Dom Pedro I bridges across the valley.
 part('bridges',()=>{
  const out=[];
  for(const b of BRIDGES){
   const P=polyline(b.pts),a0=P.at(0),a1=P.at(P.L),ext=3,zA=gAt(a0.p[0]-a0.t[0]*ext,a0.p[1]-a0.t[1]*ext),zB=gAt(a1.p[0]+a1.t[0]*ext,a1.p[1]+a1.t[1]*ext);
   const zAt=d=>lerp(zA,zB,d/P.L),hw=b.w/2,step=mobile?12:6,n=Math.ceil(P.L/step);let low=Infinity;
   for(let k=0;k<n;k++){const da=k/n*P.L,db=(k+1)/n*P.L,qa=P.at(da),qb=P.at(db),Q=(q,d,v,z)=>[q.p[0]+q.n[0]*v,q.p[1]+q.n[1]*v,zAt(d)+z];
    // Deck top (asphalt or the busway's concrete), the box girder's sides and soffit.
    T.paving.quad(Q(qa,da,-hw,0),Q(qb,db,-hw,0),Q(qb,db,hw,0),Q(qa,da,hw,0),b.asphalt?C.asphalt:lin(0x9c978d),[0,0,1]);
    for(const v of [-1,1]){T.concrete.quad(Q(qa,da,v*hw,-1.9),Q(qb,db,v*hw,-1.9),Q(qb,db,v*hw,-.01),Q(qa,da,v*hw,-.01),C.concrete,[qa.n[0]*v,qa.n[1]*v,0]);
     // Jersey barriers on both edges (0.85 m), their top and inner face.
     T.concrete.quad(Q(qa,da,v*(hw-.45),.85),Q(qb,db,v*(hw-.45),.85),Q(qb,db,v*hw,.85),Q(qa,da,v*hw,.85),C.concrete,[0,0,1]);
     T.concrete.quad(Q(qa,da,v*(hw-.45),0),Q(qb,db,v*(hw-.45),0),Q(qb,db,v*(hw-.45),.85),Q(qa,da,v*(hw-.45),.85),mul(C.concrete,.92),[-qa.n[0]*v,-qa.n[1]*v,0]);
     T.concrete.quad(Q(qa,da,v*hw,0),Q(qb,db,v*hw,0),Q(qb,db,v*hw,.85),Q(qa,da,v*hw,.85),C.concrete,[qa.n[0]*v,qa.n[1]*v,0]);}
    T.concrete.quad(Q(qa,da,-hw,-1.9),Q(qb,db,-hw,-1.9),Q(qb,db,hw,-1.9),Q(qa,da,hw,-1.9),C.shade,[0,0,-1]);
    // Lane paint: dashed white lines (and the busway's yellow centre line).
    if(!mobile){const lanes=b.lanes,lw=(b.w-1.2)/lanes;for(let l=1;l<lanes;l++){const v=-hw+.6+l*lw,col=!b.asphalt?C.yellow:C.white;if(b.asphalt&&k%2)continue;
     T.paving.quad(Q(qa,da,v-.07,.03),Q(qb,db,v-.07,.03),Q(qb,db,v+.07,.03),Q(qa,da,v+.07,.03),col,[0,0,1]);}}
   }
   // Pier pairs every ~30 m with their cap beams; abutments at the ends.
   const spans=Math.max(2,Math.round(P.L/30));
   for(let k=1;k<spans;k++){const d=k/spans*P.L,q=P.at(d),z=zAt(d)-1.9;
    for(const v of [-hw*.5,hw*.5]){const x=q.p[0]+q.n[0]*v,y=q.p[1]+q.n[1]*v,g=gAt(x,y);low=Math.min(low,g);if(z-g>.5)T.concrete.post([x,y,g-.6],[x,y,z-.9],.6,.6,10,C.concrete);}
    T.concrete.obox(q.p[0],q.p[1],q.n,b.w-.8,1.4,z-.9,z,C.concrete,{bottom:true});}
   for(const [q,d,s] of [[a0,0,-1],[a1,P.L,1]]){const z=zAt(d);T.concrete.obox(q.p[0]+q.t[0]*s*.6,q.p[1]+q.t[1]*s*.6,q.t,1.2,b.w+.6,gAt(q.p[0],q.p[1])-1.5,z,C.concrete,{top:false});}
   // Lamp posts on the east barrier every 36 m (the busway's on its west one), arms over the deck.
   for(let d=18;d<P.L-6;d+=mobile?72:36){const q=P.at(d),v=b.asphalt?hw-.22:-(hw-.22),s=Math.sign(v),base=[q.p[0]+q.n[0]*v,q.p[1]+q.n[1]*v,zAt(d)+.85],top=[base[0],base[1],base[2]+9],arm=[base[0]-q.n[0]*s*2,base[1]-q.n[1]*s*2,base[2]+9.2];
    T.metal.post(base,top,.12,.08,8,C.grey);T.metal.bar(top,arm,.08,.08,C.grey);T.metal.obox(arm[0],arm[1],[-q.n[0]*s,-q.n[1]*s],.75,.32,arm[2]-.16,arm[2]+.02,C.dark);lamp([arm[0],arm[1],arm[2]-.22],[1,.9,.75]);}
   for(let d=0;d<=P.L;d+=8){const q=P.at(d);clearings.push({x:q.p[0],y:q.p[1],r:b.w/2+3});}
   // The roads on to the embankments at both ends, laid on the ground (OSM), fading into the ground's own paving.
   for(const e of b.ends){const R=polyline(e),m=Math.ceil(R.L/(mobile?10:5)),road=[];
    for(let k=0;k<=m;k++){const q=R.at(k/m*R.L);road.push([-hw,-hw+.25,hw-.25,hw].map(v=>{const x=q.p[0]+q.n[0]*v,y=q.p[1]+q.n[1]*v;return [x,y,gAt(x,y)+.1];}));}
    T.paving.strip(road.map(r=>[r[1],r[2]]),b.asphalt?C.asphalt:lin(0x9c978d));T.paving.strip(road.map(r=>[r[0],r[1]]),C.white);T.paving.strip(road.map(r=>[r[2],r[3]]),C.white);
    for(let d=0;d<=R.L;d+=8){const q=R.at(d);clearings.push({x:q.p[0],y:q.p[1],r:b.w/2+2});}}
   out.push({name:b.name,length:+P.L.toFixed(0),deck:[+zA.toFixed(1),+zB.toFixed(1)],clearance:+(Math.min(zA,zB)-low).toFixed(1)});
  }
  return out;
 });

 // ---------- Driving space: no vertex over the lap's asphalt and walls, up to DRIVE metres above the road.
 const drive={checked:0,violations:0,worst:null,where:{}};
 for(const [k,b] of Object.entries(T))for(let v=0;v<b.p.length;v+=3){
  const x=b.p[v],y=-b.p[v+2],z=b.p[v+1];drive.checked++;
  for(const h of lap.at(x,y)){const over=z-h.road;if(Math.abs(h.lat)<h.back+.3&&over>-.05&&over<DRIVE){drive.violations++;const key=k+'@'+Math.round(h.s/10)*10;drive.where[key]=(drive.where[key]??0)+1;if(!drive.worst||Math.abs(h.lat)<Math.abs(drive.worst.lat))drive.worst={material:k,s:+h.s.toFixed(1),lat:+h.lat.toFixed(2),over:+over.toFixed(2),x:+x.toFixed(1),y:+y.toFixed(1)};}}
 }
 let drawCalls=0,triangles=0;const parts={};
 for(const [k,b] of Object.entries(T)){if(!b.vertices)continue;const m=b.mesh('Barragem_'+k,materials[k],!['riprap','grass','paving','water','pour','seal'].includes(k));if(k==='water')m.renderOrder=2;
  // (The seal after the rest of the module's opaque parts, before the ground; nothing to shade.)
  if(k==='seal'){m.renderOrder=.2;m.receiveShadow=false;}root.add(m);drawCalls++;triangles+=b.triangles;parts[k]=b.triangles;}
 const night=lightUniforms();night.uGroups.value[0].set(1,1,1,1.5);
 const glow=lights.length?nightLights(lights,night,{name:'Barragem_luzes_noite',minPx:mobile?1.5:1.7,floor:.45,fogKeep:.45}):null;
 if(glow){root.add(glow.mesh);drawCalls++;}
 root.updateMatrixWorld(true);
 // Where the lap meets the dam (the stations nearest the axis's ends) and the spillway landmark.
 const nearest=(px,py)=>{let best=null;for(const p of data.samples){const d=Math.hypot(p[1]-px,p[2]-py);if(!best||d<best.d)best={s:+p[0].toFixed(0),d:+d.toFixed(1)};}return best;};
 Object.assign(stats,{drawCalls,triangles,trianglesK:Math.round(triangles/1000),parts,perPart:tris,driveSpace:drive,clearings:clearings.length,lights:lights.length,
  crest:{from:nearest(...DAM_AXIS[0]),to:nearest(...DAM_AXIS[DAM_AXIS.length-1])},flow:{time:0},night:0});
 let lit=0;
 function setNight(level){lit=level;night.uNight.value=level;stats.night=level;if(glow)glow.mesh.visible=level>0;}
 function update(dt){U.uBgTime.value=(U.uBgTime.value+dt)%3600;stats.flow.time=+U.uBgTime.value.toFixed(2);if(lit>0){night.uTime.value+=dt;night.uScreen.value=screenHalf(mobile);}}
 return {root,obstacles:[],clearings,stats,update,setNight};
}
