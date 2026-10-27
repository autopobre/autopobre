import {CIRCUITS,circuitId} from './circuits.js';
import {PLAYER_ENTRY} from './race-roster.js';
import {pointsText} from './championship.js';
export const formatTime=value=>Number.isFinite(value)&&value>0?`${String(Math.floor(value/60)).padStart(2,'0')}:${(value%60).toFixed(3).padStart(6,'0')}`:'—';
// mode.playerEntry: the car a multiplayer guest races (multiplayer.js); otherwise the Opala 99.
export function resultRows(mode){
 const rows=(mode.freeOrder??[]).map(entry=>({...entry})),me=mode.playerEntry??PLAYER_ENTRY;
 // (a multiplayer room's race ended by its host before this car was in: its time estimated, immersive-mode.js endFreeRace)
 // (a race its host watched: no row of its own, multiplayer.js Só assistir)
 if(!mode.finishWatched)rows.splice(Math.max(0,(mode.finishPosition??mode.freePosition)-1),0,{...me,name:mode.pilotName||me.name,bestLap:mode.finishBest,totalTime:mode.finishTime,finished:!mode.finishEstimated,...(mode.finishEstimated&&{estimated:true}),player:true});
 return rows.map((row,index)=>({...row,position:index+1}));
}
export class RaceResults {
 // championship: the scored round (championship.js summary) of a championship race, or null.
 // rerunLabel: what the rerun button says instead of "Correr novamente" (a multiplayer guest's).
 constructor({onRestart,onSettings,onRecords,onMainMenu,onPodium,onNextRound,onChampionship,rerunLabel}){this.championship=null;this.rerunLabel=rerunLabel;
  this.root=document.createElement('section');this.root.id='raceResults';this.root.hidden=true;this.root.setAttribute('aria-label','Resultado Auto-Pobre Racing');
  this.root.innerHTML=`<div class="results-sheet"><div class="results-top"><div><span class="results-kicker">AUTO-POBRE RACING</span><h1>RESULTADO DA CORRIDA</h1><p class="results-circuit"><b id="resultsCircuit">INTERLAGOS</b> <span id="resultsMode"></span></p></div><img src="./assets/abertura/logo_auto_pobre_racing_v2.webp" alt="Auto-Pobre Racing" width="1774" height="887"></div><div class="results-summary"><strong id="resultsPlace"></strong><span id="resultsTime"></span><span id="resultsFastest"></span></div><div id="resultsChampionshipLine" class="results-championship" hidden></div><div class="results-scroll"><table class="results-table"><thead><tr><th scope="col">POS</th><th scope="col">Nº</th><th scope="col">PILOTO / DUPLA</th><th scope="col">MELHOR VOLTA</th><th scope="col">TEMPO TOTAL</th><th scope="col" class="results-points" hidden>PTS</th></tr></thead><tbody></tbody></table></div><p class="results-footnote">Tempos registrados na sua bandeirada; ≈ é a estimativa de quem ainda estava na pista, completando a prova no ritmo que vinha fazendo. — indica que ainda não houve volta válida.</p><div class="results-actions"><button id="resultsContinue" class="results-primary">Correr novamente →</button><button id="resultsChampionship" hidden>Classificação do campeonato</button><button id="resultsRecords">Recordes de tempo</button><button id="resultsSettings">Configurações</button></div><div id="resultsRecordsPanel" hidden></div></div>`;
  const mainMenu=document.createElement('button');mainMenu.id='resultsMainMenu';mainMenu.textContent='Escolher outra pista';mainMenu.onclick=onMainMenu;this.root.querySelector('.results-actions').insertBefore(mainMenu,this.root.querySelector('#resultsRecords'));
  document.body.append(this.root);this.root.querySelector('#resultsContinue').onclick=()=>{if(this.mode.active){this.dismissed=true;this.root.hidden=true;onPodium?.();}else if(this.championship)(this.championship.final?onChampionship:onNextRound)?.();else onRestart();};this.root.querySelector('#resultsChampionship').onclick=()=>onChampionship?.();this.root.querySelector('#resultsSettings').onclick=onSettings;this.root.querySelector('#resultsRecords').onclick=()=>onRecords(this.mode);
 }
 update(mode,paused,settingsOpen){
  this.mode=mode;
  if(this.snapshot!==mode.freeOrder){this.snapshot=mode.freeOrder;this.dismissed=false;this.rendered=false;}
  const ready=mode.active?mode.state.phase==='podium':mode.freeResultReady&&paused;
  this.root.hidden=!(ready&&this.snapshot&&!this.dismissed&&!settingsOpen);
  if(!this.root.hidden&&!this.rendered){this.render(mode);this.rendered=true;}
 }
 render(mode){
  const rows=resultRows(mode),best=rows.filter(r=>Number.isFinite(r.bestLap)&&r.bestLap>0).sort((a,b)=>a.bestLap-b.bestLap)[0];this.rows=rows;
  const $=id=>this.root.querySelector('#'+id);
  $('resultsCircuit').textContent=CIRCUITS[circuitId(mode.data?.meta.id)].name.toUpperCase();
  const laps=(mode.active?mode.storyLaps:mode.freeTotalLaps)??3;$('resultsMode').textContent=`/ ${mode.active?'IMERSIVA':mode.freeLineup?.length===1?'CORRIDA 1x1':'CORRIDA'} · ${laps} VOLTA${laps>1?'S':''}`;
  $('resultsPlace').textContent=mode.finishWatched?'VOCÊ ASSISTIU À CORRIDA':mode.finishEstimated?`CORRIDA ENCERRADA · VOCÊ FICOU EM ${mode.finishPosition}º / ${rows.length} (ESTIMADO)`:`VOCÊ CHEGOU EM ${mode.finishPosition}º / ${rows.length}`;
  $('resultsTime').textContent=mode.finishWatched?'':`TOTAL ${mode.finishEstimated?'≈ ':''}${formatTime(mode.finishTime)}`;
  $('resultsFastest').textContent=best?`VOLTA MAIS RÁPIDA · #${best.number} · ${formatTime(best.bestLap)}`:'VOLTA MAIS RÁPIDA · —';
  // A championship round: its points, the standings and the next round instead of a rerun
  // (in Modo História the podium comes first, as in any story race).
  const champ=this.championship,points=champ?this.championship.points:null;
  $('resultsContinue').textContent=mode.active?'Continuar para o pódio →':champ?(champ.final?'Ver a classificação final →':`Próxima etapa: ${champ.nextName} →`):this.rerunLabel?.()??'Correr novamente →';
  $('resultsChampionship').hidden=!champ;this.root.querySelector('th.results-points').hidden=!champ;$('resultsChampionshipLine').hidden=!champ;
  if(champ){const me=champ.player,mine=champ.rows.find(r=>r.player);
   $('resultsMode').textContent=`/ ${mode.active?'HISTÓRIA · ':''}${champ.label??'CAMPEONATO'} · ETAPA ${champ.round} DE ${champ.total}${champ.date?' · '+champ.date.toUpperCase():''} · ${laps} VOLTA${laps>1?'S':''}`;
   $('resultsChampionshipLine').textContent=champ.final
    ?(me.position===1?`CAMPEÃO! +${mine?.points??0} pts nesta etapa e o título com ${pointsText(me.points)}.`:`FIM DO CAMPEONATO · +${mine?.points??0} pts · você fechou em ${me.position}º com ${pointsText(me.points)} · campeão: #${champ.champion.number} ${champ.champion.shortName}`)
    :me.position===1?`CAMPEONATO · +${mine?.points??0} pts nesta etapa · você lidera com ${pointsText(me.points)} · 2º: #${champ.standings[1].number} ${champ.standings[1].shortName} (${champ.standings[1].points})`
    :`CAMPEONATO · +${mine?.points??0} pts nesta etapa · você é ${me.position}º no geral com ${pointsText(me.points)} · líder: #${champ.standings[0].number} ${champ.standings[0].shortName} (${champ.standings[0].points})`;}
  // What broke ("ABANDONOU · superaquecimento") needs a wider time column than a time does.
  this.root.querySelector('.results-table').classList.toggle('results-has-dnf',rows.some(r=>!r.finished&&r.dnf&&r.breakdown));
  const body=this.root.querySelector('tbody');body.replaceChildren();
  for(const row of rows){const tr=document.createElement('tr');if(row.player)tr.classList.add('results-player');
   // A retirement (race-field.js breakdowns, or the story's tow) is classified DNF, with what broke.
   // Still on the track at the flag: the estimated time to the line (race-field.js classification).
   const values=[row.dnf?'DNF':`${row.position}º`,row.number,row.name+(row.player?' · VOCÊ':''),formatTime(row.bestLap),row.finished?formatTime(row.totalTime):row.dnf?`ABANDONOU${row.breakdown?' · '+row.breakdown:''}`:row.estimated?`≈ ${formatTime(row.totalTime)}`:'NA PISTA'];
   if(points)values.push(`+${points.get(String(row.number))??0}`);
   values.forEach((value,i)=>{const cell=document.createElement(i===2?'th':'td');if(i===2)cell.scope='row';cell.textContent=value;if(i===3&&best&&row.number===best.number)cell.className='results-best';if(i===4&&!row.finished&&row.dnf)cell.className='results-dnf';if(i===4&&row.estimated){cell.className='results-estimated';cell.title='Estimado: o que faltava da prova, no ritmo que vinha fazendo';}if(i===5)cell.className='results-points';tr.append(cell);});body.append(tr);
  }
 }
}
