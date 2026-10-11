// Modo História career: the wallet, three morale bars (wife, team, supporters), the equipment
// challenges with the wife's expenses, and the Blazer as the final dream, from race to race of
// the Old Stock season. Pure rules, no DOM: ImmersiveState keeps the career in the story profile
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
export const ENTRY=Object.freeze({home:100,away:150});
export const entryFor=circuit=>circuit==='interlagos'?ENTRY.home:ENTRY.away;
// Each time the tow strap gets under a wheel, untangling it is paid from the wallet.
export const SNAG_COST=25;
// The wife's expenses cost 1.5x the standard at 0% and 0.5x at 100%; a knock damages the car on
// the same scale with the team; the supporters' gifts go the other way round.
export const expenseScale=morale=>1.5-clamp(morale,0,100)/100;
export const giftScale=morale=>.5+clamp(morale,0,100)/100;
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
// The equipment the pilot races in on loan, bought one challenge at a time before the deadline
// (in races). When the money is there, the wife asks for an expense first (expense.value at 50%).
export const CHALLENGES=Object.freeze([
 {id:'macacao',title:'Juntar dinheiro para comprar seu macacão',own:'seu macacão',goal:1000,races:3,loan:'o macacão que o Kléber Eletric emprestou',done:'Macacão vermelho novinho, só seu. O emprestado volta para o Kléber.',missed:'O Kléber empresta o macacão por mais um prazo.',
  expense:{what:'o aniversário da filha',ask:'Amor, o aniversário da nossa filha é no fim de semana. Preciso do dinheiro da festa.'}},
 {id:'luvas',title:'Juntar dinheiro para comprar suas luvas',own:'suas luvas',goal:300,races:2,loan:'as luvas que a equipe 99 emprestou',done:'Luvas novas, só suas. Nada mais de luva emprestada.',missed:'A equipe 99 empresta as luvas por mais um prazo, mas ficou desconfiada.',
  expense:{what:'a conta de luz atrasada',ask:'A conta de luz venceu e vão cortar a energia. Tem que pagar hoje.'}},
 {id:'sapatilhas',title:'Juntar dinheiro para comprar suas sapatilhas',own:'suas sapatilhas',goal:400,races:2,loan:'as sapatilhas que a equipe 99 emprestou',done:'Sapatilhas novas: agora o pé sente o pedal.',missed:'A equipe 99 empresta as sapatilhas por mais um prazo, mas ficou desconfiada.',
  expense:{what:'o material escolar da filha',ask:'A escola mandou a lista de material. A menina não pode ficar sem.'}},
 {id:'capacete',title:'Juntar dinheiro para comprar seu capacete',own:'seu capacete',goal:1200,races:3,loan:'o capacete que a equipe 99 emprestou',done:'Capacete novo, do seu tamanho. O kit de piloto está completo!',missed:'A equipe 99 empresta o capacete por mais um prazo, mas ficou desconfiada.',
  expense:{what:'a geladeira que quebrou',ask:'A geladeira parou de vez e a comida vai estragar. Precisamos de outra.'}}
].map((c,i)=>Object.freeze({...c,number:i+1,expense:Object.freeze({...c.expense,value:[300,120,150,400][i]})})));
// After the equipment, the dream that started it all: the Blazer out of the workshop.
export const BLAZER_GOAL=900;
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
 macacao:[['pilot','Muito obrigado pelo macacão, senhor Kléber Eletric. Graças a ele pude começar no automobilismo.','entrega a bolsa'],['kleber','Não há de quê, Pobre Piloto. Parabéns pela conquista do seu primeiro macacão. Tomara que ele te dê sorte e traga muitas vitórias.','pega a bolsa']]
});
export const MISSED_LINES=Object.freeze({
 macacao:[['kleber','O prazo acabou, Pobre Piloto. Cadê o seu macacão?'],['pilot','Ainda não deu, senhor Kléber Eletric... A grana não fechou.','sem graça'],['kleber','Tudo bem, empresto mais um pouco. Mas não demora: a equipe já está comentando.']]
});
// The end of the story, by what ran out first.
export const GAME_OVER=Object.freeze({
 esposa:'Sua esposa deu o ultimato: ou ela, ou as corridas. Você pendurou o capacete.',
 equipe:'A equipe 99 cansou de consertar o carro e foi atrás de outro piloto.',
 torcida:'A torcida virou as costas. Sem vaquinha, não tem corrida.',
 dinheiro:'Nem com a torcida toda dá para pagar a inscrição. Fim da linha.'
});

export const newCareer=()=>({version:1,morale:Object.fromEntries(MORALE.map(k=>[k,MORALE_START])),races:0,challenge:0,since:0,expense:false,gear:[],intro:false,report:null,over:null});
// A saved career, checked field by field; anything unknown starts a new one.
export function loadCareer(raw){
 const c=newCareer();if(!raw||typeof raw!=='object'||raw.version!==1)return c;
 const count=v=>Number.isInteger(v)&&v>=0?v:0;
 for(const k of MORALE)if(Number.isFinite(raw.morale?.[k]))c.morale[k]=clamp(Math.round(raw.morale[k]),0,100);
 c.races=count(raw.races);c.challenge=Math.min(count(raw.challenge),CHALLENGES.length);c.since=Math.min(count(raw.since),c.races);c.expense=raw.expense===true;c.intro=raw.intro===true;
 c.gear=Array.isArray(raw.gear)?CHALLENGES.slice(0,c.challenge).map(ch=>ch.id):[];
 if(raw.report&&typeof raw.report==='object'&&Object.hasOwn(OUTCOME_TITLES,raw.report.outcome)&&MORALE.every(k=>Number.isFinite(raw.report.before?.[k])))
  c.report={race:count(raw.report.race),outcome:raw.report.outcome,before:Object.fromEntries(MORALE.map(k=>[k,clamp(Math.round(raw.report.before[k]),0,100)])),awaiting:raw.report.awaiting==='expense'?'expense':null};
 c.over=Object.hasOwn(GAME_OVER,raw.over)?raw.over:null;
 return c;
}
const shift=(career,changes)=>{for(const [k,d] of Object.entries(changes))career.morale[k]=clamp(career.morale[k]+d,0,100);};
// The morale cards of a report: what each bar went through, from where it was before the race.
export function moraleCards(career){
 const r=career.report;if(!r)return [];
 const table=MORALE_CARDS[r.race<=EARLY_RACES?'early':'late'][r.outcome];
 return MORALE.map((key,i)=>({type:'morale',key,text:table[i][0],delta:table[i][1],before:r.before[key],value:clamp(r.before[key]+table[i][1],0,100),outcome:r.outcome,race:r.race}));
}
// The race is paid: one more race in the career, the morale moved by its outcome, and a report
// waiting to be shown (openReport). The challenge is looked at when the report is shown.
export function applyRace(career,result){
 career.races++;const outcome=outcomeOf(result),before={...career.morale};
 career.report={race:career.races,outcome,before,awaiting:null};
 for(const card of moraleCards(career))career.morale[card.key]=card.value;
 return career.report;
}
// The judge disqualified a car already paid (taken to the box before the inspection): the report not
// yet shown counts as towed in.
export function reviseRace(career,result){
 const r=career.report;if(!r||r.awaiting)return false;
 career.morale={...r.before};r.outcome=outcomeOf(result);for(const card of moraleCards(career))career.morale[card.key]=card.value;return true;
}
// The challenge after a race (or after the wife's expense was answered), applied at once:
// wallet: the profile with fund (the wallet) and released (the Blazer). Returns its cards.
export function challengeCards(career,wallet){
 const c=CHALLENGES[career.challenge];
 if(!c)return [{type:'dream',goal:BLAZER_GOAL,fund:wallet.fund,released:!!wallet.released}];
 if(wallet.fund>=c.goal&&!career.expense){if(career.report)career.report.awaiting='expense';return [{type:'expense',challenge:c.id,value:expenseFor(c,career),fund:wallet.fund}];}
 if(wallet.fund>=c.goal){
  wallet.fund-=c.goal;career.gear.push(c.id);career.challenge++;career.since=career.races;career.expense=false;
  const next=CHALLENGES[career.challenge];
  return [...(DONE_LINES[c.id]??[]).map((line,i)=>lineCard(line,c.id,'done',i)),{type:'done',challenge:c.id,fund:wallet.fund},next?{type:'challenge',challenge:next.id,fund:wallet.fund,left:next.races,fresh:true}:{type:'dream',goal:BLAZER_GOAL,fund:wallet.fund,released:!!wallet.released,fresh:true}];
 }
 const ran=career.races-career.since;
 if(ran>=c.races){
  shift(career,MISSED);career.since=career.races;
  return [...(MISSED_LINES[c.id]??[]).map((line,i)=>lineCard(line,c.id,'missed',i)),{type:'missed',challenge:c.id,changes:MISSED,morale:{...career.morale},left:c.races,fund:wallet.fund}];
 }
 return [{type:'challenge',challenge:c.id,fund:wallet.fund,left:c.races-ran}];
}
// A line of Kléber's box (story-scene.js stages it): act 'intro', 'done' or 'missed', its place in the talk.
export const lineCard=([who,text,how],scene,act=scene,index=0)=>({type:'line',who,text,how:how??'',scene,act,index});
// What the pilot wears: street clothes until Kléber lends his overalls, those until his own are bought.
export const outfitOf=career=>!career.intro?'civil':career.gear.includes('macacao')?'proprio':'emprestado';
// The wife's expense answered: paid from the wallet (as much as there is), or refused (her morale
// drops). Either way she asks once per challenge; then the challenge goes on (challengeCards).
export function answerExpense(career,wallet,pay){
 const c=CHALLENGES[career.challenge];if(!c||career.expense||!career.report?.awaiting)return null;
 const value=expenseFor(c,career);
 if(pay)wallet.fund=Math.max(0,wallet.fund-value);else shift(career,REFUSED);
 career.expense=true;career.report.awaiting=null;
 return [{type:'answer',challenge:c.id,paid:!!pay,value,fund:wallet.fund,morale:career.morale.esposa},...challengeCards(career,wallet)];
}
// The first bar to reach zero ends the story.
export const overReason=career=>MORALE.find(k=>career.morale[k]<=0)??null;
