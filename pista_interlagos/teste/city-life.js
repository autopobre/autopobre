import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {canvasTexture} from './pit-textures.js';
import {sceneryBands} from './track-clearance.js';
import {billboardSpots} from './track-surface.js';
import {marshalSpots,towerSpots} from './trackside.js';
import {flagSpots} from './trackside-flags.js';
import {guardrailClearance,onDeck,addRoamSolids,roamWorld} from './physics.js';
import {EFFECT_LIGHT} from './weather.js';
import * as furniture from './city-furniture.js';

// Street life round the street circuit (Floripa, data.scenery.city): the people of Florianópolis going about their
// weekend while the race closes their streets. Built on the real sidewalks (the city map, city-map.js):
// - walkers on the side streets' sidewalks: one alone (on the phone, with shopping bags, a backpack), couples, a parent
//   holding a kid's hand, someone walking the dog (a caramelo now and then), the elderly slower and stooped, some with a
//   cane, teens in twos and threes. Each sidewalk is a lane (the strip between the curb's furniture and the facades, cut
//   round the trees, poles, shelters and tables), the lanes of one block joined round its corners: they keep to their
//   right, turn back at a dead end and never cross a street. More of them where the race is and in the Centro's
//   shopping streets, few in the quiet residential bits;
// - people waiting at the bus stops: on the shelter's bench (city-furniture.js builds it: its placement is followed
//   here, same tests and seeds), standing under its roof or beside it, many looking at their phones;
// - botecos with red, yellow and white plastic tables and chairs on the sidewalk at the OSM bars, restaurants, cafés
//   and bakeries and on some corners: people sitting with plain bottles and glasses (no brands), a few at the counter,
//   the waiter with his tray, a chalk board with a joke menu, a TV on a stand showing the race, beach umbrellas where
//   the sidewalk is wide, string lights over the tables after dark;
// - ambulantes near the race and the promenades: the popcorn cart, the churrasquinho grill with its smoke, the cooler
//   under a beach umbrella, the hot-dog cart, the balloon seller and the coconut-water stand near the sea, customers
//   round some of them (the event's own trucks and fan zones are city-race.js's);
// - the weather: in the rain the walkers hurry and most open umbrellas, some go home and the open tables empty; at
//   night fewer walk, the botecos fill up and their string lights glow.
// One figure animated in its vertex shader for every person (walk, stand, sit, lean on the counter, fan the grill;
// props by flag), instanced twice (detailed and casting shadows near the camera, lighter further off), the visible
// ones packed at the front of the buffers twice a second; the dogs another; the static
// things merged by 300 m tiles (one material: vertex colour, a canvas atlas, glow by vertex); the grills' smoke and the
// tables' shade one draw each. Joke names only on every sign. Nothing stands on the race corridor, the pit lane, the
// stands or the bridges' sides, in the closed streets' mouths, on the seafront (beira-mar.js), on the fans' rows behind
// the fences (city-crowd.js) or on the street furniture.

const TAU=Math.PI*2,STEP=2,TILE=300,FAR_STREET=560;
function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lin=(hex,k=1)=>{const c=new THREE.Color(hex);return [c.r*k,c.g*k,c.b*k];};
const pick=(R,list)=>list[Math.floor(R()*list.length)%list.length];
// What a person carries or wears (bits: the figure's parts shown for them, the arms' poses).
const FL={phone:1,umbrella:2,cane:4,bagR:8,bagL:16,cup:32,backpack:64,skirt:128,longHair:256,cap:512,tray:1024,holdL:2048,holdR:4096,leash:8192,shorts:16384,sleeves:32768};

// --- What stands where: discs (x, y, r) in a hash of cells (city-furniture.js's Occupancy keys them the same way).
class Discs{
 constructor(cell=4){this.cell=cell;this.m=new Map();}
 add(x,y,r){const c=this.cell,e=[x,y,r];for(let i=Math.floor((x-r)/c);i<=Math.floor((x+r)/c);i++)for(let j=Math.floor((y-r)/c);j<=Math.floor((y+r)/c);j++){const k=i*100003+j;let a=this.m.get(k);if(!a)this.m.set(k,a=[]);a.push(e);}}
 hit(x,y,r){let hit=false;eachDisc(this,x,y,r,e=>{if(!hit&&(e[0]-x)**2+(e[1]-y)**2<(e[2]+r)**2)hit=true;});return hit;}
 free(x,y,r){return !this.hit(x,y,r);}
}
// Every disc of a hash (ours or city-furniture.js's) whose cells meet the square round (x, y).
function eachDisc(h,x,y,r,f){const c=h.cell;for(let i=Math.floor((x-r)/c);i<=Math.floor((x+r)/c);i++)for(let j=Math.floor((y-r)/c);j<=Math.floor((y+r)/c);j++){const a=h.m.get(i*100003+j);if(a)for(const e of a)f(e);}}

// Distance to the bands the scenery keeps clear (track-clearance.js sceneryBands, the sums of bandClearance) from a 16 m
// grid of their segments (city-furniture.js's index): past `reach` it reports that much; i is the band's station.
function bandIndex(data,reach,keep=()=>true){
 const bands=sceneryBands(data).filter(b=>!b.rim&&keep(b)),cell=16,grid=new Map();
 bands.forEach((band,bi)=>{const a=band.points,n=a.length,last=band.closed?n:n-1;
  for(let i=0;i<last;i++){const p=a[i],q=a[(i+1)%n],pc=(p[4]+p[5])/2,qc=(q[4]+q[5])/2,ax=p[0]+p[2]*pc,ay=p[1]+p[3]*pc,bx=q[0]+q[2]*qc,by=q[1]+q[3]*qc,r=Math.max(p[5]-p[4],q[5]-q[4])/2+band.margin+reach;
   for(let gx=Math.floor((Math.min(ax,bx)-r)/cell);gx<=Math.floor((Math.max(ax,bx)+r)/cell);gx++)for(let gy=Math.floor((Math.min(ay,by)-r)/cell);gy<=Math.floor((Math.max(ay,by)+r)/cell);gy++){const k=gx*100003+gy;let l=grid.get(k);if(!l)grid.set(k,l=[]);l.push(bi,i);}}});
 return (x,y)=>{const l=grid.get(Math.floor(x/cell)*100003+Math.floor(y/cell));let best=reach,name=null,at=-1;if(!l)return {distance:best,band:null,i:-1};
  for(let k=0;k<l.length;k+=2){const band=bands[l[k]],a=band.points,n=a.length,i=l[k+1],p=a[i],q=a[(i+1)%n],pc=(p[4]+p[5])/2,qc=(q[4]+q[5])/2,ax=p[0]+p[2]*pc,ay=p[1]+p[3]*pc,dx=q[0]+q[2]*qc-ax,dy=q[1]+q[3]*qc-ay;
   let u=((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1e-9);u=u<0?0:u>1?1:u;const e=Math.hypot(x-ax-u*dx,y-ay-u*dy)-((p[5]-p[4])+((q[5]-q[4])-(p[5]-p[4]))*u)/2-band.margin;
   if(e<best){best=e;name=band.name;at=i;}}
  return {distance:best,band:name,i:at};};
}
// The buildings (the cadastre's rings) and the landmarks' outlines rasterised at half a metre over the city map: inside
// is one lookup (the sidewalk scan asks it tens of thousands of times). Freed after the plan.
function buildingRaster(data,m){
 const res=.5,w=Math.ceil(m.width/res),h=Math.ceil(m.height/res);let bits=new Uint8Array(w*h);
 const rings=[],B=data.scenery.city.buildings;
 if(B?.items){const k=B.columns.indexOf('ring');for(const it of B.items)if(it[k]?.length>=6)rings.push(it[k]);}
 for(const l of data.scenery.landmarks??[])if(l.outline?.length>=3)rings.push(l.outline.flat());
 for(const r of rings){
  let y0=Infinity,y1=-Infinity;for(let k=1;k<r.length;k+=2){y0=Math.min(y0,r[k]);y1=Math.max(y1,r[k]);}
  const j0=Math.max(0,Math.floor((y0-m.y0)/res)),j1=Math.min(h-1,Math.ceil((y1-m.y0)/res)),xs=[];
  for(let j=j0;j<=j1;j++){
   const y=m.y0+(j+.5)*res;xs.length=0;
   for(let k=0,l=r.length-2;k<r.length;l=k,k+=2){const ya=r[l+1],yb=r[k+1];if((ya>y)!==(yb>y))xs.push(r[l]+(y-ya)/(yb-ya)*(r[k]-r[l]));}
   xs.sort((a,b)=>a-b);
   for(let q=0;q+1<xs.length;q+=2){const i0=Math.max(0,Math.round((xs[q]-m.x0)/res)),i1=Math.min(w-1,Math.round((xs[q+1]-m.x0)/res)-1);for(let i=i0;i<=i1;i++)bits[j*w+i]=1;}
  }
 }
 const at=(x,y)=>{const i=Math.floor((x-m.x0)/res),j=Math.floor((y-m.y0)/res);return i>=0&&j>=0&&i<w&&j<h&&bits[j*w+i]===1;};
 return {inside:(x,y,margin=0)=>at(x,y)||margin>0&&(at(x+margin,y)||at(x-margin,y)||at(x,y+margin)||at(x,y-margin)),count:rings.length,free(){bits=null;}};
}
// The coast (beira-mar.js's seafront): its segments by 40 m cells; the distance to it out to `r`.
function coastIndex(city){
 const segs=[],grid=new Map();for(const line of city.coast??[])for(let i=0;i+1<line.length;i++)segs.push([line[i][0],line[i][1],line[i+1][0],line[i+1][1]]);
 segs.forEach((s,k)=>{for(let i=Math.floor((Math.min(s[0],s[2])-100)/40);i<=Math.floor((Math.max(s[0],s[2])+100)/40);i++)for(let j=Math.floor((Math.min(s[1],s[3])-100)/40);j<=Math.floor((Math.max(s[1],s[3])+100)/40);j++){const key=i*100003+j;let a=grid.get(key);if(!a)grid.set(key,a=[]);a.push(k);}});
 return (x,y)=>{let best=100;for(const k of grid.get(Math.floor(x/40)*100003+Math.floor(y/40))??[]){const [ax,ay,bx,by]=segs[k],dx=bx-ax,dy=by-ay;let u=((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1e-9);u=u<0?0:u>1?1:u;best=Math.min(best,Math.hypot(x-ax-u*dx,y-ay-u*dy));}return best;};
}
// Distance to the lap's centre line on a 20 m grid over the city map (bilinear): how near the race a place is.
function lapField(data,m){
 const c=20,w=Math.ceil(m.width/c)+1,h=Math.ceil(m.height/c)+1,f=new Float32Array(w*h),A=data.samples;
 for(let j=0;j<h;j++)for(let i=0;i<w;i++){const x=m.x0+i*c,y=m.y0+j*c;let best=1e9;for(let k=0;k<A.length;k+=3){const d=(A[k][1]-x)**2+(A[k][2]-y)**2;if(d<best)best=d;}f[j*w+i]=Math.sqrt(best);}
 return (x,y)=>{const fx=clamp((x-m.x0)/c,0,w-1.001),fy=clamp((y-m.y0)/c,0,h-1.001),i=Math.floor(fx),j=Math.floor(fy),u=fx-i,v=fy-j,k=j*w+i;return (f[k]*(1-u)+f[k+1]*u)*(1-v)+(f[k+w]*(1-u)+f[k+w+1]*u)*v;};
}

// --- The plan: where every person and thing goes. Pure data (Node runs it for the checks); createCityLife builds it.
const WALK_STREETS=/^(primary|secondary|tertiary|residential|living_street|pedestrian|unclassified|trunk|primary_link|secondary_link|tertiary_link)$/;
const FOOD=/^(restaurant|bar|pub|fast_food|cafe|food_court|ice_cream|shop:bakery|shop:pastry|shop:confectionery)$/;
export function planCityLife(data,{mobile=false,lean=false,ground,map,debug=false}){
 const city=data.scenery.city,A=data.samples,light=mobile||lean,M=city.map,started=Date.now();
 const share=lean?.2:mobile?.33:1;
 const stats={stations:0,lanes:0,lane_m:0,links:0,agents:0,walkers:0,dogs:0,kids:0,elderly:0,groups:0,botecos:0,tables:0,chairs:0,seated:0,umbrellas:0,counters:0,tvs:0,menus:0,lights:0,waiters:0,
  vendors:0,vendorKinds:{},customers:0,shelters:0,waiting:0,people:0,nightOnly:0,skipped:{boteco:0,vendor:0}};
 const gz=(x,y)=>{const z=ground?.(x,y);return Number.isFinite(z)?z:null;};
 const ms={},t0=performance.now();let tm=t0;const mark=k=>{const t=performance.now();ms[k]=Math.round(t-tm);tm=t;};stats.ms=ms;
 const clear=bandIndex(data,14),blds=buildingRaster(data,M),coastAt=coastIndex(city),lapAt=lapField(data,M);
 const gapAt=(i,x,y)=>{const p=A[i];if(!p)return .6;const side=(x-p[1])*p[9]+(y-p[2])*p[10],g=side>0?p[16]:p[15];return Number.isFinite(g)?g:.6;};
 // city-furniture.js's rule (its raceClear), for following its placements; ours keeps `keep` metres behind the
 // walls' back and a metre more off the other bands.
 const raceClearF=(x,y,r,keep=.8)=>{const c=clear(x,y);if(c.distance<=r)return false;if(c.band==='pista')return c.distance>gapAt(c.i,x,y)+.75+keep+r;return true;};
 const raceOk=(x,y,r,keep)=>{const c=clear(x,y);if(c.distance<=r)return false;if(c.band==='pista')return c.distance>gapAt(c.i,x,y)+.75+keep+r;return c.distance>r+1;};
 const at=(x,y)=>map.at(x,y);
 const W=(x,y)=>{const q=at(x,y);return q.road>.15&&q.cycleway>.05&&q.parking>.05?(q.sidewalk<-.05?1:q.plaza<-.05?2:0):0;};
 const sidewalkF=(x,y)=>{const d=at(x,y);return d.road>.2&&d.cycleway>.1&&(d.sidewalk<-.05||d.plaza<-.05);};
 const closures=new Discs(16);for(const c of city.closures??[])closures.add(c.x,c.y,17);
 const nearClosure=(x,y)=>closures.hit(x,y,0);mark('indexes');
 const cols=t=>Object.fromEntries(t.columns.map((k,i)=>[k,i]));

 // ---------------------------------------------------------------- what stands there already
 // occ: what city-furniture.js tests against (followed here: its poles, lights and shelters land where they do there);
 // taken: everything our people and things keep off (theirs, the trees, the fans' rows, then ours).
 const occF=new Discs(6),taken=new Discs(4);
 for(const b of city.closures??[])occF.add(b.x,b.y,8);
 if(city.parked)for(const [x,y,h] of city.parked.items)for(const a of [-1.45,0,1.45])occF.add(x+Math.cos(h)*a,y+Math.sin(h)*a,1.95);
 const crossings=city.crossings?.items??[];
 for(const [x,y,h,w] of crossings){const nx=-Math.sin(h),ny=Math.cos(h);for(let d=-w/2-1;d<=w/2+1.01;d+=1.2)occF.add(x+nx*d,y+ny*d,1.3);}
 for(const [x,y] of data.scenery.trees?.items??[]){occF.add(x,y,.7);taken.add(x,y,.5);}
 const posts=[],spots={boards:[],marshals:[],towers:[]};
 try{spots.boards=billboardSpots(data);spots.marshals=marshalSpots(data);spots.towers=towerSpots(data);
  for(const q of spots.boards)posts.push([q.x,q.y,9]);for(const q of spots.marshals)posts.push([q.x,q.y,4]);for(const q of spots.towers)posts.push([q.x,q.y,6]);
  for(const q of flagSpots(data))if(Number.isFinite(q.x)&&Number.isFinite(q.y))posts.push([q.x,q.y,1.5]);}catch(e){console.warn('Vida: pontos da pista indisponíveis',e);}
 for(const [x,y,r] of posts){occF.add(x,y,r);taken.add(x,y,r);}mark('trackside');
 // The fans standing behind the fences: city-crowd.js citySpectators' rows (main.js draws them), found by its own walk,
 // seed and tests, with the trackside spots and band distances already at hand (it would look them all up again).
 {const n=A.length,rand=random(1517),cl=city.closures??[],other=bandIndex(data,6,b=>b.name!=='pista');
  const fanPosts=[...spots.boards.map(q=>[q.x,q.y,9]),...spots.marshals.map(q=>[q.x,q.y,5]),...spots.towers.map(q=>[q.x,q.y,6])];
  const turn=i=>{const p=A[(i-5+n)%n],q=A[(i+5)%n];let d=Math.atan2(q[8],q[7])-Math.atan2(p[8],p[7]);d=(d+Math.PI*3)%(Math.PI*2)-Math.PI;return Math.abs(d)/20;};
  const rows=[],fanShare=lean?.5:mobile?.7:1;
  for(const side of [-1,1]){
   let run=null;
   const close=()=>{if(run&&run.length>=3){const deep=Math.min(...run.map(r=>r.depth))>2.4&&rand()<.55?2:1;for(let k=0;k<deep;k++)rows.push([run[0],run.at(-1),k]);}run=null;};
   for(let i=0;i<n;i++){
    const p=A[i],s=p[0],back=p[4]/2+guardrailClearance(data,s,side)+.75+.55,ox=p[9]*side,oy=p[10]*side,x=p[1]+ox*(back+.55),y=p[2]+oy*(back+.55);
    const d=at(x,y),paved=Math.min(d.sidewalk,d.plaza)<-.2&&d.road>.3,nearC=cl.some(c=>Math.hypot(c.x-x,c.y-y)<22);
    const busy=.5+.5*Math.sin(s*.013+side*1.7)*Math.sin(s*.0047+2.1)+Math.min(1,turn(i)*90)*.5+(nearC?.6:0);
    const ok=paved&&!onDeck(data,s)&&busy>.62&&other(x,y).distance>3&&!fanPosts.some(q=>Math.hypot(q[0]-x,q[1]-y)<q[2])&&ground(x,y)!==null;
    if(ok)(run??=[]).push({p,ox,oy,back,depth:Math.min(-Math.min(d.sidewalk,d.plaza),3.2)});else close();
    if(run&&run.length>=9)close();
   }
   close();
  }
  for(const [f,l,k] of rows){if(rand()>=fanShare)continue;const P=(r)=>{const d=r.back+.25+k*1.1+.33;return [r.p[1]+r.ox*d,r.p[2]+r.oy*d];},a=P(f),b=P(l),len=Math.hypot(b[0]-a[0],b[1]-a[1]);
   for(let t=0;t<=len;t+=.6)taken.add(a[0]+(b[0]-a[0])*t/(len||1),a[1]+(b[1]-a[1])*t/(len||1),.75);stats.fanRows=(stats.fanRows??0)+1;}}
 mark('fans');
 // The data's utility poles (moved off the race as city-furniture.js does).
 const PC=cols(city.poles),dataLap=[];
 for(const it of city.poles.items){
  let x=it[PC.x],y=it[PC.y];const h=it[PC.heading];
  if(!raceClearF(x,y,.25,.5)){let ok=false;for(let d=.25;d<=3&&!ok;d+=.25){const nx=x-Math.cos(h)*d,ny=y-Math.sin(h)*d;if(raceClearF(nx,ny,.25,.5)){x=nx;y=ny;ok=true;}}if(!ok)continue;}
  if(gz(x,y)===null)continue;occF.add(x,y,.6);taken.add(x,y,.3);if(it[PC.track])dataLap.push([it[PC.x],it[PC.y]]);
 }
 // Its own lines along the lap's sidewalks (the same walk, seeds and tests).
 const L=data.meta.reconstructed_xy_m,station=s=>{s=((s%L)+L)%L;let lo=0,hi=A.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(A[m][0]<=s)lo=m;else hi=m-1;}return lo;};
 for(const side of [-1,1]){
  let prev=false,misses=0;const RL=random(side>0?8123:9157);
  for(let s=6+RL()*10;s<L-4;){
   const i=station(s),p=A[i],want=random(Math.floor(s/240)*131+(side+1)*7)()<.62;let placed=null;
   if(want){const tl=Math.hypot(p[7],p[8]),tx=p[7]/tl,ty=p[8]/tl,lx=-ty*side,ly=tx*side,gap=side<0?p[15]:p[16],d0=p[4]/2+(Number.isFinite(gap)?gap:.6)+.75+.85;
    for(let d=d0;d<d0+3&&!placed;d+=.25){const x=p[1]+lx*d,y=p[2]+ly*d,q=at(x,y);if(q.road<.25||q.cycleway<.05)continue;
     if(!raceClearF(x,y,.3,.6)||!occF.free(x,y,.9)||blds.inside(x,y,.3)||coastAt(x,y)<30||dataLap.some(([a,b])=>Math.hypot(a-x,b-y)<18))continue;
     if(gz(x,y)!==null)placed={x,y};}}
   if(!placed){if(++misses>3){prev=false;misses=0;}s+=4;continue;}
   if(!prev){if(RL()>=.55)RL();}
   occF.add(placed.x,placed.y,.6);taken.add(placed.x,placed.y,.3);prev=true;misses=0;s+=32+RL()*8;
  }
 }
 // Its traffic-light posts at the junctions' approaches.
 const SC=cols(city.signals);
 for(const it of city.signals.items){
  const x=it[SC.x],y=it[SC.y],h=it[SC.heading],w=it[SC.width];
  for(const sg of it[SC.oneway]?[1]:[1,-1]){
   const tx=Math.cos(h)*sg,ty=Math.sin(h)*sg,rx=ty,ry=-tx;let spot=null;
   search:for(let back=5;back<=22;back+=1)for(let lat=w/2-1.5;lat<=w/2+2.5;lat+=.3){
    const px=x-tx*back+rx*lat,py=y-ty*back+ry*lat,d=at(px,py);if(d.road<.3||d.road>1.4||d.cycleway<.1)continue;
    if(!raceClearF(px,py,.4)||!occF.free(px,py,.35)||blds.inside(px,py,.4))continue;spot={x:px,y:py};break search;}
   if(spot&&gz(spot.x,spot.y)!==null){occF.add(spot.x,spot.y,.6);taken.add(spot.x,spot.y,.35);}
  }
 }
 // And on the lap, where the real street has lights: a post behind the wall.
 for(const s0 of city.track?.signals??[]){
  let done=false;
  for(const side of [-1,1]){if(done)break;for(const shift of [0,4,-4,8,-8,12,-12,16,-16]){
   const i=station(s0+shift),p=A[i],tl=Math.hypot(p[7],p[8]),tx=p[7]/tl,ty=p[8]/tl,lx=-ty*side,ly=tx*side,gap=side<0?p[15]:p[16];
   let spot=null;for(let d=p[4]/2+(Number.isFinite(gap)?gap:.6)+.75+1.4;d<p[4]/2+9;d+=.3){const x=p[1]+lx*d,y=p[2]+ly*d;if(at(x,y).road<.3)continue;if(!raceClearF(x,y,.4,1.2)||!occF.free(x,y,.5)||blds.inside(x,y,.4))continue;spot={x,y};break;}
   if(!spot)continue;const z=gz(spot.x,spot.y);if(z===null)continue;const zArm=p[3]+7.05-z;if(zArm<4.5||zArm>11)continue;
   occF.add(spot.x,spot.y,.7);taken.add(spot.x,spot.y,.35);done=true;break;
  }}
 }
 // Its bus shelters (placeShelter: the same frame, slides and tests; the seed gives the shelter's size and bench).
 const shelters=[];
 const placeShelter=(x,y,h,R,toward=null)=>{
  let ax=Math.cos(h),ay=Math.sin(h),bx=-ay,by=ax;
  if(toward){bx=toward[0];by=toward[1];}else{const p=at(x+bx*1.5,y+by*1.5),q=at(x-bx*1.5,y-by*1.5);if(q.road<p.road){bx=-bx;by=-by;}}
  if(ax*by-ay*bx<0){ax=-ax;ay=-ay;}
  const d0=at(x,y).road;
  for(const narrow of [false,true]){
   const D=narrow?1.05:1.62,back=.55+D;
   for(const slide of [0,2.5,-2.5,5,-5]){
    const ox=x+ax*slide-bx*(back-d0),oy=y+ay*slide-by*(back-d0),Lh=narrow?1.6:2.6,pts=[];
    for(const a of [-Lh,0,Lh])for(const b of [.05,D/2,D+.1])pts.push([ox+ax*a+bx*b,oy+ay*a+by*b]);
    if(!pts.every(([px,py])=>{const q=at(px,py);return q.road>.15&&q.cycleway>.05;}))continue;
    if(!pts.every(([px,py])=>!blds.inside(px,py,.2)&&raceClearF(px,py,.2,.6)&&occF.free(px,py,.35)))continue;
    const z=Math.min(...pts.map(([px,py])=>gz(px,py)??Infinity));if(!Number.isFinite(z))continue;
    // busShelter's draws: length, depth, roof height..., and whether the far end has the advertising panel.
    const Lw=narrow?2.6:3.7+R()*1.3,Dw=narrow?1.05:1.45+R()*.25;R();R();R();R();const ads=!narrow&&R()<.85;
    const sh={x:ox,y:oy,z,ax,ay,bx,by,L:Lw,D:Dw,narrow,ads,back,sign:null};
    for(const e of [-1,1]){const sx=ox+e*ax*(Lh+.9)+bx*(back-.45),sy=oy+e*ay*(Lh+.9)+by*(back-.45);
     if(sidewalkF(sx,sy)&&occF.free(sx,sy,.4)&&raceClearF(sx,sy,.2)&&!blds.inside(sx,sy,.2)){occF.add(sx,sy,.4);taken.add(sx,sy,.35);sh.sign=[sx,sy];break;}}
    for(const [px,py] of pts)occF.add(px,py,.5);
    // What our walkers keep off: the shelter's footprint, a little round.
    for(let a=-Lw/2;a<=Lw/2+.01;a+=.6)for(const b of [.1,Dw/2,Dw])taken.add(ox+ax*a+bx*b,oy+ay*a+by*b,.45);
    shelters.push(sh);return sh;
   }
  }
  const sx=x+bx*(d0-.45),sy=y+by*(d0-.45);if(gz(sx,sy)!==null&&sidewalkF(sx,sy)&&occF.free(sx,sy,.4)&&raceClearF(sx,sy,.2)){occF.add(sx,sy,.4);taken.add(sx,sy,.35);}
  return {x,y,ax,ay,bx,by,d0,none:true};
 };
 const stops=[];
 (city.stops?.items??[]).forEach(([x,y,h],k)=>stops.push(placeShelter(x,y,h,random(6151+k*37))));
 for(const [k,s0] of (city.track?.stops??[]).entries()){
  let placed=null;
  for(const side of city.track.stop_sides?.[k]===1?[1,-1]:[-1,1]){if(placed)break;for(const shift of [0,6,-6,12,-12]){
   const i=station(s0+shift),p=A[i],tl=Math.hypot(p[7],p[8]),tx=p[7]/tl,ty=p[8]/tl,lx=-ty*side,ly=tx*side,gap=side<0?p[15]:p[16];
   for(let d=p[4]/2+(Number.isFinite(gap)?gap:.6)+.75+1.0;d<p[4]/2+7&&!placed;d+=.5){const x=p[1]+lx*(d+.8),y=p[2]+ly*(d+.8);if(!sidewalkF(x,y))continue;
    const sh=placeShelter(x,y,Math.atan2(ty,tx),random(9157+i),[-lx,-ly]);if(!sh.none)placed=sh;}
   if(placed)break;
  }}
  if(placed)stops.push(placed);
 }
 // The street-name plates at the corners.
 const PL=cols(city.plates);for(const it of city.plates.items){const x=it[PL.x],y=it[PL.y];if(occF.free(x,y,.3)&&raceClearF(x,y,.2)&&!blds.inside(x,y,.2)){occF.add(x,y,.4);taken.add(x,y,.3);}}
 // Whatever city-furniture.js may publish of its own placements (bins, kiosks, racks...): taken too.
 const published=furniture.FURNITURE_SPOTS?.get?.(data)??null;

 mark('furniture');
 // ---------------------------------------------------------------- the sidewalks, street by street
 // Every STEP metres along each side of a street: where its curb is (from the road's distance) and the walkable strip
 // behind it (sidewalk or square, off the cycleway, the parking bays and the buildings), in metres from the centre line.
 const profile=(x,y,nx,ny,half)=>{
  if(map.distance('road',x,y)>.3)return null;
  let o=0;for(let k=0;k<80&&o<half+6;k++){const r=map.distance('road',x+nx*o,y+ny*o);if(r>=0)break;o+=Math.max(.12,-r*.9);}
  if(o>=half+6)return null;
  const curb=o;let a=-1,b=-1,kind=0;
  for(let v=curb+.1;v<curb+9;v+=.25){const w=W(x+nx*v,y+ny*v);if(w&&!blds.inside(x+nx*v,y+ny*v,.15)){if(a<0){a=v;kind=w;}b=v;}else if(a>=0)break;else if(v>curb+3.2)break;}
  if(a<0||b-a<.75)return null;
  return {curb,a,b,kind};
 };
 const sides=[],cellOf=(x,y)=>Math.floor(x/12)*100003+Math.floor(y/12),stationGrid=new Map();
 for(const st of city.streets??[]){
  if(!WALK_STREETS.test(st.kind)||st.points.length<2)continue;
  const P=st.points;if(P.every(q=>lapAt(q[0],q[1])>FAR_STREET))continue;
  const seg=[];let total=0;for(let i=0;i+1<P.length;i++){const l=Math.hypot(P[i+1][0]-P[i][0],P[i+1][1]-P[i][1]);seg.push(l);total+=l;}
  const living=/living_street|pedestrian/.test(st.kind);
  for(const side of [-1,1]){
   const list=[];let i=0,acc=0;
   for(let u=1;u<total-1;u+=STEP){
    while(i<seg.length-1&&u>acc+seg[i]){acc+=seg[i];i++;}
    const l=seg[i]||1,t=clamp((u-acc)/l,0,1),p=P[i],q=P[i+1],x=p[0]+(q[0]-p[0])*t,y=p[1]+(q[1]-p[1])*t,w=p[2]+(q[2]-p[2])*t,tx=(q[0]-p[0])/l,ty=(q[1]-p[1])/l,nx=-ty*side,ny=tx*side;
    let pr=profile(x,y,nx,ny,w/2);
    // A pedestrian street (the Felipe Schmidt calçadão): people walk all over it, its middle is the strip.
    if(!pr&&living&&gz(x,y)!==null)pr={curb:-.1,a:.2,b:Math.max(1.2,w/2-.6),kind:2,living:true};
    if(!pr){list.push(null);continue;}
    const s={x,y,tx,ty,nx,ny,...pr,list,k:list.length,street:st};list.push(s);stats.stations++;
    const key=cellOf(x+nx*pr.b,y+ny*pr.b);let c=stationGrid.get(key);if(!c)stationGrid.set(key,c=[]);c.push(s);
   }
   sides.push(list);
  }
 }
 const stationsNear=(x,y,r)=>{const out=[];for(let i=Math.floor((x-r)/12);i<=Math.floor((x+r)/12);i++)for(let j=Math.floor((y-r)/12);j<=Math.floor((y+r)/12);j++)for(const s of stationGrid.get(i*100003+j)??[])out.push(s);return out;};
 const pt=(s,v)=>[s.x+s.nx*v,s.y+s.ny*v];
 // A place for our things: on the walkable ground, off the race, the closed streets' mouths, the seafront, the
 // buildings and whatever stands there.
 const spotOk=(x,y,r)=>W(x,y)>0&&!blds.inside(x,y,.2)&&raceOk(x,y,r,1.5)&&!nearClosure(x,y)&&coastAt(x,y)>26+r&&taken.free(x,y,r)&&!(published&&published.m&&!published.free(x,y,r))&&gz(x,y)!==null;

 mark('sidewalks');
 // ---------------------------------------------------------------- people (the roster the renderer packs)
 const people=[],props=[],smokes=[],shades=[],clearings=[],R=random(4471);
 const SKIN=[0xf1c9a5,0xe8bd98,0xd9a47c,0xc68e6a,0xb07a52,0x96633f,0x7a4e32,0x5c3a26,0x4a2f20];
 const TOPS=[0xf4f1ea,0xe9e6df,0x1d3557,0xe63946,0x2a9d8f,0xf4a261,0x264653,0xffd23f,0x8ecae6,0x6a4c93,0xff8fab,0x2b2d42,0x90be6d,0xe9c46a,0x457b9d,0x111111,0x9b2226,0x3d5a80,0xc9ada7,0x6d6875,0xbc6c25,0x52796f];
 const BOTTOMS=[0x2d3a4a,0x41618f,0x34495e,0x6b5a45,0x1b1d20,0x8a8f93,0xc9b18a,0x3a5a40,0x5b6b7c,0x232a35];
 const ACC=8;// accessory colours: the shader's palette (umbrellas, bags, caps, backpacks)
 // flags: what a person carries or wears (the shader shows those parts).
 const F=FL;
 const person=(o)=>{
  const p={kind:0,x:0,y:0,z:0,h:0,scale:1,flags:0,phase:R()*TAU,rate:0,lean:0,style:Math.floor(R()*4),look:R(),acc:Math.floor(R()*ACC),
   skin:pick(R,SKIN),hair:R()<.12?.55+R()*.4:R()*.3,top:pick(R,TOPS),bottom:pick(R,BOTTOMS),night:1.01,nightOnly:false,rain:1.01,umbrella:2,...o};
  if(o.kid)p.scale=.56+R()*.16;else if(o.teen)p.scale=.9+R()*.07;else if(!o.scale)p.scale=.93+R()*.14;
  p.girth=o.kid||o.teen?.92+R()*.1:.9+R()*R()*.32;
  if(!o.noClothes){if(R()<.3&&!o.male)p.flags|=F.longHair;if(R()<.16&&!(p.flags&F.longHair))p.flags|=F.cap;if(R()<.24&&p.kind<=1)p.flags|=F.shorts;if(R()<.2)p.flags|=F.sleeves;if(p.flags&F.longHair&&R()<.3&&p.kind<=2)p.flags|=F.skirt;}
  people.push(p);return p;
 };

 // ---------------------------------------------------------------- botecos
 // At the OSM bars, restaurants, cafés and bakeries, and on some corners near the race and in the Centro: plastic
 // tables and chairs along the sidewalk, against the facade where it is narrow (the walkers pass on the curb side) or
 // by the curb where it is wide (the walkers pass by the facades), each with its beach umbrella there.
 const botecos=[];
 const anchors=[];
 for(const it of city.pois?.items??[])if(FOOD.test(it[2]))anchors.push({x:it[0],y:it[1],poi:true});
 {const Q=random(919),corners=[];
  for(const [x,y,h,w] of crossings){const d=lapAt(x,y);if(d<25||d>(light?260:420))continue;const nx=-Math.sin(h),ny=Math.cos(h);for(const e of [-1,1])corners.push({x:x+nx*e*(w/2+1.5),y:y+ny*e*(w/2+1.5),w:1/(1+d/150)});}
  corners.sort((a,b)=>b.w*Q()-a.w*Q());for(const c of corners.slice(0,140))anchors.push(c);}
 const maxBotecos=Math.round((light?10:34)*Math.max(share,.4));
 // The facade behind a station's sidewalk (metres from the centre line): the building's wall, within 3 m past the
 // sidewalk's end over the strip of lot many fronts keep (not across a road, a lawn or a car park).
 const lotAt=(x,y)=>{const q=at(x,y);return q.road>.3&&q.cycleway>.1&&q.parking>.1&&q.green>.05;};
 const facade=s=>{if(s.fac!==undefined)return s.fac;s.fac=null;if(s.living)return null;
  for(let v=s.b+.15;v<=s.b+3.2;v+=.2){const [x,y]=pt(s,v);if(blds.inside(x,y,0)){s.fac=v-.12;break;}if(!lotAt(x,y)&&!W(x,y))break;}return s.fac;};
 const spotB=(x,y,r)=>(W(x,y)>0||lotAt(x,y))&&!blds.inside(x,y,.12)&&raceOk(x,y,r,1.5)&&!nearClosure(x,y)&&coastAt(x,y)>26+r&&taken.free(x,y,r)&&!(published&&published.m&&!published.free(x,y,r))&&gz(x,y)!==null;
 // And on the race's own sidewalks, behind the fences: a beer watching the cars go by (where there is a facade and room).
 {const Q=random(4123),lap=[];let last=null;
  for(const list of sides)for(const s of list){if(!s||s.k%4)continue;const [x,y]=pt(s,s.b);if(lapAt(x,y)>24||facade(s)===null||s.fac-s.curb<2.7)continue;if(last&&Math.hypot(last[0]-x,last[1]-y)<35)continue;last=[x,y];lap.push({x,y,w:Q()});}
  lap.sort((a,b)=>a.w-b.w);anchors.splice(anchors.findIndex(a=>!a.poi),0,...lap.slice(0,light?4:14));}
 for(const an of anchors){
  if(botecos.length>=maxBotecos)break;
  if(botecos.some(b=>Math.hypot(b.x-an.x,b.y-an.y)<(an.poi?45:75)))continue;
  const far=s=>{const [x,y]=pt(s,s.b);return Math.hypot(x-an.x,y-an.y);},cands=stationsNear(an.x,an.y,an.poi?40:24).filter(s=>facade(s)!==null&&s.fac-s.curb>=2.7).sort((a,b)=>far(a)-far(b));
  let done=null;for(const s of cands.slice(0,10)){done=boteco(s,an,random(Math.floor(an.x*31+an.y*17)>>>0));if(done)break;}
  if(done){botecos.push(done);stats.botecos++;}else stats.skipped.boteco++;
 }
 function boteco(s0,an,Q){
  // The run of stations either side with room enough, the same facade along it.
  const list=s0.list,need=2.7;let i0=s0.k,i1=s0.k;
  const fits=s=>s&&facade(s)!==null&&s.fac-s.curb>=need&&Math.abs(s.fac-s0.fac)<1&&Math.abs(s.curb-s0.curb)<.8;
  while(i1-s0.k<5&&fits(list[i1+1]))i1++;while(s0.k-i0<5&&fits(list[i0-1]))i0--;
  if(i1-i0<2)return null;
  const run=list.slice(i0,i1+1),depth=Math.min(...run.map(s=>s.fac-s.curb)),curbSide=depth>=5;
  // A frame along the run: u along the street (m from the run's start), v from the curb toward the facade.
  // (Past the run's ends it goes on straight: the counter, the board and the TV stand beside the tables.)
  const len=(run.length-1)*STEP,S=u=>{const f=clamp(u/STEP,0,run.length-1.001),k=Math.floor(f),t=f-k,a=run[k],b=run[k+1],o=u<0?u:u>len?u-len:0;return {x:a.x+(b.x-a.x)*t+a.tx*o,y:a.y+(b.y-a.y)*t+a.ty*o,nx:a.nx+(b.nx-a.nx)*t,ny:a.ny+(b.ny-a.ny)*t,curb:a.curb+(b.curb-a.curb)*t,tx:a.tx,ty:a.ty};};
  const P=(u,v)=>{const q=S(u);return [q.x+q.nx*(q.curb+v),q.y+q.ny*(q.curb+v)];};
  const vt=curbSide?2.3+Q()*.3:depth-.72-Q()*.08,tables=[];
  const n=Math.min(Math.floor((len-1)/1.95)+1,light?3:7);
  if(n<2)return null;
  const u0=(len-(n-1)*1.95)/2;
  for(let k=0;k<n;k++){const u=u0+k*1.95+(Q()-.5)*.25,v=vt+(Q()-.5)*.12,[x,y]=P(u,v);if(spotB(x,y,.5)&&spotB(...P(u-.62,v),.3)&&spotB(...P(u+.62,v),.3)&&(!curbSide||spotB(...P(u,v-.62),.3)&&spotB(...P(u,v+.62),.3)))tables.push({u,v,x,y});}
  if(tables.length<2)return null;
  const q0=S(len/2),h=Math.atan2(q0.ty,q0.tx),side=Math.atan2(q0.ny,q0.nx),z=gz(...P(len/2,vt))??0;
  const b={x:P(len/2,vt)[0],y:P(len/2,vt)[1],h,side,tables:[],curbSide,set:Math.floor(Q()*4),items:[],people:[],name:Math.floor(Q()*BOTECO_NAMES.length),lights:!light&&Q()<.7,tv:!light&&Q()<.55};
  for(const t of tables){
   const umb=curbSide&&Q()<.75,f=S(t.u),tw=(Q()-.5)*.12,c=Math.cos(tw),sn=Math.sin(tw);
   t.z=gz(t.x,t.y)??z;t.umbrella=umb;t.tx=f.tx*c-f.ty*sn;t.ty=f.tx*sn+f.ty*c;t.nx=f.nx*c-f.ny*sn;t.ny=f.nx*sn+f.ny*c;t.h=Math.atan2(t.ty,t.tx);
   // Chairs (du along the street, dv toward the facade): both ends along the street; by the curb on all four sides.
   // Against the facade the curb side stays free for the walkers.
   const seats=[[1,0],[-1,0]];if(curbSide)seats.push([0,1],[0,-1]);
   t.chairs=seats.filter(()=>Q()<.92).map(([du,dv])=>{const d=.6+Q()*.08,x=t.x+t.tx*du*d+t.nx*dv*d,y=t.y+t.ty*du*d+t.ny*dv*d;
    return {x,y,face:Math.atan2(t.y-y,t.x-x)+(Q()-.5)*.3,taken:Q(),turn:(Q()-.5)*.5};});
   b.tables.push(t);stats.tables++;stats.chairs+=t.chairs.length;if(umb)stats.umbrellas++;
   taken.add(t.x,t.y,.52);for(const ch of t.chairs)taken.add(ch.x,ch.y,.33);clearings.push({x:t.x,y:t.y,r:1.6});shades.push([t.x,t.y,t.z,umb?1.35:.75,umb?.55:.3]);
  }
  // The counter on the facade at one end of the run (the bar's window), the chalk board at the other.
  const end=Q()<.5?0:1,uEnd=end?tables.at(-1).u+1.7:tables[0].u-1.7,uOther=end?tables[0].u-1.45:tables.at(-1).u+1.45;
  {const [x,y]=P(uEnd,depth-.3);if(!light&&spotB(x,y,.4)&&spotB(...P(uEnd-.75,depth-.3),.25)&&spotB(...P(uEnd+.75,depth-.3),.25)){b.counter={x,y,z:gz(x,y)??z,h,u:uEnd};taken.add(x,y,.95);stats.counters++;}}
  {const [x,y]=P(uOther,curbSide?depth-.7:vt);if(spotB(x,y,.4)){b.menu={x,y,z:gz(x,y)??z,h:h+(Q()-.5)*.6};taken.add(x,y,.45);stats.menus++;}}
  if(b.tv){const [x,y]=P(end?tables[0].u-2.5:tables.at(-1).u+2.5,curbSide?depth-.6:vt+.15);if(spotB(x,y,.45)){b.tvAt={x,y,z:gz(x,y)??z,h:end?h:h+Math.PI};taken.add(x,y,.5);stats.tvs++;}else b.tv=false;}
  // The string lights, from hooks high on the facade.
  // By the curb: from hooks on the facade down to each umbrella's top; against the facade: festoons along the wall.
  if(b.lights){b.wire=[];const vw=depth-.1,hook=u=>{const [x,y]=P(u,vw);return [x,y,(gz(x,y)??z)+3.5+Q()*.15];};
   if(curbSide){for(const t of b.tables)if(t.umbrella){b.wire.push([hook(t.u-.9),[t.x,t.y,t.z+2.42]],[[t.x,t.y,t.z+2.42],hook(t.u+.9)]);}}
   else{let prev=hook(b.tables[0].u-1.1);for(const t of b.tables){const h2=hook(t.u+1);b.wire.push([prev,h2]);prev=h2;}}
   if(b.wire.length)stats.lights++;else b.lights=false;}
  b.z=z;b.run=run;b.depth=depth;b.P=P;b.vt=vt;b.len=len;
  // The people: day, about half the chairs; more after dark (the extra ones only then); the open tables empty in the rain.
  for(const t of b.tables)for(const c of t.chairs){
   const day=c.taken<.5,night=!day&&c.taken<.88;if(!day&&!night)continue;
   const p=person({kind:3,x:c.x,y:c.y,z:t.z,h:c.face,flags:R()<.55?F.cup:0,seat:true});
   if(night){p.nightOnly=true;p.night=.3+R()*.5;stats.nightOnly++;}else p.night=R()<.15?.6:1.01;
   // In the rain the open tables empty: by the curb most go, against the facade (under the shop's awning) half stay.
   if(!t.umbrella)p.rain=curbSide||R()<.5?.25+R()*.6:1.01;b.people.push(p);stats.seated++;
  }
  if(b.counter)for(let k=0,n=1+Math.floor(Q()*3);k<n;k++){const [x,y]=P(b.counter.u+(k-(n-1)/2)*.62+(Q()-.5)*.1,depth-.95-Q()*.15);if(!taken.free(x,y,.05))continue;
   const p=person({kind:5,x,y,z:gz(x,y)??z,h:side+(Q()-.5)*.4,flags:Q()<.6?F.cup:0,male:Q()<.6});if(k===0&&Q()<.4){p.nightOnly=true;p.night=.3;}b.people.push(p);}
  // The waiter between the counter and the tables, a tray in his hand.
  if(!light&&b.tables.length>=3){b.waiter={u0:Math.min(uEnd,tables[0].u),u1:Math.max(uEnd,tables.at(-1).u),v:curbSide?vt+1.15:vt-1.05};stats.waiters++;}
  return b;
 }

 // ---------------------------------------------------------------- ambulantes
 // Near the race (15-200 m from the lap) on the wider sidewalks and the squares' edges, and the coconut-water stands by
 // the sea: a vendor each, a few customers round some.
 const vendors=[];
 {const want=Math.round((light?6:20)*Math.max(share,.4)),Q=random(3907),cands=[];
  for(const list of sides)for(const s of list)if(s&&!s.living&&s.b-s.curb>=(s.kind===2?3.5:4.2)&&s.k%3===0){const [x,y]=pt(s,s.curb+2.1),d=lapAt(x,y);if(d<14||d>200)continue;cands.push({s,x,y,w:Q()*(1.5-d/160)+(coastAt(x,y)<70?.25:0)});}
  cands.sort((a,b)=>b.w-a.w);
  // The coconut-water stands first, on the sidewalks nearest the sea; then the others in turn.
  const KINDS=['pipoca','churrasco','isopor','dogao','baloes','isopor','churrasco','pipoca','baloes','dogao'];let k=0,cocos=0;
  const sea=cands.filter(c=>coastAt(c.x,c.y)<80);for(const c of [...sea,...cands])c.sea=c.sea??coastAt(c.x,c.y)<80;
  for(const c of [...sea,...cands]){
   if(vendors.length>=want)break;
   if(vendors.some(v=>Math.hypot(v.x-c.x,v.y-c.y)<48)||botecos.some(b=>Math.hypot(b.x-c.x,b.y-c.y)<25))continue;
   const coco=c.sea&&cocos<(light?1:3);if(!coco&&cocos<(light?1:3)&&sea.includes(c))continue;
   const kind=coco?'coco':KINDS[k%KINDS.length];
   const v=vendor(c.s,kind,random(k*977+31));if(!v){stats.skipped.vendor++;continue;}
   vendors.push(v);if(coco)cocos++;else k++;stats.vendors++;stats.vendorKinds[kind]=(stats.vendorKinds[kind]??0)+1;
  }}
 // A cart along the street by the curb's furniture (deeper in on a square), its vendor behind it facing the street,
 // the customers at its ends: the walkers pass behind (a wide sidewalk) or along the square's edge.
 function vendor(s,kind,Q){
  const plaza=s.kind===2,v=s.curb+(plaza?2.8:1.9)+Q()*.2,[x,y]=pt(s,v),h=Math.atan2(s.ty,s.tx)+(Q()<.5?0:Math.PI),fx=Math.cos(h),fy=Math.sin(h);
  const half={dogao:.75,churrasco:.55,pipoca:.5,isopor:.35,coco:.55,baloes:.1}[kind],back=kind==='baloes'?0:kind==='isopor'?.6:.72;
  const sx=x+s.nx*back,sy=y+s.ny*back;
  if(!spotOk(x,y,.5)||!spotOk(x+fx*half,y+fy*half,.45)||!spotOk(x-fx*half,y-fy*half,.45)||!spotOk(sx,sy,.32))return null;
  const z=gz(x,y),out={kind,x,y,z,h,nx:s.nx,ny:s.ny,people:[],half};
  for(const a of [-half,0,half])taken.add(x+fx*a,y+fy*a,.5);taken.add(sx,sy,.32);clearings.push({x,y,r:half+1.2});shades.push([x,y,z,half+.55,.35]);
  // The vendor: behind the cart, at the grill, on a stool by the cooler, or holding the balloons' strings.
  const kindOf={churrasco:6,baloes:7,isopor:4}[kind]??2;
  out.people.push(person({kind:kindOf,x:sx,y:sy,z:gz(sx,sy)??z,h:Math.atan2(-s.ny,-s.nx)+(kind==='baloes'?(Q()-.5)*1.4:(Q()-.5)*.3),flags:Q()<.35?F.cap:0,male:Q()<.7,vendor:true,night:kind==='baloes'?.5:1.01,rain:kind==='baloes'?.4:1.01}));
  if(kind==='churrasco'||kind==='dogao')smokes.push({x:x+fx*(kind==='dogao'?-.35:0),y:y+fy*(kind==='dogao'?-.35:0),z:z+(kind==='dogao'?1.0:.92),kind:kind==='dogao'?1:0});
  // Customers at the cart's ends, turned to it.
  const nc=Q()<.7?1+Math.floor(Q()*(kind==='baloes'?3:2.4)):0;
  for(let j=0;j<nc;j++){const e=j%2?-1:1,a=e*(half+.88+(j>>1)*.6),px=x+fx*a-s.nx*(.1+Q()*.25),py=y+fy*a-s.ny*(.1+Q()*.25);if(!spotOk(px,py,.3))continue;
   const kid=kind==='baloes'&&j>0&&Q()<.7;out.people.push(person({kind:2,x:px,y:py,z:gz(px,py)??z,h:Math.atan2(y-py,x-px)+(Q()-.5)*.5,kid,flags:!kid&&Q()<.3?F.phone:0,rain:.35+Q()*.5,night:.4+Q()*.6}));taken.add(px,py,.3);stats.customers++;}
  return out;
 }

 // ---------------------------------------------------------------- the bus stops
 for(const sh of stops){
  const Q=random(Math.floor(sh.x*13+sh.y*7)>>>0),busy=clamp(1.3-lapAt(sh.x,sh.y)/500,.35,1.1);
  if(sh.none){
   // No shelter: a couple of people by the sign at the curb.
   for(let k=0;k<Math.round(Q()*2*busy*share+.3);k++){const x=sh.x+sh.bx*(sh.d0-1.4)+sh.ax*(k*.8-.4),y=sh.y+sh.by*(sh.d0-1.4)+sh.ay*(k*.8-.4);if(!spotOk(x,y,.3))continue;
    person({kind:2,x,y,z:gz(x,y)??0,h:Math.atan2(sh.by,sh.bx)+(Q()-.5)*1.2,flags:Q()<.5?F.phone:0,night:.3+Q()*.6,rain:.5});taken.add(x,y,.3);stats.waiting++;}
   continue;
  }
  stats.shelters++;
  const F2=(a,b)=>[sh.x+sh.ax*a+sh.bx*b,sh.y+sh.ay*a+sh.by*b],face=Math.atan2(sh.by,sh.bx),a1=sh.ads?sh.L/2-1.4:sh.L/2-.35;
  // On the bench, facing the street.
  const nb=Math.min(Math.floor((a1+sh.L/2-.3)/.62),Math.round(Q()*2.4*busy*share+.2));
  for(let k=0;k<nb;k++){const a=-sh.L/2+.55+k*.66+Q()*.1;if(a>a1-.2)break;const [x,y]=F2(a,.3);person({kind:4,lit:.35,x,y,z:sh.z,h:face+(Q()-.5)*.2,flags:Q()<.5?F.phone:Q()<.3?F.bagR:0,night:.35+Q()*.65});stats.waiting++;}
  // Standing under the roof's front or beside the shelter, some looking down the street for the bus.
  const ns=Math.round(Q()*3*busy*share);
  for(let k=0;k<ns;k++){
   const under=k<2||Q()<.5,a=under?(Q()-.5)*(sh.L-1.3):(Q()<.5?-1:1)*(sh.L/2+.85+Q()*.45),b=under?sh.D-.34+Q()*.18:sh.D*.5;
   const [x,y]=F2(a,b);if(!under&&!spotOk(x,y,.3))continue;
   const look=Q()<.5?Math.atan2(sh.ay,sh.ax)*(1)+(Q()<.5?0:Math.PI):face;
   person({kind:2,x,y,z:gz(x,y)??sh.z,h:look+(Q()-.5)*.5,flags:Q()<.55?F.phone:Q()<.25?F.bagR:0,night:.3+Q()*.7,rain:under?1.01:.3});taken.add(x,y,.3);stats.waiting++;
  }
 }

 mark('places');
 // ---------------------------------------------------------------- the walkers' lanes
 // The walkable strip of a station, in metres from the centre line: off the curb's furniture (bins, poles, signs stand
 // within 1.3 m of it), off the facades, then cut round what stands there (the widest free piece kept).
 const why={race:0,narrow:0,blocked:0};stats.why=why;
 const strip=s=>{
  let lo=Math.max(s.a+.3,s.curb+1.35),hi=s.b-.45;if(s.kind===2&&!s.living)hi=Math.min(hi,s.curb+1.9);
  if(s.living){lo=Math.max(.3,s.a);hi=s.b;}
  // A narrow sidewalk (many of the Centro's are 1.3-2 m): its middle, nearer the facade than the bins by the curb.
  if(hi-lo<.1){lo=Math.max(s.a+.22,s.curb+Math.max(.85,(s.b-s.curb)*.55));hi=s.b-.25;if(hi<lo){if(s.b-s.curb<1.1){why.narrow++;s.why=1;return null;}lo=hi=(lo+hi)/2;}}
  const mid=(lo+hi)/2,[mx,my]=pt(s,mid);
  if(!raceOk(mx,my,.3,1)||nearClosure(mx,my)||coastAt(mx,my)<26||gz(mx,my)===null){why.race++;s.why=2;return null;}
  // Cut round the discs near the strip; where nothing is left, the whole sidewalk is tried (past a tree by the curb on
  // its facade side, round a table on its curb side).
  const cuts=[],cx=s.x+s.nx*mid,cy=s.y+s.ny*mid,reach=(s.b-s.a)/2+1.8;
  const cut=e=>{const dx=e[0]-s.x,dy=e[1]-s.y,al=dx*s.tx+dy*s.ty,rr=e[2]+.27;if(Math.abs(al)>=rr)return;const v=dx*s.nx+dy*s.ny,w=Math.sqrt(rr*rr-al*al);cuts.push([v-w,v+w]);};
  eachDisc(taken,cx,cy,reach,cut);if(published?.m)eachDisc(published,cx,cy,reach,cut);
  cuts.sort((a,b)=>a[0]-b[0]);
  // The widest free piece of [lo, hi] between the cuts (it may be a single line: one walker behind the other).
  const free=(lo,hi)=>{let best=null,from=lo;for(const [c0,c1] of cuts){if(c1<=from)continue;if(c0>hi)break;if(c0>=from&&(!best||c0-from>best[1]-best[0]))best=[from,c0];from=Math.max(from,c1);}
   if(from<=hi&&(!best||hi-from>best[1]-best[0]))best=[from,hi];return best;};
  const got=free(lo,hi)??(s.living?null:free(Math.max(s.a+.25,s.curb+1.0),s.b-.28));
  if(!got){why.blocked++;s.why=3;}return got;
 };
 const lanes=[];
 for(const list of sides){
  let run=[];
  const flush=()=>{if(run.length>=7)lanes.push(...makeLanes(run));run=[];};
  for(const s of list){
   const w=s&&strip(s);
   if(!w){flush();continue;}
   const prev=run.at(-1);if(prev&&Math.abs((w[0]+w[1])/2-(prev.lo+prev.hi)/2)>.9)flush();
   run.push({s,lo:w[0],hi:w[1]});
  }
  flush();
 }
 // A run of stations into lanes: the strip eroded over its neighbours (a tree cut at one station keeps the next clear
 // of it too), split where nothing is left, smoothed; heights and arc lengths along its middle.
 function makeLanes(run){
  const n=run.length,lo=run.map((r,i)=>Math.max(r.lo,run[i-1]?.lo??-1e9,run[i+1]?.lo??-1e9)),hi=run.map((r,i)=>Math.min(r.hi,run[i-1]?.hi??1e9,run[i+1]?.hi??1e9));
  const out=[];let a=0;
  for(let i=0;i<=n;i++){if(i===n||hi[i]-lo[i]<-.02){if(i-a>=7)out.push(lane(run.slice(a,i),lo.slice(a,i),hi.slice(a,i)));a=i+1;}}
  return out.filter(Boolean);
 }
 function lane(run,lo,hi){
  const n=run.length,sm=(arr,i)=>{let t=0,c=0;for(let j=Math.max(0,i-2);j<=Math.min(n-1,i+2);j++){t+=arr[j];c++;}return t/c;};
  const l={n,x:new Float32Array(n),y:new Float32Array(n),nx:new Float32Array(n),ny:new Float32Array(n),lo:new Float32Array(n),hi:new Float32Array(n),z:new Float32Array(n),seg:new Float32Array(n),ends:[[],[]],weight:1,living:run[0].s.living};
  for(let i=0;i<n;i++){const s=run[i].s;let a=sm(lo,i),b=sm(hi,i);if(b<a){const m=(a+b)/2;a=b=m;}
   l.x[i]=s.x;l.y[i]=s.y;l.nx[i]=s.nx;l.ny[i]=s.ny;l.lo[i]=a;l.hi[i]=b;const m=(a+b)/2,z=gz(s.x+s.nx*m,s.y+s.ny*m);if(z===null)return null;l.z[i]=z;}
  let len=0;for(let i=0;i+1<n;i++){const m0=(l.lo[i]+l.hi[i])/2,m1=(l.lo[i+1]+l.hi[i+1])/2;l.seg[i]=Math.hypot(l.x[i+1]+l.nx[i+1]*m1-l.x[i]-l.nx[i]*m0,l.y[i+1]+l.ny[i+1]*m1-l.y[i]-l.ny[i]*m0)||STEP;len+=l.seg[i];}
  l.seg[n-1]=l.seg[n-2]||STEP;l.len=len;
  // Keep to the right: is the outward normal the walker's right going along the lane?
  const s=run[0].s;l.rightOut=(s.nx*s.ty-s.ny*s.tx)<0;
  const mx=l.x[n>>1]+l.nx[n>>1]*(l.lo[n>>1]+l.hi[n>>1])/2,my=l.y[n>>1]+l.ny[n>>1]*(l.lo[n>>1]+l.hi[n>>1])/2;l.mx=mx;l.my=my;
  return l;
 }
 lanes.forEach((l,k)=>{l.id=k;stats.lane_m+=l.len;});stats.lanes=lanes.length;stats.lane_m=Math.round(stats.lane_m);
 // The block's corners: a lane's end joins another's end nearby, straight on (a sidewalk broken by a driveway) or round
 // the corner (through the point where the two sidewalks' lines meet, eased toward the street if the corner of the lot
 // is in the way), when the walk stays off the road and the buildings and clear (many corners have no sidewalk drawn
 // round them: the walkers cut across the corner of the lot). Never across a street.
 const endPt=(l,e)=>{const i=e?l.n-1:0,j=e?l.n-2:1,m=(l.lo[i]+l.hi[i])/2,mj=(l.lo[j]+l.hi[j])/2,x=l.x[i]+l.nx[i]*m,y=l.y[i]+l.ny[i]*m,dx=x-l.x[j]-l.nx[j]*mj,dy=y-l.y[j]-l.ny[j]*mj,dl=Math.hypot(dx,dy)||1;
  return {l,e,x,y,z:l.z[i],dx:dx/dl,dy:dy/dl,nx:l.nx[i],ny:l.ny[i]};};
 const ends=[];for(const l of lanes)for(const e of [0,1])ends.push(endPt(l,e));
 const walkOk=(ax,ay,bx,by,living)=>{const d=Math.hypot(bx-ax,by-ay);for(let t=0;t<=d;t+=.4){const x=ax+(bx-ax)*t/(d||1),y=ay+(by-ay)*t/(d||1);if((!living&&at(x,y).road<.4)||blds.inside(x,y,.2)||taken.hit(x,y,.2)||!raceOk(x,y,.2,1))return false;}return true;};
 const links=[],endGrid=new Map();
 for(const e of ends){const k=Math.floor(e.x/16)*100003+Math.floor(e.y/16);let c=endGrid.get(k);if(!c)endGrid.set(k,c=[]);c.push(e);}
 for(const a of ends)for(let gi=Math.floor(a.x/16)-1;gi<=Math.floor(a.x/16)+1;gi++)for(let gj=Math.floor(a.y/16)-1;gj<=Math.floor(a.y/16)+1;gj++)for(const b of endGrid.get(gi*100003+gj)??[]){
  if(b.l.id<=a.l.id)continue;const d=Math.hypot(a.x-b.x,a.y-b.y);if(d>15||d<.05)continue;
  // Each end goes on ahead of its lane, and the other is ahead of it (not behind).
  if((b.x-a.x)*a.dx+(b.y-a.y)*a.dy<-.5||(a.x-b.x)*b.dx+(a.y-b.y)*b.dy<-.5)continue;
  const living=a.l.living||b.l.living;let path=null;
  if(d<9&&walkOk(a.x,a.y,b.x,b.y,living))path=[[a.x,a.y,a.z],[b.x,b.y,b.z]];
  else{
   // Where the two lines meet ahead of both ends.
   const den=a.dx*b.dy-a.dy*b.dx;if(Math.abs(den)<.3)continue;
   const s=((b.x-a.x)*b.dy-(b.y-a.y)*b.dx)/den,t=((b.x-a.x)*a.dy-(b.y-a.y)*a.dx)/den;if(s<0||t<0||s>12||t>12)continue;
   const cx=a.x+a.dx*s,cy=a.y+a.dy*s,ox=-(a.nx+b.nx),oy=-(a.ny+b.ny),ol=Math.hypot(ox,oy)||1;
   for(let k=0;k<=2.01&&!path;k+=.5){const px=cx+ox/ol*k,py=cy+oy/ol*k;if(walkOk(a.x,a.y,px,py,living)&&walkOk(px,py,b.x,b.y,living)){const z=gz(px,py)??(a.z+b.z)/2;path=[[a.x,a.y,a.z],[px,py,z],[b.x,b.y,b.z]];}}
  }
  if(!path)continue;
  let len=0;for(let k=1;k<path.length;k++)len+=Math.hypot(path[k][0]-path[k-1][0],path[k][1]-path[k-1][1]);
  const k=links.length;links.push({a,b,path,len:Math.max(len,.3)});a.l.ends[a.e].push(k);b.l.ends[b.e].push(k);
 }
 stats.links=links.length;mark('lanes');

 // ---------------------------------------------------------------- the walkers
 // Lanes weighted by length, by the race nearby and by the shops and places round (the Centro's streets).
 const pois=(city.pois?.items??[]).map(p=>[p[0],p[1]]);
 let total=0;
 for(const l of lanes){const d=lapAt(l.mx,l.my),shops=pois.filter(p=>Math.abs(p[0]-l.mx)<130&&Math.abs(p[1]-l.my)<130).length;
  l.weight=l.len*(.2+3.2*Math.exp(-d/150)+.2*Math.min(10,shops)+(l.living?2.5:0));total+=l.weight;
  // Near the race the walkers stop now and then to watch it: which way the lap is.
  if(d<45){let b=1e9,bx=0,by=0;for(let i=0;i<A.length;i+=2){const e=(A[i][1]-l.mx)**2+(A[i][2]-l.my)**2;if(e<b){b=e;bx=A[i][1];by=A[i][2];}}const dl=Math.sqrt(b)||1;l.watch=[(bx-l.mx)/dl,(by-l.my)/dl];}}
 const agents=[];
 const nAgents=lean?90:mobile?140:600;
 const pickLane=()=>{let r=R()*total;for(const l of lanes){if(r<l.weight)return l;r-=l.weight;}return lanes[0];};
 if(lanes.length)for(let k=0;k<nAgents;k++){
  const l=pickLane(),r=R();
  const ag={lane:l,link:null,u:R()*(l.n-1.001),dir:R()<.5?1:-1,t:0,f:0,ft:0,speed:1.2+R()*.35,members:[],dog:null,kind:'adult'};
  const night=R()<.55?.35+R()*.65:1.01,rainGo=R()<.3?.35+R()*.5:1.01;
  const adult=(o={})=>person({kind:0,rate:0,night,rain:rainGo,umbrella:.05+R()*.6,...o});
  if(r<.36){const p=adult();const q=R();if(q<.3)p.flags|=F.phone;else if(q<.45)p.flags|=F.bagR|(R()<.5?F.bagL:0);else if(q<.55)p.flags|=F.backpack;ag.members.push([p,0,0]);}
  else if(r<.5){ag.kind='couple';ag.members.push([adult({flags:R()<.2?F.bagR:0}),0,-.29],[adult({male:true}),0,.29]);ag.speed=1.1+R()*.25;}
  else if(r<.58){ag.kind='family';const p=adult({flags:F.holdR,night:.45}),kid=person({kind:0,kid:true,night:.45,rain:rainGo,flags:F.holdL,umbrella:2});ag.members.push([p,0,-.22],[kid,0,.3]);ag.speed=.95+R()*.2;stats.kids++;
   if(R()<.3){const k2=person({kind:0,kid:true,night:.45,rain:rainGo});ag.members.push([k2,-.9,0]);stats.kids++;}}
  else if(r<.65){ag.kind='dog';const p=adult({flags:F.leash});ag.members.push([p,0,0]);ag.dog={size:.55+R()*.6,coat:R()<.35?0:1+Math.floor(R()*6),phase:R()*TAU};ag.speed=1.0+R()*.3;stats.dogs++;}
  else if(r<.76){ag.kind='elderly';const cane=R()<.55,p=adult({kind:1,flags:cane?F.cane:0,hair:.8+R()*.2,lean:.12+R()*.1,night:.3+R()*.3});ag.members.push([p,0,0]);ag.speed=.6+R()*.25;stats.elderly++;
   if(!cane&&R()<.4){ag.members.push([adult({kind:1,hair:.75+R()*.25,lean:.08+R()*.08,night:.3}),0,.55]);ag.kind='elderly2';stats.elderly++;}}
  else if(r<.85){ag.kind='teens';const n=2+Math.floor(R()*2);for(let j=0;j<n;j++){const p=adult({teen:true,flags:(R()<.5?F.phone:0)|(R()<.5?F.backpack:0),night:R()<.7?1.01:.7});ag.members.push([p,j===2?-.8:0,j===2?0:(j?.3:-.3)]);}ag.speed=1.15+R()*.3;}
  else if(r<.9){ag.kind='friends';for(let j=0;j<2;j++)ag.members.push([adult({flags:R()<.3?F.cup:0}),0,j?.3:-.3]);ag.speed=1.0+R()*.25;}
  else{const p=adult({flags:R()<.6?F.bagR|F.bagL:F.bagR});ag.members.push([p,0,0]);}
  // The pace in the walk's cadence (a stride of about .75 m, the kids' shorter).
  for(const [p] of ag.members){p.rate=ag.speed/(p.kid?.5:p.kind===1?.55:.72)*Math.PI;p.agent=ag;stats.walkers++;}
  ag.f=ag.ft=keepRight(ag);agents.push(ag);stats.groups+=ag.members.length>1?1:0;
 }
 function keepRight(ag){const l=ag.lane;if(!l)return .5;return clamp(.5+(ag.dir>0===l.rightOut?.28:-.28)+(R()-.5)*.2,.12,.88);}
 // The waiters' little lanes at the botecos.
 for(const b of botecos)if(b.waiter){
  const {u0,u1,v}=b.waiter,pts=[];for(let u=u0;u<=u1+.01;u+=Math.max(.5,(u1-u0)/6)){const [x,y]=b.P(u,v);pts.push([x,y,gz(x,y)??b.z]);}
  if(pts.length<2||pts.some(([x,y])=>W(x,y)===0||blds.inside(x,y,.15))){b.waiter=null;stats.waiters--;continue;}
  const p=person({kind:9,lit:.8,flags:F.tray,top:0xf4f4f0,bottom:0x1b1d20,male:true,noClothes:true,night:1.01});p.rate=1.0/.62*Math.PI;
  const ag={private:pts,u:0,dir:1,speed:.85,members:[[p,0,0]],kind:'waiter',pause:R()*3};p.agent=ag;agents.push(ag);
 }
 stats.agents=agents.length;stats.people=people.length;
 const busiest=lanes.filter(l=>l.len>=40&&!l.living).sort((a,b)=>b.weight/b.len-a.weight/a.len).slice(0,8).map(l=>{const P=f=>{const i=Math.round(f*(l.n-1)),m=(l.lo[i]+l.hi[i])/2;return [+(l.x[i]+l.nx[i]*m).toFixed(1),+(l.y[i]+l.ny[i]*m).toFixed(1)];};return [...P(.15),...P(.6),+l.nx[0].toFixed(2),+l.ny[0].toFixed(2)];});
 stats.planMs=Date.now()-started;
 // Nothing of the scan is kept (the raster is 15 MB): the botecos keep their places, not the frames that found them.
 blds.free();for(const b of botecos){delete b.P;delete b.run;}
 return {people,agents,lanes,links,botecos,vendors,stops,smokes,shades,clearings,stats,F,share,sides:debug?sides:null,
  // For the checks' photos: some botecos, vendors and shelters, and the busiest lanes.
  where:{boteco:botecos.map(b=>[+b.x.toFixed(1),+b.y.toFixed(1),+b.side.toFixed(2)]).slice(0,8),vendor:vendors.map(v=>[v.kind,+v.x.toFixed(1),+v.y.toFixed(1),+Math.atan2(v.ny,v.nx).toFixed(2)]).slice(0,12),
   stop:stops.filter(s=>!s.none).map(s=>[+s.x.toFixed(1),+s.y.toFixed(1),+Math.atan2(s.by,s.bx).toFixed(2)]).slice(0,6),lane:busiest}};
}
const BOTECO_NAMES=['BAR SAIDEIRA ETERNA','BOTECO DA BANDEIRADA','BAR PNEU CARECA','BOTEQUIM VOLTA RÁPIDA','BAR DO ESCAPAMENTO','BOTECO DO PIT STOP','BAR ÚLTIMA VOLTA','BOTECO LARGADA QUEIMADA'];

// ================================================================ the figures
// One figure for everyone (x forward, y up, z to its right, feet at the origin), every part tagged with its limb, the
// carried thing it belongs to (a flag bit: shown only for those who carry it) and where its colour comes from.
const SK=0,TOP=1,BOT=2,SHOE=3,HAIR=4,ACC=5,FIX=6,SLEEVE=7;
function figureGeometry(fine=true){
 const parts=[],M=new THREE.Matrix4(),Q=new THREE.Quaternion(),E=new THREE.Euler(),S=new THREE.Vector3(),T=new THREE.Vector3();
 const put=(geo,limb,prop,slot,pos,rot=[0,0,0],scale=[1,1,1],color=[1,1,1])=>{
  geo.deleteAttribute('uv');geo.applyMatrix4(M.compose(T.set(...pos),Q.setFromEuler(E.set(...rot)),S.set(...scale)));
  const n=geo.attributes.position.count,a=new Float32Array(n*3),c=new Float32Array(n*3),bit=prop?Math.log2(prop)+1:0;
  for(let i=0;i<n;i++){a[i*3]=limb;a[i*3+1]=bit;a[i*3+2]=slot;c.set(color,i*3);}
  geo.setAttribute('part',new THREE.BufferAttribute(a,3));geo.setAttribute('color',new THREE.BufferAttribute(c,3));parts.push(geo);
 };
 const sph=(w,h)=>new THREE.SphereGeometry(1,fine?w:Math.max(5,w>>1),fine?h:Math.max(3,h>>1)),cap=(r,l)=>new THREE.CapsuleGeometry(r,l,1,fine?7:4),cyl=(a,b,h,s=8,open=false)=>new THREE.CylinderGeometry(a,b,h,fine?s:Math.max(4,s>>1),1,open),box=(x,y,z)=>new THREE.BoxGeometry(x,y,z);
 put(sph(8,6),12,0,BOT,[0,.95,0],[0,0,0],[.115,.115,.17]);
 put(cyl(.185,.16,.46,10),0,0,TOP,[0,1.2,0],[0,0,0],[.6,1,1]);
 put(new THREE.SphereGeometry(1,fine?9:5,fine?3:2,0,TAU,0,Math.PI/2),0,0,TOP,[0,1.425,0],[0,0,0],[.115,.075,.195]);
 put(cyl(.047,.054,.13,8),0,0,SK,[.005,1.5,0]);
 put(sph(11,7),9,0,SK,[.012,1.625,0],[0,0,0],[.104,.118,.094]);
 if(fine)put(box(.03,.045,.028),9,0,SK,[.112,1.612,0]);
 if(fine)for(const z of [-.034,.034]){put(box(.012,.016,.022),9,0,FIX,[.1,1.638,z],[0,0,0],[1,1,1],[.03,.025,.02]);put(box(.012,.008,.03),9,0,HAIR,[.104,1.662,z]);}
 put(new THREE.SphereGeometry(1,fine?11:6,fine?5:3,0,TAU,0,Math.PI*.55),9,0,HAIR,[-.006,1.637,0],[0,0,-.3],[.111,.124,.1]);
 put(box(.07,.3,.2),9,FL.longHair,HAIR,[-.075,1.5,0]);
 put(cyl(.112,.116,.07,12),9,FL.cap,ACC,[-.003,1.712,0]);put(box(.13,.014,.17),9,FL.cap,ACC,[.11,1.686,0],[0,0,-.12]);
 put(box(.16,.38,.29),0,FL.backpack,ACC,[-.19,1.2,0]);
 put(cyl(.16,.245,.42,12,true),12,FL.skirt,BOT,[0,.79,0],[0,0,0],[.85,1,1]);
 for(const s of [-1,1]){const L=s<0?0:1,z=s*.092,za=s*.205;
  put(cap(.068,.3),1+L,0,BOT,[0,.71,z]);put(cap(.052,.32),3+L,0,BOT,[0,.29,z]);put(box(.25,.085,.1),3+L,0,SHOE,[.045,.045,z]);
  put(cap(.047,.2),5+L,0,TOP,[0,1.28,za]);put(cap(.04,.2),7+L,0,SLEEVE,[0,1.0,za]);if(fine)put(sph(5,4),7+L,0,SK,[.005,.83,za],[0,0,0],[.042,.05,.032]);}
 put(box(.018,.135,.07),8,FL.phone,FIX,[.035,.82,.2],[0,0,0],[1,1,1],[.03,.03,.035]);
 put(cyl(.033,.029,.12,8),8,FL.cup,FIX,[.045,.85,.2],[0,0,0],[1,1,1],[.55,.33,.06]);
 put(box(.27,.32,.11),8,FL.bagR,ACC,[0,.6,.25]);put(box(.27,.32,.11),7,FL.bagL,ACC,[0,.6,-.25]);
 put(cyl(.17,.17,.015,8),7,FL.tray,FIX,[.07,.8,-.205],[0,0,-Math.PI/2],[1,1,1],[.7,.7,.72]);
 put(cyl(.03,.03,.12,6),7,FL.tray,FIX,[.13,.76,-.17],[0,0,-Math.PI/2],[1,1,1],[.6,.4,.08]);
 put(cyl(.01,.01,1.0,5),10,FL.umbrella,FIX,[0,.45,0],[0,0,0],[1,1,1],[.12,.12,.12]);put(new THREE.ConeGeometry(.56,.25,12,1,true),10,FL.umbrella,ACC,[0,1.0,0]);
 put(cyl(.012,.012,1,5),11,FL.cane,FIX,[0,.5,0],[0,0,0],[1,1,1],[.22,.15,.09]);
 const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());return g;
}
// The poses, in the vertex shader. Limbs: 0 torso, 1-2 thighs, 3-4 shins, 5-6 upper arms, 7-8 forearms, 9 head,
// 10 the umbrella (straight up from the right hand), 11 the cane (from the right hand to the ground), 12 hips; left
// first. Kinds: 0 walking, 1 an old person walking, 2 standing, 3 at a table, 4 on a bench or stool, 5 at the counter,
// 6 at the grill, 7 holding balloons, 9 the waiter. iA: phase, cadence, kind, flags; iB: trousers; iC: skin, hair;
// iD: stoop, standing style, light on them after dark, accessory colour.
const POSE_HEAD=`attribute vec3 part;attribute vec4 iA;attribute vec4 iB;attribute vec4 iC;attribute vec4 iD;uniform float lifeTime;uniform float lifeWalk;
vec2 lfR(vec2 p,float a){float c=cos(a),s=sin(a);return vec2(p.x*c-p.y*s,p.x*s+p.y*c);}
void lfZ(inout vec3 p,inout vec3 n,vec2 c,float a){p.xy=c+lfR(p.xy-c,a);n.xy=lfR(n.xy,a);}
void lfX(inout vec3 p,inout vec3 n,vec2 c,float a){p.yz=c+lfR(p.yz-c,a);n.yz=lfR(n.yz,a);}
void lfY(inout vec3 p,inout vec3 n,float a){p.zx=lfR(p.zx,a);n.zx=lfR(n.zx,a);}
void lfArm(inout vec3 p,inout vec3 n,bool fore,float sa,float ea,float ab,float sd,float lean){
 if(fore)lfZ(p,n,vec2(0.,1.13),ea);lfZ(p,n,vec2(0.,1.42),sa);lfX(p,n,vec2(1.42,.205*sd),-ab*sd);lfZ(p,n,vec2(0.,.95),-lean);}
void lifePose(inout vec3 p,inout vec3 n){
 int L=int(part.x+.5),fl=int(iA.w+.5);
 if(part.y>.5&&(fl&(1<<int(part.y-.5)))==0){p=vec3(0.);return;}
 float kind=iA.z,ph=iA.x,t=lifeTime,br=sin(t*1.25+ph),a=lifeWalk*iA.y+ph;
 vec2 th=vec2(0.),kn=vec2(0.),sa=vec2(.05),ea=vec2(.14),ab=vec2(.06);
 float lean=iD.x,drop=0.,hp=0.,hy=0.,bob=0.;
 bool walk=kind<1.5||(kind>8.5&&kind<9.5),old=kind>.5&&kind<1.5,seated=kind>2.5&&kind<4.5;
 if(walk){
  float amp=old?.22:.34;th=vec2(sin(a),-sin(a))*amp;
  kn=vec2(max(0.,sin(a-1.7)),max(0.,-sin(a-1.7)))*(old?.4:.62)+.05;
  sa=-th*.9;ea=.18+max(vec2(0.),-sa)*.5;ab=vec2(.07);bob=abs(cos(a))*.024;
  hy=.3*sin(t*.31+ph*3.)*step(.65,fract(ph*7.31));
 }else if(seated){
  th=vec2(1.52)+vec2(.05,-.03)*sin(ph*5.);kn=th;drop=.41;
  if(kind<3.5){lean=.12;sa=vec2(.55,.5);ea=vec2(1.1,1.2);hy=.35*sin(t*.23+ph*2.);}else{lean=.04;sa=vec2(.48,.45);ea=vec2(.6,.55);ab=vec2(.12);hy=.45*sin(t*.17+ph*2.);}
  hp=-.05*br;
 }else{
  float st=iD.y;sa=vec2(.05+.02*br);
  if(st>.5&&st<1.5){sa=vec2(.32);ea=vec2(1.72);ab=vec2(-.28);}
  else if(st>1.5&&st<2.5){sa=vec2(-.1);ea=vec2(.42);ab=vec2(.14);}
  else if(st>2.5){sa=vec2(-.15);ea=vec2(1.95);ab=vec2(.62);}
  hy=.55*sin(t*.19+ph*2.)*sin(t*.07+ph);lean+=.015*br;
  if(kind>4.5&&kind<5.5){lean=.14;sa.y=.88;ea.y=.42;ab.y=.05;}
  if(kind>5.5&&kind<6.5){lean=.16;sa=vec2(.52,.45);ea=vec2(1.05,1.3+.38*sin(t*7.5+ph));hp=-.25;hy=0.;}
  if(kind>6.5&&kind<7.5){sa.y=1.05;ea.y=.7;ab.y=.08;}
 }
 if((fl&2048)!=0){sa.x=.2;ab.x=.45;ea.x=.18;}
 if((fl&4096)!=0){sa.y=.06;ab.y=.2;ea.y=.1;}
 if((fl&8192)!=0){sa.x=.32;ea.x=.6;}
 if((fl&1024)!=0){sa.x=.14;ea.x=1.43;ab.x=.05;}
 if((fl&8)!=0){sa.y*=.3;ab.y=.13;}if((fl&16)!=0){sa.x*=.3;ab.x=.13;}
 if((fl&4)!=0){sa.y=.3+.14*sin(a);ea.y=.32;ab.y=.04;}
 if((fl&32)!=0){
  // A glass: held at the chest (on the table when seated), to the mouth now and then, each on its own clock.
  float d=smoothstep(.8,.97,sin(t*.31+ph*4.));if(!seated&&!walk){sa.y=.25;ea.y=1.25;}
  sa.y=mix(sa.y,.62,d);ea.y=mix(ea.y,2.45,d);hp+=.18*d;
 }
 if((fl&1)!=0){sa.y=.4;ea.y=1.5;ab.y=-.1;hp=-.36;hy*=.2;}
 if((fl&2)!=0){sa.y=.5;ea.y=1.2;ab.y=-.06;}
 if(L>=1&&L<=4){int s=(L==1||L==3)?0:1;if(L>=3)lfZ(p,n,vec2(0.,.5),-kn[s]);lfZ(p,n,vec2(0.,.92),th[s]);}
 else if(L>=5&&L<=8){int s=(L==5||L==7)?0:1;lfArm(p,n,L>=7,sa[s],ea[s],ab[s],s==0?-1.:1.,lean);}
 else if(L==10||L==11){
  vec3 hd=vec3(.005,.83,.205),dn=vec3(0.);lfArm(hd,dn,true,sa.y,ea.y,ab.y,1.,lean);
  if(L==10)p+=hd+vec3(0.,.02,0.);else{vec3 ft=vec3(hd.x+.14,0.,hd.z+.03);p=mix(ft,hd,p.y)+vec3(p.x,0.,p.z);}
 }else{
  if(L==9){lfZ(p,n,vec2(0.,1.5),hp);lfY(p,n,hy);}
  if(L!=12)lfZ(p,n,vec2(0.,.95),-lean);
 }
 p.y+=bob-drop;
}`;
const ACC_GLSL=`const vec3 lifeAcc[8]=vec3[8](vec3(.6,.04,.04),vec3(.02,.12,.45),vec3(.75,.55,.02),vec3(.03,.03,.03),vec3(.05,.3,.08),vec3(.8,.2,.4),vec3(.85,.85,.82),vec3(.35,.12,.5));`;
function peopleMaterials(U){
 const m=new THREE.MeshStandardMaterial({name:'Vida_gente',vertexColors:true,roughness:.82,metalness:0,side:THREE.DoubleSide});
 m.onBeforeCompile=sh=>{
  sh.uniforms.lifeTime=U.lifeTime;sh.uniforms.lifeWalk=U.lifeWalk;sh.uniforms.lifeNight=U.lifeNight;
  // After dark the bar's (the cart's, the shelter's) light on the people round it: iD.z.
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform float lifeNight;varying float vLit;')
   .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*vec3(1.,.8,.58)*vLit*lifeNight*.5;');
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\n'+POSE_HEAD+'\n'+ACC_GLSL+'\nvarying float vLit;')
   .replace('#include <beginnormal_vertex>','vec3 lifeP=position,lifeN=normal;lifePose(lifeP,lifeN);\nvec3 objectNormal=lifeN;\n#ifdef USE_TANGENT\nvec3 objectTangent=vec3(tangent.xyz);\n#endif')
   .replace('#include <begin_vertex>','vec3 transformed=lifeP;')
   .replace('#include <color_vertex>',`vColor=vec4(color,1.);vLit=iD.z;
{int fl=int(iA.w+.5),L=int(part.x+.5);float sl=part.z,h=iC.a;
 vec3 hair=h<.5?mix(vec3(.022,.016,.012),vec3(.42,.29,.15),h*2.):mix(vec3(.4,.38,.36),vec3(.85,.84,.8),h*2.-1.);
 float sh=fract(iA.x*3.7);vec3 shoe=sh<.4?vec3(.8,.8,.78):sh<.75?vec3(.035,.035,.04):vec3(.25,.14,.07);
 if(sl<.5)vColor.rgb=iC.rgb;else if(sl<1.5)vColor.rgb=instanceColor;
 else if(sl<2.5){vColor.rgb=iB.rgb;if(((fl&16384)!=0&&(L==3||L==4))||((fl&128)!=0&&L>=1&&L<=4))vColor.rgb=iC.rgb;}
 else if(sl<3.5)vColor.rgb=shoe;else if(sl<4.5)vColor.rgb=hair;else if(sl<5.5)vColor.rgb=lifeAcc[int(iD.w+.5)];
 else if(sl>6.5)vColor.rgb=(fl&32768)!=0?instanceColor:iC.rgb;}`);
 };
 m.customProgramCacheKey=()=>'city-life-gente-v1';
 const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});
 depth.onBeforeCompile=sh=>{sh.uniforms.lifeTime=U.lifeTime;sh.uniforms.lifeWalk=U.lifeWalk;
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\n'+POSE_HEAD).replace('#include <begin_vertex>','vec3 lifeP=position,lifeN=vec3(0.,1.,0.);lifePose(lifeP,lifeN);vec3 transformed=lifeP;');};
 depth.customProgramCacheKey=()=>'city-life-gente-sombra-v1';
 return {material:m,depth};
}
// --- Dogs: a body, a head, four legs at a trot, a wagging tail, the collar and the leash up to the owner's hand.
function dogGeometry(){
 const parts=[],M=new THREE.Matrix4(),Q=new THREE.Quaternion(),E=new THREE.Euler(),S=new THREE.Vector3(),T=new THREE.Vector3();
 const put=(geo,limb,slot,pos,rot=[0,0,0],scale=[1,1,1])=>{geo.deleteAttribute('uv');geo.applyMatrix4(M.compose(T.set(...pos),Q.setFromEuler(E.set(...rot)),S.set(...scale)));
  const n=geo.attributes.position.count,a=new Float32Array(n*2);for(let i=0;i<n;i++){a[i*2]=limb;a[i*2+1]=slot;}geo.setAttribute('part',new THREE.BufferAttribute(a,2));parts.push(geo);};
 put(new THREE.CapsuleGeometry(.11,.36,3,8),0,0,[0,.42,0],[0,0,Math.PI/2],[1,1,.85]);
 put(new THREE.CapsuleGeometry(.07,.12,3,6),6,0,[.24,.52,0],[0,0,-.9]);
 put(new THREE.SphereGeometry(1,10,7),6,0,[.32,.62,0],[0,0,0],[.1,.09,.085]);
 put(new THREE.BoxGeometry(.12,.065,.07),6,1,[.42,.595,0]);put(new THREE.BoxGeometry(.03,.03,.04),6,2,[.48,.61,0]);
 for(const s of [-1,1])put(new THREE.BoxGeometry(.04,.09,.045),6,1,[.3,.7,s*.055],[s*.3,0,.25]);
 for(const [L,x,z] of [[1,.2,-.075],[2,.2,.075],[3,-.2,-.075],[4,-.2,.075]]){put(new THREE.CapsuleGeometry(.034,.26,2,6),L,0,[x,.2,z]);put(new THREE.SphereGeometry(.04,6,4),L,1,[x+.02,.03,z]);}
 put(new THREE.CapsuleGeometry(.024,.2,2,5),5,0,[-.34,.55,0],[0,0,-.7]);
 put(new THREE.TorusGeometry(.068,.016,4,10),6,3,[.22,.5,0],[0,Math.PI/2,.65]);
 const leash=new THREE.CylinderGeometry(.007,.007,1,4,10,true).translate(0,.5,0);put(leash,7,3,[0,0,0]);
 const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());return g;
}
const DOG_HEAD=`attribute vec2 part;attribute vec4 dA;attribute vec4 dH;uniform float lifeTime;uniform float lifeWalk;
vec2 lfR(vec2 p,float a){float c=cos(a),s=sin(a);return vec2(p.x*c-p.y*s,p.x*s+p.y*c);}`;
function dogMaterial(U){
 const m=new THREE.MeshStandardMaterial({name:'Vida_caes',vertexColors:false,roughness:.85});
 m.onBeforeCompile=sh=>{sh.uniforms.lifeTime=U.lifeTime;sh.uniforms.lifeWalk=U.lifeWalk;
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\n'+DOG_HEAD+'\nvarying vec3 vDog;')
   .replace('#include <begin_vertex>',`vec3 transformed=position;
{int L=int(part.x+.5);float a=lifeWalk*dA.y+dA.x;
 if(L>=1&&L<=4){float s=(L==1||L==4)?1.:-1.;vec2 c=vec2(L<=2?.2:-.2,.36);transformed.xy=c+lfR(transformed.xy-c,.45*s*sin(a));}
 if(L==5){vec2 c=vec2(-.3,0.);transformed.xz=c+lfR(transformed.xz-c,.5*sin(lifeTime*9.+dA.x));}
 if(L==6)transformed.y+=.015*sin(a*2.);
 if(L<7)transformed.y+=abs(sin(a))*.014;
 else{float k=transformed.y;vec3 c=vec3(.25,.48,0.),q=mix(c,dH.xyz,k);q.y-=dH.w*4.*k*(1.-k);transformed=q+vec3(transformed.x,0.,transformed.z);}
 float sl=part.y;vDog=sl<.5?instanceColor:sl<1.5?instanceColor*.5:sl<2.5?vec3(.02):(fract(dA.x*5.3)<.5?vec3(.6,.03,.03):vec3(.03,.12,.5));}`)
   .replace('#include <color_vertex>','');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vDog;').replace('#include <color_fragment>','diffuseColor.rgb*=vDog;');
 };
 m.customProgramCacheKey=()=>'city-life-caes-v1';return m;
}

// ================================================================ the things
// Merged by tile in three's frame (x, height, -north): vertex colour, the atlas's uv (a white corner for plain
// things), extra = [sway (m), its phase, glow after dark, glow always].
const E0=[0,0,0,0];
const tplOf=g=>{const n=g.index?g:g;const o={p:n.attributes.position.array,n:n.attributes.normal.array,i:n.index?Array.from(n.index.array):[...Array(n.attributes.position.count).keys()]};g.dispose();return o;};
let TPL=null;
const templates=()=>TPL??=({box:tplOf(new THREE.BoxGeometry(1,1,1)),cyl6:tplOf(new THREE.CylinderGeometry(1,1,1,6)),cyl10:tplOf(new THREE.CylinderGeometry(1,1,1,10)),
 ball:tplOf(new THREE.SphereGeometry(1,8,6)),bulb:tplOf(new THREE.SphereGeometry(1,5,4)),wheel:tplOf(new THREE.CylinderGeometry(1,1,1,10).rotateX(Math.PI/2))});
const WHITE=[4/1024,1-4/1024];
class Props{
 constructor(){this.p=[];this.n=[];this.c=[];this.t=[];this.e=[];this.i=[];}
 get size(){return this.p.length/3;}
 // A template placed at track point (x, y, z), turned to heading h (its local x forward), scaled, tilted (pitch about
 // its local z, roll about its local x).
 put(tpl,x,y,z,h,sx,sy,sz,col,e=E0,pitch=0,roll=0){
  _E.set(roll,h,pitch,'YXZ');_M.compose(_V.set(x,z,-y),_Q.setFromEuler(_E),_S.set(sx,sy,sz));_N.getNormalMatrix(_M);
  const k=this.size,P=tpl.p,N=tpl.n;
  for(let j=0;j<P.length;j+=3){_V.set(P[j],P[j+1],P[j+2]).applyMatrix4(_M);this.p.push(_V.x,_V.y,_V.z);_V.set(N[j],N[j+1],N[j+2]).applyMatrix3(_N).normalize();this.n.push(_V.x,_V.y,_V.z);
   this.c.push(col[0],col[1],col[2]);this.e.push(e[0],e[1],e[2],e[3]);this.t.push(WHITE[0],WHITE[1]);}
  for(const q of tpl.i)this.i.push(k+q);
 }
 // A box by its bottom centre.
 box(x,y,z,h,lx,ly,lz,col,e,pitch=0,roll=0){this.put(templates().box,x,y,z+lz/2,h,lx,lz,ly,col,e,pitch,roll);}
 // A rod between two track points.
 rod(a,b,r,col,e=E0,tpl=templates().cyl6){
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],l=Math.hypot(dx,dy,dz)||1e-6;
  _D.set(dx/l,dz/l,-dy/l);_Q.setFromUnitVectors(_UP,_D);_M.compose(_V.set((a[0]+b[0])/2,(a[2]+b[2])/2,-(a[1]+b[1])/2),_Q,_S.set(r,l,r));_N.getNormalMatrix(_M);
  const k=this.size,P=tpl.p,N=tpl.n;
  for(let j=0;j<P.length;j+=3){_V.set(P[j],P[j+1],P[j+2]).applyMatrix4(_M);this.p.push(_V.x,_V.y,_V.z);_V.set(N[j],N[j+1],N[j+2]).applyMatrix3(_N).normalize();this.n.push(_V.x,_V.y,_V.z);
   this.c.push(col[0],col[1],col[2]);this.e.push(e[0],e[1],e[2],e[3]);this.t.push(WHITE[0],WHITE[1]);}
  for(const q of tpl.i)this.i.push(k+q);
 }
 v(p,n,c,uv,e){this.p.push(p[0],p[2],-p[1]);this.n.push(n[0],n[2],-n[1]);this.c.push(c[0],c[1],c[2]);this.t.push(uv[0],uv[1]);this.e.push(e[0],e[1],e[2],e[3]);return this.size-1;}
 // A triangle (track points), both faces when `both`; per-vertex extra optional.
 tri(a,b,c,col,e=E0,both=true,ea=e,eb=e){
  const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],w=[c[0]-a[0],c[1]-a[1],c[2]-a[2]],n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],l=Math.hypot(...n)||1;n[0]/=l;n[1]/=l;n[2]/=l;
  const k=this.v(a,n,col,WHITE,ea);this.v(b,n,col,WHITE,eb);this.v(c,n,col,WHITE,e);this.i.push(k,k+1,k+2);
  if(both){const m=[-n[0],-n[1],-n[2]],j=this.v(a,m,col,WHITE,ea);this.v(c,m,col,WHITE,e);this.v(b,m,col,WHITE,eb);this.i.push(j,j+1,j+2);}
 }
 // A sign: a quad w x h centred on (x, y, z), its face toward heading h, the atlas cell uv=[u0,v0,u1,v1]; its back plain.
 sign(x,y,z,h,w,ht,uv,e=E0,back=null,tilt=0){
  const fx=Math.cos(h),fy=Math.sin(h),rx=fy,ry=-fx,ct=Math.cos(tilt),st=Math.sin(tilt);
  const P=(s,t)=>[x+rx*s*w/2-fx*st*t*ht/2,y+ry*s*w/2-fy*st*t*ht/2,z+ct*t*ht/2],n=[fx*ct,fy*ct,st];
  const k=this.v(P(-1,-1),n,[1,1,1],[uv[0],uv[1]],e);this.v(P(1,-1),n,[1,1,1],[uv[2],uv[1]],e);this.v(P(1,1),n,[1,1,1],[uv[2],uv[3]],e);this.v(P(-1,1),n,[1,1,1],[uv[0],uv[3]],e);this.i.push(k,k+1,k+2,k,k+2,k+3);
  if(back){const m=[-n[0],-n[1],-n[2]],j=this.v(P(1,-1),m,back,WHITE,E0);this.v(P(-1,-1),m,back,WHITE,E0);this.v(P(-1,1),m,back,WHITE,E0);this.v(P(1,1),m,back,WHITE,E0);this.i.push(j,j+1,j+2,j,j+2,j+3);}
 }
 get triangles(){return this.i.length/3;}
 build(){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(this.t,2));g.setAttribute('extra',new THREE.Float32BufferAttribute(this.e,4));
  g.setIndex(this.size>65535?new THREE.Uint32BufferAttribute(this.i,1):new THREE.Uint16BufferAttribute(this.i,1));g.computeBoundingSphere();g.computeBoundingBox();return g;
 }
}
const _M=new THREE.Matrix4(),_N=new THREE.Matrix3(),_Q=new THREE.Quaternion(),_E=new THREE.Euler(),_V=new THREE.Vector3(),_S=new THREE.Vector3(),_D=new THREE.Vector3(),_UP=new THREE.Vector3(0,1,0);

// --- The atlas: 1024 px (pit-textures.js canvasTexture). The carts' signs, the botecos' chalk boards, the TV
// screens with the race, the coolers' cardboard prices. Joke names only.
const CART_SIGNS=[['PIPOCA TURBO','doce · salgada · com bacon','#c0392b','#fff6d8'],['PIPOCA DO VÁCUO','estoura antes da largada','#f1c40f','#7a1f12'],
 ['ESPETINHO BANDEIRADA','carne · frango · coalho','#3b2314','#ffcc66'],['CHURRASQUINHO DO MANÉ','com farofa ou sem desculpa','#8e1b1b','#fff0d0'],
 ['CACHORRO-QUENTE DO BOX','completo · purê · batata palha','#e67e22','#2b1308'],['DOGÃO VOLTA LENTA','sai rápido (às vezes)','#1f5fa8','#ffe9a8'],
 ['ÁGUA DE COCO','gelada que nem pista molhada','#2f8a3a','#f7ffe6'],['COCO DO PIT STOP','abastece o piloto','#4a7a1f','#fffbe0']];
const CART_OF={pipoca:[0,1],churrasco:[2,3],dogao:[4,5],coco:[6,7]};
const BOARD_MENU=[['CERVEJA GELADA','*às vezes','PORÇÃO DE FRITAS','CALDINHO'],['HOJE TEM','CORRIDA NA TV','PASTEL DE VENTO','R$ 1,99'],
 ['PF DO PILOTO','arroz, feijão','e marcha ré','FIADO SÓ AMANHÃ'],['SEQUÊNCIA DE','CAMARÃO','(foi ontem)','TAINHA SÓ EM MAIO'],
 ['ACEITAMOS','VALE-PASTEL','NÃO ACEITAMOS','PRESSA'],['PROMOÇÃO','2 PASTÉIS','PELO PREÇO','DE 3 !!!'],
 ['SALGADO','DE ONTEM','PREÇO','DE AMANHÃ'],['BANHEIRO SÓ','PRA CLIENTE','(PILOTO','TAMBÉM)']];
const COOLER_SIGNS=[['ÁGUA 3','REFRI 5','LATÃO 8'],['GELADA!','ÁGUA · REFRI','CERVEJA'],['ÁGUA 4','GELO DE GRAÇA','(DERRETIDO)'],['TEM','GELADA','PRO PILOTO']];
const CELL={cart:k=>[(k%4)*256,64+Math.floor(k/4)*64,256,64],board:k=>[k*128,192,128,192],tv:k=>[k*256,384,256,144],cooler:k=>[k*128,528,128,96]};
const uvOf=([x,y,w,h])=>[(x+1)/1024,1-(y+h-1)/1024,(x+w-1)/1024,1-(y+1)/1024];
function paintAtlas(ctx,w,h){
 const R=random(6602),BOLD=s=>`900 ${s}px "Arial Black","Arial Bold",Arial,sans-serif`,CHALK=s=>`700 ${s}px "Segoe Print","Comic Sans MS","Chalkboard SE",cursive`;
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);
 const text=(t,x,y,max,font,size,color)=>{let s=size;ctx.font=font(s);while(s>8&&ctx.measureText(t).width>max){s--;ctx.font=font(s);}ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,x,y);};
 CART_SIGNS.forEach(([title,sub,bg,fg],k)=>{const [x,y,cw,ch]=CELL.cart(k);ctx.fillStyle=bg;ctx.fillRect(x,y,cw,ch);ctx.strokeStyle=fg;ctx.lineWidth=3;ctx.strokeRect(x+4,y+4,cw-8,ch-8);
  text(title,x+cw/2,y+25,cw-20,BOLD,24,fg);ctx.font='italic bold 14px Arial,sans-serif';text(sub,x+cw/2,y+48,cw-24,s=>`italic bold ${s}px Arial,sans-serif`,14,fg);});
 BOARD_MENU.forEach((lines,k)=>{const [x,y,cw,ch]=CELL.board(k);
  ctx.fillStyle='#6b4a2b';ctx.fillRect(x,y,cw,ch);ctx.fillStyle=['#1f2a24','#232323','#1c2620','#25211d'][k%4];ctx.fillRect(x+6,y+6,cw-12,ch-12);
  for(let i=0;i<60;i++){ctx.globalAlpha=.05+R()*.08;ctx.fillStyle='#e8e8e0';ctx.fillRect(x+6+R()*(cw-12),y+6+R()*(ch-12),2+R()*10,1+R()*3);}ctx.globalAlpha=1;
  text(BOTECO_NAMES[k%BOTECO_NAMES.length],x+cw/2,y+24,cw-18,CHALK,15,'#ffe27a');
  ctx.strokeStyle='rgba(240,240,230,.6)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x+16,y+38);ctx.lineTo(x+cw-16,y+38);ctx.stroke();
  lines.forEach((l,i)=>text(l,x+cw/2,y+60+i*30,cw-18,CHALK,i%2?14:16,i===3?'#ff9f9f':'#f2f2ea'));});
 for(let k=0;k<4;k++){const [x,y,cw,ch]=CELL.tv(k);
  // The race on TV: the asphalt from a high camera, the kerbs, a few cars, the caption.
  const g=ctx.createLinearGradient(x,y,x,y+ch);g.addColorStop(0,['#5f8f4a','#4d7a3f','#6b8f5a','#587f46'][k]);g.addColorStop(1,'#3c6631');ctx.fillStyle=g;ctx.fillRect(x,y,cw,ch);
  ctx.save();ctx.beginPath();ctx.rect(x,y,cw,ch);ctx.clip();ctx.translate(x+cw/2,y+ch/2+10);ctx.rotate((k-1.5)*.18);
  ctx.fillStyle='#55585c';ctx.fillRect(-cw,-26,cw*2,52);for(let i=-12;i<12;i++){ctx.fillStyle=i%2?'#d42a2a':'#f2f2f2';ctx.fillRect(i*22,-31,22,5);ctx.fillRect(i*22+11,26,22,5);}
  ctx.strokeStyle='#e9e9e9';ctx.setLineDash([14,10]);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-cw,0);ctx.lineTo(cw,0);ctx.stroke();ctx.setLineDash([]);
  for(let c=0;c<3+k%2;c++){ctx.fillStyle=['#111','#c81d25','#f0c419','#1f5fa8','#eee'][(c+k)%5];const cx=-60+c*48+R()*12,cy=(c%2?-10:10)+R()*6;ctx.fillRect(cx,cy-7,30,14);ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(cx+18,cy-5,7,10);}
  ctx.restore();
  ctx.fillStyle='rgba(10,12,16,.82)';ctx.fillRect(x,y+ch-26,cw,26);ctx.fillStyle='#e0262b';ctx.fillRect(x+6,y+ch-21,52,16);
  ctx.fillStyle='#fff';ctx.font='bold 11px Arial,sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText('AO VIVO',x+10,y+ch-13);ctx.fillText(`AUTÓDROMO FLORIPA · VOLTA ${3+k*2}/12`,x+66,y+ch-13);
  ctx.fillStyle='rgba(10,12,16,.75)';ctx.fillRect(x+6,y+8,52,58);ctx.font='bold 10px Arial,sans-serif';[['1','99'],['2','07'],['3','12'],['4','31']].forEach(([p,n],i)=>{ctx.fillStyle='#fff';ctx.fillText(`${p}  #${(+n+k*3)%99||99}`,x+11,y+17+i*13);});
 }
 COOLER_SIGNS.forEach((lines,k)=>{const [x,y,cw,ch]=CELL.cooler(k);ctx.fillStyle='#c9a675';ctx.fillRect(x,y,cw,ch);for(let i=0;i<30;i++){ctx.globalAlpha=.08;ctx.fillStyle='#6b4f2a';ctx.fillRect(x,y+R()*ch,cw,1);}ctx.globalAlpha=1;
  lines.forEach((l,i)=>text(l,x+cw/2,y+20+i*28,cw-12,s=>`900 ${s}px "Arial Black",Arial,sans-serif`,i===0?20:15,i===0?'#b3121b':'#1b2a6b'));});
}

// --- The things themselves, in a Props builder `G`, track coordinates.
const PLASTIC=[[0xc8202a,0xb81c25],[0xf2c21b,0xe3b012],[0xf2f1ec,0xe2e1da],[0xd9d6cd,0xc9c4b8]].map(p=>p.map(c=>lin(c)));
// (e: the bar's light on them after dark, as on its people.)
function plasticTable(G,x,y,z,h,col,e=E0){
 const c=Math.cos(h),s=Math.sin(h),P=(u,v,w)=>[x+u*c-v*s,y+u*s+v*c,z+w];
 G.box(x,y,z+.705,h,.7,.7,.03,col,e);G.box(x,y,z+.64,h,.62,.62,.065,col.map(v=>v*.93),e);
 for(const [u,v] of [[1,1],[1,-1],[-1,1],[-1,-1]])G.rod(P(u*.29,v*.29,.66),P(u*.31,v*.31,0),.024,col,e);
}
function plasticChair(G,x,y,z,h,col,turn=0,e=E0){
 // A monobloc chair with arms facing heading h (its seat's back at -x): the Brazilian bar's own.
 const hh=h+turn,c=Math.cos(hh),s=Math.sin(hh),P=(u,v,w)=>[x+u*c-v*s,y+u*s+v*c,z+w];
 const [cx,cy]=P(-.02,0,0);G.box(cx,cy,z+.42,hh,.44,.44,.04,col,e);
 const [bx,by]=P(-.24,0,0);G.box(bx,by,z+.46,hh,.035,.42,.42,col,e,.17);
 for(const v of [-1,1]){G.rod(P(-.22,v*.21,.68),P(.17,v*.21,.6),.02,col,e);G.rod(P(.17,v*.21,.6),P(.17,v*.21,.44),.018,col,e);}
 for(const [u,v] of [[1,1],[1,-1],[-1,1],[-1,-1]])G.rod(P(u*.18-.02,v*.18,.42),P(u*.23-.02,v*.23,0),.02,col,e);
}
function tableItems(G,t,R){
 const c=Math.cos(t.h),s=Math.sin(t.h),P=(u,v)=>[t.x+u*c-v*s,t.y+u*s+v*c],top=t.z+.735,T=templates();
 for(let k=0,n=1+Math.floor(R()*3);k<n;k++){const [x,y]=P((R()-.5)*.4,(R()-.5)*.4),glass=R()<.65?lin(0x4a2a0c):lin(0x1c4a22);
  G.put(T.cyl10,x,y,top+.09,0,.037,.18,.037,glass);G.put(T.cyl6,x,y,top+.215,0,.014,.07,.014,glass);G.put(T.cyl6,x,y,top+.255,0,.016,.012,.016,lin(0xd9d4c8));}
 for(let k=0,n=Math.floor(R()*4);k<n;k++){const [x,y]=P((R()-.5)*.48,(R()-.5)*.48);G.put(T.cyl10,x,y,top+.045,0,.032,.09,.032,lin(0xd8a01c,.9));G.put(T.cyl10,x,y,top+.097,0,.033,.014,.033,lin(0xf4f0e6));}
 if(R()<.45){const [x,y]=P((R()-.5)*.2,(R()-.5)*.2);G.put(T.cyl10,x,y,top+.008,0,.12,.016,.12,lin(0xf2f0ea));for(let k=0;k<7;k++)G.put(T.ball,x+(R()-.5)*.14,y+(R()-.5)*.14,top+.03,R()*3,.035,.02,.016,lin(R()<.5?0xd9a23a:0xc98a2a));}
 if(R()<.5){const [x,y]=P(.24,-.2);G.box(x,y,top,t.h,.09,.05,.08,lin(0xc8ccd0));}
}
function umbrella(G,x,y,z,h,R,cols){
 const T=templates(),r=1.05+R()*.2,top=2.38+R()*.12,n=8;G.put(T.cyl6,x,y,z+top/2,0,.022,top,.022,lin(0xe8e6e0));
 const ring=[];for(let k=0;k<n;k++){const a=h+k/n*TAU;ring.push([x+Math.cos(a)*r,y+Math.sin(a)*r,z+top-.42]);}
 for(let k=0;k<n;k++){const col=cols[k%cols.length];G.tri([x,y,z+top+.04],ring[k],ring[(k+1)%n],col);
  // A short valance hanging from the edge.
  const a=ring[k],b=ring[(k+1)%n];G.tri(a,b,[b[0],b[1],b[2]-.12],col);G.tri(a,[b[0],b[1],b[2]-.12],[a[0],a[1],a[2]-.12],col);}
}
// A catenary cable between two points with warm bulbs every half metre, lit after dark.
function stringLights(G,a,b,R){
 const l=Math.hypot(b[0]-a[0],b[1]-a[1]),sag=Math.min(.45,.04*l+.12),n=Math.max(4,Math.round(l/.45)),pts=[];
 for(let k=0;k<=n;k++){const t=k/n;pts.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t-4*sag*t*(1-t)]);}
 for(let k=0;k<n;k++)G.rod(pts[k],pts[k+1],.006,lin(0x161616));
 const T=templates();for(let k=1;k<n;k++){const p=pts[k],warm=R()<.15?lin(0xfff2c8):lin(0xffd9a0);G.put(T.bulb,p[0],p[1],p[2]-.06,0,.042,.054,.042,warm,[0,0,7+R()*3,.15]);}
}
function counter(G,b,R){
 const {x,y,z,h}=b.counter,side=b.side,c=Math.cos(h),s=Math.sin(h),fx=Math.cos(side),fy=Math.sin(side);
 const body=pick(R,[lin(0x8a5a33),lin(0xd8d2c4),lin(0x9aa3a8),lin(0x3d6e8c)]);
 G.box(x,y,z,h,1.8,.5,1.0,body);G.box(x-fx*.02,y-fy*.02,z+1.0,h,1.9,.6,.04,lin(0x2b2b2e));
 // The glass case of salgados on it, lit warm.
 const ex=x+c*.35,ey=y+s*.35;G.box(ex,ey,z+1.04,h,.8,.4,.34,lin(0x9cc0c8,.55),[0,0,.25,.04]);
 for(let k=0;k<9;k++)G.put(templates().ball,ex+c*((k%3)-1)*.22+fx*((k/3|0)-1)*.1,ey+s*((k%3)-1)*.22+fy*((k/3|0)-1)*.1,z+1.09,R()*3,.045,.035,.04,lin(pick(R,[0xc8782a,0xd9993f,0xb5651d])),[0,0,1.2,.25]);
 // Crates of empties stacked by it.
 if(R()<.75){const cx=x-c*1.25+fx*.1,cy=y-s*1.25+fy*.1,col=pick(R,[lin(0xf2c21b),lin(0xc8202a),lin(0x2f6b3a)]);for(let k=0,n=2+Math.floor(R()*3);k<n;k++)G.box(cx+(R()-.5)*.04,cy+(R()-.5)*.04,z+k*.29,h+(R()-.5)*.2,.4,.32,.28,col.map(v=>v*(.9+R()*.2)));}
}
function menuBoard(G,m,k){
 const {x,y,z,h}=m,uv=uvOf(CELL.board(k%8)),wood=lin(0x6b4a2b),c=Math.cos(h),s=Math.sin(h);
 for(const e of [1,-1]){const ox=x+c*e*.16,oy=y+s*e*.16;G.sign(ox,oy,z+.5,h+(e<0?Math.PI:0),.5,.9,uv,E0,wood,-.17);}
}
function tvStand(G,m,R){
 const {x,y,z,h}=m,c=Math.cos(h),s=Math.sin(h),dark=lin(0x111214);
 for(const e of [-1,1])G.rod([x+(-s)*e*.3,y+c*e*.3,z],[x,y,z+1.25],.02,lin(0x3a3d40));G.rod([x-c*.3,y-s*.3,z],[x,y,z+1.25],.02,lin(0x3a3d40));
 G.rod([x,y,z+1.2],[x,y,z+1.75],.03,lin(0x3a3d40));G.box(x-c*.03,y-s*.03,z+1.7,h,.07,1.0,.6,dark);
 G.sign(x+c*.006,y+s*.006,z+2.0,h,.92,.52,uvOf(CELL.tv(Math.floor(R()*4))),[0,0,.6,.75]);
}
function vendorCart(G,v,R){
 const {x,y,z,h,kind}=v,c=Math.cos(h),s=Math.sin(h),nx=-v.nx,ny=-v.ny,P=(u,w)=>[x+c*u+nx*w,y+s*u+ny*w],T=templates(),face=Math.atan2(ny,nx);
 const wheel=(u,w,r)=>{const [px,py]=P(u,w);G.put(T.wheel,px,py,z+r,h,r,r,.05,lin(0x1b1b1b));};
 const canopy=(lu,lw,zz,cols)=>{const q=[P(-lu,-lw),P(lu,-lw),P(lu,lw),P(-lu,lw)].map(p=>[...p,z+zz]);const m=[x,y,z+zz+.18];for(let k=0;k<4;k++)G.tri(m,q[k],q[(k+1)%4],cols[k%cols.length]);
  for(const p of q)G.rod([p[0],p[1],z+.9],p,.015,lin(0xcfcfcf));};
 const cell=k=>uvOf(CELL.cart(k));
 if(kind==='pipoca'){
  const red=lin(0xc8202a);G.box(x,y,z+.32,h,1.0,.55,.62,red);G.box(x,y,z+.94,h,.78,.46,.04,lin(0xdedede));
  // The glass case: its frame and lid (the popcorn heaped inside shows through), lit after dark.
  G.box(x,y,z+.98,h,.62,.36,.22,lin(0xffe17a),[0,0,.7,.1]);for(let k=0;k<14;k++){const [px,py]=P((R()-.5)*.55,(R()-.5)*.3);G.put(T.ball,px,py,z+1.2,R()*3,.07,.05,.06,lin(pick(R,[0xfff0b0,0xffe58a,0xf6d36a])),[0,0,.7,.1]);}
  for(const [u,w] of [[-.35,-.21],[.35,-.21],[-.35,.21],[.35,.21]]){const [px,py]=P(u,w);G.rod([px,py,z+.98],[px,py,z+1.42],.012,lin(0xd8d8d8));}G.box(x,y,z+1.42,h,.74,.46,.03,lin(0xc8202a));
  wheel(-.38,-.24,.17);wheel(-.38,.24,.17);wheel(.4,0,.13);canopy(.55,.38,1.95,[lin(0xc8202a),lin(0xf4f1ea)]);
  const [sx,sy]=P(0,-.3);G.sign(sx,sy,z+.62,face,.95,.24,cell(CART_OF.pipoca[Math.floor(R()*2)]));
 }else if(kind==='churrasco'){
  const steel=lin(0x2b2c2e);for(const [u,w] of [[-.4,-.12],[.4,-.12],[-.4,.12],[.4,.12]])G.rod([...P(u,w),z],[...P(u,w),z+.8],.016,steel);
  G.box(x,y,z+.78,h,.92,.3,.17,steel);G.box(x,y,z+.9,h,.84,.24,.02,lin(0xff5a10),[0,0,1.5,1.4]);
  for(let k=0;k<7;k++){const u=-.35+k*.115;G.rod([...P(u,-.2),z+.97],[...P(u,.2),z+.97],.006,lin(0xc9b48a));for(let j=0;j<3;j++){const [px,py]=P(u,-.06+j*.07);G.put(T.ball,px,py,z+.975,R()*3,.03,.025,.028,lin(pick(R,[0x6b2b14,0x8a3a18,0xe8d8a8])));}}
  const [cx,cy]=P(.85,.1);G.box(cx,cy,z,h,.5,.34,.36,lin(0xf2f2ee));
  const [sx,sy]=P(-.75,.0);G.rod([sx,sy,z],[sx,sy,z+1.3],.015,lin(0x6b4a2b));G.sign(sx,sy,z+1.42,face,.6,.16,cell(CART_OF.churrasco[Math.floor(R()*2)]),E0,lin(0x6b4a2b));
 }else if(kind==='dogao'){
  const body=pick(R,[lin(0xf2c21b),lin(0xe8e4da),lin(0xc8202a)]);G.box(x,y,z+.3,h,1.5,.75,.68,body);G.box(x,y,z+.98,h,1.6,.82,.04,lin(0xb9bec2));
  G.box(x+c*.35,y+s*.35,z+1.02,h,.5,.4,.14,lin(0xbcc4c8,.6),[0,0,.4,.05]);for(let k=0;k<4;k++){const [px,py]=P(-.5+k*.13,0);G.put(T.cyl6,px,py,z+1.05,0,.03,.12,.03,lin(pick(R,[0xc8202a,0xe8c31a,0xf4f0e6])));}
  wheel(-.5,-.38,.2);wheel(.5,-.38,.2);canopy(.85,.5,2.1,[lin(0xc8202a),lin(0xf2c21b)]);
  const [sx,sy]=P(0,-.39);G.sign(sx,sy,z+.66,face,1.3,.33,cell(CART_OF.dogao[Math.floor(R()*2)]));
  const [lx,ly]=P(0,0);G.put(T.bulb,lx,ly,z+2.0,0,.06,.06,.06,lin(0xffe0a8),[0,0,6,.2]);
 }else if(kind==='coco'){
  G.box(x,y,z+.25,h,1.1,.6,.5,lin(0x7a5a3a));wheel(-.4,-.32,.22);wheel(-.4,.32,.22);
  for(let k=0;k<16;k++){const lay=k<9?0:k<14?1:2,i=lay===0?k:lay===1?k-9:k-14,cols=lay===0?3:lay===1?2:1,[px,py]=P(((i%cols)-(cols-1)/2)*.22,(Math.floor(i/cols)-(lay===0?1:lay===1?1:0))*.2);
   G.put(T.ball,px+(R()-.5)*.03,py+(R()-.5)*.03,z+.85+lay*.17,R()*3,.11,.12,.1,lin(pick(R,[0x4f8a2a,0x5c9a30,0x6aa53a,0x8a9a3a])));}
  umbrella(G,...P(.2,.25),z,h,R,[lin(0x2f8a3a),lin(0xf4f1ea)]);
  const [sx,sy]=P(0,-.31);G.sign(sx,sy,z+.5,face,1.0,.25,cell(CART_OF.coco[Math.floor(R()*2)]));
 }else if(kind==='isopor'){
  const [ix,iy]=P(0,0);G.box(ix,iy,z+.1,h,.58,.4,.4,lin(0xf4f4f2));G.box(ix,iy,z+.5,h,.6,.42,.05,lin(0xe8e8e6));
  wheel(-.25,.22,.1);wheel(.25,.22,.1);G.rod([...P(-.25,.28),z+.1],[...P(-.2,.42),z+1.0],.012,lin(0x9aa0a4));G.rod([...P(.25,.28),z+.1],[...P(.2,.42),z+1.0],.012,lin(0x9aa0a4));
  for(let k=0;k<5;k++){const [px,py]=P(-.2+k*.1,-.05);G.put(T.cyl6,px,py,z+.6,0,.03,.12,.03,lin(pick(R,[0xc8202a,0xbfc6cc,0x2b7cc4,0xe8c31a])));}
  umbrella(G,...P(.35,.55),z,h,R,pick(R,[[lin(0xe23b2e),lin(0xf2c21b),lin(0x2b7cc4),lin(0x2f8a3a)],[lin(0xf4f1ea),lin(0x1f5fa8)],[lin(0xf28c28),lin(0xf4f1ea)]]));
  const [sx,sy]=P(.55,-.0);G.sign(sx,sy,z+.95,face,.36,.27,uvOf(CELL.cooler(Math.floor(R()*4))),E0,lin(0xc9a675));G.rod([sx,sy,z],[sx,sy,z+.82],.012,lin(0x6b4a2b));
  // The vendor's stool.
  const [tx,ty]=P(0,.62);G.put(T.cyl10,tx,ty,z+.42,0,.16,.03,.16,lin(0xc8202a));for(const a of [0,2.1,4.2])G.rod([tx+Math.cos(a)*.1,ty+Math.sin(a)*.1,z+.41],[tx+Math.cos(a)*.15,ty+Math.sin(a)*.15,z],.015,lin(0xc8202a));
 }
}
// The balloon seller's bunch: on strings from the raised right hand, each its colour and its sway.
function balloons(G,v,p,R){
 const c=Math.cos(p.h),s=Math.sin(p.h),hx=p.x+c*.3+s*.22,hy=p.y+s*.3-c*.22,hz=p.z+1.72*p.scale,T=templates();
 for(let k=0;k<15;k++){const a=R()*TAU,r=.15+R()*.45,bx=hx+Math.cos(a)*r,by=hy+Math.sin(a)*r,bz=hz+.6+R()*.75,ph=R()*TAU,col=lin(pick(R,[0xe8202a,0xf2c21b,0x1f8ad8,0x2fb84a,0xf06fb4,0xff8a1c,0x8a4fd8,0xf4f4f2])),sw=[.06+R()*.05,ph,0,.04];
  G.put(T.ball,bx,by,bz,0,.15,.18,.15,col,sw);G.tri([hx,hy,hz],[bx,by,bz-.17],[bx+.008,by,bz-.17],lin(0xdddddd),E0,true,E0,sw);}
}

// ================================================================ the module
export async function createCityLife(data,{mobile=false,lean=false,ground=null,map=null}={}){
 const root=new THREE.Group();root.name='Vida_cidade';root.userData.noReflection=true;
 const city=data.scenery?.city;
 if(!city||!map||!ground)return {root,stats:{people:0}};
 const started=performance.now(),light=mobile||lean;
 const plan=planCityLife(data,{mobile,lean,ground,map}),{people,agents,lanes,links,botecos,vendors,smokes,shades}=plan,stats=plan.stats;
 const U={lifeTime:{value:0},lifeWalk:{value:0},lifeNight:{value:0}},R=random(9011);
 // In a zone of the city open to roam (meta.roam, physics.js RoamWorld) the botecos' tables (with their chairs round them)
 // and the street vendors' carts are solid.
 if(data.meta.roam)stats.roamSolids=addRoamSolids(data,[...botecos.flatMap(b=>b.tables.map(t=>({x:t.x,y:t.y,r:.75}))),...vendors.map(v=>({x:v.x,y:v.y,r:.8}))]);
 const reach=mobile?200:lean?180:270,reach2=reach*reach,propReach=mobile?260:lean?240:430;

 // ---------------------------------------------------------------- the things, by tile
 const tiles=new Map(),tileOf=(x,y)=>{const k=Math.floor(x/TILE)+':'+Math.floor(y/TILE);let g=tiles.get(k);if(!g)tiles.set(k,g=new Props());return g;};
 const pools=[];
 botecos.forEach((b,bi)=>{
  const G=tileOf(b.x,b.y),Q=random(bi*131+7),set=PLASTIC[b.set],glow=[0,0,b.lights?.22:.13,0];
  for(const t of b.tables){
   const odd=Q()<.12?PLASTIC[(b.set+1+Math.floor(Q()*3))%4]:set;
   plasticTable(G,t.x,t.y,t.z,t.h,set[0].map(v=>v*(.92+Q()*.12)),glow);
   for(const ch of t.chairs)plasticChair(G,ch.x,ch.y,t.z,ch.face,(Q()<.2?odd:set)[Q()<.5?0:1].map(v=>v*(.9+Q()*.15)),ch.turn*.3,glow);
   if(!light)tableItems(G,t,Q);
   if(t.umbrella)umbrella(G,t.x,t.y,t.z,t.h+Q(),Q,pick(Q,[[lin(0xc8202a),lin(0xf4f1ea)],[lin(0xf2c21b)],[lin(0xc8202a)],[lin(0x1f5fa8),lin(0xf4f1ea)],[lin(0xf2c21b),lin(0xc8202a)],[lin(0x2f8a3a),lin(0xf4f1ea)]]));
  }
  if(b.counter)counter(G,b,Q);
  if(b.menu)menuBoard(G,b.menu,b.name);
  if(b.tvAt)tvStand(G,b.tvAt,Q);
  if(b.lights)for(const [a,c] of b.wire)stringLights(G,a,c,Q);
  // After dark the bar's light falls on the sidewalk and on its people (brighter under the string lights).
  pools.push([b.x,b.y,b.z,Math.max(3.5,b.tables.length*1.15+1.5),b.lights?1:.6]);for(const p of b.people)p.lit=b.lights?1:.65;
 });
 for(const v of vendors){const G=tileOf(v.x,v.y),Q=random(Math.floor(v.x*7+v.y*13)>>>0),lamp=v.kind==='pipoca'||v.kind==='dogao';if(lamp)pools.push([v.x,v.y,v.z,2.6,.7]);for(const p of v.people)p.lit=lamp?.75:.2;if(v.kind!=='baloes')vendorCart(G,v,Q);else balloons(G,v,v.people[0],Q);}
 const atlas=canvasTexture(paintAtlas,1024,1024);atlas.generateMipmaps=true;
 const propMat=new THREE.MeshStandardMaterial({name:'Vida_coisas',vertexColors:true,map:atlas,roughness:.6,metalness:0});
 propMat.onBeforeCompile=sh=>{sh.uniforms.lifeTime=U.lifeTime;sh.uniforms.lifeNight=U.lifeNight;
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 extra;uniform float lifeTime;varying vec2 vGlow;')
   .replace('#include <begin_vertex>',`#include <begin_vertex>
// Balloons (and their strings' tops) in the breeze, each on its own beat.
if(extra.x>0.){transformed.x+=extra.x*sin(lifeTime*1.3+extra.y);transformed.z+=extra.x*.7*sin(lifeTime*1.05+extra.y*1.7);transformed.y+=extra.x*.3*sin(lifeTime*.9+extra.y*2.3);}
vGlow=extra.zw;`);
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform float lifeNight;varying vec2 vGlow;')
   .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*(vGlow.x*lifeNight+vGlow.y);');};
 propMat.customProgramCacheKey=()=>'city-life-coisas-v1';
 const meshes=[];let propTriangles=0;
 for(const [key,G] of tiles){if(!G.size)continue;const m=new THREE.Mesh(G.build(),propMat);m.name='Vida_coisas_'+key;m.castShadow=!light;m.receiveShadow=true;m.matrixAutoUpdate=false;
  m.userData.box=m.geometry.boundingBox;root.add(m);meshes.push(m);propTriangles+=G.triangles;}

 // ---------------------------------------------------------------- shade under the tables and carts, light under the botecos' lamps
 const disc=canvasTexture((ctx,w,h)=>{const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.45,'rgba(255,255,255,.7)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.clearRect(0,0,w,h);ctx.fillStyle=g;ctx.fillRect(0,0,w,h);},64,64);
 const decal=(list,col,name,mat)=>{if(!list.length)return null;const p=[],c=[],t=[],ix=[];
  for(const [x,y,z,r,a] of list){const k=p.length/3;for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,1]]){p.push(x+u*r,(ground(x+u*r,y+v*r)??z)+.04,-(y+v*r));c.push(col[0],col[1],col[2],a??1);t.push((u+1)/2,(v+1)/2);}ix.push(k,k+1,k+2,k,k+2,k+3);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,4));g.setAttribute('uv',new THREE.Float32BufferAttribute(t,2));g.setIndex(ix);g.computeBoundingSphere();
  const m=new THREE.Mesh(g,mat);m.name=name;m.renderOrder=1;m.matrixAutoUpdate=false;root.add(m);return m;};
 const shadeMesh=decal(shades,[0,0,0],'Vida_sombra',new THREE.MeshBasicMaterial({name:'Vida_sombra',map:disc,vertexColors:true,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,color:0x000000,opacity:.85}));
 if(shadeMesh)shadeMesh.material.color.set(0x000000);
 const poolMesh=decal(pools,[1,.72,.42],'Vida_luz_chao',new THREE.MeshBasicMaterial({name:'Vida_luz_chao',map:disc,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,opacity:0}));
 if(poolMesh)poolMesh.visible=false;

 // ---------------------------------------------------------------- the grills' smoke and the hot-dog carts' steam
 let smoke=null;
 if(smokes.length&&!lean){
  const per=mobile?5:9,n=smokes.length*per,geo=new THREE.PlaneGeometry(1,1),iS=new Float32Array(n*4),iP=new Float32Array(n*4);
  smokes.forEach((s,k)=>{for(let j=0;j<per;j++){const i=k*per+j;iS.set([s.x,s.z,-s.y,s.kind],i*4);iP.set([j/per+R()*.05,s.kind?.22:.16+R()*.03,s.kind?.35:.6,R()],i*4);}});
  geo.setAttribute('iS',new THREE.InstancedBufferAttribute(iS,4));geo.setAttribute('iP',new THREE.InstancedBufferAttribute(iP,4));
  const puff=canvasTexture((ctx,w,h)=>{ctx.clearRect(0,0,w,h);const Q=random(77);for(let k=0;k<9;k++){const x=w*(.3+Q()*.4),y=h*(.3+Q()*.4),r=w*(.18+Q()*.16),g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}},64,64);
  const mat=new THREE.MeshBasicMaterial({name:'Vida_fumaca',map:puff,transparent:true,depthWrite:false,color:0xb8b4ae});
  mat.onBeforeCompile=sh=>{sh.uniforms.lifeTime=U.lifeTime;sh.uniforms.lifeLight=EFFECT_LIGHT;
   sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 iS;attribute vec4 iP;uniform float lifeTime;varying float vPuff;')
    .replace('#include <project_vertex>',`float k=fract(lifeTime*iP.y+iP.x),up=iS.w>.5?1.1:2.8;
vec3 c=iS.xyz+vec3((.7+iP.w*.6)*k*k*1.6,k*up,(iP.w-.5)*k*k*1.4);float sz=iP.z*(.4+k*1.7);
vec4 mvPosition=modelViewMatrix*vec4(c,1.);mvPosition.xy+=position.xy*sz;gl_Position=projectionMatrix*mvPosition;
vPuff=smoothstep(0.,.1,k)*(1.-k)*(1.-k)*(iS.w>.5?.8:1.6);`);
   sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform float lifeLight;varying float vPuff;').replace('#include <opaque_fragment>','diffuseColor.a*=vPuff;outgoingLight*=lifeLight;\n#include <opaque_fragment>');};
  mat.customProgramCacheKey=()=>'city-life-fumaca-v1';
  smoke=new THREE.InstancedMesh(geo,mat,n);smoke.name='Vida_fumaca';smoke.frustumCulled=false;smoke.renderOrder=3;root.add(smoke);
  smoke.userData.spots=smokes;
 }

 // ---------------------------------------------------------------- people and dogs
 // Two crowds of the same figure: the detailed one near the camera (casting shadows), a lighter one further off.
 const N=people.length,{material:peopleMat,depth}=peopleMaterials(U),nearR=mobile?40:lean?35:60;
 const crowd=(fine,name)=>{
  const g=figureGeometry(fine),im=new THREE.InstancedMesh(g,peopleMat,Math.max(1,N));im.name=name;im.frustumCulled=false;im.castShadow=fine&&!light;im.receiveShadow=true;im.customDepthMaterial=depth;im.count=0;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const at=(n,size)=>{const a=new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1,N)*size),size);a.setUsage(THREE.DynamicDrawUsage);g.setAttribute(n,a);return a;};
  const c={im,g,attrs:[at('iA',4),at('iB',4),at('iC',4),at('iD',4)],slots:new Array(N),count:0,tri:g.index.count/3};
  im.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1,N)*3),3);im.instanceColor.setUsage(THREE.DynamicDrawUsage);c.attrs.push(im.instanceColor,im.instanceMatrix);c.arr=c.attrs.map(a=>a.array);
  root.add(im);return c;
 };
 const crowds=[crowd(true,'Vida_gente'),crowd(false,'Vida_gente_longe')];
 // Each person's numbers, ready to copy into a slot.
 const col=new THREE.Color();
 for(const p of people){
  col.setHex(p.top).toArray(p.cTop=[0,0,0]);const b=new THREE.Color(p.bottom),s=new THREE.Color(p.skin);
  p.vB=[b.r,b.g,b.b,0];p.vC=[s.r,s.g,s.b,p.hair];p.vD=[p.lean??0,p.style,p.lit??0,p.acc];p.wx=p.x;p.wy=p.y;p.wz=p.z;p.wh=p.h;
  if(p.kid)p.rate*=1;stats.people=people.length;
 }
 const dogs=agents.filter(a=>a.dog),COATS=[0xc98a4b,0x1e1a17,0xe8e2d6,0x6b4426,0x8a8580,0xb07a3a,0x2b2622];
 let dogMesh=null;
 if(dogs.length){
  const g=dogGeometry();dogMesh=new THREE.InstancedMesh(g,dogMaterial(U),dogs.length);dogMesh.name='Vida_caes';dogMesh.frustumCulled=false;dogMesh.castShadow=false;dogMesh.receiveShadow=true;
  dogMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dA=new Float32Array(dogs.length*4),dH=new THREE.InstancedBufferAttribute(new Float32Array(dogs.length*4),4);dH.setUsage(THREE.DynamicDrawUsage);
  dogs.forEach((a,k)=>{dA.set([a.dog.phase,a.speed/(.42*a.dog.size)*Math.PI*.5,0,a.dog.size],k*4);dogMesh.setColorAt(k,col.setHex(COATS[a.dog.coat%COATS.length]).multiplyScalar(.85+R()*.3));});
  const dAttr=new THREE.InstancedBufferAttribute(dA,4);dAttr.setUsage(THREE.DynamicDrawUsage);g.setAttribute('dA',dAttr);dogMesh.userData.dA=dAttr;dogMesh.userData.rates=dogs.map(a=>a.speed/(.42*a.dog.size)*Math.PI*.5);g.setAttribute('dH',dH);dogMesh.userData.dH=dH;root.add(dogMesh);
 }

 // ---------------------------------------------------------------- walking
 const W2=new Float32Array(6);
 // Where an agent is on its lane: the strip's frame at u, its lateral place, the walking direction.
 const lanePose=ag=>{
  const l=ag.lane,f=clamp(ag.u,0,l.n-1.0001),i=Math.floor(f),t=f-i,j=Math.min(i+1,l.n-1),L=(a)=>a[i]+(a[j]-a[i])*t;
  const x=L(l.x),y=L(l.y),nx=L(l.nx),ny=L(l.ny),lo=L(l.lo),hi=L(l.hi),m0=(l.lo[i]+l.hi[i])/2,m1=(l.lo[j]+l.hi[j])/2;
  let dx=l.x[j]+l.nx[j]*m1-l.x[i]-l.nx[i]*m0,dy=l.y[j]+l.ny[j]*m1-l.y[i]-l.ny[i]*m0;const dl=Math.hypot(dx,dy)||1;dx=dx/dl*ag.dir;dy=dy/dl*ag.dir;
  const lat=lo+(hi-lo)*ag.f;ag.x=x+nx*lat;ag.y=y+ny*lat;ag.z=L(l.z);ag.fx=dx;ag.fy=dy;ag.nx=nx;ag.ny=ny;ag.lo=lo;ag.hi=hi;ag.lat=lat;
 };
 const pathPose=(ag,pts,d)=>{
  let k=0,acc=0;while(k<pts.length-2){const s=Math.hypot(pts[k+1][0]-pts[k][0],pts[k+1][1]-pts[k][1]);if(acc+s>=d)break;acc+=s;k++;}
  const a=pts[k],b=pts[k+1],s=Math.hypot(b[0]-a[0],b[1]-a[1])||1,t=clamp((d-acc)/s,0,1);
  ag.x=a[0]+(b[0]-a[0])*t;ag.y=a[1]+(b[1]-a[1])*t;ag.z=a[2]+(b[2]-a[2])*t;ag.fx=(b[0]-a[0])/s;ag.fy=(b[1]-a[1])/s;ag.nx=0;ag.ny=0;
 };
 const RW=random(5150);
 const keepRight=ag=>clamp(.5+(ag.dir>0===ag.lane.rightOut?.28:-.28)+(RW()-.5)*.2,.12,.88);
 const advance=(ag,dt)=>{
  if(ag.private){
   if(ag.pause>0){ag.pause-=dt;}else{
    const P=ag.private,i=Math.floor(clamp(ag.u,0,P.length-1.001)),s=Math.hypot(P[i+1][0]-P[i][0],P[i+1][1]-P[i][1])||1;ag.u+=ag.dir*ag.speed*dt/s;
    if(ag.u>=P.length-1||ag.u<=0){ag.u=clamp(ag.u,0,P.length-1);ag.dir*=-1;ag.pause=1+RW()*4;}}
   const P=ag.private,f=clamp(ag.u,0,P.length-1.001),i=Math.floor(f),t=f-i,a=P[i],b=P[i+1],s=Math.hypot(b[0]-a[0],b[1]-a[1])||1;
   ag.x=a[0]+(b[0]-a[0])*t;ag.y=a[1]+(b[1]-a[1])*t;ag.z=a[2];ag.fx=(b[0]-a[0])/s*ag.dir;ag.fy=(b[1]-a[1])/s*ag.dir;ag.nx=0;ag.ny=0;ag.moving=ag.pause<=0;return;
  }
  // A stop to watch the race (the lanes near it): turned to the lap for a few seconds.
  if(ag.lane?.watch&&!ag.link){
   if(ag.pausing){ag.pause-=dt;if(ag.pause>0){ag.fx=ag.lane.watch[0];ag.fy=ag.lane.watch[1];ag.moving=false;return;}ag.pausing=false;dirty=true;lanePose(ag);}
   else if((ag.watchT=(ag.watchT??8+RW()*30)-dt)<=0){ag.watchT=18+RW()*40;ag.pause=5+RW()*9;ag.pausing=true;dirty=true;}
  }
  ag.moving=true;
  if(ag.link){
   const k=ag.link;ag.t+=ag.speed*dt;
   if(ag.t>=k.len){const to=ag.rev?k.a:k.b;ag.link=null;ag.lane=to.l;ag.u=to.e?to.l.n-1.001:0;ag.dir=to.e?-1:1;ag.f=ag.ft=keepRight(ag);}
   else{const d=ag.rev?k.len-ag.t:ag.t;pathPose(ag,k.path,d);if(ag.rev){ag.fx=-ag.fx;ag.fy=-ag.fy;}return;}
  }
  const l=ag.lane,i=Math.floor(clamp(ag.u,0,l.n-1.001));ag.u+=ag.dir*ag.speed*dt/(l.seg[i]||STEP);
  if(ag.u>l.n-1||ag.u<0){
   const e=ag.u>l.n-1?1:0,opts=l.ends[e];ag.u=clamp(ag.u,0,l.n-1.001);
   if(opts.length&&RW()<.88){const k=links[opts[Math.floor(RW()*opts.length)]];ag.link=k;ag.rev=!(k.a.l===l&&k.a.e===e);ag.t=0;pathPose(ag,k.path,ag.rev?k.len:0);if(ag.rev){ag.fx=-ag.fx;ag.fy=-ag.fy;}return;}
   ag.dir*=-1;ag.ft=keepRight(ag);
  }
  ag.f+=(ag.ft-ag.f)*Math.min(1,dt*.7);
  lanePose(ag);
 };
 // Each member beside or behind the agent's point; squeezed into one file where the strip is narrow.
 const placeMembers=(ag,dt)=>{
  const th=Math.atan2(ag.fy,ag.fx);let dh=th-(ag.h??th);dh=(dh+Math.PI*3)%TAU-Math.PI;ag.h=(ag.h??th)+dh*Math.min(1,dt*5);
  const fx=Math.cos(ag.h),fy=Math.sin(ag.h),rx=fy,ry=-fx;
  for(const [p,along,across] of ag.members){
   let a=along,lat=0,x=ag.x,y=ag.y;
   if(ag.nx||ag.ny){const dn=across*(rx*ag.nx+ry*ag.ny),want=ag.lat+dn,got=clamp(want,ag.lo-.12,ag.hi+.12),sq=Math.abs(want-got);a-=Math.min(.9,sq*1.4);lat=got-ag.lat;x+=ag.nx*lat;y+=ag.ny*lat;}
   else{x+=rx*across;y+=ry*across;}
   p.wx=x+fx*a;p.wy=y+fy*a;p.wz=ag.z;p.wh=ag.h;
  }
 };

 // ---------------------------------------------------------------- out of the way of a car roaming the streets
 // In a zone of the city open to roam (meta.roam, physics.js RoamWorld: the car driving there) the walkers step aside
 // from its path: whoever is ahead of it (within a few seconds at its speed) or beside it moves across, away from its
 // axis, as far as clears its side, and drifts back to the lane once it has passed. Each person keeps its own offset.
 const roam=data.meta.roam?roamWorld(data):null,moved=new Set();let frame=0;
 const dodge=dt=>{
  const car=roam?.player,live=car&&car.roamZone,k=Math.min(1,dt*6);
  if(live){const sp=Math.hypot(car.vx,car.vy),fx=Math.cos(car.heading),fy=Math.sin(car.heading),ahead=3.5+sp*1.4,clear=car.body.halfWidth+1.1;
   for(const ag of agents){const dx=ag.x-car.x,dy=ag.y-car.y;if(dx*dx+dy*dy>(ahead+12)**2)continue;
    for(const [p] of ag.members){const ex=p.wx-car.x,ey=p.wy-car.y,a=ex*fx+ey*fy,c=-ex*fy+ey*fx,side=c>=0?1:-1;
     const want=a>-car.body.rear-1&&a<car.body.front+ahead&&Math.abs(c)<clear?side*(clear-Math.abs(c)):0;
     if(!want&&!p.dodge)continue;p.dodge??=[0,0,0];const tx=-fy*want,ty=fx*want;p.dodge[0]+=(tx-p.dodge[0])*k;p.dodge[1]+=(ty-p.dodge[1])*k;p.dodge[2]=frame;moved.add(p);}}}
  for(const p of moved){const d=p.dodge;if(d[2]!==frame){d[0]*=1-k;d[1]*=1-k;}if(Math.abs(d[0])+Math.abs(d[1])<.01&&d[2]!==frame){moved.delete(p);p.dodge=null;continue;}p.wx+=d[0];p.wy+=d[1];}
  frame++;
 };
 // ---------------------------------------------------------------- packing the visible people at the front
 let night=0,rain=0,dirty=true,packClock=0,eyeX=0,eyeY=0;
 const shown=p=>(p.nightOnly?night>=p.night:night<=p.night)&&rain<=p.rain;
 // Turned to h, scaled s (and g across: stout or slim).
 const writeMatrix=(IM,k,x,y,z,h,s,g=1)=>{const c=Math.cos(h)*s*g,sn=Math.sin(h)*s*g,o=k*16;IM[o]=c;IM[o+1]=0;IM[o+2]=-sn;IM[o+3]=0;IM[o+4]=0;IM[o+5]=s;IM[o+6]=0;IM[o+7]=0;IM[o+8]=sn;IM[o+9]=0;IM[o+10]=c;IM[o+11]=0;IM[o+12]=x;IM[o+13]=z;IM[o+14]=-y;IM[o+15]=1;};
 const pack=()=>{
  for(const c of crowds)c.count=0;const near2=nearR*nearR;
  for(const p of people){
   if(!shown(p))continue;const dx=p.wx-eyeX,dy=p.wy-eyeY,d2=dx*dx+dy*dy;if(d2>reach2)continue;
   const c=crowds[d2<near2?0:1],k=c.count++,[AA,AB,AC,AD,IC,IM]=c.arr;c.slots[k]=p;
   // An open umbrella takes the right hand: the phone goes in the pocket, the bag to the other hand, the kid lets go.
   let f=p.flags;if(rain>p.umbrella&&!(f&FL.cane))f=(f&~(FL.phone|FL.holdR|FL.bagR))|FL.umbrella|(f&FL.bagR?FL.bagL:0);
   AA[k*4]=p.phase;AA[k*4+1]=p.rate;AA[k*4+2]=p.agent?.pausing?2:p.kind;AA[k*4+3]=f;
   AB.set(p.vB,k*4);AC.set(p.vC,k*4);AD.set(p.vD,k*4);IC.set(p.cTop,k*3);
   writeMatrix(IM,k,p.wx,p.wy,p.wz,p.wh,p.scale,p.girth);
  }
  for(const c of crowds){c.im.count=c.count;for(const a of c.attrs){a.clearUpdateRanges();a.addUpdateRange(0,Math.max(1,c.count*a.itemSize));a.needsUpdate=true;}}
  stats.visible=crowds[0].count+crowds[1].count;stats.near=crowds[0].count;dirty=false;
 };
 for(const ag of agents){if(ag.private){advance(ag,0);}else lanePose(ag);placeMembers(ag,1);}

 // ---------------------------------------------------------------- stats
 let drawCalls=0;root.traverse(o=>{if(o.isMesh)drawCalls++;});
 Object.assign(stats,{where:plan.where,drawCalls,tiles:meshes.length,propTriangles,figureTriangles:crowds[0].tri,farFigureTriangles:crowds[1].tri,dogs:dogs.length,smoke:smoke?smoke.count:0,shades:shades.length,pools:pools.length,mobile,lean,buildMs:Math.round(performance.now()-started)});
 // (For the checks' photos: the ground under a point, not in the stats' JSON.)
 Object.defineProperty(stats,'groundAt',{value:(x,y)=>ground(x,y),enumerable:false});
 const eye=new THREE.Vector3();
 return {root,stats,clearings:plan.clearings,obstacles:[],where:plan.where,
  setNight(level){night=level;U.lifeNight.value=level;dirty=true;if(poolMesh){poolMesh.visible=level>.05;poolMesh.material.opacity=.11*level;}if(shadeMesh)shadeMesh.material.opacity=.85-.45*level;stats.night=level;},
  // The road's wetness (main.js on every weather change: 0 dry, about .55 in a drizzle, 1 in heavy rain): the walkers
  // hurry, umbrellas open, some go home, the open tables empty.
  setRain(level){level=clamp(level||0,0,1);if(Math.abs(level-rain)>.001){rain=level;dirty=true;}stats.rain=rain;},
  update(dt,camera){
   U.lifeTime.value+=dt;U.lifeWalk.value+=dt*(1+.45*rain);
   if(camera){eye.setFromMatrixPosition(camera.matrixWorld);eyeX=eye.x;eyeY=-eye.z;}
   const pace=1+.45*rain;
   for(const ag of agents){advance(ag,dt*pace*(ag.private?1/pace:1));placeMembers(ag,dt);}
   dodge(dt);
   if((packClock-=dt)<=0||dirty){packClock=.5;pack();}
   else for(const c of crowds){const IM=c.im.instanceMatrix.array;for(let k=0;k<c.count;k++){const p=c.slots[k];if(p.agent)writeMatrix(IM,k,p.wx,p.wy,p.wz,p.wh,p.scale,p.girth);}c.im.instanceMatrix.clearUpdateRanges();c.im.instanceMatrix.addUpdateRange(0,Math.max(1,c.count*16));c.im.instanceMatrix.needsUpdate=true;}
   if(dogMesh){
    const H=dogMesh.userData.dH.array,DA=dogMesh.userData.dA.array,rates=dogMesh.userData.rates;let n=0;
    for(let k=0;k<dogs.length;k++){
     const ag=dogs[k],own=ag.members[0][0],s=ag.dog.size,fx=Math.cos(ag.h),fy=Math.sin(ag.h),rx=fy,ry=-fx;
     const vis=shown(own)&&(own.wx-eyeX)**2+(own.wy-eyeY)**2<reach2;
     let x=own.wx+fx*1.05-rx*.42,y=own.wy+fy*1.05-ry*.42;
     if(ag.nx||ag.ny){const lat=(x-ag.x)*ag.nx+(y-ag.y)*ag.ny,want=ag.lat+lat,got=clamp(want,ag.lo-.1,ag.hi+.1);x+=ag.nx*(got-want);y+=ag.ny*(got-want);}
     _M.compose(_V.set(x,ag.z,-y),_Q.setFromAxisAngle(_UP,ag.h),_S.setScalar(vis?s:0));dogMesh.setMatrixAt(k,_M);
     // The owner's left hand, in the dog's frame.
     const hx=own.wx+fx*.3-rx*.26-x,hy=own.wy+fy*.3-ry*.26-y;H[k*4]=(hx*fx+hy*fy)/s;H[k*4+1]=(.86*own.scale)/s;H[k*4+2]=(hx*rx+hy*ry)/s;H[k*4+3]=.12;DA[k*4+1]=ag.pausing?0:rates[k];n++;
    }
    dogMesh.instanceMatrix.needsUpdate=true;dogMesh.userData.dH.needsUpdate=true;dogMesh.userData.dA.needsUpdate=true;
   }
   // Each tile within its reach of the camera (frustum culling does the rest); the draws in this frame (stats).
   let draws=(crowds[0].count?1:0)+(crowds[1].count?1:0)+(dogMesh?1:0)+(shadeMesh?1:0)+(poolMesh?.visible?1:0),tri=crowds[0].count*crowds[0].tri+crowds[1].count*crowds[1].tri;
   for(const m of meshes){const b=m.userData.box,dx=Math.max(b.min.x-eye.x,0,eye.x-b.max.x),dz=Math.max(b.min.z-eye.z,0,eye.z-b.max.z);m.visible=dx*dx+dz*dz<propReach*propReach;if(m.visible){draws++;tri+=m.geometry.index.count/3;}}
   if(smoke){smoke.visible=smoke.userData.spots.some(s=>(s.x-eyeX)**2+(s.y-eyeY)**2<propReach*propReach);if(smoke.visible)draws++;}
   stats.drawsNow=draws;stats.trianglesNow=Math.round(tri);
  }};
}
