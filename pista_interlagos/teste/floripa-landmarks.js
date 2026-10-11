import * as THREE from 'three';
import {canvasTexture} from './pit-textures.js';

// The postcard of Florianópolis round the street circuit (data.scenery.landmarks, gerar_floripa.py): the Rodoviária
// Rita Maria beside the boxes, the TICEN, the Mercado Público and the Casa da Alfândega, the Catedral, the Forte de
// Santana under the bridge's island head and the aerials on the Morro da Cruz. Each building stands on its real OSM
// footprint (outline, w × d along heading) and is drawn from the facts gathered for the circuit: the Rodoviária's
// hexagonal precast roof tubes, the TICEN's folded canopies and teal bus loops, the yellow market round its covered
// passage. Everything is merged by material into a handful of meshes: one set near the track (casts shadows), one far
// off (the old centre, the masts 3 km away). Nothing here touches the road, its walls or the pit lane and garages.

function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
// Linear colours (vertex colours are linear): an sRGB hex scaled by k.
const lin=(hex,k=1)=>{const c=new THREE.Color(hex);return [c.r*k,c.g*k,c.b*k];};
const mul=(c,k)=>[c[0]*k,c[1]*k,c[2]*k];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};
// A building's frame: u along its heading, v to the left of it, z up from oz; returns track coordinates.
const frame=(ox,oy,oz,h)=>{const c=Math.cos(h),s=Math.sin(h);return (u,v,z)=>[ox+u*c-v*s,oy+u*s+v*c,oz+z];};
// A wall face of frame L from (u0,v0) to (u1,v1): a along it, o out of the building (away from centre cu,cv), z up.
const faceFrame=(L,u0,v0,u1,v1,cu=0,cv=0)=>{const len=Math.hypot(u1-u0,v1-v0),tu=(u1-u0)/len,tv=(v1-v0)/len;let nu=tv,nv=-tu;if(nu*((u0+u1)/2-cu)+nv*((v0+v1)/2-cv)<0){nu=-nu;nv=-nv;}const f=(a,o,z)=>L(u0+a*tu+o*nu,v0+a*tv+o*nv,z);f.len=len;return f;};
// The same frame with its first two axes swapped (a hip or gable roof's ridge along the other side).
const swap=f=>(a,b,z)=>f(b,a,z);
const outOf=f=>sub(f(0,1,0),f(0,0,0));

// Value noise for weathering that never repeats: patches of dirt, damp and faded paint over whole buildings.
const hash=(i,j)=>{const h=Math.sin(i*127.1+j*311.7)*43758.5453;return h-Math.floor(h);};
function noise(x,y){const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,su=u*u*(3-2*u),sv=v*v*(3-2*v);return (hash(i,j)*(1-su)+hash(i+1,j)*su)*(1-sv)+(hash(i,j+1)*(1-su)+hash(i+1,j+1)*su)*sv;}
const fbm=(x,y)=>.55*noise(x,y)+.3*noise(x*2.1+5.2,y*2.1+1.3)+.15*noise(x*4.3+9.1,y*4.3+7.7);
// A plastered or painted wall's colour at p: broad patches of faded and dirtier paint, rising damp above the floor.
const weathered=(base,floor,{amount=.16,damp=.2}={})=>p=>{const n=fbm((p[0]+p[1]*.7)/6+p[2]*.09,(p[1]-p[0]*.4)/6-p[2]*.13),wet=damp*Math.max(0,1-(p[2]-floor)/1.3)*(.6+.8*noise(p[0]/1.7+p[1]/2.3,3.1)),k=(1-amount/2+amount*n)*(1-wet);return [base[0]*k,base[1]*k*(1-wet*.15),base[2]*k*(1-wet*.25)];};
// Old tiles at p: patches of darker and paler clay, moss and soot where water stands.
const aged=(base,{amount=.34}={})=>p=>{const n=fbm(p[0]/7,p[1]/7),moss=Math.max(0,fbm(p[0]/4.3+11,p[1]/4.3+3)-.58)*2.4,k=1-amount/2+amount*n;return [base[0]*k*(1-.45*moss),base[1]*k*(1-.25*moss),base[2]*k*(1-.35*moss)];};

// Flat-shaded triangles gathered per material in track coordinates (x east, y north, z up), drawn as one mesh.
// UVs are metres over `size` (one texture repeat): level faces take x and y, walls the run along them and z.
class Batch{
 constructor(size=0,cell=0){this.size=size;this.cell=cell;this.p=[];this.n=[];this.c=[];this.t=[];}
 get vertices(){return this.p.length/3;}
 tri(a,b,c,col,uv){
  const n=cross(sub(b,a),sub(c,a)),l=Math.hypot(n[0],n[1],n[2]);if(l<1e-9)return;const nx=n[0]/l,ny=n[1]/l,nz=n[2]/l,q=[a,b,c];
  for(let i=0;i<3;i++){
   const p=q[i],k=typeof col==='function'?col(p):col;this.p.push(p[0],p[2],-p[1]);this.n.push(nx,nz,-ny);this.c.push(k[0],k[1],k[2]);
   if(!this.size)continue;let s,t;
   if(uv)[s,t]=uv[i];else if(Math.abs(nz)>.7){s=p[0];t=p[1];}else{const h=Math.hypot(nx,ny);s=(-ny*p[0]+nx*p[1])/h;t=p[2];}
   this.t.push(s/this.size,t/this.size);
  }
 }
 // A planar quad a-b-c-d turned to face `out` (a direction in track coordinates) when given.
 quad(a,b,c,d,col,out,uv){
  if(out&&dot(cross(sub(c,a),sub(d,b)),out)<0){[b,d]=[d,b];if(uv)uv=[uv[0],uv[3],uv[2],uv[1]];}
  this.tri(a,b,c,col,uv&&[uv[0],uv[1],uv[2]]);this.tri(a,c,d,col,uv&&[uv[0],uv[2],uv[3]]);
 }
 // A quad split into cells of at most `cell` metres (bilinear), so a colour function varies across it.
 grid(a,b,c,d,col,out,uv,cell){
  const len=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]),n=Math.max(1,Math.ceil(Math.max(len(a,b),len(d,c))/cell)),m=Math.max(1,Math.ceil(Math.max(len(a,d),len(b,c))/cell));
  if(n*m===1||typeof col!=='function')return this.quad(a,b,c,d,col,out,uv);
  const at=(s,t)=>{const p=[0,0,0];for(let k=0;k<3;k++)p[k]=(a[k]*(1-s)+b[k]*s)*(1-t)+(d[k]*(1-s)+c[k]*s)*t;return p;},tx=(s,t)=>uv&&[0,1].map(k=>(uv[0][k]*(1-s)+uv[1][k]*s)*(1-t)+(uv[3][k]*(1-s)+uv[2][k]*s)*t);
  for(let i=0;i<n;i++)for(let j=0;j<m;j++){const s0=i/n,s1=(i+1)/n,t0=j/m,t1=(j+1)/m;this.quad(at(s0,t0),at(s1,t0),at(s1,t1),at(s0,t1),col,out,uv&&[tx(s0,t0),tx(s1,t0),tx(s1,t1),tx(s0,t1)]);}
 }
 // A convex polygon (fan) facing `out`.
 poly(pts,col,out){
  const n=[0,0,0];for(let i=1;i<pts.length-1;i++){const m=cross(sub(pts[i],pts[0]),sub(pts[i+1],pts[0]));n[0]+=m[0];n[1]+=m[1];n[2]+=m[2];}
  if(dot(n,out)<0)pts=[...pts].reverse();for(let i=1;i<pts.length-1;i++)this.tri(pts[0],pts[i],pts[i+1],col);
 }
 // A box a0..a1 × b0..b1 × z0..z1 in frame f; every face turned away from its centre.
 box(f,a0,a1,b0,b1,z0,z1,col,{bottom=false,top=true,ends=true,sides=true,back=true,cell=0}={}){
  const P=(i,j,k)=>f(i?a1:a0,j?b1:b0,k?z1:z0),c=f((a0+a1)/2,(b0+b1)/2,(z0+z1)/2);
  const face=(A,B,C,D)=>this.grid(A,B,C,D,col,sub([(A[0]+C[0])/2,(A[1]+C[1])/2,(A[2]+C[2])/2],c),null,cell||this.cell||1e9);
  if(ends){face(P(0,0,0),P(0,1,0),P(0,1,1),P(0,0,1));face(P(1,0,0),P(1,1,0),P(1,1,1),P(1,0,1));}
  if(sides){if(back)face(P(0,0,0),P(1,0,0),P(1,0,1),P(0,0,1));face(P(0,1,0),P(1,1,0),P(1,1,1),P(0,1,1));}
  if(bottom)face(P(0,0,0),P(1,0,0),P(1,1,0),P(0,1,0));
  if(top)face(P(0,0,1),P(1,0,1),P(1,1,1),P(0,1,1));
 }
 // An n-sided post from p (radius r0) to q (radius r1), any direction; rot turns its section.
 post(p,q,r0,r1,n,col,{rot=0,top=true,bottom=false}={}){
  const d=unit(sub(q,p)),e1=unit(Math.abs(d[2])>.99?cross([0,1,0],d):cross(d,[0,0,1])),e2=cross(d,e1);
  const ring=(c,r)=>Array.from({length:n},(_,i)=>{const a=rot+i*2*Math.PI/n,x=Math.cos(a)*r,y=Math.sin(a)*r;return [c[0]+e1[0]*x+e2[0]*y,c[1]+e1[1]*x+e2[1]*y,c[2]+e1[2]*x+e2[2]*y];});
  const A=ring(p,r0),B=ring(q,r1);
  for(let i=0;i<n;i++){const j=(i+1)%n,m=sub([(A[i][0]+A[j][0])/2,(A[i][1]+A[j][1])/2,(A[i][2]+A[j][2])/2],p);this.quad(A[i],A[j],B[j],B[i],col,sub(m,mul(d,dot(m,d))));}
  if(top&&r1>0)this.poly(B,col,d);if(bottom&&r0>0)this.poly(A,col,mul(d,-1));
 }
 // A semicircular ring in the face plane of f at depth o: centre (a,z), radii r0..r1.
 arch(f,a,z,r0,r1,o,col,segs=8){
  const out=outOf(f),P=(r,t)=>f(a+Math.cos(t)*r,o,z+Math.sin(t)*r);
  for(let i=0;i<segs;i++){const t0=Math.PI*i/segs,t1=Math.PI*(i+1)/segs;this.quad(P(r0,t0),P(r0,t1),P(r1,t1),P(r1,t0),col,out);}
 }
 // A half disc (an arched window's head) in the face plane of f.
 fan(f,a,z,r,o,col,segs=8){const pts=[];for(let i=0;i<=segs;i++){const t=Math.PI*i/segs;pts.push(f(a+Math.cos(t)*r,o,z+Math.sin(t)*r));}this.poly(pts,col,outOf(f));}
 // A hipped roof over a0..a1 × b0..b1 of f, eaves at z `over` past the walls, rising `rise`; the ridge runs along the
 // longer side (a pyramid over a square). UVs run along the eaves and up the slope, so the tile courses lie level.
 // under: the batch for the eaves' soffit (with its colour).
 hipRoof(f,a0,a1,b0,b1,z,rise,over,col,under){
  if(b1-b0>a1-a0)return this.hipRoof(swap(f),b0,b1,a0,a1,z,rise,over,col,under);
  a0-=over;a1+=over;b0-=over;b1+=over;
  const h=(b1-b0)/2,r0=a0+h,r1=a1-h,bm=(b0+b1)/2,zt=z+rise,sl=Math.hypot(h,rise),c=f((a0+a1)/2,bm,z-2);
  const face=(pts,uv)=>{const m=pts.reduce((s,p)=>[s[0]+p[0]/pts.length,s[1]+p[1]/pts.length,s[2]+p[2]/pts.length],[0,0,0]);if(pts.length===3){pts=[...pts,pts[2]];uv=[...uv,uv[2]];}this.grid(...pts,col,sub(m,c),uv,3);};
  face([f(a0,b0,z),f(a1,b0,z),f(r1,bm,zt),f(r0,bm,zt)],[[a0,0],[a1,0],[r1,sl],[r0,sl]]);
  face([f(a0,b1,z),f(a1,b1,z),f(r1,bm,zt),f(r0,bm,zt)],[[a0,0],[a1,0],[r1,sl],[r0,sl]]);
  face([f(a0,b0,z),f(a0,b1,z),f(r0,bm,zt)],[[b0,0],[b1,0],[bm,sl]]);
  face([f(a1,b0,z),f(a1,b1,z),f(r1,bm,zt)],[[b0,0],[b1,0],[bm,sl]]);
  // The eaves' edge (the tiles' thickness) and the soffit under the overhang.
  this.box(f,a0,a1,b0,b1,z-.14,z,col,{top:false});
  if(under&&over>0)under[0].quad(f(a0,b0,z-.14),f(a1,b0,z-.14),f(a1,b1,z-.14),f(a0,b1,z-.14),under[1],[0,0,-1]);
 }
 // A gable roof with the ridge along a; returns the two gable triangles for the walls' batch.
 gableRoof(f,a0,a1,b0,b1,z,rise,over,col,{ends=over,under}={}){
  const bm=(b0+b1)/2,A0=a0-ends,A1=a1+ends,B0=b0-over,B1=b1+over,zt=z+rise,zo=z-over*rise/((b1-b0)/2),sl=Math.hypot(bm-B0,zt-zo),c=f((a0+a1)/2,bm,z-2);
  for(const b of [B0,B1])this.grid(f(A0,b,zo),f(A1,b,zo),f(A1,bm,zt),f(A0,bm,zt),col,sub(f((a0+a1)/2,(b+bm)/2,(zo+zt)/2),c),[[A0,0],[A1,0],[A1,sl],[A0,sl]],3);
  this.box(f,A0,A1,B0,B1,zo-.14,zo,col,{top:false,bottom:false});
  if(under)under[0].quad(f(A0,B0,zo-.14),f(A1,B0,zo-.14),f(A1,B1,zo-.14),f(A0,B1,zo-.14),under[1],[0,0,-1]);
  return [[f(a0,b0,z),f(a0,b1,z),f(a0,bm,z+rise)],[f(a1,b0,z),f(a1,b1,z),f(a1,bm,z+rise)]];
 }
 mesh(name,material,shadow){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
  if(this.size)g.setAttribute('uv',new THREE.Float32BufferAttribute(this.t,2));g.computeBoundingSphere();
  const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.castShadow=shadow;mesh.receiveShadow=true;return mesh;
 }
}

// ---------- Surfaces (drawn once at load; the tone of each piece is in its vertex colours) ----------
const wrap=(w,h,x,y,s,fn)=>{for(const dx of [-w,0,w])for(const dy of [-h,0,h])if(x+dx+s>0&&x+dx-s<w&&y+dy+s>0&&y+dy-s<h)fn(x+dx,y+dy);};
function grain(ctx,amount,r){const img=ctx.getImageData(0,0,ctx.canvas.width,ctx.canvas.height),d=img.data;for(let i=0;i<d.length;i+=4){const n=(r()-.5)*amount;d[i]+=n;d[i+1]+=n;d[i+2]+=n;}ctx.putImageData(img,0,0);}
function blotches(ctx,w,h,r,count,light,dark,size,alpha){for(let k=0;k<count;k++){const x=r()*w,y=r()*h,s=size*(.3+r()),c=r()<.5?light:dark,a=alpha*(.4+r());wrap(w,h,x,y,s,(px,py)=>{const g=ctx.createRadialGradient(px,py,0,px,py,s);g.addColorStop(0,`rgba(${c},${a})`);g.addColorStop(1,`rgba(${c},0)`);ctx.fillStyle=g;ctx.fillRect(px-s,py-s,2*s,2*s);});}}
function streaks(ctx,w,h,r,count,color,alpha){for(let k=0;k<count;k++){const x=r()*w,top=r()*h,len=h*(.08+r()*.45),wd=1+r()**2*9,a=alpha*(.3+r());for(const dy of [0,-h])for(const dx of x+wd>w?[0,-w]:[0]){const g=ctx.createLinearGradient(0,top+dy,0,top+dy+len);g.addColorStop(0,`rgba(${color},${a})`);g.addColorStop(1,`rgba(${color},0)`);ctx.fillStyle=g;ctx.fillRect(x+dx,top+dy,wd,len);}}}
// Painted exposed concrete (8 m a repeat): pour patches, rain streaks down from every ledge, pores.
const concreteTexture=()=>canvasTexture((ctx,w,h)=>{const r=random(5);ctx.fillStyle='#dadad6';ctx.fillRect(0,0,w,h);blotches(ctx,w,h,r,70,'255,255,250','70,72,72',90,.07);streaks(ctx,w,h,r,150,'38,40,38',.11);for(let k=0;k<26;k++){ctx.fillStyle=`rgba(40,40,40,${.03+r()*.05})`;ctx.fillRect(0,r()*h,w,1);}grain(ctx,24,r);},512,512,true);
// Lime plaster (4 m): soft mottling of the wash, dirt run down from the cornices, fine grain. Nearly white.
const stuccoTexture=()=>canvasTexture((ctx,w,h)=>{const r=random(17);ctx.fillStyle='#efede8';ctx.fillRect(0,0,w,h);blotches(ctx,w,h,r,90,'255,255,252','120,110,95',40,.07);streaks(ctx,w,h,r,40,'90,80,70',.07);grain(ctx,12,r);},256,256,true);
// Colonial clay tiles, capa e canal (2 m): columns of convex and concave tiles down the slope, a course every 40 cm
// with the shadow of the tile above, each tile its own red, lichen and soot. U along the eaves, V up the slope.
const tileTexture=()=>canvasTexture((ctx,w,h)=>{
 const r=random(23),cols=10,rows=5,cw=w/cols,rh=h/rows,clay=[[180,85,58],[168,74,50],[191,100,64],[154,68,48],[184,94,62],[163,82,58],[140,62,44],[196,108,71],[150,80,62]];
 const css=(c,k)=>`rgb(${Math.min(255,c[0]*k)|0},${Math.min(255,c[1]*k)|0},${Math.min(255,c[2]*k)|0})`;
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
  const x=i*cw,y=j*rh,c=clay[Math.floor(r()*clay.length)],k=.85+r()*.3,g=ctx.createLinearGradient(x,0,x+cw,0);
  if(i%2===0){g.addColorStop(0,css(c,.62*k));g.addColorStop(.45,css(c,1.12*k));g.addColorStop(1,css(c,.58*k));}else{g.addColorStop(0,css(c,.82*k));g.addColorStop(.5,css(c,.55*k));g.addColorStop(1,css(c,.82*k));}
  ctx.fillStyle=g;ctx.fillRect(x,y,cw+.5,rh+.5);
  const s=ctx.createLinearGradient(0,y,0,y+rh*.35);s.addColorStop(0,'rgba(25,10,5,.5)');s.addColorStop(1,'rgba(25,10,5,0)');ctx.fillStyle=s;ctx.fillRect(x,y,cw,rh*.35);
 }
 blotches(ctx,w,h,r,60,'120,125,95','30,26,22',14,.22);grain(ctx,16,r);
},256,256,true);
// Smoked glass in aluminium frames (2.8 m): four panes, each its own shade, mullions and transoms.
const glassTexture=()=>canvasTexture((ctx,w,h)=>{const r=random(31);for(let j=0;j<2;j++)for(let i=0;i<2;i++){const v=78+r()*34,g=ctx.createLinearGradient(0,j*h/2,0,(j+1)*h/2);g.addColorStop(0,`rgb(${v+18},${v+20},${v+24})`);g.addColorStop(1,`rgb(${v},${v},${v+3})`);ctx.fillStyle=g;ctx.fillRect(i*w/2,j*h/2,w/2,h/2);}ctx.fillStyle='#c4c7c9';for(const x of [0,w/2,w])ctx.fillRect(x-3,0,6,h);for(const y of [0,h/2,h])ctx.fillRect(0,y-2,w,4);},256,256,true);
// Folded metal roofing and slatted soffits (2 m): slats along U, a seam between each.
const slatTexture=()=>canvasTexture((ctx,w,h)=>{const n=8,s=h/n;for(let k=0;k<n;k++){const g=ctx.createLinearGradient(0,k*s,0,(k+1)*s);g.addColorStop(0,'#fbfbf8');g.addColorStop(.8,'#e6e7e4');g.addColorStop(1,'#a3a6a4');ctx.fillStyle=g;ctx.fillRect(0,k*s,w,s);}},128,128,true);
// The bus station's own name in plain capitals, cut out of the canvas (alpha): white with a navy edge, so it reads
// against the sky from the road and against the roof from the bridges.
function signTexture(text){
 let width=0;const map=canvasTexture((ctx,w,h)=>{ctx.clearRect(0,0,w,h);ctx.font='700 168px "Helvetica Neue",Arial,sans-serif';ctx.textBaseline='middle';ctx.textAlign='center';width=Math.min(w,ctx.measureText(text).width+60);ctx.lineJoin='round';ctx.lineWidth=16;ctx.strokeStyle='#14294a';ctx.strokeText(text,w/2,h/2+6,w-30);ctx.fillStyle='#f4f4f0';ctx.fillText(text,w/2,h/2+6,w-30);},2048,256);
 map.anisotropy=8;return {map,aspect:width/256,fill:width/2048};
}

// ---------- Rodoviária Rita Maria (1981): 214 × 70 m, 13 m, Brutalist ----------
// The roof is the building: hexagonal precast tubes 2.1 m deep spanning 35 m from a central beam to each side,
// side by side every 2.8 m, so the eaves read as a row of hexagons and the top as a corrugated grey sheet. Under it
// the hall's smoked glass behind galvanised sunshades (north, toward Av. Paulo Fontes and the sun), the bus
// platforms on the south side under the roof's other half, a few coaches at the bays, the name on the roof.
const TUBE=2.8,TUBE_HEX=[[0,1.05],[1.4,.42],[1.4,-.42],[0,-1.05],[-1.4,-.42],[-1.4,.42]],TUBE_Z=11.95;
function rodoviaria(m,{near:{concrete:C,glass:G,steel:M,paint:P,sign:T},ground,mobile,rand,sign,proxies}){
 const W=m.w/2,D=m.d/2,L0=frame(m.x,m.y,0,m.heading);
 const {floor:z0,low:lo}=footing(L0,ground,m.ground,-W,W,-D,D,10),F=frame(m.x,m.y,z0,m.heading),FACADE=D-3.2,HALL_S=-14,HW=W-3.4;
 const grey=lin(0x9a9b98),paving=lin(0x8c8b86),beamGrey=lin(0xa3a4a0),dark=lin(0x2a2c2e),galv=lin(0xb9bec0),glassTone=[.42,.42,.44];
 // Paving under the roof, a plinth down to the lowest ground.
 C.box(F,-W,W,-D,D,lo-z0-.6,0,p=>{const k=.86+.24*fbm(p[0]/11,p[1]/11)-.12*Math.max(0,fbm(p[0]/3+4,p[1]/3)-.6)*3;return mul(paving,k);});
 // Roof tubes: two sets either side of the central beam; only the faces that show (the shared sides between
 // neighbours are left out), the outer ends open with a dark hollow.
 const n=Math.floor(2*W/TUBE),u0=-n*TUBE/2,BEAM=.8;
 for(const side of [1,-1])for(let k=0;k<n;k++){
  const uc=u0+TUBE*(k+.5),g=.98+rand()*.12-(rand()<.12?.1:0),vA=side*BEAM,vB=side*D;
  for(let i=0;i<6;i++){
   if((i===1&&k<n-1)||(i===4&&k>0))continue;
   const a=TUBE_HEX[i],b=TUBE_HEX[(i+1)%6],my=(a[1]+b[1])/2,tone=my>.3?.6:my<-.3?1.02:.9;
   C.quad(F(uc+a[0],vA,TUBE_Z+a[1]),F(uc+b[0],vA,TUBE_Z+b[1]),F(uc+b[0],vB,TUBE_Z+b[1]),F(uc+a[0],vB,TUBE_Z+a[1]),mul(grey,g*tone),sub(F(uc+(a[0]+b[0])/2,0,TUBE_Z+my),F(uc,0,TUBE_Z)));
  }
  const out=sub(F(0,side,0),F(0,0,0)),ring=TUBE_HEX.map(([x,y])=>F(uc+x,vB,TUBE_Z+y)),hollow=TUBE_HEX.map(([x,y])=>F(uc+x*.72,vB,TUBE_Z+y*.66)),deep=TUBE_HEX.map(([x,y])=>F(uc+x*.72,vB-side*.5,TUBE_Z+y*.66));
  for(let i=0;i<6;i++){const j=(i+1)%6;C.quad(ring[i],ring[j],hollow[j],hollow[i],mul(grey,g*.95),out);if(!mobile)C.quad(hollow[i],hollow[j],deep[j],deep[i],mul(grey,g*.42),sub(F(uc,vB,TUBE_Z),F(uc+(TUBE_HEX[i][0]+TUBE_HEX[j][0])*.36,vB,TUBE_Z+(TUBE_HEX[i][1]+TUBE_HEX[j][1])*.33)));}
  C.poly(mobile?hollow:deep,mul(grey,g*.22),out);
 }
 // Beams and columns: the spine standing a little proud of the roof, the beams at the façade lines.
 C.box(F,-W-.15,W+.15,-BEAM,BEAM,9.5,13.35,beamGrey);
 for(const v of [FACADE,-FACADE])C.box(F,-W,W,v-.45,v+.45,9.75,10.92,beamGrey);
 for(let j=1;j<n;j+=3){const u=u0+TUBE*j;for(const v of [FACADE,0,-FACADE])C.box(F,u-.4,u+.4,v-.4,v+.4,0,v?9.75:9.5,mul(beamGrey,.92+rand()*.1),{top:false});}
 // The hall: smoked glass, a concrete transom at the mezzanine, fascias up to the tubes where no beam closes it.
 const N=FACADE-.7,hall=[[N,'n'],[HALL_S,'s']];
 for(const [v,side] of hall){
  const f=faceFrame(F,-HW,v,HW,v,0,side==='n'?0:20);
  G.quad(f(0,0,0),f(f.len,0,0),f(f.len,0,9.75),f(0,0,9.75),glassTone,outOf(f));
  C.box(f,0,f.len,0,.3,4.2,5.05,beamGrey);
  if(side==='s')C.box(f,-.2,f.len+.2,0,.35,9.6,11.6,beamGrey);
 }
 for(const s of [-1,1]){
  const f=faceFrame(F,s*HW,HALL_S,s*HW,N,0,6);
  G.quad(f(0,0,0),f(f.len,0,0),f(f.len,0,9.75),f(0,0,9.75),glassTone,outOf(f));C.box(f,0,f.len,0,.3,4.2,5.05,beamGrey);C.box(f,-.3,f.len+.3,0,.35,9.6,11.6,beamGrey);
  // Galvanised sunshades in front of the upper glass at both ends (east and west sun).
  for(let z=5.4;z<9.5;z+=mobile?.9:.45)M.box(f,0,f.len,.25,.85,z,z+.05,mul(galv,.95+rand()*.08));
 }
 // North: entrances at three points, sunshades along the whole upper glass.
 for(const u of [-62,-2,58]){P.box(F,u-4.2,u+4.2,N,N+.12,0,3.3,dark);M.box(F,u-5,u+5,N,N+2.6,3.45,3.65,galv);}
 for(let z=5.4;z<9.5;z+=mobile?.9:.45)M.box(F,-HW,HW,N+.25,N+.85,z,z+.05,mul(galv,.95+rand()*.08));
 // South: doors onto the platform, the raised platform with its yellow edge, sawtooth kerbs between the 30 bays.
 const bays=30,bay=2*HW/bays;
 for(let i=0;i<bays;i+=2)P.box(F,-HW+(i+.5)*bay-1.6,-HW+(i+.5)*bay+1.6,HALL_S-.12,HALL_S,0,3,dark);
 C.box(F,-HW,HW,-20,HALL_S,0,.32,lin(0xa7a6a0));P.box(F,-HW,HW,-20.02,-19.7,.32,.335,lin(0xe0b520));
 for(let i=0;i<=bays;i++){const u=-HW+i*bay;C.box(F,u-.25,u+.25,-23.5,-20,0,.2,lin(0xb5b4ae));}
 // The buses' apron south of the roof, out to the access road.
 drape(C,[[-W,-D+.5],[W,-D+.5],[W-12,-D-22],[-W+12,-D-22]],L0,(u,v)=>{const p=L0(u,v,0);return ground?.(p[0],p[1])??m.ground;},ASPHALT,{edge:mobile?14:8});
 // Coaches at some of the bays, nose to the platform: plain liveries, no names.
 const liveries=[[0xf2f2ee,0x1d4e9e],[0xe9eaea,0x0f7a52],[0xd9dcdf,0xb3261e],[0xf3f1ea,0xe08a1a],[0x2c4f8a,0xf1f1ee],[0xe6e6e2,0x5b2d86],[0xc9ced3,0x23314d],[0xf0eee7,0x2f8f3a]];
 // (Never at a bay where the roof's outer columns stand: every third tube joint, j = 1, 4, 7...)
 const used=new Set(),buses=mobile?4:9,columnAt=u=>Math.abs(u-u0-TUBE*(Math.round(((u-u0)/TUBE-1)/3)*3+1))<2.2;
 for(let b=0;b<buses;b++){
  let i,tries=0;do i=Math.floor(rand()*bays);while((used.has(i)||columnAt(-HW+(i+.5)*bay))&&++tries<200);used.add(i);
  const u=-HW+(i+.5)*bay,[body,stripe]=liveries[Math.floor(rand()*liveries.length)],v1=-20.6-rand()*.6,v0=v1-12.2;
  P.box(F,u-1.2,u+1.2,v0+.4,v1-.4,.12,.55,[.02,.02,.02]);
  P.box(F,u-1.27,u+1.27,v0,v1,.55,1.75,lin(body));
  P.box(F,u-1.29,u+1.29,v0+.6,v1-1.2,1.1,1.42,lin(stripe),{ends:false});
  G.box(F,u-1.25,u+1.25,v0+.2,v1-.05,1.75,3.05,[.16,.17,.18]);
  P.box(F,u-1.27,u+1.27,v0,v1-.3,3.05,3.6,lin(body,.98));
 }
 // Rooftop: plant rooms, and photovoltaic fields laid on the tubes' east and west faces (2024).
 const plants=mobile?5:8;
 for(let k=0;k<plants;k++){const u=-W+12+rand()*(2*W-24),v=(rand()<.5?1:-1)*(7+rand()*20),w=3+rand()*4,d=2.5+rand()*3;P.box(F,u-w/2,u+w/2,v-d/2,v+d/2,12.6,13.9+rand()*.8,lin(0xe9e9e4,.9+rand()*.1));}
 if(!mobile)for(let k=0;k<5;k++){
  const k0=Math.floor(rand()*(n-14)),k1=k0+5+Math.floor(rand()*8),side=rand()<.5?1:-1,v0=side*(4+rand()*6),v1=side*(Math.abs(v0)+12+rand()*10);
  for(let t=k0;t<k1;t++){const uc=u0+TUBE*(t+.5);for(const s of [-1,1]){const a=[uc+s*.1,TUBE_Z+1.05-.04+.07],b=[uc+s*1.3,TUBE_Z+.42+.04+.07];G.quad(F(a[0],v0,a[1]),F(b[0],v0,b[1]),F(b[0],v1,b[1]),F(a[0],v1,a[1]),[.05,.07,.14],[0,0,1]);}}
 }
 // The name on the roof, on a steel frame: over the north edge (Av. Paulo Fontes, the bridges) and the south edge
 // (the road back from the Colombo Salles), on a 3.4 m board.
 const sh=3.4,sw=sh*sign.aspect,z1=13.6;
 for(const side of [1,-1]){
  const v=side*(D-.7),out=sub(F(0,side,0),F(0,0,0)),a=side*sw/2,uv=[[.5-sign.fill/2,0],[.5+sign.fill/2,0],[.5+sign.fill/2,1],[.5-sign.fill/2,1]];
  T.quad(F(a,v,z1),F(-a,v,z1),F(-a,v,z1+sh),F(a,v,z1+sh),[1,1,1],out,uv);
  for(const z of [z1+.35,z1+sh-.4])M.box(F,-sw/2,sw/2,v-side*.35,v-side*.2,z,z+.12,galv);
  for(let u=-sw/2;u<=sw/2+.1;u+=sw/8)M.box(F,u-.07,u+.07,v-side*.35,v-side*.2,13,z1+sh-.2,galv);
 }
 const proxy=new Batch();proxy.box(F,-W,W,-D,D,-.5,13.4,[1,1,1]);proxies.push(proxy.mesh('Rodoviaria_obstaculo',new THREE.MeshBasicMaterial(),false));
 return {tubes:2*n,buses};
}

// ---------- TICEN (2003): the city's bus interchange ----------
// Four long platform canopies running NNW–SSE, white folded (butterfly) metal roofs on one row of dark round
// columns, palms on the medians between the bus lanes, and at the north end three U-turn loops round the platforms'
// ends, each edged with a teal curved canopy and wall: the loops are the three round lobes of the site's outline.
// Loops: centre (u,v) along/across the site and the outer radius, fitted to the outline's arcs.
const TICEN_LOOPS=[[-78.4,-39.4,20.1],[-102.4,-5.1,19.1],[-79.9,25.9,24]];
// Canopies: across the site (v), start (u0: a loop's centre, where the bus turns round), real length and width.
const TICEN_CANOPIES=[{v:-39.4,u0:-78.4,len:165,w:16},{v:-5.1,u0:-102.4,len:199,w:16},{v:25.9,u0:-79.9,len:197,w:16},{v:55,u0:-50,len:83,w:15}];
function ticen(m,{near:{concrete:C,paint:P,roof:R,foliage:V},ground,mobile,rand,palm}){
 const L=frame(m.x,m.y,0,m.heading),local=m.outline.slice(0,-1).map(([x,y])=>{const dx=x-m.x,dy=y-m.y,c=Math.cos(m.heading),s=Math.sin(m.heading);return [dx*c+dy*s,-dx*s+dy*c];});
 const z=(u,v)=>ground?.(...L(u,v,0).slice(0,2))??m.ground;
 // Where a line v=const first leaves the site going south from u.
 const exitU=(v,u)=>{let best=Infinity;for(let i=0;i<local.length;i++){const a=local[i],b=local[(i+1)%local.length];if((a[1]-v)*(b[1]-v)>0||a[1]===b[1])continue;const t=(v-a[1])/(b[1]-a[1]),x=a[0]+t*(b[0]-a[0]);if(x>u+5)best=Math.min(best,x);}return best;};
 const nearEdge=(u,v)=>{let best=Infinity;for(let i=0;i<local.length;i++){const a=local[i],b=local[(i+1)%local.length],dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((u-a[0])*dx+(v-a[1])*dy)/l)):0;best=Math.min(best,Math.hypot(u-a[0]-t*dx,v-a[1]-t*dy));}return best;};
 const white=lin(0xf1f1ec),column=lin(0x2b2f33),kerb=lin(0xb7b5ae),grass=lin(0x4f7a2c),teal=lin(0x1b8a84),tealDark=lin(0x14706b);
 let columns=0,palms=0;
 // The site is paved: dark asphalt over the whole outline, following the ground.
 drape(C,local,L,z,ASPHALT,{edge:mobile?12:7});
 const canopies=TICEN_CANOPIES.map(c=>({...c,u1:Math.min(c.u0+c.len,exitU(c.v-c.w/2+1,c.u0)-3,exitU(c.v+c.w/2-1,c.u0)-3)}));
 for(const c of canopies){
  const zc=Math.max(z(c.u0,c.v),z((c.u0+c.u1)/2,c.v),z(c.u1,c.v))+.05,F=frame(...L(0,c.v,0).slice(0,2),zc,m.heading),h=c.w/2,tone=.94+rand()*.08;
  // Platform island under the roof (it starts in the loop's round island), a yellow line along each kerb.
  C.box(F,c.u0,c.u1,-4.6,4.6,-.4,.3,kerb);
  for(const s of [-1,1])for(let u=c.u0+2;u<c.u1;u+=6){const u2=Math.min(c.u1,u+6),y=c.v+s*4.85,p=(uu,yy)=>L(uu,yy,z(uu,yy)+.13);P.quad(p(u,y-.08),p(u2,y-.08),p(u2,y+.08),p(u,y+.08),lin(0xd9b21e),[0,0,1]);}
  // The butterfly roof: top sloping down to a gutter over the columns, a slatted soffit under it, fascias.
  const zv=5.25,dz=.85,t=.38,top=y=>zv+Math.abs(y)/h*dz,u0=c.u0-1,u1=c.u1;
  for(const s of [-1,1]){
   R.quad(F(u0,0,top(0)),F(u1,0,top(0)),F(u1,s*h,top(h)),F(u0,s*h,top(h)),mul(white,tone),[0,0,1],[[0,u0],[0,u1],[s*h,u1],[s*h,u0]]);
   R.quad(F(u0,0,top(0)-t),F(u1,0,top(0)-t),F(u1,s*h,top(h)-t),F(u0,s*h,top(h)-t),mul(white,tone*.86),[0,0,-1],[[u0,0],[u1,0],[u1,s*h],[u0,s*h]]);
   R.quad(F(u0,s*h,top(h)-t),F(u1,s*h,top(h)-t),F(u1,s*h,top(h)),F(u0,s*h,top(h)),mul(white,tone*.95),sub(F(0,s,0),F(0,0,0)));
   for(const u of [u0,u1])R.quad(F(u,0,top(0)-t),F(u,s*h,top(h)-t),F(u,s*h,top(h)),F(u,0,top(0)),mul(white,tone*.9),sub(F(u===u0?-1:1,0,0),F(0,0,0)));
  }
  // The beam under the gutter and the single row of dark columns carrying it.
  P.box(F,u0+.5,u1-.5,-.3,.3,zv-t-.55,zv-t,column);
  const step=mobile?14:9.6;for(let u=c.u0+2.5;u<c.u1-1;u+=step){P.post(F(u,0,.3),F(u,0,zv-t-.5),.27,.24,mobile?6:10,mul(column,.9+rand()*.2));columns++;}
 }
 // Medians between the lanes of the first three platforms, with palms; palms on the loops' islands too.
 for(let i=0;i<2;i++){
  const a=canopies[i],b=canopies[i+1],v=(a.v+a.w/2+b.v-b.w/2)/2,u0=Math.max(a.u0,b.u0)+12,u1=Math.min(a.u1,b.u1)-4,zm=z((u0+u1)/2,v)+.05,F=frame(...L(0,v,0).slice(0,2),zm,m.heading);
  C.box(F,u0,u1,-1.4,1.4,-.4,.18,kerb);V.box(F,u0+.15,u1-.15,-1.25,1.25,.18,.24,grass);
  for(let u=u0+4+rand()*3;u<u1-3;u+=(mobile?20:10)+rand()*4){palm(V,F(u,(rand()-.5)*.8,.2),rand);palms++;}
 }
 // The loops: a teal canopy over the outer platform along the free arc of each lobe, its low wall behind,
 // a round planted island in the middle.
 let arcs=0;
 for(const [lu,lv,r] of TICEN_LOOPS){
  const steps=90,keep=[];for(let i=0;i<steps;i++){const a=i/steps*2*Math.PI;keep.push(nearEdge(lu+Math.cos(a)*r,lv+Math.sin(a)*r)<3.5);}
  // The longest run of kept angles (round the circle).
  let start=0,best=0;for(let i=0;i<steps;i++){if(keep[i]&&!keep[(i+steps-1)%steps]){let n=0;while(n<steps&&keep[(i+n)%steps])n++;if(n>best){best=n;start=i;}}}
  if(best===steps)start=0;if(best<6)continue;arcs++;
  const zl=z(lu,lv)+.05,F=frame(...L(lu,lv,0).slice(0,2),zl,m.heading),P2=(a,rr,zz)=>F(Math.cos(a)*rr,Math.sin(a)*rr,zz),seg=mobile?2:1;
  for(let i=0;i<best;i+=seg){
   const a0=(start+i)/steps*2*Math.PI,a1=(start+Math.min(best,i+seg))/steps*2*Math.PI,ri=r-5,ro=r-.6,zi=4.6,zo=4.15;
   P.quad(P2(a0,ri,zi),P2(a1,ri,zi),P2(a1,ro,zo),P2(a0,ro,zo),mul(teal,1.05),[0,0,1]);
   P.quad(P2(a0,ri,zi-.22),P2(a1,ri,zi-.22),P2(a1,ro,zo-.22),P2(a0,ro,zo-.22),mul(teal,.8),[0,0,-1]);
   P.quad(P2(a0,ro,zo-.22),P2(a1,ro,zo-.22),P2(a1,ro,zo),P2(a0,ro,zo),teal,sub(P2((a0+a1)/2,1,0),P2(0,0,0)));
   P.quad(P2(a0,ri,zi-.22),P2(a1,ri,zi-.22),P2(a1,ri,zi),P2(a0,ri,zi),teal,sub(P2(0,0,0),P2((a0+a1)/2,1,0)));
   // Wall: a curved teal parapet on the outer edge; the platform slab inside it.
   P.quad(P2(a0,r,0),P2(a1,r,0),P2(a1,r,1.25),P2(a0,r,1.25),tealDark,sub(P2((a0+a1)/2,1,0),P2(0,0,0)));
   P.quad(P2(a0,r-.3,0),P2(a1,r-.3,0),P2(a1,r-.3,1.25),P2(a0,r-.3,1.25),tealDark,sub(P2(0,0,0),P2((a0+a1)/2,1,0)));
   P.quad(P2(a0,r-.3,1.25),P2(a1,r-.3,1.25),P2(a1,r,1.25),P2(a0,r,1.25),tealDark,[0,0,1]);
   C.quad(P2(a0,r-4.2,.25),P2(a1,r-4.2,.25),P2(a1,r-.3,.25),P2(a0,r-.3,.25),kerb,[0,0,1]);
   C.quad(P2(a0,r-4.2,-.3),P2(a1,r-4.2,-.3),P2(a1,r-4.2,.25),P2(a0,r-4.2,.25),kerb,sub(P2(0,0,0),P2((a0+a1)/2,1,0)));
   if(i%(mobile?6:4)===0)P.post(P2(a0,r-1.1,.25),P2(a0,r-1.1,zo-.1),.11,.11,6,tealDark);
  }
  // The island: kerb, grass, palms.
  const ri=Math.max(5,r-12.5),ring=[];for(let i=0;i<20;i++){const a=i/20*2*Math.PI;ring.push([Math.cos(a)*ri,Math.sin(a)*ri]);}
  for(let i=0;i<20;i++){const [a,b]=[ring[i],ring[(i+1)%20]];C.quad(F(a[0],a[1],-.3),F(b[0],b[1],-.3),F(b[0],b[1],.22),F(a[0],a[1],.22),kerb,sub(F((a[0]+b[0])/2,(a[1]+b[1])/2,0),F(0,0,0)));}
  V.poly(ring.map(([x,y])=>F(x*.95,y*.95,.24)),grass,[0,0,1]);C.poly(ring.map(([x,y])=>F(x,y,.22)),kerb,[0,0,1]);
  for(let k=0,count=mobile?1:2+Math.floor(rand()*2);k<count;k++){const a=rand()*6.3,d=rand()*ri*.6;palm(V,F(Math.cos(a)*d,Math.sin(a)*d,.24),rand);palms++;}
 }
 return {canopies:canopies.length,columns,palms,loops:arcs};
}

// A palm (Syagrus / royal palm look): a slim grey trunk with a slight bend and lean, a crown of arching fronds with
// leaflets either side of the rib. Every one its own height, lean, frond count and greens.
function palm(V,base,rand){
 const h=7+rand()*6,lean=rand()*6.3,tilt=.03+rand()*.06,bark=lin(0x8b857a,.85+rand()*.25),pts=[base];
 for(let i=1;i<=3;i++){const t=i/3,off=h*tilt*t*t;pts.push([base[0]+Math.cos(lean)*off,base[1]+Math.sin(lean)*off,base[2]+h*t]);}
 for(let i=0;i<3;i++)V.post(pts[i],pts[i+1],.2-.03*i,.17-.03*i,5,mul(bark,1-.06*i),{top:i===2,rot:lean});
 const top=pts[3],fronds=9+Math.floor(rand()*6),green=[.08+rand()*.04,.2+rand()*.07,.05+rand()*.03];
 V.post([top[0],top[1],top[2]-.8],[top[0],top[1],top[2]+.3],.26,.1,5,mul(green,.8));
 for(let f=0;f<fronds;f++){
  const a=f/fronds*2*Math.PI+rand()*.4,len=3.2+rand()*1.6,rise=.25+rand()*.5,droop=.7+rand()*.5,dry=rand()<.12,col=dry?[.32,.25,.1]:mul(green,.85+rand()*.35),ca=Math.cos(a),sa=Math.sin(a);
  const P=t=>[top[0]+ca*len*t,top[1]+sa*len*t,top[2]+len*(rise*t-droop*t*t)],S=6;
  for(let i=0;i<S;i++){
   const t0=i/S,t1=(i+1)/S,w0=.75*Math.sin(Math.PI*Math.min(.92,t0+.06))**.7,w1=.75*Math.sin(Math.PI*Math.min(.92,t1+.06))**.7,p0=P(t0),p1=P(t1);
   for(const s of [-1,1]){const e0=[p0[0]-sa*s*w0,p0[1]+ca*s*w0,p0[2]-w0*.45],e1=[p1[0]-sa*s*w1,p1[1]+ca*s*w1,p1[2]-w1*.45];V.quad(p0,p1,e1,e0,col,[0,0,1]);}
  }
 }
}

// ---------- Old centre: plaster, quoins and tiles ----------
// Plaster trim on a wall face f (a along it from 0 to len, o out of it, z up from the floor): stone plinth, cornice,
// pilasters between the bays, an opening per bay (green door or dark window, arched or square, in a white surround)
// and quoins at both ends. open(i): bay i's opening {w, z0, h, arch, door} or null.
function trim(f,len,top,{bays,open,plinth=.6,quoins=true,quoinFrom=plinth,pilasters=true,cornice=true,segs=6},{S,P,G,lite,rand},c){
 const bw=len/bays,flat={back:false},hid={back:false,top:false};
 if(plinth)S.box(f,0,len,0,.1,0,plinth,c.stone,flat);
 if(cornice){S.box(f,-.25,len+.25,0,.34,top-.42,top,c.white,flat);S.box(f,-.12,len+.12,0,.17,top-.74,top-.42,c.white,hid);}
 for(let i=0;i<bays;i++){
  const a=(i+.5)*bw,o=open?.(i,a);
  if(pilasters&&i>0)S.box(f,i*bw-.28,i*bw+.28,0,.12,plinth,top-.74,c.white,hid);
  if(!o)continue;
  const x0=a-o.w/2,x1=a+o.w/2,zt=o.z0+o.h;
  // Windows: dark panes, or the green shutters closed over them now and then.
  const shut=!o.door&&!o.col&&rand&&rand()<.3;
  (o.door||shut?P:G).quad(f(x0,.04,o.z0),f(x1,.04,o.z0),f(x1,.04,zt),f(x0,.04,zt),o.col??(o.door?c.door:shut?mul(c.door,.85+rand()*.35):c.glass),outOf(f));
  S.box(f,x0-.2,x0,0,.09,o.z0,zt,c.white,hid);S.box(f,x1,x1+.2,0,.09,o.z0,zt,c.white,hid);
  if(o.arch){(shut?P:G).fan(f,a,zt,o.w/2,.04,shut?mul(c.door,.7):c.glass,segs);S.arch(f,a,zt,o.w/2,o.w/2+.2,.09,c.white,segs);}
  else S.box(f,x0-.2,x1+.2,0,.11,zt,zt+.22,c.white,flat);
  if(!o.door)S.box(f,x0-.12,x1+.12,0,.15,o.z0-.1,o.z0,c.white,flat);
 }
 if(quoins&&!lite)for(const end of [0,1])for(let z=quoinFrom,k=0;z<top-.9;z+=.56,k++){const w=k%2?.48:.86;end?S.box(f,len-w,len+.07,0,.07,z,z+.5,c.white,flat):S.box(f,-.07,w,0,.07,z,z+.5,c.white,flat);}
}
// A gateway through a block of frame f: piers either side of an arched opening (centre ac, half width hw, springing at
// zs) running through the depth o0..o1, the spandrels and the vault's underside.
function gateway(S,f,a0,a1,o0,o1,top,ac,hw,zs,col,inner,floor,segs=8){
 const zk=zs+hw;S.box(f,a0,ac-hw,o0,o1,0,top,col);S.box(f,ac+hw,a1,o0,o1,0,top,col);S.box(f,ac-hw,ac+hw,o0,o1,zk,top,col);
 for(let i=0;i<segs;i++){
  const t0=Math.PI*i/segs,t1=Math.PI*(i+1)/segs,p0=[ac+Math.cos(t0)*hw,zs+Math.sin(t0)*hw],p1=[ac+Math.cos(t1)*hw,zs+Math.sin(t1)*hw];
  for(const o of [o0,o1])S.quad(f(p0[0],o,p0[1]),f(p1[0],o,p1[1]),f(p1[0],o,zk),f(p0[0],o,zk),col,sub(f(0,o,0),f(0,(o0+o1)/2,0)));
  S.quad(f(p0[0],o0,p0[1]),f(p1[0],o0,p1[1]),f(p1[0],o1,p1[1]),f(p0[0],o1,p0[1]),inner,sub(f(ac,0,zs),f((p0[0]+p1[0])/2,0,(p0[1]+p1[1])/2)));
 }
 S.quad(f(ac-hw,o0,.02),f(ac+hw,o0,.02),f(ac+hw,o1,.02),f(ac-hw,o1,.02),floor,[0,0,1]);
}
// The floor of a building on uneven ground: just above the highest point under it; the lowest for its plinth.
function footing(L,ground,fallback,u0,u1,v0,v1,ni=4,nj=4){let hi=-Infinity,lo=Infinity;for(let i=0;i<=ni;i++)for(let j=0;j<=nj;j++){const p=L(u0+(u1-u0)*i/ni,v0+(v1-v0)*j/nj,0),g=ground?.(p[0],p[1])??fallback;hi=Math.max(hi,g);lo=Math.min(lo,g);}return {floor:hi+.15,low:lo};}

// Bus-station asphalt: worn grey, darker patches, oil where the buses stand.
const ASPHALT=(()=>{const base=lin(0x4c4c4a);return p=>{const k=.8+.34*fbm(p[0]/13,p[1]/13),oil=Math.max(0,noise(p[0]/2.6,p[1]/2.6)-.7)*1.5;return mul(base,k*(1-oil));};})();
// A paved surface over polygon pts (local u,v of frame L) laid on the ground: triangulated, each triangle split at its
// longest edge until none is longer than `edge` metres, every vertex at the ground's height (z) plus `lift`.
function drape(B,pts,L,z,col,{edge=7,lift=.1}={}){
 const P=q=>L(q[0],q[1],z(q[0],q[1])+lift);
 const put=(a,b,c,depth)=>{
  const ab=Math.hypot(a[0]-b[0],a[1]-b[1]),bc=Math.hypot(b[0]-c[0],b[1]-c[1]),ca=Math.hypot(c[0]-a[0],c[1]-a[1]),m=Math.max(ab,bc,ca);
  if(m<=edge||depth>14){B.poly([P(a),P(b),P(c)],col,[0,0,1]);return;}
  const mid=(p,q)=>[(p[0]+q[0])/2,(p[1]+q[1])/2];
  if(m===ab){const p=mid(a,b);put(a,p,c,depth+1);put(p,b,c,depth+1);}else if(m===bc){const p=mid(b,c);put(a,b,p,depth+1);put(a,p,c,depth+1);}else{const p=mid(c,a);put(a,b,p,depth+1);put(p,b,c,depth+1);}
 };
 for(const [i,j,k] of THREE.ShapeUtils.triangulateShape(pts.map(([u,v])=>new THREE.Vector2(u,v)),[]))put(pts[i],pts[j],pts[k],0);
}

// Mercado Público (1899/1931): two long yellow wings round a central passage under a white membrane roof (2016),
// gate blocks at both ends with arched passages, the two towers with their open lookouts flanking the ESE gate
// (Largo da Alfândega). Arched green doors all round between white pilasters, quoins, red tile hipped roofs.
// Local frame: u to the NW end, v to the SW side (Av. Paulo Fontes); the passage runs along u.
function mercado(m,{far:{stucco:S,tiles:T,paint:P,glass:G,steel:M},ground,mobile,rand}){
 const L0=frame(m.x,m.y,0,m.heading),W=m.w/2,D=m.d/2,{floor,low}=footing(L0,ground,m.ground,-W,W,-D,D),F=frame(m.x,m.y,floor,m.heading);
 const c={wall:weathered(lin(0xe2ae3c),floor),white:weathered(lin(0xf1eee4),floor,{amount:.1,damp:.1}),stone:lin(0x8d8b84),door:lin(0x1f4a33),glass:[.09,.1,.11]},parts={S,P,G,lite:mobile,rand},PH=8.5,GATE=10.7,WALL=6,tile=[.97,.97,.97];
 S.box(F,-W,W,-D,D,low-floor-.3,0,c.stone,{top:false});
 // Wings, gate blocks with their arched passages, towers.
 for(const s of [-1,1])S.box(F,-W,W,s*PH,s*D,0,WALL,c.wall,{top:false});
 const gate=swap(F);
 gateway(S,gate,-PH,PH,-W,-W+GATE,9.6,0,3.1,4.6,c.wall,c.white,c.stone);
 gateway(S,gate,-PH,PH,W-GATE,W,8.2,0,3.1,4.2,c.wall,c.white,c.stone);
 const tower=(v0,v1)=>{
  const u0=-W-.5,u1=u0+6,TB=12.4,TL=14.6;S.box(F,u0,u1,v0,v1,0,TB,c.wall,{top:false});
  for(const [z,t] of [[WALL,.42],[9.3,.3],[TB,.6]])S.box(F,u0-.2,u1+.2,v0-.2,v1+.2,z-t,z,c.white);
  // Open lookout: corner posts, a balustrade, the hipped roof.
  for(const [a,b] of [[u0,v0],[u0,v1-.8],[u1-.8,v0],[u1-.8,v1-.8]])S.box(F,a,a+.8,b,b+.8,TB,TL,c.white);
  S.box(F,u0,u1,v0,v1,TB,TB+.95,c.wall,{bottom:false});S.box(F,u0-.1,u1+.1,v0-.1,v1+.1,TB+.95,TB+1.05,c.white);
  S.box(F,u0-.15,u1+.15,v0-.15,v1+.15,TL,TL+.35,c.white);
  T.hipRoof(F,u0,u1,v0,v1,TL+.35,2.3,.45,aged(tile),[S,c.white]);M.post(F((u0+u1)/2,(v0+v1)/2,TL+2.6),F((u0+u1)/2,(v0+v1)/2,TL+3.9),.06,.02,4,[.1,.1,.1]);
  // A window per storey on each free face.
  for(const [a0,b0,a1,b1] of [[u0,v0,u0,v1],[u0,v0,u1,v0],[u0,v1,u1,v1]]){const f=faceFrame(F,a0,b0,a1,b1,(u0+u1)/2,(v0+v1)/2);trim(f,f.len,WALL,{bays:1,plinth:.6,cornice:false,pilasters:false,quoins:false,open:()=>({w:1.3,z0:2.2,h:1.8,arch:true})},parts,c);trim(f,f.len,TB,{bays:1,plinth:0,cornice:false,pilasters:false,quoins:true,quoinFrom:.6,open:()=>({w:1.2,z0:6.6,h:1.5,arch:true})},parts,c);trim(f,f.len,TB,{bays:1,plinth:0,cornice:false,pilasters:false,quoins:false,open:()=>({w:1.1,z0:9.8,h:1.4,arch:true})},parts,c);}
 };
 tower(-PH-6,-PH);tower(PH,PH+6);
 // Façades: long sides in 20 bays of arched doors, wing ends, the gate fronts with their white arch surrounds.
 // The shops' doors: green, each its own shade, a third of them open on a dark interior.
 const door=()=>({w:2.1,z0:0,h:3.2,arch:true,door:true,col:rand()<.32?[.035,.03,.026]:mul(c.door,.8+rand()*.4)}),segs=mobile?4:6;
 for(const s of [-1,1]){const f=faceFrame(F,-W,s*D,W,s*D);trim(f,f.len,WALL,{bays:20,open:door,segs},parts,c);}
 for(const [u,v0,v1] of [[W,PH,D],[W,-D,-PH],[-W,PH+6,D],[-W,-D,-PH-6]]){const f=faceFrame(F,u,v0,u,v1);trim(f,f.len,WALL,{bays:3,open:door,segs},parts,c);}
 for(const [u,top,zs] of [[-W,9.6,4.6],[W,8.2,4.2]]){const f=faceFrame(F,u,-PH,u,PH);S.arch(f,PH,zs,3.1,3.55,.1,c.white,segs*2);S.box(f,-.2,2*PH+.2,0,.34,top-.45,top,c.white);S.box(f,0,2*PH,0,.1,0,.6,c.stone);for(const a of [PH-3.3,PH+3.3])S.box(f,a-.25,a+.25,0,.12,.6,zs,c.white);}
 // The ESE gate's raised centre: a stepped parapet over the arch.
 S.box(F,-W,-W+1.2,-4.2,4.2,9.6,10.7,c.wall);S.box(F,-W-.15,-W+1.35,-4.4,4.4,10.7,10.95,c.white);
 // Passage: plain inner fronts with doors, the white membrane on steel arches, highest at each arch.
 if(!mobile)for(const s of [-1,1]){const f=faceFrame(F,-W+GATE,s*PH,W-GATE,s*PH,0,s*20);trim(f,f.len,WALL,{bays:14,open:door,quoins:false,segs:4},parts,c);}
 const bays=10,u0=-W+GATE,u1=W-GATE,span=(u1-u0)/bays,AC=(v)=>WALL+.4+2.6*(1-(v/PH)**2),white=lin(0xf4f3ee),NV=8,NU=4;
 for(let b=0;b<bays;b++)for(let i=0;i<NU;i++)for(let j=0;j<NV;j++){
  const ua=u0+span*(b+i/NU),ub=u0+span*(b+(i+1)/NU),va=-PH+2*PH*j/NV,vb=-PH+2*PH*(j+1)/NV,sag=t=>.55*Math.sin(Math.PI*t);
  const Z=(u,v)=>AC(v)-sag((u-u0)/span-b)*(1-(v/PH)**2);
  P.quad(F(ua,va,Z(ua,va)),F(ub,va,Z(ub,va)),F(ub,vb,Z(ub,vb)),F(ua,vb,Z(ua,vb)),mul(white,.97+.03*Math.cos(j)),[0,0,1]);
 }
 for(let b=0;b<=bays;b++){const u=u0+span*b;for(let j=0;j<NV;j++){const va=-PH+2*PH*j/NV,vb=va+2*PH/NV;M.post(F(u,va,AC(va)+.12),F(u,vb,AC(vb)+.12),.14,.14,4,lin(0xd8dadb),{top:false});}}
 // Roofs.
 for(const s of [-1,1])T.hipRoof(F,-W,W,s>0?PH:-D,s>0?D:-PH,WALL,2.7,.45,aged(mul(tile,.95+rand()*.08)),[S,c.white]);
 S.box(F,W-GATE,W,-PH,PH,8.2,8.45,c.white);S.box(F,-W,-W+GATE,-PH,PH,9.6,9.85,c.white);
}

// Casa da Alfândega (1876): a two-storey centre under a pediment on both long fronts, single-storey wings, ochre with
// white pilasters and cornices, green doors and shutters, arched upper windows, red tile roofs.
function alfandega(m,{far:{stucco:S,tiles:T,paint:P,glass:G},ground,mobile,rand}){
 const L0=frame(m.x,m.y,0,m.heading),W=m.w/2,D=m.d/2,{floor,low}=footing(L0,ground,m.ground,-W,W,-D,D),F=frame(m.x,m.y,floor,m.heading);
 const c={wall:weathered(lin(0xd99c38),floor),white:weathered(lin(0xf0ece2),floor,{amount:.1,damp:.1}),stone:lin(0x8a877f),door:lin(0x1d4a32),glass:[.08,.09,.1]},parts={S,P,G,lite:mobile,rand},CW=7.5,TOP=9.2,WING=5.6,segs=mobile?4:6;
 S.box(F,-W,W,-D,D,low-floor-.3,0,c.stone,{top:false});
 S.box(F,-CW,CW,-D,D,0,TOP,c.wall,{top:false});for(const s of [-1,1])S.box(F,s*CW,s*W,-D+.25,D-.25,0,WING,c.wall,{top:false});
 // Centre: three arched doors below, three arched windows above a string course, the pediments.
 for(const s of [-1,1]){
  const f=faceFrame(F,-CW,s*D,CW,s*D);trim(f,f.len,TOP,{bays:3,open:()=>({w:1.9,z0:0,h:3,arch:true,door:true}),segs},parts,c);
  trim(f,f.len,TOP,{bays:3,plinth:0,cornice:false,pilasters:false,quoins:false,open:()=>({w:1.5,z0:5.3,h:2.1,arch:true}),segs},parts,c);S.box(f,0,f.len,0,.16,4.45,4.75,c.white);
  const g=faceFrame(F,s*CW,-D+.25,s*W,-D+.25),h=faceFrame(F,s*CW,D-.25,s*W,D-.25),e=faceFrame(F,s*W,-D+.25,s*W,D-.25);
  for(const f2 of [g,h])trim(f2,f2.len,WING,{bays:4,open:i=>({w:1.6,z0:i%3?.7:0,h:i%3?2.4:3.1,arch:true,door:!(i%3)}),segs},parts,c);
  trim(e,e.len,WING,{bays:3,open:()=>({w:1.5,z0:.7,h:2.4,arch:true}),segs},parts,c);
 }
 const gables=T.gableRoof(swap(F),-D,D,-CW,CW,TOP,2.6,.35,aged([1,1,1]),{ends:.02,under:[S,c.white]});
 gables.forEach((tri,i)=>S.poly(tri,c.wall,sub(F(0,i?1:-1,0),F(0,0,0))));
 // The pediments' raking cornices.
 for(const s of [-1,1])for(const t of [-1,1])S.post(F(t*(CW+.2),s*(D+.12),TOP),F(0,s*(D+.12),TOP+2.75),.2,.2,4,c.white,{rot:Math.PI/4,top:false});
 for(const s of [-1,1])T.hipRoof(F,s>0?CW:-W,s>0?W:-CW,-D+.25,D-.25,WING,2.3,.4,aged([.93,.93,.93]),[S,c.white]);
}

// Catedral Metropolitana, at the top of Praça XV: cream walls and white trim, the two square front towers with
// belfries and small domes, a gable over the nave, the chancel and side chapels behind; steps down to the square.
// Local frame: u to the NNE (chancel), v to the WNW; the front faces the square at the SSW end.
function catedral(m,{far:{stucco:S,tiles:T,paint:P,glass:G,steel:M},mobile,rand}){
 // Outside the circuit's terrain grid: the far relief (40 m) shows 14-18 m here, so the floor sits on a terrace.
 const floor=m.ground+1.6,F=frame(m.x,m.y,floor,m.heading),U0=-26.8,c={wall:weathered(lin(0xf0d6a2),floor,{damp:.12}),white:weathered(lin(0xf5f2ea),floor,{amount:.08,damp:.06}),stone:lin(0xa39f94),door:lin(0x4a3322),glass:[.07,.08,.09]},parts={S,P,G,lite:mobile,rand},segs=mobile?4:6;
 const NAVE=[U0+6.2,11.9,-7,16.5],TW=6.2,TOP=15,tile=aged([.95,.95,.95]);
 S.box(F,U0,26.8,-16.5,16.5,-5,0,lin(0xb9b4a8));
 S.box(F,NAVE[0],NAVE[1],NAVE[2],NAVE[3],0,TOP,c.wall,{top:false});
 S.box(F,11.9,26.8,-9.1,9.4,0,12.5,c.wall,{top:false});S.box(F,-12.6,.6,-12.1,-7,0,8,c.wall,{top:false});S.box(F,.6,9.9,-16.5,-7,0,9.5,c.wall,{top:false});
 // Front between the towers, set back; pediment over it.
 S.box(F,U0+.6,NAVE[0],NAVE[2]+TW,NAVE[3]-TW,0,TOP,c.wall,{top:false});
 const front=faceFrame(F,U0+.6,NAVE[2]+TW,U0+.6,NAVE[3]-TW,0,4.75);
 trim(front,front.len,TOP,{bays:3,quoins:false,open:i=>i===1?{w:2.6,z0:0,h:4.6,arch:true,door:true}:{w:1.9,z0:0,h:3.6,arch:true,door:true},segs},parts,c);
 trim(front,front.len,TOP,{bays:3,plinth:0,cornice:false,pilasters:false,quoins:false,open:i=>({w:i===1?2:1.5,z0:8.4,h:i===1?3.2:2.6,arch:true}),segs},parts,c);
 const gables=T.gableRoof(F,U0+.6,NAVE[1],NAVE[2],NAVE[3],TOP,6,.5,tile,{ends:.3,under:[S,c.white]});
 gables.forEach((tri,i)=>S.poly(tri,c.wall,sub(F(i?1:-1,0,0),F(0,0,0))));
 for(const t of [-1,1])S.post(F(U0+.4,t>0?NAVE[3]:NAVE[2],TOP),F(U0+.4,4.75,TOP+6),.22,.22,4,c.white,{rot:Math.PI/4,top:false});
 // Long sides: tall arched windows between pilasters.
 for(const v of [NAVE[3]]){const f=faceFrame(F,NAVE[0],v,NAVE[1],v,0,4.75);trim(f,f.len,TOP,{bays:6,open:()=>({w:1.8,z0:4.5,h:5,arch:true}),segs},parts,c);}
 T.hipRoof(F,11.9,26.8,-9.1,9.4,12.5,4,.4,tile,[S,c.white]);T.hipRoof(F,-12.6,.6,-12.1,-7,8,2,.35,tile,[S,c.white]);T.hipRoof(F,.6,9.9,-16.5,-7,9.5,2.6,.35,tile,[S,c.white]);
 // Towers: shaft, belfry with arched openings, an octagonal drum, the dome and a cross; clocks on the front.
 for(const [v0,v1] of [[NAVE[2],NAVE[2]+TW],[NAVE[3]-TW,NAVE[3]]]){
  const u0=U0,u1=U0+TW,uc=(u0+u1)/2,vc=(v0+v1)/2;
  S.box(F,u0,u1,v0,v1,0,25,c.wall,{top:false});
  for(const [z,t] of [[TOP,.6],[25,.7]])S.box(F,u0-.25,u1+.25,v0-.25,v1+.25,z-t,z,c.white);
  for(const [a0,b0,a1,b1] of [[u0,v0,u0,v1],[u0,v0,u1,v0],[u0,v1,u1,v1],[u1,v0,u1,v1]]){
   const f=faceFrame(F,a0,b0,a1,b1,uc,vc);trim(f,f.len,TOP,{bays:1,cornice:false,pilasters:false,open:()=>({w:1.3,z0:7,h:2.8,arch:true}),segs},parts,c);
   trim(f,f.len,25,{bays:1,plinth:0,cornice:false,pilasters:false,quoins:true,open:()=>a0===u0&&b0!==b1?null:({w:1.1,z0:18.6,h:1.8,arch:true}),segs},parts,c);
  }
  // The clock: a dark rim, a white face, two hands.
  const front=faceFrame(F,u0,v0,u0,v1,uc,vc),disc=(r,o)=>Array.from({length:16},(_,i)=>front(TW/2+Math.cos(i/16*2*Math.PI)*r,o,20.4+Math.sin(i/16*2*Math.PI)*r));
  P.poly(disc(1.3,.08),[.04,.04,.04],outOf(front));P.poly(disc(1.12,.11),lin(0xf3f1ea),outOf(front));
  P.box(front,TW/2-.05,TW/2+.05,.11,.15,20.4,21.25,[.03,.03,.03]);P.box(front,TW/2-.05,TW/2+.6,.11,.15,20.35,20.45,[.03,.03,.03]);
  // Belfry: a slightly narrower stage with a big arched opening on each face (dark), corner pilasters.
  const bu0=u0+.5,bu1=u1-.5,bv0=v0+.5,bv1=v1-.5;S.box(F,bu0,bu1,bv0,bv1,25,30.5,c.wall,{top:false});S.box(F,bu0-.2,bu1+.2,bv0-.2,bv1+.2,30.1,30.6,c.white);
  for(const [a0,b0,a1,b1] of [[bu0,bv0,bu0,bv1],[bu0,bv0,bu1,bv0],[bu0,bv1,bu1,bv1],[bu1,bv0,bu1,bv1]]){const f=faceFrame(F,a0,b0,a1,b1,uc,vc);trim(f,f.len,30.5,{bays:1,plinth:0,cornice:false,pilasters:false,quoins:true,open:()=>({w:2.2,z0:25.9,h:2.4,arch:true}),segs},parts,{...c,glass:[.025,.025,.03]});}
  S.post(F(uc,vc,30.6),F(uc,vc,32.2),2.3,2.2,8,c.wall,{rot:Math.PI/8,top:false});S.post(F(uc,vc,32.2),F(uc,vc,32.5),2.45,2.45,8,c.white,{rot:Math.PI/8});
  // Dome in a few rings, a lantern and the cross.
  let pr=2.2,pz=32.5;for(let k=1;k<=5;k++){const t=k/5,r=2.2*Math.cos(t*Math.PI/2)**.8+.35*t,z=32.5+3.1*Math.sin(t*Math.PI/2);P.post(F(uc,vc,pz),F(uc,vc,z),pr,r,8,lin(0x7d8b86,.9+k*.04),{rot:Math.PI/8,top:k===5});pr=r;pz=z;}
  S.post(F(uc,vc,pz),F(uc,vc,pz+1.3),.45,.4,8,c.white,{rot:Math.PI/8});
  M.box(F,uc-.08,uc+.08,vc-.08,vc+.08,pz+1.3,pz+3.4,[.15,.13,.1]);M.box(F,uc-.08,uc+.08,vc-.65,vc+.65,pz+2.55,pz+2.7,[.15,.13,.1]);
 }
 // Steps down to the square (2 m) across the whole front.
 for(let k=0;k<8;k++)S.box(F,U0-6+k*.75,U0,NAVE[2]-1,NAVE[3]+1,-5,-1.6+k*.2,c.stone,{bottom:false});
}

// Forte de Santana (1761) on the island shore under the Hercílio Luz's island viaduct: a low white bastion wall on
// the real outline, built down to the rocks on the sea side with merlons and embrasures, a white single-storey house
// with a hipped tile roof inside, a few cannons. All of it far below the deck (25-28 m above the sea).
function forte(m,{near:{stucco:S,tiles:T,paint:P,glass:G,steel:M},ground,mobile,rand}){
 const pts=m.outline.slice(0,-1),n=pts.length,gz=(x,y)=>ground?.(x,y)??m.ground;
 let area=0;for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n];area+=a[0]*b[1]-b[0]*a[1];}const ccw=area>0;
 // Inner line of the wall (1.1 m thick): each corner moved in along its bisector.
 const inner=pts.map((p,i)=>{const a=pts[(i+n-1)%n],b=pts[(i+1)%n],e1=unit([p[0]-a[0],p[1]-a[1],0]),e2=unit([b[0]-p[0],b[1]-p[1],0]),s=ccw?1:-1,n1=[-e1[1]*s,e1[0]*s],n2=[-e2[1]*s,e2[0]*s],bx=n1[0]+n2[0],by=n1[1]+n2[1],k=Math.min(2.5,1.1/Math.max(.3,(bx*n1[0]+by*n1[1])/Math.hypot(bx,by)||1))/(Math.hypot(bx,by)||1);return [p[0]+bx*k,p[1]+by*k];});
 // Parade ground level: the ground near the middle of the fort.
 const cx=pts.reduce((s,p)=>s+p[0],0)/n,cy=pts.reduce((s,p)=>s+p[1],0)/n,yard=gz(cx,cy)+.2;
 const lime=lin(0xeeece4),stain=lin(0x9c9a90),wall=p=>{const t=Math.max(0,Math.min(1,(p[2]-yard+2.5)/3));return [stain[0]+(lime[0]-stain[0])*t,stain[1]+(lime[1]-stain[1])*t,stain[2]+(lime[2]-stain[2])*t];};
 let merlons=0;
 for(let i=0;i<n;i++){
  const j=(i+1)%n,a=pts[i],b=pts[j],ia=inner[i],ib=inner[j],ga=gz(a[0],a[1]),gb=gz(b[0],b[1]),out=[(b[1]-a[1])*(ccw?1:-1),-(b[0]-a[0])*(ccw?1:-1),0];
  const top=Math.max(yard+1.15,Math.max(ga,gb)+.9),base=Math.min(ga,gb,yard)-1.2,len=Math.hypot(b[0]-a[0],b[1]-a[1]);
  S.quad([a[0],a[1],base],[b[0],b[1],base],[b[0],b[1],top],[a[0],a[1],top],wall,out);
  S.quad([ia[0],ia[1],yard-.6],[ib[0],ib[1],yard-.6],[ib[0],ib[1],top],[ia[0],ia[1],top],lime,mul(out,-1));
  S.quad([a[0],a[1],top],[b[0],b[1],top],[ib[0],ib[1],top],[ia[0],ia[1],top],lime,[0,0,1]);
  // Seaward stretches (the wall stands tall over the rocks): merlons along the top, a cannon in some gaps.
  if(top-Math.min(ga,gb)>2.2){
   const count=Math.max(1,Math.round(len/4.2)),gap=.9/len;
   for(let k=0;k<count;k++){
    const t0=k/count+(k?gap/2:0),t1=(k+1)/count-(k<count-1?gap/2:0),P0=[a[0]+(b[0]-a[0])*t0,a[1]+(b[1]-a[1])*t0],P1=[a[0]+(b[0]-a[0])*t1,a[1]+(b[1]-a[1])*t1],I0=[ia[0]+(ib[0]-ia[0])*t0,ia[1]+(ib[1]-ia[1])*t0],I1=[ia[0]+(ib[0]-ia[0])*t1,ia[1]+(ib[1]-ia[1])*t1];
    const f=(s,o,z)=>{const ox=P0[0]+(P1[0]-P0[0])*s,oy=P0[1]+(P1[1]-P0[1])*s,ix=I0[0]+(I1[0]-I0[0])*s,iy=I0[1]+(I1[1]-I0[1])*s;return [ox+(ix-ox)*o,oy+(iy-oy)*o,top+z];};
    S.box(f,0,1,0,1,0,.85,lime,{bottom:false});merlons++;
    if(!mobile&&k%2===1){const g0=[(P0[0]+I0[0])/2,(P0[1]+I0[1])/2],e=unit([b[0]-a[0],b[1]-a[1],0]),gap=[g0[0]-e[0]*.45,g0[1]-e[1]*.45],o=unit(out);M.post([gap[0]-o[0]*1.2,gap[1]-o[1]*1.2,top+.32],[gap[0]+o[0]*.9,gap[1]+o[1]*.9,top+.42],.2,.13,8,[.03,.03,.03]);}
   }
  }
 }
 // The parade ground (stone and grass), the house and the powder magazine.
 S.poly(inner.map(([x,y])=>[x,y,yard-.05]),lin(0x8f8a78),[0,0,1]);
 const L=frame(m.x,m.y,yard,m.heading),c={wall:weathered(lime,yard,{damp:.25}),white:lin(0xf6f4ee),stone:lin(0x77756c),door:lin(0x3b6b4a),glass:[.06,.07,.08]},parts={S,P,G,lite:mobile,rand};
 S.box(L,-5,3,-8,7,-.6,3.6,c.wall,{top:false});
 for(const [a0,b0,a1,b1] of [[-5,-8,-5,7],[3,-8,3,7],[-5,-8,3,-8],[-5,7,3,7]]){const f=faceFrame(L,a0,b0,a1,b1,-1,-.5);trim(f,f.len,3.6,{bays:Math.max(2,Math.round(f.len/3)),pilasters:false,open:i=>({w:1.1,z0:i%2?.9:0,h:i%2?1.5:2.4,door:!(i%2)}),segs:4},parts,c);}
 T.hipRoof(L,-5,3,-8,7,3.6,2.4,.5,aged([.95,.95,.95]),[S,c.white]);
 S.box(L,6,10,1,5,-.6,2.6,c.wall,{top:false});T.hipRoof(L,6,10,1,5,2.6,1.4,.3,[.9,.9,.9],[S,c.white]);
 return {merlons};
}

// The aerials on the Morro da Cruz (285 m, 3 km east): lattice towers of 20-60 m along the ridge, some banded orange
// and white for the planes, some bare galvanised steel, with panel antennas, a dish or two and red lights. From the
// circuit they are silhouettes on the skyline: solid tapering sections in the lattice's average tone, no alpha.
// Their feet go on the drawn hill (the far relief, read in createFloripaLandmarks), not on the towers' own z in the
// track file: that one comes from outside the city's terrain model (80-138 m where the hill stands at 216-277 m).
function mastsGeometry(m,rand,mobile){
 const B=new Batch(),lights=[],ranges=[],orange=lin(0xd8541e),white=lin(0xe9e7e0),galv=lin(0xaab1b5);
 const heights=[58,49,42,37,33,30,28,26,24,22,21,20,35,27,23];
 for(let i=heights.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[heights[i],heights[j]]=[heights[j],heights[i]];}
 m.towers.forEach((t,i)=>{
  const start=B.vertices,x=t[0],y=t[1],zb=(m.ele??285)-5-3,h=heights[i%heights.length]*(.92+rand()*.16),banded=rand()<(h>30?.65:.35),sides=rand()<.55?3:4;
  // A little wider than the steel (a lattice's outline), so the masts still draw a line at 3 km.
  const b=Math.max(1.6,h*.07),top=Math.max(.7,b*.34),rad=w=>w/(sides===3?Math.sqrt(3):Math.SQRT2),rot=rand()*Math.PI,bands=banded?7:3,col0=mul(galv,.9+rand()*.2);
  for(let k=0;k<bands;k++){const z0=k*h/bands,z1=(k+1)*h/bands,w0=b+(top-b)*z0/h,w1=b+(top-b)*z1/h;B.post([x,y,zb+z0],[x,y,zb+z1],rad(w0)*(k?1:1.04),rad(w1),sides,banded?(k%2?white:orange):mul(col0,1-.05*k),{rot,top:k===bands-1});}
  // Platforms where the antennas are, panel antennas round the top, a whip, sometimes dishes.
  const levels=h>30?2:1;for(let l=0;l<levels;l++){const z=zb+h*(l?.72:.97),w=b+(top-b)*(z-zb)/h+.7;B.post([x,y,z-.25],[x,y,z],rad(w),rad(w),sides,mul(galv,.8),{rot});}
  const panels=mobile?2:3+Math.floor(rand()*3);for(let p=0;p<panels;p++){const a=rot+p/panels*2*Math.PI,r=rad(top)+.35,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r,z=zb+h*(.9+rand()*.08);B.post([px,py,z-1.3],[px,py,z+1.2],.28,.28,4,white,{rot:a+Math.PI/4});}
  if(rand()<.6)B.post([x,y,zb+h],[x,y,zb+h+3+rand()*6],.12,.05,4,galv);
  const dishes=mobile?0:Math.floor(rand()*3);for(let d=0;d<dishes;d++){const a=rand()*6.3,z=zb+h*(.45+rand()*.4),w=b+(top-b)*(z-zb)/h,r=rad(w)+.5,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r,s=.6+rand()*.7;B.post([px,py,z],[px+Math.cos(a)*.5,py+Math.sin(a)*.5,z],s,s*.9,10,white,{bottom:true});}
  lights.push([x,y,zb+h+.4,rand()*2,1.1+rand()*.8]);if(h>40)lights.push([x,y,zb+h*.5,rand()*2,1.1+rand()*.8]);
  ranges.push({start,end:B.vertices,x,y,zb,lights:h>40?2:1});
 });
 return {batch:B,lights,ranges};
}
// The far relief's height (far-terrain.js ring 'medio') at (x,y), bilinear; null outside it.
function reliefSampler(spec,buffer){
 const raw=new Uint16Array(buffer),{nx,ny,step,x0,y0,offset,unit}=spec,y1=y0+(ny-1)*step,h=(i,j)=>offset+raw[j*nx+i]*unit;
 return (x,y)=>{const fi=(x-x0)/step,fj=(y1-y)/step,i=Math.floor(fi),j=Math.floor(fj);if(i<0||j<0||i>=nx-1||j>=ny-1)return null;const u=fi-i,v=fj-j;return h(i,j)*(1-u)*(1-v)+h(i+1,j)*u*(1-v)+h(i,j+1)*(1-u)*v+h(i+1,j+1)*u*v;};
}

export function createFloripaLandmarks(data,{ground,mobile=false}={}){
 const root=new THREE.Group();root.name='Marcos_Floripa';
 const marks=data.scenery.landmarks??[],rand=random(7311),proxies=[],stats={landmarks:marks.length};
 const textures={concrete:concreteTexture(),stucco:stuccoTexture(),tiles:tileTexture(),glass:glassTexture(),roof:slatTexture()},sign=signTexture('RODOVIÁRIA RITA MARIA');
 const materials={
  concrete:new THREE.MeshStandardMaterial({name:'Marcos_concreto',map:textures.concrete,vertexColors:true,roughness:.92,metalness:0}),
  stucco:new THREE.MeshStandardMaterial({name:'Marcos_reboco',map:textures.stucco,vertexColors:true,roughness:.88,metalness:0}),
  tiles:new THREE.MeshStandardMaterial({name:'Marcos_telhas',map:textures.tiles,vertexColors:true,roughness:.82,metalness:0}),
  glass:new THREE.MeshStandardMaterial({name:'Marcos_vidro',map:textures.glass,vertexColors:true,roughness:.1,metalness:.25}),
  paint:new THREE.MeshStandardMaterial({name:'Marcos_pintura',vertexColors:true,roughness:.55,metalness:.05}),
  steel:new THREE.MeshStandardMaterial({name:'Marcos_aco',vertexColors:true,roughness:.42,metalness:.6}),
  roof:new THREE.MeshStandardMaterial({name:'Marcos_cobertura_metalica',map:textures.roof,vertexColors:true,roughness:.5,metalness:.15}),
  foliage:new THREE.MeshStandardMaterial({name:'Marcos_palmeiras',vertexColors:true,roughness:.8,metalness:0,side:THREE.DoubleSide}),
  sign:new THREE.MeshStandardMaterial({name:'Marcos_letreiro',map:sign.map,alphaTest:.5,roughness:.5,metalness:.1})
 };
 const SIZES={concrete:8,stucco:4,tiles:2,glass:2.8,roof:2,sign:1};
 const CELLS={stucco:mobile?5:3,concrete:mobile?16:8};
 const set=()=>Object.fromEntries(Object.keys(materials).map(k=>[k,new Batch(SIZES[k]??0,CELLS[k]??0)]));
 // Near the track (the Rodoviária by the boxes, the TICEN, the fort under the bridge) cast shadows; the old centre
 // and the masts do not (they stand well outside the shadow map's reach).
 const near=set(),far=set(),ctx={near,far,ground,mobile,rand,sign,proxies,palm};
 const builders={rodoviaria,ticen,mercado_publico:mercado,alfandega,catedral,forte_santana:forte};
 for(const m of marks){const build=builders[m.kind];if(build&&m.outline)stats[m.kind]=build(m,ctx)??true;}
 let drawCalls=0,vertices=0;
 for(const [group,batches,shadow] of [['perto',near,true],['longe',far,false]])for(const [k,b] of Object.entries(batches)){if(!b.vertices)continue;root.add(b.mesh(`Marcos_${group}_${k}`,materials[k],shadow));drawCalls++;vertices+=b.vertices;}
 // Masts and their warning lights: placed on the far relief once it is read (the same file far-terrain.js draws).
 const cruz=marks.find(m=>m.kind==='morro_da_cruz');let lightPoints=null,lightData=[];
 if(cruz?.towers?.length){
  const {batch,lights,ranges}=mastsGeometry(cruz,random(911),mobile),mesh=batch.mesh('Marcos_mastros',materials.paint,false);root.add(mesh);drawCalls++;vertices+=batch.vertices;
  lightData=lights;const lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.Float32BufferAttribute(lights.flatMap(([x,y,z])=>[x,z,-y]),3));lg.setAttribute('color',new THREE.Float32BufferAttribute(lights.flatMap(()=>[1,.1,.05]),3));
  lightPoints=new THREE.Points(lg,new THREE.PointsMaterial({name:'Marcos_luzes_mastros',size:mobile?2.5:3,sizeAttenuation:false,vertexColors:true,toneMapped:false}));lightPoints.name='Marcos_luzes_mastros';root.add(lightPoints);drawCalls++;
  stats.masts=ranges.length;
  const spec=data.scenery.far?.medio;
  if(spec)fetch(new URL(`./assets/circuitos/${spec.relief}`,import.meta.url)).then(r=>{if(!r.ok)throw new Error(spec.relief);return r.arrayBuffer();}).then(buffer=>{
   const relief=reliefSampler(spec,buffer),pos=mesh.geometry.attributes.position,lp=lg.attributes.position;let light=0;
   for(const t of ranges){
    const z=relief(t.x,t.y),dz=z==null?0:z-2.5-t.zb;for(let k=t.start;k<t.end;k++)pos.setY(k,pos.getY(k)+dz);
    for(let k=0;k<t.lights;k++,light++){lightData[light][2]+=dz;lp.setY(light,lp.getY(light)+dz);}
   }
   pos.needsUpdate=lp.needsUpdate=true;mesh.geometry.computeBoundingSphere();lg.computeBoundingSphere();stats.mastsOnRelief=true;
  }).catch(e=>console.warn('Mastros do Morro da Cruz sem relevo:',e.message));
 }
 Object.assign(stats,{drawCalls,vertices});
 let clock=0;
 function update(dt){
  if(!lightPoints||!dt)return;clock+=dt;const col=lightPoints.geometry.attributes.color;
  // Obstruction lights: slow blinks, each mast its own rhythm.
  lightData.forEach(([, , ,phase,period],i)=>{const on=((clock+phase)%period)<period*.45,k=on?1:.08;col.setXYZ(i,k,k*.1,k*.05);});col.needsUpdate=true;
 }
 // Where the land cover's trees must go (main.js clears them): the buildings, the Rodoviária's bus apron and the
 // TICEN's paved site, as circles over each footprint's rectangle and a margin round it.
 const clearings=[];
 for(const m of marks){const margin={rodoviaria:34,ticen:6,mercado_publico:4,alfandega:4,catedral:6,forte_santana:3}[m.kind];if(margin===undefined||!m.w)continue;
  const c=Math.cos(m.heading),s=Math.sin(m.heading),hw=m.w/2+margin,hd=m.d/2+margin,step=10;
  for(let u=-hw;u<=hw+1e-6;u+=step)for(let v=-hd;v<=hd+1e-6;v+=step)clearings.push({x:m.x+c*u-s*v,y:m.y+s*u+c*v,r:step*.75});}
 return {root,obstacles:proxies,update,stats,clearings};
}
