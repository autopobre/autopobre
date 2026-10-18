import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {TestCar,wrap,guardrailSections,guardrailClearance} from './physics.js';
import {sceneryBands,bandClearance} from './track-clearance.js';
import {canvasTexture} from './pit-textures.js';
import {createPeople} from './pit-crew.js';
import {circuitSponsors,circuitSeed,seeded,paintBanner,paintBannerAlt} from './sponsors.js';
import {billboardSpots} from './track-surface.js';
import {barrierLines,barrierAt,jerseyFace,WALL_SINK} from './street-walls.js';
import {splitByCells} from './perf-probe.js';

// What makes a circuit look run by people on race day: sponsor banners tied to the
// guardrails, marshal posts with their flags, and TV camera towers on the outside of
// the corners (which the TV camera also films from). Sponsors are fictional, taken
// from the game's own world. Game art, not a survey of the real circuit.

// The trackside people's skin and hair tones.
const SKINS=[0xc68e6a,0x8d5a3b,0xe0b08f,0x6b4128,0xd9a37f,0xb77a55,0xf0c8a8,0x4a2c1d],HAIR=[0x2b1f17,0x1b1410,0x5a3a22,0x8a6a4a,0xbab4ab,0x111111];
// Banners: lengths (m) of the tiles a run is made of, their height on the rail and how far in front of its line (the
// W-beam's ridges stand 0.10 m out of it: a banner lies 2 cm off them).
const BANNER_TILE=[4.8,10.6],BANNER_LOW=.37,BANNER_HIGH=.87,BANNER_FRONT=.118;
// The artwork's own length (an atlas row is 16:1 on a half-metre banner): a longer banner shows it at this length
// with its field carried on at both ends, a shorter one squeezes it.
const BANNER_ART=8;
// On a street circuit's concrete wall (street-walls.js) a banner lies on the upper face of the Jersey profile, the plane
// that leans back 9 cm from 0.33 m to the top at 0.81 m: from WALL_LOW to WALL_HIGH in the wall's own heights,
// WALL_GAP in front of the face. (Hung at the rail's height and in front of the wall's foot, as on a rail, it stood
// 0.34 to 0.41 m off the face and over the top.)
const WALL_LOW=.335,WALL_HIGH=.805,WALL_GAP=.02;
// Two rows of the atlas per sponsor of the circuit (sponsors.js), its main banner and its reversed
// one: the Old Stock one names the circuit it hangs at (meta.name, set by main.js), the local
// businesses are the city's own. 64 px rows: about as sharp across a 0.5 m banner as along it.
const bannerRow=(row,alt)=>row*2+(alt?1:0);
function bannerAtlas(sponsors){
 return canvasTexture((ctx,w,h)=>{const rowH=h/(sponsors.length*2);sponsors.forEach((s,i)=>{paintBanner(ctx,0,bannerRow(i,0)*rowH,w,rowH,s);paintBannerAlt(ctx,0,bannerRow(i,1)*rowH,w,rowH,s);});},1024,sponsors.length*2*64);
}
// Each banner weathered its own way (per-tile attributes): road dirt up from the bottom edge to its
// own height, with splashes; the sun's bleaching; a torn-off top corner on a few.
function bannerMaterial(map){
 const material=new THREE.MeshStandardMaterial({name:'Faixas_patrocinio',map,roughness:.62,side:THREE.DoubleSide,vertexColors:true,polygonOffset:true,polygonOffsetFactor:-1});
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 aTile;\nattribute vec4 aWear;\nvarying vec3 vTile;\nvarying vec4 vWear;').replace('#include <begin_vertex>','#include <begin_vertex>\nvTile=aTile;vWear=aWear;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vTile;
varying vec4 vWear;
float tileHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float tileNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(tileHash(i),tileHash(i+vec2(1,0)),f.x),mix(tileHash(i+vec2(0,1)),tileHash(i+1.0),f.x),f.y);}`)
   .replace('#include <map_fragment>',`#include <map_fragment>
 {
  // vTile: metres along the banner, height on it (0 bottom, 1 top), sun fade. vWear: dirt, its reach, tear, seed.
  float x=vTile.x,v=vTile.y,seed=vWear.w;
  if(vWear.z>0.0){float e=fract(seed*7.1)<.5?x:vWear.z-x,jag=tileNoise(vec2(x*9.0,seed*31.0));if(e<1.4&&v>.25+e*.55+jag*.18)discard;}
  float grey=dot(diffuseColor.rgb,vec3(.3,.59,.11));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(grey)*1.06+.07,vTile.z*.55);
  float dirt=(1.0-smoothstep(0.0,vWear.y,v+.12*(tileNoise(vec2(x*1.3,seed*17.0))-.5)))*vWear.x*(.55+.45*tileNoise(vec2(x*2.7,v*3.0+seed*9.0)));
  dirt+=smoothstep(.72,.95,tileNoise(vec2(x*11.0,v*7.0+seed*41.0)))*(1.0-v)*vWear.x*.8;
  diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.23,.19,.14),clamp(dirt,0.0,.85));
 }`);
 };
 material.customProgramCacheKey=()=>'faixas-patrocinio-v2';return material;
}

// Vertex-coloured parts merged into one mesh.
function tinted(geometry,color,matrix){
 const g=(geometry.index?geometry.toNonIndexed():geometry).applyMatrix4(matrix);g.deleteAttribute('uv');
 const c=new THREE.Color(color),n=g.attributes.position.count,rgb=new Float32Array(n*3);for(let i=0;i<n;i++)rgb.set([c.r,c.g,c.b],i*3);
 g.setAttribute('color',new THREE.BufferAttribute(rgb,3));return g;
}
const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),S=new THREE.Vector3(1,1,1),P=new THREE.Vector3(),Y=new THREE.Vector3(0,1,0);
const place=(x,y,z,yaw=0,scale=[1,1,1])=>M.clone().compose(P.set(x,y,z),Q.clone().setFromAxisAngle(Y,yaw),S.clone().set(...scale));

export function trackPoint(data,s){
 const a=data.samples,L=data.meta.reconstructed_xy_m;s=((s%L)+L)%L;let lo=0,hi=a.length-1;
 while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(a[mid][0]<=s)lo=mid;else hi=mid-1;}return {p:a[lo],i:lo};
}
function heading(p){return Math.atan2(p[8],p[7]);}
// Signed bend (rad per metre) around s: positive turns left. Also places the flags, rods and brake boards (trackside-flags.js).
export function bend(data,s,span=22){return wrap(heading(trackPoint(data,s+span).p)-heading(trackPoint(data,s-span).p))/(2*span);}

// Outside of the sharper corners, clear of roads, pits and stands.
const towerCache=new WeakMap();
// (Pure in the track data, asked for by many modules: worked out once per data and count.)
export function towerSpots(data,count=9){
 let cached=towerCache.get(data);if(!cached)towerCache.set(data,cached=new Map());
 if(!cached.has(count))cached.set(count,findTowerSpots(data,count));
 return cached.get(count);
}
function findTowerSpots(data,count){
 const L=data.meta.reconstructed_xy_m,bands=sceneryBands(data),candidates=[];
 for(let s=0;s<L;s+=6)candidates.push({s,k:bend(data,s)});
 candidates.sort((a,b)=>Math.abs(b.k)-Math.abs(a.k));
 const spots=[];
 for(const c of candidates){
  if(spots.length>=count)break;
  if(spots.some(t=>{const d=Math.abs(t.s-c.s);return Math.min(d,L-d)<260;}))continue;
  const side=c.k>0?-1:1;let spot=null;
  for(const shift of [0,-15,15,-30,30])for(const out of [17,23,30]){
   const s=c.s+shift,{p}=trackPoint(data,s),off=side*(p[4]/2+out),x=p[1]-p[8]*off,y=p[2]+p[7]*off;
   if(bandClearance(bands,x,y).distance>7){spot={s,side,x,y,p};break;}
  }
  if(spot)spots.push(spot);
 }
 return spots.sort((a,b)=>a.s-b.s);
}
// The marshal posts of a circuit (createTrackside builds them; multiplayer.js waves the yellow flag
// from them): found once per circuit's data.
const marshalCache=new WeakMap();
export function marshalSpots(data){
 if(!marshalCache.has(data))marshalCache.set(data,Object.freeze(findMarshalSpots(data)));
 return marshalCache.get(data);
}
function findMarshalSpots(data){
 const L=data.meta.reconstructed_xy_m,bands=sceneryBands(data),spots=[];
 // A post every 360 m or so (each one up to 30 m off the beat, per circuit), on alternate sides, and
 // never under a billboard: a post that cannot keep 25 m from one stands where the old rule put it.
 const boards=billboardSpots(data),rand=seeded(circuitSeed(data.meta?.id)+360);
 // Never in the mouth of a side street opened to roam the city (meta.roam's gaps in the walls).
 const gaps=(data.meta.roam?.zones??[]).flatMap(z=>z.gaps),open=(s,side)=>gaps.some(g=>g.side===side&&s>g.s0-8&&s<g.s1+8);
 for(let s=140,k=0;s<L-60;s+=360,k++){
  const jitter=(rand()-.5)*60;
  // On a plateau's rim (Chapada dos Sonhos) the abyss side has no ground for a post: it stands on the other side.
  for(const side of [k%2?1:-1,k%2?-1:1]){
   let fallback=null,placed=false;
   for(const shift of [0,20,-20,40,-40]){
    const at=((s+jitter+shift)%L+L)%L,{p}=trackPoint(data,at),off=side*(p[4]/2+guardrailClearance(data,p[0],side)+2.6),x=p[1]-p[8]*off,y=p[2]+p[7]*off;
    if(bandClearance(bands,x,y).distance<=2.5||open(p[0],side))continue;
    const spot={s:at,side,x,y,p};fallback??=spot;
    if(boards.every(b=>Math.hypot(b.x-x,b.y-y)>25)){fallback=null;spots.push(spot);placed=true;break;}
   }
   if(fallback){spots.push(fallback);placed=true;}
   if(placed||!data.scenery?.cliff)break;
  }
 }
 return spots;
}

// Where the rail banners hang, found once per track data (pure: the Node check testar_beira.mjs reads
// it): runs of one to three banners tied side by side, each run its own banner length (4.8-10.6 m), mostly one
// sponsor (half of them alternate two, and an odd one slips in); an alternating pair takes a third sponsor every two
// or three banners and never do three of one sponsor hang side by side, so no rail reads as a stamped row. Every banner
// sits a little higher or lower, has its own dirt, fading and gap to the next, and now and then one is missing, hangs
// loose by a corner or has its top corner torn off. Local businesses hang more of them than the national names.
// alt: the sponsor's reversed banner (paintBannerAlt): some runs all one or the other, most mixed.
const bannerPlans=new WeakMap();
export function bannerPlan(data){
 if(bannerPlans.has(data))return bannerPlans.get(data);
 const L=data.meta.reconstructed_xy_m,sponsors=circuitSponsors(data.meta.id,data.meta.name??'Interlagos'),ROWS=sponsors.length,rand=seeded(circuitSeed(data.meta.id)+91),banners=[];
 const weights=sponsors.map(s=>s.region==='br'?.55:1),total=weights.reduce((u,v)=>u+v,0);
 const pickRow=(...not)=>{for(;;){let r=rand()*total,k=0;while(r>weights[k]&&k<ROWS-1)r-=weights[k++];if(!not.includes(k))return k;}};
 // Its own stream, so the variants leave the rest of the plan as it was.
 const flip=seeded(circuitSeed(data.meta.id)+313);let mix=.5;
 let runs=0,metres=0;
 const hang=(side,s0,s1,row)=>{const rip=rand()<.035;banners.push({side,s0,s1,row,alt:flip()<mix?1:0,lift:(rand()-.5)*.05,drop:(rand()-.5)*.04,fade:rand()**1.6,bright:.82+.22*rand(),dirt:.15+.75*rand()**1.4,reach:.22+.4*rand(),seed:rand(),rip,hangs:!rip&&rand()<.045?(rand()<.5?-1:1):0});};
 for(const side of [-1,1])for(const [from,end] of guardrailSections(data,side)){
  // The sponsor last hung next to here and how many of it in a row (a bare stretch breaks the row).
  const to=Math.min(end,L);let last=-1,repeat=0;
  for(let s=from+8+rand()*6;s<to-8;){
   const tile=BANNER_TILE[0]+(BANNER_TILE[1]-BANNER_TILE[0])*rand(),len=tile*(1+Math.floor(rand()*3)),stop=Math.min(to-8,s+len);
   if(rand()<.72&&stop-s>tile*.9){
    const a0=pickRow(last),b0=rand()<.45?pickRow(a0,last):-1,m=flip();let k=0,third=2+Math.floor(rand()*2);mix=m<.3?0:m<.45?1:.5;
    for(let t=s;t<stop-1;k++){
     const end=Math.min(stop,t+tile);
     let row=rand()<.1?pickRow(a0):b0>=0&&k%2?b0:a0;
     if(b0>=0&&k===third){row=pickRow(a0,b0);third+=2+Math.floor(rand()*2);}
     if(row===last&&repeat>=2)row=pickRow(row);
     // One banner in sixteen is missing: bare rail where it hung.
     if(rand()>.06){hang(side,t,end,row);repeat=row===last?repeat+1:1;last=row;}else{last=-1;repeat=0;}
     t=end+(rand()<.6?.04+.2*rand():0);
    }
    metres+=stop-s;runs++;
   }else{last=-1;repeat=0;}
   s=stop+(rand()<.66?.3+1.3*rand():tile*.8);
  }
 }
 const plan={sponsors,banners,runs,metres};bannerPlans.set(data,plan);return plan;
}

export function createTrackside(data){
 const root=new THREE.Group();root.name='Beira_de_pista';
 // Ground under a point beside the track: start the search from its track sample.
 const probe=new TestCar(data),ground=(x,y,i=probe.index)=>{probe.index=i;const q=probe.sample(x,y);probe.index=q.i;return q.z;};
 const parts=[],people=[];

 // Sponsor banners on the track face of the guardrails and walls (bannerPlan): each banner its own strip, on the
 // barrier's own line (street-walls.js barrierLines) and at its stations, so it lies along the barrier's facets.
 const positions=[],uvs=[],colors=[],tiles=[],wears=[],indices=[],lines=barrierLines(data),wall=data.meta.barrier==='street';
 const plan=bannerPlan(data),sponsors=plan.sponsors,ROWS=sponsors.length*2,tint=new THREE.Color();
 for(const b of plan.banners){
  const {side,s0,s1,fade,bright,dirt,reach,seed,rip,hangs,lift,drop}=b,row=bannerRow(b.row,b.alt),v0=1-(row+.96)/ROWS,v1=1-(row+.04)/ROWS,len=s1-s0,base=positions.length/3;
  const line=lines[side].find(l=>s0>=l.from-1e-6&&s1<=l.to+1e-6)?.stations;if(!line)continue;
  // Sun fade and a warm cast with it; a loose one sags and billows out from the rail at its free corner.
  tint.setRGB(bright,bright*(1-.03*fade),bright*(1-.09*fade));
  // Its stations: its two ends and the barrier's own between them (every half metre too on a loose one, for the sag).
  // A banner longer than its artwork carries its field on at both ends (a station where the artwork starts and ends).
  const pad=Math.max(0,(len-BANNER_ART)/2),inner=line.map(q=>q.s);if(hangs)for(let t=s0+.5;t<s1;t+=.5)inner.push(t);if(pad>.05)inner.push(s0+pad,s1-pad);
  const stations=[s0];for(const t of inner.filter(t=>t>s0+.03&&t<s1-.03).sort((u,v)=>u-v))if(t-stations.at(-1)>.03)stations.push(t);stations.push(s1);
  stations.forEach((t,count)=>{
   const w=barrierAt(line,t),e=hangs<0?t-s0:s1-t,sag=hangs&&e<1.6?(1-e/1.6)**2:0,f=Math.min(1,Math.max(0,(t-s0-pad)/(len-2*pad))),u=side>0?f:1-f;
   // Its bottom and top edges: up from the barrier's ground and out from its foot (negative: in front of it). On a
   // wall the jitter of the banner's height stays within the face.
   const z=wall?w.z-WALL_SINK:w.z,lo=wall?WALL_LOW+(drop+.02)*.25+sag*.12:BANNER_LOW+drop+sag*.12,hi=wall?WALL_HIGH+(lift-.025)*.2-sag*.3:BANNER_HIGH+lift-sag*.3;
   const out=h=>(wall?jerseyFace(h)-WALL_GAP:-BANNER_FRONT)-sag*.09,o0=out(lo),o1=out(hi);
   positions.push(w.x+w.ox*o0,z+lo,-(w.y+w.oy*o0),w.x+w.ox*o1,z+hi,-(w.y+w.oy*o1));uvs.push(u,v0,u,v1);
   for(const h of [0,1]){colors.push(tint.r,tint.g,tint.b);tiles.push(side>0?t-s0:s1-t,h,fade);wears.push(dirt,reach,rip?len:0,seed);}
   if(count>0){const k=base+(count-1)*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
  });
 }
 const bannerGeometry=new THREE.BufferGeometry();bannerGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));bannerGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
 bannerGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));bannerGeometry.setAttribute('aTile',new THREE.Float32BufferAttribute(tiles,3));bannerGeometry.setAttribute('aWear',new THREE.Float32BufferAttribute(wears,4));
 bannerGeometry.setIndex(indices);bannerGeometry.computeVertexNormals();
 // In pieces of 600 m (perf-probe.js splitByCells): one mesh round a whole lap was drawn whole in every view (Pampulha's
 // 20 km: some 3 thousand banners).
 const bannerMat=bannerMaterial(bannerAtlas(sponsors)),pieces=splitByCells(bannerGeometry,600);
 for(const piece of pieces){const banners=new THREE.Mesh(piece,bannerMat);banners.name='Faixas_nos_guardrails';banners.receiveShadow=true;root.add(banners);}
 if(pieces.length>1)bannerGeometry.dispose();

 // Marshal posts, no two alike: a roofed cabin, an open deck under a beach umbrella or a little
 // concrete hut, roofs in the post's own colour, an extinguisher, a stool or a radio mast, and one or
 // two marshals in the uniform, skin, hair and stance of their own.
 const marshals=marshalSpots(data),pick=seeded(circuitSeed(data.meta.id)+7),one=list=>list[Math.floor(pick()*list.length)];
 const person=(top,bottom,extra={})=>({top,bottom,skin:one(SKINS),hair:one(HAIR),hairStyle:one(['short','short','curly','bald','bun']),belly:pick()<.35?.3+.5*pick():0,mustache:pick()<.2,glasses:pick()<.15,...extra});
 const uniform=()=>{const r=pick();return r<.4?person(0xe8702a,0xe8702a,{trim:0xf4f1ea,hat:'cap',hatColor:0xf4f1ea,hands:0x2b2b2b})
  :r<.65?person(0xf26b1d,one([0x2d3a4a,0x3a3f45,0x1b2a4a]),{hat:pick()<.5?'cap':null,hatColor:0xf26b1d,sleeves:pick()<.5?'short':'long'})
  :r<.85?person(0xeeeeea,0xeeeeea,{trim:0xe8702a,hat:pick()<.6?'cap':null,hatColor:0xe8702a})
  :person(0xc8e830,0x2d3a4a,{trim:0xb9bdb6,hat:'cap',hatColor:0x2d3a4a});};
 for(const m of marshals){
  // Local +x looks at the track (data x/y plane); three.js turns by the same angle about y.
  const z=ground(m.x,m.y,trackPoint(data,m.s).i),yaw=Math.atan2(-m.side*m.p[7],m.side*m.p[8]);
  const at=(dx,dz,dy=0)=>{const c=Math.cos(yaw),s=Math.sin(yaw);return [m.x+dx*c-dz*s,z+dy,-(m.y+dx*s+dz*c)];};
  const box=(w,h,d,dx,dz,dy,color)=>{const [x,y,zz]=at(dx,dz);parts.push(tinted(new THREE.BoxGeometry(w,h,d),color,place(x,y+dy,zz,yaw)));};
  const pole=(r0,r1,h,dx,dz,dy,color)=>{const [x,y,zz]=at(dx,dz);parts.push(tinted(new THREE.CylinderGeometry(r0,r1,h,6),color,place(x,y+dy,zz)));};
  const kind=pick(),roof=one([0xe8702a,0xe8702a,0xe9ebe7,0xc0392b,0xe8b42a]),side=pick()<.5?-1:1;
  if(kind<.45){
   box(1.5,.12,2.2,-1.3,0,.06,0x6d6f6c);for(const [dx,dz] of [[-.7,-1],[-.7,1],[.7,-1],[.7,1]])pole(.035,.035,2.2,-1.3+dx,dz,1.16,0xd9dcd8);
   box(1.7,.08,2.4,-1.3,0,2.3,roof);box(.05,1.1,2.2,-2.02,0,.7,0xe9ebe7);
  }else if(kind<.75){
   box(1.6,.1,1.8,-1.2,0,.05,0x8a6a4a);pole(.025,.025,2.4,-1.4,side*.4,1.2,0xcfcfcf);
   const [ux,uy,uz]=at(-1.4,side*.4);parts.push(tinted(new THREE.ConeGeometry(1.25,.42,10,1,true),roof,place(ux,uy+2.45,uz)));
  }else{
   box(1.4,2.15,1.9,-2.1,0,1.075,0xb8b5ad);box(1.7,.1,2.2,-2.0,0,2.2,roof);box(.03,.7,1.2,-1.39,0,1.35,0x30373b);
  }
  if(pick()<.7){pole(.08,.08,.5,-.9,-side*1.1,.25,0xc0221a);pole(.03,.03,.08,-.9,-side*1.1,.54,0x1b1d20);}
  const stool=pick()<.4;if(stool){pole(.17,.17,.05,-.7,side*.95,.62,0x2a2d30);pole(.025,.025,.6,-.7,side*.95,.3,0x9ea4a6);}
  if(kind<.45&&pick()<.35)pole(.015,.015,3.2,-2,-1.05,2.6,0x9ea4a6);
  // Yellow flag held out toward the track: its cloth flies with the wind of the cars (trackside-flags.js).
  const [fx,fy,fz]=at(.28,.28);parts.push(tinted(new THREE.CylinderGeometry(.012,.012,1.2,5),0x2b2b2b,place(fx,fy+1.35,fz)));
  // He follows the cars with his eyes, calls on the radio, shifts his weight (pit-crew.js); a second
  // one keeps him company, on the stool or standing back by the shelter.
  people.push({outfit:uniform(),pose:one(['rest','rest','folded','stand']),idle:'marshal',x:m.x,y:z,z:-m.y,yaw:yaw+(pick()-.5)*.4});
  if(pick()<.45){const [x,y,zz]=at(stool?-.7:-.95,side*(stool?.95:1.05));people.push({outfit:uniform(),pose:stool?'stool':one(['folded','stand','rest']),idle:stool?'seated':'marshal',x,y:y+(stool?.02:0),z:zz,yaw:yaw+(pick()-.5)*.8});}
 }

 // TV towers: a scaffold of its own height and paint, a deck with rails, a cameraman under a coloured
 // umbrella (and now and then a second crewman), a sponsor's tarp round the base, a generator or a
 // cable reel on the ground.
 const towers=towerSpots(data).map(t=>{
  const {p,i}=trackPoint(data,t.s),z=ground(t.x,t.y,i),deck=3.6+2.8*pick(),look=Math.atan2(p[2]-t.y,p[1]-t.x);
  const steel=one([0xb9bec0,0xb9bec0,0xd8a425,0x2f5d8a,0x9b3b2f]),brace=new THREE.Color(steel).multiplyScalar(.92).getHex(),shade=one([0xf2efe7,0xc0392b,0x2b5fa8,0xf0c419,0x2e7d4f]);
  for(const [dx,dz] of [[-.9,-.9],[-.9,.9],[.9,-.9],[.9,.9]])parts.push(tinted(new THREE.CylinderGeometry(.045,.045,deck+1.1,6),steel,place(t.x+dx,z+(deck+1.1)/2,-t.y+dz)));
  for(let h=1.2;h<deck;h+=1.15)for(const [dx,dz,r] of [[0,-.9,0],[0,.9,0],[-.9,0,Math.PI/2],[.9,0,Math.PI/2]]){
   const bar=new THREE.CylinderGeometry(.025,.025,2.55,5).rotateZ(Math.PI/4);parts.push(tinted(bar,brace,place(t.x+dx,z+h+.55,-t.y+dz,r)));
  }
  parts.push(tinted(new THREE.BoxGeometry(2.2,.1,2.2),0x7b7f7c,place(t.x,z+deck,-t.y)));
  for(const [dx,dz,r] of [[0,-1.08,0],[0,1.08,0],[-1.08,0,Math.PI/2],[1.08,0,Math.PI/2]])parts.push(tinted(new THREE.BoxGeometry(2.2,.05,.05),0xd6d8d4,place(t.x+dx,z+deck+1,-t.y+dz,r)));
  // The tarp on the two sides that face the track, in a sponsor's colour.
  const tarp=new THREE.Color(one(sponsors).bg).getHex();for(const [dx,dz,r] of [[Math.cos(look)*.93,-Math.sin(look)*.93,look],[-Math.sin(look)*.93,-Math.cos(look)*.93,look+Math.PI/2]])parts.push(tinted(new THREE.BoxGeometry(.03,.95,1.86),tarp,place(t.x+dx,z+.75,-t.y+dz,r)));
  if(pick()<.6)parts.push(tinted(new THREE.BoxGeometry(.9,.6,.6),one([0xe8702a,0x2a2d30,0xd8a425]),place(t.x-Math.cos(look)*1.9,z+.3,-t.y+Math.sin(look)*1.9+.6,look)));
  if(pick()<.5)parts.push(tinted(new THREE.CylinderGeometry(.36,.36,.26,12).rotateX(Math.PI/2),0x2b2b2b,place(t.x-Math.sin(look)*1.7,z+.36,-t.y-Math.cos(look)*1.7,look)));
  // Tripod aimed at the track and a big umbrella behind it. The camera head pans on the tripod
  // with its cameraman, who films the nearest car (pit-crew.js).
  const cx=t.x+Math.cos(look)*.5,cz=-t.y-Math.sin(look)*.5,ux=t.x-Math.cos(look)*.75,uz=-t.y+Math.sin(look)*.75;
  parts.push(tinted(new THREE.CylinderGeometry(.03,.09,1.25,5),0x222222,place(cx,z+deck+.66,cz)));
  parts.push(tinted(new THREE.CylinderGeometry(.02,.02,2.3,5),0xcfcfcf,place(ux,z+deck+1.15,uz)));
  parts.push(tinted(new THREE.ConeGeometry(1.35,.5,10,1,true),shade,place(ux,z+deck+2.35,uz)));
  people.push({outfit:person(one([0x24292e,0x1b2a4a,0x5a6a78,0x3d2b1f]),one([0x3a3f45,0x2d3a4a,0x1b1d20]),{hat:'headset'}),pose:'stand',idle:'camera',x:cx,y:z+deck+1.3,z:cz,yaw:look,camera:{x:cx,y:z+deck+1.3,z:cz,back:.62,drop:1.25}});
  if(pick()<.4)people.push({outfit:person(one([0xf2f2ee,0x24292e,0xc81d25]),0x2d3a4a,{hat:pick()<.5?'cap':null,hatColor:0x1b1d20}),pose:'folded',idle:'stand',x:t.x-Math.cos(look)*.55+Math.sin(look)*.6,y:z+deck+.05,z:-t.y+Math.sin(look)*.55+Math.cos(look)*.6,yaw:look+(pick()-.5)});
  // The broadcast view sits just in front of the lens, not inside the camera body.
  return {s:t.s,side:t.side,x:t.x,y:t.y,z:z+deck+1.45,position:new THREE.Vector3(cx+Math.cos(look)*.95,z+deck+1.5,cz-Math.sin(look)*.95)};
 });

 // (In pieces of 1.5 km: the posts and towers round a long lap were one mesh; small, they need few draws.)
 const merged=mergeGeometries(parts,false),postMaterial=new THREE.MeshStandardMaterial({name:'Postos_e_torres',vertexColors:true,roughness:.6,metalness:.25,side:THREE.DoubleSide}),postPieces=splitByCells(merged,1500);
 parts.forEach(g=>g.dispose());if(postPieces.length>1)merged.dispose();
 for(const piece of postPieces){const structure=new THREE.Mesh(piece,postMaterial);structure.name='Postos_fiscais_e_torres_TV';structure.castShadow=structure.receiveShadow=true;root.add(structure);}
 const crew=createPeople().crowd(people,{name:'Fiscais_e_cinegrafistas',cell:60,seed:3});if(crew)root.add(crew);
 return {root,towers,stats:{bannerRuns:plan.runs,bannerMetres:Math.round(plan.metres),banners:plan.banners.length,bannerSponsors:new Set(plan.banners.map(b=>b.row)).size,looseBanners:plan.banners.filter(b=>b.hangs).length,tornBanners:plan.banners.filter(b=>b.rip).length,marshals:marshals.length,towers:towers.length},
  clearings:[...marshals.map(m=>({x:m.x,y:m.y,r:4})),...towers.map(t=>({x:t.x,y:t.y,r:6}))]};
}
