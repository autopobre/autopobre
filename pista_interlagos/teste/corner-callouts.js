// The copilot (user, 10-27: "uma versão estilo Waze que fala o nome das curvas, ajuda o piloto a decorar enquanto
// corre"): a voice names the corner ahead a moment before the car gets there, once a lap, in the narrator's recorded
// voice. The names are the game's own (the HUD's place line: main.js names, or the track file's sections); the clips
// are recorded by scripts/gerar_chamadas_curvas.py into assets/audio/curvas_<circuito>.mp3, their places in its .json.

// Each circuit's callouts: s, where the corner begins to turn (metres along the lap), and the words; said LEAD seconds
// before s, or, given at, when the car gets to at (just before the corner or inside it). A straight (straight: true)
// begins at s, as the bend behind it ends, and is named in its middle (at, halfway to the next corner). Interlagos: the
// bends of the lap's own centre line (its curvature, 10-27), named as the HUD's sections name them. The user's timing
// (10-27): the S do Senna 30 m before it turns, the Curva do Sol as it begins; the Descida do Lago in T4, entering the
// descent; the Laranjinha in the Ferradura's second bend and the corner after it the Curva do Esse (the HUD called that
// one Laranjinha); the Pinheirinho, the Bico de Pato, the Mergulho and the Junção a little before the middle of the
// bend (15 to 20 m); the others before they begin; the Reta Oposta and the Reta dos Boxes in their middle ("mais perto
// do meio delas"; out of the Curva do Sol and the Café was too soon).
export const CALLOUTS={
 interlagos:[
  {key:'senna',s:280,at:250,say:'S do Senna'},{key:'sol',s:500,at:530,say:'Curva do Sol'},{key:'oposta',s:760,at:1064,straight:true,say:'Reta Oposta'},
  {key:'lago',s:1368,at:1400,say:'Descida do Lago'},
  {key:'ferradura',s:1986,say:'Ferradura'},{key:'laranjinha',s:2140,at:2150,say:'Laranjinha'},{key:'esse',s:2286,say:'Curva do Esse'},
  {key:'pinheirinho',s:2396,at:2440,say:'Pinheirinho'},{key:'bico',s:2712,at:2730,say:'Bico de Pato'},
  {key:'mergulho',s:2884,at:2943,say:'Mergulho'},{key:'juncao',s:3226,at:3236,say:'Junção'},
  {key:'subida',s:3372,say:'Subida dos Boxes'},{key:'cafe',s:3626,say:'Café'},{key:'reta',s:3740,at:4162,straight:true,say:'Reta dos Boxes'},
 ],
 // Chapecó (10-27): its corners have only numbers (the track file's sections, the official count of 12), the two
 // hairpins and the fast sweep named for what they are. Interlagos' timing taken to them: the corners at the end of a
 // long straight (1, 2, 5) 30 m before they turn, as the S do Senna; the long ones (7, the sweep, and 12) as they
 // begin, as the Curva do Sol; the others a little before the middle (15 to 20 m); the straights in their middle (the
 // Reta principal's is the line). On the lap as it was redrawn the same evening (Curva 2 a plain left, the straights
 // straight, the Curva 7 one constant-radius sweep), as scripts/propor_chamadas_curvas.mjs proposes it.
 chapeco:[
  {key:'c1',s:410,at:380,say:'Curva 1, grampo'},{key:'reta2',s:620,at:920,straight:true,say:'Reta 2'},
  {key:'c2',s:1220,at:1190,say:'Curva 2'},{key:'c3',s:1390,at:1417,say:'Curva 3'},{key:'c4',s:1590,at:1617,say:'Curva 4'},
  {key:'reta3',s:1680,at:1890,straight:true,say:'Reta 3'},
  {key:'c5',s:2100,at:2070,say:'Curva 5, grampo'},{key:'c6',s:2330,at:2337,say:'Curva 6'},{key:'c7',s:2490,at:2515,say:'Curva 7, de alta'},
  {key:'c8',s:2930,at:2957,say:'Curva 8'},{key:'c9',s:3090,at:3107,say:'Curva 9'},{key:'c10',s:3160,at:3167,say:'Curva 10'},
  {key:'c11',s:3270,at:3287,say:'Curva 11'},{key:'c12',s:3380,at:3405,say:'Curva 12'},
  {key:'principal',s:3590,at:3995,straight:true,say:'Reta principal'},
 ],
 // Chapecó's oval (variantOf chapeco): the main straight, the Curva 1 hairpin, the Reta 2 and the S2 that closes the
 // oval back onto the main straight (a 210° hairpin at the end of the Reta 2, 30 m before it turns).
 chapecooval:[
  {key:'principal',s:1320,at:133,straight:true,say:'Reta principal'},{key:'c1',s:410,at:380,say:'Curva 1, grampo'},
  {key:'reta2',s:620,at:890,straight:true,say:'Reta 2'},{key:'s2',s:1160,at:1130,say:'S2, ligação do oval'},
 ],
 // The other circuits (10-27, the user: "faz agora todos os demais autódromos"), as scripts/propor_chamadas_curvas.mjs
 // proposes them from the HUD's sections and the bends of the lap, by the same timing; the city circuits name the
 // street 20 m before the car turns into it, as Waze does (place: true).
 curvelo:[
  {key:'reta_principal',s:1150,at:60,straight:true,say:'Reta principal'},
  {key:'curva_inclinada',s:220,at:190,say:'Curva inclinada'},
  {key:'reta_oposta',s:560,at:740,straight:true,say:'Reta oposta'},
  {key:'curva_plana',s:920,at:890,say:'Curva plana'},
 ],
 cascavel:[
  {key:'reta_dos_boxes',s:2920,at:127,straight:true,say:'Reta dos boxes'},
  {key:'baciao',s:390,at:360,say:'Bacião'},
  {key:'reta_oposta',s:790,at:935,straight:true,say:'Reta oposta'},
  {key:'dobra_da_reta_oposta',s:1080,at:1117,say:'Dobra da reta oposta'},
  {key:'curva_a_direita_do_topo',s:1240,at:1265,say:'Curva à direita do topo'},
  {key:'tangencia_a_direita',s:1540,at:1557,say:'Tangência à direita'},
  {key:'primeira_das_curvas_geme',s:1880,at:1850,say:'Primeira das curvas gêmeas'},
  {key:'segunda_das_curvas_gemea',s:2070,at:2097,say:'Segunda das curvas gêmeas'},
  {key:'reta_de_tras',s:2180,at:2490,straight:true,say:'Reta de trás'},
  {key:'curva_para_a_reta_dos_bo',s:2800,at:2770,say:'Curva para a reta dos boxes'},
 ],
 piracicaba:[
  {key:'reta_principal',s:1820,at:51,straight:true,say:'Reta principal'},
  {key:'curva_do_paddock',s:200,at:227,say:'Curva do paddock'},
  {key:'anel_externo',s:410,at:435,say:'Anel externo'},
  {key:'entrada_do_miolo',s:680,at:707,say:'Entrada do miolo'},
  {key:'miolo',s:840,at:867,say:'Miolo'},
  {key:'grampo_do_miolo',s:1130,at:1147,say:'Grampo do miolo'},
  {key:'grampo_interno',s:1360,at:1387,say:'Grampo interno'},
  {key:'curva_da_reta_principal',s:1660,at:1685,say:'Curva da reta principal'},
 ],
 brasilia:[
  {key:'curva_1_de_alta',s:260,at:230,say:'Curva 1, de alta'},
  {key:'reta_longa',s:410,at:795,straight:true,say:'Reta longa'},
  {key:'curvas_2_e_3',s:1180,at:1150,say:'Curvas 2 e 3'},
  {key:'curva_4',s:1570,at:1540,say:'Curva 4'},
  {key:'curvas_5_e_6_o_laco',s:1860,at:1830,say:'Curvas 5 e 6, o laço'},
  {key:'curva_7',s:2320,say:'Curva 7'},
  {key:'curva_8',s:2640,at:2610,say:'Curva 8'},
  {key:'curva_9',s:2910,at:2937,say:'Curva 9'},
  {key:'reta_oposta',s:2990,at:3220,straight:true,say:'Reta oposta'},
  {key:'curvas_10_e_11_grampo',s:3450,at:3420,say:'Curvas 10 e 11, grampo'},
  {key:'curva_12',s:3760,at:3787,say:'Curva 12'},
  {key:'curvas_13_e_14_grampo',s:3990,at:4015,say:'Curvas 13 e 14, grampo'},
  {key:'curva_15',s:4460,at:4485,say:'Curva 15'},
  {key:'curva_16',s:4910,at:4935,say:'Curva 16'},
  {key:'reta_de_largada',s:5100,at:5372,straight:true,say:'Reta de largada'},
 ],
 goiania:[
  {key:'reta_principal',s:3600,at:263,straight:true,say:'Reta principal'},
  {key:'curvas_1_e_2',s:760,at:730,say:'Curvas 1 e 2'},
  {key:'reta_de_cima',s:1070,at:1195,straight:true,say:'Reta de cima'},
  {key:'curva_3',s:1320,at:1327,say:'Curva 3'},
  {key:'curva_4_grampo',s:1540,at:1510,say:'Curva 4, grampo'},
  {key:'curva_5',s:1870,at:1897,say:'Curva 5'},
  {key:'curvas_6_e_7_grampo',s:2110,at:2135,say:'Curvas 6 e 7, grampo'},
  {key:'curva_8',s:2310,at:2327,say:'Curva 8'},
  {key:'curva_9',s:2610,at:2580,say:'Curva 9'},
  {key:'curva_10',s:2720,at:2690,say:'Curva 10'},
  {key:'curvas_11_e_12',s:2800,at:2825,say:'Curvas 11 e 12'},
  {key:'reta_oposta',s:3000,at:3185,straight:true,say:'Reta oposta'},
  {key:'curvas_13_e_14',s:3370,at:3340,say:'Curvas 13 e 14'},
 ],
 guaratiba:[
  {key:'reta_de_largada',s:4360,at:20,straight:true,say:'Reta de largada'},
  {key:'curva_1',s:390,at:360,say:'Curva 1'},
  {key:'curva_2',s:550,at:567,say:'Curva 2'},
  {key:'curva_3',s:700,at:725,say:'Curva 3'},
  {key:'curva_4',s:1260,at:1277,say:'Curva 4'},
  {key:'curva_5',s:1370,at:1377,say:'Curva 5'},
  {key:'curvas_6_e_7_o_laco',s:1580,at:1605,say:'Curvas 6 e 7, o laço'},
  {key:'reta_oeste',s:1960,at:2290,straight:true,say:'Reta oeste'},
  {key:'curva_8',s:2620,at:2590,say:'Curva 8'},
  {key:'reta_sul',s:2700,at:2980,straight:true,say:'Reta sul'},
  {key:'curva_9',s:3260,at:3230,say:'Curva 9'},
  {key:'reta_paralela',s:3350,at:3810,straight:true,say:'Reta paralela'},
  {key:'curva_10_grampo',s:4270,at:4240,say:'Curva 10, grampo'},
 ],
 velocitta:[
  {key:'reta_dos_boxes',s:3100,at:57,straight:true,say:'Reta dos boxes'},
  {key:'curva_1',s:340,at:310,say:'Curva 1'},
  {key:'curva_2',s:600,at:627,say:'Curva 2'},
  {key:'caipirinha',s:800,at:827,say:'Caipirinha'},
  {key:'curva_5',s:1170,at:1197,say:'Curva 5'},
  {key:'curva_da_mata',s:1420,at:1447,say:'Curva da Mata'},
  {key:'grampo_do_museu',s:1670,at:1697,say:'Grampo do Museu'},
  {key:'reta_oposta',s:1770,at:2025,straight:true,say:'Reta oposta'},
  {key:'curva_do_guiga',s:2280,at:2250,say:'Curva do Guiga'},
  {key:'curva_10',s:2390,at:2427,say:'Curva 10'},
  {key:'alto_do_guiga',s:2520,at:2537,say:'Alto do Guiga'},
  {key:'curva_11_grampo',s:2620,at:2645,say:'Curva 11, grampo'},
  {key:'ferradura',s:2870,at:2895,say:'Ferradura'},
 ],
 chapada:[
  {key:'curva_1',s:740,at:710,say:'Curva 1'},
  {key:'paredao_leste',s:1020,at:1057,say:'Paredão leste'},
  {key:'bico',s:1600,at:1570,say:'Bico'},
  {key:'borda_sul',s:1680,at:2175,straight:true,say:'Borda sul'},
  {key:'s_do_mirante',s:2670,at:2640,say:'S do Mirante'},
  {key:'curva_da_volta',s:3690,at:3660,say:'Curva da Volta'},
  {key:'curva_do_cerrado',s:3810,at:3837,say:'Curva do Cerrado'},
  {key:'reta_principal',s:3900,at:4891,straight:true,say:'Reta principal'},
 ],
 floripa:[
  {key:'alameda_adolfo_konder',s:394,at:374,place:true,say:'Alameda Adolfo Konder'},
  {key:'rua_hoepcke',s:668,at:648,place:true,say:'Rua Hoepcke'},
  {key:'rua_claudino_bento_da_si',s:870,at:850,place:true,say:'Rua Claudino Bento da Silva'},
  {key:'av_paulo_fontes',s:1030,at:1010,place:true,say:'Av. Paulo Fontes'},
  {key:'rua_pedro_bittencourt',s:1392,at:1372,place:true,say:'Rua Pedro Bittencourt'},
  {key:'ponte_colombo_salles',s:1868,at:1848,place:true,say:'Ponte Colombo Salles'},
  {key:'estreito',s:3172,at:3152,place:true,say:'Estreito'},
  {key:'rua_14_de_julho',s:3488,at:3468,place:true,say:'Rua 14 de Julho'},
  {key:'av_gov_ivo_silveira',s:3634,at:3614,place:true,say:'Av. Gov. Ivo Silveira'},
  {key:'ponte_hercilio_luz',s:0,at:4422,place:true,say:'Ponte Hercílio Luz'},
 ],
 minhocao:[
  {key:'av_ipiranga',s:222,at:202,place:true,say:'Av. Ipiranga'},
  {key:'praca_da_republica',s:310,at:290,place:true,say:'Praça da República'},
  {key:'av_vieira_de_carvalho',s:666,at:646,place:true,say:'Av. Vieira de Carvalho'},
  {key:'largo_do_arouche',s:880,at:860,place:true,say:'Largo do Arouche'},
  {key:'av_duque_de_caxias',s:1122,at:1102,place:true,say:'Av. Duque de Caxias'},
  {key:'av_sao_joao',s:1382,at:1362,place:true,say:'Av. São João'},
  {key:'rua_ana_cintra',s:1600,at:1580,place:true,say:'Rua Ana Cintra'},
  {key:'rampa_da_rua_ana_cintra',s:1660,at:1640,place:true,say:'Rampa da Rua Ana Cintra'},
  {key:'minhocao',s:1866,at:1846,place:true,say:'Minhocão'},
  {key:'tunel_sob_a_praca_roosev',s:2622,at:2602,place:true,say:'Túnel sob a Praça Roosevelt'},
  {key:'rua_augusta',s:2996,at:2976,place:true,say:'Rua Augusta'},
  {key:'rua_caio_prado',s:3182,at:3162,place:true,say:'Rua Caio Prado'},
  {key:'rua_dr_cesario_mota_juni',s:3502,at:3482,place:true,say:'Rua Dr. Cesário Mota Júnior'},
  {key:'rua_major_sertorio',s:3774,at:3754,place:true,say:'Rua Major Sertório'},
 ],
 pampulha:[
  {key:'igrejinha_da_pampulha',s:788,at:768,place:true,say:'Igrejinha da Pampulha'},
  {key:'praca_de_iemanja',s:2850,at:2830,place:true,say:'Praça de Iemanjá'},
  {key:'parque_ecologico',s:4882,at:4862,place:true,say:'Parque Ecológico'},
  {key:'zoologico',s:5586,at:5566,place:true,say:'Zoológico'},
  {key:'braco_do_zoologico',s:7862,at:7842,place:true,say:'Braço do Zoológico'},
  {key:'mirante_do_sabia',s:9704,at:9684,place:true,say:'Mirante do Sabiá'},
  {key:'braco_das_garcas',s:11242,at:11222,place:true,say:'Braço das Garças'},
  {key:'reta_dos_boxes',s:11920,at:12822,straight:true,say:'Reta dos boxes'},
  {key:'iate_tenis_clube',s:13724,at:13704,place:true,say:'Iate Tênis Clube'},
  {key:'mirante_bandeirantes',s:15720,at:15700,place:true,say:'Mirante Bandeirantes'},
  {key:'barragem_da_pampulha',s:16140,at:16120,place:true,say:'Barragem da Pampulha'},
  {key:'casa_do_baile',s:17062,at:17042,place:true,say:'Casa do Baile'},
  {key:'av_coronel_oscar_paschoa',s:18962,at:18942,place:true,say:'Av. Coronel Oscar Paschoal'},
  {key:'av_antonio_abrahao_caram',s:19292,at:19272,place:true,say:'Av. Antônio Abrahão Caram'},
  {key:'av_rei_pele',s:19642,at:19622,place:true,say:'Av. Rei Pelé'},
  {key:'av_presidente_carlos_luz',s:20198,at:20178,place:true,say:'Av. Presidente Carlos Luz'},
  {key:'av_coronel_oscar_pasch2',s:20358,at:20338,place:true,say:'Av. Coronel Oscar Paschoal'},
 ],
};
// When to speak: LEAD seconds before the corner at the car's speed, MIN_LEAD metres at least (slow, the name still comes
// before the turn); a callout with its own place (at) in the AT_WINDOW seconds before the car gets there; not below
// MIN_SPEED (stopped, crawling, a spin).
export const LEAD=2.6,MIN_LEAD=55,MIN_SPEED=8,AT_WINDOW=.25;

// Which callout to say now. Pure (no sound, no page): scripts/testar_copiloto.mjs drives it lap after lap.
export class CalloutPlanner{
 constructor(callouts,length,{lead=LEAD,minLead=MIN_LEAD,minSpeed=MIN_SPEED}={}){
  this.callouts=[...callouts].sort((a,b)=>this.point(a)-this.point(b));this.length=length;this.lead=lead;this.minLead=minLead;this.minSpeed=minSpeed;
  this.said=new Set();this.lastS=null;this.okS=null;
 }
 // Where a callout is measured from: its own place, else where its corner begins.
 point(c){return c.at??c.s;}
 ahead(c,s){const L=this.length;return ((this.point(c)-s)%L+L)%L;}
 reach(c,speed){return c.at!=null?Math.max(3,speed*AT_WINDOW):Math.max(this.minLead,speed*this.lead);}
 // s: the car's place on the lap; speed in m/s; ok: the moment allows it (racing, on the lap, not in the pits); busy:
 // the voice is still saying the last one (the next waits, and is dropped if the car gets there first).
 step(s,speed,ok,busy=false){
  const L=this.length,wrap=d=>(d%L+L)%L,prev=this.lastS,moved=prev===null?0:wrap(s-prev);this.lastS=s;
  const forward=moved>0&&moved<L/2;
  // A place not yet said that the car went past since it last could speak: a long frame (a slow machine: fast, a frame
  // can carry the car past a callout's whole window; the tests' headless browser takes up to a second) or a moment's
  // no (a closed road's asphalt brushed at a junction) — said as soon as it can, the one passed last, within 1.5 s of
  // driving; a jump (the rescue: hundreds of metres, the car set down still) or a longer no (a stop, a pause) passes
  // them unsaid.
  const from=this.okS??prev,gone=from===null?0:wrap(s-from);
  let passed=null;
  if(forward&&gone<L/2&&gone<=Math.max(5,speed*1.5))for(const c of this.callouts){const d=this.ahead(c,from);if(d>0&&d<=gone&&!this.said.has(c.key)&&(!passed||d>passed.d))passed={c,d};}
  // A callout behind the car is armed again for the next lap.
  for(const c of this.callouts)if(this.ahead(c,s)>L/2)this.said.delete(c.key);
  if(!ok)return null;
  this.okS=s;
  if(busy||speed<this.minSpeed||!forward)return null;
  if(passed)return passed.c;
  // The next callout not yet said, when it is due: one further on waits for it (fast, the Curva do Esse's lead reaches
  // back past the Laranjinha's place), never said out of order.
  let next=null;
  for(const c of this.callouts){const d=this.ahead(c,s);if(d<=L/2&&!this.said.has(c.key)&&(!next||d<next.d))next={c,d};}
  if(!next||next.d>this.reach(next.c,speed))return null;
  this.said.add(next.c.key);return next.c;
 }
 reset(){this.said.clear();this.lastS=null;this.okS=null;}
}

const PREF='opala99-copiloto-v1';

// The copilot heard: the clips of the circuit's pack through the game's interface sound (the general volume and the
// effects' level) at its own volume (0 to 2, the Áudio tab's "Voz do copiloto"), the music stepping down while it speaks.
export class CornerCallouts{
 constructor(audio){
  this.audio=audio;this.on=true;this.volume=1;this.circuit=null;this.planner=null;this.pack=null;this.bytes=null;this.buffer=null;this.playing=null;this.said=[];
  try{const saved=JSON.parse(localStorage.getItem(PREF));if(typeof saved?.on==='boolean')this.on=saved.on;if(Number.isFinite(saved?.volume))this.volume=Math.min(2,Math.max(0,saved.volume));}catch{}
 }
 save(){try{localStorage.setItem(PREF,JSON.stringify({on:this.on,volume:this.volume}));}catch{}}
 setOn(on){this.on=!!on;this.save();if(!this.on)this.stop();}
 setVolume(v){this.volume=Math.min(2,Math.max(0,Number(v)||0));this.save();if(this.playing)this.playing.gain.gain.value=this.volume;}
 // The circuit raced (its id and lap length): the pack is fetched once; a circuit without callouts stays silent.
 track(id,length){
  if(id===this.circuit&&length===this.planner?.length)return;
  this.stop();this.circuit=id;this.planner=null;this.pack=null;this.bytes=null;this.buffer=null;
  const list=CALLOUTS[id];if(!list||!length)return;this.planner=new CalloutPlanner(list,length);this.fetchPack(id);
 }
 fetchPack(id){
  this.loading=Promise.all([fetch(`./assets/audio/curvas_${id}.json`).then(r=>r.ok?r.json():null),fetch(`./assets/audio/curvas_${id}.mp3`).then(r=>r.ok?r.arrayBuffer():null)])
   .then(([pack,bytes])=>{if(this.circuit===id&&pack&&bytes){this.pack=pack;this.bytes=bytes;}}).catch(()=>{});
  return this.loading;
 }
 decode(){
  const ctx=this.audio?.context;if(!this.bytes||!ctx||this.buffer)return Promise.resolve(this.buffer);
  this.decoding??=ctx.decodeAudioData(this.bytes.slice(0)).then(b=>{this.buffer=b;return b;}).catch(()=>null).finally(()=>{this.decoding=null;});
  return this.decoding;
 }
 // Every frame: the player's car (its place s and speed) and whether the moment allows a callout.
 update(s,speed,ok){
  this.ok=!!ok;
  const ctx=this.audio?.context;if(this.bytes&&ctx&&!this.buffer)this.decode();
  if(!this.planner)return;
  const busy=!!this.playing&&ctx&&ctx.currentTime<this.playing.end;
  if(this.playing&&!busy){this.playing=null;this.audio?.duckMusic?.(0);}
  const c=this.planner.step(s,speed,ok&&this.on&&!!this.buffer,busy);
  if(c)this.say(c.key,s);
 }
 say(key,s=null){
  const ctx=this.audio.context,clip=this.pack?.clips?.[key];if(!ctx||!clip||!this.buffer||!this.audio.uiBus)return false;
  if(this.playing){try{this.playing.source.stop();}catch{}}
  const source=ctx.createBufferSource(),gain=ctx.createGain(),dur=clip.end-clip.start;source.buffer=this.buffer;gain.gain.value=this.volume;
  source.connect(gain);gain.connect(this.audio.uiBus);source.start(ctx.currentTime,clip.start,dur);
  source.onended=()=>{source.disconnect();gain.disconnect();};
  this.playing={source,gain,end:ctx.currentTime+dur,key};this.audio.duckMusic?.(1);
  if(s!==null){this.said.push({key,s:Math.round(s),at:Math.round(performance.now())});if(this.said.length>60)this.said.shift();}
  return true;
 }
 // ▶ Ouvir: one callout at the volume chosen (Interlagos' pack, on a circuit without callouts too).
 async preview(key='sol'){
  if(!this.pack){this.circuit??='interlagos';if(!CALLOUTS[this.circuit])this.circuit='interlagos';await this.fetchPack(this.circuit);}
  await this.decode();return this.say(this.pack?.clips?.[key]?key:Object.keys(this.pack?.clips??{})[0]);
 }
 stop(){if(this.playing){try{this.playing.source.stop();}catch{}this.playing=null;this.audio?.duckMusic?.(0);}this.planner?.reset();}
 info(){return {on:this.on,ok:!!this.ok,volume:this.volume,circuit:this.circuit,callouts:this.planner?.callouts.length??0,ready:!!this.buffer,playing:this.playing?.key??null,said:[...this.said]};}
}
