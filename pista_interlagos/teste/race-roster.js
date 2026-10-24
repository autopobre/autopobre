// Source: the three Old Stock result/standings images supplied for this game.
// Shared entries are one car; points are never added across co-drivers.
// Ratings are game adaptations, not official driver assessments. Colours: body and side
// stripe from the list the 99 team sent (2026-09-27); a null stripe keeps the plain light one
// (only the body colour is known), #88's colours are not known yet.
const LIGHT_STRIPE=0xe4e4d5;
// Race option "Koyzinho Indestrutível" (off by default): this car drives as the ace (ACE_STYLE in
// race-field.js) and starts just ahead of the player, in the last rival slot.
export const ACE_NUMBER='2';
// Rival level (race setting "Nível dos adversários"): 'facil' is the original field, rated from the
// standings; the others rate each driver by the table the pilots sent (2026-09-27), up to Impossível,
// whose best drivers race at Koyzinho Indestrutível's pace (race-field.js PRO_LEVELS).
export const AI_LEVELS=Object.freeze(['facil','medio','alto','impossivel']);
export const AI_LEVEL_NAMES=Object.freeze({facil:'Fácil',medio:'Médio',alto:'Alto',impossivel:'Impossível'});
// The pilots' table: skill 1-10 and chance of a mistake 1-10 ("Aloísio is so slow he can't go wrong").
// It has no line for the 99 (the player's own car): when Stevan Gaipo races it as a rival (Modo
// Corrida's car screen), mid-field, a game adaptation like the others.
const PILOT_TABLE={'2':[10,1],'73':[9,2],'7':[8,2],'64':[8,3],'00':[8,3],'19':[7,3],'51':[9,1],'93':[9,2],'312':[5,1],'70':[10,1],'9':[7,3],'74':[7,3],'88':[7,3],'42':[6,3],'99':[7,3]};
const entries=[
 ['73','Konrad Viehmann','Konrad Viehmann',192,1,3,4,1,0xe8731c,null],
 ['00','Koy Bechtold','Clóvis “Koy” Bechtold',166,2,5,3,2,0xeeeeea,0x1f4fb5],
 ['7','Mau / Álvaro Vilhena','Mau Vilhena / Álvaro Vilhena',164,3,10,5,0,0xc81d25,null],
 ['64','Marcos Philippi','Marcos Philippi',152,4,8,9,2,0xb3151c,null],
 ['2','Koyzinho Bechtold','Gabriel “Koyzinho” Bechtold',151,5,2,2,3,0xe9ebe6,0x2a5cc4],
 ['19','Leo Martins','Leonardo Martins',126,6,4,7,1,0xc9a03a,0x141516,{metalness:.55,roughness:.3}],
 ['51','Pedro Pimenta','Pedro Pimenta',118,7,11,8,4,0x1d4fb8,0xc81d25],
 ['93','Felipe Matos / Karim','Felipe Matos / Karim Machatta',99,8,1,null,3,0x8a8f95,null],
 ['312','Aloísio Bueno','Aloísio Bueno',88,9,9,10,2,0x6cb6e8,0x141516],
 ['70','Kleber Eletric','Kleber Eletric / JP Velardi',78,11,6,1,0,0xf07c18,0x1f4fb5],
 ['9','Marco Maragno','Marco Maragno',52,13,13,11,4,0x2156c4,0x2f9b4b],
 ['74','Denis / Marcos Jr.','Denis Navarro / Marcos Jr.',45,15,7,null,1,0xd9362c,null],
 ['88','Ailson Jr. / Lucas','Ailson Jr. / Lucas Lastellas',null,null,14,null,2,0xb5bbc4,null],
 ['42','Rodrigo Battistel','Rodrigo Battistel',null,null,15,null,4,0x161718,0xf2c418],
];
// A 0xRRGGBB colour's relative luminance (0 black, 1 white) and its CSS form.
export const luminance=hex=>(.2126*(hex>>16&255)+.7152*(hex>>8&255)+.0722*(hex&255))/255;
export const cssColor=hex=>`#${hex.toString(16).padStart(6,'0')}`;
// color: the body; stripe: the side stripe; finish: paint other than the plain gloss (gold);
// mark: the colour that reads on the dark track map (the stripe of a black car). A driver with no
// stage result counts as mid-form.
const rosterEntry=([number,shortName,name,points,rank,stage3,stage4,styleIndex,color,stripe,finish=null])=>{
 const results=[stage3===null?null:(15-stage3)/14,stage4===null?null:(11-stage4)/10].filter(v=>v!==null);
 const form=results.length?results.reduce((sum,v)=>sum+v,0)/results.length:.5;
 const rating=points===null?.3+form*.15:.75*(points/192)+.25*form;
 stripe??=LIGHT_STRIPE;const mark=luminance(color)<.15?stripe:color;const [skill,errors]=PILOT_TABLE[number];
 return Object.freeze({number,shortName,name,points,rank,stage3,stage4,styleIndex,color,stripe,finish:finish&&Object.freeze(finish),mark,rating,level:Math.round(70+rating*28),skill,errors});
};
export const RIVAL_ROSTER=Object.freeze(entries.map(rosterEntry));
// The cars Luizão Racing prepared, its logo on their switch bank and relay board (Central #17): Stevan Gaipo's 99,
// Kleber Eletric's 70, Aloísio Bueno's 312, Marco Maragno's 9 and Rodrigo Battistel's 42 (cockpit.js setLuizao).
export const LUIZAO_CARS=Object.freeze(['99','70','312','9','42']);
export const PLAYER_ENTRY=Object.freeze({number:'99',shortName:'Stevan Gaipo',name:'Stevan Gaipo / Edu Neves',points:67,rank:12,color:0xe2fb57});
// Modo Corrida's car selection (car-select.js): the player may race any car of the grid. Every car is
// the same Opala (same physics); what changes is the team's paint and number. The driver of the car
// taken sits the race out and Stevan Gaipo races the Opala 99 in its seat, with the 99's own livery
// (black, the yellow stripe). His pace: the pilots' table's '99' line and the standings rating from
// his 67 points.
export const OPALA_99_RIVAL=rosterEntry(['99',PLAYER_ENTRY.shortName,PLAYER_ENTRY.name,PLAYER_ENTRY.points,PLAYER_ENTRY.rank,null,null,3,0x17191b,0xf0cd1f]);
export const GRID_SIZE=RIVAL_ROSTER.length+1;
export const GRID_ROW_SPACING=8;
export const GRID_START_BACK=Math.ceil(GRID_SIZE/2)*GRID_ROW_SPACING+12;
// A grid slot: how far behind the start line (pole 12 m, two by two, the right-hand car 2 m back) and
// its side of the road. Behind the whole field the Opala 99 starts mid-road (GRID_START_BACK); with
// fewer rivals (a solo practice, a 1x1) it takes the next slot, at the front.
export const gridSlot=slot=>({back:12+Math.floor(slot/2)*GRID_ROW_SPACING+(slot%2)*2,lane:slot%2?2.2:-2.2});
export const playerGridSlot=(rivals=RIVAL_ROSTER.length)=>rivals<RIVAL_ROSTER.length?gridSlot(rivals):{back:GRID_START_BACK,lane:0};
// Solo practice (no rivals, no flag) and the 1x1 against one chosen driver: Modo Corrida's single races.
export const DUEL_DEFAULT='73';
// A rival of a model's field (rosterOf, below; the Opala's unless asked) by number.
export const rivalEntry=(number,model='opala')=>rosterOf(model).rivals.find(e=>e.number===number)??null;
// The Opalas on the selection screen, the 99 first; the player's car by number (a model's, the Opala's unless asked).
export const PLAYER_CAR_DEFAULT='99';
export const CAR_CHOICES=Object.freeze([OPALA_99_RIVAL,...RIVAL_ROSTER]);
export const carEntry=(number,model='opala')=>rosterOf(model).choices.find(e=>e.number===number)??null;
// The model the player races in Modo Corrida (the car screen's tabs): the Opala with the Old Stock field above,
// or a Fusca (fusca.js) with the Copa Fusca's field below.
export const CAR_MODELS=Object.freeze(['opala','fusca']);
export const CAR_MODEL_DEFAULT='opala';
export const MODEL_NAMES=Object.freeze({opala:'Opala',fusca:'Fusca'});
// The Copa Fusca's field (the user's list, 2026-10-06): the fifteen best of the 2026 season, by a mark (0-10) from
// the real races (score: Blog do Carelli's results and the FASP's standings up to the 7th round): where each finished
// overall in the 14 championship and 2 extra races (60%), and how close to pole they qualified (40%); few races pull
// the mark to the middle. Numbers and colours are the user's list: the body in the first colour, the fenders in the
// second (a one-colour car has them in the same). points: the driver's class points at the FASP (Super, Light or
// Sênior, until the 7th round); rank: the place in this top 15. The pace is a game adaptation, not an official
// assessment: the Fácil rating from the mark, the harder levels' skill (5-10) spread over the same marks, errors
// (1-10, as the pilots' table) from the retirements, penalties and crashes of the season, styleIndex a personality
// (race-field.js DRIVER_STYLES) from how they raced. graphic: a livery's drawing (fusca.js: Benício's lightning bolt).
// The 99 is Cristiano Canto's: he sits out when the player races it and races it in the seat of the car the player
// takes, as Stevan Gaipo does with the Opala 99.
const FUSCA_PILOTS=[
 ['20','Arthur Fischer','Arthur Fischer','Super',179,8.2,1,0xeeeeea,0xc81d25,1],
 ['86','Caio Gomes','Caio Gomes','Super',179,7.7,3,0x8a8f95,0x8a8f95,2],
 ['77','Felipe Martins','Felipe Martins','Super',125,7.3,2,0x14306e,0x5fb0e8,1],
 ['29','Stanley','Stanley Wessler','Super',66,6.7,3,0xf28c6e,0xf28c6e,2],
 ['18','Thiagão','Thiago “Thiagão” Perez','Super',96,6.6,0,0x8ccf4d,0x1f4fb5,2],
 ['3','Rogério Gaspar','Rogério Gaspar','Super',74,6.2,2,0x17191b,0xe8579b,2],
 ['33','Fernando Moraes','Fernando Moraes','Light',215,6.1,1,0xf2c418,0x8ccf4d,2],
 ['5','Eduardo Belisario','Eduardo Belisario','Super',23,5.9,4,0xb4b8bb,0xb4b8bb,2],
 ['99','Cristiano','Cristiano Canto','Super',47,5.4,0,0x6f747a,0x141516,3],
 ['39','Erli Camargo','Erli Camargo','Light',185,5.2,4,0xf2f1ec,0xd0262c,2],
 ['11','Caio Mahana','Caio Mahana','Super',47,5.1,3,0xeeeeea,0xf08a6c,3],
 ['4','Thiago Benício','Thiago Benício','Super',9,5,0,0xc41a22,0xc41a22,3,'raio'],
 ['9','Marcos Fortuna','Marcos Fortuna','Light',148,4.9,2,0x161718,0x161718,2],
 ['79','Zé Dias','José “Zé” Dias Filho','Sênior',190,4.8,2,0xe9e8e2,0xb81b22,1],
 ['49','Robertão','Roberto “Robertão” Soares','Sênior',200,4.2,4,0x9a9fa5,0x17191b,3],
];
const MARK_TOP=8.2,MARK_LOW=4.2;
const fuscaEntry=([number,shortName,name,category,points,score,styleIndex,color,stripe,errors,graphic=null],i)=>{
 const q=(score-MARK_LOW)/(MARK_TOP-MARK_LOW),rating=.3+.65*q,dark=v=>luminance(v)<.15;
 return Object.freeze({number,shortName,name,category,points,rank:i+1,score,styleIndex,color,stripe,finish:null,graphic,
  mark:dark(color)?dark(stripe)?0xb5bbc4:stripe:color,rating,level:Math.round(70+rating*28),skill:Math.round(5+5*q),errors});
};
// FUSCA_CHOICES: the car screen's Fusca cards, in the top 15's order; FUSCA_ROSTER: the rivals (all but the 99).
export const FUSCA_CHOICES=Object.freeze(FUSCA_PILOTS.map(fuscaEntry));
export const FUSCA_99_RIVAL=FUSCA_CHOICES.find(e=>e.number==='99');
export const FUSCA_ROSTER=Object.freeze(FUSCA_CHOICES.filter(e=>e!==FUSCA_99_RIVAL));
// Each model's field: the rivals, the 99 that races in the seat of the car the player takes, the car screen's
// cards and the 1x1's rival unless one is picked. A model it does not know is the Opala's.
const ROSTERS=Object.freeze({
 opala:Object.freeze({rivals:RIVAL_ROSTER,car99:OPALA_99_RIVAL,choices:CAR_CHOICES,duel:DUEL_DEFAULT}),
 fusca:Object.freeze({rivals:FUSCA_ROSTER,car99:FUSCA_99_RIVAL,choices:FUSCA_CHOICES,duel:'20'})});
export const rosterOf=model=>ROSTERS[model]??ROSTERS.opala;
export const duelDefault=model=>rosterOf(model).duel;
// The rivals when the player races `car`: the roster, that car's seat taken by the 99 (same index, so the
// grid's cars and their models keep their places).
export const fieldRoster=(car=PLAYER_CAR_DEFAULT,model='opala')=>{const r=rosterOf(model);return car===PLAYER_CAR_DEFAULT||!rivalEntry(car,model)?r.rivals:Object.freeze(r.rivals.map(e=>e.number===car?r.car99:e));};
// The 1x1's rival when the player races `car`: the one asked for; asking for that car's own driver
// gives the 99, now in its seat.
export function duelRivalFor(car,wanted,model='opala'){const number=wanted===car?PLAYER_CAR_DEFAULT:wanted;return fieldRoster(car,model).some(e=>e.number===number)?number:duelDefault(model);}
