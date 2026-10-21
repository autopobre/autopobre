// História das Corridas: the tracks whose story can be watched (track-history.js plays them), as the opening's own
// screen and the track screen's button offer them. Each story's script is loaded only when it is watched; chapters
// and minutes are checked against the script by scripts/testar_historia.mjs.
export const HISTORIAS=Object.freeze([
 {circuit:'interlagos',title:'A história de Interlagos',place:'Autódromo José Carlos Pace · São Paulo',years:'1940 – 2026',
  summary:'O circuito de oito quilômetros de 1940, a reforma de 1990, o S do Senna, a pista que hoje corre ao contrário e de onde vem o nome de cada curva.',
  chapters:10,minutes:8,picture:'assets/historia/historia_mapa_2.jpg',load:()=>import('./historia-interlagos.js'),
  en:{title:'The story of Interlagos',place:'Autódromo José Carlos Pace · São Paulo',
   summary:"The eight-kilometre circuit of 1940, the 1990 rebuild, Senna's S, the track that now runs in reverse and where each corner's name comes from.",minutes:8}},
]);
