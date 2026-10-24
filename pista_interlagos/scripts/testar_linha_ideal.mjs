// Linha ideal (driving-line.js): the line on every circuit and car, what the real physics does on it, and the colours.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {drivingLine,drivingLineSoon,GuidePlan,effortColor,LEAD} from '../teste/driving-line.js';
import {racingLine,RaceField,ACE_STYLE} from '../teste/race-field.js';
import {TestCar,OPALA_MECHANICS,FUSCA_MECHANICS,FUSCA_BODY} from '../teste/physics.js';
import {CIRCUITS} from '../teste/circuits.js';
import {createCurveloData} from '../teste/curvelo-data.js';
import {normalizePreferences,LINE_MODES} from '../teste/player-preferences.js';
import {KEY_ACTIONS} from '../teste/key-bindings.js';
const load=id=>{const data=id==='curvelo'?createCurveloData():JSON.parse(fs.readFileSync(new URL(`../dados/${CIRCUITS[id].data??'pista.json'}`,import.meta.url)));data.meta.id=id;return data;};
const data=load('interlagos'),a=data.samples,n=a.length,L=data.meta.reconstructed_xy_m,stationAt=s=>a.findIndex(p=>p[0]>=s);
const line=drivingLine(data),rivals=racingLine(data);

// The line keeps to the road the rivals' line may use (the car body on the asphalt, off the pit wall), still reaches the
// edges through the corners, and its own model laps faster than on the rivals' line (the apexes moved for the exits).
assert.equal(line.n,n);
assert(line.off.every((d,i)=>d>=rivals.lo[i]-1e-9&&d<=rivals.hi[i]+1e-9),'line inside the racing line bounds');
assert(line.off.every((d,i)=>Math.abs(d)<a[i][4]/2-.8),'line keeps the car body on the asphalt');
assert(line.off.filter((d,i)=>Math.abs(d)>.7*(a[i][4]/2)).length>n*.2,'line uses the whole road in the corners');
assert(line.time<line.minCurvature-1,`line gains on the rivals' line: ${line.minCurvature.toFixed(2)} -> ${line.time.toFixed(2)} s`);
assert(drivingLine(data)===line,'laid once per circuit and car');
// Smooth: no kink between stations (the bend's change over 2 m stays small).
let kink=0;for(let i=0;i<n;i++)kink=Math.max(kink,Math.abs(line.kap[(i+1)%n]-line.kap[i]));
assert(kink<.006,`line bends smoothly (${kink.toFixed(4)} 1/m per station)`);

// Corner by corner (the same model, the colours' tyres): no corner of Interlagos is slower on the line, from 120 m
// before it to 120 m after; and most take a wider arc, the slowest speed in them higher.
const onRivalsLine=new GuidePlan({n,samples:a,off:rivals.off,mechanics:OPALA_MECHANICS},1),onDrivingLine=new GuidePlan(line,1),wrapK=k=>(k%n+n)%n;
const through=(p,c)=>{let t=0;for(let k=c.start-60;k<c.end+60;k++)t+=2*line.ds/(p.speed(wrapK(k))+p.speed(wrapK(k+1)));return t;};
const slowest=(p,c)=>{let v=Infinity;for(let k=c.start-30;k<=c.end+10;k++)v=Math.min(v,p.speed(wrapK(k)));return v;};
assert(rivals.corners.every(c=>through(onDrivingLine,c)<=through(onRivalsLine,c)+.05),'no corner slower on the line');
assert(rivals.corners.filter(c=>slowest(onDrivingLine,c)>slowest(onRivalsLine,c)+.5).length>=.7*rivals.corners.length,'wider arcs: faster through the slowest point of most corners');

// The real car: the game's clean driver (ACE_STYLE, apex 0) laps the player's TestCar on the driving line faster than on the
// rivals' line, and never off the asphalt.
function lapOn(off,laps=3){
 const field=new RaceField(data,{seed:3}),car=new TestCar(data);car.resetGrid();field.reset(car.surface.s,{entrants:[]});
 const shaped={...rivals,off:Float64Array.from(off),curve:Float64Array.from(off===rivals.off?rivals.curve:line.kap)};field.line=shaped;field.plain.line=shaped;
 const style={...ACE_STYLE,apex:0};let off_=0;
 for(let step=0;step<120*60*8&&car.laps<laps;step++){car.step(field.heroInput(car,1/120,style),1/120);field.step(car,1/120,0);if(!car.surface.onRoad&&!car.surface.pit)off_++;}
 return {best:car.best,laps:car.laps,off:off_/120};
}
const onRivals=lapOn(rivals.off),onLine=lapOn(line.off);
assert.equal(onLine.laps,3);assert.equal(onLine.off,0,'never off the asphalt on the driving line');
assert(onLine.best<onRivals.best-.2,`the real physics is faster on the driving line: ${onRivals.best.toFixed(2)} -> ${onLine.best.toFixed(2)} s`);

// The colours. On the main straight before the S do Senna, the faster the car the sooner the red: at each speed it starts
// where the brakes must go on (driving on at full throttle until then), the LEAD seconds before it fading to yellow.
const plan=new GuidePlan(line,1),i0=stationAt(4000),brakeAt=v=>plan.effort(i0,v,300).findIndex(e=>e>=.12)*line.ds;
const marks=[100,150,180,200].map(kmh=>Math.round(brakeAt(kmh/3.6)));
assert(marks.every((m,j)=>m>200&&(j===0||m<marks[j-1])),`red sooner at higher speed: ${marks.join(', ')} m`);
const run=plan.effort(i0,200/3.6,300),first=run.findIndex(e=>e>=.12);
assert(run.slice(0,first-20).every(e=>e<-.9),'green down the straight');
assert(run.slice(first-8,first).some(e=>e>-.8),'yellow just before the braking point');
assert(Math.max(...run.slice(first,first+40))>.6,'deep red where the brakes go on hard');
// A car already too fast for the bend in front sees red under it; one crawling sees no red there.
const senna=stationAt(300);
assert(plan.effort(senna-15,150/3.6,10)[0]>.9,'too fast for the corner: red right away');
assert(plan.effort(senna-15,40/3.6,10).every(e=>e<.12),'slow into the corner: no red');
// The whole lap: mostly green, some yellow (bends at their limit, the lifts), a fifth or so red.
const share=f=>plan.still.filter(f).length/n;
assert(share(e=>e<-.5)>.5&&share(e=>e>=-.5&&e<.12)>.05&&share(e=>e>=.12)>.1&&share(e=>e>=.12)<.35,'the lap in green, yellow and red');
assert(plan.time>line.time,'the colours ask a little less than the limit');
// Rain: the same speed meets the red sooner, and the lap is slower.
const wet=new GuidePlan(line,.75),wetAt=wet.effort(i0,180/3.6,300).findIndex(e=>e>=.12)*line.ds;
assert(wetAt<marks[2]-20&&wet.time>plan.time+5,`rain brakes sooner (${marks[2]} -> ${wetAt} m) and laps slower`);
assert(plan.setGrip(1)===false&&plan.setGrip(.8)===true&&plan.setGrip(1)===true,'a new plan only when the tyres change');
// Colours: green, yellow, red at -1, 0, 1.
const [g,y,r]=[-1,0,1].map(e=>effortColor(e));
assert(g[1]>g[0]&&g[1]>g[2]&&y[0]>.9&&y[1]>.5&&y[2]<.2&&r[0]>.9&&r[1]<.2,'green, yellow, red');
assert(LEAD>0);

// The Fusca gets its own line and pace; the slice-by-slice laying gives the same line.
const fusca=drivingLine(data,FUSCA_MECHANICS),fuscaPlan=new GuidePlan(fusca,1);
assert(fusca!==line&&fusca.mechanics===FUSCA_MECHANICS&&fuscaPlan.time>plan.time+5,'the Fusca: its own line, slower');
const soon=await drivingLineSoon(load('interlagos'),OPALA_MECHANICS,2);
assert(soon.off.every((d,i)=>Math.abs(d-line.off[i])<1e-12),'laid a slice at a time: the same line');
assert.equal(await drivingLineSoon(data,OPALA_MECHANICS),line,'a line already laid comes back at once');

// Every circuit, both cars: inside the bounds, on the asphalt, never slower than the rivals' line.
for(const id of [...Object.keys(CIRCUITS),'curvelo'].filter((v,i,list)=>list.indexOf(v)===i)){
 const d=load(id),b=d.branches?.length?null:racingLine(d);
 for(const m of [OPALA_MECHANICS,FUSCA_MECHANICS]){
  const l=drivingLine(d,m),bounds=b??l;
  assert(l.off.every((o,i)=>o>=bounds.lo[i]-1e-9&&o<=bounds.hi[i]+1e-9&&Math.abs(o)<d.samples[i][4]/2-.8),`${id} ${m.name}: inside the asphalt`);
  assert(l.time<=l.minCurvature+1e-6,`${id} ${m.name}: no slower than the rivals' line`);
  const p=new GuidePlan(l,1);assert(Number.isFinite(p.time)&&p.still.every(Number.isFinite),`${id} ${m.name}: a plan`);
 }
}
// The Fusca on its line with the real physics: round Interlagos without leaving the asphalt.
{const field=new RaceField(data,{seed:3,body:FUSCA_BODY}),car=new TestCar(data).setBody(FUSCA_BODY);car.resetGrid();field.reset(car.surface.s,{entrants:[]});
 const shaped={...rivals,off:Float64Array.from(fusca.off),curve:Float64Array.from(fusca.kap)},style={...ACE_STYLE,apex:0};field.line=shaped;field.plain.line=shaped;let off_=0;
 for(let step=0;step<120*60*6&&car.laps<2;step++){car.step(field.heroInput(car,1/120,style),1/120);field.step(car,1/120,0);if(!car.surface.onRoad&&!car.surface.pit)off_++;}
 assert(car.laps===2&&off_===0,'the Fusca drives its line on the asphalt');}

// The setting: off unless picked; O in the keyboard's list.
assert.deepEqual(LINE_MODES,['desligada','completa','curvas']);
assert.equal(normalizePreferences({}).drivingLine,'desligada');
assert.equal(normalizePreferences({drivingLine:'curvas'}).drivingLine,'curvas');
assert.equal(normalizePreferences({drivingLine:'<b>'}).drivingLine,'desligada');
assert.deepEqual(KEY_ACTIONS.find(k=>k.id==='linha')?.codes,['KeyO']);
console.log(`Linha ideal OK · Interlagos ${line.minCurvature.toFixed(2)} -> ${line.time.toFixed(2)} s (modelo), física ${onRivals.best.toFixed(2)} -> ${onLine.best.toFixed(2)} s; freada antes do S do Senna a ${marks.join('/')} m (100/150/180/200 km/h)`);
