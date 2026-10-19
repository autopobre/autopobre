# Revisão para publicação — 13/09/2026

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
