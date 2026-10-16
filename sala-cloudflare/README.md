# Servidor das salas multiplayer

Um Worker do Cloudflare com um Durable Object por sala (`src/index.js`). Os navegadores dos pilotos só conversam com ele, por WebSocket; ninguém vê o IP de ninguém. O jogo continua no GitHub Pages.

O servidor garante, seja lá o que o navegador mande:

- **Chave do grupo:** sem ela ninguém abre nem entra numa sala. Ela fica só no Cloudflare, como *secret* (`CHAVE_GRUPO`).
- **Origem:** só as páginas listadas em `ORIGENS` (`wrangler.jsonc`) conseguem conectar.
- **Quem é quem:** o servidor carimba cada mensagem com o id de quem mandou; ninguém se passa por outro.
- **Papéis:** só o anfitrião fala com todos. Os convidados falam só com o anfitrião, e só depois de aceitos na porta.
- **Porteiro:** o anfitrião aceita, recusa ou expulsa. O token expulso é bloqueado enquanto estiver no histórico da sala; quem foi recusado bate de novo como alguém novo. Se o anfitrião sai de vez, a sala passa só para quem já foi aceito: quem ainda está na porta nunca vira anfitrião.
- **Limites:** tamanho de cada mensagem, mensagens e bytes por segundo por conexão e 19 conexões autenticadas por sala, inclusive reconexões. Trocar a conexão da mesma identidade não ocupa outra vaga, e a vaga do anfitrião fica reservada durante a tolerância de queda. Antes da autenticação, há no máximo 64 conexões aguardando chave, até 21 por IP, por até dez segundos; quando esse limite é atingido, o jogo tenta conectar novamente automaticamente.
- **Tentativas de chave:** 20 erros em um minuto fazem somente aquele IP esperar um minuto naquela sala. Outros IPs continuam entrando; uma identidade já conhecida pode reconectar com seu token e a chave correta, inclusive por um IP compartilhado que esteja bloqueado. O endereço usado é o informado pelo Cloudflare, e não é enviado aos jogadores.
- **Histórico de reconexão:** até 256 identidades, com expiração após 24 horas desconectadas. Ao atingir o limite, a identidade desconectada mais antiga é descartada; conexões ativas e o anfitrião na tolerância de queda são preservados. Identidades esquecidas precisam passar pelo porteiro novamente. As expulsões têm esse mesmo prazo de retenção; a chave do grupo continua obrigatória.

## Publicar (uma vez)

Dentro desta pasta, no cmd ou no PowerShell. O atalho `wrangler.cmd` usa o Node portátil de `Projetos_iA\apps` (ou o `node` do PATH), sem precisar mexer no PATH:

```sh
.\wrangler login
.\wrangler deploy
.\wrangler secret put CHAVE_GRUPO
```

(Numa cópia nova do projeto, rode antes `npm install` nesta pasta.)

O servidor fica em `https://sala.autopobre.com.br`, no domínio do jogo cujo DNS está no Cloudflare: o `deploy` cria o registro e o certificado sozinho (`routes` em `wrangler.jsonc`). O endereço `workers.dev` da conta fica desligado (`workers_dev: false`). Esse endereço, com `wss://`, precisa estar em `ROOM_SERVER` de `pista_interlagos/teste/net-link.js` e de `pista_interlagos/scripts/publicacao.py` (a regra de segurança do site). O teste `testar_multiplayer.mjs` confere que os dois batem.

Para trocar a chave do grupo, rode `.\wrangler secret put CHAVE_GRUPO` de novo; ninguém precisa publicar o site.

## Custos

Plano gratuito: 100 mil requisições por dia (as mensagens recebidas contam 20 por 1), zerando às 21h de Brasília. Uma corrida de 6 pilotos por 3 horas gasta cerca de 67 mil. Se estourar, nada é cobrado: o servidor recusa conexões até zerar.

## Testar neste PC

`.dev.vars` (fora do Git) tem a chave e as origens de teste:

```
CHAVE_GRUPO=chave-de-teste-local
ORIGENS=http://127.0.0.1:8799,http://127.0.0.1:8841,http://teste.local
```

- `npm test` — regressões de segurança em memória e o servidor no `wrangler dev`: chave, origem, papéis, porteiro, limites, F5 e troca de anfitrião. O teste usa chave e origem fictícias próprias, passadas ao runtime local.
- `node teste/testar_sala_jogo.mjs` — o código de sala do próprio jogo conversando por ele.
- `python pista_interlagos/scripts/verificar_multiplayer.py 8841 --servidor` (da raiz, com o servidor do jogo na porta 8841) — três janelas correndo uma volta pelo servidor.
- No navegador: `.\wrangler dev` aqui e `…/index.html#desafio=teste&servidor=local` no jogo.
