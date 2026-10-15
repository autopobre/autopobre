import * as THREE from 'three';
import {mergeVertices,toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';

// The city's own vehicles (Floripa, data.scenery.city): the traffic held at the street closures and the cars parked along
// the curbs (street-closures.js). Low-poly modern cars of a Brazilian street (hatch, small hatch, sedan, SUV, compact and
// double-cab pickups, cargo van, city bus, delivery motorbike), each built once as a template: a body lofted through
// sections along its length (sill, waist, belt and roof lines; trapezoid wheel arches; glass in the window band and on
// the screens), octagon wheels, lamps, plates and mirrors on the end faces, and a dark patch under the floor for the
// contact shadow. A box-ish far version of each for the distance. Templates are copied into static batches (CityBatch: one
// geometry per area chunk, merged with whatever else the chunk draws in the same material), each copy with its own paint,
// rims, scale and ride height, so a street of them is one draw call and never a row of clones.

// Repeatable random numbers (mulberry32, as street-walls.js).
export function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
// Linear colours (vertex colours are linear): an sRGB hex scaled by k.
export const lin=(hex,k=1)=>{const c=new THREE.Color(hex);return [c.r*k,c.g*k,c.b*k];};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};

// Surface finishes [roughness, metalness], written per vertex (the material reads them instead of its own).
export const FINISH={paint:[.3,.22],solid:[.42,0],glass:[.05,.3],rubber:[.92,0],chrome:[.22,.9],alloy:[.35,.75],plastic:[.62,0],trim:[.5,0],
 steel:[.4,.7],galvanized:[.48,.62],concrete:[.93,0],lens:[.12,0],vinyl:[.7,0],board:[.55,0],cloth:[.85,0]};
// Lamps (the surface's third channel): 1 an amber flasher (each its own phase and rate), 2 a headlamp (lit at night), 3 a
// brake lamp (lit), 4 a tail lamp (lit at night), 5 a lit sign (a bus's destination). A copy can switch them (CityBatch).
export const GLOW={none:0,flasher:1,head:2,brake:3,tail:4,sign:5};
// Vertex roles: 0 a fixed colour, 1 paint, 2, 3 and 7 the faces of a sign (uv into the region given to the copy: signA, signB,
// signC), 4 rims, 5 the second colour (a bus's stripe, a rider's jacket and box), 6 a fixed place in the atlas (the template's uv).
export const ROLE={fixed:0,paint:1,signA:2,signB:3,rim:4,accent:5,atlas:6,signC:7};

// Triangles of one template in its own frame (x forward, y left, z up; metres), with their colour, finish, lamp and role.
// geometry() smooths the normals within the crease angle and welds the vertices into an indexed geometry.
export class Shape{
 constructor(){this.v=[];}
 tri(a,b,c,col,fin,{role=0,glow=0,phase=0,uv=null}={}){
  const q=[a,b,c];for(let i=0;i<3;i++){const p=q[i],t=uv?uv[i]:[0,0],k=typeof col==='function'?col(p):col;this.v.push(p[0],p[1],p[2],k[0],k[1],k[2],fin[0],fin[1],glow,phase,role,t[0],t[1]);}
 }
 // A planar quad a-b-c-d, turned to face `out` when given.
 quad(a,b,c,d,col,fin,o={}){
  let uv=o.uv;if(o.out&&dot(cross(sub(c,a),sub(d,b)),o.out)<0){[b,d]=[d,b];if(uv)uv=[uv[0],uv[3],uv[2],uv[1]];}
  this.tri(a,b,c,col,fin,{...o,uv:uv&&[uv[0],uv[1],uv[2]]});this.tri(a,c,d,col,fin,{...o,uv:uv&&[uv[0],uv[2],uv[3]]});
 }
 // A convex polygon (fan from its first point) facing `out`.
 poly(pts,col,fin,out,o={}){
  const n=[0,0,0];for(let i=1;i<pts.length-1;i++){const m=cross(sub(pts[i],pts[0]),sub(pts[i+1],pts[0]));n[0]+=m[0];n[1]+=m[1];n[2]+=m[2];}
  if(dot(n,out)<0)pts=[...pts].reverse();for(let i=1;i<pts.length-1;i++)this.tri(pts[0],pts[i],pts[i+1],col,fin,o);
 }
 // An axis-aligned box x0..x1 × y0..y1 × z0..z1; faces skipped by name (bottom by default).
 box(x0,x1,y0,y1,z0,z1,col,fin,{skip='bottom',...o}={}){
  const P=(i,j,k)=>[i?x1:x0,j?y1:y0,k?z1:z0];
  const F={back:[P(0,0,0),P(0,1,0),P(0,1,1),P(0,0,1),[-1,0,0]],front:[P(1,0,0),P(1,1,0),P(1,1,1),P(1,0,1),[1,0,0]],right:[P(0,0,0),P(1,0,0),P(1,0,1),P(0,0,1),[0,-1,0]],
   left:[P(0,1,0),P(1,1,0),P(1,1,1),P(0,1,1),[0,1,0]],bottom:[P(0,0,0),P(1,0,0),P(1,1,0),P(0,1,0),[0,0,-1]],top:[P(0,0,1),P(1,0,1),P(1,1,1),P(0,1,1),[0,0,1]]};
  for(const [name,[a,b,c,d,out]] of Object.entries(F))if(!skip.includes(name))this.quad(a,b,c,d,col,fin,{...o,out});
 }
 // An n-sided tube from p to q (radius r0 at p, r1 at q), any direction; caps on request.
 post(p,q,r0,r1,n,col,fin,{rot=0,top=false,bottom=false,...o}={}){
  const d=unit(sub(q,p)),e1=unit(Math.abs(d[2])>.99?cross([0,1,0],d):cross(d,[0,0,1])),e2=cross(d,e1);
  const ring=(c,r)=>Array.from({length:n},(_,i)=>{const a=rot+i*2*Math.PI/n,x=Math.cos(a)*r,y=Math.sin(a)*r;return [c[0]+e1[0]*x+e2[0]*y,c[1]+e1[1]*x+e2[1]*y,c[2]+e1[2]*x+e2[2]*y];});
  const A=ring(p,r0),B=ring(q,r1);
  for(let i=0;i<n;i++){const j=(i+1)%n,m=sub([(A[i][0]+A[j][0])/2,(A[i][1]+A[j][1])/2,(A[i][2]+A[j][2])/2],p);this.quad(A[i],A[j],B[j],B[i],col,fin,{...o,out:sub(m,d.map(v=>v*dot(m,d)))});}
  if(top&&r1>0)this.poly(B,col,fin,d,o);if(bottom&&r0>0)this.poly(A,col,fin,d.map(v=>-v),o);
 }
 // The template: an indexed geometry's arrays (position, normal, colour, surface as bytes, role, uv) and its counts.
 template(crease=.7){
  const n=this.v.length/13,pos=new Float32Array(n*3),col=new Float32Array(n*3),surf=new Float32Array(n*4),role=new Float32Array(n),uv=new Float32Array(n*2);
  for(let i=0;i<n;i++){const k=i*13;pos.set(this.v.slice(k,k+3),i*3);col.set(this.v.slice(k+3,k+6),i*3);surf.set([this.v[k+6],this.v[k+7],this.v[k+8]/255,this.v[k+9]],i*4);role[i]=this.v[k+10];uv.set(this.v.slice(k+11,k+13),i*2);}
  let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setAttribute('surf',new THREE.BufferAttribute(surf,4));g.setAttribute('role',new THREE.BufferAttribute(role,1));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  g=mergeVertices(toCreasedNormals(g,crease),1e-4);
  const a=g.attributes,box=new THREE.Box3().setFromBufferAttribute(a.position);
  const out={count:a.position.count,pos:a.position.array,nor:a.normal.array,col:a.color.array,surf:Uint8Array.from(a.surf.array,v=>Math.round(Math.min(1,Math.max(0,v))*255)),role:Uint8Array.from(a.role.array),uv:a.uv.array,index:g.index.array,box};
  out.triangles=out.index.length/3;g.dispose();return out;
 }
}

// ---------- The vehicles ----------
// Each car: length L, width W, wheel radius R, wheelbase wb, front overhang fo, sill and belt heights, tumblehome (how much
// narrower the roof is than the waist), and its top line from the rear face to the front face: [x, z, kind of the stretch
// after it]. Stretches: 'body' (hood, trunk, tail), 'bed' (a pickup's bed under its cover), 'cargo' (a van's blind sides),
// 'cabin' (side windows, roof), 'pillar' (the B pillar, black), 'screen' (windscreen: glass on top and at the sides),
// 'rearglass' (rear window on top, C pillar at the sides), 'busglass' (a bus's windows).
const CARS={
 hatch:{L:3.95,W:1.72,R:.3,wb:2.5,fo:.78,sill:.3,belt:.98,tumble:.17,top:[[-1.975,.98,'body'],[-1.87,1.1,'rearglass'],[-1.5,1.39,'cabin'],[-.62,1.45,'pillar'],[-.52,1.45,'cabin'],[.3,1.46,'screen'],[1.02,.93,'body'],[1.975,.79]]},
 small:{L:3.62,W:1.66,R:.29,wb:2.38,fo:.7,sill:.32,belt:.99,tumble:.15,top:[[-1.81,.99,'body'],[-1.71,1.11,'rearglass'],[-1.38,1.44,'cabin'],[-.48,1.5,'pillar'],[-.39,1.5,'cabin'],[.32,1.5,'screen'],[1.0,.94,'body'],[1.81,.8]]},
 sedan:{L:4.5,W:1.76,R:.31,wb:2.62,fo:.86,sill:.3,belt:.99,tumble:.17,top:[[-2.25,.95,'body'],[-2.14,1.03,'body'],[-1.42,1.05,'rearglass'],[-.86,1.42,'cabin'],[-.12,1.44,'pillar'],[-.02,1.44,'cabin'],[.58,1.44,'screen'],[1.38,.93,'body'],[2.25,.78]]},
 suv:{L:4.4,W:1.82,R:.34,wb:2.64,fo:.86,sill:.42,belt:1.1,tumble:.15,cladding:true,rails:true,top:[[-2.2,1.12,'body'],[-2.11,1.24,'rearglass'],[-1.96,1.6,'cabin'],[-.62,1.64,'pillar'],[-.52,1.64,'cabin'],[.38,1.65,'screen'],[1.16,1.08,'body'],[2.2,.95]]},
 pickup:{L:5.3,W:1.86,R:.37,wb:3.08,fo:.9,sill:.5,belt:1.2,tumble:.14,cladding:true,top:[[-2.65,1.17,'bed'],[-.97,1.2,'rearglass'],[-.92,1.76,'cabin'],[-.08,1.78,'pillar'],[.02,1.78,'cabin'],[.75,1.78,'screen'],[1.55,1.2,'body'],[2.65,1.04]]},
 compact:{L:4.45,W:1.73,R:.31,wb:2.74,fo:.78,sill:.34,belt:1.0,tumble:.14,top:[[-2.22,1.02,'bed'],[-.62,1.04,'rearglass'],[-.57,1.5,'cabin'],[.42,1.53,'screen'],[1.2,.98,'body'],[2.22,.84]]},
 van:{L:5.4,W:2.0,R:.35,wb:3.4,fo:.95,sill:.45,belt:1.15,tumble:.06,rail:.12,top:[[-2.7,2.3,'cargo'],[-2.6,2.42,'cargo'],[1.0,2.42,'cabin'],[1.55,2.3,'screen'],[2.2,1.18,'body'],[2.7,1.0]]},
 // A city bus: windows in a band from 1.25 to 2.55 m, the upper side and roof above it, a stripe of the second colour
 // along the waist; two axles, dual rear wheels.
 bus:{L:12,W:2.5,R:.5,wb:6.3,fo:2.6,sill:.42,belt:1.25,zm:1.0,tumble:.02,rail:.12,winTop:2.55,bus:true,top:[]},
};
{const t=CARS.bus.top;t.push([-6,3.0,'body'],[-5.88,3.12,'body']);for(let x=-5.3;x<4.3;x+=1.42)t.push([x,3.14,'pillar'],[x+.13,3.14,'busglass']);t.push([4.4,3.14,'pillar'],[4.55,3.14,'body'],[5.88,3.12,'body'],[6,3.0]);}
export const CITY_CAR_SIZE=Object.fromEntries(Object.entries(CARS).map(([k,d])=>[k,{L:d.L,W:d.W}]));
CITY_CAR_SIZE.moto={L:2.0,W:.8};

const C={glass:lin(0x121820),under:lin(0x070707),rubber:lin(0x141414),black:lin(0x0d0e10),cladding:lin(0x1c1d1f),vinyl:lin(0x101011),lamp:lin(0xe8e6dc),tail:lin(0xb0141a),amber:lin(0xff9a1c),plate:lin(0xeceee8),plateBand:lin(0x1d3f9a),white:[1,1,1]};

function carShape(d,far){
 const sh=new Shape(),L=d.L,w=d.W/2,R=d.R,xf=L/2-d.fo,xr=xf-d.wb,top=d.top,P=FINISH;
 const zAt=x=>{for(let i=0;i<top.length-1;i++)if(x<=top[i+1][0]+1e-9){const [x0,z0]=top[i],[x1,z1]=top[i+1];return z0+(z1-z0)*(x-x0)/((x1-x0)||1);}return top.at(-1)[1];};
 const kindAt=x=>{for(let i=0;i<top.length-1;i++)if(x<top[i+1][0])return top[i][2];return top.at(-2)[2];};
 const cabin=z=>z>d.belt+.15;
 // The paint a little darker toward the sill (road dirt, the panels turning under): the shade is in the template, the colour the copy's.
 const shaded=p=>{const k=.8+.2*Math.max(0,Math.min(1,(p[2]-d.sill)/((d.belt-d.sill)||1)));return [k,k,k];};
 const paint=[far?C.white:shaded,P.paint,{role:ROLE.paint}],glass=[C.glass,P.glass,{}],black=[C.black,P.trim,{}],under=[C.under,P.rubber,{}];
 if(far){
  // The far car: the body as a box from sill to belt, the wheels as a dark band below it, the cabin as a frustum of glass
  // under a painted roof (a bus: its window band and the upper side), and the four lamps.
  sh.box(-L/2,L/2,-w,w,d.sill,d.belt,...paint.slice(0,2),{role:ROLE.paint});
  sh.box(-L/2+.25,L/2-.25,-w+.05,w-.05,.03,d.sill,C.rubber,P.rubber,{skip:'bottom top'});
  if(d.bus){sh.box(-L/2+.05,L/2-.05,-w+.01,w-.01,d.belt,d.winTop,C.glass,P.glass,{skip:'bottom top'});sh.box(-L/2+.05,L/2-.05,-w+.01,w-.01,d.winTop,top[2][1],C.white,P.paint,{role:ROLE.paint,skip:'bottom'});}
  else{
   const cab=top.map((p,i)=>[p,i]).filter(([p])=>cabin(p[1])),i0=cab[0][1],i1=cab.at(-1)[1],b0=top[Math.max(0,i0-1)][0],b1=top[Math.min(top.length-1,i1+1)][0],t0=top[i0][0],t1=top[i1][0],zt=Math.max(...cab.map(([p])=>p[1]));
   const wt=w-d.tumble,q=(x,y,z)=>[x,y,z],A=[q(b0,-w+.03,d.belt),q(b1,-w+.03,d.belt),q(b1,w-.03,d.belt),q(b0,w-.03,d.belt)],B=[q(t0,-wt,zt),q(t1,-wt,zt),q(t1,wt,zt),q(t0,wt,zt)];
   sh.quad(A[0],A[1],B[1],B[0],...glass.slice(0,2),{out:[0,-1,0]});sh.quad(A[3],A[2],B[2],B[3],...glass.slice(0,2),{out:[0,1,0]});
   sh.quad(A[1],A[2],B[2],B[1],...glass.slice(0,2),{out:[1,0,.5]});sh.quad(A[0],A[3],B[3],B[0],...glass.slice(0,2),{out:[-1,0,.5]});
   sh.quad(...B,C.white,P.paint,{out:[0,0,1],role:ROLE.paint});
  }
  const zl=d.bus?.75:d.belt-.14;
  for(const s of [-1,1]){sh.quad([L/2+.01,s*w*.55,zl],[L/2+.01,s*w*.9,zl],[L/2+.01,s*w*.9,zl+.1],[L/2+.01,s*w*.55,zl+.1],C.lamp,P.lens,{out:[1,0,0],glow:GLOW.head});
   sh.quad([-L/2-.01,s*w*.6,zl],[-L/2-.01,s*w*.92,zl],[-L/2-.01,s*w*.92,zl+.1],[-L/2-.01,s*w*.6,zl+.1],C.tail,P.lens,{out:[-1,0,0],glow:GLOW.tail});}
  return sh.template(.2);
 }
 // Stations along the car: the top line's points, an inset at each end (the rounded corners) and four at each wheel arch.
 const xs=new Set(top.map(p=>p[0]));xs.add(L/2-.14);xs.add(-L/2+.14);
 const axles=[xr,xf],archTop=2*R+.03;
 for(const xa of axles)for(const k of [-1.12,-.5,.5,1.12])xs.add(+(xa+k*R).toFixed(4));
 const X=[...xs].sort((a,b)=>a-b);
 const zbAt=x=>{let z=d.sill;for(const xa of axles){const t=Math.abs(x-xa)/R;if(t<=.5+1e-6)z=Math.max(z,archTop);else if(t<1.12)z=Math.max(z,archTop-(archTop-d.sill)*(t-.5)/.62);}return z;};
 // A car's roof is crowned (a few centimetres higher in the middle) and its belt line rises toward the tail; its sides
 // tuck in under the sill and lean in above the waist.
 const roof=top.filter(p=>cabin(p[1])).map(p=>p[0]),r0=Math.min(...roof),r1=Math.max(...roof),boxy=d.bus||d.rail;
 const crown=x=>{const t=(x-(r0+r1)/2)/((r1-r0)/2||1);return boxy||Math.abs(t)>=1?0:.035*(1-t*t);};
 const sections=X.map((x,i)=>{
  const end=i===0||i===X.length-1,zt=zAt(x)-(end?.04:0)+crown(x),zb=zbAt(x)+(end?.07:0),ws=w-(end?.1:0),cab=cabin(zAt(x));
  const belt=d.belt+(boxy?0:.06*Math.max(0,Math.min(1,(L/2-x)/L)));
  const zs=Math.min(belt,zt-.05),zm=Math.min(zs-.05,Math.max(zb+.06,d.zm??(d.sill+d.belt)/2+.05)),wt=cab?ws-d.tumble:ws-.06;
  const zw=d.winTop&&cab?Math.min(d.winTop,zt-.1):zt-(cab?.02:0);
  // Left half from the bottom up (P0 bottom edge, P1 widest, P2 belt, P3 top of the window band, P4 roof edge on a van or a bus).
  const half=[[ws-(boxy?.05:.08),zb],[ws,zm],[ws-(boxy?.02:.045),zs],[wt,zw]];if(d.rail&&cab)half.push([wt-d.rail,zt]);else if(d.rail)half.push([wt-d.rail,zt+.005]);
  return {x,pts:[...half.map(([y,z])=>[x,y,z]),...half.slice().reverse().map(([y,z])=>[x,-y,z])],n:half.length};
 });
 // Band kinds round a section (left side up, over the top, right side down, under the floor).
 const n=sections[0].n,kinds=n===5?['low','up','win','rail','top','rail','win','up','low','bottom']:['low','up','win','top','win','up','low','bottom'];
 const look=(cls,kind)=>{
  if(kind==='bottom')return under;
  if(kind==='low')return d.cladding?[C.cladding,P.plastic,{}]:paint;
  if(kind==='up')return d.bus?[C.white,P.paint,{role:ROLE.accent}]:paint;
  if(kind==='rail')return paint;
  if(kind==='win')return {cabin:glass,screen:glass,pillar:black,busglass:glass}[cls]??paint;
  return {bed:[C.vinyl,P.vinyl,{}],screen:glass,rearglass:glass}[cls]??paint;
 };
 for(let i=0;i<sections.length-1;i++){
  const A=sections[i].pts,B=sections[i+1].pts,cls=kindAt((sections[i].x+sections[i+1].x)/2),m=A.length;
  for(let k=0;k<m;k++){const j=(k+1)%m,[col,fin,o]=look(cls,kinds[k]),mid=[(A[k][0]+B[j][0])/2,(A[k][1]+A[j][1])/2,(A[k][2]+A[j][2])/2];
   sh.quad(A[k],A[j],B[j],B[k],col,fin,{...o,out:[0,mid[1],mid[2]-(kinds[k]==='bottom'?1:d.belt*.6)]});}
 }
 // The end faces, and what is on them (a little proud of the face): lamps, grille, plates, bumper.
 const front=sections.at(-1),rear=sections[0];
 sh.poly(front.pts,shaded,P.paint,[1,0,0],{role:ROLE.paint});sh.poly(rear.pts,shaded,P.paint,[-1,0,0],{role:ROLE.paint});
 const face=(sec,s)=>{const x=sec.x+s*.006,zb=sec.pts[0][2],zs=sec.pts[2][2],h=zs-zb,wf=sec.pts[1][1];return {q:(y0,y1,z0,z1,col,fin,o={})=>sh.quad([x,y0,z0],[x,y1,z0],[x,y1,z1],[x,y0,z1],col,fin,{...o,out:[s,0,0]}),zb,h,wf};};
 {const {q,zb,h,wf}=face(front,1);
  if(d.bus){q(-wf+.12,wf-.12,1.1,2.62,C.glass,P.glass);q(-wf+.3,wf-.3,2.7,2.98,C.white,P.lens,{role:ROLE.signA,glow:GLOW.sign,uv:[[0,0],[1,0],[1,1],[0,1]]});q(-wf+.02,wf-.02,.42,.66,C.black,P.plastic);
   for(const s of [-1,1])q(s*(wf-.36),s*(wf-.1),.74,.92,C.lamp,P.lens,{glow:GLOW.head});q(-.2,.2,.68,.81,C.plate,P.board);}
  else{for(const s of [-1,1])q(s*wf*.5,s*wf*.9,zb+.62*h,zb+.9*h,C.lamp,P.lens,{glow:GLOW.head});
   q(-wf*.42,wf*.42,zb+.42*h,zb+.78*h,C.black,P.plastic);q(-wf*.6,wf*.6,zb+.06*h,zb+.24*h,C.black,P.plastic);
   q(-.2,.2,zb+.27*h,zb+.27*h+.13,C.plate,P.board);q(-.2,.2,zb+.27*h+.1,zb+.27*h+.13,C.plateBand,P.board);}}
 {const {q,zb,h,wf}=face(rear,-1);
  if(d.bus){q(-wf+.2,wf-.2,2.0,2.7,C.glass,P.glass);for(const s of [-1,1])q(s*(wf-.22),s*(wf-.06),.75,1.65,C.tail,P.lens,{glow:GLOW.tail});q(-wf+.02,wf-.02,.42,.62,C.black,P.plastic);q(-.2,.2,.75,.88,C.plate,P.board);}
  else{for(const s of [-1,1])q(s*wf*.58,s*wf*.95,zb+.64*h,zb+.93*h,C.tail,P.lens,{glow:GLOW.tail});
   q(-wf*.85,wf*.85,zb,zb+.13*h,C.black,P.plastic);q(-.2,.2,zb+.32*h,zb+.32*h+.13,C.plate,P.board);q(-.2,.2,zb+.32*h+.1,zb+.32*h+.13,C.plateBand,P.board);}}
 // Wheels: octagons with a flat at the bottom (on the ground), tread and the outer face, the rim proud of it.
 // (Rp: the octagon's corner radius, so that its flat bottom lies on the ground.)
 const tw=d.bus?.3:.2,Rp=R/Math.cos(Math.PI/8);
 for(const xa of axles)for(const s of [-1,1]){
  const yo=s*(w-.025),yi=s*(w-.025-(d.bus&&xa===xr?.55:tw)),ring=(y,r)=>Array.from({length:8},(_,k)=>{const a=Math.PI/8+k*Math.PI/4;return [xa+Math.cos(a)*r,y,R+Math.sin(a)*r];});
  const O=ring(yo,Rp),I=ring(yi,Rp);
  for(let k=0;k<8;k++){const j=(k+1)%8;sh.quad(O[k],O[j],I[j],I[k],C.rubber,P.rubber,{out:[(O[k][0]+O[j][0])/2-xa,0,(O[k][2]+O[j][2])/2-R]});}
  sh.poly(O,C.rubber,P.rubber,[0,s,0]);sh.poly(ring(yo+s*.012,R*.64),C.white,P.alloy,[0,s,0],{role:ROLE.rim});
 }
 // Door mirrors at the windscreen's foot; a SUV's roof rails; the dark patch under the floor.
 const cowl=top.findLast(p=>p[2]==='screen')?.[0]??0,base=top.find(p=>p[0]>cowl)?.[0]??cowl+.6;
 if(!d.bus)for(const s of [-1,1])sh.box(base-.2,base-.06,s>0?w+.01:-w-.13,s>0?w+.13:-w-.01,d.belt+.06,d.belt+.17,C.white,P.paint,{role:ROLE.paint});
 if(d.rails){const c=top.filter(p=>cabin(p[1])),zr=Math.max(...c.map(p=>p[1]));for(const s of [-1,1])sh.box(c[0][0]+.15,c.at(-1)[0]-.1,s*(w-d.tumble-.12)-.025,s*(w-d.tumble-.12)+.025,zr-.01,zr+.05,C.black,P.plastic);}
 sh.quad([-L/2+.2,-w+.06,.012],[L/2-.2,-w+.06,.012],[L/2-.2,w-.06,.012],[-L/2+.2,w-.06,.012],C.under,P.rubber,{out:[0,0,1]});
 return sh.template(.75);
}

// A delivery motorbike (a motoboy at the head of the queue): two wheels, frame, tank and seat, the box on the back (the
// second colour), the rider in jacket (the rims' colour: a motorbike's wheels keep theirs) and helmet (the paint), one foot down.
function motoShape(far){
 const sh=new Shape(),P=FINISH;
 if(far){sh.box(-.95,.95,-.2,.2,.1,1.0,C.black,P.plastic,{skip:'bottom'});sh.box(-.9,-.45,-.24,.24,.85,1.3,C.white,P.solid,{role:ROLE.accent});sh.box(-.35,.2,-.2,.2,1.0,1.65,C.white,P.cloth,{role:ROLE.rim});return sh.template(.2);}
 for(const xa of [-.68,.66]){sh.post([xa,-.05,.3],[xa,.05,.3],.3,.3,8,C.rubber,P.rubber,{top:true,bottom:true});sh.post([xa,-.055,.3],[xa,.055,.3],.15,.15,6,lin(0x8d9195),P.alloy,{top:true,bottom:true});}
 sh.post([.66,0,.3],[.42,0,1.02],.03,.03,4,C.black,P.steel);sh.box(.36,.42,-.38,.38,1.0,1.04,C.black,P.plastic,{skip:''});
 sh.box(-.3,.35,-.13,.13,.3,.62,C.black,P.plastic);sh.box(.05,.42,-.14,.14,.68,.92,C.white,P.paint,{role:ROLE.paint});sh.box(-.55,.08,-.13,.13,.66,.82,C.black,P.vinyl);
 sh.box(-.7,-.25,-.11,.11,.42,.7,C.white,P.paint,{role:ROLE.paint});sh.box(-.95,-.42,-.23,.23,.85,1.3,C.white,P.solid,{role:ROLE.accent});
 sh.quad([.47,-.07,.9],[.47,.07,.9],[.47,.07,1.0],[.47,-.07,1.0],C.lamp,P.lens,{out:[1,0,0],glow:GLOW.head});sh.quad([-.96,-.06,.78],[-.96,.06,.78],[-.96,.06,.84],[-.96,-.06,.84],C.tail,P.lens,{out:[-1,0,0],glow:GLOW.tail});
 // Rider: thighs along the seat, shins down to the pegs (the left foot on the ground), torso leaning to the bars, arms, helmet.
 const jeans=lin(0x2a3346),boot=lin(0x18120e);
 for(const s of [-1,1]){sh.post([-.2,s*.13,.86],[.18,s*.17,.84],.07,.06,5,jeans,P.cloth);sh.post([.18,s*.17,.84],s<0?[.12,s*.36,.06]:[.1,s*.2,.38],.055,.05,5,jeans,P.cloth);sh.box(s<0?.06:.04,s<0?.26:.24,s<0?-.42:.15,s<0?-.3:.27,s<0?0:.32,s<0?.1:.42,boot,P.rubber,{skip:''});}
 sh.post([-.2,0,.92],[.02,0,1.42],.17,.15,6,C.white,P.cloth,{role:ROLE.rim,top:true});
 for(const s of [-1,1])sh.post([.0,s*.2,1.36],[.36,s*.3,1.08],.045,.04,5,C.white,P.cloth,{role:ROLE.rim});
 sh.post([.04,0,1.46],[.06,0,1.72],.14,.12,8,C.white,P.paint,{role:ROLE.paint,top:true,bottom:true});sh.quad([.17,-.1,1.55],[.17,.1,1.55],[.18,.1,1.64],[.18,-.1,1.64],C.glass,P.glass,{out:[1,0,0]});
 return sh.template(.6);
}

const TEMPLATES=new Map();
// The template of a vehicle type (CITY_CAR_TYPES), near or far, built once.
export function cityCarTemplate(type,far=false){
 const key=type+(far?':far':'');
 if(!TEMPLATES.has(key))TEMPLATES.set(key,type==='moto'?motoShape(far):carShape(CARS[type],far));
 return TEMPLATES.get(key);
}
export const CITY_CAR_TYPES=Object.freeze([...Object.keys(CARS),'moto']);

// What drives on a Brazilian city street today (the common cars as a share of the queue): hatches and SUVs above all, then
// sedans, the small hatches, compact and double-cab pickups, a cargo van now and then.
const MIX=[['hatch',.27],['suv',.2],['sedan',.18],['small',.13],['compact',.08],['pickup',.07],['van',.07]];
export function pickCarType(rand){let r=rand();for(const [t,w] of MIX){if(r<w)return t;r-=w;}return 'hatch';}
// Paint: mostly white, silver, grey and black, some red, blue, beige and wine; every car its own shade of its colour.
const PAINTS=[[0xf2f2ef,.27],[0xb8bbbd,.19],[0x70757a,.11],[0x4b4f53,.05],[0x111214,.15],[0x9c1a1a,.07],[0x203f78,.04],[0x5a7898,.02],[0xa79579,.03],[0x4c1720,.03],[0x2d4838,.02],[0xd2ae2a,.01],[0xc8541a,.01]];
export function carPaint(rand){
 let r=rand(),hex=PAINTS[0][0];for(const [h,w] of PAINTS){if(r<w){hex=h;break;}r-=w;}
 const c=new THREE.Color(hex),hsl={};c.getHSL(hsl);c.setHSL((hsl.h+(rand()-.5)*.02+1)%1,Math.min(1,hsl.s*(.85+rand()*.3)),Math.min(.97,hsl.l*(.92+rand()*.14)));
 return [c.r,c.g,c.b];
}
const RIMS=[[0xa8acaf,.45],[0x7d8185,.15],[0x34373a,.22],[0x1a1b1c,.1],[0xc9cbcc,.08]];
export function rimColor(rand){let r=rand();for(const [h,w] of RIMS){if(r<w)return lin(h,.9+rand()*.15);r-=w;}return lin(0xa8acaf);}

// A placement frame: origin (track x, y, z) and the template's x (forward), y (left) and z (up) axes in track coordinates,
// heading h; pitch lifts the nose, roll the left side (radians); s scales each axis.
export function frameAt(x,y,z,h,{pitch=0,roll=0,s=[1,1,1]}={}){
 const c=Math.cos(h),sn=Math.sin(h),f=unit([c*Math.cos(pitch),sn*Math.cos(pitch),Math.sin(pitch)]),l0=[-sn*Math.cos(roll),c*Math.cos(roll),Math.sin(roll)];
 const u=unit(cross(f,l0)),l=cross(u,f);
 return {o:[x,y,z],x:f.map(v=>v*s[0]),y:l.map(v=>v*s[1]),z:u.map(v=>v*s[2]),n:[f,l,u]};
}
// A car standing on the ground: its four wheels on ground(x, y), the body pitched and rolled to them.
export function carFrame(type,x,y,h,ground,{s=[1,1,1],lift=0}={}){
 const d=CARS[type]??{L:2,W:.6,wb:1.34,fo:.34},c=Math.cos(h),sn=Math.sin(h),half=(d.wb??1.3)/2,mid=(d.L/2-(d.fo??.4))-half,tr=d.W/2-.12;
 const at=(a,b)=>ground(x+c*(mid+a)-sn*b,y+sn*(mid+a)+c*b)??null;
 const fl=at(half,tr),fr=at(half,-tr),rl=at(-half,tr),rr=at(-half,-tr);if([fl,fr,rl,rr].some(v=>v===null))return null;
 const pitch=Math.atan2((fl+fr-rl-rr)/2,2*half),roll=type==='moto'?0:Math.atan2((fl+rl-fr-rr)/2,2*tr),z=(fl+fr+rl+rr)/4+lift-mid*Math.sin(pitch);
 return frameAt(x,y,z,h,{pitch,roll,s});
}

// Copies of templates gathered into one static geometry (an area's cars and closures, drawn in one call). Each copy: its
// frame, and paint, rims and second colour for the roles that take them, a shade over everything (grime, fading), the
// atlas regions of its sign faces, its flashers' phase, and lamps switched: lamps:false (parked: all off), brake:true (the
// tail lamps lit as brake lamps).
export class CityBatch{
 constructor(){this.items=[];this.vertices=0;this.indices=0;}
 add(tpl,frame,o={}){this.items.push([tpl,frame,o]);this.vertices+=tpl.count;this.indices+=tpl.index.length;return this;}
 get triangles(){return this.indices/3;}
 geometry(whiteUv=[0,0],tiles=false,lod=false){
  const V=this.vertices,Tl=tiles?new Uint16Array(V):null,Ld=lod?new Float32Array(V*4):null,P=new Float32Array(V*3),N=new Int8Array(V*3),Cl=new Uint16Array(V*3),T=new Uint16Array(V*2),S=new Uint8Array(V*4),I=V>65535?new Uint32Array(this.indices):new Uint16Array(this.indices);
  const wu=Math.round(whiteUv[0]*65535),wv=Math.round(whiteUv[1]*65535);let v=0,k=0;
  for(const [t,f,o] of this.items){
   const {o:O,x:ax,y:ay,z:az,n:[nx,ny,nz]}=f,paint=o.paint??C.white,rim=o.rim??C.white,acc=o.accent??C.white,shade=o.shade??1,regions={2:o.signA,3:o.signB,7:o.signC},phase=o.phase??0;
   if(Tl)Tl.fill(o.tile??0,v,v+t.count);
   // The copy's anchor (its frame's origin) and its own draw for where it switches, the same numbers on every vertex of it:
   // one decision for the whole car. (Stored as offsets from each vertex they differed by rounding, and a car longer than the
   // offsets' reach split: some of its vertices folded away, the others stretched out to them across the screen.)
   const anchor=Ld&&o.lod?[O[0],O[2],-O[1],o.lod*(1+.999*((Math.sin(k*12.9898+v*.0001)*43758.5453)%1+1)%1)]:null;
   for(let i=0;i<t.count;i++){
    const p0=t.pos[i*3],p1=t.pos[i*3+1],p2=t.pos[i*3+2],q=v*3;
    const X=O[0]+p0*ax[0]+p1*ay[0]+p2*az[0],Y=O[1]+p0*ax[1]+p1*ay[1]+p2*az[1],Z=O[2]+p0*ax[2]+p1*ay[2]+p2*az[2];P[q]=X;P[q+1]=Z;P[q+2]=-Y;
    if(anchor)Ld.set(anchor,v*4);
    const m0=t.nor[i*3],m1=t.nor[i*3+1],m2=t.nor[i*3+2],a=m0*nx[0]+m1*ny[0]+m2*nz[0],b=m0*nx[1]+m1*ny[1]+m2*nz[1],c=m0*nx[2]+m1*ny[2]+m2*nz[2];
    N[q]=Math.round(a*127);N[q+1]=Math.round(c*127);N[q+2]=Math.round(-b*127);
    const role=t.role[i],kind=t.surf[i*4+2],lit=kind>0,tint=role===1?paint:role===4?rim:role===5?acc:null,sh=lit?1:shade;
    for(let j=0;j<3;j++)Cl[q+j]=Math.round(Math.min(1,t.col[i*3+j]*(tint?tint[j]:1)*sh)*65535);
    const r=regions[role];
    if(role===6){T[v*2]=Math.round(t.uv[i*2]*65535);T[v*2+1]=Math.round(t.uv[i*2+1]*65535);}else if(r){T[v*2]=Math.round((r[0]+t.uv[i*2]*(r[2]-r[0]))*65535);T[v*2+1]=Math.round((r[1]+t.uv[i*2+1]*(r[3]-r[1]))*65535);}else{T[v*2]=wu;T[v*2+1]=wv;}
    let g=kind;if(o.lamps===false&&(g===GLOW.head||g===GLOW.tail||g===GLOW.brake))g=0;else if(o.brake&&g===GLOW.tail)g=GLOW.brake;
    S[v*4]=t.surf[i*4];S[v*4+1]=t.surf[i*4+1];S[v*4+2]=g;S[v*4+3]=Math.round(((t.surf[i*4+3]/255+phase)%1)*255);v++;
   }
   const base=v-t.count;for(let i=0;i<t.index.length;i++)I[k++]=t.index[i]+base;
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(P,3));g.setAttribute('normal',new THREE.BufferAttribute(N,3,true));g.setAttribute('color',new THREE.BufferAttribute(Cl,3,true));
  g.setAttribute('uv',new THREE.BufferAttribute(T,2,true));g.setAttribute('surf',new THREE.BufferAttribute(S,4,true));if(Tl)g.setAttribute('cityTile',new THREE.BufferAttribute(Tl,1));if(Ld)g.setAttribute('cityLod',new THREE.BufferAttribute(Ld,4));g.setIndex(new THREE.BufferAttribute(I,1));g.computeBoundingSphere();g.computeBoundingBox();
  return g;
 }
}

// The material of the city's vehicles and closures: vertex colours (over an optional atlas of signs: the copies without a
// sign point at a white corner of it), each vertex's own roughness and metalness, and its lamp: flashers blinking each on
// its own clock, headlamps and tail lamps lit at night, brake lamps and lit signs always. setTime/setNight drive it.
// hide: a far batch's material (geometry(whiteUv, true)): its copies of the tiles listed in userData.hide (their numbers,
// -1 for none) collapse out of view, those tiles being drawn near. lod: a near batch's material (geometry(whiteUv, false,
// true)) whose cars come in two builds: the full one within cityLodDist of cityEye (the main camera, set by the caller;
// each car a few metres either way of it, so a street of them never switches at once), the box beyond.
export function cityMaterial(map=null,{hide=false,lod=false,uniforms=null}={}){
 uniforms??={cityTime:{value:0},cityNight:{value:0},cityEye:{value:new THREE.Vector3(0,1e5,0)},cityLodDist:{value:80}};
 const hidden={value:new Float32Array(8).fill(-1)};
 const m=new THREE.MeshStandardMaterial({name:hide?'Cidade_veiculos_bloqueios_longe':'Cidade_veiculos_bloqueios',vertexColors:true,map,roughness:1,metalness:0});
 m.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);if(hide)shader.uniforms.cityHide=hidden;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 surf;varying vec4 vSurf;'+(hide?'attribute float cityTile;uniform float cityHide[8];':'')).replace('#include <begin_vertex>','#include <begin_vertex>\nvSurf=surf;');
  if(lod)shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 cityLod;uniform vec3 cityEye;uniform float cityLodDist;').replace('#include <project_vertex>',`#include <project_vertex>
if(cityLod.w!=0.){vec3 anchor=(modelMatrix*vec4(cityLod.xyz,1.)).xyz;float d=distance(anchor,cityEye)+(fract(abs(cityLod.w))-.5)*8.;
 if((cityLod.w>0.)!=(d<cityLodDist))gl_Position=vec4(0.,0.,-2.,1.);}`);
  if(hide)shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nfor(int i=0;i<8;i++)if(abs(cityTile-cityHide[i])<.5)gl_Position=vec4(0.,0.,-2.,1.);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec4 vSurf;uniform float cityTime,cityNight;')
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=vSurf.x;')
   .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=vSurf.y;')
   .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
{float kind=floor(vSurf.z*255.+.5),glow=0.;
// A flasher: about once a second, on for 40% of its cycle; the rate and phase are its own.
if(kind==1.){float rate=.85+.5*fract(vSurf.w*7.31);glow=step(.6,fract(cityTime*rate+vSurf.w))*(9.+5.*cityNight)+.12;}
else if(kind==2.)glow=cityNight*5.5;
else if(kind==3.)glow=1.5+1.8*cityNight;
else if(kind==4.)glow=cityNight*2.4;
else if(kind==5.)glow=1.4+1.6*cityNight;
totalEmissiveRadiance+=vColor.rgb*glow;}`);
 };
 m.customProgramCacheKey=()=>'city-vehicles-closures-v1'+(hide?'-far':'')+(lod?'-lod':'');
 m.userData.uniforms=uniforms;m.userData.hide=hidden.value;
 return m;
}
