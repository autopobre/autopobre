// The player's own look (user, 2026-10-20: "nova tela de criação de skin, em uma versão simplificada: a cor do macacão,
// se é homem ou mulher, as luvas, o cabelo e o capacete"; Modo História keeps Stevan's own). Picked on the Visual screen
// (look-select.js) and kept in this browser per pilot (the opening's name, pilot-profile.js), it dresses the driver at
// the wheel (driver.js look, driver-helmet.js look) and on foot (pit-crew.js people, free-walk.js pilotOutfit) in every
// mode but the story. No look saved: the pilot races as Stevan always did. Choices are kept by name (never colours), so
// a palette can change without breaking what was saved.
export const LOOK_KEY='autopobre-visual-v1';
// [id, colour, name] — the suit, the gloves and the helmet's two paints.
export const SUIT_COLORS=Object.freeze([
 ['vermelho',0xd82125,'Vermelho'],['laranja',0xec6a1c,'Laranja'],['amarelo',0xf2c418,'Amarelo'],['verde',0x1d8a4a,'Verde'],
 ['azul',0x1f4fae,'Azul'],['celeste',0x3fa3d8,'Azul-claro'],['roxo',0x6a3aa8,'Roxo'],['rosa',0xde4f8d,'Rosa'],
 ['vinho',0x7a1c2c,'Vinho'],['preto',0x1b1d20,'Preto'],['cinza',0x7a8087,'Cinza'],['branco',0xeceae4,'Branco']]);
export const GLOVE_COLORS=Object.freeze([
 ['preta',0x17191b,'Preta'],['branca',0xe9e7e0,'Branca'],['vermelha',0xc81d25,'Vermelha'],['azul',0x1f4fae,'Azul'],
 ['amarela',0xf0c21a,'Amarela'],['cinza',0x6b7076,'Cinza']]);
export const HELMET_COLORS=Object.freeze([
 ['preto',0x101218,'Preto'],['branco',0xeceae4,'Branco'],['vermelho',0xd41132,'Vermelho'],['laranja',0xec6a1c,'Laranja'],
 ['amarelo',0xf2c418,'Amarelo'],['verde',0x1d8a4a,'Verde'],['azul',0x1f4fae,'Azul'],['celeste',0x3fa3d8,'Azul-claro'],
 ['roxo',0x6a3aa8,'Roxo'],['rosa',0xde4f8d,'Rosa'],['prata',0x9aa1a8,'Prata'],['dourado',0xc49a3a,'Dourado']]);
export const HAIR_COLORS=Object.freeze([
 ['preto',0x16120f,'Preto'],['castanho_escuro',0x3b2a1a,'Castanho-escuro'],['castanho',0x6b4423,'Castanho'],
 ['ruivo',0xa4461f,'Ruivo'],['loiro',0xd2aa62,'Loiro'],['grisalho',0xb7b2aa,'Grisalho']]);
// [id, name, pit-crew.js hairStyle].
export const HAIR_STYLES=Object.freeze([
 ['curto','Curto','short'],['longo','Longo','long'],['rabo','Rabo de cavalo','ponytail'],['coque','Coque','bun'],
 ['cacheado','Cacheado','curly'],['careca','Careca','bald']]);
// Men only: a moustache, a short beard without it (user, 2026-10-20), or both (Stevan's; 'barba' kept for saves).
export const BEARDS=Object.freeze([['sem','Sem barba'],['bigode','Bigode'],['barba_so','Barba'],['barba','Barba e bigode']]);
export const GENDERS=Object.freeze([['homem','Homem'],['mulher','Mulher']]);
// The helmet's paint: the 99's three cheek strokes, the crown in the second colour, or a stripe over the top.
export const HELMET_DESIGNS=Object.freeze([['faixas','Faixas'],['topo','Topo'],['listra','Listra']]);
// The visor, shut over the eyes (Stevan's alone is up: his own photo shows behind it).
export const VISORS=Object.freeze([['fume',0x14171b,'Fumê'],['dourada',0xb9832b,'Dourada'],['azul',0x2d5ea4,'Azul'],['vermelha',0xb3262e,'Vermelha']]);
// What the screen starts from: Stevan's own colours, as a look of the player's.
export const LOOK_DEFAULT=Object.freeze({gender:'homem',suit:'vermelho',gloves:'preta',hair:'longo',hairColor:'castanho_escuro',beard:'barba',
 helmet:'faixas',helmetColor:'preto',helmetDetail:'vermelho',visor:'fume'});
const ids=list=>list.map(e=>e[0]);
const FIELDS={gender:GENDERS,suit:SUIT_COLORS,gloves:GLOVE_COLORS,hair:HAIR_STYLES,hairColor:HAIR_COLORS,beard:BEARDS,helmet:HELMET_DESIGNS,helmetColor:HELMET_COLORS,helmetDetail:HELMET_COLORS,visor:VISORS};
export const LOOK_FIELDS=Object.freeze(Object.keys(FIELDS));
// A look as saved (or typed in a check): each choice one of its list's, the default where it is not; null for none.
export function normalizeLook(value){
 if(!value||typeof value!=='object')return null;
 const look={};for(const [key,list] of Object.entries(FIELDS))look[key]=ids(list).includes(value[key])?value[key]:LOOK_DEFAULT[key];
 if(look.gender==='mulher')look.beard='sem';
 return Object.freeze(look);
}
export const lookKey=look=>look?LOOK_FIELDS.map(k=>look[k]).join('|'):'';
const pick=(list,id)=>(list.find(e=>e[0]===id)??list[0]);
export const colorOf=(list,id)=>pick(list,id)[1];
export const nameOf=(list,id)=>{const e=pick(list,id);return typeof e[1]==='string'?e[1]:e[2];};
// The colours a look comes to: the suit, gloves, hair, helmet paint and detail, visor; the hair's pit-crew.js style.
export function lookColors(look){
 return {suit:colorOf(SUIT_COLORS,look.suit),gloves:colorOf(GLOVE_COLORS,look.gloves),hair:colorOf(HAIR_COLORS,look.hairColor),hairStyle:pick(HAIR_STYLES,look.hair)[2],
  helmet:colorOf(HELMET_COLORS,look.helmetColor),detail:colorOf(HELMET_COLORS,look.helmetDetail),visor:colorOf(VISORS,look.visor)};
}
const luminance=hex=>.2126*((hex>>16&255)/255)+.7152*((hex>>8&255)/255)+.0722*((hex&255)/255);
// The band round the chest and the seams: white, dark on a pale suit.
export const suitTrim=suit=>luminance(suit)>.62?0x2b2f33:0xf4f1ea;
// The pilot on foot (pit-crew.js person): the suit with its band, the gloves, the hair out (no cap: the hair shows), and
// the 99 on the back when he races the team's Opala 99 (back).
export const PILOT_SKIN=0xc98f68;
export function lookOutfit(look,{back=true}={}){
 const c=lookColors(look),man=look.gender!=='mulher';
 return {top:c.suit,bottom:c.suit,trim:suitTrim(c.suit),hands:c.gloves,shoes:0x1b1d20,back,hat:null,skin:PILOT_SKIN,hair:c.hair,hairStyle:c.hairStyle,
  mustache:man&&['bigode','barba'].includes(look.beard),beard:man&&['barba','barba_so'].includes(look.beard),figure:man?'m':'f'};
}
const slot=name=>String(name??'').trim().toLocaleLowerCase('pt-BR');
function browserStorage(){try{return globalThis.localStorage;}catch{return null;}}
// The looks of this browser's pilots ({pilots: {name in lower case: look}}). get answers the same frozen object until the
// pilot's look changes, so callers can compare it by identity every frame.
export class LookStore {
 constructor(storage=browserStorage()){
  this.storage=storage;this.pilots={};this.error='';this.version=0;
  try{const saved=JSON.parse(storage?.getItem(LOOK_KEY)||'{}');for(const [name,look] of Object.entries(saved?.pilots??{})){const l=normalizeLook(look);if(l&&slot(name))this.pilots[slot(name)]=l;}}catch{}
 }
 get(pilot){return this.pilots[slot(pilot)]??null;}
 // look null: back to Stevan's own.
 set(pilot,look){
  const key=slot(pilot);if(!key)return null;const l=normalizeLook(look);
  if(lookKey(l)===lookKey(this.get(pilot)))return this.get(pilot);
  if(l)this.pilots[key]=l;else delete this.pilots[key];this.version++;
  try{this.storage?.setItem(LOOK_KEY,JSON.stringify({pilots:this.pilots}));this.error='';}catch{this.error='Não foi possível salvar o visual neste navegador.';}
  return l;
 }
 names(){return Object.keys(this.pilots);}
 has(pilot){return !!this.get(pilot);}
}
