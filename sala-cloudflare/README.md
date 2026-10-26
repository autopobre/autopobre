# Servidor das salas multiplayer

Um Worker do Cloudflare com um Durable Object por sala (`src/index.js`). Os navegadores dos pilotos só conversam com ele, por WebSocket; ninguém vê o IP de ninguém. O jogo continua no GitHub Pages.

O servidor garante, seja lá o que o navegador mande:

- **Conta:** só entra quem está com a conta do Google conectada no jogo (dev.autopobre.com.br) e já escolheu o apelido. O servidor de contas (`conta-cloudflare`, `POST /api/conta/passe-sala`) entrega ao jogo um *passe* assinado (`src/passe.js`): diz o apelido, para qual sala e vale 5 minutos. A sala confere a assinatura com o segredo `SALA_PASSE`, o mesmo nos dois Workers. A sala conhece a conta só por um código (HMAC do identificador do Google), nunca o identificador em si. Sem passe, a sala nem confere senha (4014).
- **Nome:** o nome do piloto na sala é o apelido da conta. O servidor troca o nome que o jogo escrever pelo da conta: na batida da porta, no "hello", na lista e no grid que o anfitrião manda. Ninguém corre com o nome de outro.
- **Duas senhas:** a do anfitrião (`SENHA_ANFITRIAO`) abre a sala; a dos pilotos (`SENHA_PILOTOS`) só entra numa sala que alguém abriu. Quem chega com a dos pilotos numa sala ainda fechada espera na porta e bate assim que o anfitrião chega. As duas precisam ser diferentes. Sem nenhuma, ninguém entra.
- **Convites:** o anfitrião vê quem está online (cada página do jogo com conta e apelido mantém uma linha com o *saguão*, o Durable Object `Saguao`) com o recorde de cada um na pista, e convida. O convite é assinado pela sala para aquela conta, vale 12 horas e substitui a senha e a porta: o convidado entra direto. Só o anfitrião pede a lista e convida, pela própria sala; uma página no saguão só manda o passe e o eco. O saguão hiberna (WebSocket Hibernation API): linha parada não custa nada, e o eco é respondido pelo próprio Cloudflare.
- **Chat:** quem já entrou (o anfitrião também) manda linhas de até 80 caracteres, no máximo 4 a cada 8 segundos (o jogo, uma a cada 2 s). O texto passa pela mesma regra no jogo e no servidor (`pista_interlagos/teste/chat-text.js`, que este Worker importa): sem caracteres de controle e invisíveis (os que viram o texto de trás para frente, os de largura zero, as letras "em branco"), no máximo dois acentos empilhados numa letra, um espaço entre as palavras. **Links não passam:** escritos (`http://`, `www`, `site.com`, IP, encurtadores) ou disfarçados (`site . com`, `site [.] com`, `ponto com`, pontos parecidos, letras de largura cheia ou com acento). O jogo recusa antes de mandar; o servidor descarta o que chegar assim mesmo. O texto chega à página só como texto, nunca como HTML.
- **Origem:** só as páginas listadas em `ORIGENS` (`wrangler.jsonc`) conseguem conectar: hoje só `https://dev.autopobre.com.br`, o único site com as contas. O museu em autopobre.com.br/dev/ não abre mais salas.
- **Quem é quem:** o servidor carimba cada mensagem com o id de quem mandou; ninguém se passa por outro.
- **Papéis:** só o anfitrião fala com todos. Os convidados falam só com o anfitrião, e só depois de aceitos na porta.
- **Porteiro:** o anfitrião aceita, recusa ou expulsa. A expulsão vale para a conta, em qualquer aba (menos a conta do próprio anfitrião: uma segunda aba dele sai sozinha), enquanto a sala lembrar dela. Quem foi recusado bate de novo como alguém novo. Se o anfitrião sai de vez, a sala passa para quem tem a senha do anfitrião: primeiro quem já foi aceito, há mais tempo; senão quem está na porta com ela. Ninguém assim: a sala fica sem anfitrião e avisa todo mundo, até chegar um.
- **Limites:** tamanho de cada mensagem, mensagens e bytes por segundo por conexão e 19 conexões autenticadas por sala, inclusive reconexões. Trocar a conexão da mesma identidade não ocupa outra vaga, e a vaga do anfitrião fica reservada durante a tolerância de queda. Antes da autenticação, há no máximo 64 conexões aguardando chave por sala, até 21 por IP (também somando todas as salas), por até dez segundos, e a primeira mensagem tem de ser a autenticação: qualquer outra coisa fecha a conexão (1008). O saguão aceita até 400 linhas, 8 por IP e 4 páginas por conta (a mais antiga cede). Quando um limite é atingido, o jogo tenta conectar novamente automaticamente.
- **Porta:** no máximo 10 pessoas esperando o anfitrião, 4 por IP e 4 por conta. A próxima recebe 4013 e o jogo tenta de novo sozinho; quem já foi aceito não conta.
- **Tentativas de senha:** 20 erros em um minuto fazem somente aquele IP esperar um minuto, naquela sala e em todas as outras: o `Porteiro`, um Durable Object único, conta os erros de todas as salas, então trocar o nome da sala não dá tentativas novas. Só tenta senha quem já mostrou um passe de conta. Enquanto espera, o IP não descobre nada sobre a senha. Uma identidade já conhecida pode reconectar com seu token, o passe da mesma conta e uma senha certa, inclusive por um IP compartilhado que esteja bloqueado. O endereço usado é o informado pelo Cloudflare, fica só na memória e não é enviado aos jogadores.
- **Histórico de reconexão:** até 256 identidades, com expiração após 24 horas desconectadas. Ao atingir o limite, a identidade desconectada mais antiga é descartada; conexões ativas e o anfitrião na tolerância de queda são preservados. Identidades esquecidas precisam passar pelo porteiro novamente. As expulsões têm esse mesmo prazo de retenção.

## Publicar

Dentro desta pasta, no cmd ou no PowerShell. O atalho `wrangler.cmd` usa o Node portátil de `Projetos_iA\apps` (ou o `node` do PATH), sem precisar mexer no PATH:

```sh
.\wrangler login
.\wrangler deploy
.\wrangler secret put SENHA_ANFITRIAO
.\wrangler secret put SENHA_PILOTOS
.\wrangler secret put SALA_PASSE
```

`SALA_PASSE` é um segredo longo e aleatório, o **mesmo** no servidor de contas (`conta-cloudflare`: `.\wrangler secret put SALA_PASSE` lá também). Trocá-lo invalida os passes e os convites em andamento; ninguém precisa publicar o site. As senhas podem ser trocadas a qualquer hora (também pelo painel do Cloudflare: Workers & Pages → sala-autopobre → Settings → Variables and Secrets, sempre como *Secret*); quem já está na sala continua. O segredo antigo `CHAVE_GRUPO` não é mais usado e pode ser apagado (`.\wrangler secret delete CHAVE_GRUPO`).

(Numa cópia nova do projeto, rode antes `npm install` nesta pasta.)

O servidor fica em `https://sala.autopobre.com.br`, no domínio do jogo cujo DNS está no Cloudflare: o `deploy` cria o registro e o certificado sozinho (`routes` em `wrangler.jsonc`). O endereço `workers.dev` da conta fica desligado (`workers_dev: false`). Esse endereço, com `wss://`, precisa estar em `ROOM_SERVER` de `pista_interlagos/teste/net-link.js` e de `pista_interlagos/scripts/publicacao.py` (a regra de segurança do site). O teste `testar_multiplayer.mjs` confere que os dois batem.

Este Worker importa dois arquivos de fora da pasta: `src/passe.js` é lido também pelo servidor de contas, e `pista_interlagos/teste/chat-text.js` é a regra do chat do jogo. Mudou um deles: publique os dois Workers (e o site, no caso do chat).

## Custos

Plano gratuito: 100 mil requisições por dia (as mensagens recebidas contam 20 por 1), zerando às 21h de Brasília. Uma corrida de 6 pilotos por 3 horas gasta cerca de 67 mil. O saguão hiberna: as linhas paradas não contam tempo, e o eco a cada 30 s é respondido sem acordá-lo. Se estourar, nada é cobrado: o servidor recusa conexões até zerar.

## Testar neste PC

`.dev.vars` (fora do Git) tem os segredos e as origens de teste:

```
SALA_PASSE=passe-das-salas-de-teste-local
SENHA_ANFITRIAO=anfitriao-de-teste
SENHA_PILOTOS=pilotos-de-teste
ORIGENS=http://127.0.0.1:8799,http://127.0.0.1:8841,http://teste.local
```

(`SALA_PASSE` igual ao do servidor de contas local, `conta-cloudflare/teste/local.mjs`.)

- `npm test` — regressões de segurança em memória e o servidor no `wrangler dev`: passe, senhas, origem, papéis, porteiro, chat, saguão e convites, limites, F5 e troca de anfitrião. O teste usa segredos e origem fictícios próprios, passados ao runtime local.
- `node teste/testar_sala_jogo.mjs` — o código de sala do próprio jogo conversando por ele.
- `python pista_interlagos/scripts/verificar_multiplayer.py 8841 --servidor` (da raiz, com o servidor do jogo na porta 8841) — três janelas correndo uma volta pelo servidor, com chat.
- `python pista_interlagos/scripts/verificar_sala_conta.py` (da raiz) — contas, senhas, convites e chat no navegador; sobe sozinho o servidor do jogo, o de contas e este.
- No navegador: `.\wrangler dev` aqui, `node teste/local.mjs` em `conta-cloudflare`, o jogo com `servidor.py 8841 --conta-porta 8788`, e `…/index.html#desafio=teste&servidor=local`. O preview local não conecta ao servidor de produção.

Os passos de segurança que ficam no painel do Cloudflare (limite de pedidos por IP antes do Worker) estão no [SEGURANCA.md](../SEGURANCA.md).
