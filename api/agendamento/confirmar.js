/**
 * POST /api/agendamento/confirmar
 * Cliente confirma os slots escolhidos → marca usado_em + slots_confirmados.
 * Público (sem JWT de consultor) — autenticado pelo token UUID.
 */

import { createClient } from '@supabase/supabase-js'

const ORIGIN = process.env.APP_ORIGIN ?? 'https://app.p-excellence.com.br'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método não permitido' })

  const { token, slots_escolhidos } = req.body ?? {}
  if (!token) return res.status(400).json({ ok: false, error: 'Token obrigatório.' })
  if (!Array.isArray(slots_escolhidos) || !slots_escolhidos.length)
    return res.status(400).json({ ok: false, error: 'slots_escolhidos obrigatório.' })

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: row, error: fetchErr } = await supabase
    .from('tokens_agendamento')
    .select('id, qtd_escolha, slots, expira_em, usado_em, revogado_em, clientes(nome), setores(nome)')
    .eq('token', token)
    .maybeSingle()

  if (fetchErr || !row) return res.status(404).json({ ok: false, error: 'Link de agendamento não encontrado.' })
  if (row.revogado_em)  return res.status(410).json({ ok: false, error: 'Este link foi cancelado pelo consultor.' })
  if (row.usado_em)     return res.status(410).json({ ok: false, error: 'Este link já foi utilizado.' })
  if (new Date(row.expira_em) < new Date())
    return res.status(410).json({ ok: false, error: 'Este link expirou.' })

  if (slots_escolhidos.length !== row.qtd_escolha)
    return res.status(400).json({ ok: false, error: `Selecione exatamente ${row.qtd_escolha} horário(s).` })

  // Valida que os slots escolhidos pertencem aos slots disponíveis
  const slotsDisponiveis = (row.slots ?? []).map(s => s.start)
  for (const s of slots_escolhidos) {
    if (!slotsDisponiveis.includes(s))
      return res.status(400).json({ ok: false, error: 'Slot inválido.' })
  }

  const { error: updateErr } = await supabase
    .from('tokens_agendamento')
    .update({
      usado_em: new Date().toISOString(),
      slots_confirmados: slots_escolhidos,
    })
    .eq('id', row.id)

  if (updateErr) {
    console.error('[confirmar] Erro ao marcar usado:', updateErr.message)
    return res.status(500).json({ ok: false, error: 'Erro ao confirmar agendamento.' })
  }

  return res.status(200).json({
    ok: true,
    cliente_nome: row.clientes?.nome ?? null,
    setor_nome: row.setores?.nome ?? null,
    slots_confirmados,
  })
}
