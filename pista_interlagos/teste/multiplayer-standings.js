// The humans' standings in a multiplayer race (multiplayer.js; the team's wish, 10-26: on the right of the screen, the
// humans who are racing and their places, like a race's timing tower, humans only, so each one knows how the others
// are doing). Each human sits at their place in the whole field as this window orders it (race distance; past the
// flag, by their finishing time), with the gap to the human ahead (how far ahead, at the speed the one behind goes),
// the flag once they are in, AB for a car left without its pilot. Shown under the lap and fuel panels, never over the
// speed panel (as many rows as fit there).
import {carEntry,PLAYER_ENTRY} from './race-roster.js';

// Below this speed (m/s) the gap is reckoned as if the car went this fast: a car stopped or creeping has no time gap
// to speak of, only "far".
const GAP_SPEED=8;
// The field in race order: cars past the flag first (by their finishing time), then by race distance.
export function raceOrder(cars){
 return [...cars].sort((a,b)=>(!!b.finished-!!a.finished)||(a.finished&&b.finished?(a.finishTime??Infinity)-(b.finishTime??Infinity):b.progress-a.progress));
}
// The humans' rows: {position (in the whole field), number, name, mine, finished, retired, gap (s to the human ahead,
// null for the first of them or once either is in)}. cars: the whole field, {number, name, progress, speed, finished,
// finishTime, retired}; humans: the numbers humans race.
export function humanStandings(cars,humans){
 const rows=[];let ahead=null;
 raceOrder(cars).forEach((c,i)=>{
  if(!humans.has(c.number))return;
  const gap=ahead&&!ahead.finished&&!c.finished?Math.max(0,ahead.progress-c.progress)/Math.max(GAP_SPEED,c.speed??0):null;
  rows.push({position:i+1,number:c.number,name:c.name,mine:!!c.mine,finished:!!c.finished,retired:!!c.retired&&!c.finished,gap});ahead=c;
 });
 return rows;
}
const gapText=s=>s===null?'':s>=60?`+${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}`:`+${s.toFixed(1)}`;
const colourOf=number=>'#'+((number==='99'?PLAYER_ENTRY.color:carEntry(number)?.color)??0x888888).toString(16).padStart(6,'0');

export class Standings {
 constructor(){
  const root=this.root=document.createElement('section');root.id='mpPlacar';root.hidden=true;root.setAttribute('aria-label','Posições dos pilotos humanos');
  const head=document.createElement('b');head.textContent='PILOTOS';this.list=document.createElement('ol');
  root.append(head,this.list);document.body.append(root);this.key='';this.room=0;
 }
 // rows: humanStandings' (none: hidden). Redrawn only when what it says changed (the gaps rounded as shown).
 show(rows){
  this.root.hidden=!rows?.length;if(!rows?.length)return;
  const key=JSON.stringify(rows.map(r=>[r.position,r.number,r.name,r.mine,r.finished,r.retired,gapText(r.gap)]));
  if(key!==this.key){
   this.key=key;
   this.list.replaceChildren(...rows.map(r=>{
    const li=document.createElement('li'),pos=document.createElement('b'),chip=document.createElement('i'),name=document.createElement('span'),state=document.createElement('small');
    li.classList.toggle('mp-placar-eu',r.mine);pos.textContent=r.position+'º';chip.textContent=r.number;chip.style.background=colourOf(r.number);
    name.textContent=r.name;state.textContent=r.finished?'🏁':r.retired?'AB':gapText(r.gap);li.append(pos,chip,name,state);return li;
   }));
  }
  this.place();
 }
 // Under the lap and fuel panels (#timing, #fuelGauge), as many rows as fit above the speed panel (#telemetry).
 place(){
  const rect=id=>{const e=document.getElementById(id);if(!e||e.offsetParent===null)return null;const r=e.getBoundingClientRect();return r.height?r:null;};
  const above=[rect('timing'),rect('fuelGauge')].filter(Boolean),below=rect('telemetry');
  const top=Math.round(Math.max(16,...above.map(r=>r.bottom))+10),room=Math.max(0,(below?.top??innerHeight)-10-top);
  if(top!==this.top){this.top=top;this.root.style.top=top+'px';}
  if(Math.abs(room-this.room)>2){this.room=room;this.root.style.maxHeight=room+'px';}
 }
 hide(){this.root.hidden=true;}
}
