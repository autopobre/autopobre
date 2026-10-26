import {cleanName,readRecords,RECORD_CARS} from './lap-records.js';
export const PILOTS_KEY='autopobre-pilots-v1';
// Google's "G" (its sign-in mark), beside the pilot signed in with a Google account (conta.js).
const GOOGLE_G='<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
const same=(a,b)=>a.toLocaleLowerCase('pt-BR')===b.toLocaleLowerCase('pt-BR');
export function pilotStorage(){try{return globalThis.localStorage;}catch{return null;}}
export class PilotProfiles {
 constructor(storage=pilotStorage()){
  this.storage=storage;this.names=[];this.selected='';this.error='';let saved={},legacy='';
  try{saved=JSON.parse(storage?.getItem(PILOTS_KEY)||'{}')||{};legacy=storage?.getItem('autopobre-record-name')||'';}catch{}
  const names=[...(Array.isArray(saved.names)?saved.names:[]),legacy,...RECORD_CARS.flatMap(car=>readRecords(storage,car).map(r=>r.name))];
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
  this.accountButton=document.createElement('button');this.accountButton.type='button';this.accountButton.id='pilotAccount';this.accountButton.hidden=true;this.accountButton.title='Sua conta Google';
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
   const name=document.createElement('span'),mark=document.createElement('span');name.textContent=this.accountName;
   mark.className='pilot-account-g';mark.setAttribute('role','img');mark.setAttribute('aria-label','Entrou com a conta Google');mark.innerHTML=GOOGLE_G;
   this.accountButton.replaceChildren(name,mark);
  }
 }
 commit(){
  if(this.accountName)return this.accountName;
  const value=this.input.hidden?this.select.value:this.input.value,name=this.profiles.remember(value);
  if(!name){this.message.textContent='Informe o nome do piloto para começar.';this.input.hidden=false;this.input.setCustomValidity(this.message.textContent);this.input.focus();this.input.reportValidity();return '';}
  this.render();this.message.textContent=this.profiles.error;return name;
 }
}
