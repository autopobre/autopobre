import * as THREE from 'three';
import {msdLabel,relayPanelTexture,luizaoFaces,windscreenNumber,canvasTexture} from './cockpit-materials.js';

const tube=(points,r)=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),Math.max(12,points.length*10),r,8,false);
// Coiled cord between two points (radio and push-to-talk leads).
function coil(from,to,{turns=18,radius=.011,wire=.0022}={}){
 const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),axis=b.clone().sub(a),side=new THREE.Vector3(0,1,0).cross(axis).normalize();
 if(side.lengthSq()<1e-6)side.set(1,0,0);
 const other=axis.clone().normalize().cross(side),points=[];
 for(let i=0;i<=turns*12;i++){const t=i/(turns*12),q=t*turns*Math.PI*2;points.push(a.clone().addScaledVector(axis,t).addScaledVector(side,Math.cos(q)*radius).addScaledVector(other,Math.sin(q)*radius));}
 return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),turns*24,wire,5,false);
}

// Passenger footwell (carro_30, 33, 35): MSD box and the Luizão relay board on the
// firewall, the gimbal camera on the dash bar, headset and radio on a carbon plate.
export function buildPassengerSide(kit){
 const {mesh,box,bar,m,panel,chrome}=kit;
 // MSD 6AL ignition box, finned face toward the cabin.
 const msd=panel([.735,.57,.40]);msd.rotation.z=-.14;box([0,0,-.03],[.165,.089,.06],new THREE.MeshStandardMaterial({color:0xb3141c,metalness:.5,roughness:.4}),msd);
 mesh(new THREE.PlaneGeometry(.165,.089),new THREE.MeshStandardMaterial({map:msdLabel(),metalness:.3,roughness:.45}),[0,0,.0006],msd).castShadow=false;
 // Relay and fuse board.
 const board=panel([.766,.60,.53]);board.name='Painel_reles';
 mesh(new THREE.PlaneGeometry(.21,.30),luizaoFaces(new THREE.MeshStandardMaterial({roughness:.5}),relayPanelTexture),[0,0,.002],board);
 box([0,0,0],[.21,.30,.004],m.shell,board);
 const relay=new THREE.MeshPhysicalMaterial({color:0xf2c4a4,roughness:.1,transparent:true,opacity:.3,clearcoat:1,depthWrite:false});
 const bladeFuse=new THREE.MeshPhysicalMaterial({color:0x4fb86a,roughness:.25,transparent:true,opacity:.85,depthWrite:false});
 const fuse=new THREE.MeshPhysicalMaterial({color:0xe8ecef,roughness:.15,transparent:true,opacity:.55,depthWrite:false});
 const wires=[0xc62828,0x2e7d32,0x1565c0,0xe8e8e2,0xc62828,0x111111].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.6}));
 // Six relays stepping down to the right, each with a mini blade fuse on top (carro_30).
 for(let i=0;i<6;i++){
  const x=-.07+i*.026,y=.105-i*.006;box([x,y-.018,.004],[.024,.01,.008],m.shell,board);
  const o=box([x,y,.018],[.022,.042,.028],relay,board);o.castShadow=false;box([x,y,.016],[.012,.03,.014],m.copper,board);
  const f=box([x,y+.028,.018],[.012,.014,.006],bladeFuse,board);f.castShadow=false;
  mesh(tube([[x,y-.02,.012],[x+.004,y-.06,.02],[x-.01,y-.13,.014],[x-.02,-.13,.03]],.0018),wires[i],[0,0,0],board);
 }
 // Two clear inline fuse holders on red leads.
 for(const [x,y] of [[-.02,-.035],[.04,-.06]]){const o=box([x,y,.014],[.05,.016,.016],fuse,board);o.castShadow=false;box([x,y,.014],[.016,.008,.006],kit.red,board);mesh(tube([[x+.025,y,.014],[x+.06,y-.01,.02],[x+.09,y-.05,.02]],.0022),wires[0],[0,0,0],board);}
 // Braided steel hose and a thick black loom on the firewall beside the board.
 mesh(tube([[-.13,.14,.01],[-.2,.02,.03],[-.26,-.12,.02],[-.18,-.2,.03],[-.12,-.08,.02],[-.16,.06,.01]],.005),kit.silver,[0,0,0],board);
 mesh(tube([[-.33,.17,.01],[-.28,.02,.03],[-.22,-.14,.03],[-.12,-.24,.02]],.012),m.webbing,[0,0,0],board);
 // Black braided loom round the right-hand edge.
 mesh(tube([[.115,.16,.01],[.12,.05,.02],[.118,-.08,.02],[.10,-.17,.015]],.006),m.webbing,[0,0,0],board);
 // DJI Osmo Pocket clamped on the dash bar, gimbal up.
 const dji=new THREE.Group();dji.position.set(.568,.80,.30);kit.root.add(dji);
 const grey=new THREE.MeshStandardMaterial({color:0x8a8d92,metalness:.3,roughness:.45});
 box([0,-.03,0],[.022,.11,.028],grey,dji);
 mesh(new THREE.PlaneGeometry(.022,.04),new THREE.MeshStandardMaterial({color:0x07090b,roughness:.1}),[-.0115,-.015,0],dji).rotation.y=-Math.PI/2;
 box([0,.032,0],[.01,.018,.024],grey,dji);
 mesh(new THREE.CylinderGeometry(.012,.012,.022,20).rotateX(Math.PI/2),grey,[0,.048,0],dji);
 mesh(new THREE.CircleGeometry(.006,16),new THREE.MeshStandardMaterial({color:0x0a0d12,metalness:.6,roughness:.05}),[-.0125,.048,0],dji).rotation.y=-Math.PI/2;
 const tie=new THREE.MeshStandardMaterial({color:0xd9dad6,roughness:.6});
 for(const y of [-.005,-.045]){mesh(new THREE.TorusGeometry(.024,.0012,4,16).rotateX(Math.PI/2),tie,[.02,y,0],dji);box([.02,y,.09],[.004,.002,.15],tie,dji);}
 // Carbon plate on the passenger floor with the team headset and handheld radio.
 box([.225,.3125,.43],[.55,.005,.46],m.carbon);
 const cup=new THREE.MeshStandardMaterial({color:0xc8141e,roughness:.35,metalness:.1});
 for(const [p,rot] of [[[.19,.338,.37],[0,.4,0]],[[.27,.352,.47],[.9,0,.3]]]){
  const ear=new THREE.Group();ear.position.set(...p);ear.rotation.set(...rot);kit.root.add(ear);
  mesh(new THREE.SphereGeometry(.05,28,14,0,Math.PI*2,0,Math.PI/2).scale(1,.95,1.3),cup,[0,.012,0],ear);
  mesh(new THREE.TorusGeometry(.036,.024,12,28).rotateX(Math.PI/2).scale(1,1,1.3),m.foam,[0,-.004,0],ear);
 }
 mesh(tube([[.19,.36,.37],[.14,.40,.43],[.19,.43,.51],[.27,.40,.51],[.27,.37,.47]],.008),m.plastic,[0,0,0]);
 mesh(tube([[.17,.335,.33],[.12,.33,.27],[.07,.325,.24]],.003),m.plastic,[0,0,0]);
 mesh(new THREE.SphereGeometry(.016,12,8),m.foam,[.065,.33,.235]);
 box([.21,.34,.325],[.03,.004,.012],new THREE.MeshStandardMaterial({color:0xe5b724,roughness:.6}));
 mesh(coil([.30,.345,.46],[.34,.345,.26],{turns:11,radius:.013,wire:.004}),m.shell,[0,0,0]);
 const radio=new THREE.Group();radio.position.set(.38,.33,.58);radio.rotation.y=.35;kit.root.add(radio);
 box([0,0,0],[.12,.03,.056],m.shell,radio);box([-.035,.016,0],[.04,.002,.04],m.plastic,radio);
 mesh(new THREE.CylinderGeometry(.006,.008,.07,12).rotateZ(Math.PI/2),m.shell,[.095,.004,.012],radio);
 for(const z of [-.012,-.004,.004])mesh(new THREE.SphereGeometry(.0022,8,6),new THREE.MeshBasicMaterial({color:0xffa31a}),[.055,.016,z],radio);
 // Worn-through patch of paint on the passenger floor.
 const worn=mesh(new THREE.PlaneGeometry(.24,.17),new THREE.MeshStandardMaterial({map:canvasTexture(256,192,(ctx,w,h)=>{ctx.clearRect(0,0,w,h);ctx.fillStyle='#c49a6c';ctx.beginPath();for(let i=0;i<=24;i++){const a=i/24*Math.PI*2,r=.42+Math.sin(i*2.7)*.05+Math.cos(i*1.3)*.04;ctx.lineTo(w/2+Math.cos(a)*w*r,h/2+Math.sin(a)*h*r);}ctx.fill();for(let i=0;i<60;i++){ctx.fillStyle=`rgba(120,96,64,${Math.random()*.5})`;ctx.fillRect(Math.random()*w,Math.random()*h,4,4);}}),transparent:true,alphaTest:.1,roughness:.9,polygonOffset:true,polygonOffsetFactor:-2}),[-.28,.3106,.55]);
 worn.rotation.set(-Math.PI/2,0,.4);worn.castShadow=false;
 // Scrutineering seal on the passenger door bar, and the copper brake line on the sill.
 const seal=new THREE.Group();seal.position.set(.16,.70,.672);kit.root.add(seal);
 box([0,0,0],[.028,.022,.016],new THREE.MeshStandardMaterial({color:0xd0202a,roughness:.5}),seal);
 mesh(new THREE.TorusGeometry(.03,.0015,6,20).rotateY(Math.PI/2),m.whitePiping,[0,.01,.028],seal);
 // Parts crossing the V06 cage or sills belong to the classic interior only (kit.classic).
 mesh(tube([[.745,.47,.705],[.70,.40,.695],[.62,.393,.69],[-.62,.393,.69],[-.95,.36,.70]],.0035),m.copper,[0,0,0],kit.classic);
 for(const side of [-1,1])bar([.62,.36,side*.69],[-.62,.36,side*.69],.028,m.cage,kit.classic); // sill tubes of the cage
 // Black two-slot holder at the front of the carbon plate (carro_35).
 for(const z of [.36,.39,.42])box([.47,.335,z],[.05,.045,.012],m.shell);
 box([.47,.318,.39],[.05,.012,.075],m.shell);
}

// Battery master key where the handbrake used to be (carro_28): carbon plate on the
// tunnel beside the seat, red rotary key and a small toggle.
export function buildKeyPanel(kit){
 const {mesh,box,m}=kit;
 const plate=new THREE.Group();plate.name='Chave_geral';plate.position.set(-.06,.442,-.05);plate.rotation.x=-.62;kit.root.add(plate);
 mesh(kit.cushion(.20,.12,.003,.015,.001).rotateX(Math.PI/2),m.twill,[0,0,0],plate);
 mesh(new THREE.CylinderGeometry(.006,.006,.001,16),new THREE.MeshBasicMaterial({color:0x050505}),[.07,.0025,.02],plate);
 const head=new THREE.MeshStandardMaterial({color:0xb8453a,roughness:.45}),blade=new THREE.MeshStandardMaterial({color:0xe8866a,roughness:.4});
 mesh(new THREE.CylinderGeometry(.019,.02,.012,28),m.shell,[-.02,.008,0],plate);
 mesh(new THREE.CylinderGeometry(.0145,.0145,.018,24),head,[-.02,.022,0],plate);
 box([-.02,.05,0],[.011,.058,.005],blade,plate);
 box([-.05,.009,-.025],[.012,.008,.012],m.shell,plate);
 mesh(new THREE.CylinderGeometry(.0018,.0018,.014,8),kit.chrome,[-.05,.018,-.025],plate);
}

// "EDU / STEVAN 99" on the passenger half of the windscreen (photos 14, 15).
export function buildWindscreenNumber(kit){
 const o=kit.mesh(new THREE.PlaneGeometry(.66,.495),new THREE.MeshBasicMaterial({map:windscreenNumber(),transparent:true,depthWrite:false,toneMapped:false,opacity:.9}),[.645,1.08,.40],kit.classic);
 // Inner face of the raked glass: normal back and down toward the cabin.
 o.rotation.order='YXZ';o.rotation.set(.85,-Math.PI/2,0);o.castShadow=false;o.renderOrder=2;
 return o;
}

// Driver's footwell (carro_24, 25, 29): pedal box, reservoirs, wiring and the coiled
// push-to-talk cord hanging under the instrument plate.
export function buildDriverFootwell(kit){
 const {mesh,box,bar,m}=kit;
 box([.765,.735,-.36],[.09,.06,.30],m.plastic);
 for(const z of [-.46,-.35])mesh(new THREE.CylinderGeometry(.017,.017,.11,16).rotateZ(Math.PI/2),kit.silver,[.79,.745,z]);
 const beige=new THREE.MeshStandardMaterial({color:0xe6d6a8,roughness:.5});
 for(const z of [-.57,-.63]){mesh(new THREE.CylinderGeometry(.022,.022,.04,20),beige,[.68,.83,z],kit.classic);mesh(new THREE.CylinderGeometry(.024,.024,.036,20),m.shell,[.68,.858,z],kit.classic);}
 mesh(coil([.58,.78,-.53],[.57,.58,-.55],{turns:18,radius:.006,wire:.0015}),m.shell,[0,0,0]);
 mesh(tube([[.57,.58,-.55],[.60,.45,-.66],[.62,.33,-.70]],.0015),m.shell,[0,0,0],kit.classic);
 // Corrugated conduit down to the left footwell, a black box and a braided line.
 const conduit=tube([[.66,.80,-.40],[.60,.70,-.47],[.56,.52,-.56],[.55,.34,-.62]],.017),cp=conduit.attributes.position,cn=conduit.attributes.normal;
 for(let i=0;i<cp.count;i++){const k=1+.12*Math.sin(Math.floor(i/9)*1.9);cp.setXYZ(i,cp.getX(i)+cn.getX(i)*.002*k,cp.getY(i)+cn.getY(i)*.002*k,cp.getZ(i)+cn.getZ(i)*.002*k);}
 mesh(conduit,m.rubber,[0,0,0]);
 box([.64,.81,-.49],[.06,.05,.07],m.shell);
 mesh(tube([[.74,.72,-.50],[.66,.58,-.62],[.62,.48,-.70],[.68,.44,-.71],[.72,.58,-.70]],.004),kit.silver,[0,0,0],kit.classic);
 mesh(tube([[.52,.60,-.52],[.58,.45,-.58],[.60,.33,-.60]],.0025),m.plastic,[0,0,0]);
 for(const [a,b,c] of [[[.56,.77,-.45],[.48,.55,-.47],[.52,.33,-.50]],[[.58,.78,-.28],[.50,.62,-.30],[.46,.34,-.29]],[[.55,.76,-.15],[.47,.55,-.12],[.40,.33,-.10]]])mesh(tube([a,b,c],.003),m.plastic,[0,0,0]);
 // Aluminium kick panel beside the foot rest.
 box([.60,.50,-.728],[.34,.40,.008],m.aluminium,kit.classic);
}
