-- Migration: campos BPMN em sipocs + tabela tokens_validacao_bpmn
-- Ambiente: homologação (sapthkusrcvsgvpyuczc)
-- Data: 2026-04-20

-- ── 1. Campos BPMN na tabela sipocs ─────────────────────────────────────────
ALTER TABLE public.sipocs
  ADD COLUMN IF NOT EXISTS bpmn_status               TEXT
    CHECK (bpmn_status IN (
      'rascunho','em_andamento','concluido',
      'em_revisao','enviado_validacao','validado','rejeitado'
    )),
  ADD COLUMN IF NOT EXISTS bpmn_drive_url             TEXT,
  ADD COLUMN IF NOT EXISTS bpmn_validado_por          TEXT,
  ADD COLUMN IF NOT EXISTS bpmn_validacao_comentario  TEXT,
  ADD COLUMN IF NOT EXISTS bpmn_validado_em           TIMESTAMPTZ;

-- ── 2. Tabela de tokens de validação BPMN ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tokens_validacao_bpmn (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sipoc_id    UUID        NOT NULL REFERENCES public.sipocs(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL UNIQUE
                DEFAULT encode(gen_random_bytes(24), 'base64url'),
  criado_por  UUID        REFERENCES auth.users(id),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  revogado_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tvb_sipoc_id   ON public.tokens_validacao_bpmn (sipoc_id);
CREATE INDEX IF NOT EXISTS idx_tvb_token      ON public.tokens_validacao_bpmn (token);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.tokens_validacao_bpmn ENABLE ROW LEVEL SECURITY;

-- Leitura anônima: portal pode ler tokens válidos para validação
CREATE POLICY "Portal lê token válido de BPMN"
  ON public.tokens_validacao_bpmn FOR SELECT
  USING (revogado_em IS NULL AND expira_em > NOW());

-- Consultores autenticados gerenciam seus próprios tokens
CREATE POLICY "Consultores gerenciam tokens de validação BPMN"
  ON public.tokens_validacao_bpmn FOR ALL
  TO authenticated
  USING (criado_por = auth.uid())
  WITH CHECK (criado_por = auth.uid());
