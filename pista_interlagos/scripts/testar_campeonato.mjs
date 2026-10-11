// Championship (teste/championship.js): points, round order, persistence, standings, one
// championship per mode and calendar (Todas as pistas from circuits.js, Old Stock 2026, Copa Fusca 2026), new
// circuits joining a championship under way, and the story's retirements and disqualifications.
import assert from 'node:assert/strict';
import {Championship,CHAMPIONSHIP_ROUNDS,CHAMPIONSHIP_CALENDARS,OLD_STOCK_2026,COPA_FUSCA_2026,calendarsFor,championshipCalendar,CHAMPIONSHIP_POINTS,CHAMPIONSHIP_KEY,championshipKey,pointsFor,championshipStandings} from '../teste/championship.js';
import {CIRCUITS} from '../teste/circuits.js';
import {RIVAL_ROSTER} from '../teste/race-roster.js';

const memory=()=>{const data=new Map();return {getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),data};};
// A finishing order with the player (#99) at `place` (1-based), rivals in roster order.
const order=(place,rotate=0)=>{const rivals=RIVAL_ROSTER.map((e,i)=>RIVAL_ROSTER[(i+rotate)%RIVAL_ROSTER.length]).map(e=>({number:e.number,name:e.name,bestLap:80,totalTime:250,finished:true}));
 rivals.splice(place-1,0,{number:'99',name:'Piloto',player:true,bestLap:79,totalTime:249,finished:true});return rivals;};

// Todas as pistas: every circuit once, in circuits.js order, the oval last.
assert.deepEqual([...CHAMPIONSHIP_ROUNDS].sort(),Object.keys(CIRCUITS).sort());
assert.equal(CHAMPIONSHIP_ROUNDS.at(-1),'curvelo');assert.equal(CHAMPIONSHIP_ROUNDS[0],'interlagos');
assert(['cascavel','piracicaba','chapeco'].every(id=>CHAMPIONSHIP_ROUNDS.includes(id)));
const N=CHAMPIONSHIP_ROUNDS.length;
assert.equal(CHAMPIONSHIP_POINTS.length,15,'every finisher of the 15-car grid scores');
assert.equal(pointsFor(1),25);assert.equal(pointsFor(15),1);assert.equal(pointsFor(16),0);
assert(CHAMPIONSHIP_POINTS.every((p,i)=>i===0||p<CHAMPIONSHIP_POINTS[i-1]),'points fall with the position');

const storage=memory(),champ=new Championship(storage);
assert(!champ.started&&!champ.active&&champ.nextCircuit===null);
champ.start('Ana',3);
assert(champ.active&&champ.round===0&&champ.nextCircuit==='interlagos'&&champ.laps===3);
// Only the round due, at its own circuit, is scored.
assert.equal(champ.record(1,'cascavel',order(1),'Ana'),null);
assert.equal(champ.record(0,'cascavel',order(1),'Ana'),null);
const s1=champ.record(0,'interlagos',order(3),'Ana');
assert(s1&&s1.round===1&&s1.total===N&&!s1.final&&s1.next==='cascavel'&&s1.nextName==='Cascavel'&&s1.label==='CAMPEONATO'&&s1.date===null);
assert.equal(s1.points.get('99'),16,'third place scores 16');
assert.equal(s1.player.points,16);assert.equal(s1.standings[0].number,RIVAL_ROSTER[0].number);assert.equal(s1.standings[0].points,25);
assert.equal(champ.record(0,'interlagos',order(1),'Ana'),null,'a round is scored once');
// Persistence: a new instance on the same storage resumes at round 2.
const again=new Championship(storage);assert(again.active&&again.round===1&&again.nextCircuit==='cascavel');
// Broken or tampered saves are ignored.
for(const bad of ['{',JSON.stringify({version:1,rounds:['interlagos'],results:[],laps:3}),JSON.stringify({version:1,rounds:CHAMPIONSHIP_ROUNDS,results:[{circuit:'curvelo',rows:[]}],laps:3})]){
 const s=memory();s.setItem(CHAMPIONSHIP_KEY,bad);assert.equal(new Championship(s).state,null,bad.slice(0,40));
}
// The other rounds: the player wins them all and takes the title (25 a round, 16 in the first).
let last;
for(let k=1;k<N;k++){assert.equal(again.nextCircuit,CHAMPIONSHIP_ROUNDS[k]);last=again.record(k,CHAMPIONSHIP_ROUNDS[k],order(1,k),'Ana');if(k<N-1)assert.equal(last.nextName,CIRCUITS[CHAMPIONSHIP_ROUNDS[k+1]].name);}
assert.equal(last.circuitName,'Oval de Curvelo');
assert(last.final&&again.finished&&!again.active&&again.nextCircuit===null&&last.next===null);
assert.equal(last.player.points,25*(N-1)+16);assert.equal(last.champion.number,'99');assert.equal(last.player.position,1);assert.equal(last.player.wins,N-1);
const table=again.standings();
assert.equal(table.length,15);assert(table.every((d,i)=>d.position===i+1));
assert(table.every((d,i)=>i===0||d.points<=table[i-1].points),'standings sorted by points');
assert.deepEqual(table.find(d=>d.player).rounds.map(r=>r.position),[3,...Array(N-1).fill(1)]);
// A championship saved before Chapecó opened: its four rounds as they were, then each circuit
// opened since (Chapecó, and later ones) as extra rounds at the end, saved at once.
const roundRows=place=>order(place).map((r,i)=>({number:r.number,name:r.name,position:i+1,points:pointsFor(i+1),player:!!r.player}));
{const s=memory(),old=['interlagos','cascavel','piracicaba','curvelo'],added=CHAMPIONSHIP_ROUNDS.filter(id=>!old.includes(id));
 s.setItem(CHAMPIONSHIP_KEY,JSON.stringify({version:1,mode:'corrida',pilot:'Ana',laps:3,rounds:old,results:[{circuit:'interlagos',laps:3,rows:roundRows(2)}]}));
 const c=new Championship(s);assert(added.includes('chapeco'));
 assert(c.active&&c.total===4+added.length&&c.nextCircuit==='cascavel'&&c.rounds===c.state.rounds,'old save grows by the new circuits');
 assert.deepEqual(c.rounds,[...old,...added]);assert.deepEqual(JSON.parse(s.getItem(CHAMPIONSHIP_KEY)).rounds,[...old,...added],'saved with them');
 c.record(1,'cascavel',order(1),'Ana');c.record(2,'piracicaba',order(1),'Ana');assert.equal(c.nextCircuit,'curvelo','the rounds already set keep their order');
 c.record(3,'curvelo',order(1),'Ana');assert.equal(c.nextCircuit,'chapeco','Chapecó comes after them');
 for(let k=4;k<c.total;k++)c.record(k,c.nextCircuit,order(1),'Ana');assert(c.finished);}
// A finished championship keeps its calendar.
{const s=memory(),old=['interlagos','cascavel','piracicaba','curvelo'];
 s.setItem(CHAMPIONSHIP_KEY,JSON.stringify({version:1,mode:'corrida',pilot:'Ana',laps:3,rounds:old,results:old.map(circuit=>({circuit,laps:3,rows:roundRows(1)}))}));
 const c=new Championship(s);assert(c.finished&&c.total===4);}
// Old Stock 2026: the season's eight rounds and dates, Interlagos twice in a row, its own saves.
assert.deepEqual(OLD_STOCK_2026.map(r=>r.circuit),['brasilia','interlagos','interlagos','cascavel','interlagos','cascavel','chapeco','interlagos']);
assert.deepEqual(OLD_STOCK_2026.map(r=>r.date),['21 e 22 MAR','18 e 19 ABR','30 e 31 MAI','11 e 12 JUL','01 e 02 AGO','19 e 20 SET','31 OUT e 01 NOV','19 e 20 DEZ']);
assert.equal(CHAMPIONSHIP_CALENDARS.oldstock2026.rounds,OLD_STOCK_2026);
assert.equal(championshipKey('corrida','oldstock2026'),'opala99-championship-oldstock2026-v1');assert.equal(championshipKey('historia','oldstock2026'),'opala99-championship-historia-oldstock2026-v1');
{const s=memory(),season=new Championship(s,'corrida','oldstock2026');
 assert(!season.started&&season.total===8&&season.schedule[1].date==='18 e 19 ABR'&&season.schedule[0].place==='Brasília - DF');
 assert.deepEqual(new Championship(s).rounds,[...CHAMPIONSHIP_ROUNDS],'Todas as pistas is another championship');
 if(!Object.hasOwn(CIRCUITS,'brasilia')){
  // Brasília still being built: the season waits for it.
  assert(!season.available);assert.equal(season.start('Ana',3),null);assert(!season.started&&s.getItem(championshipKey('corrida','oldstock2026'))===null);
 }else{
  assert(season.available);season.start('Ana',3);assert.equal(season.nextCircuit,'brasilia');
  const r1=season.record(0,'brasilia',order(2),'Ana');assert(r1.label==='OLD STOCK 2026'&&r1.date==='21 e 22 MAR'&&r1.next==='interlagos');
  season.record(1,'interlagos',order(1),'Ana');assert.equal(season.nextCircuit,'interlagos','Interlagos again');
  assert.equal(season.record(1,'interlagos',order(1),'Ana'),null,'the same round is not scored twice');
  assert.equal(new Championship(s,'corrida','oldstock2026').round,2);assert(!new Championship(s).started,'the Todas as pistas save is untouched');
  for(let k=2;k<8;k++)season.record(k,season.nextCircuit,order(1),'Ana');assert(season.finished);
  assert.equal(season.standings().find(d=>d.player).points,20+25*7);
 }
 // A Todas as pistas save is not a season save.
 s.setItem(championshipKey('corrida','oldstock2026'),JSON.stringify({version:1,mode:'corrida',pilot:'Ana',laps:3,rounds:[...CHAMPIONSHIP_ROUNDS],results:[]}));
 assert.equal(new Championship(s,'corrida','oldstock2026').state,null);}
// Copa Fusca 2026: eleven dated rounds raced in Fuscas, six at Interlagos, Goiânia in September;
// Modo Corrida only (Modo História races only the Old Stock 2026 season).
assert.deepEqual(COPA_FUSCA_2026.map(r=>r.circuit),['interlagos','brasilia','interlagos','interlagos','interlagos','cascavel','interlagos','goiania','cascavel','chapeco','interlagos']);
assert.deepEqual(COPA_FUSCA_2026.map(r=>r.date),['21 e 22 FEV','21 e 22 MAR','18 e 19 ABR','16 e 17 MAI','06 e 07 JUN','11 e 12 JUL','01 e 02 AGO','19 e 20 SET','17 e 18 OUT','21 e 22 NOV','19 e 20 DEZ']);
assert.equal(COPA_FUSCA_2026[7].place,'Goiânia - GO');
{const cup=CHAMPIONSHIP_CALENDARS.copafusca2026;assert(cup.rounds===COPA_FUSCA_2026&&cup.model==='fusca'&&cup.label==='COPA FUSCA 2026'&&cup.name==='Copa Fusca 2026');
 assert(!CHAMPIONSHIP_CALENDARS.todas.model&&!CHAMPIONSHIP_CALENDARS.oldstock2026.model,"the other calendars race the car screen's model");}
assert.deepEqual(calendarsFor('corrida'),['todas','oldstock2026','copafusca2026']);assert.deepEqual(calendarsFor('historia'),['oldstock2026']);
assert.equal(championshipCalendar('copafusca2026','corrida'),'copafusca2026');assert.equal(championshipCalendar('copafusca2026','historia'),'oldstock2026');assert.equal(championshipCalendar('todas','historia'),'oldstock2026');
assert.equal(championshipCalendar('copafusca2026'),'copafusca2026','the remembered tab');assert.equal(championshipCalendar('nada'),'todas');
assert.equal(championshipKey('corrida','copafusca2026'),'opala99-championship-copafusca2026-v1');
{const s=memory(),cup=new Championship(s,'corrida','copafusca2026');
 assert.equal(new Championship(s,'historia','copafusca2026').calendar,'oldstock2026','no Copa Fusca in Modo História');
 assert(!cup.started&&cup.total===11&&cup.schedule[0].date==='21 e 22 FEV'&&cup.schedule[7].place==='Goiânia - GO'&&cup.info.model==='fusca');
 if(!Object.hasOwn(CIRCUITS,'goiania')){
  // Goiânia still being built: the cup waits for it.
  assert(!cup.available);assert.equal(cup.start('Ana',3),null);assert(!cup.started&&s.getItem(championshipKey('corrida','copafusca2026'))===null);
 }else{
  assert(cup.available);cup.start('Ana',3);assert.equal(cup.nextCircuit,'interlagos');
  const r1=cup.record(0,'interlagos',order(1),'Ana');assert(r1.label==='COPA FUSCA 2026'&&r1.date==='21 e 22 FEV'&&r1.next==='brasilia');
  for(let k=1;k<11;k++)cup.record(k,cup.nextCircuit,order(2),'Ana');assert(cup.finished);
  assert.deepEqual(cup.state.results.map(r=>r.circuit),COPA_FUSCA_2026.map(r=>r.circuit));
  assert.equal(cup.standings().find(d=>d.player).points,25+20*10);assert(!new Championship(s,'corrida','oldstock2026').started,'the Old Stock save is untouched');
 }
 // An Old Stock save is not a Copa Fusca save.
 s.setItem(championshipKey('corrida','copafusca2026'),JSON.stringify({version:1,mode:'corrida',calendar:'oldstock2026',pilot:'Ana',laps:3,rounds:OLD_STOCK_2026.map(r=>r.circuit),results:[]}));
 assert.equal(new Championship(s,'corrida','copafusca2026').state,null);}
// Ties: equal points (30 each) go to the driver with more wins.
const tie=championshipStandings({pilot:'X',results:[
 {circuit:'interlagos',rows:[{number:'73',name:'A',position:1,points:25},{number:'00',name:'B',position:2,points:20}]},
 {circuit:'cascavel',rows:[{number:'00',name:'B',position:6,points:10},{number:'73',name:'A',position:11,points:5}]}]});
assert.equal(tie[0].points,30);assert.equal(tie[1].points,30);assert.equal(tie[0].number,'73','same points: more wins first');
// Modo História keeps its own championship beside the Modo Corrida one.
assert.equal(championshipKey('corrida'),CHAMPIONSHIP_KEY);assert.notEqual(championshipKey('historia'),CHAMPIONSHIP_KEY);
const story=new Championship(storage,'historia');assert.equal(story.calendar,'oldstock2026','the story races the Old Stock season');
assert(!story.started&&again.finished,'the story championship starts empty; the race one is untouched');
story.start('Ana',2);assert(new Championship(storage,'historia').active&&new Championship(storage).finished);
{const s=memory();s.setItem(championshipKey('historia','oldstock2026'),storage.getItem(CHAMPIONSHIP_KEY));assert.equal(new Championship(s,'historia').state,null,'a race save is not a story save');}
// Towed in (dnf): last, no points, no finish for the tie-breaks.
const retired=order(15);retired[14]={...retired[14],finished:false,dnf:true};
const r1=story.record(0,story.rounds[0],retired,'Ana');
assert.equal(r1.points.get('99'),0);assert.equal(r1.player.points,0);assert(r1.rows.at(-1).dnf&&r1.rows.at(-1).player);
assert.equal(r1.player.best,Infinity,'a retirement is not a finish');assert(r1.player.rounds[0].dnf);
// Disqualified after a win: the round's points go, once; the win and podium do not count.
story.record(1,story.rounds[1],order(1),'Ana');assert.equal(story.summary(1).player.points,25);
assert(story.disqualify(1));assert(!story.disqualify(1),'once');assert(!story.disqualify(2),'only a scored round');
const dsq=new Championship(storage,'historia').standings().find(d=>d.player);
assert.equal(dsq.points,0);assert.equal(dsq.wins,0);assert.equal(dsq.podiums,0);assert(dsq.rounds[1].dsq&&dsq.rounds[1].position===1);
assert.equal(story.round,2,'a disqualification keeps the calendar going');
story.reset();assert(new Championship(storage).finished,'resetting one mode keeps the other');
again.reset();assert(!again.started);assert.equal(storage.getItem(CHAMPIONSHIP_KEY),null);
console.log(JSON.stringify({passed:true,rounds:CHAMPIONSHIP_ROUNDS,oldStock2026:OLD_STOCK_2026.map(r=>r.circuit),copaFusca2026:COPA_FUSCA_2026.map(r=>r.circuit),brasilia:Object.hasOwn(CIRCUITS,'brasilia'),goiania:Object.hasOwn(CIRCUITS,'goiania'),points:CHAMPIONSHIP_POINTS,champion:last.champion.number,championPoints:last.player.points}));
