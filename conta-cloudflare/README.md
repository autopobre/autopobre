# Servidor das contas (login com Google)

Um Worker do Cloudflare com um banco D1 (`src/index.js`). Ele responde em `/api/` do próprio endereço do jogo; as páginas continuam no GitHub Pages. Por enquanto só existe no **dev.autopobre.com.br**, para os pilotos de teste.

O que o servidor garante, seja lá o que o navegador mande:

- **Dados mínimos (LGPD):** o login pede ao Google só o escopo `openid`. Chega o número que identifica a conta Google e nada mais: nem nome, nem e-mail, nem foto. O banco guarda esse número, o apelido que o piloto escolhe, a data de criação e do último login, e as sessões.
- **O próprio piloto controla os dados:** "Baixar meus dados" entrega tudo o que existe da conta num arquivo, e "Apagar conta" apaga a conta e as sessões de verdade.
- **Login pelo servidor:** a página não carrega nenhum script do Google. O fluxo é o *authorization code* com PKCE, `state` e `nonce`. Esses três viajam num cookie criptografado de 10 minutos, então nada é gravado no banco antes de o Google responder. O token do Google é conferido (emissor, cliente, validade e nonce) e descartado.
- **Sessão:** um valor aleatório no cookie `__Host-ap_sessao` (`HttpOnly; Secure; SameSite=Lax; Path=/`, sem `Domain`), válido por 30 dias. O banco guarda só o SHA-256 desse valor. São no máximo 10 sessões por conta, e um novo login no mesmo navegador encerra a sessão anterior.
- **Escritas:** só aceitas com a origem exata da página (`ORIGEM`) e corpo JSON de até 4 KB. Para o navegador, o dev e o link principal são o mesmo "site", então o `SameSite` sozinho não impediria uma página de um mandar pedidos para o outro.
- **Apelido:** de 3 a 20 letras latinas ou números, com espaço, ponto, traço ou sublinhado só entre eles. Não se repete entre pilotos, sem contar acentos nem maiúsculas ("João" e "joao" são o mesmo apelido).

## Rotas

| Rota | O que faz |
|---|---|
| `GET /api/conta/eu` | `{conta: null}` ou `{conta: {apelido, desde}}` |
| `GET /api/conta/entrar?volta=/caminho` | leva ao Google; volta para o caminho (só caminhos deste site) |
| `GET /api/conta/google` | a volta do Google (o *redirect URI*) |
| `POST /api/conta/apelido` `{apelido}` | escolhe ou troca o apelido |
| `POST /api/conta/sair` | encerra a sessão |
| `GET /api/conta/meus-dados` | tudo o que existe da conta, como arquivo |
| `POST /api/conta/apagar` `{confirmar: "APAGAR"}` | apaga a conta e as sessões |

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
   ```
4. Publique. O `deploy` cria a rota `dev.autopobre.com.br/api/*` no Cloudflare:
   ```sh
   .\wrangler deploy
   ```
5. Publique o dev (autopobre/dev → Actions → Publicar dev.autopobre.com.br): o pacote dele já vem com a conta (`preparar_publicacao.py --conta`).

Para trocar o segredo do Google, rode `.\wrangler secret put GOOGLE_CLIENT_SECRET` de novo. Os logins que estiverem em andamento naquela hora falham, e as sessões continuam valendo.

## Custos

Plano gratuito do Workers (100 mil requisições por dia) e do D1 (5 milhões de leituras e 100 mil escritas por dia). Abrir o jogo faz uma leitura. Só o login, o apelido, sair e apagar escrevem.

## Testar neste PC

- `npm test`:
  - `teste/testar_conta.mjs`: o servidor no Node, com SQLite e um Google de mentira. Cobre login, cookies, o que o banco guarda, apelidos, a trava de origem, os logins que precisam falhar, sessões, sair, "meus dados" e apagar.
  - `teste/testar_wrangler.mjs`: o mesmo login no runtime do Cloudflare (`wrangler dev`, banco local).
- `npm run local`: o servidor de contas na porta 8788, com o Google de mentira (entra direto). O preview do jogo (`servidor.py`) repassa `/api/` para ele, então no `…/pista_interlagos/teste/` do preview o menu mostra "Entrar com Google".
- `python pista_interlagos/scripts/verificar_conta.py [porta]` (da raiz do projeto, com o Python que tem o Playwright). Sobe os dois servidores sozinho e passa pela conta inteira no navegador, inclusive no celular.
