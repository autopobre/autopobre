import * as THREE from 'three';
import {canvasTexture} from './pit-textures.js';
import {guardrailClearance,guardrailPresent} from './physics.js';
import {branchSpace} from './branch-layout.js';
import {lightUniforms,nightLights,screenHalf} from './sea-water.js';

// The bridge at "Orla · Zoológico" and the creeks under it (meta.decks, data.scenery.canals, gerar_pampulha.py). The
// Córrego Ressaca and the Córrego Sarandi meet by the Praça do Zoológico roundabout and run, canalised, under the Av.
// Otacílio Negrão de Lima into the lake's arm beside the Parque Ecológico; the lap crosses them on a short concrete
// bridge (lap s 5554..5606). The track file gives the canals' open stretches within 160 m of the bridge (OSM, clipped;
// where a stretch ends at a road the creek goes on in a closed culvert) and a "boca" joining the channel to the lake,
// 10 m wide, the water at the lake's level over a bed 1.2 m down; it digs the ground to the bed along them and makes
// those cells lake (cover '6'). Drawn here:
// - the canals: vertical concrete walls both sides from the bed up to the banks (each side's own height, read off the
//   ground 10 to 14 m out), a coping, a railing, a grass verge over the ragged trench the 5 m grid leaves behind the
//   walls (with a short bank down where the ground lies lower), headwalls with the culverts' dark mouths where a stretch
//   ends at a road, a few stones and weeds at the walls' feet. The water between the walls is the lake's own surface
//   (sea-water.js 'Lagoa_superficie': its material, found in the scene on the first frame) laid on a ribbon, so the
//   canal reads as the lake running in and meets it at the boca without a seam. Inside the walls the grid's ground rises
//   over the water in places: the walls, the water and what stands in the channel are drawn first, then a seal across
//   its top writes only depth (renderOrder .2), so the ground and the lake's grid of squares (drawn after it:
//   open-circuit.js .25, sea-water.js .3) never show inside; it stops short of the boca, where the lake takes over.
// - the bridge: a slab on the lap's stations over the deck stretch (its top under the asphalt's edges and the walls,
//   a cornice and fascia outside them, edge beams and three girders under it), abutments at both ends with wing walls
//   along the edges down to the ground, piers on columns beside the canal (parallel to it) and between them where a span
//   would pass 15 m, two lamp posts on the cornices (lit after dark as the avenue's elsewhere, glowing sprites).
// Everything is merged per material (a draw call each); nothing enters the lap's (and a branch road's) driving space
// (checked per vertex).

const DRIVE=4.6,DECK_DROP=1.35,SOFFIT=.95,CORNICE=.25;
// (Across the bridge from the walls' back e: the cornice from e + .36 to e + .68.)
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
const median=v=>{const s=[...v].sort((a,b)=>a-b);return s[s.length>>1];};
function gridHeight(g,x,y){
 if(!g)return null;const fx=(x-g.x0)/g.step,fy=(y-g.y0)/g.step;if(fx<0||fy<0||fx>g.nx-1||fy>g.ny-1)return null;
 const i=Math.min(g.nx-2,Math.floor(fx)),j=Math.min(g.ny-2,Math.floor(fy)),u=fx-i,v=fy-j,k=j*g.nx+i;
 return (g.z[k]*(1-u)+g.z[k+1]*u)*(1-v)+(g.z[k+g.nx]*(1-u)+g.z[k+g.nx+1]*u)*v;
}
// A polyline by arc length: the point and the unit tangent at d metres from the start (the tangent smoothed over
// `blend` metres either side, so offset lines round the corners), and the distance from (x, y) to it.
function polyline(pts,blend=1.5){
 const ds=[0];for(let i=1;i<pts.length;i++)ds.push(ds[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
 const L=ds[ds.length-1];
 const point=d=>{d=clamp(d,0,L);let i=0;while(i<pts.length-2&&ds[i+1]<d)i++;const a=pts[i],b=pts[i+1],l=ds[i+1]-ds[i]||1,u=(d-ds[i])/l;return [lerp(a[0],b[0],u),lerp(a[1],b[1],u)];};
 const at=d=>{const p=point(d),a=point(d-blend),b=point(d+blend),l=Math.hypot(b[0]-a[0],b[1]-a[1])||1,t=[(b[0]-a[0])/l,(b[1]-a[1])/l];return {d,p,t,n:[-t[1],t[0]]};};
 const dist=(x,y)=>{let best=Infinity;for(let i=0;i+1<pts.length;i++){const a=pts[i],b=pts[i+1],dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy||1e-9,u=clamp(((x-a[0])*dx+(y-a[1])*dy)/l2,0,1);best=Math.min(best,Math.hypot(x-a[0]-dx*u,y-a[1]-dy*u));}return best;};
 return {L,at,dist};
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
 // A box with its base corners (a plan quad, any orientation) from z0 to z1, faces turned away from its centre.
 prism(plan,z0,z1,col,{top=true,bottom=false}={}){
  const c=[0,0];for(const p of plan){c[0]+=p[0]/plan.length;c[1]+=p[1]/plan.length;}const C=[c[0],c[1],(z0+z1)/2];
  for(let i=0;i<plan.length;i++){const a=plan[i],b=plan[(i+1)%plan.length],A=[a[0],a[1],z0],B=[b[0],b[1],z0],B1=[b[0],b[1],z1],A1=[a[0],a[1],z1];this.quad(A,B,B1,A1,col,sub([(a[0]+b[0])/2,(a[1]+b[1])/2,C[2]],C));}
  if(top)this.quad(...plan.map(p=>[p[0],p[1],z1]),col,[0,0,1]);if(bottom)this.quad(...plan.map(p=>[p[0],p[1],z0]),col,[0,0,-1]);
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
  if(top&&r1>0)for(let i=1;i+1<n;i++)this.tri(B[0],B[i],B[i+1],col);
 }
 mesh(name,material,shadow=true){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(this.t,2));g.computeBoundingSphere();
  const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.castShadow=shadow;mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;return mesh;
 }
}

// ---------- The lap: stations by s (centre, crossfall, left normal, the walls' reach each side) and its driving space.
function lapStations(data){
 const A=data.samples,N=A.length,L=data.meta.reconstructed_xy_m;
 const back=(w,s,side)=>w/2+guardrailClearance(data,s,side)+(guardrailPresent(data,s,side)?.75:0);
 return s=>{
  s=((s%L)+L)%L;let lo=0,hi=N-1;while(hi-lo>1){const k=lo+hi>>1;if(A[k][0]<=s)lo=k;else hi=k;}
  const p=A[lo],q=A[(lo+1)%N],u=clamp((s-p[0])/(((lo+1<N)?q[0]:L)-p[0]||1),0,1),ip=k=>lerp(p[k],q[k],u),nl=Math.hypot(ip(9),ip(10))||1,tl=Math.hypot(ip(7),ip(8))||1,w=ip(4);
  // back: [right, left], as lapSpace keeps them (lat < 0 right).
  return {s,x:ip(1),y:ip(2),z:ip(3),cf:ip(5),w,n:[ip(9)/nl,ip(10)/nl],t:[ip(7)/tl,ip(8)/tl],back:[back(w,s,-1),back(w,s,1)]};
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
 // Is p (track metres, z up) out of the driving space (its asphalt and walls up to DRIVE metres over the road)?
 const free=p=>!at(p[0],p[1]).some(h=>{const over=p[2]-h.road;return Math.abs(h.lat)<h.back+.3&&over>-.05&&over<DRIVE;});
 return {at,free};
}

// ---------- Textures (canvas; one repeat each)
const wrap=(w,h,x,y,s,fn)=>{for(const dx of [-w,0,w])for(const dy of [-h,0,h])if(x+dx+s>0&&x+dx-s<w&&y+dy+s>0&&y+dy-s<h)fn(x+dx,y+dy);};
function grain(ctx,amount,r){const img=ctx.getImageData(0,0,ctx.canvas.width,ctx.canvas.height),d=img.data;for(let i=0;i<d.length;i+=4){const n=(r()-.5)*amount;d[i]+=n;d[i+1]+=n;d[i+2]+=n;}ctx.putImageData(img,0,0);}
function blotches(ctx,w,h,r,count,light,dark,size,alpha){for(let k=0;k<count;k++){const x=r()*w,y=r()*h,s=size*(.3+r()),c=r()<.5?light:dark,a=alpha*(.4+r());wrap(w,h,x,y,s,(px,py)=>{const g=ctx.createRadialGradient(px,py,0,px,py,s);g.addColorStop(0,`rgba(${c},${a})`);g.addColorStop(1,`rgba(${c},0)`);ctx.fillStyle=g;ctx.fillRect(px-s,py-s,2*s,2*s);});}}
const TEX={
 // Cast concrete (6 m): form panels every 1.2 m with their joints and tie holes, rain streaks, soft stains, grain.
 concrete:()=>canvasTexture((ctx,w,h)=>{const r=random(71),m=w/6;ctx.fillStyle='#cfcbc2';ctx.fillRect(0,0,w,h);
  for(let x=0;x<w;x+=1.2*m){ctx.fillStyle=`rgba(255,255,250,${.03+r()*.05})`;ctx.fillRect(x,0,1.2*m,h);ctx.fillStyle='rgba(60,58,52,.12)';ctx.fillRect(x,0,1.5,h);}
  for(let y=0;y<h;y+=.9*m){ctx.fillStyle='rgba(60,58,52,.08)';ctx.fillRect(0,y,w,1.5);for(let x=.3*m;x<w;x+=.6*m){ctx.fillStyle='rgba(50,48,44,.22)';ctx.beginPath();ctx.arc(x,y+.45*m,1.6,0,6.3);ctx.fill();}}
  for(let k=0;k<26;k++){const x=r()*w,l=(.4+r()*1.2)*m;const g=ctx.createLinearGradient(0,0,0,l);g.addColorStop(0,'rgba(60,62,58,.16)');g.addColorStop(1,'rgba(60,62,58,0)');ctx.fillStyle=g;ctx.fillRect(x,0,2+r()*5,l);}
  blotches(ctx,w,h,r,60,'255,255,248','80,76,68',70,.06);grain(ctx,16,r);},512,512,true),
 // Mown grass (8 m): blades in light and dark, clover patches, bare spots.
 grass:()=>canvasTexture((ctx,w,h)=>{const r=random(53);ctx.fillStyle='#7f9a4c';ctx.fillRect(0,0,w,h);
  blotches(ctx,w,h,r,60,'150,170,80','50,80,30',50,.18);blotches(ctx,w,h,r,12,'150,128,96','150,128,96',30,.2);
  for(let k=0;k<9000;k++){const x=r()*w,y=r()*h,l=2+r()*4,v=r();ctx.strokeStyle=v<.5?`rgba(40,70,25,${.25+r()*.3})`:`rgba(180,200,110,${.2+r()*.3})`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(r()-.5)*2,y-l);ctx.stroke();}
  grain(ctx,12,r);},512,512,true)
};

// ---------- Measures
// The bridge's spans: the longest between two supports, and how far a canal's pier stands off its wall.
const SPAN=15,PIER_OFF=1.25;

export const hasPampulhaPontes=data=>(data.scenery?.canals?.length??0)>0||!!data.meta?.lake&&(data.meta?.decks?.length??0)>0;
export function createPampulhaPontes(data,options={}){
 try{return build(data,options);}catch(e){console.warn('Pontes da Pampulha não montadas:',e);const root=new THREE.Group();root.name='Marcos_Pampulha_Pontes';return {root,obstacles:[],clearings:[],stats:{error:String(e)},update(){}};}
}
function build(data,{ground,mobile=false}={}){
 const root=new THREE.Group();root.name='Marcos_Pampulha_Pontes';
 const gAt=(x,y)=>{const g=ground?.(x,y);if(g!=null&&Number.isFinite(g))return g;return gridHeight(data.terrain,x,y)??0;};
 const level=data.meta.sea_level_m??.8,L=data.meta.reconstructed_xy_m,station=lapStations(data),lap=lapSpace(data),rand=random(5581);
 const tex={concrete:TEX.concrete(),grass:TEX.grass()};
 const materials={
  concrete:new THREE.MeshStandardMaterial({name:'Pontes_concreto',map:tex.concrete,vertexColors:true,roughness:.9,metalness:0}),
  grass:new THREE.MeshStandardMaterial({name:'Pontes_grama',map:tex.grass,vertexColors:true,roughness:.95,metalness:0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),
  plain:new THREE.MeshStandardMaterial({name:'Pontes_pedras',vertexColors:true,roughness:.92,metalness:0,side:THREE.DoubleSide}),
  metal:new THREE.MeshStandardMaterial({name:'Pontes_metal',vertexColors:true,roughness:.42,metalness:.55}),
  // The canal's water until the lake's material is found (the first frame): its colour.
  water:new THREE.MeshStandardMaterial({name:'Pontes_agua',color:0x1f2a1c,roughness:.08,metalness:0}),
  // The canals' seal: depth only (see the header).
  seal:new THREE.MeshBasicMaterial({name:'Pontes_vedacao',colorWrite:false})
 };
 const SIZES={concrete:6,grass:8},T=Object.fromEntries(Object.keys(materials).map(k=>[k,new Batch(SIZES[k]??0)]));
 const lights=[],clearings=[],stats={mobile},count=()=>Object.values(T).reduce((s,b)=>s+b.triangles,0),tris={};
 const C={concrete:lin(0xd6d2c8),shade:lin(0x8a877f),dark:lin(0x17181a),steel:lin(0x8e9496),grey:lin(0x6c7174),lamp:lin(0xfff4dc,1.4)};
 const lamp=(p,c=[1,.86,.62],i=1.2,s=.22,on=.25)=>lights.push({p,c,i,s,g:0,on,ph:rand()});
 const part=(name,fn)=>{const before=count();try{stats[name]=fn()??true;}catch(e){console.warn('Pontes da Pampulha, parte não montada:',name,e);stats[name]={error:String(e)};}tris[name]=count()-before;};
 // Concrete by the water: green-black under the waterline, a damp band over it, then dry with tone from noise.
 const wallTone=water=>p=>{const z=p[2]-water,k=.88+.2*fbm(p[0]/4+p[2]*.3,p[1]/4);
  return z<.1?mul(lin(0x55594a),k*.85):z<.75?mul(mix(lin(0x6f6e60),lin(0xc9c5ba),(z-.1)/.65),k):mul(lin(0xd2cec4),k*(1-.12*clamp((z-.75)/6,0,1)));};

 // ---------- The canals: stretches joined end to start into chains, sampled along their axis.
 const DS=mobile?3:1.5;
 const stretches=(data.scenery?.canals??[]).filter(c=>Array.isArray(c.line)&&c.line.length>1);
 const close=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<.6;
 const starting=p=>stretches.filter(c=>close(c.line[0],p)).length,ending=p=>stretches.filter(c=>close(c.line.at(-1),p)).length;
 // (One stretch on from another where exactly one ends and one starts: a junction or a fork stays two chains.)
 const next=i=>{const e=stretches[i].line.at(-1);return starting(e)===1&&ending(e)===1?stretches.findIndex(c=>close(c.line[0],e)):-1;};
 const prev=i=>{const s=stretches[i].line[0];return starting(s)===1&&ending(s)===1?stretches.findIndex(c=>close(c.line.at(-1),s)):-1;};
 const used=new Set(),chains=[];
 for(let i=0;i<stretches.length;i++){
  if(used.has(i))continue;let f=i;for(let g=0;g<stretches.length;g++){const p=prev(f);if(p<0||used.has(p)||p===i)break;f=p;}
  const parts=[];for(let k=f,g=0;k>=0&&!used.has(k)&&g<stretches.length;k=next(k),g++){used.add(k);parts.push(stretches[k]);}
  const pts=[];for(const c of parts)for(const q of c.line)if(!pts.length||!close(pts.at(-1),q))pts.push(q);
  const c0=parts[0],W=c0.width??10;chains.push({name:c0.name,W,water:c0.water??level,bed:c0.bed??-.4,pts,line:polyline(pts),stretches:parts.length});
 }
 // Inside another chain's channel (within its walls, by margin)?
 const inOther=(ci,x,y,margin=0)=>chains.some((c,j)=>j!==ci&&c.line.dist(x,y)<c.W/2-margin);
 // The deck's stretches (meta.decks) and the lap's road over a point there (null off them).
 const decks=(data.meta.decks??[]).filter(([a,b])=>b>a);
 const onDeck=s=>decks.some(([a,b])=>s>=a-1&&s<=b+1);
 const deckRoad=(x,y)=>{let z=null;for(const h of lap.at(x,y))if(onDeck(h.s)&&Math.abs(h.lat)<h.back+1.5)z=Math.max(z??-Infinity,h.road);return z;};
 // Lake water past a chain's end (the boca): the track file's lake 6 and 12 m on, low ground both sides.
 const lakeAt=(x,y)=>{const c=data.scenery?.cover;if(!c)return false;const i=Math.floor((x-c.x0)/c.step),j=Math.floor((y-c.y0)/c.step);return i>=0&&j>=0&&i<c.nx&&j<c.ny&&c.classes[j*c.nx+i]==='6';};

 part('canals',()=>{
  const out=[];let wallLength=0,headwalls=0,mouths=0,stones=0,weeds=0;
  chains.forEach((ch,ci)=>{
   const {W,water,bed,line}=ch,n=Math.max(2,Math.ceil(line.L/DS)),half=W/2,coping=half+.46;
   const S=Array.from({length:n+1},(_,k)=>line.at(k/n*line.L));
   const P=(q,o,z)=>[q.p[0]+q.n[0]*o,q.p[1]+q.n[1]*o,z];
   // Each end: a junction (inside another chain's channel), the boca (the lake goes on past it) or a culvert (a road).
   const endKind=first=>{const q=first?S[0]:S[n],t=first?[-q.t[0],-q.t[1]]:q.t,[x,y]=q.p;
    if(inOther(ci,x,y,-.5))return 'junction';
    const on=d=>[x+t[0]*d,y+t[1]*d];if([6,12].every(d=>lakeAt(...on(d))&&gAt(...on(d))<water-.3))return 'mouth';return 'culvert';};
   const ends=[endKind(true),endKind(false)];
   // The banks' height each side: the ground 10 to 14 m out (beyond the trench the grid dug), out of other channels;
   // a median along the chain, then a mean; never under the deck's girders.
   const top=[[],[]];
   // (Never on the lap's road or its embankment: |lat| under its walls' reach and 4 m more.)
   const onLap=(x,y)=>lap.at(x,y).some(h=>Math.abs(h.lat)<h.back+4);
   S.forEach((q,k)=>{for(const [i,sd] of [[0,-1],[1,1]]){const v=[];for(const o of [5,6.5,8,9.5]){const p=P(q,sd*(half+o),0);if(!inOther(ci,p[0],p[1],-1)&&!onLap(p[0],p[1]))v.push(gAt(p[0],p[1]));}top[i][k]=v.length?median(v):null;}});
   for(const t of top){for(let k=0;k<=n;k++)if(t[k]==null)t[k]=t.find(v=>v!=null)??water+1.5;
    const m=t.map((_,k)=>median(t.slice(Math.max(0,k-3),k+4)));for(let k=0;k<=n;k++){const w=m.slice(Math.max(0,k-3),k+4);t[k]=clamp(w.reduce((a,b)=>a+b,0)/w.length,water+1.1,water+8);}}
   S.forEach((q,k)=>{for(const [i,sd] of [[0,-1],[1,1]]){const p=P(q,sd*coping,0),road=deckRoad(p[0],p[1])??deckRoad(...q.p);if(road!=null)top[i][k]=Math.min(top[i][k],road-DECK_DROP-1.3);}});
   const zTop=(k,i)=>top[i][k];
   // A stretch of wall (side i) between stations k and k+1 kept where it is out of the other channels: [u0, u1].
   const keep=(k,sd)=>{const inside=u=>{const a=S[k],b=S[k+1],x=lerp(a.p[0],b.p[0],u)+lerp(a.n[0],b.n[0],u)*sd*half,y=lerp(a.p[1],b.p[1],u)+lerp(a.n[1],b.n[1],u)*sd*half;return inOther(ci,x,y,.05);};
    const i0=inside(0),i1=inside(1);if(i0&&i1)return null;if(!i0&&!i1)return [0,1];let lo=0,hi=1;for(let g=0;g<14;g++){const m=(lo+hi)/2;if(inside(m)===i0)lo=m;else hi=m;}return i0?[hi,1]:[0,lo];};
   const Q=(k,u)=>{const a=S[k],b=S[k+1],t=unit([lerp(a.t[0],b.t[0],u),lerp(a.t[1],b.t[1],u),0]);return {p:[lerp(a.p[0],b.p[0],u),lerp(a.p[1],b.p[1],u)],t:[t[0],t[1]],n:[-t[1],t[0]],top:[lerp(top[0][k],top[0][k+1],u),lerp(top[1][k],top[1][k+1],u)]};};
   const railPrev=[null,null];
   for(let k=0;k<n;k++)for(const [i,sd] of [[0,-1],[1,1]]){
    const r=keep(k,sd);if(!r){railPrev[i]=null;continue;}
    const a=Q(k,r[0]),b=Q(k,r[1]),ta=a.top[i],tb=b.top[i],tone=wallTone(water),o=sd*half,out=[a.n[0]*sd,a.n[1]*sd,0],into=mul(out,-1);
    // The inner face (bed to the top), the coping (5 cm proud of the face, 20 cm high), the outer face down to the ground.
    T.concrete.quad(P(a,o,bed-.3),P(b,o,bed-.3),P(b,o,tb),P(a,o,ta),tone,into);
    T.concrete.quad(P(a,sd*(half-.06),ta),P(b,sd*(half-.06),tb),P(b,sd*(half-.06),tb+.2),P(a,sd*(half-.06),ta+.2),mul(C.concrete,.97),into);
    T.concrete.quad(P(a,sd*(half-.06),ta+.2),P(b,sd*(half-.06),tb+.2),P(b,sd*coping,tb+.2),P(a,sd*coping,ta+.2),C.concrete,[0,0,1]);
    const ga=Math.min(gAt(...P(a,sd*coping,0)),water)-.4,gb=Math.min(gAt(...P(b,sd*coping,0)),water)-.4;
    T.concrete.quad(P(a,sd*coping,ga),P(b,sd*coping,gb),P(b,sd*coping,tb+.2),P(a,sd*coping,ta+.2),mul(C.concrete,.93),out);
    wallLength+=Math.hypot(b.p[0]-a.p[0],b.p[1]-a.p[1])*(r[1]-r[0]>0?1:0);
    // The railing on the coping: posts every 2.5 m, two rails (mobile: the top one).
    const d0=line.L*(k+r[0])/n,d1=line.L*(k+r[1])/n;
    for(let d=Math.ceil(d0/2.5)*2.5;d<=d1+1e-6;d+=2.5){const u=n*d/line.L-k,q=Q(k,clamp(u,0,1)),z=q.top[i]+.2,p=P(q,sd*(half+.22),z);
     T.metal.bar(p,[p[0],p[1],z+1.1],.06,.06,C.steel);
     if(railPrev[i]&&Math.hypot(railPrev[i][0]-p[0],railPrev[i][1]-p[1])<3)for(const h of mobile?[1.05]:[.5,1.05])T.metal.bar([railPrev[i][0],railPrev[i][1],railPrev[i][2]+h],[p[0],p[1],z+h],.045,.045,C.steel);
     railPrev[i]=p;}
    if(r[1]<1)railPrev[i]=null;
   }
   // The verge each side over the grid's trench: flat at the bank's height from the coping out to where the ground
   // reaches it (9 m at most, then a bank down to the ground), none in another channel or the lap's driving space.
   for(const [i,sd] of [[0,-1],[1,1]]){
    const reach=S.map((q,k)=>{let o=coping+.5;for(;o<half+9;o+=.5){const p=P(q,sd*o,0);if(gAt(p[0],p[1])>=zTop(k,i)-.05)break;}return o;});
    const Rm=reach.map((_,k)=>Math.max(...reach.slice(Math.max(0,k-1),k+2))),R=Rm.map((_,k)=>{const w=Rm.slice(Math.max(0,k-3),k+4);return w.reduce((a,b)=>a+b,0)/w.length;});
    const rows=S.map((q,k)=>{const t=zTop(k,i),o=R[k],far=P(q,sd*o,0),g=gAt(far[0],far[1]),run=clamp((t-g)*1.6,0,5),foot=P(q,sd*(o+run),0);
     return [P(q,sd*coping,t+.02),P(q,sd*o,t+.02),run>.3?[foot[0],foot[1],gAt(foot[0],foot[1])-.12]:null];});
    // (Dry, worn grass as the ground's round it in the photo: olive going to dust in patches.)
    const tone=p=>{const k=.38+.14*fbm(p[0]/9,p[1]/9),y=fbm(p[0]/23+4,p[1]/23),dust=clamp((fbm(p[0]/6+9,p[1]/6)-.45)*2.5,0,1);return mix([k*1.12,k*.86,k*.56],[k*1.3,k*1.02,k*.8],dust*.8+.2*y);};
    const ok=p=>!inOther(ci,p[0],p[1],-.5)&&lap.free(p);
    for(let k=0;k<n;k++){const A=rows[k],B=rows[k+1];
     if([A[0],A[1],B[0],B[1]].every(ok))T.grass.quad(A[0],A[1],B[1],B[0],tone,[0,0,1]);
     if(A[2]&&B[2]&&[A[1],A[2],B[1],B[2]].every(ok))T.grass.quad(A[1],A[2],B[2],B[1],tone,[0,0,1]);}
    for(let k=0;k<=n;k+=mobile?2:3){const p=P(S[k],sd*(R[k]*.5+coping*.5),0);clearings.push({x:p[0],y:p[1],r:Math.max(4,R[k]-coping+2)});}
   }
   for(let k=0;k<=n;k+=mobile?2:3)clearings.push({x:S[k].p[0],y:S[k].p[1],r:half+1});
   // The ends. A culvert: the headwall across the channel with the two dark box mouths, the water running into them;
   // the boca: the walls end in short wings turning out to the lake, the water and the lake's own going on.
   const mouthAt=[false,false];
   for(const [first,kind] of [[true,ends[0]],[false,ends[1]]]){
    const q=first?S[0]:S[n],t=first?[-q.t[0],-q.t[1]]:q.t,k=first?0:n,zt=Math.max(zTop(k,0),zTop(k,1))+.35,H=(o,f,z)=>[q.p[0]+q.n[0]*o+t[0]*f,q.p[1]+q.n[1]*o+t[1]*f,z];
    if(kind==='culvert'){
     headwalls++;const w0=-coping-.3,w1=coping+.3,cells=[[-half+.5,-.35],[.35,half-.5]],zm=water+1.45;
     T.concrete.prism([H(w0,0,0),H(w1,0,0),H(w1,.6,0),H(w0,.6,0)].map(p=>[p[0],p[1]]),bed-.5,zt,C.concrete);
     for(const [o0,o1] of cells){
      // The mouth: a dark recess 1.5 m deep (its sides, roof, the water's dark floor), a lintel's shade over it.
      T.plain.quad(H(o0,-.02,bed),H(o1,-.02,bed),H(o1,-.02,zm),H(o0,-.02,zm),C.dark,[-t[0],-t[1],0]);
      T.plain.quad(H(o0,-.03,water-.02),H(o1,-.03,water-.02),H(o1,-.03,zm),H(o0,-.03,zm),lin(0x0b0c0c),[-t[0],-t[1],0]);
      T.plain.quad(H(o0,-.04,zm-.05),H(o1,-.04,zm-.05),H(o1,-.04,zm+.12),H(o0,-.04,zm+.12),lin(0x55574f),[-t[0],-t[1],0]);}
     T.concrete.quad(H(w0,-.02,zt),H(w1,-.02,zt),H(w1,.62,zt),H(w0,.62,zt),C.concrete,[0,0,1]);
    }else if(kind==='mouth'){
     mouths++;mouthAt[first?0:1]=true;
     for(const sd of [-1,1]){const a=H(sd*half,0,0),b=H(sd*(half+2.2),2.2,0),z0=zTop(k,sd<0?0:1),f=[b[1]-a[1],a[0]-b[0]],c=H(0,1.1,0),inward=dot([f[0],f[1],0],[c[0]-a[0],c[1]-a[1],0])>0?[f[0],f[1],0]:[-f[0],-f[1],0];
      // (The wing's face toward the channel, its back toward the bank, its top.)
      T.concrete.quad([a[0],a[1],bed-.3],[b[0],b[1],bed-.3],[b[0],b[1],water+.35],[a[0],a[1],z0+.2],wallTone(water),inward);
      const a2=[a[0]-inward[0]*.4/Math.hypot(...f),a[1]-inward[1]*.4/Math.hypot(...f)],b2=[b[0]-inward[0]*.4/Math.hypot(...f),b[1]-inward[1]*.4/Math.hypot(...f)];
      T.concrete.quad([a2[0],a2[1],bed-.3],[b2[0],b2[1],bed-.3],[b2[0],b2[1],water+.35],[a2[0],a2[1],z0+.2],mul(C.concrete,.93),mul(inward,-1));
      T.concrete.quad([a[0],a[1],z0+.2],[b[0],b[1],water+.35],[b2[0],b2[1],water+.35],[a2[0],a2[1],z0+.2],C.concrete,[0,0,1]);}
    }
   }
   // The water (the lake's surface between the walls; past the boca 8 m on into the lake) and the seal over the channel,
   // stopping 4 m short of the boca.
   const ext=d=>{const q=line.at(clamp(d,0,line.L)),over=d<0?d:d>line.L?d-line.L:0;return {p:[q.p[0]+q.t[0]*over,q.p[1]+q.t[1]*over],t:q.t,n:q.n};};
   const w0=mouthAt[0]?-8:0,w1=line.L+(mouthAt[1]?8:0),m=Math.max(2,Math.ceil((w1-w0)/DS));
   const wide=d=>d<0||d>line.L?half+2:half;
   for(let j=0;j<m;j++){const da=lerp(w0,w1,j/m),db=lerp(w0,w1,(j+1)/m),a=ext(da),b=ext(db);
    T.water.quad(P(a,-wide(da),water),P(b,-wide(db),water),P(b,wide(db),water),P(a,wide(da),water),[1,1,1],[0,0,1]);}
   const s0=mouthAt[0]?4:0,s1=line.L-(mouthAt[1]?4:0),ms=Math.max(2,Math.ceil((s1-s0)/DS));
   const topAt=(d,i)=>{const f=clamp(d/line.L*n,0,n),k=Math.min(n-1,Math.floor(f));return lerp(top[i][k],top[i][k+1],f-k);};
   for(let j=0;j<ms;j++){const da=lerp(s0,s1,j/ms),db=lerp(s0,s1,(j+1)/ms),a=line.at(da),b=line.at(db);
    T.seal.quad(P(a,-(half-.06),topAt(da,0)+.2),P(b,-(half-.06),topAt(db,0)+.2),P(b,half-.06,topAt(db,1)+.2),P(a,half-.06,topAt(da,1)+.2),[0,0,0],[0,0,1]);}
   // Stones at the walls' feet, half out of the water, and weeds: tufts at the waterline and on the verge's edge.
   const stoneTone=()=>mul(lin(rand()<.5?0x7d776a:0x6a665c),.8+rand()*.35);
   for(let d=4+rand()*6;d<line.L-3;d+=(mobile?16:9)+rand()*8){const sd=rand()<.5?-1:1,q=line.at(d);
    for(let c=0,cn=1+Math.floor(rand()*3);c<cn;c++){const o=sd*(half-.35-rand()*.9),p=P(q,o,0),along=(rand()-.5)*1.6,r0=.25+rand()*.35,x=p[0]+q.t[0]*along,y=p[1]+q.t[1]*along;
     if(inOther(ci,x,y,-.2))continue;T.plain.post([x,y,water-.5],[x,y,water+.05+rand()*.3],r0,r0*(.45+rand()*.3),6,stoneTone(),{rot:rand()*6});stones++;}}
   const tuft=(x,y,z,h,col)=>{for(let a=0;a<3;a++){const ang=a*Math.PI/3+rand(),dx=Math.cos(ang)*h*.35,dy=Math.sin(ang)*h*.35;T.plain.quad([x-dx,y-dy,z],[x+dx,y+dy,z],[x+dx*1.3,y+dy*1.3,z+h],[x-dx*1.3,y-dy*1.3,z+h],col,null);}weeds++;};
   for(let d=2+rand()*4;d<line.L-1;d+=(mobile?10:5)+rand()*5){const sd=rand()<.5?-1:1,q=line.at(d),k=clamp(Math.round(d/line.L*n),0,n);
    const green=mix(lin(0x5f7a2e),lin(0x9a9a48),rand());
    if(rand()<.6){const p=P(q,sd*(half-.15),0);if(!inOther(ci,p[0],p[1],-.2))tuft(p[0],p[1],water-.05,.5+rand()*.5,green);}
    else{const p=P(q,sd*(coping+.15),0);if(!inOther(ci,p[0],p[1],-.5)&&lap.free([p[0],p[1],zTop(k,sd<0?0:1)]))tuft(p[0],p[1],zTop(k,sd<0?0:1)+.2,.35+rand()*.4,mul(green,1.1));}}
   out.push({name:ch.name,length:+line.L.toFixed(1),stretches:ch.stretches,ends,banks:[+Math.min(...top[0]).toFixed(1),+Math.max(...top[0]).toFixed(1),+Math.min(...top[1]).toFixed(1),+Math.max(...top[1]).toFixed(1)]});
  });
  return {chains:out,wallLength:Math.round(wallLength),headwalls,mouths,stones,weeds};
 });

 // ---------- The bridge over each deck stretch (meta.decks): slab, cornices and fascia, edge beams, girders, ends.
 part('bridge',()=>{
  const out=[];
  for(const [a,b] of decks){
   const ss=[a];for(const p of data.samples)if(p[0]>a+.3&&p[0]<b-.3)ss.push(p[0]);ss.push(b);
   const st=ss.map(s=>station(s)),road=(q,lat)=>q.z+q.cf*lat,P=(q,lat,dz)=>[q.x+q.n[0]*lat,q.y+q.n[1]*lat,road(q,lat)+dz];
   // The cornice's inner face: 36 cm past the walls' back, further where the driving space reaches further (the
   // walls' reach is interpolated between the lap's samples).
   const edge=(q,sd)=>{const e0=sd<0?q.back[0]:q.back[1];let e=e0;for(;e<e0+1.5;e+=.05){if([0,.32].every(f=>lap.free(P(q,sd*(e+.36+f),CORNICE+.02))))break;}return e;};
   // Concrete tone: the fascia's drip line darker, weathering downwards.
   const fascia=p=>mul(C.concrete,.9+.12*fbm(p[0]/5,p[1]/5+p[2]));
   for(let k=0;k+1<st.length;k++){const A=st[k],B=st[k+1];
    for(const sd of [-1,1]){const e=q=>edge(q,sd),o=[A.n[0]*sd,A.n[1]*sd,0];
     // The deck's top under the walls (6 cm under the road: out of the driving space), the cornice's inner face, top
     // and the fascia down to the edge beam's soffit, the beam's underside and inner face.
     T.concrete.quad(P(A,sd*(A.w/2-.05),-.06),P(B,sd*(B.w/2-.05),-.06),P(B,sd*(e(B)+.36),-.06),P(A,sd*(e(A)+.36),-.06),mul(C.concrete,.8),[0,0,1]);
     T.concrete.quad(P(A,sd*(e(A)+.36),-.06),P(B,sd*(e(B)+.36),-.06),P(B,sd*(e(B)+.36),CORNICE),P(A,sd*(e(A)+.36),CORNICE),C.concrete,mul(o,-1));
     T.concrete.quad(P(A,sd*(e(A)+.36),CORNICE),P(B,sd*(e(B)+.36),CORNICE),P(B,sd*(e(B)+.68),CORNICE),P(A,sd*(e(A)+.68),CORNICE),C.concrete,[0,0,1]);
     T.concrete.quad(P(A,sd*(e(A)+.68),-DECK_DROP),P(B,sd*(e(B)+.68),-DECK_DROP),P(B,sd*(e(B)+.68),CORNICE),P(A,sd*(e(A)+.68),CORNICE),fascia,o);
     T.concrete.quad(P(A,sd*(e(A)+.68),-DECK_DROP),P(B,sd*(e(B)+.68),-DECK_DROP),P(B,sd*(e(B)+.02),-DECK_DROP),P(A,sd*(e(A)+.02),-DECK_DROP),C.shade,[0,0,-1]);
     T.concrete.quad(P(A,sd*(e(A)+.02),-DECK_DROP),P(B,sd*(e(B)+.02),-DECK_DROP),P(B,sd*(e(B)+.02),-SOFFIT),P(A,sd*(e(A)+.02),-SOFFIT),C.shade,mul(o,-1));}
    // The slab's soffit and the three girders under it.
    T.concrete.quad(P(A,-(edge(A,-1)+.02),-SOFFIT),P(B,-(edge(B,-1)+.02),-SOFFIT),P(B,edge(B,1)+.02,-SOFFIT),P(A,edge(A,1)+.02,-SOFFIT),mul(C.shade,.92),[0,0,-1]);
    for(const f of [-.28,0,.28]){const la=A.w*f,lb=B.w*f;
     for(const [s0,s1,face] of [[-.25,-.25,-1],[.25,.25,1]])T.concrete.quad(P(A,la+s0,-DECK_DROP),P(B,lb+s1,-DECK_DROP),P(B,lb+s1,-SOFFIT),P(A,la+s0,-SOFFIT),C.shade,[A.n[0]*face,A.n[1]*face,0]);
     T.concrete.quad(P(A,la-.25,-DECK_DROP),P(B,lb-.25,-DECK_DROP),P(B,lb+.25,-DECK_DROP),P(A,la+.25,-DECK_DROP),mul(C.shade,.9),[0,0,-1]);}
   }
   // The ends: the abutment, where the ground under the slab has fallen 1.6 m below the road, a wall across from the
   // edge beams down into the ground (the embankment behind it under the deck), wing walls along both edges from it to
   // the deck's end, down to the ground; the end diaphragm closing the slab.
   const groundUnder=q=>Math.max(...[-1,-.5,0,.5,1].map(f=>gAt(...P(q,f*(f<0?q.back[0]:q.back[1]),0).slice(0,2))));
   const minUnder=q=>Math.min(...[-1,-.5,0,.5,1].map(f=>gAt(...P(q,f*(f<0?q.back[0]:q.back[1]),0).slice(0,2))));
   const abut=[];
   for(const [first,dir] of [[true,1],[false,-1]]){
    let s=first?a:b;const lim=(b-a)/2;for(let d=0;d<lim;d+=.5){const q=station(first?a+d:b-d);s=q.s;if(groundUnder(q)<road(q,0)-1.6)break;}
    const q=station(s),zb=Math.min(minUnder(q),minUnder(station(s+dir*3)))-.6,t=[q.t[0]*dir,q.t[1]*dir],lats=[-(edge(q,-1)+.68)];for(let f=-.75;f<=.76;f+=.25)lats.push(f*(f<0?q.back[0]:q.back[1]));lats.push(edge(q,1)+.68);
    for(let i=0;i+1<lats.length;i++){const p0=P(q,lats[i],-DECK_DROP),p1=P(q,lats[i+1],-DECK_DROP);T.concrete.quad([p0[0],p0[1],zb],[p1[0],p1[1],zb],p1,p0,C.concrete,[t[0],t[1],0]);
     const b0=[p0[0]-t[0]*1.2,p0[1]-t[1]*1.2],b1=[p1[0]-t[0]*1.2,p1[1]-t[1]*1.2];T.concrete.quad([p0[0],p0[1],p0[2]],[p1[0],p1[1],p1[2]],[b1[0],b1[1],p1[2]],[b0[0],b0[1],p0[2]],C.shade,[0,0,-1]);}
    // Wing walls: from the abutment to the deck's end and 4 m on along the embankment, outside the fascia.
    for(const sd of [-1,1]){const from=s,to=first?a-4:b+4,m=Math.max(2,Math.ceil(Math.abs(to-from)/1.5));
     for(let j=0;j<m;j++){const qa=station(lerp(from,to,j/m)),qb=station(lerp(from,to,(j+1)/m)),la=sd*(edge(qa,sd)+.68),lb=sd*(edge(qb,sd)+.68),pa=P(qa,la,0),pb=P(qb,lb,0);
      // (Under the slab up to the edge beam, past the deck's end up to the cornice's height.)
      const za=Math.min(gAt(pa[0],pa[1]),road(qa,la)-DECK_DROP)-.5,zb2=Math.min(gAt(pb[0],pb[1]),road(qb,lb)-DECK_DROP)-.5,ta=road(qa,la)+(onDeck(qa.s)&&qa.s>a&&qa.s<b?-DECK_DROP:CORNICE),tb=road(qb,lb)+(onDeck(qb.s)&&qb.s>a&&qb.s<b?-DECK_DROP:CORNICE);
      if(ta<=za+.05&&tb<=zb2+.05)continue;
      T.concrete.quad([pa[0],pa[1],za],[pb[0],pb[1],zb2],[pb[0],pb[1],tb],[pa[0],pa[1],ta],fascia,[qa.n[0]*sd,qa.n[1]*sd,0]);}}
    abut.push(+s.toFixed(1));
    // The end diaphragm: the slab's end face.
    const e0=station(first?a:b),te=[e0.t[0]*-dir,e0.t[1]*-dir,0];T.concrete.quad(P(e0,-(edge(e0,-1)+.68),-DECK_DROP),P(e0,edge(e0,1)+.68,-DECK_DROP),P(e0,edge(e0,1)+.68,-.06),P(e0,-(edge(e0,-1)+.68),-.06),C.shade,te);
   }
   // Supports: the canal's piers each side of it (parallel to it, PIER_OFF past its walls), more between where a span
   // would pass SPAN; each a cap beam under the girders on three columns down into the ground.
   const crossings=[];
   for(const ch of chains){for(let i=0;i+1<ch.pts.length;i++){const c0=ch.pts[i],c1=ch.pts[i+1];
    for(let k=0;k+1<st.length;k++){const A=st[k],B=st[k+1],r=[c1[0]-c0[0],c1[1]-c0[1]],e=[B.x-A.x,B.y-A.y],den=r[0]*e[1]-r[1]*e[0];if(Math.abs(den)<1e-9)continue;
     const u=((A.x-c0[0])*e[1]-(A.y-c0[1])*e[0])/den,v=((A.x-c0[0])*r[1]-(A.y-c0[1])*r[0])/den;
     if(u>=0&&u<=1&&v>=0&&v<=1){const l=Math.hypot(r[0],r[1]);crossings.push({s:lerp(A.s,B.s,v),x:c0[0]+r[0]*u,y:c0[1]+r[1]*u,u:[r[0]/l,r[1]/l],W:ch.W});}}}}
   const sOf=(x,y)=>{let best=null;for(const q of st){const d=Math.hypot(q.x-x,q.y-y);if(!best||d<best.d)best={d,q};}const q=best.q;return q.s+((x-q.x)*q.t[0]+(y-q.y)*q.t[1]);};
   const piers=[];
   for(const c of crossings){const nn=[-c.u[1],c.u[0]];for(const sd of [-1,1]){const off=c.W/2+PIER_OFF,x=c.x+nn[0]*sd*off,y=c.y+nn[1]*sd*off;piers.push({s:sOf(x,y),u:c.u});}}
   const u0=crossings[0]?.u??null,supports=[{s:abut[0]},...piers.filter(p=>p.s>abut[0]+3&&p.s<abut[1]-3).sort((p,q)=>p.s-q.s),{s:abut[1]}];
   const all=[];for(let i=0;i+1<supports.length;i++){all.push(supports[i]);const gap=supports[i+1].s-supports[i].s,extra=Math.ceil(gap/SPAN)-1;for(let j=1;j<=extra;j++)all.push({s:supports[i].s+gap*j/(extra+1),u:u0});}
   let built=0,columns=0;
   for(const pr of all.slice(1)){if(pr.u===undefined)continue;
    const q=station(pr.s),u=pr.u??[q.n[0],q.n[1]],k=Math.abs(u[0]*q.n[0]+u[1]*q.n[1])||1,sg=Math.sign(u[0]*q.n[0]+u[1]*q.n[1])||1,zc=road(q,0)-DECK_DROP;
    const along=lat=>[q.x+u[0]*sg*lat/k,q.y+u[1]*sg*lat/k],lo=-(edge(q,-1)+.68),hi=edge(q,1)+.68;
    if(groundUnder(q)>zc-1.2)continue;
    const c=along((lo+hi)/2),len=(hi-lo)/k;T.concrete.obox(c[0],c[1],[u[0]*sg,u[1]*sg],len,1.1,zc-.75,zc,C.concrete,{bottom:true});
    for(const f of [-.6,0,.6]){const lat=f*(f<0?q.back[0]:q.back[1])*.8,p=along(lat);if(chains.some(ch=>ch.line.dist(p[0],p[1])<ch.W/2+.9))continue;const g=gAt(p[0],p[1]);
     T.concrete.post([p[0],p[1],g-.6],[p[0],p[1],zc-.74],.42,.42,mobile?8:12,mul(C.concrete,.96),{top:false});columns++;}
    built++;}
   // Lamp posts on the cornices, a third and two thirds along (9 m, one arm over the road, LED head), lit after dark.
   let lamps=0;
   for(const [f,sd] of [[.3,-1],[.72,1]]){const q=station(lerp(a,b,f)),base=P(q,sd*(edge(q,sd)+.52),CORNICE),d=[-q.n[0]*sd,-q.n[1]*sd],top=[base[0],base[1],base[2]+9],arm=[base[0]+d[0]*1.8,base[1]+d[1]*1.8,base[2]+9.25];
    T.metal.post(base,top,.12,.07,8,C.grey);T.metal.bar(top,arm,.08,.08,C.grey);T.metal.obox(arm[0],arm[1],d,.75,.32,arm[2]-.16,arm[2]+.02,C.dark);
    lamp([arm[0],arm[1],arm[2]-.22]);lamps++;}
   for(const q of st)clearings.push({x:q.x,y:q.y,r:Math.max(...q.back)+3});
   out.push({from:a,to:b,length:+(b-a).toFixed(1),abutments:abut,piers:built,columns,crossings:crossings.map(c=>+c.s.toFixed(1)),lamps,clearance:+Math.min(...st.map(q=>road(q,0)-minUnder(q))).toFixed(1)});
  }
  return out;
 });

 // ---------- Driving space: no vertex over the lap's asphalt and walls, up to DRIVE metres above the road.
 const drive={checked:0,violations:0,worst:null,where:{}};
 for(const [k,b] of Object.entries(T))for(let v=0;v<b.p.length;v+=3){
  const x=b.p[v],y=-b.p[v+2],z=b.p[v+1];drive.checked++;
  for(const h of lap.at(x,y)){const over=z-h.road;if(Math.abs(h.lat)<h.back+.3&&over>-.05&&over<DRIVE){drive.violations++;const key=k+'@'+Math.round(h.s/10)*10;drive.where[key]=(drive.where[key]??0)+1;if(!drive.worst||Math.abs(h.lat)<Math.abs(drive.worst.lat))drive.worst={material:k,s:+h.s.toFixed(1),lat:+h.lat.toFixed(2),over:+over.toFixed(2),x:+x.toFixed(1),y:+y.toFixed(1)};}}
 }
 let drawCalls=0,triangles=0,water=null;const parts={};
 for(const [k,b] of Object.entries(T)){if(!b.vertices)continue;const m=b.mesh('Pontes_'+k,materials[k],['concrete','metal','plain'].includes(k));
  // (The water and the seal before the ground: the seal after everything of the canal, the water before it.)
  if(k==='water'){m.renderOrder=.1;m.castShadow=false;water=m;}if(k==='seal'){m.renderOrder=.2;m.receiveShadow=false;}
  root.add(m);drawCalls++;triangles+=b.triangles;parts[k]=b.triangles;}
 const night=lightUniforms();night.uGroups.value[0].set(1,1,1,1.5);
 const glow=lights.length?nightLights(lights,night,{name:'Pontes_luzes_noite',minPx:mobile?1.5:1.7,floor:.45,fogKeep:.45}):null;
 if(glow){root.add(glow.mesh);drawCalls++;}
 root.updateMatrixWorld(true);
 Object.assign(stats,{drawCalls,triangles,trianglesK:Math.round(triangles/1000),parts,perPart:tris,driveSpace:drive,clearings:clearings.length,lights:lights.length,water:'propria',night:0});
 // The lake's surface material on the canals' water, from the scene (sea-water.js), once it is there.
 let linked=false;
 function linkLake(){
  if(linked||!water)return;let top=root;while(top.parent)top=top.parent;if(top===root)return;linked=true;
  const lake=top.getObjectByName('Lagoa_superficie');if(lake?.material){water.material=lake.material;stats.water='lagoa';}
 }
 let lit=0;
 function setNight(level){lit=level;night.uNight.value=level;stats.night=level;if(glow)glow.mesh.visible=level>0;}
 function update(dt){linkLake();if(lit>0){night.uTime.value+=dt;night.uScreen.value=screenHalf(mobile);}}
 return {root,obstacles:[],clearings,stats,update,setNight};
}
