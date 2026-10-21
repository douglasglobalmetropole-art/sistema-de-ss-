# Integração SISCOM Gateway — teste seguro

Esta versão acrescenta apenas dois endpoints ao `server.js` existente, sem modificar a interface:

- `POST /api/siscom-gateway/healthcheck` cria uma tarefa fictícia.
- `GET /api/siscom-gateway/jobs/:id` consulta seu resultado.

**Antes de usar:** configure na Vercel (Project > Settings > Environment Variables), exclusivamente como variáveis de servidor:

- `SUPABASE_URL`: URL do projeto Supabase.
- `SUPABASE_SECRET_KEY`: chave secreta/service_role do Supabase. Nunca envie ao navegador.
- `SISCOM_GATEWAY_API_TOKEN`: segredo aleatório exclusivo com no mínimo 32 caracteres.

O token é obrigatório para ambos os endpoints. O teste não contém informações da CESAN e não executa GET/POST no SISCOM.

Teste via PowerShell, de um terminal confiável (não do navegador):

```powershell
$token = Read-Host 'Token SISCOM_GATEWAY_API_TOKEN'
$base = 'https://SEU-SITE.vercel.app'
$h = @{Authorization = "Bearer $token"}
$job = Invoke-RestMethod -Method Post -Uri "$base/api/siscom-gateway/healthcheck" -Headers $h
$job
Start-Sleep -Seconds 7
Invoke-RestMethod -Uri "$base/api/siscom-gateway/jobs/$($job.id)" -Headers $h
```

A API da Vercel não deve ser chamada diretamente por JavaScript do navegador usando o token. Antes de adicionar botões à interface, integre autorização de usuários/servidor. O worker Windows atual deve permanecer executando e conectado ao Supabase.

**Segurança:** este é um teste de conectividade. Para uso com dados reais da CESAN, obtenha autorização para processamento externo, defina acesso por usuário, auditoria, retenção, tratamento de arquivos e execução idempotente.
