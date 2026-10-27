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
// - nos circuitos de PLAN (Interlagos, pedido de 27/10/2026: "a borda da curva está toda irregular!! Um zigue-zague"),
//   a curvatura de cada borda sem o zigue-zague (a mudança dela de uma estação para a outra fica em PLAN_ROUGH no
//   percentil 95; antes 0,0071 e 0,0081 1/m), nenhuma borda andando mais que PLAN_MOVE, a borda ao lado do pit lane
//   onde estava, e a zebra de dentro da Ferradura marcada inteira (corrigir_bordas_zebras.py: a borda passava por cima
//   dela);
// - a linha branca dos dois lados, a volta inteira, onde o asfalto vem dos dados (open-circuit.js lapRoad: Interlagos e os
//   circuitos de dados abertos; só a boca de um ramal a interrompe), como o usuário pediu ("a pista tem que ter aquela
//   linha branca dos dois lados");
// - a zebra sem buraco no meio (fillKerbs; o usuário: "a zebra começa e depois termina com um buraco no meio,
//   principalmente em curvas"): entre dois trechos do mesmo lado nenhum buraco de até KERB_HOLE m, nem de até
//   KERB_BEND_GAP m numa curva, a não ser onde o pit lane ou uma via fechada encosta na borda; nas ruas, como estava;
// - rodar de novo não muda nada.
//   node scripts/testar_margens.mjs [circuito...]
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TestCar,clamp} from '../teste/physics.js';
import {barrierLines} from '../teste/street-walls.js';
import {smoothVerges,WIDTH_SLOPE,PLAN,PLAN_PIT_GAP,KERB_HOLE,KERB_BEND_GAP,KERB_BEND_TURN,KERB_PAD} from '../teste/track-verge.js';
import {pitGeometry,locatePit} from '../teste/pit-lane.js';
import {CIRCUITS} from '../teste/circuits.js';
import {createCurveloData} from '../teste/curvelo-data.js';
import {lapRoad} from '../teste/open-circuit.js';
import {lapLineCuts} from '../teste/branch-layout.js';

const RAIL_WAVE=.08,RAIL_KINK=.3,RAIL_GROUND=.2,CREASE=1.2,PLAN_ROUGH=.004,PLAN_MOVE=.5;
// Each edge's curvature (1/m) station by station, and how much it changes from one to the next (p95).
const edgeLine=(S,side)=>S.map(p=>[p[1]+p[9]*side*p[4]/2,p[2]+p[10]*side*p[4]/2]);
const roughness=pts=>{const n=pts.length,k=pts.map((p,i)=>{const a=pts[(i-1+n)%n],b=pts[(i+1)%n],ax=p[0]-a[0],ay=p[1]-a[1],bx=b[0]-p[0],by=b[1]-p[1];return 2*Math.atan2(ax*by-ay*bx,ax*bx+ay*by)/(Math.hypot(ax,ay)+Math.hypot(bx,by)||1);});return pct(k.map((v,i)=>Math.abs(k[(i+1)%n]-v)),.95);};
const load=id=>{const d=id==='curvelo'?createCurveloData():JSON.parse(readFileSync(new URL(`../dados/${CIRCUITS[id].data??'pista.json'}`,import.meta.url)));d.meta.id=id;d.meta.name=CIRCUITS[id].name;return d;};
const pct=(v,f)=>{const s=[...v].sort((a,b)=>a-b);return s.length?s[Math.min(s.length-1,Math.floor(f*s.length))]:0;};
const only=process.argv.slice(2),report={};
for(const id of Object.keys(CIRCUITS)){
 if(only.length&&!only.includes(id)||CIRCUITS[id].arena)continue;
 const data=load(id),t=data.terrain,before=Float64Array.from(t.z),width=data.samples.map(p=>p[4]),raw=data.samples.map(p=>p.slice());
 const stats=smoothVerges(data),after=Float64Array.from(t.z),widthAfter=data.samples.map(p=>p[4]);
 // Again: the same answer, nothing more changed.
 assert.equal(smoothVerges(data),stats,`${id}: smoothVerges once per track data`);
 assert(after.every((z,g)=>z===t.z[g])&&widthAfter.every((w,i)=>w===data.samples[i][4]),`${id}: a second call changes nothing`);
 const street=!!data.meta.street,out={stats};
 if(street||data.meta.sea_level_m!=null||data.branches?.length){
  assert(before.every((z,g)=>z===after[g])&&width.every((w,i)=>w===widthAfter[i]),`${id}: a city's street circuit keeps its ground and widths`);
 }
 // --- The plan (PLAN): both edges without the zigzag, none moved more than PLAN_MOVE, the one by the pit lane kept.
 assert.equal(!!stats.plan,PLAN.has(id),`${id}: the plan smoothed only on the circuits in PLAN`);
 // (Elsewhere the centre line, its height and frame as in the file; the width is smoothWidth's, the kerb flags fillKerbs'.)
 if(!stats.plan)assert(raw.every((p,i)=>p.every((v,k)=>k===4||k===13||k===14||v===data.samples[i][k])),`${id}: the plan as in the file`);
 else{
  const geo=pitGeometry(data);out.plan={...stats.plan};
  for(const side of [-1,1]){
   const was=edgeLine(raw,side),now=edgeLine(data.samples,side),r0=roughness(was),r1=roughness(now),key=side<0?'right':'left';
   out.plan[key]={rough:+r0.toFixed(4),now:+r1.toFixed(4)};
   assert(r1<=PLAN_ROUGH&&r1<r0,`${id}: the ${key} edge still zigzags (${r0.toFixed(4)} -> ${r1.toFixed(4)} 1/m per station)`);
   // (How far from the edge as it was: its nearest segment there. A station also slides along the edge where the
   // normal turns, which moves no edge.)
   const off=(x,y,i)=>{let best=Infinity;for(let k=-3;k<=2;k++){const n=was.length,a=was[(i+k+n)%n],b=was[(i+k+1+n)%n],dx=b[0]-a[0],dy=b[1]-a[1],u=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1),0,1);best=Math.min(best,Math.hypot(x-a[0]-u*dx,y-a[1]-u*dy));}return best;};
   now.forEach(([x,y],i)=>{
    const d=off(x,y,i),p=raw[i];assert(d<=PLAN_MOVE,`${id}: the ${key} edge moved ${d.toFixed(2)} m at s ${p[0].toFixed(0)}`);
    for(let gap=0;gap<=PLAN_PIT_GAP;gap++){const o=side*(p[4]/2+gap),q=geo&&locatePit(geo,p[1]+p[9]*o,p[2]+p[10]*o);if(q&&q.d>=q.lo-.5&&q.d<=q.hi+.5){assert(d<.01,`${id}: the ${key} edge by the pit lane moved ${d.toFixed(4)} m at s ${p[0].toFixed(0)}`);break;}}
   });
  }
 }
 // --- Kerbs: no hole between two runs on a side, short or in a bend, but where the pit lane or a closed road meets the
 // edge; on a city's streets the flags as in the file.
 if(data.samples[0].length>14){
  const A=data.samples,n=A.length,L=data.meta.reconstructed_xy_m,geo=pitGeometry(data),pad=Math.round(KERB_PAD/(L/n)),head=q=>{const p=A[((q%n)+n)%n];return Math.atan2(p[8],p[7]);};
  const road=(data.closed_roads??[]).flatMap(r=>{const c=Object.fromEntries(r.columns.map((k,i)=>[k,i]));return r.samples.map(p=>[p[c.x],p[c.y],p[c.width]/2]);});
  const crossed=(i,side)=>{const p=A[i];for(const g of [0,1]){const d=side*(p[4]/2+g),x=p[1]+p[9]*d,y=p[2]+p[10]*d,q=geo&&locatePit(geo,x,y);if(q&&q.d>=q.lo-.5&&q.d<=q.hi+.5||road.some(([rx,ry,h])=>Math.hypot(x-rx,y-ry)<h+3))return true;}return false;};
  let holes=0;
  for(const [side,col] of [[-1,13],[1,14]]){
   if(street){assert(raw.every((p,i)=>p[col]===A[i][col]),`${id}: a city's kerbs as in the file`);continue;}
   const on=A.map(p=>p[col]>.5);if(on.every(Boolean)||!on.some(Boolean))continue;
   for(let a=0;a<n;a++){
    if(!on[a]||on[(a+1)%n])continue;let j=(a+1)%n,k=0;while(!on[j]){j=(j+1)%n;k++;}
    const gap=((A[j][0]-A[a][0])%L+L)%L;let turn=0;for(let m=-pad;m<=k+pad;m++)turn+=Math.atan2(Math.sin(head(a+m+1)-head(a+m)),Math.cos(head(a+m+1)-head(a+m)));
    if(!(gap<=KERB_HOLE||gap<=KERB_BEND_GAP&&Math.abs(turn)*180/Math.PI>=KERB_BEND_TURN))continue;
    let excused=false;for(let m=1;m<=k&&!excused;m++)excused=crossed((a+m)%n,side);
    assert(excused,`${id}: a ${gap.toFixed(0)} m hole in the ${side<0?'right':'left'} kerb at s ${A[(a+1)%n][0].toFixed(0)}`);holes++;
   }
  }
  out.kerbs={...stats.kerbs,excused:holes};
 }
 // --- The white edge line on both sides, the whole lap (but across a branch road's mouth), as lapRoad draws it.
 if(id!=='curvelo'){
  const lap=lapRoad(data,{material:{},geometry:g=>g},{}),n=data.samples.length,cuts=lapLineCuts(data);
  for(const [side,name] of [[-1,'Linha_borda_direita'],[1,'Linha_borda_esquerda']]){
   const g=lap.root.getObjectByName(name).geometry,drawn=g.index.count/6,gap=cuts.filter(c=>c.side===side).reduce((s,c)=>s+c.i1-c.i0,0);
   assert.equal(drawn,n-gap,`${id}: the ${side<0?'right':'left'} white line has holes (${drawn} of ${n-gap} segments)`);
  }
  // Every face looking up (y in the scene): one wound the other way faces the ground and is culled, the line in the file
  // but not on the screen (the right line was, 2026-10-27: "a faixa branca só aparece de um lado da pista").
  for(const name of ['Asfalto','Linha_borda_direita','Linha_borda_esquerda']){
   const g=lap.root.getObjectByName(name).geometry,pos=g.attributes.position,idx=g.index.array;let down=0;
   for(let t=0;t<idx.length;t+=3){
    const [a,b,c]=[idx[t],idx[t+1],idx[t+2]],ux=pos.getX(b)-pos.getX(a),uz=pos.getZ(b)-pos.getZ(a),vx=pos.getX(c)-pos.getX(a),vz=pos.getZ(c)-pos.getZ(a);
    if(uz*vx-ux*vz<=0)down++;
   }
   assert.equal(down,0,`${id}: ${down} faces of ${name} look down (not drawn)`);
  }
  lap.root.traverse(o=>o.geometry?.dispose());
 }
 // --- Width: never wider; eased where it was eased.
 widthAfter.forEach((w,i)=>assert(w<=width[i]+1e-9||stats.plan,`${id}: wider at s ${data.samples[i][0].toFixed(0)}`));
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
// Interlagos' Ferradura: the kerb on its inside flagged all along (the edge ran over it, and its flag looked at the grass).
if(report.interlagos){
 for(const p of load('interlagos').samples)if(p[0]>2410&&p[0]<2470)assert(p[14]>.5,`interlagos: no kerb inside the Ferradura at s ${p[0].toFixed(0)}`);
}
console.log('margens ok');
