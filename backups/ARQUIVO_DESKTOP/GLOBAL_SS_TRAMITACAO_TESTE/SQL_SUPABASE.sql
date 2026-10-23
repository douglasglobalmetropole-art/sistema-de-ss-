-- Execute no SQL Editor do projeto correto. Preserva operações anteriores.
ALTER TABLE public.siscom_gateway_jobs DROP CONSTRAINT IF EXISTS siscom_gateway_jobs_operation_check;
ALTER TABLE public.siscom_gateway_jobs ADD CONSTRAINT siscom_gateway_jobs_operation_check CHECK (operation IN (
'healthcheck','consultar_ss','consultar_eventos_ss','consultar_ss_baixa','listar_equipes','listar_micros','listar_causas','preparar_baixa_ss','baixar_ss_real','listar_areas_complementar','listar_servicos_complementar','consultar_complementares_ss','criar_ss_complementar','login_siscom','logout_siscom','siscom_login_individual','siscom_logout_individual','validar_ss_rejeicao','rejeitar_ss_real',
'tram_contratos','tram_fases','tram_macros','tram_responsaveis','tram_pesquisar','tram_detalhes','tram_ni','tram_itens','tram_anexos','tram_historico','tram_ultima_acao','tram_perfil'));
