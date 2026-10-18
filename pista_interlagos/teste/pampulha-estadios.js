import * as THREE from 'three';
import {canvasTexture} from './pit-textures.js';
import {guardrailClearance,guardrailPresent,addRoamSolids} from './physics.js';
import {chainLinkMaterial} from './interlagos-pit.js';
import {lightUniforms,nightLights,screenHalf} from './sea-water.js';

// The Mineirão and the Mineirinho beside the Circuito da Pampulha's start (data.scenery.landmarks kinds 'mineirao' and
// 'mineirinho', gerar_pampulha.py: BHGeo footprints with the 2015 laser heights). Measured on the city's 2015
// orthophoto (BHGeo ORTOFOTO_2015, 20 cm sheets) and drawn from the published facts (research 2026-10-17):
// - mineirao: Estádio Governador Magalhães Pinto (Eduardo Mendes Guimarães Jr. and Gaspar Garreto, 1965; renovated by
//   BCMF for the 2014 World Cup). The cadastre's footprint is the whole esplanade, so the bowl is the photo's: a
//   pseudo-ellipse 276 × 217 m to the roof's edge (Wikipedia: 275 × 217), its long axis 79° from east, and the rings
//   inside it nearly parallel to that edge: the concrete roof 26.5 m deep, the 2013 white membrane on to 52 m in, the
//   floor 55 m in (an 83 × 54 m ellipse round the 105 × 68 m pitch). Round the outside the 88 concrete semi-porticos,
//   blades leaning outward as they rise and standing over the roof's edge in the sawtooth crown, the upper tier's back
//   in big board-marked panels between them, the open circulation decks below. On the roof the solar plant in its
//   radial bays. Heights from the laser: the roof 29 m over the pitch (the cadastre's typical roof, 68.8 m local).
//   Since round 1b the bowl stands on the track file's flat pad (pitch and plaza at the landmark's ground) and the
//   car drives in (meta.roam zone 'mineirao', landmark.stadium): the ground floor glazed on the solid's façade
//   ellipse (130 × 100 m), the porticos' feet outside it solids of their own, the wall round the floor on its inner
//   ellipse (83 × 53.5 m), and an invented drive-in tunnel on the solid's corridor (10 × 5.2 m, out of the west
//   façade toward the straight): a portal block lettered MINEIRÃO, a lit concrete tube with its signs under the
//   stands, an open cutting through the lower tier onto the floor. An arch over the gap in the straight's wall and a
//   board before it lead the way; the zone's fence across the old carriageway is a real closure (Jersey blocks,
//   chain link, DESVIO).
// - mineirinho: Ginásio Jornalista Felipe Drummond (1980): a 143.5 m drum (the cadastre's circle) under a shallow
//   roof of 48 radial ribs (the photo) round a hexagonal lantern; 48 slender pillars up the façade, each pair holding
//   one of the scalloped hoods of the crown (the stands' back, painted ochre inside), the open floors below in
//   balcony bands; footbridges from the hill to the north and east. Its base is the lowest ground round it (the lake
//   side), the roof's edge and the lantern at the cadastre's typical and top heights over it.
// Everything is merged per material (a draw call each); nothing enters the lap's driving space or the pit lane, its
// walls and garages (checked per vertex). After dark (setNight) the floodlights under the membrane's inner edge come
// on with the lit pitch and the membrane glowing, the façade's open decks and the Mineirinho's hoods warm.

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
function gridHeight(g,x,y){
 if(!g)return null;const fx=(x-g.x0)/g.step,fy=(y-g.y0)/g.step;if(fx<0||fy<0||fx>g.nx-1||fy>g.ny-1)return null;
 const i=Math.min(g.nx-2,Math.floor(fx)),j=Math.min(g.ny-2,Math.floor(fy)),u=fx-i,v=fy-j,k=j*g.nx+i;
 return (g.z[k]*(1-u)+g.z[k+1]*u)*(1-v)+(g.z[k+g.nx]*(1-u)+g.z[k+g.nx+1]*u)*v;
}
function inside(x,y,pts){let c=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[i],b=pts[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}

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
 // A convex polygon as a fan facing out (Newell's normal), uvs alongside or none.
 fan(pts,col,out,uvs){
  if(pts.length<3)return;let nx=0,ny=0,nz=0;for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];nx+=(p[1]-q[1])*(p[2]+q[2]);ny+=(p[2]-q[2])*(p[0]+q[0]);nz+=(p[0]-q[0])*(p[1]+q[1]);}
  if(out&&nx*out[0]+ny*out[1]+nz*out[2]<0){pts=[...pts].reverse();if(uvs)uvs=[...uvs].reverse();}
  for(let i=1;i+1<pts.length;i++)this.tri(pts[0],pts[i],pts[i+1],col,uvs&&[uvs[0],uvs[i],uvs[i+1]]);
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

// ---------- Materials
const NOISE=`float peH(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float peN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(peH(i),peH(i+vec2(1,0)),f.x),mix(peH(i+vec2(0,1)),peH(i+vec2(1,1)),f.x),f.y);}`;
// Exposed concrete: the formwork texture, broad blotches and rain streaks from the world position (the repeat never
// shows over a 280 m façade), tinted per part by the vertex colours.
function concreteMaterial(name,map,{grime=.24,seed=0,rough=.92,night={uPeFacade:{value:0}}}={}){
 const m=new THREE.MeshStandardMaterial({name,map,vertexColors:true,roughness:rough,metalness:0});
 const f=x=>x.toFixed(3);
 m.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,night);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vPePos;varying vec3 vPeN;')
   .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvPePos=(modelMatrix*vec4(transformed,1.)).xyz;vPeN=normalize(mat3(modelMatrix)*objectNormal);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vPePos;varying vec3 vPeN;uniform float uPeFacade;
${NOISE}`).replace('#include <color_fragment>',`#include <color_fragment>
{vec3 n=normalize(vPeN);float side=1.-abs(n.y);vec2 q=abs(n.y)>.7?vPePos.xz:(abs(n.x)>abs(n.z)?vec2(vPePos.z,vPePos.y):vec2(vPePos.x,vPePos.y));
float blot=peN(q*.05+${f(seed*3.1)})*.6+peN(q*.23)*.4;float streak=smoothstep(.45,.9,peN(vec2(q.x*1.1,vPePos.y*.025+${f(seed)})));
diffuseColor.rgb*=(.86+.24*blot)*(1.-${f(grime)}*streak*side);}`)
   // After dark the walls take the façade lights' warm wash (their own colour; the roofs stay dark).
   .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*vec3(1.,.86,.68)*uPeFacade*(1.-abs(normalize(vPeN).y));');
 };
 m.customProgramCacheKey=()=>'pampulha-estadios-v1-'+name;
 return m;
}
// Openings and glass that glow warm after dark: by day their vertex colour, at night that colour's brightness times
// the warm light (uGlow 0..1), so each bay keeps its own tone. Near-white vertex colours are lamps: always on (the
// tunnel's strips, the portal's frame of light).
function litMaterial(name,glow){
 const m=new THREE.MeshStandardMaterial({name,vertexColors:true,roughness:.55,metalness:.15});
 m.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,glow);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uPeGlow;uniform vec3 uPeWarm;')
   .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n#ifdef USE_COLOR\nfloat peLum=dot(vColor.rgb,vec3(.3333));totalEmissiveRadiance+=uPeWarm*(peLum*uPeGlow)+vColor.rgb*smoothstep(.85,.95,peLum)*2.4;\n#endif');
 };
 m.customProgramCacheKey=()=>'pampulha-estadios-lit-v2-'+name;
 return m;
}

// The membrane: white PTFE; after dark it glows with the floodlights' spill, most on its underside (emissiveIntensity
// set by setNight).
function membraneMaterial(){
 const m=new THREE.MeshStandardMaterial({name:'Estadios_membrana',vertexColors:true,roughness:.6,metalness:0,emissive:0xfff6e8,emissiveIntensity:0});
 m.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float vPeUp;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvPeUp=normalize(mat3(modelMatrix)*objectNormal).y;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vPeUp;').replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance*=mix(.3,1.,smoothstep(.2,-.6,vPeUp));');
 };
 m.customProgramCacheKey=()=>'pampulha-estadios-membrana-v1';
 return m;
}

// ---------- Textures (canvas; one repeat each)
const wrap=(w,h,x,y,s,fn)=>{for(const dx of [-w,0,w])for(const dy of [-h,0,h])if(x+dx+s>0&&x+dx-s<w&&y+dy+s>0&&y+dy-s<h)fn(x+dx,y+dy);};
function grain(ctx,amount,r){const img=ctx.getImageData(0,0,ctx.canvas.width,ctx.canvas.height),d=img.data;for(let i=0;i<d.length;i+=4){const n=(r()-.5)*amount;d[i]+=n;d[i+1]+=n;d[i+2]+=n;}ctx.putImageData(img,0,0);}
function blotches(ctx,w,h,r,count,light,dark,size,alpha){for(let k=0;k<count;k++){const x=r()*w,y=r()*h,s=size*(.3+r()),c=r()<.5?light:dark,a=alpha*(.4+r());wrap(w,h,x,y,s,(px,py)=>{const g=ctx.createRadialGradient(px,py,0,px,py,s);g.addColorStop(0,`rgba(${c},${a})`);g.addColorStop(1,`rgba(${c},0)`);ctx.fillStyle=g;ctx.fillRect(px-s,py-s,2*s,2*s);});}}
const SIGNS={mineirao:[0,0,1024,190],acesso:[0,190,1024,340],saida:[0,340,1024,490],entrada:[0,490,1024,610],desvio:[0,610,512,802],retorno:[512,610,1024,802],seta:[0,802,512,1058]};
const TEX={
 // Board-marked concrete (8 m): 0.6 m boards each its own tone, their joints, the form ties' holes, pour patches.
 concrete:()=>canvasTexture((ctx,w,h)=>{
  const r=random(7),m=w/8;ctx.fillStyle='#d9d6ce';ctx.fillRect(0,0,w,h);
  for(let y=0,k=0;y<h;y+=.6*m,k++){const v=200+r()*30|0;ctx.fillStyle=`rgba(${v},${v-3},${v-10},.35)`;ctx.fillRect(0,y,w,.6*m);ctx.fillStyle='rgba(60,58,52,.16)';ctx.fillRect(0,y,w,1.5);
   ctx.fillStyle='rgba(60,58,52,.08)';for(let x=r()*2.4*m;x<w;x+=2.4*m)ctx.fillRect(x,y,1.5,.6*m);}
  ctx.fillStyle='rgba(50,48,44,.3)';for(let y=.3*m;y<h;y+=1.2*m)for(let x=.4*m;x<w;x+=1.2*m){ctx.beginPath();ctx.arc(x,y,2,0,2*Math.PI);ctx.fill();}
  blotches(ctx,w,h,r,70,'255,255,248','70,68,62',80,.07);grain(ctx,18,r);
 },512,512,true),
 // Seats (one bay wide, 8 rows): the aisle's steps on the left, the rows of seat backs over concrete treads, the
 // riser's shadow under each row; vertex colours tint the seats per sector.
 seats:()=>canvasTexture((ctx,w,h)=>{
  const r=random(23),rows=8,rh=h/rows,aisle=w*.11;ctx.fillStyle='#8c8a86';ctx.fillRect(0,0,w,h);
  for(let j=0;j<rows;j++){const y=j*rh;
   ctx.fillStyle='#b9b6ae';ctx.fillRect(0,y,w,rh*.42);ctx.fillStyle='rgba(30,30,30,.55)';ctx.fillRect(0,y+rh*.92,w,rh*.08);
   for(let x=aisle+2;x<w-6;x+=w*.055){const k=.82+r()*.3,v=[178*k,180*k,184*k].map(c=>c|0);ctx.fillStyle=`rgb(${v})`;ctx.beginPath();ctx.roundRect(x,y+rh*.38,w*.046,rh*.5,3);ctx.fill();ctx.fillStyle='rgba(20,20,20,.35)';ctx.fillRect(x,y+rh*.84,w*.046,rh*.06);}
   ctx.fillStyle='#c7c4bc';ctx.fillRect(0,y,aisle,rh);ctx.fillStyle='#d7d4cc';ctx.fillRect(0,y+rh/2,aisle,rh*.08);ctx.fillRect(0,y,aisle,rh*.08);
   ctx.fillStyle='#e7c21a';ctx.fillRect(0,y,aisle,2);ctx.fillRect(0,y+rh/2,aisle,2);
  }
  blotches(ctx,w,h,r,30,'240,240,236','40,40,40',30,.05);grain(ctx,10,r);
 },256,256,true),
 // The pitch (120 × 80 m at 10 px per metre): the mowing stripes over the 105 × 68 m field and its markings, the
 // run-off round it plain (the texture clamps there).
 pitch:()=>{const t=canvasTexture((ctx,w,h)=>{
  const r=random(41),m=w/120,ox=7.5*m,oy=6*m,L=105*m,W=68*m;
  ctx.fillStyle='#3c7a2c';ctx.fillRect(0,0,w,h);
  for(let k=0;k<18;k++){ctx.fillStyle=k%2?'#4a8c37':'#3e7f2f';ctx.fillRect(ox-1.5*m+k*(L+3*m)/18,oy-1.5*m,(L+3*m)/18+1,W+3*m);}
  blotches(ctx,w,h,r,60,'120,160,70','30,60,20',40,.06);
  // Worn goalmouths.
  for(const x of [ox+3*m,ox+L-3*m]){const g=ctx.createRadialGradient(x,h/2,0,x,h/2,6*m);g.addColorStop(0,'rgba(110,105,60,.35)');g.addColorStop(1,'rgba(110,105,60,0)');ctx.fillStyle=g;ctx.fillRect(x-6*m,h/2-6*m,12*m,12*m);}
  ctx.strokeStyle='rgba(245,245,240,.92)';ctx.lineWidth=Math.max(1.6,.14*m);
  ctx.strokeRect(ox,oy,L,W);ctx.beginPath();ctx.moveTo(ox+L/2,oy);ctx.lineTo(ox+L/2,oy+W);ctx.stroke();
  ctx.beginPath();ctx.arc(ox+L/2,h/2,9.15*m,0,2*Math.PI);ctx.stroke();
  for(const [x,s] of [[ox,1],[ox+L,-1]]){
   ctx.strokeRect(Math.min(x,x+s*16.5*m),h/2-20.16*m,16.5*m,40.32*m);ctx.strokeRect(Math.min(x,x+s*5.5*m),h/2-9.16*m,5.5*m,18.32*m);
   ctx.beginPath();ctx.arc(x+s*11*m,h/2,9.15*m,s>0?-.927:Math.PI-.927,s>0?.927:Math.PI+.927);ctx.stroke();
   ctx.fillStyle='rgba(245,245,240,.92)';ctx.beginPath();ctx.arc(x+s*11*m,h/2,.25*m,0,2*Math.PI);ctx.fill();
   for(const y of [oy,oy+W]){ctx.beginPath();ctx.arc(x,y,1*m,0,2*Math.PI);ctx.stroke();}
  }
  ctx.fillStyle='rgba(245,245,240,.92)';ctx.beginPath();ctx.arc(ox+L/2,h/2,.25*m,0,2*Math.PI);ctx.fill();
  // The run-off's edge in the plain colour the clamp carries out to the stands.
  ctx.strokeStyle='#3c7a2c';ctx.lineWidth=4;ctx.strokeRect(1,1,w-2,h-2);
  grain(ctx,8,r);
 },1200,800,false);t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;return t;},
 // Signs (1024 × 1064 atlas, SIGNS: [x0, y0, x1, y1] px): the name in letters for the portal (cut out of a clear
 // ground), the tunnel's wayfinding (green in, blue out), the arch's board, DESVIO and SEM SAÍDA at the closure,
 // the yellow arrow board on the straight. Invented, no real brands.
 signs:()=>canvasTexture((ctx,w,h)=>{
  ctx.clearRect(0,0,w,h);const B='"Arial Black","Arial Bold",Arial,sans-serif';
  const text=(s,x,y,size,fill,{align='center',max=w}={})=>{ctx.font=`${size}px ${B}`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=fill;ctx.fillText(s,x,y,max);};
  const panel=([x0,y0,x1,y1],bg,edge)=>{ctx.fillStyle=bg;ctx.fillRect(x0,y0,x1-x0,y1-y0);if(edge){ctx.strokeStyle=edge;ctx.lineWidth=6;ctx.strokeRect(x0+9,y0+9,x1-x0-18,y1-y0-18);}};
  // An arrow: shaft and head from (x, y), length l, pointing at angle a (0 = right, -π/2 = up on the canvas).
  const arrow=(x,y,l,a,fill,wd=l*.22)=>{ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(-l/2,-wd/2);ctx.lineTo(l/2-l*.32,-wd/2);ctx.lineTo(l/2-l*.32,-wd*1.35);ctx.lineTo(l/2,0);ctx.lineTo(l/2-l*.32,wd*1.35);ctx.lineTo(l/2-l*.32,wd/2);ctx.lineTo(-l/2,wd/2);ctx.closePath();ctx.fill();ctx.restore();};
  const [mx0,my0,mx1,my1]=SIGNS.mineirao,cy=(my0+my1)/2;
  ctx.font=`150px ${B}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='rgba(38,38,36,1)';ctx.fillText('MINEIRÃO',w/2+5,cy+16,w-40);
  ctx.fillStyle='#f3f0e8';ctx.fillText('MINEIRÃO',w/2,cy+10,w-40);
  panel(SIGNS.acesso,'#11683b','#f4f4f0');text('ACESSO AO GRAMADO',470,265,64,'#ffffff',{max:800});arrow(930,265,90,-Math.PI/2,'#ffffff');
  panel(SIGNS.saida,'#1c4d8c','#f4f4f0');text('SAÍDA · PISTA',450,415,70,'#ffffff',{max:760});arrow(930,415,90,-Math.PI/2,'#ffffff');
  panel(SIGNS.entrada,'#1d2733','#e9c12b');text('MINEIRÃO',330,550,74,'#ffffff',{max:560});text('ENTRADA',760,550,50,'#e9c12b',{max:260});arrow(950,550,80,0,'#e9c12b');
  panel(SIGNS.desvio,'#e8641e','#1b1b1b');text('DESVIO',256,672,92,'#141414',{max:440});for(let k=0;k<5;k++){const x=70+k*90;ctx.fillStyle='#141414';ctx.beginPath();ctx.moveTo(x,730);ctx.lineTo(x+40,760);ctx.lineTo(x,790);ctx.lineTo(x+22,790);ctx.lineTo(x+62,760);ctx.lineTo(x+22,730);ctx.closePath();ctx.fill();}
  panel(SIGNS.retorno,'#b3261e','#f4f4f0');text('SEM SAÍDA',768,690,70,'#ffffff',{max:440});text('VOLTE À ESPLANADA',768,755,34,'#ffffff',{max:440});
  panel(SIGNS.seta,'#f2c21b','#141414');text('MINEIRÃO',256,880,72,'#141414',{max:440});arrow(256,980,300,0,'#141414',58);
 },1024,1064,false)
};

// ---------- The lap's driving space (asphalt and walls, DRIVE metres over the road) and the pit lane with its garages
function lapSpace(data){
 const A=data.samples,N=A.length,CELL=8,cells=new Map(),key=(i,j)=>i*131071+j;
 const st=A.map(p=>{const tl=Math.hypot(p[7],p[8])||1,nl=Math.hypot(p[9],p[10])||1,q={s:p[0],x:p[1],y:p[2],z:p[3],cf:p[5],n:[p[9]/nl,p[10]/nl],back:[0,0]};for(const [k,side] of [[0,-1],[1,1]])q.back[k]=p[4]/2+guardrailClearance(data,p[0],side)+(guardrailPresent(data,p[0],side)?.75:0);q.t=[p[7]/tl,p[8]/tl];return q;});
 for(let i=0;i<N;i++){const p=st[i],q=st[(i+1)%N],r=Math.max(...p.back,...q.back)+2;
  for(let ci=Math.floor((Math.min(p.x,q.x)-r)/CELL);ci<=Math.floor((Math.max(p.x,q.x)+r)/CELL);ci++)for(let cj=Math.floor((Math.min(p.y,q.y)-r)/CELL);cj<=Math.floor((Math.max(p.y,q.y)+r)/CELL);cj++){const k=key(ci,cj);let l=cells.get(k);if(!l)cells.set(k,l=[]);l.push(i);}}
 function at(x,y){
  const list=cells.get(key(Math.floor(x/CELL),Math.floor(y/CELL))),out=[];if(!list)return out;
  for(const i of list){const p=st[i],q=st[(i+1)%N],dx=q.x-p.x,dy=q.y-p.y,l2=dx*dx+dy*dy||1e-9;let u=((x-p.x)*dx+(y-p.y)*dy)/l2;if(u<-.3||u>1.3)continue;u=clamp(u,0,1);
   const nx=lerp(p.n[0],q.n[0],u),ny=lerp(p.n[1],q.n[1],u),lat=(x-p.x-dx*u)*nx+(y-p.y-dy*u)*ny,k=lat>=0?1:0;
   out.push({s:p.s,lat,road:lerp(p.z,q.z,u)+lerp(p.cf,q.cf,u)*lat,back:lerp(p.back[k],q.back[k],u)});}
  return out;
 }
 // The pit lane from its samples: within its lateral bounds (lo..hi, the garages' depth included) plus a margin.
 const pit=data.pit,pc=pit?Object.fromEntries(pit.columns.map((k,i)=>[k,i])):null,ps=pit?.samples??[];
 function inPit(x,y,margin=2){
  for(let i=0;i+1<ps.length;i++){const p=ps[i],q=ps[i+1],dx=q[pc.x]-p[pc.x],dy=q[pc.y]-p[pc.y],l2=dx*dx+dy*dy||1e-9;if(Math.abs(x-p[pc.x])>40&&Math.abs(x-q[pc.x])>40)continue;
   const u=((x-p[pc.x])*dx+(y-p[pc.y])*dy)/l2;if(u<0||u>1)continue;const lx=lerp(p[pc.lx],q[pc.lx],u),ly=lerp(p[pc.ly],q[pc.ly],u),lat=(x-p[pc.x]-dx*u)*lx+(y-p[pc.y]-dy*u)*ly;
   if(lat>Math.min(p[pc.lo],q[pc.lo])-margin&&lat<Math.max(p[pc.hi],q[pc.hi])+margin)return true;}
  return false;
 }
 return {at,inPit};
}

// ---------- The bowl's plan: an ellipse (centre, long axis th, semi-axes a × b) and the curves parallel to it, d
// metres inward; positions by arc length along the edge (the porticos stand at equal spacing round it).
function ellipse(cx,cy,th,a,b){
 const U=[Math.cos(th),Math.sin(th)],V=[-Math.sin(th),Math.cos(th)],M=4096,ts=[0],ss=[0];
 let px=a,py=0;for(let i=1;i<=M;i++){const t=i/M*2*Math.PI,x=a*Math.cos(t),y=b*Math.sin(t);ss.push(ss[i-1]+Math.hypot(x-px,y-py));ts.push(t);px=x;py=y;}
 const L=ss[M];
 const tAt=s=>{s=((s%L)+L)%L;let lo=0,hi=M;while(hi-lo>1){const k=lo+hi>>1;if(ss[k]<=s)lo=k;else hi=k;}return lerp(ts[lo],ts[hi],(s-ss[lo])/(ss[hi]-ss[lo]||1));};
 const nrm=t=>{const nu=b*Math.cos(t),nv=a*Math.sin(t),l=Math.hypot(nu,nv);return [nu/l,nv/l];};
 // (t, d inward, z) in track coordinates; the outward normal and the tangent (counter-clockwise) in the plan.
 const at=(t,d,z=0)=>{const [nu,nv]=nrm(t),u=a*Math.cos(t)-d*nu,v=b*Math.sin(t)-d*nv;return [cx+u*U[0]+v*V[0],cy+u*U[1]+v*V[1],z];};
 const normal=t=>{const [nu,nv]=nrm(t);return [nu*U[0]+nv*V[0],nu*U[1]+nv*V[1]];};
 const tangent=t=>{const n=normal(t);return [-n[1],n[0]];};
 return {L,tAt,at,normal,tangent,U,V,cx,cy};
}

// ---------- Mineirão
// Measured on the 2015 orthophoto's 20 cm sheets (UTM 23S, SIRGAS 2000): the roof edge's ellipse. The track file's
// stadium (gerar_pampulha.py: the same numbers) wins where it is given: its solid at ground level (the façade's
// ellipse round to the floor's, less the tunnel's corridor) is what the car meets, so the model stands on its lines.
const MINEIRAO={utm:[607727.5,7803017.5],axis:79*Math.PI/180,a:138,b:108.5,facade:[130,100],floorSemi:[83,53.5],fins:88,deck:26.5,membrane:52,roof:29,
 tunnel:{heading:169*Math.PI/180,width:10,height:5.2}};
// The pieces of a convex polygon (uvs alongside, or null) where f(p) >= 0.
function clipConvex(pts,uvs,f){
 const out=[],ouv=[],n=pts.length;
 for(let i=0;i<n;i++){const p=pts[i],q=pts[(i+1)%n],fp=f(p),fq=f(q);if(fp>=0){out.push(p);if(uvs)ouv.push(uvs[i]);}
  if((fp>=0)!==(fq>=0)){const t=fp/(fp-fq);out.push(p.map((v,k)=>v+(q[k]-v)*t));if(uvs){const a=uvs[i],b=uvs[(i+1)%n];ouv.push([lerp(a[0],b[0],t),lerp(a[1],b[1],t)]);}}}
 return {pts:out,uvs:uvs?ouv:null};
}
function mineirao(m,K){
 const {T,gAt,mobile,origin,rand,lights,proxies,lap,data,solids}=K,S=m.stadium??{},M=MINEIRAO;
 const [cx,cy]=S.centre??(origin?[M.utm[0]-origin[0],M.utm[1]-origin[1]]:[m.x+6.1,m.y+1.7]),[RA,RB]=S.roof_semi??[M.a,M.b],[FA,FB]=S.facade_semi??M.facade,[LA,LB]=S.floor_semi??M.floorSemi;
 const TN={...M.tunnel,...S.tunnel},E=ellipse(cx,cy,S.heading??M.axis,RA,RB),U=E.U,V=E.V;
 const N=M.fins,bay=E.L/N,SUB=mobile?1:2,K2=N*SUB,ts=Array.from({length:K2},(_,k)=>E.tAt(k*bay/SUB));
 // Heights: the pitch and the plaza round the bowl at the landmark's ground (the track file's flat pad), the roof
 // deck 29 m over the pitch (the laser's: 68.8 m local over a pitch at 39.8).
 const Zp=m.ground??gAt(cx,cy),Zr=Zp+M.roof,TIP=Zr+3.4,LEAN=.27,dOut=z=>-4.5+(TIP-z)*LEAN,dPan=z=>dOut(z)+2.2;
 const Q=(t,d,z)=>E.at(t,d,z),out=(t,up=0)=>{const n=E.normal(t);return [n[0],n[1],up];},inw=(t,up=0)=>{const n=E.normal(t);return [-n[0],-n[1],up];};
 // Along each normal of the roof's edge, how far in the façade's and the floor's ellipses lie (the solid's lines).
 const onEllipse=(t,A,B)=>{let lo=0,hi=95;for(let i=0;i<36;i++){const d=(lo+hi)/2,p=Q(t,d),dx=p[0]-cx,dy=p[1]-cy,u=(dx*U[0]+dy*U[1])/A,v=(dx*V[0]+dy*V[1])/B;if(u*u+v*v>1)lo=d;else hi=d;}return (lo+hi)/2;};
 const dFac=ts.map(t=>onEllipse(t,FA,FB)),dFl=ts.map(t=>onEllipse(t,LA,LB));
 // The tunnel's frame: a out from the centre toward the portal, b across it (to its left); the corridor's half-width
 // HW, the portal block's PW; the façade's, the floor's and the roof edge's distance along its axis.
 const th=TN.heading,tc=Math.cos(th),tsn=Math.sin(th),aOf=p=>(p[0]-cx)*tc+(p[1]-cy)*tsn,bOf=p=>-(p[0]-cx)*tsn+(p[1]-cy)*tc,tf=frame(cx,cy,0,th);
 const along=(A,B)=>{const du=tc*U[0]+tsn*U[1],dv=tc*V[0]+tsn*V[1];return 1/Math.hypot(du/A,dv/B);},aF=along(FA,FB),aFl=along(LA,LB),aR=along(RA,RB),HW=TN.width/2,TH=TN.height,PW=8,PD=7;
 // A quad drawn whole, or without its part in the corridor (|b| < hw, on the portal's side) where it crosses it.
 const cut=(Tb,q,col,o,uv,hw)=>{const bs=q.map(bOf);if(q.reduce((s,p)=>s+aOf(p),0)<=0||bs.every(b=>b>=hw)||bs.every(b=>b<=-hw)){Tb.quad(...q,col,o,uv);return;}
  for(const s of [-1,1]){const r=clipConvex(q,uv??null,p=>s*bOf(p)-hw);if(r.pts.length>=3)Tb.fan(r.pts,col,o,r.uvs);}};
 // The plaza at the façade: the lowest ground at its foot, just outside and inside (the building goes below it).
 const foot=t=>{let g=Infinity;for(const d of [-9,-4,1,7]){const p=Q(t,d);g=Math.min(g,gAt(p[0],p[1]));}return g;};
 const feet=ts.map(foot);
 const fin=lin(0xb9b09e),panel=lin(0xb1a996),soffit=lin(0x8d877a),slabCol=lin(0xc7c0b0),deck=lin(0x9c978c),white=lin(0xf2f2ef),under=lin(0xdfe0dc),lamp=[1,.97,.9];
 const tone=(c,k)=>p=>mul(c,k*(.94+.12*fbm(p[0]*.08,p[1]*.08+p[2]*.02)));
 const stats={fins:N,segments:K2,pitch:+Zp.toFixed(2),roof:+Zr.toFixed(2),centre:[+cx.toFixed(1),+cy.toFixed(1)],tunnel:{portal:+aF.toFixed(1),floor:+aFl.toFixed(1)}};

 // The 88 semi-porticos: blades along the edge's normal, leaning outward to their tips over the roof's edge. The one
 // over the tunnel stands on the portal's lintel; each foot out past the solid's line is a solid of its own.
 for(let j=0;j<N;j++){
  const t=ts[j*SUB],tg=E.tangent(t),n=E.normal(t),W=.75,fp=Q(t,8),over=aOf(fp)>0&&Math.abs(bOf(fp))<HW+2.6,z0=over?Zp+9.8:feet[j*SUB]-1.2;
  const X=(d,z,w)=>{const p=Q(t,d,z);return [p[0]+tg[0]*w,p[1]+tg[1]*w,z];},w2=(dd,dz)=>[-n[0]*dd,-n[1]*dd,dz];
  const prof=[[dOut(z0),z0],[-4.5,TIP],[5.5,Zr+.6],[12,z0]],dc=prof.reduce((s,p)=>s+p[0],0)/4,zc=prof.reduce((s,p)=>s+p[1],0)/4,col=tone(fin,.96+rand()*.08);
  for(const w of [-W,W])T.concrete.quad(...prof.map(([d,z])=>X(d,z,w)),col,[tg[0]*w,tg[1]*w,0]);
  for(let e=0;e<(over?4:mobile?2:3);e++){const [d0,a0]=prof[e],[d1,a1]=prof[(e+1)%4];T.concrete.quad(X(d0,a0,-W),X(d1,a1,-W),X(d1,a1,W),X(d0,a0,W),col,w2((d0+d1)/2-dc,(a0+a1)/2-zc));}
  if(!over){const d0=dOut(Zp+1.3)-.05,d1=dFac[j*SUB]+.5,c=Q(t,(d0+d1)/2);solids.push({x:c[0],y:c[1],h:Math.atan2(-n[1],-n[0]),hu:(d1-d0)/2,hv:W+.04});}
 }
 // Between them: the upper tier's back in big panels, its soffit, the circulation decks' slab edges and the dark
 // (lit at night) depth behind; the ground floor glazed on the solid's line under a slab; the parapet's coping and
 // the roof deck to the membrane. The portal block takes the ground floor's place over the tunnel.
 const zP0=Zr-9.5,zP1=Zr+.6,dTop=dPan(zP1)+.45,zB=Zp+4.4,zB1=Zp+5.2;
 for(let k=0;k<K2;k++){
  const k1=(k+1)%K2,t0=ts[k],t1=ts[k1],tm=E.tAt((k+.5)*bay/SUB),g=Math.min(feet[k],feet[k1]),o=out(tm,.27),bayK=.9+rand()*.18,f0=dFac[k],f1=dFac[k1];
  const band=(d0,d1,z,col,face)=>T.concrete.quad(Q(t0,d0,z),Q(t1,d0,z),Q(t1,d1,z),Q(t0,d1,z),col,[0,0,face]);
  const wall=(df,z0,z1,col,o2,Tb=T.concrete)=>Tb.quad(Q(t0,df(z0),z0),Q(t1,df(z0),z0),Q(t1,df(z1),z1),Q(t0,df(z1),z1),col,o2);
  wall(dPan,zP0,zP1,tone(panel,bayK),o);
  band(dPan(zP0),dOut(zP0)+8.5,zP0,soffit,-1);
  const lit=mul(lin(0x4a4946),.6+rand()*.5);wall(z=>dOut(z)+8.5,zB1,zP0,lit,o,T.lit);
  for(const zs of [Zr-13,Zr-16.5,Zr-20]){if(zs-.9<zB1+1.2)continue;const df=dOut(zs)+3.2,db=dOut(zs)+8.5;band(df,db,zs,slabCol,1);if(!mobile)band(df,db,zs-.9,soffit,-1);wall(()=>df,zs-.9,zs,tone(slabCol,bayK),out(tm));}
  const glass=mul(lin(0x34404a),.75+rand()*.5),back=dOut(zB1)+8.5;
  cut(T.lit,[Q(t0,f0,g-.8),Q(t1,f1,g-.8),Q(t1,f1,zB),Q(t0,f0,zB)],glass,out(tm),null,PW);
  cut(T.concrete,[Q(t0,f0-.3,zB1),Q(t1,f1-.3,zB1),Q(t1,back,zB1),Q(t0,back,zB1)],slabCol,[0,0,1],null,PW);
  cut(T.concrete,[Q(t0,f0-.3,zB),Q(t1,f1-.3,zB),Q(t1,f1-.3,zB1),Q(t0,f0-.3,zB1)],tone(slabCol,bayK),out(tm),null,PW);
  if(!mobile)cut(T.concrete,[Q(t0,f0-.3,zB),Q(t1,f1-.3,zB),Q(t1,f1,zB),Q(t0,f0,zB)],soffit,[0,0,-1],null,PW);
  band(dPan(zP1),dTop,zP1,deck,1);wall(()=>dTop,Zr,zP1,deck,inw(tm));
  band(dTop,M.deck,Zr,deck,1);
  // Under the roof, seen from the stands: its soffit and the wall over the top row.
  band(8.2,M.deck,Zr-1.4,soffit,-1);wall(()=>8.2,Zr-2.6,Zr-1.4,soffit,inw(tm));
 }
 // The roof's radial beams over the porticos and the solar plant's panels between them (the higher ground sees them).
 if(!mobile)for(let j=0;j<N;j++){
  const t=ts[j*SUB],n=E.normal(t),p=Q(t,0),f=frame(p[0],p[1],0,Math.atan2(-n[1],-n[0]));T.concrete.box(f,dTop,M.deck,-.4,.4,Zr,Zr+.75,deck,{ends:false});
  const s0=j*bay+.6,s1=(j+1)*bay-.6,sm=(s0+s1)/2,c=mul(lin(0x2c3549),.85+rand()*.25);
  for(const [a,b] of [[s0,sm],[sm,s1]]){const ta=E.tAt(a),tb=E.tAt(b);T.metal.quad(Q(ta,1,Zr+.22),Q(tb,1,Zr+.22),Q(tb,25.5,Zr+.22),Q(ta,25.5,Zr+.22),c,[0,0,1]);}
 }
 // The membrane (2013): white, in shallow radial folds over its steel trusses, from the concrete roof to the inner
 // edge; its fascia, the catwalks crossing it on the diagonals, the floodlights along the inner edge.
 const rings=mobile?[M.deck,M.membrane]:[M.deck,(M.deck+M.membrane)/2,M.membrane],mz=d=>lerp(Zr+.8,Zr-.2,(d-M.deck)/(M.membrane-M.deck)),uz=d=>lerp(Zr-1.0,Zr-1.25,(d-M.deck)/(M.membrane-M.deck));
 const fold=k=>mobile||k%2===0?0:.35;
 for(let k=0;k<K2;k++){
  const t0=ts[k],t1=ts[(k+1)%K2],tm=E.tAt((k+.5)*bay/SUB),f0=fold(k),f1=fold(k+1);
  for(let r=0;r+1<rings.length;r++){const d0=rings[r],d1=rings[r+1];
   T.membrane.quad(Q(t0,d0,mz(d0)+f0),Q(t1,d0,mz(d0)+f1),Q(t1,d1,mz(d1)+f1),Q(t0,d1,mz(d1)+f0),white,[0,0,1]);
   T.membrane.quad(Q(t0,d0,uz(d0)),Q(t1,d0,uz(d0)),Q(t1,d1,uz(d1)),Q(t0,d1,uz(d1)),under,[0,0,-1]);}
  const d=M.membrane;T.membrane.quad(Q(t0,d,uz(d)),Q(t1,d,uz(d)),Q(t1,d,mz(d)+f1),Q(t0,d,mz(d)+f0),white,inw(tm));
  T.membrane.quad(Q(t0,M.deck,Zr),Q(t1,M.deck,Zr),Q(t1,M.deck,mz(M.deck)+f1),Q(t0,M.deck,mz(M.deck)+f0),under,out(tm));
  T.concrete.quad(Q(t0,M.deck,Zr-1.4),Q(t1,M.deck,Zr-1.4),Q(t1,M.deck,uz(M.deck)),Q(t0,M.deck,uz(M.deck)),soffit,inw(tm));
  // Floodlights: a fixture every half bay under the edge (desktop), a lamp each for the night.
  const fp=Q(tm,M.membrane+.3,uz(M.membrane)-.45);lights.push({p:fp,c:[1,.97,.9],i:1.25,s:.5,g:0,on:.25,ph:rand()});
  if(!mobile){const n=E.normal(tm),f=frame(fp[0],fp[1],0,Math.atan2(n[1],n[0]));T.metal.box(f,-.1,.6,-.6,.6,fp[2]-.25,fp[2]+.45,lin(0x3a3c3f),{bottom:true});}
 }
 if(!mobile)for(let j=0;j<N;j++){const t=ts[j*SUB],n=E.normal(t),p=Q(t,0),f=frame(p[0],p[1],0,Math.atan2(-n[1],-n[0]));T.metal.box(f,M.deck,M.membrane-.3,-.18,.18,uz(M.deck)-1.1,uz(M.deck),lin(0xc9cbcc),{ends:false,bottom:true,top:false});}
 for(const s of [47,133,227,313]){const t=s*Math.PI/180,n=E.normal(t),p=Q(t,0),f=frame(p[0],p[1],0,Math.atan2(-n[1],-n[0]));for(let d=M.deck;d<M.membrane-.1;d+=mobile?25.5:12.75){const d1=Math.min(M.membrane,d+12.75);T.metal.quad(f(d,-.6,mz(d)+.08),f(d1,-.6,mz(d1)+.08),f(d1,.6,mz(d1)+.08),f(d,.6,mz(d)+.08),lin(0x6c6e70),[0,0,1]);}}
 // Façade lamps over the panels, one a bay (warm), for the night.
 for(let j=0;j<N;j++){const t=E.tAt((j+.5)*bay);lights.push({p:Q(t,dPan(zP1)-.4,zP1-.6),c:[1,.82,.55],i:.8,s:.28,g:1,on:.2,ph:rand()});}

 // The stands: the upper tier under the roof, the boxes' glass band, the lower tier down to the wall round the floor
 // (on the solid's inner line). Rows and aisles are the seats' texture (one bay a repeat, 0.85 m a row). Over the
 // tunnel the lower tier is cut where it stands lower than the tunnel's roof (FC of the way down): there the tunnel
 // comes out between two walls, an open cutting onto the floor.
 const FC=(10.5-(TH+1))/(10.5-1.2),lowZ=(k,d)=>{const t=ts[k],z=lerp(Zr-18.5,Zp+1.2,clamp((d-26.6)/(dFl[k]-26.6),0,1)),p=Q(t,d);return Math.max(z,gAt(p[0],p[1])+.35);};
 const seatTone=t=>mul(lin(0x9ea3a8),.9+.12*noise(t*9,1.7));
 for(let k=0;k<K2;k++){
  const k1=(k+1)%K2,t0=ts[k],t1=ts[k1],tm=E.tAt((k+.5)*bay/SUB),u0=k/SUB,u1=(k+1)/SUB,col=seatTone(tm);
  T.seats.quad(Q(t0,8.2,Zr-2.6),Q(t1,8.2,Zr-2.6),Q(t1,25,Zr-14),Q(t0,25,Zr-14),col,inw(tm,1),[[u0,0],[u1,0],[u1,Math.hypot(16.8,11.4)/.85/8],[u0,Math.hypot(16.8,11.4)/.85/8]]);
  // Lower tier: walkway → the tunnel roof's line → the floor's wall, the last cut over the corridor.
  const dl=[f=>26.6+f*(dFl[k]-26.6),f=>26.6+f*(dFl[k1]-26.6)],fs=mobile?[0,FC,1]:[0,FC/2,FC,1];
  for(let r=0;r+1<fs.length;r++){const a0=dl[0](fs[r]),a1=dl[1](fs[r]),b0=dl[0](fs[r+1]),b1=dl[1](fs[r+1]),v=f=>f*28.4*1.05/.85/8;
   const q=[Q(t0,a0,lowZ(k,a0)),Q(t1,a1,lowZ(k1,a1)),Q(t1,b1,lowZ(k1,b1)),Q(t0,b0,lowZ(k,b0))],uv=[[u0,v(fs[r])],[u1,v(fs[r])],[u1,v(fs[r+1])],[u0,v(fs[r+1])]];
   if(fs[r]>=FC-1e-6)cut(T.seats,q,col,inw(tm,1),uv,HW+.6);else T.seats.quad(...q,col,inw(tm,1),uv);}
  // The upper tier's front parapet, the boxes' glass under it, the walkway at the lower tier's top.
  T.concrete.quad(Q(t0,25,Zr-14),Q(t1,25,Zr-14),Q(t1,25,Zr-14.9),Q(t0,25,Zr-14.9),panel,inw(tm));
  T.concrete.quad(Q(t0,25,Zr-14.9),Q(t1,25,Zr-14.9),Q(t1,25.5,Zr-14.9),Q(t0,25.5,Zr-14.9),soffit,[0,0,-1]);
  T.lit.quad(Q(t0,25.5,Zr-14.9),Q(t1,25.5,Zr-14.9),Q(t1,25.5,Zr-18.5),Q(t0,25.5,Zr-18.5),mul(lin(0x3b4650),.8+rand()*.4),inw(tm));
  T.concrete.quad(Q(t0,25.5,Zr-18.5),Q(t1,25.5,Zr-18.5),Q(t1,26.6,lowZ(k1,26.6)),Q(t0,26.6,lowZ(k,26.6)),deck,[0,0,1]);
  // The wall round the floor (the solid's inner line), down into the ground; open where the cutting comes out.
  cut(T.paint,[Q(t0,dFl[k],Zp-.6),Q(t1,dFl[k1],Zp-.6),Q(t1,dFl[k1],lowZ(k1,dFl[k1])),Q(t0,dFl[k],lowZ(k,dFl[k]))],lin(0x2f4a3c),inw(tm),null,HW+.6);
 }
 // The tunnels' mouths (vomitórios) in the lower tier, every fourth bay (none over the drive-in tunnel).
 for(let j=2;j<N;j+=4){const s=j*bay+bay/2,ta=E.tAt(s-1.6),tb=E.tAt(s+1.6),kk=Math.round(s/bay*SUB)%K2;if(Math.abs(bOf(Q(ta,33)))<HW+6&&aOf(Q(ta,33))>0)continue;
  const zz=d=>lerp(Zr-18.5,Zp+1.2,(d-26.6)/(dFl[kk]-26.6))+.05;T.paint.quad(Q(ta,31,zz(31)),Q(tb,31,zz(31)),Q(tb,35,zz(35)),Q(ta,35,zz(35)),lin(0x161616),[0,0,1]);}
 // The floor: grass and the pitch (texture in the pitch's frame: 120 × 80 m round its centre) laid on the ground
 // the car drives on (the pad), a few centimetres up and pulled toward the eye.
 const fr=mobile?[1,.6,0]:[1,.8,.6,.4,.2,0],uv=p=>{const dx=p[0]-cx,dy=p[1]-cy;return [(dx*U[0]+dy*U[1]+60)/120,(dx*V[0]+dy*V[1]+40)/80];};
 const fl=(k,f)=>{const q=Q(ts[k],dFl[k]),x=cx+(q[0]-cx)*f,y=cy+(q[1]-cy)*f;return [x,y,gAt(x,y)+.03];};
 for(let k=0;k<K2;k++){const k1=(k+1)%K2;for(let r=0;r+1<fr.length;r++){const a=fl(k,fr[r]),b=fl(k1,fr[r]),c=fl(k1,fr[r+1]),d=fl(k,fr[r+1]);
  if(fr[r+1]===0)T.pitch.tri(a,b,c,[1,1,1],[uv(a),uv(b),uv(c)]);else T.pitch.quad(a,b,c,d,[1,1,1],[0,0,1],[uv(a),uv(b),uv(c),uv(d)]);}}
 // Goals at both ends (their posts are solids: a car meets them).
 for(const s of [-1,1]){const g=(v,z)=>[cx+U[0]*52.5*s+V[0]*v,cy+U[1]*52.5*s+V[1]*v,gAt(cx+U[0]*52.5*s,cy+U[1]*52.5*s)+z];const w=lin(0xf4f4f2);
  for(const v of [-3.66,3.66]){const p=g(v,0);T.metal.post(p,g(v,2.44),.06,.06,6,w);solids.push({x:p[0],y:p[1],r:.12});}T.metal.post(g(-3.72,2.44),g(3.72,2.44),.06,.06,6,w);
  if(!mobile)for(const v of [-3.66,3.66])T.metal.post(g(v,2.44),[g(v,0)[0]+U[0]*1.8*s,g(v,0)[1]+U[1]*1.8*s,g(v,0)[2]],.03,.03,4,w);}

 // ---- The drive-in tunnel (invented for the game): through the west façade under a portal block lettered
 // MINEIRÃO, a lit concrete tube under the stands, out through an open cutting onto the floor.
 const aM=aR-(26.6+FC*(aR-aFl-26.6)),zStand=a=>lerp(Zr-18.5,Zp+1.2,clamp((aR-a-26.6)/(aR-aFl-26.6),0,1)),grey=lin(0xd6d3cb),inner=lin(0x8e8c86),dado=lin(0x45484a),band=lin(0x24507c),kerb=lin(0xc9a21a);
 const tq=(Tb,pts,col,o,uv)=>Tb.quad(...pts.map(([a,b,z])=>tf(a,b,z)),col,o&&[tc*o[0]-tsn*o[1],tsn*o[0]+tc*o[1],o[2]],uv);
 for(const s of [-1,1]){
  // Covered: dado, a blue band, light walls; a lamp strip each side; the cutting's walls up to a parapet over the seats.
  const b=s*HW,o=[0,-s,0],a0=aM,a1=aF-.5;
  // (inside, out of the daylight: darker than the same paint outside)
  for(const [z0,z1,c] of [[Zp-.3,Zp+.25,kerb],[Zp+.25,Zp+1.2,dado],[Zp+1.2,Zp+2.3,inner],[Zp+2.3,Zp+2.6,band],[Zp+2.6,Zp+TH,inner]])tq(T.paint,[[a0,b,z0],[a1,b,z0],[a1,b,z1],[a0,b,z1]],c,o);
  tq(T.lit,[[a0+.6,b-s*.02,Zp+3.35],[a1-.6,b-s*.02,Zp+3.35],[a1-.6,b-s*.02,Zp+3.5],[a0+.6,b-s*.02,Zp+3.5]],lamp,o);
  const z=a=>zStand(a)+.9;
  tq(T.paint,[[aFl,b,Zp-.3],[aM,b,Zp-.3],[aM,b,Zp+.25],[aFl,b,Zp+.25]],kerb,o);
  tq(T.concrete,[[aFl,b,Zp+.25],[aM,b,Zp+.25],[aM,b,z(aM)],[aFl,b,z(aFl)]],grey,o);
  tq(T.concrete,[[aFl,b,z(aFl)],[aM,b,z(aM)],[aM,b+s*.6,z(aM)],[aFl,b+s*.6,z(aFl)]],deck,[0,0,1]);
  tq(T.concrete,[[aFl,b+s*.6,zStand(aFl)-.2],[aM,b+s*.6,zStand(aM)-.2],[aM,b+s*.6,z(aM)],[aFl,b+s*.6,z(aFl)]],grey,[0,s,0]);
  // The cutting wall's end at the floor, the tunnel's mouth (headwall) over it.
  tq(T.concrete,[[aFl,b,Zp-.3],[aFl,b+s*.6,Zp-.3],[aFl,b+s*.6,z(aFl)],[aFl,b,z(aFl)]],grey,[-1,0,0]);
 }
 tq(T.concrete,[[aM,-HW-.6,Zp+TH],[aM,HW+.6,Zp+TH],[aM,HW+.6,zStand(aM)+.9],[aM,-HW-.6,zStand(aM)+.9]],grey,[-1,0,0]);
 tq(T.concrete,[[aM,-HW-.6,zStand(aM)+.9],[aM,HW+.6,zStand(aM)+.9],[aM+.6,HW+.6,zStand(aM)+.9],[aM+.6,-HW-.6,zStand(aM)+.9]],deck,[0,0,1]);
 // The tunnel's ceiling, beams across it every 6 m, two lamp strips along it.
 tq(T.paint,[[aM,-HW,Zp+TH],[aF-.5,-HW,Zp+TH],[aF-.5,HW,Zp+TH],[aM,HW,Zp+TH]],lin(0x5f5e5a),[0,0,-1]);
 for(let a=aM+3;a<aF-2;a+=6)T.paint.box(tf,a-.3,a+.3,-HW,HW,Zp+TH-.55,Zp+TH,lin(0x6a6964),{top:false,bottom:true,sides:true,ends:false});
 for(const b of [-2.6,2.6])tq(T.lit,[[aM+.4,b-.15,Zp+TH-.03],[aF-1,b-.15,Zp+TH-.03],[aF-1,b+.15,Zp+TH-.03],[aM+.4,b+.15,Zp+TH-.03]],lamp,[0,0,-1]);
 // Overhead signs: ACESSO AO GRAMADO for those coming in, SAÍDA · PISTA on its back; hung from the ceiling.
 const sa=aF-8,sb=3.4,sz0=Zp+TH-1.45,sz1=Zp+TH-.45;
 K.sign(tf(sa,-sb,sz0),tf(sa,sb,sz0),tf(sa,sb,sz1),tf(sa,-sb,sz1),'acesso',[tc,tsn,0]);K.sign(tf(sa-.06,sb,sz0),tf(sa-.06,-sb,sz0),tf(sa-.06,-sb,sz1),tf(sa-.06,sb,sz1),'saida',[-tc,-tsn,0]);
 for(const b of [-2.6,2.6])T.metal.post(tf(sa-.03,b,sz1),tf(sa-.03,b,Zp+TH),.03,.03,4,lin(0x55585a));
 // The portal block: piers either side of an 11.2 m opening, a lintel 4 m deep over it with the name in letters,
 // chamfered top corners; the opening framed in light. The face steps back to the tunnel's walls (reveals).
 const pc=lin(0xdedad0),pz=Zp+5.8,a0=aF-.5,a1=aF+PD;
 for(const s of [-1,1]){
  T.concrete.box(tf,a0,a1,s<0?-PW:HW+.6,s<0?-HW-.6:PW,Zp-.5,pz,pc,{bottom:false});
  const b=s*(HW+.6),bi=s*(HW+.6-1.2);
  T.concrete.quad(tf(a0,b,pz-1.2),tf(a1,b,pz-1.2),tf(a1,bi,pz),tf(a0,bi,pz),pc,[s*tsn,-s*tc,-1]);
  for(const a of [a0,a1])T.concrete.poly([tf(a,b,pz-1.2),tf(a,bi,pz),tf(a,b,pz)],pc,a===a1?[tc,tsn,0]:[-tc,-tsn,0]);
  tq(T.concrete,[[a0,s*HW,Zp-.3],[a0,b,Zp-.3],[a0,b,pz],[a0,s*HW,pz]],pc,[1,0,0]);
  // Lamp strips framing the opening on the face; the piers' feet are solids (they stand out past the façade).
  tq(T.lit,[[a1+.03,s*(HW+.9),Zp+.4],[a1+.03,s*(HW+1.15),Zp+.4],[a1+.03,s*(HW+1.15),pz+.3],[a1+.03,s*(HW+.9),pz+.3]],lamp,[1,0,0]);
  const pcn=tf((a0+a1)/2,s*(HW+.6+PW)/2,0);solids.push({x:pcn[0],y:pcn[1],h:th,hu:(a1-a0)/2+.4,hv:(PW-HW-.6)/2});
  lights.push({p:tf(a1+.8,s*(HW+2.2),Zp+.5),c:[1,.85,.6],i:.9,s:.3,g:1,on:.15,ph:rand()});
 }
 tq(T.concrete,[[a0,-HW,Zp+TH],[a0,HW,Zp+TH],[a0,HW,pz],[a0,-HW,pz]],pc,[1,0,0]);
 T.concrete.box(tf,a0,a1,-PW,PW,pz,Zp+9.8,pc,{bottom:true});
 tq(T.lit,[[a1+.03,-HW-1.15,pz+.3],[a1+.03,HW+1.15,pz+.3],[a1+.03,HW+1.15,pz+.55],[a1+.03,-HW-1.15,pz+.55]],lamp,[1,0,0]);
 K.sign(tf(a1+.04,-7.3,Zp+6.65),tf(a1+.04,7.3,Zp+6.65),tf(a1+.04,7.3,Zp+9.35),tf(a1+.04,-7.3,Zp+9.35),'mineirao',[tc,tsn,0]);
 // The road through it: asphalt from the floor's edge out onto the plaza, edge lines and a dashed centre line.
 const road=(a0,a1,w0,w1,z,col)=>{const p=[[a0,-w0],[a1,-w1],[a1,w1],[a0,w0]].map(([a,b])=>{const q=tf(a,b,0);return [q[0],q[1],gAt(q[0],q[1])+z];});T.paving.quad(...p,col,[0,0,1]);};
 road(aFl-.2,aF+PD,HW,HW,.035,lin(0x3b3c3e));road(aF+PD,aF+PD+9,HW,HW+3,.035,lin(0x3b3c3e));
 for(const s of [-1,1]){const b=s*(HW-.45);T.paving.quad(...[[aFl,b-.08],[aF+PD+8,b-.08],[aF+PD+8,b+.08],[aFl,b+.08]].map(([a,bb])=>{const q=tf(a,bb,0);return [q[0],q[1],gAt(q[0],q[1])+.045];}),lin(0xe9e7e0),[0,0,1]);}
 for(let a=aFl+2;a<aF+PD+6;a+=5)T.paving.quad(...[[a,-.08],[a+2.5,-.08],[a+2.5,.08],[a,.08]].map(([aa,bb])=>{const q=tf(aa,bb,0);return [q[0],q[1],gAt(q[0],q[1])+.045];}),lin(0xe2c23a),[0,0,1]);
 stats.tunnel={...stats.tunnel,mouth:+aM.toFixed(1),length:+(aF-aM).toFixed(1),cutting:+(aM-aFl).toFixed(1)};

 // The esplanade (the cadastre's footprint round the bowl): light concrete slabs over the ground's grid nodes, each
 // cell its own tone, the joints darker every third; never over the lap or the tunnel's road.
 const ring0=Array.from({length:96},(_,k)=>Q(E.tAt(k*E.L/96),9)),insideBowl=(x,y)=>inside(x,y,ring0),fp=m.outline??[];
 const onRoad=(x,y)=>{const p=[x,y],a=aOf(p),b=bOf(p);return a>aF-2&&a<aF+PD+11&&Math.abs(b)<HW+4;};
 if(fp.length>=3){
  const tr=data.terrain,stp=mobile?2:1,cell=tr.step*stp,xs=fp.map(p=>p[0]),ys=fp.map(p=>p[1]),i0=Math.floor((Math.min(...xs)-tr.x0)/cell),i1=Math.ceil((Math.max(...xs)-tr.x0)/cell),j0=Math.floor((Math.min(...ys)-tr.y0)/cell),j1=Math.ceil((Math.max(...ys)-tr.y0)/cell);
  const free=(x,y)=>inside(x,y,fp)&&!insideBowl(x,y)&&!onRoad(x,y)&&!lap.inPit(x,y,3)&&!lap.at(x,y).some(h=>Math.abs(h.lat)<h.back+2);
  let cells=0;
  // A cell whole where it is free; along the footprint's edge split in four, twice (5 → 1.25 m), the last pieces
  // halved on their diagonal: an edge that follows the outline, not a staircase.
  const piece=(x0,y0,sz,depth,tone)=>{
   const c=[[x0,y0],[x0+sz,y0],[x0+sz,y0+sz],[x0,y0+sz]],ok=c.map(([x,y])=>free(x,y)),n=ok.filter(Boolean).length,mid=free(x0+sz/2,y0+sz/2);
   if(!n&&!mid)return 0;
   if((n<4||!mid)&&depth<(mobile?1:2)){let k=0;for(const [dx,dy] of [[0,0],[1,0],[0,1],[1,1]])k+=piece(x0+dx*sz/2,y0+dy*sz/2,sz/2,depth+1,tone);return k;}
   if(n<3)return 0;
   const z=c.map(([x,y])=>gAt(x,y)),zs=z.filter((_,q)=>ok[q]);if(Math.max(...zs)-Math.min(...zs)>(mobile?1.6:.9))return 0;
   const P3=q=>[c[q][0],c[q][1],z[q]+.04];
   if(n===4)T.paving.quad(P3(0),P3(1),P3(2),P3(3),tone,[0,0,1]);else{const q=ok.indexOf(false),tri=[0,1,2,3].filter(r=>r!==q);if(q===0||q===2){if(mid)T.paving.poly(tri.map(P3),tone,[0,0,1]);}else T.paving.poly(tri.map(P3),tone,[0,0,1]);}
   return 1;
  };
  for(let i=i0;i<i1;i++)for(let j=j0;j<j1;j++){
   const x0=tr.x0+i*cell,y0=tr.y0+j*cell,k=(.9+.1*hash(i*1.7,j*2.3))*(.95+.08*fbm(x0*.02,y0*.02));
   cells+=piece(x0,y0,cell,0,mul(lin(0xa49d8f),(i%3===0||j%3===0)&&!mobile?k*.95:k));
  }
  stats.esplanadeCells=cells;
 }
 // Camera proxies (only their front faces stop a camera): the façade outward, open at the portal; the roof's top;
 // the stands toward the pitch and the roof's underside, open over the cutting; the tunnel's walls and roof inward.
 const P=new Batch(),pr=mobile?64:96,tp=Array.from({length:pr},(_,k)=>E.tAt(k*E.L/pr)),pf=tp.map(t=>onEllipse(t,FA,FB)),pl=tp.map(t=>onEllipse(t,LA,LB)),W1=[1,1,1];
 for(let k=0;k<pr;k++){
  const k1=(k+1)%pr,a=tp[k],b=tp[k1],tm=E.tAt((k+.5)*E.L/pr),dc0=26.6+FC*(pl[k]-26.6),dc1=26.6+FC*(pl[k1]-26.6);
  cut(P,[Q(a,pf[k],Zp-1),Q(b,pf[k1],Zp-1),Q(b,pf[k1],Zp+9.8),Q(a,pf[k],Zp+9.8)],W1,out(tm),null,HW+.6);
  P.quad(Q(a,pf[k],Zp+9.8),Q(b,pf[k1],Zp+9.8),Q(b,pf[k1],zP1),Q(a,pf[k],zP1),W1,out(tm));
  P.quad(Q(a,pf[k],zP1),Q(b,pf[k1],zP1),Q(b,M.membrane,zP1),Q(a,M.membrane,zP1),W1,[0,0,1]);
  cut(P,[Q(a,pl[k],Zp-.5),Q(b,pl[k1],Zp-.5),Q(b,dc1,Zp+TH+1),Q(a,dc0,Zp+TH+1)],W1,inw(tm,1),null,HW);
  P.quad(Q(a,dc0,Zp+TH+1),Q(b,dc1,Zp+TH+1),Q(b,26.6,Zp+10.5),Q(a,26.6,Zp+10.5),W1,inw(tm,1));
  P.quad(Q(a,26.6,Zp+10.5),Q(b,26.6,Zp+10.5),Q(b,8.2,Zr-2.6),Q(a,8.2,Zr-2.6),W1,inw(tm,1));
  P.quad(Q(a,8.2,Zr-1.4),Q(b,8.2,Zr-1.4),Q(b,M.membrane,Zr-1.4),Q(a,M.membrane,Zr-1.4),W1,[0,0,-1]);
 }
 for(const s of [-1,1])P.quad(tf(aFl,s*HW,Zp-1),tf(aF+PD,s*HW,Zp-1),tf(aF+PD,s*HW,Zp+TH),tf(aFl,s*HW,Zp+TH),W1,[-s*-tsn,-s*tc,0]);
 P.quad(tf(aM,-HW,Zp+TH),tf(aF+PD,-HW,Zp+TH),tf(aF+PD,HW,Zp+TH),tf(aM,HW,Zp+TH),W1,[0,0,-1]);
 proxies.push(P.mesh('Mineirao_obstaculo',new THREE.MeshBasicMaterial(),false));
 // Trees out of the bowl and a band round it (the plaza is paved).
 const clear=[];for(let x=-150;x<=150;x+=10)for(let y=-125;y<=125;y+=10){const u=x/(RA+14),v=y/(RB+14);if(u*u+v*v<=1)clear.push({x:cx+U[0]*x+V[0]*y,y:cy+U[1]*x+V[1]*y,r:8});}
 return {stats,clearings:clear};
}

// ---------- The way in from the lap (meta.roam zone 'mineirao'): an arch over the gap in the straight's wall with
// the stadium's name, a board before it pointing the way, and the street closure where the zone crosses the old
// carriageway (zone.fences): Jersey blocks under a chain-link fence and a DESVIO board, so no edge of the zone is an
// invisible wall.
const insideFlat=(x,y,r)=>{let c=false;for(let i=0,n=r.length/2,j=n-1;i<n;j=i++){const ax=r[2*i],ay=r[2*i+1],bx=r[2*j],by=r[2*j+1];if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)c=!c;}return c;};
const JERSEY=[[-.3,0],[.3,0],[.28,.08],[.13,.33],[.08,.81],[-.08,.81],[-.13,.33],[-.28,.08]];
function approaches(data,K){
 const zone=data.meta?.roam?.zones?.find(z=>z.name==='mineirao');if(!zone)return null;
 const {T,gAt,lap,solids,mobile,rand,fence}=K,A=data.samples,L=data.meta.reconstructed_xy_m,stats={arches:0,boards:0,blocks:0,fence:0};
 const at=s=>{s=((s%L)+L)%L;let lo=0,hi=A.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(A[m][0]<=s)lo=m;else hi=m-1;}const p=A[lo],q=A[(lo+1)%A.length],u=(s-p[0])/((lo===A.length-1?L:q[0])-p[0]);return p.map((v,k)=>v+(q[k]-v)*u);};
 const navy=lin(0x1d2733),steel=lin(0x7d8589);
 for(const g of zone.gaps??[]){
  const side=Math.sign(g.side)||1,pos=(s,lat)=>{const p=at(s),tl=Math.hypot(p[7],p[8])||1,nl=Math.hypot(p[9],p[10])||1,n=[p[9]/nl*side,p[10]/nl*side],face=p[4]/2+guardrailClearance(data,s,side);return {x:p[1]+n[0]*(face+lat),y:p[2]+n[1]*(face+lat),z:p[3],t:[p[7]/tl,p[8]/tl],n};};
  // The arch: two posts just past the walls' ends, a beam 6 m up, the name toward the lap, SAÍDA toward the zone.
  const pa=pos(g.s0-1.6,1.8),pb=pos(g.s1+1.6,1.8),top=Math.max(gAt(pa.x,pa.y),gAt(pb.x,pb.y))+7.4;
  for(const p of [pa,pb]){const z=gAt(p.x,p.y);T.metal.post([p.x,p.y,z-.3],[p.x,p.y,top],.32,.28,mobile?6:10,navy);solids.push({x:p.x,y:p.y,r:.36});}
  const dx=pb.x-pa.x,dy=pb.y-pa.y,l=Math.hypot(dx,dy),f=frame(pa.x,pa.y,0,Math.atan2(dy,dx)),n=pa.n,mid=f(l/2,0,top-.8);
  T.metal.box(f,-.3,l+.3,-.35,.35,top-1.6,top,navy,{bottom:true});
  K.board([mid[0]-n[0]*.4,mid[1]-n[1]*.4,mid[2]],[-n[0],-n[1],0],Math.min(l-1,11),1.3,'entrada');
  K.board([mid[0]+n[0]*.4,mid[1]+n[1]*.4,mid[2]],[n[0],n[1],0],Math.min(l-1,11),1.3,'saida');
  stats.arches++;
  // A board on two legs before the gap, behind the wall, turned to the cars coming up the straight.
  const pt=pos(g.s0-32,3.8),zt=gAt(pt.x,pt.y),o=[-pt.t[0],-pt.t[1],0],r=[-o[1],o[0]];
  for(const v of [-1.7,1.7]){const q=[pt.x+r[0]*v,pt.y+r[1]*v];T.metal.post([q[0],q[1],zt-.2],[q[0],q[1],zt+4.7],.09,.09,6,steel);solids.push({x:q[0],y:q[1],r:.14});}
  K.board([pt.x+o[0]*.12,pt.y+o[1]*.12,zt+3.6],o,4.4,2.2,'seta');stats.boards++;
 }
 for(const F of zone.fences??[]){
  const [x0,y0,x1,y1]=F,dx=x1-x0,dy=y1-y0,l=Math.hypot(dx,dy),ux=dx/l,uy=dy/l,ring=zone.ring[0],mx=(x0+x1)/2,my=(y0+y1)/2;
  // Out of the zone: the side of the line away from its open ground; the blocks stand there, their face on the line.
  const s=insideFlat(mx-uy*1.5,my+ux*1.5,ring)?-1:1,ox=-uy*s,oy=ux*s,f=frame(x0+ox*.36,y0+oy*.36,0,Math.atan2(uy,ux));
  // (only along the part clear of the lap's corridor and walls: the longest run of blocks there)
  const clear=u=>[[0,-.35],[1.9,-.35],[0,.35],[1.9,.35],[.95,0]].every(([du,v])=>{const c=f(u+du,v,0);return !lap.at(c[0],c[1]).some(h=>Math.abs(h.lat)<h.back+.6);});
  let run=[],best=[];for(let u=.15;u+1.95<=l;u+=2.03){if(clear(u))run.push(u);else{if(run.length>best.length)best=run;run=[];}}if(run.length>best.length)best=run;
  let first=null,last=null;
  for(const u of best){
   const c=f(u+.95,0,0);
   const z=gAt(c[0],c[1])-.02,col=mul(lin(0x9c9b95),.85+rand()*.22),tw=(rand()-.5)*.04,P=(uu,[v,h])=>f(u+uu,v+tw*(uu-.95),z+h);
   for(let i=0;i<JERSEY.length;i++){const a=JERSEY[i],b=JERSEY[(i+1)%JERSEY.length];if(i===0)continue;const mv=(a[0]+b[0])/2,mh=(a[1]+b[1])/2;T.concrete.quad(P(0,a),P(1.9,a),P(1.9,b),P(0,b),col,sub(f(0,mv,mh),f(0,0,.35)));}
   for(const uu of [0,1.9])T.concrete.poly(JERSEY.map(p=>P(uu,p)),col,sub(f(uu,0,0),f(.95,0,0)));
   stats.blocks++;first??=u;last=u+1.9;
  }
  if(first===null)continue;
  // The fence over them: posts every 2.5 m, a top rail, the chain link (metres of UV) from the blocks' top up.
  const z0=gAt(...f(first,0,0).slice(0,2)),z1=gAt(...f(last,0,0).slice(0,2)),zf=u=>lerp(z0,z1,(u-first)/(last-first||1));
  for(let u=first;u<=last+.01;u+=(last-first)/Math.max(1,Math.round((last-first)/2.5))){const p=f(u,0,0);T.metal.post([p[0],p[1],zf(u)+.78],[p[0],p[1],zf(u)+3.05],.04,.04,6,steel);}
  T.metal.box((u,v,z)=>{const p=f(u,v,0);return [p[0],p[1],zf(clamp(u,first,last))+z];},first,last,-.03,.03,3,3.06,steel,{bottom:true});
  const pts=[f(first,0,0),f(last,0,0)];fence.quad([pts[0][0],pts[0][1],zf(first)+.8],[pts[1][0],pts[1][1],zf(last)+.8],[pts[1][0],pts[1][1],zf(last)+3],[pts[0][0],pts[0][1],zf(first)+3],[1,1,1],null,[[0,.8],[last-first,.8],[last-first,3],[0,3]]);
  stats.fence+=last-first;
  // DESVIO for whoever comes along the old carriageway outside; an arrow board inside, back toward the plaza.
  const c=f((first+last)/2,ox*0,0),zc=zf((first+last)/2);
  K.board([c[0]+ox*.08,c[1]+oy*.08,zc+1.9],[ox,oy,0],2.8,1.05,'desvio');K.board([c[0]-ox*.08,c[1]-oy*.08,zc+1.9],[-ox,-oy,0],2.8,1.05,'retorno');stats.boards+=2;
 }
 return stats;
}

// ---------- Mineirinho
// Pillars (and the roof's ribs) at 5.5° + k·7.5° from east, the lantern a hexagon 11.5 m to its corners with one to
// the north; the footbridges' bearings and lengths from the photo.
const MINEIRINHO={bays:48,phase:5.5*Math.PI/180,lantern:11.5,bridges:[[-6.5,15],[-21,14],[84,17],[69,16]]};
function mineirinho(m,K){
 const {T,gAt,mobile,rand,lights,proxies,data}=K,M=MINEIRINHO,o=m.outline;
 let cx=0,cy=0;for(const p of o){cx+=p[0];cy+=p[1];}cx/=o.length;cy/=o.length;const R=o.reduce((s,p)=>s+Math.hypot(p[0]-cx,p[1]-cy),0)/o.length;
 const n=M.bays,step=2*Math.PI/n,P=(phi,r,z)=>[cx+Math.cos(phi)*r,cy+Math.sin(phi)*r,z];
 // Ground at each pillar (the lowest just in and outside it); the base is the lowest of all (the lake side).
 const gp=Array.from({length:n},(_,k)=>{const a=M.phase+k*step;let g=Infinity;for(const r of [R-3,R+1,R+5])g=Math.min(g,gAt(...P(a,r).slice(0,2)));return g;});
 const Zb=Math.min(...gp),Ze=Zb+(m.roof??34.7),Ztop=Zb+(m.height??38.4),Zh=Ze-9.2,FH=3.4;
 const conc=lin(0xc9c3b4),pillarCol=lin(0xbdb6a6),ochre=lin(0xbf9548),hoodIn=lin(0xa79f8f),slabC=lin(0xd6d0c2);
 const stats={radius:+R.toFixed(1),base:+Zb.toFixed(2),roofEdge:+Ze.toFixed(2),top:+Ztop.toFixed(2)};
 for(let k=0;k<n;k++){
  const a0=M.phase+k*step,a1=a0+step,ac=a0+step/2,g=Math.min(gp[k],gp[(k+1)%n]),W=2*R*Math.sin(step/2),pw=.65,hw=W/2-pw,ch=1.8;
  // The bay's plane frame: a across (tangent), r out from the centre, z up.
  const L=(a,r,z)=>[cx+Math.cos(ac)*r-Math.sin(ac)*a,cy+Math.sin(ac)*r+Math.cos(ac)*a,z],O=[Math.cos(ac),Math.sin(ac),0],A=[-Math.sin(ac),Math.cos(ac),0];
  const rb=R-2.2,rf=R+1.6,zl=Zh+.6,zc=Ze-.9,zs=zc-ch,tone=.92+rand()*.14;
  // The hood: ochre back wall, its sides, chamfers and ceiling, the lip it stands on, the front frame and rim.
  const prof=[[-hw,zl],[hw,zl],[hw,zs],[hw-ch,zc],[-hw+ch,zc],[-hw,zs]];
  T.concrete.poly(prof.map(([a,z])=>L(a,rb,z)),mul(ochre,tone),O);
  for(let e=1;e<prof.length;e++){const [a0_,z0]=prof[e],[a1_,z1]=prof[(e+1)%prof.length],mid=[(a0_+a1_)/2,(z0+z1)/2],inn=sub([0,0,(zl+zc)/2],[0,0,mid[1]]),dir=[-A[0]*mid[0]+inn[0],-A[1]*mid[0]+inn[1],inn[2]];T.concrete.quad(L(a0_,rb,z0),L(a1_,rb,z1),L(a1_,rf,z1),L(a0_,rf,z0),mul(hoodIn,tone),dir);}
  T.concrete.quad(L(-hw,rb,zl),L(hw,rb,zl),L(hw,R+1,zl),L(-hw,R+1,zl),mul(conc,tone),[0,0,1]);
  T.concrete.quad(L(-hw,R+1,Zh-.4),L(hw,R+1,Zh-.4),L(hw,R+1,zl),L(-hw,R+1,zl),mul(slabC,tone),O);
  T.concrete.quad(L(-hw,R-1.8,Zh-.4),L(hw,R-1.8,Zh-.4),L(hw,R+1,Zh-.4),L(-hw,R+1,Zh-.4),mul(conc,.8),[0,0,-1]);
  for(const s of [-1,1]){T.concrete.quad(L(s*W/2,rf,Zh-.4),L(s*hw,rf,Zh-.4),L(s*hw,rf,Ze),L(s*W/2,rf,Ze),mul(pillarCol,tone),O);T.concrete.poly([L(s*hw,rf,zs),L(s*(hw-ch),rf,zc),L(s*hw,rf,zc)],mul(pillarCol,tone),O);}
  T.concrete.quad(L(-hw,rf,zc),L(hw,rf,zc),L(hw,rf,Ze),L(-hw,rf,Ze),mul(pillarCol,tone),O);
  T.concrete.quad(L(-W/2,rb,Ze),L(W/2,rb,Ze),L(W/2,rf,Ze),L(-W/2,rf,Ze),mul(conc,tone*.95),[0,0,1]);
  T.concrete.quad(L(-W/2,rf,Zh-.4),L(W/2,rf,Zh-.4),L(W/2,rb,Zh-.4),L(-W/2,rb,Zh-.4),mul(conc,.75),[0,0,-1]);
  // The floors below: balcony bands, the dark glazing behind (lit at night), floor by floor down to the ground.
  T.lit.quad(L(-W/2,R-1.8,g-1),L(W/2,R-1.8,g-1),L(W/2,R-1.8,Zh-.4),L(-W/2,R-1.8,Zh-.4),mul(lin(0x2c2d2e),.7+rand()*.7),O);
  for(let z=Zh-.4-FH+1;z-1>g+1.2;z-=FH){const f0=z-1,col=mul(slabC,tone*(.95+rand()*.08));
   T.concrete.quad(L(-hw,R+.7,f0),L(hw,R+.7,f0),L(hw,R+.7,z),L(-hw,R+.7,z),col,O);T.concrete.quad(L(-hw,R-1.8,z),L(hw,R-1.8,z),L(hw,R+.7,z),L(-hw,R+.7,z),col,[0,0,1]);
   if(!mobile)T.concrete.quad(L(-hw,R-1.8,f0),L(hw,R-1.8,f0),L(hw,R+.7,f0),L(-hw,R+.7,f0),mul(conc,.7),[0,0,-1]);}
  // The pillar at a0 (the bay's left edge), proud of the balconies up to the hood.
  const pf=frame(...P(a0,0).slice(0,2),0,a0);T.concrete.box(pf,R-1.2,R+1.4,-pw,pw,gp[k]-1,Zh-.4,mul(pillarCol,tone),{top:false});
  // A warm lamp in every other hood at night.
  if(k%2===0||!mobile)lights.push({p:L(0,R-.8,zl+2.5),c:[1,.78,.45],i:.7,s:.35,g:2,on:.2,ph:rand()});
 }
 // The roof: a shallow dome of panels (each its own shade) in rings from the hoods to the lantern, its 48 ribs,
 // the skylights' rings and the hexagonal lantern with its glass band and pyramid.
 const RL=M.lantern*.86,rr=mobile?[R-2.2,48,26,RL]:[R-2.2,62,53,44,36,29,22,16,RL],rz=r=>Ze+2.2*(1-Math.pow(clamp((r-RL)/(R-2.2-RL),0,1),1.7));
 const roofCol=lin(0x8e8a81);
 for(let k=0;k<n;k++){const a0=M.phase+k*step,a1=a0+step;for(let i=0;i+1<rr.length;i++){const r0=rr[i],r1=rr[i+1],c=mul(roofCol,.86+rand()*.22);
  if(mobile)T.concrete.quad(P(a0,r0,rz(r0)),P(a1,r0,rz(r0)),P(a1,r1,rz(r1)),P(a0,r1,rz(r1)),c,[0,0,1]);
  else{const am=(a0+a1)/2;for(const [b0,b1] of [[a0,am],[am,a1]])T.concrete.quad(P(b0,r0,rz(r0)),P(b1,r0,rz(r0)),P(b1,r1,rz(r1)),P(b0,r1,rz(r1)),mul(c,.95+rand()*.1),[0,0,1]);}}
  if(!mobile){for(let i=0;i+1<rr.length;i++){const r0=rr[i],r1=rr[i+1],h=.45,w=.35,s=Math.sin(a0),c=Math.cos(a0),side=(sg)=>[-s*w*sg,c*w*sg,0];
    const A0=P(a0,r0,rz(r0)),A1=P(a0,r1,rz(r1)),up=(p,dz,sg)=>[p[0]-s*w*sg,p[1]+c*w*sg,p[2]+dz],col=lin(0x6f6b64);
    T.concrete.quad(up(A0,h,-1),up(A1,h,-1),up(A1,h,1),up(A0,h,1),col,[0,0,1]);for(const sg of [-1,1])T.concrete.quad(up(A0,-.1,sg),up(A1,-.1,sg),up(A1,h,sg),up(A0,h,sg),col,side(sg));}
   for(const r of [20,30]){const b=a0+step*.3,e=a0+step*.7;T.metal.quad(P(b,r-1,rz(r-1)+.06),P(e,r-1,rz(r-1)+.06),P(e,r+1,rz(r+1)+.06),P(b,r+1,rz(r+1)+.06),lin(0xe4e6e6),[0,0,1]);}}
 }
 const hexA=i=>Math.PI/2+i*Math.PI/3,zl0=rz(RL)-.2,zl1=zl0+1.7,hx=(i,r,z)=>P(hexA(i),r,z);
 for(let i=0;i<6;i++){const j=(i+1)%6,mid=(hexA(i)+hexA(i)+Math.PI/3)/2,o=[Math.cos(mid),Math.sin(mid),0];
  T.lit.quad(hx(i,M.lantern,zl0),hx(j,M.lantern,zl0),hx(j,M.lantern,zl1),hx(i,M.lantern,zl1),lin(0x56606a),o);
  T.metal.poly([hx(i,M.lantern+.4,zl1),hx(j,M.lantern+.4,zl1),[cx,cy,Ztop]],lin(0x8c8f8e),[o[0],o[1],1]);}
 lights.push({p:[cx,cy,zl1-.5],c:[1,.85,.6],i:.6,s:.8,g:2,on:.3,ph:.3});
 // Footbridges from the hill (north, east) to the upper concourse: deck at the far end's ground, parapets, a pier.
 for(const [deg,len] of M.bridges){const a=deg*Math.PI/180,end=P(a,R+len+2),zg=gAt(end[0],end[1]),zd=clamp(zg,Zb+4,Zh-3),f=frame(cx,cy,0,a),col=lin(0xbab4a6);
  T.concrete.box(f,R+1.6,R+len,-2.5,2.5,zd-.8,zd,col,{bottom:true});for(const s of [-1,1])T.concrete.box(f,R+1.6,R+len,s*2.5-.15*s-.15,s*2.5-.15*s+.15,zd,zd+1.1,col);
  const pm=f(R+len*.55,0,0),gm=gAt(pm[0],pm[1]);if(gm<zd-2)T.concrete.box(f,R+len*.55-.6,R+len*.55+.6,-1.2,1.2,gm-1,zd-.8,col,{top:false});}
 // Camera proxy: the drum to the hoods' rim.
 const proxy=new Batch(),ring=Array.from({length:32},(_,k)=>P(k/32*2*Math.PI,R+1.6));
 for(let k=0;k<32;k++){const a=ring[k],b=ring[(k+1)%32];proxy.quad([a[0],a[1],Zb-1],[b[0],b[1],Zb-1],[b[0],b[1],Ze],[a[0],a[1],Ze],[1,1,1],[a[0]+b[0]-2*cx,a[1]+b[1]-2*cy,0]);}
 proxy.poly(ring.map(p=>[p[0],p[1],Ze]),[1,1,1],[0,0,1]);proxies.push(proxy.mesh('Mineirinho_obstaculo',new THREE.MeshBasicMaterial(),false));
 const clear=[];for(let x=-R-8;x<=R+8;x+=9)for(let y=-R-8;y<=R+8;y+=9)if(Math.hypot(x,y)<=R+8)clear.push({x:cx+x,y:cy+y,r:7});
 // The slope's trees thinned along the sight lines from the nearest stretch of the lap (every 24 m within 260 m) to the
 // drum: its crown shows over the woods as from the lake shore; the trees by the road (18 m) stay.
 const S=data.samples;let lines=0;for(let i=0;i<S.length;i+=12){const p=S[i],dx=cx-p[1],dy=cy-p[2],d=Math.hypot(dx,dy);if(d>260||d<R+20)continue;lines++;for(let t=18;t<d-R+2;t+=9)clear.push({x:p[1]+dx/d*t,y:p[2]+dy/d*t,r:4.5});}
 stats.sightLines=lines;
 return {stats,clearings:clear};
}

const BUILDERS={mineirao,mineirinho};

export function createPampulhaEstadios(data,{ground,mobile=false}={}){
 const root=new THREE.Group();root.name='Marcos_Pampulha_Estadios';
 const marks=(data.scenery?.landmarks??[]).filter(m=>BUILDERS[m.kind]),stats={landmarks:marks.length,mobile,built:{}};
 if(!marks.length)return {root,obstacles:[],clearings:[],stats,update(){}};
 const gridAt=(x,y)=>{const g=ground?.(x,y);if(g!=null&&Number.isFinite(g))return g;return gridHeight(data.terrain,x,y);};
 const lap=lapSpace(data),rand=random(5741),origin=data.meta?.origin_utm??null;
 const glow={uPeGlow:{value:0},uPeWarm:{value:new THREE.Color(1,.62,.3)}},facade={value:0};
 const textures={concrete:TEX.concrete(),seats:TEX.seats(),pitch:TEX.pitch(),signs:TEX.signs()};
 const materials={
  concrete:concreteMaterial('Estadios_concreto',textures.concrete,{seed:3.7,night:{uPeFacade:facade}}),
  paint:new THREE.MeshStandardMaterial({name:'Estadios_pintura',vertexColors:true,roughness:.8,metalness:0}),
  metal:new THREE.MeshStandardMaterial({name:'Estadios_metal',vertexColors:true,roughness:.35,metalness:.5}),
  membrane:membraneMaterial(),
  seats:new THREE.MeshStandardMaterial({name:'Estadios_cadeiras',map:textures.seats,vertexColors:true,roughness:.75,metalness:0}),
  pitch:new THREE.MeshStandardMaterial({name:'Estadios_gramado',map:textures.pitch,emissiveMap:textures.pitch,emissive:0xffffff,emissiveIntensity:0,vertexColors:true,roughness:.95,metalness:0,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2}),
  // Boards and letters (alpha-tested atlas), lit a little after dark.
  signs:new THREE.MeshStandardMaterial({name:'Estadios_placas',map:textures.signs,emissiveMap:textures.signs,emissive:0xffffff,emissiveIntensity:0,alphaTest:.5,side:THREE.DoubleSide,roughness:.55,metalness:0}),
  lit:litMaterial('Estadios_aberturas',glow),
  // The esplanade's paving laid over the ground: pulled toward the eye so it never fights the terrain.
  paving:new THREE.MeshStandardMaterial({name:'Estadios_esplanada',vertexColors:true,roughness:.9,metalness:0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4})
 };
 const SIZES={concrete:8},T=Object.fromEntries(Object.keys(materials).map(k=>[k,new Batch(SIZES[k]??0)]));
 const lights=[],proxies=[],clearings=[],solids=[],fence=new Batch(),tris={},count=()=>Object.values(T).reduce((s,b)=>s+b.triangles,0);
 // A sign: the atlas rectangle on quad a-b-c-d (bottom left, bottom right, top right, top left as read); a board: one
 // centred at c facing o, w × h, with a plain back panel (the letters are cut out).
 const sign=(a,b,c,d,key,o)=>{const [x0,y0,x1,y1]=SIGNS[key],u0=(x0+2)/1024,u1=(x1-2)/1024,v0=1-(y1-2)/1064,v1=1-(y0+2)/1064;T.signs.quad(a,b,c,d,[1,1,1],o,[[u0,v0],[u1,v0],[u1,v1],[u0,v1]]);};
 const board=(c,o,w,h,key)=>{const r=[-o[1],o[0]],p=(x,z,k)=>[c[0]+r[0]*x-o[0]*k,c[1]+r[1]*x-o[1]*k,c[2]+z];sign(p(-w/2,-h/2,0),p(w/2,-h/2,0),p(w/2,h/2,0),p(-w/2,h/2,0),key,o);
  T.paint.quad(p(-w/2-.06,-h/2-.06,.05),p(w/2+.06,-h/2-.06,.05),p(w/2+.06,h/2+.06,.05),p(-w/2-.06,h/2+.06,.05),lin(0x30343a),[-o[0],-o[1],0]);};
 const base={T,mobile,rand,lights,proxies,origin,lap,data,solids,fence,sign,board};
 for(const m of marks){
  const before=count(),fallback=m.ground??0,K={...base,gAt:(x,y)=>gridAt(x,y)??fallback};
  try{const r=BUILDERS[m.kind](m,K);stats.built[m.kind]=r.stats;clearings.push(...r.clearings);}
  catch(e){console.warn('Estádio da Pampulha não montado:',m.kind,e);stats.built[m.kind]={error:String(e)};continue;}
  tris[m.kind]=count()-before;
 }
 // The way in from the lap (the arch, the board, the closure), then every solid of ours into the roam zone.
 try{stats.approaches=approaches(data,{...base,gAt:(x,y)=>gridAt(x,y)??0});}catch(e){console.warn('Acessos do Mineirão não montados:',e);stats.approaches={error:String(e)};}
 stats.roamSolids=data.meta?.roam?addRoamSolids(data,solids):0;
 // Driving space: no vertex of ours over the lap's asphalt and walls (up to DRIVE metres over the road), nor in the
 // pit lane with its walls and garages (any height).
 const drive={checked:0,violations:0,worst:null,where:{}},pitSpace={violations:0,worst:null};
 for(const [k,b] of [...Object.entries(T),['fence',fence]])for(let v=0;v<b.p.length;v+=3){
  const x=b.p[v],y=-b.p[v+2],z=b.p[v+1];drive.checked++;
  for(const h of lap.at(x,y)){const over=z-h.road;if(Math.abs(h.lat)<h.back+.3&&over>-.05&&over<DRIVE){drive.violations++;const key=k+'@'+Math.round(h.s/10)*10;drive.where[key]=(drive.where[key]??0)+1;if(!drive.worst||Math.abs(h.lat)<Math.abs(drive.worst.lat))drive.worst={material:k,s:+h.s.toFixed(1),lat:+h.lat.toFixed(2),over:+over.toFixed(2),x:+x.toFixed(1),y:+y.toFixed(1)};}}
  if(lap.inPit(x,y)){pitSpace.violations++;pitSpace.worst??={material:k,x:+x.toFixed(1),y:+y.toFixed(1),z:+z.toFixed(1)};}
 }
 let drawCalls=0,triangles=0;const parts={};
 for(const [k,b] of Object.entries(T)){if(!b.vertices)continue;root.add(b.mesh('Estadios_'+k,materials[k],k!=='pitch'&&k!=='paving'));drawCalls++;triangles+=b.triangles;parts[k]=b.triangles;}
 // The closure's chain link: the pits' wire mesh (interlagos-pit.js), drawn after the opaque world.
 if(fence.vertices){const mat=chainLinkMaterial(),f=fence.mesh('Estadios_alambrado',mat,true);f.renderOrder=1;f.onBeforeRender=renderer=>mat.userData.onPass(renderer);root.add(f);drawCalls++;triangles+=fence.triangles;parts.fence=fence.triangles;}
 // After dark: the floodlights (cold), the façade's lamps and the Mineirinho's hoods (warm), as glowing sprites.
 const night=lightUniforms(),G=night.uGroups.value;G[0].set(1,1,1,3.2);G[1].set(1,1,1,1.6);G[2].set(1,1,1,1.4);
 const glowLights=lights.length?nightLights(lights,night,{name:'Estadios_luzes_noite',minPx:mobile?1.6:1.8,floor:.5,fogKeep:.4}):null;
 if(glowLights){root.add(glowLights.mesh);drawCalls++;}
 for(const o of proxies)o.updateMatrixWorld(true);
 root.updateMatrixWorld(true);
 Object.assign(stats,{drawCalls,triangles,trianglesK:Math.round(triangles/1000),parts,perLandmark:tris,driveSpace:drive,pitSpace,clearings:clearings.length,cameraObstacles:proxies.length,night:{level:0,lights:lights.length}});
 let lit=0;
 // 0 by day; dusk (.45) brings the floodlights and the lamps on; full at night lights the pitch and the membrane.
 function setNight(level){
  lit=level;night.uNight.value=level;stats.night.level=level;glow.uPeGlow.value=level*1.6;facade.value=level*.2;
  materials.pitch.emissiveIntensity=level*.32;materials.membrane.emissiveIntensity=level*.3;materials.signs.emissiveIntensity=level*.45;
  if(glowLights)glowLights.mesh.visible=level>0;
 }
 function update(dt){if(lit>0){night.uTime.value+=dt;night.uScreen.value=screenHalf(mobile);}}
 return {root,obstacles:proxies,clearings,stats,update,setNight};
}
// Whether a track file carries this module's landmarks (main.js builds them then).
export const hasPampulhaEstadios=data=>(data.scenery?.landmarks??[]).some(m=>m.kind==='mineirao'||m.kind==='mineirinho');
