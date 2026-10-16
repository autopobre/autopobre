// Saves from the game's old address. Until October 2026 the game lived at
// www.inteligenciamilgrau.com.br/autopobre/, and a browser keeps each site's saves apart. The old
// address now holds a redirect page that loads this module from autopobre.com.br, packs that
// browser's game keys into the link (#migrar=…, the part of a link never sent to a server) and
// opens migrar.html here, which stores them before going on to the page the player asked for.
// The old page imports moveToNewAddress by name: keep that export and the link format working.
export const NEW_ADDRESS='https://autopobre.com.br';
export const SAVE_PARAM='migrar',DESTINATION_PARAM='destino';
// ghost-lap.js GHOST_KEY: the bulkiest save, trimmed from the oldest lap until the link fits.
export const GHOST_KEY='autopobre-ghosts-v1';
// The multiplayer group key is a secret the player types again: it stays behind.
const LEFT_BEHIND=new Set(['autopobre-chave-grupo']);
// Browsers open far longer links; this keeps a wide margin under every one of them.
export const MAX_LINK=480000;
const MAX_VALUE=1000000,MAX_DATA=8000000,MAX_KEYS=64;
export const savedKey=key=>typeof key==='string'&&(/^(?:autopobre|opala99)-[a-z0-9-]{1,48}$/.test(key)||key==='bancada-som-carro')&&!LEFT_BEHIND.has(key);
function browserStorage(){try{return globalThis.localStorage;}catch{return null;}}
const toBase64url=bytes=>{let text='';for(let i=0;i<bytes.length;i+=0x8000)text+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const fromBase64url=text=>Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function through(bytes,stream,limit){
 const reader=new Blob([bytes]).stream().pipeThrough(stream).getReader(),parts=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();return null;}parts.push(value);}
 const out=new Uint8Array(size);let at=0;for(const part of parts){out.set(part,at);at+=part.length;}return out;
}
// '1.' is deflated, '0.' is plain JSON for a browser without CompressionStream.
async function encode(saves){
 const bytes=new TextEncoder().encode(JSON.stringify({v:1,saves}));
 if(typeof CompressionStream!=='function')return '0.'+toBase64url(bytes);
 return '1.'+toBase64url(await through(bytes,new CompressionStream('deflate-raw'),Infinity));
}
// The game keys of a storage, as link text; '' when there is nothing to bring or it cannot fit.
export async function packSaves(storage=browserStorage(),max=MAX_LINK){
 const saves={};
 try{for(let i=0;i<storage.length;i++){const key=storage.key(i),value=savedKey(key)?storage.getItem(key):null;if(typeof value==='string'&&value.length<=MAX_VALUE)saves[key]=value;}}catch{return '';}
 if(!Object.keys(saves).length)return '';
 let ghosts=[];try{ghosts=JSON.parse(saves[GHOST_KEY]??'[]');}catch{}if(!Array.isArray(ghosts))ghosts=[];
 // ghost-lap.js keeps the newest lap first, so the oldest leave first.
 for(;;){
  if(ghosts.length)saves[GHOST_KEY]=JSON.stringify(ghosts);else delete saves[GHOST_KEY];
  if(!Object.keys(saves).length)return '';
  const text=await encode(saves);
  if(text.length<=max)return text;
  if(!ghosts.length)return '';
  ghosts=ghosts.slice(0,-1);
 }
}
// Link text back to {key: value}; null for anything malformed, and only game keys survive.
export async function unpackSaves(text){
 try{
  const match=/^([01])\.([A-Za-z0-9_-]+)$/.exec(String(text??''));if(!match||match[2].length>MAX_LINK*2)return null;
  let bytes=fromBase64url(match[2]);
  if(match[1]==='1'){if(typeof DecompressionStream!=='function')return null;bytes=await through(bytes,new DecompressionStream('deflate-raw'),MAX_DATA);if(!bytes)return null;}
  else if(bytes.length>MAX_DATA)return null;
  const data=JSON.parse(new TextDecoder().decode(bytes)),saves=data?.saves;
  if(data?.v!==1||!saves||typeof saves!=='object'||Array.isArray(saves))return null;
  return Object.fromEntries(Object.entries(saves).filter(([key,value])=>savedKey(key)&&typeof value==='string'&&value.length<=MAX_VALUE).slice(0,MAX_KEYS));
 }catch{return null;}
}
// Where to go after the import: a path on this site only, never another one.
export function safeDestination(value,origin=NEW_ADDRESS){
 try{const text=String(value??'/');if(!text.startsWith('/')||text.startsWith('//')||text.includes('\\'))return '/';const url=new URL(text,origin);return url.origin===new URL(origin).origin?url.pathname+url.search:'/';}catch{return '/';}
}
// A key the player already has here wins: the old save only fills what is missing, so a link (the
// player's own, or one anyone crafts) never overwrites a race run on this address.
export async function importSaves(text,storage=browserStorage()){
 const saves=storage&&await unpackSaves(text),brought=[],kept=[];
 if(!saves)return {ok:false,brought,kept};
 for(const [key,value] of Object.entries(saves)){try{if(storage.getItem(key)!==null){kept.push(key);continue;}storage.setItem(key,value);brought.push(key);}catch{}}
 return {ok:true,brought,kept};
}
// migrar.html: the saves, the destination and the link's other parts (#desafio=NOME and the like).
export function readMigrationLink(hash){
 const params=new URLSearchParams(String(hash??'').replace(/^#/,''));
 const saves=params.get(SAVE_PARAM)??'',destination=safeDestination(params.get(DESTINATION_PARAM));
 params.delete(SAVE_PARAM);params.delete(DESTINATION_PARAM);
 const rest=params.toString();
 return {saves,destination,rest};
}
// The old address's redirect page: the same path here (/autopobre/dev/ becomes /dev/), with the
// saves when this browser has any. Without them, or when packing fails, it goes straight there.
export async function moveToNewAddress(base='/autopobre',place=globalThis.location,storage=browserStorage()){
 const path=(place.pathname.startsWith(base)?place.pathname.slice(base.length):place.pathname)||'/';
 const destination=safeDestination((path.startsWith('/')?path:'/'+path)+place.search);
 let saves='';try{saves=await packSaves(storage);}catch{}
 if(!saves){place.replace(NEW_ADDRESS+destination+place.hash);return 'direct';}
 const params=new URLSearchParams(String(place.hash??'').replace(/^#/,''));
 params.delete(SAVE_PARAM);params.delete(DESTINATION_PARAM);
 params.set(DESTINATION_PARAM,destination);params.set(SAVE_PARAM,saves);
 place.replace(NEW_ADDRESS+'/migrar.html#'+params.toString());return 'saves';
}
