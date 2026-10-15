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
uniform float cbNight,cbTime;
// The window cbWindow is drawing is open with someone leaning out of it (set round the call: cbOpenAt).
float cbOpenW=0.;
// The run's open windows with people (vExt.y, at most two: (bay+1)+64*(floor+1) each, packed as w1+2048*w2).
float cbOpenAt(float bay,float fi){float c=vExt.y;if(c<.5)return 0.;float k=bay+1.+64.*(fi+1.);return abs(mod(c,2048.)-k)<.5||abs(floor(c/2048.)-k)<.5?1.:0.;}
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
 float h1=fract(cell*7.13),h2=fract(cell*3.71+.2),h3=fract(cell*11.9+.5);
 // Open: someone leans out of it (cbOpenW), or a few others left open to the breeze, the curtain stirring.
 bool open=cbOpenW>.5||grille<.5&&style!=3&&style!=5&&fract(cell*5.37+.11)<(style==1?.09:.05);
 if(b>.3){
  float s=cbR(q,vec2(-w-fw-.06,b-fw-.07),vec2(w+fw+.06,b-fw+.01),aa);col=mix(col,col*1.08+.05,s);
  // Dirt washed down from the sill in streaks, fading toward the floor below.
  #ifndef CB_SIMPLE
  float below=cbR(q,vec2(-w-fw-.04,b-fw-1.6),vec2(w+fw+.04,b-fw-.07),aa)*smoothstep(b-fw-1.6,b-fw-.07,q.y);
  col*=1.-below*(.05+.2*smoothstep(.45,.8,cbN(vec2(q.x*7.+cell*13.,.5))));
  // Under a window air conditioner: the dark wet trail of its drip down the wall.
  if(h3<acP&&style!=1&&style!=5&&!open){float sx=q.x*(h2<.5?-1.:1.)-(w-.3)+.025*sin(q.y*8.+cell*20.);
   col*=1.-.32*(1.-smoothstep(.03,.1,abs(sx)))*cbR(q,vec2(-99.,b-fw-2.4),vec2(99.,b-fw-.04),aa)*smoothstep(b-fw-2.4,b-fw-.4,q.y)*(.6+.4*cbN(vec2(q.y*3.,cell*7.)));}
  #endif
 }
 col=mix(col,frameC,max(f-o,0.));
 if(o<=0.)return;
 vec2 r=(q-vec2(-w,b))/vec2(2.*w,t+arch-b);
 if(open){
  // The room inside, darker toward the floor; a curtain at one side, its edge stirring in the draught; lit at night.
  float sd=h2<.5?r.x:1.-r.x,k=.13+.12*h3+(.05*sin(cbTime*(.9+.5*h1)+cell*9.)+.025*sin(cbTime*2.3+cell*3.))*(1.-.6*r.y);
  float cur=1.-smoothstep(k-.012,k+.012,sd+.012*sin(r.y*15.+cbTime*1.7+cell*5.));
  vec3 cloth=cbP4(fract(h2*5.),vec3(.78,.76,.7),vec3(.72,.66,.55),vec3(.6,.62,.66),vec3(.7,.6,.6))*(.8+.2*sin(sd*70.+cbTime*.7));
  vec3 room=mix(vec3(.03,.027,.024),vec3(.085,.075,.063),r.y)*(1.-.45*(1.-smoothstep(0.,.1,t+arch-q.y)));
  col=mix(col,mix(room,cloth*(.7+.3*r.y),cur*.95),o);
  glow+=o*lit*lightC*(.2+.3*h2)*(.5+.7*r.y)*(1.-.4*cur);
  return;
 }
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
 // A lit room: brighter toward its ceiling lamp, the bars and frames dark against it. In about one in seven the TV is
 // on (the race, of course): a cold light that flickers with the cuts, each set on its own clock.
 vec3 lc=lightC;
 #ifndef CB_SIMPLE
 if(fract(cell*17.31+.37)<.14&&style!=3){float k=cbTime*(4.+3.*h1)+cell*40.,f=mix(cbH(vec3(floor(k),cell,3.)),cbH(vec3(floor(k)+1.,cell,3.)),smoothstep(.75,1.,fract(k)));lc=vec3(.32,.48,1.)*(.45+1.1*f);}
 #endif
 glow+=o*lit*gl*(1.-bars)*lc*(.18+.34*h2)*(.55+.6*r.y);
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
      cbOpenW=cbOpenAt(bay,fi);
      cbWindow(vec2(bx,fv),ww,wb,wt,.15,cbH(vec3(bay,fi,rs*13.)),1,px,frameC,glassC,shutC,shutP,0.,0.,0.,lit,lightC,col,glass,glow);
      cbOpenW=0.;
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
       #else
       // The balcony's wall lamp, on after dark in two balconies of five (the same rule lights the people on them: lampOn).
       float lamp=step(mod(bay*7.+fi*13.+floor(rs*997.),5.),1.5),fx=1.-smoothstep(.05,.05+px,length(vec2((bx-hw*.62)*1.4,fv-(fh-.42))));
       col=mix(col,vec3(.72,.71,.67),fx*.6);
       glow+=lamp*(fx*vec3(1.,.8,.55)*2.5+cbR(vec2(bx,fv),vec2(-hw,-.05),vec2(hw,fh-.15),aa)*vec3(1.,.72,.42)*.05*(.3+.7*smoothstep(.4,fh-.3,fv)));
       #endif
      }else{
       cbOpenW=cbOpenAt(bay,fi);
       bool tiny=cbOpenW<.5&&cbH(vec3(bay+.5,2.,rs*5.))<.22;
       float ww=tiny?.32:bw*(.3+.14*s1),wb=tiny?1.45:.9+.15*s2,wt=tiny?2.15:2.25+.1*s3;
       cbWindow(vec2(bx,fv),ww,wb,wt,.05,cbH(vec3(bay,fi,rs*13.)),2,px,frameC,glassC,shutC,shutP,tiny?0.:rollP,tiny?0.:acP,0.,lit*(tiny?.3:1.),lightC,col,glass,glow);
       #ifndef CB_SIMPLE
       // A split unit's condenser under some windows: a pale box with its round fan, the trail of its drain below.
       float sp=step(cbH(vec3(bay,fi,rs*3.+.7)),s3>.45?.18:.05)*(tiny?0.:1.)*(1.-cbOpenW);
       if(sp>0.){vec2 c=vec2(bx-(ww-.45)*(fract(bay*.5)>.25?1.:-1.),fv-.42);float box=cbR(c,vec2(-.42,-.27),vec2(.42,.27),aa);col=mix(col,vec3(.6,.6,.58)*(1.-.5*(1.-smoothstep(.17,.17+px,length(c-vec2(-.1,0.))))*step(length(c-vec2(-.1,0.)),.2)),box);col*=1.-.25*cbR(c,vec2(-.4,-.45),vec2(.44,-.27),aa);
        col*=1.-.3*(1.-smoothstep(.025,.09,abs(c.x-.3+.02*sin(c.y*7.+bay))))*cbR(c,vec2(-9.,-2.6),vec2(9.,-.3),aa)*smoothstep(-2.6,-.6,c.y);}
       #endif
       cbOpenW=0.;
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
     cbOpenW=cbOpenAt(bay,fi);
     cbWindow(vec2(bx,fv),ww,.95+.12*s2,2.15+.15*s3,.07,cbH(vec3(bay,fi,rs*13.)),style,px,frameC,glassC,shutC,shutP,rollP,acP,0.,lit,lightC,col,glass,glow);
     cbOpenW=0.;
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
 const night={value:0},table={value:null},time={value:0},uniforms={cbNight:night,cbTime:time,cbSigns:{value:signs},cbTable:table};
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
uniform highp sampler2D cbTable;attribute vec3 cbUVW;attribute float cbId;
varying vec4 vFac;flat varying vec4 vBld;flat varying vec4 vLay;flat varying vec2 vFlo;flat varying vec2 vExt;flat varying vec3 vCol;`).replace('#include <begin_vertex>',`#include <begin_vertex>
{
 int id=int(cbId+.5);ivec2 c=ivec2((id%${TABLE_ROW})*4,id/${TABLE_ROW});
 vBld=texelFetch(cbTable,c,0);vLay=texelFetch(cbTable,c+ivec2(1,0),0);vec4 t2=texelFetch(cbTable,c+ivec2(2,0),0),t3=texelFetch(cbTable,c+ivec2(3,0),0);vCol=t3.rgb;
 vFlo=t2.xy;vExt=vec2(t2.z,t3.w);vFac=vec4(cbUVW.xy,t2.w,cbUVW.z);
}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+FRAG_HEAD)
   .replace('#include <color_fragment>','#include <color_fragment>\n'+FRAG_MAIN)
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(cbRough,.07,cbGlass);')
   .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=max(cbMet,cbGlass*.15);')
   .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=cbGlow*cbNight;');
 };
 material.defines={...(simple?{CB_SIMPLE:''}:{}),...(signs?{CB_SIGNS:''}:{})};
 material.customProgramCacheKey=()=>'city-buildings-v2'+(simple?'-simple':'')+(signs?'-signs':'');
 return {material,night,table,time};
}

// --- Round 2: the city watching the race from its homes. The cloth atlas (1024², painted at load time): flags (Brazil,
// Santa Catarina, the plain stripes of the island's two clubs: no crests, no names), laundry cut out by its alpha,
// neon blade signs, and the hand-painted banners (joke lines only: the user's rule).
const FAIXAS=['BUZINA SE FOR OPALA','MANÉ DO MORRO TORCE PRO ÚLTIMO','Ó-LHÓ-LHÓ, QUE CORRIDA!','ALUGA-SE SACADA · ACEITO PASTEL',
 'TÁS TOLO? FREIA NA CURVA!','SILÊNCIO! GATO DORMINDO','DEVOLVAM MINHA VAGA DE GARAGEM','AQUI É ZONA DE ULTRAPASSAGEM'];
const LENCOIS=[['MÃE,','TÔ NA TV!'],['VAI 99!','A RUA É TUA!'],['QUEM CHEGAR','POR ÚLTIMO','PAGA O CHURRAS'],['FALTAM','QUANTAS','VOLTAS?']];
const BLADES=[['BAR','#ff3d6e'],['HOTEL','#4fd8ff'],['LANCHES','#ffd23a'],['PASTEL','#ff8a2a'],['PIZZA','#ff3d3d'],['AÇAÍ','#c46bff'],['SORVETE','#7dff9a'],['CHOPP','#ffe14a']];
const AT=1024,cellUV=(x,y,w,h)=>[(x+1.5)/AT,1-(y+h-1.5)/AT,(x+w-1.5)/AT,1-(y+1.5)/AT];
const ATLAS={flag:k=>cellUV(k*128,0,128,128),white:cellUV(6*128+10,10,44,108),leaf:cellUV(6*128+64,0,64,128),beach:cellUV(7*128,0,128,128),garment:k=>cellUV(k*128,128,128,128),
 blade:k=>cellUV(k*64,256,64,128),extra:k=>cellUV(512+k*128,256,128,128),faixa:k=>cellUV((k%2)*512,384+Math.floor(k/2)*90,512,90),lencol:k=>cellUV(k*256,744,256,280)};
const FLAG_NAMES=['brasil','sc','azul','preto','azulH','pretoH'];
const HAND='"Segoe Print","Comic Sans MS","Chalkboard SE","Marker Felt",cursive';
// (exported for the checks, to look at it)
export function lifeAtlas(){
 return canvasTexture((ctx,W,H)=>{
  const rr=random(77);
  const poly=(x0,y0,w,h,pts)=>{ctx.beginPath();pts.forEach(([u,v],i)=>i?ctx.lineTo(x0+u*w,y0+v*h):ctx.moveTo(x0+u*w,y0+v*h));ctx.closePath();};
  // Flags: drawn on the cell's unit square (the cloth's own aspect undoes the stretch).
  const flag=(k,draw)=>{ctx.save();ctx.translate(k*128,0);draw(128,128);ctx.restore();};
  flag(0,(w,h)=>{ctx.fillStyle='#14923a';ctx.fillRect(0,0,w,h);ctx.fillStyle='#f6d21c';poly(0,0,w,h,[[.085,.5],[.5,.11],[.915,.5],[.5,.89]]);ctx.fill();
   ctx.fillStyle='#1d3c8c';ctx.beginPath();ctx.ellipse(w/2,h/2,w*.175,h*.25,0,0,Math.PI*2);ctx.fill();
   ctx.save();ctx.clip();ctx.strokeStyle='#f4f2ea';ctx.lineWidth=h*.05;ctx.beginPath();ctx.ellipse(w*.42,h*.95,w*.42,h*.55,0,Math.PI*1.08,Math.PI*1.8);ctx.stroke();
   ctx.fillStyle='#f4f2ea';for(let i=0;i<14;i++){ctx.fillRect(w*(.38+rr()*.24),h*(.5+rr()*.18),1.6,1.6);}ctx.restore();});
  flag(1,(w,h)=>{ctx.fillStyle='#cf2a2c';ctx.fillRect(0,0,w,h);ctx.fillStyle='#f4f2ea';ctx.fillRect(0,h/3,w,h/3);ctx.fillStyle='#2f8a3e';poly(0,0,w,h,[[.33,.5],[.5,.2],[.67,.5],[.5,.8]]);ctx.fill();
   // (the state's arms, simplified: a gold star on the green lozenge)
   ctx.fillStyle='#f0c43a';ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?w*.025:w*.06;ctx.lineTo(w/2+Math.cos(a)*r,h/2+Math.sin(a)*r*1.43);}ctx.fill();});
  const stripes=(k,a,b,vertical)=>flag(k,(w,h)=>{for(let i=0;i<9;i++){ctx.fillStyle=i%2?b:a;if(vertical)ctx.fillRect(i*w/9,0,w/9+.5,h);else ctx.fillRect(0,i*h/9,w,h/9+.5);}});
  stripes(2,'#1f56a8','#f2f0e8',true);stripes(3,'#151515','#f2f0e8',true);stripes(4,'#1f56a8','#f2f0e8',false);stripes(5,'#151515','#f2f0e8',false);
  ctx.fillStyle='#ffffff';ctx.fillRect(6*128,0,64,128);
  // A potted plant's leaves (cut out by the alpha, standing on two crossed cards): blades from the pot outward.
  {const x0=6*128+64,g=['#4f7d34','#3f6b2a','#5d8a3a','#6b9a40','#356b3f','#7aa64a'];for(let i=0;i<34;i++){const a=(rr()-.5)*2.3,l=48+rr()*76,w=4+rr()*5,bx=x0+32+(rr()-.5)*8,by=124;
   ctx.save();ctx.translate(bx,by);ctx.rotate(a);ctx.fillStyle=g[i%g.length];ctx.beginPath();ctx.ellipse(0,-l/2,w,l/2,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(30,50,20,.5)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-l*.95);ctx.stroke();ctx.restore();}}
  flag(7,(w,h)=>{const c=['#f2683a','#f7d046','#2bb3b1','#f2f0e8','#e84a8a','#2a6fd1'];for(let i=0;i<10;i++){ctx.fillStyle=c[(i*7+3)%c.length];ctx.fillRect(0,i*h/10,w,h/10+.5);}});
  // Laundry: white cut-outs (the vertex colour dyes them), hung from the top of the cell; faint folds.
  const GARMENTS=[
   [[.18,.04],[.82,.04],[1,.22],[.86,.38],[.77,.29],[.77,.97],[.23,.97],[.23,.29],[.14,.38],[0,.22]],
   [[.15,.03],[.85,.03],[.99,.62],[.88,.64],[.79,.24],[.79,.97],[.21,.97],[.21,.24],[.12,.64],[.01,.62]],
   [[.08,.04],[.92,.04],[.97,.66],[.56,.7],[.5,.32],[.44,.7],[.03,.66]],
   [[.2,.02],[.8,.02],[.85,.98],[.58,.98],[.5,.26],[.42,.98],[.15,.98]],
   [[.32,.02],[.68,.02],[.7,.3],[.96,.98],[.04,.98],[.3,.3]],
   [[.12,.04],[.36,.04],[.36,.62],[.46,.78],[.42,.9],[.12,.86],[.12,.04]],
   [[.12,.06],[.88,.06],[.88,.3],[.62,.6],[.38,.6],[.12,.3]],
   [[.04,.02],[.96,.02],[.96,.98],[.04,.98]]
  ];
  GARMENTS.forEach((pts,k)=>{
   const x0=k*128,y0=128,g=ctx.createLinearGradient(x0,y0,x0+128,y0+128);g.addColorStop(0,'#ffffff');g.addColorStop(.5,'#ebebeb');g.addColorStop(1,'#ffffff');
   ctx.fillStyle=g;poly(x0,y0,128,128,pts);ctx.fill();
   if(k===5){poly(x0+64,y0,128,128,pts.map(([u,v])=>[u*.9,v*.95]));ctx.fill();}
   ctx.save();poly(x0,y0,128,128,pts);ctx.clip();ctx.strokeStyle='rgba(0,0,0,.07)';ctx.lineWidth=3;for(let i=0;i<4;i++){ctx.beginPath();const u=x0+20+rr()*88;ctx.moveTo(u,y0+10);ctx.lineTo(u+(rr()-.5)*20,y0+120);ctx.stroke();}
   if(k===7){ctx.fillStyle='rgba(0,0,0,.12)';ctx.fillRect(x0,y0+100,128,8);ctx.fillRect(x0,y0+18,128,8);}ctx.restore();
  });
  // Neon blade signs: the word down a dark board, the tube's colour round its edge (it glows at night).
  BLADES.forEach(([word,neon],k)=>{
   const x0=k*64,y0=256;ctx.fillStyle=['#1a1a1e','#2a0d12','#0d1a2a','#141414'][k%4];ctx.fillRect(x0,y0,64,128);
   ctx.strokeStyle=neon;ctx.lineWidth=3;ctx.strokeRect(x0+4,y0+4,56,120);ctx.fillStyle=neon;ctx.textAlign='center';ctx.textBaseline='middle';
   const n=[...word].length,px=Math.min(34,108/n);ctx.font=`900 ${px}px "Arial Black","Arial Bold",Arial,sans-serif`;
   [...word].forEach((ch,i)=>ctx.fillText(ch,x0+32,y0+10+(i+.5)*108/n));
  });
  // Club-coloured jerseys on the line, a rug, a flowered sheet.
  const shirt=GARMENTS[0];
  [['#151515','#f2f0e8'],['#1f56a8','#f2f0e8']].forEach(([a,b],k)=>{const x0=512+k*128,y0=256;ctx.save();poly(x0,y0,128,128,shirt);ctx.clip();for(let i=0;i<8;i++){ctx.fillStyle=i%2?b:a;ctx.fillRect(x0+i*16,y0,16.5,128);}ctx.restore();});
  {const x0=768,y0=256;ctx.fillStyle='#7a2a24';ctx.fillRect(x0+4,y0+2,120,124);ctx.strokeStyle='#d9b77a';ctx.lineWidth=6;ctx.strokeRect(x0+14,y0+12,100,104);ctx.fillStyle='#2c3f6a';ctx.beginPath();ctx.ellipse(x0+64,y0+64,26,34,0,0,Math.PI*2);ctx.fill();}
  {const x0=896,y0=256;ctx.fillStyle='#eef0f6';ctx.fillRect(x0,y0,128,128);for(let i=0;i<40;i++){ctx.fillStyle=['#e88aa6','#f2c14e','#8ec5e8','#9fd18b'][i%4];ctx.beginPath();ctx.arc(x0+rr()*128,y0+rr()*128,3+rr()*4,0,Math.PI*2);ctx.fill();}}
  // The banners: bedsheets and strips of cloth, lettered by hand in house paint (each letter its own tilt, a drip now and then).
  const paint=(lines,x0,y0,w,h,ink)=>{
   ctx.fillStyle='#f3efe3';ctx.fillRect(x0,y0,w,h);
   ctx.fillStyle='rgba(120,110,90,.08)';for(let i=1;i<4;i++)ctx.fillRect(x0+w*i/4-1,y0,2,h);ctx.fillRect(x0,y0+h/2-1,w,2);
   const lh=h/lines.length;
   lines.forEach((line,j)=>{
    let px=Math.min(lh*.72,64);ctx.font=`bold ${px}px ${HAND}`;const tw=ctx.measureText(line).width;if(tw>w*.92){px*=w*.92/tw;ctx.font=`bold ${px}px ${HAND}`;}
    const total=ctx.measureText(line).width;let x=x0+(w-total)/2;const y=y0+lh*(j+.55);ctx.textBaseline='middle';ctx.textAlign='left';
    for(const ch of line){const cw=ctx.measureText(ch).width;ctx.save();ctx.translate(x+cw/2,y+(rr()-.5)*px*.12);ctx.rotate((rr()-.5)*.14);ctx.fillStyle=ink;ctx.fillText(ch,-cw/2,0);ctx.restore();
     if(ch!==' '&&rr()<.18){ctx.fillStyle=ink;ctx.fillRect(x+cw*(.3+rr()*.4),y+px*.3,2,px*(.15+rr()*.35));}
     x+=cw;}
   });
  };
  const INKS=['#c4161c','#1b3f9a','#141414','#1d7a33','#c4161c','#141414','#1b3f9a','#b8420f'];
  FAIXAS.forEach((t,k)=>paint([t],(k%2)*512,384+Math.floor(k/2)*90,512,90,INKS[k]));
  LENCOIS.forEach((t,k)=>paint(t,k*256,744,256,280,INKS[(k*3+1)%INKS.length]));
 },AT,AT);
}

// --- The people: one small instanced figure posed in its vertex shader. Local frame: x across (x>0 holds the phone),
// y up, z forward (where they look). Limbs: 0 torso, 1 hips, 2-3 thigh and shin+foot (x<0), 4-5 (x>0), 6-7 upper arm and
// forearm+hand (x<0), 8-9 (x>0), 10 head and hair, 11 what the hand holds, 12 long hair. Slots (colour): 0 skin, 1 shirt,
// 2 trousers, 3 hair or cap, 4 shoes, 5 phone or can, 6 shins (bare in shorts), 7 sleeves, 8 forearms (long sleeves).
// far: the figure for the ones never nearer the race than FAR_PEOPLE metres, about half the triangles (fewer sides, no
// hands, no phone), the same limbs: the same poses and clothes.
const FAR_PEOPLE=75;
function figureGeometry(far=false){
 const sides=far?3:5,parts=[],add=(geo,limb,slot)=>{const g=geo.index?geo.toNonIndexed():geo;g.deleteAttribute('uv');const n=g.attributes.position.count;g.setAttribute('limb',new THREE.BufferAttribute(new Float32Array(n).fill(limb),1));g.setAttribute('slot',new THREE.BufferAttribute(new Float32Array(n).fill(slot),1));parts.push(g);};
 const seg=(r0,r1,a,b,limb,slot)=>{const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A),len=d.length(),g=new THREE.CylinderGeometry(r1,r0,len,sides,1,true);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));g.translate(...A.add(B).multiplyScalar(.5).toArray());add(g,limb,slot);};
 add(new THREE.CylinderGeometry(.17,.145,.53,far?4:6,1,false).scale(1,1,.62).translate(0,1.19,0),0,1);
 add(new THREE.CylinderGeometry(.15,.15,.17,far?4:6,1,true).scale(1,1,.68).translate(0,.89,0),1,2);
 for(const s of [-1,1]){
  const L=s<0?0:2;
  seg(.072,.062,[s*.095,.92,0],[s*.095,.5,0],2+L,2);seg(.056,.05,[s*.095,.5,0],[s*.095,0,.02],3+L,6);
  seg(.052,.046,[s*.2,1.42,0],[s*.21,1.13,0],6+L,7);seg(.042,.036,[s*.21,1.13,0],[s*.21,.87,0],7+L,8);
  if(!far)add(new THREE.OctahedronGeometry(.048).scale(.8,1.1,.6).translate(s*.21,.83,0),7+L,0);
 }
 add(new THREE.SphereGeometry(.105,far?4:6,far?3:4).scale(.92,1.12,1).translate(0,1.6,.01),10,0);
 add(new THREE.SphereGeometry(.113,far?4:6,2,0,Math.PI*2,0,Math.PI*.5).scale(.95,1.05,1.02).translate(0,1.62,-.012),10,3);
 if(!far)add(new THREE.BoxGeometry(1,1,1).translate(.21,.81,.03),11,5);
 if(!far)add(new THREE.BoxGeometry(.2,.26,.06).translate(0,1.5,-.085),12,3);
 const out=new THREE.BufferGeometry();
 for(const name of ['position','normal','limb','slot']){const arrays=parts.map(q=>q.attributes[name].array),all=new Float32Array(arrays.reduce((s,a)=>s+a.length,0));let o=0;for(const a of arrays){all.set(a,o);o+=a.length;}out.setAttribute(name,new THREE.BufferAttribute(all,parts[0].attributes[name].itemSize));}
 parts.forEach(q=>q.dispose());return out;
}
// Poses (pA.x): 0 leaning on the rail, 1 waving, 2 filming with the phone, 3 standing with a can, 4 seated, 5 leaning out
// of a window (legs inside), 6 at the grill, 7 cheering, 8 seated and filming. Heads (and a little of the body) turn to
// the camera when it comes by, the race's; some of the ones at the rail throw their arms up as it passes.
const PEOPLE_POSE=`
float pose=pA.x,seed=pA.y,t=cbTime*(.8+.4*fract(seed*7.31))+seed*53.;
vec3 p=position,n=normal;
vec3 dw=cbEye-instanceMatrix[3].xyz,dl=transpose(mat3(instanceMatrix))*dw;float dist=length(dw);
float hy=mix(.55*sin(t*.31)+.2*sin(t*.83),clamp(atan(dl.x,dl.z),-1.2,1.2),smoothstep(170.,80.,dist));
float lean=0.,uaL=.06,faL=.12,uaR=.06,faR=.12,rL=0.,rR=0.,th=0.,kn=0.,yo=0.,legs=1.,nod=.05*sin(t*.53),twist=.35,hold=0.;
int P=int(pose+.5);
if(P==0){lean=.3+.02*sin(t*.7);uaL=uaR=.6;faL=1.28;faR=1.25;twist=.15;}
else if(P==1){lean=.06;uaL=.42;faL=1.18;rR=2.5+.35*sin(t*7.);uaR=.12;faR=.3+.25*sin(t*7.+1.2);}
else if(P==2||P==8){lean=.12;uaR=1.12;faR=1.3;rR=-.3;uaL=1.;faL=1.45;rL=.34;hold=1.;nod=.22;if(P==8){th=1.5;kn=1.45;yo=-.45;lean=.06;}}
else if(P==3){lean=.03+.02*sin(t*.9);uaL=.05;faL=.15;uaR=.25;faR=1.75;rR=-.12;hold=2.;}
else if(P==4){th=1.5;kn=1.45;yo=-.45;lean=-.1;uaL=.35;faL=.9;uaR=.3;faR=1.6;rR=-.15;hold=2.;twist=.3;}
else if(P==5){lean=.86+.03*sin(t*.6);legs=0.;uaL=uaR=.96;faL=faR=1.48;rL=.22;rR=-.22;twist=.1;}
else if(P==6){lean=.3;uaL=.8;faL=.55;uaR=.95;faR=.65+.25*sin(t*2.3);nod=.35;twist=.05;hy*=.3;}
else{float c=sin(t*6.5);rL=-(2.55+.2*c);rR=2.55+.2*sin(t*6.5+.8);uaL=uaR=.15;faL=faR=.25;yo=.05*max(0.,c);}
if((P==0||P==3)&&fract(seed*3.1)<.35){float e=smoothstep(95.,35.,dist)*clamp(sin(t*.5)*2.+.4,0.,1.);
 lean=mix(lean,.04,e);rL=mix(rL,-2.45-.2*sin(t*6.5),e);rR=mix(rR,2.45+.2*sin(t*6.5+.8),e);uaL=mix(uaL,.2,e);uaR=mix(uaR,.2,e);faL=mix(faL,.25,e);faR=mix(faR,.25,e);hold*=step(e,.5);}
if(limb>10.5&&limb<11.5){vec3 H=vec3(.21,.81,.03);p=hold<.5?H:H+(p-H)*(hold<1.5?vec3(.075,.15,.014):vec3(.066,.12,.066));}
if(limb>11.5&&mod(floor(pLegs.a/8.),2.)<.5)p=vec3(0.);
if(legs<.5&&limb>.5&&limb<5.5)p=vec3(0.);
if(limb>1.5&&limb<5.5){float sx=limb<3.5?-1.:1.;vec3 Hp=vec3(sx*.095,.92,0.),K=vec3(sx*.095,.5,0.);
 if(limb>2.5&&limb<3.5||limb>4.5){p=pRx(p,K,-kn);n=pRx(n,vec3(0.),-kn);}
 p=pRx(p,Hp,th);n=pRx(n,vec3(0.),th);}
bool armL=limb>5.5&&limb<7.5,armR=limb>7.5&&limb<9.5||limb>10.5&&limb<11.5;
if(armL||armR){float sx=armL?-1.:1.,ua=armL?uaL:uaR,fa=armL?faL:faR,r=armL?rL:rR;vec3 S=vec3(sx*.2,1.42,0.),E=vec3(sx*.21,1.13,0.);
 if(limb>6.5&&limb<7.5||limb>8.5){p=pRx(p,E,fa);n=pRx(n,vec3(0.),fa);}
 p=pRx(p,S,ua);n=pRx(n,vec3(0.),ua);p=pRz(p,S,r);n=pRz(n,vec3(0.),r);}
if(limb>9.5&&limb<10.5||limb>11.5){vec3 N=vec3(0.,1.47,0.);float hh=hy*(1.-twist);p=pRx(p,N,-nod);n=pRx(n,vec3(0.),-nod);p=pRy(p,N,hh);n=pRy(n,vec3(0.),hh);}
if(limb<.5||limb>5.5){vec3 Hc=vec3(0.,.92,0.);float tw=hy*twist;p=pRy(p,Hc,tw);n=pRy(n,vec3(0.),tw);p=pRx(p,Hc,-lean);n=pRx(n,vec3(0.),-lean);}
p.y+=yo;p.x*=.9+.22*fract(seed*3.31);p.z*=.9+.3*fract(seed*9.17);
// Colours: skin, shirt, trousers or shorts, hair (or a cap), shoes, the phone or the can.
float fl=pLegs.a;bool shorts=mod(fl,2.)>.5,longS=mod(floor(fl/2.),2.)>.5,cap=mod(floor(fl/4.),2.)>.5;
vec3 hair=pSkin.a>.92?vec3(.42,.4,.37):mix(vec3(.016,.012,.009),vec3(.34,.22,.1),pSkin.a*pSkin.a);
if(cap&&slot>2.5&&slot<3.5&&limb<11.5)hair=pShirt.gbr*.8+.02;
float sl=slot;vec3 hc=fract(seed*5.7)<.5?vec3(.02,.02,.022):vec3(.45,.05,.04)*(.6+fract(seed*2.9));
vPCol=sl<.5?pSkin.rgb:sl<1.5?pShirt:sl<2.5?pLegs.rgb:sl<3.5?hair:sl<4.5?(fract(seed*4.3)<.4?vec3(.6,.6,.58):vec3(.03)):sl<5.5?(hold>1.5?hc:vec3(.015)):sl<6.5?(shorts?pSkin.rgb:pLegs.rgb):sl<7.5?pShirt:(longS?pShirt:pSkin.rgb);
vPLit=pA.z;
vec3 pPos=p;vec3 objectNormal=n;`;
const PEOPLE_HEAD=`attribute float limb,slot;attribute vec4 pA,pSkin,pLegs;attribute vec3 pShirt;uniform float cbTime;uniform vec3 cbEye;varying vec3 vPCol;varying float vPLit;
vec3 pRx(vec3 p,vec3 c,float a){vec3 d=p-c;float cs=cos(a),sn=sin(a);return c+vec3(d.x,d.y*cs+d.z*sn,-d.y*sn+d.z*cs);}
vec3 pRz(vec3 p,vec3 c,float a){vec3 d=p-c;float cs=cos(a),sn=sin(a);return c+vec3(d.x*cs-d.y*sn,d.x*sn+d.y*cs,d.z);}
vec3 pRy(vec3 p,vec3 c,float a){vec3 d=p-c;float cs=cos(a),sn=sin(a);return c+vec3(d.x*cs+d.z*sn,d.y,-d.x*sn+d.z*cs);}`;
function peopleMaterial(U){
 const m=new THREE.MeshStandardMaterial({name:'Predios_cidade_gente',roughness:.82,metalness:0});
 m.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{cbTime:U.time,cbEye:U.eye,cbNight:U.night});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+PEOPLE_HEAD).replace('#include <beginnormal_vertex>',PEOPLE_POSE).replace('#include <begin_vertex>','vec3 transformed=pPos;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float cbNight;varying vec3 vPCol;varying float vPLit;')
   .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=vPCol;')
   .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*vPLit*cbNight*.35;');
 };
 m.customProgramCacheKey=()=>'city-buildings-people-v1';return m;
}
// The cloth and the small things on the facades and roofs, one material: the atlas (things use its white patch), the
// vertex colour, and per vertex lifeW: how far down a hanging cloth (0 where it is tied), its phase, how far its free
// edge sways (m) and how much it glows after dark (neon, coals, party bulbs).
function lifeMaterial(map,U){
 const m=new THREE.MeshStandardMaterial({name:'Predios_cidade_vida',map,vertexColors:true,roughness:.86,metalness:0,side:THREE.DoubleSide,alphaTest:.45});
 m.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{cbTime:U.time,cbNight:U.night});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 lifeW;uniform float cbTime;varying float vLifeGlow;').replace('#include <begin_vertex>',`#include <begin_vertex>
vLifeGlow=lifeW.w;
// The breeze off the bay: a wave running down each cloth from where it is tied, in gusts, every one on its own clock.
if(lifeW.z>0.){float f=lifeW.x,ph=lifeW.y,gust=.55+.45*sin(cbTime*.31+ph*.7)*sin(cbTime*.13+ph);
 transformed+=objectNormal*f*lifeW.z*gust*(.7*sin(cbTime*2.2+ph-f*2.6)+.3*sin(cbTime*4.7+ph*1.9-f*5.));}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float cbNight;varying float vLifeGlow;')
   .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*vLifeGlow*cbNight;');
 };
 m.customProgramCacheKey=()=>'city-buildings-life-v1';return m;
}
// Small shapes for the things (frame: x forward, y left, z up; from z=0): unit box, tapered pot, round drum, a centred
// box (bars), the dish's bowl (its face toward +x).
let TEMPLATES=null;
function templates(){
 if(TEMPLATES)return TEMPLATES;
 const of=geo=>{const p=geo.attributes.position.array,n=geo.attributes.normal.array,pos=new Float32Array(p.length),nor=new Float32Array(n.length);
  for(let i=0;i<p.length;i+=3){pos[i]=p[i];pos[i+1]=-p[i+2];pos[i+2]=p[i+1];nor[i]=n[i];nor[i+1]=-n[i+2];nor[i+2]=n[i+1];}
  const idx=geo.index?Array.from(geo.index.array):Array.from({length:p.length/3},(_,i)=>i);geo.dispose();return {pos,nor,idx};};
 TEMPLATES={box:of(new THREE.BoxGeometry(1,1,1).translate(0,.5,0)),pot:of(new THREE.CylinderGeometry(1,.72,1,5,1,true).translate(0,.5,0)),
  drum:of(new THREE.CylinderGeometry(1,1,1,8,1,false).translate(0,.5,0)),cbox:of(new THREE.BoxGeometry(1,1,1)),bowl:of(new THREE.CylinderGeometry(1,.08,.3,10,1,false).rotateZ(-Math.PI/2).translate(.15,0,0))};
 return TEMPLATES;
}
class LifeGeo{
 constructor(){this.pos=new Grow(Float32Array);this.nor=new Grow(Float32Array);this.uv=new Grow(Float32Array);this.col=new Grow(Float32Array);this.wind=new Grow(Float32Array);this.idx=new Grow(Uint32Array);this.count=0;}
 // A vertex at track point (x,y,z), normal in track axes, uv, colour c, wind (down, phase, sway, glow).
 v(x,y,z,nx,ny,nz,u,v,c,w0,w1,w2,w3){this.pos.p3(x,z,-y);this.nor.p3(nx,nz,-ny);this.uv.p1(u);this.uv.p1(v);this.col.p3(c[0],c[1],c[2]);this.wind.p1(w0);this.wind.p1(w1);this.wind.p1(w2);this.wind.p1(w3);return this.count++;}
 // A cloth hanging from its tied edge T0→T1 by D (its drop: a track vector), in rows strips; rect: its atlas cell
 // [u0,v0,u1,v1] (v1 the tied edge); sway: metres its free edge moves. pole: the cell turned a quarter (a flag tied
 // along a pole by its hoist, flying out along D).
 cloth(T0,T1,D,rect,c,phase,sway,rows=3,glow=0,pole=false){
  const ax=T1[0]-T0[0],ay=T1[1]-T0[1],az=T1[2]-T0[2];let nx=ay*D[2]-az*D[1],ny=az*D[0]-ax*D[2],nz=ax*D[1]-ay*D[0];const l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;
  const first=this.count,uv=(k,f)=>pole?[rect[0]+(rect[2]-rect[0])*f,k?rect[1]:rect[3]]:[k?rect[2]:rect[0],rect[3]+(rect[1]-rect[3])*f];
  for(let i=0;i<=rows;i++){const f=i/rows;this.v(T0[0]+D[0]*f,T0[1]+D[1]*f,T0[2]+D[2]*f,nx,ny,nz,...uv(0,f),c,f,phase,sway,glow);this.v(T1[0]+D[0]*f,T1[1]+D[1]*f,T1[2]+D[2]*f,nx,ny,nz,...uv(1,f),c,f,phase,sway,glow);}
  for(let i=0;i<rows;i++){const a=first+i*2;this.idx.p3(a,a+2,a+1);this.idx.p3(a+1,a+2,a+3);}
 }
 // A template at (x,y,z), turned to heading h, tilted up by pitch about its own y, scaled by s=[sx,sy,sz].
 stamp(tpl,x,y,z,h,s,c,pitch=0,glow=0,uv=ATLAS.white){
  const ch=Math.cos(h),sh=Math.sin(h),cp=Math.cos(pitch),sp=Math.sin(pitch),first=this.count,P=tpl.pos,N=tpl.nor,u=(uv[0]+uv[2])/2,w=(uv[1]+uv[3])/2;
  for(let i=0;i<P.length;i+=3){
   let px=P[i]*s[0],py=P[i+1]*s[1],pz=P[i+2]*s[2],nx=N[i]/s[0],ny=N[i+1]/s[1],nz=N[i+2]/s[2],q=px*cp-pz*sp;pz=px*sp+pz*cp;px=q;q=nx*cp-nz*sp;nz=nx*sp+nz*cp;nx=q;
   const l=Math.hypot(nx,ny,nz)||1;this.v(x+px*ch-py*sh,y+px*sh+py*ch,z+pz,(nx*ch-ny*sh)/l,(nx*sh+ny*ch)/l,nz/l,u,w,c,0,0,0,glow);
  }
  for(const k of tpl.idx)this.idx.p1(first+k);
 }
 // A thin bar from a to b (track points), w×w thick: a wire, a post, a pole.
 bar(a,b,w,c,glow=0){const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],l=Math.hypot(dx,dy,dz);if(l<1e-3)return;this.stamp(templates().cbox,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,Math.atan2(dy,dx),[l,w,w],c,Math.atan2(dz,Math.hypot(dx,dy)),glow);}
 get triangles(){return this.idx.n/3;}
 geometry(){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(this.pos.done(),3));g.setAttribute('normal',new THREE.BufferAttribute(this.nor.done(),3));g.setAttribute('uv',new THREE.BufferAttribute(this.uv.done(),2));
  g.setAttribute('color',new THREE.BufferAttribute(this.col.done(),3));g.setAttribute('lifeW',new THREE.BufferAttribute(this.wind.done(),4));
  const idx=this.idx.done();g.setIndex(new THREE.BufferAttribute(this.count>65535?idx:Uint16Array.from(idx),1));g.computeBoundingSphere();return g;
 }
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
 // The places OpenStreetMap marks as historic (data.scenery.city.pois): the footprint under the point (or the nearest
 // one within 20 m) is a listed old building and gets the colonial treatment wherever it stands. A point that falls on a
 // tower is the low old building beside it (within 8 m), when there is one.
 const pois=data.scenery.city.pois;stats.historic=0;
 if(pois?.items){const pc=Object.fromEntries(pois.columns.map((k,i)=>[k,i]));
  for(const q of pois.items){
   if(!q[pc.historic])continue;const x=q[pc.x],y=q[pc.y];let k=buildingAt(x,y,-1);
   if(k<0||all[k].h>=18){let best=k<0?20:8;all.forEach((b,i)=>{const d=edgeDistance(b.ring,x,y);if(d<best&&b.h<18){best=d;k=i;}});}
   if(k>=0)all[k].historic=true;
  }
 }

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
  else if(b.historic&&b.h<18){style=COLONIAL;stats.historic++;}
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
 const clearings=[],facades=[];
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
    // (its row in the group table: facadeLife writes the run's open windows into it)
    e.gid=groups.count-1;
    e.along=along;e.run={L,front,ns:A.ns,pier,shops:b.shopsOn&&front&&style!==SHED&&style!==COLONIAL};along+=e.len;
   }
   if(nb>0&&style!==SHED&&style!==CHURCH&&style!==OFFICE){const f={b,run,L,pier,nb,mask,rs:A.rs,front};facades.push(f);run.facade=f;(b.facadeList??=[]).push(f);}
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
  const ridge=hip?Math.max(0,a-bb):a;b.ridgeZ=zR;
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
    for(let fi=0;;fi++){const z=base+fi*b.fh;if(z-b.zr+b.fh>b.H+.3)break;items.push({e,a0,a1,P0,P1,O0:[P0[0]+nx*depth,P0[1]+ny*depth],O1:[P1[0]+nx*depth,P1[1]+ny*depth],z,fi,depth,run,pier,bw});}
   }
  }
  // (kept for the life on them: facadeLife)
  (b.balconyItems??=[]).push(...items);
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
  // (what stands on the roof, so the life on it keeps clear: facadeLife)
  const taken=b.roofProps=[];
  if((b.style===TOWER||b.style===OFFICE)&&b.H>11){
   // The lift and stair house, the concrete water reservoir on top of it or beside it, aerials.
   const a=Math.min(spot.r*.85,2+r()*2.2),bb=Math.min(spot.r*.8,1.6+r()*1.6),hm=2.6+r()*.7,mc=tint(b.wall,.9);
   M.box(spot.x,spot.y,ux,uy,a,bb,zTop,zTop+hm,mc,A);stats.props++;taken.push({x:spot.x,y:spot.y,r:Math.hypot(a,bb)+.3});
   const onTop=r()<.6,rc=pick(PAL.concrete,r()),ra=Math.min(a,1.6+r()*1.4),rb=Math.min(bb,1.4+r()*1.2);
   if(onTop)M.box(spot.x,spot.y,ux,uy,ra,rb,zTop+hm,zTop+hm+1.8+r()*1,rc,A);
   else{const off=Math.min(spot.r*1.2,a+ra+.6);const x=spot.x+ux*off,y=spot.y+uy*off;if(insideRing(b.ring,x,y)&&edgeDistance(b.ring,x,y)>ra*.9){M.box(x,y,ux,uy,ra,rb,zTop,zTop+2.2+r()*1.2,rc,A);taken.push({x,y,r:Math.hypot(ra,rb)+.3});}}
   stats.props++;
   const aerials=Math.floor(r()*3);for(let i=0;i<aerials;i++){const x=spot.x+(r()-.5)*a,y=spot.y+(r()-.5)*bb;M.box(x,y,ux,uy,.05,.05,zTop+hm,zTop+hm+2.5+r()*4,[.35,.35,.36],A);stats.props++;}
   // Air-conditioning condensers along the parapet now and then.
   if(r()<.5){const n=1+Math.floor(r()*3);for(let i=0;i<n;i++){const x=spot.x+(r()-.5)*spot.r*1.4,y=spot.y+(r()-.5)*spot.r*1.4;if(insideRing(b.ring,x,y)&&edgeDistance(b.ring,x,y)>.7){M.box(x,y,ux,uy,.45,.2,zTop,zTop+.7,[.62,.62,.6],A);stats.props++;taken.push({x,y,r:.7});}}}
  }else if(b.style!==SHED&&b.style!==CHURCH){
   // A house or shop block: the blue fibre water tank (or a small concrete one), on most of them.
   if(r()<.7){const rr=Math.min(spot.r*.8,.55+r()*.3),blue=r()<.75;if(blue)M.drum(spot.x,spot.y,rr,zTop,zTop+.9+r()*.25,pick(PAL.tank,r()),A);else M.box(spot.x,spot.y,ux,uy,rr,rr,zTop,zTop+1.1,pick(PAL.concrete,r()),A);stats.props++;taken.push({x:spot.x,y:spot.y,r:rr*1.5+.3});}
   if(b.H>6&&r()<.35&&spot.r>2.2){M.box(spot.x+ux*1.6,spot.y+uy*1.6,ux,uy,1.1,1,zTop,zTop+2.2,tint(b.wall,.92),A);stats.props++;taken.push({x:spot.x+ux*1.6,y:spot.y+uy*1.6,r:1.8});}
  }
 }

 // --- Round 2: the city watching the race from its homes (facadeLife). Planned before the group table goes to the GPU:
 // the windows people lean out of are written into it.
 const life=facadeLife();

 // --- Meshes, one per chunk, all with the facade material.
 const {material,night,table:groupTable,time}=facadeMaterial({simple,signs:simple?null:signAtlas()});groupTable.value=groups.texture();stats.groups=groups.count;
 for(const M of clusters){
  if(!M.count)continue;
  const mesh=new THREE.Mesh(M.geometry(),material);mesh.name='Predios_cidade_bloco';mesh.castShadow=true;mesh.receiveShadow=true;
  root.add(mesh);stats.drawCalls++;stats.triangles+=M.triangles;stats.vertices+=M.count;
 }
 stats.clearings=clearings.length;
 // The life's meshes: the people (one instanced figure) and the cloth and things (one mesh a side of the bay). Small and
 // many: no shadows of their own, and left out of the cars' reflection cube (a few pixels there for each one drawn).
 const U={time,night,eye:{value:new THREE.Vector3(0,-1e4,0)}};
 const notInProbe=(mesh,full)=>{mesh.onBeforeRender=renderer=>{const t=renderer.getRenderTarget(),skip=t&&(t.isWebGLCubeRenderTarget||t.width<64);if(mesh.isInstancedMesh)mesh.count=skip?0:full;else mesh.geometry.setDrawRange(0,skip?0:Infinity);};};
 stats.life=life.stats;life.stats.drawCalls=0;life.stats.triangles=0;
 // The people: the ones near the lap with the whole figure, the rest with the far one (one draw each).
 const peopleMat=life.people.length?peopleMaterial(U):null;life.stats.figureTriangles=[];
 for(const far of [false,true]){
  const list=life.people.filter(q=>q.far===far);if(!list.length)continue;
  const geo=figureGeometry(far),n=list.length,M4=new THREE.Matrix4(),Q=new THREE.Quaternion(),V=new THREE.Vector3(),SC=new THREE.Vector3(),Y=new THREE.Vector3(0,1,0);
  const pA=new Float32Array(n*4),pSkin=new Float32Array(n*4),pLegs=new Float32Array(n*4),pShirt=new Float32Array(n*3);
  const mesh=new THREE.InstancedMesh(geo,peopleMat,n);mesh.name=far?'Predios_cidade_gente_longe':'Predios_cidade_gente';mesh.castShadow=false;mesh.receiveShadow=true;mesh.frustumCulled=false;
  list.forEach((q,i)=>{
   mesh.setMatrixAt(i,M4.compose(V.set(q.x,q.z,-q.y),Q.setFromAxisAngle(Y,q.h+Math.PI/2),SC.set(q.s,q.s,q.s)));
   pA.set([q.pose,q.seed,q.lit,0],i*4);pSkin.set([...q.skin,q.hair],i*4);pLegs.set([...q.pants,q.flags],i*4);pShirt.set(q.shirt,i*3);
  });
  for(const [k,arr,size] of [['pA',pA,4],['pSkin',pSkin,4],['pLegs',pLegs,4],['pShirt',pShirt,3]])geo.setAttribute(k,new THREE.InstancedBufferAttribute(arr,size));
  notInProbe(mesh,n);root.add(mesh);life.stats.drawCalls++;life.stats.figureTriangles.push(geo.attributes.position.count/3);life.stats.triangles+=geo.attributes.position.count/3*n;
  life.stats[far?'peopleFar':'peopleNear']=n;
 }
 const lifeMat=life.geos.some(G=>G.count)?lifeMaterial(lifeAtlas(),U):null;
 life.geos.forEach((G,k)=>{
  if(!G.count)return;
  const mesh=new THREE.Mesh(G.geometry(),lifeMat);mesh.name=k?'Predios_cidade_vida_continente':'Predios_cidade_vida_ilha';mesh.castShadow=false;mesh.receiveShadow=true;
  notInProbe(mesh);root.add(mesh);life.stats.drawCalls++;life.stats.triangles+=G.triangles;
 });
 stats.drawCalls+=life.stats.drawCalls;stats.triangles+=life.stats.triangles;
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
  // Night: lit windows (warm homes, cool offices, the TVs), shop fronts and their signs, balcony lamps and the people
  // under them, neon blade signs, the bulbs and coals of the parties on the lajes.
  setNight(level){night.value=level;},
  // The breeze, the curtains and the TVs run on their own clock; heads turn to where the camera (the race) is.
  update(dt,camera){time.value=(time.value+dt)%3600;if(camera)U.eye.value.setFromMatrixPosition(camera.matrixWorld);}};

 function facadeLife(){
  const S={people:0,balconyPeople:0,windowPeople:0,roofPeople:0,openWindows:0,sills:0,flags:0,banners:0,towels:0,garments:0,lines:0,yardLines:0,
   plants:0,hangingPlants:0,dishes:0,antennas:0,parasols:0,tables:0,chairs:0,grills:0,coolers:0,partyLights:0,neonSigns:0,viewFacades:0,
   // (a few of each, [x,y,z] where the facade or the roof is: for the checks' photos)
   where:{window:[],balcony:[],banner:[],party:[],sign:[]}};
  const mark=(k,x,y,z,h=0)=>{if(S.where[k].length<12)S.where[k].push([Math.round(x),Math.round(y),Math.round(z),Math.round(h*180/Math.PI)]);};
  const share=lean?.3:mobile?.5:1,T=templates(),geos=[new LifeGeo(),new LifeGeo()],people=[],byIndex=[];
  for(const b of list)byIndex[b.index]=b;
  const fr=x=>x-Math.floor(x),f32=Math.fround,wrap=a=>((a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
  const shuffle=(arr,rnd)=>{for(let i=arr.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;};
  // The lap, one sample in three, on a 50 m grid; every building's gap to it (from its centre to the asphalt's edge).
  const a=data.samples,coarse=a.filter((_,i)=>i%3===0),VG=50,vgrid=new Map();
  for(const p of coarse){const key=cellKey(Math.floor(p[1]/VG),Math.floor(p[2]/VG));if(!vgrid.has(key))vgrid.set(key,[]);vgrid.get(key).push(p);}
  for(const b of list){let d=Infinity;for(const p of coarse)d=Math.min(d,Math.hypot(b.cx-p[1],b.cy-p[2])-p[4]/2);b.gap=d;}
  // A point's gap to the lap (to its asphalt's edge), out to 150 m.
  const lapGap=(x,y)=>{let d=Infinity;const i0=Math.floor(x/VG),j0=Math.floor(y/VG);for(let i=i0-3;i<=i0+3;i++)for(let j=j0-3;j<=j0+3;j++)for(const p of vgrid.get(cellKey(i,j))??[])d=Math.min(d,Math.hypot(x-p[1],y-p[2])-p[4]/2);return d;};
  // What a wall at (x,y) facing (nx,ny) sees of the race: the best stretch of lap within 150 m in front of it (facing it,
  // near), and how high one must stand there to see it over the roofs in between (zMin).
  const view=(x,y,nx,ny,self)=>{
   let best=null,bs=0;const i0=Math.floor(x/VG),j0=Math.floor(y/VG);
   for(let i=i0-4;i<=i0+4;i++)for(let j=j0-4;j<=j0+4;j++)for(const p of vgrid.get(cellKey(i,j))??[]){
    const dx=p[1]-x,dy=p[2]-y,d=Math.hypot(dx,dy),edge=d-p[4]/2;if(edge>150||d<1)continue;
    const c=(dx*nx+dy*ny)/d;if(c<.25)continue;const s=Math.sqrt(c)*(1-Math.max(0,edge-25)/125);if(s>bs){bs=s;best=p;}
   }
   if(!best)return null;
   const dx=best[1]-x,dy=best[2]-y,D=Math.hypot(dx,dy),zt=best[3]+1;let zMin=-Infinity;
   for(let t=2;t<D-best[4]/2;t+=3){const u=t/D,k=buildingAt(x+dx*u,y+dy*u,self);if(k<0||!byIndex[k])continue;const o=byIndex[k];zMin=Math.max(zMin,(o.zr+o.top-zt*u)/(1-u));}
   return {score:bs,zMin,h:Math.atan2(dy,dx)};
  };
  // A point along a facade's run (s from its start), on its wall: the wall, the point, its outward normal.
  const runAt=(run,s)=>{for(const e of run)if(s<=e.along+e.len||e===run[run.length-1]){const u=Math.max(0,Math.min(e.len,s-e.along));return {e,x:e.a[0]+e.tx*u,y:e.a[1]+e.ty*u,nx:e.ty,ny:-e.tx};}};
  const viewsOf=f=>{
   if(f.views)return f.views;f.views=[];if(f.b.gap>160)return f.views;
   const n=Math.max(1,Math.round(f.L/25));
   for(let i=0;i<n;i++){const q=runAt(f.run,f.L*(i+.5)/n);f.views.push(q.e.party?null:view(q.x+q.nx,q.y+q.ny,q.nx,q.ny,f.b.index));}
   return f.views;
  };
  const viewAt=(f,s)=>{const v=viewsOf(f);return v.length?v[Math.max(0,Math.min(v.length-1,Math.floor(s/f.L*v.length)))]:null;};
  const roofView=b=>{let best=null;for(const f of b.facadeList??[])for(const v of viewsOf(f))if(v&&(!best||v.score>best.score))best=v;return best;};
  // The balcony lamps lit after dark: the facade shader's rule (two in five, by bay, floor and the run's seed).
  const lampOn=(bay,fi,rs)=>(bay*7+fi*13+Math.floor(f32(f32(rs)*997)))%5<=1;

  // --- Colours (linear): skins, race-day shirts (lots of Brazil yellow, the clubs' blue, black and white), trousers.
  const SKIN=['#f1c9a5','#e3b48c','#d09a76','#c68e6a','#a86f4c','#8a5a3c','#6b4430','#4f3326'].map(h=>tint(lin(h),.72));
  const SHIRT=[['#f2f0ea',16],['#151517',10],['#7d7f82',6],['#1d2a4d',7],['#f2c814',14],['#1a8a3a',8],['#1f56a8',9],['#7fb2e0',4],['#c4232a',6],['#e8742a',3],['#e78fb0',3],['#5a1f2e',3],['#3a7d6e',3]].map(([h,w])=>[tint(lin(h),.6),w]);
  const PANTS=['#2d3a55','#3e5a86','#1b1d20','#5a5f66','#8a7a5c','#c9b998','#2f4a3a','#e9e6dd','#7a2e2e'].map(h=>tint(lin(h),.58));
  const TOWELS=['#1f56a8','#c4232a','#f2c814','#e78fb0','#3a7d6e','#f08a4b','#8fc1e3','#6a3d9a','#2bb3b1'].map(h=>tint(lin(h),.75));
  const DYES=['#f4f2ec','#f4f2ec','#e9e4d6','#1f56a8','#c4232a','#f2c814','#e78fb0','#3a7d6e','#7d7f82','#151517','#3e5a86','#f08a4b','#8fc1e3','#b9d98c'].map(h=>tint(lin(h),.78));
  const POTS=['#a4552f','#8a4a2c','#2a2a2a','#d8d4cc','#6d6a66','#b5683e'].map(h=>tint(lin(h),.7));
  const PLASTIC=['#f0eee8','#f0eee8','#e8e4d8','#c4232a','#2a5fae','#f2c814','#2f8a3e'].map(h=>tint(lin(h),.75));
  const weighted=(list,r)=>{let x=r*list.reduce((s,q)=>s+q[1],0);for(const [v,w] of list)if((x-=w)<=0)return v;return list[0][0];};
  const person=(x,y,z,h,pose,rnd,lit=0,scale)=>{
   const s=scale??.93+rnd()*.13,flags=(rnd()<.5?1:0)+(rnd()<.15?2:0)+(rnd()<.18?4:0)+(rnd()<.35?8:0);
   people.push({x,y,z,h,s,pose,seed:rnd(),lit,skin:pick(SKIN,rnd()),hair:rnd()<.08?.95:rnd()*.9,shirt:weighted(SHIRT,rnd()),pants:pick(PANTS,rnd()),flags,far:lapGap(x,y)>FAR_PEOPLE});S.people++;
  };
  // --- Things.
  // Leaves on two crossed cards rising from a pot (or, hanging, falling from it): the tips stir in the breeze.
  const LEAF=[ATLAS.leaf[0],ATLAS.leaf[3],ATLAS.leaf[2],ATLAS.leaf[1]];
  const leaves=(G,x,y,z,w,h,rnd)=>{const a=rnd()*Math.PI,c=tint([1,1,1],.75+rnd()*.4);for(const da of [0,Math.PI/2]){const ca=Math.cos(a+da)*w/2,sa=Math.sin(a+da)*w/2;G.cloth([x-ca,y-sa,z],[x+ca,y+sa,z],[0,0,h],LEAF,c,rnd()*6.3,.04,2);}};
  const plant=(G,P,rnd)=>{
   const pc=pick(POTS,rnd()),r=.15+rnd()*.08,hp=.28+rnd()*.14,tall=rnd()<.45;G.stamp(T.pot,P[0],P[1],P[2],rnd()*6,[r,r,hp],pc);S.plants++;
   leaves(G,P[0],P[1],P[2]+hp*.7,tall?.6+rnd()*.15:.5+rnd()*.15,tall?1.2+rnd()*.6:.65+rnd()*.35,rnd);
  };
  // A fern hanging from the slab above, its pot on a wire, the fronds falling round it.
  const fern=(G,P,rnd)=>{const z=P[2]-.3-rnd()*.25;G.bar(P,[P[0],P[1],z],.012,[.3,.3,.3]);G.stamp(T.pot,P[0],P[1],z-.17,0,[.13,.13,.17],pick(POTS,rnd()));leaves(G,P[0],P[1],z-.05,.65+rnd()*.25,-(.55+rnd()*.35),rnd);S.hangingPlants++;};
  // A satellite dish on its arm: the bowl looks north and up, to the satellites over the equator.
  const dish=(G,P,rnd,mount=.5)=>{const r=.24+rnd()*.12,h=Math.PI/2+(rnd()-.5)*1.1;if(mount>0)G.bar(P,[P[0],P[1],P[2]+mount],.04,[.45,.45,.45]);const c=tint([.75,.75,.73],.85+rnd()*.2);G.stamp(T.bowl,P[0],P[1],P[2]+mount,h,[r,r,r],c,.85+rnd()*.25);
   G.bar([P[0],P[1],P[2]+mount],[P[0]+Math.cos(h)*r*1.1,P[1]+Math.sin(h)*r*1.1,P[2]+mount+r*.9],.02,[.35,.35,.35]);S.dishes++;};
  // A TV aerial (the fish-bone kind), all of them turned to the transmitters on the Morro da Cruz.
  const morro=marks.find(m=>m.kind==='morro_da_cruz')??{x:3114,y:571};
  const aerial=(G,P,rnd,mast)=>{const top=P[2]+mast,h=Math.atan2(morro.y-P[1],morro.x-P[0])+(rnd()-.5)*.25,c=[.42,.43,.44],ux=Math.cos(h),uy=Math.sin(h),boom=1.1+rnd()*.5;
   G.bar(P,[P[0],P[1],top+.1],.035,c);G.bar([P[0]-ux*boom*.3,P[1]-uy*boom*.3,top],[P[0]+ux*boom*.7,P[1]+uy*boom*.7,top],.025,c);
   for(let k=0;k<6;k++){const t=-boom*.25+k*boom*.18,w=.55-k*.06,cx=P[0]+ux*t,cy=P[1]+uy*t;G.bar([cx+uy*w/2,cy-ux*w/2,top],[cx-uy*w/2,cy+ux*w/2,top],.012,c);}S.antennas++;};
  // A line of washing from P0 to P1 (the line's height): garments of their own kinds and sizes, pegged with gaps.
  const SIZES=[[.5,.62],[.55,.75],[.42,.45],[.45,.95],[.45,.9],[.3,.3],[.3,.25],[.6,.9],[.5,.62],[.5,.62]];
  const washing=(G,P0,P1,rnd,maxDrop)=>{
   const dx=P1[0]-P0[0],dy=P1[1]-P0[1],L=Math.hypot(dx,dy);if(L<.6)return;const ux=dx/L,uy=dy/L;let s=.08+rnd()*.25;
   while(s<L-.3){
    const k=rnd(),kind=k<.25?0:k<.34?1:k<.47?2:k<.56?3:k<.62?4:k<.7?5:k<.78?6:k<.93?7:(rnd()<.5?8:9);
    const sc=.85+rnd()*.3,ww=SIZES[kind][0]*sc,dd=Math.min(SIZES[kind][1]*sc*(kind===7?1+rnd()*.5:1),maxDrop);if(s+ww>L-.08)break;
    const z=P0[2]+(P1[2]-P0[2])*(s/L)-.05*Math.sin(Math.PI*s/L);
    G.cloth([P0[0]+ux*s,P0[1]+uy*s,z],[P0[0]+ux*(s+ww),P0[1]+uy*(s+ww),z],[0,0,-dd],kind<8?ATLAS.garment(kind):ATLAS.extra(kind-8),kind<8?pick(DYES,rnd()):[.8,.8,.8],rnd()*6.3,.05+rnd()*.06,2);S.garments++;
    s+=ww+.05+rnd()*.25;
   }
   G.bar(P0,P1,.012,[.55,.55,.55]);S.lines++;
  };
  const FLAG_W=[.38,.2,.14,.14,.07,.07];
  const flagKind=r=>{for(let k=0;k<FLAG_W.length;k++)if((r-=FLAG_W[k])<=0)return k;return 0;};
  const SHEETS=[[1,1,1],[1,.97,.9],[1,.95,.78],[.9,.94,1],[.96,1,.92]];
  // The banners' lines dealt in turn (from a seeded start), so two neighbours seldom carry the same joke.
  const deal={faixa:Math.floor(random(41)()*FAIXAS.length),lencol:Math.floor(random(43)()*LENCOIS.length)};

  // --- The balconies (the round-1 slabs, desktop only): plants, ferns, people at the rail, flags and banners over it,
  // towels drying on it, washing inside.
  for(const b of list){
   if(!b.balconyItems||b.gap>450)continue;
   const rnd=random(Math.floor(b.seed*7.3e8)^0x2c1b3c6d),w=Math.max(0,1-b.gap/450),G=geos[b.cx>0?0:1];
   for(const it of b.balconyItems){
    const f=it.run.facade,e=it.e,nx=e.ty,ny=-e.tx,hd=Math.atan2(ny,nx),len=it.a1-it.a0,mid=(it.a0+it.a1)/2;
    const v=f?viewAt(f,mid):null,sees=v&&it.z+1.5>v.zMin,above=it.z-b.zr+2*b.fh<=b.H+.3;
    const at=(s,d,z)=>[e.a[0]+e.tx*(s-e.along)+nx*d,e.a[1]+e.ty*(s-e.along)+ny*d,z];
    let s0=it.a0+.15,s1=it.a1-.15;
    if(len>1.4&&rnd()<.24*w*share){const two=len>2.4&&rnd()<.4;plant(G,at(it.a0+.36,it.depth-.32,it.z),rnd);s0=it.a0+.7;if(two){plant(G,at(it.a1-.36,it.depth-.32,it.z),rnd);s1=it.a1-.7;}}
    if(above&&rnd()<.13*w*share)fern(G,at(it.a0+.3+rnd()*(len-.6),it.depth-.28,it.z+b.fh-.15),rnd);
    const low=it.z-b.zr<16?1.3:1;
    if(sees&&s1-s0>.5&&rnd()<share*(.28+.5*v.score)*low){
     const room=s1-s0,slots=Math.max(1,Math.floor(room/.62)),k=Math.min(slots,1+Math.floor(Math.pow(rnd(),1.6)*4));
     for(const sl of shuffle([...Array(slots).keys()],rnd).slice(0,k)){
      const s=s0+(sl+.5)*room/slots+(rnd()-.5)*.1,r=rnd(),pose=r<.42?0:r<.55?1:r<.72?2:r<.9?3:7,reach=[.42,.32,.5,.55,0,0,0,.45][pose];
      const P=at(s,Math.max(.3,it.depth-reach),it.z),bay=Math.max(0,Math.floor((s-it.pier)/it.bw));
      person(P[0],P[1],P[2],hd+wrap(v.h-hd)*.3+(rnd()-.5)*.4,pose,rnd,lampOn(bay,it.fi,f.rs)?1:0,pose<2?.97+rnd()*.06:undefined);S.balconyPeople++;if(it.fi<4)mark('balcony',P[0],P[1],P[2],hd);
     }
    }
    let onRail=false;
    if(v&&len>1.1&&rnd()<share*.28*v.score*low){
     onRail=true;const zr=it.z+1.12,d=it.depth+.035,ink=rnd();
     if(len>2.4&&ink<.45){
      const sheet=len<3.1||rnd()<.45,k=sheet?deal.lencol++%LENCOIS.length:deal.faixa++%FAIXAS.length,fw=sheet?Math.min(len-.2,1.6+rnd()*.5):Math.min(len-.2,2.6+rnd()*1.1),fh=sheet?fw*(.95+rnd()*.1):fw*.22;
      const c0=mid-fw/2+(rnd()-.5)*(len-fw-.2);G.cloth(at(c0,d,zr),at(c0+fw,d,zr),[0,0,-fh],sheet?ATLAS.lencol(k):ATLAS.faixa(k),pick(SHEETS,rnd()),rnd()*6.3,.07,4);S.banners++;mark('banner',...at(mid,d,zr),hd);
     }else{
      const fw=Math.min(len-.3,.9+rnd()*.55),c0=mid-fw/2+(rnd()-.5)*(len-fw-.3);G.cloth(at(c0,d,zr),at(c0+fw,d,zr),[0,0,-fw*.7],ATLAS.flag(flagKind(rnd())),[1,1,1],rnd()*6.3,.1,3);S.flags++;
     }
    }
    if(!onRail&&len>1&&rnd()<.07*w*share){
     // A towel or a rug over the rail: hanging outside, and a shorter fold inside.
     const r=rnd(),rect=r<.4?ATLAS.beach:r<.9?ATLAS.garment(7):ATLAS.extra(2),c=r<.4||r>=.9?[.85,.85,.85]:pick(TOWELS,rnd()),tw=.55+rnd()*.4,c0=it.a0+.2+rnd()*(len-tw-.4),zr=it.z+1.13;
     G.cloth(at(c0,it.depth+.035,zr),at(c0+tw,it.depth+.035,zr),[0,0,-.45-rnd()*.25],rect,c,rnd()*6.3,.04,2);G.cloth(at(c0,it.depth-.035,zr),at(c0+tw,it.depth-.035,zr),[0,0,-.3],rect,c,rnd()*6.3,.01,1);S.towels++;
    }
    if(len>1.2&&rnd()<.05*w*share){const z=Math.min(it.z+1.95,it.z+b.fh-.3);washing(G,at(it.a0+.12,.35,z),at(it.a1-.12,.35,z),rnd,z-it.z-1.15);}
    if(rnd()<.02*w*share)dish(G,at(it.a1-.25,it.depth-.12,it.z+1.12),rnd,.05);
   }
  }

  // --- Windows: someone leaning out of a few of those that see the race (two a facade at most: the shader opens them),
  // a flag hung from a sill, washing on a rack under a window, here and there.
  for(const f of facades){
   const {b,run,L,pier,nb,mask}=f,st=b.style;if(b.gap>450)continue;
   const vs=viewsOf(f),any=vs.some(Boolean),w=Math.max(0,1-b.gap/450);if(!any&&w<.05)continue;if(any)S.viewFacades++;
   const rnd=random(Math.floor(f32(f.rs)*1e9)^0x6b43a9b5),bw=(L-2*pier)/nb,G=geos[b.cx>0?0:1];
   const sd=f32(b.seed),s1=fr(f32(sd*13.7)),s2=fr(f32(sd*29.3));
   const win=st===TOWER?{w:bw*(.3+.14*s1),b:.9+.15*s2}:st===COLONIAL?{w:Math.min(.62,bw*.3),b:s2<.55?1.05:.85,iron:s2<.55}:{w:bw*(.22+.1*s1),b:.95+.12*s2};
   const open=[];
   for(let j=0;j<nb&&j<63;j++){
    if(mask>>j&1)continue;const s=pier+(j+.5)*bw,q=runAt(run,s);if(q.e.party)continue;const v=any?viewAt(f,s):null,hd=Math.atan2(q.ny,q.nx);
    for(let fi=0;fi<31;fi++){
     const fb=q.e.yw+b.gh+fi*b.fh;if(fb+b.fh>b.H+.3)break;
     const sill=b.zr+fb+win.b;
     const near=fb<10?1.6:1;
     if(v&&sill+.6>v.zMin&&open.length<2&&rnd()<share*v.score*near*(st===TOWER?.06:.16)){
      open.push(j+1+64*(fi+1));const sc=.95+rnd()*.08;
      person(q.x-q.nx*.05,q.y-q.ny*.05,sill-.95*sc,hd+(rnd()-.5)*.35,5,rnd,rnd()<.6?1:0,sc);S.windowPeople++;mark('window',q.x,q.y,sill,hd);
      // The ledge they lean on (the iron rail's bar on a sobrado's balcony door).
      G.stamp(T.box,q.x+q.nx*(win.iron?.04:.15),q.y+q.ny*(win.iron?.04:.15),sill-.06,hd,[win.iron?.08:.32,Math.min(win.w*2+.12,1.6),.06],win.iron?[.03,.03,.03]:tint([.62,.6,.56],.9+rnd()*.15));S.sills++;
     }else if(v&&rnd()<share*v.score*near*.05){
      const fw=Math.min(win.w*2,1.25)*(.8+rnd()*.2);G.cloth([q.x+q.nx*.04-q.ny*fw/2,q.y+q.ny*.04+q.nx*fw/2,sill-.03],[q.x+q.nx*.04+q.ny*fw/2,q.y+q.ny*.04-q.nx*fw/2,sill-.03],[0,0,-fw*.7],ATLAS.flag(flagKind(rnd())),[1,1,1],rnd()*6.3,.035,3);S.flags++;
     }else if(st!==COLONIAL&&rnd()<.012*w*share){
      const rw=Math.min(win.w*2,1.3),z=sill-.08,P0=[q.x+q.nx*.32-q.ny*rw/2,q.y+q.ny*.32+q.nx*rw/2,z],P1=[q.x+q.nx*.32+q.ny*rw/2,q.y+q.ny*.32-q.nx*rw/2,z];
      for(const P of [P0,P1])G.bar([P[0]-q.nx*.32,P[1]-q.ny*.32,z],P,.02,[.5,.5,.5]);washing(G,P0,P1,rnd,.75);
     }
    }
   }
   if(open.length){const code=open[0]+2048*(open[1]??0);for(const e of run)if(e.gid!=null)groups.data.a[e.gid*16+15]=code;S.openWindows+=open.length;}
   // A neon blade sign over a shop now and then (never out over the road).
   const info=run[0].run;
   if(!simple&&info?.shops&&b.gap<350&&rnd()<.14*share){
    const sw=(L-2*pier)/Math.max(1,info.ns),s=info.ns>1?pier+sw*(1+Math.floor(rnd()*(info.ns-1))):pier+sw*(rnd()<.5?.15:.85),q=runAt(run,s),hd=Math.atan2(q.ny,q.nx);
    if(!q.e.party&&(!map||map.at(q.x+q.nx*1.1,q.y+q.ny*1.1).road>.5)){
     const z1=b.zr+q.e.yw+b.gh+2.5,k=Math.floor(rnd()*BLADES.length),rect=ATLAS.blade(k),tx=-q.ny,ty=q.nx;
     G.stamp(T.box,q.x+q.nx*.45,q.y+q.ny*.45,z1-2.18,hd,[.82,.08,2.18],[.06,.06,.065]);
     for(const sg of [1,-1]){const o=.045*sg;G.cloth([q.x+q.nx*.08+tx*o,q.y+q.ny*.08+ty*o,z1-.04],[q.x+q.nx*.84+tx*o,q.y+q.ny*.84+ty*o,z1-.04],[0,0,-2.1],sg>0?rect:[rect[2],rect[1],rect[0],rect[3]],[1,1,1],0,0,1,4.5);}
     S.neonSigns++;mark('sign',q.x,q.y,z1,hd);
    }
   }
  }

  // --- Roofs. Flat ones (the lajes of the houses and the low blocks, the towers' roofs): washing lines, dishes and
  // aerials everywhere; where the race is in sight, friends with chairs, a parasol, the grill and the cooler. Tiled
  // roofs: an aerial on the ridge. And a washing line in some houses' yards.
  const edgeNear=(p,x,y)=>{let best={d:Infinity,nx:0,ny:0};for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;let u=((x-a[0])*dx+(y-a[1])*dy)/(l*l);u=u<0?0:u>1?1:u;const d=Math.hypot(x-a[0]-u*dx,y-a[1]-u*dy);if(d<best.d)best={d,nx:dy/l,ny:-dx/l};}return best;};
  for(const b of list){
   if(b.gap>450||b.canopy||b.style===SHED||b.style===CHURCH)continue;
   const w=1-b.gap/450,rnd=random(Math.floor(b.seed*5.1e8)^0x7f4a7c15),G=geos[b.cx>0?0:1],{ux,uy}=b.box;
   if(b.roof==='flat'&&b.style!==OFFICE){
    const z=b.zr+b.H+(simple?b.par:0),taken=b.roofProps??[],spots=[];
    for(let u=-b.box.a+.5;u<b.box.a;u+=.8)for(let v=-b.box.b+.5;v<b.box.b;v+=.8){
     const x=b.box.cx+ux*u-uy*v,y=b.box.cy+uy*u+ux*v;if(!insideRing(b.ring,x,y))continue;const E=edgeNear(b.ring,x,y);
     if(E.d<.6||taken.some(q=>Math.hypot(q.x-x,q.y-y)<q.r+.25))continue;spots.push({x,y,ed:E.d,nx:E.nx,ny:E.ny});
    }
    if(spots.length<4)continue;
    const used=[],free=(q,r)=>used.every(o=>Math.hypot(o.x-q.x,o.y-q.y)>o.r+r),take=(q,r)=>used.push({x:q.x,y:q.y,r});
    const v=roofView(b),tower=b.style===TOWER;
    if(v&&z+1.6>v.zMin&&rnd()<share*(tower?.2:.6)*v.score){
     // The party, facing the race: people along the edge toward it, a table with chairs behind them.
     const dx=Math.cos(v.h),dy=Math.sin(v.h),front=spots.filter(q=>q.ed<1.4&&q.nx*dx+q.ny*dy>.3).sort((p,q)=>(q.x*dx+q.y*dy)-(p.x*dx+p.y*dy));
     const lights=rnd()<.35,n=2+Math.floor(rnd()*(tower?3:5));let placed=0;mark('party',b.cx,b.cy,z,v.h);
     for(const q of front){if(placed>=n)break;if(!free(q,.34))continue;take(q,.34);const r=rnd(),pose=tower?(r<.45?2:r<.75?1:7):(r<.3?1:r<.55?2:r<.82?3:7),hq=Math.atan2(q.ny,q.nx);
      // (one in six on a house's laje a child, jumping or waving)
      const kid=!tower&&rnd()<.17;person(q.x,q.y,z,hq+wrap(v.h-hq)*.5+(rnd()-.5)*.3,kid?(r<.5?7:1):pose,rnd,lights?1:0,kid?.6+rnd()*.15:undefined);placed++;S.roofPeople++;}
     if(placed&&!tower){
      const inner=shuffle(spots.filter(q=>q.ed>1.1&&free(q,.9)),rnd);
      const tq=inner[0];
      if(tq){
       take(tq,.9);const tc=pick(PLASTIC,rnd());G.stamp(T.drum,tq.x,tq.y,z+.68,0,[.4,.4,.035],tc);for(let k=0;k<4;k++){const a=k*Math.PI/2+.4;G.bar([tq.x+Math.cos(a)*.3,tq.y+Math.sin(a)*.3,z],[tq.x+Math.cos(a)*.3,tq.y+Math.sin(a)*.3,z+.68],.03,tc);}S.tables++;
       const chairs=2+Math.floor(rnd()*3),cc=pick(PLASTIC,rnd());
       for(let k=0;k<chairs;k++){
        const a=v.h+Math.PI+(k-(chairs-1)/2)*1.1+(rnd()-.5)*.3,cx=tq.x+Math.cos(a)*.75,cy=tq.y+Math.sin(a)*.75;if(!insideRing(b.ring,cx,cy)||edgeNear(b.ring,cx,cy).d<.5)continue;
        const face=Math.atan2(tq.y-cy,tq.x-cx)+(rnd()-.5)*.6,fx=Math.cos(face),fy=Math.sin(face);
        G.stamp(T.box,cx,cy,z+.42,face,[.42,.42,.04],cc);G.stamp(T.box,cx-fx*.2,cy-fy*.2,z+.42,face,[.04,.42,.45],cc);
        for(const [p,q2] of [[.18,.18],[.18,-.18],[-.18,.18],[-.18,-.18]])G.bar([cx+fx*p-fy*q2,cy+fy*p+fx*q2,z],[cx+fx*p-fy*q2,cy+fy*p+fx*q2,z+.42],.025,cc);
        S.chairs++;if(rnd()<.55){person(cx-fx*.08,cy-fy*.08,z,face,rnd()<.7?4:8,rnd,lights?1:0);S.roofPeople++;}
       }
       if(rnd()<.55){
        // The parasol: its pole through the table, the canopy in panels of two colours.
        const top=z+2.1+rnd()*.3,R=1.1+rnd()*.3,c1=pick([[.62,.08,.06],[.08,.2,.5],[.7,.55,.06],[.05,.32,.12],[.7,.7,.68]],rnd()),c2=[.72,.72,.7];G.bar([tq.x,tq.y,z],[tq.x,tq.y,top+.15],.04,[.5,.5,.5]);
        for(let k=0;k<8;k++){const a0=k*Math.PI/4,a1=a0+Math.PI/4,c=k%2?c1:c2,A0=[tq.x+Math.cos(a0)*R,tq.y+Math.sin(a0)*R,top-.38],A1=[tq.x+Math.cos(a1)*R,tq.y+Math.sin(a1)*R,top-.38];
         const i0=G.v(tq.x,tq.y,top,0,0,1,...ATLAS.white.slice(0,2),c,0,0,0,0),i1=G.v(...A0,0,0,1,...ATLAS.white.slice(0,2),c,0,0,0,0),i2=G.v(...A1,0,0,1,...ATLAS.white.slice(0,2),c,0,0,0,0);G.idx.p3(i0,i1,i2);}
        S.parasols++;
       }
      }
      // The grill (coals that glow after dark) and someone minding it; the cooler.
      const gq=shuffle(spots.filter(q=>q.ed>.7&&q.ed<1.6&&free(q,.6)),rnd)[0];
      if(gq&&rnd()<.5){take(gq,.6);const gh=Math.atan2(gq.ny,gq.nx);G.stamp(T.box,gq.x,gq.y,z+.62,gh+Math.PI/2,[.62,.34,.2],[.05,.05,.05]);G.stamp(T.box,gq.x,gq.y,z+.8,gh+Math.PI/2,[.56,.28,.025],[.55,.16,.04],0,1.6);
       for(const [p,q2] of [[.26,.13],[.26,-.13],[-.26,.13],[-.26,-.13]])G.bar([gq.x+Math.cos(gh+Math.PI/2)*p-Math.sin(gh+Math.PI/2)*q2,gq.y+Math.sin(gh+Math.PI/2)*p+Math.cos(gh+Math.PI/2)*q2,z],[gq.x+Math.cos(gh+Math.PI/2)*p-Math.sin(gh+Math.PI/2)*q2,gq.y+Math.sin(gh+Math.PI/2)*p+Math.cos(gh+Math.PI/2)*q2,z+.62],.025,[.08,.08,.08]);
       const px=gq.x-gq.nx*.55,py=gq.y-gq.ny*.55;if(insideRing(b.ring,px,py)){person(px,py,z,gh,6,rnd,lights?1:0);S.roofPeople++;}S.grills++;}
      const cq=shuffle(spots.filter(q=>free(q,.4)),rnd)[0];
      if(cq&&rnd()<.7){take(cq,.4);const h=rnd()*6,c=pick([[.75,.75,.73],[.6,.08,.06],[.08,.22,.5]],rnd());G.stamp(T.box,cq.x,cq.y,z,h,[.55,.36,.32],c);G.stamp(T.box,cq.x,cq.y,z+.32,h,[.57,.38,.06],tint(c,1.1));S.coolers++;}
      if(lights&&front.length>1){
       // Party lights: a string of bulbs from a pole by the table across to the front edge.
       const A=tq??front[front.length-1],B=front[0],zt=z+2.3;G.bar([A.x,A.y,z],[A.x,A.y,zt],.03,[.3,.3,.3]);G.bar([B.x,B.y,z],[B.x,B.y,zt],.03,[.3,.3,.3]);
       const L2=Math.hypot(B.x-A.x,B.y-A.y);G.bar([A.x,A.y,zt],[B.x,B.y,zt],.01,[.2,.2,.2]);
       for(let s=.3;s<L2-.2;s+=.45){const u=s/L2,sag=.25*Math.sin(Math.PI*u);G.stamp(T.box,A.x+(B.x-A.x)*u,A.y+(B.y-A.y)*u,zt-sag-.07,0,[.06,.06,.08],pick([[1,.75,.4],[1,.4,.3],[.5,.8,1],[.6,1,.5],[1,.9,.5]],rnd()),0,3);}
       S.partyLights++;
      }
      if(rnd()<.3){const q=front[front.length-1],top=z+2.6;G.bar([q.x,q.y,z],[q.x,q.y,top],.035,[.55,.5,.4]);G.cloth([q.x,q.y,top],[q.x,q.y,top-.63],[-.62,-.62,-.12],ATLAS.flag(flagKind(rnd())),[1,1,1],rnd()*6.3,.12,3,0,true);S.flags++;}
     }
    }
    // Everyday: a washing line across the laje, a dish, an aerial.
    if(!tower&&rnd()<.3*w*share){
     const P0=shuffle(spots.filter(q=>q.ed>.8&&free(q,.3)),rnd)[0];
     if(P0){const Lw=2.5+rnd()*2,sg=rnd()<.5?1:-1,x1=P0.x+ux*Lw*sg,y1=P0.y+uy*Lw*sg;
      if(insideRing(b.ring,x1,y1)&&edgeNear(b.ring,x1,y1).d>.5){const zl=z+1.75;G.bar([P0.x,P0.y,z],[P0.x,P0.y,zl+.05],.04,[.45,.45,.45]);G.bar([x1,y1,z],[x1,y1,zl+.05],.04,[.45,.45,.45]);washing(G,[P0.x,P0.y,zl],[x1,y1,zl],rnd,1.2);take(P0,.3);}}
    }
    if(rnd()<.22*w*share){const q=shuffle(spots.filter(q=>q.ed<1.1&&free(q,.4)),rnd)[0];if(q){dish(G,[q.x,q.y,z],rnd,tower?.4:.6);take(q,.4);}}
    if(rnd()<(tower?.25:.12)*w*share){const q=shuffle(spots.filter(q=>free(q,.3)),rnd)[0];if(q)aerial(G,[q.x,q.y,z],rnd,2+rnd()*2.5);}
   }else if((b.roof==='hip'||b.roof==='gable')&&b.ridgeZ){
    if(rnd()<.32*w*share)aerial(G,[b.box.cx+ux*(rnd()-.5)*b.box.a,b.box.cy+uy*(rnd()-.5)*b.box.a,b.ridgeZ-.15],rnd,1.8+rnd()*1.6);
    if(rnd()<.1*w*share){const e=b.box,P=[e.cx-uy*(e.b+.05),e.cy+ux*(e.b+.05),b.zr+b.H-.6];dish(G,P,rnd,.25);}
   }
   // A washing line in the yard of a house: off a wall that faces no street, where the ground is the lot's.
   if((b.style===HOUSE||b.style===SHOPS)&&map&&rnd()<.2*w*share){
    for(const f of shuffle([...(b.facadeList??[])],rnd)){
     if(f.front)continue;const q=runAt(f.run,f.L/2);if(q.e.party)continue;
     const out=1.7+rnd()*.6,half=Math.min(f.L*.4,2.3),tx=-q.ny,ty=q.nx,cx=q.x+q.nx*out,cy=q.y+q.ny*out;
     const ok=[-half,0,half].every(s=>{const x=cx+tx*s,y=cy+ty*s;return map.surface(x,y)==='lot'&&buildingAt(x,y,-1)<0&&buildingAt(x+q.nx*.8,y+q.ny*.8,-1)<0;});
     if(!ok)continue;
     const z0=groundAt(cx-tx*half,cy-ty*half),z1=groundAt(cx+tx*half,cy+ty*half);
     G.bar([cx-tx*half,cy-ty*half,z0],[cx-tx*half,cy-ty*half,z0+1.85],.05,[.4,.36,.3]);G.bar([cx+tx*half,cy+ty*half,z1],[cx+tx*half,cy+ty*half,z1+1.85],.05,[.4,.36,.3]);
     washing(G,[cx-tx*half,cy-ty*half,z0+1.8],[cx+tx*half,cy+ty*half,z1+1.8],rnd,1.1);S.yardLines++;break;
    }
   }
  }
  return {stats:S,people,geos};
 }
}
