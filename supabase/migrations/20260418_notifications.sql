-- Migration: notifications table
-- Ambiente: homologação (sapthkusrcvsgvpyuczc)
-- Data: 2026-04-18

CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  type        text        NOT NULL,
  title       text        NOT NULL,
  body        jsonb       NOT NULL DEFAULT '{}',
  status      text        NOT NULL DEFAULT 'unread'
              CHECK (status IN ('unread', 'read', 'dismissed')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Consultor lê apenas notificações dos seus projetos
CREATE POLICY "consultores veem suas notificacoes"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.clientes WHERE criado_por = auth.uid()
    )
  );

-- Consultor pode atualizar status das suas notificações (read / dismissed)
CREATE POLICY "consultores atualizam suas notificacoes"
  ON public.notifications FOR UPDATE TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.clientes WHERE criado_por = auth.uid()
    )
  )
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS notifications_project_status_idx
  ON public.notifications(project_id, status);

CREATE INDEX IF NOT EXISTS notifications_created_at_idx
  ON public.notifications(created_at DESC);
