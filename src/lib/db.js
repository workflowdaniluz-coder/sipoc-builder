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
      id,
      nome,
      cnpj,
      criado_em,
      setores (
        id,
        sipocs (
          id,
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
      id:           c.id,
      empresa:      c.nome,
      cnpj:         c.cnpj,
      dataCriacao:  new Date(c.criado_em).toLocaleDateString('pt-BR'),
      totalSipocs:  allSipocs.length,
      avgConsultor,
      avgCliente,
    }
  })
}

export async function criarProjeto(nome, cnpj = null) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Usuário não autenticado.')

  const { data: cliente, error: clienteError } = await supabase
    .from('clientes')
    .insert({ nome, cnpj, criado_por: user.id })
    .select('id, nome, criado_em')
    .single()

  if (clienteError) throw new Error('Erro ao criar projeto: ' + clienteError.message)

  // Setor inicial "Geral"
  const { error: setorError } = await supabase
    .from('setores')
    .insert({ cliente_id: cliente.id, consultor_id: user.id, nome: 'Geral' })

  if (setorError) throw new Error('Erro ao criar setor inicial: ' + setorError.message)

  return {
    id: cliente.id,
    empresa: cliente.nome,
    dataCriacao: new Date(cliente.criado_em).toLocaleDateString('pt-BR'),
    totalSipocs: 0,
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
