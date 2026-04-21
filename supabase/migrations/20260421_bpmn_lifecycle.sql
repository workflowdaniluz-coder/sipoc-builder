-- 20260421_bpmn_lifecycle.sql
-- Adiciona colunas de ciclo de vida BPMN nos sipocs e cria bpmn_fase_historico

-- ── Colunas de lifecycle nos sipocs ──────────────────────────────────────────

ALTER TABLE public.sipocs
  ADD COLUMN IF NOT EXISTS bpmn_fase_atual TEXT DEFAULT 'mapeamento_as_is'
    CHECK (bpmn_fase_atual IN ('mapeamento_as_is','revisao','validacao','retrabalho','concluido')),
  ADD COLUMN IF NOT EXISTS bpmn_data_prevista DATE,
  ADD COLUMN IF NOT EXISTS bpmn_responsavel TEXT,
  ADD COLUMN IF NOT EXISTS bpmn_revisao_parecer JSONB,
  ADD COLUMN IF NOT EXISTS bpmn_revisao_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bpmn_aprovado_em TIMESTAMPTZ;

-- ── Tabela de histórico de fases ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bpmn_fase_historico (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sipoc_id         UUID NOT NULL REFERENCES public.sipocs(id) ON DELETE CASCADE,
  consultor_id     UUID REFERENCES auth.users(id),
  fase             TEXT NOT NULL
    CHECK (fase IN ('mapeamento_as_is','revisao','validacao','retrabalho','concluido')),
  ciclo            INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'planejado'
    CHECK (status IN ('planejado','em_andamento','pausado','concluido')),
  iniciado_em      TIMESTAMPTZ,
  encerrado_em     TIMESTAMPTZ,
  duracao_segundos INTEGER NOT NULL DEFAULT 0,
  eventos          JSONB NOT NULL DEFAULT '[]',
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bpmn_fase_historico_sipoc_idx
  ON public.bpmn_fase_historico(sipoc_id);

CREATE INDEX IF NOT EXISTS bpmn_fase_historico_status_idx
  ON public.bpmn_fase_historico(sipoc_id, status);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.bpmn_fase_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consultor_full_access_bpmn_fase_historico"
  ON public.bpmn_fase_historico
  FOR ALL TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);
