import {PAD_ACTIONS,PAD_PLACES,PAD_BUTTONS,MENU_BUTTON,TRIGGERS,playerPad,buttonName,padStyle} from './pad-bindings.js';
// The Controles tab's controller list: every command at the wheel and on foot with its two buttons. A click on a button
// waits for the controller's (Menu, Esc or a click elsewhere leaves it as it was; Deixar sem botão, Backspace or Delete
// empties that place); a button another command of the same place had swaps over. Restaurar os botões padrão brings
// the original ones back. The names follow the controller plugged in (✕ ○ □ △ on a PlayStation's).
const $=id=>document.getElementById(id);
const escape=text=>String(text).replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`);
const NAMES=Object.fromEntries(PAD_ACTIONS.map(a=>[a.id,a.name]));
const PLACE_OF=Object.fromEntries(PAD_ACTIONS.map(a=>[a.id,a.place]));
const PLACE_NAMES=Object.fromEntries(PAD_PLACES);
// What no list changes: the pedals, the sticks and Menu (names per controller).
const FIXED={
 car:[['Acelerar e frear',{xbox:'RT LT',playstation:'R2 L2'},'com dosagem; no automático, com o carro parado, segurar o freio dá ré'],['Virar',{xbox:'Analógico esq.'},''],['Olhar ao redor',{xbox:'Analógico dir.'},'ao soltar, a câmera volta para a frente']],
 foot:[['Andar e girar',{xbox:'Analógico esq.'},'para cima e para baixo anda; para os lados gira o piloto'],['Olhar ao redor',{xbox:'Analógico dir.'},'']],
 menu:['Menu',{xbox:'Menu',playstation:'Options'},'abre e fecha o menu de pausa, e cancela a troca de um botão']
};
export class PadPanel {
 constructor({gamepad,bindings=playerPad,dialog=$('settings')}){
  this.gamepad=gamepad;this.bindings=bindings;this.list=$('padBindings');this.note=$('padNote');this.waiting=null;this.escapeAt=-1e9;
  this.list.onclick=e=>{
   const button=e.target.closest('button[data-id]');if(!button)return;
   const id=button.dataset.id,slot=Number(button.dataset.slot);
   if(this.waiting?.id===id&&this.waiting.slot===slot){this.cancel('Nada mudou.');return;}
   this.listen(id,slot);
  };
  $('padClear').onclick=()=>this.clear();
  $('padReset').onclick=()=>{
   this.cancel('');const was=this.bindings.changed;this.bindings.reset();
   this.say(was?'Pronto: todos os botões do controle voltaram ao padrão.':'Os botões do controle já estão no padrão.');
  };
  // The keyboard while a button is awaited: Esc gives up (and never closes the settings), Backspace or Delete empties it.
  addEventListener('keydown',e=>{
   if(!this.waiting||!['Escape','Backspace','Delete'].includes(e.code))return;
   e.preventDefault();e.stopImmediatePropagation();
   if(e.code==='Escape'){this.escapeAt=performance.now();this.cancel('Nada mudou.');}else this.clear();
  },true);
  document.addEventListener('pointerdown',e=>{if(this.waiting&&!e.target.closest?.('#padBindings button[data-id],#padClear'))this.cancel('Nada mudou.');},true);
  dialog?.addEventListener('cancel',e=>{if(this.waiting||performance.now()-this.escapeAt<400)e.preventDefault();});
  dialog?.addEventListener('close',()=>this.cancel(''));
  this.bindings.onChange(()=>this.render());
  this.render();
 }
 get style(){return padStyle(this.gamepad.pad?.id);}
 name(index){return buttonName(index,this.style);}
 listen(id,slot){
  this.waiting={id,slot};this.gamepad.listen(index=>this.pressed(index));$('padClear').hidden=false;this.render();
  this.say(`${this.gamepad.connected?'Aperte no controle':'Ligue o controle e aperte'} o botão para ${NAMES[id]} (${PLACE_NAMES[PLACE_OF[id]].toLowerCase()})${slot?', segundo botão':''} · Menu ou Esc cancela`);
 }
 stop(){this.waiting=null;this.gamepad.listen(null);$('padClear').hidden=true;this.render();}
 cancel(text){if(!this.waiting)return;this.stop();if(text!==undefined)this.say(text);}
 clear(){
  const w=this.waiting;if(!w)return;this.stop();this.bindings.clear(w.id,w.slot);
  this.say(`${NAMES[w.id]} ficou sem ${w.slot?'o segundo botão':'botão'}.`);
 }
 // A button pressed while one is awaited (gamepad-controls.js listen).
 pressed(index){
  if(!this.waiting)return;const {id,slot}=this.waiting;
  if(index===MENU_BUTTON){this.cancel('Nada mudou.');return;}
  if(TRIGGERS.includes(index)){this.say(`${this.name(index)} é o ${index===7?'acelerador':'freio'}: escolha outro botão para ${NAMES[id]}.`);return;}
  if(!PAD_BUTTONS.includes(index)){this.say(`Esse botão o jogo não lê: escolha outro para ${NAMES[id]}.`);return;}
  this.stop();
  const result=this.bindings.set(id,slot,index),label=this.name(index);
  if(!result.ok)return;
  if(result.same){this.say(`${label} já é ${NAMES[id]}.`);this.focus(id,slot);return;}
  const moved=result.moved?(result.moved.button!==null?` ${NAMES[result.moved.id]} ficou com ${this.name(result.moved.button)}.`:` ${NAMES[result.moved.id]} ficou sem esse botão.`):'';
  this.say(`${label} agora é ${NAMES[id]} (${PLACE_NAMES[PLACE_OF[id]].toLowerCase()}).${moved}`);
  this.focus(id,slot);
 }
 say(text){this.note.textContent=text;}
 focus(id,slot){this.list.querySelector(`button[data-id="${id}"][data-slot="${slot}"]`)?.focus();}
 // The names change with the controller plugged in (main.js padStatus).
 refresh(){this.render();}
 render(){
  const b=this.bindings,style=this.style,focused=document.activeElement?.closest?.('#padBindings button[data-id]'),again=focused&&[focused.dataset.id,focused.dataset.slot];
  const slotButton=(a,slot)=>{
   const button=b.buttons[a.id][slot],waiting=this.waiting?.id===a.id&&this.waiting.slot===slot,label=waiting?'Aperte…':button!==null?this.name(button):slot?'+':'—';
   const what=waiting?'aguardando o novo botão':button!==null?`botão ${this.name(button)}`:'sem botão';
   return `<button type="button" class="key-slot${waiting?' waiting':''}${button!==null?'':' empty'}" data-id="${a.id}" data-slot="${slot}" aria-label="${escape(`${a.name}, ${slot?'segundo botão':'botão'}: ${what}. Clique para trocar`)}">${escape(label)}</button>`;
  };
  const fixedRow=([name,keys,note])=>`<div class="keys-row fixed"><div class="keys-what"><b>${escape(name)}</b><small>${escape(note?`fixo: ${note}`:'fixo')}</small></div><div class="keys-slots"><kbd>${escape(keys[style]??keys.xbox)}</kbd></div></div>`;
  let html='';
  for(const [place,title] of PAD_PLACES){
   html+=`<section class="keys-group"><h5>${escape(title.toUpperCase())}</h5>`;
   for(const a of PAD_ACTIONS.filter(a=>a.place===place)){
    const changed=!b.isOriginal(a.id);
    html+=`<div class="keys-row${changed?' changed':''}"><div class="keys-what"><b>${escape(a.name)}</b>${changed?'<i>mudou</i>':''}${a.note?`<small>${escape(a.note)}</small>`:''}</div><div class="keys-slots">${slotButton(a,0)}${slotButton(a,1)}</div></div>`;
   }
   html+=FIXED[place].map(fixedRow).join('')+'</section>';
  }
  html+=`<section class="keys-group"><h5>SEMPRE</h5>${fixedRow(FIXED.menu)}</section>`;
  this.list.innerHTML=html;
  if(again)this.focus(...again);
  $('padReset').classList.toggle('keys-changed',b.changed);
 }
}
