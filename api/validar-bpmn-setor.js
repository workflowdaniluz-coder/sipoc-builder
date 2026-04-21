/**
 * GET  /api/validar-bpmn-setor?vb=<token>
 *   Valida token e retorna dados do setor + processos em validação.
 *
 * POST /api/validar-bpmn-setor
 *   Payload: { token, respostas: [{ sipoc_id, acao, comentario? }], comentarioGeral? }
 *   Salva respostas, avança aprovados para concluido, marca token como usado.
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

  // ── GET: validar token e retornar dados ──────────────────────────────────────
  if (req.method === 'GET') {
    const vb = req.query.vb
    if (!vb) return res.status(400).json({ ok: false, error: 'token é obrigatório' })

    const { data: tokenData, error: tokenError } = await supabase
      .from('tokens_acesso')
      .select('id, token, setor_id, setor_nome, cliente_nome, expira_em, usado_em')
      .eq('token', vb)
      .eq('tipo', 'validacao_bpmn')
      .is('revogado_em', null)
      .gt('expira_em', new Date().toISOString())
      .maybeSingle()

    if (tokenError) return res.status(500).json({ ok: false, error: 'Erro ao validar token: ' + tokenError.message })
    if (!tokenData) return res.status(404).json({ ok: false, error: 'Token inválido ou expirado.' })

    const { data: setorData } = await supabase
      .from('setores')
      .select('clientes ( id, nome )')
      .eq('id', tokenData.setor_id)
      .single()

    const { data: sipocs } = await supabase
      .from('sipocs')
      .select('id, nome_processo, bpmn_embed_url, bpmn_drive_url, bpmn_status')
      .eq('setor_id', tokenData.setor_id)
      .eq('bpmn_fase_atual', 'validacao')

    return res.status(200).json({
      ok:          true,
      tokenId:     tokenData.id,
      token:       tokenData.token,
      setorNome:   tokenData.setor_nome,
      clienteNome: tokenData.cliente_nome,
      clienteId:   setorData?.clientes?.id ?? null,
      jaRespondido: !!tokenData.usado_em,
      processos:   (sipocs ?? []).map(s => ({
        id:       s.id,
        nome:     s.nome_processo,
        embedUrl: s.bpmn_embed_url ?? null,
        driveUrl: s.bpmn_drive_url ?? null,
        status:   s.bpmn_status,
      })),
    })
  }

  // ── POST: submeter respostas ─────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { token, respostas, comentarioGeral } = req.body ?? {}

    if (!token) return res.status(400).json({ ok: false, error: 'token é obrigatório' })
    if (!Array.isArray(respostas) || respostas.length === 0)
      return res.status(400).json({ ok: false, error: 'respostas é obrigatório' })

    for (const r of respostas) {
      if (!r.sipoc_id)
        return res.status(400).json({ ok: false, error: 'sipoc_id é obrigatório em cada resposta' })
      if (r.acao !== 'aprovado' && r.acao !== 'contestado')
        return res.status(400).json({ ok: false, error: 'acao deve ser "aprovado" ou "contestado"' })
      if (r.acao === 'contestado' && !r.comentario?.trim())
        return res.status(400).json({ ok: false, error: 'comentario é obrigatório ao contestar' })
    }

    // Validar token
    const { data: tokenData, error: tokenError } = await supabase
      .from('tokens_acesso')
      .select('id, setor_id, setor_nome, cliente_nome, usado_em')
      .eq('token', token)
      .eq('tipo', 'validacao_bpmn')
      .is('revogado_em', null)
      .gt('expira_em', new Date().toISOString())
      .maybeSingle()

    if (tokenError) return res.status(500).json({ ok: false, error: 'Erro ao validar token: ' + tokenError.message })
    if (!tokenData) return res.status(404).json({ ok: false, error: 'Token inválido ou expirado.' })
    if (tokenData.usado_em) return res.status(409).json({ ok: false, error: 'Este link já foi utilizado.' })

    const now = new Date().toISOString()

    const { data: setorData } = await supabase
      .from('setores')
      .select('clientes ( id, nome )')
      .eq('id', tokenData.setor_id)
      .single()

    const projectId = setorData?.clientes?.id

    // Processar cada resposta
    for (const r of respostas) {
      await supabase.from('bpmn_validacao_cliente').insert({
        sipoc_id:        r.sipoc_id,
        token_acesso_id: tokenData.id,
        acao:            r.acao,
        comentario:      r.comentario?.trim() ?? null,
      })

      if (r.acao === 'aprovado') {
        await supabase
          .from('sipocs')
          .update({
            bpmn_fase_atual:           'concluido',
            bpmn_status:               'validado',
            bpmn_validado_em:          now,
            bpmn_validado_por:         tokenData.setor_nome,
            bpmn_validacao_comentario: comentarioGeral?.trim() ?? null,
          })
          .eq('id', r.sipoc_id)

        // Fechar fase validacao ativa
        const { data: faseAberta } = await supabase
          .from('bpmn_fase_historico')
          .select('id, eventos, duracao_segundos')
          .eq('sipoc_id', r.sipoc_id)
          .eq('fase', 'validacao')
          .in('status', ['em_andamento', 'pausado', 'planejado'])
          .order('criado_em', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (faseAberta) {
          const eventos = faseAberta.eventos ?? []
          const last = eventos[eventos.length - 1]
          let delta = 0
          if (last && (last.tipo === 'start' || last.tipo === 'resume')) {
            delta = Math.round((new Date(now) - new Date(last.em)) / 1000)
          }
          await supabase
            .from('bpmn_fase_historico')
            .update({
              status:           'concluido',
              encerrado_em:     now,
              duracao_segundos: (faseAberta.duracao_segundos ?? 0) + delta,
              eventos:          [...eventos, { tipo: 'finish', em: now }],
            })
            .eq('id', faseAberta.id)
        }
      }
      // contestado: aguarda decisão do consultor
    }

    // Marcar token como usado
    await supabase
      .from('tokens_acesso')
      .update({ usado_em: now })
      .eq('id', tokenData.id)

    // Criar notificação
    if (projectId) {
      const aprovados   = respostas.filter(r => r.acao === 'aprovado').length
      const contestados = respostas.filter(r => r.acao === 'contestado').length
      await supabase.from('notifications').insert({
        project_id: projectId,
        type:       'bpmn_validacao_setor',
        title:      `Validação recebida — ${tokenData.setor_nome}`,
        body: {
          setor:           tokenData.setor_nome,
          aprovados,
          contestados,
          comentarioGeral: comentarioGeral?.trim() ?? null,
          respostas:       respostas.map(r => ({
            sipoc_id:   r.sipoc_id,
            acao:       r.acao,
            comentario: r.comentario?.trim() ?? null,
          })),
        },
      }).catch(() => {})
    }

    return res.status(200).json({ ok: true, mensagem: 'Validação registrada com sucesso.' })
  }

  return res.status(405).json({ ok: false, error: 'Método não permitido' })
}
