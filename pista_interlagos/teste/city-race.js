import * as THREE from 'three';
import {canvasTexture} from './pit-textures.js';
import {sceneryBands,groundTriangle,groundHeight} from './track-clearance.js';
import {billboardSpots} from './track-surface.js';
import {marshalSpots,towerSpots} from './trackside.js';
import {flagSpots} from './trackside-flags.js';
import {SPONSORS,drawIcon,paintBanner,paintBoard} from './sponsors.js';
import {createPeople} from './pit-crew.js';
import {addRoamSolids} from './physics.js';

// The race weekend in the city (Floripa, data.scenery.city): what a street race brings to a real city on top of its own
// life, like Monaco or a Brazilian street race. The event's lamp-post banners hung in pairs on brackets on the city's
// poles along the lap and the streets near it (the very poles city-furniture.js builds, found by the same rules), and
// cloth banners strung across the side streets announcing the race; a fan zone on the lawn of the Parque Náutico
// (a stage under a giant screen on its truss showing the broadcast, the circuit map and the ads, food trucks with joke
// names, sponsor tents, plastic bar tables, portable toilets, a generator, light towers, string lights, feather flags and
// crowd fences, people standing at the screen, queueing, sitting) and a smaller one at the old bridge's head; tubular
// temporary grandstands in the hairpin's infield and in the Estreito's long bend, their rows given to the fans
// (standTops); the TV compound (outside-broadcast trucks with their dishes and cable runs, a satellite uplink truck), a
// camera crane by the lap, the ambulance and the fire engine on standby by the pits, the marshals' tent; and the TV
// helicopter circling over the bay. All static things share one material (vertex colour over one canvas atlas, a
// per-vertex look: metal, night glow, blinking, the cloth's sway and the screen's slides) merged by 300 m tiles in three
// layers shown out to their own distance; the helicopter is three small meshes moved each frame. Where everything goes is
// planned apart (planRace: plain numbers, the same at every load), so city-traffic.js can ask raceTrafficBlocks() what
// stands on the carriageways while the modules are built side by side.

const TILE=300,REACH={big:1100,mid:480,small:300},REACH_LIGHT={big:700,mid:300,small:190};
function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
// Linear colours (vertex colours are linear): an sRGB hex scaled by k.
const lin=(hex,k=1)=>{const c=new THREE.Color(hex);return [c.r*k,c.g*k,c.b*k];};
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],scale=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};
const pick=(R,list)=>list[Math.floor(R()*list.length)%list.length];
// look = [metal, glow, phase, mode/10]. Modes: 0 plain (glow: lit at night), 1 and 2 the two faces of a cloth (x: how far
// it sways), 3 a blinking lamp (y: its rate), 4 the giant screens (their slides shift along the atlas).
const PLAIN=[0,0,0,0],METAL=m=>[m,0,0,0],GLOW=g=>[0,g,0,0],BLINK=(rate,phase)=>[0,rate,phase,.3],SCREEN=[0,0,0,.4];
const clothLook=(w,phase,back)=>[Math.min(1,w),0,phase,back?.2:.1];

// --- The atlas (1024 px): the lamp-post banners, the screens' three slides, the banners across the streets, the stands'
// skirts, the food trucks' and tents' boards, the TV trucks' livery and the small signs; a white square for plain parts.
const ATLAS=1024;
const REG={pole:k=>[k*112,0,112,256],screen:k=>[k*336,256,336,192],street:k=>[(k%2)*512,448+Math.floor(k/2)*64,512,64],fascia:k=>[k*512,640,512,64],
 name:k=>[(k%4)*256,704+Math.floor(k/4)*64,256,64],livery:k=>[k*512,896,512,64],resgate:[0,960,256,64],bombeiros:[256,960,256,64],wc:[512,960,64,64],
 ramp:[576,960,64,64],white:[640,960,64,64],chequer:[704,960,64,64],star:[768,960,64,64],vent:[832,960,64,64],dark:[896,960,64,64],shutter:[960,960,64,64]};
const SCREEN_SHIFT=336/ATLAS;
const rect=([x,y,w,h],inset=2,flip=false)=>{const l=(x+inset)/ATLAS,r=(x+w-inset)/ATLAS,t=1-(y+inset)/ATLAS,b=1-(y+h-inset)/ATLAS;return flip?[[r,b],[l,b],[l,t],[r,t]]:[[l,b],[r,b],[r,t],[l,t]];};
const WHITE=[(640+32)/ATLAS,1-(960+32)/ATLAS];
const BOLD=s=>`900 ${s}px "Arial Black","Arial Bold",Arial,sans-serif`,SANS=s=>`bold ${s}px Arial,Helvetica,sans-serif`,COND=s=>`${s}px Impact,"Arial Narrow","Arial Black",sans-serif`;
// Words wrapped into lines and shrunk until they fit maxW × maxH, centred on cx, from top.
function fit(ctx,text,cx,top,maxW,maxH,color,font,start){
 const words=String(text).split(/\s+/);
 for(let size=start;size>=6;size--){
  ctx.font=font(size);const lines=[];let cur='';
  for(const w of words){const t=cur?cur+' '+w:w;if(!cur||ctx.measureText(t).width<=maxW)cur=t;else{lines.push(cur);cur=w;}}
  if(cur)lines.push(cur);const lh=size*1.04;
  if(lines.length*lh<=maxH&&lines.every(l=>ctx.measureText(l).width<=maxW)||size===6){
   ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='top';lines.forEach((l,i)=>ctx.fillText(l,cx,top+(maxH-lines.length*lh)/2+i*lh,maxW));return size;}
 }
}
const chequer=(ctx,x,y,w,h,a,b,cell)=>{for(let i=0;i*cell<w;i++)for(let j=0;j*cell<h;j++){ctx.fillStyle=(i+j)%2?a:b;ctx.fillRect(x+i*cell,y+j*cell,Math.min(cell,w-i*cell),Math.min(cell,h-j*cell));}};
// The Hercílio Luz in white line: two towers, the eyebar chain sagging between them, the deck.
function bridgeSketch(ctx,x,y,w,h,color){
 ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=Math.max(1.5,w*.025);const t0=x+w*.28,t1=x+w*.72,top=y,deck=y+h*.8;
 for(const t of [t0,t1])ctx.fillRect(t-w*.02,top,w*.04,h);
 ctx.beginPath();ctx.moveTo(x,deck-h*.35);ctx.quadraticCurveTo(t0-w*.1,top+h*.2,t0,top+h*.04);ctx.quadraticCurveTo((t0+t1)/2,deck+h*.25,t1,top+h*.04);ctx.quadraticCurveTo(t1+w*.1,top+h*.2,x+w,deck-h*.35);ctx.stroke();
 ctx.fillRect(x,deck,w,h*.06);for(let k=1;k<12;k++){const px=t0+(t1-t0)*k/12,d=(k/12-.5)**2*4;ctx.fillRect(px-.5,top+h*.04+(1-d)*(deck-top-h*.04)*.86,1,(deck-top)*.1*(1+d));}
 ctx.restore();
}
// The lamp-post banners: the event and its jokes, every one with the event's own strip at the foot (a city campaign).
const POLE_DESIGNS=[
 {bg:'#b3161d',fg:'#f6f1e4',accent:'#f0c419',big:['AUTO-','POBRE'],small:'RACING',icon:'flag'},
 {bg:'#12351f',fg:'#f0c419',accent:'#f6f1e4',big:['OLD','STOCK'],small:'RACE',icon:'chequer'},
 {bg:'#0b2545',fg:'#ffffff',accent:'#f0c419',words:'A ILHA PAROU PRA VER',bridge:true},
 {bg:'#ffd60a',fg:'#0b2545',accent:'#e63946',words:'Ó-LHÓ-LHÓ, QUE CORRIDA!',icon:'flag'},
 {bg:'#f4f1ea',fg:'#c8161d',accent:'#1d3557',words:'DUAS PONTES, ZERO PEDÁGIO',bridge:true},
 {bg:'#e85d04',fg:'#ffffff',accent:'#1a1a1a',words:'MANÉ, SAI DA PISTA!',icon:'car'},
 {sponsor:'tasvolo'},{sponsor:'tiradomar'},
 {bg:'#0a9396',fg:'#ffffff',accent:'#ee9b00',words:'PROIBIDO PESCAR DA PONTE NA HORA DA CORRIDA',icon:'leaf'}];
function poleBanner(ctx,[x,y,w,h],D){
 ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
 if(D.sponsor){const s=SPONSORS[D.sponsor];D={bg:s.bg,fg:s.fg,accent:s.accent,words:s.words,icon:s.icon,tag:s.tag};}
 ctx.fillStyle=D.bg;ctx.fillRect(x,y,w,h);
 // Sleeves for the brackets at the top and the foot, the event's strip above the lower one.
 ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(x,y,w,7);ctx.fillRect(x,y+h-7,w,7);
 chequer(ctx,x,y+9,w,10,D.accent,D.bg,10);
 if(D.big){fit(ctx,D.big.join(' '),x+w/2,y+26,w-10,92,D.fg,BOLD,30);fit(ctx,D.small,x+w/2,y+118,w-14,30,D.accent,BOLD,26);drawIcon(ctx,D.icon,x+w/2,y+176,22,D.fg,D.accent);}
 else{const top=D.bridge?24:26;fit(ctx,D.words,x+w/2,y+top,w-12,D.bridge?118:122,D.fg,BOLD,28);
  if(D.bridge)bridgeSketch(ctx,x+10,y+150,w-20,40,D.accent);else{drawIcon(ctx,D.icon,x+w/2,y+170,20,D.accent,D.bg);if(D.tag)fit(ctx,D.tag,x+w/2,y+150,w-12,14,D.fg,SANS,11);}}
 ctx.fillStyle=D.fg;ctx.fillRect(x,y+h-44,w,30);fit(ctx,'AUTO-POBRE · FLORIPA',x+w/2,y+h-41,w-8,24,D.bg,BOLD,11);
 ctx.restore();
}
// The giant screens' slides: the broadcast (an Opala on the bridge, the timing tower, AO VIVO), the circuit's map, an ad.
function screenLive(ctx,[x,y,w,h]){
 ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
 let g=ctx.createLinearGradient(0,y,0,y+h*.58);g.addColorStop(0,'#5d93c9');g.addColorStop(1,'#cfe3f2');ctx.fillStyle=g;ctx.fillRect(x,y,w,h*.58);
 ctx.fillStyle='#2c6a86';ctx.fillRect(x,y+h*.56,w,h*.12);ctx.fillStyle='#4d7f57';ctx.fillRect(x,y+h*.53,w*.3,h*.05);
 bridgeSketch(ctx,x+w*.35,y+h*.2,w*.6,h*.38,'#d8dcdc');
 ctx.fillStyle='#3a3d40';ctx.beginPath();ctx.moveTo(x,y+h);ctx.lineTo(x+w,y+h);ctx.lineTo(x+w,y+h*.68);ctx.lineTo(x,y+h*.72);ctx.fill();
 ctx.fillStyle='#e9e6dc';for(let k=0;k<6;k++)ctx.fillRect(x+k*w/5.5+12,y+h*.86,w/12,3);
 // The Opala 99, three-quarter rear, a blur of speed behind it.
 const cx=x+w*.6,cy=y+h*.8;ctx.fillStyle='rgba(255,255,255,.35)';for(let k=0;k<5;k++)ctx.fillRect(cx-150-k*10,cy-18+k*7,70,2);
 ctx.fillStyle='#141414';ctx.beginPath();ctx.roundRect(cx-52,cy-22,104,28,6);ctx.fill();ctx.beginPath();ctx.roundRect(cx-34,cy-38,66,20,8);ctx.fill();
 ctx.fillStyle='#6d8fa8';ctx.fillRect(cx-28,cy-34,54,12);ctx.fillStyle='#c8161d';ctx.fillRect(cx-46,cy-14,14,6);ctx.fillRect(cx+32,cy-14,14,6);
 ctx.fillStyle='#f0c419';ctx.font=BOLD(14);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('99',cx,cy-6);
 ctx.fillStyle='#0d0d0d';for(const s of [-1,1])ctx.fillRect(cx+s*40-9,cy+2,18,10);
 // The timing tower.
 const rows=[['1','99','OPA'],['2','07','ZÉ'],['3','21','TIA'],['4','13','VÔ'],['5','44','MAN'],['6','08','BIG']],gaps=['LÍDER','+0,4','+1,1','+2,8','+3,0','+5,6'];
 ctx.fillStyle='rgba(10,14,22,.86)';ctx.fillRect(x+6,y+8,96,18);ctx.fillStyle='#f0c419';ctx.font=BOLD(10);ctx.textAlign='left';ctx.fillText('VOLTA 2/3',x+12,y+18);
 rows.forEach(([p,n,t],k)=>{const ry=y+28+k*17;ctx.fillStyle=k%2?'rgba(16,22,34,.86)':'rgba(26,34,50,.86)';ctx.fillRect(x+6,ry,96,16);ctx.fillStyle=k?'#ffffff':'#f0c419';ctx.font=BOLD(10);ctx.textAlign='left';ctx.fillText(p,x+10,ry+9);
  ctx.fillStyle=k===0?'#c8161d':'#3a5a8a';ctx.fillRect(x+22,ry+2,18,12);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText(n,x+31,ry+9);ctx.textAlign='left';ctx.fillText(t,x+44,ry+9);ctx.font=SANS(9);ctx.textAlign='right';ctx.fillStyle='#cfd8e3';ctx.fillText(gaps[k],x+99,ry+9);});
 ctx.fillStyle='#d62828';ctx.beginPath();ctx.roundRect(x+w-84,y+8,76,22,4);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x+w-72,y+19,4,0,7);ctx.fill();ctx.font=BOLD(13);ctx.textAlign='left';ctx.fillText('AO VIVO',x+w-64,y+20);
 ctx.fillStyle='rgba(10,14,22,.8)';ctx.fillRect(x+w*.3,y+h-26,w*.66,18);ctx.fillStyle='#fff';ctx.font=BOLD(10);ctx.textAlign='center';ctx.fillText('AUTÓDROMO FLORIPA · PONTE COLOMBO SALLES',x+w*.63,y+h-16,w*.62);
 ctx.restore();
}
function screenMap(ctx,[x,y,w,h],data){
 ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
 const g=ctx.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'#0d1b2a');g.addColorStop(1,'#1b3a5a');ctx.fillStyle=g;ctx.fillRect(x,y,w,h);
 ctx.fillStyle='#f0c419';ctx.font=BOLD(16);ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText('AUTÓDROMO FLORIPA',x+12,y+18);
 ctx.fillStyle='#cfd8e3';ctx.font=SANS(11);ctx.fillText('4,44 km · sentido horário · 2 pontes',x+12,y+36);
 const A=data.samples;let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;for(const p of A){x0=Math.min(x0,p[1]);x1=Math.max(x1,p[1]);y0=Math.min(y0,p[2]);y1=Math.max(y1,p[2]);}
 const k=Math.min((w-40)/(x1-x0),(h-74)/(y1-y0)),ox=x+20+((w-40)-(x1-x0)*k)/2,oy=y+52+((h-74)-(y1-y0)*k)/2,P=p=>[ox+(p[1]-x0)*k,oy+(y1-p[2])*k];
 const L=data.meta.reconstructed_xy_m,deck=s=>(data.meta.decks??[]).some(([a,b])=>a<=b?s>=a&&s<=b:s>=a||s<=b);
 ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle='#0a0f18';ctx.lineWidth=9;ctx.beginPath();A.forEach((p,i)=>{const [px,py]=P(p);i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.closePath();ctx.stroke();
 for(let i=0;i<A.length;i++){const p=A[i],q=A[(i+1)%A.length],[ax,ay]=P(p),[bx,by]=P(q);ctx.strokeStyle=deck(p[0])?'#f0c419':'#f6f1e4';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();}
 const [sx,sy]=P(A[0]);chequer(ctx,sx-5,sy-5,10,10,'#fff','#111',3.4);
 ctx.fillStyle='#f0c419';ctx.font=SANS(10);ctx.textAlign='center';for(const [s,label] of [[L*.03,'PONTE HERCÍLIO LUZ'],[2470,'PONTE COLOMBO SALLES']]){const i=A.findIndex(p=>p[0]>=s);const [px,py]=P(A[Math.max(0,i)]);ctx.fillText(label,px,py+(s>1000?14:-12));}
 ctx.restore();
}
function screenAd(ctx,[x,y,w,h]){
 paintBoard(ctx,x,y,w,h-24,SPONSORS.tia,{seed:3});
 ctx.fillStyle='#111';ctx.fillRect(x,y+h-24,w,24);ctx.fillStyle='#f0c419';ctx.font=BOLD(11);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('INTERVALO · A CORRIDA JÁ VOLTA',x+w/2,y+h-12,w-12);
}
const STREET_LINES=['AUTO-POBRE RACING · FLORIPA · FIM DE SEMANA DE CORRIDA','BEM-VINDOS À CORRIDA NAS RUAS DA ILHA','OLD STOCK RACE · AUTÓDROMO FLORIPA',
 'FAN FEST NO PARQUE NÁUTICO · TELÃO · FOOD TRUCKS','ATENÇÃO, MORADOR: RUAS FECHADAS SÁBADO E DOMINGO','VAI DE A PÉ, MANÉ! A ILHA PAROU PRA VER'];
const STREET_COLORS=[['#b3161d','#f6f1e4','#f0c419'],['#f4f1ea','#0b2545','#c8161d'],['#12351f','#f0c419','#f6f1e4'],['#0b2545','#ffffff','#f0c419'],['#f28a1e','#141414','#141414'],['#ffd60a','#0b2545','#e63946']];
// Food trucks (joke names, a few of them the Island's own joke sponsors) and the tents' valances.
const TRUCKS=[['PASTEL DA VOLTA RÁPIDA','#f2c318','#7a1f12','star'],['CHURROS DA BANDEIRADA','#7a1f12','#ffd8a8','flag'],['SANDUBA DO BOX 99','#1d3557','#f1faee','car'],
 ['AÇAÍ DO PNEU CARECA','#5a189a','#ffffff','tyre'],[SPONSORS.tasvolo.words,SPONSORS.tasvolo.bg,SPONSORS.tasvolo.fg,'cup'],[SPONSORS.derretenaponte.words,SPONSORS.derretenaponte.bg,SPONSORS.derretenaponte.fg,'star']];
const TENTS=[['LOJA OFICIAL AUTO-POBRE','#b3161d','#f6f1e4','flag'],['INFORMAÇÕES','#1d4f9c','#ffffff','star'],['POSTO MÉDICO','#f4f4f0','#c8161d','star'],
 ['COMISSÁRIOS DE PISTA','#f28a1e','#141414','flag'],[SPONSORS.pegaprimeira.words,SPONSORS.pegaprimeira.bg,SPONSORS.pegaprimeira.fg,'bolt'],[SPONSORS.ventosul.words,SPONSORS.ventosul.bg,SPONSORS.ventosul.fg,'star']];
function paintAtlas(ctx,W,H,data){
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);
 POLE_DESIGNS.forEach((D,k)=>poleBanner(ctx,REG.pole(k),D));
 screenLive(ctx,REG.screen(0));screenMap(ctx,REG.screen(1),data);screenAd(ctx,REG.screen(2));
 STREET_LINES.forEach((t,k)=>{const [x,y,w,h]=REG.street(k),[bg,fg,ac]=STREET_COLORS[k];ctx.fillStyle=bg;ctx.fillRect(x,y,w,h);chequer(ctx,x,y,28,h,'#111','#f4f4f0',7);chequer(ctx,x+w-28,y,28,h,'#111','#f4f4f0',7);
  ctx.fillStyle=ac;ctx.fillRect(x+28,y+4,w-56,3);ctx.fillRect(x+28,y+h-7,w-56,3);fit(ctx,t,x+w/2,y+9,w-72,h-18,fg,BOLD,30);});
 paintBanner(ctx,...REG.fascia(0),SPONSORS.autopobre);paintBanner(ctx,...REG.fascia(1),{...SPONSORS.oldstock,words:'OLD STOCK RACE · FLORIPA'});
 [...TRUCKS,...TENTS].forEach(([t,bg,fg,icon],k)=>{const [x,y,w,h]=REG.name(k);ctx.fillStyle=bg;ctx.fillRect(x,y,w,h);ctx.fillStyle=fg;ctx.fillRect(x+3,y+3,w-6,2);ctx.fillRect(x+3,y+h-5,w-6,2);
  drawIcon(ctx,icon,x+22,y+h/2,13,fg,bg);fit(ctx,t,x+w/2+14,y+8,w-56,h-16,fg,BOLD,24);});
 // The TV trucks' sides: the game's own channel.
 for(const [k,bg,fg,ac,a,b] of [[0,'#10203a','#ffffff','#f28a1e','AUTO-POBRE TV','UNIDADE MÓVEL 2 · AO VIVO DE FLORIPA'],[1,'#f4f4f0','#b3161d','#10203a','TV POBRE','TRANSMISSÃO VIA SATÉLITE']]){
  const [x,y,w,h]=REG.livery(k);ctx.fillStyle=bg;ctx.fillRect(x,y,w,h);ctx.fillStyle=ac;ctx.beginPath();ctx.moveTo(x+w*.55,y+h);ctx.quadraticCurveTo(x+w*.75,y+h*.2,x+w,y+h*.1);ctx.lineTo(x+w,y+h);ctx.fill();
  fit(ctx,a,x+w*.26,y+6,w*.46,h*.62,fg,BOLD,34);fit(ctx,b,x+w*.26,y+h*.66,w*.46,h*.28,fg,SANS,13);}
 {const [x,y,w,h]=REG.resgate;ctx.fillStyle='#f6f6f2';ctx.fillRect(x,y,w,h);ctx.fillStyle='#d21f26';ctx.fillRect(x,y+h-12,w,8);fit(ctx,'RESGATE',x+w/2,y+4,w-16,h-20,'#d21f26',BOLD,40);}
 {const [x,y,w,h]=REG.bombeiros;ctx.fillStyle='#b5121b';ctx.fillRect(x,y,w,h);ctx.fillStyle='#f6f6f2';ctx.fillRect(x,y+h-12,w,6);fit(ctx,'BOMBEIROS',x+w/2,y+4,w-16,h-20,'#f6f6f2',BOLD,36);}
 // A portable toilet's door, grey to take its colour from the cabin: the vent, the handle, LIVRE in green.
 {const [x,y,w,h]=REG.wc;ctx.fillStyle='#d8d8d8';ctx.fillRect(x,y,w,h);ctx.fillStyle='#b8b8b8';for(let k=0;k<4;k++)ctx.fillRect(x+16,y+6+k*3,32,1.5);ctx.fillStyle='#f4f4f4';ctx.fillRect(x+22,y+20,20,12);ctx.fillStyle='#333';ctx.font=BOLD(9);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('WC',x+32,y+26);
  ctx.fillStyle='#2e9a4a';ctx.fillRect(x+44,y+38,10,5);ctx.fillStyle='#8a8a8a';ctx.fillRect(x+48,y+44,6,4);}
 {const [x,y,w,h]=REG.ramp;ctx.fillStyle='#141414';ctx.fillRect(x,y,w,h);ctx.fillStyle='#f2c318';for(let k=-4;k<6;k++){ctx.beginPath();ctx.moveTo(x+k*16,y+h);ctx.lineTo(x+k*16+8,y+h);ctx.lineTo(x+k*16+8+h,y);ctx.lineTo(x+k*16+h,y);ctx.fill();}}
 {const [x,y,w,h]=REG.chequer;chequer(ctx,x,y,w,h,'#111','#f4f4f0',8);}
 {const [x,y,w,h]=REG.star;ctx.fillStyle='#f6f6f2';ctx.fillRect(x,y,w,h);ctx.fillStyle='#1d5fb8';ctx.translate(x+w/2,y+h/2);for(let k=0;k<3;k++){ctx.rotate(Math.PI/3);ctx.fillRect(-6,-26,12,52);}ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#f6f6f2';ctx.fillRect(x+w/2-1.5,y+16,3,32);}
 {const [x,y,w,h]=REG.vent;ctx.fillStyle='#bdbdbd';ctx.fillRect(x,y,w,h);ctx.fillStyle='#3a3a3a';for(let k=0;k<8;k++)ctx.fillRect(x+4,y+4+k*7.5,w-8,3.5);}
 {const [x,y,w,h]=REG.dark;const g=ctx.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,'#2a3644');g.addColorStop(.5,'#141a22');g.addColorStop(1,'#202a36');ctx.fillStyle=g;ctx.fillRect(x,y,w,h);}
 {const [x,y,w,h]=REG.shutter;ctx.fillStyle='#c4c8cb';ctx.fillRect(x,y,w,h);for(let k=0;k<h;k+=4){ctx.fillStyle='rgba(40,46,52,.38)';ctx.fillRect(x,y+k,w,1.4);}}
}

// --- Geometry gathered in track coordinates (x east, y north, z up), written as the world's (x, z, -y).
class Kit{
 constructor(){this.p=[];this.n=[];this.c=[];this.t=[];this.l=[];this.i=[];}
 get size(){return this.p.length/3;}
 v(p,n,c,t,l){this.p.push(p[0],p[2],-p[1]);this.n.push(n[0],n[2],-n[1]);this.c.push(c[0],c[1],c[2]);this.t.push(t[0],t[1]);this.l.push(l[0],l[1],l[2],l[3]);return this.p.length/3-1;}
 // A flat quad a-b-c-d (counter-clockwise seen from its front); `out` turns it to face that way.
 quad(a,b,c,d,col,look=PLAIN,uv=null,out=null){
  let n=cross(sub(c,a),sub(d,b));
  if(out&&dot(n,out)<0){[b,d]=[d,b];if(uv)uv=[uv[0],uv[3],uv[2],uv[1]];n=scale(n,-1);}
  n=unit(n);const T=uv??[WHITE,WHITE,WHITE,WHITE],k=this.v(a,n,col,T[0],look);this.v(b,n,col,T[1],look);this.v(c,n,col,T[2],look);this.v(d,n,col,T[3],look);
  this.i.push(k,k+1,k+2,k,k+2,k+3);
 }
 tri(a,b,c,col,look=PLAIN,out=null){let n=cross(sub(b,a),sub(c,a));if(out&&dot(n,out)<0){[b,c]=[c,b];n=scale(n,-1);}n=unit(n);const k=this.v(a,n,col,WHITE,look);this.v(b,n,col,WHITE,look);this.v(c,n,col,WHITE,look);this.i.push(k,k+1,k+2);}
 // A box u0..u1 × v0..v1 × z0..z1 in frame F; each face turned away from the centre; uv(face) maps a region on a face
 // (0 -u, 1 +u, 2 -v, 3 +v, 4 top, 5 bottom).
 box(F,u0,u1,v0,v1,z0,z1,col,look=PLAIN,{top=true,bottom=false,uv=null,sides=true,skip=null}={}){
  const P=(i,j,k)=>F(i?u1:u0,j?v1:v0,k?z1:z0),c=F((u0+u1)/2,(v0+v1)/2,(z0+z1)/2);
  const face=(A,B,C,D,f)=>{if(!skip?.includes(f))this.quad(A,B,C,D,col,look,uv?.(f)??null,sub(scale(add(add(A,B),add(C,D)),.25),c));};
  if(sides){face(P(0,0,0),P(0,1,0),P(0,1,1),P(0,0,1),0);face(P(1,1,0),P(1,0,0),P(1,0,1),P(1,1,1),1);
   face(P(1,0,0),P(0,0,0),P(0,0,1),P(1,0,1),2);face(P(0,1,0),P(1,1,0),P(1,1,1),P(0,1,1),3);}
  if(top)face(P(0,0,1),P(1,0,1),P(1,1,1),P(0,1,1),4);if(bottom)face(P(0,0,0),P(1,0,0),P(1,1,0),P(0,1,0),5);
 }
 // A thin square bar from p to q (scaffold tubes, truss chords, fence bars): four sides, no caps.
 bar(p,q,r,col,look=PLAIN){
  const d=unit(sub(q,p)),e1=unit(Math.abs(d[2])>.95?cross([0,1,0],d):cross(d,[0,0,1])),e2=cross(d,e1),c=[scale(add(e1,e2),r),scale(sub(e1,e2),r),scale(add(e1,e2),-r),scale(sub(e2,e1),r)];
  for(let k=0;k<4;k++){const a=c[k],b=c[(k+1)%4];this.quad(add(p,a),add(p,b),add(q,b),add(q,a),col,look,null,add(a,b));}
 }
 // A tapered tube p→q of n sides with smooth normals.
 tube(p,q,r0,r1,n,col,look=PLAIN,{cap=true,bottom=false,rot=0}={}){
  const d=unit(sub(q,p)),e1=unit(Math.abs(d[2])>.95?cross([0,1,0],d):cross(d,[0,0,1])),e2=cross(d,e1),base=this.size;
  for(let k=0;k<=n;k++){const a=rot+k/n*Math.PI*2,dir=add(scale(e1,Math.cos(a)),scale(e2,Math.sin(a)));this.v(add(p,scale(dir,r0)),dir,col,WHITE,look);this.v(add(q,scale(dir,r1)),dir,col,WHITE,look);}
  for(let k=0;k<n;k++){const a=base+k*2;this.i.push(a,a+2,a+1,a+1,a+2,a+3);}
  const lid=(c,r,nrm,flip)=>{const m=this.v(c,nrm,col,WHITE,look),s=this.size;for(let k=0;k<=n;k++){const a=rot+k/n*Math.PI*2;this.v(add(c,scale(add(scale(e1,Math.cos(a)),scale(e2,Math.sin(a))),r)),nrm,col,WHITE,look);}
   for(let k=0;k<n;k++)flip?this.i.push(m,s+k+1,s+k):this.i.push(m,s+k,s+k+1);};
  if(cap)lid(q,r1,d,false);if(bottom)lid(p,r0,scale(d,-1),true);
 }
 // A convex outline pts [(u, z)...] in a frame's u-z plane, pushed along v from v0 to v1 (cabs, vans, stage parts).
 prism(F,pts,v0,v1,col,look=PLAIN){
  const n=pts.length,cu=pts.reduce((s,p)=>s+p[0],0)/n,cz=pts.reduce((s,p)=>s+p[1],0)/n,c=F(cu,(v0+v1)/2,cz);
  for(let k=0;k<n;k++){const [a,b]=[pts[k],pts[(k+1)%n]],A=F(a[0],v0,a[1]),B=F(b[0],v0,b[1]),C=F(b[0],v1,b[1]),D=F(a[0],v1,a[1]);this.quad(A,B,C,D,col,look,null,sub(scale(add(A,C),.5),c));}
  for(const v of [v0,v1]){const out=sub(F(cu,v,cz),c),P=pts.map(p=>F(p[0],v,p[1]));for(let k=1;k<n-1;k++)this.tri(P[0],P[k],P[k+1],col,look,out);}
 }
 // A cloth: at(uf, zf) the point at fractions across (left to right seen from `front`) and up; both faces carry the print
 // the right way round; weight(uf, zf) how far each point sways (the shader moves both faces together).
 cloth(at,nu,nz,region,col,weight,phase,front){
  const n0=cross(sub(at(1,0),at(0,0)),sub(at(0,1),at(0,0))),flip=dot(n0,front)<0,A=(u,z)=>at(flip?1-u:u,z);
  const n=unit(cross(sub(A(1,0),A(0,0)),sub(A(0,1),A(0,0)))),[[l,b],,[r,t]]=region?rect(region):[WHITE,WHITE,WHITE,WHITE];
  for(const back of [false,true]){
   const base=this.size,nn=back?scale(n,-1):n,off=back?scale(n,-.004):[0,0,0];
   for(let j=0;j<=nz;j++)for(let i=0;i<=nu;i++){const u=i/nu,z=j/nz,uu=back?1-u:u;this.v(add(A(u,z),off),nn,col,region?[l+(r-l)*uu,b+(t-b)*z]:WHITE,clothLook(weight(flip?1-u:u,z),phase,back));}
   for(let j=0;j<nz;j++)for(let i=0;i<nu;i++){const a=base+j*(nu+1)+i,q=[a,a+1,a+nu+2,a+nu+1];back?this.i.push(q[0],q[2],q[1],q[0],q[3],q[2]):this.i.push(q[0],q[1],q[2],q[0],q[2],q[3]);}
  }
 }
 // A decal: a quad a little proud of a face, its region of the atlas the right way round from `out`.
 decal(F,u0,u1,z0,z1,v,region,out,col=[1,1,1],look=PLAIN,flip=false){
  let a=F(u0,v,z0),b=F(u1,v,z0),c=F(u1,v,z1),d=F(u0,v,z1);const n=cross(sub(b,a),sub(d,a));if(dot(n,out)<0){[a,b]=[b,a];[c,d]=[d,c];}
  this.quad(a,b,c,d,col,look,rect(region,2,flip),out);
 }
 // A flat sign w × h centred on c facing n (horizontal), readable from the front.
 sign(c,n,w,h,region,col=[1,1,1],look=PLAIN,flip=false){const r=unit(cross([0,0,1],n)),hw=scale(r,w/2),hh=[0,0,h/2];this.quad(sub(sub(c,hw),hh),sub(add(c,hw),hh),add(add(c,hw),hh),add(sub(c,hw),hh),col,look,region?rect(region,2,flip):null,n);}
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
// A sagging span from a to b (a parabola) of n segments.
function span(a,b,sag,n){const out=[];for(let k=0;k<=n;k++){const t=k/n;out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t-4*sag*t*(1-t)]);}return out;}

function raceMaterial(atlas,uniforms){
 const m=new THREE.MeshStandardMaterial({name:'Corrida_na_cidade',vertexColors:true,map:atlas,roughness:.82,metalness:0});
 m.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  // Cloth sways along its own normal (both faces the same way: the back face's normal is flipped back), each piece on
  // its own phase, two waves running across it; the screens' slides shift along the atlas.
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute vec4 look;varying vec4 vLook;uniform float uTime,uWind,uSlide;`).replace('#include <uv_vertex>',`#include <uv_vertex>
if(floor(look.w*10.+.5)==4.)vMapUv.x+=uSlide;`).replace('#include <begin_vertex>',`#include <begin_vertex>
vLook=look;{float mode=floor(look.w*10.+.5);
if(mode>.5&&mode<2.5){float ph=look.z*6.2832,w=look.x;
 float a=sin(uTime*2.1+ph+w*3.4)*.62+sin(uTime*3.7+ph*2.3-w*5.1)*.38;
 transformed+=objectNormal*(mode>1.5?-1.:1.)*w*a*uWind;vLook.x=0.;}}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec4 vLook;uniform float uTime,uNight;`).replace('#include <roughnessmap_fragment>','float roughnessFactor=mix(roughness,.3,vLook.x);')
   .replace('#include <metalnessmap_fragment>','float metalnessFactor=vLook.x*.8;').replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
{float mode=floor(vLook.w*10.+.5),glow=vLook.y*uNight*12.;
if(mode==3.)glow=step(.62,fract(uTime*(.7+vLook.y*1.6)+vLook.z))*(7.+7.*uNight);
else if(mode==4.)glow=.5+.45*uNight;
totalEmissiveRadiance+=diffuseColor.rgb*glow;}`);
 };
 m.customProgramCacheKey=()=>'city-race-v1';
 return m;
}

// --- What stands where (the same sums city-furniture.js does, so the poles it builds are found here again).
class Occupancy{
 constructor(cell=6){this.cell=cell;this.m=new Map();}
 cells(x,y,r,f){const c=this.cell;for(let i=Math.floor((x-r)/c);i<=Math.floor((x+r)/c);i++)for(let j=Math.floor((y-r)/c);j<=Math.floor((y+r)/c);j++)f(i*100003+j);}
 add(x,y,r){const e=[x,y,r];this.cells(x,y,r,k=>{let a=this.m.get(k);if(!a)this.m.set(k,a=[]);a.push(e);});}
 free(x,y,r){let ok=true;this.cells(x,y,r,k=>{if(!ok)return;const a=this.m.get(k);if(a)for(const e of a)if((e[0]-x)**2+(e[1]-y)**2<(e[2]+r)**2){ok=false;return;}});return ok;}
}
function buildingIndex(data){
 const rings=[],cell=40,grid=new Map(),cityB=data.scenery.city?.buildings;
 if(cityB?.items?.length){const c=Object.fromEntries(cityB.columns.map((k,i)=>[k,i]));for(const it of cityB.items){const r=it[c.ring];if(r?.length>=6)rings.push({p:r,h:it[c.h]??6});}}
 for(const m of data.scenery.landmarks??[])if(m.outline?.length>=3)rings.push({p:m.outline.flat(),h:12});
 rings.forEach((r,k)=>{let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(let i=0;i<r.p.length;i+=2){x0=Math.min(x0,r.p[i]);x1=Math.max(x1,r.p[i]);y0=Math.min(y0,r.p[i+1]);y1=Math.max(y1,r.p[i+1]);}
  Object.assign(r,{x0,y0,x1,y1});for(let i=Math.floor(x0/cell);i<=Math.floor(x1/cell);i++)for(let j=Math.floor(y0/cell);j<=Math.floor(y1/cell);j++){const key=i*100003+j;let a=grid.get(key);if(!a)grid.set(key,a=[]);a.push(k);}});
 const near=(x,y,r,f)=>{const seen=new Set();for(let i=Math.floor((x-r)/cell);i<=Math.floor((x+r)/cell);i++)for(let j=Math.floor((y-r)/cell);j<=Math.floor((y+r)/cell);j++)for(const k of grid.get(i*100003+j)??[]){if(seen.has(k))continue;seen.add(k);const b=rings[k];if(x<b.x0-r||x>b.x1+r||y<b.y0-r||y>b.y1+r)continue;f(b);}};
 const nearest=(b,x,y)=>{const p=b.p,n=p.length/2;let best=Infinity,inside=false;
  for(let i=0,j=n-1;i<n;j=i++){const ax=p[j*2],ay=p[j*2+1],qx=p[i*2],qy=p[i*2+1];if(((qy>y)!==(ay>y))&&x<(ax-qx)*(y-qy)/(ay-qy)+qx)inside=!inside;
   const dx=qx-ax,dy=qy-ay;let u=((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1e-9);u=u<0?0:u>1?1:u;best=Math.min(best,Math.hypot(x-ax-dx*u,y-ay-dy*u));}
  return {d:best,inside};};
 return {inside(x,y,margin=0){let hit=false;near(x,y,margin,b=>{if(hit)return;const q=nearest(b,x,y);if(q.inside||q.d<margin)hit=true;});return hit;},
  // The height of the building (x, y) is in, or 0.
  height(x,y){let h=0;near(x,y,0,b=>{if(!h&&nearest(b,x,y).inside)h=b.h;});return h;}};
}
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
// The poles city-furniture.js stands up (createCityFurniture: the data's poles, moved off the race where they are too
// near it, and its own lines on the lap's sidewalks), with each one's height, lean and section from its dice: the same
// order of the same seeded draws (on: the terrain grid is there, as the ground is). Returns [{x, y, h, H, lean, half, lap,
// track, k}].
function furniturePoles(data,{map,on,clearance,buildings,occ,nearCoast}){
 const city=data.scenery.city,A=data.samples,L=data.meta.reconstructed_xy_m,PC=Object.fromEntries(city.poles.columns.map((k,i)=>[k,i])),items=city.poles.items;
 const gapAt=(i,x,y)=>{const p=A[i];if(!p)return .6;const side=(x-p[1])*p[9]+(y-p[2])*p[10];const g=side>0?p[16]:p[15];return Number.isFinite(g)?g:.6;};
 const raceClear=(x,y,r,keep=.8)=>{const c=clearance(x,y);if(c.distance<=r)return false;if(c.band==='pista')return c.distance>gapAt(c.i,x,y)+.75+keep+r;return true;};
 const station=s=>{s=((s%L)+L)%L;let lo=0,hi=A.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(A[m][0]<=s)lo=m;else hi=m-1;}return lo;};
 const out=[],dice=(R,P,k,lap,track)=>{
  const H=10.1+R()*1.3,lean=R()<.07?.016+R()*.012:.002+R()*.009,la=R()*6.283;R();R();const round=R()<.2;R();const Wb=.29+R()*.05,Wt=.15+R()*.02;
  const half=round?z=>.155+(.085-.155)*z/H:z=>(Wb+(Wt-Wb)*z/H)/2;
  out.push({x:P.x,y:P.y,h:P.h,H,half,lean:[Math.cos(la)*lean,Math.sin(la)*lean],lap,track,k});
 };
 let slots=items.length;
 items.forEach((it,k)=>{
  let x=it[PC.x],y=it[PC.y];const h=it[PC.heading],track=!!it[PC.track];
  if(!raceClear(x,y,.25,.5)){let ok=false;for(let d=.25;d<=3&&!ok;d+=.25){const nx=x-Math.cos(h)*d,ny=y-Math.sin(h)*d;if(raceClear(nx,ny,.25,.5)){x=nx;y=ny;ok=true;}}if(!ok)return;}
  if(!on(x,y))return;dice(random(7001+k*7919),{x,y,h},k,false,track);occ.add(x,y,.6);
 });
 const dataLap=items.filter(it=>it[PC.track]).map(it=>[it[PC.x],it[PC.y]]);
 if(map)for(const side of [-1,1]){
  let prev=null,misses=0;const RL=random(side>0?8123:9157);
  for(let s=6+RL()*10;s<L-4;){
   const i=station(s),p=A[i],want=random(Math.floor(s/240)*131+(side+1)*7)()<.62;let placed=null;
   if(want){const tl=Math.hypot(p[7],p[8]),tx=p[7]/tl,ty=p[8]/tl,lx=-ty*side,ly=tx*side,gap=side<0?p[15]:p[16],d0=p[4]/2+(Number.isFinite(gap)?gap:.6)+.75+.85;
    for(let d=d0;d<d0+3&&!placed;d+=.25){const x=p[1]+lx*d,y=p[2]+ly*d,q=map.at(x,y);if(!q||q.road<.25||q.cycleway<.05)continue;
     if(!raceClear(x,y,.3,.6)||!occ.free(x,y,.9)||buildings.inside(x,y,.3)||nearCoast(x,y,30)||dataLap.some(([a,b])=>Math.hypot(a-x,b-y)<18))continue;
     if(on(x,y))placed={x,y,h:Math.atan2(-ly,-lx)};}}
   if(!placed){if(++misses>3){prev=null;misses=0;}s+=4;continue;}
   if(!prev){if(!(RL()<.55))RL();}
   const k=slots++;dice(random(5003+k*7919),placed,k,true,false);occ.add(placed.x,placed.y,.6);
   prev=k;misses=0;s+=32+RL()*8;
  }
 }
 return out;
}

// ============================== The plan: where everything goes ==============================
// Pure (plain numbers, no three.js, no ground but the terrain grid's extent), the same at every load, so city-traffic.js
// can ask raceTrafficBlocks() what the race stands on the city's carriageways while the modules are built side by side.
const PLANS=new WeakMap();
export function raceTrafficBlocks(data,map=null){try{return (planRace(data,map)?.trafficBlocks??[]).map(b=>({...b}));}catch(e){console.error('Corrida na cidade (bloqueios):',e);return [];}}
function planRace(data,map){
 const city=data.scenery?.city;if(!city)return null;
 const cached=PLANS.get(data);if(cached&&cached.map===map)return cached.plan;
 const A=data.samples,L=data.meta.reconstructed_xy_m,T=data.terrain,sea=data.meta.sea_level_m??-1e9;
 const on=(x,y)=>!!groundTriangle(T,x,y),rawZ=(x,y)=>groundHeight(T,T.z,x,y)??-1e9;
 const clearance=clearanceIndex(data),buildings=buildingIndex(data),cols=t=>Object.fromEntries(t.columns.map((k,i)=>[k,i]));
 const coastSegs=[];for(const line of city.coast??[])for(let i=0;i+1<line.length;i++)coastSegs.push([line[i][0],line[i][1],line[i+1][0],line[i+1][1]]);
 const coastGrid=new Map();coastSegs.forEach((s,k)=>{for(let i=Math.floor((Math.min(s[0],s[2])-40)/40);i<=Math.floor((Math.max(s[0],s[2])+40)/40);i++)for(let j=Math.floor((Math.min(s[1],s[3])-40)/40);j<=Math.floor((Math.max(s[1],s[3])+40)/40);j++){const key=i*100003+j;let a=coastGrid.get(key);if(!a)coastGrid.set(key,a=[]);a.push(k);}});
 const nearCoast=(x,y,r)=>{for(const k of coastGrid.get(Math.floor(x/40)*100003+Math.floor(y/40))??[]){const [ax,ay,bx,by]=coastSegs[k],dx=bx-ax,dy=by-ay;let u=((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1e-9);u=u<0?0:u>1?1:u;if(Math.hypot(x-ax-u*dx,y-ay-u*dy)<r)return true;}return false;};
 // The furniture's room before its poles (its lines dodge the street trees: ours do not, the trees go), then ours.
 const occF=new Occupancy(6),occ=new Occupancy(6),both=(x,y,r)=>{occF.add(x,y,r);occ.add(x,y,r);};
 for(const b of city.closures??[])both(b.x,b.y,8);
 if(city.parked)for(const [x,y,h] of city.parked.items)for(const a of [-1.45,0,1.45])both(x+Math.cos(h)*a,y+Math.sin(h)*a,1.95);
 for(const [x,y,h,w] of city.crossings?.items??[]){const nx=-Math.sin(h),ny=Math.cos(h);for(let d=-w/2-1;d<=w/2+1.01;d+=1.2)occF.add(x+nx*d,y+ny*d,1.3);}
 for(const [x,y] of data.scenery.trees?.items??[])occF.add(x,y,.7);
 try{
  for(const q of billboardSpots(data))both(q.x,q.y,9);for(const q of marshalSpots(data))both(q.x,q.y,4);for(const q of towerSpots(data))both(q.x,q.y,6);
  for(const q of flagSpots(data))if(Number.isFinite(q.x)&&Number.isFinite(q.y))both(q.x,q.y,1.5);
 }catch(e){console.warn('Corrida na cidade: pontos da pista indisponíveis',e);}
 const poles=furniturePoles(data,{map,on,clearance,buildings,occ:occF,nearCoast});
 for(const P of poles)occ.add(P.x,P.y,.7);
 // What the furniture puts round them later: the junctions' signal posts, the bus stops, the name plates.
 if(city.signals){const S=cols(city.signals);for(const it of city.signals.items)occ.add(it[S.x],it[S.y],(it[S.width]??10)/2+3);}
 for(const it of city.stops?.items??[])occ.add(it[0],it[1],4.5);
 for(const it of city.plates?.items??[])occ.add(it[0],it[1],.6);
 const sampleGrid=new Map();A.forEach((p,i)=>{const key=Math.floor(p[1]/25)*100003+Math.floor(p[2]/25);let a=sampleGrid.get(key);if(!a)sampleGrid.set(key,a=[]);a.push(i);});
 const nearestSample=(x,y)=>{let best=Infinity,bi=-1;const gi=Math.floor(x/25),gj=Math.floor(y/25);for(let i=gi-2;i<=gi+2;i++)for(let j=gj-2;j<=gj+2;j++)for(const k of sampleGrid.get(i*100003+j)??[]){const d=Math.hypot(A[k][1]-x,A[k][2]-y);if(d<best){best=d;bi=k;}}return {i:bi,d:best};};
 const station=s=>{s=((s%L)+L)%L;let lo=0,hi=A.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(A[m][0]<=s)lo=m;else hi=m-1;}return lo;};
 const gapAt=(i,x,y)=>{const p=A[i];if(!p)return .6;const side=(x-p[1])*p[9]+(y-p[2])*p[10];const g=side>0?p[16]:p[15];return Number.isFinite(g)?g:.6;};
 const raceClear=(x,y,r,keep=.8)=>{const c=clearance(x,y);if(c.distance<=r)return false;if(c.band==='pista')return c.distance>gapAt(c.i,x,y)+.75+keep+r;return true;};
 // The lap's bus stops and signal arms stand behind its walls too (city-furniture.js): keep a few metres round them.
 for(const s0 of [...(city.track?.stops??[]),...(city.track?.signals??[])]){const p=A[station(s0)];for(const side of [-1,1])for(const d of [3,6])occ.add(p[1]+p[9]*side*(p[4]/2+.6+.75+d),p[2]+p[10]*side*(p[4]/2+.6+.75+d),3.5);}
 const plan={map,poles,poleBanners:[],streetBanners:[],items:[],stands:[],cables:[],fences:[],strings:[],rows:[],trafficBlocks:[],clearings:[],skipped:{},zones:{}};
 const skip=k=>{plan.skipped[k]=(plan.skipped[k]??0)+1;};

 // --- The lamp-post banners: on most of the lap's own poles, the data's poles on the lap's streets, fewer further off;
 // each little area the same pair of designs alternating (a campaign hung street by street).
 const PAIRS=[[0,1],[0,2],[1,3],[0,4],[1,5],[0,6],[1,7],[0,8],[2,1],[3,0],[4,1],[5,0]];
 for(const P of poles){
  const n=nearestSample(P.x,P.y);if(n.i<0||n.d>130)continue;
  const R=random(77003+P.k*131),want=P.lap?.84:P.track?.9:n.d<45?.72:n.d<90?.46:.24;if(R()>want)continue;
  const mid=z=>P.half(z),room=[1,-1].map(s=>{for(const W of [.75,.6]){const h=mid(4.1),c=Math.cos(P.h),sn=Math.sin(P.h),tip=[P.x+c*s*(h+W+.14),P.y+sn*s*(h+W+.14)],half=[P.x+c*s*(h+W*.5),P.y+sn*s*(h+W*.5)];
   if(raceClear(tip[0],tip[1],.05,.45)&&!buildings.inside(tip[0],tip[1],.12)&&!buildings.inside(half[0],half[1],.05))return W;}return 0;});
  // No room on the street side: the pair hangs along the curb instead, if the sidewalk has it either way.
  let along=false;if(!room[0]){const c=Math.cos(P.h),sn=Math.sin(P.h),ok=[1,-1].every(s=>{const x=P.x-sn*s*.95,y=P.y+c*s*.95;return raceClear(x,y,.05,.35)&&!buildings.inside(x,y,.1);});if(ok){room[0]=room[1]=.75;along=true;}}
  if(!room[0]&&!room[1]){skip('banner');continue;}
  const cell=(Math.imul(Math.floor(P.x/150),73856093)^Math.imul(Math.floor(P.y/150),19349663))>>>0,pair=PAIRS[cell%PAIRS.length];
  const order=P.lap?Math.floor(A[n.i][0]/36):P.k;
  plan.poleBanners.push({pole:P,room,along,design:pair[order&1],phase:R()});
 }
 // --- Banners across the side streets near the lap, between two of the data's poles on either curb (not ones a cable
 // already joins), clear of the race, the bridges and the closures' own banners.
 {
  const wired=new Set((city.poles.wires??[]).flatMap(([i,j])=>[i*100000+j,j*100000+i])),data_=poles.filter(p=>!p.lap),grid=new Map();
  for(const p of data_){const key=Math.floor(p.x/25)*100003+Math.floor(p.y/25);let a=grid.get(key);if(!a)grid.set(key,a=[]);a.push(p);}
  const segs=[];for(const st of city.streets??[])if(!/motorway|service|footway|busway/.test(st.kind??''))for(let i=0;i+1<st.points.length;i++)segs.push([st.points[i][0],st.points[i][1],st.points[i+1][0],st.points[i+1][1]]);
  const streetDir=(x,y)=>{let best=8,dir=null;for(const [ax,ay,bx,by] of segs){if(Math.abs(ax-x)>60&&Math.abs(bx-x)>60)continue;const dx=bx-ax,dy=by-ay;let u=((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1e-9);u=u<0?0:u>1?1:u;const d=Math.hypot(x-ax-u*dx,y-ay-u*dy);if(d<best){best=d;const l=Math.hypot(dx,dy)||1;dir=[dx/l,dy/l];}}return dir;};
  const cand=[],why=k=>{plan.skipped['faixa_'+k]=(plan.skipped['faixa_'+k]??0)+1;};
  for(const a of data_){const gi=Math.floor(a.x/25),gj=Math.floor(a.y/25);
   for(let i=gi-1;i<=gi+1;i++)for(let j=gj-1;j<=gj+1;j++)for(const b of grid.get(i*100003+j)??[]){
    if(b.k<=a.k)continue;const d=Math.hypot(b.x-a.x,b.y-a.y);if(d<8||d>26)continue;
    const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,ns=nearestSample(mx,my);if(ns.d<20||ns.d>180){why('far');continue;}
    if(wired.has(a.k*100000+b.k)){why('wired');continue;}
    if(!map||map.at(mx,my).road>-1||map.at(a.x,a.y).road<0||map.at(b.x,b.y).road<0){why('road');continue;}
    const dir=streetDir(mx,my);if(!dir||Math.abs(((b.x-a.x)*dir[0]+(b.y-a.y)*dir[1])/d)>.5){why('across');continue;}
    if((city.closures??[]).some(c=>Math.hypot(c.x-mx,c.y-my)<14)){why('closure');continue;}
    let ok=true;for(let t=0;t<=1.001&&ok;t+=.125){const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,c=clearance(x,y);if(!raceClear(x,y,.5,2)||c.band==='ponte'&&c.distance<6)ok=false;}
    if(ok)cand.push({a,b,mx,my,score:ns.d});else why('race');
   }}
  // Or from a pole to the facade across its street (a plate bolted to the wall, 5-6 m up a building of two floors or more).
  for(const a of data_){const ns=nearestSample(a.x,a.y);if(ns.d<20||ns.d>150)continue;const c=Math.cos(a.h),s=Math.sin(a.h);let crossed=false,end=null;
   for(let d=1;d<=24;d+=.5){const x=a.x+c*d,y=a.y+s*d;if(map&&map.at(x,y).road<-1)crossed=true;if(buildings.inside(x,y,0)){if(crossed&&d>=8&&buildings.height(x,y)>=7)end={x:x-c*.5,y:y-s*.5,d:d-.5};break;}}
   if(!end){why('facade');continue;}const mx=(a.x+end.x)/2,my=(a.y+end.y)/2;
   if((city.closures??[]).some(q=>Math.hypot(q.x-mx,q.y-my)<14)){why('closure');continue;}
   let ok=true;for(let t=0;t<=1.001&&ok;t+=.125){const x=a.x+(end.x-a.x)*t,y=a.y+(end.y-a.y)*t,q=clearance(x,y);if(!raceClear(x,y,.5,2)||q.band==='ponte'&&q.distance<6)ok=false;}
   if(ok)cand.push({a,b:{x:end.x,y:end.y,wall:true,h:a.h+Math.PI,lean:[0,0],half:()=>.02,k:-1},mx,my,score:ns.d+15});else why('race');}
  cand.sort((p,q)=>p.score-q.score);
  for(const c of cand){if(plan.streetBanners.length>=10)break;if(plan.streetBanners.some(q=>Math.hypot(q.mx-c.mx,q.my-c.my)<60))continue;plan.streetBanners.push({...c,design:plan.streetBanners.length%STREET_LINES.length});}
 }

 // --- Placing a thing: tried at (x, y) and nudged up to 3 m; taken when its footprint (half sizes hu, hv round its
 // centre, cu metres ahead of its origin) stands on the grid, above the sea, out of buildings, clear of the race, the
 // pits, stands and bridges, off the streets' carriageways (a car park's own lanes allowed with park), away from the
 // shore, and clear of what is already there.
 const okPoint=(x,y,o)=>{
  if(!on(x,y)||rawZ(x,y)<sea+.35||buildings.inside(x,y,.4)||!raceClear(x,y,.3,o.keep??1.5))return false;
  const c=clearance(x,y);if(c.band&&c.band!=='pista'&&c.distance<1.5)return false;
  if((o.coast??12)>0&&nearCoast(x,y,o.coast??12))return false;
  if(map){const d=map.at(x,y);if(d.road<.4&&!o.road&&!(o.park&&d.parking<4))return false;}
  return true;
 };
 const foot=(x,y,h,hu,hv,step=1.6)=>{const c=Math.cos(h),s=Math.sin(h),nu=Math.max(1,Math.ceil(2*hu/step)),nv=Math.max(1,Math.ceil(2*hv/step)),pts=[];for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++){const a=-hu+2*hu*i/nu,b=-hv+2*hv*j/nv;pts.push([x+c*a-s*b,y+s*a+c*b]);}return pts;};
 const OFF=[[0,0],[1.5,0],[-1.5,0],[0,1.5],[0,-1.5],[1.5,1.5],[-1.5,-1.5],[1.5,-1.5],[-1.5,1.5],[3,0],[-3,0],[0,3],[0,-3],[3,3],[-3,-3],[3,-3],[-3,3]];
 const put=(kind,x,y,h,hu,hv,o={})=>{
  const c=Math.cos(h),s=Math.sin(h),cu=o.cu??0,cv=o.cv??0,pad=o.pad??.35;
  for(const [dx,dy] of o.exact?[[0,0]]:OFF){
   const ox=x+dx,oy=y+dy,cx=ox+c*cu-s*cv,cy=oy+s*cu+c*cv,pts=foot(cx,cy,h,hu,hv);
   if(!pts.every(([px,py])=>okPoint(px,py,o)&&occ.free(px,py,pad)))continue;
   for(const [px,py] of foot(cx,cy,h,hu,hv,1.2))occ.add(px,py,.65);
   if(map&&pts.some(([px,py])=>map.at(px,py).road<.6))plan.trafficBlocks.push({x:+cx.toFixed(2),y:+cy.toFixed(2),r:+(Math.hypot(hu,hv)+.6).toFixed(2)});
   if(o.clear!==false)plan.clearings.push({x:cx,y:cy,r:Math.hypot(hu,hv)+1.2});
   const item={kind,x:ox,y:oy,h,zone:o.zone??null,...o.params,foot:[cx,cy,hu,hv]};plan.items.push(item);return item;
  }
  if(!o.quiet)skip(kind);return null;
 };
 // A row of fans standing (or sitting, stand false) from (x0, y0) to (x1, y1), facing (fx, fy): cut where it cannot stand.
 const crowdRow=(x0,y0,x1,y1,fx,fy,stand=true,pad=.25)=>{
  const len=Math.hypot(x1-x0,y1-y0),ux=(x1-x0)/len,uy=(y1-y0)/len;let run=null;
  const close=()=>{if(run&&run[1]-run[0]>=4.2){plan.rows.push({x0:x0+ux*run[0],y0:y0+uy*run[0],x1:x0+ux*run[1],y1:y0+uy*run[1],fx,fy,stand});for(let t=run[0];t<=run[1];t+=1)occ.add(x0+ux*t,y0+uy*t,.45);
   for(let t=run[0];t<=run[1];t+=3)plan.clearings.push({x:x0+ux*t,y:y0+uy*t,r:2.6});}run=null;};
  for(let t=0;t<=len;t+=.5){const x=x0+ux*t,y=y0+uy*t;if(okPoint(x,y,{coast:8})&&occ.free(x,y,pad))(run??=[t,t])[1]=t;else close();}
  close();
 };
 const fenceRun=(pts,zone)=>{const run=[];for(let i=0;i+1<pts.length;i++){const [ax,ay]=pts[i],[bx,by]=pts[i+1],d=Math.hypot(bx-ax,by-ay),n=Math.max(1,Math.round(d/2.05)),h=Math.atan2(by-ay,bx-ax);
  for(let k=0;k<n;k++){const t=(k+.5)/n,x=ax+(bx-ax)*t,y=ay+(by-ay)*t,e=foot(x,y,h,1,.25,1);if(e.every(([px,py])=>okPoint(px,py,{coast:4,keep:1})&&occ.free(px,py,.15))){run.push([x,y,h,d/n]);occ.add(x,y,1.05);if(k%2===0)plan.clearings.push({x,y,r:3});}}}
  if(run.length)plan.fences.push({zone,panels:run});};
 const toward=(x,y,tx,ty)=>Math.atan2(ty-y,tx-x);
 // A row of n portable toilets from (x, y) stepping (dx, dy), doors to h: the whole row nudged as one, never split.
 const toilets=(n,x,y,dx,dy,h,o,tone)=>{
  for(const [ox,oy] of OFF){const pts=Array.from({length:n},(_,k)=>[x+ox+dx*k,y+oy+dy*k]);
   if(!pts.every(([px,py])=>foot(px,py,h,.7,.7,.7).every(([qx,qy])=>okPoint(qx,qy,o)&&occ.free(qx,qy,.2))))continue;
   pts.forEach(([px,py],k)=>{plan.items.push({kind:'toilet',x:px,y:py,h,zone:o.zone,tone:tone+k});occ.add(px,py,.8);plan.clearings.push({x:px,y:py,r:1.5});});return;}
  skip('toilets');
 };

 // --- The fan zone on the Parque Náutico's lawn: the screen and its stage at the south, facing the lap's corner across
 // the avenue (the first thing the cars see coming down Rua Claudino Bento); fans standing before it, food trucks along
 // the avenue's side serving the lawn, plastic tables under string lights, tents at the gate on the north tip, toilets,
 // the generator behind the screen, light towers, feather flags and crowd fences round it.
 const nautico=city.squares?.find(q=>/N[aá]utico/i.test(q.name??''));
 if(nautico){
  const O=[338,-62],e1=unit([27,87,0]),e2=[e1[1],-e1[0]],Z=(a,b)=>[O[0]+e2[0]*a+e1[0]*b,O[1]+e2[1]*a+e1[1]*b],hf=Math.atan2(e1[1],e1[0]),he=Math.atan2(e2[1],e2[0]);
  const zone='nautico';plan.zones[zone]={x:Z(0,12)[0],y:Z(0,12)[1]};
  const screen=put('screen',...Z(0,0),hf,3.3,5.9,{cu:1.8,zone,exact:false});
  put('generator',...Z(-1,-5),he,1.9,.9,{zone});
  toilets(5,...Z(-10.5,-1.5),e1[0]*1.32,e1[1]*1.32,he,{zone},0);
  const trucks=[[345,-28],[351.5,-38.5],[358,-49]].map(([x,y],k)=>put('truck',x,y,2.13,2.95,1.2,{cv:.35,zone,params:{name:k}}));
  if(screen)for(let r=0;r<10;r++){const b=5.6+r*1.1,w=8+r*.55;const [x0,y0]=Z(-w,b),[x1,y1]=Z(w,b);crowdRow(x0,y0,x1,y1,-e1[0],-e1[1]);}
  for(const T of trucks)if(T){const c=Math.cos(T.h),s=Math.sin(T.h),lx=-s,ly=c;const x=T.x+lx*2.6,y=T.y+ly*2.6;crowdRow(x-c*2.4,y-s*2.4,x+c*2.4,y+s*2.4,-lx,-ly);}
  const tables=[];for(const [a,b] of [[-12,19],[-7.5,21],[-3,19.5],[-13,24.5],[-8.5,26.5],[-4,25],[-10.5,30.5],[-6,31.5]]){const [x,y]=Z(a,b),t=put('table',x,y,hf+(a*b)%1.3,1.25,1.25,{zone,pad:.3});if(t)tables.push(t);}
  const corners=[Z(-15.5,16.5),Z(.5,16),Z(.5,33.5),Z(-15.5,34.5)],lp=corners.map(([x,y])=>put('lpole',x,y,0,.15,.15,{zone,pad:.1,clear:false})).filter(Boolean);
  if(lp.length>=3)plan.strings.push({zone,poles:[...lp,lp[0]],cross:lp.length===4?[[0,2],[1,3]]:[]});
  for(const [a,b,tx,ty] of [[-16,8,0,12],[11,13,0,10]]){const [x,y]=Z(a,b),[px,py]=Z(tx,ty);put('tower',x,y,toward(x,y,px,py),1.1,.9,{zone});}
  [[319,-15],[327.5,-19.5]].forEach(([x,y],k)=>put('tent',x,y,toward(x,y,...Z(-6,22)),1.6,1.6,{zone,params:{name:k?6:7,L:3,D:3}}));
  put('ambulance',326,-6,-1.0,2.8,1.05,{zone,coast:6});put('tent',...Z(-17,13),he,2.1,1.6,{zone,params:{name:10,L:4,D:3}});
  for(const [x,y] of [[315.5,-8],[321,-5],[331,-12.5],[341,-21],[348,-33.5],[355,-44]])put('flag',x,y,0,.35,.35,{zone,pad:.1,clear:false});
  fenceRun([[327,-5],[340.5,-18.5],[353.5,-34],[365,-51],[369.5,-63]],zone);fenceRun([[311,-9],[313.5,-36],[317.5,-61],[321,-74],[332,-75]],zone);
  if(screen){const g=plan.items.find(i=>i.kind==='generator'&&i.zone===zone);if(g){const S=Z(-4.6,-.5);plan.cables.push([[g.x,g.y],[(g.x+S[0])/2+.4,(g.y+S[1])/2],S]);
   for(const T of trucks)if(T){const c=Math.cos(T.h),s=Math.sin(T.h),e=[T.x-c*2.9+s*.9,T.y-s*2.9-c*.9];plan.cables.push([[g.x,g.y],[g.x+(e[0]-g.x)*.5+1.2,g.y+(e[1]-g.y)*.5-.8],e]);}}}
 }
 // --- A smaller one at the old bridge's head (Praça Ponte Hercílio Luz): a food trailer, two tents, toilets, flags.
 const hl=city.squares?.find(q=>/Ponte Herc/i.test(q.name??''));
 if(hl){
  const zone='hercilio';plan.zones[zone]={x:239,y:247};
  const tr=put('trailer',237,241,.2,2.1,1.15,{cv:.3,zone,coast:4,params:{name:4}});
  if(tr){const c=Math.cos(tr.h),s=Math.sin(tr.h),x=tr.x-s*2.6,y=tr.y+c*2.6;crowdRow(x-c*2.3,y-s*2.3,x+c*2.3,y+s*2.3,s,-c);}
  put('tent',229.5,257,0,1.6,1.6,{zone,coast:4,params:{name:6,L:3,D:3}});put('tent',252,237.5,1.9,1.6,2.1,{zone,coast:4,params:{name:11,L:4,D:3}});
  toilets(3,223,233.5,0,1.32,0,{zone,coast:4},2);
  for(const [x,y] of [[241,263],[247,252],[259,240],[233,231],[226,247]])put('flag',x,y,0,.35,.35,{zone,pad:.1,clear:false,coast:4});
  const lp=[[227,244],[244,256],[250,244],[236,235]].map(([x,y])=>put('lpole',x,y,0,.15,.15,{zone,pad:.1,clear:false,coast:4})).filter(Boolean);
  if(lp.length>=3)plan.strings.push({zone,poles:[...lp,lp[0]],cross:[]});
 }

 // --- Tubular grandstands behind the walls: in the hairpin's infield and along the Estreito's long bend. Blocks along
 // the lap from s0, each level, set back from the wall until it stands off the open streets (or at the least set back
 // on the closed avenue's own lanes, blocked to the traffic), never on the lap's bus stops, signals or poles.
 const stands=(s0,s1,side,len,rows,zone)=>{
  let s=s0,count=0;const T0=.82,depth=rows*T0+.9;
  while(s<s1){
   const i=station(s+len/2),p=A[i],tl=Math.hypot(p[7],p[8]),tx=-side*p[7]/tl,ty=-side*p[8]/tl,rx=side*p[9],ry=side*p[10],gap=side<0?p[15]:p[16],edge=p[4]/2+(Number.isFinite(gap)?gap:.6)+.75;
   let placed=null;
   for(const road of [false,true]){for(const back of road?[4.6]:[4.6,6,7.5,9,10.5,12,14]){
    const cx=p[1]+rx*(edge+back+depth/2),cy=p[2]+ry*(edge+back+depth/2),pts=foot(cx,cy,Math.atan2(ty,tx),len/2+.4,depth/2+.6,1.5);
    if(!pts.every(([x,y])=>okPoint(x,y,{road,coast:6,keep:2.5})&&occ.free(x,y,.2)))continue;
    for(const [x,y] of foot(cx,cy,Math.atan2(ty,tx),len/2+.4,depth/2+.6,1.2))occ.add(x,y,.65);
    if(road&&map&&pts.some(([x,y])=>map.at(x,y).road<.6))plan.trafficBlocks.push({x:+cx.toFixed(2),y:+cy.toFixed(2),r:+(Math.hypot(len/2,depth/2)+1).toFixed(2)});
    plan.clearings.push({x:cx,y:cy,r:Math.hypot(len/2,depth/2)+1.5});
    placed={x:p[1]+rx*(edge+back),y:p[2]+ry*(edge+back),tx,ty,rx,ry,len,rows,tread:T0,s:p[0],zone,k:count++};break;}
    if(placed)break;}
   if(placed){plan.stands.push(placed);s+=len+2.2;}else{skip('stand');s+=3;}
  }
 };
 stands(1438,1500,-1,13,8,'grampo');stands(3452,3520,-1,12,7,'estreito');
 // The Estreito's stand gets a screen trailer at its far end, turned to its fans, and its toilets and a food trailer behind.
 {const es=plan.stands.filter(b=>b.zone==='estreito');if(es.length){const b=es.at(-1),f=es[0],mid=[(f.x+b.x)/2+b.rx*4,(f.y+b.y)/2+b.ry*4];
  const x=b.x+b.tx*(b.len/2+4)+b.rx*2.5,y=b.y+b.ty*(b.len/2+4)+b.ry*2.5;put('screenTrailer',x,y,toward(x,y,mid[0]-b.rx*3,mid[1]-b.ry*3),1.4,2.7,{zone:'estreito',coast:4});
  const back=b.rows*b.tread+4.5;toilets(3,f.x+f.rx*back-f.tx*2,f.y+f.ry*back-f.ty*2,f.tx*1.32,f.ty*1.32,Math.atan2(-f.ry,-f.rx),{zone:'estreito'},4);
  const fx=(f.x+b.x)/2+f.rx*(back+1.5),fy=(f.y+b.y)/2+f.ry*(back+1.5);put('trailer',fx,fy,Math.atan2(f.ty,f.tx)+Math.PI,2.1,1.15,{cv:.3,zone:'estreito',params:{name:0}});}}

 // --- The hairpin's car park, by the pits: the TV compound (two outside-broadcast trucks, the satellite uplink truck, a
 // generator and the cables to the lap), the ambulance and the fire engine on standby, the marshals' tent, toilets.
 {
  const zone='grampo',park={zone,park:true,coast:4};plan.zones[zone]={x:790,y:-180};
  const ob=[put('ob',768,-170,.1,5.7,1.35,{...park,params:{livery:0}}),put('ob',769.5,-184,.1,5.7,1.35,{...park,params:{livery:1}}),put('sng',773,-198,.1,3.9,1.3,{...park})];
  const gen=put('generator',795,-171,.1+Math.PI/2,1.9,.9,park);
  put('tent',803,-198,-2.4,1.6,1.6,{...park,params:{name:8,L:3,D:3}});
  put('tent',806,-149,-2.0,1.6,2.1,{...park,params:{name:9,L:4,D:3,marshals:true}});
  put('ambulance',812,-209,-2.4,2.8,1.05,park);put('fire',793,-219,-2.6,4.4,1.3,park);
  toilets(4,788,-147.5,1.32,0,-Math.PI/2,park,1);
  const near=plan.stands.filter(b=>b.zone===zone);
  if(gen)for(const o of ob)if(o){const c=Math.cos(o.h),s=Math.sin(o.h);plan.cables.push([[gen.x,gen.y],[(gen.x+o.x)/2+.8,(gen.y+o.y)/2-.6],[o.x-c*4.8,o.y-s*4.8-1.4]]);}
  if(ob[0]&&near.length){const b=near[Math.floor(near.length/2)],e=[b.x-b.rx*1.2,b.y-b.ry*1.2];plan.cables.push([[ob[0].x+3,ob[0].y+.5],[(ob[0].x+e[0])/2,(ob[0].y+e[1])/2+3],[e[0]+b.tx*7,e[1]+b.ty*7],e]);}
 }
 // --- The broadcast's crane by the lap: outside the hairpin, else at the fan zone's corner; its arm reaches toward the
 // track and stops behind the wall.
 {let done=false;
  for(const [a,b,side] of [[1440,1500,1],[1500,1550,1],[905,960,-1],[3460,3540,1]]){if(done)break;
   for(let s=a;s<=b&&!done;s+=5){const p=A[station(s)],rx=side*p[9],ry=side*p[10],gap=side<0?p[15]:p[16],edge=p[4]/2+(Number.isFinite(gap)?gap:.6)+.75;
    for(const back of [6.5,8,9.5]){const x=p[1]+rx*(edge+back),y=p[2]+ry*(edge+back);if(put('crane',x,y,Math.atan2(-ry,-rx),1.5,1.5,{coast:4,keep:2,exact:true,quiet:true,params:{reach:back-1.4}})){done=true;break;}}}}}
 PLANS.set(data,{map,plan});
 return plan;
}

// ============================== The pieces, each in a frame F at its ground (u its front, v to its left, z up) ==============================
const C={galv:lin(0x9ba2a6),steel:lin(0x5d6468),black:lin(0x161718),dark:lin(0x2a2d30),white:lin(0xefefeb),rubber:lin(0x121212),glass:lin(0x1b2430),plank:lin(0xa7aaa8),warm:lin(0xffd9a0),cool:lin(0xe8f0ff)};
const DIR=(F,u,v,z=0)=>sub(F(u,v,z),F(0,0,z));
// Two banners on a lamp post, on brackets at either side of it: across the sidewalk (room: the street side's width, the
// house side's), facing along the street; or, where the street side has no room (the lap's poles near the walls), along
// the curb, facing the street.
function poleBanners(K,F,P,R,design,room,phase,along){
 const z0=3.15+R()*.1,hb=1.72,top=z0+hb,steel=lin(0x5d6468,.85+R()*.25);
 for(const z of [z0,top]){const h=P.half(z)+.022;K.box(F,-h,h,-.075,.075,z-.035,z+.035,steel,METAL(.5),{bottom:true});}
 const sides=[[1,room[0]],[-1,room[1]]];
 sides.forEach(([s,W],i)=>{
  if(!W)return;const arm=W+.1,h0=along?.075:P.half(z0),h1=along?.075:P.half(top),A=(d,z)=>along?F(0,s*d,z):F(s*d,0,z);
  for(const [z,h] of [[z0,h0],[top,h1]]){K.bar(A(h,z),A(h+arm,z),.012,steel,METAL(.6));const e=A(h+arm,z);K.box((u,v,w)=>[e[0]+u,e[1]+v,e[2]+w],-.022,.022,-.022,.022,-.022,.022,steel,METAL(.6),{bottom:true});}
  const d0=Math.max(h0,h1)+.045,tw=(R()-.5)*.08,fade=.86+R()*.16,front=along?DIR(F,1,0):DIR(F,0,1);
  K.cloth((uf,zf)=>{const d=d0+W*uf;return along?F(tw*uf,s*d,z0+.035+(hb-.07)*zf):F(s*d,tw*uf,z0+.035+(hb-.07)*zf);},2,5,REG.pole(design),[fade,fade,fade],(uf,zf)=>.5*Math.pow(uf,1.2)*(.35+.65*Math.sin(Math.PI*zf)),(phase+i*.13)%1,front);
 });
}
// A cloth banner across the street between two poles (A, B: frames and sections), tied by ropes to both.
function streetBanner(K,PA,PB,FA,FB,zA,zB,R,design,phase){
 const d=Math.hypot(PB.x-PA.x,PB.y-PA.y),ux=(PB.x-PA.x)/d,uy=(PB.y-PA.y)/d,Lb=Math.min(d-1.8,9.6),hb=.92,t0=(d-Lb)/2/d,t1=1-t0,zb=5.05+R()*.35,sag=.05+R()*.08,zl=Math.max((zA+zB)/2+zb,Math.max(zA,zB)+4.7);
 const at=(uf,zf)=>{const t=t0+(t1-t0)*uf;return [PA.x+(PB.x-PA.x)*t,PA.y+(PB.y-PA.y)*t,zl+hb*zf-4*sag*uf*(1-uf)];};
 K.cloth(at,10,2,REG.street(design),[1,1,1],(u,z)=>.85*Math.sin(Math.PI*u)*(.55+.45*Math.sin(Math.PI*z)),phase,[-uy,ux,0]);
 const rope=lin(0x2b2a27);
 for(const [F,P,uf,dir] of [[FA,PA,0,1],[FB,PB,1,-1]])for(const zf of [0,1]){
  const c=at(uf,zf),pz=zl-(uf?zB:zA)+hb*zf+(zf?.32:-.12),h=P.half(pz),p=add(F(0,0,pz),[ux*dir*h,uy*dir*h,0]),pts=span(p,c,.04,3);
  for(let k=0;k<3;k++)K.bar(pts[k],pts[k+1],.007,rope);K.box(F,-h-.02,h+.02,-h-.02,h+.02,pz-.03,pz+.03,rope,PLAIN,{bottom:true});
 }
}
// The inside of a box (faces turned in): a food truck's kitchen seen through its hatch.
function room(K,F,u0,u1,v0,v1,z0,z1,col,look){
 const P=(i,j,k)=>F(i?u1:u0,j?v1:v0,k?z1:z0),c=F((u0+u1)/2,(v0+v1)/2,(z0+z1)/2),face=(A,B,C2,D)=>K.quad(A,B,C2,D,col,look,null,sub(c,scale(add(add(A,B),add(C2,D)),.25)));
 face(P(0,0,0),P(0,1,0),P(0,1,1),P(0,0,1));face(P(1,1,0),P(1,0,0),P(1,0,1),P(1,1,1));face(P(1,0,0),P(0,0,0),P(0,0,1),P(1,0,1));face(P(0,0,1),P(1,0,1),P(1,1,1),P(0,1,1));face(P(0,0,0),P(1,0,0),P(1,1,0),P(0,1,0));
}
function wheel(K,F,u,v,r,w){const s=Math.sign(v)||1;K.tube(F(u,v-s*w/2,r),F(u,v+s*w/2,r),r,r,8,C.rubber,PLAIN,{bottom:true});K.tube(F(u,v+s*w/2,r),F(u,v+s*(w/2+.004),r),r*.55,r*.55,8,lin(0x8c9195),METAL(.6));}
// A food truck (a step van) or a food trailer, its hatch open on the left (+v), the awning up, its name on the roof board.
function foodTruck(K,F,R,k,trailer=false){
 const [,bg]=TRUCKS[k],body=lin(bg,.9+R()*.12),W=1.1,zb=trailer?.5:.55,zt=trailer?2.75:3.0,u0=trailer?-1.9:-2.8,u1=trailer?1.9:1.3,win=trailer?[-1.4,1.4,1.15,2.1]:[-2.2,.9,1.2,2.25],out=DIR(F,0,1);
 if(trailer){wheel(K,F,0,W-.05,.32,.2);wheel(K,F,0,-W+.05,.32,.2);K.bar(F(u1,0,.5),F(u1+1.3,0,.42),.04,C.dark,METAL(.4));K.bar(F(u1+.9,0,.45),F(u1+.9,0,.02),.025,C.dark);}
 else for(const u of [-1.75,1.85])for(const s of [-1,1])wheel(K,F,u,s*(W-.07),.38,.24);
 K.box(F,u0,u1,-W,W,zb,zt,body,METAL(.12),{skip:[3],bottom:true});
 const P=(u,z)=>F(u,W,z);for(const [a,b,c,d] of [[u0,u1,zb,win[2]],[u0,u1,win[3],zt],[u0,win[0],win[2],win[3]],[win[1],u1,win[2],win[3]]])K.quad(P(a,c),P(b,c),P(b,d),P(a,d),body,METAL(.12),null,out);
 room(K,F,win[0]-.05,win[1]+.05,-W+.06,W,win[2]-.45,win[3]+.12,lin(0x6b625a),GLOW(.05));
 K.box(F,win[0]+.1,win[1]-.1,-W+.07,-W+.5,win[2]-.45,win[2]+.05,lin(0x9aa0a4),METAL(.6));
 K.box(F,win[0]-.04,win[1]+.04,W,W+.3,win[2]-.06,win[2],lin(0xb8bcbf),METAL(.7),{bottom:true});
 // The awning flap swung up, the strip light under it.
 const a=1.05,ang=1.05+R()*.15,hz=win[3]+.05,ov=W+a*Math.cos(ang),oz=hz+a*Math.sin(ang),fc=lin(TRUCKS[k][2],.9);
 for(const s of [1,-1])K.quad(F(win[0]-.05,W+.01,hz),F(win[1]+.05,W+.01,hz),F(win[1]+.05,ov,oz),F(win[0]-.05,ov,oz),s>0?body:fc,PLAIN,null,s>0?[0,0,1]:[0,0,-1]);
 K.box(F,win[0]+.1,win[1]-.1,W+.02,W+.06,win[3]-.06,win[3]-.02,C.warm,GLOW(.9),{bottom:true});
 // The name on a board over the roof, both faces; again on the other side, low.
 const bu=(u0+u1)/2-(trailer?0:.3),bw=trailer?2.9:3.2;for(const u of [bu-bw/2+.2,bu+bw/2-.2])K.bar(F(u,0,zt),F(u,0,zt+.3),.03,C.dark);K.box(F,bu-bw/2,bu+bw/2,-.04,.04,zt+.3,zt+.96,body,PLAIN,{bottom:true});
 for(const s of [1,-1])K.sign(F(bu,s*.045,zt+.63),scale(out,s),bw-.06,.62,REG.name(k),[1,1,1],GLOW(.25));
 K.sign(F((u0+u1)/2,-W-.006,1.75),scale(out,-1),Math.min(3.2,u1-u0-.4),.78,REG.name(k));
 if(!trailer){
  K.prism(F,[[u1,zb],[2.75,zb],[2.75,1.3],[2.45,2.2],[u1,2.55]],-W+.04,W-.04,body,METAL(.12));
  K.quad(F(2.735,-W+.14,1.36),F(2.735,W-.14,1.36),F(2.455,W-.14,2.15),F(2.455,-W+.14,2.15),C.glass,METAL(.7),null,[1,0,.4]);
  for(const s of [1,-1])K.sign(F(1.95,s*(W-.03),1.85),scale(out,s),.75,.62,REG.dark,[1,1,1],METAL(.7));
  K.box(F,2.72,2.82,-W+.05,W-.05,.35,.6,C.black);for(const s of [1,-1])K.box(F,2.74,2.77,s*.65-.12,s*.65+.12,.95,1.08,C.cool,GLOW(.5));
 }
 // A gas cylinder and a bin at the back.
 const gc=lin(pick(R,[0x8a9196,0x2f5c8a,0xb8432e]));K.tube(F(u0-.35,-.55,0),F(u0-.35,-.55,.95),.17,.17,8,gc,METAL(.3));K.tube(F(u0-.35,-.55,.95),F(u0-.35,-.55,1.06),.09,.05,6,gc,METAL(.3));
 K.tube(F(u0+.4,W+.55,0),F(u0+.4,W+.55,.9),.24,.27,8,lin(pick(R,[0xe8691a,0x2f7d3a,0x1d4f9c])),PLAIN,{bottom:false});
}
// A portable toilet: cabin, white roof, the door (its colour from the cabin) on the front, a vent pipe.
function toilet(K,F,R,col){
 K.box(F,-.58,.58,-.58,.58,-.12,2.18,col,PLAIN,{top:false});K.box(F,-.64,.64,-.64,.64,2.18,2.3,lin(0xf0f0ec,.9+R()*.1),PLAIN,{bottom:true});
 K.sign(F(.586,0,1.02),DIR(F,1,0),.88,1.92,REG.wc,scale(col,1.15));K.tube(F(-.38,-.38,2.3),F(-.38,-.38,2.6),.045,.045,6,C.dark);
}
function generator(K,F,R){
 const col=lin(pick(R,[0xf2c318,0xf4f4f0,0x9aa1a5,0x2f7d3a]),.85+R()*.2);
 K.box(F,-1.5,1.5,-.62,.62,.42,.55,C.dark,METAL(.3),{bottom:true});wheel(K,F,0,.78,.3,.18);wheel(K,F,0,-.78,.3,.18);
 K.bar(F(1.5,0,.5),F(2.6,0,.42),.035,C.dark,METAL(.4));K.bar(F(2.3,0,.45),F(2.3,0,0),.025,C.dark);
 K.box(F,-1.4,1.3,-.6,.6,.55,1.75,col,METAL(.15));for(const s of [1,-1])K.sign(F(-.3,s*.606,1.15),DIR(F,0,s),1.6,.7,REG.vent,col);
 K.tube(F(-.95,.25,1.75),F(-.95,.25,2.2),.06,.06,6,C.dark,METAL(.4));K.sign(F(1.306,0,1.25),DIR(F,1,0),.5,.4,REG.dark,[1,1,1],GLOW(.4));
}
// A light tower on its trailer: the mast and four lamps aimed ahead (+u), lit after dark.
function lightTower(K,F,R){
 const col=lin(pick(R,[0xf2c318,0xf4f4f0]),.9+R()*.1);
 K.box(F,-1,1,-.55,.55,.45,1.45,col,METAL(.15),{bottom:true});wheel(K,F,-.2,.7,.3,.18);wheel(K,F,-.2,-.7,.3,.18);
 for(const [u,v] of [[-.9,-1.4],[-.9,1.4],[.9,-1.4],[.9,1.4]]){K.bar(F(u,Math.sign(v)*.5,.7),F(u,v,.2),.03,C.dark);K.box(F,u-.12,u+.12,v-.12,v+.12,0,.06,C.dark);}
 K.tube(F(-.6,0,1.45),F(-.6,0,8.3),.08,.055,6,C.galv,METAL(.6));K.box(F,-.66,-.54,-.95,.95,8.2,8.3,C.galv,METAL(.6),{bottom:true});
 for(const v of [-.72,-.24,.24,.72]){const Fl=(u,w,z)=>F(-.45+u*Math.cos(.5)+z*Math.sin(.5),v+w,8.0+z*Math.cos(.5)-u*Math.sin(.5));
  K.box(Fl,-.12,.1,-.2,.2,-.18,.18,C.dark,METAL(.3),{bottom:true});K.quad(Fl(.101,-.18,-.16),Fl(.101,.18,-.16),Fl(.101,.18,.16),Fl(.101,-.18,.16),C.cool,GLOW(1),null,DIR(Fl,1,0));}
}
// Festoon lights: poles at pts (track x, y, ground z), a sagging cable between each two, bulbs along it lit at night.
function stringLights(K,pts,R,cross){
 const H=4.2,top=pts.map(([x,y,z])=>[x,y,z+H]);
 for(const [x,y,z] of pts.slice(0,-1)){K.tube([x,y,z-.2],[x,y,z+H+.15],.045,.035,6,lin(0x4a3a2a,.8+R()*.3));}
 const spanLights=(a,b)=>{const d=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(4,Math.round(d/.75)),pts2=span(a,b,.35+d*.025,n);
  for(let k=0;k<n;k++)K.bar(pts2[k],pts2[k+1],.006,C.black);
  for(let k=1;k<n;k++){const p=pts2[k],c=R()<.78?C.warm:lin(pick(R,[0xff6a5a,0x6ad0ff,0x8aff8a,0xffe066]));K.box((u,v,w)=>[p[0]+u,p[1]+v,p[2]+w],-.035,.035,-.035,.035,-.13,-.06,c,GLOW(1),{bottom:true});}};
 for(let i=0;i+1<top.length;i++)spanLights(top[i],top[i+1]);for(const [i,j] of cross)spanLights(top[i],top[j]);
}
// A feather flag: its bent fibreglass pole and the sail along it, swaying.
function featherFlag(K,F,R,colA,colB,phase){
 const spine=t=>t<.72?F(0,0,.45+t/.72*2.55):F((t-.72)/.28*.55,0,3+Math.sin((t-.72)/.28*1.2)*.62);
 const pole=[0,.36,.72,.86,1].map(spine);for(let k=0;k<4;k++)K.bar(pole[k],pole[k+1],.014,C.dark);K.bar(F(0,0,-.3),pole[0],.016,C.dark);
 const w=t=>.7*(t<.82?Math.min(1,.65+t*2):(1-t)/.18);
 const at=(uf,t)=>{const s=spine(t),off=DIR(F,1,0);return add(add(s,scale(off,w(t)*uf)),[0,0,-uf*.18*t]);};
 const front=DIR(F,0,1);K.cloth(at,2,6,null,colA,(u,t)=>.35*u*(.4+t*.6),phase,front);
 K.cloth((uf,t)=>{const p=at(1,.12+t*.68);return add(p,add(scale(DIR(F,1,0),-.08*uf),[0,0,0]));},1,4,null,colB,()=>.32,phase,front);
}
// A panel of crowd fence: 2 m of galvanized frame and bars on its two flat feet.
function fencePanel(K,F,R,len){
 const c=lin(0x9ba2a6,.8+R()*.3),hl=len/2-.04;
 for(const s of [-1,1]){K.bar(F(s*hl,0,.05),F(s*hl,0,1.12),.016,c,METAL(.55));K.box(F,s*hl-.05,s*hl+.05,-.33,.33,0,.035,c,METAL(.4));}
 for(const z of [.14,1.1])K.bar(F(-hl,0,z),F(hl,0,z),.012,c,METAL(.55));
 for(let k=1;k<9;k++){const u=-hl+2*hl*k/9;K.bar(F(u,0,.14),F(u,0,1.1),.006,c,METAL(.55));}
}
// A square box truss of four chords from p to q, zigzag braced on its faces.
function truss(K,p,q,w,col){
 const d=unit(sub(q,p)),e1=unit(Math.abs(d[2])>.95?cross([0,1,0],d):cross(d,[0,0,1])),e2=cross(d,e1),c=[[1,1],[1,-1],[-1,-1],[-1,1]].map(([a,b])=>add(scale(e1,a*w/2),scale(e2,b*w/2)));
 const L=Math.hypot(...sub(q,p)),n=Math.max(1,Math.round(L/w));
 for(const o of c)K.bar(add(p,o),add(q,o),.022,col,METAL(.6));
 for(let f=0;f<4;f++){const a=c[f],b=c[(f+1)%4];for(let k=0;k<n;k++){const P0=add(p,scale(d,L*k/n)),P1=add(p,scale(d,L*(k+1)/n));K.bar(add(P0,k%2?a:b),add(P1,k%2?b:a),.009,col,METAL(.6));}}
}
// The giant screen on its goal-post truss (facing +u) with the stage in front of it: speakers, the backdrop, lights.
function stageScreen(K,F,R){
 const tc=C.galv,Hs=4.1,Ws=9.2,Hh=5.18;
 K.box(F,-.4,-.06,-Ws/2-.12,Ws/2+.12,Hs-.12,Hs+Hh+.12,C.black,METAL(.2),{bottom:true});
 K.quad(F(-.05,-Ws/2,Hs),F(-.05,Ws/2,Hs),F(-.05,Ws/2,Hs+Hh),F(-.05,-Ws/2,Hs+Hh),[1,1,1],SCREEN,null,DIR(F,1,0));
 {const q=K.size-4;const uv=rect(REG.screen(0),2);for(let k=0;k<4;k++){K.t[(q+k)*2]=uv[k][0];K.t[(q+k)*2+1]=uv[k][1];}}
 for(const s of [-1,1]){const v=s*(Ws/2+.55);truss(K,F(-.23,v,.25),F(-.23,v,Hs+Hh+.6),.4,tc);K.box(F,-.9,.45,v-.65,v+.65,0,.25,lin(0x8d9093),METAL(.3));K.box(F,-1.6,-.65,v-.5,v+.5,0,1.0,lin(0xe8e8e2,.9),PLAIN);}
 truss(K,F(-.23,-Ws/2-.75,Hs+Hh+.6),F(-.23,Ws/2+.75,Hs+Hh+.6),.4,tc);
 for(const v of [-3,-1.8,-.6,.6,1.8,3]){const c=lin(pick(R,[0xff3b8a,0x3b7bff,0xffb02e,0xffffff]));K.box(F,-.05,.15,v-.1,v+.1,Hs+Hh+.2,Hs+Hh+.4,C.black,PLAIN,{bottom:true});K.box(F,.15,.17,v-.08,v+.08,Hs+Hh+.22,Hs+Hh+.38,c,GLOW(1));}
 // The stage: deck, skirt, steps, the backdrop with the event's name, the DJ's table, speaker stacks.
 K.box(F,0,4.6,-4.6,4.6,0,1.15,C.black,PLAIN);K.box(F,0,4.6,-4.6,4.6,1.15,1.2,lin(0x3a3a3a),PLAIN,{bottom:false});
 K.sign(F(4.605,0,.6),DIR(F,1,0),8,.9,REG.fascia(1));
 for(let k=0;k<4;k++)K.box(F,1+k*.0,2.6,4.6+k*.3,4.9+k*.3,0,1.15-k*.29,C.dark,PLAIN);
 K.box(F,.05,.2,-4,4,1.2,3.45,lin(0x111214),PLAIN);K.sign(F(.205,0,2.55),DIR(F,1,0),7.6,.95,REG.fascia(0));
 K.box(F,2.1,2.7,-.9,.9,1.2,2.15,C.black,PLAIN);K.sign(F(2.705,0,1.68),DIR(F,1,0),1.75,.3,REG.fascia(0));
 for(const s of [-1,1]){K.box(F,3.4,4.3,s*3.8-.42,s*3.8+.42,1.2,2.9,C.black,PLAIN);K.sign(F(4.305,s*3.8,2.05),DIR(F,1,0),.74,1.5,REG.vent,lin(0x3a3a3a));}
}
// A trailer with a lifted LED screen (the smaller telão), facing +u.
function screenTrailer(K,F,R){
 K.box(F,-1.1,1.1,-2.5,2.5,.55,1.4,lin(0xf4f4f0,.9),METAL(.15),{bottom:true});for(const v of [-1.4,1.4])for(const u of [-.4,.4])wheel(K,F,u,v*1.05>0?1.15:-1.15,.32,.2);
 for(const [u,v] of [[-1,-2.6],[-1,2.6],[1,-2.6],[1,2.6]]){K.bar(F(u*.9,Math.sign(v)*2.4,.8),F(u,v,.1),.03,C.dark);K.box(F,u-.12,u+.12,v-.12,v+.12,0,.06,C.dark);}
 for(const v of [-.7,.7])K.box(F,-.18,0,v-.09,v+.09,1.4,3.3,C.galv,METAL(.5));
 K.box(F,-.3,-.05,-2.42,2.42,3.0,5.82,C.black,METAL(.2),{bottom:true});
 K.quad(F(-.04,-2.3,3.1),F(-.04,2.3,3.1),F(-.04,2.3,5.7),F(-.04,-2.3,5.7),[1,1,1],SCREEN,null,DIR(F,1,0));
 {const q=K.size-4;const uv=rect(REG.screen(0),2);for(let k=0;k<4;k++){K.t[(q+k)*2]=uv[k][0];K.t[(q+k)*2+1]=uv[k][1];}}
}
// A pop-up tent (L wide along v, D deep along u, its front +u): legs, a hipped roof with its underside, the valance with
// the name, a back wall and a table under it.
function tent(K,F,R,{L=3,D=3,H=2.15,col,name=null,back=true,table=true}){
 const du=D/2,hv=L/2,e=.06,peak=H+.5+.05*Math.max(L,D),rr=Math.max(0,hv-du),legs=lin(0xb8bcbf);
 for(const [u,v] of [[-du,-hv],[du,-hv],[du,hv],[-du,hv]])K.box(F,u-.025,u+.025,v-.025,v+.025,0,H,legs,METAL(.5));
 const c=[F(-du-e,-hv-e,H),F(du+e,-hv-e,H),F(du+e,hv+e,H),F(-du-e,hv+e,H)],a0=F(0,-rr,peak),a1=F(0,rr,peak),up=[0,0,1],under=scale(col,.62);
 const slopes=[[c[1],c[2],a1,a0,DIR(F,1,0)],[c[3],c[0],a0,a1,DIR(F,-1,0)]];
 for(const [p,q,r,s,o] of slopes){K.quad(p,q,r,s,col,PLAIN,null,add(o,up));K.quad(p,q,r,s,under,PLAIN,null,sub(scale(o,-1),up));}
 for(const [p,q,r,o] of [[c[0],c[1],a0,DIR(F,0,-1)],[c[2],c[3],a1,DIR(F,0,1)]]){K.tri(p,q,r,col,PLAIN,add(o,up));K.tri(p,q,r,under,PLAIN,sub(scale(o,-1),up));}
 K.box(F,-du-e,du+e,-hv-e,hv+e,H-.26,H,col,PLAIN,{top:false});
 if(name!=null)for(const s of [1,-1])K.sign(F(s*(du+e+.006),0,H-.13),DIR(F,s,0),Math.min(1.7,L*.62),.25,REG.name(name));
 if(back){K.box(F,-du-.01,-du+.02,-hv,hv,0,H-.26,scale(col,.92),PLAIN);}
 if(table){K.box(F,du-.95,du-.3,-Math.min(1,hv-.2),Math.min(1,hv-.2),0,.76,lin(0xf2f2ee),PLAIN);}
}
// A plastic bar table with its chairs (the boteco's, yellow, red or white): the chairs' seats for the people.
function barTable(K,F,R){
 const col=lin(pick(R,[0xf2c318,0xd62828,0xf4f4f0,0xf2c318]),.85+R()*.15),seats=[],n=2+Math.floor(R()*3);
 K.box(F,-.36,.36,-.36,.36,.7,.74,col,PLAIN,{bottom:true});for(const [u,v] of [[-.3,-.3],[.3,-.3],[.3,.3],[-.3,.3]])K.bar(F(u,v,0),F(u*.92,v*.92,.7),.018,col);
 for(let k=0;k<n;k++){const a=k/n*Math.PI*2+R()*.4,r=.78,Fc=frame(...F(Math.cos(a)*r,Math.sin(a)*r,0),a+Math.PI+(R()-.5)*.3+Math.atan2(DIR(F,1,0)[1],DIR(F,1,0)[0]));
  K.box(Fc,-.21,.21,-.21,.21,.42,.46,col,PLAIN,{bottom:true});K.box(Fc,-.25,-.21,-.21,.21,.46,.86,col,PLAIN);for(const [u,v] of [[-.18,-.18],[.18,-.18],[.18,.18],[-.18,.18]])K.bar(Fc(u,v,0),Fc(u*.9,v*.9,.42),.014,col);
  const p=Fc(0,0,0);seats.push({x:p[0],y:p[1],yaw:Math.atan2(F(0,0,0)[1]-p[1],F(0,0,0)[0]-p[0])});}
 return seats;
}
// A tubular grandstand block (scaffolding, plank decks and benches, rails, stairs at one end, the event's skirt).
// b: {x, y (front line's middle), tx, ty (along), rx, ry (away from the lap), len, rows, tread}; returns its rows of seats.
function grandstand(K,b,R,gz,base){
 const G=(a,l,z)=>[b.x+b.tx*a+b.rx*l,b.y+b.ty*a+b.ry*l,z],T=b.tread,rise=.42,h0=.75,n=b.rows,hl=b.len/2,depth=n*T,deck=r=>base+h0+r*rise,out=[];
 const tube=lin(0x9ba2a6,.85+R()*.2),plank=lin(pick(R,[0xa7aaa8,0x8f8a80,0xb4b0a6])),seat=lin(pick(R,[0x2a5aa8,0x1d6b3a,0xb0b4b6,0xc8161d]),.9+R()*.15);
 const frameAt=(a,l,z)=>G(a,l,z);const Fg=(a,l,z)=>frameAt(a,l,z);
 // Standards on the grid of rows and every 2 m along, down to the ground; ledgers and braces.
 const as=[];for(let a=-hl;a<=hl+.01;a+=b.len/Math.round(b.len/2))as.push(a);
 for(const a of as)for(let r=0;r<=n;r++){const l=Math.min(r,n)*T,top=deck(Math.min(r,n-1))+(r===n?rise:0),[x,y]=G(a,l,0),g=gz(x,y)??base;K.bar([x,y,g-.1],[x,y,top],.024,tube,METAL(.55));K.box(Fg,a-.08,a+.08,l-.08,l+.08,g-base-.02+base,g-base+.03+base,tube,METAL(.4));}
 for(let r=0;r<=n;r++){const l=r*T,top=deck(Math.min(r,n-1));K.bar(G(-hl,l,top-.12),G(hl,l,top-.12),.02,tube,METAL(.55));K.bar(G(-hl,l,base+.35),G(hl,l,base+.35),.02,tube,METAL(.55));}
 for(const a of [-hl,hl])for(let r=0;r<n;r++)K.bar(G(a,r*T,deck(r)-.12),G(a,(r+1)*T,base+.35),.016,tube,METAL(.55));
 for(let k=0;k<as.length-1;k+=2)K.bar(G(as[k],depth,base+.35),G(as[k+1],depth,deck(n-1)-.12),.016,tube,METAL(.55));
 // Decks, risers, benches (each row's fans sit on its bench).
 for(let r=0;r<n;r++){const z=deck(r),l0=r*T;
  K.box(Fg,-hl,hl,l0,l0+T,z-.05,z,plank,METAL(.3),{bottom:true});
  if(r<n-1)K.box(Fg,-hl,hl,l0+T-.02,l0+T,z,z+rise-.05,scale(plank,.8),METAL(.3));
  K.box(Fg,-hl+.15,hl-.15,l0+T-.42,l0+T-.12,z+.38,z+.43,seat,PLAIN,{bottom:true});
  for(let a=-hl+.6;a<hl;a+=1.6)K.box(Fg,a-.03,a+.03,l0+T-.38,l0+T-.16,z,z+.38,tube,METAL(.5));
  const s0=G(-hl+.35,l0+T-.27,z+.43),s1=G(hl-.35,l0+T-.27,z+.43),w=[b.rx*.2,b.ry*.2,0];
  out.push({corners:[add(s0,w),add(s1,w),sub(s1,w),sub(s0,w)].map(p=>({x:p[0],y:p[2],z:-p[1]})),face:[-b.rx,b.ry]});
 }
 // Rails: the front (over the skirt), the back and the open ends.
 const rail=(p,q)=>{K.bar(p,q,.02,tube,METAL(.55));};
 const zf=deck(0);rail(G(-hl,-.05,zf+1),G(hl,-.05,zf+1));rail(G(-hl,-.05,zf+.5),G(hl,-.05,zf+.5));
 const zb=deck(n-1);rail(G(-hl,depth,zb+1.1),G(hl,depth,zb+1.1));rail(G(-hl,depth,zb+.55),G(hl,depth,zb+.55));
 for(const a of [-hl,hl]){rail(G(a,0,zf+1),G(a,depth,zb+1.1));for(let r=0;r<n;r+=2)K.bar(G(a,r*T,deck(r)),G(a,r*T,deck(r)+1),.018,tube,METAL(.55));}
 // The skirt with the event's banner, and the one along the back rail.
 const [fx,fy]=G(0,-.06,0),gf=gz(fx,fy)??base,nf=[-b.rx,-b.ry,0],nb=[b.rx,b.ry,0];
 K.quad(G(-hl,-.07,gf-.1),G(hl,-.07,gf-.1),G(hl,-.07,zf-.05),G(-hl,-.07,zf-.05),lin(0x1b1d22),PLAIN,null,nf);
 for(const s of [-1,1])K.sign(G(s*hl/2,-.08,(gf+zf)/2),nf,hl-.2,Math.min(1.05,zf-gf-.1),REG.fascia(s>0?0:1));
 for(const s of [-1,1])K.sign(G(s*hl/2,depth+.06,zb+.82),nb,hl-.2,.55,REG.fascia(s>0?1:0));
 // Stairs up the end at +a.
 for(let k=0;k<Math.round((zb-base)/.2);k++){const z=base+(k+1)*.2,l=depth-(k+1)*.26;if(l<-.2)break;K.box(Fg,hl+.05,hl+1.25,l-.26,l,z-.05,z,plank,METAL(.3),{bottom:true});}
 rail(G(hl+1.25,-.2,base+1),G(hl+1.25,depth,zb+1.1));
 return out;
}
// The outside-broadcast truck: cab, the long box with the channel's livery, roof units and a small dish, the side door
// and its steps.
function obTruck(K,F,R,livery){
 const W=1.25,body=livery?lin(0xf4f4f0):lin(0x10203a);
 for(const u of [3.9,-2.9,-4.25])for(const s of [-1,1])wheel(K,F,u,s*(W-.12),.5,.32);
 K.box(F,-5.6,3.15,-W,W,.95,4.0,body,METAL(.15),{bottom:true});
 K.prism(F,[[3.2,.7],[5.6,.7],[5.6,1.7],[5.35,2.95],[3.2,3.1]],-W+.03,W-.03,lin(0xf4f4f0),METAL(.15));
 K.quad(F(5.585,-W+.15,1.78),F(5.585,W-.15,1.78),F(5.36,W-.15,2.85),F(5.36,-W+.15,2.85),C.glass,METAL(.7),null,[1,0,.2]);
 for(const s of [1,-1]){K.sign(F(4.35,s*(W-.02),2.3),DIR(F,0,s),1.0,.75,REG.dark,[1,1,1],METAL(.7));K.sign(F(-1.25,s*(W+.006),2.75),DIR(F,0,s),7.6,.95,REG.livery(livery));}
 K.sign(F(.6,W+.008,1.9),DIR(F,0,1),.9,1.85,REG.dark);K.box(F,.15,1.05,W,W+.75,0,.3,C.galv,METAL(.5));K.box(F,.15,1.05,W+.25,W+.75,.3,.62,C.galv,METAL(.5));
 for(const u of [-4.6,-3.3,-2])K.box(F,u-.45,u+.45,-.55,.55,4,4.38,C.white,METAL(.2));
 K.tube(F(1.5,0,4),F(1.5,0,4.35),.08,.08,6,C.dark);const d=[.25,0,.97];K.tube(add(F(1.5,0,4.7),scale(d,-.15)),add(F(1.5,0,4.7),scale(d,.12)),.75,.06,12,C.white,METAL(.3),{bottom:true});
 K.tube(F(2.6,.6,4),F(2.6,.6,6.5),.03,.02,5,C.dark,METAL(.5));
 for(const [u,s] of [[-5.3,1],[-5.3,-1],[2.8,1],[2.8,-1]])K.box(F,u-.12,u+.12,s*(W-.25)-.12,s*(W-.25)+.12,0,.95,C.dark,METAL(.4));
}
// The satellite uplink truck: a smaller box truck with the big dish aimed at the northern sky.
function sngTruck(K,F,R){
 const W=1.2,body=lin(0xf4f4f0);
 for(const u of [2.6,-1.7])for(const s of [-1,1])wheel(K,F,u,s*(W-.1),.42,.26);
 K.box(F,-3.8,1.6,-W,W,.85,3.2,body,METAL(.15),{bottom:true});K.prism(F,[[1.65,.6],[3.8,.6],[3.8,1.5],[3.55,2.6],[1.65,2.75]],-W+.03,W-.03,lin(0xd62828),METAL(.15));
 K.quad(F(3.785,-W+.15,1.58),F(3.785,W-.15,1.58),F(3.56,W-.15,2.5),F(3.56,-W+.15,2.5),C.glass,METAL(.7),null,[1,0,.2]);
 for(const s of [1,-1])K.sign(F(-1.1,s*(W+.006),2.35),DIR(F,0,s),5,.62,REG.livery(1));
 const c=F(-1.6,0,4.35),north=[0,Math.cos(.87),Math.sin(.87)];K.box(F,-2.1,-1.1,-.4,.4,3.2,3.75,C.galv,METAL(.5));K.bar(F(-1.6,0,3.75),c,.08,C.galv,METAL(.5));
 K.tube(add(c,scale(north,-.25)),add(c,scale(north,.2)),1.3,.08,16,C.white,METAL(.25),{bottom:true});
 for(const a of [0,2.1,4.2]){const r=[Math.cos(a)*1.2,Math.sin(a)*1.2*north[2],-Math.sin(a)*1.2*north[1]];K.bar(add(c,r),add(c,scale(north,1.1)),.018,C.galv,METAL(.5));}
 K.box((u,v,w)=>add(add(c,scale(north,1.12)),[u,v,w]),-.12,.12,-.12,.12,-.12,.12,C.dark,PLAIN,{bottom:true});
}
// The ambulance on standby: a white van, RESGATE on its sides and mirrored on its nose, the light bar flashing.
function ambulance(K,F,R){
 const W=1.0,body=lin(0xf6f6f2);
 for(const u of [1.75,-1.6])for(const s of [-1,1])wheel(K,F,u,s*(W-.08),.36,.22);
 K.prism(F,[[-2.75,.45],[2.75,.45],[2.75,1.1],[2.2,1.35],[1.45,2.45],[1.2,2.6],[-2.75,2.6]],-W,W,body,METAL(.15));
 K.quad(F(2.18,-W+.12,1.4),F(2.18,W-.12,1.4),F(1.47,W-.12,2.38),F(1.47,-W+.12,2.38),C.glass,METAL(.7),null,[1,0,.8]);
 const red=lin(0xd21f26);
 for(const s of [1,-1]){const o=DIR(F,0,s);K.sign(F(1.25,s*(W+.005),1.85),o,.9,.62,REG.dark,[1,1,1],METAL(.7));K.quad(F(-2.74,s*(W+.006),.95),F(2.4,s*(W+.006),.95),F(2.4,s*(W+.006),1.15),F(-2.74,s*(W+.006),1.15),red,PLAIN,null,o);
  K.sign(F(-1.2,s*(W+.007),1.75),o,2.3,.58,REG.resgate);K.sign(F(.25,s*(W+.007),1.75),o,.5,.5,REG.star);}
 K.sign(F(2.756,0,.82),DIR(F,1,0),1.1,.28,REG.resgate,[1,1,1],PLAIN,true);K.sign(F(-2.756,0,1.75),DIR(F,-1,0),.6,.6,REG.star);
 K.box(F,.95,1.25,-.75,.75,2.6,2.68,C.dark);for(const s of [1,-1])K.box(F,.97,1.23,s*.12,s*.72,2.68,2.8,lin(s>0?0xff2020:0xff2020),BLINK(.9,s>0?0:.5));K.box(F,.97,1.23,-.11,.11,2.68,2.8,C.cool,BLINK(1.3,.25));
 for(const s of [1,-1])K.box(F,-2.74,-2.62,s*(W-.2)-.1,s*(W-.2)+.1,2.45,2.6,lin(0xff2020),BLINK(.8,s>0?.3:.8));
}
// The fire engine: red cab and body, roller shutters, the ladder on the roof, light bar, BOMBEIROS on its doors.
function fireEngine(K,F,R){
 const W=1.25,red=lin(0xb5121b);
 for(const u of [3.2,-2.5])for(const s of [-1,1])wheel(K,F,u,s*(W-.12),.5,.32);
 K.prism(F,[[2.35,.6],[4.35,.6],[4.35,1.6],[4.2,2.95],[2.35,3.0]],-W,W,red,METAL(.2));K.box(F,-4.3,2.3,-W,W,.9,2.95,red,METAL(.2),{bottom:true});
 K.quad(F(4.34,-W+.15,1.68),F(4.34,W-.15,1.68),F(4.21,W-.15,2.85),F(4.21,-W+.15,2.85),C.glass,METAL(.7),null,[1,0,.1]);
 for(const s of [1,-1]){const o=DIR(F,0,s);for(const u of [-3.25,-1.2,.85])K.sign(F(u,s*(W+.006),1.85),o,1.85,1.6,REG.shutter,[1,1,1],METAL(.4));
  K.quad(F(-4.29,s*(W+.007),.95),F(4.34,s*(W+.007),.95),F(4.34,s*(W+.007),1.05),F(-4.29,s*(W+.007),1.05),C.white,PLAIN,null,o);
  K.sign(F(3.3,s*(W+.007),1.3),o,1.7,.42,REG.bombeiros);K.sign(F(3.55,s*(W+.005),2.35),o,.8,.65,REG.dark,[1,1,1],METAL(.7));}
 for(const v of [-.38,.38])K.bar(F(-4.5,v,3.12),F(2.0,v,3.12),.03,C.galv,METAL(.6));for(let u=-4.3;u<2;u+=.35)K.bar(F(u,-.38,3.12),F(u,.38,3.12),.014,C.galv,METAL(.6));
 for(const u of [-3.6,1.4])K.box(F,u-.1,u+.1,-.45,.45,2.95,3.1,C.dark);
 K.box(F,3.0,3.3,-.8,.8,3.0,3.08,C.dark);for(const s of [1,-1])K.box(F,3.02,3.28,s*.1,s*.78,3.08,3.2,lin(0xff2020),BLINK(1.1,s>0?0:.5));
}
// The broadcast's camera crane: dolly, column, the long arm with its counterweights, the remote head at the tip (+u).
function crane(K,F,R,reach){
 K.box(F,-.9,.9,-.6,.6,.22,.42,C.dark,METAL(.4),{bottom:true});for(const [u,v] of [[-.75,-.5],[.75,-.5],[.75,.5],[-.75,.5]])K.tube(F(u,v-.05,.14),F(u,v+.05,.14),.14,.14,6,C.rubber,PLAIN,{bottom:true});
 K.tube(F(0,0,.42),F(0,0,1.85),.12,.1,8,C.dark,METAL(.4));K.box(F,-.25,.25,-.2,.2,1.85,2.1,C.dark,METAL(.4));
 const pitch=.32,dir=[Math.cos(pitch),0,Math.sin(pitch)],P=(t)=>F(dir[0]*t,0,2.05+dir[2]*t),len=Math.min(7.2,reach/Math.cos(pitch));
 truss(K,P(-2.4),P(len),.22,lin(0x2c2f33));K.box((u,v,w)=>add(P(-2.4),DIR(F,u,v).map((x,i)=>i===2?x+w:x)),-.35,.3,-.25,.25,-.55,.05,lin(0x9a9a92),METAL(.3),{bottom:true});
 const tip=P(len);K.bar(tip,add(tip,[0,0,-.45]),.03,C.dark);const Fc=frame(tip[0],tip[1],tip[2]-.6,Math.atan2(DIR(F,1,0)[1],DIR(F,1,0)[0]));
 K.box(Fc,-.2,.2,-.13,.13,-.15,.12,C.black,PLAIN,{bottom:true});K.tube(Fc(.2,0,-.02),Fc(.45,0,-.04),.07,.08,8,C.black,METAL(.3));K.box(Fc,-.08,.08,.13,.16,-.1,.06,lin(0xff2020),GLOW(.6));
}
// The marshals' table: a bucket of flags (yellow, blue, green, white, red, chequered) on it.
function marshalFlags(K,F,R){
 K.tube(F(.6,.4,.76),F(.6,.4,1.0),.13,.15,8,lin(0x2a5aa8));
 [[0xf2d21b],[0x1d5fb8],[0x2e9a4a],[0xf4f4f0],[0xd62828]].forEach(([c],k)=>{const a=k*1.25,p=F(.6+Math.cos(a)*.05,.4+Math.sin(a)*.05,1.0),q=add(p,[Math.cos(a)*.15,Math.sin(a)*.15,.75]);K.bar(p,q,.009,C.dark);
  K.quad(add(q,[0,0,-.02]),add(q,[Math.cos(a+1.4)*.55,Math.sin(a+1.4)*.55,-.02]),add(q,[Math.cos(a+1.4)*.55,Math.sin(a+1.4)*.55,-.42]),add(q,[0,0,-.42]),lin(c),PLAIN,null,[Math.cos(a+2.97),Math.sin(a+2.97),0]);});
}
// The TV helicopter (track axes: x forward, y left, z up, round its rotor mast), the rotor and the tail rotor apart.
function helicopterKits(){
 const body=new Kit(),rotor=new Kit(),tail=new Kit(),F=(u,v,w)=>[u,v,w],white=lin(0xf4f4f0),blue=lin(0x1d3a7a),dark=C.glass;
 // The cabin: an egg of rings, glass over its front and top.
 const rings=10,segs=12,base=body.size,cen=[.55,0,1.35],ra=2.15,rb=.92,rc=.95;
 for(let i=0;i<=rings;i++){const t=i/rings,a=-Math.PI/2+t*Math.PI,x=Math.sin(a)*ra,r=Math.cos(a);
  for(let j=0;j<=segs;j++){const b=j/segs*Math.PI*2,y=Math.cos(b)*rb*r,z=Math.sin(b)*rc*r,p=add(cen,[x,y,z*(z<0?.8:1)]),n=unit([x/ra/ra,y/rb/rb,z/rc/rc]),glass=x>.2&&z>-.25*rc&&!(z>.55&&x<1.0);body.v(p,n,glass?dark:(z<-.3?blue:white),WHITE,glass?METAL(.8):METAL(.2));}}
 for(let i=0;i<rings;i++)for(let j=0;j<segs;j++){const a=base+i*(segs+1)+j;body.i.push(a,a+1,a+segs+2,a,a+segs+2,a+segs+1);}
 body.tube(F(-1.2,0,1.55),F(-6.3,0,1.85),.38,.12,8,white,METAL(.2));body.box(F,-1.4,.6,-.5,.5,2.0,2.45,white,METAL(.2));
 body.quad(F(-6.0,0,1.8),F(-6.5,0,1.85),F(-6.8,0,3.0),F(-6.35,0,2.95),blue,PLAIN,null,[0,1,0]);body.quad(F(-6.0,0,1.8),F(-6.5,0,1.85),F(-6.8,0,3.0),F(-6.35,0,2.95),blue,PLAIN,null,[0,-1,0]);
 body.box(F,-5.2,-4.85,-.9,.9,1.75,1.8,blue,PLAIN,{bottom:true});
 for(const s of [-1,1]){body.bar(F(-1.0,s*.95,.05),F(1.8,s*.95,.05),.035,C.dark);body.bar(F(1.8,s*.95,.05),F(2.1,s*.95,.3),.035,C.dark);for(const u of [-.6,1.1])body.bar(F(u,s*.95,.05),F(u,s*.5,.6),.03,C.dark);}
 body.tube(F(-.3,0,2.45),F(-.3,0,2.85),.08,.08,6,C.dark);
 body.box(F,-1.2,-1.05,-.06,.06,2.45,2.56,lin(0xff2020),BLINK(.55,0));body.box(F,-6.85,-6.7,-.05,.05,2.95,3.05,lin(0xffffff),BLINK(.9,.4));
 body.box(F,.6,.7,.88,.95,1.95,2.02,lin(0x30ff60),GLOW(1));body.box(F,.6,.7,-.95,-.88,1.95,2.02,lin(0xff3030),GLOW(1));
 for(let k=0;k<3;k++){const a=k*Math.PI*2/3,c=Math.cos(a),s=Math.sin(a);rotor.quad([c*.2-s*.15,s*.2+c*.15,0],[c*5.3-s*.13,s*5.3+c*.13,-.06],[c*5.3+s*.13,s*5.3-c*.13,-.06],[c*.2+s*.15,s*.2-c*.15,0],C.dark,PLAIN,null,[0,0,1]);
  rotor.quad([c*.2-s*.15,s*.2+c*.15,-.03],[c*5.3-s*.13,s*5.3+c*.13,-.09],[c*5.3+s*.13,s*5.3-c*.13,-.09],[c*.2+s*.15,s*.2-c*.15,-.03],C.dark,PLAIN,null,[0,0,-1]);}
 rotor.box(F,-.22,.22,-.22,.22,-.08,.08,C.dark,PLAIN,{bottom:true});
 for(const a of [0,Math.PI]){const c=Math.cos(a),s=Math.sin(a);tail.quad([c*.05,0,s*.05-.05],[c*.8,0,s*.8-.06],[c*.8,0,s*.8+.06],[c*.05,0,s*.05+.05],C.dark,PLAIN,null,[0,1,0]);tail.quad([c*.05,0,s*.05-.05],[c*.8,0,s*.8-.06],[c*.8,0,s*.8+.06],[c*.05,0,s*.05+.05],C.dark,PLAIN,null,[0,-1,0]);}
 return {body,rotor,tail};
}

// People of the event (pit-crew.js outfits): vendors, the seated, security, medics, firemen, marshals, the TV crew.
const SKIN=[0x8d5a3b,0xc68e6a,0xe0b08c,0x6b4430,0xd9a07a,0xa86f4c,0x5a3a28],HAIR=[0x16120f,0x2b1f17,0x3b2a1a,0x5a3a22,0x8a6a3a,0xbab4ab];
const SHIRTS=[0xc8161d,0xf2c318,0x1d4f9c,0xf4f4f0,0x2e9a4a,0x111214,0xe8691a,0x6a2c91,0x0a9396,0xf28a1e];
function outfit(R,kind){
 const base={skin:pick(R,SKIN),hair:pick(R,HAIR),hairStyle:R()<.3?'long':R()<.12?'curly':'short',sleeves:R()<.75?'short':'long',belly:R()<.3?R()*.6:0,glasses:R()<.15};
 if(kind==='vendor')return {...base,top:pick(R,SHIRTS),apron:0xf4f1e8,hat:R()<.5?'cap':null,hatColor:pick(R,SHIRTS)};
 if(kind==='medic')return {...base,top:0xf4f4f0,trim:0xd21f26,bottom:0x23293a,sleeves:'short'};
 if(kind==='fire')return {...base,top:0x8a6a3e,trim:0xf2d21b,bottom:0x8a6a3e,hat:'cap',hatColor:0xb5121b};
 if(kind==='marshal')return {...base,top:0xf06a1a,trim:0xdfe3e0,bottom:0x23293a,hat:'cap',hatColor:0x1c2a46};
 if(kind==='security')return {...base,top:0x111214,bottom:0x111214,sleeves:'short'};
 if(kind==='tv')return {...base,top:0x1d1f22,bottom:0x2d3a4a,hat:'headset'};
 return {...base,top:pick(R,SHIRTS),bottom:pick(R,[0x2a3346,0x41618f,0x23293a,0x5a4a3a,0xd8d0c0]),hat:R()<.25?'cap':null,hatColor:pick(R,SHIRTS)};
}

// A failure here never takes the circuit down with it: the city simply has no race weekend.
export async function createCityRace(data,options={}){
 try{return buildCityRace(data,options);}
 catch(e){console.error('Corrida na cidade:',e);const root=new THREE.Group();root.name='Corrida_na_cidade';return {root,stats:{error:String(e?.message??e)}};}
}
function buildCityRace(data,{mobile=false,lean=false,ground=null,map=null}={}){
 const root=new THREE.Group();root.name='Corrida_na_cidade';root.userData.noReflection=true;
 const plan=planRace(data,map);if(!plan)return {root,stats:{}};
 const started=performance.now(),light=mobile||lean;
 // Where the city may be roamed (meta.roam, physics.js RoamWorld) the event's big things are solid: the screens, trucks,
 // tents, toilets, light towers and poles, the stands (their rows' depth back from the front) and the crowd fences.
 if(data.meta.roam){const SOLID=/^(screen|generator|truck|tent|ambulance|ob|sng|fire|trailer|screenTrailer|crane|tower|lpole)$/,solids=[];
  for(const i of plan.items)if(i.foot&&SOLID.test(i.kind))solids.push({x:i.foot[0],y:i.foot[1],h:i.h,hu:i.foot[2],hv:i.foot[3]});else if(i.kind==='toilet')solids.push({x:i.x,y:i.y,h:i.h,hu:.7,hv:.7});
  for(const b of plan.stands){const d=b.rows*b.tread+.9;solids.push({x:b.x+b.rx*d/2,y:b.y+b.ry*d/2,h:Math.atan2(b.ty,b.tx),hu:b.len/2+.4,hv:d/2});}
  for(const f of plan.fences)for(const [x,y,h,l] of f.panels)solids.push({x,y,h,hu:l/2,hv:.3});
  addRoamSolids(data,solids);}
 const gz=(x,y)=>{const z=ground?.(x,y);return Number.isFinite(z)?z:null;};
 const stats={poleBanners:0,banners:0,streetBanners:0,screens:0,trucks:0,tents:0,toilets:0,tables:0,generators:0,towers:0,flags:0,fencePanels:0,stringBulbs:0,stands:0,standRows:0,
  obTrucks:0,uplinks:0,ambulances:0,fireEngines:0,cranes:0,cables:0,crowdRows:0,people:0,helicopter:0,meshes:0,triangles:0,shown:0,trafficBlocks:plan.trafficBlocks.length,helicopterAt:[0,0,0],
  skipped:plan.skipped,where:{},mobile,lean};
 const note=(kind,x,y,extra=[])=>{if(!stats.where[kind])stats.where[kind]=[+x.toFixed(2),+y.toFixed(2),...extra.map(v=>+(+v).toFixed(3))];};
 // Chunks: 300 m tiles in three layers (the big things seen from afar, the zones' small things, the lamp-post banners).
 const chunks=new Map(),kit=(layer,x,y)=>{const key=`${layer}:${Math.floor(x/TILE)}:${Math.floor(y/TILE)}`;let c=chunks.get(key);if(!c){c={layer,kit:new Kit()};chunks.set(key,c);}return c.kit;};
 const at=(x,y,h)=>frame(x,y,gz(x,y)??0,h);

 // --- The lamp-post banners and the banners across the streets.
 const poleFrame=P=>{const z=gz(P.x,P.y);return z===null?null:frame(P.x,P.y,z,P.h,P.lean[0],P.lean[1]);};
 plan.poleBanners.forEach((b,k)=>{if(light&&(k%(lean?3:2)))return;const F=poleFrame(b.pole);if(!F)return;
  poleBanners(kit('small',b.pole.x,b.pole.y),F,b.pole,random(9001+b.pole.k*17),b.design,b.room,b.phase,b.along);stats.poleBanners++;stats.banners+=b.room.filter(Boolean).length;note(b.pole.lap?'lapBanner':'banner',b.pole.x,b.pole.y,[b.pole.h]);});
 plan.streetBanners.forEach((s,k)=>{if(lean&&k>=4)return;const FA=poleFrame(s.a),FB=poleFrame(s.b);if(!FA||!FB)return;
  streetBanner(kit('big',s.mx,s.my),s.a,s.b,FA,FB,gz(s.a.x,s.a.y),gz(s.b.x,s.b.y),random(4111+k*97),s.design,(k*.37)%1);stats.streetBanners++;note('streetBanner',s.mx,s.my,[s.b.x-s.a.x,s.b.y-s.a.y]);});

 // --- The zones' things, the stands, the TV compound and the services.
 const people=[],rowsOut=[],pools=[],TOILET=[0x1d4f9c,0x1d4f9c,0x2e8a4a,0x1d4f9c,0x7a8086,0xd2691e,0x1d4f9c];
 for(const it of plan.items){
  const R=random(Math.floor(it.x*131+it.y*977)>>>0),F=at(it.x,it.y,it.h),z=gz(it.x,it.y)??0,small=['toilet','table','flag','lpole'].includes(it.kind),K=kit(small?'mid':'big',it.x,it.y);
  const pt=(u,v)=>F(u,v,0).slice(0,2);
  switch(it.kind){
   case 'screen':stageScreen(K,F,R);stats.screens++;note('screen',it.x,it.y,[it.h]);pools.push([...pt(7,0),11,[1,.35,.75]],[...pt(3,-6),7,[.4,.55,1]]);
    if(!light)people.push({o:outfit(R,'fan'),x:pt(2.9,1.2),z:z+1.2,yaw:it.h,pose:'stand',idle:'podium'});break;
   case 'screenTrailer':screenTrailer(K,F,R);stats.screens++;note('screenTrailer',it.x,it.y,[it.h]);break;
   case 'truck':case 'trailer':{const tr=it.kind==='trailer';foodTruck(K,F,R,it.name,tr);stats.trucks++;note('truck',it.x,it.y,[it.h]);pools.push([...pt(0,3),5,[1,.82,.55]]);
    if(!lean)people.push({o:outfit(R,'vendor'),x:pt(-.4+(tr?.5:0),.55),z:z+.6,yaw:it.h+Math.PI/2,pose:'serve',idle:'counter'});break;}
   case 'tent':{const col=it.marshals?lin(0xf28a1e):it.name===8?lin(0xf4f4f0):it.name>=10?lin(TENTS[it.name-6][1]):lin(pick(R,[0xf4f4f0,0xb3161d,0x1d4f9c,0xf2c318,0x2e9a4a]),.9+R()*.1);
    tent(K,F,R,{L:it.L,D:it.D,col,name:it.name});stats.tents++;note(it.marshals?'marshalTent':'tent',it.x,it.y,[it.h]);
    if(it.marshals){marshalFlags(K,F,R);if(!lean)for(let k=0;k<2;k++)people.push({o:outfit(R,'marshal'),x:pt(.4+k*.6,-1.2+k*1.1),z,yaw:it.h+(R()-.5)*1.5,pose:k?'stand':'folded',idle:'marshal'});}
    else if(!lean)people.push({o:outfit(R,it.name===8?'medic':'vendor'),x:pt(-.6,0),z,yaw:it.h,pose:'stand',idle:'counter'});break;}
   case 'toilet':toilet(K,F,R,lin(TOILET[(it.tone??0)%TOILET.length],.85+R()*.2));stats.toilets++;note('toilet',it.x,it.y,[it.h]);break;
   case 'generator':generator(K,F,R);stats.generators++;note('generator',it.x,it.y);break;
   case 'tower':lightTower(K,F,R);stats.towers++;note('tower',it.x,it.y,[it.h]);pools.push([...pt(13,0),15,[1,.97,.9]]);break;
   case 'table':{const seats=barTable(K,F,R);stats.tables++;note('table',it.x,it.y);if(!light)seats.slice(0,stats.tables%3?2:0).forEach(s=>people.push({o:outfit(R,'fan'),x:[s.x,s.y],z:gz(s.x,s.y)??z,yaw:s.yaw,pose:'sit',idle:'seated'}));break;}
   case 'flag':{const [a,b]=pick(R,[[0xb3161d,0xf6f1e4],[0xf2c318,0x111214],[0x12351f,0xf0c419],[0x1d4f9c,0xf4f4f0]]);featherFlag(K,frame(it.x,it.y,z,R()*6.28),R,lin(a),lin(b),R());stats.flags++;break;}
   case 'lpole':break;
   case 'ob':obTruck(K,F,R,it.livery);stats.obTrucks++;note('ob',it.x,it.y,[it.h]);if(!light&&it.livery===0)people.push({o:outfit(R,'tv'),x:pt(.6,2.4),z,yaw:it.h+Math.PI/2+.4,pose:'stand',idle:'camera'});break;
   case 'sng':sngTruck(K,F,R);stats.uplinks++;note('sng',it.x,it.y,[it.h]);break;
   case 'ambulance':ambulance(K,F,R);stats.ambulances++;note('ambulance',it.x,it.y,[it.h]);if(!lean)for(let k=0;k<2;k++)people.push({o:outfit(R,'medic'),x:pt(-1+k*1.1,1.9+k*.4),z,yaw:it.h-Math.PI/2+(R()-.5),pose:k?'folded':'stand',idle:'marshal'});break;
   case 'fire':fireEngine(K,F,R);stats.fireEngines++;note('fire',it.x,it.y,[it.h]);if(!lean)for(let k=0;k<2;k++)people.push({o:outfit(R,'fire'),x:pt(2.8+k*.9,2.3),z,yaw:it.h+Math.PI/2+(R()-.5),pose:k?'stand':'folded',idle:'marshal'});break;
   case 'crane':crane(K,F,R,it.reach);stats.cranes++;note('crane',it.x,it.y,[it.h]);if(!lean)people.push({o:outfit(R,'tv'),x:pt(-1.3,.9),z,yaw:it.h,pose:'stand',idle:'camera'});break;
  }
 }
 // Security at the fan zone's gate.
 const gateZone=plan.zones.nautico;if(gateZone&&!lean){const R=random(55);for(const [x,y,yaw] of [[323,-9,-1.2],[325.5,-10.5,-1.9]])if(gz(x,y)!==null)people.push({o:outfit(R,'security'),x:[x,y],z:gz(x,y),yaw,pose:'folded',idle:'marshal'});}
 // String lights over the tables.
 for(const s of plan.strings){const pts=s.poles.map(p=>[p.x,p.y,gz(p.x,p.y)??0]);if(lean)continue;const K=kit('mid',pts[0][0],pts[0][1]);stringLights(K,pts,random(pts.length*71+Math.floor(pts[0][0])),s.cross);stats.stringBulbs+=Math.round(pts.length*12);
  for(const p of pts.slice(0,-1))pools.push([p[0],p[1],6,[1,.78,.45]]);}
 // Crowd fences.
 for(const f of plan.fences){if(lean)continue;const R=random(f.panels.length*13+3);for(const [x,y,h,len] of f.panels){fencePanel(kit('mid',x,y),frame(x,y,gz(x,y)??0,h+(R()-.5)*.06),R,Math.min(2.1,len));stats.fencePanels++;}}
 // Cables on the ground, from the generators to the screen, the trucks and the lap; yellow ramps where they cross a path.
 for(const c of plan.cables){const K=kit('mid',c[0][0],c[0][1]),R=random(Math.floor(c[0][0]*7+c[0][1]*3)>>>0);
  for(let i=0;i+1<c.length;i++){const [ax,ay]=c[i],[bx,by]=c[i+1],n=Math.max(2,Math.round(Math.hypot(bx-ax,by-ay)/1.5));let prev=null;
   for(let k=0;k<=n;k++){const t=k/n,x=ax+(bx-ax)*t+(R()-.5)*.25,y=ay+(by-ay)*t+(R()-.5)*.25,p=[x,y,(gz(x,y)??0)+.03];if(prev)for(const o of [0,.07])K.bar(add(prev,[0,o,0]),add(p,[0,o,0]),.022,C.black);prev=p;}}
  stats.cables++;}
 // The stands, their seats for the fans.
 for(const b of plan.stands){
  let base=-Infinity;const depth=b.rows*b.tread;for(let a=-b.len/2;a<=b.len/2+.01;a+=2)for(let l=0;l<=depth+.01;l+=1.5){const g=gz(b.x+b.tx*a+b.rx*l,b.y+b.ty*a+b.ry*l);if(g!==null)base=Math.max(base,g);}
  if(!Number.isFinite(base))continue;const rows=grandstand(kit('big',b.x,b.y),b,random(3301+b.k*7+Math.floor(b.s)),gz,base+.05);rowsOut.push(...rows);stats.stands++;stats.standRows+=rows.length;note(b.zone+'Stand',b.x,b.y,[b.rx,b.ry,b.tx,b.ty]);
 }
 // The fans standing in the zones (before the screen, at the trucks).
 for(const r of plan.rows){const g0=gz(r.x0,r.y0),g1=gz(r.x1,r.y1);if(g0===null||g1===null)continue;const nx=r.fx*.3,ny=r.fy*.3;
  rowsOut.push({corners:[[r.x0,r.y0,g0],[r.x1,r.y1,g1],[r.x1-nx,r.y1-ny,g1],[r.x0-nx,r.y0-ny,g0]].map(([x,y,z])=>({x,y:z,z:-y})),face:[r.fx,-r.fy],stand:r.stand,ground:(x,y)=>gz(x,y)});stats.crowdRows++;}

 // --- The meshes.
 const atlas=canvasTexture((ctx,w,h)=>paintAtlas(ctx,w,h,data),ATLAS,ATLAS),uniforms={uTime:{value:0},uNight:{value:0},uWind:{value:.16},uSlide:{value:0}},material=raceMaterial(atlas,uniforms),meshes=[];
 const reach=light?REACH_LIGHT:REACH;
 for(const [key,{layer,kit:K}] of chunks){
  if(!K.size)continue;const mesh=new THREE.Mesh(K.geometry(),material);mesh.name=`Corrida_${key}`;
  mesh.castShadow=layer==='big'&&!mobile;mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;mesh.updateMatrix();
  const far=reach[layer];mesh.userData.box=mesh.geometry.boundingBox;mesh.userData.reach2=far*far;root.add(mesh);meshes.push(mesh);stats.meshes++;stats.triangles+=K.i.length/3;
 }
 // After dark the zones' ground lies in pools of their lights (one additive draw, faded into the fog).
 let poolMesh=null;
 if(pools.length){
  const pp=[],pc=[],pt=[],pi=[];
  for(const [x,y,r,col] of pools){const n=4,base=pp.length/3;for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){const px=x+(i/n*2-1)*r,py=y+(j/n*2-1)*r;pp.push(px,(gz(px,py)??0)+.08,-py);pc.push(...col);pt.push(i/n,j/n);}
   for(let j=0;j<n;j++)for(let i=0;i<n;i++){const a=base+j*(n+1)+i;pi.push(a,a+1,a+n+2,a,a+n+2,a+n+1);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pp,3));g.setAttribute('color',new THREE.Float32BufferAttribute(pc,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(pt,2));g.setIndex(pi);g.computeBoundingSphere();
  const glow=canvasTexture((ctx,w,h)=>{const gr=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.3,'rgba(255,255,255,.5)');gr.addColorStop(.7,'rgba(255,255,255,.1)');gr.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);ctx.fillStyle=gr;ctx.fillRect(0,0,w,h);},64,64);
  const pm=new THREE.MeshBasicMaterial({name:'Corrida_luz_no_chao',map:glow,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  pm.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',`#ifdef USE_FOG
#ifdef FOG_EXP2
 gl_FragColor.rgb*=exp(-fogDensity*fogDensity*vFogDepth*vFogDepth);
#else
 gl_FragColor.rgb*=1.-smoothstep(fogNear,fogFar,vFogDepth);
#endif
#endif`);};
  pm.customProgramCacheKey=()=>'city-race-pools-v1';
  poolMesh=new THREE.Mesh(g,pm);poolMesh.name='Corrida_luz_no_chao';poolMesh.visible=false;poolMesh.renderOrder=1;poolMesh.matrixAutoUpdate=false;poolMesh.updateMatrix();root.add(poolMesh);stats.pools=pools.length;
 }
 // The TV helicopter over the bay: a slow loop between the two bridges and over both shores, banking into it.
 const heli=new THREE.Group();heli.name='Corrida_helicoptero';
 {const {body,rotor,tail}=helicopterKits(),mk=(K,name)=>{const m=new THREE.Mesh(K.geometry(),material);m.name=name;m.castShadow=false;m.receiveShadow=false;return m;};
  const b=mk(body,'Helicoptero_corpo'),r=mk(rotor,'Helicoptero_rotor'),t=mk(tail,'Helicoptero_rotor_cauda');r.position.set(-.3,2.92,0);t.position.set(-6.55,2.25,-.32);heli.add(b,r,t);heli.userData={rotor:r,tail:t};
  heli.rotation.order='YZX';root.add(heli);stats.helicopter=1;stats.triangles+=(body.i.length+rotor.i.length+tail.i.length)/3;}
 const HC=[-40,30],HA=640,HB=330,HZ=150,HW=.045;
 const heliAt=(t,out)=>{const a=t*HW;out[0]=HC[0]+HA*Math.cos(a)+60*Math.sin(a*2.3);out[1]=HC[1]+HB*Math.sin(a)+40*Math.cos(a*1.7);out[2]=HZ+18*Math.sin(a*1.3);return out;};
 const hp=[0,0,0],hq=[0,0,0];let heliT=137;
 // People (pit-crew.js), idling: one crowd for each zone.
 // The lighter builds keep the people at work only (vendors, the tents' staff): each one is a few thousand triangles.
 if(light)people.splice(0,people.length,...people.filter(p=>p.idle==='counter'));
 if(people.length){const P=createPeople(),entries=people.map((p,k)=>({outfit:p.o,pose:p.pose,x:p.x[0],y:p.z,z:-p.x[1],yaw:p.yaw,idle:p.idle,name:'Pessoa_corrida'}));
  const g=P.crowd(entries,{name:'Pessoas_corrida',cell:300,seed:.41});if(g){root.add(g);stats.people=entries.length;stats.crowds=g.children.length;}}
 stats.furniturePoles=plan.poles.length;stats.furnitureLapPoles=plan.poles.filter(p=>p.lap).length;{const f=plan.poles.find(p=>p.lap);if(f)stats.where.firstLapPole=[+f.x.toFixed(2),+f.y.toFixed(2)];}
 stats.crowdFans=rowsOut.length;stats.clearings=plan.clearings.length;stats.buildMs=Math.round(performance.now()-started);
 const frustum=new THREE.Frustum(),view=new THREE.Matrix4();let slide=0,slideT=0;
 return {root,stats,standTops:rowsOut,clearings:plan.clearings,obstacles:[],trafficBlocks:plan.trafficBlocks,
  update(dt,camera){
   uniforms.uTime.value+=dt;
   // The screens change slide every 8 s: the broadcast twice as long as the map and the ad.
   slideT+=dt;const hold=slide===0?14:7;if(slideT>hold){slideT=0;slide=(slide+1)%3;uniforms.uSlide.value=slide*SCREEN_SHIFT;}
   heliT+=dt;heliAt(heliT,hp);heliAt(heliT+.5,hq);const dx=hq[0]-hp[0],dy=hq[1]-hp[1],h=Math.atan2(dy,dx);heliAt(heliT-.5,hq);const h0=Math.atan2(hp[1]-hq[1],hp[0]-hq[0]);let turn=h-h0;turn=Math.atan2(Math.sin(turn),Math.cos(turn));
   const v=Math.hypot(dx,dy)*2;heli.position.set(hp[0],hp[2],-hp[1]);stats.helicopterAt[0]=Math.round(hp[0]);stats.helicopterAt[1]=Math.round(hp[1]);stats.helicopterAt[2]=Math.round(hp[2]);heli.rotation.set(-Math.atan(v*turn/9.8),h,-.07);
   heli.userData.rotor.rotation.y+=dt*24;heli.userData.tail.rotation.z+=dt*60;
   const c=camera.position;let shown=0,tri=0;view.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(view);
   for(const m of meshes){const b=m.userData.box,ex=Math.max(b.min.x-c.x,0,c.x-b.max.x),ey=Math.max(b.min.y-c.y,0,c.y-b.max.y),ez=Math.max(b.min.z-c.z,0,c.z-b.max.z),on=ex*ex+ey*ey+ez*ez<m.userData.reach2;m.visible=on;
    if(on&&frustum.intersectsSphere(m.geometry.boundingSphere)){shown++;tri+=m.geometry.index.count/3;}}
   stats.shown=shown;stats.shownTriangles=tri;
  },
  setNight(level){uniforms.uNight.value=level;stats.night=level;if(poolMesh){poolMesh.material.opacity=level*.3;poolMesh.visible=level>.02;}}};
}
