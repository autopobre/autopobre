// The recorded engine's settings, one set per car (Opala, Fusca), for the game (car-audio.js) and the sound bench
// (bancada-som.html, /dev/ only), where the pilots tune them by ear. Each setting carries its name and a plain
// explanation for the bench. The defaults are the sound the team approved; a player's own sets live in this
// browser (SOUND_KEY) and reach the game only when the bench's "Usar estes ajustes no jogo" is on.
export const SOUND_KEY='opala99-som-bancada';
export const CARS=Object.freeze(['opala','fusca']);
// Neutral (standing or revving free), first to fifth, reverse.
export const GEAR_KEYS=Object.freeze(['N','1','2','3','4','5','R']);
export const GEAR_NAMES=Object.freeze({N:'Ponto morto',1:'1ª marcha',2:'2ª marcha',3:'3ª marcha',4:'4ª marcha',5:'5ª marcha',R:'Ré'});

// [key, group, name, explanation, min, max, step, default, unit]
const S=(key,group,name,help,min,max,step,def,unit='')=>Object.freeze({key,group,name,help,min,max,step,def,unit});
export const GROUPS=Object.freeze([
 ['motor','Motor: volume e timbre','O jeito geral do ronco, em qualquer marcha.'],
 ['lenta','Marcha lenta','A gravação da lenta, que toca parado e em giro baixo.'],
 ['acelerando','Pé embaixo (acelerando)','Como o motor responde quando você pisa.'],
 ['pefora','Pé fora (freio-motor)','O motor desacelerando, com o acelerador solto.'],
 ['trocas','Arrancada, trocas e corte de giro','O que acontece entre as marchas e no fim do giro.'],
 ['estouros','Estouros do escapamento','Os pipocos ao tirar o pé em giro alto.'],
 ['pneus','Pneus','Pneu cantando na curva e arrastando nas derrapadas e freadas; raspando na chuva.'],
 ['cabine','Dentro do carro','Como o motor soa na câmera interna.'],
 ['rivais','Adversários','Os motores dos dois carros mais perto de você.'],
].map(([id,name,help])=>Object.freeze({id,name,help})));
export const SETTINGS=Object.freeze([
 S('engine','motor','Volume do motor','O volume de tudo o que sai do motor: aceleração, lenta e pé fora. Não mexe nos pneus, nos estouros nem na música.',0,2,.05,.8),
 S('pitch','motor','Tom geral','Afina o motor inteiro: acima de 1 fica mais agudo, abaixo mais grave, sem mudar o giro do jogo. Mais grave parece motor maior e mais pesado; mais agudo, menor e mais nervoso.',.5,1.8,.01,1),
 S('bass','motor','Graves','Reforça (positivo) ou tira (negativo) o ronco grave, abaixo de uns 180 Hz: o "peso" do motor. Em alto-falante de celular quase não aparece; em fone e caixa de som aparece bem.',-15,15,.5,0,'dB'),
 S('presence','motor','Médios (presença)','Realça ou suaviza a faixa do meio, perto de 1.400 Hz, onde mora o "rasgado" do escapamento. Mais presença deixa o motor mais na cara; menos, mais macio.',-15,15,.5,0,'dB'),
 S('highs','motor','Agudos (corte)','Acima desta frequência o som do motor é cortado. Baixo deixa o motor abafado, como de longe ou com o escapamento fechado; alto deixa tudo aberto. Com o pé embaixo o corte abre um pouco mais.',500,18000,100,9000,'Hz'),
 S('drive','motor','Aspereza (saturação)','Satura o som como um alto-falante no limite, acrescentando rasgado e "sujeira". Em 0 o motor sai como foi gravado.',0,1,.01,0),
 S('idleLoop','lenta','Volume da lenta','O volume da gravação de marcha lenta (um Opala 1978 e um Fusca 1977 de verdade) em relação ao resto do motor.',0,3,.05,1),
 S('idlePitch','lenta','Tom da lenta','Acelera ou desacelera a gravação da lenta: acima de 1, lenta mais alta e nervosa; abaixo, mais baixa e "mole".',.6,1.6,.01,1),
 S('loopSpan','lenta','Até onde vai a lenta','Até que giro a gravação da lenta continua tocando antes de dar lugar aos sons de aceleração, em vezes o giro de lenta (950 rpm): 1,5 = até uns 1.400 rpm.',1.05,3,.05,1.5,'×'),
 S('idle','lenta','Volume em giro baixo','Quanto o motor fica mais baixo em giro baixo do que em giro alto. Perto de 1 o volume quase não muda com o giro; perto de 0, o giro baixo fica bem baixinho.',.05,1,.01,.35),
 S('onFrom','acelerando','Trechos de aceleração a partir de','Os trechos gravados de aceleração abaixo deste giro ficam de fora; abaixo dele, o trecho mais baixo que sobrou toca mais devagar. Serve para pular trechos de gravação que soam mal (0 = usar todos).',0,6500,100,5500,'rpm'),
 S('gasRise','acelerando','Tempo para o pé entrar','Quanto tempo o som leva do pé fora para o pé embaixo quando você pisa. Zero é na hora; valores maiores suavizam a pisada.',0,1,.01,.15,'s'),
 S('revRise','acelerando','Rapidez do giro ao subir','O mais rápido que o giro do som pode subir (fora da arrancada em 1ª). Um motor tem inércia: valores menores deixam o giro mais "pesado" e lento para encher.',1000,40000,500,9000,'rpm/s'),
 S('lift','pefora','Volume com o pé fora','O volume do motor com o acelerador solto, em relação ao pé embaixo: o som do freio-motor e das desacelerações.',.05,1.5,.01,.45),
 S('offFrom','pefora','Trechos de pé fora a partir de','Como o de pé embaixo, para os trechos gravados de desaceleração: abaixo deste giro ficam de fora (0 = usar todos).',0,6000,100,0,'rpm'),
 S('gasFall','pefora','Tempo para o pé sair','Quanto tempo o som leva do pé embaixo para o pé fora quando você solta o acelerador.',0,1,.01,.05,'s'),
 S('revFall','pefora','Rapidez do giro ao cair','O mais rápido que o giro do som pode cair, nas trocas de marcha e ao soltar o pé.',2000,60000,500,18000,'rpm/s'),
 S('freeFall','pefora','Giro solto: rapidez ao cair','Em ponto morto, com a embreagem pisada ou preso na largada, só o volante do motor segura o giro: depois de uma acelerada ele cai devagar ("VRUMMMM"), mais rápido no giro alto e mais suave perto da lenta. Valores menores deixam a sobra do ronco mais longa.',500,20000,100,4000,'rpm/s'),
 S('freeGasFall','pefora','Giro solto: tempo para o pé sair','Como o "Tempo para o pé sair", mas com o motor solto: quanto o ronco de pé embaixo demora para dar lugar ao de pé fora depois da acelerada.',0,1.5,.01,.35,'s'),
 S('launch','trocas','Arrancada: rapidez do salto','Na 1ª marcha, com que rapidez o som sai da lenta para o começo do som da 1ª (ajustado em Marcha por marcha).',1000,60000,500,15000,'rpm/s'),
 S('shiftCut','trocas','Tranco da troca','Durante quanto tempo, a cada troca de marcha, o motor perde a força e soa como pé fora (a embreagem sendo pisada).',0,.6,.01,.14,'s'),
 S('shiftDip','trocas','Volume durante a troca','O volume do motor enquanto a troca acontece (1 = sem queda).',0,1.2,.01,.8),
 S('shiftClack','trocas','Clack do câmbio','O volume do ruído mecânico de cada troca de marcha (0 = sem ruído).',0,1.5,.01,.32),
 S('limiterRpm','trocas','Corte de giro em','O giro a partir do qual, com o pé embaixo, a ignição corta e o motor "bate no corte".',5000,7400,20,6940,'rpm'),
 S('limiterRate','trocas','Batidas do corte por segundo','Quantas vezes por segundo o motor corta e volta quando está no corte de giro.',2,30,1,12),
 S('limiterDrop','trocas','Queda do giro no corte','Quanto o giro do som cai em cada batida do corte.',0,800,10,140,'rpm'),
 S('pops','estouros','Volume dos estouros','O volume dos estouros do escapamento.',0,3,.05,1),
 S('popChance','estouros','Chance ao tirar o pé','A chance de estourar quando você tira o pé de uma vez em giro alto (1 = toda vez, 0 = nunca).',0,1,.05,.75),
 S('popsMinRpm','estouros','Estoura a partir de','O giro mínimo para o escapamento estourar ao tirar o pé.',2000,7000,100,4300,'rpm'),
 S('popsMax','estouros','Máximo de estouros seguidos','Quantos estouros podem sair de uma vez, em giro bem alto (em giro médio, a metade).',1,10,1,4),
 S('downshiftPops','estouros','Chance na redução','A chance de estourar ao reduzir uma marcha sem acelerar, em giro alto.',0,1,.05,.45),
 S('sing','pneus','Pneu cantando: volume','O volume do pneu cantando no limite da curva.',0,2,.05,.55),
 S('singFrom','pneus','Começa a cantar com','Quanto da aderência lateral o carro precisa usar na curva para o pneu começar a cantar. Menor = canta mais cedo.',.5,.99,.01,.82,'da aderência'),
 S('screech','pneus','Pneu arrastando: volume','O volume do pneu arrastando nas derrapadas, travadas de roda e patinadas.',0,2,.05,.6),
 S('scrub','pneus','Pneu raspando na chuva: volume','Na pista molhada o pneu não canta nem arrasta: só raspa quando o carro escorrega. Este é o volume dessa raspada.',0,2,.05,1),
 S('tyrePitch','pneus','Tom dos pneus','Afina os pneus: acima de 1 mais agudo (chiado fino), abaixo mais grave.',.5,1.8,.01,1),
 S('tyresInside','pneus','Pneus dentro do carro','O volume dos pneus na câmera interna, em relação à de fora.',0,1.5,.05,.75),
 S('cabinHighs','cabine','Abafamento dentro do carro','O corte de agudos do motor ouvido de dentro. Menor = mais abafado pela lataria.',500,12000,100,2200,'Hz'),
 S('cabinVolume','cabine','Volume do motor dentro do carro','O volume do motor na câmera interna, em relação à de fora.',0,2,.05,1),
 S('rivalVolume','rivais','Volume dos adversários','O volume dos motores dos dois adversários mais perto.',0,2,.05,.75),
 S('rivalReach','rivais','Até que distância se ouve','A partir de que distância os adversários deixam de ser ouvidos.',30,400,10,140,'m'),
]);
// Gear by gear: what each one changes, over the settings above.
export const GEAR_SETTINGS=Object.freeze([
 ['Volume','Volume','O volume do motor nesta marcha (1 = normal).',0,2.5,.05,1,''],
 ['Pitch','Tom','Afina o motor só nesta marcha: acima de 1 mais agudo, abaixo mais grave.',.6,1.6,.01,1,''],
 ['Bass','Graves','Graves a mais (ou a menos) só nesta marcha, somados aos graves gerais.',-15,15,.5,0,'dB'],
 ['Highs','Agudos','Multiplica o corte de agudos nesta marcha: abaixo de 1 mais abafado, acima mais aberto.',.2,2,.05,1,'×'],
 ['From','Começo do som','Acelerando, em que ponto da barra de giro o som desta marcha começa; dali ele sobe até a troca. 0 = o som segue o giro de verdade. Na 1ª vem em 50% porque o começo da 1ª soava mal.',0,.95,.01,0,'da barra'],
].map(([part,name,help,min,max,step,def,unit])=>Object.freeze({part,name,help,min,max,step,def,unit})));
export const gearKey=(gear,part)=>`m${gear}${part}`;
// The gear-by-gear settings that apply: "Começo do som" is for first to fifth only.
export const gearSettings=gear=>GEAR_SETTINGS.filter(s=>s.part!=='From'||/^[1-5]$/.test(gear));

// Every setting of a car at its default, flat (gear settings as m<gear><part>).
export function soundDefaults(){
 const values=Object.fromEntries(SETTINGS.map(s=>[s.key,s.def]));
 for(const gear of GEAR_KEYS)for(const s of gearSettings(gear))values[gearKey(gear,s.part)]=s.def;
 values[gearKey('1','From')]=.5;
 return values;
}
// Each setting's range (for clamping imported and saved values).
const RANGES=(()=>{const r=Object.fromEntries(SETTINGS.map(s=>[s.key,[s.min,s.max]]));for(const gear of GEAR_KEYS)for(const s of gearSettings(gear))r[gearKey(gear,s.part)]=[s.min,s.max];return r;})();
// Known keys only, numbers only, within range.
export function cleanValues(values){
 const out={};
 for(const [key,value] of Object.entries(values??{})){const range=RANGES[key],n=Number(value);if(range&&Number.isFinite(n))out[key]=Math.min(range[1],Math.max(range[0],n));}
 return out;
}
// A car's settings that differ from the defaults (what is saved, copied and shared).
export function changedValues(values){const d=soundDefaults();return Object.fromEntries(Object.entries(cleanValues(values)).filter(([k,v])=>Math.abs(v-d[k])>1e-9));}

// This browser's sets: {useInGame, opala:{all settings}, fusca:{all settings}}.
export function readSoundSettings(storage=globalThis.localStorage){
 let saved=null;try{saved=JSON.parse(storage?.getItem(SOUND_KEY)??'null');}catch{}
 return {useInGame:saved?.useInGame===true,...Object.fromEntries(CARS.map(car=>[car,{...soundDefaults(),...cleanValues(saved?.[car])}]))};
}
export function writeSoundSettings(state,storage=globalThis.localStorage){
 try{storage?.setItem(SOUND_KEY,JSON.stringify({versao:1,useInGame:!!state.useInGame,...Object.fromEntries(CARS.map(car=>[car,changedValues(state[car])]))}));}catch{}
}
// The text a pilot copies and another pastes: only what differs from the defaults.
export function exportSoundSettings(state){
 return JSON.stringify({som:'auto-pobre-racing',versao:1,...Object.fromEntries(CARS.map(car=>[car,changedValues(state[car])]))});
}
// A pasted text back into sets ({opala, fusca} over the defaults); null when it is not one.
export function importSoundSettings(text){
 let data=null;try{data=JSON.parse(text);}catch{return null;}
 if(!data||typeof data!=='object'||!CARS.some(car=>data[car]&&typeof data[car]==='object'))return null;
 return Object.fromEntries(CARS.map(car=>[car,{...soundDefaults(),...cleanValues(data[car])}]));
}
