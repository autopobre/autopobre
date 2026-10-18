import {CIRCUITS,raceLaps} from './circuits.js';
import {rosterOf,PLAYER_ENTRY,carEntry,CAR_MODELS} from './race-roster.js';

// Campeonato Old Stock do jogo: todas as pistas, uma corrida em cada, pontos pela posição de
// chegada e uma classificação geral com os 15 carros do grid. Each game mode (Modo Corrida,
// Modo História) keeps its own championship, for each calendar it offers. The points table is the game's
// own, not an official regulation. Progress lives in this browser.
// Todas as pistas: every circuit in circuits.js, the oval closing the season, so a new track joins
// by itself. A championship under way gets it as an extra round at the end (one saved before
// Chapecó opened ran four rounds); a finished one keeps its calendar.
export const CHAMPIONSHIP_ROUNDS=Object.freeze(Object.keys(CIRCUITS).sort((a,b)=>(a==='curvelo')-(b==='curvelo')));
const FIRST_CALENDAR=['interlagos','cascavel','piracicaba','curvelo'];
// The Old Stock Race 2026 season as announced (subject to change): eight rounds with their dates,
// Interlagos twice in a row. A circuit not built yet shows as coming soon and holds the start.
export const OLD_STOCK_2026=Object.freeze([
 ['brasilia','Brasília - DF','21 e 22 MAR'],['interlagos','Interlagos - SP','18 e 19 ABR'],['interlagos','Interlagos - SP','30 e 31 MAI'],
 ['cascavel','Cascavel - PR','11 e 12 JUL'],['interlagos','Interlagos - SP','01 e 02 AGO'],['cascavel','Cascavel - PR','19 e 20 SET'],
 ['chapeco','Chapecó - SC','31 OUT e 01 NOV'],['interlagos','Interlagos - SP','19 e 20 DEZ']].map(([circuit,place,date])=>Object.freeze({circuit,place,date})));
// The Copa Fusca Seineca 2026 calendar as announced (subject to change): eleven rounds, six at
// Interlagos. Raced in Fuscas (model), in Modo Corrida only: the story's Opala 99 does not race it.
export const COPA_FUSCA_2026=Object.freeze([
 ['interlagos','Interlagos - SP','21 e 22 FEV'],['brasilia','Brasília - DF','21 e 22 MAR'],['interlagos','Interlagos - SP','18 e 19 ABR'],
 ['interlagos','Interlagos - SP','16 e 17 MAI'],['interlagos','Interlagos - SP','06 e 07 JUN'],['cascavel','Cascavel - PR','11 e 12 JUL'],
 ['interlagos','Interlagos - SP','01 e 02 AGO'],['goiania','Goiânia - GO','19 e 20 SET'],['cascavel','Cascavel - PR','17 e 18 OUT'],
 ['chapeco','Chapecó - SC','21 e 22 NOV'],['interlagos','Interlagos - SP','19 e 20 DEZ']].map(([circuit,place,date])=>Object.freeze({circuit,place,date})));
export const CHAMPIONSHIP_MODES=Object.freeze(['corrida','historia']);
export const CHAMPIONSHIP_CALENDARS=Object.freeze({
 todas:Object.freeze({id:'todas',name:'Todas as pistas',title:'Todas as pistas, somando pontos',label:'CAMPEONATO',modes:Object.freeze(['corrida']),rounds:Object.freeze(CHAMPIONSHIP_ROUNDS.map(circuit=>Object.freeze({circuit})))}),
 oldstock2026:Object.freeze({id:'oldstock2026',name:'Old Stock 2026',title:'Temporada 2026, nas datas da Old Stock',label:'OLD STOCK 2026',modes:CHAMPIONSHIP_MODES,rounds:OLD_STOCK_2026}),
 copafusca2026:Object.freeze({id:'copafusca2026',name:'Copa Fusca 2026',title:'Temporada 2026, nas datas da Copa Fusca Seineca',label:'COPA FUSCA 2026',modes:Object.freeze(['corrida']),model:'fusca',kind:'de Fusca',rounds:COPA_FUSCA_2026})});
// The calendars a mode offers (its tabs, in order): Modo Corrida all three, Modo História only the
// Old Stock 2026 season (its career runs on it). One a mode does not offer falls back to its first.
export const calendarsFor=mode=>Object.keys(CHAMPIONSHIP_CALENDARS).filter(id=>CHAMPIONSHIP_CALENDARS[id].modes.includes(mode));
export const championshipCalendar=(id,mode)=>Object.hasOwn(CHAMPIONSHIP_CALENDARS,id)&&(!mode||CHAMPIONSHIP_CALENDARS[id].modes.includes(mode))?id:mode?calendarsFor(mode)[0]??'todas':'todas';
// Every finishing position scores, so a comeback from the back still counts.
export const CHAMPIONSHIP_POINTS=Object.freeze([25,20,16,13,11,10,9,8,7,6,5,4,3,2,1]);
export const CHAMPIONSHIP_KEY='opala99-championship-v1';
// One save per mode and calendar; Todas as pistas keeps the keys it always had.
export const championshipKey=(mode,calendar='todas')=>`opala99-championship${mode==='historia'?'-historia':''}${calendar==='todas'?'':'-'+calendar}-v1`;
export const pointsFor=position=>CHAMPIONSHIP_POINTS[position-1]??0;
export const pointsText=n=>`${n} ponto${n===1?'':'s'}`;

const finite=value=>Number.isFinite(value)&&value>0?value:null;
const validRow=r=>r&&typeof r.number==='string'&&Number.isInteger(r.position)&&r.position>0&&Number.isFinite(r.points);
// Todas as pistas: known circuits, each once, at least the first calendar's. Another calendar: its own rounds.
function validRounds(rounds,calendar){
 if(!Array.isArray(rounds))return false;
 if(calendar!=='todas'){const own=CHAMPIONSHIP_CALENDARS[calendar].rounds;return rounds.length===own.length&&own.every((r,i)=>r.circuit===rounds[i]);}
 return rounds.every(id=>typeof id==='string'&&Object.hasOwn(CIRCUITS,id))&&new Set(rounds).size===rounds.length&&FIRST_CALENDAR.every(id=>rounds.includes(id));
}
// The model it races (the calendar's, or the one it started in; saves from before the Fusca's own field are
// the Opala's): every rival's number must be one of that field's (race-roster.js), so a Copa Fusca begun with the
// Old Stock's drivers in Fuscas starts again.
const stateModel=(s,calendar)=>CHAMPIONSHIP_CALENDARS[calendar].model??s.model??'opala';
function validState(s,mode,calendar){
 return !!s&&s.version===1&&(s.mode??'corrida')===mode&&(s.calendar??'todas')===calendar&&validRounds(s.rounds,calendar)
  &&(s.model===undefined||CAR_MODELS.includes(s.model))
  &&Array.isArray(s.results)&&s.results.length<=s.rounds.length&&s.results.every((r,i)=>r&&r.circuit===s.rounds[i]&&Array.isArray(r.rows)&&r.rows.every(validRow)
   &&r.rows.every(row=>row.player||carEntry(row.number,stateModel(s,calendar))))
  &&Number.isInteger(s.laps)&&s.laps>0;
}

// Overall standings: points, then wins, podiums, best finish and the last round's order. model: the field it races
// (race-roster.js: the Opala's Old Stock drivers or the Fusca's Copa Fusca ones).
const PLAYER_KEY=Symbol('player');
export function championshipStandings(state,model='opala'){
 const drivers=new Map(),add=(number,name,shortName)=>{if(!drivers.has(number))drivers.set(number,{number,name,shortName:shortName??name,points:0,wins:0,podiums:0,best:Infinity,rounds:[],player:false});return drivers.get(number);};
 for(const entry of rosterOf(model).rivals)add(entry.number,entry.name,entry.shortName);
 // The player's rows are the player's whatever the car (Modo Corrida's car screen: another team's
 // number), shown with the car of the latest round. The Opala 99 that Stevan Gaipo then races, and the
 // driver whose car the player took, keep rows of their own.
 const player={number:PLAYER_ENTRY.number,name:state?.pilot||PLAYER_ENTRY.name,shortName:state?.pilot||PLAYER_ENTRY.shortName,points:0,wins:0,podiums:0,best:Infinity,rounds:[],player:true};drivers.set(PLAYER_KEY,player);
 for(const [k,round] of (state?.results??[]).entries())for(const r of round.rows){
  // A retirement (dnf) or disqualification (dsq) scores nothing and counts as no finish.
  const d=r.player?Object.assign(player,{number:r.number}):add(r.number,r.name,carEntry(r.number,model)?.shortName),out=r.dnf||r.dsq;d.points+=r.points;if(!out&&r.position===1)d.wins++;if(!out&&r.position<=3)d.podiums++;if(!out)d.best=Math.min(d.best,r.position);d.rounds[k]={position:r.position,points:r.points,dnf:!!r.dnf,dsq:!!r.dsq};
 }
 // The last round raced in the championship; a driver who sat it out (the one whose car the player
 // took, or Stevan's 99 when the player raced it) comes after those who raced it.
 const n=(state?.results??[]).length-1,last=d=>d.rounds[n]?.position??Infinity;
 return [...drivers.values()].sort((a,b)=>b.points-a.points||b.wins-a.wins||b.podiums-a.podiums||a.best-b.best||last(a)-last(b)||a.number.localeCompare(b.number,'pt-BR',{numeric:true}))
  .map((d,i)=>({...d,position:i+1}));
}

export class Championship {
 // preferredModel (main.js): the model a championship not started yet would race, its standings' field until then.
 constructor(storage=null,mode='corrida',calendar='todas'){this.storage=storage;this.mode=CHAMPIONSHIP_MODES.includes(mode)?mode:'corrida';this.calendar=championshipCalendar(calendar,this.mode);this.key=championshipKey(this.mode,this.calendar);this.preferredModel=null;this.state=this.load();}
 load(){
  let s;try{s=JSON.parse(this.storage?.getItem(this.key)||'null');}catch{return null;}
  if(!validState(s,this.mode,this.calendar))return null;
  // A circuit opened since this championship started: an extra round at the end, while it runs.
  const missing=this.calendar==='todas'&&s.results.length<s.rounds.length?CHAMPIONSHIP_ROUNDS.filter(id=>!s.rounds.includes(id)):[];
  if(missing.length){s.rounds.push(...missing);this.state=s;this.save();}
  return s;
 }
 save(){try{if(this.state)this.storage?.setItem(this.key,JSON.stringify(this.state));else this.storage?.removeItem(this.key);}catch{}}
 get started(){return !!this.state;}
 get finished(){return !!this.state&&this.state.results.length>=this.state.rounds.length;}
 get active(){return !!this.state&&!this.finished;}
 // Index of the round still to be raced (equals the number of rounds already scored).
 get round(){return this.state?.results.length??0;}
 get rounds(){return this.state?.rounds??CHAMPIONSHIP_CALENDARS[this.calendar].rounds.map(r=>r.circuit);}
 get total(){return this.rounds.length;}
 get info(){return CHAMPIONSHIP_CALENDARS[this.calendar];}
 // The model its rounds race: the calendar's (the Copa Fusca's Fuscas), else the one it started in.
 get model(){return this.info.model??this.state?.model??this.preferredModel??'opala';}
 // The calendar on screen: each round's circuit with, in a real season, its place and dates.
 get schedule(){const own=this.info.rounds;return this.rounds.map((circuit,k)=>own[k]?.circuit===circuit?own[k]:{circuit});}
 // Every round on a circuit the game has (a season's circuit not built yet holds the start).
 get available(){return this.rounds.every(id=>Object.hasOwn(CIRCUITS,id));}
 get nextCircuit(){return this.active?this.state.rounds[this.round]:null;}
 get laps(){return this.state?.laps??null;}
 // The laps a round runs: the championship's, or the one its circuit fixes (circuits.js fixedLaps: Pampulha's single lap).
 roundLaps(circuit=this.nextCircuit){return this.state?raceLaps(circuit,this.state.laps):null;}
 // model: the car screen's when it starts (Modo História: the Opala); a calendar with its own keeps that one.
 start(pilot,laps,model='opala'){if(!this.available)return null;this.state={version:1,mode:this.mode,calendar:this.calendar,model:this.info.model??(CAR_MODELS.includes(model)?model:'opala'),pilot,laps,rounds:[...this.rounds],results:[],started:new Date().toISOString()};this.save();return this.state;}
 reset(){this.state=null;this.save();}
 // Scores a finished race (rows in finishing order, as in race-results.js resultRows) once:
 // only the round due, at its circuit. Returns the summary shown on the result sheet.
 record(round,circuit,rows,pilot){
  if(!this.active||round!==this.round||circuit!==this.nextCircuit||!rows?.length)return null;
  if(pilot)this.state.pilot=pilot;
  const scored=rows.map((r,i)=>({number:String(r.number),name:r.player?(pilot||r.name):r.name,position:i+1,points:r.dnf?0:pointsFor(i+1),bestLap:finite(r.bestLap),totalTime:r.finished?finite(r.totalTime):null,finished:!!r.finished,player:!!r.player,...(r.dnf?{dnf:true}:{})}));
  this.state.results.push({circuit,laps:this.roundLaps(circuit),rows:scored,date:new Date().toISOString()});this.save();
  return this.summary(round);
 }
 // Modo História: taking the car to the box before the judge's inspection disqualifies the
 // player after the podium; the round already scored loses the player's points.
 disqualify(round){
  const row=this.state?.results[round]?.rows.find(r=>r.player);if(!row||row.dsq)return false;
  row.points=0;row.dsq=true;this.save();return true;
 }
 standings(){return championshipStandings(this.state,this.model);}
 // What a scored round meant: its points, the standings after it and what comes next.
 summary(round=this.round-1){
  const result=this.state?.results[round];if(!result)return null;
  const standings=this.standings(),player=standings.find(d=>d.player),next=this.nextCircuit;
  return {round:round+1,total:this.total,label:this.info.label,date:this.schedule[round]?.date??null,circuit:result.circuit,circuitName:CIRCUITS[result.circuit].name,rows:result.rows,
   points:new Map(result.rows.map(r=>[r.number,r.points])),standings,player,final:this.finished,next,nextName:next?CIRCUITS[next]?.name??next:null,champion:this.finished?standings[0]:null};
 }
}
