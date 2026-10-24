import * as THREE from 'three';
import {clamp} from './physics.js';
import {AUTOMETER,autoMeterFace,shiftSetLabel,SWITCH_BANK,switchPanelTexture,luizaoFaces,drawSegments} from './cockpit-materials.js';

// Needle rotation for a face drawn by autoMeterFace (clockwise on the dial).
export const needleAngle=(kind,value)=>{const s=AUTOMETER[kind];return -(s.start+s.sweep*clamp((value-s.min)/(s.max-s.min),0,1))*Math.PI/180;};

// Carbon instrument plate traced on carro_27 (3386 px/m, the 5" tachometer bezel
// is 127 mm): metres from the tachometer centre, +x toward the passenger.
function podShape(){
 const s=new THREE.Shape();
 s.moveTo(-.062,-.106);s.lineTo(.068,-.106);s.lineTo(.088,-.145);s.quadraticCurveTo(.098,-.17,.125,-.17);s.lineTo(.14,-.17);
 s.quadraticCurveTo(.179,-.17,.179,-.131);s.lineTo(.179,-.095);s.quadraticCurveTo(.179,-.078,.157,-.066);
 s.lineTo(.112,.012);s.quadraticCurveTo(.098,.034,.072,.046);
 s.absarc(0,0,.0705,.70,2.44,false);s.lineTo(-.075,.040);s.lineTo(-.128,.012);s.quadraticCurveTo(-.148,-.004,-.16,-.03);s.lineTo(-.182,-.074);
 s.absarc(-.1412,-.1004,.0487,2.57,5.58,false);s.closePath();
 return s;
}
// Gauge positions and bezel radii on the plate (same photo).
const GAUGES=Object.freeze({tach:[0,0,.0635,.0532],fuel:[-.1007,-.0343,.0372,.0298],water:[-.1412,-.1004,.0377,.0302],oil:[.1022,-.0343,.038,.0305]});

export function buildPod(kit,position,tilt){
 const {mesh,box,m,panel,bezel}=kit;
 const pod=panel(position,undefined,tilt);pod.name='Painel_Auto_Meter';
 mesh(new THREE.ExtrudeGeometry(podShape(),{depth:.004,bevelEnabled:true,bevelThickness:.0012,bevelSize:.0015,bevelSegments:2,curveSegments:24}),m.twill,[0,0,0],pod);
 box([.003,-.109,-.004],[.13,.008,.006],m.anodized,pod); // bottom mounting strip
 for(const x of [-.05,.06])box([x,-.07,-.05],[.012,.025,.10],m.anodized,pod); // brackets to the dash bar
 const needleMaterial=new THREE.MeshBasicMaterial({color:0xf0182a});
 const needles={};
 for(const [kind,[x,y,rb,rf]] of Object.entries(GAUGES)){
  const g=new THREE.Group();g.position.set(x,y,.004);pod.add(g);
  const depth=kind==='tach'?.013:.009;
  mesh(new THREE.CylinderGeometry(rf*1.02,rf*1.02,.025,32).rotateX(Math.PI/2),m.shell,[0,0,-.0125],g); // case behind the plate
  // Outer edge first, so the lathe's faces point at the driver (inner-first faces the plate and is culled).
  const profile=[[rb*1.01,0],[rb,depth-.002],[rb*.97,depth],[rf,depth],[rf*.985,depth-.003]].map(([a,b])=>new THREE.Vector2(a,b));
  mesh(new THREE.LatheGeometry(profile,64).rotateX(Math.PI/2),bezel,[0,0,0],g);
  mesh(new THREE.CircleGeometry(rf,64),new THREE.MeshBasicMaterial({map:autoMeterFace(kind,kind==='tach'?1024:512)}),[0,0,depth-.006],g);
  const needle=new THREE.Group();needle.position.z=depth-.0045;g.add(needle);
  const blade=new THREE.Shape();blade.moveTo(-rf*.2,-rf*.028);blade.lineTo(rf*.86,-rf*.01);blade.lineTo(rf*.9,0);blade.lineTo(rf*.86,rf*.01);blade.lineTo(-rf*.2,rf*.028);blade.closePath();
  mesh(new THREE.ShapeGeometry(blade),needleMaterial,[0,0,0],needle);
  mesh(new THREE.CircleGeometry(rf*(kind==='tach'?.1:.13),24),needleMaterial,[0,0,.0004],needle);
  mesh(new THREE.CircleGeometry(rf,48),m.glass,[0,0,depth-.0015],g);
  needles[kind]=needle;
 }
 // Warning lamps under the tachometer: amber and red domes.
 const lamps=[[-.0251,0xd9730f],[.0251,0x8e0f14]].map(([x,color])=>{
  mesh(new THREE.TorusGeometry(.0128,.0016,8,32),kit.chrome,[x,-.0791,.006],pod);
  return mesh(new THREE.SphereGeometry(.0118,24,12,0,Math.PI*2,0,Math.PI/2).rotateX(Math.PI/2).scale(1,1,.65),new THREE.MeshPhysicalMaterial({color,roughness:.15,transmission:0,clearcoat:1,emissive:color,emissiveIntensity:.08}),[x,-.0791,.008],pod);
 });
 // Shift light: black tube on the plate edge, amber lens toward the driver.
 const shift=new THREE.Group();shift.position.set(.0886,.0245,.004);shift.rotation.set(.1,-.1,0);pod.add(shift);
 const tube=new THREE.CylinderGeometry(.019,.019,.05,32,1,true).rotateX(Math.PI/2);mesh(tube,m.plastic,[0,0,.019],shift);
 mesh(new THREE.CircleGeometry(.019,32).rotateY(Math.PI),m.plastic,[0,0,-.006],shift);
 const shiftLight=mesh(new THREE.CircleGeometry(.0175,32),new THREE.MeshPhysicalMaterial({color:0xc8641a,roughness:.1,clearcoat:1,emissive:0xff8a1a,emissiveIntensity:.25}),[0,0,.033],shift);
 // Push-to-display / shift-set control pod sitting on the tachometer glass.
 const control=new THREE.Group();control.position.set(.026,.029,.018);control.rotation.z=-.52;pod.add(control);
 const pad=new THREE.Shape(),w=.024,h=.016,r=.005;pad.moveTo(-w+r,-h);pad.lineTo(w-r,-h);pad.quadraticCurveTo(w,-h,w,-h+r);pad.lineTo(w,h-r);pad.quadraticCurveTo(w,h,w-r,h);pad.lineTo(-w+r,h);pad.quadraticCurveTo(-w,h,-w,h-r);pad.lineTo(-w,-h+r);pad.quadraticCurveTo(-w,-h,-w+r,-h);
 mesh(new THREE.ExtrudeGeometry(pad,{depth:.007,bevelEnabled:true,bevelThickness:.0015,bevelSize:.0015,bevelSegments:2}),m.shell,[0,0,-.004],control);
 const label=mesh(new THREE.PlaneGeometry(.046,.030),new THREE.MeshBasicMaterial({map:shiftSetLabel()}),[0,0,.0046],control);label.castShadow=false;
 mesh(new THREE.CylinderGeometry(.0028,.0032,.004,16).rotateX(Math.PI/2),kit.red,[-.0105,.0085,.0062],control);
 mesh(new THREE.CylinderGeometry(.0048,.0048,.0012,20).rotateX(Math.PI/2),new THREE.MeshBasicMaterial({color:0x020202}),[.0105,.0085,.0048],control);
 mesh(new THREE.CylinderGeometry(.0048,.0052,.009,20).rotateX(Math.PI/2),m.shell,[.013,-.008,.009],control);
 return {pod,needles,shiftLight,lamps};
}

// Overhead switch bank hung from the windscreen cage tube (photo 31).
// Racing state: ignition, fuel pump, DH and lights on; wipers and headlights off.
// The levers are groups named Interruptor_<label> (rotation.x SWITCH_TILT on, -SWITCH_TILT
// off) and the start button's dome Botao_PART, so the story mode's engine start moves them.
const SWITCH_ON=Object.freeze({IGN:true,BC1:true,DH:true,LAN:true,LIMP:false,FAROL:false});
export const SWITCH_TILT=-.42;
export function buildSwitchBank(kit,position,tilt,hanger){
 const {mesh,box,bar,m,panel,chrome}=kit;
 const bank=panel(position,kit.root,tilt);bank.name='Painel_botoes_Luizao';
 const acrylic=new THREE.MeshPhysicalMaterial({color:0x0e1011,roughness:.12,clearcoat:1,clearcoatRoughness:.04,envMapIntensity:1.2});
 box([0,0,0],[.22,.062,.005],acrylic,bank);
 const face=mesh(new THREE.PlaneGeometry(.22,.062),luizaoFaces(new THREE.MeshPhysicalMaterial({roughness:.14,clearcoat:1,clearcoatRoughness:.04,envMapIntensity:1.2,polygonOffset:true,polygonOffsetFactor:-2}),switchPanelTexture),[0,0,.0026],bank);face.castShadow=false;
 for(const [x,y] of [[-.104,.0262],[.104,.0245],[-.103,-.0246],[.105,-.025]])mesh(new THREE.CylinderGeometry(.0028,.0028,.0018,16).rotateX(Math.PI/2),chrome,[x,y,.0033],bank);
 for(const [label,x] of SWITCH_BANK){
  if(label==='PART'){
   mesh(new THREE.CylinderGeometry(.0125,.0125,.004,32).rotateX(Math.PI/2),m.plastic,[x,-.0005,.0045],bank);
   const dome=new THREE.Group();dome.name='Botao_PART';dome.position.set(x,-.0005,.0065);bank.add(dome);
   mesh(new THREE.SphereGeometry(.0092,24,12,0,Math.PI*2,0,Math.PI/2).rotateX(Math.PI/2).scale(1,1,.5),m.shell,[0,0,0],dome);
   continue;
  }
  mesh(new THREE.CylinderGeometry(.0072,.0072,.0028,6).rotateX(Math.PI/2),chrome,[x,-.0015,.004],bank); // hex nut
  mesh(new THREE.CylinderGeometry(.0042,.0042,.0045,16).rotateX(Math.PI/2),chrome,[x,-.0015,.0065],bank);
  const bat=new THREE.Group();bat.name='Interruptor_'+label;bat.position.set(x,-.0015,.008);bat.rotation.x=SWITCH_ON[label]?SWITCH_TILT:-SWITCH_TILT;bank.add(bat);
  mesh(new THREE.CylinderGeometry(.0019,.0026,.017,12).rotateX(Math.PI/2),chrome,[0,0,.0085],bat);
  mesh(new THREE.SphereGeometry(.0028,12,8),chrome,[0,0,.017],bat);
 }
 // Two flat brackets up to the tube.
 bank.updateWorldMatrix(true,false);
 for(const x of [-.097,.097]){
  const top=hanger.clone();top.z+=x;const foot=bank.localToWorld(new THREE.Vector3(x,.022,-.004)),tab=new THREE.Group();
  tab.position.copy(foot).add(top).multiplyScalar(.5);tab.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),top.clone().sub(foot).normalize());kit.root.add(tab);
  box([0,0,0],[.003,foot.distanceTo(top),.02],m.anodized,tab);
  for(const s of [-1,1])mesh(new THREE.CylinderGeometry(.009,.009,.0015,20).rotateZ(Math.PI/2),chrome,[s*.0025,foot.distanceTo(top)/2-.008,0],tab);
 }
 return bank;
}

// Small dash-top readout (photo 25): black box with a red seven-segment window.
export function buildSpeedDisplay(kit,position,tilt){
 const {mesh,box,m,panel}=kit;
 const display=panel(position,undefined,tilt);display.name='Display_dash';
 box([0,0,-.012],[.082,.055,.034],m.shell,display);
 mesh(new THREE.PlaneGeometry(.062,.03),new THREE.MeshBasicMaterial({color:0x050505}),[0,.004,.0052],display);
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;const ctx=canvas.getContext('2d');
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
 mesh(new THREE.PlaneGeometry(.058,.026),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}),[0,.004,.0056],display);
 mesh(new THREE.PlaneGeometry(.062,.03),m.glass,[0,.004,.0062],display);
 for(const x of [-.025,-.012])mesh(new THREE.CylinderGeometry(.0024,.0024,.003,12).rotateX(Math.PI/2),m.plastic,[x,-.019,.0055],display);
 mesh(new THREE.PlaneGeometry(.03,.006),new THREE.MeshBasicMaterial({color:0xd8262c}),[.018,.0235,.0052],display);
 let shown=-1;
 return {display,draw(speed){
  if(speed===shown)return;shown=speed;
  ctx.fillStyle='#140403';ctx.fillRect(0,0,256,128);
  drawSegments(ctx,String(speed).padStart(3,'0'),38,18,86,'#ff3a2c','rgba(255,58,44,.08)');
  texture.needsUpdate=true;
 },get speed(){return shown;}};
}
