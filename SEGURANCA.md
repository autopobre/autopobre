# Revisão para publicação — 13/09/2026

## Atualização — 29/10/2026: revisão do login e dos palpites

Procurados: injeção, XSS, CSRF, falhas do login, e jeitos de burlar os palpites. Os achados foram comprovados no servidor de contas local antes de corrigir.

- **Sem achado (conferido):**
  - SQL só com parâmetros; os nomes de tabela e coluna montados em texto vêm de listas fixas do código.
  - As páginas escrevem tudo com `textContent`; o `innerHTML` só leva texto fixo; CSP no HTML. Os cabeçalhos (`frame-ancestors 'none'`, `X-Frame-Options`, HSTS, `nosniff`) foram conferidos no ar em autopobre.com.br e dev.autopobre.com.br, nas páginas dos palpites e no `/api/`.
  - Toda escrita exige a origem exata e JSON.
  - Login: PKCE, state, nonce, emissor, audiência e validade conferidos; cookie `__Host-` com só o SHA-256 no banco; sessão de cada site; retorno só para um caminho do próprio site.
  - Os segredos `SEAL_KEY`, `EMAIL_KEY` e `ADMINS` estão nos dois Workers (conferidos só os nomes).
  - O prazo é o relógio do servidor; um palpite por conta pelo `UNIQUE` do banco, também entre os dois sites; a distribuição dos palpites fica escondida até fechar.
- **Corrigido:**
  - **Reabrir depois do fechamento:** quem cuida dos palpites podia pôr o fechamento no futuro depois do treino, e um palpite de quem já sabia o resultado entrava e continuava valendo. Agora o horário só muda enquanto os palpites estão abertos (409 depois). No painel, o campo trava, e salvar pede um segundo clique (um horário errado no passado não tem volta).
  - **Palpite "definitivo" trocado apagando a conta:** apagar e entrar de novo com a mesma conta Google dava um palpite novo. Agora, com o fim de semana aberto, a conta apagada deixa em `palpites_apagados` (migração 0012) um HMAC do identificador do Google (chave tirada do `EMAIL_KEY`, igual nos dois Workers; nunca o identificador), que recusa outro palpite até o fechamento. O primeiro login depois do fechamento apaga a marca. A privacidade diz isso.
  - **Várias contas da mesma pessoa:** com 14 contas palpitando cedo, uma por posição do treino, alguma fica no pódio (o empate favorece quem palpitou primeiro). Não há como impedir sem dado pessoal a mais. O painel passa a mostrar quanto tempo antes do palpite a conta foi feita e marca "⚠ em rajada" (conta feita na hora, a menos de 3 min de outra também feita na hora), para a organização olhar os e-mails e desclassificar.
  - **CSV das ofertas:** uma célula que começa com `=`, `+`, `-`, `@`, tab ou retorno ganha um apóstrofo (fórmula de planilha). O e-mail vem do Google, que dificilmente confirmaria um endereço assim: é só reforço.
  - **Quem desclassificou:** o evento do piloto passa a guardar quem (são duas pessoas cuidando).
  - **Texto:** a página dos palpites e o "O que guardamos" da conta diziam "ninguém mais vê" o e-mail; agora dizem que a administração e o Stevan veem, como a privacidade.
- **Fica como está (decisão do dono ou baixo risco):**
  - O desempate por quem palpitou primeiro (regra publicada).
  - O museu em `autopobre.com.br/dev/` divide a origem com o `/api/` do principal: um XSS nele usaria as contas. Nada encontrado; é superfície a mais.
  - O menu do jogo pergunta `/api/palpites` a cada abertura, e depois do fechamento isso lê todos os palpites (custo do D1, não falha).
- **Testes:** `conta-cloudflare` `npm test`. O `testar_palpites.mjs` ganhou os casos novos, e o `testar_wrangler.mjs` passou a rodar os palpites com `EMAIL_KEY` no runtime do Cloudflare (e-mail cifrado, marca HMAC). A página e o painel foram conferidos num navegador headless contra o servidor local.
- **Para valer:** migração 0012 no banco remoto, depois `deploy` dos DOIS Workers (um Worker de antes não deixa a marca nem a confere), e publicação das páginas (painel, página dos palpites, privacidade, `conta.js`).

## Atualização — 26/10/2026 (noite): salas só com conta, duas senhas, convites e chat

- **Conta obrigatória:** o servidor de salas só deixa entrar quem mostra um passe do servidor de contas (`POST /api/conta/passe-sala`: sessão válida e apelido escolhido). O passe é um HMAC-SHA256 com o segredo `SALA_PASSE`, igual nos dois Workers, vale 5 minutos e uma sala só. A sala conhece a conta só por um HMAC do identificador do Google. Sem passe, nenhuma senha é testada (4014), então quem não tem conta de teste nem chega a tentar senhas.
- **Duas senhas** (segredos `SENHA_ANFITRIAO` e `SENHA_PILOTOS`, comparadas byte a byte): só a do anfitrião abre ou assume uma sala. Um token de reconexão só vale para a mesma conta e o mesmo tipo de senha. O limite de senhas erradas por IP (Porteiro) continua valendo em todas as salas. A chave antiga `CHAVE_GRUPO` deixou de existir.
- **Nomes:** o nome na sala é o apelido da conta, carimbado pelo servidor na porta, no "hello", na lista, no grid e no chat. Ninguém se passa por outro piloto, nem o anfitrião.
- **Expulsão por conta:** a conta expulsa sai de todas as abas e não volta naquela sala (enquanto a sala lembrar, 24 h), nem por convite.
- **Convites:** o saguão (`Saguao`, hibernando) sabe quem está online pelo passe da conta. Só o anfitrião da sala pede a lista (a cada 2 s no máximo, até 50 nomes, sem quem já está na sala nem os expulsos) e convida (10 por minuto, o mesmo piloto a cada 20 s). O convite é assinado pela sala para aquela conta, vale 12 horas e só naquela sala; substitui a senha e a porta. O saguão aceita 400 linhas, 8 por IP, 4 páginas por conta, e nada além do passe e do eco. A página trata o convite como texto: só mostra o nome de quem convidou e o nome visível da sala (a parte secreta, depois do "_", vai para o armazenamento do navegador e nunca aparece).
- **Chat:** uma regra só para o jogo e o servidor (`pista_interlagos/teste/chat-text.js`): no máximo 80 caracteres; sem caracteres de controle, de formatação (inversão bidirecional, largura zero, tags) ou "letras em branco"; no máximo dois acentos empilhados por letra; espaços juntados. **Links são recusados**, também disfarçados (espaços ou colchetes no ponto, "ponto com", pontos parecidos, letras de largura cheia ou acentuadas, IP, encurtadores). O servidor limpa de novo e descarta link, e só repassa de quem já entrou, no máximo 4 linhas a cada 8 s por conexão. A página mostra o chat e os balões só com `textContent` e a CSP continua bloqueando scripts inline. Nada do chat é gravado.
- **Convites canceláveis (mesmo dia, depois):** cada convite tem um número próprio, e a sala guarda o último de cada conta; só vale enquanto a sala o tiver. O anfitrião cancela um convite ainda não aceito; o convite cancelado (ou de uma sala que recomeçou) fecha com 4016, sem conceder nada. A expulsão apaga o convite da conta.
- **Segredo curto:** `SALA_PASSE` com menos de 16 caracteres (ou ausente) deixa as salas desligadas nos dois servidores (contas 503, sala 4015), em vez de erro 500 tratado como servidor fora.
- **Piloto a pé, visual e portas:** o estado do carro passa a levar, opcional, a posição do piloto fora dele (7 números com faixa conferida) e quais portas/capô/tampas estão abertos (bits 0..127); a lista do anfitrião leva o visual de cada piloto (só os campos e nomes do pilot-look.js, normalizados na chegada). Tudo isso é só visual: não move carro, não colide e não conta na corrida.
- **Fechar sala:** só o anfitrião manda `fechar` (a ordem vem na lista de mensagens de anfitrião; de um convidado é ignorada). Todos saem com 4017, sem reconexão automática; os convites não aceitos são cancelados e esquecidos, junto com as identidades da sala; a expulsão por conta continua valendo.
- **Carro que já terminou:** sem notícias do piloto depois da bandeirada, o anfitrião estaciona o carro na vaga dele no pit lane, em vez de entregá-lo ao piloto automático. A conferência de trajeto aceita o salto até essa vaga só para um carro que já terminou, parado, a menos de 2,5 m dela; nada é contado para ele.
- **Origem:** o servidor de salas aceita só `https://dev.autopobre.com.br`. O museu em autopobre.com.br/dev/ não abre mais salas.
- **Privacidade:** com o jogo aberto e a conta conectada, quem abre uma sala vê que o piloto está online. O texto "O que guardamos" da conta diz isso.
- **Testes:** `sala-cloudflare` `npm test` (em memória e no runtime do Cloudflare), `testar_sala_jogo.mjs`, `conta-cloudflare` `testar_passe_sala.mjs` e `testar_wrangler.mjs`, `testar_multiplayer.mjs`, e no navegador `verificar_sala_conta.py` e `verificar_multiplayer.py --servidor`.

## Atualização — 26/10/2026: recordes por pista e carro, revisão e pilotos de confiança

- **Recordes:**
  - Uma pista tem um recorde só, da corrida ou do Modo História.
  - O Fusca ganhou tabela online própria, com piso e física do Fusca calculados pelo código do jogo. Uma volta de Opala enviada como Fusca é recusada em todas as pistas.
  - A primeira volta da corrida, que larga até 120 m atrás da linha, passou a valer. Antes ela era sempre recusada por "não começa na linha".
- **Revisão:**
  - Uma volta recusada que seria o melhor tempo guarda o fantasma por 90 dias.
  - Só o dono pede a revisão (a conta da sessão precisa ser a da volta), uma vez por volta e no máximo 10 esperando por conta.
  - Só um administrador aprova. A aprovação grava o recorde com a marca "revisada".
- **Pilotos de confiança** (administradores e o segredo `CONFIAVEIS`):
  - Enquanto a conferência é ajustada, toda volta deles entra como ✓. Quando a conferência teria recusado, a volta fica como caso, com fantasma e comandos, visível só no painel.
  - Risco aceito: uma conta de confiança roubada poderia gravar recordes falsos. A sessão é a mesma das outras contas (`__Host-`, só o SHA-256 no banco), e a lista fica num segredo do Worker. Quando a conferência estiver ajustada, esvaziar `CONFIAVEIS` e tirar a regra dos administradores.
- **Comandos guardados:** só nos casos dos pilotos de confiança. Os casos entram em "Baixar meus dados" e vão embora com a conta.

## Atualização — 25/10/2026 (noite): conferência dos recordes mais robusta

O selo ✓ podia ser forjado. Um "fantasma" inventado (um anel liso do tamanho da pista) ganhava ✓ a 1:36 em Interlagos, e uma volta real acelerada em até 10% também passava. Agora o servidor confere quatro coisas, todas calculadas com o próprio código do jogo:

| O quê | Como | Resultado |
|---|---|---|
| **Traçado** (`src/trajeto.js`, `src/pistas.js`) | O carro precisa estar no asfalto do circuito ou numa margem que o jogo permite (área de escape, box, avenida da Pampulha, zonas da cidade só pelas entradas). A distância na pista precisa bater com onde o carro estava, e cortes são contados como o jogo conta. | Anéis, voltas deslocadas 40 m e atalhos recusados em todas as pistas; nenhuma volta que o jogo conta foi recusada. |
| **Física do Opala** (`src/dinamica.js`, `src/envelope.js`) | Motor, freios, pneus e velocidade máxima do Opala do jogador no melhor caso (seco, motor da história, vácuo, descida), com folga para batidas. | Volta real de Interlagos acelerada 1,75% já é recusada; 482 voltas legítimas passaram. |
| **Comandos** (`comandos-volta.js` no jogo, `src/comandos.js`) | A volta vai com o que a física recebeu a cada 1/120 s, as teclas e o aparelho. Os comandos precisam cobrir a volta e explicá-la (o carro não ganha velocidade sem acelerador nem ré). | Volta sem comandos, com comandos cortados ou sem acelerador: recusada. |
| **Registro de voltas** (`voltas`, 90 dias, sem IP) | Toda volta fica com o resultado, o aparelho e sinais de programa (sem aparelho, teclas sintéticas, teclado sem teclas, pedal pela metade no teclado, toques curtos, teclas no mesmo instante, freadas idênticas a outra volta). Sinal nunca recusa: a administração olha. | A IA do jogo é marcada como "sem aparelho" e "freadas idênticas"; um piloto de teclado com ritmo humano, não. |

O painel ganhou a lista de voltas (com o filtro "só com sinais"), os sinais de cada recorde e o botão **Remover**, que tira um recorde (✓ ou ⚠️) das tabelas e avisa o piloto nos dados dele.

Duas regras antigas recusavam voltas legítimas e foram trocadas. "Ganhou pista sem andar por ela" pegava o lado de dentro dos grampos de Piracicaba e Chapecó e o pit lane de Velocitta; agora só pega saltos (3× o andado e uma folga). "Acelerou ou virou mais do que um Opala" pegava quase toda volta com batida ou rodada; saiu, porque a física nova cobre o que dá tempo (um empurrão para a frente acima de 4 m/s conta).

Continua sem garantia: um programa que fabrica a volta e os comandos com a própria física do jogo, ou uma física alterada abaixo das margens (cerca de 2% do tempo). Isso é o selo homologado. Por enquanto, os sinais do registro e o botão Remover são a defesa.

## Atualização — 25/10/2026 (noite): segunda revisão do login e dos recordes

Uma segunda revisão leu o servidor das contas, o painel, o jogo e a ponte, e atacou cada ponto suspeito contra o servidor local. Não encontrou injeção de SQL (tudo usa parâmetros) nem de HTML (só `textContent`; CSP estrita no ar), nem vazamento de dados pessoais. Os cabeçalhos no ar e os segredos do Worker (`SEAL_KEY`, `ADMINS`, `GOOGLE_CLIENT_SECRET`) foram conferidos. Corrigido:

| Achado | Correção |
|---|---|
| O bilhete fica com o jogo, e o limite de "5 recusas por bilhete" morava dentro dele. Reenviar o mesmo bilhete gravava um evento a cada vez: 40 reenvios deram 40 recusas, e a mesma passagem pela linha reenviada 10 vezes deu 10 "conferida". Mesmo com o limite de pedidos do Cloudflare, um IP esgotava em poucas horas as escritas do dia do D1. O apelido também podia ser trocado sem limite. | O que cada conta grava é contado no banco, por hora: até 120 recordes, 5 recusas no registro e 10 trocas de apelido. O evento "conferida" só é gravado quando a volta vira o melhor tempo do piloto, e o mesmo apelido de novo não grava nada. A migração `0005_limites.sql` troca o índice dos eventos por (conta, hora). |
| O pedaço do relógio não conferia a sessão. Um bilhete valia por até 8 horas depois de **Sair** ou de apagar a conta. Como o banco reaproveita o número de uma conta apagada, as recusas do bilhete velho caíam na conta nova. | Cada pedaço precisa vir com a sessão da conta do bilhete (o mesmo número e a mesma conta Google). Sem sessão: 401. Com outra conta: 409. O jogo pede um bilhete novo nos dois casos. |
| A volta da ponte (`#recordes-do-principal=`) era aceita de qualquer link. Bastava um link montado por outra pessoa, aberto por um piloto logado que ainda não tinha subido os antigos, para mandar recordes inventados em nome dele (por exemplo, 1:36 em Interlagos) e gastar a subida única da conta. | Na ida, o dev guarda na aba uma chave aleatória e a põe no caminho de volta. Na volta, só aceita os recordes com essa chave. Um link de fora é ignorado e limpo, e o pulo para a ponte acontece normalmente. A ponte não mudou, porque a chave viaja dentro do caminho de volta que ela já devolve. |

Continua em aberto:
- **Selos:** uma volta inventada (um anel liso) de 96,3 s ganha ✓ em Interlagos, onde o piso é 85% da linha ideal e o melhor real é 1:49,2. Os limites de física do fantasma são cerca do dobro do que um Opala faz, então uma volta real acelerada em 10% também passaria. Um ⚠️ antigo no piso fica acima de todos os ✓, porque a tabela ordena só pelo tempo. Falta decidir a ordem ✓/⚠️ e apertar os limites a partir dos fantasmas reais.
- **Cookie no GitHub:** o navegador manda o cookie de sessão em todo pedido de arquivo do dev, e o GitHub Pages o recebe. Fecha com uma Transform Rule do Cloudflare que remove o `Cookie` fora de `/api/` (não conferido).
- **Cota de requisições do Worker:** a regra de 30 pedidos a cada 10 s por IP segura rajadas, mas alguém insistente ainda gasta as 100 mil do dia.

## Atualização — 25/10/2026 (noite): painel de administração

`dev.autopobre.com.br/admin.html` mostra resumo, usuários, eventos e últimos recordes. É só leitura, e é do pacote do dev; o link principal e o `/dev/` antigo não o recebem, e a trava da publicação também procura `/api/admin`.
- **Quem vê:** o servidor só responde a contas com `admin=1` no banco, posto à mão. A página não decide nada, e o link na janela "Sua conta" só aparece para admin.
- **O que não aparece:** a conta Google de ninguém.
- **Eventos novos (LGPD):** entradas, saídas, apelido, subida dos antigos, voltas conferidas e recusadas, conta apagada. Sem IP, por 90 dias, explicados no "i" da conta e incluídos em "Baixar meus dados". Vão embora com a conta.
- **Recusas no registro:** no máximo 5 por bilhete, para ninguém usar voltas recusadas para gastar as escritas do banco.

## Atualização — 25/10/2026 (tarde): revisão independente do login e dos recordes

Um revisor separado, que não viu as conclusões de quem escreveu o código, atacou o login e os recordes contra o servidor local. Correções:

| Achado | Correção |
|---|---|
| Volta inventada passava como conferida. O piso era uma média de 70 m/s (Interlagos em 1:02), e um "carro parado" com amostras muito frequentes passava, porque a folga por amostra não dependia do intervalo entre elas. | O piso agora é 85% do tempo da **linha ideal** do Opala em cada pista, calculada pelo próprio jogo (`conta-cloudflare/gerar_pisos.mjs`; Interlagos em 1:36). A linha é um modelo: as primeiras voltas conferidas de verdade já a bateram em 3,5%, por isso a folga. O trajeto:<br>- só é aceito nas frequências que o jogo grava;<br>- tem folgas proporcionais ao tempo entre amostras e velocidade máxima de 70 m/s;<br>- tem limites de aceleração e de curva a cada meio segundo;<br>- precisa cobrir de fato 85% da pista. |
| Um bilhete antigo podia gravar volta em outra conta (a conta apagada deixava o número para a próxima). | O bilhete leva, selada, a conta Google de quem o pediu, e a volta só entra se a conta com aquele número ainda for a mesma. |
| A subida dos recordes antigos era "uma vez" só no navegador. Uma lista com 64 entradas iguais fazia 64 gravações, e datas falsas ganhavam empates. | Uma vez por conta **no servidor** (coluna `importou_em`), só o melhor de cada pista e modo, e nenhuma data anterior a 01/09/2026. |
| Recordes ⚠️ podiam esconder o ✓ do mesmo piloto, e a lista de pistas misturava os dois. | Cada piloto aparece pela melhor volta conferida, quando tem uma. A lista de pistas só conta voltas conferidas. |
| Pedido enviado em pedaços, sem tamanho declarado, era lido inteiro (até 100 MB). | O corpo é lido com teto de bytes. |
| Cookie com espaço Unicode no nome (` __Host-…`) era lido como o de sessão, o que permitia um subdomínio plantar sessão. | Só espaço e tab são aparados, e um nome repetido conta como sem sessão. |
| O fantasma era guardado como veio, com campos extras. | Só os campos conhecidos são guardados, e os de freio são conferidos. |
| A chave que sela bilhetes vinha do segredo do Google (quem visse o segredo no Google Cloud poderia forjar bilhetes). | Segredo próprio do Worker, `SEAL_KEY`. |
| Apelidos parecidos (versaletes `ᴋʟᴇʙᴇʀ`, `KIeber` no lugar de `Kleber`) e nomes da equipe. | Só letras do português e vizinhas. A unicidade ignora maiúsculas, acentos e separadores, e trata I, l e 1 como iguais, e O e 0 também. Há nomes reservados. |
| Dados pessoais: a tabela pública mostrava a hora exata de cada volta, "meus dados" vinha sem os fantasmas, e "Nada ficou guardado" prometia demais. | A tabela mostra só o dia. "Meus dados" traz os fantasmas. O texto conta que as cópias de segurança do banco somem em até 7 dias. |
| A trava da publicação olhava só nomes de arquivo. | Ela também procura `/api/conta`, `/api/recordes` e `const CONTA=true;` no conteúdo do link principal e do `/dev/` antigo. |

Os pedaços do relógio passaram de 5 para 10 segundos, o que reduz o consumo da cota pela metade.

Continua em aberto:
- ~~Cota esgotável por qualquer um~~ **feito em 25/10/2026:** regra de limite de pedidos no painel do Cloudflare (Security rules → rate limiting). Ela vale para `starts_with(http.request.uri.path, "/api/")` (o plano grátis só deixa usar o caminho, e só o dev tem `/api/`), conta por IP, permite 30 pedidos em 10 segundos e bloqueia por 10 segundos. Testada de fora: numa rajada de 60 pedidos, 28 passaram e 32 receberam 429, e 15 segundos depois tudo voltou ao normal. Pedidos barrados nem chegam ao Worker.
- **Trajeto inventado mas realista:** um anel do comprimento da pista, liso, ainda passa. Fecha com o traçado de cada pista no servidor (posição dentro da faixa).
- **Física alterada no navegador ou volta pilotada por programa:** só o selo homologado, com o servidor refazendo a volta pelos comandos, mais revisão humana.

## Atualização — 25/10/2026: endereço próprio para o dev e login com Google

A versão de testes ganhou endereço próprio, **dev.autopobre.com.br**. Ela é publicada pelo repositório `autopobre/dev`, que só tem o fluxo de publicação; o código continua aqui. Por ser outra origem, saves, preferências e cookies do dev não se misturam com os do link principal. O registro DNS passa pelo proxy do Cloudflare, e a Transform Rule de cabeçalhos agora vale para `autopobre.com.br`, `www.autopobre.com.br` e `dev.autopobre.com.br`. O domínio verificado na organização do GitHub protege o subdomínio contra tomada. O `/dev/` antigo continua no ar até o dono decidir o que fazer com ele.

O login com Google (`conta-cloudflare/`, detalhes no README de lá) existe só no dev:

| Risco | Como foi tratado |
|---|---|
| Guardar dados pessoais demais | O login pede só o escopo `openid`. O banco guarda o identificador da conta Google, o apelido, as datas e as sessões; nada de nome, e-mail ou foto. O próprio piloto baixa tudo ("Baixar meus dados") e apaga tudo ("Apagar conta"). |
| Roubo ou reaproveitamento da sessão | Cookie `__Host-ap_sessao`, com `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` e sem `Domain`: o JavaScript da página não lê, ele não vai para outros subdomínios, e outro subdomínio não consegue plantar um igual. O banco guarda só o SHA-256 do valor. Sair encerra a sessão também no servidor. |
| Um subdomínio mandar pedidos para outro | Para o navegador, o dev e o link principal são o mesmo site, e o `SameSite` não separa os dois. Toda escrita exige o cabeçalho `Origin` exato da página e corpo JSON. |
| Login forjado ou código do Google interceptado | O fluxo é *authorization code* com PKCE, `state` e `nonce`, todos guardados num cookie criptografado (AES-GCM) de 10 minutos e preso ao navegador que começou o login. O token do Google vem direto do servidor dele e é conferido: emissor, cliente, validade e nonce. A volta só aceita caminhos do próprio site. |
| Script de terceiros na página | Nenhum. O login acontece todo no servidor, e a CSP continua sem fontes externas. |
| Gastar a cota do banco | Começar um login não grava nada. O banco só recebe escritas depois de o Google devolver um código válido, e no modo de teste do Google só entram as contas da lista de pilotos. |

Recordes online (`conta-cloudflare/src/recordes.js`): uma volta só ganha o selo **conferido** se o servidor a acompanhou enquanto era pilotada. São um bilhete selado na largada, pedaços do relógio da física a cada 5 segundos e um a cada passagem pela linha. O relógio do jogo precisa andar junto com o do servidor (pega câmera lenta, relógio adiantado e pausa), e a volta precisa durar no servidor o que durou no jogo. O fantasma da volta precisa ter o tempo dela e percorrer a pista inteira sem passar da velocidade de um Opala nem cortar caminho. Nada é gravado durante a corrida: só a melhor volta do piloto, depois de conferida. Os recordes antigos de cada navegador sobem uma vez por conta, até 30/11/2026, marcados com **⚠️** ("Recordes de Versões Anteriores do Auto Pobre Podem Conter Erros"). Limite conhecido, e motivo de um selo futuro (homologado, com o servidor refazendo a volta pelos comandos): uma volta pilotada por programa, ou uma câmera lenta curta dentro de um pedaço, passam.

A ponte dos recordes (`levar-recordes.html`, na raiz do site principal) não tem conta nem fala com servidor. Ela lê os recordes e o piloto do navegador no autopobre.com.br e devolve o jogador ao `dev.autopobre.com.br` com eles no `#` do link. O destino é fixo no código (só o dev), então um link malicioso não consegue desviar os recordes de ninguém. Na volta, o dev confere tudo de novo e sobe uma vez, com ⚠️.

Os arquivos da conta só entram no pacote do dev (`preparar_publicacao.py --conta`). Sem essa opção, o build desliga a chave no `main.js` e falha se não encontrar a chave. O fluxo do link principal falha se o site principal ou a pasta `/dev/` vierem com eles.

**Antes de abrir o login para todo mundo:**
- Página de privacidade, que o Google também exige para sair do modo de teste.
- Uma regra de limite de pedidos no WAF para `/api/conta/`.
- Uma revisão do ECA Digital (Lei 15.211/2025, em vigor desde 17/03/2026), porque o jogo tem acesso provável de crianças e adolescentes.

## Atualização — 19/10/2026

Nova revisão do multiplayer, das entradas de texto, dos saves, da migração e da publicação. As entradas de texto continuam bem protegidas: nomes sempre como texto (`textContent`), escape nos poucos lugares que montam HTML, limpeza de caracteres de controle e invisíveis nos dois lados, e validação de cada mensagem e de cada save ao carregar. Corrigido nesta rodada:

| Achado | Correção |
|---|---|
| O site no ar era entregue direto pelo GitHub Pages, que ignora `_headers`: `frame-ancestors`, `X-Frame-Options`, HSTS e `nosniff` não chegavam ao navegador; só valia a CSP do HTML. Outro site podia abrir o jogo dentro de um quadro. | O site passou a ser servido pelo proxy do Cloudflare, que acrescenta os cabeçalhos (abaixo). Como reserva, `main.js` não inicia o jogo dentro de um quadro: mostra só um link que abre o jogo no próprio endereço. |
| O limite de 20 chaves erradas por minuto valia por sala: trocar o nome da sala dava tentativas novas. | Um Durable Object único (`Porteiro`) conta, por IP, as chaves erradas de todas as salas e as conexões ainda sem chave (até 21). O Worker põe a resposta num cabeçalho que ele mesmo define (o do cliente é substituído). Bloqueado, o IP não descobre nada sobre a chave; uma identidade conhecida, com token e chave, continua voltando. |
| Antes da chave, uma conexão podia mandar até 90 mensagens por segundo, gastando a cota grátis sem conhecer a chave. | Antes da autenticação só a chave é aceita; qualquer outra coisa fecha a conexão (1008). O jogo sempre manda a chave primeiro. |
| Quem tinha a chave podia lotar as 19 vagas com conexões paradas na porta. | Na porta ficam no máximo 10 pessoas, 4 por IP; a próxima tenta de novo sozinha (4013) assim que o anfitrião aceita alguém. |
| `migrar.html` aceitava saves de qualquer link mesmo depois da migração (só preenchia o que faltava, tudo validado). | Navegador já migrado não recebe mais nada. O prazo da migração passou de 01/04/2027 para **15/11/2026**: depois dele o endereço antigo não manda saves e `migrar.html` só redireciona (a página fica, porque o endereço antigo continua levando a ela). Os testes usam datas fixas para não quebrar depois do prazo. |
| Ferramentas do servidor: wrangler 4.143.1 trazia `sharp` com aviso alto (CVE da librsvg). Só rodava no PC, não no Cloudflare. | wrangler 4.149.0; `npm audit` do servidor e do jogo: zero vulnerabilidades. |
| `ORIGENS` de produção aceitava `http://127.0.0.1:8799`. | Só `https://autopobre.com.br`. O preview local usa o `wrangler dev` (`&servidor=local`). |

Continua em aberto, por decisão: `/dev/` e o link principal são a mesma origem (mesmos saves e mesma chave do grupo). A separação para `dev.autopobre.com.br` fica para depois; antes de criar o registro no DNS, verificar o domínio na organização do GitHub (registro TXT) para evitar tomada de subdomínio.

### No painel do Cloudflare (não dá para fazer pelo código)

1. **Cabeçalhos do site — feito em 19/10/2026, conferido no ar** (`autopobre.com.br`, `/dev/` e `www` passam pelo Cloudflare; os cinco cabeçalhos e o HSTS de 30 dias com subdomínios chegam; o HTML não é reescrito; DNSSEC continua válido). Como foi feito: em DNS, ligar o proxy (nuvem laranja) nos registros de `autopobre.com.br` que apontam para o GitHub; em SSL/TLS, modo *Full (strict)*; em Rules → Transform Rules → *Modify Response Header*, para `autopobre.com.br`, definir `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` e `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`; em Edge Certificates, ligar o HSTS. Deixar desligados Rocket Loader e Email Address Obfuscation, que reescrevem o HTML. A CSP completa continua no HTML; a do cabeçalho só acrescenta a proibição de quadro.
2. **Cota do servidor das salas:** em Security → WAF → *Rate limiting rules*, uma regra para `http.host eq "sala.autopobre.com.br"`, contando por IP, 20 pedidos em 10 segundos, bloqueio de 10 segundos. Pedidos barrados ali não chegam ao Worker. Isso barra rajadas; no plano grátis, alguém insistente e devagar ainda consegue gastar as 100 mil requisições do dia.

Verificações: `npm test` do servidor (em memória e no `wrangler dev`, com bloqueio entre salas, cabeçalho forjado, porta e chave primeiro), `testar_sala_jogo.mjs`, `testar_multiplayer.mjs`, `testar_estados_sala.mjs`, `testar_migracao.mjs` e o jogo no navegador, aberto direto e dentro de um quadro de outra origem. As mudanças do servidor só valem depois de `.\wrangler deploy`; as do jogo, na próxima publicação.

## Atualização — 03/10/2026

A revisão do multiplayer encontrou bloqueio coletivo por tentativas de chave errada e reconexões capazes de ultrapassar as 19 vagas. O Worker agora limita erros por IP, admite a reconexão de uma identidade conhecida com token e chave válidos, conta tokens inativos na ocupação e reserva a vaga do anfitrião durante a tolerância de queda. Conexões aguardando autenticação, histórico de tokens e contadores de tentativas têm limites; o histórico desconectado expira em 24 horas. Mensagens usam o tamanho real em bytes UTF-8. Os detalhes e prazos das expulsões estão no [README do servidor](sala-cloudflare/README.md).

No jogo, o anfitrião passou a conferir deslocamentos e a contar checkpoints, voltas e tempos dos convidados pela trajetória observada e pelo próprio relógio da corrida. Os campos de progresso e resultado declarados pelo convidado são substituídos antes da retransmissão. É uma verificação de plausibilidade: não há simulação física autoritativa no servidor, e um anfitrião adulterado ou trajetórias falsas que respeitem os limites continuam fora da garantia desta proteção.

O sufixo escondido depois de `_` foi preservado: é uma proteção visual para streams. A chave do grupo e o porteiro controlam o acesso às salas.

As ferramentas do servidor foram atualizadas para Wrangler 4.143.1, Miniflare 5.20260926.1-alpha e undici 7.29.1. O `npm audit` do lock do servidor retornou **zero vulnerabilidades**, incluindo dependências de desenvolvimento. A atualização incorpora a correção do [aviso oficial do undici sobre WebSocket](https://github.com/nodejs/undici/security/advisories/GHSA-rfgv-xxqx-mfg5). O lock do jogo, com Three.js 0.183.2, também retornou zero avisos na consulta desta revisão.

Verificações locais: testes de segurança do Worker, protocolo WebSocket no runtime Cloudflare local, integração do código de sala do jogo com o Worker e corrida em três janelas do navegador. Os testes de estados dos convidados exercitam a física das sete pistas, resultados fabricados, deslocamentos impossíveis, pausas e recuperação de conexão. O fluxo de publicação passa a executar também `testar_multiplayer.mjs` e `testar_estados_sala.mjs`.

Esta atualização foi preparada e testada localmente; não publica o site nem o Worker. Os achados e a verificação de setembro abaixo são o registro histórico da preparação inicial.

## Resultado

O jogo foi preparado para hospedagem estática a partir de `dist/`. A inspeção dos arquivos selecionados para Git e do pacote público não encontrou caminhos absolutos de máquina nem candidatos a credenciais pelos padrões examinados. A consulta ao registro oficial do npm para o lock atual, com Three.js 0.183.2, retornou zero vulnerabilidades conhecidas nas dependências em 13/09/2026. Isso não equivale a uma garantia de ausência de falhas.

## Achados e correções

| Achado | Correção |
|---|---|
| O servidor de teste oferecia a raiz do trabalho e listava diretórios. Seu bind era local, mas publicar essa árvore exporia originais, scripts, caches e futuras configurações privadas. | Lista explícita de arquivos públicos, listagem desativada, validação de caminho resolvido, recusa a links simbólicos/junctions e host inesperado. Continua restrito a `127.0.0.1`. Os processos antigos foram substituídos; a porta 8799 já usa o servidor corrigido. |
| Caminhos absolutos no lançador, testes e registros de trabalho. | Lançador usa PATH ou `INTERLAGOS_PYTHON`; testes descobrem o navegador pelo ambiente. Originais e registros de geração ficam fora do Git/site. |
| A foto do capacete carregava EXIF/XMP. | `capacete_publico.jpg` remove metadados EXIF/XMP/IPTC e comentários sem recodificar a imagem. Igualdade dos pixels decodificados conferida. O original é mantido somente localmente. |
| O nome da pintura era interpolado no caminho do modelo. | Validação explícita dos dois identificadores antes de qualquer carregamento. Não havia entrada remota ou formulário livre usando esse valor. |
| O progresso salvo aceitava tipos e números não finitos. | Campos do perfil são validados e limitados; dados inválidos voltam a valores seguros. Não foi identificada entrada remota nesse fluxo. |
| A aplicação não declarava política de carregamento de scripts. | CSP permite scripts locais e o hash exato do import map, bloqueia scripts inline/eventos e eval, restringe conexões e nega objetos/base/formulários. Cabeçalhos incluem `nosniff`, política de referência, restrições de permissões e anti-enquadramento. Estilos inline continuam permitidos para a interface dinâmica. |
| O link de ajuda apontava para documentação interna. | Página pública `sobre.html` com informações do jogo e fontes; links externos usam `noopener noreferrer`. |

As montagens de `innerHTML` examinadas usam textos internos do jogo e campos numéricos tratados. Não foram encontrados carregamento de código a partir de query string, execução de shell pela aplicação web, backend de autenticação, uploads, pagamentos ou envio de telemetria. Os modelos GLB publicados incorporam os recursos e não contêm caminhos locais ou URIs externas de imagens/buffers.

## Verificação realizada

- `npm audit --omit=dev --ignore-scripts --json`: zero avisos de vulnerabilidade conhecidos. A primeira consulta falhou por restrição de rede; a consulta concluída ao registro oficial retornou o resultado informado.
- `verificar_seguranca.py`: acessos a `.env`, `.git`, scripts, fontes internas, diretórios, caminhos com `..` e codificação percentual recusados; host e fetch de origem inadequada recusados; cabeçalhos presentes.
- Teste real no navegador: jogo local e pacote publicado em subdiretório, abertura, câmera interna, segunda pintura, início imersivo e retorno à sessão livre. Sem erros inesperados ou pedidos a serviços externos nos fluxos exercitados.
- Injeção proposital de script inline bloqueada pela CSP. Perfil corrompido sanitizado. Os testes usam avaliação pelo DevTools; a CSP da página permanece ativa.
- Regressão das regras imersivas aprovada após a alteração do perfil salvo.
- Regras do `.gitignore` verificadas com o próprio Git em um repositório temporário isolado: arquivos privados/dependências ignorados; lock, texturas públicas e pista preservados.
- Textos versionáveis e pacote público inspecionados por padrões; metadados das imagens e JSON interno dos três GLB conferidos.

Relatórios detalhados e captura da versão publicada ficam em `.audit-local/`, fora do Git. O manifesto do pacote lista tamanho e SHA-256 de cada arquivo. O build recusa arquivos inesperados já presentes em `dist/` e não os apaga silenciosamente.

## Publicar

Siga os comandos do [README](README.md). Envie somente `dist/`; não a raiz do trabalho. Configure HTTPS e os cabeçalhos de `dist/_headers` na hospedagem. O servidor Python é uma prévia local, não um servidor de produção; essa limitação consta na [documentação oficial do Python](https://docs.python.org/3/library/http.server.html).

A CSP também é incorporada no HTML como proteção de base. `frame-ancestors` precisa ser entregue por cabeçalho HTTP; consulte a [referência da CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy). `_headers` depende de suporte do provedor e deve ser traduzido para a configuração equivalente quando necessário.

A revisão foi realizada antes do primeiro envio ao repositório. Não havia `.git` na raiz naquele momento, portanto não existia histórico local para examinar. Publicar o código no GitHub não ativa uma hospedagem do jogo. `.gitignore` não apaga segredos já commitados em outro histórico; veja a [documentação do Git](https://git-scm.com/docs/gitignore). A auditoria de dependências cobre avisos conhecidos do registro, conforme a [documentação do npm](https://docs.npmjs.com/cli/audit/).

O dinheiro e os resultados são de um jogo local e podem ser alterados no próprio navegador. Um futuro ranking competitivo ou pagamentos exigiriam validação no servidor. A configuração efetiva de DNS, TLS, cabeçalhos e permissões da hospedagem ainda deve ser conferida após escolher o provedor.
