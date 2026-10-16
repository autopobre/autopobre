// migrar.html: stores the saves the old address sent (save-migration.js), then opens the page the
// player was going to, with the link's other parts (#desafio=NOME) intact.
import {readMigrationLink,importSaves} from './save-migration.js';
const {saves,destination,rest}=readMigrationLink(location.hash);
const target=destination+(rest?'#'+rest:'');
// The saves leave the address bar and this history entry at once.
try{history.replaceState(null,'',location.pathname);}catch{}
const go=()=>location.replace(target);
document.getElementById('seguir').href=target;
if(!saves)go();
else{
 const {ok,brought}=await importSaves(saves);
 document.getElementById('situacao').textContent=!ok?'Não deu para trazer os dados do endereço antigo, mas o jogo continua aqui.':brought.length?'Pronto: seus recordes, o saldo e as preferências vieram junto.':'Seus dados já estavam neste endereço; nada foi substituído.';
 setTimeout(go,3500);
}
