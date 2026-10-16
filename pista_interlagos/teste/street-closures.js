import * as THREE from 'three';
import {canvasTexture} from './pit-textures.js';
import {sceneryBands,bandClearance,standLayout} from './track-clearance.js';
import {billboardSpots,billboardFormat} from './track-surface.js';
import {marshalSpots,towerSpots} from './trackside.js';
import {createPeople} from './pit-crew.js';
import {Shape,CityBatch,cityMaterial,cityCarTemplate,carFrame,frameAt,pickCarType,carPaint,rimColor,random,lin,FINISH,GLOW,ROLE,CITY_CAR_SIZE,BUS_DESTINATIONS,drawBusSign} from './city-cars.js';
import {addRoamSolids} from './physics.js';

// A real city closed for a race weekend, like Monaco (Floripa, data.scenery.city.closures from gerar_cidade_floripa.py): where
// each real street meets the walls of the circuit, a few metres out along it, a line of improvised barriers across the
// street, curb to curb and on over the sidewalks, put together from whatever the city had in stock: water-filled plastic
// barriers in orange or red and white, galvanized crowd fences on their feet, concrete Jersey blocks on the big avenues,
// cones (some knocked over) with plastic chain, A-frame boards and signs on stands (the street's real name, RUA INTERDITADA,
// DESVIO, credentials only), amber flashers blinking each on its own clock, a municipal pickup across a lane. No two
// closures alike: each is drawn from its own dice, every unit a little out of line. Behind each one, the city held back:
// a queue of cars in the street's lanes, nose to the barrier (a bus, a van, motoboys at the front), an agent in a vest,
// a few people at the barrier watching the race; and the cars parked along the curbs of the side streets.
// Everything is static and drawn in one material (city-cars.js cityMaterial): merged per TILE square into a near geometry
// shown within NEAR metres of the camera (shortened by a long lens), and per GROUP x GROUP tiles into a far one that leaves
// out the tiles drawn near; so a dozen draw calls at most cover the city.

const TILE=250,GROUP=3,QUEUE_NEAR=42,PARK_FULL=450,LOD_NEAR=80,LENS_REF=Math.tan(29*Math.PI/180);
// Sign atlas (1024 px square): the white corner the plain parts sample, the boards, banners and a bus's destination, the
// cloth banner strung across a street (and its back, the print seen through the cloth), and a strip per named street
// (512 x 56 from y 448, two to a row); below the square, the queued buses' destination displays (512 x 64, two to a row).
// [x0, y0, x1, y1] in pixels.
const ATLAS=1024,ATLAS_H=1280,NAME_TOP=448,NAMES_MAX=18,DEST_TOP=1024;
const R={white:[0,0,128,128],interditada:[128,0,384,128],bloqueada:[384,0,640,128],desvioR:[640,0,896,128],zebraRed:[896,0,1024,64],zebraOrange:[896,64,1024,128],
 desvioL:[0,128,256,256],credenciados:[256,128,512,256],impedido:[512,128,768,256],atencao:[768,128,1024,256],
 proibida:[0,256,512,320],restrita:[512,256,1024,320],faixa:[0,352,1024,448],faixaBack:[0,952,1024,1024]};
// The buses held at the closures: turned away (DESVIO, ESPECIAL) or on their way to the island's classics.
const BUS_SIGNS=['DESVIO · CENTRO','ESPECIAL · TICEN',...BUS_DESTINATIONS.slice(0,6)];
const destRect=k=>[(k%2)*512,DEST_TOP+Math.floor(k/2)*64,(k%2)*512+512,DEST_TOP+Math.floor(k/2)*64+64];
const uvRect=([x0,y0,x1,y1],inset=3)=>[(x0+inset)/ATLAS,1-(y1-inset)/ATLAS_H,(x1-inset)/ATLAS,1-(y0+inset)/ATLAS_H];
const nameRect=k=>[(k%2)*512,NAME_TOP+Math.floor(k/2)*56,(k%2)*512+512,NAME_TOP+Math.floor(k/2)*56+56];
const WHITE_UV=[64/ATLAS,1-64/ATLAS_H];
const BOLD='"Arial Black","Arial Bold",Arial,sans-serif',CONDENSED='Impact,"Arial Narrow","Arial Black",sans-serif';

// The street's name as its plates abbreviate it, without the nickname in brackets.
const shortName=n=>n.replace(/\s*\(.*\)\s*/g,'').replace(/^Avenida /,'AV. ').replace(/^Rua /,'R. ').replace(/^Alameda /,'AL. ').replace(/^Servidão /,'SERV. ').replace(/^Rodovia /,'ROD. ').replace(/^Travessa /,'TV. ').toLocaleUpperCase('pt-BR');

function drawAtlas(names){
 return canvasTexture((ctx,W,H)=>{
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);
  const fill=(r,c)=>{ctx.fillStyle=c;ctx.fillRect(r[0],r[1],r[2]-r[0],r[3]-r[1]);};
  const frame=(r,c,w,inset=6)=>{ctx.strokeStyle=c;ctx.lineWidth=w;ctx.strokeRect(r[0]+inset+w/2,r[1]+inset+w/2,r[2]-r[0]-2*inset-w,r[3]-r[1]-2*inset-w);};
  const write=(t,x,y,size,c,max,font=BOLD,weight='900')=>{ctx.font=`${weight} ${size}px ${font}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=c;ctx.fillText(t,x,y,max);};
  const mid=r=>[(r[0]+r[2])/2,(r[1]+r[3])/2,r[2]-r[0],r[3]-r[1]];
  // Temporary traffic signs: orange sheeting with black letters and border; event boards in white and red; credentials in yellow.
  const board=(r,bg,fg,lines,{edge=fg,sizes=[.3,.36]}={})=>{fill(r,bg);frame(r,edge,8,7);const [cx,cy,w,h]=mid(r);
   if(lines.length===1)write(lines[0],cx,cy+2,h*.42,fg,w*.84);else{write(lines[0],cx,cy-h*.17,h*sizes[0],fg,w*.84);write(lines[1],cx,cy+h*.19,h*sizes[1],fg,w*.86);}};
  board(R.interditada,'#f28a1e','#141414',['RUA','INTERDITADA'],{sizes:[.26,.32]});
  board(R.bloqueada,'#f4f2ec','#c4161c',['VIA BLOQUEADA','EVENTO'],{sizes:[.27,.3]});
  board(R.credenciados,'#f6c31c','#141414',['ACESSO SOMENTE','CREDENCIADOS'],{sizes:[.2,.27]});
  board(R.impedido,'#f4f2ec','#c4161c',['TRÂNSITO','IMPEDIDO'],{sizes:[.28,.32]});
  board(R.atencao,'#f28a1e','#141414',['ATENÇÃO','CORRIDA NA PISTA'],{sizes:[.3,.2]});
  // DESVIO with a fat arrow, either way.
  for(const [r,dir] of [[R.desvioR,1],[R.desvioL,-1]]){fill(r,'#f28a1e');frame(r,'#141414',8,7);const [cx,cy,w,h]=mid(r);
   write('DESVIO',cx-dir*w*.15,cy+2,h*.34,'#141414',w*.55);
   const ax=cx+dir*w*.28,s=h*.22;ctx.fillStyle='#141414';ctx.beginPath();ctx.moveTo(ax-dir*s*1.1,cy-s*.38);ctx.lineTo(ax,cy-s*.38);ctx.lineTo(ax,cy-s);ctx.lineTo(ax+dir*s*1.05,cy);ctx.lineTo(ax,cy+s);ctx.lineTo(ax,cy+s*.38);ctx.lineTo(ax-dir*s*1.1,cy+s*.38);ctx.closePath();ctx.fill();}
  // Diagonal stripes for the boards' feet and the chain-and-board barricades.
  for(const [r,c] of [[R.zebraRed,'#c8161d'],[R.zebraOrange,'#f07a12']]){fill(r,'#f4f2ec');ctx.save();ctx.beginPath();ctx.rect(r[0],r[1],r[2]-r[0],r[3]-r[1]);ctx.clip();ctx.fillStyle=c;
   for(let x=r[0]-64;x<r[2]+64;x+=32){ctx.beginPath();ctx.moveTo(x,r[3]);ctx.lineTo(x+16,r[3]);ctx.lineTo(x+16+64,r[1]);ctx.lineTo(x+64,r[1]);ctx.closePath();ctx.fill();}ctx.restore();}
  // Banners zip-tied to the fences.
  {const r=R.proibida,[cx,cy,w,h]=mid(r);fill(r,'#f4f2ec');fill([r[0],r[1],r[2],r[1]+8],'#c4161c');fill([r[0],r[3]-8,r[2],r[3]],'#c4161c');write('PROIBIDA A PASSAGEM',cx,cy,h*.5,'#c4161c',w*.9);}
  {const r=R.restrita,[cx,cy,w,h]=mid(r);fill(r,'#c4161c');write('ÁREA RESTRITA · EVENTO',cx,cy,h*.5,'#f4f2ec',w*.9);}
  // The cloth banner across the street: red letters on white cloth, a blue stripe along each edge.
  {const r=R.faixa,[cx,cy,w,h]=mid(r);fill(r,'#f2f0e8');fill([r[0],r[1]+6,r[2],r[1]+14],'#1f4f9e');fill([r[0],r[3]-14,r[2],r[3]-6],'#1f4f9e');write('VIA INTERDITADA · CORRIDA',cx,cy+2,h*.5,'#c4161c',w*.92);}
  {const r=R.faixaBack,[cx,cy,w,h]=mid(r);fill(r,'#e4e1d8');fill([r[0],r[1]+4,r[2],r[1]+10],'#a9b4c8');fill([r[0],r[3]-10,r[2],r[3]-4],'#a9b4c8');ctx.save();ctx.translate(cx,0);ctx.scale(-1,1);write('VIA INTERDITADA · CORRIDA',0,cy+2,h*.52,'#d4aaa6',w*.92);ctx.restore();}
  // A bus's destination display: amber LEDs on black.
  BUS_SIGNS.forEach((t,k)=>{const r=destRect(k);drawBusSign(ctx,r[0],r[1],r[2]-r[0],r[3]-r[1],t);});
  // Street names: the city's blue plates.
  names.forEach((n,k)=>{const r=nameRect(k),[cx,cy,w,h]=mid(r);fill(r,'#1f4f9e');frame(r,'#f4f2ec',4,5);write(shortName(n),cx,cy+2,h*.5,'#f4f2ec',w*.9,BOLD,'800');});
 },ATLAS,ATLAS_H);
}

// ---------- The closure's pieces (templates; x along the piece, y toward its front, z up) ----------
// A face toward +y is read from +y, its left at +x: its texture runs from +x to -x (FRONT); a face toward -y reads the other way.
const P=FINISH,white=[1,1,1],FRONT=[[1,0],[0,0],[0,1],[1,1]],BACK=[[0,0],[1,0],[1,1],[0,1]];
// Grime: the lower part of a plastic or concrete piece darker (road dirt, rain splash).
const grime=(base,top)=>p=>{const k=.72+.28*Math.min(1,p[2]/top);return [base[0]*k,base[1]*k,base[2]*k];};
// A profile [[y, z], ...] (a closed section, counter-clockwise seen from +x) extruded from x0 to x1, its ends capped.
function extrude(sh,profile,x0,x1,col,fin,o={}){
 const n=profile.length,zc=profile.reduce((s,p)=>s+p[1],0)/n,yc=profile.reduce((s,p)=>s+p[0],0)/n;
 for(let k=0;k<n;k++){const [y0,z0]=profile[k],[y1,z1]=profile[(k+1)%n];sh.quad([x0,y0,z0],[x0,y1,z1],[x1,y1,z1],[x1,y0,z0],col,fin,{...o,out:[0,(y0+y1)/2-yc,(z0+z1)/2-zc]});}
 sh.poly(profile.map(([y,z])=>[x0,y,z]),col,fin,[-1,0,0],o);sh.poly(profile.map(([y,z])=>[x1,y,z]),col,fin,[1,0,0],o);
}
function pieceTemplates(){
 const T={},C={black:lin(0x141516),galv:lin(0xb4b9bb),galvDark:lin(0x8c9295),orange:lin(0xf05a14),reflect:lin(0xe9e9e4),wood:lin(0xd8d4c8),sand:lin(0xa8977a),amber:lin(0xffa21a),yellow:lin(0xf2c014),tyre:lin(0x161616),concrete:lin(0x8f8e88)};
 // Water-filled plastic barrier, l long and h high: a Jersey profile in thin wall plastic, the fork slots at its foot, the fill
 // cap on top and the lugs that lock it to the next one.
 const plastic=(l,h,far)=>{const sh=new Shape(),b=h*.28,t=h*.085;
  const prof=[[-b,0],[b,0],[b,h*.1],[b*.55,h*.42],[t,h*.97],[t*.5,h],[-t*.5,h],[-t,h*.97],[-b*.55,h*.42],[-b,h*.1]];
  if(far){extrude(sh,[[-b*.8,0],[b*.8,0],[t,h],[-t,h]],-l/2,l/2,white,P.plastic,{role:ROLE.paint});return sh.template(.3);}
  extrude(sh,prof,-l/2,l/2,grime(white,h),P.plastic,{role:ROLE.paint});
  for(const s of [-1,1])for(const x of [-l*.27,l*.27])sh.quad([x-.17,s*(b+.004),.0],[x+.17,s*(b+.004),.0],[x+.17,s*(b+.004),h*.085],[x-.17,s*(b+.004),h*.085],C.black,P.plastic,{out:[0,s,0]});
  sh.post([-l*.22,0,h*.99],[-l*.22,0,h+.035],.05,.045,6,white,P.plastic,{top:true,role:ROLE.paint});
  for(const z of [h*.25,h*.7])sh.box(l/2-.01,l/2+.05,-.05,.05,z,z+.1,white,P.plastic,{role:ROLE.paint,skip:'back'});
  sh.box(-l/2-.05,-l/2+.01,-.05,.05,h*.47,h*.57,white,P.plastic,{role:ROLE.paint,skip:'front'});
  return sh.template(.65);};
 T.plastic=[[1.2,.8],[1.5,.9],[2.0,1.0]].map(([l,h])=>({l,h,near:plastic(l,h),far:plastic(l,h,true)}));
 // Galvanized crowd fence (gradil): tube frame, vertical bars every ~12 cm, a flat foot at each end.
 const gradil=(l,far)=>{const sh=new Shape(),g=white,x0=-l/2+.03,x1=l/2-.03;
  for(const x of [x0,x1]){sh.post([x,0,.04],[x,0,1.1],.021,.021,4,g,P.galvanized,{top:true,role:ROLE.paint});if(!far)sh.box(x-.025,x+.025,-.3,.3,0,.025,g,P.galvanized,{role:ROLE.paint});}
  for(const z of far?[1.08]:[1.08,.2])sh.post([x0,0,z],[x1,0,z],.019,.019,4,g,P.galvanized,{role:ROLE.paint});
  if(far)sh.post([x0,0,.2],[x1,0,.2],.012,.012,3,g,P.galvanized,{role:ROLE.paint});
  else{const n=Math.round((x1-x0)/.125);for(let k=1;k<n;k++){const x=x0+(x1-x0)*k/n;sh.post([x,0,.2],[x,0,1.08],.008,.008,3,g,P.galvanized,{role:ROLE.paint});}}
  return sh.template(.9);};
 T.gradil=[2.0,2.5].map(l=>({l,h:1.1,near:gradil(l),far:gradil(l,true)}));
 // The lots' own walls along a zone's edge (lotWalls). A stretch of wall 1 x 1 x 1 m scaled to its length, thickness and
 // height, its foot 25 cm in the ground (a slope under it), the plaster painted, rain splash darker at the foot; the same
 // block makes the pillars. Its cap (pingadeira) in the second colour.
 {const slab=far=>{const sh=new Shape();sh.box(-.5,.5,-.5,.5,-.25,1,far?white:grime(white,1),P.concrete,{role:ROLE.paint});return sh.template(.3);};
  T.wallSlab={near:slab(),far:slab(true)};
  const cap=new Shape();cap.box(-.5,.5,-.5,.5,0,1,white,P.concrete,{role:ROLE.accent});T.wallCap=cap.template(.3);}
 // An iron railing (grade) 2 m long and 1 m high (scaled): rails top and bottom, a bar every 11 cm, in the rim colour.
 {const grade=far=>{const sh=new Shape(),n=far?6:18;
   for(const z of [.05,.95])sh.box(-1,1,-.022,.022,z-.03,z+.03,white,P.steel,{role:ROLE.rim,skip:''});
   for(let k=0;k<n;k++){const x=-1+(k+.5)*2/n;sh.box(x-.011,x+.011,-.011,.011,0,1,white,P.steel,{role:ROLE.rim,skip:'bottom top'});}
   return sh.template(.3);};
  T.grade={near:grade(),far:grade(true)};}
 // A sheet-metal gate 1 m wide and 1 m high (scaled to its opening): the sheet with its ribs on both faces, in the rim colour.
 {const gate=far=>{const sh=new Shape();sh.box(-.5,.5,-.025,.025,.03,1,white,P.steel,{role:ROLE.rim});
   if(!far)for(let k=1;k<8;k++){const x=-.5+k/8;for(const s of [-1,1])sh.box(x-.012,x+.012,s>0?.025:-.04,s>0?.04:-.025,.07,.96,white,P.steel,{role:ROLE.rim,skip:'bottom top'});}
   return sh.template(.3);};
  T.gate={near:gate(),far:gate(true)};}
 // A building site's hoarding (tapume) 1 m long and 1 m high: painted sheets on two battens, the posts behind.
 {const tapume=far=>{const sh=new Shape();sh.box(-.5,.5,-.02,.02,-.1,1,grime(white,1),P.board,{role:ROLE.paint});
   if(!far){for(const x of [-.25,.25])sh.box(x-.02,x+.02,.02,.045,-.05,1,white,P.board,{role:ROLE.paint,skip:'bottom'});
    for(const z of [.18,.82])sh.box(-.5,.5,-.09,-.02,z-.04,z+.04,C.wood,P.board,{skip:''});}
   return sh.template(.3);};
  T.tapume={near:tapume(),far:tapume(true)};}
 // Concrete Jersey block, 2 m (the big avenues).
 const jersey=far=>{const sh=new Shape(),prof=[[-.3,0],[.3,0],[.28,.08],[.13,.33],[.08,.81],[-.08,.81],[-.13,.33],[-.28,.08]];
  extrude(sh,far?[[-.28,0],[.28,0],[.08,.81],[-.08,.81]]:prof,-.99,.99,far?white:grime(white,.81),P.concrete,{role:ROLE.paint});return sh.template(.5);};
 T.jersey={l:2,h:.81,near:jersey(),far:jersey(true)};
 // Traffic cone, 75 cm: black square foot, orange cone with two white reflective bands.
 {const sh=new Shape();sh.box(-.18,.18,-.18,.18,0,.035,C.black,P.rubber);
  const bands=[[.035,.27,C.orange],[.27,.37,C.reflect],[.37,.47,C.orange],[.47,.55,C.reflect],[.55,.73,C.orange]],r=z=>.14-(.14-.028)*(z-.035)/(.73-.035);
  bands.forEach(([z0,z1,c],k)=>sh.post([0,0,z0],[0,0,z1],r(z0),r(z1),6,c,c===C.reflect?P.lens:P.plastic,{top:k===bands.length-1}));
  T.cone=sh.template(.8);
  const f=new Shape();f.post([0,0,0],[0,0,.72],.16,.02,4,C.orange,P.plastic);T.coneFar=f.template(.2);}
 // A link of plastic chain, 1 m along x (scaled to the span's segment).
 {const sh=new Shape();sh.post([0,0,0],[1,0,0],.013,.013,3,white,P.plastic,{role:ROLE.paint});T.chain=sh.template(.2);}
 // Amber flasher clipped on a barrier: yellow housing, the lens dome on top (lamp 1: blinks on the copy's phase).
 {const sh=new Shape();sh.box(-.06,.06,-.035,.035,0,.12,C.yellow,P.plastic,{skip:''});sh.post([0,0,.12],[0,0,.22],.075,.04,6,C.amber,P.lens,{top:true,glow:GLOW.flasher});
  T.flasher=sh.template(.6);const f=new Shape();f.box(-.07,.07,-.07,.07,0,.2,C.amber,P.lens,{glow:GLOW.flasher});T.flasherFar=f.template(.2);}
 // The light bar on the municipal pickup's roof: two amber halves flashing in turn.
 {const sh=new Shape();sh.box(-.14,.14,-.6,.6,0,.05,C.black,P.plastic);for(const [s,ph] of [[-1,0],[1,.5]])sh.box(-.11,.11,s<0?-.56:.04,s<0?-.04:.56,.05,.13,C.amber,P.lens,{glow:GLOW.flasher,phase:ph,skip:'bottom'});T.lightbar=sh.template(.4);}
 // A-frame board (cavalete): two boards hinged at the top, the front one (+y) with its sign (sign A) over a striped foot,
 // the back one with sign B; named: the street's plate on top of the front board (sign C).
 const aframe=(named,far)=>{const sh=new Shape(),top=named?1.27:1.12,k=.3/.95,y=z=>.025+(top-z)*k,w=.48;
  const board=(s,z0,z1,o)=>sh.quad([-w,s*y(z0),z0],[w,s*y(z0),z0],[w,s*y(z1),z1],[-w,s*y(z1),z1],white,P.board,{...o,out:[0,s,.3],uv:s>0?FRONT:BACK});
  for(const s of [-1,1]){
   board(s,.56,1.06,{role:s>0?ROLE.signA:ROLE.signB});
   const zr=uvRect(R.zebraRed);sh.quad([-w,s*y(.33),.33],[w,s*y(.33),.33],[w,s*y(.53),.53],[-w,s*y(.53),.53],white,P.board,{out:[0,s,.3],role:6,uv:[[zr[0],zr[1]],[zr[2],zr[1]],[zr[2],zr[3]],[zr[0],zr[3]]]});
   if(named&&s>0)board(s,1.09,1.25,{role:7});else if(named)sh.quad([-w,s*y(1.09),1.09],[w,s*y(1.09),1.09],[w,s*y(1.25),1.25],[-w,s*y(1.25),1.25],C.wood,P.board,{out:[0,s,.3]});
   // The boards' backs (inside the A), and the legs down to the ground.
   sh.quad([-w,s*(y(.33)-.012),.33],[w,s*(y(.33)-.012),.33],[w,s*(y(top)-.012),top],[-w,s*(y(top)-.012),top],C.wood,P.board,{out:[0,-s,-.3]});
   if(!far)for(const x of [-w-.02,w+.02])sh.post([x,s*y(top),top],[x,s*(y(0)),0],.022,.022,4,C.wood,P.board);
  }
  return sh.template(.3);};
 T.aframe={near:aframe(false),far:aframe(false,true)};T.aframeNamed={near:aframe(true),far:aframe(true,true)};
 // Sign on a stand, 1 x 0.5 m at 1.3-1.8 m, facing +y (sign A), its back plain galvanized; the stand: a tripod, a tyre filled
 // with concrete, a painted bucket of concrete (the second colour) or a rubber foot.
 const stand=(base,far)=>{const sh=new Shape(),zb=base==='tyre'?.16:base==='bucket'?.3:.06;
  sh.post([0,0,zb],[0,0,1.82],.024,.024,4,C.galvDark,P.galvanized,{top:true});
  sh.quad([-.5,.03,1.3],[.5,.03,1.3],[.5,.03,1.8],[-.5,.03,1.8],white,P.board,{out:[0,1,0],role:ROLE.signA,uv:FRONT});
  sh.box(-.5,.5,.004,.028,1.3,1.8,C.galv,P.galvanized,{skip:'left'});
  if(far)return sh.template(.3);
  if(base==='tripod')for(let k=0;k<3;k++){const a=k*2.094+.5;sh.post([0,0,.55],[Math.cos(a)*.42,Math.sin(a)*.42,0],.016,.016,4,C.galvDark,P.galvanized);}
  else if(base==='tyre'){const ring=(r,z)=>Array.from({length:8},(_,k)=>[Math.cos(k*Math.PI/4+.39)*r,Math.sin(k*Math.PI/4+.39)*r,z]);
   const O0=ring(.33,0),O1=ring(.33,.17),I1=ring(.19,.17);for(let k=0;k<8;k++){const j=(k+1)%8;sh.quad(O0[k],O0[j],O1[j],O1[k],C.tyre,P.rubber,{out:[O0[k][0]+O0[j][0],O0[k][1]+O0[j][1],0]});sh.quad(O1[k],O1[j],I1[j],I1[k],C.tyre,P.rubber,{out:[0,0,1]});}
   sh.poly(I1.map(p=>[p[0],p[1],.15]),C.concrete,P.concrete,[0,0,1]);}
  else if(base==='bucket')sh.post([0,0,0],[0,0,.3],.15,.18,8,white,P.plastic,{top:true,role:ROLE.accent});
  else sh.box(-.25,.25,-.25,.25,0,.06,C.black,P.rubber);
  return sh.template(.6);};
 T.stand=Object.fromEntries(['tripod','tyre','bucket','foot'].map(b=>[b,stand(b)]));T.standFar=stand('foot',true);
 // The tall one (plate at 1.62-2.12 m on a tripod, a flasher clipped on top): seen over the walls from the track.
 {const sh=new Shape();sh.post([0,0,.06],[0,0,2.14],.024,.024,4,C.galvDark,P.galvanized,{top:true});
  sh.quad([-.5,.03,1.62],[.5,.03,1.62],[.5,.03,2.12],[-.5,.03,2.12],white,P.board,{out:[0,1,0],role:ROLE.signA,uv:FRONT});sh.box(-.5,.5,.004,.028,1.62,2.12,C.galv,P.galvanized,{skip:'left'});
  for(let k=0;k<3;k++){const a=k*2.094+.5;sh.post([0,0,.7],[Math.cos(a)*.5,Math.sin(a)*.5,0],.016,.016,4,C.galvDark,P.galvanized);}
  T.standTall=sh.template(.6);const f=new Shape();f.post([0,0,.06],[0,0,2.14],.03,.03,3,C.galvDark,P.galvanized);f.quad([-.5,.03,1.62],[.5,.03,1.62],[.5,.03,2.12],[-.5,.03,2.12],white,P.board,{out:[0,1,0],role:ROLE.signA,uv:FRONT});f.box(-.5,.5,.004,.028,1.62,2.12,C.galv,P.galvanized,{skip:'left'});T.standTallFar=f.template(.3);}
 // A pole for the banner across the street (4.1 m of pipe) stuck in a tyre of concrete or a bucket.
 for(const base of ['tyre','bucket']){const sh=new Shape();sh.post([0,0,.1],[0,0,4.1],.05,.042,6,C.galv,P.galvanized,{top:true});
  if(base==='tyre'){const ring=(r,z)=>Array.from({length:8},(_,k)=>[Math.cos(k*Math.PI/4+.39)*r,Math.sin(k*Math.PI/4+.39)*r,z]),O0=ring(.33,0),O1=ring(.33,.17),I1=ring(.19,.17);
   for(let k=0;k<8;k++){const j=(k+1)%8;sh.quad(O0[k],O0[j],O1[j],O1[k],C.tyre,P.rubber,{out:[O0[k][0]+O0[j][0],O0[k][1]+O0[j][1],0]});sh.quad(O1[k],O1[j],I1[j],I1[k],C.tyre,P.rubber,{out:[0,0,1]});}sh.poly(I1.map(p=>[p[0],p[1],.15]),C.concrete,P.concrete,[0,0,1]);}
  else sh.post([0,0,0],[0,0,.32],.15,.18,8,white,P.plastic,{top:true,role:ROLE.accent});
  T['pole_'+base]=sh.template(.6);}
 {const f=new Shape();f.post([0,0,0],[0,0,4.1],.04,.04,3,C.galvDark,P.galvanized);T.poleFar=f.template(.2);}
 // The banner: 1 x 1 (scaled to its size), sign A to the front, sign B (the print seen through the cloth) behind.
 {const sh=new Shape();sh.quad([-.5,.004,0],[.5,.004,0],[.5,.004,1],[-.5,.004,1],white,P.cloth,{out:[0,1,0],role:ROLE.signA,uv:FRONT});sh.quad([-.5,-.004,0],[.5,-.004,0],[.5,-.004,1],[-.5,-.004,1],white,P.cloth,{out:[0,-1,0],role:ROLE.signB,uv:BACK});T.faixa=sh.template(.2);}
 // A banner zip-tied on a fence panel: 2 x 0.25 m, sign A in front, white behind.
 {const sh=new Shape();sh.quad([-1,.012,0],[1,.012,0],[1,.012,.25],[-1,.012,.25],white,P.cloth,{out:[0,1,0],role:ROLE.signA,uv:FRONT});sh.quad([-1,.006,0],[1,.006,0],[1,.006,.25],[-1,.006,.25],C.reflect,P.cloth,{out:[0,-1,0]});T.banner=sh.template(.2);}
 // Sandbag on a sign's foot.
 {const sh=new Shape();sh.box(-.24,.24,-.15,.15,0,.11,C.sand,P.cloth);sh.box(-.2,.2,-.12,.12,.11,.14,C.sand,P.cloth);T.sandbag=sh.template(.9);}
 return T;
}

// Colours of the pieces: the plastic pairs (orange or red, with white), now and then an odd one from another stock; the
// concrete of hired blocks; the fences' zinc, one in a while gone brown.
const PLASTIC={orange:lin(0xec5a12),red:lin(0xc41c22),white:lin(0xefeeea),yellow:lin(0xf0b81a)};
const PEOPLE_SKIN=[0xf1c7a5,0xe0b08a,0xd8a27e,0xc68e6a,0xa86e4c,0x84553a,0x5e3b28],HAIR=[0x1d1712,0x2b1f17,0x3b2a1a,0x4a3322,0x6b4a2e,0x8a8580,0xb9a27a,0x141414];
const SHIRTS=[0xf4f1ea,0x22252a,0x2e4f8c,0xc0392b,0x3d7a4a,0xe2b23a,0x7b4f9e,0x8fa3b8,0xd9775a,0x1f6f78,0xb8b2a6,0x111111];
const PANTS=[0x2a3346,0x3b4a66,0x1c1d20,0x5b5246,0x7d7466,0x2f3a2c,0xc9b996];

export async function createStreetClosures(data,{mobile=false,lean=false,ground=null,map=null}={}){
 const root=new THREE.Group();root.name='Bloqueios_ruas';const started=performance.now();
 const city=data.scenery?.city,list=city?.closures??[];
 const stats={zoneClosures:0,closures:0,skipped:0,underDeck:0,pieces:0,flashers:0,signs:0,queueCars:0,buses:0,motos:0,parked:0,parkedNear:0,parkedDropped:0,people:0,tiles:0,meshes:0,trianglesNear:0,trianglesFar:0,drawCalls:0,visibleTriangles:0};
 if(!list.length||!ground)return {root,stats};
 const a=data.samples,N=a.length,roam=!!data.meta.roam?.zones?.length,roamSolids=[];
 // ---- What must stay clear ----
 // The walls' corridor (asphalt, wall gap, the block and a metre: gerar_cidade_floripa.py's), from the nearest stretch of the lap.
 const CELL=24,grid=new Map(),cellOf=(x,y,c=CELL)=>Math.floor(x/c)+','+Math.floor(y/c);
 a.forEach((p,i)=>{const k=cellOf(p[1],p[2]);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);});
 const corridor=(x,y)=>{let best=Infinity;const cx=Math.floor(x/CELL),cy=Math.floor(y/CELL);
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const k of grid.get((cx+i)+','+(cy+j))??[]){
   const p=a[k],q=a[(k+1)%N],dx=q[1]-p[1],dy=q[2]-p[2],l2=dx*dx+dy*dy||1e-9;let u=((x-p[1])*dx+(y-p[2])*dy)/l2;u=u<0?0:u>1?1:u;
   const px=p[1]+dx*u,py=p[2]+dy*u,lat=(x-px)*p[9]+(y-py)*p[10],half=(p[4]+(q[4]-p[4])*u)/2+(lat>0?p[16]:p[15])+1;best=Math.min(best,Math.hypot(x-px,y-py)-half);}
  return best;};
 // Distance to the lap's centreline (coarse): which parked cars a player can see from the car.
 const FAR_CELL=460,farGrid=new Map();a.forEach((p,i)=>{if(i%3)return;const k=cellOf(p[1],p[2],FAR_CELL);if(!farGrid.has(k))farGrid.set(k,[]);farGrid.get(k).push(p);});
 const trackDistance=(x,y)=>{let best=Infinity;const cx=Math.floor(x/FAR_CELL),cy=Math.floor(y/FAR_CELL);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const p of farGrid.get((cx+i)+','+(cy+j))??[])best=Math.min(best,Math.hypot(x-p[1],y-p[2]));return best;};
 // The pit lane, the garages and the grandstands (track-clearance.js; the bridges' wide band is for the bay, not for the
 // streets under their viaducts), and the trackside furniture standing behind the walls.
 const bands=sceneryBands(data).filter(b=>['pit_lane','boxes','arquibancada'].includes(b.name));
 const boards=billboardSpots(data).map(q=>{const t=Math.hypot(q.p[7],q.p[8])||1;return {x:q.x,y:q.y,tx:q.p[7]/t,ty:q.p[8]/t};});
 const posts=[...marshalSpots(data).map(q=>({x:q.x,y:q.y,r:3})),...towerSpots(data).map(q=>({x:q.x,y:q.y,r:4}))].filter(q=>Number.isFinite(q.x));
 // (A billboard: its 14 m face along the lap, legs and catwalk within a metre of it.)
 const onBoard=(x,y,r)=>boards.some(b=>{const dx=x-b.x,dy=y-b.y,al=dx*b.tx+dy*b.ty;return Math.abs(al)<7.6+r&&Math.abs(dx*-b.ty+dy*b.tx)<1.2+r;});
 // (The pit lane is driven on: a metre and a half more of room from its asphalt.)
 const free=(x,y,r=0)=>{const b=bandClearance(bands,x,y);return b.distance>r+(b.band==='pit_lane'?1.8:.3)&&!posts.some(q=>Math.hypot(q.x-x,q.y-y)<q.r+r)&&!onBoard(x,y,r);};
 // (A zone's edge across the avenue behind the grandstands, meta.roam: past their end, it closes the street all the same.)
 const standsBand=bands.filter(b=>b.name!=='arquibancada'),freeOfStands=(x,y,r)=>bandClearance(standsBand,x,y).distance>r+.3&&!posts.some(q=>Math.hypot(q.x-x,q.y-y)<q.r+r)&&!onBoard(x,y,r);
 // Buildings: the cadastre's footprints (data.scenery.city.buildings rings) or the landscape's rectangles, and the landmarks'
 // outlines (the Rodoviária, the TICEN, the market...).
 const polys=[],BCELL=40,bgrid=new Map();
 {const B=city.buildings;if(B?.items&&B.columns.includes('ring')){const k=B.columns.indexOf('ring');for(const it of B.items)if(it[k]?.length>=6)polys.push(it[k]);}
  else if(data.scenery.buildings?.items){const c=Object.fromEntries(data.scenery.buildings.columns.map((k,i)=>[k,i]));for(const it of data.scenery.buildings.items){const x=it[c.x],y=it[c.y],w=it[c.w]/2,d=it[c.d]/2,cs=Math.cos(it[c.heading]),sn=Math.sin(it[c.heading]);polys.push([[-w,-d],[w,-d],[w,d],[-w,d]].flatMap(([u,v])=>[x+u*cs-v*sn,y+u*sn+v*cs]));}}
  for(const m of data.scenery.landmarks??[])if(m.outline?.length>=3)polys.push(m.outline.flat());
  polys.forEach((r,i)=>{let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(let k=0;k<r.length;k+=2){x0=Math.min(x0,r[k]);x1=Math.max(x1,r[k]);y0=Math.min(y0,r[k+1]);y1=Math.max(y1,r[k+1]);}
   for(let gx=Math.floor(x0/BCELL);gx<=Math.floor(x1/BCELL);gx++)for(let gy=Math.floor(y0/BCELL);gy<=Math.floor(y1/BCELL);gy++){const key=gx+','+gy;if(!bgrid.has(key))bgrid.set(key,[]);bgrid.get(key).push(i);}});}
 const inBuilding=(x,y)=>{for(const i of bgrid.get(cellOf(x,y,BCELL))??[]){const r=polys[i];let inside=false;for(let k=0,j=r.length-2;k<r.length;j=k,k+=2){const xi=r[k],yi=r[k+1],xj=r[j],yj=r[j+1];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}if(inside)return true;}return false;};
 const surface=(x,y)=>map?map.at(x,y):null;
 // Room taken (closure pieces, queued cars): discs in a hash, so the parked cars keep out of them.
 const taken=new Map(),TCELL=6,take=(x,y,r)=>{const k=cellOf(x,y,TCELL);if(!taken.has(k))taken.set(k,[]);taken.get(k).push([x,y,r]);};
 // The pieces of the closures on a zone's edge (meta.roam), where the edge needs nothing more (lotWalls, the zones' fences).
 const edgeTaken=new Map(),markEdge=(x,y)=>{const k=cellOf(x,y,TCELL);if(!edgeTaken.has(k))edgeTaken.set(k,[]);edgeTaken.get(k).push([x,y]);};
 const edgeCovered=(x,y,r)=>{const cx=Math.floor(x/TCELL),cy=Math.floor(y/TCELL);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const [px,py] of edgeTaken.get((cx+i)+','+(cy+j))??[])if(Math.hypot(px-x,py-y)<r)return true;return false;};
 const isTaken=(x,y,r)=>{const cx=Math.floor(x/TCELL),cy=Math.floor(y/TCELL);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const [px,py,pr] of taken.get((cx+i)+','+(cy+j))??[])if(Math.hypot(px-x,py-y)<pr+r)return true;return false;};

 // ---- Tiles: each TILE square has its near batch and its people; groups of GROUP x GROUP tiles share a far batch, whose
 // copies carry their tile's number so the far mesh leaves out the tiles drawn near (cityMaterial hide) ----
 const tiles=new Map(),groups=new Map();
 const tileAt=(x,y)=>{const i=Math.floor(x/TILE),j=Math.floor(y/TILE),k=i+','+j;
  if(!tiles.has(k)){const gi=Math.floor(i/GROUP),gj=Math.floor(j/GROUP),gk=gi+','+gj,S=TILE*GROUP;
   if(!groups.has(gk))groups.set(gk,{key:gk,box:[gi*S,gj*S,(gi+1)*S,(gj+1)*S],batch:new CityBatch(),mesh:null,state:-1});
   const t={key:k,id:tiles.size+1,box:[i*TILE,j*TILE,(i+1)*TILE,(j+1)*TILE],near:new CityBatch(),people:[],group:groups.get(gk),state:-1,d:0};
   t.far={add:(tpl,f,o)=>t.group.batch.add(tpl,f,{...o,tile:t.id})};tiles.set(k,t);}
  return tiles.get(k);};
 const T=pieceTemplates(),names=[...new Set(list.map(c=>c.name).filter(Boolean))].slice(0,NAMES_MAX),atlas=drawAtlas(names);
 // (Off the cheap levels the near meshes switch their cars between the full build and the box by the camera's distance.)
 const lod=!mobile&&!lean,material=cityMaterial(atlas,{lod}),farMaterial=cityMaterial(atlas,{hide:true,uniforms:material.userData.uniforms});
 const signUv=Object.fromEntries(Object.entries(R).map(([k,r])=>[k,uvRect(r)])),nameUv=n=>{const k=names.indexOf(n);return k<0?null:uvRect(nameRect(k));},busUv=BUS_SIGNS.map((t,k)=>uvRect(destRect(k)));
 const clearings=[],skip=(why,ci)=>{stats.skipped++;(stats.skippedWhy[why]??=[]).push(ci);};stats.skippedWhy={};
 // The queued vehicles [x, y, closure], for the checks (not enumerable: the stats print stays short).
 const queued=[];Object.defineProperty(stats,'queued',{value:queued});

 // ---- The streets' centrelines: the queue follows the street it waits in ----
 // Its own street (the closure's OSM way, c.street; without one, the nearest street along the closure's heading), walked
 // out from the line to the way's end and a few metres on at most; and stopped short of any other street as big as it or
 // bigger, where the path would reach that street's carriageway: a queue never spills onto the avenue it waits to leave.
 const streets=city.streets??[],SEG=24,sgrid=new Map();
 const RANK={motorway:9,trunk:8,primary:7,secondary:6,tertiary:5,busway:5,unclassified:4,residential:4,living_street:3,service:2};
 const rankOf=s=>(RANK[(s.kind??'').replace('_link','')]??3)-((s.kind??'').endsWith('_link')?.5:0);
 streets.forEach((st,si)=>{const Q=st.points;for(let i=0;i<Q.length-1;i++){const x0=Math.min(Q[i][0],Q[i+1][0])-12,x1=Math.max(Q[i][0],Q[i+1][0])+12,y0=Math.min(Q[i][1],Q[i+1][1])-12,y1=Math.max(Q[i][1],Q[i+1][1])+12;
  for(let gx=Math.floor(x0/SEG);gx<=Math.floor(x1/SEG);gx++)for(let gy=Math.floor(y0/SEG);gy<=Math.floor(y1/SEG);gy++){const k=gx+','+gy;if(!sgrid.has(k))sgrid.set(k,[]);sgrid.get(k).push(si,i);}}});
 // On another street's carriageway (half its width and a little), that street ranking at least `rank`.
 const onBigger=(x,y,own,rank)=>{const list=sgrid.get(cellOf(x,y,SEG));if(!list)return false;
  for(let n=0;n<list.length;n+=2){const si=list[n];if(si===own)continue;const st=streets[si];if(rankOf(st)<rank)continue;const Q=st.points,i=list[n+1],dx=Q[i+1][0]-Q[i][0],dy=Q[i+1][1]-Q[i][1],l2=dx*dx+dy*dy||1e-9;
   let u=((x-Q[i][0])*dx+(y-Q[i][1])*dy)/l2;u=u<0?0:u>1?1:u;if(Math.hypot(x-Q[i][0]-dx*u,y-Q[i][1]-dy*u)<(Q[i][2]+(Q[i+1][2]-Q[i][2])*u)/2+.6)return true;}
  return false;};
 function streetPath(c){
  let best=null;const hx=Math.cos(c.heading),hy=Math.sin(c.heading),own=c.street!=null?streets.findIndex(st=>st.id===c.street):-1;
  streets.forEach((st,si)=>{if(own>=0&&si!==own)return;const Q=st.points;for(let i=0;i<Q.length-1;i++){
   const dx=Q[i+1][0]-Q[i][0],dy=Q[i+1][1]-Q[i][1],l=Math.hypot(dx,dy);if(l<1e-6)continue;
   let u=((c.x-Q[i][0])*dx+(c.y-Q[i][1])*dy)/(l*l);u=Math.max(0,Math.min(1,u));const d=Math.hypot(c.x-Q[i][0]-dx*u,c.y-Q[i][1]-dy*u);if(own<0&&d>7)continue;
   const al=(dx*hx+dy*hy)/l;if(own<0&&Math.abs(al)<.7)continue;const score=d+(own<0&&st.name!==c.name?4:0);
   if(!best||score<best.score)best={score,si,i,u,dir:al>0?1:-1};}});
  const pts=[];let flow=null,rank=2;
  if(best){const st=streets[best.si],Q=st.points,{i,u,dir}=best;rank=rankOf(st);
   pts.push([Q[i][0]+(Q[i+1][0]-Q[i][0])*u,Q[i][1]+(Q[i+1][1]-Q[i][1])*u,Q[i][2]+(Q[i+1][2]-Q[i][2])*u]);
   if(dir>0)for(let k=i+1;k<Q.length;k++)pts.push(Q[k]);else for(let k=i;k>=0;k--)pts.push(Q[k]);
   // A one-way street runs in the order of its points (OpenStreetMap's way): walking out along it, the traffic goes away
   // (-1, gerar_cidade_floripa.py's flow) or comes to the line (+1).
   flow=st.oneway?-dir:0;}
  else pts.push([c.x,c.y,c.width-.6]);
  if(pts.length<2)pts.push([pts[0][0]+hx*20,pts[0][1]+hy*20,pts[0][2]]);
  // Past the way's end a few metres straight on (its last point may stop short of the curb line), no more.
  const last=pts.at(-1),prev=pts.at(-2),ex=last[0]-prev[0],ey=last[1]-prev[1],el=Math.hypot(ex,ey)||1;pts.push([last[0]+ex/el*3,last[1]+ey/el*3,last[2]]);
  const acc=[0];for(let k=1;k<pts.length;k++)acc.push(acc[k-1]+Math.hypot(pts[k][0]-pts[k-1][0],pts[k][1]-pts[k-1][1]));
  const at=u=>{let k=1;while(k<pts.length-1&&acc[k]<u)k++;const p=pts[k-1],q=pts[k],f=Math.max(0,Math.min(1,(u-acc[k-1])/((acc[k]-acc[k-1])||1)));
   return {x:p[0]+(q[0]-p[0])*f,y:p[1]+(q[1]-p[1])*f,w:p[2]+(q[2]-p[2])*f,h:Math.atan2(q[1]-p[1],q[0]-p[0])};};
  // Where the path first reaches a street as big as its own (past the first metres, the junction the line stands in).
  let end=acc.at(-1);for(let u=4;u<end;u+=1){const q=at(u);if(onBigger(q.x,q.y,best?best.si:-1,rank)){end=u;break;}}
  return {flow:c.flow??flow,end,at};
 }

 // ---- One closure ----
 // (The middle of the line, the carriageway's central half: an oblique street's line runs on toward the walls, its pieces
 // stopping short of them, put().)
 const crossing=(c,P)=>{for(let v=-c.right.curb*.5;v<=c.left.curb*.5+1e-6;v+=.5){const [x,y]=P(-.8,v);if(corridor(x,y)<.5)return false;}return true;};
 list.forEach((c0,ci)=>{
  const rand=random(9973*(ci+1)+Math.round(Math.abs(c0.x)*31)+Math.round(Math.abs(c0.y)*17)),H=c0.heading,ux=Math.cos(H),uy=Math.sin(H),vx=-uy,vy=ux;
  const c={...c0};let ox=c0.x,oy=c0.y;const P=(u,v)=>[ox+ux*u+vx*v,oy+uy*u+vy*v];
  // Each side of the street along the line: where the carriageway ends (the curb) and where the sidewalk does (a wall, a
  // lot): the map knows. The line runs curb to curb and on over the sidewalks, up to 3.5 m of them.
  const scan=dir=>{let curb=null,edge=null;const half=(c0.width-.6)/2;
   for(let v=0;v<=half+9;v+=.25){const [x,y]=P(0,dir*v),d=surface(x,y);if(!d)break;
    if(curb===null&&v>half*.4&&d.road>.05)curb=v;
    if(curb!==null&&(inBuilding(x,y)||!(d.sidewalk<.1||d.plaza<.1||d.cycleway<.1||d.green<.1||d.parking<.1)||d.road<-.3&&v>curb+.6)){edge=v-.15;break;}}
   curb??=half;edge??=curb+2.2;return {curb,edge:Math.max(curb,Math.min(edge,curb+3.5))};};
  c.left=scan(1);c.right=scan(-1);
  // Out along the street until the whole line (with a metre in front of it) is clear of the walls' corridor.
  let push=0;while(!crossing(c,P)&&push<14){push+=.5;ox+=ux*.5;oy+=uy*.5;if(push%2===0){c.left=scan(1);c.right=scan(-1);}}
  // (Skipped: a street the line cannot cross clear of the walls, one inside the pits or the grandstands, under a billboard.)
  if(!crossing(c,P))return skip('walls',ci);if(!(c0.zone?freeOfStands(ox,oy,2):free(ox,oy,2)))return skip(bandClearance(bands,ox,oy).distance<2.3?bandClearance(bands,ox,oy).band:'trackside',ci);
  const g0=ground(ox,oy);if(g0==null)return skip('ground',ci);
  // The lap runs overhead here (a bridge's viaduct): the street is closed under it all the same.
  const near=a.reduce((b,p)=>Math.hypot(p[1]-ox,p[2]-oy)<Math.hypot(b[1]-ox,b[2]-oy)?p:b,a[0]),under=near[3]-g0>4;if(under)stats.underDeck++;
  stats.closures++;if(c0.zone){stats.zoneClosures++;stats.zonePush=Math.max(stats.zonePush??0,push);}
  const tile=tileAt(ox,oy),room=c0.room-push,lanes=Math.max(1,c0.lanes|0),width=c.left.curb+c.right.curb;
  const big=(['trunk','primary','secondary','busway'].includes(c0.kind)&&(lanes>=3||width>=11)),small=!big&&(c0.kind==='service'||width<=5.2);
  let farthest=0;
  // Puts a piece at (u, v) of the closure, turned `turn` from the line's direction (its +y then faces the track), on the
  // ground; far: its far version (null: none).
  const put=(tpl,far,u,v,turn,opts={},{lift=0,pitch=0,roll=0,s=[1,1,1]}={})=>{const o={shade:.86+rand()*.14,...opts};
   const [x,y]=P(u,v),z=ground(x,y);if(z==null||!(c0.zone?freeOfStands(x,y,.3):free(x,y,.3))||corridor(x,y)<.3)return false;
   const f=frameAt(x,y,z+lift,H+Math.PI/2+turn,{pitch,roll,s});tile.near.add(tpl,f,o);if(far)tile.far.add(far,f,o);stats.pieces++;farthest=Math.max(farthest,u);take(x,y,.9);if(c0.zone)markEdge(x,y);return true;};
  // ---- The barrier line ----
  const pair=rand()<.55?['orange','white']:rand()<.8?['red','white']:['orange','red'];
  const plasticColor=k=>rand()<.035?PLASTIC.yellow:PLASTIC[pair[k%2]];
  const units=[];
  const fill=(v0,v1,kind,u0=0,{zig=true}={})=>{
   let v=v0+rand()*.08,k=Math.floor(rand()*2);
   while(v<v1-.35){
    const opts=kind==='plastic'?T.plastic:kind==='gradil'?T.gradil:[T.jersey];let pick=opts[Math.floor(rand()*opts.length)];
    if(v+pick.l>v1+.3)pick=opts.reduce((m,o)=>o.l<m.l?o:m,opts[0]);if(v+pick.l>v1+.45)break;
    const vc=v+pick.l/2;let du=(rand()-.5)*.09,turn=(rand()-.5)*.05;
    if(kind==='plastic')du+=k%2?.025:-.025;if(kind==='gradil'&&zig)turn+=k%2?.06:-.06;
    // Now and then one pushed out of line (somebody squeezed through, or a car nudged it).
    if(rand()<.06){du+=(rand()<.5?-1:1)*(.15+rand()*.35);turn+=(rand()<.5?-1:1)*(.12+rand()*.3);}
    const color=kind==='plastic'?plasticColor(k):kind==='jersey'?lin(rand()<.15?0xa59a7e:0x9c9b95,.82+rand()*.24):lin(rand()<.08?0x9a8a74:0xffffff,.86+rand()*.16);
    if(put(pick.near,pick.far,u0+du,vc,turn,{paint:color,shade:.88+rand()*.14}))units.push({kind,u:u0+du,v:vc,turn,l:pick.l,h:pick.h});
    v+=pick.l+(kind==='plastic'?-.02+rand()*.07:kind==='gradil'?.03+rand()*.12:.03+rand()*.06);k++;
   }
  };
  const main=big?(rand()<.65?'jersey':'plastic'):small?(rand()<.45?'gradil':'plastic'):(rand()<.5?'plastic':rand()<.6?'gradil':'mixed');
  const cL=c.left.curb,cR=c.right.curb;
  if(main==='mixed'){const m=(cL-cR)/2,half=Math.min(2.6,(cL+cR)/2-1);fill(-cR,m-half,'gradil');fill(m-half,m+half,'plastic');fill(m+half,cL,'gradil');}
  else if(small&&rand()<.22){
   // A narrow lane closed with cones and chain only.
   const n=Math.max(2,Math.round((cL+cR)/1.4)+1),pts=[];for(let k=0;k<n;k++){const v=-cR+.3+(cL+cR-.6)*k/(n-1)+(rand()-.5)*.15,u=(rand()-.5)*.15;if(put(T.cone,T.coneFar,u,v,rand()*6))pts.push([u,v]);}
   chainSpan(pts);
  }
  else fill(-cR,cL,main);
  // The sidewalks: fences across, the plastic line carried on, or left open to walk through (a cone or two at the gap).
  const sidewalk=[];
  for(const [side,{curb,edge}] of [[1,c.left],[-1,c.right]]){
   if(edge-curb<.8)continue;const r=rand(),v0=side>0?curb+.1:-edge,v1=side>0?edge:-curb-.1;
   // (On a zone's edge never left open: the car would stop at nothing there.)
   if(r<.55||c0.zone&&r>=.75)fill(v0,v1,'gradil',(rand()-.5)*.3);
   else if(r<.75)fill(v0,v1,main==='jersey'?'plastic':main==='mixed'?'gradil':main==='gradil'?'gradil':'plastic',0);
   else{sidewalk.push({side,curb,edge});const pts=[];for(const v of [side*(curb+.35),side*(edge-.2)])if(put(T.cone,T.coneFar,.05+(rand()-.5)*.2,v,rand()*6))pts.push([0,v]);if(rand()<.6)chainSpan(pts);}
  }
  // A second row on the big avenues, a couple of metres behind.
  if(big){const u2=1.7+rand()*1.1;fill(-cR+.4,cL-.4,main==='jersey'?(rand()<.5?'plastic':'gradil'):'gradil',u2);}
  // Plastic chain between cones: links of red and white, sagging between them.
  function chainSpan(pts){
   for(let k=0;k<pts.length-1;k++){const [u0,v0]=pts[k],[u1,v1]=pts[k+1],n=8,sag=.1+rand()*.12,red=lin(0xc8161d),wh=lin(0xf2f0ea);
    for(let s=0;s<n;s++){const f0=s/n,f1=(s+1)/n,zf=f=>.62-sag*4*f*(1-f),A=[u0+(u1-u0)*f0,v0+(v1-v0)*f0,zf(f0)],B=[u0+(u1-u0)*f1,v0+(v1-v0)*f1,zf(f1)];
     const [x0,y0]=P(A[0],A[1]),[x1,y1]=P(B[0],B[1]),z0=ground(x0,y0),z1=ground(x1,y1);if(z0==null||z1==null)continue;
     const dx=x1-x0,dy=y1-y0,dz=(z1+B[2])-(z0+A[2]),l=Math.hypot(dx,dy,dz);if(l<.01)continue;
     tile.near.add(T.chain,frameAt(x0,y0,z0+A[2],Math.atan2(dy,dx),{pitch:Math.asin(dz/l),s:[l,1,1]}),{paint:s%2?red:wh});}}
  }
  // Flashers on top of some barriers.
  const tops=units.filter(q=>q.kind!=='gradil').sort(()=>rand()-.5).slice(0,big?3:1+Math.floor(rand()*2));
  for(const q of tops)if(put(T.flasher,T.flasherFar,q.u,q.v+(rand()-.5)*q.l*.5,q.turn,{phase:rand()},{lift:q.kind==='jersey'?.81:q.h}))stats.flashers++;
  // A banner on one of the fences, facing the track.
  const fences=units.filter(q=>q.kind==='gradil');
  if(fences.length&&rand()<.55){const q=fences[Math.floor(rand()*fences.length)];put(T.banner,null,q.u-.03,q.v,q.turn,{signA:rand()<.5?signUv.proibida:signUv.restrita},{lift:.62+rand()*.2,s:[q.l/2.2,1,1]});stats.signs++;}
  // The A-frame board: on the track's side of the line or the street's, its front (the street's name over RUA INTERDITADA
  // or VIA BLOQUEADA) to the track, DESVIO to the traffic.
  const nameRegion=nameUv(c0.name),dir=rand()<.5?1:-1,detour=dir>0?signUv.desvioR:signUv.desvioL;
  if(rand()<(small?.65:.85)){const front=rand()<.6,u=front?-.9-rand()*.7:1.0+rand()*.6,v=(rand()-.5)*Math.min(cL+cR-1.5,4);
   const tpl=nameRegion?T.aframeNamed:T.aframe;
   if(put(tpl.near,tpl.far,u,v,(rand()-.5)*.35,{signA:rand()<.55?signUv.interditada:signUv.bloqueada,signB:rand()<.6?detour:signUv.interditada,signC:nameRegion})){stats.signs++;if(rand()<.5)put(T.sandbag,null,u+.05,v+.35,rand());}}
  // The sign on a stand, out on the street for the traffic (its back to the track).
  if(rand()<(big?.95:small?.35:.7)){const u=2.4+rand()*2.2,s=rand()<.5?1:-1,v=s*Math.max(0,(s>0?cL:cR)-.9-rand()*.6),base=['tripod','tyre','bucket','foot','tall','tall'][Math.floor(rand()*6)];
   const msg=[detour,detour,signUv.interditada,signUv.credenciados,signUv.impedido,signUv.atencao][Math.floor(rand()*6)],turn=Math.PI+(rand()-.5)*.4;
   if(put(base==='tall'?T.standTall:T.stand[base],base==='tall'?T.standTallFar:T.standFar,u,v,turn,{signA:msg,accent:lin([0xe8e4da,0x2a5aa8,0xd6431a,0x3c8a4a][Math.floor(rand()*4)])})){stats.signs++;
    if(base==='tall'&&put(T.flasher,T.flasherFar,u,v,turn,{phase:rand()},{lift:2.13}))stats.flashers++;if(base==='tripod'&&rand()<.6)put(T.sandbag,null,u+.25,v+.2,rand());}}
  // On the track's side: a second board facing the track on wide streets.
  if(rand()<(small?.35:.75)){const u=-1.2-rand()*.8,v=(rand()<.5?1:-1)*Math.max(0,Math.min(cL,cR)-1.2),tall=rand()<.6,turn=(rand()-.5)*.3;
   if(put(tall?T.standTall:T.stand[rand()<.5?'foot':'tyre'],tall?T.standTallFar:T.standFar,u,v,turn,{signA:[signUv.bloqueada,signUv.atencao,signUv.impedido,signUv.interditada][Math.floor(rand()*4)],accent:lin(0xe8e4da)})){stats.signs++;
    if(tall&&rand()<.7&&put(T.flasher,T.flasherFar,u,v,turn,{phase:rand()},{lift:2.13}))stats.flashers++;}}
  // A cloth banner strung across the street between two poles, over the line: VIA INTERDITADA, seen from the track.
  if(rand()<(under?.2:small?.4:.85)){
   // As near the track as its poles stand clear of the walls (in front of the line where there is room): seen over them.
   const side=(e,s)=>s*(e.edge-e.curb>.7?e.curb+.35:e.curb-.35),vl=side(c.left,1),vr=side(c.right,-1),span=vl-vr,base=rand()<.6?'tyre':'bucket';
   const W=Math.min(span-.5,small?2.6+rand()*1.2:3.4+rand()*3.4),vc=(vl+vr)/2+(rand()-.5)*(span-W)*.6,z0=(small?2.6:3.0)+rand()*.45,hb=(small?.55:.72)+rand()*.1;
   const clear=u=>[vl,vr].every(v=>{const [x,y]=P(u,v);return ground(x,y)!=null&&free(x,y,.4)&&corridor(x,y)>.4;});
   let u=-1.6+rand()*.4;while(u<6&&!clear(u))u+=.4;
   const [xl,yl]=P(u,vl),[xr,yr]=P(u,vr),[xc,yc]=P(u,vc),gl=ground(xl,yl),gr=ground(xr,yr),gc=ground(xc,yc);
   if(span>2.6&&gc!=null&&clear(u)){
    const acc=lin([0x2a5aa8,0xd6431a,0xe8e4da][Math.floor(rand()*3)]);put(T['pole_'+base],T.poleFar,u,vl,rand()*6,{accent:acc});put(T['pole_'+base],T.poleFar,u,vr,rand()*6,{accent:acc});
    const f=frameAt(xc,yc,gc+z0,H+Math.PI/2+(rand()-.5)*.04,{roll:(rand()-.5)*.04,s:[W,1,hb]}),o={signA:signUv.faixa,signB:signUv.faixaBack};tile.near.add(T.faixa,f,o);tile.far.add(T.faixa,f,o);stats.signs++;stats.banners=(stats.banners??0)+1;
    // The ropes: from each pole's top and from lower down to the banner's corners.
    const rope=lin(0x3a3936),tie=(px,py,pz,qx,qy,qz)=>{const dx=qx-px,dy=qy-py,dz=qz-pz,l=Math.hypot(dx,dy,dz);if(l<.05)return;tile.near.add(T.chain,frameAt(px,py,pz,Math.atan2(dy,dx),{pitch:Math.asin(dz/l),s:[l,1.3,1.3]}),{paint:rope});};
    for(const [s0,vp,gp] of [[1,vl,gl],[-1,vr,gr]]){const [px,py]=P(u,vp),[bx,by]=P(u,vc+s0*W/2);tie(px,py,gp+4.05,bx,by,gc+z0+hb);tie(px,py,gp+z0-.1,bx,by,gc+z0);}
   }
  }
  // Loose cones: some in front of the line, some knocked over, a few out on the street.
  const cones=small?2+Math.floor(rand()*3):3+Math.floor(rand()*5);
  for(let k=0;k<cones;k++){const u=rand()<.6?-.5-rand()*2.2:1+rand()*3,v=(rand()-.5)*(cL+cR-.6)+(cL-cR)/2;
   if(rand()<.2)put(T.cone,T.coneFar,u,v,rand()*6,{},{pitch:-(Math.PI/2-.2),lift:.15});else put(T.cone,T.coneFar,u,v,rand()*6);}
  // The municipal pickup across a lane on the big avenues, its light bar flashing.
  let queueFrom=farthest+2.5+rand()*2.5;
  if(big&&rand()<.8){
   const s=rand()<.5?1:-1,u=farthest+3+rand()*2,v=s*((s>0?cL:cR)-2.6),turn=s*(.35+rand()*.5);const [x,y]=P(u,v);
   const f=carFrame('pickup',x,y,H+Math.PI/2*s+turn*.3,ground);
   if(f&&free(x,y,1)){const o={paint:lin(0xf3f3f0),rim:lin(0x9a9da0),lamps:true};tile.near.add(cityCarTemplate('pickup'),f,o);tile.far.add(cityCarTemplate('pickup',true),f,o);
    const top=frameAt(f.o[0]+f.z[0]*1.8-f.x[0]*.3,f.o[1]+f.z[1]*1.8-f.x[1]*.3,f.o[2]+f.z[2]*1.8,H+Math.PI/2*s+turn*.3);const lb={phase:rand()};tile.near.add(T.lightbar,top,lb);tile.far.add(T.lightbar,top,lb);
    stats.flashers++;take(x,y,3);queueFrom=u+4+rand()*2;}
  }
  // ---- People: an agent in a vest, a few watching the race over the barrier ----
  if(!lean&&!(mobile&&rand()<.6)){
   const person=(u,v,yaw,outfit,idle,pose='stand')=>{const [x,y]=P(u,v),z=ground(x,y);if(z==null||!free(x,y,.4)||corridor(x,y)<.4||inBuilding(x,y))return;tile.people.push({outfit,pose,x,y:z,z:-y,yaw,idle,name:'Pessoa_bloqueio'});stats.people++;take(x,y,.5);};
   const skin=()=>PEOPLE_SKIN[Math.floor(rand()*PEOPLE_SKIN.length)],hair=()=>HAIR[Math.floor(rand()*HAIR.length)];
   if(rand()<(small?.3:.6)){const lime=rand()<.4;person(1.1+rand()*1.2,(rand()-.5)*(cL+cR-2)+(cL-cR)/2,H+(rand()-.5)*1.6,{skin:skin(),hair:hair(),top:lime?0xc9dd2a:0xf06a1a,trim:0xdfe3e0,bottom:0x23293a,sleeves:rand()<.5?'short':'long',hat:rand()<.6?'cap':null,hatColor:0x1c2a46},'marshal');}
   if(!under&&rand()<(big?.5:.38)){
    const n=1+Math.floor(rand()*(mobile?1:3)),side=sidewalk[0]?.side??(rand()<.5?1:-1),edge=side>0?c.left:c.right;
    for(let k=0;k<n;k++){const v=edge.edge-edge.curb>1?side*(edge.curb+.4+rand()*(edge.edge-edge.curb-.6)):(rand()-.5)*(cL+cR-1.5)+(cL-cR)/2;
     person(.55+rand()*.35+k*.05,v+k*.62*side*-1,H+Math.PI+(rand()-.5)*.7,{skin:skin(),hair:hair(),hairStyle:rand()<.3?'long':rand()<.1?'curly':'short',top:SHIRTS[Math.floor(rand()*SHIRTS.length)],bottom:PANTS[Math.floor(rand()*PANTS.length)],sleeves:rand()<.75?'short':'long',hat:rand()<.25?'cap':null,hatColor:SHIRTS[Math.floor(rand()*SHIRTS.length)],belly:rand()<.3?rand()*.6:0,glasses:rand()<.15},'terrace',rand()<.5?'folded':'stand');}
   }
  }
  // The closure keeps its trees out (the landscape's), the queue's too.
  clearings.push({x:ox+ux*1.5,y:oy+uy*1.5,r:Math.max(cL,cR)+2.5});
  // ---- The traffic held back: a queue in each lane that runs toward the closure ----
  if(room<10)return;
  const path=streetPath({...c0,x:ox,y:oy}),flow=path.flow,qEnd=Math.min(room,path.end-1.5);
  if(flow===-1||qEnd<10)return;
  const cap=mobile?3:lean?5:8,lanesHere=[];
  {const w=Math.max(3,path.at(queueFrom).w);
   if(flow===1||(flow===null&&rand()<.5)){const n=Math.min(lanes,Math.max(1,Math.round(w/3.1)));for(let k=0;k<n;k++)lanesHere.push(-w/2+w/n*(k+.5));}
   else{const n=Math.max(1,Math.min(Math.floor(lanes/2)||1,Math.round(w/2/3.1)));for(let k=0;k<n;k++)lanesHere.push(w/2/n*(k+.5));}}
  // A city bus held in the outer lane of the avenues the lines run on, second or third in its queue.
  const busLane=(big||c0.kind==='primary'||c0.kind==='secondary')&&rand()<.55?lanesHere.length-1:-1,busAt=1+Math.floor(rand()*2);
  // Motoboys squeezed to the front between the lanes (or by the curb on a one-lane street).
  if(rand()<(lanesHere.length>1?.65:.3)){const n=1+Math.floor(rand()*(lanesHere.length>1?3:2));for(let k=0;k<n;k++){
   const u=queueFrom-1.2+k*(1.5+rand()*.8);if(u>qEnd)break;const q=path.at(u),lv=lanesHere.length>1?(lanesHere[0]+lanesHere[1])/2:lanesHere[0]+1.1,x=q.x-Math.sin(q.h)*(lv+(rand()-.5)*.3),y=q.y+Math.cos(q.h)*(lv+(rand()-.5)*.3);
   const d=surface(x,y);if(d&&d.road>-.3)continue;const f=carFrame('moto',x,y,q.h+Math.PI+(rand()-.5)*.25,ground);if(!f||isTaken(x,y,.6)||inBuilding(x,y))continue;
   const o={paint:lin([0xf2f2ef,0xc81d25,0x1d1f22,0xd8b21a,0x2a5aa8][Math.floor(rand()*5)]),rim:lin([0x1d1f24,0x2b3346,0x50555a,0xa8c43a,0x7a1d22][Math.floor(rand()*5)]),accent:lin([0xc81d25,0xf4f1ea,0x1d1f22,0xe07a1a][Math.floor(rand()*4)]),brake:rand()<.6};
   tile.near.add(cityCarTemplate('moto'),f,o);tile.far.add(cityCarTemplate('moto',true),f,o);take(x,y,.7);queued.push([x,y,ci]);stats.motos++;stats.queueCars++;}}
  lanesHere.forEach((lv,li)=>{
   let u=queueFrom+(lanesHere.length>1?rand()*3:0),count=0;
   while(count<cap){
    const type=li===busLane&&count===busAt?'bus':pickCarType(rand),L=CITY_CAR_SIZE[type].L*(1+(rand()-.5)*.06);
    if(u+L>qEnd)break;
    // In its lane, or a little to either side where the lane runs over a curb or into the car ahead; else a little further on.
    const q=path.at(u+L/2),lat=lv+(rand()-.5)*.35,W=CITY_CAR_SIZE[type].W/2;let x,y,ok=false;
    for(const shift of [0,-.5,.5,-1,1]){const off=lat+shift;x=q.x-Math.sin(q.h)*off;y=q.y+Math.cos(q.h)*off;
     const d=surface(x,y),e=[-1,1].map(k=>surface(x-Math.sin(q.h)*W*k,y+Math.cos(q.h)*W*k));
     if(d&&d.road<-.5&&e.every(r=>r&&r.road<.15)&&!inBuilding(x,y)&&!isTaken(x,y,1.2)&&corridor(x,y)>2&&free(x,y,1.5)){ok=true;break;}}
    const f=ok&&carFrame(type,x,y,q.h+Math.PI+(rand()-.5)*.05,ground,{s:(z=>[z,z,z*(1+(rand()-.5)*.04)])(1+(rand()-.5)*.06),lift:(rand()-.5)*.03});
    if(!f){u+=1.5;continue;}
    const o={paint:type==='bus'?lin(0xf2f2ee):carPaint(rand),rim:rimColor(rand),accent:lin([0x1f5fb0,0x2f8a3c,0xe06a14,0xc8202a,0x6b3fa0][Math.floor(rand()*5)]),brake:rand()<.4,signA:busUv[(u=>u<.3?Math.floor(u/.3*2):2+Math.floor((u-.3)/.7*(BUS_SIGNS.length-2)))(rand())]};
    // (Down the street, past QUEUE_NEAR metres from the line, the box at a distance and the full build when the camera comes
    // near: from the street's sidewalks; on the cheap levels the box.)
    if(u<=QUEUE_NEAR)tile.near.add(cityCarTemplate(type),f,o);else if(lod)tile.near.add(cityCarTemplate(type),f,{...o,lod:1}).add(cityCarTemplate(type,true),f,{...o,lod:-1});else tile.near.add(cityCarTemplate(type,true),f,o);
    tile.far.add(cityCarTemplate(type,true),f,o);queued.push([x,y,ci]);stats.queueCars++;if(type==="bus")stats.buses++;
    for(let k=-L/2+1.1;k<L/2;k+=1.6)take(x+Math.cos(q.h)*k,y+Math.sin(q.h)*k,1.1);count++;
    u+=L+(rand()<.12?3+rand()*4:.9+rand()*2.2);
   }
   if(count)clearings.push(...Array.from({length:Math.ceil((u-queueFrom)/10)},(_,k)=>{const q=path.at(queueFrom+k*10+5);return {x:q.x-Math.sin(q.h)*lv,y:q.y+Math.cos(q.h)*lv,r:4};}));
  });
 });

 // ---- Parked cars along the curbs of the side streets ----
 {const pk=city.parked,cols=Object.fromEntries((pk?.columns??[]).map((k,i)=>[k,i])),cand=[];
  const rand=random(2417),nearReach=mobile?0:lean?50:PARK_FULL;
  for(const it of pk?.items??[]){
   const x=it[cols.x],y=it[cols.y],h=it[cols.heading],dt=trackDistance(x,y);
   const type=rand()<.04?'van':pickCarType(rand),L=CITY_CAR_SIZE[type].L,W=CITY_CAR_SIZE[type].W,c=Math.cos(h),s=Math.sin(h);
   const corners=[[L/2,W/2],[L/2,-W/2],[-L/2,W/2],[-L/2,-W/2]].map(([p,q])=>[x+c*p-s*q,y+s*p+c*q]);
   // Off the map, off the street, into a building, the race's corridor or the pits, or onto a closure or a queue: dropped.
   const d=surface(x,y),bad=!d||ground(x,y)==null?'map':!(d.road<.2||d.parking<0)?'street':corners.some(([px,py])=>inBuilding(px,py)||(surface(px,py)?.road??9)>.9)?'building':
    corridor(x,y)<2||!free(x,y,1.5)?'track':[0,-.33,.33].some(k=>isTaken(x+c*L*k,y+s*L*k,1))?'closure':null;
   if(bad){stats.parkedDropped++;const w=stats.parkedWhy??={};w[bad]=(w[bad]??0)+1;continue;}
   cand.push({x,y,h,type,dt,rnd:rand()});
  }
  cand.sort((p,q)=>p.dt-q.dt);
  const keep=cand.slice(0,mobile?450:lean?900:cand.length);
  for(const p of keep){
   const r=random(Math.round(p.x*97)^Math.round(p.y*61)),s=1+(r()-.5)*.06,lat=(r()-.5)*.16,x=p.x-Math.sin(p.h)*lat,y=p.y+Math.cos(p.h)*lat;
   const f=carFrame(p.type,x,y,p.h+(r()-.5)*.05,ground,{s:[s,s,s*(1+(r()-.5)*.04)],lift:(r()-.5)*.025});if(!f){stats.parkedDropped++;continue;}
   const tile=tileAt(x,y),o={paint:carPaint(r),rim:rimColor(r),lamps:false,shade:.92+r()*.1},nearOne=p.dt<nearReach;
   // Both builds (switched by the camera's distance, cityMaterial lod) within PARK_FULL of the lap; beyond, where only a
   // high view sees them, and on the cheap levels, the box (lean: the full build within 50 m of the lap).
   if(lod&&nearOne)tile.near.add(cityCarTemplate(p.type),f,{...o,lod:1}).add(cityCarTemplate(p.type,true),f,{...o,lod:-1});else tile.near.add(cityCarTemplate(p.type,!nearOne),f,o);
   tile.far.add(cityCarTemplate(p.type,true),f,o);stats.parked++;if(nearOne)stats.parkedNear++;
   if(roam)roamSolids.push({x,y,h:p.h,hu:CITY_CAR_SIZE[p.type].L*s/2,hv:CITY_CAR_SIZE[p.type].W*s/2});
  }
 }
 // ---- The zones of the city open to roam (meta.roam: physics.js RoamWorld) ----
 // Nowhere on a zone's edge does the car stop at nothing (user, 2026-10-15: "nos lugares que tem barreira invisível coloca
 // algum objeto pra sinalizar que o carro/pessoa vai bater"). gerar_cidade_floripa.py bordas_passeio leaves out the edge
 // along facades, landmarks and the lap's walls and hands the rest over: where it cuts across the city (a square, a lawn,
 // the seafront, a street the closures above left uncovered) its `fences`, galvanized crowd fences; along the lots, the
 // back of the sidewalk with no facade on it, its `walls`: the lots' own walls ('frente': a building just behind, 'lote':
 // none) or, on a traffic island with no sidewalk ('canteiro'), the organisers' concrete or plastic barriers. All set just
 // out from the edge, so the car stops at their feet and the walker at their face; a stretch the closures above already
 // hold is skipped. The parked cars in a zone are solid for the car driving there.
 if(roam){
  const rand=random(5303),OUT=.12;
  // A line [x0, y0, x1, y1, ...]: its points, the distance along it and the point and heading at a distance.
  const polyline=line=>{const pts=[];for(let k=0;k+1<line.length;k+=2)pts.push([line[k],line[k+1]]);
   const acc=[0];for(let k=1;k<pts.length;k++)acc.push(acc[k-1]+Math.hypot(pts[k][0]-pts[k-1][0],pts[k][1]-pts[k-1][1]));
   const at=u=>{let k=1;while(k<pts.length-1&&acc[k]<u)k++;const [ax,ay]=pts[k-1],[bx,by]=pts[k],l=acc[k]-acc[k-1]||1,f=Math.max(0,Math.min(1,(u-acc[k-1])/l));return {x:ax+(bx-ax)*f,y:ay+(by-ay)*f,h:Math.atan2(by-ay,bx-ax)};};
   return {pts,acc,at,total:acc.at(-1)};};
  // Pieces of a closure's kind (crowd fences, Jersey blocks, water-filled barriers) one after another along a line, each a
  // little out of line, `out` m out from it, end to end to the line's very end.
  const barrierLine=(line,opts,out,paint,count)=>{const L=polyline(line);let u=rand()*.1,k=0;
   while(u<L.total-.05){
    const pick=opts[Math.floor(rand()*opts.length)],q=L.at(Math.min(u+pick.l/2,L.total)),o=out+(rand()-.5)*.06,x=q.x+Math.sin(q.h)*o,y=q.y-Math.cos(q.h)*o,zz=ground(x,y);
    if(zz!=null&&!inBuilding(x,y)&&!edgeCovered(q.x,q.y,1.4)){const tile=tileAt(x,y),f=frameAt(x,y,zz,q.h+(pick.zig?(k%2?.05:-.05):0)+(rand()-.5)*.04),look={paint:paint(k),shade:.88+rand()*.14};
     tile.near.add(pick.near,f,look);tile.far.add(pick.far,f,look);stats.pieces++;stats[count]=(stats[count]??0)+1;}
    u+=pick.l+(pick.zig?.03+rand()*.1:.01+rand()*.04);k++;
   }};
  const galv=()=>lin(rand()<.08?0x9a8a74:0xffffff,.86+rand()*.16),gradis=T.gradil.map(g=>({...g,zig:true}));
  for(const z of data.meta.roam.zones)for(const line of z.fences??[])barrierLine(line,gradis,.3,galv,'roamFences');
  // The traffic islands: a line of Jersey blocks or of water-filled barriers in a closure's pair of colours.
  for(const z of data.meta.roam.zones)for(const w of z.walls??[])if(w.kind==='canteiro'){
   if(rand()<.55)barrierLine(w.line,[T.jersey],.36,()=>lin(rand()<.15?0xa59a7e:0x9c9b95,.82+rand()*.24),'roamIslands');
   else{const pair=rand()<.6?['orange','white']:['red','white'];barrierLine(w.line,T.plastic,.3,k=>rand()<.035?PLASTIC.yellow:PLASTIC[pair[k%2]],'roamIslands');}}
  // The lots' walls, lot by lot (6 to 14 m, in front of a building 8 to 18), each its owner's: in front of a building a low
  // wall with an iron railing (now and then the railing alone, or a plain wall to the chest); an open lot a plastered wall
  // painted any colour, bare concrete blocks or a building site's hoarding. Pillars at the lot's ends and every 2.6 m at
  // most (on a slope each stretch stands on its own ground: the wall steps, as real ones do), a sheet-metal gate in some.
  // (The cheap levels draw the railings with a bar every 33 cm, as from afar.)
  const PAINTS=[0xeee6d2,0xe8d6a8,0xd9a66b,0xe3a48d,0xc8d9b0,0xa9c7d6,0xf2f0ea,0xb8664c,0xe9c2c0,0xc9c5bc,0xf0d77a,0x9fb59a,0xd7c3e0,0xf3e3c3,0xe7b77c];
  const IRON=[0x1d1f22,0xf0f0ec,0x2e4a36,0x5a5f63,0x6b3b24,0x24324a,0x7a2420],HOARD=[0x1f5fa0,0x2f7a46,0xcfd2d0,0xe6e3dc,0xf2d23a,0x8a2f2a];
  const pick=list=>list[Math.floor(rand()*list.length)];
  const lotStyle=kind=>{const paint=lin(pick(PAINTS),.9+rand()*.14),cap=rand()<.6?lin(0xf2f0ea,.92+rand()*.08):lin(0xa9a7a0,.9+rand()*.15),iron=lin(pick(IRON),.85+rand()*.2),r=rand();
   const st={paint,cap,iron,thick:.15,pillar:.28+rand()*.06,gate:rand()<.35};
   if(kind==='frente'){
    if(r<.6)return {...st,base:.45+rand()*.5,rail:.8+rand()*.6};
    if(r<.8)return {...st,base:.18+rand()*.1,rail:1.4+rand()*.5,pillar:.1,steel:true};
    return {...st,base:1.1+rand()*.5,rail:0};}
   if(r<.6)return {...st,base:1.9+rand()*.6,rail:0};
   if(r<.82)return {...st,base:1.8+rand()*.6,rail:0,paint:lin(0x9d9b95,.82+rand()*.2),cap:null};
   return {...st,base:2.1+rand()*.25,rail:0,paint:lin(pick(HOARD),.85+rand()*.2),cap:null,tapume:true,gate:rand()<.25,pillar:.1,steel:true};};
  const lotWalls=(line,kind)=>{
   const L=polyline(line);if(L.total<.2)return;
   const cuts=[0];while(cuts.at(-1)<L.total-.01)cuts.push(Math.min(L.total,cuts.at(-1)+(kind==='frente'?8+rand()*10:6+rand()*8)));
   if(cuts.length>2&&cuts.at(-1)-cuts.at(-2)<2.5)cuts.splice(cuts.length-2,1);
   const put=(tpl,far,x,y,z,h,s,look)=>{const tile=tileAt(x,y),f=frameAt(x,y,z,h,{s});tile.near.add(tpl,f,look);if(far)tile.far.add(far,f,look);stats.pieces++;};
   for(let li=0;li+1<cuts.length;li++){
    const st=lotStyle(kind),u0=cuts[li],u1=cuts[li+1],H=st.base+st.rail,breaks=[u0];
    for(let k=1;k<L.pts.length-1;k++)if(L.acc[k]>u0+.05&&L.acc[k]<u1-.05)breaks.push(L.acc[k]);breaks.push(u1);
    const spans=[];for(let i=0;i+1<breaks.length;i++){const a=breaks[i],b=breaks[i+1],n=Math.max(1,Math.ceil((b-a)/2.6));for(let j=0;j<n;j++)spans.push([a+(b-a)*j/n,a+(b-a)*(j+1)/n]);}
    // The gate: the stretch nearest the lot's middle that is 2.2 m or more.
    let gate=-1;if(st.gate){let best=Infinity;spans.forEach(([a,b],i)=>{const d=Math.abs((a+b)/2-(u0+u1)/2);if(b-a>=2.2&&d<best){best=d;gate=i;}});}
    spans.forEach(([a,b],i)=>{
     const A=L.at(a),B=L.at(b),h=Math.atan2(B.y-A.y,B.x-A.x),len=Math.hypot(B.x-A.x,B.y-A.y),o=OUT+st.thick/2,mx=(A.x+B.x)/2+Math.sin(h)*o,my=(A.y+B.y)/2-Math.cos(h)*o;
     if(len<.05||edgeCovered((A.x+B.x)/2,(A.y+B.y)/2,1.2))return;
     const z=ground(mx,my);if(z==null)return;const shade=.92+rand()*.1,look={paint:st.paint,accent:st.cap??st.paint,rim:st.iron,shade};
     if(i===gate){put(T.gate.near,T.gate.far,mx,my,z,h,[len,1,Math.max(1.6,H-.05)],{...look,rim:lin(pick(IRON),.8+rand()*.25)});stats.roamGates=(stats.roamGates??0)+1;}
     else if(st.tapume)put(T.tapume.near,T.tapume.far,mx,my,z,h,[len+.04,1,H],look);
     else{
      put(T.wallSlab.near,T.wallSlab.far,mx,my,z,h,[len+st.thick*.9,st.thick,st.base],look);
      if(st.cap)put(T.wallCap,null,mx,my,z+st.base,h,[len+st.thick,st.thick+.05,.05],look);
      if(st.rail)put(mobile||lean?T.grade.far:T.grade.near,T.grade.far,mx,my,z+st.base+(st.cap?.05:0),h,[len/2,1,st.rail-(st.cap?.05:0)],look);
     }
     // A pillar at each end of the stretch (masonry, or a steel post for a railing on its own and for a hoarding), down to
     // the lower of the two grounds.
     for(const P of i===0?[A,B]:[B]){const px=P.x+Math.sin(h)*o,py=P.y-Math.cos(h)*o,pz=ground(px,py);if(pz==null)continue;
      const w=st.pillar,top=H+(st.steel?.02:.1),z0=Math.min(pz,z),tall=top+Math.max(0,z-pz);
      put(T.wallSlab.near,st.steel?null:T.wallSlab.far,px,py,z0,h,[w,w,tall],st.steel?{paint:st.iron,shade}:look);
      if(st.cap&&!st.steel)put(T.wallCap,null,px,py,z0+tall,h,[w+.06,w+.06,.06],look);}
     stats.roamWallM=(stats.roamWallM??0)+len;
    });
   }
   stats.roamWalls=(stats.roamWalls??0)+1;
  };
  for(const z of data.meta.roam.zones)for(const w of z.walls??[])if(w.kind!=='canteiro')lotWalls(w.line,w.kind);
  // At each gap a DESVIO board on a tall stand just behind the wall's end before it, turned to the cars coming, its arrow
  // into the side street: the way out to the city.
  for(const z of data.meta.roam.zones)for(const g of z.gaps){
   let lo=0,hi=N-1;const s=g.s0-2.5;while(lo<hi){const m=(lo+hi+1)>>1;if(a[m][0]<=s)lo=m;else hi=m-1;}
   const p=a[lo],t=Math.hypot(p[7],p[8])||1,tx=p[7]/t,ty=p[8]/t,off=g.side*(p[4]/2+(g.side<0?p[15]:p[16])+.75+.7),x=p[1]-ty*off,y=p[2]+tx*off,zz=ground(x,y);
   if(zz==null)continue;const f=frameAt(x,y,zz,Math.atan2(-ty,-tx)-Math.PI/2),o={signA:g.side>0?signUv.desvioL:signUv.desvioR,accent:lin(0xe8e4da)};
   tileAt(x,y).near.add(T.standTall,f,o);tileAt(x,y).far.add(T.standTallFar,f,o);stats.signs++;stats.roamSigns=(stats.roamSigns??0)+1;roamSolids.push({x,y,r:.12});
  }
  // The race's own things behind the walls, where a zone takes in the sidewalk or the avenue behind them: the covered
  // grandstands (track-clearance.js standLayout: from their parapet to the back of the roof), the boards' legs (as
  // track-surface.js stands them, turned to the approaching driver), the marshals' shelters and the TV towers' scaffolds.
  for(const b of standLayout(data)){const d0=b.front,d1=b.back+.6;roamSolids.push({x:b.x+b.rx*(d0+d1)/2,y:b.y+b.ry*(d0+d1)/2,h:Math.atan2(b.ty,b.tx),hu:b.length/2+.2,hv:(d1-d0)/2});}
  for(const spot of billboardSpots(data)){const {p,side,x,y}=spot,f=billboardFormat(data,spot),t=Math.atan2(-p[7]*.8+p[8]*side*.6,p[8]*.8+p[7]*side*.6)+f.turn;
   for(const u of f.legs)roamSolids.push({x:x+u*Math.cos(t),y:y+u*Math.sin(t),r:f.legs.length===1?.25:.13});}
  for(const m of marshalSpots(data)){const yaw=Math.atan2(-m.side*m.p[7],m.side*m.p[8]);roamSolids.push({x:m.x-1.6*Math.cos(yaw),y:m.y-1.6*Math.sin(yaw),h:yaw,hu:1,hv:1.2});}
  for(const t of towerSpots(data))roamSolids.push({x:t.x,y:t.y,h:0,hu:1,hv:1});
  stats.roamSolids=addRoamSolids(data,roamSolids);
 }

 // ---- Meshes ----
 const people=stats.people?createPeople():null;
 const mesh=(geometry,mat,name,shadow,parent)=>{const m=new THREE.Mesh(geometry,mat);m.name=name;m.castShadow=shadow;m.receiveShadow=true;m.matrixAutoUpdate=false;m.updateMatrix();m.visible=false;parent.add(m);stats.meshes++;return m;};
 for(const t of tiles.values()){
  if(t.near.items.length){t.mesh=mesh(t.near.geometry(WHITE_UV,false,lod),material,'Bloqueios_perto_'+t.key,!mobile&&!lean,root);t.triangles=t.near.triangles;stats.trianglesNear+=t.triangles;}
  if(people&&t.people.length){t.crowd=people.crowd(t.people,{name:'Pessoas_bloqueio_'+t.key,cell:4*TILE,seed:t.people.length*.37+t.box[0]*.001});if(t.crowd){t.crowd.visible=false;root.add(t.crowd);stats.crowds=(stats.crowds??0)+1;}}
  t.near=null;stats.tiles++;
 }
 for(const g of groups.values()){if(g.batch.items.length){g.mesh=mesh(g.batch.geometry(WHITE_UV,true),farMaterial,'Bloqueios_longe_'+g.key,false,root);g.triangles=g.batch.triangles;stats.trianglesFar+=g.triangles;}g.batch=null;stats.groups=(stats.groups??0)+1;}
 stats.atlas=ATLAS;stats.names=names.length;stats.buildMs=Math.round(performance.now()-started);
 // Near within NEAR metres of the tile (as seen through the lens; the nearest MAX_NEAR tiles at most), the far groups out to
 // FAR, nothing beyond; a few metres of give so a tile on the line does not flicker.
 const NEAR=mobile?75:lean?95:120,FAR=mobile?360:lean?480:650,GIVE=6,MAX_NEAR=6,eye=new THREE.Vector3(),uniforms=material.userData.uniforms,hide=farMaterial.userData.hide,order=[...tiles.values()];
 let tick=0;
 const boxDistance=([x0,y0,x1,y1],x,y)=>Math.hypot(Math.max(x0-x,0,x-x1),Math.max(y0-y,0,y-y1));
 function update(dt,camera){
  uniforms.cityTime.value=(uniforms.cityTime.value+dt)%3600;
  // The cars' builds follow the eye every frame (the near meshes' lod), the tiles every third.
  if(camera)uniforms.cityEye.value.setFromMatrixPosition(camera.matrixWorld);
  if(!camera||(tick=(tick+1)%3)&&dt>0)return;
  eye.setFromMatrixPosition(camera.matrixWorld);const ex=eye.x,ey=-eye.z;
  const zoom=camera.isPerspectiveCamera?Math.min(1,Math.tan(camera.fov*Math.PI/360)/(camera.zoom||1)/LENS_REF):1;
  uniforms.cityLodDist.value=LOD_NEAR/zoom;
  for(const t of order)t.d=boxDistance(t.box,ex,ey)*zoom;
  order.sort((p,q)=>p.d-q.d);
  let calls=0,tris=0,n=0;hide.fill(-1);
  for(const t of order){
   const state=n<MAX_NEAR&&t.d<NEAR+(t.state===2?GIVE:-GIVE)?2:0;
   if(state===2){hide[n++]=t.id;if(t.mesh){calls++;tris+=t.triangles;}if(t.crowd)calls+=t.crowd.children.length;}
   if(state!==t.state){t.state=state;if(t.mesh)t.mesh.visible=state===2;if(t.crowd)t.crowd.visible=state===2;}
  }
  for(const g of groups.values()){if(!g.mesh)continue;const on=boxDistance(g.box,ex,ey)*zoom<FAR+(g.state?GIVE:-GIVE);g.state=on;g.mesh.visible=on;if(on){calls++;tris+=g.triangles;}}
  stats.drawCalls=calls;stats.visibleTriangles=tris;
 }
 return {root,stats,update,setNight(level){uniforms.cityNight.value=level;},clearings};
}
