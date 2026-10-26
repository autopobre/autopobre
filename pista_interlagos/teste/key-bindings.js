// The keyboard the player's way (the Controles tab, keys-panel.js). The game answers every key by its
// code (e.code: 'KeyW', 'Space'…), in main.js and in every mode, so the player's keys are not taught to
// each of them: a key the player gave an action reads as that action's own key, an action's own key
// moved elsewhere (and given to nothing) reads as no key, and every other key stays itself. Only the
// keyboard is read so: the controller's and the wheel's buttons press the original keys (synthetic
// events), text fields keep their keys, and so does any key held with Ctrl, Alt or ⌘ (the arena
// editor's Ctrl+Z). Saved in the browser at every change (KEYS_STORAGE); Restaurar o padrão empties it.
export const KEYS_STORAGE='opala99-teclas-v1';
const UNBOUND='Unidentified';
export const KEY_GROUPS=Object.freeze([['dirigir','Dirigir'],['visual','Câmeras e visual'],['fora','Carro, boxes e a pé'],['arena','Arena de Drift'],['jogo','Jogo']]);
// Each action: its group, its name and a note on what else it does where, and its original key or keys.
// A second one (the arrows, the right Shift, the numeric keypad) is the action's second key, and reads
// as that key: everywhere they do the same, except that only the row of numbers answers in a talk.
export const KEY_ACTIONS=Object.freeze([
 {id:'acelerar',group:'dirigir',name:'Acelerar',note:'a pé e nos boxes, andar para a frente · na selfie, subir o celular',codes:['KeyW','ArrowUp']},
 {id:'frear',group:'dirigir',name:'Frear',note:'com o carro parado, segurar dá ré · a pé, andar para trás · na selfie, descer o celular',codes:['KeyS','ArrowDown']},
 {id:'esquerda',group:'dirigir',name:'Virar à esquerda',note:'a pé, girar o piloto (na selfie, o celular)',codes:['KeyA','ArrowLeft']},
 {id:'direita',group:'dirigir',name:'Virar à direita',note:'a pé, girar o piloto (na selfie, o celular)',codes:['KeyD','ArrowRight']},
 {id:'freioMao',group:'dirigir',name:'Freio de mão',note:'aperte para puxar e de novo para soltar · a pé, pular · na selfie, tirar a foto · no pódio, continuar',codes:['Space']},
 {id:'freioSegurado',group:'dirigir',name:'Freio de mão segurado',note:'só enquanto segura, o jeito do drift · no reconhecimento, ver outro piloto (com Shift, o anterior)',codes:['KeyN']},
 {id:'re',group:'dirigir',name:'Marcha à ré',note:'segure · a pé, a selfie: o piloto tira o celular e vira de frente para você, com a pista atrás (de novo, guarda o celular)',codes:['KeyQ']},
 {id:'subir',group:'dirigir',name:'Subir a marcha',note:'no manual e no automático: no automático, a marcha escolhida fica uns segundos e ele volta a trocar sozinho',codes:['KeyX']},
 {id:'descer',group:'dirigir',name:'Descer a marcha',note:'no manual e no automático, se o motor não passar do giro; no manual, parado na 1ª, engata a ré',codes:['KeyZ']},
 {id:'buzina',group:'dirigir',name:'Buzina',note:'segure · o Opala com o par de buzinas dele, grave e aguda; o Fusca com a sua',codes:['KeyH']},
 {id:'camera',group:'visual',name:'Trocar câmera',note:'a pé, agachar',codes:['KeyC']},
 ...['perseguição','próxima','distante','capô','interna','TV','aérea','órbita 360°'].map((view,i)=>({id:'cam'+(i+1),group:'visual',name:`Câmera ${view}`,
  note:i<3?`nas conversas, a resposta ${i+1} · na selfie, você ${['à esquerda','no centro','à direita'][i]} da foto`:'',codes:[`Digit${i+1}`,`Numpad${i+1}`]})),
 {id:'olharTras',group:'visual',name:'Olhar para trás',note:'segure (câmeras interna, capô e perseguição)',codes:['KeyB']},
 {id:'pintura',group:'visual',name:'Trocar a pintura',note:'',codes:['KeyV']},
 {id:'fantasma',group:'visual',name:'Fantasma',note:'o Opala da sua melhor volta na pista, para estudar e tentar bater; liga e desliga',codes:['KeyG']},
 {id:'linha',group:'visual',name:'Linha ideal',note:'o trajeto recomendado no asfalto: verde acelera, amarelo segura, vermelho freia; troca entre completa, só nas curvas e desligada',codes:['KeyO']},
 {id:'farois',group:'visual',name:'Faróis de milha',note:'à noite e na chuva, liga e desliga; no Modo História o piloto acende',codes:['KeyK']},
 {id:'limpador',group:'visual',name:'Limpador de para-brisa',note:'na garoa e na chuva, liga e desliga; no Modo Corrida já larga ligado',codes:['KeyJ']},
 {id:'horario',group:'visual',name:'Mudar o horário',note:'durante a corrida: dia, fim de tarde, noite',codes:['KeyY']},
 {id:'clima',group:'visual',name:'Mudar o clima',note:'durante a corrida: seco, garoa, chuva forte',codes:['KeyU']},
 {id:'sair',group:'fora',name:'Sair do carro e voltar a ele',note:'em qualquer ponto da pista (ele para antes); a pé, o guard-rail só pulando. A corrida continua: cuidado com quem vem!',codes:['KeyF']},
 {id:'acao',group:'fora',name:'Ação por perto',note:'conversar; no Opala, capô na frente e porta-malas atrás; com algo na mão, comer ou beber; a pé no Mineirão, chutar a bola (segure para mais forte)',codes:['KeyE']},
 {id:'correr',group:'fora',name:'Correr a pé',note:'segure',codes:['ShiftLeft','ShiftRight']},
 {id:'ignicao',group:'fora',name:'Ignição (IGN)',note:'na partida do Modo História',codes:['KeyL']},
 {id:'partida',group:'fora',name:'Partida',note:'segure, dosando o acelerador',codes:['KeyI']},
 {id:'resgate',group:'fora',name:'Reposicionar ou pedir reboque',note:'na selfie, vira o celular entre vertical e horizontal · a pé com a bola no Mineirão, passe rasteiro (segure para mais forte)',codes:['KeyR']},
 {id:'arena',group:'arena',name:'Painel da arena',note:'layouts, desafios e editor · numa sala multiplayer, escrever no chat (com Shift, mostrar ou esconder o chat)',codes:['KeyT']},
 {id:'gasMenos',group:'arena',name:'Acelerador: menos',note:'quanto o carro acelera com a tecla no fundo',codes:['Digit9','Numpad9']},
 {id:'gasMais',group:'arena',name:'Acelerador: mais',note:'',codes:['Digit0','Numpad0']},
 {id:'volanteMenos',group:'arena',name:'Volante: menos',note:'quanto as rodas viram',codes:['Minus','NumpadSubtract']},
 {id:'volanteMais',group:'arena',name:'Volante: mais',note:'',codes:['Equal','NumpadAdd']},
 {id:'pausar',group:'jogo',name:'Pausar',note:'a pista fica na tela',codes:['KeyP']},
 {id:'mudo',group:'jogo',name:'Silenciar tudo',note:'',codes:['KeyM']}
].map(Object.freeze));
// Keys no action can take: Esc (the menu, and it cancels a key being picked), Backspace and Delete (no key
// in that place, and the arena editor's), the menus' Enter and Tab, the F keys (F3, the browser's), the
// modifiers, the locks and the system's own (browser, media, power). A code is letters and digits only.
const FIXED=new Set(['Escape','Backspace','Delete','Tab','Enter','NumpadEnter','CapsLock','NumLock','ScrollLock','Pause','PrintScreen','ContextMenu','Fn','FnLock','Unidentified']);
export const keyAllowed=code=>typeof code==='string'&&/^[A-Za-z0-9]{1,32}$/.test(code)&&!FIXED.has(code)&&!/^F\d+$/.test(code)&&!/^(Control|Alt|Meta|OS|Browser|Audio|Media|Launch|Power|Sleep|WakeUp|Eject)/.test(code);
const ACTION=new Map(KEY_ACTIONS.map(a=>[a.id,a]));
const original=a=>[a.codes[0],a.codes[1]??null];
// What a key in that place reads as: the action's key in that place (one with a single key, that key).
const readsAs=(a,slot)=>a.codes[slot]??a.codes[0];
const same=(x,y)=>x[0]===y[0]&&x[1]===y[1];
// A saved set of keys, checked: each action's two places (a valid key or none), a key in one place only (an
// action saved wins over the ones left as they came; then the first in the list).
export function normalizeKeys(saved){
 const keys={},source=saved&&typeof saved==='object'?saved:{},seen=new Set();
 const valid=k=>keyAllowed(k)?k:null,own=KEY_ACTIONS.filter(a=>Array.isArray(source[a.id]));
 for(const a of own)keys[a.id]=[valid(source[a.id][0]),valid(source[a.id][1])];
 for(const a of own)keys[a.id]=keys[a.id].map(k=>k&&!seen.has(k)?(seen.add(k),k):null);
 for(const a of KEY_ACTIONS)if(!keys[a.id])keys[a.id]=original(a).map(k=>k&&!seen.has(k)?(seen.add(k),k):null);
 return keys;
}
// Names of the keys that print nothing or print something else; the rest by what the key printed when
// it was picked or the keyboard's own layout (navigator.keyboard: an ABNT2 keyboard's Semicolon is Ç),
// or else by its code's letter or number. What a key printed (saved in the browser, or the layout's) names it
// only as one visible character, and never one HTML reads (the story panel puts the names in its markup):
// those show as look-alikes.
const NAMES={Space:'Espaço',ShiftLeft:'Shift',ShiftRight:'Shift dir.',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Minus:'−',Equal:'=',Escape:'Esc',
 Insert:'Insert',Home:'Home',End:'End',PageUp:'PgUp',PageDown:'PgDn',NumpadAdd:'Num +',NumpadSubtract:'Num −',NumpadMultiply:'Num *',NumpadDivide:'Num /',NumpadDecimal:'Num ,',NumpadComma:'Num ,',NumpadEqual:'Num ='};
const MARKUP={'<':'‹','>':'›','&':'＆','"':'＂',"'":'’','`':'ˋ'};
export const shownChar=v=>typeof v==='string'&&[...v].length===1&&/^[^\p{C}\p{Z}]$/u.test(v)?MARKUP[v]??v.toUpperCase():null;
export function keyLabel(code,printed={},layout=null){
 if(!code)return '—';if(Object.hasOwn(NAMES,code))return NAMES[code];if(/^Numpad\d$/.test(code))return 'Num '+code.slice(6);
 const shown=shownChar(Object.hasOwn(printed,code)?printed[code]:null)??shownChar(layout?.get?.(code));if(shown)return shown;
 return /^Key[A-Z]$/.test(code)?code.slice(3):/^Digit\d$/.test(code)?code.slice(5):/^[A-Za-z0-9]{1,32}$/.test(code)?code:'?';
}
function browserStorage(){try{return globalThis.localStorage;}catch{return null;}}
export class KeyBindings {
 constructor(storage=browserStorage()){
  this.storage=storage;this.layout=null;this.listeners=new Set();this.revision=0;let saved;
  try{saved=JSON.parse(storage?.getItem(KEYS_STORAGE)||'null');}catch{}
  this.keys=normalizeKeys(saved?.keys);
  const printed=saved?.printed;
  this.printed=Object.fromEntries(Object.entries(printed&&typeof printed==='object'&&!Array.isArray(printed)?printed:{}).filter(([k,v])=>keyAllowed(k)&&shownChar(v)));
  this.rebuild(false);
 }
 // Physical key → the key it reads as; empty while every key is the original one.
 rebuild(notify=true){
  const reads=new Map();
  for(const a of KEY_ACTIONS)this.keys[a.id].forEach((k,slot)=>{if(k)reads.set(k,readsAs(a,slot));});
  for(const a of KEY_ACTIONS)for(const k of a.codes)if(!reads.has(k))reads.set(k,UNBOUND);
  for(const [k,v] of reads)if(k===v)reads.delete(k);
  this.reads=reads;this.revision++;
  if(notify)for(const fn of this.listeners)fn(this);
 }
 onChange(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
 save(){
  const keys={},printed={};
  for(const a of KEY_ACTIONS)if(!same(this.keys[a.id],original(a)))keys[a.id]=[...this.keys[a.id]];
  for(const a of KEY_ACTIONS)for(const k of this.keys[a.id])if(k&&this.printed[k])printed[k]=this.printed[k];
  try{if(Object.keys(keys).length)this.storage?.setItem(KEYS_STORAGE,JSON.stringify({keys,printed}));else this.storage?.removeItem(KEYS_STORAGE);}catch{}
 }
 get changed(){return KEY_ACTIONS.some(a=>!this.isOriginal(a.id));}
 isOriginal(id){const a=ACTION.get(id);return !!a&&same(this.keys[id],original(a));}
 // The key read as `code` (keyboard events only; see installKeyBindings).
 read(code){return this.reads.size?this.reads.get(code)??code:code;}
 // Where a key is now: {id, slot}, or null.
 owner(code){for(const a of KEY_ACTIONS){const slot=this.keys[a.id].indexOf(code);if(slot>=0)return {id:a.id,slot};}return null;}
 // The key now in that place. A key another action had swaps with the one this place had (or leaves that
 // one without a key). printed: what the key printed (e.key), for its name.
 set(id,slot,code,printed){
  const a=ACTION.get(id);if(!a||![0,1].includes(slot))return {ok:false};
  if(!keyAllowed(code))return {ok:false,fixed:true};
  const before=this.keys[id][slot],from=this.owner(code);
  if(from&&from.id===id&&from.slot===slot)return {ok:true,same:true};
  if(shownChar(printed))this.printed[code]=printed;
  let moved=null;
  if(from){this.keys[from.id][from.slot]=before;moved={...from,key:before};}
  this.keys[id][slot]=code;this.save();this.rebuild();
  return {ok:true,moved,before};
 }
 clear(id,slot){if(!ACTION.get(id)||!this.keys[id][slot])return;this.keys[id][slot]=null;this.save();this.rebuild();}
 reset(){this.keys=normalizeKeys(null);this.printed={};this.save();this.rebuild();}
 // The keyboard's own layout, when the browser tells it, names the keys (an AZERTY keyboard's KeyW is Z).
 setLayout(layout){this.layout=layout;this.rebuild();}
 label(code){return keyLabel(code,this.printed,this.layout);}
 // The key the player presses now for what the game calls `code` (its original key): that place's key,
 // else the action's other one; a key outside the actions is itself. Null: the action has no key.
 key(code){
  for(const a of KEY_ACTIONS){
   const slot=a.codes.indexOf(code);if(slot<0)continue;
   return this.keys[a.id][slot]??this.keys[a.id][1-slot]??null;
  }
  return code;
 }
 // Its name for the screen ('—' with no key).
 name(code){return this.label(this.key(code));}
}
// The player's keys, one set for the whole game.
export const playerKeys=new KeyBindings();
export const keyName=code=>playerKeys.name(code);
// A text with keys in braces ('{KeyE}: conversar') with the player's keys in their place.
export const keyText=text=>text.replace(/\{((?:Key|Digit|Numpad|Arrow|Shift)\w+|Space|Minus|Equal)\}/g,(_,code)=>keyName(code));
// The page's key names: <kbd data-key="KeyW">, and titles written as data-keys-title="… ({KeyV})". A button's data-key
// is the key it presses (the touch FREIO DE MÃO, OLHAR TRÁS, BUZINA: their words stay) and a div's is no key at all
// (the career's morale bars).
export function applyKeyLabels(root=document){
 for(const el of root.querySelectorAll('[data-key]:not(button):not(div)'))el.textContent=keyName(el.dataset.key);
 for(const el of root.querySelectorAll('[data-keys-title]'))el.title=keyText(el.dataset.keysTitle);
}
const NATIVE_CODE=typeof KeyboardEvent==='undefined'?null:Object.getOwnPropertyDescriptor(KeyboardEvent.prototype,'code');
// The key really pressed, whatever it reads as (keys-panel.js picks keys by it).
export const physicalCode=e=>NATIVE_CODE?.get?NATIVE_CODE.get.call(e):e.code;
const TEXT_INPUTS=new Set(['text','search','email','password','number','tel','url']);
const typing=t=>!!t&&(t.isContentEditable||t.tagName==='TEXTAREA'||t.tagName==='INPUT'&&TEXT_INPUTS.has((t.type||'text').toLowerCase()));
// Every keyboard event's code reads through the player's keys from here on (main.js, once).
let installed=false;
export function installKeyBindings(bindings=playerKeys){
 if(!NATIVE_CODE?.get||!NATIVE_CODE.configurable||installed)return false;installed=true;
 Object.defineProperty(KeyboardEvent.prototype,'code',{configurable:true,enumerable:NATIVE_CODE.enumerable,get(){
  const code=NATIVE_CODE.get.call(this);
  return !this.isTrusted||this.ctrlKey||this.altKey||this.metaKey||typing(this.target)?code:bindings.read(code);
 }});
 navigator.keyboard?.getLayoutMap?.().then(layout=>bindings.setLayout(layout),()=>{});
 return true;
}
