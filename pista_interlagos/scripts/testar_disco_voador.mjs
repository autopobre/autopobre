// O disco voador dos autódromos de MG à noite (flying-saucer.js): só nos circuitos de Minas, só de noite, raro mas
// não raríssimo (cerca de uma corrida noturna em três, nunca mais de quatro seguidas sem ele), num momento da corrida
// antes da bandeirada, e o voo: chega de um lado, passa na frente da vista abaixo da linha do teto, liga o feixe, vai
// embora pelo outro lado e some, sempre dentro do alcance da câmera.
//   node scripts/testar_disco_voador.mjs
import assert from 'node:assert/strict';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {CIRCUITS} from '../teste/circuits.js';
import {EFFECT_NAMES} from '../teste/sound-effects.js';
import {VIEW_DISTANCES} from '../teste/graphics-settings.js';
import {hasFlyingSaucer,saucerDraw,saucerMoment,saucerFlight,createFlyingSaucer,flyingSaucer,SAUCER_ODDS,SAUCER_TIME,SAUCER_BEAM,SAUCER_DEPART,SAUCER_LOW} from '../teste/flying-saucer.js';

function seeded(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
const deg=r=>r*180/Math.PI;

// Só Minas Gerais: Curvelo e a Pampulha hoje.
assert.deepEqual(Object.keys(CIRCUITS).filter(id=>hasFlyingSaucer(CIRCUITS[id])),['curvelo','pampulha'],'only the MG circuits');
assert(!hasFlyingSaucer(null)&&!hasFlyingSaucer({label:'AUTÓDROMO X · BELO HORIZONTE, MGX'}),'nothing else');

// A raridade: o sorteio de cada corrida noturna com a memória das anteriores.
{
 const random=seeded(7);let memory={},seen=0,gap=0,longest=0,twice=0,last=false;const N=20000;
 for(let i=0;i<N;i++){const d=saucerDraw(memory,random);memory=d.memory;if(d.fly){seen++;if(last)twice++;gap=0;}else longest=Math.max(longest,++gap);last=d.fly;}
 const rate=seen/N;console.log(`em ${N} corridas noturnas: ${(rate*100).toFixed(1)}% com disco, maior seca ${longest}, duas seguidas ${(twice/seen*100).toFixed(1)}% das vezes`);
 assert(rate>.27&&rate<.38,`about one night race in three (${rate})`);
 assert.equal(longest,SAUCER_ODDS.length-1,'never five night races in a row without it');
 assert(twice/seen<.2,'seldom twice running');
 assert.equal(memory.nights,N);assert.equal(memory.seen,seen);
 assert.equal(saucerDraw({missed:-3,seen:'x'},()=>.99).odds,SAUCER_ODDS[0],'a broken memory counts from scratch');
 assert(saucerDraw({},()=>.999,true).fly,'?ovni=1: every night race');
}

// O momento: depois da largada e bem antes da bandeirada, também numa volta só de Curvelo.
{
 const random=seeded(3);
 for(const [id,laps] of [['curvelo',3],['curvelo',1],['pampulha',1]]){
  const length=CIRCUITS[id].length*laps/40;let lo=1e9,hi=0;
  for(let i=0;i<5000;i++){const m=saucerMoment(length,random);lo=Math.min(lo,m);hi=Math.max(hi,m);}
  console.log(`${id} ${laps} volta(s), ~${length.toFixed(0)} s: entre ${lo.toFixed(1)} e ${hi.toFixed(1)} s de corrida`);
  assert(lo>=Math.min(12,length*.25)-1e-9,'after the start');assert(hi<length*.85,'well before the flag');
 }
 for(let i=0;i<200;i++){const m=saucerMoment(Infinity,random);assert(m>=12&&m<=252,'endless practice: within four minutes');}
 for(let i=0;i<200;i++){const m=saucerMoment(90,random,true);assert(m>=6&&m<=10,'?ovni=1: a few seconds after the green');}
}

// O voo, na moldura da vista (rumo 0 = para onde a câmera olha). De dentro do carro mais baixo: a faixa do para-sol
// esconde o céu de uns 6,5° para cima.
{
 const far=VIEW_DISTANCES.curta.far,half=deg(Math.atan(Math.tan(29*Math.PI/180)*16/9));
 for(const side of [1,-1]){
  let beamOn=0,maxRange=0,first=null,lastF=null,prev=null,jump=0,swing=0;
  for(let t=0;t<SAUCER_TIME;t+=1/60){
   const f=saucerFlight(t,side);assert(f,`flying at ${t.toFixed(2)} s`);
   for(const k of ['bearing','distance','height','light','beam','chase','spin'])assert(Number.isFinite(f[k]),`${k} at ${t.toFixed(2)}`);
   const range=Math.hypot(f.distance,f.height),elevation=deg(Math.atan2(f.height,f.distance)),bearing=deg(f.bearing);maxRange=Math.max(maxRange,range);
   if(t>=3&&t<=SAUCER_DEPART){
    assert(elevation>3.2&&elevation<6,`hovering ${elevation.toFixed(1)}° over the horizon at ${t.toFixed(2)} s: far off, low over the horizon`);
    const g=saucerFlight(t,side,SAUCER_LOW),inside=deg(Math.atan2(g.height,g.distance));
    assert(inside>2.5&&inside<5,`from the cockpit ${inside.toFixed(1)}° at ${t.toFixed(2)} s: in the windscreen, under the sun strip`);
    assert(f.distance>700&&f.distance<800,'far off, yet near enough to see its lights');
    assert(Math.abs(bearing)<25&&Math.abs(bearing)<half-15,`in the middle of the view, clear of the map (${bearing.toFixed(1)}°) at ${t.toFixed(2)} s`);
    assert(f.light>=.99&&f.light<=1.01,'fully lit while it passes');
   }
   if(f.beam>0){beamOn+=1/60;assert(t>SAUCER_BEAM[0]&&t<SAUCER_BEAM[1],'the beam only in its window');}
   // How fast it hops while it hangs ahead (m/s), and how fast it sweeps across the view as it swoops in (°/s).
   if(prev&&t<SAUCER_DEPART){const p=a=>[Math.sin(a.bearing)*a.distance,a.height,Math.cos(a.bearing)*a.distance];const [a,b]=[p(prev),p(f)];if(t>=3)jump=Math.max(jump,Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])*60);
    const u=a.map(v=>v/Math.hypot(...a)),w=b.map(v=>v/Math.hypot(...b));if(t<3)swing=Math.max(swing,deg(Math.acos(Math.min(1,u[0]*w[0]+u[1]*w[1]+u[2]*w[2])))*60);}
   first??=f;lastF=f;prev=f;
  }
  assert(Math.sign(first.bearing)===side&&deg(Math.abs(first.bearing))>55,'comes in from its side, out of the middle of the view');
  assert(Math.sign(lastF.bearing)===-side&&deg(Math.abs(lastF.bearing))>50,'leaves by the other side');
  assert(deg(Math.atan2(lastF.height,lastF.distance))>20,'and up into the sky');
  assert(maxRange<far*.9,`always inside the shortest view distance (${maxRange.toFixed(0)} m of ${far})`);
  assert(beamOn>2,'the beam shines a couple of seconds');
  assert(jump<1000,`its hops are quick but not teleports (${jump.toFixed(0)} m/s)`);
  assert(swing<60,`the eye can follow it as it swoops in (${swing.toFixed(0)}°/s)`);
  assert.equal(saucerFlight(SAUCER_TIME,side),null,'gone at the end');assert.equal(saucerFlight(-1,side),null);
  assert(saucerFlight(SAUCER_TIME-.02,side).light<.3,'blinks out');assert(saucerFlight(.1,side).light===0,'its lights flick on');
  console.log(`lado ${side}: alcance máximo ${maxRange.toFixed(0)} m, feixe ${beamOn.toFixed(1)} s, salto mais rápido ${jump.toFixed(0)} m/s, varredura ${swing.toFixed(0)}°/s`);
 }
}

// O disco no jogo: o relógio da corrida, a noite, o sorteio guardado, os sons.
{
 for(const name of ['ovniChega','ovniFeixe','ovniParte'])assert(EFFECT_NAMES.includes(name),`${name} is a sound effect`);
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},sounds=[];let racing=true;
 const camera=new THREE.PerspectiveCamera(58,16/9,.1,1900);camera.position.set(100,5,-200);camera.lookAt(100,5,-300);camera.updateMatrixWorld();
 const make=forced=>createFlyingSaucer({storage,random:seeded(11),forced,racing:()=>racing,raceSeconds:()=>94,sound:(name)=>sounds.push(name)});
 const run=(saucer,seconds,dt=1/30)=>{for(let t=0;t<seconds;t+=dt)saucer.update(dt,camera);};
 // De dia nunca, nem o sorteio corre.
 let saucer=make(true);saucer.setNight(0);saucer.newRace();run(saucer,60);
 assert(!saucer.root.visible&&store.size===0&&sounds.length===0,'never by day, and the dice are not spent');
 // Ao entardecer também não.
 saucer.setNight(.45);run(saucer,10);assert(!saucer.root.visible&&store.size===0,'not at dusk either');
 // De noite: no momento sorteado; fora da corrida (pausa, grid, resultado) o relógio para.
 saucer.setNight(1);saucer.newRace();racing=false;run(saucer,30);assert.equal(saucer.stats.clock,0,'the clock waits for the race');
 racing=true;const at=saucer.stats.at;run(saucer,at-.2);assert(!saucer.root.visible,'not before its moment');
 run(saucer,.4);assert(saucer.root.visible&&saucer.stats.state==='flying','at its moment it comes');
 assert.deepEqual(sounds,['ovniChega']);
 const view=new THREE.Vector3();camera.getWorldDirection(view);
 run(saucer,4);const ahead=saucer.root.position.clone().sub(camera.position);
 assert(ahead.dot(view)>500&&ahead.y>35&&ahead.y<85,`in front of the car and over it (${ahead.toArray().map(v=>v.toFixed(0))})`);
 run(saucer,SAUCER_TIME);assert(!saucer.root.visible&&saucer.stats.state==='done','then gone for this race');
 assert.deepEqual(sounds,['ovniChega','ovniFeixe','ovniParte'],'its three sounds in turn');
 run(saucer,120);assert.equal(saucer.stats.flights,1,'once per race at most');
 assert.equal(JSON.parse(store.get('opala99-disco-voador-v1')).seen,1,'the sighting is remembered');
 // Uma corrida nova tem outro momento; o dia que volta no meio do voo o apaga.
 saucer.newRace();run(saucer,saucer.stats.at+3);assert(saucer.root.visible,'the next race may have it again');
 saucer.setNight(0);assert(!saucer.root.visible,'daylight (Y) and it is not there');
 // O gancho das verificações no navegador.
 assert.equal(flyingSaucer.current.info().flying,false);saucer.setNight(1);assert(flyingSaucer.current.launch(),'launch() at night');assert(flyingSaucer.current.info().visible);
 saucer.setNight(0);assert(!flyingSaucer.current.launch(),'launch() refuses the day');
 // Sem ?ovni=1: o sorteio de verdade, umas corridas noturnas até aparecer.
 store.clear();saucer=make(false);saucer.setNight(1);let races=0;
 for(;races<12&&!saucer.stats.flights;races++){saucer.newRace();run(saucer,saucer.stats.at+1,.25);}
 assert(saucer.stats.flights===1&&races<=5,`seen within five night races (${races})`);
 console.log(`sem ?ovni=1 apareceu na ${races}ª corrida noturna`);
 saucer.dispose();
}
console.log('disco voador: ok');
