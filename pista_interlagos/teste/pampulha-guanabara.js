import * as THREE from 'three';
import {canvasTexture} from './pit-textures.js';
import {guardrailClearance,guardrailPresent} from './physics.js';
import {lightUniforms,nightLights,screenHalf} from './sea-water.js';

// The Parque Guanabara, Belo Horizonte's amusement park on the Pampulha shore by the Igrejinha (a travelling park
// founded in 1951, on Av. Otacílio Negrão de Lima since 1970), running (pedido #8: "o Parque Guanabara em
// funcionamento, com a roda gigante girando e o brinquedo Elevador (Skyfall) subindo lentamente e despencando em alta
// velocidade. O brinquedo cataclisma também deve estar em funcionamento, girando. As luzes do parque devem estar
// acesas e piscando."). data.scenery.landmarks kind 'parque_guanabara': the OSM outline (0.9 ha), 16 to 80 m left of
// the lap at s 1100-1250. The layout is the city's 20 cm 2015 orthophoto's (BHGeo ORTOFOTO_2015: the tall rides read
// from their lean in it, all leaning the same way, base, top and the drop tower's ring half way up), the rides the
// team's photos and the published facts (research 2026-10-18):
// - the roda-gigante (2010, 36 m): two white truss rims 16 m in radius, 24 spokes a side, 24 coloured cabins hanging
//   between the rims on their pins, the axle on two A-frames, the boarding deck under it. Its plane runs NNW-SSE: the
//   lap sees it face on. One turn in 100 s, the cabins swaying a little.
// - the Elevador (Skyfall): a 56 m square lattice tower in the park's west corner, green lamps up its chords and a
//   crown at the top; the ring of 16 outward-facing seats with its sun of red and orange spikes. Its cycle (about
//   43 s): boarding, the slow climb (24 s) to 45 m, a hold, the free fall (2.5 s, 31 m, 90 km/h), the magnetic brakes
//   (1 s, 2.4 g), the creep down to the platform.
// - the Cataclisma (a Ranger): a white column on a blue zigzag foot, the long white arm on its axle 15 m up, out in
//   front of the column, the T of eight seats at its tip and the counterweight, rows of round lamps along the arm.
//   Its cycle (60 s): boarding; the motor pumps it into ever wider swings until it goes over the top; full turns one
//   way, then the other; the brake lets it swing down to rest.
// - the carrousel (a Herschell-Spillman of the early 1900s, restored by the founder): 30 horses on brass poles rising
//   and falling, the striped canopy, the scalloped rounding boards full of bulbs; the little train round the star
//   garden under its yellow arc; the Lagarta (the green caterpillar); the Autopista (bumper cars wandering under the
//   dark roof); the yellow-and-white striped hall, the restaurant, the white pyramid tents, the row of stalls, the
//   bumper boats' pool, the gate on the avenue with the park's name in our own lettering (VOLTE SEMPRE! on its back),
//   a sign facing the lap, light poles with festoons between them and the railing round it all. No real brands.
// Lights: every bulb is lit day and night and blinks to its own pattern (chases round the wheel's rims and out along
// its spokes, up the tower's chords, along the Cataclisma's arm; marquees, festoons twinkling), brighter after dark
// (setNight), when glowing sprites carry the far ones (sea-water.js nightLights, the same blink).
// Drawing: the rides move by bones. Everything that moves and everything that stands is in ONE skinned mesh per
// material (a bone per moving part: the wheel and each cabin, the tower's ring, the arm, the carrousel and its horses'
// three ranks, the train, the caterpillar, each bumper car), so the park is four draw calls by day, five at night.
// Nothing enters the lap's driving space in any pose (checked per vertex over each ride's whole motion), and the land
// cover's trees go from the park and from the sight lines from the lap to the wheel and the tower.

const DRIVE=4.6,TAU=Math.PI*2,DEG=Math.PI/180;
function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
// Linear colours (vertex colours are linear): an sRGB hex scaled by k.
const lin=(hex,k=1)=>{const c=new THREE.Color(hex);return [c.r*k,c.g*k,c.b*k];};
const mul=(c,k)=>[c[0]*k,c[1]*k,c[2]*k];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),lerp=(a,b,u)=>a+(b-a)*u,smooth=u=>{u=clamp(u,0,1);return u*u*(3-2*u);};
const mix3=(a,b,u)=>[lerp(a[0],b[0],u),lerp(a[1],b[1],u),lerp(a[2],b[2],u)];
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

// ---------- The layout, measured on the 2015 orthophoto's 20 cm sheets (local metres: x east, y north from the track
// origin), kept relative to the outline's centroid then (REF) so a regenerated outline carries the park with it.
// The wheel's hub and the tower's foot are where their leaning images start (the lean runs NNW, about 0.55 m per metre
// up); the wheel's plane along that lean. Where the 2015 park had rides since gone (the swing ride, the octopus),
// today's Cataclisma stands; the rest keeps the photo's places.
const REF=[71.89,-930.75];
const PARK={
 wheel:{at:[54.5,-926.5],axle:17.5*DEG,R:16,gondolas:24,turn:100},
 tower:{at:[15,-916.5],heading:17.5*DEG,height:56,travel:45},
 cataclisma:{at:[95,-946],plane:-33*DEG,pivot:15,arm:13,counter:6,offset:3},
 carousel:{at:[50.3,-902.5],r:6,turn:16},
 garden:{at:[30.8,-930.5],r:15.2,turn:46},
 caterpillar:{at:[75,-922.7],r:4.6,turn:9},
 pool:{at:[72,-949],a:7.2,b:5.6},
 teacups:{at:[67,-938.5],r:4.2,turn:11},
 // The south strip of 2015's photo: the long white-roofed shed (here the Trem Fantasma, the founder's own ride), the
 // snack bar with its brown roof, the service shed along the fence.
 fantasma:{at:[51.3,-960],w:26,d:8.5,heading:-22.7*DEG},
 lanchonete:{at:[72,-965],w:12,d:10,heading:-22.7*DEG},
 galpao:{at:[94,-962],w:14,d:8,heading:41.3*DEG},
 autopista:{at:[70.8,-904.3],w:26,d:21,heading:0},
 hall:{at:[101,-908.7],w:26,d:17,heading:-13*DEG},
 striped:{at:[96.5,-929],w:22,d:14,heading:-33*DEG},
 tents:{at:[127.5,-922.5],w:26,d:16,heading:-31*DEG},
 stalls:{at:[117.6,-936.6],w:17,d:3.6,heading:-31*DEG},
 gate:{at:[31,-892.7],heading:0},
 totem:{at:[139,-929.5]},
 poles:[[22,-906],[40,-946],[64,-918],[80,-934],[112,-944],[130,-934]],
 festoons:[[2,3],[4,5]]
};

// ---------- Geometry gathered per material in track coordinates, drawn as one mesh (flat-shaded triangles). Each
// vertex carries its bone (`bone` when it was added) and, for the bulbs, its blink: [period s, lit share, phase].
class Batch{
 constructor(){this.p=[];this.n=[];this.c=[];this.t=[];this.b=[];this.k=[];this.bone=0;this.blink=null;}
 get vertices(){return this.p.length/3;}
 get triangles(){return this.p.length/9;}
 tri(a,b,c,col,uv){
  const n=cross(sub(b,a),sub(c,a)),l=Math.hypot(n[0],n[1],n[2]);if(l<1e-9)return;const nx=n[0]/l,ny=n[1]/l,nz=n[2]/l,q=[a,b,c],k=this.blink??[0,1,0];
  for(let i=0;i<3;i++){
   const p=q[i],cc=typeof col==='function'?col(p):col;this.p.push(p[0],p[2],-p[1]);this.n.push(nx,nz,-ny);this.c.push(cc[0],cc[1],cc[2]);this.b.push(this.bone);this.k.push(k[0],k[1],k[2]);
   this.t.push(...(uv?uv[i]:[0,0]));
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
 // A convex polygon as a fan facing out.
 fan(pts,col,out){
  let nx=0,ny=0,nz=0;for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];nx+=(p[1]-q[1])*(p[2]+q[2]);ny+=(p[2]-q[2])*(p[0]+q[0]);nz+=(p[0]-q[0])*(p[1]+q[1]);}
  if(out&&nx*out[0]+ny*out[1]+nz*out[2]<0)pts=[...pts].reverse();
  for(let i=1;i+1<pts.length;i++)this.tri(pts[0],pts[i],pts[i+1],col);
 }
 // A box a0..a1 × b0..b1 × z0..z1 in frame f, every face turned away from its centre.
 box(f,a0,a1,b0,b1,z0,z1,col,{bottom=false,top=true,sides=true,ends=true}={}){
  const P=(i,j,k)=>f(i?a1:a0,j?b1:b0,k?z1:z0),c=f((a0+a1)/2,(b0+b1)/2,(z0+z1)/2),face=(A,B,C,D)=>this.quad(A,B,C,D,col,sub([(A[0]+C[0])/2,(A[1]+C[1])/2,(A[2]+C[2])/2],c));
  if(ends){face(P(0,0,0),P(0,1,0),P(0,1,1),P(0,0,1));face(P(1,0,0),P(1,1,0),P(1,1,1),P(1,0,1));}
  if(sides){face(P(0,0,0),P(1,0,0),P(1,0,1),P(0,0,1));face(P(0,1,0),P(1,1,0),P(1,1,1),P(0,1,1));}
  if(bottom)face(P(0,0,0),P(1,0,0),P(1,1,0),P(0,1,0));if(top)face(P(0,0,1),P(1,0,1),P(1,1,1),P(0,1,1));
 }
 // An n-sided post from p (radius r0) to q (radius r1), any direction.
 post(p,q,r0,r1,n,col,{rot=0,top=true}={}){
  const d=unit(sub(q,p)),e1=unit(Math.abs(d[2])>.99?cross([0,1,0],d):cross(d,[0,0,1])),e2=cross(d,e1);
  const ring=(c,r)=>Array.from({length:n},(_,i)=>{const a=rot+i*TAU/n,x=Math.cos(a)*r,y=Math.sin(a)*r;return [c[0]+e1[0]*x+e2[0]*y,c[1]+e1[1]*x+e2[1]*y,c[2]+e1[2]*x+e2[2]*y];});
  const A=ring(p,r0),B=ring(q,r1);
  for(let i=0;i<n;i++){const j=(i+1)%n,m=sub([(A[i][0]+A[j][0])/2,(A[i][1]+A[j][1])/2,(A[i][2]+A[j][2])/2],p);this.quad(A[i],A[j],B[j],B[i],col,sub(m,mul(d,dot(m,d))));}
  if(top&&r1>0)this.fan(B,col,d);
 }
 // A prism between two rings of points (same count), its top facing up.
 prism(lo,hi,col,{top=true}={}){
  const c=lo.reduce((s,p)=>[s[0]+p[0]/lo.length,s[1]+p[1]/lo.length,0],[0,0,0]);
  for(let i=0;i<lo.length;i++){const j=(i+1)%lo.length;this.quad(lo[i],lo[j],hi[j],hi[i],col,[(lo[i][0]+lo[j][0])/2-c[0],(lo[i][1]+lo[j][1])/2-c[1],0]);}
  if(top)this.fan(hi,col,[0,0,1]);
 }
 // A bulb: an octahedron of radius r at p, lit to its blink (it is unlit: its colour is all it shows).
 bulb(p,r,col,blink,rz=r){
  this.blink=blink;
  for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1]){let a=[p[0]+sx*r,p[1],p[2]],b=[p[0],p[1]+sy*r,p[2]],c=[p[0],p[1],p[2]+sz*rz];if(sx*sy*sz<0)[b,c]=[c,b];this.tri(a,b,c,col);}
  this.blink=null;
 }
 geometry({skin=false,blink=false}={}){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(this.t,2));
  if(skin){const n=this.b.length,si=new Uint16Array(n*4),sw=new Float32Array(n*4);for(let i=0;i<n;i++){si[i*4]=this.b[i];sw[i*4]=1;}g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));}
  if(blink)g.setAttribute('aBlink',new THREE.Float32BufferAttribute(this.k,3));
  g.computeBoundingSphere();return g;
 }
}
// A hipped roof over u -hu..hu, v -hv..hv in frame f (eaves at z0, the ridge `rise` higher along the longer side; a
// pyramid when square), each slope in stripes `stripe` metres wide at the eaves (col(i) per stripe), its soffit.
function hipRoof(S,f,hu,hv,z0,rise,col,{stripe=0,soffit=null}={}){
 const r=Math.abs(hu-hv),zr=z0+rise,E=[f(-hu,-hv,z0),f(hu,-hv,z0),f(hu,hv,z0),f(-hu,hv,z0)];
 const R=hu>=hv?[f(-r,0,zr),f(r,0,zr)]:[f(0,-r,zr),f(0,r,zr)],c=f(0,0,z0);
 const faces=hu>=hv?[[E[0],E[1],R[0],R[1]],[E[1],E[2],R[1],R[1]],[E[2],E[3],R[1],R[0]],[E[3],E[0],R[0],R[0]]]:[[E[0],E[1],R[0],R[0]],[E[1],E[2],R[0],R[1]],[E[2],E[3],R[1],R[1]],[E[3],E[0],R[1],R[0]]];
 for(const [a,b,ra,rb] of faces){
  const n=stripe?Math.max(1,Math.round(Math.hypot(b[0]-a[0],b[1]-a[1])/stripe)):1;
  for(let i=0;i<n;i++){const e0=mix3(a,b,i/n),e1=mix3(a,b,(i+1)/n),r0=mix3(ra,rb,i/n),r1=mix3(ra,rb,(i+1)/n),m=mix3(e0,e1,.5);
   S.quad(e0,e1,r1,r0,typeof col==='function'?col(i):col,[m[0]-c[0],m[1]-c[1],Math.max(hu,hv)]);}
 }
 if(soffit)S.quad(E[0],E[1],E[2],E[3],soffit,[0,0,-1]);
}
const ringPts=(cx,cy,r,z,n,a0=0)=>Array.from({length:n},(_,k)=>{const a=a0+k*TAU/n;return [cx+Math.cos(a)*r,cy+Math.sin(a)*r,z];});

// ---------- Materials
// The bulbs: unlit, each lit or dark to its blink (step(fract(t/period + phase), share), sea-water.js's beacon rule, so
// the far sprites keep time with them), uGain brighter after dark (the HDR picture blooms them). Alpha -1: no ambient
// occlusion on a lamp (cinematic.js).
function bulbMaterial(u){
 const m=new THREE.MeshBasicMaterial({name:'Guanabara_lampadas',vertexColors:true});
 m.onBeforeCompile=sh=>{
  Object.assign(sh.uniforms,u);
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 aBlink;uniform float uGbTime,uGbOff;varying float vGbGlow;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvGbGlow=aBlink.x>0.?mix(uGbOff,1.,step(fract(uGbTime/aBlink.x+aBlink.z),aBlink.y)):1.;');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform float uGbGain;varying float vGbGlow;')
   .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=vGbGlow*uGbGain;')
   .replace('#include <opaque_fragment>','#include <opaque_fragment>\ngl_FragColor.a=-1.;');
 };
 m.customProgramCacheKey=()=>'pampulha-guanabara-lampadas-v1';
 return m;
}
// Boards and the railing (alpha-tested atlas, both faces): the boards lit a little by day (backlit acrylic), more at
// night; the railing's band (the atlas's bottom strip) never glows.
function signsMaterial(map){
 const m=new THREE.MeshStandardMaterial({name:'Guanabara_placas',map,emissiveMap:map,emissive:0xffffff,emissiveIntensity:.12,alphaTest:.5,side:THREE.DoubleSide,roughness:.5,metalness:.05});
 m.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n#ifdef USE_EMISSIVEMAP\nif(vEmissiveMapUv.y<.0625)totalEmissiveRadiance=vec3(0.);\n#endif');};
 m.customProgramCacheKey=()=>'pampulha-guanabara-placas-v1';
 return m;
}

// ---------- The atlas (1024 × 1024, SIGNS: [x0, y0, x1, y1] px): the park's name over the gate (our own lettering, not
// the park's logo) and VOLTE SEMPRE! on its back, the sign facing the lap, the rides' and stalls' boards, and the
// railing's bars in a full-width band at the bottom (repeating along the fence: RAIL metres a repeat).
const SIGNS={nome:[0,0,1024,200],volte:[0,200,1024,320],totem:[0,320,1024,560],cataclisma:[0,560,512,700],elevador:[512,560,1024,700],autopista:[0,700,512,780],roda:[512,700,1024,780],
 pipoca:[0,780,256,850],algodao:[256,780,512,850],tiro:[512,780,768,850],pescaria:[768,780,1024,850],bilheteria:[0,850,340,920],lagarta:[340,850,680,920],fantasma:[680,850,1024,920],grade:[0,960,1024,1024]};
const RAIL=7.7;
function signsTexture(){
 const t=canvasTexture((ctx,w,h)=>{
  ctx.clearRect(0,0,w,h);const B='"Arial Black","Arial Bold",Arial,sans-serif';
  const text=(s,x,y,size,fill,{stroke=null,width=0,max=w}={})=>{ctx.font=`${size}px ${B}`;ctx.textAlign='center';ctx.textBaseline='middle';if(stroke){ctx.lineJoin='round';ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.strokeText(s,x,y,max);}ctx.fillStyle=fill;ctx.fillText(s,x,y,max);};
  const panel=(k,bg,edge,inner)=>{const [x0,y0,x1,y1]=SIGNS[k];ctx.fillStyle=bg;ctx.fillRect(x0,y0,x1-x0,y1-y0);if(edge){ctx.strokeStyle=edge;ctx.lineWidth=12;ctx.strokeRect(x0+6,y0+6,x1-x0-12,y1-y0-12);}if(inner){ctx.strokeStyle=inner;ctx.lineWidth=3;ctx.strokeRect(x0+18,y0+18,x1-x0-36,y1-y0-36);}return [(x0+x1)/2,(y0+y1)/2,x1-x0];};
  const star=(x,y,r,fill)=>{ctx.fillStyle=fill;ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.42:r;ctx.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}ctx.closePath();ctx.fill();};
  let [cx,cy,pw]=panel('nome','#173a93','#d8262c','#ffffff');text('PARQUE GUANABARA',cx,cy+6,116,'#ffd21f',{stroke:'#0c1d4d',width:14,max:pw-200});star(66,cy,36,'#ffd21f');star(w-66,cy,36,'#ffd21f');
  [cx,cy,pw]=panel('volte','#d8262c','#ffd21f');text('VOLTE SEMPRE!',cx,cy+4,80,'#ffffff',{stroke:'#7a1013',width:8,max:pw-90});
  [cx,cy,pw]=panel('totem','#173a93','#ffd21f','#ffffff');text('PARQUE',cx,cy-76,56,'#ffffff',{max:pw-90});text('GUANABARA',cx,cy+6,112,'#ffd21f',{stroke:'#0c1d4d',width:12,max:pw-80});text('DIVERSÕES',cx,cy+88,50,'#ffffff',{max:pw-90});
  {const [x0,y0,x1,y1]=SIGNS.cataclisma,ox=(x0+x1)/2,oy=(y0+y1)/2;ctx.fillStyle='#1f4fb5';ctx.beginPath();ctx.ellipse(ox,oy,(x1-x0)/2-4,(y1-y0)/2-4,0,0,TAU);ctx.fill();
   ctx.fillStyle='#ffffff';ctx.beginPath();ctx.ellipse(ox,oy,(x1-x0)/2-22,(y1-y0)/2-20,0,0,TAU);ctx.fill();text('CATACLISMA',ox,oy+3,58,'#1f4fb5',{max:x1-x0-110});}
  [cx,cy,pw]=panel('elevador','#111418','#46ff4f');text('ELEVADOR',cx,cy+4,78,'#7dff6a',{stroke:'#0f3d12',width:6,max:pw-70});
  [cx,cy,pw]=panel('autopista','#c62026','#ffd21f');text('AUTOPISTA',cx,cy+3,50,'#ffd21f',{max:pw-50});
  [cx,cy,pw]=panel('roda','#ffffff','#d8262c');text('RODA-GIGANTE',cx,cy+3,44,'#d8262c',{max:pw-50});
  [cx,cy,pw]=panel('pipoca','#ffffff','#d8262c');text('PIPOCA',cx,cy+2,40,'#d8262c',{max:pw-30});
  [cx,cy,pw]=panel('algodao','#ff8cc6','#ffffff');text('ALGODÃO DOCE',cx,cy+2,34,'#ffffff',{stroke:'#b0336e',width:4,max:pw-30});
  [cx,cy,pw]=panel('tiro','#1c7a3a','#ffd21f');text('TIRO AO ALVO',cx,cy+2,34,'#ffd21f',{max:pw-30});
  [cx,cy,pw]=panel('pescaria','#1e63c4','#ffffff');text('PESCARIA',cx,cy+2,38,'#ffffff',{max:pw-30});
  [cx,cy,pw]=panel('bilheteria','#ffd21f','#141414');text('BILHETERIA',cx,cy+3,48,'#141414',{max:pw-50});
  [cx,cy,pw]=panel('lagarta','#2fae4a','#ffd21f');text('LAGARTA',cx,cy+3,46,'#ffffff',{stroke:'#145c22',width:5,max:pw-40});
  [cx,cy,pw]=panel('fantasma','#120c1c','#7d3cc8');text('TREM FANTASMA',cx,cy+3,40,'#7dff6a',{stroke:'#0b2a0c',width:4,max:pw-30});
  // The railing: top, middle and bottom rails and a bar every 16 px (0.12 m), painted blue.
  {const [x0,y0,x1,y1]=SIGNS.grade;ctx.fillStyle='#2b62a8';ctx.fillRect(x0,y0+1,x1-x0,7);ctx.fillRect(x0,y1-8,x1-x0,7);ctx.fillRect(x0,(y0+y1)/2-2,x1-x0,4);for(let x=0;x<w;x+=16)ctx.fillRect(x+5,y0+1,5,y1-y0-2);}
 },1024,1024,false);
 t.wrapS=THREE.RepeatWrapping;return t;
}
const signUv=key=>{const [x0,y0,x1,y1]=SIGNS[key],u0=(x0+2)/1024,u1=(x1-2)/1024,v0=1-(y1-2)/1024,v1=1-(y0+2)/1024;return [[u0,v0],[u1,v0],[u1,v1],[u0,v1]];};

// ---------- The lap's driving space (asphalt and walls, DRIVE metres over the road): pampulha-estadios.js's rule.
function lapSpace(data){
 const A=data.samples,N=A.length,CELL=8,cells=new Map(),key=(i,j)=>i*131071+j;
 const st=A.map(p=>{const nl=Math.hypot(p[9],p[10])||1,q={s:p[0],x:p[1],y:p[2],z:p[3],cf:p[5],n:[p[9]/nl,p[10]/nl],back:[0,0]};for(const [k,side] of [[0,-1],[1,1]])q.back[k]=p[4]/2+guardrailClearance(data,p[0],side)+(guardrailPresent(data,p[0],side)?.75:0);return q;});
 for(let i=0;i<N;i++){const p=st[i],q=st[(i+1)%N],r=Math.max(...p.back,...q.back)+2;
  for(let ci=Math.floor((Math.min(p.x,q.x)-r)/CELL);ci<=Math.floor((Math.max(p.x,q.x)+r)/CELL);ci++)for(let cj=Math.floor((Math.min(p.y,q.y)-r)/CELL);cj<=Math.floor((Math.max(p.y,q.y)+r)/CELL);cj++){const k=key(ci,cj);let l=cells.get(k);if(!l)cells.set(k,l=[]);l.push(i);}}
 function at(x,y){
  const list=cells.get(key(Math.floor(x/CELL),Math.floor(y/CELL))),out=[];if(!list)return out;
  for(const i of list){const p=st[i],q=st[(i+1)%N],dx=q.x-p.x,dy=q.y-p.y,l2=dx*dx+dy*dy||1e-9;let u=((x-p.x)*dx+(y-p.y)*dy)/l2;if(u<-.3||u>1.3)continue;u=clamp(u,0,1);
   const nx=lerp(p.n[0],q.n[0],u),ny=lerp(p.n[1],q.n[1],u),lat=(x-p.x-dx*u)*nx+(y-p.y-dy*u)*ny,k=lat>=0?1:0;
   out.push({s:p.s,lat,road:lerp(p.z,q.z,u)+lerp(p.cf,q.cf,u)*lat,back:lerp(p.back[k],q.back[k],u)});}
  return out;
 }
 // Whether any cell the lap's space reaches lies within r of (x, y): a moving part that reaches no such cell in a pose
 // cannot touch it there.
 const any=(x,y,r)=>{for(let ci=Math.floor((x-r)/CELL);ci<=Math.floor((x+r)/CELL);ci++)for(let cj=Math.floor((y-r)/CELL);cj<=Math.floor((y+r)/CELL);cj++)if(cells.has(key(ci,cj)))return true;return false;};
 return {at,any};
}

// ================================================================ The rides. Each builder adds its geometry to the
// batches (K.T), its bones (K.addBone: a pivot in track coordinates, at rest in the pose drawn) and its far lights
// (K.sprites: {p, c, bone?, blink, ph...}), and returns its animator: update(t, dt) from the park's clock, sample(u)
// a pose over its whole motion (u 0..1, the driving-space check), info() its state.
// Bone poses are set in three's frame (x, z, -y of the track's): a track axis (ax, ay, az) is (ax, az, -ay) there.
const v3=a=>new THREE.Vector3(a[0],a[2],-a[1]),UP=new THREE.Vector3(0,1,0);
function setPos(bone,p){bone.position.set(p[0],p[2],-p[1]);}

// ---------- Roda-gigante
function ferrisWheel(K){
 const {T,gAt,mobile,addBone,bones,sprites,at,board}=K,W=PARK.wheel,[hx,hy]=at(W.at),R=W.R,NG=W.gondolas,GS=2,S=T.paint,L=T.bulbs;
 const A=[Math.cos(W.axle),Math.sin(W.axle)],E=[-A[1],A[0]],flat=(e,a)=>[hx+E[0]*e+A[0]*a,hy+E[1]*e+A[1]*a];
 let g0=-Infinity;for(const e of [-3.3,0,3.3])for(const a of [-3.3,0,3.3])g0=Math.max(g0,gAt(...flat(e,a)));
 const deck=g0+1,hang=2.85,H=deck+R+hang+.08,ri=R-1.4;
 // A point in the wheel at angle phi (0 along E, up at 90°), radius r, s along the axle.
 const P=(phi,r,s)=>[hx+E[0]*r*Math.cos(phi)+A[0]*s,hy+E[1]*r*Math.cos(phi)+A[1]*s,H+r*Math.sin(phi)];
 const white=lin(0xf3f3ef),steel=lin(0xc9ccd0),blue=lin(0x2a5cb8),grey=lin(0x8d8a84),dark=lin(0x2b3036),cream=lin(0xf0e6cc);
 // Standing: a pair of legs each side splayed along the plane, their ties and crossed braces, the bearings, the axle.
 S.bone=0;
 for(const s of [-1,1]){
  const top=[...flat(0,s*(GS+1.1)),H],legs=[];
  for(const e of [-1,1]){const f=flat(e*8.2,s*(GS+3.4)),gf=gAt(...f);S.post([f[0],f[1],gf-.6],top,.48,.3,8,white);legs.push([f[0],f[1],gf]);S.box(frame(f[0],f[1],0,W.axle),-.9,.9,-.9,.9,gf-.6,gf+.25,grey);}
  const on=(l,z)=>mix3(l,top,(z-l[2])/(top[2]-l[2]));
  for(const z of [g0+6.5,g0+13])S.post(on(legs[0],z),on(legs[1],z),.17,.17,6,white,{top:false});
  S.post(on(legs[0],g0+6.5),on(legs[1],g0+13),.12,.12,6,white,{top:false});S.post(on(legs[1],g0+6.5),on(legs[0],g0+13),.12,.12,6,white,{top:false});
  S.post([...flat(0,s*(GS+.6)),H],[...flat(0,s*(GS+1.7)),H],.75,.75,10,steel);
 }
 S.post([...flat(0,-GS-1.8),H],[...flat(0,GS+1.8),H],.32,.32,10,steel);
 // The boarding deck under the wheel (the lowest cabin's floor just over it), its steps, railings on the sides the
 // cabins never cross, the operator's booth with the ride's board.
 const fd=frame(hx,hy,0,W.axle+Math.PI/2);// u along E, v along -A
 S.box(fd,-3.3,3.3,-3.3,3.3,g0-.5,deck,lin(0x7d8794));
 for(let i=0;i<4;i++)S.box(fd,-1,1,3.3+i*.5,3.8+i*.5,g0-.4,deck-(i+1)*(deck-g0)/5,lin(0x8f9399));
 for(const v of [-3.25,3.25]){for(let u=-3.2;u<=3.21;u+=1.6)if(v<0||Math.abs(u)>1.1)S.post(fd(u,v,deck),fd(u,v,deck+1.05),.03,.03,4,blue,{top:false});S.post(fd(-3.2,v,deck+1.05),fd(v<0?3.2:-1.1,v,deck+1.05),.035,.035,4,blue,{top:false});if(v>0)S.post(fd(1.1,v,deck+1.05),fd(3.2,v,deck+1.05),.035,.035,4,blue,{top:false});}
 S.box(fd,-1.3,1.3,-3.6,-5.8,g0-.3,g0+2.7,cream);S.box(fd,-1.32,1.32,-3.58,-5.82,g0+1.2,g0+2.2,dark,{top:false});S.box(fd,-1.6,1.6,-3.4,-6.1,g0+2.7,g0+2.95,blue,{bottom:true});
 board(fd(0,-5.86,g0+3.45),[A[0],A[1],0],2.6,.6,'roda');
 // The wheel (one bone): two rims of outer and inner rings braced in a zigzag, ties between the rims at the pins, two
 // spokes from each hub flange to every inner node (crossing a little, as on the real one), the hub and its flanges.
 const rotor=addBone('roda',0,[hx,hy,H]);S.bone=rotor;L.bone=rotor;
 const n=mobile?32:48;
 for(const s of [-GS,GS]){
  for(let k=0;k<n;k++){const a0=k/n*TAU,a1=(k+1)/n*TAU,am=(k+.5)/n*TAU;
   S.post(P(a0,R,s),P(a1,R,s),.17,.17,4,white,{top:false});S.post(P(a0,ri,s),P(a1,ri,s),.12,.12,4,white,{top:false});
   S.post(P(a0,R,s),P(am,ri,s),.06,.06,3,steel,{top:false});S.post(P(am,ri,s),P(a1,R,s),.06,.06,3,steel,{top:false});
  }
  for(let k=0;k<NG;k++){const a=k/NG*TAU;S.post(P(a+.12,1.35,Math.sign(s)*2.45),P(a,ri,s),.05,.05,3,steel,{top:false});if(!mobile)S.post(P(a-.12,1.35,Math.sign(s)*2.45),P(a,ri,s),.05,.05,3,steel,{top:false});}
 }
 for(let k=0;k<NG;k++){const a=k/NG*TAU;S.post(P(a,R,-GS),P(a,R,GS),.11,.11,6,steel,{top:false});if(!mobile)S.post(P(a+TAU/NG/2,ri,-GS),P(a+TAU/NG/2,ri,GS),.07,.07,4,steel,{top:false});}
 S.post(P(0,0,-2.4),P(0,0,2.4),1.05,1.05,12,white);
 for(const s of [-1,1])S.post(P(0,0,s*2.3),P(0,0,s*2.55),1.55,1.55,12,blue);
 // Its lamps: rims chasing round in colours (four waves), spokes pulsing outward, a ring on each hub flange.
 const rimCols=[0xff3b3b,0xffd23a,0x45ff6a,0x3ac8ff,0xff4fd8,0xfff4dc].map(h=>lin(h)),warm=lin(0xfff0c8),nb=mobile?40:80,ns=mobile?3:6;
 for(const s of [-1,1])for(let k=0;k<nb;k++){const a=(k+.5)/nb*TAU,p=P(a,R+.26,s*(GS+.05)),c=rimCols[k%6],ph=k/nb*4;L.bulb(p,.21,c,[2.4,.5,ph]);if(k%4===0)sprites.push({bone:rotor,p,c,i:.9,s:.2,blink:[2.4,.5],ph});}
 for(const s of [-1,1])for(let k=0;k<NG;k++){const a=k/NG*TAU;for(let j=0;j<ns;j++){const r=lerp(2.8,ri-.5,j/(ns-1)),p=P(a,r,s*(lerp(2.45,GS,(r-1.35)/(ri-1.35))+.12));L.bulb(p,.14,warm,[1.5,.35,-j/ns*.9]);}}
 for(const s of [-1,1])for(let k=0;k<12;k++){const a=k/12*TAU,p=P(a,1.3,s*2.6);L.bulb(p,.15,k%2?lin(0xff4fd8):lin(0xffd23a),[1,.5,k%2*.5]);}
 sprites.push({bone:rotor,p:P(0,0,2.7),c:lin(0xff9ad8),i:1.2,s:.5});sprites.push({bone:rotor,p:P(0,0,-2.7),c:lin(0xff9ad8),i:1.2,s:.5});
 // The cabins, each its own bone at its pin (kept upright, swaying a little): hangers, a roof cap, the coloured lower
 // body, the glazing, white corner posts. Colours as seen from the air in 2015, round the wheel.
 const cols=[0x2d6fd6,0xe8508f,0xf2c518,0xf4f4f0,0xd92d2d,0x2fae5a,0xf07a1a,0x8a4fd0].map(h=>lin(h)),gl=lin(0x34404c),cabins=[];
 for(let k=0;k<NG;k++){
  const a=k/NG*TAU,pin=P(a,R,0),b=addBone('cabine'+k,0,pin),c=cols[k%cols.length];S.bone=b;
  const f=(u,v,z)=>[pin[0]+A[0]*u+E[0]*v,pin[1]+A[1]*u+E[1]*v,pin[2]+z];
  for(const u of [-.55,.55])S.post(f(u,0,.05),f(u,0,-.62),.045,.045,4,steel,{top:false});
  hipRoof(S,f,.98,.82,-.84,.36,c);S.box(f,-.98,.98,-.82,.82,-.9,-.84,c,{bottom:true,top:false});
  S.box(f,-.9,.9,-.75,.75,-2.85,-1.8,c,{bottom:true});S.box(f,-.86,.86,-.71,.71,-1.8,-.9,gl,{top:false});
  if(!mobile)for(const u of [-.86,.86])for(const v of [-.71,.71])S.box(f,u-.05,u+.05,v-.05,v+.05,-1.8,-.9,white,{top:false});
  cabins.push({b,a});
 }
 S.bone=L.bone=0;
 const axis=v3([A[0],A[1],0]),omega=TAU/W.turn;let theta=0;
 function pose(th,t){theta=th;bones[rotor].quaternion.setFromAxisAngle(axis,th);for(const g of cabins){const bn=bones[g.b];setPos(bn,P(g.a+th,R,0));bn.quaternion.setFromAxisAngle(axis,.035*Math.sin(t*1.1+g.a*5));}}
 const clear=[];for(let e=-17;e<=17;e+=5)for(const a of [-5,0,5])clear.push({x:flat(e,a)[0],y:flat(e,a)[1],r:5});
 return {name:'roda',hub:[hx,hy,H],top:H+R,clear,update(t){pose((omega*t)%TAU,t);},sample(u){pose(u*TAU,u*7);},info:()=>({angle:+(theta/DEG).toFixed(1),turn:W.turn,hub:+H.toFixed(1)})};
}

// ---------- Elevador (Skyfall)
// The cycle: boarding, the slow climb, the hold at the top, the free fall, the magnetic brakes (to 1.5 m/s with a metre
// to go), the creep onto the platform. The fall time solves ½ g tf² + (g tf + v1)/2 · tb = travel - creep.
const SKY={load:9,rise:24,hold:4.5,brake:1,creep:1,settle:2.6,v1:1.5,g:9.81};
function skyCycle(travel){
 const {g,brake:tb,v1,creep}=SKY,qa=g/2,qb=g*tb/2,qc=v1*tb/2-(travel-creep),tf=(-qb+Math.sqrt(qb*qb-4*qa*qc))/(2*qa),v0=g*tf,dec=(v0-v1)/tb,z1=travel-g*tf*tf/2;
 const seg=[['embarque',SKY.load],['subida',SKY.rise],['topo',SKY.hold],['queda',tf],['freio',tb],['chegada',SKY.settle]],total=seg.reduce((s,x)=>s+x[1],0);
 function at(t){
  t=((t%total)+total)%total;let k=0;for(;k<seg.length-1&&t>=seg[k][1];k++)t-=seg[k][1];const [ph]=seg[k];
  switch(ph){
   case 'embarque':return {ph,z:0,v:0};
   case 'subida':{const u=t/SKY.rise;return {ph,z:travel*smooth(u),v:travel*6*u*(1-u)/SKY.rise};}
   case 'topo':return {ph,z:travel,v:0};
   case 'queda':return {ph,z:travel-g*t*t/2,v:-g*t};
   case 'freio':return {ph,z:z1-(v0*t-dec*t*t/2),v:-(v0-dec*t)};
   default:{const u=t/SKY.settle;return {ph,z:creep*(1-smooth(u)),v:-creep*6*u*(1-u)/SKY.settle};}
  }
 }
 return {at,total,fall:tf,top:v0};
}
function dropTower(K){
 const {T,gAt,mobile,addBone,bones,sprites,at,board}=K,D=PARK.tower,[tx,ty]=at(D.at),S=T.paint,L=T.bulbs;
 let g0=gAt(tx,ty);for(let k=0;k<8;k++)g0=Math.max(g0,gAt(tx+Math.cos(k*TAU/8)*4.2,ty+Math.sin(k*TAU/8)*4.2));
 const base=g0+.6,top=base+D.height,w=1.25,f=frame(tx,ty,0,D.heading);
 const white=lin(0xe6e8ea),grey=lin(0x9a9790),yellow=lin(0xf2c518),blue=lin(0x2a5cb8),dark=lin(0x2a2d31),green=lin(0x46ff4f);
 S.bone=0;
 // The plinth (an octagon with a yellow edge), the four chords, the lattice: horizontals and a diagonal a face per panel.
 S.prism(ringPts(tx,ty,4.4,g0-.6,8,D.heading+TAU/16),ringPts(tx,ty,4.4,base,8,D.heading+TAU/16),grey);
 {const o=ringPts(tx,ty,4.4,base+.015,8,D.heading+TAU/16),i=ringPts(tx,ty,3.9,base+.015,8,D.heading+TAU/16);for(let k=0;k<8;k++)S.quad(i[k],o[k],o[(k+1)%8],i[(k+1)%8],yellow,[0,0,1]);}
 const C=([i,j],z)=>f(i*w,j*w,z),corners=[[-1,-1],[1,-1],[1,1],[-1,1]];
 for(const c of corners)S.post(C(c,base),C(c,top),.2,.17,6,white,{top:false});
 const step=mobile?6:3;let parity=0;
 for(let z=base+step;z<top-.5;z+=step,parity++)for(let k=0;k<4;k++){const a=corners[k],b=corners[(k+1)%4];S.post(C(a,z),C(b,z),.07,.07,4,white,{top:false});if(!mobile||parity%2===0)S.post(C(parity%2?a:b,z-step),C(parity%2?b:a,z),.06,.06,4,white,{top:false});}
 // The crown: the motor house, the blue rim, a mast with the red beacon.
 S.box(f,-1.9,1.9,-1.9,1.9,top,top+1.9,white,{bottom:true});
 S.prism(ringPts(tx,ty,2.55,top+1.9,16),ringPts(tx,ty,2.55,top+2.35,16),blue);
 S.post([tx,ty,top+2.35],[tx,ty,top+5.4],.12,.05,6,white);
 // The booth at its foot with the ride's board, facing the garden.
 const fb=frame(tx,ty,0,D.heading+Math.PI/2);
 S.box(fb,-1.4,1.4,-4.6,-6.8,g0-.3,g0+2.6,lin(0xf0e6cc));S.box(fb,-1.42,1.42,-4.58,-6.82,g0+1.2,g0+2.1,dark,{top:false});S.box(fb,-1.7,1.7,-4.4,-7.1,g0+2.6,g0+2.85,blue,{bottom:true});
 board(fb(0,-5.7,g0+3.5),unit([fb(0,-1,0)[0]-tx,fb(0,-1,0)[1]-ty,0]),3,.82,'elevador');
 // Its lamps: green up every chord's outer corner, chasing upward; the crown's ring; the beacon.
 const lz=mobile?2:1;
 for(const c of corners){const o=[c[0]*.26,c[1]*.26];for(let z=base+1.5,k=0;z<top;z+=lz,k++){const p=C([c[0]+o[0]/w,c[1]+o[1]/w],z),bl=[2.2,.42,-(z-base)/14];L.bulb(p,.15,green,bl);if(k%Math.round(4/lz)===0)sprites.push({p,c:green,i:.8,s:.16,blink:[2.2,.42],ph:bl[2]});}}
 for(let k=0;k<16;k++){const p=ringPts(tx,ty,2.62,top+2.12,16,k*TAU/16)[0],c=k%2?lin(0x3ac8ff):lin(0x45ff6a);L.bulb(p,.17,c,[3,.75,k/16]);if(k%2===0)sprites.push({p,c,i:.9,s:.18,blink:[3,.75],ph:k/16});}
 L.bulb([tx,ty,top+5.5],.2,lin(0xff2a2a),[1.4,.5,0]);sprites.push({p:[tx,ty,top+5.5],c:lin(0xff2a2a),i:1.4,s:.2,blink:[1.4,.5],ph:0});
 // The ring (one bone): the carriage round the tower, the annular deck, sixteen seats facing out with their harness
 // bars, and the sun of spikes round it; its lamps on the spikes' tips (flashing in turn) and round its rim (chasing).
 const z0=base+.35,ring=addBone('elevador',0,[tx,ty,z0]);S.bone=ring;L.bone=ring;
 S.box(f,-1.6,1.6,-1.6,1.6,z0+.3,z0+2.4,dark,{bottom:true});
 const inn=ringPts(tx,ty,1.62,0,24),out=ringPts(tx,ty,3.55,0,24),at3=(p,z)=>[p[0],p[1],z];
 for(let k=0;k<24;k++){const j=(k+1)%24;S.quad(at3(inn[k],z0+1),at3(out[k],z0+1),at3(out[j],z0+1),at3(inn[j],z0+1),lin(0x3b3f45),[0,0,1]);S.quad(at3(inn[k],z0+.72),at3(out[k],z0+.72),at3(out[j],z0+.72),at3(inn[j],z0+.72),dark,[0,0,-1]);
  const m=[(out[k][0]+out[j][0])/2-tx,(out[k][1]+out[j][1])/2-ty,0];S.quad(at3(out[k],z0+.72),at3(out[j],z0+.72),at3(out[j],z0+1),at3(out[k],z0+1),yellow,m);}
 const seat=[lin(0xd92d2d),lin(0x2a5cb8)],spike=[lin(0xe8401f),lin(0xf59a1b)];
 for(let k=0;k<16;k++){
  const a=(k+.5)/16*TAU,fs=frame(tx,ty,0,a);
  S.box(fs,2.35,2.5,-.28,.28,z0+1,z0+2.55,seat[k%2]);S.box(fs,2.5,3.05,-.28,.28,z0+1,z0+1.16,seat[k%2]);S.box(fs,2.52,2.86,-.22,.22,z0+1.75,z0+2.35,dark);
  const b=k/16*TAU,fk=frame(tx,ty,0,b),tip=fk(4.75,0,z0+2.15);
  S.tri(fk(3.45,-.42,z0+.95),fk(3.45,.42,z0+.95),tip,spike[k%2]);S.tri(fk(3.45,.42,z0+.95),fk(3.45,-.42,z0+.95),tip,spike[k%2]);
  const c=k%2?lin(0xffd23a):lin(0xff6a2a);L.bulb(tip,.17,c,[.9,.5,k%2*.5]);sprites.push({bone:ring,p:tip,c,i:1,s:.18,blink:[.9,.5],ph:k%2*.5});
 }
 for(let k=0;k<32;k++){const p=ringPts(tx,ty,3.62,z0+.86,32,k*TAU/32)[0];L.bulb(p,.12,lin(0xffd23a),[1.2,.5,k/32*2]);}
 S.bone=L.bone=0;
 const cyc=skyCycle(D.travel);let now={ph:'embarque',z:0,v:0};
 function pose(z){const bn=bones[ring];bn.position.copy(bn.userData.rest);bn.position.y+=z;}
 const clear=[];for(let x=-8;x<=8;x+=4)for(let y=-8;y<=8;y+=4)clear.push({x:tx+x,y:ty+y,r:4});
 return {name:'elevador',hub:[tx,ty,top],top:top+5.4,clear,update(t){now=cyc.at(t+(D.phase??0));pose(now.z);},sample(u){pose(u*D.travel);},
  info:()=>({phase:now.ph,height:+now.z.toFixed(2),speed:+now.v.toFixed(2),cycle:+cyc.total.toFixed(2),fall:+cyc.fall.toFixed(2),top:+(cyc.top*3.6).toFixed(0)})};
}

// ---------- Cataclisma (a Ranger): the arm turns on the axle 3 m out from the column's face (the T of seats passes the
// column at the bottom), gravity on the arm (its counterweight leaves k = 1.1 s⁻²) and the motor's torque per phase.
const RANGER={k:1.1,pump:.24,speed:1.75,gain:1.6,max:1.4,brake:.45,phases:[['embarque',10],['balanço',16],['giro',12],['contragiro',11],['freio',11]]};
function cataclisma(K){
 const {T,gAt,mobile,addBone,bones,sprites,at,lapDir,signFaces}=K,C=PARK.cataclisma,[cx,cy]=at(C.at),S=T.paint,L=T.bulbs;
 const Pd=[Math.cos(C.plane),Math.sin(C.plane)];let Ax=[-Pd[1],Pd[0]];const d=lapDir(cx,cy);if(Ax[0]*d[0]+Ax[1]*d[1]<0)Ax=[-Ax[0],-Ax[1]];
 const off=C.offset,F=(p,a,z)=>[cx+Pd[0]*p+Ax[0]*a,cy+Pd[1]*p+Ax[1]*a,z],c0=F(0,1.5,0);
 let g0=gAt(c0[0],c0[1]);for(let k=0;k<8;k++)g0=Math.max(g0,gAt(c0[0]+Math.cos(k*TAU/8)*6.5,c0[1]+Math.sin(k*TAU/8)*6.5));
 const plat=g0+1,pv=plat+C.pivot,white=lin(0xf1f1ee),blue=lin(0x2050b8),steel=lin(0xc9ccd0),dark=lin(0x24272b),grey=lin(0x8f8d88);
 S.bone=0;
 // The platform (an octagon round the column and the arm's plane), its hazard edge, the steps behind the column.
 S.prism(ringPts(c0[0],c0[1],6.8,g0-.5,8,TAU/16),ringPts(c0[0],c0[1],6.8,plat,8,TAU/16),grey);
 {const o=ringPts(c0[0],c0[1],6.8,plat+.015,8,TAU/16),i=ringPts(c0[0],c0[1],6.3,plat+.015,8,TAU/16);for(let k=0;k<8;k++)for(let s=0;s<6;s++){const u0=s/6,u1=(s+1)/6;S.quad(mix3(i[k],i[(k+1)%8],u0),mix3(o[k],o[(k+1)%8],u0),mix3(o[k],o[(k+1)%8],u1),mix3(i[k],i[(k+1)%8],u1),s%2?dark:lin(0xf2c518),[0,0,1]);}}
 for(let i=0;i<4;i++)S.box(F,-1.1,1.1,-6.4-i*.5,-6.9-i*.5,g0-.4,plat-(i+1)*(plat-g0)/5,lin(0x9a9893));
 // The column: tapering, blue to 2.6 m with white teeth over it, white above; the strut behind; the axle housing.
 const col=(z0,z1,h0,h1,c)=>{const q=(su,sa,z,h)=>F(su*h[0],sa*h[1],z),cs=[[-1,-1],[1,-1],[1,1],[-1,1]];for(let k=0;k<4;k++){const a=cs[k],b=cs[(k+1)%4];S.quad(q(...a,z0,h0),q(...b,z0,h0),q(...b,z1,h1),q(...a,z1,h1),c,sub(F((a[0]+b[0])/2,(a[1]+b[1])/2,0),F(0,0,0)));}};
 const hAt=z=>{const u=(z-plat)/(pv+.7-plat);return [lerp(.85,.55,u),lerp(.65,.45,u)];};
 col(plat,plat+2.6,hAt(plat),hAt(plat+2.6),blue);col(plat+2.6,pv+.7,hAt(plat+2.6),hAt(pv+.7),white);
 {const h=hAt(pv+.7);S.quad(F(-h[0],-h[1],pv+.7),F(h[0],-h[1],pv+.7),F(h[0],h[1],pv+.7),F(-h[0],h[1],pv+.7),white,[0,0,1]);}
 {const z=plat+2.6,h=hAt(z),teeth=4;for(const [ax,sg] of [[0,1],[0,-1],[1,1],[1,-1]]){const half=h[ax],nrm=ax?F(0,sg,0):F(sg,0,0),o=sub(nrm,F(0,0,0));for(let t=0;t<teeth;t++){const a0=-half+2*half*t/teeth,a1=a0+2*half/teeth,am=(a0+a1)/2,pt=(s,zz)=>ax?F(s,sg*(h[1]+.012),zz):F(sg*(h[0]+.012),s,zz);S.poly([pt(a0,z),pt(a1,z),pt(am,z-.55)],white,o);}}}
 S.post(F(-4.4,0,plat),F(-.5,0,plat+8.5),.28,.22,6,white);
 S.post(F(0,-.4,pv),F(0,off-.5,pv),.62,.62,10,steel);
 // The ride's oval board on the column's face toward the lap (cut out of the atlas, both faces).
 {const c=F(0,hAt(plat+6)[1]+.04,0),r=[-Ax[1],Ax[0]],q=(x,z)=>[c[0]+r[0]*x,c[1]+r[1]*x,z];signFaces(q(-1.7,plat+5.4),q(1.7,plat+5.4),q(1.7,plat+6.6),q(-1.7,plat+6.6),'cataclisma',[Ax[0],Ax[1],0]);}
 // Lamps up the column's corners toward the lap, chasing upward.
 for(const s of [-1,1])for(let z=plat+3;z<pv-.8;z+=1){const h=hAt(z);L.bulb(F(s*(h[0]+.08),h[1]+.08,z),.12,lin(0xffd23a),[1.4,.4,-(z-plat)/8]);}
 // The arm (one bone, at rest hanging with the seats at the bottom): the beam, the hub flange, the counterweight; the
 // T of eight seats (two rows back to back), the round lamps in two rows on its faces; their lamps.
 const arm=addBone('cataclisma',0,F(0,off,pv));S.bone=arm;L.bone=arm;
 const za=pv-C.arm,zc=pv+C.counter;
 S.box(F,-.42,.42,off-.32,off+.32,za-.2,zc+.2,white,{bottom:true});
 S.post(F(0,off-.45,pv),F(0,off+.45,pv),.95,.95,12,blue);
 S.box(F,-.95,.95,off-.75,off+.75,zc-1.7,zc+.5,blue,{bottom:true});
 S.box(F,-.28,.28,off-2.4,off+2.4,za-.28,za+.28,white,{bottom:true});
 const seatC=[lin(0xd92d2d),lin(0x2050b8)];
 for(const sp of [-1,1])for(let j=0;j<4;j++){const a=off-1.65+j*1.1,c=seatC[(j+(sp>0?0:1))%2],pr=(x0,x1)=>sp>0?[x0,x1]:[-x1,-x0];
  S.box(F,...pr(.32,.92),a-.27,a+.27,za-.64,za-.5,c,{bottom:true});S.box(F,...pr(.28,.4),a-.27,a+.27,za-.64,za+.55,c);S.box(F,...pr(.4,.7),a-.2,a+.2,za+.05,za+.48,dark,{bottom:true});}
 const nd=mobile?4:6,rims=[lin(0xd92d2d),lin(0xf4f4f0),lin(0x2050b8)],faces=mobile?[1]:[1,-1];
 for(const face of faces)for(const row of [-1,1])for(let j=0;j<nd+2;j++){
  const z=j<nd?pv-2.2-j*(C.arm-3.6)/(nd-1):pv+1.9+(j-nd)*2.2,p=row*.66,a=off+face*.34,o=[Ax[0]*face,Ax[1]*face,0];
  S.post(F(p,a,z),F(p,a+face*.15,z),.42,.42,10,rims[(j+(row>0?0:1))%3],{top:false});
  S.fan(Array.from({length:10},(_,i)=>F(p+Math.cos(i*TAU/10)*.42,a,z+Math.sin(i*TAU/10)*.42)),dark,[-o[0],-o[1],0]);
  const disc=Array.from({length:10},(_,i)=>F(p+Math.cos(i*TAU/10)*.36,a+face*.13,z+Math.sin(i*TAU/10)*.36)),ph=(j<nd?j/nd:0)*.8+(row>0?0:.25),c=j%2?lin(0xfff4dc):lin(0xffe0a0);
  L.blink=[1.6,.5,ph];L.fan(disc,c,o);L.blink=null;
  if(face>0&&(j%2===0||j>=nd))sprites.push({bone:arm,p:F(p,a+face*.2,z),c,i:1.1,s:.35,blink:[1.6,.5],ph});
 }
 for(const sp of [-1,1])for(let k=0;k<10;k++){const p=F(sp*.3,off-2.3+k*4.6/9,za-.3),c=k%2?lin(0x3ac8ff):lin(0xff3b3b);L.bulb(p,.11,c,[.7,.5,k/10]);if(k===0||k===9)sprites.push({bone:arm,p,c,i:1,s:.14,blink:[.7,.5],ph:k/10});}
 for(let k=0;k<8;k++)L.bulb(F(Math.cos(k*TAU/8)*1,off+.8,zc-.6+Math.sin(k*TAU/8)*.95),.13,lin(0xffd23a),[1,.5,k/8]);
 S.bone=L.bone=0;
 // The motion: the motor's torque per phase on the arm (fixed steps), from the park's clock.
 const axis=v3([Ax[0],Ax[1],0]),R=RANGER,total=R.phases.reduce((s,p)=>s+p[1],0);
 let th=0,w=0,clock=0,ph='embarque';
 const phaseAt=c=>{let t=((c%total)+total)%total;for(const [n,dd] of R.phases){if(t<dd)return n;t-=dd;}return 'embarque';};
 function stepOnce(dt){
  ph=phaseAt(clock);const wrapped=Math.atan2(Math.sin(th),Math.cos(th));let tau;
  if(ph==='embarque')tau=-9*wrapped-5*w+R.k*Math.sin(th);
  else if(ph==='balanço')tau=Math.abs(w)<R.speed?R.pump*(w>=0?1:-1):0;// pumps with the swing, no faster than the turns
  else if(ph==='freio')tau=-R.brake*w;
  else tau=clamp(R.gain*((ph==='giro'?1:-1)*R.speed-w),-R.max,R.max)+R.k*Math.sin(th);
  w+=(tau-R.k*Math.sin(th))*dt;th+=w*dt;clock+=dt;
 }
 const pose=a=>bones[arm].quaternion.setFromAxisAngle(axis,a);
 const clear=[];for(let p=-16;p<=16;p+=5)for(const a of [-2,3,7])clear.push({x:F(p,a,0)[0],y:F(p,a,0)[1],r:5});
 return {name:'cataclisma',hub:F(0,off,pv),top:pv+C.arm+.6,clear,
  // Fixed steps of about 1/120 s; a jump in the clock (a new race, setTime, the clock's wrap) replays the last 30 s.
  update(t){if(t<clock||t-clock>5){clock=t-30;th=w=0;}const n=Math.ceil((t-clock)*120),h=n?(t-clock)/n:0;for(let i=0;i<n;i++)stepOnce(h);pose(th);},
  sample(u){pose(u*TAU);},
  info:()=>{const a=Math.atan2(Math.sin(th),Math.cos(th));return {phase:ph,angle:+(a/DEG).toFixed(1),speed:+w.toFixed(2),turns:+(th/TAU).toFixed(2)};}};
}

// ---------- Carrousel
function carousel(K){
 const {T,gAt,mobile,addBone,bones,sprites,at}=K,Cr=PARK.carousel,[cx,cy]=at(Cr.at),R=Cr.r,S=T.paint,L=T.bulbs;
 let g0=gAt(cx,cy);for(let k=0;k<8;k++)g0=Math.max(g0,gAt(cx+Math.cos(k*TAU/8)*(R+.5),cy+Math.sin(k*TAU/8)*(R+.5)));
 const z0=g0+.35,Pp=(a,r,z)=>[cx+Math.cos(a)*r,cy+Math.sin(a)*r,z];
 S.bone=0;S.prism(ringPts(cx,cy,R+.55,g0-.5,24),ringPts(cx,cy,R+.55,z0,24),lin(0xd9cfbf));
 const rot=addBone('carrossel',0,[cx,cy,z0]);S.bone=rot;L.bone=rot;
 // The turning part: platform, centre column (mirrors and painted panels), the canopy's sixteen stripes, its rounding
 // boards with scallops, the finial and its flag.
 S.prism(ringPts(cx,cy,R,z0,24),ringPts(cx,cy,R,z0+.3,24),lin(0x8a3b22));
 {const t=ringPts(cx,cy,R-.02,z0+.305,24);S.fan(t,lin(0xb98a5a),[0,0,1]);}
 const cc=ringPts(cx,cy,1.3,z0+.3,8),ct=ringPts(cx,cy,1.3,z0+4.75,8);for(let k=0;k<8;k++){const j=(k+1)%8;S.quad(cc[k],cc[j],ct[j],ct[k],k%2?lin(0xbfd3e6):lin(0xd9a43a),[(cc[k][0]+cc[j][0])/2-cx,(cc[k][1]+cc[j][1])/2-cy,0]);}
 const zc=z0+4.75,zt=z0+6.9,RC=R+.35,apex=[cx,cy,zt],stripes=[lin(0xd92d2d),lin(0xf6f2e6),lin(0xf2c518),lin(0x2a5cb8)];
 for(let k=0;k<16;k++){const a0=k/16*TAU,a1=(k+1)/16*TAU;S.tri(Pp(a0,RC,zc),Pp(a1,RC,zc),apex,stripes[k%4]);S.tri(Pp(a1,RC,zc-.02),Pp(a0,RC,zc-.02),[cx,cy,zc-.02],lin(0xf3ead2));
  const m=[Math.cos((a0+a1)/2),Math.sin((a0+a1)/2),0];S.quad(Pp(a0,RC,zc-.8),Pp(a1,RC,zc-.8),Pp(a1,RC,zc),Pp(a0,RC,zc),k%2?lin(0xd92d2d):lin(0xc79a2e),m);S.quad(Pp(a0,RC-.03,zc-.8),Pp(a1,RC-.03,zc-.8),Pp(a1,RC-.03,zc),Pp(a0,RC-.03,zc),lin(0x8a3b22),mul(m,-1));
  S.poly([Pp(a0,RC,zc-.8),Pp((a0+a1)/2,RC,zc-1.15),Pp(a1,RC,zc-.8)],lin(0xc79a2e),m);S.poly([Pp(a1,RC-.03,zc-.8),Pp((a0+a1)/2,RC-.03,zc-1.15),Pp(a0,RC-.03,zc-.8)],lin(0x8a3b22),mul(m,-1));}
 S.post(apex,[cx,cy,zt+.9],.1,.05,6,lin(0xc79a2e));S.poly([[cx,cy,zt+.9],[cx,cy,zt+.5],[cx+.8,cy,zt+.72]],lin(0xd92d2d),[0,1,0]);S.poly([[cx,cy,zt+.9],[cx+.8,cy,zt+.72],[cx,cy,zt+.5]],lin(0xd92d2d),[0,-1,0]);
 // Bulbs: two rows on the rounding boards and one at every scallop, chasing; a line up each canopy seam.
 const nb=mobile?16:32;
 for(const [z,r] of [[zc-.2,RC+.06],[zc-.6,RC+.06]])for(let k=0;k<nb;k++){const p=Pp((k+.5)/nb*TAU,r,z),c=k%2?lin(0xfff0c8):lin(0xffd23a);L.bulb(p,.1,c,[1.1,.5,k/nb*6]);if(z>zc-.4&&k%4===0)sprites.push({bone:rot,p,c,i:.8,s:.12,blink:[1.1,.5],ph:k/nb*6});}
 for(let k=0;k<16;k++)L.bulb(Pp((k+.5)/16*TAU,RC+.05,zc-1.18),.1,lin(0xff3b3b),[.8,.5,k%2*.5]);
 if(!mobile)for(let k=0;k<16;k++)for(let j=1;j<4;j++){const u=j/4;L.bulb(mix3(Pp(k/16*TAU,RC,zc),apex,u),.09,lin(0xfff0c8),[1.4,.4,-u]);}
 // The horses in three ranks (outer 12, middle 10, inner 8), facing the way it turns (counter-clockwise), each rank's
 // every third horse on one of three bones rising and falling in turn; brass poles up through the canopy.
 const coats=[0xf3efe6,0xe8d9b5,0x8a5a33,0x2a2522,0xb9b6b0].map(h=>lin(h)),saddles=[0xd92d2d,0x2a5cb8,0xd9a43a,0x2fae5a].map(h=>lin(h)),brass=lin(0xd8b45a);
 const groups=[0,1,2].map(g=>addBone('cavalos'+g,rot,[cx,cy,z0])),ranks=mobile?[[R-.9,10],[R-2.1,8]]:[[R-.9,12],[R-2,10],[R-3.1,8]];
 let h=0;
 for(const [r,n] of ranks)for(let k=0;k<n;k++,h++){
  const a=k/n*TAU+r*.17,p=Pp(a,r,0),g=(k+Math.round(r))%3;S.bone=groups[g];
  S.post([p[0],p[1],z0+.05],[p[0],p[1],z0+4.2],.035,.035,6,brass,{top:false});
  const fh=frame(p[0],p[1],z0+1.25,a+Math.PI/2),coat=coats[h%coats.length],sad=saddles[h%saddles.length],mane=h%5===3?lin(0xe8d9b5):lin(0x2a2522);
  S.box(fh,-.6,.55,-.17,.17,-.2,.22,coat,{bottom:true});
  S.post(fh(.42,0,.1),fh(.72,0,.62),.14,.1,4,coat,{rot:Math.PI/4});S.post(fh(.66,0,.68),fh(1.02,0,.46),.1,.08,4,coat,{rot:Math.PI/4});
  for(const v of [-.1,.1]){S.post(fh(.42,v,-.15),fh(.66,v,-.5),.05,.04,4,coat,{rot:Math.PI/4});S.post(fh(-.45,v,-.15),fh(-.52,v,-.72),.05,.04,4,coat,{rot:Math.PI/4});}
  S.post(fh(-.6,0,.12),fh(-.86,0,-.32),.07,.02,4,mane,{rot:Math.PI/4});S.box(fh,.38,.7,-.04,.04,.35,.72,mane);
  S.box(fh,-.2,.18,-.19,.19,.22,.29,sad);
 }
 S.bone=L.bone=0;
 const omega=TAU/Cr.turn;let angle=0;
 const pose=(a,t)=>{angle=a;bones[rot].quaternion.setFromAxisAngle(UP,a);groups.forEach((g,i)=>{bones[g].position.set(0,.28*Math.sin(TAU*t/2.2+i*TAU/3),0);});};
 return {name:'carrossel',clear:[{x:cx,y:cy,r:R+3}],update(t){pose((omega*t)%TAU,t);},sample(u){pose(u*TAU,u*2.2);},info:()=>({angle:+(angle/DEG).toFixed(1)})};
}

// ---------- The little train round the star garden, under its yellow arc
function gardenTrain(K){
 const {T,gAt,mobile,addBone,bones,sprites,at,paving}=K,G=PARK.garden,[gx,gy]=at(G.at),Rg=G.r,S=T.paint,L=T.bulbs;
 const Pp=(a,r,z)=>[gx+Math.cos(a)*r,gy+Math.sin(a)*r,z];
 let zs=0,zmax=-Infinity;const ns=24;for(let k=0;k<ns;k++){const g=gAt(...Pp(k/ns*TAU,13.55,0).slice(0,2));zs+=g/ns;zmax=Math.max(zmax,g);}
 const zt=Math.max(zs+.25,zmax+.08),steel=lin(0x8c8f93),white=lin(0xf4f4f0),green=lin(0x2e7d3a);
 S.bone=0;
 // The level track on its ballast ring (sides down into the ground), rails, sleepers.
 const n=mobile?40:72;
 for(let k=0;k<n;k++){const a0=k/n*TAU,a1=(k+1)/n*TAU,am=(a0+a1)/2,m=[Math.cos(am),Math.sin(am),0];
  const gi=Math.min(gAt(...Pp(a0,12.7,0).slice(0,2)),gAt(...Pp(a1,12.7,0).slice(0,2)))-.25,go=Math.min(gAt(...Pp(a0,14.4,0).slice(0,2)),gAt(...Pp(a1,14.4,0).slice(0,2)))-.25,bal=lin(0x7e766a);
  S.quad(Pp(a0,12.7,zt),Pp(a1,12.7,zt),Pp(a1,14.4,zt),Pp(a0,14.4,zt),bal,[0,0,1]);S.quad(Pp(a0,14.4,go),Pp(a1,14.4,go),Pp(a1,14.4,zt),Pp(a0,14.4,zt),bal,m);S.quad(Pp(a0,12.7,gi),Pp(a1,12.7,gi),Pp(a1,12.7,zt),Pp(a0,12.7,zt),bal,mul(m,-1));
  for(const r of [13.2,13.9])S.post(Pp(a0,r,zt+.12),Pp(a1,r,zt+.12),.045,.045,4,steel,{top:false});
  if(!mobile)S.box(frame(...Pp(am,0,0).slice(0,2),0,am),12.95,14.15,-.11,.11,zt-.02,zt+.07,lin(0x5b4632));
 }
 // The yellow arc: a roof over the track from the north round to the east, on posts, a red fascia with bulbs.
 const a0=12*DEG,a1=98*DEG,na=mobile?8:14,zr=zt+3.3;
 for(let k=0;k<na;k++){const b0=lerp(a0,a1,k/na),b1=lerp(a0,a1,(k+1)/na),bm=(b0+b1)/2,m=[Math.cos(bm),Math.sin(bm),0];
  S.quad(Pp(b0,12,zr),Pp(b1,12,zr),Pp(b1,16,zr+.35),Pp(b0,16,zr+.35),lin(0xf2c518),[0,0,1]);S.quad(Pp(b0,12,zr-.08),Pp(b1,12,zr-.08),Pp(b1,16,zr+.27),Pp(b0,16,zr+.27),lin(0xe8e2cf),[0,0,-1]);
  S.quad(Pp(b0,16.02,zr-.25),Pp(b1,16.02,zr-.25),Pp(b1,16.02,zr+.35),Pp(b0,16.02,zr+.35),lin(0xd8262c),m);S.quad(Pp(b0,11.98,zr-.3),Pp(b1,11.98,zr-.3),Pp(b1,11.98,zr),Pp(b0,11.98,zr),lin(0xd8262c),mul(m,-1));
  for(let j=0;j<3;j++){const p=Pp(lerp(b0,b1,(j+.5)/3),16.1,zr+.05),c=j%2?lin(0xffd23a):lin(0xfff0c8);L.bulb(p,.1,c,[1.3,.5,(k*3+j)/(na*3)*5]);}
 }
 for(let k=0;k<=na;k+=2){const b=lerp(a0,a1,k/na);for(const r of [12.15,15.85]){const p=Pp(b,r,0);S.post([p[0],p[1],gAt(p[0],p[1])-.3],[p[0],p[1],zr+(r>14?.3:0)],.09,.09,6,lin(0xd8262c),{top:false});}}
 // The garden's fence (white posts and two rails), the centre pole with its striped ball.
 const nf=mobile?24:40;for(let k=0;k<nf;k++){if(k===Math.round(nf*.6))continue;const b0=k/nf*TAU,b1=(k+1)/nf*TAU,p=Pp(b0,Rg+.25,0),q=Pp(b1,Rg+.25,0),gp=gAt(p[0],p[1]),gq=gAt(q[0],q[1]);
  S.post([p[0],p[1],gp-.2],[p[0],p[1],gp+.95],.05,.05,4,white);for(const z of [.45,.9])S.post([p[0],p[1],gp+z],[q[0],q[1],gq+z],.03,.03,4,white,{top:false});}
 {const gc=gAt(gx,gy);S.post([gx,gy,gc-.2],[gx,gy,gc+3.6],.09,.07,6,white);const cols=[0xd92d2d,0xf2c518,0x2a5cb8,0x2fae5a].map(h=>lin(h));for(let k=0;k<8;k++){const a=k/8*TAU,b=(k+1)/8*TAU;for(const s of [1,-1])S.tri([gx,gy,gc+3.6+s*.55],[gx+Math.cos(s>0?a:b)*.55,gy+Math.sin(s>0?a:b)*.55,gc+3.6],[gx+Math.cos(s>0?b:a)*.55,gy+Math.sin(s>0?b:a)*.55,gc+3.6],cols[k%4]);}}
 // On the lawn (the paving batch): the star's yellow lines and seven round flower beds.
 {const gc=gAt(gx,gy),pts=Array.from({length:16},(_,k)=>Pp(k/16*TAU+Math.PI/2,k%2?5:9.6,0));
  for(let k=0;k<16;k++){const p=pts[k],q=pts[(k+1)%16],d=unit([q[0]-p[0],q[1]-p[1],0]),nx=-d[1]*.16,ny=d[0]*.16,z=(x,y)=>gAt(x,y)+.13;paving.quad([p[0]-nx,p[1]-ny,z(p[0],p[1])],[q[0]-nx,q[1]-ny,z(q[0],q[1])],[q[0]+nx,q[1]+ny,z(q[0],q[1])],[p[0]+nx,p[1]+ny,z(p[0],p[1])],lin(0xe6c62c),[0,0,1]);}
  for(let k=0;k<7;k++){const c=Pp(k/7*TAU+.4,10.9,0),ring=Array.from({length:10},(_,i)=>{const x=c[0]+Math.cos(i*TAU/10)*1.05,y=c[1]+Math.sin(i*TAU/10)*1.05;return [x,y,gAt(x,y)+.12];});paving.fan(ring,k%2?lin(0x2f5e24):lin(0x7a2a2a),[0,0,1]);}
  void gc;}
 // The train (one bone): the red engine, four open coaches.
 const tr=addBone('trem',0,[gx,gy,zt]);S.bone=tr;L.bone=tr;
 const coachCols=[0x2a5cb8,0x2fae5a,0xf2c518,0xf07a1a].map(h=>lin(h)),dark=lin(0x24272b),red=lin(0xd92d2d);
 for(let k=0;k<5;k++){
  const a=-k*2.95/13.55,p=Pp(a,13.55,0),fc=frame(p[0],p[1],zt+.22,a+Math.PI/2);
  S.box(fc,-1.15,1.15,-.55,.55,0,.3,dark,{bottom:true});
  if(k===0){S.post(fc(-.25,0,.78),fc(1.12,0,.78),.42,.42,10,red);S.box(fc,-1.15,-.3,-.58,.58,.3,1.55,red);S.box(fc,-1.25,-.2,-.66,.66,1.55,1.67,dark,{bottom:true});S.box(fc,-1.13,-.35,-.6,.6,.95,1.4,lin(0x34404c),{top:false,bottom:false});
   S.post(fc(.82,0,1.15),fc(.82,0,1.6),.12,.17,8,dark);S.box(fc,1.12,1.22,-.6,.6,.08,.35,lin(0xf2c518));L.bulb(fc(1.16,0,.85),.11,lin(0xfff4dc),[0,1,0]);sprites.push({bone:tr,p:fc(1.16,0,.85),c:lin(0xfff4dc),i:.8,s:.12});}
  else{const c=coachCols[(k-1)%4];S.box(fc,-1,1,-.56,.56,.3,.92,c,{top:false});S.box(fc,-.9,.9,-.48,.48,.3,.55,lin(0x6b4a2e));for(const u of [-.45,.45])S.box(fc,u-.12,u+.12,-.48,.48,.55,.9,lin(0x8a5a33));}
 }
 S.bone=L.bone=0;
 const omega=TAU/G.turn;let angle=0;const pose=a=>{angle=a;bones[tr].quaternion.setFromAxisAngle(UP,a);};
 return {name:'trem',update(t){pose((omega*t)%TAU);},sample(u){pose(u*TAU);},info:()=>({angle:+(angle/DEG).toFixed(1)}),lawn:{x:gx,y:gy}};
}

// ---------- A Lagarta (the green caterpillar ring), the bumper boats' pool, the Autopista's bumper cars
function caterpillar(K){
 const {T,gAt,mobile,addBone,bones,at,board}=K,Ct=PARK.caterpillar,[cx,cy]=at(Ct.at),S=T.paint,L=T.bulbs;
 let g0=gAt(cx,cy);for(let k=0;k<8;k++)g0=Math.max(g0,gAt(cx+Math.cos(k*TAU/8)*5,cy+Math.sin(k*TAU/8)*5));
 const z0=g0+.45,Pp=(a,r,z)=>[cx+Math.cos(a)*r,cy+Math.sin(a)*r,z];
 S.bone=0;S.prism(ringPts(cx,cy,Ct.r+.3,g0-.4,16),ringPts(cx,cy,Ct.r+.3,z0,16),lin(0x2a5cb8),{top:false});S.fan(ringPts(cx,cy,Ct.r+.3,z0,16),lin(0x9a9893),[0,0,1]);
 S.post([cx,cy,z0],[cx,cy,z0+1.6],.9,.9,8,lin(0xf2c518));
 board([cx,cy,z0+2.3],unit([Math.cos(PARK.wheel.axle),Math.sin(PARK.wheel.axle),0]),2.2,.45,'lagarta');S.post([cx,cy,z0+1.6],[cx,cy,z0+2.05],.05,.05,4,lin(0x24272b));
 for(let k=0;k<16;k++)L.bulb(Pp((k+.5)/16*TAU,Ct.r+.35,z0-.15),.1,[lin(0xff3b3b),lin(0xffd23a),lin(0x45ff6a),lin(0x3ac8ff)][k%4],[1,.5,k/16*3]);
 const rot=addBone('lagarta',0,[cx,cy,z0]);S.bone=rot;
 const n=mobile?7:10,r=Ct.r-1.1,gr=[lin(0x3fbf3f),lin(0x2f9a35)];
 for(let k=0;k<n;k++){const a=k/n*TAU,da=TAU/n*.56;S.post(Pp(a-da,r,z0+.75),Pp(a+da,r,z0+.75),.55,.55,8,gr[k%2],{rot:Math.PI/8});S.fan(ringPts(0,0,.55,0,8,Math.PI/8).map(([x,y])=>{const p=Pp(a-da,r,z0+.75),t=[-Math.sin(a-da),Math.cos(a-da)],o=[Math.cos(a-da),Math.sin(a-da)];return [p[0]+o[0]*x,p[1]+o[1]*x,p[2]+y];}),gr[k%2],[Math.sin(a-da),-Math.cos(a-da),0]);
  S.box(frame(...Pp(a,r,0).slice(0,2),0,a),-.42,-.3,-.35,.35,z0+1.2,z0+1.75,lin(0xf2c518));}
 {const a=TAU/n*.56,h=Pp(a+.25,r,z0+1.05),fh=frame(h[0],h[1],0,a+Math.PI/2);S.post(fh(-.4,0,h[2]),fh(.35,0,h[2]+.2),.7,.6,8,lin(0x45c845));for(const v of [-.28,.28]){S.bulb(fh(.6,v,h[2]+.45),.16,lin(0xffffff),null);S.bulb(fh(.72,v,h[2]+.47),.08,lin(0x111111),null);S.post(fh(.2,v,h[2]+.6),fh(.35,v*1.6,h[2]+1.3),.03,.03,4,lin(0x24272b),{top:false});S.bulb(fh(.35,v*1.6,h[2]+1.35),.1,lin(0xd92d2d),null);}}
 S.bone=0;
 const omega=TAU/Ct.turn;let angle=0;const pose=a=>{angle=a;bones[rot].quaternion.setFromAxisAngle(UP,a);};
 return {name:'lagarta',clear:[{x:cx,y:cy,r:6}],update(t){pose((omega*t)%TAU);},sample(u){pose(u*TAU);},info:()=>({angle:+(angle/DEG).toFixed(1)})};
}
function bumperBoats(K){
 const {T,gAt,at,rand}=K,Pl=PARK.pool,[cx,cy]=at(Pl.at),S=T.paint,n=28;
 const E=(r,k,z)=>{const a=k/n*TAU;return [cx+Math.cos(a)*Pl.a*r,cy+Math.sin(a)*Pl.b*r,z];};
 let g0=-Infinity;for(let k=0;k<n;k+=4)g0=Math.max(g0,gAt(...E(1.1,k,0).slice(0,2)));const zw=g0+.25;
 S.bone=0;S.prism(Array.from({length:n},(_,k)=>E(1.08,k,g0-.4)),Array.from({length:n},(_,k)=>E(1.08,k,g0+.55)),lin(0xf4f4f0),{top:false});
 for(let k=0;k<n;k++){const j=(k+1)%n;S.quad(E(1,k,g0+.55),E(1.08,k,g0+.55),E(1.08,j,g0+.55),E(1,j,g0+.55),lin(0xf2c518),[0,0,1]);S.quad(E(1,k,zw),E(1,j,zw),E(1,j,g0+.55),E(1,k,g0+.55),lin(0x5aa6d6),[cx-E(1,k,0)[0],cy-E(1,k,0)[1],0]);}
 S.fan(Array.from({length:n},(_,k)=>E(1,k,zw)),lin(0x2f8fd0),[0,0,1]);
 const cols=[0xd92d2d,0xf2c518,0x2fae5a,0xe8508f,0xf07a1a,0x8a4fd0].map(h=>lin(h));
 for(let k=0;k<6;k++){const a=k/6*TAU+rand()*.4,r=.45+rand()*.25,c=[cx+Math.cos(a)*Pl.a*r,cy+Math.sin(a)*Pl.b*r];S.prism(ringPts(c[0],c[1],.95,zw-.1,10),ringPts(c[0],c[1],.95,zw+.35,10),lin(0x24272b));S.fan(ringPts(c[0],c[1],.85,zw+.36,10),cols[k],[0,0,1]);S.post([c[0],c[1],zw+.36],[c[0],c[1],zw+.8],.05,.05,4,lin(0xc9ccd0));}
 return null;
}
function autopista(K){
 const {T,gAt,mobile,addBone,bones,sprites,at,board,rand}=K,Ap=PARK.autopista,[ax,ay]=at(Ap.at),f=frame(ax,ay,0,Ap.heading),hw=Ap.w/2,hd=Ap.d/2,S=T.paint,L=T.bulbs;
 let gmax=-Infinity,gmin=Infinity;for(const u of [-hw,0,hw])for(const v of [-hd,0,hd]){const g=gAt(...f(u,v,0).slice(0,2));gmax=Math.max(gmax,g);gmin=Math.min(gmin,g);}
 const fl=gmax+.25,zr=fl+4.6,brown=lin(0x6b3a24),roof=lin(0x3c4044);
 S.bone=0;
 S.box(f,-hw,hw,-hd,hd,gmin-.5,fl,lin(0xb7b0a3));S.box(f,-hw+.6,hw-.6,-hd+.6,hd-.6,fl,fl+.02,lin(0x55595e));
 S.box(f,-hw+.6,hw-.6,-hd+.6,-hd+.95,fl,fl+.55,lin(0x1f2226));S.box(f,-hw+.6,hw-.6,hd-.95,hd-.6,fl,fl+.55,lin(0x1f2226));S.box(f,-hw+.6,-hw+.95,-hd+.95,hd-.95,fl,fl+.55,lin(0x1f2226));S.box(f,hw-.95,hw-.6,-hd+.95,hd-.95,fl,fl+.55,lin(0x1f2226));
 for(let u=-hw+.3;u<=hw-.29;u+=(Ap.w-.6)/4)for(const v of [-hd+.3,hd-.3])S.box(f,u-.15,u+.15,v-.15,v+.15,fl,zr,lin(0xd8d4cc),{top:false});
 for(const u of [-hw+.3,hw-.3])S.box(f,u-.15,u+.15,-.15,.15,fl,zr,lin(0xd8d4cc),{top:false});
 S.box(f,-hw-.4,hw+.4,-hd-.4,hd+.4,zr,zr+.45,roof,{bottom:true});S.box(f,-hw+1,hw-1,-hd+1,hd-1,zr+.45,zr+1.1,roof);
 for(const [u0,u1,v0,v1] of [[-hw-.45,hw+.45,-hd-.45,-hd-.35],[-hw-.45,hw+.45,hd+.35,hd+.45],[-hw-.45,-hw-.35,-hd-.35,hd+.35],[hw+.35,hw+.45,-hd-.35,hd+.35]])S.box(f,u0,u1,v0,v1,zr-.55,zr+.6,brown,{bottom:true});
 S.box(f,-hw+.6,hw-.6,-hd+.6,hd-.6,zr-.25,zr-.2,lin(0x2c2f33),{top:false,bottom:true,sides:false,ends:false});
 board(f(0,hd+.47,zr+1.05),[Math.cos(Ap.heading+Math.PI/2),Math.sin(Ap.heading+Math.PI/2),0],4.6,.75,'autopista');
 board(f(hw+.47,0,zr+1.05),[Math.cos(Ap.heading),Math.sin(Ap.heading),0],4.6,.75,'autopista');
 // The fascia's marquee: bulbs along its lower edge all round, chasing.
 const per=2*(Ap.w+Ap.d),nb=Math.round(per/(mobile?1.8:.9));
 for(let k=0;k<nb;k++){let s=k/nb*per,u,v;if(s<Ap.w){u=-hw+s;v=-hd-.5;}else if((s-=Ap.w)<Ap.d){u=hw+.5;v=-hd+s;}else if((s-=Ap.d)<Ap.w){u=hw-s;v=hd+.5;}else{s-=Ap.w;u=-hw-.5;v=hd-s;}
  const p=f(u,v,zr-.42),c=k%3?lin(0xffd23a):lin(0xff3b3b);L.bulb(p,.1,c,[1.5,.5,k/nb*10]);if(k%6===0)sprites.push({p,c,i:.7,s:.12,blink:[1.5,.5],ph:k/nb*10});}
 // The bumper cars: each on its own bone wandering a figure of its own over the floor (bumping is in the eye), pole
 // and spark wheel up to the grid.
 const cols=[0xd92d2d,0x2a5cb8,0xf2c518,0x2fae5a,0xe8508f,0xf07a1a,0x8a4fd0,0xf4f4f0].map(h=>lin(h)),cars=[],nc=mobile?5:8;
 for(let k=0;k<nc;k++){
  const b=addBone('carrinho'+k,0,[ax,ay,fl]);S.bone=b;const fc=frame(ax,ay,fl,0);
  S.box(fc,-.95,.95,-.6,.6,.08,.42,cols[k],{bottom:true});S.box(fc,-1.02,1.02,-.67,.67,.02,.16,lin(0x1f2226));S.box(fc,-.65,-.1,-.45,.45,.42,.75,cols[k]);S.post(fc(-.75,0,.4),fc(-.75,0,zr-fl-.25),.03,.03,4,lin(0xc9ccd0),{top:false});
  cars.push({b,ax:hw-2.6,ay:hd-2.6,w1:.23+rand()*.12,w2:.17+rand()*.12,p1:rand()*TAU,p2:rand()*TAU});
 }
 S.bone=0;
 const tmp=new THREE.Quaternion();
 const pose=t=>{for(const c of cars){const x=c.ax*Math.sin(c.w1*t+c.p1),y=c.ay*Math.sin(c.w2*t+c.p2),vx=c.ax*c.w1*Math.cos(c.w1*t+c.p1),vy=c.ay*c.w2*Math.cos(c.w2*t+c.p2),bn=bones[c.b],h=Math.atan2(vy,vx)+Ap.heading,p=f(x,y,0);
  bn.position.set(p[0],bn.userData.rest.y,-p[1]);bn.quaternion.copy(tmp.setFromAxisAngle(UP,h));}};
 return {name:'autopista',update(t){pose(t);},sample(u){pose(u*120);},info:()=>({cars:cars.length})};
}

// ---------- As Xícaras (the teacups): a turntable (one bone) with five cups, each spinning on its own saucer (a bone
// each, the other way and faster).
function teacups(K){
 const {T,gAt,mobile,addBone,bones,at}=K,Tc=PARK.teacups,[cx,cy]=at(Tc.at),S=T.paint,L=T.bulbs;
 let g0=gAt(cx,cy);for(let k=0;k<8;k++)g0=Math.max(g0,gAt(cx+Math.cos(k*TAU/8)*(Tc.r+.4),cy+Math.sin(k*TAU/8)*(Tc.r+.4)));
 const z0=g0+.3;S.bone=0;
 S.prism(ringPts(cx,cy,Tc.r+.4,g0-.4,20),ringPts(cx,cy,Tc.r+.4,z0,20),lin(0xe8508f),{top:false});S.fan(ringPts(cx,cy,Tc.r+.4,z0,20),lin(0xf3e9d8),[0,0,1]);
 for(let k=0;k<20;k++)L.bulb(ringPts(cx,cy,Tc.r+.45,z0-.15,20,(k+.5)/20*TAU)[0],.09,k%2?lin(0xff4fd8):lin(0xfff0c8),[1.2,.5,k/20*4]);
 const rot=addBone('xicaras',0,[cx,cy,z0]);S.bone=rot;
 S.prism(ringPts(cx,cy,Tc.r,z0+.02,20),ringPts(cx,cy,Tc.r,z0+.18,20),lin(0x2a5cb8));S.post([cx,cy,z0+.18],[cx,cy,z0+1.4],.5,.25,8,lin(0xf2c518));
 const cols=[0xf2a7c3,0x9fd3f0,0xf6e27a,0xb8e6a8,0xd7b5f0].map(h=>lin(h)),cups=[];
 for(let k=0;k<5;k++){const a=k/5*TAU+.3,c=[cx+Math.cos(a)*2.6,cy+Math.sin(a)*2.6],b=addBone('xicara'+k,rot,[c[0],c[1],z0+.18]);S.bone=b;
  S.prism(ringPts(c[0],c[1],1.25,z0+.18,12),ringPts(c[0],c[1],1.25,z0+.26,12),lin(0xf4f4f0));
  const lo=ringPts(c[0],c[1],.75,z0+.26,mobile?8:12),hi=ringPts(c[0],c[1],1.05,z0+1.2,mobile?8:12);S.prism(lo,hi,cols[k],{top:false});S.fan(ringPts(c[0],c[1],.98,z0+.75,mobile?8:12),lin(0x6b4a2e),[0,0,1]);
  S.post([c[0]+Math.cos(a)*1.05,c[1]+Math.sin(a)*1.05,z0+.95],[c[0]+Math.cos(a)*1.35,c[1]+Math.sin(a)*1.35,z0+.7],.08,.08,4,cols[k]);
  cups.push(b);}
 S.bone=0;
 const omega=TAU/Tc.turn;let angle=0;
 const pose=t=>{angle=(omega*t)%TAU;bones[rot].quaternion.setFromAxisAngle(UP,angle);cups.forEach((b,i)=>bones[b].quaternion.setFromAxisAngle(UP,-(2.6+i*.3)*omega*t%TAU));};
 return {name:'xicaras',clear:[{x:cx,y:cy,r:5.5}],update(t){pose(t);},sample(u){pose(u*Tc.turn);},info:()=>({angle:+(angle/DEG).toFixed(1)})};
}

// ---------- Halls, tents, stalls, the gate, the sign facing the lap, poles and festoons, the railing, the paving
function halls(K){
 const {T,gAt,mobile,sprites,at,board,rand}=K,S=T.paint,L=T.bulbs;S.bone=0;
 const footing=(f,hu,hv)=>{let mx=-Infinity,mn=Infinity;for(const u of [-hu,0,hu])for(const v of [-hv,0,hv]){const g=gAt(...f(u,v,0).slice(0,2));mx=Math.max(mx,g);mn=Math.min(mn,g);}return [mn,mx];};
 // The restaurant: cream walls with a band of windows and doors, its tan hipped roof.
 {const H=PARK.hall,[x,y]=at(H.at),f=frame(x,y,0,H.heading),hu=H.w/2,hv=H.d/2,[mn,mx]=footing(f,hu,hv),fl=mx+.2;
  S.box(f,-hu,hu,-hv,hv,mn-.5,fl,lin(0xb7b0a3));S.box(f,-hu+.3,hu-.3,-hv+.3,hv-.3,fl,fl+3.6,lin(0xe9dcc0),{top:false});
  S.box(f,-hu+.8,hu-.8,-hv+.28,hv-.28,fl+1,fl+2.6,lin(0x3a4048),{top:false});
  hipRoof(S,f,hu+.6,hv+.6,fl+3.6,2.6,i=>i%2?lin(0xa77a4c):lin(0x9c6e42),{stripe:2.2,soffit:lin(0x8a6a4a)});}
 // The striped hall: open on posts, a red fascia with its marquee of bulbs, the yellow-and-white striped roof, the
 // games' booths inside.
 {const H=PARK.striped,[x,y]=at(H.at),f=frame(x,y,0,H.heading),hu=H.w/2,hv=H.d/2,[mn,mx]=footing(f,hu,hv),fl=mx+.15,ze=fl+4.2;
  S.box(f,-hu,hu,-hv,hv,mn-.5,fl,lin(0xa8a196));
  for(let u=-hu+.2;u<=hu-.19;u+=(H.w-.4)/6)for(const v of [-hv+.2,hv-.2])S.box(f,u-.12,u+.12,v-.12,v+.12,fl,ze,lin(0xf4f4f0),{top:false});
  S.box(f,-hu,hu,-hv,hv,ze-.6,ze,lin(0xc8202a),{bottom:true});
  hipRoof(S,f,hu+.5,hv+.5,ze,3.2,i=>i%2?lin(0xf6f2e6):lin(0xf2c518),{stripe:1.3,soffit:lin(0xe8e2cf)});
  const cols=[0x2fae5a,0xe8508f,0x2a5cb8,0xf07a1a,0x8a4fd0].map(h=>lin(h));for(let k=0;k<5;k++){const u=-hu+2.4+k*(H.w-4.8)/4;S.box(f,u-1.6,u+1.6,hv-3,hv-1,fl,fl+2.4,cols[k]);S.box(f,u-1.6,u+1.6,-hv+1,-hv+2.6,fl,fl+1.1,cols[(k+2)%5]);}
  const per=2*(H.w+H.d),nb=Math.round(per/(mobile?1.6:.8));
  for(let k=0;k<nb;k++){let s=k/nb*per,u,v;if(s<H.w){u=-hu+s;v=-hv-.05;}else if((s-=H.w)<H.d){u=hu+.05;v=-hv+s;}else if((s-=H.d)<H.w){u=hu-s;v=hv+.05;}else{s-=H.w;u=-hu-.05;v=hv-s;}
   const p=f(u,v,ze-.3),c=k%2?lin(0xfff0c8):lin(0xffd23a);L.bulb(p,.1,c,[.9,.5,k%2*.5]);if(k%5===0)sprites.push({p,c,i:.7,s:.12,blink:[.9,.5],ph:k%2*.5});}}
 // The white pyramid tents (a grid of them), festoons along their outer eaves.
 {const H=PARK.tents,[x,y]=at(H.at),f=frame(x,y,0,H.heading),hu=H.w/2,hv=H.d/2,nu=4,nv=mobile?2:3,su=H.w/nu,sv=H.d/nv;
  for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++){const p=f(-hu+i*su,-hv+j*sv,0),g=gAt(p[0],p[1]);S.post([p[0],p[1],g-.3],[p[0],p[1],g+2.75],.06,.06,4,lin(0xd8d4cc),{top:false});}
  for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){const c=f(-hu+(i+.5)*su,-hv+(j+.5)*sv,0),g=gAt(c[0],c[1]),ft=frame(c[0],c[1],0,H.heading),tone=.94+rand()*.06;
   hipRoof(S,ft,su/2,sv/2,g+2.75,1.9,mul(lin(0xf8f7f2),tone),{soffit:lin(0xd9d6cc)});S.box(ft,-su/2,su/2,-sv/2,sv/2,g+2.45,g+2.75,lin(0xf8f7f2),{top:false});S.box(ft,-su/2-.01,su/2+.01,-sv/2-.01,sv/2+.01,g+2.47,g+2.55,lin(0xd8262c),{top:false});}
  for(const v of [-hv-.08,hv+.08]){const nb=mobile?14:28;for(let k=0;k<nb;k++){const u=-hu+(k+.5)*H.w/nb,p=f(u,v,0),g=gAt(p[0],p[1]),s=(k%(nb/nu))/(nb/nu);L.bulb([p[0],p[1],g+2.4-.25*Math.sin(Math.PI*s)],.08,lin(0xfff0c8),[1.2+rand()*.8,.75,rand()]);}}}
 // The stalls: four booths in a row facing the park, striped awnings, boards, marquee bulbs.
 {const H=PARK.stalls,[x,y]=at(H.at),f=frame(x,y,0,H.heading),names=['pipoca','algodao','tiro','pescaria'],wall=[0xf4f4f0,0xff9ccc,0x2fae5a,0x2a5cb8].map(h=>lin(h)),awn=[[0xd92d2d,0xf6f2e6],[0xe8508f,0xf6f2e6],[0x2fae5a,0xf6f2e6],[0x2a5cb8,0xf6f2e6]],w=H.w/4;
  for(let k=0;k<4;k++){const u0=-H.w/2+k*w,u1=u0+w,um=(u0+u1)/2,p=f(um,0,0),g=gAt(p[0],p[1]);
   S.box(f,u0+.05,u1-.05,0,H.d,g-.3,g+2.7,wall[k]);S.box(f,u0+.05,u1-.05,-.02,.02,g+1.05,g+2.5,lin(0x2b2f35),{top:false,ends:false});S.box(f,u0+.15,u1-.15,-.55,0,g-.2,g+1.05,lin(0xe6dccb));
   for(let s=0;s<6;s++){const a=u0+s*w/6,b=a+w/6;S.quad(f(a,.05,g+2.9),f(b,.05,g+2.9),f(b,-1.6,g+2.3),f(a,-1.6,g+2.3),lin(awn[k][s%2]),[0,0,1]);S.quad(f(a,.05,g+2.88),f(a,-1.6,g+2.28),f(b,-1.6,g+2.28),f(b,.05,g+2.88),lin(awn[k][s%2]),[0,0,-1]);}
   board(f(um,.2,g+3.35),unit(sub(f(0,-1,0),f(0,0,0))),w-.4,.62,names[k]);
   for(let s=0;s<8;s++){const p=f(u0+(s+.5)*w/8,-1.65,g+2.25);L.bulb(p,.09,s%2?lin(0xffd23a):lin(0xfff0c8),[.7+k*.13,.5,s%2*.5]);}
   sprites.push({p:f(um,-1.65,g+2.25),c:lin(0xffe0a0),i:.8,s:.25});}}
 // The south strip: the Trem Fantasma (dark walls under the white roof, a crenellated false front toward the park with
 // its board, arched doors and slow green and purple lamps), the snack bar, the service shed.
 {const H=PARK.fantasma,[x,y]=at(H.at),f=frame(x,y,0,H.heading),hu=H.w/2,hv=H.d/2,[mn,mx]=footing(f,hu,hv),fl=mx+.15,purple=lin(0x3a2352);
  S.box(f,-hu,hu,-hv,hv,mn-.5,fl+4.2,lin(0x2b2233));S.box(f,-hu-.2,hu+.2,-hv-.2,hv+.2,fl+4.2,fl+4.55,lin(0xeeeeea),{bottom:true});
  S.box(f,-hu+1,hu-1,hv,hv+.35,fl,fl+6.2,purple);
  for(let u=-hu+1,k=0;u<hu-1.4;u+=1.6,k++)if(k%2===0)S.box(f,u,u+.8,hv,hv+.35,fl+6.2,fl+6.8,purple);
  for(const u of [-hu+4.5,hu-4.5]){S.box(f,u-1.3,u+1.3,hv+.35,hv+.4,fl,fl+2.6,lin(0x0d0a12),{top:false});S.poly([f(u-1.3,hv+.4,fl+2.6),f(u+1.3,hv+.4,fl+2.6),f(u,hv+.4,fl+3.4)],lin(0x0d0a12),unit(sub(f(0,1,0),f(0,0,0))));}
  board(f(0,hv+.47,fl+4.6),unit(sub(f(0,1,0),f(0,0,0))),5,1.03,'fantasma');
  for(let u=-hu+1.2;u<hu-1;u+=mobile?1.2:.6){const p=f(u,hv+.45,fl+6.05),gr=Math.round(u*1.7)%2===0;L.bulb(p,.1,gr?lin(0x6aff5a):lin(0xb86cff),[2.6,.6,(u+hu)/H.w*1.5]);}
  sprites.push({p:f(0,hv+.6,fl+4.6),c:lin(0x8aff7a),i:.8,s:.4});}
 {const H=PARK.lanchonete,[x,y]=at(H.at),f=frame(x,y,0,H.heading),hu=H.w/2,hv=H.d/2,[mn,mx]=footing(f,hu,hv),fl=mx+.15;
  S.box(f,-hu,hu,-hv,hv,mn-.5,fl+3.2,lin(0xece2cc),{top:false});S.box(f,-hu+1.2,hu-1.2,hv-.02,hv+.02,fl+1.1,fl+2.3,lin(0x2b2f35),{top:false,ends:false});
  S.box(f,-hu+1,hu-1,hv,hv+1.4,fl+2.35,fl+2.5,lin(0xd8262c),{bottom:true});
  hipRoof(S,f,hu+.5,hv+.5,fl+3.2,2.2,i=>i%2?lin(0x7a4a2e):lin(0x6e4128),{stripe:2,soffit:lin(0x5a3a26)});
  for(let u=-hu+1.1;u<hu-1;u+=mobile?1.4:.7)L.bulb(f(u,hv+1.42,fl+2.42),.08,lin(0xfff0c8),[1.1,.5,(u+hu)*.2]);}
 {const H=PARK.galpao,[x,y]=at(H.at),f=frame(x,y,0,H.heading),hu=H.w/2,hv=H.d/2,[mn,mx]=footing(f,hu,hv);
  S.box(f,-hu,hu,-hv,hv,mn-.5,mx+3.4,lin(0xb9b4aa),{top:false});hipRoof(S,f,hu+.3,hv+.3,mx+3.4,1.3,lin(0x8f9399),{soffit:lin(0x6f7378)});}
}
function gate(K){
 const {T,gAt,mobile,sprites,at,board,signFaces}=K,Gt=PARK.gate,[gx,gy]=at(Gt.at),f=frame(gx,gy,0,Gt.heading),S=T.paint,L=T.bulbs;S.bone=0;
 const red=lin(0xd8262c),yellow=lin(0xf2c518),blue=lin(0x173a93);
 let zb=-Infinity;
 for(const u of [-4.6,4.6]){const p=f(u,0,0),g=gAt(p[0],p[1]);zb=Math.max(zb,g+5.6);
  S.box(f,u-.65,u+.65,-.65,.65,g-.5,g+6.6,red);for(const z of [1.4,3.4,5.4])S.box(f,u-.7,u+.7,-.7,.7,g+z,g+z+.3,yellow);
  hipRoof(S,frame(...p.slice(0,2),g+6.6,Gt.heading),.8,.8,0,.9,yellow,{soffit:yellow});
  for(let z=g+.8;z<g+6.3;z+=.55)for(const v of [.7,-.7])L.bulb(f(u,v,z),.09,lin(0xffd23a),[1.4,.45,-(z-g)/4]);
  L.bulb(f(u,0,g+7.6),.2,lin(0xff3b3b),[.8,.5,u>0?.5:0]);sprites.push({p:f(u,0,g+7.6),c:lin(0xff3b3b),i:1.2,s:.2,blink:[.8,.5],ph:u>0?.5:0});}
 S.box(f,-5.3,5.3,-.45,.45,zb,zb+.7,blue,{bottom:true});
 // The name board on top (front to the avenue, VOLTE SEMPRE! inside), its frame and bulbs chasing round it.
 const bw=11,bh=2.15,z0=zb+.75;
 S.box(f,-bw/2-.18,bw/2+.18,-.12,.12,z0-.1,z0+bh+.18,lin(0xd8262c),{bottom:true});
 signFaces(f(bw/2,.13,z0),f(-bw/2,.13,z0),f(-bw/2,.13,z0+bh),f(bw/2,.13,z0+bh),'nome',unit(sub(f(0,1,0),f(0,0,0))),'volte',.26);
 const per=2*(bw+bh),nb=Math.round(per/(mobile?.9:.45));
 for(let k=0;k<nb;k++){let s=k/nb*per,u,z;if(s<bw){u=-bw/2+s;z=z0-.05;}else if((s-=bw)<bh){u=bw/2+.1;z=z0+s;}else if((s-=bh)<bw){u=bw/2-s;z=z0+bh+.1;}else{s-=bw;u=-bw/2-.1;z=z0+bh-s;}
  for(const v of mobile?[.2]:[.2,-.2]){const p=f(u,v,z),c=k%2?lin(0xffd23a):lin(0xfff4dc);L.bulb(p,.1,c,[1.6,.5,k/nb*8]);if(v>0&&k%3===0)sprites.push({p,c,i:.8,s:.12,blink:[1.6,.5],ph:k/nb*8});}}
 // The ticket office beside it, inside the fence.
 {const fb=frame(...f(9.5,-3,0).slice(0,2),0,Gt.heading),g=gAt(...f(9.5,-3,0).slice(0,2));S.box(fb,-2,2,-1.5,1.5,g-.3,g+2.9,lin(0xf4f4f0));S.box(fb,-1.7,1.7,1.48,1.52,g+1,g+2.1,lin(0x2b2f35),{top:false});
  S.box(fb,-2.4,2.4,-1.9,2.1,g+2.9,g+3.15,lin(0xf2c518),{bottom:true});board(fb(0,1.6,g+3.6),unit(sub(f(0,1,0),f(0,0,0))),2.4,.5,'bilheteria');}
}
function totem(K){
 const {T,gAt,mobile,sprites,at,lapDir,signFaces}=K,[tx,ty]=at(PARK.totem.at),o=lapDir(tx,ty),r=[-o[1],o[0]],S=T.paint,L=T.bulbs;S.bone=0;
 const g=gAt(tx,ty),bw=8,bh=3.1,z0=g+6.1,P=(x,z,k=0)=>[tx+r[0]*x+o[0]*k,ty+r[1]*x+o[1]*k,z];
 for(const s of [-1,1])S.post([...P(s*2.9,0).slice(0,2),gAt(...P(s*2.9,0).slice(0,2))-.5],P(s*2.9,z0+bh+.3),.24,.2,8,lin(0xd9d6cc));
 S.box((u,v,z)=>P(u,z,v),-bw/2-.2,bw/2+.2,-.14,.14,z0-.2,z0+bh+.2,lin(0xd8262c),{bottom:true});
 signFaces(P(-bw/2,z0,.15),P(bw/2,z0,.15),P(bw/2,z0+bh,.15),P(-bw/2,z0+bh,.15),'totem',[o[0],o[1],0],'totem',.3);
 const per=2*(bw+bh),nb=Math.round(per/(mobile?.9:.45));
 for(let k=0;k<nb;k++){let s=k/nb*per,u,z;if(s<bw){u=-bw/2+s;z=z0-.08;}else if((s-=bw)<bh){u=bw/2+.12;z=z0+s;}else if((s-=bh)<bw){u=bw/2-s;z=z0+bh+.12;}else{s-=bw;u=-bw/2-.12;z=z0+bh-s;}
  for(const k2 of mobile?[.22]:[.22,-.22]){const p=P(u,z,k2),c=k%2?lin(0xffd23a):lin(0xff3b3b);L.bulb(p,.1,c,[1.2,.5,k/nb*6]);if(k2>0&&k%3===0)sprites.push({p,c,i:.8,s:.12,blink:[1.2,.5],ph:k/nb*6});}}
}
function polesAndFestoons(K){
 const {T,gAt,mobile,sprites,at,rand}=K,S=T.paint,L=T.bulbs;S.bone=0;
 const tops=PARK.poles.map(q=>{const [x,y]=at(q),g=gAt(x,y);S.post([x,y,g-.4],[x,y,g+9.5],.16,.1,6,lin(0x8f9399));
  for(const a of [0,Math.PI]){const h=[x+Math.cos(a+.6)*.55,y+Math.sin(a+.6)*.55,g+9.3];S.box(frame(h[0],h[1],0,a+.6),-.3,.3,-.25,.25,h[2]-.2,h[2]+.15,lin(0x3a3f45),{bottom:true});L.bulb([h[0],h[1],h[2]-.24],.18,lin(0xfff4dc),[0,1,0],.06);sprites.push({p:[h[0],h[1],h[2]-.3],c:lin(0xffe8c0),i:1.6,s:.35});}
  return [x,y,g+6.4];});
 const cols=[0xff3b3b,0xffd23a,0x45ff6a,0x3ac8ff,0xfff4dc].map(h=>lin(h));
 for(const [i,j] of PARK.festoons){const a=tops[i],b=tops[j],len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.round(len/(mobile?1.6:.8)),sag=len*.05,P=t=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)-sag*4*t*(1-t)];
  for(let k=0;k<n;k++){S.post(P(k/n),P((k+1)/n),.015,.015,3,lin(0x24272b),{top:false});if(k)L.bulb(P(k/n),.09,cols[k%5],[.9+rand()*.9,.7,rand()]);}}
}
// The railing round the outline (0.6 m in), panel by panel between posts, the gate's gap left open.
function railing(K,outline){
 const {T,gAt,at}=K,S=T.paint;S.bone=0;let cx=0,cy=0;for(const p of outline){cx+=p[0]/outline.length;cy+=p[1]/outline.length;}
 const pts=outline.map(p=>{const d=Math.hypot(p[0]-cx,p[1]-cy)||1;return [cx+(p[0]-cx)*(1-.6/d),cy+(p[1]-cy)*(1-.6/d)];}),[gx,gy]=at(PARK.gate.at),uv=signUv('grade'),v0=uv[0][1],v1=uv[2][1];
 let s=0,panels=0;
 for(let i=0;i+1<pts.length;i++){const a=pts[i],b=pts[i+1],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<.05)continue;const n=Math.ceil(len/2.6);
  for(let j=0;j<n;j++){const p=[lerp(a[0],b[0],j/n),lerp(a[1],b[1],j/n)],q=[lerp(a[0],b[0],(j+1)/n),lerp(a[1],b[1],(j+1)/n)],l=len/n,m=[(p[0]+q[0])/2,(p[1]+q[1])/2];
   if(Math.hypot(m[0]-gx,m[1]-gy)<5.4){s+=l;continue;}
   const gp=gAt(p[0],p[1]),gq=gAt(q[0],q[1]);
   T.signs.quad([p[0],p[1],gp+.04],[q[0],q[1],gq+.04],[q[0],q[1],gq+2],[p[0],p[1],gp+2],[1,1,1],null,[[s/RAIL,v0],[(s+l)/RAIL,v0],[(s+l)/RAIL,v1],[s/RAIL,v1]]);
   S.post([p[0],p[1],gp-.3],[p[0],p[1],gp+2.1],.06,.06,4,lin(0x2b62a8));s+=l;panels++;}
 }
 return panels;
}
// The paving laid over the ground inside the outline: concrete flags with a weathered tone, the garden's lawn and the
// train's ballast ring (its own mesh, pulled toward the eye so it never fights the terrain).
function paving(K,outline,lawn){
 const {T,gAt,mobile}=K,B=T.paving,step=mobile?3:2;
 let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;for(const p of outline){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);}
 const col=(x,y)=>{const d=Math.hypot(x-lawn.x,y-lawn.y),n=fbm(x/6,y/6),k=.82+.3*n;if(d<12.3)return mul(lin(0x4f7a32),.85+.3*fbm(x/2.5,y/2.5));if(d<14.9)return mul(lin(0x8d857a),k);return mul(lin(0x7c776e),k*(.94+.1*noise(x*.9,y*.9)));};
 const Z=(x,y)=>gAt(x,y)+.06;let cells=0;
 for(let x=Math.floor(x0/step)*step;x<x1;x+=step)for(let y=Math.floor(y0/step)*step;y<y1;y+=step){
  if(!inside(x+step/2,y+step/2,outline))continue;const a=[x,y,Z(x,y)],b=[x+step,y,Z(x+step,y)],c=[x+step,y+step,Z(x+step,y+step)],d=[x,y+step,Z(x,y+step)];
  B.tri(a,b,c,p=>col(p[0],p[1]));B.tri(a,c,d,p=>col(p[0],p[1]));cells++;
 }
 return cells;
}

// ================================================================ The park
const BUILDERS=[ferrisWheel,dropTower,cataclisma,carousel,gardenTrain,caterpillar,teacups,autopista];
export const pampulhaGuanabara={current:null};

export function createPampulhaGuanabara(data,{ground,mobile=false}={}){
 const root=new THREE.Group();root.name='Marcos_Pampulha_Guanabara';
 const mark=(data.scenery?.landmarks??[]).find(m=>m.kind==='parque_guanabara'),stats={landmark:!!mark,mobile};
 if(!mark?.outline?.length)return {root,obstacles:[],clearings:[],stats,update(){}};
 const gridAt=(x,y)=>{const g=ground?.(x,y);if(g!=null&&Number.isFinite(g))return g;return gridHeight(data.terrain,x,y)??mark.ground??0;};
 const dx=(mark.x??REF[0])-REF[0],dy=(mark.y??REF[1])-REF[1],at=p=>[p[0]+dx,p[1]+dy];
 const lap=lapSpace(data),rand=random(9071),S=data.samples;
 const lapDir=(x,y)=>{let best=null,bd=Infinity;for(const p of S){const d=(p[1]-x)**2+(p[2]-y)**2;if(d<bd){bd=d;best=p;}}const l=Math.sqrt(bd)||1;return [(best[1]-x)/l,(best[2]-y)/l];};
 const T={paint:new Batch(),bulbs:new Batch(),signs:new Batch(),paving:new Batch()};
 // Bones: the root (everything that stands) and one per moving part, each at its pivot (a track point) at rest.
 const bones=[],sprites=[],boneRoot=new THREE.Bone();boneRoot.name='Guanabara_raiz';boneRoot.userData.pivot=[0,0,0];boneRoot.userData.rest=new THREE.Vector3();bones.push(boneRoot);root.add(boneRoot);
 const addBone=(name,parent,pivot)=>{const pb=bones[parent],b=new THREE.Bone(),pp=pb.userData.pivot;b.name='Guanabara_'+name;b.position.set(pivot[0]-pp[0],pivot[2]-pp[2],-(pivot[1]-pp[1]));b.userData.pivot=pivot;b.userData.rest=b.position.clone();pb.add(b);bones.push(b);return bones.length-1;};
 // A sign: the atlas rectangle on quad a-b-c-d (bottom left, bottom right, top right, top left as read from the side
 // `o` points to: the reader's right is [-o[1], o[0]], as in board); signFaces adds the back's own (read from behind,
 // mirrored right), back = another key or the same, depth metres behind the front.
 const signQuad=(a,b,c,d,key,o)=>T.signs.quad(a,b,c,d,[1,1,1],o,signUv(key));
 const signFaces=(a,b,c,d,key,o,back=null,depth=0)=>{signQuad(a,b,c,d,key,o);if(back){const k=mul(o,depth);signQuad(sub(b,k),sub(a,k),sub(d,k),sub(c,k),back,mul(o,-1));}};
 const board=(c,o,w,h,key)=>{const r=[-o[1],o[0]],p=(x,z,k)=>[c[0]+r[0]*x-o[0]*k,c[1]+r[1]*x-o[1]*k,c[2]+z];signQuad(p(-w/2,-h/2,0),p(w/2,-h/2,0),p(w/2,h/2,0),p(-w/2,h/2,0),key,o);
  T.paint.box((u,v,z)=>p(u,z,v),-w/2-.06,w/2+.06,.02,.1,-h/2-.06,h/2+.06,lin(0x30343a),{bottom:true});};
 const K={T,gAt:gridAt,mobile,addBone,bones,sprites,at,board,signFaces,lapDir,rand,paving:T.paving};
 const rides=[],built={},tris={},count=()=>T.paint.triangles+T.bulbs.triangles+T.signs.triangles;
 for(const build of BUILDERS){const before=count();try{const r=build(K);if(r){rides.push(r);tris[r.name]=count()-before;}}catch(e){console.warn('Parque Guanabara: brinquedo não montado:',build.name,e);built[build.name]={error:String(e)};}}
 for(const [name,fn] of [['barcos',bumperBoats],['pavilhoes',halls],['portao',gate],['placa',totem],['postes',polesAndFestoons]]){const before=count();try{fn(K);tris[name]=count()-before;}catch(e){console.warn('Parque Guanabara: não montado:',name,e);built[name]={error:String(e)};}}
 const outline=mark.outline.map(at);
 let panels=0,cells=0;try{panels=railing(K,outline);cells=paving(K,outline,rides.find(r=>r.lawn)?.lawn??{x:1e9,y:1e9});}catch(e){console.warn('Parque Guanabara: chão e grade não montados:',e);built.chao={error:String(e)};}
 // The skeleton from the rest pose; one skinned mesh per material sharing it (the bounds cover every pose).
 root.updateMatrixWorld(true);
 const skeleton=new THREE.Skeleton(bones),c0=outline.reduce((s,p)=>[s[0]+p[0]/outline.length,s[1]+p[1]/outline.length],[0,0]);
 const sphere=new THREE.Sphere(new THREE.Vector3(c0[0],(mark.ground??10)+25,-c0[1]),Math.max(...outline.map(p=>Math.hypot(p[0]-c0[0],p[1]-c0[1])))+70);
 const glow={uGbTime:{value:0},uGbOff:{value:.22},uGbGain:{value:2}};
 const atlas=signsTexture(),materials={
  paint:new THREE.MeshStandardMaterial({name:'Guanabara_pintura',vertexColors:true,roughness:.5,metalness:.1}),
  bulbs:bulbMaterial(glow),signs:signsMaterial(atlas),
  paving:new THREE.MeshStandardMaterial({name:'Guanabara_piso',vertexColors:true,roughness:.92,metalness:0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4})
 };
 const skinned=(b,name,mat,shadow)=>{const m=new THREE.SkinnedMesh(b.geometry({skin:true,blink:mat===materials.bulbs}),mat);m.name=name;m.bind(skeleton,new THREE.Matrix4());m.boundingSphere=sphere.clone();m.castShadow=shadow;m.receiveShadow=!(mat===materials.bulbs);m.matrixAutoUpdate=false;return m;};
 const plain=(b,name,mat,shadow)=>{const m=new THREE.Mesh(b.geometry(),mat);m.name=name;m.castShadow=shadow;m.receiveShadow=true;m.matrixAutoUpdate=false;return m;};
 let drawCalls=0,triangles=0;const parts={};
 for(const [k,mesh] of [['paint',T.paint.vertices&&skinned(T.paint,'Guanabara_pintura',materials.paint,true)],['bulbs',T.bulbs.vertices&&skinned(T.bulbs,'Guanabara_lampadas',materials.bulbs,false)],
  ['signs',T.signs.vertices&&plain(T.signs,'Guanabara_placas',materials.signs,true)],['paving',T.paving.vertices&&plain(T.paving,'Guanabara_piso',materials.paving,false)]]){if(!mesh)continue;root.add(mesh);drawCalls++;triangles+=T[k].triangles;parts[k]=T[k].triangles;}
 // Driving space: no vertex in the lap's asphalt and walls (up to DRIVE m over the road), the standing ones once, the
 // moving ones over ten poses of every ride's motion (a part whose reach meets no cell of the lap's space in a pose
 // is passed over there: none of its vertices could be tested in one).
 const drive={checked:0,violations:0,worst:null,where:{},poses:10};
 const test=(x,y,z,k)=>{drive.checked++;for(const h of lap.at(x,y)){const over=z-h.road;if(Math.abs(h.lat)<h.back+.3&&over>-.05&&over<DRIVE){drive.violations++;const key=k+'@'+Math.round(h.s/10)*10;drive.where[key]=(drive.where[key]??0)+1;if(!drive.worst||Math.abs(h.lat)<Math.abs(drive.worst.lat))drive.worst={material:k,s:+h.s.toFixed(1),lat:+h.lat.toFixed(2),over:+over.toFixed(2),x:+x.toFixed(1),y:+y.toFixed(1)};}}};
 for(const [k,b] of Object.entries(T))for(let v=0;v<b.p.length;v+=3)if(!b.b[v/3])test(b.p[v],-b.p[v+2],b.p[v+1],k);
 {const M=bones.map(()=>new THREE.Matrix4()),v=new THREE.Vector3(),reach=bones.map(()=>0),pivots=bones.map(b=>v3(b.userData.pivot)),near=bones.map(()=>false);
  for(const b of Object.values(T))for(let i=0;i<b.b.length;i++){const j=b.b[i];if(j)reach[j]=Math.max(reach[j],v.set(b.p[i*3],b.p[i*3+1],b.p[i*3+2]).distanceTo(pivots[j]));}
  drive.swept=0;
  for(let s=0;s<drive.poses;s++){for(const r of rides)r.sample(s/drive.poses);boneRoot.updateMatrixWorld(true);
   bones.forEach((b,i)=>{M[i].multiplyMatrices(b.matrixWorld,skeleton.boneInverses[i]);v.setFromMatrixPosition(b.matrixWorld);near[i]=i>0&&lap.any(v.x,-v.z,reach[i]+1);});
   for(const [k,b] of Object.entries(T))for(let i=0;i<b.b.length;i++)if(near[b.b[i]]){v.set(b.p[i*3],b.p[i*3+1],b.p[i*3+2]).applyMatrix4(M[b.b[i]]);test(v.x,-v.z,v.y,k);drive.swept++;}}}
 // What stands outside the outline (a layout check): each ride's and building's footprint corners.
 const outside=[];for(const [k,p] of [['roda',PARK.wheel.at],['elevador',PARK.tower.at],['cataclisma',PARK.cataclisma.at],['carrossel',PARK.carousel.at],['jardim',PARK.garden.at],['lagarta',PARK.caterpillar.at],['totem',PARK.totem.at]]){const q=at(p);if(!inside(q[0],q[1],outline))outside.push(k);}
 // Trees out of the park and a band round it, and along the sight lines from the lap's stretch beside it (s 900-1300,
 // every 40 m) to the wheel's hub and the tower's top: they stand over the woods as from the avenue.
 const clearings=[];
 {let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;for(const p of outline){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);}
  // Inside it every 7 m; along the railing only what would lean over it (the gardens next door keep their trees).
  for(let x=x0-3;x<=x1+3;x+=7)for(let y=y0-3;y<=y1+3;y+=7)if(inside(x,y,outline))clearings.push({x,y,r:6});
  for(let i=0;i+1<outline.length;i++){const a=outline[i],b=outline[i+1],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/6);for(let j=0;j<n;j++)clearings.push({x:lerp(a[0],b[0],j/n),y:lerp(a[1],b[1],j/n),r:3.5});}
  for(const r of rides)if(r.clear)clearings.push(...r.clear);
  let lines=0;const targets=rides.filter(r=>r.name==='roda'||r.name==='elevador');let last=-1e9;
  for(const p of S){if(p[0]<900||p[0]>1300||p[0]-last<40)continue;last=p[0];for(const t of targets){const ddx=t.hub[0]-p[1],ddy=t.hub[1]-p[2],d=Math.hypot(ddx,ddy);if(d>320)continue;lines++;for(let s=16;s<d-8;s+=10)clearings.push({x:p[1]+ddx/d*s,y:p[2]+ddy/d*s,r:4.5});}}
  stats.sightLines=lines;}
 // After dark: glowing sprites for the far lamps (the moving ones follow their bones), fading in past 45 m where the
 // bulbs themselves get small.
 const night=lightUniforms();night.uGroups.value[0].set(1,1,1,2.2);
 for(const l of sprites){l.g=0;l.on=.02;}
 const glowLights=sprites.length?nightLights(sprites,night,{name:'Guanabara_luzes_noite',minPx:mobile?1.6:1.8,floor:.45,near:[45,95],fogKeep:.45}):null;
 if(glowLights){root.add(glowLights.mesh);drawCalls++;}
 const moving=sprites.map((l,i)=>[l,i]).filter(([l])=>l.bone),restV=moving.map(([l])=>v3(l.p));
 // The rides' clock: each ride runs from it (its own phase); the bones posed each frame.
 let time=7,lit=0;const tmpM=new THREE.Matrix4(),tmpV=new THREE.Vector3();
 const info=()=>Object.fromEntries(rides.map(r=>[r.name,r.info()]));
 function pose(dt){for(const r of rides)r.update(time,dt);boneRoot.updateMatrixWorld(true);}
 pose(0);
 Object.assign(stats,{drawCalls,triangles,trianglesK:Math.round(triangles/1000),parts,perRide:tris,bones:bones.length,bulbs:T.bulbs.triangles/8|0,sprites:sprites.length,driveSpace:drive,outside,
  clearings:clearings.length,railingPanels:panels,pavingCells:cells,built,night:{level:0,lights:sprites.length},rides:info(),time});
 function update(dt,camera){
  time=(time+dt)%7200;glow.uGbTime.value=time;pose(dt);stats.time=+time.toFixed(2);stats.rides=info();
  if(lit>0&&glowLights){night.uTime.value=time;night.uScreen.value=screenHalf(mobile);
   if(!camera||camera.position.distanceTo(sphere.center)<3000){const pos=glowLights.positions;moving.forEach(([l,i],k)=>{const b=bones[l.bone];tmpM.multiplyMatrices(b.matrixWorld,skeleton.boneInverses[l.bone]);tmpV.copy(restV[k]).applyMatrix4(tmpM);pos[i*3]=tmpV.x;pos[i*3+1]=tmpV.y;pos[i*3+2]=tmpV.z;});glowLights.update();}}
 }
 // 0 by day (the bulbs lit all the same, a little bloom); dusk (.45) and night: brighter, the sprites on, the boards lit.
 function setNight(level){lit=level;night.uNight.value=level;stats.night.level=level;glow.uGbGain.value=lerp(2,5.5,level);materials.signs.emissiveIntensity=.12+.75*level;if(glowLights)glowLights.mesh.visible=level>0;}
 root.updateMatrixWorld(true);
 const extra={root,obstacles:[],clearings,stats,update,setNight};
 pampulhaGuanabara.current={...extra,setTime(t){time=t;for(const r of rides)r.update(t,0);boneRoot.updateMatrixWorld(true);stats.rides=info();},rides:info};
 return extra;
}
// Whether a track file carries the park (main.js builds it then).
export const hasPampulhaGuanabara=data=>(data.scenery?.landmarks??[]).some(m=>m.kind==='parque_guanabara');
