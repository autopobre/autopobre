// Cascavel, ECPA Piracicaba, Chapecó, Brasília and Goiânia, rebuilt from open data (scripts/circuitos/), and the
// imaginary Chapada dos Sonhos on the real relief (gerar_chapada.py): geometry, relief, pit lane, scenery
// clearances and a full AI race on each; on the Chapada also the rim with no guardrail and a fall off it; on the
// Floripa street circuit (gerar_floripa.py) the walls by the asphalt and the bridge decks over the sea; on the
// Minhocão street circuit (gerar_minhocao.py) the elevated deck, the tunnel and the lap passing under itself; on the
// Pampulha street circuit (gerar_pampulha.py) the 20 km lap raced in one lap, the lake and the shared first block.
//   node scripts/testar_circuitos_abertos.mjs [cascavel|piracicaba|chapeco|brasilia|goiania|guaratiba|chapada|floripa|minhocao|pampulha]
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CIRCUITS,fixedLaps,raceLaps} from '../teste/circuits.js';
import {Championship,OLD_STOCK_2026} from '../teste/championship.js';
import {standardLaps} from '../teste/ai-records.js';
import {lakeCells} from '../teste/sea-water.js';
import {TestCar,recognitionInput,guardrailSections,guardrailClearance,onDeck,inTunnel} from '../teste/physics.js';
import {RaceField,pitRoute} from '../teste/race-field.js';
import {pitGeometry,locatePit,serviceSpot,garageBays,wallsNear} from '../teste/pit-lane.js';
import {standLayout,fitGround,sceneryBands,bandClearance,gantryPosts,wallUnderPost,POST_CLEARANCE} from '../teste/track-clearance.js';
import {billboardSpots,BOARD_CLEARANCE} from '../teste/track-surface.js';
import {trackFall} from '../teste/cliff-fall.js';

const only=process.argv[2];
const report={};
// Where the centre line crosses itself (segments that are not neighbours): lap distance and road height of both.
function selfCrossings(a){
 const n=a.length,X=a.map(p=>p[1]),Y=a.map(p=>p[2]),out=[];
 for(let i=0;i<n;i++){const i2=(i+1)%n,x1=X[i],y1=Y[i],x2=X[i2],y2=Y[i2];
  for(let j=i+2;j<n;j++){if(i===0&&j===n-1)continue;const j2=(j+1)%n,x3=X[j],y3=Y[j],x4=X[j2],y4=Y[j2];
   if(Math.max(x1,x2)<Math.min(x3,x4)||Math.max(x3,x4)<Math.min(x1,x2)||Math.max(y1,y2)<Math.min(y3,y4)||Math.max(y3,y4)<Math.min(y1,y2))continue;
   const d1=(x4-x3)*(y1-y3)-(y4-y3)*(x1-x3),d2=(x4-x3)*(y2-y3)-(y4-y3)*(x2-x3),d3=(x2-x1)*(y3-y1)-(y2-y1)*(x3-x1),d4=(x2-x1)*(y4-y1)-(y2-y1)*(x4-x1);
   if(!(d1*d2<0&&d3*d4<0))continue;const u=d1/(d1-d2),v=d3/(d3-d4);
   out.push({s:[a[i][0]+u*Math.hypot(x2-x1,y2-y1),a[j][0]+v*Math.hypot(x4-x3,y4-y3)],z:[a[i][3]+u*(a[i2][3]-a[i][3]),a[j][3]+v*(a[j2][3]-a[j][3])]});}}
 return out;
}
for(const id of ['cascavel','piracicaba','chapeco','brasilia','goiania','guaratiba','chapada','floripa','minhocao','pampulha']){
 if(only&&only!==id)continue;
 const circuit=CIRCUITS[id],data=JSON.parse(readFileSync(new URL(`../dados/pista_${id}.json`,import.meta.url)));
 data.meta.id=id;data.meta.name=circuit.name;
 const a=data.samples,n=a.length,L=data.meta.reconstructed_xy_m,out={};
 // --- Closed centre line, 2 m stations, the published sense of travel.
 let length=0,turn=0;
 for(let i=0;i<n;i++){
  const p=a[i],q=a[(i+1)%n];assert(p.every(Number.isFinite),`${id}: finite samples`);
  const span=Math.hypot(q[1]-p[1],q[2]-p[2]);assert(span>1.8&&span<2.2,`${id}: station spacing ${span}`);length+=span;
  turn+=Math.atan2(p[7]*q[8]-p[8]*q[7],p[7]*q[7]+p[8]*q[8]);
  assert(Math.abs(p[7]*p[9]+p[8]*p[10])<1e-3,'left vector is normal to the tangent');
  // (A street circuit takes its avenues whole: Pampulha's Carlos Luz and Antônio Carlos race 20 m wide.)
  assert(p[4]>=8.9&&p[4]<=(data.meta.street?20.1:16.2),`${id}: width ${p[4]}`);
 }
 assert(Math.abs(length-L)<1,`${id}: lap length`);
 // A lap that passes over itself (a viaduct over one of its own streets) crosses its own centre line: with one crossing
 // it turns round 0 or 2 times (a figure of eight, or a loop inside the lap); in general at most crossings + 1 times,
 // of the other parity (Whitney). Each crossing is on two levels: the upper stretch on a deck, 4 m and more over the
 // other. The sense of travel is the published one wherever the lap turns round.
 const crossings=selfCrossings(a),turns=Math.round(turn/(2*Math.PI));
 assert(Math.abs(turn-2*Math.PI*turns)<.05&&Math.abs(turns)<=crossings.length+1&&(Math.abs(turns)+crossings.length)%2===1,`${id}: closed loop (${crossings.length} crossings, ${(turn/2/Math.PI).toFixed(3)} turns)`);
 if(turns)assert.equal(Math.sign(turn),data.meta.direction==='horario'?-1:1,`${id}: sense of travel`);
 for(const c of crossings){const [up,low]=c.z[0]>c.z[1]?[c.s[0],c.s[1]]:[c.s[1],c.s[0]];assert(Math.abs(c.z[0]-c.z[1])>4&&onDeck(data,up)&&!onDeck(data,low),`${id}: the lap crosses itself on two levels at s=${c.s.map(s=>s.toFixed(0))} (${c.z.map(z=>z.toFixed(1))})`);}
 if(crossings.length)out.crossings=crossings.map(c=>({s:c.s.map(Math.round),dz:+Math.abs(c.z[0]-c.z[1]).toFixed(1)}));
 if(id==='piracicaba')assert(Math.abs(L-circuit.length)<15,'ECPA shows its measured length');
 else assert(Math.abs(data.meta.reconstructed_3d_m-circuit.length)<.5,`${id} matches the published length`);
 assert.equal(circuit.length,{cascavel:3058,piracicaba:1930,chapeco:4004,brasilia:5384,goiania:3835,guaratiba:4710,chapada:5153,floripa:4445,minhocao:4035,pampulha:20533}[id]);
 // Chapecó (opened 08/2026): the earthworks profile is calibrated to the published 18.5 m, and the
 // sections carry the official numbering (12 curves, curve 7 the long constant-radius sweep).
 if(id==='chapeco'){
  assert(Math.abs(data.meta.elevation_range_m-18.5)<.01,'Chapecó: published 18.5 m of relief');
  const names=new Set(data.meta.sections.map(([,name])=>name.split(' · ')[0]));
  for(let k=1;k<=12;k++)assert(names.has(`Curva ${k}`),`Chapecó: curve ${k} named`);
  assert(!names.has('Curva'),'Chapecó: every detected curve has its official number');
 }
 // Brasília (reopened 11/2025): 16 curves, the published widths (15 m on the start straight, 14 m
 // elsewhere), curve 1 banked at 5°, relief from the DF's 1 m terrain model.
 if(id==='brasilia'){
  const numbers=new Set(data.meta.sections.flatMap(([,name])=>[...name.split(' · ')[0].matchAll(/\d+/g)].map(m=>+m[0])));
  for(let k=1;k<=16;k++)assert(numbers.has(k),`Brasília: curve ${k} named`);
  assert(!data.meta.sections.some(([,name])=>name==='Curva'),'Brasília: every detected curve has its number');
  const widths=a.map(p=>p[4]);assert(Math.min(...widths)>=13.9&&Math.max(...widths)<=15.01,'Brasília: published widths');
  assert(Math.abs(a[0][4]-15)<.01,'Brasília: 15 m at the timing line');
  const c1=data.meta.sections.find(([,name])=>name.startsWith('Curva 1 '))[0],turn1=a.filter(p=>p[0]>c1&&p[0]<c1+150).map(p=>p[5]);
  assert(Math.abs(Math.max(...turn1)-Math.tan(5*Math.PI/180))<.002,'Brasília: curve 1 banked at 5°');
  assert(data.meta.elevation_check.mdt_local_menos_anadem_p95_abs_m<3,'Brasília: the DF terrain model agrees with ANADEM');
  assert.equal(data.meta.direction,'horario');
 }
 // Goiânia (MotoGP 2026): 14 curves (9 right, 5 left), the widths of the 2025-26 renovation (15 m on the
 // main straight, 14 m elsewhere), the banked 13-14 before the 994 m straight, relief from the city's 5 m
 // contours, and the city's towers and the neighbourhoods' houses on the horizon.
 if(id==='goiania'){
  const numbers=new Set(data.meta.sections.flatMap(([,name])=>[...name.split(' · ')[0].matchAll(/\d+/g)].map(m=>+m[0])));
  for(let k=1;k<=14;k++)assert(numbers.has(k),`Goiânia: curve ${k} named`);
  assert(!data.meta.sections.some(([,name])=>name==='Curva'),'Goiânia: every detected curve has its number');
  const widths=a.map(p=>p[4]);assert(Math.min(...widths)>=13.9&&Math.max(...widths)<=15.01,'Goiânia: published widths');
  assert(Math.abs(a[0][4]-15)<.01,'Goiânia: 15 m at the timing line');
  const c13=data.meta.sections.find(([,name])=>name.startsWith('Curvas 13 e 14'))[0],banked=a.filter(p=>p[0]>c13+20&&p[0]<c13+120).map(p=>Math.abs(p[5]));
  assert(Math.max(...banked)>.055,'Goiânia: curves 13-14 banked');
  assert(data.meta.elevation_check.mdt_local_menos_anadem_p95_abs_m<3,'Goiânia: the contour model agrees with ANADEM');
  const kinds=data.scenery.skyline.items.reduce((m,it)=>(m[it[6]]=(m[it[6]]??0)+1,m),{});
  assert(kinds.predio>1000&&kinds.casa>3000,`Goiânia: city towers and houses on the horizon (${JSON.stringify(kinds)})`);
  assert(data.pit.reversed,'Goiânia: boxes on the right');
 }
 // Chapada dos Sonhos (imaginary, pedido #5): no guardrail anywhere; from curve 1 to the Curva da Volta the rim of the
 // wall runs 2 to 7 m off the left edge of the asphalt; a car driven over it falls, and is back at rest on the track
 // a few metres short of where it left, its lap out of the records.
 if(id==='chapada'){
  assert.deepEqual(data.meta.rails,{'-1':[],'1':[]},'Chapada: no guardrail');
  const probe=new TestCar(data),{track_from,track_to}=data.scenery.cliff;let near=0,minGap=Infinity,maxGap=0;
  for(let i=0;i<n;i++){
   const p=a[i];if(!(p[0]>=track_from+20&&p[0]<=track_to-20))continue;
   let gap=null;for(let d=0;d<12;d+=.1){const x=p[1]+p[9]*(p[4]/2+d),y=p[2]+p[10]*(p[4]/2+d);if(probe.cliff.query(x,y).d>0){gap=d;break;}}
   assert(gap!==null,`Chapada: rim beside s=${p[0]}`);minGap=Math.min(minGap,gap);maxGap=Math.max(maxGap,gap);near++;
  }
  assert(minGap>=1.9&&maxGap<=7.5,`Chapada: rim ${minGap.toFixed(1)}-${maxGap.toFixed(1)} m off the asphalt`);
  const k=Math.round(2200/(L/n));probe.reset(k);probe.heading+=.45;probe.vx=25*Math.cos(probe.heading);probe.vy=25*Math.sin(probe.heading);probe.stepX=probe.x;probe.stepY=probe.y;
  let fell=false,back=null,top=-Infinity;
  for(let s=0;s<120*12&&back===null;s++){probe.step({throttle:0,brake:0,left:0,right:0,reverse:0,handbrake:0},1/120);const e=trackFall(probe,1/120);if(e==='fall')fell=true;if(e==='back')back=s/120;top=Math.max(top,probe.z-a[probe.index][3]);}
  assert(fell&&back!==null&&back<10,`Chapada: the car falls and is back on the track (${back})`);
  assert(probe.lapFell&&!probe.surface.abyss&&probe.surface.onRoad&&top<3,'Chapada: back at rest on the asphalt, the lap out of the records');
  out.rim={stations:near,gap:[+minGap.toFixed(1),+maxGap.toFixed(1)],fallBack:+back.toFixed(1)};
 }
 // Floripa (imaginary street circuit on the real city): concrete walls a few decimetres off the asphalt on both sides
 // (open only for the pit lane), the start on the Hercílio Luz deck, and on the decks the road plane reaching out to
 // the walls 20 m and more above the sea; a car driven at the wall stays on the deck.
 if(id==='floripa'){
  // (The walls open only where a side street leads into a zone of the city open to roam, meta.roam: gerar_cidade_floripa.py.)
  const roamGaps=side=>(data.meta.roam?.zones??[]).flatMap(z=>z.gaps).filter(g=>g.side===side).map(g=>[g.s0,g.s1]).sort((p,q)=>p[0]-q[0]);
  const openLeft=roamGaps(1),wallLeft=[];{let from=0;for(const [g0,g1] of openLeft){wallLeft.push([from,g0]);from=g1;}wallLeft.push([from,L]);}
  assert.equal(data.meta.barrier,'street');assert.deepEqual(data.meta.rails['1'],wallLeft,'Floripa: wall all the way on the left (but for the roaming gaps)');
  for(const [g0,g1] of [...openLeft,...roamGaps(-1)])assert(g1-g0>8&&g1-g0<40,`Floripa: a roaming gap ${g0}-${g1} the width of a street`);
  for(let i=0;i<n;i+=5)for(const side of [-1,1]){const g=guardrailClearance(data,a[i][0],side);assert(g>.3&&g<8.5,`Floripa: wall gap ${g} at s=${a[i][0]}`);}
  assert(onDeck(data,0)&&onDeck(data,L-80),'Floripa: the line and the grid on the Hercílio Luz');
  const probe=new TestCar(data);let deckStations=0,high=0,maxAbove=0;
  for(let i=0;i<n;i++){const p=a[i];if(!onDeck(data,p[0]))continue;deckStations++;const d=p[4]/2+.2,x=p[1]+p[9]*d,y=p[2]+p[10]*d;probe.index=i;const s=probe.sample(x,y,i);assert(Math.abs(s.z-.055-(p[3]+p[5]*d))<.05,`Floripa: deck plane out to the wall at s=${p[0]}`);const above=p[3]-probe.terrain(p[1],p[2]);if(above>15)high++;maxAbove=Math.max(maxAbove,above);}
  assert(deckStations*2>1900&&high*2>1000&&maxAbove>30,`Floripa: ${deckStations*2} m of decks, ${high*2} m of them 15 m or more over the ground or the sea bed (${maxAbove.toFixed(1)} m at most)`);
  const k=Math.round(200/(L/n));probe.reset(k);probe.heading+=.6;probe.vx=25*Math.cos(probe.heading);probe.vy=25*Math.sin(probe.heading);probe.stepX=probe.x;probe.stepY=probe.y;
  const z0=probe.z;for(let s=0;s<120*3;s++)probe.step({throttle:0,brake:0,left:0,right:0,reverse:0,handbrake:0},1/120);
  assert(probe.z>z0-2&&probe.surface.onRoad!==undefined,`Floripa: the car stays on the deck (${z0.toFixed(1)} -> ${probe.z.toFixed(1)})`);
  out.street={decks:deckStations*2,highDecks:high*2,maxAboveGround:+maxAbove.toFixed(1),zAfterWall:+(probe.z-z0).toFixed(2)};
 }
 // Circuito do Minhocão (imaginary street circuit on São Paulo's Centro): walls on both sides (open only for the pit
 // lane), the line on Rua Major Sertório, the Minhocão (meta.decks) with the road plane out to the walls, the tunnel under
 // Praça Roosevelt (meta.tunnels) where the road never blends up into the plaza, and one grade-separated crossing:
 // Major Sertório runs under the deck the lap ran over ~1.4 km earlier.
 if(id==='minhocao'){
  assert.equal(data.meta.barrier,'street');assert.deepEqual(data.meta.rails['1'],[[0,L]],'Minhocão: wall all the way on the left');
  for(let i=0;i<n;i+=5)for(const side of [-1,1]){const g=guardrailClearance(data,a[i][0],side);assert(g>.3&&g<8.5,`Minhocão: wall gap ${g} at s=${a[i][0]}`);}
  assert(!onDeck(data,0)&&!inTunnel(data,0),'Minhocão: the line on the street');
  const span=r=>r.reduce((sum,[from,to])=>sum+(to>=from?to-from:L-from+to),0),decks=span(data.meta.decks),tunnels=span(data.meta.tunnels??[]);
  assert(decks>800&&tunnels>200,`Minhocão: ${decks.toFixed(0)} m on the structure, ${tunnels.toFixed(0)} m in the tunnel`);
  const crossings=selfCrossings(a);assert.equal(crossings.length,1,'Minhocão: the lap crosses itself once');
  const dz=Math.abs(crossings[0].z[0]-crossings[0].z[1]);assert(dz>6.5&&dz<11,`Minhocão: the deck ${dz.toFixed(2)} m over Major Sertório`);
  const probe=new TestCar(data);let tunnelStations=0,deepest=0;
  for(let i=0;i<n;i++){const p=a[i];if(!inTunnel(data,p[0]))continue;tunnelStations++;for(const side of [-1,1]){const d=side*(p[4]/2+.25),x=p[1]+p[9]*d,y=p[2]+p[10]*d;probe.index=i;const s=probe.sample(x,y,i);assert(Math.abs(s.z-.055-(p[3]+p[5]*d))<.05,`Minhocão: tunnel road plane out to the wall at s=${p[0]}`);}deepest=Math.max(deepest,probe.terrain(p[1]+p[9]*(p[4]/2+12),p[2]+p[10]*(p[4]/2+12))-p[3]);}
  assert(deepest>7,`Minhocão: the tunnel runs well under the plaza (${deepest.toFixed(1)} m)`);
  out.street={decks:+decks.toFixed(0),tunnels:+tunnels.toFixed(0),crossingDz:+dz.toFixed(2),deepestUnderGround:+deepest.toFixed(1)};
 }
 // Circuito da Pampulha (imaginary street circuit round Belo Horizonte's lake): walls on both sides (open only for the
 // pit lane); one lap of 20 km (circuits.js laps, mirrored in meta.laps) in every race and championship round, never on
 // the story's calendar; the lake is water only over its own cells (sea-water.js lakeCells; the park, the island and the
 // wooded banks inside the city's lake outline are land), the valley below the dam 10
 // to 40 m under its level dry land; and the first block of the Oscar Paschoal raced twice, up one carriageway and down
 // the other some 20 m away: a car anywhere on either is found on its own stretch (physics.js nearest).
 if(id==='pampulha'){
  assert.equal(data.meta.barrier,'street');
  // Walls all round but where the pit lane on the north shore and the branch road by the Igrejinha (data.branches: its two
  // mouths, main_gaps) open the left one and the gap into the Mineirão (meta.roam) the right one.
  const holes=runs=>{const out=[];for(let k=0;k+1<runs.length;k++)out.push([runs[k][1],runs[k+1][0]]);if(runs[0][0]>0||runs.at(-1)[1]<L-1e-6)out.push([runs.at(-1)[1],runs[0][0]]);return out;};
  const mouths=data.branches.flatMap(B=>B.main_gaps),left=holes(data.meta.rails['1']),right=holes(data.meta.rails['-1']),g=data.meta.roam.zones[0].gaps[0];
  for(const [m0,m1] of mouths)assert(left.some(([h0,h1])=>Math.abs(h0-m0)<1&&Math.abs(h1-m1)<1),`Pampulha: the left wall open at the branch's mouth ${m0}-${m1}`);
  const pitHoles=left.filter(([h0,h1])=>!mouths.some(([m0,m1])=>Math.abs(h0-m0)<1&&Math.abs(h1-m1)<1)),pitHole=pitHoles[0];
  assert(pitHoles.length===1&&pitHole[0]<=data.pit.entry_main_s&&pitHole[1]>=data.pit.exit_main_s&&pitHole[1]-pitHole[0]<data.pit.length_m+80,'Pampulha: the left wall opens only for the pit lane and the branch');
  assert(right.length===1&&Math.abs(right[0][0]-g.s0)<3&&Math.abs(right[0][1]-g.s1)<3,'Pampulha: the right wall opens only into the Mineirão');
  for(let i=0;i<n;i+=5)for(const side of [-1,1]){const g=guardrailClearance(data,a[i][0],side);assert(g>.3&&g<8.5,`Pampulha: wall gap ${g} at s=${a[i][0]}`);}
  assert(circuit.laps===1&&data.meta.laps===circuit.laps&&fixedLaps(id)===1,'Pampulha: one lap, in circuits.js and the track file');
  assert(raceLaps(id,5)===1&&raceLaps('interlagos',5)===5&&standardLaps(id)===1&&standardLaps('interlagos')===3,'Pampulha: its own race length and records');
  assert(!OLD_STOCK_2026.some(r=>fixedLaps(r.circuit)),'the story (Old Stock 2026) never races a circuit with a fixed race length');
  const season=new Championship(null,'corrida','todas');season.start('Piloto',4);
  assert(season.rounds.includes(id)&&season.roundLaps(id)===1&&season.roundLaps('interlagos')===4,'Pampulha: one lap in Todas as pistas');
  const wet=lakeCells(data),level=data.meta.sea_level_m;let lake=0,dry=0;
  for(let k=0;k<wet.length;k++){if(wet[k]){lake++;assert(data.scenery.cover.classes[k]==='6'&&data.terrain.z[k]<level,'Pampulha: lake nodes are water cells under the level');}else if(data.terrain.z[k]<level)dry++;}
  assert(data.meta.lake&&lake>70000&&dry>30000,`Pampulha: ${lake} lake nodes, ${dry} nodes under its level left dry (the valley below the dam)`);
  // The block raced both ways: the stations with another stretch of the lap within 25 m (over 400 m away along it).
  const twin=[];for(let i=0;i<n;i++){const p=a[i];if(a.some(q=>{const d=Math.abs(q[0]-p[0]);return Math.min(d,L-d)>400&&Math.hypot(q[1]-p[1],q[2]-p[2])<25;}))twin.push(p[0]);}
  const shared=[];for(const s0 of twin){const last=shared.at(-1);if(last&&s0-last[1]<10)last[1]=s0;else shared.push([s0,s0]);}
  assert.equal(shared.length,2,`Pampulha: one block raced both ways (${JSON.stringify(shared)})`);
  const probe=new TestCar(data);let checked=0;
  for(const [s0,s1] of shared)for(let i=Math.round(s0/(L/n));a[i][0]<=s1;i++){const p=a[i];
   for(const d of [-p[4]/2+.4,0,p[4]/2-.4]){const x=p[1]+p[9]*d,y=p[2]+p[10]*d,far=probe.nearest(x,y,true);probe.index=i;const near=probe.nearest(x,y);
    for(const q of [far,near])assert(Math.abs(q.i-i)<=2,`Pampulha: a car at s=${p[0].toFixed(0)} d=${d.toFixed(1)} is found at s=${a[q.i][0].toFixed(0)}`);checked++;}}
  const gap=Math.min(...a.filter(p=>p[0]>=shared[0][0]&&p[0]<=shared[0][1]).map(p=>Math.min(...a.filter(q=>q[0]>=shared[1][0]&&q[0]<=shared[1][1]).map(q=>Math.hypot(q[1]-p[1],q[2]-p[2])))));
  assert(gap>12,`Pampulha: the two carriageways of the first block ${gap.toFixed(1)} m apart`);
  // The global search by cells (physics.js segmentGrid) gives the full scan's answer to the bit: over the Mineirão's floor (180 m
  // off the lap, where the window fell back to the scan every frame) and round the whole lap.
  const scan=(x,y)=>{let best=Infinity,o;for(let i=0;i<n;i++){const p=a[i],q=a[(i+1)%n],dx=q[1]-p[1],dy=q[2]-p[2],u=Math.max(0,Math.min(1,((x-p[1])*dx+(y-p[2])*dy)/(dx*dx+dy*dy))),ex=x-p[1]-u*dx,ey=y-p[2]-u*dy,d2=ex*ex+ey*ey;if(d2<best){best=d2;o={i,u,ex,ey};}}return o;};
  const bowl=data.scenery.landmarks.find(m=>m.kind==='mineirao').stadium.centre;let exact=0;
  for(let k=0;k<600;k++){const x=k<300?bowl[0]+((k*37)%41-20)*6:a[(k*17)%n][1]+((k*13)%61-30)*4,y=k<300?bowl[1]+((k*53)%29-14)*6:a[(k*17)%n][2]+((k*7)%61-30)*4,g=probe.nearest(x,y,true),f=scan(x,y);
   assert(g.i===f.i&&Object.is(g.u,f.u)&&Object.is(g.ex,f.ex)&&Object.is(g.ey,f.ey),`Pampulha: the global search by cells at ${x.toFixed(1)}, ${y.toFixed(1)}`);exact++;}
  out.street={laps:circuit.laps,lakeNodes:lake,dryUnderLevel:dry,sharedBlock:{gap:+gap.toFixed(1),probes:checked},exactSearch:exact};
 }
 // --- Relief: real circuits, not a flat plate; grades a car can climb.
 const grades=a.map(p=>p[6]);out.grade=[Math.min(...grades),Math.max(...grades)].map(g=>+(g*100).toFixed(1));
 // The Chapada's profile is game earthworks on a plateau with valleys (up to 8%), not the relief under the line: no DEM check.
 // Guaratiba is lowland by the mangrove, 1-2 m above the sea (meta.flat_site): its small relief still comes from the DEM.
 if(data.meta.flat_site)assert(data.meta.elevation_range_m>.3&&data.meta.elevation_range_m<10,`${id}: lowland relief range`);
 else assert(data.meta.elevation_range_m>10&&data.meta.elevation_range_m<(data.meta.imaginary?70:60),`${id}: relief range`);
 // (A street circuit takes the streets as they are: Floripa's Rua Hoepcke comes down the hill at 12%.)
 const maxGrade=data.meta.street?.125:data.meta.imaginary?.081:.15;
 assert(Math.max(...grades.map(Math.abs))<maxGrade,`${id}: grade under ${maxGrade*100}%`);
 if(!data.meta.imaginary)assert(Math.abs(data.meta.elevation_check.anadem_menos_copernicus_mediana_m)<1,'ANADEM and Copernicus agree along the track');
 // Terrain next to the asphalt meets the road plane (no step at the edge; between two
 // stretches of the lap that run side by side it becomes a bank).
 // (On a plateau's rim the plateau's ground: the grid itself drops past the line, 2 m or more beyond the edge.)
 const car=new TestCar(data);let edgeStep=0;
 // (Over a bridge deck the ground is the sea far below, and beside a tunnel or its trench, meta.tunnels, the plaza or
 // the street above: no meeting there.)
 // (Nor at a deck's abutment, where the shore drops away within a few metres of its start.)
 for(let i=0;i<n;i+=2){const p=a[i];if(onDeck(data,p[0])||onDeck(data,p[0]+4)||onDeck(data,p[0]-4)||inTunnel(data,p[0]))continue;car.index=i;for(const side of [-1,1]){const d=side*(p[4]/2+1),x=p[1]+p[9]*d,y=p[2]+p[10]*d,road=p[3]+p[5]*d;edgeStep=Math.max(edgeStep,Math.abs(car.terrain(x,y,car.cliff?.plateauZ)-road));}}
 assert(edgeStep<.5,`${id}: terrain meets the road (max step ${edgeStep})`);out.edgeStep=+edgeStep.toFixed(3);
 // --- Pit lane: surveyed format, Box 99, AI in-lap route.
 const geo=pitGeometry(data);assert(geo,'pit geometry');
 const pc=Object.fromEntries(data.pit.columns.map((k,i)=>[k,i])),mid=data.pit.samples[Math.floor(data.pit.samples.length/2)];
 const at=locatePit(geo,mid[pc.x],mid[pc.y]);assert(at&&Math.abs(at.d)<.5,'lane centre found');
 const spot=serviceSpot(data.pit);assert(spot&&spot.d>0&&spot.d<data.pit.box99.front,'service spot on the working lane');
 const bays=garageBays(data.pit,14);assert(bays.bays>=3,'garage row');
 const route=pitRoute(data);assert(route&&route.slots.length>=5,`${id}: in-lap parking slots (${route?.slots.length})`);
 // The in-lap route runs the way the cars do (Brasília's block is written exit to entry): its first
 // station by the entry, each step forward along the lap, the slots on the garage side of the lane.
 {const st=route.stations,e=a[Math.round(((route.entryS%L)+L)%L/(L/n))%n];
  assert(Math.hypot(st[0].x-e[1],st[0].y-e[2])<40,`${id}: in-lap route starts at the entry (${Math.hypot(st[0].x-e[1],st[0].y-e[2]).toFixed(1)} m)`);
  for(let k=1;k<st.length;k++)assert(st[k].u>st[k-1].u&&(st[k].x-st[k-1].x)*st[k-1].tx+(st[k].y-st[k-1].y)*st[k-1].ty>0,`${id}: in-lap route goes forward`);
  for(const slot of route.slots){const q=route.at(slot.u),x=q.x-q.ty*slot.d,y=q.y+q.tx*slot.d,lane=locatePit(geo,x,y);assert(lane&&lane.d>0,`${id}: parking slot on the garage side`);}
  out.pitReversed=!!data.pit.reversed;}
 // Box 99 stands on the pit lane, clear of the track asphalt.
 const s99=car.sample(...(()=>{const p=data.pit.samples.find(r=>r[pc.s]>=data.pit.box99.s);return [p[pc.x]+p[pc.lx]*(data.pit.box99.front+8),p[pc.y]+p[pc.ly]*(data.pit.box99.front+8)];})());
 assert(Math.abs(s99.d)>s99.width/2+3,'Box 99 is off the racing surface');
 // The team stand (registration, story mode) is built on the pit wall under it, from its nearest
 // point on any stretch: a 0.6 m wall (Cascavel's rule where lane and track are far apart) left
 // the stand and its sign behind the fence, out of reach. The wall there must hold its 2.2 m
 // floor and still keep its track face off the asphalt (ECPA's wall runs 0.6 m from it by design).
 {const p=data.pit.samples.find(r=>r[pc.s]>=data.pit.box99.s),near=data.pit.walls.filter(w=>w.name==='Muro_boxes').flatMap(w=>w.points).map(q=>({q,dist:Math.hypot(q[0]-p[pc.x],q[1]-p[pc.y])})).sort((u,v)=>u.dist-v.dist);
  assert(near[0].dist<12,`${id}: pit wall by Box 99 (${near[0].dist.toFixed(1)} m)`);
  for(const {q} of near.slice(0,3))assert(q[3]>=3.2,`${id}: pit wall under the team stand ${q[3]} m thick`);
  const q=near[0].q,lat=(q[0]-p[pc.x])*p[pc.lx]+(q[1]-p[pc.y])*p[pc.ly]-q[3]/2,face=[p[pc.x]+p[pc.lx]*lat,p[pc.y]+p[pc.ly]*lat];
  car.index=car.nearest(...face,true,null,q[2]).i;const edge=car.sample(...face);assert(Math.abs(edge.d)>edge.width/2+.5,`${id}: stand wall ${(Math.abs(edge.d)-edge.width/2).toFixed(1)} m from the asphalt`);
  out.standWall={thick:+near[0].q[3].toFixed(1),clear:+(Math.abs(edge.d)-edge.width/2).toFixed(1)};}
 out.pit={length:Math.round(data.pit.length_m),entry:Math.round(data.pit.entry_main_s),exit:Math.round(data.pit.exit_main_s),garages:data.pit.garages,slots:route.slots.length};
 // No guardrail across the pit side while the lane runs along the track.
 const pitSide=data.pit.reversed?-1:1,railPit=guardrailSections(data,pitSide);
 // (Floripa's lane runs along the Av. Paulo Fontes, far from the line on the bridge: there the wall stays.)
 const lineInPit=data.pit.entry_main_s>data.pit.exit_main_s;
 if(lineInPit)assert(!railPit.some(([f,t])=>0>=f&&0<=t),'no rail on the pit side at the timing line');
 assert(!railPit.some(([f,t])=>f<=data.pit.entry_main_s+30&&t>=data.pit.entry_main_s+30),'no rail across the pit lane');
 // --- Stands and buildings keep off the roads.
 const stands=standLayout(data);assert(stands.length>=(data.meta.street?0:3),'grandstand blocks');
 // (The nearest stretch at the height of what stands there: where the lap passes over itself, the one at that level.)
 for(const b of stands){const [x,y]=[b.x+b.rx*b.front,b.y+b.ry*b.front];car.index=car.nearest(x,y,true,null,b.base).i;const s=car.sample(x,y);assert(Math.abs(s.d)>s.width/2+6,'stand front clear of the asphalt');}
 const bands=sceneryBands(data),cols=Object.fromEntries(data.scenery.buildings.columns.map((k,i)=>[k,i]));
 // Each footprint (an oriented rectangle: corners, edge midpoints, centre) stays off every band; a
 // bounding circle was too coarse for Brasília's long, thin stands beside its 803 m straight.
 for(const b of data.scenery.buildings.items){const x=b[cols.x],y=b[cols.y],w=b[cols.w],d=b[cols.d],c=Math.cos(b[cols.heading]),sn=Math.sin(b[cols.heading]);
  for(const [u,v] of [[0,0],[-1,-1],[1,-1],[1,1],[-1,1],[0,-1],[1,0],[0,1],[-1,0]]){const px=x+c*u*w/2-sn*v*d/2,py=y+sn*u*w/2+c*v*d/2,clear=bandClearance(bands,px,py);
   assert(clear.distance>0,`${id}: building ${x},${y} too close to ${clear.band}`);}}
 out.buildings=data.scenery.buildings.items.length;out.stands=stands.length;
 // Billboards: all sixteen placed, off every road (ECPA's side-by-side straights, the pit
 // entry) and apart from each other; none is left where its search failed.
 const boards=billboardSpots(data);assert.equal(boards.length,16,`${id}: sixteen billboards`);
 // (On a street circuit no building stands where a board, a marshal post or a TV tower is set: podar_edificios.mjs.)
 for(const b of boards){const c=bandClearance(bands,b.x,b.y);assert(c.distance>BOARD_CLEARANCE,`${id}: billboard ${b.slot} ${c.distance.toFixed(1)} m from ${c.band}`);}
 assert(boards.every(b=>boards.every(o=>o===b||Math.hypot(o.x-b.x,o.y-b.y)>25)),`${id}: billboards apart`);
 out.billboards=+Math.min(...boards.map(b=>b.clearance)).toFixed(1);
 // Start gantry: neither post on the track or pit lane asphalt nor against a pit wall
 // (ECPA's pit lane is still opening at the timing line).
 const posts=gantryPosts(data);
 for(const post of posts){
  car.index=car.nearest(post.x,post.y,true,null,a[0][3]).i;const onTrack=car.sample(post.x,post.y),lane=locatePit(geo,post.x,post.y);
  // (On a bridge deck the posts stand on the concrete walls, half a metre off the asphalt.)
  assert(Math.abs(onTrack.d)>onTrack.width/2+(post.deck?.5:POST_CLEARANCE),`${id}: gantry post ${post.side} off the track`);
  assert(!lane||lane.d<lane.lo-POST_CLEARANCE||lane.d>lane.hi+POST_CLEARANCE,`${id}: gantry post ${post.side} on the pit lane (d ${lane?.d.toFixed(1)})`);
  // Clear of the pit walls, or (Chapecó, Brasília, Goiânia, Chapada: the line facing the garages) mounted on the pit wall's platform.
  if(post.onWall)assert(wallUnderPost(geo,post.x,post.y)&&['chapeco','brasilia','goiania','chapada'].includes(id),`${id}: gantry post ${post.side} on the pit wall top`);
  else assert.equal(wallsNear(geo,post.x,post.y,POST_CLEARANCE).length,0,`${id}: gantry post ${post.side} against a pit wall`);
 }
 out.gantry=posts.map(p=>+p.d.toFixed(1));
 // --- Ground fitting under asphalt, kerbs, pit and stands converges.
 const fit=fitGround(data);assert(fit.stats.residual<.01,`${id}: ground fit residual ${fit.stats.residual}`);out.groundFit=fit.stats;
 // --- The recognition driver and the 14 rivals race three laps on the real geometry (a circuit that fixes its race
 // length, circuits.js laps, its own: Pampulha's one lap of 20 km, with the time it takes).
 const laps=circuit.laps??3,budget=circuit.laps?laps*L/15:600;
 const field=new RaceField(data,{seed:1}),parked=new TestCar(data);parked.resetGrid();field.reset(parked.surface.s,{grid:true});
 const far=data.terrain;parked.x=far.x0+5;parked.y=far.y0+5;parked.surface=parked.sample(parked.x,parked.y);
 let steps=0,offroad=0,crashes=0;
 let roamed=0;
 while(field.rivals.some(r=>!r.finished)&&steps<120*budget){field.step(parked,1/120,laps);for(const r of field.rivals){if(!r.car.surface.onRoad)offroad++;if(r.car.roamZone)roamed++;}steps++;}
 // A street circuit's gaps into the city (meta.roam) are off the rivals' line: none of them ever goes through.
 assert.equal(roamed,0,`${id}: rivals never leave the lap through a gap into the city (${roamed} steps out)`);
 const finished=field.rivals.filter(r=>r.finished);
 assert(finished.length>=13,`${id}: rivals finish ${laps} laps (${finished.length}/14)`);
 assert(offroad/(steps*14)<.03,`${id}: rivals stay on the asphalt (${(offroad/(steps*14)*100).toFixed(2)}% off)`);
 const best=Math.min(...field.rivals.map(r=>r.car.best??Infinity));
 out.rivals={finished:finished.length,bestLap:+best.toFixed(2),avgSpeedKmh:+(L/best*3.6).toFixed(1),offroadPct:+(offroad/(steps*14)*100).toFixed(2),falls:field.rivals.reduce((sum,r)=>sum+(r.car.falls??0),0)};
 const solo=new TestCar(data);solo.resetGrid();solo.awaitingStart=false;let t=0,soloOff=0;const startLaps=solo.laps;
 // Two laps at the tour's pace (it averages ~75 km/h): 400 s, more for Brasília's 5.4 km (one of Pampulha's 20 km).
 const tour=Math.min(2,laps),tourBudget=120*Math.max(400,L/15*1.2*tour);
 while(solo.laps<startLaps+tour&&t<tourBudget){solo.step(recognitionInput(solo),1/120);if(!solo.surface.onRoad)soloOff++;t++;}
 assert(solo.laps>=startLaps+tour,`${id}: recognition driver laps (${solo.laps-startLaps} in ${(t/120).toFixed(0)} s, at s=${solo.surface.s.toFixed(0)})`);out.recognition={best:+solo.best.toFixed(2),offroadPct:+(soloOff/t*100).toFixed(2)};
 report[id]=out;
}
console.log(JSON.stringify({passed:true,report},null,1));
