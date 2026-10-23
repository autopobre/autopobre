// What a circuit's history says aloud, line by line, in one language (for gerar_narracao.py): a JSON list of
// {key: '<chapter id>/<line in the chapter>', say} on stdout, the same words the player gives the voice.
//   node scripts/falas_historia.mjs interlagos [pt|en]
import {buildTimeline} from '../teste/track-history.js';

const [id='interlagos',lang='pt']=process.argv.slice(2);
const {HISTORY}=await import(`../teste/historia-${id}.js`);
const timeline=buildTimeline(HISTORY,lang);
const lines=timeline.lines.map(l=>({key:`${timeline.chapters[l.chapter].id}/${l.inChapter}`,say:l.say}));
process.stdout.write(JSON.stringify({story:HISTORY.id,lang,lines}));
