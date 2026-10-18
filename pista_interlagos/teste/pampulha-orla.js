import * as THREE from 'three';
import {canvasTexture} from './pit-textures.js';
import {guardrailClearance,guardrailPresent} from './physics.js';
import {branchSpace} from './branch-layout.js';
import {lightUniforms,nightLights,screenHalf} from './sea-water.js';

// The Pampulha shore's monuments, squares and viewpoints (data.scenery.landmarks point kinds, gerar_pampulha.py), placed
// on the city's 20 cm 2015 orthophoto (WMS ide_bhgeo:ORTOFOTO_2015) and drawn from Wikimedia Commons photos and the
// city's notes (2026-10-18). Track metres (x east, y north):
// - Praça de Iemanjá: the bronze Iemanjá (José Synfronini de Freitas Castro; marble 1982, bronze 1988) stands in the
//   lake since 2003, about 10 m off the shore on a round column clad in dark blue pastilhas with lighter blue waves,
//   facing the square: a long dress, hair over the back, hands open at her sides, a diadem with a star. The orthophoto
//   puts the column at (1163.1, -127.8). The Portal da Memória (Jorge dos Anjos, 2007, honouring the African matrices):
//   a 6 × 5 m corten steel frame, 20 cm thick, cut through with symbols, standing on the round grey platform that juts
//   into the lake, framing her from the square (its shadow on the photo: the frame runs N-S at x 1181.5). Around it the
//   light calçada portuguesa, benches, lamps; offerings of flowers float by the column. Uplights after dark.
// - Marco Zero da Pampulha: a 5.6 m brushed steel totem (three panels, an orange edge, a big orange "0" near the top,
//   a small plaque) in the lawn strip between the cycle path and the park's footpath by the Memorial Minas-Japão's car
//   park, a double LED lamp beside it (Commons, Sudhertzen). The landmark point is the Bike BH station of that name in
//   the car park; the totem goes by the road, just behind the lap's wall, near the park's crossing (s ≈ 4350).
// - Praça da Pampulha (Praça Geralda Damata Pimentel): the long lawn south of the lake's bay, a grey concrete plaza at
//   its north end (the lap passes its edge) and six slender concrete light towers 30 m apart along its west side (14 m
//   U-shaped channels lined with white tiles and black pinwheel triangles, the floodlights high in the channel); low
//   brick terraces and brick blocks in the lawn. Tower spots and the plaza measured on the orthophoto.
// - Mirante Bandeirantes: the ochre terrace on the shore with a grey winding path, a cream parapet with square pillars,
//   the bronze group "Eterna Modernidade" (Vânia Braga, 2016: Kubitschek pointing over the lake, Niemeyer, Burle Marx,
//   Portinari seated on a bench), a stainless sign frame with the red panel, one of the city's free lunetas. The lap
//   takes the avenue's lake-side sidewalk here: the terrace runs from just behind its wall to the water.
// - Mirante do Sabiá: the small paved lookout over the lake's north-west arm (orthophoto: 10 × 8 m east of the
//   roundabout, at the top of the slope), railing, luneta, benches, a lamp and its name.
// Everything is merged per material (five draw calls with the night sprites); nothing enters the lap's driving space
// (checked per vertex). Lamps and floods light the surfaces round them after dark through a per-vertex wash.

const DRIVE=4.6,LEVEL=.8;
function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
// Linear colours (vertex colours are linear): an sRGB hex scaled by k.
const lin=(hex,k=1)=>{const c=new THREE.Color(hex);return [c.r*k,c.g*k,c.b*k];};
const mul=(c,k)=>[c[0]*k,c[1]*k,c[2]*k];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
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
// A polygon cut by a convex one (Sutherland-Hodgman; both counter-clockwise or both clockwise, 2D).
function clipConvex(poly,clip){
 const area=P=>{let a=0;for(let i=0;i<P.length;i++){const p=P[i],q=P[(i+1)%P.length];a+=p[0]*q[1]-q[0]*p[1];}return a;},sg=Math.sign(area(clip))||1;let out=poly;
 for(let i=0;i<clip.length&&out.length;i++){const a=clip[i],b=clip[(i+1)%clip.length],side=p=>sg*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])),inp=out;out=[];
  for(let k=0;k<inp.length;k++){const p=inp[k],q=inp[(k+1)%inp.length],sp=side(p),sq=side(q);if(sp>=0)out.push(p);if(sp>=0!==sq>=0){const t=sp/(sp-sq);out.push([lerp(p[0],q[0],t),lerp(p[1],q[1],t)]);}}}
 return out;
}
const ring=(cx,cy,r,n,a0=0)=>Array.from({length:n},(_,i)=>{const a=a0+i/n*2*Math.PI;return [cx+Math.cos(a)*r,cy+Math.sin(a)*r];});

// ---------- Geometry gathered per material in track coordinates, drawn as one mesh
// Flat-shaded triangles unless per-corner normals are given. UVs per corner, or metres over `size`. Each vertex also
// carries `self` (a lamp's own light after dark, linear colour); the night wash is added later (lightUp).
class Batch{
 constructor(size=0){this.size=size;this.p=[];this.n=[];this.c=[];this.t=[];this.e=[];this.self=[0,0,0];}
 get vertices(){return this.p.length/3;}
 get triangles(){return this.p.length/9;}
 tri(a,b,c,col,uv,ns){
  const n=cross(sub(b,a),sub(c,a)),l=Math.hypot(n[0],n[1],n[2]);if(l<1e-9)return;let f=[n[0]/l,n[1]/l,n[2]/l];
  if(ns&&dot(f,[ns[0][0]+ns[1][0]+ns[2][0],ns[0][1]+ns[1][1]+ns[2][1],ns[0][2]+ns[1][2]+ns[2][2]])<0){[b,c]=[c,b];if(uv)uv=[uv[0],uv[2],uv[1]];ns=[ns[0],ns[2],ns[1]];f=mul(f,-1);}
  const q=[a,b,c];
  for(let i=0;i<3;i++){
   const p=q[i],k=typeof col==='function'?col(p):col,m=ns?ns[i]:f;this.p.push(p[0],p[2],-p[1]);this.n.push(m[0],m[2],-m[1]);this.c.push(k[0],k[1],k[2]);this.e.push(...this.self);
   let s=0,t=0;if(uv)[s,t]=uv[i];else if(this.size){if(Math.abs(f[2])>.7){s=p[0]/this.size;t=p[1]/this.size;}else{const h=Math.hypot(f[0],f[1])||1;s=(-f[1]*p[0]+f[0]*p[1])/h/this.size;t=p[2]/this.size;}}
   this.t.push(s,t);
  }
 }
 // A planar quad a-b-c-d turned to face `out` when given.
 quad(a,b,c,d,col,out,uv,ns){
  if(out&&dot(cross(sub(c,a),sub(d,b)),out)<0){[b,d]=[d,b];if(uv)uv=[uv[0],uv[3],uv[2],uv[1]];if(ns)ns=[ns[0],ns[3],ns[2],ns[1]];}
  this.tri(a,b,c,col,uv&&[uv[0],uv[1],uv[2]],ns&&[ns[0],ns[1],ns[2]]);this.tri(a,c,d,col,uv&&[uv[0],uv[2],uv[3]],ns&&[ns[0],ns[2],ns[3]]);
 }
 // A convex polygon (3D points) as a fan facing `out`.
 fan(pts,col,out,uvOf){for(let i=1;i<pts.length-1;i++){const a=pts[0],b=pts[i],c=pts[i+1],uv=uvOf&&[uvOf(a),uvOf(b),uvOf(c)];if(dot(cross(sub(b,a),sub(c,a)),out)<0)this.tri(a,c,b,col,uv&&[uv[0],uv[2],uv[1]]);else this.tri(a,b,c,col,uv);}}
 // A box a0..a1 × b0..b1 × z0..z1 in frame f, every face turned away from its centre.
 box(f,a0,a1,b0,b1,z0,z1,col,{bottom=false,top=true}={}){
  const P=(i,j,k)=>f(i?a1:a0,j?b1:b0,k?z1:z0),c=f((a0+a1)/2,(b0+b1)/2,(z0+z1)/2),face=(A,B,C,D)=>this.quad(A,B,C,D,col,sub([(A[0]+C[0])/2,(A[1]+C[1])/2,(A[2]+C[2])/2],c));
  face(P(0,0,0),P(0,1,0),P(0,1,1),P(0,0,1));face(P(1,0,0),P(1,1,0),P(1,1,1),P(1,0,1));face(P(0,0,0),P(1,0,0),P(1,0,1),P(0,0,1));face(P(0,1,0),P(1,1,0),P(1,1,1),P(0,1,1));
  if(bottom)face(P(0,0,0),P(1,0,0),P(1,1,0),P(0,1,0));if(top)face(P(0,0,1),P(1,0,1),P(1,1,1),P(0,1,1));
 }
 // An n-sided post from p (radius r0) to q (radius r1), smooth sides.
 post(p,q,r0,r1,n,col,{rot=0,top=true,bottom=false,uvOf=null}={}){
  const d=unit(sub(q,p)),e1=unit(Math.abs(d[2])>.99?cross([0,1,0],d):cross(d,[0,0,1])),e2=cross(d,e1);
  const ringAt=(c,r)=>Array.from({length:n},(_,i)=>{const a=rot+i*2*Math.PI/n,x=Math.cos(a),y=Math.sin(a);return {p:[c[0]+(e1[0]*x+e2[0]*y)*r,c[1]+(e1[1]*x+e2[1]*y)*r,c[2]+(e1[2]*x+e2[2]*y)*r],n:[e1[0]*x+e2[0]*y,e1[1]*x+e2[1]*y,e1[2]*x+e2[2]*y],a:i/n};});
  const A=ringAt(p,r0),B=ringAt(q,r1);
  for(let i=0;i<n;i++){const j=(i+1)%n,uv=uvOf&&[uvOf(A[i].a,0),uvOf(i+1===n?1:A[j].a,0),uvOf(i+1===n?1:B[j].a,1),uvOf(B[i].a,1)];this.quad(A[i].p,A[j].p,B[j].p,B[i].p,col,null,uv,[A[i].n,A[j].n,B[j].n,B[i].n]);}
  if(top&&r1>0)this.fan(B.map(o=>o.p),col,d);if(bottom&&r0>0)this.fan(A.map(o=>o.p),col,mul(d,-1));
 }
 // Ellipse rings lofted in frame F: [z, cu, cv, ru, rv] (u forward, v left), smooth normals; closed at both ends.
 loft(F,rings,n,col){
  const O=F(0,0,0),dir=(u,v,z)=>unit(sub(F(u,v,z),O)),R=rings.map(([z,cu,cv,ru,rv])=>Array.from({length:n},(_,i)=>{const a=i/n*2*Math.PI,c=Math.cos(a),s=Math.sin(a);return {p:F(cu+ru*c,cv+rv*s,z),n:dir(c/Math.max(ru,.005),s/Math.max(rv,.005),0)};}));
  for(let k=0;k<R.length-1;k++)for(let i=0;i<n;i++){const j=(i+1)%n,A=R[k],B=R[k+1];this.quad(A[i].p,A[j].p,B[j].p,B[i].p,col,null,null,[A[i].n,A[j].n,B[j].n,B[i].n]);}
  const z0=rings[0][0],z1=rings[rings.length-1][0];this.fan(R[0].map(o=>o.p),col,dir(0,0,z0<z1?-1:1));this.fan(R[R.length-1].map(o=>o.p),col,dir(0,0,z0<z1?1:-1));
 }
 mesh(name,material,shadow=true){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(this.t,2));g.setAttribute('orlaGlow',new THREE.Float32BufferAttribute(this.e,3));g.computeBoundingSphere();
  const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.castShadow=shadow;mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;return mesh;
 }
}

// ---------- The lap: stations by s, and its driving space (asphalt and walls, DRIVE metres over the road)
function lapSpace(data){
 // A branch road beside the lap (data.branches, branch-layout.js): its asphalt and walls are driving space too.
 const branch=branchSpace(data);
 const A=data.samples,N=A.length,CELL=8,cells=new Map(),key=(i,j)=>i*131071+j;
 const st=A.map(p=>{const tl=Math.hypot(p[7],p[8])||1,nl=Math.hypot(p[9],p[10])||1,q={s:p[0],x:p[1],y:p[2],z:p[3],w:p[4],cf:p[5],n:[p[9]/nl,p[10]/nl],back:[0,0]};for(const [k,side] of [[0,-1],[1,1]])q.back[k]=p[4]/2+guardrailClearance(data,p[0],side)+(guardrailPresent(data,p[0],side)?.75:0);q.t=[p[7]/tl,p[8]/tl];return q;});
 for(let i=0;i<N;i++){const p=st[i],q=st[(i+1)%N],r=Math.max(...p.back,...q.back)+4;
  for(let ci=Math.floor((Math.min(p.x,q.x)-r)/CELL);ci<=Math.floor((Math.max(p.x,q.x)+r)/CELL);ci++)for(let cj=Math.floor((Math.min(p.y,q.y)-r)/CELL);cj<=Math.floor((Math.max(p.y,q.y)+r)/CELL);cj++){const k=key(ci,cj);let l=cells.get(k);if(!l)cells.set(k,l=[]);l.push(i);}}
 function at(x,y){
  const list=cells.get(key(Math.floor(x/CELL),Math.floor(y/CELL))),out=branch.at(x,y);if(!list)return out;
  for(const i of list){const p=st[i],q=st[(i+1)%N],dx=q.x-p.x,dy=q.y-p.y,l2=dx*dx+dy*dy||1e-9;let u=((x-p.x)*dx+(y-p.y)*dy)/l2;if(u<-.02||u>1.02)continue;u=clamp(u,0,1);
   const nx=lerp(p.n[0],q.n[0],u),ny=lerp(p.n[1],q.n[1],u),lat=(x-p.x-dx*u)*nx+(y-p.y-dy*u)*ny,k=lat>=0?1:0;
   out.push({s:p.s,lat,road:lerp(p.z,q.z,u)+lerp(p.cf,q.cf,u)*lat,back:lerp(p.back[k],q.back[k],u)});}
  return out;
 }
 // The station at s (interpolated): centre, height, left normal, tangent, half width and the walls' backs [right, left].
 function station(s){
  const L=data.meta.reconstructed_xy_m;s=((s%L)+L)%L;let lo=0,hi=N-1;while(lo<hi){const m=(lo+hi+1)>>1;if(st[m].s<=s)lo=m;else hi=m-1;}
  const p=st[lo],q=st[(lo+1)%N],span=(lo+1<N?q.s:L)-p.s,u=span>0?(s-p.s)/span:0,n=[lerp(p.n[0],q.n[0],u),lerp(p.n[1],q.n[1],u)],nl=Math.hypot(...n)||1;
  return {s,x:lerp(p.x,q.x,u),y:lerp(p.y,q.y,u),z:lerp(p.z,q.z,u),n:[n[0]/nl,n[1]/nl],t:[-n[1]/nl,n[0]/nl],half:lerp(p.w,q.w,u)/2,back:[lerp(p.back[0],q.back[0],u),lerp(p.back[1],q.back[1],u)]};
 }
 function nearest(x,y){let best=null,d=Infinity;for(const p of st){const e=(p.x-x)**2+(p.y-y)**2;if(e<d){d=e;best=p;}}return best;}
 return {at,station,nearest};
}

// ---------- Textures (canvas)
const wrap=(w,h,x,y,s,fn)=>{for(const dx of [-w,0,w])for(const dy of [-h,0,h])if(x+dx+s>0&&x+dx-s<w&&y+dy+s>0&&y+dy-s<h)fn(x+dx,y+dy);};
function grain(ctx,amount,r){const img=ctx.getImageData(0,0,ctx.canvas.width,ctx.canvas.height),d=img.data;for(let i=0;i<d.length;i+=4){const n=(r()-.5)*amount;d[i]+=n;d[i+1]+=n;d[i+2]+=n;}ctx.putImageData(img,0,0);}
function blotches(ctx,w,h,r,count,light,dark,size,alpha){for(let k=0;k<count;k++){const x=r()*w,y=r()*h,s=size*(.3+r()),c=r()<.5?light:dark,a=alpha*(.4+r());wrap(w,h,x,y,s,(px,py)=>{const g=ctx.createRadialGradient(px,py,0,px,py,s);g.addColorStop(0,`rgba(${c},${a})`);g.addColorStop(1,`rgba(${c},0)`);ctx.fillStyle=g;ctx.fillRect(px-s,py-s,2*s,2*s);});}}
// The calçada's small stones (1.6 m: 24 × 24 irregular light stones in grey joints), tinted per surface by the vertex
// colours: white mosaic at Iemanjá, ochre at the Bandeirantes terrace, grey concrete (a broad scale) on the plazas.
const stonesTexture=()=>canvasTexture((ctx,w,h)=>{
 const r=random(71),n=24,s=w/n;ctx.fillStyle='#a8a49b';ctx.fillRect(0,0,w,h);
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){const k=.84+r()*.2,cx=(i+.5)*s+(r()-.5)*s*.18,cy=(j+.5)*s+(r()-.5)*s*.18;ctx.fillStyle=`rgb(${238*k|0},${234*k|0},${224*k|0})`;ctx.beginPath();for(let q=0;q<7;q++){const a=q/7*2*Math.PI+r()*.4,rr=s*.47*(.82+r()*.22);ctx.lineTo(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr);}ctx.fill();}
 blotches(ctx,w,h,r,40,'255,255,250','70,66,60',60,.06);grain(ctx,12,r);
},512,512,true);

// The atlas (2048 × 1024): regions in canvas pixels [x0, y0, x1, y1].
const AW=2048,AH=1024;
const REG={
 portal:[0,0,500,600],       // the Portal da Memória's face: 5 m × 6 m, 1 px a centimetre (the opening and the symbols cut out)
 pastilha:[512,0,1024,512],  // Iemanjá's column: round it × z -1.5..2.7
 azulejo:[1024,0,1280,512],  // the towers' tiles: 0.9 m × 1.8 m (6 × 12 tiles of 15 cm)
 placa:[1280,0,1536,208],    // the terrace's red info panel
 marco:[1280,224,1536,352],  // the totem's plaque
 nome:[1536,0,2048,96],      // "MIRANTE BANDEIRANTES" on the sign frame's post
 sabia:[1536,112,2048,208],  // "MIRANTE DO SABIÁ"
 rosa:[1536,224,1792,480]    // a floating offering (a rose from above)
};
const regUv=R=>(fx,fy)=>[(R[0]+fx*(R[2]-R[0]))/AW,1-(R[3]-fy*(R[3]-R[1]))/AH];
function atlasTexture(){
 return canvasTexture((ctx,w,h)=>{
  const r=random(2007);ctx.clearRect(0,0,w,h);
  // --- The Portal: weathered corten (rust browns, darker streaks), the opening and the symbols cut through it. Legs
  // 1 m wide, the lintel 1.15 m; each leg a column of six cells, the lintel five; every cell its symbol (an evocation
  // of the work's African and Afro-Brazilian signs: Xangô's double axe, birds, fish, the shell, spirals, zigzags).
  {const [x0,y0]=REG.portal,W=500,H=600;ctx.save();ctx.translate(x0,y0);
   const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#6e3b1f');g.addColorStop(.5,'#7a4223');g.addColorStop(1,'#5d311b');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
   ctx.save();ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();blotches(ctx,W,H,r,90,'150,84,44','52,28,16',26,.18);for(let k=0;k<60;k++){ctx.fillStyle=`rgba(40,22,12,${.05+r()*.08})`;ctx.fillRect(r()*W,r()*H*.3,1+r()*2,40+r()*160);}ctx.restore();
   ctx.globalCompositeOperation='destination-out';ctx.fillStyle='#000';ctx.strokeStyle='#000';ctx.lineCap='butt';ctx.lineJoin='miter';
   ctx.fillRect(100,115,300,H-115);
   const cells=[];for(let i=0;i<5;i++)cells.push([i*100,0,100,115]);for(let j=0;j<6;j++){const cy=115+j*(H-115)/6,ch=(H-115)/6;cells.push([0,cy,100,ch]);cells.push([400,cy,100,ch]);}
   const P=(pts)=>{ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();};
   const sym=[
    (x,y,w,h)=>{for(let k=0;k<3;k++){const yy=y+h*(.08+k*.29);P([[x+w*.08,yy],[x+w*.5,yy+h*.2],[x+w*.92,yy],[x+w*.92,yy+h*.15],[x+w*.5,yy+h*.35],[x+w*.08,yy+h*.15]]);}},
    (x,y,w,h)=>{P([[x+w*.06,y+h*.06],[x+w*.3,y+h*.06],[x+w*.94,y+h*.94],[x+w*.7,y+h*.94]]);P([[x+w*.7,y+h*.06],[x+w*.94,y+h*.06],[x+w*.3,y+h*.94],[x+w*.06,y+h*.94]]);},
    (x,y,w,h)=>{P([[x+w*.2,y+h*.12],[x+w*.62,y+h*.12],[x+w*.42,y+h*.45],[x+w*.8,y+h*.45],[x+w*.3,y+h*.9],[x+w*.45,y+h*.56],[x+w*.18,y+h*.56]]);},
    (x,y,w,h)=>{ctx.lineWidth=w*.15;ctx.beginPath();let a=0,rr=w*.42;ctx.moveTo(x+w/2+rr,y+h/2);for(let k=0;k<70;k++){a+=.2;rr*=.975;ctx.lineTo(x+w/2+Math.cos(a)*rr,y+h/2+Math.sin(a)*rr*.95);}ctx.stroke();},
    (x,y,w,h)=>{for(let k=0;k<5;k++){const a=-Math.PI*.9+k*Math.PI*.2;P([[x+w*.5,y+h*.82],[x+w*.5+Math.cos(a)*w*.42,y+h*.82+Math.sin(a)*h*.62],[x+w*.5+Math.cos(a+.13)*w*.42,y+h*.82+Math.sin(a+.13)*h*.62]]);}ctx.fillRect(x+w*.3,y+h*.84,w*.4,h*.06);},
    (x,y,w,h)=>{P([[x+w*.12,y+h*.5],[x+w*.45,y+h*.28],[x+w*.72,y+h*.5],[x+w*.45,y+h*.72]]);P([[x+w*.7,y+h*.5],[x+w*.9,y+h*.32],[x+w*.9,y+h*.68]]);ctx.globalCompositeOperation='source-over';ctx.fillStyle='#6a391e';ctx.beginPath();ctx.arc(x+w*.3,y+h*.47,w*.04,0,7);ctx.fill();ctx.globalCompositeOperation='destination-out';ctx.fillStyle='#000';},
    (x,y,w,h)=>{P([[x+w*.5,y+h*.2],[x+w*.1,y+h*.4],[x+w*.22,y+h*.48],[x+w*.42,y+h*.4],[x+w*.42,y+h*.6],[x+w*.3,y+h*.8],[x+w*.7,y+h*.8],[x+w*.58,y+h*.6],[x+w*.58,y+h*.4],[x+w*.78,y+h*.48],[x+w*.9,y+h*.4]]);},
    (x,y,w,h)=>{ctx.fillRect(x+w*.46,y+h*.12,w*.08,h*.76);P([[x+w*.12,y+h*.18],[x+w*.46,y+h*.3],[x+w*.12,y+h*.42]]);P([[x+w*.88,y+h*.18],[x+w*.54,y+h*.3],[x+w*.88,y+h*.42]]);},
    (x,y,w,h)=>{for(let k=0;k<3;k++){ctx.lineWidth=h*.12;ctx.beginPath();for(let q=0;q<=20;q++){const xx=x+w*(.04+q*.046),yy=y+h*(.2+k*.3)+Math.sin(q*.9)*h*.08;q?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);}ctx.stroke();}},
    (x,y,w,h)=>{for(let j=0;j<3;j++)for(let i=0;i<3;i++){const cx=x+w*(.2+i*.3),cy=y+h*(.2+j*.3),s=w*.15;P([[cx,cy-s],[cx+s,cy],[cx,cy+s],[cx-s,cy]]);}},
    (x,y,w,h)=>{ctx.beginPath();ctx.arc(x+w*.5,y+h*.5,w*.22,0,7);ctx.fill();for(let k=0;k<8;k++){const a=k/8*2*Math.PI;P([[x+w*.5+Math.cos(a)*w*.28,y+h*.5+Math.sin(a)*w*.28],[x+w*.5+Math.cos(a+.25)*w*.48,y+h*.5+Math.sin(a+.25)*w*.48],[x+w*.5+Math.cos(a-.25)*w*.48,y+h*.5+Math.sin(a-.25)*w*.48]]);}},
    (x,y,w,h)=>{for(let k=0;k<4;k++){const yy=y+h*(.05+k*.24);P([[x+w*.06,yy+h*.2],[x+w*.28,yy],[x+w*.5,yy+h*.2],[x+w*.72,yy],[x+w*.94,yy+h*.2]]);}}
   ];
   cells.forEach(([x,y,cw,ch],k)=>{const m=7,f=sym[(k*5+3)%sym.length];ctx.save();ctx.beginPath();ctx.rect(x+m,y+m,cw-2*m,ch-2*m);ctx.clip();f(x+m,y+m,cw-2*m,ch-2*m);ctx.restore();});
   ctx.globalCompositeOperation='source-over';ctx.restore();}
  // --- Iemanjá's column: small dark blue glass tiles, lighter blue waves running round it.
  {const [x0,y0,x1,y1]=REG.pastilha,W=x1-x0,H=y1-y0,t=4;
   for(let y=0;y<H;y+=t)for(let x=0;x<W;x+=t){const fy=y/H,band=Math.sin(fy*2*Math.PI*7+Math.sin((x/W)*2*Math.PI*6)*1.1)*.5+.5,wave=band>.8?1:band>.68?.45:0,v=(r()-.5)*24,c=wave?[70+v+50*wave,110+v+60*wave,190+v+30*wave]:[22+v*.5,38+v*.6,92+v];ctx.fillStyle=`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;ctx.fillRect(x0+x+.5,y0+y+.5,t-1,t-1);}
   ctx.fillStyle='rgba(180,190,200,.25)';for(let y=0;y<H;y+=t)ctx.fillRect(x0,y0+y,W,.6);
   // The waterline's stain and green slime low down (z under 0.9 m: the bottom 57 % of the region below the level).
   const gl=ctx.createLinearGradient(0,y1,0,y1-H*.62);gl.addColorStop(0,'rgba(40,52,30,.85)');gl.addColorStop(.8,'rgba(60,70,40,.5)');gl.addColorStop(1,'rgba(60,70,40,0)');ctx.fillStyle=gl;ctx.fillRect(x0,y1-H*.62,W,H*.62);}
  // --- The towers' tiles: white, a slim black triangle from each corner of the 4-tile pinwheels.
  {const [x0,y0,x1,y1]=REG.azulejo,W=x1-x0,H=y1-y0,s=W/6;ctx.fillStyle='#ece9e2';ctx.fillRect(x0,y0,W,H);
   for(let j=0;j<12;j++)for(let i=0;i<6;i++){const v=(r()-.5)*10;ctx.fillStyle=`rgb(${236+v|0},${233+v|0},${226+v|0})`;ctx.fillRect(x0+i*s+1,y0+j*s+1,s-2,s-2);}
   ctx.fillStyle='#16171a';
   for(let j=0;j<=12;j+=2)for(let i=0;i<=6;i+=2){const cx=x0+i*s,cy=y0+j*s;for(let q=0;q<4;q++){const a=q*Math.PI/2,c=Math.cos(a),sn=Math.sin(a),T=(u,v)=>[cx+u*c-v*sn,cy+u*sn+v*c];const p=[T(1.5,0),T(.18,.92),T(.2,.55)].map(([x,y])=>[clamp(x,x0,x1),clamp(y,y0,y1)]);ctx.beginPath();ctx.moveTo(...T(0,0).map((q,k)=>k?clamp(q,y0,y1):clamp(q,x0,x1)));p.forEach(q=>ctx.lineTo(...q));ctx.closePath();ctx.fill();}}
   ctx.fillStyle='rgba(150,150,140,.6)';for(let i=0;i<=6;i++)ctx.fillRect(x0+i*s-1,y0,2,H);for(let j=0;j<=12;j++)ctx.fillRect(x0,y0+j*s-1,W,2);}
  // --- The terrace's info panel: terracotta, a white title band, four portraits, lines of text (no logos).
  {const [x0,y0,x1,y1]=REG.placa,W=x1-x0,H=y1-y0;ctx.fillStyle='#b14a2f';ctx.fillRect(x0,y0,W,H);ctx.fillStyle='#f3efe8';ctx.fillRect(x0+10,y0+10,W*.62,34);ctx.fillStyle='#b14a2f';ctx.font='bold 16px Arial';ctx.fillText('Eterna Modernidade',x0+18,y0+33);
   for(let k=0;k<4;k++){ctx.fillStyle='#d8d4cc';ctx.fillRect(x0+14+(k%2)*42,y0+96+(k>>1)*44,38,40);ctx.fillStyle='#5b5650';ctx.beginPath();ctx.arc(x0+33+(k%2)*42,y0+112+(k>>1)*44,9,0,7);ctx.fill();ctx.fillRect(x0+22+(k%2)*42,y0+122+(k>>1)*44,22,14);}
   ctx.fillStyle='rgba(250,240,230,.75)';for(let k=0;k<17;k++)ctx.fillRect(x0+108,y0+58+k*8,W-124-(k%5===4?50:0),2.5);ctx.fillStyle='#f3efe8';ctx.fillRect(x0+6,y1-26,W-12,20);}
  // --- The totem's plaque: brushed steel, engraved lines.
  {const [x0,y0,x1,y1]=REG.marco,W=x1-x0,H=y1-y0;ctx.fillStyle='#c4c7c9';ctx.fillRect(x0,y0,W,H);ctx.fillStyle='#4a4d50';ctx.font='bold 22px Arial';ctx.fillText('MARCO ZERO',x0+18,y0+34);ctx.fillStyle='#6a6d70';for(let k=0;k<6;k++)ctx.fillRect(x0+18,y0+52+k*11,W-40-(k%3)*30,3);}
  // --- The names on the sign posts.
  for(const [R,text] of [[REG.nome,'MIRANTE BANDEIRANTES'],[REG.sabia,'MIRANTE DO SABIÁ']]){const [x0,y0,x1,y1]=R;ctx.fillStyle='#9fa3a6';ctx.fillRect(x0,y0,x1-x0,y1-y0);ctx.fillStyle='#f6f6f4';ctx.font=`bold ${(y1-y0)*.52|0}px Arial`;ctx.textBaseline='middle';ctx.fillText(text,x0+16,(y0+y1)/2+2,x1-x0-32);ctx.textBaseline='alphabetic';}
  // --- A rose seen from above (alpha round it).
  {const [x0,y0,x1]=REG.rosa,s=(x1-x0)/2,cx=x0+s,cy=y0+s;for(let k=0;k<5;k++){ctx.fillStyle='#2f5a22';const a=k/5*2*Math.PI;ctx.beginPath();ctx.ellipse(cx+Math.cos(a)*s*.62,cy+Math.sin(a)*s*.62,s*.34,s*.16,a,0,7);ctx.fill();}
   for(let k=6;k>0;k--){ctx.fillStyle=k%2?'#b3141c':'#d42330';ctx.beginPath();ctx.arc(cx+(r()-.5)*4,cy+(r()-.5)*4,s*.1*k,0,7);ctx.fill();}}
 },AW,AH,false);
}

// ---------- Materials: the night's wash and the lamps' own light come per vertex (orlaGlow), switched by uOrlaNight.
function glowing(m,U,key){
 m.onBeforeCompile=shader=>{
  shader.uniforms.uOrlaNight=U.uOrlaNight;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 orlaGlow;varying vec3 vOrlaGlow;').replace('#include <begin_vertex>','#include <begin_vertex>\nvOrlaGlow=orlaGlow;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vOrlaGlow;uniform float uOrlaNight;')
   .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*vOrlaGlow*uOrlaNight;');
 };
 m.customProgramCacheKey=()=>'pampulha-orla-v1-'+key;
 return m;
}

// ---------- People in bronze (and a few visitors): a standing or seated figure in frame F (u its facing, v its left,
// z from its feet), 1.8 m at scale 1. Arms: 'down', 'point' (raised toward the lake), 'hold' (in front), 'back'.
const ARMS={down:[[-.01,.25,1.13],[.04,.27,.88]],point:[[.27,.27,1.44],[.57,.3,1.53]],hold:[[.06,.26,1.12],[.24,.13,1.08]],back:[[-.08,.24,1.13],[-.14,.12,.95]],knee:[[.1,.25,.98],[.36,.18,.62]]};
function figure(B,F,{col,legs=col,skin=col,seated=false,armL='down',armR='down',k=1,n=10,glasses=false}){
 const S=(u,v,z)=>F(u*k,v*k,z*k),hip=seated?.47:.92,dz=hip-.92;
 // Legs and shoes.
 for(const s of [-1,1]){
  if(seated){B.post(S(0,s*.1,hip),S(.45,s*.11,hip+.03),.085*k,.075*k,n>>1,legs);B.post(S(.45,s*.11,hip+.03),S(.5,s*.11,.09),.072*k,.06*k,n>>1,legs);B.box(S,.42,.66,s*.11-.055,s*.11+.055,0,.09,legs);}
  else{B.post(S(0,s*.1,hip),S(.02,s*.11,.09),.088*k,.062*k,n>>1,legs);B.box(S,-.06,.2,s*.11-.055,s*.11+.055,0,.09,legs);}
 }
 // The torso (jacket or shirt), neck and head.
 B.loft(F,[[hip-.05,0,0,.13,.19],[hip+.13,0,0,.12,.18],[hip+.38,.01,0,.135,.2],[hip+.5,0,0,.12,.225],[hip+.55,0,0,.06,.1]].map(([z,cu,cv,ru,rv])=>[z*k,cu*k,cv*k,ru*k,rv*k]),n,col);
 B.loft(F,[[1.47+dz,0,0,.048,.05],[1.53+dz,.01,0,.05,.052],[1.57+dz,.015,0,.09,.08],[1.65+dz,.02,0,.105,.085],[1.73+dz,.015,0,.09,.078],[1.78+dz,.01,0,.05,.045],[1.795+dz,.01,0,.01,.01]].map(([z,cu,cv,ru,rv])=>[z*k,cu*k,cv*k,ru*k,rv*k]),n,skin);
 if(glasses)B.box(S,.095,.11,-.07,.07,1.645+dz,1.675+dz,lin(0x1a1a1a),{top:true});
 // Arms: shoulder, elbow, hand.
 for(const [s,pose] of [[1,armL],[-1,armR]]){const [e,h]=ARMS[pose],sh=[0,s*.2,1.43+dz],el=[e[0],s*e[1],e[2]+dz],ha=[h[0],s*h[1],h[2]+dz];B.post(S(...sh),S(...el),.055*k,.048*k,n>>1,col);B.post(S(...el),S(...ha),.048*k,.04*k,n>>1,col);B.post(S(...ha),S(ha[0]+(ha[0]-el[0])*.25,ha[1]+(ha[1]-el[1])*.25,ha[2]+(ha[2]-el[2])*.25),.04*k,.03*k,n>>1,skin);}
}

export const hasPampulhaOrla=data=>(data.scenery?.landmarks??[]).some(m=>KINDS.includes(m.kind));
const KINDS=['iemanja','portal_da_memoria','marco_zero','praca_da_pampulha','mirante_sabia','mirante_bandeirantes'];
export function createPampulhaOrla(data,options={}){
 try{return build(data,options);}catch(e){console.warn('Orla da Pampulha não montada:',e);const root=new THREE.Group();root.name='Marcos_PampulhaOrla';return {root,obstacles:[],clearings:[],stats:{error:String(e)},update(){}};}
}
function build(data,{ground,mobile=false}={}){
 const root=new THREE.Group();root.name='Marcos_PampulhaOrla';
 const marks=Object.fromEntries((data.scenery?.landmarks??[]).filter(m=>KINDS.includes(m.kind)).map(m=>[m.kind,m])),stats={mobile,items:{}};
 const gAt=(x,y)=>{const g=ground?.(x,y);if(g!=null&&Number.isFinite(g))return g;return gridHeight(data.terrain,x,y)??0;};
 const lap=lapSpace(data),free=(x,y,margin=.35)=>!lap.at(x,y).some(h=>Math.abs(h.lat)<h.back+margin);
 const U={uOrlaNight:{value:0}},tex={stones:stonesTexture(),atlas:atlasTexture()};
 const materials={
  pave:glowing(new THREE.MeshStandardMaterial({name:'Orla_calcada',map:tex.stones,vertexColors:true,roughness:.9,metalness:0,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),U,'pave'),
  plain:glowing(new THREE.MeshStandardMaterial({name:'Orla_concreto',vertexColors:true,roughness:.82,metalness:0}),U,'plain'),
  metal:glowing(new THREE.MeshStandardMaterial({name:'Orla_metal',vertexColors:true,roughness:.36,metalness:.82,envMapIntensity:1}),U,'metal'),
  atlas:glowing(new THREE.MeshStandardMaterial({name:'Orla_paineis',map:tex.atlas,vertexColors:true,roughness:.6,metalness:0,alphaTest:.5,side:THREE.DoubleSide}),U,'atlas')
 };
 const T={pave:new Batch(1.2),plain:new Batch(),metal:new Batch(),atlas:new Batch()};
 const N=mobile?6:10,white=[1,1,1],lights=[],fixtures=[],obstacles=[],clearings=[],rand=random(1957);
 const bronze=p=>{const k=.85+.3*fbm(p[0]*3.1,p[1]*3.1+p[2]*2.3);return mul(lin(0x8a7155),k);},iemanjaBronze=p=>{const k=.8+.35*fbm(p[0]*4.1+p[2]*1.7,p[1]*4.1);return mul(lin(0x75644e),k);};
 const steel=lin(0xc8ccce),dark=lin(0x2e3236),orange=lin(0xd5621b),corten=lin(0x7a4223),concrete=lin(0xd2ccc0),cream=lin(0xdccdaa);
 // A lamp post at (x, y): pole, arm and lantern; its light washes round it after dark.
 const lampPost=(x,y,h=4.6,head=0,warm=[1,.82,.58],{double=false,base=null}={})=>{const z=base??gAt(x,y),c=Math.cos(head),s=Math.sin(head);
  T.metal.post([x,y,z-.2],[x,y,z+h],.075,.05,mobile?5:7,dark);
  for(const d of double?[1,-1]:[1]){const ex=x+c*d*.9,ey=y+s*d*.9;T.metal.post([x,y,z+h-.15],[ex,ey,z+h+.05],.03,.03,4,dark,{top:false});const F=frame(ex,ey,z+h-.05,head);T.metal.box(F,-.28,.28,-.13,.13,0,.12,dark);
   T.plain.self=mul(warm,3);T.plain.box(F,-.24,.24,-.1,.1,-.03,0,lin(0xf3eee2),{bottom:true,top:false});T.plain.self=[0,0,0];
   lights.push({p:[ex,ey,z+h-.15],c:warm,s:2.6,k:42,r:16});fixtures.push({p:[ex,ey,z+h-.12],c:warm,i:1,s:.16,g:0,on:.3,ph:rand()});}
 };
 // A concrete bench, or a park bench (slats on iron legs), facing heading h.
 const bench=(x,y,h,park=false)=>{const z=gAt(x,y),F=frame(x,y,z,h);
  if(!park){T.plain.box(F,-.25,.25,-.9,.9,.38,.46,concrete);for(const v of [-.7,.7])T.plain.box(F,-.18,.18,v-.12,v+.12,-.2,.38,mul(concrete,.9));return;}
  for(let k=0;k<4;k++)T.plain.box(F,-.22+k*.12,-.13+k*.12,-.85,.85,.42,.46,lin(0x8a5a32));for(let k=0;k<3;k++)T.plain.box(F,-.3,-.27,-.85,.85,.56+k*.13,.65+k*.13,lin(0x8a5a32));
  for(const v of [-.75,.75]){T.metal.box(F,-.28,.2,v-.025,v+.025,-.1,.42,dark);T.metal.box(F,-.31,-.26,v-.025,v+.025,.42,.95,dark);}
 };
 // The city's free lunetas: a steel pillar, the viewer's head (two eyepieces toward the shore, the lenses to the lake).
 const luneta=(x,y,h)=>{const z=gAt(x,y),F=frame(x,y,z,h);T.metal.post(F(0,0,-.1),F(0,0,1.02),.09,.06,mobile?6:8,lin(0x3b4a5a));T.metal.box(F,-.12,.16,-.17,.17,1.02,1.26,lin(0x3b4a5a));
  for(const v of [-.08,.08]){T.metal.post(F(-.12,v,1.16),F(-.2,v,1.17),.035,.035,6,dark);T.metal.post(F(.16,v,1.15),F(.22,v,1.15),.055,.06,8,lin(0x26313b));}T.metal.box(F,-.04,.04,-.24,.24,1.1,1.16,dark);};
 // Paving inside a convex polygon (2D track coordinates) on the ground, cut to the lap's walls (cells near them split).
 const pave=(poly,col,{lift=.05,scale=1.2,cell=mobile?2.5:1.5,flat=null,batch=T.pave}={})=>{
  const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]),zAt=(x,y)=>flat??gAt(x,y)+lift,uv=p=>[p[0]/scale,p[1]/scale];let n=0;
  const emit=q=>{if(q.length<3)return;batch.fan(q.map(([x,y])=>[x,y,zAt(x,y)]),col,[0,0,1],uv);n++;};
  for(let x=Math.min(...xs);x<Math.max(...xs);x+=cell)for(let y=Math.min(...ys);y<Math.max(...ys);y+=cell){
   const sq=[[x,y],[x+cell,y],[x+cell,y+cell],[x,y+cell]],q=clipConvex(sq,poly);if(q.length<3)continue;
   if(q.every(p=>free(p[0],p[1],.4))){emit(q);continue;}
   const k=3,d=cell/k;for(let a=0;a<k;a++)for(let b=0;b<k;b++){const s2=clipConvex([[x+a*d,y+b*d],[x+(a+1)*d,y+b*d],[x+(a+1)*d,y+(b+1)*d],[x+a*d,y+(b+1)*d]],poly);if(s2.length>2&&s2.every(p=>free(p[0],p[1],.35)))emit(s2);}
  }
  return n;
 };
 const clear=(x,y,r)=>clearings.push({x,y,r});
 // No tree between the lap and a place while it is in view: circles along the sight lines from the stations s0..s1 (every
 // 10 m), from beyond the wall to `stop` metres short of it.
 const sight=(x,y,s0,s1,stop=6,r=4)=>{for(let s=s0;s<=s1;s+=10){const st=lap.station(s),dx=x-st.x,dy=y-st.y,d=Math.hypot(dx,dy),side=dx*st.n[0]+dy*st.n[1]>=0?1:0;for(let t=st.back[side]+2;t<d-stop;t+=6)clear(st.x+dx/d*t,st.y+dy/d*t,r);}};
 const where=(x,y)=>{const p=lap.nearest(x,y),lat=(x-p.x)*p.n[0]+(y-p.y)*p.n[1];return {s:+p.s.toFixed(1),side:lat>=0?1:-1,lateral:+Math.abs(lat).toFixed(1),beyondWall:+(Math.abs(lat)-p.back[lat>=0?1:0]).toFixed(1)};};

 // ================= Praça de Iemanjá: the platform, the Portal, the statue on her column, the square
 if(marks.iemanja||marks.portal_da_memoria){
  const ST=[1163.3,-127.5],PO=[1181.6,-130.8],PC=[1183,-131.3],PR=8,h=Math.atan2(ST[1]-PO[1],ST[0]-PO[0]);
  const zp=Math.max(...ring(PC[0],PC[1],PR*.5,12).concat(ring(PC[0],PC[1],PR*.95,24).filter(([x])=>x>PC[0]-2),[PC]).map(([x,y])=>gAt(x,y)))+.1;
  // The square's light calçada portuguesa, from the platform to the lap's wall (the 2015 paved area), and benches.
  const tiles=pave([[1179.5,-120.5],[1189,-118.5],[1198.5,-123],[1198.5,-140],[1190,-144],[1179.5,-142]],lin(0xddd8cc),{lift:.05});
  // The round grey platform jutting into the lake: its top at the square's level, its rim down into the water.
  {const n=mobile?24:40,O=ring(PC[0],PC[1],PR,n,Math.PI/2),top=O.map(([x,y])=>[x,y,zp]);
   T.plain.fan([[PC[0],PC[1],zp],...top,top[0]],p=>mul(lin(0x80837e),.93+.1*fbm(p[0]*.5,p[1]*.5)),[0,0,1]);
   for(let i=0;i<n;i++){const a=O[i],b=O[(i+1)%n],za=Math.min(gAt(a[0],a[1])-.3,LEVEL-1),zb=Math.min(gAt(b[0],b[1])-.3,LEVEL-1),out=[(a[0]+b[0])/2-PC[0],(a[1]+b[1])/2-PC[1],0];
    T.plain.quad([a[0],a[1],zp],[b[0],b[1],zp],[b[0],b[1],zb],[a[0],a[1],za],p=>p[2]>LEVEL+.05?lin(0xb7b8b2):lin(0x5d6150),out);}
   // A darker ring and a light kerb on the platform (the pattern seen in the photos).
   const ringBand=(r0,r1,col,dz)=>{const A=ring(PC[0],PC[1],r0,n),B=ring(PC[0],PC[1],r1,n);for(let i=0;i<n;i++){const j=(i+1)%n;T.plain.quad([...A[i],zp+dz],[...A[j],zp+dz],[...B[j],zp+dz],[...B[i],zp+dz],col,[0,0,1]);}};
   ringBand(2.9,3.15,lin(0x575a58),.008);ringBand(PR-.35,PR,lin(0xa9a8a0),.01);}
  // The Portal da Memória: two faces 20 cm apart carrying the cut-out steel, its edges solid.
  {const F=frame(PO[0],PO[1],zp,h),W=2.5,H=6,uvP=regUv(REG.portal),face=u=>T.atlas.quad(F(u,W,0),F(u,-W,0),F(u,-W,H),F(u,W,H),white,sub(F(u,0,0),F(0,0,0)),[uvP(0,0),uvP(1,0),uvP(1,1),uvP(0,1)]);
   face(.1);face(-.1);
   const rust=p=>mul(corten,.9+.2*fbm(p[0]*2,p[2]*.8));
   T.plain.box(F,-.1,.1,-W,-W+.02,0,H,rust);T.plain.box(F,-.1,.1,W-.02,W,0,H,rust);T.plain.box(F,-.1,.1,-W,W,H-.02,H,rust);
   T.plain.box(F,-.1,.1,-1.5,-1.48,0,H-1.15,rust);T.plain.box(F,-.1,.1,1.48,1.5,0,H-1.15,rust);T.plain.box(F,-.1,.1,-1.5,1.5,H-1.17,H-1.15,rust,{top:false,bottom:true});
   // Uplights in the platform at the legs' feet.
   for(const [u,v] of [[.7,2],[.7,-2],[-.7,2],[-.7,-2]]){const p=F(u,v,.05);T.metal.box(frame(p[0],p[1],zp,h),-.12,.12,-.12,.12,0,.05,dark);lights.push({p:F(u*.6,v,.1),c:[1,.86,.66],s:2.4,k:14,r:8});fixtures.push({p:F(u,v,.08),c:[1,.86,.66],i:.7,s:.1,g:0,on:.3,ph:rand()});}
   obstacles.push(prism([F(-.3,-W-.2,0),F(.3,-W-.2,0),F(.3,W+.2,0),F(-.3,W+.2,0)],zp-1,zp+H));}
  // Iemanjá on her column in the water, facing the square: the column (Ø 1.2 m) from the lake bed to 1.9 m over the
  // water, and the bronze (2.6 m with the star; scale 1.3 on a 1.75 m figure).
  {const ztop=LEVEL+1.9,bed=Math.min(gAt(...ST)-.2,LEVEL-1.5),uvC=regUv(REG.pastilha),zc=z=>clamp((z+1.5)/4.2,0,1);
   T.atlas.post([ST[0],ST[1],bed],[ST[0],ST[1],ztop],.6,.6,mobile?12:20,white,{top:false,uvOf:(a,end)=>uvC(a,zc(end?ztop:bed))});
   T.plain.post([ST[0],ST[1],ztop-.02],[ST[0],ST[1],ztop+.06],.63,.63,mobile?12:20,lin(0x3c3e44));
   const F=frame(ST[0],ST[1],ztop+.06,h+Math.PI),k=1.3,S=(u,v,z)=>F(u*k,v*k,z*k),n=mobile?10:16,R=rs=>rs.map(([z,cu,cv,ru,rv])=>[z*k,cu*k,cv*k,ru*k,rv*k]);
   // The plinth and the dress (from the hem resting on it up to the shoulders), the head, the hair down her back.
   T.metal.post(F(0,0,-.02),F(0,0,.08),.47,.45,n,iemanjaBronze);
   T.metal.loft(F,R([[.06,.01,0,.3,.33],[.25,.01,0,.255,.28],[.6,.01,0,.2,.23],[.92,0,0,.155,.19],[1.08,0,0,.12,.155],[1.22,.02,0,.14,.17],[1.34,.01,0,.12,.19],[1.42,-.01,0,.1,.195],[1.47,-.01,0,.06,.1]]),n,iemanjaBronze);
   T.metal.loft(F,R([[1.46,0,0,.045,.05],[1.53,.01,0,.045,.048],[1.56,.015,0,.08,.075],[1.63,.02,0,.098,.085],[1.7,.015,0,.09,.078],[1.75,.005,0,.06,.055],[1.77,0,0,.015,.015]]),n,iemanjaBronze);
   T.metal.loft(F,R([[1.12,-.13,0,.035,.1],[1.3,-.12,0,.06,.15],[1.48,-.08,0,.08,.15],[1.62,-.04,0,.1,.11],[1.73,-.01,0,.085,.085]]),mobile?6:10,iemanjaBronze);
   // Arms down at her sides, the hands open toward the square.
   for(const s of [-1,1]){const sh=S(0,s*.18,1.41),el=S(-.01,s*.235,1.13),wr=S(.05,s*.27,.9);T.metal.post(sh,el,.058*k,.05*k,8,iemanjaBronze);T.metal.post(el,wr,.05*k,.04*k,8,iemanjaBronze);T.metal.box((u,v,z)=>S(u,v,z),.03,.06,s*.27-.04,s*.27+.04,.74,.9,iemanjaBronze);}
   // The diadem and its star.
   T.metal.post(S(.005,0,1.715),S(.005,0,1.76),.088*k,.092*k,n,lin(0x6a5a3c),{top:false});
   {const c=S(.0,0,1.88),e1=unit(sub(S(0,1,0),S(0,0,0))),pts=[];for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=(i%2?.035:.085)*k;pts.push(add(c,[e1[0]*Math.cos(a)*r,e1[1]*Math.cos(a)*r,Math.sin(a)*r]));}
    const fwd=unit(sub(S(1,0,0),S(0,0,0)));for(const d of [.012,-.012]){const P=pts.map(p=>add(p,mul(fwd,d)));for(let i=0;i<10;i++)T.metal.tri(add(c,mul(fwd,d)),P[i],P[(i+1)%10],lin(0x7a6a44));}
    T.metal.post(S(0,0,1.76),S(0,0,1.81),.01,.01,4,lin(0x6a5a3c));}
   // Spotlights on the platform's edge toward her (the 2017 monumental lighting).
   for(const dv of [-1.6,1.6]){const p=frame(PO[0],PO[1],zp,h)(5.4,dv,0);T.metal.box(frame(p[0],p[1],zp,h),-.15,.15,-.1,.1,0,.22,dark);lights.push({p:[p[0],p[1],zp+.3],c:[1,.9,.75],s:9,k:260,r:26,dir:unit(sub([ST[0],ST[1],ztop+1.4],[p[0],p[1],zp+.3])),cos:.984});fixtures.push({p:[p[0],p[1],zp+.25],c:[1,.9,.75],i:.8,s:.09,g:0,on:.3,ph:rand()});}
   // Offerings floating round the column: roses and white flowers.
   const uvR=regUv(REG.rosa);for(let k2=0;k2<(mobile?6:14);k2++){const a=rand()*2*Math.PI,d=.9+rand()*2.6,x=ST[0]+Math.cos(a)*d,y=ST[1]+Math.sin(a)*d,s=.11+rand()*.06,F2=frame(x,y,LEVEL+.03,rand()*6),c=rand()<.3?[1.6,1.6,1.5]:white;
    T.atlas.quad(F2(-s,-s,0),F2(s,-s,0),F2(s,s,0),F2(-s,s,0),c,[0,0,1],[uvR(0,0),uvR(1,0),uvR(1,1),uvR(0,1)]);}}
  for(const [x,y,hh] of [[1188.5,-121.6,h],[1188.5,-140.6,h]])if(free(x,y,1))bench(x,y,hh);
  for(const [x,y] of [[1190.5,-120],[1190.5,-142.2]])if(free(x,y,.8))lampPost(x,y,4.4,h);
  for(const a of [2.2,4.1]){const x=PC[0]+Math.cos(a)*(PR-.6),y=PC[1]+Math.sin(a)*(PR-.6);lampPost(x,y,4.4,h,undefined,{base:zp});}
  for(let k2=0;k2<4;k2++)clear(1180+k2*4.5,-131,7);clear(1186,-121,5);clear(1186,-141,5);
  stats.items.iemanja={statue:ST,portal:PO,heading:+h.toFixed(3),platform:{centre:PC,radius:PR,z:+zp.toFixed(2)},pavingCells:tiles,at:where(...PO)};
 }

 // ================= Marco Zero: the steel totem behind the lap's right wall by the park's crossing, its lamp
 if(marks.marco_zero){
  const st=lap.station(4350),R=[-st.n[0],-st.n[1]],off=st.back[0]+2.6,x=st.x+R[0]*off,y=st.y+R[1]*off,z=gAt(x,y),h=Math.atan2(st.n[1],st.n[0]),F=frame(x,y,z,h);
  const brushed=p=>{const k=.9+.14*fbm(p[2]*3.5,(p[0]+p[1])*.6);return mul(steel,k);},Hh=5.6,uM=regUv(REG.marco);
  T.plain.box(F,-.42,.42,-.55,.55,-.2,.06,lin(0xa9a69e));
  T.metal.box(F,-.21,.21,-.36,.36,.06,Hh,brushed);
  for(const zs of [1.82,3.66])for(const u of [-.212,.212])T.plain.quad(F(u,-.36,zs),F(u,.36,zs),F(u,.36,zs+.012),F(u,-.36,zs+.012),dark,[u*Math.cos(h)*10,u*Math.sin(h)*10,0]);
  // The orange edges on both narrow sides and the big "0" on both faces.
  for(const v of [-.362,.362])T.plain.quad(F(-.21,v,.06),F(-.13,v,.06),F(-.13,v,Hh),F(-.21,v,Hh),orange,sub(F(0,v,0),F(0,0,0)));
  for(const u of [-.214,.214]){const n=mobile?14:24,c=4.62,o=sub(F(u,0,0),F(0,0,0));for(let i=0;i<n;i++){const a=i/n*2*Math.PI,b=(i+1)/n*2*Math.PI,P=(r1,r2,t)=>F(u,Math.cos(t)*r1,c+Math.sin(t)*r2);T.plain.quad(P(.22,.32,a),P(.22,.32,b),P(.13,.2,b),P(.13,.2,a),orange,o);}}
  T.atlas.quad(F(.216,-.18,1.22),F(.216,.18,1.22),F(.216,.18,1.52),F(.216,-.18,1.52),white,sub(F(1,0,0),F(0,0,0)),[uM(0,0),uM(1,0),uM(1,1),uM(0,1)]);
  // The double LED lamp beside it, one arm over the path, one over the road.
  {const p=F(.1,1.45,0);lampPost(p[0],p[1],7.2,h,[.92,.95,1],{double:true});}
  lights.push({p:F(1.6,0,2.2),c:[.92,.95,1],s:1.6,k:20,r:8});
  obstacles.push(prism([F(-.3,-.45,0),F(.3,-.45,0),F(.3,.45,0),F(-.3,.45,0)],z-1,z+Hh));
  clear(x,y,4.5);clear(...F(-6,0,0).slice(0,2),5);sight(x,y,4290,4340,2.5,3.5);
  stats.items.marco_zero={totem:[+x.toFixed(1),+y.toFixed(1),+z.toFixed(2)],road:st.n.map(v=>+v.toFixed(3)),height:Hh,at:where(x,y)};
 }

 // ================= Praça da Pampulha: the north plaza, the six light towers, the brick terraces
 if(marks.praca_da_pampulha){
  const T0=[-220.4,-951],step=[-7.1,-29.95],towers=Array.from({length:6},(_,i)=>[T0[0]+step[0]*i,T0[1]+step[1]*i]),east=Math.atan2(-.231,.973);
  const plaza=[[-221.9,-945],[-235.6,-979.4],[-201.25,-995.6],[-185,-970]];
  const slab=p=>mul(lin(0x8f8c86),.9+.12*fbm(p[0]*.25,p[1]*.25)),cells=pave(plaza,slab,{lift:.05,batch:T.plain,cell:mobile?4:3});
  // The plaza's joints (5 m slabs along its south edge and across), a hair over it.
  {const zj=(x,y)=>gAt(x,y)+.062,ax=unit([plaza[2][0]-plaza[1][0],plaza[2][1]-plaza[1][1],0]),ay=[-ax[1],ax[0]],c0=[(plaza[0][0]+plaza[2][0])/2,(plaza[0][1]+plaza[2][1])/2];
   for(const [d,o] of [[ax,ay],[ay,ax]])for(let k=-8;k<=8;k++){const c=[c0[0]+o[0]*k*5,c0[1]+o[1]*k*5],seg=clipConvex([[c[0]-d[0]*40,c[1]-d[1]*40],[c[0]+d[0]*40,c[1]+d[1]*40],[c[0]+d[0]*40+o[0]*.06,c[1]+d[1]*40+o[1]*.06],[c[0]-d[0]*40+o[0]*.06,c[1]-d[1]*40+o[1]*.06]],plaza);if(seg.length<3)continue;
    const ts=seg.map(p=>(p[0]-c[0])*d[0]+(p[1]-c[1])*d[1]),t0=Math.min(...ts),t1=Math.max(...ts),n=Math.max(1,Math.round((t1-t0)/4));
    for(let i=0;i<n;i++){const P=(t,w)=>{const tt=lerp(t0,t1,t);return [c[0]+d[0]*tt+o[0]*w,c[1]+d[1]*tt+o[1]*w];},a=P(i/n,-.03),b=P((i+1)/n,-.03),e=P((i+1)/n,.03),f=P(i/n,.03);T.plain.quad([...a,zj(...a)],[...b,zj(...b)],[...e,zj(...e)],[...f,zj(...f)],lin(0x77746e),[0,0,1]);}}}
  const weather=p=>{const k=.86+.16*fbm(p[0]*.7+p[2]*.35,p[1]*.7)-.12*Math.max(0,1-(p[2]-gAt(p[0],p[1]))/1.2);return mul(concrete,k);};
  const uvA=regUv(REG.azulejo),TH=14;let built=0;
  for(const [x,y] of towers){if(!free(x,y,3))continue;const z=gAt(x,y),F=frame(x,y,z,east);built++;
   // The U channel: back wall west, two fins, open to the square (east); the tiles inside, three floods high up.
   T.plain.box(F,-.75,-.5,-.75,.75,-.4,TH,weather);for(const v of [-.75,.5])T.plain.box(F,-.5,.75,v,v+.25,-.4,TH,weather);T.plain.box(F,.5,.75,-.5,.5,TH-.4,TH,weather,{bottom:true});
   for(let z0=.5;z0<9.4;z0+=1.8){const z1=Math.min(9.5,z0+1.8),f=(z1-z0)/1.8;T.atlas.quad(F(-.495,.45,z0),F(-.495,-.45,z0),F(-.495,-.45,z1),F(-.495,.45,z1),white,sub(F(1,0,0),F(0,0,0)),[uvA(0,0),uvA(1,0),uvA(1,f),uvA(0,f)]);}
   for(const zf of [10.4,11.25,12.1]){T.metal.box(F,-.3,.22,-.32,.32,zf-.32,zf+.32,dark);T.plain.self=[2.6,2.5,2.3];T.plain.quad(F(.225,-.27,zf-.27),F(.225,.27,zf-.27),F(.225,.27,zf+.27),F(.225,-.27,zf+.27),lin(0xf4f2ec),sub(F(1,0,0),F(0,0,0)));T.plain.self=[0,0,0];
    fixtures.push({p:F(.3,0,zf),c:[1,.96,.88],i:1.6,s:.28,g:0,on:.3,ph:rand()});}
   lights.push({p:F(.6,0,11.2),c:[1,.95,.86],s:9,k:500,r:42,dir:unit(sub(F(9,0,0),F(0,0,11.2))),cos:.35});
   clear(x,y,4.5);
  }
  // Brick terraces across the lawn (parallel to the plaza's south edge, 2.6 m apart) and raised brick blocks.
  const brick=p=>mul(lin(0x8e5434),.8+.3*fbm(p[0]*1.3,p[1]*1.3+p[2]));
  {const a=plaza[1],b=plaza[2],d=unit([b[0]-a[0],b[1]-a[1],0]),nrm=[d[1],-d[0]],rows=mobile?3:6;
   for(let r=0;r<rows;r++){const off=4+r*3.2,t0=4+off*.3,len=mobile?20:26;for(let t=t0;t<t0+len;t+=2){const x0=a[0]+d[0]*t+nrm[0]*off,y0=a[1]+d[1]*t+nrm[1]*off,F=frame(x0,y0,gAt(x0,y0),Math.atan2(d[1],d[0]));T.plain.box(F,0,2.02,-.13,.13,-.15,.07,brick);}}
   for(const [t,off] of [[6,3],[17,3.2],[27,2.8]]){const x0=a[0]+d[0]*t+nrm[0]*off,y0=a[1]+d[1]*t+nrm[1]*off,F=frame(x0,y0,gAt(x0,y0),Math.atan2(d[1],d[0]));
    T.plain.box(F,-1.2,1.2,-1.2,-.45,-.2,.38,brick);T.plain.box(F,-1.2,1.2,.45,1.2,-.2,.38,brick);T.plain.box(F,-1.2,-.45,-.45,.45,-.2,.38,brick);T.plain.box(F,.45,1.2,-.45,.45,-.2,.38,brick);T.plain.box(F,-.45,.45,-.45,.45,-.2,.05,mul(brick({0:x0,1:y0,2:0}),.6));}}
  for(const [u,v] of [[.3,.25],[.5,.6],[.7,.35],[.45,.82]]){const x=lerp(lerp(plaza[0][0],plaza[3][0],u),lerp(plaza[1][0],plaza[2][0],u),v),y=lerp(lerp(plaza[0][1],plaza[3][1],u),lerp(plaza[1][1],plaza[2][1],u),v);bench(x,y,east+Math.PI/2*(u>.5?1:-1));}
  if(!mobile){const shirt=[lin(0xc23b2a),lin(0x2a5aa8),lin(0xe8e2d0),lin(0x3d7a3a)];for(let i=0;i<5;i++){const t=.2+i*.16,x=lerp(plaza[1][0],plaza[2][0],t)+(rand()-.5)*6,y=lerp(plaza[1][1],plaza[2][1],t)-6-rand()*14;figure(T.plain,frame(x,y,gAt(x,y)-.02,rand()*6),{col:shirt[i%4],legs:lin(0x2b3140),skin:lin(0x9c6b4c),seated:i%2===1,armL:i%2?'knee':'down',armR:i%2?'knee':'hold',n:8});}}
  {const c=plaza.reduce((s,p)=>[s[0]+p[0]/4,s[1]+p[1]/4],[0,0]);clear(c[0],c[1],20);clear(c[0]-8,c[1]-26,14);clear(c[0]-14,c[1]-46,14);}
  stats.items.praca_da_pampulha={towers:built,towerSpots:towers.map(([x,y])=>[+x.toFixed(1),+y.toFixed(1),+gAt(x,y).toFixed(2)]),plazaCells:cells,at:where(-210,-970)};
 }

 // ================= Mirante Bandeirantes: the ochre terrace from the lap's wall to the water, the bronze group
 if(marks.mirante_bandeirantes){
  const s0=2330,s1=2366,ds=mobile?3:2,secs=[];
  for(let s=s0;s<=s1+1e-6;s+=ds){const st=lap.station(s),R=[-st.n[0],-st.n[1]],b=st.back[0]+.45,inner=[st.x+R[0]*b,st.y+R[1]*b];let d=.5;while(d<14&&gAt(inner[0]+R[0]*d,inner[1]+R[1]*d)>1.9)d+=.5;secs.push({s,R,inner,depth:clamp(d-.7,3.5,12)});}
  for(let i=0;i<secs.length;i++){const a=secs[Math.max(0,i-1)],c=secs[Math.min(secs.length-1,i+1)];secs[i].d2=(a.depth+secs[i].depth*2+c.depth)/4;}
  for(const q of secs)q.outer=[q.inner[0]+q.R[0]*q.d2,q.inner[1]+q.R[1]*q.d2];
  const zd=secs.map(q=>gAt(...q.inner)).sort((a,b)=>a-b)[secs.length>>1]+.12;
  const ochre=p=>mul(lin(0xbb9466),.9+.14*fbm(p[0]*.4,p[1]*.4)),grey=p=>mul(lin(0x8c8b87),.94+.1*fbm(p[0]*.6,p[1]*.6));
  for(let i=0;i<secs.length-1;i++){const a=secs[i],b=secs[i+1],P=(q,f,dz=0)=>[lerp(q.inner[0],q.outer[0],f),lerp(q.inner[1],q.outer[1],f),zd+dz];
   T.plain.quad(P(a,0),P(b,0),P(b,1),P(a,1),ochre,[0,0,1]);
   // The grey winding path along it.
   const w=t=>.5+.22*Math.sin(t*.19),f0=q=>clamp(w(q.s)-.8/q.d2,.05,.95),f1=q=>clamp(w(q.s)+.8/q.d2,.05,.95);T.plain.quad(P(a,f0(a),.012),P(b,f0(b),.012),P(b,f1(b),.012),P(a,f1(a),.012),grey,[0,0,1]);
   // The retaining wall down to the water, the parapet on the edge.
   const oa=a.outer,ob=b.outer,za=Math.min(gAt(...oa)-.2,LEVEL-.6),zb=Math.min(gAt(...ob)-.2,LEVEL-.6),out=[a.R[0],a.R[1],0];
   T.plain.quad([...oa,zd],[...ob,zd],[...ob,zb],[...oa,za],p=>p[2]>LEVEL+.1?lin(0xcbbd9c):lin(0x5d6150),out);
   const pa=P(a,1),pb=P(b,1),inA=P(a,1-.3/a.d2),inB=P(b,1-.3/b.d2);T.plain.quad([...pa.slice(0,2),zd+.5],[...pb.slice(0,2),zd+.5],[...pb.slice(0,2),zd],[...pa.slice(0,2),zd],cream,out);T.plain.quad([...inA.slice(0,2),zd+.5],[...inB.slice(0,2),zd+.5],[...inB.slice(0,2),zd],[...inA.slice(0,2),zd],cream,mul(out,-1));T.plain.quad([...pa.slice(0,2),zd+.5],[...pb.slice(0,2),zd+.5],[...inB.slice(0,2),zd+.5],[...inA.slice(0,2),zd+.5],mul(cream,1.05),[0,0,1]);
   if(i%2===0){const q=P(a,1-.15/a.d2),F=frame(q[0],q[1],zd,Math.atan2(a.R[1],a.R[0]));T.plain.box(F,-.25,.25,-.25,.25,0,1.05,cream);T.plain.box(F,-.29,.29,-.29,.29,1.05,1.12,mul(cream,1.06));}
  }
  // The ends: short walls down to the ground.
  for(const q of [secs[0],secs[secs.length-1]]){const P=f=>[lerp(q.inner[0],q.outer[0],f),lerp(q.inner[1],q.outer[1],f)];for(let k=0;k<4;k++){const a=P(k/4),b=P((k+1)/4);T.plain.quad([...a,zd],[...b,zd],[...b,Math.min(gAt(...b),zd)-.4],[...a,Math.min(gAt(...a),zd)-.4],lin(0xcbbd9c),q===secs[0]?[-q.R[1],q.R[0],0]:[q.R[1],-q.R[0],0]);}}
  // The bronze group, toward the lake: Kubitschek pointing, two standing, Portinari seated on a bench turned to them.
  const mid=secs[Math.round(secs.length*.45)],G=(f,dv)=>{const p=[lerp(mid.inner[0],mid.outer[0],f),lerp(mid.inner[1],mid.outer[1],f)],t=[-mid.R[1],mid.R[0]];return [p[0]+t[0]*dv,p[1]+t[1]*dv];},hl=Math.atan2(mid.R[1],mid.R[0]),zg=zd+.02;
  {const nF=mobile?8:12,place=(f,dv,hh,o)=>{const [x,y]=G(f,dv);figure(T.metal,frame(x,y,zg,hh),{col:bronze,n:nF,...o});};
   place(.5,2.1,hl+.15,{armL:'back',armR:'down'});place(.62,1.35,hl+.3,{armL:'hold',armR:'down',k:.94,glasses:true});place(.52,.3,hl-.35,{armL:'point',armR:'down',k:1.02});
   const [bx,by]=G(.62,-1.9),hb=hl+Math.PI/2+.5;bench(bx,by,hb,true);const Fb=frame(bx,by,zg,hb);const p=Fb(-.05,0,0);figure(T.metal,frame(p[0],p[1],zg,hb),{col:bronze,n:nF,seated:true,armL:'knee',armR:'hold'});}
  // A luneta at the parapet, the sign frame with the red panel facing the avenue, benches, lamps, two visitors.
  {const q=secs[Math.round(secs.length*.8)],p=[lerp(q.inner[0],q.outer[0],1-.75/q.d2),lerp(q.inner[1],q.outer[1],1-.75/q.d2)];luneta(p[0],p[1],Math.atan2(q.R[1],q.R[0]));}
  {const q=secs[Math.round(secs.length*.18)],p=[lerp(q.inner[0],q.outer[0],.55),lerp(q.inner[1],q.outer[1],.55)],hh=Math.atan2(-q.R[1],-q.R[0])+.35,F=frame(p[0],p[1],zd,hh),uvP=regUv(REG.placa),uvN=regUv(REG.nome),o=sub(F(1,0,0),F(0,0,0));
   for(const [v0,v1,z0,z1] of [[-.95,-.8,0,1.9],[.8,.95,.25,1.9],[-.95,.95,1.75,1.9],[-.95,.95,.25,.4]])T.metal.box(F,-.04,.04,v0,v1,z0,z1,steel);
   T.atlas.quad(F(.05,-.72,.48),F(.05,.72,.48),F(.05,.72,1.66),F(.05,-.72,1.66),white,o,[uvP(0,0),uvP(1,0),uvP(1,1),uvP(0,1)]);
   T.atlas.quad(F(.045,-.81,.2),F(.045,-.94,.2),F(.045,-.94,1.7),F(.045,-.81,1.7),white,o,[uvN(0,0),uvN(0,1),uvN(1,1),uvN(1,0)]);}
  for(const f of [.3,.7]){const q=secs[Math.round(secs.length*f)],p=[lerp(q.inner[0],q.outer[0],.2),lerp(q.inner[1],q.outer[1],.2)];bench(p[0],p[1],Math.atan2(q.R[1],q.R[0]),true);}
  for(const f of [.05,.95]){const q=secs[Math.round((secs.length-1)*f)],p=[lerp(q.inner[0],q.outer[0],.12),lerp(q.inner[1],q.outer[1],.12)];if(free(p[0],p[1],.6))lampPost(p[0],p[1],4.2,Math.atan2(q.R[1],q.R[0]));}
  if(!mobile)for(const [f,dv,c] of [[.85,5.5,lin(0x2f6fb0)],[.8,-6,lin(0xe0c040)]]){const [x,y]=G(f,dv);figure(T.plain,frame(x,y,zg,hl+(rand()-.5)*.6),{col:c,legs:lin(0x30343c),skin:lin(0xa8765a),armL:'hold',armR:'down',k:.95,n:8});}
  for(let i=0;i<secs.length;i+=2){const q=secs[i];clear(lerp(q.inner[0],q.outer[0],.5),lerp(q.inner[1],q.outer[1],.5),q.d2/2+2.5);}
  stats.items.mirante_bandeirantes={s:[s0,s1],group:G(.5,0).map(v=>+v.toFixed(1)),lake:mid.R.map(v=>+v.toFixed(3)),deck:+zd.toFixed(2),depth:[+Math.min(...secs.map(q=>q.d2)).toFixed(1),+Math.max(...secs.map(q=>q.d2)).toFixed(1)],at:where(...G(.5,0))};
 }

 // ================= Mirante do Sabiá: the small lookout over the north-west arm
 if(marks.mirante_sabia){
  const C=[-2066,646],h=Math.atan2(652-646,-2023+2066),F0=frame(C[0],C[1],0,h),cornersG=[[-4.5,-5],[4,-5],[4,5],[-4.5,5]].map(([u,v])=>F0(u,v,0));
  const zd=gAt(...C)+.07,F=(u,v,z)=>{const p=F0(u,v,0);return [p[0],p[1],gAt(p[0],p[1])+.07+z];},cool=lin(0xc4c1ba);
  pave(cornersG.map(p=>[p[0],p[1]]),cool,{lift:.07,cell:mobile?3:1.5});
  for(let i=0;i<4;i++){const a=cornersG[i],b=cornersG[(i+1)%4],m=[(a[0]+b[0])/2-C[0],(a[1]+b[1])/2-C[1],0];for(let k=0;k<6;k++){const p=[lerp(a[0],b[0],k/6),lerp(a[1],b[1],k/6)],q=[lerp(a[0],b[0],(k+1)/6),lerp(a[1],b[1],(k+1)/6)];T.plain.quad([...p,gAt(...p)+.08],[...q,gAt(...q)+.08],[...q,gAt(...q)-.25],[...p,gAt(...p)-.25],lin(0xa8a59d),m);}}
  // The railing: the lake side and the first half of both sides.
  const rail=[[1,-5],[4,-5],[4,5],[1,5]],posts=[];for(let i=0;i<rail.length-1;i++){const a=rail[i],b=rail[i+1],n=Math.max(1,Math.round(Math.hypot(b[0]-a[0],b[1]-a[1])/1.5));for(let k=0;k<=n;k++)if(k<n||i===rail.length-2)posts.push([lerp(a[0],b[0],k/n),lerp(a[1],b[1],k/n)]);}
  for(const [u,v] of posts)T.metal.post(F(u-.08,v,0),F(u-.08,v,1.05),.028,.028,5,steel,{top:false});
  for(let i=0;i<rail.length-1;i++){const a=rail[i],b=rail[i+1];for(const z of [1.05,.55])T.metal.post(F(a[0]-.08,a[1],z),F(b[0]-.08,b[1],z),.03,.03,5,steel,{top:false});}
  {const p=F(3.4,1.6,0);luneta(p[0],p[1],h);}
  for(const v of [-3.6,3.6]){const p=F(-1.2,v,0);bench(p[0],p[1],h);}
  {const p=F(-4.1,-4.6,0);lampPost(p[0],p[1],4.2,h);}
  // The name on a small panel turned to the lap (west).
  {const p=F(-4,4.4,0),Fs=frame(p[0],p[1],p[2],h+Math.PI),uvS=regUv(REG.sabia),o=sub(Fs(1,0,0),Fs(0,0,0));T.metal.box(Fs,-.04,.04,-.85,-.79,0,1.25,steel);T.metal.box(Fs,-.04,.04,.79,.85,0,1.25,steel);
   T.atlas.quad(Fs(.05,-.8,.92),Fs(.05,.8,.92),Fs(.05,.8,1.22),Fs(.05,-.8,1.22),white,o,[uvS(0,0),uvS(1,0),uvS(1,1),uvS(0,1)]);T.metal.box(Fs,-.03,.03,-.8,.8,.88,.92,steel);}
  if(!mobile){const p=F(2.8,-2.2,0);figure(T.plain,frame(p[0],p[1],p[2],h+.2),{col:lin(0xd04a6a),legs:lin(0x3a3f4a),skin:lin(0x8a5a40),armL:'hold',armR:'hold',k:.92,n:8});}
  clear(C[0],C[1],8);clear(...F(-9,0,0).slice(0,2),5);{const s0=lap.nearest(...C).s;sight(C[0],C[1],s0-70,s0+10,7,4);}
  stats.items.mirante_sabia={centre:C,heading:+h.toFixed(3),deck:+zd.toFixed(2),at:where(...C)};
 }

 // ---------- After dark: each vertex takes the lamps' and floods' light by its normal and distance (no real lights).
 for(const b of Object.values(T)){for(let v=0;v<b.p.length;v+=3){const p=[b.p[v],-b.p[v+2],b.p[v+1]],n=[b.n[v],-b.n[v+2],b.n[v+1]];let g0=0,g1=0,g2=0;
  for(const l of lights){const d=sub(l.p,p),L=Math.hypot(d[0],d[1],d[2]);if(L>l.r||L<1e-3)continue;let f=l.s*Math.max(dot(n,d)/L,0)/(1+L*L/l.k)*.17*(1-L/l.r);if(l.dir){const c=-dot(d,l.dir)/L;f*=clamp((c-l.cos)/Math.max(.008,(1-l.cos)*.15),0,1);}g0+=l.c[0]*f;g1+=l.c[1]*f;g2+=l.c[2]*f;}
  b.e[v]+=g0;b.e[v+1]+=g1;b.e[v+2]+=g2;}}
 const night=lightUniforms(),glow=nightLights(fixtures,night,{name:'Orla_luzes',minPx:1.6,floor:.4,fogKeep:.5});root.add(glow.mesh);

 // ---------- Driving space: no vertex over the lap's asphalt and walls, up to DRIVE metres above the road.
 const drive={checked:0,violations:0,worst:null};
 for(const [k,b] of Object.entries(T))for(let v=0;v<b.p.length;v+=3){
  const x=b.p[v],y=-b.p[v+2],z=b.p[v+1];drive.checked++;
  for(const h of lap.at(x,y)){const over=z-h.road;if(Math.abs(h.lat)<h.back+.3&&over>-.05&&over<DRIVE){drive.violations++;if(!drive.worst||Math.abs(h.lat)<Math.abs(drive.worst.lat))drive.worst={material:k,s:+h.s.toFixed(1),lat:+h.lat.toFixed(2),over:+over.toFixed(2)};}}
 }
 let drawCalls=1,triangles=0;const parts={};
 for(const [k,b] of Object.entries(T)){if(!b.vertices)continue;root.add(b.mesh('Orla_'+k,materials[k],k!=='pave'));drawCalls++;triangles+=b.triangles;parts[k]=b.triangles;}
 root.updateMatrixWorld(true);
 // 0 by day; dusk (.45) brings the lamps and floods up; full at night.
 let lit=0;
 function setNight(level){lit=level;U.uOrlaNight.value=level>0?(level>=.99?1:.55):0;night.uNight.value=level;glow.mesh.visible=level>0;stats.night=level;}
 Object.assign(stats,{drawCalls,triangles,trianglesK:Math.round(triangles/1000),parts,driveSpace:drive,clearings:clearings.length,cameraObstacles:obstacles.length,lamps:fixtures.length,washLights:lights.length,night:0});
 return {root,obstacles,clearings,stats,setNight,update(dt){if(lit>0){night.uTime.value+=dt;night.uScreen.value=screenHalf(mobile);}}};
}
// A camera proxy: the vertical prism over a 3D outline (z from z0 to z1).
function prism(pts,z0,z1){const B=new Batch();for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];B.quad([a[0],a[1],z0],[b[0],b[1],z0],[b[0],b[1],z1],[a[0],a[1],z1],[1,1,1]);}B.fan(pts.map(p=>[p[0],p[1],z1]),[1,1,1],[0,0,1]);const o=B.mesh('Orla_obstaculo',new THREE.MeshBasicMaterial(),false);o.updateMatrixWorld(true);return o;}
