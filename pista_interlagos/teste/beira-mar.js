import * as THREE from 'three';
import {onDeck} from './physics.js';
import {sceneryBands} from './track-clearance.js';
import {canvasTexture} from './pit-textures.js';
import {createPeople} from './pit-crew.js';
import {billboardSpots} from './track-surface.js';
import {marshalSpots,towerSpots} from './trackside.js';
import {flagSpots,FLAG_WIND} from './trackside-flags.js';

// Florianópolis' seafront round the street circuit (Floripa, data.scenery.city.coast and .piers, gerar_cidade_floripa.py):
// the start of the Beira-Mar Norte past the Forte de Santana, the Av. Osvaldo Rodrigues Cabral shore down to the Aterro
// da Baía Sul under the bridges' island heads, and across the strait the Estreito shore between the bridges' continental
// heads, the fishermen's trapiches and the Beira-Mar Continental going north. The ground shader already paints the
// calçadão, the red cycleways and the lawns; this module builds what stands on and below them:
// - the sea edge: a rock armour (enrocamento) of quarried granite blocks piled from under the water up to the promenade,
//   wet, dark and green at the tide line, over a dark bedding that hides the terrain grid's crude ramp at the shore;
//   along the promenades a low concrete wall (Beira-Mar Norte) or a curb with a railing (the others);
// - on the calçadão: coconut palms, jerivás and imperial palms (each its own height, lean, crown and beat in the wind),
//   lamp posts (lit at night), benches facing the sea, bins, kiosks with joke names, outdoor gyms and wooden mirantes
//   over the rocks;
// - the trapiches at their OSM positions, on posts, some with railings and lamps, fishing boats moored at a few;
// - life: people walking, jogging and cycling along the promenade, others on the benches watching the race, at the
//   railings, and fishing from the rocks and the piers.
// The coast comes as OSM coastline pieces (land on the left); they are joined, resampled every metre and each station
// finds the real waterline and the edge of the land in the visible ground along its normal. Static things are merged by
// stretch of shore (six meshes, one material: vertex colours, flat facets, procedural granite / planks / bark in the
// shader, palm sway and lamp glow by vertex); moving people are one instanced mesh animated in its vertex shader, the
// boats another; the idle people are pit-crew.js crowds. Nothing stands on the track's corridor, beside the bridge
// decks (sceneryBands 'ponte'), on the stands, the trackside furniture, the landmarks or the buildings.

function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
const lin=(hex,k=1)=>{const c=new THREE.Color(hex);return [c.r*k,c.g*k,c.b*k];};
const mixc=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const mulc=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const TAU=Math.PI*2;

// --- Geometry gathered per stretch, in track coordinates (x east, y north, z up), stored in three's axes.
// extra = [sway amplitude (m), sway phase, glow (lit at night), surface: 1 granite, 2 planks (axis angle in phase),
// 3 palm bark rings, 4 concrete].
const E0=[0,0,0,0],ROCK=[0,0,0,1],CONC=[0,0,0,4],GLOW=[0,0,1,0];
const plank=angle=>[0,angle,0,2];
const PLAIN=[.125,.9375];
const PHI=(1+Math.sqrt(5))/2;
const ICO_V=[[-1,PHI,0],[1,PHI,0],[-1,-PHI,0],[1,-PHI,0],[0,-1,PHI],[0,1,PHI],[0,-1,-PHI],[0,1,-PHI],[PHI,0,-1],[PHI,0,1],[-PHI,0,-1],[-PHI,0,1]].map(v=>{const l=Math.hypot(...v);return v.map(c=>c/l);});
const ICO_F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
const BOX_V=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
const BOX_F=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
class Geo{
 constructor(){this.p=[];this.c=[];this.t=[];this.e=[];this.i=[];}
 get n(){return this.p.length/3;}
 v(x,y,z,c,e=E0,uv=PLAIN){this.p.push(x,z,-y);this.c.push(c[0],c[1],c[2]);this.e.push(e[0],e[1],e[2],e[3]);this.t.push(uv[0],uv[1]);return this.n-1;}
 quad(a,b,c,d){this.i.push(a,b,c,a,c,d);}
 face(A,B,C,D,col,e=E0,uvs=null){const a=this.v(...A,col,e,uvs?.[0]),b=this.v(...B,col,e,uvs?.[1]),c=this.v(...C,col,e,uvs?.[2]),d=this.v(...D,col,e,uvs?.[3]);this.quad(a,b,c,d);}
 // An upright box: bottom centre (x, y, z), half lengths a along the heading and b across it, height h.
 box(x,y,z,a,b,h,heading,col,e=E0,top=col){
  const cs=Math.cos(heading),sn=Math.sin(heading),k=this.n;
  for(const [u,v,w] of BOX_V)this.v(x+u*a*cs-v*b*sn,y+u*a*sn+v*b*cs,z+(w>0?h:0),w>0?top:col,e);
  for(const f of BOX_F)this.i.push(k+f[0],k+f[1],k+f[2]);
 }
 // A square beam from A to B, w across (horizontal) by h (its own up).
 beam(A,B,w,h,col,e=E0){
  const d=[B[0]-A[0],B[1]-A[1],B[2]-A[2]],l=Math.hypot(...d)||1,t=d.map(q=>q/l);
  let s=Math.abs(t[2])>.95?[1,0,0]:[t[1],-t[0],0];const sl=Math.hypot(...s);s=s.map(q=>q/sl);
  const u=[s[1]*t[2]-s[2]*t[1],s[2]*t[0]-s[0]*t[2],s[0]*t[1]-s[1]*t[0]],k=this.n;
  for(const [a,b,c] of BOX_V){const P=c>0?B:A;this.v(P[0]+s[0]*a*w/2+u[0]*b*h/2,P[1]+s[1]*a*w/2+u[1]*b*h/2,P[2]+s[2]*a*w/2+u[2]*b*h/2,col,e);}
  for(const f of BOX_F)this.i.push(k+f[0],k+f[1],k+f[2]);
 }
 // An n-sided tube from A (radius r0) to B (r1); a cap over B.
 tube(A,B,r0,r1,n,col,e=E0,cap=true,e1=e){
  const d=[B[0]-A[0],B[1]-A[1],B[2]-A[2]],l=Math.hypot(...d)||1,t=d.map(q=>q/l);
  let s=Math.abs(t[2])>.95?[1,0,0]:[t[1],-t[0],0];const sl=Math.hypot(...s);s=s.map(q=>q/sl);
  const u=[s[1]*t[2]-s[2]*t[1],s[2]*t[0]-s[0]*t[2],s[0]*t[1]-s[1]*t[0]],k=this.n;
  for(const [P,r,ee] of [[A,r0,e],[B,r1,e1]])for(let j=0;j<n;j++){const a=j/n*TAU,c=Math.cos(a)*r,q=Math.sin(a)*r;this.v(P[0]+s[0]*c+u[0]*q,P[1]+s[1]*c+u[1]*q,P[2]+s[2]*c+u[2]*q,col,ee);}
  for(let j=0;j<n;j++){const j1=(j+1)%n;this.quad(k+j,k+j1,k+n+j1,k+n+j);}
  if(cap)for(let j=1;j<n-1;j++)this.i.push(k+n,k+n+j,k+n+j+1);
 }
 // A convex blob (rock, coconut, lamp globe): icosahedron corners scaled per axis, turned by yaw, colour per corner.
 blob(x,y,z,sx,sy,sz,yaw,col,e=E0,jag=null){
  const cs=Math.cos(yaw),sn=Math.sin(yaw),k=this.n;
  ICO_V.forEach((q,j)=>{const r=jag?jag[j]:1,lx=q[0]*sx*r,ly=q[1]*sy*r,lz=q[2]*sz*r,X=x+lx*cs-ly*sn,Y=y+lx*sn+ly*cs,Z=z+lz;this.v(X,Y,Z,typeof col==='function'?col(X,Y,Z,lz/sz):col,e);});
  for(const f of ICO_F)this.i.push(k+f[0],k+f[1],k+f[2]);
 }
 get triangles(){return this.i.length/3;}
 build(){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(this.t,2));g.setAttribute('extra',new THREE.Float32BufferAttribute(this.e,4));
  g.setIndex(this.n>65535?new THREE.Uint32BufferAttribute(this.i,1):new THREE.Uint16BufferAttribute(this.i,1));
  g.computeVertexNormals();g.computeBoundingSphere();return g;
 }
}

// --- One material for everything that stands still. Flat facets (shading from the screen-space derivatives: rocks
// read as cut granite, fronds light from whichever side is seen); the surfaces come from the shader by world position,
// so nothing tiles: granite grain, planks across a deck's axis, the leaf-scar rings of a coconut trunk, mottled
// concrete. The splash zone darkens and turns glossy toward the water line; palms sway, lamps glow at night.
function staticMaterial(atlas,U,level){
 const m=new THREE.MeshStandardMaterial({name:'Beira_mar',vertexColors:true,map:atlas,roughness:.86,metalness:0,flatShading:true,side:THREE.DoubleSide});
 const wx=FLAG_WIND[0].toFixed(3),wz=(-FLAG_WIND[1]).toFixed(3);
 m.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,U);
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute vec4 extra;uniform float bmTime;varying vec4 vBm;varying vec3 vBmWorld;`).replace('#include <begin_vertex>',`#include <begin_vertex>
// The sea breeze: a slow lean and a quicker flutter, each palm on its own phase and each frond a beat of its own from
// where it points.
if(extra.x>0.){float fl=extra.y+dot(position.xz,vec2(.37,.61));float s=sin(bmTime*1.05+extra.y)*.6+sin(bmTime*2.4+fl*1.7)*.4;
 transformed.x+=${wx}*extra.x*s;transformed.z+=${wz}*extra.x*s;transformed.y-=abs(s)*extra.x*.12;}
vBm=extra;`).replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
vBmWorld=(modelMatrix*vec4(transformed,1.)).xyz;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform float bmNight;varying vec4 vBm;varying vec3 vBmWorld;
float bmHash(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}`).replace('#include <color_fragment>',`#include <color_fragment>
float bmKind=vBm.w,bmFade;
if(bmKind>.5){
 if(bmKind<1.5){vec3 c=vBmWorld*13.;bmFade=clamp(length(fwidth(c))*.6,0.,1.);diffuseColor.rgb*=mix(.78+.42*bmHash(floor(c)),1.,bmFade);}
 else if(bmKind<2.5){
  // Deck boards 14.5 cm wide across the axis, 1.5 cm gaps, each board its tone and its butt joints.
  vec2 p=vec2(vBmWorld.x,-vBmWorld.z),ax=vec2(cos(vBm.y),sin(vBm.y));float u=dot(p,ax)/.145,v=dot(p,vec2(-ax.y,ax.x));
  float b=floor(u),f=fract(u);bmFade=clamp(fwidth(u)*1.2,0.,1.);float seg=floor(v/2.6+bmHash(vec3(b,1.,2.))*3.);
  float tone=.78+.36*bmHash(vec3(b,seg,3.)),gap=smoothstep(0.,.1,f)*smoothstep(1.,.9,f);
  diffuseColor.rgb*=mix(tone*mix(.32,1.,gap),.92,bmFade);}
 else if(bmKind<3.5){float r=vBmWorld.y/.075;bmFade=clamp(fwidth(r),0.,1.);diffuseColor.rgb*=mix(.7+.32*smoothstep(.1,.65,fract(r)),.88,bmFade);}
 else{vec3 c=vBmWorld*2.7;bmFade=clamp(length(fwidth(c))*.6,0.,1.);diffuseColor.rgb*=mix(.9+.14*bmHash(floor(c)),1.,bmFade);}
}
// Wetted by the tide and the chop: darker toward the water line.
float bmWet=1.-smoothstep(${(level+.04).toFixed(2)},${(level+.6).toFixed(2)},vBmWorld.y);diffuseColor.rgb*=1.-.42*bmWet;`).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
roughnessFactor=mix(roughnessFactor,.28,bmWet);`).replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
totalEmissiveRadiance+=diffuseColor.rgb*vBm.z*bmNight*7.;`);
 };
 m.customProgramCacheKey=()=>'beira-mar-v1';
 return m;
}

// --- Signs: kiosks with joke names (the game's humour, never a business that could exist), public signage.
const KIOSKS=[['QUIOSQUE MARÉ BAIXA','pastel de vento · caldo de cana','#1d6f8c','#fff7e0'],['CALDO DE CANA DO MANÉ','garapa até a bandeirada','#2f8a3a','#fff3b0'],
 ['COCO GELADO SEM PRESSA','gelado quando der','#f2c230','#1d3b2a'],['PASTEL DA TAINHA FUJONA','recheio grátis: vento','#c0392b','#fff3e0'],
 ['SORVETE DERRETE LOGO','chupa rápido, piloto!','#8e44ad','#ffffff'],['BAR DO SIRI CAMBOTA','cerveja gelada (mentira)','#e67e22','#1a1a1a'],
 ['MILHO VERDE TURBINADO','espiga com nitro','#f4d03f','#5b2c06'],['AÇAÍ DO PNEU CARECA','grosso que nem óleo do vô','#4a235a','#f5e6ff']];
const SIGNS={academia:['ACADEMIA AO AR LIVRE','use com moderação','#1e7a46','#ffffff'],mirante:['MIRANTE','não suba no guarda-corpo','#24527a','#ffffff'],
 pesca:['TRAPICHE','pesca permitida · não pule','#7a4a24','#fff6e0'],pedras:['CUIDADO','pedras escorregadias','#f2c230','#1a1a1a']};
function signAtlas(){
 const list=[...KIOSKS,...Object.values(SIGNS)];
 const map=canvasTexture((ctx,w,h)=>{
  ctx.fillStyle='#fff';ctx.fillRect(0,0,256,64);
  list.forEach(([title,sub,bg,fg],k)=>{
   const c=k+1,x=(c%4)*256,y=Math.floor(c/4)*64;
   ctx.fillStyle=bg;ctx.fillRect(x,y,256,64);ctx.strokeStyle='rgba(0,0,0,.35)';ctx.lineWidth=4;ctx.strokeRect(x+2,y+2,252,60);
   ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';
   ctx.font='900 25px "Arial Black","Arial Bold",Arial,sans-serif';ctx.fillText(title,x+128,y+25,240);
   ctx.font='italic bold 14px Arial,sans-serif';ctx.fillText(sub,x+128,y+49,236);
  });
 },1024,512);
 map.generateMipmaps=true;
 return {map,cell:k=>{const c=k+1,x=(c%4)*256,y=Math.floor(c/4)*64,u0=x/1024,u1=(x+256)/1024,v0=1-(y+64)/512,v1=1-y/512;return [[u0,v0],[u1,v0],[u1,v1],[u0,v1]];},kiosk:k=>k%KIOSKS.length,sign:name=>KIOSKS.length+Object.keys(SIGNS).indexOf(name)};
}

// --- What has to stay clear: the track's bands (fast lookup by cell), buildings, landmarks, trackside furniture,
// and what this module already placed.
function bandField(data){
 const cell=24,reach=44,grid=new Map(),key=(i,j)=>i*100003+j;
 for(const band of sceneryBands(data)){
  if(!band.points?.length)continue;const a=band.points,n=a.length,last=band.closed?n:n-1;
  const name=band.name==='pit_lane'||band.name==='boxes'?'pit':band.name==='arquibancada'?'stand':band.name==='ponte'?'ponte':band.name==='pista'?'pista':'other';
  for(let i=0;i<last;i++){
   const p=a[i],q=a[(i+1)%n],pc=(p[4]+p[5])/2,qc=(q[4]+q[5])/2;
   const s={name,i,ax:p[0]+p[2]*pc,ay:p[1]+p[3]*pc,bx:q[0]+q[2]*qc,by:q[1]+q[3]*qc,ha:(p[5]-p[4])/2+band.margin,hb:(q[5]-q[4])/2+band.margin};
   const r=Math.max(s.ha,s.hb)+reach;
   for(let gi=Math.floor((Math.min(s.ax,s.bx)-r)/cell);gi<=Math.floor((Math.max(s.ax,s.bx)+r)/cell);gi++)
    for(let gj=Math.floor((Math.min(s.ay,s.by)-r)/cell);gj<=Math.floor((Math.max(s.ay,s.by)+r)/cell);gj++){const k=key(gi,gj);let l=grid.get(k);if(!l)grid.set(k,l=[]);l.push(s);}
  }
 }
 const out={pista:Infinity,ponte:Infinity,pit:Infinity,stand:Infinity,other:Infinity,i:-1};
 // Distances (m, negative inside) from each band, within `reach`; i: the lap sample of the nearest asphalt.
 return (x,y)=>{
  out.pista=out.ponte=out.pit=out.stand=out.other=Infinity;out.i=-1;
  for(const s of grid.get(key(Math.floor(x/cell),Math.floor(y/cell)))??[]){
   const dx=s.bx-s.ax,dy=s.by-s.ay;let u=((x-s.ax)*dx+(y-s.ay)*dy)/(dx*dx+dy*dy||1e-9);u=u<0?0:u>1?1:u;
   const e=Math.hypot(x-s.ax-u*dx,y-s.ay-u*dy)-(s.ha+(s.hb-s.ha)*u);
   if(e<out[s.name]){out[s.name]=e;if(s.name==='pista')out.i=u<.5?s.i:s.i+1;}
  }
  return out;
 };
}
class Blockers{
 constructor(cell=16){this.cell=cell;this.g=new Map();}
 add(x0,y0,x1,y1,test){const c=this.cell;for(let i=Math.floor(x0/c);i<=Math.floor(x1/c);i++)for(let j=Math.floor(y0/c);j<=Math.floor(y1/c);j++){const k=i*100003+j;let l=this.g.get(k);if(!l)this.g.set(k,l=[]);l.push(test);}}
 circle(x,y,r){const m=r+8;this.add(x-m,y-m,x+m,y+m,(px,py,pr)=>Math.hypot(px-x,py-y)<r+pr);}
 rect(x,y,a,b,h){const cs=Math.cos(h),sn=Math.sin(h),m=Math.hypot(a,b)+8;this.add(x-m,y-m,x+m,y+m,(px,py,pr)=>{const dx=px-x,dy=py-y;return Math.abs(dx*cs+dy*sn)<a+pr&&Math.abs(-dx*sn+dy*cs)<b+pr;});}
 ring(pts){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const [x,y] of pts){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  this.add(x0-8,y0-8,x1+8,y1+8,(px,py,pr)=>{
   let inside=false,best=Infinity;
   for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const [ax,ay]=pts[j],[bx,by]=pts[i];if((by>py)!==(ay>py)&&px<(ax-bx)*(py-by)/(ay-by)+bx)inside=!inside;
    const dx=bx-ax,dy=by-ay;let u=((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy||1e-9);u=u<0?0:u>1?1:u;best=Math.min(best,Math.hypot(px-ax-u*dx,py-ay-u*dy));
   }
   return inside||best<pr;
  });
 }
 hit(x,y,r=0){const l=this.g.get(Math.floor(x/this.cell)*100003+Math.floor(y/this.cell));if(!l)return false;for(const t of l)if(t(x,y,r))return true;return false;}
}

// --- The coast: OSM pieces joined end to end into runs, resampled every STEP metres with a smoothed tangent and the
// normal to the land (on the left of the way).
const STEP=1;
function coastRuns(coast){
 const left=coast.filter(p=>p.length>1).map(p=>p.map(q=>[q[0],q[1]])),runs=[],near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1;
 while(left.length){
  let run=left.shift(),grown=true;
  while(grown){grown=false;
   for(let j=0;j<left.length;j++){const q=left[j];
    if(near(run.at(-1),q[0])){run=run.concat(q.slice(1));left.splice(j,1);grown=true;break;}
    if(near(q.at(-1),run[0])){run=q.concat(run.slice(1));left.splice(j,1);grown=true;break;}}
  }
  runs.push(run);
 }
 return runs.map(pts=>{
  const acc=[0];for(let i=1;i<pts.length;i++)acc.push(acc[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
  const total=acc.at(-1),at=s=>{s=clamp(s,0,total);let i=1;while(i<acc.length-1&&acc[i]<s)i++;const u=(s-acc[i-1])/((acc[i]-acc[i-1])||1);return [pts[i-1][0]+(pts[i][0]-pts[i-1][0])*u,pts[i-1][1]+(pts[i][1]-pts[i-1][1])*u];};
  const st=[];if(total<10)return st;
  for(let s=0;s<=total;s+=STEP){const [x,y]=at(s),[ax,ay]=at(s-4),[bx,by]=at(s+4),l=Math.hypot(bx-ax,by-ay)||1;st.push({s,x,y,tx:(bx-ax)/l,ty:(by-ay)/l,nx:-(by-ay)/l,ny:(bx-ax)/l});}
  return st;
 }).filter(st=>st.length>10);
}
// Which seafront a point belongs to, from where it is (robust to the data being regenerated): the island side east of the
// strait, the continent west of it.
function styleAt(x,y){
 if(x>-150)return y>395?'norte':y>200&&x<130?'forte':y>-20?'osvaldo':'aterro';
 return y>150?'continental':y>-240?'estreito':'sul';
}
const STYLES={
 // Beira-Mar Norte: granite armour under a low concrete wall, coconut palms and jerivás, white lamp posts.
 norte:{edge:'mureta',rail:null,lamp:'branco',lampGap:[24,31],rock:[.85,1.6],palms:[['coqueiro',.7],['jeriva',.3]],palmGap:[7,13],benches:.85,kiosks:2,gyms:1,decks:1},
 // The point under the bridge's island head round the fort: rounded natural boulders, nothing built on the edge.
 forte:{edge:null,rail:null,lamp:null,rock:[1.1,2.3],natural:true,palms:[['coqueiro',.6],['jeriva',.4]],palmGap:[15.6,28.6],benches:0},
 // Av. Osvaldo Rodrigues Cabral down to the Parque Náutico: a curb and a galvanised railing.
 osvaldo:{edge:'meiofio',rail:'galvanizado',lamp:'branco',lampGap:[26,32],rock:[.8,1.5],palms:[['coqueiro',.75],['jeriva',.25]],palmGap:[10.4,19.5],benches:.7,kiosks:1,gyms:0,decks:0},
 // The Aterro da Baía Sul: armour against the park's lawns, tall double lamps, imperial palms in lines.
 aterro:{edge:'meiofio',rail:null,railSome:.3,concrete:true,lamp:'alto',lampGap:[30,38],rock:[.9,1.65],palms:[['coqueiro',.45],['imperial',.35],['jeriva',.2]],palmGap:[11.7,22.1],benches:.55,kiosks:1,gyms:1,decks:0},
 // Estreito, between the bridges' continental heads: white railing, the fishermen's trapiches.
 estreito:{edge:'meiofio',rail:'branco',lamp:'escuro',lampGap:[25,32],rock:[.8,1.55],palms:[['coqueiro',.8],['jeriva',.2]],palmGap:[10.4,19.5],benches:.75,kiosks:1,gyms:0,decks:1},
 sul:{edge:'meiofio',rail:null,railSome:.25,lamp:'escuro',lampGap:[30,38],rock:[.85,1.6],palms:[['coqueiro',.7],['jeriva',.3]],palmGap:[13,24.7],benches:.5,kiosks:0,gyms:0,decks:0},
 // Beira-Mar Continental: calçadão and cycleway, white railing, decks over the rocks, kiosks and a gym.
 continental:{edge:'meiofio',rail:'branco',lamp:'escuro',lampGap:[24,30],rock:[.8,1.55],palms:[['coqueiro',.85],['jeriva',.15]],palmGap:[7,13],benches:.9,kiosks:2,gyms:1,decks:2},
};

// --- Palms, each built whole (no two alike): height, lean, crown, frond age and colour, sway amplitude and phase.
const PALMS={
 coqueiro:{h:[6,12.5],lean:[.3,2.6],radius:t=>.2*(1-.38*t)+.07*Math.max(0,.15-t)/.15,segs:8,fronds:[14,18],el:[1,-.6],len:[3.3,4.5],droop:1.25,width:.6,
  green:[lin(0x4f7228),lin(0x8f9038)],bark:lin(0x857a6b),rings:true,sway:.32,nuts:true},
 jeriva:{h:[7,12],lean:[0,.5],radius:t=>.17*(1-.15*t),segs:7,fronds:[11,14],el:[.9,-.4],len:[3,4],droop:1.7,width:.52,green:[lin(0x3d5b22),lin(0x6b7a30)],bark:lin(0x8c8882),rings:false,sway:.28},
 imperial:{h:[13,19],lean:[0,.25],radius:t=>.26+.06*Math.sin(Math.PI*Math.min(1,t*1.5))-.07*t,segs:8,fronds:[12,15],el:[.8,-.3],len:[3.6,4.7],droop:1.05,width:.58,
  green:[lin(0x3c6726),lin(0x6a8a34)],bark:lin(0xb7b4ad),rings:false,sway:.24,shaft:2.3},
};
function palm(g,x,y,z,kind,sea,rand,light){
 const P=PALMS[kind],H=P.h[0]+rand()*(P.h[1]-P.h[0]),lean=P.lean[0]+rand()**1.5*(P.lean[1]-P.lean[0]);
 // Coconut palms on a seafront lean out toward the sea and the open sky; the others stand nearly upright.
 const dir=kind==='coqueiro'?sea+(rand()-.5)*1.7:rand()*TAU,dx=Math.cos(dir),dy=Math.sin(dir),phase=rand()*TAU,amp=P.sway*H/9;
 const centre=t=>[x+dx*lean*t**1.8,y+dy*lean*t**1.8,z+H*t-.15];
 const segs=light?4:Math.min(6,P.segs),sides=light?5:6,bark=mulc(P.bark,.85+rand()*.3);let prev=null;
 for(let k=0;k<=segs;k++){
  const t=k/segs,c=centre(t),r=P.radius(t),ring=[];
  for(let j=0;j<sides;j++){const a=j/sides*TAU+k*.45;ring.push(g.v(c[0]+Math.cos(a)*r,c[1]+Math.sin(a)*r,c[2],mulc(bark,.88+.2*rand()-.1*(1-t)),[amp*t*t,phase,0,P.rings?3:4]));}
  if(prev)for(let j=0;j<sides;j++){const j1=(j+1)%sides;g.quad(prev[j],prev[j1],ring[j1],ring[j]);}
  prev=ring;
 }
 let top=centre(1);const sw=[amp,phase,0,0];
 if(P.shaft){const T2=[top[0],top[1],top[2]+P.shaft];g.tube(top,T2,P.radius(1)*.95,P.radius(1)*.8,light?5:7,mulc(lin(0x6d8f3a),.9+.2*rand()),sw);top=T2;}
 else g.blob(top[0],top[1],top[2]+.1,.3,.3,.35,0,mulc(bark,.7),sw);
 const n=P.fronds[0]+Math.floor(rand()*(P.fronds[1]-P.fronds[0]+1))-(light?5:0),fs=light?3:4,wind=Math.atan2(FLAG_WIND[1],FLAG_WIND[0]);
 for(let j=0;j<n;j++){
  // Young fronds stand up in the middle, old ones droop below; the wind combs the crown a little downwind.
  let az=j/n*TAU+(rand()-.5)*.55;az+=Math.sin(az-wind)*-.18;
  const age=rand(),el=P.el[0]+(P.el[1]-P.el[0])*age,len=(P.len[0]+rand()*(P.len[1]-P.len[0]))*(1-.15*age),droop=P.droop*(.7+.6*rand()),w=P.width*(.8+.4*rand());
  let col=mixc(P.green[0],P.green[1],clamp(age*.75+rand()*.3,0,1));if(age>.9&&rand()<.6)col=lin(0x8a6a3a,.8+.3*rand());col=mulc(col,.85+.3*rand());
  const ca=Math.cos(az),sa=Math.sin(az),side=[-sa,ca],fold=.55+.25*rand(),pts=[];let p=[top[0]+ca*.15,top[1]+sa*.15,top[2]-.05];
  for(let k=0;k<=fs;k++){pts.push(p);const ang=el-droop*(k/fs)**1.5,d=len/fs;p=[p[0]+ca*Math.cos(ang)*d,p[1]+sa*Math.cos(ang)*d,p[2]+Math.sin(ang)*d];}
  // Leaflets: separate blades hanging off both sides of the rachis, raked toward the tip, longest mid-frond.
  const at=u=>{const f=u*fs,i=Math.min(fs-1,Math.floor(f));return mixc(pts[i],pts[i+1],f-i);},T=light?2:3;
  for(let k=0;k<fs;k++)for(let j=0;j<T;j++){
   const u0=(k+j/T)/fs,u1=(k+(j+.85)/T)/fs,um=(k+(j+.45)/T)/fs,wk=w*1.2*Math.sin(Math.PI*Math.min(1,um*1.04+.07))**.7;
   const e=[amp+.38*um*len/4,phase,0,0],c=mixc(col,lin(0x9b8a4a),um*um*.5),a=at(u0),b=at(u1),m=at(Math.min(1,um+.07));
   for(const sd of [1,-1]){const i0=g.v(...a,mulc(c,1.1),e),i1=g.v(...b,mulc(c,1.1),e),i2=g.v(m[0]+side[0]*wk*sd,m[1]+side[1]*wk*sd,m[2]-wk*fold,mulc(c,.92+.16*rand()),e);g.i.push(i0,i1,i2);}
  }
 }
 // Dead fronds hanging against the trunk (a skirt on the untended ones) and the coconuts.
 if(!light&&kind!=='imperial'&&rand()<.55)for(let j=0,m=1+Math.floor(rand()*3);j<m;j++){
  const az=rand()*TAU,ca=Math.cos(az),sa=Math.sin(az),l=1.6+rand(),b=[top[0]+ca*.2,top[1]+sa*.2,top[2]-.3],e=[amp,phase,0,0],c=lin(0x7a5a34,.7+.3*rand());
  g.face([b[0]-sa*.18,b[1]+ca*.18,b[2]],[b[0]+sa*.18,b[1]-ca*.18,b[2]],[b[0]+ca*.45+sa*.08,b[1]+sa*.45-ca*.08,b[2]-l],[b[0]+ca*.45-sa*.08,b[1]+sa*.45+ca*.08,b[2]-l],c,e);
 }
 if(P.nuts&&!light&&rand()<.8)for(let j=0,m=2+Math.floor(rand()*5);j<m;j++){
  const a=rand()*TAU,r=.18+rand()*.12;g.blob(top[0]+Math.cos(a)*r,top[1]+Math.sin(a)*r,top[2]-.18-rand()*.2,.11,.11,.13,a,lin([0x6b7a2a,0x9a8a2a,0x7a5a2a][Math.floor(rand()*3)],.8+.3*rand()),[amp,phase,0,0]);
 }
 return H;
}

// --- Promenade furniture, each in its frame: f(a along its heading, b to its left, z up) gives track coordinates.
const frame=(x,y,z,h)=>{const c=Math.cos(h),s=Math.sin(h);return (a,b,dz=0)=>[x+a*c-b*s,y+a*s+b*c,z+dz];};
const LAMPS={
 branco:{pole:lin(0xe9e9e4),h:7.6,arms:2,head:lin(0xd9d9d4),glass:lin(0xfff1d6),pool:9},
 escuro:{pole:lin(0x3a3f44),h:5.8,arms:0,head:lin(0x2a2e33),glass:lin(0xffe8c4),pool:7.5},
 alto:{pole:lin(0x9aa0a4),h:9.5,arms:2,head:lin(0x6f767b),glass:lin(0xf6f2e8),pool:11},
};
function lamp(g,x,y,z,h,kind,rand){
 const L=LAMPS[kind],f=frame(x,y,z,h),tone=.92+rand()*.12,pole=mulc(L.pole,tone);
 g.box(x,y,z-.1,.22,.22,.35,h,lin(0x9d9a92),CONC);
 if(L.arms){
  g.tube(f(0,0,.2),f(0,0,L.h),.085,.055,6,pole);
  // Arms out over the walkway and toward the sea, an LED head at each end (its lens lit at night).
  for(const side of L.arms===2?[1,-1]:[1]){
   const tip=f(side*1.15,0,L.h+.25);g.beam(f(0,0,L.h-.15),tip,.06,.06,pole);
   g.beam([tip[0],tip[1],tip[2]-.02],f(side*1.55,0,L.h+.27),.32,.1,mulc(L.head,tone));
   const a=f(side*1.15,-.13,L.h+.2),b=f(side*1.15,.13,L.h+.2),c=f(side*1.62,.13,L.h+.22),d=f(side*1.62,-.13,L.h+.22);g.face(a,b,c,d,L.glass,GLOW);
  }
 }else{
  // A dark pole bent over at the top into a round LED head over the walkway, its lens underneath.
  g.tube(f(0,0,.2),f(0,0,L.h),.075,.05,6,pole);g.beam(f(0,0,L.h-.05),f(-.55,0,L.h+.12),.05,.05,pole);
  const c=f(-.85,0,L.h+.12);g.tube([c[0],c[1],c[2]-.02],[c[0],c[1],c[2]+.1],.36,.3,8,mulc(L.head,tone));
  g.tube([c[0],c[1],c[2]-.03],[c[0],c[1],c[2]-.02],.3,.3,8,L.glass,GLOW);
 }
}
function bench(g,x,y,z,h,kind,rand){
 // Facing +a (the sea). Cast-iron sides and wooden slats, or a plain concrete bench on the Aterro.
 const f=frame(x,y,z,h);
 if(kind==='concreto'){const c=lin(0xb9b4aa,.9+.15*rand());g.box(...f(0,-.7),.2,.08,.42,h,c,CONC);g.box(...f(0,.7),.2,.08,.42,h,c,CONC);g.box(...f(0,0,.38),.24,1,.08,h,c,CONC);return;}
 const iron=lin(0x24302a,.8+.3*rand()),wood=lin([0x8a6a48,0x7a6450,0x9a7a52][Math.floor(rand()*3)],.85+.25*rand());
 for(const b of [-.78,.78]){g.beam(f(.18,b,0),f(.05,b,.42),.05,.05,iron);g.beam(f(-.2,b,0),f(-.2,b,kind==='sem_encosto'?.42:.85),.05,.05,iron);g.beam(f(.2,b,.4),f(-.22,b,.42),.05,.05,iron);}
 for(let k=0;k<4;k++){const a=.17-k*.11;g.box(...f(a,0,.41),.045,.95,.035,h,mulc(wood,.92+.16*rand()),plank(h+Math.PI/2));}
 if(kind!=='sem_encosto')for(let k=0;k<2;k++)g.box(...f(-.23-k*.02,0,.56+k*.17),.02,.95,.1,h,mulc(wood,.92+.16*rand()));
}
function bin(g,x,y,z,h,rand){
 const f=frame(x,y,z,h),c=lin([0xe2701e,0x2f7d4a,0x8a8f93][Math.floor(rand()*3)],.85+.25*rand());
 g.tube(f(0,0,0),f(0,0,.55),.035,.035,5,lin(0x4a4f52));g.tube(f(.12,0,.45),f(.12,0,.95),.2,.21,8,c);g.tube(f(.12,0,.95),f(.12,0,1.0),.22,.2,8,mulc(c,.6));
}
// A kiosk: walls in its colour, the counter opening with its shutter raised as an awning, a flat roof with eaves and
// the name board on top; plastic tables and parasols beside it.
function kiosk(g,x,y,z,h,k,atlas,rand,people){
 const [,,bg]=KIOSKS[k],f=frame(x,y,z,h),wall=lin(bg,.7+.15*rand()),light=lin(0xf3efe6),dark=lin(0x1b1d20);
 g.box(x,y,z-.15,1.6,1.35,.25,h,lin(0xa9a49a),CONC);
 g.box(...f(-.25,0,.1),1.2,1.3,1,h,wall);g.box(...f(0,-1.25,.1),1.45,.08,2.4,h,wall);g.box(...f(0,1.25,.1),1.45,.08,2.4,h,wall);g.box(...f(-1.35,0,.1),.08,1.3,2.4,h,wall);
 g.box(...f(1.0,0,1.1),.06,1.25,.06,h,light);g.face(f(.98,-1.2,1.2),f(.98,1.2,1.2),f(.98,1.2,2.05),f(.98,-1.2,2.05),mulc(dark,1.4));
 g.box(...f(1.05,0,1.08),.3,1.3,.05,h,light,CONC);
 // Shutter raised: a sloping panel out over the counter.
 g.face(f(1.05,-1.4,2.2),f(1.05,1.4,2.2),f(1.9,1.4,1.95),f(1.9,-1.4,1.95),mulc(lin(bg),.95),E0);
 g.box(...f(0,0,2.45),1.85,1.6,.16,h,light);g.face(f(-1.8,-1.55,2.61),f(1.8,-1.55,2.61),f(1.2,0,2.95),f(-1.2,0,2.95),lin(0xb33a2a,.8));g.face(f(-1.8,1.55,2.61),f(1.8,1.55,2.61),f(1.2,0,2.95),f(-1.2,0,2.95),lin(0xb33a2a,.8));
 // The name board along the front, both faces.
 const uv=atlas.cell(atlas.kiosk(k));
 g.face(f(1.62,1.5,2.65),f(1.62,-1.5,2.65),f(1.62,-1.5,3.4),f(1.62,1.5,3.4),[1,1,1],E0,uv);
 g.face(f(1.58,-1.5,2.65),f(1.58,1.5,2.65),f(1.58,1.5,3.4),f(1.58,-1.5,3.4),[1,1,1],E0,uv);
 g.box(...f(1.6,-1.3,2.6),.04,.04,.82,h,dark);g.box(...f(1.6,1.3,2.6),.04,.04,.82,h,dark);
 // Inside: a light under the eaves for the night.
 g.face(f(1.0,-1.1,2.38),f(1.0,1.1,2.38),f(1.35,1.1,2.38),f(1.35,-1.1,2.38),lin(0xfff0d0),GLOW);
 const tables=[];
 for(let j=0;j<3;j++){
  const a=-.5-rand()*1.5,b=(j-1)*2.6+(rand()-.5)*.6,t=f(a,b+(b>0?1.2:-1.2)),white=lin(0xeeeeea,.9+.1*rand());if(Math.abs(b)<1)continue;
  const ft=frame(t[0],t[1],z,h+rand());g.tube(ft(0,0,0),ft(0,0,.72),.03,.03,5,white);g.tube(ft(0,0,.72),ft(0,0,.75),.4,.4,8,white);
  if(rand()<.7){const pc=lin(['#c0392b','#f2c230','#1d6f8c','#2f8a3a'][Math.floor(rand()*4)]);g.tube(ft(0,0,.75),ft(0,0,2.2),.02,.02,4,white);g.tube(ft(0,0,1.9),ft(0,0,2.35),1.1,.05,8,pc,E0,false);}
  for(let c=0;c<3;c++){const ca=c/3*TAU+rand(),p=ft(Math.cos(ca)*.7,Math.sin(ca)*.7);g.box(p[0],p[1],z,.22,.22,.42,h+ca,white);g.box(...frame(p[0],p[1],z,h+ca)(-.2,0,.42),.03,.22,.45,h+ca,white);
   if(people&&rand()<.22)people.push({x:p[0],y:p[1],z,yaw:h+ca+Math.PI,pose:'sit',idle:'seated'});}
  tables.push(t);
 }
 return tables;
}
// An outdoor gym: a row of steel-tube machines in the municipal yellow, blue and green, and its sign.
function gym(g,x,y,z,h,atlas,rand){
 const f=frame(x,y,z,h),cols=[lin(0xf2c230),lin(0x1f5fa8),lin(0x2f8a3a)],n=4+Math.floor(rand()*3);
 for(let k=0;k<n;k++){
  const b=(k-(n-1)/2)*2.4,c0=cols[k%3],c1=cols[(k+1)%3],kind=Math.floor(rand()*4);
  g.tube(f(0,b-.5,0),f(0,b-.5,2),.05,.05,6,c0);g.tube(f(0,b+.5,0),f(0,b+.5,2),.05,.05,6,c0);g.tube(f(0,b-.55,2),f(0,b+.55,2),.045,.045,6,c0,E0,false);
  if(kind===0){for(const s of [-.25,.25]){g.beam(f(0,b+s,1.9),f(.15,b+s,.4),.05,.05,c1);g.box(...f(.15,b+s,.32),.18,.09,.06,h,c1);}}
  else if(kind===1){g.box(...f(.5,b,.4),.3,.22,.08,h,c1);g.beam(f(0,b,1.2),f(.75,b,1.2),.05,.05,c1);}
  else if(kind===2){g.tube(f(.06,b,1.35),f(.16,b,1.35),.45,.45,10,c1,E0,true);}
  else{g.box(...f(.45,b,.35),.7,.25,.08,h,c1);g.beam(f(.9,b-.2,.6),f(.9,b+.2,.6),.05,.05,c1);}
 }
 sign(g,...f(-1.2,-(n/2)*2.4,0),h+Math.PI,atlas,atlas.sign('academia'),1.3);
}
function sign(g,x,y,z,h,atlas,cell,width=1.2){
 const f=frame(x,y,z,h),post=lin(0x5d6266),uv=atlas.cell(cell),hh=width/4;
 g.tube(f(0,-width/2+.08,0),f(0,-width/2+.08,1.6+hh),.035,.035,5,post);g.tube(f(0,width/2-.08,0),f(0,width/2-.08,1.6+hh),.035,.035,5,post);
 g.face(f(.04,width/2,1.6-hh),f(.04,-width/2,1.6-hh),f(.04,-width/2,1.6+hh),f(.04,width/2,1.6+hh),[1,1,1],E0,uv);
 g.face(f(-.04,-width/2,1.6-hh),f(-.04,width/2,1.6-hh),f(-.04,width/2,1.6+hh),f(-.04,-width/2,1.6+hh),lin(0x9aa0a4));
}
// A railing post-to-post run: posts every ~1.9 m, a handrail and a middle rail, galvanised or painted white.
function railing(g,pts,kind,rand){
 const col=kind==='branco'?lin(0xeceae4):kind==='madeira'?lin(0x7a5a3a):lin(0x9aa1a5),hr=kind==='madeira'?.09:.055;
 for(let k=0;k<pts.length;k++){
  const p=pts[k],c=mulc(col,.94+.1*rand()),lean=(rand()-.5)*.03;
  g.beam([p[0],p[1],p[2]-.05],[p[0]+lean,p[1]-lean,p[2]+1.08],hr*1.1,hr*1.1,c);
  if(k){const q=pts[k-1];for(const z of [1.05,.55])g.beam([q[0],q[1],q[2]+z],[p[0],p[1],p[2]+z],hr,hr*.9,c);}
 }
}

// --- Rock armour. A boulder: an icosahedron (rounded, natural) or a jittered box (a quarried block) flattened a little,
// its corners pushed in and out, coloured by height: dark olive slime at the water line, a black tide band, grey-brown
// granite above with pale lichen on some tops.
const GRANITE=[lin(0x6f6b65),lin(0x625d56),lin(0x7b756c),lin(0x56524e),lin(0x6c6258),lin(0x857e74),lin(0x5d5f5c)];
function boulder(g,x,y,z,size,rand,level,natural=false,light=false){
 const base=mulc(GRANITE[Math.floor(rand()*GRANITE.length)],.66+.38*rand()),lichen=rand()<.25,yaw=rand()*TAU;
 const sx=size*(.5+.2*rand()),sy=size*(.4+.15*rand()),sz=size*(natural?.42+.15*rand():.36+.14*rand());
 // Tipped as it fell on the pile: a shear of its height by its plan position.
 const ta=(rand()-.5)*.55,tb=(rand()-.5)*.55,tilt=(lx,ly)=>lx*ta+ly*tb;
 const col=(X,Y,Z,up)=>{
  const h=Z-level,n=.9+.2*Math.sin(X*3.1+Y*2.3+Z*5.7);let c=mulc(base,n);
  if(h<.35)c=mixc(c,lin(0x2e3324,.9),clamp((.35-h)/.4,0,1)*.85);else if(h<.7)c=mixc(c,lin(0x2a2622),clamp((.7-h)/.35,0,1)*.45);
  if(lichen&&up>.4&&h>.8)c=mixc(c,lin(0xc8c2a0),.35);return c;
 };
 if(natural||!light&&rand()<.32){const jag=ICO_V.map(()=>.78+.34*rand()),k=g.n;g.blob(x,y,z,sx,sy,sz,yaw,col,ROCK,jag);for(let j=k;j<g.n;j++)g.p[j*3+1]+=tilt(g.p[j*3]-x,-g.p[j*3+2]-y);}
 else{
  // A quarried block: eight corners each pushed in or out, the top a little smaller than the bottom.
  const cs=Math.cos(yaw),sn=Math.sin(yaw),k=g.n;
  for(const [u,v,w] of BOX_V){const j=.75+.4*rand(),t=w>0?.82:1,lx=u*sx*j*t,ly=v*sy*(.75+.4*rand())*t,lz=w*sz*(.8+.35*rand()),X=x+lx*cs-ly*sn,Y=y+lx*sn+ly*cs,Z=z+lz+tilt(X-x,Y-y);g.v(X,Y,Z,col(X,Y,Z,w),ROCK);}
  for(const f of BOX_F)g.i.push(k+f[0],k+f[1],k+f[2]);
 }
}

// --- Boats moored at the trapiches: the island's small wooden fishing boats, bright paint, a wheelhouse on some.
function hullGeometry(){
 // Waterline at y=0, the gunwale 55 cm above it: the sides take the boat's paint, the deck and a rubbing strake don't.
 const length=6.5,beam=2.1,depth=1,g=new THREE.BoxGeometry(length,depth,beam,6,10,2).translate(0,-depth/2+.55,0),p=g.attributes.position,nrm=g.attributes.normal;
 for(let i=0;i<p.count;i++){const x=p.getX(i)/(length/2),y=p.getY(i),z=p.getZ(i),pinch=x>0?1-x*x*x*.94:1-.55*Math.pow(-x,3),keel=y<0?.5:1;p.setXYZ(i,p.getX(i),y+(x>.55?.28*(x-.55)/.45:0),z*pinch*keel);}
 g.computeVertexNormals();
 const paint=new Float32Array(p.count),color=new Float32Array(p.count*3);
 for(let i=0;i<p.count;i++){const deck=nrm.getY(i)>.5,strake=!deck&&p.getY(i)>.5;color.set(deck?[.3,.23,.16]:strake?[.95,.95,.92]:[1,1,1],i*3);paint[i]=deck||strake?0:1;}
 g.setAttribute('paint',new THREE.BufferAttribute(paint,1));g.setAttribute('color',new THREE.BufferAttribute(color,3));
 const cabin=new THREE.BoxGeometry(1.1,.95,1.25).translate(-1.9,1.0,0),mast=new THREE.BoxGeometry(.07,2.2,.07).translate(1.5,1.6,0),seat=new THREE.BoxGeometry(.3,.08,1.8).translate(.5,.62,0);
 for(const q of [cabin,mast,seat]){const n=q.attributes.position.count;q.setAttribute('paint',new THREE.BufferAttribute(new Float32Array(n),1));const c=new Float32Array(n*3);for(let i=0;i<n;i++)c.set(q===mast?[.35,.3,.25]:q===seat?[.55,.42,.3]:q.attributes.position.getY(i)>1.3?[.25,.27,.3]:[.93,.93,.9],i*3);q.setAttribute('color',new THREE.BufferAttribute(c,3));}
 const parts=[g,cabin,mast,seat].map(q=>q.index?q.toNonIndexed():q);
 const out=new THREE.BufferGeometry();for(const name of ['position','normal','color','paint']){const arrays=parts.map(q=>q.attributes[name].array),n=arrays.reduce((s,a)=>s+a.length,0),all=new Float32Array(n);let o=0;for(const a of arrays){all.set(a,o);o+=a.length;}out.setAttribute(name,new THREE.BufferAttribute(all,parts[0].attributes[name].itemSize));}
 parts.forEach(q=>q.dispose());return out;
}

// --- People walking, jogging and cycling: one figure (and a bicycle) animated in the vertex shader: each instance its
// stride, cadence, phase and clothes; the bicycle collapses away for the ones on foot. Figures face +x, y up.
function moverGeometry(){
 const parts=[],M=new THREE.Matrix4(),Q=new THREE.Quaternion(),E=new THREE.Euler(),S=new THREE.Vector3(),T=new THREE.Vector3();
 const put=(geo,limb,slot,pos,rot=[0,0,0],scale=[1,1,1],color=[1,1,1])=>{
  geo.deleteAttribute('uv');geo.applyMatrix4(M.compose(T.set(...pos),Q.setFromEuler(E.set(...rot)),S.set(...scale)));
  const g=geo.index?geo.toNonIndexed():geo,n=g.attributes.position.count;
  g.setAttribute('limb',new THREE.BufferAttribute(new Float32Array(n).fill(limb),1));g.setAttribute('slot',new THREE.BufferAttribute(new Float32Array(n).fill(slot),1));
  const c=new Float32Array(n*3);for(let i=0;i<n;i++)c.set(color,i*3);g.setAttribute('color',new THREE.BufferAttribute(c,3));parts.push(g);
 };
 const cyl=(a,b,h,s=5)=>new THREE.CylinderGeometry(a,b,h,s,1,true),ball=(r,w=6,h=4)=>new THREE.SphereGeometry(r,w,h),box=(x,y,z)=>new THREE.BoxGeometry(x,y,z);
 put(ball(.105,6,4),0,0,[.01,1.6,0],[0,0,0],[1,1.12,.92]);put(new THREE.SphereGeometry(.113,6,3,0,TAU,0,Math.PI*.55),0,4,[-.012,1.625,0],[0,0,.5]);
 put(cyl(.045,.05,.12),0,0,[0,1.47,0]);put(new THREE.CylinderGeometry(.17,.145,.5,7),0,1,[0,1.18,0],[0,0,0],[.62,1,1]);put(cyl(.15,.15,.18,7),0,2,[0,.92,0],[0,0,0],[.7,1,1]);
 for(const [side,l] of [[-1,1],[1,2]]){
  put(cyl(.072,.06,.43),l,2,[0,.71,side*.095]);put(cyl(.056,.045,.42),l+2,6,[0,.29,side*.095]);put(box(.25,.075,.1),l+2,3,[.05,.04,side*.095],[0,0,0],[1,1,1],[.85,.85,.85]);
  put(cyl(.052,.045,.3,4),l+4,1,[0,1.28,side*.205]);put(cyl(.042,.035,.3,4),l+4,0,[0,.98,side*.205]);put(ball(.045,4,3),l+4,0,[0,.8,side*.205]);
 }
 // The bicycle: wheels, frame, fork, saddle and handlebar.
 for(const x of [-.52,.52])put(new THREE.TorusGeometry(.33,.022,3,9),7,7,[x,.35,0],[0,0,0],[1,1,1],[.07,.07,.07]);
 const tubeTo=(a,b,r,slot,color=[1,1,1])=>{const d=new THREE.Vector3(b[0]-a[0],b[1]-a[1],0),l=d.length();const g=cyl(r,r,l,3);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));put(g,7,slot,[(a[0]+b[0])/2,(a[1]+b[1])/2,0],[0,0,0],[1,1,1],color);};
 const bb=[0,.33],seat=[-.13,.86],head=[.4,.92],fork=[.44,.68];
 tubeTo(bb,seat,.022,5);tubeTo(seat,head,.02,5);tubeTo(bb,fork,.022,5);tubeTo(bb,[-.52,.35],.015,5);tubeTo(seat,[-.52,.35],.015,5);tubeTo(fork,[.52,.35],.016,5);tubeTo(head,fork,.022,5);
 put(box(.25,.05,.12),7,7,[-.14,.9,0],[0,0,0],[1,1,1],[.08,.08,.08]);put(box(.04,.04,.52),7,7,[.42,1.0,0],[0,0,0],[1,1,1],[.1,.1,.1]);
 const out=new THREE.BufferGeometry();
 for(const name of ['position','normal','color','limb','slot']){const arrays=parts.map(q=>q.attributes[name].array),n=arrays.reduce((s,a)=>s+a.length,0),all=new Float32Array(n);let o=0;for(const a of arrays){all.set(a,o);o+=a.length;}out.setAttribute(name,new THREE.BufferAttribute(all,parts[0].attributes[name].itemSize));}
 parts.forEach(q=>q.dispose());return out;
}
// The stride: hips pivot at .92 m, knees at .5, shoulders at 1.42 (rotations about the figure's z, + forward).
const MOVE_GLSL=`
float kind=iA.z,ph=moveTime*iA.y+iA.x,side=(limb==1.||limb==3.||limb==5.)?0.:3.14159,a=ph+side;
bool leg=limb>.5&&limb<4.5,shin=limb>2.5&&limb<4.5,arm=limb>4.5&&limb<6.5,bike=limb>6.5;
if(kind>2.5){
 // Still: 3 standing, 4 seated (hips down to the bench, thighs out, shins down), 5 fishing (hands out to the rod).
 // Breathing and a little weight shift, each on its own clock.
 float br=sin(moveTime*1.25+iA.x),sh=sin(moveTime*.31+iA.x*1.7);
 if(kind>3.5&&kind<4.5){if(leg){if(shin)transformed=bmRot(transformed,vec2(0.,.5),-1.5);transformed=bmRot(transformed,vec2(0.,.92),1.5);}else if(arm)transformed=bmRot(transformed,vec2(0.,1.42),.5);}
 else if(arm)transformed=bmRot(transformed,vec2(0.,1.42),kind>4.5?.75+.04*br:.07+.03*br);
 if(!leg&&!bike)transformed=bmRot(transformed,vec2(0.,.92),.012*br+(kind<3.5?.02*sh:0.));
 if(kind>3.5&&kind<4.5)transformed.y-=.46;
 if(bike)transformed=vec3(0.);
}else if(kind>1.5){
 if(leg){float th=1.02+.42*sin(a),kn=1.25+.45*sin(a+1.6);if(shin)transformed=bmRot(transformed,vec2(0.,.5),-kn);transformed=bmRot(transformed,vec2(0.,.92),th);}
 else if(arm)transformed=bmRot(transformed,vec2(0.,1.42),1.22);
 if(!bike&&!leg)transformed=bmRot(transformed,vec2(0.,.92),-.45);
 if(!bike)transformed.x-=.12;
}else{
 float run=step(.5,kind),A=mix(.42,.72,run),K=mix(.55,1.3,run),B=mix(.32,.75,run);
 if(leg){float th=A*sin(a),kn=K*max(0.,sin(a-1.7))+.06;if(shin)transformed=bmRot(transformed,vec2(0.,.5),-kn);transformed=bmRot(transformed,vec2(0.,.92),th);}
 else if(arm)transformed=bmRot(transformed,vec2(0.,1.42),-B*sin(a)+run*.3);
 if(!leg)transformed=bmRot(transformed,vec2(0.,.92),-.16*run);
 transformed.y+=abs(cos(ph))*mix(.025,.065,run);
 if(bike)transformed=vec3(0.);
}`;
const MOVE_HEAD=`attribute float limb;attribute float slot;attribute vec4 iA;attribute vec4 iBot;attribute vec4 iSkin;attribute vec3 iBike;uniform float moveTime;
vec3 bmRot(vec3 p,vec2 c,float a){vec2 d=p.xy-c;float cs=cos(a),sn=sin(a);return vec3(c.x+d.x*cs-d.y*sn,c.y+d.x*sn+d.y*cs,p.z);}`;
function moverMaterials(U){
 const m=new THREE.MeshStandardMaterial({name:'Beira_mar_gente',vertexColors:true,roughness:.8,flatShading:true});
 m.onBeforeCompile=shader=>{
  shader.uniforms.moveTime=U.moveTime;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+MOVE_HEAD).replace('#include <begin_vertex>','#include <begin_vertex>\n'+MOVE_GLSL)
   .replace('#include <color_vertex>',`vColor=vec4(color,1.);
vec3 hair=mix(vec3(.025,.018,.012),vec3(.5,.36,.18),iSkin.a);
if(slot<.5)vColor.rgb=iSkin.rgb;else if(slot<1.5)vColor.rgb=instanceColor;else if(slot<2.5)vColor.rgb=iBot.rgb;else if(slot<3.5)vColor.rgb=color;
else if(slot<4.5)vColor.rgb=hair;else if(slot<5.5)vColor.rgb=iBike;else if(slot<6.5)vColor.rgb=mix(iSkin.rgb,iBot.rgb,iBot.a);else vColor.rgb=color;`);
 };
 m.customProgramCacheKey=()=>'beira-mar-gente-v1';
 const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
 depth.onBeforeCompile=shader=>{shader.uniforms.moveTime=U.moveTime;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+MOVE_HEAD).replace('#include <begin_vertex>','#include <begin_vertex>\n'+MOVE_GLSL);};
 depth.customProgramCacheKey=()=>'beira-mar-gente-sombra-v1';
 return {material:m,depth};
}

// --- Clothes for the idle people (pit-crew.js outfits): a sunny seafront, shorts and T-shirts, caps, sunglasses.
const SKINS=[0xf1c9a5,0xe3b48c,0xd09a76,0xc68e6a,0xa86f4c,0x8a5a3c,0x6b4430,0x4f3326];
const HAIRS=[0x15100c,0x2b1f17,0x3b2a1a,0x5a3a22,0x8a6a3a,0xc9a86a,0xbab4ab];
const TOPS=[0xf4f1ea,0x1d3557,0xe63946,0x2a9d8f,0xf4a261,0x264653,0xffd23f,0x8ecae6,0x6a4c93,0xff8fab,0x2b2d42,0x90be6d,0xe9c46a,0x457b9d];
const BOTTOMS=[0x2d3a4a,0x41618f,0x6b5a45,0x1b1d20,0x8a8f93,0xc9b18a,0x3a5a40];
function outfit(rand){
 const pick=a=>a[Math.floor(rand()*a.length)];
 return {skin:pick(SKINS),hair:pick(HAIRS),hairStyle:pick(['short','short','curly','long','bun','bald']),top:pick(TOPS),sleeves:rand()<.8?'short':'long',bottom:pick(BOTTOMS),
  belt:0x1b1d20,shoes:pick([0xeeeeea,0x1b1d20,0x6b3f25,0x2b5c8a]),hat:rand()<.22?'cap':null,hatColor:pick(TOPS),glasses:rand()<.3,belly:rand()<.3?rand()*.7:0,mustache:rand()<.12};
}

export async function createBeiraMar(data,{mobile=false,lean=false,ground=null,map=null}={}){
 const root=new THREE.Group();root.name='Beira_mar';
 const city=data.scenery?.city;
 if(!city?.coast?.length||!ground)return {root,stats:{coast:0}};
 const t0=performance.now(),light=mobile||lean,level=data.meta.sea_level_m??0,rand=random(5309),A=data.samples;
 const g0=ground;
 const surface=(x,y)=>map?map.surface(x,y):'plaza';

 // ---------------------------------------------------------------- what stays clear
 const bands=bandField(data);
 const deck=A.map(p=>onDeck(data,p[0]));
 const twin=data.scenery.bridges?.find(b=>b.twin)?.twin?.points??[];
 const twinGap=(x,y)=>{let best=Infinity;for(let k=1;k<twin.length;k++){const p=twin[k-1],q=twin[k];if(Math.abs(p[0]-x)>80&&Math.abs(q[0]-x)>80)continue;const dx=q[0]-p[0],dy=q[1]-p[1];let u=((x-p[0])*dx+(y-p[1])*dy)/(dx*dx+dy*dy||1e-9);u=clamp(u,0,1);best=Math.min(best,Math.hypot(x-p[0]-u*dx,y-p[1]-u*dy));}return best;};
 const blocked=new Blockers(),placed=new Blockers(8);
 const bc=data.scenery.buildings;if(bc?.items){const c=Object.fromEntries(bc.columns.map((k,i)=>[k,i]));for(const it of bc.items)blocked.rect(it[c.x],it[c.y],it[c.w]/2,it[c.d]/2,it[c.heading]);}
 const cb=city.buildings;if(cb?.items){const ri=cb.columns.indexOf('ring');for(const it of cb.items){const r=it[ri],pts=[];for(let k=0;k+1<r.length;k+=2)pts.push([r[k],r[k+1]]);if(pts.length>2)blocked.ring(pts);}}
 for(const m of data.scenery.landmarks??[])if(m.outline?.length>2)blocked.ring(m.outline.map(q=>[q[0],q[1]]));
 for(const q of billboardSpots(data))blocked.circle(q.x,q.y,9);
 for(const q of marshalSpots(data))blocked.circle(q.x,q.y,4);
 for(const q of towerSpots(data))blocked.circle(q.x,q.y,6);
 for(const q of flagSpots(data))if(Number.isFinite(q.x)&&Number.isFinite(q.y))blocked.circle(q.x,q.y,1.5);
 // Rocks: off the corridor (asphalt, wall gap, the Jersey blocks); under and beside a deck clear of its supports
 // (trestle footings, wall piers, the tower piers, the abutments), and of the twin bridge's.
 const high=A.map(p=>onDeck(data,p[0])&&p[3]-(ground(p[1],p[2])??p[3])>6);
 const rockOk=(x,y)=>{const q=bands(x,y);if(q.pista<(q.i>=0&&deck[q.i%A.length]?7.5:3.6))return false;if(q.pit<1||q.stand<-11)return false;return twinGap(x,y)>13.5&&!blocked.hit(x,y,.3);};
 // Far below a high deck (the bridges' heads over the shore) the armour goes on, in smaller stones round the trestle
 // footings and wall piers; the bedding everywhere off the road itself.
 const underDeck=(x,y)=>{const q=bands(x,y);return q.i>=0&&high[q.i%A.length]&&q.pista<7.5&&q.pit>=1&&!blocked.hit(x,y,.3);};
 const beddingOk=(x,y)=>{if(rockOk(x,y))return true;const q=bands(x,y);return q.i>=0&&high[q.i%A.length]&&q.pit>=1;};
 // Things standing on the promenade: off every band (nothing beside the high decks), r their own radius.
 const standOk=(x,y,r,tall=false)=>{const q=bands(x,y);if(q.pista<(tall?6.5:3.8)+r||q.ponte<r+1||q.pit<r+1||q.stand<r+1||q.other<r)return false;return twinGap(x,y)>(tall?18:14)+r&&!blocked.hit(x,y,r)&&!placed.hit(x,y,r);};
 const onPromenade=(x,y,r=.3)=>{if(!map)return true;const d=map.at(x,y);return (d.plaza<-r||d.green<-r)&&d.road>r+.5&&d.parking>r&&d.cycleway>r*.5;};

 // ---------------------------------------------------------------- the coast, station by station
 const runs=coastRuns(city.coast),O0=-12,DO=.5,NO=61;
 for(const st of runs.flat()){
  const z=new Float32Array(NO);let bad=false;
  for(let k=0;k<NO;k++){const o=O0+k*DO,v=g0(st.x+st.nx*o,st.y+st.ny*o);if(v==null){bad=true;break;}z[k]=v-level;}
  st.ok=false;if(bad||z[NO-1]<.25)continue;
  let k=NO-1;while(k>0&&z[k-1]>=0)k--;if(k===0)continue;
  const wet=O0+(k-1)*DO+DO*(-z[k-1])/(z[k]-z[k-1]),at=o=>{const f=clamp((o-O0)/DO,0,NO-1.001),i=Math.floor(f),u=f-i;return z[i]*(1-u)+z[i+1]*u;};
  if(at(wet-3)>-.25)continue;
  // The edge of the land: where the ground reaches the level of the promenade behind it (at most 6 m in).
  const target=Math.min(at(wet+6),2.2)-.08;let crest=wet+6;for(let o=wet+.5;o<=wet+6;o+=.25)if(at(o)>=target){crest=o;break;}
  Object.assign(st,{ok:true,wet,crest});
 }
 // Smoothed along the shore (a median, then a mean) so the armour's foot and crest run as one line.
 for(const run of runs){
  for(const key of ['wet','crest']){
   const raw=run.map(s=>s.ok?s[key]:null),med=raw.map((v,i)=>{if(v==null)return null;const w=[];for(let j=i-5;j<=i+5;j++)if(raw[j]!=null)w.push(raw[j]);w.sort((a,b)=>a-b);return w[w.length>>1];});
   run.forEach((s,i)=>{if(med[i]==null)return;let t=0,n=0;for(let j=i-4;j<=i+4;j++)if(med[j]!=null){t+=med[j];n++;}s[key+'S']=t/n;});
  }
  for(const s of run){
   if(!s.ok)continue;s.oc=Math.max(s.crestS,s.wetS+.6);s.ot=Math.min(s.wetS-2.2,s.oc-3.2);
   const P=[s.x+s.nx*s.oc,s.y+s.ny*s.oc];s.zc=g0(...P)??level+.9;s.style=styleAt(s.x,s.y);s.S=STYLES[s.style];
   s.edgeX=P[0];s.edgeY=P[1];
  }
 }
 const at=(s,o)=>[s.x+s.nx*o,s.y+s.ny*o];
 // Tiles of about TILE metres of shore: drawn and culled together (by the screen, the sun's shadow box, the cars'
 // reflection cube and distance). The dark bedding is one mesh for the whole coast, the armour's line from afar.
 const TILE=420,tiles=new Map(),faixa=new Geo();
 runs.forEach((run,r)=>{const n=Math.max(1,Math.round(run.length*STEP/TILE)),len=run.length*STEP/n;for(const s of run)s.tile=r+':'+Math.min(n-1,Math.floor(s.s/len));});
 const okStations=runs.flat().filter(s=>s.ok);
 const geoOf=s=>{let g=tiles.get(s.tile);if(!g)tiles.set(s.tile,g=new Geo());return g;};
 const nearest=(x,y)=>{let best=runs[0][0],d=Infinity;for(const s of okStations){const e=(s.x-x)**2+(s.y-y)**2;if(e<d){d=e;best=s;}}return best;};
 const geoNear=(x,y)=>geoOf(nearest(x,y));
 const stats={rocks:0,palms:0,lamps:0,benches:0,bins:0,kiosks:0,gyms:0,decks:0,piers:0,boats:0,railing_m:0,wall_m:0,people:0,crew:0,walkers:0,joggers:0,cyclists:0,stations:0,shore_m:0};
 const atlas=signAtlas();
 const idle=[],clearings=[];

 // ---------------------------------------------------------------- trapiches (before the armour, which keeps off them)
 const pierZ=level+1.35,piers=[],moor=[],pools=[];
 const pierCol=()=>lin([0x8a7660,0x7d6a55,0x948068][Math.floor(rand()*3)],.85+.25*rand());
 for(const pier of city.piers??[]){
  const pts=pier.points.map(q=>[q[0],q[1]]);if(pts.length<2)continue;
  const zs=pts.map(q=>g0(...q));if(zs.some(v=>v==null)||!zs.some(v=>v<level-.2))continue;
  if(pts.some(q=>{const b=bands(...q);return b.pista<6||b.ponte<-2||twinGap(...q)<16;}))continue;
  const style=styleAt(pts[0][0],pts[0][1]),geo=geoNear(pts[0][0],pts[0][1]),wood=pierCol(),w=(pier.width||2.5)/2;
  const zAt=(x,y)=>Math.max(pierZ,(g0(x,y)??level)+.12);
  const rails=rand()<.7,lamps=rand()<.5,edges=[];
  if(!pier.closed){
   // A walkway along its centre line: deck boards, a fascia, posts into the bed every ~2.5 m.
   const line=[];for(let k=1;k<pts.length;k++){const [ax,ay]=pts[k-1],[bx,by]=pts[k],l=Math.hypot(bx-ax,by-ay),n=Math.max(1,Math.ceil(l/2.5));for(let j=k===1?0:1;j<=n;j++)line.push([ax+(bx-ax)*j/n,ay+(by-ay)*j/n]);}
   const L=[],R=[];
   line.forEach((p,k)=>{const q=line[Math.min(k+1,line.length-1)],r=line[Math.max(k-1,0)],dx=q[0]-r[0],dy=q[1]-r[1],l=Math.hypot(dx,dy)||1,nx=-dy/l,ny=dx/l,z=zAt(...p);L.push([p[0]+nx*w,p[1]+ny*w,z]);R.push([p[0]-nx*w,p[1]-ny*w,z]);});
   for(let k=1;k<line.length;k++){const ang=Math.atan2(line[k][1]-line[k-1][1],line[k][0]-line[k-1][0]);geo.face(L[k-1],R[k-1],R[k],L[k],wood,plank(ang));
    for(const E of [L,R])geo.face([E[k-1][0],E[k-1][1],E[k-1][2]],[E[k][0],E[k][1],E[k][2]],[E[k][0],E[k][1],E[k][2]-.3],[E[k-1][0],E[k-1][1],E[k-1][2]-.3],mulc(wood,.7));}
   for(let k=0;k<line.length;k++)for(const E of [L,R]){const p=E[k],b=g0(p[0],p[1])??level-2;if(b<p[2]-.4)geo.tube([p[0],p[1],Math.max(b-.3,level-2.5)],[p[0],p[1],p[2]-.05],.11,.11,5,mulc(wood,.6),plank(0),false);}
   edges.push(L,R.slice());
   piers.push({pts:line,w});for(const q of line)blocked.circle(q[0],q[1],w+.3);
  }else{
   // A deck over a polygon: boards across its longest side, a fascia round it, posts on a grid under it.
   let best=0,ang=0;for(let k=0;k<pts.length;k++){const p=pts[k],q=pts[(k+1)%pts.length],l=Math.hypot(q[0]-p[0],q[1]-p[1]);if(l>best){best=l;ang=Math.atan2(q[1]-p[1],q[0]-p[0]);}}
   const ring=pts.slice(0,Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])<.1?-1:undefined);
   const area=ring.reduce((s,p,k)=>{const q=ring[(k+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2;if(Math.abs(area)<6)continue;
   const tris=THREE.ShapeUtils.triangulateShape(ring.map(q=>new THREE.Vector2(q[0],q[1])),[]),base=geo.n;
   for(const q of ring)geo.v(q[0],q[1],zAt(...q),wood,plank(ang));for(const t of tris)geo.i.push(base+t[0],base+t[1],base+t[2]);
   const E=ring.map(q=>[q[0],q[1],zAt(...q)]);E.push(E[0]);
   for(let k=1;k<E.length;k++)geo.face(E[k-1],E[k],[E[k][0],E[k][1],E[k][2]-.32],[E[k-1][0],E[k-1][1],E[k-1][2]-.32],mulc(wood,.7));
   let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const [x,y] of ring){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
   const inside=(px,py)=>{let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [ax,ay]=ring[j],[bx,by]=ring[i];if((by>py)!==(ay>py)&&px<(ax-bx)*(py-by)/(ay-by)+bx)c=!c;}return c;};
   for(let x=x0+.6;x<x1;x+=2.6)for(let y=y0+.6;y<y1;y+=2.6)if(inside(x,y)){const b=g0(x,y)??level-2,z=zAt(x,y);if(b<z-.4)geo.tube([x,y,Math.max(b-.3,level-2.5)],[x,y,z-.05],.12,.12,5,mulc(wood,.6),plank(0),false);}
   edges.push(E);piers.push({pts:ring,w:Math.sqrt(Math.abs(area))/2,closed:true});
   blocked.ring(ring);
  }
  // Railings on the sides over the water, a lamp or two; where boats tie up.
  for(const E of edges){
   const over=E.map(p=>(g0(p[0],p[1])??level-2)<level-.1);
   if(!light&&rails){let runPts=[];const flush=()=>{if(runPts.length>1){railing(geo,runPts,rand()<.6?'madeira':'branco',rand);stats.railing_m+=runPts.length*2;}runPts=[];};
    for(let k=0;k<E.length;k++){if(!over[k]){flush();continue;}const prev=runPts.at(-1),p=E[k];if(prev&&Math.hypot(p[0]-prev[0],p[1]-prev[1])<1.6)continue;runPts.push(p);}flush();}
   // (round a deck over a polygon the boat lies on the outside of the edge, away from the deck's middle)
   const cx=pts.reduce((t,q)=>t+q[0],0)/pts.length,cy=pts.reduce((t,q)=>t+q[1],0)/pts.length;
   for(let k=1;k<E.length;k++)if(over[k]&&over[k-1]){const p=E[k],q=E[k-1],d=Math.hypot(p[0]-q[0],p[1]-q[1]),h=Math.atan2(p[1]-q[1],p[0]-q[0]),mx=(p[0]+q[0])/2,my=(p[1]+q[1])/2;
    if(d>2&&(g0(p[0],p[1])??0)<level-.9)moor.push({x:mx,y:my,h,style,side:pier.closed?(-Math.sin(h)*(mx-cx)+Math.cos(h)*(my-cy)>0?1:-1):null});}
  }
  if(!light&&lamps){const E=edges[0],p=E[E.length-1];if(p){lamp(geo,p[0],p[1],p[2],0,'escuro',rand);pools.push([p[0],p[1],p[2],LAMPS.escuro.pool]);}}
  // A fisherman at the far end, his rod over the rail.
  const tipE=edges[0],tip=tipE?.[tipE.length-1];
  if(tip&&!light){const c=pier.closed?(()=>{let sx=0,sy=0;for(const q of pts){sx+=q[0];sy+=q[1];}return [sx/pts.length,sy/pts.length];})():pts.at(-1),dir=Math.atan2(tip[1]-c[1],tip[0]-c[0]);
   const fx=pier.closed?c[0]+(tip[0]-c[0])*.7:pts.at(-1)[0]-Math.cos(dir)*.8,fy=pier.closed?c[1]+(tip[1]-c[1])*.7:pts.at(-1)[1]-Math.sin(dir)*.8;
   const h=pier.closed?dir:Math.atan2(pts.at(-1)[1]-pts.at(-2)[1],pts.at(-1)[0]-pts.at(-2)[0]);
   idle.push({x:fx,y:fy,z:zAt(fx,fy),yaw:h+(rand()-.5)*.6,pose:'stand',idle:'stand',fish:true});
  }
  stats.piers++;clearings.push({x:pts[0][0],y:pts[0][1],r:4});
 }

 // ---------------------------------------------------------------- the rowing clubs' ramp (Parque Náutico Walter Lange)
 // On the Aterro, beside the clubs' pier under the bridges' island heads: a concrete slipway down into the water in a
 // gap of the armour, racks of rowing shells beside it, one shell on the ramp.
 let ramp=null;
 if(!light){
  const club=piers.find(q=>q.closed&&styleAt(q.pts[0][0],q.pts[0][1])==='aterro');
  if(club){
   const cx=club.pts.reduce((t,q)=>t+q[0],0)/club.pts.length,cy=club.pts.reduce((t,q)=>t+q[1],0)/club.pts.length,near=nearest(cx,cy),run=runs.find(r=>r.includes(near));
   const i0=run.indexOf(near);
   for(const d of [14,-14,20,-20,26,-26,32,-32]){
    const i=i0+d,s=run[i];if(!s||!s.ok)continue;
    if([-4,0,4].every(j=>{const q=run[i+j];return q?.ok&&rockOk(q.edgeX,q.edgeY)&&standOk(...at(q,q.oc+7),3.5);})&&Math.abs(run[i-6]?.nx*run[i+6]?.nx+run[i-6]?.ny*run[i+6]?.ny)>.95){ramp={s,i,run};break;}
   }
  }
  if(ramp){
   const {s,i,run}=ramp,geo=geoOf(s),h=Math.atan2(s.ty,s.tx),conc=mulc(lin(0xa8a397),.95);
   for(let j=-3;j<=3;j++)if(run[i+j])run[i+j].ramp=true;
   const f=(a,b,z)=>[s.x+s.tx*a+s.nx*b,s.y+s.ty*a+s.ny*b,z],top=s.zc+.02,lo=s.wetS-4;
   geo.face(f(-2.6,s.oc+.6,top),f(2.6,s.oc+.6,top),f(2.6,lo,level-1.1),f(-2.6,lo,level-1.1),conc,CONC);
   for(const a of [-2.6,2.6])geo.face(f(a,s.oc+.6,top),f(a,lo,level-1.1),f(a,lo,level-1.5),f(a,s.oc+.6,top-.5),mulc(conc,.8),CONC);
   // Racks: two A-frame trestles each, three bars high, a shell on each bar (singles, doubles, a four).
   const SHELLS=[lin(0xf4f1ea),lin(0xf2c230),lin(0xc0392b),lin(0x1f5fa8),lin(0xf4f1ea)];
   const shell=(c,len,z,col)=>{const n=8,pts=[];for(let k=0;k<=n;k++){const u=k/n,w=.24*Math.sin(Math.PI*u)**.6;pts.push([u*len-len/2,w]);}
    const L=pts.map(([a,w])=>f(c[0]+a,c[1]+w,z)),R=pts.map(([a,w])=>f(c[0]+a,c[1]-w,z)),K=pts.map(([a,w])=>f(c[0]+a,c[1],z-.18*Math.min(1,w*5)));
    for(let k=0;k<n;k++){geo.face(L[k],L[k+1],K[k+1],K[k],col);geo.face(R[k],R[k+1],K[k+1],K[k],col);geo.face(L[k],L[k+1],R[k+1],R[k],mulc(col,.9));}};
   for(const [b0,len] of [[s.oc+7,8.5],[s.oc+10,11]]){
    const g=s.zc;for(const a of [-len*.3,len*.3]){geo.beam(f(a,b0-.6,g),f(a,b0,g+1.9),.08,.08,lin(0x7a5a3a));geo.beam(f(a,b0+.6,g),f(a,b0,g+1.9),.08,.08,lin(0x7a5a3a));
     for(const z of [.6,1.1,1.6])geo.beam(f(a,b0-.45,g+z),f(a,b0+.45,g+z),.06,.06,lin(0x6a4a2a));}
    for(const z of [.66,1.16,1.66])if(rand()<.85)shell([0,b0],len*(.85+.15*rand()),g+z+.06,SHELLS[Math.floor(rand()*SHELLS.length)]);
   }
   shell([.4,s.oc-1.2],8.2,top-.6,SHELLS[0]);
   clearings.push({x:s.x+s.nx*(s.oc+8),y:s.y+s.ny*(s.oc+8),r:9});placed.circle(s.x+s.nx*(s.oc+8),s.y+s.ny*(s.oc+8),7.5);placed.circle(s.x+s.nx*(s.oc+1),s.y+s.ny*(s.oc+1),3.5);stats.ramp=1;
  }
 }

 // ---------------------------------------------------------------- mirantes, kiosks and gyms (chosen before the rest)
 const plan=[];
 for(const run of runs){
  for(let i=8;i<run.length-8;i++){
   const s=run[i];if(!s.ok)continue;
   if(rand()<.04)plan.push({i,run,s,r:rand()});
  }
 }
 plan.sort((a,b)=>a.r-b.r);
 const counts={},decks=[];
 const spaced=(list,s,d)=>list.every(q=>Math.hypot(q.x-s.x,q.y-s.y)>d);
 const kiosks=[],gyms=[];let kioskName=Math.floor(rand()*KIOSKS.length);
 if(!light)for(const {i,run,s} of plan){
  const S=s.S,c=counts[s.style]??={decks:0,kiosks:0,gyms:0};
  // A mirante: a wooden deck out over the armour to the water, on a straight stretch of promenade.
  const straight=Math.abs(run[i-6].nx*run[i+6].nx+run[i-6].ny*run[i+6].ny)>.97;
  if(c.decks<(S.decks??0)&&straight&&spaced(decks,s,140)){
   const P=at(s,s.oc+2);if(onPromenade(...P,1)&&standOk(...P,4,false)&&[-5,0,5].every(d=>{const q=run[i+d];return q.ok&&rockOk(...at(q,q.ot+1))&&rockOk(...at(q,q.oc));})){
    decks.push({x:s.x,y:s.y,s,i,run,half:4.2+rand()*1.6});c.decks++;continue;}
  }
  if(c.kiosks<(S.kiosks??0)&&spaced(kiosks,s,170)){
   const o=s.oc+10.5+rand()*2,P=at(s,o);if(onPromenade(...P,2.5)&&standOk(...P,5.5,true)){kiosks.push({x:P[0],y:P[1],s,h:Math.atan2(-s.ny,-s.nx),k:kioskName++%KIOSKS.length});placed.circle(...P,5.5);c.kiosks++;continue;}
  }
  if(c.gyms<(S.gyms??0)&&spaced(gyms,s,250)&&spaced(kiosks,s,40)){
   const P=at(s,s.oc+11);if(onPromenade(...P,2)&&[-6,6].every(d=>onPromenade(...at(run[i+d],run[i+d].oc+11),1.5))&&standOk(...P,6.5,true)){gyms.push({x:P[0],y:P[1],s,h:Math.atan2(s.ty,s.tx)+Math.PI/2});placed.circle(...P,7);c.gyms++;}
  }
 }

 // ---------------------------------------------------------------- the armour, the bedding under it and the edge
 const deckAt=new Map();
 for(const d of decks)for(let j=-Math.ceil(d.half)-1;j<=Math.ceil(d.half)+1;j++){const q=d.run[d.i+j];if(q)deckAt.set(q,d);}
 const sizeK=light?1.45:1;
 for(const run of runs){
  for(let i=0;i<run.length;i++){
   const s=run[i];if(!s.ok)continue;stats.stations++;
   const next=run[i+1];
   // Bedding: a dark ribbon from below the water up under the crest, a few centimetres over the visible ground (clear
   // of it in the depth buffer from afar), every second station.
   const n2=run[i+2]?.ok?run[i+2]:next;
   if(i%2===0&&n2?.ok&&next?.ok&&beddingOk(s.edgeX,s.edgeY)&&beddingOk(n2.edgeX,n2.edgeY)){
    const fr=[0,.35,.7,1,1.06],ring=q=>fr.map(f=>{const o=q.ot+(q.oc+.1-q.ot)*f,p=at(q,o),z=f>1?(g0(...p)??level)+.05:Math.max(level-1.05+(q.zc-level+1.05)*Math.min(1,f)-.28,(g0(...p)??level)+.07);return [p[0],p[1],z];});
    const a=ring(s),b=ring(n2),dark=mulc(lin(0x5a554d),.62+.12*rand());
    for(let k=0;k<fr.length-1;k++)faixa.face(a[k],b[k],b[k+1],a[k+1],k===fr.length-2?mulc(dark,1.15):dark,ROCK);
    stats.shore_m+=2*STEP;
   }
  }
  // Boulders row by row from the crest down, each row walked along its own offset line so the outside of a bend
  // stays as full as the inside.
  const rows=light?[.5,1.6,2.7,3.8]:[.35,1.15,1.95,2.75,3.55,4.35];
  rows.forEach((d,ri)=>{
   let acc=0,next=0,prev=null;
   for(let i=0;i<run.length;i++){
    const s=run[i];if(!s.ok){prev=null;continue;}
    const o=s.oc-d;if(o<s.ot+.2){prev=null;continue;}
    const p=at(s,o);if(prev)acc+=Math.hypot(p[0]-prev[0],p[1]-prev[1]);prev=p;
    if(acc<next)continue;
    const S=s.S,natural=!!S.natural;let size=(S.rock[0]+(S.rock[1]-S.rock[0])*rand()**1.4)*sizeK*(ri===0?.75:1);if(rand()<.08&&ri>0)size*=1.45;
    next=acc+size*(natural?.78:.86)*(.8+.4*rand());
    const zs=level-1.05+(s.zc-level+1.05)*clamp((o-s.ot)/(s.oc-s.ot),0,1);
    const jx=(rand()-.5)*.35,x=p[0]+s.tx*(rand()-.5)*size*.3+s.nx*jx,y=p[1]+s.ty*(rand()-.5)*size*.3+s.ny*jx;
    const z=Math.max(zs,(g0(x,y)??zs)-.05)-size*.16+(rand()-.5)*.1;
    if(z+size*.3<level-.12)continue;
    const small=!rockOk(x,y);if(small&&!underDeck(x,y))continue;
    const dk=deckAt.get(s);if(dk&&z+size*.3>s.zc-.35||s.ramp)continue;
    boulder(geoOf(s),x,y,small?z-size*.2:z,small?size*.6:size,rand,level,natural,light);stats.rocks++;
   }
  });
 }

 // The edge of the promenade: a low wall (Beira-Mar Norte) or a curb, railings on some stretches, with gaps.
 const edgeOk=s=>s.ok&&s.S.edge&&!deckAt.has(s)&&!s.ramp&&standOk(s.edgeX,s.edgeY,.2)&&onPromenade(...at(s,s.oc+1),.2);
 for(const run of runs){
  let gapAt=60+rand()*80,railOn=rand()<.5,railPts=[],railAcc=0,railKind=null;
  const flush=geo=>{if(railPts.length>1&&geo){railing(geo,railPts,railKind,rand);stats.railing_m+=railPts.length*1.9;}railPts=[];};
  for(let i=0;i<run.length;i++){
   const s=run[i],n=run[i+1],S=s.S,geo=geoOf(s);
   if(!edgeOk(s)){flush(geo);continue;}
   // An opening to the rocks now and then (fishermen, the stairs down); the railing comes and goes by stretch.
   if(s.s>gapAt){gapAt=s.s+60+rand()*90;flush(geo);railOn=S.rail?rand()<.85:rand()<(S.railSome??0);
    // Where the way down to the rocks opens, now and then the city's warning.
    if(!light&&rand()<.3){const P=at(s,s.oc+.9),z=g0(...P);if(z!=null&&standOk(...P,.6)){sign(geo,P[0],P[1],z,Math.atan2(s.ny,s.nx),atlas,atlas.sign('pedras'),.9);placed.circle(...P,.6);}}
    i+=2;continue;}
   if(n&&edgeOk(n)){
    const wallH=S.edge==='mureta'?.55:.14,width=S.edge==='mureta'?.32:.2,tone=.9+.12*Math.sin(s.s*.27+Math.floor(s.s/4.5)*1.7);
    const conc=mulc(lin(S.edge==='mureta'?0xc9c5bc:0xb4afa6),tone),bot=mulc(conc,.65);
    const a0=at(s,s.oc),b0=at(n,n.oc),a1=at(s,s.oc+width),b1=at(n,n.oc+width),za=s.zc,zb=n.zc;
    geo.face([...a0,za-.45],[...b0,zb-.45],[...b0,zb+wallH],[...a0,za+wallH],bot,CONC);
    geo.face([...a0,za+wallH],[...b0,zb+wallH],[...b1,zb+wallH],[...a1,za+wallH],conc,CONC);
    geo.face([...a1,za+wallH],[...b1,zb+wallH],[...b1,zb-.05],[...a1,za-.05],mulc(conc,.85),CONC);
    stats.wall_m+=STEP;
   }
   if(!light&&railOn&&S.edge!=='mureta'){
    railKind=S.rail??'galvanizado';railAcc+=STEP;
    if(railAcc>=1.9||!railPts.length){railAcc=0;const p=at(s,s.oc+.1);railPts.push([p[0],p[1],s.zc+.12]);}
   }else flush(geo);
  }
  flush(geoOf(run.at(-1)));
 }

 // ---------------------------------------------------------------- mirantes
 for(const d of decks){
  const s=d.s,geo=geoOf(s),h=Math.atan2(s.ty,s.tx),out=Math.max(4.5,s.oc-s.wetS+1.2),z=s.zc+.15,wood=pierCol();
  const f=(a,b,dz=0)=>[s.x+s.tx*a+s.nx*b,s.y+s.ty*a+s.ny*b,z+dz];
  const c0=f(-d.half,s.oc+.4),c1=f(d.half,s.oc+.4),c2=f(d.half,s.oc-out),c3=f(-d.half,s.oc-out);
  geo.face(c0,c1,c2,c3,wood,plank(h+Math.PI/2));
  for(const [p,q] of [[c1,c2],[c2,c3],[c3,c0]])geo.face(p,q,[q[0],q[1],q[2]-.35],[p[0],p[1],p[2]-.35],mulc(wood,.7));
  for(let a=-d.half+.3;a<=d.half;a+=2.2)for(let b=s.oc-out+.3;b<s.oc;b+=2.2){const p=f(a,b),gb=g0(p[0],p[1])??level-1.5;geo.tube([p[0],p[1],Math.max(gb-.2,level-2)],[p[0],p[1],z-.1],.12,.12,5,mulc(wood,.55),plank(0),false);}
  const rail=[];for(let a=-d.half;a<=d.half+.01;a+=1.9)rail.push(f(a,s.oc-out+.1));
  const sideL=[],sideR=[];for(let b=s.oc-out+.1;b<=s.oc-.2;b+=1.9){sideL.push(f(-d.half+.1,b));sideR.push(f(d.half-.1,b));}
  railing(geo,[...sideL.reverse(),...rail.slice(1,-1),...sideR],'madeira',rand);stats.railing_m+=2*d.half+2*out;
  bench(geo,...f(-d.half*.45,s.oc-out+1.4,-.15),h-Math.PI/2,'madeira',rand);bench(geo,...f(d.half*.45,s.oc-out+1.4,-.15),h-Math.PI/2,'madeira',rand);stats.benches+=2;
  sign(geo,...f(-d.half-1.2,s.oc+1.6,-.15),h-Math.PI/2+Math.PI,atlas,atlas.sign('mirante'),1.2);
  for(let k=0;k<1+Math.floor(rand()*2);k++){const p=f((rand()-.5)*d.half*1.6,s.oc-out+.7+rand()*.4);idle.push({x:p[0],y:p[1],z,yaw:Math.atan2(-s.ny,-s.nx)+(rand()-.5)*.8,pose:'stand',idle:'stand',watch:300});}
  for(const q of [f(0,s.oc-1)])clearings.push({x:q[0],y:q[1],r:d.half+2});stats.decks++;
 }

 // ---------------------------------------------------------------- kiosks and gyms
 for(const k of kiosks){const geo=geoOf(k.s);kiosk(geo,k.x,k.y,g0(k.x,k.y)??k.s.zc,k.h,k.k,atlas,rand,idle);clearings.push({x:k.x,y:k.y,r:6});stats.kiosks++;}
 for(const q of gyms){const geo=geoOf(q.s);gym(geo,q.x,q.y,g0(q.x,q.y)??q.s.zc,q.h,atlas,rand);clearings.push({x:q.x,y:q.y,r:8});stats.gyms++;
  for(let j=0;j<1+Math.floor(rand()*2);j++){const f=frame(q.x,q.y,g0(q.x,q.y)??q.s.zc,q.h),p=f(.9,(rand()-.5)*6);idle.push({x:p[0],y:p[1],z:p[2],yaw:q.h+Math.PI+(rand()-.5),pose:'stand',idle:'stand'});}}

 // ---------------------------------------------------------------- lamps, benches, bins along the edge; palms behind
 const benches=[];
 for(const run of runs){
  let nextLamp=rand()*10,nextBench=4+rand()*6,nextPalm=rand()*8;
  for(let i=0;i<run.length;i++){
   const s=run[i];if(!s.ok)continue;const S=s.S,geo=geoOf(s),sea=Math.atan2(-s.ny,-s.nx),edge=S.edge==='mureta'?.45:.25;
   if(!light&&S.lamp&&s.s>=nextLamp){
    const P=at(s,s.oc+edge+.75),z=g0(...P);
    if(z!=null&&onPromenade(...P,.3)&&standOk(...P,.5,true)){lamp(geo,P[0],P[1],z,sea,S.lamp,rand);pools.push([P[0],P[1],z,LAMPS[S.lamp].pool]);placed.circle(...P,.6);stats.lamps++;nextLamp=s.s+S.lampGap[0]+rand()*(S.lampGap[1]-S.lampGap[0]);}
    else nextLamp=s.s+2;
   }
   if(!light&&S.benches&&s.s>=nextBench){
    nextBench=s.s+6+rand()*10;
    if(rand()<S.benches){const P=at(s,s.oc+edge+1.45),z=g0(...P);
     if(z!=null&&onPromenade(...P,.4)&&standOk(...P,1,false)){const kind=S.concrete&&rand()<.5?'concreto':rand()<.25?'sem_encosto':'madeira',hb=sea+(rand()-.5)*.08;bench(geo,P[0],P[1],z,hb,kind,rand);placed.circle(...P,1.05);benches.push({x:P[0],y:P[1],z,h:hb,s});stats.benches++;
      if(rand()<.4){const B=at(run[Math.min(run.length-1,i+2)],s.oc+edge+1.2),zb=g0(...B);if(zb!=null&&standOk(...B,.35,false)){bin(geo,B[0],B[1],zb,sea,rand);placed.circle(...B,.35);stats.bins++;}}}}
   }
   if(s.s>=nextPalm){
    nextPalm=s.s+S.palmGap[0]+rand()*(S.palmGap[1]-S.palmGap[0]);
    // In clusters now and then, at varied depth on the lawn or the calçadão behind the walkway.
    const n=rand()<.28?2+Math.floor(rand()*2):1,o=s.oc+7.4+rand()*(S.natural?10:8.5);
    for(let j=0;j<n;j++){
     const P=at(s,o);if(j){P[0]+=(rand()-.5)*5;P[1]+=(rand()-.5)*5;}const z=g0(...P);
     if(z==null||!(S.natural?(map?surface(...P)!=='road'&&map.at(...P).road>2:true):onPromenade(...P,.8))||!standOk(...P,1.2,true))continue;
     let r=rand(),kind=S.palms[0][0];for(const [name,w] of S.palms){if(r<w){kind=name;break;}r-=w;}
     if(light&&rand()<.3)continue;palm(geo,P[0],P[1],z,kind,sea,rand,light);placed.circle(...P,1.4);stats.palms++;
    }
   }
  }
 }

 // ---------------------------------------------------------------- fishermen on the rocks, rods over the water
 const rod=(geo,x,y,z,h)=>{
  const f=frame(x,y,z,h),butt=f(.35,.2,.05),tip=f(2.6,.5,2.5),line=f(6.5+rand()*3,.8,level-z);
  geo.beam(butt,tip,.025,.025,lin(0x1b1d20));geo.face(tip,[tip[0],tip[1],tip[2]+.01],[line[0],line[1],line[2]+.01],line,lin(0xdedede));
  geo.box(...f(.4,.2,-.02),.12,.12,.25,h,lin(0x3a6ea5));
 };
 if(!light){
  let fishers=0;
  for(const run of runs)for(let i=10;i<run.length-10;i+=1){
   const s=run[i];if(!s.ok||fishers>=6||rand()>.006)continue;
   const P=at(s,s.oc-.9),z=s.zc+.35;if(!rockOk(...P)||!standOk(...at(s,s.oc+1),.5))continue;
   idle.push({x:P[0],y:P[1],z,yaw:Math.atan2(-s.ny,-s.nx)+(rand()-.5)*.5,pose:'stand',idle:'stand',fish:true,geo:geoOf(s)});fishers++;
  }
  for(const p of idle)if(p.fish){const geo=p.geo??geoNear(p.x,p.y);rod(geo,p.x,p.y,p.z,p.yaw);}
 }

 // ---------------------------------------------------------------- people on the benches and at the edge
 if(!light){
  for(const b of benches){
   if(rand()>.17)continue;const n=rand()<.3?2:1,f=frame(b.x,b.y,b.z,b.h);
   for(let j=0;j<n;j++){const p=f(-.08,n===2?(j?.42:-.42):(rand()-.5)*.8);idle.push({x:p[0],y:p[1],z:b.z,yaw:b.h+(rand()-.5)*.15,pose:'sit',idle:'seated',watch:rand()<.7?320:0});}
  }
  // Friends stopped to chat on the calçadão, and the ambulantes with their coolers: between the walkers' lines and
  // the cycleway's (not in the way of either).
  let groups=0,sellers=0;
  for(const run of runs)for(let i=0;i<run.length;i+=4){
   const s=run[i];if(!s.ok||!s.S.lamp||rand()>.025)continue;const P=at(s,s.oc+5.3+rand()*.5),z=g0(...P);
   if(z==null||!onPromenade(...P,1)||!standOk(...P,1.2))continue;
   if(sellers<6&&rand()<.3){
    const h=Math.atan2(s.ny,s.nx)+(rand()-.5),f=frame(P[0],P[1],z,h),geo=geoOf(s);geo.box(...f(.55,0),.3,.22,.42,h,lin(0xeeeeea),E0,lin(0x1d6f8c));
    if(rand()<.6){const c=lin(['#c0392b','#f2c230','#1d6f8c'][Math.floor(rand()*3)]);geo.tube(f(.2,.6,0),f(.2,.6,2.1),.02,.02,4,lin(0xdddddd));geo.tube(f(.2,.6,1.85),f(.2,.6,2.25),1,.05,8,c,E0,false);}
    idle.push({x:P[0],y:P[1],z,yaw:h+Math.PI,pose:'stand',idle:'stand'});sellers++;continue;
   }
   if(groups>=18)continue;
   const n=2+Math.floor(rand()*2),a0=rand()*TAU;
   for(let j=0;j<n;j++){const a=a0+j*TAU/n,x=P[0]+Math.cos(a)*.55,y=P[1]+Math.sin(a)*.55;idle.push({x,y,z,yaw:a+Math.PI+(rand()-.5)*.4,pose:'stand',idle:'stand'});}
   groups++;
  }
  // Watching the race from the railing nearest the track.
  let watchers=0;
  for(const run of runs)for(let i=0;i<run.length;i+=3){
   const s=run[i];if(!s.ok||watchers>=8||rand()>.03)continue;const P=at(s,s.oc+(s.S.edge==='mureta'?.75:.6)),q=bands(...P);
   if(q.pista>260||!onPromenade(...P,.2)||!standOk(...P,.4))continue;const z=g0(...P);if(z==null)continue;
   const n=rand()<.4?2:1;for(let j=0;j<n;j++){const x=P[0]+s.tx*j*.7,y=P[1]+s.ty*j*.7;idle.push({x,y,z,yaw:Math.atan2(-s.ny,-s.nx)+(rand()-.5)*.9,pose:'stand',idle:'stand',watch:420});placed.circle(x,y,.4);}watchers++;
  }
 }

 // ---------------------------------------------------------------- the static meshes
 const U={bmTime:{value:0},bmNight:{value:0},moveTime:{value:0}};
 const material=staticMaterial(atlas.map,U,level),meshes=[];let triangles=0;
 for(const name of ['faixa',...tiles.keys()]){
  const geo=name==='faixa'?faixa:tiles.get(name);if(!geo.n)continue;const g=geo.build(),mesh=new THREE.Mesh(g,material);
  mesh.name='Beira_mar_'+name;mesh.castShadow=!light&&name!=='faixa';mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;root.add(mesh);meshes.push(mesh);triangles+=geo.triangles;
  // Left out of the cars' reflection cube, as the stands' crowd is (car-reflections.js CAPTURE_SKIP): rocks and palms
  // are a few pixels on the paint, and a tile is tens of thousands of triangles in each face drawn.
  mesh.onBeforeRender=renderer=>{const t=renderer.getRenderTarget();if(t&&(t.isWebGLCubeRenderTarget||t.width<64))g.drawRange.count=0;};
  mesh.onAfterRender=()=>{g.drawRange.count=Infinity;};
 }

 // ---------------------------------------------------------------- boats tied up at the trapiches
 let boats=null,boatSpots=[];
 if(!light&&moor.length){
  // Where its hull, bow to stern, stays clear of every deck (an L-shaped trapiche's other arm) and of the other boats.
  const sideOf=m=>m.side??((g0(m.x+Math.cos(m.h+Math.PI/2)*3,m.y+Math.sin(m.h+Math.PI/2)*3)??0)<(g0(m.x-Math.cos(m.h+Math.PI/2)*3,m.y-Math.sin(m.h+Math.PI/2)*3)??0)?1:-1);
  const picks=[];
  for(const m of moor.sort(()=>rand()-.5)){
   if(picks.length>=12)break;m.side=sideOf(m);const x=m.x+Math.cos(m.h+Math.PI/2)*m.side*1.7,y=m.y+Math.sin(m.h+Math.PI/2)*m.side*1.7;
   if([-3,0,3].some(a=>blocked.hit(x+Math.cos(m.h)*a,y+Math.sin(m.h)*a,1))||!picks.every(p=>Math.hypot(p.x-m.x,p.y-m.y)>7))continue;picks.push(m);
  }
  const geo=hullGeometry(),mat=new THREE.MeshStandardMaterial({name:'Beira_mar_barcos',vertexColors:true,roughness:.6});
  mat.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float paint;').replace('#include <color_vertex>',`vColor=vec4(color,1.);
#ifdef USE_INSTANCING_COLOR
vColor.rgb*=mix(vec3(1.),instanceColor,paint);
#endif`);};
  mat.customProgramCacheKey=()=>'beira-mar-barcos-v1';
  const im=new THREE.InstancedMesh(geo,mat,picks.length);im.name='Beira_mar_barcos';im.castShadow=true;im.receiveShadow=true;im.frustumCulled=false;
  const PAINTS=[0x1f5fa8,0xc0392b,0xf2c230,0x2f8a3a,0x3aa7c9,0xe67e22,0xeeeeea];
  const items=picks.map((m,k)=>{
   // Alongside the deck, 1.7 m off its edge (outside a polygon, else on the deeper side), bow one way or the other.
   const side=m.side;
   const x=m.x+Math.cos(m.h+Math.PI/2)*side*1.7,y=m.y+Math.sin(m.h+Math.PI/2)*side*1.7;
   im.setColorAt(k,new THREE.Color(PAINTS[Math.floor(rand()*PAINTS.length)]).multiplyScalar(.75+.3*rand()));
   return {x,y,h:m.h+(rand()<.5?Math.PI:0)+(rand()-.5)*.15,phase:rand()*TAU,rate:.6+rand()*.5,scale:.85+rand()*.3};
  });
  const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),E=new THREE.Euler(0,0,0,'YXZ'),V=new THREE.Vector3(),SC=new THREE.Vector3();let time=0;
  const place=()=>{for(let k=0;k<items.length;k++){const b=items[k],w=time*b.rate+b.phase;E.set(Math.sin(w*1.2)*.02,b.h+Math.sin(time*.05+b.phase)*.08,Math.sin(w*.8)*.05);Q.setFromEuler(E);V.set(b.x,level+Math.sin(w)*.06,-b.y);SC.setScalar(b.scale);im.setMatrixAt(k,M.compose(V,Q,SC));}im.instanceMatrix.needsUpdate=true;};
  place();root.add(im);stats.boats=items.length;boatSpots=items.slice(0,3).map(b=>[Math.round(b.x),Math.round(b.y)]);
  boats={update(dt){time+=dt;place();}};
 }

 // ---------------------------------------------------------------- people
 // A dozen nearest the race on the island side, who turn their heads after the cars, are pit-crew.js figures (one
 // crowd); everyone else is one instanced figure animated in its vertex shader: walking, jogging and cycling along the
 // promenade, standing at the railing or in a chat, sitting on the benches, fishing.
 let folk=null;
 if(!light){
  for(const p of idle)p.track=bands(p.x,p.y).pista;
  // (pit-crew.js groups a crowd by cells from the world origin: the ones on the island north of it, round the Hercílio
  // Luz's island head and the start of the Beira-Mar Norte, all fall in one.)
  const crew=new Set(idle.filter(p=>p.watch&&p.x>0&&p.y>0).sort((a,b)=>a.track-b.track).slice(0,12)),still=idle.filter(p=>!crew.has(p));
  // Lanes: stretches of promenade where a line some metres behind the edge stays on the calçadão and clear.
  const lanes=[];
  for(const run of runs){
   let cur=null;const flush=()=>{if(cur&&cur.length>=40)lanes.push(cur);cur=null;};
   for(let i=0;i<run.length;i++){
    const s=run[i];if(!s.ok||!s.S.lamp){flush();continue;}
    const P=at(s,s.oc+3.8),Q=at(s,s.oc+6.4),good=onPromenade(...P,1)&&onPromenade(...Q,.6)&&standOk(...P,.8)&&!placed.hit(...Q,.6)&&bands(...Q).pista>4.5;
    if(!good){flush();continue;}(cur??=[]).push(s);
   }
   flush();
  }
  // The cycleway, where the city map has one along the shore: its middle, smoothed along the lane; else a line
  // behind the walkway.
  for(const lane of lanes){
   const raw=lane.map(s=>{if(!map)return null;let a=null,b=null;for(let o=s.oc+2;o<=s.oc+24;o+=.5){const inside=map.distance('cycleway',...at(s,o))<-.3;if(inside&&a==null)a=o-s.oc;if(!inside&&a!=null){b=o-s.oc;break;}}return a!=null&&b!=null&&b-a>1.2?(a+b)/2:null;});
   lane.forEach((s,i)=>{let t=0,n=0;for(let j=i-6;j<=i+6;j++)if(raw[j]!=null){t+=raw[j];n++;}s.cyc=n>6?t/n:6.7;});
  }
  const total=lanes.reduce((t,l)=>t+l.length,0),movers=[];
  if(total>0){
   const nWalk=Math.min(52,Math.round(total/50)),nJog=Math.round(nWalk*.35),nBike=Math.round(nWalk*.32);
   const pickLane=()=>{let r=rand()*total;for(const l of lanes){if(r<l.length)return l;r-=l.length;}return lanes[0];};
   for(let k=0;k<nWalk+nJog+nBike;k++){
    const kind=k<nWalk?0:k<nWalk+nJog?1:2,lane=pickLane(),speed=kind===0?1+rand()*.55:kind===1?2.4+rand():3.6+rand()*2.2;
    // A pair walking side by side now and then: the second keeps the first's lane and pace.
    const prev=movers.at(-1),pair=kind===0&&prev?.kind===0&&!prev.paired&&rand()<.3?prev:null;
    const off=kind===2?.45+(rand()-.5)*.2:pair?pair.off+(pair.off>4?-.65:.65):2.9+rand()*1.9;
    const p={kind,lane:pair?pair.lane:lane,u:pair?pair.u+.3:rand()*(lane.length-1),dir:pair?pair.dir:rand()<.5?1:-1,speed:pair?pair.speed:speed,off,paired:!!pair};
    if(pair)pair.paired=true;movers.push(p);
   }
  }
  const count=movers.length+still.length;
  if(count){
   const geo=moverGeometry(),{material:mm,depth}=moverMaterials(U),col=new THREE.Color();
   const iA=new Float32Array(count*4),iBot=new Float32Array(count*4),iSkin=new Float32Array(count*4),iBike=new Float32Array(count*3);
   const im=new THREE.InstancedMesh(geo,mm,count);im.name='Beira_mar_gente';im.castShadow=true;im.receiveShadow=false;im.frustumCulled=false;im.customDepthMaterial=depth;
   const KIND={stand:3,sit:4};
   const all=[...movers,...still];
   all.forEach((p,k)=>{
    const kind=p.lane?p.kind:p.fish?5:KIND[p.pose]??3,rate=p.lane?(kind===0?p.speed/1.45:kind===1?p.speed/2.1:p.speed/4.6)*TAU:0;
    iA.set([rand()*TAU,rate,kind,0],k*4);
    const skin=new THREE.Color(SKINS[Math.floor(rand()*SKINS.length)]),bot=new THREE.Color(BOTTOMS[Math.floor(rand()*BOTTOMS.length)]);
    iSkin.set([skin.r,skin.g,skin.b,rand()<.18?.6+rand()*.4:rand()*.25],k*4);iBot.set([bot.r,bot.g,bot.b,kind===2||rand()<.4?0:1],k*4);
    const bike=new THREE.Color([0xc0392b,0x1f5fa8,0x1b1d20,0xeeeeea,0x2f8a3a,0xf2c230][Math.floor(rand()*6)]);iBike.set([bike.r,bike.g,bike.b],k*3);
    im.setColorAt(k,col.set(TOPS[Math.floor(rand()*TOPS.length)]));
   });
   geo.setAttribute('iA',new THREE.InstancedBufferAttribute(iA,4));geo.setAttribute('iBot',new THREE.InstancedBufferAttribute(iBot,4));
   geo.setAttribute('iSkin',new THREE.InstancedBufferAttribute(iSkin,4));geo.setAttribute('iBike',new THREE.InstancedBufferAttribute(iBike,3));
   const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),V=new THREE.Vector3(),SC=new THREE.Vector3(1,1,1),Y=new THREE.Vector3(0,1,0),ZERO=new THREE.Vector3(0,0,0);
   still.forEach((p,k)=>im.setMatrixAt(movers.length+k,M.compose(V.set(p.x,p.z,-p.y),Q.setFromAxisAngle(Y,p.yaw),SC)));
   const place=eye=>{
    for(let k=0;k<movers.length;k++){
     const p=movers[k],L=p.lane,f=clamp(p.u,0,L.length-1.001),i=Math.floor(f),t=f-i,a=L[i],b=L[i+1];
     const o=(a.oc+(b.oc-a.oc)*t)+(p.kind===2?(a.cyc+(b.cyc-a.cyc)*t)-p.dir*p.off:p.off),x=a.x+(b.x-a.x)*t+(a.nx+(b.nx-a.nx)*t)*o,y=a.y+(b.y-a.y)*t+(a.ny+(b.ny-a.ny)*t)*o;
     if(eye&&Math.hypot(eye.x-x,-eye.z-y)>700){im.setMatrixAt(k,M.compose(V.set(x,0,-y),Q.identity(),ZERO));continue;}
     const h=Math.atan2(a.ty+(b.ty-a.ty)*t,a.tx+(b.tx-a.tx)*t)+(p.dir<0?Math.PI:0);
     im.setMatrixAt(k,M.compose(V.set(x,g0(x,y)??level,-y),Q.setFromAxisAngle(Y,h),SC));
    }
    im.instanceMatrix.needsUpdate=true;
   };
   // Left out of the cars' reflection cube (a few coloured pixels there for every figure drawn whole in each face).
   im.onBeforeRender=renderer=>{const t=renderer.getRenderTarget();im.count=t&&(t.isWebGLCubeRenderTarget||t.width<64)?0:count;};
   place(null);root.add(im);
   stats.walkers=movers.filter(p=>p.kind===0).length;stats.joggers=movers.filter(p=>p.kind===1).length;stats.cyclists=movers.filter(p=>p.kind===2).length;stats.still=still.length;stats.people+=count;
   folk={update(dt,eye){for(const p of movers){p.u+=p.dir*p.speed*dt/STEP;if(p.u>p.lane.length-1.001||p.u<0){p.dir*=-1;p.u=clamp(p.u,0,p.lane.length-1.001);}}if(movers.length)place(eye);}};
  }
  // One crowd, one draw.
  const list=[...crew];
  if(list.length){
   const entries=list.map(p=>({outfit:outfit(rand),pose:p.pose,idle:p.idle,x:p.x,y:p.z,z:-p.y,yaw:p.yaw,watch:p.watch??0}));
   const group=createPeople().crowd(entries,{name:'Beira_mar_pessoas',cell:1e5,seed:.37});if(group)root.add(group);
  }
  stats.crew=crew.size;stats.people+=crew.size;
 }

 // ---------------------------------------------------------------- the lamps' light on the ground after dark
 // A warm pool round each lamp's foot, added over whatever it falls on: drawn only when the lamps are lit.
 let glow=null;
 if(pools.length){
  const disc=canvasTexture((ctx,w,h)=>{const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(255,226,180,1)');g.addColorStop(.3,'rgba(255,212,160,.6)');g.addColorStop(.7,'rgba(255,200,140,.18)');g.addColorStop(1,'rgba(255,190,130,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);},128,128);
  const mat=new THREE.MeshBasicMaterial({name:'Beira_mar_luz_chao',map:disc,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,toneMapped:false});
  const im=new THREE.InstancedMesh(new THREE.PlaneGeometry(2,2).rotateX(-Math.PI/2),mat,pools.length),M=new THREE.Matrix4();
  pools.forEach(([x,y,z,r],k)=>im.setMatrixAt(k,M.makeScale(r,1,r).setPosition(x,z+.06,-y)));
  im.name='Beira_mar_luz_chao';im.visible=false;im.renderOrder=2;im.computeBoundingSphere();root.add(im);glow=im;
 }

 // ---------------------------------------------------------------- per frame: the breeze, the boats, the walkers, distance
 const eye=new THREE.Vector3(),reach=mobile?600:lean?750:950;
 for(const m of meshes){m.geometry.computeBoundingSphere();m.userData.sphere=m.geometry.boundingSphere;}
 let drawCalls=0;root.traverse(o=>{if(o.isMesh)drawCalls++;});
 let instanced=0,crowd=0;root.traverse(o=>{if(o.isSkinnedMesh)crowd+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;if(o.isInstancedMesh)instanced+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3*o.count;});
 const spot=l=>l.map(q=>[Math.round(q.x),Math.round(q.y)]);
 Object.assign(stats,{spots:{decks:spot(decks),kiosks:spot(kiosks),gyms:spot(gyms),ramp:ramp?[[Math.round(ramp.s.x),Math.round(ramp.s.y),+ramp.s.nx.toFixed(2),+ramp.s.ny.toFixed(2)]]:[],boats:boatSpots},drawCalls,tiles:tiles.size,triangles,instancedTriangles:instanced,crowdTriangles:crowd,meshes:meshes.length,buildMs:Math.round(performance.now()-t0)});
 return {root,stats,clearings,obstacles:[],
  setNight(level){U.bmNight.value=level;if(glow){glow.visible=level>.05;glow.material.opacity=.38*level;}},
  update(dt,camera){
   U.bmTime.value+=dt;U.moveTime.value+=dt;
   if(camera){eye.setFromMatrixPosition(camera.matrixWorld);for(const m of meshes){const s=m.userData.sphere;m.visible=eye.distanceTo(s.center)-s.radius<(m===meshes[0]?4000:reach);}}
   boats?.update(dt,eye);folk?.update(dt,eye);
  }};
}
