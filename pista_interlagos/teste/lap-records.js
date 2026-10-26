import {CIRCUITS,circuitId} from './circuits.js';
import {readAIRecords,standardLaps} from './ai-records.js';
import {formatTime} from './race-results.js';
import {RIVAL_ROSTER,PLAYER_ENTRY} from './race-roster.js';
// The best laps, per circuit and car: one record a circuit, whichever mode drove it (a race, the story: the same track),
// and a board for each car (an Opala and a Fusca never compare). The Opala's keep the key and format they always had
// (older versions of the game, and the main link's bridge, read it: each row still says its mode); the Fusca's have a
// key of their own, so that no older version shows them as an Opala's. Race times are not records any more (3, 10 or
// 20 laps never compare): the result screens and the championships show them; rows saved before keep theirs, unread.
const KEYS=Object.freeze({opala:'autopobre-records-v1',fusca:'autopobre-records-fusca-v1'});
export const RECORD_CARS=Object.freeze(Object.keys(KEYS));
const carOf=car=>Object.hasOwn(KEYS,car)?car:'opala';
const validTime=t=>Number.isFinite(t)&&t>0&&t<86400;
const samePilot=(a,b)=>a.toLocaleLowerCase('pt-BR')===b.toLocaleLowerCase('pt-BR');
export const cleanName=name=>String(name??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,32);
export function readRecords(storage,car='opala'){
 try{const data=JSON.parse(storage.getItem(KEYS[carOf(car)])||'[]');return Array.isArray(data)?data.filter(r=>r&&typeof r.name==='string'&&['normal','immersive'].includes(r.mode)&&cleanName(r.name)&&validTime(r.bestLap)&&(r.bestRace==null||validTime(r.bestRace)&&r.bestLap<=r.bestRace)).slice(0,400).map(r=>({circuit:circuitId(r.circuit),name:cleanName(r.name),mode:r.mode,car:carOf(car),bestLap:r.bestLap,bestRace:r.bestRace??null,raceLaps:standardLaps(r.circuit),date:typeof r.date==='string'?r.date:''})):[];}catch{return [];}
}
// Each pilot once per circuit, at their best lap (rows of both modes saved before they were one).
export function bestPerPilot(rows){
 const best=new Map();
 for(const r of rows){const key=`${r.circuit}|${r.source??'human'}|${r.source==='ai'?r.number:r.name.toLocaleLowerCase('pt-BR')}`,had=best.get(key);if(!had||r.bestLap<had.bestLap)best.set(key,r);}
 return [...best.values()];
}
export function saveRecord(storage,{name,mode,bestLap,circuit='interlagos',car='opala'}){
 if(typeof circuit!=='string'||!Object.hasOwn(CIRCUITS,circuit))throw new Error('Circuito inválido.');
 name=cleanName(name);if(!name||!['normal','immersive'].includes(mode)||!validTime(bestLap))throw new Error('Informe o piloto e complete uma volta válida.');
 car=carOf(car);const rows=readRecords(storage,car),mine=rows.filter(r=>r.circuit===circuit&&samePilot(r.name,name));
 if(mine.some(r=>r.bestLap<=bestLap))return rows;
 const kept=[...rows.filter(r=>!mine.includes(r)),{circuit,name,mode,bestLap,bestRace:null,raceLaps:standardLaps(circuit),date:new Date().toISOString()}];
 const sorted=Object.keys(CIRCUITS).flatMap(id=>kept.filter(r=>r.circuit===id).sort((a,b)=>a.bestLap-b.bestLap).slice(0,50)).map(({car:_,...r})=>r);
 if(!sorted.some(r=>r.circuit===circuit&&samePilot(r.name,name)))throw new Error('A lista guarda os 50 melhores recordes. Esse tempo ficou fora da lista.');
 try{storage.setItem(KEYS[car],JSON.stringify(sorted));}catch{throw new Error('Não foi possível salvar neste navegador. Verifique se o armazenamento está disponível.');}
 return sorted;
}
// Save synchronously at each new best lap, including unfinished races, on the board of the car driven.
export class AutomaticRecords {
 constructor(storage){this.storage=storage;this.name='';this.signature='';this.retryAt=0;}
 start(name){this.name=cleanName(name);this.signature='';this.retryAt=0;}
 update(mode,now=Date.now()){
  if(!this.name||!mode||mode.recordAssisted)return;
  const car=carOf(mode.car?.mechanics?.name??'opala'),bestLap=mode.car.best;if(!validTime(bestLap)||mode.car.laps<1)return;
  const circuit=circuitId(mode.data?.meta.id),category=mode.active?'immersive':'normal';
  const signature=JSON.stringify([this.name,circuit,car,bestLap]);
  if(signature===this.signature||now<this.retryAt)return;
  try{saveRecord(this.storage,{name:this.name,circuit,mode:category,car,bestLap});this.signature=signature;this.retryAt=0;mode.recordSaveError='';}
  catch(error){mode.recordSaveError=error.message;this.retryAt=now+5000;}
 }
}
// The game's AI on a circuit's board: the Opala's only (the Fusca's field keeps no times yet), each car once.
const aiRows=(storage,car)=>car==='opala'?bestPerPilot(readAIRecords(storage)):[];
// A circuit's best laps for the Box 99 garage TVs, the team stand's monitors and the track cards: people and the AI
// (people only: ai false) in one car, fastest first. The pilot playing now is marked (me) and, below the top rows,
// takes the last line with his own place.
export function trackRecords(storage,circuit,car='opala',pilot='',limit=8,{ai=true}={}){
 const me=cleanName(pilot).toLocaleLowerCase('pt-BR'),mine=r=>r.source==='human'&&!!me&&r.name.toLocaleLowerCase('pt-BR')===me,id=circuitId(circuit);
 const rows=bestPerPilot([...readRecords(storage,car).map(r=>({...r,source:'human'})),...(ai?aiRows(storage,car):[])].filter(r=>r.circuit===id)).sort((a,b)=>a.bestLap-b.bestLap);
 const top=rows.slice(0,limit),own=rows.findIndex(mine);if(own>=limit)top[limit-1]=rows[own];
 return {lap:top.map(r=>{const isAI=r.source==='ai',entry=isAI?RIVAL_ROSTER.find(e=>e.number===r.number):PLAYER_ENTRY;return {place:rows.indexOf(r)+1,number:entry?.number??r.number,name:isAI?entry?.shortName??r.name:r.name,color:entry?.color??PLAYER_ENTRY.color,time:formatTime(r.bestLap),ai:isAI,me:mine(r)};})};
}
export const RECORD_VIEW_KEY='autopobre-record-view-v1';
function recordStorage(){try{return globalThis.localStorage;}catch{return null;}}
// The dialog's last view: circuit, car and who drove (a view saved when the dialog still had modes reads as the Opala's).
export function readRecordView(storage){try{const v=JSON.parse(storage?.getItem(RECORD_VIEW_KEY)||'null');return v&&typeof v.circuit==='string'&&Object.hasOwn(CIRCUITS,v.circuit)&&['human','ai','all','online'].includes(v.source)?{circuit:v.circuit,car:carOf(v.car),source:v.source}:null;}catch{return null;}}
// The circuit dropdown borrows each track's outline and place from its card on the track screen
// (index.html); a circuit without a card still gets its name and length.
const circuitCard=id=>document.querySelector(`.track-cards [data-circuit="${id}"]`);
const circuitOutline=id=>circuitCard(id)?.querySelector('path')?.getAttribute('d')??'';
const circuitLength=c=>`${c.length.toLocaleString('pt-BR')} m`;
const CAR_NAMES=Object.freeze({opala:'Opala',fusca:'Fusca'});
const initial=text=>text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
export class LapRecords {
 constructor(circuit='interlagos',storage=recordStorage()){
  this.storage=storage;const view=readRecordView(storage);this.viewSaved=!!view;
  this.circuit=circuitId(circuit);this.selectedCircuit=view?.circuit??this.circuit;this.selectedCar=view?.car??'opala';this.selectedSource=view?.source??'all';this.review=null;
  this.dialog=document.createElement('dialog');this.dialog.id='lapRecords';this.dialog.setAttribute('aria-labelledby','recordsTitle');this.dialog.innerHTML=`<div class="records-head"><div><span>AUTO-POBRE RACING</span><h2 id="recordsTitle">RECORDES DE TEMPO</h2></div><button id="recordsClose" aria-label="Fechar recordes">✕</button></div><p id="recordCandidate" hidden></p><div id="recordReview" hidden><p id="recordReviewText"></p><button type="button" id="recordReviewAsk">Pedir revisão</button></div><div class="records-filters"><fieldset id="recordsCircuit"><legend id="recordsCircuitLegend">AUTÓDROMO</legend><div class="records-pick"><button type="button" id="recordsCircuitPick" aria-haspopup="listbox" aria-expanded="false" aria-controls="recordsCircuitList" aria-labelledby="recordsCircuitLegend recordsCircuitName"><svg viewBox="0 0 120 60" aria-hidden="true"><path/></svg><b id="recordsCircuitName"></b><small id="recordsCircuitLength"></small><i aria-hidden="true"></i></button><ul id="recordsCircuitList" role="listbox" tabindex="-1" aria-labelledby="recordsCircuitLegend" hidden></ul></div></fieldset><fieldset id="recordsCar"><legend>CARRO</legend><div class="records-mode-options"><button type="button" data-records-car="opala" aria-pressed="true">Opala <span>até 217 km/h</span></button><button type="button" data-records-car="fusca" aria-pressed="false">Fusca <span>até 170 km/h</span></button></div></fieldset><fieldset id="recordsSource"><legend>QUEM PILOTOU</legend><div class="records-source-options"><button type="button" data-records-source="all" aria-pressed="true">Todos</button><button type="button" data-records-source="human" aria-pressed="false" aria-label="Pessoas" title="Pessoas">🧑</button><button type="button" data-records-source="ai" aria-pressed="false" aria-label="Inteligência artificial" title="Inteligência artificial">🤖</button></div></fieldset></div><div class="records-list"><table><thead><tr><th>POS</th><th>PILOTO</th><th>MELHOR VOLTA</th></tr></thead><tbody></tbody></table><p id="recordsEmpty">O primeiro recorde pode ser seu. Complete uma volta válida para registrar seu tempo automaticamente.</p></div><p id="recordsSourceNote" class="records-note"></p><p id="recordsMessage" role="status"></p>`;
  document.body.append(this.dialog);const $=id=>this.dialog.querySelector('#'+id);$('recordsClose').onclick=()=>this.dialog.close();this.emptyText=$('recordsEmpty').textContent;this.online=null;this.onlineDraw=0;
  for(const button of this.dialog.querySelectorAll('[data-records-source]'))button.onclick=()=>{this.selectedSource=button.dataset.recordsSource;this.saveView();this.render();};
  this.circuitPicker();
  for(const button of this.dialog.querySelectorAll('[data-records-car]'))button.onclick=()=>{this.selectedCar=button.dataset.recordsCar;this.saveView();this.render();};
  $('recordReviewAsk').onclick=()=>this.askReview();

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
 // from the server (each pilot once, at their best lap, ✓ checked as it was driven or ⚠️ an old record
 // of some browser, unchecked), which Todos joins too.
 addOnline(online){
  if(this.online)return;this.online=online;
  const button=document.createElement('button');button.type='button';button.dataset.recordsSource='online';button.setAttribute('aria-pressed','false');
  button.setAttribute('aria-label','Online: recordes das contas');button.title='Online: recordes das contas';button.textContent='🌐';
  button.onclick=()=>{this.selectedSource='online';this.saveView();this.render();};
  this.dialog.querySelector('.records-source-options').append(button);
  if(this.dialog.open)this.render();
 }
 saveView(){this.viewSaved=true;try{this.storage?.setItem(RECORD_VIEW_KEY,JSON.stringify({circuit:this.selectedCircuit,car:this.selectedCar,source:this.selectedSource}));}catch{}}
 // mode: the race just run (the results screen's Recordes): its circuit and car, and its best lap as the candidate.
 // here: the circuit and car of the session under way (the menu's Recordes during it). Neither: the last view.
 open(mode=null,here=null){
  const $=id=>this.dialog.querySelector('#'+id);this.candidate=mode&&!mode.recordAssisted&&validTime(mode.finishBest)?{circuit:circuitId(mode.data?.meta.id),car:carOf(mode.car?.mechanics?.name??'opala'),bestLap:mode.finishBest}:null;
  const at=this.candidate??(here?.circuit&&Object.hasOwn(CIRCUITS,circuitId(here.circuit))?{circuit:circuitId(here.circuit),car:carOf(here.car)}:null);
  if(at){this.selectedCircuit=at.circuit;this.selectedCar=at.car;}else if(!this.viewSaved)this.selectedCircuit=this.circuit;
  $('recordCandidate').hidden=!this.candidate;$('recordsMessage').textContent=mode?.recordAssisted?'O reconhecimento automático não grava recordes. Faça uma corrida pilotando.':'';
  if(this.candidate){$('recordCandidate').textContent=`Piloto: ${mode.pilotName||'—'} · ${CIRCUITS[this.candidate.circuit].name} · ${CAR_NAMES[this.candidate.car]} · Melhor volta: ${formatTime(this.candidate.bestLap)}`;}
  if(mode?.recordSaveError)$('recordsMessage').textContent=mode.recordSaveError;
  this.saveView();this.render();this.dialog.showModal();
 }
 // A lap the server did not check that would have been the pilot's best (recordes-online.js review), with the button
 // that asks the admin to look at it; once asked, what came of it.
 drawReview(){
  const box=this.dialog.querySelector('#recordReview'),r=this.online?.review;box.hidden=!r;if(!r)return;
  const text=`Sua volta de ${formatTime(r.time)} em ${CIRCUITS[r.circuit]?.name??r.circuit} (${CAR_NAMES[r.car]??r.car}) ficou no seu recorde deste navegador, mas não foi conferida online: ${r.reason}.`;
  const asked={pedida:' Revisão pedida: a administração vai olhar a sua volta.',aprovada:' A revisão aprovou a volta.',recusada:' A revisão não aprovou a volta.'}[r.status]??' Se ela foi limpa, peça uma revisão: a administração olha a volta e pode aprová-la.';
  box.querySelector('#recordReviewText').textContent=text+asked;
  const ask=box.querySelector('#recordReviewAsk');ask.hidden=!!r.status;ask.disabled=!!r.busy;
 }
 async askReview(){
  const r=this.online?.review;if(!r||r.status||r.busy)return;
  r.busy=true;this.drawReview();
  try{await this.online.askReview();}catch(error){this.dialog.querySelector('#recordsMessage').textContent=error.message;}
  r.busy=false;this.drawReview();
 }
 render(){
  const storage=this.storage;
  // Online without the accounts here (a view saved on dev.autopobre.com.br, opened elsewhere): everyone.
  if(this.selectedSource==='online'&&!this.online)this.selectedSource='all';
  const source=this.selectedSource,online=source==='online',car=this.selectedCar;this.onlineDraw++;this.dialog.querySelector('#recordsEmpty').textContent=this.emptyText;
  const local=source==='ai'||online?[]:readRecords(storage,car).map(r=>({...r,source:'human'}));
  if(source!=='human'&&!online)local.push(...aiRows(storage,car));
  for(const button of this.dialog.querySelectorAll('[data-records-source]'))button.setAttribute('aria-pressed',String(button.dataset.recordsSource===source));
  for(const button of this.dialog.querySelectorAll('[data-records-car]'))button.setAttribute('aria-pressed',String(button.dataset.recordsCar===car));
  const ai=car==='opala'?'IA: tempos do jogo, não dos pilotos reais.':'A IA ainda não tem tempos no Fusca.';
  this.dialog.querySelector('#recordsSourceNote').textContent=online?'Online: o melhor de cada piloto com conta. ✓ volta conferida pelo servidor · ⚠️ Recordes de Versões Anteriores do Auto Pobre Podem Conter Erros.'
   :source==='human'?'Pessoas: recordes salvos automaticamente neste navegador.':source==='ai'?ai
   :`Pessoas: recordes deste navegador. ${ai}${this.online?' Online: pilotos com conta (✓ volta conferida · ⚠️ Recordes de Versões Anteriores do Auto Pobre Podem Conter Erros).':''}`;
  const circuit=CIRCUITS[this.selectedCircuit],button=this.pickButton;button.dataset.circuit=circuit.id;
  button.querySelector('path').setAttribute('d',circuitOutline(circuit.id));button.querySelector('b').textContent=circuit.name;button.querySelector('small').textContent=circuitLength(circuit);
  const localBest=id=>{const laps=local.filter(r=>r.circuit===id).map(r=>r.bestLap);return laps.length?Math.min(...laps):null;};
  this.drawPicker(localBest);this.drawReview();
  const rows=bestPerPilot(local.filter(r=>r.circuit===this.selectedCircuit));
  this.drawRows(rows);
  if(this.online&&(online||source==='all'))this.joinOnline(rows,localBest,circuit.id,car,online);
 }
 // Each circuit's best lap in the list (best(id): seconds, or null).
 drawPicker(best){
  for(const li of this.pickList.children){
   const id=li.dataset.recordsCircuit,time=best(id),em=li.querySelector('em');
   li.setAttribute('aria-selected',String(id===this.selectedCircuit));em.classList.toggle('records-pick-none',time===null);
   em.replaceChildren();if(time!==null){const label=document.createElement('span');label.textContent='MELHOR VOLTA';em.append(label,formatTime(time));}else em.textContent='sem tempos';}
 }
 // The table, fastest lap first; each row says whose it is: 🧑 this browser, 🤖 the game's AI, 🌐 an account.
 drawRows(rows){
  rows=[...rows].sort((a,b)=>a.bestLap-b.bestLap);
  const body=this.dialog.querySelector('tbody');body.replaceChildren();
  rows.forEach((row,i)=>{
   const tr=document.createElement('tr');tr.dataset.source=row.source;if(row.mine)tr.dataset.mine='';
   for(const value of [`${i+1}º`,row.name,formatTime(row.bestLap)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
   // The pilot's online record that is this browser's record too (the same lap): 🧑 beside 🌐, theirs and the world's.
   if(row.here){const own=document.createElement('span'),label='Seu recorde, neste navegador também';own.className='record-source-badge record-here-badge';own.title=label;own.setAttribute('role','img');own.setAttribute('aria-label',label);own.textContent='🧑';tr.children[1].append(own);}
   const badge=document.createElement('span'),checked=row.badge==='conferido';badge.className='record-source-badge';
   const label=row.source==='ai'?`Inteligência artificial · carro #${row.number}`:row.source==='online'?checked?'Online: volta conferida pelo servidor enquanto foi pilotada':'Recordes de Versões Anteriores do Auto Pobre Podem Conter Erros':'Pessoa, neste navegador';
   if(row.source==='online')badge.classList.add('record-online-badge',...(checked?[]:['record-unchecked']));
   badge.title=label;badge.setAttribute('role','img');badge.setAttribute('aria-label',label);
   badge.textContent=row.source==='ai'?`🤖 · #${row.number}`:row.source==='online'?`🌐 ${checked?'✓':'⚠️'}`:'🧑';
   tr.children[1].append(badge);body.append(tr);});
  this.dialog.querySelector('#recordsEmpty').hidden=rows.length>0;
 }
 // The accounts' records joined to what is drawn (only=true: the Online source alone). The signed-in pilot
 // shows once: their row online and this browser's rows under the same name are one pilot, at the best of them.
 async joinOnline(rows,localBest,circuit,car,only){
  const draw=this.onlineDraw,empty=this.dialog.querySelector('#recordsEmpty');
  if(only){empty.textContent='Carregando os recordes online…';empty.hidden=false;}
  let board,bests;
  try{[board,bests]=await Promise.all([this.online.board(circuit,car),this.online.bests(car)]);}
  catch(error){if(draw===this.onlineDraw&&only)empty.textContent=error.message;return;}
  if(draw!==this.onlineDraw)return;
  const same=(a,b)=>a.toLocaleLowerCase('pt-BR')===b.toLocaleLowerCase('pt-BR');
  let joined=[...rows,...board.map(r=>({...r,source:'online'}))];
  const mine=joined.find(r=>r.source==='online'&&r.mine);
  if(mine){
   // The same lap here and online reads the same to the thousandth (online keeps milliseconds).
   const tie=(a,b)=>Math.abs(a.bestLap-b.bestLap)<.0015;
   const pilot=joined.filter(r=>r===mine||r.source==='human'&&same(r.name,mine.name));
   const fastest=pilot.reduce((a,b)=>tie(a,b)?(b.source==='online'?b:a):b.bestLap<a.bestLap?b:a);   // a tie: the account's row (an old record that went up is the same time)
   // When the account's record is this browser's record too (read here even on the Online tab alone), the row says both.
   const here=fastest.source==='online'&&readRecords(this.storage,car).some(r=>r.circuit===circuit&&same(r.name,mine.name)&&tie(r,fastest));
   joined=joined.filter(r=>!pilot.includes(r)||r===fastest).map(r=>r===fastest&&here?{...r,here:true}:r);
  }
  this.drawPicker(id=>{const ms=bests[id],there=ms?ms/1000:null,here=localBest(id);return here===null?there:there===null?here:Math.min(here,there);});
  this.drawRows(joined);
  if(only){empty.textContent='Ainda não há recordes online nesta pista com este carro. Entre com a sua conta e complete uma volta sem pausa para registrar a primeira.';empty.hidden=joined.length>0;}
 }
}
