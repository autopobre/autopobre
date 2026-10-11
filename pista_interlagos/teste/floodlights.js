import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {pitPoint} from './pit-lane.js';

// Floodlight masts on the pit wall (weather.js: at night, dimmer at dusk): every FLOOD.spacing metres along the
// wall from its nose to its end, a slim mast with a lamp head over the wall that lights the pit lane, the wall and
// the main straight beside it. The light itself goes through the road lamps (headlights.js ROAD_LAMPS: a wide cone
// straight down on the asphalt, kerbs and ground); the heads glow (one draw for all of them) so the row reads from
// down the straight. Track frame of pista.json pit samples: x east, y north; the scene: x, height, -y.
export const FLOOD=Object.freeze({spacing:30,height:9,strength:38,edge:Math.cos(.95),glow:.75,slots:8});

const glowVertex=`attribute vec3 lampCentre;attribute vec2 corner;uniform float glowSize;varying vec2 vCorner;
void main(){vCorner=corner;vec4 view=viewMatrix*vec4(lampCentre,1.0);float dist=length(view.xyz);view.xyz+=normalize(-view.xyz)*min(.6,dist*.3);
 view.xy+=corner*(glowSize+dist*.004);gl_Position=projectionMatrix*view;}`;
const glowFragment=`uniform vec3 glowColor;uniform float glowStrength;varying vec2 vCorner;
void main(){float r2=dot(vCorner,vCorner);if(r2>1.0)discard;gl_FragColor=vec4(glowColor*glowStrength*(exp(-r2*40.0)*6.0+exp(-r2*5.0)*.25),1.0);}`;

// The masts of a circuit with a surveyed pit lane (data.pit), or null. lamps: [{pos, dir, edge, strength}] for the
// road lamps; setLevel(0..1) lights them (0 hides the glow).
export function createFloodlights(data){
 const pit=data.pit;if(!pit?.samples?.length||!(pit.wall_end>pit.wall_nose))return null;
 const root=new THREE.Group();root.name='Holofotes_boxes';
 const mast=new THREE.MeshStandardMaterial({name:'Mastro_holofote',color:0x5d6164,roughness:.55,metalness:.6});
 const housing=new THREE.MeshStandardMaterial({name:'Carcaca_holofote',color:0x2a2c2e,roughness:.5,metalness:.4});
 const lens=new THREE.MeshBasicMaterial({name:'Lente_holofote',color:new THREE.Color().setRGB(.06,.06,.055)});
 const masts=[],heads=[],faces=[],quads=[],lamps=[];
 for(let s=pit.wall_nose+FLOOD.spacing/2;s<pit.wall_end;s+=FLOOD.spacing){
  const p=pitPoint(pit,s,0),wall=pitPoint(pit,s,p.lo-.35),q=pitPoint(pit,s,p.lo+1.2);
  const base=new THREE.Vector3(wall.x,wall.y,wall.z),top=base.clone().setY(base.y+FLOOD.height),head=new THREE.Vector3(q.x,q.y+FLOOD.height-.25,q.z);
  // The mast and the arm out over the lane's wall side; the head along the lane, its lens facing down.
  masts.push(new THREE.CylinderGeometry(.07,.11,FLOOD.height,8).translate(base.x,base.y+FLOOD.height/2,base.z));
  const arm=head.clone().sub(top).setY(0),length=arm.length();
  masts.push(new THREE.CylinderGeometry(.04,.04,length+.1,6).rotateZ(Math.PI/2).rotateY(-Math.atan2(arm.z,arm.x)).translate((top.x+head.x)/2,top.y-.05,(top.z+head.z)/2));
  heads.push(new THREE.BoxGeometry(.95,.2,.55).rotateY(p.heading).translate(head.x,head.y,head.z));
  faces.push(new THREE.PlaneGeometry(.85,.45).rotateX(Math.PI/2).rotateY(p.heading).translate(head.x,head.y-.105,head.z));
  const quad=new THREE.PlaneGeometry(2,2),n=quad.attributes.position.count,centre=new Float32Array(n*3),corner=new Float32Array(n*2);
  for(let i=0;i<n;i++){centre.set([head.x,head.y-.2,head.z],i*3);corner[i*2]=quad.attributes.position.getX(i);corner[i*2+1]=quad.attributes.position.getY(i);}
  quad.setAttribute('lampCentre',new THREE.BufferAttribute(centre,3));quad.setAttribute('corner',new THREE.BufferAttribute(corner,2));quads.push(quad);
  lamps.push({pos:new THREE.Vector3(head.x,head.y-.3,head.z),dir:new THREE.Vector3(0,-1,0),edge:FLOOD.edge,strength:FLOOD.strength});
 }
 if(!lamps.length)return null;
 const merge=list=>{const g=mergeGeometries(list,false);list.forEach(x=>x.dispose());return g;};
 const mastMesh=new THREE.Mesh(merge(masts),mast),headMesh=new THREE.Mesh(merge(heads),housing),faceMesh=new THREE.Mesh(merge(faces),lens);
 for(const m of [mastMesh,headMesh]){m.castShadow=true;m.receiveShadow=true;}
 const glowMaterial=new THREE.ShaderMaterial({name:'Holofote_brilho',vertexShader:glowVertex,fragmentShader:glowFragment,uniforms:{glowSize:{value:FLOOD.glow},glowColor:{value:new THREE.Color(1,.93,.82)},glowStrength:{value:0}},
  transparent:true,depthWrite:false,fog:false,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor});
 const glow=new THREE.Mesh(merge(quads),glowMaterial);glow.frustumCulled=false;glow.renderOrder=3;glow.visible=false;
 root.add(mastMesh,headMesh,faceMesh,glow);
 let level=0;
 return {root,lamps,
  // 0 off (by day), 1 full (night).
  setLevel(value){level=Math.max(0,Math.min(1,value));glow.visible=level>0;glowMaterial.uniforms.glowStrength.value=level;lens.color.setRGB(.06+9*level,.06+8.4*level,.055+7.4*level);for(const l of lamps)l.strength=FLOOD.strength*level;},
  get level(){return level;},
  info:()=>({masts:lamps.length,level,first:lamps[0].pos.toArray().map(v=>+v.toFixed(1))})};
}
