import * as THREE from 'three';
import {canvasTexture} from './pit-textures.js';
import {sceneryBands} from './track-clearance.js';
import {billboardSpots} from './track-surface.js';
import {marshalSpots,towerSpots} from './trackside.js';
import {flagSpots} from './trackside-flags.js';
import {SPONSORS,BOARD_LINES} from './sponsors.js';
import {TestCar} from './physics.js';

// The street furniture of a real city closed for a race (Floripa, data.scenery.city, gerar_cidade_floripa.py): what makes
// Florianópolis' centre and the Estreito read as a Brazilian city from the car and from above. Concrete utility poles
// (double-T and round) with the whole "fiação": primary conductors on crossarms or the compact spacer cable, the
// secondary below, black telecom cables with spare coils and boxes, service drops to the facades, transformers, and an LED
// arm over the street (the data's poles on the side streets, and lines of our own on the lap's sidewalks behind the
// walls, their lamps over the race track and a soft pool of light under each after dark); traffic lights at the real junctions blinking amber for the event (each junction its own beat),
// arms reaching over the lap where the real street has lights; bus shelters with joke posters, blue street-name plates
// with the real names, and the small things of a sidewalk (orange bins, hydrants, bollards, parking signs, bike racks,
// kiosks, the orelhão, benches in the squares). Everything shares one material (vertex colour, two canvas atlases, a
// per-vertex `look`: metal, glow, blink, and the cables' camera-facing ribbons), merged by 400 m tiles (the small things
// apart in the same tiles, shown near the camera only), so the city costs a handful of draws wherever the camera is.

const CHUNK=400,FAR_BIG=560,FAR_SMALL=175,FAR_LEAN=[420,110];
function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
// Linear colours (vertex colours are linear): an sRGB hex scaled by k.
const lin=(hex,k=1)=>{const c=new THREE.Color(hex);return [c.r*k,c.g*k,c.b*k];};
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],scale=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};
const lerp3=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const pick=(R,list)=>list[Math.floor(R()*list.length)%list.length];
// look = [metal, glow, blink phase (0 steady), blink rate]; a cable's is [radius/3 cm, side, 0, 1].
const PLAIN=[0,0,0,0],METAL=m=>[m,0,0,0];

// --- The atlases: 1024 px canvases (pit-textures.js canvasTexture). The main one holds the concrete of the poles, the
// posters, the signs and a white square for everything plain; the second one the street names (u + 1 in the geometry).
const ATLAS=1024,WHITE=[.875,.125];
const rect=(x,y,w,h,flip=false,du=0)=>{const l=x/ATLAS+du,r=(x+w)/ATLAS+du,t=1-y/ATLAS,b=1-(y+h)/ATLAS;return flip?[[r,b],[l,b],[l,t],[r,t]]:[[l,b],[r,b],[r,t],[l,t]];};
const REG={strip:k=>[k*48,0,48,1024],poster:k=>[288+(k%5)*128,Math.floor(k/5)*192,128,192],bus:[288,384,128,128],noParking:[416,384,128,128],
 loading:[544,384,128,64],hours:[544,448,128,64],pedStop:[672,384,64,64],pedWalk:[736,384,64,64],perforated:[800,384,128,128],
 banca:k=>[288+(k%2)*368,512+Math.floor(k/2)*64,368,64],magazines:k=>[288+k*368,640,368,128],wood:[288,768,256,64],shutter:[288,832,256,64]};
const POSTERS=['derretenaponte','abrefacil','tasvolo','ventosul','tainhavoadora','tiradomar','autopobre','tia','retifica','pegaprimeira'];
// Joke names only (no owner plus trade that could exist): the kiosks of a city that reads its gossip.
const BANCAS=['BANCA LEU, PAGOU!','JORNAL DE ONTEM','FOFOCA FRESCA','REVISTA DO TEMPO DO OPALA'];
const BOLD=s=>`900 ${s}px "Arial Black","Arial Bold",Arial,sans-serif`,SANS=s=>`bold ${s}px Arial,Helvetica,sans-serif`;
// Words wrapped into lines and shrunk until they fit maxW × maxH, centred on cx, from top.
function fit(ctx,text,cx,top,maxW,maxH,color,font,start){
 const words=String(text).split(/\s+/);
 for(let size=start;size>=6;size--){
  ctx.font=font(size);const lines=[];let cur='';
  for(const w of words){const t=cur?cur+' '+w:w;if(!cur||ctx.measureText(t).width<=maxW)cur=t;else{lines.push(cur);cur=w;}}
  if(cur)lines.push(cur);const lh=size*1.06;
  if(lines.length*lh<=maxH&&lines.every(l=>ctx.measureText(l).width<=maxW)||size===6){
   ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='top';lines.forEach((l,i)=>ctx.fillText(l,cx,top+(maxH-lines.length*lh)/2+i*lh,maxW));return size;}
 }
}
function blot(ctx,x,y,r,color){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
// A 48 × 1024 strip of a pole's concrete, top of the pole at the top: rain streaks, moss, the grime splashed at its foot,
// the odd tag sprayed at hand height; the web of a double-T pole shows its row of holes.
function concrete(ctx,x,y,w,h,R,k,web){
 ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
 ctx.fillStyle=['#b3b0a8','#a9a8a2','#b9b4a9'][k];ctx.fillRect(x,y,w,h);
 for(let i=0;i<1800;i++){ctx.globalAlpha=.05+R()*.12;ctx.fillStyle=R()<.5?'#6f6c66':'#d6d3cb';const s=.6+R()*1.8;ctx.fillRect(x+R()*w,y+R()*h,s,s);}
 for(let i=0;i<7+k*3;i++){const sx=x+R()*w,len=80+R()*440,sy=y+R()*120;ctx.globalAlpha=.05+R()*.1;ctx.fillStyle='#4d4a44';ctx.fillRect(sx,sy,1+R()*2.5,len);}
 ctx.globalAlpha=1;for(let i=0;i<9;i++)blot(ctx,x+R()*w,y+R()*h,8+R()*30,R()<.4?'rgba(70,90,50,.16)':'rgba(80,66,50,.15)');
 const g=ctx.createLinearGradient(0,y+h-120,0,y+h);g.addColorStop(0,'rgba(60,50,40,0)');g.addColorStop(1,'rgba(55,45,35,.62)');ctx.fillStyle=g;ctx.fillRect(x,y+h-120,w,120);
 for(let i=0;i<70;i++){ctx.globalAlpha=.1+R()*.25;ctx.fillStyle='#3d332a';ctx.fillRect(x+R()*w,y+h-R()*R()*110,1+R()*2,1+R()*3);}
 if(web){
  ctx.globalAlpha=1;ctx.fillStyle='rgba(0,0,0,.08)';ctx.fillRect(x,y,w,h);
  for(let py=y+10;py<y+h-90;py+=py<y+350?19:46){ctx.fillStyle='#2e2b27';ctx.beginPath();ctx.ellipse(x+w/2,py,3,2.3,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(230,226,216,.3)';ctx.fillRect(x+w/2-3,py+2.4,6,1);}
 }
 // A tag sprayed where a hand reaches (1.3-2 m up), on one strip of each kind.
 if(k===1){ctx.globalAlpha=.75;ctx.strokeStyle=web?'#1d2a6b':'#141414';ctx.lineWidth=2.2;ctx.beginPath();const ty=y+h-165;for(let i=0;i<7;i++){const px=x+6+i*5.5;ctx.moveTo(px,ty+R()*24);ctx.quadraticCurveTo(px+3,ty-14+R()*10,px+5,ty+18+R()*14);}ctx.stroke();}
 ctx.restore();ctx.globalAlpha=1;
}
function poster(ctx,[x,y,w,h],sp,line,R){
 ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
 ctx.fillStyle=sp.bg;ctx.fillRect(x,y,w,h);
 ctx.globalAlpha=.85;ctx.fillStyle=sp.accent;ctx.beginPath();ctx.arc(x+w*(.25+R()*.5),y+h*(.55+R()*.12),w*(.34+R()*.12),0,Math.PI*2);ctx.fill();
 ctx.globalAlpha=.5;ctx.fillRect(x,y,w,7);ctx.globalAlpha=1;
 fit(ctx,sp.words,x+w/2,y+12,w-14,h*.44,sp.fg,BOLD,30);
 fit(ctx,sp.tag,x+w/2,y+h*.6,w-18,h*.17,sp.fg,SANS,15);
 ctx.fillStyle=sp.fg;ctx.fillRect(x,y+h-30,w,30);fit(ctx,line,x+w/2,y+h-28,w-10,26,sp.bg,BOLD,11);
 ctx.restore();
}
function paintAtlas(ctx,w,h){
 const R=random(5101);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);
 for(let k=0;k<3;k++){concrete(ctx,...REG.strip(k),R,k,false);concrete(ctx,...REG.strip(3+k),R,k,true);}
 POSTERS.forEach((id,k)=>poster(ctx,REG.poster(k),SPONSORS[id],BOARD_LINES[(k*3)%BOARD_LINES.length],R));
 // The bus stop sign: a blue plate, the bus drawn in white, PONTO DE ÔNIBUS.
 {const [x,y,s]=REG.bus;ctx.fillStyle='#1d4f9c';ctx.fillRect(x,y,s,s);ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.strokeRect(x+4,y+4,s-8,s-8);
  ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(x+28,y+16,72,56,9);ctx.fill();ctx.fillStyle='#1d4f9c';ctx.fillRect(x+34,y+24,60,22);ctx.fillRect(x+34,y+52,14,8);ctx.fillRect(x+80,y+52,14,8);
  ctx.fillStyle='#fff';ctx.fillRect(x+32,y+72,14,9);ctx.fillRect(x+82,y+72,14,9);fit(ctx,'PONTO DE ÔNIBUS',x+s/2,y+86,s-16,36,'#fff',BOLD,17);}
 // R-6a, no parking: white disc, red ring and bar over the black E.
 {const [x,y,s]=REG.noParking,c=s/2;ctx.fillStyle='#b9bcbe';ctx.fillRect(x,y,s,s);ctx.fillStyle='#f4f4f0';ctx.beginPath();ctx.arc(x+c,y+c,c-1,0,7);ctx.fill();ctx.strokeStyle='#c8141e';ctx.lineWidth=15;ctx.beginPath();ctx.arc(x+c,y+c,c-9,0,7);ctx.stroke();
  ctx.fillStyle='#111';ctx.font=BOLD(70);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('E',x+c,y+c+3);ctx.strokeStyle='#c8141e';ctx.lineWidth=13;ctx.beginPath();ctx.moveTo(x+c-38,y+c-38);ctx.lineTo(x+c+38,y+c+38);ctx.stroke();}
 for(const [r,text] of [[REG.loading,'EXCETO CARGA E DESCARGA'],[REG.hours,'SEG A SÁB 8h ÀS 18h']]){const [x,y,w2,h2]=r;ctx.fillStyle='#f4f4f0';ctx.fillRect(x,y,w2,h2);ctx.strokeStyle='#111';ctx.lineWidth=3;ctx.strokeRect(x+3,y+3,w2-6,h2-6);fit(ctx,text,x+w2/2,y+8,w2-18,h2-16,'#111',SANS,20);}
 // Pedestrian lenses, dark: the red hand and the walking man.
 for(const [r,walk] of [[REG.pedStop,false],[REG.pedWalk,true]]){const [x,y,s]=r;ctx.fillStyle='#0b0b0b';ctx.fillRect(x,y,s,s);ctx.fillStyle=walk?'#9cffd8':'#ffb08a';
  if(walk){ctx.beginPath();ctx.arc(x+32,y+12,6,0,7);ctx.fill();ctx.lineWidth=7;ctx.strokeStyle=ctx.fillStyle;ctx.beginPath();ctx.moveTo(x+31,y+20);ctx.lineTo(x+28,y+38);ctx.lineTo(x+18,y+56);ctx.moveTo(x+28,y+38);ctx.lineTo(x+40,y+56);ctx.moveTo(x+31,y+24);ctx.lineTo(x+43,y+34);ctx.moveTo(x+31,y+24);ctx.lineTo(x+20,y+32);ctx.stroke();}
  else{ctx.beginPath();ctx.roundRect(x+20,y+22,26,30,6);ctx.fill();for(let f=0;f<4;f++)ctx.fillRect(x+20+f*6.6,y+8,5,18);ctx.fillRect(x+12,y+30,10,6);}}
 {const [x,y,s]=REG.perforated;ctx.fillStyle='#8e959a';ctx.fillRect(x,y,s,s);ctx.fillStyle='#2b2f33';for(let i=0;i<42;i++)for(let j=0;j<42;j++){ctx.beginPath();ctx.arc(x+1.5+i*3.05,y+1.5+j*3.05,1,0,7);ctx.fill();}}
 BANCAS.forEach((name,k)=>{const [x,y,w2,h2]=REG.banca(k);ctx.fillStyle=['#f2c318','#ffffff','#e9462c','#1d6fb8'][k];ctx.fillRect(x,y,w2,h2);fit(ctx,name,x+w2/2,y+6,w2-16,h2-12,k===1?'#1a3d7c':k===0?'#1a1a1a':'#ffffff',BOLD,30);});
 // The kiosk's front opened up: magazines, newspapers and toys hung in rows.
 for(let k=0;k<2;k++){const [x,y,w2,h2]=REG.magazines(k);ctx.fillStyle='#2a2522';ctx.fillRect(x,y,w2,h2);
  for(let r=0;r<4;r++)for(let c=0;c<13;c++){const cx=x+3+c*28,cy=y+3+r*31;ctx.fillStyle=`hsl(${Math.floor(R()*360)},${50+R()*40}%,${35+R()*35}%)`;ctx.fillRect(cx,cy,25,28);ctx.fillStyle='rgba(255,255,255,.75)';ctx.fillRect(cx+2,cy+3,21,4);ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(cx+3,cy+12+R()*8,12+R()*8,3);}}
 {const [x,y,w2,h2]=REG.wood;ctx.fillStyle='#8a5a33';ctx.fillRect(x,y,w2,h2);for(let i=0;i<90;i++){ctx.globalAlpha=.08+R()*.15;ctx.fillStyle=R()<.5?'#4a2c15':'#c08a5a';ctx.fillRect(x,y+R()*h2,w2,.6+R()*1.4);}ctx.globalAlpha=1;}
 {const [x,y,w2,h2]=REG.shutter;ctx.fillStyle='#9aa3a8';ctx.fillRect(x,y,w2,h2);for(let i=0;i<h2;i+=4){ctx.fillStyle='rgba(30,35,40,.35)';ctx.fillRect(x,y+i,w2,1.5);}}
}
// Street names as the city's plates write them: the kind abbreviated (R., Av., Al., Rod.), the long ones' titles too.
const KINDS=[['Avenida','Av.'],['Rua','R.'],['Alameda','Al.'],['Rodovia','Rod.'],['Travessa','Tv.'],['Servidão','Serv.'],['Praça','Pça.']];
const TITLES=[['Professora','Profa.'],['Professor','Prof.'],['Doutor','Dr.'],['Desembargador','Des.'],['General','Gen.'],['Capitão','Cap.'],['Coronel','Cel.'],['Deputado','Dep.'],['Governador','Gov.'],['Engenheiro','Eng.'],['Prefeito','Pref.'],['Jornalista','Jorn.'],['Almirante','Alm.'],['Marechal','Mal.'],['Presidente','Pres.'],['Tenente','Ten.'],['Conselheiro','Cons.'],['Padre','Pe.'],['Visconde','Visc.'],['Procurador','Proc.']];
export function plateName(name){
 let n=String(name);for(const [a,b] of KINDS)if(n.startsWith(a+' ')){n=b+n.slice(a.length);break;}
 if(n.length>21)for(const [a,b] of TITLES)n=n.replace(' '+a+' ',' '+b+' ');
 return n;
}
// 6 × 16 cells of 170 × 64 px: the plate's blue, its white rim, the name and the neighbourhood under it.
const PLATE_W=170,PLATE_H=64,PLATE_COLS=6;
const plateCell=k=>[(k%PLATE_COLS)*PLATE_W,Math.floor(k/PLATE_COLS)*PLATE_H,PLATE_W,PLATE_H];
function paintPlates(names){
 return canvasTexture((ctx,w,h)=>{
  ctx.fillStyle='#123c86';ctx.fillRect(0,0,w,h);
  names.forEach(({label,bairro},k)=>{
   const [x,y,cw,ch]=plateCell(k);ctx.fillStyle='#123c86';ctx.fillRect(x,y,cw,ch);
   ctx.strokeStyle='#f4f6f8';ctx.lineWidth=2.4;ctx.beginPath();ctx.roundRect(x+4,y+4,cw-8,ch-8,5);ctx.stroke();
   fit(ctx,label,x+cw/2,y+8,cw-20,ch-26,'#f6f7f8',SANS,25);
   ctx.font=SANS(11);ctx.fillStyle='#d9e2ef';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(bairro,x+cw/2,y+ch-12);
  });
 },ATLAS,ATLAS);
}

// --- Geometry gathered in track coordinates (x east, y north, z up), written as the world's (x, z, -y).
class Kit{
 constructor(){this.p=[];this.n=[];this.c=[];this.t=[];this.l=[];this.i=[];}
 get size(){return this.p.length/3;}
 v(p,n,c,t,l){this.p.push(p[0],p[2],-p[1]);this.n.push(n[0],n[2],-n[1]);this.c.push(c[0],c[1],c[2]);this.t.push(t[0],t[1]);this.l.push(l[0],l[1],l[2],l[3]);return this.p.length/3-1;}
 // A flat quad a-b-c-d (a bottom-left, counter-clockwise seen from its front); `out` turns it to face that way.
 quad(a,b,c,d,col,look=PLAIN,uv=null,out=null){
  let n=cross(sub(c,a),sub(d,b));
  if(out&&dot(n,out)<0){[b,d]=[d,b];if(uv)uv=[uv[0],uv[3],uv[2],uv[1]];n=scale(n,-1);}
  n=unit(n);const T=uv??[WHITE,WHITE,WHITE,WHITE],k=this.v(a,n,col,T[0],look);this.v(b,n,col,T[1],look);this.v(c,n,col,T[2],look);this.v(d,n,col,T[3],look);
  this.i.push(k,k+1,k+2,k,k+2,k+3);
 }
 // Both faces of a thin plate (visors, spacers, panels seen from either side).
 sheet(a,b,c,d,col,look=PLAIN){const n=cross(sub(c,a),sub(d,b));this.quad(a,b,c,d,col,look,null,n);this.quad(a,b,c,d,col,look,null,scale(n,-1));}
 // A box u0..u1 × v0..v1 × z0..z1 in frame F (u, v, z → track point); each face turned away from the centre.
 box(F,u0,u1,v0,v1,z0,z1,col,look=PLAIN,{top=true,bottom=false,uv=null}={}){
  const P=(i,j,k)=>F(i?u1:u0,j?v1:v0,k?z1:z0),c=F((u0+u1)/2,(v0+v1)/2,(z0+z1)/2);
  const face=(A,B,C,D,f)=>this.quad(A,B,C,D,col,look,uv?.(f)??null,sub(scale(add(add(A,B),add(C,D)),.25),c));
  face(P(0,0,0),P(0,1,0),P(0,1,1),P(0,0,1),0);face(P(1,1,0),P(1,0,0),P(1,0,1),P(1,1,1),1);
  face(P(1,0,0),P(0,0,0),P(0,0,1),P(1,0,1),2);face(P(0,1,0),P(1,1,0),P(1,1,1),P(0,1,1),3);
  if(top)face(P(0,0,1),P(1,0,1),P(1,1,1),P(0,1,1),4);if(bottom)face(P(0,0,0),P(1,0,0),P(1,1,0),P(0,1,0),5);
 }
 // A tapered tube p→q of n sides with smooth normals; uv = [u0,v0,u1,v1] wraps a strip of the atlas round it.
 tube(p,q,r0,r1,n,col,look=PLAIN,{cap=true,bottom=false,uv=null,rot=0}={}){
  const d=unit(sub(q,p)),e1=unit(Math.abs(d[2])>.95?cross([0,1,0],d):cross(d,[0,0,1])),e2=cross(d,e1),base=this.size;
  for(let k=0;k<=n;k++){const a=rot+k/n*Math.PI*2,dir=add(scale(e1,Math.cos(a)),scale(e2,Math.sin(a)));
   this.v(add(p,scale(dir,r0)),dir,col,uv?[uv[0]+(uv[2]-uv[0])*k/n,uv[1]]:WHITE,look);this.v(add(q,scale(dir,r1)),dir,col,uv?[uv[0]+(uv[2]-uv[0])*k/n,uv[3]]:WHITE,look);}
  for(let k=0;k<n;k++){const a=base+k*2;this.i.push(a,a+2,a+1,a+1,a+2,a+3);}
  const lid=(c,r,nrm,flip)=>{const m=this.v(c,nrm,col,uv?[uv[2],uv[3]]:WHITE,look),s=this.size;
   for(let k=0;k<=n;k++){const a=rot+k/n*Math.PI*2;this.v(add(c,scale(add(scale(e1,Math.cos(a)),scale(e2,Math.sin(a))),r)),nrm,col,uv?[uv[2],uv[3]]:WHITE,look);}
   for(let k=0;k<n;k++)flip?this.i.push(m,s+k+1,s+k):this.i.push(m,s+k,s+k+1);};
  if(cap)lid(q,r1,d,false);if(bottom)lid(p,r0,scale(d,-1),true);
 }
 // A disc of n sides facing nrm (lenses), uv as a square region mapped round it.
 disc(c,nrm,r,n,col,look=PLAIN,uv=null){
  const d=unit(nrm),e1=unit(Math.abs(d[2])>.95?cross([0,1,0],d):cross([0,0,1],d)),e2=cross(d,e1),m=this.v(c,d,col,uv?[(uv[0]+uv[2])/2,(uv[1]+uv[3])/2]:WHITE,look),s=this.size;
  for(let k=0;k<n;k++){const a=k/n*Math.PI*2,cs=Math.cos(a),sn=Math.sin(a);this.v(add(c,add(scale(e1,cs*r),scale(e2,sn*r))),d,col,uv?[(uv[0]+uv[2])/2+cs*(uv[2]-uv[0])/2,(uv[1]+uv[3])/2+sn*(uv[3]-uv[1])/2]:WHITE,look);}
  for(let k=0;k<n;k++)this.i.push(m,s+k,s+(k+1)%n);
 }
 // A cable along pts: two vertices a point, spread across the view in the vertex shader (normal = the cable's tangent).
 wire(pts,radius,col){
  const n=pts.length,base=this.size,rc=Math.min(1,radius/.03);
  for(let k=0;k<n;k++){const t=unit(sub(pts[Math.min(n-1,k+1)],pts[Math.max(0,k-1)]));this.v(pts[k],t,col,WHITE,[rc,0,0,1]);this.v(pts[k],t,col,WHITE,[rc,1,0,1]);}
  for(let k=0;k<n-1;k++){const a=base+2*k;this.i.push(a,a+1,a+2,a+1,a+3,a+2);}
 }
 geometry(){
  const g=new THREE.BufferGeometry(),q=v=>Math.round(Math.min(1,Math.max(0,v))*255);
  g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(this.t,2));g.setAttribute('color',new THREE.BufferAttribute(Uint8Array.from(this.c,q),3,true));
  g.setAttribute('look',new THREE.BufferAttribute(Uint8Array.from(this.l,q),4,true));
  g.setIndex(new THREE.BufferAttribute(this.size>65535?Uint32Array.from(this.i):Uint16Array.from(this.i),1));
  g.computeBoundingSphere();g.computeBoundingBox();return g;
 }
}
// A frame at (x, y, z) turned to heading h: u along it, v to its left, z up; lean tilts it (radians east, north per metre).
const frame=(x,y,z,h,lx=0,ly=0)=>{const c=Math.cos(h),s=Math.sin(h);return (u,v,w)=>[x+u*c-v*s+lx*w,y+u*s+v*c+ly*w,z+w];};
// A sagging span from a to b (a parabola, close enough to the catenary of a cable this taut).
function span(a,b,sag,n){const out=[];for(let k=0;k<=n;k++){const t=k/n;out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t-4*sag*t*(1-t)]);}return out;}
// A flat sign of w × h centred on c, its front facing n (horizontal), readable from the front; back: the same face
// turned round (a double-sided plate) or a plain colour.
function sign(K,c,n,w,h,uv,col,look=PLAIN,back=null,depth=.012){
 const r=unit(cross([0,0,1],n)),f=scale(unit(n),depth/2),corner=(s,t,o)=>add(add(c,o),add(scale(r,s*w/2),[0,0,t*h/2]));
 K.quad(corner(-1,-1,f),corner(1,-1,f),corner(1,1,f),corner(-1,1,f),col,look,uv,n);
 const b=scale(f,-1),rb=scale(r,-1),cb=(s,t)=>add(add(c,b),add(scale(rb,s*w/2),[0,0,t*h/2]));
 if(back==='same')K.quad(cb(-1,-1),cb(1,-1),cb(1,1),cb(-1,1),col,look,uv,scale(n,-1));
 else K.quad(cb(-1,-1),cb(1,-1),cb(1,1),cb(-1,1),back??lin(0x8a9095),METAL(.5),null,scale(n,-1));
}

// --- What stands where: the city map, the buildings, the race corridor and everything already placed.
class Occupancy{
 constructor(cell=6){this.cell=cell;this.m=new Map();}
 cells(x,y,r,f){const c=this.cell;for(let i=Math.floor((x-r)/c);i<=Math.floor((x+r)/c);i++)for(let j=Math.floor((y-r)/c);j<=Math.floor((y+r)/c);j++)f(i*100003+j);}
 add(x,y,r){const e=[x,y,r];this.cells(x,y,r,k=>{let a=this.m.get(k);if(!a)this.m.set(k,a=[]);a.push(e);});}
 free(x,y,r){let ok=true;this.cells(x,y,r,k=>{if(!ok)return;const a=this.m.get(k);if(a)for(const e of a)if((e[0]-x)**2+(e[1]-y)**2<(e[2]+r)**2){ok=false;return;}});return ok;}
}
// The buildings (the city's cadastre rings, or the scenery's rectangles) and the landmarks' outlines, by 40 m cells.
function buildingIndex(data){
 const rings=[],cell=40,grid=new Map(),cityB=data.scenery.city?.buildings;
 if(cityB?.items?.length){const c=Object.fromEntries(cityB.columns.map((k,i)=>[k,i]));for(const it of cityB.items){const r=it[c.ring];if(r?.length>=6)rings.push({p:r,h:it[c.h]??6});}}
 else if(data.scenery.buildings){const b=data.scenery.buildings,c=Object.fromEntries(b.columns.map((k,i)=>[k,i]));
  for(const it of b.items){const x=it[c.x],y=it[c.y],w=it[c.w]/2,d=it[c.d]/2,cs=Math.cos(it[c.heading]),sn=Math.sin(it[c.heading]),p=[];for(const [u,v] of [[-w,-d],[w,-d],[w,d],[-w,d]])p.push(x+u*cs-v*sn,y+u*sn+v*cs);rings.push({p,h:it[c.h]??6});}}
 for(const m of data.scenery.landmarks??[])if(m.outline?.length>=3)rings.push({p:m.outline.flat(),h:12});
 rings.forEach((r,k)=>{let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(let i=0;i<r.p.length;i+=2){x0=Math.min(x0,r.p[i]);x1=Math.max(x1,r.p[i]);y0=Math.min(y0,r.p[i+1]);y1=Math.max(y1,r.p[i+1]);}
  Object.assign(r,{x0,y0,x1,y1});for(let i=Math.floor(x0/cell);i<=Math.floor(x1/cell);i++)for(let j=Math.floor(y0/cell);j<=Math.floor(y1/cell);j++){const key=i*100003+j;let a=grid.get(key);if(!a)grid.set(key,a=[]);a.push(k);}});
 const near=(x,y,r,f)=>{const seen=new Set();for(let i=Math.floor((x-r)/cell);i<=Math.floor((x+r)/cell);i++)for(let j=Math.floor((y-r)/cell);j<=Math.floor((y+r)/cell);j++)for(const k of grid.get(i*100003+j)??[]){if(seen.has(k))continue;seen.add(k);const b=rings[k];if(x<b.x0-r||x>b.x1+r||y<b.y0-r||y>b.y1+r)continue;f(b);}};
 // The nearest point of a ring's outline to (x, y), and whether (x, y) is inside it.
 const nearest=(b,x,y)=>{const p=b.p,n=p.length/2;let best=Infinity,bx=0,by=0,inside=false;
  for(let i=0,j=n-1;i<n;j=i++){const ax=p[j*2],ay=p[j*2+1],qx=p[i*2],qy=p[i*2+1];if(((qy>y)!==(ay>y))&&x<(ax-qx)*(y-qy)/(ay-qy)+qx)inside=!inside;
   const dx=qx-ax,dy=qy-ay;let u=((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1e-9);u=u<0?0:u>1?1:u;const ex=ax+dx*u,ey=ay+dy*u,d=Math.hypot(x-ex,y-ey);if(d<best){best=d;bx=ex;by=ey;}}
  return {d:best,x:bx,y:by,inside};};
 return {count:rings.length,
  inside(x,y,margin=0){let hit=false;near(x,y,margin,b=>{if(hit)return;const q=nearest(b,x,y);if(q.inside||q.d<margin)hit=true;});return hit;},
  facades(x,y,r){const out=[];near(x,y,r,b=>{const q=nearest(b,x,y);if(!q.inside&&q.d<r)out.push({...q,h:b.h});});return out.sort((a,b)=>a.d-b.d);}};
}
// Distance to the bands the scenery keeps clear (track-clearance.js sceneryBands, the same sums as bandClearance) from a
// 16 m grid of their segments: only the few segments near a point are looked at. Past CLEAR_REACH it reports that much.
const CLEAR_REACH=14;
function clearanceIndex(data){
 const bands=sceneryBands(data).filter(b=>!b.rim),cell=16,grid=new Map();
 bands.forEach((band,bi)=>{const a=band.points,n=a.length,last=band.closed?n:n-1;
  for(let i=0;i<last;i++){const p=a[i],q=a[(i+1)%n],pc=(p[4]+p[5])/2,qc=(q[4]+q[5])/2,ax=p[0]+p[2]*pc,ay=p[1]+p[3]*pc,bx=q[0]+q[2]*qc,by=q[1]+q[3]*qc,r=Math.max(p[5]-p[4],q[5]-q[4])/2+band.margin+CLEAR_REACH;
   for(let gx=Math.floor((Math.min(ax,bx)-r)/cell);gx<=Math.floor((Math.max(ax,bx)+r)/cell);gx++)for(let gy=Math.floor((Math.min(ay,by)-r)/cell);gy<=Math.floor((Math.max(ay,by)+r)/cell);gy++){const k=gx*100003+gy;let l=grid.get(k);if(!l)grid.set(k,l=[]);l.push(bi,i);}}});
 return (x,y)=>{const l=grid.get(Math.floor(x/cell)*100003+Math.floor(y/cell));let best=CLEAR_REACH,name=null,at=-1;if(!l)return {distance:best,band:null,i:-1};
  for(let k=0;k<l.length;k+=2){const band=bands[l[k]],a=band.points,n=a.length,i=l[k+1],p=a[i],q=a[(i+1)%n],pc=(p[4]+p[5])/2,qc=(q[4]+q[5])/2,ax=p[0]+p[2]*pc,ay=p[1]+p[3]*pc,dx=q[0]+q[2]*qc-ax,dy=q[1]+q[3]*qc-ay;
   let u=((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1e-9);u=u<0?0:u>1?1:u;const e=Math.hypot(x-ax-u*dx,y-ay-u*dy)-((p[5]-p[4])+((q[5]-q[4])-(p[5]-p[4]))*u)/2-band.margin;
   if(e<best){best=e;name=band.name;at=i;}}
  return {distance:best,band:name,i:at};};
}

// --- The pieces.
const CONCRETE_STRIP=k=>{const [x,,w]=REG.strip(k);return [(x+3)/ATLAS,(x+w-3)/ATLAS];};
// v of the strip at height z of a pole H tall (the strip's bottom row is its foot).
const stripV=(z,H)=>(3+1018*Math.max(0,Math.min(1,z/H)))/ATLAS;
const DT=(W,N,f=.035,w=.026)=>[[W/2,N/2],[W/2-f,N/2],[W/2-f,w],[-W/2+f,w],[-W/2+f,N/2],[-W/2,N/2],[-W/2,-N/2],[-W/2+f,-N/2],[-W/2+f,-w],[W/2-f,-w],[W/2-f,-N/2],[W/2,-N/2]];
const CABLE={bare:lin(0x8d9398),black:lin(0x1a1a1a),dark:lin(0x262728),grey:lin(0x5b6064),white:lin(0xb9bcbc),steel:lin(0x6b7075)};
// A concrete utility pole and what hangs on it. P: {x,y,z (ground), h (toward the street)}; st: the style of its line
// (shared by the poles a cable joins); returns where each cable meets it.
function utilityPole(K,P,st,R,fine){
 const H=10.1+R()*1.3,lean=R()<.07?.016+R()*.012:.002+R()*.009,la=R()*6.283,F=frame(P.x,P.y,P.z,P.h,Math.cos(la)*lean,Math.sin(la)*lean);
 const tone=.84+R()*.26,warm=1+(R()-.5)*.1,col=[tone*warm,tone,tone*(2-warm)],round=R()<.2,strip=Math.floor(R()*3),[s0,s1]=CONCRETE_STRIP(strip),[w0,w1]=CONCRETE_STRIP(3+strip);
 const Wb=.29+R()*.05,Wt=.15+R()*.02,half=round?z=>.155+(.085-.155)*z/H:z=>(Wb+(Wt-Wb)*z/H)/2,N=z=>.15-.02*z/H;
 if(round)K.tube(F(0,0,-.4),F(0,0,H),.16,.085,fine?9:6,col,PLAIN,{uv:[s0,stripV(0,H),s1,stripV(H,H)],rot:R()});
 else{
  // The double-T: wide toward the street, its webbed channels (with their row of holes) along it.
  const a=DT(Wb,N(0)),b=DT(Wt,N(H)),zb=-.4,c0=F(0,0,(zb+H)/2);
  for(let k=0;k<12;k++){const p=a[k],q=a[(k+1)%12],P1=b[(k+1)%12],P0=b[k],web=k===2||k===8,[u0,u1]=web?[w0,w1]:[s0,s1];
   const A=F(p[0],p[1],zb),B=F(q[0],q[1],zb),C=F(P1[0],P1[1],H),D=F(P0[0],P0[1],H);
   if(!fine&&(k===1||k===3||k===7||k===9))continue;
   K.quad(A,B,C,D,web?scale(col,.86):col,PLAIN,[[u0,stripV(zb,H)],[u1,stripV(zb,H)],[u1,stripV(H,H)],[u0,stripV(H,H)]],sub(F((p[0]+q[0])/2,(p[1]+q[1])/2,(zb+H)/2),c0));}
  const Wh=Wt/2,Nh=N(H)/2;K.box(F,-Wh,Wh,-Nh,Nh,H-.001,H,col,PLAIN);
 }
 const slots={at:[P.x,P.y],pri:null,msg:null,sec:[],tel:[],drop:null,trafo:null};
 // Remnants of posters glued on the street face at hand height (the lambe-lambe every pole collects).
 if(fine&&R()<.3)for(let k=0,n=1+Math.floor(R()*3);k<n;k++){const z=1.5+R()*1.1,hh=.18+R()*.25,ww=Math.min(.12,half(z)*.9),v=(R()-.5)*.04,u=half(z)+.006;
  K.quad(F(u,v+ww,z),F(u,v-ww,z),F(u,v-ww,z+hh),F(u,v+ww,z+hh),lin(pick(R,[0xe8e2c8,0xf0d64a,0xe58fb0,0xd8e4e8,0xf3a35c]),.75+R()*.2),PLAIN,null,sub(F(1,0,z),F(0,0,z)));}
 const vc=z=>(round?half(z):N(z)/2)+.045;
 // Primary: a crossarm with three pin insulators, or the compact spacer cable on its bracket, or none.
 if(st.pri==='cross'){
  const Hc=H-.18,L=2+R()*.4,off=R()<.4?.5:0,v=vc(Hc),wood=st.arm==='wood',ac=wood?lin(0x6b5a48,.8+R()*.3):lin(0x9a9890,.85+R()*.2);
  K.box(F,off-L/2,off+L/2,v-.045,v+.045,Hc-.1,Hc,ac,PLAIN,{bottom:true});
  if(fine)for(const s of [-1,1])K.tube(F(off+s*.62,v,Hc-.1),F(0,v,Hc-.72),.012,.012,4,lin(0x555a5e),METAL(.5),{cap:false});
  const ic=st.ins==='porcelain'?lin(0x7d5a44,.8+R()*.3):lin(0xa8aca6,.9+R()*.1);slots.pri=[];
  for(const u of [off-L/2+.12,off+(off?-.3:.32),off+L/2-.12]){if(fine)K.tube(F(u,v,Hc),F(u,v,Hc+.15),.055,.035,6,ic,PLAIN);else K.box(F,u-.04,u+.04,v-.04,v+.04,Hc,Hc+.14,ic);slots.pri.push(F(u,v,Hc+.16));}
 }else if(st.pri==='compact'){
  const Hm=H-.45,u0=half(Hm),u1=u0+.68;K.tube(F(u0-.02,0,Hm),F(u1,0,Hm),.022,.02,5,lin(0x6f7478),METAL(.55));K.box(F,u1-.03,u1+.03,-.025,.025,Hm-.14,Hm+.02,lin(0x5d6266),METAL(.5));
  const m=F(u1,0,Hm-.13);slots.msg={m,ph:[F(u1-.1,0,Hm-.31),F(u1+.1,0,Hm-.31),F(u1,0,Hm-.47)]};
 }
 // A transformer on the far side, with its three bushings (and leads up to the line).
 if(st.pri!=='none'&&R()<.1){
  const z0=H-2.05,z1=H-1.15,u=-(half(z1)+.36),tc=lin(pick(R,[0x8c9296,0x7f878a,0x8a8f84]),.85+R()*.2);
  K.tube(F(u,0,z0),F(u,0,z1),.3,.3,fine?10:6,tc,METAL(.25),{bottom:true});K.tube(F(u,0,z1),F(u,0,z1+.05),.33,.33,fine?10:6,scale(tc,.9),METAL(.25));
  for(const z of [z0+.2,z1-.2])K.box(F,u+.25,-half(z),-.06,.06,z-.04,z+.04,lin(0x4e5357),METAL(.4));
  if(fine)for(const s of [-1,1])K.box(F,u-.06,u+.06,s*.29,s*.37,z0+.05,z1-.08,scale(tc,.92),METAL(.25));
  slots.trafo=[-1,0,1].map(s=>{const p=F(u+s*.14,s*.04,z1+.05);K.tube(p,add(p,[0,0,.16]),.03,.022,5,lin(0x4a3528),PLAIN);return add(p,[0,0,.17]);});
 }
 // Secondary: a rack of four spools or a hook with the black twisted bundle.
 const Hs=H-2.35;
 if(st.sec==='rack'){K.box(F,half(Hs-.4),half(Hs-.4)+.035,-.025,.025,Hs-.75,Hs+.08,lin(0x5a5f63),METAL(.45));
  for(let k=0;k<4;k++){const z=Hs-k*.2,u=half(z)+.035;if(fine)K.box(F,u,u+.09,-.04,.04,z-.04,z+.04,lin(0xd7d4c8,.85));slots.sec.push(F(u+.1,0,z));}}
 else{const u=half(Hs);K.box(F,u,u+.07,-.03,.03,Hs-.05,Hs+.05,lin(0x45494c),METAL(.4));slots.sec.push(F(u+.09,0,Hs-.06));}
 // The street light: a pipe out over the street and the LED luminaire (or an old sodium cobra-head).
 const Ha=H-3.5+(R()-.5)*.5;
 if(R()<.93){
  const u0=half(Ha),La=1.5+R()*1.1,alpha=.12+R()*.16,curved=R()<.3,led=R()<.84,pc=lin(pick(R,[0x8e9498,0x6d7377,0x9fa4a6]),.9+R()*.15);
  K.box(F,u0-.01,u0+.06,-.06,.06,Ha-.3,Ha+.12,pc,METAL(.5));
  let a=F(u0+.04,0,Ha),eu=u0+.04,ez=Ha;
  if(curved){const m=F(u0+.34,0,Ha+.55);K.tube(a,m,.032,.03,fine?6:4,pc,METAL(.55),{cap:false});a=m;eu=u0+.34;ez=Ha+.55;}
  eu+=La*Math.cos(curved?.08:alpha);ez+=La*Math.sin(curved?.08:alpha);K.tube(a,F(eu,0,ez),.03,.028,fine?6:4,pc,METAL(.55));
  const tilt=(curved?.08:alpha)*.4,Fl=(u,v,z)=>F(eu+u,v,ez+z+u*Math.tan(tilt));
  if(led){const bc=lin(pick(R,[0x9aa0a4,0x6a7074,0xb5b9bb]));K.box(Fl,-.06,.58,-.15,.15,-.08,.02,bc,METAL(.6),{bottom:true});
   K.box(Fl,-.01,.53,-.12,.12,-.105,-.08,lin(0xdfe6ee),[0,1,0,0],{top:false,bottom:true});}
  else{K.tube(Fl(-.05,0,-.02),Fl(.62,0,-.06),.13,.07,fine?7:5,lin(0x9da3a6),METAL(.4));K.box(Fl,.04,.46,-.09,.09,-.17,-.09,lin(0xf2a64e),[0,1,0,0],{top:false,bottom:true});}
  slots.lamp={p:Fl(.26,0,-.1),led};
 }
 // Telecom: black cables on clamps, one to four of them, the lowest about 5.3 m up.
 const Ht=Math.min(6.15,Ha-.55);
 for(let k=0;k<st.tel;k++){const z=Ht-k*.22,u=half(z);if(fine)K.box(F,u,u+.05,-.035,.035,z-.035,z+.035,lin(0x202224),PLAIN);slots.tel.push(F(u+.07,(R()-.5)*.04,z-.03));}
 // The fibre operators' spare coil (reserva técnica) on its cross bracket, now and then.
 if(fine&&st.tel&&R()<.14){
  const zc=Ht-st.tel*.22-.6,uc=half(zc)+.08,col2=pick(R,[CABLE.black,CABLE.dark,CABLE.grey]);
  for(let loop=0;loop<3;loop++){const r=.3+loop*.018,pts=[];for(let k=0;k<=18;k++){const a=k/18*Math.PI*2;pts.push(F(uc+loop*.012,Math.cos(a)*r,zc+Math.sin(a)*r*1.06));}K.wire(pts,.007,col2);}
  if(R()<.6)for(const s of [-1,1])K.box(F,uc-.01,uc+.01,-.02,.02,zc-.34,zc+.34,lin(0x34383a),METAL(.3));
 }
 slots.drop=slots.sec.at(-1)??slots.tel[0]??F(half(7)+.05,0,7);slots.F=F;slots.H=H;slots.half=half;
 return slots;
}
// The cables of one span between two poles of the same line; floor(t) is the lowest a cable may hang at t (the ground,
// or the race track where the span crosses it).
function cables(K,A,B,R,fine,floor){
 const L=Math.hypot(A.at[0]-B.at[0],A.at[1]-B.at[1]),k2=(L/36)**2,seg=fine?9:5;let count=0;
 const hang=(a,b,sag,radius,col)=>{let s=sag;for(const t of [.25,.5,.75]){const z=a[2]+(b[2]-a[2])*t,room=(z-floor(t))/(4*t*(1-t));s=Math.min(s,room);}
  if(s<.04)return null;const pts=span(a,b,s,seg);K.wire(pts,radius,col);count++;return pts;};
 if(A.pri&&B.pri){const s=(.2+R()*.12)*k2;for(let i=0;i<3;i++)hang(A.pri[i],B.pri[i],s+(R()-.5)*.04,.0065,CABLE.bare);}
 if(A.msg&&B.msg){
  const s=(.3+R()*.12)*k2,m=hang(A.msg.m,B.msg.m,s,.005,CABLE.steel);
  if(m){for(let i=0;i<3;i++)hang(A.msg.ph[i],B.msg.ph[i],s,.012,CABLE.dark);
   // The diamond spacers that hold the three covered phases under the messenger, every 9 m or so.
   const d=unit([B.at[0]-A.at[0],B.at[1]-A.at[1],0]),e=[-d[1],d[0],0],n=Math.max(1,Math.round(L/9));
   for(let k=0;k<n;k++){const t=(k+.5)/n,z=A.msg.m[2]+(B.msg.m[2]-A.msg.m[2])*t-4*s*t*(1-t),c=[A.msg.m[0]+(B.msg.m[0]-A.msg.m[0])*t,A.msg.m[1]+(B.msg.m[1]-A.msg.m[1])*t,z];
    K.sheet(c,add(c,add(scale(e,-.13),[0,0,-.2])),add(c,[0,0,-.38]),add(c,add(scale(e,.13),[0,0,-.2])),lin(0x7a7e80));}}
 }
 const ns=Math.min(A.sec.length,B.sec.length);
 if(ns>1){const s=(.32+R()*.15)*k2,black=R()<.5;for(let i=0;i<ns;i++)hang(A.sec[i],B.sec[i],s+(R()-.5)*.05,.005,black?CABLE.black:CABLE.bare);}
 else if(ns===1)hang(A.sec[0],B.sec[0],(.45+R()*.3)*k2,.016,CABLE.black);
 const nt=Math.min(A.tel.length,B.tel.length);let first=null;
 for(let i=0;i<nt;i++){const p=hang(A.tel[i],B.tel[i],(.5+R()*.75)*k2,.006+R()*.008,pick(R,[CABLE.black,CABLE.black,CABLE.dark,CABLE.grey]));first??=p;}
 // The tangle: a loose cable from one level to another now and then, and a fibre box hung near a pole.
 if(fine&&nt&&R()<.25)hang(A.tel[0],B.tel[nt-1],(1.2+R()*.6)*k2,.005,CABLE.black);
 if(fine&&first&&R()<.14){const t=.04+R()*.06,p=first[Math.max(1,Math.round(t*(first.length-1)))],d=unit(sub(B.tel[0],A.tel[0])),h=Math.atan2(d[1],d[0]),Fb=frame(p[0],p[1],p[2],h);
  K.box(Fb,-.17,.17,-.07,.07,-.27,-.02,lin(pick(R,[0x1c1c1c,0x3a3d40,0xb4b6b2])),PLAIN,{bottom:true});}
 return count;
}
// A vehicle signal head (three lenses, visors, backboard) in frame F: u out of its face, v to its left, z up, origin at
// the backboard's centre line, bottom of the housing. The amber lens blinks with the junction's beat.
function signalHead(K,F,R,beat,fine,border){
 const hc=lin(pick(R,[0x161718,0x1d1f20,0x2a2c2c])),bc=lin(0x0c0c0c);
 K.box(F,0,.22,-.17,.17,0,.98,hc,METAL(.15),{bottom:true});
 K.box(F,-.014,0,-.29,.29,-.1,1.08,bc,PLAIN,{top:true,bottom:true});
 if(border)K.box(F,-.022,-.014,-.32,.32,-.13,1.11,lin(0xe7c21a),PLAIN,{top:true,bottom:true});
 const lens=[[.82,lin(0x5a0605,.55)],[.49,lin(0xffb000,.3)],[.16,lin(0x063a24,.55)]];
 lens.forEach(([z,c],k)=>{K.disc(F(.222,0,z),sub(F(1,0,z),F(0,0,z)),.1,fine?10:6,c,k===1?[0,1,beat[0],beat[1]]:PLAIN);
  if(fine){K.sheet(F(.222,-.125,z+.12),F(.222,.125,z+.12),F(.4,.125,z+.1),F(.4,-.125,z+.1),hc);for(const s of [-1,1])K.sheet(F(.222,s*.125,z-.06),F(.222,s*.125,z+.12),F(.36,s*.125,z+.1),F(.36,s*.125,z-.02),hc);}});
}
function pedestrianHead(K,F,fine){
 const hc=lin(0x18191a);K.box(F,0,.2,-.15,.15,0,.62,hc,METAL(.15),{bottom:true});
 for(const [z,r,c] of [[.33,REG.pedStop,lin(0x9a3020)],[.03,REG.pedWalk,lin(0x2a9070)]]){const [x,y,w,h]=r;K.quad(F(.202,-.12,z),F(.202,.12,z),F(.202,.12,z+.26),F(.202,-.12,z+.26),c,PLAIN,rect(x+2,y+2,w-4,h-4),sub(F(1,0,z),F(0,0,z)));
  if(fine)K.sheet(F(.202,-.13,z+.28),F(.202,.13,z+.28),F(.34,.13,z+.26),F(.34,-.13,z+.26),hc);}
}
// A signal post at (x, y, ground z): u the arm's way (toward the road), the heads facing `face`. Cantilever when arm > 0:
// the arm at zArm (above the post's foot) with the heads hung at `at` metres along it; otherwise a column with its head.
function signalPost(K,o,R,fine){
 const F=frame(o.x,o.y,o.z,Math.atan2(o.dir[1],o.dir[0])),galv=R()<.6,pc=galv?lin(0x8d9396,.9+R()*.15):lin(0x232526),pm=METAL(galv?.55:.2);
 const fh=Math.atan2(o.face[1],o.face[0]),top=o.arm?o.zArm+.9:3.65+R()*.3;
 K.tube(F(0,0,-.3),F(0,0,top),.075,.065,fine?8:6,pc,pm);K.tube(F(0,0,-.05),F(0,0,.1),.16,.16,6,lin(0x9a978f),PLAIN);
 const head=(x,y,z,border)=>signalHead(K,frame(x,y,z,fh),R,o.beat,fine,border);
 const border=R()<.4;
 if(o.arm){
  const end=F(o.arm,0,o.zArm+o.arm*.03);K.tube(F(0,0,o.zArm),end,.06,.05,fine?7:5,pc,pm);K.tube(F(0,0,o.zArm+.85),F(o.arm*.55,0,o.zArm+o.arm*.0165),.022,.022,4,pc,pm,{cap:false});
  for(const t of o.at){const h=F(t,0,o.zArm+t*.03),fx=Math.cos(fh),fy=Math.sin(fh);K.tube(h,add(h,[0,0,-.28]),.025,.025,4,pc,pm,{cap:false});head(h[0]-fx*.11,h[1]-fy*.11,h[2]-.26-.98,border);}
  if(o.repeat){const p=F(0,0,2.45),fx=Math.cos(fh),fy=Math.sin(fh);head(p[0]+fx*.08,p[1]+fy*.08,p[2],border);}
 }else{const p=F(0,0,top-1.08),fx=Math.cos(fh),fy=Math.sin(fh);head(p[0]+fx*.08,p[1]+fy*.08,p[2],border);}
 if(o.ped){const p=F(0,0,1.95),ph=Math.atan2(o.ped[1],o.ped[0]);pedestrianHead(K,frame(p[0]+o.ped[0]*.08,p[1]+o.ped[1]*.08,p[2],ph),fine);}
}
// A bus shelter in frame F: a along the road, b toward it, z up, origin at the middle of its back line.
function busShelter(K,F,R,fine,narrow){
 const L=narrow?2.6:3.7+R()*1.3,D=narrow?1.05:1.45+R()*.25,Hr=2.5+R()*.28,fc=lin(pick(R,[0x2c3134,0x5f676b,0xd9dcdc,0x2f4a3a,0x23395c,0x8a9196])),fm=METAL(.12);
 const four=R()<.35,glass=R()<.45,ads=!narrow&&R()<.85;
 for(const a of [-L/2+.08,L/2-.08,...(L>4.4?[0]:[])]){K.box(F,a-.045,a+.045,.02,.11,-.1,Hr,fc,fm);if(four)K.box(F,a-.04,a+.04,D-.12,D-.04,-.1,Hr,fc,fm);}
 const Fr=(a,b,z)=>F(a,b,z+b*.05),rc=lin(pick(R,[0x2a2e30,0xc9cccc,0x3b5b78,0x6f7a6e]));
 K.box(Fr,-L/2-.15,L/2+.15,-.1,D+.22,Hr,Hr+.09,rc,METAL(.1),{bottom:true});
 if(glass)K.box(F,-L/2+.13,L/2-.13,.05,.08,.12,Hr-.12,lin(0x3a4a50,.55),[.75,0,0,0]);
 else{const [x,y,w,h]=REG.perforated;K.box(F,-L/2+.13,L/2-.13,.05,.08,.35,Hr-.35,fc,fm,{uv:f=>f===2||f===3?rect(x,y,w,h):null});}
 // The bench along the back, wood or metal slats.
 const wood=R()<.5,sc=wood?lin(0xb07a4a,.8+R()*.3):lin(0x9aa1a5),a1=ads?L/2-1.4:L/2-.35;
 K.box(F,-L/2+.3,a1,.12,.52,.42,.47,sc,wood?PLAIN:METAL(.45),{bottom:true});for(const a of [-L/2+.45,a1-.15])K.box(F,a-.03,a+.03,.15,.48,0,.42,fc,fm);
 // The lit advertising panel at the far end: a poster on each face, glowing after dark.
 if(ads){const a0=L/2-.02,[x,y,w,h]=REG.poster(Math.floor(R()*POSTERS.length)),[x2,y2]=REG.poster(Math.floor(R()*POSTERS.length));
  K.box(F,a0,a0+.2,.08,1.34,.18,2.12,fc,fm,{bottom:true});
  const uvA=rect(x+1,y+1,w-2,h-2),uvB=rect(x2+1,y2+1,w-2,h-2),glow=[0,.16,0,0];
  K.quad(F(a0-.003,1.26,.27),F(a0-.003,.16,.27),F(a0-.003,.16,2.03),F(a0-.003,1.26,2.03),[1,1,1],glow,uvA,sub(F(-1,0,1),F(0,0,1)));
  K.quad(F(a0+.203,.16,.27),F(a0+.203,1.26,.27),F(a0+.203,1.26,2.03),F(a0+.203,.16,2.03),[1,1,1],glow,uvB,sub(F(1,0,1),F(0,0,1)));}
}
function busSign(K,x,y,z,face){
 const F=frame(x,y,z,0),pc=lin(0x8d9396);K.tube(F(0,0,-.2),F(0,0,2.75),.035,.03,6,pc,METAL(.5));
 const [rx,ry,w,h]=REG.bus;sign(K,F(0,0,2.42),[face[0],face[1],0],.46,.46,rect(rx+1,ry+1,w-2,h-2),[1,1,1],PLAIN,'same',.02);
}
// Plates on a thin pole: two blue name plates crossed at right angles on its top.
function namePlates(K,x,y,z,dirA,dirB,cellA,cellB,R){
 const F=frame(x,y,z,0),pc=lin(0x9aa0a3,.85+R()*.2),H=2.55+R()*.2;
 K.tube(F(0,0,-.2),F(0,0,H+.42),.03,.028,6,pc,METAL(.5));
 const plate=(dir,cell,z0)=>{const n=[-dir[1],dir[0],0],[cx,cy,cw,ch]=plateCell(cell);sign(K,F(0,0,z0),n,.52,.196,rect(cx+1,cy+1,cw-2,ch-2,false,1),[1,1,1],PLAIN,'same',.014);
};
 plate(dirA,cellA,H+.1);plate(dirB,cellB,H+.33);
}
// --- Small things of the sidewalk, each in frame F (u along the curb, v toward the street, z up).
function litterBin(K,F,R){
 const orange=R()<.8,c=orange?lin(pick(R,[0xe8691a,0xf07a22,0xd95f18]),.75+R()*.3):lin(0x2f7d3a,.8+R()*.3),pc=lin(0x5e6467);
 K.box(F,-.03,.03,-.03,.03,-.1,.98,pc,METAL(.45));
 if(R()<.5){K.box(F,-.19,.19,.05,.36,.43,.93,c,METAL(.1),{bottom:true});K.box(F,-.16,.16,.08,.33,.931,.935,lin(0x151515));}
 else{const p=F(0,.24,.42);K.tube(p,add(p,[0,0,.52]),.17,.19,8,c,METAL(.1),{bottom:true});}
}
function hydrant(K,F,R){
 const red=R()<.75,c=red?lin(0xb8141b,.8+R()*.3):lin(0xe9b818),cap=red?lin(0xe9c31b):lin(0xb8141b),o=F(0,0,0),up=(z)=>add(o,[0,0,z]);
 K.tube(up(-.05),up(.06),.15,.15,8,scale(c,.8),PLAIN);K.tube(up(.06),up(.62),.105,.1,8,c,PLAIN,{cap:false});K.tube(up(.62),up(.78),.11,.04,8,cap,PLAIN);
 for(const s of [-1,1])K.tube(F(0,s*.08,.42),F(0,s*.2,.42),.045,.045,6,cap,PLAIN);K.tube(F(.08,0,.32),F(.19,0,.32),.06,.06,6,cap,PLAIN);
}
function bollard(K,F,R,kind){
 if(kind==='concrete'){const c=lin(0xb0aea6,.8+R()*.3);K.box(F,-.11,.11,-.11,.11,-.1,.62,c);K.box(F,-.08,.08,-.08,.08,.62,.72,c);}
 else{const c=kind==='yellow'?lin(0xe2b21c):lin(0x2a2d2f),o=F(0,0,0);K.tube(add(o,[0,0,-.1]),add(o,[0,0,.82]),.07,.065,8,c,METAL(.3));if(kind!=='yellow')K.tube(add(o,[0,0,.62]),add(o,[0,0,.7]),.071,.071,8,lin(0xe8e4d8),PLAIN,{cap:false});}
}
function parkingSign(K,F,R,face){
 const pc=lin(0x8d9396),o=F(0,0,0);K.tube(add(o,[0,0,-.2]),add(o,[0,0,2.55]),.03,.028,6,pc,METAL(.5));
 const n=[face[0],face[1],0],c=add(o,[0,0,2.25]),[x,y,s]=REG.noParking;K.disc(add(c,scale(n,.012)),n,.25,14,[1,1,1],PLAIN,[x/ATLAS+.001,1-(y+s)/ATLAS+.001,(x+s)/ATLAS-.001,1-y/ATLAS-.001]);K.disc(add(c,scale(n,-.004)),scale(n,-1),.25,10,lin(0x8a9095),METAL(.5));
 if(R()<.45){const r=R()<.5?REG.loading:REG.hours;sign(K,add(o,[0,0,1.83]),n,.4,.2,rect(r[0]+1,r[1]+1,r[2]-2,r[3]-2),[1,1,1],PLAIN,null,.01);}
}
function bikeRack(K,F,R){
 const n=3+Math.floor(R()*3),c=lin(pick(R,[0x9aa0a3,0x2d3133,0xd0a01c]));
 for(let k=0;k<n;k++){const a=(k-(n-1)/2)*.8;const p=[F(a,-.3,-.1),F(a,-.3,.72),F(a,.3,.72),F(a,.3,-.1)];K.tube(p[0],p[1],.024,.024,5,c,METAL(.5),{cap:false});K.tube(p[1],p[2],.024,.024,5,c,METAL(.5),{cap:false});K.tube(p[3],p[2],.024,.024,5,c,METAL(.5),{cap:false});}
}
function bench(K,F,R){
 const L=1.7+R()*.5,feet=lin(pick(R,[0xa9a59b,0x3a3d3f,0x6a4a33]),.85+R()*.25),wc=lin(pick(R,[0x8b5a32,0x6e4b2e,0xa0703f,0x4e5b3c]),.75+R()*.35),[x,y,w,h]=REG.wood,uv=rect(x,y,w,h);
 if(R()<.25){K.box(F,-L/2,L/2,-.22,.22,0,.45,lin(0xb2ada3,.8+R()*.25),PLAIN);return;}
 for(const a of [-L/2+.15,L/2-.15]){K.box(F,a-.05,a+.05,-.2,.2,0,.42,feet,METAL(.2));K.box(F,a-.04,a+.04,-.24,-.18,.42,.85,feet,METAL(.2));}
 for(let k=0;k<3;k++)K.box(F,-L/2,L/2,-.2+k*.14,-.08+k*.14,.42,.46,wc,PLAIN,{bottom:true,uv:()=>uv});
 for(let k=0;k<2;k++)K.box(F,-L/2,L/2,-.25,-.21,.54+k*.16,.66+k*.16,wc,PLAIN,{bottom:true,uv:()=>uv});
}
// A newspaper kiosk (banca), its front opened on the magazines, its joke name over them.
function kiosk(K,F,R,k){
 const c=lin(pick(R,[0x2f8f4e,0x237a42,0x2a5d9f,0x7a8086,0xa83228]),.85+R()*.25),[mx,my,mw,mh]=REG.magazines(k%2),[nx,ny,nw,nh]=REG.banca(k%BANCAS.length),[sx,sy,sw,sh]=REG.shutter;
 K.box(F,-1.4,1.4,0,1.9,0,2.35,c,METAL(.06));K.box(F,-1.6,1.6,-.15,2.3,2.35,2.47,scale(c,.8),METAL(.06),{bottom:true});
 const n=sub(F(0,1,1),F(0,0,1));
 K.quad(F(1.3,1.905,.45),F(-1.3,1.905,.45),F(-1.3,1.905,1.95),F(1.3,1.905,1.95),[1,1,1],[0,.06,0,0],rect(mx,my,mw,mh),n);
 K.quad(F(1.38,1.906,2.0),F(-1.38,1.906,2.0),F(-1.38,1.906,2.32),F(1.38,1.906,2.32),[1,1,1],[0,.12,0,0],rect(nx,ny,nw,nh),n);
 // The two shutters swung open beside the front.
 const ua=sub(F(1,0,0),F(0,0,0));for(const s of [-1,1]){const hp=F(s*1.4,1.9,0),d=add(scale(n,Math.cos(.95)),scale(ua,s*Math.sin(.95)));const Fd=frame(hp[0],hp[1],hp[2],Math.atan2(d[1],d[0]));K.box(Fd,0,1.3,-.015,.015,.05,2.25,c,METAL(.06),{uv:()=>rect(sx,sy,sw,sh)});
  // Magazines and toys hung on the inside of each door.
  for(const v of [-1,1])K.quad(Fd(.08,v*.017,.4),Fd(1.22,v*.017,.4),Fd(1.22,v*.017,2.05),Fd(.08,v*.017,2.05),[1,1,1],[0,.05,0,0],rect(mx+(s>0?0:mw*.4),my,mw*.6,mh,v<0),sub(Fd(0,v,1),Fd(0,0,1)));}
 for(const s of [-1,1])K.quad(F(s*1.401,.2,.3),F(s*1.401,1.7,.3),F(s*1.401,1.7,2.1),F(s*1.401,.2,2.1),[1,1,1],PLAIN,rect(mx+mw/2,my,mw/2,mh,s<0),sub(F(s,0,1),F(0,0,1)));
}
// The orelhão: Chu Ming Silveira's egg-shaped shell, open at the front and below, hung from a post behind it.
function orelhao(K,F,R){
 const r=R(),c=lin(r<.5?0xf06a1d:r<.85?0x1e63b0:0xf0b41d,.85+R()*.2),inner=scale(c,.78),o=F(0,0,0),Ax=sub(F(1,0,0),o),Bx=sub(F(0,1,0),o);
 K.tube(F(0,.47,-.2),F(0,.47,2.25),.05,.045,6,lin(0x6a6f72),METAL(.4));K.box(F,-.05,.05,.3,.47,1.9,2.02,lin(0x55595c),METAL(.4));
 // The ellipsoid's shell from its top down past the waist, round the back: smooth normals outside and in.
 const C=F(0,-.02,1.84),ra=.43,rb=.42,rc=.56,T=16,Pn=8,t0=1.3,t1=2*Math.PI-1.3;
 for(const [k,col,sgn] of [[1,c,1],[.965,inner,-1]]){
  const base=K.size;
  for(let j=0;j<=Pn;j++)for(let i=0;i<=T;i++){const th=t0+(t1-t0)*i/T,ph=.04+(1.5+.95*(1-Math.cos(th))/2-.04)*j/Pn,sp=Math.sin(ph),l=[sp*Math.sin(th),-sp*Math.cos(th),Math.cos(ph)];
   const p=add(C,add(add(scale(Ax,l[0]*ra*k),scale(Bx,l[1]*rb*k)),[0,0,l[2]*rc*k])),n=unit(add(add(scale(Ax,l[0]/ra),scale(Bx,l[1]/rb)),[0,0,l[2]/rc]));K.v(p,scale(n,sgn),col,WHITE,METAL(.12));}
  // Wound to face out of the shell (inside: into it), checked on the first cell.
  const at=(i,j)=>base+j*(T+1)+i,P=q=>[K.p[q*3],-K.p[q*3+2],K.p[q*3+1]],a=P(at(0,1)),b=P(at(1,1)),d=P(at(0,2)),out=sub(a,C),flip=dot(cross(sub(b,a),sub(d,a)),out)*sgn<0;
  for(let j=0;j<Pn;j++)for(let i=0;i<T;i++){const q=[at(i,j),at(i+1,j),at(i+1,j+1),at(i,j+1)];flip?K.i.push(q[0],q[2],q[1],q[0],q[3],q[2]):K.i.push(q[0],q[1],q[2],q[0],q[2],q[3]);}
 }
 K.box(F,-.11,.11,.2,.3,1.45,1.8,lin(0x2a2c2e),PLAIN,{bottom:true});K.box(F,-.03,.03,.12,.2,1.62,1.74,lin(0x111213),PLAIN,{bottom:true});
}

function furnitureMaterial(atlas,plates,uniforms){
 const m=new THREE.MeshStandardMaterial({name:'Mobiliario_urbano',vertexColors:true,map:atlas,roughness:.86,metalness:0});
 m.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms,{plateMap:{value:plates}});
  // Cables: both vertices of a point sit on the cable's line; here they move apart across the view, never thinner than
  // about a pixel nearby (less far off, where many cables would otherwise read as a hatching), lit as if facing the eye.
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute vec4 look;varying vec4 vLook;uniform float uPixel;`).replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
vLook=look;vec3 wireShift=vec3(0.);
if(look.w>.999){
 vec3 wt=normalize(normal),toEye=cameraPosition-position;float eye=length(toEye);
 vec3 sd=cross(wt,toEye);float sl=length(sd);sd=sl>1e-6?sd/sl:vec3(0.,1.,0.);
 float pixel=eye*uPixel/projectionMatrix[1][1];
 wireShift=sd*max(look.x*.03,pixel*mix(.55,.28,smoothstep(60.,420.,eye)))*(look.y*2.-1.);
 vec3 facing=toEye-wt*dot(toEye,wt);objectNormal=dot(facing,facing)>1e-8?normalize(facing):vec3(0.,1.,0.);
 vLook=vec4(.3,0.,0.,0.);
}`).replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed+=wireShift;');
  // Two atlases (the names at u > 1), metal and roughness from the look, and the glow: lamps, posters and kiosks after
  // dark, the amber lenses blinking day and night, each junction on its own beat.
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec4 vLook;uniform float uTime,uNight;uniform sampler2D plateMap;`).replace('#include <map_fragment>',`vec4 atlasA=texture2D(map,vMapUv),atlasB=texture2D(plateMap,vec2(vMapUv.x-1.,vMapUv.y));
diffuseColor*=vMapUv.x>1.?atlasB:atlasA;`).replace('#include <roughnessmap_fragment>','float roughnessFactor=mix(roughness,.34,vLook.x);')
   .replace('#include <metalnessmap_fragment>','float metalnessFactor=vLook.x*.8;').replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
float glowOn=vLook.z>.002?(1.-smoothstep(.46,.5,fract(uTime*(.82+vLook.w*.3)+vLook.z)))*mix(10.,5.,uNight):uNight*14.;
totalEmissiveRadiance+=diffuseColor.rgb*vLook.y*glowOn;`);
 };
 m.customProgramCacheKey=()=>'city-furniture-v1';
 return m;
}

export async function createCityFurniture(data,{mobile=false,lean=false,ground=null,map=null}={}){
 const root=new THREE.Group();root.name='Mobiliario_urbano';root.userData.noReflection=true;
 const city=data.scenery?.city;if(!city)return {root,stats:{}};
 const started=performance.now(),light=mobile||lean,fine=!light,A=data.samples,L=data.meta.reconstructed_xy_m;
 const cols=t=>Object.fromEntries(t.columns.map((k,i)=>[k,i]));
 const gz=(x,y)=>{const z=ground?.(x,y);return Number.isFinite(z)?z:null;};
 const surface=(x,y)=>map?map.at(x,y):null;
 const clearance=clearanceIndex(data),buildings=buildingIndex(data),occ=new Occupancy(6);
 const skipped={poleRace:0,poleGround:0,plateSpot:0,plateGround:0,approach:0,shelter:0},where={};
 const stats={skipped,where,poles:0,trackPoles:0,lapPoles:0,spans:0,cables:0,drops:0,transformers:0,signals:0,signalPosts:0,signalHeads:0,trackSignals:0,shelters:0,trackShelters:0,busSigns:0,plates:0,
  bins:0,hydrants:0,bollards:0,parkingSigns:0,bikeRacks:0,benches:0,kiosks:0,orelhoes:0,chunks:0,meshes:0,triangles:0,vertices:0,shown:0,mobile,lean};
 // The lap's wall gap at sample i (from the asphalt edge to the wall's face), on the side of (x, y).
 const gapAt=(i,x,y)=>{const p=A[i];if(!p)return .6;const side=(x-p[1])*p[9]+(y-p[2])*p[10];const g=side>0?p[16]:p[15];return Number.isFinite(g)?g:.6;};
 // Clear of the race: behind the wall's back (face + 0.75 m) by `keep`, off the pit lane, stands and bridge sides by r.
 const raceClear=(x,y,r,keep=.8)=>{const c=clearance(x,y);if(c.distance<=r)return false;if(c.band==='pista')return c.distance>gapAt(c.i,x,y)+.75+keep+r;return true;};
 const sidewalk=(x,y)=>{const d=surface(x,y);return !!d&&d.road>.2&&d.cycleway>.1&&(d.sidewalk<-.05||d.plaza<-.05);};
 // The seafront promenades belong to beira-mar.js: the small things keep off the coast.
 const coastSegs=[];for(const line of city.coast??[])for(let i=0;i+1<line.length;i++)coastSegs.push([line[i][0],line[i][1],line[i+1][0],line[i+1][1]]);
 const coastGrid=new Map();coastSegs.forEach((s,k)=>{for(let i=Math.floor((Math.min(s[0],s[2])-40)/40);i<=Math.floor((Math.max(s[0],s[2])+40)/40);i++)for(let j=Math.floor((Math.min(s[1],s[3])-40)/40);j<=Math.floor((Math.max(s[1],s[3])+40)/40);j++){const key=i*100003+j;let a=coastGrid.get(key);if(!a)coastGrid.set(key,a=[]);a.push(k);}});
 const nearCoast=(x,y,r)=>{for(const k of coastGrid.get(Math.floor(x/40)*100003+Math.floor(y/40))??[]){const [ax,ay,bx,by]=coastSegs[k],dx=bx-ax,dy=by-ay;let u=((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1e-9);u=u<0?0:u>1?1:u;if(Math.hypot(x-ax-u*dx,y-ay-u*dy)<r)return true;}return false;};
 // Nearest lap station (for the road height under a span and the lap's furniture).
 const sampleGrid=new Map();A.forEach((p,i)=>{const key=Math.floor(p[1]/25)*100003+Math.floor(p[2]/25);let a=sampleGrid.get(key);if(!a)sampleGrid.set(key,a=[]);a.push(i);});
 const nearestSample=(x,y)=>{let best=Infinity,bi=-1;const gi=Math.floor(x/25),gj=Math.floor(y/25);for(let i=gi-2;i<=gi+2;i++)for(let j=gj-2;j<=gj+2;j++)for(const k of sampleGrid.get(i*100003+j)??[]){const d=Math.hypot(A[k][1]-x,A[k][2]-y);if(d<best){best=d;bi=k;}}return {i:bi,d:best};};
 const station=s=>{s=((s%L)+L)%L;let lo=0,hi=A.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(A[m][0]<=s)lo=m;else hi=m-1;}return lo;};

 // Where the checks look: the first of each kind placed within 120 m of the lap.
 const note=(kind,x,y,extra=[])=>{if(where[kind])return;const n=nearestSample(x,y);if(n.d<120)where[kind]=[+x.toFixed(2),+y.toFixed(2),...extra.map(v=>+v.toFixed(3)),n.i];};
 // What was there before: barriers at the closures, parked cars, crosswalks, the street trees, the trackside furniture.
 for(const b of city.closures??[])occ.add(b.x,b.y,8);
 if(city.parked){for(const [x,y,h] of city.parked.items)for(const a of [-1.45,0,1.45])occ.add(x+Math.cos(h)*a,y+Math.sin(h)*a,1.95);}
 const crossings=city.crossings?.items??[];
 for(const [x,y,h,w] of crossings){const nx=-Math.sin(h),ny=Math.cos(h);for(let d=-w/2-1;d<=w/2+1.01;d+=1.2)occ.add(x+nx*d,y+ny*d,1.3);}
 for(const [x,y] of data.scenery.trees?.items??[])occ.add(x,y,.7);
 // The billboards and TV towers stand tall too: no cable runs through them (tall: [x, y, r]).
 const tall=[];
 try{
  for(const q of billboardSpots(data)){occ.add(q.x,q.y,9);tall.push([q.x,q.y,8.5]);}for(const q of marshalSpots(data))occ.add(q.x,q.y,4);for(const q of towerSpots(data)){occ.add(q.x,q.y,6);tall.push([q.x,q.y,5]);}
  for(const q of flagSpots(data))if(Number.isFinite(q.x)&&Number.isFinite(q.y))occ.add(q.x,q.y,1.5);
 }catch(e){console.warn('Mobiliário: pontos da pista indisponíveis',e);}

 // Chunks: 400 m tiles for the poles, cables, lights, shelters and kiosks (shown out to FAR_BIG); the small things
 // apart in the same tiles, shown out to FAR_SMALL.
 const chunks=new Map();
 const kit=(layer,x,y)=>{const key=`${layer}:${Math.floor(x/CHUNK)}:${Math.floor(y/CHUNK)}`;let c=chunks.get(key);if(!c){c={layer,kit:new Kit()};chunks.set(key,c);}return c.kit;};
 const clearings=[];

 // --- Utility poles and their lines. A line (the poles one cable run joins) shares its style.
 const PC=cols(city.poles),items=city.poles.items,wires=city.poles.wires??[],parent=items.map((_,i)=>i),findRoot=i=>{while(parent[i]!==i)i=parent[i]=parent[parent[i]];return i;};
 for(const [i,j] of wires)if(items[i]&&items[j])parent[findRoot(i)]=findRoot(j);
 const degree=new Uint8Array(items.length);for(const [i,j] of wires){degree[i]++;degree[j]++;}
 const styles=new Map(),styleOf=i=>{const r=i<0?i:findRoot(i);if(!styles.has(r)){const R=random(31337+r*977>>>0),q=R();
  styles.set(r,{pri:q<.5?'cross':q<.82?'compact':'none',sec:R()<.62?'multi':'rack',tel:light?1:[1,2,2,3,3,3,4,4][Math.floor(R()*8)],arm:R()<.5?'wood':'concrete',ins:R()<.55?'porcelain':'polymer'});}return styles.get(r);};
 const slots=new Array(items.length).fill(null);
 items.forEach((it,k)=>{
  let x=it[PC.x],y=it[PC.y];const h=it[PC.heading],track=it[PC.track];
  // A pole on the lap's sidewalk stands behind the wall's back: moved away from the street if the data has it closer.
  if(!raceClear(x,y,.25,.5)){let ok=false;for(let d=.25;d<=3&&!ok;d+=.25){const nx=x-Math.cos(h)*d,ny=y-Math.sin(h)*d;if(raceClear(nx,ny,.25,.5)){x=nx;y=ny;ok=true;}}if(!ok){skipped.poleRace++;return;}}
  const z=gz(x,y);if(z===null){skipped.poleGround++;return;}
  const R=random(7001+k*7919),st=degree[k]?styleOf(k):{pri:'none',sec:'multi',tel:light?0:Math.floor(R()*2),arm:'wood',ins:'polymer'};
  const K=kit('big',x,y);slots[k]=utilityPole(K,{x,y,z,h},st,R,fine);if(slots[k].trafo)stats.transformers++;
  occ.add(x,y,.6);stats.poles++;if(track)stats.trackPoles++;note(track?'trackPole':'pole',x,y,[h]);
 });
 // The lap's own streets have their lines too: poles on its sidewalks behind the walls every 32-40 m where there is
 // room, on one side or both by stretch, joined into lines; none on the bridges, the seafront or by the data's own.
 const lapWires=[],dataLap=items.filter(it=>it[PC.track]).map(it=>[it[PC.x],it[PC.y]]);
 if(map)for(const side of [-1,1]){
  let prev=null,st=null,misses=0;const RL=random(side>0?8123:9157);
  for(let s=6+RL()*10;s<L-4;){
   const i=station(s),p=A[i],want=random(Math.floor(s/240)*131+(side+1)*7)()<.62;let placed=null;
   if(want){const tl=Math.hypot(p[7],p[8]),tx=p[7]/tl,ty=p[8]/tl,lx=-ty*side,ly=tx*side,gap=side<0?p[15]:p[16],d0=p[4]/2+(Number.isFinite(gap)?gap:.6)+.75+.85;
    // Off the road and the cycleway (sidewalk, lawn or square), behind the wall's back, clear of what stands there.
    for(let d=d0;d<d0+3&&!placed;d+=.25){const x=p[1]+lx*d,y=p[2]+ly*d,q=surface(x,y);if(!q||q.road<.25||q.cycleway<.05)continue;
     if(!raceClear(x,y,.3,.6)||!occ.free(x,y,.9)||buildings.inside(x,y,.3)||nearCoast(x,y,30)||dataLap.some(([a,b])=>Math.hypot(a-x,b-y)<18))continue;
     const z=gz(x,y);if(z!==null)placed={x,y,z,h:Math.atan2(-ly,-lx)};}}
   if(!placed){if(++misses>3){prev=null;misses=0;}s+=4;continue;}
   if(!prev)st={...styleOf(-1-Math.floor(s)),pri:RL()<.55?'cross':RL()<.7?'compact':'none'};
   const k=slots.length,R=random(5003+k*7919);slots.push(utilityPole(kit('big',placed.x,placed.y),placed,st,R,fine));if(slots[k].trafo)stats.transformers++;
   occ.add(placed.x,placed.y,.6);stats.poles++;stats.lapPoles++;note('lapPole',placed.x,placed.y,[placed.h]);
   if(prev!==null&&Math.hypot(slots[prev].at[0]-placed.x,slots[prev].at[1]-placed.y)<50)lapWires.push([prev,k]);
   prev=k;misses=0;s+=32+RL()*8;
  }
 }
 const throughTall=(a,b)=>tall.some(([x,y,r])=>{const dx=b[0]-a[0],dy=b[1]-a[1];let u=((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1e-9);u=u<0?0:u>1?1:u;return Math.hypot(x-a[0]-u*dx,y-a[1]-u*dy)<r;});
 // Transformer leads up to the line, then the spans.
 for(const s of slots)if(s?.trafo){const K=kit('big',...s.at),up=s.pri??s.msg?.ph;if(up)for(let i=0;i<3;i++){const a=s.trafo[i],b=up[i];K.wire([a,lerp3(a,b,.5).map((v,k)=>k===2?v+.05:v),b],.004,CABLE.dark);}}
 for(const [i,j] of [...wires,...lapWires]){
  const a=slots[i],b=slots[j];if(!a||!b)continue;
  if(throughTall(a.at,b.at))continue;
  // The lowest a cable may hang: 4.6 m over the sidewalk, 5.6 m over the race track where the span crosses it; a span
  // over a bridge's side is no span.
  let skip=false;const floors=[.25,.5,.75].map(t=>{const x=a.at[0]+(b.at[0]-a.at[0])*t,y=a.at[1]+(b.at[1]-a.at[1])*t,c=clearance(x,y),g=gz(x,y)??0;
   if(c.band==='ponte'&&c.distance<1)skip=true;let f=g+4.6;if(c.band==='pista'&&c.distance<gapAt(c.i,x,y)+1.2){const n=nearestSample(x,y);if(n.i>=0)f=Math.max(f,A[n.i][3]+5.6);}return f;});
  if(skip)continue;const floor=t=>t<.375?floors[0]:t<.625?floors[1]:floors[2];
  const K=kit('big',...a.at),R=random(99991+i*31+j*7);stats.cables+=cables(K,a,b,R,fine,floor);stats.spans++;
 }
 // Service drops to the facades, the "ramais" every Brazilian street is laced with (and a fibre drop here and there).
 if(fine)slots.forEach((s,k)=>{
  if(!s)return;const R=random(4441+k*131),want=R()<.6?(R()<.35?2:1):0;if(!want)return;
  const taken=[];
  for(const f of buildings.facades(s.at[0],s.at[1],22)){
   if(taken.length>=want)break;if(f.d<2.5||f.h<3.4)continue;const ang=Math.atan2(f.y-s.at[1],f.x-s.at[0]);if(taken.some(a=>Math.abs(((ang-a+9.42)%6.283)-3.14)<.6))continue;
   let ok=true;for(const t of [.25,.5,.75]){const x=s.at[0]+(f.x-s.at[0])*t,y=s.at[1]+(f.y-s.at[1])*t,c=clearance(x,y);if(c.distance<1.5||c.band==='pista'&&c.distance<gapAt(c.i,x,y)+1.5){ok=false;break;}}
   if(!ok||throughTall(s.at,[f.x,f.y]))continue;const g=gz(f.x,f.y);if(g===null)continue;
   const end=[f.x+(s.at[0]-f.x)/f.d*.05,f.y+(s.at[1]-f.y)/f.d*.05,g+Math.min(f.h-.4,3+R()*2.3)],from=R()<.25&&s.tel.length?s.tel[0]:s.drop,K=kit('big',...s.at);
   K.wire(span(from,end,(.12+R()*.3)*(f.d/14)**2,fine?7:4),.004,R()<.28?CABLE.white:CABLE.black);taken.push(ang);stats.drops++;
  }
 });

 // --- Traffic lights at the real junctions, blinking amber for the event: a post on the right-hand curb of each
 // approach, a cantilever over the lanes on the wide streets, the head facing the traffic.
 const SC=cols(city.signals);
 city.signals.items.forEach((it,k)=>{
  const x=it[SC.x],y=it[SC.y],h=it[SC.heading],w=it[SC.width],R=random(2203+k*613),beat=[.004+R()*.99,R()*.9];stats.signals++;
  for(const sg of it[SC.oneway]?[1]:[1,-1]){
   const tx=Math.cos(h)*sg,ty=Math.sin(h)*sg,rx=ty,ry=-tx;let spot=null;
   search:for(let back=5;back<=22;back+=1)for(let lat=w/2-1.5;lat<=w/2+2.5;lat+=.3){
    const px=x-tx*back+rx*lat,py=y-ty*back+ry*lat,d=surface(px,py);if(!d||d.road<.3||d.road>1.4||d.cycleway<.1)continue;
    if(!raceClear(px,py,.4)||!occ.free(px,py,.35)||buildings.inside(px,py,.4))continue;spot={x:px,y:py,lat};break search;
   }
   if(!spot){skipped.approach++;continue;}const z=gz(spot.x,spot.y);if(z===null)continue;
   const wide=w>=10&&R()<.88,target=it[SC.oneway]?w*.1:w*.25,arm=wide?Math.max(2.6,Math.min(8,spot.lat-target)):0;
   const heads=wide?(w>=15?[arm*.5,arm*.92]:[arm*.88]):[];
   signalPost(kit('big',spot.x,spot.y),{x:spot.x,y:spot.y,z,dir:[-rx,-ry],face:[-tx,-ty],arm,zArm:6.05+R()*.4,at:heads,repeat:wide&&R()<.7,beat,ped:fine&&R()<.45?[-rx,-ry]:null},R,fine);
   occ.add(spot.x,spot.y,.6);stats.signalPosts++;note('signal',spot.x,spot.y,[-tx,-ty,w,-rx,-ry]);stats.signalHeads+=(heads.length||1);
  }
 });
 // On the lap: where the real street has its lights, a post behind the wall and its arm over the race track, the head
 // 5.5 m and more over the asphalt, facing the cars that come.
 for(const s0 of city.track?.signals??[]){
  let done=false;const R=random(8807+Math.round(s0)),beat=[.004+R()*.99,R()*.9];
  for(const side of [-1,1]){if(done)break;for(const shift of [0,4,-4,8,-8,12,-12,16,-16]){
   const i=station(s0+shift),p=A[i],t=[p[7],p[8]],tl=Math.hypot(...t),tx=t[0]/tl,ty=t[1]/tl,lx=-ty*side,ly=tx*side,gap=side<0?p[15]:p[16];
   let spot=null;for(let d=p[4]/2+(Number.isFinite(gap)?gap:.6)+.75+1.4;d<p[4]/2+9;d+=.3){const x=p[1]+lx*d,y=p[2]+ly*d,q=surface(x,y);if(q&&q.road<.3)continue;if(!raceClear(x,y,.4,1.2)||!occ.free(x,y,.5)||buildings.inside(x,y,.4))continue;spot={x,y,d};break;}
   if(!spot)continue;const z=gz(spot.x,spot.y);if(z===null)continue;const zArm=p[3]+7.05-z;if(zArm<4.5||zArm>11)continue;
   const arm=Math.max(3,spot.d-p[4]*.24),heads=p[4]>=12?[arm*.62,arm*.97]:[arm*.95];
   signalPost(kit('big',spot.x,spot.y),{x:spot.x,y:spot.y,z,dir:[-lx,-ly],face:[-tx,-ty],arm,zArm,at:heads,repeat:true,beat,ped:fine&&R()<.6?[-lx,-ly]:null},R,fine);
   occ.add(spot.x,spot.y,.7);clearings.push({x:spot.x,y:spot.y,r:2.5});stats.trackSignals++;note('trackSignal',spot.x,spot.y,[i]);stats.signalPosts++;stats.signalHeads+=heads.length+1;done=true;break;
  }}
 }

 // --- Bus shelters on the sidewalk, open toward the road; where the sidewalk is narrow, a narrow one or just the sign.
 const placeShelter=(x,y,h,R,toward=null)=>{
  let ax=Math.cos(h),ay=Math.sin(h),bx=-ay,by=ax;
  if(toward){bx=toward[0];by=toward[1];}else{const p=surface(x+bx*1.5,y+by*1.5),q=surface(x-bx*1.5,y-by*1.5);if(!p||!q)return false;if(q.road<p.road){bx=-bx;by=-by;}}
  // A right-handed frame (a, b, up): the posters read the right way round.
  if(ax*by-ay*bx<0){ax=-ax;ay=-ay;}
  const d0=surface(x,y)?.road??1;
  for(const narrow of [false,true]){
   const D=narrow?1.05:1.62,back=.55+D;
   for(const slide of [0,2.5,-2.5,5,-5]){
    // The back line `back` metres from the curb (the curb is d0 metres from (x, y) toward the road).
    const ox=x+ax*slide-bx*(back-d0),oy=y+ay*slide-by*(back-d0),Lh=narrow?1.6:2.6,pts=[];
    for(const a of [-Lh,0,Lh])for(const b of [.05,D/2,D+.1])pts.push([ox+ax*a+bx*b,oy+ay*a+by*b]);
    if(!pts.every(([px,py])=>{const q=surface(px,py);return q&&q.road>.15&&q.cycleway>.05;}))continue;
    if(!pts.every(([px,py])=>!buildings.inside(px,py,.2)&&raceClear(px,py,.2,.6)&&occ.free(px,py,.35)))continue;
    const z=Math.min(...pts.map(([px,py])=>gz(px,py)??Infinity));if(!Number.isFinite(z))continue;
    const F=(a,b,w)=>[ox+ax*a+bx*b,oy+ay*a+by*b,z+w];busShelter(kit('big',ox,oy),F,R,fine,narrow);
    // The stop's sign by the curb, ahead of the shelter (or behind it).
    for(const e of [-1,1]){const sx=ox+e*ax*(Lh+.9)+bx*(back-.45),sy=oy+e*ay*(Lh+.9)+by*(back-.45);
     if(sidewalk(sx,sy)&&occ.free(sx,sy,.4)&&raceClear(sx,sy,.2)&&!buildings.inside(sx,sy,.2)){busSign(kit('small',sx,sy),sx,sy,gz(sx,sy)??z,[-ax,-ay]);occ.add(sx,sy,.4);stats.busSigns++;break;}}
    for(const [px,py] of pts)occ.add(px,py,.5);clearings.push({x:ox+bx*D/2,y:oy+by*D/2,r:3.2});note('shelter',ox,oy,[ax,ay,bx,by]);
    return true;
   }
  }
  // No room: the sign alone at the curb.
  skipped.shelter++;
  const sx=x+bx*(d0-.45),sy=y+by*(d0-.45),sz=gz(sx,sy);if(sz!==null&&sidewalk(sx,sy)&&occ.free(sx,sy,.4)&&raceClear(sx,sy,.2)){busSign(kit('small',sx,sy),sx,sy,sz,[-ax,-ay]);occ.add(sx,sy,.4);stats.busSigns++;}
  return false;
 };
 (city.stops?.items??[]).forEach(([x,y,h],k)=>{if(placeShelter(x,y,h,random(6151+k*37)))stats.shelters++;});
 // The lap's stops on the side the data gives (track.stop_sides: the real stop's side), the other if there is no room.
 for(const [k,s0] of (city.track?.stops??[]).entries()){
  let placed=false;
  for(const side of city.track.stop_sides?.[k]===1?[1,-1]:[-1,1]){if(placed)break;for(const shift of [0,6,-6,12,-12]){
   const i=station(s0+shift),p=A[i],tl=Math.hypot(p[7],p[8]),tx=p[7]/tl,ty=p[8]/tl,lx=-ty*side,ly=tx*side,gap=side<0?p[15]:p[16];
   for(let d=p[4]/2+(Number.isFinite(gap)?gap:.6)+.75+1.0;d<p[4]/2+7&&!placed;d+=.5){const x=p[1]+lx*(d+.8),y=p[2]+ly*(d+.8);if(!sidewalk(x,y))continue;
    if(placeShelter(x,y,Math.atan2(ty,tx),random(9157+i),[-lx,-ly])){placed=true;stats.shelters++;stats.trackShelters++;}}
   if(placed)break;
  }}
 }

 // --- Street-name plates at the corners: each plate along its own street (found by name near the corner).
 const streetsByName=new Map();for(const st of city.streets??[])if(st.name){let l=streetsByName.get(st.name);if(!l)streetsByName.set(st.name,l=[]);l.push(st);}
 const streetDir=(name,x,y)=>{let best=40,dir=null;for(const st of streetsByName.get(name)??[]){const P=st.points;for(let i=0;i+1<P.length;i++){const ax=P[i][0],ay=P[i][1],dx=P[i+1][0]-ax,dy=P[i+1][1]-ay;let u=((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1e-9);u=u<0?0:u>1?1:u;const d=Math.hypot(x-ax-u*dx,y-ay-u*dy);if(d<best){best=d;const l=Math.hypot(dx,dy)||1;dir=[dx/l,dy/l];}}}
  if(!dir){const n=nearestSample(x,y);if(n.i>=0&&n.d<40){const p=A[n.i],l=Math.hypot(p[7],p[8]);dir=[p[7]/l,p[8]/l];}}return dir;};
 const names=[],cellOf=new Map(),cell=(name,x)=>{if(!cellOf.has(name)&&names.length<PLATE_COLS*16){cellOf.set(name,names.length);names.push({label:plateName(name),bairro:x<-300?'Estreito':'Centro'});}return cellOf.get(name);};
 const PL=cols(city.plates);
 city.plates.items.forEach((it,k)=>{
  const x=it[PL.x],y=it[PL.y],R=random(5507+k*53);if(!occ.free(x,y,.3)||!raceClear(x,y,.2)||buildings.inside(x,y,.2)){skipped.plateSpot++;return;}const z=gz(x,y);if(z===null){skipped.plateGround++;return;}
  const a=it[PL.name_a],b=it[PL.name_b],ca=cell(a,x),cb=cell(b,x);if(ca===undefined||cb===undefined)return;
  let da=streetDir(a,x,y),db=streetDir(b,x,y);const h=it[PL.heading];da??=[Math.cos(h+Math.PI/4),Math.sin(h+Math.PI/4)];db??=[-da[1],da[0]];
  namePlates(kit('small',x,y),x,y,z,da,db,ca,cb,R);occ.add(x,y,.4);stats.plates++;note('plate',x,y);
 });

 // --- The small things along the curbs of the side streets: denser near the lap (seen from the race), sparse far off.
 const R=random(424242),take=(x,y,r)=>occ.add(x,y,r);
 const placeable=(x,y,r)=>occ.free(x,y,r)&&raceClear(x,y,r,.6)&&!buildings.inside(x,y,.3)&&!nearCoast(x,y,32);
 const smallItem=(type,x,y,h,toward,face)=>{
  const z=gz(x,y);if(z===null)return false;const F=frame(x,y,z,h),K=kit('small',x,y),Q=random(Math.floor(x*73+y*131)>>>0);
  if(type==='bin'){litterBin(K,F,Q);take(x,y,.5);stats.bins++;}
  else if(type==='hydrant'){hydrant(K,F,Q);take(x,y,.5);stats.hydrants++;}
  else if(type==='sign'){parkingSign(K,F,Q,face);take(x,y,.4);stats.parkingSigns++;}
  else if(type==='rack'){bikeRack(K,F,Q);take(x,y,1.8);stats.bikeRacks++;}
  note(type,x,y,toward);return true;
 };
 const roads=(city.streets??[]).filter(st=>!/motorway|service|busway/.test(st.kind)&&st.points.length>1);
 let kioskCount=0,orelhaoCount=0;const kioskSpots=[],orelhaoSpots=[];
 for(const st of roads){
  const P=st.points,seg=[];let total=0;for(let i=0;i+1<P.length;i++){const l=Math.hypot(P[i+1][0]-P[i][0],P[i+1][1]-P[i][1]);seg.push(l);total+=l;}
  const at=u=>{let i=0;while(i<seg.length-1&&u>seg[i]){u-=seg[i];i++;}const t=Math.min(1,u/(seg[i]||1)),a=P[i],b=P[i+1],dx=(b[0]-a[0])/(seg[i]||1),dy=(b[1]-a[1])/(seg[i]||1);return {x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,w:a[2]+(b[2]-a[2])*t,dx,dy};};
  for(const side of [-1,1]){
   for(let u=4+R()*12;u<total-3;u+=(light?26:9)+R()*(light?30:14)){
    const q=at(u),nx=-q.dy*side,ny=q.dx*side;let x=q.x+nx*(q.w/2+.5),y=q.y+ny*(q.w/2+.5),d=surface(x,y);if(!d)continue;
    // Onto the strip by the curb: 0.35-0.8 m off the road, on the sidewalk.
    if(d.road<.35||d.road>.8){const shift=.55-d.road;x+=nx*shift;y+=ny*shift;d=surface(x,y);if(!d||d.road<.3||d.road>.9)continue;}
    if(!(d.sidewalk<-.05||d.plaza<-.05))continue;
    const ns=nearestSample(x,y),near=ns.d<180?1:ns.d<320?.45:.18,deep=surface(x+nx*1.4,y+ny*1.4),wideWalk=deep&&(deep.sidewalk<-.05||deep.plaza<-.05)&&deep.road>1.6;
    const roll=R()/near/(light?.35:1);
    // Traffic on this curb's side runs along -side·t (right-hand traffic): signs face it.
    const face=st.oneway?[-q.dx,-q.dy]:[q.dx*side,q.dy*side];
    let type=roll<.2?'bin':roll<.27?'sign':roll<.295?'hydrant':roll<.31&&wideWalk?'rack':null;
    if(fine&&wideWalk&&ns.d<300&&R()<.09){
     // A kiosk or a phone shell on a wide sidewalk, far enough from the others of its kind.
     const ox=x+nx*1.9,oy=y+ny*1.9;
     if(kioskCount<6&&kioskSpots.every(p=>Math.hypot(p[0]-ox,p[1]-oy)>140)&&placeable(ox,oy,2.4)&&[[-1.5,0],[1.5,0],[-1.5,1.9],[1.5,1.9]].every(([a,b])=>sidewalk(ox+q.dx*a-nx*b,oy+q.dy*a-ny*b))){
      const z=gz(ox,oy);if(z!==null){kiosk(kit('big',ox,oy),frame(ox,oy,z,Math.atan2(q.dy,q.dx)+(side>0?Math.PI:0)),random(kioskCount*71+3),kioskCount);take(ox,oy,2.6);kioskSpots.push([ox,oy]);note('kiosk',ox,oy,[-nx,-ny]);clearings.push({x:ox,y:oy,r:3.5});kioskCount++;stats.kiosks++;continue;}
     }
     if(orelhaoCount<5&&orelhaoSpots.every(p=>Math.hypot(p[0]-x,p[1]-y)>160)&&placeable(x+nx*.35,y+ny*.35,.9)){
      const z=gz(x,y);if(z!==null){const ox=x+nx*.35,oy=y+ny*.35;orelhao(kit('small',ox,oy),frame(ox,oy,z,Math.atan2(-ny,-nx)-Math.PI/2),random(orelhaoCount*17+5));take(ox,oy,1);orelhaoSpots.push([x,y]);note('orelhao',ox,oy,[-nx,-ny]);orelhaoCount++;stats.orelhoes++;continue;}
     }
    }
    if(!type||!placeable(x,y,type==='rack'?1.6:.5))continue;
    // A rack runs along the curb, set back off it.
    if(type==='rack'){x+=nx*.9;y+=ny*.9;if(!sidewalk(x,y)||!placeable(x,y,1.6))continue;}
    smallItem(type,x,y,Math.atan2(q.dy,q.dx),[nx,ny],face);
   }
  }
 }
 // Bollards at some street corners: a short row along the curb either side of the crossing's ramp.
 if(!lean)crossings.forEach(([x,y,h,w],k)=>{
  const Q=random(1777+k*29);if(Q()>.3)return;const nx=-Math.sin(h),ny=Math.cos(h),tx=Math.cos(h),ty=Math.sin(h),kind=pick(Q,['concrete','concrete','steel','yellow']);
  for(const end of [-1,1])for(const along of [-1,1]){if(Q()<.4)continue;
   for(let j=0;j<2+Math.floor(Q()*3);j++){const a=along*(2.6+j*1.25),bx=x+nx*end*(w/2+.45)+tx*a,by=y+ny*end*(w/2+.45)+ty*a,d=surface(bx,by);
    if(!d||d.road<.3||d.road>.8||!(d.sidewalk<-.05||d.plaza<-.05))break;if(!occ.free(bx,by,.25)||!raceClear(bx,by,.2)||buildings.inside(bx,by,.2))break;
    const z=gz(bx,by);if(z===null)break;bollard(kit('small',bx,by),frame(bx,by,z,h),Q,kind);occ.add(bx,by,.25);stats.bollards++;note('bollard',bx,by,[-nx*end,-ny*end]);}}
 });
 // Behind the lap's walls the city goes on: bins, hydrants, signs and a bike rack on its sidewalks, seen from the race.
 for(let s=R()*20;s<L;s+=(light?60:22)+R()*(light?60:30)){
  const i=station(s),p=A[i];for(const side of [-1,1]){
   if(R()<.45)continue;const tl=Math.hypot(p[7],p[8]),tx=p[7]/tl,ty=p[8]/tl,lx=-ty*side,ly=tx*side,gap=side<0?p[15]:p[16],d=p[4]/2+(Number.isFinite(gap)?gap:.6)+.75+1.2+R()*1.6,x=p[1]+lx*d,y=p[2]+ly*d;
   if(!sidewalk(x,y)||!placeable(x,y,.6))continue;const r=R();
   smallItem(r<.6?'bin':r<.75?'hydrant':r<.95?'sign':'rack',x,y,Math.atan2(ty,tx),[-lx,-ly],[-tx,-ty]);
  }
 }
 // Benches in the squares (not on the seafront, beira-mar.js has those): one each 300 m² or so of paved square,
 // rarer on the lawns.
 if(map){const m=city.map,area=m.width*m.height,n=Math.floor(area/(light?900:120)),Q=random(3301);
  for(let k=0;k<n;k++){
   const x=m.x0+Q()*m.width,y=m.y0+Q()*m.height,d=surface(x,y);if(!d)continue;
   const plaza=d.plaza<-1.6&&d.road>3,green=!plaza&&d.green<-2.2&&d.road>3&&d.sidewalk>.5;if(!plaza&&!(green&&Q()<.25))continue;
   if(Q()>.4||!placeable(x,y,1.4)||nearestSample(x,y).d<12)continue;const z=gz(x,y);if(z===null)continue;
   // Its back to the nearest edge of the square, more or less.
   const e=.8,gx=map.distance(plaza?'plaza':'green',x+e,y)-map.distance(plaza?'plaza':'green',x-e,y),gy=map.distance(plaza?'plaza':'green',x,y+e)-map.distance(plaza?'plaza':'green',x,y-e),h=Math.atan2(gy,gx)+Math.PI/2+(Q()-.5)*.3;
   bench(kit('small',x,y),frame(x,y,z,h),Q);take(x,y,1.4);stats.benches++;note('bench',x,y);
  }}

 // --- The meshes.
 const atlas=canvasTexture(paintAtlas,ATLAS,ATLAS),plates=paintPlates(names);
 const uniforms={uTime:{value:0},uNight:{value:0},uPixel:{value:2/720}},material=furnitureMaterial(atlas,plates,uniforms),meshes=[];
 const reach=light?FAR_LEAN:[FAR_BIG,FAR_SMALL];
 for(const [key,{layer,kit:K}] of chunks){
  if(!K.size)continue;const mesh=new THREE.Mesh(K.geometry(),material);mesh.name=`Mobiliario_${key}`;
  mesh.castShadow=layer==='big';mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;mesh.updateMatrix();
  const far=layer==='big'?reach[0]:reach[1];mesh.userData.box=mesh.geometry.boundingBox;mesh.userData.reach2=far*far;
  root.add(mesh);meshes.push(mesh);stats.meshes++;stats.triangles+=K.i.length/3;stats.vertices+=K.size;if(layer==="small")stats.smallTriangles=(stats.smallTriangles??0)+K.i.length/3;
 }
 stats.chunks=new Set([...chunks.keys()].map(k=>k.split(':').slice(1).join(':'))).size;stats.names=names.length;stats.buildMs=Math.round(performance.now()-started);
 // After dark the ground under each street lamp lies in a soft pool of its light: one additive draw for the city, faded
 // into the fog instead of toward its colour, on the race track's own surface where a lamp reaches over it.
 const lamps=slots.filter(s=>s?.lamp).map(s=>s.lamp),probe=new TestCar(data),pp=[],pc=[],pt=[],pi=[];
 for(const {p,led} of lamps){
  const r=led?9:7,col=led?[1,.95,.86]:[1,.6,.26],n=4,base=pp.length/3;
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){const x=p[0]+(i/n*2-1)*r,y=p[1]+(j/n*2-1)*r,c=clearance(x,y);let z=gz(x,y)??p[2]-7;
   if(c.band==='pista'&&c.distance<.5){const q=nearestSample(x,y);if(q.i>=0){probe.index=q.i;z=Math.max(z,probe.sample(x,y).z);}}
   pp.push(x,z+.06,-y);pc.push(...col);pt.push(i/n,j/n);}
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const a=base+j*(n+1)+i;pi.push(a,a+1,a+n+2,a,a+n+2,a+n+1);}
 }
 let pools=null;
 if(lamps.length){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pp,3));g.setAttribute('color',new THREE.Float32BufferAttribute(pc,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(pt,2));g.setIndex(pi);g.computeBoundingSphere();
  const glow=canvasTexture((ctx,w,h)=>{const gr=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.22,'rgba(255,255,255,.62)');gr.addColorStop(.55,'rgba(255,255,255,.2)');gr.addColorStop(.8,'rgba(255,255,255,.05)');gr.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);ctx.fillStyle=gr;ctx.fillRect(0,0,w,h);},64,64);
  const pm=new THREE.MeshBasicMaterial({name:'Mobiliario_luz_no_chao',map:glow,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  pm.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',`#ifdef USE_FOG
#ifdef FOG_EXP2
 gl_FragColor.rgb*=exp(-fogDensity*fogDensity*vFogDepth*vFogDepth);
#else
 gl_FragColor.rgb*=1.-smoothstep(fogNear,fogFar,vFogDepth);
#endif
#endif`);};
  pm.customProgramCacheKey=()=>'city-furniture-pools-v1';
  pools=new THREE.Mesh(g,pm);pools.name='Mobiliario_luz_no_chao';pools.visible=false;pools.renderOrder=1;pools.matrixAutoUpdate=false;pools.updateMatrix();root.add(pools);
  stats.lampPools=lamps.length;
 }
 root.matrixAutoUpdate=false;
 const frustum=new THREE.Frustum(),view=new THREE.Matrix4();
 return {root,stats,clearings,obstacles:[],
  update(dt,camera){
   uniforms.uTime.value+=dt;uniforms.uPixel.value=2/Math.max(240,innerHeight*Math.min(devicePixelRatio||1,mobile?1:1.5));
   // Each chunk shown within its reach of the camera; counted as drawn when it is in the view too (the stats).
   const c=camera.position;let shown=0,tri=0;view.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(view);
   for(const m of meshes){const b=m.userData.box,dx=Math.max(b.min.x-c.x,0,c.x-b.max.x),dy=Math.max(b.min.y-c.y,0,c.y-b.max.y),dz=Math.max(b.min.z-c.z,0,c.z-b.max.z),v=dx*dx+dy*dy+dz*dz<m.userData.reach2;m.visible=v;
    if(v&&frustum.intersectsSphere(m.geometry.boundingSphere)){shown++;tri+=m.geometry.index.count/3;}}
   stats.shown=shown;stats.shownTriangles=tri;
  },
  setNight(level){uniforms.uNight.value=level;stats.night=level;if(pools){pools.material.opacity=level*.32;pools.visible=level>.02;}}};
}
