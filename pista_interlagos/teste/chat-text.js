// The room chat's text rules, one file for both sides: the game (net-room.js, multiplayer-chat.js) and
// the room server (sala-cloudflare/src/index.js imports this file), which applies them again to whatever
// reaches it. A line is plain text and only ever reaches a page as text (textContent), never as markup.
//
// chatText cleans a line: NFC; line breaks and tabs become spaces; no control, format or private
// characters (bidi overrides that turn text round, zero-width ones, tag characters); no blank-looking
// letters (Hangul fillers, the braille blank: an empty line or name that looks like nothing); at most two
// accents stacked on one letter ("zalgo" text spilling over the screen); one space between words;
// CHAT_LENGTH characters, whole ones (an emoji is never cut in half). Empty: nothing to send.
//
// chatLink says whether a line carries a link, which the chat refuses: written out (a scheme such as
// http://, www, a name with its ending such as site.com, an IP address, a link shortener) or dressed up
// (spaces round the dot, [.] and (.), "ponto com", "dot com", look-alike dots, accents or full-width
// letters on it: the line is read without accents and through NFKC first). A dot glued to a word counts
// as a link ("ok.vamos" too): a space after the dot is the way to write it. A space only after the dot is
// a sentence ("Bom. Com certeza"), never a link; "ponto com" only ends a line as one ("um ponto com ele"
// is a sentence).
export const CHAT_LENGTH=80;
const BLANKS=/[ᅟᅠ឴឵᠎⠀ㅤﾠ]/gu;
export const chatText=value=>Array.from((typeof value==='string'?value.slice(0,4*CHAT_LENGTH):'').normalize('NFC')
 .replace(/\s+/g,' ').replace(/\p{C}/gu,'').replace(BLANKS,'').replace(/(\p{M}{2})\p{M}+/gu,'$1').replace(/ +/g,' ').trim())
 .slice(0,CHAT_LENGTH).join('').trim();
// Dots, and what passes for one.
const DOT='[.\\u00B7\\u0701\\u0702\\u06D4\\u2024\\u2027\\u2E33\\u2E3C\\u3002\\uFE52\\uFF0E\\uFF61]';
const ENDINGS='com|net|org|br|gg|io|ly|me|tv|co|xyz|app|site|online|link|live|info|biz|ru|cn|us|uk|de|pt|to|cc|ws|sh|gl|be|fun|shop|store|club|top|win|bet|pro|dev|ai|so|tk|ml|ga|cf|gq|pw|lol|zip|mov|art|blog|page|vip|cam|chat|social|tech|games|game|gift|click|work|world|space|website|cloud|digital|email|news|wiki|bio|ink|lat|mx|ar|cl|uy|py|pe|ec|ve|es|fr|it|jp|kr|onion';
// (the endings "ponto …" may write out, but not words of a sentence: com, me, to, de, pro…)
const SPELT='br|net|org|gg|io|ly|xyz|tv|site|online|link|info|biz|ru|onion';
const LINKS=[
 /[a-z][a-z0-9+.-]{0,15}\s*:\s*\/\s*\//u,                                   // a scheme: http://, hxxp://, ftp:// …
 /\b(?:javascript|vbscript|data|file|mailto)\s*:/u,                         // the ones without slashes
 /\bw\s?w\s?w\b/u,                                                          // www
 new RegExp(`[\\p{L}\\p{N}]${DOT}\\p{L}{2,}`,'u'),                           // glued: site.com, abc.xyz, nome@mail.com
 new RegExp(`[\\p{L}\\p{N}]\\s+${DOT}\\s*(?:${ENDINGS})\\b`,'u'),              // site . com, site .com
 new RegExp(`[\\p{L}\\p{N}]\\s*[\\[({<]\\s*(?:${DOT}|ponto|dot)?\\s*[\\])}>]\\s*(?:${ENDINGS})\\b`,'u'), // site[.]com, site (dot) com
 new RegExp(`\\b(?:ponto|dot)\\s*(?:com(?:\\s*(?:ponto|dot)?\\s*br)?\\s*$|(?:${SPELT})\\b)`,'u'), // site ponto com, site ponto com ponto br
 new RegExp(`\\b\\d{1,3}(?:\\s*${DOT}\\s*\\d{1,3}){3}\\b`,'u'),               // 192.168.0.1
 /\b(?:bit\s*ly|tinyurl|discord\s*gg|goo\s*gl|is\s*gd|wa\s*me|t\s*me)\s*\//u, // shorteners, their dots left out
];
export function chatLink(text){
 const plain=String(text??'').normalize('NFKD').replace(/\p{M}/gu,'').normalize('NFKC').toLowerCase();
 return LINKS.some(rule=>rule.test(plain));
}
