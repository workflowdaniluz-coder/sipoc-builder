-- Migration: novos campos na tabela clientes
-- Ambiente: homologação (sapthkusrcvsgvpyuczc)
-- Data: 2026-04-18

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS data_contratacao       DATE,
  ADD COLUMN IF NOT EXISTS data_fim_projeto       DATE,
  ADD COLUMN IF NOT EXISTS quantidade_mapeamentos INTEGER,
  ADD COLUMN IF NOT EXISTS escopo_tipo            TEXT
    CHECK (escopo_tipo IN ('empresa_completa', 'areas_especificas')),
  ADD COLUMN IF NOT EXISTS areas_especificas      TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS expectativa_cliente    TEXT,
  ADD COLUMN IF NOT EXISTS maiores_dores          TEXT,
  ADD COLUMN IF NOT EXISTS status_projeto         TEXT    NOT NULL DEFAULT 'em_andamento'
    CHECK (status_projeto IN ('em_andamento', 'pausado', 'encerrado'));
