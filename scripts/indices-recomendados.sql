-- RECOMENDACOES PARA O RESPONSAVEL PELO BANCO; nenhum indice e aplicado pelo app.
-- Primeiro confirme se task/local/customfieldvalue sao tabelas fisicas e quais
-- indices equivalentes ja existem. Nao crie indices em views dbout_*.
-- uMov pode oferecer apenas leitura: neste caso solicite ao fornecedor.
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname IN ('u45468','u46915','public')
  AND tablename IN ('task','local','customfieldvalue','siscom_gateway_jobs')
ORDER BY schemaname,tablename,indexname;

-- Exemplos a avaliar com EXPLAIN (ANALYZE, BUFFERS) em ambiente de homologacao.
-- Substitua o schema para o lote correto e verifique custos de escrita/espaco.
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS ss_task_status_abertura_idx
-- ON u45468.task (lower(trim(coalesce(tsk_situation,''))),tsk_insertdatehour DESC,tsk_id DESC);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS ss_task_ultima_idx
-- ON u45468.task (tsk_lastexecutiondatehour DESC NULLS LAST,tsk_id DESC);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS ss_task_local_idx
-- ON u45468.task (loc_id,tsk_id DESC);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS ss_cfv_registro_campo_idx
-- ON u45468.customfieldvalue (cfv_registerid,cfd_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS ss_local_numero_idx
-- ON u45468.local (loc_integrationid);
-- Busca ILIKE '%texto%' exige avaliacao de pg_trgm/GIN para cada coluna usada.
-- Nao habilitar extensoes automaticamente nem indexar todas as colunas sem medir.

-- Supabase: fila pendente ordenada por criacao; nao incluir payload no indice.
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS siscom_jobs_pendentes_criacao_idx
-- ON public.siscom_gateway_jobs (created_at) WHERE status='pendente';
