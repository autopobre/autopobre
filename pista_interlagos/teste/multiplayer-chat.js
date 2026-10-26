// The room's chat (multiplayer.js). T writes a line (Enter sends it, Esc gives up), Shift+T shows or
// hides the chat window: the arena panel's key (key-bindings.js), which a room never uses, so a key the
// player moved there moves the chat too. Everyone let in reads each line in that window and in a balloon
// over the car of whoever said it (over the pilot himself, in his own window, when he is out of the car:
// the others see only his car). The balloons always show; whether the window is open is this browser's
// (CHAT_STORE). On a touch screen the window's own buttons do the same.
// Lines come cleaned (chat-text.js chatText; online the room server cleans them again, refuses links
// and keeps the pace) and reach the page only as text (textContent), never as markup. A line with a link
// is not sent: the box says so and keeps it, to be fixed.
import * as THREE from 'three';
import {CHAT_LENGTH,chatText,chatLink} from './chat-text.js';
const CHAT_STORE='autopobre-chat-janela';
// Lines the window shows, and keeps; a balloon's seconds (more for a longer line), its fade, and how far
// off (metres) a car's balloon still shows.
const SHOWN=6,KEPT=40,BALLOON=4,BALLOON_PER_CHAR=.07,BALLOON_MAX=10,FADE=.5,FAR=250;
// The names' colours on the window's dark glass (this window's own in the game's lime).
const NAME_COLOURS=['#7fd8ff','#ffb86b','#ff9cbc','#c1b2ff','#8ff0b0','#ffd84d','#9fe7e0','#ffa78f'];
const store=()=>{try{return globalThis.localStorage??null;}catch{return null;}};
const TEXT_INPUTS=new Set(['text','search','email','password','number','tel','url']);
const typing=t=>!!t&&(t.isContentEditable||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.tagName==='INPUT'&&TEXT_INPUTS.has((t.type||'text').toLowerCase()));
const colourOf=id=>{let h=0;for(const c of String(id))h=(h*31+c.charCodeAt(0))>>>0;return NAME_COLOURS[h%NAME_COLOURS.length];};
const clock=()=>performance.now()/1000;

export class RoomChat {
 // say(text): sends a line (false: not now: too soon, or not let in yet). anchor(id, out): the world
 // point over that pilot's car (or himself), or null where none shows. camera(): the scene's camera;
 // view(): the canvas. canSay(): this window may talk (let in). freeMouse(): lets the mouse go before
 // typing (Esc then only gives the line up). key(code): a key's name on screen. racing(): this window is
 // in a race (out of one, with nothing said yet, the window keeps out of the menus).
 constructor({say,anchor,camera,view,canSay=()=>true,freeMouse=()=>{},key=code=>code.slice(3),racing=()=>true}){
  Object.assign(this,{say,anchor,camera,view,canSay,freeMouse,key,racing});
  this.lines=[];this.balloons=new Map();this.unread=0;this.point=new THREE.Vector3();this.seen=new THREE.Vector3();
  let shown='1';try{shown=store()?.getItem(CHAT_STORE)??'1';}catch{}this.shown=shown!=='0';
  const root=this.root=document.createElement('section');root.id='mpChat';root.setAttribute('aria-label','Chat da sala');
  const add=(tag,className,parent=root)=>{const e=document.createElement(tag);if(className)e.className=className;parent.append(e);return e;};
  const head=add('div','mp-chat-head');
  this.toggleButton=add('button','mp-chat-toggle',head);this.toggleButton.type='button';this.toggleButton.onclick=()=>{this.toggle();this.toggleButton.blur();};
  this.writeButton=add('button','mp-chat-write',head);this.writeButton.type='button';this.writeButton.onclick=()=>this.write();
  this.list=add('ol','mp-chat-lines');this.list.setAttribute('aria-live','polite');
  const form=this.form=add('form','mp-chat-form');form.hidden=true;
  const input=this.input=add('input','',form);input.type='text';input.id='mpChatText';input.maxLength=CHAT_LENGTH;input.autocomplete='off';input.spellcheck=true;input.enterKeyHint='send';
  input.placeholder='Mensagem para a sala';input.setAttribute('aria-label','Mensagem para a sala');
  this.left=add('small','mp-chat-left',form);
  const send=add('button','',form);send.type='submit';send.textContent='Enviar';
  form.onsubmit=e=>{e.preventDefault();this.send();};
  // Typing drives nothing and opens no menu (main.js and the room read keys on the document); a key let
  // go still reaches them, so a pedal held when the line opened is let go there too.
  input.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();this.close();}});
  input.addEventListener('input',()=>{this.count();if(this.root.classList.contains('mp-chat-noted'))this.flash('');});
  this.layer=document.createElement('div');this.layer.id='mpBalloons';this.layer.setAttribute('aria-hidden','true');
  document.body.append(this.layer,root);
  addEventListener('keydown',e=>this.pressed(e),true);
  this.render();
 }
 get typing(){return !this.form.hidden;}
 pressed(e){
  if(e.code!=='KeyT'||e.ctrlKey||e.altKey||e.metaKey||e.repeat||e.target===this.input||typing(e.target)||document.querySelector('dialog[open]'))return;
  if(!e.shiftKey&&!this.canSay())return;
  e.preventDefault();e.stopPropagation();
  if(e.shiftKey)this.toggle();else this.write();
 }
 // The window open or closed (kept in this browser); a line being typed shows anyway.
 toggle(on=!this.shown){this.shown=on;if(on)this.unread=0;try{store()?.setItem(CHAT_STORE,on?'1':'0');}catch{}this.render();}
 write(){
  if(!this.canSay()){this.flash('Entre na sala para conversar.');return;}
  this.form.hidden=false;this.root.classList.add('mp-chat-typing');this.idle=false;this.root.classList.remove('mp-chat-idle');this.count();this.freeMouse();this.input.focus({preventScroll:true});this.render();
 }
 close(){this.form.hidden=true;this.input.value='';this.root.classList.remove('mp-chat-typing');this.input.blur();this.flash('');this.render();}
 send(){
  const text=chatText(this.input.value);if(!text){this.close();return;}
  if(chatLink(text)){this.flash('Links não são permitidos no chat. (Não era link? Ponha um espaço depois do ponto.)');return;}
  // (too soon after the last one: the line waits in the box)
  if(!this.say(text)){this.flash('Espere um pouquinho para mandar outra.');return;}
  this.close();
 }
 count(){const left=CHAT_LENGTH-this.input.value.length;this.left.textContent=String(left);this.left.classList.toggle('mp-chat-few',left<=10);}
 flash(text){this.root.dataset.note=text;this.root.classList.toggle('mp-chat-noted',!!text);}
 // A line from the room (or this window's own, mine): into the window, and a balloon over the car.
 heard({id,name,text,mine=false}){
  if(!text)return;
  this.lines.push({id,name,text,mine});if(this.lines.length>KEPT)this.lines.shift();
  if(!this.shown&&!mine)this.unread++;
  let b=this.balloons.get(id);
  if(!b){const el=document.createElement('div');el.className='mp-balloon';el.style.display='none';const who=document.createElement('b'),said=document.createElement('span');el.append(who,said);this.layer.append(el);b={el,who,said};this.balloons.set(id,b);}
  b.who.textContent=name;b.who.style.color=mine?'#6b8a00':'#2b5f86';b.said.textContent=text;b.until=clock()+Math.min(BALLOON_MAX,BALLOON+BALLOON_PER_CHAR*[...text].length);
  this.render();
 }
 render(){
  const lines=this.lines.slice(-SHOWN);
  this.list.replaceChildren(...lines.map(l=>{const li=document.createElement('li'),who=document.createElement('b'),said=document.createElement('span');who.textContent=l.name;who.style.color=l.mine?'#e2fb57':colourOf(l.id);said.textContent=l.text;li.append(who,said);return li;}));
  this.root.classList.toggle('mp-chat-closed',!this.shown);
  this.list.hidden=!this.shown&&!this.typing||!lines.length;
  const key=this.key('KeyT');
  this.toggleButton.textContent=this.shown?'CHAT':this.unread?`CHAT · ${this.unread} nova${this.unread>1?'s':''}`:'CHAT';
  this.toggleButton.setAttribute('aria-expanded',String(this.shown));this.toggleButton.title=`${this.shown?'Esconder':'Mostrar'} o chat (Shift+${key})`;
  this.writeButton.textContent=`Escrever · ${key}`;this.writeButton.title=`Escrever no chat (${key})`;
 }
 // Every frame: each balloon over its car, where the camera sees it; gone when its time is up.
 frame(){
  const idle=!this.racing()&&!this.lines.length&&!this.typing;if(idle!==this.idle){this.idle=idle;this.root.classList.toggle('mp-chat-idle',idle);}
  const now=clock(),camera=this.camera?.(),rect=this.view?.()?.getBoundingClientRect?.();
  for(const [id,b] of this.balloons){
   const left=b.until-now;if(left<=0){b.el.remove();this.balloons.delete(id);continue;}
   const p=camera&&rect?this.anchor(id,this.point):null;
   const d=p?camera.getWorldPosition(this.seen).distanceTo(p):Infinity;
   // (none over the car this camera sits in, nor behind it, nor far off)
   const s=p&&d>3&&d<FAR?this.seen.copy(p).project(camera):null;
   if(!s||s.z>1||Math.abs(s.x)>1.1||Math.abs(s.y)>1.1){b.el.style.display='none';continue;}
   const x=rect.left+(s.x+1)/2*rect.width,y=rect.top+(1-s.y)/2*rect.height,scale=Math.max(.65,Math.min(1,1.12-d/220));
   b.el.style.display='';b.el.style.opacity=String(Math.min(1,left/FADE)*(d>FAR*.7?Math.max(.3,(FAR-d)/(FAR*.3)):1));
   b.el.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%) scale(${scale.toFixed(3)})`;
  }
 }
 // For the checks (multiplayer.js info).
 info(){return {shown:this.shown,typing:this.typing,lines:this.lines.map(({name,text,mine})=>({name,text,mine})),balloons:[...this.balloons].map(([id,b])=>({id,text:b.said.textContent,visible:b.el.style.display!=='none'}))};}
}
