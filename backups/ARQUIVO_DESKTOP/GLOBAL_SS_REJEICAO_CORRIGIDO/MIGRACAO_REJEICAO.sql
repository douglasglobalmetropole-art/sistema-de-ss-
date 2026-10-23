-- Execute uma vez no SQL Editor do Supabase, ANTES de iniciar consultas de rejeição.
-- Mantém TODAS as operações já permitidas no CHECK e adiciona somente as duas novas.
-- Não altera registros existentes nem autoriza escrita por si só.
DO $$
DECLARE
  definicao text;
  operacoes text[];
  lista text;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
    INTO definicao
  FROM pg_constraint c
  JOIN pg_class t ON t.oid=c.conrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='public' AND t.relname='siscom_gateway_jobs'
    AND c.conname='siscom_gateway_jobs_operation_check';

  IF definicao IS NULL OR position('operation' in definicao)=0 THEN
    RAISE EXCEPTION 'CHECK de operation não encontrado. Não foi feita nenhuma alteração.';
  END IF;

  SELECT array_agg(DISTINCT x[1]) INTO operacoes
  FROM regexp_matches(definicao, '''([^'']+)''', 'g') AS x;

  IF operacoes IS NULL OR cardinality(operacoes)<10 THEN
    RAISE EXCEPTION 'Não foi possível reconhecer com segurança as operações atuais. Nenhuma alteração realizada.';
  END IF;

  SELECT string_agg(quote_literal(op), ',') INTO lista
  FROM (SELECT DISTINCT unnest(operacoes || ARRAY['validar_ss_rejeicao','rejeitar_ss_real']) AS op) q;

  ALTER TABLE public.siscom_gateway_jobs DROP CONSTRAINT siscom_gateway_jobs_operation_check;
  EXECUTE 'ALTER TABLE public.siscom_gateway_jobs ADD CONSTRAINT siscom_gateway_jobs_operation_check CHECK (operation IN ('||lista||'))';
END $$;

-- Impede segundo PUT para a mesma SS, inclusive se a primeira tentativa ficou INCERTA.
-- Qualquer reenvio exige investigação e ação administrativa deliberada.
CREATE UNIQUE INDEX IF NOT EXISTS siscom_gateway_jobs_rejeicao_unica_idx
ON public.siscom_gateway_jobs ((payload->>'numero_ss'))
WHERE operation='rejeitar_ss_real';

SELECT operation,status,count(*) AS total
FROM public.siscom_gateway_jobs
WHERE operation IN ('validar_ss_rejeicao','rejeitar_ss_real')
GROUP BY operation,status
ORDER BY operation,status;
