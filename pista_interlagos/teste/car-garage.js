import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {canvasTexture,css,toolBoard} from './pit-textures.js';
import {rosterOf,MODEL_NAMES,cssColor,luminance} from './race-roster.js';

// The car screen's garage (car-select.js Studio): the Auto-Pobre Racing's workshop round the turntable, built
// once from boxes, tubes and canvas paint, the fixed parts merged by finish (a couple dozen draw calls).
// Frame: the car turns at the origin, the camera looks from +x+z (car-select.js VIEW), so the walls it sees are
// the long one at x=G.wall (tool chests and tool board, tyre rack, the backlit logo right behind the car, the
// data desk and its screens) and the end one at z=G.end (roller door, car lift), behind the cards on a computer.
// The other two walls and the ceiling show in the paint and in the floor: hexagonal LED lights, a bright door
// behind the camera. The floor is glossy epoxy that mirrors the room (mirror) on computers' Alto and Ultra.
export const G=Object.freeze({wall:-7.5,end:-13,right:18,front:15,height:7,deck:.08,ring:3.1});
const SMALL=typeof matchMedia==='function'&&(matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0);
// Where things stand: z along the long wall (x along the end wall), the footprints also shade the floor.
const L={
 chests:[{z:3.1,w:1.5,top:true,seed:3},{z:1.42,w:1.62,top:false,seed:8}],board:{z:2.25,y:2.3,w:4.4,h:1.1},
 rack:{z:-1.55,w:2.04},stacks:[[G.wall+.48,-3.0,4],[G.wall+1.12,-3.2,2]],logo:{z:-5.1,y:2.5,w:3.6,h:1.8},trophies:{z:-5.1,w:3.3},
 desk:{z:-10.2,len:3.0},screens:[-9.25,-11.15],engine:{x:-4.35,z:3.1,turn:-.4},jack:{x:-3.85,z:-3.05,turn:.62},
 cans:[[G.wall+.32,.35],[G.wall+.33,-.05]],door:{x0:-1.4,x1:3.8,open:2.7,top:4.4},lift:{x0:7.4,x1:10.6}
};
const YELLOW=0xf0c52b,BLACK=0x141618,STEEL=0xa9afb3,RUBBER=0x111214;
const rng=seed=>()=>(seed=seed*16807%2147483647)/2147483647;
const box=(w,h,d)=>new THREE.BoxGeometry(w,h,d),cyl=(r,h,s=16,top=r,open=false)=>new THREE.CylinderGeometry(top,r,h,s,1,open);
const along=g=>g.rotateZ(Math.PI/2),across=g=>g.rotateX(Math.PI/2);
// Vertex colours (linear, as THREE.Color gives them); k>1 glows past white in the HDR picture (LEDs, light boxes).
export function paint(geometry,color,k=1){
 const g=geometry.index?geometry.toNonIndexed():geometry;if(g.attributes.uv)g.deleteAttribute('uv');
 const c=new THREE.Color(color).multiplyScalar(k),n=g.attributes.position.count,a=new Float32Array(n*3);
 for(let i=0;i<n;i++){a[i*3]=c.r;a[i*3+1]=c.g;a[i*3+2]=c.b;}g.setAttribute('color',new THREE.BufferAttribute(a,3));return g;
}
// One object's parts by finish, in its own frame (+x toward the room, y up), placed together by Parts.place.
export class Kit{
 constructor(){this.parts={paint:[],metal:[],matte:[],glow:[]};}
 add(kind,geometry,color,pos=[0,0,0],k=1){this.parts[kind].push(paint(geometry.translate(...pos),color,k));return this;}
 p(g,c,pos){return this.add('paint',g,c,pos);}
 m(g,c,pos){return this.add('metal',g,c,pos);}
 r(g,c,pos){return this.add('matte',g,c,pos);}
 g(g,c,pos,k=3){return this.add('glow',g,c,pos,k);}
}
export class Parts{
 constructor(materials){this.M=materials;this.lists=new Map();}
 add(material,geometry){if(!this.lists.has(material))this.lists.set(material,[]);this.lists.get(material).push(geometry);}
 place(kit,x,z,y=0,turn=0){for(const [kind,list] of Object.entries(kit.parts))if(list.length){const g=mergeGeometries(list,false);g.rotateY(turn).translate(x,y,z);this.add(this.M[kind],g);}}
 build(root){for(const [material,list] of this.lists){const mesh=new THREE.Mesh(mergeGeometries(list,false),material);mesh.name='Garagem_'+material.name;root.add(mesh);}this.lists.clear();}
}

// ---- Paint ----
// Epoxy floor over the whole room (canvas top = the end wall): graphite with flake, cloudy so it never tiles,
// the ring round the turntable, walkway lines, the hatched door apron, light from the door and soft contact
// shade under everything that stands.
function floorMap(){
 const W=G.right-G.wall,D=G.front-G.end,m=2048/W;
 return canvasTexture((ctx,w,h)=>{
  const X=x=>(x-G.wall)*m,Y=z=>(z-G.end)*m,r=rng(11),k=ctx.getTransform().a;
  ctx.fillStyle='#3a3f43';ctx.fillRect(0,0,w,h);
  for(let i=0;i<90;i++){const x=r()*w,y=r()*h,rad=(1.2+r()*4.5)*m,g=ctx.createRadialGradient(x,y,0,x,y,rad),dark=r()<.55;g.addColorStop(0,dark?'rgba(16,18,20,.2)':'rgba(130,136,140,.09)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(x-rad,y-rad,2*rad,2*rad);}
  const flakes=['#5b6166','#262a2d','#717779','#bfc3c1','#4a4440'];for(let i=0;i<(SMALL?16000:42000);i++){ctx.globalAlpha=.2+r()*.45;ctx.fillStyle=flakes[i%5];const s=.7+r()*1.5;ctx.fillRect(r()*w,r()*h,s,s);}ctx.globalAlpha=1;
  // Light falling in from the roller door.
  const door=(L.door.x0+L.door.x1)/2,spill=ctx.createRadialGradient(X(door),Y(G.end),0,X(door),Y(G.end),7*m);spill.addColorStop(0,'rgba(235,238,232,.2)');spill.addColorStop(1,'rgba(235,238,232,0)');ctx.fillStyle=spill;ctx.fillRect(0,0,w,Y(G.end+7));
  // Faint tyre marks from the door to the turntable.
  ctx.lineCap='round';for(const s of [-.75,.75]){ctx.strokeStyle='rgba(12,13,14,.18)';ctx.lineWidth=.2*m;ctx.beginPath();ctx.moveTo(X(door+s),Y(G.end));ctx.bezierCurveTo(X(door+s),Y(G.end+4),X(1.6+s*.8),Y(-6),X(.8+s),Y(-3.2));ctx.stroke();}
  // Contact shade: along the walls and under each thing standing (drawn as a blurred shadow of an off-canvas box).
  const wallShade=(x0,y0,x1,y1)=>{const g=ctx.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,'rgba(0,0,0,.5)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(Math.min(x0,x1),Math.min(y0,y1),Math.abs(x1-x0)||w,Math.abs(y1-y0)||h);};
  wallShade(0,0,.9*m,0);wallShade(0,0,0,.9*m);
  const shade=(x0,z0,x1,z1,blur=.25,alpha=.6)=>{ctx.save();ctx.shadowColor=`rgba(0,0,0,${alpha})`;ctx.shadowBlur=blur*m*k;ctx.shadowOffsetX=w*4*k;ctx.fillStyle='#000';ctx.fillRect(X(x0)-w*4,Y(z0),(x1-x0)*m,(z1-z0)*m);ctx.restore();};
  for(const c of L.chests)shade(G.wall,c.z-c.w/2,G.wall+.64,c.z+c.w/2);
  shade(G.wall,L.rack.z-L.rack.w/2,G.wall+.62,L.rack.z+L.rack.w/2,.2,.5);shade(G.wall,L.desk.z-L.desk.len/2,G.wall+.85,L.desk.z+L.desk.len/2,.3,.45);
  shade(G.wall,L.trophies.z-L.trophies.w/2,G.wall+.46,L.trophies.z+L.trophies.w/2,.2,.5);
  for(const [x,z] of L.stacks)shade(x-.3,z-.3,x+.3,z+.3,.15,.7);
  shade(L.engine.x-.45,L.engine.z-.55,L.engine.x+.45,L.engine.z+.55,.35,.55);shade(L.jack.x-.6,L.jack.z-.25,L.jack.x+.6,L.jack.z+.25,.2,.45);
  shade(L.lift.x0-.3,G.end+.1,L.lift.x1+.3,G.end+1.1,.4,.4);
  // The turntable sits on a soft dark pool.
  const pool=ctx.createRadialGradient(X(0),Y(0),G.ring*m*.95,X(0),Y(0),(G.ring+.9)*m);pool.addColorStop(0,'rgba(0,0,0,.55)');pool.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=pool;ctx.beginPath();ctx.arc(X(0),Y(0),(G.ring+.9)*m,0,7);ctx.fill();
  // Markings: the yellow ring and a white dashed one round the turntable, walkway lines, the door apron.
  ctx.strokeStyle='#e9c22c';ctx.lineWidth=.07*m;ctx.beginPath();ctx.arc(X(0),Y(0),3.75*m,0,7);ctx.stroke();
  ctx.strokeStyle='rgba(236,236,230,.55)';ctx.lineWidth=.035*m;ctx.setLineDash([.45*m,.3*m]);ctx.beginPath();ctx.arc(X(0),Y(0),4.0*m,0,7);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='rgba(233,194,44,.85)';ctx.fillRect(X(G.wall+1.35),Y(G.end+1.35),.08*m,(D-1.35)*m);ctx.fillRect(X(G.wall+1.35),Y(G.end+1.35),(W-1.35)*m,.08*m);
  ctx.save();ctx.beginPath();ctx.rect(X(L.door.x0),0,(L.door.x1-L.door.x0)*m,1.1*m);ctx.clip();ctx.fillStyle='#151617';ctx.fillRect(X(L.door.x0),0,(L.door.x1-L.door.x0)*m,1.1*m);
  ctx.strokeStyle='#e2b927';ctx.lineWidth=.16*m;for(let i=-4;i<40;i++){ctx.beginPath();ctx.moveTo(X(L.door.x0)+i*.4*m,0);ctx.lineTo(X(L.door.x0)+(i-3)*.4*m,1.1*m);ctx.stroke();}ctx.restore();
 },2048,Math.round(2048*D/W));
}
// Fine flake and scratches repeated every couple of metres (the floor shader mixes it in), so the floor holds up close.
export function grainMap(){
 return canvasTexture((ctx,w,h)=>{
  const r=rng(29);ctx.fillStyle='#808080';ctx.fillRect(0,0,w,h);
  for(let i=0;i<9000;i++){const v=r()<.5?40+r()*50:160+r()*70;ctx.fillStyle=`rgba(${v|0},${v|0},${v|0},${.25+r()*.4})`;const s=1+r()*2;ctx.fillRect(r()*w,r()*h,s,s);}
  ctx.lineCap='round';for(let i=0;i<70;i++){const x=r()*w,y=r()*h,a=r()*6.3,l=10+r()*60;ctx.strokeStyle=`rgba(${r()<.5?190:60},${r()<.5?190:60},${r()<.5?190:60},${.12+r()*.18})`;ctx.lineWidth=.6+r();ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);ctx.stroke();}
 },512,512,true);
}
// A wall, metres along (canvas left = the start of `along`) by G.height: dark top above the LED strip,
// graphite composite panels each a shade apart, white line and team-yellow stripe over brushed kick panels,
// warm pools under the wall lights (lights: metres along), then whatever the wall carries (extra).
function wallMap(length,lights,seed,extra=null){
 const m=100;
 return canvasTexture((ctx,w,h)=>{
  const Y=y=>h-y*m,r=rng(seed);
  ctx.fillStyle='#17191b';ctx.fillRect(0,0,w,h);
  const panel=1.25*m;for(let x=0;x<w;x+=panel){ctx.fillStyle=css(0x30353a,.9+r()*.18);ctx.fillRect(x,Y(4.85),panel,(4.85-1.2)*m);ctx.fillStyle=css(0x30353a,.85+r()*.2);ctx.fillRect(x,Y(3.02),panel,(3.02-1.2)*m);}
  ctx.fillStyle='#16191b';for(let x=0;x<=w;x+=panel)ctx.fillRect(x-2,Y(4.85),4,(4.85-1.2)*m);ctx.fillRect(0,Y(3.04),w,4);
  ctx.fillStyle='#5a6166';for(let x=0;x<w;x+=panel)for(const y of [1.3,2.9,3.14,4.75])for(const dx of [.06,1.19]){ctx.beginPath();ctx.arc(x+dx*m,Y(y),2.6,0,7);ctx.fill();}
  ctx.fillStyle='#202427';ctx.fillRect(0,Y(1.06),w,.94*m);for(let i=0;i<900;i++){ctx.fillStyle=`rgba(${r()<.5?255:0},${r()<.5?255:0},${r()<.5?255:0},${.015+r()*.03})`;ctx.fillRect(r()*w,Y(.12+r()*.94),20+r()*160,1);}
  ctx.fillStyle='#cfd3d3';ctx.fillRect(0,Y(1.1),w,.03*m);ctx.fillStyle='#f0c52b';ctx.fillRect(0,Y(1.2),w,.08*m);
  ctx.fillStyle='#0c0d0e';ctx.fillRect(0,Y(.12),w,.12*m);ctx.fillStyle='#0f1112';ctx.fillRect(0,Y(4.98),w,.13*m);
  ctx.globalCompositeOperation='lighter';
  for(const at of lights){ctx.save();ctx.translate(at*m,Y(4.8));ctx.scale(1,1.7);const g=ctx.createRadialGradient(0,0,0,0,0,2.1*m);g.addColorStop(0,'rgba(255,232,200,.26)');g.addColorStop(.5,'rgba(255,232,200,.08)');g.addColorStop(1,'rgba(255,232,200,0)');ctx.fillStyle=g;ctx.fillRect(-2.1*m,0,4.2*m,2.1*m);ctx.restore();}
  ctx.globalCompositeOperation='source-over';
  for(let i=0;i<40;i++){const x=r()*w,rad=(.3+r()*.8)*m,g=ctx.createRadialGradient(x,h,0,x,h,rad);g.addColorStop(0,'rgba(0,0,0,.22)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(x-rad,h-rad,2*rad,rad);}
  extra?.(ctx,m,Y);
 },Math.round(length*m),G.height*m,false);
}
// The box number stencilled on the end wall left of the door (BOX_SIGN: its plane, metres), the car's own
// (show); drawn on a clear canvas over the wall.
const BOX_SIGN=Object.freeze({x:-4.3,y:3.45,w:4.8,h:1.8});
function boxSign(ctx,w,h,number){
 const m=w/BOX_SIGN.w,Y=y=>(BOX_SIGN.y+BOX_SIGN.h/2-y)*m;ctx.clearRect(0,0,w,h);ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.font=`900 ${1.05*m}px "Arial Black","Arial Bold",Arial,sans-serif`;ctx.fillStyle='rgba(236,236,230,.78)';ctx.fillText(`BOX ${number}`,w/2,Y(3.8),4.6*m);
 ctx.font=`bold ${.26*m}px Arial,sans-serif`;ctx.fillStyle='rgba(240,197,43,.9)';ctx.fillText('OFICINA DE CORRIDA',w/2,Y(3.05),4.4*m);
}
// The turntable's top, turning with the car: brushed rings, the team's name and the box number round the edge,
// a yellow line.
function deckArt(ctx,w,h,number){
  const c=w/2,r=rng(5);ctx.fillStyle='#1e2124';ctx.fillRect(0,0,w,h);
  for(let i=0;i<320;i++){const v=r()<.5?255:0;ctx.strokeStyle=`rgba(${v},${v},${v},${.02+r()*.05})`;ctx.lineWidth=1+r()*2.5;ctx.beginPath();ctx.arc(c,c,r()*c,0,7);ctx.stroke();}
  ctx.fillStyle='#101214';ctx.beginPath();ctx.arc(c,c,.985*c,0,7);ctx.arc(c,c,.865*c,0,7,true);ctx.fill();
  ctx.strokeStyle='#f0c52b';ctx.lineWidth=5;ctx.beginPath();ctx.arc(c,c,.85*c,0,7);ctx.stroke();
  const text=`AUTO-POBRE RACING  ✦  BOX ${number}  ✦  `,all=text+text;ctx.font='bold 34px Arial,sans-serif';ctx.fillStyle='#c3c8cb';ctx.textAlign='center';ctx.textBaseline='middle';
  [...all].forEach((ch,i)=>{ctx.save();ctx.translate(c,c);ctx.rotate(i/all.length*Math.PI*2);ctx.fillText(ch,0,-.925*c);ctx.restore();});
  ctx.fillStyle='#596066';for(let i=0;i<120;i++){ctx.save();ctx.translate(c,c);ctx.rotate(i/120*Math.PI*2);ctx.fillRect(-1.5,-.995*c,3,i%10?.012*c:.03*c);ctx.restore();}
}
// Stacked tyres' sidewall (the cylinder caps): the game's AUTO POBRE with the Opala's real tyre under it, on a
// dark race wheel.
function sidewallMap(){
 return canvasTexture((ctx,w,h)=>{
  const c=w/2;ctx.fillStyle='#161719';ctx.fillRect(0,0,w,h);ctx.fillStyle='#202124';ctx.beginPath();ctx.arc(c,c,c*.98,0,7);ctx.fill();
  ctx.fillStyle='#8a877f';ctx.textAlign='center';ctx.textBaseline='middle';
  for(const [label,start,size,step] of [['AUTO POBRE',-2.55,.11,.21],['DUNLOP DIREZZA',.55,.06,.12]]){ctx.font=`italic 900 ${w*size}px Arial,sans-serif`;[...label].forEach((ch,i)=>{ctx.save();ctx.translate(c,c);ctx.rotate(start+i*step);ctx.fillText(ch,0,-c*.8);ctx.restore();});}
  const rim=ctx.createRadialGradient(c,c,0,c,c,c*.62);rim.addColorStop(0,'#3b3f43');rim.addColorStop(.85,'#25282b');rim.addColorStop(1,'#7b8186');ctx.fillStyle=rim;ctx.beginPath();ctx.arc(c,c,c*.62,0,7);ctx.fill();
  ctx.fillStyle='#0c0d0e';for(let k=0;k<8;k++){const a=k*Math.PI/4;ctx.beginPath();ctx.ellipse(c+Math.cos(a)*c*.36,c+Math.sin(a)*c*.36,c*.11,c*.06,a,0,7);ctx.fill();}
  ctx.fillStyle='#9aa1a5';ctx.beginPath();ctx.arc(c,c,c*.1,0,7);ctx.fill();
 },256,256);
}
// Light through the roller door: overcast daylight over the paddock's concrete.
function daylightMap(){
 return canvasTexture((ctx,w,h)=>{
  const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#eef3f6');g.addColorStop(.62,'#dfe6ea');g.addColorStop(.7,'#a9aca6');g.addColorStop(1,'#8e908a');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  const r=rng(41);for(let i=0;i<6;i++){ctx.fillStyle=`rgba(120,128,132,${.25+r()*.2})`;const x=r()*w,bw=20+r()*60,bh=12+r()*30;ctx.fillRect(x,h*.62-bh,bw,bh);}
 },256,128);
}
function haloMap(){return canvasTexture((ctx,w,h)=>{const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(255,214,120,.55)');g.addColorStop(.45,'rgba(255,200,90,.18)');g.addColorStop(1,'rgba(255,200,90,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);},256,256);}

// ---- Things ----
// Roll cab tool chest, w wide along the wall: drawers in this chest's own mix, chrome pulls, a steel top,
// casters; top: a top chest on it.
function rollCab(w,seed,top){
 const k=new Kit(),r=rng(seed),d=.62,h=.92,y0=.1,FACE=0x23272b;
 k.p(box(d,h,w),BLACK,[d/2,y0+h/2,0]).m(box(d+.03,.035,w+.03),STEEL,[d/2,y0+h+.018,0]).p(box(.008,.035,w-.02),YELLOW,[d+.004,y0+h-.03,0]);
 let y=y0+h-.06;for(const dh of [.075,.075,.09,.09,.12,.15,.2].map(v=>v*(.88+r()*.3))){if(y-dh<y0+.03)break;k.p(box(.014,dh-.014,w-.07),FACE,[d+.007,y-dh/2,0]).m(box(.026,.016,w*.72),STEEL,[d+.02,y-.035,0]);y-=dh;}
 for(const [x,z] of [[.09,w/2-.09],[.53,w/2-.09],[.09,.09-w/2],[.53,.09-w/2]])k.r(across(cyl(.045,.04,12)),RUBBER,[x,.05,z]).m(box(.07,.04,.06),STEEL,[x,.09,z]);
 k.m(along(cyl(.014,.36,8)),STEEL,[d/2,y0+h-.12,w/2+.06]).m(box(.03,.03,.06),STEEL,[d/2-.17,y0+h-.12,w/2+.03]).m(box(.03,.03,.06),STEEL,[d/2+.17,y0+h-.12,w/2+.03]);
 if(top){const th=.44,b=y0+h+.035;k.p(box(d-.08,th,w-.04),BLACK,[d/2-.03,b+th/2,0]).m(box(d-.06,.02,w-.02),STEEL,[d/2-.03,b+th+.01,0]);
  let yy=b+th-.04;for(const dh of [.06,.07,.09,.12]){k.p(box(.012,dh-.012,w-.1),FACE,[d-.07+.006,yy-dh/2,0]).m(box(.02,.014,w*.6),STEEL,[d-.07+.018,yy-.03,0]);yy-=dh;}}
 return k;
}
// A laptop open on a chest, its screen lit; a team helmet beside it.
function chestTop(y){
 const k=new Kit();k.r(box(.25,.016,.35),0x1d1f22,[.36,y+.008,.28]).r(box(.015,.23,.35).rotateZ(.25),0x1d1f22,[.22,y+.12,.28]).g(box(.004,.19,.31).rotateZ(.25),0x5fa8e6,[.231,y+.12,.28],1.4);
 k.p(new THREE.SphereGeometry(.14,20,14).scale(1.08,.95,1),YELLOW,[.3,y+.15,-.35]).p(new THREE.SphereGeometry(.141,20,14,0,Math.PI*2,1.1,.5).scale(1.08,.95,1),BLACK,[.3,y+.15,-.35]);
 k.m(new THREE.SphereGeometry(.143,16,10,Math.PI-.9,1.8,1.05,.75).scale(1.08,.95,1),0x2a3540,[.3,y+.15,-.35]);
 return k;
}
// Jerry can, red or yellow.
function jerryCan(color){return new Kit().p(box(.17,.42,.32),color,[0,.21,0]).p(box(.06,.05,.12),color,[0,.45,.05]).r(cyl(.025,.06,10),RUBBER,[0,.45,-.1]);}
// Steel tyre rack, w long: uprights, two rails per shelf (the tyres are an instanced mesh).
function rack(w){
 const k=new Kit(),G_=0x5f676c;for(const x of [.05,.57])for(const z of [w/2-.03,.03-w/2])k.p(box(.05,2.12,.05),G_,[x,1.06,z]);
 for(const y of [.12,.84,1.56])for(const x of [.16,.46])k.p(across(cyl(.022,w,10)),G_,[x,y,0]);
 for(const y of [.12,.84,1.56,2.1])for(const x of [.05,.57])k.p(box(.04,.04,w),G_,[x,y,0]);
 return k;
}
// Inline six on an engine stand: block and head in the team's dark blue, polished valve cover, three side-draft
// carburettors with trumpets, six headers to two collectors, pulleys, flywheel; the stand red with casters.
function engineStand(){
 const k=new Kit(),BLUE=0x23405e,ALU=0xc9ced2,RED=0xb51d23,CAST=0x5c6266;
 k.p(box(.36,.44,.78),BLUE,[0,.92,0]).r(box(.3,.14,.66),0x1b1c1e,[0,.64,.03]).p(box(.34,.13,.8),BLUE,[0,1.205,0]).m(box(.25,.09,.74),ALU,[-.02,1.315,0]);
 for(let i=0;i<8;i++)k.m(box(.255,.006,.012),0x9aa0a5,[-.02,1.362,-.3+i*.085]);
 k.m(cyl(.022,.07,10),ALU,[.05,1.39,.24]);
 for(const z of [-.26,0,.26])k.m(box(.11,.11,.14),ALU,[-.25,1.14,z]).m(along(cyl(.046,.11,14,.058)),ALU,[-.36,1.14,z]).m(along(cyl(.052,.012,14)),0x8f969b,[-.42,1.14,z]);
 const HDR=0x8b7c6e;for(let i=0;i<6;i++){const z=-.33+i*.132,cz=i<3?-.2:.2,curve=new THREE.CubicBezierCurve3(new THREE.Vector3(.17,1.1,z),new THREE.Vector3(.36,1.08,z),new THREE.Vector3(.34,.8,cz+(z-cz)*.4),new THREE.Vector3(.33,.58,cz));
  k.m(new THREE.TubeGeometry(curve,12,.019,7),HDR);}
 for(const cz of [-.2,.2])k.m(cyl(.035,.3,12),HDR,[.33,.43,cz]);
 k.m(across(cyl(.1,.035,20)),CAST,[0,.82,.43]).m(across(cyl(.06,.04,16)),CAST,[.14,1.0,.42]).r(across(cyl(.045,.12,14)),0x1b1c1e,[.16,1.0,.36]).m(across(cyl(.2,.05,24)),CAST,[0,.86,-.43]);
 k.p(box(.07,.07,.32),RED,[0,.86,-.62]).p(box(.26,.26,.02),RED,[0,.86,-.46]).p(box(.08,.86,.08),RED,[0,.47,-.78]).p(box(.95,.06,.08),RED,[0,.07,-.78]).p(box(.08,.06,1.05),RED,[0,.07,-.3]);
 for(const [x,z] of [[-.45,-.78],[.45,-.78],[0,.2]])k.r(across(cyl(.04,.035,10)),RUBBER,[x,.04,z]);
 return k;
}
// Quick-lift jack: low yellow frame, black saddle, two wheels, handle raised.
function jack(){
 const k=new Kit();k.p(box(1.0,.09,.3),YELLOW,[0,.13,0]).p(box(.22,.07,.26),BLACK,[.55,.2,0]).p(box(.3,.03,.32),BLACK,[.1,.19,0]);
 for(const z of [-.19,.19])k.r(across(cyl(.1,.05,16)),RUBBER,[-.32,.1,z]).m(across(cyl(.04,.055,10)),STEEL,[-.32,.1,z]);
 k.r(across(cyl(.045,.04,10)),RUBBER,[.42,.045,0]);
 k.m(box(1.3,.035,.035).rotateZ(-.48),STEEL,[-.95,.48,0]).r(along(cyl(.022,.18,10)).rotateZ(-.48),RUBBER,[-1.52,.78,0]);
 return k;
}
// Data desk along the wall: top on two panel legs, three monitors (screens: their own meshes), keyboard, the
// PC under it with a blue light, a racing-style chair pulled out.
function desk(len){
 const k=new Kit(),top=.76;k.p(box(.78,.04,len),0x1c1f22,[.42,top,0]);for(const z of [len/2-.06,.06-len/2])k.m(box(.7,top-.02,.035),0x6a7176,[.42,(top-.02)/2,z]);
 for(const [z,turn] of [[-.78,.28],[0,0],[.78,-.28]]){k.r(box(.035,.42,.74).rotateY(turn),0x0e0f10,[.22,top+.36,z]).r(box(.04,.24,.05),0x2a2d30,[.2,top+.13,z]).r(box(.2,.015,.24),0x2a2d30,[.25,top+.01,z]);}
 k.r(box(.17,.018,.46),0x16181a,[.6,top+.03,0]).r(box(.1,.02,.06),0x16181a,[.62,top+.03,.36]);
 k.r(box(.45,.46,.2),0x101113,[.3,.24,-len/2+.4]).g(box(.004,.38,.01),0x3a8fe0,[.528,.24,-len/2+.33],2.2);
 const C=new Kit();C.r(box(.5,.09,.5),BLACK,[0,.5,0]).r(box(.09,.78,.5),BLACK,[-.24,.92,0]).p(box(.095,.06,.5),YELLOW,[-.24,1.28,0]).p(box(.4,.012,.06),YELLOW,[0,.552,.22]).p(box(.4,.012,.06),YELLOW,[0,.552,-.22]);
 C.m(cyl(.03,.42,10),0x6a7176,[0,.25,0]);for(let i=0;i<5;i++){const a=i/5*Math.PI*2;C.r(box(.3,.03,.04).rotateY(a),RUBBER,[Math.cos(a)*.15,.06,-Math.sin(a)*.15]);}
 return {desk:k,chair:C};
}
// Low sideboard under the logo with the team's cups on it (gold, silver, bronze; the tallest in the middle), a
// warm light along its plinth.
function trophies(w){
 const k=new Kit(),r=rng(17),top=.78;k.p(box(.42,top-.08,w),BLACK,[.21,.08+(top-.08)/2,0]).m(box(.44,.025,w+.02),0x2b2f33,[.22,top+.012,0]).r(box(.36,.08,w-.06),0x0b0c0d,[.18,.04,0]).g(box(.006,.012,w-.12),0xffd9a0,[.362,.075,0],2.2);
 for(const z of [-w/6,w/6])k.p(box(.006,top-.16,.004),0x23272b,[.423,.08+(top-.08)/2,z]);

 const cup=h=>new THREE.LatheGeometry([[0,0],[.06,0],[.06,.025],[.025,.035],[.014,.07],[.014,h*.42],[.028,h*.48],[.07,h*.6],[.088,h*.86],[.093,h],[.086,h],[.078,h*.87],[0,h*.8]].map(([x,y])=>new THREE.Vector2(x,y)),22);
 const list=[[.28,0xc89b3c],[.36,0xb9bec2],[.46,0xd6a943],[.34,0xa86b3a],[.26,0xc89b3c]];
 const y=top+.025;list.forEach(([h,color],i)=>{const z=(i-2)*(w/5.4)+(r()-.5)*.12;k.r(box(.15,.07,.15),0x111214,[.2,y+.035,z]).m(cup(h).scale(h>.4?1.25:1,1,h>.4?1.25:1),color,[.2,y+.07,z]);if(h>.4)for(const s of [-1,1])k.m(new THREE.TorusGeometry(.05,.01,6,14).rotateY(Math.PI/2),color,[.2,y+.07+h*.72,z+s*.12]);});
 return k;
}
// Fire extinguisher on its wall bracket and an air hose reel.
function safety(){
 const k=new Kit();k.p(cyl(.085,.48,16),0xc01e25,[.12,.62,0]).p(new THREE.SphereGeometry(.085,14,8,0,Math.PI*2,0,Math.PI/2),0xc01e25,[.12,.86,0]).r(box(.06,.08,.06),RUBBER,[.12,.92,0]).r(cyl(.012,.3,6),RUBBER,[.2,.72,0]).p(box(.03,.3,.14),0x4a5054,[.015,.7,0]);
 k.p(box(.04,.36,.36),0x2a2d30,[.02,1.75,.8]).p(across(cyl(.16,.12,22)),YELLOW,[.12,1.75,.8]).r(across(new THREE.TorusGeometry(.13,.025,8,22)),0xe4b622,[.12,1.75,.8]);
 return k;
}
// Ceiling: hexagonal LED tubes over the turntable (each shared edge once) and plain bars elsewhere.
function ceiling(){
 const k=new Kit(),R=.95,y=G.height-.55,seen=new Set(),s3=Math.sqrt(3);
 for(let i=-4;i<=6;i++)for(let j=-4;j<=4;j++){
  const cx=i*1.5*R+.4,cz=j*s3*R+(i&1)*s3/2*R-.6;if(cx<-5.6||cx>5.2||cz<-10.5||cz>4)continue;
  for(let e=0;e<6;e++){const a0=e*Math.PI/3,a1=a0+Math.PI/3,x0=cx+R*Math.cos(a0),z0=cz+R*Math.sin(a0),x1=cx+R*Math.cos(a1),z1=cz+R*Math.sin(a1),key=`${Math.round((x0+x1)*50)},${Math.round((z0+z1)*50)}`;
   if(seen.has(key))continue;seen.add(key);k.g(box(R,.035,.05).rotateY(-Math.atan2(z1-z0,x1-x0)),0xf3f6ff,[(x0+x1)/2,y,(z0+z1)/2],4);}
 }
 for(const [x,z,turn] of [[-4.5,-11.5,0],[1.5,-11.6,0],[12,-6,Math.PI/2],[12,2,Math.PI/2],[6,11,0],[-3,11,0]])k.g(box(3,.05,.14).rotateY(turn),0xf3f6ff,[x,y+.15,z],4).r(box(3.05,.04,.2).rotateY(turn),0x2a2d30,[x,y+.2,z]);
 return k;
}
// The roller door in the end wall (frame, slats rolled up to L.door.open; the opening is its own lit plane) and
// a two-post lift by it.
function endWall(){
 const k=new Kit(),d=L.door,w=d.x1-d.x0,GREY=0x5b6267;k.p(box(.22,d.top,.3),GREY,[d.x0-.11,d.top/2,0]).p(box(.22,d.top,.3),GREY,[d.x1+.11,d.top/2,0]).p(box(w+.6,.55,.55),0x3c4247,[(d.x0+d.x1)/2,d.top+.25,.08]);
 for(let y=d.open;y<d.top;y+=.11)k.p(box(w,.1,.04),y%.22<.11?0x8e959a:0x7f868b,[(d.x0+d.x1)/2,y+.05,.04]);
 k.p(box(w,.06,.06),0x2a2d30,[(d.x0+d.x1)/2,d.open+.03,.06]);
 const l=L.lift,BLUE=0x3b5f86;for(const x of [l.x0,l.x1])k.p(box(.32,3.9,.32),BLUE,[x,1.95,.7]).p(box(.6,.05,.5),0x2a2d30,[x,.03,.7]).m(box(.06,3.6,.06),STEEL,[x+(x===l.x0?.2:-.2),1.9,.7]);
 k.p(box(l.x1-l.x0+.3,.24,.24),BLUE,[(l.x0+l.x1)/2,3.95,.7]);for(const x of [l.x0,l.x1])for(const s of [-1,1])k.p(box(.08,.06,.9).rotateY(s*.5),0xc01e25,[x+(x===l.x0?.35:-.35),.42,.7+s*.35]);
 for(let i=0;i<3;i++)for(let j=0;j<4;j++)k.p(box(.42,.3,.5),[0x2a2d30,YELLOW,0x5b6267,0xc01e25][(i+j*2)%4],[12.2+j*.55,.35+i*.75,.35]);
 for(let i=0;i<4;i++)k.p(box(2.4,.03,.6),0x5f676c,[13,.18+i*.75,.35]);for(const x of [11.8,14.2])k.p(box(.04,2.6,.6),0x5f676c,[x,1.3,.35]);
 return k;
}

// ---- Screens ----
function surface(w,h){const k=SMALL?.5:1,c=document.createElement('canvas');c.width=Math.round(w*k);c.height=Math.round(h*k);const ctx=c.getContext('2d');ctx.scale(k,k);const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;return {ctx,map,w,h};}
const FONT='Arial,sans-serif',MONO='Consolas,"Courier New",monospace';
function text(ctx,value,x,y,font,fill,align='left',max){ctx.font=font;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=fill;ctx.fillText(value,x,y,max);}
function scanlines(ctx,w,h){ctx.fillStyle='rgba(255,255,255,.035)';for(let y=0;y<h;y+=3)ctx.fillRect(0,y,w,1);}
// A lap's speed trace of its own for each car (seeded by its number): straights and braking zones from a few
// waves, the gear (and so the revs) from the speed.
function lapTrace(seed,top){
 const r=rng(seed*7919%2147483646+1),waves=[1,2,3,5,7].map(f=>[f,(.4+r())/f,r()*6.28]),n=240,speed=[];
 for(let i=0;i<n;i++){const u=i/n;let v=0;for(const [f,a,p] of waves)v+=a*Math.cos(u*f*Math.PI*2+p);speed.push(v);}
 const lo=Math.min(...speed),hi=Math.max(...speed);return speed.map(v=>62+(top-62)*Math.pow((v-lo)/(hi-lo),.85));
}
class Screens{
 constructor(){this.live=surface(1024,576);this.grid=surface(1024,576);this.desk=surface(1536,320);this.car=null;this.clock=0;this.next=0;}
 show(entry,model){
  const seed=[...entry.number+model].reduce((a,c)=>a*31+c.charCodeAt(0),7)%100000+1,fusca=model==='fusca',top=fusca?166:208;
  this.car={entry,model,seed,top,rpm:fusca?[2400,6200]:[2800,6600],trace:lapTrace(seed,top),label:`${MODEL_NAMES[model].toUpperCase()} #${entry.number}`};
  this.drawGrid();this.drawDesk();this.drawLive(this.clock);this.next=this.clock+.1;
 }
 update(dt){this.clock+=dt;if(this.car&&this.clock>=this.next){this.next=this.clock+.1;this.drawLive(this.clock);}}
 header(ctx,w,title,right){ctx.fillStyle='#0a0f13';ctx.fillRect(0,0,w,576);ctx.fillStyle='#142430';ctx.fillRect(0,0,w,58);ctx.fillStyle='#f0c52b';ctx.fillRect(0,58,w,3);text(ctx,title,22,30,`bold 26px ${FONT}`,'#e9f1f5','left',w-260);if(right)text(ctx,right,w-22,30,`bold 20px ${FONT}`,'#8fe39a','right');}
 // Live telemetry: speed, revs and pedals scrolling, the tyres, oil, water and fuel.
 drawLive(t){
  const {ctx,w,h,map}=this.live,c=this.car,n=c.trace.length,at=t*14,i0=Math.floor(at);
  this.header(ctx,w,`TELEMETRIA · ${c.label} · ${c.entry.shortName.toUpperCase()}`,'');
  if(t%1.2<.75){ctx.fillStyle='#e23b3b';ctx.beginPath();ctx.arc(w-128,30,8,0,7);ctx.fill();}text(ctx,'AO VIVO',w-22,30,`bold 20px ${FONT}`,'#f2f4f5','right');
  const gx=24,gw=650,v=k=>c.trace[((k%n)+n)%n],rpm=s=>{const span=c.top/4.6,f=(s%span)/span;return c.rpm[0]+(c.rpm[1]-c.rpm[0])*(s<span?s/span:f*.62+.38);};
  const strip=(y,hh,title,unit,value,fill,max,min=0)=>{
   ctx.fillStyle='#0f171d';ctx.fillRect(gx,y,gw,hh);ctx.strokeStyle='rgba(143,163,173,.18)';ctx.lineWidth=1;for(let g=1;g<4;g++){ctx.beginPath();ctx.moveTo(gx,y+hh*g/4);ctx.lineTo(gx+gw,y+hh*g/4);ctx.stroke();}
   ctx.strokeStyle=fill;ctx.lineWidth=3;ctx.beginPath();for(let s=0;s<=120;s++){const val=value(i0-120+s+(at-i0)),x=gx+gw*s/120,yy=y+hh-(val-min)/(max-min)*hh*.92-hh*.04;s?ctx.lineTo(x,yy):ctx.moveTo(x,yy);}ctx.stroke();
   text(ctx,title,gx+10,y+16,`bold 15px ${FONT}`,'#8fa3ad');const now=value(at);text(ctx,`${Math.round(now)}`,gx+gw+20,y+hh/2-6,`bold 40px ${MONO}`,fill,'left');text(ctx,unit,gx+gw+22,y+hh/2+26,`bold 14px ${FONT}`,'#8fa3ad');
  };
  const lerp=k=>{const a=Math.floor(k);return v(a)+(v(a+1)-v(a))*(k-a);};
  strip(78,170,'VELOCIDADE','km/h',lerp,'#56d0ff',c.top+10);strip(262,130,'GIRO','rpm',k=>rpm(lerp(k)),'#f0c52b',c.rpm[1]+200,c.rpm[0]-600);
  const pedal=k=>{const d=lerp(k+1)-lerp(k);return d>=0?100:Math.max(0,-d*14);};strip(406,100,'ACELERADOR · FREIO','%',pedal,'#8fe39a',105);
  const px=gx+gw+130,tw=96;text(ctx,'PNEUS °C',px,92,`bold 16px ${FONT}`,'#8fa3ad');
  ['DE','DD','TE','TD'].forEach((name,k)=>{const temp=Math.round(78+(c.seed%7)+k*2+6*Math.sin(t*.4+k)),x=px+(k%2)*(tw+10),y=108+Math.floor(k/2)*(tw+10),hue=Math.max(0,Math.min(1,(temp-70)/30));
   ctx.fillStyle=`hsl(${200-hue*170},70%,${34+hue*8}%)`;ctx.fillRect(x,y,tw,tw);text(ctx,name,x+8,y+16,`bold 14px ${FONT}`,'#e9f1f5');text(ctx,`${temp}`,x+tw/2,y+tw/2+10,`bold 34px ${MONO}`,'#ffffff','center');});
  const rows=[['ÓLEO',`${Math.round(101+3*Math.sin(t*.23))} °C`],['ÁGUA',`${Math.round(86+2*Math.sin(t*.17+1))} °C`],['COMBUSTÍVEL',`${(44-(t*.05)%20).toFixed(1)} L`],['MARCHA',`${Math.min(5,1+Math.floor(lerp(at)/(c.top/4.6)))}ª`]];
  rows.forEach(([k,val],i)=>{const y=346+i*44;ctx.fillStyle=i%2?'#0f171d':'#121c23';ctx.fillRect(px-8,y-20,2*tw+26,40);text(ctx,k,px,y,`bold 15px ${FONT}`,'#8fa3ad');text(ctx,val,px+2*tw+10,y,`bold 22px ${MONO}`,'#f2f4f5','right');});
  scanlines(ctx,w,h);map.needsUpdate=true;
 }
 // The field in two columns, the chosen car in the team's yellow.
 drawGrid(){
  const {ctx,w,h,map}=this.grid,c=this.car,list=rosterOf(c.model).choices;this.header(ctx,w,c.model==='fusca'?'O GRID · COPA FUSCA 2026':'O GRID · OLD STOCK RACE 2026',`${list.length} CARROS`);
  list.forEach((e,i)=>{const col=i<8?0:1,row=i<8?i:i-8,x=22+col*(w/2),y=96+row*58,me=e.number===c.entry.number,cw=w/2-44;
   ctx.fillStyle=me?'#f0c52b':row%2?'#0f171d':'#121c23';ctx.fillRect(x,y-25,cw,50);
   ctx.fillStyle=cssColor(e.color);ctx.fillRect(x+10,y-17,44,34);ctx.fillStyle=cssColor(e.stripe);ctx.fillRect(x+10,y-3,44,7);
   const dark=luminance(e.color)>.55;text(ctx,e.number,x+32,y,`900 italic 20px ${FONT}`,dark?'#141716':'#f4f3ee','center');
   text(ctx,e.shortName.toUpperCase(),x+68,y,`bold 21px ${FONT}`,me?'#141716':'#d8e4ea','left',cw-150);if(me)text(ctx,'VOCÊ',x+cw-12,y,`900 18px ${FONT}`,'#141716','right');});
  scanlines(ctx,w,h);map.needsUpdate=true;
 }
 // The desk's three monitors on one canvas: lap times, the engine map, the setup sheet.
 drawDesk(){
  const {ctx,w,h,map}=this.desk,c=this.car,r=rng(c.seed),pw=w/3;ctx.fillStyle='#0a0f13';ctx.fillRect(0,0,w,h);
  const head=(x,title)=>{ctx.fillStyle='#142430';ctx.fillRect(x,0,pw,40);text(ctx,title,x+16,21,`bold 20px ${FONT}`,'#e9f1f5');};
  head(0,`VOLTAS · #${c.entry.number}`);const laps=Array.from({length:8},()=>.2+r()*.75),best=Math.min(...laps);
  laps.forEach((v,i)=>{const bh=(1-v)*190+40,x=24+i*58;ctx.fillStyle=v===best?'#b16cff':'#56d0ff';ctx.fillRect(x,h-24-bh,40,bh);text(ctx,`${i+1}`,x+20,h-12,`bold 13px ${FONT}`,'#8fa3ad','center');});
  head(pw,'MAPA DO MOTOR');for(let i=0;i<10;i++)for(let j=0;j<6;j++){const val=Math.min(1,.15+i*.07+j*.06+r()*.12);ctx.fillStyle=`hsl(${210-val*200},75%,${30+val*18}%)`;ctx.fillRect(pw+24+i*48,58+j*40,44,36);text(ctx,(10+val*4).toFixed(1),pw+46+i*48,76+j*40,`bold 12px ${MONO}`,'#0a0f13','center');}
  head(2*pw,'ACERTO DO CARRO');
  const setup=[['Pressão pneus',`${26+(c.seed%3)} / ${24+(c.seed%2)} psi`],['Cambagem diant.',`−${(2+r()).toFixed(1)}°`],['Barra estabil.',`${2+(c.seed%3)} de 5`],['Freio diant.',`${56+(c.seed%6)} %`],['Altura',`${(c.model==='fusca'?7:9)+(c.seed%3)} cm`]];
  setup.forEach(([k,val],i)=>{const y=70+i*48;text(ctx,k,2*pw+18,y,`bold 19px ${FONT}`,'#8fa3ad');text(ctx,val,w-18,y,`bold 22px ${MONO}`,'#f2f4f5','right');});
  ctx.fillStyle='#000';for(const x of [pw,2*pw])ctx.fillRect(x-2,0,4,h);scanlines(ctx,w,h);map.needsUpdate=true;
 }
}

// ---- Floor ----
// Glossy epoxy: the painted map and the fine grain repeated close up. With the mirror on (mirror) it lets through
// as much as it reflects of the room the studio drew upside down under it first (car-select.js): more at grazing
// angles (Fresnel), less where the flecks break the coat. Drawn on the screen with the screen's own programs: a
// reflection picture of its own needed every material compiled once more (seconds on the first visit).
export function floorMaterial(map,grain){
 const uniforms={mirror:{value:0},grain:{value:grain}};
 const material=new THREE.MeshStandardMaterial({name:'Piso_epoxi_garagem',map,roughness:.34,metalness:0,envMapIntensity:.9,transparent:true});
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vFloor;').replace('#include <project_vertex>','#include <project_vertex>\nvFloor=(modelMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vFloor;uniform sampler2D grain;uniform float mirror;')
   .replace('#include <map_fragment>','#include <map_fragment>\nfloat fleck=texture2D(grain,vFloor.xz*.42).r;diffuseColor.rgb*=.8+.4*fleck;')
   .replace('#include <opaque_fragment>',`float ndv=clamp(dot(normalize(vViewPosition),normal),0.,1.),fresnel=.06+.94*pow(1.-ndv,5.);
diffuseColor.a=1.-mirror*clamp(fresnel*1.2*(1.1-.35*fleck),0.,.8);
#include <opaque_fragment>`);
 };
 material.customProgramCacheKey=()=>'garagem-piso';
 return {material,uniforms};
}

// The garage: root (add it to the studio's scene), deck (the turntable's top: add it to what turns), show(entry,
// model) for the screens, update(dt), mirror(on) and floor (hidden while the studio draws the room upside down),
// bake(renderer) for the environment map the paint and the garage reflect. Few kinds of material (lit with vertex
// colours, lit with a map, unlit with either, the floor): each kind is a shader program to build on the first visit.
export function createGarage(){
 const root=new THREE.Group();root.name='Garagem_carros';
 const M={
  paint:new THREE.MeshStandardMaterial({name:'pintado',vertexColors:true,roughness:.36,metalness:.22}),
  metal:new THREE.MeshStandardMaterial({name:'metal',vertexColors:true,roughness:.24,metalness:.92}),
  matte:new THREE.MeshStandardMaterial({name:'fosco',vertexColors:true,roughness:.8}),
  glow:new THREE.MeshBasicMaterial({name:'luzes',vertexColors:true})
 };
 const parts=new Parts(M),W=G.right-G.wall,D=G.front-G.end,H=G.height;
 // Floor, walls, ceiling. The long wall's canvas starts at the front corner, the end wall's at the long wall.
 const floor=floorMaterial(floorMap(),grainMap()),floorMesh=new THREE.Mesh(new THREE.PlaneGeometry(W,D).rotateX(-Math.PI/2),floor.material);
 floorMesh.position.set((G.wall+G.right)/2,0,(G.end+G.front)/2);floorMesh.name='Garagem_piso';root.add(floorMesh);
 const lights=[-1.35,2.4,-5.1,-10.2,-12.4];
 const longWall=new THREE.MeshStandardMaterial({name:'Parede_longa',map:wallMap(D,lights.map(z=>G.front-z),5),roughness:.62,metalness:.1});
 const endWallMat=new THREE.MeshStandardMaterial({name:'Parede_fundo',map:wallMap(W,[-4.6,6,9,13.4].map(x=>x-G.wall),9),roughness:.62,metalness:.1});
 const plane=(material,w,h,pos,turn)=>{const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h).rotateY(turn),material);mesh.position.set(...pos);root.add(mesh);return mesh;};
 plane(longWall,D,H,[G.wall,H/2,(G.end+G.front)/2],Math.PI/2);plane(endWallMat,W,H,[(G.wall+G.right)/2,H/2,G.end],0);
 plane(longWall,D,H,[G.right,H/2,(G.end+G.front)/2],-Math.PI/2);plane(endWallMat,W,H,[(G.wall+G.right)/2,H/2,G.front],Math.PI);
 parts.add(M.matte,paint(new THREE.PlaneGeometry(W,D).rotateX(Math.PI/2).translate((G.wall+G.right)/2,H,(G.end+G.front)/2),0x15171a));
 // LED strips along the walls (cool white under the dark band, yellow over the kick panels).
 const strips=new Kit();for(const [x,z,len,turn] of [[G.wall+.02,(G.end+G.front)/2,D,0],[(G.wall+G.right)/2,G.end+.02,W,-Math.PI/2],[G.right-.02,(G.end+G.front)/2,D,Math.PI],[(G.wall+G.right)/2,G.front-.02,W,Math.PI/2]]){
  const s=new Kit();s.g(box(.03,.035,len),0xf3f6ff,[0,4.92,0],3.2).g(box(.02,.022,len),YELLOW,[0,.135,0],1.6);parts.place(s,x,z,0,turn);}
 // Wall lights over the pools painted on the walls.
 for(const z of lights){const s=new Kit();s.r(box(.3,.1,.5),0x1d2023,[.15,4.78,0]).g(box(.004,.06,.4),0xfff3dd,[.302,4.76,0],4);parts.place(s,G.wall,z);}
 // Long wall: chests and tool board, cans, rack and tyres, the logo over the cups, the data desk and its screens, extinguisher and reel.
 for(const c of L.chests)parts.place(rollCab(c.w,c.seed,c.top),G.wall,c.z);
 parts.place(chestTop(1.055),G.wall,L.chests[1].z);
 for(const [i,[x,z]] of L.cans.entries())parts.place(jerryCan(i?0xc01e25:YELLOW),x,z,0,(i-.5)*.3);
 const board=new THREE.Mesh(new THREE.PlaneGeometry(L.board.w,L.board.h).rotateY(Math.PI/2),new THREE.MeshStandardMaterial({name:'Painel_ferramentas_garagem',map:toolBoard(),roughness:.55,metalness:.15}));
 board.position.set(G.wall+.03,L.board.y,L.board.z);root.add(board);parts.place(new Kit().m(box(.03,L.board.h+.06,L.board.w+.06),0x7d858a,[.005,0,0]),G.wall,L.board.z,L.board.y);
 parts.place(rack(L.rack.w),G.wall,L.rack.z);
 parts.place(trophies(L.trophies.w),G.wall,L.trophies.z);
 const sign=new Kit();sign.r(box(.05,L.logo.h+.42,L.logo.w+.7),0x0e1012,[.025,0,0]).g(box(.012,.025,L.logo.w+.66),0xf3f6ff,[.055,L.logo.h/2+.19,0],3).g(box(.012,.025,L.logo.w+.66),0xf3f6ff,[.055,-L.logo.h/2-.19,0],3);parts.place(sign,G.wall,L.logo.z,L.logo.y);
 const halo=new THREE.Mesh(new THREE.PlaneGeometry(L.logo.w*1.35,L.logo.h*1.5).rotateY(Math.PI/2),new THREE.MeshBasicMaterial({name:'Logo_brilho',map:haloMap(),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));halo.position.set(G.wall+.06,L.logo.y,L.logo.z);root.add(halo);
 const logoMap=new THREE.TextureLoader().load('./assets/abertura/logo_auto_pobre_racing_v2.webp');logoMap.colorSpace=THREE.SRGBColorSpace;logoMap.anisotropy=8;
 const logo=new THREE.Mesh(new THREE.PlaneGeometry(L.logo.w,L.logo.h).rotateY(Math.PI/2),new THREE.MeshBasicMaterial({name:'Logo_garagem',map:logoMap,transparent:true,depthWrite:false,color:new THREE.Color(1.3,1.3,1.3)}));logo.position.set(G.wall+.07,L.logo.y,L.logo.z);logo.renderOrder=1;root.add(logo);
 const {desk:deskKit,chair}=desk(L.desk.len);parts.place(deskKit,G.wall,L.desk.z);parts.place(chair,G.wall+1.45,L.desk.z+.45,0,.5);
 parts.place(safety(),G.wall,-12.6);
 parts.place(engineStand(),L.engine.x,L.engine.z,0,L.engine.turn);parts.place(jack(),L.jack.x,L.jack.z,0,L.jack.turn);
 parts.place(ceiling(),0,0);parts.place(endWall(),0,G.end);
 // Screens: two big ones on the wall (live telemetry, the field) and the desk's three monitors.
 const screens=new Screens(),screenMaterial=map=>new THREE.MeshBasicMaterial({name:'Tela_garagem',map,color:new THREE.Color(1.15,1.15,1.15)});
 L.screens.forEach((z,i)=>{const s=new Kit();s.r(box(.06,1.1,1.9),0x0b0c0d,[.06,0,0]).r(box(.14,.3,.1),0x2a2d30,[.04,0,0]);parts.place(s,G.wall,z,2.65);
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1.8,1.0125).rotateY(Math.PI/2),screenMaterial(i?screens.grid.map:screens.live.map));mesh.position.set(G.wall+.095,2.65,z);root.add(mesh);});
 const deskMaterial=screenMaterial(screens.desk.map);
 [[-.78,.28],[0,0],[.78,-.28]].forEach(([dz,turn],i)=>{const g=new THREE.PlaneGeometry(.7,.38),uv=g.attributes.uv;for(let k=0;k<uv.count;k++)uv.setX(k,(i+uv.getX(k))/3);
  const mesh=new THREE.Mesh(g.rotateY(Math.PI/2+turn),deskMaterial);mesh.position.set(G.wall+.22+.02*Math.cos(turn),.76+.36,L.desk.z+dz-.02*Math.sin(turn));root.add(mesh);});
 // Daylight in the roller doors: the end wall's and, behind the camera, one in the front wall (seen in the paint).
 const day=new THREE.MeshBasicMaterial({name:'Luz_do_dia',map:daylightMap(),color:new THREE.Color(2.2,2.2,2.2)});
 const dw=L.door.x1-L.door.x0;plane(day,dw,L.door.open,[(L.door.x0+L.door.x1)/2,L.door.open/2,G.end+.01],0);plane(day,7,3.4,[4,1.7,G.front-.01],Math.PI);
 // Tyres: the rack's (standing, tread out) and two stacks on the floor, each a little turned, in one mesh; the tread
 // takes the sidewall canvas's plain dark corner.
 const tyreSlots=[];for(const [y,count] of [[.12,7],[.84,7],[1.56,5]])for(let i=0;i<count;i++)tyreSlots.push({stand:true,x:G.wall+.31,y:y+.33,z:L.rack.z-L.rack.w/2+.18+i*.28});
 for(const [x,z,count] of L.stacks)for(let i=0;i<count;i++)tyreSlots.push({stand:false,x,y:.12+i*.245,z});
 const tyre=new THREE.CylinderGeometry(.31,.31,.24,28),tread=tyre.attributes.uv;for(let i=0;i<29*2;i++)tread.setXY(i,.03,.03);
 const r=rng(23),m4=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),one=new THREE.Vector3(1,1,1),p=new THREE.Vector3();
 const tyres=new THREE.Mesh(mergeGeometries(tyreSlots.map(s=>{if(s.stand)e.set(Math.PI/2,r()*6.28,(r()-.5)*.06,'XYZ');else e.set(0,r()*6.28,0);
  return tyre.clone().applyMatrix4(m4.compose(p.set(s.x+(s.stand?(r()-.5)*.04:(r()-.5)*.05),s.y,s.z),q.setFromEuler(e),one));}),false),new THREE.MeshStandardMaterial({name:'Pneus_garagem',map:sidewallMap(),roughness:.74}));
 tyres.name='Garagem_pneus';root.add(tyres);
 // The turntable: a fixed base with a yellow light round its foot; the brushed top (deck) turns with the car.
 const base=new Kit();base.p(cyl(G.ring+.2,G.deck-.01,96),0x1a1c1f,[0,(G.deck-.01)/2,0]).g(cyl(G.ring+.205,.018,96,G.ring+.205,true),YELLOW,[0,.022,0],2.4).m(cyl(G.ring+.08,.012,96,G.ring+.08,true),0x8d949a,[0,G.deck-.008,0]);parts.place(base,0,0);
 // The box number on the end wall and round the turntable: the car's (show), the 99 until one is shown.
 const boxPaint=surface(1024,Math.round(1024*BOX_SIGN.h/BOX_SIGN.w)),deckPaint=surface(1024,1024);let boxNumber=null;
 const showBox=number=>{if(number===boxNumber)return;boxNumber=number;boxSign(boxPaint.ctx,boxPaint.w,boxPaint.h,number);deckArt(deckPaint.ctx,deckPaint.w,deckPaint.h,number);boxPaint.map.needsUpdate=deckPaint.map.needsUpdate=true;};showBox('99');
 plane(new THREE.MeshStandardMaterial({name:'Box_numero',map:boxPaint.map,transparent:true,depthWrite:false,roughness:.62,metalness:.1}),BOX_SIGN.w,BOX_SIGN.h,[BOX_SIGN.x,BOX_SIGN.y,G.end+.015],0);
 const deck=new THREE.Mesh(new THREE.CircleGeometry(G.ring,96).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({name:'Plataforma_giratoria',map:deckPaint.map,roughness:.38,metalness:.55}));deck.name='Plataforma_giratoria';deck.position.y=-.004;
 parts.build(root);
 root.traverse(o=>{if(o.isMesh){o.updateMatrix();o.matrixAutoUpdate=false;}});root.updateMatrixWorld(true);
 const garage={root,deck,screens,floor:floorMesh,
  show:(entry,model)=>{screens.show(entry,model);showBox(entry.number);},
  update:dt=>screens.update(dt),
  // The floor lets the upside-down room through (on), or only the room's map shows in it.
  mirror(on){floor.uniforms.mirror.value=on?1:0;floor.material.envMapIntensity=on?.3:.9;},
  // The room as the paint sees it from the car's middle: what glows (the ceiling's hexagons, the strips, the doors'
  // daylight, the logo, the screens) in a dark box of the walls' tone. Only unlit materials: baking the whole garage
  // built a lit program of every material once more, for a picture nobody sees whole (seconds on the first visit).
  bake(renderer){
   const room=new THREE.Scene(),walls=new THREE.Mesh(paint(new THREE.BoxGeometry(W,H,D).scale(-1,1,1).translate((G.wall+G.right)/2,H/2,(G.end+G.front)/2),0x2a2f33),M.glow);
   room.background=new THREE.Color(0x0c0e10);room.add(walls);
   root.traverse(o=>{if(!o.isMesh||!o.material?.isMeshBasicMaterial)return;const copy=new THREE.Mesh(o.geometry,o.material);copy.matrixAutoUpdate=false;copy.matrix.copy(o.matrixWorld);copy.renderOrder=o.renderOrder;room.add(copy);});
   const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromScene(room,.02,.1,80,{position:new THREE.Vector3(0,1.1,0)}).texture;pmrem.dispose();walls.geometry.dispose();return env;
  },
  info:()=>({meshes:root.children.length,tyres:tyreSlots.length,mirror:floor.uniforms.mirror.value>0,screen:screens.car?.label??null,box:boxNumber})
 };
 return garage;
}
// The garage's lights: sky and floor bounce, a key from above the camera's side, a cool rim from the wall behind.
export function garageLights(scene){
 const key=new THREE.DirectionalLight(0xfff2e0,1.55);key.position.set(3,10,5);
 const rim=new THREE.DirectionalLight(0xc4d8ff,.75);rim.position.set(-7,4.5,-4);
 scene.add(key,rim,new THREE.HemisphereLight(0xdfe8ff,0x2b2723,.55));
}
