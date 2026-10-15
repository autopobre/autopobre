import * as THREE from 'three';
import {EFFECT_LIGHT} from './weather.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {mergeStill} from './car-lod.js';
import {steeringWheelAngle} from './driver-rig.js';
import {GATE} from './driver-controls.js';
import {clamp} from './physics.js';
import {createFamilyPhone} from './family-phone.js';
import {createInteriorMaterials,boxUV,tubeUV,logoTexture,canvasTexture} from './cockpit-materials.js';
import {buildPod,buildSwitchBank,buildSpeedDisplay,needleAngle} from './cockpit-instruments.js';
import {buildRearCabin} from './cockpit-rear.js';
import {buildPassengerSide,buildKeyPanel,buildWindscreenNumber,buildDriverFootwell} from './cockpit-equipment.js';

// Lever length (m) and lever/pedal travel (rad) for the controls the driver works.
const SHIFT_LEVER=.255,SHIFT_THROW=.2,SHIFT_LANE=.15,SHIFT_LEAN=.1;
const PEDAL_TRAVEL=Object.freeze({clutch:.22,brake:.11,throttle:.16});
// The V06 windscreen as modelo_3d/scripts/v06_vidros.py bends it to the roof and the cowl (its build prints this as
// V06_GLASS and fails when this copy differs): a point moves by (1-t)*foot(y)*fade(y)+t*top(y), t its place between
// the old flat pane's foot (0) and top (1) along the slope. Blender car frame (x forward, y driver side, z up); each
// edge holds the x and z coefficients of y^0, y^2, y^4, y^6 and the |y| they hold to; the foot's move fades out between
// the two |y| of taper (the corners keep their height clear of the doors).
const V06_GLASS=Object.freeze({"c":[0.6892,0.0,1.07927],"up":[-0.81756,0.0,0.57585],"a0":-0.30456,"a1":0.28032,"foot":[[0.003186,0.010416,-0.021013,0.023056],[0.001847,-0.042119,0.001898,-0.002116],0.737],"top":[[0.009597,0.0,-0.0,0.0],[0.037092,-0.105842,0.003534,-0.008165],0.578],"taper":[0.6,0.72]});
// How far a point of the cabin near the windscreen moves with the bent glass: three.js car frame in, [dx, dy] out.
function glassLift(x,y,z){
 const g=V06_GLASS,by=-z,s=(x-g.c[0])*g.up[0]+(by-g.c[1])*g.up[1]+(y-g.c[2])*g.up[2],t=clamp((s-g.a0)/(g.a1-g.a0),0,1);
 const edge=([cx,cz,lim])=>{const q=clamp(by,-lim,lim)**2;let px=0,pz=0,k=1;for(let i=0;i<4;i++){px+=cx[i]*k;pz+=cz[i]*k;k*=q;}return [px,pz];};
 // the foot's move fades out toward the corners (taper: |y| where it starts fading and where it is gone)
 const q=clamp((Math.abs(by)-g.taper[0])/(g.taper[1]-g.taper[0]),0,1),fade=1-q*q*(3-2*q);
 const f=edge(g.foot),u=edge(g.top);return [(1-t)*f[0]*fade+t*u[0],(1-t)*f[1]*fade+t*u[1]];
}
// Photos in carro/ the interior is built from: the onboard view, the driver, and the
// walk-round of the cabin (instruments, switches, pedals, fittings and the rear).
export const INTERIOR_REFERENCES=Object.freeze(['carro_14_interna.JPG','carro_8_piloto_dentro_edu_neves.jpg',
 ...['24_interior_volante_marcadores','25_painel_marcadores','26_interior_painel_muito_perto','27interior_painel_frente_perto','28_interior_chave_no_lugar_do_freio_de_mao',
 '29_interior_pedais','30_interior_pes_do_carona_com_fusiveis','31_botoes_topo_piloto','32_interno_volante_detalhes_meio','33_interno_cambio','34_interno_banco_de_tras',
 '35_interno_protetor_auditivo_e_radio_banco_carona','36_interno_banco_traseiro_armacao_ferro'].map(n=>`carro_${n}.JPG`)]);

// +X forward, +Y up, -Z driver's side. Instruments, switches and fittings are sized
// from the photos (the 127 mm tachometer sets the scale); the shell is a reconstruction.
export function createCockpit(renderer){
 const root=new THREE.Group();root.name='Interior_Opala_99';root.visible=false;
 const m=createInteriorMaterials(renderer);
 const silver=new THREE.MeshStandardMaterial({color:0xa9adb0,metalness:.85,roughness:.3});
 const chrome=new THREE.MeshStandardMaterial({color:0xe2e5e8,metalness:1,roughness:.12,envMapIntensity:1});
 const steel=new THREE.MeshStandardMaterial({color:0x343a3d,metalness:.65,roughness:.47,envMapIntensity:.5});
 const red=new THREE.MeshStandardMaterial({color:0x990f16,roughness:.6});
 const yellow=new THREE.MeshStandardMaterial({color:0xffd400,roughness:.6,emissive:0xffd400,emissiveIntensity:.12});
 // Satin silver bezels: bright even against the dark cabin they reflect.
 const bezel=new THREE.MeshStandardMaterial({color:0xd2cec6,metalness:.45,roughness:.3,envMapIntensity:1.1,emissive:0x3c3a36});
 const paintBoth=m.paint.clone();paintBoth.side=THREE.DoubleSide;
 const paintSatin=m.paint.clone();Object.assign(paintSatin,{roughness:.5,clearcoat:.3,clearcoatRoughness:.4});
 // Everything opaque in the cabin throws a shadow: sunlight enters through the glass only.
 function mesh(g,material,p,parent=root){const o=new THREE.Mesh(g,material);o.position.set(...p);parent.add(o);o.receiveShadow=true;o.castShadow=!material.transparent;return o;}
 const box=(p,s,material=m.plastic,parent=root)=>mesh(boxUV(new THREE.BoxGeometry(...s)),material,p,parent);
 function bar(a,b,r=.023,material=m.cage,parent=root){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),length=av.distanceTo(bv),o=mesh(tubeUV(new THREE.CylinderGeometry(r,r,length,12),r,length),material,av.clone().add(bv).multiplyScalar(.5).toArray(),parent);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bv.sub(av).normalize());return o;}
 // Foam roll-cage padding over part of a tube, as fitted near the helmet.
 const padding=(a,b,from,to,r=.043,parent=root)=>{const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b);return bar(av.clone().lerp(bv,from).toArray(),av.clone().lerp(bv,to).toArray(),r,m.foam,parent);};
 // A part facing the driver: local +X runs toward the passenger, +Z toward the seat;
 // tilt leans its top toward the seat (positive) or the windscreen (negative).
 function panel(p,parent=root,tilt=0){const g=new THREE.Group();g.position.set(...p);g.rotation.order='YXZ';g.rotation.set(tilt,-Math.PI/2,0);parent.add(g);return g;}
 function decal(texture,p,w,h,parent,opts={}){const o=mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:texture,roughness:.55,transparent:!!opts.transparent,alphaTest:opts.transparent?.02:0,envMapIntensity:.3,polygonOffset:true,polygonOffsetFactor:-2}),p,parent);o.castShadow=false;return o;}
 // Padded shape: rounded rectangle extruded with a soft bevel, centred on its depth.
 // Extrusions keep three's own UVs, already in metres and seamless round the bevels.
 function cushion(width,height,depth,radius,bevel){
  const s=new THREE.Shape(),x=-width/2,y=-height/2,r=Math.min(radius,width/2,height/2);
  s.moveTo(x+r,y);s.lineTo(x+width-r,y);s.quadraticCurveTo(x+width,y,x+width,y+r);s.lineTo(x+width,y+height-r);s.quadraticCurveTo(x+width,y+height,x+width-r,y+height);
  s.lineTo(x+r,y+height);s.quadraticCurveTo(x,y+height,x,y+height-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);
  const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel*.8,bevelSegments:4,curveSegments:8});g.translate(0,0,-depth/2);g.computeVertexNormals();
  return g;
 }
 // Transmission tunnel section (z -0.07..0.19, rounded top), extruded rearward from x=0.
 function tunnel(height,length){
  const s=new THREE.Shape();s.moveTo(-.07,0);s.lineTo(-.07,height-.055);s.absellipse(.06,height-.055,.13,.055,Math.PI,0,true);s.lineTo(.19,0);s.closePath();
  return new THREE.ExtrudeGeometry(s,{depth:length,bevelEnabled:false,curveSegments:10}).rotateY(-Math.PI/2);
 }
 // Two interiors share these controls (setView). The classic one keeps its box shell whole in
 // `classic`: roof, side walls, hood block, the game's own cage, nets and windows. The other
 // sits inside the V06 body (the car GLB): the body's roof, doors, cage and nets take their
 // place and `fillers` close its gaps. `cabin` (floor, firewall, tunnel, rear pan and walls) shows
 // from inside either way; seen from outside the body's own structure closes the cabin, and
 // the seat, controls and equipment show through the windows.
 const classic=new THREE.Group(),cabin=new THREE.Group(),fillers=new THREE.Group();
 classic.name='Casca_classica';cabin.name='Cabine_piso_paredes';fillers.name='Complementos_V06';root.add(classic,cabin,fillers);
 const kit={root,classic,cabin,m,mesh,box,bar,panel,decal,cushion,tunnel,silver,chrome,steel,red,yellow,bezel,paintBoth,paintSatin};

 // --- Body shell: bare steel painted gloss black (carro_30, 33-36); the driver's
 // footwell has an aluminium sheet with worn black grip strips (carro_24).
 box([.19,.29,0],[1.65,.04,1.49],m.paint,cabin);
 const sheet=m.aluminium.clone();sheet.color.setHex(0xffffff);sheet.roughness=.45;
 box([.47,.3115,-.40],[.56,.003,.40],sheet,cabin);
 const tape=mesh(new THREE.PlaneGeometry(.54,.40),new THREE.MeshStandardMaterial({map:canvasTexture(512,384,(ctx,w,h)=>{
  ctx.strokeStyle='#101112';ctx.lineCap='round';
  for(let i=0;i<5;i++){const y0=40+i*77,rear=i%2?[20,250]:[60,300],front=i%2?[290,490]:[330,470];
   for(const [x0,x1] of [rear,front]){ctx.lineWidth=40+Math.random()*10;ctx.beginPath();ctx.moveTo(x0,y0+Math.random()*6);
    ctx.bezierCurveTo(x0+(x1-x0)*.33,y0-7+Math.random()*14,x0+(x1-x0)*.66,y0-7+Math.random()*14,x1,y0-(x1-x0)*.03);ctx.stroke();}
   ctx.globalCompositeOperation='destination-out';for(let k=0;k<30;k++){ctx.beginPath();ctx.arc(Math.random()*w,y0+(Math.random()-.5)*44,1+Math.random()*4,0,Math.PI*2);ctx.fill();}ctx.globalCompositeOperation='source-over';}
 }),transparent:true,alphaTest:.1,roughness:.95,polygonOffset:true,polygonOffsetFactor:-2}),[.47,.3132,-.40],cabin);tape.rotation.set(-Math.PI/2,0,0);
 box([.80,.57,0],[.06,.57,1.49],m.bitumen,cabin);
 mesh(tunnel(.16,.92),paintSatin,[.72,.31,0],cabin);
 box([1.18,.825,0],[.77,.025,1.44],m.hood,classic); // hood beyond the windscreen
 box([-.13,1.415,0],[1.08,.055,1.34],m.paint,classic);
 for(const x of [-.5,-.18,.14])box([x,1.381,0],[.035,.014,1.30],m.body,classic); // roof ribs
 // Single wiper resting at the foot of the windscreen, seen through the glass.
 bar([.86,.915,-.30],[.845,.93,.16],.006,m.shell,classic);bar([.875,.905,-.05],[.85,.922,-.02],.004,m.shell,classic);
 // --- Original Opala dash top over an emptied lower dash; cage dash bar beneath. The dash top
 // meets the windscreen base, so it keeps its height when setView drops the rest.
 const dashTop=new THREE.Group();dashTop.name='Painel_topo';root.add(dashTop);
 box([.70,.888,0],[.26,.034,1.40],m.dash,dashTop);
 bar([.575,.886,-.69],[.575,.886,.69],.02,m.dash,dashTop); // rolled rear edge of the dash top
 for(let i=0;i<14;i++)mesh(new THREE.SphereGeometry(.004,8,6),silver,[.556,.888,-.62+i*.095],dashTop);
 bar([.60,.80,-.70],[.60,.80,.70],.0225); // dash bar
 // V06 parts that hug the windscreen move with it as v06_vidros.py bends it (glassLift): their geometry is baked
 // into the fillers' frame (the car's, setView keeps it there) and moved `weight(x)` of the glass's way.
 function bendWithGlass(o,weight=()=>1){
  const M=new THREE.Matrix4();for(let p=o;p!==fillers;p=p.parent){p.updateMatrix();M.premultiply(p.matrix);}
  const g=o.geometry.clone().applyMatrix4(M),pos=g.attributes.position;
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),w=weight(x),[dx,dy]=glassLift(x,y,z);pos.setXYZ(i,x+dx*w,y+dy*w,z);}
  g.computeVertexNormals();o.geometry.dispose();o.geometry=g;o.removeFromParent();o.position.set(0,0,0);o.rotation.set(0,0,0);o.scale.set(1,1,1);fillers.add(o);return o;
 }
 // Inside the V06 body its windscreen base is 10 cm ahead of this dash top: a strip closes it,
 // stopping short of the windscreen rubber. Its front edge follows the glass's foot (lower at the
 // corners, down to the cowl), its rear edge stays on the dash top.
 bendWithGlass(mesh(boxUV(new THREE.BoxGeometry(.094,.012,1.40,1,1,28)),m.dash,[.872,.896,0],fillers),x=>clamp((x-.825)/.094,0,1));
 // And the parcel shelf: from its rear bulkhead top up to just ahead of the trunk lid frame.
 box([-1.4715,.9165,0],[.047,.01,1.50],m.paint,fillers).rotation.z=Math.atan2(.035,-.031);
 for(const side of [-1,1]){
  box([.10,.59,side*.745],[1.54,.57,.025],m.paint,classic);
  box([.10,.878,side*.736],[1.54,.018,.03],m.body,classic); // door top rail
  // Roll cage: A-pillar, roof rail, door bars and the main hoop behind the seat.
  bar([.63,.31,side*.70],[.62,.96,side*.70],.029,m.cage,classic);
  bar([.62,.96,side*.70],[.28,1.36,side*.59],.032,m.cage,classic);
  bar([.28,1.36,side*.59],[-.63,1.36,side*.59],.029,m.cage,classic);
  bar([.58,.60,side*.70],[-.62,.88,side*.70],.024,m.cage,classic);
  bar([-.63,.31,side*.63],[-.63,1.36,side*.59],.032,m.cage,classic);
  // Window net as on the real car (carro_3): 5 horizontal and 7 vertical 30 mm straps,
  // riveted where they meet the border straps.
  for(let i=0;i<5;i++)box([-.02,.905+i*.095,side*.735],[.87,.03,.008],m.webbing,classic);
  for(let i=0;i<7;i++)box([-.45+i*.143,1.095,side*.738],[.03,.41,.008],m.webbing,classic);
  for(let i=0;i<7;i++)for(const y of [.905,1.285])mesh(new THREE.SphereGeometry(.004,8,6),silver,[-.45+i*.143,y,side*.733],classic);
 }
 bar([.29,1.36,-.60],[.29,1.36,.60],.029,m.cage,classic);
 bar([-.63,1.36,-.59],[-.63,1.36,.59],.032,m.cage,classic);
 bar([-.63,.96,-.62],[-.63,.96,.62],.026); // harness bar
 for(const side of [-1,1])bar([-.63,1.36,side*.59],[-.63,.96,-side*.62],.026,m.cage,classic); // X brace above the harness bar
 // Padding where the helmet could touch: driver's roof rail, A-pillar and door bar.
 padding([.28,1.36,-.59],[-.63,1.36,-.59],.25,.95,undefined,classic);
 padding([.62,.96,-.70],[.28,1.36,-.59],.45,1,undefined,classic);
 padding([.58,.60,-.70],[-.62,.88,-.70],.35,.75,.038,classic);
 padding([-.63,.31,-.63],[-.63,1.36,-.59],.62,.95,undefined,classic);
 // Opaque sun strip, leaving the road aperture open.
 const stripMaterial=new THREE.MeshStandardMaterial({color:0x958c77,roughness:1});
 const banner=box([.36,1.296,0],[.003,.073,1.17],stripMaterial,classic);banner.rotation.z=-.32;
 const bannerLogo=new THREE.TextureLoader().load('./assets/texturas/cockpit_faixa_invent.png');bannerLogo.colorSpace=THREE.SRGBColorSpace;
 const bannerPlane=new THREE.PlaneGeometry(.51,.079);const buv=bannerPlane.attributes.uv;for(let i=0;i<buv.count;i++)buv.setX(i,1-buv.getX(i));
 const logoMaterial=new THREE.MeshBasicMaterial({map:bannerLogo,transparent:true,opacity:.85,depthWrite:false});
 mesh(bannerPlane,logoMaterial,[0,0,0],panel([.335,1.288,.005],classic));
 // In the V06 body the strip lies on the inside of its windscreen, 7 mm off the old flat pane (55.6 degrees
 // from upright), from just under the header rubber down 12 cm, narrowing with the glass to 1 cm inside
 // its side rubbers: the band under the header in carro_14, pale with the sun behind it. The glass is now
 // crowned up to the roof's edge, and the strip and its logo bend with it (bendWithGlass).
 const stripGeometry=new THREE.BoxGeometry(1.196,.12,.003,32,2,1),stripPos=stripGeometry.attributes.position;
 for(let i=0;i<stripPos.count;i++)stripPos.setX(i,stripPos.getX(i)*(1-(stripPos.getY(i)+.06)/.12*(1-1.116/1.196)));  // trapezoid, 1.196 m at the foot, 1.116 m at the top
 const backlit=stripMaterial.clone();backlit.emissive.set(0x958c77);backlit.emissiveIntensity=.45;
 const strip=panel([.5247,1.1843,0],fillers,.970);
 const stripLogo=new THREE.PlaneGeometry(.51,.079,16,1);const suv=stripLogo.attributes.uv;for(let i=0;i<suv.count;i++)suv.setX(i,1-suv.getX(i));
 const stripMesh=bendWithGlass(mesh(stripGeometry,backlit,[0,0,-.002],strip));bendWithGlass(mesh(stripLogo,logoMaterial,[0,.02,0],strip));strip.removeFromParent();
 // The sun behind it is the weather's (weather.js EFFECT_LIGHT): at dusk it dims, at night the band goes dark, and its logo with it.
 stripMesh.onBeforeRender=()=>{backlit.emissiveIntensity=.45*EFFECT_LIGHT.value;logoMaterial.color.setScalar(Math.max(.08,EFFECT_LIGHT.value));};

 // --- Sgarbi bucket seat (carro_8, 24, 28, 36): air-mesh centres, back and head
 // wings, black bolsters with white piping, fibreglass sides.
 const seat=new THREE.Group();seat.name='Banco_Sgarbi';root.add(seat);
 const seatPart=(geometry,material,p,rotation=[0,0,0])=>{const o=mesh(geometry,material,p,seat);o.rotation.set(...rotation);return o;};
 // Cushions are built in XY: toX turns one to face forward (backrest), toY lays it flat (base).
 const toX=[0,Math.PI/2,0],toY=[-Math.PI/2,0,0];
 seatPart(cushion(.30,.52,.04,.05,.02),m.airMesh,[-.345,.73,-.34],toX);
 seatPart(cushion(.40,.29,.035,.06,.02),m.airMesh,[-.17,.37,-.34],toY);
 seatPart(cushion(.20,.22,.035,.06,.018),m.airMesh,[-.39,1.16,-.34],toX);
 for(const side of [-1,1]){
  const z=-.34+side*.20;
  seatPart(cushion(.13,.48,.05,.06,.028),m.seatVinyl,[-.305,.69,z],[0,side*.18,0]);
  seatPart(cushion(.36,.11,.046,.05,.026),m.seatVinyl,[-.19,.42,-.34+side*.215],[0,0,-.06]);
  bar([-.262,.47,-.34+side*.262],[-.278,.93,-.34+side*.262],.0038,m.whitePiping,seat);
  bar([-.30,1.04,-.34+side*.168],[-.30,1.28,-.34+side*.168],.0038,m.whitePiping,seat);
  bar([-.283,.46,-.34+side*.137],[-.298,.92,-.34+side*.137],.0038,m.whitePiping,seat);
  bar([-.37,.477,-.34+side*.19],[-.02,.456,-.34+side*.19],.0038,m.whitePiping,seat);
  seatPart(cushion(.15,.25,.03,.05,.012),m.airMesh,[-.355,1.16,-.34+side*.168]); // head wing
  // Side of the shell: low at the thighs, up to the shoulders (the camera rides just outside).
  const profile=new THREE.Shape();profile.moveTo(-.44,.33);profile.lineTo(.05,.33);profile.lineTo(.05,.47);profile.quadraticCurveTo(-.12,.47,-.22,.56);profile.lineTo(-.26,.96);profile.quadraticCurveTo(-.30,1.04,-.44,1.04);profile.closePath();
  const wall=new THREE.ExtrudeGeometry(profile,{depth:.012,bevelEnabled:true,bevelThickness:.003,bevelSize:.003,bevelSegments:2});wall.translate(0,0,-.006);
  seatPart(wall,m.shell,[0,0,-.34+side*.245]);
  seatPart(boxUV(new THREE.BoxGeometry(.34,.085,.006)),m.aluminium,[-.19,.36,-.34+side*.256]);
  for(const x of [-.32,-.06])mesh(new THREE.CylinderGeometry(.006,.006,.012,10).rotateX(Math.PI/2),chrome,[x,.36,-.34+side*.26],seat);
 }
 seatPart(cushion(.47,.66,.012,.07,.006),m.airMesh,[-.43,.72,-.34],toX);
 seatPart(cushion(.25,.30,.012,.08,.006),m.airMesh,[-.43,1.15,-.34],toX); // head restraint shell
 // Sgarbi lettering on the tunnel-side shell, the head wings and the thigh bolster.
 // Beige embroidery on the thigh bolster and backrest, dark grey on the head wings (carro_8, 24, 28).
 const sgarbi=logoTexture('sgarbi',{color:'#cfc3a2',font:'700 90px Arial,sans-serif'}),sgarbiWing=logoTexture('sgarbi',{color:'#6b6e70',font:'700 90px Arial,sans-serif'});
 for(const side of [-1,1])decal(sgarbiWing,[-.35,1.20,-.34+side*.197],.12,.03,seat,{transparent:true}).rotation.y=side>0?0:Math.PI;
 decal(sgarbi,[-.17,.499,-.125],.14,.035,seat,{transparent:true}).rotation.x=-Math.PI/2;
 decal(sgarbi,[-.302,1.0,-.34],.13,.032,seat,{transparent:true}).rotation.y=Math.PI/2; // across the backrest
 // Sgarbi shoulder straps over the seat back to the harness bar.
 const strapText=logoTexture('sgarbi   sgarbi',{width:1024,height:96,color:'#9a9c9e',font:'700 62px Arial,sans-serif',background:'#121315'});
 for(const dz of [-.075,.075]){
  const a=new THREE.Vector3(-.415,1.035,-.34+dz),b=new THREE.Vector3(-.635,.988,-.34+dz*.9),strap=new THREE.Group();
  strap.position.copy(a).add(b).multiplyScalar(.5);strap.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),a.clone().sub(b).normalize());root.add(strap);
  box([0,0,0],[a.distanceTo(b),.003,.048],m.webbing,strap);
  decal(strapText,[0,.0017,0],a.distanceTo(b)*.9,.04,strap,{transparent:false}).rotation.x=-Math.PI/2;
  mesh(new THREE.TorusGeometry(.029,.0025,6,20,Math.PI*1.5).rotateY(Math.PI/2),m.webbing,[-.63,.96,-.34+dz*.9]).rotation.x=-.9; // wrapped round the bar
 }

 // --- Auto Meter plate over the column (carro_25-27), the Luizão switch bank on the
 // windscreen tube (carro_31) and the dash-top readout.
 const {needles,shiftLight}=buildPod(kit,[.47,.912,-.335],-.22);
 // The bank and its brackets hang from the cage's windscreen tube; under the V06 body's lower
 // roof setView moves them to the roof lining, just ahead of that body's own windscreen tube.
 const bankRig=new THREE.Group();bankRig.name='Painel_botoes_suporte';root.add(bankRig);
 buildSwitchBank({...kit,root:bankRig},[.285,1.275,-.40],.30,new THREE.Vector3(.29,1.345,-.40));
 const display=buildSpeedDisplay(kit,[.54,.9325,-.09],-.2);
 // --- Suede wheel (carro_24, 32): black anodised dished spokes, six-bolt hub
 // with an open centre, yellow centring stripe and the radio button strapped on.
 const wheel=panel([.22,.88,-.34],root,-.38);wheel.name='Volante_animado';wheel.rotation.z=.035;
 const wheelTurn=new THREE.Group();wheel.add(wheelTurn);
 const rim=new THREE.TorusGeometry(.173,.018,14,72),ruv=rim.attributes.uv;for(let i=0;i<ruv.count;i++)ruv.setXY(i,ruv.getX(i)*2*Math.PI*.173,ruv.getY(i)*2*Math.PI*.018);
 mesh(rim,m.suede,[0,0,0],wheelTurn);
 mesh(new THREE.TorusGeometry(.173,.0193,14,12,.24),yellow,[0,0,0],wheelTurn).rotation.z=Math.PI/2-.12;
 // Polar outline: a spoke of half-width h covers r <= h/sin(d), d the angle off its
 // centre line, which blends each spoke into the hub with a concave fillet.
 const DISH=.035,SPOKES=[-.07,Math.PI+.07,Math.PI*1.5],spider=new THREE.Shape();
 for(let i=0;i<=360;i++){
  const a=i/360*Math.PI*2;let r=.046;
  for(const s of SPOKES){const d=Math.abs(Math.atan2(Math.sin(a-s),Math.cos(a-s)));if(d<Math.PI/2)r=Math.max(r,Math.min(.162,.0145/Math.max(Math.sin(d),1e-3)));}
  const x=Math.cos(a)*r,y=Math.sin(a)*r;i?spider.lineTo(x,y):spider.moveTo(x,y);
 }
 const hole=new THREE.Path();hole.absarc(0,0,.026,0,Math.PI*2,true);spider.holes.push(hole);
 const plate=new THREE.ExtrudeGeometry(spider,{depth:.004,bevelEnabled:true,bevelThickness:.0012,bevelSize:.0015,bevelSegments:1,curveSegments:24});
 const sp=plate.attributes.position;for(let i=0;i<sp.count;i++)sp.setZ(i,sp.getZ(i)-.002-DISH*clamp((.162-Math.hypot(sp.getX(i),sp.getY(i)))/.13,0,1));plate.computeVertexNormals();
 // Black faces, machined silver edges (the extrusion's side group).
 mesh(plate,m.anodized,[0,0,0],wheelTurn);
 const zAt=r=>.0042-.002-DISH*clamp((.162-r)/.13,0,1);
 const spokes=SPOKES.map(angle=>{const g=new THREE.Group();g.rotation.z=angle;wheelTurn.add(g);
  for(const e of [-1,1])bar([.07,e*.0148,zAt(.07)],[.158,e*.0148,zAt(.158)],.0013,bezel,g); // machined chamfers
  return g;});
 mesh(new THREE.CylinderGeometry(.0262,.0262,.009,32,1,true).rotateX(Math.PI/2),m.shell,[0,0,-DISH+.001],wheelTurn); // dark wall of the centre hole
 const allen=new THREE.MeshStandardMaterial({color:0x9a9a9a,metalness:.7,roughness:.35});
 for(let i=0;i<6;i++){const a=Math.PI/6+i*Math.PI/3;mesh(new THREE.CylinderGeometry(.0045,.0045,.003,12).rotateX(Math.PI/2),allen,[Math.cos(a)*.035,Math.sin(a)*.035,-DISH+.0055],wheelTurn);mesh(new THREE.CircleGeometry(.0018,6),new THREE.MeshBasicMaterial({color:0x111111}),[Math.cos(a)*.035,Math.sin(a)*.035,-DISH+.0072],wheelTurn);}
 mesh(new THREE.CircleGeometry(.026,32),new THREE.MeshBasicMaterial({color:0x040404}),[0,0,-DISH-.03],wheelTurn);
 // Polished aluminium boss and the quick release (carro_24).
 mesh(new THREE.CylinderGeometry(.033,.03,.12,32,1,true).rotateX(Math.PI/2),m.aluminium,[0,0,-DISH-.064],wheel); // open: the hub stays a dark hole
 mesh(new THREE.CylinderGeometry(.037,.037,.018,32).rotateX(Math.PI/2),m.shell,[0,0,-DISH-.126],wheel);
 bar([.368,.821,-.34],[.62,.719,-.34],.019,silver); // column, falling toward the firewall
 // Universal joint and the shaft on to the firewall.
 mesh(new THREE.SphereGeometry(.024,14,10),new THREE.MeshStandardMaterial({color:0x6b4a33,metalness:.5,roughness:.8}),[.625,.717,-.34]);
 bar([.63,.715,-.34],[.78,.68,-.345],.012,steel);
 // The spoke carries OMP, the team's sponsor (the wheel in the photos is a Sparco).
 const logo=new THREE.Group();logo.position.set(.10,0,.0032-DISH*.062/.13);logo.rotation.y=-Math.atan(DISH/.13);spokes[0].add(logo);
 mesh(new THREE.PlaneGeometry(.085,.021),new THREE.MeshStandardMaterial({map:logoTexture('OMP',{color:'#f4f3ee',font:'italic 900 112px "Arial Black",Arial,sans-serif'}),transparent:true,alphaTest:.1,roughness:.5,polygonOffset:true,polygonOffsetFactor:-2}),[0,0,0],logo).castShadow=false;
 // Radio push-to-talk strapped to the left spoke at the rim.
 const ptt=new THREE.Group();ptt.position.set(.146,-.022,.012);spokes[1].add(ptt);
 mesh(cushion(.04,.03,.018,.008,.006),m.shell,[0,0,0],ptt);
 mesh(new THREE.SphereGeometry(.0088,20,10,0,Math.PI*2,0,Math.PI/2).rotateX(Math.PI/2).scale(1,1,.8),new THREE.MeshPhysicalMaterial({color:0xed154e,roughness:.2,clearcoat:.9,emissive:0xed154e,emissiveIntensity:.1}),[0,0,.0155],ptt);
 mesh(new THREE.TorusGeometry(.173,.021,8,12,.18),m.webbing,[0,0,0],wheelTurn).rotation.z=Math.PI-.17;
 const phone=createFamilyPhone();wheelTurn.add(phone.root);
 box([0,-.107,.004],[.03,.03,.034],m.shell,wheelTurn); // lap-timer mount on the lower spoke
 // The wheel's parts turn together: one mesh per material (car-lod.js mergeStill), the phone and the radio button apart.
 mergeStill(wheelTurn,{skip:[phone.root,ptt]});mergeStill(wheel,{skip:[wheelTurn]});

 // Driver controls. Each moving part is a pivot group the seated driver animates;
 // the *Grip/contact anchors are where a glove or boot sole meets it.
 // Tall five-speed H lever: black shaft, polished aluminium knob, rubber boot (carro_33).
 const shifter=new THREE.Group();shifter.name='Cambio_H_animado';shifter.position.set(.095,.472,.02);root.add(shifter);
 box([0,.003,0],[.12,.006,.12],m.rubber,shifter);
 for(const [x,z] of [[-.05,-.05],[.05,-.05],[-.05,.05],[.05,.05]])mesh(new THREE.SphereGeometry(.0045,8,6),chrome,[x,.007,z],shifter);
 const boot=new THREE.Group();shifter.add(boot);
 for(const [r0,r1,y,h] of [[.056,.047,.018,.024],[.045,.035,.044,.027],[.033,.019,.074,.035]])mesh(new THREE.CylinderGeometry(r1,r0,h,22,1,true),m.rubber,[0,y,0],boot);
 const lever=new THREE.Group();lever.name='Alavanca_cambio';shifter.add(lever);
 const CRANK=.09;bar([0,0,0],[0,CRANK,0],.0082,m.anodized,lever);
 // Cranked back toward the driver and a little to the passenger side (carro_33).
 const upper=new THREE.Group();upper.position.y=CRANK;upper.rotation.set(.14,0,.5);lever.add(upper);
 const reach=SHIFT_LEVER-CRANK-.02;bar([0,0,0],[0,reach,0],.0078,m.anodized,upper);
 mesh(new THREE.SphereGeometry(.0095,12,8),m.anodized,[0,0,0],upper);
 const pear=[[0,0],[.012,0],[.013,.006],[.019,.014],[.021,.026],[.021,.046],[.019,.056],[.012,.064],[0,.067]].map(([r,y])=>new THREE.Vector2(r,y));
 mesh(new THREE.LatheGeometry(pear,32),m.polished,[0,reach-.006,0],upper);
 mesh(new THREE.CylinderGeometry(.0125,.0125,.008,20),silver,[0,reach-.01,0],upper);
 const knobGrip=new THREE.Object3D();knobGrip.position.set(0,reach+.024,0);upper.add(knobGrip);
 function setShifter(lane,throwPosition){
  lever.rotation.set(lane*SHIFT_LANE,0,-throwPosition*SHIFT_THROW-SHIFT_LEAN);
  boot.rotation.set(lever.rotation.x*.5,0,lever.rotation.z*.5);
 }
 // No handbrake in this car: the battery master key sits in its place (carro_28).
 buildKeyPanel(kit);
 // Hanging pedals on a common axle under the dash (carro_24, 29): Tilton clutch and
 // brake pads, a punched throttle plate; pads angled to meet a sole pivoting on its heel.
 const pedals={};
 bar([.755,.70,-.52],[.755,.70,-.20],.01,steel);
 for(const [name,z,x,y,width,height] of [['clutch',-.46,.705,.458,.05,.06],['brake',-.35,.698,.462,.056,.064],['throttle',-.248,.712,.44,.085,.13]]){
  const pivot=new THREE.Group();pivot.name='Pedal_'+name;pivot.position.set(.755,.70,z);root.add(pivot);
  const pad=[x-.755,y-.70,0];
  if(name==='throttle')bar([0,0,0],[pad[0]+.035,pad[1]+.045,0],.006,silver,pivot);
  else box([pad[0]/2+.004,pad[1]/2,0],[.008,Math.hypot(pad[0],pad[1]),.018],silver,pivot).rotation.z=Math.atan2(pad[0],-pad[1]);
  if(name!=='throttle')bar([-.012,-.02,0],[-.01,.05,0],.004,silver,pivot); // pushrod up to the master cylinder
  const face=new THREE.Group();face.position.set(...pad);face.rotation.z=-.7;pivot.add(face);
  if(name==='throttle')box([0,0,0],[.005,height,width],m.perforated,face);
  else{box([0,0,0],[.012,height,width],m.aluminium,face);mesh(new THREE.PlaneGeometry(width*.96,height*.96),m.tilton,[-.0062,0,0],face).rotation.y=-Math.PI/2;}
  const contact=new THREE.Object3D();contact.position.x=-.008;face.add(contact);
  pedals[name]={pivot,contact,travel:PEDAL_TRAVEL[name]};
 }
 const footrest=new THREE.Group();footrest.name='Apoio_pe_esquerdo';footrest.position.set(.70,.43,-.585);footrest.rotation.z=-.7;root.add(footrest);
 box([0,0,0],[.005,.18,.09],m.perforated,footrest);
 const restContact=new THREE.Object3D();restContact.position.set(-.008,.02,0);footrest.add(restContact);
 function setPedals(clutch,brake,throttle){for(const [name,value] of Object.entries({clutch,brake,throttle}))pedals[name].pivot.rotation.z=clamp(value,0,1)*pedals[name].travel;}
 setShifter(...GATE[1]);
 const controls={shifter,lever,knobGrip,pedals,footrest,restContact,
  parts:[shifter,footrest,...Object.values(pedals).map(p=>p.pivot)],
  apply(pose){setShifter(...pose.lever);setPedals(pose.clutch,pose.brake,pose.throttle);},
  info:()=>({lever:[lever.rotation.x,lever.rotation.z],pedals:Object.fromEntries(Object.entries(pedals).map(([k,p])=>[k,p.pivot.rotation.z/p.travel]))})};

 // Loose wiring from the dash down the passenger side of the tunnel.
 for(const [points,r] of [[[[.62,.78,.10],[.56,.62,.16],[.60,.52,.26],[.66,.60,.30],[.58,.70,.22],[.50,.42,.20],[.46,.34,.21]],.004],[[[.64,.79,.18],[.52,.64,.12],[.48,.50,.22],[.44,.36,.24]],.003],[[[.66,.80,.26],[.60,.68,.34],[.54,.62,.24],[.58,.50,.14],[.52,.40,.20],[.48,.34,.22]],.005],[[[.70,.80,.05],[.62,.70,.02],[.58,.56,.10],[.60,.45,.20],[.52,.35,.23]],.0035]])mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),48,r,6,false),m.plastic,[0,0,0]);
 buildDriverFootwell(kit);
 buildPassengerSide(kit);
 buildWindscreenNumber(kit);
 buildRearCabin(kit);
 // Functional rear-view mirror: the texture is filled by the game renderer.
 const mirrorTarget=new THREE.WebGLRenderTarget(1020,170);
 const mirror=panel([.34,1.33,.035]);box([0,0,0],[.58,.107,.023],m.plastic,mirror);
 const mirrorGeo=new THREE.PlaneGeometry(.555,.092);const uv=mirrorGeo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setX(i,1-uv.getX(i));
 mesh(mirrorGeo,new THREE.MeshBasicMaterial({map:mirrorTarget.texture,toneMapped:false}),[0,0,.014],mirror);
 const rearCamera=new THREE.PerspectiveCamera(36,6,.1,2200);
 // Cabin reflections turn with the car; the hood and boot lid keep the sky.
 const reflective=new Set();
 root.traverse(o=>{if(o.isMesh)for(const material of [o.material].flat())if(material.isMeshStandardMaterial&&material!==m.hood)reflective.add(material);});
 if(m.envMap)for(const material of reflective)material.envMap=m.envMap;
 // The fixed shell, cage, nets and seat become one mesh per material:
 // a fraction of the draw calls, in both the colour and the shadow passes.
 function mergeStatic(parent){
  const byMaterial=new Map();
  for(const o of [...parent.children]){
   if(!o.isMesh)continue;
   o.updateMatrix();const g=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrix);
   if(!byMaterial.has(o.material))byMaterial.set(o.material,[]);byMaterial.get(o.material).push(g);parent.remove(o);o.geometry.dispose();
  }
  for(const [material,list] of byMaterial){mesh(mergeGeometries(list),material,[0,0,0],parent);for(const g of list)g.dispose();}
 }
 const board=root.getObjectByName('Painel_reles'),battery=root.getObjectByName('Bateria');
 mergeStatic(root);mergeStatic(seat);mergeStatic(classic);mergeStatic(cabin);mergeStatic(fillers);mergeStatic(dashTop);mergeStatic(battery);
 const eye=new THREE.Vector3(-.39,1.08,.015),EYE_X=eye.x,EYE_Y=eye.y,MIRROR_Y=mirror.position.y,BOARD_Z=board.position.z;
 // inside: the camera is in the cabin (the cockpit view); classic: the old box interior. Anywhere
 // else the controls sit in the V06 body as in its Blender scene (v06_interior.py): dropped onto its
 // cabin floor, whose structure replaces `cabin`; the dash top stays at its windscreen base. As in
 // the onboard photo carro_14, the mirror spans the top of the windscreen (centre 1.185 m) with the
 // switch bank right beside it (3.5 cm inboard of the classic spot), hanging from the underside of
 // the V06 windscreen tube where it arches up with the roof (1.229 m there: v06_interior.py). The real
 // windscreen is shorter than the classic box's opening, so the camera comes 24 cm forward and 3 cm up
 // (1.02 m, 12 cm over the dash top), near the onboard GoPro of carro_14: the glass fills about as much of
 // the view as the old opening did, with the road from about 9 m ahead. The relay board and the battery
 // come inboard, clear of the V06 cage leg and rear arch; what crosses that cage or its sills belongs to `classic`.
 const V06={drop:-.093,bank:1.229-1.345,bankIn:.035,mirror:1.185-MIRROR_Y,board:-.045,battery:-.035,eyeForward:.24,eyeLift:.033};
 let cameraInside=true,lastView={};
 function setView({inside=true,classic:old=false}={}){
  const v06=!(inside&&old),drop=v06?V06.drop:0;cameraInside=inside;lastView={inside,classic:old};
  classic.visible=cabin.visible=!v06;fillers.visible=v06;
  root.position.y=drop;dashTop.position.y=fillers.position.y=-drop;
  bankRig.position.set(0,v06?V06.bank-drop:0,v06?V06.bankIn:0);mirror.position.y=MIRROR_Y+(v06?V06.mirror-drop:0);
  board.position.z=BOARD_Z+(v06?V06.board:0);battery.position.z=v06?V06.battery:0;
  eye.set(EYE_X+(v06?V06.eyeForward:0),EYE_Y+drop+(v06?V06.eyeLift:0),eye.z);
 }
 setView();
 // A still copy of the controls as they sit in the V06 body seen from outside, for another Opala (the
 // story-mode paddock car): the wheel, lever and pedals ride with the driver (driver.js), so copies of
 // them come along, and the mirror gets a plain chrome face instead of this car's live view. Offered on
 // root.userData so the car's other users find it with the root.
 const stillMirror=new THREE.MeshStandardMaterial({color:0xaab4ba,metalness:1,roughness:.06});
 function outsideCopy(){
  const was=lastView;setView({inside:false});root.updateMatrix();
  const copy=new THREE.Group(),inner=root.clone(true);inner.visible=true;copy.add(inner);
  for(const part of [wheel,...controls.parts]){
   const holder=part.parent;if(holder===root)continue;
   const c=part.clone(true);if(holder){holder.updateMatrix();c.applyMatrix4(holder.matrix);c.position.y+=V06.drop-holder.position.y;}copy.add(c);
  }
  copy.traverse(o=>{if(o.material?.map===mirrorTarget.texture)o.material=stillMirror;});
  setView(was);copy.name='Interior_Opala_99_parado';return copy;
 }
 root.userData.outsideCopy=outsideCopy;
 // The cabin as the outside views see it through the windows, still and batched: one mesh per material (about 25
 // draws where the live one, with every switch and gauge on its own, makes over 200: a cheap PC's processor felt
 // it on every frame of the chase camera). main.js cabinVisibility shows it outside the cockpit view, beside root.
 let batch=null,plainShared=null;
 const plainMaterial=()=>plainShared??=new THREE.MeshStandardMaterial({name:'Interior_lote_cores',vertexColors:true,roughness:.68,metalness:.2});
 function outsideBatch(build=true){
  if(batch||!build||!root.parent)return batch;
  const was=lastView;setView({inside:false});root.updateMatrixWorld(true);
  const inverse=root.matrixWorld.clone().invert(),local=new THREE.Matrix4(),groups=new Map(),loose=[];
  const shown=o=>{for(let q=o;q;q=q.parent){if(q===root)return true;if(!q.visible)return false;}return false;};
  root.traverse(o=>{
   if(!(o.isMesh||o.isLine||o.isPoints)||!shown(o))return;
   const material=o.material?.map===mirrorTarget.texture?stillMirror:o.material;
   if(!o.isMesh||o.isInstancedMesh||o.isSkinnedMesh||Array.isArray(material)){loose.push(o);return;}
   // Plain opaque parts (most switches, brackets, bolts each had a material of their own) go into one mesh of vertex
   // colours: through the tinted windows their sheen does not show. Textured, see-through and patched ones keep theirs.
   const plain=!material.map&&!material.transparent&&!material.alphaTest&&material.onBeforeCompile===THREE.Material.prototype.onBeforeCompile&&!material.isShaderMaterial&&!material.vertexColors&&material.color;
   const key=plain?'plain|'+o.renderOrder:material.uuid+'|'+o.renderOrder;if(!groups.has(key))groups.set(key,{material:plain?plainMaterial():material,plain,list:[]});groups.get(key).list.push(o);
  });
  batch=new THREE.Group();batch.name='Interior_Opala_99_lote';batch.matrixAutoUpdate=false;batch.matrix.copy(root.matrix);
  for(const {material,plain,list} of groups.values()){
   const uv=!plain&&list.some(o=>o.geometry.attributes.uv),color=material.vertexColors,indexed=list.every(o=>o.geometry.index);
   const parts=list.map(o=>{
    let g=o.geometry.clone();if(!indexed&&g.index)g=g.toNonIndexed();
    for(const k of Object.keys(g.attributes))if(!['position','normal','uv','color'].includes(k)||k==='uv'&&!uv||k==='color'&&!color)g.deleteAttribute(k);
    const n=g.attributes.position.count;if(!g.attributes.normal)g.computeVertexNormals();
    if(uv&&!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(n*2),2));
    if(plain){const c=new Float32Array(n*3),k=o.material.color;for(let i=0;i<c.length;i+=3){c[i]=k.r;c[i+1]=k.g;c[i+2]=k.b;}g.setAttribute('color',new THREE.BufferAttribute(c,3));}
    else if(color&&!g.attributes.color)g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(n*3).fill(1),3));
    return g.applyMatrix4(local.multiplyMatrices(inverse,o.matrixWorld));
   });
   const merged=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());if(!merged)continue;
   const mesh=new THREE.Mesh(merged,material);mesh.renderOrder=list[0].renderOrder;mesh.castShadow=list.some(o=>o.castShadow);mesh.receiveShadow=list.some(o=>o.receiveShadow);batch.add(mesh);
  }
  for(const o of loose){const c=o.clone(false);c.matrixAutoUpdate=false;c.matrix.multiplyMatrices(inverse,o.matrixWorld);if(c.material?.map===mirrorTarget.texture)c.material=stillMirror;batch.add(c);}
  setView(was);batch.visible=false;root.parent.add(batch);return batch;
 }
 function update(car,dt,powertrain){
  const speed=Math.hypot(car.vx,car.vy)*3.6,gear=Math.min(5,1+Math.floor(speed/42));
  const rpm=powertrain?.rpm??(speed<2?1100:Math.min(7800,1800+(speed%42)/42*5700));
  wheelTurn.rotation.z=steeringWheelAngle(car.steerVisual??car.steer);
  if(m.envMap&&Number.isFinite(car.heading))for(const material of reflective)material.envMapRotation.y=car.heading;
  needles.tach.rotation.z=needleAngle('tach',rpm/1000);
  needles.oil.rotation.z=needleAngle('oil',22+clamp(rpm/7000,0,1)*48);
  needles.water.rotation.z=needleAngle('water',188);
  needles.fuel.rotation.z=needleAngle('fuel',6.4+Math.sin(rpm*.004)*.25);
  shiftLight.material.emissiveIntensity=rpm>6700?4:0;
  display.draw(Math.min(999,Math.round(speed)));
  // The phone's messages only run on while the driver's view is shown (the controls show from outside too).
  const phoneArrived=phone.update(root.visible&&cameraInside?dt:0);
  return {speed,rpm,gear,steering:wheelTurn.rotation.z,phoneArrived};
 }
 // drop: how far setView lowered the cabin; the driver (driver.js) and photo poses follow it.
 return {root,wheel,wheelTurn,controls,eye,update,setView,outsideBatch,drop:()=>root.position.y,mirrorTarget,rearCamera,resetPhone:()=>phone.reset(),
  info:()=>({reference:INTERIOR_REFERENCES,steering:wheelTurn.rotation.z,speed:display.speed,mirror:[mirrorTarget.width,mirrorTarget.height],visible:root.visible||!!batch?.visible,batched:!!batch?.visible,phone:phone.info(),controls:controls.info(),
   materials:reflective.size,cabinReflections:!!m.envMap,seat:seat.children.length,view:{classic:classic.visible,cabin:cabin.visible,fillers:fillers.visible,drop:root.position.y,eye:eye.toArray(),mirrorY:mirror.position.y}})};
}
