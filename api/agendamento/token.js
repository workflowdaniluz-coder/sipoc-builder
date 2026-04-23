/**
 * POST   /api/agendamento/token  → cliente confirma slots escolhidos (sem auth)
 * DELETE /api/agendamento/token?token=uuid → consultor cancela oferta (JWT auth)
 */

import { createClient } from '@supabase/supabase-js'
import { getAccessTokenForConsultor } from '../_lib/google-auth.js'
import { deleteHoldEvent, confirmHoldEvent } from '../_lib/google-calendar.js'

const TIPO_LABELS = {
  sipoc: 'Mapeamento SIPOC',
  bpmn: 'Mapeamento BPMN',
  validacao_bpmn: 'Validação BPMN',
}

const ORIGIN = process.env.APP_ORIGIN ?? 'https://app.p-excellence.com.br'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.method === 'POST') return handleConfirmar(req, res)
  if (req.method === 'DELETE') return handleCancelar(req, res)
  return res.status(405).json({ ok: false, error: 'Método não permitido' })
}

async function handleConfirmar(req, res) {
  const { token, slots_escolhidos } = req.body ?? {}
  if (!token) return res.status(400).json({ ok: false, error: 'Token obrigatório.' })
  if (!Array.isArray(slots_escolhidos) || !slots_escolhidos.length)
    return res.status(400).json({ ok: false, error: 'slots_escolhidos obrigatório.' })

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: row, error: fetchErr } = await supabase
    .from('tokens_agendamento')
    .select('id, cliente_id, consultor_id, tipo, tipo_customizado, qtd_escolha, slots, expira_em, usado_em, revogado_em, clientes(nome), setores(nome)')
    .eq('token', token)
    .maybeSingle()

  if (fetchErr || !row) return res.status(404).json({ ok: false, error: 'Link de agendamento não encontrado.' })
  if (row.revogado_em)  return res.status(410).json({ ok: false, error: 'Este link foi cancelado pelo consultor.' })
  if (row.usado_em)     return res.status(410).json({ ok: false, error: 'Este link já foi utilizado.' })
  if (new Date(row.expira_em) < new Date())
    return res.status(410).json({ ok: false, error: 'Este link expirou.' })

  if (slots_escolhidos.length !== row.qtd_escolha)
    return res.status(400).json({ ok: false, error: `Selecione exatamente ${row.qtd_escolha} horário(s).` })

  const slotsDisponiveis = (row.slots ?? []).map(s => s.start)
  for (const s of slots_escolhidos) {
    if (!slotsDisponiveis.includes(s))
      return res.status(400).json({ ok: false, error: 'Slot inválido.' })
  }

  const { error: updateErr } = await supabase
    .from('tokens_agendamento')
    .update({ usado_em: new Date().toISOString(), slots_confirmados: slots_escolhidos })
    .eq('id', row.id)

  if (updateErr) {
    console.error('[token/confirmar] Erro ao marcar usado:', updateErr.message)
    return res.status(500).json({ ok: false, error: 'Erro ao confirmar agendamento.' })
  }

  // Atualiza Google Calendar e cria notificação — best-effort, não bloqueia resposta
  Promise.resolve().then(async () => {
    try {
      const { accessToken } = await getAccessTokenForConsultor(row.consultor_id)
      const tipoLabel = row.tipo === 'outra' ? row.tipo_customizado : (TIPO_LABELS[row.tipo] ?? row.tipo)
      const clienteNome = row.clientes?.nome ?? 'Cliente'
      const slotsArr = row.slots ?? []

      for (const s of slotsArr) {
        if (!s.google_hold_event_id) continue
        if (slots_escolhidos.includes(s.start))
          await confirmHoldEvent({ accessToken, googleEventId: s.google_hold_event_id, clienteNome, tipo: tipoLabel })
        else
          await deleteHoldEvent({ accessToken, googleEventId: s.google_hold_event_id })
      }
    } catch (err) {
      console.warn('[token/confirmar] Google Calendar update falhou:', err.message)
    }

    try {
      const fmtSlots = slots_escolhidos.map(s =>
        new Date(s).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
      ).join(', ')
      await supabase.from('notifications').insert({
        project_id: row.cliente_id,
        type: 'agendamento_confirmado',
        title: `${row.clientes?.nome ?? 'Cliente'} confirmou o agendamento`,
        body: {
          setor: row.setores?.nome ?? null,
          tipo: row.tipo === 'outra' ? row.tipo_customizado : (TIPO_LABELS[row.tipo] ?? row.tipo),
          slots_confirmados: slots_escolhidos,
          slots_fmt: fmtSlots,
        },
      })
    } catch (err) {
      console.warn('[token/confirmar] Notificação falhou:', err.message)
    }
  })

  return res.status(200).json({
    ok: true,
    cliente_nome: row.clientes?.nome ?? null,
    setor_nome: row.setores?.nome ?? null,
    slots_confirmados: slots_escolhidos,
  })
}

async function handleCancelar(req, res) {
  const jwt = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/, '').trim()
  if (!jwt) return res.status(401).json({ ok: false, error: 'Não autorizado.' })

  const token = req.query.token
  if (!token) return res.status(400).json({ ok: false, error: 'Token obrigatório.' })

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
  if (authErr || !user) return res.status(401).json({ ok: false, error: 'Token inválido.' })

  const { data: row, error: fetchErr } = await supabase
    .from('tokens_agendamento')
    .select('id, consultor_id, slots, usado_em, revogado_em')
    .eq('token', token)
    .eq('consultor_id', user.id)
    .maybeSingle()

  if (fetchErr || !row) return res.status(404).json({ ok: false, error: 'Oferta não encontrada.' })
  if (row.revogado_em) return res.status(400).json({ ok: false, error: 'Oferta já cancelada.' })
  if (row.usado_em) return res.status(400).json({ ok: false, error: 'Cliente já agendou, não é possível cancelar.' })

  try {
    const { accessToken } = await getAccessTokenForConsultor(user.id)
    for (const s of (row.slots ?? [])) {
      if (s.google_hold_event_id)
        await deleteHoldEvent({ accessToken, googleEventId: s.google_hold_event_id })
    }
  } catch (err) {
    console.warn('[token/cancelar] Não foi possível deletar holds no Google:', err.message)
  }

  const { error: updateErr } = await supabase
    .from('tokens_agendamento')
    .update({ revogado_em: new Date().toISOString() })
    .eq('id', row.id)

  if (updateErr) return res.status(500).json({ ok: false, error: 'Erro ao cancelar oferta.' })

  return res.status(200).json({ ok: true })
}
