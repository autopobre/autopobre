import {KEY_ACTIONS,KEY_GROUPS,playerKeys,physicalCode,keyAllowed} from './key-bindings.js';
// The Controles tab's "Teclado": every command with its two keys. A click on a key waits for the new one
// (Esc leaves it as it was, Backspace or Delete leaves that place without a key); a key another command
// had swaps places with the old one. Restaurar as teclas padrão brings the original keys back.
const $=id=>document.getElementById(id);
const escape=text=>String(text).replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`);
const NAMES=Object.fromEntries(KEY_ACTIONS.map(a=>[a.id,a.name]));
export class KeysPanel {
 constructor({bindings=playerKeys,dialog=$('settings')}={}){
  this.bindings=bindings;this.list=$('keyBindings');this.note=$('keysNote');this.waiting=null;this.swallow=new Set();this.escapeAt=-1e9;
  this.list.onclick=e=>{
   const button=e.target.closest('button[data-id]');if(!button)return;
   const id=button.dataset.id,slot=Number(button.dataset.slot);
   if(this.waiting?.id===id&&this.waiting.slot===slot){this.cancel('');return;}
   this.listen(id,slot);
  };
  $('keysReset').onclick=()=>{
   this.cancel('');const was=this.bindings.changed;this.bindings.reset();
   this.say(was?'Pronto: todas as teclas voltaram ao padrão.':'As teclas já estão no padrão.');
  };
  // The key being picked is the panel's alone: nothing else in the game hears it, nor its release.
  addEventListener('keydown',e=>this.key(e),true);
  addEventListener('keyup',e=>{const code=physicalCode(e);if(this.swallow.has(code)){this.swallow.delete(code);e.stopImmediatePropagation();e.preventDefault();}},true);
  // (a click anywhere else gives up; Esc never closes the settings while a key is awaited)
  document.addEventListener('pointerdown',e=>{if(this.waiting&&!e.target.closest?.('#keyBindings button[data-id]'))this.cancel('Nada mudou.');},true);
  dialog?.addEventListener('cancel',e=>{if(this.waiting||performance.now()-this.escapeAt<400)e.preventDefault();});
  dialog?.addEventListener('close',()=>this.cancel(''));
  this.bindings.onChange(()=>this.render());
  this.render();
 }
 listen(id,slot){
  this.waiting={id,slot};this.render();
  this.say(`Aperte a tecla para ${NAMES[id]}${slot?' (segunda tecla)':''} · Esc cancela · Backspace deixa sem tecla`);
 }
 cancel(text){if(!this.waiting)return;this.waiting=null;this.render();if(text!==undefined)this.say(text);}
 key(e){
  if(!this.waiting||!e.isTrusted)return;
  e.preventDefault();e.stopImmediatePropagation();
  const code=physicalCode(e),{id,slot}=this.waiting;if(e.repeat)return;
  this.swallow.add(code);
  if(code==='Escape'){this.escapeAt=performance.now();this.cancel('Nada mudou.');return;}
  if(code==='Backspace'||code==='Delete'){
   this.waiting=null;this.bindings.clear(id,slot);this.render();
   this.say(`${NAMES[id]} ficou sem ${slot?'a segunda tecla':'tecla'}.`);return;
  }
  if(!keyAllowed(code)){this.say(`${this.bindings.label(code)} é do menu ou do navegador: escolha outra tecla para ${NAMES[id]}.`);return;}
  this.waiting=null;
  const result=this.bindings.set(id,slot,code,e.shiftKey?null:e.key),label=this.bindings.label(code);
  if(!result.ok){this.render();return;}
  if(result.same){this.render();this.say(`${label} já é ${NAMES[id]}.`);return;}
  const moved=result.moved?(result.moved.key?` ${NAMES[result.moved.id]} ficou com ${this.bindings.label(result.moved.key)}.`:` ${NAMES[result.moved.id]} ficou sem essa tecla.`):'';
  this.say(`${label} agora é ${NAMES[id]}.${moved}`);
  this.focus(id,slot);
 }
 say(text){this.note.textContent=text;}
 focus(id,slot){this.list.querySelector(`button[data-id="${id}"][data-slot="${slot}"]`)?.focus();}
 render(){
  const b=this.bindings,focused=document.activeElement?.closest?.('#keyBindings button[data-id]'),again=focused&&[focused.dataset.id,focused.dataset.slot];
  const slotButton=(a,slot)=>{
   const key=b.keys[a.id][slot],waiting=this.waiting?.id===a.id&&this.waiting.slot===slot,label=waiting?'Aperte…':key?b.label(key):slot?'+':'—';
   const what=waiting?'aguardando a nova tecla':key?`tecla ${b.label(key)}`:'sem tecla';
   return `<button type="button" class="key-slot${waiting?' waiting':''}${key?'':' empty'}" data-id="${a.id}" data-slot="${slot}" aria-label="${escape(`${a.name}, ${slot?'segunda tecla':'tecla'}: ${what}. Clique para trocar`)}">${escape(label)}</button>`;
  };
  let html='';
  for(const [group,title] of KEY_GROUPS){
   html+=`<section class="keys-group"><h5>${escape(title.toUpperCase())}</h5>`;
   for(const a of KEY_ACTIONS.filter(a=>a.group===group)){
    const changed=!b.isOriginal(a.id);
    html+=`<div class="keys-row${changed?' changed':''}"><div class="keys-what"><b>${escape(a.name)}</b>${changed?'<i>mudou</i>':''}${a.note?`<small>${escape(a.note)}</small>`:''}</div><div class="keys-slots">${slotButton(a,0)}${slotButton(a,1)}</div></div>`;
   }
   if(group==='jogo')html+='<div class="keys-row fixed"><div class="keys-what"><b>Menu</b><small>fixa: abre e fecha o menu, e cancela a troca de uma tecla</small></div><div class="keys-slots"><kbd>Esc</kbd></div></div>';
   html+='</section>';
  }
  this.list.innerHTML=html;
  if(again)this.focus(...again);
  $('keysReset').classList.toggle('keys-changed',b.changed);
 }
}
