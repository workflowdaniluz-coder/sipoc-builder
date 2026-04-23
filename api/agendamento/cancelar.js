/**
 * DELETE /api/agendamento/cancelar?token={uuid}
 * Consultor cancela oferta → deleta holds no Google → marca revogado_em.
 */

import { createClient } from '@supabase/supabase-js'
import { getAccessTokenForConsultor } from '../_lib/google-auth.js'
import { deleteHoldEvent } from '../_lib/google-calendar.js'

const ORIGIN = process.env.APP_ORIGIN ?? 'https://app.p-excellence.com.br'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'DELETE') return res.status(405).json({ ok: false, error: 'Método não permitido' })

  const jwt = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/, '').trim()
  if (!jwt) return res.status(401).json({ ok: false, error: 'Não autorizado.' })

  const token = req.query.token
  if (!token) return res.status(400).json({ ok: false, error: 'Token obrigatório.' })

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
  if (authErr || !user) return res.status(401).json({ ok: false, error: 'Token inválido.' })

  // Busca token e verifica ownership via RLS (criado_por no cliente)
  const { data: row, error: fetchErr } = await supabase
    .from('tokens_agendamento')
    .select('id, consultor_id, slots, usado_em, revogado_em')
    .eq('token', token)
    .eq('consultor_id', user.id)
    .maybeSingle()

  if (fetchErr || !row) return res.status(404).json({ ok: false, error: 'Oferta não encontrada.' })
  if (row.revogado_em) return res.status(400).json({ ok: false, error: 'Oferta já cancelada.' })
  if (row.usado_em) return res.status(400).json({ ok: false, error: 'Cliente já agendou, não é possível cancelar.' })

  // Deleta holds no Google (best-effort)
  try {
    const { accessToken } = await getAccessTokenForConsultor(user.id)
    const slots = row.slots ?? []
    for (const s of slots) {
      if (s.google_hold_event_id)
        await deleteHoldEvent({ accessToken, googleEventId: s.google_hold_event_id })
    }
  } catch (err) {
    console.warn('[cancelar] Não foi possível deletar holds no Google:', err.message)
  }

  const { error: updateErr } = await supabase
    .from('tokens_agendamento')
    .update({ revogado_em: new Date().toISOString() })
    .eq('id', row.id)

  if (updateErr) return res.status(500).json({ ok: false, error: 'Erro ao cancelar oferta.' })

  return res.status(200).json({ ok: true })
}
