import {CIRCUITS} from './circuits.js';
import {CHAMPIONSHIP_CALENDARS,CHAMPIONSHIP_POINTS,calendarsFor,pointsText} from './championship.js';
import {MODEL_NAMES} from './race-roster.js';

// The championship on screen: the panel of the track screen (calendar tabs, rounds, status, top
// five) and the full standings dialog, opened from there and from the result sheet.
// A round's column: the circuit id's first letters (INT, CAS, PIR, CHA, CUR, BRA…).
const code=id=>id.slice(0,3).toUpperCase();
// A round's name: the season's place ("Interlagos - SP") or the game's name for the circuit.
const roundName=r=>r.place??CIRCUITS[r.circuit]?.name??r.circuit;
const el=(tag,props={},...children)=>{const node=document.createElement(tag);Object.assign(node,props);node.append(...children);return node;};
const ordinal=n=>`${n}º`;
const MODE_NAME={corrida:'MODO CORRIDA',historia:'MODO HISTÓRIA'};
// A round's place: retirements and disqualifications score nothing.
const placeText=r=>r.dsq?'DSQ':r.dnf?'AB':ordinal(r.position);

export function renderChampionshipPanel(root,championship){
 const $=id=>root.querySelector('#'+id),state=championship.state,round=championship.round,info=championship.info;
 // One tab per calendar the mode offers (championship.js calendarsFor); main.js switches them.
 const tabs=$('championshipTabs');tabs.replaceChildren(...calendarsFor(championship.mode).map(id=>CHAMPIONSHIP_CALENDARS[id]).map(c=>{
  const on=c.id===championship.calendar,tab=el('button',{type:'button',role:'tab',id:`championshipTab-${c.id}`,textContent:c.name,tabIndex:on?0:-1});
  tab.dataset.championshipCalendar=c.id;tab.setAttribute('aria-selected',String(on));tab.setAttribute('aria-controls','championshipCalendar');return tab;}));
 // A single calendar (Modo História's Old Stock season) needs no tabs.
 tabs.hidden=tabs.children.length<2;
 $('championshipTitle').textContent=info.title;
 const calendar=$('championshipCalendar'),schedule=championship.schedule;calendar.replaceChildren();
 calendar.classList.toggle('dated',schedule.some(r=>r.date));calendar.classList.toggle('long',schedule.length>6);calendar.setAttribute('aria-labelledby','championshipTab-'+championship.calendar);
 const standings=championship.standings(),player=standings.find(d=>d.player);
 schedule.forEach((r,k)=>{
  const done=state?.results[k],mine=done?.rows.find(r=>r.player),current=championship.active&&k===round,soon=!Object.hasOwn(CIRCUITS,r.circuit);
  const item=el('li',{className:done?'done':current?'next':soon?'soon':'',title:[roundName(r),r.date].filter(Boolean).join(' · ')},el('b',{textContent:`${k+1}`}),el('span',{textContent:roundName(r)}),el('i',{textContent:code(r.circuit)}));
  if(r.date)item.append(el('small',{textContent:r.date}));
  item.append(el('em',{textContent:mine?`${placeText(mine)} · +${mine.points}`:current?'próxima':soon?'em breve':'—'}));
  calendar.append(item);
 });
 $('championshipKicker').textContent=`CAMPEONATO · ${MODE_NAME[championship.mode]??MODE_NAME.corrida}`;
 const status=$('championshipStatus'),start=$('championshipStart'),reset=$('championshipReset'),table=$('championshipTableButton'),mini=$('championshipMini');
 mini.replaceChildren();start.disabled=!championship.available;
 // "11 etapas de Fusca": a calendar raced in another car says so (championship.js kind).
 const rounds=[`${schedule.length} etapas`,info.kind].filter(Boolean).join(' ');
 if(!state&&!championship.available){
  const soon=schedule.find(r=>!Object.hasOwn(CIRCUITS,r.circuit));
  status.textContent=`${rounds} nas datas da temporada. ${roundName(soon).split(' - ')[0]} ainda está sendo construída: o campeonato abre assim que a pista ficar pronta.`;
  start.textContent=`Em breve: ${roundName(soon).split(' - ')[0]}`;
 }else if(!state){
  status.textContent=`${rounds}, ${schedule.some(r=>r.date)?'nas datas da temporada (sujeitas a alterações)':'uma corrida em cada pista'}. Pontos para os 15: ${CHAMPIONSHIP_POINTS.slice(0,3).join(', ')}… até 1.`;
  start.textContent='Começar campeonato →';
 }else{
  status.textContent=championship.finished
   ?`Campeonato encerrado. Campeão: #${standings[0].number} ${standings[0].shortName}. Você terminou em ${ordinal(player.position)} com ${pointsText(player.points)}.`
   :round===0?`Etapa 1 de ${championship.total}: ${CIRCUITS[championship.nextCircuit].name}, ${state.laps} volta${state.laps>1?'s':''}.`
   :`Você é ${ordinal(player.position)} com ${pointsText(player.points)}. Próxima: etapa ${round+1}, ${CIRCUITS[championship.nextCircuit].name}.`;
  start.textContent=championship.finished?'Novo campeonato →':round===0?'Largar na etapa 1 →':`Correr a etapa ${round+1} →`;
  if(round>0)for(const d of standings.slice(0,5).concat(player.position>5?[player]:[]))
   mini.append(el('li',{className:d.player?'player':''},el('b',{textContent:ordinal(d.position)}),el('span',{textContent:`#${d.number} ${d.shortName}`}),el('em',{textContent:`${d.points}`})));
 }
 mini.hidden=!mini.children.length;
 reset.hidden=!championship.active||round===0;table.hidden=!state||round===0;
}

export class ChampionshipDialog {
 constructor(){
  this.dialog=el('dialog',{id:'championshipDialog'});this.dialog.setAttribute('aria-labelledby','championshipDialogTitle');
  this.dialog.innerHTML=`<div class="champ-head"><div><span id="championshipDialogMode">CAMPEONATO OLD STOCK · AUTO-POBRE RACING</span><h2 id="championshipDialogTitle">CLASSIFICAÇÃO GERAL</h2></div><button id="championshipClose" type="button" aria-label="Fechar classificação">✕</button></div><p id="championshipBanner"></p><div class="champ-scroll"><table><thead></thead><tbody></tbody></table></div><p class="champ-note">Pontos por posição de chegada: ${CHAMPIONSHIP_POINTS.map((p,i)=>`${i+1}º ${p}`).join(' · ')}. AB abandono e DSQ desclassificado: 0. Empate: vitórias, pódios e melhor chegada.</p>`;
  document.body.append(this.dialog);
  this.dialog.querySelector('#championshipClose').onclick=()=>this.dialog.close();
  this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.dialog.close();});
 }
 open(championship){
  const standings=championship.standings(),state=championship.state,$=id=>this.dialog.querySelector('#'+id);
  const player=standings.find(d=>d.player);
  $('championshipDialogMode').textContent=`${championship.calendar==='todas'?'CAMPEONATO OLD STOCK':championship.info.label} · ${MODE_NAME[championship.mode]??MODE_NAME.corrida}`;
  $('championshipBanner').textContent=championship.finished
   ?(player.position===1?`CAMPEÃO! ${player.shortName} e o ${MODEL_NAMES[championship.info.model]??'Opala'} ${player.number} levam o título com ${pointsText(player.points)}.`:`Campeão: #${standings[0].number} ${standings[0].name} (${standings[0].points} pts). Você fechou em ${ordinal(player.position)}.`)
   :`Depois de ${championship.round} de ${championship.total} etapas · próxima: ${CIRCUITS[championship.nextCircuit]?.name??'—'}`;
  $('championshipBanner').classList.toggle('champion',championship.finished&&player.position===1);
  const head=this.dialog.querySelector('thead');head.replaceChildren(el('tr',{},el('th',{textContent:'POS'}),el('th',{textContent:'Nº'}),el('th',{textContent:'PILOTO / DUPLA'}),
   ...championship.schedule.map((r,k)=>{const th=el('th',{textContent:code(r.circuit),title:[`Etapa ${k+1}`,roundName(r),r.date].filter(Boolean).join(' · ')});if(k>=championship.round)th.className='pending';return th;}),el('th',{textContent:'VIT'}),el('th',{textContent:'PTS'})));
  const body=this.dialog.querySelector('tbody');body.replaceChildren();
  for(const d of standings){
   const row=el('tr',{className:d.player?'player':''},el('td',{textContent:ordinal(d.position)}),el('td',{textContent:d.number}),el('th',{scope:'row',textContent:d.player?`${state?.pilot||d.shortName} · VOCÊ`:d.name}),
    ...championship.rounds.map((id,k)=>{const r=d.rounds[k],name=CIRCUITS[id]?.name??id;return el('td',{textContent:r?placeText(r):'·',title:r?`${name}: ${r.dsq?'desclassificado':r.dnf?'abandono':r.position+'º'}, ${r.points} pts`:name});}),
    el('td',{textContent:String(d.wins)}),el('td',{className:'points',textContent:String(d.points)}));
   body.append(row);
  }
  if(!this.dialog.open)this.dialog.showModal();
 }
 close(){this.dialog.close();}
}
