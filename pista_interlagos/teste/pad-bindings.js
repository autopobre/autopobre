// The controller the player's way (the Controles tab, pad-panel.js). Its buttons press the keyboard's own keys, which the
// game answers everywhere, and what a button presses depends on where the pilot is (main.js padPlace): at the wheel
// (car) or on foot (foot: walking, at the box's café, in the story's paddock, on the podium). Each command takes up to
// two buttons; a button another command of the same place had swaps over, as on the keyboard. The triggers (the
// pedals), the sticks and Menu stay as they are. Saved in the browser at every change (PAD_STORAGE: its own key, as the
// keyboard's, since older builds drop unknown preference fields); Restaurar os botões padrão empties it.
export const PAD_STORAGE='opala99-controle-v1';
export const PAD_PLACES=Object.freeze([['car','Pilotando'],['foot','A pé']]);
// The standard mapping's buttons: RT and LT (7, 6) are the pedals and Menu (9) the menu, so no command takes them.
export const MENU_BUTTON=9,TRIGGERS=Object.freeze([6,7]);
export const PAD_BUTTONS=Object.freeze([0,1,2,3,4,5,8,10,11,12,13,14,15,16,17]);
// Each command: its place, its name, a note, the key it presses and its buttons as they come. At the wheel, the team's
// pedido of 10-22: Y the handbrake, X and A the gears (the automatic's too), ↓ out of the car; the horn went from X to
// L3 (as in Forza Horizon), the lights from L3 to ← and the IGN from Y to →; Central #17 (10-24): the horn on LB, the
// start (PART) it had going to L3. On foot, as the controller always was, and ↓ back into the car as well.
export const PAD_ACTIONS=Object.freeze([
 {id:'freioMao',place:'car',name:'Freio de mão',note:'aperte para puxar e de novo para soltar; a largada sempre o solta',code:'Space',buttons:[3]},
 {id:'subir',place:'car',name:'Subir a marcha',note:'no manual e no automático: no automático, a marcha escolhida fica uns segundos e ele volta a trocar sozinho',code:'KeyX',buttons:[2]},
 {id:'descer',place:'car',name:'Descer a marcha',note:'no manual e no automático, se o motor não passar do giro; no manual, parado na 1ª, engata a ré',code:'KeyZ',buttons:[0]},
 {id:'re',place:'car',name:'Marcha à ré',note:'segure',code:'KeyQ',buttons:[1]},
 {id:'sair',place:'car',name:'Sair do carro',note:'em qualquer ponto da pista (ele para antes); nos boxes, ir ao café da Tia',code:'KeyF',buttons:[13]},
 {id:'buzina',place:'car',name:'Buzina',note:'segure',code:'KeyH',buttons:[4]},
 {id:'camera',place:'car',name:'Trocar câmera',note:'',code:'KeyC',buttons:[5]},
 {id:'olharTras',place:'car',name:'Olhar para trás',note:'segure',code:'KeyB',buttons:[11]},
 {id:'fantasma',place:'car',name:'Fantasma',note:'o Opala da sua melhor volta na pista; liga e desliga',code:'KeyG',buttons:[12]},
 {id:'farois',place:'car',name:'Faróis de milha',note:'à noite e na chuva, liga e desliga',code:'KeyK',buttons:[14]},
 {id:'ignicao',place:'car',name:'Ignição (IGN)',note:'na partida do Modo História',code:'KeyL',buttons:[15]},
 {id:'partida',place:'car',name:'Partida',note:'segure, dosando o acelerador',code:'KeyI',buttons:[10]},
 {id:'resgate',place:'car',name:'Reposicionar ou pedir reboque',note:'',code:'KeyR',buttons:[8]},
 {id:'freioSegurado',place:'car',name:'Freio de mão segurado',note:'só enquanto segura, o jeito do drift · no reconhecimento, ver outro piloto',code:'KeyN',buttons:[]},
 {id:'linha',place:'car',name:'Linha ideal',note:'completa, só nas curvas ou desligada',code:'KeyO',buttons:[]},
 {id:'limpador',place:'car',name:'Limpador de para-brisa',note:'na garoa e na chuva, liga e desliga',code:'KeyJ',buttons:[]},
 {id:'pintura',place:'car',name:'Trocar a pintura',note:'',code:'KeyV',buttons:[]},
 {id:'horario',place:'car',name:'Mudar o horário',note:'dia, fim de tarde, noite',code:'KeyY',buttons:[]},
 {id:'clima',place:'car',name:'Mudar o clima',note:'seco, garoa, chuva forte',code:'KeyU',buttons:[]},
 {id:'arena',place:'car',name:'Painel da Arena de Drift',note:'layouts, desafios e editor',code:'KeyT',buttons:[]},
 {id:'voltar',place:'foot',name:'Voltar ao carro',note:'perto dele; no paddock do Modo História, entrar no Opala',code:'KeyF',buttons:[3,13]},
 {id:'acao',place:'foot',name:'Ação por perto',note:'conversar; no Opala, capô e porta-malas; comer ou beber; no pódio, continuar; no Mineirão, chutar a bola (segure para mais forte)',code:'KeyE',buttons:[2]},
 {id:'pular',place:'foot',name:'Pular',note:'no pódio, continuar · na selfie, tirar a foto',code:'Space',buttons:[0]},
 {id:'selfie',place:'foot',name:'Selfie',note:'o piloto tira o celular e vira de frente para você; de novo, guarda',code:'KeyQ',buttons:[1]},
 {id:'correr',place:'foot',name:'Correr',note:'segure',code:'ShiftLeft',buttons:[10]},
 {id:'agachar',place:'foot',name:'Agachar',note:'',code:'KeyC',buttons:[5]},
 {id:'passe',place:'foot',name:'Passe rasteiro',note:'com a bola no Mineirão (segure para mais forte) · na selfie, vira o celular',code:'KeyR',buttons:[8]},
 ...[1,2,3].map(n=>({id:'resposta'+n,place:'foot',name:`Resposta ${n}`,note:`nas conversas · na selfie, você ${['à esquerda','no centro','à direita'][n-1]} da foto`,code:'Digit'+n,buttons:[[14,12,15][n-1]]}))
].map(a=>Object.freeze({...a,buttons:Object.freeze(a.buttons)})));
const ACTION=new Map(PAD_ACTIONS.map(a=>[a.id,a]));
const original=a=>[a.buttons[0]??null,a.buttons[1]??null];
const same=(x,y)=>x[0]===y[0]&&x[1]===y[1];
const valid=b=>PAD_BUTTONS.includes(b)?b:null;
// A saved set of buttons, checked: each command's two places (a button or none), a button in one place only within its
// place (a command saved wins over the ones left as they came; then the first in the list).
export function normalizePad(saved){
 const buttons={},source=saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};
 for(const [place] of PAD_PLACES){
  const seen=new Set(),take=b=>b!==null&&!seen.has(b)?(seen.add(b),b):null,mine=PAD_ACTIONS.filter(a=>a.place===place);
  const own=mine.filter(a=>Object.hasOwn(source,a.id)&&Array.isArray(source[a.id]));
  for(const a of own)buttons[a.id]=[valid(source[a.id][0]),valid(source[a.id][1])].map(take);
  for(const a of mine)if(!buttons[a.id])buttons[a.id]=original(a).map(take);
 }
 return buttons;
}
// The buttons' names on an Xbox pad and on a PlayStation one (Sony's vendor id, 054c, or its names in the pad's id).
const XBOX=['A','B','X','Y','LB','RB','LT','RT','View','Menu','L3','R3','↑','↓','←','→','Xbox','Touchpad'];
const PLAYSTATION=['✕','○','□','△','L1','R1','L2','R2','Share','Options','L3','R3','↑','↓','←','→','PS','Touchpad'];
export const padStyle=id=>/054c|playstation|dualsense|dualshock/i.test(id??'')?'playstation':'xbox';
export const buttonName=(index,style='xbox')=>(style==='playstation'?PLAYSTATION:XBOX)[index]??`Botão ${index}`;
function browserStorage(){try{return globalThis.localStorage;}catch{return null;}}
export class PadBindings {
 constructor(storage=browserStorage()){
  this.storage=storage;this.listeners=new Set();this.revision=0;let saved;
  try{saved=JSON.parse(storage?.getItem(PAD_STORAGE)||'null');}catch{}
  this.buttons=normalizePad(saved?.buttons);this.rebuild(false);
 }
 // Each place's button → the key it presses.
 rebuild(notify=true){
  this.presses=Object.fromEntries(PAD_PLACES.map(([place])=>[place,new Map()]));
  for(const a of PAD_ACTIONS)for(const b of this.buttons[a.id])if(b!==null)this.presses[a.place].set(b,a.code);
  this.revision++;
  if(notify)for(const fn of this.listeners)fn(this);
 }
 onChange(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
 // The key a button presses there (null: none).
 code(place,button){return this.presses[place]?.get(button)??null;}
 save(){
  const buttons={};for(const a of PAD_ACTIONS)if(!this.isOriginal(a.id))buttons[a.id]=[...this.buttons[a.id]];
  try{if(Object.keys(buttons).length)this.storage?.setItem(PAD_STORAGE,JSON.stringify({buttons}));else this.storage?.removeItem(PAD_STORAGE);}catch{}
 }
 get changed(){return PAD_ACTIONS.some(a=>!this.isOriginal(a.id));}
 isOriginal(id){const a=ACTION.get(id);return !!a&&same(this.buttons[id],original(a));}
 // Where a button is now in that place: {id, slot}, or null.
 owner(place,button){for(const a of PAD_ACTIONS){if(a.place!==place)continue;const slot=this.buttons[a.id].indexOf(button);if(slot>=0)return {id:a.id,slot};}return null;}
 // The button now in that place of the command. One another command of the same place had swaps with the one this place
 // had (or leaves that one without a button).
 set(id,slot,button){
  const a=ACTION.get(id);if(!a||![0,1].includes(slot))return {ok:false};
  if(valid(button)===null)return {ok:false,fixed:true};
  const before=this.buttons[id][slot],from=this.owner(a.place,button);
  if(from&&from.id===id&&from.slot===slot)return {ok:true,same:true};
  let moved=null;
  if(from){this.buttons[from.id][from.slot]=before;moved={...from,button:before};}
  this.buttons[id][slot]=button;this.save();this.rebuild();
  return {ok:true,moved,before};
 }
 clear(id,slot){if(!ACTION.get(id)||this.buttons[id][slot]===null)return;this.buttons[id][slot]=null;this.save();this.rebuild();}
 reset(){this.buttons=normalizePad(null);this.save();this.rebuild();}
}
// The player's buttons, one set for the whole game.
export const playerPad=new PadBindings();
