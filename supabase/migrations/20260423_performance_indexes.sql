-- Índices compostos para queries frequentes

-- tokens_acesso: busca por token (validação de acesso de cliente)
CREATE INDEX IF NOT EXISTS idx_tokens_acesso_token
  ON public.tokens_acesso (token)
  WHERE revogado_em IS NULL;

-- tokens_acesso: listagem por setor + tipo + status (tela de gestão do consultor)
CREATE INDEX IF NOT EXISTS idx_tokens_acesso_setor_tipo
  ON public.tokens_acesso (setor_id, tipo, revogado_em, usado_em);

-- tokens_validacao_bpmn: busca por token (validação de BPMN)
CREATE INDEX IF NOT EXISTS idx_tokens_validacao_token
  ON public.tokens_validacao_bpmn (token)
  WHERE revogado_em IS NULL;

-- tokens_validacao_bpmn: token ativo por sipoc
CREATE INDEX IF NOT EXISTS idx_tokens_validacao_sipoc
  ON public.tokens_validacao_bpmn (sipoc_id, revogado_em, expira_em);

-- bpmn_validacao_cliente: contestações pendentes por sipoc
CREATE INDEX IF NOT EXISTS idx_bpmn_validacao_sipoc_acao
  ON public.bpmn_validacao_cliente (sipoc_id, acao)
  WHERE decisao_consultor IS NULL;

-- bpmn_fase_historico: fase ativa por sipoc (usada para fechar timer)
CREATE INDEX IF NOT EXISTS idx_bpmn_fase_historico_sipoc_status
  ON public.bpmn_fase_historico (sipoc_id, fase, status);

-- notifications: unread por projeto (badge de notificação no dashboard)
CREATE INDEX IF NOT EXISTS idx_notifications_project_status
  ON public.notifications (project_id, status)
  WHERE status = 'unread';

-- sipocs: listagem por setor (query mais frequente do sistema)
CREATE INDEX IF NOT EXISTS idx_sipocs_setor_id
  ON public.sipocs (setor_id, criado_em);

-- setores: listagem por cliente
CREATE INDEX IF NOT EXISTS idx_setores_cliente_id
  ON public.setores (cliente_id, criado_em);
