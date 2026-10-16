// migrar.html: stores the saves the old address sent, marks the browser as migrated and opens the
// page the player was going to, with nothing on screen (save-migration.js).
import {arriveFromOldAddress} from './save-migration.js';
const link=location.hash;
// The saves leave the address bar and this history entry at once.
try{history.replaceState(null,'',location.pathname);}catch{}
const {target}=await arriveFromOldAddress(link);
location.replace(target);
