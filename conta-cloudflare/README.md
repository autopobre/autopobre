# Servidor das contas (login com Google) e dos recordes online

Um Worker do Cloudflare com um banco D1 (`src/index.js` para as contas, `src/recordes.js` para os recordes, `src/base.js` com o que os dois dividem). Ele responde em `/api/` do próprio endereço do jogo; as páginas continuam no GitHub Pages.

## Dois sites, um banco

Desde 28/10/2026 são dois Workers com o mesmo código e o **mesmo banco** (`wrangler.jsonc`):

| | dev.autopobre.com.br (versão de testes) | autopobre.com.br (link principal) |
|---|---|---|
| Worker | `conta-autopobre-dev` | `conta-autopobre` (`--env principal`) |
| `SITE` | `dev` | `principal` |
| Google | cliente do dev no projeto `autopobre-dev` | cliente do principal no mesmo projeto (publicado: qualquer conta Google entra nos dois sites) |
| Pilotos de confiança | valem (os casos para estudar) | não valem: toda volta é conferida |
| Salas multiplayer | sim (`SALA_PASSE`) | não |

- **Uma conta Google é um piloto só nos dois sites.** O apelido, os recordes e o placar são os mesmos: uma volta conferida no dev aparece no placar do principal, porque os pilotos de teste jogam com o jogo mais novo e o recorde continua valendo.
- **Cada site tem a sua sessão.** O cookie é só daquele endereço, e o banco guarda em que site cada sessão foi aberta (`sessoes.site`): uma sessão do dev nunca abre a conta no principal. Quem quer jogar nos dois entra uma vez em cada um. Sair vale para aquele site; apagar a conta apaga nos dois.
- **Cada Worker confere as voltas com as pistas da sua versão do jogo** (`circuits.js`, `pistas.js`, `pisos.js` e `envelope.js` vão dentro dele). Por isso o do principal é publicado a partir do commit da versão que está no principal, e o do dev a partir do que está no dev.
- **Mudança no servidor vai primeiro para o dev.** O principal recebe quando ela estiver testada.
- **As migrações valem na hora para os dois**, que podem estar em versões diferentes: elas só acrescentam (colunas e tabelas), nunca apagam nem mudam o que existe. Antes de cada uma, anote o ponto de restauração do banco (`.\wrangler d1 time-travel info conta-autopobre-dev`): o Cloudflare guarda o histórico e volta o banco a qualquer minuto dele (`.\wrangler d1 time-travel restore conta-autopobre-dev --bookmark=…`).
- **Os recordes antigos sobem uma vez por conta e por site** (cada endereço guarda os seus no navegador): o dev marca `importou_em` e o principal `importou_principal_em`. A antiga página-ponte, que levava os recordes do principal para o dev, saiu.

O que o servidor garante, seja lá o que o navegador mande:

- **Dados mínimos (LGPD):** o login do jogo pede ao Google só o escopo `openid`. Chega o número que identifica a conta Google e nada mais: nem nome, nem e-mail, nem foto. O e-mail só vem de quem entra pela página dos palpites (abaixo), e fica cifrado. O banco guarda esse número, o apelido que o piloto escolhe, a data de criação e do último login, e as sessões.
- **O próprio piloto controla os dados:** "Baixar meus dados" entrega tudo o que existe da conta num arquivo, e "Apagar conta" apaga a conta e as sessões de verdade.
- **Login pelo servidor:** a página não carrega nenhum script do Google. O fluxo é o *authorization code* com PKCE, `state` e `nonce`. Esses três viajam num cookie criptografado de 10 minutos, então nada é gravado no banco antes de o Google responder. O token do Google é conferido (emissor, cliente, validade e nonce) e descartado.
- **Sessão:** um valor aleatório no cookie `__Host-ap_sessao` (`HttpOnly; Secure; SameSite=Lax; Path=/`, sem `Domain`), válido por 30 dias. O banco guarda só o SHA-256 desse valor. São no máximo 10 sessões por conta, e um novo login no mesmo navegador encerra a sessão anterior.
- **Escritas:** só aceitas com a origem exata da página (`ORIGEM`) e corpo JSON de até 4 KB. Para o navegador, o dev e o link principal são o mesmo "site", então o `SameSite` sozinho não impediria uma página de um mandar pedidos para o outro.
- **Apelido:** de 3 a 20 letras latinas ou números, com espaço, ponto, traço ou sublinhado só entre eles. Não se repete entre pilotos, sem contar acentos nem maiúsculas ("João" e "joao" são o mesmo apelido).

## Recordes online

Cada piloto aparece com a melhor volta por pista e carro. Uma pista tem um recorde só, venha a volta de uma corrida ou do Modo História, e o Opala e o Fusca têm tabelas separadas (217 contra 170 km/h: os tempos nunca se comparam). Cada carro tem o seu piso e a sua física (`src/pisos.js` e `src/envelope.js`). A primeira volta da corrida, que larga do grid atrás da linha, também vale. Cada recorde tem um selo:

- **✓ conferido:** o servidor acompanhou a volta enquanto ela era pilotada.
  - Ao entrar na pista, o jogo pede um **bilhete** (pista, modo, carro, versão do jogo). Depois manda um **pedaço** do relógio da física a cada 10 segundos e outro a cada passagem pela linha.
  - O bilhete vai e volta selado (AES-GCM) a cada pedaço, então nada é gravado enquanto as voltas passam.
  - Entre dois pedaços, o relógio do jogo precisa ter andado como o do servidor. Isso pega câmera lenta, relógio adiantado e silêncio de mais de 25 s.
  - A volta, de linha a linha, precisa durar no relógio do servidor o que durou no jogo, tirando as pausas: o jogo avisa quando parou e quando voltou (P ou menu, janela, aba), o relógio dele precisa ter ficado parado nesse intervalo, e o registro guarda quantas, quanto tempo e por quê (até 10 por volta).
  - A volta não pode ser mais rápida que 85% do tempo da **linha ideal** do Opala naquela pista (`src/pisos.js`, gerado por `gerar_pisos.mjs` com o código do jogo).
  - O **fantasma** da volta (a mesma gravação que o jogo guarda) precisa ter o tempo da volta, ter sido gravado nas frequências do jogo, começar na linha e percorrer a pista inteira (o comprimento vem do `circuits.js` do jogo). O carro precisa cobrir de fato a pista, sem passar de 70 m/s, sem acelerar ou virar mais do que um Opala consegue (meio segundo a meio segundo) e sem ganhar pista que não andou.
  - Os **comandos** da volta vão junto com o fantasma (`comandos-volta.js` no jogo, `src/comandos.js` aqui). São o que a física recebeu a cada passo de 1/120 s (acelerador, freio, direção, freio de mão e ré, marcha, embreagem), as teclas como o teclado mandou e qual aparelho pilotou. Eles precisam cobrir a volta inteira e explicá-la: o carro não pode ganhar velocidade sem acelerador nem ré. Sem comandos, a volta não é conferida.
  - O bilhete leva, selada, a conta Google de quem o pediu, e cada pedaço precisa vir com a sessão dessa mesma conta. Depois de **Sair**, de apagar a conta ou de entrar com outra conta no navegador, o bilhete para de valer (e uma conta nova que herdou o número de uma apagada não recebe nada dele).
  - O bilhete não guarda contagem em que o servidor confie: reenviado, um bilhete velho faria tudo de novo. Por isso o que cada conta pode gravar é contado no banco, por hora: 120 recordes, 5 recusas no registro de eventos e 10 trocas de apelido. A mesma passagem pela linha enviada de novo não grava nada.
  - Só a melhor volta de cada piloto fica guardada, com o fantasma.
- **⚠️ não verificado** ("Recordes de Versões Anteriores do Auto Pobre Podem Conter Erros"): um recorde antigo, de antes da conta. O jogo sobe os recordes do navegador uma única vez por conta em cada site (depois marca o navegador) e só até **31/12/2026**. Tempo impossível para a pista é descartado.

O que o selo conferido não pega: volta pilotada por um programa, ou alguém deixando o jogo mais lento por um instante dentro de um pedaço. Isso fica para o próximo selo (homologado: o servidor refaz a volta a partir dos comandos do piloto).

Pista nova no jogo: rode `node gerar_pisos.mjs` (o piso dela) e publique o Worker de novo (`.\wrangler deploy` no dev; `.\wrangler deploy --env principal` quando a versão com a pista for para o principal), porque ele leva o `circuits.js` e os pisos junto.

## Palpites do Opala 99

A página `/palpites` (`pista_interlagos/teste/palpites.html`, nos pacotes com conta: no dev e, desde `publicacao.py PALPITES_NO_PRINCIPAL`, no principal) e `src/palpites.js`. O piloto entra com a conta Google e palpita em que posição o Opala 99 de verdade termina o treino classificatório e as duas corridas de um fim de semana (1º a 13º, ou 0: sem tempo válido no treino, não completou na corrida). O fim de semana é uma linha da tabela `boloes` (migração 0010): o de Chapecó (31/10 e 01/11/2026) já vem nela.

- **Um palpite por conta, definitivo**, só antes de `fecha_em` (o início do treino classificatório). Precisa de apelido (o pódio aparece por ele) e de e-mail confirmado pelo Google (é por ele que o pódio é avisado).
- **O e-mail só é pedido pela página dos palpites** (`/api/conta/entrar?email=1` pede o escopo `openid email`; o login do jogo continua só `openid`). Só um endereço que o Google diz verificado é guardado, **cifrado** (AES-GCM) com uma chave tirada do segredo `EMAIL_KEY`, o MESMO nos dois Workers (o banco é um só; o `SEAL_KEY` é de cada um). Um login sem o escopo não apaga o e-mail guardado. Ele aparece inteiro só para o próprio piloto (Baixar meus dados) e, no painel dos palpites, para quem cuida deles (escondido até o botão do olho); na página, mascarado (`b•••@gmail.com`). Apagar a conta apaga o e-mail e os palpites.
- **Pódio**, calculado pelo servidor quando o resultado oficial é salvo (só depois que os palpites fecharam): o primeiro a acertar as 3 fica em 1º lugar; dos outros, o primeiro com 2 ou mais em 2º; depois, o primeiro com 1 ou mais em 3º. Empate: quem palpitou primeiro (`quando`, depois `id`). Ninguém fica com dois lugares, e um palpite desclassificado pelo admin (contas repetidas da mesma pessoa, por exemplo) não concorre.
- **Ofertas dos patrocinadores:** a caixa "Aceito receber promoções e ofertas dos patrocinadores do Piloto Pobre", ao lado do botão Palpitar, vem desmarcada e é opcional. Marcada, grava `usuarios.ofertas_em` (quando aceitou); depois, quem aceitou vê no cartão do palpite uma linha "Você aceitou receber ofertas dos patrocinadores. Não quero mais", que desfaz a qualquer hora (`POST /api/palpites/ofertas {aceito}`, até 20 trocas por hora). O painel conta quantos aceitaram e baixa a lista deles (`/api/admin/ofertas`, CSV com apelido, e-mail e data), só deles.
- **Painel dos palpites** (`painel-palpites.html`, link "Painel dos palpites" em Sua conta): o horário de fechamento (se a programação mudar), o resultado oficial, o pódio e quem palpitou, na ordem, com apelido e e-mail inteiro, acertos, se aceitou ofertas e o botão Desclassificar. É de quem cuida dos palpites (`base.js runsGuesses`): os administradores e quem o banco marca, pelo botão "Dar painel dos palpites" na lista de usuários do painel de administração (o Stevan de verdade). O painel de administração não tem mais a seção.

Para ligar (uma vez): gere uma chave e ponha a mesma nos dois Workers. No PowerShell, em `conta-cloudflare`:

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); $k = [Convert]::ToBase64String($b)
$k | .\wrangler secret put EMAIL_KEY
$k | .\wrangler secret put EMAIL_KEY --env principal
```

Sem `EMAIL_KEY` os palpites ficam fechados ("abrem em breve") e o login não pede e-mail. Trocar a chave depois deixa ilegíveis os e-mails já guardados (o piloto confirma de novo entrando pela página).

## Painel de administração

Em `https://dev.autopobre.com.br/admin.html` e `https://autopobre.com.br/admin.html` (`pista_interlagos/teste/admin.html`, nos pacotes com conta). Os dois mostram os mesmos dados, os do banco único. Ele é só para leitura e mostra:
- **Resumo:** contas, logins e voltas recusadas por motivo.
- **Usuários:** cada conta, com sessões e recordes.
- **Eventos:** o que aconteceu, com filtro por tipo.
- **Recordes:** os últimos que chegaram.

Quem decide quem vê é o servidor (`src/admin.js`), a cada pedido. Administrador é a conta cujo **identificador Google** está no segredo **`ADMINS`** do Worker. Para pôr ou tirar alguém:
1. A pessoa entra no jogo, abre **Sua conta → Baixar meus dados** e copia o valor de `identificador_google`. Nunca use o apelido, que muda e pode passar para outra pessoa.
2. No painel do Cloudflare: **Workers & Pages → `conta-autopobre-dev` (e `conta-autopobre`, o do principal) → Settings → Variables and Secrets → `ADMINS`**. Edite o valor (vários identificadores separados por vírgula) e salve. Vale na hora, sem publicar nada. Use o tipo **Secret**: variável de texto fica pública no repositório, e o `wrangler deploy` a sobrescreveria.

Pelo terminal, nesta pasta: `.\wrangler secret put ADMINS`.

Uma conta com `admin=1` no banco também é administradora, nos dois sites (o banco é um só); essa marca fica para o próprio painel poder promover alguém no futuro.

O painel nunca mostra a conta Google de ninguém. Os **eventos** (`src/eventos.js`) não guardam IP e ficam 90 dias:
- conta criada, entrou, saiu;
- trocou o apelido, subiu recordes antigos;
- recorde conferido (só quando a volta passa a ser o melhor tempo do piloto), volta recusada com o motivo (no máximo 5 recusas registradas por conta a cada hora);
- conta apagada.

Quando a conta é apagada, os eventos dela vão junto, e fica só um "conta apagada" sem dono. "Baixar meus dados" traz os eventos da própria pessoa.

**Voltas e sinais de programa.** Toda volta que o jogo manda fica no registro de voltas (`voltas`, 90 dias, sem IP). Cada volta guarda o tempo, o resultado, o aparelho e os **sinais** dos comandos. Os sinais nunca recusam a volta: servem para a administração olhar. São eles:
- **sem aparelho:** o carro andou sem teclado, toque, controle ou volante em uso;
- **teclas sintéticas:** teclas criadas por um script da página, e não por um teclado;
- **teclado sem teclas:** uma volta de teclado em que as teclas não foram apertadas;
- **pedal pela metade no teclado:** só teclado, mas com pedal pela metade;
- **toques curtos demais:** muitas teclas seguradas por menos de 25 ms;
- **teclas no mesmo instante:** trocas de tecla no mesmo milissegundo, quase sempre;
- **freadas idênticas a outra volta:** freou nos mesmos metros (menos de 0,5 m) que outra volta do piloto, como um programa que repete a volta.

**Revisão.** Quando uma volta que seria o melhor tempo do piloto não é conferida, o servidor guarda o fantasma dela no registro, e o jogo oferece "Pedir revisão" na janela de recordes (o recorde do navegador fica de qualquer jeito). O pedido aparece no painel, em **Pedidos de revisão**: **Aprovar** grava a volta como recorde ✓ do piloto, marcada como revisada, e **Recusar** não muda nada. Cada piloto tem no máximo 10 pedidos esperando.

**Pilotos de confiança (enquanto a conferência é ajustada).** Os administradores, e quem estiver no segredo **`CONFIAVEIS`** do Worker (identificadores Google separados por vírgula, como o `ADMINS`), têm toda volta aceita. Quando a conferência teria recusado uma volta deles, ela entra como ✓ do mesmo jeito e vai para **Casos para estudar**, com o motivo, o fantasma e os comandos completos (botão **Baixar**). É com esses casos que a conferência é corrigida.

O painel mostra as voltas (com o filtro "só com sinais") e os sinais de cada recorde. O botão **Remover** de um recorde (o segundo clique confirma) tira o recorde das tabelas, conferido ou antigo, e o piloto vê "recorde removido" nos dados dele.

## Salas multiplayer

A sala multiplayer (`sala-cloudflare`) só deixa entrar quem está com a conta conectada e tem apelido. O jogo pede aqui um passe para a sala (`/api/conta/passe-sala`), e o servidor de salas o confere com o segredo `SALA_PASSE`, que os dois Workers têm igual (`.\wrangler secret put SALA_PASSE` nas duas pastas; 16 caracteres ou mais, de preferência 32 bytes aleatórios). Sem ele, ou curto demais, `/passe-sala` responde 503 e o jogo diz que as salas estão desligadas. Nada é gravado: o passe leva o apelido e um código da conta (HMAC do identificador do Google, nunca o identificador). O mesmo passe, para `@saguao`, diz ao servidor de salas quem está online para os convites dos anfitriões.

## Rotas

| Rota | O que faz |
|---|---|
| `GET /api/conta/eu` | `{conta: null}` ou `{conta: {apelido, desde}}` |
| `GET /api/conta/entrar?volta=/caminho` | leva ao Google; volta para o caminho (só caminhos deste site) |
| `GET /api/conta/google` | a volta do Google (o *redirect URI*) |
| `POST /api/conta/apelido` `{apelido}` | escolhe ou troca o apelido |
| `POST /api/conta/sair` | encerra a sessão |
| `GET /api/conta/meus-dados` | tudo o que existe da conta, como arquivo |
| `POST /api/conta/apagar` `{confirmar: "APAGAR"}` | apaga a conta, as sessões e os recordes |
| `POST /api/conta/passe-sala` `{sala}` | o passe de uma sala multiplayer (ou do saguão, `@saguao`): o apelido, a sala, 5 minutos, assinado com `SALA_PASSE`; só com apelido (409 sem ele); 503 com as salas desligadas (sem `SALA_PASSE` ou curto demais) |
| `POST /api/recordes/bilhete` `{circuito, modo, carro, versao}` | o bilhete de uma corrida, com o melhor tempo conferido do piloto ali |
| `POST /api/recordes/pedaco` `{bilhete, relogio, cruzou?, volta?}` | um pedaço do relógio; na linha, a volta com o fantasma; devolve o bilhete novo e o veredito |
| `POST /api/recordes/importar` `{recordes}` | os recordes antigos do navegador, uma vez por site, até 31/12/2026 |
| `GET /api/recordes?circuito=&carro=` | a tabela de uma pista num carro (pública; o carro padrão é o Opala) |
| `GET /api/recordes/melhores?carro=` | a melhor volta de cada pista num carro (pública) |
| `POST /api/recordes/revisao` `{volta}` | pede a revisão de uma volta própria não conferida que seria o melhor tempo |
| `GET /api/admin/resumo`, `/usuarios`, `/eventos?tipo=&antes=`, `/recordes`, `/voltas?sinalizadas=1&antes=` | o painel (só administradores) |
| `POST /api/admin/remover` `{recorde}` | tira um recorde das tabelas (só administradores) |
| `GET /api/admin/revisoes`, `POST /api/admin/revisar` `{volta, aprovar}` | os pedidos de revisão e a resposta (só administradores) |
| `GET /api/admin/casos`, `/caso?volta=` | os casos para estudar e o arquivo de cada um (só administradores) |

## Publicar (uma vez)

Dentro desta pasta, no cmd ou no PowerShell. Numa cópia nova do projeto, rode antes `npm install`.

1. No Google Cloud, no projeto `autopobre-dev`, crie o cliente OAuth do tipo *Web application* com o redirect URI `https://dev.autopobre.com.br/api/conta/google`. Ponha o *Client ID* em `GOOGLE_CLIENT_ID` no `wrangler.jsonc`: ele é público.
2. Crie o banco e copie o `database_id` que aparecer para o `wrangler.jsonc`:
   ```sh
   .\wrangler d1 create conta-autopobre-dev
   ```
3. Crie as tabelas e guarde o segredo do Google (o comando pede para colar; ele nunca vai para o Git):
   ```sh
   .\wrangler d1 migrations apply conta-autopobre-dev --remote
   .\wrangler secret put GOOGLE_CLIENT_SECRET
   .\wrangler secret put SEAL_KEY
   ```
   O `SEAL_KEY` sela os bilhetes e o cookie do login: um valor aleatório longo que ninguém precisa saber (por exemplo, a saída de `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`). Enquanto ele não existir, o servidor usa o segredo do Google.
4. Publique. O `deploy` cria a rota `dev.autopobre.com.br/api/*` no Cloudflare:
   ```sh
   .\wrangler deploy
   ```
5. Publique o dev (autopobre/dev → Actions → Publicar dev.autopobre.com.br): o pacote dele já vem com a conta (`preparar_publicacao.py --conta`).

Para trocar o segredo do Google, rode `.\wrangler secret put GOOGLE_CLIENT_SECRET` de novo. Os logins que estiverem em andamento naquela hora falham, e as sessões continuam valendo.

### O Worker do link principal (`conta-autopobre`)

O banco é o mesmo, então não há banco a criar nem migração a mais.

1. No Google Cloud, no projeto `autopobre-dev` (o mesmo do dev, publicado, com a página inicial `https://autopobre.com.br` e a privacidade `https://autopobre.com.br/privacidade.html`, o domínio verificado no Search Console), crie outro cliente OAuth *Web application* só com o redirect URI `https://autopobre.com.br/api/conta/google`. Ponha o *Client ID* em `env.principal.vars.GOOGLE_CLIENT_ID` no `wrangler.jsonc`.
2. Os segredos deste Worker (os do dev não passam para ele):
   ```sh
   .\wrangler secret put GOOGLE_CLIENT_SECRET --env principal
   .\wrangler secret put SEAL_KEY --env principal
   ```
   O `SEAL_KEY` é outro valor aleatório, diferente do dev. O `ADMINS` é opcional aqui: quem tem `admin=1` no banco já é administrador nos dois sites. O `CONFIAVEIS` e o `SALA_PASSE` não existem no principal.
3. Publique a partir do commit da versão que vai para o principal (as pistas e os pisos são os dela). O `deploy` cria a rota `autopobre.com.br/api/*`:
   ```sh
   .\wrangler deploy --env principal
   ```
4. Publique o link principal (autopobre/autopobre → Actions → Publicar Auto-Pobre Racing): a partir do commit com `CONTA_NO_PRINCIPAL` no `publicacao.py`, o `pages.yml` monta o principal com `--conta` (sem o multiplayer).

## Custos

Plano gratuito do Workers (100 mil requisições por dia) e do D1 (5 milhões de leituras e 100 mil escritas por dia). Abrir o jogo faz uma leitura, e cada pedaço de uma volta faz outra (a sessão). Escrevem: o login, o apelido, sair, apagar, a subida dos recordes antigos, cada recorde novo e até 5 recusas por hora. Os limites por conta acima seguram quem tentar gastar a cota. A regra do Cloudflare (30 pedidos a cada 10 s por IP) segura rajadas, mas não impede alguém insistente de gastar devagar as 100 mil requisições do dia.

## Testar neste PC

- `npm test`:
  - `teste/testar_conta.mjs`: o servidor no Node, com SQLite e um Google de mentira. Cobre login, cookies, o que o banco guarda, apelidos, a trava de origem, os logins que precisam falhar, sessões, sair, "meus dados" e apagar.
  - `teste/testar_recordes.mjs`: os recordes no servidor, num relógio que o teste controla. Cobre a volta conferida, as recusadas (pausa, câmera lenta, relógio adiantado, rápida demais, fantasmas falsos), o bilhete adulterado ou vencido, a subida dos antigos com prazo, a tabela e os recordes ao apagar a conta.
  - `teste/testar_recordes_jogo.mjs`: o código do próprio jogo (`recordes-online.js`) correndo contra o servidor, quadro a quadro.
  - `teste/testar_admin.mjs`: o painel, as voltas com os sinais e o Remover.
  - `teste/testar_dois_sites.mjs`: os dois Workers sobre um banco só. A conta é uma, cada site com a sua sessão, a volta do dev no placar do principal, os pilotos de confiança só no dev, os recordes antigos uma vez por site, sair e apagar, e o painel igual nos dois.
  - `teste/testar_comandos.mjs`: os comandos da volta (o formato, as recusas e cada sinal de programa), com voltas da IA do jogo.
  - `teste/testar_dinamica.mjs` e `teste/testar_trajeto.mjs`: a física do Opala e o traçado da pista, com voltas da IA em todas as pistas (com batidas, erros e paradas no box) e voltas forjadas. As voltas reais de pilotos entram quando a variável `FANTASMAS_REAIS` aponta para um arquivo delas, que nunca vai para o repositório.
  - Pista nova ou mudança no arquivo de uma pista: rode `node gerar_pistas.mjs` (o traçado) e `node gerar_pisos.mjs` (o piso). Mudança na física do Opala: `node gerar_envelope.mjs`.
  - `teste/testar_wrangler.mjs`: o mesmo login, bilhete e tabela no runtime do Cloudflare (`wrangler dev`, banco local).
- `npm run local`: o servidor de contas na porta 8788, com o Google de mentira (entra direto). O preview do jogo (`servidor.py`) repassa `/api/` para ele, então no `…/pista_interlagos/teste/` do preview o menu mostra "Entrar com Google".
- `python pista_interlagos/scripts/verificar_conta.py [porta]` (da raiz do projeto, com o Python que tem o Playwright). Sobe os dois servidores sozinho e passa pela conta inteira no navegador, inclusive no celular.
