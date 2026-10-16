import {GRAPHICS_LEVELS,GRAPHICS_LEVEL_NAMES,GRAPHICS_OPTIONS,GRAPHICS_GROUPS,autoLevel,autoReason,resolveGraphics,setGraphicsValue,chooseGraphicsLevel} from './graphics-settings.js';
// The settings' Gráficos tab: the four levels (and Automático) as cards, then every setting by hand,
// grouped. Built from graphics-settings.js into the #settings-graphics panel of index.html; each
// change goes to onChange(graphics) and comes back through show().
// Which machine each level is for, then what it shows. Automático's says what it picked here and why (autoReason).
const LEVEL_TEXT={
 auto:'Escolhe pelo aparelho',
 baixo:'PC simples ou notebook com vídeo integrado. Imagem leve, sem sombras, carros e cenário simplificados.',
 medio:'Celular ou PC intermediário. Sombras leves e visual de cinema leve.',
 alto:'PC com placa de vídeo. Cinema completo, reflexos ao vivo, pista detalhada e capim com vento.',
 ultra:'Placa de vídeo forte. Tudo no máximo: sombras, reflexos, água realista e vegetação densa.'
};
// Settings that only work with another one: [setting, it needs, the reason shown].
const NEEDS=[['ao',v=>v.post==='full','Só no visual de cinema Completo.'],['lens',v=>v.post==='full','Só no visual de cinema Completo.'],['motionBlur',v=>v.post!=='off','Desligado no visual Simples.'],['targetFps',v=>v.dynamicResolution,'Ligue a resolução dinâmica para usar esta meta.']];
const element=(tag,props={},...children)=>{const e=Object.assign(document.createElement(tag),props);e.append(...children);return e;};
export class GraphicsPanel {
 constructor({root,touch=false,device=null,graphics,onChange,onApply=()=>{},screen=()=>({width:innerWidth,height:innerHeight,ratio:devicePixelRatio||1})}){
  this.root=root;this.touch=touch;this.device=device;this.onChange=onChange;this.screen=screen;this.graphics=graphics;
  this.levels=root.querySelector('#graphicsLevels');this.summary=root.querySelector('#graphicsSummary');this.restore=root.querySelector('#graphicsRestore');
  this.cards=new Map();this.selects=new Map();
  for(const level of ['auto',...GRAPHICS_LEVELS]){
   // Four bars: how heavy the level is (Automático lights those of the level it stands for).
   const bars=element('span',{className:'graphics-bars',ariaHidden:'true'});for(let i=0;i<4;i++)bars.append(element('i',{className:i<=GRAPHICS_LEVELS.indexOf(level)?'on':''}));
   const card=element('button',{type:'button',className:'graphics-level',id:`gfxLevel-${level}`},element('b',{},GRAPHICS_LEVEL_NAMES[level]),bars,element('small',{},level==='auto'?this.autoText():LEVEL_TEXT[level]));
   card.dataset.level=level;card.setAttribute('role','radio');card.onclick=()=>this.change(chooseGraphicsLevel(level));
   this.cards.set(level,card);this.levels.append(card);
  }
  // Arrow keys move between the level cards, as in a radio group.
  this.levels.onkeydown=e=>{const list=[...this.cards.values()],i=list.indexOf(document.activeElement),step={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[e.key];if(i<0||!step)return;e.preventDefault();const next=list[(i+step+list.length)%list.length];next.focus();next.click();};
  const controls=root.querySelector('#graphicsControls');
  for(const [group,title] of GRAPHICS_GROUPS){
   const set=element('fieldset',{className:'graphics-group'},element('legend',{},title));
   for(const [key,option] of Object.entries(GRAPHICS_OPTIONS)){
    if(option.group!==group)continue;
    const select=element('select',{id:`gfx-${key}`});select.dataset.setting=key;
    select.onchange=()=>{const value=this.optionValue(key,select.value);if(value!==undefined)this.change(setGraphicsValue(this.graphics,key,value,{touch:this.touch,device:this.device,same:(a,b,k)=>k==='resolution'?this.drawn(a)===this.drawn(b):a===b}));};
    const label=element('label',{className:'graphics-setting'},element('span',{},option.label,element('em',{className:'graphics-changed'},'ajustado')),select,element('small',{},option.hint));
    label.dataset.setting=key;this.selects.set(key,select);set.append(label);
   }
   controls.append(set);
  }
  this.restore.onclick=()=>this.change(chooseGraphicsLevel(this.graphics.level));
  // Cenário e vegetação is built with the track: picked mid-race it waits for the next start (pending()), and the button
  // starts the race again now when the pause menu offers that.
  this.pendingText=element('span');this.applyNow=element('button',{type:'button',id:'graphicsApplyScenery'},'Aplicar agora (recomeça a corrida)');
  this.applyNow.onclick=()=>onApply();
  this.pendingNote=element('p',{id:'graphicsPending',className:'graphics-pending',hidden:true},this.pendingText,this.applyNow);
  this.summary.closest('.graphics-status').after(this.pendingNote);
  this.show(graphics);
 }
 // "Escolhe pelo aparelho: Baixo neste computador · detectamos vídeo integrado."
 autoText(){return `${LEVEL_TEXT.auto}: ${GRAPHICS_LEVEL_NAMES[autoLevel(this.touch,this.device)]} neste ${this.touch?'celular':'computador'} · ${autoReason(this.touch,this.device)}.`;}
 // The pixel ratio this screen really draws at for a density setting (never above the screen's own).
 drawn(value){return Math.min(value,this.screen().ratio);}
 optionValue(key,text){return GRAPHICS_OPTIONS[key].choices.find(([v])=>String(v)===text)?.[0];}
 change(graphics){this.onChange(graphics);}
 // The densities this screen tells apart, each with the picture size it gives; the ones past the
 // screen's own pixels collapse into one "nativa" choice.
 resolutionChoices(){
  const {width,height}=this.screen(),seen=new Set(),list=[];
  for(const [value,label] of GRAPHICS_OPTIONS.resolution.choices){
   const ratio=this.drawn(value);if(seen.has(ratio))continue;seen.add(ratio);
   list.push([value,`${label} · ${Math.round(width*ratio)}×${Math.round(height*ratio)}${ratio===this.screen().ratio?' (nativa)':''}`]);
  }
  return list;
 }
 // The scenery the race's track was built with and the one now chosen, or null: {built, wanted, restart} (restart: the
 // race can start again now).
 pending(state){
  this.pendingNote.hidden=!state;if(!state)return;
  const name=v=>GRAPHICS_OPTIONS.scenery.choices.find(([c])=>c===v)?.[1]??v;
  this.pendingText.textContent=`Cenário e vegetação: esta pista foi montada no ${name(state.built)}. O ${name(state.wanted)} entra quando a corrida recomeçar; o resto do nível já está valendo.`;
  this.applyNow.hidden=!state.restart;
 }
 // While the new look's shaders compile (main.js precompileGraphics) the picture holds.
 busy(on){this.root.classList.toggle('graphics-busy',on);if(on)this.summary.textContent='Preparando o novo visual: a imagem volta em instantes.';else this.show(this.graphics);}
 show(graphics){
  this.graphics=graphics;const state=resolveGraphics(graphics,{touch:this.touch,device:this.device}),values=state.values;
  const autoSmall=this.cards.get('auto').querySelector('small'),autoText=this.autoText();if(autoSmall.textContent!==autoText)autoSmall.textContent=autoText;
  for(const [level,card] of this.cards){const on=level===graphics.level;card.setAttribute('aria-checked',String(on));card.tabIndex=on?0:-1;card.classList.toggle('implied',graphics.level==='auto'&&level===state.level);}
  for(const [i,bar] of [...this.cards.get('auto').querySelectorAll('.graphics-bars i')].entries())bar.classList.toggle('on',i<=GRAPHICS_LEVELS.indexOf(state.level));
  for(const [key,select] of this.selects){
   const choices=key==='resolution'?this.resolutionChoices():GRAPHICS_OPTIONS[key].choices,signature=choices.map(c=>c.join('=')).join('|');
   if(select.dataset.choices!==signature){select.replaceChildren(...choices.map(([v,label])=>new Option(label,String(v))));select.dataset.choices=signature;}
   const value=key==='resolution'?choices.find(([v])=>this.drawn(v)===this.drawn(values.resolution))?.[0]:values[key];select.value=String(value);
   const need=NEEDS.find(([k])=>k===key),blocked=need&&!need[1](values),label=select.closest('label');
   select.disabled=!!blocked;label.classList.toggle('blocked',!!blocked);label.title=blocked?need[2]:'';
   label.classList.toggle('changed',state.changed.includes(key));
  }
  const name=GRAPHICS_LEVEL_NAMES[state.level],changes=state.changed.map(key=>GRAPHICS_OPTIONS[key].label);
  if(!this.root.classList.contains('graphics-busy'))this.summary.textContent=`${graphics.level==='auto'?`Automático: nível ${name} neste ${this.touch?'celular':'computador'} (${autoReason(this.touch,this.device)})`:`Nível ${name}`}${changes.length?` · ${changes.length} ${changes.length>1?'ajustes':'ajuste'} à mão: ${changes.join(', ')}.`:', sem ajustes à mão.'}`;
  this.restore.hidden=!changes.length;
  return state;
 }
}
