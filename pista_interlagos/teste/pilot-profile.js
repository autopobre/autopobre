import {cleanName,readRecords} from './lap-records.js';
export const PILOTS_KEY='autopobre-pilots-v1';
const same=(a,b)=>a.toLocaleLowerCase('pt-BR')===b.toLocaleLowerCase('pt-BR');
export function pilotStorage(){try{return globalThis.localStorage;}catch{return null;}}
export class PilotProfiles {
 constructor(storage=pilotStorage()){
  this.storage=storage;this.names=[];this.selected='';this.error='';let saved={},legacy='';
  try{saved=JSON.parse(storage?.getItem(PILOTS_KEY)||'{}')||{};legacy=storage?.getItem('autopobre-record-name')||'';}catch{}
  const names=[...(Array.isArray(saved.names)?saved.names:[]),legacy,...readRecords(storage).map(r=>r.name)];
  for(const value of names){if(typeof value!=='string')continue;const name=cleanName(value);if(name&&!this.names.some(n=>same(n,name)))this.names.push(name);}
  const selected=typeof saved.selected==='string'?saved.selected:legacy;
  this.selected=this.names.find(n=>same(n,selected))||this.names[0]||'';
 }
 remember(value){
  const name=cleanName(value);if(!name)return '';
  this.selected=this.names.find(n=>same(n,name))||name;
  if(!this.names.includes(this.selected))this.names.push(this.selected);
  try{this.storage.setItem(PILOTS_KEY,JSON.stringify({selected:this.selected,names:this.names}));this.storage.setItem('autopobre-record-name',this.selected);this.error='';}
  catch{this.error='Não foi possível salvar o piloto neste navegador.';}
  return this.selected;
 }
}
export class PilotPicker {
 constructor(profiles=new PilotProfiles()){
  this.profiles=profiles;this.root=document.createElement('section');this.root.id='pilotPicker';
  this.root.innerHTML='<label id="pilotLabel" for="pilotName">Piloto</label><div class="pilot-fields"><select id="pilotSelect" aria-labelledby="pilotLabel" hidden></select><input id="pilotName" aria-labelledby="pilotLabel" maxlength="32" autocomplete="nickname" placeholder="Digite seu nome" required></div><small id="pilotMessage" role="status"></small>';
  document.querySelector('#menu .menu-modes').before(this.root);this.input=this.root.querySelector('input');this.select=this.root.querySelector('select');this.message=this.root.querySelector('small');
  this.select.onchange=()=>{if(this.select.value)this.profiles.remember(this.select.value);this.input.hidden=this.select.value!=='';this.input.value=this.select.value;this.message.textContent='';this.root.querySelector('label').htmlFor=this.input.hidden?'pilotSelect':'pilotName';if(!this.input.hidden)this.input.focus();};
  this.input.oninput=()=>{this.input.setCustomValidity('');this.message.textContent='';};
  // Signed in with a nickname (conta.js), the pilot is the account's: shown instead of typed or picked, and a click
  // opens the account, where the nickname changes. This browser's data under that name (records, ghosts, looks) stays its.
  this.accountName='';this.openAccount=null;
  this.accountButton=document.createElement('button');this.accountButton.type='button';this.accountButton.id='pilotAccount';this.accountButton.hidden=true;this.accountButton.title='Sua conta';
  this.accountButton.onclick=()=>this.openAccount?.();this.root.querySelector('.pilot-fields').append(this.accountButton);
  this.render();
 }
 useAccount(name,open=null){
  this.accountName=name?this.profiles.remember(name):'';this.openAccount=open;this.message.textContent='';this.render();
 }
 render(){
  this.select.replaceChildren();for(const name of this.profiles.names){const option=document.createElement('option');option.value=option.textContent=name;this.select.append(option);}
  const add=document.createElement('option');add.value='';add.textContent='+ Novo piloto';this.select.append(add);
  this.select.hidden=this.profiles.names.length<2;this.select.value=this.profiles.selected;this.input.value=this.profiles.selected;this.input.hidden=!this.select.hidden&&!!this.select.value;
  this.root.querySelector('label').htmlFor=this.input.hidden?'pilotSelect':'pilotName';
  this.accountButton.hidden=!this.accountName;
  if(this.accountName){
   this.select.hidden=this.input.hidden=true;this.root.querySelector('label').htmlFor='pilotAccount';
   const name=document.createElement('span'),tag=document.createElement('small');name.textContent=this.accountName;tag.textContent='sua conta';
   this.accountButton.replaceChildren(name,tag);
  }
 }
 commit(){
  if(this.accountName)return this.accountName;
  const value=this.input.hidden?this.select.value:this.input.value,name=this.profiles.remember(value);
  if(!name){this.message.textContent='Informe o nome do piloto para começar.';this.input.hidden=false;this.input.setCustomValidity(this.message.textContent);this.input.focus();this.input.reportValidity();return '';}
  this.render();this.message.textContent=this.profiles.error;return name;
 }
}
