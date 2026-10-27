// Margens regulares (track-verge.js; pedido de 26/10/2026: os guardrails subiam e desciam com cada calombo do relevo, e
// algumas curvas tinham um dente na borda do asfalto). Em cada circuito, depois de smoothVerges:
// - os guardrails (street-walls.js barrierLines) sem ondas curtas: a segunda diferença da altura a cada 4 m fica em
//   RAIL_WAVE no percentil 95 e RAIL_KINK no máximo (antes: 0,39 e 1,49 m em Interlagos, 0,27 e 1,04 m em Piracicaba);
// - o guardrail em cima do chão: a altura da linha contra o chão em que o carro pisa no pé dela (TestCar.sample) fica
//   dentro de RAIL_GROUND;
// - o chão das margens mais liso onde mudou (a segunda diferença ao longo das linhas e colunas da grade) e sem quina
//   nova maior que CREASE (a beira de um barranco ao lado do guardrail, levantada junto com ele);
// - debaixo do pit lane e dos boxes o relevo é o do levantamento, e nos circuitos de rua (muros na calçada da cidade)
//   nada muda;
// - a largura só estreita, nunca muda mais depressa que WIDTH_SLOPE (com folga) onde foi suavizada, e o grampo de
//   Piracicaba perde o dente (a largura subia 2,15 m em 4 m na saída);
// - cada guardrail e muro termina onde o trecho dele termina, sem um toco voltando para a pista (a ponta caía 2e-13 m
//   fora do trecho e perdia o afastamento: 10 das 82 pontas);
// - rodar de novo não muda nada.
//   node scripts/testar_margens.mjs [circuito...]
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TestCar} from '../teste/physics.js';
import {barrierLines} from '../teste/street-walls.js';
import {smoothVerges,WIDTH_SLOPE} from '../teste/track-verge.js';
import {pitGeometry,locatePit} from '../teste/pit-lane.js';
import {CIRCUITS} from '../teste/circuits.js';
import {createCurveloData} from '../teste/curvelo-data.js';

const RAIL_WAVE=.08,RAIL_KINK=.3,RAIL_GROUND=.2,CREASE=1.2;
const load=id=>{const d=id==='curvelo'?createCurveloData():JSON.parse(readFileSync(new URL(`../dados/${CIRCUITS[id].data??'pista.json'}`,import.meta.url)));d.meta.id=id;d.meta.name=CIRCUITS[id].name;return d;};
const pct=(v,f)=>{const s=[...v].sort((a,b)=>a-b);return s.length?s[Math.min(s.length-1,Math.floor(f*s.length))]:0;};
const only=process.argv.slice(2),report={};
for(const id of Object.keys(CIRCUITS)){
 if(only.length&&!only.includes(id)||CIRCUITS[id].arena)continue;
 const data=load(id),t=data.terrain,before=Float64Array.from(t.z),width=data.samples.map(p=>p[4]);
 const stats=smoothVerges(data),after=Float64Array.from(t.z),widthAfter=data.samples.map(p=>p[4]);
 // Again: the same answer, nothing more changed.
 assert.equal(smoothVerges(data),stats,`${id}: smoothVerges once per track data`);
 assert(after.every((z,g)=>z===t.z[g])&&widthAfter.every((w,i)=>w===data.samples[i][4]),`${id}: a second call changes nothing`);
 const street=!!data.meta.street,out={stats};
 if(street||data.meta.sea_level_m!=null||data.branches?.length){
  assert(before.every((z,g)=>z===after[g])&&width.every((w,i)=>w===widthAfter[i]),`${id}: a city's street circuit keeps its ground and widths`);
 }
 // --- Width: never wider; eased where it was eased.
 widthAfter.forEach((w,i)=>assert(w<=width[i]+1e-9,`${id}: wider at s ${data.samples[i][0].toFixed(0)}`));
 if(stats.width){
  const A=data.samples,N=A.length;let steep=0;
  for(let i=0;i<N;i++){const j=(i+1)%N;if(widthAfter[i]===width[i]&&widthAfter[j]===width[j])continue;const ds=(A[j][0]-A[i][0]+data.meta.reconstructed_xy_m)%data.meta.reconstructed_xy_m||1;steep=Math.max(steep,Math.abs(widthAfter[j]-widthAfter[i])/ds);}
  assert(steep<=WIDTH_SLOPE+.05,`${id}: eased width changes ${steep.toFixed(3)} m/m`);out.widthSlope=+steep.toFixed(3);
 }
 // --- The ground: smoother where it changed (the second differences along the grid's rows and columns), no new crease
 // past CREASE (the lip of a bank by a rail, lifted with it); untouched under the pit lane and its garages.
 const {nx,ny}=t;let sumBefore=0,sumAfter=0,creases=0,crease=0;
 for(let j=1;j<ny-1;j++)for(let i=1;i<nx-1;i++){
  const g=j*nx+i;if([g,g-1,g+1,g-nx,g+nx].every(h=>after[h]===before[h]))continue;
  for(const o of [1,nx]){const b=Math.abs(before[g-o]-2*before[g]+before[g+o]),a=Math.abs(after[g-o]-2*after[g]+after[g+o]);sumBefore+=b*b;sumAfter+=a*a;creases++;crease=Math.max(crease,a-b);}
 }
 if(creases){
  out.ground={rough:+Math.sqrt(sumBefore/creases).toFixed(3),now:+Math.sqrt(sumAfter/creases).toFixed(3),crease:+crease.toFixed(3)};
  assert(out.ground.now<=out.ground.rough,`${id}: the verges are rougher (${out.ground.rough} -> ${out.ground.now})`);
  assert(crease<=CREASE,`${id}: a new crease of ${crease.toFixed(2)} m in the ground`);
 }
 const geo=data.pit?pitGeometry(data):null;
 if(geo){
  let pitNodes=0;
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const g=j*nx+i,q=locatePit(geo,t.x0+i*t.step,t.y0+j*t.step);if(!q||q.d<q.lo||q.d>q.hi+20)continue;pitNodes++;assert(Math.abs(after[g]-before[g])<1e-3,`${id}: the ground under the pit lane changed`);}
  out.pitNodes=pitNodes;
 }
 // --- The rails: no short waves, standing on the ground.
 const lines=barrierLines(data),probe=new TestCar(data),wave=[],off=[];
 for(const side of [-1,1])for(const line of lines[side]){
  const st=line.stations;
  // Each end where its section ends, flared like the stations before it: no stub back toward the road (the end's lap
  // distance came out 2e-13 past the section, off it, at 10 of the 82 ends).
  if(st.length>2)for(const [a,b,c] of [[st[0],st[1],st[2]],[st.at(-1),st.at(-2),st.at(-3)]]){
   const turn=Math.abs(Math.atan2((a.x-b.x)*(b.y-c.y)-(a.y-b.y)*(b.x-c.x),(a.x-b.x)*(b.x-c.x)+(a.y-b.y)*(b.y-c.y)));
   assert(Math.hypot(a.x-b.x,a.y-b.y)<.3||turn<Math.PI/6,`${id}: a stub at the end of a barrier at s ${a.s.toFixed(0)}`);
  }
  for(let i=2;i<st.length-2;i++)if(Math.abs(st[i+2].s-st[i-2].s-8)<1)wave.push(Math.abs(st[i+2].z-2*st[i].z+st[i-2].z));
  if(!street)for(const q of st){probe.index=Math.min(data.samples.length-1,Math.max(0,data.samples.findIndex(p=>p[0]>=q.s)));off.push(Math.abs(q.z-probe.sample(q.x,q.y).z));}
 }
 if(wave.length&&!street){
  out.rail={wave95:+pct(wave,.95).toFixed(3),kink:+Math.max(...wave).toFixed(3),ground99:+pct(off,.99).toFixed(3),ground:+Math.max(...off).toFixed(3)};
  assert(out.rail.wave95<=RAIL_WAVE,`${id}: rail waves ${out.rail.wave95} m (p95)`);
  assert(out.rail.kink<=RAIL_KINK,`${id}: rail kink ${out.rail.kink} m`);
  assert(out.rail.ground<=RAIL_GROUND,`${id}: rail ${out.rail.ground} m off the ground`);
 }
 report[id]=out;console.log(id,JSON.stringify(out));
}
// Piracicaba's Junção: the exit no longer jumps 2 m in 4 m.
if(report.piracicaba){
 const data=load('piracicaba');smoothVerges(data);const A=data.samples;
 for(let i=0;i+2<A.length;i++)if(A[i][0]>590&&A[i][0]<640)assert(Math.abs(A[i+2][4]-A[i][4])<4*WIDTH_SLOPE+.1,`piracicaba: notch at s ${A[i][0].toFixed(0)}`);
}
console.log('margens ok');
