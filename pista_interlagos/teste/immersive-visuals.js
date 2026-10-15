import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {FANS,strapPath} from './immersive-state.js';
import {RIVAL_ROSTER,OPALA_99_RIVAL,FUSCA_ROSTER,FUSCA_99_RIVAL} from './race-roster.js';
import {createPeople,setPose,POSES,OUTFITS,Idler,STEVAN_OUTFITS,dressPerson} from './pit-crew.js';
import {StoryScene} from './story-scene.js';
import {CIRCUITS,circuitId} from './circuits.js';
import {outfitOf} from './story-career.js';
import {curveloPitFrame,serviceSpot,garageBays,pitPoint} from './pit-lane.js';
import {footState,stepOnFoot,placeFootCamera,turnFootView,zoomFootView,footJump} from './on-foot.js';
import {shutOpenings,CarOpenings,carSpot,SPOT_OPENING} from './car-openings.js';
import {createRivalDriver,CABIN_DROP,sharedDriverMaterials} from './rival-driver.js';
import {createBrakeLights,sharedBrakeLights} from './brake-lights.js';
import {createHeadlights,sharedHeadlights,lampSetFor} from './headlights.js';
import {podiumBanner,podiumPlate,podiumRibbon,signBoard} from './pit-textures.js';
import {fuscaCar,rivalCabin,FUSCA_PROFILE,FUSCA_SEAT} from './fusca.js';
import {finishMaterial,setCarDirt,setCarTone} from './car-finish.js';
import {carContact} from './contact-shadows.js';
import {midLevel,sharedMidShapes} from './car-lod.js';
import {trunkInside,showTrunkInside,liveryPlates,liveryMaterial,sharedLivery,LIVERY_SLOTS,liveryLook,rimMaterial,sharedRims,RIM_STYLES} from './car-livery.js';
// V06 parts a rival never shows on track (engine and fuel cell stay under shut panels); the
// exporter also flags every other hidden mesh (bay, trunk, hinges) with the extra "interno".
const HIDDEN_ON_RIVALS=['Motor_CONJUNTO','Tanque_combustivel_CONJUNTO','Interior_do_jogo'];
// The 99's livery (by material): sponsors, logos, drivers' names (Branco: with the tail's 99), its numbers, the
// hood, roof and trunk lid decals and the window stickers. The other cars carry none of it, only their own number.
export const LIVERY_99=/^(Adesivo|Decal_|Pilotos_99_parabrisa|Invent_parabrisa|Jesus_|Logo_frontal|Stickers_vigia_|Branco$)/;
// A team's colours on the 99's model (rivalCar; the player's car, car-livery.js): the body paint takes
// the team's colour (and finish), the side stripe its stripe; one clone per material, kept in cache.
// The clone gets the clear coat again (car-finish.js: a clone loses its shader patch), the team's
// finish on top of it; dirt: a rival's road grime ([amount, seed], car-finish.js setCarDirt), none on the player's;
// tone: its two-tone ([colour, height], setCarTone; car-livery.js LIVERY_PLANS).
export const TEAM_PAINTS=Object.freeze(['Pintura_preta','Faixa_amarela']);
export const teamPaint=(cache,{color,stripe,finish=null,dirt=null,tone=null})=>m=>{
 if(!TEAM_PAINTS.includes(m.name))return m;
 if(!cache.has(m)){const c=m.clone(),body=m.name==='Pintura_preta';c.color.setHex(body?color:stripe);if(body&&finish)Object.assign(c,finish);finishMaterial(c,{rosterFinish:body?finish:null});if(dirt)setCarDirt(c,...dirt);if(body&&tone)setCarTone(c,...tone);cache.set(m,c);}
 return cache.get(m);
};
// A rival's grime, by its number: light, more on some cars than others (about one in five nearly clean), each its
// own pattern (car-finish.js).
export const rivalDirt=number=>{let h=7;for(const ch of String(number))h=(h*31+ch.charCodeAt(0))%1000003;const a=(h%997)/997,b=(h%613)/613;return [a<.2?.08:.22+.4*(a-.2),b*40];};
// The number plates in numberPlates' order: both rear quarters, the roof, the tail.
export const PLATE_NAMES=Object.freeze(['Numero_lateral_','Numero_lateral_','Numero_teto_','Numero_traseiro_']);
// The middle level of detail (car-lod.js midLevel): the team's paint keeps its own materials; the cabin, the engine
// bay, the lamps' reflectors (behind their lenses) and the brake discs behind the rims stay out (by material or group
// name), as the driver does. The floor pan (Metal_escuro) stays: from a low camera the road showed under the bumpers.
const MID_KEEP=/^(Pintura_preta|Faixa_amarela|Pintura_fusca|Paralama_fusca)$/;
const MID_SKIP=/^(Refletor|Gaiola|Mangueira|Rede_tecido|Pintura_preta_interna|Pintura_interna|Chapa_|Fio_|Aluminio_fundido|Disco_aco|Motor_|Aco_tanque|Aco_escuro|Tubo_|Filtro|Tampa_azul|Forro_teto|Vinil_preto|Banco_|Fusca_painel|Volante|Interior_leve|Estrutura_cabine|Piloto_|Luz_de_freio|Farois)/;
// The distant rivals' side profile (farProxy; the car screen's card icons, car-select.js): metres in the
// car frame, nose to +x: the body, the side windows, the axles along the car and the wheels' radius; the
// body's width, the wheels' track (half), the tail and head lamps (x, y, z either side, width across, height)
// and the bumpers (x, y; bumperWidth across). The Fusca's: fusca.js FUSCA_PROFILE (no bumpers; its fenders, in the
// second colour).
export const FAR_PROFILE=Object.freeze({
 body:[[-2.35,.2],[2.42,.2],[2.46,.32],[2.46,.62],[2.35,.8],[.85,.9],[.05,1.4],[-.95,1.4],[-1.65,1],[-2.3,.97],[-2.39,.4]],
 glass:[[.9,.92],[.08,1.37],[-.97,1.37],[-1.7,.99]],axles:[1.55,-1.117],wheel:.316,
 width:1.84,track:.8,tail:{x:-2.37,y:.95,z:.55,w:.35,h:.08},head:{x:2.45,y:.63,z:.605,w:.25,h:.1},bumpers:[[2.47,.42],[-2.41,.45]],bumperWidth:1.8});
const up=new THREE.Vector3(0,1,0);
// A rival's wheel turn, every frame for every car: no new objects (they fed the garbage collector's pauses).
const SPIN_AXIS=new THREE.Vector3(0,0,1),wheelSpin=new THREE.Quaternion();
// A side profile's part below height y (one Sutherland-Hodgman pass): a two-tone's lower band on the distant model.
export function clipBelow(points,y){
 const out=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],ina=a[1]<=y,inb=b[1]<=y;
  if(ina)out.push(a);if(ina!==inb){const t=(y-a[1])/(b[1]-a[1]);out.push([a[0]+(b[0]-a[0])*t,y]);}}
 return out;
}
// A car's number as the rivals carry it where the Opala 99 has its 99: white italic numerals outlined in
// black, so they read on every paint (rivalCar; the player's car in another team's colours, car-livery.js).
// Under the same clear coat as the paint (car-finish.js decal), not a matte patch on the gloss.
export function numberSticker(number){
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=200;const ctx=canvas.getContext('2d');ctx.font='italic 900 170px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=16;ctx.strokeStyle='#101314';ctx.strokeText(number,128,108,228);ctx.fillStyle='#f4f3ee';ctx.fillText(number,128,108,228);
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;return finishMaterial(new THREE.MeshPhysicalMaterial({name:'Numero_colado',map,transparent:true,depthWrite:false,roughness:.35,clearcoat:.8,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
}
// The meshes a sticker is bent onto: what shows of the car under root, but the stickers themselves.
// Meshes under a hidden group are left out: the brake lights' halos (brake-lights.js), hidden while
// the brake is off, stand 4 cm off the tail where the small number goes, and lifted half of it.
function shownBody(root){
 const body=[],walk=o=>{if(o!==root&&!o.visible)return;if(o.isMesh&&!o.name.startsWith('Numero_'))body.push(o);o.children.forEach(walk);};
 walk(root);return body;
}
// Those meshes as triangles in the car's frame (detail's), once for all of a car's stickers; each
// range keeps the faces a raycaster would hit (front ones only unless the material is double-sided,
// turned for a back-sided material or a mirrored mesh). Skinned and instanced meshes (drivers) are
// left out: their geometry is not where they show.
export function bodyTriangles(detail,body){
 const toCar=detail.matrixWorld.clone().invert(),m=new THREE.Matrix4(),v=new THREE.Vector3();
 return body.filter(o=>!o.isSkinnedMesh&&!o.isInstancedMesh).map(o=>{
  const g=o.geometry,p=g.attributes.position,count=g.index?g.index.count:p.count,range=g.drawRange,mats=[o.material].flat(),pos=new Float32Array(p.count*3);
  m.multiplyMatrices(toCar,o.matrixWorld);for(let i=0;i<p.count;i++)v.fromBufferAttribute(p,i).applyMatrix4(m).toArray(pos,i*3);
  const mirrored=m.determinant()<0,groups=Array.isArray(o.material)?g.groups:[{start:0,count:Infinity,materialIndex:0}];
  return {pos,index:g.index?.array??null,ranges:groups.map(r=>{const side=mats[r.materialIndex]?.side??THREE.FrontSide;
   return {start:Math.max(r.start,range.start),end:Math.min(count,r.start+r.count,range.start+range.count),cull:side!==THREE.DoubleSide,turn:side!==THREE.DoubleSide&&(side===THREE.BackSide)!==mirrored};})};
 });
}
// A sticker grid bent onto a car body (bodyTriangles): from center (car frame), w along right and h
// along up in nx×ny cells, each vertex cast inward from 1.5 m out (1.8 m reach) and kept 6 mm off
// the face it lands on. A vertex whose ray misses the body takes its row's hits: in between them over
// a gap, the nearest past the body's edge, so the sticker ends on the paint, not on a flap in the air;
// a row that misses altogether (past the car's end) folds onto the nearest row that landed.
const stickerRay=new THREE.Ray(),stickerHit=new THREE.Vector3(),stickerOffset=new THREE.Vector3();
export function bendOnBody(body,center,right,up,w,h,nx=12,ny=6){
 const normal=right.clone().cross(up),lift=1.5,reach=1.8,slack=1e-4,near=[],d=new THREE.Vector3(),points=[],hits=[],uv=[],index=[];
 // The triangles under the sticker within the rays' reach, with their extent across it: each vertex
 // is placed across the sticker once, and only the triangles kept get a box and corners.
 for(const {pos,index:order,ranges} of body){
  const count=pos.length/3,across=new Float32Array(count),along=new Float32Array(count),out=new Float32Array(count);
  for(let i=0;i<count;i++){d.fromArray(pos,i*3).sub(center);across[i]=d.dot(right);along[i]=d.dot(up);out[i]=d.dot(normal);}
  for(const {start,end,cull,turn} of ranges)for(let k=start;k+2<end;k+=3){
   const i0=order?order[k]:k,i1=order?order[k+1]:k+1,i2=order?order[k+2]:k+2;
   const a0=Math.min(across[i0],across[i1],across[i2]),a1=Math.max(across[i0],across[i1],across[i2]);if(a1<-w/2-slack||a0>w/2+slack)continue;
   const b0=Math.min(along[i0],along[i1],along[i2]),b1=Math.max(along[i0],along[i1],along[i2]);if(b1<-h/2-slack||b0>h/2+slack)continue;
   const n0=Math.min(out[i0],out[i1],out[i2]),n1=Math.max(out[i0],out[i1],out[i2]);if(n1<lift-reach||n0>lift)continue;
   near.push({box:[a0,a1,b0,b1,n0,n1],cull,corners:(turn?[i2,i1,i0]:[i0,i1,i2]).map(i=>new THREE.Vector3().fromArray(pos,i*3))});
  }
 }
 stickerRay.direction.copy(normal).negate();
 for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
  const a=(i/nx-.5)*w,b=(j/ny-.5)*h,p=center.clone().addScaledVector(right,a).addScaledVector(up,b);stickerRay.origin.copy(p).addScaledVector(normal,lift);
  let best=reach,face=null;
  for(const t of near){const box=t.box;if(a<box[0]-slack||a>box[1]+slack||b<box[2]-slack||b>box[3]+slack||!stickerRay.intersectTriangle(...t.corners,t.cull,stickerHit))continue;const far=stickerHit.distanceTo(stickerRay.origin);if(far<best){best=far;face=t;p.copy(stickerHit);}}
  if(face){const [A,B,C]=face.corners;stickerOffset.subVectors(B,A).cross(d.subVectors(C,A)).normalize();if(stickerOffset.dot(normal)<0)stickerOffset.negate();p.addScaledVector(stickerOffset,.006);}
  points.push(p);hits.push(!!face);uv.push(i/nx,j/ny);
  if(i&&j){const a=(j-1)*(nx+1)+i-1,c=j*(nx+1)+i-1;index.push(a,a+1,c+1,a,c+1,c);}
 }
 const rows=[];
 for(let j=0;j<=ny;j++){
  const row=j*(nx+1),landed=[];for(let i=0;i<=nx;i++)if(hits[row+i])landed.push(i);if(!landed.length)continue;rows.push(j);
  for(let i=0;i<=nx;i++){if(hits[row+i])continue;const before=landed.findLast(k=>k<i),after=landed.find(k=>k>i);
   if(before!==undefined&&after!==undefined)points[row+i].lerpVectors(points[row+before],points[row+after],(i-before)/(after-before));else points[row+i].copy(points[row+(before??after)]);}
 }
 if(rows.length)for(let j=0;j<=ny;j++){if(rows.includes(j))continue;const k=rows.reduce((a,b)=>Math.abs(b-j)<Math.abs(a-j)?b:a);for(let i=0;i<=nx;i++)points[j*(nx+1)+i].copy(points[k*(nx+1)+i]);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(p=>[p.x,p.y,p.z]),3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();return g;
}
const leanRotation=new THREE.Quaternion(),leanEuler=new THREE.Euler(),poseForward=new THREE.Vector3(),poseUp=new THREE.Vector3(),poseSide=new THREE.Vector3(),poseMatrix=new THREE.Matrix4();
export function trackPoint(data,s,offset=0){
 const a=data.samples,L=data.meta.reconstructed_xy_m;s=((s%L)+L)%L;
 let lo=0,hi=a.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(a[mid][0]<=s)lo=mid;else hi=mid-1;}
 const p=a[lo],q=a[(lo+1)%a.length],span=(lo===a.length-1?L:q[0])-p[0],u=Math.max(0,Math.min(1,(s-p[0])/Math.max(.001,span))),mix=k=>p[k]+(q[k]-p[k])*u;
 const tx=mix(7),ty=mix(8);return {x:mix(1)-ty*offset,y:mix(3)+mix(5)*offset+.055,z:-mix(2)-tx*offset,heading:Math.atan2(ty,tx),grade:mix(6),bank:mix(5),width:mix(4),index:lo};
}
export class ImmersiveVisuals {
 constructor(scene,carRoot,data,driver,car,rivalTemplate){
  this.scene=scene;this.driver=driver;this.carRoot=carRoot;this.data=data;this.root=new THREE.Group();this.root.visible=false;scene.add(this.root);
  this.materials={};this.time=0;
  // Levels of detail by apparent distance (detailLevel; main.js setCarDetail, graphics-settings.js CAR_DETAIL).
  this.lod={near:14,far:45};
  // The podium's stage: a clear, level spot near the line, off the track (circuits.js podium: metres along the
  // track and across it), else 35 m past the line and 32 m to the side.
  const [podiumS,podiumD]=CIRCUITS[circuitId(data.meta.id)]?.podium??[35,-32];
  this.stage=new THREE.Group();this.root.add(this.stage);const anchor=trackPoint(data,podiumS,podiumD);
  anchor.y=Math.max(...[-13,13].flatMap(x=>[-11,11].map(z=>car.sample(anchor.x+x,-anchor.z-z).z)))+.2;this.stage.position.set(anchor.x,anchor.y,anchor.z);
  this.podium=new THREE.Group();this.stage.add(this.podium);
  this.box(this.stage,[0,-1.5,0],[26,3,23],0x353d3d);
  for(const z of [-10.5,10.5])this.box(this.stage,[0,.02,z],[25,.04,.18],0xeedbbb);
  // Before the race the pilot passes the hat round in front of the circuit's own pit
  // garages (pit-building.js): rivals' cars parked at their teams' doors, the Opala 99
  // inside Box 99 and six supporters on the working lane. The group is not turned, so
  // the hero's yaw stays a world heading; `lane` converts to lane coordinates.
  this.people=createPeople();this.crowd=new THREE.Group();this.crowd.name='Vaquinha_nos_boxes';this.root.add(this.crowd);
  const pit=data.pit??(data.meta.id==='curvelo'?curveloPitFrame(data):null);this.lane=this.crowdFrame(pit,anchor);this.crowd.position.copy(this.lane.origin);
  const L=this.lane,outfits=[{top:0x76a67b,bottom:0x2b3a55,hat:'cap',hatColor:0x2f7d4a,skin:0xc68e6a},{top:0xd69569,bottom:0x3b3f45,hairStyle:'long',hair:0x5a3a22,skin:0xe0b08f},{top:0xab7daf,bottom:0x3b3f45,hairStyle:'bun',hair:0x3b2a1a,glasses:true,skin:0xd8a27e,belly:.4},{top:0xb3a77a,bottom:0x2b3a55,hat:'cap',hatColor:0xc4232a,skin:0xb77a55},{top:0x77888f,bottom:0x1b1d20,hairStyle:'curly',skin:0x6b4128},{top:0x7492c9,bottom:0x2d3338,mustache:true,hairStyle:'bald',skin:0x8d5a3b}];
  // Supporters ahead of the pilot, between the parked cars, turned toward him.
  const spots=[[4,-1.4,.2,'ready'],[6.5,1,-.5,'stand'],[9.5,-.4,.35,'folded'],[16.5,1.1,-.3,'stand'],[19,-1.2,.4,'folded'],[22,.6,0,'ready']];
  this.fans=FANS.map((fan,i)=>{
   const [x,dd,turn,idle]=spots[i],pos=L.point(x,L.spotD+dd),person=this.people.person(outfits[i]);person.position.copy(pos);person.rotation.y=L.heading+Math.PI+(dd>0?.5:-.5)+turn;setPose(person,POSES[idle]);this.crowd.add(person);
   const label=this.tag(this.crowd,fan.name,[pos.x,pos.y+2.1,pos.z],1.8,.30),dollar=this.tag(this.crowd,'$',[pos.x,pos.y+2.65,pos.z],.43,.56,'#ffe380','#19452b');
   const reaction=this.tag(this.crowd,'HAHA! + R$ '+fan.gift,[pos.x,pos.y+3.15,pos.z],2.4,.45,'#203823','#c7ed9c');reaction.visible=false;
   // Waiting for the pilot they idle: phone, chatting, arms crossed (pit-crew.js).
   const idler=new Idler(person,'fan',{props:{phone:this.people.carry('phone',person.userData.rig.limbs[1].hand)},seed:.2+i*.17});
   return {pos,person,label,dollar,reaction,cheerUntil:0,idle,idler};
  });
  this.socialMarker=new THREE.Mesh(new THREE.OctahedronGeometry(.18),new THREE.MeshStandardMaterial({color:0x86e37c,emissive:0x28651f,roughness:.3}));this.crowd.add(this.socialMarker);
  // The pilot, out of the car in his cap; limbs listed left leg, left arm, right leg, right arm.
  this.hero=this.people.person(OUTFITS.driver);this.crowd.add(this.hero);const rig=this.hero.userData.rig.limbs;this.hero.userData.limbs=[rig[-1].leg,rig[-1].arm,rig[1].leg,rig[1].arm];
  this.heroStart=L.point(-1.5,L.spotD);this.heroYaw=L.heading;this.hero.position.copy(this.heroStart);this.hero.rotation.y=this.heroYaw;this.foot=footState(this.heroYaw,{floor:this.crowd.position.y+this.heroStart.y});
  this.rivals=RIVAL_ROSTER.map(entry=>{const group=this.rivalCar(rivalTemplate,entry.color,entry.number,entry.shortName,{driven:true,stripe:entry.stripe,finish:entry.finish,dirt:true});group.userData.entry=entry;this.root.add(group);return group;});
  this.parked=[];
  if(pit){
   // The four teams nearest Box 99 park nose in at their garage doors.
   const {bay,team}=garageBays(pit,RIVAL_ROSTER.length);
   for(const [b,k] of [...team.entries()].sort((m,n)=>m[1]-n[1]).slice(0,4)){
    const sv=pit.garages[0]+(b+.5)*bay,x=sv-pit.box99.s,d=pitPoint(pit,sv).hi+.35-2.75,entry=RIVAL_ROSTER[k],parked=this.rivalCar(rivalTemplate,entry.color,entry.number,entry.shortName,{stripe:entry.stripe,finish:entry.finish,dirt:true});
    parked.position.copy(L.point(x,d));parked.rotation.y=L.heading+Math.PI/2;this.crowd.add(parked);this.parked.push({x,d});
   }
   const own=this.ownCar(rivalTemplate);own.position.copy(L.point(0,pit.box99.front+6.5,.05));own.rotation.y=L.heading-Math.PI/2;this.crowd.add(own);this.ownSpot={x:0,d:pit.box99.front+6.5};this.own=own;this.ownOpenings=new CarOpenings().attach(own);
  }
  // Leonardo Martins, of the #19 (gold and black), with his coffee at the door of his team's garage
  // (the roller door painted 19), where one of his crew stands in the race: the crewman steps
  // out of the paddock while he is there (leoDoor, pit-building.js). He offers the pilot a coffee
  // when he walks up (ImmersiveMode; state.offerCoffee); the cup he gives goes into one of the
  // pilot's hands, as a snack from the Tia's café would. Without that door (no pit block) he waits
  // by the Tia's café.
  {const entry=RIVAL_ROSTER.find(r=>r.number==='19'),door=scene.getObjectByName('Porta_equipe_19');let pos,yaw;
   if(door){pos=door.getWorldPosition(new THREE.Vector3()).sub(this.crowd.position);const f=new THREE.Vector3(1,0,0).applyQuaternion(door.getWorldQuaternion(new THREE.Quaternion()));yaw=Math.atan2(-f.z,f.x);this.leoDoor=door;}
   else{const front=pit?.box99?pit.box99.front:L.spotD+2.5;pos=L.point(-7.2,front-1.1);yaw=Math.atan2(-(this.heroStart.z-pos.z),this.heroStart.x-pos.x);}
   const person=this.people.person({top:entry.color,bottom:0x1b1d20,trim:entry.stripe,hat:'cap',hatColor:entry.stripe,skin:0xc68e6a});person.name='Leonardo_Martins_19';
   person.position.copy(pos);person.rotation.y=yaw;setPose(person,POSES.stand);this.crowd.add(person);
   const cup=this.people.carry('cup',person.userData.rig.limbs[1].hand);
   this.leo={pos,person,cup,yaw,label:this.tag(this.crowd,'Leonardo Martins · #19',[pos.x,pos.y+2.1,pos.z],2.6,.3),idler:new Idler(person,'counter',{props:{cup},seed:.57})};}
  // Kléber Eletric's box (story-scene.js): at the door of his team's garage, or along the paddock without one.
  {const k=RIVAL_ROSTER.findIndex(r=>r.number==='70'),entry=RIVAL_ROSTER[k];let at=null;
   if(pit&&entry){const {bay,team}=garageBays(pit,RIVAL_ROSTER.length),b=[...team].find(([,i])=>i===k)?.[0];
    if(b!==undefined){const sv=pit.garages[0]+(b+.5)*bay,front=pitPoint(pit,sv).hi+.35;at=(a,o)=>{const p=pitPoint(pit,sv+a,front-o);return new THREE.Vector3(p.x,p.y,p.z);};}}
   if(!at){const front=pit?.box99?.front??L.spotD+3;at=(a,o)=>L.point(-16+a,front-o).add(this.crowd.position);}
   const logo=new THREE.MeshStandardMaterial({name:'Marca_Eletric',map:new THREE.TextureLoader().load('./assets/branding/patrocinio_eletric_v1.webp',t=>{t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;}),transparent:true,roughness:.55,polygonOffset:true,polygonOffsetFactor:-1});
   const car=entry?this.rivalCar(rivalTemplate,entry.color,entry.number,entry.shortName,{stripe:entry.stripe,finish:entry.finish,dirt:true}):null;
   this.storyScene=new StoryScene({people:this.people,parent:this.root,at,car,groundAt:(x,y)=>this.groundAt?.(x,y),logo});}
  this.banner(this.crowd,'PADDOCK · VAQUINHA ANTES DA LARGADA',L.point(12,L.bounds.d1-.1,6.3),L.heading,9,.55,'#f5d279','#1a292b');
  this.truck=this.truckModel();this.root.add(this.truck);
  this.strap=this.strapMesh();this.root.add(this.strap);
  this.damage=new THREE.Group();this.damage.visible=false;carRoot.add(this.damage);
  this.tank=new THREE.Group();this.damage.add(this.tank);this.box(this.tank,[0,0,0],[.64,.17,.95],0x4a4842);
  for(const z of [-.31,.31])this.box(this.tank,[0,-.012,z],[.67,.185,.045],0x302c26);
  this.tankTethers=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(12),3)),new THREE.LineBasicMaterial({color:0x594f3e}));this.damage.add(this.tankTethers);
  this.crackCanvas=document.createElement('canvas');this.crackCanvas.width=1024;this.crackCanvas.height=512;this.crackTexture=new THREE.CanvasTexture(this.crackCanvas);
  const glassGeometry=new THREE.BufferGeometry();glassGeometry.setAttribute('position',new THREE.Float32BufferAttribute([.643,.927,-.66,.643,.927,.66,.295,1.333,-.59,.295,1.333,.59],3));glassGeometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));glassGeometry.setIndex([0,1,2,2,1,3]);glassGeometry.computeVertexNormals();
  this.crackedGlass=new THREE.Mesh(glassGeometry,new THREE.MeshBasicMaterial({map:this.crackTexture,transparent:true,side:THREE.DoubleSide,depthWrite:false,opacity:.9}));this.damage.add(this.crackedGlass);this.lastGlass=-1;
  this.debris=new THREE.Mesh(new THREE.IcosahedronGeometry(.085,0),this.mat(0x655a4d));this.root.add(this.debris);
  const leakGeometry=new THREE.BufferGeometry();leakGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(240*3),3));this.leak=new THREE.Points(leakGeometry,new THREE.PointsMaterial({color:0x4b341b,size:.22,transparent:true,opacity:.55,depthWrite:false}));this.leak.frustumCulled=false;this.root.add(this.leak);this.leakCount=0;this.leakCursor=0;this.leakTimer=0;
  this.judge=this.people.person({top:0xe9e5d5,bottom:0x2d3338,hat:'cap',hatColor:0x37536a,glasses:true});this.root.add(this.judge);this.judgeIdle=new Idler(this.judge,'judge',{seed:.61});this.tag(this.judge,'JUIZ',[0,2.0,0],1.2,.38,'#fff','#37536a');
  this.closedPark=this.tag(this.root,'PARQUE FECHADO · AGUARDE A VISTORIA',[0,0,0],6,.7,'#fff','#285e69');
  this.pitSign=this.tag(this.root,'BOXES',[0,0,0],5,.7,'#fff','#8e4736');
  this.podiumHero=this.people.person(OUTFITS.driver);const cheer=this.podiumHero.userData.rig.limbs;this.podiumHero.userData.limbs=[cheer[-1].leg,cheer[-1].arm,cheer[1].leg,cheer[1].arm];this.podium.add(this.podiumHero);
  this.podiumSlots=[];this.podiumRivals=[];this.podiumPlates=[];
  for(let i=0;i<6;i++){
   const height=[1.65,1.4,1.2,.95,.72,.45][i],z=i===0?0:i%2===1?(i+1)/2*2.8:-i/2*2.8;
   this.box(this.podium,[-2,height/2,z],[2,height,2.45],i===5?0xc89642:0x576a6c).name='Podio_'+(i+1);
   this.podiumSlots.push({height,z});if(i===5)this.podiumHero.position.set(-2,height,z);
  }
  this.dressPodium(null,'');
  this.podiumDressing();
  this.box(this.podium,[-9,1.5,-5],[.25,3,5],0x747977);this.box(this.podium,[-6.7,3.05,-5],[4.8,.18,5],0x797b73);
  this.garageDoor=this.box(this.podium,[-4.35,1.3,-5],[.08,2.6,4.7],0x58615c);
  this.blazer=this.car(0x294c62,'BLAZER');for(const label of this.blazer.children.filter(o=>o.isSprite))label.removeFromParent();this.blazer.scale.set(1.06,1.18,1.05);this.blazer.position.set(-6.8,.1,-5);this.podium.add(this.blazer);
 }
 // The registration circle at the team stand on the pit wall (layout.desk, pit-box99.js),
 // as a mission marker in GTA: a glowing ring on the deck, a beam fading upward, an arrow
 // bobbing over it and a sign seen from anywhere in the paddock. Points are kept local.
 addDesk(desk){
  if(!desk)return;const o=this.crowd.position,local=v=>v.clone().sub(o);
  this.desk={face:desk.face,look:desk.look,spot:local(desk.spot),team:local(desk.team),route:desk.route.map(local)};
  const canvas=document.createElement('canvas');canvas.width=4;canvas.height=128;const ctx=canvas.getContext('2d'),g=ctx.createLinearGradient(0,0,0,128);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(1,'#fff');ctx.fillStyle=g;ctx.fillRect(0,0,4,128);
  const fade=new THREE.CanvasTexture(canvas),glow=(extra={})=>new THREE.MeshBasicMaterial({color:0xffc21a,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,...extra});
  const marker=new THREE.Group();marker.name='Inscricao_equipe_99';marker.position.copy(this.desk.spot);
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.46,.46,1.3,40,1,true).translate(0,.65,0),glow({map:fade,opacity:.5}));
  const ring=new THREE.Mesh(new THREE.RingGeometry(.37,.46,48).rotateX(-Math.PI/2).translate(0,.015,0),glow({opacity:.95}));
  const disc=new THREE.Mesh(new THREE.CircleGeometry(.37,48).rotateX(-Math.PI/2).translate(0,.012,0),glow({opacity:.16}));
  const arrow=new THREE.Mesh(new THREE.ConeGeometry(.15,.32,4).rotateX(Math.PI),new THREE.MeshStandardMaterial({color:0xffc21a,emissive:0xb07a00,roughness:.35}));arrow.position.y=2.2;
  marker.add(beam,ring,disc,arrow);this.crowd.add(marker);
  const sign=this.tag(this.crowd,'INSCRIÇÃO · EQUIPE 99',[this.desk.spot.x,this.desk.spot.y+2.8,this.desk.spot.z],2.6,.4,'#1d1a0c','#ffc83a');sign.material.depthTest=false;sign.renderOrder=90;
  this.deskMarker={marker,beam,ring,disc,arrow,sign};
 }
 // In the circle (it opens the registration), or near enough for the action key.
 atDesk(){return this.nearDesk(.5);}
 nearDesk(radius=1.7){if(!this.desk||this.inCar)return false;const p=this.hero.position,s=this.desk.spot;return Math.hypot(p.x-s.x,p.z-s.z)<radius&&Math.abs(p.y-s.y)<.6;}
 // The way to the circle: to the foot of the steps, up onto the wall, then to the circle
 // (the first legs are skipped once he is on the steps or up there).
 deskRoute(){if(!this.desk)return null;const [foot,top,spot]=this.desk.route,y=this.hero.position.y;return (y>top.y-.15?[spot]:y>foot.y+.2?[top,spot]:[foot,top,spot]).map(v=>v.clone());}
 // The Tia's café (pit-box99.js layout: cafeSeat, where a customer stands at her counter, and route,
 // from Box 99's door through the garage to it): its sign, seen through walls as in the pit stop's
 // stroll, shows the way. Points are kept local.
 addCafe(layout){
  if(!layout?.cafeSeat)return;const o=this.crowd.position,local=v=>v.clone().sub(o);
  const sign=this.tag(this.crowd,'CARDÁPIO DA TIA',local(layout.cafeSign??layout.cafeSeat.clone().setY(layout.cafeSeat.y+2.9)).toArray(),2.6,.4,'#ffe2a0','#754627');sign.material.depthTest=false;sign.renderOrder=90;sign.visible=false;
  // The route goes straight into the garage from its door before turning to the café: the Box 99
  // crew waits along the door (solid people in the paddock) and a corner cut there runs into them.
  const route=(layout.route??[layout.cafeSeat]).map(local);if(route.length>1){const door=this.lane.lane(route[0]),inside=this.lane.point(door.x,door.d+1.4);inside.y=route[0].y;route.splice(1,0,inside);}
  this.cafe={seat:local(layout.cafeSeat),route,sign};
 }
 // With the menu open the pilot turns to the Tia (behind the counter, under the sign) and the camera
 // looks at both from a little to the side, clear of her menu, which stands on the right.
 faceCafe(){if(!this.cafe)return;const h=this.hero.position,t=this.cafe.sign.position,face=Math.atan2(-(t.z-h.z),t.x-h.x);this.hero.rotation.y=face;this.foot.yaw=face-.35;this.foot.pitch=.22;}
 // At the counter, as at the pit stop: close enough for the menu.
 nearCafe(radius=2.6){return !!this.cafe&&!this.inCar&&this.hero.position.distanceTo(this.cafe.seat)<radius;}
 // The way on foot to the counter: on along the route from where the pilot is on it, inside the
 // garage or the café (layout.walk gives a floor there; the team stand is another level, outside the
 // walls it gives none), else round the parked cars to Box 99's door and in.
 cafeRoute(){
  if(!this.cafe)return null;const path=this.cafe.route,h=this.hero.position,at=this.hero.getWorldPosition(new THREE.Vector3()),walk=this.layout?.walk;let k=0;
  if(!walk||typeof walk(at)==='number'&&!this.layout.overWalls?.(at)){
   path.forEach((p,i)=>{if(p.distanceTo(h)<path[k].distanceTo(h))k=i;});
   if(k<path.length-1&&h.distanceTo(path[k+1])<path[k].distanceTo(path[k+1]))k++;
  }
  return k>0?path.slice(k).map(p=>p.clone()):[...this.routeTo(path[0]),...path.slice(1).map(p=>p.clone())];
 }
 // At the desk the pilot turns to the engineer and the camera frames the two of them and the screens.
 faceDesk(){if(!this.desk)return;this.hero.rotation.y=this.desk.face;this.foot.yaw=this.desk.look;this.foot.pitch=.32;}
 // Paddock frame at the Box 99 service box: local points (unturned group) from lane
 // coordinates (x along the lane from Box 99, d across it) and back, and walking limits.
 crowdFrame(pit,fallback){
  if(!pit)return {origin:new THREE.Vector3(fallback.x,fallback.y,fallback.z),heading:0,spotD:0,point:(x,d,y=0)=>new THREE.Vector3(x,y,-d),lane:v=>({x:v.x,d:-v.z}),bounds:{x0:-8,x1:8,d0:-8,d1:8}};
  const spot=serviceSpot(pit),b=pit.box99,o=pitPoint(pit,b.s,spot.d),ux=Math.cos(o.heading),uy=Math.sin(o.heading),edge=pitPoint(pit,b.s);
  return {origin:new THREE.Vector3(o.x,o.y,o.z),heading:o.heading,spotD:spot.d,
   point:(x,d,y=0)=>{const p=pitPoint(pit,b.s+x,d);return new THREE.Vector3(p.x-o.x,p.y-o.y+y,p.z-o.z);},
   lane:v=>({x:v.x*ux-v.z*uy,d:spot.d-v.x*uy-v.z*ux}),bounds:{x0:-30,x1:30,d0:edge.lo+.5,d1:b.front-.15}};
 }
 // Where the rivals' numbers go, from the Opala 99's own stickers (Adesivo_*_99 on the
 // rear quarters, Decal_teto_99 read from the driver's side, the small 99 left of centre
 // on the tail). A grid is cast onto the body once per model, so each sticker follows
 // its curves 6 mm off the paint. The quarters' numbers wrap round the body's rear corner
 // (the 99's do too): a ray every 1.6 cm across them, or the corner cuts into the sticker.
 numberPlates(template,detail){
  this.plateShapes??=new WeakMap();let list=this.plateShapes.get(template);if(list)return list;
  detail.parent.updateMatrixWorld(true);const body=bodyTriangles(detail,shownBody(detail));
  const V=(x,y,z)=>new THREE.Vector3(x,y,z),bend=(...args)=>bendOnBody(body,...args);
  list=[bend(V(-1.835,.667,-.86),V(-1,0,0),V(0,1,0),.57,.45,36),bend(V(-1.906,.67,.86),V(1,0,0),V(0,1,0),.57,.45,36),bend(V(-.19,1.3,0),V(-1,0,0),V(0,0,1),.94,.74),bend(V(-2.18,.69,-.29),V(0,0,1),V(0,1,0),.2,.156)];
  this.plateShapes.set(template,list);return list;
 }
 // The livery's shapes on this model (car-livery.js LIVERY_SLOTS: bonnet, doors, fenders, quarters, windscreen
 // banner, trunk lid, twin stripes), cast like the numbers, once per model; uv over 0..1, cut to the canvas per car.
 liveryShapes(template,detail){
  this.liveryCache??=new WeakMap();let shapes=this.liveryCache.get(template);if(shapes)return shapes;
  detail.parent?.updateMatrixWorld(true);const body=bodyTriangles(detail,shownBody(detail)),V=a=>new THREE.Vector3(...a);shapes={};
  for(const [name,S] of Object.entries(LIVERY_SLOTS)){
   const [nx,ny]=S.grid??[14,5],at=V(S.at),right=V(S.right),across=right.clone();
   const list=(S.stripes??[0]).map(off=>bendOnBody(body,at.clone().addScaledVector(across,off),right,V(S.up),S.w,S.h,nx,ny));
   shapes[name]=list.length>1?mergeGeometries(list,false):list[0];if(list.length>1)list.forEach(g=>g.dispose());
  }
  this.liveryCache.set(template,shapes);return shapes;
 }
 // A sponsor sticker on both doors of a rival (car 70's Old Stock ads): on the door skin below the
 // window (the V06 doors run from x -0.29 to 0.89 m, car frame), bent onto the body, with the
 // detailed model (hidden with it in the distance).
 // body: the meshes to bend onto, for a car that is not a rival's clone (the player's, car-livery.js).
 doorStickers(obj,material,{x=.3,y=.47,w=.52,h=.35,body=null}={}){
  const detail=obj.userData.detail??(body?obj:null);if(!detail)return [];
  detail.parent.updateMatrixWorld(true);const triangles=bodyTriangles(detail,body??shownBody(detail));
  return [-1,1].map(side=>{const sticker=new THREE.Mesh(bendOnBody(triangles,new THREE.Vector3(x,y,side*.9),new THREE.Vector3(side,0,0),new THREE.Vector3(0,1,0),w,h),material);sticker.renderOrder=2;detail.add(sticker);return sticker;});
 }
 // The team's own Opala for the paddock: the player's model, livery and cage.
 ownCar(template){
  if(!template)return this.car(0x151515,'99');const root=template.clone(true),structure=this.carRoot.getObjectByName('Estrutura_cabine_V04');if(structure)root.add(structure.clone(true));shutOpenings(root);
  root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  // Parked in the garage and walked round, it carries the player's whole cockpit, still (cockpit.js
  // outsideCopy), not the light interior of the rivals.
  const cabin=this.carRoot.getObjectByName('Interior_Opala_99')?.userData.outsideCopy?.();root.add(cabin??this.lightInterior());
  // Its trunk's inside shows only with the lid open (car-livery.js), as on the player's car.
  root.userData.trunkInside=trunkInside(root);root.name='Opala_99_no_box';return root;
 }
 mat(color){return this.materials[color]??=(new THREE.MeshStandardMaterial({color,roughness:.76}));}
 // The car GLB carries no interior (the player's cockpit is built at runtime, cockpit.js): the
 // other Opalas get a light one that shows through their windows, at the cockpit's own places:
 // seat, head restraint, steering wheel and column dropped onto the V06 floor as the player's
 // are, dash top up to the windscreen. One material. A driven rival's wheel comes with its driver.
 lightInterior({wheel=true}={}){
  const g=new THREE.Group(),dark=this.mat(0x17191b),add=(geometry,p,r=[0,0,0],drop=CABIN_DROP)=>{const o=new THREE.Mesh(geometry,dark);o.position.set(p[0],p[1]+drop,p[2]);o.rotation.set(...r);o.castShadow=o.receiveShadow=true;g.add(o);};
  add(new THREE.BoxGeometry(.42,.08,.44),[-.17,.38,-.34]);
  add(new THREE.BoxGeometry(.08,.62,.46),[-.37,.72,-.34],[0,0,.16]);
  add(new THREE.BoxGeometry(.08,.22,.26),[-.44,1.13,-.34],[0,0,.16]);
  if(wheel)add(new THREE.TorusGeometry(.175,.016,8,24).rotateY(Math.PI/2),[.22,.88,-.34],[0,0,-.38]);
  add(new THREE.CylinderGeometry(.022,.022,.4,8).rotateZ(Math.PI/2),[.41,.806,-.34],[0,0,-.38]);
  add(new THREE.BoxGeometry(.37,.034,1.40),[.755,.89,0],[0,0,0],0);
  g.name='Interior_leve';return g;
 }
 box(parent,p,size,color){const o=new THREE.Mesh(new THREE.BoxGeometry(...size),this.mat(color));o.position.set(...p);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
 // px: the canvas's width (a small sign needs less than a banner across a building).
 labelTexture(text,w,h,fg,bg,px=1024){
  const c=document.createElement('canvas');c.width=px;c.height=Math.max(px/8,Math.round(px*h/w));const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${Math.round(c.height*.55)}px Arial`;ctx.fillText(text,px/2,c.height/2,px*.947);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
 }
 tag(parent,text,p,w=3,h=.5,fg='#fff',bg='#192d30'){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.labelTexture(text,w,h,fg,bg),depthWrite:false}));sprite.position.set(...p);sprite.scale.set(w,h,1);parent.add(sprite);return sprite;}
 // A flat banner fixed to a wall, facing `heading` (a sprite this wide turns into the wall).
 banner(parent,text,p,heading,w,h,fg,bg,px){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:this.labelTexture(text,w,h,fg,bg,px)}));m.position.copy(p);m.rotation.y=heading;parent.add(m);return m;}
 human(color){
  const root=new THREE.Group(),limbs=[];
  this.box(root,[0,1.13,0],[.33,.58,.46],color);this.box(root,[0,.82,0],[.3,.2,.4],color===0xd82125?color:0x252c33);
  for(const side of [-1,1]){
   const leg=new THREE.Group();leg.name='Membro_perna_'+side;leg.position.set(0,.82,side*.12);root.add(leg);this.box(leg,[0,-.35,0],[.16,.68,.17],color===0xd82125?color:0x253344);this.box(leg,[.07,-.74,0],[.3,.1,.2],0x111719);limbs.push(leg);
   const arm=new THREE.Group();arm.name='Membro_braco_'+side;arm.position.set(0,1.37,side*.3);root.add(arm);this.box(arm,[0,-.25,0],[.14,.52,.14],color);this.box(arm,[0,-.54,0],[.12,.13,.13],0xc99472);limbs.push(arm);
  }
  const head=new THREE.Mesh(new THREE.SphereGeometry(.16,12,8),this.mat(0xc99472));head.position.y=1.61;root.add(head);root.userData={limbs,head};return root;
 }
 car(color,number){
  const root=new THREE.Group();this.box(root,[.05,.61,0],[4.28,.59,1.70],color);this.box(root,[-.3,1.07,0],[1.95,.52,1.5],0x22363e);this.box(root,[-.35,1.36,0],[1.75,.065,1.5],color);
  this.box(root,[1.34,.93,0],[1.55,.08,1.67],color);this.box(root,[-1.72,.92,0],[.83,.08,1.67],color);
  for(const x of [-1.13,1.53])for(const z of [-.83,.83]){const tyre=new THREE.Mesh(new THREE.CylinderGeometry(.316,.316,.205,16).rotateX(Math.PI/2),this.mat(0x16191a));tyre.position.set(x,.316,z);root.add(tyre);}
  for(const z of [-.54,.54])this.box(root,[2.21,.63,z],[.025,.17,.27],0xe7e5c4);
  this.box(root,[-2.13,.65,0],[.025,.13,1.27],0x972b25);
  if(number==='BLAZER'){this.box(root,[-.55,1.22,0],[3.25,.69,1.52],0x22363e);this.box(root,[-.55,1.59,0],[3.29,.07,1.56],color);for(const x of [-1.5,-.55,.5])this.box(root,[x,1.23,0],[.075,.67,1.57],color);}
  this.tag(root,number,[0,number==='BLAZER'?1.83:1.45,0],number==='BLAZER'?1.3:.7,.35,'#fff','#223234');return root;
 }
 // ~250-triangle silhouette in the rival's colours, for distant cars: the Opala's, or another profile's
 // (FAR_PROFILE's fields; the Fusca's, fusca.js FUSCA_PROFILE, whose fenders take the second colour).
 // tone: a two-tone's lower colour ([colour, height], car-livery.js), the body below it in that colour.
 farProxy(color,p=FAR_PROFILE,second=color,tone=null){
  const paint=new THREE.Color().setHex(color),parts=[];
  const add=(geometry,rgb)=>{let g=geometry.index?geometry.toNonIndexed():geometry;for(const key of Object.keys(g.attributes))if(key!=='position'&&key!=='normal')g.deleteAttribute(key);const c=new Float32Array(g.attributes.position.count*3);for(let i=0;i<c.length;i+=3){c[i]=rgb.r;c[i+1]=rgb.g;c[i+2]=rgb.b;}g.setAttribute('color',new THREE.BufferAttribute(c,3));parts.push(g);};
  const profile=(points,width,rgb)=>{const shape=new THREE.Shape(points.map(([x,y])=>new THREE.Vector2(x,y)));add(new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false}).translate(0,0,-width/2),rgb);};
  profile(p.body,p.width,paint);
  // Stretched .5% along about its middle: its tail and nose walls stand ~1 cm clear of the body's (coplanar, they z-fought).
  if(tone){const lower=clipBelow(p.body,tone[1]),xs=lower.map(q=>q[0]),mid=(Math.min(...xs)+Math.max(...xs))/2;if(lower.length>2)profile(lower.map(([x,y])=>[mid+(x-mid)*1.005,y]),p.width+.02,new THREE.Color().setHex(tone[0]));}
  for(const fender of p.fenders??[])profile(fender,p.width+.02,new THREE.Color().setHex(second));
  profile(p.glass,p.width+.02,new THREE.Color(.02,.025,.03));
  const tyre=new THREE.Color(.025,.025,.025),trim=new THREE.Color(.05,.05,.05),r=p.wheel,{tail,head}=p;
  for(const x of p.axles)for(const z of [-p.track,p.track])add(new THREE.CylinderGeometry(r,r,.26,8).rotateX(Math.PI/2).translate(x,r,z),tyre);
  for(const side of [-1,1]){add(new THREE.BoxGeometry(.05,tail.h,tail.w).translate(tail.x,tail.y,side*tail.z),new THREE.Color(.5,.02,.02));add(new THREE.BoxGeometry(.04,head.h,head.w).translate(head.x,head.y,side*head.z),new THREE.Color(.8,.78,.6));}
  for(const [x,y] of p.bumpers??[])add(new THREE.BoxGeometry(.06,.14,p.bumperWidth).translate(x,y,0),trim);
  const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
  // Clear-coated as the detailed paint (car-finish.js), so the highlight does not drop at the 40 m swap.
  this.materials.farCar??=finishMaterial(new THREE.MeshPhysicalMaterial({name:'Rival_distante',vertexColors:true,roughness:.4,metalness:.1,clearcoat:1}));
  const mesh=new THREE.Mesh(geometry,this.materials.farCar);mesh.name='Rival_distante';mesh.castShadow=mesh.receiveShadow=true;mesh.visible=false;return mesh;
 }
 // Swap detailed and distant rival models around the player.
 // Detailed car or light proxy by how big it looks: distance to the camera shortened by the lens
 // zoom (the broadcast camera's long lens), or to the player's car when no camera is known.
 // Three levels: the detailed car up to lod.near, the light one (car-lod.js) up to lod.far, then the proxy; 5% either
 // side of each swap, so a car holding its distance does not flicker between two.
 detailLevel(obj){const u=obj.userData;if(!u.far)return;const cam=this.viewCamera,{near,far}=this.lod;
  const d=cam?obj.position.distanceTo(cam.position)*Math.tan(cam.fov*Math.PI/360)/Math.tan(29*Math.PI/180):obj.position.distanceTo(this.carRoot.position);
  const level=d>far*(u.far.visible?.95:1.05)?2:u.mid&&d>near*(u.mid.visible?.95:1.05)?1:0;
  // The close model, hidden, leaves the scene graph: every frame three.js walks it all for the matrices, hidden or not, and
  // it is a hundred objects a car. The light ones stay (the reflection captures show the distant one: car-reflections.js).
  u.far.visible=level===2;u.detail.visible=level===0;if(u.mid)u.mid.visible=level===1;
  if(level===0&&u.detail.parent!==obj)obj.add(u.detail);else if(level!==0&&u.detail.parent===obj)obj.remove(u.detail);}
 // The Gráficos tab's Detalhe dos carros: where each level of detail takes over ({near, far} in metres).
 setCarDetail(lod){if(lod)this.lod={near:lod.near,far:lod.far};}
 // The light level of a rival (car-lod.js midLevel), its lamps and its numbers: shapes shared per model (key).
 addMid(root,{detail,wheels,radius,key,lamps}){
  const mid=midLevel({detail,root,keep:MID_KEEP,skip:MID_SKIP,wheels,radius,material:this.materials.farCar,cache:this.midShapes??=new Map(),key});
  // The numbers and stickers on the body (decals drawn over it) show on the light level too: meshes of its own over the
  // same shapes and materials (the close model keeps its own, where the rest of the game looks for them).
  root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert();
  detail.traverse(o=>{if(!o.isMesh||!(o.renderOrder>0)||!/^(Numero_|Raio_)/.test(o.name))return;const copy=new THREE.Mesh(o.geometry,o.material);
   Object.assign(copy,{name:'Rival_medio_'+o.name,renderOrder:o.renderOrder,receiveShadow:o.receiveShadow});copy.matrix.multiplyMatrices(inverse,o.matrixWorld).decompose(copy.position,copy.quaternion,copy.scale);mid.add(copy);});
  if(lamps)mid.add(lamps);root.add(mid);root.userData.mid=mid;
  // A close model out of the scene graph (detailLevel) is still found by name and walked, as when it was in.
  root.getObjectByName=function(name){return THREE.Object3D.prototype.getObjectByName.call(this,name)??(this.userData.detail&&!this.userData.detail.parent?this.userData.detail.getObjectByName(name):undefined);};
  root.traverse=function(callback){THREE.Object3D.prototype.traverse.call(this,callback);const d=this.userData.detail;if(d&&!d.parent)d.traverse(callback);};
  return mid;
 }
 // Modo Corrida's car selection (race-roster.js fieldRoster): while the player races the car `number`,
 // its place among the rivals' models is the Opala 99's, driven, in its own livery (built on first use,
 // from the template as loaded: main.js paints the player's car only after). '99' puts them all back
 // and hides it: the story's update() only shows or hides the cars in this.rivals. A new model (the
 // 99's other paint, main.js setLivery) builds it again. fusca: the Fusca's model when the race is in Fuscas
 // (the car screen's Fusca tab): the field is the Copa Fusca's (race-roster.js FUSCA_ROSTER), Cristiano Canto in
 // the 99 (fuscaRival), and `number` one of its cars.
 seatOpala99(template,number,fusca=null){
  this.rosterCars??=[...this.rivals];if(fusca&&!this.fuscaCars)this.buildFuscas(fusca);
  const field=fusca?this.fuscaCars:this.rosterCars;this.rivals.splice(0,this.rivals.length,...field);
  for(const o of [this.opala99,this.fusca99,...(this.fuscaCars??[])])if(o&&!field.includes(o))o.visible=false;
  const i=(fusca?FUSCA_ROSTER:RIVAL_ROSTER).findIndex(e=>e.number===number);if(i<0)return null;
  if(fusca){this.rivals[i]=this.fusca99;return this.fusca99;}
  if(this.opala99&&this.opala99Template!==template){this.opala99.removeFromParent();this.disposeCar(this.opala99,this.opala99Template);this.opala99=null;}
  if(!this.opala99){const e=OPALA_99_RIVAL;this.opala99=this.rivalCar(template,e.color,e.number,e.shortName,{driven:true,stripe:e.stripe,livery99:true});this.opala99.name='Opala_99_rival';this.opala99.userData.entry=e;this.opala99Template=template;this.root.add(this.opala99);}
  this.rivals[i]=this.opala99;return this.opala99;
 }
 // The field in Fuscas, built for the first Fusca race and kept: the Copa Fusca's 14 and the 99.
 buildFuscas(template){
  const build=e=>{const o=this.fuscaRival(template,e,e.shortName);o.userData.entry=e;o.visible=false;this.root.add(o);return o;};
  this.fuscaCars=FUSCA_ROSTER.map(build);this.fusca99=build(FUSCA_99_RIVAL);
 }
 // A rival in a Fusca (fusca.js): the team's colours as the player's Fusca wears them, the cabin without the
 // player's details (rivalCabin), its driver moved onto the Fusca's seat (the Fusca's own steering wheel hides behind his), and a distant model and brake
 // lights on both levels of detail as rivalCar gives an Opala.
 fuscaRival(template,entry,name=''){
  const car=rivalCabin(fuscaCar(template,entry)),root=new THREE.Group(),detail=new THREE.Group();root.name=car.name+'_rival';detail.name='Rival_detalhe';detail.add(car);root.add(detail);
  const own=car.getObjectByName('Volante_Fusca');if(own)own.visible=false;
  const driver=createRivalDriver({color:entry.color,number:entry.number});driver.root.position.add(new THREE.Vector3(...FUSCA_SEAT));detail.add(driver.root);
  const far=this.farProxy(entry.color,FUSCA_PROFILE,entry.stripe),lamps=createBrakeLights({far:FUSCA_PROFILE.lamps});far.add(lamps);root.add(far);
  const midLamps=createBrakeLights({far:FUSCA_PROFILE.lamps});root.userData.detail=detail;this.addMid(root,{detail,wheels:car.userData.wheels.map(obj=>({obj})),radius:FUSCA_PROFILE.wheel,key:`${template.uuid}|fusca`,lamps:midLamps});
  // Its headlamps, lit at night and in the rain (headlights.js; main.js updateLamps shows them).
  const heads=createHeadlights('fusca');root.add(heads);Object.assign(root.userData,{headlights:heads,lampSet:'fusca'});
  Object.assign(root.userData,{detail,far,driver,fusca:car,wheels:car.userData.wheels.map(obj=>({obj,base:obj.quaternion.clone()})),
   brake:v=>{car.userData.brake(v);lamps.userData.set(v);midLamps.userData.set(v);},nameLabel:name?this.tag(root,name,[0,2.2,0],2.7,.30,'#fff','#172a2ddb'):null});
  return root;
 }
 // Frees what rivalCar made for one car (merged bodywork, distant model, interior, driver, labels,
 // stickers), keeping what it shares: the template's geometries and materials and its number plates,
 // the cabin structure of the player's car, this.materials, the brake lights', the drivers' suits and
 // three.js's sprite quad.
 disposeCar(obj,template){
  if(obj.userData.detail&&!obj.userData.detail.parent)obj.add(obj.userData.detail);
  const keep=new Set(),hold=root=>root?.traverse(o=>{if(o.geometry)keep.add(o.geometry);for(const m of [o.material??[]].flat())keep.add(m);});
  hold(template);hold(this.carRoot.getObjectByName('Estrutura_cabine_V04'));
  for(const r of [...(this.plateShapes?.get(template)??[]),...Object.values(this.materials),...sharedBrakeLights(),...sharedHeadlights(),...sharedDriverMaterials(),...sharedLivery(),...sharedRims(),...sharedMidShapes(this.midShapes??new Map())])keep.add(r);
  obj.traverse(o=>{if(o.geometry&&!o.isSprite&&!keep.has(o.geometry))o.geometry.dispose();for(const m of [o.material??[]].flat())if(!keep.has(m)){if(m.map?.isCanvasTexture)m.map.dispose();m.dispose();}});
 }
 // driven: a rival out on track, with its driver (rival-driver.js) in the team's suit and helmet;
 // the cars parked at the garages before the race stand empty. color paints the body, stripe the
 // side stripe (race-roster.js), finish overrides the paint's metalness/roughness (gold). livery99: the
 // Opala 99 as loaded, its paint, sponsors and numbers (raced by Stevan Gaipo when the player takes
 // another car; color then only tints the distant model and the driver's suit).
 rivalCar(template,color,number,name='',{driven=false,stripe=0xe4e4d5,finish=null,livery99=false,dirt=false}={}){
  if(!template)return this.car(color,number);
  const root=template.clone(true),materials=new Map(),pivots=[],look=livery99?{tone:null,rim:null}:liveryLook(number);
  const structure=this.carRoot.getObjectByName('Estrutura_cabine_V04');if(structure)root.add(structure.clone(true));
  for(const name of HIDDEN_ON_RIVALS)root.getObjectByName(name)?.removeFromParent();shutOpenings(root);root.add(this.lightInterior({wheel:!driven}));
  const inside=[];root.traverse(o=>{if(o.isMesh&&o.userData.interno)inside.push(o);});inside.forEach(o=>o.removeFromParent());
  root.traverse(o=>{
   if(o.isMesh){
    const mats=Array.isArray(o.material)?o.material:[o.material];
    o.castShadow=mats.some(m=>!m.transparent||m.opacity>=.95);o.receiveShadow=true;
    // No sponsor, name or number of the 99 on the other cars: their own number replaces it.
    if(livery99)return;
    if(mats.some(m=>LIVERY_99.test(m.name))){o.visible=false;return;}
    const recolor=teamPaint(materials,{color,stripe,finish,dirt:dirt?rivalDirt(number):null,tone:look.tone});
    o.material=Array.isArray(o.material)?mats.map(recolor):recolor(o.material);
    // Its rims' faces (car-livery.js RIM_STYLES): under a wheel pivot only (the bonnet's hinges share the metal).
    if(look.rim&&o.material.name==='Aluminio_rodas'){let wheel=false;for(let q=o.parent;q&&!wheel;q=q.parent)wheel=q.name.startsWith('Roda_')&&q.name.includes('PIVO');if(wheel)o.material=rimMaterial(look.rim,o.material);}
   }
   if(!o.isMesh&&o.name.startsWith('Roda_')&&o.name.includes('PIVO'))pivots.push({obj:o,base:o.quaternion.clone()});
  });
  // Batch fixed bodywork by material; preserve separate wheel pivots for animation.
  root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),batches=new Map(),parts=[];
  root.traverse(o=>{if(!o.isMesh||!o.visible||Array.isArray(o.material)||o.children.length)return;let parent=o.parent;while(parent&&parent!==root){if(pivots.some(p=>p.obj===parent))return;parent=parent.parent;}parts.push(o);});
  for(const o of parts){let geometry=o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));geometry.deleteAttribute('tangent');if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));const key=o.material.uuid;if(!batches.has(key))batches.set(key,{material:o.material,geometries:[],objects:[]});const batch=batches.get(key);batch.geometries.push(geometry);batch.objects.push(o);}
  for(const batch of batches.values()){const geometry=mergeGeometries(batch.geometries,false);if(geometry){const mesh=new THREE.Mesh(geometry,batch.material);mesh.castShadow=!batch.material.transparent||batch.material.opacity>=.95;mesh.receiveShadow=true;root.add(mesh);batch.objects.forEach(o=>o.removeFromParent());}batch.geometries.forEach(g=>g.dispose());}
  // Level of detail: beyond ~40 m the car is one vertex-coloured mesh (one draw call).
  const detail=new THREE.Group();detail.name='Rival_detalhe';while(root.children.length)detail.add(root.children[0]);root.add(detail);
  if(driven){const driver=createRivalDriver({color,number});detail.add(driver.root);root.userData.driver=driver;}
  const far=this.farProxy(color,FAR_PROFILE,color,look.tone);root.add(far);root.userData.detail=detail;root.userData.far=far;
  // Brake lights on both levels of detail, lit while its driver brakes (userData.brake).
  const lamps=[createBrakeLights(),createBrakeLights({far:true}),createBrakeLights()];detail.add(lamps[0]);far.add(lamps[1]);root.userData.brake=v=>{for(const l of lamps)l.userData.set(v);};
  const mid=()=>this.addMid(root,{detail,wheels:pivots,radius:FAR_PROFILE.wheel,key:`${template.uuid}|${livery99?'99':'equipe'}`,lamps:lamps[2]});
  // Headlights on both levels (the auxiliary lamps where the template has them), lit at night and in the rain
  // (headlights.js; main.js updateLamps shows them while it races).
  const heads=createHeadlights(lampSetFor(template));root.add(heads);root.userData.headlights=heads;root.userData.lampSet=heads.userData.lampSet;
  const label=name?this.tag(root,name,[0,2.08,0],2.7,.30,'#fff','#172a2ddb'):null;
  // The rival's own number where the Opala 99 carries its 99 (those stickers are
  // hidden): big on both rear quarters and on the roof, small on the tail; one texture each.
  // The Opala 99 itself (livery99) keeps its own.
  // The spinning wheels' disc takes the rims' style (contact-shadows.js).
  root.userData.rimStyle=RIM_STYLES[look.rim]?.style??0;
  if(livery99){root.userData.wheels=pivots;root.userData.nameLabel=label;mid();return root;}
  // Its livery (car-livery.js): sponsors and stripes merged into the four number stickers, one material for the field.
  const plates=this.numberPlates(template,detail),livery=liveryPlates({number,stripe},plates,this.liveryShapes(template,detail));
  const material=livery?liveryMaterial():numberSticker(number);
  (livery?.plates??plates).forEach((g,i)=>{const decal=new THREE.Mesh(g,material);decal.name=PLATE_NAMES[i]+number;decal.renderOrder=2;detail.add(decal);});
  root.userData.wheels=pivots;root.userData.nameLabel=label;mid();return root;
 }
 // The tow strap: a flat ribbon along the 25 points of its path (immersive-state.js strapPath),
 // laid by layStrap; also the strap of multiplayer.js's tow trucks.
 strapMesh(){
  const geometry=new THREE.BufferGeometry(),index=[];geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(25*2*3),3));for(let i=0;i<24;i++)index.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);geometry.setIndex(index);
  const strap=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xe9b640,side:THREE.DoubleSide}));strap.frustumCulled=false;return strap;
 }
 // ground(x, y): the height under a point of the strap, which never goes below it.
 layStrap(mesh,points,ground){
  const a=mesh.geometry.attributes.position;
  points.forEach((p,i)=>{const next=points[Math.min(points.length-1,i+1)],previous=points[Math.max(0,i-1)],nx=-(next[2]-previous[2]),nz=next[0]-previous[0],n=Math.max(.001,Math.hypot(nx,nz));
   for(let side=0;side<2;side++)a.setXYZ(i*2+side,p[0]+nx/n*.035*(side*2-1),Math.max(p[1],ground(p[0],-p[2])+.025),p[2]+nz/n*.035*(side*2-1));});
  a.needsUpdate=true;
 }
 // A tow truck's amber light bar (truckModel): two quick flashes a second (now: seconds).
 flashBeacon(truck,now){const flash=(now*2)%1;truck.userData.beacon.material.emissiveIntensity=flash<.12||flash>.25&&flash<.37?7:.25;}
 // A model built here let go: its geometries, and the materials that are its own with their textures
 // (a truck's door signs; the shared materials, mat(), stay).
 disposeModel(root){const shared=new Set(Object.values(this.materials));root.traverse(o=>{if(!o.isMesh)return;o.geometry.dispose();if(!shared.has(o.material)){o.material.map?.dispose();o.material.dispose();}});}
 // Flatbed tow truck ("guincho plataforma"): white cab with an orange stripe, aluminium bed,
 // dual rear wheels and an amber light bar that flashes. It faces +x; the strap hooks at x -2.45.
 truckModel(){const root=new THREE.Group(),glass=new THREE.MeshStandardMaterial({color:0x0c1114,roughness:.08,metalness:.3});
  this.box(root,[-.1,.62,0],[5.3,.22,1.1],0x202326);
  this.box(root,[2.05,1.42,0],[1.7,1.25,2.08],0xe9e7e0);this.box(root,[2.05,1.02,0],[1.72,.16,2.1],0xe06a1f);this.box(root,[2.05,2.08,0],[1.55,.08,1.98],0xd8d6cf);
  const pane=(p,size)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size),glass);m.position.set(...p);root.add(m);};
  pane([2.91,1.72,0],[.04,.62,1.86]);for(const z of [-1,1])pane([2.25,1.74,z*1.045],[.95,.52,.02]);
  this.box(root,[2.95,.78,0],[.16,.26,2.12],0x2b2e31);this.box(root,[2.93,1.18,0],[.04,.3,1.1],0x1c1f22);
  for(const z of [-.78,.78]){const lamp=new THREE.Mesh(new THREE.BoxGeometry(.05,.16,.3),new THREE.MeshStandardMaterial({color:0xfff6dd,emissive:0xfff1c8,emissiveIntensity:1.2}));lamp.position.set(2.95,1.1,z);root.add(lamp);}
  this.box(root,[-.75,1.02,0],[3.5,.12,2.2],0xa3a9ad);for(const z of [-1.07,1.07])this.box(root,[-.75,1.14,z],[3.5,.12,.06],0x7e8488);
  this.box(root,[1.12,1.55,0],[.08,1.0,2.05],0x33373a);this.box(root,[-2.45,.78,0],[.28,.34,1.3],0xe0b33c);
  const beacon=new THREE.Mesh(new THREE.BoxGeometry(.24,.12,1.3),new THREE.MeshStandardMaterial({color:0xffa21a,emissive:0xff8c00,emissiveIntensity:.3,roughness:.3}));beacon.position.set(2.1,2.18,0);root.add(beacon);root.userData.beacon=beacon;
  for(const [x,z,wide] of [[2.3,-.95,0],[2.3,.95,0],[-1.35,-.82,1],[-1.35,.82,1]]){
   const w=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,wide?.52:.28,18).rotateX(Math.PI/2),this.mat(0x151719));w.position.set(x,.42,z);root.add(w);
   const hub=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.02,12).rotateX(Math.PI/2),this.mat(0x8b9094));hub.position.set(x,.42,z+Math.sign(z)*(wide?.27:.15));root.add(hub);
   this.box(root,[x,.9,z*1.03],[1.05,.06,wide?.62:.36],0x202326);
  }
  // The joke is painted on the doors, not floating over the truck.
  for(const side of [-1,1])this.banner(root,'REBOQUE · SEM PRESSA',new THREE.Vector3(2.05,1.42,side*1.05),side>0?0:Math.PI,1.45,.3,'#1d1d1d','#e9e7e0',512);
  root.traverse(o=>{if(o.isMesh)o.castShadow=true;});return root;}
 // Smoothed body roll and pitch from the rival's own cornering and braking.
 lean(obj,c){const u=obj.userData;u.roll=(u.roll??0)+(Math.max(-.03,Math.min(.03,(c.latAccel??0)*.0022))-(u.roll??0))*.15;u.pitch=(u.pitch??0)+(Math.max(-.025,Math.min(.015,(c.longAccel??0)*.002))-(u.pitch??0))*.15;obj.quaternion.multiply(leanRotation.setFromEuler(leanEuler.set(u.roll,0,u.pitch)));}
 // Rivals ride the same rigid body as the player: jumps, spins and rollovers show.
 setCarPose(obj,c){if(!c.pose){this.setPose(obj,{x:c.x,y:c.surface.z,z:-c.y,heading:c.heading,grade:c.surface.grade,bank:c.surface.bank});return;}const p=c.pose(this.renderAhead??0);obj.position.set(p.x,p.z,-p.y);poseForward.set(p.forward[0],p.forward[2],-p.forward[1]);poseUp.set(p.up[0],p.up[2],-p.up[1]);poseSide.crossVectors(poseForward,poseUp).normalize();obj.quaternion.setFromRotationMatrix(poseMatrix.makeBasis(poseForward,poseUp,poseSide));}
 setPose(obj,p){obj.position.set(p.x,p.y,p.z);const f=new THREE.Vector3(Math.cos(p.heading),p.grade||0,-Math.sin(p.heading)).normalize(),n=new THREE.Vector3(-(p.grade||0)*Math.cos(p.heading)+(p.bank||0)*Math.sin(p.heading),1,(p.grade||0)*Math.sin(p.heading)+(p.bank||0)*Math.cos(p.heading)).normalize(),side=new THREE.Vector3().crossVectors(f,n).normalize();n.crossVectors(side,f);obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f,n,side));}
 reset(){this.fans.forEach(f=>{f.cheerUntil=0;f.reaction.visible=false;f.dollar.visible=true;});this.followPosition=null;this.hero.rotation.y=this.heroYaw;this.hero.position.copy(this.heroStart);this.foot=footState(this.heroYaw,{floor:this.crowd.position.y+this.heroStart.y});this.leakCount=this.leakCursor=this.leakTimer=0;this.leak.geometry.setDrawRange(0,0);this.lastGlass=-1;this.ownOpenings?.closeAll(true);}
 // On foot in the paddock (on-foot.js), as in the pit stop's stroll: free to walk
 // anywhere, into Box 99 and the café too; ground is ImmersiveMode's footGround.
 // arms: what the hands hold (the café's snacks, pitstop.js snackArms).
 walk(input,dt,{shift=false,touch=false,ground=null,arms=null}={}){return stepOnFoot(this.foot,this.hero,input,dt,{shift,touch,ground,arms,origin:this.crowd.position});}
 // The rivals parked at their garages, the Opala in Box 99 and the supporters are
 // solid (world positions; a step away from a supporter is always allowed).
 blocked(pos,from=pos){
  const local=pos.clone().sub(this.crowd.position),back=from.clone().sub(this.crowd.position),q=this.lane.lane(local);
  if([...this.parked,...(this.ownSpot?[this.ownSpot]:[])].some(p=>Math.abs(q.x-p.x)<1.3&&Math.abs(q.d-p.d)<2.7))return true;
  return [...this.fans.map(f=>f.pos),...(this.leo?[this.leo.pos]:[])].some(p=>{const a=Math.hypot(local.x-p.x,local.z-p.z);return a<.55&&a<Math.hypot(back.x-p.x,back.z-p.z);});
 }
 // Input that walks toward a world heading: sideways to the camera on a desktop; on
 // touch screens the view turns toward it first, as the steering pad does.
 toward(heading,touch=false){
  const r=Math.atan2(Math.sin(heading-this.foot.yaw),Math.cos(heading-this.foot.yaw));
  if(touch)return {throttle:Math.abs(r)<.65?1:0,brake:0,left:r>.05?1:0,right:r<-.05?1:0};
  const f=Math.cos(r),l=Math.sin(r);return {throttle:Math.max(0,f),brake:Math.max(0,-f),left:Math.max(0,l),right:Math.max(0,-l)};
 }
 // The team's Opala in Box 99: close enough to get in (F), and where it stands (data
 // coordinates and heading) for the real car to take its place.
 nearCar(){return !!this.own&&this.hero.position.distanceTo(this.own.position)<3.4;}
 // What the action key does by the Opala in Box 99, from where the pilot stands (car-openings.js):
 // 'capo' ahead of the nose, 'porta_malas' behind the tail (engine, fuel cell), 'porta' to get in.
 carAction(){if(!this.own||this.inCar)return null;this.own.updateMatrixWorld();return carSpot(this.own.worldToLocal(this.hero.getWorldPosition(new THREE.Vector3())));}
 toggleOwnOpening(spot){return !!this.ownOpenings&&!!SPOT_OPENING[spot]&&this.carAction()===spot&&this.ownOpenings.toggle(SPOT_OPENING[spot]);}
 ownOpen(spot){return !!this.ownOpenings?.held(SPOT_OPENING[spot],'manual');}
 ownPose(){if(!this.own)return null;const p=this.own.getWorldPosition(new THREE.Vector3());return {x:p.x,y:-p.z,heading:this.own.rotation.y};}
 // Out of the car by the driver's door (the other side if a wall is in the way).
 leaveCar(ground){
  const c=this.ownPose();if(!c)return;const o=this.crowd.position;
  for(const side of [1,-1]){
   const p=new THREE.Vector3(c.x-Math.sin(c.heading)*1.55*side,0,-c.y-Math.cos(c.heading)*1.55*side),floor=ground?ground(p,this.foot.floor,p):this.foot.floor;if(floor===null)continue;
   this.hero.position.set(p.x-o.x,floor-o.y,p.z-o.z);this.foot.floor=floor;break;
  }
  this.foot.lift=this.foot.vz=0;this.foot.yaw=this.hero.rotation.y=c.heading;this.followPosition=null;
 }
 turnView(dx,dy){turnFootView(this.foot,dx,dy);}
 zoomView(k){zoomFootView(this.foot,k);}
 jump(){return footJump(this.foot);}
 crouch(){this.foot.crouch=!this.foot.crouch;}
 // Close enough to Leonardo for him to come over (and for the action key).
 nearLeo(radius=2.6){return !!this.leo&&!this.inCar&&this.hero.position.distanceTo(this.leo.pos)<radius;}
 // The way on foot to a local point (a tap on someone): the cars parked nose in at the garages fill
 // the working lane, so the pilot steps out toward the pit wall (first past the side of a car he
 // stands behind, as the Opala in Box 99), passes behind their tails and comes up to it. direct:
 // straight there whenever no car is in the way. Lane coordinates; blocked() keeps 1.3 m along and
 // 2.7 m across the lane round a parked car's centre (0.3 m more here).
 routeTo(to,{direct=false}={}){
  const L=this.lane,h=L.lane(this.hero.position),goal=L.lane(to),cars=[...this.parked,...(this.ownSpot?[this.ownSpot]:[])];
  // Whether the straight walk from a to b comes within reach of a car (slab test).
  const hits=(a,b)=>cars.some(p=>{let t0=0,t1=1;for(const [from,delta,half] of [[a.x-p.x,b.x-a.x,1.6],[a.d-p.d,b.d-a.d,3]]){if(Math.abs(delta)<1e-9){if(Math.abs(from)>=half)return false;continue;}const u=(-half-from)/delta,v=(half-from)/delta;t0=Math.max(t0,Math.min(u,v));t1=Math.min(t1,Math.max(u,v));}return t0<t1;});
  if((direct||Math.abs(goal.x-h.x)<2)&&!hits(h,goal))return [to.clone()];
  const clear=Math.max(L.bounds.d0+.6,Math.min(L.spotD,...this.parked.map(p=>p.d-2.7))-.8),step=Math.sign(goal.x-h.x)||1,behind=cars.find(p=>Math.abs(h.x-p.x)<1.6&&h.d>p.d);
  const at=(x,d)=>{const v=L.point(x,d);v.y=this.hero.position.y;return v;},route=[];
  let x=h.x+step;if(behind){x=behind.x+(Math.sign(h.x-behind.x)||step)*2.2;route.push(at(x,h.d));}else if(hits(h,{x,d:clear}))x=h.x;
  route.push(at(x,clear),at(goal.x,clear),to.clone());return route;
 }
 leoRoute(){return this.leo?this.routeTo(this.leo.pos):null;}
 nearestFan(){let best=-1,d=2.5;this.fans.forEach((f,i)=>{const distance=this.hero.position.distanceTo(f.pos);if(distance<d){best=i;d=distance;}});this.nearSocial=best;return best;}
 showDonation(index){const f=this.fans[index];if(f){f.cheerUntil=this.time+2.3;f.dollar.visible=false;f.reaction.visible=true;}}
 drawCracks(value){
  if(value===this.lastGlass)return;this.lastGlass=value;const ctx=this.crackCanvas.getContext('2d');ctx.clearRect(0,0,1024,512);
  let seed=99;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let hit=0;hit<Math.ceil(value*5);hit++){
   const x=150+rand()*720,y=90+rand()*300;ctx.strokeStyle='rgba(231,247,252,.88)';ctx.lineWidth=1.6;
   for(let ray=0;ray<12;ray++){const a=ray*Math.PI/6+rand()*.25,len=50+rand()*150;ctx.beginPath();ctx.moveTo(x,y);for(let k=1;k<=5;k++)ctx.lineTo(x+Math.cos(a)*len*k/5+(rand()-.5)*12,y+Math.sin(a)*len*k/5+(rand()-.5)*10);ctx.stroke();}
   for(let ring=1;ring<4;ring++){ctx.beginPath();for(let k=0;k<=12;k++){const a=k*Math.PI/6,r=ring*17+rand()*10;const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;k?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();}
  }
  if(value>=1){ctx.fillStyle='rgba(202,223,231,.22)';ctx.fillRect(0,0,1024,512);}
  // Keep the cracks below the opaque sun strip and the mirror housing.
  ctx.clearRect(0,0,1024,120);this.crackTexture.needsUpdate=true;
 }
 // focus: the car the cameras watch (main.js, recon lap), else the player's: name tags show round it.
 // A short field (solo practice, 1x1) races some of the cars: each rival drives its roster place's car.
 // Free racing shows the rivals only: the story's paddock (the vaquinha, Kléber's box, the people) leaves the scene graph
 // meanwhile, a thousand and more hidden objects three.js walked every frame for their matrices; the story brings it
 // back (update). A car that joins the field (seatOpala99, the Fuscas) comes back at once.
 park(on){
  // The holder is never in the scene; its people keep their idle crowds (pit-crew.js updatePeople: keepPeople).
  const holder=this.parking??=Object.assign(new THREE.Group(),{name:'Paddock_guardado'});holder.userData.keepPeople=true;
  if(!on){while(holder.children.length)this.root.add(holder.children[0]);return;}
  for(const child of [...holder.children])if(this.rivals.includes(child))this.root.add(child);
  for(const child of [...this.root.children])if(!this.rivals.includes(child)){child.visible=false;holder.add(child);}
 }
 // Everything back in the graph (the paddock, the close models out of it): before the circuit's disposal walks it.
 restoreGraph(){this.park(false);for(const o of new Set([...this.rivals,...(this.rosterCars??[]),...(this.fuscaCars??[]),this.opala99,this.fusca99]))if(o?.userData.detail&&!o.userData.detail.parent)o.add(o.userData.detail);}
 updateFree(rivals,dt){this.time+=dt;this.dress('proprio');this.leoDoor?.scale.setScalar(1);this.root.visible=true;this.damage.visible=false;this.carRoot.visible=true;this.park(true);for(const child of this.root.children)child.visible=this.rivals.includes(child);const focus=this.focus??this.carRoot.position,short=rivals.length<this.rivals.length;this.rivals.forEach((obj,i)=>{const r=short?rivals.find(r=>r.rosterIndex===i):rivals[i];if(!r){obj.visible=false;return;}const c=r.car;if(obj.userData.nameLabel)obj.userData.nameLabel.visible=Math.hypot(c.x-focus.x,c.y+focus.z)<45;this.setCarPose(obj,c);this.lean(obj,c);this.detailLevel(obj);obj.userData.brake?.(r.input?.brake??0);obj.userData.driver?.update(c,dt,obj.userData.detail.visible);if(obj.userData.detail?.visible!==false)for(const w of obj.userData.wheels||[])w.obj.quaternion.copy(w.base).multiply(wheelSpin.setFromAxisAngle(SPIN_AXIS,-c.spin));this.groundContact(obj,c);});}
 // Its contact shadow on both levels of detail, its wheels' blur close up (contact-shadows.js).
 groundContact(obj,c){carContact.car(obj,c,obj.userData.fusca?'fusca':'opala',obj.userData.detail?.visible?obj.userData.wheels:null);}
 update(state,car,dt,rivals,projectile,towOrigin){
  this.time+=dt;this.root.visible=this.damage.visible=state.active;if(!state.active)return;this.park(false);this.ownOpenings?.update(dt);
  // The pilot's clothes follow the story (story-career.js outfitOf); in Kléber's box the stage has its own
  // Stevan, so the paddock's waits out of sight (not while the opening shots play).
  this.dress(outfitOf(state.profile.career));this.storyScene?.update(dt);
  const cutscene=this.cutscene();if(cutscene&&this.hero.visible){this.hero.visible=false;this.heroCut=true;}else if(!cutscene&&this.heroCut){this.hero.visible=!this.inCar;this.heroCut=false;}showTrunkInside(this.own?.userData.trunkInside,this.ownOpenings);
  const staged=['crowd','podium'].includes(state.phase);this.stage.visible=state.phase==='podium';this.crowd.visible=state.phase==='crowd';this.podium.visible=state.phase==='podium';this.carRoot.visible=!staged||!!this.inCar;if(this.own)this.own.visible=!this.inCar;if(this.inCar)this.hero.visible=false;
  this.rivals.forEach((obj,i)=>{obj.visible=['starting','grid','race'].includes(state.phase);if(obj.visible){const c=rivals[i].car;if(obj.userData.nameLabel)obj.userData.nameLabel.visible=Math.hypot(c.x-this.carRoot.position.x,c.y+this.carRoot.position.z)<45;this.setCarPose(obj,c);this.lean(obj,c);this.detailLevel(obj);obj.userData.brake?.(state.phase==='race'?rivals[i].input?.brake??0:0);obj.userData.driver?.update(c,dt,obj.userData.detail.visible);if(obj.userData.detail?.visible!==false)for(const w of obj.userData.wheels||[])w.obj.quaternion.copy(w.base).multiply(wheelSpin.setFromAxisAngle(SPIN_AXIS,-rivals[i].progress/.31595));this.groundContact(obj,c);}});
  // The sign (seen through walls) fades out as the camera comes within a few metres of it.
  if(this.deskMarker){const m=this.deskMarker,show=state.phase==='crowd'&&!this.inCar&&!state.desk&&!cutscene,pulse=.5+.5*Math.sin(this.time*3.2);m.marker.visible=m.sign.visible=show;
   if(show){m.beam.material.opacity=.36+.24*pulse;m.ring.material.opacity=.7+.3*pulse;m.arrow.position.y=2.2+.1*Math.sin(this.time*2.4);m.arrow.rotation.y=this.time*1.6;
    const far=this.viewCamera?this.viewCamera.position.distanceTo(m.sign.getWorldPosition(this.signPosition??=new THREE.Vector3())):99;m.sign.material.opacity=THREE.MathUtils.clamp((far-5)/4,0,1);m.sign.visible=far>5;}}
  const selected=state.fan??this.nearSocial;this.socialMarker.visible=state.phase==='crowd'&&Number.isInteger(selected)&&!!this.fans[selected];if(this.socialMarker.visible){this.socialMarker.position.copy(this.fans[selected].pos).add(new THREE.Vector3(.4,2.85,0));this.socialMarker.rotation.y=this.time*1.5;}
  this.fans.forEach((f,i)=>{const laughing=this.time<f.cheerUntil||state.fan===i&&state.feedback.includes('risada'),pose=laughing?'cheer':f.idle;if(this.crowd.visible)f.idler.update(dt,pose,{calm:laughing||state.fan===i});f.person.rotation.z=laughing?Math.sin(this.time*9)*.08:0;f.dollar.visible=!state.donors.includes(i);f.reaction.visible=this.time<f.cheerUntil;f.reaction.position.y=3.15+Math.max(0,2.3-(f.cheerUntil-this.time))*.15;f.label.material.color.setHex(state.donors.includes(i)?0xc4eb93:0xffffff);});
  // Leonardo turns to the pilot as he comes near and keeps his cup; the pilot shows the one he took.
  if(this.leo){const l=this.leo,h=this.hero.position,target=!this.inCar&&h.distanceTo(l.pos)<6?Math.atan2(-(h.z-l.pos.z),h.x-l.pos.x):l.yaw;
   l.person.rotation.y+=Math.atan2(Math.sin(target-l.person.rotation.y),Math.cos(target-l.person.rotation.y))*Math.min(1,dt*4);
   if(this.crowd.visible)l.idler.update(dt,'stand',{calm:!!state.leo});l.cup.visible=true;}
  this.leoDoor?.scale.setScalar(state.phase==='crowd'?1e-4:1);
  // The café's sign shows the way while the pilot walks the paddock, fading as the camera comes near.
  if(this.cafe){const sign=this.cafe.sign,show=state.phase==='crowd'&&!this.inCar&&!state.cafe&&!this.nearCafe()&&!cutscene;sign.visible=show;
   if(show){const far=this.viewCamera?this.viewCamera.position.distanceTo(sign.getWorldPosition(this.signPosition??=new THREE.Vector3())):99;sign.material.opacity=THREE.MathUtils.clamp((far-5)/4,0,1);sign.visible=far>5;}}
  // The fuel cell only shows here once its mount gives way and it drags behind: fitted, it is the model's own, in the
  // trunk (car-livery.js trunkInside); this stand-in under the bumper read as a pale crate from the grid's low camera.
  this.tank.visible=!!state.tankDetached;
  this.tank.position.set(state.tankDetached?-2.22:-1.56,state.tankDetached?.06+Math.abs(Math.sin(this.time*29))*.025:.19,state.tankDetached?Math.sin(this.time*8)*.08:0);this.tank.rotation.set(state.tankDetached?.12:0,0,state.tankDetached?-.19:0);
  this.tankTethers.visible=state.tankDetached;const ta=this.tankTethers.geometry.attributes.position;for(let i=0;i<2;i++){ta.setXYZ(i*2,-1.6,.24,(i-.5)*.6);ta.setXYZ(i*2+1,this.tank.position.x+.24,this.tank.position.y,(i-.5)*.6);}ta.needsUpdate=true;
  this.drawCracks(state.glass);this.crackedGlass.visible=state.glass>0;
  if(state.tankDetached&&state.fuel>0&&!staged){this.leakTimer+=dt;if(this.leakTimer>.08){this.leakTimer=0;const x=car.x-Math.cos(car.heading)*2.3,y=car.y-Math.sin(car.heading)*2.3,p=car.sample(x,y);this.leak.geometry.attributes.position.setXYZ(this.leakCursor,x,p.z+.002,-y);this.leakCursor=(this.leakCursor+1)%240;this.leakCount=Math.min(240,this.leakCount+1);this.leak.geometry.attributes.position.needsUpdate=true;this.leak.geometry.setDrawRange(0,this.leakCount);}}
  this.leak.visible=!staged;this.debris.visible=!!projectile&&state.phase==='race';if(this.debris.visible){const t=projectile.age/projectile.duration;this.debris.position.lerpVectors(projectile.start,projectile.end,t);this.debris.position.y+=Math.sin(t*Math.PI)*.55;this.debris.rotation.set(this.time*12,this.time*9,0);}
  const towing=['tow','snag'].includes(state.phase);this.truck.visible=towing||state.phase==='broken';this.strap.visible=towing;
  if(this.truck.visible){const point=trackPoint(this.data,towOrigin+(state.towDistance||0)+9);this.setPose(this.truck,point);
   this.flashBeacon(this.truck,performance.now()/1000);if(towing){
   this.carRoot.updateWorldMatrix(true,false);this.truck.updateWorldMatrix(true,false);
   const start=new THREE.Vector3(2.22,.12,0).applyMatrix4(this.carRoot.matrixWorld),end=new THREE.Vector3(-2.45,.12,0).applyMatrix4(this.truck.matrixWorld);
   this.layStrap(this.strap,strapPath(start.toArray(),end.toArray(),5),(x,y)=>car.sample(x,y).z);this.strap.material.color.setHex(state.phase==='snag'?0xf34435:0xe9b640);
  }}
  this.judge.visible=state.phase==='inspection';this.closedPark.visible=this.pitSign.visible=state.phase==='inspection';if(this.judge.visible)this.judgeIdle.update(dt);
  // The first five applaud (or not) the pilot in sixth.
  if(state.phase==='podium')this.podiumIdlers?.forEach((idler,i)=>idler.update(dt,i%2?'folded':'stand'));
  if(this.judge.visible){const c=Math.cos(car.heading),s=Math.sin(car.heading),a=state.inspection*.65;this.judge.position.set(car.x+c*Math.cos(a)*2.7-s*2,car.surface.z,-car.y-s*Math.cos(a)*2.7-c*2);this.judge.rotation.y=car.heading;this.closedPark.position.set(car.x,car.surface.z+3.5,-car.y);const pit=trackPoint(this.data,45,11);this.pitSign.position.set(pit.x,pit.y+2,pit.z);}
  this.garageDoor.position.y=state.profile.released?4.2:1.3;this.blazer.position.x=state.profile.released?-3.9:-6.8;
  if(state.phase==='podium')this.podiumHero.userData.limbs?.forEach((limb,i)=>{if(i%2)limb.rotation.z=2.7+Math.sin(this.time*3)*.12;});
 }
 // Stevan dressed for the stage of the story he is at: on foot in the paddock, on the podium and at the wheel
 // (driver.js suit: only the loaned overalls differ from his own red ones).
 dress(kind){if(kind===this.outfit)return;this.outfit=kind;dressPerson(this.hero,STEVAN_OUTFITS[kind]);dressPerson(this.podiumHero,STEVAN_OUTFITS[kind]);this.driver?.suit?.(kind);}
 cutscene(){return !!this.storyScene?.active&&!document.body.classList.contains('cine-intro-on');}
 unshift(camera=this.cameraRef){if(this.viewShifted){camera?.clearViewOffset();this.viewShifted=false;}}
 restoreCamera(){this.unshift();if(this.cameraRef&&this.savedFov!==undefined){this.cameraRef.fov=this.savedFov;if(this.savedNear!==undefined)this.cameraRef.near=this.savedNear;this.cameraRef.updateProjectionMatrix();this.savedFov=this.savedNear=undefined;}}
 camera(camera,state,dt=1/60){
  // Kléber's box: the scene's own shots, after the opening shots (intro-cinematic.js) have played.
  if(state.active&&this.cutscene()){if(this.savedFov===undefined){this.savedFov=camera.fov;this.savedNear=camera.near;this.cameraRef=camera;}this.unshift(camera);camera.near=this.savedNear;this.followPosition=null;this.storyScene.camera(camera);return;}
  if(state.active&&['crowd','podium'].includes(state.phase)&&!this.inCar){if(this.savedFov===undefined){this.savedFov=camera.fov;this.savedNear=camera.near;this.cameraRef=camera;}camera.fov=58;camera.near=this.savedNear;camera.updateProjectionMatrix();if(state.phase==='crowd'){this.unshift(camera);
   // Third person behind the pilot, turned by the mouse (ImmersiveMode); the view widens
   // while he runs, and a wall between them brings the camera in front of it.
   // The lens zoom (wheel past the pilot's eyes) sets the field of view; running widens it only at the normal lens.
   const s=this.foot,lens=s.zoomFov??58;this.footFov=(this.footFov??58)+((s.running&&lens>=57?65:lens)-(this.footFov??58))*(1-Math.exp(-dt*8));camera.fov=this.footFov;
   // Right at the eyes the near plane comes in, so parts a few centimetres away are not clipped.
   camera.near=s.distance<.8?.03:this.savedNear;camera.updateProjectionMatrix();
   this.followPosition=placeFootCamera(camera,s,this.hero.getWorldPosition(new THREE.Vector3()),{layout:this.layout,obstacles:this.obstacles,ground:this.groundAt,dt,follow:this.followPosition,body:this.hero});}else{this.followPosition=null;this.podiumCamera(camera,dt);}}else{this.podiumView=null;this.restoreCamera();}}
 // Podium photo mode: it opens on the official framing, then drag (or touch) looks round,
 // the wheel zooms in to the drivers' faces and W A S D / arrows walk the camera round the stage.
 // It turns round the middle of the steps; a lens shift keeps them clear of the panel on the right.
 podiumCamera(camera,dt){
  this.podiumControls();
  const zs=this.podiumSlots.map(slot=>slot.z),middle=(Math.min(...zs)+Math.max(...zs))/2;
  if(!this.podiumView)this.podiumView={yaw:0,pitch:Math.asin(5.7/Math.hypot(22,5.7)),distance:Math.hypot(22,5.7),target:new THREE.Vector3(-2,1.9,middle)};
  const panel=document.getElementById('immersivePanel'),shift=panel&&!panel.classList.contains('hidden')?panel.getBoundingClientRect().width/2:0;
  if(shift){camera.setViewOffset(innerWidth,innerHeight,shift,0,innerWidth,innerHeight);this.viewShifted=true;}else this.unshift(camera);
  const v=this.podiumView,k=this.podiumKeys,step=Math.min(dt,.1)*Math.max(2.5,v.distance*.35);
  const ahead=(k.has('KeyW')||k.has('ArrowUp')?1:0)-(k.has('KeyS')||k.has('ArrowDown')?1:0),aside=(k.has('KeyD')||k.has('ArrowRight')?1:0)-(k.has('KeyA')||k.has('ArrowLeft')?1:0);
  // Forward is away from the camera, along the ground.
  v.target.x+=(-Math.cos(v.yaw)*ahead-Math.sin(v.yaw)*aside)*step;v.target.z+=(Math.sin(v.yaw)*ahead-Math.cos(v.yaw)*aside)*step;
  v.target.x=Math.max(-14,Math.min(14,v.target.x));v.target.z=Math.max(-12,Math.min(12,v.target.z));
  const c=Math.cos(v.pitch);camera.fov=46;camera.updateProjectionMatrix();
  camera.position.copy(this.stage.position).add(v.target).add(new THREE.Vector3(Math.cos(v.yaw)*c*v.distance,Math.sin(v.pitch)*v.distance,-Math.sin(v.yaw)*c*v.distance));
  camera.position.y=Math.max(camera.position.y,this.stage.position.y+.35);
  camera.up.copy(up);camera.lookAt(this.stage.position.clone().add(v.target));
 }
 // The podium's dressing, fixed in the scene (sprites turned with the camera): the banner over
 // the steps between two gilt poles, the joke's ribbon over the sixth step and the
 // workshop's sign on its roof. Art in pit-textures.js; +x faces the photo camera.
 podiumDressing(){
  const g=this.podium,gilt=new THREE.MeshStandardMaterial({color:0xd8b24a,metalness:.85,roughness:.28});
  const board=(map,w,h,x,y,z,backColor)=>{const front=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map,roughness:.78}));front.position.set(x,y,z);front.rotation.y=Math.PI/2;front.castShadow=true;
   const back=new THREE.Mesh(new THREE.PlaneGeometry(w,h),this.mat(backColor));back.position.set(x-.012,y,z);back.rotation.y=-Math.PI/2;g.add(front,back);return front;};
  const x=-3.45,z0=-7.75,z1=10.55,top=6.15;
  for(const z of [z0,z1]){const pole=new THREE.Mesh(new THREE.CylinderGeometry(.055,.08,top+.2,14),gilt);pole.position.set(x,(top+.2)/2,z);pole.castShadow=true;const knob=new THREE.Mesh(new THREE.SphereGeometry(.12,14,10),gilt);knob.position.set(x,top+.3,z);g.add(pole,knob);}
  const bar=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,z1-z0,10),gilt);bar.rotation.x=Math.PI/2;bar.position.set(x+.03,top+.02,(z0+z1)/2);g.add(bar);
  board(podiumBanner('AUTO-POBRE RACING','STEVAN GAIPO · TODO MUNDO TEM UMA CONTA PRA PAGAR'),z1-z0-.35,1.85,x+.05,top-.95,(z0+z1)/2,0x5e0d12).name='Faixa_podio';
  // The ribbon hangs on two cords from the banner's hem, right over the sixth step.
  const rz=this.podiumSlots[5].z;board(podiumRibbon('A FOTO É SEMPRE EM SEXTO.'),4.2,.52,x+.08,3.78,rz,0xc98f1c).name='Faixa_sexto';
  for(const dz of [-1.9,1.9]){const cord=new THREE.Mesh(new THREE.CylinderGeometry(.01,.01,.2,5),gilt);cord.position.set(x+.08,4.14,rz+dz);g.add(cord);}
  board(signBoard('OFICINA','BLAZER NO CONSERTO','#213c47','#f7d99b',{h:224}),3.6,.8,-4.3,3.58,-5,0x213c47).name='Placa_oficina';
 }
 // Places 1-5 go to the first five rivals of the classification (the pilot always stands sixth:
 // the joke), in their team colours, each with a plate at the foot of the step: place and name.
 dressPodium(order,pilot){
  const entries=(order?.length?order:RIVAL_ROSTER).slice(0,5),key=entries.map(e=>e.number).join(',')+'|'+pilot;
  if(key===this.podiumKey)return;this.podiumKey=key;
  for(const h of this.podiumRivals){h.removeFromParent();h.traverse(o=>{if(o.isMesh)o.geometry.dispose();});}
  for(const plate of this.podiumPlates){plate.removeFromParent();plate.geometry.dispose();plate.material.map.dispose();plate.material.dispose();}
  this.podiumRivals=[];this.podiumPlates=[];this.podiumIdlers=[];
  const skins=[0xc68e6a,0x8d5a3b,0xe0b08f,0x6b4128,0xb77a55];
  this.podiumSlots.forEach(({height,z},i)=>{
   if(i<5){const color=entries[i].color,h=this.people.person({top:color,bottom:0x2d3338,trim:0xf4f1ea,hat:'cap',hatColor:color,skin:skins[i]});setPose(h,POSES[i%2?'folded':'stand']);h.position.set(-2,height,z);this.podium.add(h);this.podiumRivals.push(h);this.podiumIdlers.push(new Idler(h,'podium',{seed:.3+i*.19}));}
   const name=i<5?entries[i].shortName:(pilot||'Stevan Gaipo');
   // The plate is fixed on the step's front (and its back, for the free camera behind).
   const ph=Math.min(.56,height*.72),map=podiumPlate(i+1,name,{color:i<5?entries[i].color:0xd82125,hero:i===5,w:2.2,h:ph}),material=new THREE.MeshStandardMaterial({map,roughness:.42,metalness:.35});
   for(const side of [1,-1]){const plate=new THREE.Mesh(new THREE.PlaneGeometry(2.2,ph),material);plate.position.set(-2+side*1.006,height-ph/2-.06,z);plate.rotation.y=side*Math.PI/2;plate.name='Placa_podio_'+(i+1);this.podium.add(plate);this.podiumPlates.push(plate);}
  });
 }
 podiumControls(){
  if(this.podiumKeys||typeof document==='undefined')return;
  const keys=this.podiumKeys=new Set(),view=document.getElementById('view'),active=()=>!!this.podiumView&&this.podium.visible,moves=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
  document.addEventListener('keydown',e=>{if(active()&&moves.includes(e.code))keys.add(e.code);});
  document.addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
  view?.addEventListener('pointerdown',e=>{if(active())this.podiumDrag={id:e.pointerId,x:e.clientX,y:e.clientY};});
  view?.addEventListener('pointermove',e=>{const d=this.podiumDrag;if(!d||d.id!==e.pointerId||!active()||document.pointerLockElement===view)return;const v=this.podiumView;
   v.yaw-=(e.clientX-d.x)*.005;v.pitch=Math.max(-.12,Math.min(1.35,v.pitch+(e.clientY-d.y)*.004));d.x=e.clientX;d.y=e.clientY;});
  addEventListener('pointerup',e=>{if(this.podiumDrag?.id===e.pointerId)this.podiumDrag=null;});
  document.addEventListener('mousemove',e=>{if(!active()||document.pointerLockElement!==view)return;const v=this.podiumView;v.yaw-=e.movementX*.0032;v.pitch=Math.max(-.12,Math.min(1.35,v.pitch+e.movementY*.0028));});
  view?.addEventListener('wheel',e=>{if(active())this.podiumView.distance=Math.max(1.2,Math.min(45,this.podiumView.distance*(e.deltaY>0?1.15:1/1.15)));},{passive:true});
 }
}
// rivalCar and its helpers (light interior, number plates, distant model) without a circuit: the car
// screen's studio (car-select.js). carRoot lends the cabin structure, as on track.
export function carWorkshop(carRoot){return Object.assign(Object.create(ImmersiveVisuals.prototype),{carRoot,materials:{}});}
