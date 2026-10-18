import * as THREE from 'three';
import {canvasTexture} from './pit-textures.js';
import {guardrailClearance,guardrailPresent} from './physics.js';
import {branchSpace} from './branch-layout.js';
import {lightUniforms,nightLights,screenHalf} from './sea-water.js';

// Niemeyer's Pampulha round the lake besides the Igrejinha (pampulha-igrejinha.js): the other four buildings of the
// Pampulha Modern Ensemble (Oscar Niemeyer for mayor Juscelino Kubitschek, 1940-43; Burle Marx's gardens; UNESCO 2016),
// from data.scenery.landmarks kinds 'casa_do_baile', 'museu_de_arte', 'iate', 'casa_kubitschek' (gerar_pampulha.py: the
// BHGeo cadastre's footprints, the 2015 laser's top and typical roof over the lowest ground). Measured on the city's
// 20 cm 2015 orthophoto (ide_bhgeo:ORTOFOTO_2015) and drawn after Commons photos (2026-10-18):
// - Casa do Baile (1943): the island in the lake, its rubble walls 2 m over the water, joined to the shore by an arched
//   white footbridge (2.7 m × 19 m). The roof is the cadastre's 92-point outline as one white slab 4.2 m up: the disc
//   over the round hall (two circles touching inside, the 9 m hall tangent to the roof's west edge: 255 m² of floor),
//   the hall's west half a wall of pale blue tiles, the rest glazing in white frames; the slab runs on as the sinuous
//   marquise (3-4 m wide) along the island's north edge on one row of round columns, curling at its east end over a
//   small tiled drum. Before it the amoeba pond round the circular stage; the low walls along the walkway clad in
//   blue and white azulejos with the round floral motif; Portuguese paving under the roof.
// - Museu de Arte da Pampulha (the Cassino, 1942): the main box (31.7 × 24.6 m on the cadastre, 10.8 m), its upper
//   floor's glass curtain in white frames on the entrance side (NE, toward the pond and the drive) with the travertine-
//   clad block at its SE end, the recessed glazed ground floor on polished steel posts, the free-form entrance canopy,
//   travertine walls; the curved annex of the old ballroom toward the lake (its round end on the cadastre), a glass band
//   over a glazed lower floor; the lower service wing NW; three sculptures on plinths in the garden (evoked).
// - Iate Tênis Clube (1942): the butterfly roof, its two planes falling along the 44 m building to a valley 27 m from the
//   SE end (10.6 m there, 6.6 m at the valley, 9.2 m at the NW end, after the photos from the lake), the upper floor
//   glazed all round in dark frames over a balcony with a white railing, the ground floor's patterned tiles behind round
//   posts, the T-topped concrete pylon by the valley, the long ramp down at the SE end, the flat white canopy on blue
//   posts at the NW end, the boat ramp. The game's lake covers the club's ground (the BHGeo lake polygon), so it stands
//   on its own quay: paving, the 25 m pool and the kidney pool, rubble walls into the water.
// - Casa Kubitschek (1943): the main block facing the lake (11.8 × 20.1 m) under a butterfly roof whose valley sits 64%
//   along from the south (5.3 m, 3.7 m, 4.8 m over the floor), the band under it a screen of vertical eucalyptus logs, the
//   glazing below in thin steel frames, the deck with a white parapet on a rubble stone base; the veranda at the south
//   with an evocation of Volpi's blue and white azulejo panel (old charts: coasts, roses, ships), the two lower wings
//   round the patio with an evocation of Paulo Werneck's mosaic.
// One material set for all four (merged per material: a draw call each, one more for the night lights), the trees
// cleared off the buildings and the sight lines from the lap; nothing enters the lap's driving space (checked per
// vertex). After dark (setNight) uplights wash the walls and the glazing glows warm.

const KINDS=['casa_do_baile','museu_de_arte','iate','casa_kubitschek'];
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
const hash=(i,j)=>{const h=Math.sin(i*127.1+j*311.7)*43758.5453;return h-Math.floor(h);};
function noise(x,y){const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,su=u*u*(3-2*u),sv=v*v*(3-2*v);return (hash(i,j)*(1-su)+hash(i+1,j)*su)*(1-sv)+(hash(i,j+1)*(1-su)+hash(i+1,j+1)*su)*sv;}
const fbm=(x,y)=>.55*noise(x,y)+.3*noise(x*2.1+5.2,y*2.1+1.3)+.15*noise(x*4.3+9.1,y*4.3+7.7);
function gridHeight(g,x,y){
 if(!g)return null;const fx=(x-g.x0)/g.step,fy=(y-g.y0)/g.step;if(fx<0||fy<0||fx>g.nx-1||fy>g.ny-1)return null;
 const i=Math.min(g.nx-2,Math.floor(fx)),j=Math.min(g.ny-2,Math.floor(fy)),u=fx-i,v=fy-j,k=j*g.nx+i;
 return (g.z[k]*(1-u)+g.z[k+1]*u)*(1-v)+(g.z[k+g.nx]*(1-u)+g.z[k+g.nx+1]*u)*v;
}
function inside(x,y,pts){let c=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[i],b=pts[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
const area=P=>{let s=0;for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length];s+=a[0]*b[1]-b[0]*a[1];}return s/2;};
// Outward normal of edge a→b of a polygon wound counter-clockwise (ccw) or not.
const edgeOut=(a,b,ccw=true)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;return ccw?[dy/l,-dx/l]:[-dy/l,dx/l];};
// The polygon moved d metres inward at every corner (mitred, capped at 2.5 d on sharp corners).
function offsetPoly(P,d){const ccw=area(P)>0,n=P.length;return P.map((p,i)=>{const a=edgeOut(P[(i+n-1)%n],p,ccw),b=edgeOut(p,P[(i+1)%n],ccw),m=[a[0]+b[0],a[1]+b[1]],l=Math.hypot(...m)||1,k=d/Math.max(.4,(m[0]*a[0]+m[1]*a[1])/l);return [p[0]-m[0]/l*k,p[1]-m[1]/l*k];});}
// First crossing of the ray p + t·d (t > .05) with the polygon's edges.
function rayHit(P,p,d){let best=Infinity;for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length],ex=b[0]-a[0],ey=b[1]-a[1],den=d[0]*ey-d[1]*ex;if(Math.abs(den)<1e-9)continue;const t=((a[0]-p[0])*ey-(a[1]-p[1])*ex)/den,u=((a[0]-p[0])*d[1]-(a[1]-p[1])*d[0])/den;if(t>.05&&u>=0&&u<=1&&t<best)best=t;}return best;}

// ---------- Geometry gathered per material in track coordinates, drawn as one mesh (as in pampulha-igrejinha.js)
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
 quad(a,b,c,d,col,out,uv,ns){
  if(out&&dot(cross(sub(c,a),sub(d,b)),out)<0){[b,d]=[d,b];if(uv)uv=[uv[0],uv[3],uv[2],uv[1]];if(ns)ns=[ns[0],ns[3],ns[2],ns[1]];}
  this.tri(a,b,c,col,uv&&[uv[0],uv[1],uv[2]],ns&&[ns[0],ns[1],ns[2]]);this.tri(a,c,d,col,uv&&[uv[0],uv[2],uv[3]],ns&&[ns[0],ns[2],ns[3]]);
 }
 flat(pts2,to3,col,out,uvOf){
  if(pts2.length<3)return;const flat=pts2.map(p=>new THREE.Vector2(p[0],p[1]));if(Math.abs(THREE.ShapeUtils.area(flat))<1e-6)return;
  for(const [i,j,k] of THREE.ShapeUtils.triangulateShape(flat,[])){let a=pts2[i],b=pts2[j],c=pts2[k];const A=to3(a),B=to3(b),C=to3(c);
   if(dot(cross(sub(B,A),sub(C,A)),out)<0)this.tri(A,C,B,col,uvOf&&[uvOf(a),uvOf(c),uvOf(b)]);else this.tri(A,B,C,col,uvOf&&[uvOf(a),uvOf(b),uvOf(c)]);}
 }
 box(f,a0,a1,b0,b1,z0,z1,col,{bottom=false,top=true}={}){
  const P=(i,j,k)=>f(i?a1:a0,j?b1:b0,k?z1:z0),c=f((a0+a1)/2,(b0+b1)/2,(z0+z1)/2),face=(A,B,C,D)=>this.quad(A,B,C,D,col,sub([(A[0]+C[0])/2,(A[1]+C[1])/2,(A[2]+C[2])/2],c));
  face(P(0,0,0),P(0,1,0),P(0,1,1),P(0,0,1));face(P(1,0,0),P(1,1,0),P(1,1,1),P(1,0,1));face(P(0,0,0),P(1,0,0),P(1,0,1),P(0,0,1));face(P(0,1,0),P(1,1,0),P(1,1,1),P(0,1,1));
  if(bottom)face(P(0,0,0),P(1,0,0),P(1,1,0),P(0,1,0));if(top)face(P(0,0,1),P(1,0,1),P(1,1,1),P(0,1,1));
 }
 post(p,q,r0,r1,n,col,{rot=0,top=true}={}){
  const d=unit(sub(q,p)),e1=unit(Math.abs(d[2])>.99?cross([0,1,0],d):cross(d,[0,0,1])),e2=cross(d,e1);
  const ring=(c,r)=>Array.from({length:n},(_,i)=>{const a=rot+i*2*Math.PI/n,x=Math.cos(a)*r,y=Math.sin(a)*r;return [c[0]+e1[0]*x+e2[0]*y,c[1]+e1[1]*x+e2[1]*y,c[2]+e1[2]*x+e2[2]*y];});
  const A=ring(p,r0),B=ring(q,r1);
  for(let i=0;i<n;i++){const j=(i+1)%n,m=sub([(A[i][0]+A[j][0])/2,(A[i][1]+A[j][1])/2,(A[i][2]+A[j][2])/2],p);this.quad(A[i],A[j],B[j],B[i],col,sub(m,mul(d,dot(m,d))));}
  if(top&&r1>0)for(let i=1;i<n-1;i++){const f=dot(cross(sub(B[i],B[0]),sub(B[i+1],B[0])),d)<0;this.tri(B[0],f?B[i+1]:B[i],f?B[i]:B[i+1],col);}
 }
 // A prism over a 2D outline (track xy) from z0 to z1: walls turned outward (bottom/top optional).
 prism(P,z0,z1,col,{top=true,bottom=false,uv=null}={}){
  const ccw=area(P)>0;for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length],o=edgeOut(a,b,ccw);this.quad([a[0],a[1],z0],[b[0],b[1],z0],[b[0],b[1],z1],[a[0],a[1],z1],col,[o[0],o[1],0]);}
  if(top)this.flat(P,p=>[p[0],p[1],z1],col,[0,0,1],uv);if(bottom)this.flat(P,p=>[p[0],p[1],z0],col,[0,0,-1],uv);
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
 // A branch road beside the lap (data.branches, branch-layout.js): its asphalt and walls are driving space too.
 const branch=branchSpace(data);
 const A=data.samples,N=A.length,CELL=8,cells=new Map(),key=(i,j)=>i*131071+j;
 const st=A.map(p=>{const tl=Math.hypot(p[7],p[8])||1,nl=Math.hypot(p[9],p[10])||1,q={s:p[0],x:p[1],y:p[2],z:p[3],cf:p[5],n:[p[9]/nl,p[10]/nl],back:[0,0]};for(const [k,side] of [[0,-1],[1,1]])q.back[k]=p[4]/2+guardrailClearance(data,p[0],side)+(guardrailPresent(data,p[0],side)?.75:0);q.t=[p[7]/tl,p[8]/tl];return q;});
 for(let i=0;i<N;i++){const p=st[i],q=st[(i+1)%N],r=Math.max(...p.back,...q.back)+4;
  for(let ci=Math.floor((Math.min(p.x,q.x)-r)/CELL);ci<=Math.floor((Math.max(p.x,q.x)+r)/CELL);ci++)for(let cj=Math.floor((Math.min(p.y,q.y)-r)/CELL);cj<=Math.floor((Math.max(p.y,q.y)+r)/CELL);cj++){const k=key(ci,cj);let l=cells.get(k);if(!l)cells.set(k,l=[]);l.push(i);}}
 function at(x,y){
  const list=cells.get(key(Math.floor(x/CELL),Math.floor(y/CELL))),out=branch.at(x,y);if(!list)return out;
  for(const i of list){const p=st[i],q=st[(i+1)%N],dx=q.x-p.x,dy=q.y-p.y,l2=dx*dx+dy*dy||1e-9;let u=((x-p.x)*dx+(y-p.y)*dy)/l2;if(u<-.02||u>1.02)continue;u=clamp(u,0,1);
   const nx=lerp(p.n[0],q.n[0],u),ny=lerp(p.n[1],q.n[1],u),lat=(x-p.x-dx*u)*nx+(y-p.y-dy*u)*ny,k=lat>=0?1:0;
   out.push({s:p.s,lat,road:lerp(p.z,q.z,u)+lerp(p.cf,q.cf,u)*lat,back:lerp(p.back[k],q.back[k],u)});}
  return out;
 }
 return {at};
}

// ---------- Textures (canvas)
const wrap=(w,h,x,y,s,fn)=>{for(const dx of [-w,0,w])for(const dy of [-h,0,h])if(x+dx+s>0&&x+dx-s<w&&y+dy+s>0&&y+dy-s<h)fn(x+dx,y+dy);};
function grain(ctx,amount,r,x0=0,y0=0,w=ctx.canvas.width,h=ctx.canvas.height){const img=ctx.getImageData(x0,y0,w,h),d=img.data;for(let i=0;i<d.length;i+=4){const n=(r()-.5)*amount;d[i]+=n;d[i+1]+=n;d[i+2]+=n;}ctx.putImageData(img,x0,y0);}
function blotches(ctx,w,h,r,count,light,dark,size,alpha){for(let k=0;k<count;k++){const x=r()*w,y=r()*h,s=size*(.3+r()),c=r()<.5?light:dark,a=alpha*(.4+r());wrap(w,h,x,y,s,(px,py)=>{const g=ctx.createRadialGradient(px,py,0,px,py,s);g.addColorStop(0,`rgba(${c},${a})`);g.addColorStop(1,`rgba(${c},0)`);ctx.fillStyle=g;ctx.fillRect(px-s,py-s,2*s,2*s);});}}
// Painted concrete (6 m): slabs, fascias, columns, white walls (tinted per vertex: white, cream, the JK house's beige).
const concreteTexture=()=>canvasTexture((ctx,w,h)=>{const r=random(5);ctx.fillStyle='#e4e0d6';ctx.fillRect(0,0,w,h);blotches(ctx,w,h,r,60,'255,255,250','90,88,80',80,.05);for(let k=0;k<18;k++){ctx.fillStyle=`rgba(60,60,55,${.02+r()*.04})`;ctx.fillRect(0,r()*h,w,1);}grain(ctx,14,r);},512,512,true);
// Rubble stone (3 m): the island's walls, the quay, the JK house's base. Irregular blocks, grey to ochre, dark joints.
const rubbleTexture=()=>canvasTexture((ctx,w,h)=>{
 const r=random(311);ctx.fillStyle='#463f36';ctx.fillRect(0,0,w,h);
 for(let y=0;y<h;){const rh=24+r()*26;for(let x=-r()*40;x<w;){const sw=28+r()*52,cx=x+sw/2,cy=y+rh/2,k=r(),c=k<.4?[132,122,106]:k<.7?[152,134,104]:k<.9?[112,106,98]:[172,150,116],v=(r()-.5)*28,rr=Array.from({length:8},()=>.8+r()*.2);
  wrap(w,h,cx,cy,sw,(px,py)=>{ctx.fillStyle=`rgb(${c[0]+v|0},${c[1]+v|0},${c[2]+v|0})`;ctx.beginPath();rr.forEach((q,i)=>{const a=i/8*2*Math.PI,X=px+Math.cos(a)*sw/2*q,Y=py+Math.sin(a)*rh/2*q;i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);});ctx.closePath();ctx.fill();
   const g=ctx.createLinearGradient(px,py-rh/2,px,py+rh/2);g.addColorStop(0,'rgba(255,250,235,.12)');g.addColorStop(1,'rgba(0,0,0,.18)');ctx.fillStyle=g;ctx.fill();});
  x+=sw+2+r()*3;}y+=rh+2+r()*2;}
 blotches(ctx,w,h,r,24,'200,190,160','40,45,30',60,.08);grain(ctx,22,r);
},512,512,true);
// Travertine (2.4 m: 2 × 4 slabs of 1.2 × 0.6 m), the Cassino's cladding: warm beige, the stone's horizontal pores.
const travertineTexture=()=>canvasTexture((ctx,w,h)=>{
 const r=random(1942),cw=w/2,rh=h/4;
 for(let j=0;j<4;j++)for(let i=0;i<2;i++){const k=.92+r()*.14;ctx.fillStyle=`rgb(${214*k|0},${200*k|0},${174*k|0})`;ctx.fillRect(i*cw,j*rh,cw,rh);
  for(let q=0;q<26;q++){ctx.fillStyle=`rgba(${120+r()*30|0},${100+r()*20|0},70,${.1+r()*.25})`;ctx.fillRect(i*cw+r()*cw,j*rh+r()*rh,6+r()*40,1+r()*2);}
  for(let q=0;q<6;q++){ctx.fillStyle=`rgba(250,244,228,${.12+r()*.12})`;ctx.fillRect(i*cw,j*rh+r()*rh,cw,2+r()*5);}}
 ctx.fillStyle='rgba(110,98,78,.6)';for(let i=0;i<=2;i++)ctx.fillRect(i*cw-1,0,2,h);for(let j=0;j<=4;j++)ctx.fillRect(0,j*rh-1,w,2);grain(ctx,10,r);
},512,512,true);

// The atlas of tiles, screens, murals and glazing (2048²). The glazing sits in the lower half (it glows after dark).
// Regions in canvas pixels [x0, y0, x1, y1] and the metres they cover (128 px per metre unless noted).
const AW=2048,AH=2048;
const REG={
 azBaile:[0,0,512,384],        // the Casa do Baile's low walls and drum: 8 × 6 azulejos of 15 cm (1.2 × 0.9 m)
 azHall:[512,0,1024,512],      // the hall's solid wall: 8 × 8 pale blue tiles (1.2 × 1.2 m)
 iateTile:[1024,0,1536,512],   // the Iate's ground floor: white tiles with grey figures (1.2 × 1.2 m)
 logs:[1536,0,2048,512],       // the JK house's screen of eucalyptus logs: 1.6 m across × 3.2 m
 volpi:[0,512,768,832],        // the JK veranda's azulejo panel (evoked): 6 × 2.5 m
 werneck:[768,512,1280,768],   // the JK patio's mosaic (evoked): 4 × 2 m
 glassBaile:[0,1024,256,1696], // the hall's glazing: one bay 1.6 × 4.2 m (160 px/m)
 glassIate:[256,1024,480,2048],// the Iate's upper floor: one bay 1.75 × 8 m
 glassMuseu:[480,1024,672,1664],// the Cassino's glass curtain: one bay 1.5 × 5 m
 glassLow:[672,1024,928,1536], // ground floors: one bay 2 × 4 m
 glassJK:[928,1024,1236,1370], // the JK house's glazing: one bay 2.4 × 2.7 m
 glassBand:[1240,1024,1432,1408],// the Cassino's annex: one bay 1.5 × 3 m
 window:[1440,1024,1696,1280]  // a window in white frames: 2 × 2 m
};
const regUv=R=>(fx,fy)=>[(R[0]+fx*(R[2]-R[0]))/AW,1-(R[3]-fy*(R[3]-R[1]))/AH];

function atlasTexture(){
 return canvasTexture((ctx,w,h)=>{
  const r=random(1943),cobalt='#1f3f9c',deep='#173273',mid='#5b7fca',white='#f3f2ea';ctx.fillStyle='#e9e8e2';ctx.fillRect(0,0,w,h);
  const tiles=(R,n,m,draw,grout='rgba(150,155,160,.45)')=>{const [x0,y0,x1,y1]=R,tw=(x1-x0)/n,th=(y1-y0)/m;for(let j=0;j<m;j++)for(let i=0;i<n;i++){ctx.save();ctx.beginPath();ctx.rect(x0+i*tw,y0+j*th,tw,th);ctx.clip();draw(x0+i*tw,y0+j*th,tw,th,i,j);ctx.restore();}ctx.fillStyle=grout;for(let i=0;i<=n;i++)ctx.fillRect(x0+i*tw-1,y0,2,y1-y0);for(let j=0;j<=m;j++)ctx.fillRect(x0,y0+j*th-1,x1-x0,2);};
  // --- The Casa do Baile's azulejos: white ground, a cobalt rosette in a ring, quarter circles at the corners (the
  // four corners of four tiles make the next ring), as in the photos of the low walls.
  tiles(REG.azBaile,8,6,(x,y,tw,th)=>{ctx.fillStyle=white;ctx.fillRect(x,y,tw,th);const cx=x+tw/2,cy=y+th/2,R=tw*.4;ctx.strokeStyle=cobalt;ctx.lineWidth=tw*.07;ctx.beginPath();ctx.arc(cx,cy,R,0,2*Math.PI);ctx.stroke();
   ctx.fillStyle=cobalt;for(let k=0;k<8;k++){const a=k*Math.PI/4;ctx.beginPath();ctx.ellipse(cx+Math.cos(a)*R*.5,cy+Math.sin(a)*R*.5,R*.36,R*.13,a,0,2*Math.PI);ctx.fill();}ctx.beginPath();ctx.arc(cx,cy,R*.16,0,2*Math.PI);ctx.fill();
   ctx.lineWidth=tw*.05;for(const [qx,qy] of [[x,y],[x+tw,y],[x,y+th],[x+tw,y+th]]){ctx.beginPath();ctx.arc(qx,qy,tw*.22,0,2*Math.PI);ctx.stroke();ctx.fillStyle=deep;ctx.beginPath();ctx.arc(qx,qy,tw*.1,0,2*Math.PI);ctx.fill();}
   ctx.fillStyle=`rgba(255,255,255,${r()*.12})`;ctx.fillRect(x,y,tw,th);});
  // --- The hall's pale blue tiles with a small white cross.
  tiles(REG.azHall,8,8,(x,y,tw,th)=>{const v=(r()-.5)*14;ctx.fillStyle=`rgb(${176+v|0},${196+v|0},${212+v|0})`;ctx.fillRect(x,y,tw,th);ctx.fillStyle='rgba(248,250,252,.85)';ctx.fillRect(x+tw*.44,y+th*.22,tw*.12,th*.56);ctx.fillRect(x+tw*.22,y+th*.44,tw*.56,th*.12);ctx.fillStyle='rgba(60,90,140,.5)';for(const [a,b] of [[0,0],[1,0],[0,1],[1,1]]){ctx.beginPath();ctx.arc(x+a*tw,y+b*th,tw*.14,0,2*Math.PI);ctx.fill();}});
  // --- The Iate's tiles: white, grey diagonal figures.
  tiles(REG.iateTile,8,8,(x,y,tw,th,i,j)=>{ctx.fillStyle='#ecebe6';ctx.fillRect(x,y,tw,th);ctx.strokeStyle='#8f949a';ctx.lineWidth=tw*.08;ctx.beginPath();if((i+j)%2){ctx.moveTo(x,y);ctx.lineTo(x+tw,y+th);}else{ctx.moveTo(x+tw,y);ctx.lineTo(x,y+th);}ctx.stroke();ctx.fillStyle='#6f757c';ctx.beginPath();ctx.arc(x+tw/2,y+th/2,tw*.12,0,2*Math.PI);ctx.fill();});
  // --- Eucalyptus logs (10 across, ~16 cm), weathered grey-brown, rounded by their shading, dark gaps between.
  {const [x0,y0,x1,y1]=REG.logs,n=10,lw=(x1-x0)/n;ctx.fillStyle='#2a221a';ctx.fillRect(x0,y0,x1-x0,y1-y0);
   for(let k=0;k<n;k++){const x=x0+k*lw+1.5,ww=lw-3,t=.85+r()*.3,g=ctx.createLinearGradient(x,0,x+ww,0);g.addColorStop(0,`rgb(${70*t|0},${56*t|0},${40*t|0})`);g.addColorStop(.35,`rgb(${160*t|0},${138*t|0},${104*t|0})`);g.addColorStop(.6,`rgb(${140*t|0},${118*t|0},${88*t|0})`);g.addColorStop(1,`rgb(${60*t|0},${48*t|0},${34*t|0})`);ctx.fillStyle=g;ctx.fillRect(x,y0,ww,y1-y0);
    for(let q=0;q<40;q++){ctx.fillStyle=`rgba(${r()<.5?'40,30,20':'200,185,150'},${.1+r()*.2})`;ctx.fillRect(x+r()*ww,y0+r()*(y1-y0),1+r()*2,8+r()*40);}}}
  // --- Volpi's veranda panel, evoked: white azulejos with old charts in cobalt (a coast and its bays, rhumb lines from
  // a compass rose, ships, a fish), a border of blue tiles.
  {const [x0,y0,x1,y1]=REG.volpi,M=128;ctx.fillStyle=white;ctx.fillRect(x0,y0,x1-x0,y1-y0);ctx.save();ctx.beginPath();ctx.rect(x0,y0,x1-x0,y1-y0);ctx.clip();
   ctx.strokeStyle=mid;ctx.lineWidth=1.5;const rc=[x0+4.3*M,y0+1.2*M];for(let k=0;k<16;k++){const a=k*Math.PI/8;ctx.beginPath();ctx.moveTo(...rc);ctx.lineTo(rc[0]+Math.cos(a)*700,rc[1]+Math.sin(a)*700);ctx.stroke();}
   ctx.fillStyle=cobalt;ctx.beginPath();ctx.moveTo(x0,y0+.4*M);for(let k=0;k<=30;k++){const t=k/30;ctx.lineTo(x0+t*2.6*M+Math.sin(t*19)*10,y0+.4*M+t*1.7*M+Math.sin(t*31)*14);}ctx.lineTo(x0,y1);ctx.closePath();ctx.fill();
   ctx.fillStyle='rgba(31,63,156,.55)';for(let k=0;k<5;k++){ctx.beginPath();ctx.arc(x0+.3*M+r()*1.4*M,y0+1.2*M+r()*1.1*M,6+r()*8,0,2*Math.PI);ctx.fill();}
   ctx.fillStyle=white;ctx.beginPath();ctx.arc(...rc,.55*M,0,2*Math.PI);ctx.fill();ctx.fillStyle=cobalt;for(let k=0;k<8;k++){const a=k*Math.PI/4,R=k%2?.32*M:.52*M;ctx.beginPath();ctx.moveTo(...rc);ctx.lineTo(rc[0]+Math.cos(a+.18)*R*.3,rc[1]+Math.sin(a+.18)*R*.3);ctx.lineTo(rc[0]+Math.cos(a)*R,rc[1]+Math.sin(a)*R);ctx.closePath();ctx.fill();}
   const ship=(x,y,s)=>{ctx.fillStyle=cobalt;ctx.beginPath();ctx.moveTo(x-s,y);ctx.quadraticCurveTo(x,y+s*.45,x+s,y);ctx.closePath();ctx.fill();ctx.fillRect(x-1.5,y-s*1.2,3,s*1.2);for(const [dx,sz] of [[-.45,.8],[.4,.65]]){ctx.beginPath();ctx.moveTo(x+dx*s,y-s*.15);ctx.quadraticCurveTo(x+dx*s+sz*s*.5,y-s*.6,x+dx*s,y-s*sz*1.3);ctx.closePath();ctx.fill();}};
   ship(x0+3.2*M,y0+1.9*M,.32*M);ship(x0+5.3*M,y0+.6*M,.26*M);ship(x0+5.5*M,y0+2*M,.22*M);
   ctx.strokeStyle=cobalt;ctx.lineWidth=3;for(let k=0;k<3;k++){ctx.beginPath();for(let q=0;q<=40;q++){const x=x0+2.4*M+q*.09*M,y=y0+2.3*M+k*.1*M+Math.sin(q*.7+k)*4;q?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
   ctx.fillStyle=cobalt;ctx.beginPath();ctx.ellipse(x0+4.4*M,y0+2.2*M,.3*M,.1*M,0,0,2*Math.PI);ctx.fill();ctx.restore();
   ctx.fillStyle=deep;const b=.15*M;ctx.fillRect(x0,y0,x1-x0,b);ctx.fillRect(x0,y1-b,x1-x0,b);ctx.fillRect(x0,y0,b,y1-y0);ctx.fillRect(x1-b,y0,b,y1-y0);
   ctx.fillStyle='rgba(150,155,160,.4)';for(let x=x0;x<x1;x+=.15*M)ctx.fillRect(x,y0,1,y1-y0);for(let y=y0;y<y1;y+=.15*M)ctx.fillRect(x0,y,x1-x0,1);}
  // --- Werneck's mosaic, evoked: tesserae in flat abstract fields (ochre, terracotta, blue, black, white).
  {const [x0,y0,x1,y1]=REG.werneck,cols=['#d9a441','#b5452f','#2f4f8f','#1d1d1f','#efece2','#6c8f5a'],shapes=Array.from({length:9},()=>({x:x0+r()*(x1-x0),y:y0+r()*(y1-y0),s:40+r()*120,c:cols[(r()*cols.length)|0],k:r()}));
   for(let y=y0;y<y1;y+=6)for(let x=x0;x<x1;x+=6){let c='#e6dfcf';for(const s of shapes){const d=s.k<.5?Math.hypot(x-s.x,y-s.y):Math.abs(x-s.x)+Math.abs(y-s.y)*.6;if(d<s.s)c=s.c;}ctx.fillStyle=c;ctx.fillRect(x+.6,y+.6,4.8+(r()-.5),4.8+(r()-.5));ctx.fillStyle=`rgba(0,0,0,${r()*.12})`;ctx.fillRect(x+.6,y+.6,5,5);}}
  // --- Glazing. A bay: frame(R, frames [[x0, y0, x1, y1] in metres from the bay's foot], frame colour), interior first.
  const bay=(R,mw,mh,{bg=['#56616a','#2b333a','#1c2228'],frames=[],fc='#f1f2f0',lit=.5,interior=null})=>{const [x0,y0,x1,y1]=R,sx=(x1-x0)/mw,sy=(y1-y0)/mh,X=u=>x0+u*sx,Y=z=>y1-z*sy;
   const g=ctx.createLinearGradient(0,y0,0,y1);g.addColorStop(0,bg[0]);g.addColorStop(.5,bg[1]);g.addColorStop(1,bg[2]);ctx.fillStyle=g;ctx.fillRect(x0,y0,x1-x0,y1-y0);
   interior?.(X,Y,sx,sy);
   ctx.fillStyle='rgba(215,228,240,.16)';ctx.beginPath();ctx.moveTo(X(0),Y(mh));ctx.lineTo(X(mw*.55),Y(mh));ctx.lineTo(X(mw*.15),Y(0));ctx.lineTo(X(0),Y(0));ctx.fill();
   ctx.fillStyle=`rgba(255,226,170,${lit*.08})`;ctx.fillRect(x0,Y(mh*.6),x1-x0,Y(0)-Y(mh*.6));
   ctx.fillStyle=fc;for(const [a,b,c,d] of frames)ctx.fillRect(X(a),Y(d),X(c)-X(a),Y(b)-Y(d));};
  const ceiling=(X,Y,sx,sy,z,mw,warm=1)=>{ctx.fillStyle='rgba(225,220,205,.35)';ctx.fillRect(X(0),Y(z+.4),X(mw)-X(0),.4*sy);ctx.fillStyle=`rgba(255,236,200,${.5*warm})`;ctx.fillRect(X(mw*.3),Y(z+.12),mw*.4*sx,.06*sy);};
  bay(REG.glassBaile,1.6,4.2,{frames:[[0,0,.06,4.2],[1.54,0,1.6,4.2],[0,0,1.6,.1],[0,2.25,1.6,2.31],[0,3.35,1.6,3.4],[.78,2.31,.82,4.2]],interior:(X,Y,sx,sy)=>{ceiling(X,Y,sx,sy,3.6,1.6);ctx.fillStyle='rgba(120,90,60,.45)';ctx.fillRect(X(.2),Y(.9),1.2*sx,.25*sy);ctx.fillStyle='rgba(235,232,222,.25)';ctx.fillRect(X(0),Y(2.2),1.6*sx,1.2*sy);}});
  bay(REG.glassIate,1.75,8,{bg:['#8d9ca6','#4f5c66','#2c343b'],fc:'#5a524a',frames:[[0,0,.07,8],[1.68,0,1.75,8],[0,0,1.75,.12],[0,2.3,1.75,2.38],[0,4.6,1.75,4.66],[0,6.9,1.75,6.96]],interior:(X,Y,sx,sy)=>{ctx.fillStyle='rgba(225,215,195,.25)';ctx.fillRect(X(0),Y(3.2),1.75*sx,.5*sy);for(let k=0;k<3;k++){ctx.fillStyle='rgba(255,236,200,.45)';ctx.fillRect(X(.3+k*.5),Y(3.05),.18*sx,.05*sy);}ctx.fillStyle='rgba(90,70,50,.4)';ctx.fillRect(X(.15),Y(.8),1.4*sx,.12*sy);}});
  bay(REG.glassMuseu,1.5,5,{bg:['#60707a','#3a454c','#283036'],frames:[[0,0,.07,5],[1.43,0,1.5,5],[0,0,1.5,.14],[0,1.05,1.5,1.12],[0,3.9,1.5,3.97],[0,4.88,1.5,5]],interior:(X,Y,sx,sy)=>{ctx.fillStyle='rgba(238,234,224,.35)';ctx.fillRect(X(0),Y(3.8),1.5*sx,3.2*sy);ctx.fillStyle='rgba(120,100,80,.22)';ctx.fillRect(X(.3),Y(2.5),.9*sx,.9*sy);ctx.fillStyle='rgba(255,236,200,.5)';ctx.fillRect(X(.2),Y(4.6),1.1*sx,.06*sy);}});
  bay(REG.glassLow,2,4,{bg:['#4e5a62','#2c343a','#1c2126'],fc:'#b9bcbd',frames:[[0,0,.06,4],[1.94,0,2,4],[0,0,2,.1],[0,2.6,2,2.66],[.98,0,1.02,2.6]],interior:(X,Y,sx,sy)=>{ceiling(X,Y,sx,sy,3.3,2);ctx.fillStyle='rgba(230,226,214,.3)';ctx.fillRect(X(0),Y(3.2),2*sx,2.4*sy);}});
  bay(REG.glassJK,2.4,2.7,{bg:['#66747c','#3a454c','#262d33'],fc:'#c9ccce',frames:[[0,0,.05,2.7],[2.35,0,2.4,2.7],[0,0,2.4,.08],[0,2.62,2.4,2.7],[1.18,0,1.22,2.7]],interior:(X,Y,sx,sy)=>{ceiling(X,Y,sx,sy,2.3,2.4,.8);ctx.fillStyle='rgba(140,90,50,.45)';ctx.fillRect(X(.3),Y(.75),.9*sx,.45*sy);ctx.fillStyle='rgba(230,225,210,.3)';ctx.fillRect(X(1.5),Y(2.2),.6*sx,1.8*sy);}});
  bay(REG.glassBand,1.5,3,{bg:['#5c6a72','#36414a','#262d33'],frames:[[0,0,.06,3],[1.44,0,1.5,3],[0,0,1.5,.1],[0,2.9,1.5,3],[0,1.1,1.5,1.15]],interior:(X,Y,sx,sy)=>ceiling(X,Y,sx,sy,2.4,1.5)});
  bay(REG.window,2,2,{bg:['#67747c','#3d474e','#2a3036'],frames:[[0,0,.12,2],[1.88,0,2,2],[0,0,2,.14],[0,1.86,2,2],[.97,0,1.03,2],[0,1.2,2,1.25]],interior:(X,Y,sx,sy)=>ceiling(X,Y,sx,sy,1.5,2,.7)});
  grain(ctx,8,r,0,0,w,1024);
 },AW,AH,false);
}

// The ground decals (1024 × 1280): the Casa do Baile's island (x 964..1034, y -364..-318) and the Iate's quay (frame u
// -31..33, v -15..32).
const SITE={island:{x0:964,x1:1034,y0:-364,y1:-318,R:[0,0,1024,640]},quay:{u0:-31,u1:33,v0:-15,v1:32,R:[0,640,1024,1280]}};
const SW=1024,SH=1280;
const siteUv=(S,a,b)=>{const [x0,y0,x1,y1]=S.R,fx=S.x0!=null?(a-S.x0)/(S.x1-S.x0):(a-S.u0)/(S.u1-S.u0),fy=S.x0!=null?(S.y1-b)/(S.y1-S.y0):(S.v1-b)/(S.v1-S.v0);return [(x0+fx*(x1-x0))/SW,1-(y0+fy*(y1-y0))/SH];};
// Casa do Baile: the island's outline (the rubble wall's top, traced on the orthophoto), the pond round the stage.
const ISLAND=[[966.5,-346],[967.5,-340],[970.5,-335.5],[975.5,-332.5],[982,-331.6],[989.5,-331],[994.5,-329.6],[998.5,-327.6],[1002.5,-325.8],[1007.5,-325],[1012.5,-322.6],[1017.5,-321],[1022.5,-321],[1027,-322.6],[1030.2,-325.8],[1031.8,-330.5],[1031.6,-336],[1029.6,-340.6],[1025.6,-344.2],[1020,-346.8],[1012,-347.8],[1005,-347.6],[1001,-349.2],[997.6,-353.4],[993.5,-357.8],[987,-360.8],[979.5,-361.4],[973,-359.8],[968.6,-355.6],[966.6,-351]];
const POND=[[1004.5,-337.5],[1007,-333.6],[1011,-332.4],[1014.6,-330.6],[1018.5,-329.4],[1021.6,-330.6],[1022.4,-335],[1020.2,-339.6],[1015,-342.6],[1010,-343.6],[1006,-341.8]];
const STAGE={x:1018.4,y:-334.6,r:2.3};
const BRIDGE={a:[999.4,-348.9],b:[1004.8,-366.4],w:2.7};
// Iate: the quay in the building's frame (u along it toward the NW, v to the west).
const QUAY=[[-31,-15],[33,-15],[33,32],[-8,32],[-31,12]];
function siteTexture(){
 return canvasTexture((ctx)=>{
  const r=random(1959);
  // --- The island: lawn, Portuguese paving under the roof and round the hall, the plaza at the bridge, beds, the pond.
  {const S=SITE.island,[x0,y0,x1,y1]=S.R,X=x=>x0+(x-S.x0)/(S.x1-S.x0)*(x1-x0),Y=y=>y0+(S.y1-y)/(S.y1-S.y0)*(y1-y0),k=(x1-x0)/(S.x1-S.x0);
   const path=(pts)=>{ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(X(x),Y(y)):ctx.moveTo(X(x),Y(y)));ctx.closePath();};
   const smooth=(pts)=>{ctx.beginPath();const n=pts.length;for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n],m=[(a[0]+b[0])/2,(a[1]+b[1])/2];if(!i){const z=pts[n-1];ctx.moveTo(X((z[0]+a[0])/2),Y((z[1]+a[1])/2));}ctx.quadraticCurveTo(X(a[0]),Y(a[1]),X(m[0]),Y(m[1]));}ctx.closePath();};
   ctx.save();ctx.beginPath();ctx.rect(x0,y0,x1-x0,y1-y0);ctx.clip();
   ctx.fillStyle='#5b733b';ctx.fillRect(x0,y0,x1-x0,y1-y0);blotches2(ctx,x0,y0,x1-x0,y1-y0,r,160,'140,150,90','50,66,32',28,.14);
   // Paving: a band along the island's north edge (the walkway under the marquise), round the hall, the plaza.
   const calcada=()=>{ctx.fillStyle='#cdc4ae';ctx.fill();};
   ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle='#cdc4ae';ctx.lineWidth=5.4*k;ctx.beginPath();[[969,-341],[972,-335.5],[980,-333.4],[992,-332.2],[999.5,-329.6],[1006,-327.2],[1013,-325],[1019,-323.6],[1025,-324.6],[1028.6,-329],[1027,-334.5]].forEach(([x,y],i)=>i?ctx.lineTo(X(x),Y(y)):ctx.moveTo(X(x),Y(y)));ctx.stroke();
   ctx.beginPath();ctx.arc(X(979),Y(-346),11.4*k,0,2*Math.PI);calcada();
   smooth([[994,-336],[1000,-333],[1004.5,-334],[1006,-338],[1004,-343],[1002,-347.6],[999,-350.4],[995.5,-348]]);calcada();
   // Waves of dark stones in the light paving (the calçada's pattern).
   ctx.save();ctx.globalCompositeOperation='source-atop';ctx.strokeStyle='rgba(60,58,54,.55)';ctx.lineWidth=.35*k;for(let q=0;q<60;q++){const y=y0+q*(y1-y0)/60;ctx.beginPath();for(let x=x0;x<=x1;x+=6){const yy=y+Math.sin(x*.045+q*.9)*.9*k;x===x0?ctx.moveTo(x,yy):ctx.lineTo(x,yy);}ctx.stroke();}ctx.restore();
   // Beds round the pond (Burle Marx): dark greens, white lilies, the purple planting.
   const bed=(pts,base,flowers,n)=>{smooth(pts);ctx.fillStyle=base;ctx.fill();ctx.save();smooth(pts);ctx.clip();const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);for(let q=0;q<n;q++){ctx.fillStyle=flowers[q%flowers.length];ctx.fillRect(X(lerp(Math.min(...xs),Math.max(...xs),r())),Y(lerp(Math.min(...ys),Math.max(...ys),r())),1+r()*1.5,1+r()*1.5);}ctx.restore();};
   bed([[1003,-331.5],[1010,-329.6],[1017,-327.6],[1023,-327],[1029.5,-331],[1030,-337],[1026,-342.5],[1019,-345.6],[1009,-346.4],[1004.5,-344.6],[1007.5,-341.5]],'#3e5c25',['#f2f0e6','#4a6a2a','#2f4a1b','#e8892a'],2400);
   smooth(POND);ctx.fillStyle='#8d8a7c';ctx.fill();const pond=offsetPoly(POND,.3);smooth(pond);ctx.fillStyle='#4a5a33';ctx.fill();
   ctx.save();smooth(pond);ctx.clip();for(let q=0;q<26;q++){ctx.fillStyle=`rgba(${70+r()*40|0},${110+r()*30|0},${50},.7)`;ctx.beginPath();ctx.arc(X(1005+r()*16),Y(-343+r()*12),(.25+r()*.35)*k,0,2*Math.PI);ctx.fill();}ctx.restore();
   // The island's edge: the walls' light coping.
   path(ISLAND);ctx.strokeStyle='#b9b2a2';ctx.lineWidth=.9*k;ctx.stroke();
   grain(ctx,16,r,x0,y0,x1-x0,y1-y0);ctx.restore();}
  // --- The Iate's quay: concrete paving in 1.5 m squares, lawn strips, the 25 m pool and the kidney pool (after the
  // orthophoto), the slipway's apron.
  {const S=SITE.quay,[x0,y0,x1,y1]=S.R,X=u=>x0+(u-S.u0)/(S.u1-S.u0)*(x1-x0),Y=v=>y0+(S.v1-v)/(S.v1-S.v0)*(y1-y0),ku=(x1-x0)/(S.u1-S.u0),kv=(y1-y0)/(S.v1-S.v0);
   ctx.save();ctx.beginPath();ctx.rect(x0,y0,x1-x0,y1-y0);ctx.clip();
   ctx.fillStyle='#bdb7a9';ctx.fillRect(x0,y0,x1-x0,y1-y0);blotches2(ctx,x0,y0,x1-x0,y1-y0,r,80,'230,226,214','110,104,92',30,.1);
   ctx.fillStyle='rgba(90,86,78,.35)';for(let u=S.u0;u<S.u1;u+=1.5)ctx.fillRect(X(u),y0,1,y1-y0);for(let v=S.v0;v<S.v1;v+=1.5)ctx.fillRect(x0,Y(v),x1-x0,1);
   ctx.fillStyle='#5c763c';ctx.fillRect(X(-31),Y(-11.5),(33+31)*ku,3.2*kv);ctx.fillRect(X(-31),Y(31.5),(33+31)*ku,2.5*kv);
   const pool=(u0,u1,v0,v1)=>{ctx.fillStyle='#f0eee8';ctx.fillRect(X(u0)-1.2*ku,Y(v1)-1.2*kv,(u1-u0+2.4)*ku,(v1-v0+2.4)*kv);const g=ctx.createLinearGradient(0,Y(v1),0,Y(v0));g.addColorStop(0,'#58b9d6');g.addColorStop(1,'#3a9cc4');ctx.fillStyle=g;ctx.fillRect(X(u0),Y(v1),(u1-u0)*ku,(v1-v0)*kv);ctx.fillStyle='rgba(20,60,120,.55)';for(let v=v0+1.25;v<v1;v+=2.5)ctx.fillRect(X(u0+1),Y(v)-1,(u1-u0-2)*ku,2);};
   pool(-14,11,15.5,28.5);
   ctx.fillStyle='#f0eee8';ctx.beginPath();ctx.ellipse(X(27),Y(21),5.6*ku,4.3*kv,0,0,2*Math.PI);ctx.fill();ctx.fillStyle='#62c3dc';for(const [u,v,a,b] of [[25.6,21.8,3.2,3.3],[28.6,20.2,3,2.6]]){ctx.beginPath();ctx.ellipse(X(u),Y(v),a*ku,b*kv,0,0,2*Math.PI);ctx.fill();}
   ctx.fillStyle='rgba(60,58,52,.25)';ctx.fillRect(X(-29.5),Y(8.8),45*ku,17.6*kv);
   ctx.fillStyle='#a9a395';ctx.fillRect(X(19.5),Y(-11),7*ku,4*kv);
   grain(ctx,14,r,x0,y0,x1-x0,y1-y0);ctx.restore();}
 },SW,SH,false);
}
function blotches2(ctx,x0,y0,w,h,r,count,light,dark,size,alpha){for(let k=0;k<count;k++){const x=x0+r()*w,y=y0+r()*h,s=size*(.3+r()),c=r()<.5?light:dark,a=alpha*(.4+r()),g=ctx.createRadialGradient(x,y,0,x,y,s);g.addColorStop(0,`rgba(${c},${a})`);g.addColorStop(1,`rgba(${c},0)`);ctx.fillStyle=g;ctx.fillRect(x-s,y-s,2*s,2*s);}}

// ---------- Materials: the uplights' wash after dark on every lit surface
// npFlood: up to 16 uplights (world position, strength), npFloodCol their colours; npNight 0..1. The glazing (the atlas's
// lower half) glows warm.
const MAX_FLOODS=16;
function washed(m,U,key,{glow=false}={}){
 m.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,U);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vNpPos;varying vec3 vNpN;')
   .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvNpPos=(modelMatrix*vec4(transformed,1.)).xyz;vNpN=normalize(mat3(modelMatrix)*objectNormal);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vNpPos;varying vec3 vNpN;uniform vec4 npFlood[${MAX_FLOODS}];uniform vec3 npFloodCol[${MAX_FLOODS}];uniform float npNight;`)
   .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
if(npNight>0.){vec3 n=normalize(vNpN)*(gl_FrontFacing?1.:-1.);vec3 wash=vec3(0.);
 for(int i=0;i<${MAX_FLOODS};i++){vec3 d=npFlood[i].xyz-vNpPos;float l=length(d);wash+=npFloodCol[i]*npFlood[i].w*max(dot(n,d/l),0.)*(1./(1.+l*l/90.));}
 totalEmissiveRadiance+=diffuseColor.rgb*wash*npNight*.17;
 ${glow?'if(vMapUv.y<.5)totalEmissiveRadiance+=diffuseColor.rgb*vec3(1.,.68,.38)*.95*npNight+vec3(.03,.019,.01)*npNight;':''}}`);
 };
 m.customProgramCacheKey=()=>'pampulha-niemeyer-v1-'+key;
 return m;
}

export const hasPampulhaNiemeyer=data=>(data.scenery?.landmarks??[]).some(m=>KINDS.includes(m.kind));
export function createPampulhaNiemeyer(data,options={}){
 try{return build(data,options);}catch(e){console.warn('Pampulha de Niemeyer não montada:',e);const root=new THREE.Group();root.name='Marcos_PampulhaNiemeyer';return {root,obstacles:[],clearings:[],stats:{error:String(e)},update(){}};}
}
function build(data,{ground,mobile=false}={}){
 const root=new THREE.Group();root.name='Marcos_PampulhaNiemeyer';
 const marks=Object.fromEntries((data.scenery?.landmarks??[]).filter(m=>KINDS.includes(m.kind)).map(m=>[m.kind,m])),stats={mobile,buildings:{}};
 if(!Object.keys(marks).length)return {root,obstacles:[],clearings:[],stats,update(){}};
 const W=data.meta.sea_level_m??.8,rand=random(4357);
 const gAt=(x,y)=>{const g=ground?.(x,y);if(g!=null&&Number.isFinite(g))return g;return gridHeight(data.terrain,x,y)??0;};
 const U={npFlood:{value:Array.from({length:MAX_FLOODS},()=>new THREE.Vector4())},npFloodCol:{value:Array.from({length:MAX_FLOODS},()=>new THREE.Vector3())},npNight:{value:0}};
 const tex={concrete:concreteTexture(),rubble:rubbleTexture(),travertine:travertineTexture(),atlas:atlasTexture(),site:siteTexture()};
 const materials={
  concrete:washed(new THREE.MeshStandardMaterial({name:'Niemeyer_concreto',map:tex.concrete,vertexColors:true,roughness:.82,metalness:0}),U,'concrete'),
  atlas:washed(new THREE.MeshStandardMaterial({name:'Niemeyer_azulejos_vidros',map:tex.atlas,vertexColors:true,roughness:.26,metalness:0,side:THREE.DoubleSide}),U,'atlas',{glow:true}),
  rubble:washed(new THREE.MeshStandardMaterial({name:'Niemeyer_pedra',map:tex.rubble,vertexColors:true,roughness:.95,metalness:0}),U,'rubble'),
  travertine:washed(new THREE.MeshStandardMaterial({name:'Niemeyer_travertino',map:tex.travertine,vertexColors:true,roughness:.6,metalness:0}),U,'travertine'),
  paint:washed(new THREE.MeshStandardMaterial({name:'Niemeyer_pintura',vertexColors:true,roughness:.45,metalness:.2}),U,'paint'),
  site:new THREE.MeshStandardMaterial({name:'Niemeyer_chao',map:tex.site,vertexColors:true,roughness:.9,metalness:0})
 };
 const SIZES={concrete:6,rubble:3,travertine:2.4},T=Object.fromEntries(Object.keys(materials).map(k=>[k,new Batch(SIZES[k]??0)]));
 const R=Object.fromEntries(Object.entries(REG).map(([k,v])=>[k,regUv(v)]));
 const WHITE=[1,1,1],white=lin(0xf1efe9),cream=lin(0xd9d1c0),steel=lin(0xb8bcbf),roofGrey=lin(0x8c8a84),blue=lin(0x2f62a8),bronze=lin(0x4a4a3a);
 const aged=(c,s=3)=>p=>{const k=.93+.09*fbm(p[0]/s+p[2]*.13,p[1]/s);return mul(c,k);};
 const floods=[],obstacles=[],clearings=[],lap=lapSpace(data);
 const tris=()=>Object.values(T).reduce((a,b)=>a+b.triangles,0);

 // Tiled wall from a to b (track xy), bottom z0 and top z1 (numbers or functions of t along it), cut into pieces of
 // about `piece` metres; each piece maps its region across, and up by height / H (stacked again past H when `stack`).
 function tiled(B,uvR,a,b,z0,z1,out,{piece,H,stack=false,col=WHITE,n=null,vary=.16}){
  const len=Math.hypot(b[0]-a[0],b[1]-a[1]),N=n??Math.max(1,Math.round(len/piece)),Z0=typeof z0==='function'?z0:()=>z0,Z1=typeof z1==='function'?z1:()=>z1;
  for(let k=0;k<N;k++){const t0=k/N,t1=(k+1)/N,p0=[lerp(a[0],b[0],t0),lerp(a[1],b[1],t0)],p1=[lerp(a[0],b[0],t1),lerp(a[1],b[1],t1)],b0=Z0(t0),b1=Z0(t1),c0=Z1(t0),c1=Z1(t1);
   const rows=stack?Math.max(1,Math.ceil((Math.max(c0-b0,c1-b1)-.02)/H)):1,shade=1-vary/2+vary*rand(),pc=typeof col==='function'?p=>mul(col(p),shade):mul(col,shade);
   for(let q=0;q<rows;q++){const za0=b0+q*H,zb0=b1+q*H,za1=stack?Math.min(c0,za0+H):c0,zb1=stack?Math.min(c1,zb0+H):c1;if(za1<=za0+.01&&zb1<=zb0+.01)continue;
    B.quad([p0[0],p0[1],za0],[p1[0],p1[1],zb0],[p1[0],p1[1],zb1],[p0[0],p0[1],za1],pc,out,[uvR(0,0),uvR(1,0),uvR(1,clamp((zb1-zb0)/H,0,1)),uvR(0,clamp((za1-za0)/H,0,1))]);}}
 }
 // A plain wall from a to b (track xy) between z0 and z1 in batch B (UVs in metres).
 const wall=(B,a,b,z0,z1,col,out)=>B.quad([a[0],a[1],z0],[b[0],b[1],z0],[b[0],b[1],z1],[a[0],a[1],z1],col,out);
 const outOf=(L,u,v)=>sub(L(u,v,0),L(0,0,0));
 // A camera / walker proxy over a 2D outline in track xy.
 const proxy=(P,z0,z1,name)=>{const B=new Batch();B.prism(P,z0,z1,WHITE);const o=B.mesh('Niemeyer_obstaculo_'+name,new THREE.MeshBasicMaterial(),false);o.updateMatrixWorld(true);obstacles.push(o);};
 // Trees off a building's grounds and off the sight lines from the lap (before..after metres round its closest point).
 function clearSight(centre,{before=110,after=70,stop=14,r=5,every=10}={}){
  const A=data.samples;let best=0;A.forEach((p,i)=>{if(Math.hypot(p[1]-centre[0],p[2]-centre[1])<Math.hypot(A[best][1]-centre[0],A[best][2]-centre[1]))best=i;});
  const s0=A[best][0];
  for(const p of A){const ds=p[0]-s0;if(ds<-before||ds>after||Math.round(p[0])%every>1)continue;const dx=centre[0]-p[1],dy=centre[1]-p[2],d=Math.hypot(dx,dy);for(let t=p[4]/2+3;t<d-stop;t+=7)clearings.push({x:p[1]+dx/d*t,y:p[2]+dy/d*t,r});}
  return {s:+s0.toFixed(1),distance:+Math.hypot(A[best][1]-centre[0],A[best][2]-centre[1]).toFixed(1)};
 }
 const clearArea=(P,margin,step=6)=>{const xs=P.map(p=>p[0]),ys=P.map(p=>p[1]);for(let x=Math.min(...xs)-margin;x<=Math.max(...xs)+margin;x+=step)for(let y=Math.min(...ys)-margin;y<=Math.max(...ys)+margin;y+=step)clearings.push({x,y,r:step*.8});};

 // ==================== Casa do Baile
 function casaDoBaile(m){
  const ZI=m.ground+.25,FL=ZI+.06,SU=ZI+4.2,ZT=SU+.62,HC=[979,-346],HR=9;
  let roof=m.outline.map(p=>[p[0],p[1]]);if(Math.hypot(roof[0][0]-roof.at(-1)[0],roof[0][1]-roof.at(-1)[1])<.01)roof.pop();
  const rccw=area(roof)>0,iccw=area(ISLAND)>0;
  // --- The island: its top (the decal) and the rubble walls down into the lake.
  T.site.flat(ISLAND,p=>[p[0],p[1],ZI],WHITE,[0,0,1],p=>siteUv(SITE.island,p[0],p[1]));
  for(let i=0;i<ISLAND.length;i++){const a=ISLAND[i],b=ISLAND[(i+1)%ISLAND.length],o=edgeOut(a,b,iccw),za=Math.min(W-.6,gAt(a[0],a[1])-.3),zb=Math.min(W-.6,gAt(b[0],b[1])-.3);
   T.rubble.quad([a[0],a[1],za],[b[0],b[1],zb],[b[0],b[1],ZI],[a[0],a[1],ZI],aged([1,1,1],2),[o[0],o[1],0]);
   T.concrete.quad([a[0],a[1],ZI],[b[0],b[1],ZI],[b[0]-o[0]*.35,b[1]-o[1]*.35,ZI+.08],[a[0]-o[0]*.35,a[1]-o[1]*.35,ZI+.08],cream,[0,0,1]);}
  // --- The low walls along the walkway, clad in azulejos, a white coping: round the island but at the bridge.
  {const O1=offsetPoly(ISLAND,.4),O2=offsetPoly(ISLAND,.62),H=.85,n=O1.length,bridgeAt=BRIDGE.a;
   for(let i=0;i<n;i++){const j=(i+1)%n,mid=[(O1[i][0]+O1[j][0])/2,(O1[i][1]+O1[j][1])/2];if(Math.hypot(mid[0]-bridgeAt[0],mid[1]-bridgeAt[1])<3.2)continue;
    const o=edgeOut(O1[i],O1[j],iccw);tiled(T.atlas,R.azBaile,O1[i],O1[j],ZI,ZI+H,[o[0],o[1],0],{piece:1.2,H:.9});
    if(!mobile)tiled(T.atlas,R.azBaile,O2[i],O2[j],ZI,ZI+H,[-o[0],-o[1],0],{piece:1.2,H:.9});
    T.concrete.quad([O1[i][0]+o[0]*.03,O1[i][1]+o[1]*.03,ZI+H],[O1[j][0]+o[0]*.03,O1[j][1]+o[1]*.03,ZI+H],[O2[j][0]-o[0]*.03,O2[j][1]-o[1]*.03,ZI+H+.06],[O2[i][0]-o[0]*.03,O2[i][1]-o[1]*.03,ZI+H+.06],white,[0,0,1]);}}
  // --- The hall: a 9 m circle, its west half a tiled wall, the rest glazing in white frames; its floor and ceiling.
  {const n=mobile?24:36;for(let k=0;k<n;k++){const a0=k/n*2*Math.PI,a1=(k+1)/n*2*Math.PI,am=(a0+a1)/2,p0=[HC[0]+Math.cos(a0)*HR,HC[1]+Math.sin(a0)*HR],p1=[HC[0]+Math.cos(a1)*HR,HC[1]+Math.sin(a1)*HR],o=[Math.cos(am),Math.sin(am),0],deg=(am*180/Math.PI+360)%360;
    if(deg>150&&deg<262)tiled(T.atlas,R.azHall,p0,p1,FL,SU,o,{piece:9,n:1,H:1.2,stack:true});
    else tiled(T.atlas,R.glassBaile,p0,p1,FL,SU,o,{piece:9,n:1,H:4.2});
    wall(T.concrete,p0,p1,ZI-.05,FL,cream,o);}}
  // --- The roof: one slab over the hall and along the marquise (the cadastre's outline), white fascia and soffit.
  T.concrete.flat(roof,p=>[p[0],p[1],ZT],aged(white,4),[0,0,1]);T.concrete.flat(roof,p=>[p[0],p[1],SU],mul(white,.93),[0,0,-1]);
  for(let i=0;i<roof.length;i++){const a=roof[i],b=roof[(i+1)%roof.length],o=edgeOut(a,b,rccw);wall(T.concrete,a,b,SU,ZT,aged(white,3),[o[0],o[1],0]);}
  // --- Columns: one row along the marquise's middle (rays across it from its edge), and round the hall where the roof
  // reaches far beyond it; 4.5 m apart at least.
  {const cand=[],n=roof.length;
   for(let i=0;i<n;i++){const p=roof[i],a=edgeOut(roof[(i+n-1)%n],p,rccw),b=edgeOut(p,roof[(i+1)%n],rccw),d=[-(a[0]+b[0]),-(a[1]+b[1])],l=Math.hypot(...d)||1,dir=[d[0]/l,d[1]/l],w=rayHit(roof,p,dir);
    if(w>2.2&&w<6.5){const q=[p[0]+dir[0]*w/2,p[1]+dir[1]*w/2];if(Math.hypot(q[0]-HC[0],q[1]-HC[1])>HR+2.5)cand.push(q);}}
   for(let k=0;k<48;k++){const a=k/48*2*Math.PI,d=[Math.cos(a),Math.sin(a)],e=rayHit(roof,[HC[0]+d[0]*HR,HC[1]+d[1]*HR],d);if(e>2.6&&e<9)cand.push([HC[0]+d[0]*(HR+e-1.3),HC[1]+d[1]*(HR+e-1.3)]);}
   const cols=[];for(const q of cand)if(inside(q[0],q[1],roof)&&cols.every(c=>Math.hypot(c[0]-q[0],c[1]-q[1])>4.5))cols.push(q);
   for(const q of cols)T.concrete.post([q[0],q[1],ZI-.1],[q[0],q[1],SU],.19,.19,mobile?6:10,aged(cream,2),{top:false});
   stats.buildings.casa_do_baile={columns:cols.length};}
  // --- The tiled drum under the marquise's curl (a white panel on its pond side), the stage in the pond.
  {const c=[1025.5,-331.1],r=1.9,n=mobile?10:16;for(let k=0;k<n;k++){const a0=k/n*2*Math.PI,a1=(k+1)/n*2*Math.PI,am=(a0+a1)/2;tiled(T.atlas,R.azBaile,[c[0]+Math.cos(a0)*r,c[1]+Math.sin(a0)*r],[c[0]+Math.cos(a1)*r,c[1]+Math.sin(a1)*r],ZI,SU,[Math.cos(am),Math.sin(am),0],{piece:2,n:1,H:.9,stack:true});}
   const a=Math.atan2(-.75,-.66),o=[Math.cos(a),Math.sin(a)],t=[-o[1],o[0]],P=(s,z,d=r+.05)=>[c[0]+o[0]*d+t[0]*s,c[1]+o[1]*d+t[1]*s,z];T.concrete.quad(P(-.7,ZI+.4),P(.7,ZI+.4),P(.7,ZI+2.1),P(-.7,ZI+2.1),white,[o[0],o[1],0]);
   T.concrete.post([STAGE.x,STAGE.y,ZI-.4],[STAGE.x,STAGE.y,ZI+.38],STAGE.r,STAGE.r,mobile?14:24,lin(0xcfc5ae));
   T.paint.flat(offsetPoly(POND,.3),p=>[p[0],p[1],ZI+.05],lin(0x34402a),[0,0,1]);}
  // --- The footbridge: an arched deck, white sides, the underside rising to the middle, white railings.
  {const A=BRIDGE.a,B=BRIDGE.b,len=Math.hypot(B[0]-A[0],B[1]-A[1]),d=[(B[0]-A[0])/len,(B[1]-A[1])/len],nrm=[-d[1],d[0]],hw=BRIDGE.w/2,a0=[A[0]-d[0]*1.6,A[1]-d[1]*1.6],b0=[B[0]+d[0]*1.4,B[1]+d[1]*1.4],L2=len+3,zs=gAt(b0[0],b0[1])+.08,n=mobile?8:14;
   const P=(t,s)=>[a0[0]+d[0]*t*L2+nrm[0]*s,a0[1]+d[1]*t*L2+nrm[1]*s],top=t=>lerp(ZI+.05,zs,t)+.5*Math.sin(Math.PI*t),under=t=>top(t)-.3-.75*(1-Math.sin(Math.PI*t))**2;
   for(let k=0;k<n;k++){const t0=k/n,t1=(k+1)/n;
    T.concrete.quad([...P(t0,-hw),top(t0)],[...P(t1,-hw),top(t1)],[...P(t1,hw),top(t1)],[...P(t0,hw),top(t0)],lin(0xd3cab4),[0,0,1]);
    T.concrete.quad([...P(t0,-hw),under(t0)],[...P(t1,-hw),under(t1)],[...P(t1,hw),under(t1)],[...P(t0,hw),under(t0)],mul(white,.85),[0,0,-1]);
    for(const s of [-1,1])T.concrete.quad([...P(t0,s*hw),under(t0)],[...P(t1,s*hw),under(t1)],[...P(t1,s*hw),top(t1)+.08],[...P(t0,s*hw),top(t0)+.08],aged(white,2),[nrm[0]*s,nrm[1]*s,0]);}
   const np=Math.round(L2/1.5);for(const s of [-1,1]){const at=t=>[...P(t,s*(hw-.08)),top(t)];for(let k=0;k<=np;k++){const p=at(k/np);T.paint.post(p,[p[0],p[1],p[2]+1.02],.04,.04,4,white,{top:false});}
    for(let k=0;k<n;k++){const p=at(k/n),q=at((k+1)/n);for(const h of [1.02,.55])T.paint.post([p[0],p[1],p[2]+h],[q[0],q[1],q[2]+h],.035,.035,4,white,{top:false});}}}
  const tri=tris();
  floods.push([...[HC[0]+12,HC[1]-6],ZI+.3,[1,.9,.76],2.6],[...[HC[0]-3,HC[1]-13],ZI+.3,[1,.92,.8],2.4],[...[HC[0]-13,HC[1]+3],ZI+.3,[1,.92,.8],2.2],[1010,-329.5,ZI+.3,[1,.9,.78],2.4],[1021,-336.5,ZI+.4,[.95,.96,1],2]);
  const ring=Array.from({length:12},(_,k)=>[HC[0]+Math.cos(k/12*2*Math.PI)*HR,HC[1]+Math.sin(k/12*2*Math.PI)*HR]);proxy(ring,ZI-1,ZT,'casa_do_baile');
  clearArea(ISLAND,4);const sight=clearSight([990,-342],{before:120,after:80,stop:16});
  Object.assign(stats.buildings.casa_do_baile,{floor:+ZI.toFixed(2),roofTop:+ZT.toFixed(2),lapClosest:sight});
  return tri;
 }

 // ==================== Iate Tênis Clube
 function iate(m){
  const Z0=m.ground+.1,L=frame(m.x,m.y,Z0,m.heading),HL=m.w/2,HW=m.d/2,SE=-HL,NW=15,VAL=-1.9,F2=3.7;
  const ru=u=>u<VAL?lerp(10.6,6.6,(u-SE)/(VAL-SE)):lerp(6.6,9.2,(u-VAL)/(NW-VAL)),RT=.45,o=(u,v)=>outOf(L,u,v),P2=(u,v)=>{const p=L(u,v,0);return [p[0],p[1]];};
  // --- The quay: paving on top, rubble walls to the lake bed.
  const Q=QUAY.map(([u,v])=>P2(u,v)),qccw=area(Q)>0;
  T.site.flat(QUAY,([u,v])=>L(u,v,0),WHITE,[0,0,1],([u,v])=>siteUv(SITE.quay,u,v));
  for(let i=0;i<Q.length;i++){const a=Q[i],b=Q[(i+1)%Q.length],e=edgeOut(a,b,qccw),za=Math.min(Z0-1,gAt(a[0],a[1])-.3),zb=Math.min(Z0-1,gAt(b[0],b[1])-.3);
   T.rubble.quad([a[0],a[1],za],[b[0],b[1],zb],[b[0],b[1],Z0],[a[0],a[1],Z0],aged([.95,.95,.95],2),[e[0],e[1],0]);
   T.concrete.quad([a[0],a[1],Z0+.12],[b[0],b[1],Z0+.12],[b[0]+e[0]*.15,b[1]+e[1]*.15,Z0],[a[0]+e[0]*.15,a[1]+e[1]*.15,Z0],cream,[e[0],e[1],.3]);}
  // --- The upper floor: glazing in dark frames on both long sides (its top following the roof), the SE end glazed
  // too, the NW end a white wall; the floor slab with its balcony toward the lake (v -8.5) and the white railing.
  const VG=-6.3,VB=HW+.0;
  {const nb=Math.round((NW-SE)/1.75);for(const [v,s] of [[VG,-1],[VB,1]])for(let k=0;k<nb;k++){const u0=lerp(SE,NW,k/nb),u1=lerp(SE,NW,(k+1)/nb);
    T.atlas.quad(L(u0,v,F2),L(u1,v,F2),L(u1,v,ru(u1)),L(u0,v,ru(u0)),WHITE,o(0,s),[R.glassIate(0,0),R.glassIate(1,0),R.glassIate(1,(ru(u1)-F2)/8),R.glassIate(0,(ru(u0)-F2)/8)]);}
   const ne=Math.round((VB-VG)/1.75);for(let k=0;k<ne;k++){const v0=lerp(VG,VB,k/ne),v1=lerp(VG,VB,(k+1)/ne);T.atlas.quad(L(SE,v0,F2),L(SE,v1,F2),L(SE,v1,ru(SE)),L(SE,v0,ru(SE)),WHITE,o(-1,0),[R.glassIate(0,0),R.glassIate(1,0),R.glassIate(1,(ru(SE)-F2)/8),R.glassIate(0,(ru(SE)-F2)/8)]);}
   T.concrete.quad(L(NW,VG,F2),L(NW,VB,F2),L(NW,VB,ru(NW)),L(NW,VG,ru(NW)),aged(white),o(1,0));
   // Mullion posts proud of the glass every other bay (the frame's rhythm from afar).
   for(let k=0;k<=nb;k+=2){const u=lerp(SE,NW,k/nb);for(const v of [VG-.06,VB+.06])T.paint.box(L,u-.07,u+.07,v-.05,v+.05,F2,ru(u),lin(0x3a3530),{top:false});}
   // White corner piers frame the tall SE end (the end the avenue sees).
   for(const v of [VG,VB])T.concrete.box(L,SE-.3,SE+.3,v-.3,v+.3,F2,ru(SE),aged(white),{top:false});}
  // The floor slab (edge band, balcony, soffit) and the railing.
  {const s0=SE-.3,s1=NW+.3,v0=-HW,v1=HW+.3;T.concrete.box(L,s0,s1,v0,v1,F2-.5,F2,aged(white),{bottom:true});
   const np=Math.round((s1-s0)/1.8);for(let k=0;k<=np;k++){const u=lerp(s0+.1,s1-.1,k/np);T.paint.post(L(u,v0+.1,F2),L(u,v0+.1,F2+1.05),.035,.035,4,white,{top:false});}
   for(const h of [1.05,.55])T.paint.post(L(s0+.1,v0+.1,F2+h),L(s1-.1,v0+.1,F2+h),.04,.04,5,white,{top:false});}
  // --- The butterfly roof: two planes to the valley, white fascia round, light membrane on top, white soffit.
  {const v0=-HW-.3,v1=HW+.5,s0=SE-.5,s1=NW+.4,y=u=>ru(clamp(u,SE,NW));
   for(const [a,b] of [[s0,VAL],[VAL,s1]]){
    T.paint.quad(L(a,v0,y(a)+RT),L(b,v0,y(b)+RT),L(b,v1,y(b)+RT),L(a,v1,y(a)+RT),aged(lin(0xb5b2aa),5),[0,0,1]);
    T.concrete.quad(L(a,v0,y(a)),L(b,v0,y(b)),L(b,v1,y(b)),L(a,v1,y(a)),mul(white,.9),[0,0,-1]);
    for(const [v,s] of [[v0,-1],[v1,1]])T.concrete.quad(L(a,v,y(a)),L(b,v,y(b)),L(b,v,y(b)+RT),L(a,v,y(a)+RT),aged(white),o(0,s));}
   for(const [u,s] of [[s0,-1],[s1,1]])T.concrete.quad(L(u,v0,y(u)),L(u,v1,y(u)),L(u,v1,y(u)+RT),L(u,v0,y(u)+RT),aged(white),o(s,0));
   // The roof's lights along the valley (the orthophoto's skylights).
   for(let k=0;k<4;k++)T.atlas.quad(L(VAL-1.2,-4+k*2.4,y(VAL)+RT+.06),L(VAL+1.2,-4+k*2.4,y(VAL)+RT+.06),L(VAL+1.2,-2.4+k*2.4,y(VAL)+RT+.06),L(VAL-1.2,-2.4+k*2.4,y(VAL)+RT+.06),WHITE,[0,0,1],[R.window(0,0),R.window(1,0),R.window(1,1),R.window(0,1)]);}
  // --- The ground floor: tiled walls set back under the slab, windows, round posts at the glass line.
  {const v0=-3.8,v1=HW-.6,z1=F2-.5;
   tiled(T.atlas,R.iateTile,P2(SE+1,v0),P2(NW-1,v0),0+Z0,z1+Z0,[...o(0,-1)],{piece:1.2,H:1.2,stack:true});
   tiled(T.atlas,R.iateTile,P2(SE+1,v1),P2(NW-1,v1),Z0,z1+Z0,[...o(0,1)],{piece:1.2,H:1.2,stack:true});
   tiled(T.atlas,R.iateTile,P2(SE+1,v0),P2(SE+1,v1),Z0,z1+Z0,[...o(-1,0)],{piece:1.2,H:1.2,stack:true});
   tiled(T.atlas,R.iateTile,P2(NW-1,v0),P2(NW-1,v1),Z0,z1+Z0,[...o(1,0)],{piece:1.2,H:1.2,stack:true});
   for(let k=0;k<6;k++){const u=lerp(SE+5,NW-6,k/5),p=P2(u,v0-.02);tiled(T.atlas,R.window,[p[0]-o(1,0)[0],p[1]-o(1,0)[1]],[p[0]+o(1,0)[0],p[1]+o(1,0)[1]],Z0+.9,Z0+2.6,[...o(0,-1)],{piece:2,n:1,H:2});}
   for(let k=0;k<9;k++){const u=lerp(SE+.6,NW-.6,k/8);T.concrete.post(L(u,VG,-.3),L(u,VG,F2-.5),.2,.2,mobile?6:10,aged(white,2),{top:false});T.concrete.post(L(u,v1+.2,-.3),L(u,v1+.2,F2-.5),.2,.2,mobile?6:10,aged(white,2),{top:false});}}
  // --- The T-topped pylon by the valley on the lake side, the ramp down at the SE end, the NW canopy on blue posts,
  // the slipway into the lake.
  T.concrete.box(L,VAL-.7,VAL+.7,-10.9,-10.1,-.3,7.1,aged(white,2));T.concrete.box(L,VAL-2.6,VAL+2.6,-11.7,-9.3,7.1,7.4,aged(white,2),{bottom:true});
  {const u0=SE+17,u1=SE-1.5,v0=-11.5,v1=-9.6,z=t=>lerp(F2,.05,t),n=mobile?4:8;
   for(let k=0;k<n;k++){const t0=k/n,t1=(k+1)/n,ua=lerp(u0,u1,t0),ub=lerp(u0,u1,t1);T.concrete.quad(L(ua,v0,z(t0)),L(ub,v0,z(t1)),L(ub,v1,z(t1)),L(ua,v1,z(t0)),lin(0xcfcac0),[0,0,1]);
    T.concrete.quad(L(ua,v0,z(t0)-.3),L(ub,v0,z(t1)-.3),L(ub,v1,z(t1)-.3),L(ua,v1,z(t0)-.3),mul(white,.8),[0,0,-1]);
    for(const [v,s] of [[v0,-1],[v1,1]])T.concrete.quad(L(ua,v,z(t0)-.3),L(ub,v,z(t1)-.3),L(ub,v,z(t1)+.95),L(ua,v,z(t0)+.95),aged(cream,2),o(0,s));}
   for(let k=1;k<4;k++){const t=k/4,u=lerp(u0,u1,t);T.concrete.post(L(u,(v0+v1)/2,-.2),L(u,(v0+v1)/2,z(t)-.3),.16,.16,6,cream,{top:false});}}
  {const c0=NW,c1=HL,z0=F2+.55,z1=F2+.85;T.concrete.box(L,c0,c1,-HW,HW,z0,z1,aged(white),{bottom:true});for(const u of [c0+3,c1-.5])for(const v of [-HW+.5,0,HW-.5])T.paint.post(L(u,v,-.2),L(u,v,z0),.12,.12,8,blue,{top:false});}
  {const a=20,b=26,z=t=>lerp(.02,W-Z0-.9,t);T.concrete.quad(L(a,-15,z(0)),L(b,-15,z(0)),L(b,-21,z(1)),L(a,-21,z(1)),lin(0xa8a397),[0,0,1]);for(const u of [a,b])T.concrete.quad(L(u,-15,z(0)),L(u,-21,z(1)),L(u,-21,z(1)-.4),L(u,-15,-1.2),lin(0x9a968c),o(u===a?-1:1,0));}
  const tri=tris();
  floods.push([...L(SE-5,-4,.3).slice(0,2),Z0+.3,[1,.9,.78],3],[...L(-14,-13,.3).slice(0,2),Z0+.3,[1,.92,.8],3],[...L(8,-13,.3).slice(0,2),Z0+.3,[1,.92,.8],2.8],[...L(-8,12,.3).slice(0,2),Z0+.3,[1,.9,.78],2.6]);
  proxy([P2(SE,-HW),P2(NW,-HW),P2(NW,HW),P2(SE,HW)],Z0-1,Z0+10,'iate');
  clearArea(Q,3,7);const sight=clearSight(L(SE+8,0,0),{before:110,after:90,stop:12});
  stats.buildings.iate={quay:+Z0.toFixed(2),floor:+(Z0+F2).toFixed(2),roofEnds:[+(Z0+ru(SE)+RT).toFixed(2),+(Z0+ru(NW)+RT).toFixed(2)],valley:+(Z0+ru(VAL)+RT).toFixed(2),lapClosest:sight};
  return tri;
 }

 // ==================== Museu de Arte da Pampulha (the Cassino)
 function museu(m){
  // The main box on the cadastre: N corner (614.98, -26.44), the NE face toward the E corner (31.7 m), 24.6 m deep.
  const N=[614.98,-26.44],E=[637.8,-48.41],LU=Math.hypot(E[0]-N[0],E[1]-N[1]),h=Math.atan2(E[1]-N[1],E[0]-N[0]),DEP=24.6;
  const zf=gAt(...frame(N[0],N[1],0,h)(LU/2,4,0).slice(0,2)),ZF=Math.max(zf,m.ground)+.05,L=frame(N[0],N[1],ZF,h),o=(u,v)=>outOf(L,u,v),P2=(u,v)=>{const p=L(u,v,0);return [p[0],p[1]];};
  const G1=4.4,UP=10.2,RT=.6,SOLID=22.6,trav=aged(lin(0xfff1dc),3);
  // How far each wall must reach down (the peninsula falls away toward the lake and the NW).
  const foot=(u0,v0,u1,v1)=>{let z=0;for(let t=0;t<=1;t+=.1){const p=P2(lerp(u0,u1,t),lerp(v0,v1,t));z=Math.min(z,gAt(p[0],p[1])-ZF-.3);}return z;};
  // --- The NE (entrance) face: the glass curtain over the recessed glazed ground floor, the travertine block at the SE.
  {const zb=foot(0,0,LU,0);
   tiled(T.atlas,R.glassMuseu,P2(0,0),P2(SOLID,0),ZF+G1+.3,ZF+UP-.2,o(0,1),{piece:1.5,H:5});
   T.concrete.quad(L(0,.02,G1-.1),L(SOLID,.02,G1-.1),L(SOLID,.02,G1+.3),L(0,.02,G1+.3),aged(white),o(0,1));T.concrete.quad(L(0,.02,UP-.2),L(SOLID,.02,UP-.2),L(SOLID,.02,UP),L(0,.02,UP),aged(white),o(0,1));
   wall(T.travertine,P2(SOLID,0),P2(LU,0),ZF+zb,ZF+UP,trav,o(0,1));
   tiled(T.atlas,R.glassLow,P2(1.5,-1.4),P2(SOLID,-1.4),ZF,ZF+G1-.1,o(0,1),{piece:2,H:4});
   T.concrete.quad(L(1.5,-1.4,G1-.1),L(SOLID,-1.4,G1-.1),L(SOLID,0,G1-.1),L(1.5,0,G1-.1),mul(white,.9),[0,0,-1]);
   wall(T.travertine,P2(0,-1.4),P2(1.5,-1.4),ZF,ZF+G1,trav,o(0,1));wall(T.travertine,P2(1.5,0),P2(1.5,-1.4),ZF,ZF+G1,trav,o(-1,0));wall(T.travertine,P2(0,0),P2(1.5,0),ZF+G1-.1,ZF+G1+.3,trav,o(0,1));
   wall(T.travertine,P2(0,0),P2(0,-1.4),ZF,ZF+G1,trav,o(-1,0));
   wall(T.travertine,P2(0,0),P2(SOLID,0),ZF+zb,ZF,mul(trav(L(0,0,0)),.85),o(0,1));
   for(let k=0;k<5;k++){const u=lerp(4,20.5,k/4);T.paint.post(L(u,-.7,0),L(u,-.7,G1-.1),.15,.15,mobile?6:12,steel,{top:false});}}
  // --- The SE end and the NW side in travertine; the back (SW) toward the lake: a glass band upstairs.
  wall(T.travertine,P2(LU,0),P2(LU,-DEP),ZF+foot(LU,0,LU,-DEP),ZF+UP,trav,o(1,0));
  wall(T.travertine,P2(0,-DEP),P2(0,0),ZF+foot(0,0,0,-DEP),ZF+UP,trav,o(-1,0));
  {const zb=foot(0,-DEP,LU,-DEP);wall(T.travertine,P2(0,-DEP),P2(LU,-DEP),ZF+zb,ZF+G1+.3,trav,o(0,-1));wall(T.travertine,P2(0,-DEP),P2(9,-DEP),ZF+G1+.3,ZF+UP,trav,o(0,-1));
   tiled(T.atlas,R.glassMuseu,P2(9,-DEP),P2(LU,-DEP),ZF+G1+.3,ZF+UP-.2,o(0,-1),{piece:1.5,H:5});T.concrete.quad(L(9,-DEP-.02,UP-.2),L(LU,-DEP-.02,UP-.2),L(LU,-DEP-.02,UP),L(9,-DEP-.02,UP),aged(white),o(0,-1));}
  // --- The roof: slab overhanging 0.7 m, light membrane on top, white fascia.
  {const a=-.7,b=LU+.7,c=-DEP-.7,d=.7;T.paint.quad(L(a,c,UP+RT),L(b,c,UP+RT),L(b,d,UP+RT),L(a,d,UP+RT),aged(roofGrey,6),[0,0,1]);T.concrete.quad(L(a,c,UP),L(b,c,UP),L(b,d,UP),L(a,d,UP),mul(white,.9),[0,0,-1]);
   for(const [p,q,s] of [[[a,c],[b,c],o(0,-1)],[[b,c],[b,d],o(1,0)],[[b,d],[a,d],o(0,1)],[[a,d],[a,c],o(-1,0)]])T.concrete.quad(L(p[0],p[1],UP),L(q[0],q[1],UP),L(q[0],q[1],UP+RT+.08),L(p[0],p[1],UP+RT+.08),aged(white),s);}
  // --- The entrance canopy (its free outline on the cadastre) on three slender posts.
  {const C=[[16.3,0],[18.2,7.4],[13,8.4],[7,8.1],[3.2,6.6],[2.9,5.6],[9.6,5.4],[10.3,0]].map(([u,v])=>P2(u,v)),z0=ZF+3.5,z1=ZF+3.85;T.concrete.prism(C,z0,z1,aged(white),{bottom:true});
   for(const [u,v] of [[5.6,6.4],[11.6,7.4],[16.6,6.6]])T.paint.post(L(u,v,0),L(u,v,3.5),.1,.1,8,steel,{top:false});}
  // --- The curved annex (the old ballroom) toward the lake: glazed lower floor, a slab band, the glass band above.
  {const ann=m.outline.slice(24,50).map(p=>[p[0],p[1]]);ann.push(P2(4,-21));const accw=area(ann)>0,Z1=ZF+3.3,Z2=ZF+6.5,ZR=ZF+7.05;
   for(let i=0;i<ann.length;i++){const a=ann[i],b=ann[(i+1)%ann.length],e=edgeOut(a,b,accw),mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    // Edges inside the main box are hidden: skip them.
    const rel=[mid[0]-N[0],mid[1]-N[1]],mu=rel[0]*Math.cos(h)+rel[1]*Math.sin(h),mv=-rel[0]*Math.sin(h)+rel[1]*Math.cos(h);if(mu>.3&&mu<LU&&mv<-.3&&mv>-DEP)continue;
    const zb=Math.min(0,gAt(mid[0],mid[1])-ZF-.3);wall(T.travertine,a,b,ZF+zb,ZF+.4,trav,[e[0],e[1],0]);
    tiled(T.atlas,R.glassLow,a,b,ZF+.4,Z1,[e[0],e[1],0],{piece:2,H:4,n:Math.max(1,Math.round(len/2))});wall(T.concrete,a,b,Z1,Z1+.4,aged(white),[e[0],e[1],0]);
    tiled(T.atlas,R.glassBand,a,b,Z1+.4,Z2,[e[0],e[1],0],{piece:1.5,H:3,n:Math.max(1,Math.round(len/1.5))});wall(T.concrete,a,b,Z2,ZR,aged(white),[e[0],e[1],0]);}
   T.paint.flat(ann,p=>[p[0],p[1],ZR],aged(roofGrey,6),[0,0,1]);T.concrete.flat(ann,p=>[p[0],p[1],Z1+.2],mul(white,.9),[0,0,-1]);
   stats.buildings.museu_de_arte={annexPoints:ann.length};}
  // --- The lower NW wing: white walls with windows, a flat roof.
  {const wing=[[0,-11.6],[-6.3,-11.7],[-6.4,-4.6],[-11.3,-4.7],[-11.5,-26.7],[-5.87,-27.05],[-5.7,-22.9],[0,-22.9]].map(([u,v])=>P2(u,v)),wccw=area(wing)>0,ZW=ZF+4.6;
   for(let i=0;i<wing.length;i++){const a=wing[i],b=wing[(i+1)%wing.length],e=edgeOut(a,b,wccw),len=Math.hypot(b[0]-a[0],b[1]-a[1]),zb=Math.min(0,Math.min(gAt(a[0],a[1]),gAt(b[0],b[1]))-ZF-.3);
    if(len<.5)continue;wall(T.concrete,a,b,ZF+zb,ZW,aged(white,2),[e[0],e[1],0]);
    if(len>3.5){const n=Math.floor(len/3.2);for(let k=0;k<n;k++){const t=(k+.5)/n,c=[lerp(a[0],b[0],t),lerp(a[1],b[1],t)],d=[(b[0]-a[0])/len,(b[1]-a[1])/len];tiled(T.atlas,R.window,[c[0]-d[0]+e[0]*.03,c[1]-d[1]+e[1]*.03],[c[0]+d[0]+e[0]*.03,c[1]+d[1]+e[1]*.03],ZF+1.4,ZF+3.4,[e[0],e[1],0],{piece:2,n:1,H:2});}}}
   T.concrete.flat(wing,p=>[p[0],p[1],ZW],aged(white,4),[0,0,1]);}
  // --- Three sculptures in the garden (evoked: two figures embracing in bronze, a standing nude in white stone, a
  // twisting bronze figure), on travertine plinths.
  {const plinth=(p,hh)=>{const F=frame(p[0],p[1],gAt(p[0],p[1])-.2,h);T.travertine.box(F,-.45,.45,-.45,.45,0,hh,trav);return F;};
   let F=plinth(L(30,14,0),1.1);T.paint.post(F(-.15,0,1.1),F(-.05,0,3),.24,.16,8,bronze);T.paint.post(F(.18,0,1.1),F(.02,.05,2.9),.22,.15,8,bronze);T.paint.post(F(-.05,0,2.85),F(-.02,0,3.25),.13,.1,8,bronze);
   F=plinth(L(40.5,2,0),.9);T.paint.post(F(0,0,.9),F(.05,0,2.4),.2,.13,8,lin(0xe9e4d8));T.paint.post(F(.05,0,2.4),F(.04,0,2.75),.11,.09,8,lin(0xe9e4d8));
   F=plinth(L(-16,-2,0),1.4);T.paint.post(F(0,0,1.4),F(.2,.1,2.3),.18,.24,7,bronze);T.paint.post(F(.2,.1,2.3),F(-.15,-.1,3.1),.24,.12,7,bronze);T.paint.post(F(-.15,-.1,3.1),F(.3,0,3.4),.14,.05,6,bronze);}
  const tri=tris();
  floods.push([...L(8,12,0).slice(0,2),null,[1,.9,.76],3.4],[...L(26,13,0).slice(0,2),null,[1,.92,.8],3.2],[...L(LU+10,-12,0).slice(0,2),null,[1,.9,.78],3],[...L(14,-DEP-12,0).slice(0,2),null,[1,.92,.8],2.8]);
  proxy([P2(0,0),P2(LU,0),P2(LU,-DEP),P2(0,-DEP)],ZF-3,ZF+UP+RT,'museu');
  clearArea([P2(-12,-28),P2(LU+4,4),P2(LU+4,-DEP-4),P2(-12,4)],4,7);
  const sight=clearSight(L(LU/2,0,0),{before:110,after:80,stop:20,r:6});
  Object.assign(stats.buildings.museu_de_arte,{floor:+ZF.toFixed(2),roofTop:+(ZF+UP+RT).toFixed(2),lapClosest:sight});
  return tri;
 }

 // ==================== Casa Kubitschek
 function kubitschek(m){
  const ZF=m.ground+.55,L=frame(m.x,m.y,ZF,m.heading),o=(u,v)=>outOf(L,u,v),P2=(u,v)=>{const p=L(u,v,0);return [p[0],p[1]];};
  const U0=4.1,U1=15.9,V0=-10.04,V1=10.05,VV=2.8,rz=v=>v<VV?lerp(5.3,3.7,(v-V0)/(VV-V0)):lerp(3.7,4.8,(v-VV)/(V1-VV)),RT=.32,GL=2.7,VER=-4,beige=lin(0xe3d6bd);
  const foot=(u,v)=>Math.min(-.2,gAt(...P2(u,v))-ZF-.3);
  // --- The main block's front (east): the deck on its rubble base with the white parapet and railing, the glazing,
  // the log screen under the butterfly roof; the veranda at the south with the azulejo panel.
  {const UD=U1+1.8,nb=Math.round((V1-VER)/2.4);
   tiled(T.atlas,R.glassJK,P2(U1,VER),P2(U1,V1),ZF,ZF+GL,o(1,0),{piece:2.4,H:2.7,n:nb});
   wall(T.concrete,P2(U1-3,V0),P2(U1-3,VER),ZF,ZF+GL,aged(beige,2),o(1,0));
   tiled(T.atlas,R.volpi,P2(U1-2.97,V0+.15),P2(U1-2.97,VER-.15),ZF+.1,ZF+2.6,o(1,0),{piece:6,n:1,H:2.5});
   wall(T.concrete,P2(U1-3,VER),P2(U1,VER),ZF,ZF+GL,beige,o(0,-1));T.concrete.quad(L(U1-3,V0,GL),L(U1,V0,GL),L(U1,VER,GL),L(U1-3,VER,GL),mul(white,.85),[0,0,-1]);
   T.concrete.quad(L(U1-3,V0,0),L(U1,V0,0),L(U1,VER,0),L(U1-3,VER,0),lin(0x9a6a4a),[0,0,1]);
   const nl=Math.round((V1-V0)/1.6);for(let k=0;k<nl;k++){const v0=lerp(V0,V1,k/nl),v1=lerp(V0,V1,(k+1)/nl);T.atlas.quad(L(U1+.05,v0,GL),L(U1+.05,v1,GL),L(U1+.05,v1,rz(v1)),L(U1+.05,v0,rz(v0)),WHITE,o(1,0),[R.logs(0,0),R.logs(1,0),R.logs(1,(rz(v1)-GL)/3.2),R.logs(0,(rz(v0)-GL)/3.2)]);}
   T.concrete.quad(L(U1+.06,V0,GL-.18),L(U1+.06,V1,GL-.18),L(U1+.06,V1,GL),L(U1+.06,V0,GL),white,o(1,0));
   // The deck, the parapet, the railing; the rubble under it down to the garden.
   T.concrete.quad(L(U1,V0,0),L(UD,V0,0),L(UD,V1,0),L(U1,V1,0),lin(0xcdc6b6),[0,0,1]);
   wall(T.concrete,P2(UD,V0),P2(UD,V1),ZF-.2,ZF+.5,aged(white,2),o(1,0));T.concrete.quad(L(UD,V0,.5),L(UD,V1,.5),L(UD-.2,V1,.5),L(UD-.2,V0,.5),white,[0,0,1]);
   for(const [v,s] of [[V0,-1],[V1,1]])wall(T.concrete,P2(U1,v),P2(UD,v),ZF-.2,ZF+.5,aged(white,2),o(0,s));
   const nr=Math.round((V1-V0)/1.5);for(let k=0;k<=nr;k++){const v=lerp(V0+.1,V1-.1,k/nr);T.paint.post(L(UD-.1,v,.5),L(UD-.1,v,1.05),.025,.025,4,white,{top:false});}T.paint.post(L(UD-.1,V0+.1,1.05),L(UD-.1,V1-.1,1.05),.03,.03,5,white,{top:false});
   const n=mobile?4:8;for(let k=0;k<n;k++){const v0=lerp(V0,V1,k/n),v1=lerp(V0,V1,(k+1)/n);T.rubble.quad(L(UD,v0,foot(UD,v0)),L(UD,v1,foot(UD,v1)),L(UD,v1,-.2),L(UD,v0,-.2),aged([1,1,1],2),o(1,0));}
   for(const [v,s] of [[V0,-1],[V1,1]])T.rubble.quad(L(U0,v,foot(U0,v)),L(UD,v,foot(UD,v)),L(UD,v,-.2),L(U0,v,-.2),aged([1,1,1],2),o(0,s));}
  // --- The main block's ends (beige walls up to the roof) and its patio side (glazing).
  wall(T.concrete,P2(U0,V0),P2(U1,V0),ZF-.2,ZF+rz(V0),aged(beige,2),o(0,-1));wall(T.concrete,P2(U0,V1),P2(U1,V1),ZF-.2,ZF+rz(V1),aged(beige,2),o(0,1));
  {const n=Math.round((5.1+3.4)/2.4);tiled(T.atlas,R.glassJK,P2(U0,-3.4),P2(U0,5.1),ZF,ZF+GL,o(-1,0),{piece:2.4,H:2.7,n});for(const [a,b] of [[V0,VV],[VV,V1]])T.concrete.quad(L(U0,a,GL),L(U0,b,GL),L(U0,b,rz(b)),L(U0,a,rz(a)),aged(beige,2),o(-1,0));}
  // --- The butterfly roof: two planes over the block falling to the valley, white edge, soffit.
  {const a0=U0-.3,a1=U1+1.2,b0=V0-.4,b1=V1+.4,y=v=>rz(clamp(v,V0,V1));
   for(const [p,q] of [[b0,VV],[VV,b1]]){T.concrete.quad(L(a0,p,y(p)+RT),L(a1,p,y(p)+RT),L(a1,q,y(q)+RT),L(a0,q,y(q)+RT),aged(lin(0xcfccc4),5),[0,0,1]);T.concrete.quad(L(a0,p,y(p)),L(a1,p,y(p)),L(a1,q,y(q)),L(a0,q,y(q)),mul(white,.88),[0,0,-1]);
    for(const [u,s] of [[a0,-1],[a1,1]])T.concrete.quad(L(u,p,y(p)),L(u,q,y(q)),L(u,q,y(q)+RT),L(u,p,y(p)+RT),aged(white),o(s,0));}
   for(const [v,s] of [[b0,-1],[b1,1]])T.concrete.quad(L(a0,v,y(v)),L(a1,v,y(v)),L(a1,v,y(v)+RT),L(a0,v,y(v)+RT),aged(white),o(0,s));}
  // --- The wings round the patio: beige walls, windows, flat white roofs; Werneck's mosaic on the patio wall.
  {const ZW=3.3;for(const [u0,u1,v0,v1] of [[-10.7,U0,5.1,V1],[-15.9,U0,V0,-3.4]]){
    for(const [a,b,s] of [[[u0,v0],[u1,v0],o(0,-1)],[[u1,v1],[u0,v1],o(0,1)],[[u0,v1],[u0,v0],o(-1,0)]]){const pa=P2(...a),pb=P2(...b);wall(T.concrete,pa,pb,ZF+Math.min(foot(...a),foot(...b)),ZF+ZW,aged(beige,2),s);
     const len=Math.hypot(pb[0]-pa[0],pb[1]-pa[1]);if(len>4){const n=Math.floor(len/4);for(let k=0;k<n;k++){const t=(k+.5)/n,c=[lerp(pa[0],pb[0],t),lerp(pa[1],pb[1],t)],d=[(pb[0]-pa[0])/len,(pb[1]-pa[1])/len];if(a[1]===-3.4&&a[0]===U0&&t>.4&&t<.72)continue;tiled(T.atlas,R.window,[c[0]-d[0]+s[0]*.03,c[1]-d[1]+s[1]*.03],[c[0]+d[0]+s[0]*.03,c[1]+d[1]+s[1]*.03],ZF+.9,ZF+2.6,s,{piece:2,n:1,H:2});}}}
    T.concrete.box(L,u0-.3,u1,v0-.3,v1+.3,ZW,ZW+.25,aged(white,3),{bottom:true});}
   tiled(T.atlas,R.werneck,P2(-9,-3.37),P2(-5,-3.37),ZF+.4,ZF+2.4,o(0,1),{piece:4,n:1,H:2});}
  const tri=tris();
  floods.push([...L(U1+6,-7,0).slice(0,2),null,[1,.9,.76],3],[...L(U1+6,6,0).slice(0,2),null,[1,.92,.8],3],[...L(-4,0,0).slice(0,2),null,[1,.93,.82],2]);
  proxy([P2(U0,V0),P2(U1+1.8,V0),P2(U1+1.8,V1),P2(U0,V1)],ZF-3,ZF+5.6,'casa_kubitschek');proxy([P2(-15.9,V0),P2(U0,V0),P2(U0,-3.4),P2(-15.9,-3.4)],ZF-3,ZF+3.6,'casa_kubitschek_sul');proxy([P2(-10.7,5.1),P2(U0,5.1),P2(U0,V1),P2(-10.7,V1)],ZF-3,ZF+3.6,'casa_kubitschek_norte');
  clearArea([P2(-17,-12),P2(U1+4,-12),P2(U1+4,12),P2(-17,12)],3,6);const sight=clearSight(L(U1,0,0),{before:100,after:80,stop:10});
  stats.buildings.casa_kubitschek={floor:+ZF.toFixed(2),roofEnds:[+(ZF+rz(V0)+RT).toFixed(2),+(ZF+rz(V1)+RT).toFixed(2)],valley:+(ZF+rz(VV)+RT).toFixed(2),lapClosest:sight};
  return tri;
 }

 let before=0;const per={};
 for(const [k,fn] of [['casa_do_baile',casaDoBaile],['museu_de_arte',museu],['iate',iate],['casa_kubitschek',kubitschek]])if(marks[k]){try{const t=fn(marks[k]);per[k]=t-before;before=t;}catch(e){console.warn('Pampulha de Niemeyer:',k,e);stats.buildings[k]={...stats.buildings[k],error:String(e)};before=tris();}}

 // ---------- Night: uplights at the feet of the walls (world position, colour, strength).
 floods.splice(MAX_FLOODS);for(const f of floods)if(f[2]==null)f[2]=gAt(f[0],f[1])+.3;
 floods.forEach(([x,y,z,c,s],i)=>{U.npFlood.value[i].set(x,z,-y,s);U.npFloodCol.value[i].set(...c);});
 const night=lightUniforms(),fixtures=floods.map(([x,y,z,c])=>({p:[x,y,z+.15],c,i:.9,s:.18,g:0,on:.3,ph:0}));
 const glow=nightLights(fixtures,night,{name:'Niemeyer_refletores',minPx:1.6,floor:.5,fogKeep:.5});root.add(glow.mesh);
 for(const [x,y,z] of floods)T.paint.box(frame(x,y,z-.2,rand()*6),-.14,.14,-.12,.12,0,.36,lin(0x4a4e52));

 // ---------- Driving space: no vertex over the lap's asphalt and walls, up to DRIVE metres above the road.
 const drive={checked:0,violations:0,worst:null};
 for(const [k,b] of Object.entries(T))for(let v=0;v<b.p.length;v+=3){
  const x=b.p[v],y=-b.p[v+2],z=b.p[v+1];drive.checked++;
  for(const hh of lap.at(x,y)){const over=z-hh.road;if(Math.abs(hh.lat)<hh.back+.3&&over>-.05&&over<DRIVE){drive.violations++;if(!drive.worst||Math.abs(hh.lat)<Math.abs(drive.worst.lat))drive.worst={material:k,s:+hh.s.toFixed(1),lat:+hh.lat.toFixed(2),over:+over.toFixed(2)};}}
 }
 let drawCalls=1,triangles=0;const parts={};
 for(const [k,b] of Object.entries(T)){if(!b.vertices)continue;root.add(b.mesh('Niemeyer_'+k,materials[k],k!=='site'));drawCalls++;triangles+=b.triangles;parts[k]=b.triangles;}
 root.updateMatrixWorld(true);

 // 0 by day; dusk (.45) brings the uplights up; full at night.
 let lit=0;
 function setNight(level){lit=level;U.npNight.value=level>0?(level>=.99?1:.55):0;night.uNight.value=level;glow.mesh.visible=level>0;stats.night=level;}
 for(const [k,t] of Object.entries(per))stats.buildings[k]={...stats.buildings[k],triangles:t};
 Object.assign(stats,{drawCalls,triangles,trianglesK:Math.round(triangles/1000),parts,driveSpace:drive,clearings:clearings.length,cameraObstacles:obstacles.length,floods:floods.length,night:0});
 return {root,obstacles,clearings,stats,setNight,update(dt){if(lit>0){night.uTime.value+=dt;night.uScreen.value=screenHalf(mobile);}}};
}
