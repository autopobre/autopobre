// Arena de Drift, the stadium round the floor (drift-arena.js ARENA), built from the floor's outline at load time: the
// concrete wall right at the floor's edge with its sponsor banners and the catch fence over it, the apron behind it, the
// bowl of 24 rows (aisles, vomitories, a vehicle tunnel under each end), the concourse and back wall, the white roof ring
// on cantilever girders with the floodlight truss along its inner edge, two video screens hung from it, TV platforms, a
// commentary box, flags, a few service vehicles, and outside the car park, the grass and a far horizon. Game art, not a
// real venue; the sponsors are the game's own jokes (sponsors.js), the 99's partners only as their exact logos.
// Plan frame as the track files (x east, y north); the scene: (x, height, -y). o: metres out from the floor's edge.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {ARENA,floorEdge} from './drift-arena.js';
import {FLOOR_Y} from './drift-arena-props.js';
import {structureMaterial} from './landscape.js';
import {canvasTexture} from './pit-textures.js';
import {circuitSponsors,paintBanner,paintBannerAlt,paintBoard,paintWelcome} from './sponsors.js';
import {SUN_DIRECTION} from './sky.js';

const {halfLength:A,halfWidth:B,corner:R,wallHeight:WALL_H,wallThick:WALL_T,fence:FENCE_H}=ARENA;
const CX=A-R,CY=B-R,QUARTER=R*Math.PI/2;
// The section through the stands (metres out from the floor's edge, heights over it): the apron the marshals walk, the
// podium wall with the boards, 24 rows of 85 cm treads and 42 cm risers, the top concourse and the back wall; the roof
// from 12 m to 31 m out, 24 m high at its inner edge, 21 m at the eaves; vomitories cut rows 9-14, the vehicle tunnels
// rows 0-8.
export const STADIUM=Object.freeze({apron:3.5,podium:3.2,parapet:.25,rows:24,tread:.85,rise:.42,firstRow:2.2,concourse:3,rearWall:3.2,facade:.3,
 roofIn:12,roofOut:31,roofHighIn:24,roofHighOut:21,column:28.1,girders:56,
 vom:{from:9,to:15,height:2.4,width:3.6,depth:5},tunnel:{to:9,height:5,width:8},
 screen:{width:15,height:8.44,o:12.9,top:21.4,tilt:.12},lamps:18,lampStrength:650,lampEdge:Math.cos(.98)});
const S=STADIUM,ROW0=S.apron+S.parapet;
const rowO=k=>ROW0+k*S.tread,rowH=k=>k<0?0:S.firstRow+k*S.rise;
const TOP_H=rowH(S.rows-1)+S.rise,CONC_O=rowO(S.rows),REAR_O=CONC_O+S.concourse,REAR_H=TOP_H+S.rearWall,FACADE_O=REAR_O+S.facade;
const roofH=o=>S.roofHighIn+(S.roofHighOut-S.roofHighIn)*(o-S.roofIn)/(S.roofOut-S.roofIn);

// --- The outline, by s: metres along the floor's edge, counter-clockwise from the middle of the east end.
const SEGS=[];{let s=0;const L=(len,x,y,tx,ty,nx,ny,th)=>{SEGS.push({arc:false,s0:s,len,x,y,tx,ty,nx,ny,th});s+=len;},C=(cx,cy,a0)=>{SEGS.push({arc:true,s0:s,len:QUARTER,cx,cy,a0,th:a0});s+=QUARTER;};
 L(CY,A,0,0,1,1,0,0);C(CX,CY,0);L(2*CX,CX,B,-1,0,0,1,Math.PI/2);C(-CX,CY,Math.PI/2);L(2*CY,-A,CY,0,-1,-1,0,Math.PI);C(-CX,-CY,Math.PI);L(2*CX,-CX,-B,1,0,0,-1,Math.PI*1.5);C(CX,-CY,Math.PI*1.5);L(CY,A,-CY,0,1,1,0,Math.PI*2);}
const PERIM=SEGS.at(-1).s0+SEGS.at(-1).len,WEST=SEGS[4].s0+SEGS[4].len/2;
const wrapS=s=>((s%PERIM)+PERIM)%PERIM;
function segAt(s){for(let i=SEGS.length-1;i>0;i--)if(s>=SEGS[i].s0)return SEGS[i];return SEGS[0];}
// The point `o` metres out from the edge at s (plan), the outward normal, the tangent (counter-clockwise) and the angle
// turned since s = 0.
function at(s,o=0){
 s=wrapS(s);const g=segAt(s),t=s-g.s0;let x,y,nx,ny,th;
 if(g.arc){const a=g.a0+t/R;nx=Math.cos(a);ny=Math.sin(a);x=g.cx+nx*(R+o);y=g.cy+ny*(R+o);th=a;}
 else{nx=g.nx;ny=g.ny;x=g.x+g.tx*t+nx*o;y=g.y+g.ty*t+ny*o;th=g.th;}
 return {x,y,nx,ny,tx:-ny,ty:nx,th,arc:g.arc};
}
// Length along the line `o` metres out (its own metres) at s, and back.
const lineLength=o=>PERIM+2*Math.PI*o;
const lenAt=(s,o)=>{s=wrapS(s);return s+o*at(s).th;};
// The same, unwrapped: s below 0 or past PERIM gives lengths below 0 or past the line's length.
const lenUn=(s,o)=>{const k=Math.floor(s/PERIM),w=s-k*PERIM;return w+o*at(w).th+k*lineLength(o);};
function sOf(l,o){const total=lineLength(o);l=((l%total)+total)%total;for(let i=SEGS.length-1;i>=0;i--){const g=SEGS[i],l0=g.s0+o*g.th;if(l>=l0||i===0)return g.arc?g.s0+(l-l0)/(1+o/R):g.s0+(l-l0);}return 0;}
// Stations round the outline (ascending s, s = PERIM left out): straights every `step` metres, quarter arcs in `arcs`.
function stations(step,arcs){const list=[];for(const g of SEGS){const n=g.arc?arcs:Math.max(1,Math.round(g.len/step));for(let k=0;k<n;k++)list.push(g.s0+g.len*k/n);}return list;}
// The stations strictly between a and b (b may run past PERIM, a may be negative), with a and b themselves.
function span(list,a,b){const out=[a];for(let k=Math.floor(a/PERIM);k*PERIM<b;k++)for(const v of list){const w=v+k*PERIM;if(w>a+1e-6&&w<b-1e-6)out.push(w);}out.push(b);return out;}
// What is left of the loop once the cuts ([a, b] in s) are taken out.
function freeRanges(cuts){
 if(!cuts.length)return [[0,PERIM]];
 const cs=cuts.map(([a,b])=>{const w=wrapS(a);return [w,w+(b-a)];}).sort((u,v)=>u[0]-v[0]),out=[];
 for(let i=0;i<cs.length;i++){const end=cs[i][1],next=i+1<cs.length?cs[i+1][0]:cs[0][0]+PERIM;if(next>end+1e-6)out.push([end,next]);}
 return out;
}
const P3=(p,h)=>[p.x,h,-p.y];

// --- Small vector helpers on [x, y, z] arrays, and a mesh builder (positions, normals, colours, uvs, extra attributes).
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],mul=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.hypot(a[0],a[1],a[2]),unit=a=>{const l=len(a)||1;return [a[0]/l,a[1]/l,a[2]/l];},neg=a=>[-a[0],-a[1],-a[2]];
const UP=[0,1,0];
class Mesher{
 constructor(extra={}){this.pos=[];this.nor=[];this.col=[];this.uv=[];this.idx=[];this.extra=Object.entries(extra).map(([name,size])=>({name,size,data:[]}));}
 vertex(p,n,c,uv,ex){this.pos.push(p[0],p[1],p[2]);this.nor.push(n[0],n[1],n[2]);this.col.push(c[0],c[1],c[2]);this.uv.push(uv?.[0]??0,uv?.[1]??0);for(const e of this.extra){const v=ex?.[e.name];for(let j=0;j<e.size;j++)e.data.push(v?.[j]??0);}return this.pos.length/3-1;}
 tri(a,b,c){this.idx.push(a,b,c);}
 // A quad (corners in order round it), its winding turned to face n.
 quad(p,n,c,uvs=null,ex=null){
  const s=dot(cross(sub(p[1],p[0]),sub(p[2],p[0])),n)+dot(cross(sub(p[2],p[0]),sub(p[3],p[0])),n);if(s===0)return;
  const v=p.map((q,i)=>this.vertex(q,n,c,uvs?.[i],Array.isArray(ex)?ex[i]:ex));
  if(s>0){this.tri(v[0],v[1],v[2]);this.tri(v[0],v[2],v[3]);}else{this.tri(v[0],v[2],v[1]);this.tri(v[0],v[3],v[2]);}
 }
 // A box round c on the axes ax, ay, az (unit), half sizes h; skip: faces left out ('-y' ...).
 box(c,ax,ay,az,hx,hy,hz,col,skip=''){
  const P=(i,j,k)=>[0,1,2].map(d=>c[d]+ax[d]*i*hx+ay[d]*j*hy+az[d]*k*hz);
  const F=[['+x',ax,[[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]]],['-x',neg(ax),[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]]],['+y',ay,[[-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]]],
   ['-y',neg(ay),[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]],['+z',az,[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]],['-z',neg(az),[[-1,-1,-1],[-1,1,-1],[1,1,-1],[1,-1,-1]]]];
  for(const [name,n,cs] of F)if(!skip.includes(name))this.quad(cs.map(q=>P(...q)),n,col);
 }
 // A box from p0 to p1, w wide and h deep (h along `up` turned square to the beam).
 beam(p0,p1,w,h,col,up=UP,skip=''){const d=sub(p1,p0),L=len(d);if(L<1e-4)return;const ax=mul(d,1/L);let az=cross(ax,up);if(len(az)<1e-5)az=cross(ax,[1,0,0]);az=unit(az);const ay=cross(az,ax);this.box(mul(add(p0,p1),.5),ax,ay,az,L/2,h/2,w/2,col,skip);}
 // Eight corners (bit 1: +x, 2: +y, 4: +z); faces turned outwards.
 hexa(c,col){const ctr=c.reduce(add,[0,0,0]).map(v=>v/8);for(const f of [[0,2,6,4],[1,5,7,3],[0,4,5,1],[2,3,7,6],[0,1,3,2],[4,6,7,5]]){const p=f.map(i=>c[i]);let n=unit(cross(sub(p[2],p[0]),sub(p[3],p[1])));const fc=p.reduce(add,[0,0,0]).map(v=>v/4);if(dot(n,sub(fc,ctr))<0)n=neg(n);this.quad(p,n,col);}}
 // A flat polygon facing n.
 polygon(pts,n,col){
  const u=unit(sub(pts[1],pts[0])),w=cross(n,u),flat=pts.map(p=>new THREE.Vector2(dot(sub(p,pts[0]),u),dot(sub(p,pts[0]),w)));
  const tris=THREE.ShapeUtils.triangulateShape(flat,[]),base=pts.map(p=>this.vertex(p,n,col));
  for(const [a,b,c] of tris){if(dot(cross(sub(pts[b],pts[a]),sub(pts[c],pts[a])),n)>=0)this.tri(base[a],base[b],base[c]);else this.tri(base[a],base[c],base[b]);}
 }
 // An n-sided prism from p0 to p1 (radius r), capped.
 cylinder(p0,p1,r,sides,col,caps=true){
  const d=unit(sub(p1,p0));let u=cross(d,UP);if(len(u)<1e-4)u=cross(d,[1,0,0]);u=unit(u);const v=cross(d,u);
  const ring=k=>{const a=k/sides*Math.PI*2;return add(mul(u,Math.cos(a)*r),mul(v,Math.sin(a)*r));};
  for(let k=0;k<sides;k++){const a=ring(k),b=ring(k+1),n=unit(add(a,b));this.quad([add(p0,a),add(p0,b),add(p1,b),add(p1,a)],n,col);}
  if(caps)for(const [p,n] of [[p0,neg(d)],[p1,d]])this.polygon(Array.from({length:sides},(_,k)=>add(p,ring(k))),n,col);
 }
 // Two rows of points joined by quads, each column with its own normal (a strip swept round the outline).
 strip(rowA,rowB,normals,colA,colB=colA,uvA=null,uvB=null,exA=null,exB=null){
  const ia=rowA.map((p,i)=>this.vertex(p,normals[i],typeof colA==='function'?colA(i):colA,uvA?.[i],exA?.[i])),ib=rowB.map((p,i)=>this.vertex(p,normals[i],typeof colB==='function'?colB(i):colB,uvB?.[i],exB?.[i]));
  for(let i=0;i+1<rowA.length;i++){
   const p=[rowA[i],rowA[i+1],rowB[i+1],rowB[i]],n=add(normals[i],normals[i+1]),s=dot(cross(sub(p[1],p[0]),sub(p[2],p[0])),n)+dot(cross(sub(p[2],p[0]),sub(p[3],p[0])),n);
   if(Math.abs(s)<1e-10)continue;const q=[ia[i],ia[i+1],ib[i+1],ib[i]];
   if(s>0){this.tri(q[0],q[1],q[2]);this.tri(q[0],q[2],q[3]);}else{this.tri(q[0],q[2],q[1]);this.tri(q[0],q[3],q[2]);}
  }
 }
 // The section line (o0, h0) -> (o1, h1) swept over the stations ss; its face is on the left going up and out.
 sweep(ss,o0,h0,o1,h1,col,col1=col){
  const pl=Math.hypot(h1-h0,o1-o0)||1,po=-(h1-h0)/pl,ph=(o1-o0)/pl,a=[],b=[],n=[];
  for(const s of ss){const p=at(s,o0),q=at(s,o1);a.push(P3(p,h0));b.push(P3(q,h1));n.push([p.nx*po,ph,-p.ny*po]);}
  this.strip(a,b,n,col,col1);
 }
 get empty(){return !this.idx.length;}
 geometry(){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.nor,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(this.col,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));
  for(const e of this.extra)g.setAttribute(e.name,new THREE.Float32BufferAttribute(e.data,e.size));g.setIndex(this.idx);g.computeBoundingSphere();return g;
 }
}
const _c=new THREE.Color();
const lin=(hex,k=1)=>{_c.set(hex);return [_c.r*k,_c.g*k,_c.b*k];};
function rng(seed){let s=(seed>>>0)||1;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
const hash=(a,b=0)=>{const v=Math.sin(a*127.1+b*311.7)*43758.5453;return v-Math.floor(v);};
function noise2(x,y){const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,su=u*u*(3-2*u),sv=v*v*(3-2*v);return (hash(i,j)*(1-su)+hash(i+1,j)*su)*(1-sv)+(hash(i,j+1)*(1-su)+hash(i+1,j+1)*su)*sv;}

// --- The plan of the stands: aisles at the corners' ends and middles and in thirds of the long sides; between them
// sixteen sections, each with its vomitory but the two ends, which have the vehicle tunnels under the screens.
function standPlan(){
 const aisles=[];
 for(let i=1;i<SEGS.length;i++)aisles.push(SEGS[i].s0);
 for(const g of SEGS){if(g.arc)aisles.push(g.s0+g.len/2);else if(g.len>100)aisles.push(g.s0+g.len/3,g.s0+g.len*2/3);}
 aisles.sort((a,b)=>a-b);
 const sections=aisles.map((a,i)=>{const b=i+1<aisles.length?aisles[i+1]:aisles[0]+PERIM;return {i,a,b,mid:wrapS((a+b)/2)};});
 const tunnels=[0,WEST].map(sc=>({kind:'tunnel',sc,s0:sc-S.tunnel.width/2,s1:sc+S.tunnel.width/2,to:S.tunnel.to,floor:0,ceiling:S.tunnel.height}));
 const vomitories=[];
 for(const sec of sections){
  if(tunnels.some(t=>{const d=Math.abs(wrapS(t.sc-sec.mid+PERIM/2)-PERIM/2);return d<(sec.b-sec.a)/2;})){sec.end=true;continue;}
  const arc=at(sec.mid).arc,half=S.vom.width/2/(arc?1+14/R:1),floor=rowH(S.vom.from-1);
  vomitories.push({kind:'vom',sc:sec.mid,s0:sec.mid-half,s1:sec.mid+half,from:S.vom.from,to:S.vom.to,floor,ceiling:floor+S.vom.height,tv:true,section:sec.i});
 }
 return {aisles,sections,tunnels,vomitories,notches:[...tunnels,...vomitories]};
}
// The section's pieces: what each notch cuts (podium, treads and risers by row, the façade's foot).
function cuts(tag,notch){
 if(notch.kind==='tunnel')return tag==='podium'||tag==='facadeLow'||(tag.tread!==undefined&&tag.tread<notch.to)||(tag.riser!==undefined&&tag.riser<=notch.to);
 return (tag.tread!==undefined&&tag.tread>=notch.from&&tag.tread<notch.to)||(tag.riser!==undefined&&tag.riser>=notch.from&&tag.riser<=notch.to);
}
function bowlProfile(){
 const segs=[],add=(o0,h0,o1,h1,tag,tone)=>segs.push({o0,h0,o1,h1,tag,tone});
 add(S.apron,0,S.apron,S.podium,'podium',.78);add(S.apron,S.podium,ROW0,S.podium,'podium',1.02);add(ROW0,S.podium,ROW0,rowH(0),'podium',.86);
 for(let k=0;k<S.rows;k++){if(k>0)add(rowO(k),rowH(k-1),rowO(k),rowH(k),{riser:k},.8);add(rowO(k),rowH(k),rowO(k+1),rowH(k),{tread:k},1);}
 add(CONC_O,rowH(S.rows-1),CONC_O,TOP_H,{riser:S.rows},.8);add(CONC_O,TOP_H,REAR_O,TOP_H,'concourse',.94);
 add(REAR_O,TOP_H,REAR_O,REAR_H,'rear',.86);add(REAR_O,REAR_H,FACADE_O,REAR_H,'rear',1);
 add(FACADE_O,REAR_H,FACADE_O,S.tunnel.height,'facade',1.32);add(FACADE_O,S.tunnel.height,FACADE_O,0,'facadeLow',1.24);
 return segs;
}

// Seat colours: each section its team's plastic, laid the way stadium seats are (solid with strays, confetti, bands of
// rows, a fade up the bowl), a little faded where the sun reaches.
const SEAT_SCHEMES=[
 {pattern:'confetti',colors:[['#e0a810',6],['#1f7a3a',3],['#f2f0e8',1]]},
 {pattern:'fade',colors:[['#d9661c',1],['#e6e3da',1]]},
 {pattern:'solid',colors:[['#c27a1a',10],['#e6e3da',1]]},
 {pattern:'confetti',colors:[['#b3161d',7],['#e6e3da',2],['#1a1a1a',1]]},
 {pattern:'bands',colors:[['#b3161d',1],['#8e1418',1]]},
 {pattern:'confetti',colors:[['#b3161d',7],['#e6e3da',2],['#f0c419',1]]},
 {pattern:'solid',colors:[['#3a3d42',8],['#b3161d',1]]},
 {pattern:'fade',colors:[['#2a2c30',1],['#8d9196',1]]},
 {pattern:'confetti',colors:[['#1f7a3a',6],['#e0a810',3],['#123f22',2]]},
 {pattern:'fade',colors:[['#3d86c6',1],['#e6e3da',1]]},
 {pattern:'solid',colors:[['#3d86c6',9],['#1c3f7a',2]]},
 {pattern:'confetti',colors:[['#1c3f7a',6],['#3d86c6',3],['#e6e3da',1]]},
 {pattern:'bands',colors:[['#1c3f7a',1],['#25529c',1]]},
 {pattern:'confetti',colors:[['#1c3f7a',6],['#e6e3da',2],['#e0a810',1]]},
 {pattern:'solid',colors:[['#6b1424',9],['#b3161d',2]]},
 {pattern:'fade',colors:[['#b3161d',1],['#6b1424',1]]}
];
function seatColor(scheme,k,rand){
 const pick=list=>{let r=rand()*list.reduce((s,[,w])=>s+w,0);for(const [c,w] of list)if((r-=w)<=0)return c;return list[0][0];};
 const c=scheme.colors;
 switch(scheme.pattern){
  case 'solid':return rand()<.05?pick(SEAT_SCHEMES[Math.floor(rand()*SEAT_SCHEMES.length)].colors):c[0][0];
  case 'bands':return c[Math.floor(k/3)%2][0];
  case 'fade':{const t=k/(S.rows-1)+(rand()-.5)*.35;return t<.5?c[0][0]:c[1][0];}
  default:return pick(c);
 }
}

// --- Painted textures: the wall's banner rows (8:1) and the podium's boards (2:1).
const BANNER_ROW=[1024,112],BOARD_CELL=[384,192],BOARD_COLS=4;
const DARK='#0d0d0e',GAME_GREEN='#142a27';
function drawFit(ctx,img,x,y,w,h,fill=.86){if(!img)return;const k=Math.min(w*fill/img.width,h*fill/img.height);ctx.drawImage(img,x+(w-img.width*k)/2,y+(h-img.height*k)/2,img.width*k,img.height*k);}
// The 99's partners: each logo alone on the car's black, exactly as on the car, nothing added (track-surface.js rule).
function partnerArt(img){return (ctx,x,y,w,h)=>{ctx.fillStyle=DARK;ctx.fillRect(x,y,w,h);drawFit(ctx,img,x,y,w,h,w/h>4?.66:.78);};}
function bannerRows(sponsors,images){
 const rows=[];
 for(const s of sponsors){rows.push({id:s.id,paint:(ctx,x,y,w,h)=>paintBanner(ctx,x,y,w,h,s)});rows.push({id:s.id,paint:(ctx,x,y,w,h)=>paintBannerAlt(ctx,x,y,w,h,s)});}
 // The game's own: its logo on its dark green with the arena's name, and the name alone on its red with the chequer.
 rows.push({id:'autopobre',paint:(ctx,x,y,w,h)=>{ctx.fillStyle=GAME_GREEN;ctx.fillRect(x,y,w,h);ctx.fillStyle='#f0c419';ctx.fillRect(x,y+h*.07,w,h*.05);ctx.fillRect(x,y+h*.88,w,h*.05);drawFit(ctx,images.game,x,y,w*.34,h,.94);
  ctx.fillStyle='#f6f1e4';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${Math.round(h*.46)}px "Arial Black","Arial Bold",Arial,sans-serif`;ctx.fillText('ARENA DE DRIFT',x+w*.66,y+h*.53,w*.6);}});
 rows.push({id:'autopobre',paint:(ctx,x,y,w,h)=>{ctx.fillStyle='#b3161d';ctx.fillRect(x,y,w,h);for(let i=0;i<10;i++)for(let j=0;j<4;j++){ctx.fillStyle=(i+j)%2?'#f6f1e4':'#111';ctx.fillRect(x+i*h/4,y+j*h/4,h/4,h/4);ctx.fillRect(x+w-(i+1)*h/4,y+j*h/4,h/4,h/4);}
  ctx.fillStyle='#f0c419';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`italic 900 ${Math.round(h*.5)}px "Arial Black","Arial Bold",Arial,sans-serif`;ctx.fillText('AUTO-POBRE · DRIFT',x+w/2,y+h*.54,w*.56);}});
 for(const id of ['omp','rtj','eletric'])if(images[id])rows.push({id,paint:partnerArt(images[id])});
 return rows;
}
function boardCells(sponsors,images){
 const cells=[];
 cells.push({id:'autopobre',paint:(ctx,x,y,w,h)=>{ctx.fillStyle=GAME_GREEN;ctx.fillRect(x,y,w,h);drawFit(ctx,images.game,x,y,w,h,.9);}});
 cells.push({id:'autopobre',paint:(ctx,x,y,w,h)=>{ctx.fillStyle='#161616';ctx.fillRect(x,y,w,h);ctx.fillStyle='#b3161d';ctx.fillRect(x,y+h*.72,w,h*.28);drawFit(ctx,images.game,x,y,w,h*.74,.9);
  ctx.fillStyle='#f6f1e4';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${Math.round(h*.15)}px "Arial Black","Arial Bold",Arial,sans-serif`;ctx.fillText('ARENA DE DRIFT',x+w/2,y+h*.86,w*.9);}});
 cells.push({id:'welcome',paint:(ctx,x,y,w,h)=>paintWelcome(ctx,x,y,w,h,'ARENA DE DRIFT · AUTO-POBRE RACING')});
 for(const id of ['omp','rtj','eletric'])if(images[id])cells.push({id,paint:partnerArt(images[id])});
 // Thanks to the supporters: the door photos as they are, under the car's yellow band.
 for(const img of [images.doorDriver,images.doorPassenger])if(img)cells.push({id:'apoiadores',paint:(ctx,x,y,w,h)=>{const band=h*.17;ctx.fillStyle='#0b0b0c';ctx.fillRect(x,y,w,h);ctx.fillStyle='#f2c418';ctx.fillRect(x,y,w,band);
  ctx.fillStyle='#111111';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${Math.round(h*.1)}px "Arial Black","Arial Bold",Arial,sans-serif`;ctx.fillText('OBRIGADO, APOIADORES DO 99!',x+w/2,y+band*.54,w*.92);
  const k=Math.min(w*.96/img.width,(h-band)*.96/img.height);ctx.drawImage(img,x+(w-img.width*k)/2,y+band+(h-band-img.height*k)/2,img.width*k,img.height*k);}});
 sponsors.forEach((s,i)=>{cells.push({id:s.id,paint:(ctx,x,y,w,h)=>paintBoard(ctx,x,y,w,h,s,{seed:i*31+7})});cells.push({id:s.id,paint:(ctx,x,y,w,h)=>paintBoard(ctx,x,y,w,h,s,{seed:i*31+12})});});
 return cells;
}
// A run of artworks where the same sponsor never shows twice within `gap` pieces, nor the same artwork within `far`.
function sequence(items,count,rand,gap=5,far=14){
 const out=[];for(let n=0;n<count;n++){let best=-1;for(let tries=0;tries<60&&best<0;tries++){const k=Math.floor(rand()*items.length);if(out.slice(-gap).some(j=>items[j].id===items[k].id)||out.slice(-far).includes(k))continue;best=k;}out.push(best<0?Math.floor(rand()*items.length):best);}return out;
}
// Banners and boards: lit like the rest, each piece weathered its own way (sun bleaching, grime along the bottom); on the
// wall, rubber the cars left where they rubbed it, streaked along at bumper height.
function artMaterial(map,name,rubber){
 const material=new THREE.MeshStandardMaterial({name,map,roughness:.6,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 aArt;\nvarying vec3 vArt;').replace('#include <begin_vertex>','#include <begin_vertex>\nvArt=aArt;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vArt;
float artHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float artNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(artHash(i),artHash(i+vec2(1,0)),f.x),mix(artHash(i+vec2(0,1)),artHash(i+1.0),f.x),f.y);}`).replace('#include <map_fragment>',`#include <map_fragment>
 float artSeed=vArt.z,artX=vArt.x,artY=vArt.y;
 float artGrey=dot(diffuseColor.rgb,vec3(.3,.59,.11));
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(artGrey)*1.05+.05,(.08+.22*fract(artSeed*13.7))*(.6+.4*artNoise(vec2(artX*.4,artSeed*9.0))));
 diffuseColor.rgb*=.9+.14*fract(artSeed*7.3);
 float artDirt=(1.0-smoothstep(0.0,.18+.2*fract(artSeed*3.1),artY+.06*(artNoise(vec2(artX*2.3,artSeed*5.0))-.5)))*.55;
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.2,.18,.15),artDirt);
 float artRubber=0.0;
#if ${rubber?1:0}
 float zone=smoothstep(.52,.78,artNoise(vec2(artX*.09+artSeed*17.0,1.3)))+smoothstep(.8,.95,artNoise(vec2(artX*.6,artSeed*3.0)))*.6;
 float streak=artNoise(vec2(artX*1.1,artY*16.0+artSeed*7.0))*.55+artNoise(vec2(artX*4.0,artY*40.0))*.45;
 float band=smoothstep(.06,.2,artY)*(1.0-smoothstep(.42,.62+.12*artNoise(vec2(artX*.5,artSeed)),artY));
 artRubber=clamp(zone,0.0,1.0)*band*smoothstep(.32,.7,streak);
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.025,.024,.023),artRubber*.88);
#endif`).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor-artRubber*.2+artDirt*.2,.3,1.0);');
 };
 material.customProgramCacheKey=()=>'arena-art-v1-'+(rubber?1:0);return material;
}

// The catch fence: woven wire in 5.5 cm diamonds, drawn while a pixel resolves it, its average coverage beyond.
function fenceMaterial(){
 const material=new THREE.MeshStandardMaterial({name:'Alambrado_arena',color:0x6f7376,metalness:.6,roughness:.45,transparent:true,depthWrite:false,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 aArt;\nvarying vec2 vWire;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWire=aArt.xy;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vWire;').replace('#include <map_fragment>',`#include <map_fragment>
 vec2 dq=vec2(vWire.x+vWire.y,vWire.x-vWire.y)/.078;vec2 df=abs(fract(dq)-.5);float dist=min(df.x,df.y);
 float dpx=length(fwidth(dq));float wire=1.0-smoothstep(.05,.05+dpx,dist);
 diffuseColor.a*=mix(wire*.95,.17,smoothstep(.12,.45,dpx));`);
 };
 material.customProgramCacheKey=()=>'arena-fence-v1';return material;
}

// The floodlights' glow at night (floodlights.js's): a soft disc round each head facing the camera, added on top.
const glowVertex=`attribute vec3 lampCentre;attribute vec2 corner;uniform float glowSize;varying vec2 vCorner;
void main(){vCorner=corner;vec4 view=viewMatrix*vec4(lampCentre,1.0);float dist=length(view.xyz);view.xyz+=normalize(-view.xyz)*min(.6,dist*.3);
 view.xy+=corner*(glowSize+dist*.004);gl_Position=projectionMatrix*view;}`;
const glowFragment=`uniform vec3 glowColor;uniform float glowStrength;varying vec2 vCorner;
void main(){float r2=dot(vCorner,vCorner);if(r2>1.0)discard;gl_FragColor=vec4(glowColor*glowStrength*(exp(-r2*40.0)*6.0+exp(-r2*5.0)*.25),1.0);}`;

// The video screens: one canvas for both (they show the same feed), its LED cells drawn while a pixel resolves them.
function screenCanvas(images,mobile){
 const w=mobile?512:1024,h=Math.round(w*9/16),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;let last=null;
 const BOLD='"Arial Black","Arial Bold",Arial,sans-serif';
 const fit=(text,x,y,max,px,color)=>{ctx.font=`900 ${px}px ${BOLD}`;const m=ctx.measureText(text).width;if(m>max)ctx.font=`900 ${Math.max(10,px*max/m)}px ${BOLD}`;ctx.fillStyle=color;ctx.fillText(text,x,y);};
 function draw(lines){
  const list=(Array.isArray(lines)?lines:[lines]).slice(0,3).map(v=>String(v??'').slice(0,40)),key=list.join('\n');if(key===last)return false;last=key;
  const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#0b1a2e');g.addColorStop(1,'#050608');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#b3161d';ctx.fillRect(0,0,w,h*.17);ctx.fillStyle='#f0c419';ctx.fillRect(0,h*.17,w,h*.012);
  if(images.game){const k=h*.15/images.game.height;ctx.drawImage(images.game,w*.02,h*.01,images.game.width*k,images.game.height*k);}
  ctx.textAlign='right';ctx.textBaseline='middle';fit('AO VIVO',w*.97,h*.085,w*.3,Math.round(h*.075),'#f6f1e4');
  ctx.fillStyle='#e8312a';ctx.beginPath();ctx.arc(w*.97-ctx.measureText('AO VIVO').width-h*.05,h*.085,h*.022,0,7);ctx.fill();
  ctx.textAlign='center';
  const rows=list.filter(Boolean),sizes=[.17,.2,.13],colors=['#f0c419','#ffffff','#c9d3de'];
  const ys=rows.length===1?[.58]:rows.length===2?[.45,.72]:[.36,.6,.82];
  rows.forEach((t,i)=>fit(t,w/2,h*ys[i],w*.9,Math.round(h*sizes[Math.min(i,2)]),colors[Math.min(i,2)]));
  map.needsUpdate=true;return true;
 }
 return {map,draw};
}
function screenMaterial(map){
 const material=new THREE.MeshBasicMaterial({name:'Telao_arena',map});material.color.setScalar(1.45);
 material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
 vec2 led=vMapUv*vec2(240.0,135.0);vec2 lf=abs(fract(led)-.5);float lpx=max(fwidth(led.x),fwidth(led.y));
 float cell=1.0-smoothstep(.36,.36+max(lpx,.04),max(lf.x,lf.y));diffuseColor.rgb*=mix(.35+.75*cell,1.0,smoothstep(.35,.9,lpx));`);};
 material.customProgramCacheKey=()=>'arena-screen-v1';return material;
}

// Flags on the roof: one canvas of eight designs (the game's colours, team colours, the chequered flag), waving each on
// its own clock.
function flagAtlas(images){
 return canvasTexture((ctx,w,h)=>{
  const cw=w/4,ch=h/2,cell=i=>[(i%4)*cw,Math.floor(i/4)*ch];
  const stripes=(i,cols,vertical=false)=>{const [x,y]=cell(i);cols.forEach((c,k)=>{ctx.fillStyle=c;if(vertical)ctx.fillRect(x+k*cw/cols.length,y,cw/cols.length+1,ch);else ctx.fillRect(x,y+k*ch/cols.length,cw,ch/cols.length+1);});};
  {const [x,y]=cell(0);for(let i=0;i<6;i++)for(let j=0;j<4;j++){ctx.fillStyle=(i+j)%2?'#f4f4f0':'#111';ctx.fillRect(x+i*cw/6,y+j*ch/4,cw/6+1,ch/4+1);}}
  {const [x,y]=cell(1);ctx.fillStyle='#b3161d';ctx.fillRect(x,y,cw,ch);ctx.fillStyle='#f0c419';ctx.fillRect(x,y+ch*.82,cw,ch*.1);drawFit(ctx,images.game,x,y,cw,ch*.82,.92);}
  stripes(2,['#1f7a3a','#f0c419','#1f7a3a']);stripes(3,['#1c3f7a','#f2f0e8','#1c3f7a','#f2f0e8','#1c3f7a']);
  stripes(4,['#b3161d','#f2f0e8','#111111'],true);stripes(5,['#d9661c','#14213d']);
  {const [x,y]=cell(6);ctx.fillStyle='#f0c419';ctx.fillRect(x,y,cw,ch);ctx.fillStyle='#111';ctx.beginPath();ctx.moveTo(x,y+ch*.7);ctx.lineTo(x+cw,y+ch*.1);ctx.lineTo(x+cw,y+ch*.32);ctx.lineTo(x,y+ch*.92);ctx.fill();}
  {const [x,y]=cell(7);ctx.fillStyle=GAME_GREEN;ctx.fillRect(x,y,cw,ch);ctx.fillStyle='#f6f1e4';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${Math.round(ch*.42)}px "Arial Black",Arial,sans-serif`;ctx.fillText('99',x+cw/2,y+ch*.54,cw*.8);}
 },512,192);
}
function flagMaterial(map){
 const uniforms={flagTime:{value:0}},material=new THREE.MeshStandardMaterial({name:'Bandeiras_arena',map,roughness:.8,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{
  shader.uniforms.flagTime=uniforms.flagTime;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float flagTime;attribute vec4 aFlag;').replace('#include <begin_vertex>',`#include <begin_vertex>
 {float u=aFlag.x,t=flagTime*(2.4+.5*fract(aFlag.y*3.7))+aFlag.y*40.0;
  float wave=(sin(t-u*5.5)*.32+sin(t*1.7-u*9.0+1.3)*.12)*u;
  transformed+=vec3(aFlag.z,0.0,aFlag.w)*wave;transformed.y-=u*u*.12*(1.0+.5*sin(t*.7));}`);
 };
 material.customProgramCacheKey=()=>'arena-flags-v1';return {material,uniforms};
}

// The ground outside: a plaza of pavers round the stadium, the car park with its bays, the ring road, then grass out to
// the horizon, by world position (one draw).
function groundMaterial(textures){
 const material=new THREE.MeshStandardMaterial({name:'Chao_estadio',roughness:.9});
 material.userData.terrain=true;
 material.onBeforeCompile=shader=>{
  shader.uniforms.gGrass={value:textures.grass};shader.uniforms.gConcrete={value:textures.concrete};
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vGW;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvGW=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vGW;uniform sampler2D gGrass,gConcrete;
float gH(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float gN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(gH(i),gH(i+vec2(1,0)),f.x),mix(gH(i+vec2(0,1)),gH(i+vec2(1,1)),f.x),f.y);}
float gLine(float d,float w,float px){return (1.0-smoothstep(w*.5,w*.5+px,d))*clamp(w/max(px,1e-4),0.0,1.0);}`).replace('#include <map_fragment>',`
 vec2 gp=vec2(vGW.x,-vGW.z);vec2 gq=abs(gp)-vec2(${CX.toFixed(1)},${CY.toFixed(1)});float go=length(max(gq,0.0))+min(max(gq.x,gq.y),0.0)-${R.toFixed(1)};
 float gpx=length(fwidth(gp));
 float macro=gN(gp*.0045)*.6+gN(gp*.019)*.4;
 vec3 grassTex=mix(texture2D(gGrass,vGW.xz/5.0).rgb,texture2D(gGrass,vGW.xz/23.0+.37).rgb,.5);float grassL=dot(grassTex,vec3(.2126,.7152,.0722))/.237;
 vec3 grass=mix(vec3(.075,.13,.036),vec3(.11,.16,.05),macro)*mix(1.0,grassL,.7);
 float dry=smoothstep(.55,.82,gN(gp*.012+3.0)*.7+gN(gp*.09)*.3);grass=mix(grass,vec3(.2,.17,.085)*mix(1.0,grassL,.6),dry*.45);
 vec3 conc=texture2D(gConcrete,vGW.xz/3.2).rgb*1.65*(.9+.16*gN(gp*.25));
 vec2 pv=abs(fract(gp/vec2(1.2,.6))-.5)*vec2(1.2,.6);conc*=1.0-max(gLine(pv.x,.012,gpx),gLine(pv.y,.012,gpx))*.35;
 float an=gN(gp*.35)*.45+gN(gp*2.1)*.25+gN(gp*.045)*.3;
 vec3 asph=vec3(.088,.086,.082)*(.78+.5*an)*mix(vec3(1.0),texture2D(gConcrete,vGW.xz/2.0).rgb*2.0,.35);
 float mz=mod(vGW.z,16.0),mx=mod(vGW.x,2.5),drive=step(6.0,abs(gp.y))+step(abs(gp.x),${(A+12).toFixed(1)});
 float bayPaint=step(mz,10.0)*max(gLine(min(mx,2.5-mx),.1,gpx)*step(.3,mz)*step(mz,9.7),gLine(abs(mz-5.0),.1,gpx));
 bayPaint*=min(drive,1.0)*(.55+.45*gN(gp*1.7))*(1.0-smoothstep(.2,.6,gpx));
 vec3 park=mix(asph*(1.0-.25*step(10.0,mz)*gN(vec2(gp.x*.4,mz))),vec3(.6,.6,.56),bayPaint*.8);
 float rp=go-152.0;vec3 road=asph*.9;road=mix(road,vec3(.62,.6,.55),max(gLine(abs(abs(rp)-5.6),.15,gpx),gLine(abs(rp),.12,gpx)*step(.5,fract(gp.x*.08+gp.y*.08))*.0));
 float edgeN=(gN(gp*.05)-.5)*6.0;
 float kerb=max(gLine(abs(go-33.1),.18,gpx),max(gLine(abs(go-37.1),.18,gpx),max(gLine(abs(go-140.9),.18,gpx),gLine(abs(go-146.1),.18,gpx))));
 float wPlaza=1.0-smoothstep(33.0,33.2,go),wPark=smoothstep(36.9,37.1,go)*(1.0-smoothstep(140.9,141.1,go)),wRoad=smoothstep(145.9,146.1,go)*(1.0-smoothstep(158.0,158.6,go)),wGrass=1.0-wPlaza-wPark-wRoad;
 vec3 groundColor=conc*wPlaza+park*wPark+road*wRoad+grass*wGrass;
 groundColor=mix(groundColor,vec3(.55,.55,.52),kerb*.8);diffuseColor.rgb*=groundColor;
 float groundRough=wPlaza*.86+wPark*(.9-bayPaint*.1)+wRoad*.88+wGrass*.97;`).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=groundRough;');
 };
 material.customProgramCacheKey=()=>'arena-ground-v1';return material;
}

// The membrane: white PTFE, a little light through it seen from below.
function membraneMaterial(){
 const glow={value:new THREE.Color(.05,.048,.043)},material=new THREE.MeshStandardMaterial({name:'Cobertura_membrana',color:0xf1f0ea,roughness:.62,metalness:0,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{shader.uniforms.underGlow=glow;
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 underGlow;').replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nif(!gl_FrontFacing){totalEmissiveRadiance+=underGlow;diffuseColor.rgb*=.86;}');};
 material.customProgramCacheKey=()=>'arena-membrane-v1';return {material,glow};
}

async function loadImages(){
 const loader=new THREE.ImageLoader(),get=url=>loader.loadAsync(url).catch(()=>null);
 const [game,omp,rtj,eletric,doorDriver,doorPassenger]=await Promise.all(['./assets/abertura/logo_auto_pobre_racing_v2.webp','./assets/branding/patrocinio_omp_v1.webp','./assets/branding/patrocinio_rtj_v1.webp','./assets/branding/patrocinio_eletric_v1.webp','./assets/branding/apoiadores_porta_motorista_v1.jpg','./assets/branding/apoiadores_porta_passageiro_v1.jpg'].map(get));
 return {game,omp,rtj,eletric,doorDriver,doorPassenger};
}

// Is a point (plan x, y, height h) in the roof's shadow? Walks the ray toward the sun past the membrane.
function underRoof(x,y,h){
 const d=SUN_DIRECTION;
 for(let t=.5;t<70;t+=.7){const px=x+d.x*t,py=y-d.z*t,ph=h+d.y*t;if(ph>S.roofHighIn+1)return false;const o=floorEdge(px,py).d;if(o>=S.roofIn&&o<=S.roofOut&&Math.abs(ph-roofH(o))<.6)return true;}
 return false;
}

export async function createArenaStadium({renderer=null,roadSurface,textures,mobile=false,attendance=mobile?.34:.55}={}){
 const root=new THREE.Group();root.name='Arena_estadio';
 const rand=rng(9917),images=await loadImages(),plan=standPlan(),{notches,tunnels,vomitories,aisles,sections}=plan;
 const fine=stations(4,24),floorStations=stations(2,24),coarse=stations(24,10);
 const meshes=[],addMesh=(geometry,material,name,{cast=false,receive=true}={})=>{const m=new THREE.Mesh(geometry,material);m.name=name;m.castShadow=cast;m.receiveShadow=receive;root.add(m);meshes.push(m);return m;};

 // --- Materials.
 const structures=new Map();
 const concrete=structureMaterial(new THREE.MeshStandardMaterial({name:'Concreto',color:0x9a9890,roughness:.9,vertexColors:true}),textures,structures);
 const steel=new THREE.MeshStandardMaterial({name:'Aco_estadio',vertexColors:true,roughness:.5,metalness:.35});
 const dark=new THREE.MeshStandardMaterial({name:'Tunel_escuro',vertexColors:true,roughness:.95,color:0x2a2a2a});
 const lights=new THREE.MeshBasicMaterial({name:'Luzes_estadio',vertexColors:true});
 const glass=new THREE.MeshStandardMaterial({name:'Vidro_cabine',color:0x9fb4c2,roughness:.05,metalness:.1,transparent:true,opacity:.32,envMapIntensity:1.4,depthWrite:false});
 const paint=new THREE.MeshStandardMaterial({name:'Veiculos_servico',vertexColors:true,roughness:.42,metalness:.15});
 const {material:membrane,glow:membraneGlow}=membraneMaterial();
 // At night the floodlights' spill lights the bowl (not the façade outside): an emissive share of the albedo, inside only.
 const spill={value:0};
 {const before=concrete.onBeforeCompile,key=concrete.customProgramCacheKey;
  concrete.onBeforeCompile=function(shader,r){before.call(this,shader,r);shader.uniforms.arenaSpill=spill;
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float arenaSpill;').replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
 {vec2 sp=vec2(vStructWorld.x,-vStructWorld.z),sq=abs(sp)-vec2(${CX.toFixed(1)},${CY.toFixed(1)});float so=length(max(sq,0.0))+min(max(sq.x,sq.y),0.0)-${R.toFixed(1)};
  totalEmissiveRadiance+=arenaSpill*vec3(1.0,.95,.86)*diffuseColor.rgb*(1.0-smoothstep(${(FACADE_O-.3).toFixed(2)},${(FACADE_O-.02).toFixed(2)},so))*(.55+.45*smoothstep(-.2,.6,vStructNormal.y-.3*(so>0.0?0.0:1.0)));}`);};
  concrete.customProgramCacheKey=function(){return key.call(this)+'-arena-spill';};}
 const cladding=structureMaterial(new THREE.MeshStandardMaterial({name:'Metal',color:0xc9c5bc,roughness:.45,metalness:.45}),textures,structures);cladding.metalness=.15;cladding.roughness=.62;

 // --- The floor: rings every 2 m in from the edge (the wall's own stations) round a 2 m grid, at the asphalt's height.
 {
  const pos=[],uv=[],road=[],nor=[],idx=[],rings=[];for(let o=0;o>-R;o-=2)rings.push(o);rings.push(-R);
  const vert=(x,y)=>{pos.push(x,FLOOR_Y,-y);uv.push(x/2,-y/2);road.push(y,x+1000,160,10000);nor.push(0,1,0);return pos.length/3-1;};
  const N=floorStations.length,grid=rings.map(o=>floorStations.map(s=>{const p=at(s,o);return vert(p.x,p.y);}));
  for(let r=0;r+1<rings.length;r++)for(let j=0;j<N;j++){const a=grid[r][j],b=grid[r][(j+1)%N],c=grid[r+1][(j+1)%N],d=grid[r+1][j];idx.push(a,b,c,a,c,d);}
  const nx=Math.round(2*CX/2),ny=Math.round(2*CY/2),inner=[];
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++)inner.push(vert(-CX+i*2,-CY+j*2));
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=inner[j*(nx+1)+i],b=inner[j*(nx+1)+i+1],c=inner[(j+1)*(nx+1)+i+1],d=inner[(j+1)*(nx+1)+i];idx.push(a,b,c,a,c,d);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('roadData',new THREE.Float32BufferAttribute(road,4));g.setIndex(idx);g.computeBoundingSphere();
  addMesh(g,roadSurface.material,'Piso_arena');
 }

 // --- Concrete: the wall, the apron, the bowl with its notches, the columns, the tunnels' walls.
 const con=new Mesher(),stl=new Mesher(),drk=new Mesher(),lit=new Mesher(),veh=new Mesher(),gls=new Mesher();
 const grey=k=>[k,k,k],cool=k=>[k*1.04,k*1.08,k*1.14];
 const gates=tunnels.map(t=>[t.s0,t.s1]);
 {
  // The wall: its face exactly on the floor's edge, a 5 cm chamfer, the top, the back; steel gates at the tunnels.
  const wall=[[0,0,0,WALL_H-.05,.92],[0,WALL_H-.05,.05,WALL_H,1.02],[.05,WALL_H,WALL_T,WALL_H,1.05],[WALL_T,WALL_H,WALL_T,0,.85]];
  for(const [a,b] of freeRanges(gates))for(const [o0,h0,o1,h1,k] of wall)con.sweep(span(fine,a,b),o0,h0,o1,h1,cool(k*1.08));
  for(const t of tunnels){
   for(const [o0,h0,o1,h1] of wall)stl.sweep(span(fine,t.s0,t.s1),o0,h0,o1,h1,lin('#7a1d1d'));
   // The gate's leaves: ribs and the hinge posts.
   for(let s=t.s0+.4;s<t.s1-.2;s+=.8){const p=at(s,-.02),q=P3(p,.08),r=P3(p,WALL_H-.12);stl.beam(q,r,.06,.04,lin('#5a1414'));}
   for(const s of [t.s0+.05,t.s1-.05]){const p=at(s,WALL_T/2);stl.box(P3(p,(WALL_H+FENCE_H)/2),[p.tx,0,-p.ty],UP,[p.nx,0,-p.ny],.12,(WALL_H+FENCE_H)/2+.02,.25,grey(.35));}
  }
  // The apron behind the wall (marshals, photographers, the service trucks), and in front of the tunnels to the façade.
  con.sweep(span(fine,0,PERIM),WALL_T,0,S.apron,0,grey(.84));
  for(const t of tunnels)con.sweep(span(fine,t.s0,t.s1),S.apron,.0,FACADE_O,.0,grey(.7));
  // The bowl, piece by piece of its section, each round the loop but where a notch cuts it.
  for(const seg of bowlProfile()){
   const cutBy=notches.filter(n=>cuts(seg.tag,n));
   const tone=seg.tone*(seg.tag.tread!==undefined?.97+.06*hash(seg.tag.tread,3):1);
   for(const [a,b] of freeRanges(cutBy.map(n=>[n.s0,n.s1])))con.sweep(span(fine,a,b),seg.o0,seg.h0,seg.o1,seg.h1,cool(tone*1.06));
  }
  // The notches: floor, side walls, the lintel over the tunnel's mouth, the tunnel itself (dark, a light along its roof).
  for(const n of notches){
   const tunnel=n.kind==='tunnel',front=tunnel?S.apron:rowO(n.from),mouth=rowO(n.to),floor=n.floor,ceil=n.ceiling;
   if(!tunnel)con.sweep(span(fine,n.s0,n.s1),front,floor,mouth,floor,grey(.9));
   con.sweep(span(fine,n.s0,n.s1),mouth,ceil,mouth,rowH(n.to),grey(.8));
   for(const [s,side] of [[n.s0,1],[n.s1,-1]]){
    const p=at(s),nrm=[p.tx*side,0,-p.ty*side],pts=[];
    const pt=(o,h)=>{const q=at(s,o);return [q.x,h,-q.y];};
    if(tunnel){pts.push(pt(S.apron,0),pt(S.apron,S.podium),pt(ROW0,S.podium),pt(ROW0,rowH(0)));for(let k=1;k<n.to;k++)pts.push(pt(rowO(k),rowH(k-1)),pt(rowO(k),rowH(k)));pts.push(pt(mouth,rowH(n.to-1)),pt(mouth,0));}
    else{pts.push(pt(front,floor));for(let k=n.from;k<n.to;k++)pts.push(pt(rowO(k),rowH(k)),pt(rowO(k+1),rowH(k)));pts.push(pt(mouth,floor));}
    con.polygon(pts,nrm,grey(.88));
    // The tunnel's own walls inside, to its depth (the vehicle tunnels right through to the façade).
    const deep=tunnel?FACADE_O:mouth+S.vom.depth;
    drk.quad([pt(mouth,floor),pt(deep,floor),pt(deep,ceil),pt(mouth,ceil)],nrm,grey(tunnel?.55:.4));
    // Railings on the side walls (vomitories): along the step line, a metre over it.
    if(!tunnel){const pr=(o,h)=>{const r=at(s-side*.12,o);return [r.x,h,-r.y];};stl.beam(pr(front+.1,rowH(n.from)+1.0),pr(mouth,rowH(n.to-1)+1.0),.05,.05,lin('#d8b31a'));
     for(let k=n.from;k<n.to;k+=2)stl.beam(pr(rowO(k)+.3,rowH(k)),pr(rowO(k)+.3,rowH(k)+1.0),.045,.045,lin('#d8b31a'));}
   }
   const deep=tunnel?FACADE_O:mouth+S.vom.depth;
   drk.sweep(span(fine,n.s0,n.s1),deep,ceil,mouth,ceil,grey(.5));
   if(!tunnel){drk.sweep(span(fine,n.s0,n.s1),mouth,floor,deep,floor,grey(.45));drk.sweep(span(fine,n.s0,n.s1),deep,floor,deep,ceil,grey(.25));}
   // Lights along the tunnel's roof.
   for(let o=mouth+1.2;o<deep-.5;o+=tunnel?3.2:2.2){const c=at((n.s0+n.s1)/2,o),tq=[c.tx,0,-c.ty];lit.box(P3(c,ceil-.04),tq,UP,[c.nx,0,-c.ny],tunnel?1.4:.7,.03,.12,lin('#fff3d6',3));}
   // A railing along the lintel's top, where the row over the mouth has a drop in front of it.
   if(!tunnel){const a=at(n.s0,mouth+.08),b=at(n.s1,mouth+.08);stl.beam(P3(a,rowH(n.to)+1.0),P3(b,rowH(n.to)+1.0),.05,.05,lin('#d8b31a'));}
  }
 }

 // --- The fence over the wall: posts, top and middle tubes, the wire.
 const fen=new Mesher({aArt:3});
 {
  const o=WALL_T*.5,top=WALL_H+FENCE_H,total=lineLength(o),n=Math.round(total/3.6);
  for(let i=0;i<n;i++){const p=at(sOf(i/n*total,o),o);stl.box(P3(p,(WALL_H+top)/2),[p.tx,0,-p.ty],UP,[p.nx,0,-p.ny],.045,(top-WALL_H)/2,.045,grey(.42),'-y');}
  for(const h of [WALL_H+.06,WALL_H+FENCE_H*.55,top]){const pl=.03,pts=span(fine,0,PERIM);for(const [o0,h0,o1,h1] of [[o-pl,h-pl,o-pl,h+pl],[o-pl,h+pl,o+pl,h+pl],[o+pl,h+pl,o+pl,h-pl]])stl.sweep(pts,o0,h0,o1,h1,grey(.42));}
  const ss=span(fine,0,PERIM),a=[],b=[],nn=[],ea=[],eb=[];
  for(const s of ss){const p=at(s,o),l=lenAt(s,o);a.push(P3(p,WALL_H+.06));b.push(P3(p,top));nn.push([-p.nx,0,p.ny]);ea.push({aArt:[l,WALL_H,0]});eb.push({aArt:[l,top,0]});}
  fen.strip(a,b,nn,grey(1),grey(1),null,null,ea,eb);
 }

 // --- The banners on the wall's face and the boards on the podium wall.
 const sponsors=circuitSponsors('arena','Arena de Drift').filter(s=>!s.real);
 const bannerList=bannerRows(sponsors,images),boardList=boardCells(sponsors,images);
 const bannerMap=canvasTexture((ctx,w)=>bannerList.forEach((r,i)=>r.paint(ctx,0,i*BANNER_ROW[1],w,BANNER_ROW[1])),BANNER_ROW[0],BANNER_ROW[1]*bannerList.length);
 const boardRows=Math.ceil(boardList.length/BOARD_COLS);
 const boardMap=canvasTexture(ctx=>boardList.forEach((r,i)=>r.paint(ctx,(i%BOARD_COLS)*BOARD_CELL[0],Math.floor(i/BOARD_COLS)*BOARD_CELL[1],BOARD_CELL[0],BOARD_CELL[1])),BOARD_CELL[0]*BOARD_COLS,BOARD_CELL[1]*boardRows);
 for(const m of [bannerMap,boardMap]){m.anisotropy=Math.min(8,renderer?.capabilities?.getMaxAnisotropy?.()??8);}
 const ban=new Mesher({aArt:3}),brd=new Mesher({aArt:3});
 let banners=0,boards=0;
 // A piece of art swept along the line `o` metres out from l0 to l1 (its own metres), from h0 to h1, showing uv box.
 const artPiece=(m,o,l0,l1,h0,h1,u0,u1,v0,v1,seed)=>{
  const total=lineLength(o),shift=Math.floor(l0/total)*total;l0-=shift;l1-=shift;
  const s0=sOf(l0,o);let s1=sOf(l1,o);if(s1<s0)s1+=PERIM;const ss=span(fine,s0,s1),a=[],b=[],nn=[],ua=[],ub=[],ea=[],eb=[];
  for(const s of ss){const p=at(s,o),l=lenUn(s,o),t=Math.min(1,Math.max(0,(l-l0)/(l1-l0)));a.push(P3(p,h0));b.push(P3(p,h1));nn.push([-p.nx,0,p.ny]);
   ua.push([u1-(u1-u0)*t,v0]);ub.push([u1-(u1-u0)*t,v1]);ea.push({aArt:[l,0,seed]});eb.push({aArt:[l,h1-h0,seed]});}
  m.strip(a,b,nn,grey(1),grey(1),ua,ub,ea,eb);
 };
 {
  const o=-.012,runs=freeRanges(gates.map(([a,b])=>[a-.15,b+.15])),order=sequence(bannerList,400,rand,5,16);let k=0;
  for(const [a,b] of runs){
   let l=lenUn(a,o);const end=lenUn(b,o);
   while(end-l>2.5){const want=6.2+rand()*2.6;let piece=Math.min(want,end-l-.2);if(end-l-piece<3)piece=end-l-.2;
    const row=order[k++%order.length],N=bannerList.length,v1=1-row/N,v0=1-(row+1)/N;
    artPiece(ban,o,l+.1,l+.1+piece,.1,WALL_H-.13,0,1,v0,v1,rand());banners++;l+=piece+.22;}
  }
 }
 {
  const o=S.apron-.015,runs=freeRanges(tunnels.map(t=>[t.s0-.2,t.s1+.2])),order=sequence(boardList,300,rand,5,18);let k=0;
  for(const [a,b] of runs){
   let l=lenUn(a,o);const end=lenUn(b,o);
   while(end-l>3){let piece=4.4;if(end-l-piece<2.5)piece=end-l-.3;
    const cell=order[k++%order.length],cx=cell%BOARD_COLS,cy=Math.floor(cell/BOARD_COLS);
    artPiece(brd,o,l+.15,l+.15+piece,.62,2.82,cx/BOARD_COLS,(cx+1)/BOARD_COLS,1-(cy+1)/boardRows,1-cy/boardRows,rand());boards++;l+=piece+.3;}
  }
 }

 // --- Seats (instanced; on phones a coloured bench per row) and the aisles' steps and handrails.
 const exclusions=(k,o)=>{
  const total=lineLength(o),gaps=[];
  for(const s of aisles){const l=lenAt(s,o);gaps.push([l-.62,l+.62]);}
  for(const n of notches){
   const pad=.3;let cut=n.kind==='tunnel'?k<n.to:k>=n.from-1&&k<n.to;
   if(cut){let a=lenAt(n.s0,o)-pad,b=lenAt(n.s1,o)+pad;if(b<a)b+=total;gaps.push([a,b]);}
   if(n.kind==='vom'&&n.tv&&k>=n.to&&k<=n.to+2){const c=lenAt(n.sc,o);gaps.push([c-1.75,c+1.75]);}
  }
  // Into [0, total), split where they wrap, merged.
  const norm=[];for(const [a0,b0] of gaps){const w=b0-a0,a=((a0%total)+total)%total;if(a+w>total){norm.push([a,total],[0,a+w-total]);}else norm.push([a,a+w]);}
  norm.sort((u,v)=>u[0]-v[0]);const merged=[];for(const g of norm){const last=merged.at(-1);if(last&&g[0]<=last[1])last[1]=Math.max(last[1],g[1]);else merged.push([...g]);}
  const free=[];let cur=0;for(const [a,b] of merged){if(a>cur)free.push([cur,a]);cur=Math.max(cur,b);}if(cur<total)free.push([cur,total]);
  // Join the run across ℓ = 0 (the east end).
  if(free.length>1&&free[0][0]===0&&free.at(-1)[1]===total){const last=free.pop();free[0]=[last[0],free[0][1]+total];}
  return free;
 };
 const sectionOf=s=>{s=wrapS(s);for(const sec of sections){const a=sec.a,b=sec.b;if((s>=a&&s<b)||(s+PERIM>=a&&s+PERIM<b))return sec.i;}return 0;};
 const seatRows=[];
 for(let k=0;k<S.rows;k++){const o=rowO(k)+.5;seatRows.push({k,o,free:exclusions(k,o)});}
 let seatCount=0;
 const seatColorOf=(s,k,r)=>seatColor(SEAT_SCHEMES[sectionOf(s)%SEAT_SCHEMES.length],k,r);
 if(!mobile){
  const g=new Mesher(),q=(p,n,c=grey(1))=>g.quad(p,n,c);
  q([[-.21,.44,-.2],[.21,.44,-.2],[.21,.44,.2],[-.21,.44,.2]],UP);q([[-.21,.40,.2],[.21,.40,.2],[.21,.44,.2],[-.21,.44,.2]],[0,0,1]);
  q([[-.21,.44,-.21],[.21,.44,-.21],[.21,.83,-.25],[-.21,.83,-.25]],unit([0,.1,1]));q([[-.21,.83,-.25],[.21,.83,-.25],[.21,.83,-.29],[-.21,.83,-.29]],UP);
  q([[-.21,.44,-.25],[.21,.44,-.25],[.21,.83,-.29],[-.21,.83,-.29]],unit([0,-.1,-1]));q([[-.06,0,-.08],[.06,0,-.08],[.06,.4,-.08],[-.06,.4,-.08]],[0,0,1],grey(.35));
  const geometry=g.geometry();geometry.deleteAttribute('uv');
  const list=[];
  for(const row of seatRows)for(const [a,b] of row.free){const n=Math.floor((b-a)/.5),m=(b-a-n*.5)/2;for(let i=0;i<n;i++){if(rand()<.004)continue;list.push([row,a+m+.25+i*.5]);}}
  const seatMaterial=new THREE.MeshStandardMaterial({name:'Assentos_arena',roughness:.48,metalness:0,vertexColors:true});
  seatMaterial.onBeforeCompile=shader=>{shader.uniforms.arenaSpill=spill;shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float arenaSpill;').replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=arenaSpill*diffuseColor.rgb*vec3(1.0,.95,.86);');};
  seatMaterial.customProgramCacheKey=()=>'arena-seats-v1';
  const inst=new THREE.InstancedMesh(geometry,seatMaterial,list.length),mtx=new THREE.Matrix4(),quat=new THREE.Quaternion(),col=new THREE.Color(),one=new THREE.Vector3(1,1,1),pv=new THREE.Vector3();
  list.forEach(([row,l],i)=>{
   const s=sOf(l,row.o),p=at(s,row.o),r=rng(i*7+3);quat.setFromAxisAngle(new THREE.Vector3(0,1,0),Math.atan2(-p.nx,p.ny)+(r()-.5)*.04);
   mtx.compose(pv.set(p.x,rowH(row.k),-p.y),quat,one);inst.setMatrixAt(i,mtx);
   const c=seatColorOf(s,row.k,r),fade=row.o<S.roofIn?.1+.12*r():.03*r();col.set(c).multiplyScalar(.86+.22*r());col.lerp(_c.setRGB(.75,.75,.72),fade);inst.setColorAt(i,col);
  });
  inst.name='Assentos_arena';inst.receiveShadow=true;inst.castShadow=false;inst.computeBoundingSphere();root.add(inst);meshes.push(inst);seatCount=list.length;
 }else{
  // A bench per row in its section's colour (no seats one by one).
  const lifted=new Mesher();
  for(const row of seatRows)for(const [a,b] of row.free){
   const s0=sOf(a,row.o);let s1=sOf(b,row.o);if(s1<=s0)s1+=PERIM;const ss=span(fine,s0,s1),c=lin(seatColorOf((s0+s1)/2,row.k,rand)),h=rowH(row.k);
   lifted.sweep(ss,row.o-.2,h+.42,row.o+.2,h+.42,c);lifted.sweep(ss,row.o-.2,h,row.o-.2,h+.42,c.map(v=>v*.7));lifted.sweep(ss,row.o+.25,h+.42,row.o+.25,h+.8,c);
  }
  addMesh(lifted.geometry(),new THREE.MeshStandardMaterial({name:'Assentos_arena',roughness:.5,vertexColors:true}),'Assentos_arena');
 }
 // Aisle steps: a half step on each tread, its nose painted yellow; a handrail up the middle.
 for(const sa of aisles){
  for(let k=1;k<S.rows;k++){
   const o0=rowO(k)-S.tread/2,o1=rowO(k),h0=rowH(k-1),h1=h0+S.rise/2,p=at(sa,(o0+o1)/2),t=[p.tx,0,-p.ty],nrm=[p.nx,0,-p.ny],w=.55;
   con.box(P3(p,(h0+h1)/2),t,UP,nrm,w,(h1-h0)/2,S.tread/4,grey(.95),'-y');
   const nose=at(sa,o0+.03);stl.box(P3(nose,h1+.004),t,UP,nrm,w,.006,.035,lin('#e0b21c'),'-y');
   const nose2=at(sa,o1+.03);stl.box(P3(nose2,rowH(k)+.004),t,UP,nrm,w,.006,.035,lin('#e0b21c'),'-y');
  }
  const a=at(sa,rowO(1)),b=at(sa,rowO(S.rows-1));stl.beam(P3(a,rowH(0)+1.0),P3(b,rowH(S.rows-2)+1.0),.05,.05,grey(.75));
  for(let k=1;k<S.rows;k+=3){const p=at(sa,rowO(k)-.2);stl.beam(P3(p,rowH(k-1)+.21),P3(p,rowH(k-1)+1.0+(S.rise/S.tread)*.2),.04,.04,grey(.7));}
 }

 // --- Columns, roof girders, the membrane, the ring truss with its floodlights.
 const colLine=lineLength(S.column),girderS=[];
 for(let j=0;j<S.girders;j++)girderS.push(sOf((j+.5)/S.girders*colLine,S.column));
 girderS.sort((a,b)=>a-b);
 for(const s of girderS){
  const p=at(s,S.column),t=[p.tx,0,-p.ty],nrm=[p.nx,0,-p.ny],top=roofH(S.column);
  con.box(P3(p,top/2-.3),t,UP,nrm,.55,top/2+.3,.45,grey(.92));
  const pt=(o,h)=>{const q=at(s,o);return [q.x,h,-q.y];};
  // The rib over the membrane, the tapered web under it to the column, the bottom chord.
  stl.beam(pt(S.roofIn-.4,roofH(S.roofIn-.4)+.2),pt(S.roofOut+.2,roofH(S.roofOut+.2)+.2),.4,.34,grey(.9));
  const wt=.13,web=[pt(S.roofIn-.2,roofH(S.roofIn-.2)),pt(S.roofOut,roofH(S.roofOut)),pt(S.roofOut,roofH(S.roofOut)-1.1),pt(S.column,roofH(S.column)-3.0),pt(S.roofIn+.6,roofH(S.roofIn)-1.0)];
  for(const side of [1,-1]){const off=mul(t,side*wt);stl.polygon(web.map(v=>add(v,off)),mul(t,side),grey(.86));}
  stl.beam(pt(S.column,roofH(S.column)-3.0),pt(S.roofIn+.6,roofH(S.roofIn)-1.0),.42,.3,grey(.84));
  stl.beam(pt(S.column,roofH(S.column)-3.0),pt(S.roofOut,roofH(S.roofOut)-1.1),.42,.3,grey(.84));
 }
 // Membrane: from the truss to the eaves, sagging between the ribs (valleys), its edges held by the truss and a beam.
 {
  const sub4=mobile?3:5,ss=[];for(let j=0;j<girderS.length;j++){const a=girderS[j],b=j+1<girderS.length?girderS[j+1]:girderS[0]+PERIM;for(let i=0;i<sub4;i++)ss.push([a+(b-a)*i/sub4,i/sub4]);}
  const os=[S.roofIn-.3,S.roofIn+1.6,15,18.5,22,25.5,S.column,S.roofOut],pos=[],idx=[],N=ss.length;
  for(const [s,t] of ss)for(const o of os){const p=at(s,o),w=Math.sin(Math.PI*Math.min(1,Math.max(0,(o-S.roofIn)/(S.roofOut-S.roofIn))))*.7+.3,h=roofH(o)-Math.sin(Math.PI*t)*.55*w*(o<S.roofIn+1.7?.25:1);pos.push(p.x,h,-p.y);}
  const M=os.length;for(let j=0;j<N;j++)for(let i=0;i+1<M;i++){const a=j*M+i,b=((j+1)%N)*M+i,c=((j+1)%N)*M+i+1,d=j*M+i+1;idx.push(a,b,c,a,c,d);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
  // Faces up: flip if the first quad's normal points down.
  if(g.attributes.normal.getY(0)<0){const ix=g.index.array;for(let k=0;k<ix.length;k+=3){const v=ix[k+1];ix[k+1]=ix[k+2];ix[k+2]=v;}g.computeVertexNormals();}
  addMesh(g,membrane,'Cobertura_membrana',{cast:true});
  // Edge beam at the eaves.
  const eave=span(fine,0,PERIM);for(const [o0,h0,o1,h1] of [[S.roofOut,roofH(S.roofOut)+.15,S.roofOut+.25,roofH(S.roofOut)+.15],[S.roofOut+.25,roofH(S.roofOut)+.15,S.roofOut+.25,roofH(S.roofOut)-.6],[S.roofOut+.25,roofH(S.roofOut)-.6,S.roofOut,roofH(S.roofOut)-.6]])stl.sweep(eave,o0,h0,o1,h1,grey(.88));
 }
 // The ring truss: four chords round the inner edge, posts and diagonals; a catwalk deck on its bottom.
 const trussIn=S.roofIn-.2,trussOut=S.roofIn+1.6,trussTop=o=>roofH(o)-.12,trussBottom=o=>roofH(o)-2.1;
 {
  const ring=span(fine,0,PERIM),tube=(o,h,r)=>{for(const [o0,h0,o1,h1] of [[o-r,h-r,o-r,h+r],[o-r,h+r,o+r,h+r],[o+r,h+r,o+r,h-r],[o+r,h-r,o-r,h-r]])stl.sweep(ring,o0,h0,o1,h1,grey(.86));};
  for(const o of [trussIn,trussOut])for(const h of [trussTop(o),trussBottom(o)])tube(o,h,.1);
  stl.sweep(ring,trussOut,trussBottom(trussOut)-.1,trussIn,trussBottom(trussIn)-.1,grey(.5));
  const total=lineLength(S.roofIn),n=Math.round(total/(mobile?6:3));
  for(let i=0;i<n;i++){
   const s=sOf(i/n*total,S.roofIn),s2=sOf((i+1)/n*total,S.roofIn);
   for(const o of [trussIn,trussOut]){const a=at(s,o),b=at(s2,o);stl.beam(P3(a,trussBottom(o)),P3(a,trussTop(o)),.07,.07,grey(.85));stl.beam(i%2?P3(a,trussBottom(o)):P3(a,trussTop(o)),i%2?P3(b,trussTop(o)):P3(b,trussBottom(o)),.05,.05,grey(.85));}
   const a=at(s,trussIn),b=at(s,trussOut);stl.beam(P3(a,trussTop(trussIn)),P3(b,trussTop(trussOut)),.06,.06,grey(.85));
  }
 }
 // Floodlight heads under the truss, each aimed at its own spot on the floor; their lenses glow at night.
 const headPos=[];let lensLevel=null,glowMesh=null,glowMaterial=null;
 {
  const total=lineLength(trussIn),n=Math.round(total/(mobile?4.4:2.3)),r=rng(4417);
  for(let i=0;i<n;i++){
   const l=(i+.5)/n*total,s=sOf(l,trussIn),p=at(s,trussIn-.15),h=trussBottom(trussIn)-.45-(i%2)*.32,reach=-(14+r()*26),q=at(s+(r()-.5)*8,reach);
   headPos.push({pos:new THREE.Vector3(p.x,h,-p.y),target:new THREE.Vector3(q.x,0,-q.y)});
  }
  const head=new Mesher({aLens:1}),hq=(p,n,lens)=>head.quad(p,n,lens?grey(.2):grey(.16),null,{aLens:[lens?1:0]});
  // Housing (a short box) with the lens on +z, a yoke behind.
  const hx=.36,hy=.28,hz=.2;
  for(const [n,cs] of [[[1,0,0],[[hx,-hy,-hz],[hx,hy,-hz],[hx,hy,hz],[hx,-hy,hz]]],[[-1,0,0],[[-hx,-hy,-hz],[-hx,-hy,hz],[-hx,hy,hz],[-hx,hy,-hz]]],[[0,1,0],[[-hx,hy,-hz],[-hx,hy,hz],[hx,hy,hz],[hx,hy,-hz]]],[[0,-1,0],[[-hx,-hy,-hz],[hx,-hy,-hz],[hx,-hy,hz],[-hx,-hy,hz]]],[[0,0,-1],[[-hx,-hy,-hz],[-hx,hy,-hz],[hx,hy,-hz],[hx,-hy,-hz]]]])hq(cs,n,false);
  hq([[-hx*.9,-hy*.9,hz+.005],[hx*.9,-hy*.9,hz+.005],[hx*.9,hy*.9,hz+.005],[-hx*.9,hy*.9,hz+.005]],[0,0,1],true);
  const geometry=head.geometry();geometry.deleteAttribute('uv');
  const lampLevel=lensLevel={value:0},headMaterial=new THREE.MeshStandardMaterial({name:'Refletores_arena',vertexColors:true,roughness:.4,metalness:.5});
  headMaterial.onBeforeCompile=shader=>{shader.uniforms.lampLevel=lampLevel;
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float aLens;varying float vLens;').replace('#include <begin_vertex>','#include <begin_vertex>\nvLens=aLens;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vLens;uniform float lampLevel;').replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vLens*vec3(1.0,.94,.84)*(.04+lampLevel*14.0);');};
  headMaterial.customProgramCacheKey=()=>'arena-lamp-heads-v1';
  const inst=new THREE.InstancedMesh(geometry,headMaterial,headPos.length),dummy=new THREE.Object3D();
  headPos.forEach((h,i)=>{dummy.position.copy(h.pos);dummy.lookAt(h.target);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);});
  inst.name='Refletores_arena';inst.castShadow=false;inst.receiveShadow=false;inst.computeBoundingSphere();root.add(inst);meshes.push(inst);
  // Glow discs, one per head.
  const quads=[];for(const h of headPos){const g=new THREE.PlaneGeometry(2,2),nv=g.attributes.position.count,centre=new Float32Array(nv*3),corner=new Float32Array(nv*2);const c=h.pos.clone().addScaledVector(h.target.clone().sub(h.pos).normalize(),.25);
   for(let i=0;i<nv;i++){centre.set([c.x,c.y,c.z],i*3);corner[i*2]=g.attributes.position.getX(i);corner[i*2+1]=g.attributes.position.getY(i);}g.setAttribute('lampCentre',new THREE.BufferAttribute(centre,3));g.setAttribute('corner',new THREE.BufferAttribute(corner,2));quads.push(g);}
  glowMaterial=new THREE.ShaderMaterial({name:'Refletores_brilho',vertexShader:glowVertex,fragmentShader:glowFragment,uniforms:{glowSize:{value:.55},glowColor:{value:new THREE.Color(1,.93,.82)},glowStrength:{value:0}},
   transparent:true,depthWrite:false,fog:false,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor});
  const glowGeometry=mergeGeometries(quads,false);quads.forEach(g=>g.dispose());
  glowMesh=new THREE.Mesh(glowGeometry,glowMaterial);glowMesh.name='Refletores_brilho';glowMesh.frustumCulled=false;glowMesh.renderOrder=3;glowMesh.visible=false;root.add(glowMesh);
 }
 // The road lamps (headlights.js ROAD_LAMPS, through main.js's floods): banks along the truss, each lighting its part of
 // the floor in a wide cone.
 const lamps=[];
 {
  const total=lineLength(trussIn);
  for(let j=0;j<S.lamps;j++){const s=sOf((j+.5)/S.lamps*total,trussIn),p=at(s,trussIn),q=at(s,-30),pos=new THREE.Vector3(p.x,trussBottom(trussIn)-.6,-p.y),target=new THREE.Vector3(q.x,0,-q.y);
   lamps.push({pos,dir:target.sub(pos).normalize(),edge:S.lampEdge,strength:0});}
 }

 // --- Video screens at both ends, hung from the truss.
 const screen=screenCanvas(images,mobile);screen.draw(['ARENA DE DRIFT','AUTO-POBRE RACING','']);
 const scr=new Mesher();
 {
  const {width:W,height:H,o,top,tilt}=S.screen;
  for(const sc of [0,WEST]){
   const p=at(sc,o),t=[p.tx,0,-p.ty],nrm=[p.nx,0,-p.ny],c=P3(p,top-H/2),face=unit(add(neg(nrm),[0,-Math.sin(tilt),0])),up=unit(cross(t,face));
   const ctr=add(c,mul(face,-.2));stl.box(ctr,t,up,face,W/2+.35,H/2+.35,.4,grey(.14));
   const fc=add(c,mul(face,.205)),corner=(i,j)=>add(fc,add(mul(t,i*W/2),mul(up,j*H/2)));
   // Text reads left to right as seen from the floor: u runs against t.
   scr.quad([corner(1,-1),corner(-1,-1),corner(-1,1),corner(1,1)],face,grey(1),[[0,0],[1,0],[1,1],[0,1]]);
   for(const i of [-.8,.8]){const a=add(ctr,add(mul(t,i*W/2),mul(up,H/2+.35))),b=[a[0],trussBottom(trussIn)-.1,a[2]];stl.beam(a,b,.05,.05,grey(.3));}
  }
 }
 addMesh(scr.geometry(),screenMaterial(screen.map),'Teloes_arena',{receive:false});

 // --- TV platforms on the vomitories' roofs: deck, rail, camera on its tripod, the cameraman's umbrella.
 const tvSpots=[];
 for(const n of vomitories){
  const o0=rowO(n.to),o1=rowO(n.to+2)+.3,deck=rowH(n.to+2)+.25,c=at(n.sc,(o0+o1)/2),t=[c.tx,0,-c.ty],nrm=[c.nx,0,-c.ny];
  stl.box(P3(c,deck),t,UP,nrm,1.45,.06,(o1-o0)/2,grey(.45));
  for(const [i,j] of [[-1,-1],[1,-1],[-1,1],[1,1]]){const q=at(n.sc,i<0?o0+.15:o1-.15),base=P3(q,rowH(n.to+(i<0?0:2))),pp=add(base,mul(t,j*1.3));stl.beam(pp,[pp[0],deck,pp[2]],.06,.06,grey(.4));}
  const front=at(n.sc,o0+.05);for(const j of [-1,1]){const pp=add(P3(front,deck),mul(t,j*1.4));stl.beam(pp,add(pp,[0,1.0,0]),.04,.04,lin('#d8b31a'));}
  stl.beam(add(P3(front,deck+1.0),mul(t,-1.4)),add(P3(front,deck+1.0),mul(t,1.4)),.04,.04,lin('#d8b31a'));
  const cam=at(n.sc,o0+.6),camPos=P3(cam,deck+1.45);
  for(const a of [0,2.1,4.2]){const foot=add(P3(cam,deck+.06),add(mul(t,Math.cos(a)*.35),mul(nrm,Math.sin(a)*.35)));stl.beam(foot,add(camPos,[0,-.12,0]),.03,.03,grey(.12));}
  stl.box(camPos,t,UP,nrm,.14,.16,.3,grey(.08));stl.box(add(camPos,mul(nrm,-.42)),t,UP,nrm,.09,.09,.14,grey(.05));
  // The cameraman behind, the umbrella over both.
  const man=at(n.sc,o0+1.25),mp=P3(man,deck+.06);veh.box(add(mp,[0,.45,0]),t,UP,nrm,.17,.42,.13,lin('#2b3440'));veh.box(add(mp,[0,1.15,0]),t,UP,nrm,.2,.3,.13,lin(hash(n.sc)>.5?'#d9661c':'#1f2a44'));veh.box(add(mp,[0,1.55,0]),t,UP,nrm,.1,.12,.1,lin('#b98463'));
  const pole=at(n.sc,o0+.95);stl.beam(P3(pole,deck),P3(pole,deck+2.5),.03,.03,grey(.6));
  const um=P3(pole,deck+2.5),ucol=lin(['#b3161d','#1c3f7a','#e0a810','#1f7a3a'][Math.floor(hash(n.sc,5)*4)]);
  for(let i=0;i<8;i++){const a0=i/8*Math.PI*2,a1=(i+1)/8*Math.PI*2,rim=a=>add(um,add(add(mul(t,Math.cos(a)*1.15),mul(nrm,Math.sin(a)*1.15)),[0,-.35,0]));veh.quad([um,rim(a0),rim(a1),um],UP,i%2?ucol:grey(.92));}
  tvSpots.push({position:new THREE.Vector3(camPos[0],camPos[1]+.1,camPos[2])});
 }

 // --- The commentary box over the north side's middle, on the concourse.
 {
  const sc=SEGS[2].s0+SEGS[2].len/2,w=7,o0=CONC_O+.2,o1=REAR_O-.05,h0=TOP_H,h1=TOP_H+3.1;
  const c=at(sc,(o0+o1)/2),t=[c.tx,0,-c.ty],nrm=[c.nx,0,-c.ny];
  con.box(P3(c,h1+.12),t,UP,nrm,w+.3,.12,(o1-o0)/2+.4,grey(.95));
  for(const j of [-1,1])con.box(add(P3(c,(h0+h1)/2),mul(t,j*w)),t,UP,nrm,.15,(h1-h0)/2,(o1-o0)/2,grey(.9));
  con.box(P3(c,h0+.5),t,UP,nrm,w,.5,(o1-o0)/2,grey(.85));
  const f=at(sc,o0),fc=P3(f,h0+1.05+(h1-h0-1.05)/2);
  gls.quad([add(fc,add(mul(t,-w),[0,-(h1-h0-1.05)/2,0])),add(fc,add(mul(t,w),[0,-(h1-h0-1.05)/2,0])),add(fc,add(mul(t,w),mul(add(UP,mul(nrm,.15)),(h1-h0-1.05)/2))),add(fc,add(mul(t,-w),mul(add(UP,mul(nrm,.15)),(h1-h0-1.05)/2)))],unit(add(neg(nrm),[0,.15,0])),grey(1));
  const back=at(sc,o1-.1);lit.box(P3(back,h1-.25),t,UP,nrm,w-.5,.04,.25,lin('#fff1d8',1.6));
  con.box(P3(at(sc,o1-.3),(h0+h1)/2+.4),t,UP,nrm,w-.2,(h1-h0)/2-.4,.05,grey(.75));
  // The commentators and the producer at their desk, the monitors' glow.
  const desk=at(sc,o0+.7);con.box(P3(desk,h0+1.15),t,UP,nrm,w-.6,.05,.35,grey(.5));
  for(const [j,shirt] of [[-3.6,'#b3161d'],[-1.2,'#1c3f7a'],[1.4,'#e6e3da'],[3.9,'#2b2b2b']]){const pp=add(P3(at(sc,o0+1.3),h0+1.0),mul(t,j));veh.box(pp,t,UP,nrm,.22,.32,.15,lin(shirt));veh.box(add(pp,[0,.45,0]),t,UP,nrm,.1,.12,.1,lin('#a87756'));
   lit.box(add(P3(at(sc,o0+.55),h0+1.42),mul(t,j)),t,UP,nrm,.28,.17,.02,lin('#9fc3ff',1.3));}
 }

 // --- Concourse lights under the roof's back and along the rear wall's top.
 {
  const total=lineLength(REAR_O),n=Math.round(total/9);
  for(let i=0;i<n;i++){const s=sOf((i+.5)/n*total,REAR_O-.05),p=at(s,REAR_O-.06);lit.box(P3(p,TOP_H+2.6),[p.tx,0,-p.ty],UP,[p.nx,0,-p.ny],.6,.05,.03,lin('#fff6e4',2.2));}
 }

 // --- Ribbed metal cladding from the back wall up to a slit under the roof, closing the bowl; on the façade the slab
 // edges, the gates at the foot between the columns and the concourse's windows.
 const cld=new Mesher();
 {
  const top=20.3,ring=span(fine,0,PERIM);
  cld.sweep(ring,REAR_O+.12,REAR_H,REAR_O+.12,top,grey(1));cld.sweep(ring,FACADE_O,top,FACADE_O,REAR_H,grey(1));cld.sweep(ring,REAR_O+.12,top,FACADE_O,top,grey(1));
  const band=(ss,h,d=.14,k=.92)=>{con.sweep(ss,FACADE_O+d,h-.2,FACADE_O,h-.2,cool(k));con.sweep(ss,FACADE_O+d,h+.2,FACADE_O+d,h-.2,cool(k));con.sweep(ss,FACADE_O,h+.2,FACADE_O+d,h+.2,cool(k));};
  for(const [a,b] of freeRanges(tunnels.map(t=>[t.s0-.3,t.s1+.3])))band(span(fine,a,b),4.6);
  band(ring,9.4);band(ring,REAR_H-.15,.22,1.0);
  for(let j=0;j<girderS.length;j++){
   const a=girderS[j],b=j+1<girderS.length?girderS[j+1]:girderS[0]+PERIM,mid=(a+b)/2;
   if(tunnels.some(t=>Math.abs(wrapS(mid-t.sc+PERIM/2)-PERIM/2)<9))continue;
   const p=at(mid,FACADE_O+.012),t=[p.tx,0,-p.ty],out=[p.nx,0,-p.ny],c=P3(p,0),q=(x,y)=>add(c,add(mul(t,x),[0,y,0]));
   if(j%2===0){drk.quad([q(-1.9,0),q(1.9,0),q(1.9,3.1),q(-1.9,3.1)],out,grey(.55));stl.box(P3(at(mid,FACADE_O+.05),3.25),t,UP,out,2.0,.08,.06,grey(.3));
    lit.box(P3(at(mid,FACADE_O+.08),3.7),t,UP,out,.9,.18,.03,lin(j%4?'#f0c419':'#f6f1e4',1.2));}
   for(const x of [-3,-1,1,3])drk.quad([q(x-.7,6.1),q(x+.7,6.1),q(x+.7,7.7),q(x-.7,7.7)],out,grey(.7));
   for(const x of [-3.2,-1.6,0,1.6,3.2])drk.quad([q(x-.5,10.6),q(x+.5,10.6),q(x+.5,12.6),q(x-.5,12.6)],out,grey(.7));
  }
 }

 // --- Flags on every fourth column, over the eaves.
 const flagMap=flagAtlas(images),{material:flagMat,uniforms:flagUniforms}=flagMaterial(flagMap);
 const flg=new Mesher({aFlag:4});
 {
  let f=0;for(let j=0;j<girderS.length;j+=4,f++){
   const s=girderS[j],p=at(s,S.column),base=roofH(S.column)+.4,t=[p.tx,0,-p.ty];
   stl.cylinder(P3(p,base),P3(p,base+7.5),.05,6,grey(.8));
   const design=f%8,u0=(design%4)/4,v0=1-(Math.floor(design/4)+1)/2,fw=2.7,fh=1.7,top=base+7.3,phase=hash(j,9),wind=unit([.6,0,.8]);
   const along=unit([wind[0],0,wind[2]]),ny=cross(along,UP);
   const cols=10,rows=4,idx0=flg.pos.length/3;
   for(let r=0;r<=rows;r++)for(let c=0;c<=cols;c++){const u=c/cols,v=r/rows,pp=add(P3(p,top-fh+v*fh),mul(along,u*fw+.06));flg.vertex(pp,ny,grey(1),[u0+u*.25,v0+v*.5],{aFlag:[u,phase,ny[0],ny[2]]});}
   for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const a=idx0+r*(cols+1)+c;flg.tri(a,a+1,a+cols+2);flg.tri(a,a+cols+2,a+cols+1);}
  }
 }
 const flagMesh=addMesh(flg.geometry(),flagMat,'Bandeiras_arena',{cast:false});
 flagMesh.onBeforeRender=()=>{flagUniforms.flagTime.value=performance.now()/1000;};

 // --- Service vehicles: a marshal's pickup and a rescue van on the apron, a tow truck and a pickup in the tunnels' mouths.
 const vehicle=(kind,s,o,heading,color)=>{
  const p=at(s,o),fwdPlan=[Math.cos(heading),Math.sin(heading)],X=[fwdPlan[0],0,-fwdPlan[1]],Z=cross(X,UP),base=P3(p,0),L=(x,y,z)=>add(base,add(add(mul(X,x),mul(UP,y)),mul(Z,z)));
  const bx=(x,y,z,hx,hy,hz,c)=>veh.box(L(x,y,z),X,UP,Z,hx,hy,hz,c);const dk=grey(.04),glassC=lin('#1a2630'),body=lin(color);
  for(const [x,z] of [[1.45,.82],[1.45,-.82],[-1.5,.82],[-1.5,-.82]]){const c=L(x,.36,z);veh.cylinder(add(c,mul(Z,-.12)),add(c,mul(Z,.12)),.36,10,dk);}
  if(kind==='van'){bx(0,1.3,0,2.6,.92,.98,body);bx(1.9,1.65,0,.62,.42,.9,glassC);bx(.3,1.75,1.0,1.4,.28,.01,glassC);bx(.3,1.75,-1.0,1.4,.28,.01,glassC);bx(0,1.15,1.0,2.5,.08,.005,lin('#e8702a'));bx(0,1.15,-1.0,2.5,.08,.005,lin('#e8702a'));bx(1.0,2.27,0,.35,.06,.6,lin('#ff8a1a',1.4));}
  else if(kind==='tow'){bx(1.7,1.25,0,.95,.85,1.02,body);bx(2.1,1.6,0,.5,.38,.98,glassC);bx(-1.1,.95,0,2.0,.18,1.1,grey(.3));bx(-.6,1.55,0,.12,.55,.12,grey(.25));veh.beam(L(-.6,2.0,0),L(-2.6,1.2,0),.14,.14,lin('#e0b21c'));bx(1.7,2.15,0,.3,.06,.6,lin('#ff8a1a',1.4));}
  else{bx(.9,1.0,0,1.25,.42,.9,body);bx(-1.3,.95,0,1.25,.36,.9,body);bx(.75,1.67,0,.88,.3,.84,body);bx(-1.3,1.2,.85,1.2,.15,.05,body);bx(-1.3,1.2,-.85,1.2,.15,.05,body);
   // Windows: windscreen, side glass, rear glass; bumpers and lamps.
   bx(1.64,1.68,0,.02,.22,.76,glassC);bx(.8,1.7,.85,.62,.2,.01,glassC);bx(.8,1.7,-.85,.62,.2,.01,glassC);bx(-.14,1.7,0,.01,.18,.7,glassC);
   bx(2.18,.72,0,.06,.12,.92,grey(.15));bx(-2.58,.72,0,.06,.12,.92,grey(.15));bx(2.16,1.0,.62,.03,.07,.16,lin('#fff6dc',1.2));bx(2.16,1.0,-.62,.03,.07,.16,lin('#fff6dc',1.2));
   if(kind==='marshal')bx(.75,2.03,0,.15,.06,.65,lin('#ff9a1a',1.4));}
 };
 vehicle('marshal',SEGS[1].s0+QUARTER*.38,1.95,at(SEGS[1].s0+QUARTER*.38).th+Math.PI/2,'#f2f0e8');
 vehicle('van',SEGS[5].s0+QUARTER*.55,1.95,at(SEGS[5].s0+QUARTER*.55).th-Math.PI/2,'#f4f4f0');
 vehicle('tow',2.2,6.6,Math.PI,'#e0b21c');
 vehicle('pickup',WEST-2.3,7.2,0,'#3a4a5c');
 // People on the apron behind the wall: marshals in orange, photographers in black with their cameras up, the team's
 // crew in red, a medic by the van; in twos and threes, each standing their own way.
 {
  const r=rng(3301),SKIN=['#c68e6a','#8d5a3b','#e0b08f','#6b4128','#d9a37f','#b77a55'],ROLES={marshal:['#f07a1a','#2a2d33'],foto:['#1d1e22','#3a3c40'],crew:['#b3161d','#1d1e22'],medic:['#f2f2ee','#c8302a']};
  const person=(s,o,role)=>{
   const p=at(s,o),a=(r()-.5)*1.1,inward=[-p.nx,-p.ny],fw=[inward[0]*Math.cos(a)-inward[1]*Math.sin(a),0,-(inward[0]*Math.sin(a)+inward[1]*Math.cos(a))],side=unit(cross(fw,UP)),sc=.92+r()*.16;
   const base=P3(p,0),L=(x,y,z)=>add(base,add(add(mul(side,x*sc),[0,y*sc,0]),mul(fw,z*sc))),bx=(x,y,z,hx,hy,hz,c)=>veh.box(L(x,y,z),side,UP,fw,hx*sc,hy*sc,hz*sc,c,'-y');
   const [shirt,pants]=ROLES[role].map(c=>lin(c)),skin=lin(SKIN[Math.floor(r()*SKIN.length)]);
   for(const x of [-.1,.1])bx(x,.43,0,.075,.43,.085,pants);
   bx(0,1.15,0,.2,.3,.12,shirt);bx(0,1.63,0,.09,.11,.1,skin);bx(0,1.76,-.01,.1,.035,.11,role==='marshal'?lin('#f0c419'):lin('#222'));
   if(role==='foto'){for(const x of [-.17,.17])bx(x,1.36,.17,.05,.05,.17,shirt);bx(0,1.6,.24,.09,.065,.09,lin('#0b0b0b'));bx(0,1.6,.38,.045,.045,.07,lin('#151515'));}
   else for(const x of [-.27,.27])bx(x,1.12,0,.06,.3,.07,shirt);
   if(role==='marshal')bx(.33,1.2,.12,.01,.18,.14,lin(r()<.5?'#f0c419':'#1f7a3a'));
  };
  const spots=[[SEGS[1].s0+QUARTER*.15,'marshal',2],[SEGS[1].s0+QUARTER*.72,'foto',3],[SEGS[2].s0+20,'crew',2],[SEGS[2].s0+52,'foto',2],[SEGS[2].s0+90,'marshal',1],
   [SEGS[3].s0+QUARTER*.3,'foto',2],[SEGS[3].s0+QUARTER*.8,'marshal',2],[SEGS[4].s0+8,'foto',1],[SEGS[5].s0+QUARTER*.2,'medic',2],[SEGS[5].s0+QUARTER*.85,'marshal',1],
   [SEGS[6].s0+25,'foto',3],[SEGS[6].s0+64,'crew',3],[SEGS[6].s0+98,'marshal',1],[SEGS[7].s0+QUARTER*.45,'foto',2],[SEGS[8].s0+8,'marshal',2]];
  for(const [s,role,n] of spots)for(let i=0;i<n;i++)person(s+(i-(n-1)/2)*(1.1+r()*.6),1.3+r()*1.5,i===n-1&&n>2?'crew':role);
 }

 // --- Outside: the ground ring out to 1.6 km, parked cars, trees, far buildings and hills.
 {
  const offs=[FACADE_O,29,31,33.2,36,42,50,62,78,98,120,146,152,158,175,210,260,340,460,640,900,1250,1650],ss=coarse,pos=[],idx=[],nor=[],N=ss.length;
  for(const s of ss)for(const o of offs){const p=at(s,o);pos.push(p.x,0,-p.y);nor.push(0,1,0);}
  const M=offs.length;for(let j=0;j<N;j++)for(let i=0;i+1<M;i++){const a=j*M+i,b=((j+1)%N)*M+i,c=((j+1)%N)*M+i+1,d=j*M+i+1;idx.push(a,d,c,a,c,b);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setIndex(idx);g.computeBoundingSphere();
  // Winding up (the stations run counter-clockwise, the offsets outwards).
  {const p=g.attributes.position,ix=g.index.array,v=k=>[p.getX(ix[k]),p.getY(ix[k]),p.getZ(ix[k])];if(cross(sub(v(1),v(0)),sub(v(2),v(0)))[1]<0)for(let k=0;k<ix.length;k+=3){const t=ix[k+1];ix[k+1]=ix[k+2];ix[k+2]=t;}}
  addMesh(g,groundMaterial(textures),'Chao_estadio');
 }
 {
  // Parked cars on the bays (16 m modules across z: two rows of 5 m bays back to back, a 6 m lane), fewer further out.
  const cars=[],r=rng(771);
  for(let z=-16*16;z<16*16;z+=16)for(const row of [2.5,7.5])for(let x=-300;x<300;x+=2.5){
   const px=x+1.25,pz=z+row,py=-pz,o=floorEdge(px,py).d;if(o<39.5||o>138.5)continue;if(Math.abs(py)<8&&Math.abs(px)>A+10)continue;
   if(r()>(mobile?.42:.76)-o/(mobile?300:230))continue;cars.push([px,pz,row<5?0:Math.PI,r()]);
  }
  const cg=new Mesher(),bx=(c,h,col)=>cg.box(c,[1,0,0],UP,[0,0,1],...h,col);
  // A small family car along z: body, cabin (glass dark), wheels.
  bx([0,.62,0],[.86,.33,2.05],grey(1));bx([0,1.12,-.15],[.78,.22,1.15],grey(.13));bx([0,1.36,-.15],[.74,.03,1.0],grey(1));
  for(const [x,z] of [[.78,1.35],[-.78,1.35],[.78,-1.35],[-.78,-1.35]])bx([x,.3,z],[.1,.3,.3],grey(.03));
  const geometry=cg.geometry();geometry.deleteAttribute('uv');
  const carMaterial=new THREE.MeshStandardMaterial({name:'Carros_estacionados',vertexColors:true,roughness:.32,metalness:.4});
  const inst=new THREE.InstancedMesh(geometry,carMaterial,cars.length),m=new THREE.Matrix4(),q=new THREE.Quaternion(),c=new THREE.Color(),sc=new THREE.Vector3();
  const paints=['#c9cbcc','#c9cbcc','#e9e9e6','#e9e9e6','#1b1c1e','#1b1c1e','#7d8186','#5a5e63','#8a1c1c','#1f3558','#b7a690','#2f4a3a','#c2471c'];
  cars.forEach(([x,z,yaw,k],i)=>{q.setFromAxisAngle(new THREE.Vector3(0,1,0),yaw+(k-.5)*.12);const big=k>.82?1.12:k<.25?.92:1;m.compose(new THREE.Vector3(x+(hash(i,2)-.5)*.3,0,z+(hash(i,4)-.5)*.4),q,sc.set(big,k>.9?1.25:1,big));inst.setMatrixAt(i,m);c.set(paints[Math.floor(hash(i,7)*paints.length)]).multiplyScalar(.85+.25*hash(i,8));inst.setColorAt(i,c);});
  // Light poles along the lanes.
  for(let z=-16*16;z<16*16;z+=32)for(let x=-288;x<300;x+=36){const pz=z+13,o=floorEdge(x,-pz).d;if(o<44||o>136||(Math.abs(pz)<10&&Math.abs(x)>A))continue;
   stl.cylinder([x,0,pz],[x,11,pz],.11,6,grey(.55),false);stl.box([x,11.1,pz],[1,0,0],UP,[0,0,1],1.1,.12,.25,grey(.3));lit.box([x,10.97,pz],[1,0,0],UP,[0,0,1],1.0,.02,.2,lin('#fff3dc',1.0));}
  inst.name='Carros_estacionamento';inst.receiveShadow=true;inst.computeBoundingSphere();root.add(inst);meshes.push(inst);
 }
 {
  // Trees: leafy ones (three lumps of crown) and imperial palms; palms and trees in turn along the plaza's verge, trees along
  // the ring road, clumps in the fields beyond. Each turned, sized and tinted its own way.
  const r=rng(5051),leafy=[],palms=[],count=mobile?140:320;
  for(const [o,step,palmy] of [[35.1,mobile?16:10.5,true],[143.5,mobile?22:13,false]]){const total=lineLength(o),n=Math.round(total/step);
   for(let i=0;i<n;i++){const p=at(sOf((i+r()*.3)/n*total,o),o);if(Math.abs(p.y)<11&&Math.abs(p.x)>A)continue;(palmy&&i%2?palms:leafy).push([p.x,p.y,palmy&&i%2?9+r()*5:5+r()*4,r()]);}}
  for(let i=0,start=leafy.length+palms.length;i<count*4&&leafy.length+palms.length<start+count;i++){const a=r()*Math.PI*2,d=230+Math.pow(r(),1.6)*900,x=Math.cos(a)*d*1.25,y=Math.sin(a)*d;const o=floorEdge(x,y).d;if(o<168)continue;
   if(noise2(x/90,y/90)<.45)continue;(noise2(x/40+7,y/40)>.72?palms:leafy).push([x,y,noise2(x/40+7,y/40)>.72?9+r()*6:4+r()*7,r()]);}
  const tg=new Mesher(),pg=new Mesher();
  tg.cylinder([0,0,0],[0,1.7,0],.14,5,lin('#4a3a2a'),false);
  const lump=(cx,cy,cz,rx,ry,rz,col)=>{const crown=new THREE.IcosahedronGeometry(1,0),cp=crown.attributes.position;for(let i=0;i<cp.count;i+=3){const v=[0,1,2].map(j=>[cp.getX(i+j)*rx+cx,cp.getY(i+j)*ry+cy,cp.getZ(i+j)*rz+cz]),n=unit(cross(sub(v[1],v[0]),sub(v[2],v[0])));tg.tri(tg.vertex(v[0],n,col),tg.vertex(v[1],n,col),tg.vertex(v[2],n,col));}crown.dispose();};
  lump(0,2.5,0,1.25,1.0,1.2,lin('#3d5a2a'));lump(.65,2.15,.3,.85,.75,.85,lin('#46632e'));lump(-.5,2.9,-.35,.8,.7,.8,lin('#355025'));
  // A 10 m palm: a grey trunk, a green sheath at its top, eleven fronds arching out and down.
  pg.cylinder([0,0,0],[0,8.6,0],.2,6,lin('#8a8478'),false);pg.cylinder([0,8.6,0],[0,9.6,0],.24,6,lin('#4f6b32'),false);
  for(let k=0;k<11;k++){const a=k/11*Math.PI*2+(k%2)*.2,d=[Math.cos(a),0,Math.sin(a)],w=mul(unit(cross(d,UP)),.28),base=[0,9.6,0],mid=add(base,add(mul(d,1.7),[0,.35,0])),tip=add(base,add(mul(d,3.2),[0,-.9-(k%3)*.3,0]));
   const g=lin(k%3?'#3f6a2a':'#4d7a30');pg.quad([sub(base,mul(w,.3)),add(base,mul(w,.3)),add(mid,w),sub(mid,w)],unit(add(UP,mul(d,.3))),g);pg.quad([sub(mid,w),add(mid,w),add(tip,mul(w,.2)),sub(tip,mul(w,.2))],unit(add(UP,mul(d,.8))),g);}
  const treeMaterial=new THREE.MeshStandardMaterial({name:'Arvores_fora',vertexColors:true,roughness:.9,side:THREE.DoubleSide});
  for(const [mesher,list,name,palm] of [[tg,leafy,'Arvores_fora',false],[pg,palms,'Palmeiras_fora',true]]){
   if(!list.length)continue;const geometry=mesher.geometry();geometry.deleteAttribute('uv');
   const inst=new THREE.InstancedMesh(geometry,treeMaterial,list.length),m=new THREE.Matrix4(),q=new THREE.Quaternion(),c=new THREE.Color(),axis=new THREE.Vector3();
   list.forEach(([x,y,h,k],i)=>{axis.set(hash(i,13)-.5,8,hash(i,14)-.5).normalize();q.setFromAxisAngle(new THREE.Vector3(0,1,0),k*6.28).premultiply(new THREE.Quaternion().setFromAxisAngle(axis.cross(new THREE.Vector3(0,1,0)).normalize(),(hash(i,15)-.5)*.12));
    const w=palm?h/10*(.9+.2*hash(i,3)):h*(.42+.2*hash(i,3));m.compose(new THREE.Vector3(x,0,-y),q,palm?new THREE.Vector3(w,h/10,w):new THREE.Vector3(w,h/4,w*(.85+.3*hash(i,4))));inst.setMatrixAt(i,m);c.setRGB(.75+.4*hash(i,5),.85+.3*hash(i,6),.7+.3*hash(i,8));inst.setColorAt(i,c);});
   inst.name=name;inst.receiveShadow=true;inst.castShadow=palm;inst.computeBoundingSphere();root.add(inst);meshes.push(inst);
  }
 }
 {
  // Far buildings: low houses and sheds all round, the city's towers to the north-east.
  const r=rng(8123),list=[];
  for(let i=0;i<(mobile?120:260);i++){const city=r()<.3,a=city?.35+r()*1.1:r()*Math.PI*2,d=city?900+r()*600:520+r()*900,x=Math.cos(a)*d,y=Math.sin(a)*d;
   const tall=city&&r()<.45,w=tall?16+r()*18:10+r()*40,dd=tall?16+r()*18:8+r()*30,h=tall?40+r()*85:5+Math.pow(r(),2)*22;list.push([x,y,w,dd,h,r()]);}
  const bg=new Mesher();bg.box([0,.5,0],[1,0,0],UP,[0,0,1],.5,.5,.5,grey(1),'-y');
  const geometry=bg.geometry();geometry.deleteAttribute('uv');
  const material=new THREE.MeshStandardMaterial({name:'Predios_longe',vertexColors:true,roughness:.85});
  material.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vBW;varying vec3 vBN;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvBW=(modelMatrix*instanceMatrix*vec4(transformed,1.0)).xyz;vBN=normalize(mat3(modelMatrix*instanceMatrix)*objectNormal);');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vBW;varying vec3 vBN;').replace('#include <map_fragment>',`#include <map_fragment>
 if(abs(vBN.y)<.5){float along=abs(vBN.x)>abs(vBN.z)?vBW.z:vBW.x;vec2 w=vec2(along/2.6,vBW.y/3.1);vec2 f=abs(fract(w)-.5);float px=max(fwidth(w.x),fwidth(w.y));
  float win=(1.0-smoothstep(.28,.28+px,f.x))*(1.0-smoothstep(.22,.22+px,f.y))*step(1.5,vBW.y);diffuseColor.rgb*=mix(1.0,mix(.35,.75,fract(sin(dot(floor(w),vec2(12.9,78.2)))*437.5)),win*(1.0-smoothstep(.25,.6,px)));}
 else diffuseColor.rgb*=.8;`);};
  material.customProgramCacheKey=()=>'arena-far-buildings-v1';
  const inst=new THREE.InstancedMesh(geometry,material,list.length),m=new THREE.Matrix4(),q=new THREE.Quaternion(),c=new THREE.Color(),wall=['#cfc6b4','#d8d4cb','#b9a58a','#a7aaa8','#e6e1d6','#c08a6a','#8f969b'];
  list.forEach(([x,y,w,d,h,k],i)=>{q.setFromAxisAngle(new THREE.Vector3(0,1,0),Math.atan2(y,x)+(k-.5)*.6);m.compose(new THREE.Vector3(x,0,-y),q,new THREE.Vector3(w,h,d));inst.setMatrixAt(i,m);c.set(wall[Math.floor(hash(i,11)*wall.length)]).multiplyScalar(.75+.3*hash(i,12));inst.setColorAt(i,c);});
  inst.name='Predios_longe';inst.computeBoundingSphere();root.add(inst);meshes.push(inst);
 }
 {
  // Hills on the horizon, rising past the ground's edge.
  const hg=new Mesher(),seg=mobile?64:120,radii=[1500,1680,1950,2300,2800,3300],heights=[-1.5,4,26,55,85,70],rowsP=[];
  for(let i=0;i<=seg;i++){const a=i/seg*Math.PI*2,n=noise2(Math.cos(a)*3+5,Math.sin(a)*3+5)*.65+noise2(Math.cos(a)*9+1,Math.sin(a)*9+1)*.35;
   rowsP.push(radii.map((r,k)=>[Math.cos(a)*r,heights[k]*(k<2?1:(.35+1.1*n)),-Math.sin(a)*r]));}
  for(let k=0;k+1<radii.length;k++){const a=rowsP.map(r=>r[k]),b=rowsP.map(r=>r[k+1]),n=a.map(()=>UP);const c=t=>lin(t<2?'#5f6b45':t<4?'#56603f':'#4d5a46');hg.strip(a,b,n,c(k),c(k+1));}
  const g=hg.geometry();g.computeVertexNormals();g.deleteAttribute('uv');
  addMesh(g,new THREE.MeshStandardMaterial({name:'Morros_horizonte',vertexColors:true,roughness:1}),'Morros_horizonte',{receive:false});
 }

 // --- Merge the builders into their meshes.
 addMesh(con.geometry(),concrete,'Arquibancada_concreto',{cast:true});
 addMesh(stl.geometry(),steel,'Estrutura_aco',{cast:true});
 if(!drk.empty)addMesh(drk.geometry(),dark,'Tuneis_arena');
 if(!lit.empty)addMesh(lit.geometry(),lights,'Luzes_arena',{receive:false});
 if(!veh.empty)addMesh(veh.geometry(),paint,'Veiculos_servico',{cast:true});
 if(!gls.empty)addMesh(gls.geometry(),glass,'Cabine_vidro',{receive:false});
 addMesh(cld.geometry(),cladding,'Fechamento_metalico',{cast:true});
 addMesh(ban.geometry(),artMaterial(bannerMap,'Faixas_muro_arena',true),'Faixas_muro_arena');
 addMesh(brd.geometry(),artMaterial(boardMap,'Placas_arquibancada',false),'Placas_arquibancada');
 addMesh(fen.geometry(),fenceMaterial(),'Alambrado_arena',{receive:false}).renderOrder=2;

 // --- The cameras' obstacles: low-poly proxies in world space (wall and fence, stand fronts and the bowl, columns,
 // roof, screens).
 const obstacles=[];
 {
  const hidden=new THREE.MeshBasicMaterial({name:'Obstaculo_arena',visible:false,side:THREE.DoubleSide}),proxy=(m,name)=>{const mesh=new THREE.Mesh(m.geometry(),hidden);mesh.name=name;mesh.updateMatrixWorld(true);obstacles.push(mesh);};
  const ring=stations(12,8);
  const wall=new Mesher();wall.sweep(span(ring,0,PERIM),0,0,0,WALL_H+FENCE_H,grey(1));wall.sweep(span(ring,0,PERIM),0,WALL_H+FENCE_H,WALL_T,WALL_H+FENCE_H,grey(1));proxy(wall,'Muro_arena');
  const bowl=new Mesher();bowl.sweep(span(ring,0,PERIM),S.apron,0,S.apron,S.podium,grey(1));bowl.sweep(span(ring,0,PERIM),S.apron,S.podium,ROW0,S.podium,grey(1));
  bowl.sweep(span(ring,0,PERIM),ROW0,S.podium,CONC_O,TOP_H+.9,grey(1));bowl.sweep(span(ring,0,PERIM),CONC_O,TOP_H+.9,REAR_O,REAR_H,grey(1));proxy(bowl,'Arquibancada_arena');
  const roof=new Mesher();roof.sweep(span(ring,0,PERIM),trussIn,trussBottom(trussIn),S.roofOut,roofH(S.roofOut)+.3,grey(1));
  for(const s of girderS){const p=at(s,S.column);roof.box(P3(p,roofH(S.column)/2),[p.tx,0,-p.ty],UP,[p.nx,0,-p.ny],.6,roofH(S.column)/2,.5,grey(1));}
  {const {width:W,height:H,o,top}=S.screen;for(const sc of [0,WEST]){const p=at(sc,o);roof.box(P3(p,top-H/2),[p.tx,0,-p.ty],UP,[p.nx,0,-p.ny],W/2+.4,H/2+.4,.5,grey(1));}}
  proxy(roof,'Cobertura_arena');
 }

 // --- The crowd's steps: rows filled in blocks, more in the lower rows and along the long sides, fewer up in the corners.
 const crowdSteps=[];
 {
  const popular=sec=>{const mid=sec.mid,g=segAt(mid);if(g===SEGS[2])return 1;if(g===SEGS[6])return .85;if(sec.end)return .7;return .5;};
  const maxRow=mobile?12:S.rows;
  for(const row of seatRows){
   if(row.k>=maxRow)continue;
   const o1=rowO(row.k)+.45,o2=rowO(row.k)+.65,y=rowH(row.k)+.24,rowFactor=row.k<10?1:1-(row.k-10)/(S.rows-10)*.55;
   for(const [a,b] of row.free){
    const s0=sOf(a,row.o),arc=at(sOf((a+b)/2,row.o)).arc,sec=sections[sectionOf(s0)];
    const pieces=[];if(!arc||b-a<9)pieces.push([a,b]);else{let l=a;while(b-l>4){const step=Math.min(b-l,4.5+hash(l,row.k)*3);pieces.push([l,l+step]);l+=step;}if(pieces.length&&b-l>0)pieces.at(-1)[1]=b;}
    for(const [la,lb] of pieces){
     if(lb-la<4)continue;
     const want=popular(sec)*rowFactor*attendance*1.65,block=noise2((la+lb)/2/16+row.k*.13,row.k/3.2+sec.i*1.7);
     if(block>want)continue;
     const sa=sOf(la,row.o),sb=sOf(lb,row.o),c=(u,o)=>{const p=at(u,o);return {x:p.x,y,z:-p.y};},mid=at(sOf((la+lb)/2,row.o));
     const step={corners:[c(sa,o1),c(sb,o1),c(sb,o2),c(sa,o2)],face:[-mid.nx,mid.ny]};
     const om=(o1+o2)/2;if(om>S.roofIn)step.depth=Math.min(1,(om-S.roofIn)/(REAR_O-S.roofIn));
     let sun=0;for(let k=0;k<4;k++){const p=at(sOf(la+(lb-la)*(k+.5)/4,row.o),om);if(!underRoof(p.x,p.y,y+1.1))sun++;}step.sun=sun/4;
     crowdSteps.push(step);
    }
   }
  }
 }

 const spillLight=new THREE.HemisphereLight(0xfff0d8,0x5d5850,0);spillLight.name='Arena_luz_refletores';spillLight.position.set(0,40,0);root.add(spillLight);
 // --- Night: the lamps' strengths, the heads' lenses and glow, a little spill on the stands and under the roof.
 let level=0;
 function setLights(value){
  level=Math.max(0,Math.min(1,+value||0));
  lensLevel.value=level;glowMesh.visible=level>0;glowMaterial.uniforms.glowStrength.value=level;
  for(const l of lamps)l.strength=S.lampStrength*level;
  spill.value=.07*level;spillLight.intensity=.22*level;
  membraneGlow.value.setRGB(.05+.09*level,.048+.085*level,.043+.075*level);
 }
 setLights(0);

 // --- Counts.
 let draws=0,triangles=0;
 root.traverse(o=>{if(!o.isMesh)return;const g=o.geometry,n=(g.index?g.index.count:g.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);triangles+=n;if(o.visible!==false||o===glowMesh)draws++;});
 const stats={draws,triangles:Math.round(triangles),seats:seatCount,banners,boards,crowdSteps:crowdSteps.length,crowdMetres:Math.round(crowdSteps.reduce((s,st)=>s+Math.hypot(st.corners[1].x-st.corners[0].x,st.corners[1].z-st.corners[0].z),0)),
  lampHeads:headPos.length,lamps:lamps.length,tvSpots:tvSpots.length,vomitories:vomitories.length,aisles:aisles.length,obstacles:obstacles.length,perimeter:+PERIM.toFixed(2),mobile};
 return {root,obstacles,crowdSteps,lamps,tvSpots,stats,
  setLights,
  setScreens(lines){return screen.draw(lines);},
  get level(){return level;},
  // For the preview and checks: the section and the outline.
  layout:{STADIUM,at,sOf,lenAt,lineLength,PERIM,rowO,rowH,roofH,notches,aisles}};
}
