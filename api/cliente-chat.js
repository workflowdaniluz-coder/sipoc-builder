/**
 * GET  /api/cliente-chat?token=<t>
 *   Valida token, carrega processos do setor e sessão de chat existente.
 *
 * POST /api/cliente-chat
 *   Body: { token, mensagem }
 *   Recebe mensagem do cliente, chama Gemini, salva dados coletados incrementalmente.
 */

import { getAdminClient } from './_lib/supabase-admin.js'
import { logEvent, logError } from './_lib/logger.js'

const ORIGIN = process.env.APP_ORIGIN ?? 'https://app.p-excellence.com.br'
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash']

// ── Token validation ──────────────────────────────────────────────

async function validarToken(supabase, token) {
  const { data, error } = await supabase
    .from('tokens_acesso')
    .select('id, setor_id, setor_nome, cliente_nome, expira_em, usado_em, revogado_em')
    .eq('token', token)
    .maybeSingle()

  if (error) throw new Error('Erro ao validar token: ' + error.message)
  if (!data) return { valido: false, motivo: 'Token inválido.' }
  if (data.revogado_em) return { valido: false, motivo: 'Este link foi revogado.' }
  if (new Date(data.expira_em) < new Date()) return { valido: false, motivo: 'Este link expirou.' }
  return { valido: true, tokenData: data }
}

// ── Build Gemini system prompt ────────────────────────────────────

function buildSystemPrompt(clienteNome, setorNome, processos) {
  const listaProcessos = processos.map((p, i) => {
    const inputs = (p.inputs || []).filter(s => s.trim())
    const outputs = (p.outputs || []).filter(s => s.trim())
    return `
Processo ${i + 1}: "${p.name}" (id: ${p.id})
  Entradas definidas: ${inputs.length ? inputs.join(', ') : 'nenhuma'}
  Saídas definidas: ${outputs.length ? outputs.join(', ') : 'nenhuma'}`
  }).join('\n')

  return `Você é um assistente da P-Excellence conduzindo um levantamento de processos com um colaborador do cliente.

EMPRESA: ${clienteNome}
SETOR: ${setorNome}

PROCESSOS A MAPEAR:
${listaProcessos}

OBJETIVO: Coletar, por conversa natural em português, as seguintes informações por processo:
- Por cada ENTRADA: se é padronizada (sim / parcial / não), quais ferramentas/sistemas a geram, observações
- Por cada SAÍDA: se é padronizada (sim / parcial / não), quais ferramentas/sistemas a consomem, observações
- PROCESSO GERAL: periodicidade (Diária/Semanal/Quinzenal/Mensal/Trimestral/Semestral/Anual/Sob demanda), volume e esforço (1=muito baixo a 5=muito alto), observações gerais (gargalos, dores), responsabilidades (quem executa, quem aprova, quem é informado)

INSTRUÇÕES DE CONDUTA:
1. Comece pedindo nome completo e cargo do colaborador
2. Após identificação, apresente os processos de forma resumida e amigável
3. Mapeie um processo por vez, na ordem da lista
4. Conduza a conversa naturalmente — não liste campos como formulário
5. Quando o colaborador responder sobre uma dimensão, extraia o dado e avance
6. Para "padronizado": se disser que tem procedimento/manual/fluxo → "sim"; se parcialmente → "parcial"; se não tiver → "não"
7. Ao concluir cada processo, confirme brevemente antes de passar ao próximo
8. Ao concluir todos, agradeça e diga que as informações foram registradas

FORMATO DE RESPOSTA — obrigatório, sempre dois blocos separados por ---JSON_STATE---:

[mensagem conversacional para o colaborador]

---JSON_STATE---
{
  "nome_cliente": "string ou null",
  "processo_atual_index": 0,
  "concluido": false,
  "dados_coletados": {
    "SIPOC_ID": {
      "inputs": {
        "NOME_INPUT": { "padronizado": "", "ferramentas": [], "observacoes": "" }
      },
      "outputs": {
        "NOME_OUTPUT": { "padronizado": "", "ferramentas": [], "observacoes": "" }
      },
      "processo": {
        "periodicidade": "",
        "volume_esforco": "",
        "observacoes_gerais": "",
        "rasci": { "Responsável": [], "Aprovador": [], "Suporte": [], "Consultado": [], "Informado": [] }
      }
    }
  }
}
---END_JSON---

IMPORTANTE: O JSON deve sempre refletir o estado ACUMULADO de toda a conversa até agora — não apenas a última resposta. Quando "concluido" for true, todos os processos foram mapeados.`
}

// ── Call Gemini ───────────────────────────────────────────────────

async function callGeminiModel(model, systemPrompt, historico) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`

  const contents = historico.map(m => ({
    role: m.role === 'agent' ? 'model' : 'user',
    parts: [{ text: m.texto }],
  }))

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    const err = new Error(`Gemini erro ${resp.status}`)
    err.status = resp.status
    err.body = errText
    throw err
  }

  const json = await resp.json()
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Resposta vazia do Gemini.')
  return text
}

async function callGemini(systemPrompt, historico) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada.')

  for (const model of GEMINI_MODELS) {
    let lastErr
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await callGeminiModel(model, systemPrompt, historico)
      } catch (err) {
        lastErr = err
        if (err.status !== 503 && err.status !== 429) throw err
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
    // 503/429 exhausted for this model — try next
    logError('cliente_chat.gemini_fallback', lastErr, { model })
  }

  throw new Error('O assistente está temporariamente indisponível. Tente novamente em alguns instantes.')
}

// ── Parse Gemini response ─────────────────────────────────────────

function parseResposta(raw) {
  const [mensagem, rest] = raw.split('---JSON_STATE---')
  if (!rest) return { mensagem: raw.trim(), estado: null }

  const jsonStr = rest.split('---END_JSON---')[0].trim()
  try {
    const estado = JSON.parse(jsonStr)
    return { mensagem: mensagem.trim(), estado }
  } catch {
    return { mensagem: mensagem.trim(), estado: null }
  }
}

// ── Save process data when complete ──────────────────────────────

function processoCompleto(dadosProcesso) {
  if (!dadosProcesso) return false
  const { processo } = dadosProcesso
  return !!(processo?.periodicidade && processo?.volume_esforco)
}

async function salvarProcesso(supabase, tokenId, sipocId, dados) {
  const { error } = await supabase
    .from('sipocs')
    .update({ respostas_cliente: dados })
    .eq('id', sipocId)

  if (error) throw new Error('Erro ao salvar processo: ' + error.message)

  // Mark token as used on first save
  await supabase
    .from('tokens_acesso')
    .update({ usado_em: new Date().toISOString() })
    .eq('id', tokenId)
    .is('usado_em', null)
}

async function finalizarProcesso(supabase, tokenId, sipocId, dados) {
  await salvarProcesso(supabase, tokenId, sipocId, dados)
  await supabase
    .from('sipocs')
    .update({ status: 'em_revisao' })
    .eq('id', sipocId)
}

// ── Handler ───────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const supabase = getAdminClient()

  // ── GET ──────────────────────────────────────────────────────────

  if (req.method === 'GET') {
    const token = req.query.token
    if (!token) return res.status(400).json({ ok: false, error: 'token é obrigatório' })

    const { valido, motivo, tokenData } = await validarToken(supabase, token)
    if (!valido) return res.status(403).json({ ok: false, error: motivo })

    const { data: sipocs, error: sipocErr } = await supabase
      .from('sipocs')
      .select('id, nome_processo, inputs, outputs, respostas_cliente, status')
      .eq('setor_id', tokenData.setor_id)
      .order('criado_em', { ascending: true })

    if (sipocErr) return res.status(500).json({ ok: false, error: 'Erro ao carregar processos.' })

    const { data: sessao } = await supabase
      .from('cliente_chat_sessao')
      .select('id, nome_cliente, mensagens, dados_coletados, concluido_em')
      .eq('token_acesso_id', tokenData.id)
      .maybeSingle()

    return res.status(200).json({
      ok: true,
      tokenId: tokenData.id,
      setorNome: tokenData.setor_nome,
      clienteNome: tokenData.cliente_nome,
      processos: (sipocs ?? []).map(p => ({
        id: p.id,
        name: p.nome_processo,
        inputs: p.inputs ?? [],
        outputs: p.outputs ?? [],
        status: p.status,
        jaRespondido: !!p.respostas_cliente && Object.keys(p.respostas_cliente).length > 0,
      })),
      sessao: sessao ?? null,
    })
  }

  // ── POST ─────────────────────────────────────────────────────────

  if (req.method === 'POST') {
    const { token, mensagem } = req.body ?? {}
    if (!token) return res.status(400).json({ ok: false, error: 'token é obrigatório' })
    if (!mensagem?.trim()) return res.status(400).json({ ok: false, error: 'mensagem é obrigatória' })

    const { valido, motivo, tokenData } = await validarToken(supabase, token)
    if (!valido) return res.status(403).json({ ok: false, error: motivo })

    // Load processos
    const { data: sipocs } = await supabase
      .from('sipocs')
      .select('id, nome_processo, inputs, outputs')
      .eq('setor_id', tokenData.setor_id)
      .order('criado_em', { ascending: true })

    const processos = (sipocs ?? []).map(p => ({
      id: p.id,
      name: p.nome_processo,
      inputs: p.inputs ?? [],
      outputs: p.outputs ?? [],
    }))

    // Load or create session
    let { data: sessao } = await supabase
      .from('cliente_chat_sessao')
      .select('id, nome_cliente, mensagens, dados_coletados, concluido_em')
      .eq('token_acesso_id', tokenData.id)
      .maybeSingle()

    if (!sessao) {
      const { data: nova, error: createErr } = await supabase
        .from('cliente_chat_sessao')
        .insert({ token_acesso_id: tokenData.id, mensagens: [], dados_coletados: {} })
        .select()
        .single()
      if (createErr) return res.status(500).json({ ok: false, error: 'Erro ao criar sessão.' })
      sessao = nova
    }

    if (sessao.concluido_em) {
      return res.status(409).json({ ok: false, error: 'Esta sessão já foi concluída.' })
    }

    // Append user message to history
    const historico = [
      ...(sessao.mensagens ?? []),
      { role: 'user', texto: mensagem.trim(), em: new Date().toISOString() },
    ]

    // Call Gemini
    const systemPrompt = buildSystemPrompt(tokenData.cliente_nome, tokenData.setor_nome, processos)
    let respostaRaw
    try {
      respostaRaw = await callGemini(systemPrompt, historico)
    } catch (err) {
      logError('cliente_chat.gemini_error', err, { tokenId: tokenData.id })
      return res.status(500).json({ ok: false, error: err.message ?? 'Erro ao processar resposta. Tente novamente.' })
    }

    const { mensagem: respostaTexto, estado } = parseResposta(respostaRaw)

    // Append agent message
    historico.push({ role: 'agent', texto: respostaTexto, em: new Date().toISOString() })

    // Save state incrementally
    const dadosColetados = estado?.dados_coletados ?? sessao.dados_coletados ?? {}
    const concluido = estado?.concluido === true
    const nomeCliente = estado?.nome_cliente ?? sessao.nome_cliente

    // Save process data for each completed process
    const processoAtualIndex = estado?.processo_atual_index ?? 0
    for (const proc of processos) {
      const dados = dadosColetados[proc.id]
      if (!dados) continue
      const estaCompleto = processoCompleto(dados)
      const foiFinalizado = processoAtualIndex > processos.findIndex(p => p.id === proc.id)
      if (estaCompleto || foiFinalizado || concluido) {
        try {
          if (concluido) {
            await finalizarProcesso(supabase, tokenData.id, proc.id, dados)
          } else {
            await salvarProcesso(supabase, tokenData.id, proc.id, dados)
          }
        } catch (err) {
          logError('cliente_chat.save_error', err, { sipocId: proc.id })
        }
      }
    }

    // Update session
    await supabase
      .from('cliente_chat_sessao')
      .update({
        mensagens: historico,
        dados_coletados: dadosColetados,
        nome_cliente: nomeCliente,
        atualizado_em: new Date().toISOString(),
        ...(concluido ? { concluido_em: new Date().toISOString() } : {}),
      })
      .eq('id', sessao.id)

    if (concluido) {
      logEvent('cliente_chat.concluido', { tokenId: tokenData.id, setor: tokenData.setor_nome })
      // Notify team
      const { data: setorData } = await supabase
        .from('setores').select('clientes(id)').eq('id', tokenData.setor_id).single()
      const projectId = setorData?.clientes?.id
      if (projectId) {
        await supabase.from('notifications').insert({
          project_id: projectId,
          type: 'cliente_chat_concluido',
          title: `Levantamento concluído — ${tokenData.setor_nome}`,
          body: { setor: tokenData.setor_nome, nome_cliente: nomeCliente, processos: processos.length },
        }).catch(() => {})
      }
    } else {
      logEvent('cliente_chat.mensagem', { tokenId: tokenData.id, processoIndex: processoAtualIndex })
    }

    return res.status(200).json({
      ok: true,
      resposta: respostaTexto,
      concluido,
      nomeCliente,
    })
  }

  return res.status(405).json({ ok: false, error: 'Método não permitido' })
}
