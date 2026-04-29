/**
 * GET  /api/validar-bpmn/setor?vb=<t>  → carrega processos do setor para validação
 * POST /api/validar-bpmn/setor          → submete respostas (aprovado/contestado) por processo
 *   Body: { token, respostas: [{ sipoc_id, acao, comentario? }], comentarioGeral? }
 */

import { getAdminClient } from '../_lib/supabase-admin.js'

function toEmbedUrl(driveUrl) {
  if (!driveUrl) return null
  const m = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/)
  if (!m) return null
  return `https://drive.google.com/file/d/${m[1]}/preview`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const supabase = getAdminClient()

  // ── GET ───────────────────────────────────────────────────────────────

  if (req.method === 'GET') {
    const vb = req.query.vb
    if (!vb) return res.status(400).json({ ok: false, error: 'vb é obrigatório' })

    const { data: tokenData, error: tokenError } = await supabase
      .from('tokens_acesso')
      .select('id, setor_id, setor_nome, cliente_nome, expira_em, usado_em')
      .eq('token', vb)
      .eq('tipo', 'validacao_bpmn')
      .is('revogado_em', null)
      .gt('expira_em', new Date().toISOString())
      .maybeSingle()

    if (tokenError) return res.status(500).json({ ok: false, error: 'Erro ao validar token: ' + tokenError.message })
    if (!tokenData) return res.status(404).json({ ok: false, error: 'Token inválido ou expirado.' })

    const { data: setorData } = await supabase
      .from('setores').select('clientes ( id, nome )').eq('id', tokenData.setor_id).single()
    const { data: sipocs } = await supabase
      .from('sipocs')
      .select('id, nome_processo, bpmn_drive_url, bpmn_status')
      .eq('setor_id', tokenData.setor_id)
      .eq('bpmn_fase_atual', 'validacao')

    return res.status(200).json({
      ok: true, tokenId: tokenData.id,
      setorNome: tokenData.setor_nome, clienteNome: tokenData.cliente_nome,
      clienteId: setorData?.clientes?.id ?? null, jaRespondido: !!tokenData.usado_em,
      processos: (sipocs ?? []).map(s => ({
        id: s.id, nome: s.nome_processo,
        driveUrl: s.bpmn_drive_url ?? null,
        embedUrl: toEmbedUrl(s.bpmn_drive_url),
        status: s.bpmn_status,
      })),
    })
  }

  // ── POST ──────────────────────────────────────────────────────────────

  if (req.method === 'POST') {
    const { token, respostas, comentarioGeral } = req.body ?? {}
    if (!token) return res.status(400).json({ ok: false, error: 'token é obrigatório' })
    if (!Array.isArray(respostas) || !respostas.length)
      return res.status(400).json({ ok: false, error: 'respostas é obrigatório' })

    for (const r of respostas) {
      if (!r.sipoc_id) return res.status(400).json({ ok: false, error: 'sipoc_id é obrigatório em cada resposta' })
      if (r.acao !== 'aprovado' && r.acao !== 'contestado')
        return res.status(400).json({ ok: false, error: 'acao deve ser "aprovado" ou "contestado"' })
      if (r.acao === 'contestado' && !r.comentario?.trim())
        return res.status(400).json({ ok: false, error: 'comentario é obrigatório ao contestar' })
      if (r.comentario && r.comentario.length > 5000)
        return res.status(400).json({ ok: false, error: 'Comentário muito longo (máx 5000 caracteres).' })
    }

    const now = new Date().toISOString()
    const { data: tokenData, error: tokenError } = await supabase
      .from('tokens_acesso')
      .update({ usado_em: now })
      .eq('token', token).eq('tipo', 'validacao_bpmn')
      .is('revogado_em', null).is('usado_em', null).gt('expira_em', now)
      .select('id, setor_id, setor_nome, cliente_nome').maybeSingle()

    if (tokenError) return res.status(500).json({ ok: false, error: 'Erro ao validar token: ' + tokenError.message })
    if (!tokenData) return res.status(409).json({ ok: false, error: 'Token inválido, expirado ou já utilizado.' })

    const sipocIds = respostas.map(r => r.sipoc_id)
    const { data: sipocsDosetor, error: sipocCheckError } = await supabase
      .from('sipocs').select('id').eq('setor_id', tokenData.setor_id).in('id', sipocIds)
    if (sipocCheckError) return res.status(500).json({ ok: false, error: 'Erro ao validar processos.' })
    const idsValidos = new Set((sipocsDosetor ?? []).map(s => s.id))
    const idInvalido = sipocIds.find(id => !idsValidos.has(id))
    if (idInvalido) return res.status(403).json({ ok: false, error: 'Processo não pertence ao setor deste token.' })

    const { data: setorData } = await supabase
      .from('setores').select('clientes ( id, nome )').eq('id', tokenData.setor_id).single()
    const projectId = setorData?.clientes?.id

    for (const r of respostas) {
      const { error: insertErr } = await supabase.from('bpmn_validacao_cliente').insert({
        sipoc_id: r.sipoc_id, token_acesso_id: tokenData.id,
        acao: r.acao, comentario: r.comentario?.trim() ?? null,
      })
      if (insertErr) return res.status(500).json({ ok: false, error: `Erro ao registrar resposta: ${insertErr.message}` })

      if (r.acao === 'aprovado') {
        const { error: sipocErr } = await supabase.from('sipocs').update({
          bpmn_fase_atual: 'concluido', bpmn_status: 'validado', bpmn_validado_em: now,
          bpmn_validado_por: tokenData.setor_nome,
          bpmn_validacao_comentario: comentarioGeral?.trim() ?? null,
        }).eq('id', r.sipoc_id)
        if (sipocErr) return res.status(500).json({ ok: false, error: `Erro ao atualizar processo: ${sipocErr.message}` })

        const { data: faseAberta } = await supabase.from('bpmn_fase_historico')
          .select('id, eventos, duracao_segundos').eq('sipoc_id', r.sipoc_id).eq('fase', 'validacao')
          .in('status', ['em_andamento', 'pausado', 'planejado'])
          .order('criado_em', { ascending: false }).limit(1).maybeSingle()
        if (faseAberta) {
          const eventos = faseAberta.eventos ?? []; const last = eventos[eventos.length - 1]
          let delta = 0
          if (last && (last.tipo === 'start' || last.tipo === 'resume'))
            delta = Math.round((new Date(now) - new Date(last.em)) / 1000)
          await supabase.from('bpmn_fase_historico').update({
            status: 'concluido', encerrado_em: now,
            duracao_segundos: (faseAberta.duracao_segundos ?? 0) + delta,
            eventos: [...eventos, { tipo: 'finish', em: now }],
          }).eq('id', faseAberta.id)
        }
      }
    }

    if (projectId) {
      const aprovados   = respostas.filter(r => r.acao === 'aprovado').length
      const contestados = respostas.filter(r => r.acao === 'contestado').length
      await supabase.from('notifications').insert({
        project_id: projectId, type: 'bpmn_validacao_setor',
        title: `Validação recebida — ${tokenData.setor_nome}`,
        body: {
          setor: tokenData.setor_nome, aprovados, contestados,
          comentarioGeral: comentarioGeral?.trim() ?? null,
          respostas: respostas.map(r => ({ sipoc_id: r.sipoc_id, acao: r.acao, comentario: r.comentario?.trim() ?? null })),
        },
      }).catch(() => {})
    }

    return res.status(200).json({ ok: true, mensagem: 'Validação registrada com sucesso.' })
  }

  return res.status(405).json({ ok: false, error: 'Método não permitido' })
}
