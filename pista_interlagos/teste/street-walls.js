import * as THREE from 'three';
import {TestCar,guardrailClearance,guardrailSections,onDeck} from './physics.js';
import {canvasTexture} from './pit-textures.js';

// The walls of a street circuit (Floripa, meta.barrier 'street'): a line of concrete New Jersey blocks on each side,
// set a few decimetres off the asphalt (wall_right_m / wall_left_m, physics.js guardrailClearance), with a catch fence
// of chain-link panels on steel posts above them. Built the way track-surface.js builds the guardrails (same sections,
// same {root, rails, setQuality, stats}), so the cameras, the banners and the marshal posts find them where they look
// for the rails. The blocks are 3 m long with a hairline joint, painted by stretch (bare concrete, white, and red and
// white at the corners), each with its own tone and grime so a kilometre of them never reads as one copy.
const BLOCK=3,FENCE_TOP=3.9;
// Jersey profile seen along the road, from the face's foot (d=0, road side) over the top and down the back:
// [outward, height]. The car meets the wall at its face (physics: width/2 + gap).
const JERSEY=[[0,0],[.05,.08],[.2,.33],[.29,.81],[.46,.81],[.55,.33],[.7,.08],[.75,0]];
function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
export function createStreetWalls(data,{quality='alto'}={}){
 const root=new THREE.Group();root.name='Muros_circuito_de_rua';
 const probe=new TestCar(data),a=data.samples,L=data.meta.reconstructed_xy_m,rand=random(4021);
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
 const positions=[],colors=[],wallUv=[],indices=[],fence=[],fenceUv=[],fenceIdx=[],posts=[];
 let coverage=0,sections=0,blocks=0;
 for(const side of [-1,1])for(const [from,end] of guardrailSections(data,side)){
  const to=Math.min(end,L);if(from>=to)continue;coverage+=to-from;sections++;
  // Stations every metre (a block is three); the paint changes by block.
  const steps=Math.max(2,Math.ceil((to-from)/1)),base=positions.length/3,fbase=fence.length/3;
  let paint=null,blockColor=[.62,.61,.58];
  for(let i=0;i<=steps;i++){
   const s=from+(to-from)*i/steps,p=point(s),off=side*(p[4]/2+guardrailClearance(data,s,side)),x=p[1]-p[8]*off,y=p[2]+p[7]*off;
   probe.index=Math.min(a.length-1,Math.floor(s/L*a.length));const ground=probe.sample(x,y).z-.06;
   const block=Math.floor(s/BLOCK);
   if(paint!==block){paint=block;blocks++;
    // Red and white at the corners (alternating blocks), white on most straights, bare concrete here and there.
    const corner=turn(s)>.006,shade=.92+rand()*.12;
    blockColor=corner?(block%2?[.72*shade,.09*shade,.08*shade]:[.86*shade,.85*shade,.82*shade]):rand()<.62?[.8*shade,.8*shade,.77*shade]:[.6*shade,.59*shade,.55*shade];
   }
   const ox=-p[8]*side,oy=p[7]*side;
   for(const [d,h] of JERSEY){positions.push(x+ox*d,ground+h,-(y+oy*d));colors.push(...blockColor);wallUv.push(s,h);}
   if(i>0){for(let j=0;j<JERSEY.length-1;j++){const k=base+(i-1)*JERSEY.length+j,b=k+JERSEY.length;side>0?indices.push(k,k+1,b,b,k+1,b+1):indices.push(k,b,k+1,b,b+1,k+1);}}
   // Fence over the block's top, leaning a little toward the track at the top. Not on the bridges: there the
   // trusses and parapets close the road, and the view of the bay stays open.
   const fx=x+ox*.38,fy=y+oy*.38,deck=onDeck(data,s),top=deck?.81:FENCE_TOP;
   fence.push(fx,ground+.81,-fy,fx-ox*.35*(deck?0:1),ground+top,-(fy-oy*.35*(deck?0:1)));fenceUv.push(s/.6,0,s/.6,(top-.81)/.6);
   if(i>0&&!deck){const k=fbase+(i-1)*2;fenceIdx.push(k,k+2,k+1,k+1,k+2,k+3);}
   if(i%4===0&&!deck)posts.push({x:fx,y:ground+.81,z:-fy,lean:Math.atan2(oy,ox)});
  }
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
