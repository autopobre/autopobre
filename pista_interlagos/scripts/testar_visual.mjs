// Visual do piloto (teste/pilot-look.js, pedido da equipe em 2026-10-20): uma tela simples de skin com a cor do macacao,
// homem ou mulher, as luvas, o cabelo e o capacete; cada piloto guarda o seu neste navegador; fora do Modo Historia o
// piloto a pe e no carro usa esse visual, e a historia continua com o Stevan.
import assert from 'node:assert/strict';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
// The overalls' 99 is painted on a canvas: a do-nothing one here.
const ctx=new Proxy({},{get:(target,key)=>key.startsWith?.('create')?()=>({addColorStop(){}}):()=>({width:0})});
globalThis.document??={createElement:()=>({width:0,height:0,getContext:()=>ctx})};
const look=await import('../teste/pilot-look.js');
const {createPeople,dressPerson,OUTFITS,STEVAN_OUTFITS}=await import('../teste/pit-crew.js');
const {pilotOutfit}=await import('../teste/free-walk.js');
const {normalizeLook,LookStore,lookOutfit,lookColors,lookKey,LOOK_DEFAULT,LOOK_KEY,SUIT_COLORS,GLOVE_COLORS,HAIR_STYLES,HELMET_DESIGNS,VISORS}=look;
let passed=0;const ok=(name,fn)=>{fn();passed++;console.log('ok',name);};

ok('nothing saved is no look (Stevan races as always)',()=>{assert.equal(normalizeLook(null),null);assert.equal(normalizeLook('x'),null);});
ok('unknown picks fall back to the default, one by one',()=>{
 const l=normalizeLook({suit:'azul',gloves:'xadrez',hair:'moicano',visor:'azul'});
 assert.equal(l.suit,'azul');assert.equal(l.gloves,LOOK_DEFAULT.gloves);assert.equal(l.hair,LOOK_DEFAULT.hair);assert.equal(l.visor,'azul');assert.ok(Object.isFrozen(l));
});
ok('a woman has no beard',()=>{assert.equal(normalizeLook({gender:'mulher',beard:'barba'}).beard,'sem');assert.equal(normalizeLook({gender:'mulher',beard:'barba_so'}).beard,'sem');assert.equal(normalizeLook({gender:'homem',beard:'bigode'}).beard,'bigode');});
ok('the lists the screen offers',()=>{
 assert.equal(SUIT_COLORS.length,12);assert.equal(GLOVE_COLORS.length,6);assert.deepEqual(HELMET_DESIGNS.map(d=>d[0]),['faixas','topo','listra']);
 assert.deepEqual(VISORS.map(v=>v[0]),['fume','dourada','azul','vermelha']);assert.ok(HAIR_STYLES.some(h=>h[2]==='ponytail'));
 for(const list of [SUIT_COLORS,GLOVE_COLORS,VISORS])assert.equal(new Set(list.map(e=>e[0])).size,list.length);
});

// A storage that keeps what is written (and one that refuses).
const memory=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),map:m};};
ok('each pilot keeps a look, whatever the case of the name',()=>{
 const storage=memory(),store=new LookStore(storage);
 assert.equal(store.get('Ana'),null);
 const a=store.set('Ana',{gender:'mulher',suit:'rosa'});assert.equal(a.suit,'rosa');
 assert.equal(store.get('ANA'),a,'same object until it changes');assert.equal(store.get('  ana '),a);
 assert.equal(store.get('Bia'),null);
 store.set('Bia',{suit:'verde'});assert.equal(store.get('Ana').suit,'rosa');
 const again=new LookStore(storage);assert.equal(again.get('ana').suit,'rosa');assert.equal(again.get('bia').suit,'verde');
 assert.deepEqual(Object.keys(JSON.parse(storage.getItem(LOOK_KEY)).pilots).sort(),['ana','bia']);
 store.set('Ana',null);assert.equal(store.get('Ana'),null);assert.equal(new LookStore(storage).get('Ana'),null);
 assert.equal(store.set('',{suit:'azul'}),null,'no pilot, nothing kept');
 const same=store.get('Bia'),v=store.version;store.set('Bia',{...same});assert.equal(store.get('Bia'),same);assert.equal(store.version,v,'an unchanged pick writes nothing');
});
ok('a storage that refuses: the look stays for the session, with a message',()=>{
 const store=new LookStore({getItem:()=>null,setItem:()=>{throw new Error('cheio');}});
 store.set('Ana',{suit:'azul'});assert.equal(store.get('Ana').suit,'azul');assert.match(store.error,/Não foi possível/);
});
ok('broken saves are ignored',()=>{const s=memory();s.setItem(LOOK_KEY,'{oops');assert.equal(new LookStore(s).get('Ana'),null);s.setItem(LOOK_KEY,JSON.stringify({pilots:{ana:7}}));assert.equal(new LookStore(s).get('Ana'),null);});

ok('the clothes on foot: the suit, its band, the gloves, the hair out',()=>{
 const l=normalizeLook({gender:'mulher',suit:'branco',gloves:'azul',hair:'rabo',hairColor:'loiro'}),o=lookOutfit(l),c=lookColors(l);
 assert.equal(o.top,c.suit);assert.equal(o.bottom,c.suit);assert.equal(o.hands,c.gloves);assert.equal(o.hair,c.hair);assert.equal(o.hairStyle,'ponytail');
 assert.equal(o.figure,'f');assert.equal(o.hat,null);assert.equal(o.beard,false);assert.equal(o.mustache,false);
 assert.equal(o.trim,0x2b2f33,'a dark band on a white suit');assert.equal(lookOutfit(normalizeLook({suit:'azul'})).trim,0xf4f1ea);
 const man=lookOutfit(normalizeLook({beard:'bigode'}));assert.equal(man.figure,'m');assert.equal(man.mustache,true);assert.equal(man.beard,false);
 const beard=lookOutfit(normalizeLook({beard:'barba_so'}));assert.equal(beard.beard,true);assert.equal(beard.mustache,false,'a beard without the moustache');
 const both=lookOutfit(normalizeLook({beard:'barba'}));assert.equal(both.beard,true);assert.equal(both.mustache,true);
 const none=lookOutfit(normalizeLook({beard:'sem'}));assert.equal(none.beard,false);assert.equal(none.mustache,false);
 assert.deepEqual(look.BEARDS.map(b=>b[0]),['sem','bigode','barba_so','barba']);
});
ok('who gets out: the story keeps Stevan, the look elsewhere, the 99 on the back only in the 99',()=>{
 const l=normalizeLook({suit:'verde'}),career={intro:false,gear:[]};
 assert.equal(pilotOutfit({career,look:l}),STEVAN_OUTFITS.civil);
 assert.equal(pilotOutfit({look:l}).top,lookColors(l).suit);assert.equal(pilotOutfit({look:l}).back,true);
 assert.equal(pilotOutfit({look:l,entry:{color:0x123456}}).back,false);assert.equal(pilotOutfit({look:l,entry:{color:0x123456}}).top,lookColors(l).suit);
 assert.equal(pilotOutfit({}),OUTFITS.driver);assert.equal(pilotOutfit({entry:{color:0x123456}}).top,0x123456);
});
ok('lookKey: the same picks, the same key; none, empty',()=>{assert.equal(lookKey(null),'');assert.equal(lookKey(normalizeLook({})),lookKey(normalizeLook({...LOOK_DEFAULT})));assert.notEqual(lookKey(normalizeLook({suit:'azul'})),lookKey(normalizeLook({})));});

// The figure on foot (pit-crew.js): a woman's body, the ponytail; everyone else as before.
const people=createPeople(),box=root=>{root.updateMatrixWorld(true);return new THREE.Box3().setFromObject(root,true);};
const vertices=root=>root.children.find(c=>c.isSkinnedMesh).geometry.attributes.position.count+root.userData.head.geometry.attributes.position.count;
ok('the default figure is unchanged by the new options',()=>{
 const a=people.person({...OUTFITS.crew,back:false}),b=people.person({...OUTFITS.crew,back:false,figure:'m'});assert.equal(vertices(a),vertices(b));
});
ok('a woman: slimmer shoulders, a bust, wider hips; she dresses and undresses on the same bones',()=>{
 const base={...OUTFITS.crew,back:false,hairStyle:'short'},man=people.person(base),woman=people.person({...base,figure:'f'});
 assert.ok(vertices(woman)>vertices(man),'the bust adds to the body');
 const p=man.children.find(c=>c.isSkinnedMesh).geometry.attributes.position,q=woman.children.find(c=>c.isSkinnedMesh).geometry.attributes.position;
 // Widths at the shoulders and, inside the arms hanging at the sides, at the hips (the body's rest pose).
 const wide=(attr,y0,y1,inside=1)=>{let w=0;for(let i=0;i<attr.count;i++){const y=attr.getY(i),z=Math.abs(attr.getZ(i));if(y>y0&&y<y1&&z<inside)w=Math.max(w,z);}return w;};
 assert.ok(wide(q,1.42,1.5)<wide(p,1.42,1.5),'narrower at the shoulders');assert.ok(wide(q,.95,1.05,.2)>wide(p,.95,1.05,.2),'wider at the hips');
 const bones=man.children.find(c=>c.isSkinnedMesh).skeleton.bones.length;
 assert.ok(dressPerson(man,{...base,figure:'f',hairStyle:'ponytail'}));assert.equal(man.children.find(c=>c.isSkinnedMesh).skeleton.bones.length,bones);
 assert.equal(vertices(man),vertices(people.person({...base,figure:'f',hairStyle:'ponytail'})));
});
ok('the ponytail hangs down the back of the head',()=>{
 const base={...OUTFITS.crew,back:false},short=people.person({...base,hairStyle:'short'}),tail=people.person({...base,hairStyle:'ponytail'});
 const back=root=>{const a=root.userData.head.geometry.attributes.position;let x=0;for(let i=0;i<a.count;i++)x=Math.min(x,a.getX(i));return x;};
 const low=root=>{const a=root.userData.head.geometry.attributes.position;let y=1;for(let i=0;i<a.count;i++)if(a.getX(i)<-.12)y=Math.min(y,a.getY(i));return y;};
 assert.ok(back(tail)<back(short)-.02,'behind the head');assert.ok(low(tail)<0,'down to the nape');
});
ok('the 99 on the back stays on a slimmer back',()=>{
 const p=people.person({...OUTFITS.driver,hat:null}),decal=p.userData.rig.torso.getObjectByName('Macacao_costas_99'),x=decal.position.x;
 dressPerson(p,{...OUTFITS.driver,figure:'f'});assert.ok(decal.position.x>x,'closer to her back');dressPerson(p,OUTFITS.driver);assert.equal(decal.position.x,x);
 dressPerson(p,lookOutfit(normalizeLook({}),{back:false}));assert.equal(decal.visible,false);
});
console.log(`\n${passed} verificações do visual do piloto passaram.`);
