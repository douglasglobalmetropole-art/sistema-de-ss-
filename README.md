# SS de Campo — Vercel

Painel de recepção, acompanhamento e encerramento de SS integrado ao banco PostgreSQL do uMov.

## Publicar na Vercel

1. Envie esta pasta a um repositório GitHub e importe o repositório na Vercel.
2. Em **Settings → Environment Variables**, cadastre os valores do arquivo `.env.example`:
   - `DB_HOST`
   - `DB_PORT`
   - `DB_NAME`
   - `DB_USER`
   - `DB_PASSWORD`
   - `DB_SSL`
3. Faça o deploy. A página inicial e as rotas `/api/*` serão atendidas pelo `server.js`.

## Segurança

Não envie o arquivo `.env` ao GitHub nem ao ZIP de publicação. Ele contém a senha do banco e deve existir somente no ambiente local ou nas variáveis da Vercel.
