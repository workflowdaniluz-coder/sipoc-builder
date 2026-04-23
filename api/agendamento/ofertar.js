/**
 * POST /api/agendamento/ofertar
 * Consultor oferta slots de disponibilidade → cria holds no Google Calendar
 * → persiste token_agendamento → retorna link pro cliente.
 */

import { createClient } from '@supabase/supabase-js'
import { getAccessTokenForConsultor } from '../_lib/google-auth.js'
import { createHoldEvent, deleteHoldEvent } from '../_lib/google-calendar.js'

const ORIGIN = process.env.APP_ORIGIN ?? 'https://app.p-excellence.com.br'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método não permitido' })

  const jwt = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/, '').trim()
  if (!jwt) return res.status(401).json({ ok: false, error: 'Não autorizado.' })

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
  if (authErr || !user) return res.status(401).json({ ok: false, error: 'Token inválido.' })

  const {
    cliente_id, setor_id = null, tipo, tipo_customizado = null,
    duracao_min, sipoc_ids = [], slots = [], qtd_escolha = 1,
    participantes_sugeridos = [],
  } = req.body ?? {}

  // Validações
  if (!cliente_id || !tipo || !duracao_min)
    return res.status(400).json({ ok: false, error: 'Campos obrigatórios ausentes.' })

  if (!['sipoc', 'bpmn', 'validacao_bpmn', 'outra'].includes(tipo))
    return res.status(400).json({ ok: false, error: 'Tipo inválido.' })

  if (tipo === 'outra' && !tipo_customizado?.trim())
    return res.status(400).json({ ok: false, error: 'tipo_customizado obrigatório para tipo "outra".' })

  if (tipo !== 'outra' && tipo_customizado)
    return res.status(400).json({ ok: false, error: 'tipo_customizado só é válido para tipo "outra".' })

  if (![60, 120].includes(Number(duracao_min)))
    return res.status(400).json({ ok: false, error: 'duracao_min deve ser 60 ou 120.' })

  if (!Array.isArray(slots) || slots.length < 2 || slots.length > 5)
    return res.status(400).json({ ok: false, error: 'Informe entre 2 e 5 slots.' })

  const agora = Date.now()
  const minFuturo = agora + 60 * 60 * 1000 // 1h no futuro
  for (const s of slots) {
    const d = new Date(s)
    if (isNaN(d.getTime()) || d.getTime() < minFuturo)
      return res.status(400).json({ ok: false, error: `Slot inválido ou muito próximo: ${s}` })
  }

  const qtd = Number(qtd_escolha)
  if (!Number.isInteger(qtd) || qtd < 1 || qtd > slots.length)
    return res.status(400).json({ ok: false, error: `qtd_escolha deve ser entre 1 e ${slots.length}.` })

  // Valida cliente
  const { data: cliente, error: clienteErr } = await supabase
    .from('clientes').select('id, nome')
    .eq('id', cliente_id).maybeSingle()
  if (clienteErr || !cliente)
    return res.status(403).json({ ok: false, error: 'Cliente não encontrado.' })

  // Valida setor
  let setorNome = null
  if (setor_id) {
    const { data: setor, error: setorErr } = await supabase
      .from('setores').select('id, nome')
      .eq('id', setor_id).eq('cliente_id', cliente_id).maybeSingle()
    if (setorErr || !setor)
      return res.status(403).json({ ok: false, error: 'Setor não encontrado ou não pertence ao cliente.' })
    setorNome = setor.nome
  }

  // Busca access token Google
  let accessToken
  try {
    ;({ accessToken } = await getAccessTokenForConsultor(user.id))
  } catch (err) {
    if (err.message === 'CONSULTOR_GOOGLE_NAO_CONECTADO')
      return res.status(400).json({ ok: false, error: 'Conecte sua agenda Google primeiro.' })
    if (err.message === 'CONSULTOR_GOOGLE_REVOGADO')
      return res.status(400).json({ ok: false, error: 'Conexão Google expirada. Reconecte sua agenda.' })
    console.error('[ofertar] Erro Google auth:', err.message)
    return res.status(500).json({ ok: false, error: 'Erro ao autenticar com o Google.' })
  }

  // Cria holds no Calendar — rollback se qualquer um falhar
  const slotsEnriquecidos = []
  for (const slotStart of slots) {
    const startISO = new Date(slotStart).toISOString()
    const endISO   = new Date(new Date(slotStart).getTime() + Number(duracao_min) * 60000).toISOString()
    try {
      const { googleEventId } = await createHoldEvent({
        accessToken, clienteNome: cliente.nome, startISO, endISO,
      })
      slotsEnriquecidos.push({ start: startISO, end: endISO, google_hold_event_id: googleEventId })
    } catch (err) {
      console.error('[ofertar] Erro ao criar hold, revertendo:', err.message)
      for (const s of slotsEnriquecidos)
        await deleteHoldEvent({ accessToken, googleEventId: s.google_hold_event_id })
      return res.status(500).json({ ok: false, error: 'Erro ao criar evento no Google Calendar. Tente novamente.' })
    }
  }

  // Persiste token_agendamento
  const expiraEm = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  const { data: tokenRow, error: insertErr } = await supabase
    .from('tokens_agendamento')
    .insert({
      cliente_id,
      setor_id: setor_id || null,
      consultor_id: user.id,
      tipo,
      tipo_customizado: tipo === 'outra' ? tipo_customizado.trim() : null,
      duracao_min: Number(duracao_min),
      sipoc_ids,
      slots: slotsEnriquecidos,
      qtd_escolha: qtd,
      participantes_sugeridos,
      expira_em: expiraEm,
    })
    .select('token')
    .single()

  if (insertErr) {
    console.error('[ofertar] CRITICAL: holds criados mas INSERT falhou:', insertErr.message)
    for (const s of slotsEnriquecidos)
      await deleteHoldEvent({ accessToken, googleEventId: s.google_hold_event_id })
    return res.status(500).json({ ok: false, error: 'Erro ao salvar oferta. Tente novamente.' })
  }

  return res.status(201).json({
    ok: true,
    token: tokenRow.token,
    link: `${ORIGIN}/agendar/${tokenRow.token}`,
    expira_em: expiraEm,
    slots_count: slotsEnriquecidos.length,
    qtd_escolha: qtd,
  })
}
