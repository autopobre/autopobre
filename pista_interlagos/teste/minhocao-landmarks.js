import * as THREE from 'three';
import {canvasTexture} from './pit-textures.js';
import {guardrailClearance,guardrailPresent} from './physics.js';

// The landmarks round the Circuito do Minhocão (data.scenery.landmarks, gerar_minhocao.py), each on its real OSM
// footprint (outline, local metres; ground and ground_max under it; height, levels and the extras below), drawn from
// the published facts (research 2026-10-11, Wikipedia/GeoSampa):
// - copan: Edifício Copan (Niemeyer, 1966), 118 m, 37 levels: the S-curved slab with a continuous concrete
//   brise-soleil along both long façades on every floor, a shop gallery under a marquise at the foot.
// - italia: Edifício Itália (Heep, 1965), 46 levels, the Terraço Itália's floors and deck (deck_m, 151 m) and the
//   rooftop structures to 165 m: glass between dark aluminium and light spandrel bands, a different glazed crown.
// - hilton: the ex-Hilton (1971, now the Tribunal de Justiça), a 110 m cylinder of exposed concrete with deep vertical
//   ribs and floor bands, on a lower rectangular podium.
// - caetano_de_campos: the Escola Normal (Ramos de Azevedo, 1894), salmon walls, white trim and pilasters, three
//   storeys of tall windows, a balustrade, the central pavilion with its pediment and small clock tower.
// - igreja_consolacao: Nossa Senhora da Consolação (1909-1959), neo-Romanesque in red-brown stone, nave, aisles,
//   clerestory and one front bell tower (tower_m, 75 m) ending in a spire, facing Rua da Consolação.
// - esther: Edifício Esther (1938), 11 levels of white bands and ribbon windows, a set-back top floor.
// - andraus: Edifício Andraus (1962), 32 levels, a curtain-wall tower in horizontal bands on its podium, the rooftop
//   heliport (total_m, 115 m with the mast).
// - coreto_republica: the bandstand in Praça da República, an octagonal platform, slender iron columns, a pointed roof.
// Generic buildings (data.scenery.buildings, oriented rectangles) that cut into a landmark are trimmed back to its
// wall, or dropped when most of one would go (the min-rectangle of an L-shaped lot can swallow a tower): this runs
// before landscape.js builds them (main.js creates the circuit's extras first).
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
// Value noise for weathering and tone that never repeat.
const hash=(i,j)=>{const h=Math.sin(i*127.1+j*311.7)*43758.5453;return h-Math.floor(h);};
function noise(x,y){const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,su=u*u*(3-2*u),sv=v*v*(3-2*v);return (hash(i,j)*(1-su)+hash(i+1,j)*su)*(1-sv)+(hash(i,j+1)*(1-su)+hash(i+1,j+1)*su)*sv;}
const fbm=(x,y)=>.55*noise(x,y)+.3*noise(x*2.1+5.2,y*2.1+1.3)+.15*noise(x*4.3+9.1,y*4.3+7.7);
// A colour at p with broad patches (amount) of lighter and dirtier tone.
const patchy=(base,amount=.12,scale=9)=>p=>{const k=1-amount/2+amount*fbm((p[0]+p[1]*.6)/scale+p[2]*.03,(p[1]-p[0]*.3)/scale-p[2]*.05);return mul(base,k);};
function gridHeight(g,x,y){
 if(!g)return null;const fx=(x-g.x0)/g.step,fy=(y-g.y0)/g.step;if(fx<0||fy<0||fx>g.nx-1||fy>g.ny-1)return null;
 const i=Math.min(g.nx-2,Math.floor(fx)),j=Math.min(g.ny-2,Math.floor(fy)),u=fx-i,v=fy-j,k=j*g.nx+i;
 return (g.z[k]*(1-u)+g.z[k+1]*u)*(1-v)+(g.z[k+g.nx]*(1-u)+g.z[k+g.nx+1]*u)*v;
}

// ---------- Plan geometry (track metres, x east, y north)
const signedArea=pts=>{let a=0;for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];a+=p[0]*q[1]-q[0]*p[1];}return a/2;};
// A footprint as an open ring, counter-clockwise, without repeats.
function ringOf(outline){
 let pts=outline.map(p=>[p[0],p[1]]);
 if(pts.length>1&&Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])<1e-6)pts.pop();
 pts=pts.filter((p,i)=>{const q=pts[(i+pts.length-1)%pts.length];return Math.hypot(p[0]-q[0],p[1]-q[1])>.05;});
 if(signedArea(pts)<0)pts.reverse();return pts;
}
function centroid(pts){let a=0,x=0,y=0;for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length],c=p[0]*q[1]-q[0]*p[1];a+=c;x+=(p[0]+q[0])*c;y+=(p[1]+q[1])*c;}return Math.abs(a)<1e-9?pts[0]:[x/(3*a),y/(3*a)];}
// Outward unit normal of edge a→b of a counter-clockwise ring.
const edgeOut=(a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;return [dy/l,-dx/l];};
// Each point moved d outward (inward when negative) on its corner's mitre; open runs keep their end edges' normals.
function offset(pts,d,closed=true,limit=2.5){
 const n=pts.length;
 return pts.map((p,i)=>{
  const prev=closed||i>0?pts[(i+n-1)%n]:null,next=closed||i<n-1?pts[(i+1)%n]:null,a=prev?edgeOut(prev,p):edgeOut(p,next),b=next?edgeOut(p,next):a;
  let mx=a[0]+b[0],my=a[1]+b[1];const ml=Math.hypot(mx,my);if(ml<1e-6){mx=a[0];my=a[1];}else{mx/=ml;my/=ml;}
  const k=Math.min(limit,1/Math.max(.25,mx*a[0]+my*a[1]));return [p[0]+mx*d*k,p[1]+my*d*k];
 });
}
function inside(x,y,pts){let c=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[i],b=pts[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const segHit=(a,b,c,d)=>orient(c,d,a)*orient(c,d,b)<0&&orient(a,b,c)*orient(a,b,d)<0;
function ringsHit(A,B){
 for(const p of A)if(inside(p[0],p[1],B))return true;for(const p of B)if(inside(p[0],p[1],A))return true;
 for(let i=0;i<A.length;i++)for(let j=0;j<B.length;j++)if(segHit(A[i],A[(i+1)%A.length],B[j],B[(j+1)%B.length]))return true;return false;
}
// Douglas-Peucker on a closed ring (the mobile build's coarser curves, the camera proxies).
function simplify(pts,tol){
 if(tol<=0||pts.length<8)return pts;
 const dp=a=>{if(a.length<3)return a;const p=a[0],q=a.at(-1),dx=q[0]-p[0],dy=q[1]-p[1],l=Math.hypot(dx,dy)||1e-9;let k=0,best=-1;for(let i=1;i<a.length-1;i++){const d=Math.abs((a[i][0]-p[0])*dy-(a[i][1]-p[1])*dx)/l;if(d>best){best=d;k=i;}}return best>tol?[...dp(a.slice(0,k+1)).slice(0,-1),...dp(a.slice(k))]:[p,q];};
 let far=0,fd=0;for(let i=1;i<pts.length;i++){const d=Math.hypot(pts[i][0]-pts[0][0],pts[i][1]-pts[0][1]);if(d>fd){fd=d;far=i;}}
 const out=[...dp(pts.slice(0,far+1)).slice(0,-1),...dp([...pts.slice(far),pts[0]]).slice(0,-1)];return out.length>=3?out:pts;
}
function hull(pts){const p=[...pts].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),lo=[],up=[];for(const q of p){while(lo.length>1&&orient(lo.at(-2),lo.at(-1),q)<=0)lo.pop();lo.push(q);}for(const q of p.reverse()){while(up.length>1&&orient(up.at(-2),up.at(-1),q)<=0)up.pop();up.push(q);}return [...lo.slice(0,-1),...up.slice(0,-1)];}
const scaled=(pts,c,k)=>pts.map(p=>[c[0]+(p[0]-c[0])*k,c[1]+(p[1]-c[1])*k]);
// How far the inside of the ring runs straight in from the middle of edge i (a slab's depth or its length).
function inwardDepth(pts,i){
 const n=pts.length,a=pts[i],b=pts[(i+1)%n],[nx,ny]=edgeOut(a,b),mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2,dx=-nx,dy=-ny;let best=Infinity;
 for(let k=0;k<n;k++){if(k===i)continue;const p=pts[k],q=pts[(k+1)%n],ex=q[0]-p[0],ey=q[1]-p[1],den=dx*ey-dy*ex;if(Math.abs(den)<1e-9)continue;
  const t=((p[0]-mx)*ey-(p[1]-my)*ex)/den,s=((p[0]-mx)*dy-(p[1]-my)*dx)/den;if(t>.05&&s>=0&&s<=1)best=Math.min(best,t);}
 return best;
}
// Runs of edges between sharp corners (turn over maxTurn radians): [{edges:[i...], length}].
function runs(pts,maxTurn=.6){
 const n=pts.length,turn=i=>{const a=pts[(i+n-1)%n],p=pts[i],b=pts[(i+1)%n];let d=Math.atan2(b[1]-p[1],b[0]-p[0])-Math.atan2(p[1]-a[1],p[0]-a[0]);while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return d;};
 const sharp=[];for(let i=0;i<n;i++)if(Math.abs(turn(i))>maxTurn)sharp.push(i);
 const len=i=>Math.hypot(pts[(i+1)%n][0]-pts[i][0],pts[(i+1)%n][1]-pts[i][1]);
 if(!sharp.length){const edges=[...Array(n).keys()];return [{edges,length:edges.reduce((s,i)=>s+len(i),0),closed:true}];}
 return sharp.map((i0,k)=>{const i1=sharp[(k+1)%sharp.length],edges=[];let i=i0;do{edges.push(i);i=(i+1)%n;}while(i!==i1);return {edges,length:edges.reduce((s,e)=>s+len(e),0)};});
}
// Cross-section of a ring along a frame's u: the v extent at u (null when the line misses it).
function across(P,u){const vs=[];for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length];if((a[0]-u)*(b[0]-u)>0||a[0]===b[0])continue;vs.push(a[1]+(u-a[0])/(b[0]-a[0])*(b[1]-a[1]));}return vs.length<2?null:{lo:Math.min(...vs),hi:Math.max(...vs),width:Math.max(...vs)-Math.min(...vs),mid:(Math.max(...vs)+Math.min(...vs))/2};}

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
 // A planar polygon (concave allowed) facing out; uvOf(p) for its UVs.
 poly(pts,col,out,uvOf){
  if(pts.length<3)return;const N=unit(out),S=unit(Math.abs(N[2])<.9?cross([0,0,1],N):cross([1,0,0],N)),V=cross(N,S);
  const flat=pts.map(p=>new THREE.Vector2(dot(p,S),dot(p,V)));if(Math.abs(THREE.ShapeUtils.area(flat))<1e-6)return;
  for(const [i,j,k] of THREE.ShapeUtils.triangulateShape(flat,[])){let a=pts[i],b=pts[j],c=pts[k];if(dot(cross(sub(b,a),sub(c,a)),N)<0)[b,c]=[c,b];this.tri(a,b,c,col,uvOf&&[uvOf(a),uvOf(b),uvOf(c)]);}
 }
 // A box a0..a1 × b0..b1 × z0..z1 in frame f, every face turned away from its centre.
 box(f,a0,a1,b0,b1,z0,z1,col,{bottom=false,top=true,sides=true,ends=true}={}){
  const P=(i,j,k)=>f(i?a1:a0,j?b1:b0,k?z1:z0),c=f((a0+a1)/2,(b0+b1)/2,(z0+z1)/2),face=(A,B,C,D)=>this.quad(A,B,C,D,col,sub([(A[0]+C[0])/2,(A[1]+C[1])/2,(A[2]+C[2])/2],c));
  if(ends){face(P(0,0,0),P(0,1,0),P(0,1,1),P(0,0,1));face(P(1,0,0),P(1,1,0),P(1,1,1),P(1,0,1));}
  if(sides){face(P(0,0,0),P(1,0,0),P(1,0,1),P(0,0,1));face(P(0,1,0),P(1,1,0),P(1,1,1),P(0,1,1));}
  if(bottom)face(P(0,0,0),P(1,0,0),P(1,1,0),P(0,1,0));if(top)face(P(0,0,1),P(1,0,1),P(1,1,1),P(0,1,1));
 }
 // An n-sided post from p (radius r0) to q (radius r1), any direction.
 post(p,q,r0,r1,n,col,{rot=0,top=true,bottom=false}={}){
  const d=unit(sub(q,p)),e1=unit(Math.abs(d[2])>.99?cross([0,1,0],d):cross(d,[0,0,1])),e2=cross(d,e1);
  const ring=(c,r)=>Array.from({length:n},(_,i)=>{const a=rot+i*2*Math.PI/n,x=Math.cos(a)*r,y=Math.sin(a)*r;return [c[0]+e1[0]*x+e2[0]*y,c[1]+e1[1]*x+e2[1]*y,c[2]+e1[2]*x+e2[2]*y];});
  const A=ring(p,r0),B=ring(q,r1);
  for(let i=0;i<n;i++){const j=(i+1)%n,m=sub([(A[i][0]+A[j][0])/2,(A[i][1]+A[j][1])/2,(A[i][2]+A[j][2])/2],p);this.quad(A[i],A[j],B[j],B[i],col,sub(m,mul(d,dot(m,d))));}
  if(top&&r1>0)this.poly(B,col,d);if(bottom&&r0>0)this.poly(A,col,mul(d,-1));
 }
 // A wall on plan edge a→b (outward normal out) from za (bottom) to zb (top); uv: u0..u1 along it, v of z.
 wall(a,b,z0,z1,col,u0=0,u1=0,v=null){const n=edgeOut(a,b),out=[n[0],n[1],0];this.quad([a[0],a[1],z0],[b[0],b[1],z0],[b[0],b[1],z1],[a[0],a[1],z1],col,out,v&&[[u0,v(z0)],[u1,v(z0)],[u1,v(z1)],[u0,v(z1)]]);}
 // A level slab over a plan ring (top facing up, or down when under).
 slab(pts,z,col,under=false){this.poly(pts.map(p=>[p[0],p[1],z]),col,[0,0,under?-1:1]);}
 // A ledge along an open run of plan points: from the wall (inner) to `outer`, z0..z1; top, bottom and front.
 ledge(inner,outer,z0,z1,col,{bottom=true,top=true,caps=true}={}){
  for(let i=0;i+1<inner.length;i++){
   const a=inner[i],b=inner[i+1],A=outer[i],B=outer[i+1],n=edgeOut(a,b),out=[n[0],n[1],0];
   if(top)this.quad([a[0],a[1],z1],[b[0],b[1],z1],[B[0],B[1],z1],[A[0],A[1],z1],col,[0,0,1]);
   if(bottom)this.quad([a[0],a[1],z0],[b[0],b[1],z0],[B[0],B[1],z0],[A[0],A[1],z0],col,[0,0,-1]);
   this.quad([A[0],A[1],z0],[B[0],B[1],z0],[B[0],B[1],z1],[A[0],A[1],z1],col,out);
  }
  // End caps, facing away from the run.
  if(caps&&inner.length>1)for(const [k,o] of [[0,inner[1]],[inner.length-1,inner.at(-2)]]){const a=inner[k],A=outer[k];this.quad([a[0],a[1],z0],[A[0],A[1],z0],[A[0],A[1],z1],[a[0],a[1],z1],col,[a[0]-o[0],a[1]-o[1],0]);}
 }
 // In a face plane P(a,z) facing out: a semicircular band round (a, z) from radius r0 to r1 (an arch's trim) and an
 // arched opening w half-wide from z0 up to its springing z1.
 arch(P,a,z,r0,r1,col,out,segs=8){for(let i=0;i<segs;i++){const t0=Math.PI*i/segs,t1=Math.PI*(i+1)/segs;this.quad(P(a+Math.cos(t0)*r0,z+Math.sin(t0)*r0),P(a+Math.cos(t1)*r0,z+Math.sin(t1)*r0),P(a+Math.cos(t1)*r1,z+Math.sin(t1)*r1),P(a+Math.cos(t0)*r1,z+Math.sin(t0)*r1),col,out);}}
 opening(P,a,w,z0,z1,col,out,segs=8){this.quad(P(a-w,z0),P(a+w,z0),P(a+w,z1),P(a-w,z1),col,out);const pts=[];for(let i=0;i<=segs;i++){const t=Math.PI*i/segs;pts.push(P(a+Math.cos(t)*w,z1+Math.sin(t)*w));}this.poly(pts,col,out);}
 mesh(name,material,shadow=true){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(this.t,2));g.computeBoundingSphere();
  const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.castShadow=shadow;mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;return mesh;
 }
}

// ---------- Materials
const NOISE=`float mlH(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float mlN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mlH(i),mlH(i+vec2(1,0)),f.x),mix(mlH(i+vec2(0,1)),mlH(i+vec2(1,1)),f.x),f.y);}`;
// A façade: its texture's dark texels are glass (glossy, a little metallic, each pane its own shade or curtain:
// `cells` panes per repeat), the rest takes broad blotches and rain streaks from the world position, so the repeat
// never shows. glass:false for masonry (no panes).
function facadeMaterial(name,map,{cells=[1,1],glass=true,vary=.6,grime=.2,rough=.9,glassRough=.1,glassMetal=.5,seed=0}={}){
 const m=new THREE.MeshStandardMaterial({name,map,vertexColors:true,roughness:rough,metalness:0});
 const f=x=>x.toFixed(3);
 m.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vMlPos;varying vec3 vMlN;')
   .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvMlPos=(modelMatrix*vec4(transformed,1.)).xyz;vMlN=normalize(mat3(modelMatrix)*objectNormal);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vMlPos;varying vec3 vMlN;float mlGlass=0.;
${NOISE}`).replace('#include <color_fragment>',`#include <color_fragment>
{vec3 n=normalize(vMlN);float side=1.-abs(n.y);vec2 q=abs(n.y)>.7?vMlPos.xz:(abs(n.x)>abs(n.z)?vec2(vMlPos.z,vMlPos.y):vec2(vMlPos.x,vMlPos.y));vec3 col=diffuseColor.rgb;
${glass?`float lum=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));mlGlass=(1.-smoothstep(.05,.13,lum))*side;
vec2 cell=floor(vMapUv*vec2(${f(cells[0])},${f(cells[1])}));float h=mlH(cell+${f(seed)}),h2=mlH(cell*1.37+${f(seed+3.1)});
col*=mix(1.,.55+.95*h,mlGlass*${f(vary)});col=mix(col,vec3(.16,.13,.09),mlGlass*step(.88,h2)*.7);col=mix(col,vec3(.11,.12,.13),mlGlass*step(h2,.08)*.6);`:''}
float blot=mlN(q*.06+${f(seed*3.1)})*.6+mlN(q*.27)*.4;float streak=smoothstep(.45,.9,mlN(vec2(q.x*1.3,vMlPos.y*.03+${f(seed)})));
col*=(.88+.2*blot)*(1.-${f(grime)}*streak*side*(1.-mlGlass));diffuseColor.rgb=col;}`)
   .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,${f(glassRough)},mlGlass);`)
   .replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,${f(glassMetal)},mlGlass);`);
 };
 m.customProgramCacheKey=()=>'minhocao-marcos-v1-'+name;
 return m;
}

// ---------- Textures (canvas; one repeat each)
const wrap=(w,h,x,y,s,fn)=>{for(const dx of [-w,0,w])for(const dy of [-h,0,h])if(x+dx+s>0&&x+dx-s<w&&y+dy+s>0&&y+dy-s<h)fn(x+dx,y+dy);};
function grain(ctx,amount,r){const img=ctx.getImageData(0,0,ctx.canvas.width,ctx.canvas.height),d=img.data;for(let i=0;i<d.length;i+=4){const n=(r()-.5)*amount;d[i]+=n;d[i+1]+=n;d[i+2]+=n;}ctx.putImageData(img,0,0);}
function blotches(ctx,w,h,r,count,light,dark,size,alpha){for(let k=0;k<count;k++){const x=r()*w,y=r()*h,s=size*(.3+r()),c=r()<.5?light:dark,a=alpha*(.4+r());wrap(w,h,x,y,s,(px,py)=>{const g=ctx.createRadialGradient(px,py,0,px,py,s);g.addColorStop(0,`rgba(${c},${a})`);g.addColorStop(1,`rgba(${c},0)`);ctx.fillStyle=g;ctx.fillRect(px-s,py-s,2*s,2*s);});}}
// Glass in a window opening: the sky's gradient, and what shows behind (curtains, blinds, a dark open window).
function pane(ctx,x,y,w,h,r,{tone=46,blue=14,inside=true}={}){
 const v=tone+r()*22,g=ctx.createLinearGradient(x,y,x+w*.3,y+h);g.addColorStop(0,`rgb(${v+10},${v+14},${v+blue+16})`);g.addColorStop(1,`rgb(${v-12},${v-9},${v+blue-8})`);ctx.fillStyle=g;ctx.fillRect(x,y,w,h);
 if(!inside)return;const k=r();
 if(k<.22){ctx.fillStyle=`rgba(${110+r()*60|0},${96+r()*50|0},${70+r()*50|0},${.35+r()*.3})`;const cw=w*(.25+r()*.5);ctx.fillRect(r()<.5?x:x+w-cw,y,cw,h);}
 else if(k<.36){ctx.fillStyle='rgba(120,120,116,.45)';const bh=h*(.2+r()*.75);for(let yy=y;yy<y+bh;yy+=Math.max(2,h/14))ctx.fillRect(x,yy,w,Math.max(1,h/28));}
 else if(k<.42){ctx.fillStyle='rgba(6,6,6,.8)';ctx.fillRect(x,y,w*(.4+r()*.6),h);}
}
const TEX={
 // Copan, behind the brise-soleil (6 bays of 2 m × 6 floors): white tiled parapet, a window band in white frames,
 // the shade under the fin above each floor.
 copan:fh=>canvasTexture((ctx,w,h)=>{
  const r=random(101),bays=6,floors=6,bw=w/bays,fp=h/floors,m=fp/fh;
  ctx.fillStyle='#dedcd5';ctx.fillRect(0,0,w,h);
  for(let f=0;f<floors;f++){const y0=h-(f+1)*fp;
   for(let b=0;b<bays*2;b++){const x=b*bw/2;pane(ctx,x+3,y0+.34*m,bw/2-6,1.62*m,r,{tone:40});}
   ctx.fillStyle='#ecebe6';for(let b=0;b<=bays*2;b++)ctx.fillRect(b*bw/2-3,y0+.3*m,6,1.7*m);
   ctx.fillStyle='rgba(255,255,255,.5)';ctx.fillRect(0,y0+1.96*m,w,3);
   // Tiles (pastilhas) on the parapet: a faint grid.
   ctx.fillStyle='rgba(120,118,110,.12)';for(let x=0;x<w;x+=5)ctx.fillRect(x,y0+2.0*m,1,fp-2.0*m);for(let y=y0+2.0*m;y<y0+fp;y+=5)ctx.fillRect(0,y,w,1);
   const g=ctx.createLinearGradient(0,y0,0,y0+.9*m);g.addColorStop(0,'rgba(30,32,34,.55)');g.addColorStop(1,'rgba(30,32,34,0)');ctx.fillStyle=g;ctx.fillRect(0,y0,w,.9*m);
  }
  blotches(ctx,w,h,r,40,'255,255,250','80,78,72',60,.06);grain(ctx,10,r);
 },768,1024,true),
 // Edifício Itália (10 bays of 1.4 m × 8 floors): beige-grey aluminium spandrels, dark bronze mullions, smoked glass.
 italia:()=>canvasTexture((ctx,w,h)=>{
  const r=random(203),bays=10,floors=8,bw=w/bays,fp=h/floors,m=fp/3.28;
  ctx.fillStyle='#a49d91';ctx.fillRect(0,0,w,h);
  for(let f=0;f<floors;f++){const y0=h-(f+1)*fp;
   for(let b=0;b<bays;b++)pane(ctx,b*bw,y0,bw,2.15*m,r,{tone:38,blue:18});
   ctx.fillStyle='#3a352f';for(let b=0;b<=bays;b++)ctx.fillRect(b*bw-2,y0,4,2.15*m);ctx.fillRect(0,y0+2.15*m-3,w,5);ctx.fillRect(0,y0,w,3);
   ctx.fillStyle='rgba(60,56,50,.35)';for(let k=1;k<4;k++)ctx.fillRect(0,y0+2.15*m+k*.27*m,w,1.5);
   const g=ctx.createLinearGradient(0,y0+2.15*m,0,y0+fp);g.addColorStop(0,'rgba(255,250,240,.0)');g.addColorStop(1,'rgba(255,250,240,.12)');ctx.fillStyle=g;ctx.fillRect(0,y0+2.15*m,w,fp-2.15*m);
  }
  blotches(ctx,w,h,r,30,'240,235,225','60,55,50',50,.05);grain(ctx,8,r);
 },512,1024,true),
 // Ex-Hilton, between two ribs (8 bays × 8 floors): board-marked concrete spandrels and recessed windows.
 hilton:()=>canvasTexture((ctx,w,h)=>{
  const r=random(307),bays=8,floors=8,bw=w/bays,fp=h/floors,m=fp/3.35;
  ctx.fillStyle='#9d9a93';ctx.fillRect(0,0,w,h);
  for(let k=0;k<h;k+=6){ctx.fillStyle=`rgba(${r()<.5?60:200},${r()<.5?60:200},${r()<.5?58:196},.05)`;ctx.fillRect(0,k,w,3);}
  for(let f=0;f<floors;f++){const y0=h-(f+1)*fp;
   for(let b=0;b<bays;b++){const x=b*bw;pane(ctx,x+4,y0+.22*m,bw-8,1.9*m,r,{tone:36});ctx.fillStyle='#2f2f2d';ctx.fillRect(x+bw/2-1.5,y0+.22*m,3,1.9*m);ctx.fillStyle='rgba(20,20,20,.5)';ctx.fillRect(x+4,y0+2.12*m-4,bw-8,4);}
   ctx.fillStyle='rgba(40,40,38,.25)';ctx.fillRect(0,y0+2.12*m,w,4);
  }
  blotches(ctx,w,h,r,60,'210,208,200','50,48,45',45,.08);grain(ctx,18,r);
 },512,1024,true),
 // Edifício Esther (8 bays of 1.2 m × 4 floors): white bands and ribbon windows in thin dark steel frames.
 esther:()=>canvasTexture((ctx,w,h)=>{
  const r=random(409),bays=8,floors=4,bw=w/bays,fp=h/floors,m=fp/3.6;
  ctx.fillStyle='#e9e7e0';ctx.fillRect(0,0,w,h);
  for(let f=0;f<floors;f++){const y0=h-(f+1)*fp;
   for(let b=0;b<bays;b++){pane(ctx,b*bw,y0+.35*m,bw/2,1.75*m,r,{tone:74,blue:6});pane(ctx,b*bw+bw/2,y0+.35*m,bw/2,1.75*m,r,{tone:74,blue:6});}
   ctx.fillStyle='#55585a';for(let b=0;b<=bays*2;b++)ctx.fillRect(b*bw/2-1.5,y0+.35*m,3,1.75*m);ctx.fillRect(0,y0+.35*m+.55*m,w,2);ctx.fillRect(0,y0+.35*m,w,2);ctx.fillRect(0,y0+2.1*m-2,w,2);
   const g=ctx.createLinearGradient(0,y0+2.1*m,0,y0+fp);g.addColorStop(0,'rgba(80,78,70,.22)');g.addColorStop(.3,'rgba(80,78,70,0)');ctx.fillStyle=g;ctx.fillRect(0,y0+2.1*m,w,fp-2.1*m);
  }
  blotches(ctx,w,h,r,40,'255,255,250','90,86,78',50,.07);grain(ctx,10,r);
 },512,768,true),
 // Edifício Andraus (8 bays of 1.5 m × 8 floors): white floor bands, blue-black glass, dark mullions.
 andraus:()=>canvasTexture((ctx,w,h)=>{
  const r=random(503),bays=8,floors=8,bw=w/bays,fp=h/floors,m=fp/2.87;
  ctx.fillStyle='#e3e1da';ctx.fillRect(0,0,w,h);
  for(let f=0;f<floors;f++){const y0=h-(f+1)*fp;
   for(let b=0;b<bays;b++)pane(ctx,b*bw,y0,bw,2.02*m,r,{tone:30,blue:16});
   ctx.fillStyle='#202428';for(let b=0;b<=bays;b++)ctx.fillRect(b*bw-2,y0,4,2.02*m);ctx.fillRect(0,y0+2.02*m-2,w,4);
   ctx.fillStyle='rgba(150,148,140,.3)';ctx.fillRect(0,y0+2.02*m+2,w,2);
  }
  blotches(ctx,w,h,r,40,'255,255,250','70,68,62',50,.06);grain(ctx,9,r);
 },512,1024,true),
 // A podium (4 bays of 3 m × 5 floors, the ground floor shops at the bottom): grey stone and large windows.
 podium:()=>canvasTexture((ctx,w,h)=>{
  const r=random(601),bays=4,floors=5,bw=w/bays,fp=h/floors;
  ctx.fillStyle='#8e8a83';ctx.fillRect(0,0,w,h);
  for(let y=0;y<h;y+=fp/4){ctx.fillStyle='rgba(50,48,44,.18)';ctx.fillRect(0,y,w,1.5);}
  for(let f=0;f<floors;f++){const y0=h-(f+1)*fp;
   for(let b=0;b<bays;b++){const x=b*bw;if(f===0){pane(ctx,x+6,y0+fp*.1,bw-12,fp*.86,r,{tone:42});ctx.fillStyle='#2a2a28';ctx.fillRect(x+6,y0+fp*.1,bw-12,5);ctx.fillRect(x+bw/2-2,y0+fp*.1,4,fp*.86);}
    else{pane(ctx,x+12,y0+fp*.22,bw-24,fp*.56,r,{tone:38});ctx.fillStyle='#d9d6ce';ctx.fillRect(x+10,y0+fp*.78,bw-20,4);}}
  }
  blotches(ctx,w,h,r,40,'200,198,190','40,38,35',40,.08);grain(ctx,14,r);
 },512,640,true),
 // Casa Caetano de Campos, one bay (4.2 m) of the whole façade (18.3 m): rusticated ground floor with segmental
 // windows, string courses, the piano nobile's pedimented windows, the top floor's, the frieze and the balustrade.
 caetano:()=>canvasTexture((ctx,w,h)=>{
  const r=random(709),m=h/18.3,Y=z=>h-z*m,salmon='#e6b09a',white='#f3eee6',shade='rgba(120,60,45,.18)';
  ctx.fillStyle=salmon;ctx.fillRect(0,0,w,h);
  // Ground floor: rustication grooves.
  for(let z=.45;z<5.4;z+=.45){ctx.fillStyle=shade;ctx.fillRect(0,Y(z),w,2);}
  const win=(x0,z0,ww,hh,head)=>{const X=w/2-ww*m/2;ctx.fillStyle=white;ctx.fillRect(X-.16*m,Y(z0+hh+.16),ww*m+.32*m,(hh+.32)*m);pane(ctx,X,Y(z0+hh),ww*m,hh*m,r,{tone:38});ctx.fillStyle='#ece6da';ctx.fillRect(w/2-2,Y(z0+hh),4,hh*m);ctx.fillRect(X,Y(z0+hh*.62),ww*m,3);
   if(head==='arch'){ctx.fillStyle=salmon;ctx.beginPath();ctx.moveTo(X-.16*m,Y(z0+hh+.16));ctx.lineTo(X+ww*m+.16*m,Y(z0+hh+.16));ctx.lineTo(X+ww*m+.16*m,Y(z0+hh+.5));ctx.lineTo(X-.16*m,Y(z0+hh+.5));ctx.fill();ctx.fillStyle=white;ctx.beginPath();ctx.ellipse(w/2,Y(z0+hh)+.02*m,(ww/2+.18)*m,.42*m,0,Math.PI,2*Math.PI);ctx.fill();ctx.fillStyle='#38383a';ctx.beginPath();ctx.ellipse(w/2,Y(z0+hh)+.02*m,ww/2*m,.26*m,0,Math.PI,2*Math.PI);ctx.fill();ctx.fillStyle=white;ctx.fillRect(w/2-.17*m,Y(z0+hh+.5),.34*m,.5*m);}
   if(head==='pediment'){ctx.fillStyle=white;ctx.beginPath();ctx.moveTo(X-.35*m,Y(z0+hh+.3));ctx.lineTo(w/2,Y(z0+hh+.95));ctx.lineTo(X+ww*m+.35*m,Y(z0+hh+.3));ctx.fill();ctx.fillStyle='rgba(60,40,30,.35)';ctx.fillRect(X-.35*m,Y(z0+hh+.3),ww*m+.7*m,3);}
   if(head==='cornice'){ctx.fillStyle=white;ctx.fillRect(X-.3*m,Y(z0+hh+.42),ww*m+.6*m,.22*m);ctx.fillStyle='rgba(60,40,30,.35)';ctx.fillRect(X-.3*m,Y(z0+hh+.2),ww*m+.6*m,2);}
   ctx.fillStyle=white;ctx.fillRect(X-.25*m,Y(z0-.02),ww*m+.5*m,.14*m);};
  win(0,1.1,1.5,3.0,'arch');
  // String courses, pilasters, the upper windows (a little balustrade under the piano nobile's).
  for(const [z,t] of [[5.4,.5],[10.9,.38],[15.4,.25]]){ctx.fillStyle=white;ctx.fillRect(0,Y(z+t),w,t*m);ctx.fillStyle='rgba(60,40,30,.3)';ctx.fillRect(0,Y(z)-2,w,2);}
  for(const x of [0,w]){ctx.fillStyle='#ecbaa5';ctx.fillRect(x-.3*m,Y(15.4),.6*m,(15.4-5.9)*m);ctx.fillStyle=white;ctx.fillRect(x-.38*m,Y(15.4),.76*m,.3*m);ctx.fillRect(x-.38*m,Y(10.9),.76*m,.25*m);}
  ctx.fillStyle=white;for(let k=0;k<6;k++)ctx.fillRect(w/2-.9*m+k*.34*m,Y(6.75),.14*m,.75*m);ctx.fillRect(w/2-1*m,Y(6.8),2*m,.1*m);
  win(0,6.85,1.5,3.0,'pediment');win(0,12.0,1.4,2.55,'cornice');
  // Frieze and the balustrade over the cornice (geometry casts the cornice itself).
  ctx.fillStyle=white;ctx.fillRect(0,Y(16.5),w,(16.5-15.65)*m);ctx.fillStyle='rgba(60,40,30,.25)';for(let x=.25*m;x<w;x+=.7*m)ctx.fillRect(x,Y(16.3),.08*m,.45*m);
  ctx.fillStyle='#d7d1c6';ctx.fillRect(0,Y(18.3),w,(18.3-16.5)*m);ctx.fillStyle=white;ctx.fillRect(0,Y(18.3),w,.22*m);ctx.fillRect(0,Y(16.75),w,.25*m);
  for(let x=.12*m;x<w;x+=.32*m){ctx.fillStyle=white;ctx.beginPath();ctx.ellipse(x+.08*m,Y(17.3),.1*m,.42*m,0,0,2*Math.PI);ctx.fill();}
  for(const x of [0,w]){ctx.fillStyle=white;ctx.fillRect(x-.3*m,Y(18.3),.6*m,1.8*m);}
  blotches(ctx,w,h,r,40,'240,190,170','90,50,40',50,.07);grain(ctx,10,r);
 },256,1024,true),
 // Red-brown stone and brick of the Consolação church (4 m): courses of blocks, each its own tone, worn mortar.
 brick:()=>canvasTexture((ctx,w,h)=>{
  const r=random(811),rows=12,rh=h/rows;ctx.fillStyle='#4e332b';ctx.fillRect(0,0,w,h);
  for(let j=0;j<rows;j++){let x=-(j%2)*w/8;while(x<w){const bw=w/5*(.7+r()*.5),k=.82+r()*.32,c=[124*k,70*k,54*k];ctx.fillStyle=`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;ctx.fillRect(x+2,j*rh+2,bw-4,rh-4);if(x+bw>w)ctx.fillRect(x+2-w,j*rh+2,bw-4,rh-4);x+=bw;}}
  blotches(ctx,w,h,r,60,'170,120,95','40,26,22',40,.12);grain(ctx,16,r);
 },512,512,true),
 // Painted concrete (8 m): pour patches, rain streaks, pores. Tinted per part by the vertex colours.
 concrete:()=>canvasTexture((ctx,w,h)=>{const r=random(5);ctx.fillStyle='#dcdbd6';ctx.fillRect(0,0,w,h);blotches(ctx,w,h,r,70,'255,255,250','70,72,72',90,.06);for(let k=0;k<26;k++){ctx.fillStyle=`rgba(40,40,40,${.03+r()*.05})`;ctx.fillRect(0,r()*h,w,1);}grain(ctx,20,r);},512,512,true),
 // Shop and lobby glazing (3 m): four panes in dark aluminium.
 glass:()=>canvasTexture((ctx,w,h)=>{const r=random(31);for(let j=0;j<2;j++)for(let i=0;i<2;i++)pane(ctx,i*w/2,j*h/2,w/2,h/2,r,{tone:36,inside:j===0});ctx.fillStyle='#2a2c2e';for(const x of [0,w/2,w])ctx.fillRect(x-3,0,6,h);for(const y of [0,h/2,h])ctx.fillRect(0,y-3,w,6);},256,256,true)
};

// ---------- The lap's driving space (asphalt and walls, DRIVE metres over the road)
function lapSpace(data){
 const A=data.samples,N=A.length,CELL=8,cells=new Map(),key=(i,j)=>i*131071+j;
 const st=A.map(p=>{const tl=Math.hypot(p[7],p[8])||1,nl=Math.hypot(p[9],p[10])||1,q={s:p[0],x:p[1],y:p[2],z:p[3],cf:p[5],n:[p[9]/nl,p[10]/nl],back:[0,0]};for(const [k,side] of [[0,-1],[1,1]])q.back[k]=p[4]/2+guardrailClearance(data,p[0],side)+(guardrailPresent(data,p[0],side)?.75:0);q.t=[p[7]/tl,p[8]/tl];return q;});
 for(let i=0;i<N;i++){const p=st[i],q=st[(i+1)%N],r=Math.max(...p.back,...q.back)+2;
  for(let ci=Math.floor((Math.min(p.x,q.x)-r)/CELL);ci<=Math.floor((Math.max(p.x,q.x)+r)/CELL);ci++)for(let cj=Math.floor((Math.min(p.y,q.y)-r)/CELL);cj<=Math.floor((Math.max(p.y,q.y)+r)/CELL);cj++){const k=key(ci,cj);let l=cells.get(k);if(!l)cells.set(k,l=[]);l.push(i);}}
 // The lap's roads over (x, y): lateral offset, road height, the walls' back on that side.
 function at(x,y){
  const list=cells.get(key(Math.floor(x/CELL),Math.floor(y/CELL))),out=[];if(!list)return out;
  for(const i of list){const p=st[i],q=st[(i+1)%N],dx=q.x-p.x,dy=q.y-p.y,l2=dx*dx+dy*dy||1e-9;let u=((x-p.x)*dx+(y-p.y)*dy)/l2;if(u<-.02||u>1.02)continue;u=clamp(u,0,1);
   const nx=lerp(p.n[0],q.n[0],u),ny=lerp(p.n[1],q.n[1],u),lat=(x-p.x-dx*u)*nx+(y-p.y-dy*u)*ny,k=lat>=0?1:0;
   out.push({s:p.s,lat,road:lerp(p.z,q.z,u)+lerp(p.cf,q.cf,u)*lat,back:lerp(p.back[k],q.back[k],u)});}
  return out;
 }
 // Within the walls' backs plus margin (any height): kept free for whatever stands beside a street.
 const near=(x,y,margin=0)=>at(x,y).some(h=>Math.abs(h.lat)<h.back+margin);
 // The station nearest (x, y): its tangent (streets run along the lap there).
 const nearest=(x,y)=>{let b=null,d=Infinity;for(const p of st){const e=Math.hypot(p.x-x,p.y-y);if(e<d){d=e;b=p;}}return b;};
 return {at,near,nearest};
}

// ---------- Generic buildings that cut into a landmark: trimmed back from it, or dropped
function clearGeneric(data,rings){
 const B=data.scenery?.buildings,out={trimmed:[],removed:[]};if(!B?.items?.length)return out;
 const c=Object.fromEntries(B.columns.map((k,i)=>[k,i])),rect=(x,y,w,d,h)=>{const C=Math.cos(h),S=Math.sin(h);return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[x+C*a*w/2-S*b*d/2,y+S*a*w/2+C*b*d/2]);};
 for(let i=B.items.length-1;i>=0;i--){
  const b=B.items[i];
  for(const R of rings){
   const x=b[c.x],y=b[c.y],w=b[c.w],d=b[c.d],h=b[c.heading];if(Math.hypot(x-R.c[0],y-R.c[1])>R.r+Math.hypot(w,d)/2+1)continue;
   if(!ringsHit(rect(x,y,w-.3,d-.3,h),R.pts))continue;
   // The least cut from one side that frees the landmark; more than half of the building: it goes.
   const C=Math.cos(h),S=Math.sin(h);let best=null;
   for(const [axis,sign] of [[0,1],[0,-1],[1,1],[1,-1]]){const dim=axis?d:w;for(let cut=.5;cut<=dim*.5;cut+=.5){
    const nw=axis?w:w-cut,nd=axis?d-cut:d,sh=-sign*cut/2,nx=x+(axis?-S*sh:C*sh),ny=y+(axis?C*sh:S*sh);
    if(!ringsHit(rect(nx,ny,nw-.3,nd-.3,h),R.pts)){if(!best||cut/dim<best.f)best={f:cut/dim,nx,ny,nw,nd};break;}}}
   if(!best){B.items.splice(i,1);out.removed.push({x:+x.toFixed(1),y:+y.toFixed(1),w:+w.toFixed(1),d:+d.toFixed(1),h:b[c.h],by:R.kind});break;}
   b[c.x]=best.nx;b[c.y]=best.ny;b[c.w]=best.nw;b[c.d]=best.nd;out.trimmed.push({x:+x.toFixed(1),y:+y.toFixed(1),h:b[c.h],by:R.kind,cut:+(best.f*100).toFixed(0)+'%'});
  }
 }
 return out;
}

// ---------- Shared pieces
// Ground under a plan ring: each edge's lowest (just outside the wall too), the lowest and highest overall.
function footing(pts,gAt){
 let lo=Infinity,hi=-Infinity;const low=[];
 for(let i=0;i<pts.length;i++){
  const a=pts[i],b=pts[(i+1)%pts.length],[nx,ny]=edgeOut(a,b),n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2));let e=Infinity;
  for(let k=0;k<=n;k++){const x=lerp(a[0],b[0],k/n),y=lerp(a[1],b[1],k/n);for(const o of [0,1.2]){const z=gAt(x+nx*o,y+ny*o);e=Math.min(e,z);if(!o)hi=Math.max(hi,z);}}
  low.push(e);lo=Math.min(lo,e);
 }
 return {lo,hi,low};
}
const level=(pts,z)=>({low:pts.map(()=>z)});
// Plain walls round a ring from each edge's foot (below ground) or `from`, to z1.
function shell(T,pts,foot,z1,col,{from=null}={}){for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];T.wall(a,b,from??foot.low[i]-.6,z1,col);}}
// A parapet ring t thick: the outer face (unless the façade carries it), the inner face and the coping.
function parapet(T,pts,z0,h,t,col,{outer=true}={}){
 const inner=offset(pts,-t);
 for(let i=0;i<pts.length;i++){const j=(i+1)%pts.length,a=pts[i],b=pts[j],A=inner[i],B=inner[j],n=edgeOut(a,b);
  if(outer)T.wall(a,b,z0,z0+h,col);T.quad([A[0],A[1],z0],[B[0],B[1],z0],[B[0],B[1],z0+h],[A[0],A[1],z0+h],mul(col,.9),[-n[0],-n[1],0]);T.quad([a[0],a[1],z0+h],[b[0],b[1],z0+h],[B[0],B[1],z0+h],[A[0],A[1],z0+h],col,[0,0,1]);}
}
// A band round a ring `out` metres proud of the wall, z0..z1 (cornices, string courses, slab edges, marquises).
function cornice(T,pts,z0,z1,out,col){const o=offset(pts,out);T.ledge([...pts,pts[0]],[...o,o[0]],z0,z1,col,{caps:false});}
// Rooftop boxes (plant rooms, water tanks) inside a ring, clear of its edge.
function rooftop(T,pts,z,count,rand,col,{min=2.5,max=6,rise=[2,4]}={}){
 const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);let made=0;
 for(let k=0;k<count*15&&made<count;k++){
  const w=min+rand()*(max-min),d=min+rand()*(max-min),h=rand()*Math.PI,x=lerp(x0,x1,rand()),y=lerp(y0,y1,rand()),f=frame(x,y,z,h);
  if(![[-1,-1],[1,-1],[1,1],[-1,1]].every(([a,b])=>{const p=f(a*(w/2+1),b*(d/2+1),0);return inside(p[0],p[1],pts);}))continue;
  T.box(f,-w/2,w/2,-d/2,d/2,0,rise[0]+rand()*(rise[1]-rise[0]),mul(col,.9+rand()*.15));made++;
 }
 return made;
}
// A façade over plan edges: u runs on along them (metres / ru), v = (z - base) / rv; z0 a height or z0(edge).
function facade(T,pts,edges,z0,z1,col,ru,rv,base){
 let s=0;const n=pts.length;
 for(const i of edges){const a=pts[i],b=pts[(i+1)%n],l=Math.hypot(b[0]-a[0],b[1]-a[1]);T.wall(a,b,typeof z0==='function'?z0(i):z0,z1,col,s/ru,(s+l)/ru,z=>(z-base)/rv);s+=l;}
 return s;
}
const allEdges=pts=>[...pts.keys()];
// The main front of a building: the longest line of parallel edges facing the same way (a façade broken by shallow
// projections counts as one). Its outward normal, direction (along the edges), the middle of its length on its
// outermost line, the length.
function frontLine(pts){
 const n=pts.length,c=centroid(pts),groups=[];
 for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l<.3)continue;const [nx,ny]=edgeOut(a,b),off=(a[0]-c[0])*nx+(a[1]-c[1])*ny;
  let g=groups.find(g=>g.nx*nx+g.ny*ny>.99&&Math.abs(off-g.off)<2.5);if(!g)groups.push(g={nx,ny,off,len:0,edges:[]});g.len+=l;g.edges.push(i);}
 const g=groups.sort((a,b)=>b.len-a.len)[0],t=[-g.ny,g.nx];let t0=Infinity,t1=-Infinity,o=-Infinity;
 for(const i of g.edges)for(const p of [pts[i],pts[(i+1)%n]]){const dx=p[0]-c[0],dy=p[1]-c[1];t0=Math.min(t0,dx*t[0]+dy*t[1]);t1=Math.max(t1,dx*t[0]+dy*t[1]);o=Math.max(o,dx*g.nx+dy*g.ny);}
 const tm=(t0+t1)/2;return {n:[g.nx,g.ny],t,heading:Math.atan2(t[1],t[0]),mid:[c[0]+t[0]*tm+g.nx*o,c[1]+t[1]*tm+g.ny*o],length:t1-t0,edges:g.edges};
}

// ---------- Edifício Copan (1966): 118 m, 37 levels, the S-curved slab with its brise-soleil
function copan(m,K){
 const {T,gAt,mobile,rand}=K;let pts=ringOf(m.outline);if(mobile)pts=simplify(pts,.45);
 const n=pts.length,foot=footing(pts,gAt),H=m.height??118,levels=m.levels??37,fh=H/levels,lo=foot.lo,top=lo+H;
 const white=lin(0xe4e2dc),fin=patchy(lin(0xeceae4),.1,14),cream=lin(0xd8d4ca),len=i=>Math.hypot(pts[(i+1)%n][0]-pts[i][0],pts[(i+1)%n][1]-pts[i][1]);
 // Façade edges: on long smooth runs with the slab's depth behind them (not its ends, not the stair cores).
 const front=new Array(n).fill(false),R=runs(pts,.6);
 for(const r of R)if(r.length>=15)for(const i of r.edges)if(inwardDepth(pts,i)<40)front[i]=true;
 // Each façade edge's first floor with brise: above the shop gallery at that edge's ground.
 const k0=pts.map((p,i)=>{let g=-Infinity;const b=pts[(i+1)%n];for(let k=0;k<=4;k++)g=Math.max(g,gAt(lerp(p[0],b[0],k/4),lerp(p[1],b[1],k/4)));return Math.max(2,Math.ceil((g+5.2-lo)/fh));});
 // Walls: the gallery's glass, a band, the tiled façade behind the fins; the ends and the cores plain.
 const FR=12,FV=6*fh;let s=0;
 for(let i=0;i<n;i++){
  const a=pts[i],b=pts[(i+1)%n],l=len(i),zg=lo+k0[i]*fh;
  if(front[i]){T.glass.wall(a,b,foot.low[i]-.6,zg-.55,[.9,.9,.9],s/3,(s+l)/3,z=>z/3);T.concrete.wall(a,b,zg-.55,zg,cream);T.copan.wall(a,b,zg,top,[1,1,1],s/FR,(s+l)/FR,z=>(z-lo)/FV);}
  else T.concrete.wall(a,b,foot.low[i]-.6,top,patchy(white,.14,6));
  s+=l;
 }
 // The brise-soleil: a deep concrete fin at every floor along the façade runs; the gallery's marquise.
 const DEPTH=mobile?1:1.15,TH=.3;let fins=0;
 for(const r of R){
  const groups=[];for(const i of r.edges){if(!front[i])continue;const g=groups.at(-1);if(g&&(g.at(-1)+1)%n===i)g.push(i);else groups.push([i]);}
  for(const g of groups){
   const inner=[...g.map(i=>pts[i]),pts[(g.at(-1)+1)%n]],outer=offset(inner,DEPTH,false),marq=offset(inner,2.3,false);
   for(let k=Math.min(...g.map(i=>k0[i]));k<=levels;k++){
    const z=lo+k*fh;let run=null;
    const flush=()=>{if(run){T.concrete.ledge(run.map(j=>inner[j]),run.map(j=>outer[j]),z-TH,z,fin,{bottom:!mobile});fins++;run=null;}};
    for(let e=0;e<g.length;e++){if(k>=k0[g[e]]){if(!run)run=[e];run.push(e+1);}else flush();}
    flush();
   }
   for(let e=0;e<g.length;e++){const zg=lo+k0[g[e]]*fh-.55;T.concrete.ledge([inner[e],inner[e+1]],[marq[e],marq[e+1]],zg-.32,zg,cream);}
  }
 }
 // Roof: the slab, its parapet, plant rooms and water tanks.
 T.concrete.slab(pts,top,lin(0x8f8d86));parapet(T.concrete,pts,top,1.1,.25,white);
 rooftop(T.concrete,pts,top,mobile?4:9,rand,lin(0xcfccc4),{min:3,max:7,rise:[2.4,4.5]});
 return {top:+top.toFixed(1),fh:+fh.toFixed(2),facadeEdges:front.filter(Boolean).length,fins};
}

// ---------- Edifício Itália (1965): 46 levels, the Terraço Itália's crown and deck at 151 m, 165 m to the top
function italia(m,K){
 const {T,gAt,mobile,rand}=K;let pts=ringOf(m.outline);if(mobile)pts=simplify(pts,.35);
 const n=pts.length,foot=footing(pts,gAt),lo=foot.lo,H=m.height??165,deck=m.deck_m??151,levels=m.levels??46,fh=deck/levels;
 const lobby=lo+2*fh,shaft=lo+(levels-3)*fh,crown=lo+deck,all=allEdges(pts),light=lin(0xd9d4ca),bronze=lin(0x3a3530);
 // Lobby glass under a marquise; the office floors; the restaurant's taller glazing between white bands.
 facade(T.glass,pts,all,i=>foot.low[i]-.6,lobby,[.85,.85,.85],3,3,lo);cornice(T.concrete,pts,lobby-.25,lobby+.05,2.2,light);
 facade(T.italia,pts,all,lobby,shaft,[1,1,1],14,8*fh,lobby);
 facade(T.glass,pts,all,shaft+.9,crown-1.2,[.7,.72,.76],2.4,crown-shaft-2.1,shaft+.9);
 cornice(T.concrete,pts,shaft,shaft+.9,.15,light);cornice(T.concrete,pts,crown-1.2,crown,.35,light);
 // A shallow aluminium sill under each floor's windows along the long faces: the bands read in relief.
 let sills=0;if(!mobile)for(const r of runs(pts,.6)){if(r.length<10)continue;const inner=[...r.edges.map(i=>pts[i]),pts[(r.edges.at(-1)+1)%n]],outer=offset(inner,.32,false);
  for(let j=1;lobby+j*fh<shaft-1;j++){const z=lobby+j*fh+1.1;T.concrete.ledge(inner,outer,z-.12,z,lin(0xa49d91),{bottom:false});sills++;}}
 // The deck: slab, glass parapet and rail; the rooftop superstructure set back (a glazed band), the top box, a mast.
 T.concrete.slab(pts,crown,lin(0x9a968e));
 const rail=offset(pts,-.15);for(let i=0;i<n;i++)T.glass.wall(rail[i],rail[(i+1)%n],crown,crown+1.1,[.8,.85,.9]);if(!mobile)cornice(T.metal,rail,crown+1.05,crown+1.12,.04,lin(0x9aa0a4));
 const c=centroid(pts),h1=hull(pts),body=scaled(h1,c,.55),cap=scaled(h1,c,.32),grey=patchy(lin(0xd6d2c8),.1,5);
 shell(T.concrete,body,level(body,crown),crown+1.4,grey);facade(T.glass,body,allEdges(body),crown+1.4,crown+3.6,[.75,.75,.78],3,2.2,crown+1.4);shell(T.concrete,body,null,crown+8.5,grey,{from:crown+3.6});
 T.concrete.slab(body,crown+8.5,lin(0x8e8b84));parapet(T.concrete,body,crown+8.5,.9,.2,light);
 shell(T.concrete,cap,null,lo+H-3.2,patchy(lin(0xc9c5bb),.1,4),{from:crown+8.5});T.concrete.slab(cap,lo+H-3.2,lin(0x8e8b84));
 T.metal.post([c[0],c[1],lo+H-3.2],[c[0],c[1],lo+H],.12,.05,6,lin(0xb8bcbe));
 rooftop(T.concrete,body,crown+8.5,mobile?2:4,rand,lin(0xbebab1),{min:2,max:4,rise:[1.5,2.8]});
 return {top:+(lo+H).toFixed(1),deck:+crown.toFixed(1),fh:+fh.toFixed(2),sills};
}

// ---------- Ex-Hilton (1971): a 110 m concrete cylinder, deep vertical ribs and floor bands, on a podium
function hilton(m,K){
 const {T,gAt,mobile,lap,free}=K,pts0=ringOf(m.outline),c=centroid(pts0),R=pts0.reduce((s,p)=>s+Math.hypot(p[0]-c[0],p[1]-c[1]),0)/pts0.length;
 const foot=footing(pts0,gAt),lo=foot.lo,H=m.height??110.4,levels=m.levels??33,fh=H/levels,podium=lo+4*fh,shaftTop=lo+H-2*fh,concrete=patchy(lin(0xa29f97),.12,7);
 // The podium: a rectangle along the street (the lap's direction nearby), as far as the neighbours allow.
 const st=lap.nearest(c[0],c[1]),h=Math.atan2(st.t[1],st.t[0]),f=frame(c[0],c[1],0,h);
 const reach=[[1,0],[-1,0],[0,1],[0,-1]].map(([u,v])=>clamp(free(c,[Math.cos(h)*u-Math.sin(h)*v,Math.sin(h)*u+Math.cos(h)*v],R+10)-1.2,R+.6,R+9));
 const PR=[[-reach[1],-reach[3]],[reach[0],-reach[3]],[reach[0],reach[2]],[-reach[1],reach[2]]].map(([u,v])=>f(u,v,0)).map(p=>[p[0],p[1]]),pf=footing(PR,gAt);
 facade(T.podium,PR,allEdges(PR),i=>pf.low[i]-.6,podium,[.92,.91,.88],12,podium-pf.lo,pf.lo);
 T.concrete.slab(PR,podium,lin(0x84827c));parapet(T.concrete,PR,podium,1,.25,concrete);cornice(T.concrete,PR,pf.lo+fh-.1,pf.lo+fh+.35,1.6,lin(0xb3b0a8));
 // The tower: a recessed wall between ribs, floor bands proud of it, the ribs, the solid crown with a glazed band.
 const N=mobile?28:56,ring=r=>Array.from({length:N},(_,k)=>{const a=k/N*2*Math.PI;return [c[0]+Math.cos(a)*r,c[1]+Math.sin(a)*r];}),inner=ring(R-.8),outer=ring(R);
 for(let k=0;k<N;k++)T.hilton.wall(inner[k],inner[(k+1)%N],podium,shaftTop,[1,1,1],k,k+1,z=>(z-podium)/(8*fh));
 let bands=0;if(!mobile)for(let k=5;k<levels-2;k++){const z=lo+k*fh;T.concrete.ledge([...inner,inner[0]],[...outer,outer[0]],z-.28,z,concrete,{caps:false});bands++;}
 const ribs=mobile?N/2:N;for(let k=0;k<ribs;k++){const a=(k+.5)/ribs*2*Math.PI,rf=frame(c[0]+Math.cos(a)*(R-.4),c[1]+Math.sin(a)*(R-.4),0,a);T.concrete.box(rf,-.42,.42,-.17,.17,podium,shaftTop,concrete,{top:false});}
 const crownRing=ring(R+.15),crownTone=patchy(lin(0xaaa79f),.1,5);
 shell(T.concrete,crownRing,null,shaftTop+1.6,crownTone,{from:shaftTop-.3});facade(T.glass,crownRing,allEdges(crownRing),shaftTop+1.6,shaftTop+2.6,[.6,.6,.62],2,1,shaftTop+1.6);shell(T.concrete,crownRing,null,lo+H,crownTone,{from:shaftTop+2.6});
 cornice(T.concrete,crownRing,shaftTop-.3,shaftTop+.1,.35,concrete);T.concrete.slab(crownRing,lo+H,lin(0x7f7d77));parapet(T.concrete,crownRing,lo+H,.6,.2,concrete);
 T.concrete.box(frame(c[0],c[1],lo+H,h),-5,5,-3.5,3.5,0,3.2,lin(0x9d9a92));
 return {radius:+R.toFixed(1),top:+(lo+H).toFixed(1),podium:reach.map(v=>+v.toFixed(1)),bands,ribs};
}

// ---------- Casa Caetano de Campos (1894): the Escola Normal on Praça da República
function caetano(m,K){
 const {T,gAt,mobile}=K,pts=ringOf(m.outline),n=pts.length,foot=footing(pts,gAt),zf=foot.hi+.45,H=m.height??18.3,top=zf+H;
 const salmon=lin(0xe6b09a),white=lin(0xf3eee6),stone=lin(0x9b958a),roof=lin(0x5d5650),dark=[.04,.035,.03];
 // Plinth (stone), then the façade texture fitted to whole bays on every edge.
 shell(T.concrete,pts,foot,zf,stone);cornice(T.concrete,pts,zf-.1,zf+.12,.12,stone);
 const BAY=4.2,v=z=>(z-zf)/18.3;
 for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n],l=Math.hypot(b[0]-a[0],b[1]-a[1]),bays=Math.round(l/BAY);
  // Short returns take the pilaster strip of the texture (plain wall), whole bays elsewhere.
  T.caetano.wall(a,b,zf,top,[1,1,1],0,bays<1?.06*l/2:bays,v);}
 // Main cornice (proud), the string course over the ground floor, the balustrade's coping and its back.
 cornice(T.concrete,pts,zf+15.65,zf+16.35,.55,white);cornice(T.concrete,pts,zf+5.4,zf+5.85,.14,white);cornice(T.concrete,pts,top-.05,top+.15,.12,white);
 parapet(T.concrete,pts,top-1.8,1.8,.3,mul(white,.92),{outer:false});T.roof.slab(offset(pts,-.3),top-1.8,roof);
 // Quoins: white blocks up the convex corners.
 let quoins=0;if(!mobile)for(let i=0;i<n;i++){const a=pts[(i+n-1)%n],p=pts[i],b=pts[(i+1)%n];if(orient(a,p,b)<=0||Math.hypot(p[0]-a[0],p[1]-a[1])<1.5||Math.hypot(b[0]-p[0],b[1]-p[1])<1.5)continue;const e1=unit([p[0]-a[0],p[1]-a[1],0]),e2=unit([b[0]-p[0],b[1]-p[1],0]),o1=edgeOut(a,p),o2=edgeOut(p,b);
  for(let z=zf+.2,k=0;z<zf+15.4;z+=.62,k++){const w=k%2?.5:.9;for(const [e,s,o] of [[e1,-1,o1],[e2,1,o2]]){const P=(t,zz)=>[p[0]+e[0]*s*t+o[0]*.05,p[1]+e[1]*s*t+o[1]*.05,zz];T.concrete.quad(P(0,z),P(w,z),P(w,z+.52),P(0,z+.52),white,[o[0],o[1],0]);}}quoins++;}
 // The front on the square: its centre pavilion, pediment and clock tower. Frame: u along the front, v into the building.
 const fr=frontLine(pts),F=frame(fr.mid[0],fr.mid[1],zf,fr.heading),PW=Math.min(9.2,fr.length*.12),PD=1.6,out=sub(F(0,-1,0),F(0,0,0));
 const fw=(a0,v0,a1,v1,u0,u1)=>T.caetano.wall(F(a0,v0,0),F(a1,v1,0),zf,top,[1,1,1],u0,u1,v);
 fw(-PW,-PD,PW,-PD,0,4);fw(PW,-PD,PW,.3,0,.05);fw(-PW,.3,-PW,-PD,0,.05);
 T.concrete.box(F,-PW-.5,PW+.5,-PD-.6,0,15.65,16.35,white);
 // Attic over the pavilion, the triangular pediment with an oculus, its raking cornices and roof.
 T.concrete.box(F,-PW,PW,-PD,2.5,H,H+2.6,patchy(salmon,.08,4),{top:false});T.concrete.box(F,-PW-.3,PW+.3,-PD-.3,2.5,H+2.6,H+3,white);
 const PZ=H+3,PK=Math.min(3.4,PW*.38);T.concrete.poly([F(-PW-.3,-PD-.32,PZ),F(PW+.3,-PD-.32,PZ),F(0,-PD-.32,PZ+PK)],salmon,out);
 for(const sd of [-1,1])T.concrete.post(F(sd*(PW+.3),-PD-.15,PZ),F(0,-PD-.15,PZ+PK),.22,.22,4,white,{rot:Math.PI/4,top:false});
 for(const sd of [-1,1])T.roof.quad(F(sd*(PW+.3),-PD-.32,PZ),F(0,-PD-.32,PZ+PK),F(0,2.5,PZ+PK),F(sd*(PW+.3),2.5,PZ),roof,[0,0,1]);
 const disc=(r,o,z,col)=>T.paint.poly(Array.from({length:16},(_,k)=>F(Math.cos(k/16*2*Math.PI)*r,-o,z+Math.sin(k/16*2*Math.PI)*r)),col,out);
 disc(.9,PD+.36,PZ+PK*.37,white);disc(.68,PD+.38,PZ+PK*.37,dark);
 // Entrance: steps up to the floor and three arched doors in white surrounds.
 // (as many steps as the plinth stands over the ground in front, down below it)
 const gs=Math.min(...[[-6,-PD-1],[6,-PD-1],[-6,-PD-4],[6,-PD-4],[0,-PD-2.5]].map(([u,w])=>{const q=F(u,w,0);return gAt(q[0],q[1]);}))-zf,ns=clamp(Math.ceil(-gs/.16),1,14),rs=-gs/ns;
 for(let k=0;k<ns;k++)T.concrete.box(F,-5.5-k*.3,5.5+k*.3,-PD-.6-k*.38,-PD+.1,gs-.4,-k*rs,stone,{bottom:false});
 const face=(a,z)=>F(a,-PD-.03,z),trim=(a,z)=>F(a,-PD-.06,z);
 for(const u of [-3,0,3]){T.paint.opening(face,u,.9,0,3.3,dark,out);T.concrete.arch(trim,u,3.3,.9,1.15,white,out);T.concrete.quad(trim(u-1.15,0),trim(u-.9,0),trim(u-.9,3.3),trim(u-1.15,3.3),white,out);T.concrete.quad(trim(u+.9,0),trim(u+1.15,0),trim(u+1.15,3.3),trim(u+.9,3.3),white,out);}
 // Clock tower behind the pediment: a square stage with clock faces, its cornice, a slate dome, lantern and mast.
 const TS=Math.min(3.1,PW*.34),TZ=H+2.2,tf=frame(...F(0,TS+1.4,0).slice(0,2),zf,fr.heading);
 T.concrete.box(tf,-TS,TS,-TS,TS,TZ-1,TZ+5.6,patchy(salmon,.08,3),{top:false});T.concrete.box(tf,-TS-.3,TS+.3,-TS-.3,TS+.3,TZ+5.6,TZ+6.1,white);
 for(const [fu,fv] of [[0,-1],[0,1],[-1,0],[1,0]]){const o=sub(tf(fu,fv,0),tf(0,0,0)),P=(a,z)=>tf(fu?fu*(TS+.03):a,fv?fv*(TS+.03):a,z),Q=(a,z)=>tf(fu?fu*(TS+.06):a,fv?fv*(TS+.06):a,z);
  T.paint.poly(Array.from({length:16},(_,k)=>P(Math.cos(k/16*2*Math.PI)*1.25,TZ+3+Math.sin(k/16*2*Math.PI)*1.25)),white,o);
  T.paint.quad(Q(-.05,TZ+3),Q(.05,TZ+3),Q(.05,TZ+3.95),Q(-.05,TZ+3.95),dark,o);T.paint.quad(Q(0,TZ+2.95),Q(.65,TZ+2.95),Q(.65,TZ+3.05),Q(0,TZ+3.05),dark,o);}
 let pr=TS+.1,pz=TZ+6.1;for(let k=1;k<=5;k++){const t=k/5,r=(TS+.1)*Math.cos(t*Math.PI/2)**.7+.3*t,z=TZ+6.1+3.2*Math.sin(t*Math.PI/2);T.roof.post(tf(0,0,pz),tf(0,0,z),pr*1.414,r*1.414,4,lin(0x46494a,.9+k*.05),{rot:Math.PI/4,top:k===5});pr=r;pz=z;}
 T.concrete.post(tf(0,0,pz),tf(0,0,pz+1.2),.5,.45,8,white);T.metal.post(tf(0,0,pz+1.2),tf(0,0,pz+5),.06,.04,5,lin(0xc8c8c4));
 return {floor:+zf.toFixed(2),top:+top.toFixed(2),front:{length:+fr.length.toFixed(1),heading:+fr.heading.toFixed(3)},quoins};
}

// ---------- Igreja Nossa Senhora da Consolação: neo-Romanesque, red-brown stone, one 75 m front tower
function igreja(m,K){
 const {T,gAt,mobile}=K,pts=ringOf(m.outline),n=pts.length,foot=footing(pts,gAt),zf=foot.hi+.3,H=m.height??25.6,TOWER=m.tower_m??75;
 const brick=patchy([1,1,1],.12,6),dark=lin(0x6e4636),trim=lin(0xb88f78),slate=lin(0x4b4442),base=lin(0x8d7e72),win=[.035,.03,.035];
 // Long axis along the heading; the front is the end whose last metre and a half is narrowest (the tower's base
 // standing out of the façade), unless the data says (front: 1 toward +u, -1 toward -u).
 const c=Math.cos(m.heading),s=Math.sin(m.heading),U=pts.map(([x,y])=>[(x-m.x)*c+(y-m.y)*s,-(x-m.x)*s+(y-m.y)*c]),u0=Math.min(...U.map(p=>p[0])),u1=Math.max(...U.map(p=>p[0]));
 const endA=across(U,u0+1.5),endB=across(U,u1-1.5),front=m.front??(endA&&endB?(endA.width<endB.width?-1:1):-1);
 const uF=front<0?u0:u1,dir=-front,at=k=>uF+dir*k,tow=across(U,at(1.5))??{mid:0,width:10},B=clamp(tow.width,8,10.5)/2,tv=tow.mid;
 const L=frame(m.x,m.y,zf,m.heading),E=13.2;
 // Body: the outline's walls to the aisles' eaves on a stone plinth, the eaves' band, the aisle roofs.
 shell(T.concrete,pts,foot,zf+.9,base);for(let i=0;i<n;i++)T.brick.wall(pts[i],pts[(i+1)%n],zf+.9,zf+E,brick);
 cornice(T.concrete,pts,zf+E-.45,zf+E,.3,trim);cornice(T.concrete,pts,zf+.75,zf+.95,.12,base);T.roof.slab(offset(pts,-.2),zf+E-.05,slate);
 // Arched windows round the aisles, every 5 m along the longer edges, in stone surrounds.
 let windows=0;for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n],l=Math.hypot(b[0]-a[0],b[1]-a[1]),k=Math.floor(l/5);if(k<1)continue;const o=edgeOut(a,b),out=[o[0],o[1],0],h=Math.atan2(b[1]-a[1],b[0]-a[0]);
  const f=frame(a[0]+o[0]*.04,a[1]+o[1]*.04,zf,h),g=frame(a[0]+o[0]*.08,a[1]+o[1]*.08,zf,h),P=(u,z)=>f(u,0,z),Q=(u,z)=>g(u,0,z);
  for(let j=0;j<k;j++){const uu=(j+.5)*l/k;T.paint.opening(P,uu,.75,4,8.6,win,out,mobile?4:6);T.concrete.arch(Q,uu,8.6,.75,1,trim,out,mobile?4:6);T.concrete.quad(Q(uu-1,3.85),Q(uu+1,3.85),Q(uu+1,4.05),Q(uu-1,4.05),trim,out);windows++;}}
 // Nave over the aisles: clerestory with small arched windows, a gable roof to the full height.
 const rows=[];for(let k=2*B+1;k<u1-u0-3;k+=2){const x=across(U,at(k));if(x)rows.push(x);}
 const med=a=>a.sort((p,q)=>p-q)[a.length>>1],W=med(rows.map(r=>r.width))??14,vm=med(rows.map(r=>r.mid))??0,NW=clamp(W*.27,4.5,7.5);
 const ua=Math.min(at(2*B-.5),at(u1-u0-5)),ub=Math.max(at(2*B-.5),at(u1-u0-5)),NE=Math.max(E+4.5,H-NW*.95);
 T.brick.box(L,ua,ub,vm-NW,vm+NW,E-.2,NE,brick,{top:false});cornice(T.concrete,[L(ua,vm-NW,0),L(ub,vm-NW,0),L(ub,vm+NW,0),L(ua,vm+NW,0)].map(p=>[p[0],p[1]]),zf+NE-.35,zf+NE,.3,trim);
 for(const sd of [-1,1])T.roof.quad(L(ua-.4,vm+sd*(NW+.6),NE-.4),L(ub+.4,vm+sd*(NW+.6),NE-.4),L(ub+.4,vm,H),L(ua-.4,vm,H),slate,[0,0,1]);
 for(const uu of [ua,ub])T.brick.poly([L(uu,vm-NW,NE),L(uu,vm+NW,NE),L(uu,vm,H-.3)],brick,sub(L(uu+(uu===ua?-1:1),0,0),L(uu,0,0)));
 for(let uu=ua+3;uu<ub-2;uu+=4)for(const sd of [-1,1]){const P=(a,z)=>L(a,vm+sd*(NW+.04),z),o=sub(L(0,sd,0),L(0,0,0));T.paint.opening(P,uu,.5,E+1.2,E+3.2,win,o,mobile?4:6);windows++;}
 // The tower: stages with string courses, corner buttresses, the portal, paired windows, clocks, the belfry, the
 // corbel table, pinnacles, the octagonal drum and the stone spire, the cross.
 const tf=frame(...L(at(B),tv,0).slice(0,2),zf,m.heading),stages=[13,25,35,TOWER*.6],top=TOWER*.6+3.4;
 T.brick.box(tf,-B,B,-B,B,-1,top,brick,{top:false});
 for(const z of stages)T.concrete.box(tf,-B-.25,B+.25,-B-.25,B+.25,z-.45,z,trim);
 for(const [su,sv] of [[-1,-1],[1,-1],[1,1],[-1,1]]){const a0=su*(B-.4),a1=su*(B+.55),b0=sv*(B-.4),b1=sv*(B+.55);T.brick.box(tf,Math.min(a0,a1),Math.max(a0,a1),Math.min(b0,b1),Math.max(b0,b1),-1,stages[2],brick);}
 for(const [fu,fv] of [[-dir,0],[dir,0],[0,-1],[0,1]]){
  const o=sub(tf(fu,fv,0),tf(0,0,0)),P=(a,z)=>tf(fu?fu*(B+.04):a,fv?fv*(B+.04):a,z),Q=(a,z)=>tf(fu?fu*(B+.09):a,fv?fv*(B+.09):a,z);
  if(fu===-dir){T.paint.opening(P,0,1.9,0,5.4,win,o);for(let k=0;k<3;k++){const R=(a,z)=>tf(fu*(B+.09+k*.07),a,z);T.concrete.arch(R,0,5.4,1.9+k*.28,2.17+k*.28,trim,o);}}
  for(const z0 of [15.5,26.8])for(const a of [-1.1,1.1]){T.paint.opening(P,a,.45,z0,z0+3.2,win,o,6);T.concrete.arch(Q,a,z0+3.2,.45,.62,trim,o,6);}
  const cz=31.2;T.paint.poly(Array.from({length:18},(_,q)=>Q(Math.cos(q/18*2*Math.PI)*1.5,cz+Math.sin(q/18*2*Math.PI)*1.5)),lin(0xf0ece2),o);
  const H2=(a,z)=>tf(fu?fu*(B+.13):a,fv?fv*(B+.13):a,z);T.paint.quad(H2(-.05,cz),H2(.05,cz),H2(.05,cz+1.05),H2(-.05,cz+1.05),[.03,.03,.03],o);T.paint.quad(H2(0,cz-.05),H2(.7,cz-.05),H2(.7,cz+.05),H2(0,cz+.05),[.03,.03,.03],o);
  for(const a of [-1.4,1.4]){T.paint.opening(P,a,.75,36.5,TOWER*.6-1.6,win,o);T.concrete.arch(Q,a,TOWER*.6-1.6,.75,.95,trim,o);}
 }
 T.concrete.box(tf,-B-.35,B+.35,-B-.35,B+.35,top-.5,top,trim);
 for(const [su,sv] of [[-1,-1],[1,-1],[1,1],[-1,1]]){T.brick.box(tf,su*(B-.6)-.6,su*(B-.6)+.6,sv*(B-.6)-.6,sv*(B-.6)+.6,top,top+2.6,brick,{top:false});T.roof.post(tf(su*(B-.6),sv*(B-.6),top+2.6),tf(su*(B-.6),sv*(B-.6),top+7),.85,0,4,slate,{rot:Math.PI/4});}
 const sr=B*.86,sb=top+.4;T.brick.post(tf(0,0,top-.2),tf(0,0,sb+2.2),sr,sr,8,brick,{rot:Math.PI/8,top:false});T.concrete.post(tf(0,0,sb+2.2),tf(0,0,sb+2.6),sr+.25,sr+.25,8,trim,{rot:Math.PI/8});
 T.brick.post(tf(0,0,sb+2.6),tf(0,0,TOWER-1.6),sr,.18,8,p=>mul(dark,.9+.2*fbm(p[2]*.2,p[0]*.3)),{rot:Math.PI/8});
 if(!mobile)for(let k=0;k<8;k++){const a=Math.PI/8+k*Math.PI/4,r=sr*.92,o=sub(tf(Math.cos(a),Math.sin(a),0),tf(0,0,0));T.paint.quad(tf(Math.cos(a-.2)*r,Math.sin(a-.2)*r,sb+6),tf(Math.cos(a+.2)*r,Math.sin(a+.2)*r,sb+6),tf(Math.cos(a)*r*1.02,Math.sin(a)*r*1.02,sb+8.5),tf(Math.cos(a)*r*1.02,Math.sin(a)*r*1.02,sb+8.5),win,o);}
 T.metal.box(tf,-.09,.09,-.09,.09,TOWER-1.7,TOWER,lin(0x2c2a28));T.metal.box(tf,-.09,.09,-.7,.7,TOWER-.95,TOWER-.75,lin(0x2c2a28));
 // Steps down to the street across the front.
 const gs=Math.min(...[-1,-3].flatMap(k=>[tv-B-3,tv,tv+B+3].map(v=>{const q=L(at(k),v,0);return gAt(q[0],q[1]);})))-zf,ns=clamp(Math.ceil(-gs/.16),1,14),rs=-gs/ns;
 for(let k=0;k<ns;k++){const uu=at(-.2-k*.36);T.concrete.box(L,Math.min(uu,uu-dir*.4),Math.max(uu,uu-dir*.4),tv-B-3,tv+B+3,gs-.4,-k*rs,lin(0x9a948a),{bottom:false});}
 // A landing between the steps and the portal.
 T.concrete.box(L,Math.min(at(-.2),at(0)),Math.max(at(-.2),at(0)),tv-B-3,tv+B+3,gs-.4,0,lin(0x9a948a),{bottom:false});
 return {floor:+zf.toFixed(2),front:front<0?'-u':'+u',tower:{width:+(2*B).toFixed(1),top:+(zf+TOWER).toFixed(1)},nave:{width:+(2*NW).toFixed(1),eaves:+(zf+NE).toFixed(1)},windows,top:+(zf+H).toFixed(1)};
}

// ---------- Edifício Esther (1938): white bands and ribbon windows, a set-back top floor
function esther(m,K){
 const {T,gAt,mobile,rand}=K,pts=ringOf(m.outline),foot=footing(pts,gAt),lo=foot.lo,H=m.height??42,levels=m.levels??11,shop=lo+4.6,body=lo+H-3.6,fh=(body-shop)/(levels-2),white=lin(0xeeece6);
 facade(T.glass,pts,allEdges(pts),i=>foot.low[i]-.6,shop,[.9,.9,.9],3,3,lo);facade(T.esther,pts,allEdges(pts),shop,body,[1,1,1],9.6,4*fh,shop);
 // Each floor's slab edge in relief round the block, the shops' marquise, the cornice under the top floor.
 if(!mobile)for(let k=1;k<levels-2;k++)cornice(T.concrete,pts,shop+k*fh-.12,shop+k*fh+.1,.16,white);
 cornice(T.concrete,pts,shop-.3,shop+.05,1.6,white);cornice(T.concrete,pts,body-.2,body+.25,.3,white);
 // The top floor set back, a glazed band round it, its roof and the parapets.
 const top=offset(pts,-1.8),tone=patchy(white,.08,5);shell(T.concrete,top,null,body+.9,tone,{from:body});facade(T.glass,top,allEdges(top),body+.9,body+2.6,[.85,.85,.85],3,1.7,body+.9);shell(T.concrete,top,null,lo+H-.4,tone,{from:body+2.6});
 T.concrete.slab(pts,body+.25,lin(0x9d9b95));T.concrete.slab(top,lo+H-.4,lin(0x8f8d87));parapet(T.concrete,pts,body+.25,1,.2,white);parapet(T.concrete,top,lo+H-.4,.5,.15,white);
 rooftop(T.concrete,top,lo+H-.4,mobile?1:3,rand,lin(0xd4d1ca),{min:1.6,max:3,rise:[1.2,2.2]});
 return {top:+(lo+H).toFixed(1),fh:+fh.toFixed(2)};
}

// ---------- Edifício Andraus (1962): curtain-wall tower in horizontal bands on its podium, the rooftop heliport
function andraus(m,K){
 const {T,gAt,mobile}=K,pts=ringOf(m.outline),foot=footing(pts,gAt),lo=foot.lo,H=m.height??96.4,TOTAL=m.total_m??115,levels=m.levels??32,pod=lo+19,fh=(H-19)/(levels-5);
 const white=lin(0xe6e4de),grey=lin(0xa7a49d);
 facade(T.podium,pts,allEdges(pts),i=>foot.low[i]-.6,pod,[1,1,1],12,19,lo);T.concrete.slab(pts,pod,lin(0x8a8882));parapet(T.concrete,pts,pod,1,.25,grey);cornice(T.concrete,pts,lo+4.2,lo+4.6,1.8,white);
 const c=centroid(pts),tower=offset(hull(pts),-1.3);
 facade(T.andraus,tower,allEdges(tower),pod,lo+H,[1,1,1],12,8*fh,pod);
 if(!mobile)for(let k=1;k<levels-5;k++)cornice(T.metal,tower,pod+k*fh-.1,pod+k*fh+.05,.12,lin(0x8d9296));
 cornice(T.concrete,tower,lo+H-.6,lo+H,.25,white);T.concrete.slab(tower,lo+H,lin(0x8a8882));parapet(T.concrete,tower,lo+H,1.1,.2,white);
 // Machine floors, the heliport deck on legs (the 1972 rescue landed there) with its H and ring, the safety net,
 // and the banded lattice mast.
 const mr=scaled(tower,c,.55);shell(T.concrete,mr,null,lo+H+5,patchy(lin(0xd2cfc7),.1,4),{from:lo+H});T.concrete.slab(mr,lo+H+5,lin(0x86847e));
 const hz=lo+H+7.2,HS=clamp(Math.min(Math.sqrt(Math.abs(signedArea(tower)))*.42,(m.d??22)*.42-1.2),6.5,10),hf=frame(c[0],c[1],0,m.heading),yel=lin(0xe8b822),paint=lin(0xf0efe8);
 T.concrete.box(hf,-HS,HS,-HS,HS,hz-.6,hz,lin(0x5b5c5c),{bottom:true});
 for(const [su,sv] of [[-1,-1],[1,-1],[1,1],[-1,1],[0,-1],[0,1]])T.concrete.box(hf,su*(HS-1.5)-.3,su*(HS-1.5)+.3,sv*(HS-1.5)-.3,sv*(HS-1.5)+.3,lo+H+5,hz-.6,grey);
 for(let k=0;k<24;k++){const a0=k/24*2*Math.PI,a1=(k+1)/24*2*Math.PI,r0=HS*.72,r1=HS*.8;T.paint.quad(hf(Math.cos(a0)*r0,Math.sin(a0)*r0,hz+.03),hf(Math.cos(a1)*r0,Math.sin(a1)*r0,hz+.03),hf(Math.cos(a1)*r1,Math.sin(a1)*r1,hz+.03),hf(Math.cos(a0)*r1,Math.sin(a0)*r1,hz+.03),yel,[0,0,1]);}
 const HW=HS*.32,HH=HS*.45;T.paint.box(hf,-HH,HH,-HW-.5,-HW+.5,hz,hz+.04,paint,{sides:false,ends:false});T.paint.box(hf,-HH,HH,HW-.5,HW+.5,hz,hz+.04,paint,{sides:false,ends:false});T.paint.box(hf,-.5,.5,-HW+.5,HW-.5,hz,hz+.04,paint,{sides:false,ends:false});
 if(!mobile){const sq=[hf(-HS,-HS,0),hf(HS,-HS,0),hf(HS,HS,0),hf(-HS,HS,0)].map(p=>[p[0],p[1]]);T.metal.ledge([...sq,sq[0]],[...offset(sq,1.3),offset(sq,1.3)[0]],hz-.45,hz-.35,lin(0x9a9fa2),{caps:false});}
 T.metal.post(hf(HS-1.2,HS-1.2,hz),hf(HS-1.2,HS-1.2,lo+TOTAL),.55,.12,3,p=>Math.floor((p[2]-hz)/2.6)%2?lin(0xe9e7e0):lin(0xd8541e),{rot:.3});
 return {top:+(lo+TOTAL).toFixed(1),roof:+(lo+H).toFixed(1),heliport:+hz.toFixed(1)};
}

// ---------- The coreto of Praça da República: octagonal, iron columns and lace, a pointed roof
function coreto(m,K){
 const {T,gAt,mobile}=K,pts=ringOf(m.outline),c=centroid(pts),R=Math.max(3,pts.reduce((s,p)=>s+Math.hypot(p[0]-c[0],p[1]-c[1]),0)/pts.length),foot=footing(pts,gAt),zf=foot.hi+1.05,H=m.height??7;
 const iron=lin(0x2c4a3a),cream=lin(0xe8e1d0),stone=lin(0xa29c90),zinc=lin(0x434a4c),f=frame(c[0],c[1],0,m.heading??0);
 const oct=r=>Array.from({length:8},(_,k)=>{const p=f(Math.cos((k+.5)/8*2*Math.PI)*r,Math.sin((k+.5)/8*2*Math.PI)*r,0);return [p[0],p[1]];});
 const base=oct(R*.98);shell(T.concrete,base,footing(base,gAt),zf,patchy(stone,.12,2));T.concrete.slab(base,zf,lin(0xbdb6a8));cornice(T.concrete,base,zf-.18,zf,.12,cream);cornice(T.concrete,base,foot.lo-.2,foot.hi+.18,.1,mul(stone,.85));
 // Panels in the platform's faces: a grille between plinth and cornice.
 for(let k=0;k<8;k++){const a=base[k],b=base[(k+1)%8],o=edgeOut(a,b),P=t=>[lerp(a[0],b[0],t)+o[0]*.03,lerp(a[1],b[1],t)+o[1]*.03];const A=P(.22),B=P(.78);if(Math.hypot((a[0]+b[0])/2-f(R,0,0)[0],(a[1]+b[1])/2-f(R,0,0)[1])<R*.5)continue;T.paint.quad([A[0],A[1],foot.hi+.3],[B[0],B[1],foot.hi+.3],[B[0],B[1],zf-.3],[A[0],A[1],zf-.3],[.05,.06,.055],[o[0],o[1],0]);}
 // Steps up on one side (+u).
 const face=R*.98*Math.cos(Math.PI/8);for(let k=0;k<5;k++)T.concrete.box(f,face-.05,face+.3+(4-k)*.3,-1.2,1.2,foot.lo-.6,zf-(4-k)*.27,stone,{bottom:false});
 const RC=R*.88,zt=foot.hi+H-3.3,cols=oct(RC),stepSide=f(R,0,0);
 for(const p of cols){T.metal.post([p[0],p[1],zf],[p[0],p[1],zt],.09,.07,mobile?5:8,iron);T.metal.post([p[0],p[1],zf],[p[0],p[1],zf+.4],.16,.12,8,iron);}
 // Railing between the columns (open where the steps arrive), the lace fringe under the eaves.
 for(let k=0;k<8;k++){const a=cols[k],b=cols[(k+1)%8],o=edgeOut(a,b);
  if(Math.hypot((a[0]+b[0])/2-stepSide[0],(a[1]+b[1])/2-stepSide[1])>R*.5){T.metal.post([a[0],a[1],zf+.95],[b[0],b[1],zf+.95],.035,.035,4,iron);T.metal.post([a[0],a[1],zf+.1],[b[0],b[1],zf+.1],.03,.03,4,iron);
   if(!mobile)for(let j=1;j<8;j++){const t=j/8,x=lerp(a[0],b[0],t),y=lerp(a[1],b[1],t);T.metal.post([x,y,zf+.1],[x,y,zf+.95],.015,.015,3,iron);}}
  T.paint.quad([a[0],a[1],zt-.05],[b[0],b[1],zt-.05],[b[0],b[1],zt-.55],[a[0],a[1],zt-.55],cream,[o[0],o[1],0]);}
 const eave=oct(R*1.05);T.roof.slab(eave,zt,cream,true);
 for(let k=0;k<8;k++){const a=eave[k],b=eave[(k+1)%8];T.roof.quad([a[0],a[1],zt],[b[0],b[1],zt],[c[0],c[1],foot.hi+H],[c[0],c[1],foot.hi+H],zinc,[(a[0]+b[0])/2-c[0],(a[1]+b[1])/2-c[1],R*.5]);}
 T.metal.post([c[0],c[1],foot.hi+H-.2],[c[0],c[1],foot.hi+H+.9],.1,.02,6,iron);T.metal.post([c[0],c[1],foot.hi+H+.2],[c[0],c[1],foot.hi+H+.35],.2,.2,8,iron);
 return {radius:+R.toFixed(1),floor:+zf.toFixed(2),top:+(foot.hi+H+.9).toFixed(2)};
}

const BUILDERS={copan,italia,hilton,caetano_de_campos:caetano,igreja_consolacao:igreja,esther,andraus,coreto_republica:coreto};

export function createMinhocaoLandmarks(data,{ground,mobile=false}={}){
 const root=new THREE.Group();root.name='Marcos_Minhocao';
 const marks=(data.scenery?.landmarks??[]).filter(m=>BUILDERS[m.kind]&&m.outline?.length>=3),stats={landmarks:marks.length,mobile,built:{}};
 if(!marks.length)return {root,obstacles:[],stats,clearings:[]};
 const gridAt=(x,y)=>{const g=ground?.(x,y);if(g!=null&&Number.isFinite(g))return g;return gridHeight(data.terrain,x,y);};
 const lap=lapSpace(data),rand=random(9137);
 // Every landmark's plan, for the neighbours' trimming.
 const rings=marks.map(m=>{const pts=ringOf(m.outline),c=centroid(pts);return {kind:m.kind,pts,c,r:Math.max(...pts.map(p=>Math.hypot(p[0]-c[0],p[1]-c[1])))};});
 stats.generic=clearGeneric(data,rings);
 // Free distance from c along dir, up to max: to a generic building, or the lap's walls plus 4 m of pavement.
 const B=data.scenery?.buildings,col=B?Object.fromEntries(B.columns.map((k,i)=>[k,i])):null;
 function free(c,dir,max){
  const near=(B?.items??[]).filter(b=>Math.hypot(b[col.x]-c[0],b[col.y]-c[1])<max+Math.hypot(b[col.w],b[col.d]));
  for(let d=0;d<=max;d+=.5){const x=c[0]+dir[0]*d,y=c[1]+dir[1]*d;if(lap.near(x,y,4))return d;
   for(const b of near){const C=Math.cos(b[col.heading]),S=Math.sin(b[col.heading]),u=(x-b[col.x])*C+(y-b[col.y])*S,v=-(x-b[col.x])*S+(y-b[col.y])*C;if(Math.abs(u)<b[col.w]/2&&Math.abs(v)<b[col.d]/2)return d;}}
  return max;
 }
 const textures={copan:TEX.copan(3.19),italia:TEX.italia(),hilton:TEX.hilton(),esther:TEX.esther(),andraus:TEX.andraus(),podium:TEX.podium(),caetano:TEX.caetano(),brick:TEX.brick(),concrete:TEX.concrete(),glass:TEX.glass()};
 const materials={
  copan:facadeMaterial('Marcos_Copan',textures.copan,{cells:[12,6],seed:1.3,vary:.7}),
  italia:facadeMaterial('Marcos_Italia',textures.italia,{cells:[10,8],seed:2.7,vary:.45,glassMetal:.6}),
  hilton:facadeMaterial('Marcos_Hilton',textures.hilton,{cells:[8,8],seed:4.1,grime:.3}),
  esther:facadeMaterial('Marcos_Esther',textures.esther,{cells:[8,4],seed:5.9}),
  andraus:facadeMaterial('Marcos_Andraus',textures.andraus,{cells:[8,8],seed:7.3,vary:.4,glassMetal:.65,glassRough:.07}),
  podium:facadeMaterial('Marcos_embasamento',textures.podium,{cells:[4,5],seed:8.8}),
  caetano:facadeMaterial('Marcos_Caetano_de_Campos',textures.caetano,{cells:[1,3],seed:9.5,vary:.4,grime:.16}),
  brick:facadeMaterial('Marcos_pedra_Consolacao',textures.brick,{glass:false,grime:.28,seed:11.2}),
  concrete:facadeMaterial('Marcos_concreto',textures.concrete,{glass:false,grime:.22,seed:12.6}),
  glass:facadeMaterial('Marcos_vidro',textures.glass,{cells:[2,2],seed:13.4,vary:.3,glassRough:.06,glassMetal:.7}),
  roof:new THREE.MeshStandardMaterial({name:'Marcos_telhados',vertexColors:true,roughness:.85,metalness:.05}),
  metal:new THREE.MeshStandardMaterial({name:'Marcos_metal',vertexColors:true,roughness:.45,metalness:.6}),
  paint:new THREE.MeshStandardMaterial({name:'Marcos_pintura',vertexColors:true,roughness:.6,metalness:.02})
 };
 const SIZES={brick:4,concrete:8},T=Object.fromEntries(Object.keys(materials).map(k=>[k,new Batch(SIZES[k]??0)]));
 const K={T,mobile,rand,lap,free},clearings=[],obstacles=[],tris={},count=()=>Object.values(T).reduce((s,b)=>s+b.triangles,0);
 for(const m of marks){
  const before=count(),fallback=m.ground??0;K.gAt=(x,y)=>gridAt(x,y)??fallback;
  try{stats.built[m.kind]=BUILDERS[m.kind](m,K)??true;}catch(e){console.warn('Marco do Minhocão não montado:',m.kind,e);stats.built[m.kind]={error:String(e)};continue;}
  tris[m.kind]=count()-before;
  // Trees out of the footprint and a margin round it; a plain prism for the follow cameras.
  const pts=ringOf(m.outline),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),margin=m.kind==='coreto_republica'?7:3;
  for(let x=Math.min(...xs);x<=Math.max(...xs);x+=8)for(let y=Math.min(...ys);y<=Math.max(...ys);y+=8)if(inside(x,y,pts))clearings.push({x,y,r:6});
  for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let t=0;t<l;t+=6)clearings.push({x:lerp(a[0],b[0],t/l),y:lerp(a[1],b[1],t/l),r:margin});}
  const simple=simplify(pts,1.2),pf=footing(simple,K.gAt),z1=pf.lo+(m.height??20),proxy=new Batch();
  for(let i=0;i<simple.length;i++)proxy.wall(simple[i],simple[(i+1)%simple.length],pf.lo-1,z1,[1,1,1]);proxy.slab(simple,z1,[1,1,1]);
  const o=proxy.mesh('Marco_obstaculo_'+m.kind,new THREE.MeshBasicMaterial(),false);o.updateMatrixWorld(true);obstacles.push(o);
 }
 // Driving space: no vertex of ours over the lap's asphalt and walls, up to DRIVE metres above the road.
 const drive={checked:0,violations:0,worst:null};
 for(const [k,b] of Object.entries(T))for(let v=0;v<b.p.length;v+=3){
  const x=b.p[v],y=-b.p[v+2],z=b.p[v+1];drive.checked++;
  for(const h of lap.at(x,y)){const over=z-h.road;if(Math.abs(h.lat)<h.back+.3&&over>-.05&&over<DRIVE){drive.violations++;if(!drive.worst||Math.abs(h.lat)<Math.abs(drive.worst.lat))drive.worst={material:k,s:+h.s.toFixed(1),lat:+h.lat.toFixed(2),over:+over.toFixed(2),x:+x.toFixed(1),y:+y.toFixed(1)};}}
 }
 let drawCalls=0,triangles=0;const parts={};
 for(const [k,b] of Object.entries(T)){if(!b.vertices)continue;root.add(b.mesh('Marcos_Minhocao_'+k,materials[k],true));drawCalls++;triangles+=b.triangles;parts[k]=b.triangles;}
 root.updateMatrixWorld(true);
 Object.assign(stats,{drawCalls,triangles,trianglesK:Math.round(triangles/1000),parts,perLandmark:tris,driveSpace:drive,clearings:clearings.length,cameraObstacles:obstacles.length});
 return {root,obstacles,stats,clearings,update(){}};
}
// Whether a track file carries this module's landmarks (main.js builds them then).
export const hasMinhocaoLandmarks=data=>(data.scenery?.landmarks??[]).some(m=>BUILDERS[m.kind]);
