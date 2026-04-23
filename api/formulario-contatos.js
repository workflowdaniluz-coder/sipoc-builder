import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // GET ?cf=TOKEN — valida token e retorna nome do cliente
  if (req.method === 'GET') {
    const token = req.query.cf
    if (!token) return res.status(400).json({ ok: false, error: 'Token não informado.' })

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[formulario-contatos] Env vars SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas.')
      return res.status(503).json({ ok: false, error: 'Serviço não configurado (env vars ausentes).' })
    }

    const { data, error } = await supabase
      .from('clientes')
      .select('id, nome')
      .eq('token_formulario', token)
      .single()

    if (error) {
      console.error('[formulario-contatos] Erro ao buscar token:', error.message, error.code)
      return res.status(404).json({ ok: false, error: `Erro interno: ${error.message}` })
    }
    if (!data) return res.status(404).json({ ok: false, error: 'Link inválido ou expirado.' })

    return res.status(200).json({ ok: true, clienteId: data.id, clienteNome: data.nome })
  }

  // POST — salva contato
  // Requer o token do formulário para confirmar que o clienteId é legítimo
  if (req.method === 'POST') {
    const { token, clienteId, nome, setor, cargo, gestaoDireta, email } = req.body ?? {}

    if (!token) return res.status(400).json({ ok: false, error: 'Token não informado.' })
    if (!clienteId || !nome?.trim()) {
      return res.status(400).json({ ok: false, error: 'Dados incompletos.' })
    }

    // Validar que o token pertence ao clienteId informado
    const { data: cliente, error: tokenError } = await supabase
      .from('clientes')
      .select('id')
      .eq('token_formulario', token)
      .eq('id', clienteId)
      .maybeSingle()

    if (tokenError) return res.status(500).json({ ok: false, error: 'Erro ao validar token.' })
    if (!cliente) return res.status(403).json({ ok: false, error: 'Token inválido para este cliente.' })

    const { error } = await supabase
      .from('projeto_contatos')
      .insert({
        cliente_id:    clienteId,
        nome:          nome.trim(),
        setor:         setor?.trim() || null,
        cargo:         cargo?.trim() || null,
        gestao_direta: gestaoDireta?.trim() || null,
        email:         email?.trim() || null,
      })

    if (error) return res.status(500).json({ ok: false, error: error.message })

    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ ok: false, error: 'Método não permitido.' })
}
