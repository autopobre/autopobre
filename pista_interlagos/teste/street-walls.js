import * as THREE from 'three';
import {TestCar,guardrailClearance,guardrailSections,onDeck,inTunnel} from './physics.js';
import {canvasTexture} from './pit-textures.js';

// The walls of a street circuit (Floripa, meta.barrier 'street'): a line of concrete New Jersey blocks on each side,
// set a few decimetres off the asphalt (wall_right_m / wall_left_m, physics.js guardrailClearance), with a catch fence
// of chain-link panels on steel posts above them. Built the way track-surface.js builds the guardrails (same sections,
// same {root, rails, setQuality, stats}), so the cameras, the banners and the marshal posts find them where they look
// for the rails. The blocks are 3 m long with a hairline joint, painted by stretch (bare concrete, white, and red and
// white at the corners), each with its own tone and grime so a kilometre of them never reads as one copy.
const BLOCK=3,FENCE_TOP=3.9;
// Jersey profile seen along the road, from the face's foot (d=0, road side) over the top and down the back:
// [outward, height]. The car meets the wall at its face (physics: width/2 + gap). The blocks sit WALL_SINK into the ground.
export const JERSEY=[[0,0],[.05,.08],[.2,.33],[.29,.81],[.46,.81],[.55,.33],[.7,.08],[.75,0]],WALL_SINK=.06;
// How far out from the foot the face is at height h (the wall's own heights) on its upper part, the plane from 0.33 m to
// the top that leans back 9 cm (and its extension): where a banner hung on the wall lies (trackside.js).
export function jerseyFace(h){const [[d0,h0],[d1,h1]]=[JERSEY[2],JERSEY[3]];return d0+(d1-d0)*(h-h0)/(h1-h0);}
// Each end of a stretch of wall closed by its cross-section (in strips across the profile, foot to foot), as seen
// from behind its first station; the last station's cap turns the other way.
const CAP=[[0,1,7],[1,6,7],[1,2,6],[2,5,6],[2,3,5],[3,4,5]];

// The line every barrier of a circuit stands on, per side and guardrail section, found once per track data and shared by
// what is built on it: these concrete walls, the steel rails (track-surface.js) and the banners hung on both
// (trackside.js), which take its stations as theirs and so lie on the barrier's own facets instead of on a polyline of
// their own beside it. Stations every metre on a street circuit (a block is three), at every track sample (2 m) for the
// rails (node: the sample's index), and at the section's two ends; each with the foot of the barrier's face (width/2 +
// guardrailClearance off the asphalt, along the track's normal made unit again: interpolated between two samples of a
// bend it is short, and the walls wobbled in by up to 7 cm at every other station of a hairpin), the ground there (z)
// and the outward unit vector (ox, oy).
const lineCache=new WeakMap();
export function barrierLines(data){
 if(lineCache.has(data))return lineCache.get(data);
 const a=data.samples,N=a.length,L=data.meta.reconstructed_xy_m,probe=new TestCar(data),street=data.meta.barrier==='street',out={'-1':[],'1':[]};
 const point=s=>{if(s>=L)return a[0];let lo=0,hi=N-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(a[mid][0]<=s)lo=mid;else hi=mid-1;}
  const p=a[lo],q=a[(lo+1)%N],u=(s-p[0])/((lo===N-1?L:q[0])-p[0]);return p.map((value,k)=>k===0?s:value+(q[k]-value)*u);};
 for(const side of [-1,1])for(const [from,end] of guardrailSections(data,side)){
  const to=Math.min(end,L);if(from>=to)continue;
  const at=[];
  if(street){const steps=Math.max(2,Math.ceil(to-from));for(let i=0;i<=steps;i++)at.push({s:from+(to-from)*i/steps});}
  else{at.push({s:from});a.forEach((p,k)=>{if(p[0]>from&&p[0]<to)at.push({s:p[0],node:k});});at.push({s:to});}
  // (A station at the lap's end is the lap's start: p[0] is 0 there, and a lap-long barrier closes on itself.)
  const stations=at.map(({s,node})=>{
   const p=point(s),t=Math.hypot(p[7],p[8])||1,tx=p[7]/t,ty=p[8]/t,off=side*(p[4]/2+guardrailClearance(data,p[0],side)),x=p[1]-ty*off,y=p[2]+tx*off;
   probe.index=Math.min(N-1,Math.floor(p[0]/L*N));
   return {s,node,p,x,y,z:probe.sample(x,y).z,ox:-ty*side,oy:tx*side};
  });
  out[side].push({side,from,to,stations:untangle(stations)});
 }
 lineCache.set(data,out);return out;
}
// On the inside of a hairpin whose radius is under the barrier's offset (a rail 5 m off the asphalt round Interlagos'
// Junção, Piracicaba's hairpin) the offset line runs backward for a few stations and crosses itself: a loop of rail
// folded over itself, banners on both sides of it. Cut at the crossing, the two branches meet in a corner there (which
// is where the physics puts the barrier: as far from the centreline as its clearance); stations that never cross back
// (a fold at a section's end) are dropped.
function untangle(st){
 const ahead=(p,q)=>(q.x-p.x)*(p.p[7]+q.p[7])+(q.y-p.y)*(p.p[8]+q.p[8])>0;
 for(let guard=0;guard<20;guard++){
  let a=1;while(a<st.length&&ahead(st[a-1],st[a]))a++;if(a>=st.length)return st;
  let b=a;while(b<st.length&&!ahead(st[b-1],st[b]))b++;
  // Segment k runs from station k-1 to k: the reversed ones are a..b-1; look for the crossing of one before them
  // with one after them, the smallest loop first.
  let cut=null;
  for(let span=2;span<120&&!cut;span++)for(let i=Math.max(1,a-span);i<=a-1&&!cut;i++){
   const j=i+span;if(j<b||j>=st.length)continue;
   const P=st[i-1],Q=st[i],R=st[j-1],S=st[j],dx=Q.x-P.x,dy=Q.y-P.y,ex=S.x-R.x,ey=S.y-R.y,den=dx*ey-dy*ex;if(Math.abs(den)<1e-12)continue;
   const u=((R.x-P.x)*ey-(R.y-P.y)*ex)/den,v=((R.x-P.x)*dy-(R.y-P.y)*dx)/den;
   if(u>=0&&u<=1&&v>=0&&v<=1)cut={i,j,u,v};
  }
  if(!cut){st=st.filter((q,k)=>k<a||k>=b);continue;}
  const {i,j,u,v}=cut,P=st[i-1],Q=st[i],R=st[j-1],S=st[j],m=(A,B,f,k)=>A[k]+(B[k]-A[k])*f;
  const ox=m(P,Q,u,'ox')+m(R,S,v,'ox'),oy=m(P,Q,u,'oy')+m(R,S,v,'oy'),n=Math.hypot(ox,oy)||1;
  const corner={s:(m(P,Q,u,'s')+m(R,S,v,'s'))/2,p:Q.p,x:m(P,Q,u,'x'),y:m(P,Q,u,'y'),z:(m(P,Q,u,'z')+m(R,S,v,'z'))/2,ox:ox/n,oy:oy/n};
  st=[...st.slice(0,i),corner,...st.slice(j)];
 }
 return st;
}
// A point of a barrier line at s, between its two stations: on the straight facet the barrier is built of there.
export function barrierAt(stations,s){
 let lo=0,hi=stations.length-1;if(s<=stations[0].s)return stations[0];if(s>=stations[hi].s)return stations[hi];
 while(hi-lo>1){const mid=(lo+hi)>>1;if(stations[mid].s<=s)lo=mid;else hi=mid;}
 const p=stations[lo],q=stations[hi],u=(s-p.s)/(q.s-p.s),mix=k=>p[k]+(q[k]-p[k])*u;
 return {s,x:mix('x'),y:mix('y'),z:mix('z'),ox:mix('ox'),oy:mix('oy')};
}
function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
export function createStreetWalls(data,{quality='alto'}={}){
 const root=new THREE.Group();root.name='Muros_circuito_de_rua';
 const a=data.samples,L=data.meta.reconstructed_xy_m,rand=random(4021);
 const point=s=>{if(s>=L)return a[0];let lo=0,hi=a.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(a[mid][0]<=s)lo=mid;else hi=mid-1;}
  const p=a[lo],q=a[(lo+1)%a.length],u=(s-p[0])/((lo===a.length-1?L:q[0])-p[0]);return p.map((value,k)=>k===0?s:value+(q[k]-value)*u);};
 // Curvature at s (for the corner paint): turn of the tangent over 20 m.
 const turn=s=>{const p=point(((s-10)%L+L)%L),q=point((s+10)%L);let d=Math.atan2(q[8],q[7])-Math.atan2(p[8],p[7]);d=(d+Math.PI*3)%(Math.PI*2)-Math.PI;return Math.abs(d)/20;};
 const concrete=new THREE.MeshStandardMaterial({name:'Concreto_muro',vertexColors:true,roughness:.86,metalness:0});
 concrete.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vWallUv;attribute vec2 wallUv;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWallUv=wallUv;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec2 vWallUv;
float wallHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float wallNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(wallHash(i),wallHash(i+vec2(1,0)),f.x),mix(wallHash(i+vec2(0,1)),wallHash(i+vec2(1,1)),f.x),f.y);}`).replace('#include <color_fragment>',`#include <color_fragment>
// Block joints every 3 m, tyre scuffs low on the face, rain streaks and pores on the concrete.
float joint=abs(fract(vWallUv.x/${BLOCK.toFixed(1)})-.5);
float seam=1.-smoothstep(.0,max(fwidth(vWallUv.x/${BLOCK.toFixed(1)})*1.5,.004),.5-joint);
float pores=wallNoise(vWallUv*vec2(9.,13.))*.6+wallNoise(vWallUv*vec2(37.,41.))*.4;
float streak=wallNoise(vec2(vWallUv.x*3.1,vWallUv.y*.4));
float scuff=(1.-smoothstep(.12,.38,vWallUv.y))*smoothstep(.55,.85,wallNoise(vec2(vWallUv.x*.21,3.7)));
diffuseColor.rgb*=1.-.35*seam;
diffuseColor.rgb*=.9+.16*pores-.12*streak*smoothstep(.3,.8,vWallUv.y);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.07),scuff*.55);`);
 };
 concrete.customProgramCacheKey=()=>'street-wall-concrete-v1';
 // Chain link: a diamond mesh drawn once, alpha-tested, both faces.
 const link=canvasTexture((ctx,w,h)=>{ctx.clearRect(0,0,w,h);ctx.strokeStyle='rgba(200,205,202,.95)';ctx.lineWidth=2.2;const n=8;
  for(let i=-n;i<=2*n;i++){ctx.beginPath();ctx.moveTo(i*w/n,0);ctx.lineTo(i*w/n+w,h);ctx.stroke();ctx.beginPath();ctx.moveTo(i*w/n,h);ctx.lineTo(i*w/n+w,0);ctx.stroke();}},256,256);
 link.wrapS=link.wrapT=THREE.RepeatWrapping;link.anisotropy=8;
 // Blended, not cut out: in the small mipmaps the wire becomes the light haze a fence is from a few metres away.
 const fenceMaterial=new THREE.MeshStandardMaterial({name:'Alambrado',map:link,transparent:true,depthWrite:false,side:THREE.DoubleSide,metalness:.45,roughness:.5,color:0xc4c9c6});
 const steel=new THREE.MeshStandardMaterial({name:'Poste_alambrado',color:0x7d8589,metalness:.6,roughness:.42});
 const positions=[],colors=[],wallUv=[],indices=[],fence=[],fenceUv=[],fenceIdx=[],posts=[],caps=[];
 let coverage=0,sections=0,blocks=0;
 for(const side of [-1,1])for(const {from,to,stations} of barrierLines(data)[side]){
  coverage+=to-from;sections++;
  // Stations every metre (barrierLines; a block is three); the paint changes by block.
  const base=positions.length/3,fbase=fence.length/3,last=stations.length-1;
  let paint=null,blockColor=[.62,.61,.58];
  for(let i=0;i<=last;i++){
   const {s,x,y,ox,oy}=stations[i],ground=stations[i].z-WALL_SINK;
   const block=Math.floor(s/BLOCK);
   if(paint!==block){paint=block;blocks++;
    // Red and white at the corners (alternating blocks), white on most straights, bare concrete here and there.
    const corner=turn(s)>.006,shade=.92+rand()*.12;
    blockColor=corner?(block%2?[.72*shade,.09*shade,.08*shade]:[.86*shade,.85*shade,.82*shade]):rand()<.62?[.8*shade,.8*shade,.77*shade]:[.6*shade,.59*shade,.55*shade];
   }
   for(const [d,h] of JERSEY){positions.push(x+ox*d,ground+h,-(y+oy*d));colors.push(...blockColor);wallUv.push(s,h);}
   // Wound to face out of the block (the face toward the road, the top up): the material draws front faces only, and
   // wound the other way round the road saw the inside of the back slope, half a metre behind the face, through it.
   if(i>0){for(let j=0;j<JERSEY.length-1;j++){const k=base+(i-1)*JERSEY.length+j,b=k+JERSEY.length;side>0?indices.push(k,b,k+1,b,b+1,k+1):indices.push(k,k+1,b,b,k+1,b+1);}}
   // An end of the stretch (a pit entry or exit, a gap in the walls) shows the block's section, not its hollow.
   if(i===0?from>0:i===last&&to<L-1e-6)caps.push({x,y,ox,oy,ground,s,color:blockColor,back:(i===0)===(side>0)});
   // Fence over the block's top, leaning a little toward the track at the top. Not on the bridges: there the
   // trusses and parapets close the road, and the view of the bay stays open. Nor in a tunnel or its trench
   // (meta.tunnels): its own walls rise from the road to the ground above.
   const fx=x+ox*.38,fy=y+oy*.38,deck=onDeck(data,s)||inTunnel(data,s),top=deck?.81:FENCE_TOP;
   fence.push(fx,ground+.81,-fy,fx-ox*.35*(deck?0:1),ground+top,-(fy-oy*.35*(deck?0:1)));fenceUv.push(s/.6,0,s/.6,(top-.81)/.6);
   if(i>0&&!deck){const k=fbase+(i-1)*2;fenceIdx.push(k,k+2,k+1,k+1,k+2,k+3);}
   if(i%4===0&&!deck)posts.push({x:fx,y:ground+.81,z:-fy,lean:Math.atan2(oy,ox)});
  }
 }
 // The end caps, on vertices of their own (flat, not smoothed into the block's sides).
 for(const {x,y,ox,oy,ground,s,color,back} of caps){
  const c=positions.length/3;for(const [d,h] of JERSEY){positions.push(x+ox*d,ground+h,-(y+oy*d));colors.push(...color);wallUv.push(s,h);}
  for(const [u,v,w] of CAP)back?indices.push(c+u,c+v,c+w):indices.push(c+u,c+w,c+v);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('wallUv',new THREE.Float32BufferAttribute(wallUv,2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();
 const rails=new THREE.Mesh(g,concrete);rails.name='Muro_concreto';rails.castShadow=rails.receiveShadow=true;root.add(rails);
 const fg=new THREE.BufferGeometry();fg.setAttribute('position',new THREE.Float32BufferAttribute(fence,3));fg.setAttribute('uv',new THREE.Float32BufferAttribute(fenceUv,2));fg.setIndex(fenceIdx);fg.computeVertexNormals();fg.computeBoundingSphere();
 const fenceMesh=new THREE.Mesh(fg,fenceMaterial);fenceMesh.name='Alambrado';fenceMesh.castShadow=true;root.add(fenceMesh);
 const postMesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(.045,.05,FENCE_TOP-.81+.05,6).translate(0,(FENCE_TOP-.81)/2,0),steel,posts.length);
 const m=new THREE.Matrix4(),q=new THREE.Quaternion(),one=new THREE.Vector3(1,1,1);
 posts.forEach((p,i)=>{q.setFromAxisAngle(new THREE.Vector3(Math.sin(p.lean),0,Math.cos(p.lean)),.09);m.compose(new THREE.Vector3(p.x,p.y,p.z),q,one);postMesh.setMatrixAt(i,m);});
 postMesh.name='Postes_alambrado';postMesh.castShadow=true;postMesh.computeBoundingSphere();root.add(postMesh);
 const stats={sides:2,closed:false,segments:blocks,sections,coverageMetres:coverage,coverageRatio:coverage/(L*2),clearance:'por estação',reflectors:0,style:'street',fencePosts:posts.length};
 // The fence is the expensive part far off: on the light levels it goes beyond the nearest few hundred metres
 // (the mesh is one draw; quality only switches it off on Básico).
 function setQuality(value){stats.quality=value;fenceMesh.visible=postMesh.visible=value!=='basico';}
 root.userData.setQuality=setQuality;setQuality(quality);
 return {root,rails,setQuality,stats};
}
