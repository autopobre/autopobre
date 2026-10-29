// Nicknames, for the pilot's own choice (index.js) and the admin's (admin.js).
// A nickname: 3 to 20 letters or digits, with single spaces, dots, dashes or underscores between them (those do not
// count: "A.B" is two). Letters of Portuguese and its neighbours only (A-Z and the accented ones of Latin-1): no small
// capitals, no look-alikes from other alphabets. Its key, unique, reads it the way an eye does: no case, no accents,
// no separators, and I, l and 1 alike, O and 0 alike ("João", "joao", "J.O.A.O" are one pilot; "KIeber" is "Kleber").
const NICKNAME=/^[A-Za-z0-9À-ÖØ-öø-ÿ](?:[A-Za-z0-9À-ÖØ-öø-ÿ ._-]{1,18})[A-Za-z0-9À-ÖØ-öø-ÿ]$/,LETTERS=/[A-Za-z0-9À-ÖØ-öø-ÿ]/g;
export function cleanNickname(value){
 const nick=String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim().normalize('NFC');
 return NICKNAME.test(nick)&&!/[ ._-]{2}/.test(nick)&&nick.match(LETTERS).length>=3?nick:null;
}
export const nicknameKey=nick=>nick.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[ ._-]/g,'').replace(/[i1]/g,'l').replace(/0/g,'o');
// Names a pilot cannot take: the game's people and the ones that would pass for its staff. Only an admin gives one
// (admin.js: the real Stevan gets "Stevan"); whoever has one may still change its case or accents.
export const RESERVED=new Set(['stevan','stevangaipo','gaipo','pobrepiloto','kleber','admin','administrador','moderador','moderacao','autopobre','autopobreracing','suporte','oficial','google'].map(nicknameKey));
export const NICKNAME_RULE='Use de 3 a 20 letras ou números (espaço, ponto, traço ou sublinhado só entre eles).';
