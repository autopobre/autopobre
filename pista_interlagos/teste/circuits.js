// podium (optional): where the story's podium stage stands, [metres along the track from the line, metres across
// it] (immersive-visuals.js), a clear and level spot off the track; without it 35 m past the line, 32 m aside.
export const CIRCUITS=Object.freeze({
 interlagos:{id:'interlagos',name:'Interlagos',label:'AUTÓDROMO JOSÉ CARLOS PACE',length:4309,description:'4.309 m · 15 curvas · São Paulo, SP',intro:'Subidas, descidas e caimentos do relevo municipal. Pit lane completo: entrada depois do Café, retorno na Reta Oposta.',source:'Mapa e pit lane FIA 2025 · GeoSampa LiDAR 2017 e ortofoto 2020 (20 cm).',fuel:'Uma volta em Interlagos costuma gastar 3–4 L.',altitude:720},
 curvelo:{id:'curvelo',name:'Oval de Curvelo',label:'CIRCUITO DOS CRISTAIS · CURVELO, MG',length:1250,description:'1.250 m · 2 curvas · Inclinação de até 16%',intro:'Duas retas, uma curva inclinada e outra plana. O primeiro oval brasileiro entra no grid.',source:'Traçado CBA · extensão NASCAR Brasil · inclinação Circuito dos Cristais. Larguras e terreno aproximados.',fuel:'O oval é curto: reserve 1–2 L por volta.',altitude:null},
 // Old Stock Race venues rebuilt from open data (scripts/circuitos/, circuitos-fontes.md):
 // data is the track file's name in dados/ (main.js resolves the folder, which differs once
 // published), ground the Sentinel-2 colour of its terrain grid.
 cascavel:{id:'cascavel',podium:[0,-52],name:'Cascavel',label:'AUTÓDROMO ZILMAR BEUX · CASCAVEL, PR',length:3058,description:'3.058 m · 7 curvas · anti-horário · Cascavel, PR',intro:'Reta dos boxes de concreto, em descida, até o Bacião: a curva de quase 200 km/h. 46 m de desnível do relevo real.',source:'Traçado OSM refinado sobre imagem aérea de 2025 · relevo ANADEM (ANA/UFRGS) · cobertura ESA WorldCover e Sentinel-2 de set/2026.',fuel:'Uma volta em Cascavel costuma gastar 2–3 L.',altitude:680,
  data:'pista_cascavel.json',ground:'./assets/circuitos/cascavel_solo.jpg',track:'CASCAVEL',boxTitle:'Cuida do Opala, piá!',weather:'Cascavel · 16h40 · 24 °C · pista seca',venue:'Autódromo Internacional Zilmar Beux'},
 piracicaba:{id:'piracicaba',podium:[0,-60],name:'ECPA Piracicaba',label:'AUTÓDROMO DO ECPA · PIRACICABA, SP',length:1930,description:'1.930 m medidos (2,1 km divulgados) · 9 curvas · horário',intro:'Anel externo rápido e um miolo travado de grampos, com subidas e descidas. Arquibancada na reta, paddock no alto.',source:'Traçado OSM refinado sobre imagem aérea de 2025 · relevo ANADEM (ANA/UFRGS) · cobertura ESA WorldCover e Sentinel-2 de set/2026.',fuel:'O traçado é curto: reserve 1,5–2 L por volta.',altitude:490,
  data:'pista_piracicaba.json',ground:'./assets/circuitos/piracicaba_solo.jpg',track:'ECPA PIRACICABA',boxTitle:'Cuida do Opala, caipira!',weather:'Piracicaba · 16h40 · 27 °C · pista seca',venue:'Esporte Clube Piracicabano de Automobilismo'},
 // Opened in August 2026: no aerial photo of the finished track yet, so the asphalt was measured on
 // Sentinel-2 and the relief of the earthworks calibrated to the published 18.5 m (circuitos-fontes.md).
 chapeco:{id:'chapeco',podium:[0,60],name:'Chapecó',label:'AUTÓDROMO MÁRCIO VACCARO · CHAPECÓ, SC',length:4004,description:'4.004 m · 12 curvas · horário · Chapecó, SC',intro:'O autódromo mais novo do Brasil, no meio do mato: reta de 837 m diante dos boxes, dois grampos e a curva 7, de alta, com 517 m em raio constante. 18,5 m de desnível.',source:'Traçado OSM (mai/2026) refinado sobre Sentinel-2 de set/2026 · relevo ANADEM (ANA/UFRGS) ajustado aos 18,5 m publicados · cobertura ESA WorldCover.',fuel:'Uma volta em Chapecó costuma gastar 3–4 L.',altitude:420,
  data:'pista_chapeco.json',ground:'./assets/circuitos/chapeco_solo.jpg',track:'CHAPECÓ',boxTitle:'Cuida do Opala, tchê!',weather:'Chapecó · 16h40 · 23 °C · pista seca',venue:'Autódromo Internacional Márcio Vaccaro'},
 // Reopened in November 2025 after the BRB renovation, the Old Stock's 2026 opener: the new asphalt
 // measured on 2025 aerial imagery, the relief from the DF's 1 m terrain model and the buildings from
 // its cadastre (circuitos-fontes.md). Clockwise, so its boxes are on the cars' right (data.pit.reversed).
 brasilia:{id:'brasilia',podium:[0,70],name:'Brasília',label:'AUTÓDROMO NELSON PIQUET · BRASÍLIA, DF',length:5384,description:'5.384 m · 16 curvas · horário · Brasília, DF',intro:'A pista mais longa do Brasil, reaberta em 2025: largada em descida até a curva 1, de alta e inclinada a 5°, a reta de 803 m e um miolo de grampos e laço. 17,7 m de desnível.',source:'Traçado OSM (fev/2026) refinado sobre imagem aérea de 2025 · relevo do MDT de 1 m e edificações do Geoportal do DF (SEDUH) · Sentinel-2 de set/2026.',fuel:'Uma volta em Brasília costuma gastar 4–5 L.',altitude:1080,
  data:'pista_brasilia.json',ground:'./assets/circuitos/brasilia_solo.jpg',track:'BRASÍLIA',boxTitle:'Cuida do Opala, véi!',weather:'Brasília · 16h40 · 27 °C · pista seca',venue:'Autódromo Internacional Nelson Piquet'},
 // Reopened for MotoGP in March 2026: the axis measured on the city's 2016 orthophoto, the relief from its 5 m
 // contours and the buildings, floors and city towers from Goiânia's Mapa Fácil (circuitos-fontes.md).
 // Clockwise with the boxes on the cars' right, like Brasília (data.pit.reversed).
 goiania:{id:'goiania',podium:[-10,30],name:'Goiânia',label:'AUTÓDROMO AYRTON SENNA · GOIÂNIA, GO',length:3835,description:'3.835 m · 14 curvas · horário · Goiânia, GO',intro:'A casa da MotoGP no Brasil, reformada em 2026: a reta de 994 m sobe da curva inclinada até a linha, e da curva 1 à 3 a pista desce 13 m. Depois, dois grampos e o S. 17,8 m de desnível.',source:'Traçado OSM refinado sobre a ortofoto de 2016 · relevo das curvas de nível de 5 m e edificações do Mapa Fácil (Prefeitura de Goiânia) · Sentinel-2 de set/2026.',fuel:'Uma volta em Goiânia costuma gastar 3–4 L.',altitude:670,
  data:'pista_goiania.json',ground:'./assets/circuitos/goiania_solo.jpg',track:'GOIÂNIA',boxTitle:'Cuida do Opala, uai!',weather:'Goiânia · 16h40 · 31 °C · pista seca',venue:'Autódromo Internacional Ayrton Senna'}
});
export const circuitId=value=>typeof value==='string'&&Object.hasOwn(CIRCUITS,value)?value:'interlagos';
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
