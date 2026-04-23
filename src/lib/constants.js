export const STATUS_CONFIG = {
  em_andamento: { label: 'Em andamento', cls: 'bg-green-100 text-green-700 border-green-200' },
  pausado:      { label: 'Pausado',       cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  encerrado:    { label: 'Encerrado',     cls: 'bg-slate-100 text-slate-500 border-slate-200' },
}

export const BPMN_FASES = {
  MAPEAMENTO_AS_IS: 'mapeamento_as_is',
  REVISAO:          'revisao',
  VALIDACAO:        'validacao',
  RETRABALHO:       'retrabalho',
  CONCLUIDO:        'concluido',
}

export const BPMN_STATUS = {
  EM_REVISAO:        'em_revisao',
  ENVIADO_VALIDACAO: 'enviado_validacao',
  VALIDADO:          'validado',
  REJEITADO:         'rejeitado',
}

export const FASE_STATUS = {
  PLANEJADO:    'planejado',
  EM_ANDAMENTO: 'em_andamento',
  PAUSADO:      'pausado',
  CONCLUIDO:    'concluido',
}

export const VALIDACAO_ACOES = {
  APROVADO:   'aprovado',
  CONTESTADO: 'contestado',
}

export const CONTESTACAO_DECISAO = {
  ACEITO:    'aceito',
  REJEITADO: 'rejeitado',
}

export const NOTIF_STATUS = {
  UNREAD:    'unread',
  READ:      'read',
  DISMISSED: 'dismissed',
}

export const TOKEN_TIPO = {
  SIPOC:          'sipoc',
  VALIDACAO_BPMN: 'validacao_bpmn',
}

export const SIPOC_STATUS = {
  RASCUNHO:   'rascunho',
  EM_REVISAO: 'em_revisao',
  APROVADO:   'aprovado',
}

// bpmn_status resultante ao avançar para cada fase
export const BPMN_STATUS_POR_FASE = {
  revisao:    'em_revisao',
  validacao:  'enviado_validacao',
  concluido:  'validado',
  retrabalho: 'rejeitado',
}
