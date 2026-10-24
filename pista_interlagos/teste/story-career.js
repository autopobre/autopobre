// Modo História career: the wallet, three morale bars (wife, team, supporters), the equipment
// challenges with the wife's expenses, the Blazer out of the workshop, the challenges after it and the
// Opala 99 as the big dream (Central #16), from race to race of the Old Stock season. Pure rules, no DOM: ImmersiveState keeps the career in the story profile
// (opala99-immersive-v1, profile.career beside the wallet profile.fund) and ImmersiveMode shows
// its cards. 50% morale is the game as it was before the career.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const MORALE=Object.freeze(['esposa','equipe','torcida']);
export const MORALE_NAMES=Object.freeze({esposa:'Esposa',equipe:'Equipe',torcida:'Torcida'});
export const MORALE_LABELS=Object.freeze({esposa:'Moral com a esposa',equipe:'Moral com a equipe',torcida:'Moral com a torcida'});
export const MORALE_START=50;
export const STORY_PROFILE_KEY='opala99-immersive-v1';
// Prize money by finishing position; from the 11th back, nothing.
export const PRIZES=Object.freeze([800,600,500,400,300,200,100,100,100,100]);
export const prizeFor=position=>Number.isInteger(position)&&position>0?PRIZES[position-1]??0:0;
// The entry: Interlagos is home; elsewhere the pilots also pay the car carrier, the tickets and
// the team's hotel. More than R$ 150 and the first round (Brasília) could not be paid with jokes alone.
// With the Blazer's hitch and trailer (challenge 'carretinha') the Opala goes by road: away costs as home.
export const ENTRY=Object.freeze({home:100,away:150});
export const entryFor=(circuit,career=null)=>circuit==='interlagos'||career?.gear.includes('carretinha')?ENTRY.home:ENTRY.away;
// Each time the tow strap gets under a wheel, untangling it is paid from the wallet.
export const SNAG_COST=25;
// The team's repair bill after a race (Central #14): R$ 10 for each point the CARRO bar lost, as the
// HUD shows it; the windscreen is not on it, nor what the Box 99 fixed (and charged) during the race.
// A wallet short of it pays what it has: the team lets the rest go (charged, below bill). With the Box 99's new tools
// (challenge 'ferramentas', Stevan's call in #16.2) a point costs half.
export const REPAIR_PER_POINT=10,REPAIR_WITH_TOOLS=5;
export const repairPerPoint=career=>career?.gear.includes('ferramentas')?REPAIR_WITH_TOOLS:REPAIR_PER_POINT;
// The engine with new parts (challenge 'motor'): just a little stronger (car.engineScale, physics.js), in the story only.
export const ENGINE_PARTS=1.03;
export const enginePower=career=>career?.gear.includes('motor')?ENGINE_PARTS:1;
export function repairBill(health,fund,perPoint=REPAIR_PER_POINT){
 const damage=100-Math.ceil(clamp(Number.isFinite(health)?health:1,0,1)*100),bill=damage*perPoint;
 return {damage,bill,charged:Math.min(bill,Math.max(0,fund))};
}
// The wife's expenses cost 1.5x the standard at 0% and 0.5x at 100%; a knock damages the car on
// the same scale with the team; the supporters' gifts go the other way round.
export const expenseScale=morale=>1.5-clamp(morale,0,100)/100;
export const giftScale=morale=>.5+clamp(morale,0,100)/100;
// The supporters' morale also fills the paddock and the stands (user, 10-24): the paddock's six supporters at 50% (as
// before), down to two at 0% and up to ten at 100%; the stands 15% full at 50% (where a career starts), all at 100% and
// a handful (2%) at 0%, growing faster as the morale climbs.
export const PADDOCK_FANS=Object.freeze({least:2,most:10});
export const fanCount=morale=>Math.round(PADDOCK_FANS.least+(PADDOCK_FANS.most-PADDOCK_FANS.least)*clamp(morale,0,100)/100);
export const standsFill=morale=>{const m=clamp(morale,0,100);return m>=100?1:.15*Math.pow(1/.15,(m-50)/50);};
// The morale cards after a race, by outcome (outcomeOf), in the first five races and from the
// sixth on: [wife, team, supporters], each a text and a change in points of morale.
export const EARLY_RACES=5;
export const MORALE_CARDS=Object.freeze({
 early:{
  guincho:[['Sua esposa ficou muito zangada com o fato de você gastar dinheiro pra correr e não conseguir sequer completar a prova.',-10],['Sua equipe entende que erros são normais no começo e acredita que você tem potencial.',2],['Os torcedores relevaram o erro devido à sua inexperiência, mas também não ficaram felizes.',0]],
  fundo:[['Sua esposa acha que você devia parar de gastar dinheiro com algo em que você não é bom.',-5],['Sua equipe está feliz de você ter concluído a prova e entende que a evolução é gradual.',5],['Os torcedores ficaram felizes de você ter concluído a prova, mas esperavam um resultado um pouco melhor.',2]],
  pontos:[['Sua esposa acha que você devia parar de gastar dinheiro com algo em que você não é bom.',-5],['Sua equipe está muito feliz por você ter um desempenho melhor que o de pilotos mais experientes.',10],['Os torcedores gostaram do seu desempenho e estão empolgados para as corridas seguintes.',5]],
  podio:[['Sua esposa está admirada por você levar um troféu para casa. Ela imaginava que você fosse bem pior.',5],['Sua equipe está em festa por você ter levado o carro ao pódio!',15],['Os torcedores estão se sentindo representados por ter um pobre no pódio!',10]],
  vitoria:[['Sua esposa está surpresa com a vitória e animada com a possibilidade de você ganhar muito dinheiro nas pistas.',10],['Sua equipe está impressionada com seu desempenho e quer ter você no time pra sempre.',20],['A torcida está em festa pela vitória de um piloto pobre!',20]]
 },
 late:{
  guincho:[['Sua esposa acha que você não tem futuro nisso e deveria abandonar o automobilismo imediatamente.',-20],['Sua equipe não gostou de ter que fazer hora extra para reparar o carro.',-10],['Os torcedores acham que foi perda de tempo assistir a essa corrida.',-10]],
  fundo:[['Sua esposa disse que, se for pra fazer figuração, é melhor parar de correr.',-10],['A equipe acredita que o resultado poderia ser melhor.',-5],['Os torcedores ficaram chateados de você mal aparecer na transmissão da corrida.',-5]],
  pontos:[['Sua esposa acha que você precisa melhorar.',-5],['Sua equipe queria um resultado melhor, mas entende que a longo prazo é importante estar sempre marcando pontos.',5],['Os torcedores não ficaram muito felizes, mas entendem que não se pode ganhar todas.',0]],
  podio:[['Sua esposa não quer mais troféus que não sejam de 1º lugar, pois eles estão entulhando a casa.',0],['Sua equipe está em festa por você ter levado o carro ao pódio!',10],['Os torcedores estão se sentindo representados por ter um pobre no pódio!',10]],
  vitoria:[['Sua esposa está feliz com a vitória!',10],['Sua equipe está impressionada com seu desempenho e quer ter você no time pra sempre.',20],['A torcida está em festa pela vitória de um piloto pobre!',20]]
 }
});
// What a race was for the cards: towed in or disqualified, from the 11th back, 7th to 10th,
// 2nd to 6th (the trophies of the six-step podium) or the win.
export function outcomeOf(result){
 const p=result?.status==='Terminou'&&Number.isInteger(result.position)?result.position:null;
 return !p?'guincho':p===1?'vitoria':p<=6?'podio':p<=10?'pontos':'fundo';
}
export const OUTCOME_TITLES=Object.freeze({guincho:'Resgatado pelo guincho',fundo:'Do 11º lugar para trás',pontos:'Entre o 7º e o 10º lugar',podio:'No pódio, entre o 2º e o 6º lugar',vitoria:'Vitória!'});
// The challenges, one at a time before a deadline (in races): first the pilot's kit, raced on loan until it is bought;
// then the Blazer out of the workshop (BLAZER_AFTER, no deadline); then (Central #16, Stevan's choices in #16.2) the
// next steps of a career, dearer each time, and at last the Opala 99 (OPALA_GOAL). When the money is there, the wife
// asks for an expense first (expense.value at 50%; none for her own trip). now: the challenge card's line meanwhile
// (the kit: the loan); perk: what it changes after (read from career.gear: entryFor, repairPerPoint, enginePower);
// morale: the bars it lifts when bought; missedMorale: a deadline missed (MISSED otherwise); wife: her trip, skipped
// after a divorce.
export const CHALLENGES=Object.freeze([
 {id:'macacao',title:'Juntar dinheiro para comprar seu macacão',own:'seu macacão',goal:1000,races:3,loan:'o macacão que o Kléber Eletric emprestou',done:'Macacão vermelho novinho, só seu. O emprestado volta para o Kléber.',missed:'O Kléber empresta o macacão por mais um prazo.',
  expense:{what:'o aniversário da filha',ask:'Amor, o aniversário da nossa filha é no fim de semana. Preciso do dinheiro da festa.',value:300}},
 {id:'luvas',title:'Juntar dinheiro para comprar suas luvas',own:'suas luvas',goal:300,races:2,loan:'as luvas que a equipe 99 emprestou',done:'Luvas novas, só suas. Nada mais de luva emprestada.',missed:'A equipe 99 empresta as luvas por mais um prazo, mas ficou desconfiada.',
  expense:{what:'a conta de luz atrasada',ask:'A conta de luz venceu e vão cortar a energia. Tem que pagar hoje.',value:120}},
 {id:'sapatilhas',title:'Juntar dinheiro para comprar suas sapatilhas',own:'suas sapatilhas',goal:400,races:2,loan:'as sapatilhas que a equipe 99 emprestou',done:'Sapatilhas novas: agora o pé sente o pedal.',missed:'A equipe 99 empresta as sapatilhas por mais um prazo, mas ficou desconfiada.',
  expense:{what:'o material escolar da filha',ask:'A escola mandou a lista de material. A menina não pode ficar sem.',value:150}},
 {id:'capacete',title:'Juntar dinheiro para comprar seu capacete',own:'seu capacete',goal:1200,races:3,loan:'o capacete que a equipe 99 emprestou',done:'Capacete novo, do seu tamanho. O kit de piloto está completo!',missed:'A equipe 99 empresta o capacete por mais um prazo, mas ficou desconfiada.',
  expense:{what:'a geladeira que quebrou',ask:'A geladeira parou de vez e a comida vai estragar. Precisamos de outra.',value:400}},
 {id:'hans',title:'Juntar dinheiro para comprar seu HANS',own:'seu HANS',goal:1500,races:3,loan:'o HANS que a equipe 99 emprestou',done:'HANS novo, só seu: o protetor de pescoço que segura a cabeça nas batidas.',missed:'A equipe 99 empresta o HANS por mais um prazo, mas ficou desconfiada.',
  expense:{what:'o uniforme novo da escola',ask:'A escola mudou o uniforme e a menina precisa de um novo. Não dá para ela ir de qualquer jeito.',value:450}},
 {id:'carretinha',title:'Juntar dinheiro para o engate e a carretinha da Blazer',own:'o engate e a carretinha',goal:1800,races:3,now:'Enquanto isso, o Opala viaja de caminhão-cegonha: fora de Interlagos, a inscrição custa R$ 150.',done:'Engate na Blazer e carretinha atrás: agora é ela que leva o Opala para as corridas.',perk:'Fora de Interlagos, a inscrição passa a custar R$ 100, como em casa.',missed:'Mais um prazo pagando o caminhão-cegonha. A equipe 99 está de olho.',
  expense:{what:'o imposto da Blazer',ask:'Chegou o imposto da Blazer. Agora que ela saiu da oficina, tem que pagar.',value:500}},
 {id:'ferramentas',title:'Juntar dinheiro para as ferramentas novas do Box 99',own:'as ferramentas novas do Box 99',goal:2200,races:4,now:'Enquanto isso, a equipe trabalha com as ferramentas velhas: cada 1% de dano custa R$ 10 de conserto.',done:'Macaco a ar e parafusadeira novinhos no Box 99. A equipe está radiante!',perk:'Os consertos do carro passam a custar R$ 5 por 1% de dano.',morale:{equipe:10},missed:'A equipe continua com as ferramentas velhas e está perdendo a paciência.',
  expense:{what:'o dentista da filha',ask:'A menina está com dor de dente. Precisa ir ao dentista esta semana.',value:550}},
 {id:'bodas',title:'Juntar dinheiro para a viagem de bodas com a esposa',own:'a viagem de bodas',goal:2600,races:4,now:'Faz anos que vocês não viajam juntos. Ela merece: neste desafio, ela não pede nenhuma despesa.',done:'Malas prontas! Uma semana de bodas, só vocês dois.',morale:{esposa:25},missed:'A viagem ficou para depois. Sua esposa ficou decepcionada.',missedMorale:{esposa:-10},wife:true,expense:null},
 {id:'kart',title:'Juntar dinheiro para o kart da filha',own:'o kart da filha',goal:3000,races:4,now:'Desde que viu você correr, sua filha só fala em kart.',done:'Kart novo para a filha! A torcida adorou conhecer a nova pilota da família.',morale:{torcida:15},missed:'O kart ficou para depois. Sua filha ficou triste.',missedMorale:{esposa:-5,torcida:-5},
  expense:{what:'a máquina de lavar que quebrou',ask:'A máquina de lavar quebrou e a roupa está acumulando. Precisamos de outra.',value:600}},
 {id:'motor',title:'Juntar dinheiro para peças novas do motor do Opala',own:'as peças novas do motor',goal:3500,races:5,now:'O motor do Opala já sente o desgaste de tantas corridas.',done:'Pistões, anéis e bronzinas novos: o motor do Opala voltou a encher.',perk:'O motor ficou um pouquinho mais forte.',missed:'O motor continua cansado e a equipe está preocupada.',
  expense:{what:'o conserto do telhado',ask:'Choveu e o telhado está pingando em cima da cama. Tem que consertar antes da próxima chuva.',value:700}}
].map((c,i)=>Object.freeze({...c,number:i+1,now:c.now??`Você corre com ${c.loan}.`,expense:c.expense&&Object.freeze({...c.expense})})));
// After the pilot's kit (the first four), the dream that started it all: the Blazer out of the workshop. After the last
// challenge, the big dream: the Opala 99 bought from the team.
export const BLAZER_AFTER=4,BLAZER_GOAL=900,OPALA_GOAL=8000;
// Where the career stands: a challenge, the Blazer (once the kit is bought, until the mechanic is paid) or, after the
// last challenge, the Opala 99 (done: bought). released: the Blazer out (the story profile's).
export function stageOf(career,released){
 if(career.challenge===BLAZER_AFTER&&!released)return {kind:'blazer',goal:BLAZER_GOAL,done:false};
 const challenge=CHALLENGES[career.challenge];
 return challenge?{kind:'challenge',challenge}:{kind:'opala',goal:OPALA_GOAL,done:!!career.opala};
}
export const dreamCard=(stage,wallet,fresh=false)=>({type:'dream',dream:stage.kind,goal:stage.goal,fund:wallet.fund,done:stage.done,...(fresh?{fresh:true}:{})});
// What comes after a challenge done or skipped (or the Blazer out): the next challenge, its deadline from now, or a dream.
export function nextCard(career,wallet){const s=stageOf(career,wallet.released);return s.kind==='challenge'?{type:'challenge',challenge:s.challenge.id,fund:wallet.fund,left:s.challenge.races,fresh:true}:dreamCard(s,wallet,true);}
// A deadline missed: the loan goes on for another deadline, the team and the supporters notice.
export const MISSED=Object.freeze({equipe:-10,torcida:-5});
// An expense refused: the wife takes it badly.
export const REFUSED=Object.freeze({esposa:-10});
export const expenseFor=(challenge,career)=>Math.round(challenge.expense.value*expenseScale(career.morale.esposa));
// Kléber Eletric's box: the first race, where he lends his overalls, and the overalls given back.
// [who, line, how it is said]: 'kleber' or 'pilot' (the player's name on screen).
export const INTRO_LINES=Object.freeze([
 ['kleber','Seja bem-vindo à Old Stock, Pobre Piloto! Estou aqui pra te ajudar no que você precisar.'],
 ['pilot','Muito obrigado, senhor Kléber Eletric.'],
 ['kleber','A corrida já vai começar. Você precisa vestir seu macacão.'],
 ['pilot','Ér... Eu não tenho macacão, senhor Kléber Eletric...','com tristeza'],
 ['kleber','Como assim? Um piloto que não tem macacão?'],
 ['pilot','Eles são muito caros, senhor Kléber Eletric...'],
 ['kleber','Vou te emprestar um. Mas você precisa comprar o seu o quanto antes e me devolver este. Pode ser que eu precise.']
]);
export const DONE_LINES=Object.freeze({
 macacao:[['pilot','Muito obrigado pelo macacão, senhor Kléber Eletric. Graças a ele pude começar no automobilismo.','entrega a bolsa'],['kleber','Não há de quê, Pobre Piloto. Parabéns pela conquista do seu primeiro macacão. Tomara que ele te dê sorte e traga muitas vitórias.','pega a bolsa']],
 // The daughter's kart (story-scene.js 'kart'): she drives round in front of the Box 99, her father watching.
 kart:[['daughter','Pai, olha eu! Sou piloto igual a você!','acelerando o kart'],['pilot','Essa é a minha filha! Segura firme na curva!','orgulhoso'],['daughter','Quando eu crescer, vou correr de Opala também!','para o kart na frente do pai'],['pilot','Vai sim, filha. E vai ser bem mais rápida que o pai.','emocionado']]
});
// The act a challenge's lines are staged in (story-scene.js): Kléber's box, or the kart at the Box 99.
const DONE_ACTS=Object.freeze({kart:'kart'});
export const MISSED_LINES=Object.freeze({
 macacao:[['kleber','O prazo acabou, Pobre Piloto. Cadê o seu macacão?'],['pilot','Ainda não deu, senhor Kléber Eletric... A grana não fechou.','sem graça'],['kleber','Tudo bem, empresto mais um pouco. Mas não demora: a equipe já está comentando.']]
});
// The end of the story, by what ran out first.
export const GAME_OVER=Object.freeze({
 esposa:'Sua esposa deu o ultimato: ou ela, ou as corridas. Você pendurou o capacete.',
 equipe:'A equipe 99 cansou de consertar o carro e foi atrás de outro piloto.',
 torcida:'A torcida virou as costas. Sem vaquinha, não tem corrida.',
 dinheiro:'A carreira de piloto te levou à falência e você está fora do automobilismo.'
});
// The wife's patience (Central #15). With her morale at 50% or less after a race the divorce clock runs, the faster
// the lower she is: [the band's lowest morale, fewest races, most races] (Stevan's table); under 10%, at once. Each
// race adds 1/N of the way, N the band's races for this wife (her patience, drawn when the clock starts: the fewer
// or the more), so a morale moving between bands takes the average of their deadlines. Above 50% the clock waits;
// more than FORGIVE_AFTER races in a row above it and it starts again from zero, her patience drawn anew.
export const DIVORCE_BANDS=Object.freeze([[40,4,5],[30,3,4],[20,2,3],[10,1,2]]);
export const DIVORCE_LINE=50,FORGIVE_AFTER=4;
export const newClock=()=>({progress:0,calm:0,patience:null});
export function divorceStep(career,random=Math.random){
 if(career.divorced)return false;const m=career.morale.esposa,c=career.clock;
 if(m>DIVORCE_LINE){if(c.progress>0&&++c.calm>FORGIVE_AFTER)Object.assign(c,newClock());return false;}
 c.calm=0;if(m<DIVORCE_BANDS.at(-1)[0]){c.progress=1;return true;}
 if(c.patience===null)c.patience=random();
 const [,few,more]=DIVORCE_BANDS.find(([low])=>m>=low);c.progress=Math.min(1,c.progress+1/(c.patience<.5?few:more));
 return c.progress>=1-1e-9;
}
// How the wife's card tells her patience: running out by thirds, or another chance above 50%.
export const patienceOf=clock=>!clock||clock.progress<=0?null:clock.calm>0?{chance:FORGIVE_AFTER+1-clock.calm}:{stage:clock.progress<1/3?0:clock.progress<2/3?1:2};
// The divorce: she takes half of the wallet (the division of property); her bar and her requests end, and a
// pension of PENSION a month leaves the wallet before each vaquinha from the next race on (pensionCards).
export const PENSION=300;
export function divorce(career,wallet){
 const taken=Math.round(Math.max(0,wallet.fund)*50)/100;wallet.fund-=taken;career.divorced={race:career.races,taken};career.pensionFor=null;
 if(career.report){career.report.divorce={taken};career.report.divorceDue=false;}return taken;
}
// The months a round's pension pays (Stevan's table over the Old Stock 2026 calendar: January to March at its first
// round, June and July at Cascavel in July, November and December at the last); a race outside it, one month.
export const PENSION_MONTHS=Object.freeze([['janeiro','fevereiro','março'],['abril'],['maio'],['junho','julho'],['agosto'],['setembro'],['outubro'],['novembro','dezembro']]);
// Before the vaquinha of each race after the divorce (once a race): the months owed, out of the wallet as far as it
// goes (never a debt: the pilot can still get back on his feet). round: the championship round, or null.
export function pensionCards(career,wallet,round=null){
 if(!career.divorced||career.pensionFor===career.races)return [];
 const months=PENSION_MONTHS[round]??null,amount=PENSION*(months?.length??1),before=wallet.fund,charged=Math.min(amount,Math.max(0,before));
 wallet.fund=before-charged;career.pensionFor=career.races;
 return [{type:'pension',months,amount,charged,before,fund:wallet.fund}];
}
// The lawyer at the Box 99 (story-scene.js stages it): his three lines, Stevan signing and left alone, then
// getting up again. [who, line, how it is said]; a line without words shows only what happens.
export const DIVORCE_LINES=Object.freeze([
 ['lawyer','Eu sou advogado e estou aqui representando a sua esposa.'],
 ['lawyer','Ela se cansou de tantos prejuízos com corridas e decidiu pedir o divórcio.'],
 ['lawyer','Assine estes papéis.','entrega os papéis'],
 ['pilot','','assina os papéis com tristeza'],
 ['pilot','','o advogado vai embora; sozinho no box, cabisbaixo'],
 ['pilot','Ainda tenho a pista e a torcida. Bora pra próxima.','respira fundo']
]);
// The divorce's cards in the report it came with: the scene (in what the pilot wears), then what she took.
export const divorceCards=(career,wallet)=>career.report?.divorce?[...DIVORCE_LINES.map((line,i)=>({...lineCard(line,'divorce','divorce',i),outfit:outfitOf(career)})),{type:'divorce',taken:career.report.divorce.taken,fund:wallet.fund,race:career.report.race}]:[];

// blazerAt: the race count when the Blazer came out (null before); opala: the Opala 99 bought (Central #16).
// The hero's energy (user, 10-24): full at a career's start, a race takes ENERGY.race, the Tia's café gives it back — a
// coffee or a pão de queijo ENERGY.one each, both in the same paddock fill it (he is mineiro), a doce de leite ENERGY.sweet.
export const ENERGY=Object.freeze({start:100,race:60,one:30,sweet:15});
export function eatEnergy(energy,id,eaten){
 const both=['cafe','pao'].every(item=>item===id||eaten.includes(item));
 return clamp(both?100:energy+(id==='doce'?ENERGY.sweet:ENERGY.one),0,100);
}
export const newCareer=()=>({version:1,energy:ENERGY.start,morale:Object.fromEntries(MORALE.map(k=>[k,MORALE_START])),races:0,challenge:0,since:0,expense:false,gear:[],intro:false,report:null,over:null,clock:newClock(),divorced:null,pensionFor:null,blazerAt:null,opala:false});
// A saved career, checked field by field; anything unknown starts a new one.
export function loadCareer(raw){
 const c=newCareer();if(!raw||typeof raw!=='object'||raw.version!==1)return c;
 const count=v=>Number.isInteger(v)&&v>=0?v:0;
 for(const k of MORALE)if(Number.isFinite(raw.morale?.[k]))c.morale[k]=clamp(Math.round(raw.morale[k]),0,100);
 c.races=count(raw.races);c.challenge=Math.min(count(raw.challenge),CHALLENGES.length);c.since=Math.min(count(raw.since),c.races);c.expense=raw.expense===true;c.intro=raw.intro===true;
 c.gear=Array.isArray(raw.gear)?CHALLENGES.slice(0,c.challenge).map(ch=>ch.id):[];
 if(raw.report&&typeof raw.report==='object'&&Object.hasOwn(OUTCOME_TITLES,raw.report.outcome)&&MORALE.every(k=>Number.isFinite(raw.report.before?.[k])))
  c.report={race:count(raw.report.race),outcome:raw.report.outcome,before:Object.fromEntries(MORALE.map(k=>[k,clamp(Math.round(raw.report.before[k]),0,100)])),awaiting:raw.report.awaiting==='expense'?'expense':null,
   ...(['damage','bill','charged'].every(k=>Number.isInteger(raw.report.repair?.[k])&&raw.report.repair[k]>=0)?{repair:{damage:raw.report.repair.damage,bill:raw.report.repair.bill,charged:raw.report.repair.charged}}:{})};
 c.over=Object.hasOwn(GAME_OVER,raw.over)?raw.over:null;
 c.energy=Number.isFinite(raw.energy)?clamp(Math.round(raw.energy),0,100):ENERGY.start;
 // The divorce (Central #15): the clock, the divorce itself and the race whose pension is paid.
 const share=v=>Number.isFinite(v)&&v>=0&&v<=1,clockOf=k=>k&&share(k.progress)?{progress:k.progress,calm:Math.min(count(k.calm),FORGIVE_AFTER),patience:share(k.patience)?k.patience:null}:null;
 c.clock=clockOf(raw.clock)??newClock();
 if(raw.divorced&&Number.isInteger(raw.divorced.race)&&Number.isFinite(raw.divorced.taken)&&raw.divorced.taken>=0)c.divorced={race:Math.min(count(raw.divorced.race),c.races),taken:raw.divorced.taken};
 c.pensionFor=Number.isInteger(raw.pensionFor)&&raw.pensionFor>=0&&raw.pensionFor<=c.races?raw.pensionFor:null;
 // The Blazer out and the Opala 99 bought (Central #16); a career from before them has neither.
 c.blazerAt=Number.isInteger(raw.blazerAt)&&raw.blazerAt>=0&&raw.blazerAt<=c.races?raw.blazerAt:null;c.opala=raw.opala===true&&c.challenge===CHALLENGES.length;
 if(c.report){const r=raw.report;for(const k of ['clock','clockBefore']){const v=clockOf(r[k]);if(v)c.report[k]=v;}
  if(c.divorced&&Number.isFinite(r.divorce?.taken))c.report.divorce={taken:r.divorce.taken};c.report.divorceDue=r.divorceDue===true&&!c.divorced;}
 return c;
}
const shift=(career,changes)=>{for(const [k,d] of Object.entries(changes))career.morale[k]=clamp(career.morale[k]+d,0,100);};
// The morale cards of a report: what each bar went through, from where it was before the race.
// After a divorce the wife's card is gone (her bar stays where it was); hers carries her patience (patienceOf).
export function moraleCards(career){
 const r=career.report;if(!r)return [];
 const table=MORALE_CARDS[r.race<=EARLY_RACES?'early':'late'][r.outcome],gone=career.divorced&&career.divorced.race<r.race;
 return MORALE.map((key,i)=>({type:'morale',key,text:table[i][0],delta:table[i][1],before:r.before[key],value:clamp(r.before[key]+table[i][1],0,100),outcome:r.outcome,race:r.race,
  ...(key==='esposa'?{patience:patienceOf(r.clock),divorced:!!r.divorce}:{})})).filter(card=>!(gone&&card.key==='esposa'));
}
// The repair bill's card, after the supporters' morale card (none on a report from before the bill).
export const repairCards=(report,wallet)=>report?.repair?[{type:'repair',...report.repair,fund:wallet.fund}]:[];
// The race is paid: one more race in the career, the morale moved by its outcome, and a report
// waiting to be shown (openReport). The challenge is looked at when the report is shown.
// repair: the team's bill already taken from the wallet (repairBill).
// The wife's clock steps with her new morale (divorceDue: the state takes half of the wallet, divorce()).
export function applyRace(career,result,repair=null,random=Math.random){
 career.races++;const outcome=outcomeOf(result),before={...career.morale};career.energy=Math.max(0,(career.energy??ENERGY.start)-ENERGY.race);
 career.report={race:career.races,outcome,before,awaiting:null,...(repair?{repair}:{}),clockBefore:{...career.clock}};
 for(const card of moraleCards(career))career.morale[card.key]=card.value;
 career.report.divorceDue=divorceStep(career,random);career.report.clock={...career.clock};
 return career.report;
}
// The judge disqualified a car already paid (taken to the box before the inspection): the report not
// yet shown counts as towed in.
export function reviseRace(career,result){
 const r=career.report;if(!r||r.awaiting)return false;
 career.morale={...r.before};r.outcome=outcomeOf(result);for(const card of moraleCards(career))career.morale[card.key]=card.value;
 // The wife's clock steps again from where it was before the race, her patience as drawn.
 if(!career.divorced&&r.clockBefore){const patience=career.clock.patience;career.clock={...r.clockBefore};r.divorceDue=divorceStep(career,()=>patience??Math.random());r.clock={...career.clock};}
 return true;
}
// The challenge after a race (or after the wife's expense was answered), applied at once:
// wallet: the profile with fund (the wallet) and released (the Blazer). Returns its cards.
export function challengeCards(career,wallet){
 const stage=stageOf(career,wallet.released);
 if(stage.kind!=='challenge')return [dreamCard(stage,wallet)];
 const c=stage.challenge;
 // Her trip after a divorce: no wife, no trip; the next challenge starts at once.
 if(c.wife&&career.divorced){career.challenge++;career.since=career.races;career.expense=false;return [{type:'skipped',challenge:c.id,fund:wallet.fund},nextCard(career,wallet)];}
 if(wallet.fund>=c.goal&&c.expense&&!career.expense&&!career.divorced){if(career.report)career.report.awaiting='expense';return [{type:'expense',challenge:c.id,value:expenseFor(c,career),fund:wallet.fund}];}
 if(wallet.fund>=c.goal){
  wallet.fund-=c.goal;career.gear.push(c.id);career.challenge++;career.since=career.races;career.expense=false;if(c.morale)shift(career,c.morale);
  const act=DONE_ACTS[c.id]??'done',lines=(DONE_LINES[c.id]??[]).map((line,i)=>({...lineCard(line,c.id,act,i),...(act==='done'?{}:{outfit:outfitOf(career)})}));
  return [...lines,{type:'done',challenge:c.id,fund:wallet.fund,morale:{...career.morale}},nextCard(career,wallet)];
 }
 const ran=career.races-career.since;
 if(ran>=c.races){
  const changes=c.missedMorale??MISSED;shift(career,changes);career.since=career.races;
  return [...(MISSED_LINES[c.id]??[]).map((line,i)=>lineCard(line,c.id,'missed',i)),{type:'missed',challenge:c.id,changes,morale:{...career.morale},left:c.races,fund:wallet.fund}];
 }
 return [{type:'challenge',challenge:c.id,fund:wallet.fund,left:c.races-ran}];
}
// The Blazer out of the workshop (ImmersiveState.releaseBlazer): the next challenge's deadline starts from this race.
export function releaseBlazer(career,wallet){
 if(stageOf(career,wallet.released).kind!=='blazer'||wallet.fund<BLAZER_GOAL)return null;
 wallet.fund-=BLAZER_GOAL;wallet.released=true;career.blazerAt=career.races;career.since=career.races;career.expense=false;
 return [{type:'dream',dream:'blazer',goal:BLAZER_GOAL,fund:wallet.fund,done:true},nextCard(career,wallet)];
}
// The Opala 99 bought from the team (ImmersiveState.buyOpala), after the last challenge.
export function buyOpala(career,wallet){
 const s=stageOf(career,wallet.released);if(s.kind!=='opala'||s.done||wallet.fund<OPALA_GOAL)return null;
 wallet.fund-=OPALA_GOAL;career.opala=true;
 return [{type:'owned',goal:OPALA_GOAL,fund:wallet.fund}];
}
// A line of Kléber's box (story-scene.js stages it): act 'intro', 'done' or 'missed', its place in the talk.
export const lineCard=([who,text,how],scene,act=scene,index=0)=>({type:'line',who,text,how:how??'',scene,act,index});
// What the pilot wears: street clothes until Kléber lends his overalls, those until his own are bought.
export const outfitOf=career=>!career.intro?'civil':career.gear.includes('macacao')?'proprio':'emprestado';
// The wife's expense answered: paid from the wallet (as much as there is), or refused (her morale
// drops). Either way she asks once per challenge; then the challenge goes on (challengeCards).
export function answerExpense(career,wallet,pay){
 const s=stageOf(career,wallet.released),c=s.challenge;if(!c?.expense||career.expense||!career.report?.awaiting)return null;
 const value=expenseFor(c,career);
 if(pay)wallet.fund=Math.max(0,wallet.fund-value);else shift(career,REFUSED);
 career.expense=true;career.report.awaiting=null;
 return [{type:'answer',challenge:c.id,paid:!!pay,value,fund:wallet.fund,morale:career.morale.esposa},...challengeCards(career,wallet)];
}
// The first bar to reach zero ends the story; the wife's no longer does (Central #15: under 10% she divorces him).
export const overReason=career=>MORALE.find(k=>k!=='esposa'&&career.morale[k]<=0)??null;
