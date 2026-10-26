import {GRID_SIZE} from './race-roster.js';
import {TANK,burnRate} from './fuel.js';
import {fanCount,eatEnergy,vaquinhaWhole,repairCar,evenCar,carHealth,carPoints,loadCareer,newCareer,applyRace,reviseRace,firstsCards,moraleCards,repairBill,repairPerPoint,repairCards,divorce,divorceCards,pensionCards,challengeCards,answerExpense,releaseBlazer as blazerOut,buyOpala as opalaBought,overReason,lineCard,prizeFor,expenseScale,SNAG_COST,INTRO_LINES,CHALLENGES,BLAZER_AFTER,BLAZER_GOAL} from './story-career.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const FANS=[
 {name:'Dona Cida',taste:'família',hint:'Vim com os netos. Adoro uma história de família.',gift:42},
 {name:'Seu Toninho',taste:'oficina',hint:'Sou mecânico. Pode falar de carro quebrado!',gift:38},
 {name:'Bia da arquibancada',taste:'corrida',hint:'Quero uma piada de piloto!',gift:46},
 {name:'Pai do churrasco',taste:'família',hint:'Se tem boleto e criança no meio, eu entendo.',gift:40},
 {name:'Nando da graxa',taste:'oficina',hint:'Meu habitat é debaixo de um capô.',gift:44},
 {name:'Léo do radinho',taste:'corrida',hint:'Não perco uma chegada de corrida.',gift:36},
 // More come as the supporters warm to the team (story-career.js fanCount: the first six at 50%, all ten at 100%), the
 // last ones first to stay home when it cools.
 {name:'Tia do isopor',taste:'família',hint:'Trouxe o isopor e a família inteira.',gift:39},
 {name:'Vô Bené',taste:'oficina',hint:'Já desmontei muito Opala nessa vida.',gift:43},
 {name:'Juninho do kart',taste:'corrida',hint:'Um dia ainda corro de Opala também!',gift:37},
 {name:'Mari do megafone',taste:'corrida',hint:'Grito mais alto que o motor. Me faz rir!',gift:41}
];
// The vaquinha's whole at 50% morale in a race of up to 8 laps: what the first six supporters give (ImmersiveState gift).
const VAQUINHA=FANS.slice(0,6).reduce((sum,f)=>sum+f.gift,0);
export const JOKES=[
 {topic:'família',text:'Lá em casa eu sou o piloto. Minha esposa escolhe o destino, a filha escolhe a música e o boleto pisa no acelerador.'},
 {topic:'oficina',text:'Minha Blazer está há tanto tempo na oficina que o mecânico já colocou ela como dependente.'},
 {topic:'corrida',text:'Meu carro faz de zero a cem em três segundos. Zero de dinheiro a cem de preocupação.'}
];
export const BLAZER_COST=BLAZER_GOAL;
// What a start costs: the entry (Interlagos'; elsewhere story-career.js entryFor, state.entry), the
// litre of fuel, the windscreen film, and the least that opens the fuel purchase on the grid (the
// entry and four litres).
export const COSTS=Object.freeze({entry:100,litre:6.5,film:30,minimum:126,leastLitres:4});
export const startCost=(litres,film,entry=COSTS.entry)=>entry+litres*COSTS.litre+(film?COSTS.film:0);
// Engine start: the throttle band where it catches (low to high), how long it must crank
// there (longer with wet plugs), the throttle above which it floods, and the battery's
// cranking time, which does not come back between tries. wet: how the plugs get soaked
// (level 1 floods the engine): each push of the pedal without cranking squirts fuel (per
// full push), cranking over the flood mark or in the high band soaks them (per second),
// cranking in or under the band clears them and they dry slowly otherwise.
export const START=Object.freeze({low:.22,high:.65,flood:.8,catchTime:.72,battery:4,wet:Object.freeze({pump:.3,rich:1.5,high:.25,clear:.2,dry:.02})});
export class ImmersiveState {
 // profile: the wallet (fund), the Blazer (released), the races run and the career (story-career.js).
 // A profile from before the career keeps its race count; its savings and Blazer start over with it.
 // A Blazer taken out before the challenges after it (Central #16): the next one's deadline starts now.
 constructor(profile={}){profile=profile&&typeof profile==='object'?profile:{};const counter=v=>Number.isFinite(v)&&v>=0?Math.min(v,Number.MAX_SAFE_INTEGER):0,career=!!profile.career;this.profile={fund:career?counter(profile.fund):0,released:career&&profile.released===true,races:Math.floor(counter(profile.races)),career:loadCareer(profile.career)};this.entry=COSTS.entry;this.tank=TANK;this.raceFuel=this.baseFuel=null;this.scene=null;this.active=false;this.phase='off';this.revision=0;this.sounds=[];
  const c=this.profile.career;if(this.profile.released&&c.blazerAt===null){c.blazerAt=c.races;if(c.challenge===BLAZER_AFTER)c.since=c.races;}}
 emitSound(name,options={}){if(this.sounds.length<64)this.sounds.push({name,options});}
 takeSounds(){return this.sounds.splice(0);}
 touch(){this.revision++;}
 start(){
  this.sounds=[];this.emitSound('crowdWelcome');
  Object.assign(this,{active:true,phase:'crowd',cash:0,raised:0,eaten:[],donors:[],fan:null,desk:false,leo:null,coffee:false,cafe:false,feedback:'',fuel:0,tankDetached:false,tankWear:0,health:carHealth(this.profile.career.car),glass:0,film:false,
   pressure:0,crank:0,flood:0,battery:1,ignitionGood:0,starter:false,ignOn:false,raceTime:0,position:GRID_SIZE,result:null,reason:'',towSnags:0,snagCost:0,repair:null,inspection:0,judging:false,inspected:false,paid:false,prize:0,savedCash:0,podiumPlace:null,disqualifiedTime:0,alert:'',alertTime:0,scene:null});
  // Before the paddock: the last race's report not seen yet, Kléber's welcome, or the end of the story; after a
  // divorce, the pension of this race (round: its championship round, ImmersiveMode.start) before the vaquinha.
  const cards=this.careerCards(),pension=cards?.kind==='over'?[]:pensionCards(this.profile.career,this.profile,this.round??null);
  if(cards)this.openScene(cards.kind,[...cards.cards,...pension]);else if(pension.length)this.openScene('pension',pension);else this.checkMoney();this.touch();
 }
 disable(){this.sounds=[];this.active=false;this.phase='off';this.scene=null;this.touch();}
 // The least that opens the registration here, and what each supporter gives (by their morale).
 get minimum(){return this.entry+COSTS.leastLitres*COSTS.litre;}
 // The whole race's costs: the entry and the litres the team recommends for it (raceFuel, set by ImmersiveMode.start from the
 // circuit and the laps; baseFuel: the same for 8 laps), a refill at the Box 99 included; without them, the minimum.
 get raceCost(){return Math.ceil(this.entry+(this.raceFuel??COSTS.leastLitres)*COSTS.litre-1e-9);}
 // The vaquinha as a whole (story-career.js vaquinhaWhole): at least the race's costs, more with the supporters' morale.
 vaquinha(){return vaquinhaWhole(this.profile.career.morale.torcida,{base:VAQUINHA,floor:this.raceCost,extra:Math.max(0,(this.raceFuel??0)-(this.baseFuel??this.raceFuel??0))*COSTS.litre});}
 // A supporter's gift: their share of the vaquinha, whoever came: more supporters share it (each a little less), fewer
 // split it (each a little more). Rounded up, so the gifts never sum to less than the whole.
 gift(index){const present=FANS.slice(0,Math.min(FANS.length,this.present)).reduce((sum,f)=>sum+f.gift,0);return Math.ceil(FANS[index].gift*this.vaquinha()/present-1e-9);}
 // The supporters in the paddock this race: the first of FANS, as many as the supporters' morale brings (fanCount).
 get present(){return fanCount(this.profile.career.morale.torcida);}
 here(index){return Number.isInteger(index)&&index>=0&&index<Math.min(FANS.length,this.present);}
 // A snack finished at the Tia's café: the hero's energy goes up (story-career.js eatEnergy); gives what it rose by.
 eat(id){const c=this.profile.career,before=c.energy;c.energy=eatEnergy(before,id,this.eaten??=[]);this.eaten.push(id);this.touch();return c.energy-before;}
 // How much harder a knock hits the car, by the team's morale (1 at 50%).
 damageScale(){return expenseScale(this.profile.career.morale.equipe);}
 // Career scenes (story-career.js): cards shown one at a time in the paddock before walking, or
 // after the race. kind: 'intro' (Kléber lends his overalls, the first challenge), 'report' (the
 // three morale cards, then the challenge) or 'over' (the end of the story).
 careerCards(){
  const c=this.profile.career;
  if(c.over)return {kind:'over',cards:[{type:'over',reason:c.over}]};
  if(c.report)return {kind:'report',cards:this.reportCards()};
  if(!c.intro)return {kind:'intro',cards:[...INTRO_LINES.map((line,i)=>lineCard(line,'intro','intro',i)),{type:'challenge',challenge:CHALLENGES[0].id,fund:this.profile.fund,left:CHALLENGES[0].races,fresh:true}]};
  return null;
 }
 // The report's cards (a report waiting for the wife's answer shows just her request again): Kléber first for a first
 // podium or win; the challenge is applied here, then the end of the story if a bar reached zero.
 reportCards(){
  const c=this.profile.career,r=c.report,cards=r.awaiting?[]:[...firstsCards(c),...moraleCards(c),...repairCards(r,this.profile),...divorceCards(c,this.profile)];let over=overReason(c);
  if(!over){r.awaiting=null;cards.push(...challengeCards(c,this.profile));over=r.awaiting?null:overReason(c);}
  if(!r.awaiting)c.report=null;if(over){c.over=over;cards.push({type:'over',reason:over});}
  return cards;
 }
 openScene(kind,cards){this.scene={kind,cards,at:0};this.fan=null;this.desk=false;this.leo=null;this.cafe=false;this.feedback='';this.touch();}
 sceneCard(){return this.scene?.cards[this.scene.at]??null;}
 // Avançar: the next card (steps: past a run of cards shown together, immersive-mode.js sceneGroup); the wife's request
 // waits for an answer and the end for a new story. skip: Kléber's lines straight to the challenge.
 advanceScene(skip=false,steps=1){
  const s=this.scene,card=this.sceneCard();if(!card||['expense','over'].includes(card.type))return false;
  if(skip){const next=s.cards.findIndex((c,i)=>i>s.at&&c.type!=='line');s.at=next<0?s.cards.length:next;}else s.at=Math.min(s.cards.length,s.at+Math.max(1,steps));
  this.emitSound(s.cards[s.at]?.type==='line'?'talk':'paper');if(s.at>=s.cards.length)this.closeScene();this.touch();return true;
 }
 answerScene(pay){
  const s=this.scene,c=this.profile.career;if(this.sceneCard()?.type!=='expense')return false;
  const cards=answerExpense(c,this.profile,pay);if(!cards)return false;c.report=null;
  const over=overReason(c);if(over){c.over=over;cards.push({type:'over',reason:over});}
  s.cards.splice(s.at+1,0,...cards);s.at++;this.emitSound(pay?'paper':'denied');this.touch();return true;
 }
 closeScene(){const s=this.scene;if(!s)return;if(s.kind==='intro')this.profile.career.intro=true;this.scene=null;if(this.phase==='crowd')this.checkMoney();this.touch();}
 // In the paddock: when not even every supporter's gift would pay the registration, the story ends.
 reachable(){return this.cash+this.profile.fund+FANS.reduce((sum,fan,i)=>sum+(this.donors.includes(i)||!this.here(i)?0:this.gift(i)),0);}
 checkMoney(){const c=this.profile.career;if(this.phase!=='crowd'||c.over||this.reachable()>=this.minimum)return false;c.over='dinheiro';this.openScene('over',[{type:'over',reason:'dinheiro'}]);return true;}
 // A new story after the end: an empty wallet, the bars at 50%, the overalls on loan again.
 restartCareer(){this.profile.fund=0;this.profile.released=false;this.profile.career=newCareer();this.scene=null;this.touch();}
 // After the disqualification's photo: the report (or the end) of the race, on the paddock's panel.
 afterDisqualified(){if(this.phase!=='disqualified')return false;const cards=this.careerCards();if(!cards||cards.kind==='intro')return false;this.phase='complete';this.openScene(cards.kind,cards.cards);return true;}
 talk(index){if(this.phase!=='crowd'||this.scene||this.desk||this.leo||this.cafe||!this.here(index))return;this.emitSound('talk');this.fan=index;this.feedback='';this.touch();}
 // The registration is made with the team at the computers of its stand on the pit wall:
 // they show the kitty against the costs, and the pilot goes back for more or to the track.
 openDesk(){if(this.phase!=='crowd'||this.scene||this.desk||this.leo||this.cafe)return false;this.emitSound('talk');this.desk=true;this.fan=null;this.feedback='';this.touch();return true;}
 closeDesk(){if(!this.desk)return false;this.desk=false;this.touch();return true;}
 // Leonardo Martins, of the #19, comes over in the paddock and offers a coffee (the Tia's, next
 // door). leo: 'ask' (the question), 'yes' or 'no' (his answer to the pilot's), 'chat' (asked
 // again after one); coffee: the pilot has his cup.
 offerCoffee(){if(this.phase!=='crowd'||this.scene||this.desk||this.fan!==null||this.leo||this.cafe)return false;this.emitSound('talk');this.leo=this.coffee?'chat':'ask';this.touch();return true;}
 answerCoffee(yes){if(this.leo!=='ask')return false;this.leo=yes?'yes':'no';if(yes){this.coffee=true;this.emitSound('pitCoffee');}else this.emitSound('talk');this.touch();return true;}
 closeCoffee(){if(!this.leo)return false;this.leo=null;this.touch();return true;}
 // The Tia's menu at her café counter, as during a pit stop (pitstop.js snacks): one more
 // conversation, so it waits for the others and they wait for it.
 openCafe(){if(this.phase!=='crowd'||this.scene||this.desk||this.fan!==null||this.leo||this.cafe)return false;this.emitSound('paper');this.cafe=true;this.touch();return true;}
 closeCafe(){if(!this.cafe)return false;this.cafe=false;this.touch();return true;}
 // What the kitty and the wallet may spend on a snack: before the registration, never what the
 // race's entry and gasoline still need (raceCost), counting the gifts of the supporters who have
 // not given yet (each gives once, whenever they laugh).
 spareCash(){const coming=FANS.reduce((sum,fan,i)=>sum+(this.donors.includes(i)||!this.here(i)?0:this.gift(i)),0),reserve=this.phase==='crowd'?Math.max(0,this.raceCost-coming):0;return clamp(this.cash+this.profile.fund-reserve,0,this.cash+this.profile.fund);}
 // A snack in the paddock is paid as at the pit stop: from the kitty first, then from the wallet.
 pay(cost){if(!Number.isFinite(cost)||cost<0||cost>this.spareCash()+.001)return false;const cash=Math.min(this.cash,cost);this.cash-=cash;this.profile.fund=Math.max(0,this.profile.fund-(cost-cash));this.touch();return true;}
 joke(index){
  if(this.phase!=='crowd'||this.fan===null||!JOKES[index])return false;
  const fan=FANS[this.fan],laughed=fan.taste===JOKES[index].topic;
  this.emitSound(this.donors.includes(this.fan)?'noDonation':laughed?'donation':'badJoke');
  if(this.donors.includes(this.fan))this.feedback=`${fan.name}: “Essa eu já patrocinei! Vai falar com o pessoal ali.”`;
  // A gift goes straight into the wallet (user, 10-24: one sum, no kitty apart); raised counts this race's gifts.
  else if(laughed){const gift=this.gift(this.fan);this.profile.fund+=gift;this.raised+=gift;this.donors.push(this.fan);this.feedback=`${fan.name} caiu na risada! + R$ ${gift} na carteira.`;}
  else this.feedback=`${fan.name}: “Essa não me pegou... tenta outra!”`;
  this.touch();return laughed;
 }
 // At the team's desk the entry, the fuel and the optional windscreen film are paid (the kitty
 // first, then the wallet), and the pilot goes straight to the engine start on the grid (from the
 // registration's minimum up).
 buy(litres,film){
  if(this.phase!=='crowd'||!this.desk)return false;
  litres=clamp(Math.round(Number(litres)||0),2,this.tank);const cost=startCost(litres,film,this.entry),money=this.cash+this.profile.fund;
  if(money<this.minimum||cost>money){this.emitSound('denied');this.feedback=money<this.minimum?'Ainda não fecha a inscrição: volta lá e pede mais um dindin!':'Não cabe tudo isso no dinheiro: tira uns litros ou a proteção.';this.touch();return false;}
  const cash=Math.min(this.cash,cost);this.emitSound('paper');this.cash-=cash;this.profile.fund=Math.max(0,this.profile.fund-(cost-cash));this.fuel=litres;this.film=!!film;this.desk=false;this.feedback='';this.phase='starting';this.emitSound('fuelFill');this.touch();return true;
 }
 // The IGN switch on the overhead bank: without it the starter turns the engine, which never fires.
 switchIgnition(){if(this.phase!=='starting')return false;this.ignOn=!this.ignOn;this.emitSound('click');this.touch();return true;}
 // input.ignition or starter: the PART button held (crank: this try's cranking time).
 // Too much throttle, or pumping the pedal between tries, floods it even without IGN.
 catchTime(){return START.catchTime*(1+2*this.flood);}
 startEngine(input,dt){
  if(this.phase!=='starting')return;
  const before=this.pressure,wet=START.wet;this.pressure=clamp(this.pressure+(input.throttle?.60:-.42)*dt,0,1);
  const cranking=!!(input.ignition||this.starter),p=this.pressure;
  this.flood=Math.max(0,this.flood+(cranking?(p>START.flood?wet.rich:p>START.high?wet.high:-wet.clear)*dt:Math.max(0,p-before)*wet.pump-wet.dry*dt));
  if(this.flood>=1){this.fail('Motor afogado na partida','flooded');return;}
  if(cranking){
   if(!this.crank)this.emitSound('ignition');this.crank+=dt;this.battery=Math.max(0,this.battery-dt/START.battery);
   if(this.ignOn&&p>=START.low&&p<=START.high){this.ignitionGood=(this.ignitionGood||0)+dt;if(this.ignitionGood>this.catchTime()){this.phase='grid';this.countdown=3;this.emitSound('engineCatch');this.emitSound('countdown');this.touch();return;}}
   else this.ignitionGood=0;
   if(this.battery<=0){this.fail('A bateria arriou tentando dar partida','batteryDead');return;}
  }else{this.crank=0;this.ignitionGood=0;}
 }
 startRace(){if(this.phase!=='grid')return;this.emitSound('raceGo');this.phase='race';this.raceTime=0;this.touch();}
 warn(text){this.alert=text;this.alertTime=4;}
 hitDebris(weight=1){if(this.phase!=='race')return;this.glass=clamp(this.glass+(this.film?.23:.42),0,1);this.emitSound(this.glass>=1?'glassBreak':'glassHit',{strength:weight});this.warn('Impacto no para-brisa! Saia de trás do carro da frente.');if(this.glass>=1)this.fail('Para-brisa estilhaçado');}
 hitCar(strength=1){if(this.phase!=='race')return;strength=clamp(strength,.1,1.5);this.emitSound('collision',{strength});this.health=this.condition?this.condition.health:Math.max(0,this.health-.23*strength*this.damageScale());this.warn('Batida! O motor e os suportes sentiram o impacto.');if(this.health<=0)this.fail('O carro quebrou depois da batida');}
 raceStep(sensor,dt){
  if(this.phase!=='race')return;
  this.raceTime+=dt;this.alertTime=Math.max(0,this.alertTime-dt);
  // fuelScale (ImmersiveMode.start, fuel.js): the circuit's lap burns what the 8-lap table gives it.
  const previousFuel=this.fuel;this.fuel=Math.max(0,this.fuel-dt*(burnRate(sensor.speed,sensor.throttle,sensor.wheelspin||0)*(this.fuelScale??1)+(this.tankDetached?.35:0)+(this.condition?.factors.leak??0)));
  if(previousFuel>=1&&this.fuel<1&&this.fuel>0)this.emitSound('reserve');
  const depth=Math.max(0,sensor.offTrack||0);
  if(depth>2.5&&sensor.speed>7)this.tankWear+=dt*(depth-2.5)*.24;
  if(!this.tankDetached&&this.tankWear>=1){this.tankDetached=true;this.condition?.damage('tanque',.75);this.emitSound('tankDrop');this.warn('O suporte cedeu! Tanque arrastando e vazando combustível.');this.touch();}
  this.health=this.condition?this.condition.health:Math.max(0,this.health-dt*(depth>2?depth*sensor.speed*.0008:0)-(this.tankDetached?dt*.018:0));
  if(sensor.collision)this.hitCar();
  if(this.phase!=='race')return;
  if(this.fuel<=0)this.fail(this.tankDetached?'Combustível acabou após o vazamento':'Acabou a gasolina no meio da volta','fuelEmpty');
  else if(this.health<=0)this.fail('O carro quebrou fora da pista');
  else if(sensor.finished)this.finish(sensor.position||GRID_SIZE);
 }
 fail(reason,sound='breakdown'){if(!['race','starting','grid'].includes(this.phase))return;this.emitSound(sound);this.reason=reason;this.result={position:null,status:'Não terminou'};this.phase='broken';this.rescueWait=3;this.touch();}
 beginTow(){this.emitSound('towArrive');this.phase='tow';this.towTime=0;this.towDistance=0;this.towGap=5;this.towSpeed=0;this.truckSpeed=0;this.snagTime=0;this.touch();}
 towStep(input,dt){
  if(this.phase!=='tow')return;
  this.towTime+=dt;
  // The truck slows periodically. The towed car keeps rolling unless braked.
  const cycle=this.towTime%12;this.truckSpeed=cycle>5&&cycle<8?.8:4.8;
  this.towSpeed=Math.max(0,this.towSpeed-dt*(.16+(input.brake?7:0)));
  this.towGap+=(this.truckSpeed-this.towSpeed)*dt;
  if(this.towGap>=5){this.towGap=5;this.towSpeed=this.truckSpeed;}
  this.towGap=Math.max(.5,this.towGap);this.towDistance+=this.truckSpeed*dt;
  this.snagTime=this.towGap<2.2?this.snagTime+dt:0;
  if(this.snagTime>.45){this.emitSound('strapSnag');this.phase='snag';this.towSnags++;this.touch();return;}
  if(this.towDistance>=105)this.podium();
 }
 untangle(){if(this.phase==='snag'){this.emitSound('strapFree');this.phase='tow';this.towGap=5;this.towSpeed=0;this.towTime=Math.ceil(this.towTime/12)*12;this.snagTime=0;this.touch();}}
 finish(position,announce=true){if(this.phase!=='race')return;if(announce)this.emitSound('finish');this.result={position:clamp(position,1,GRID_SIZE),status:'Terminou'};this.podium();}
 leavePodium(){if(this.phase!=='podium')return;this.phase='inspection';this.judging=false;this.touch();}
 requestInspection(){if(this.phase==='inspection'&&!this.judging){this.emitSound('judgeStart');this.judging=true;this.inspection=0;this.touch();}}
 inspectionStep(dt){if(this.phase!=='inspection'||!this.judging)return;const tick=Math.floor(this.inspection/1.4);this.inspection+=dt;if(Math.floor(this.inspection/1.4)>tick)this.emitSound('judgeCheck');if(this.inspection>=8){this.emitSound('judgeApprove');this.inspected=true;this.phase='complete';const cards=this.careerCards();if(cards&&cards.kind!=='intro')this.openScene(cards.kind,cards.cards);this.touch();}}
 goToBox(){if(this.phase!=='inspection'||this.inspected)return;this.emitSound('disqualified');this.result={...this.result,status:'Desclassificado'};this.reason='Levou o carro ao box antes da vistoria do juiz';this.profile.fund=Math.max(0,this.profile.fund-this.prize);this.prize=0;reviseRace(this.profile.career,this.result);this.divorceIfDue();this.phase='disqualified';this.disqualifiedTime=6;this.touch();}
 // The wife's clock ran out with this race (story-career.js divorceStep): she takes half of the wallet now; the
 // report shows the lawyer's visit after the morale cards and the repair bill.
 divorceIfDue(){const c=this.profile.career;if(c.report?.divorceDue&&!c.divorced)divorce(c,this.profile);}
 podium(){
  if(this.paid)return;this.scene=null;
  // The prize by position (story-career.js), what is left in the kitty and the strap untangled: into
  // the wallet; then the team's repair bill out of it, which fixes only the share it paid (repairCar): the
  // rest goes with the car to the next race (career.car; next: its CARRO points then). The race moves the
  // career's morale; its report (the bill's card included) shows after the inspection.
  this.prize=this.result?.status==='Desclassificado'?0:prizeFor(this.result?.position);this.snagCost=this.towSnags*SNAG_COST;this.savedCash=Math.max(0,Number.isFinite(this.cash)?this.cash:0);
  this.profile.fund=Math.max(0,this.profile.fund+this.prize+this.savedCash-this.snagCost);this.repair=repairBill(this.health,this.profile.fund,repairPerPoint(this.profile.career));this.profile.fund-=this.repair.charged;
  const kept=repairCar(this.condition?.quality??evenCar(this.health),this.repair);this.profile.career.car=kept.car;Object.assign(this.repair,{next:carPoints(kept.car),free:kept.free});
  this.cash=0;this.profile.races++;applyRace(this.profile.career,this.result,this.repair);this.divorceIfDue();this.emitSound(this.result?.position===1&&this.result?.status!=='Desclassificado'?'podiumWin':'podiumLoss');this.paid=true;this.phase='podium';this.podiumPlace=6;this.touch();
 }
 // After a race (the summary): the Blazer out of the workshop, then the next challenge's card; at the end of all
 // challenges, the Opala 99 bought from the team (story-career.js).
 releaseBlazer(){if(this.phase!=='complete'||this.scene)return false;const cards=blazerOut(this.profile.career,this.profile);if(!cards)return false;this.emitSound('blazer');this.openScene('blazer',cards);return true;}
 buyOpala(){if(this.phase!=='complete'||this.scene)return false;const cards=opalaBought(this.profile.career,this.profile);if(!cards)return false;this.emitSound('podiumWin');this.openScene('opala',cards);return true;}
 info(){return {active:this.active,phase:this.phase,cash:this.cash,wallet:this.cash+this.profile.fund,energy:this.profile.career.energy,raised:this.raised??0,desk:!!this.desk,fuel:this.fuel,health:this.health,glass:this.glass,tankDetached:this.tankDetached,pressure:this.pressure,ignOn:!!this.ignOn,flood:this.flood,battery:this.battery,
  leo:this.leo,coffee:!!this.coffee,cafe:!!this.cafe,position:this.position,result:this.result,reason:this.reason,towGap:this.towGap,towSnags:this.towSnags,snagCost:this.snagCost,inspected:this.inspected,podiumPlace:this.podiumPlace,prize:this.prize,savedCash:this.savedCash,entry:this.entry,minimum:this.minimum,profile:{...this.profile},
  career:JSON.parse(JSON.stringify(this.profile.career)),scene:this.scene?{kind:this.scene.kind,at:this.scene.at,cards:this.scene.cards.map(c=>c.type),card:this.sceneCard()}:null};}
}

// Flat tow strap with a fixed five-metre length; slack bows sideways on the ground.
export function strapPath(start,end,length=5,steps=24){
 const distance=Math.hypot(end[0]-start[0],end[2]-start[2]),nx=-(end[2]-start[2])/Math.max(.01,distance),nz=(end[0]-start[0])/Math.max(.01,distance);
 const points=amount=>Array.from({length:steps+1},(_,i)=>{const t=i/steps,loop=Math.sin(Math.PI*t)*amount,fold=Math.sin(2*Math.PI*t)*amount*.55;return [start[0]+(end[0]-start[0])*t+nx*loop-nz*fold,start[1]+(end[1]-start[1])*t,start[2]+(end[2]-start[2])*t+nz*loop+nx*fold];});
 const measure=p=>p.slice(1).reduce((sum,v,i)=>sum+Math.hypot(...v.map((x,j)=>x-p[i][j])),0);
 let lo=0,hi=length;for(let i=0;i<18;i++){const mid=(lo+hi)/2;if(measure(points(mid))>length)hi=mid;else lo=mid;}
 return points((lo+hi)/2);
}
