// Modo História career: the wallet, three morale bars (wife, team, supporters), the equipment
// challenges with the wife's expenses, the Blazer out of the workshop, the challenges after it and the
// Opala 99 as the big dream (Central #16), from race to race of the Old Stock season. Pure rules, no DOM: ImmersiveState keeps the career in the story profile
// (opala99-immersive-v1, profile.career beside the wallet profile.fund) and ImmersiveMode shows
// its cards. 50% morale is the game as it was before the career.
import {CAR_PARTS} from './car-condition.js';
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
// A wallet short of it pays what it has and the team fixes only that share (repairCar). With the Box 99's new tools
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
// What the money paid fixes (user, 10-24): the bill's paid share of every part's damage; the rest stays on the car
// (career.car, each part's quality) and it starts the next race that damaged. The team never sends a part out under
// CAR_FLOOR, where the car could hardly race: that much it does free of charge (free). car: null when as new.
export const CAR_FLOOR=.5;
export function repairCar(quality,repair){
 const share=repair.bill>0?clamp(repair.charged/repair.bill,0,1):1;let free=false;
 const car=Object.fromEntries(CAR_PARTS.map(({id})=>{const q=clamp(Number.isFinite(quality?.[id])?quality[id]:1,0,1),fixed=q+(1-q)*share;if(fixed<CAR_FLOOR)free=true;return [id,Math.max(CAR_FLOOR,fixed)];}));
 return {car:Object.values(car).every(q=>q>=.995)?null:car,free};
}
// The CARRO bar of a carried car (0-1, as CarCondition.health), and in points as the HUD rounds it; evenCar: every part at
// one health (a state with no CarCondition).
export const evenCar=health=>Object.fromEntries(CAR_PARTS.map(({id})=>[id,clamp(Number.isFinite(health)?health:1,0,1)]));
export const carHealth=car=>car?CAR_PARTS.reduce((n,{id})=>n+(car[id]??1),0)/CAR_PARTS.length:1;
export const carPoints=car=>Math.ceil(carHealth(car)*100-1e-9);
// The wife's expenses cost 1.5x the standard at 0% and 0.5x at 100%; a knock damages the car on
// the same scale with the team; the supporters' gifts go the other way round.
export const expenseScale=morale=>1.5-clamp(morale,0,100)/100;
export const giftScale=morale=>.5+clamp(morale,0,100)/100;
// The vaquinha's whole (user, 10-24): never less than the race's own costs (floor: the entry and the litres the team
// recommends for the laps chosen, a refill at the Box 99 included when the tank holds less), so even the two supporters of
// a cold crowd pay the gasoline, on the longest circuit and in the longest race too. From 50% up it is what the first six
// always gave (base × giftScale) plus the litres a race of more than 8 laps adds (extra), so the laps chosen leave the
// savings as they were; under 50% it slides from there down to the floor at 0%.
export function vaquinhaWhole(morale,{base,floor,extra=0}){
 const m=clamp(Number.isFinite(morale)?morale:MORALE_START,0,100),half=base*giftScale(MORALE_START)+extra;
 return Math.ceil(Math.max(floor,m>=MORALE_START?base*giftScale(m)+extra:floor+(half-floor)*m/MORALE_START)-1e-9);
}
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
// morale: the bars it lifts when bought; group: who waits for it when the deadline is missed (LATE; item: what the kit's
// lines say is not given back); wife: her trip, skipped after a divorce.
export const CHALLENGES=Object.freeze([
 {id:'macacao',title:'Juntar dinheiro para comprar seu macacão',own:'seu macacão',goal:1000,races:3,loan:'o macacão que o Kléber Eletric emprestou',done:'Macacão vermelho novinho, só seu. O emprestado volta para o Kléber.',missed:'O macacão do Kléber continua com você, agora sem prazo.',group:'kit',item:'o macacão',
  expense:{what:'o aniversário da filha',ask:'Amor, o aniversário da nossa filha é no fim de semana. Preciso do dinheiro da festa.',value:300}},
 {id:'luvas',title:'Juntar dinheiro para comprar suas luvas',own:'suas luvas',goal:300,races:2,loan:'as luvas que a equipe 99 emprestou',done:'Luvas novas, só suas. Nada mais de luva emprestada.',missed:'As luvas emprestadas continuam com você, agora sem prazo. A equipe 99 ficou desconfiada.',group:'kit',item:'as luvas',
  expense:{what:'a conta de luz atrasada',ask:'A conta de luz venceu e vão cortar a energia. Tem que pagar hoje.',value:120}},
 {id:'sapatilhas',title:'Juntar dinheiro para comprar suas sapatilhas',own:'suas sapatilhas',goal:400,races:2,loan:'as sapatilhas que a equipe 99 emprestou',done:'Sapatilhas novas: agora o pé sente o pedal.',missed:'As sapatilhas emprestadas continuam com você, agora sem prazo. A equipe 99 ficou desconfiada.',group:'kit',item:'as sapatilhas',
  expense:{what:'o material escolar da filha',ask:'A escola mandou a lista de material. A menina não pode ficar sem.',value:150}},
 {id:'capacete',title:'Juntar dinheiro para comprar seu capacete',own:'seu capacete',goal:1200,races:3,loan:'o capacete que a equipe 99 emprestou',done:'Capacete novo, do seu tamanho. O kit de piloto está completo!',missed:'O capacete emprestado continua com você, agora sem prazo. A equipe 99 ficou desconfiada.',group:'kit',item:'o capacete',
  expense:{what:'a geladeira que quebrou',ask:'A geladeira parou de vez e a comida vai estragar. Precisamos de outra.',value:400}},
 {id:'hans',title:'Juntar dinheiro para comprar seu HANS',own:'seu HANS',goal:1500,races:3,loan:'o HANS que a equipe 99 emprestou',done:'HANS novo, só seu: o protetor de pescoço que segura a cabeça nas batidas.',missed:'O HANS emprestado continua com você, agora sem prazo. A equipe 99 ficou desconfiada.',group:'kit',item:'o HANS',
  expense:{what:'o uniforme novo da escola',ask:'A escola mudou o uniforme e a menina precisa de um novo. Não dá para ela ir de qualquer jeito.',value:450}},
 {id:'carretinha',title:'Juntar dinheiro para o engate e a carretinha da Blazer',own:'o engate e a carretinha',goal:1800,races:3,now:'Enquanto isso, o Opala viaja de caminhão-cegonha: fora de Interlagos, a inscrição custa R$ 150.',done:'Engate na Blazer e carretinha atrás: agora é ela que leva o Opala para as corridas.',perk:'Fora de Interlagos, a inscrição passa a custar R$ 100, como em casa.',missed:'O Opala continua viajando de caminhão-cegonha. A equipe 99 está de olho.',group:'team',
  expense:{what:'o imposto da Blazer',ask:'Chegou o imposto da Blazer. Agora que ela saiu da oficina, tem que pagar.',value:500}},
 {id:'ferramentas',title:'Juntar dinheiro para as ferramentas novas do Box 99',own:'as ferramentas novas do Box 99',goal:2200,races:4,now:'Enquanto isso, a equipe trabalha com as ferramentas velhas: cada 1% de dano custa R$ 10 de conserto.',done:'Macaco a ar e parafusadeira novinhos no Box 99. A equipe está radiante!',perk:'Os consertos do carro passam a custar R$ 5 por 1% de dano.',morale:{equipe:10},missed:'A equipe continua com as ferramentas velhas e está perdendo a paciência.',group:'team',
  expense:{what:'o dentista da filha',ask:'A menina está com dor de dente. Precisa ir ao dentista esta semana.',value:550}},
 {id:'bodas',title:'Juntar dinheiro para a viagem de bodas com a esposa',own:'a viagem de bodas',goal:2600,races:4,now:'Faz anos que vocês não viajam juntos. Ela merece: neste desafio, ela não pede nenhuma despesa.',done:'Malas prontas! Uma semana de bodas, só vocês dois.',morale:{esposa:25},missed:'A viagem ficou para depois. Sua esposa ficou decepcionada.',group:'family',wife:true,expense:null},
 {id:'kart',title:'Juntar dinheiro para o kart da filha',own:'o kart da filha',goal:3000,races:4,now:'Desde que viu você correr, sua filha só fala em kart.',done:'Kart novo para a filha! A torcida adorou conhecer a nova pilota da família.',morale:{torcida:15},missed:'O kart ficou para depois. Sua filha ficou triste.',group:'family',
  expense:{what:'a máquina de lavar que quebrou',ask:'A máquina de lavar quebrou e a roupa está acumulando. Precisamos de outra.',value:600}},
 {id:'motor',title:'Juntar dinheiro para peças novas do motor do Opala',own:'as peças novas do motor',goal:3500,races:5,now:'O motor do Opala já sente o desgaste de tantas corridas.',done:'Pistões, anéis e bronzinas novos: o motor do Opala voltou a encher.',perk:'O motor ficou um pouquinho mais forte.',missed:'O motor continua cansado e a equipe está preocupada.',group:'team',
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
// A deadline missed (Central #22, Stevan's values and lines): no new deadline, the challenge stays late until it is
// bought. Whoever waited for it loses `deadline` points when the time runs out and `step` in every race after, whatever
// the race brought: a good result lifts nothing there, a bad one costs its own points too. By the challenge's group:
// the bars and the lines of their morale cards ({item}: the kit not given back); the first line of each when the
// deadline ends, then drawn race by race, never the same twice in a row.
export const LATE=Object.freeze({
 kit:{deadline:10,step:5,bars:{equipe:['A equipe está decepcionada com o descumprimento do prazo para devolver {item}.','Estão dizendo pelo paddock que você é uma pessoa enrolada.','Estão dizendo pelo paddock que você não cumpre os combinados.','Estão dizendo pelo paddock que é melhor não te emprestar nada porque você não devolve.']}},
 team:{deadline:10,step:5,bars:{
  equipe:['A equipe está chateada por você prometer investir no time e não cumprir.','Um mecânico andou dizendo que sempre trabalha até tarde quando você bate o carro, mas você não retribuiu.','Alguns mecânicos estão sugerindo uma greve.'],
  torcida:['A torcida está decepcionada por você não investir no time, que é a base do trabalho.','A torcida está te achando egoísta por não investir na equipe.','A torcida está ameaçando parar de torcer por um piloto que não valoriza o time.']}},
 family:{deadline:10,step:5,bars:{esposa:['Sua esposa está decepcionada por você criar expectativa e não cumprir.','Mensagem da esposa: “Pra gastar com corrida você tem dinheiro, né?”','Mensagem da esposa: “Tá faltando pouco pra eu juntar suas coisas e você morar no box.”']}}
});
// The bars a late challenge weighs on (after a divorce, the wife's no longer) and the text of one of their lines.
export const lateBars=(challenge,career)=>Object.keys(LATE[challenge.group].bars).filter(k=>k!=='esposa'||!career.divorced);
export const lateLine=(challenge,bar,index)=>LATE[challenge.group].bars[bar][index].replace('{item}',challenge.item??'');
// The challenge late since its deadline's race (career.late), or null.
export const lateChallenge=career=>career.late===null?null:CHALLENGES[career.challenge]??null;
// The deadline as the paddock and the season screen say it: the races left, or how late the challenge is.
export function deadlineText(challenge,career){
 if(career.late!==null){const k=career.races-career.late;return k?`atrasado há ${k} corrida${k>1?'s':''}`:'prazo vencido: desafio atrasado';}
 const left=Math.max(0,challenge.races-(career.races-career.since));return left?`prazo: ${left} corrida${left>1?'s':''}`:'o prazo termina nesta corrida';
}
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
 macacao:[['pilot','Muito obrigado pelo macacão, senhor Kléber Eletric. Graças a ele pude começar no automobilismo.','entrega a bolsa'],['kleber','Não há de quê, Pobre Piloto. Deixa eu ver se ele voltou inteiro...','pega a bolsa'],
  ['kleber','Hum... Está com cheiro de guincho. Esse macacão andou mais no caminhão do resgate do que dentro do carro!','rindo'],
  ['pilot','É que o rapaz do resgate já me conhece, senhor. Ele disse que na terceira vez eu ganho desconto.','sem graça'],
  ['kleber','Pois agora o seu é vermelho e novinho. Se rasgar no muro, o prejuízo é todo seu, hein?','aponta'],
  ['kleber','Brincadeira, Pobre Piloto! Macacão próprio é coisa de quem leva a sério. Tomara que ele te dê sorte e traga muitas vitórias.','abre os braços']],
 // The daughter's kart (story-scene.js 'kart'): she drives round in front of the Box 99, her father watching.
 kart:[['daughter','Pai, olha eu! Sou piloto igual a você!','acelerando o kart'],['pilot','Essa é a minha filha! Segura firme na curva!','orgulhoso'],['daughter','Quando eu crescer, vou correr de Opala também!','para o kart na frente do pai'],['pilot','Vai sim, filha. E vai ser bem mais rápida que o pai.','emocionado']]
});
// The act a challenge's lines are staged in (story-scene.js): Kléber's box, or the kart at the Box 99.
const DONE_ACTS=Object.freeze({kart:'kart'});
// Kléber comes to congratulate on every conquest (user, 10-24): each challenge bought (the overalls: DONE_LINES), the
// Blazer out, the Opala 99 bought. Caricature, after the stories Stevan tells in his videos: he puts the pilot
// down hard, always ending on his support. Played at his box (act 'parabens', story-scene.js), the pilot showing what
// he bought; how a line is said also picks the gesture.
export const KLEBER_LINES=Object.freeze({
 luvas:[['kleber','Pobre Piloto! Me contaram que você comprou luvas. Suas mesmo? Não pegou emprestado de ninguém?'],
  ['pilot','Minhas, senhor Kléber Eletric! Fiquei duas semanas sem almoçar pra juntar. Ainda bem que água é de graça.','mostra as luvas'],
  ['kleber','Ótimo. Agora acabou a desculpa pra sair do box sem luva e levar bronca do fiscal na frente do autódromo inteiro.','rindo'],
  ['pilot','Aquilo foi a tensão do primeiro treino, senhor...','sem graça'],
  ['kleber','E lembra: luva protege a mão, não protege o carro. O muro continua lá.','aponta'],
  ['kleber','Brincadeira! Mão firme no volante, Pobre Piloto. Parabéns pela conquista. Tô contigo!','abre os braços']],
 sapatilhas:[['kleber','Sapatilha nova, Pobre Piloto? Deixa eu ver esse pezinho de piloto.'],
  ['pilot','Olha só, senhor Kléber Eletric. Com essa sola fininha, agora o pé sente o pedal!','mostra as sapatilhas'],
  ['kleber','Que bom, porque até hoje o seu pé não sentia nem o acelerador. Em Brasília você pisou tão de leve que o motor afogou de tédio!','rindo'],
  ['pilot','Todo mundo me falou que o carro era perigoso, senhor. Fui com cuidado...','sem graça'],
  ['kleber','Cuidado demais! Naquele dia, o guincho deu mais voltas na pista do que você.','aponta'],
  ['kleber','Mas agora não tem desculpa: sapatilha nova é pra pisar fundo. Parabéns, Pobre Piloto!','aplaudindo']],
 capacete:[['kleber','Capacete próprio! Agora sim, Pobre Piloto: o kit de piloto está completo. Parabéns!','aplaudindo'],
  ['pilot','Obrigado, senhor Kléber Eletric. Do meu tamanho, finalmente. O emprestado apertava tanto que eu saía do carro com bochecha de baiacu.','mostra o capacete'],
  ['kleber','Cuida bem dele. Aí dentro vai a peça mais importante de um piloto... que, no seu caso, ainda está em fase de testes.','rindo'],
  ['pilot','O senhor está falando da minha cabeça?','sem graça'],
  ['kleber','Lembra quando eu pedi pra você dar uma volta em Interlagos só na mente, de olho fechado? Você rodou! Ninguém roda mentalmente, Pobre Piloto!','rindo'],
  ['kleber','Mas, falando sério: kit completo é sinal de quem não desiste. Isso é o perfil Eletric. Tô orgulhoso de você.','abre os braços']],
 hans:[['kleber','HANS novo, Pobre Piloto! Sabe pra que serve isso aí?'],
  ['pilot','Pra segurar a cabeça nas batidas, senhor Kléber Eletric.','mostra o HANS'],
  ['kleber','Exato. E do jeito que você bate, foi o melhor investimento da sua carreira. Ele se paga em duas corridas!','rindo'],
  ['pilot','O rapaz do resgate disse que eu já sou cliente resgate safira. Falta pouco pro diamante!','orgulhoso'],
  ['kleber','Isso não é meta, Pobre Piloto!','assustado'],
  ['kleber','Brincadeira à parte: segurança em primeiro lugar. Eu quero você inteirinho no grid da próxima. Parabéns!','abre os braços']],
 carretinha:[['kleber','Engate e carretinha na Blazer! Agora o Opala viaja com você, Pobre Piloto.'],
  ['pilot','Chega de caminhão-cegonha, senhor Kléber Eletric. E de ônibus também: eu era o único piloto do grid que chegava pela rodoviária.','mostra o engate'],
  ['kleber','Só tem um problema: a Blazer puxa o Opala. E quem puxa a Blazer quando a gasolina acabar no meio da estrada?','rindo'],
  ['pilot','Já pensei nisso, senhor. Vai um galão no banco de trás. E, se precisar, a torcida empurra.','orgulhoso'],
  ['kleber','Planejamento de piloto pobre: humilde, mas funciona. Parabéns! Agora é chegar descansado e voar baixo.','abre os braços']],
 ferramentas:[['kleber','Ferramenta nova no Box 99! A equipe está tão feliz que até sorriu, Pobre Piloto.'],
  ['pilot','Macaco a ar e parafusadeira, senhor Kléber Eletric. A turma merecia.','mostra a parafusadeira'],
  ['kleber','Merecia mesmo. Por sua causa, num fim de semana só, eles trocaram o câmbio duas vezes, o diferencial e o motor. São os mecânicos mais treinados do Brasil!','rindo'],
  ['pilot','Eu gosto de dizer que eu ajudo no desenvolvimento do carro, senhor.','orgulhoso'],
  ['kleber','Ajuda: você quebra, eles aprendem. O Edu, o segundo piloto, que também é mecânico, disse que agora conserta mais rápido do que você consegue quebrar.','aponta'],
  ['kleber','Mas, falando sério: cuidar de quem cuida do carro é atitude de primeiro piloto. Parabéns, a equipe está com você!','abre os braços']],
 bodas:[['kleber','Viagem de bodas, Pobre Piloto? Parabéns! Sua esposa merece... principalmente por aguentar você.','rindo'],
  ['pilot','Uma semana só nós dois, senhor Kléber Eletric. Sem pista, sem Opala, sem guincho.','mostra a mala'],
  ['kleber','Uma semana inteira sem você no box. A equipe mandou agradecer à sua esposa pessoalmente.','rindo'],
  ['pilot','O senhor vai sentir minha falta?'],
  ['kleber','Vou. Mas, se passar Copa Truck na TV do hotel, desliga! Da última vez que você torceu por mim, estourou o turbo do caminhão.','assustado'],
  ['kleber','Vai, aproveita. Piloto feliz em casa é piloto rápido na pista. Volta descansado!','abre os braços']],
 kart:[['kleber','Pobre Piloto, eu vi sua filha no kart! Que tocada, hein? Muito mais limpa que a sua.'],
  ['pilot','Ela puxou o pai, senhor Kléber Eletric!','orgulhoso'],
  ['kleber','Puxou nada! Ela fez a curva sem rodar. Isso aí não veio de você.','rindo'],
  ['kleber','Daqui a uns anos, a primeira pilota do 99 vai ser ela. E você vai dormir no sofá-cama.','aponta'],
  ['pilot','Se for no autódromo, senhor, eu durmo até na barraca.','emocionado'],
  ['kleber','Isso é que é legado, Pobre Piloto. Parabéns, pai! A família 99 está crescendo.','abre os braços']],
 motor:[['kleber','Peças novas no motor! Agora o Opala tem força de sobra, Pobre Piloto.'],
  ['pilot','Pistão, anel e bronzina, senhor Kléber Eletric. O motor voltou a encher!','mostra o pistão'],
  ['kleber','Ótimo. Então, se você chegar lá atrás, acabou a desculpa do motor. Agora é só o piloto mesmo.','rindo'],
  ['pilot','Ainda tenho o câmbio, o diferencial, o tanque e o para-brisa, senhor.','sem graça'],
  ['kleber','Pobre Piloto, você tem mais desculpa do que o Opala tem peça!','aponta'],
  ['kleber','Mas olha: motor forte com piloto que tem vontade dá pódio. Vai pra cima, que Jesus tá on!','abre os braços']],
 blazer:[['kleber','Pobre Piloto! Fiquei sabendo que a Blazer saiu da oficina. Parabéns, o sonho virou realidade!'],
  ['pilot','Saiu, senhor Kléber Eletric! Paguei o mecânico até o último centavo.','mostra a chave'],
  ['kleber','Já avisou o rapaz do guincho? Coitado, ele vai perder a renda extra.','rindo'],
  ['pilot','Agora ela anda, senhor! Só o marcador de gasolina que não marca. E o alternador. E às vezes ela não liga. Mas anda!','orgulhoso'],
  ['kleber','Você é o único piloto que eu conheço com dois carros pra empurrar: um na pista e outro em casa!','rindo'],
  ['kleber','Mas sonho realizado é sonho realizado. Quem tira a Blazer da oficina tira o Opala do fundo do grid. Tô contigo!','abre os braços']],
 opala:[['kleber','Pobre Piloto... chegou o dia. O Opala 99 é seu.','entrega a chave'],
  ['pilot','Nem acredito, senhor Kléber Eletric. Da vaquinha ao grid. O carro é meu!','emocionado'],
  ['kleber','É seu. E, a partir de hoje, quando quebrar, é você que chora e é você que paga. Bem-vindo ao clube dos donos de carro velho!','rindo'],
  ['pilot','Eu já era sócio, senhor. Tenho a Blazer.','orgulhoso'],
  ['pilot','Um dia eu vou ser campeão e vou esquecer de todo mundo que me ajudou. Mas, até lá, nunca vou esquecer do senhor.','emocionado'],
  ['kleber','Você veio de ônibus, dormiu em barraca, pulou almoço e nunca desistiu. Isso é o perfil Eletric. Tô orgulhoso de você, piloto!','abre os braços']]
});
// The career's firsts on the track (user, 10-24, after Stevan's first podium in sixth): Kléber, still in his overalls
// after the race (act 'podio'), congratulates, and the pilot with his trophy promises to cheer for him. A first podium
// below sixth opens with PODIUM_OPENING ({Lugar}: Segundo..Quinto); a first win is a first podium too, so it gets the
// win's talk alone.
export const PODIUM_PLACES=Object.freeze(['','primeiro','segundo','terceiro','quarto','quinto','sexto']);
export const FIRST_LINES=Object.freeze({
 podio:[['kleber','Pobre Piloto, PÓDIO! Sexto lugar! Só na Old Stock mesmo pra sexto lugar subir no pódio. Em qualquer outra categoria, você ia assistir da arquibancada!','aplaudindo'],
  ['pilot','Obrigado, senhor Kléber Eletric! Tudo bem que um bateu, dois quebraram, um foi punido e só um eu ultrapassei. Mas cada um com o seu, né?','orgulhoso'],
  ['kleber','Isso é resiliência, cara. É o perfil Eletric que a gente espera.'],
  ['pilot','O senhor é uma inspiração pra mim. Na próxima corrida, eu vou torcer muito pelo senhor!','emocionado'],
  ['kleber','Não, não, não! Torcer por mim, não! Está no contrato! Você torce pros outros.','assustado'],
  ['kleber','E pode vir no meu box... mas só de vez em quando, tá bom? Brincadeira. Parabéns, Pobre Piloto: você continua no time!','abre os braços']],
 vitoria:[['kleber','Pobre Piloto... você GANHOU! Você ganhou a corrida!','aplaudindo'],
  ['pilot','Ganhei, senhor Kléber Eletric! Eu, o piloto que já rodou até mentalmente!','orgulhoso'],
  ['kleber','Já mandei os fiscais conferirem tudo: as voltas, a balança, o regulamento... Vai que foi engano!','rindo'],
  ['pilot','Será que agora eu tenho estrela, senhor?'],
  ['kleber','Estrela, eu não sei. Mas hoje até o meu Laranjão ficou pequeno perto de você.','aponta'],
  ['kleber','Parabéns de verdade, Pobre Piloto. Hoje a Old Stock inteira aprendeu o seu nome. Tô orgulhoso!','abre os braços']]
});
const PODIUM_OPENING='Pobre Piloto, PÓDIO! {Lugar} lugar! Eu tive que perguntar duas vezes pro cronometrista se não era engano!';
// Kléber's talk for a conquest (KLEBER_LINES, FIRST_LINES) as line cards, Stevan in what he wears then.
export const kleberCards=(career,id,lines=KLEBER_LINES[id],act='parabens')=>(lines??[]).map((line,i)=>({...lineCard(line,id,act,i),outfit:outfitOf(career)}));
// The race's first podium or first win, once per career (career.firsts), before the report's cards; a first podium
// below sixth opens with its own place.
export function firstsCards(career){
 const r=career.report,kind=r?.outcome==='vitoria'?'vitoria':r?.outcome==='podio'?'podio':null;
 if(!kind||career.firsts.includes(kind))return [];
 for(const k of kind==='vitoria'?['podio','vitoria']:['podio'])if(!career.firsts.includes(k))career.firsts.push(k);
 const place=PODIUM_PLACES[r.position]??'',lines=FIRST_LINES[kind].map((line,i)=>kind==='podio'&&i===0&&r.position!==6&&place?[line[0],PODIUM_OPENING.replace('{Lugar}',place[0].toUpperCase()+place.slice(1)),line[2]]:line);
 return kleberCards(career,kind,lines,'podio');
}
export const MISSED_LINES=Object.freeze({
 macacao:[['kleber','O prazo acabou, Pobre Piloto. Cadê o seu macacão?'],['pilot','Ainda não deu, senhor Kléber Eletric... A grana não fechou.','sem graça'],['kleber','Fica com ele por enquanto. Mas agora não tem mais prazo: o paddock inteiro já está comentando.']]
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
// FORGIVE_AFTER races in a row above it and it starts again from zero, her patience drawn anew (Central #18).
// Her patience spent (Central #18, Stevan's answers in #18.2), she still lets go a race whose morale did not fall from
// where it was before it ('relent'); the first that falls ends it. Never on the first race back at 50% or less after
// one above: then she gives an ultimatum and the next fall is the end. last: her morale after the last race; mood: what
// that race was ('relent', 'ultimatum' or null). before: her morale before this race.
export const DIVORCE_BANDS=Object.freeze([[40,4,5],[30,3,4],[20,2,3],[10,1,2]]);
export const DIVORCE_LINE=50,FORGIVE_AFTER=3;
export const newClock=()=>({progress:0,calm:0,patience:null,last:null,mood:null});
export function divorceStep(career,random=Math.random,before=career.clock.last){
 if(career.divorced)return false;const m=career.morale.esposa,c=career.clock,was=c.last;c.last=m;c.mood=null;
 if(m>DIVORCE_LINE){if(c.progress>0&&++c.calm>=FORGIVE_AFTER)Object.assign(c,newClock(),{last:m});return false;}
 c.calm=0;
 if(m<DIVORCE_BANDS.at(-1)[0])c.progress=1;
 else{if(c.patience===null)c.patience=random();const [,few,more]=DIVORCE_BANDS.find(([low])=>m>=low);c.progress=Math.min(1,c.progress+1/(c.patience<.5?few:more));}
 if(c.progress<1-1e-9)return false;
 c.progress=1;
 if(was!==null&&was>DIVORCE_LINE){c.mood='ultimatum';return false;}
 if(before!==null&&m>=before){c.mood='relent';return false;}
 return true;
}
// How the wife's card tells her patience: running out by thirds, spent but letting this race go, the ultimatum, or
// another chance above 50%.
export const patienceOf=clock=>!clock||clock.progress<=0?null:clock.mood?{[clock.mood]:true}:clock.calm>0?{chance:FORGIVE_AFTER-clock.calm}:{stage:clock.progress<1/3?0:clock.progress<2/3?1:2};
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

// blazerAt: the race count when the Blazer came out (null before); opala: the Opala 99 bought (Central #16); firsts: the
// first podium and first win Kléber already came for ('podio', 'vitoria').
// The hero's energy (user, 10-24): full at a career's start, a race takes ENERGY.race, the Tia's café gives it back — a
// coffee or a pão de queijo ENERGY.one each, both in the same paddock fill it (he is mineiro), a doce de leite ENERGY.sweet.
export const ENERGY=Object.freeze({start:100,race:60,one:30,sweet:15});
export function eatEnergy(energy,id,eaten){
 const both=['cafe','pao'].every(item=>item===id||eaten.includes(item));
 return clamp(both?100:energy+(id==='doce'?ENERGY.sweet:ENERGY.one),0,100);
}
// late: the race whose deadline the current challenge missed (Central #22; null on time); lines: the late line each bar
// showed last.
export const newCareer=()=>({version:1,energy:ENERGY.start,morale:Object.fromEntries(MORALE.map(k=>[k,MORALE_START])),races:0,challenge:0,since:0,late:null,lines:{},expense:false,gear:[],intro:false,report:null,over:null,clock:newClock(),divorced:null,pensionFor:null,blazerAt:null,opala:false,firsts:[],car:null});
// A saved career, checked field by field; anything unknown starts a new one.
export function loadCareer(raw){
 const c=newCareer();if(!raw||typeof raw!=='object'||raw.version!==1)return c;
 const count=v=>Number.isInteger(v)&&v>=0?v:0;
 for(const k of MORALE)if(Number.isFinite(raw.morale?.[k]))c.morale[k]=clamp(Math.round(raw.morale[k]),0,100);
 c.races=count(raw.races);c.challenge=Math.min(count(raw.challenge),CHALLENGES.length);c.since=Math.min(count(raw.since),c.races);c.expense=raw.expense===true;c.intro=raw.intro===true;
 c.gear=Array.isArray(raw.gear)?CHALLENGES.slice(0,c.challenge).map(ch=>ch.id):[];
 if(raw.report&&typeof raw.report==='object'&&Object.hasOwn(OUTCOME_TITLES,raw.report.outcome)&&MORALE.every(k=>Number.isFinite(raw.report.before?.[k])))
  c.report={race:count(raw.report.race),outcome:raw.report.outcome,position:Number.isInteger(raw.report.position)&&raw.report.position>0?raw.report.position:null,before:Object.fromEntries(MORALE.map(k=>[k,clamp(Math.round(raw.report.before[k]),0,100)])),awaiting:raw.report.awaiting==='expense'?'expense':null,
   ...(['damage','bill','charged'].every(k=>Number.isInteger(raw.report.repair?.[k])&&raw.report.repair[k]>=0)?{repair:{damage:raw.report.repair.damage,bill:raw.report.repair.bill,charged:raw.report.repair.charged,
    ...(Number.isInteger(raw.report.repair.next)&&raw.report.repair.next>=0&&raw.report.repair.next<=100?{next:raw.report.repair.next,free:raw.report.repair.free===true}:{})}}:{})};
 c.over=Object.hasOwn(GAME_OVER,raw.over)?raw.over:null;
 c.energy=Number.isFinite(raw.energy)?clamp(Math.round(raw.energy),0,100):ENERGY.start;
 // The divorce (Central #15): the clock, the divorce itself and the race whose pension is paid.
 const share=v=>Number.isFinite(v)&&v>=0&&v<=1,clockOf=k=>k&&share(k.progress)?{progress:k.progress,calm:Math.min(count(k.calm),FORGIVE_AFTER),patience:share(k.patience)?k.patience:null,
  last:Number.isFinite(k.last)?clamp(Math.round(k.last),0,100):null,mood:['relent','ultimatum'].includes(k.mood)?k.mood:null}:null;
 c.clock=clockOf(raw.clock)??newClock();
 // A late challenge (Central #22) and the late lines last shown; a career from before it is on time.
 const late=CHALLENGES[c.challenge];c.late=late&&Number.isInteger(raw.late)&&raw.late>=c.since+late.races&&raw.late<=c.races?raw.late:null;
 const linesOf=(group,v)=>group&&v&&typeof v==='object'?Object.fromEntries(Object.entries(LATE[group].bars).filter(([k,list])=>Number.isInteger(v[k])&&v[k]>=0&&v[k]<list.length).map(([k])=>[k,v[k]])):{};
 c.lines=c.late===null?{}:linesOf(late.group,raw.lines);
 if(raw.divorced&&Number.isInteger(raw.divorced.race)&&Number.isFinite(raw.divorced.taken)&&raw.divorced.taken>=0)c.divorced={race:Math.min(count(raw.divorced.race),c.races),taken:raw.divorced.taken};
 c.pensionFor=Number.isInteger(raw.pensionFor)&&raw.pensionFor>=0&&raw.pensionFor<=c.races?raw.pensionFor:null;
 // The Blazer out and the Opala 99 bought (Central #16); a career from before them has neither.
 c.blazerAt=Number.isInteger(raw.blazerAt)&&raw.blazerAt>=0&&raw.blazerAt<=c.races?raw.blazerAt:null;c.opala=raw.opala===true&&c.challenge===CHALLENGES.length;
 // The firsts Kléber came for (firstsCards); a career from before them has none.
 c.firsts=Array.isArray(raw.firsts)?['podio','vitoria'].filter(k=>raw.firsts.includes(k)):[];
 // The damage the money did not fix (repairCar); a career from before it has a car as new.
 if(raw.car&&typeof raw.car==='object')c.car=repairCar(Object.fromEntries(CAR_PARTS.map(({id})=>[id,Number.isFinite(raw.car[id])?raw.car[id]:1])),{bill:1,charged:0}).car;
 if(c.report){const r=raw.report;for(const k of ['clock','clockBefore']){const v=clockOf(r[k]);if(v)c.report[k]=v;}
  if(c.divorced&&Number.isFinite(r.divorce?.taken))c.report.divorce={taken:r.divorce.taken};c.report.divorceDue=r.divorceDue===true&&!c.divorced;
  const lateRace=CHALLENGES.find(ch=>ch.id===r.late?.challenge),lines=lateRace&&linesOf(lateRace.group,r.late.lines);
  if(lines&&Object.keys(lines).length)c.report.late={challenge:lateRace.id,lines};}
 return c;
}
const shift=(career,changes)=>{for(const [k,d] of Object.entries(changes))career.morale[k]=clamp(career.morale[k]+d,0,100);};
// The morale cards of a report: what each bar went through, from where it was before the race.
// After a divorce the wife's card is gone (her bar stays where it was); hers carries her patience (patienceOf).
// A race run with the challenge late (report.late, Central #22): a bar waiting for it loses LATE's step whatever the race
// brought, its gain gone and its loss kept (then the race's own line stays, above the late one).
export function moraleCards(career){
 const r=career.report;if(!r)return [];
 const table=MORALE_CARDS[r.race<=EARLY_RACES?'early':'late'][r.outcome],gone=career.divorced&&career.divorced.race<r.race,late=r.late&&CHALLENGES.find(c=>c.id===r.late.challenge);
 return MORALE.map((key,i)=>{
  const [text,raced]=table[i],index=late?r.late.lines[key]:undefined,line=index===undefined?null:lateLine(late,key,index),delta=line===null?raced:Math.min(raced,0)-LATE[late.group].step;
  return {type:'morale',key,text:line===null||raced<0?text:'',delta,before:r.before[key],value:clamp(r.before[key]+delta,0,100),outcome:r.outcome,race:r.race,...(line===null?{}:{late:line,challenge:late.id}),
   ...(key==='esposa'?{patience:patienceOf(r.clock),divorced:!!r.divorce}:{})};
 }).filter(card=>!(gone&&card.key==='esposa'));
}
// The repair bill's card, after the supporters' morale card (none on a report from before the bill).
export const repairCards=(report,wallet)=>report?.repair?[{type:'repair',...report.repair,fund:wallet.fund}]:[];
// The race is paid: one more race in the career, the morale moved by its outcome, and a report
// waiting to be shown (openReport). The challenge is looked at when the report is shown.
// repair: the team's bill already taken from the wallet (repairBill).
// Raced with the challenge late (Central #22): each bar waiting for it draws one of its lines, never the one it showed last.
// The wife's clock steps with her new morale (divorceDue: the state takes half of the wallet, divorce()).
export function applyRace(career,result,repair=null,random=Math.random){
 career.races++;const outcome=outcomeOf(result),before={...career.morale};career.energy=Math.max(0,(career.energy??ENERGY.start)-ENERGY.race);
 career.report={race:career.races,outcome,position:outcome==='guincho'?null:result.position,before,awaiting:null,...(repair?{repair}:{}),clockBefore:{...career.clock}};
 const late=lateChallenge(career),lines={};
 for(const bar of late?lateBars(late,career):[]){
  const count=LATE[late.group].bars[bar].length,last=career.lines[bar];let i=Math.floor(random()*(last===undefined?count:count-1));if(last!==undefined&&i>=last)i++;
  lines[bar]=career.lines[bar]=Math.min(i,count-1);
 }
 if(Object.keys(lines).length)career.report.late={challenge:late.id,lines};
 for(const card of moraleCards(career))career.morale[card.key]=card.value;
 career.report.divorceDue=divorceStep(career,random,before.esposa);career.report.clock={...career.clock};
 return career.report;
}
// The judge disqualified a car already paid (taken to the box before the inspection): the report not
// yet shown counts as towed in.
export function reviseRace(career,result){
 const r=career.report;if(!r||r.awaiting)return false;
 career.morale={...r.before};r.outcome=outcomeOf(result);r.position=r.outcome==='guincho'?null:result.position;for(const card of moraleCards(career))career.morale[card.key]=card.value;
 // The wife's clock steps again from where it was before the race, her patience as drawn.
 if(!career.divorced&&r.clockBefore){const patience=career.clock.patience;career.clock={...r.clockBefore};r.divorceDue=divorceStep(career,()=>patience??Math.random(),r.before.esposa);r.clock={...career.clock};}
 return true;
}
// The challenge after a race (or after the wife's expense was answered), applied at once:
// wallet: the profile with fund (the wallet) and released (the Blazer). Returns its cards.
export function challengeCards(career,wallet){
 const stage=stageOf(career,wallet.released);
 if(stage.kind!=='challenge')return [dreamCard(stage,wallet)];
 const c=stage.challenge;
 // Her trip after a divorce: no wife, no trip; the next challenge starts at once.
 const next=()=>{career.challenge++;career.since=career.races;career.late=null;career.lines={};career.expense=false;};
 if(c.wife&&career.divorced){next();return [{type:'skipped',challenge:c.id,fund:wallet.fund},nextCard(career,wallet)];}
 if(wallet.fund>=c.goal&&c.expense&&!career.expense&&!career.divorced){if(career.report)career.report.awaiting='expense';return [{type:'expense',challenge:c.id,value:expenseFor(c,career),fund:wallet.fund}];}
 if(wallet.fund>=c.goal){
  wallet.fund-=c.goal;career.gear.push(c.id);next();if(c.morale)shift(career,c.morale);
  const act=DONE_ACTS[c.id]??'done',lines=[...(DONE_LINES[c.id]??[]).map((line,i)=>({...lineCard(line,c.id,act,i),...(act==='done'?{}:{outfit:outfitOf(career)})})),...kleberCards(career,c.id)];
  return [...lines,{type:'done',challenge:c.id,fund:wallet.fund,morale:{...career.morale}},nextCard(career,wallet)];
 }
 // The deadline ends without the money (Central #22): no new one. Whoever waited loses LATE's deadline points now, with
 // the first of their lines, and a step every race until it is bought (applyRace).
 const ran=career.races-career.since;
 if(career.late===null&&ran>=c.races){
  const bars=lateBars(c,career),changes=Object.fromEntries(bars.map(k=>[k,-LATE[c.group].deadline]));shift(career,changes);career.late=career.races;career.lines=Object.fromEntries(bars.map(k=>[k,0]));
  return [...(MISSED_LINES[c.id]??[]).map((line,i)=>lineCard(line,c.id,'missed',i)),{type:'missed',challenge:c.id,changes,lines:bars.map(k=>lateLine(c,k,0)),bars,step:LATE[c.group].step,morale:{...career.morale},fund:wallet.fund}];
 }
 return [{type:'challenge',challenge:c.id,fund:wallet.fund,...(career.late===null?{left:c.races-ran}:{late:career.races-career.late})}];
}
// The Blazer out of the workshop (ImmersiveState.releaseBlazer): the next challenge's deadline starts from this race.
export function releaseBlazer(career,wallet){
 if(stageOf(career,wallet.released).kind!=='blazer'||wallet.fund<BLAZER_GOAL)return null;
 wallet.fund-=BLAZER_GOAL;wallet.released=true;career.blazerAt=career.races;career.since=career.races;career.expense=false;
 return [...kleberCards(career,'blazer'),{type:'dream',dream:'blazer',goal:BLAZER_GOAL,fund:wallet.fund,done:true},nextCard(career,wallet)];
}
// The Opala 99 bought from the team (ImmersiveState.buyOpala), after the last challenge.
export function buyOpala(career,wallet){
 const s=stageOf(career,wallet.released);if(s.kind!=='opala'||s.done||wallet.fund<OPALA_GOAL)return null;
 wallet.fund-=OPALA_GOAL;career.opala=true;
 return [...kleberCards(career,'opala'),{type:'owned',goal:OPALA_GOAL,fund:wallet.fund}];
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
