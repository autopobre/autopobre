// Modo História career (story-career.js through ImmersiveState): the wallet, the three morale bars,
// prizes, the entry away from Interlagos, the equipment challenges with the wife's expenses, the
// Blazer as the final dream and the end of the story.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ImmersiveState,FANS,JOKES,COSTS} from '../teste/immersive-state.js';
import {CHALLENGES,PRIZES,prizeFor,entryFor,ENTRY,MORALE_CARDS,INTRO_LINES,DONE_LINES,MISSED,REFUSED,expenseFor,outcomeOf,loadCareer,newCareer,SNAG_COST,outfitOf} from '../teste/story-career.js';
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

// After the race: three morale cards (races 1-5 and from the 6th, by outcome), then the challenge.
check('outcomes',[[{status:'Terminou',position:1},'vitoria'],[{status:'Terminou',position:6},'podio'],[{status:'Terminou',position:7},'pontos'],[{status:'Terminou',position:10},'pontos'],[{status:'Terminou',position:11},'fundo'],[{status:'Não terminou',position:null},'guincho'],[{status:'Desclassificado',position:1},'guincho']].every(([r,o])=>outcomeOf(r)===o));
const won=race(story(),1);check('win_report_cards',types(won)==='morale,morale,morale,challenge'&&won.scene.kind==='report'&&won.sceneCard().key==='esposa'&&won.phase==='complete');
check('early_win_morale',won.profile.career.morale.esposa===60&&won.profile.career.morale.equipe===70&&won.profile.career.morale.torcida===70&&won.profile.career.races===1);
check('challenge_progress_card',won.scene.cards[3].challenge==='macacao'&&won.scene.cards[3].left===2&&won.scene.cards[3].fund===800);
readAll(won);check('report_read_through',!won.scene&&won.profile.career.report===null);
const late=story({races:5,since:5});race(late,null);check('late_tow_morale',late.profile.career.morale.esposa===30&&late.profile.career.morale.equipe===40&&late.profile.career.morale.torcida===40&&late.scene.cards[0].delta===MORALE_CARDS.late.guincho[0][1]);
const early=story({races:4,since:4});race(early,12);check('fifth_race_is_early',early.profile.career.races===5&&early.profile.career.morale.equipe===55);
// Taken to the box before the judge: the race counts as towed in.
const dq=story();dq.scene=null;dq.phase='race';dq.finish(2);dq.leavePodium();dq.goToBox();
check('disqualified_counts_as_tow',dq.phase==='disqualified'&&dq.profile.career.morale.esposa===40&&dq.profile.career.morale.equipe===52&&dq.profile.fund===0);
check('report_after_the_photo',dq.afterDisqualified()&&dq.phase==='complete'&&dq.scene.kind==='report'&&dq.scene.cards[0].outcome==='guincho');

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

// The end: a bar at zero, or not even every supporter pays the registration.
const sad=story({races:6,morale:{esposa:15,equipe:50,torcida:50}});race(sad,null);
check('game_over_at_zero',sad.profile.career.over==='esposa'&&types(sad)==='morale,morale,morale,over');readAll(sad);check('game_over_waits',sad.sceneCard().type==='over'&&!sad.advanceScene());
const ended=new ImmersiveState(JSON.parse(JSON.stringify(sad.profile)));ended.start();check('game_over_survives_reload',ended.scene?.kind==='over');
ended.restartCareer();ended.start();check('new_story_after_the_end',!ended.profile.career.over&&ended.profile.fund===0&&ended.scene?.kind==='intro');
const broke=new ImmersiveState(profileOf({morale:{esposa:50,equipe:50,torcida:10}},0));broke.entry=150;broke.start();check('no_money_no_story',broke.profile.career.over==='dinheiro'&&broke.scene?.kind==='over');
const home=new ImmersiveState(profileOf({morale:{esposa:50,equipe:50,torcida:10}},0));home.start();check('home_entry_still_reachable',!home.profile.career.over&&!home.scene);

// What Stevan wears (story-scene.js, pit-crew.js STEVAN_OUTFITS): street clothes until the welcome, Kléber's loan, his own.
check('outfit_by_stage',outfitOf(newCareer())==='civil'&&outfitOf({...newCareer(),intro:true})==='emprestado'&&outfitOf({...newCareer(),intro:true,gear:['macacao']})==='proprio');
// The lines of Kléber's box know their act and place, which the 3D scene stages.
check('lines_know_act_and_place',first.careerCards()===null&&new ImmersiveState().careerCards().cards.filter(c=>c.type==='line').every((c,i)=>c.act==='intro'&&c.index===i)&&(()=>{const r=story({},700);race(r,1);readAll(r);r.answerScene(true);const lines=r.scene.cards.filter(c=>c.type==='line');return lines.length===DONE_LINES.macacao.length&&lines.every((c,i)=>c.act==='done'&&c.index===i);})());
// After the four challenges the Blazer is the dream, bought from the wallet at the end of a race.
const dream=story({challenge:CHALLENGES.length},850);race(dream,6);check('blazer_card_after_equipment',dream.scene.cards.at(-1).type==='dream');readAll(dream);check('blazer_bought_last',dream.releaseBlazer()&&dream.profile.released&&dream.profile.fund===150);
const report={passed:true,checks};fs.writeFileSync(new URL('../dados/validacao_carreira.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
