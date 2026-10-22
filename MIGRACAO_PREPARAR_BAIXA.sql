-- Executar no Supabase SQL Editor para habilitar a nova consulta SOMENTE LEITURA.
ALTER TABLE public.siscom_gateway_jobs DROP CONSTRAINT IF EXISTS siscom_gateway_jobs_operation_check;
ALTER TABLE public.siscom_gateway_jobs ADD CONSTRAINT siscom_gateway_jobs_operation_check
CHECK (operation IN ('healthcheck','consultar_ss','consultar_eventos_ss','consultar_ss_baixa',
'listar_equipes','listar_micros','listar_causas','preparar_baixa_ss'));
