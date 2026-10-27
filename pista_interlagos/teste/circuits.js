// podium (optional): where the story's podium stage stands, [metres along the track from the line, metres across
// it] (immersive-visuals.js), a clear and level spot off the track; without it 35 m past the line, 32 m aside.
// fuel: the litres an 8-lap race takes there, about 1 L left at the flag (Stevan's table, Central #11; fuel.js).
// tank (optional): litres the tank holds there instead of the 15 of every car (fuel.js TANK, Central #17).
export const CIRCUITS=Object.freeze({
 interlagos:{id:'interlagos',name:'Interlagos',label:'AUTÓDROMO JOSÉ CARLOS PACE',length:4309,description:'4.309 m · 15 curvas · São Paulo, SP',intro:'Subidas, descidas e caimentos do relevo municipal. Pit lane completo: entrada depois do Café, retorno na Reta Oposta.',source:'Mapa e pit lane FIA 2025 · GeoSampa LiDAR 2017 e ortofoto 2020 (20 cm).',fuel:10,altitude:720},
 curvelo:{id:'curvelo',name:'Oval de Curvelo',label:'CIRCUITO DOS CRISTAIS · CURVELO, MG',length:1250,description:'1.250 m · 2 curvas · Inclinação de até 16%',intro:'Duas retas, uma curva inclinada e outra plana. O primeiro oval brasileiro entra no grid.',source:'Traçado CBA · extensão NASCAR Brasil · inclinação Circuito dos Cristais. Larguras e terreno aproximados.',fuel:6,altitude:null},
 // Old Stock Race venues rebuilt from open data (scripts/circuitos/, circuitos-fontes.md):
 // data is the track file's name in dados/ (main.js resolves the folder, which differs once
 // published), ground the Sentinel-2 colour of its terrain grid.
 cascavel:{id:'cascavel',podium:[0,-52],name:'Cascavel',label:'AUTÓDROMO ZILMAR BEUX · CASCAVEL, PR',length:3058,description:'3.058 m · 7 curvas · anti-horário · Cascavel, PR',intro:'Reta dos boxes de concreto, em descida, até o Bacião: a curva de quase 200 km/h. 46 m de desnível do relevo real.',source:'Traçado OSM refinado sobre imagem aérea de 2025 · relevo ANADEM (ANA/UFRGS) · cobertura ESA WorldCover e Sentinel-2 de set/2026.',fuel:8,altitude:680,
  data:'pista_cascavel.json',ground:'./assets/circuitos/cascavel_solo.jpg',track:'CASCAVEL',boxTitle:'Cuida do Opala, piá!',weather:'Cascavel · 16h40 · 24 °C · pista seca',venue:'Autódromo Internacional Zilmar Beux'},
 piracicaba:{id:'piracicaba',podium:[0,-60],name:'ECPA Piracicaba',label:'AUTÓDROMO DO ECPA · PIRACICABA, SP',length:1930,description:'1.930 m medidos (2,1 km divulgados) · 9 curvas · horário',intro:'Anel externo rápido e um miolo travado de grampos, com subidas e descidas. Arquibancada na reta, paddock no alto.',source:'Traçado OSM refinado sobre imagem aérea de 2025 · relevo ANADEM (ANA/UFRGS) · cobertura ESA WorldCover e Sentinel-2 de set/2026.',fuel:6,altitude:490,
  data:'pista_piracicaba.json',ground:'./assets/circuitos/piracicaba_solo.jpg',track:'ECPA PIRACICABA',boxTitle:'Cuida do Opala, caipira!',weather:'Piracicaba · 16h40 · 27 °C · pista seca',venue:'Esporte Clube Piracicabano de Automobilismo'},
 // Opened in August 2026: no aerial photo of the finished track yet, so the asphalt was measured on
 // Sentinel-2 and the relief of the earthworks calibrated to the published 18.5 m (circuitos-fontes.md).
 chapeco:{id:'chapeco',podium:[0,60],name:'Chapecó',label:'AUTÓDROMO MÁRCIO VACCARO · CHAPECÓ, SC',length:4004,description:'4.004 m · 12 curvas · horário · Chapecó, SC',intro:'O autódromo mais novo do Brasil, no meio do mato: reta de 837 m diante dos boxes, dois grampos e a curva 7, de alta, com 517 m em raio constante. 18,5 m de desnível.',source:'Traçado OSM (mai/2026) corrigido sobre fotos aéreas de out/2026, a mediana de 5 cenas Sentinel-2 e o diagrama do autódromo, em retas e curvas de projeto · relevo ANADEM (ANA/UFRGS) ajustado aos 18,5 m publicados · cobertura ESA WorldCover.',fuel:9,altitude:420,
  data:'pista_chapeco.json',ground:'./assets/circuitos/chapeco_solo.jpg',track:'CHAPECÓ',boxTitle:'Cuida do Opala, tchê!',weather:'Chapecó · 16h40 · 23 °C · pista seca',venue:'Autódromo Internacional Márcio Vaccaro'},
 // Chapecó's oval (NASCAR Brasil, 31/10 and 01/11/2026): "the oval between turns 1 and 2, 1,452 m", clockwise, one of the
 // autódromo's layouts: the main straight, turn 1, Reta 2 and the S2 link back to the straight (scripts/circuitos/
 // gerar_variante.py: the link measured on Sentinel-2, the rest of the circuit closed by barriers, a pit entry of the
 // game's off the link's outside). variantOf: a layout of that card's place, picked with a box on its card (main.js),
 // never a card or a championship round of its own; its climate, sponsors and asphalt are the place's (placeOf).
 chapecooval:{id:'chapecooval',variantOf:'chapeco',podium:[0,60],name:'Oval de Chapecó',label:'AUTÓDROMO MÁRCIO VACCARO · TRAÇADO OVAL · CHAPECÓ, SC',length:1452,description:'1.452 m · 2 curvas · horário · traçado oval · Chapecó, SC',intro:'O oval da NASCAR Brasil no autódromo novo de Chapecó: a reta de 837 m diante dos boxes, o grampo da curva 1, a Reta 2 e a ligação S2 de volta para a reta. O resto do traçado fica fechado por barreiras.',source:'Traçado oval "entre as curvas 1 e 2, com 1.452 metros" (Prefeitura de Chapecó) · ligação S2 medida na mediana de 5 cenas Sentinel-2 (ago a out/2026) · entrada dos boxes fictícia, por fora da ligação · relevo ANADEM (ANA/UFRGS).',fuel:6,altitude:420,
  data:'pista_chapecooval.json',ground:'./assets/circuitos/chapeco_solo.jpg',track:'CHAPECÓ OVAL',boxTitle:'Cuida do Opala, tchê!',weather:'Chapecó · 16h40 · 23 °C · pista seca',venue:'Autódromo Internacional Márcio Vaccaro'},
 // Reopened in November 2025 after the BRB renovation, the Old Stock's 2026 opener: the new asphalt
 // measured on 2025 aerial imagery, the relief from the DF's 1 m terrain model and the buildings from
 // its cadastre (circuitos-fontes.md). Clockwise, so its boxes are on the cars' right (data.pit.reversed).
 brasilia:{id:'brasilia',podium:[0,70],name:'Brasília',label:'AUTÓDROMO NELSON PIQUET · BRASÍLIA, DF',length:5384,description:'5.384 m · 16 curvas · horário · Brasília, DF',intro:'A pista mais longa do Brasil, reaberta em 2025: largada em descida até a curva 1, de alta e inclinada a 5°, a reta de 803 m e um miolo de grampos e laço. 17,7 m de desnível.',source:'Traçado OSM (fev/2026) refinado sobre imagem aérea de 2025 · relevo do MDT de 1 m e edificações do Geoportal do DF (SEDUH) · Sentinel-2 de set/2026.',fuel:12,altitude:1080,
  data:'pista_brasilia.json',ground:'./assets/circuitos/brasilia_solo.jpg',track:'BRASÍLIA',boxTitle:'Cuida do Opala, véi!',weather:'Brasília · 16h40 · 27 °C · pista seca',venue:'Autódromo Internacional Nelson Piquet'},
 // Reopened for MotoGP in March 2026: the axis measured on the city's 2016 orthophoto, the relief from its 5 m
 // contours and the buildings, floors and city towers from Goiânia's Mapa Fácil (circuitos-fontes.md).
 // Clockwise with the boxes on the cars' right, like Brasília (data.pit.reversed).
 goiania:{id:'goiania',podium:[-10,30],name:'Goiânia',label:'AUTÓDROMO AYRTON SENNA · GOIÂNIA, GO',length:3835,description:'3.835 m · 14 curvas · horário · Goiânia, GO',intro:'A casa da MotoGP no Brasil, reformada em 2026: a reta de 994 m sobe da curva inclinada até a linha, e da curva 1 à 3 a pista desce 13 m. Depois, dois grampos e o S. 17,8 m de desnível.',source:'Traçado OSM refinado sobre a ortofoto de 2016 · relevo das curvas de nível de 5 m e edificações do Mapa Fácil (Prefeitura de Goiânia) · Sentinel-2 de set/2026.',fuel:9,altitude:670,
  data:'pista_goiania.json',ground:'./assets/circuitos/goiania_solo.jpg',track:'GOIÂNIA',boxTitle:'Cuida do Opala, uai!',weather:'Goiânia · 16h40 · 31 °C · pista seca',venue:'Autódromo Internacional Ayrton Senna'},
 // Still a project (Populous and Driven International, presented in November 2025; works after licensing, opening
 // planned for 2028): no plan was published, so its centreline was painted in the track editor (editor-tracado.html) on
 // the official aerial render, rectified by a camera fitted to the city's 2025 orthophoto (circuitos-fontes.md). The
 // ground is today's: a flat lowland 1-2 m above the sea. Anticlockwise, the boxes on the cars' right (data.pit.reversed)
 // with the paddock behind them; the podium stands behind the garages.
 guaratiba:{id:'guaratiba',podium:[35,-60],name:'Guaratiba',label:'AUTÓDROMO PARQUE DE GUARATIBA · RIO DE JANEIRO, RJ',length:4710,description:'4.710 m · 10 curvas · anti-horário · em projeto · Rio de Janeiro, RJ',intro:'O autódromo novo do Rio, que ainda vai sair do papel: duas retas lado a lado ligadas pelo grampo da curva 10, a largada na de dentro, diante dos boxes, e o laço do oeste. Traçado do projeto, pintado sobre o render oficial.',source:'Traçado pintado no editor do jogo sobre o render do projeto (Populous/Driven International, 2025) retificado com a ortofoto 2025 do IPP · relevo ANADEM (ANA/UFRGS) · cobertura ESA WorldCover e Sentinel-2 de out/2026.',fuel:10,altitude:-10,
  data:'pista_guaratiba.json',ground:'./assets/circuitos/guaratiba_solo.jpg',track:'GUARATIBA',boxTitle:'Cuida do Opala, mermão!',weather:'Rio de Janeiro · 16h40 · 30 °C · pista seca',venue:'Autódromo Parque de Guaratiba'},
 // Velocitta (Velo Città, opened in 2012 on a farm 12 km from Mogi Guaçu): a track of many layouts. All its asphalt is
 // built (data.closed_roads: the original turns 3 and 4 and last corner, the links of the short circuits, the museum's
 // road, closed by barriers), the race runs the competition layout only, the Stock Car's since 2017: the Caipirinha for
 // the original 3 and 4, the Ferradura outside the old last corner. Measured 2.8% short of the published 3,443 m (the
 // original layout measures as short of its 3,493 m), kept unscaled on its relief. Anticlockwise, the boxes on the cars'
 // right (data.pit.reversed); the podium stands on the paddock side, past the tent beyond the boxes.
 velocitta:{id:'velocitta',podium:[150,-45],name:'Velocitta',label:'AUTÓDROMO VELOCITTA · MOGI GUAÇU, SP',length:3331,description:'3.331 m medidos (3.443 m divulgados) · 12 curvas · anti-horário · traçado da Stock Car · Mogi Guaçu, SP',intro:'No meio de uma fazenda, entre cafezais e a reserva de mata: o traçado de competição da Stock Car, com a Caipirinha no lugar das curvas 3 e 4 e a Ferradura antes da reta. Depois do grampo do Museu, o alto da volta, a reta oposta mergulha 40 m até o saca-rolha da Curva do Guiga. Os outros traçados estão todos lá, fechados por barreiras.',source:'Traçado OSM (o de competição e os trechos fechados) refinado sobre imagem aérea · relevo ANADEM (ANA/UFRGS) · cobertura ESA WorldCover e Sentinel-2 de set/2026.',fuel:9,altitude:620,
  data:'pista_velocitta.json',ground:'./assets/circuitos/velocitta_solo.jpg',track:'VELOCITTA',boxTitle:'Cuida do Opala, rapaiz!',weather:'Mogi Guaçu · 16h40 · 28 °C · pista seca',venue:'Autódromo Velocitta'},
 // Imaginary (pedido #5 of the Central de Projetos): no circuit exists on the Chapada dos Guimarães. The relief, the
 // walls, the forest and the ground's colour are the real ones; the layout, the boxes and the rim with no guardrail
 // are game design (scripts/circuitos/gerar_chapada.py). Clockwise, the abyss on the left; whoever goes over falls
 // (cliff-fall.js). altitude: the track file's base, so the HUD shows the height above the sea.
 chapada:{id:'chapada',podium:[0,-70],name:'Chapada dos Sonhos',label:'AUTÓDROMO DA CHAPADA DOS SONHOS · CHAPADA DOS GUIMARÃES, MT',length:5153,description:'5.153 m · 8 curvas · horário · imaginário · Chapada dos Guimarães, MT',intro:'Um autódromo que não existe, no alto do paredão da Chapada: sem guard-rail, a 2 a 6 m de um precipício de mais de 100 m. A reta de 2 km termina de frente para o abismo; depois, o Bico e o S do Mirante. Quem sai da pista, cai.',source:'Traçado imaginário sobre o relevo real · ANADEM (ANA/UFRGS) e Copernicus GLO-30 · cobertura ESA WorldCover e Sentinel-2 de out/2026.',fuel:11,altitude:290,
  data:'pista_chapada.json',ground:'./assets/circuitos/chapada_solo.jpg',track:'CHAPADA',boxTitle:'Cuida do Opala, cumpadi!',weather:'Chapada dos Guimarães · 16h40 · 29 °C · pista seca',venue:'Autódromo da Chapada dos Sonhos'},
 // Imaginary street circuit (the team's request, 10-11): the real streets, bridges, relief, sea and buildings of
 // Florianópolis (OSM and the city's GeoFloripa, scripts/circuitos/gerar_floripa.py); the walls, the closed lap and
 // the boxes in front of the bus station are game design. The start is on the Ponte Hercílio Luz towards the island
 // (meta.decks: the road runs on the bridge decks out to the parapets). Clockwise, the boxes on the cars' right.
 // Since 10-15 (the team's request) the real city round it, turned into a race track for a weekend like Monaco: its
 // streets, sidewalks, squares and seafront, crossings, traffic lights and bus stops, the buildings on their real
 // footprints (data.scenery.city, gerar_cidade_floripa.py), the side streets closed off where they meet the walls,
 // bare concrete blocks instead of a circuit's painted walls.
 floripa:{id:'floripa',podium:[1385,-30],name:'Autódromo Floripa',label:'AUTÓDROMO FLORIPA · FLORIANÓPOLIS, SC',length:4445,description:'4.445 m · 11 curvas · horário · circuito de rua imaginário · Florianópolis, SC',intro:'Largada sobre a Ponte Hercílio Luz rumo à ilha. Desce a Rua Hoepcke até o aterro, passa a Rodoviária pela Paulo Fontes, volta ao continente pela Ponte Colombo Salles e sobe o Estreito. No meio da cidade de verdade, como Mônaco: as ruas que cruzam a pista fechadas com barreiras e cones, gente nas calçadas, semáforos piscando e a beira-mar.',source:'Ruas, calçadas, faixas, semáforos e paradas do OpenStreetMap · relevo de 1 m, meios-fios, praças, edificações e batimetria do GeoFloripa (Prefeitura de Florianópolis) · Sentinel-2 de set/2026.',fuel:10,altitude:0,
  data:'pista_floripa.json',ground:'./assets/circuitos/floripa_solo.jpg',track:'FLORIPA',boxTitle:'Cuida do Opala, ó-lhó-lhó!',weather:'Florianópolis · 16h40 · 24 °C · pista seca',venue:'Autódromo Floripa'},
 // Imaginary street circuit (the team's request, 10-11): the real streets of São Paulo's Centro, the Elevado Presidente
 // João Goulart (the Minhocão) and the Radial Leste-Oeste tunnel under Praça Roosevelt (OSM and the city's GeoSampa,
 // scripts/circuitos/gerar_minhocao.py). The lap runs over the Minhocão (meta.decks), dives into the tunnel (meta.tunnels)
 // and later passes under the same deck on Rua Major Sertório, where it starts: a grade-separated crossing.
 minhocao:{id:'minhocao',podium:[334,-118],name:'Circuito do Minhocão',label:'CIRCUITO DO MINHOCÃO · SÃO PAULO, SP',length:4035,description:'4.035 m · 15 curvas · por cima e por baixo · circuito de rua imaginário · São Paulo, SP',intro:'Largada na Major Sertório, logo depois de passar por baixo do Minhocão. Contorna a Praça da República, desce o Largo do Arouche, sobe pela rampa da Ana Cintra e corre 790 m em cima do elevado até mergulhar no túnel sob a Praça Roosevelt. Sai na Augusta e volta para passar por baixo de onde já passou por cima.',source:'Ruas e prédios do OpenStreetMap · LiDAR, ortofoto 2020, meios-fios e árvores do GeoSampa (Prefeitura de São Paulo).',fuel:9,altitude:0,
  data:'pista_minhocao.json',ground:'./assets/circuitos/minhocao_solo.jpg',track:'MINHOCÃO',boxTitle:'Cuida do Opala, meu!',weather:'São Paulo · 16h40 · 23 °C · pista seca',venue:'Circuito do Minhocão'},
 // Imaginary street circuit (pedido #8 of the Central de Projetos, 10-17): the whole shore road of the Lagoa da Pampulha
 // in Belo Horizonte, clockwise, and a loop round the Mineirão (scripts/circuitos/gerar_pampulha.py: OSM streets, the
 // city's 2015 LiDAR, buildings, kerbs and lake from BHGeo). The start is on Av. Coronel Oscar Paschoal towards the lake,
 // the boxes on its other carriageway, beside the Mineirão. Over 20 km: always a one-lap race (laps).
 pampulha:{id:'pampulha',name:'Circuito da Pampulha',label:'CIRCUITO DA PAMPULHA · BELO HORIZONTE, MG',length:20533,laps:1,description:'20.533 m · 67 curvas · horário · uma volta só · circuito de rua imaginário · Belo Horizonte, MG',intro:'Largada na Av. Coronel Oscar Paschoal rumo à lagoa. A volta inteira da orla da Pampulha no sentido horário: Igrejinha, Parque Ecológico, zoológico, os braços da lagoa e a barragem; depois sobe a Oscar Paschoal e contorna o Mineirão. Corrida de uma volta só.',source:'Ruas do OpenStreetMap · LiDAR 2015, edificações, meios-fios, lagoa e ortofoto do BHGeo (Prefeitura de Belo Horizonte / PRODABEL).',fuel:40,tank:40,altitude:800,
  data:'pista_pampulha.json',ground:'./assets/circuitos/pampulha_solo.jpg',track:'PAMPULHA',boxTitle:'Cuida do Opala, sô!',weather:'Belo Horizonte · 16h40 · 26 °C · pista seca',venue:'Circuito da Pampulha'}
});
export const circuitId=value=>typeof value==='string'&&Object.hasOwn(CIRCUITS,value)?value:'interlagos';
// The place a circuit is raced at: a layout of another card's autódromo (variantOf) is that autódromo (its card, aerial
// photo, climate, local sponsors, asphalt); any other circuit is its own.
export const placeOf=id=>CIRCUITS[id]?.variantOf??id;
// A circuit may fix its race length (laps, mirrored in its track file as meta.laps: Pampulha's single 20 km lap). Every
// race there runs that many laps whatever the player's setting, which stays saved for the other circuits; its records'
// race times are over that distance (lap-records.js, ai-records.js). null: the race runs the laps chosen.
export const fixedLaps=id=>typeof id==='string'&&Object.hasOwn(CIRCUITS,id)?CIRCUITS[id].laps??null:null;
export const raceLaps=(id,chosen)=>fixedLaps(id)??chosen;
export function selectedCircuit(saved,search=''){
 const value=new URLSearchParams(search).get('circuito');
 return CIRCUITS[value!==null?circuitId(value):circuitId(saved)];
}
// band: rows kept clear at the top for the circuit name. A wide track keeps its centred place
// under the name; a tall one moves down and the canvas grows (project.height) instead of shrinking.
export function mapProjection(samples,width=260,height=300,band=0){
 const xs=samples.map(p=>p[1]),ys=samples.map(p=>p[2]);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const scale=Math.min((width-32)/Math.max(1,maxX-minX),(height-36)/Math.max(1,maxY-minY));
 const drawn=(maxY-minY)*scale,top=Math.max((height-drawn)/2,band),centre=top+drawn/2;
 const project=(x,y)=>[width/2+(x-(minX+maxX)/2)*scale,centre-(y-(minY+maxY)/2)*scale];
 project.height=Math.max(height,Math.ceil(top+drawn+18));
 return project;
}
