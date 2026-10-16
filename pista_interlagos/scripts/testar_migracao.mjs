import assert from 'node:assert/strict';
import {savedKey,packSaves,unpackSaves,importSaves,readMigrationLink,safeDestination,moveToNewAddress,GHOST_KEY,MAX_LINK} from '../migracao/save-migration.js';
import {GHOST_KEY as GAME_GHOST_KEY} from '../teste/ghost-lap.js';
import {PREFERENCES_KEY} from '../teste/player-preferences.js';
import {RECORD_VIEW_KEY} from '../teste/lap-records.js';
import {PILOTS_KEY} from '../teste/pilot-profile.js';
import {WHEEL_KEY} from '../teste/wheel-controls.js';
import {SOUND_KEY} from '../teste/sound-tuning.js';
import {STORY_PROFILE_KEY} from '../teste/story-career.js';
const fakeStorage=(entries={})=>{const data=new Map(Object.entries(entries));return {data,get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,String(value))};};
// Every save the game writes comes along; the group key and other sites' keys stay behind.
assert.equal(GHOST_KEY,GAME_GHOST_KEY,'save-migration.js trims the same key ghost-lap.js writes');
for(const key of [PREFERENCES_KEY,RECORD_VIEW_KEY,PILOTS_KEY,WHEEL_KEY,SOUND_KEY,STORY_PROFILE_KEY,GHOST_KEY,'autopobre-records-v1','autopobre-ai-records-v1','opala99-audio','opala99-graficos-auto-v1','opala99-championship-v1','opala99-arena-drift-v1','bancada-som-carro'])assert.ok(savedKey(key),key);
for(const key of ['autopobre-chave-grupo','outro-projeto-v1','autopobre-','autopobre-../x','Opala99-audio',null,7])assert.ok(!savedKey(key),String(key));
// Old address to new: the same keys and values arrive, nothing else.
const records=JSON.stringify({interlagos:{normal:{lap:96.4,race:301.2}}}),story=JSON.stringify({balance:1234.5,races:7});
const old=fakeStorage({'autopobre-records-v1':records,[STORY_PROFILE_KEY]:story,[PREFERENCES_KEY]:'{"camera":"cockpit"}','autopobre-chave-grupo':'segredo','outro-projeto-v1':'x'});
const packed=await packSaves(old);
assert.match(packed,/^1\.[A-Za-z0-9_-]+$/);
assert.deepEqual(await unpackSaves(packed),{'autopobre-records-v1':records,[STORY_PROFILE_KEY]:story,[PREFERENCES_KEY]:'{"camera":"cockpit"}'});
// The new address keeps what it already has and fills only what is missing.
const fresh=fakeStorage({[PREFERENCES_KEY]:'{"camera":"chase"}'});
assert.deepEqual(await importSaves(packed,fresh),{ok:true,brought:['autopobre-records-v1',STORY_PROFILE_KEY],kept:[PREFERENCES_KEY]});
assert.equal(fresh.getItem('autopobre-records-v1'),records);assert.equal(fresh.getItem(STORY_PROFILE_KEY),story);assert.equal(fresh.getItem(PREFERENCES_KEY),'{"camera":"chase"}');
assert.equal(fresh.getItem('autopobre-chave-grupo'),null);
// A browser with no game saves sends none.
assert.equal(await packSaves(fakeStorage({'outro-projeto-v1':'x'})),'');
// Ghost laps go from the oldest (the end of ghost-lap.js's list) until the link fits; records always come.
// Each lap's data differs, as real laps do, so compression cannot fold one onto another.
const noise=(n,seed=1)=>{let x=seed>>>0;return Array.from({length:n},()=>(x=(Math.imul(x,1664525)+1013904223)>>>0).toString(36)).join('');};
const ghosts=Array.from({length:6},(_,i)=>({circuit:'interlagos',date:`2026-10-0${9-i}`,data:noise(4000,i+7)}));
const heavy=fakeStorage({'autopobre-records-v1':records,[GHOST_KEY]:JSON.stringify(ghosts)});
const full=await packSaves(heavy),trimmed=await packSaves(heavy,Math.floor(full.length*0.6));
assert.ok(trimmed&&trimmed.length<full.length);
const trimmedSaves=await unpackSaves(trimmed),kept=JSON.parse(trimmedSaves[GHOST_KEY]);
assert.equal(trimmedSaves['autopobre-records-v1'],records);
assert.ok(kept.length>=1&&kept.length<ghosts.length);assert.deepEqual(kept,ghosts.slice(0,kept.length),'the newest laps stay');
const recordsOnly=await unpackSaves(await packSaves(heavy,200));
assert.deepEqual(recordsOnly,{'autopobre-records-v1':records},'with no room for ghosts, the records still come');
assert.equal(await packSaves(fakeStorage({'autopobre-records-v1':noise(20000)}),100),'','too big even without ghosts: nothing');
// Malformed or hostile links are ignored and the storage stays untouched.
const untouched=fakeStorage({[PREFERENCES_KEY]:'{}'});
for(const text of ['','2.abc','1.!!!','1.','0.'+Buffer.from('not json').toString('base64url'),'0.'+Buffer.from(JSON.stringify({v:2,saves:{}})).toString('base64url'),'0.'+Buffer.from(JSON.stringify({v:1,saves:['x']})).toString('base64url')]){
 assert.equal(await unpackSaves(text),null,text);assert.deepEqual(await importSaves(text,untouched),{ok:false,brought:[],kept:[]});
}
const foreign='0.'+Buffer.from(JSON.stringify({v:1,saves:{'outro-projeto-v1':'x','autopobre-chave-grupo':'y',[PREFERENCES_KEY]:5,'opala99-audio':'{"volume":0.5}'}})).toString('base64url');
assert.deepEqual(await unpackSaves(foreign),{'opala99-audio':'{"volume":0.5}'});
assert.deepEqual([...untouched.data.keys()],[PREFERENCES_KEY]);
// A deflated bomb (megabytes of zeros in a short link) is cut off, not unpacked.
const bomb=new Uint8Array(await new Response(new Blob([new Uint8Array(9e6)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
assert.equal(await unpackSaves('1.'+Buffer.from(bomb).toString('base64url')),null);
// Without CompressionStream the saves still travel, as plain JSON.
const {CompressionStream:saved}=globalThis;delete globalThis.CompressionStream;
try{const plain=await packSaves(old);assert.match(plain,/^0\./);assert.equal((await unpackSaves(plain))['autopobre-records-v1'],records);}finally{globalThis.CompressionStream=saved;}
// The destination is a path on this site only.
assert.equal(safeDestination('/dev/?pista=curvelo'),'/dev/?pista=curvelo');assert.equal(safeDestination('/apr_v1/'),'/apr_v1/');
for(const bad of ['//evil.example/x','https://evil.example/','/\\evil.example','dev/','javascript:alert(1)',null])assert.equal(safeDestination(bad),'/',String(bad));
// migrar.html reads the saves, the destination and keeps the rest of the link.
assert.deepEqual(readMigrationLink('#desafio=NOME&destino=%2Fdev%2F&migrar=1.abc'),{saves:'1.abc',destination:'/dev/',rest:'desafio=NOME'});
assert.deepEqual(readMigrationLink(''),{saves:'',destination:'/',rest:''});
// The old address's redirect: same path here, the saves when there are any, the room link kept.
const place=(pathname,search='',hash='')=>({pathname,search,hash,url:'',replace(url){this.url=url;}});
const moved=place('/autopobre/dev/','?pista=curvelo','#desafio=ABC');
assert.equal(await moveToNewAddress('/autopobre',moved,old),'saves');
assert.ok(moved.url.startsWith('https://autopobre.com.br/migrar.html#'),moved.url);
const link=readMigrationLink(new URL(moved.url).hash);
assert.equal(link.destination,'/dev/?pista=curvelo');assert.equal(link.rest,'desafio=ABC');
const arrived=fakeStorage();assert.equal((await importSaves(link.saves,arrived)).brought.length,3);
assert.ok(moved.url.length<MAX_LINK+200);
for(const [path,expected] of [['/autopobre/','https://autopobre.com.br/'],['/autopobre','https://autopobre.com.br/'],['/autopobre/apr_v1/','https://autopobre.com.br/apr_v1/']]){
 const direct=place(path,'','#desafio=XYZ');assert.equal(await moveToNewAddress('/autopobre',direct,fakeStorage()),'direct');assert.equal(direct.url,expected+'#desafio=XYZ');
}
console.log('testar_migracao: ok');
