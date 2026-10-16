// Runs before the game, in every published version (the workflow adds it to each index.html). A
// browser that never brought its saves from the old address hops there once and comes back through
// migrar.html (save-migration.js), which sets MIGRATED: with it set nothing happens, nor on a second
// try in the same tab (the old address down), after the deadline, or for crawlers and headless browsers.
(function(){
 var MIGRATED='autopobre-migrado-v1',OLD='https://www.inteligenciamilgrau.com.br/autopobre/',UNTIL=Date.UTC(2027,3,1);
 try{
  if(Date.now()>UNTIL||navigator.webdriver||/bot|crawl|spider|slurp|lighthouse|headless/i.test(navigator.userAgent||''))return;
  if(localStorage.getItem(MIGRATED)!==null||sessionStorage.getItem(MIGRATED)!==null)return;
  sessionStorage.setItem(MIGRATED,'tentou');
  location.replace(OLD+'#volta='+encodeURIComponent(location.pathname+location.search+location.hash));
 }catch(e){}
})();
