// Modo História career (story-career.js through ImmersiveState): the wallet, the three morale bars,
// prizes, the entry away from Interlagos, the equipment challenges with the wife's expenses, the
// Blazer, the challenges after it and the Opala 99 (Central #16), and the end of the story.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ImmersiveState,FANS,JOKES,COSTS} from '../teste/immersive-state.js';
import {CHALLENGES,PRIZES,prizeFor,entryFor,ENTRY,MORALE_CARDS,INTRO_LINES,DONE_LINES,MISSED,REFUSED,expenseFor,outcomeOf,loadCareer,newCareer,SNAG_COST,outfitOf,repairBill,repairPerPoint,enginePower,ENGINE_PARTS,stageOf,BLAZER_AFTER,OPALA_GOAL,divorceStep,patienceOf,DIVORCE_LINES,PENSION,PENSION_MONTHS,GAME_OVER} from '../teste/story-career.js';
const checks={},check=(name,value)=>{checks[name]=!!value;assert(value,name);};
const profileOf=(career={},fund=0)=>({fund,career:{...newCareer(),intro:true,...career}});
const story=(career,fund)=>{const s=new ImmersiveState(profileOf(career,fund));s.start();return s;};
const fundAll=s=>{for(let i=0;i<FANS.length;i++){s.talk(i);s.joke(JOKES.findIndex(j=>j.topic===FANS[i].taste));s.fan=null;}};
// From the paddock to the inspection's end: finished at `position`, or towed in (null).
const race=(s,position)=>{if(s.paid)s.start();s.scene=null;s.phase='race';if(position)s.finish(position);else{s.fail('Carro quebrou');s.beginTow();while(s.phase==='tow')s.towStep({brake:1},.05);}s.leavePodium();s.requestInspection();s.inspectionStep(8);return s;};
const types=s=>s.scene?.cards.map(c=>c.type).join()??'';
const readAll=s=>{for(let i=0;i<40&&s.scene&&!['expense','over'].includes(s.sceneCard().type);i++)s.advanceScene();};

// A new story: Kléber's welcome in the paddock first, then the first challenge; nobody to talk to meanwhile.
const first=new ImmersiveState();first.start();
check('new_career_bars_at_half',['esposa','equipe','torcida'].every(k=>first.profile.career.morale[k]===50)&&first.profile.fund===0);
check('welcome_scene_first',first.scene?.kind==='intro'&&first.scene.cards.length===INTRO_LINES.length+1&&first.sceneCard().who==='kleber'&&first.scene.cards.at(-1).type==='challenge'&&first.scene.cards.at(-1).challenge==='macacao');
first.talk(0);check('scene_blocks_the_paddock',first.fan===null&&!first.openDesk()&&!first.offerCoffee()&&!first.openCafe());
first.advanceScene(true);check('skip_goes_to_the_challenge',first.sceneCard().type==='challenge');first.advanceScene();
check('welcome_seen_once',!first.scene&&first.profile.career.intro&&new ImmersiveState(JSON.parse(JSON.stringify(first.profile))).careerCards()===null);
// A profile from before the career keeps its race count; its savings start over with the story.
const old=new ImmersiveState({fund:2500,released:true,races:7});check('old_savings_start_over',old.profile.fund===0&&!old.profile.released&&old.profile.races===7&&!old.profile.career.intro);
check('bad_career_is_new',loadCareer({version:1,morale:{esposa:500,equipe:-3,torcida:'x'},challenge:99,gear:['macacao'],over:'boom'}).morale.esposa===100&&loadCareer({version:1,morale:{equipe:-3}}).morale.equipe===0&&loadCareer({version:2}).intro===false&&loadCareer({version:1,challenge:99}).challenge===CHALLENGES.length&&loadCareer({over:'boom',version:1}).over===null);

// Supporters give by their morale: 50% as always, half at 0%, one and a half at 100%.
const half=story({morale:{esposa:50,equipe:50,torcida:50}});check('gifts_as_before_at_half',FANS.every((f,i)=>half.gift(i)===f.gift));
const cold=story({morale:{esposa:50,equipe:50,torcida:0}}),warm=story({morale:{esposa:50,equipe:50,torcida:100}});
check('supporters_morale_scales_gifts',FANS.every((f,i)=>cold.gift(i)===Math.round(f.gift*.5)&&warm.gift(i)===Math.round(f.gift*1.5)));
const mild=story({morale:{esposa:50,equipe:50,torcida:20}});mild.talk(2);mild.joke(JOKES.findIndex(j=>j.topic===FANS[2].taste));check('joke_pays_scaled_gift',mild.cash===Math.round(FANS[2].gift*.7));

// The entry: R$ 100 at Interlagos, R$ 150 elsewhere; the kitty pays first, then the wallet.
check('entry_home_and_away',entryFor('interlagos')===ENTRY.home&&ENTRY.home===100&&['brasilia','cascavel','chapeco','curvelo'].every(c=>entryFor(c)===150));
const away=new ImmersiveState(profileOf({},60));away.entry=entryFor('cascavel');away.start();check('away_minimum',away.minimum===150+COSTS.leastLitres*COSTS.litre);
away.cash=120;away.openDesk();check('wallet_tops_up_the_kitty',away.buy(4,false)&&away.cash===0&&away.profile.fund===60-(176-120)&&away.phase==='starting');
const poor=new ImmersiveState(profileOf({},0));poor.entry=150;poor.start();poor.cash=100;poor.openDesk();check('short_money_stays',!poor.buy(4,false)&&poor.phase==='crowd');
// Snacks never take what the registration still needs, kitty and wallet together.
const snack=new ImmersiveState(profileOf({},40));snack.entry=150;snack.start();fundAll(snack);check('snack_keeps_registration_with_wallet',snack.spareCash()===snack.cash+40-176&&!snack.pay(snack.spareCash()+1)&&snack.pay(snack.spareCash())&&snack.cash+snack.profile.fund===176);

// Prizes: 800, 600, 500, 400, 300, 200, then 100 down to the 10th and nothing from the 11th.
check('prize_table',[1,2,3,4,5,6,7,10,11,15].map(prizeFor).join()==='800,600,500,400,300,200,100,100,0,0'&&PRIZES.length===10);
const paid=story();paid.cash=30;race(paid,3);check('prize_and_kitty_into_wallet',paid.prize===500&&paid.savedCash===30&&paid.profile.fund===530);
const towed=story({},100);towed.scene=null;towed.phase='race';towed.fail('Carro quebrou');towed.beginTow();for(let i=0;i<3000&&towed.phase==='tow';i++)towed.towStep({brake:0},1/120);towed.untangle();while(towed.phase==='tow')towed.towStep({brake:1},.05);
check('snag_paid_from_wallet',towed.towSnags===1&&towed.prize===0&&towed.snagCost===SNAG_COST&&towed.profile.fund===100-SNAG_COST);

// After the race: three morale cards (races 1-5 and from the 6th, by outcome), the repair bill, then the challenge.
check('outcomes',[[{status:'Terminou',position:1},'vitoria'],[{status:'Terminou',position:6},'podio'],[{status:'Terminou',position:7},'pontos'],[{status:'Terminou',position:10},'pontos'],[{status:'Terminou',position:11},'fundo'],[{status:'Não terminou',position:null},'guincho'],[{status:'Desclassificado',position:1},'guincho']].every(([r,o])=>outcomeOf(r)===o));
const won=race(story(),1);check('win_report_cards',types(won)==='morale,morale,morale,repair,challenge'&&won.scene.kind==='report'&&won.sceneCard().key==='esposa'&&won.phase==='complete');
check('early_win_morale',won.profile.career.morale.esposa===60&&won.profile.career.morale.equipe===70&&won.profile.career.morale.torcida===70&&won.profile.career.races===1);
check('challenge_progress_card',won.scene.cards[4].challenge==='macacao'&&won.scene.cards[4].left===2&&won.scene.cards[4].fund===800);
check('clean_car_bill_is_zero',won.scene.cards[3].type==='repair'&&won.scene.cards[3].damage===0&&won.scene.cards[3].charged===0&&won.scene.cards[3].fund===800);
readAll(won);check('report_read_through',!won.scene&&won.profile.career.report===null);
const late=story({races:5,since:5});race(late,null);check('late_tow_morale',late.profile.career.morale.esposa===30&&late.profile.career.morale.equipe===40&&late.profile.career.morale.torcida===40&&late.scene.cards[0].delta===MORALE_CARDS.late.guincho[0][1]);
const early=story({races:4,since:4});race(early,12);check('fifth_race_is_early',early.profile.career.races===5&&early.profile.career.morale.equipe===55);
// Taken to the box before the judge: the race counts as towed in.
const dq=story();dq.scene=null;dq.phase='race';dq.finish(2);dq.leavePodium();dq.goToBox();
check('disqualified_counts_as_tow',dq.phase==='disqualified'&&dq.profile.career.morale.esposa===40&&dq.profile.career.morale.equipe===52&&dq.profile.fund===0);
check('report_after_the_photo',dq.afterDisqualified()&&dq.phase==='complete'&&dq.scene.kind==='report'&&dq.scene.cards[0].outcome==='guincho');
// The team's repair bill (Central #14): R$ 10 a point of the CARRO bar lost (as the HUD rounds it),
// out of the wallet after the prize, shown after the supporters' card; the windscreen is not on it.
check('repair_bill_rule',[[1,0],[.75,250],[.57,430],[0,1000]].every(([h,bill])=>repairBill(h,5000).bill===bill)&&repairBill(.5,120).charged===120);
const dented=story();dented.health=.75;dented.glass=.6;race(dented,2);const bill=dented.scene.cards[3];
check('repair_bill_after_supporters',types(dented)==='morale,morale,morale,repair,challenge'&&dented.scene.cards[2].key==='torcida'&&bill.damage===25&&bill.bill===250&&bill.charged===250&&bill.fund===600-250&&dented.profile.fund===350);
const skint=story();skint.health=.5;race(skint,8);const cut=skint.scene.cards[3];
check('short_wallet_pays_what_it_has',cut.bill===500&&cut.charged===100&&cut.fund===0&&skint.profile.fund===0);
const billed=story();billed.health=.75;billed.scene=null;billed.phase='race';billed.finish(2);const reread=new ImmersiveState(JSON.parse(JSON.stringify(billed.profile)));reread.start();
check('repair_bill_survives_reload',reread.scene?.kind==='report'&&reread.scene.cards.find(c=>c.type==='repair')?.charged===250&&reread.profile.fund===350);
check('old_report_has_no_bill',loadCareer({...newCareer(),report:{race:1,outcome:'pontos',before:{esposa:50,equipe:50,torcida:50}}}).report&&!loadCareer({...newCareer(),report:{race:1,outcome:'pontos',before:{esposa:50,equipe:50,torcida:50}}}).report.repair);

// The money is there: first the wife's expense (300 at 50%, 1.5x at 0%, 0.5x at 100%).
check('expense_scales_with_wife',[0,50,100].map(m=>expenseFor(CHALLENGES[0],{morale:{esposa:m}})).join()==='450,300,150');
const rich=story({},700);race(rich,1);readAll(rich);check('expense_asked_when_goal_reached',rich.sceneCard().type==='expense'&&rich.sceneCard().value===Math.round(300*(1.5-.6))&&rich.profile.career.report?.awaiting==='expense');
check('expense_waits_for_answer',!rich.advanceScene()&&rich.sceneCard().type==='expense');
// Reloaded before the answer: only her request comes back.
const again=new ImmersiveState(JSON.parse(JSON.stringify(rich.profile)));again.start();check('expense_survives_reload',again.scene?.kind==='report'&&types(again)==='expense');
rich.answerScene(true);check('expense_paid_from_wallet',rich.sceneCard().type==='answer'&&rich.sceneCard().paid&&rich.sceneCard().value===270&&rich.sceneCard().fund===1500-270);
// Still enough: the overalls are bought, Kléber gets his back, the gloves come next.
check('overalls_bought',rich.profile.career.gear.join()==='macacao'&&rich.profile.career.challenge===1&&rich.profile.fund===230&&rich.scene.cards.slice(rich.scene.at).map(c=>c.type).join()===['answer',...DONE_LINES.macacao.map(()=>'line'),'done','challenge'].join()&&rich.scene.cards.at(-1).challenge==='luvas');
readAll(rich);check('expense_once_per_challenge',!rich.scene&&!rich.profile.career.expense&&rich.profile.career.since===1);
const refuse=story({},900);race(refuse,4);readAll(refuse);refuse.answerScene(false);check('refused_expense_costs_wife_morale',refuse.profile.career.morale.esposa===55+REFUSED.esposa&&refuse.profile.career.gear.join()==='macacao'&&refuse.profile.fund===300);
// Paid, but no longer enough: the challenge goes on.
const short=story({},500);race(short,2);readAll(short);short.answerScene(true);check('expense_leaves_it_short',short.profile.fund===1100-285&&short.profile.career.challenge===0&&short.scene.cards.at(-1).type==='challenge'&&short.scene.cards.at(-1).left===2);

// The deadline passes without the money: the loan goes on, team and supporters notice.
const slow=story();for(let i=0;i<2;i++){race(slow,12);readAll(slow);}race(slow,12);
check('deadline_missed',slow.scene.cards.some(c=>c.type==='missed')&&slow.profile.career.since===3&&slow.profile.career.challenge===0&&slow.profile.career.morale.equipe===50+5*3+MISSED.equipe&&slow.profile.career.morale.torcida===50+2*3+MISSED.torcida);
// A knock hits harder with a team that lost faith (no detailed damage: the story's own health).
const knock=k=>{const s=story({morale:{esposa:50,equipe:k,torcida:50}});s.scene=null;s.phase='race';s.hitCar(1);return 1-s.health;};
check('team_morale_scales_damage',Math.abs(knock(0)-knock(50)*1.5)<1e-9&&Math.abs(knock(100)-knock(50)*.5)<1e-9);

// The end: the team's or the supporters' bar at zero (the wife's no longer: she divorces him), or not even every
// supporter pays the registration: bankrupt, in Stevan's words.
const sad=story({races:6,since:6,morale:{esposa:80,equipe:5,torcida:50}});race(sad,null);
check('game_over_at_zero',sad.profile.career.over==='equipe'&&types(sad)==='morale,morale,morale,repair,over');readAll(sad);check('game_over_waits',sad.sceneCard().type==='over'&&!sad.advanceScene());
const ended=new ImmersiveState(JSON.parse(JSON.stringify(sad.profile)));ended.start();check('game_over_survives_reload',ended.scene?.kind==='over');
ended.restartCareer();ended.start();check('new_story_after_the_end',!ended.profile.career.over&&ended.profile.fund===0&&ended.scene?.kind==='intro');
const broke=new ImmersiveState(profileOf({morale:{esposa:50,equipe:50,torcida:10}},0));broke.entry=150;broke.start();check('no_money_no_story',broke.profile.career.over==='dinheiro'&&broke.scene?.kind==='over'&&GAME_OVER.dinheiro==='A carreira de piloto te levou à falência e você está fora do automobilismo.');
const home=new ImmersiveState(profileOf({morale:{esposa:50,equipe:50,torcida:10}},0));home.start();check('home_entry_still_reachable',!home.profile.career.over&&!home.scene);

// The divorce (Central #15). The clock by bands of the wife's morale after each race (Stevan's table), her patience
// the fewer or the more races of each band; under 10% at once; above 50% it waits, more than 4 races there forgive.
const until=(m,patience)=>{const c={...newCareer(),morale:{esposa:m,equipe:50,torcida:50}};for(let n=1;n<=20;n++)if(divorceStep(c,()=>patience))return n;return null;};
check('divorce_deadlines_by_band',[[50,4,5],[40,4,5],[39,3,4],[30,3,4],[29,2,3],[20,2,3],[19,1,2],[10,1,2]].every(([m,few,more])=>until(m,.2)===few&&until(m,.8)===more)&&[9,5,0].every(m=>until(m,.5)===1)&&until(51,.2)===null&&until(100,.2)===null);
{const c=newCareer();const steps=[45,45,25].map(m=>{c.morale.esposa=m;return divorceStep(c,()=>.2);});check('moving_bands_average',steps.join()==='false,false,true');}
{const c=newCareer();c.morale.esposa=45;divorceStep(c,()=>.2);divorceStep(c,()=>.2);c.morale.esposa=60;for(let i=0;i<4;i++)divorceStep(c);
 const waited=c.clock.progress===.5&&c.clock.calm===4&&patienceOf(c.clock).chance===1;c.morale.esposa=45;const back=divorceStep(c,()=>.9)===false&&c.clock.progress===.75&&c.clock.calm===0;
 c.morale.esposa=60;for(let i=0;i<5;i++)divorceStep(c);check('above_half_waits_then_forgives',waited&&back&&c.clock.progress===0&&c.clock.patience===null&&patienceOf(c.clock)===null);}
check('patience_by_thirds',patienceOf({progress:.25,calm:0}).stage===0&&patienceOf({progress:.5,calm:0}).stage===1&&patienceOf({progress:.75,calm:0}).stage===2&&patienceOf({progress:0,calm:0})===null);
// A late tow with the wife at 15%: she drops to 0 and divorces him at once. The report: her card (the divorce on it),
// the team's and the supporters', the repair bill, the lawyer at the Box 99, DIVÓRCIO; she took half of the wallet.
const wed=story({races:6,since:6,morale:{esposa:15,equipe:60,torcida:60}},1000);race(wed,null);
check('wife_at_zero_divorces',!wed.profile.career.over&&wed.profile.career.divorced?.taken===500&&wed.profile.fund===500&&types(wed)===['morale','morale','morale','repair',...DIVORCE_LINES.map(()=>'line'),'divorce','challenge'].join()&&wed.scene.cards[0].divorced);
const scene15=wed.scene.cards.filter(c=>c.type==='line');
check('lawyer_scene_lines',scene15.length===6&&scene15.every((c,i)=>c.act==='divorce'&&c.index===i&&c.outfit==='emprestado')&&scene15.slice(0,3).every(c=>c.who==='lawyer')&&scene15[2].text==='Assine estes papéis.'&&wed.scene.cards.find(c=>c.type==='divorce').taken===500);
// Before each vaquinha from then on: the pension of the round's months, out of what the wallet holds (never a debt).
readAll(wed);wed.round=0;wed.start();
check('pension_before_the_vaquinha',wed.scene?.kind==='pension'&&wed.sceneCard().amount===PENSION*3&&wed.sceneCard().charged===500&&wed.sceneCard().before===500&&wed.sceneCard().fund===0&&wed.sceneCard().months.join()==='janeiro,fevereiro,março'&&wed.profile.fund===0);
wed.scene=null;wed.start();check('pension_once_a_race',wed.scene?.kind!=='pension'&&wed.profile.fund===0);
race(wed,1);check('wife_card_gone_after',types(wed).startsWith('morale,morale,repair')&&!wed.scene.cards.some(c=>c.key==='esposa'));
readAll(wed);const owed=wed.profile.fund;wed.round=3;wed.start();check('pension_two_months_in_july',wed.sceneCard().amount===600&&wed.sceneCard().months.join()==='junho,julho'&&wed.profile.fund===owed-600);
wed.scene=null;wed.round=null;race(wed,2);readAll(wed);wed.start();check('pension_one_month_outside_the_calendar',wed.sceneCard().amount===PENSION&&wed.sceneCard().months===null);
check('stevans_pension_year',PENSION_MONTHS.reduce((n,m)=>n+m.length,0)===12&&PENSION_MONTHS.map(m=>m.length*PENSION).join()==='900,300,300,600,300,300,300,600');
// No more requests from her: with the money there, the overalls are bought at once.
const free=story({races:6,since:6,morale:{esposa:15,equipe:60,torcida:60}},3000);race(free,12);
check('no_wife_request_after_divorce',free.profile.career.divorced&&!free.scene.cards.some(c=>c.type==='expense')&&free.scene.cards.some(c=>c.type==='done')&&free.profile.fund===3000/2-1000);
// Reloaded before the report (the next race's paddock): the divorce and its scene come back, then that race's pension.
const kept=story({races:6,since:6,morale:{esposa:15,equipe:60,torcida:60}},1000);kept.scene=null;kept.phase='race';kept.finish(12);
const reread15=new ImmersiveState(JSON.parse(JSON.stringify(kept.profile)));reread15.start();
check('divorce_survives_reload',reread15.profile.career.divorced?.taken===kept.profile.career.divorced?.taken&&reread15.scene?.kind==='report'&&reread15.scene.cards.some(c=>c.type==='divorce')&&reread15.scene.cards.at(-1).type==='pension'&&reread15.scene.cards.filter(c=>c.type==='pension').length===1);
// Taken to the box before the judge: towed in after all, her drop can divorce him then.
const boxed=story({races:6,since:6,morale:{esposa:25,equipe:60,torcida:60}},400);boxed.scene=null;boxed.phase='race';boxed.finish(2);const wedBefore=boxed.profile.career.divorced;boxed.leavePodium();boxed.goToBox();
check('late_disqualification_can_divorce',!wedBefore&&boxed.profile.career.divorced?.taken===200&&boxed.profile.fund===200);

// What Stevan wears (story-scene.js, pit-crew.js STEVAN_OUTFITS): street clothes until the welcome, Kléber's loan, his own.
check('outfit_by_stage',outfitOf(newCareer())==='civil'&&outfitOf({...newCareer(),intro:true})==='emprestado'&&outfitOf({...newCareer(),intro:true,gear:['macacao']})==='proprio');
// The lines of Kléber's box know their act and place, which the 3D scene stages.
check('lines_know_act_and_place',first.careerCards()===null&&new ImmersiveState().careerCards().cards.filter(c=>c.type==='line').every((c,i)=>c.act==='intro'&&c.index===i)&&(()=>{const r=story({},700);race(r,1);readAll(r);r.answerScene(true);const lines=r.scene.cards.filter(c=>c.type==='line');return lines.length===DONE_LINES.macacao.length&&lines.every((c,i)=>c.act==='done'&&c.index===i);})());
// After the four challenges the Blazer is the dream, bought from the wallet at the end of a race; then (Central #16)
// the challenges after it start, the HANS first, its deadline from that race.
const dream=story({challenge:BLAZER_AFTER},850);race(dream,6);check('blazer_card_after_equipment',dream.scene.cards.at(-1).type==='dream'&&dream.scene.cards.at(-1).dream==='blazer');readAll(dream);
check('blazer_bought_then_hans',dream.releaseBlazer()&&dream.profile.released&&dream.profile.fund===150&&types(dream)==='dream,challenge'&&dream.sceneCard().done&&dream.scene.cards[1].challenge==='hans'&&dream.scene.cards[1].fresh&&dream.scene.cards[1].left===3&&dream.profile.career.blazerAt===1&&dream.profile.career.since===1);
readAll(dream);check('mechanic_paid_once',!dream.releaseBlazer()&&dream.profile.fund===150);
// A save whose Blazer came out before these challenges existed: the HANS deadline starts with the next race.
const legacy=new ImmersiveState({fund:100,released:true,races:9,career:{...newCareer(),intro:true,challenge:BLAZER_AFTER,races:9,since:4}});
check('old_blazer_save_starts_hans_now',legacy.profile.career.blazerAt===9&&legacy.profile.career.since===9&&stageOf(legacy.profile.career,true).challenge.id==='hans');
// The challenges after the Blazer (Stevan's choices, #16.2): dearer each time than the helmet, longer deadlines, and
// the wife's expenses climbing from R$ 450 to R$ 700 (none for her own trip).
const later=CHALLENGES.slice(BLAZER_AFTER);
check('challenges_after_blazer',later.map(c=>[c.number,c.id,c.goal,c.races].join(':')).join()==='5:hans:1500:3,6:carretinha:1800:3,7:ferramentas:2200:4,8:bodas:2600:4,9:kart:3000:4,10:motor:3500:5'&&CHALLENGES.every((c,i)=>i<=BLAZER_AFTER||c.goal>CHALLENGES[i-1].goal));
check('their_expenses',later.map(c=>c.expense?expenseFor(c,{morale:{esposa:50}}):0).join()==='450,500,550,0,600,700');
// The hitch and trailer: away from Interlagos the entry costs as at home.
check('trailer_entry',entryFor('cascavel',{gear:['carretinha']})===ENTRY.home&&entryFor('cascavel',{gear:['hans']})===ENTRY.away&&entryFor('cascavel')===ENTRY.away);
// The Box 99's tools: the team +10 when bought, then R$ 5 a point of damage.
const tools=story({challenge:6,expense:true},2000);race(tools,1);
check('tools_bought',tools.profile.career.gear.includes('ferramentas')&&tools.profile.fund===600&&tools.profile.career.morale.equipe===50+20+10&&types(tools)==='morale,morale,morale,repair,done,challenge'&&tools.scene.cards.at(-1).challenge==='bodas');
readAll(tools);tools.start();tools.health=.75;race(tools,12);check('tools_halve_the_bill',repairPerPoint(tools.profile.career)===5&&tools.scene.cards.find(c=>c.type==='repair').bill===125&&repairBill(.75,5000,5).bill===125);
// Her trip: no expense asked, her bar +25; skipped after a divorce; a deadline missed hurts her, not the team.
const trip=story({challenge:7},2000);race(trip,1);
check('trip_needs_no_expense',!trip.scene.cards.some(c=>c.type==='expense')&&trip.profile.career.gear.includes('bodas')&&trip.profile.career.morale.esposa===50+10+25&&trip.profile.fund===200&&trip.scene.cards.at(-1).challenge==='kart');
const single=story({challenge:7,divorced:{race:0,taken:0}},0);race(single,12);
check('trip_skipped_after_divorce',single.profile.career.challenge===8&&types(single).endsWith('skipped,challenge')&&single.scene.cards.at(-1).challenge==='kart'&&single.scene.cards.at(-1).fresh&&single.profile.career.since===single.profile.career.races);
const late8=story({challenge:7,races:6,since:3},0);race(late8,12);const missed8=late8.scene.cards.find(c=>c.type==='missed');
check('trip_missed_hurts_her',missed8?.changes.esposa===-10&&!('equipe' in missed8.changes)&&late8.profile.career.morale.esposa===50-10-10&&late8.profile.career.morale.equipe===45);
// The daughter's kart: her scene at the Box 99 (act 'kart', Stevan in his own overalls), the supporters +15.
const kart=story({challenge:8,expense:true},3000);race(kart,1);const kartLines=kart.scene.cards.filter(c=>c.type==='line');
check('kart_scene',kartLines.length===DONE_LINES.kart.length&&kartLines.every((c,i)=>c.act==='kart'&&c.scene==='kart'&&c.index===i&&c.outfit==='proprio')&&kartLines[0].who==='daughter'&&kart.profile.career.morale.torcida===50+20+15&&kart.scene.cards.at(-1).challenge==='motor');
// The engine's new parts: a little stronger (3%), in the story only (ImmersiveMode.start sets car.engineScale).
check('engine_parts',enginePower({gear:['motor']})===ENGINE_PARTS&&ENGINE_PARTS===1.03&&enginePower({gear:['kart']})===1&&enginePower(null)===1);
// After every challenge, the big dream: the Opala 99, bought after a race; it stays bought.
const big=story({challenge:CHALLENGES.length},7500);race(big,1);check('opala_dream_after_all',big.scene.cards.at(-1).type==='dream'&&big.scene.cards.at(-1).dream==='opala'&&big.scene.cards.at(-1).goal===OPALA_GOAL&&!big.profile.career.opala);
readAll(big);check('opala_bought',big.buyOpala()&&big.profile.career.opala&&big.profile.fund===300&&types(big)==='owned');readAll(big);
check('opala_bought_once',!big.buyOpala()&&big.profile.fund===300&&stageOf(new ImmersiveState(JSON.parse(JSON.stringify(big.profile))).profile.career,true).done);
const poorDream=story({challenge:CHALLENGES.length},100);race(poorDream,12);readAll(poorDream);check('opala_needs_the_money',!poorDream.buyOpala()&&!poorDream.profile.career.opala);
const report={passed:true,checks};fs.writeFileSync(new URL('../dados/validacao_carreira.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
