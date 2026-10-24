import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {canvasTexture,css} from './pit-textures.js';
import {Kit,Parts,paint,floorMaterial,grainMap} from './car-garage.js';
import {helmetSurface,HELMET_RINGS} from './driver-helmet.js';
import {setPose,POSES} from './pit-crew.js';
import {SUIT_COLORS,GLOVE_COLORS,HELMET_COLORS,VISORS,suitTrim} from './pilot-look.js';

// The Visual screen's store (look-select.js LookStudio; user, 2026-10-24: "um cenário pra escolha da roupa ... em uma loja
// virtual de moda automotiva, em uma qualidade visual igual à da garagem"): the team's racewear shop round the fitting
// podium the pilot stands on, built once like the car screen's garage (car-garage.js: boxes, tubes and canvas paint, the
// fixed parts merged by finish into a handful of draw calls, the same kinds of material so its shader programs are the
// garage's, built already). Frame: the pilot turns at the origin and the camera looks from +x (look-select.js), so the
// store is laid out for that view: the back wall at x=SHOP.back with the lit helmet cabinet, its middle (right behind the
// pilot, whatever his turn) a fitting alcove with a calm curtain so the suit stands out, the shop's sign beside the title
// over it, race suits face-out on its left and boots and gloves on its right; on the floor two mannequins in suits and
// helmets, a round rack of suits and a tall fitting mirror beside the podium that shows the pilot's back. The rest (the
// side walls with their rails, the shop window, the ceiling's lights) shows in the mirror and the polished floor, which
// reflect the store for real (draw: the mirror on every level, the floor on computers' Alto and Ultra).
export const SHOP=Object.freeze({back:-4.6,front:8.5,left:5,right:-7,height:3.8,base:.035,deck:.07,top:.74,podium:1.08});
const SMALL=typeof matchMedia==='function'&&(matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0);
// Where things stand: z across the view (+z on the screen's left), x towards the camera; the floor paint follows them.
const L={
 cabinet:{z0:-2.45,z1:2.45,cols:7,rows:3,y0:.6,row:.5,depth:.42,alcove:[2,4]},
 logo:{z:-1.05,y:2.62,w:1.36,h:.68},neon:{z:2.62,y:2.66,w:1.18,h:.31},
 arms:[{z:2.95,seed:31},{z:3.8,seed:47}],
 shelves:{z0:-2.7,z1:-4.2,levels:[.34,.78,1.22,1.66,2.1]},
 pegs:{z0:-4.45,z1:-5.85,rows:[1.0,1.42,1.84,2.26]},omp:{z:-6.4,y:2.02,w:.98,h:.45},
 mirror:{x:-1.72,z:-1.0,turn:-.34,w:.84,h:1.96,y:.06},
 mannequins:[{x:-1.55,z:2.0,turn:-.5,seed:5,figure:'m'},{x:-2.35,z:-3.1,turn:.55,seed:11,figure:'f'}],
 round:{x:-3.35,z:-4.45,r:.42,seed:23},table:{x:-3.1,z:4.1},bench:{x:1.6,z:2.6},
 // Ceiling spots and their pools on the floor (x, z, radius, strength).
 pools:[[0,0,1.7,.3],[-3.9,-1.6,1.1,.14],[-3.9,1.6,1.1,.14],[-1.55,2.0,.9,.16],[-2.35,-3.1,.9,.16],[-1.72,-1.0,.8,.08],[-3.35,-4.45,1,.1],[-3.8,-3.5,1,.12],[-3.8,3.4,1.1,.12]]
};
const LACQUER=0x101213,GREEN=0x183229,WALNUT=0x5b3b25,BRASS=0xb48a4c,CHROME=0xc7ccd0,YELLOW=0xf4ce39,WARM=0xffe2b8,COOL=0xeef3ff,RUBBER=0x121314,CREAM=0xf2efe7;
const rng=seed=>()=>(seed=seed*16807%2147483647)/2147483647;
const box=(w,h,d)=>new THREE.BoxGeometry(w,h,d),cyl=(r,h,s=16,top=r,open=false)=>new THREE.CylinderGeometry(top,r,h,s,1,open);
const along=g=>g.rotateZ(Math.PI/2),across=g=>g.rotateX(Math.PI/2);
const tone=(hex,k)=>new THREE.Color(hex).multiplyScalar(k);
const pause=()=>new Promise(done=>setTimeout(done,0));
// The garage's finishes and three of the store's own (same programs: only their numbers differ).
class ShopKit extends Kit{
 constructor(){super();Object.assign(this.parts,{gloss:[],visor:[],wood:[]});}
 w(g,c,pos){return this.add('wood',g,c,pos);}
 s(g,c,pos){return this.add('gloss',g,c,pos);}
}
// A kit placed by a whole matrix (a mannequin's head, a glove lying on a table).
function placeMatrix(parts,kit,matrix){for(const [kind,list] of Object.entries(kit.parts))if(list.length)parts.add(parts.M[kind],mergeGeometries(list,false).applyMatrix4(matrix));}
// Vertex colours from c0 at the bottom to c1 at the top (lit niche backs: brighter under their light).
function ramp(geometry,c0,c1){
 const g=geometry.index?geometry.toNonIndexed():geometry;if(g.attributes.uv)g.deleteAttribute('uv');g.computeBoundingBox();
 const p=g.attributes.position,a=new Float32Array(p.count*3),lo=g.boundingBox.min.y,span=Math.max(1e-4,g.boundingBox.max.y-lo),c=new THREE.Color();
 for(let i=0;i<p.count;i++){c.copy(c0).lerp(c1,Math.pow((p.getY(i)-lo)/span,1.6));c.toArray(a,i*3);}
 g.setAttribute('color',new THREE.BufferAttribute(a,3));return g;
}
// Shuffled picks from a list, none twice running (neighbours never alike).
function picker(list,seed){const r=rng(seed);let bag=[],last=null;return ()=>{if(!bag.length){bag=[...list].sort(()=>r()-.5);if(bag[0]===last&&bag.length>1)bag.push(bag.shift());}return last=bag.shift();};}

// ---- Things ----
// A display helmet in driver-helmet.js's shell (its frame: +x the face, the head's middle at 0): the paint by design (the
// game's three and a two-tone), the visor shut in its tint; on a small stand unless worn (a mannequin's).
const SEG=SMALL?22:30;
function helmetKit({paint:base,detail,visor,design},stand=true){
 const k=new ShopKit(),R=HELMET_RINGS,n=SEG,p=[],ix=[];
 for(const y of R)for(let j=0;j<=n;j++)p.push(...helmetSurface(y,Math.PI+j/n*Math.PI*2).toArray());
 for(let i=0;i<R.length-1;i++)for(let j=0;j<n;j++){const a=i*(n+1)+j,b=a+n+1;ix.push(a,b,a+1,a+1,b,b+1);}
 let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();g=g.toNonIndexed();
 const pos=g.attributes.position,col=new Float32Array(pos.count*3),B=new THREE.Color(base),D=new THREE.Color(detail),rim=new THREE.Color(0x141516);
 for(let t=0;t<pos.count;t+=3){const y=(pos.getY(t)+pos.getY(t+1)+pos.getY(t+2))/3,c=y<-.118?rim:design==='topo'&&y>.1||design==='metade'&&y<-.04?D:B;for(let v=0;v<3;v++)c.toArray(col,(t+v)*3);}
 g.setAttribute('color',new THREE.BufferAttribute(col,3));k.parts.gloss.push(g);
 // The visor shut over the eye opening.
 const vp=[],vi=[],cols=12,rows=3;for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++)vp.push(...helmetSurface(-.021+i/rows*.117,-1.04+j/cols*2.08,.004).toArray());
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=i*(cols+1)+j,b=a+cols+1;vi.push(a,b,a+1,a+1,b,b+1);}
 const vg=new THREE.BufferGeometry();vg.setAttribute('position',new THREE.Float32BufferAttribute(vp,3));vg.setIndex(vi);vg.computeVertexNormals();k.parts.visor.push(paint(vg,visor));
 // A stripe over the top, or the 99's three strokes on each cheek, in the detail colour.
 if(design==='listra')k.parts.gloss.push(paint(ribbon([...[.03,.06,.09,.12,.145,.158].map(y=>helmetSurface(y,0)),helmetSurface(.161,0),...[.158,.145,.12,.09,.05,.0,-.05,-.09].map(y=>helmetSurface(y,Math.PI))],()=>new THREE.Vector3(0,0,1),.02),detail));
 if(design==='faixas')for(const side of [-1,1])for(let s=0;s<3;s++)k.parts.gloss.push(paint(ribbon(Array.from({length:9},(_,i)=>helmetSurface(-.05-s*.012+i/8*.03,side*(.43+i/8*.94))),()=>new THREE.Vector3(0,1,0),.0042),detail));
 if(stand)k.r(cyl(.05,.012,18),LACQUER,[0,-.214,0]).m(cyl(.016,.07,10),CHROME,[0,-.175,0]).r(cyl(.06,.008,18),RUBBER,[0,-.136,0]);
 return k;
}
// A band of paint lifted off the shell through the points of line, w to each side.
function ribbon(line,side,w,lift=.003){
 const p=[],ix=[],O=new THREE.Vector3(0,-.01,0);
 line.forEach((q,i)=>{const nrm=q.clone().sub(O).normalize(),s=side(i);for(const e of [-1,1])p.push(...q.clone().addScaledVector(nrm,lift).addScaledVector(s,e*w).toArray());if(i<line.length-1){const a=i*2;ix.push(a,a+2,a+1,a+1,a+2,a+3);}});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
 // Facing out whichever way the line runs.
 const v=i=>new THREE.Vector3().fromArray(p,i*3),n=v(2).sub(v(0)).cross(v(1).sub(v(0)));if(n.dot(line[0].clone().sub(O))<0)for(let i=0;i<ix.length;i+=3)[ix[i+1],ix[i+2]]=[ix[i+2],ix[i+1]];
 g.setIndex(ix);g.computeVertexNormals();return g;
}
// The store's helmets: the game's colours, designs and visors, dealt so that no two neighbours match.
function helmetDeck(seed){
 const paints=picker(HELMET_COLORS.map(c=>c[1]),seed),details=picker(HELMET_COLORS.map(c=>c[1]),seed+7),designs=picker(['faixas','topo','listra','metade','faixas','listra'],seed+3),visors=picker(VISORS.map(v=>v[1]),seed+5);
 return ()=>{const paint=paints();let detail=details();if(detail===paint)detail=details();return {paint,detail,design:designs(),visor:visors()};};
}
// A race suit on its hanger, the hook at the origin, the front towards +x, the shoulders along z: knit collar, cuffs and
// ankles, the belt, and a pattern of its own (a chest band, side stripes, shoulders or legs in a second colour), the shop's
// tag on a sleeve.
function suitKit({color,second,trim,pattern,hanger}){
 const k=new ShopKit(),C=color,DARK=0x1a1b1d,lean=.05;
 k.m(cyl(.004,.07,6),CHROME,[0,-.035,0]);for(const e of [-1,1])k.r(box(.02,.022,.235).rotateX(e*.34),hanger,[0,-.11,e*.11]);
 k.r(box(.1,.055,.15),DARK,[0,-.105,0]);for(const e of [-1,1])k.r(box(.1,.07,.2).rotateX(e*.3),pattern==='ombros'?second:C,[0,-.155,e*.12]);
 k.r(box(.1,.6,.42),C,[0,-.46,0]).r(box(.104,.05,.424),pattern==='bicolor'?second:DARK,[0,-.73,0]);
 for(const e of [-1,1]){
  k.r(box(.074,.58,.1).rotateX(e*lean),pattern==='ombros'?second:C,[0,-.46,e*.262]).r(box(.076,.06,.098).rotateX(e*lean),DARK,[0,-.77,e*.276]);
  k.r(box(.092,.78,.19),pattern==='bicolor'?second:C,[0,-1.15,e*.1]).r(box(.094,.05,.192),DARK,[0,-1.55,e*.1]);
  if(pattern==='lateral')k.r(box(.094,.76,.014),trim,[0,-1.15,e*.19]).r(box(.076,.54,.012).rotateX(e*lean),trim,[0,-.46,e*.31]).r(box(.102,.56,.012),trim,[0,-.46,e*.205]);
 }
 if(pattern==='peito')k.r(box(.104,.075,.426),trim,[0,-.32,0]).r(box(.104,.03,.426),second,[0,-.37,0]);
 if(pattern==='ombros')k.r(box(.104,.04,.426),trim,[0,-.26,0]);
 if(pattern==='bicolor')k.r(box(.104,.045,.426),trim,[0,-.55,0]);
 k.r(box(.104,.06,.085),CREAM,[0,-.27,-.11]).r(box(.104,.035,.06),YELLOW,[0,-.3,.12]).r(box(.004,.055,.034),CREAM,[.04,-.74,.31]);
 return k;
}
// The suits' looks: the game's suit colours with trims, second colours and patterns dealt like the helmets.
function suitDeck(seed){
 const colors=picker(SUIT_COLORS.map(c=>c[1]),seed),seconds=picker([0x1b1d20,0xeceae4,0xf2c418,0x1f4fae,0xd82125,0x7a8087],seed+1),patterns=picker(['peito','lateral','ombros','bicolor','peito','lateral'],seed+2),hangers=picker([0x1a1b1d,0x6b4a2e,0x1a1b1d,0xd8d4cb],seed+4);
 return ()=>{const color=colors();let second=seconds();if(second===color)second=seconds();return {color,second,trim:suitTrim(color),pattern:patterns(),hanger:hangers()};};
}
// A racing boot, the toe towards +x: sole, foot, toe cap and the ankle shaft, a band round its top and a side stripe.
function bootKit(color,trim,k=new ShopKit(),z=0,turn=0){
 const t=new ShopKit();
 t.r(box(.27,.026,.094),0x1b1c1d,[0,.013,0]).r(box(.2,.072,.088),color,[-.005,.062,0]).r(new THREE.SphereGeometry(.046,12,8).scale(1.3,.85,1),color,[.1,.052,0]);
 t.r(box(.115,.16,.086),color,[-.075,.175,0]).r(box(.118,.026,.088),trim,[-.075,.24,0]).r(box(.15,.014,.09),trim,[-.02,.09,0]).r(box(.004,.12,.03),CREAM,[-.02,.14,.044]);
 for(const [kind,list] of Object.entries(t.parts))for(const g of list)k.parts[kind].push(g.rotateY(turn).translate(0,0,z));
 return k;
}
// A glove hung by its gauntlet, fingers down, the back of the hand towards +x: the flared cuff with its strap, the
// hand, four fingers a little apart (the middle ones longest) and the thumb out to one side.
function gloveKit(color,cuff,side=1){
 const k=new ShopKit();k.r(new THREE.CylinderGeometry(.06,.05,.085,4,1).rotateY(Math.PI/4).scale(.32,1,1),cuff,[0,.01,0]).r(box(.026,.016,.1),CREAM,[.003,-.02,0]);
 k.r(box(.022,.1,.094),color,[0,-.08,0]);
 [-.035,-.012,.012,.035].forEach((z,i)=>{const l=.085-Math.abs(i-1.5)*.012;k.r(box(.019,l,.018),color,[0,-.13-l/2,z*1.05]);});
 k.r(box(.02,.06,.022).rotateX(side*.7),color,[0,-.1,side*.064]);
 return k;
}

// ---- Fixtures ----
// The helmet cabinet against the back wall: black lacquer, a niche per helmet with its back lit warm from the light under
// the shelf above, a brass plate under each, the drawers of the plinth in walnut over a yellow light at the foot. Its
// middle (c.alcove: the columns right behind the pilot as the camera sees him) is the fitting alcove's curtain instead.
function cabinet(parts,deal){
 const c=L.cabinet,k=new ShopKit(),W=c.z1-c.z0,cw=W/c.cols,d=c.depth,top=c.y0+c.rows*c.row,r=rng(61),[a0,a1]=c.alcove,hole=i=>i>=a0&&i<=a1;
 k.p(box(d,c.y0-.06,W+.06),LACQUER,[d/2,(c.y0-.06)/2+.06,0]).r(box(d-.04,.06,W),0x070808,[d/2-.02,.03,0]).g(box(.006,.012,W-.04),YELLOW,[d-.035,.055,0],2.2);
 for(let i=0;i<4;i++)k.w(box(.012,c.y0-.18,W/4-.03),tone(WALNUT,.9+r()*.2),[d+.006,(c.y0+.06)/2+.03,c.z0+W/8+i*W/4]).m(box(.016,.012,.22),BRASS,[d+.016,c.y0-.13,c.z0+W/8+i*W/4]);
 k.p(box(.03,top-c.y0+.06,W+.06),LACQUER,[.015,(top+c.y0)/2,0]);
 for(let i=0;i<=c.cols;i++)if(!(i>a0&&i<=a1))k.p(box(d,top-c.y0,.03),LACQUER,[d/2,(top+c.y0)/2,c.z0+i*cw]);
 for(let j=0;j<=c.rows;j++)if(j===0||j===c.rows)k.p(box(d,.035,W+.03),LACQUER,[d/2,c.y0+j*c.row,0]);
  else for(const [z0,z1] of [[c.z0,c.z0+a0*cw],[c.z0+(a1+1)*cw,c.z1]])k.p(box(d,.035,z1-z0+.03),LACQUER,[d/2,c.y0+j*c.row,(z0+z1)/2]);
 k.p(box(d+.04,.1,W+.1),LACQUER,[d/2+.02,top+.05,0]).g(box(.006,.014,W),WARM,[d+.025,top+.012,0],2.4);
 {const z0=c.z0+a0*cw+.015,z1=c.z0+(a1+1)*cw-.015;k.parts.glow.push(curtain(z1-z0,top-c.y0-.035,c.y0+.0175).translate(0,0,(z0+z1)/2));k.m(across(cyl(.009,z1-z0,8)),BRASS,[.07,top-.05,(z0+z1)/2]);}
 for(let j=0;j<c.rows;j++)for(let i=0;i<c.cols;i++){if(hole(i))continue;
  const z=c.z0+(i+.5)*cw,y=c.y0+j*c.row,glow=.9+r()*.25;
  k.parts.glow.push(ramp(new THREE.PlaneGeometry(cw-.03,c.row-.035,1,4).rotateY(Math.PI/2).translate(.032,y+c.row/2,z),tone(0x1c150f,glow),tone(0xffd9a6,.3*glow)));
  k.g(box(.01,.008,cw-.07),WARM,[d-.05,y+c.row-.028,z],3.2).m(box(.004,.026,.13),BRASS,[d+.002,y+.002,z]);
  parts.place(helmetKit(deal()),SHOP.back+d*.52,z+(r()-.5)*.04,y+.0175+.22,(r()-.5)*.9);
 }
 parts.place(k,SHOP.back,0);
}
// The fitting alcove's curtain right behind the pilot (user, 2026-10-24: "alguma coisa que desse contraste pra destacar
// o personagem ... bem ali atrás dele especificamente"): a heavy dark drape in soft folds with a neutral pool of light at
// his chest's height going dark to the edges, so any suit stands out on it while the helmets glow either side. Unlit, its
// light painted into the vertex colours (the same however the pilot turns); w along z, h tall from y0, facing +x.
function curtain(w,h,y0){
 const g=new THREE.PlaneGeometry(w,h,90,12).rotateY(Math.PI/2).translate(0,y0+h/2,0),p=g.attributes.position,col=new Float32Array(p.count*3),base=new THREE.Color(0x857e75),c=new THREE.Color(),r=rng(67);
 const waves=[[.19,.014,r()*6],[.11,.006,r()*6],[.41,.01,r()*6]];
 for(let i=0;i<p.count;i++){
  const z=p.getZ(i),y=p.getY(i);let fold=0,slope=0;for(const [len,amp,ph] of waves){const a=z/len*Math.PI*2+ph+y*.4;fold+=amp*Math.sin(a);slope+=amp*Math.cos(a)*Math.PI*2/len;}
  p.setX(i,.045+fold);
  const dz=z/(w*.46),dy=(y-1.42)/(h*.62),pool=.13+.87*Math.exp(-(dz*dz+dy*dy)*1.35),shade=THREE.MathUtils.clamp(.84+slope*.9,.5,1.12);
  c.copy(base).multiplyScalar(pool*shade);c.toArray(col,i*3);
 }
 g.deleteAttribute('uv');g.setAttribute('color',new THREE.BufferAttribute(col,3));g.computeVertexNormals();return g.toNonIndexed();
}
// A face-out arm: a chrome tube out of the wall, three suits on it one behind the other facing the room.
function faceOut(parts,{z,seed},deal){
 const k=new ShopKit(),y=1.92,r=rng(seed);k.m(along(cyl(.014,.66,10)),CHROME,[.33,y,0]).m(box(.02,.1,.06),CHROME,[.01,y,0]).m(cyl(.022,.03,10),CHROME,[.66,y,0]);
 parts.place(k,SHOP.back,z);
 for(const x of [.2,.36,.52])parts.place(suitKit(deal()),SHOP.back+x+(r()-.5)*.03,z+(r()-.5)*.03,y,(r()-.5)*.12);
}
// Floating walnut shelves with a light under each and the boots on them, pairs a little apart and turned.
function bootShelves(parts){
 const s=L.shelves,len=s.z0-s.z1,r=rng(71),colors=picker([0x1a1b1d,0xeceae4,0xd82125,0x1f4fae,0x1b1d20,0xf2c418,0x7a8087,0x1d8a4a],73),trims=picker([0xeceae4,0x1a1b1d,0xf2c418,0xd82125],79);
 for(const y of s.levels){
  const k=new ShopKit();k.w(box(.34,.04,len),tone(WALNUT,.92+r()*.16),[.17,y,0]).g(box(.006,.008,len-.06),WARM,[.3,y-.024,0],2.6);parts.place(k,SHOP.back,(s.z0+s.z1)/2);
  for(let i=0,n=3;i<n;i++){const z=s.z0-(i+.5)*len/n+(r()-.5)*.08,color=colors(),b=new ShopKit();const trim=trims();bootKit(color,trim,b,-.065,(r()-.5)*.25);bootKit(color,trim,b,.065,(r()-.5)*.25);parts.place(b,SHOP.back+.17,z,y+.02,(r()-.5)*.5);}
 }
}
// Gloves on chrome pegs over a perforated panel (painted on the wall), pairs and singles in the game's glove colours.
function glovePegs(parts){
 const p=L.pegs,r=rng(83),colors=picker(GLOVE_COLORS.map(c=>c[1]),85),cuffs=picker([0x1b1d20,0xd82125,0x1f4fae,0xf2c418,0xeceae4],87);
 for(const y of p.rows)for(let i=0;i<4;i++){
  const z=p.z0-.17-i*(p.z0-p.z1-.34)/3+(r()-.5)*.05,k=new ShopKit();k.m(along(cyl(.005,.16,6)),CHROME,[.08,0,0]);
  const color=colors(),cuff=cuffs();for(const [dz,dx,side] of r()<.7?[[-.035,.06,-1],[.035,.1,1]]:[[0,.1,1]])for(const [kind,list] of Object.entries(gloveKit(color,cuff,side).parts))for(const g of list)k.parts[kind].push(g.rotateX((r()-.5)*.12).translate(dx,-.015,dz));
  parts.place(k,SHOP.back,z,y);
 }
}
// A round chrome rack of suits: the base, the pole, the ring; the suits face along the ring, shoulders out.
function roundRack(parts,deal){
 const {x,z,r:R,seed}=L.round,r=rng(seed),k=new ShopKit(),y=1.8;
 k.m(cyl(.26,.025,28),CHROME,[0,.0125,0]).m(cyl(.018,y,10),CHROME,[0,y/2,0]).m(new THREE.TorusGeometry(R,.012,6,40).rotateX(Math.PI/2),CHROME,[0,y,0]);
 for(let i=0;i<4;i++){const a=i*Math.PI/2+.4;k.m(along(cyl(.009,R,6)).rotateY(-a),CHROME,[Math.cos(a)*R/2,y,Math.sin(a)*R/2]);}
 parts.place(k,x,z);
 const n=11;for(let i=0;i<n;i++){const a=(i+r()*.4)/n*Math.PI*2;parts.place(suitKit(deal()),x+Math.cos(a)*R,z+Math.sin(a)*R,y,Math.PI/2-a+(r()-.5)*.1);}
}
// The rail along the left wall (seen in the mirror, behind the pilot's back): suits on it facing the shop window, a
// walnut shelf of boxes over it with a light under its edge.
function wallRail(parts,deal,{x0,x1,seed}){
 const r=rng(seed),k=new ShopKit(),y=1.86,len=x1-x0,z=SHOP.left-.34;k.m(along(cyl(.014,len,10)),CHROME,[0,y,0]).w(box(len,.04,.42),WALNUT,[0,2.45,.13]).g(box(len-.1,.008,.006),WARM,[0,2.425,-.075],2.4);
 for(const e of [-1,1])k.m(box(.03,.03,.34),CHROME,[e*(len/2-.05),y,.17]);
 for(let i=0;i<12;i++)k.r(box(.3+r()*.12,.12+r()*.1,.3),[0xd8d2c4,0x1a1b1d,0xf2c418,0xd82125,0x2b4f8a][i%5],[-len/2+.35+i*(len-.7)/11,2.53+r()*.02,.13]);
 parts.place(k,(x0+x1)/2,z);
 for(let u=x0+.25;u<x1-.2;u+=.2+r()*.12)parts.place(suitKit(deal()),u,z+(r()-.5)*.03,y,(r()-.5)*.1);
}
// A mannequin in a suit (pit-crew.js person, the head hidden under a helmet) on a lacquer plinth with a light round its foot.
function mannequin(parts,people,{x,z,turn,seed,figure},suit,glove,helmet){
 const k=new ShopKit(),h=.12;k.p(cyl(.38,h,40),LACQUER,[0,h/2,0]).m(cyl(.385,.01,40,.385,true),BRASS,[0,h-.005,0]).g(cyl(.392,.014,40,.392,true),WARM,[0,.02,0],2.2);parts.place(k,x,z);
 const person=people.person({top:suit.color,bottom:suit.color,trim:suit.trim,hands:glove,shoes:0x1b1d20,back:false,hat:null,skin:0xd9d5cd,hair:0xd9d5cd,hairStyle:'bald',figure},{shadows:false});
 person.name='Manequim_loja';person.userData.head.visible=false;person.position.set(x,h,z);person.rotation.y=turn;
 setPose(person,{...POSES.stand,arm:[.05+seed%2*.05,.08],elbow:[.16,.22+seed%3*.05],spread:[.16,.15],head:.04,turn:(seed%3-1)*.12});
 person.updateMatrixWorld(true);placeMatrix(parts,helmetKit(helmet,false),person.userData.rig.head.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(.004,.103,0)));
 return person;
}
// The tall fitting mirror by the podium: a walnut frame on two feet, the glass its own (look-select.js draws what it shows).
function mirrorFrame(){
 const m=L.mirror,k=new ShopKit(),f=.045,y=m.y;
 for(const e of [-1,1])k.w(box(.07,m.h+f*2,f),WALNUT,[0,y+m.h/2,e*(m.w/2+f/2)]).w(box(.46,.05,.07),WALNUT,[-.08,.025,e*(m.w/2+f/2)]).m(cyl(.012,.03,10).rotateX(Math.PI/2),BRASS,[0,y+m.h*.55,e*(m.w/2+f+.012)]);
 k.w(box(.07,f,m.w+f*2),WALNUT,[0,y+m.h+f/2,0]).w(box(.07,f,m.w+f*2),WALNUT,[0,y-f/2+.01,0]).r(box(.02,m.h,m.w),0x0b0c0d,[-.03,y+m.h/2,0]);
 k.m(box(.006,.006,m.w+.06),BRASS,[.018,y+m.h+f+.004,0]);
 return k;
}
// A low walnut table with folded balaclavas, a pair of gloves and the shop's boxes; a bench to try boots on.
function table(parts){
 const {x,z}=L.table,k=new ShopKit();k.w(box(.9,.05,1.5),WALNUT,[0,.72,0]);for(const [dx,dz] of [[-.38,-.68],[.38,-.68],[-.38,.68],[.38,.68]])k.r(box(.05,.7,.05),LACQUER,[dx,.35,dz]);
 [[0,-.4,CREAM],[0,-.15,0x1a1b1d],[.05,.25,CREAM],[-.2,.5,YELLOW]].forEach(([dx,dz,c],i)=>k.r(box(.26,.05+i%2*.03,.22),c,[dx,.77+i%2*.015,dz]));
 parts.place(k,x,z,0,.08);
 const b=L.bench,s=new ShopKit();s.r(box(.5,.12,1.2),0x2a1d16,[0,.44,0]).m(box(.46,.02,1.16),BRASS,[0,.375,0]);for(const dz of [-.5,.5])s.r(box(.4,.38,.05),LACQUER,[0,.19,dz]);parts.place(s,b.x,b.z,0,.2);
}
// Ceiling: dark panels, long warm light slots and a ring light over the podium (seen in the mirror and the floor).
function ceiling(){
 const k=new ShopKit(),y=SHOP.height-.02;
 for(const x of [-3.7,-2.1,1.7,3.6,5.6])k.g(box(.07,.02,9.6),WARM,[x,y,-1],3);
 k.g(new THREE.TorusGeometry(.95,.03,8,64).rotateX(Math.PI/2),WARM,[0,y-.25,0],3.5).r(new THREE.TorusGeometry(.95,.05,8,64).rotateX(Math.PI/2),LACQUER,[0,y-.2,0]);
 for(const e of [-1,1])k.m(cyl(.006,.23,6),CHROME,[0,y-.12,e*.95]);
 // Track spots aimed at the walls.
 for(const [x,z] of [[-3.3,-3.6],[-3.3,-1.2],[-3.3,1.2],[-3.3,3.4],[-1.6,2.1],[-2.35,-3.1],[-3.35,-4.45],[2.5,4.3],[4.5,4.3]]){k.r(cyl(.05,.16,12).rotateZ(-.5),0x1a1b1d,[x+.05,y-.14,z]).g(cyl(.036,.005,12).rotateZ(-.5),WARM,[x-.02,y-.21,z],4);}
 return k;
}

// ---- Paint ----
// Polished stone tiles over the whole floor (canvas top = the right wall, left = the back wall): each tile its own shade of
// warm graphite, pale veins running on across the joints, the joints; warm pools under the spots and soft contact shade
// under all that stands.
function floorMap(){
 const W=SHOP.front-SHOP.back,D=SHOP.left-SHOP.right,m=2048/W;
 return canvasTexture((ctx,w,h)=>{
  const X=x=>(x-SHOP.back)*m,Y=z=>(z-SHOP.right)*m,r=rng(19),k=ctx.getTransform().a,T=1.2;
  for(let i=0;i*T<W;i++)for(let j=0;j*T<D;j++){const g=ctx.createLinearGradient(i*T*m,j*T*m,(i+1)*T*m,(j+1)*T*m),v=.84+r()*.26;g.addColorStop(0,css(0x34302c,v));g.addColorStop(1,css(0x2e2b28,v*(.94+r()*.1)));ctx.fillStyle=g;ctx.fillRect(i*T*m,j*T*m,T*m+1,T*m+1);}
  for(let i=0;i<80;i++){const x=r()*w,y=r()*h,rad=(.8+r()*2.6)*m,g=ctx.createRadialGradient(x,y,0,x,y,rad),dark=r()<.5;g.addColorStop(0,dark?'rgba(12,11,10,.16)':'rgba(150,142,132,.07)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(x-rad,y-rad,2*rad,2*rad);}
  ctx.lineCap='round';
  for(let i=0;i<120;i++){const x=r()*w,y=r()*h,a=r()*6.28,l=(.8+r()*3.4)*m,bend=()=>(r()-.5)*l*.5;ctx.strokeStyle=`rgba(${200+r()*30|0},${194+r()*30|0},${186+r()*24|0},${.035+r()*.08})`;ctx.lineWidth=(.4+r()*1.8);
   ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+Math.cos(a)*l*.33+bend(),y+Math.sin(a)*l*.33+bend(),x+Math.cos(a)*l*.66+bend(),y+Math.sin(a)*l*.66+bend(),x+Math.cos(a)*l,y+Math.sin(a)*l);ctx.stroke();}
  for(let i=0;i<(SMALL?5000:14000);i++){ctx.globalAlpha=.1+r()*.25;ctx.fillStyle=r()<.5?'#1c1a18':'#6d675f';const s=.6+r()*1.2;ctx.fillRect(r()*w,r()*h,s,s);}ctx.globalAlpha=1;
  ctx.fillStyle='rgba(8,8,8,.6)';for(let i=0;i*T<=W;i++)ctx.fillRect(i*T*m-1,0,2,h);for(let j=0;j*T<=D;j++)ctx.fillRect(0,j*T*m-1,w,2);
  ctx.globalCompositeOperation='lighter';
  for(const [x,z,rad,a] of L.pools){const g=ctx.createRadialGradient(X(x),Y(z),0,X(x),Y(z),rad*m);g.addColorStop(0,`rgba(255,226,186,${a})`);g.addColorStop(.6,`rgba(255,226,186,${a*.35})`);g.addColorStop(1,'rgba(255,226,186,0)');ctx.fillStyle=g;ctx.fillRect(X(x)-rad*m,Y(z)-rad*m,2*rad*m,2*rad*m);}
  ctx.globalCompositeOperation='source-over';
  const wallShade=(x0,y0,x1,y1)=>{const g=ctx.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,'rgba(0,0,0,.5)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(Math.min(x0,x1),Math.min(y0,y1),Math.abs(x1-x0)||w,Math.abs(y1-y0)||h);};
  wallShade(0,0,.7*m,0);wallShade(0,0,0,.7*m);wallShade(0,h,0,h-.7*m);
  const shade=(x0,z0,x1,z1,blur=.2,alpha=.6)=>{ctx.save();ctx.shadowColor=`rgba(0,0,0,${alpha})`;ctx.shadowBlur=blur*m*k;ctx.shadowOffsetX=w*4*k;ctx.fillStyle='#000';ctx.fillRect(X(x0)-w*4,Y(z0),(x1-x0)*m,(z1-z0)*m);ctx.restore();};
  // The same, turned (local x0..x1 by z0..z1 round x, z, turned as Parts.place turns).
  const blob=(x,z,turn,x0,x1,z0,z1,blur,alpha)=>{ctx.save();ctx.shadowColor=`rgba(0,0,0,${alpha})`;ctx.shadowBlur=blur*m*k;ctx.shadowOffsetX=w*4*k;ctx.setTransform(k,0,0,k,-w*4*k,0);ctx.translate(X(x),Y(z));ctx.rotate(-turn);ctx.fillStyle='#000';ctx.fillRect(x0*m,z0*m,(x1-x0)*m,(z1-z0)*m);ctx.restore();};
  const disc=(x,z,rad,blur=.15,alpha=.65)=>{ctx.save();ctx.shadowColor=`rgba(0,0,0,${alpha})`;ctx.shadowBlur=blur*m*k;ctx.shadowOffsetX=w*4*k;ctx.fillStyle='#000';ctx.beginPath();ctx.arc(X(x)-w*4,Y(z),rad*m,0,7);ctx.fill();ctx.restore();};
  const c=L.cabinet;shade(SHOP.back,c.z0,SHOP.back+c.depth+.02,c.z1,.25,.7);
  shade(SHOP.back,L.shelves.z1,SHOP.back+.2,L.shelves.z0,.25,.4);
  for(const a of L.arms)shade(SHOP.back+.1,a.z-.25,SHOP.back+.6,a.z+.25,.35,.35);
  for(const q of L.mannequins)disc(q.x,q.z,.36,.18,.7);
  disc(L.round.x,L.round.z,.5,.4,.35);disc(L.round.x,L.round.z,.24,.08,.6);
  {const q=L.mirror;for(const e of [-1,1])blob(q.x,q.z,q.turn,-.31,.15,e*(q.w/2+.02)-.04,e*(q.w/2+.02)+.04,.06,.65);blob(q.x,q.z,q.turn,-.2,.05,-q.w/2,q.w/2,.25,.35);}
  shade(L.table.x-.45,L.table.z-.75,L.table.x+.45,L.table.z+.75,.4,.45);shade(L.bench.x-.25,L.bench.z-.6,L.bench.x+.25,L.bench.z+.6,.25,.5);
  // The podium's dark ring on the floor.
  const pool=ctx.createRadialGradient(X(0),Y(0),SHOP.podium*m*.96,X(0),Y(0),(SHOP.podium+.55)*m);pool.addColorStop(0,'rgba(0,0,0,.6)');pool.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=pool;ctx.beginPath();ctx.arc(X(0),Y(0),(SHOP.podium+.55)*m,0,7);ctx.fill();
 },2048,Math.round(2048*D/W));
}
// A wall, metres along (canvas left = the start of along) by its height: racing green plaster, each stretch a shade
// apart, a darker band under the ceiling, the walnut baseboard; warm washes down from the spots (lights: metres along);
// then what the wall carries (extra).
function wallMap(length,lights,seed,extra=null){
 const m=SMALL?64:110,H=SHOP.height;
 return canvasTexture((ctx,w,h)=>{
  const Y=y=>h-y*m,r=rng(seed);
  ctx.fillStyle=css(GREEN,1);ctx.fillRect(0,0,w,h);
  for(let x=0;x<w;){const span=(1.4+r()*2.2)*m;ctx.fillStyle=css(GREEN,.86+r()*.22);ctx.fillRect(x,Y(3.45),span,(3.45-.14)*m);x+=span;}
  for(let i=0;i<200;i++){const x=r()*w,y=r()*h,rad=(.2+r()*.9)*m,g=ctx.createRadialGradient(x,y,0,x,y,rad);g.addColorStop(0,r()<.5?'rgba(0,0,0,.12)':'rgba(120,150,130,.05)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(x-rad,y-rad,2*rad,2*rad);}
  ctx.fillStyle='#0d1714';ctx.fillRect(0,0,w,(H-3.45)*m);ctx.fillStyle='#2a1c12';ctx.fillRect(0,Y(.14),w,.14*m);ctx.fillStyle='#b48a4c';ctx.fillRect(0,Y(.145),w,.012*m);
  ctx.globalCompositeOperation='lighter';
  for(const at of lights){ctx.save();ctx.translate(at*m,Y(3.45));ctx.scale(1,2.1);const g=ctx.createRadialGradient(0,0,0,0,0,1.5*m);g.addColorStop(0,'rgba(255,214,160,.3)');g.addColorStop(.45,'rgba(255,214,160,.1)');g.addColorStop(1,'rgba(255,214,160,0)');ctx.fillStyle=g;ctx.fillRect(-1.5*m,0,3*m,1.5*m);ctx.restore();}
  ctx.globalCompositeOperation='source-over';
  extra?.(ctx,m,Y,r);
 },Math.round(length*m),Math.round(H*m),false);
}
// Vertical walnut slats over a stretch of wall (from a to b metres along, up to top).
function slats(ctx,m,Y,r,a,b,top=3.3){ctx.fillStyle='#120c08';ctx.fillRect(a*m,Y(top),(b-a)*m,(top-.14)*m);for(let x=a+.02;x<b-.04;x+=.09){ctx.fillStyle=css(WALNUT,.7+r()*.45);ctx.fillRect(x*m,Y(top-.02),.065*m,(top-.18)*m);ctx.fillStyle='rgba(255,220,180,.06)';ctx.fillRect(x*m,Y(top-.02),.012*m,(top-.18)*m);}}
// The pegboard behind the gloves.
function pegboard(ctx,m,Y,a,b,y0,y1){ctx.fillStyle='#d9d3c6';ctx.fillRect(a*m,Y(y1),(b-a)*m,(y1-y0)*m);ctx.fillStyle='#2b2620';for(let x=a+.05;x<b-.02;x+=.05)for(let y=y0+.05;y<y1-.02;y+=.05){ctx.beginPath();ctx.arc(x*m,Y(y),.006*m,0,7);ctx.fill();}
 const g=ctx.createLinearGradient(0,Y(y1),0,Y(y0));g.addColorStop(0,'rgba(255,210,150,.18)');g.addColorStop(1,'rgba(0,0,0,.25)');ctx.fillStyle=g;ctx.fillRect(a*m,Y(y1),(b-a)*m,(y1-y0)*m);}
// The shop window's outside: the mall's bright corridor, shopfronts across it, people passing (blurred: out of focus).
function mallMap(){
 return canvasTexture((ctx,w,h)=>{
  const r=rng(97),g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#f4efe6');g.addColorStop(.55,'#e6ded2');g.addColorStop(.62,'#b9b1a6');g.addColorStop(1,'#d8d0c4');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  ctx.filter='blur(3px)';for(let i=0;i<7;i++){ctx.fillStyle=['#c9a46a','#9fb3c2','#d7c8b2','#b8c4a6'][i%4];ctx.fillRect(i*w/7+8,h*.2,w/7-16,h*.38);}
  for(let i=0;i<9;i++){const x=r()*w,s=.8+r()*.3;ctx.fillStyle=['#5a5048','#3e4652','#7a6050','#2e3238'][i%4];ctx.beginPath();ctx.ellipse(x,h*.6,10*s,26*s,0,0,7);ctx.fill();ctx.beginPath();ctx.arc(x,h*.6-34*s,8*s,0,7);ctx.fill();}
  ctx.filter='none';
 },512,256);
}
// The shop's neon over the cabinet's right.
function neonMap(text){
 return canvasTexture((ctx,w,h)=>{
  const k=ctx.getTransform().a;ctx.clearRect(0,0,w,h);ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`italic 900 ${h*.56}px "Arial Black","Arial Bold",Arial,sans-serif`;ctx.lineJoin='round';
  for(const [blur,alpha,lw] of [[h*.3,.55,h*.07],[h*.12,.9,h*.045]]){ctx.shadowColor='#ff3d7a';ctx.shadowBlur=blur*k;ctx.strokeStyle='#ff4f86';ctx.globalAlpha=alpha;ctx.lineWidth=lw;ctx.strokeText(text,w/2,h*.5,w*.92);}
  ctx.shadowBlur=0;ctx.globalAlpha=1;ctx.strokeStyle='#ffe6ee';ctx.lineWidth=h*.022;ctx.strokeText(text,w/2,h*.5,w*.92);
 },1024,256);
}
// The podium's top, turning with the pilot: dark brushed rings, the shop's name round the edge, a yellow line.
function deckMap(){
 return canvasTexture((ctx,w,h)=>{
  const c=w/2,r=rng(5);ctx.fillStyle='#1b1d1f';ctx.fillRect(0,0,w,h);
  for(let i=0;i<260;i++){const v=r()<.5?255:0;ctx.strokeStyle=`rgba(${v},${v},${v},${.02+r()*.05})`;ctx.lineWidth=1+r()*2.5;ctx.beginPath();ctx.arc(c,c,r()*c,0,7);ctx.stroke();}
  ctx.fillStyle='#0e0f10';ctx.beginPath();ctx.arc(c,c,.985*c,0,7);ctx.arc(c,c,.83*c,0,7,true);ctx.fill();ctx.strokeStyle='#f4ce39';ctx.lineWidth=5;ctx.beginPath();ctx.arc(c,c,.815*c,0,7);ctx.stroke();
  const text='AUTO-POBRE RACING  ✦  MODA DE PISTA  ✦  ',all=text+text;ctx.font='bold 40px Arial,sans-serif';ctx.fillStyle='#c9c4b8';ctx.textAlign='center';ctx.textBaseline='middle';
  [...all].forEach((ch,i)=>{ctx.save();ctx.translate(c,c);ctx.rotate(i/all.length*Math.PI*2);ctx.fillText(ch,0,-.91*c);ctx.restore();});
 },1024,1024);
}
function haloMap(color){return canvasTexture((ctx,w,h)=>{const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,`rgba(${color},.5)`);g.addColorStop(.45,`rgba(${color},.16)`);g.addColorStop(1,`rgba(${color},0)`);ctx.fillStyle=g;ctx.fillRect(0,0,w,h);},256,256);}

// ---- The mirrors ----
// The fitting mirror and the floor show the store drawn again through them (draw): the whole world reflected in their
// plane, drawn first on the screen (the floor's under it, the mirror's only in its rectangle and cut at its glass by an
// oblique near plane, so what stands behind the glass stays out), then the store over it, the floor letting part of it
// through and the glass keeping it (drawn first, depth only). Drawn on the screen with the screen's own programs, as the
// garage's floor is (car-garage.js floorMaterial): a picture of its own would build every program once more.
const FLIP_Y=new THREE.Matrix4().makeScale(1,-1,1),IDENTITY=new THREE.Matrix4(),clearColor=new THREE.Color(),clipPlane=new THREE.Plane(),clip=new THREE.Vector4(),q=new THREE.Vector4();
function obliqueNear(camera,normal,point){
 clipPlane.setFromNormalAndCoplanarPoint(normal.clone().negate(),point).applyMatrix4(camera.matrixWorldInverse);
 clip.set(clipPlane.normal.x,clipPlane.normal.y,clipPlane.normal.z,clipPlane.constant);const e=camera.projectionMatrix.elements;
 q.set((Math.sign(clip.x)+e[8])/e[0],(Math.sign(clip.y)+e[9])/e[5],-1,(1+e[10])/e[14]);clip.multiplyScalar(2/clip.dot(q));
 e[2]=clip.x;e[6]=clip.y;e[10]=clip.z+1;e[14]=clip.w;camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

// The store: root (into the studio's world, with its lights), deck (the podium's top: into what turns), ring (the light
// round the podium, in the suit's colour: accent), draw(renderer, scene, world, camera, mirrors), bake(renderer) for the
// environment map, info(). people: the studio's pit-crew.js people (the mannequins share the pilot's cloth). Made a step
// at a time (the page answers between the big canvases).
export async function createShop({people}){
 const started=performance.now(),root=new THREE.Group();root.name='Loja_visual';
 const M={
  paint:new THREE.MeshStandardMaterial({name:'loja_laca',vertexColors:true,roughness:.3,metalness:.12}),
  metal:new THREE.MeshStandardMaterial({name:'loja_metal',vertexColors:true,roughness:.2,metalness:.92}),
  matte:new THREE.MeshStandardMaterial({name:'loja_tecido',vertexColors:true,roughness:.82}),
  wood:new THREE.MeshStandardMaterial({name:'loja_madeira',vertexColors:true,roughness:.48,metalness:.04}),
  gloss:new THREE.MeshStandardMaterial({name:'loja_verniz',vertexColors:true,roughness:.14,metalness:.1}),
  visor:new THREE.MeshStandardMaterial({name:'loja_viseira',vertexColors:true,roughness:.06,metalness:.7}),
  glow:new THREE.MeshBasicMaterial({name:'loja_luzes',vertexColors:true})
 };
 const parts=new Parts(M),W=SHOP.front-SHOP.back,D=SHOP.left-SHOP.right,H=SHOP.height,cx=(SHOP.back+SHOP.front)/2,cz=(SHOP.left+SHOP.right)/2;
 const plane=(material,w,h,pos,turn,name)=>{const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h).rotateY(turn),material);mesh.position.set(...pos);if(name)mesh.name=name;root.add(mesh);return mesh;};
 // Floor and walls (each wall's canvas from its left as seen from inside the store).
 const floor=floorMaterial(floorMap(),grainMap()),floorMesh=new THREE.Mesh(new THREE.PlaneGeometry(W,D).rotateX(-Math.PI/2),floor.material);
 floorMesh.position.set(cx,0,cz);floorMesh.name='Loja_piso';root.add(floorMesh);await pause();
 const wall=(map,name)=>new THREE.MeshStandardMaterial({name,map,roughness:.78,metalness:0});
 const back=wallMap(D,[.9,2.6,4.1,6.0,7.9,9.4,11.2],7,(ctx,m,Y,r)=>{
  slats(ctx,m,Y,r,SHOP.left-L.arms[1].z-.55,SHOP.left-L.arms[0].z+.5);
  pegboard(ctx,m,Y,SHOP.left-L.pegs.z0+.02,SHOP.left-L.pegs.z1-.02,L.pegs.rows[0]-.35,L.pegs.rows.at(-1)+.12);
 });
 plane(wall(back,'Loja_parede_fundo'),D,H,[SHOP.back,H/2,cz],Math.PI/2);await pause();
 const side=wallMap(W,[1.5,3.5,5.5,7.5,9.5,11.5],9,(ctx,m,Y,r)=>slats(ctx,m,Y,r,1.6,9.6,3.1));
 plane(wall(side,'Loja_parede_esquerda'),W,H,[cx,H/2,SHOP.left],Math.PI);
 plane(wall(wallMap(W,[2,5,8,11],13),'Loja_parede_direita'),W,H,[cx,H/2,SHOP.right],0);
 plane(wall(wallMap(D,[1.5,4,8,10.5],17,(ctx,m,Y)=>{ctx.fillStyle='#0b100e';ctx.fillRect(5.4*m,Y(3.05),6.3*m,3*m);}),'Loja_parede_vitrine'),D,H,[SHOP.front,H/2,cz],-Math.PI/2);
 await pause();
 parts.add(M.matte,paint(new THREE.PlaneGeometry(W,D).rotateX(Math.PI/2).translate(cx,H,cz),0x111413));
 // The shop window and its door (the mall outside), mullions in black.
 const mall=new THREE.MeshBasicMaterial({name:'Loja_vitrine',map:mallMap(),color:new THREE.Color(1.6,1.6,1.6)});
 plane(mall,6.1,2.9,[SHOP.front-.01,1.55,1.55],-Math.PI/2);
 {const k=new ShopKit();for(const z of [-3.05,-1.5,0,1.5,3.05])k.r(box(.08,2.95,.07),RUBBER,[0,1.55,z]);for(const y of [.08,1.02,3.0])k.r(box(.08,.07,6.2),RUBBER,[0,y,0]);parts.place(k,SHOP.front-.05,1.55,0,Math.PI);}
 // LED cove under the ceiling and a light along the baseboards, all round.
 for(const [x,z,len,turn] of [[SHOP.back+.02,cz,D,0],[cx,SHOP.left-.02,W,Math.PI/2],[cx,SHOP.right+.02,W,-Math.PI/2],[SHOP.front-.02,cz,D,Math.PI]]){const s=new ShopKit();s.g(box(.03,.03,len),WARM,[0,3.47,0],2.6).r(box(.12,.05,len),0x0b0f0d,[.06,3.5,0]);parts.place(s,x,z,0,turn);}
 // The back wall: helmet cabinet, the sign and the neon, face-out suits, boot shelves, gloves, the OMP light box.
 const helmets=helmetDeck(41),suits=suitDeck(29);
 cabinet(parts,helmets);await pause();
 for(const a of L.arms)faceOut(parts,a,suits);
 bootShelves(parts);glovePegs(parts);roundRack(parts,suits);table(parts);
 wallRail(parts,suits,{x0:-.4,x1:7.9,seed:53});
 const loader=new THREE.TextureLoader(),image=(url,anisotropy=8)=>{const t=loader.load(url);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=anisotropy;return t;};
 {const g=L.logo,k=new ShopKit();k.r(box(.05,g.h+.24,g.w+.4),0x0a0c0b,[.025,0,0]).g(box(.012,.018,g.w+.36),WARM,[.055,g.h/2+.1,0],3).g(box(.012,.018,g.w+.36),WARM,[.055,-g.h/2-.1,0],3);parts.place(k,SHOP.back,g.z,g.y);
  const halo=plane(new THREE.MeshBasicMaterial({name:'Loja_logo_brilho',map:haloMap('255,214,120'),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}),g.w*1.4,g.h*1.6,[SHOP.back+.06,g.y,g.z],Math.PI/2);halo.renderOrder=1;
  const logo=plane(new THREE.MeshBasicMaterial({name:'Loja_logo',map:image('./assets/abertura/logo_auto_pobre_racing_v2.webp'),transparent:true,depthWrite:false,color:new THREE.Color(1.3,1.3,1.3)}),g.w,g.h,[SHOP.back+.07,g.y,g.z],Math.PI/2,'Loja_logo');logo.renderOrder=2;}
 {const n=L.neon,neon=plane(new THREE.MeshBasicMaterial({name:'Loja_neon',map:neonMap('MODA DE PISTA'),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,color:new THREE.Color(1.8,1.8,1.8)}),n.w,n.h,[SHOP.back+.04,n.y,n.z],Math.PI/2,'Loja_neon');neon.renderOrder=2;}
 {const o=L.omp,k=new ShopKit();k.r(box(.08,o.h+.1,o.w+.1),0x0a0a0a,[.04,0,0]).g(box(.006,o.h,o.w),0x0c0c0c,[.083,0,0],1);parts.place(k,SHOP.back,o.z,o.y);
  plane(new THREE.MeshBasicMaterial({name:'Loja_omp',map:image('./assets/branding/patrocinio_omp_v1.webp',4),transparent:true,depthWrite:false,color:new THREE.Color(1.5,1.5,1.5)}),o.w*.9,o.w*.9*494/1082,[SHOP.back+.088,o.y,o.z],Math.PI/2).renderOrder=2;}
 await pause();
 // Mannequins, the mirror's frame, the podium; the ceiling.
 const mannequins=L.mannequins.map((q,i)=>{const s=suits(),p=mannequin(parts,people,q,s,[0x17191b,0xe9e7e0,0xc81d25][i%3],helmets());root.add(p);return p;});
 const mm=L.mirror;parts.place(mirrorFrame(),mm.x,mm.z,0,mm.turn);parts.place(ceiling(),0,0);await pause();
 {const k=new ShopKit();k.p(cyl(SHOP.podium,SHOP.base,72),0x141617,[0,SHOP.base/2,0]).m(cyl(SHOP.podium+.004,.008,72,SHOP.podium+.004,true),BRASS,[0,SHOP.base-.004,0]).p(cyl(SHOP.top+.02,SHOP.deck-SHOP.base,64),0x0e0f10,[0,(SHOP.deck+SHOP.base)/2,0]);parts.place(k,0,0);}
 const ring=new THREE.Mesh(paint(new THREE.TorusGeometry(SHOP.podium+.012,.009,6,96).rotateX(Math.PI/2).translate(0,.012,0),0xffffff),new THREE.MeshBasicMaterial({name:'Loja_anel',vertexColors:true}));ring.name='Loja_anel_podio';root.add(ring);
 const deck=new THREE.Mesh(new THREE.CircleGeometry(SHOP.top,72).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({name:'Loja_podio',map:deckMap(),roughness:.4,metalness:.5}));deck.name='Loja_podio_giratorio';deck.position.y=-.002;
 // The mirror's glass: metal that shows the baked store (no mirror drawn), or depth only, keeping what draw put there.
 const glassGeometry=()=>new THREE.PlaneGeometry(mm.w,mm.h).rotateY(Math.PI/2+mm.turn).translate(mm.x+.018*Math.cos(mm.turn),mm.y+mm.h/2,mm.z-.018*Math.sin(mm.turn));
 const metal=new THREE.Mesh(paint(glassGeometry(),0xd8dcdf),new THREE.MeshStandardMaterial({name:'Loja_espelho',vertexColors:true,roughness:.03,metalness:1}));metal.name='Loja_espelho';root.add(metal);
 const depth=new THREE.Mesh(paint(glassGeometry(),0),new THREE.MeshBasicMaterial({name:'Loja_espelho_profundidade',vertexColors:true,colorWrite:false}));depth.name='Loja_espelho_vidro';depth.renderOrder=-1;depth.visible=false;root.add(depth);
 const normal=new THREE.Vector3(Math.cos(mm.turn),0,-Math.sin(mm.turn)),centre=new THREE.Vector3(mm.x+.018*Math.cos(mm.turn),mm.y+mm.h/2,mm.z-.018*Math.sin(mm.turn));
 const reflect=new THREE.Matrix4().set(1-2*normal.x*normal.x,-2*normal.x*normal.y,-2*normal.x*normal.z,0,-2*normal.y*normal.x,1-2*normal.y*normal.y,-2*normal.y*normal.z,0,-2*normal.z*normal.x,-2*normal.z*normal.y,1-2*normal.z*normal.z,0,0,0,0,1);
 reflect.setPosition(normal.clone().multiplyScalar(2*normal.dot(centre)));
 const corners=[-1,1].flatMap(a=>[-1,1].map(b=>centre.clone().add(new THREE.Vector3(-Math.sin(mm.turn)*a*mm.w/2,b*mm.h/2,-Math.cos(mm.turn)*a*mm.w/2))));
 await pause();parts.build(root);
 root.traverse(o=>{if(o.isMesh&&!o.isSkinnedMesh){o.updateMatrix();o.matrixAutoUpdate=false;}});root.updateMatrixWorld(true);
 const counts={helmets:L.cabinet.rows*(L.cabinet.cols-1-L.cabinet.alcove[1]+L.cabinet.alcove[0])+L.mannequins.length,alcove:true,mannequins:mannequins.length};
 const stats={built:performance.now()-started,frames:0,passes:0,calls:0,mirror:false,floorMirror:false,mirrorShown:false},size=new THREE.Vector2(),p=new THREE.Vector3();
 // The mirror's rectangle on the screen (CSS pixels from the bottom left), or null when it is out of sight.
 const mirrorRect=(camera,renderer)=>{
  renderer.getSize(size);let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const v of corners){p.copy(v).applyMatrix4(camera.matrixWorldInverse);if(p.z>-.05)return [0,0,size.x,size.y];p.applyMatrix4(camera.projectionMatrix);x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y);}
  x0=Math.max(0,Math.floor((x0+1)/2*size.x)-2);x1=Math.min(size.x,Math.ceil((x1+1)/2*size.x)+2);y0=Math.max(0,Math.floor((y0+1)/2*size.y)-2);y1=Math.min(size.y,Math.ceil((y1+1)/2*size.y)+2);
  return x1>x0&&y1>y0?[x0,y0,x1-x0,y1-y0]:null;
 };
 const pose=(world,matrix)=>{world.matrix.copy(matrix);world.matrixWorldNeedsUpdate=true;};
 return {root,deck,ring,floor:floorMesh,mannequins,
  accent(hex){ring.material.color.setHex(hex).multiplyScalar(1.7);},
  // The frame on the screen. mirrors (by the Gráficos tab's reflections): {wall, floor}, the fitting mirror (drawn only
  // in its rectangle: cheap) and the floor (the whole store again). Each draws the store reflected before the store itself
  // (a colour background clears the screen whatever autoClear says: only the first picture keeps it).
  draw(renderer,scene,world,camera,{wall=false,floor:under=false}={}){
   const background=scene.background;let passes=0,calls=0;const count=()=>{passes++;calls+=renderer.info.render.calls;};
   world.matrixAutoUpdate=false;floor.uniforms.mirror.value=under?1:0;floor.material.envMapIntensity=under?.35:.42;
   camera.updateMatrixWorld();const rect=wall?mirrorRect(camera,renderer):null;
   metal.visible=true;depth.visible=false;
   if(under){floorMesh.visible=false;pose(world,FLIP_Y);renderer.render(scene,camera);count();floorMesh.visible=true;}
   else if(rect){renderer.getClearColor(clearColor);const alpha=renderer.getClearAlpha();renderer.setClearColor(background,1);renderer.clear();renderer.setClearColor(clearColor,alpha);}
   if(under||rect){renderer.autoClear=false;scene.background=null;}
   if(rect){
    floor.uniforms.mirror.value=0;metal.visible=false;pose(world,reflect);renderer.setScissor(...rect);renderer.setScissorTest(true);renderer.clearDepth();
    obliqueNear(camera,normal,centre);renderer.render(scene,camera);count();camera.updateProjectionMatrix();renderer.setScissorTest(false);
    floor.uniforms.mirror.value=under?1:0;depth.visible=true;
   }
   if(under||rect)renderer.clearDepth();
   pose(world,IDENTITY);renderer.render(scene,camera);count();scene.background=background;
   stats.frames++;stats.passes=passes;stats.calls=calls;stats.floorMirror=under;stats.mirror=!!wall;stats.mirrorShown=!!rect;
  },
  // The store as the paint sees it from the pilot: what glows (the niches, the strips, the neon, the sign, the window)
  // in a dark box of the walls' tone; only unlit materials, as the garage's (car-garage.js bake).
  bake(renderer){
   const room=new THREE.Scene(),walls=new THREE.Mesh(paint(new THREE.BoxGeometry(W,H,D).scale(-1,1,1).translate(cx,H/2,cz),0x1d2a25),M.glow);
   room.background=new THREE.Color(0x0b100e);room.add(walls);
   root.traverse(o=>{if(!o.isMesh||!o.material?.isMeshBasicMaterial||!o.material.colorWrite)return;const copy=new THREE.Mesh(o.geometry,o.material);copy.matrixAutoUpdate=false;copy.matrix.copy(o.matrixWorld);copy.renderOrder=o.renderOrder;room.add(copy);});
   const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromScene(room,.02,.1,60,{position:new THREE.Vector3(0,1.2,0)}).texture;pmrem.dispose();walls.geometry.dispose();return env;
  },
  info:()=>({built:true,buildMs:Math.round(stats.built),meshes:root.children.length,...counts,frames:stats.frames,passes:stats.passes,calls:stats.calls,mirror:stats.mirror,mirrorShown:stats.mirrorShown,floorMirror:stats.floorMirror,
   materials:[...new Set(Object.values(M).map(m=>m.name))].length})
 };
}
