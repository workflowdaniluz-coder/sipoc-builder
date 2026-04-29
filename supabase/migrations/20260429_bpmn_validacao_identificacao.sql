-- Adiciona identificação do validador na tabela de respostas de validação BPMN

ALTER TABLE public.bpmn_validacao_cliente
  ADD COLUMN IF NOT EXISTS nome_validador  TEXT,
  ADD COLUMN IF NOT EXISTS cargo_validador TEXT;
