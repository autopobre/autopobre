import * as THREE from 'three';

// A flying saucer over Minas Gerais's circuits at night (user, 2026-10-20: "Nos autódromos de MG, quando a corrida for
// de noite, de vez em quando faça passar um disco voador no céu com luzes bem chamativas!! Mas tem que ser um evento
// raro e só de noite!! Não tão raro que ninguém nunca veja, mas raro o suficiente pra não ser toda corrida. e o disco
// voador tem que passar e ir embora"). Every circuit whose label ends in ", MG" (circuits.js: Curvelo, the Pampulha).
// - When: once per race at most, at a random moment of the racing itself (saucerMoment: from 12 s after the green to
//   well before the flag), and only if the race is at night then (setNight: weather.js noite, rain or not). Then the
//   dice: about one night race in three (SAUCER_ODDS: unlikely right after a sighting, likelier with every night race
//   without one, certain at the fifth), remembered in localStorage across the MG circuits and visits. ?ovni=1 in the
//   address sends it in every night race, a few seconds after the green (to show it to someone).
// - The flight (saucerFlight, SAUCER_TIME seconds, in the frame of the player's view): its lights flick on high up to
//   one side, it swoops down in front of the car and brakes, hovers far off, about 750 m away and 4–5° over the horizon (lower
//   seen from the cockpit, under the windscreen's sun strip), hops across the view in jerks, shines its beam down, then tilts, shoots off up and away
//   on the other side and blinks out. The frame follows the camera (its heading slowly), so a corner does not lose it.
// - Drawing: hull and dome (lathes, basic materials: no lights, no fog), 24 rim bulbs chasing colours round
//   (instanced), the glowing ring underneath, the halos (one draw of view-facing quads) and the beam (an additive
//   cone). Built with the circuit and hidden until it flies, so its programs compile with the circuit's (no hitch).

export const hasFlyingSaucer=circuit=>/,\s*MG$/.test(circuit?.label??'');
export const SAUCER_STORE='opala99-disco-voador-v1';
// The chance in a night race on an MG circuit, by the night races since the last sighting there (0: the one before had it).
export const SAUCER_ODDS=Object.freeze([.15,.25,.35,.5,1]);

// The moment of the race it may come: seconds of racing (not counting pauses, the countdown, the intro). raceSeconds:
// about how long the race lasts (laps × length at 40 m/s), so a short race (one lap of Curvelo) still has it before
// the flag: from 12 s after the green (sooner in a short one) to past half the race, at most four minutes in.
export function saucerMoment(raceSeconds,random=Math.random,forced=false){
 if(forced)return 6+random()*4;
 const expected=Number.isFinite(raceSeconds)&&raceSeconds>0?raceSeconds:600;
 return Math.min(12,expected*.25)+random()*Math.min(240,expected*.55);
}
// The dice of one night race: whether it flies, and the memory after it.
export function saucerDraw(memory,random=Math.random,forced=false){
 const count=v=>Number.isInteger(v)&&v>=0?v:0,missed=count(memory?.missed),odds=forced?1:SAUCER_ODDS[Math.min(missed,SAUCER_ODDS.length-1)],fly=random()<odds;
 return {fly,odds,memory:{missed:fly?0:missed+1,seen:count(memory?.seen)+(fly?1:0),nights:count(memory?.nights)+1}};
}

// The flight, key by key: [time s, bearing ° from the view's heading (+ toward the side it comes from), distance over
// the ground m, elevation ° over the eye's horizon, easing to the next key]. While it hangs there it keeps within 25°
// of the middle (the race's panels fill the picture's top corners, the map on the left from the top down to the horizon),
// far off and low over the horizon (user, 2026-10-20: "aparecer lá mais longe mais pro horizonte"). From inside the car
// (low: SAUCER_LOW) every elevation is scaled down a little more: the windscreen's sun strip hides the sky from about
// 6.5° up.
const KEYS=[[0,62,1500,14,'out'],[3,24,780,4.8,'lin'],[4.4,21,770,4.6,'inout'],[5,7,750,4,'lin'],[8.6,4,740,4.2,'inout'],
 [9.1,-12,730,4.8,'lin'],[11.6,-19,760,5,'lin'],[12.4,-21,780,5.4,'in'],[14.6,-55,1450,22,null]];
export const SAUCER_LOW=.8;
export const SAUCER_TIME=KEYS[KEYS.length-1][0];
export const SAUCER_BEAM=Object.freeze([5.6,8.3]),SAUCER_DEPART=12.4;
const EASE={lin:u=>u,out:u=>1-(1-u)**3,inout:u=>u*u*(3-2*u),in:u=>u**3};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// Where it is t seconds into its flight (side 1: comes from the right, leaves to the left; -1 the other way round) and
// how it shines: light (0 dark, 1 lit, up to 3 in the last flash), beam (0..1), chase (how fast the bulbs run round),
// spin (rad/s). low: the elevations' scale (1 outside the car, SAUCER_LOW from the cockpit). null once it has gone.
export function saucerFlight(t,side=1,low=1){
 if(!(t>=0)||t>=SAUCER_TIME)return null;
 let i=0;while(i<KEYS.length-2&&t>=KEYS[i+1][0])i++;
 const a=KEYS[i],b=KEYS[i+1],u=EASE[a[4]]((t-a[0])/(b[0]-a[0])),lerp=k=>a[k]+(b[k]-a[k])*u;
 // Never quite still while it hangs there: a slow sway and bob of its own.
 const hover=Math.min(1,t/3)*(t<SAUCER_DEPART?1:Math.max(0,1-(t-SAUCER_DEPART)));
 const bearing=(lerp(1)+hover*1.2*Math.sin(t*1.7))*side*Math.PI/180,distance=lerp(2);
 const height=distance*Math.tan(lerp(3)*low*Math.PI/180)+hover*(1.6*Math.sin(t*2.3)+.8*Math.sin(t*3.7+1.3));
 // The lights flick on (on, off, on, off, then up to full); the last flash as it blinks out.
 let light=t<.3?[1,0,.9,.1][Math.floor(t/.075)]:Math.min(1,.4+(t-.3)*4);
 const left=SAUCER_TIME-t;if(left<.45)light=left>.25?1+(.45-left)*10:3*left/.25;
 const beam=clamp((t-SAUCER_BEAM[0])/.35,0,1)*clamp((SAUCER_BEAM[1]-t)/.35,0,1);
 return {bearing,distance,height,light,beam,chase:t<SAUCER_DEPART-.8?1:3,spin:t<3?3-t*.73:t<SAUCER_DEPART?.8:.8+(t-SAUCER_DEPART)*2.5};
}

// The bulbs' colours (linear), chasing round the rim. All its lights a third dimmer than first built (user, 2026-10-20:
// "brilhar um pouco menos").
const PALETTE=[[1,.06,.04],[1,.42,.02],[.1,1,.14],[.04,.85,1],[.14,.24,1],[1,.08,.85]].map(c=>new THREE.Color(...c));
const BULBS=24,RIM=20.9,BULB_GLOW=9,SIZE=1.15,DOME=new THREE.Color(.22,1,.5),RING=new THREE.Color(.5,.85,1),BEAM_TINT=new THREE.Color(.35,1,.6);
// Additive light that keeps the picture's alpha (cinematic.js reads it as the occlusion mask), as floodlights.js.
const GLOW_BLEND={transparent:true,depthWrite:false,fog:false,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor};
const haloVertex=`attribute vec3 centre;attribute vec2 corner;attribute float size;attribute vec3 tint;varying vec2 vCorner;varying vec3 vTint;
void main(){vCorner=corner;vTint=tint;vec4 view=modelViewMatrix*vec4(centre,1.0);view.xy+=corner*size;gl_Position=projectionMatrix*view;}`;
const haloFragment=`uniform float strength;varying vec2 vCorner;varying vec3 vTint;
void main(){float r2=dot(vCorner,vCorner);if(r2>1.0)discard;gl_FragColor=vec4(vTint*strength*(exp(-r2*14.0)+exp(-r2*3.5)*.18),1.0);}`;
const beamVertex=`varying float vDown;varying vec3 vNormal,vView;
void main(){vDown=1.0-uv.y;vec4 view=modelViewMatrix*vec4(position,1.0);vNormal=normalize(normalMatrix*normal);vView=normalize(-view.xyz);gl_Position=projectionMatrix*view;}`;
const beamFragment=`uniform float strength,time;uniform vec3 tint;varying float vDown;varying vec3 vNormal,vView;
void main(){float facing=abs(dot(normalize(vNormal),normalize(vView))),rings=.62+.38*sin(vDown*42.0-time*7.0);
 gl_FragColor=vec4(tint*strength*pow(1.0-vDown,1.7)*rings*(.2+.8*facing),1.0);}`;

// Memory of the dice (kept for the session even where localStorage throws).
let memory=null;
function remembered(storage){
 if(memory)return memory;let m=null;try{m=JSON.parse(storage?.getItem(SAUCER_STORE)??'null');}catch{}
 return memory=m&&typeof m==='object'?m:{};
}
function keep(storage,m){memory=m;try{storage?.setItem(SAUCER_STORE,JSON.stringify(m));}catch{}}

export const flyingSaucer={current:null};
// options: mobile; sound(name, options): an effect (car-audio.js); racing(): the race is on (the clock runs);
// raceSeconds(): about how long it lasts; inside(): the view is the cockpit's (it flies lower); random; storage;
// forced (?ovni=1).
export function createFlyingSaucer(options={}){
 const {mobile=false,sound=()=>{},racing=()=>true,raceSeconds=()=>null,inside=()=>false,random=Math.random,storage=globalThis.localStorage}=options;
 const forced=options.forced??/[?&]ovni=1(&|$)/.test(globalThis.location?.search??'');
 const root=new THREE.Group();root.name='Disco_voador';root.visible=false;
 // Not in the cars' reflection captures (main.js reflectionHide): a probe would freeze it in the paint.
 root.userData.noReflection=true;
 const tilt=new THREE.Group(),spinner=new THREE.Group();root.add(tilt);tilt.add(spinner);tilt.scale.setScalar(SIZE);
 // The hull: dark steel on top, brighter toward the rim where the bulbs light it; underneath it catches the ring's glow.
 const seg=mobile?32:56;
 const lathe=(profile,shade)=>{const g=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),seg),p=g.attributes.position,c=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++){const r=Math.hypot(p.getX(i),p.getZ(i)),k=shade(r);c.set([k*.8,k*.9,k],i*3);}g.setAttribute('color',new THREE.BufferAttribute(c,3));return g;};
 const rim=r=>clamp((r-12)/(RIM-12),0,1);
 const upperMaterial=new THREE.MeshBasicMaterial({name:'Disco_casco',vertexColors:true,fog:false,side:THREE.DoubleSide});
 const lowerMaterial=new THREE.MeshBasicMaterial({name:'Disco_casco_baixo',vertexColors:true,fog:false,side:THREE.DoubleSide});
 const upper=new THREE.Mesh(lathe([[20.6,0],[20,.32],[17,1.05],[13,1.9],[9.5,2.6],[7.4,2.9],[0,2.95]],r=>.025+.06*rim(r)**2),upperMaterial);
 const lower=new THREE.Mesh(lathe([[0,-3.4],[5,-3.25],[10,-2.6],[14.5,-1.7],[18,-.8],[20,-.15],[20.6,0]],r=>.11-.07*rim(r)),lowerMaterial);
 const domeMaterial=new THREE.MeshBasicMaterial({name:'Disco_cupula',fog:false});
 const dome=new THREE.Mesh(new THREE.SphereGeometry(7.2,mobile?20:28,mobile?8:12,0,Math.PI*2,0,Math.PI/2),domeMaterial);dome.position.y=2.6;dome.scale.y=.85;
 const ringMaterial=new THREE.MeshBasicMaterial({name:'Disco_anel',fog:false});
 const ring=new THREE.Mesh(new THREE.TorusGeometry(9.5,1.3,8,mobile?32:48).rotateX(Math.PI/2),ringMaterial);ring.position.y=-3.05;
 const core=new THREE.Mesh(new THREE.CircleGeometry(6.2,32).rotateX(Math.PI/2),ringMaterial);core.position.y=-3.36;
 const bulbs=new THREE.InstancedMesh(new THREE.SphereGeometry(1.5,10,6),new THREE.MeshBasicMaterial({name:'Disco_lampadas',fog:false}),BULBS);
 const at=new THREE.Matrix4(),bulbAt=[];
 for(let i=0;i<BULBS;i++){const a=i/BULBS*Math.PI*2,p=new THREE.Vector3(Math.cos(a)*RIM,.05,Math.sin(a)*RIM);bulbAt.push(p);bulbs.setMatrixAt(i,at.makeTranslation(p.x,p.y,p.z));bulbs.setColorAt(i,PALETTE[i%PALETTE.length]);}
 // The halos: one quad per bulb, the dome's, the ring's and a wide faint aura round the whole saucer.
 const halos=[...bulbAt.map(p=>[p,8]),[new THREE.Vector3(0,4.2,0),18],[new THREE.Vector3(0,-4.5,0),20],[new THREE.Vector3(0,0,0),85]];
 const quad=[[-1,-1],[1,-1],[1,1],[-1,1]],n=halos.length,centre=new Float32Array(n*12),corner=new Float32Array(n*8),size=new Float32Array(n*4),tint=new Float32Array(n*12),index=[];
 halos.forEach(([p,s],h)=>{for(let k=0;k<4;k++){centre.set([p.x,p.y,p.z],(h*4+k)*3);corner.set(quad[k],(h*4+k)*2);size[h*4+k]=s;}index.push(h*4,h*4+1,h*4+2,h*4,h*4+2,h*4+3);});
 const haloGeometry=new THREE.BufferGeometry();haloGeometry.setIndex(index);
 haloGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*12),3));haloGeometry.setAttribute('centre',new THREE.BufferAttribute(centre,3));
 haloGeometry.setAttribute('corner',new THREE.BufferAttribute(corner,2));haloGeometry.setAttribute('size',new THREE.BufferAttribute(size,1));
 const tints=new THREE.BufferAttribute(tint,3);tints.setUsage(THREE.DynamicDrawUsage);haloGeometry.setAttribute('tint',tints);
 const haloMaterial=new THREE.ShaderMaterial({name:'Disco_halos',vertexShader:haloVertex,fragmentShader:haloFragment,uniforms:{strength:{value:1}},...GLOW_BLEND});
 const halo=new THREE.Mesh(haloGeometry,haloMaterial);halo.frustumCulled=false;halo.renderOrder=4;
 // The beam: an open cone hanging from the ring, brightest at the top, rings of light running down it.
 const beamMaterial=new THREE.ShaderMaterial({name:'Disco_feixe',vertexShader:beamVertex,fragmentShader:beamFragment,uniforms:{strength:{value:0},time:{value:0},tint:{value:BEAM_TINT.clone().multiplyScalar(.8)}},side:THREE.DoubleSide,...GLOW_BLEND});
 const beam=new THREE.Mesh(new THREE.CylinderGeometry(4.5,30,120,mobile?20:32,1,true).translate(0,-63.3,0),beamMaterial);beam.frustumCulled=false;beam.renderOrder=3;beam.visible=false;
 spinner.add(upper,lower,dome,ring,core,bulbs,halo);tilt.add(beam);
 for(const o of [upper,lower,dome,ring,core,bulbs])o.frustumCulled=false;

 // The frame it flies in: where the eye has been (eased, so a camera cut glides) and where it looks (slowly).
 const anchor=new THREE.Vector3(),look=new THREE.Vector3(),last=new THREE.Vector3(),velocity=new THREE.Vector3(),move=new THREE.Vector3(),axis=new THREE.Vector3(),turn=new THREE.Quaternion(),colour=new THREE.Color();
 let heading=0,low=1,camera=null,night=false,clock=0,moment=saucerMoment(raceSeconds(),random,forced),state='waiting',flight=null;
 const stats={state,night,clock:0,at:+moment.toFixed(1),forced,flights:0,launches:[],memory:remembered(storage)};
 function follow(cam,dt,snap){
  cam.getWorldDirection(look);const flat=Math.hypot(look.x,look.z)>.05,h=Math.atan2(look.x,-look.z);
  if(snap){anchor.copy(cam.position);if(flat)heading=h;return;}
  anchor.lerp(cam.position,1-Math.exp(-dt*2));if(flat)heading+=Math.atan2(Math.sin(h-heading),Math.cos(h-heading))*(1-Math.exp(-dt*.45));
 }
 function place(f,dt,first){
  const a=heading+f.bearing;root.position.set(anchor.x+Math.sin(a)*f.distance,anchor.y+f.height,anchor.z-Math.cos(a)*f.distance);
  // Leaning into its motion (its top toward where it goes), as hard as it moves, with a little wobble.
  if(first||!(dt>0)){velocity.set(0,0,0);last.copy(root.position);}
  else{move.subVectors(root.position,last).divideScalar(dt);last.copy(root.position);velocity.lerp(move.setY(0),1-Math.exp(-dt*4));}
  const speed=velocity.length();axis.set(velocity.z,0,-velocity.x);
  if(speed>1e-3)tilt.quaternion.setFromAxisAngle(axis.normalize(),Math.min(.42,speed*.0022));else tilt.quaternion.identity();
  turn.setFromAxisAngle(axis.set(1,0,0),.05*Math.sin(flight.t*2.9));tilt.quaternion.multiply(turn);
  spinner.rotation.y+=f.spin*dt;
  // The bulbs run round the rim in the palette's colours, every other one lit; the dome and the ring breathe.
  const t=flight.t,step=Math.floor(t*f.chase*5),k=f.light;
  for(let i=0;i<BULBS;i++){colour.copy(PALETTE[(i+step)%PALETTE.length]).multiplyScalar(((i+step)%2?.12:1)*BULB_GLOW*k);bulbs.setColorAt(i,colour);tint.set([colour.r*.065,colour.g*.065,colour.b*.065],i*12);for(let q=1;q<4;q++)tint.copyWithin(i*12+q*3,i*12,i*12+3);}
  bulbs.instanceColor.needsUpdate=true;
  const domeGlow=(1.1+.45*Math.sin(t*3.1))*k,ringGlow=(2.1+.9*Math.sin(t*5.3))*k*(1+f.beam*.6);
  domeMaterial.color.copy(DOME).multiplyScalar(domeGlow);ringMaterial.color.copy(RING).multiplyScalar(ringGlow);lowerMaterial.color.setScalar(1+ringGlow*.12);upperMaterial.color.setScalar(.6+.4*Math.min(k,1));
  const glow=(h,c,s)=>{for(let q=0;q<4;q++)tint.set([c.r*s,c.g*s,c.b*s],(h*4+q)*3);};
  glow(BULBS,DOME,domeGlow*.1);glow(BULBS+1,RING,ringGlow*.06);glow(BULBS+2,DOME,.02*k+.02*f.beam);tints.needsUpdate=true;
  beam.visible=f.beam>0;beamMaterial.uniforms.strength.value=f.beam*Math.min(k,1);beamMaterial.uniforms.time.value=t;
 }
 const pan=()=>clamp(Math.sin(saucerFlight(flight?.t??0,flight?.side??1)?.bearing??0)*.8,-.8,.8);
 // From the cockpit it flies lower (SAUCER_LOW), eased when the view changes.
 function launch(cam=camera){
  if(!cam||!night)return false;
  flight={t:0,side:random()<.5?1:-1};state='flying';follow(cam,0,true);low=inside()?SAUCER_LOW:1;spinner.rotation.y=random()*Math.PI*2;root.visible=true;
  place(saucerFlight(0,flight.side,low),0,true);stats.flights++;stats.launches=[...stats.launches,{at:+clock.toFixed(1),side:flight.side}].slice(-8);
  sound('ovniChega',{pan:flight.side*.6});return true;
 }
 function land(next='done'){flight=null;root.visible=false;beam.visible=false;state=next;}
 function decide(cam){
  const draw=saucerDraw(remembered(storage),random,forced);keep(storage,draw.memory);stats.memory=draw.memory;stats.odds=draw.odds;
  if(!draw.fly||!launch(cam))state='skipped';
 }
 function update(dt,cam){
  if(cam)camera=cam;
  if(flight){
   // Daylight back (Y on the track) and it is simply not there.
   if(!night){land();return;}
   // Paused: it hangs where it is, as it was.
   if(!(dt>0))return;
   const before=flight.t;flight.t+=dt;follow(camera,dt,false);low+=((inside()?SAUCER_LOW:1)-low)*(1-Math.exp(-dt*3));
   const f=saucerFlight(flight.t,flight.side,low);if(!f){land();return;}
   const crossed=t=>before<t&&flight.t>=t;
   if(crossed(SAUCER_BEAM[0]))sound('ovniFeixe',{pan:pan()});
   if(crossed(SAUCER_DEPART))sound('ovniParte',{pan:pan()});
   place(f,dt,false);
  }else if(state==='waiting'&&dt>0&&racing()){clock+=dt;if(clock>=moment&&night&&camera)decide(camera);}
  stats.state=state;stats.clock=+clock.toFixed(1);
 }
 const extra={root,stats,
  // weather.js through main.js applyWeather: 1 at night, .45 at dusk, 0 by day.
  setNight(k){night=k>=.99;stats.night=night;if(!night&&flight)land();},
  // Every race (main.js beginRace: a race, a restart, a championship round) has its own moment and its own dice.
  newRace(){if(flight)land();clock=0;moment=saucerMoment(raceSeconds(),random,forced);state='waiting';stats.at=+moment.toFixed(1);stats.state=state;},
  update,
  dispose(){root.traverse(o=>{o.geometry?.dispose();o.material?.dispose?.();});}};
 // For the checks: send it now (at night), see where it is, which way it looks and what it shows.
 flyingSaucer.current={...extra,launch:()=>launch(),land:()=>land(),
  info:()=>({...stats,memory:{...stats.memory},flying:!!flight,t:flight?+flight.t.toFixed(2):null,side:flight?.side??null,visible:root.visible,beam:beam.visible,
   low:+low.toFixed(2),position:root.position.toArray().map(v=>+v.toFixed(1)),anchor:anchor.toArray().map(v=>+v.toFixed(1)),heading:+heading.toFixed(3),
   // Where it shows in the last camera's picture (-1..1 both ways; front: before the camera) and its height over the eye.
   screen:camera&&root.visible?(v=>({x:+v.x.toFixed(3),y:+v.y.toFixed(3),front:v.z<1}))(root.position.clone().project(camera)):null,
   elevation:camera&&root.visible?+(Math.atan2(root.position.y-camera.position.y,Math.hypot(root.position.x-camera.position.x,root.position.z-camera.position.z))*180/Math.PI).toFixed(1):null})};
 return extra;
}
