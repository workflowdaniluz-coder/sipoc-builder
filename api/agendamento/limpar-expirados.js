/**
 * GET /api/agendamento/limpar-expirados
 * Cron diário: expira tokens vencidos, deleta holds no Google, notifica consultor.
 * Protegido por Authorization: Bearer {NOTIFICATIONS_API_KEY}
 */

import { getAdminClient } from '../_lib/supabase-admin.js'
import { getAccessTokenForConsultor } from '../_lib/google-auth.js'
import { deleteHoldEvent } from '../_lib/google-calendar.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const key = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/, '').trim()
  if (!key || key !== process.env.NOTIFICATIONS_API_KEY)
    return res.status(401).json({ ok: false, error: 'Não autorizado.' })

  const supabase = getAdminClient()

  const { data: expirados, error } = await supabase
    .from('tokens_agendamento')
    .select(`
      id, token, consultor_id, slots,
      clientes ( nome ),
      setores ( nome )
    `)
    .lt('expira_em', new Date().toISOString())
    .is('revogado_em', null)
    .is('usado_em', null)

  if (error) {
    console.error('[limpar-expirados] Erro ao buscar expirados:', error.message)
    return res.status(500).json({ ok: false, error: error.message })
  }

  let processados = 0

  for (const row of expirados ?? []) {
    // Deleta holds no Google (best-effort por consultor)
    try {
      const { accessToken } = await getAccessTokenForConsultor(row.consultor_id)
      for (const s of row.slots ?? []) {
        if (s.google_hold_event_id)
          await deleteHoldEvent({ accessToken, googleEventId: s.google_hold_event_id })
      }
    } catch (err) {
      console.warn('[limpar-expirados] Não foi possível deletar holds para token', row.id, err.message)
    }

    // Marca revogado
    await supabase
      .from('tokens_agendamento')
      .update({ revogado_em: new Date().toISOString() })
      .eq('id', row.id)

    // Notifica consultor
    const clienteNome = row.clientes?.nome ?? 'Cliente'
    const setorNome   = row.setores?.nome ?? null
    await supabase.from('notifications').insert({
      consultor_id: row.consultor_id,
      type:  'slots_expirados',
      title: 'Link de agendamento expirou',
      body:  { cliente_nome: clienteNome, setor_nome: setorNome, token_id: row.id },
      status: 'unread',
    }).catch(err => console.warn('[limpar-expirados] Erro ao inserir notificação:', err.message))

    processados++
  }

  return res.status(200).json({ ok: true, processados })
}
