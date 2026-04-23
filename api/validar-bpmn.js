/**
 * GET  /api/validar-bpmn?token=<token>
 *   Valida o token e retorna os dados do processo para o portal de validação.
 *   Sem autenticação — token é a credencial.
 *
 * POST /api/validar-bpmn
 *   Submete a resposta (aprovar/rejeitar) do responsável do setor.
 *   Payload: { token, acao: 'aprovar'|'rejeitar', comentario?, validado_por }
 *   Token é revogado atomicamente antes do processamento para evitar race condition.
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

  // ── GET: validar token e retornar dados do processo ──────────────────────
  if (req.method === 'GET') {
    const token = req.query.token
    if (!token) return res.status(400).json({ ok: false, error: 'token é obrigatório' })

    const { data, error } = await supabase
      .from('tokens_validacao_bpmn')
      .select(`
        id, token, expira_em,
        sipocs (
          id, nome_processo, bpmn_drive_url, bpmn_status,
          setores ( nome, clientes ( id, nome ) )
        )
      `)
      .eq('token', token)
      .is('revogado_em', null)
      .gt('expira_em', new Date().toISOString())
      .maybeSingle()

    if (error) return res.status(500).json({ ok: false, error: 'Erro ao validar token: ' + error.message })
    if (!data) return res.status(404).json({ ok: false, error: 'Token inválido, expirado ou já utilizado.' })

    const sipoc = data.sipocs
    const setor = sipoc.setores
    const cliente = setor.clientes

    return res.status(200).json({
      ok: true,
      processo: {
        tokenId:      data.id,
        expiraEm:     data.expira_em,
        sipocId:      sipoc.id,
        nomeProcesso: sipoc.nome_processo,
        bpmnDriveUrl: sipoc.bpmn_drive_url ?? null,
        bpmnStatus:   sipoc.bpmn_status ?? null,
        setorNome:    setor.nome,
        clienteNome:  cliente.nome,
        clienteId:    cliente.id,
      },
    })
  }

  // ── POST: submeter resposta ──────────────────────────────────────────────
  if (req.method === 'POST') {
    const { token, acao, comentario, validado_por } = req.body ?? {}

    if (!token)       return res.status(400).json({ ok: false, error: 'token é obrigatório' })
    if (!acao)        return res.status(400).json({ ok: false, error: 'acao é obrigatório' })
    if (!validado_por || !validado_por.trim())
                      return res.status(400).json({ ok: false, error: 'validado_por é obrigatório' })
    if (acao !== 'aprovar' && acao !== 'rejeitar')
                      return res.status(400).json({ ok: false, error: 'acao deve ser "aprovar" ou "rejeitar"' })

    const now = new Date().toISOString()

    // 1. Revogar token atomicamente antes de processar — evita race condition de duplo envio
    const { data: tokenRevogado, error: revokeError } = await supabase
      .from('tokens_validacao_bpmn')
      .update({ revogado_em: now })
      .eq('token', token)
      .is('revogado_em', null)
      .gt('expira_em', now)
      .select('id, sipoc_id')
      .maybeSingle()

    if (revokeError) return res.status(500).json({ ok: false, error: 'Erro ao validar token: ' + revokeError.message })
    if (!tokenRevogado) return res.status(404).json({ ok: false, error: 'Token inválido, expirado ou já utilizado.' })

    const novoBpmnStatus = acao === 'aprovar' ? 'validado'   : 'rejeitado'
    const novaBpmnFase   = acao === 'aprovar' ? 'concluido'  : 'retrabalho'

    // 2. Atualizar sipoc
    const { data: sipocAtualizado, error: sipocError } = await supabase
      .from('sipocs')
      .update({
        bpmn_status:               novoBpmnStatus,
        bpmn_fase_atual:           novaBpmnFase,
        bpmn_validado_por:         validado_por.trim(),
        bpmn_validacao_comentario: comentario?.trim() ?? null,
        bpmn_validado_em:          now,
      })
      .eq('id', tokenRevogado.sipoc_id)
      .select('nome_processo, setores ( nome, clientes ( id, nome ) )')
      .single()

    if (sipocError) return res.status(500).json({ ok: false, error: 'Erro ao atualizar processo: ' + sipocError.message })

    // 3. Fechar linha ativa de bpmn_fase_historico para a fase 'validacao' (se houver)
    const { data: faseAberta } = await supabase
      .from('bpmn_fase_historico')
      .select('id, eventos, duracao_segundos')
      .eq('sipoc_id', tokenRevogado.sipoc_id)
      .eq('fase', 'validacao')
      .in('status', ['em_andamento', 'pausado'])
      .maybeSingle()

    if (faseAberta) {
      const eventos = faseAberta.eventos ?? []
      const last    = eventos[eventos.length - 1]
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

    // 4. Criar notificação
    const projectId = sipocAtualizado.setores?.clientes?.id
    if (projectId) {
      await supabase.from('notifications').insert({
        project_id: projectId,
        type:       'bpmn_validado',
        title:      acao === 'aprovar'
          ? `Diagrama aprovado pelo setor — ${sipocAtualizado.nome_processo}`
          : `Diagrama rejeitado pelo setor — ${sipocAtualizado.nome_processo}`,
        body: {
          processo:    sipocAtualizado.nome_processo,
          acao,
          validado_por: validado_por.trim(),
          comentario:   comentario?.trim() ?? null,
          setor:        sipocAtualizado.setores?.nome,
        },
      })
    }

    return res.status(200).json({
      ok: true,
      mensagem: acao === 'aprovar'
        ? 'Diagrama aprovado com sucesso.'
        : 'Rejeição registrada com sucesso.',
    })
  }

  return res.status(405).json({ ok: false, error: 'Método não permitido' })
}
