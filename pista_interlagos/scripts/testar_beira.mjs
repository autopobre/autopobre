// Beira de pista sem repetição (sponsors.js, trackside.js, track-surface.js, trackside-flags.js): em
// cada circuito, os patrocinadores (nacionais e da cidade), as faixas nos guard-rails (patrocinador,
// tamanho e desgaste por faixa, falhas, soltas e rasgadas), os outdoors (formatos, artes sem repetir em
// sequência, verso com arte), as bandeiras do telhado (sem uma por coluna, mastros de várias alturas,
// bandeira grande do Brasil), as altas sem sombra e os postos de fiscal longe dos outdoors.
//   node scripts/testar_beira.mjs [circuito]
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CIRCUITS} from '../teste/circuits.js';
import {createCurveloData} from '../teste/curvelo-data.js';
import {SPONSORS,circuitSponsors,regionOf,luma,contrast,paintBoard} from '../teste/sponsors.js';
import {billboardSpots,billboardFormat,billboardArt} from '../teste/track-surface.js';
import {marshalSpots,bannerPlan} from '../teste/trackside.js';
import {flagPlan,FLAG_SHADOW_UP,HIGH_FLAGS,flagShadowless} from '../teste/trackside-flags.js';
import {standLayout} from '../teste/track-clearance.js';
import {guardrailPresent,guardrailClearance} from '../teste/physics.js';

const only=process.argv[2],report={},seen=new Map();
for(const id of ['interlagos','curvelo','cascavel','piracicaba','chapeco','brasilia','goiania','guaratiba','chapada','floripa','minhocao','pampulha']){
 if(only&&only!==id)continue;
 const data=id==='curvelo'?createCurveloData():JSON.parse(readFileSync(new URL(`../dados/${id==='interlagos'?'pista':'pista_'+id}.json`,import.meta.url)));
 data.meta.id=id;data.meta.name=CIRCUITS[id].name;
 // --- Sponsors: the national names everywhere, the city's own businesses, the circuit on the Old Stock one.
 const sponsors=circuitSponsors(id,data.meta.name),local=sponsors.filter(s=>s.region!=='br');
 assert(sponsors.length>=12&&sponsors.length<=20,`${id}: ${sponsors.length} sponsors`);
 assert.equal(new Set(sponsors.map(s=>s.id)).size,sponsors.length,`${id}: no sponsor twice`);
 assert(local.length>=6&&local.every(s=>s.region===regionOf(id)||s.region==='pira'),`${id}: its own region's businesses`);
 assert(sponsors.find(s=>s.id==='oldstock').words.includes(data.meta.name.toLocaleUpperCase('pt-BR')),`${id}: the Old Stock banner names the circuit`);
 seen.set(id,new Set(local.map(s=>s.id)));
 // --- Rail banners.
 const plan=bannerPlan(data),banners=plan.banners;
 assert.equal(bannerPlan(data),plan,`${id}: found once per track data`);
 // The Chapada has no guardrail anywhere (pedido #5): no rail, no banner hanging on one.
 const railless=['-1','1'].every(k=>Array.isArray(data.meta.rails?.[k])&&!data.meta.rails[k].length);
 const rows=new Map();
 if(railless)assert.equal(banners.length,0,`${id}: no banner without a rail`);
 else{
 assert(banners.length>=20,`${id}: ${banners.length} banners`);
 const lengths=banners.map(b=>b.s1-b.s0);for(const b of banners)rows.set(b.row,(rows.get(b.row)??0)+1);
 assert(lengths.every(l=>l>.5&&l<=10.61),`${id}: banners up to 10.6 m`);
 assert(Math.max(...lengths)-Math.min(...lengths.filter(l=>l>4.5))>3,`${id}: banners of different lengths`);
 // Never three banners of one sponsor side by side (tied within a metre of each other): no stamped rows on the rail.
 let triples=0;for(let i=2;i<banners.length;i++){const [a,b,c]=[banners[i-2],banners[i-1],banners[i]];if(a.side===c.side&&b.side===c.side&&a.row===b.row&&b.row===c.row&&b.s0-a.s1<1&&c.s0-b.s1<1)triples++;}
 assert.equal(triples,0,`${id}: ${triples} rows of three banners of one sponsor`);
 assert(rows.size>=Math.min(10,sponsors.length-2),`${id}: ${rows.size} sponsors on the rails`);
 assert(Math.max(...rows.values())<=banners.length*.3,`${id}: no sponsor on more than 30% of the banners`);
 if(banners.length>80)assert(banners.some(b=>b.hangs)&&banners.some(b=>b.rip),`${id}: some loose and torn banners`);
 for(const k of ['fade','dirt','bright','reach','lift'])assert(new Set(banners.map(b=>b[k].toFixed(7))).size>banners.length*.95,`${id}: every banner its own ${k}`);
 // Next to each other on one side: a sponsor runs on, or alternates; never the same banner beat all round.
 let changes=0;for(let i=1;i<banners.length;i++)if(banners[i].side===banners[i-1].side&&banners[i].row!==banners[i-1].row)changes++;
 assert(changes>banners.length*.25,`${id}: the sponsor changes along the rail (${changes} of ${banners.length})`);
 // A sponsor's main and reversed banners: both hang, and next to each other the same one often swaps.
 const alts=banners.filter(b=>b.alt).length,pairs=banners.slice(1).filter((b,i)=>b.side===banners[i].side&&b.row===banners[i].row&&Math.abs(b.s0-banners[i].s1)<1),swaps=pairs.filter((b,i)=>b.alt!==banners[banners.indexOf(b)-1].alt).length;
 assert(alts>banners.length*.25&&alts<banners.length*.75,`${id}: ${alts} of ${banners.length} banners reversed`);
 if(pairs.length>10)assert(swaps>pairs.length*.15,`${id}: a run of one sponsor swaps its banner (${swaps} of ${pairs.length})`);
 // Gaps: tied banners leave a hand's width or more now and then, and whole banners are missing.
 const gaps=banners.slice(1).map((b,i)=>b.side===banners[i].side?b.s0-banners[i].s1:null).filter(g=>g!==null&&g>=0&&g<12);
 assert(gaps.some(g=>g>.03&&g<.3)&&gaps.some(g=>g>5),`${id}: small gaps and missing banners`);
 }
 // --- Billboards: the same 16 slots, four builds, eight designs front and back.
 const spots=billboardSpots(data),art=billboardArt(data,spots),formats=spots.map(s=>billboardFormat(data,s));
 assert.deepEqual(formats,spots.map(s=>billboardFormat(data,s)),`${id}: a board's build is fixed by its slot`);
 assert(new Set(formats.map(f=>f.w)).size>=3,`${id}: boards of three sizes or more`);
 for(const f of formats){assert(Math.abs(f.w/f.h-2)<1e-9,`${id}: 2:1 faces`);assert(f.top>=5.8&&f.top<=10.5,`${id}: top ${f.top}`);}
 assert.equal(art.names.length,14);for(const fixed of ['omp','rtj','eletric','apoiadores_motorista','apoiadores_passageiro'])assert(art.names.includes(fixed),`${id}: the ${fixed} board`);
 assert(!art.painted.some(s=>s.real),`${id}: no real name among the painted joke boards`);assert(new Set(art.fronts.map(k=>art.names[k])).size>=6,`${id}: six designs or more on the fronts`);
 for(let i=0;i<art.fronts.length;i++){assert.notEqual(art.backs[i],art.fronts[i],`${id}: the back differs from the front`);for(let k=Math.max(0,i-3);k<i;k++)assert.notEqual(art.fronts[k],art.fronts[i],`${id}: no design twice within three boards`);}
 assert(art.painted.every(s=>SPONSORS[s.id]),`${id}: painted boards are sponsors`);
 assert(art.painted.filter(s=>s.region!=='br').length>=3,`${id}: the city's businesses on the boards`);
 // No board reaches over a guardrail toward the cars: every corner of its backing and catwalk stays on the far side
 // of the rail line of the stretch it is nearest (the 14.4 m build hung a metre over it on the main straights).
 for(const spot of spots){
  const f=billboardFormat(data,spot),{p,side,x,y}=spot,ry=Math.atan2(-p[7]*.8+p[8]*side*.6,p[8]*.8+p[7]*side*.6)+f.turn,W=f.w/2+.2;
  for(const [lx,lz] of [[-W,.11],[W,.11],[-W,-.11],[W,-.11],[-f.w*.45,.77],[f.w*.45,.77]]){
   const X=x+lx*Math.cos(ry)+lz*Math.sin(ry),Y=y+lx*Math.sin(ry)-lz*Math.cos(ry);
   let q=null,bd=Infinity;for(const a of data.samples){const d=(a[1]-X)**2+(a[2]-Y)**2;if(d<bd){bd=d;q=a;}}
   const lat=-(X-q[1])*q[8]+(Y-q[2])*q[7],s2=Math.sign(lat)||side;
   if(guardrailPresent(data,q[0],s2))assert(Math.abs(lat)>q[4]/2+guardrailClearance(data,q[0],s2),`${id}: board ${spot.slot} (${f.w} m) reaches ${(q[4]/2+guardrailClearance(data,q[0],s2)-Math.abs(lat)).toFixed(2)} m over the rail at s=${q[0].toFixed(0)}`);
  }
 }
 // --- Roof flags: as many as columns, not one per column; poles of many heights; a big Brazil flag.
 const plan2=flagPlan(data),roof=plan2.items.filter(t=>t.kind==='roof'),blocks=standLayout(data);
 if(blocks.length){
  assert.equal(roof.length,blocks.length*4+1,`${id}: the roof keeps its instance budget`);
  const poles=roof.map(t=>t.pole);assert(Math.max(...poles)/Math.min(...poles)>1.6,`${id}: roof poles of many heights`);
  assert(roof.some(t=>t.w>3),`${id}: a big flag on the roof`);
  const sizes=new Set(roof.map(t=>t.w.toFixed(4)));assert(sizes.size>roof.length*.9,`${id}: roof flags of their own sizes`);
  // Spacing along the row: some poles bunched (under 2.2 m), the gaps to the nearest pole far from even.
  const pts=roof.map(t=>[t.x,t.y]),near=pts.map((p,i)=>Math.min(...pts.filter((q,k)=>k!==i).map(q=>Math.hypot(q[0]-p[0],q[1]-p[1]))));
  const mean=near.reduce((u,v)=>u+v,0)/near.length,cv=Math.sqrt(near.reduce((u,v)=>u+(v-mean)**2,0)/near.length)/mean;
  assert(near.some(d=>d<2.2)&&cv>.35,`${id}: roof poles bunched and spread (${Math.min(...near).toFixed(1)}..${Math.max(...near).toFixed(1)} m, spread ${cv.toFixed(2)})`);
 }
 // High cloth casts no shadow: the roof, billboard and gantry flags by kind (a low board's flags fly at 5.4 m),
 // all of them well over the cars; low cloth (pennants, rods, marshals) casts one unless it flies over the limit.
 for(const t of plan2.items.filter(t=>HIGH_FLAGS.includes(t.kind)))assert(flagShadowless(t)&&t.up>FLAG_SHADOW_UP-2,`${id}: ${t.kind} flag ${t.up.toFixed(1)} m up casts no shadow`);
 for(const t of plan2.items.filter(t=>!HIGH_FLAGS.includes(t.kind)))assert.equal(flagShadowless(t),t.up>FLAG_SHADOW_UP,`${id}: ${t.kind} flag ${t.up.toFixed(1)} m up`);
 // --- Marshal posts: about every 360 m, alternating sides, off the beat, never under a billboard where a spot allows.
 const marshals=marshalSpots(data),L=data.meta.reconstructed_xy_m;
 // (Sides alternate, but on a plateau's rim the posts keep to the ground: the abyss side has none.)
 // (No post stands on a bridge deck, meta.decks, nor in a tunnel, meta.tunnels: a gap that spans one counts without it.)
 const overDeck=(a,b)=>[...(data.meta.decks??[]),...(data.meta.tunnels??[])].reduce((sum,[f,e])=>{const parts=f<=e?[[f,e]]:[[f,L],[0,e]];return sum+parts.reduce((u,[p,q])=>{const g=b>=a?[[a,b]]:[[a,L],[0,b]];return u+g.reduce((w,[x,y])=>w+Math.max(0,Math.min(y,q)-Math.max(x,p)),0);},0);},0);
 // (A long structure between two posts, the Minhocão's deck and tunnel, starts the beat over: the posts at its two ends
 // may stand closer, on the same side. A beat whose post found no place, its side taken all along by a pit lane as on
 // Pampulha's north shore, leaves a double gap between two posts on the same side.)
 for(let k=1;k<marshals.length;k++){const over=overDeck(marshals[k-1].s,marshals[k].s),gap=((marshals[k].s-marshals[k-1].s)%L+L)%L-over,structure=over>300;assert(gap>(structure?40:250)&&gap<480+(data.meta.decks?260:0),`${id}: post gap ${gap.toFixed(0)} m`);if(!data.scenery?.cliff&&!structure&&gap<540)assert.notEqual(marshals[k].side,marshals[k-1].side);}
 const gaps2=marshals.slice(1).map((m,k)=>m.s-marshals[k].s);if(gaps2.length>2)assert(Math.max(...gaps2)-Math.min(...gaps2)>15,`${id}: posts off a fixed beat`);
 const underBoard=marshals.filter(m=>spots.some(b=>Math.hypot(b.x-m.x,b.y-m.y)<25)).length;assert(underBoard<=1,`${id}: ${underBoard} marshal posts under a billboard`);
 report[id]={sponsors:sponsors.length,banners:banners.length,bannerSponsors:rows.size,loose:banners.filter(b=>b.hangs).length,torn:banners.filter(b=>b.rip).length,boardSizes:[...new Set(formats.map(f=>f.w))],designs:new Set(art.fronts).size,roof:roof.length,marshals:marshals.length};
}
// Each circuit has its own local businesses.
const ids=[...seen.keys()];for(let i=0;i<ids.length;i++)for(let k=i+1;k<ids.length;k++){const a=seen.get(ids[i]),b=seen.get(ids[k]),same=[...a].filter(x=>b.has(x)).length;
 if(!(['interlagos','piracicaba'].includes(ids[i])&&['interlagos','piracicaba'].includes(ids[k])))assert.equal(same,0,`${ids[i]} and ${ids[k]} share local sponsors`);}
// A near-black brand never paints a whole billboard dark: the board painter turns to its accent. Painted on a stub
// canvas (every call a no-op) that keeps the field's gradient stops and the colour each line of text is filled in.
const darks=Object.values(SPONSORS).filter(s=>luma(s.bg)<.05);assert(darks.length,'dark brands exist to test the swap');
for(const s of darks){
 const stops=[],inks=[],state={},ctx=new Proxy(state,{get:(t,k)=>k in t?t[k]:k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop:(o,c)=>stops.push(c)}):k==='measureText'?text=>({width:String(text).length*12}):k==='fillText'?()=>inks.push(t.fillStyle):()=>{},set:(t,k,v)=>{t[k]=v;return true;}});
 paintBoard(ctx,0,0,512,256,s,{seed:7});
 assert.ok(stops[0]!==s.bg&&luma(stops[0])>=.05,`${s.short??s.words}: the field is not its near-black`);
 assert.ok(inks.length&&contrast(inks[0],stops[0])>3,`${s.short??s.words}: its words read on that field`);
}
console.log(JSON.stringify(report));
console.log('testar_beira: ok');
