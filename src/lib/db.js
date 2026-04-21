import { supabase } from './supabase'

// ──────────────────────────────────────────────
// Helpers de conversão de escala
// ──────────────────────────────────────────────

const LEVEL_TO_INT = { 'Baixo': 1, 'Médio': 2, 'Alto': 3 }
const INT_TO_LEVEL = { 1: 'Baixo', 2: 'Médio', 3: 'Alto' }

function levelToInt(level) {
  return LEVEL_TO_INT[level] ?? null
}

function intToLevel(n) {
  return INT_TO_LEVEL[n] ?? ''
}

function parsePadronizacao(text) {
  if (!text) return {}
  try { return JSON.parse(text) } catch { return {} }
}

// ──────────────────────────────────────────────
// PROJETOS (Clientes)
// ──────────────────────────────────────────────

export async function listarProjetos() {
  const { data, error } = await supabase
    .from('clientes')
    .select(`
      id, nome, cnpj, criado_em,
      data_contratacao, data_fim_projeto, quantidade_mapeamentos, status_projeto,
      setores (
        id,
        sipocs (
          id, status,
          nome_processo,
          suppliers, inputs, outputs, customers,
          tipo, impacto, maturidade, esforco,
          periodicidade, tecnologia, padronizacao,
          ferramentas, rasci_r,
          respostas_cliente
        )
      )
    `)
    .order('criado_em', { ascending: false })

  if (error) throw new Error('Erro ao listar projetos: ' + error.message)

  return data.map(c => {
    const allSipocs = c.setores?.flatMap(s => s.sipocs || []) ?? []

    const pgs = allSipocs.map(sipoc => {
      const pad = parsePadronizacao(sipoc.padronizacao)
      return calcularProgresso({
        name:               sipoc.nome_processo ?? '',
        suppliers:          sipoc.suppliers ?? [],
        inputs:             sipoc.inputs ?? [],
        outputs:            sipoc.outputs ?? [],
        customers:          sipoc.customers ?? [],
        tipo:               sipoc.tipo ?? '',
        impacto:            intToLevel(sipoc.impacto),
        maturidade:         intToLevel(sipoc.maturidade),
        esforco:            intToLevel(sipoc.esforco),
        periodicidade:      sipoc.periodicidade ?? '',
        tecnologia:         sipoc.tecnologia ?? '',
        inputsPadronizados: pad.inputsPadronizados ?? '',
        outputsPadronizados:pad.outputsPadronizados ?? '',
        geridoDados:        pad.geridoDados ?? '',
        ferramentas:        sipoc.ferramentas ?? [],
        rasci:              { r: sipoc.rasci_r ?? [] },
        respostas_cliente:  sipoc.respostas_cliente ?? {},
      })
    })

    const avgConsultor = pgs.length ? Math.round(pgs.reduce((a, pg) => a + pg.consultor, 0) / pgs.length) : 0
    const avgCliente   = pgs.length ? Math.round(pgs.reduce((a, pg) => a + pg.cliente,   0) / pgs.length) : 0

    return {
      id:                    c.id,
      empresa:               c.nome,
      cnpj:                  c.cnpj,
      dataCriacao:           new Date(c.criado_em).toLocaleDateString('pt-BR'),
      totalSipocs:           allSipocs.length,
      avgConsultor,
      avgCliente,
      statusProjeto:         c.status_projeto ?? 'em_andamento',
      dataFimProjeto:        c.data_fim_projeto ?? null,
      quantidadeMapeamentos: c.quantidade_mapeamentos ?? null,
      mapeamentosRealizados: allSipocs.filter(s => s.status === 'em_revisao').length,
    }
  })
}

export async function buscarDetalhesCliente(clienteId) {
  const { data: c, error } = await supabase
    .from('clientes')
    .select(`
      id, nome, cnpj, criado_em,
      data_contratacao, data_fim_projeto, quantidade_mapeamentos, status_projeto,
      escopo_tipo, areas_especificas, expectativa_cliente, maiores_dores,
      setores (
        id, nome, responsavel,
        sipocs ( id, status ),
        tokens_acesso ( usado_em )
      )
    `)
    .eq('id', clienteId)
    .single()

  if (error) throw new Error('Erro ao buscar detalhes do projeto: ' + error.message)

  const setores   = c.setores ?? []
  const allSipocs = setores.flatMap(s => s.sipocs ?? [])
  const allTokens = setores.flatMap(s => s.tokens_acesso ?? [])
  const ultimoAcesso = allTokens
    .map(t => t.usado_em).filter(Boolean).sort().at(-1) ?? null

  return {
    id:                    c.id,
    nome:                  c.nome,
    cnpj:                  c.cnpj,
    criadoEm:              c.criado_em,
    dataContratacao:       c.data_contratacao,
    dataFimProjeto:        c.data_fim_projeto,
    quantidadeMapeamentos: c.quantidade_mapeamentos,
    statusProjeto:         c.status_projeto ?? 'em_andamento',
    escopoTipo:            c.escopo_tipo,
    areasEspecificas:      c.areas_especificas ?? [],
    expectativaCliente:    c.expectativa_cliente,
    maioresDores:          c.maiores_dores,
    totalSetores:          setores.length,
    totalSipocs:           allSipocs.length,
    mapeamentosRealizados: allSipocs.filter(s => s.status === 'em_revisao').length,
    ultimoAcessoCliente:   ultimoAcesso,
  }
}

export async function atualizarCliente(clienteId, dados) {
  const payload = {}
  if (dados.nome               !== undefined) payload.nome                  = dados.nome
  if (dados.cnpj               !== undefined) payload.cnpj                  = dados.cnpj || null
  if (dados.dataContratacao    !== undefined) payload.data_contratacao      = dados.dataContratacao || null
  if (dados.dataFimProjeto     !== undefined) payload.data_fim_projeto      = dados.dataFimProjeto || null
  if (dados.quantidadeMapeamentos !== undefined) payload.quantidade_mapeamentos = dados.quantidadeMapeamentos ? Number(dados.quantidadeMapeamentos) : null
  if (dados.escopoTipo         !== undefined) payload.escopo_tipo           = dados.escopoTipo || null
  if (dados.areasEspecificas   !== undefined) payload.areas_especificas     = dados.areasEspecificas ?? []
  if (dados.expectativaCliente !== undefined) payload.expectativa_cliente   = dados.expectativaCliente || null
  if (dados.maioresDores       !== undefined) payload.maiores_dores         = dados.maioresDores || null
  if (dados.statusProjeto      !== undefined) payload.status_projeto        = dados.statusProjeto

  const { error } = await supabase.from('clientes').update(payload).eq('id', clienteId)
  if (error) throw new Error('Erro ao atualizar projeto: ' + error.message)
}

export async function criarProjeto(dados) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Usuário não autenticado.')

  const { data: cliente, error: clienteError } = await supabase
    .from('clientes')
    .insert({
      nome:                    dados.nome,
      cnpj:                    dados.cnpj || null,
      criado_por:              user.id,
      data_contratacao:        dados.dataContratacao || null,
      data_fim_projeto:        dados.dataFimProjeto || null,
      quantidade_mapeamentos:  dados.quantidadeMapeamentos ? Number(dados.quantidadeMapeamentos) : null,
      escopo_tipo:             dados.escopoTipo || null,
      areas_especificas:       dados.areasEspecificas ?? [],
      expectativa_cliente:     dados.expectativaCliente || null,
      maiores_dores:           dados.maioresDores || null,
      status_projeto:          'em_andamento',
    })
    .select('id, nome, cnpj, criado_em, data_fim_projeto, quantidade_mapeamentos')
    .single()

  if (clienteError) throw new Error('Erro ao criar projeto: ' + clienteError.message)

  // Setor inicial "Geral"
  const { error: setorError } = await supabase
    .from('setores')
    .insert({ cliente_id: cliente.id, consultor_id: user.id, nome: 'Geral' })

  if (setorError) throw new Error('Erro ao criar setor inicial: ' + setorError.message)

  return {
    id:                    cliente.id,
    empresa:               cliente.nome,
    cnpj:                  cliente.cnpj,
    dataCriacao:           new Date(cliente.criado_em).toLocaleDateString('pt-BR'),
    totalSipocs:           0,
    avgConsultor:          0,
    avgCliente:            0,
    statusProjeto:         'em_andamento',
    dataFimProjeto:        cliente.data_fim_projeto ?? null,
    quantidadeMapeamentos: cliente.quantidade_mapeamentos ?? null,
    mapeamentosRealizados: 0,
  }
}

// ──────────────────────────────────────────────
// SETORES
// ──────────────────────────────────────────────

export async function listarSetores(clienteId) {
  const { data, error } = await supabase
    .from('setores')
    .select('id, nome, responsavel')
    .eq('cliente_id', clienteId)
    .order('criado_em')

  if (error) throw new Error('Erro ao listar setores: ' + error.message)
  return data
}

export async function criarSetor(clienteId, nome, responsavel = null) {
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('setores')
    .insert({ cliente_id: clienteId, consultor_id: user.id, nome, responsavel })
    .select('id, nome, responsavel')
    .single()

  if (error) throw new Error('Erro ao criar setor: ' + error.message)
  return data
}

export async function atualizarResponsavelSetor(setorId, responsavel) {
  const { error } = await supabase
    .from('setores')
    .update({ responsavel })
    .eq('id', setorId)

  if (error) throw new Error('Erro ao atualizar responsável: ' + error.message)
}

async function obterOuCriarSetor(clienteId, nomeSetor) {
  const { data: existing } = await supabase
    .from('setores')
    .select('id')
    .eq('cliente_id', clienteId)
    .eq('nome', nomeSetor)
    .maybeSingle()

  if (existing) return existing.id

  const { data: { user } } = await supabase.auth.getUser()

  const { data: novo, error } = await supabase
    .from('setores')
    .insert({ cliente_id: clienteId, consultor_id: user.id, nome: nomeSetor })
    .select('id')
    .single()

  if (error) throw new Error(`Erro ao criar setor "${nomeSetor}": ` + error.message)
  return novo.id
}

// ──────────────────────────────────────────────
// SIPOCS (Processos)
// ──────────────────────────────────────────────

export async function listarSipocs(setorId) {
  const { data, error } = await supabase
    .from('sipocs')
    .select('*')
    .eq('setor_id', setorId)
    .order('criado_em')

  if (error) throw new Error('Erro ao listar processos: ' + error.message)

  // Mapeia nome_processo → name para compatibilidade com ClientView
  return data.map(s => ({ ...s, name: s.nome_processo }))
}

export async function listarProcessos(clienteId) {
  const setores = await listarSetores(clienteId)
  if (!setores.length) return []

  const setorIds = setores.map(s => s.id)

  const { data: sipocs, error } = await supabase
    .from('sipocs')
    .select('*')
    .in('setor_id', setorIds)
    .order('criado_em')

  if (error) throw new Error('Erro ao carregar processos: ' + error.message)

  return sipocs.map(sipoc => {
    const setor = setores.find(s => s.id === sipoc.setor_id)
    const pad = parsePadronizacao(sipoc.padronizacao)

    return {
      id: sipoc.id,
      supabase_id: sipoc.id,
      setor: setor?.nome ?? 'Geral',
      setor_id: sipoc.setor_id,
      setor_responsavel: setor?.responsavel ?? '',
      name: sipoc.nome_processo ?? 'Novo Processo',
      suppliers: sipoc.suppliers?.length ? sipoc.suppliers : [''],
      inputs: sipoc.inputs?.length ? sipoc.inputs : [''],
      outputs: sipoc.outputs?.length ? sipoc.outputs : [''],
      customers: sipoc.customers?.length ? sipoc.customers : [''],
      ferramentas: sipoc.ferramentas ?? [],
      periodicidade: sipoc.periodicidade ?? '',
      tipo: sipoc.tipo ?? '',
      inputsPadronizados: pad.inputsPadronizados ?? '',
      outputsPadronizados: pad.outputsPadronizados ?? '',
      geridoDados: pad.geridoDados ?? '',
      tecnologia: sipoc.tecnologia ?? '',
      maturidade: intToLevel(sipoc.maturidade),
      esforco: intToLevel(sipoc.esforco),
      impacto: intToLevel(sipoc.impacto),
      observacoes: sipoc.observacoes ?? '',
      rasci: {
        r: sipoc.rasci_r ?? [],
        a: sipoc.rasci_a ?? [],
        s: sipoc.rasci_s ?? [],
        c: sipoc.rasci_c ?? [],
        i: sipoc.rasci_i ?? [],
      },
      respostas_cliente: sipoc.respostas_cliente ?? {},
      status: sipoc.status ?? 'rascunho',
      bpmn_status:              sipoc.bpmn_status ?? null,
      bpmn_drive_url:           sipoc.bpmn_drive_url ?? null,
      bpmn_validado_por:        sipoc.bpmn_validado_por ?? null,
      bpmn_validacao_comentario:sipoc.bpmn_validacao_comentario ?? null,
      bpmn_validado_em:         sipoc.bpmn_validado_em ?? null,
    }
  })
}

export async function salvarProcesso(clienteId, processo) {
  const { data: { user } } = await supabase.auth.getUser()

  const setorId = processo.setor_id
    ?? (await obterOuCriarSetor(clienteId, processo.setor || 'Geral'))

  const payload = {
    setor_id: setorId,
    consultor_id: user.id,
    nome_processo: processo.name,
    suppliers: processo.suppliers.filter(s => s.trim()),
    inputs: processo.inputs.filter(s => s.trim()),
    outputs: processo.outputs.filter(s => s.trim()),
    customers: processo.customers.filter(s => s.trim()),
    ferramentas: processo.ferramentas,
    periodicidade: processo.periodicidade,
    tipo: processo.tipo,
    padronizacao: JSON.stringify({
      inputsPadronizados: processo.inputsPadronizados,
      outputsPadronizados: processo.outputsPadronizados,
      geridoDados: processo.geridoDados,
    }),
    tecnologia: processo.tecnologia,
    maturidade: levelToInt(processo.maturidade),
    esforco: levelToInt(processo.esforco),
    impacto: levelToInt(processo.impacto),
    observacoes: processo.observacoes,
    rasci_r: processo.rasci?.r ?? [],
    rasci_a: processo.rasci?.a ?? [],
    rasci_s: processo.rasci?.s ?? [],
    rasci_c: processo.rasci?.c ?? [],
    rasci_i: processo.rasci?.i ?? [],
    respostas_cliente: processo.respostas_cliente ?? null,
    status: 'rascunho',
  }

  const isExisting = processo.supabase_id && !processo.supabase_id.startsWith('p')

  if (isExisting) {
    const { data, error } = await supabase
      .from('sipocs')
      .update(payload)
      .eq('id', processo.supabase_id)
      .select('id')
      .single()

    if (error) throw new Error('Erro ao atualizar processo: ' + error.message)
    return { supabase_id: data.id, setor_id: setorId }
  } else {
    const { data, error } = await supabase
      .from('sipocs')
      .insert(payload)
      .select('id')
      .single()

    if (error) throw new Error('Erro ao criar processo: ' + error.message)
    return { supabase_id: data.id, setor_id: setorId }
  }
}

export async function deletarProcesso(processoId) {
  const { error } = await supabase
    .from('sipocs')
    .delete()
    .eq('id', processoId)

  if (error) throw new Error('Erro ao excluir processo: ' + error.message)
}

// ──────────────────────────────────────────────
// TOKENS DE ACESSO
// ──────────────────────────────────────────────

function gerarSenhaToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function gerarTokenAcesso(setorId) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Não autenticado.')

  const { data: setor, error: setorError } = await supabase
    .from('setores')
    .select('nome, clientes ( nome )')
    .eq('id', setorId)
    .single()

  if (setorError) throw new Error('Setor não encontrado: ' + setorError.message)

  const senha = gerarSenhaToken()

  const { data, error } = await supabase
    .from('tokens_acesso')
    .insert({
      setor_id: setorId,
      setor_nome: setor.nome,
      cliente_nome: setor.clientes.nome,
      criado_por: user.id,
      senha,
    })
    .select('id, token, criado_em, expira_em, setor_nome, cliente_nome, senha')
    .single()

  if (error) throw new Error('Erro ao gerar token: ' + error.message)

  return { ...data, url: `${window.location.origin}?t=${data.token}` }
}

export async function verificarSenhaToken(token, senha) {
  const { data, error } = await supabase.rpc('verificar_senha_token', { p_token: token, p_senha: senha })
  if (error) throw new Error('Erro ao verificar senha: ' + error.message)
  return data
}

export async function listarTokensDoSetor(setorId) {
  const { data, error } = await supabase
    .from('tokens_acesso')
    .select('id, token, criado_em, expira_em, usado_em, revogado_em, senha')
    .eq('setor_id', setorId)
    .order('criado_em', { ascending: false })

  if (error) throw new Error('Erro ao listar tokens: ' + error.message)
  return data.map(t => ({ ...t, url: `${window.location.origin}?t=${t.token}` }))
}

export async function revogarToken(tokenId) {
  const { error } = await supabase
    .from('tokens_acesso')
    .update({ revogado_em: new Date().toISOString() })
    .eq('id', tokenId)

  if (error) throw new Error('Erro ao revogar token: ' + error.message)
}

export async function buscarSetorPorToken(token) {
  const { data, error } = await supabase
    .from('tokens_acesso')
    .select('id, token, setor_id, setor_nome, cliente_nome, expira_em, usado_em, senha')
    .eq('token', token)
    .is('revogado_em', null)
    .gt('expira_em', new Date().toISOString())
    .maybeSingle()

  if (error) throw new Error('Erro ao validar token: ' + error.message)
  if (!data) return null

  return {
    id: data.id,
    token: data.token,
    setor_id: data.setor_id,
    setor_nome: data.setor_nome,
    cliente_nome: data.cliente_nome,
    expira_em: data.expira_em,
    usado_em: data.usado_em,
    has_senha: !!data.senha,
  }
}

// ──────────────────────────────────────────────
// PROGRESSO DE PREENCHIMENTO
// ──────────────────────────────────────────────

export function calcularProgresso(sipoc) {
  // ── Campos do consultor ──────────────────────
  const consultorChecks = [
    { ok: !!(sipoc.name && sipoc.name !== 'Novo Processo'), label: 'Nome do processo' },
    { ok: !!(sipoc.suppliers?.some(s => s.trim())),          label: 'Suppliers' },
    { ok: !!(sipoc.inputs?.some(s => s.trim())),             label: 'Inputs' },
    { ok: !!(sipoc.outputs?.some(s => s.trim())),            label: 'Outputs' },
    { ok: !!(sipoc.customers?.some(s => s.trim())),          label: 'Customers' },
    { ok: !!sipoc.tipo,                                       label: 'Tipo do processo' },
    { ok: !!sipoc.impacto,                                    label: 'Impacto' },
    { ok: !!(sipoc.rasci?.r?.length > 0),                     label: 'RASCI — Responsável' },
  ]

  const consultorFilled    = consultorChecks.filter(c => c.ok).length
  const pendentesConsultor = consultorChecks.filter(c => !c.ok).map(c => c.label)
  const consultor = Math.round((consultorFilled / consultorChecks.length) * 100)

  // ── Campos do cliente ────────────────────────
  const rc          = sipoc.respostas_cliente
  const inputNames  = (sipoc.inputs  || []).filter(s => s.trim())
  const outputNames = (sipoc.outputs || []).filter(s => s.trim())
  const clienteChecks = []

  inputNames.forEach(name => {
    const d = rc?.inputs?.[name]
    clienteChecks.push({ ok: !!d?.padronizado,           label: `Entrada "${name}" — padronizado` })
    clienteChecks.push({ ok: !!(d?.quem_envia?.length),  label: `Entrada "${name}" — quem envia` })
  })
  outputNames.forEach(name => {
    const d = rc?.outputs?.[name]
    clienteChecks.push({ ok: !!d?.padronizado,            label: `Saída "${name}" — padronizado` })
    clienteChecks.push({ ok: !!(d?.quem_recebe?.length),  label: `Saída "${name}" — quem recebe` })
  })
  clienteChecks.push({ ok: !!rc?.processo?.periodicidade,   label: 'Periodicidade (cliente)' })
  clienteChecks.push({ ok: !!rc?.processo?.volume_esforco,  label: 'Volume e esforço' })

  const clienteTotal     = clienteChecks.length
  const clienteFilled    = clienteChecks.filter(c => c.ok).length
  const pendentesCliente = clienteChecks.filter(c => !c.ok).map(c => c.label)
  const cliente = sipoc.status === 'em_revisao'
    ? 100
    : clienteTotal === 0 ? 0 : Math.round((clienteFilled / clienteTotal) * 100)

  return { consultor, cliente, pendentesConsultor, pendentesCliente }
}

// ──────────────────────────────────────────────
// RESPOSTAS DO CLIENTE
// ──────────────────────────────────────────────

async function _validarToken(tokenId) {
  const { data, error } = await supabase
    .from('tokens_acesso')
    .select('id, usado_em')
    .eq('id', tokenId)
    .is('revogado_em', null)
    .gt('expira_em', new Date().toISOString())
    .maybeSingle()
  if (error || !data) throw new Error('Token inválido ou expirado. Solicite um novo link ao consultor.')
  return data
}

export async function salvarRespostaCliente(tokenId, sipocId, respostas) {
  const tokenData = await _validarToken(tokenId)

  const { error: sipocError } = await supabase
    .from('sipocs')
    .update({ respostas_cliente: respostas })
    .eq('id', sipocId)

  if (sipocError) throw new Error('Erro ao salvar respostas: ' + sipocError.message)

  if (!tokenData.usado_em) {
    await supabase
      .from('tokens_acesso')
      .update({ usado_em: new Date().toISOString() })
      .eq('id', tokenId)
  }
}

// ──────────────────────────────────────────────
// NOTIFICAÇÕES
// ──────────────────────────────────────────────

/**
 * Lista notificações unread e read (não dismissed) de um projeto,
 * ordenadas por created_at desc. Requer consultor autenticado (RLS).
 */
export async function listarNotificacoes(projectId) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, status, created_at')
    .eq('project_id', projectId)
    .in('status', ['unread', 'read'])
    .order('created_at', { ascending: false })

  if (error) throw new Error('Erro ao listar notificações: ' + error.message)
  return data ?? []
}

/**
 * Atualiza o status de uma notificação para 'read' ou 'dismissed'.
 * Requer consultor autenticado (RLS).
 */
export async function atualizarStatusNotificacao(notificationId, status) {
  if (!['read', 'dismissed'].includes(status)) {
    throw new Error('Status inválido. Use "read" ou "dismissed".')
  }

  const { error } = await supabase
    .from('notifications')
    .update({ status })
    .eq('id', notificationId)

  if (error) throw new Error('Erro ao atualizar notificação: ' + error.message)
}

/**
 * Conta notificações unread de múltiplos projetos de uma vez.
 * Retorna { [project_id]: count }.
 */
export async function contarNotificacoesUnread(projectIds) {
  if (!projectIds.length) return {}

  const { data, error } = await supabase
    .from('notifications')
    .select('project_id')
    .in('project_id', projectIds)
    .eq('status', 'unread')

  if (error) throw new Error('Erro ao contar notificações: ' + error.message)

  const counts = {}
  for (const row of data ?? []) {
    counts[row.project_id] = (counts[row.project_id] ?? 0) + 1
  }
  return counts
}

// ──────────────────────────────────────────────
// TOKENS DE VALIDAÇÃO BPMN
// ──────────────────────────────────────────────

export async function gerarTokenValidacao(sipocId) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Não autenticado.')

  const { data, error } = await supabase
    .from('tokens_validacao_bpmn')
    .insert({ sipoc_id: sipocId, criado_por: user.id })
    .select('id, token, expira_em, criado_em')
    .single()

  if (error) throw new Error('Erro ao gerar token de validação: ' + error.message)
  return { ...data, url: `${window.location.origin}?vt=${data.token}` }
}

export async function getTokenValidacaoBySipoc(sipocId) {
  const { data, error } = await supabase
    .from('tokens_validacao_bpmn')
    .select('id, token, expira_em, criado_em')
    .eq('sipoc_id', sipocId)
    .is('revogado_em', null)
    .gt('expira_em', new Date().toISOString())
    .order('criado_em', { ascending: false })
    .maybeSingle()

  if (error) throw new Error('Erro ao buscar token de validação: ' + error.message)
  return data ? { ...data, url: `${window.location.origin}?vt=${data.token}` } : null
}

export async function revogarTokenValidacao(tokenId) {
  const { error } = await supabase
    .from('tokens_validacao_bpmn')
    .update({ revogado_em: new Date().toISOString() })
    .eq('id', tokenId)

  if (error) throw new Error('Erro ao revogar token de validação: ' + error.message)
}

// ──────────────────────────────────────────────
// BPMN LIFECYCLE
// ──────────────────────────────────────────────

/**
 * Retorna todos os sipocs de um projeto com os campos de lifecycle BPMN.
 */
export async function getSipocsByCliente(clienteId) {
  const setores = await listarSetores(clienteId)
  if (!setores.length) return []
  const setorIds = setores.map(s => s.id)

  const { data: sipocs, error } = await supabase
    .from('sipocs')
    .select(`
      id, nome_processo, setor_id,
      bpmn_fase_atual, bpmn_data_prevista, bpmn_responsavel,
      bpmn_drive_url, bpmn_status,
      bpmn_validado_por, bpmn_validacao_comentario, bpmn_validado_em,
      bpmn_revisao_parecer, bpmn_revisao_em, bpmn_aprovado_em
    `)
    .in('setor_id', setorIds)
    .order('criado_em')

  if (error) throw new Error('Erro ao carregar processos BPMN: ' + error.message)

  return sipocs.map(s => {
    const setor = setores.find(st => st.id === s.setor_id)
    return {
      ...s,
      bpmn_fase_atual: s.bpmn_fase_atual ?? 'mapeamento_as_is',
      setor_nome: setor?.nome ?? 'Geral',
      setor_responsavel: setor?.responsavel ?? '',
    }
  })
}

/**
 * Busca todas as linhas de bpmn_fase_historico para uma lista de sipocIds.
 * Retorna um mapa { [sipocId]: faseRow[] } com linhas ordenadas mais recentes primeiro.
 */
export async function getAllFasesHistorico(sipocIds) {
  if (!sipocIds.length) return {}

  const { data, error } = await supabase
    .from('bpmn_fase_historico')
    .select('*')
    .in('sipoc_id', sipocIds)
    .order('criado_em', { ascending: false })

  if (error) throw new Error('Erro ao carregar histórico de fases: ' + error.message)

  const map = {}
  for (const id of sipocIds) map[id] = []
  for (const row of data ?? []) {
    if (map[row.sipoc_id]) map[row.sipoc_id].push(row)
  }
  return map
}

/**
 * Inicia o timer de uma fase.
 * Se existir uma linha 'planejado' para essa fase, atualiza para 'em_andamento'.
 * Caso contrário, cria uma nova linha.
 * Também atualiza bpmn_fase_atual no sipoc.
 */
export async function iniciarFase(sipocId, fase, consultorId) {
  const now = new Date().toISOString()

  const { data: existing } = await supabase
    .from('bpmn_fase_historico')
    .select('id, eventos, duracao_segundos')
    .eq('sipoc_id', sipocId)
    .eq('fase', fase)
    .eq('status', 'planejado')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  let faseRow
  if (existing) {
    const { data, error } = await supabase
      .from('bpmn_fase_historico')
      .update({
        status: 'em_andamento',
        iniciado_em: now,
        eventos: [...(existing.eventos ?? []), { tipo: 'start', em: now }],
      })
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error) throw new Error('Erro ao iniciar fase: ' + error.message)
    faseRow = data
  } else {
    const { data, error } = await supabase
      .from('bpmn_fase_historico')
      .insert({
        sipoc_id:        sipocId,
        consultor_id:    consultorId,
        fase,
        ciclo:           1,
        status:          'em_andamento',
        iniciado_em:     now,
        duracao_segundos: 0,
        eventos:         [{ tipo: 'start', em: now }],
      })
      .select('*')
      .single()
    if (error) throw new Error('Erro ao iniciar fase: ' + error.message)
    faseRow = data
  }

  await supabase.from('sipocs').update({ bpmn_fase_atual: fase }).eq('id', sipocId)
  return faseRow
}

/**
 * Pausa o timer de uma fase em andamento.
 * Acumula a duração percorrida desde o último start/resume.
 */
export async function pausarFase(faseId) {
  const now = new Date().toISOString()

  const { data: fase, error: fetchErr } = await supabase
    .from('bpmn_fase_historico')
    .select('eventos, duracao_segundos')
    .eq('id', faseId)
    .single()
  if (fetchErr) throw new Error('Erro ao buscar fase: ' + fetchErr.message)

  const eventos = fase.eventos ?? []
  const last = eventos[eventos.length - 1]
  let delta = 0
  if (last && (last.tipo === 'start' || last.tipo === 'resume')) {
    delta = Math.round((new Date(now) - new Date(last.em)) / 1000)
  }

  const { data, error } = await supabase
    .from('bpmn_fase_historico')
    .update({
      status:           'pausado',
      duracao_segundos: (fase.duracao_segundos ?? 0) + delta,
      eventos:          [...eventos, { tipo: 'pause', em: now }],
    })
    .eq('id', faseId)
    .select('*')
    .single()
  if (error) throw new Error('Erro ao pausar fase: ' + error.message)
  return data
}

/**
 * Retoma o timer de uma fase pausada.
 */
export async function retomarFase(faseId) {
  const now = new Date().toISOString()

  const { data: fase, error: fetchErr } = await supabase
    .from('bpmn_fase_historico')
    .select('eventos')
    .eq('id', faseId)
    .single()
  if (fetchErr) throw new Error('Erro ao buscar fase: ' + fetchErr.message)

  const { data, error } = await supabase
    .from('bpmn_fase_historico')
    .update({
      status:  'em_andamento',
      eventos: [...(fase.eventos ?? []), { tipo: 'resume', em: now }],
    })
    .eq('id', faseId)
    .select('*')
    .single()
  if (error) throw new Error('Erro ao retomar fase: ' + error.message)
  return data
}

/**
 * Encerra o timer de uma fase (sem avançar para a próxima fase).
 * Acumula a duração final e fecha a linha como 'concluido'.
 */
export async function concluirFase(faseId) {
  const now = new Date().toISOString()

  const { data: fase, error: fetchErr } = await supabase
    .from('bpmn_fase_historico')
    .select('eventos, duracao_segundos')
    .eq('id', faseId)
    .single()
  if (fetchErr) throw new Error('Erro ao buscar fase: ' + fetchErr.message)

  const eventos = fase.eventos ?? []
  const last = eventos[eventos.length - 1]
  let delta = 0
  if (last && (last.tipo === 'start' || last.tipo === 'resume')) {
    delta = Math.round((new Date(now) - new Date(last.em)) / 1000)
  }

  const { data, error } = await supabase
    .from('bpmn_fase_historico')
    .update({
      status:           'concluido',
      encerrado_em:     now,
      duracao_segundos: (fase.duracao_segundos ?? 0) + delta,
      eventos:          [...eventos, { tipo: 'finish', em: now }],
    })
    .eq('id', faseId)
    .select('*')
    .single()
  if (error) throw new Error('Erro ao concluir fase: ' + error.message)
  return data
}

/**
 * Avança o sipoc para uma nova fase:
 * - Atualiza bpmn_fase_atual (e bpmn_status quando relevante)
 * - Cria uma linha 'planejado' para a nova fase
 */
export async function avancarFase(sipocId, novaFase, consultorId) {
  // Mapeamento automático de bpmn_status ao avançar fases
  const statusPorFase = {
    revisao:    'em_revisao',
    validacao:  'enviado_validacao',
    concluido:  'validado',
    retrabalho: 'rejeitado',
  }

  const updatesSipoc = { bpmn_fase_atual: novaFase }
  if (statusPorFase[novaFase]) updatesSipoc.bpmn_status = statusPorFase[novaFase]

  const { error: sipocError } = await supabase
    .from('sipocs')
    .update(updatesSipoc)
    .eq('id', sipocId)
  if (sipocError) throw new Error('Erro ao atualizar fase do sipoc: ' + sipocError.message)

  // Determinar ciclo para a nova fase (incrementa se já existiu)
  const { data: ultimoCiclo } = await supabase
    .from('bpmn_fase_historico')
    .select('ciclo')
    .eq('sipoc_id', sipocId)
    .eq('fase', novaFase)
    .order('ciclo', { ascending: false })
    .limit(1)
    .maybeSingle()

  const ciclo = (ultimoCiclo?.ciclo ?? 0) + 1

  const { data, error } = await supabase
    .from('bpmn_fase_historico')
    .insert({
      sipoc_id:        sipocId,
      consultor_id:    consultorId,
      fase:            novaFase,
      ciclo,
      status:          'planejado',
      duracao_segundos: 0,
      eventos:         [],
    })
    .select('*')
    .single()
  if (error) throw new Error('Erro ao criar nova fase: ' + error.message)
  return data
}

/**
 * Salva o parecer de revisão de um sipoc.
 */
export async function salvarParecerRevisao(sipocId, parecer) {
  const { error } = await supabase
    .from('sipocs')
    .update({
      bpmn_revisao_parecer: parecer,
      bpmn_revisao_em:      new Date().toISOString(),
    })
    .eq('id', sipocId)
  if (error) throw new Error('Erro ao salvar parecer: ' + error.message)
}

/**
 * Atualiza campos informativos do BPMN (drive url, responsável, data prevista, status).
 */
export async function atualizarBpmnCampos(sipocId, campos) {
  const payload = {}
  if (campos.bpmn_drive_url      !== undefined) payload.bpmn_drive_url      = campos.bpmn_drive_url      || null
  if (campos.bpmn_responsavel    !== undefined) payload.bpmn_responsavel    = campos.bpmn_responsavel    || null
  if (campos.bpmn_data_prevista  !== undefined) payload.bpmn_data_prevista  = campos.bpmn_data_prevista  || null
  if (campos.bpmn_status         !== undefined) payload.bpmn_status         = campos.bpmn_status         || null

  const { error } = await supabase.from('sipocs').update(payload).eq('id', sipocId)
  if (error) throw new Error('Erro ao atualizar campos BPMN: ' + error.message)
}

// ──────────────────────────────────────────────

export async function finalizarRespostaCliente(tokenId, sipocId, respostas) {
  await _validarToken(tokenId)

  const { error } = await supabase
    .from('sipocs')
    .update({ respostas_cliente: respostas, status: 'em_revisao' })
    .eq('id', sipocId)

  if (error) throw new Error('Erro ao finalizar: ' + error.message)

  // Revoga o token para que o link não possa mais ser utilizado
  await supabase
    .from('tokens_acesso')
    .update({
      revogado_em: new Date().toISOString(),
      usado_em: new Date().toISOString(),
    })
    .eq('id', tokenId)
}
