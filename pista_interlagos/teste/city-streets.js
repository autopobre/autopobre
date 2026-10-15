import * as THREE from 'three';
import {TestCar,onDeck} from './physics.js';
import {canvasTexture} from './pit-textures.js';
import {carShadowPatch} from './car-shadow.js';
import {ROAD_WEATHER} from './track-surface.js';
import {lampPatch} from './headlights.js';

// The paint and the small things on the asphalt of a real city closed for the race (Floripa, data.scenery.city from
// gerar_cidade_floripa.py): the side streets get the markings of the Brazilian manual (CONTRAN, Manual Brasileiro de
// Sinalização de Trânsito, vol. IV): yellow between opposing flows (dashed LFO-2 on small streets, continuous LFO-1,
// double LFO-3 on the avenues), white dashed lane lines (LMS-2, solid LMS-1 in the last metres before a stop line), white
// edge lines on the expressways, zebra crossings (FTP-1) with their stop lines (LRE) where there are traffic lights,
// PARE on some minor approaches, arrows on multi-lane approaches and ÔNIBUS by the bus stops. On the lap the real
// street's lanes, crossings and stop lines stay, faded and scrubbed where the race cars run. Both get the street's small
// things: manhole covers, storm-drain grates along the curb, patched trenches, sealed cracks and oil where cars wait.
// All of it is decals a couple of centimetres over the ground (the lap's: over the road plane), one material with a
// procedural atlas, merged per 250 m tile (frustum and distance culled). Paint edges, wear and whiteness come from
// world-space noise in the shader, so no two bars or dashes are alike and nothing repeats along a street.

function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
const lin=(hex,k=1)=>{const c=new THREE.Color(hex);return [c.r*k,c.g*k,c.b*k];};
const mixc=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a));
// Tiles (m) for culling, how far (from its nearest edge) a tile is drawn, and the decals' lift over the ground / over the lap's road plane.
const CHUNK=320,SEE=450,SEE_LEAN=300,LIFT=.025,LAP_LIFT=.009;
// Street classes by importance: who yields at a junction (PARE), where the avenues' double yellow goes.
const RANK={motorway:7,trunk:6,primary:5,secondary:4,tertiary:3,residential:2,busway:2,living_street:1,service:1};
const rankOf=kind=>(RANK[kind.replace('_link','')]??1)-(kind.endsWith('_link')?.5:0);
// Paint: fresh and old whites and yellows (Brazilian road yellow is warm, close to orange when it ages).
const WHITE=[lin('#dfddd5'),lin('#b5b3a9')],YELLOW=[lin('#dba629'),lin('#a9853b')];

// The atlas (1024 px, canvas top = the decal's front): a block of solid white for the lines and bars, then the sprites.
const AT=1024,REG={solid:[0,0,64,64],round:[0,1,2,3].map(k=>[64+k*128,0,128,128]),square:[0,1,2].map(k=>[576+k*128,0,128,128]),
 grate:[0,1,2,3].map(k=>[k*256,128,256,112]),patch:[0,1,2,3].map(k=>[k*256,240,256,144]),oil:[0,1,2,3,4,5,6,7].map(k=>[k*128,384,128,128]),
 crack:[0,1,2,3].map(k=>[(k%2)*512,512+(k>>1)*64,512,64]),pare:[[0,640,256,128],[768,640,256,128]],onibus:[256,640,512,128],arrow:[0,1,2,3,4].map(k=>[k*128,768,128,256])};
function drawAtlas(g){
 const r=random(4171);g.clearRect(0,0,AT,AT);
 g.fillStyle='#fff';g.fillRect(...REG.solid);
 const blot=(x,y,rad,rgba)=>{const gr=g.createRadialGradient(x,y,0,x,y,rad);gr.addColorStop(0,rgba);gr.addColorStop(1,rgba.replace(/[\d.]+\)$/,'0)'));g.fillStyle=gr;g.fillRect(x-rad,y-rad,rad*2,rad*2);};
 const specks=(x,y,w,h,n,dark,light)=>{for(let k=0;k<n;k++){g.fillStyle=r()<.5?dark:light;const s=1+r()*2.2;g.fillRect(x+r()*w,y+r()*h,s,s);}};
 // Round covers: steel frame polished by tyres, a cast lid (rings and spokes, studs, a diamond grid, a lettered band),
 // rust blooms, a collar of darker asphalt from when the frame was set.
 REG.round.forEach(([x,y,s],v)=>{
  const cx=x+s/2,cy=y+s/2,R=s/2-6;
  blot(cx,cy,R+5,'rgba(16,16,16,.5)');
  g.fillStyle='#4f4c47';g.beginPath();g.arc(cx,cy,R*.92,0,7);g.fill();
  g.fillStyle=['#2d2b28','#302d2a','#282624','#2f2d2a'][v];g.beginPath();g.arc(cx,cy,R*.8,0,7);g.fill();
  g.save();g.beginPath();g.arc(cx,cy,R*.79,0,7);g.clip();g.strokeStyle='rgba(104,99,91,.5)';g.lineWidth=2.4;
  if(v===0){for(let k=1;k<6;k++){g.beginPath();g.arc(cx,cy,R*.79*k/6,0,7);g.stroke();}for(let k=0;k<12;k++){const t=k*Math.PI/6;g.beginPath();g.moveTo(cx+Math.cos(t)*R*.13,cy+Math.sin(t)*R*.13);g.lineTo(cx+Math.cos(t)*R*.79,cy+Math.sin(t)*R*.79);g.stroke();}}
  else if(v===1){g.fillStyle='rgba(100,95,87,.5)';for(let i=-6;i<=6;i++)for(let j=-6;j<=6;j++)if((i+j)%2===0)g.fillRect(cx+i*8-3,cy+j*8-3,6,6);}
  else if(v===2){for(let k=-12;k<=12;k++){g.beginPath();g.moveTo(cx+k*10-70,cy-70);g.lineTo(cx+k*10+70,cy+70);g.stroke();g.beginPath();g.moveTo(cx+k*10+70,cy-70);g.lineTo(cx+k*10-70,cy+70);g.stroke();}}
  else{for(let k=1;k<4;k++){g.beginPath();g.arc(cx,cy,R*.79*k/4,0,7);g.stroke();}g.fillStyle='#2c2a27';g.fillRect(cx-R*.64,cy-10,R*1.28,20);g.fillStyle='rgba(118,113,104,.75)';g.font='bold 15px Arial,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('ESGOTO',cx,cy+1);}
  for(let k=0;k<12;k++)blot(cx+(r()-.5)*R*1.5,cy+(r()-.5)*R*1.5,4+r()*12,`rgba(${88+r()*25|0},${52+r()*14|0},${30+r()*10|0},${(.06+r()*.12).toFixed(2)})`);
  g.restore();
  g.fillStyle='#141312';for(const t of [.4,3.6])g.fillRect(cx+Math.cos(t)*R*.6-3,cy+Math.sin(t)*R*.6-2,6,4);
 });
 // Square boxes: an iron lid in a concrete frame (chequer plate), a concrete lid with lifting holes, a small valve box.
 REG.square.forEach(([x,y,s],v)=>{
  const m=10,X=x+m,Y=y+m,S=s-2*m;
  g.fillStyle=v===2?'#7d7a73':'#8b8880';g.fillRect(X,Y,S,S);specks(X,Y,S,S,160,'rgba(60,58,54,.5)','rgba(170,166,158,.4)');
  if(v===0){g.fillStyle='#3a3733';g.fillRect(X+9,Y+9,S-18,S-18);g.strokeStyle='rgba(120,114,104,.65)';g.lineWidth=2;for(let i=0;i<10;i++)for(let j=0;j<10;j++){const px=X+15+i*(S-30)/9,py=Y+15+j*(S-30)/9;g.beginPath();if((i+j)%2){g.moveTo(px-3,py-3);g.lineTo(px+3,py+3);}else{g.moveTo(px+3,py-3);g.lineTo(px-3,py+3);}g.stroke();}}
  else if(v===1){g.fillStyle='#75726b';g.fillRect(X+7,Y+7,S-14,S-14);g.strokeStyle='rgba(24,24,24,.75)';g.lineWidth=2.5;g.strokeRect(X+7,Y+7,S-14,S-14);g.fillStyle='#1b1a18';for(const dx of [-.24,.24]){g.beginPath();g.arc(X+S/2+dx*S,Y+S/2,4.5,0,7);g.fill();}}
  else{g.fillStyle='#3d3935';g.beginPath();g.arc(X+S/2,Y+S/2,S*.33,0,7);g.fill();g.strokeStyle='rgba(125,118,108,.6)';g.lineWidth=2;g.beginPath();g.arc(X+S/2,Y+S/2,S*.22,0,7);g.stroke();}
  for(let k=0;k<8;k++)blot(X+r()*S,Y+r()*S,6+r()*14,'rgba(30,28,25,.25)');
 });
 // Storm-drain grates (the curb is along the canvas x): a concrete frame round iron bars across the gutter over a black pit.
 REG.grate.forEach(([x,y,w,h],v)=>{
  const m=6,X=x+m,Y=y+m,W=w-2*m,H=h-2*m;g.fillStyle='#8c8981';g.fillRect(X,Y,W,H);specks(X,Y,W,H,200,'rgba(60,58,54,.5)','rgba(176,172,164,.4)');
  const bx=X+9,by=Y+9,bw=W-18,bh=H-18,bars=[15,19,12,17][v];g.fillStyle='#0b0a09';g.fillRect(bx,by,bw,bh);
  g.fillStyle=['#4b4641','#3f3b37','#544b42','#46423d'][v];for(let k=0;k<=bars;k++)g.fillRect(bx+k*bw/bars-2.6,by,5.2,bh);
  if(v%2)g.fillRect(bx,by+bh/2-2.5,bw,5);
  for(let k=0;k<30;k++){g.fillStyle=`rgba(${70+r()*40|0},${55+r()*25|0},${30+r()*15|0},${(.4+r()*.4).toFixed(2)})`;g.fillRect(bx+r()*bw,by+r()*bh,2+r()*4,2+r()*3);}
  for(let k=0;k<6;k++)blot(X+r()*W,Y+r()*H,8+r()*16,'rgba(110,62,30,.22)');
 });
 // Patches: a saw-cut fresh black one with a sand rim, an old grey one, a hand-filled pothole and one sealed with a tar band.
 REG.patch.forEach(([x,y,w,h],v)=>{
  const m=10,pts=[];
  if(v===2)for(let k=0;k<14;k++){const t=k/14*Math.PI*2,rr=.72+r()*.28;pts.push([x+w/2+Math.cos(t)*(w/2-m)*rr,y+h/2+Math.sin(t)*(h/2-m)*rr]);}
  else for(const [u,q] of [[0,0],[1,0],[1,1],[0,1]])pts.push([x+m+u*(w-2*m)+(r()-.5)*5,y+m+q*(h-2*m)+(r()-.5)*5]);
  g.beginPath();pts.forEach(([px,py],k)=>k?g.lineTo(px,py):g.moveTo(px,py));g.closePath();
  g.fillStyle=['#2a2a2b','#4b4a48','#313130','#2e2e2f'][v];g.fill();
  g.save();g.clip();specks(x,y,w,h,500,'rgba(14,14,14,.22)','rgba(105,103,98,.14)');for(let k=0;k<5;k++)blot(x+r()*w,y+r()*h,15+r()*30,v===1?'rgba(36,36,36,.2)':'rgba(80,78,74,.14)');g.restore();
  g.lineJoin='round';g.strokeStyle=['rgba(112,108,100,.5)','rgba(22,22,22,.65)','rgba(70,68,64,.45)','rgba(14,14,14,.7)'][v];g.lineWidth=[3,4,3,6][v];g.stroke();
 });
 // Oil: a few blots of dark, overlapping stains and drips.
 REG.oil.forEach(([x,y,s],v)=>{const cx=x+s/2,cy=y+s/2;for(let k=0;k<5+v;k++)blot(cx+(r()-.5)*s*.4,cy+(r()-.5)*s*.4,s*(.1+r()*.2),`rgba(6,6,6,${(.22+r()*.25).toFixed(2)})`);for(let k=0;k<8;k++){g.fillStyle='rgba(5,5,5,.5)';g.beginPath();g.arc(cx+(r()-.5)*s*.7,cy+(r()-.5)*s*.7,1+r()*2.5,0,7);g.fill();}});
 // Cracks along the canvas x: two raw (thin, branching) and two sealed (a wider, glossy tar band).
 REG.crack.forEach(([x,y,w,h],v)=>{
  const sealed=v>=2;g.lineJoin=g.lineCap='round';g.strokeStyle=sealed?'rgba(9,9,9,.9)':'rgba(12,11,10,.85)';
  const walk=(px,py,len,dir,width)=>{g.lineWidth=width;g.beginPath();g.moveTo(px,py);for(let t=0;t<len;t+=7+r()*8){dir+=(r()-.5)*.7;dir=Math.max(-.6,Math.min(.6,dir));px+=Math.cos(dir)*9;py=Math.max(y+8,Math.min(y+h-8,py+Math.sin(dir)*9));g.lineTo(px,py);if(px>x+w-10)break;}g.stroke();return [px,py];};
  walk(x+10,y+h/2+(r()-.5)*16,w-24,0,sealed?7+r()*3:2.2);
  if(!sealed)for(let k=0;k<3;k++)walk(x+40+r()*(w-140),y+h/2+(r()-.5)*20,60+r()*80,(r()-.5)*1.2,1.4);
 });
 // Road lettering, condensed (it is stretched along the road): PARE in two hands, ÔNIBUS.
 g.fillStyle='#fff';g.textAlign='center';g.textBaseline='middle';
 g.font='bold 120px "Arial Narrow",Arial,sans-serif';g.fillText('PARE',REG.pare[0][0]+128,REG.pare[0][1]+70,236);
 g.font='900 112px Arial,sans-serif';g.fillText('PARE',REG.pare[1][0]+128,REG.pare[1][1]+68,240);
 g.font='bold 116px "Arial Narrow",Arial,sans-serif';g.fillText('ÔNIBUS',REG.onibus[0]+256,REG.onibus[1]+72,490);
 // Arrows (front up): straight, left, right, straight and left, straight and right.
 REG.arrow.forEach(([x,y,w,h],v)=>{
  g.save();if(v===2||v===4){g.translate(x*2+w,0);g.scale(-1,1);}
  const cx=x+w/2;g.fillStyle='#fff';
  const head=(px,py,dx,dy,size)=>{const nx=-dy,ny=dx;g.beginPath();g.moveTo(px+dx*size,py+dy*size);g.lineTo(px+nx*size*.55,py+ny*size*.55);g.lineTo(px-nx*size*.55,py-ny*size*.55);g.fill();};
  if(v===0||v>=3){g.fillRect(cx-10,y+78,20,h-82);head(cx,y+82,0,-1,74);}
  if(v>=1){const by=v>=3?y+170:y+250;if(v<3)g.fillRect(cx+6,y+140,20,by-y-140);g.lineWidth=20;g.strokeStyle='#fff';g.beginPath();g.moveTo(cx+16,v>=3?y+175:y+150);g.quadraticCurveTo(cx+16,y+110,cx-22,y+104);g.stroke();head(cx-22,y+104,-1,0,40);}
  g.restore();
 });
}
// UVs of a region (canvas px, top = front) at fraction (fx across, left to right; fy along, back to front), inset a texel.
const regionUv=([x,y,w,h],fx,fy)=>[(x+1.5+fx*(w-3))/AT,1-(y+1.5+(1-fy)*(h-3))/AT];

export async function createCityStreets(data,{mobile=false,lean=false,ground=null,map=null}={}){
 const root=new THREE.Group();root.name='Pintura_cidade';root.userData.noReflection=true;
 const city=data.scenery?.city;map=await map;const t0=performance.now();
 const stats={streetLinesM:0,dashes:0,crosswalks:0,crosswalkBars:0,stopLines:0,pare:0,arrows:0,onibus:0,lapLinesM:0,lapCrosswalks:0,lapStopLines:0,
  curbLines:0,bays:0,bayRows:0,bayMarks:0,manholes:0,drains:0,patches:0,cracks:0,oil:0,chunks:0,drawCalls:0,triangles:0,vertices:0};
 if(!city||!map||!ground)return {root,stats};
 const light=mobile||lean,see=lean?SEE_LEAN:SEE;
 const a=data.samples,N=a.length,L=data.meta.reconstructed_xy_m,probe=new TestCar(data);
 const roadD=(x,y)=>map.distance('road',x,y);

 // --- Geometry sink: per 320 m tile two layers drawn in one mesh, the dark details first and the paint over them.
 // Each vertex: position, atlas uv, colour (rgba: tint, opacity), deco (across, along, half width, half length of a
 // painted rectangle, metres; half sizes <= 0 for a sprite) and info (wear, wet with the lap's rain).
 const chunks=new Map();
 const layerAt=(x,y,k)=>{const key=Math.floor(x/CHUNK)+','+Math.floor(y/CHUNK);let c=chunks.get(key);if(!c){c=[0,1].map(()=>({p:[],uv:[],c:[],d:[],f:[],i:[],n:0}));chunks.set(key,c);}return c[k];};
 const vert=(G,x,y,z,uv,col,deco,info)=>{G.p.push(x,z,-y);G.uv.push(uv[0],uv[1]);G.c.push(col[0],col[1],col[2],col[3]);G.d.push(deco[0],deco[1],deco[2],deco[3]);G.f.push(info[0],info[1]);return G.n++;};
 const solidUv=regionUv(REG.solid,.5,.5);
 // A painted band along stations [{x,y,z,tx,ty,b,al}]: half width hw (drawn 4 cm wider so the rough edge fits), b the
 // distance along from the band's middle, hb its half length; al an opacity per station (scrubbed by the race tyres).
 // Each edge takes its own height (zf: the ground, or the lap's road plane): a stop line across a 12% street would
 // otherwise sink an edge into the asphalt.
 function band(st,hw,hb,col,wear,wet=0,zf=groundAt){
  if(st.length<2)return;const W=hw+.04;let G=null,base=-1;
  const pair=(G,s)=>{const lx=-s.ty,ly=s.tx,c=[col[0],col[1],col[2],col[3]*(s.al??1)];
   for(const e of [1,-1]){const x=s.x+lx*W*e,y=s.y+ly*W*e;vert(G,x,y,zf(x,y,s)??s.z,solidUv,c,[W*e,s.b,hw,hb],[wear,wet]);}return G.n-2;};
  for(let k=0;k<st.length-1;k++){
   const m=layerAt((st[k].x+st[k+1].x)/2,(st[k].y+st[k+1].y)/2,1);
   if(m!==G){G=m;base=pair(G,st[k]);}
   const next=pair(G,st[k+1]);G.i.push(base,base+1,next,base+1,next+1,next);base=next;
  }
 }
 // A sprite from the atlas: centre (x, y), heading h (its front), along × across metres, draped on z(x, y) in cells of
 // at most 2 m.
 function sprite(x,y,h,along,across,reg,col,wear,zf,layer=0,wet=0){
  const c=Math.cos(h),s=Math.sin(h),nu=Math.max(1,Math.ceil(along/2)),nv=Math.max(1,Math.ceil(across/2)),G=layerAt(x,y,layer),base=G.n;
  for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++){
   const fa=i/nu,fl=j/nv,u=(fa-.5)*along,l=(.5-fl)*across,px=x+c*u-s*l,py=y+s*u+c*l,z=zf(px,py);
   if(z==null){G.p.length=base*3;G.uv.length=base*2;G.c.length=base*4;G.d.length=base*4;G.f.length=base*2;G.n=base;return false;}
   vert(G,px,py,z,regionUv(reg,fl,fa),col,[0,0,-1,-1],[wear,wet]);
  }
  for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){const k=base+i*(nv+1)+j;G.i.push(k,k+1,k+nv+1,k+nv+1,k+1,k+nv+2);}
  return true;
 }
 const groundZ=(x,y)=>{const z=ground(x,y);return z==null?null:z+LIFT;},groundAt=(x,y)=>groundZ(x,y),lapAt=(x,y,s)=>lapZ(x,y,s.i);

 // --- The lap: interpolated stations, the road plane under them, where the race line runs (as track-surface.js
 // draws its rubber: toward the inside of the bends), and what stays clear of paint.
 const lapPoint=s=>{s=((s%L)+L)%L;let lo=0,hi=N-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(a[mid][0]<=s)lo=mid;else hi=mid-1;}
  const p=a[lo],q=a[(lo+1)%N],u=(s-p[0])/((lo===N-1?L:q[0])-p[0]);return {i:lo,p:p.map((v,k)=>k===0?s:v+(q[k]-v)*u)};};
 const lapZ=(x,y,i)=>{probe.index=i;return probe.sample(x,y,i).z-.02+LAP_LIFT;};
 const pathAt=a.map((p,i)=>{const b0=a[(i-18+N)%N],b1=a[(i+18)%N],bend=wrapA(Math.atan2(b1[8],b1[7])-Math.atan2(b0[8],b0[7]));return Math.max(-1,Math.min(1,bend*1.2))*p[4]*.18;});
 const brakeAt=s=>(data.meta.brake_zones??[]).some(([f,t])=>s>=f&&s<=t);
 // How much paint the race leaves at d metres from the centre at sample i: little on the line, less on its wheel tracks.
 const scrub=(d,i,s)=>{const q=d-pathAt[i],k=brakeAt(s)?1.2:1;return Math.max(.4,1-(.38*Math.exp(-((q/1.8)**2))+.16*Math.exp(-(((Math.abs(q)-.8)/.28)**2)))*k);};
 const pit=data.pit??{},inRange=(s,f,t)=>{s=((s%L)+L)%L;return f<=t?s>=f&&s<=t:s>=f||s<=t;};
 // The grid and the timing line, the pit lane's mouths: never painted.
 const lapBanned=s=>inRange(s,L-90,8)||[pit.entry_main_s,pit.exit_main_s].some(e=>e!=null&&inRange(s,e-35,e+35));
 const track=city.track??{},lapCross=[],lapStops=[],lapQuiet=[];
 for(const [s,kind] of track.crossings??[])if(!lapBanned(s)){const len=kind==='semaforo'?4:3.6+((s*7.3)%1)*.5;lapCross.push({s,kind,len});lapQuiet.push([s-len/2-1.5,s+len/2+1.2]);}
 for(const s0 of track.signals??[]){
  // A light just before a crossing stops the cars 1.6 m short of its bars; elsewhere at the light itself.
  const c=lapCross.find(c=>c.s-s0>-2&&c.s-s0<14),s=c?c.s-c.len/2-1.8:s0;
  if(!lapBanned(s)){lapStops.push(s);lapQuiet.push([s-2,s+1]);}
 }
 const lapQuietAt=s=>lapQuiet.some(([f,t])=>inRange(s,f,t));
 // Lap grid for the side streets: the race asphalt's edge distance (signed, + outside); a deck high over a street
 // does not keep that street's paint away.
 const LAPCELL=20,lapGrid=new Map();
 for(let i=0;i<N;i++){const p=a[i],q=a[(i+1)%N],r=Math.max(p[4],q[4])/2+8;
  for(let cx=Math.floor((Math.min(p[1],q[1])-r)/LAPCELL);cx<=Math.floor((Math.max(p[1],q[1])+r)/LAPCELL);cx++)for(let cy=Math.floor((Math.min(p[2],q[2])-r)/LAPCELL);cy<=Math.floor((Math.max(p[2],q[2])+r)/LAPCELL);cy++){const k=cx+','+cy;if(!lapGrid.has(k))lapGrid.set(k,[]);lapGrid.get(k).push(i);}}
 function lapClear(x,y){
  const list=lapGrid.get(Math.floor(x/LAPCELL)+','+Math.floor(y/LAPCELL));if(!list)return 99;let best=99;
  for(const i of list){const p=a[i],q=a[(i+1)%N],dx=q[1]-p[1],dy=q[2]-p[2],u=Math.max(0,Math.min(1,((x-p[1])*dx+(y-p[2])*dy)/(dx*dx+dy*dy||1)));
   const d=Math.hypot(x-p[1]-u*dx,y-p[2]-u*dy)-(p[4]+(q[4]-p[4])*u)/2;if(d<best){const gz=ground(x,y);if(gz!=null&&p[3]+(q[3]-p[3])*u-gz>4.5)continue;best=d;}}
  return best;
 }

 // --- Side streets, resampled every metre along their centreline (x, y, width, unit tangent).
 const streets=[];
 for(const src of city.streets??[]){
  const P=src.points;if(!P||P.length<2)continue;
  const X=[P[0][0]],Y=[P[0][1]],Wd=[P[0][2]];let need=1;
  for(let k=0;k<P.length-1;k++){const [x0,y0,w0]=P[k],[x1,y1,w1]=P[k+1],len=Math.hypot(x1-x0,y1-y0);if(len<1e-6)continue;let t=0;
   while(len-t>=need){t+=need;need=1;const u=t/len;X.push(x0+(x1-x0)*u);Y.push(y0+(y1-y0)*u);Wd.push(w0+(w1-w0)*u);}need-=len-t;}
  const last=P[P.length-1];if(1-need>.25){X.push(last[0]);Y.push(last[1]);Wd.push(last[2]);}
  const n=X.length;if(n<4)continue;
  const S=Float32Array.from({length:n},(_,k)=>k===n-1?k-1+(1-need>.25?1-need:1):k),TX=new Float32Array(n),TY=new Float32Array(n);
  for(let k=0;k<n;k++){const k0=Math.max(0,k-2),k1=Math.min(n-1,k+2),dx=X[k1]-X[k0],dy=Y[k1]-Y[k0],l=Math.hypot(dx,dy)||1;TX[k]=dx/l;TY[k]=dy/l;}
  const ws=[...Wd].sort((p,q)=>p-q),w=ws[n>>1];
  streets.push({src,kind:src.kind,rank:rankOf(src.kind),lanes:Math.max(1,src.lanes|0),oneway:!!src.oneway,X,Y,W:Wd,S,TX,TY,n,len:S[n-1],w,seed:(src.id%2147483647)>>>0,
   free:new Uint8Array(n),who:new Int32Array(n).fill(-1)});
 }
 // A station at s metres: position, tangent and width, interpolated.
 const at=(st,s)=>{const k=Math.max(0,Math.min(st.n-2,Math.floor(s))),u=Math.max(0,Math.min(1,(s-st.S[k])/((st.S[k+1]-st.S[k])||1))),f=(A)=>A[k]+(A[k+1]-A[k])*u;
  let tx=f(st.TX),ty=f(st.TY);const l=Math.hypot(tx,ty)||1;return {x:f(st.X),y:f(st.Y),w:f(st.W),tx:tx/l,ty:ty/l};};

 // Junctions: a street's paint stops where another carriageway crosses or meets it (its asphalt plus 2.5 m: the curb
 // returns), where it reaches the lap's walls, and off the asphalt. Streets running alongside (a dual carriageway's other
 // half) or carrying on from its end (an OSM way split at a bend) do not interrupt it.
 const CELL=20,MARGIN=2.5,segGrid=new Map();
 streets.forEach((st,si)=>{for(let k=0;k+4<st.n;k+=4){const k1=Math.min(st.n-1,k+4),ax=st.X[k],ay=st.Y[k],bx=st.X[k1],by=st.Y[k1],hw=Math.max(st.W[k],st.W[k1])/2,r=hw+MARGIN;
  const dx=bx-ax,dy=by-ay,l=Math.hypot(dx,dy)||1,seg={si,k,ax,ay,bx,by,tx:dx/l,ty:dy/l,hw};
  for(let cx=Math.floor((Math.min(ax,bx)-r)/CELL);cx<=Math.floor((Math.max(ax,bx)+r)/CELL);cx++)for(let cy=Math.floor((Math.min(ay,by)-r)/CELL);cy<=Math.floor((Math.max(ay,by)+r)/CELL);cy++){const key=cx+','+cy;if(!segGrid.has(key))segGrid.set(key,[]);segGrid.get(key).push(seg);}}});
 const segDist=(g,x,y)=>{const dx=g.bx-g.ax,dy=g.by-g.ay,u=Math.max(0,Math.min(1,((x-g.ax)*dx+(y-g.ay)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(x-g.ax-u*dx,y-g.ay-u*dy);};
 // Continuations: two street ends meeting with no third carriageway there.
 const carryOn=new Set(),ends=[];
 streets.forEach((st,si)=>{ends.push({si,x:st.X[0],y:st.Y[0]},{si,x:st.X[st.n-1],y:st.Y[st.n-1]});});
 for(const e of ends){
  const near=ends.filter(f=>f.si!==e.si&&Math.hypot(f.x-e.x,f.y-e.y)<2.5);if(near.length!==1)continue;const o=near[0].si;
  const through=(segGrid.get(Math.floor(e.x/CELL)+','+Math.floor(e.y/CELL))??[]).some(g=>g.si!==e.si&&g.si!==o&&segDist(g,e.x,e.y)<g.hw-.5);
  if(!through){carryOn.add(e.si+','+o);carryOn.add(o+','+e.si);}
 }
 streets.forEach((st,si)=>{
  for(let k=0;k<st.n;k++){
   const x=st.X[k],y=st.Y[k];
   if(roadD(x,y)>-.5||ground(x,y)==null||lapClear(x,y)<4){st.free[k]=0;continue;}
   let hit=-1;for(const g of segGrid.get(Math.floor(x/CELL)+','+Math.floor(y/CELL))??[]){
    if(g.si===si||Math.abs(g.tx*st.TX[k]+g.ty*st.TY[k])>.8||carryOn.has(si+','+g.si))continue;
    if(segDist(g,x,y)<g.hw+MARGIN){hit=g.si;break;}
   }
   st.free[k]=hit<0?1:0;st.who[k]=hit;
  }
 });
 // Matching a point of the data (a crossing, a light, a bus stop) to the street it lies on: nearest node, its heading
 // parallel to h (either way) when given.
 function onStreet(x,y,h=null,reach=4){
  let best=null,bd=reach;
  for(const g of segGrid.get(Math.floor(x/CELL)+','+Math.floor(y/CELL))??[]){
   if(h!=null&&Math.abs(Math.cos(h)*g.tx+Math.sin(h)*g.ty)<.85)continue;
   const d=segDist(g,x,y);if(d<bd+1){const st=streets[g.si];for(let k=g.k;k<=Math.min(st.n-1,g.k+4);k++){const e=Math.hypot(st.X[k]-x,st.Y[k]-y);if(e<bd){bd=e;best={st,k,s:st.S[k]};}}}
  }
  return best;
 }
 // Free metres of asphalt from the centre at station p to the curb on side sign (left +), at most `reach`.
 const curbOff=(p,sign,reach)=>{let o=0;for(;o<reach;o+=.1)if(roadD(p.x-p.ty*sign*(o+.1),p.y+p.tx*sign*(o+.1))>-.3)break;return o;};
 // The same to the centimetre (bisection), or null where no curb comes within reach (a junction's mouth).
 const curbAt=(p,sign,reach)=>{const d=o=>roadD(p.x-p.ty*sign*o,p.y+p.tx*sign*o);if(d(0)>-.3||d(reach)<=-.3)return null;let lo=0,hi=reach;for(let k=0;k<11;k++){const m=(lo+hi)/2;if(d(m)>-.3)hi=m;else lo=m;}return lo;};
 // An offset function following the real curb on side sg, `inset` metres in from the point 0.3 m inside the asphalt's
 // edge that curbAt finds (the gutter's dark line is the last 0.2 m).
 const alongCurb=(sg,inset)=>p=>{const e=curbAt(p,sg,p.w/2+1.5);return e==null||e<inset+1?null:sg*(e-inset);};
 // Whether the line across st at s would lie on another carriageway's own asphalt (the junction box).
 const insideOther=(st,s)=>{const p=at(st,s),si=streets.indexOf(st);for(const o of [0,p.w/4,-p.w/4]){const x=p.x-p.ty*o,y=p.y+p.tx*o;
  for(const g of segGrid.get(Math.floor(x/CELL)+','+Math.floor(y/CELL))??[])if(g.si!==si&&Math.abs(g.tx*p.tx+g.ty*p.ty)<=.8&&!carryOn.has(si+','+g.si)&&segDist(g,x,y)<g.hw-.3)return true;}return false;};
 const blockRange=(st,s0,s1)=>{for(let k=Math.max(0,Math.floor(s0));k<=Math.min(st.n-1,Math.ceil(s1));k++)st.free[k]=0;};
 const paintable=(x,y,hw)=>roadD(x,y)<-(hw+.08)&&lapClear(x,y)>1.5;

 // Paint colour of a street (fresh or old, a little dirty) and of one stroke on it.
 const tone=(pair,age,r)=>{const c=mixc(pair[0],pair[1],Math.min(1,age+(r()-.5)*.2)),k=.94+r()*.1;return [c[0]*k,c[1]*k,c[2]*k];};
 // A stroke along street st from s0 to s1 at offset off(p) (left +), half width hw; split where it leaves the asphalt.
 function stroke(st,s0,s1,off,hw,col,wear,alpha=1){
  if(s1-s0<.5)return 0;const steps=Math.max(1,Math.ceil((s1-s0)/2)),mid=(s0+s1)/2,hb=(s1-s0)/2;let run=[],drawn=0;
  const flush=()=>{if(run.length>1){band(run,hw,hb,[...col,alpha],wear);drawn+=run[run.length-1].s-run[0].s;}run=[];};
  for(let j=0;j<=steps;j++){
   const s=s0+(s1-s0)*j/steps,p=at(st,s),o=off(p);if(o==null){flush();continue;}
   const x=p.x-p.ty*o,y=p.y+p.tx*o,z=groundZ(x,y);
   if(z==null||!paintable(x,y,hw)){flush();continue;}
   run.push({x,y,z,tx:p.tx,ty:p.ty,b:s-mid,s});
  }
  flush();stats.streetLinesM+=drawn;return drawn;
 }
 // A dashed stroke: dash d, gap g, phase from the street's start (the pattern stays put across its junctions).
 function dashes(st,s0,s1,off,hw,col,wear,d,g,phase,solid=[]){
  const P=d+g;
  for(let k=Math.floor((s0-phase)/P);phase+k*P<s1;k++){
   const f=Math.max(s0,phase+k*P),t=Math.min(s1,phase+k*P+d);if(t-f<.6)continue;
   if(solid.some(([a0,a1])=>t>a0&&f<a1))continue;
   if(stroke(st,f,t,off,hw,col,wear))stats.dashes++;
  }
  for(const [a0,a1] of solid){const f=Math.max(s0,a0),t=Math.min(s1,a1);if(t-f>1)stroke(st,f,t,off,hw,col,wear);}
 }
 // A line across street st at s from offset o0 to o1 (left +): stop lines (0.4 m) and the like.
 function across(st,s,o0,o1,hw,col,wear,alpha=1){
  const p=at(st,s),run=[],steps=Math.max(1,Math.ceil(Math.abs(o1-o0)/2)),mid=(o0+o1)/2,hb=Math.abs(o1-o0)/2;
  for(let j=0;j<=steps;j++){const o=o0+(o1-o0)*j/steps,x=p.x-p.ty*o,y=p.y+p.tx*o,z=groundZ(x,y);if(z==null||roadD(x,y)>-.12||lapClear(x,y)<1.5)return false;
   run.push({x,y,z,tx:-p.ty*Math.sign(o1-o0),ty:p.tx*Math.sign(o1-o0),b:o-mid});}
  band(run,hw,hb,[...col,alpha],wear);return true;
 }
 const waits=[];// where cars wait at a stop line: oil, laid with the other details

 // --- Crossings on the side streets: zebra bars along the road (FTP-1), 0.4 m with 0.4-0.6 m between, kerb to kerb.
 const stopsBy=new Map();// street -> [{s, side}] (side: 1 full width, 'r' the right half going +s, 'l' the left half)
 // A stop line (LRE, 0.4 m) across street st at s, curb to curb there: the whole width (side 1) or the half the traffic
 // going +s ('r') or -s ('l') uses, clear of a centre line by gap. Kept (and counted) only when drawn.
 function stopLine(st,s,side,col,wear,gap=0){
  const list=stopsBy.get(st)??[];if(list.some(o=>Math.abs(o.s-s)<5&&(o.side===side||o.side===1||side===1)))return null;
  const p=at(st,s),l=curbOff(p,1,p.w/2+.6),rr=curbOff(p,-1,p.w/2+.6);if(l+rr<2.2)return null;
  const o0=side==='r'?-gap:l-.25,o1=side==='l'?gap:-rr+.25;if(o0-o1<1||!across(st,s,o0,o1,.2,col,wear))return null;
  list.push({s,side});stopsBy.set(st,list);stats.stopLines++;return {o0,o1};
 }
 const signals=(city.signals?.items??[]).map(([x,y,h,w,ow])=>({x,y,h,w,oneway:!!ow,used:false}));
 const barGrid=new Map(),barKey=(x,y)=>Math.floor(x/2)+','+Math.floor(y/2);
 const barMark=(x,y)=>{const k=barKey(x,y);if(!barGrid.has(k))barGrid.set(k,[]);barGrid.get(k).push(x,y);};
 const barTaken=(x,y)=>{for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){const l=barGrid.get((Math.floor(x/2)+i)+','+(Math.floor(y/2)+j));if(l)for(let k=0;k<l.length;k+=2)if(Math.hypot(l[k]-x,l[k+1]-y)<.6)return true;}return false;};
 for(const [x,y,h,w] of city.crossings?.items??[]){
  if(lapClear(x,y)<3)continue;
  const r=random(Math.round(x*73+y*131)),m=onStreet(x,y,h);
  const p=m?at(m.st,m.s):{x,y,w,tx:Math.cos(h),ty:Math.sin(h)},hw=(m?p.w:w)/2;
  const left=curbOff(p,1,hw+1),right=curbOff(p,-1,hw+1);if(left+right<2.4)continue;
  const len=3+r()*1,bw=.4,gap=.4+r()*.2,span=left+right-.7,count=Math.max(2,Math.floor((span+gap)/(bw+gap))),pitch=(span-bw)/(count-1),o0=-right+.35+bw/2;
  const age=r()*.8,col=tone(WHITE,age,r),wear=.25+age*.5;let bars=0;
  for(let b=0;b<count;b++){
   const o=o0+b*pitch,run=[];let ok=true;
   for(let j=0;j<=2;j++){const u=(j/2-.5)*len,x1=p.x+p.tx*u-p.ty*o,y1=p.y+p.ty*u+p.tx*o,z=groundZ(x1,y1);if(z==null||!paintable(x1,y1,bw/2)){ok=false;break;}run.push({x:x1,y:y1,z,tx:p.tx,ty:p.ty,b:u});}
   // Each bar its own opacity and wear (the wheels wear some more than others). Two crossings meeting at a corner (one on
   // each street) never overlap: the second stops where the first one's bars are.
   const along=[];for(let u=-len/2;u<=len/2+.01;u+=len/8)along.push([p.x+p.tx*u-p.ty*o,p.y+p.ty*u+p.tx*o]);
   if(ok&&along.every(([px,py])=>!barTaken(px,py))){band(run,bw/2,len/2,[...col,.8+r()*.2],wear+r()*.25);bars++;along.forEach(([px,py])=>barMark(px,py));}
  }
  if(!bars)continue;stats.crosswalks++;stats.crosswalkBars+=bars;
  // With a light within 25 m on this street: stop lines 1.6 m before the bars on the approach (both halves both ways on
  // a two-way street).
  const sig=signals.find(q=>Math.hypot(q.x-x,q.y-y)<25&&Math.abs(Math.cos(q.h-Math.atan2(p.ty,p.tx)))>.7);
  if(m){
   let back=len/2+1.2,ahead=len/2+1.2;
   // Only on the side the traffic comes from outside the junction: a crossing at a junction's mouth has its stop
   // line on the street, never inside the junction box.
   if(sig){sig.used=true;const st=m.st,two=!st.oneway,s0=m.s-len/2-1.8,s1=m.s+len/2+1.8;
    if(!insideOther(st,s0)&&stopLine(st,s0,two?'r':1,col,wear,.15))back+=1.6;
    if(two&&!insideOther(st,s1)&&stopLine(st,s1,'l',col,wear,.15))ahead+=1.6;}
   blockRange(m.st,m.s-back,m.s+ahead);
  }
 }

 // --- Lights with no crossing: a stop line where the junction begins, on each approach.
 for(const q of signals){
  if(q.used||lapClear(q.x,q.y)<6)continue;const m=onStreet(q.x,q.y,q.h);if(!m)continue;const st=m.st;
  const stopAt=(dir)=>{let k=Math.round(m.s);if(st.free[k])return st.S[k];for(let j=0;j<40;j++){k-=dir;if(k<0||k>=st.n)return null;if(st.free[k])return st.S[k]-dir*.3;}return null;};
  for(const dir of st.oneway?[1]:[1,-1]){
   const s=stopAt(dir);if(s==null)continue;
   if(stopLine(st,s,st.oneway?1:dir>0?'r':'l',tone(WHITE,.3,random(st.seed+7)),.4,.15))blockRange(st,dir>0?s-.5:s-1.5,dir>0?s+1.5:s+.5);
  }
 }

 // --- Longitudinal lines, street by street, over the free runs between junctions.
 const PARE_ODDS=.42,ARROW_ODDS=.42;
 streets.forEach((st,si)=>{
  const r=random(st.seed),age=r(),wear=.2+age*.55,white=tone(WHITE,age,r),yellow=tone(YELLOW,age,r);
  const minor=st.kind==='service'||st.kind==='living_street'||st.kind==='busway';
  const lanes=Math.max(1,Math.min(st.lanes,Math.floor(st.w/2.7))),two=!st.oneway;
  // Lane width: the real lanes, the rest of the width (parking, bus bays) shared out on both sides.
  const lw=p=>Math.min(p.w/lanes,3.6);
  const centre=two&&!minor&&st.w>=6&&r()>.12?(st.rank>=5&&st.w>=11)||lanes>=4?'double':st.rank>=4&&st.w>=9?'solid':'dashed':null;
  const sep=[];// lane separators: offsets as functions of the station
  if(two){for(let k=1;k<lanes/2;k++){sep.push(p=>k*lw(p),p=>-k*lw(p));}}
  else if(lanes>=2&&!minor)for(let k=1;k<lanes;k++)sep.push(p=>(-lanes/2+k)*lw(p));
  const edge=(/^(trunk|motorway)/.test(st.kind)&&st.w>=7)||(st.kind==='primary'&&!two&&lanes>=3&&r()<.4);
  const [dash,gap]=st.rank>=5?[3,6]:r()<.6?[2,4]:[3,5],phase=r()*(dash+gap);
  // The runs of free metres.
  const runs=[];for(let k=0;k<st.n;){if(!st.free[k]){k++;continue;}let e=k;while(e+1<st.n&&st.free[e+1])e++;if(st.S[e]-st.S[k]>=5)runs.push([k,e]);k=e+1;}
  const stops=stopsBy.get(st)??[];
  for(const [k0,k1] of runs){
   const s0=st.S[k0],s1=st.S[k1];
   // Approaches: no lane changes in the last 15 m before a stop line.
   const solid=stops.filter(o=>o.s>=s0-3&&o.s<=s1+3).map(o=>(o.side==='l'?[o.s+1,o.s+15]:[o.s-15,o.s-1]));
   if(!light||st.rank>=3){
    if(centre==='double'){for(const o of [-.11,.11])stroke(st,s0,s1,()=>o,.05,yellow,wear);}
    else if(centre==='solid')stroke(st,s0,s1,()=>0,.06,yellow,wear);
    else if(centre==='dashed')dashes(st,s0,s1,()=>0,.06,yellow,wear,2,4,phase);
    for(const off of sep)dashes(st,s0,s1,off,.06,white,wear,dash,gap,phase,solid);
    if(edge)for(const sg of [1,-1])stroke(st,s0,s1,alongCurb(sg,.35),.07,white,wear+.1);
   }
   // Where the run ends at a junction with a bigger street (and no light there): PARE and its stop line on some minor
   // approaches; arrows before junctions on multi-lane approaches.
   if(light)continue;
   for(const [end,dir] of [[k1,1],[k0,-1]]){
    if(dir<0&&st.oneway)continue;
    const nb=end+dir;if(nb<0||nb>=st.n||st.who[nb]<0)continue;
    const other=streets[st.who[nb]],s=st.S[end]-dir*.3,side=st.oneway?1:dir>0?'r':'l';
    if(st.src.lanes<=2&&other.rank>st.rank+.5&&st.rank<=4&&st.len>30&&s1-s0>9&&r()<PARE_ODDS&&!stops.some(o=>Math.abs(o.s-s)<10)){
     const sl=stopLine(st,s,side,white,wear,centre?.15:0);
     if(sl){const {o0,o1}=sl,ts=s-dir*2.1,q=at(st,ts),om=(o0+o1)/2,w=Math.min(Math.abs(o1-o0)-.5,2.6);
      if(w>1.4&&sprite(q.x-q.ty*om,q.y+q.tx*om,Math.atan2(q.ty,q.tx)+(dir<0?Math.PI:0),2.4,w,REG.pare[r()<.5?0:1],[...white,.92],wear,groundZ,1))stats.pare++;
      waits.push({st,s:s-dir*(2+r()*2),o:om},{st,s:s-dir*(7.5+r()*2),o:om});}
    }
    // No parking in the last metres before some junctions: the yellow line along the curb (LPE).
    if(s1-s0>20&&!minor&&!edge&&r()<.3&&stroke(st,dir>0?s1-10-r()*6:s0,dir>0?s1:s0+10+r()*6,alongCurb(-dir,-.05),.06,yellow,wear))stats.curbLines++;
    const nl=two?Math.floor(lanes/2):lanes;
    if(nl>=2&&s1-s0>40&&r()<ARROW_ODDS){
     const as=s-dir*(12+r()*4),q=at(st,as),w=lw(q);
     for(let k=0;k<nl;k++){
      // Lanes counted from the right of the approach; the outer ones may turn.
      const o=two?-dir*(nl-k-.5)*w:-(lanes/2-k-.5)*w,kind=k===0?(r()<.35?4:0):k===nl-1?(r()<.35?3:0):0;
      if(sprite(q.x-q.ty*o,q.y+q.tx*o,Math.atan2(q.ty,q.tx)+(dir<0?Math.PI:0),5,1.15,REG.arrow[kind],[...white,.9],wear,groundZ,1))stats.arrows++;
     }
    }
   }
  }
  // Bus-only streets: ÔNIBUS near the start, then every 120-200 m.
  if(st.kind==='busway'&&!light)for(let s=12+r()*25;s<st.len-8;s+=120+r()*80){
   const k=Math.round(s);if(!st.free[k])continue;const p=at(st,s),w=Math.min(p.w-.8,2.8);if(w<1.8)continue;
   if(sprite(p.x,p.y,Math.atan2(p.ty,p.tx),1.9,w,REG.onibus,[...white,.9],wear,groundZ,1))stats.onibus++;
  }
 });

 // --- ÔNIBUS by the bus stops, in the lane along the curb before the shelter, read by the drivers coming to it.
 if(!light)for(const [x,y] of city.stops?.items??[]){
  const m=onStreet(x,y,null,14);if(!m||m.st.kind==='busway')continue;const st=m.st,p0=at(st,m.s),d=(x-p0.x)*-p0.ty+(y-p0.y)*p0.tx,sg=Math.sign(d)||1;
  // Going +s the right side is -left: a stop on the left of a two-way street serves the cars going -s.
  const dir=st.oneway?1:sg<0?1:-1,s=m.s-dir*3,p=at(st,s),edge=curbOff(p,sg,p.w/2+.5),o=sg*(edge-1.5);
  if(edge<2.8||!st.free[Math.round(s)])continue;
  if(sprite(p.x-p.ty*o,p.y+p.tx*o,Math.atan2(p.ty,p.tx)+(dir<0?Math.PI:0),1.9,2.5,REG.onibus,[...tone(WHITE,.4,random(st.seed+3)),.88],.45,groundZ,1))stats.onibus++;
  // The stop's no-parking stretch: the yellow line along the curb, from before the lettering to past the shelter.
  stroke(st,Math.min(m.s-dir*14,m.s+dir*8),Math.max(m.s-dir*14,m.s+dir*8),alongCurb(sg,-.05),.06,tone(YELLOW,.4,random(st.seed+5)),.4)&&stats.curbLines++;
 }

 // --- Parking bays where the cars park along the curb (city.parked, street-closures.js puts them there): the regulated
 // parking of the Brazilian manual (MER), white: bays about 5.5 m long and 2.2 m deep, closed by a line along the traffic
 // lane with the bay ends drawn to the curb, or only T marks at the bay ends (an L at each end of the row), or the line
 // alone on older streets. One style per side of a street; the bays follow the parked cars (each car in its own bay, the
 // empty ones between them), never across a crossing, a junction's mouth, a bus stop's no-parking stretch or a closure.
 // Old paint: worn through like the rest. (Phones and the Básico level: the line along the lane only.)
 {const pk=city.parked,cols=Object.fromEntries((pk?.columns??[]).map((k,i)=>[k,i])),sides=new Map(),BAY=5.5,DEPTH=1.95;
  const near=(items,x,y,r)=>items.some(([px,py])=>(px-x)**2+(py-y)**2<r*r);
  const crossPts=(city.crossings?.items??[]).map(([x,y])=>[x,y]),stopPts=(city.stops?.items??[]).map(([x,y])=>[x,y]),closePts=(city.closures??[]).map(c=>[c.x,c.y]);
  for(const it of pk?.items??[]){
   const x=it[cols.x],y=it[cols.y],h=it[cols.heading],m=onStreet(x,y,h,9);if(!m)continue;const p=at(m.st,m.s),d=(x-p.x)*-p.ty+(y-p.y)*p.tx;
   const key=m.st.seed+':'+(d>0?1:-1);if(!sides.has(key))sides.set(key,{st:m.st,sg:d>0?1:-1,s:[]});sides.get(key).s.push(m.s);
  }
  // A bay end at s on side sg: where the curb is (the bay's inner edge) and whether paint may go there.
  const curbHere=(st,s,sg)=>{const p=at(st,s);return curbAt(p,sg,p.w/2+1.5);};
  const bayOk=(st,s,sg)=>{const k=Math.round(s);if(k<0||k>=st.n||!st.free[k])return false;const e=curbHere(st,s,sg);if(e==null||e<DEPTH+1.2)return false;
   const p=at(st,s),o=sg*(e-1),x=p.x-p.ty*o,y=p.y+p.tx*o;return !near(crossPts,x,y,7)&&!near(stopPts,x,y,15)&&!near(closePts,x,y,14)&&lapClear(x,y)>3;};
  for(const {st,sg,s:list} of sides.values()){
   list.sort((p,q)=>p-q);const r=random(st.seed^(sg>0?0x2c1b3c6d:0x297a2d39)),style=light?'line':['box','box','T','T','line'][Math.floor(r()*5)];
   const age=.35+r()*.5,col=tone(WHITE,age,r),wear=.35+age*.45,alpha=.72+r()*.18;
   // Bay ends: each car's bay, shared ends between close cars, empty bays filling the short gaps; a long gap ends the row.
   const rows=[];let row=[list[0]-BAY/2];
   for(let i=0;i<list.length;i++){const s=list[i],next=list[i+1];
    if(next==null||next-s>BAY*3.2){row.push(s+BAY/2);rows.push(row);if(next!=null)row=[next-BAY/2];continue;}
    if(next-s<=BAY+1.6){row.push((s+next)/2);continue;}
    const a=s+BAY/2,b=next-BAY/2,n=Math.max(0,Math.round((b-a)/BAY));row.push(a);for(let k=1;k<n;k++)row.push(a+(b-a)*k/n);if(b-a>1)row.push(b);}
   for(const ends of rows){
    // Cut where a bay end may not be painted: the rest of the row carries on as rows of its own.
    let run=[];const flush=()=>{if(run.length>=2)paintRow(st,sg,run,style,col,wear,alpha);run=[];};
    for(const s of ends){if(bayOk(st,s,sg))run.push(s);else flush();}flush();
   }
  }
  function paintRow(st,sg,ends,style,col,wear,alpha){
   const s0=ends[0],s1=ends.at(-1),line=alongCurb(sg,DEPTH);
   if(style!=='T'&&stroke(st,s0,s1,line,.05,col,wear,alpha))stats.bayRows++;
   if(style==='line'){stats.bays+=ends.length-1;return;}
   ends.forEach((s,k)=>{const e=curbHere(st,s,sg);if(e==null)return;
    if(style==='box'){if(across(st,s,sg*(e+.05),sg*(e-DEPTH),.05,col,wear,alpha))stats.bayMarks++;return;}
    // T marks: a short bar from the lane line toward the curb and the line's piece either side of it (one side at the
    // row's ends: an L).
    if(across(st,s,sg*(e-DEPTH+.65),sg*(e-DEPTH),.05,col,wear,alpha))stats.bayMarks++;
    const f=k===0?s:s-.55,t=k===ends.length-1?s:s+.55;if(t-f>.5)stroke(st,f,t,line,.05,col,wear,alpha);});
   stats.bays+=ends.length-1;if(style==='T')stats.bayRows++;
  }
 }

 // --- The lap: the real street's lanes from track.lanes, faded and scrubbed by the race, crossings and stop lines.
 const lapItems=track.lanes?.items??[];
 const lapStation=(s,d)=>{const {i,p}=lapPoint(s),x=p[1]+p[9]*d,y=p[2]+p[10]*d,t=Math.hypot(p[7],p[8])||1;return {i,p,x,y,z:lapZ(x,y,i),tx:p[7]/t,ty:p[8]/t};};
 function lapStroke(s0,s1,dk,hw,col,wear){
  if(s1-s0<.5)return;const steps=Math.max(1,Math.ceil((s1-s0)/2)),mid=(s0+s1)/2,run=[];
  for(let j=0;j<=steps;j++){const s=s0+(s1-s0)*j/steps,q=lapPoint(s),d=dk(q.p);const st=lapStation(s,d);run.push({...st,b:s-mid,al:scrub(d,st.i,s)});}
  band(run,hw,(s1-s0)/2,col,wear,1,lapAt);stats.lapLinesM+=s1-s0;
 }
 const lapAge=.35,lapWhite=tone(WHITE,lapAge,random(91)),lapYellow=tone(YELLOW,lapAge,random(92)),lapAlpha=.66;
 for(let j=0;j<lapItems.length;j++){
  const [from,n,ow]=lapItems[j],to=j+1<lapItems.length?lapItems[j+1][0]:L;
  const expressway=onDeck(data,(from+to)/2)||(from>=3172&&from<3384),[dash,gap]=expressway?[3,6]:[2,4];
  // Free stretches: the section minus the banned and the quiet (crossings, stop lines) metres, in steps of a metre.
  const pieces=[];let start=null;for(let s=from;;s+=1){const end=s>=to,ok=!end&&!lapBanned(s)&&!lapQuietAt(s);if(ok&&start==null)start=s;if(!ok&&start!=null){const e=Math.min(s,to);if(e-start>3)pieces.push([start,e]);start=null;}if(end)break;}
  const solidBefore=lapStops.map(s=>[s-15,s-1]);
  for(const [f,t] of pieces){
   for(let k=1;k<n;k++){
    const frac=-.5+k/n,dk=p=>p[4]*frac;
    if(!ow&&k===n/2){for(const o of [-.11,.11])lapStroke(f,t,p=>o,.05,[...lapYellow,lapAlpha],.5);continue;}
    for(let c=Math.floor(f/(dash+gap));c*(dash+gap)<t;c++){
     const d0=Math.max(f,c*(dash+gap)),d1=Math.min(t,c*(dash+gap)+dash);if(d1-d0<.6||solidBefore.some(([a0,a1])=>d1>a0&&d0<a1))continue;lapStroke(d0,d1,dk,.06,[...lapWhite,lapAlpha],.5);
    }
    for(const [a0,a1] of solidBefore){const d0=Math.max(f,a0),d1=Math.min(t,a1);if(d1-d0>1)lapStroke(d0,d1,dk,.06,[...lapWhite,lapAlpha],.5);}
   }
   if(!ow&&n%2===1)lapStroke(f,t,()=>0,.06,[...lapYellow,lapAlpha],.5);
  }
 }
 // Full-width crossings: bars along the lap, inside the edge lines (open-circuit.js paints those 0.18-0.32 m in).
 for(const c of lapCross){
  const p=lapPoint(c.s).p,w=p[4],span=w-1.0,bw=.45,gap=.55,count=Math.floor((span+gap)/(bw+gap)),pitch=(span-bw)/(count-1),r=random(Math.round(c.s*13));
  if(c.kind==='semaforo'){for(const e of [-1,1])lapAcross(c.s+e*(c.len/2-.2),.2,[...lapWhite,.8],.45);stats.lapCrosswalks++;continue;}
  for(let b=0;b<count;b++){
   const d=-span/2+bw/2+b*pitch,run=[];
   for(let j=0;j<=2;j++){const s=c.s+(j/2-.5)*c.len,st=lapStation(s,d);run.push({...st,b:s-c.s,al:scrub(d,st.i,s)});}
   band(run,bw/2,c.len/2,[...lapWhite,.82+r()*.12],.45+r()*.2,1,lapAt);
  }
  stats.lapCrosswalks++;
 }
 function lapAcross(s,hw,col,wear){
  const p=lapPoint(s).p,half=p[4]/2-.45,run=[],steps=Math.ceil(half);
  for(let j=0;j<=steps;j++){const d=-half+2*half*j/steps,st=lapStation(s,d);run.push({...st,tx:p[9],ty:p[10],b:d,al:scrub(d,st.i,s)});}
  band(run,hw,half,col,wear,1,lapAt);
 }
 for(const s of lapStops){lapAcross(s,.2,[...lapWhite,.9],.35);stats.lapStopLines++;}
 // Straight-ahead arrows in each of the street's lanes before its lights, as worn as the rest.
 if(!light)for(const s0 of lapStops){
  const r=random(Math.round(s0*31)),n=lapItems.reduce((m,it)=>it[0]<=s0?it[1]:m,2),ow=lapItems.reduce((m,it)=>it[0]<=s0?it[2]:m,1);if(n<2||!ow)continue;
  for(let k=0;k<n;k++){const s=s0-13-r()*3;if(lapBanned(s)||lapQuietAt(s-2.5)||lapQuietAt(s+2.5))continue;const {p}=lapPoint(s),d=(-.5+(k+.5)/n)*p[4],st=lapStation(s,d);
   if(sprite(st.x,st.y,Math.atan2(st.ty,st.tx),5,1.1,REG.arrow[0],[...lapWhite,.5*scrub(d,st.i,s)],.5,(x,y)=>lapZ(x,y,st.i),1,1))stats.arrows++;}
 }
 // ÔNIBUS by the lap's bus stops, in the outer lane on the stop's side.
 if(!light)for(const [k,s] of (track.stops??[]).entries()){
  if(lapBanned(s))continue;const {p}=lapPoint(s);let best=null,bd=40;
  for(const [x,y] of city.stops?.items??[]){const e=Math.hypot(x-p[1],y-p[2]);if(e<bd){bd=e;best=[x,y];}}
  // The stop's side from the data (track.stop_sides), as city-furniture.js puts its shelter; else the nearest street stop's.
  const side=track.stop_sides?.[k]??(best?Math.sign((best[0]-p[1])*p[9]+(best[1]-p[2])*p[10])||-1:-1),lane=lapItems.reduce((n,it)=>it[0]<=s?it[1]:n,2),lw=Math.min(p[4]/Math.max(1,lane),3.6),d=side*(p[4]/2-.45-lw/2);
  const st=lapStation(s,d);if(sprite(st.x,st.y,Math.atan2(st.ty,st.tx),1.9,Math.min(lw-.6,2.6),REG.onibus,[...lapWhite,.6],.5,(x,y)=>lapZ(x,y,st.i),1,1))stats.onibus++;
 }

 // --- Small things on the asphalt (not on phones or the Básico level): manholes, drains along the curb, patches,
 // sealed cracks, oil where the cars wait. Each by its own seeded spacing along every street; nothing on the lines'
 // and bars' metres is avoided on purpose (real paint runs over manhole lids), only the curb and the lap's walls.
 if(!light){
  const fits=(x,y,h,along,across,inside=.15)=>{const c=Math.cos(h),s=Math.sin(h);for(const [u,v] of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5],[0,0]]){const px=x+c*u*along-s*v*across,py=y+s*u*along+c*v*across;if(roadD(px,py)>-inside||lapClear(px,py)<2)return false;}return true;};
  const iron=(r)=>{const k=.72+r()*.3;return [k,k*(.97+r()*.04),k*(.93+r()*.06),1];};
  for(const st of streets){
   if(st.len<6)continue;const r=random(st.seed^0x5f3759df);
   // Manholes: mostly round, near the middle of a lane or the centreline; some square boxes, a few small valve caps.
   for(let s=5+r()*40;s<st.len-3;s+=22+r()*48){
    const p=at(st,s),hw=p.w/2-.9;if(hw<.2)continue;const o=(r()-.5)*2*hw,x=p.x-p.ty*o,y=p.y+p.tx*o,round=r()<.75;
    const size=round?.62+r()*.18:r()<.3?.36+r()*.1:.62+r()*.32,h=round?r()*7:Math.atan2(p.ty,p.tx)+(r()-.5)*.08;
    if(!fits(x,y,h,size,size,.3))continue;
    if(sprite(x,y,h,size,size,round?REG.round[Math.floor(r()*4)]:REG.square[size<.5?2:Math.floor(r()*2)],iron(r),0,groundZ))stats.manholes++;
   }
   // Storm drains in the gutter, on either side, the grate's outer edge against the curb.
   if(st.w>=4.5)for(let s=8+r()*30;s<st.len-3;s+=24+r()*36){
    const p=at(st,s),sg=r()<.5?1:-1,e=curbAt(p,sg,p.w/2+1);if(e==null||e<2||!st.free[Math.round(s)])continue;const o=sg*(e-.02),x=p.x-p.ty*o,y=p.y+p.tx*o,h=Math.atan2(p.ty,p.tx);
    if(!fits(x,y,h,1.0,.2,.05))continue;
    if(sprite(x,y,h+Math.PI/2,.42,1.0,REG.grate[Math.floor(r()*4)],iron(r),0,groundZ))stats.drains++;
   }
   // Patches: along the lane (a utility cut or a repaired rut), now and then a trench straight across the street.
   for(let s=15+r()*60;s<st.len-4;s+=35+r()*85){
    const p=at(st,s),h0=Math.atan2(p.ty,p.tx),dark=r(),col=[.75+dark*.55,.75+dark*.55,.76+dark*.55,1];
    if(r()<.16){const l=curbOff(p,1,p.w/2+.5),rr=curbOff(p,-1,p.w/2+.5),w=l+rr-.3,o=(l-rr)/2,x=p.x-p.ty*o,y=p.y+p.tx*o,h=h0+Math.PI/2+(r()-.5)*.06,wd=.5+r()*.45;
     if(w>2&&fits(x,y,h,w,wd,.05)&&sprite(x,y,h,w,wd,REG.patch[r()<.5?0:3],col,0,groundZ))stats.patches++;continue;}
    const len=1.2+r()*2.6,wd=.8+r()*1.4,hw=p.w/2-wd/2-.3;if(hw<0)continue;const o=(r()-.5)*2*hw,x=p.x-p.ty*o,y=p.y+p.tx*o,h=h0+(r()-.5)*.1;
    if(fits(x,y,h,len,wd,.1)&&sprite(x,y,h,len,wd,REG.patch[Math.floor(r()*4)],col,0,groundZ))stats.patches++;
   }
   // Cracks, sealed or not: mostly along the road, some across.
   for(let s=10+r()*40;s<st.len-4;s+=25+r()*55){
    const p=at(st,s),len=2.5+r()*4.5,trans=r()<.25,h=Math.atan2(p.ty,p.tx)+(trans?Math.PI/2:0)+(r()-.5)*.5,span=trans?Math.min(len,p.w-1):len;
    const hw=p.w/2-(trans?span/2:.5)-.3;if(hw<0)continue;const o=(r()-.5)*2*hw,x=p.x-p.ty*o,y=p.y+p.tx*o;
    if(fits(x,y,h,span,.6,.1)&&sprite(x,y,h,span,.6,REG.crack[Math.floor(r()*4)],[1,1,1,.75+r()*.25],0,groundZ))stats.cracks++;
   }
   // Oil in the parking strip along the curb of the smaller streets.
   if(st.rank<=3&&st.w>=7)for(let s=6+r()*20;s<st.len-3;s+=14+r()*30){
    const p=at(st,s),sg=r()<.5?1:-1,e=curbOff(p,sg,p.w/2+1);if(e<2.5)continue;const o=sg*(e-1.1-r()*.4),x=p.x-p.ty*o,y=p.y+p.tx*o,size=.7+r()*.9;
    if(fits(x,y,0,size,size,.2)&&sprite(x,y,r()*7,size*(1+r()*.6),size,REG.oil[Math.floor(r()*8)],[1,1,1,.5+r()*.4],0,groundZ))stats.oil++;
   }
  }
  // Oil where the cars wait at the stop lines placed above.
  for(const q of waits){const r=random(Math.round(q.s*977)+q.st.seed),p=at(q.st,q.s),x=p.x-p.ty*q.o,y=p.y+p.tx*q.o,size=.8+r()*.8;
   if(fits(x,y,0,size,size,.3)&&sprite(x,y,r()*7,size*1.4,size,REG.oil[Math.floor(r()*8)],[1,1,1,.45+r()*.4],0,groundZ))stats.oil++;}
  // The lap's manholes: the race line kept clear, none on the bridges or by the paint across the road.
  const r=random(5150);
  for(let s=20+r()*60;s<L-95;s+=55+r()*80){
   if(lapBanned(s)||onDeck(data,s)||lapQuietAt(s)||lapQuietAt(s+4)||lapQuietAt(s-4))continue;
   const {i,p}=lapPoint(s);let d=null;for(let k=0;k<5&&d==null;k++){const t=(r()-.5)*(p[4]-2);if(Math.abs(t-pathAt[i])>1.5)d=t;}if(d==null)continue;
   const st=lapStation(s,d),round=r()<.8,size=round?.66+r()*.14:.7+r()*.25;
   if(sprite(st.x,st.y,round?r()*7:Math.atan2(st.ty,st.tx),size,size,round?REG.round[Math.floor(r()*4)]:REG.square[Math.floor(r()*2)],iron(r),0,(x,y)=>lapZ(x,y,st.i)-LAP_LIFT+.005,0,1))stats.manholes++;
  }
 }

 // --- One material for all of it: the atlas, the paint's coverage and wear from world-space noise, wet with the lap.
 const atlas=canvasTexture(drawAtlas,AT,AT);atlas.anisotropy=8;
 const material=new THREE.MeshStandardMaterial({name:'Pintura_cidade',map:atlas,vertexColors:true,transparent:true,depthWrite:false,roughness:.74,metalness:0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-3});
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{roadWetness:ROAD_WEATHER.roadWetness});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 deco;attribute vec2 info;varying vec4 vDeco;varying vec2 vInfo;varying vec3 vPaintWorld;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvDeco=deco;vInfo=info;vPaintWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform float roadWetness;varying vec4 vDeco;varying vec2 vInfo;varying vec3 vPaintWorld;
float paintHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float paintNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(paintHash(i),paintHash(i+vec2(1,0)),f.x),mix(paintHash(i+vec2(0,1)),paintHash(i+vec2(1,1)),f.x),f.y);}
// Share of a pixel (footprint f) inside [-h, h]: a box filter, so a line thinner than a pixel fades instead of crawling.
float paintCover(float x,float h,float f){return clamp((min(x+f*.5,h)-max(x-f*.5,-h))/f,0.0,1.0);}`)
   .replace('#include <color_fragment>',`#include <color_fragment>
vec2 pw=vec2(vPaintWorld.x,-vPaintWorld.z);float ppx=length(fwidth(pw));
float fineA=1.0-smoothstep(.02,.06,ppx),fineB=1.0-smoothstep(.08,.25,ppx);
if(vDeco.z>0.0){
 // Painted by hand with a machine: the edges wander a centimetre or two, the ends a few more.
 vec2 f=max(fwidth(vDeco.xy),vec2(1e-4));
 float ha=vDeco.z+(paintNoise(pw*23.0+3.1)-.5)*.012*fineA+(paintNoise(pw*1.7)-.5)*.014;
 float hb=vDeco.w+(paintNoise(pw*11.0+8.3)-.5)*.045*fineA;
 diffuseColor.a*=paintCover(vDeco.x,ha,f.x)*paintCover(vDeco.y,hb,f.y);
}
if(vInfo.x>0.0){
 // Worn through to the asphalt in patches (0.5-2 m), flakes (15 cm) and pits (3 cm), the finer ones averaged away
 // once a pixel covers them; dirtier and whiter by the metre.
 float n=paintNoise(pw*.8+11.0)*.5+mix(.5,paintNoise(pw*6.5+2.0),fineB)*.3+mix(.5,paintNoise(pw*33.0),fineA)*.2;
 float through=smoothstep(.8-vInfo.x*.42-ppx*.2,.94-vInfo.x*.34+ppx*.2,n);
 diffuseColor.a*=1.0-through*.94;
 diffuseColor.rgb*=mix(.8,1.04,paintNoise(pw*.23+4.0))*mix(.9,1.03,mix(.5,paintNoise(pw*2.7),fineB));
}
// Wet with the lap (rain on the race asphalt): darker, glassy.
diffuseColor.rgb*=1.0-.22*roadWetness*vInfo.y;`)
   // The iron, patches and stains as matte as the asphalt round them (a smoother lid caught the sky at a low look and
   // read as a pale blue disc); paint a little smoother; all of it glassy when the lap is wet.
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nif(vDeco.z<0.0&&vInfo.x<=0.0)roughnessFactor=.9;\nroughnessFactor=mix(roughnessFactor,.18,roadWetness*vInfo.y);');
  carShadowPatch(shader);
 };
 material.customProgramCacheKey=()=>'pintura-cidade-v1';
 lampPatch(material);

 // --- Meshes, one per tile: details first, the paint over them (the order inside a transparent mesh is its draw order).
 const meshes=[];
 for(const [key,layers] of chunks){
  const nv=layers[0].n+layers[1].n;if(!nv)continue;
  const P=new Float32Array(nv*3),U=new Float32Array(nv*2),C=new Float32Array(nv*4),D=new Float32Array(nv*4),F=new Float32Array(nv*2),I=[];let o=0;
  for(const G of layers){P.set(G.p,o*3);U.set(G.uv,o*2);C.set(G.c,o*4);D.set(G.d,o*4);F.set(G.f,o*2);for(const i of G.i)I.push(i+o);o+=G.n;}
  if(!I.length)continue;
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(P,3));g.setAttribute('uv',new THREE.BufferAttribute(U,2));g.setAttribute('color',new THREE.BufferAttribute(C,4));
  g.setAttribute('deco',new THREE.BufferAttribute(D,4));g.setAttribute('info',new THREE.BufferAttribute(F,2));g.setIndex(nv>65535?new THREE.Uint32BufferAttribute(I,1):new THREE.Uint16BufferAttribute(I,1));
  g.computeVertexNormals();g.computeBoundingSphere();g.computeBoundingBox();
  // Part of the ground: drawn before every other see-through thing (the cars' contact shadows, smoke, skid marks).
  const mesh=new THREE.Mesh(g,material);mesh.name='Pintura_cidade_'+key;mesh.receiveShadow=true;mesh.castShadow=false;mesh.renderOrder=-1;mesh.matrixAutoUpdate=false;root.add(mesh);meshes.push(mesh);
  stats.triangles+=I.length/3;stats.vertices+=nv;
 }stats.chunks=stats.drawCalls=meshes.length;stats.buildMs=Math.round(performance.now()-t0);stats.light=light;stats.streetLinesM=Math.round(stats.streetLinesM);stats.lapLinesM=Math.round(stats.lapLinesM);stats.trianglesK=Math.round(stats.triangles/1000);
 // Paint is a few pixels of shimmer far off: each tile is drawn only within `see` metres of the eye (from its nearest
 // edge, in plan). drawCalls counts the tiles also in the view (what three draws after its frustum test).
 const eye=new THREE.Vector3(),frustum=new THREE.Frustum(),view=new THREE.Matrix4();
 function update(dt,camera){
  if(!camera)return;camera.getWorldPosition(eye);let drawn=0;
  view.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(view);
  for(const mesh of meshes){const b=mesh.geometry.boundingBox,dx=Math.max(b.min.x-eye.x,0,eye.x-b.max.x),dz=Math.max(b.min.z-eye.z,0,eye.z-b.max.z);
   mesh.visible=dx*dx+dz*dz<see*see;if(mesh.visible&&frustum.intersectsSphere(mesh.geometry.boundingSphere))drawn++;}
  stats.drawCalls=drawn;
 }
 return {root,update,stats};
}
