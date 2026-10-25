import {CIRCUITS,circuitId} from './circuits.js';
import {readAIRecords,standardLaps} from './ai-records.js';
import {formatTime} from './race-results.js';
import {RIVAL_ROSTER,PLAYER_ENTRY} from './race-roster.js';
const KEY='autopobre-records-v1';
const validTime=t=>Number.isFinite(t)&&t>0&&t<86400;
// Race times compare only over the standard distance (3 laps, both modes; a circuit that fixes its race length,
// circuits.js fixedLaps, its own); the best lap counts in races of any length. Story race times saved before the lap
// setting were one-lap races: dropped.
export const cleanName=name=>String(name??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,32);
export function readRecords(storage){
 try{const data=JSON.parse(storage.getItem(KEY)||'[]');return Array.isArray(data)?data.filter(r=>r&&typeof r.name==='string'&&['normal','immersive'].includes(r.mode)&&cleanName(r.name)&&validTime(r.bestLap)&&(r.bestRace===null||validTime(r.bestRace)&&r.bestLap<=r.bestRace)).slice(0,200).map(r=>({circuit:circuitId(r.circuit),name:cleanName(r.name),mode:r.mode,bestLap:r.bestLap,bestRace:r.mode==='immersive'&&r.raceLaps!==standardLaps(r.circuit)?null:r.bestRace,raceLaps:standardLaps(r.circuit),date:typeof r.date==='string'?r.date:''})):[];}catch{return [];}
}
export function saveRecord(storage,{name,mode,bestLap,bestRace=null,circuit='interlagos'}){
 if(typeof circuit!=='string'||!Object.hasOwn(CIRCUITS,circuit))throw new Error('Circuito inválido.');
 name=cleanName(name);if(!name||!['normal','immersive'].includes(mode)||!validTime(bestLap)||(bestRace!==null&&(!validTime(bestRace)||bestLap>bestRace)))throw new Error('Informe o piloto e complete uma volta válida.');
 const rows=readRecords(storage),existing=rows.find(r=>r.circuit===circuit&&r.mode===mode&&r.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'));
 if(existing){const lap=Math.min(existing.bestLap,bestLap),race=bestRace===null?existing.bestRace:existing.bestRace===null?bestRace:Math.min(existing.bestRace,bestRace);if(lap===existing.bestLap&&race===existing.bestRace)return rows;existing.bestLap=lap;existing.bestRace=race;existing.date=new Date().toISOString();}
 else rows.push({circuit,name,mode,bestLap,bestRace,raceLaps:standardLaps(circuit),date:new Date().toISOString()});
 const sorted=Object.keys(CIRCUITS).flatMap(id=>['normal','immersive'].flatMap(category=>rows.filter(r=>r.circuit===id&&r.mode===category).sort((a,b)=>a.bestLap-b.bestLap).slice(0,50)));
 if(!sorted.some(r=>r.circuit===circuit&&r.mode===mode&&r.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))throw new Error('A lista guarda os 50 melhores recordes. Esse tempo ficou fora da lista.');
 try{storage.setItem(KEY,JSON.stringify(sorted));}catch{throw new Error('Não foi possível salvar neste navegador. Verifique se o armazenamento está disponível.');}
 return sorted;
}
// Save synchronously at each new best lap, including unfinished races.
export class AutomaticRecords {
 constructor(storage){this.storage=storage;this.name='';this.signature='';this.retryAt=0;}
 start(name){this.name=cleanName(name);this.signature='';this.retryAt=0;}
 update(mode,now=Date.now()){
  if(!this.name||!mode||mode.recordAssisted)return;
  // The boards are the Opala's: a race in Fuscas (their own mechanics, physics.js FUSCA_MECHANICS) keeps none.
  const model=mode.car?.mechanics?.name;if(model&&model!=='opala')return;
  const bestLap=mode.car.best;if(!validTime(bestLap)||mode.car.laps<1)return;
  // Race times only from the whole grid (fullGrid): a solo practice or a 1x1 starts at the front.
  const laps=mode.active?mode.storyLaps:mode.freeTotalLaps,completed=mode.fullGrid!==false&&laps===standardLaps(mode.data?.meta.id)&&mode.car.laps>=laps&&validTime(mode.finishTime);
  const bestRace=completed?mode.finishTime:null,circuit=circuitId(mode.data?.meta.id),category=mode.active?'immersive':'normal';
  const signature=JSON.stringify([this.name,circuit,category,bestLap,bestRace]);
  if(signature===this.signature||now<this.retryAt)return;
  try{saveRecord(this.storage,{name:this.name,circuit,mode:category,bestLap,bestRace});this.signature=signature;this.retryAt=0;mode.recordSaveError='';}
  catch(error){mode.recordSaveError=error.message;this.retryAt=now+5000;}
 }
}
// The track's records for the Box 99 garage TVs: people and the AI together, in the mode being
// played, fastest first; best laps and best races (over the standard distance). People drive
// the Opala 99; the pilot playing now is marked (me) and, below the top rows, takes the last
// line with his own place.
export function trackRecords(storage,circuit,mode,pilot='',limit=8){
 const me=cleanName(pilot).toLocaleLowerCase('pt-BR'),mine=r=>r.source==='human'&&!!me&&r.name.toLocaleLowerCase('pt-BR')===me;
 const rows=[...readRecords(storage).map(r=>({...r,source:'human'})),...readAIRecords(storage)].filter(r=>r.circuit===circuitId(circuit)&&r.mode===mode);
 const shown=(list,time)=>{const top=list.slice(0,limit),own=list.findIndex(mine);if(own>=limit)top[limit-1]=list[own];
  return top.map(r=>{const ai=r.source==='ai',entry=ai?RIVAL_ROSTER.find(e=>e.number===r.number):PLAYER_ENTRY;return {place:list.indexOf(r)+1,number:entry?.number??r.number,name:ai?entry?.shortName??r.name:r.name,color:entry?.color??PLAYER_ENTRY.color,time:formatTime(r[time]),ai,me:mine(r)};});};
 return {lap:shown([...rows].sort((a,b)=>a.bestLap-b.bestLap),'bestLap'),race:shown(rows.filter(r=>r.bestRace!==null).sort((a,b)=>a.bestRace-b.bestRace),'bestRace')};
}
export const RECORD_VIEW_KEY='autopobre-record-view-v1';
function recordStorage(){try{return globalThis.localStorage;}catch{return null;}}
export function readRecordView(storage){try{const v=JSON.parse(storage?.getItem(RECORD_VIEW_KEY)||'null');return v&&typeof v.circuit==='string'&&Object.hasOwn(CIRCUITS,v.circuit)&&['normal','immersive'].includes(v.mode)&&['human','ai','all','online'].includes(v.source)?{circuit:v.circuit,mode:v.mode,source:v.source}:null;}catch{return null;}}
// The circuit dropdown borrows each track's outline and place from its card on the track screen
// (index.html); a circuit without a card still gets its name and length.
const circuitCard=id=>document.querySelector(`.track-cards [data-circuit="${id}"]`);
const circuitOutline=id=>circuitCard(id)?.querySelector('path')?.getAttribute('d')??'';
const circuitLength=c=>`${c.length.toLocaleString('pt-BR')} m`;
const initial=text=>text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
export class LapRecords {
 constructor(circuit='interlagos',storage=recordStorage()){
  this.storage=storage;const view=readRecordView(storage);this.viewSaved=!!view;
  this.circuit=circuitId(circuit);this.selectedCircuit=view?.circuit??this.circuit;this.selectedMode=view?.mode??'normal';this.selectedSource=view?.source??'all';
  this.dialog=document.createElement('dialog');this.dialog.id='lapRecords';this.dialog.setAttribute('aria-labelledby','recordsTitle');this.dialog.innerHTML=`<div class="records-head"><div><span>AUTO-POBRE RACING</span><h2 id="recordsTitle">RECORDES DE TEMPO</h2></div><button id="recordsClose" aria-label="Fechar recordes">✕</button></div><p id="recordCandidate" hidden></p><div class="records-filters"><fieldset id="recordsCircuit"><legend id="recordsCircuitLegend">AUTÓDROMO</legend><div class="records-pick"><button type="button" id="recordsCircuitPick" aria-haspopup="listbox" aria-expanded="false" aria-controls="recordsCircuitList" aria-labelledby="recordsCircuitLegend recordsCircuitName"><svg viewBox="0 0 120 60" aria-hidden="true"><path/></svg><b id="recordsCircuitName"></b><small id="recordsCircuitLength"></small><i aria-hidden="true"></i></button><ul id="recordsCircuitList" role="listbox" tabindex="-1" aria-labelledby="recordsCircuitLegend" hidden></ul></div></fieldset><fieldset id="recordsMode"><legend>MODALIDADE</legend><div class="records-mode-options"><button type="button" data-records-mode="normal" aria-pressed="true">Corrida normal <span>corrida em 3 voltas</span></button><button type="button" data-records-mode="immersive" aria-pressed="false">Imersiva <span>corrida em 3 voltas</span></button></div></fieldset><fieldset id="recordsSource"><legend>QUEM PILOTOU</legend><div class="records-source-options"><button type="button" data-records-source="all" aria-pressed="true">Todos</button><button type="button" data-records-source="human" aria-pressed="false" aria-label="Pessoas" title="Pessoas">🧑</button><button type="button" data-records-source="ai" aria-pressed="false" aria-label="Inteligência artificial" title="Inteligência artificial">🤖</button></div></fieldset></div><div class="records-list"><table><thead><tr><th>POS</th><th>PILOTO</th><th>MELHOR VOLTA</th><th>MELHOR CORRIDA</th></tr></thead><tbody></tbody></table><p id="recordsEmpty">O primeiro recorde pode ser seu. Complete uma volta válida para registrar seu tempo automaticamente.</p></div><p id="recordsSourceNote" class="records-note"></p><p id="recordsMessage" role="status"></p>`;
  document.body.append(this.dialog);const $=id=>this.dialog.querySelector('#'+id);$('recordsClose').onclick=()=>this.dialog.close();this.emptyText=$('recordsEmpty').textContent;this.online=null;this.onlineDraw=0;
  for(const button of this.dialog.querySelectorAll('[data-records-source]'))button.onclick=()=>{this.selectedSource=button.dataset.recordsSource;this.saveView();this.render();};
  this.circuitPicker();
  for(const button of this.dialog.querySelectorAll('[data-records-mode]'))button.onclick=()=>{this.selectedMode=button.dataset.recordsMode;this.saveView();this.render();};

 }
 // Too many circuits for a row of buttons: a listbox in the game's colours, one option per
 // circuit with its outline, place and best lap in the mode and drivers being shown.
 circuitPicker(){
  const button=this.dialog.querySelector('#recordsCircuitPick'),list=this.dialog.querySelector('#recordsCircuitList');this.pickButton=button;this.pickList=list;
  const svg='http://www.w3.org/2000/svg';
  for(const c of Object.values(CIRCUITS)){const li=document.createElement('li');li.id=`recordsCircuit-${c.id}`;li.setAttribute('role','option');li.setAttribute('aria-selected','false');li.dataset.recordsCircuit=c.id;
   const map=document.createElementNS(svg,'svg');map.setAttribute('viewBox','0 0 120 60');map.setAttribute('aria-hidden','true');const path=document.createElementNS(svg,'path');path.setAttribute('d',circuitOutline(c.id));map.append(path);
   const name=document.createElement('b'),place=document.createElement('small'),best=document.createElement('em');name.textContent=c.name;place.textContent=circuitCard(c.id)?.querySelector('span')?.textContent??circuitLength(c);
   li.append(map,name,place,best);list.append(li);}
  const ids=()=>[...list.children].map(li=>li.dataset.recordsCircuit);
  button.onclick=()=>this.showCircuits(list.hidden);
  button.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();this.showCircuits(true);}};
  list.onclick=e=>{const li=e.target.closest('[data-records-circuit]');if(li)this.chooseCircuit(li.dataset.recordsCircuit);};
  list.onpointermove=e=>{const li=e.target.closest('[data-records-circuit]');if(li&&li.dataset.recordsCircuit!==this.activeCircuit)this.activateCircuit(li.dataset.recordsCircuit,false);};
  list.onkeydown=e=>{
   const all=ids(),i=all.indexOf(this.activeCircuit),go={ArrowDown:i+1,ArrowUp:i-1,Home:0,End:all.length-1,PageUp:0,PageDown:all.length-1}[e.key];
   if(go!==undefined)this.activateCircuit(all[Math.max(0,Math.min(all.length-1,go))]);
   else if(e.key==='Enter'||e.key===' ')this.chooseCircuit(this.activeCircuit);
   else if(e.key==='Escape'){this.showCircuits(false);button.focus();}
   else if(e.key==='Tab'){this.showCircuits(false);button.focus();return;}
   else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    // Type-ahead: the next circuit starting with that letter ("c" cycles Curvelo, Cascavel, Chapecó).
    const key=initial(e.key),next=[...all.slice(i+1),...all.slice(0,i+1)].find(id=>initial(CIRCUITS[id].name).startsWith(key));if(next)this.activateCircuit(next);else return;}
   else return;
   e.preventDefault();e.stopPropagation();};
  // Escape closes the list before the dialog; a click anywhere else closes it too.
  this.dialog.addEventListener('cancel',e=>{if(!list.hidden){e.preventDefault();this.showCircuits(false);button.focus();}});
  this.dialog.addEventListener('pointerdown',e=>{if(!list.hidden&&!e.target.closest('.records-pick'))this.showCircuits(false);});
  this.dialog.addEventListener('close',()=>this.showCircuits(false));
 }
 showCircuits(open){
  const list=this.pickList;if(open===!list.hidden)return;
  list.hidden=!open;this.pickButton.setAttribute('aria-expanded',String(open));if(!open)return;
  // As tall as the dialog allows below the button (a phone held sideways), scrolling past that.
  list.style.maxHeight=`${Math.max(120,this.dialog.getBoundingClientRect().bottom-this.pickButton.getBoundingClientRect().bottom-18)}px`;
  this.activateCircuit(this.selectedCircuit);list.focus({preventScroll:true});
 }
 activateCircuit(id,scroll=true){
  this.activeCircuit=id;let active=null;
  for(const li of this.pickList.children){const on=li.dataset.recordsCircuit===id;li.classList.toggle('active',on);if(on)active=li;}
  if(active){this.pickList.setAttribute('aria-activedescendant',active.id);if(scroll)active.scrollIntoView({block:'nearest'});}
 }
 chooseCircuit(id){
  if(!Object.hasOwn(CIRCUITS,id))return;
  this.selectedCircuit=id;this.showCircuits(false);this.pickButton.focus();this.saveView();this.render();
 }
 // The accounts' board (recordes-online.js, only where the accounts are): a fourth source, Online, read
 // from the server; each pilot once, at their best lap, ✓ checked as it was driven or (!) an old record
 // of some browser, unchecked.
 addOnline(online){
  if(this.online)return;this.online=online;
  const button=document.createElement('button');button.type='button';button.dataset.recordsSource='online';button.setAttribute('aria-pressed','false');
  button.setAttribute('aria-label','Online: recordes das contas');button.title='Online: recordes das contas';button.textContent='🌐';
  button.onclick=()=>{this.selectedSource='online';this.saveView();this.render();};
  this.dialog.querySelector('.records-source-options').append(button);
  if(this.dialog.open)this.render();
 }
 async renderOnline(circuit,mode){
  const draw=++this.onlineDraw,body=this.dialog.querySelector('tbody'),empty=this.dialog.querySelector('#recordsEmpty');
  empty.textContent='Carregando os recordes online…';empty.hidden=false;
  let rows,bests;
  try{[rows,bests]=await Promise.all([this.online.board(circuit,mode),this.online.bests(mode)]);}
  catch(error){if(draw===this.onlineDraw)empty.textContent=error.message;return;}
  if(draw!==this.onlineDraw)return;
  for(const li of this.pickList.children){
   const ms=bests[li.dataset.recordsCircuit],best=li.querySelector('em');best.classList.toggle('records-pick-none',!ms);best.replaceChildren();
   if(ms){const label=document.createElement('span');label.textContent='MELHOR VOLTA';best.append(label,formatTime(ms/1000));}else best.textContent='sem tempos';}
  rows.forEach((row,i)=>{
   const tr=document.createElement('tr');tr.dataset.source='online';if(row.mine)tr.dataset.mine='';
   for(const value of [`${i+1}º`,row.name,formatTime(row.bestLap),'—']){const td=document.createElement('td');td.textContent=value;tr.append(td);}
   const checked=row.badge==='conferido',badge=document.createElement('span'),label=checked?'Volta conferida pelo servidor enquanto foi pilotada':'Recorde antigo de um navegador, não verificado';
   badge.className='record-source-badge record-online-badge'+(checked?'':' record-unchecked');badge.title=label;badge.setAttribute('role','img');badge.setAttribute('aria-label',label);badge.textContent=checked?'✓':'(!)';
   tr.children[1].append(badge);body.append(tr);});
  empty.textContent='Ainda não há recordes online nesta pista e modo. Entre com a sua conta e complete uma volta sem pausa para registrar a primeira.';empty.hidden=rows.length>0;
 }
 saveView(){this.viewSaved=true;try{this.storage?.setItem(RECORD_VIEW_KEY,JSON.stringify({circuit:this.selectedCircuit,mode:this.selectedMode,source:this.selectedSource}));}catch{}}
 open(mode=null){
  const $=id=>this.dialog.querySelector('#'+id);this.candidate=mode&&!mode.recordAssisted&&validTime(mode.finishBest)&&validTime(mode.finishTime)?{circuit:circuitId(mode.data?.meta.id),mode:mode.active?'immersive':'normal',bestLap:mode.finishBest,bestRace:mode.finishTime}:null;
  if(!this.viewSaved){this.selectedCircuit=this.candidate?.circuit??this.circuit;this.selectedMode=this.candidate?.mode??this.selectedMode;}
  $('recordCandidate').hidden=!this.candidate;$('recordsMessage').textContent=mode?.recordAssisted?'O reconhecimento automático não grava recordes. Faça uma corrida pilotando o Opala.':'';
  if(this.candidate){$('recordCandidate').textContent=`Piloto: ${mode.pilotName||'—'} · ${CIRCUITS[this.candidate.circuit].name} · Volta: ${formatTime(this.candidate.bestLap)} · Corrida: ${formatTime(this.candidate.bestRace)}`;}
  if(mode?.recordSaveError)$('recordsMessage').textContent=mode.recordSaveError;

  this.saveView();this.render();this.dialog.showModal();
 }
 render(){
  const storage=this.storage;
  // Online without the accounts here (a view saved on dev.autopobre.com.br, opened elsewhere): everyone.
  if(this.selectedSource==='online'&&!this.online)this.selectedSource='all';
  const online=this.selectedSource==='online';this.onlineDraw++;this.dialog.querySelector('#recordsEmpty').textContent=this.emptyText;
  let rows=this.selectedSource==='ai'||online?[]:readRecords(storage).map(r=>({...r,source:'human'}));
  if(this.selectedSource!=='human'&&!online)rows.push(...readAIRecords(storage));
  for(const button of this.dialog.querySelectorAll('[data-records-source]'))button.setAttribute('aria-pressed',String(button.dataset.recordsSource===this.selectedSource));
  this.dialog.querySelector('#recordsSourceNote').textContent=online?'Online: o melhor de cada piloto com conta. ✓ volta conferida pelo servidor · (!) recorde antigo, não verificado.':this.selectedSource==='human'?'Pessoas: recordes salvos automaticamente neste navegador.':'Pessoas: recordes deste navegador. IA: tempos do jogo, não dos pilotos reais.';
  const mode=this.selectedMode;
  for(const button of this.dialog.querySelectorAll('[data-records-mode]'))button.setAttribute('aria-pressed',String(button.dataset.recordsMode===mode));
  const circuit=CIRCUITS[this.selectedCircuit],button=this.pickButton;button.dataset.circuit=circuit.id;
  // The race times' distance: the circuit's own where it fixes one (Pampulha's single lap).
  {const n=standardLaps(circuit.id);for(const span of this.dialog.querySelectorAll('[data-records-mode] span'))span.textContent=`corrida em ${n} volta${n>1?'s':''}`;}
  button.querySelector('path').setAttribute('d',circuitOutline(circuit.id));button.querySelector('b').textContent=circuit.name;button.querySelector('small').textContent=circuitLength(circuit);
  for(const li of this.pickList.children){
   const id=li.dataset.recordsCircuit,laps=rows.filter(r=>r.mode===mode&&r.circuit===id).map(r=>r.bestLap),best=li.querySelector('em');
   li.setAttribute('aria-selected',String(id===circuit.id));best.classList.toggle('records-pick-none',!laps.length);
   best.replaceChildren();if(laps.length){const label=document.createElement('span');label.textContent='MELHOR VOLTA';best.append(label,formatTime(Math.min(...laps)));}else best.textContent='sem tempos';}
  rows=rows.filter(r=>r.mode===mode&&r.circuit===this.selectedCircuit).sort((a,b)=>a.bestLap-b.bestLap);
  const body=this.dialog.querySelector('tbody');body.replaceChildren();
  rows.forEach((row,i)=>{const tr=document.createElement('tr');tr.dataset.source=row.source;for(const value of [`${i+1}º`,row.name,formatTime(row.bestLap),formatTime(row.bestRace)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}const badge=document.createElement('span');badge.className='record-source-badge';const label=row.source==='ai'?`Inteligência artificial · carro #${row.number}`:'Pessoa';badge.title=label;badge.setAttribute('role','img');badge.setAttribute('aria-label',label);badge.textContent=row.source==='ai'?`🤖 · #${row.number}`:'🧑';tr.children[1].append(badge);body.append(tr);});this.dialog.querySelector('#recordsEmpty').hidden=rows.length>0;
  if(online)this.renderOnline(this.selectedCircuit,mode);
 }
}
