/**
 * Endpoint unificado de validação BPMN.
 *
 * GET  /api/validar-bpmn?token=<t>   → validação por processo (token_validacao_bpmn)
 * POST /api/validar-bpmn             → submete aprovação/rejeição por processo
 *   Body: { token, acao, comentario?, validado_por }
 *
 * GET  /api/validar-bpmn?vb=<t>     → validação por setor (tokens_acesso tipo=validacao_bpmn)
 * POST /api/validar-bpmn             → submete respostas do setor (detectado por presença de `respostas`)
 *   Body: { token, respostas: [...], comentarioGeral? }
 */

import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios')
  return createClient(url, key)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const supabase = getAdminClient()

  // ── GET ───────────────────────────────────────────────────────────────

  if (req.method === 'GET') {
    // Validação por SETOR (?vb=)
    if (req.query.vb) {
      const vb = req.query.vb
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

      const { data: setorData } = await supabase.from('setores').select('clientes ( id, nome )').eq('id', tokenData.setor_id).single()
      const { data: sipocs } = await supabase
        .from('sipocs')
        .select('id, nome_processo, bpmn_embed_url, bpmn_drive_url, bpmn_status')
        .eq('setor_id', tokenData.setor_id)
        .eq('bpmn_fase_atual', 'validacao')

      return res.status(200).json({
        ok: true, tokenId: tokenData.id,
        setorNome: tokenData.setor_nome, clienteNome: tokenData.cliente_nome,
        clienteId: setorData?.clientes?.id ?? null, jaRespondido: !!tokenData.usado_em,
        processos: (sipocs ?? []).map(s => ({
          id: s.id, nome: s.nome_processo,
          embedUrl: s.bpmn_embed_url ?? null, driveUrl: s.bpmn_drive_url ?? null, status: s.bpmn_status,
        })),
      })
    }

    // Validação por PROCESSO (?token=)
    const token = req.query.token
    if (!token) return res.status(400).json({ ok: false, error: 'token é obrigatório' })

    const { data, error } = await supabase
      .from('tokens_validacao_bpmn')
      .select('id, token, expira_em, sipocs ( id, nome_processo, bpmn_drive_url, bpmn_status, setores ( nome, clientes ( id, nome ) ) )')
      .eq('token', token)
      .is('revogado_em', null)
      .gt('expira_em', new Date().toISOString())
      .maybeSingle()

    if (error) return res.status(500).json({ ok: false, error: 'Erro ao validar token: ' + error.message })
    if (!data)  return res.status(404).json({ ok: false, error: 'Token inválido, expirado ou já utilizado.' })

    const sipoc = data.sipocs; const setor = sipoc.setores; const cliente = setor.clientes
    return res.status(200).json({
      ok: true,
      processo: {
        tokenId: data.id, expiraEm: data.expira_em, sipocId: sipoc.id,
        nomeProcesso: sipoc.nome_processo, bpmnDriveUrl: sipoc.bpmn_drive_url ?? null,
        bpmnStatus: sipoc.bpmn_status ?? null, setorNome: setor.nome,
        clienteNome: cliente.nome, clienteId: cliente.id,
      },
    })
  }

  // ── POST ──────────────────────────────────────────────────────────────

  if (req.method === 'POST') {
    const body = req.body ?? {}

    // Validação por SETOR (presença de `respostas`)
    if (Array.isArray(body.respostas)) {
      const { token, respostas, comentarioGeral } = body
      if (!token) return res.status(400).json({ ok: false, error: 'token é obrigatório' })
      if (!respostas.length) return res.status(400).json({ ok: false, error: 'respostas é obrigatório' })

      for (const r of respostas) {
        if (!r.sipoc_id) return res.status(400).json({ ok: false, error: 'sipoc_id é obrigatório em cada resposta' })
        if (r.acao !== 'aprovado' && r.acao !== 'contestado') return res.status(400).json({ ok: false, error: 'acao deve ser "aprovado" ou "contestado"' })
        if (r.acao === 'contestado' && !r.comentario?.trim()) return res.status(400).json({ ok: false, error: 'comentario é obrigatório ao contestar' })
        if (r.comentario && r.comentario.length > 5000) return res.status(400).json({ ok: false, error: 'Comentário muito longo (máx 5000 caracteres).' })
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
      const { data: sipocsDosetor, error: sipocCheckError } = await supabase.from('sipocs').select('id').eq('setor_id', tokenData.setor_id).in('id', sipocIds)
      if (sipocCheckError) return res.status(500).json({ ok: false, error: 'Erro ao validar processos.' })
      const idsValidos = new Set((sipocsDosetor ?? []).map(s => s.id))
      const idInvalido = sipocIds.find(id => !idsValidos.has(id))
      if (idInvalido) return res.status(403).json({ ok: false, error: 'Processo não pertence ao setor deste token.' })

      const { data: setorData } = await supabase.from('setores').select('clientes ( id, nome )').eq('id', tokenData.setor_id).single()
      const projectId = setorData?.clientes?.id

      for (const r of respostas) {
        const { error: insertErr } = await supabase.from('bpmn_validacao_cliente').insert({
          sipoc_id: r.sipoc_id, token_acesso_id: tokenData.id, acao: r.acao, comentario: r.comentario?.trim() ?? null,
        })
        if (insertErr) return res.status(500).json({ ok: false, error: `Erro ao registrar resposta: ${insertErr.message}` })

        if (r.acao === 'aprovado') {
          const { error: sipocErr } = await supabase.from('sipocs').update({
            bpmn_fase_atual: 'concluido', bpmn_status: 'validado', bpmn_validado_em: now,
            bpmn_validado_por: tokenData.setor_nome, bpmn_validacao_comentario: comentarioGeral?.trim() ?? null,
          }).eq('id', r.sipoc_id)
          if (sipocErr) return res.status(500).json({ ok: false, error: `Erro ao atualizar processo: ${sipocErr.message}` })

          const { data: faseAberta } = await supabase.from('bpmn_fase_historico')
            .select('id, eventos, duracao_segundos').eq('sipoc_id', r.sipoc_id).eq('fase', 'validacao')
            .in('status', ['em_andamento', 'pausado', 'planejado']).order('criado_em', { ascending: false }).limit(1).maybeSingle()
          if (faseAberta) {
            const eventos = faseAberta.eventos ?? []; const last = eventos[eventos.length - 1]
            let delta = 0
            if (last && (last.tipo === 'start' || last.tipo === 'resume')) delta = Math.round((new Date(now) - new Date(last.em)) / 1000)
            await supabase.from('bpmn_fase_historico').update({
              status: 'concluido', encerrado_em: now,
              duracao_segundos: (faseAberta.duracao_segundos ?? 0) + delta,
              eventos: [...eventos, { tipo: 'finish', em: now }],
            }).eq('id', faseAberta.id)
          }
        }
      }

      if (projectId) {
        const aprovados = respostas.filter(r => r.acao === 'aprovado').length
        const contestados = respostas.filter(r => r.acao === 'contestado').length
        await supabase.from('notifications').insert({
          project_id: projectId, type: 'bpmn_validacao_setor',
          title: `Validação recebida — ${tokenData.setor_nome}`,
          body: { setor: tokenData.setor_nome, aprovados, contestados, comentarioGeral: comentarioGeral?.trim() ?? null,
            respostas: respostas.map(r => ({ sipoc_id: r.sipoc_id, acao: r.acao, comentario: r.comentario?.trim() ?? null })) },
        }).catch(() => {})
      }

      return res.status(200).json({ ok: true, mensagem: 'Validação registrada com sucesso.' })
    }

    // Validação por PROCESSO
    const { token, acao, comentario, validado_por } = body
    if (!token)        return res.status(400).json({ ok: false, error: 'token é obrigatório' })
    if (!acao)         return res.status(400).json({ ok: false, error: 'acao é obrigatório' })
    if (!validado_por?.trim()) return res.status(400).json({ ok: false, error: 'validado_por é obrigatório' })
    if (acao !== 'aprovar' && acao !== 'rejeitar') return res.status(400).json({ ok: false, error: 'acao deve ser "aprovar" ou "rejeitar"' })

    const now = new Date().toISOString()
    const { data: tokenRevogado, error: revokeError } = await supabase
      .from('tokens_validacao_bpmn').update({ revogado_em: now })
      .eq('token', token).is('revogado_em', null).gt('expira_em', now)
      .select('id, sipoc_id').maybeSingle()

    if (revokeError) return res.status(500).json({ ok: false, error: 'Erro ao validar token: ' + revokeError.message })
    if (!tokenRevogado) return res.status(404).json({ ok: false, error: 'Token inválido, expirado ou já utilizado.' })

    const { data: sipocAtualizado, error: sipocError } = await supabase.from('sipocs').update({
      bpmn_status: acao === 'aprovar' ? 'validado' : 'rejeitado',
      bpmn_fase_atual: acao === 'aprovar' ? 'concluido' : 'retrabalho',
      bpmn_validado_por: validado_por.trim(), bpmn_validacao_comentario: comentario?.trim() ?? null, bpmn_validado_em: now,
    }).eq('id', tokenRevogado.sipoc_id).select('nome_processo, setores ( nome, clientes ( id, nome ) )').single()

    if (sipocError) return res.status(500).json({ ok: false, error: 'Erro ao atualizar processo: ' + sipocError.message })

    const { data: faseAberta } = await supabase.from('bpmn_fase_historico')
      .select('id, eventos, duracao_segundos').eq('sipoc_id', tokenRevogado.sipoc_id).eq('fase', 'validacao')
      .in('status', ['em_andamento', 'pausado']).maybeSingle()
    if (faseAberta) {
      const eventos = faseAberta.eventos ?? []; const last = eventos[eventos.length - 1]
      let delta = 0
      if (last && (last.tipo === 'start' || last.tipo === 'resume')) delta = Math.round((new Date(now) - new Date(last.em)) / 1000)
      await supabase.from('bpmn_fase_historico').update({
        status: 'concluido', encerrado_em: now,
        duracao_segundos: (faseAberta.duracao_segundos ?? 0) + delta,
        eventos: [...eventos, { tipo: 'finish', em: now }],
      }).eq('id', faseAberta.id)
    }

    const projectId = sipocAtualizado.setores?.clientes?.id
    if (projectId) {
      await supabase.from('notifications').insert({
        project_id: projectId, type: 'bpmn_validado',
        title: acao === 'aprovar' ? `Diagrama aprovado pelo setor — ${sipocAtualizado.nome_processo}` : `Diagrama rejeitado pelo setor — ${sipocAtualizado.nome_processo}`,
        body: { processo: sipocAtualizado.nome_processo, acao, validado_por: validado_por.trim(), comentario: comentario?.trim() ?? null, setor: sipocAtualizado.setores?.nome },
      })
    }

    return res.status(200).json({ ok: true, mensagem: acao === 'aprovar' ? 'Diagrama aprovado com sucesso.' : 'Rejeição registrada com sucesso.' })
  }

  return res.status(405).json({ ok: false, error: 'Método não permitido' })
}
