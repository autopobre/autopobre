// The copilot's callouts of one circuit (for gerar_chamadas_curvas.py, verificar_copiloto.py): a JSON list of
// {key, s, at, say} on stdout (at only where the callout has its own place).
//   node scripts/chamadas_curvas.mjs interlagos
import {CALLOUTS} from '../teste/corner-callouts.js';

const [id='interlagos']=process.argv.slice(2);
if(!CALLOUTS[id])throw new Error(`no callouts for ${id}`);
process.stdout.write(JSON.stringify(CALLOUTS[id].map(c=>({key:c.key,s:c.s,...(c.at!=null&&{at:c.at}),say:c.say}))));
