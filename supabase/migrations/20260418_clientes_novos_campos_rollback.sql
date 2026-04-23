-- Rollback: remove campos adicionados em 20260418_clientes_novos_campos.sql
-- Ambiente: homologação (sapthkusrcvsgvpyuczc)
-- Data: 2026-04-18

ALTER TABLE public.clientes
  DROP COLUMN IF EXISTS data_contratacao,
  DROP COLUMN IF EXISTS data_fim_projeto,
  DROP COLUMN IF EXISTS quantidade_mapeamentos,
  DROP COLUMN IF EXISTS escopo_tipo,
  DROP COLUMN IF EXISTS areas_especificas,
  DROP COLUMN IF EXISTS expectativa_cliente,
  DROP COLUMN IF EXISTS maiores_dores,
  DROP COLUMN IF EXISTS status_projeto;
