import * as THREE from 'three';
import {TestCar,clamp,wrap,GUARDRAIL_CLEARANCE,guardrailClearance,guardrailSections,guardrailPresent} from './physics.js';
import {pitLane} from './pit-lane.js';
import {sceneryBands,bandClearance} from './track-clearance.js';
import {carShadowPatch} from './car-shadow.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {canvasTexture} from './pit-textures.js';
import {CIRCUITS} from './circuits.js';
import {circuitSponsors,circuitSeed,seeded,paintBoard,paintWelcome} from './sponsors.js';
import {createStreetWalls,barrierLines,barrierAt} from './street-walls.js';

// Compile away the expensive near-surface detail on modest GPUs. The same road and
// collision surface are used by every preset; changing this does not reload the lap.
export const TRACK_DETAIL=Object.freeze({
 baixo:{shader:0,anisotropy:2,normal:0,reflectors:0},
 medio:{shader:1,anisotropy:4,normal:.42,reflectors:.5},
 alto:{shader:2,anisotropy:8,normal:.6,reflectors:1},
 ultra:{shader:3,anisotropy:16,normal:.68,reflectors:1}
});
const trackQuality=quality=>Object.hasOwn(TRACK_DETAIL,quality)?quality:'alto';

// Billboards stand this far (metres) from roads, garages and the grandstands' margin.
export const BOARD_CLEARANCE=6.5;
// Rain (weather.js wetness, 0 dry .. 1 soaked): one uniform for the asphalt of every circuit, its pit-lane copies and
// the kerbs. Wet stones darken and go glossy; standing water gathers in the dips and at the shoulders as near
// mirrors. main.js sets it through the surface's setWetness.
// roadRain: how hard it falls (weather.js drops) and roadTime its clock, for the rings the drops make on the puddles.
export const ROAD_WEATHER={roadWetness:{value:0},roadRain:{value:0},roadTime:{value:0}};
// Sixteen slots for boards facing the approaching drivers, alternating sides. Each board
// keeps off every road (the other straights too), out of the garages, out of the
// grandstands' view and away from the other boards: it tries the other side, then slides
// along the track up to 150 m. A slot with no clear place gets no board (slot keeps the
// artwork alternating). It stands 5 m behind the guardrail line, further where its own build
// (billboardFormat: the 14.4 m one, or any on a bend) would reach over a rail toward the cars.
export function billboardSpots(data){
 const length=data.meta.reconstructed_xy_m,bands=sceneryBands(data),spots=[],shifts=[0];
 // In a real city (Floripa) a board never stands in the mouth of a side street closed for the race (data.scenery.city
 // closures, street-closures.js): the closure is the view there.
 const closures=data.scenery?.city?.closures??[];
 // A street circuit (Floripa) looks further: its line is on a bridge, and the city leaves few gaps behind the walls (and
 // the Minhocão's 1.3 km on its deck and in its tunnel have none).
 for(let d=12;d<=(data.meta.street?900:150);d+=12)shifts.push(d,-d);
 for(let slot=0;slot<16;slot++){
  const start=slot===0?length-30:slot===1?70:230+(slot-2)*(length-480)/14,f=billboardFormat(data,{slot});
  search:for(const shift of shifts)for(const side of [slot%2?1:-1,slot%2?-1:1]){
   const s=((start+shift)%length+length)%length,index=Math.max(0,data.samples.findIndex(q=>q[0]>=s)),p=data.samples[index];
   // Behind a street circuit's wall the sidewalk is narrow: the board stands a little further back, in the city.
   const near=p[4]/2+guardrailClearance(data,p[0],side)+(data.meta.street?6.4:5),reach=boardReach(data,index,side,f,near);if(!(reach<BOARD_REACH))continue;
   const offset=side*(near+reach),x=p[1]-p[8]*offset,y=p[2]+p[7]*offset;
   const clearance=bandClearance(bands,x,y).distance;
   if(clearance>BOARD_CLEARANCE&&spots.every(b=>Math.hypot(b.x-x,b.y-y)>25)&&closures.every(c=>Math.hypot(c.x-x,c.y-y)>f.w/2+6)){spots.push({slot,index,p,side,x,y,clearance});break search;}
  }
 }
 return spots;
}
// A board's corners stay this far behind a guardrail that runs beside them; a place where that takes the board
// more than BOARD_REACH further out (inside a tight bend, where moving out brings the other end nearer) is no place for it.
export const BOARD_RAIL_GAP=.15,BOARD_REACH=3;
// How much further out (metres) than `off` from the centre line at sample `index` a board of build f must stand
// for its track-side corners (the backing's, the catwalk's, the lamp heads') to keep BOARD_RAIL_GAP behind a rail
// at their own place along the lap: its width runs .8 across the track, so a 14.4 m board reached a metre over it.
// Infinity when no move up to BOARD_REACH clears them.
function boardReach(data,index,side,f,off){
 const a=data.samples,p=a[index],ry=Math.atan2(-p[7]*.8+p[8]*side*.6,p[8]*.8+p[7]*side*.6)+f.turn,c=Math.cos(ry),sn=Math.sin(ry),W=f.w/2+.2;
 const corners=[[-W,.11],[W,.11],[-W,-.11],[W,-.11],[-f.w*.45,.77],[f.w*.45,.77]];
 if(f.lamps){const a0=f.w/2-f.w/(2*f.lamps)+.21;corners.push([-a0,1.2],[a0,1.2]);}
 // Again until clear: on a bend a corner moves out less than the board (another stretch's normal).
 let out=0,over=1;
 for(let pass=0;over>.005;pass++){
  if(pass===8||out>BOARD_REACH)return Infinity;
  const o=side*(off+out),x=p[1]-p[8]*o,y=p[2]+p[7]*o;over=0;
  for(const [lx,lz] of corners){
   const X=x+lx*c+lz*sn,Y=y+lx*sn-lz*c;let best=index,bd=Infinity;
   for(let k=-24;k<=24;k++){const i=(index+k+a.length)%a.length,d=(a[i][1]-X)**2+(a[i][2]-Y)**2;if(d<bd){bd=d;best=i;}}
   const q=a[best];if(!guardrailPresent(data,q[0],side))continue;
   over=Math.max(over,q[4]/2+guardrailClearance(data,q[0],side)+BOARD_RAIL_GAP-side*(-(X-q[1])*q[8]+(Y-q[2])*q[7]));
  }
  out+=over;
 }
 return out;
}

// Each board's own build, from its circuit and slot (the flags on its top corners read it too,
// trackside-flags.js): face width and height (2:1, one atlas cell), the height of its centre, its
// legs along the face, the frame's paint and a small turn off true.
const BOARD_FORMATS=Object.freeze([
 {w:12,h:6,centre:4.9,legs:[-4.5,4.5],lamps:3},
 {w:14.4,h:7.2,centre:6.4,legs:[-5.4,0,5.4],lamps:4},
 {w:9.6,h:4.8,centre:5.8,legs:[0],lamps:2},
 {w:8,h:4,centre:3.8,legs:[-2.8,2.8],lamps:0}
]);
const FRAME_PAINTS=[0x263a3a,0x9ea4a6,0xd4d7d3,0x6b4a36,0x1d2b4a,0x8d9194];
export function billboardFormat(data,spot){
 const rand=seeded(circuitSeed(data.meta?.id)+spot.slot*7919),r=rand(),f=BOARD_FORMATS[r<.42?0:r<.62?1:r<.84?2:3];
 return {...f,top:f.centre+f.h/2+.2,frame:FRAME_PAINTS[Math.floor(rand()*FRAME_PAINTS.length)],turn:(rand()-.5)*.05,wear:rand(),seed:rand()};
}
// Billboard artwork: fourteen 2:1 cells of one canvas, two across and seven down: the Old Stock and Auto-Pobre
// logos, the circuit's welcome board, the 99's real partners (OMP, RTJ, Eletric: each logo alone, exactly as on
// the car, nothing added), the supporters who paid for a race at the last minute (crops of the door photos, so
// no name can be misspelt), then six of the circuit's joke sponsors, local ones first; front and back of every
// board. The car's other sponsors stay on the car only (user, 2026-10-05).
const BOARD_CELLS=14,BOARD_ROWS=BOARD_CELLS/2,WELCOME=2;
const FIXED_BOARDS=['oldstock','autopobre','welcome','omp','rtj','eletric','apoiadores_motorista','apoiadores_passageiro'];
// Which design fills each cell and which cell each board shows, front and back (pure: the Node check
// testar_beira.mjs reads it): no design twice within three boards in a row, the welcome board in slot 2
// (just past the line), each back a design other than its front.
export function billboardArt(data,spots=billboardSpots(data)){
 const id=data.meta?.id??'interlagos',sponsors=circuitSponsors(id,data.meta?.name),pick=seeded(circuitSeed(id)+17);
 const local=sponsors.filter(s=>s.region!=='br').sort(()=>pick()-.5),national=sponsors.filter(s=>s.region==='br'&&!['autopobre','oldstock'].includes(s.id)).sort(()=>pick()-.5);
 const painted=[...local.slice(0,3),...national.slice(0,2),...local.slice(3),...national.slice(2)].slice(0,BOARD_CELLS-FIXED_BOARDS.length);
 const rand=seeded(circuitSeed(id)+101),used=new Array(BOARD_CELLS).fill(0),recent=[],fronts=[],backs=[];
 for(const spot of spots){
  const cell=spot.slot===2?WELCOME:[...Array(BOARD_CELLS).keys()].filter(k=>k!==WELCOME&&!recent.includes(k)).sort((a,b)=>used[a]-used[b]||rand()-.5)[0];
  used[cell]++;recent.push(cell);if(recent.length>3)recent.shift();fronts.push(cell);
 }
 for(const cell of fronts)backs.push((cell+1+Math.floor(rand()*(BOARD_CELLS-1)))%BOARD_CELLS);
 return {painted,names:[...FIXED_BOARDS,...painted.map(s=>s.id)],fronts,backs};
}
function boardAtlas(data,images,painted){
 const id=data.meta?.id??'interlagos';
 const label=CIRCUITS[id]?.label??String(data.meta?.name??'').toLocaleUpperCase('pt-BR');
 return canvasTexture((ctx,w,h)=>{
  const cw=w/2,ch=h/BOARD_ROWS,cell=k=>[(k%2)*cw,Math.floor(k/2)*ch];
  // 0: Old Stock on white; 1: the game's logo on its dark green.
  {const [x,y]=cell(0),img=images.oldStock;ctx.fillStyle='#f4f2ec';ctx.fillRect(x,y,cw,ch);const k=Math.min(cw*.92/img.width,ch*.92/img.height);ctx.drawImage(img,x+(cw-img.width*k)/2,y+(ch-img.height*k)/2,img.width*k,img.height*k);}
  {const [x,y]=cell(1),img=images.game;ctx.fillStyle='#142a27';ctx.fillRect(x,y,cw,ch);const k=Math.min(cw*.9/img.width,ch*.95/img.height);ctx.drawImage(img,x+(cw-img.width*k)/2,y+(ch-img.height*k)/2,img.width*k,img.height*k);}
  {const [x,y]=cell(2);paintWelcome(ctx,x,y,cw,ch,label);}
  // 3-5: the car's real partners, their logo alone on the car's black (no tagline, no joke line).
  [images.omp,images.rtj,images.eletric].forEach((img,i)=>{const [x,y]=cell(3+i);ctx.fillStyle='#0d0d0e';ctx.fillRect(x,y,cw,ch);const k=Math.min(cw*.82/img.width,ch*.66/img.height);ctx.drawImage(img,x+(cw-img.width*k)/2,y+(ch-img.height*k)/2,img.width*k,img.height*k);});
  // 6-7: thanks to the supporters: the door photos as they are, under the car's yellow band.
  [images.doorDriver,images.doorPassenger].forEach((img,i)=>{
   const [x,y]=cell(6+i),band=ch*.17;ctx.fillStyle='#0b0b0c';ctx.fillRect(x,y,cw,ch);ctx.fillStyle='#f2c418';ctx.fillRect(x,y,cw,band);
   ctx.fillStyle='#111111';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${Math.round(ch*.1)}px "Arial Black","Arial Bold",Arial,sans-serif`;ctx.fillText('OBRIGADO, APOIADORES DO 99!',x+cw/2,y+band*.54,cw*.92);
   const k=Math.min(cw*.96/img.width,(ch-band)*.96/img.height);ctx.drawImage(img,x+(cw-img.width*k)/2,y+band+(ch-band-img.height*k)/2,img.width*k,img.height*k);
  });
  painted.forEach((s,k)=>{const [x,y]=cell(k+FIXED_BOARDS.length);paintBoard(ctx,x,y,cw,ch,s,{seed:circuitSeed(id)+k*31});});
 },2048,512*BOARD_ROWS);
}
// Lit like the rest of the world (sun, shade, occlusion, haze), each face weathered its own way: sun
// bleaching, rain streaks from the top and grime along the bottom. (A peeled vinyl strip across one board in
// eight was dropped: in the game it read as a white band cutting the artwork, a rendering fault.)
function boardFaceMaterial(map){
 const material=new THREE.MeshStandardMaterial({name:'Outdoors_artes',map,color:0xd8d8d8,roughness:.62,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 aBoard;\nvarying vec4 vBoard;').replace('#include <begin_vertex>','#include <begin_vertex>\nvBoard=aBoard;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec4 vBoard;
float boardHash(float x){return fract(sin(x*127.1)*43758.5453);}
float boardNoise(float x){float i=floor(x),f=fract(x);return mix(boardHash(i),boardHash(i+1.0),f*f*(3.0-2.0*f));}`).replace('#include <map_fragment>',`#include <map_fragment>
 {
  // vBoard: u, v on the face, the board's seed, its wear.
  vec2 uv=vBoard.xy;float seed=vBoard.z,wear=vBoard.w,grey=dot(diffuseColor.rgb,vec3(.3,.59,.11));
  vec2 corner=vec2(step(.5,fract(seed*7.3)),1.0);float bleach=wear*(.22+.4*smoothstep(.9,.15,length((uv-corner)*vec2(2.0,1.0))));
  diffuseColor.rgb=mix(diffuseColor.rgb,vec3(grey)*1.05+.07,bleach);
  float streak=pow(boardNoise(uv.x*64.0+seed*91.0),5.0)*smoothstep(.15,.95,uv.y)*(.15+.5*wear);
  float grime=(1.0-smoothstep(0.0,.2,uv.y))*(.12+.3*wear)*(.6+.4*boardNoise(uv.x*23.0+seed*13.0));
  diffuseColor.rgb*=1.0-.55*streak-grime;
 }`);
 };
 material.customProgramCacheKey=()=>'outdoors-artes-v2';return material;
}

export async function createTrackBranding(data){
 const loader=new THREE.TextureLoader(),[oldStock,game,omp,rtj,eletric,doorDriver,doorPassenger]=await Promise.all([
  loader.loadAsync('./assets/branding/old_stock_preparada_v1.jpg'),
  loader.loadAsync('./assets/abertura/logo_auto_pobre_racing.webp'),
  loader.loadAsync('./assets/branding/patrocinio_omp_v1.webp'),
  loader.loadAsync('./assets/branding/patrocinio_rtj_v1.webp'),
  loader.loadAsync('./assets/branding/patrocinio_eletric_v1.webp'),
  loader.loadAsync('./assets/branding/apoiadores_porta_motorista_v1.jpg'),
  loader.loadAsync('./assets/branding/apoiadores_porta_passageiro_v1.jpg'),
 ]);oldStock.colorSpace=THREE.SRGBColorSpace;oldStock.anisotropy=4;
 const pictures={omp,rtj,eletric,doorDriver,doorPassenger};
 // One group of two merged meshes for every board; userData.billboards counts them (verificar_grid_oldstock.py).
 const root=new THREE.Group();root.name='Outdoors_AutoPobre_OldStock';
 const spots=billboardSpots(data),art=billboardArt(data,spots),map=boardAtlas(data,{oldStock:oldStock.image,game:game.image,...Object.fromEntries(Object.entries(pictures).map(([k,t])=>[k,t.image]))},art.painted);game.dispose();for(const t of Object.values(pictures))t.dispose();
 const probe=new TestCar(data),{fronts,backs}=art,frames=[],faces=[],m=new THREE.Matrix4(),q=new THREE.Quaternion(),Y=new THREE.Vector3(0,1,0),one=new THREE.Vector3(1,1,1),tint=new THREE.Color();
 const cellUv=k=>[(k%2)/2,1-(Math.floor(k/2)+1)/BOARD_ROWS];
 const coloured=(g,color)=>{const n=g.attributes.position.count,rgb=new Float32Array(n*3);tint.setHex(color);for(let i=0;i<n;i++)rgb.set([tint.r,tint.g,tint.b],i*3);g.setAttribute('color',new THREE.BufferAttribute(rgb,3));g.deleteAttribute('uv');return g;};
 spots.forEach((spot,n)=>{
  const {index,p,side,x,y}=spot,f=billboardFormat(data,spot);probe.index=index;const ground=probe.sample(x,y).z;
  // Face the approaching driver, rather than presenting the edge of the sign.
  const fx=-p[7]*.8+p[8]*side*.6,fz=p[8]*.8+p[7]*side*.6;m.compose(new THREE.Vector3(x,ground,-y),q.setFromAxisAngle(Y,Math.atan2(fx,fz)+f.turn),one);
  const frame=f.frame,parts=[];
  // Legs from below the ground up into the backing box's underside (one thick pole on the mid boards), the
  // backing box, and on the bigger boards a catwalk and lamps leaning over the face. The legs stop under the
  // box: thicker than the box (the single pole) or set off its middle, they came out through the faces as a
  // column across the artwork.
  const legTop=f.centre-(f.h+.4)/2+.05;
  for(const a of f.legs){const thick=f.legs.length===1?.46:.22;parts.push(coloured(new THREE.BoxGeometry(thick,legTop+.6,thick).translate(a,(legTop-.6)/2,0),frame));}
  parts.push(coloured(new THREE.BoxGeometry(f.w+.4,f.h+.4,.22).translate(0,f.centre,0),frame));
  if(f.lamps){parts.push(coloured(new THREE.BoxGeometry(f.w*.9,.06,.7).translate(0,f.centre-f.h/2-.26,.42),0x5d6266));
   for(let k=0;k<f.lamps;k++){const a=(k+.5)/f.lamps*f.w-f.w/2;parts.push(coloured(new THREE.BoxGeometry(.05,.05,1.1).rotateX(-.35).translate(a,f.top+.12,.5),0x3b3f42),coloured(new THREE.BoxGeometry(.42,.12,.26).rotateX(.5).translate(a,f.top+.32,1.02),0x2a2d30));}}
  for(const g of parts)frames.push(g.applyMatrix4(m));
  // Front and back faces, each a different design (the back seen from the other straights).
  const wear=f.wear,seed=f.seed;
  for(const [cell,z,turn,s] of [[fronts[n],.12,0,seed],[backs[n],-.12,Math.PI,fract(seed*1.7+.3)]]){
   const g=new THREE.PlaneGeometry(f.w,f.h).rotateY(turn).translate(0,f.centre,z),uv=g.attributes.uv,[u0,v0]=cellUv(cell),local=new Float32Array(uv.count*4);
   for(let i=0;i<uv.count;i++){const u=uv.getX(i),v=uv.getY(i);local.set([u,v,s,wear*(.6+.8*fract(s*9.1))],i*4);uv.setXY(i,u0+.002+u*.496,v0+.002+v*(1/BOARD_ROWS-.004));}
   g.setAttribute('aBoard',new THREE.BufferAttribute(local,4));faces.push(g.applyMatrix4(m));
  }
 });
 if(spots.length){
  const frame=new THREE.Mesh(mergeGeometries(frames,false),new THREE.MeshStandardMaterial({name:'Outdoors_estrutura',vertexColors:true,roughness:.62,metalness:.35}));frame.name='Outdoors_estrutura';frame.castShadow=frame.receiveShadow=true;
  const faceMesh=new THREE.Mesh(mergeGeometries(faces,false),boardFaceMaterial(map));faceMesh.name='Outdoors_artes';faceMesh.receiveShadow=true;
  root.add(frame,faceMesh);frames.forEach(g=>g.dispose());faces.forEach(g=>g.dispose());
 }
 const shown=fronts.map(k=>art.names[k]);root.userData.billboards=spots.length;
 return {root,oldStock,stats:{billboards:spots.length,artworks:new Set(shown).size,designs:art.names,fronts:shown,oldStock:shown.filter(k=>k==='oldstock').length,autoPobre:shown.filter(k=>k==='autopobre').length}};
}
const fract=v=>v-Math.floor(v);

// Painted kerb: 1.2 m blocks (Interlagos yellow/green; circuits from open data give their
// own colours in meta.kerb_colors), worn paint, rubber on the track side and shallow
// rumble ridges. DataTextures keep this usable in Node tests.
// The colour map holds only the paint's wear and the rubber, in grey: the two colours and the join between them are
// worked out in kerbPatch from the kerb's own coordinates (a texel-wide join read as square blocks near the camera),
// as are the seams and the chips (single-texel chips read as magnified pixels).
const curbMaps=new Map();
const KERB_PAINT=['#e2b22e','#1a7034'].map(c=>new THREE.Color(c));
function curbTextures(){
 const key='grey';if(curbMaps.has(key))return curbMaps.get(key);
 const w=128,h=512,color=new Uint8Array(w*h*4),normal=new Uint8Array(w*h*4),rough=new Uint8Array(w*h*4);
 const hash=(x,y)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v);};
 const noise=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
  const a=hash(ix%16,iy%64),b=hash((ix+1)%16,iy%64),c=hash(ix%16,(iy+1)%64),d=hash((ix+1)%16,(iy+1)%64);return (a+(b-a)*sx)+((c+(d-c)*sx)-(a+(b-a)*sx))*sy;};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,u=x/w;
  const wear=.8+.2*noise(x/6,y/6)*noise(x/3,y/3+7),rubber=Math.max(0,1-u/.45)*(.25+.35*noise(x/3,y/9));
  color.fill(Math.round(255*wear*(1-rubber*.93)),i,i+3);
  color[i+3]=255;
  const r=Math.round(255*(.68+.22*noise(x/7,y/7)-rubber*.34));
  rough.set([r,r,r,255],i);
  // Ridge every 0.4 m along the kerb (six per 2.4 m tile), fading toward the outer edge.
  const slope=Math.cos(y/h*Math.PI*2*6)*.55*(1-u*.4),nx=(noise(x/4,y/4)-.5)*.12,len=Math.hypot(nx,slope,1);
  normal[i]=Math.round((nx/len*.5+.5)*255);normal[i+1]=Math.round((-slope/len*.5+.5)*255);normal[i+2]=Math.round((1/len*.5+.5)*255);normal[i+3]=255;
 }
 const make=(data,srgb)=>{const t=new THREE.DataTexture(data,w,h,THREE.RGBAFormat);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=8;if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t;};
 const maps={map:make(color,true),normalMap:make(normal,false),roughnessMap:make(rough,false)};curbMaps.set(key,maps);return maps;
}

// Every 1.2 m block of kerb is its own: the texture is read mirrored or not, the paint older or
// fresher and a little warmer or cooler, worn through to the concrete in its own patches, chipped
// at its ends, with rubber on the track side (heavier where the track bends: kerbData.x) and dust on
// the outer side that change along the lap, so the 2.4 m tile never repeats.
function kerbPatch(shader,paint=KERB_PAINT){
 Object.assign(shader.uniforms,ROAD_WEATHER,{kerbPaintA:{value:paint[0]},kerbPaintB:{value:paint[1]}});
 shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 kerbData;\nvarying vec2 vKerbData;').replace('#include <begin_vertex>','#include <begin_vertex>\nvKerbData=kerbData;');
 shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec2 vKerbData;uniform float roadWetness;uniform vec3 kerbPaintA,kerbPaintB;
float kerbHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float kerbNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(kerbHash(i),kerbHash(i+vec2(1,0)),f.x),mix(kerbHash(i+vec2(0,1)),kerbHash(i+vec2(1,1)),f.x),f.y);}`).replace('#include <map_fragment>',`
float kerbBlock=floor(vMapUv.y*2.0),kerbAlong=fract(vMapUv.y*2.0);
vec2 kerbSeed=vec2(kerbBlock,vKerbData.y);
float kb=kerbHash(kerbSeed+.3),kb2=kerbHash(kerbSeed+5.7),kb3=kerbHash(kerbSeed+9.1);
vec2 kerbUv=vec2(vMapUv.x,kb>.5?(kerbBlock+1.0-kerbAlong)*.5:vMapUv.y);
vec4 sampledDiffuseColor=textureGrad(map,kerbUv,dFdx(vMapUv),dFdy(vMapUv));
// The two paints from the kerb's own coordinate (a block of each every 1.2 m): their join blended over a pixel, and a
// dark sawn seam about a centimetre wide at every block's end, both as sharp up close as far off.
float kerbQ=fract(vMapUv.y),kerbSide=kerbQ<.5?-min(kerbQ,.5-kerbQ):min(kerbQ-.5,1.0-kerbQ),kerbStep=max(fwidth(vMapUv.y),1e-6);
float kerbSeam=1.0-.3*(1.0-smoothstep(.0035,.0035+kerbStep*3.6,abs(kerbSide)*2.4))*(1.0-smoothstep(.004,.012,kerbStep*2.4));
diffuseColor.rgb*=sampledDiffuseColor.rgb*mix(kerbPaintA,kerbPaintB,smoothstep(-kerbStep,kerbStep,kerbSide))*kerbSeam;
// Metres across the kerb (0 at the road) and along the lap.
vec2 kp=vec2(vMapUv.x*1.05,vMapUv.y*2.4);
diffuseColor.rgb*=(.88+.18*kb2)*mix(vec3(1.0),vec3(1.05,1.0,.9),kb3);
// The fine wear and the chips (2-10 cm) fade to their average once a pixel covers them (a kerb far ahead at a
// grazing look): MSAA does not filter shading, they would sparkle along the seams.
float kerbPx=length(fwidth(kp)),kerbFine=1.0-smoothstep(.015,.045,kerbPx),kerbMid=1.0-smoothstep(.05,.15,kerbPx);
float kerbWear=smoothstep(.62-kerbPx*.3,.8+kerbPx*.3,kerbNoise(kp*vec2(4.0,2.6)+kb*17.0)*.6+mix(.5,kerbNoise(kp*vec2(11.0,9.0)+kb2*9.0),kerbMid)*.22+mix(.5,kerbNoise(kp*vec2(46.0,38.0)),kerbFine)*.18)*(.2+.8*kb3*kb3);
diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.45+vec3(.1,.095,.09),kerbWear*.6);
float kerbEnd=min(kerbAlong,1.0-kerbAlong)*1.2;
// Chips knocked out of the paint near the block's ends: round flakes of 1-3 cm, each its own place in its cell.
vec2 chipGrid=kp*vec2(26.0,20.0),chipCell=floor(chipGrid),chipAt=(fract(chipGrid)-.5-(vec2(kerbHash(chipCell+kb*31.0+.7),kerbHash(chipCell+kb*31.0+3.3))-.5)*.5)/vec2(26.0,20.0);
float chipR=.006+.01*kerbHash(chipCell+kb*13.0+5.1);
float kerbChip=mix(.12,step(.8,kerbHash(chipCell+kb*31.0))*(1.0-smoothstep(chipR-kerbPx*.7,chipR+kerbPx*.7,length(chipAt))),kerbFine)*(1.0-smoothstep(.04,.14+kerbPx,kerbEnd))*step(.35,kb2);
diffuseColor.rgb*=1.0-kerbChip*.5;
float kerbRubber=(1.0-smoothstep(.05,.6,vMapUv.x))*(.2+.8*vKerbData.x)*(.35+.65*kerbNoise(vec2(vMapUv.x*7.0,kp.y*.4)+kb))*smoothstep(.15,.65,kerbNoise(vec2(kp.y*.06,vKerbData.y*3.0+1.0)));
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.03,.028,.026),clamp(kerbRubber*.7,0.0,.75));
float kerbDust=smoothstep(.5,1.0,vMapUv.x)*smoothstep(.3,.8,kerbNoise(vec2(kp.y*.15,vKerbData.y+5.1)));
diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.7+vec3(.06,.05,.035),kerbDust*.45);
// Wet paint: a little darker and glassy (wet kerbs are as slippery as they look).
diffuseColor.rgb*=1.0-.3*roadWetness;
`).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
roughnessFactor=clamp(roughnessFactor-kerbRubber*.18+kerbWear*.06+kerbDust*.05,.35,1.0);
roughnessFactor=mix(roughnessFactor,.12,roadWetness);`);
 carShadowPatch(shader);
}

export function createCurbs(data,{quality='alto'}={}){
 const root=new THREE.Group();root.name='Zebras_circuito_completo';
 const probe=new TestCar(data),profile=[[0,.02],[.48,.065],[1.05,.02]],L=data.meta.reconstructed_xy_m;
 const maps=curbTextures(),paint=(data.meta.kerb_colors??['#e2b22e','#1a7034']).map(c=>new THREE.Color(c)),material=new THREE.MeshStandardMaterial({name:'Zebra_pintada',map:maps.map,normalMap:maps.normalMap,roughnessMap:maps.roughnessMap,normalScale:new THREE.Vector2(.6,.6),roughness:.88,metalness:0,side:THREE.DoubleSide});
 material.detailNormalMap=maps.normalMap;material.detailRoughnessMap=maps.roughnessMap;
 // Each block weathered on its own; the cars' crisp shadows fall on the kerbs too (car-shadow.js).
 material.onBeforeCompile=shader=>kerbPatch(shader,paint);material.customProgramCacheKey=()=>'kerb-blocks-car-shadow-v4';
 root.userData.setQuality=value=>{
  const detail=TRACK_DETAIL[trackQuality(value)];
  const normal=detail.shader?maps.normalMap:null;
  if(material.normalMap!==normal){material.normalMap=normal;material.roughnessMap=detail.shader?maps.roughnessMap:null;material.needsUpdate=true;}
  material.normalScale.setScalar(detail.normal);
  for(const map of Object.values(maps))if(map.anisotropy!==Math.min(detail.anisotropy,8)){map.anisotropy=Math.min(detail.anisotropy,8);map.needsUpdate=true;}
 };
 root.userData.setQuality(quality);
 function vertex(p,index,side,[width,height]){
  const offset=side*(p[4]/2+width),x=p[1]-p[8]*offset,y=p[2]+p[7]*offset;
  probe.index=index;return [x,probe.sample(x,y).z+height,-y];
 }
 // How much the track bends round a sample (0 straight .. 1 a hairpin): rubber on the kerb.
 const n=data.samples.length,bendAt=i=>{const a=data.samples[(i-18+n)%n],b=data.samples[(i+18)%n];return clamp(Math.abs(wrap(Math.atan2(b[8],b[7])-Math.atan2(a[8],a[7])))*1.2,0,1);};
 for(const side of [-1,1]){
  const positions=[],uvs=[],wear=[];
  for(let i=0;i<n;i++){
   const j=(i+1)%n,p=data.samples[i],q=data.samples[j];
   const lane=pitLane(data,p[0]);if(side===1&&lane&&(lane.entry||lane.exit))continue;
   // Surveyed circuits flag the kerbs seen on the orthophoto, per side (13 right, 14 left).
   const flag=side<0?13:14;if(p.length>flag&&!(p[flag]&&q[flag]))continue;
   const a=profile.map(v=>vertex(p,i,side,v)),b=profile.map(v=>vertex(q,j,side,v)),va=p[0]/2.4,vb=(j?q[0]:L)/2.4,u=[0,.46,1],ba=bendAt(i),bb=bendAt(j),k0=side<0?0:1;
   for(let k=0;k<2;k++){
    positions.push(...a[k],...b[k],...a[k+1],...b[k],...b[k+1],...a[k+1]);
    uvs.push(u[k],va,u[k],vb,u[k+1],va,u[k],vb,u[k+1],vb,u[k+1],va);
    wear.push(ba,k0,bb,k0,ba,k0,bb,k0,bb,k0,ba,k0);
   }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setAttribute('kerbData',new THREE.Float32BufferAttribute(wear,2));g.computeVertexNormals();
  const m=new THREE.Mesh(g,material);m.receiveShadow=true;m.name=side<0?'Zebra_direita':'Zebra_esquerda';root.add(m);
 }
 return root;
}

// Each rendered strip is independent: no faces or posts bridge the run-off gaps.
export function createGuardrails(data,{quality='alto'}={}){
 // A street circuit (Floripa) is closed by concrete blocks and catch fences instead of steel rails.
 if(data.meta.barrier==='street')return createStreetWalls(data,{quality});
 const root=new THREE.Group(),closed=data.meta.id==='curvelo';root.name=closed?'Guardrail_circuito_completo':'Guardrails_trechos_Interlagos';
 const positions=[],uvs=[],indices=[],postPoints=[],reflectorPoints=[],L=data.meta.reconstructed_xy_m;
 const profile=[[.34,0],[.44,.10],[.56,0],[.68,.10],[.8,0],[.91,.06]];
 const metal=new THREE.MeshStandardMaterial({name:'Aco_galvanizado',color:0xaab6c0,metalness:.72,roughness:.37,side:THREE.DoubleSide});
 const railMetal=metal.clone();railMetal.name='Guardrail_galvanizado';
 railMetal.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vRailUv;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRailUv=uv;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vRailUv;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
// Four-metre pressed panels, shaded lower lip and seams: broad details read at speed.
float panel=abs(fract(vRailUv.x)-.5);
float railSeam=(1.0-smoothstep(.0,max(fwidth(vRailUv.x),.006),.5-panel));
float railDirt=1.0-smoothstep(.0,.46,vRailUv.y);
diffuseColor.rgb*=1.0-.14*railDirt-.15*railSeam;
#if ROAD_DETAIL > 1
vec2 flakes=floor(vRailUv*vec2(180.0,24.0));
float zinc=fract(sin(dot(flakes,vec2(127.1,311.7)))*43758.5453);
float zincFade=1.0-smoothstep(.5,1.5,length(fwidth(vRailUv*vec2(180.0,24.0))));
diffuseColor.rgb*=1.0+(zinc-.5)*.12*zincFade;
#endif
`);
 };
 railMetal.customProgramCacheKey=()=>`galvanized-rail-v1-${railMetal.defines.ROAD_DETAIL}`;
 let segments=0,coverage=0,sections=0;
 for(const side of [-1,1])for(const {from,to,stations} of barrierLines(data)[side]){
  coverage+=to-from;sections++;const base=positions.length/3,last=stations.length-1;
  // The rail bends at every track sample (barrierLines, shared with the banners hung on it: every 4 m it was a
  // polygon in the corners, the banners a finer one of their own a hand off it or through it).
  for(let i=0;i<=last;i++){
   const {s,node,p,x,y,z:ground,ox,oy}=stations[i];
   for(const [height,ridge] of profile){positions.push(x-ox*ridge,ground+height,-(y-oy*ridge));uvs.push(s/4,(height-.34)/.57);}
   // Posts every 4 m as before (even samples and the section's ends), reaching 1 m into the ground, so they meet it
   // where a bank beside the road was cut back.
   if(node===undefined?!(to===L&&i===last):node%2===0)postPoints.push({x,y:ground,z:-y,heading:Math.atan2(p[8],p[7])});
   if(i>0){segments++;for(let j=0;j<profile.length-1;j++){const k=base+(i-1)*profile.length+j,b=k+profile.length;indices.push(k,b,k+1,b,b+1,k+1);}}
  }
  // Amber catchlights repeat every 14 m on actual guardrail strips only. No posts are
  // introduced on the road/runoff: two instanced draws provide peripheral speed cues. On the rail's own line (where
  // a hairpin's fold was cut off, the offset of the centreline stands metres off the rail).
  for(let s=Math.ceil((from+2)/14)*14;s<to-2;s+=14){
   const {x,y,z,ox,oy}=barrierAt(stations,s);
   reflectorPoints.push({x:x-ox*.13,y:z+.91,z:-(y-oy*.13),heading:Math.atan2(-oy*side,-ox*side)});
  }
 }
 const posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,2,.14),metal,postPoints.length),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1);
 postPoints.forEach((p,i)=>{q.setFromAxisAngle(new THREE.Vector3(0,1,0),p.heading);matrix.compose(new THREE.Vector3(p.x,p.y,p.z),q,scale);posts.setMatrixAt(i,matrix);});
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
 const rails=new THREE.Mesh(geometry,railMetal);rails.name=closed?'Guardrail_continuo':'Guardrail_por_trechos';rails.castShadow=rails.receiveShadow=true;posts.name='Postes_guardrail';posts.castShadow=posts.receiveShadow=true;posts.computeBoundingSphere();root.add(rails,posts);
 const reflectorMaterial=new THREE.MeshStandardMaterial({name:'Refletor_ambar',color:0xffba54,emissive:0xff920a,emissiveIntensity:.1,roughness:.23,metalness:.18});
 const reflectorBacking=new THREE.MeshStandardMaterial({color:0xe3e0d2,roughness:.64});
 const reflectors=new THREE.InstancedMesh(new THREE.BoxGeometry(.105,.19,.038),reflectorMaterial,reflectorPoints.length);
 const backing=new THREE.InstancedMesh(new THREE.BoxGeometry(.16,.26,.033),reflectorBacking,reflectorPoints.length);
 reflectors.name='Refletores_velocidade';backing.name='Suportes_refletores';
 // Even slots first keep medium-quality spacing uniform across the entire circuit.
 const ordered=[...reflectorPoints.filter((_,i)=>i%2===0),...reflectorPoints.filter((_,i)=>i%2)];
 ordered.forEach((p,i)=>{
  q.setFromAxisAngle(new THREE.Vector3(0,1,0),p.heading);matrix.compose(new THREE.Vector3(p.x,p.y,p.z),q,scale);backing.setMatrixAt(i,matrix);
  matrix.compose(new THREE.Vector3(p.x+Math.sin(p.heading)*.027,p.y,p.z+Math.cos(p.heading)*.027),q,scale);reflectors.setMatrixAt(i,matrix);
 });
 reflectors.computeBoundingSphere();backing.computeBoundingSphere();root.add(backing,reflectors);
 const stats={sides:2,closed,segments,sections,coverageMetres:coverage,coverageRatio:coverage/(L*2),clearance:GUARDRAIL_CLEARANCE,reflectors:0};
 function setQuality(value){
  const level=trackQuality(value),detail=TRACK_DETAIL[level];
  if(railMetal.defines?.ROAD_DETAIL!==detail.shader){railMetal.defines={...railMetal.defines,ROAD_DETAIL:detail.shader};railMetal.needsUpdate=true;}
  stats.reflectors=Math.ceil(reflectorPoints.length*detail.reflectors);stats.quality=level;
  reflectors.count=backing.count=stats.reflectors;reflectors.visible=backing.visible=stats.reflectors>0;
 }
 root.userData.setQuality=setQuality;setQuality(quality);
 return {root,rails,setQuality,stats};
}

// Braking and concrete zones along the lap: [from, to] in metres. A zone across the
// timing line is split in two, each half reaching past the seam (the closing triangles run
// to s = L + 2; pit lanes use s from 6000, far from any zone).
function brakeZones(data){return data.meta.brake_zones??(data.meta.id==='curvelo'?[[135,280],[760,960]]:[[160,345],[1380,1590],[2320,2460],[2950,3160]]);}
function concreteZones(data){return (data.meta.surface_zones??[]).filter(z=>z.kind==='concreto').map(z=>[z.from,z.to]);}
// One asphalt on every circuit made them read as the same track: each road has its own age. tone and
// tint lift the aggregate (old asphalt greys, a new one is near black), tar shifts how much of the lap
// has sealed cracks (-.3 a new road .. +.1 an old one), repair is the share of 47 m stretches patched.
// Game art from each venue's history (circuits.js), not measurements; meta.asphalt overrides it.
export const ASPHALT_PROFILES=Object.freeze({
 interlagos:{tone:1,tint:[1,1,1],tar:0,repair:.21},
 chapeco:{tone:.84,tint:[.99,.99,1.01],tar:-.3,repair:.03},
 goiania:{tone:.9,tint:[1,.995,1],tar:-.14,repair:.08},
 brasilia:{tone:.94,tint:[1,1,1.01],tar:-.08,repair:.12},
 cascavel:{tone:1.07,tint:[1.035,1,.955],tar:.05,repair:.26},
 piracicaba:{tone:1.1,tint:[1.02,1,.97],tar:.1,repair:.3},
 curvelo:{tone:1.06,tint:[1.03,1,.96],tar:.04,repair:.24}
});
export function asphaltProfile(data){return {...ASPHALT_PROFILES.interlagos,...(ASPHALT_PROFILES[data.meta?.id]??{}),...(data.meta?.asphalt??{})};}
const glsl=v=>Number(v).toFixed(4);
// The grain's eight variants (the shader's grainVariant): cos and sin of i*2.39 rad and an offset.
const GRAIN_VARIANTS=Array.from({length:8},(_,i)=>{const f=x=>x-Math.floor(x);return `vec4(${[Math.cos(i*2.39),Math.sin(i*2.39),f(Math.sin(3.1*(i+1))*43.7),f(Math.sin(7.3*(i+1))*43.7)].map(glsl).join(',')})`;});function zoneSum(zones,fn,L){
 const parts=[];for(let [a,b] of zones){a=((a%L)+L)%L;b=((b%L)+L)%L;if(a<=b)parts.push([a,b]);else{parts.push([a,L+40]);parts.push([-40,b]);}}
 return parts.map(([a,b])=>`${fn}(s,${a.toFixed(1)},${b.toFixed(1)})`).join('+')||'0.0';
}
// Metres throughout: the road detail stays attached to the measured surface.
// These wear patterns are game art, not surveyed marks of the real circuit.
export async function createTrackSurface(renderer,data,{quality='alto'}={}){
 const loader=new THREE.TextureLoader();
 const [texture,normalMap,roughnessMap,grainMap]=await Promise.all([...['diff','nor_gl','rough'].map(kind=>`asfalto_${kind}_v3.jpg`),'asfalto_grao_v2.jpg'].map(file=>loader.loadAsync(`./assets/texturas/${file}`)));
 texture.colorSpace=THREE.SRGBColorSpace;
 const maxAnisotropy=renderer.capabilities.getMaxAnisotropy(),anisotropy=Math.min(TRACK_DETAIL[trackQuality(quality)].anisotropy,maxAnisotropy);
 for(const map of [texture,normalMap,roughnessMap,grainMap]){
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=anisotropy;map.minFilter=THREE.LinearMipmapLinearFilter;
 }
 const asphalt=asphaltProfile(data),L=data.meta.reconstructed_xy_m,material=new THREE.MeshStandardMaterial({name:'Asfalto_PBR_circuito_v5',map:texture,normalMap,normalScale:new THREE.Vector2(.6,.6),roughnessMap,roughness:1,metalness:0});
 const materials=new Set([material]);
 // The shader sets the asphalt's tone from the scanned aggregate.
 material.color.setRGB(1,1,1);
 // Kept on the material so a circuit change disposes it with the other maps.
 material.grainMap=grainMap;
 const grainAnisotropy={value:anisotropy},roadMotion={value:new THREE.Vector3()};
 material.onBeforeCompile=shader=>{
  shader.uniforms.grainMap={value:grainMap};shader.uniforms.grainAnisotropy=grainAnisotropy;shader.uniforms.roadMotion=roadMotion;Object.assign(shader.uniforms,ROAD_WEATHER);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 roadData;\nvarying vec4 vRoad;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRoad=roadData;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec4 vRoad;uniform float roadWetness,roadRain,roadTime;
float roadHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float roadNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(roadHash(i),roadHash(i+vec2(1,0)),f.x),mix(roadHash(i+vec2(0,1)),roadHash(i+vec2(1,1)),f.x),f.y);}
// The grain map's eight variants: cos and sin of a turn that keeps the 6 m tile off any lattice (quarter
// turns would all share one), and an offset; picked by comparisons, no trig and no indexed array (ANGLE
// turns those into slow code).
vec4 grainVariant(float i){return i<4.0?(i<2.0?(i<1.0?${GRAIN_VARIANTS[0]}:${GRAIN_VARIANTS[1]}):(i<3.0?${GRAIN_VARIANTS[2]}:${GRAIN_VARIANTS[3]})):(i<6.0?(i<5.0?${GRAIN_VARIANTS[4]}:${GRAIN_VARIANTS[5]}):(i<7.0?${GRAIN_VARIANTS[6]}:${GRAIN_VARIANTS[7]}));}
float brakeZone(float s,float a,float b){return smoothstep(a,a+25.0,s)*(1.0-smoothstep(b-15.0,b,s));}
float slabZone(float s,float a,float b){return smoothstep(a,a+4.0,s)*(1.0-smoothstep(b-4.0,b,s));}
uniform sampler2D grainMap;
uniform float grainAnisotropy;
uniform vec3 roadMotion;
float brakeAt(float s){return clamp(${zoneSum(brakeZones(data),'brakeZone',L)},0.0,1.0);}
// A line of this width (metres) at this distance from its middle: thinner than a pixel (px) it
// fades out instead of growing to a pixel's width.
float roadLine(float dist,float width,float px){return (1.0-smoothstep(width*.5,width*.5+px,dist))*clamp(width/max(px,1e-5),0.0,1.0);}
// Old tyre marks: a car's two tracks (1.56 m apart, each a tyre's 22-28 cm) left where it braked
// hard or slid, 10-27 m long, faint, with soft ends. Each 7 m of the lap may start a pair, most of
// them in the braking zones; a fragment looks at the pairs started in its stretch and the three
// before it, so a pair ends (faded out) inside those 28 m: never cut square where its stretch drops
// out of the window. On straights a pair runs straight (a slight drift); only where the road bends
// (bendK, -1..1) does it curl out toward the exit, by at most 1.5 m.
float oldMarks(float s,float d,float path,float bendK,float px){
 if(abs(d-path)>5.4)return 0.0;
 float dark=0.0,cell=floor(s/7.0);
 for(int k=0;k<4;k++){
  float c=cell-float(k);
  if(roadHash(vec2(c,13.7))>.1+.55*brakeAt(c*7.0+3.5))continue;
  float t0=roadHash(vec2(c,4.1))*7.0,t=s-c*7.0-t0,len=min(10.0+roadHash(vec2(c,8.3))*22.0,27.5-t0);
  if(t<0.0||t>len)continue;
  float center=path+(roadHash(vec2(c,2.9))-.5)*3.0+(roadHash(vec2(c,6.2))-.5)*.04*t-bendK*(.4+.6*roadHash(vec2(c,9.4)))*min(.0015*t*t,1.5);
  float across=abs(abs(d-center)-.78),w=.22+.06*roadHash(vec2(c,1.3));
  float tyre=1.0-smoothstep(w*.5-.05,w*.5+px,across);
  // Tread grooves along the mark, and rubber laid unevenly along it.
  float tread=.78+.22*roadNoise(vec2(across*36.0,t*.5+c))*(1.0-smoothstep(.01,.03,px));
  float fade=smoothstep(0.0,3.5,t)*(1.0-smoothstep(.45,1.0,t/len))*(.55+.45*roadNoise(vec2(t*.3,c*1.7)));
  dark=max(dark,tyre*tread*fade*(.14+.16*roadHash(vec2(c,5.5))));
 }
 return dark;
}
// Launch marks on the grid (race-roster.js gridSlot): from each slot's rear wheels, short dark
// pairs straight ahead where the cars spun their tyres at the start. back: metres before the line.
float launchMarks(float back,float d,float px){
 if(back<-2.0||back>86.0)return 0.0;
 float dark=0.0,row0=floor((back-13.4)/8.0);
 for(int k=0;k<2;k++){
  float row=row0+float(k);if(row<0.0||row>7.0)continue;
  for(int side=0;side<2;side++){
   float slot=row*2.0+float(side),lane=side==1?2.2:-2.2;
   float t=12.0+row*8.0+float(side)*2.0+1.4-back,len=3.0+roadHash(vec2(slot,3.7))*6.0;
   if(t<0.0||t>len)continue;
   float across=abs(abs(d-lane-(roadHash(vec2(slot,1.9))-.5)*.25)-.78);
   float tyre=1.0-smoothstep(.1,.13+px,across);
   dark=max(dark,tyre*pow(1.0-t/len,1.4)*(.18+.22*roadHash(vec2(slot,8.1)))*(.7+.3*roadNoise(vec2(across*30.0,t*2.0+slot))));
  }
 }
 return dark;
}
// Crack sealant: black tar run into the cracks of older stretches. The cracks are the edges of
// warped cells drawn long along the lap (6 m x 1.8 m), so they run mostly across and along the
// road with short branches, broken where the noise drops them (about two thirds); 0.6-2.5 cm wide.
float crackSeal(vec2 road,float px){
 vec2 warp=vec2(roadNoise(road*vec2(.5,1.4)+4.1),roadNoise(road*vec2(.7,1.0)+9.3))-.5;
 vec2 q=(road+warp*vec2(1.1,.3))/vec2(6.0,1.8),cell=floor(q),f=fract(q);
 float f1=8.0,f2=8.0;
 for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
  vec2 o=vec2(float(i),float(j)),h=vec2(roadHash(cell+o+.17),roadHash(cell+o+3.71));
  float dist=length((o+.2+.6*h-f)*vec2(6.0,1.8));
  if(dist<f1){f2=f1;f1=dist;}else if(dist<f2)f2=dist;
 }
 float edge=(f2-f1)*.5,width=mix(.006,.025,pow(roadNoise(road*vec2(.6,2.2)+1.3),1.5));
 float broken=smoothstep(.52,.62,roadNoise(road*vec2(.32,.9)+6.6));
 return roadLine(edge,width,px)*broken;
}
`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
float d=vRoad.x, s=vRoad.y, width=vRoad.z;
vec2 road=vec2(s,d);
float viewDist=length(vViewPosition);
// Speed cue (setMotion): with the ground running past the camera, the lookups near it widen along
// the way it runs (roadMotion.xy, in map units) and the grain is drawn stretched along the lap.
float motionNear=roadMotion.z*(1.0-smoothstep(6.0,28.0,viewDist));
vec2 footX=dFdx(vMapUv),footY=dFdy(vMapUv),blurX=footX,blurY=footY;
float footDet=footX.x*footY.y-footX.y*footY.x;
if(motionNear>.001&&abs(footDet)>1e-12){
 // The screen direction the streak runs in, so the footprint grows along it and keeps its width across.
 vec2 streak=roadMotion.xy*motionNear,toScreen=vec2(streak.x*footY.y-streak.y*footY.x,footX.x*streak.y-footX.y*streak.x)/footDet;
 vec2 dir=toScreen/max(length(toScreen),1e-6);
 blurX=(footX*dir.x+footY*dir.y)*(1.0+motionNear)+streak;blurY=(footY*dir.x-footX*dir.y)*(1.0+motionNear*2.0);
}
// Patchiness at 4, 15 and 60 m in track coordinates: what the grain map no longer carries. The same
// three noises warp the scan and pick the grain's variants below, so those cost no more lookups.
float macroA=roadNoise(road*vec2(.25,.34)+vec2(3.7,1.1)),macroB=roadNoise(road*vec2(.067,.12)+vec2(8.2,5.3)),macroC=roadNoise(vec2(s*.0167,d*.05)+vec2(1.3,7.9));
float trackMacro=(.94+.12*macroA)*(.92+.16*macroB)*(.9+.2*macroC);
// Scanned race-track asphalt (fresh, near black) weathered to the grey of a circuit in
// the sun: contrast of the aggregate compressed around a lifted mean, a hint of its tint kept.
// A slow warp (a metre or so over 15-60 m, a few per cent of stretch) keeps its 2 m tile from lining up.
vec2 scanUv=vMapUv+(vec2(macroC,macroB)-.5)*vec2(1.6,.8);
vec3 fine=textureGrad(map,scanUv,blurX,blurY).rgb;
float fineL=max(dot(fine,vec3(.2126,.7152,.0722)),1e-4);
vec3 aggregate=vec3(.08*pow(fineL/.0137,.7))*mix(vec3(1.0),fine/fineL,.22)*vec3(${asphalt.tint.map(glsl).join(',')})*${glsl(asphalt.tone)};
// Coarse grain (asfalto_grao_v2, 6 m a tile, nothing in it longer than half a metre): stones that keep
// their contrast where the scan's millimetre detail has mipmapped to grey, the texture the eye
// follows at speed. Each lookup takes a random offset and turn from a noise over the road, and two
// of them cross-fade where it changes, keeping the contrast, so the tile never lines up again.
vec2 grainA=vMapUv*.3333,grainDx=blurX*.3333,grainDy=blurY*.3333;
// The noise is folded (fract) so the eight variants come up about equally often; variant 8 is variant 0
// again, so the fold leaves no seam.
float grainK=fract(macroA*2.7)*8.0,grainI=floor(grainK),grainF=fract(grainK),grainJ=mod(grainI+1.0,8.0);
vec4 varA=grainVariant(grainI),varB=grainVariant(grainJ);
mat2 rotA=mat2(varA.x,varA.y,-varA.y,varA.x),rotB=mat2(varB.x,varB.y,-varB.y,varB.x);
vec2 offA=varA.zw,offB=varB.zw;
// The same stones drawn twelve times longer along the lap, softer: streaks where the road runs past.
vec2 streakUv=vec2(d*.1667,s*.0139)+vec2(.37,.11),streakDx=dFdx(streakUv),streakDy=dFdy(streakUv);
#if ROAD_DETAIL > 0
float grainWb=smoothstep(.25,.75,grainF),grainWa=1.0-grainWb;
float grainTex=.5+((textureGrad(grainMap,rotA*grainA+offA,rotA*grainDx,rotA*grainDy).r-.5)*grainWa+(textureGrad(grainMap,rotB*grainA+offB,rotB*grainDx,rotB*grainDy).r-.5)*grainWb)/sqrt(grainWa*grainWa+grainWb*grainWb);
if(motionNear>.001)grainTex=mix(grainTex,.5+(textureGrad(grainMap,streakUv,streakDx,streakDy).r-.5)*.7,motionNear*.75);
#else
// One lookup: the nearer variant, and near the moving camera the streaked one, dithered in.
bool streaked=motionNear*.75>roadHash(floor(vec2(d*40.0,s*5.0))),useB=grainF>.5;
mat2 rotSel=useB?rotB:rotA;
float grainTex=textureGrad(grainMap,streaked?streakUv:rotSel*grainA+(useB?offB:offA),streaked?streakDx:rotSel*grainDx,streaked?streakDy:rotSel*grainDy).r;
if(streaked)grainTex=.5+(grainTex-.5)*.7;
#endif
// The map flattens as its mip level rises, so its contrast is given back as the footprint grows, by no
// more than a quarter (more read as salt and pepper in mid distance); close up, where a texel
// covers several pixels, the scan carries the detail and the grain steps back, unless it streaks.
vec2 grainPx=footX*.3333*2048.0,grainPy=footY*.3333*2048.0;
float grainMajor=max(length(grainPx),length(grainPy)),grainMinor=min(length(grainPx),length(grainPy));
float grainLod=log2(max(max(grainMajor/grainAnisotropy,grainMinor),1e-3));
float grain=(grainTex-.5)*min(.7*exp2(max(grainLod,0.0)*max(grainLod,0.0)*.045),1.25)*max(mix(.3,1.0,smoothstep(-1.5,.5,grainLod)),motionNear);
// Broad mottling survives speed; fade subpixel detail to prevent shimmering.
float detailFade=1.0-smoothstep(.08,.45,length(fwidth(vMapUv*3.4)));
// Lanes of different age along the lap (resurfacing), and gentle patchiness.
float laneAge=roadNoise(vec2(s*.0032,d*.025+1.7));
float wear=trackMacro*mix(.92,1.06,laneAge)*mix(1.0,.95+.1*roadNoise(vMapUv*3.4),detailFade);
float brake=brakeAt(s);
float path=vRoad.w+(roadNoise(vec2(s*.012,5.3))-.5)*.8;
float lateral=d-path;
// Rubbered racing line, darkest where the cars brake.
float rubber=exp(-pow(lateral/1.7,2.0))*(.24+.24*brake);
// Tyre tracks along the lap: fine darker and polished lines across the band the cars use, faded
// where they would be thinner than a pixel.
float acrossPixel=fwidth(d);
float streak=mix(.5,roadNoise(vec2(d*24.0,s*.12)),1.0-smoothstep(.25,.6,acrossPixel*24.0));
float tyreLines=0.0;
#if ROAD_DETAIL > 0
tyreLines=(roadNoise(vec2(d*11.0,s*.025))-.5)*(1.0-smoothstep(.3,.7,acrossPixel*11.0))+(roadNoise(vec2(d*27.0+3.0,s*.06))-.5)*.5*(1.0-smoothstep(.3,.7,acrossPixel*27.0));
#endif
rubber+=exp(-pow(lateral/2.9,2.0))*tyreLines*.22;
float tirePair=exp(-pow((abs(lateral)-.80)/.19,2.0));
rubber+=tirePair*(.06+.22*brake)*(.3+.7*streak);
#if ROAD_DETAIL > 1
rubber+=oldMarks(s,d,path,clamp(vRoad.w/max(width*.18,.1),-1.0,1.0),acrossPixel)*(1.0-smoothstep(.1,.3,acrossPixel));
#endif
// The grid's launch marks are dull black rubber: as dark as the line, but they keep the stones' roughness (a polished
// mark mirrored the low sun and read as pale paint behind the slots), with only a faint sheen.
float launch=0.0;
#if ROAD_DETAIL > 0
launch=launchMarks(s>${(L/2).toFixed(1)}?${L.toFixed(1)}-s:-s,d,acrossPixel)*(1.0-smoothstep(.1,.3,acrossPixel));rubber+=launch;
#endif
rubber=clamp(rubber,-.1,.8);
// Oil and fuel drips down the middle of the line, between the wheel tracks: few, faint and
// irregular, some drawn out by the speed.
float drop=0.0;
#if ROAD_DETAIL > 1
vec2 dropUv=vec2(s/1.7,lateral/.45),dropCell=floor(dropUv),dropAt=dropCell+.2+.6*vec2(roadHash(dropCell+3.1),roadHash(dropCell+7.9));
vec2 dropM=(dropUv-dropAt)*vec2(1.7/(1.0+2.5*roadHash(dropCell+9.7)),.45);
float dropRadius=(.02+.045*roadHash(dropCell+1.7))*(.7+.6*roadNoise(dropM*45.0+dropCell));
drop=step(roadHash(dropCell+5.3),.16)*(1.0-smoothstep(dropRadius*.4,dropRadius,length(dropM)))*(.4+.6*roadHash(dropCell+2.2));
drop*=exp(-pow(lateral/.55,2.0))*(1.0-smoothstep(.05,.18,fwidth(s)));
#endif
// Off the line: lighter, dusty, with rubber marbles thrown off the tyres.
float offLine=smoothstep(1.4,3.8,abs(lateral))*(1.0-smoothstep(width*.42,width*.5,abs(d)));
float marble=0.0;
#if ROAD_DETAIL > 1
vec2 marbleCell=floor(road*vec2(9.0,11.0));
marble=step(.965,roadHash(marbleCell))*offLine*detailFade*(1.0-smoothstep(.0,.35,length(fract(road*vec2(9.0,11.0))-.5)));
#endif
// Crack sealant ("tar snakes") on older stretches, about 15% of the Interlagos lap (10% of it outside
// the braking zones): dark, only a little smoother than the asphalt, so it never flashes in the sun.
float tar=0.0;
// Concrete stretches (meta.surface_zones): pale slabs 5 m long with sawn joints, rubber still dark on the line.
float concrete=clamp(${zoneSum(concreteZones(data),'slabZone',L)},0.0,1.0);
#if ROAD_DETAIL > 0
float tarZone=smoothstep(.76,.8,roadNoise(vec2(s*.011,3.3))+.12*brake+.1*concrete+${glsl(asphalt.tar)});
if(tarZone>.001)tar=crackSeal(road,max(acrossPixel,fwidth(s)))*tarZone*mix(.45,1.0,detailFade);
#endif
// Occasional thin sealed joints, with feathered edges and broken coverage.
float jointDistance=abs(fract((s+roadNoise(vec2(d*.45,3.0))*.9)/73.0)-.5)*73.0;
float joint=(1.0-smoothstep(.015,.065,jointDistance))*smoothstep(.28,.55,roadNoise(vec2(s*.1,d*.4)));
float edge=smoothstep(width*.34,width*.5,abs(d));
// Resurfaced patches: fresher, darker asphalt, each its own length (6-32 m) and width (1.6-4.2 m).
// Sawn, so the edges run straight with a slight drift; the tar over the joint is 2-7 cm wide and broken.
// Worked out only in the stretches that have one.
float section=floor(s/47.0),roadRepair=0.0,patchBorder=0.0,patchFs=max(fwidth(s),.02),patchFd=max(acrossPixel,.02);
if(roadHash(vec2(section,7.6))>=${glsl(1-asphalt.repair)}){
 float patchStart=3.0+8.0*roadHash(vec2(section,5.1)),patchEnd=patchStart+6.0+26.0*roadHash(vec2(section,6.3)),patchHalf=.8+1.3*roadHash(vec2(section,8.8));
 float along=mod(s,47.0),patchCenter=(roadHash(vec2(section,2.4))-.5)*2.0*max(width*.5-patchHalf-.3,0.0);
 float patchSide=abs(d-patchCenter)+(roadNoise(vec2(s*.21,section+3.7))-.5)*.05;
 roadRepair=smoothstep(patchStart-patchFs,patchStart+patchFs,along)*(1.0-smoothstep(patchEnd-patchFs,patchEnd+patchFs,along))*(1.0-smoothstep(patchHalf-patchFd,patchHalf+patchFd,patchSide));
 float tarBand=roadNoise(road*vec2(1.7,4.0));
 patchBorder=roadRepair*(1.0-smoothstep(.0,.02+.05*tarBand,min(min(along-patchStart,patchEnd-along),patchHalf-patchSide)))*(.45+.55*tarBand);
}
float seam=(1.0-smoothstep(.01,.045,abs(abs(d)-width*.24)))*(.4+.6*roadNoise(vec2(s*.13,d)));
// Rubber fills the grain on the line.
float grainTone=max(1.0+grain*3.5*(1.0-.6*clamp(rubber*2.5,0.0,1.0)),.2);
vec3 asphaltColor=aggregate*wear*grainTone*(1.0-rubber)*(1.0-joint*.3)*(1.0-roadRepair*.24)*(1.0-seam*.12)*(1.0-drop*.3);
// Paving passes and stretched aggregate give the eye a stable, metre-scale motion
// reference. Broad bands survive mipmapping; no screen-space speed lines are painted.
float pavingBand=roadNoise(vec2(d*.65,s*.006));
float roadFlow=roadNoise(vec2(d*3.8,s*.19));
asphaltColor*=mix(.92,1.07,pavingBand)*mix(.94,1.05,roadFlow);
// Pale grit collects at the shoulders, leaving a darker clean line through the bends.
float shoulder=smoothstep(width*.36,width*.49,abs(d));
asphaltColor=mix(asphaltColor,asphaltColor*vec3(1.3,1.22,1.1),shoulder*.55);
// Each slab is its own pour: tone, a warmer or cooler cast, tar-filled joints 1-3 cm wide, and now and
// then a crack running in from a corner.
// Only on concrete stretches: most circuits have none.
vec3 concreteColor=vec3(0.0);
if(concrete>.001){
 float slabLane=floor(d/max(width*.25,.5)+.5),slabRow=floor(s/5.0);
 vec2 slabId=vec2(slabRow,slabLane);
 float slabTone=.91+.18*roadHash(slabId+.31),slabCast=roadHash(slabId+4.7);
 float alongJoint=abs(fract(s/5.0+.5)-.5)*5.0,acrossJoint=abs(abs(d)-width*.25)+step(abs(d),.1)*9.0;
 float jointW=.01+.02*roadHash(vec2(slabRow,9.1)),laneW=.01+.02*roadHash(vec2(floor(s/23.0),slabLane+2.3));
 float slabJoint=max(roadLine(alongJoint,jointW,fwidth(s)),roadLine(acrossJoint,laneW,acrossPixel));
 vec2 corner=vec2(slabRow*5.0+step(.5,roadHash(slabId+6.1))*5.0,(slabLane+(roadHash(slabId+8.3)>.5?.5:-.5))*width*.25);
 vec2 toCorner=road-corner,crackDir=normalize(vec2(roadHash(slabId+2.9)-.5,roadHash(slabId+5.9)-.5)+1e-3);
 float crackAlong=dot(toCorner,crackDir),crackLen=.4+1.1*roadHash(slabId+7.3);
 float slabCrack=roadLine(abs(dot(toCorner,vec2(-crackDir.y,crackDir.x))+(roadNoise(vec2(crackAlong*6.0,slabRow))-.5)*.05),.008,acrossPixel)*step(0.0,crackAlong)*(1.0-smoothstep(crackLen*.7,crackLen,crackAlong))*step(.78,roadHash(slabId+1.1));
 slabJoint=max(slabJoint,slabCrack);
 concreteColor=vec3(.235,.222,.2)*slabTone*mix(vec3(1.035,1.0,.95),vec3(.965,.99,1.035),slabCast)*mix(1.0,trackMacro,.5)*mix(.95,1.04,laneAge)*(1.0+grain*.6)*(1.0-rubber*.75);
 concreteColor=mix(concreteColor,vec3(.035,.033,.031),slabJoint*.75);
}
asphaltColor=mix(asphaltColor,asphaltColor*vec3(1.1,1.07,1.0),offLine*.55);
asphaltColor=mix(asphaltColor,asphaltColor*vec3(1.16,1.1,.98),edge*.6);
asphaltColor=mix(asphaltColor,vec3(.02,.019,.018),max(max(tar*.72,patchBorder*.6),marble*.8));
asphaltColor=mix(asphaltColor,concreteColor,concrete);
diffuseColor.rgb*=asphaltColor;
// Rain: the soaked stones about half as bright; puddles where the broad noise dips, more at the shoulders and off
// the racing line (the cars' tyres clear their line), none on the concrete's joints.
float puddle=0.0;
if(roadWetness>0.0){
 float pond=roadNoise(vec2(d*.8+3.1,s*.07))*.62+roadNoise(vec2(d*2.6+7.7,s*.29))*.38;
 puddle=smoothstep(.5,.66,pond+shoulder*.12+offLine*.06-rubber*.4)*smoothstep(.35,.9,roadWetness);
 diffuseColor.rgb*=mix(1.0,.52,roadWetness)*(1.0-.3*puddle);
}
`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
// Open aggregate is matte (about .88); the rubbered line is darker and smoother (.68-.75), so the
// road sheens toward a low sun at grazing angles. Tar, oil and polished stones a little smoother.
#if ROAD_DETAIL > 0
float fineRough=textureGrad(roughnessMap,scanUv,blurX,blurY).g;
#else
float fineRough=.83;
#endif
// Seen at a grazing angle only the polished tops of the stones show, so the far road is a little smoother.
float roughnessFactor=clamp(.6+.34*fineRough-clamp((rubber-launch)*3.0,0.0,1.0)*.2-launch*.05-tar*.12-roadRepair*.06+edge*.04+concrete*.04-grain*.1-drop*.2-.12*smoothstep(15.0,80.0,viewDist),.45,1.0);
// Wet: a film of water over the stones (about .3), the puddles near mirrors.
roughnessFactor=mix(roughnessFactor,mix(.3+.12*fineRough,.05,puddle),roadWetness);
`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
#if ROAD_DETAIL > 0
vec3 asphaltN=textureGrad(normalMap,scanUv,blurX,blurY).xyz*2.0-1.0;
asphaltN.xy*=normalScale*(1.0-.75*max(tar,rubber*.6));
// Mipmapped normals gradually flatten in the distance instead of making sparkling
// bright pixels on grazing highlights. Ultra retains a little more nearby aggregate.
float normalFootprint=length(fwidth(vNormalMapUv))*2048.0;
asphaltN.xy*=1.0-smoothstep(8.0,96.0,normalFootprint)*.7;
// Standing water is flat: the stones under a puddle no longer break up its reflection.
asphaltN.xy*=1.0-puddle*.9;
// The drops' rings on the standing water: one ring at a time per 45 cm cell, each at its own moment and place,
// spreading over a third of a second and smoothing out; faded with distance (the pixel would only sparkle).
if(roadRain>0.0&&puddle>.05){
 vec2 rp=vec2(d,s)*2.2,rid=floor(rp),rf=fract(rp)-.5;
 float ph=fract(roadTime*1.7+roadHash(rid+1.3)),rad=ph*.42;
 vec2 rv=rf-(vec2(roadHash(rid+3.1),roadHash(rid+5.7))-.5)*.4;float rr=length(rv);
 float ring=sin((rr-rad)*55.0)*smoothstep(.07,0.0,abs(rr-rad))*(1.0-ph)*(1.0-smoothstep(10.0,30.0,viewDist));
 asphaltN.xy+=rv/max(rr,1e-3)*ring*.45*puddle*roadRain;
}
normal=normalize(tbn*asphaltN);
#endif
`);
  carShadowPatch(shader);
 };
 material.customProgramCacheKey=()=> 'opala-track-asphalt-circuit-v10-'+(data.meta.id||'interlagos')+'-'+material.defines.ROAD_DETAIL;
 const probe=new TestCar(data),length=data.meta.reconstructed_xy_m;
 const stats={texture:'assets/texturas/asfalto_diff_v3.jpg',normal:'assets/texturas/asfalto_nor_gl_v3.jpg',roughness:'assets/texturas/asfalto_rough_v3.jpg',grain:'assets/texturas/asfalto_grao_v2.jpg',grainTileMetres:6,grainTiling:'stochastic',asphalt,resolution:2048,tileMetres:2,anisotropy:texture.anisotropy,vertices:0,wear:'decorative',pbr:true,motion:0};
 function setQuality(value){
  const level=trackQuality(value),detail=TRACK_DETAIL[level],aniso=Math.min(detail.anisotropy,maxAnisotropy);
  for(const target of materials){
   if(target.defines?.ROAD_DETAIL!==detail.shader){
    target.defines={...target.defines,ROAD_DETAIL:detail.shader};
    target.normalMap=detail.shader?normalMap:null;target.roughnessMap=detail.shader?roughnessMap:null;
    target.needsUpdate=true;
   }
   // Preserve ownership for circuit cleanup even when a low preset detaches these maps.
   target.grainMap=grainMap;target.detailNormalMap=normalMap;target.detailRoughnessMap=roughnessMap;
   target.normalScale.setScalar(detail.normal);
  }
  for(const map of [texture,normalMap,roughnessMap,grainMap])if(map.anisotropy!==aniso){map.anisotropy=aniso;map.needsUpdate=true;}
  grainAnisotropy.value=aniso;stats.quality=level;stats.anisotropy=aniso;stats.detail=detail.shader;
 }
 setQuality(quality);
 // MeshStandardMaterial.clone() resets custom defines and does not copy shader hooks.
 // Keep the pit-lane variant registered so it also follows live quality changes.
 function cloneMaterial(options={}){
  const copy=material.clone();copy.setValues(options);copy.onBeforeCompile=material.onBeforeCompile;copy.customProgramCacheKey=material.customProgramCacheKey;
  materials.add(copy);copy.addEventListener('dispose',()=>materials.delete(copy));setQuality(stats.quality);return copy;
 }
 function geometry(source){
  const g=source.index?source.toNonIndexed():source;
  if(g!==source)source.dispose();
  const pos=g.attributes.position,uv=new Float32Array(pos.count*2),coords=new Float32Array(pos.count*4);
  for(let i=0;i<pos.count;i++){
   const x=pos.getX(i),z=pos.getZ(i),p=probe.sample(x,-z);probe.index=p.i;
   const a=data.samples[(p.i-18+probe.n)%probe.n],b=data.samples[(p.i+18)%probe.n];
   const bend=wrap(Math.atan2(b[8],b[7])-Math.atan2(a[8],a[7]));
   const path=clamp(bend*1.2,-1,1)*p.width*.18;
   uv.set([x/2,z/2],i*2);coords.set([p.d,p.s,p.width,path],i*4);
  }
  // Do not interpolate a whole lap of wear patterns across the closing triangle.
  for(let i=0;i<pos.count;i+=3){
   const ss=[coords[i*4+1],coords[(i+1)*4+1],coords[(i+2)*4+1]];
   if(Math.max(...ss)-Math.min(...ss)>length/2)for(let j=0;j<3;j++)if(ss[j]<length/2)coords[(i+j)*4+1]+=length;
  }
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setAttribute('roadData',new THREE.BufferAttribute(coords,4));
  stats.vertices+=pos.count;return g;
 }
 // Speed cue with no extra pass (the shader's roadMotion): the ground's speed past the camera,
 // eased over 0.15 s, stretches the asphalt near it along the way it runs. It follows the camera,
 // not the car, so a pause, a still TV camera or a cut leaves the road sharp. strength: 0 (off) .. 1.
 const lastEye=new THREE.Vector3(),eyeVelocity=new THREE.Vector2(),SHUTTER=1/60;let hasEye=false;
 function setMotion(camera,dt,strength=1){
  const p=camera.position,v=roadMotion.value;
  if(!(dt>0)||!hasEye){eyeVelocity.set(0,0);v.set(0,0,0);lastEye.copy(p);hasEye=!!camera;stats.motion=0;return;}
  const vx=(p.x-lastEye.x)/dt,vz=(p.z-lastEye.z)/dt;lastEye.copy(p);
  // Faster than any car (a reposition or a camera cut): start again from rest.
  if(Math.hypot(vx,vz)>120)eyeVelocity.set(0,0);else eyeVelocity.lerp({x:vx,y:vz},1-Math.exp(-dt/.15));
  const speed=eyeVelocity.length(),weight=strength*THREE.MathUtils.smoothstep(speed,12,45);
  // The map units are world metres / 2.
  v.set(eyeVelocity.x*SHUTTER*.5,eyeVelocity.y*SHUTTER*.5,weight);stats.motion=+weight.toFixed(3);
 }
 // Rain on the road (weather.js wetness): shared by every circuit's asphalt and the kerbs (ROAD_WEATHER).
 function setWetness(value,rain=value){ROAD_WEATHER.roadWetness.value=Math.max(0,Math.min(1,value||0));ROAD_WEATHER.roadRain.value=Math.max(0,Math.min(1,rain||0));stats.wetness=ROAD_WEATHER.roadWetness.value;}
 // The rings' clock (seconds; the game's, so a pause holds them).
 function tickRain(dt){ROAD_WEATHER.roadTime.value=(ROAD_WEATHER.roadTime.value+dt)%1000;}
 return {material,geometry,setQuality,cloneMaterial,setMotion,setWetness,tickRain,stats};
}
