import fs from 'node:fs';
import assert from 'node:assert/strict';
// Teclado do seu jeito (teste/key-bindings.js): the player's keys read as the original ones, a key taken from
// another command swaps, the keys menus and the browser need are refused, what is saved comes back (and bad saves
// don't), Restaurar empties it; keyboard events only (the controller's synthetic keys, text fields and Ctrl+…
// stay as they are); every key the game answers is in the list.
globalThis.KeyboardEvent=class{constructor(type,init={}){this.type=type;this._code=init.code;this.isTrusted=init.trusted??true;this.ctrlKey=!!init.ctrlKey;this.altKey=false;this.metaKey=false;this.target=init.target??null;}get code(){return this._code;}};
Object.defineProperty(KeyboardEvent.prototype,'code',{...Object.getOwnPropertyDescriptor(KeyboardEvent.prototype,'code'),configurable:true});
const {KeyBindings,KEY_ACTIONS,KEYS_STORAGE,normalizeKeys,keyAllowed,keyLabel,keyText,installKeyBindings,physicalCode}=await import('../teste/key-bindings.js');
const memory=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),map:m};};

// --- The list: one original key in one command only.
const originals=KEY_ACTIONS.flatMap(a=>a.codes);
assert.equal(new Set(originals).size,originals.length,'an original key in two commands');
assert.ok(originals.every(keyAllowed),'every original key can be picked again');

// --- Original keys: nothing reads as anything else.
const storage=memory(),keys=new KeyBindings(storage);
assert.equal(keys.reads.size,0);assert.equal(keys.read('KeyW'),'KeyW');assert.equal(keys.changed,false);
assert.equal(keys.name('KeyW'),'W');assert.equal(keys.name('Space'),'Espaço');assert.equal(keys.name('ArrowUp'),'↑');assert.equal(keys.name('ShiftLeft'),'Shift');
assert.equal(keys.name('Digit3'),'3');assert.equal(keys.name('Numpad3'),'Num 3');assert.equal(keys.name('Escape'),'Esc','a key outside the list is itself');

// --- A key another command had swaps with the old one.
let r=keys.set('acelerar',0,'KeyI','i');
assert.ok(r.ok);assert.deepEqual(r.moved,{id:'partida',slot:0,key:'KeyW'});
assert.equal(keys.read('KeyI'),'KeyW');assert.equal(keys.read('KeyW'),'KeyI');assert.equal(keys.read('ArrowUp'),'ArrowUp','the second key stays');
assert.equal(keys.name('KeyW'),'I');assert.equal(keys.name('KeyI'),'W');
assert.ok(!keys.isOriginal('acelerar')&&!keys.isOriginal('partida')&&keys.isOriginal('frear'));
// A free key: the old one reads as nothing.
r=keys.set('freioMao',0,'Period','.');assert.ok(r.ok);assert.equal(r.moved,null);
assert.equal(keys.read('Period'),'Space');assert.equal(keys.read('Space'),'Unidentified');assert.equal(keys.name('Space'),'.');
// The second key: empty, it reads as nothing, and the name falls back to the first.
keys.clear('acelerar',1);assert.equal(keys.read('ArrowUp'),'Unidentified');assert.equal(keys.name('ArrowUp'),'I');
// The same key again changes nothing; a second key for a one-key command reads as its key.
assert.ok(keys.set('acelerar',0,'KeyI').same);
r=keys.set('mudo',1,'KeyO','o');assert.ok(r.ok);assert.equal(keys.read('KeyO'),'KeyM');assert.equal(keys.read('KeyM'),'KeyM');
// A key from a command's second place swaps too (here Num 5 out of Câmera interna, which gets ↑... none: the place was empty).
r=keys.set('acelerar',1,'Numpad5');assert.deepEqual(r.moved,{id:'cam5',slot:1,key:null});assert.equal(keys.read('Numpad5'),'ArrowUp');
// Keys of the menus and the browser are refused, and change nothing.
for(const code of ['Escape','Tab','Enter','NumpadEnter','Backspace','Delete','F3','F5','F11','ControlLeft','AltRight','MetaLeft','CapsLock','',undefined,'Key W'])
 assert.equal(keys.set('frear',0,code).ok,false,String(code));
assert.equal(keys.read('KeyS'),'KeyS');

// --- Saved at every change, back on the next visit; the name of a key from what it printed.
keys.set('direita',0,'Semicolon','ç');assert.equal(keys.name('KeyD'),'Ç');
const saved=JSON.parse(storage.getItem(KEYS_STORAGE));
assert.deepEqual(saved.keys.acelerar,['KeyI','Numpad5']);assert.equal(saved.keys.frear,undefined,'only what changed is saved');assert.equal(saved.printed.Semicolon,'ç');
const again=new KeyBindings(storage);
for(const code of ['KeyI','KeyW','Period','Space','ArrowUp','Numpad5','KeyO','Semicolon','KeyD'])assert.equal(again.read(code),keys.read(code),code);
assert.equal(again.name('KeyD'),'Ç');assert.equal(again.changed,true);
// Restaurar: the original keys, nothing saved.
again.reset();assert.equal(again.changed,false);assert.equal(storage.getItem(KEYS_STORAGE),null);assert.equal(again.read('KeyI'),'KeyI');assert.equal(new KeyBindings(storage).changed,false);
// Changes are told (the screen's names, main.js lets go of held keys).
let told=0;again.onChange(()=>told++);again.set('re',0,'Period');again.clear('re',0);again.reset();assert.equal(told,3);

// --- Bad saves: broken JSON, unknown commands and keys, a key in two places (a saved command wins over the originals).
const bad=memory();bad.setItem(KEYS_STORAGE,'{oops');assert.equal(new KeyBindings(bad).changed,false);
bad.setItem(KEYS_STORAGE,JSON.stringify({keys:{voar:['KeyK',null],frear:['F5','<b>'],acelerar:'KeyW'},printed:{KeyK:'<img>'}}));
const b=new KeyBindings(bad);assert.deepEqual(b.keys.frear,[null,null]);assert.deepEqual(b.keys.acelerar,['KeyW','ArrowUp']);assert.equal(b.label('KeyK'),'K');
let n=normalizeKeys({acelerar:['KeyI',null]});assert.deepEqual(n.acelerar,['KeyI',null]);assert.deepEqual(n.partida,[null,null],'the saved command keeps the key');
n=normalizeKeys({acelerar:['KeyK',null],frear:['KeyK','KeyL']});assert.deepEqual(n.frear,[null,'KeyL']);assert.deepEqual(n.ignicao,[null,null]);

// --- Names.
assert.equal(keyLabel('KeyQ'),'Q');assert.equal(keyLabel('KeyQ',{},new Map([['KeyQ','a']])),'A','the keyboard layout names it');assert.equal(keyLabel(null),'—');
assert.equal(keyLabel('Minus'),'−');assert.equal(keyLabel('BracketRight',{BracketRight:'['}),'[');
assert.equal(keyText('{KeyE}: conversar · {Space} pula · {foo} e {}'),'E: conversar · Espaço pula · {foo} e {}');
// Names never carry markup (the story panel puts them in its HTML) nor control characters, whatever was saved or the layout says.
for(const [printed,name] of [['<','‹'],['>','›'],['&','＆'],['"','＂'],["'",'’'],['`','ˋ'],['ç','Ç']])assert.equal(keyLabel('Backquote',{Backquote:printed}),name,printed);
for(const odd of ['\u0000','\n',' ','​','<b>','ab',7,null,{}])assert.equal(keyLabel('IntlRo',{IntlRo:odd}),'IntlRo',JSON.stringify(odd));
assert.equal(keyLabel('IntlRo',{},new Map([['IntlRo','<script>']])),'IntlRo');assert.equal(keyLabel('constructor'),'constructor');assert.equal(keyLabel('toString',{}),'toString');
assert.equal(keyLabel('Tab'),'Tab','a refused key is named in the refusal');assert.equal(keyLabel('<img src=x>'),'?');
const marked=memory();marked.setItem(KEYS_STORAGE,JSON.stringify({keys:{re:['Backquote',null],frear:['A'.repeat(40),null]},printed:{Backquote:'<',KeyQ:'<i>',__proto__:{x:1}}}));
const m=new KeyBindings(marked);assert.equal(m.name('KeyQ'),'‹');assert.deepEqual(m.keys.frear,[null,null],'an overlong code is no key');assert.deepEqual(Object.keys(m.printed),['Backquote']);
marked.setItem(KEYS_STORAGE,JSON.stringify({keys:[],printed:['x','y']}));assert.equal(new KeyBindings(marked).changed,false);
for(const code of ['BrowserBack','AudioVolumeUp','MediaPlayPause','Power','LaunchApp1'])assert.equal(keyAllowed(code),false,code);

// --- Keyboard events read through the player's keys; nothing else does.
const live=new KeyBindings(memory());live.set('acelerar',0,'KeyI');
assert.equal(installKeyBindings(live),true);assert.equal(installKeyBindings(live),false,'once');
const ev=init=>new KeyboardEvent('keydown',init);
assert.equal(ev({code:'KeyI'}).code,'KeyW');assert.equal(ev({code:'KeyW'}).code,'KeyI');assert.equal(ev({code:'KeyQ'}).code,'KeyQ');
assert.equal(ev({code:'KeyI',trusted:false}).code,'KeyI','the controller presses the original keys');
assert.equal(ev({code:'KeyI',ctrlKey:true}).code,'KeyI','Ctrl+… stays');
assert.equal(ev({code:'KeyI',target:{tagName:'INPUT',type:'text'}}).code,'KeyI','typing a name');
assert.equal(ev({code:'KeyI',target:{tagName:'TEXTAREA'}}).code,'KeyI');
assert.equal(ev({code:'KeyI',target:{tagName:'INPUT',type:'checkbox'}}).code,'KeyW');
assert.equal(physicalCode(ev({code:'KeyI'})),'KeyI');
live.reset();assert.equal(ev({code:'KeyI'}).code,'KeyI');

// --- Every key the game answers is a command in the list (or a key no command can take): a key left out could be
// given to a command and its own use lost.
const FIXED=new Set(['Escape','Enter','NumpadEnter','Tab','Backspace','Delete','F3','Home','End','PageUp','PageDown']);
const CODE=/^(Key[A-Z]|Digit\d|Numpad\w+|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Space|Minus|Equal|Escape|Enter|Tab|Backspace|Delete|F\d+|Home|End|PageUp|PageDown)$/;
const dir=new URL('../teste/',import.meta.url),skip=new Set(['bancada-som.js','key-bindings.js','keys-panel.js','arena-previa.js']);
const missing=new Set();
for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.js')&&!skip.has(f))){
 const text=fs.readFileSync(new URL(file,dir),'utf8');
 for(const [,code] of text.matchAll(/['"`]([A-Za-z0-9]+)['"`]/g))if(CODE.test(code)&&!originals.includes(code)&&!FIXED.has(code))missing.add(`${file}: ${code}`);
}
assert.deepEqual([...missing],[],'keys the game answers outside the list');
console.log(`teclas: ok (${KEY_ACTIONS.length} comandos)`);
