import * as THREE from 'three';
import {canvasTexture} from './pit-textures.js';

// The buildings of the real city round the street circuit (Floripa, data.scenery.city.buildings, gerar_cidade_floripa.py):
// the Centro on the island (Paulo Fontes, Hoepcke, Adolfo Konder, the old sobrados round the Mercado and the Alfândega,
// the towers toward the Beira-Mar Norte) and the Estreito on the continent (14 de Julho, Ivo Silveira), each built on its
// cadastre footprint and measured height. Every wall is one quad; what a wall shows (floors, windows with frames, sills,
// shutters and roller blinds, balconies, air conditioners, shop fronts with steel doors and signs, a house's door and
// garage, a blank party wall against the neighbour) is drawn by one facade shader from a few numbers: where along its run
// of wall and how high (per vertex), the building's style and seed, its floor heights and the run's bays (per group, in a
// small float table). The apartment towers' balconies are real slabs and railings. Roofs: flat slabs behind a parapet with
// the water tanks and lift rooms of a Brazilian roof, hipped clay tiles on the small houses, corrugated metal on the
// sheds, a gable and a bell tower on the churches. Everything merges into a dozen meshes (compact clusters, one
// material), so the whole city is a dozen draw calls; the facade detail fades to its average with distance, so a block
// seen across the bay does not shimmer. The phone and Básico builds keep the walls and roofs with a lighter facade.

function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
// Linear colours from sRGB hex (vertex colours are linear).
const lin=hex=>{const c=new THREE.Color(hex);return [c.r,c.g,c.b];};
const pick=(list,r)=>list[Math.min(list.length-1,Math.floor(r*list.length))];
// Paint is never as bright as its swatch: walls at about 60% of the swatch in linear light (the cinematic exposure).
const ALBEDO=.6;
const tint=(c,k)=>[c[0]*k,c[1]*k,c[2]*k];

// Styles (the shader's facade programs) and parts (what a face is).
const HOUSE=0,COLONIAL=1,TOWER=2,OFFICE=3,SHED=4,CHURCH=5,SHOPS=6,STYLE_NAMES=['casa','sobrado','torre','escritorio','galpao','igreja','lojas'];
const WALL=0,ROOF=1,CAP=2,TILE=3,METAL=4,PROP=5,AWNING=6,SOFFIT=7,INNER=8,SLAB=9,RAIL=10;
// Wall flags: faces a street, against a neighbour, shops on its street storey, bare brick; an awning's stripes.
const F_FRONT=1,F_PARTY=2,F_SHOPS=4,F_BRICK=8,F_STRIPES=16;

// Florianópolis' paint: whites and creams, beige and light grey on the towers (and their old ceramic tiles), pastel on the
// houses, strong colonial colours round the Mercado; sheds in fibre cement and painted block.
const PAL={
 plaster:['#f1eee6','#ebe4d3','#e6dcc1','#d8c8a6','#cfcbc2','#ecd78e','#bcd0de','#e8c3bc','#c6d9b6','#e6bc90','#dcd4ca','#f3e9cf'].map(lin),
 colonial:['#e7b84a','#d9824f','#c45a4c','#6e9cc2','#78aa86','#e3a1a7','#efd49c','#94c0c6','#d3a35e','#f2ece0','#b8cf6c','#e9967a'].map(lin),
 tower:['#f1eee8','#e6e0d3','#d8cfbf','#cbc7bf','#c1b7a5','#a9b4ba','#d6b9a2','#b9a68c','#e9e3d7','#dcd6cc','#c8ccd0','#e2d2b8'].map(lin),
 office:['#dad7d1','#b9bdc1','#8f969a','#e9e4da','#646e75','#c9c1b3','#a7a39b'].map(lin),
 shed:['#cac7c0','#b8b3a9','#d9d4c9','#a0a5a8','#8d9b90','#c4b9a5'].map(lin),
 church:['#f2eee4','#efe3c5','#f0e6d0','#e9e0cf'].map(lin),
 brick:['#9c5a3c','#a8664a','#8f4f35','#b0704f'].map(lin),
 tile:['#b5562f','#a34a2a','#8f4a2f','#c06a3c','#7a4030','#9b5b3e','#b86a45','#6e3a2c'].map(lin),
 slab:['#8f8c86','#a19d95','#77746f','#b9b6ae','#6c6a66','#9a958a','#c4c6c8'].map(lin),
 metal:['#b9bcbd','#a6aaab','#c9cccc','#8f9497','#7c4b3a','#5f7f8a','#9ea29c'].map(lin),
 awning:['#2f6b3a','#a3262a','#1f4f8a','#d9a21b','#d4602a','#e8e4da','#5a2d6e','#1e6f6a','#7a1f1f','#344a2a'].map(lin),
 tank:['#2c5f9e','#3a6fb0','#2a5486'].map(lin),
 concrete:['#a9a69f','#b8b4ab','#9a978f','#c2bdb2'].map(lin)
};
// Joke shop names only (the user's rule: no real or real-sounding businesses, no phones).
const SIGNS=['BAZAR PERDEU-ACHOU','ÓTICA VÊ SE ENXERGA','LANCHES MORDE E ASSOPRA','SALÃO TESOURA CEGA','CHAVEIRO ABRE-TE SÉSAMO','RELOJOARIA ATRASADINHA',
 'PADARIA PÃO DORMIDO','MERCADINHO FIADO NUNCA','BRECHÓ ROUPA DO VÔ','CELULAR DE TELA RACHADA','LOTERIA QUASE GANHEI','BOLOS ABATUMADOS',
 'SAPATARIA CHULÉ ZERO','ARMARINHO LINHA TORTA','BOTECO SAIDEIRA ETERNA','PEIXARIA TÁ PRA PEIXE','PASTEL DE VENTO','SORVETERIA DERRETEU',
 'ELETRÔNICA QUEIMOU','LIVRARIA LEU, PAGOU','FARMÁCIA DÓI NADA','LAN HOUSE DISCADA','XIS DO ESFOMEADO','MODAS ROUPA APERTADA',
 'PET SHOP LATE MUITO','AÇOUGUE CORTA ESSA','CAFÉ PASSADO ONTEM','PIZZARIA MASSA CRUA','ACADEMIA AMANHÃ EU VOU','OFICINA DO BARULHINHO',
 'PAPELARIA BORRACHA DURA','FLORICULTURA MURCHOU'];
const SIGN_COLS=2,SIGN_ROWS=16;

// --- Footprints
const ringArea=p=>{let s=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];s+=a[0]*b[1]-b[0]*a[1];}return s/2;};
function ringOf(flat){
 const p=[];for(let i=0;i+1<flat.length;i+=2)p.push([flat[i],flat[i+1]]);
 if(p.length>3&&Math.hypot(p[0][0]-p[p.length-1][0],p[0][1]-p[p.length-1][1])<.01)p.pop();
 // Drop repeated points (a zero-length wall has no normal).
 const out=p.filter((q,i)=>{const r=p[(i+1)%p.length];return Math.hypot(q[0]-r[0],q[1]-r[1])>.05;});
 if(ringArea(out)<0)out.reverse();return out;
}
function insideRing(p,x,y){let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
function edgeDistance(p,x,y){let best=Infinity;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],dx=b[0]-a[0],dy=b[1]-a[1];let u=((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1e-9);u=u<0?0:u>1?1:u;const d=Math.hypot(x-a[0]-u*dx,y-a[1]-u*dy);if(d<best)best=d;}return best;}
// The least-area rectangle with a side along one of the walls: centre, long axis (ux,uy), half sizes a ≥ b.
function orientedBox(p){
 let best=null;
 for(let i=0;i<p.length;i++){
  const a=p[i],b=p[(i+1)%p.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l<.4)continue;const ux=(b[0]-a[0])/l,uy=(b[1]-a[1])/l;
  let u0=Infinity,u1=-Infinity,v0=Infinity,v1=-Infinity;
  for(const q of p){const u=q[0]*ux+q[1]*uy,v=-q[0]*uy+q[1]*ux;if(u<u0)u0=u;if(u>u1)u1=u;if(v<v0)v0=v;if(v>v1)v1=v;}
  const area=(u1-u0)*(v1-v0);if(best&&area>=best.area)continue;
  const cu=(u0+u1)/2,cv=(v0+v1)/2;best={area,cx:cu*ux-cv*uy,cy:cu*uy+cv*ux,ux,uy,a:(u1-u0)/2,b:(v1-v0)/2};
 }
 if(best.a<best.b)Object.assign(best,{ux:-best.uy,uy:best.ux,a:best.b,b:best.a});
 return best;
}
// The roomiest point inside a footprint (a grid over its rectangle): where a lift room or a water tank goes.
function roomiest(p,box){
 let best={x:box.cx,y:box.cy,r:-1};const n=8;
 for(let i=0;i<n;i++)for(let j=0;j<n;j++){
  const u=-box.a+2*box.a*(i+.5)/n,v=-box.b+2*box.b*(j+.5)/n,x=box.cx+box.ux*u-box.uy*v,y=box.cy+box.uy*u+box.ux*v;
  if(!insideRing(p,x,y))continue;const r=edgeDistance(p,x,y);if(r>best.r)best={x,y,r};
 }
 return best;
}
// The ring moved inward by d (mitred, clamped at sharp corners): a parapet's inner face.
function insetRing(p,d){
 const n=p.length;return p.map((q,i)=>{
  const a=p[(i-1+n)%n],b=p[(i+1)%n],l0=Math.hypot(q[0]-a[0],q[1]-a[1])||1,l1=Math.hypot(b[0]-q[0],b[1]-q[1])||1;
  const n0=[-(q[1]-a[1])/l0,(q[0]-a[0])/l0],n1=[-(b[1]-q[1])/l1,(b[0]-q[0])/l1],mx=n0[0]+n1[0],my=n0[1]+n1[1],ml=Math.hypot(mx,my)||1;
  const k=d/Math.max(.35,(mx*n0[0]+my*n0[1])/ml);return [q[0]+mx/ml*Math.min(k,d*2.5),q[1]+my/ml*Math.min(k,d*2.5)];
 });
}

// --- Geometry: one merged mesh per chunk. What a run of wall (or a roof, a balcony, a tank) shares is stored once per
// group in a float texture the vertex shader reads: [seed, style*16+part, flags, roof level], [corner pier, bays, shops,
// run seed], [floor height, street storey, balcony bits, run length], [colour]. A vertex carries only its place, its
// normal (bytes), (along the run, height, its wall's pavement) and its group's number.
class Grow{
 constructor(T,n=1<<14){this.a=new T(n);this.n=0;}
 room(k){if(this.n+k>this.a.length){const b=new this.a.constructor(this.a.length*2+k);b.set(this.a);this.a=b;}return this.a;}
 p1(x){this.room(1)[this.n++]=x;}
 p3(x,y,z){const a=this.room(3);a[this.n++]=x;a[this.n++]=y;a[this.n++]=z;}
 done(){return this.a.slice(0,this.n);}
}
const TABLE_ROW=256;
class Groups{
 constructor(){this.data=new Grow(Float32Array);this.count=0;this.last=null;}
 id(A,c,L){
  const l=this.last;
  if(l&&l.seed===A.seed&&l.code===A.code&&l.flags===A.flags&&l.H===A.H&&l.m===A.m&&l.nb===A.nb&&l.ns===A.ns&&l.rs===A.rs&&l.fh===A.fh&&l.gh===A.gh&&l.mask===A.mask&&l.L===L&&l.c0===c[0]&&l.c1===c[1]&&l.c2===c[2])return this.count-1;
  this.last={...A,L,c0:c[0],c1:c[1],c2:c[2]};
  const d=this.data;for(const v of [A.seed,A.code,A.flags,A.H,A.m,A.nb,A.ns,A.rs,A.fh,A.gh,A.mask,L,c[0],c[1],c[2],0])d.p1(v);
  return this.count++;
 }
 texture(){
  const rows=Math.max(1,Math.ceil(this.count/TABLE_ROW)),data=new Float32Array(TABLE_ROW*4*rows*4);data.set(this.data.done());
  const t=new THREE.DataTexture(data,TABLE_ROW*4,rows,THREE.RGBAFormat,THREE.FloatType);t.minFilter=t.magFilter=THREE.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;
 }
}
class Mesher{
 constructor(groups){this.groups=groups;this.pos=new Grow(Float32Array);this.nor=new Grow(Int8Array);this.uvw=new Grow(Float32Array);this.ids=new Grow(Float32Array);this.idx=new Grow(Uint32Array);this.count=0;}
 // A vertex at track point (x,y,z), normal (nx,ny,nz) in track axes, colour c; (a along, up, yw pavement); run length L
 // and the context A (its group).
 v(x,y,z,nx,ny,nz,c,a,up,L,yw,A){
  this.pos.p3(x,z,-y);this.nor.p3(Math.round(nx*127),Math.round(nz*127),Math.round(-ny*127));this.uvw.p3(a,up,yw);this.ids.p1(this.groups.id(A,c,L));return this.count++;
 }
 tri(a,b,c){this.idx.p3(a,b,c);}
 quad(a,b,c,d){this.idx.p3(a,b,c);this.idx.p3(a,c,d);}
 get triangles(){return this.idx.n/3;}
 // A flat-shaded face from track points (CCW seen from outside); uv: the face's own pattern coordinates per point.
 face(points,c,A,uv){
  const [p0,p1,p2]=points,ax=p1[0]-p0[0],ay=p1[1]-p0[1],az=p1[2]-p0[2],bx=p2[0]-p0[0],by=p2[1]-p0[1],bz=p2[2]-p0[2];
  let nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;const l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;
  const first=this.count;points.forEach((p,i)=>this.v(p[0],p[1],p[2],nx,ny,nz,c,uv?uv[i][0]:p[0],uv?uv[i][1]:p[1],0,0,A));
  for(let i=1;i<points.length-1;i++)this.tri(first,first+i,first+i+1);
 }
 // The same, turned to face `out` (a track direction) whichever way the points run.
 faceOut(points,c,A,uv,out){
  const [p0,p1,p2]=points,ax=p1[0]-p0[0],ay=p1[1]-p0[1],az=p1[2]-p0[2],bx=p2[0]-p0[0],by=p2[1]-p0[1],bz=p2[2]-p0[2];
  if((ay*bz-az*by)*out[0]+(az*bx-ax*bz)*out[1]+(ax*by-ay*bx)*out[2]<0){points=[...points].reverse();if(uv)uv=[...uv].reverse();}
  this.face(points,c,A,uv);
 }
 // A box on the roof: centre (x,y), long axis (ux,uy), half sizes a×b, from z0 to z1 (no bottom).
 box(x,y,ux,uy,a,b,z0,z1,c,A){
  const P=(i,j,z)=>[x+ux*(i?a:-a)-uy*(j?b:-b),y+uy*(i?a:-a)+ux*(j?b:-b),z];
  this.face([P(0,0,z1),P(1,0,z1),P(1,1,z1),P(0,1,z1)],c,A);
  for(const [i0,j0,i1,j1] of [[0,0,1,0],[1,0,1,1],[1,1,0,1],[0,1,0,0]]){const p=P(i0,j0,z0),q=P(i1,j1,z0);this.face([p,q,P(i1,j1,z1),P(i0,j0,z1)],c,A,[[0,0],[Math.hypot(q[0]-p[0],q[1]-p[1]),0],[Math.hypot(q[0]-p[0],q[1]-p[1]),z1-z0],[0,z1-z0]]);}
 }
 // A round tank: n sides, radius r, from z0 to z1, with a low cone for its lid.
 drum(x,y,r,z0,z1,c,A,n=10){
  const ring=Array.from({length:n},(_,i)=>{const t=i/n*Math.PI*2;return [Math.cos(t),Math.sin(t)];});
  for(let i=0;i<n;i++){const [c0,s0]=ring[i],[c1,s1]=ring[(i+1)%n];this.face([[x+c0*r,y+s0*r,z0],[x+c1*r,y+s1*r,z0],[x+c1*r,y+s1*r,z1],[x+c0*r,y+s0*r,z1]],c,A);
   this.face([[x+c0*r*1.04,y+s0*r*1.04,z1],[x+c1*r*1.04,y+s1*r*1.04,z1],[x,y,z1+r*.28]],c,A);}
 }
 geometry(){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(this.pos.done(),3));g.setAttribute('normal',new THREE.BufferAttribute(this.nor.done(),3,true));
  g.setAttribute('cbUVW',new THREE.BufferAttribute(this.uvw.done(),3));g.setAttribute('cbId',new THREE.BufferAttribute(this.ids.done(),1));
  const idx=this.idx.done();g.setIndex(new THREE.BufferAttribute(this.count>65535?idx:Uint16Array.from(idx),1));
  g.computeBoundingSphere();g.computeBoundingBox();return g;
 }
}

// --- The facade shader (MeshStandardMaterial + onBeforeCompile). vFac: along the run (m), height over the building's
// street level (m), the run's length, the pavement at this wall (m over the street level; a slope makes it negative);
// vBld: seed, style*16+part, flags, roof level; vLay: corner pier, bays, shops, the run's seed; vFlo: floor height and
// street storey height. Roof faces carry their own pattern coordinates in vFac.xy.
const FRAG_HEAD=`
varying vec4 vFac;flat varying vec4 vBld;flat varying vec4 vLay;flat varying vec2 vFlo;flat varying vec2 vExt;flat varying vec3 vCol;
uniform float cbNight;
#ifdef CB_SIGNS
uniform sampler2D cbSigns;
#endif
float cbH(vec3 p){p=fract(p*vec3(.1031,.103,.0973));p+=dot(p,p.yxz+33.33);return fract((p.x+p.y)*p.z);}
float cbN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(cbH(vec3(i,7.)),cbH(vec3(i+vec2(1.,0.),7.)),f.x),mix(cbH(vec3(i+vec2(0.,1.),7.)),cbH(vec3(i+vec2(1.,1.),7.)),f.x),f.y);}
// A soft-edged box lo..hi (aa: half its blur).
float cbR(vec2 p,vec2 lo,vec2 hi,float aa){vec2 a=smoothstep(lo-aa,lo+aa,p)*(1.-smoothstep(hi-aa,hi+aa,p));return a.x*a.y;}
// Lines every stp (half width w), gone before they would alias.
float cbL(float x,float stp,float w,float px){float f=abs(fract(x/stp+.5)-.5)*stp;return (1.-smoothstep(w-px*.7,w+px*.7,f))*(1.-smoothstep(stp*.18,stp*.42,px));}
vec3 cbP4(float h,vec3 a,vec3 b,vec3 c,vec3 d){return h<.25?a:h<.5?b:h<.75?c:d;}
// One window or glazed door: q from the opening's centre line (x) and from its floor (y), half width w, sill b, head t,
// frame fw. Its pane: dark glass mirroring the sky, or curtains, a roller blind half down, closed shutters, an air
// conditioner in the corner; lit at night when lit>0. grille: bars in front (a ground floor).
// Inside a shop: shelves of goods under the lights (each item its own colour), dark toward the floor; p: across the
// opening and up from the pavement, top: the opening's head.
vec3 cbInside(vec2 p,float cell,float h,float top,float px){
 #ifdef CB_SIMPLE
 return vec3(.07,.062,.055)*(.55+.65*smoothstep(0.,1.6,p.y));
 #endif
 float shelf=floor(p.y/.42),sy=fract(p.y/.42),item=cbH(vec3(floor(p.x/(.14+.1*h)+shelf*.37),shelf,cell));
 vec3 goods=mix(vec3(.16,.15,.14),cbP4(fract(item*3.7),vec3(.3,.1,.07),vec3(.09,.15,.26),vec3(.36,.31,.1),vec3(.26,.26,.24)),.65)*(.35+.6*fract(item*11.3));
 float rack=step(.3,p.y)*step(p.y,top-.55),fine=1.-smoothstep(.03,.09,px);
 vec3 c=mix(vec3(.045,.04,.036),mix(vec3(.13,.11,.09),goods,fine),rack*step(.14,sy)*step(sy,.82)*step(.22,item)*.85);
 c=mix(c,vec3(.22,.21,.2),rack*(1.-smoothstep(.0,.05,sy))*fine);
 return c*(.55+.65*smoothstep(0.,1.6,p.y));
}
void cbWindow(vec2 q,float w,float b,float t,float fw,float cell,int style,float px,vec3 frameC,vec3 glassC,vec3 shutC,float shutP,float rollP,float acP,float grille,float lit,vec3 lightC,inout vec3 col,inout float glass,inout vec3 glow){
 float aa=px*.7,arch=style==1||style==5?.16*w*(1.-q.x*q.x/(w*w)):0.;
 if(style==5)arch=sqrt(max(0.,w*w-q.x*q.x));
 float o=cbR(q,vec2(-w,b),vec2(w,t+arch),aa),f=cbR(q,vec2(-w-fw,b-fw),vec2(w+fw,t+arch+fw),aa);
 if(b>.3){
  float s=cbR(q,vec2(-w-fw-.06,b-fw-.07),vec2(w+fw+.06,b-fw+.01),aa);col=mix(col,col*1.08+.05,s);
  // Dirt washed down from the sill in streaks, fading toward the floor below.
  #ifndef CB_SIMPLE
  float below=cbR(q,vec2(-w-fw-.04,b-fw-1.6),vec2(w+fw+.04,b-fw-.07),aa)*smoothstep(b-fw-1.6,b-fw-.07,q.y);
  col*=1.-below*(.05+.2*smoothstep(.45,.8,cbN(vec2(q.x*7.+cell*13.,.5))));
  #endif
 }
 col=mix(col,frameC,max(f-o,0.));
 if(o<=0.)return;
 vec2 r=(q-vec2(-w,b))/vec2(2.*w,t+arch-b);
 float h1=fract(cell*7.13),h2=fract(cell*3.71+.2),h3=fract(cell*11.9+.5);
 vec3 pane=glassC*(.55+.9*h2);float g=1.,gl=1.;
 // The reveal: the head and one jamb shade the pane (windows sit in the wall).
 pane*=1.-.45*(1.-smoothstep(0.,.1,t+arch-q.y))-.25*(1.-smoothstep(0.,.07,q.x+w));
 #ifndef CB_SIMPLE
 // Two sashes (a bar down the middle), a transom on tall ones.
 float bars=max(1.-smoothstep(.018,.018+px,abs(q.x)),(t-b)>1.6&&style!=3?1.-smoothstep(.018,.018+px,abs(q.y-(b+(t-b)*.72))):0.);
 #else
 float bars=0.;
 #endif
 if(h1<.3&&style!=3){
  // Curtains drawn to the sides, or across.
  float side=min(r.x,1.-r.x),k=.12+.5*h3;
  float drape=h3>.75?1.:step(side,k*.5);
  vec3 cloth=cbP4(fract(h2*5.),vec3(.78,.76,.7),vec3(.72,.66,.55),vec3(.6,.62,.66),vec3(.7,.6,.6));
  #ifndef CB_SIMPLE
  cloth*=.85+.15*sin(q.x*40.);
  #endif
  pane=mix(pane,cloth*(.75+.25*r.y),drape*.92);g=1.-drape;gl=mix(1.,.75,drape);
 }else if(h1<.3+rollP){
  // A roller blind down to its own height (aluminium or PVC slats).
  float down=step(1.-(.15+.8*h3),r.y);
  vec3 slat=shutC*(1.-.25*cbL(q.y,.05,.008,px));
  pane=mix(pane,slat,down);g=1.-down;gl=1.-down*.85;
 }else if(h1>1.-shutP){
  // Closed shutters (venezianas): two leaves of slats.
  vec3 slat=shutC*(1.-.3*cbL(q.y,.07,.012,px))*(1.-.4*(1.-smoothstep(.0,.02+px,abs(q.x))));
  pane=slat;g=0.;gl=.12;
 }
 #ifndef CB_SIMPLE
 if(h3<acP&&style!=1&&style!=5){
  // A window air conditioner in the lower corner (beige plastic, its grille).
  float side=h2<.5?-1.:1.,ac=cbR(vec2(q.x*side,q.y),vec2(w-.66,b),vec2(w-.04,b+.42),aa);
  vec3 box=vec3(.62,.6,.55)*(1.-.35*cbL(q.y,.045,.007,px)*step(q.x*side,w-.36));
  pane=mix(pane,box,ac);g*=1.-ac;gl*=1.-ac;
 }
 #endif
 pane=mix(pane,frameC,bars);g*=1.-bars;
 if(grille>0.){float gb=cbL(q.x,.12,.011,px)*grille;pane=mix(pane,vec3(.03),gb);g*=1.-gb*.6;}
 col=mix(col,pane,o);glass+=o*g;
 // A lit room: brighter toward its ceiling lamp, the bars and frames dark against it.
 glow+=o*lit*gl*(1.-bars)*lightC*(.18+.34*h2)*(.55+.6*r.y);
}`;

const FRAG_MAIN=`
vec3 cbCol=vCol;float cbGlass=0.,cbMet=0.,cbRough=.88;vec3 cbGlow=vec3(0.);
{
 int code=int(vBld.y+.5),part=code-(code/16)*16,style=code/16,fl=int(vBld.z+.5);
 float seed=vBld.x,along=vFac.x,y=vFac.y;
 float px=max(max(fwidth(along),fwidth(y)),1e-4),aa=px*.7;
 float s1=fract(seed*13.7),s2=fract(seed*29.3),s3=fract(seed*51.9),s4=fract(seed*7.31),s5=fract(seed*91.7),s6=fract(seed*3.77),s7=fract(seed*17.3);
 // Every wall counts its storeys from its own pavement (yw): the street storey (gh), then floors of fh up to the roof H.
 // The shop cells and their sign come first, from interpolated values only (the sign's lookup needs its derivatives).
 float L=vFac.z,yw=vFac.w,H=vBld.w,m=vLay.x,nb=vLay.y,ns=vLay.z,rs=vLay.w,fh=vFlo.x,gh=vFlo.y,hgt=y-yw;
 float span=max(L-2.*m,.01),sTop=yw+gh,sH=gh;
 float su=(along-m)/span*max(ns,1.),k=floor(su),sw=span/max(ns,1.),sx=fract(su)*sw;
 float dh=clamp(sH-.95,2.3,3.1),fTop=min(sH-.08,dh+.95);
 float hk=cbH(vec3(k+.5,7.,rs*31.+1.)),hk2=fract(hk*7.3),hk3=fract(hk*13.1),hk4=fract(hk*29.7);
 float signMask=0.;
 #ifdef CB_SIGNS
 {
  float fz=max(fTop-dh-.1,.2),tw=min(sw*.84,fz*.8*8.),th=tw/8.,cy=dh+.1+fz*.5;
  vec2 uv=vec2((sx-(sw-tw)*.5)/tw,(hgt-(cy-th*.5))/th);
  float cell=floor(hk4*${SIGNS.length}.),col0=mod(cell,${SIGN_COLS}.),row=floor(cell/${SIGN_COLS}.);
  vec2 atlas=vec2((col0+clamp(uv.x,0.,1.))/${SIGN_COLS}.,1.-(row+1.-clamp(uv.y,.0,1.))/${SIGN_ROWS}.);
  // About a third of the fascias carry no name (a plain band), so a name seldom meets its twin down the street.
  signMask=texture2D(cbSigns,atlas).r*step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.)*step(.3,fract(hk*5.3));
 }
 #endif
 // The building's fittings: window frames (white or grey aluminium, black, brown wood), glass, blinds and shutters.
 vec3 frameC=cbP4(s4,vec3(.7,.69,.66),vec3(.45,.46,.46),vec3(.07,.07,.08),vec3(.22,.14,.08));
 vec3 glassC=cbP4(s6,vec3(.035,.042,.05),vec3(.026,.045,.05),vec3(.05,.042,.032),vec3(.04,.045,.065));
 vec3 shutC=cbP4(s7,vec3(.62,.61,.57),vec3(.5,.46,.38),vec3(.36,.37,.37),vec3(.66,.65,.61));
 if(style==1){frameC=vec3(.74,.72,.67);shutC=cbP4(s7,vec3(.1,.25,.16),vec3(.26,.15,.08),vec3(.14,.25,.4),vec3(.4,.1,.08));}
 if(style==5){frameC=vec3(.76,.74,.7);glassC=vec3(.06,.07,.09);}
 if(part==0){
  bool front=(fl&1)!=0,party=(fl&2)!=0,shops=(fl&4)!=0,brick=(fl&8)!=0;
  vec3 wall=cbCol;
  // Paint ages in broad patches and blotches; dirt washes down from the roof edge in streaks; grime and green damp rise
  // from the pavement.
  float patchN=cbN(vec2(along*.09,y*.13)+seed*31.),streak=cbN(vec2(along*2.1+seed*13.,y*.045));
  wall*=.84+.3*patchN;
  #ifndef CB_SIMPLE
  wall*=1.-.12*smoothstep(.62,.9,cbN(vec2(along*.33,y*.27)+seed*7.));
  #endif
  #ifndef CB_SIMPLE
  if(brick){
   float row=floor(hgt/.095),bxp=(along+mod(row,2.)*.1)/.2,fade=1.-smoothstep(.015,.045,px);
   float hl=1.-smoothstep(.006,.006+px,abs(fract(hgt/.095+.5)-.5)*.095),vl=1.-smoothstep(.006,.006+px,abs(fract(bxp+.5)-.5)*.2);
   wall=mix(wall,mix(wall*(.82+.36*cbH(vec3(floor(bxp),row,seed*50.))),vec3(.42,.4,.36),max(hl,vl)),fade);
  }
  #endif
  wall*=1.-.24*smoothstep(.5,.85,streak)*(.2+.8*smoothstep(H-7.,H+.5,y));
  wall*=1.-(.12+.12*s5)*(1.-smoothstep(0.,1.6,hgt));
  #ifndef CB_SIMPLE
  wall=mix(wall,wall*vec3(.78,.84,.76),smoothstep(.6,.9,cbN(vec2(along*.45,y*.35)+seed*2.))*.55*(1.-smoothstep(.3,2.6,hgt)));
  #endif
  vec3 col=wall;float glass=0.;vec3 glow=vec3(0.);
  if(party){
   // A blank party wall: rough render, damp and soot in big stains, the outline of a neighbour long gone.
   float st=cbN(vec2(along*.22,y*.09)+seed*9.);
   col=mix(wall,vec3(dot(wall,vec3(.3333))),.4)*(.78+.28*st)*(1.-.14*smoothstep(.6,.9,cbN(vec2(along*.6,y*.25)+seed*3.)));
  }else{
   float bw=span/max(nb,1.),u=(along-m)/span*nb,bay=floor(u),bu=fract(u),bx=(bu-.5)*bw;
   float inB=nb>.5?step(0.,u)*step(u,nb):0.;
   float fy=(y-sTop)/fh,fi=floor(fy),fv=(fy-fi)*fh,fb=sTop+fi*fh;
   float inF=step(0.,fi)*step(fb+fh,H+.3);
   // Balcony bays (vExt.x: one bit per bay, set by the geometry that builds their slabs and railings).
   float balc=bay>=0.&&bay<23.?mod(floor(vExt.x/exp2(bay)),2.):0.;
   float occ=.12+.38*s3;
   vec3 lightC=mix(vec3(1.,.62,.32),vec3(.76,.84,1.),step(.8,fract(seed*41.3)));
   float lit=step(cbH(vec3(bay+.5,fi+.5,rs*91.+3.)),occ*(.4+1.2*cbH(vec3(floor(bay/3.),floor(fi/2.),rs*17.))));
   // Offices at night: most floors dark, a few stretches of a floor still lit (the cleaners, a late meeting).
   if(style==3)lit=step(cbH(vec3(floor(along/(5.+4.*s2)),fi+.5,rs*7.+1.)),.12+.18*s3);
   float shutP=style==0?.22:style==1?.35:style==2?.08:0.,rollP=style==0||style==2||style==6?.22+.2*s2:.0,acP=style==2||style==6?.1+.1*s1:style==3?.04:style==0?.06:0.;
   float fill=style==3?(s4<.35?.85:.5):style==4?.1:style==5?.12:style==2?.34:.27;
   if(y>=H){
    // Above the roof slab: the parapet, a pale cornice band at the slab and its shadow below.
    col=mix(col,col*1.12+.03,cbR(vec2(0.,y),vec2(-1.,H-.02),vec2(1.,H+.22),aa));col*=1.-.3*cbR(vec2(0.,y),vec2(-1.,H-.16),vec2(1.,H-.03),aa);
    if(style==1)col=mix(col,frameC,cbR(vec2(0.,y),vec2(-1.,H+.5),vec2(1.,H+.64),aa)+.6*cbR(vec2(0.,y),vec2(-1.,H+1.05),vec2(1.,H+2.5),aa)*(1.-cbR(vec2(fract(u),y),vec2(.15,H+.75),vec2(.85,H+1.),aa)));
   }else if(y>=sTop){
    if(style==1){
     // Sobrados: tall framed openings (a porta-janela behind an iron balcony, or a sash window), a cornice at every floor.
     float ww=min(.62,bw*.3),wb=s2<.55?.12:.85,wt=fh-.75;
     if(inF*inB>0.){
      cbWindow(vec2(bx,fv),ww,wb,wt,.15,cbH(vec3(bay,fi,rs*13.)),1,px,frameC,glassC,shutC,shutP,0.,0.,0.,lit,lightC,col,glass,glow);
      if(wb<.3){float rail=cbR(vec2(bx,fv),vec2(-ww-.18,.1),vec2(ww+.18,1.05),aa);float iron=max(cbL(bx,.11,.01,px),cbR(vec2(bx,fv),vec2(-9.,.98),vec2(9.,1.05),aa));col=mix(col,vec3(.03),rail*iron);
       col=mix(col,frameC*.95,cbR(vec2(bx,fv),vec2(-ww-.25,0.),vec2(ww+.25,.1),aa));col*=1.-.3*cbR(vec2(bx,fv),vec2(-ww-.25,-.12),vec2(ww+.25,0.),aa);}
     }
     col=mix(col,frameC*.92,cbR(vec2(0.,fv),vec2(-1.,fh-.3),vec2(1.,fh-.08),aa)*step(fb+fh,H+.3));col*=1.-.25*cbR(vec2(0.,fv),vec2(-1.,fh-.38),vec2(1.,fh-.3),aa);
    }else if(style==2){
     // Apartment towers: pale slab edges at every floor on many, columns between the bays on some, windows with
     // roller blinds (a small bathroom window in some bays), split air conditioners hung under the sills, and the
     // balcony bays: a glazed door in the shade of the balcony.
     if(s5<.45)col=mix(col,col*1.12+.04,cbR(vec2(0.,fv),vec2(-1.,-.01),vec2(1.,.17),aa)*step(0.,fi));
     if(s4>.6)col=mix(col,col*1.1+.02,(1.-smoothstep(.2,.2+px,min(bu,1.-bu)*bw))*inB*step(0.,fi));
     // The 1970s towers: a band of dark ceramic tiles (pastilhas) at window height on every floor, between pale slabs.
     if(s1<.35)col=mix(col,cbP4(s2,vec3(.3,.21,.15),vec3(.23,.28,.32),vec3(.38,.19,.11),vec3(.21,.21,.22))*(.85+.3*patchN),cbR(vec2(0.,fv),vec2(-1.,.72),vec2(1.,2.48),aa)*inF*step(m,along)*step(along,L-m));
     if(inF*inB>0.){
      if(balc>.5){
       float hw=bw*.5-.08;
       col=mix(col,col*.6,cbR(vec2(bx,fv),vec2(-hw,-.05),vec2(hw,fh-.15),aa));
       cbWindow(vec2(bx,fv),bw*.34,.06,2.3,.04,cbH(vec3(bay,fi,rs*13.)),2,px,frameC,glassC,shutC,0.,rollP,0.,0.,lit,lightC,col,glass,glow);
       #ifdef CB_SIMPLE
       float rail=cbR(vec2(bx,fv),vec2(-hw,0.),vec2(hw,1.1),aa);col=mix(col,s7<.4?vec3(.16,.21,.21):col*1.1,rail);
       #endif
      }else{
       bool tiny=cbH(vec3(bay+.5,2.,rs*5.))<.22;
       float ww=tiny?.32:bw*(.3+.14*s1),wb=tiny?1.45:.9+.15*s2,wt=tiny?2.15:2.25+.1*s3;
       cbWindow(vec2(bx,fv),ww,wb,wt,.05,cbH(vec3(bay,fi,rs*13.)),2,px,frameC,glassC,shutC,shutP,tiny?0.:rollP,tiny?0.:acP,0.,lit*(tiny?.3:1.),lightC,col,glass,glow);
       #ifndef CB_SIMPLE
       // A split unit's condenser under some windows: a pale box with its round fan.
       float sp=step(cbH(vec3(bay,fi,rs*3.+.7)),s3>.45?.18:.05)*(tiny?0.:1.);
       if(sp>0.){vec2 c=vec2(bx-(ww-.45)*(fract(bay*.5)>.25?1.:-1.),fv-.42);float box=cbR(c,vec2(-.42,-.27),vec2(.42,.27),aa);col=mix(col,vec3(.6,.6,.58)*(1.-.5*(1.-smoothstep(.17,.17+px,length(c-vec2(-.1,0.))))*step(length(c-vec2(-.1,0.)),.2)),box);col*=1.-.25*cbR(c,vec2(-.4,-.45),vec2(.44,-.27),aa);}
       #endif
      }
     }
    }else if(style==3){
     // Offices: a curtain wall (glass all over, mullions and dark spandrels) or ribbon windows between cladding bands.
     if(s4<.35){
      float o=inF;vec3 pane=glassC*(.8+.5*cbH(vec3(bay,fi,rs)))*(1.+.4*s1);
      float spandrel=cbR(vec2(0.,fv),vec2(-1.,-.01),vec2(1.,.95),aa);pane=mix(pane,glassC*.7+vec3(.012),spandrel);
      float mull=max(cbL(along,bw*.5,.03,px),cbL(fv,fh,.04,px));pane=mix(pane,frameC*.7,mull);
      col=mix(col,pane,o);glass+=o*(1.-mull);glow+=o*(1.-spandrel)*lit*lightC*.4;
     }else if(inF>0.){
      float wb=.8+.15*s2,wt=fh-.3,o=cbR(vec2(0.,fv),vec2(-1.,wb),vec2(1.,wt),aa)*step(m,along)*step(along,L-m);
      vec3 pane=glassC*(.7+.6*cbH(vec3(floor(along/1.25),fi,rs)));
      float rb=cbH(vec3(floor(along/2.5),fi,rs*3.));pane=mix(pane,shutC*.9,step(.82,rb)*step(wt-(wt-wb)*.6,fv));
      float mull=cbL(along,1.25,.025,px);pane=mix(pane,frameC*.8,mull);
      col=mix(col,pane,o);glass+=o*(1.-mull);glow+=o*lit*lightC*.38;
      col*=1.-.2*cbR(vec2(0.,fv),vec2(-1.,wt),vec2(1.,wt+.12),aa);
     }
    }else if(inF*inB>0.){
     // Houses and the low shop blocks: framed windows, shutters, blinds, the odd air conditioner.
     float ww=bw*(.22+.1*s1);
     cbWindow(vec2(bx,fv),ww,.95+.12*s2,2.15+.15*s3,.07,cbH(vec3(bay,fi,rs*13.)),style,px,frameC,glassC,shutC,shutP,rollP,acP,0.,lit,lightC,col,glass,glow);
    }
   }else if(hgt>0.){
    // The street storey.
    float grille=style==0||style==2||style==6?1.:0.;
    vec3 clad=cbP4(s2,col*1.04,vec3(.22,.21,.2),vec3(.42,.38,.33),vec3(.5,.48,.45));
    if(front&&shops&&ns>.5&&style!=1&&style!=4&&style!=5){
     // A row of shops: a pilaster each side, the steel door (porta de aço) down, half up or rolled away from the
     // shop window, its fascia with the name over it.
     float inS=step(0.,su)*step(su,max(ns,1.)),pil=.2+.12*s5;
     col=mix(col,clad*(1.-.2*max(cbL(hgt,.6,.006,px),cbL(sx,.4,.006,px))*step(s2,.75)),inS*(1.-step(dh+.1,hgt))*.85);
     col*=1.-.18*inS*cbR(vec2(sx,hgt),vec2(-1.,0.),vec2(99.,.35),aa);
     float o=cbR(vec2(sx,hgt),vec2(pil,0.),vec2(sw-pil,dh),aa)*inS;
     if(o>0.){
      float shutLow=hk<.26?0.:hk<.5?dh*(.42+.38*hk2):dh+1.,isShut=step(shutLow,hgt);
      vec3 steel=cbP4(hk3,vec3(.36,.37,.37),vec3(.46,.46,.44),vec3(.12,.2,.15),vec3(.15,.19,.27));
      vec3 shut=steel*(1.-.32*cbL(hgt,.1,.014,px))*(.8+.3*cbN(vec2(sx*.8,hgt*.6)+k*3.));
      #ifndef CB_SIMPLE
      // Graffiti on some closed doors.
      if(hk4<.35){float gn=cbN(vec2(sx*1.4,hgt*1.7)+k*7.);shut=mix(shut,cbP4(fract(gn*7.+hk),vec3(.04),vec3(.45,.07,.07),vec3(.07,.18,.42),vec3(.55,.4,.04)),smoothstep(.6,.66,gn)*step(hgt,2.2));}
      #endif
      vec3 inside=cbInside(vec2(sx,hgt),k+hk*9.,hk3,dh,px);
      float alu=max(max(cbL(sx-pil,sw-2.*pil,.035,px),1.-smoothstep(.03,.03+px,abs(hgt-(dh-.45)))),1.-smoothstep(.03,.03+px,abs(sx-pil-(sw-2.*pil)*(.3+.4*hk2))));
      vec3 shop=mix(inside,vec3(.5,.51,.51),alu);
      shop=mix(shop,steel*.8,step(dh-.22,hgt)*(1.-isShut));
      col=mix(col,mix(shop,shut,isShut),o);glass+=o*(1.-isShut)*(1.-alu)*.85;
      glow+=o*(1.-isShut)*(1.-alu)*step(.3,hk2)*(inside*1.6+vec3(.09,.08,.06));
     }
     float fz=cbR(vec2(sx,hgt),vec2(.06,dh+.1),vec2(sw-.06,fTop),aa)*inS;
     if(fz>0.){
      vec3 bg=hk2<.5?cbP4(hk3,vec3(.5,.05,.04),vec3(.04,.14,.38),vec3(.7,.5,.04),vec3(.04,.25,.1)):cbP4(hk3,vec3(.7,.69,.66),vec3(.05,.05,.06),vec3(.62,.25,.03),vec3(.3,.04,.21));
      vec3 ink=dot(bg,vec3(.3,.59,.11))>.3?vec3(.03,.03,.04):vec3(.85,.83,.79);
      col=mix(col,mix(bg,ink,signMask),fz);col*=1.-.35*fz*(1.-smoothstep(0.,.05,hgt-dh-.1));
      glow+=fz*step(.35,hk3)*(bg*.18+ink*signMask*.4);
     }
    }else if(style==1){
     // Sobrado ground floor: a tall door in every bay (open onto a shop, or shut: panelled wood, a steel door).
     float ww=min(.7,bw*.33),top=min(sH-.7,3.1),o=cbR(vec2(bx,hgt),vec2(-ww,0.),vec2(ww,top+.12*(1.-bx*bx/(ww*ww))),aa)*inB;
     float hd=cbH(vec3(bay,9.,rs*5.));
     if(front&&o>0.){
      col=mix(col,frameC,cbR(vec2(bx,hgt),vec2(-ww-.16,0.),vec2(ww+.16,top+.3),aa)-o);
      vec3 door=hd<.45?cbInside(vec2(bx+ww,hgt),bay+rs*7.,hd,top,px):hd<.8?shutC*(1.-.3*max(cbL(bx,ww,.03,px),cbL(hgt,.9,.03,px))):vec3(.34,.35,.34)*(1.-.3*cbL(hgt,.1,.014,px));
      col=mix(col,door,o);glass+=o*step(hd,.45)*.5;glow+=o*step(hd,.45)*(door*2.2+vec3(.2,.15,.08));
     }else if(sH>2.4&&inB>0.){
      cbWindow(vec2(bx,hgt),min(.6,bw*.28),1.,min(sH-.7,2.6),.15,cbH(vec3(bay,0.,rs*13.)),1,px,frameC,glassC,shutC,.5,0.,0.,1.,lit,lightC,col,glass,glow);
     }
     col=mix(col,frameC*.9,cbR(vec2(0.,hgt),vec2(-1.,sH-.35),vec2(1.,sH-.1),aa));
     col=mix(col,clad*.8,cbR(vec2(0.,hgt),vec2(-1.,-1.),vec2(1.,.5),aa)*(1.-o));
    }else if(front&&(style==2||style==3)){
     // A tower's lobby on the street: stone cladding, the glazed entrance in one bay, the garage door in another.
     col=mix(col,clad*(1.-.25*max(cbL(along,1.2,.008,px),cbL(hgt,.6,.008,px))),.9);
     float lb=floor(nb*.5),gb=nb>2.5?(cbH(vec3(rs,3.,1.))<.5?0.:nb-1.):-1.;
     if(bay==lb&&inB>0.){float o=cbR(vec2(bx,hgt),vec2(-min(1.4,bw*.45),0.),vec2(min(1.4,bw*.45),min(sH-.4,3.)),aa);
      vec3 hall=vec3(.06,.055,.05)*(1.+2.*smoothstep(.4,.8,cbN(vec2(bx,hgt)*2.)));
      col=mix(col,mix(hall,frameC*.7,max(cbL(bx,.9,.02,px),cbL(hgt,2.3,.02,px))),o);glass+=o*.8;glow+=o*vec3(1.,.85,.6)*.35;}
     else if(bay==gb&&inB>0.){float o=cbR(vec2(bx,hgt),vec2(-min(1.5,bw*.45),0.),vec2(min(1.5,bw*.45),min(sH-.4,2.4)),aa);col=mix(col,vec3(.1)*(1.-.4*cbL(bx,.12,.012,px)),o);}
     else if(inB>0.&&sH>2.4)cbWindow(vec2(bx,hgt),bw*.28,1.,min(sH-.6,2.3),.05,cbH(vec3(bay,0.,rs*13.)),2,px,frameC,glassC,shutC,0.,.2,0.,1.,lit,lightC,col,glass,glow);
    }else if(style==2&&s6>.62&&inB>0.){
     // Pilotis: the tower stands on columns over its garage, cars in the shade between them.
     float colm=1.-smoothstep(.3,.3+px,min(bu,1.-bu)*bw),deep=cbR(vec2(0.,hgt),vec2(-1.,0.),vec2(1.,sH-.45),aa)*(1.-colm);
     vec3 shade=vec3(.05,.05,.048)+vec3(.04)*smoothstep(.55,.8,cbN(vec2(along*1.2,hgt*2.)+seed));
     col=mix(col,shade,deep);col=mix(col,col*1.05,colm);
    }else if(front&&style==0){
     // A house on the street: its door, a garage door on some, windows behind bars.
     float hd=cbH(vec3(rs*13.,1.,2.)),db=floor(hd*nb),gb=nb>1.5&&s1<.6?mod(db+1.,nb):-1.;
     if(bay==gb&&inB>0.&&sH>2.4){float gw=min(bw*.46,1.45),o=cbR(vec2(bx,hgt),vec2(-gw,0.),vec2(gw,2.25),aa);
      vec3 gate=s3<.5?shutC*(1.-.3*cbL(hgt,.1,.012,px)):mix(vec3(.035),vec3(.045,.04,.035),cbL(bx,.1,.015,px));
      col=mix(col,frameC,cbR(vec2(bx,hgt),vec2(-gw-.06,0.),vec2(gw+.06,2.31),aa)-o);col=mix(col,gate,o);}
     else if(bay==db&&inB>0.){float o=cbR(vec2(bx,hgt),vec2(-.46,0.),vec2(.46,2.12),aa);
      vec3 door=cbP4(s7,vec3(.22,.13,.07),vec3(.3,.19,.1),vec3(.6,.59,.56),vec3(.08,.17,.12));
      col=mix(col,frameC,cbR(vec2(bx,hgt),vec2(-.53,0.),vec2(.53,2.19),aa)-o);col=mix(col,door*(1.-.18*cbR(vec2(abs(bx),hgt),vec2(.1,.3),vec2(.34,1.85),aa)),o);}
     else if(inB>0.&&sH>2.3)cbWindow(vec2(bx,hgt),bw*(.22+.1*s1),.95+.12*s2,min(sH-.5,2.15+.15*s3),.07,cbH(vec3(bay,0.,rs*13.)),0,px,frameC,glassC,shutC,shutP,rollP,acP,1.,lit,lightC,col,glass,glow);
    }else if(style==4){
     // Sheds: metal sheet over a block plinth, a band of translucent panels high up, wide roll-up doors on the street.
     if(s4<.55&&hgt>1.2)col*=1.-.18*cbL(along,.2,.035,px);
     if(hgt<1.2)col=mix(col,vec3(.42,.41,.38)*(.85+.2*patchN),.6);
     float band=cbR(vec2(0.,y),vec2(-1.,H-2.1),vec2(1.,H-1.1),aa)*inB*(1.-cbL(along,1.1,.04,px));
     col=mix(col,vec3(.46,.5,.52),band*.8);glow+=band*vec3(.9,.95,1.)*.06;
     if(front&&ns>.5){float dw=min(sw*.36,2.6),o=cbR(vec2(sx-sw*.5,hgt),vec2(-dw,0.),vec2(dw,min(sH-1.4,4.6)),aa);col=mix(col,vec3(.38,.39,.39)*(1.-.3*cbL(hgt,.12,.015,px)),o);}
    }else if(style==5){
     // A church: pilasters, tall round-headed windows, the great door in the middle of the front.
     col=mix(col,frameC,(1.-step(m,along)*step(along,L-m))*.7);
     float db=floor(nb*.5);
     if(front&&bay==db&&inB>0.){float dw=min(1.1,bw*.35),dt=min(sH-1.5,4.2);float o=cbR(vec2(bx,hgt),vec2(-dw,0.),vec2(dw,dt+sqrt(max(0.,dw*dw-bx*bx))),aa);col=mix(col,frameC,cbR(vec2(bx,hgt),vec2(-dw-.25,0.),vec2(dw+.25,dt+.25+sqrt(max(0.,(dw+.25)*(dw+.25)-bx*bx))),aa)-o);col=mix(col,vec3(.15,.08,.04)*(1.-.3*cbL(bx,dw,.03,px)),o);}
     else if(inB>0.)cbWindow(vec2(bx,hgt),min(.55,bw*.2),2.2,min(sH-2.,6.),.12,cbH(vec3(bay,0.,rs)),5,px,frameC,glassC,shutC,0.,0.,0.,0.,.4,vec3(1.,.7,.35),col,glass,glow);
    }else if(inB>0.&&sH>2.3){
     cbWindow(vec2(bx,hgt),bw*(.22+.1*s1),1.,min(sH-.5,2.2),.06,cbH(vec3(bay,0.,rs*13.)),style,px,frameC,glassC,shutC,shutP,rollP,acP,grille,lit,lightC,col,glass,glow);
    }
    // A darker plinth band along the pavement on most buildings.
    col*=1.-.16*step(s6,.7)*cbR(vec2(0.,hgt),vec2(-1.,-1.),vec2(1.,.45+.4*s1),aa);
   }
   // The corner piers of a sobrado: white pilasters.
   if(style==1)col=mix(col,frameC,(1.-step(m*.8,along)*step(along,L-m*.8))*.85);
   // Far off, the windows become their average (a floor a few pixels high would shimmer).
   float det=smoothstep(2.2,5.5,min(min(bw,fh),2.6)/px),inZ=step(sTop,y)*step(y,H)*inB;
   vec3 far=mix(wall,glassC*1.6+vec3(.01),fill*inZ);
   col=mix(far,col,det);glass=mix(fill*inZ*.7,glass,det);
   float detN=smoothstep(.6,1.8,min(min(bw,fh),2.6)/px);
   glow=mix(fill*inZ*occ*.12*lightC,glow,detN);
  }
  cbCol=col;cbGlass=clamp(glass,0.,1.);cbGlow=glow;cbRough=.86;
 }else if(part==9){
  // A balcony's slab: painted concrete, a drip line under its edge.
  cbCol*=(.92+.14*cbN(vFac.xy*.5+seed*5.))*(1.-.25*cbR(vec2(0.,y),vec2(-1.,-.2),vec2(1.,.03),aa*.5));cbRough=.85;
 }else if(part==10){
  // A balcony's railing: laminated glass on aluminium posts, iron bars, or a solid parapet; vFac: along it, up from the slab.
  float top=1.-smoothstep(.04,.04+px,1.1-y);
  if(s7<.4){vec3 g=vec3(.12,.16,.16)*(1.+.3*cbN(vFac.xy*.3+seed));float post=cbL(along,1.3,.025,px);cbCol=mix(mix(g,frameC,post),frameC,top);cbGlass=(1.-post)*(1.-top)*.8;}
  else if(s7<.75){float bar=max(cbL(along,.11,.012,px),max(top,1.-smoothstep(.03,.03+px,y-.1)));cbCol=mix(cbCol*.4,mix(frameC,vec3(.05),step(.5,fract(seed*5.1))),bar);}
  else{cbCol*=1.06*(.9+.15*cbN(vFac.xy*.4+seed));cbCol=mix(cbCol,cbCol*1.15+.03,top);}
  cbRough=.8;
 }else if(part==1){
  // Flat roofs: concrete or a membrane, water stains where it ponds.
  vec2 w=vFac.xy;float n=cbN(w*.3+seed*20.),n2=cbN(w*1.6);
  cbCol*=(.82+.26*n)*(1.-.14*smoothstep(.62,.86,n2));cbRough=.93;
 }else if(part==2){cbCol*=1.06;cbRough=.9;}
 else if(part==3){
  // Clay tiles: rows down the slope, the round of each tile, odd ones paler or darker, moss and soot in patches.
  float t=vFac.x/.21,r=vFac.y/.38,fade=1.-smoothstep(.025,.08,px);
  float tone=.8+.36*cbH(vec3(floor(t),floor(r),seed*40.)),barrel=.5+.5*cos(t*6.2832);
  vec3 tc=cbCol*mix(1.,tone*(.74+.36*barrel)*(1.-.4*cbL(vFac.y,.38,.025,px)),fade);
  float n=cbN(vFac.xy*.45+seed*13.);
  tc=mix(tc,tc*vec3(.5,.55,.45),smoothstep(.5,.85,n)*(.3+.5*s2));
  cbCol=tc;cbRough=.74;
 }else if(part==4){
  // Corrugated metal: ribs down the slope, sheet laps, rust on some old roofs.
  cbCol*=(1.-.14*cbL(vFac.x,.2,.035,px))*(1.-.1*cbL(vFac.y,2.4,.03,px))*(.9+.16*cbN(vFac.xy*.2+seed*3.));
  if(s3<.35)cbCol=mix(cbCol,vec3(.3,.13,.06),smoothstep(.55,.9,cbN(vFac.xy*.25+seed*7.))*.7);
  cbRough=.5;cbMet=.3;
 }else if(part==5){cbCol*=.88+.18*cbN(vFac.xy*1.3+seed*10.);cbRough=.75;}
 else if(part==6){
  // Awnings: canvas, striped on some.
  if((fl&16)!=0)cbCol=mix(cbCol,vec3(.7,.69,.64),step(.5,fract(vFac.x/.6)));
  cbCol*=.86+.14*cbN(vFac.xy*1.5+seed);cbRough=.82;
 }else if(part==7){cbCol*=.7;}
 else if(part==8){cbCol*=.82;}
}
diffuseColor.rgb=cbCol;`;

// The shop names, two columns of 512×64 cells: white on black (the shader reads the red channel as ink).
function signAtlas(){
 const map=canvasTexture((ctx,w,h)=>{
  ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
  const cw=w/SIGN_COLS,ch=h/SIGN_ROWS;
  SIGNS.forEach((name,i)=>{
   const x=(i%SIGN_COLS)*cw+cw/2,y=Math.floor(i/SIGN_COLS)*ch+ch/2;let px=40;
   ctx.font=`900 ${px}px "Arial Black","Arial Bold",Arial,sans-serif`;const tw=ctx.measureText(name).width;
   if(tw>cw*.92){px=Math.max(18,px*cw*.92/tw);ctx.font=`900 ${px}px "Arial Black","Arial Bold",Arial,sans-serif`;}
   ctx.fillText(name,x,y+2);
  });
 },1024,1024);
 map.colorSpace=THREE.NoColorSpace;return map;
}

function facadeMaterial({simple,signs}){
 const material=new THREE.MeshStandardMaterial({name:'Predios_cidade_fachadas',roughness:.88,metalness:0});
 const night={value:0},table={value:null},uniforms={cbNight:night,cbSigns:{value:signs},cbTable:table};
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
uniform highp sampler2D cbTable;attribute vec3 cbUVW;attribute float cbId;
varying vec4 vFac;flat varying vec4 vBld;flat varying vec4 vLay;flat varying vec2 vFlo;flat varying vec2 vExt;flat varying vec3 vCol;`).replace('#include <begin_vertex>',`#include <begin_vertex>
{
 int id=int(cbId+.5);ivec2 c=ivec2((id%${TABLE_ROW})*4,id/${TABLE_ROW});
 vBld=texelFetch(cbTable,c,0);vLay=texelFetch(cbTable,c+ivec2(1,0),0);vec4 t2=texelFetch(cbTable,c+ivec2(2,0),0);vCol=texelFetch(cbTable,c+ivec2(3,0),0).rgb;
 vFlo=t2.xy;vExt=vec2(t2.z,0.);vFac=vec4(cbUVW.xy,t2.w,cbUVW.z);
}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+FRAG_HEAD)
   .replace('#include <color_fragment>','#include <color_fragment>\n'+FRAG_MAIN)
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(cbRough,.07,cbGlass);')
   .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=max(cbMet,cbGlass*.15);')
   .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=cbGlow*cbNight;');
 };
 material.defines={...(simple?{CB_SIMPLE:''}:{}),...(signs?{CB_SIGNS:''}:{})};
 material.customProgramCacheKey=()=>'city-buildings-v1'+(simple?'-simple':'')+(signs?'-signs':'');
 return {material,night,table};
}

export function createCityBuildings(data,{mobile=false,lean=false,ground=null,map=null}={}){
 const root=new THREE.Group();root.name='Predios_cidade';
 const table=data.scenery?.city?.buildings;
 const stats={buildings:0,balconies:0,walls:0,runs:0,frontRuns:0,partyWalls:0,shops:0,awnings:0,roofs:0,roofKinds:{flat:0,hip:0,gable:0,metal:0,canopy:0},props:0,styles:{},drawCalls:0,triangles:0,vertices:0};
 if(!table?.items?.length)return {root,stats};
 const simple=mobile||lean;
 const cols=Object.fromEntries(table.columns.map((k,i)=>[k,i]));
 // The terrain under a point (the drawn ground; the track file's grid where the fitted one has none).
 const T=data.terrain;
 const terrainAt=(x,y)=>{const fx=Math.max(0,Math.min(T.nx-1.001,(x-T.x0)/T.step)),fy=Math.max(0,Math.min(T.ny-1.001,(y-T.y0)/T.step)),i=Math.floor(fx),j=Math.floor(fy),u=fx-i,v=fy-j,k=j*T.nx+i;return (T.z[k]*(1-u)+T.z[k+1]*u)*(1-v)+(T.z[k+T.nx]*(1-u)+T.z[k+T.nx+1]*u)*v;};
 const groundAt=(x,y)=>{const g=ground?.(x,y);return Number.isFinite(g)?g:terrainAt(x,y);};

 // --- Footprints, and a grid to find a building at a point (party walls).
 const all=[];
 for(const item of table.items){
  const ring=ringOf(item[cols.ring]);if(ring.length<3)continue;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,cx=0,cy=0;
  for(const [x,y] of ring){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);cx+=x;cy+=y;}
  all.push({ring,h:item[cols.h],kind:item[cols.kind],type:item[cols.type]||'',x0,y0,x1,y1,cx:cx/ring.length,cy:cy/ring.length,area:ringArea(ring)});
 }
 const CELL=24,grid=new Map(),cellKey=(i,j)=>i*7919+j;
 all.forEach((b,k)=>{for(let i=Math.floor(b.x0/CELL);i<=Math.floor(b.x1/CELL);i++)for(let j=Math.floor(b.y0/CELL);j<=Math.floor(b.y1/CELL);j++){const key=cellKey(i,j);if(!grid.has(key))grid.set(key,[]);grid.get(key).push(k);}});
 const buildingAt=(x,y,except)=>{for(const k of grid.get(cellKey(Math.floor(x/CELL),Math.floor(y/CELL)))??[]){const b=all[k];if(k!==except&&x>=b.x0&&x<=b.x1&&y>=b.y0&&y<=b.y1&&insideRing(b.ring,x,y))return k;}return -1;};
 // The main streets (shops along them, also off the Centro).
 const MAIN=new Set(['primary','secondary','tertiary','trunk','living_street','pedestrian']),streetGrid=new Map(),SG=30;
 for(const s of data.scenery.city.streets??[]){if(!MAIN.has(s.kind))continue;const p=s.points;for(let i=0;i+1<p.length;i++){const key=cellKey(Math.floor(p[i][0]/SG),Math.floor(p[i][1]/SG));if(!streetGrid.has(key))streetGrid.set(key,[]);streetGrid.get(key).push([p[i][0],p[i][1],p[i+1][0],p[i+1][1]]);}}
 const mainStreet=(x,y)=>{let best=Infinity;const i0=Math.floor(x/SG),j0=Math.floor(y/SG);for(let i=i0-1;i<=i0+1;i++)for(let j=j0-1;j<=j0+1;j++)for(const [ax,ay,bx,by] of streetGrid.get(cellKey(i,j))??[]){const dx=bx-ax,dy=by-ay;let u=((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1e-9);u=u<0?0:u>1?1:u;best=Math.min(best,Math.hypot(x-ax-u*dx,y-ay-u*dy));}return best;};
 // Faces a street: the pavement, a road, a square or a cycleway just outside the wall.
 const street=(x,y)=>{if(!map)return false;const d=map.at(x,y);return d.sidewalk<.5||d.road<.5||d.plaza<.5||d.cycleway<.5;};
 // The old centre round the Mercado Público and the Alfândega (and toward Praça XV): two-storey sobrados.
 const marks=data.scenery.landmarks??[],mercado=marks.find(m=>m.kind==='mercado_publico');
 const colonialAt=(x,y)=>mercado?(x>mercado.x-135&&x<mercado.x+200&&y>mercado.y-85&&y<mercado.y+175):false;

 // Where the landscape can plant a tree (landscape.js: woods and scrub in the land cover, and the trees mapped one by one),
 // on a 4 m grid grown by a cell: only there do the buildings ask for trees to be cleared.
 const cover=data.scenery.cover,treeCells=new Set();
 if(cover){
  const mark=(i,j)=>{for(let di=-2;di<=2;di++)for(let dj=-2;dj<=2;dj++)treeCells.add((i+di)*100003+j+dj);};
  for(let j=0;j<cover.ny;j++)for(let i=0;i<cover.nx;i++){const c=cover.classes[j*cover.nx+i];if(c==='1'||c==='2')mark(i,j);}
  for(const [x,y] of data.scenery.trees?.items??[])mark(Math.round((x-cover.x0)/cover.step),Math.round((y-cover.y0)/cover.step));
 }
 const treesNear=(x,y)=>!cover||treeCells.has(Math.round((x-cover.x0)/cover.step)*100003+Math.round((y-cover.y0)/cover.step));
 // --- What each building is: its style, floors, colours, roof.
 const list=[];
 for(const [index,b] of all.entries()){
  const r=random(Math.floor(b.cx*73.1+b.cy*991.7)^0x5bd1e995),box=orientedBox(b.ring);if(!box)continue;
  const island=b.cx>0,core=island&&b.cy<330,beira=island&&b.cy>=430,near=mainStreet(b.cx,b.cy);
  const t=b.type,office=/^(office|commercial|bank|courthouse|public|clinic|university|school|hotel)$/.test(t),shop=/^(retail|commercial|restaurant|bank)$/.test(t);
  let style;
  if(t==='church'||t==='chapel')style=CHURCH;
  else if(b.kind==='galpao'||t==='warehouse'||t==='storage_tank'||t==='industrial'||t==='garages'||t==='garage')style=SHED;
  else if(b.kind==='predio')style=office||(t===''||t==='yes')&&r()<(core?.42:beira?.08:.14)?OFFICE:TOWER;
  else if(colonialAt(b.cx,b.cy)&&b.h>4.5&&b.h<15)style=COLONIAL;
  else if(shop||core&&b.h>5.5&&r()<.75||near<22&&r()<.55)style=b.h>=9.5&&!shop?TOWER:SHOPS;
  else style=b.h>=8.5?TOWER:HOUSE;
  const g=b.ring.map(([x,y])=>groundAt(x,y));g.push(groundAt(b.cx,b.cy));
  const gmin=Math.min(...g),gmean=g.reduce((s,v)=>s+v,0)/g.length;
  // Heights count from the mean ground under the footprint; each wall starts its storeys from its own pavement.
  const zr=gmean,zb=gmin-.2,fill=b.area/(4*box.a*box.b);
  // Roof: hipped tiles on the small rectangular houses, gabled metal on the plain sheds, flat behind a parapet otherwise.
  const canopy=t==='roof'||t==='carport';
  let roof='flat',pitch=0;
  if(canopy)roof='canopy';
  else if(style===CHURCH)roof='gable';
  else if((style===HOUSE||style===SHOPS&&b.h<6.5&&!core)&&fill>.8&&b.area<480&&b.h<9&&r()<.82)roof=fill>.9&&r()<.3?'gable':'hip';
  else if(style===COLONIAL&&fill>.75&&r()<.55)roof='hip';
  else if(style===SHED&&t!=='storage_tank')roof=fill>.85&&r()<.75?'gable':'metal';
  if(roof==='hip'||roof==='gable')pitch=style===SHED?.2+r()*.08:style===CHURCH?.62:.4+r()*.14;
  if(style===SHED&&roof==='gable')roof='shed';
  const rise=roof==='flat'||roof==='metal'||roof==='canopy'?0:(roof==='shed'?box.b:box.b+.4)*Math.tan(pitch);
  // Walls up to the eaves (the measured height is the 75th percentile of the roof, near the top of a pitched one).
  const par=roof==='flat'?(style===TOWER?1.05+r()*.35:style===OFFICE?.9+r()*.35:style===COLONIAL?1.1+r()*.5:style===HOUSE?.25+r()*.45:.55+r()*.55):roof==='metal'?.35+r()*.6:0;
  const H=Math.max(2.5,b.h-rise*.6-par*.5);
  let fh,gh;
  if(style===HOUSE){fh=2.8+r()*.3;gh=fh;}
  else if(style===COLONIAL){fh=3.9+r()*.6;gh=4.2+r()*.6;}
  else if(style===TOWER){fh=2.82+r()*.22;gh=3.5+r()*1.3;}
  else if(style===OFFICE){fh=3.25+r()*.45;gh=4.2+r()*1.2;}
  else if(style===SHOPS){fh=2.95+r()*.35;gh=3.6+r()*.7;}
  else{fh=H;gh=H;}
  if(H<gh+fh*.75){gh=Math.min(H,Math.max(gh,H-.25));}
  // Balconies on most apartment towers: stacked in some bays, or along the whole facade.
  const balc=style===TOWER&&H>7&&r()<.72,balcCont=r()<.3,balcP=.25+.45*r(),balcD=1+r()*.45;
  // Colours: per style and quarter; a share of the Estreito's houses in bare brick.
  const brick=style===HOUSE&&!island&&r()<.16||t==='construction';
  const wall=tint(brick?pick(PAL.brick,r()):style===COLONIAL?pick(PAL.colonial,r()):style===TOWER?pick(PAL.tower,r()):style===OFFICE?pick(PAL.office,r()):style===SHED?pick(PAL.shed,r()):style===CHURCH?pick(PAL.church,r()):pick(PAL.plaster,r()),(.92+r()*.14)*(brick?.85:ALBEDO));
  const roofColor=tint(roof==='hip'||roof==='gable'?pick(PAL.tile,r()):roof==='metal'||roof==='shed'||roof==='canopy'?pick(PAL.metal,r()):pick(PAL.slab,r()),(.9+r()*.2)*.8);
  const shopsOn=style===SHOPS||style===COLONIAL||style===OFFICE&&r()<.7||style===TOWER&&r()<(core?.75:near<22?.55:.18);
  list.push({...b,index,box,style,roof,pitch,rise,par,H,fh,gh,zr,zb,gmean,fill,wall,roofColor,brick,shopsOn,seed:r(),canopy,balc,balcCont,balcP,balcD});
  stats.styles[STYLE_NAMES[style]]=(stats.styles[STYLE_NAMES[style]]??0)+1;
 }
 stats.buildings=list.length;

 // --- Chunks: the buildings gathered into a dozen compact clusters (k-means on their centres, each side of the bay on
 // its own), one mesh each: the whole city stays within its draw calls and a cluster out of view is culled whole.
 const clusters=[],groups=new Groups();
 for(const side of [list.filter(b=>b.cx>0),list.filter(b=>b.cx<=0)]){
  if(!side.length)continue;const k=Math.max(1,Math.round((simple?8:14)*side.length/list.length));
  // Seeds spread by farthest point, then a few rounds of Lloyd.
  const centres=[[side[0].cx,side[0].cy]];
  while(centres.length<k){let best=null,far=-1;for(const b of side){const d=Math.min(...centres.map(c=>Math.hypot(b.cx-c[0],b.cy-c[1])));if(d>far){far=d;best=b;}}centres.push([best.cx,best.cy]);}
  for(let it=0;it<12;it++){const acc=centres.map(()=>[0,0,0]);for(const b of side){let j=0,dj=Infinity;centres.forEach((c,i)=>{const d=Math.hypot(b.cx-c[0],b.cy-c[1]);if(d<dj){dj=d;j=i;}});b.cluster=j;acc[j][0]+=b.cx;acc[j][1]+=b.cy;acc[j][2]++;}acc.forEach((a,i)=>{if(a[2])centres[i]=[a[0]/a[2],a[1]/a[2]];});}
  const meshers=centres.map(()=>new Mesher(groups));for(const b of side)b.mesh=meshers[b.cluster];clusters.push(...meshers);
 }
 stats.chunks=clusters.length;
 // --- The walls, run by run (a run: walls that turn less than 25° from one to the next, a facade's length).
 const A={seed:0,code:0,flags:0,H:0,m:0,nb:0,ns:0,rs:0,fh:3,gh:3,mask:0};
 const clearings=[];
 for(const b of list){
  const M=b.mesh,ring=b.ring,n=ring.length,r=random(Math.floor(b.seed*1e9));
  Object.assign(A,{seed:b.seed,H:b.H,fh:b.fh,gh:b.gh});
  const edges=ring.map((a,i)=>{const q=ring[(i+1)%n],len=Math.hypot(q[0]-a[0],q[1]-a[1]);return {a,b:q,len,tx:(q[0]-a[0])/len,ty:(q[1]-a[1])/len};});
  const turn=i=>{const e0=edges[(i-1+n)%n],e1=edges[i];return Math.abs(Math.atan2(e0.tx*e1.ty-e0.ty*e1.tx,e0.tx*e1.tx+e0.ty*e1.ty));};
  let corners=[];for(let i=0;i<n;i++)if(turn(i)>.44)corners.push(i);
  if(!corners.length){let best=0;for(let i=1;i<n;i++)if(turn(i)>turn(best))best=i;corners=[best];}
  const top=b.roof==='flat'||b.roof==='metal'?b.H+b.par:b.H;
  const style=b.style,bayW=style===HOUSE?2.7+r()*.8:style===COLONIAL?2.5+r()*.5:style===TOWER?2.7+r()*.9:style===OFFICE?2.6+r()*.8:style===SHED?4.5+r()*2:style===CHURCH?4+r():2.8+r()*.7;
  const pier=style===COLONIAL?.45+r()*.15:style===OFFICE?.35+r()*.2:style===TOWER?.6+r()*.6:.5+r()*.35;
  const shopW=5+r()*3;
  for(let c=0;c<corners.length;c++){
   const from=corners[c],to=corners[(c+1)%corners.length],ids=[];
   for(let i=from;;i=(i+1)%n){ids.push(i);if((i+1)%n===to)break;if(ids.length>n)break;}
   const run=ids.map(i=>edges[i]),L=run.reduce((s,e)=>s+e.len,0);
   // Faces a street over most of its length (points just outside it), and which walls lean on a neighbour.
   let frontLen=0;
   for(const e of run){
    const nx=e.ty,ny=-e.tx,steps=Math.max(1,Math.round(e.len/4));let hits=0,party=0;
    for(let s=0;s<steps;s++){const t=(s+.5)/steps,x=e.a[0]+(e.b[0]-e.a[0])*t,y=e.a[1]+(e.b[1]-e.a[1])*t;if(street(x+nx*1.3,y+ny*1.3))hits++;}
    for(const t of [.2,.5,.8]){const x=e.a[0]+(e.b[0]-e.a[0])*t,y=e.a[1]+(e.b[1]-e.a[1])*t;if(buildingAt(x+nx*.8,y+ny*.8,b.index)>=0)party++;}
    e.party=party>=2&&e.len>1.5;frontLen+=hits/steps*e.len;
    e.yw=Math.max(b.zb+.2,groundAt((e.a[0]+e.b[0])/2+nx*.6,(e.a[1]+e.b[1])/2+ny*.6))-b.zr;
   }
   const front=frontLen>L*.5&&run.some(e=>!e.party);
   const free=L-2*pier,nb=free>=bayW*.6?Math.max(1,Math.round(free/bayW)):0;
   const ns=front&&(b.shopsOn||style===SHED)?(style===COLONIAL?nb:Math.max(1,Math.round(free/(style===SHED?8+r()*4:shopW)))):0;
   Object.assign(A,{m:pier,nb,ns:free>2?ns:0,rs:r(),code:style*16+WALL});
   // Balconies: one bit per bay for the shader (the glazed door behind, the shade), and here a slab and a railing on
   // every floor. Only on facades open to the street or a yard (no neighbour within 7 m in front).
   let mask=0;
   if(b.balc&&nb>0&&nb<=23&&L>=4&&run.some(e=>!e.party)){
    const mid=run[Math.floor(run.length/2)],mx=(mid.a[0]+mid.b[0])/2,my=(mid.a[1]+mid.b[1])/2;
    if([2.2,4.5,7].every(t=>buildingAt(mx+mid.ty*t,my-mid.tx*t,b.index)<0))for(let j=0;j<nb;j++)if(b.balcCont||r()<b.balcP)mask|=1<<j;
   }
   A.mask=mask;
   stats.runs++;if(front)stats.frontRuns++;if(front&&b.shopsOn&&A.ns&&style!==SHED)stats.shops+=A.ns;
   let along=0;
   for(const e of run){
    A.flags=(front?F_FRONT:0)|(e.party?F_PARTY:0)|(b.shopsOn?F_SHOPS:0)|(b.brick?F_BRICK:0);
    const nx=e.ty,ny=-e.tx,z0=b.zb,z1=b.zr+top,a0=along,a1=along+e.len;
    const i0=M.v(e.a[0],e.a[1],z0,nx,ny,0,b.wall,a0,z0-b.zr,L,e.yw,A),i1=M.v(e.b[0],e.b[1],z0,nx,ny,0,b.wall,a1,z0-b.zr,L,e.yw,A);
    const i2=M.v(e.b[0],e.b[1],z1,nx,ny,0,b.wall,a1,top,L,e.yw,A),i3=M.v(e.a[0],e.a[1],z1,nx,ny,0,b.wall,a0,top,L,e.yw,A);
    M.quad(i0,i1,i2,i3);stats.walls++;if(e.party)stats.partyWalls++;
    e.along=along;e.run={L,front,ns:A.ns,pier,shops:b.shopsOn&&front&&style!==SHED&&style!==COLONIAL};along+=e.len;
   }
   if(mask&&!simple)balconies(b,M,run,L,pier,nb,mask);
   A.mask=0;
  }
  // --- Roofs.
  roofOf(b,M,r,edges);
  // Shop awnings over the pavement (canvas, in the shop's own colours; never into the road).
  if(!simple)awnings(b,M,r,edges);
  if(!simple&&!b.canopy)rooftop(b,M,r);
  // Trees out of the footprint (landscape.js clears them), only where the land cover or the mapped trees can put one.
  const step=8;for(let u=-b.box.a+step/2;u<b.box.a;u+=step)for(let v=-b.box.b+step/2;v<b.box.b;v+=step){const x=b.box.cx+b.box.ux*u-b.box.uy*v,y=b.box.cy+b.box.uy*u+b.box.ux*v;if(treesNear(x,y)&&insideRing(ring,x,y))clearings.push({x,y,r:step*.6});}
  if(b.area<70&&treesNear(b.cx,b.cy))clearings.push({x:b.cx,y:b.cy,r:Math.sqrt(b.area)*.6});
  b.top=top;
 }

 function roofOf(b,M,r,edges){
  const ring=b.ring,zRoof=b.zr+b.H;A.flags=0;Object.assign(A,{m:0,nb:0,ns:0,rs:r()});
  if(b.roof==='flat'||b.roof==='metal'){
   const part=b.roof==='metal'?METAL:ROOF,zTop=b.zr+b.H+b.par,inner=b.par>0&&!simple?insetRing(ring,.22):ring,z=b.par>0&&!simple?zRoof:zTop;
   A.code=b.style*16+part;
   const tris=THREE.ShapeUtils.triangulateShape(ring.map(([x,y])=>new THREE.Vector2(x,y)),[]);
   const base=M.count;for(const [x,y] of inner)M.v(x,y,z,0,0,1,b.roofColor,x,y,0,0,A);
   for(const [i,j,k] of tris){const p=inner[i],q=inner[j],s=inner[k],cr=(q[0]-p[0])*(s[1]-p[1])-(q[1]-p[1])*(s[0]-p[0]);if(cr>=0)M.tri(base+i,base+j,base+k);else M.tri(base+i,base+k,base+j);}
   if(b.par>0&&!simple){
    const n=ring.length,capColor=tint(b.wall,1.02);
    A.code=b.style*16+INNER;
    for(let i=0;i<n;i++){const Q0=inner[i],Q1=inner[(i+1)%n],e=edges[i];const k0=M.v(Q1[0],Q1[1],z,-e.ty,e.tx,0,b.wall,0,0,0,0,A),k1=M.v(Q0[0],Q0[1],z,-e.ty,e.tx,0,b.wall,0,0,0,0,A),k2=M.v(Q0[0],Q0[1],zTop,-e.ty,e.tx,0,b.wall,0,0,0,0,A),k3=M.v(Q1[0],Q1[1],zTop,-e.ty,e.tx,0,b.wall,0,0,0,0,A);M.quad(k0,k1,k2,k3);}
    A.code=b.style*16+CAP;
    for(let i=0;i<n;i++){const j=(i+1)%n,P0=ring[i],P1=ring[j],Q0=inner[i],Q1=inner[j];const c0=M.v(P0[0],P0[1],zTop,0,0,1,capColor,P0[0],P0[1],0,0,A),c1=M.v(P1[0],P1[1],zTop,0,0,1,capColor,P1[0],P1[1],0,0,A),c2=M.v(Q1[0],Q1[1],zTop,0,0,1,capColor,Q1[0],Q1[1],0,0,A),c3=M.v(Q0[0],Q0[1],zTop,0,0,1,capColor,Q0[0],Q0[1],0,0,A);M.quad(c0,c1,c2,c3);}
   }
   stats.roofKinds[b.roof]++;stats.roofs++;return;
  }
  if(b.roof==='canopy'){
   // A canopy on posts (a car port, a forecourt roof): a thin slab and a post at every corner.
   A.code=b.style*16+METAL;const z1=zRoof,z0=z1-.35;
   const tris=THREE.ShapeUtils.triangulateShape(ring.map(([x,y])=>new THREE.Vector2(x,y)),[]);
   for(const [zz,up] of [[z1,1],[z0,-1]]){const base=M.count;for(const [x,y] of ring)M.v(x,y,zz,0,0,up,b.roofColor,x,y,0,0,A);for(const [i,j,k] of tris){const p=ring[i],q=ring[j],s=ring[k],cr=((q[0]-p[0])*(s[1]-p[1])-(q[1]-p[1])*(s[0]-p[0]))*up;if(cr>=0)M.tri(base+i,base+j,base+k);else M.tri(base+i,base+k,base+j);}}
   A.code=b.style*16+PROP;for(const e of edges){M.face([[e.a[0],e.a[1],z0],[e.b[0],e.b[1],z0],[e.b[0],e.b[1],z1],[e.a[0],e.a[1],z1]],b.roofColor,A);}
   for(const [x,y] of ring.filter((_,i)=>i%Math.max(1,Math.floor(ring.length/6))===0))M.box(x,y,1,0,.12,.12,b.zb,z0,PAL.concrete[0],A);
   stats.roofKinds.canopy++;stats.roofs++;return;
  }
  // Pitched: over the footprint's rectangle, eaves out past the walls; hip on houses, gable on sheds and churches.
  const {cx,cy,ux,uy}=b.box,vx=-uy,vy=ux,e=b.style===SHED?.25:b.style===CHURCH?.3:b.style===COLONIAL?.15:.45+r()*.25;
  const a=b.box.a+e,bb=b.box.b+e,tan=Math.tan(b.pitch),z0=zRoof-e*tan,zR=z0+bb*tan,hip=b.roof==='hip';
  const P=(u,v,z)=>[cx+ux*u+vx*v,cy+uy*u+vy*v,z];
  const ridge=hip?Math.max(0,a-bb):a;
  const E0=P(-a,-bb,z0),E1=P(a,-bb,z0),E2=P(a,bb,z0),E3=P(-a,bb,z0),R0=P(-ridge,0,zR),R1=P(ridge,0,zR);
  const part=b.style===SHED?METAL:TILE,slope=1/Math.cos(b.pitch);
  A.code=b.style*16+part;
  // Pattern coordinates: along the eave, and up the slope from it.
  const uvSide=(pts,sgn)=>pts.map(p=>{const du=(p[0]-cx)*ux+(p[1]-cy)*uy,dv=(p[0]-cx)*vx+(p[1]-cy)*vy;return [du,(bb-sgn*dv)*slope];});
  const uvEnd=(pts,sgn)=>pts.map(p=>{const du=(p[0]-cx)*ux+(p[1]-cy)*uy,dv=(p[0]-cx)*vx+(p[1]-cy)*vy;return [dv,(a-sgn*du)*slope];});
  const faces=[[[E0,E1,R1,R0],uvSide([E0,E1,R1,R0],-1)],[[E2,E3,R0,R1],uvSide([E2,E3,R0,R1],1)]];
  if(hip)faces.push([[E1,E2,R1],uvEnd([E1,E2,R1],1)],[[E3,E0,R0],uvEnd([E3,E0,R0],-1)]);
  for(const [pts,uv] of faces){M.face(pts,b.roofColor,A,uv);}
  // The eaves' underside (seen from the pavement).
  A.code=b.style*16+SOFFIT;for(const [pts] of faces)M.face([...pts].reverse(),tint(b.wall,.9),A);
  if(!hip){
   // Gable ends: wall triangles over the rectangle's ends, a little in from the eaves.
   A.code=b.style*16+WALL;Object.assign(A,{m:0,nb:0,ns:0});
   for(const s of [-1,1]){const u=s*b.box.a,p=P(u,-b.box.b,zRoof),q=P(u,b.box.b,zRoof),t=P(u,0,zRoof+b.box.b*tan),pts=s>0?[p,q,t]:[q,p,t];
    const nx=ux*s,ny=uy*s,ids=pts.map(pp=>M.v(pp[0],pp[1],pp[2],nx,ny,0,b.wall,0,pp[2]-b.zr,1,0,A));M.tri(ids[0],ids[1],ids[2]);}
  }
  if(b.style===CHURCH&&b.h>12){
   // A simple bell tower at one end of the nave, a pyramid on top.
   const side=Math.min(b.box.b*.9,3.2),tu=b.box.a-side,ht=b.zr+Math.max(b.H+b.rise+4,b.h+3);
   A.code=CHURCH*16+WALL;Object.assign(A,{m:.3,nb:1,ns:0,H:ht-b.zr-.5,fh:ht-b.zr,gh:ht-b.zr});
   const corners=[[tu-side,-side],[tu+side,-side],[tu+side,side],[tu-side,side]];
   for(let i=0;i<4;i++){const [u0,v0]=corners[i],[u1,v1]=corners[(i+1)%4],p=P(u0,v0,b.zb),q=P(u1,v1,b.zb),nx=(q[1]-p[1])/(2*side),ny=-(q[0]-p[0])/(2*side);
    const ids=[M.v(p[0],p[1],b.zb,nx,ny,0,b.wall,0,b.zb-b.zr,2*side,0,A),M.v(q[0],q[1],b.zb,nx,ny,0,b.wall,2*side,b.zb-b.zr,2*side,0,A),M.v(q[0],q[1],ht,nx,ny,0,b.wall,2*side,ht-b.zr,2*side,0,A),M.v(p[0],p[1],ht,nx,ny,0,b.wall,0,ht-b.zr,2*side,0,A)];M.quad(...ids);}
   A.code=CHURCH*16+TILE;const apex=P(tu,0,ht+side*1.6);for(let i=0;i<4;i++){const [u0,v0]=corners[i],[u1,v1]=corners[(i+1)%4];M.face([P(u0*1+(u0-tu)*.12,v0*1.12,ht),P(u1+(u1-tu)*.12,v1*1.12,ht),apex],b.roofColor,A,[[0,0],[2*side,0],[side,side*2]]);}
  }
  stats.roofKinds[hip?'hip':'gable']++;stats.roofs++;
 }

 function balconies(b,M,run,L,pier,nb,mask){
  const bw=(L-2*pier)/nb,spans=[];
  // Continuous balconies run the whole facade; stacked ones fill their own bays.
  for(let j=0;j<nb;j++){
   if(!(mask>>j&1))continue;const a0=pier+j*bw+(b.balcCont?0:.12),a1=pier+(j+1)*bw-(b.balcCont?0:.12),last=spans[spans.length-1];
   if(b.balcCont&&last&&Math.abs(last[1]-a0)<.01)last[1]=a1;else spans.push([a0,a1]);
  }
  // Never out over the road (the race's fences, the traffic): probe outward from the facade's middle.
  let depth=b.balcD;
  const mid=run[Math.floor(run.length/2)],mx=(mid.a[0]+mid.b[0])/2,my=(mid.a[1]+mid.b[1])/2;
  if(map)for(let t=.3;t<=depth+.4;t+=.2){if(map.at(mx+mid.ty*t,my-mid.tx*t).road<.4){depth=t-.5;break;}}
  if(depth<.7)return;
  const slab=tint(b.wall,1.15),rail=tint(b.wall,1.05),up=[0,0,1],down=[0,0,-1],items=[];
  for(const e of run){
   if(e.party)continue;
   const nx=e.ty,ny=-e.tx,base=b.zr+e.yw+b.gh;
   for(const [s0,s1] of spans){
    const a0=Math.max(s0,e.along),a1=Math.min(s1,e.along+e.len);if(a1-a0<.7)continue;
    const P0=[e.a[0]+e.tx*(a0-e.along),e.a[1]+e.ty*(a0-e.along)],P1=[e.a[0]+e.tx*(a1-e.along),e.a[1]+e.ty*(a1-e.along)];
    for(let fi=0;;fi++){const z=base+fi*b.fh;if(z-b.zr+b.fh>b.H+.3)break;items.push({e,a0,a1,P0,P1,O0:[P0[0]+nx*depth,P0[1]+ny*depth],O1:[P1[0]+nx*depth,P1[1]+ny*depth],z});}
   }
  }
  const at=(p,z)=>[p[0],p[1],z];
  // The slabs (top, soffit, edge), then the railings (the front seen from both sides, the ends from outside).
  A.code=b.style*16+SLAB;
  for(const {e,a0,a1,P0,P1,O0,O1,z} of items){
   const zl=z-.15,out=[e.ty,-e.tx,0];
   M.faceOut([at(P0,z),at(O0,z),at(O1,z),at(P1,z)],slab,A,[[a0,0],[a0,0],[a1,0],[a1,0]],up);
   M.faceOut([at(P0,zl),at(O0,zl),at(O1,zl),at(P1,zl)],slab,A,[[a0,-.15],[a0,-.15],[a1,-.15],[a1,-.15]],down);
   M.faceOut([at(O0,zl),at(O1,zl),at(O1,z),at(O0,z)],slab,A,[[a0,-.15],[a1,-.15],[a1,0],[a0,0]],out);
  }
  A.code=b.style*16+RAIL;
  for(const {e,a0,a1,P0,P1,O0,O1,z} of items){
   const zt=z+1.1,out=[e.ty,-e.tx,0],front=[at(O0,z),at(O1,z),at(O1,zt),at(O0,zt)],fuv=[[a0,0],[a1,0],[a1,1.1],[a0,1.1]];
   M.faceOut(front,rail,A,fuv,out);M.faceOut(front,rail,A,fuv,[-out[0],-out[1],0]);
   for(const [P,O,sx] of [[P0,O0,-1],[P1,O1,1]])M.faceOut([at(P,z),at(O,z),at(O,zt),at(P,zt)],rail,A,[[0,0],[depth,0],[depth,1.1],[0,1.1]],[e.tx*sx,e.ty*sx,0]);
   stats.balconies++;
  }
 }

 function awnings(b,M,r,edges){
  if(b.style===SHED||b.style===CHURCH)return;
  const done=new Set();
  for(const e of edges){
   const run=e.run;if(!run?.front||!run.ns||done.has(run))continue;done.add(run);
   if(!run.shops&&b.style!==COLONIAL)continue;
   const runEdges=edges.filter(x=>x.run===run),span=run.L-2*run.pier,sw=span/run.ns;
   for(let k=0;k<run.ns;k++){
    if(r()>(b.style===COLONIAL?.18:.5))continue;
    const s0=run.pier+k*sw+.25,s1=run.pier+(k+1)*sw-.25,color=pick(PAL.awning,r()),striped=r()<.35,depth=1+r()*.6,drop=.35+r()*.2;
    A.code=b.style*16+AWNING;A.flags=striped?F_STRIPES:0;
    for(const w of runEdges){
     const a0=Math.max(s0,w.along),a1=Math.min(s1,w.along+w.len);if(a1-a0<.8||w.party)continue;
     const nx=w.ty,ny=-w.tx,P0=[w.a[0]+w.tx*(a0-w.along),w.a[1]+w.ty*(a0-w.along)],P1=[w.a[0]+w.tx*(a1-w.along),w.a[1]+w.ty*(a1-w.along)];
     // Never over the road: the awning stops short of the kerb.
     let d=depth;if(map){const mx=(P0[0]+P1[0])/2,my=(P0[1]+P1[1])/2;for(let t=.4;t<=d;t+=.2){const q=map.at(mx+nx*t,my+ny*t);if(q.road<.5){d=t-.35;break;}}}
     if(d<.6)continue;
     const dh=Math.min(3.1,Math.max(2.3,b.gh-.95)),zw=b.zr+w.yw+dh+.12,zo=zw-drop;
     const O0=[P0[0]+nx*d,P0[1]+ny*d],O1=[P1[0]+nx*d,P1[1]+ny*d];
     const top=[[P0[0],P0[1],zw],[O0[0],O0[1],zo],[O1[0],O1[1],zo],[P1[0],P1[1],zw]],uvTop=[[a0,0],[a0,d],[a1,d],[a1,0]];
     M.face(top,color,A,uvTop);M.face([...top].reverse(),color,A,[...uvTop].reverse());
     const val=[[O0[0],O0[1],zo-.25],[O1[0],O1[1],zo-.25],[O1[0],O1[1],zo],[O0[0],O0[1],zo]],uvVal=[[a0,0],[a1,0],[a1,.25],[a0,.25]];
     M.face(val,color,A,uvVal);M.face([...val].reverse(),color,A,[...uvVal].reverse());
     for(const [P,O,sg] of [[P0,O0,1],[P1,O1,-1]]){const tri=[[P[0],P[1],zw],[O[0],O[1],zo-.25],[O[0],O[1],zo]];M.face(sg>0?tri:[...tri].reverse(),color,A);M.face(sg>0?[...tri].reverse():tri,color,A);}
     stats.awnings++;
    }
   }
  }
 }

 function rooftop(b,M,r){
  if(b.roof!=='flat')return;
  const zTop=b.zr+b.H,spot=roomiest(b.ring,b.box);if(spot.r<1.2)return;
  const {ux,uy}=b.box;A.code=b.style*16+PROP;A.flags=0;
  if((b.style===TOWER||b.style===OFFICE)&&b.H>11){
   // The lift and stair house, the concrete water reservoir on top of it or beside it, aerials.
   const a=Math.min(spot.r*.85,2+r()*2.2),bb=Math.min(spot.r*.8,1.6+r()*1.6),hm=2.6+r()*.7,mc=tint(b.wall,.9);
   M.box(spot.x,spot.y,ux,uy,a,bb,zTop,zTop+hm,mc,A);stats.props++;
   const onTop=r()<.6,rc=pick(PAL.concrete,r()),ra=Math.min(a,1.6+r()*1.4),rb=Math.min(bb,1.4+r()*1.2);
   if(onTop)M.box(spot.x,spot.y,ux,uy,ra,rb,zTop+hm,zTop+hm+1.8+r()*1,rc,A);
   else{const off=Math.min(spot.r*1.2,a+ra+.6);const x=spot.x+ux*off,y=spot.y+uy*off;if(insideRing(b.ring,x,y)&&edgeDistance(b.ring,x,y)>ra*.9)M.box(x,y,ux,uy,ra,rb,zTop,zTop+2.2+r()*1.2,rc,A);}
   stats.props++;
   const aerials=Math.floor(r()*3);for(let i=0;i<aerials;i++){const x=spot.x+(r()-.5)*a,y=spot.y+(r()-.5)*bb;M.box(x,y,ux,uy,.05,.05,zTop+hm,zTop+hm+2.5+r()*4,[.35,.35,.36],A);stats.props++;}
   // Air-conditioning condensers along the parapet now and then.
   if(r()<.5){const n=1+Math.floor(r()*3);for(let i=0;i<n;i++){const x=spot.x+(r()-.5)*spot.r*1.4,y=spot.y+(r()-.5)*spot.r*1.4;if(insideRing(b.ring,x,y)&&edgeDistance(b.ring,x,y)>.7){M.box(x,y,ux,uy,.45,.2,zTop,zTop+.7,[.62,.62,.6],A);stats.props++;}}}
  }else if(b.style!==SHED&&b.style!==CHURCH){
   // A house or shop block: the blue fibre water tank (or a small concrete one), on most of them.
   if(r()<.7){const rr=Math.min(spot.r*.8,.55+r()*.3),blue=r()<.75;if(blue)M.drum(spot.x,spot.y,rr,zTop,zTop+.9+r()*.25,pick(PAL.tank,r()),A);else M.box(spot.x,spot.y,ux,uy,rr,rr,zTop,zTop+1.1,pick(PAL.concrete,r()),A);stats.props++;}
   if(b.H>6&&r()<.35&&spot.r>2.2){M.box(spot.x+ux*1.6,spot.y+uy*1.6,ux,uy,1.1,1,zTop,zTop+2.2,tint(b.wall,.92),A);stats.props++;}
  }
 }

 // --- Meshes, one per chunk, all with the facade material.
 const {material,night,table:groupTable}=facadeMaterial({simple,signs:simple?null:signAtlas()});groupTable.value=groups.texture();stats.groups=groups.count;
 for(const M of clusters){
  if(!M.count)continue;
  const mesh=new THREE.Mesh(M.geometry(),material);mesh.name='Predios_cidade_bloco';mesh.castShadow=true;mesh.receiveShadow=true;
  root.add(mesh);stats.drawCalls++;stats.triangles+=M.triangles;stats.vertices+=M.count;
 }
 stats.clearings=clearings.length;
 // Camera obstacles: the walls of the buildings near the lap, as plain prisms (not drawn).
 const obstacles=[];
 {
  const a=data.samples,SGT=40,trackGrid=new Map();
  for(const p of a){const key=cellKey(Math.floor(p[1]/SGT),Math.floor(p[2]/SGT));if(!trackGrid.has(key))trackGrid.set(key,[]);trackGrid.get(key).push(p);}
  const trackGap=(x,y)=>{let best=Infinity;const i0=Math.floor(x/SGT),j0=Math.floor(y/SGT);for(let i=i0-1;i<=i0+1;i++)for(let j=j0-1;j<=j0+1;j++)for(const p of trackGrid.get(cellKey(i,j))??[])best=Math.min(best,Math.hypot(x-p[1],y-p[2])-p[4]/2);return best;};
  // One prism mesh per chunk (each its own bounding sphere: the camera's ray skips the far ones).
  const proxyMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),pos=new Map();
  for(const b of list){
   if(!b.ring.some(([x,y])=>trackGap(x,y)<28))continue;
   if(!pos.has(b.mesh))pos.set(b.mesh,[]);const out=pos.get(b.mesh),n=b.ring.length,z0=b.zb,z1=b.zr+b.top;
   for(let i=0;i<n;i++){const p=b.ring[i],q=b.ring[(i+1)%n];out.push(p[0],z0,-p[1],q[0],z0,-q[1],q[0],z1,-q[1],p[0],z0,-p[1],q[0],z1,-q[1],p[0],z1,-p[1]);}
  }
  let tris=0;
  for(const out of pos.values()){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(out,3));g.computeBoundingSphere();const proxy=new THREE.Mesh(g,proxyMaterial);proxy.name='Predios_cidade_obstaculo';proxy.updateMatrixWorld(true);obstacles.push(proxy);tris+=out.length/9;}
  stats.cameraObstacleTriangles=tris;
 }
 return {root,stats,obstacles,clearings,
  // Night: lit windows (warm homes, cool offices), shop fronts and their signs.
  setNight(level){night.value=level;}};
}
