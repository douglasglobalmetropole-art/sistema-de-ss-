-- Execute primeiro no SQL Editor do Supabase. A restrição única bloqueia reenvios da mesma SS.
ALTER TABLE public.siscom_gateway_jobs DROP CONSTRAINT IF EXISTS siscom_gateway_jobs_operation_check;
ALTER TABLE public.siscom_gateway_jobs ADD CONSTRAINT siscom_gateway_jobs_operation_check CHECK (operation IN ('healthcheck','consultar_ss','consultar_eventos_ss','consultar_ss_baixa','listar_equipes','listar_micros','listar_causas','preparar_baixa_ss','baixar_ss_real'));
CREATE UNIQUE INDEX IF NOT EXISTS siscom_baixa_real_uma_vez_por_ss ON public.siscom_gateway_jobs ((payload->>'numero_ss')) WHERE operation='baixar_ss_real';
