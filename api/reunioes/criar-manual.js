/**
 * POST /api/reunioes/criar-manual
 * Cria reunião ponta a ponta: valida, gera evento no Google Calendar com Meet,
 * persiste em reunioes + reuniao_sipocs.
 */

import { createClient } from '@supabase/supabase-js'
import { getAccessTokenForConsultor } from '../_lib/google-auth.js'
import { createCalendarEventWithMeet } from '../_lib/google-calendar.js'
import { gerarTituloReuniao } from '../_lib/reuniao-title.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ORIGIN = process.env.APP_ORIGIN ?? 'https://app.p-excellence.com.br'

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
    duracao_min, scheduled_at, sipoc_ids = [], participantes = [],
  } = req.body ?? {}

  // Validações
  if (!cliente_id || !tipo || !duracao_min || !scheduled_at)
    return res.status(400).json({ ok: false, error: 'Campos obrigatórios ausentes.' })

  if (!['sipoc', 'bpmn', 'validacao_bpmn', 'outra'].includes(tipo))
    return res.status(400).json({ ok: false, error: 'Tipo inválido.' })

  if (tipo === 'outra' && !tipo_customizado?.trim())
    return res.status(400).json({ ok: false, error: 'tipo_customizado obrigatório para tipo "outra".' })

  if (tipo !== 'outra' && tipo_customizado)
    return res.status(400).json({ ok: false, error: 'tipo_customizado só é válido para tipo "outra".' })

  if (![60, 120].includes(Number(duracao_min)))
    return res.status(400).json({ ok: false, error: 'duracao_min deve ser 60 ou 120.' })

  const scheduledDate = new Date(scheduled_at)
  if (isNaN(scheduledDate.getTime()) || scheduledDate < new Date(Date.now() + 5 * 60 * 1000))
    return res.status(400).json({ ok: false, error: 'scheduled_at deve ser pelo menos 5 minutos no futuro.' })

  for (const p of participantes) {
    if (p.email && !EMAIL_RE.test(p.email))
      return res.status(400).json({ ok: false, error: `Email inválido: ${p.email}` })
  }

  // Valida que cliente pertence ao consultor
  const { data: cliente, error: clienteErr } = await supabase
    .from('clientes')
    .select('id, nome')
    .eq('id', cliente_id)
    .eq('criado_por', user.id)
    .maybeSingle()

  if (clienteErr || !cliente)
    return res.status(403).json({ ok: false, error: 'Cliente não encontrado ou sem permissão.' })

  // Valida setor
  let setorNome = null
  if (setor_id) {
    const { data: setor, error: setorErr } = await supabase
      .from('setores')
      .select('id, nome')
      .eq('id', setor_id)
      .eq('cliente_id', cliente_id)
      .maybeSingle()

    if (setorErr || !setor)
      return res.status(403).json({ ok: false, error: 'Setor não encontrado ou não pertence ao cliente.' })

    setorNome = setor.nome
  }

  // Gera título e datas
  const titulo = gerarTituloReuniao({
    clienteNome: cliente.nome,
    tipo,
    tipoCustomizado: tipo_customizado,
    setorNome,
  })

  const endDate = new Date(scheduledDate.getTime() + Number(duracao_min) * 60 * 1000)

  const descricao = [
    'Reunião agendada via SIPOC Builder',
    sipoc_ids.length ? `Processos: ${sipoc_ids.join(', ')}` : null,
  ].filter(Boolean).join('\n')

  // Busca access token Google
  let accessToken
  try {
    ({ accessToken } = await getAccessTokenForConsultor(user.id))
  } catch (err) {
    if (err.message === 'CONSULTOR_GOOGLE_NAO_CONECTADO')
      return res.status(400).json({ ok: false, error: 'Conecte sua agenda Google primeiro.' })
    if (err.message === 'CONSULTOR_GOOGLE_REVOGADO')
      return res.status(400).json({ ok: false, error: 'Conexão Google expirada. Reconecte sua agenda.' })
    console.error('[criar-manual] Erro Google auth:', err.message)
    return res.status(500).json({ ok: false, error: 'Erro ao autenticar com o Google.' })
  }

  // Cria evento no Google Calendar
  let googleEventId, meetUrl
  try {
    const result = await createCalendarEventWithMeet({
      accessToken,
      summary: titulo,
      description: descricao,
      startISO: scheduledDate.toISOString(),
      endISO: endDate.toISOString(),
      attendeeEmails: participantes.map(p => p.email).filter(Boolean),
    })
    googleEventId = result.googleEventId
    meetUrl = result.meetUrl
  } catch (err) {
    console.error('[criar-manual] Erro ao criar evento Google:', err.message)
    return res.status(500).json({ ok: false, error: 'Erro ao criar evento no Google Calendar.' })
  }

  // INSERT em reunioes
  const { data: reuniao, error: insertErr } = await supabase
    .from('reunioes')
    .insert({
      cliente_id,
      setor_id: setor_id || null,
      consultor_id: user.id,
      tipo,
      tipo_customizado: tipo === 'outra' ? tipo_customizado.trim() : null,
      titulo,
      duracao_min: Number(duracao_min),
      scheduled_at: scheduledDate.toISOString(),
      google_event_id: googleEventId,
      google_calendar_id: 'primary',
      meet_url: meetUrl,
      participantes,
    })
    .select('id')
    .single()

  if (insertErr) {
    // Evento criado no Google mas falhou no banco — tenta reverter
    console.error('[criar-manual] CRITICAL: evento criado no Google mas INSERT falhou:', googleEventId, insertErr.message)
    try {
      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
      )
    } catch (delErr) {
      console.error('[criar-manual] CRITICAL: falha ao reverter evento Google:', googleEventId, delErr.message)
    }
    return res.status(500).json({ ok: false, error: 'Erro ao salvar reunião. Tente novamente.' })
  }

  // INSERT reuniao_sipocs
  if (sipoc_ids.length) {
    const vinculos = sipoc_ids.map(sid => ({ reuniao_id: reuniao.id, sipoc_id: sid }))
    const { error: sipocErr } = await supabase.from('reuniao_sipocs').insert(vinculos)
    if (sipocErr) {
      console.error('[criar-manual] Erro ao vincular sipocs:', sipocErr.message)
      // Não reverte — reunião já criada, só os vínculos falharam; logar é suficiente
    }
  }

  return res.status(201).json({
    ok: true,
    id: reuniao.id,
    titulo,
    scheduled_at: scheduledDate.toISOString(),
    meet_url: meetUrl,
    google_event_id: googleEventId,
  })
}
