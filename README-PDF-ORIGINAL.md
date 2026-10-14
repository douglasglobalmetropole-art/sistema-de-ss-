# PDF do relatório original uMov

O botão **Gerar PDF do Relatório** em **Notas para Baixar** converte a mesma página aberta por **Visualizar Arquivo** (incluindo fotografias) em PDF por meio de Chromium serverless. Não é o PDF resumido anterior.

Dependências: `@sparticuz/chromium` e `puppeteer-core` (instaladas automaticamente pelo Vercel com `npm install`). O package-lock antigo foi removido para não ficar incompatível com as novas dependências.

**Atenção:** A geração depende do acesso à URL do uMov e de memória, tempo e tamanho de função suficientes na Vercel. O relatório pode falhar se o serviço externo bloquear a renderização automatizada ou se a função exceder limites do plano. Faça teste em produção com uma SS que contenha fotografias. O endpoint anterior `/api/relatorio-pdf` permanece no código, mas não é usado pelo novo botão.
