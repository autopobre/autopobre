import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {structureMaterial} from './landscape.js';
import {STAND,standLayout,standPoint,roofHeight} from './track-clearance.js';
import {SUN_DIRECTION} from './sky.js';

// Main grandstand of Interlagos, on the outside of the main straight: stepped
// concrete blocks built into the bank, benches split by aisles, and a roof on
// back columns that shades every row. Layout from track-clearance.js, which also
// keeps the ground below it. Game art sized to the LiDAR, not a survey.
// Sun-faded plastic seats: navy, bottle green and a worn yellow sector.
const SEAT_COLORS=[[.05,.1,.22],[.05,.1,.22],[.05,.17,.1],[.4,.32,.09],[.05,.17,.1],[.05,.1,.22]];
const SECTIONS=[-10.5,-3.5,3.5,10.5],SECTION_LENGTH=6.2;
export function createGrandstands(data,textures,ground=null){
 const blocks=standLayout(data),root=new THREE.Group();root.name='Arquibancadas_Interlagos';
 if(!blocks.length)return {root,rows:[],obstacles:[],stats:{blocks:0,rows:0}};
 const concrete=structureMaterial(new THREE.MeshStandardMaterial({name:'Concreto',color:0x8f918b,roughness:.9}),textures);concrete.vertexColors=true;
 // Painted steel, plain: the shared 'Metal' upgrade draws a roller door's ribs, which along the girders under the roof
 // read as bright seams of light between the slab and the beams.
 const steel=new THREE.MeshStandardMaterial({name:'Aco_arquibancada',color:0x737b80,metalness:.4,roughness:.55});
 const roofMaterial=new THREE.MeshStandardMaterial({name:'Cobertura_arquibancada',color:0xe8eae6,roughness:.55,metalness:.2,side:THREE.DoubleSide});
 // Trapezoidal steel deck: ribs down the slope every 25 cm (faded before they alias), grime toward
 // the edges, and a shaded underside that only sees the ground.
 roofMaterial.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vDeck;varying float vDeckDown,vDeckSide;').replace('#include <begin_vertex>','#include <begin_vertex>\nvDeck=uv;vec3 deckN=normalize(mat3(modelMatrix)*normal);vDeckDown=step(deckN.y,-.5);vDeckSide=1.0-step(.5,abs(deckN.y));');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vDeck;varying float vDeckDown,vDeckSide;').replace('#include <color_fragment>',`#include <color_fragment>
float deckRib=vDeck.x*${((STAND.length+.3)/.25).toFixed(1)},deckFade=1.0-smoothstep(.25,.6,fwidth(deckRib));
float deckEdge=smoothstep(.3,0.0,min(vDeck.y,1.0-vDeck.y));
// The slab's cut edges (its 22 cm ends and back, which the roof's rise toward the track tilts to face the stand's
// fans and the cars below) are a dark flashing, not the white deck: in the sun they drew a bright seam under the roof.
diffuseColor.rgb*=(1.0-.14*deckFade*smoothstep(.2,.5,abs(fract(deckRib)-.5))*(1.0-vDeckSide))*(1.0-.18*deckEdge)*mix(1.0,.62,vDeckDown)*mix(1.0,.28,vDeckSide);`).replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
roughnessFactor=mix(roughnessFactor,.95,vDeckSide);metalnessFactor*=1.0-vDeckSide;`);
 };
 roofMaterial.customProgramCacheKey=()=>'stand-roof-deck-v2';
 const fasciaMaterial=new THREE.MeshStandardMaterial({name:'Faixa_cobertura',color:0x12463b,roughness:.6});
 const seatMaterial=new THREE.MeshStandardMaterial({name:'Assentos_arquibancada',vertexColors:true,roughness:.5});
 const parts={body:[],seats:[],roof:[],fascia:[],steel:[]},rows=[],up=new THREE.Vector3(0,1,0);
 const tint=(g,rgb)=>{const n=g.attributes.position.count,c=new Float32Array(n*3);for(let i=0;i<n;i++)c.set(rgb,i*3);g.setAttribute('color',new THREE.BufferAttribute(c,3));return g;};
 // The stand's extent along the track (from the first block's centre), for rays that leave under a neighbour's roof.
 const sun=SUN_DIRECTION,along0=blocks.map(b=>blocks[0].tx*(b.x-blocks[0].x)+blocks[0].ty*(b.y-blocks[0].y)),standSpan=[Math.min(...along0)-STAND.length/2-.15,Math.max(...along0)+STAND.length/2+.15];
 blocks.forEach((b,index)=>{
  // Block frame: x along the track, y up, z away from it (right-handed), origin at the apron level.
  const frame=new THREE.Matrix4().makeBasis(new THREE.Vector3(b.tx,0,-b.ty),up,new THREE.Vector3(b.rx,0,-b.ry)).setPosition(b.x,b.base,-b.y);
  const local=(a,h,l)=>new THREE.Vector3(a,h,l).applyMatrix4(frame);
  const box=(list,w,h,d,a,y,l,tilt=0)=>{const g=new THREE.BoxGeometry(w,h,d);if(tilt)g.rotateX(tilt);g.translate(a,y,l);list.push(g.applyMatrix4(frame));return g;};
  // Foundations reach below the lowest ground under the block.
  let low=b.base;
  for(let a=-b.length/2;a<=b.length/2+1e-6;a+=2)for(let l=b.front;l<=b.back+STAND.wall+1e-6;l+=1){const [x,y]=standPoint(b,a,l),z=ground?.(x,y);if(Number.isFinite(z))low=Math.min(low,z);}
  const bottom=low-b.base-1.5,rel=h=>h-b.base,shape=new THREE.Shape();
  shape.moveTo(b.front,bottom);shape.lineTo(b.front,STAND.parapet);shape.lineTo(b.front+STAND.wall,STAND.parapet);
  for(const row of b.rows){shape.lineTo(row.from,rel(row.top));shape.lineTo(row.to,rel(row.top));}
  shape.lineTo(b.back,rel(b.top)+STAND.parapet);shape.lineTo(b.back+STAND.wall,rel(b.top)+STAND.parapet);shape.lineTo(b.back+STAND.wall,bottom);shape.closePath();
  // Extruded along z, then turned so z runs along the track (a = L/2 - z keeps the winding).
  const length=b.length+.2,body=new THREE.ExtrudeGeometry(shape,{depth:length,bevelEnabled:false});
  body.applyMatrix4(new THREE.Matrix4().set(0,0,-1,length/2,0,1,0,0,1,0,0,0,0,0,0,1));
  // Deeper under the roof the steps see less sky: they darken toward the back (vertex colour, z = l here). Only
  // the faces that look up or toward the track (treads, risers; one face per vertex here): the outer back wall
  // and the end walls face open sky and the sun, which stands behind the grandstand.
  const under=l=>{const t=Math.max(0,Math.min(1,(l-b.front-1)/(b.back-b.front-1)));return 1-.42*t*t*(3-2*t);},pos=body.attributes.position,nor=body.attributes.normal,shadeAt=new Float32Array(pos.count*3);
  for(let i=0;i<pos.count;i++)shadeAt.fill(nor.getY(i)>.5||nor.getZ(i)<-.5?under(pos.getZ(i)):1,i*3,i*3+3);body.setAttribute('color',new THREE.BufferAttribute(shadeAt,3));
  body.deleteAttribute('uv');parts.body.push(body.applyMatrix4(frame));
  // Benches at the back of each row, with aisles between the sections. Each row also says how deep
  // it sits under the roof and how much of it the sun reaches past the roof (a ray from a seated
  // chest), for the crowd's light.
  const color=SEAT_COLORS[index%SEAT_COLORS.length],sa=sun.x*b.tx-sun.z*b.ty,sl=sun.x*b.rx-sun.z*b.ry,offset=b.tx*(b.x-blocks[0].x)+b.ty*(b.y-blocks[0].y);
  for(const [r,row] of b.rows.entries())for(const a of SECTIONS){
   const shade=(r%2?.9:1)*under(row.to);tint(box(parts.seats,SECTION_LENGTH,.36,.46,a,rel(row.top)+.18,row.to-.3),color.map(v=>v*shade));
   const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>local(a+u*SECTION_LENGTH/2,rel(row.top)+.36,row.to-.3+v*.23));
   let lit=0;
   for(let u=-2.5;u<=2.5;u+=1){const l0=row.to-.3,k=(roofHeight(b,l0)-(row.top+1.1))/(sun.y+b.roof.slope*sl),l=l0+sl*k,along=a+u+sa*k+offset;if(!(k>0&&l>b.roof.from&&l<b.roof.to&&along>standSpan[0]&&along<standSpan[1]))lit++;}
   rows.push({corners,face:[-b.rx,b.ry],depth:b.rows.length>1?r/(b.rows.length-1):0,sun:lit/6});
  }
  // Roof: one slab per block, rising toward the track, with a fascia on its front edge.
  const {from,to}=b.roof,span=to-from,tilt=Math.atan(b.roof.slope),mid=(from+to)/2;
  box(parts.roof,b.length+.3,.22,span/Math.cos(tilt),0,rel(roofHeight(b,mid)),mid,tilt);
  box(parts.fascia,b.length+.3,.9,.12,0,rel(roofHeight(b,from))-.3,from,0);
  // Back columns and the cantilever girders under the roof.
  const columns=index===blocks.length-1?[-13.4,-6.7,0,6.7,13.4]:[-13.4,-6.7,0,6.7];
  for(const a of columns){
   const l=b.back+STAND.wall/2,top=rel(roofHeight(b,l))-.11;box(parts.steel,.45,top-bottom,.45,a,(top+bottom)/2,l);
   box(parts.steel,.28,.6,(l-from)/Math.cos(tilt),a,rel(roofHeight(b,(l+from)/2))-.41,(l+from)/2,tilt);
  }
 });
 const meshes={};
 for(const [key,material,name,shadow] of [['body',concrete,'Arquibancada_corpo',true],['seats',seatMaterial,'Arquibancada_assentos',true],['roof',roofMaterial,'Arquibancada_cobertura',true],['fascia',fasciaMaterial,'Arquibancada_faixa',true],['steel',steel,'Arquibancada_estrutura',true]]){
  const list=parts[key],g=mergeGeometries(list,false);list.forEach(x=>x.dispose());
  const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.castShadow=shadow;mesh.receiveShadow=true;root.add(mesh);meshes[key]=mesh;
 }
 return {root,rows,obstacles:[meshes.body],stats:{blocks:blocks.length,rows:rows.length}};
}
