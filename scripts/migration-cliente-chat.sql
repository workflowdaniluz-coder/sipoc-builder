-- Migration: cliente_chat_sessao
-- Armazena histórico de conversa e dados coletados do chat do cliente

CREATE TABLE IF NOT EXISTS cliente_chat_sessao (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_acesso_id  uuid        NOT NULL REFERENCES tokens_acesso(id) ON DELETE CASCADE,
  nome_cliente     text,
  mensagens        jsonb       NOT NULL DEFAULT '[]',
  dados_coletados  jsonb       NOT NULL DEFAULT '{}',
  concluido_em     timestamptz,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);

-- Um token = uma sessão
CREATE UNIQUE INDEX IF NOT EXISTS cliente_chat_sessao_token_idx
  ON cliente_chat_sessao (token_acesso_id);

-- Trigger para atualizar atualizado_em automaticamente
CREATE OR REPLACE FUNCTION update_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cliente_chat_sessao_atualizado ON cliente_chat_sessao;
CREATE TRIGGER trg_cliente_chat_sessao_atualizado
  BEFORE UPDATE ON cliente_chat_sessao
  FOR EACH ROW EXECUTE FUNCTION update_atualizado_em();

-- RLS: sem acesso anon (a API usa service role key)
ALTER TABLE cliente_chat_sessao ENABLE ROW LEVEL SECURITY;
