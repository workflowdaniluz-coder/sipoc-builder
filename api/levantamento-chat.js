/**
 * GET  /api/levantamento-chat?token=&sipocId=
 *   Retorna histórico e dados do SIPOC para o chat de levantamento.
 *
 * POST /api/levantamento-chat
 *   Body: { token, sipocId, mensagem }
 *   Envia mensagem do cliente, chama Claude, retorna resposta do agente.
 */

import { createClient } from '@supabase/supabase-js'

const ORIGIN = process.env.APP_ORIGIN ?? 'https://app.p-excellence.com.br'
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = 'gemini-2.0-flash'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// ── Validação do token do cliente ─────────────────────────────────

async function validarToken(supabase, token) {
  const { data, error } = await supabase
    .from('tokens_acesso')
    .select('id, setor_id')
    .eq('token', token)
    .is('revogado_em', null)
    .gt('expira_em', new Date().toISOString())
    .maybeSingle()
  if (error || !data) return null
  return data
}

// ── Busca sipoc completo com outros processos do setor ────────────

async function buscarSipoc(supabase, sipocId, setorId) {
  const { data, error } = await supabase
    .from('sipocs')
    .select(`
      id, nome_processo, suppliers, inputs, outputs, customers,
      tipo, ferramentas, rasci_r, rasci_a, rasci_s, rasci_c, rasci_i,
      respostas_cliente, levantamento_status, levantamento_processo,
      setores ( id, nome, cliente_id, clientes ( id, nome ) )
    `)
    .eq('id', sipocId)
    .eq('setor_id', setorId)
    .maybeSingle()
  if (error || !data) return null

  // Outros processos do mesmo setor para o guardrail
  const { data: outros } = await supabase
    .from('sipocs')
    .select('nome_processo')
    .eq('setor_id', setorId)
    .neq('id', sipocId)
  data.outros_processos = (outros ?? []).map(o => o.nome_processo)
  return data
}

// ── Histórico ─────────────────────────────────────────────────────

async function buscarHistorico(supabase, sipocId) {
  const { data } = await supabase
    .from('levantamento_conversa')
    .select('role, conteudo, criado_em')
    .eq('sipoc_id', sipocId)
    .order('criado_em', { ascending: true })
  return data ?? []
}

// ── System prompt ─────────────────────────────────────────────────

function buildSystemPrompt(s) {
  const arr = (v) => Array.isArray(v) && v.length ? v.filter(Boolean).join(', ') : 'não informado'
  const nomeProcesso = s.nome_processo
  const setor = s.setores?.nome ?? ''
  const empresa = s.setores?.clientes?.nome ?? ''
  const outros = s.outros_processos?.length ? s.outros_processos.join(', ') : 'nenhum'

  return `Você é um assistente especializado em levantamento de processos empresariais da consultoria P-Excellence. Sua função é conversar com um colaborador para entender como UM processo específico funciona no dia a dia DELE — apenas as atividades que ELE executa.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXTO DO PROCESSO QUE VOCÊ VAI LEVANTAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Nome do processo: ${nomeProcesso}
Setor responsável: ${setor}
Empresa: ${empresa}
Tipo do processo: ${s.tipo ?? 'não informado'}

SIPOC mapeado pelo consultor:
Fornecedores: ${arr(s.suppliers)}
Entradas: ${arr(s.inputs)}
Saídas: ${arr(s.outputs)}
Clientes do processo: ${arr(s.customers)}
Ferramentas utilizadas: ${arr(s.ferramentas)}

Responsabilidades (RASCI):
Responsável (executa): ${arr(s.rasci_r)}
Aprovador (decide): ${arr(s.rasci_a)}
Suporte (apoia): ${arr(s.rasci_s)}
Consultado (orienta): ${arr(s.rasci_c)}
Informado (recebe aviso): ${arr(s.rasci_i)}

O que o cliente já respondeu sobre este processo:
${s.respostas_cliente ? JSON.stringify(s.respostas_cliente, null, 2) : 'Nenhuma resposta anterior'}

Outros processos do mesmo setor (NÃO são escopo desta conversa):
${outros}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEU OBJETIVO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coletar através de conversa natural:
1. O que inicia o processo e quem entrega — verificar se bate com o SIPOC
2. Cada atividade que O COLABORADOR executa, em sequência:
   - O que é feito naquela etapa
   - Se há decisão, verificação ou possibilidade de erro
   - Se aciona outra área: qual área, o que pede, o que recebe (apenas isso — não detalhar o processo interno da área)
3. Como o processo termina: o que é entregue e para quem

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS DE COMPORTAMENTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LINGUAGEM:
- Português brasileiro simples e direto
- NUNCA use termos técnicos de BPM: gateway, lane, pool, evento, artefato, BPMN, fluxo de sequência, subprocesso
- Use: etapa, passo, verificação, decisão, área, setor, tarefa, entrega, sistema, ferramenta
- Tom amigável e profissional
- Mensagens curtas — máximo 3 linhas por mensagem
- NUNCA faça duas perguntas na mesma mensagem

CONDUÇÃO DA CONVERSA:
- Faça UMA pergunta por vez
- Confirme o entendimento antes de avançar: "Entendi, então você [resumo em uma frase]. Certo?"
- Se resposta vaga: peça exemplo prático
- Se mencionar ferramenta não listada: anote mas não aprofunde
- Se contradizer o SIPOC: "Interessante, isso é um pouco diferente do que foi mapeado antes — vou registrar para o consultor alinhar com você depois."

GUARDRAIL — FOCO NO PROCESSO (comportamento mais importante):
Se o cliente começar a descrever atividades de OUTRA ÁREA, responda SEMPRE assim:
"Entendido! O detalhe de como o [área] conduz o processo interno deles será mapeado em uma conversa separada com essa equipe. Me conta só: o que eles te devolvem depois disso?"
Registre apenas: qual área foi acionada, o que o colaborador pediu, o que ela devolveu.
NUNCA registre atividades internas de outras áreas.

Se o cliente desviar para outro processo do setor (${outros}):
"Esse processo faz parte de outro mapeamento que faremos em separado. Voltando ao ${nomeProcesso}: [próxima pergunta]"

Se o cliente tentar falar de assuntos fora do trabalho:
"Boa pergunta, mas estou aqui só para ajudar no levantamento do ${nomeProcesso}. Vamos continuar?"

USO DO CONTEXTO:
- Use SIPOC, RASCI e respostas anteriores para fazer perguntas mais inteligentes
- Confirme ferramentas já conhecidas em vez de perguntar do zero
- Detecte divergências com o SIPOC automaticamente e anote
- Evite perguntar sobre informações já fornecidas nas respostas_cliente

PROGRESSÃO:
- Ordem obrigatória: início → atividades → fim
- Para cada atividade: entenda O QUE É FEITO antes de perguntar sobre exceções
- Não avance sem confirmar a etapa atual

CONCLUSÃO:
Quando tiver coletado início, todas as atividades e fim:
1. Faça um resumo numerado das atividades coletadas
2. Pergunte: "Ficou faltando alguma etapa importante?"
3. Se ele confirmar que está completo: responda com agradecimento e inclua <CONCLUIDO> ao final da mensagem (após o texto visível, nunca antes)`
}

// ── Mensagem inicial ──────────────────────────────────────────────

function mensagemInicial(nomeProcesso) {
  return `Olá! Vou te fazer algumas perguntas sobre o processo **${nomeProcesso}** para entender melhor como ele funciona no seu dia a dia. Pode falar à vontade, sem termos técnicos.\n\nPara começar: o que você precisa receber, ou o que precisa acontecer, para você dar início a este processo?`
}

// ── Chamada Gemini API ────────────────────────────────────────────

async function chamarGemini(systemPrompt, historico, maxTokens = 1000) {
  // Gemini exige que contents comece com 'user' — remove mensagens 'model' iniciais
  const mapped = historico.map(h => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.conteudo }],
  }))
  const firstUser = mapped.findIndex(m => m.role === 'user')
  const contents = firstUser >= 0 ? mapped.slice(firstUser) : mapped
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  })
  const json = await resp.json()
  if (!resp.ok) throw new Error('Gemini API error: ' + (json.error?.message ?? resp.status))
  return json.candidates[0].content.parts[0].text
}

// ── Extração do objeto estruturado ───────────────────────────────

async function extrairObjeto(nomeProcesso, historico) {
  const historicoFmt = historico
    .filter(h => h.role !== 'system')
    .map(h => `${h.role === 'user' ? 'Colaborador' : 'Assistente'}: ${h.conteudo}`)
    .join('\n\n')

  const prompt = `Com base na conversa abaixo sobre o processo ${nomeProcesso}, extraia as informações coletadas e retorne APENAS um objeto JSON válido, sem markdown, sem explicações, sem texto antes ou depois.

O objeto deve seguir exatamente esta estrutura:
{
  "preenchido_em": "${new Date().toISOString()}",
  "inicio": {
    "precisa_receber": "texto",
    "quem_entrega": "texto",
    "bate_com_sipoc": true,
    "divergencia_sipoc": null
  },
  "atividades": [
    {
      "ordem": 1,
      "descricao": "texto",
      "tem_decisao": false,
      "decisao": null
    }
  ],
  "fim": {
    "entrega": "texto",
    "para_quem": "texto",
    "bate_com_sipoc": true,
    "divergencia_sipoc": null,
    "observacoes": null
  }
}

Se alguma informação não foi mencionada, use null para campos opcionais e string vazia para obrigatórios — nunca invente informações.

CONVERSA:
${historicoFmt}`

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 2000 },
    }),
  })
  const json = await resp.json()
  if (!resp.ok) throw new Error('Gemini extract error: ' + resp.status)
  const raw = json.candidates[0].content.parts[0].text
  try {
    return JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim())
  } catch {
    return { preenchido_em: new Date().toISOString(), raw }
  }
}

// ── Handler principal ─────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.method === 'GET')  return handleGet(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  return res.status(405).json({ ok: false, error: 'Método não permitido' })
}

async function handleGet(req, res) {
  const { token, sipocId, consultor } = req.query
  if (!sipocId) return res.status(400).json({ ok: false, error: 'sipocId obrigatório.' })

  const supabase = getSupabase()
  let setorId

  // Consultor autenticado via JWT (para visualização no builder)
  if (consultor === '1') {
    const jwt = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/, '').trim()
    if (!jwt) return res.status(401).json({ ok: false, error: 'Não autorizado.' })
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
    if (authErr || !user) return res.status(401).json({ ok: false, error: 'Token de consultor inválido.' })
    // Busca setor_id do sipoc sem restrição (consultor acessa todos)
    const { data: s } = await supabase.from('sipocs').select('setor_id').eq('id', sipocId).maybeSingle()
    if (!s) return res.status(404).json({ ok: false, error: 'Processo não encontrado.' })
    const historico = await buscarHistorico(supabase, sipocId)
    return res.status(200).json({ ok: true, historico })
  }

  if (!token) return res.status(400).json({ ok: false, error: 'token obrigatório.' })
  const acesso = await validarToken(supabase, token)
  if (!acesso) return res.status(401).json({ ok: false, error: 'Token inválido ou expirado.' })
  setorId = acesso.setor_id

  const sipoc = await buscarSipoc(supabase, sipocId, setorId)
  if (!sipoc) return res.status(404).json({ ok: false, error: 'Processo não encontrado.' })

  let historico = await buscarHistorico(supabase, sipocId)

  // Primeira vez: gera mensagem inicial do agente
  if (historico.length === 0) {
    const conteudo = mensagemInicial(sipoc.nome_processo)
    await supabase.from('levantamento_conversa').insert({ sipoc_id: sipocId, role: 'assistant', conteudo })
    await supabase.from('sipocs').update({ levantamento_status: 'em_andamento' }).eq('id', sipocId)
    historico = [{ role: 'assistant', conteudo, criado_em: new Date().toISOString() }]
  }

  return res.status(200).json({
    ok: true,
    sipocId,
    nomeProcesso: sipoc.nome_processo,
    status: sipoc.levantamento_status,
    historico,
    levantamento: sipoc.levantamento_processo ?? null,
  })
}

async function handlePost(req, res) {
  const { token, sipocId, mensagem } = req.body ?? {}
  if (!token || !sipocId) return res.status(400).json({ ok: false, error: 'token e sipocId obrigatórios.' })
  if (!mensagem?.trim()) return res.status(400).json({ ok: false, error: 'mensagem não pode ser vazia.' })

  if (!GEMINI_API_KEY) return res.status(500).json({ ok: false, error: 'GEMINI_API_KEY não configurada.' })

  const supabase = getSupabase()
  const acesso = await validarToken(supabase, token)
  if (!acesso) return res.status(401).json({ ok: false, error: 'Token inválido ou expirado.' })

  const sipoc = await buscarSipoc(supabase, sipocId, acesso.setor_id)
  if (!sipoc) return res.status(404).json({ ok: false, error: 'Processo não encontrado.' })

  if (sipoc.levantamento_status === 'concluido')
    return res.status(400).json({ ok: false, error: 'Levantamento já finalizado.' })

  // 1. Salva mensagem do cliente
  await supabase.from('levantamento_conversa').insert({ sipoc_id: sipocId, role: 'user', conteudo: mensagem.trim() })

  // 2. Busca histórico completo
  const historico = await buscarHistorico(supabase, sipocId)

  // 3. Chama Claude
  const systemPrompt = buildSystemPrompt(sipoc)
  let respostaBruta
  try {
    respostaBruta = await chamarGemini(systemPrompt, historico)
  } catch (err) {
    console.error('[levantamento-chat] Gemini error:', err.message)
    return res.status(502).json({ ok: false, error: 'Erro ao chamar o assistente. Tente novamente.' })
  }

  // 4. Detecta conclusão
  const concluido = respostaBruta.includes('<CONCLUIDO>')
  const respostaLimpa = respostaBruta.replace('<CONCLUIDO>', '').trim()

  // 5. Salva resposta do agente
  await supabase.from('levantamento_conversa').insert({ sipoc_id: sipocId, role: 'assistant', conteudo: respostaLimpa })

  if (!concluido) {
    return res.status(200).json({ ok: true, resposta: respostaLimpa, concluido: false })
  }

  // 6. Concluído: extrai objeto estruturado
  const historicoFinal = await buscarHistorico(supabase, sipocId)
  let objLevantamento = null
  try {
    objLevantamento = await extrairObjeto(sipoc.nome_processo, historicoFinal)
  } catch (err) {
    console.warn('[levantamento-chat] Extração falhou:', err.message)
  }

  // 7. Salva no banco e notifica
  await supabase.from('sipocs').update({
    levantamento_processo: objLevantamento,
    levantamento_status: 'concluido',
  }).eq('id', sipocId)

  const clienteId = sipoc.setores?.clientes?.id
  if (clienteId) {
    await supabase.from('notifications').insert({
      project_id: clienteId,
      type: 'levantamento_concluido',
      title: 'Cliente concluiu o levantamento',
      body: {
        processo: sipoc.nome_processo,
        setor: sipoc.setores?.nome ?? null,
      },
    }).catch(err => console.warn('[levantamento-chat] Notificação falhou:', err.message))
  }

  return res.status(200).json({ ok: true, resposta: respostaLimpa, concluido: true })
}
