import { getAdminClient } from './_lib/supabase-admin.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const supabase = getAdminClient()

  // GET ?cf=TOKEN — valida token e retorna nome do cliente
  if (req.method === 'GET') {
    const token = req.query.cf
    if (!token) return res.status(400).json({ ok: false, error: 'Token não informado.' })

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

    const emailTrimmed = email?.trim() || null
    if (emailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      return res.status(400).json({ ok: false, error: 'Email inválido.' })
    }

    if (nome.length > 200) return res.status(400).json({ ok: false, error: 'Nome muito longo (máx 200 caracteres).' })

    const { error } = await supabase
      .from('projeto_contatos')
      .insert({
        cliente_id:    clienteId,
        nome:          nome.trim(),
        setor:         setor?.trim() || null,
        cargo:         cargo?.trim() || null,
        gestao_direta: gestaoDireta?.trim() || null,
        email:         emailTrimmed,
      })

    if (error) return res.status(500).json({ ok: false, error: error.message })

    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ ok: false, error: 'Método não permitido.' })
}
