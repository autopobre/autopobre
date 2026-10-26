// The multiplayer rooms' pass (sala-cloudflare/src/passe.js, its format): the room server lets in only
// pilots signed in here, under their nickname. A signed-in account with a nickname asks for one for the
// room it opens (POST /api/conta/passe-sala {sala}); the pass says who, for that room, for a few minutes,
// signed with SALA_PASSE, a secret this Worker shares with the room server. The rooms know the account by
// an HMAC of its Google id (accountKey): enough to keep a kicked pilot out, never the id itself.
// The lobby (LOBBY: the room server's who-is-online for the hosts' invitations) takes the same pass. Nothing is
// written: the pass is the whole record.
import {makePass,accountKey,secretReady,PASS_LIFE,LOBBY} from '../../sala-cloudflare/src/passe.js';
import {json,signedIn,notSignedIn} from './base.js';
const ROOM=/^[a-z0-9-]{1,24}$/;

async function roomPass(request,env,body){
 const s=await signedIn(request,env);if(!s)return notSignedIn();
 // (the name the others see in the room: one the pilot chose, never a stand-in)
 if(!s.apelido)return json({erro:'Escolha seu apelido antes de entrar numa sala.'},409);
 const room=body.sala===LOBBY||typeof body.sala==='string'&&ROOM.test(body.sala)?body.sala:null;
 if(!room)return json({erro:'Sala inválida.'},400);
 // Without SALA_PASSE, or with one too short to be a secret (passe.js SECRET_MIN), the rooms are off: the game says
 // so and asks again now and then, never as if this server were down.
 if(!secretReady(env.SALA_PASSE))return json({erro:'As salas ainda não estão ligadas.'},503);
 const passe=await makePass(env.SALA_PASSE,{account:await accountKey(env.SALA_PASSE,s.google_sub),name:s.apelido,room});
 return json({passe,validade:PASS_LIFE});
}

export const ROOM_POSTS={'/api/conta/passe-sala':roomPass};
