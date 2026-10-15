# Auto-Pobre Racing · Em construção

Página provisória do domínio oficial do Auto-Pobre Racing. Ela existe para que o domínio, o DNS no Cloudflare e o certificado HTTPS do GitHub Pages já estejam prontos e estáveis quando o jogo for migrado para este repositório.

O repositório é `autopobre/autopobre`, da organization [autopobre](https://github.com/autopobre). O domínio oficial é `autopobre.com.br`.

## Estrutura

- `site/`: tudo o que é publicado. `index.html` é a página "Box em obras" e `404.html` atende endereços inexistentes. As duas usam `style.css` e não têm JavaScript; a CSP no HTML só permite estilos e imagens do próprio site.
- `site/assets/`: o logo e a arte de abertura, copiados do jogo.
- `.github/workflows/pages.yml`: publica `site/` a cada push na `main` (ou manualmente em **Actions → Run workflow**).

Para ver localmente, sirva a pasta `site/` com qualquer servidor estático. O `404.html` usa caminhos absolutos (`/style.css`), então só fica completo na raiz do domínio.

## 1. Publicar no GitHub Pages

1. Crie o repositório `autopobre` na organization como **público** (no plano gratuito, o Pages só funciona em repositório público) e envie este projeto para a `main`.
2. Em **Settings → Pages → Build and deployment → Source**, escolha **GitHub Actions**. É a mesma origem que o jogo usa, então ela não muda na migração.
3. Abra **Actions** e confira se "Publicar pagina Em Construcao" terminou. A página aparece em `https://autopobre.github.io/autopobre/` (ainda sem estilo no 404, que espera a raiz do domínio).

## 2. Domínio no Cloudflare

A ordem importa: o GitHub só emite o certificado HTTPS quando enxerga o DNS apontando direto para ele.

1. **Verifique o domínio na organization** (protege contra outra pessoa publicar no seu domínio). Em **github.com/organizations/autopobre/settings → Pages → Add a domain** (as configurações da organization, não as do repositório), informe `autopobre.com.br`. O GitHub mostra um registro TXT; crie-o no Cloudflare e clique em **Verify**.
2. No Cloudflare, em **DNS → Records**, crie os registros abaixo com o proxy **desligado** (nuvem cinza, "DNS only"):

   | Tipo  | Nome  | Conteúdo                |
   |-------|-------|-------------------------|
   | A     | `@`   | `185.199.108.153`       |
   | A     | `@`   | `185.199.109.153`       |
   | A     | `@`   | `185.199.110.153`       |
   | A     | `@`   | `185.199.111.153`       |
   | AAAA  | `@`   | `2606:50c0:8000::153`   |
   | AAAA  | `@`   | `2606:50c0:8001::153`   |
   | AAAA  | `@`   | `2606:50c0:8002::153`   |
   | AAAA  | `@`   | `2606:50c0:8003::153`   |
   | CNAME | `www` | `autopobre.github.io`   |

   O arquivo [cloudflare-dns.txt](cloudflare-dns.txt) tem esses nove registros para importar de uma vez em **Import DNS Records**, sem marcar a opção de proxy. Mantenha o MX `.`, o TXT `v=spf1 -all` e o `_dmarc` que o Cloudflare já trouxe: eles avisam que o domínio não usa e-mail e impedem e-mails falsos em nome dele.
3. No repositório, em **Settings → Pages → Custom domain**, informe `autopobre.com.br` e salve. O GitHub confere o DNS e pede o certificado; isso leva de alguns minutos a algumas horas. O `www` passa a redirecionar para o domínio principal sozinho.
4. Quando a opção liberar, marque **Enforce HTTPS**.

### Proxy do Cloudflare (opcional)

Com o proxy desligado, o Cloudflare só responde o DNS e o GitHub cuida do HTTPS e da CDN. Esse é o caminho mais simples e já basta para o jogo. Ligue o proxy (nuvem laranja) só quando houver motivo, como regras de redirecionamento, estatísticas ou firewall. Nesse caso:

- Ligue somente depois de o **Enforce HTTPS** estar ativo no GitHub.
- Em **SSL/TLS → Overview**, use **Full (strict)**. Nunca use **Flexible**: junto com o Enforce HTTPS ele cria um laço infinito de redirecionamento.
- Mantenha desligados os recursos que injetam scripts na página (Rocket Loader, Email Address Obfuscation, injeção automática do Web Analytics). A CSP do jogo bloqueia esses scripts.
- Se o site mostrar o erro **526** do Cloudflare, o certificado do GitHub não conseguiu renovar através do proxy. Desligue o proxy até o GitHub renovar e ligue de novo.

## 3. Dia da migração

O domínio, o certificado e a origem do Pages ficam neste repositório, então a migração não mexe no DNS.

1. Traga o histórico e as **tags** do jogo. O fluxo de publicação do jogo escolhe as versões por tag (`apr-1.0`, `apr-2.1`, `apr-3.0`…), então elas precisam vir junto. No clone do repositório antigo:

   ```sh
   git remote add novo <URL deste repositório>
   git push novo main --force   # substitui a página provisória pelo jogo
   git push novo --tags
   ```

   Se quiser guardar a página provisória, crie antes uma branch `em-construcao` neste repositório.
2. Rode o fluxo **Publicar Auto-Pobre Racing** em Actions. O domínio continua configurado em **Settings → Pages**.
3. Atualize os textos que citam `inteligenciamilgrau.github.io/autopobre` (descrições do fluxo e README do jogo).
4. No repositório antigo, troque o jogo por uma página que leve ao domínio novo, para não quebrar links já compartilhados.

O jogo não usa caminhos fixos de `/autopobre/`, então funciona na raiz do domínio sem ajustes. Recordes, saldo e preferências ficam no `localStorage`, que é separado por endereço: quem já jogava em `inteligenciamilgrau.github.io` começa do zero no domínio novo, a menos que o jogo ganhe uma forma de exportar e importar esses dados.
