import { useState } from 'react'

/**
 * Portal de validação de BPMN para o responsável do setor.
 * Acessado via ?vt=<token> — sem autenticação Supabase.
 *
 * Props:
 *   validacaoData: {
 *     token, tokenId, sipocId, nomeProcesso, bpmnDriveUrl,
 *     setorNome, clienteNome, clienteId
 *   }
 */
export default function BpmnValidacaoView({ validacaoData }) {
  const [nome,       setNome]       = useState('')
  const [comentario, setComentario] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resultado,  setResultado]  = useState(null) // { acao: 'aprovar'|'rejeitar' }
  const [erro,       setErro]       = useState('')

  const handleSubmit = async (acao) => {
    if (!nome.trim()) { setErro('Informe seu nome antes de continuar.'); return }
    if (acao === 'rejeitar' && !window.confirm('Confirmar rejeição do diagrama?')) return

    setSubmitting(true)
    setErro('')
    try {
      const res = await fetch('/api/validar-bpmn', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          token:       validacaoData.token,
          acao,
          comentario:  comentario.trim() || null,
          validado_por: nome.trim(),
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Erro desconhecido')
      setResultado({ acao })
    } catch (err) {
      setErro(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Tela de confirmação ────────────────────────────────────────
  if (resultado) {
    const aprovado = resultado.acao === 'aprovar'
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-10 max-w-sm w-full text-center space-y-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto
            ${aprovado ? 'bg-green-100' : 'bg-red-100'}`}>
            {aprovado
              ? <svg className="w-9 h-9 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              : <svg className="w-9 h-9 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            }
          </div>
          <h2 className="text-xl font-black text-slate-800">
            {aprovado ? 'Diagrama aprovado!' : 'Rejeição registrada'}
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Sua resposta foi registrada.<br />
            A equipe de consultoria foi notificada.
          </p>
        </div>
      </div>
    )
  }

  // ── Portal principal ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* Header */}
      <header className="bg-[#16253e]">
        <div className="max-w-screen-md mx-auto px-6 h-14 flex items-center">
          <img src="/logo-positive.png" alt="P-Excellence" className="h-8 w-auto" />
        </div>
      </header>

      <main className="max-w-screen-md mx-auto w-full px-6 py-8 space-y-6 flex-1">

        {/* Título */}
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
            Validação de Mapeamento
          </p>
          <p className="text-sm text-slate-500">
            {validacaoData.clienteNome} — {validacaoData.setorNome}
          </p>
        </div>

        {/* Card do processo */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Processo</p>
          <p className="text-xl font-bold text-[#16253e] leading-tight">
            {validacaoData.nomeProcesso}
          </p>
        </div>

        {/* Diagrama */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Diagrama do Processo
            </p>
          </div>
          {validacaoData.bpmnDriveUrl ? (
            <iframe
              src={validacaoData.bpmnDriveUrl}
              title="Diagrama BPMN"
              className="w-full border-0"
              style={{ height: '70vh' }}
            />
          ) : (
            <div className="flex items-center justify-center p-12 text-center">
              <p className="text-sm text-slate-400">Diagrama não disponível no momento.</p>
            </div>
          )}
        </div>

        {/* Formulário de resposta */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Sua resposta
          </p>

          <div>
            <label htmlFor="vld-nome" className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Seu nome <span className="text-red-400">*</span>
            </label>
            <input
              id="vld-nome"
              type="text"
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Nome completo"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none
                focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all
                placeholder:text-slate-400"
            />
          </div>

          <div>
            <label htmlFor="vld-comentario" className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Comentários
            </label>
            <textarea
              id="vld-comentario"
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              rows={4}
              placeholder="Observações sobre o diagrama… (opcional)"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none
                focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all
                placeholder:text-slate-400 resize-none"
            />
          </div>

          {erro && (
            <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              {erro}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => handleSubmit('rejeitar')}
              disabled={submitting}
              className="flex-1 py-3 rounded-xl border border-red-300 text-red-600 font-bold
                text-sm hover:bg-red-50 transition-all disabled:opacity-50"
            >
              Rejeitar diagrama
            </button>
            <button
              type="button"
              onClick={() => handleSubmit('aprovar')}
              disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e]
                font-bold text-sm transition-all disabled:opacity-50 shadow-sm shadow-[#ecbf03]/30
                flex items-center justify-center gap-2"
            >
              {submitting ? 'Registrando…' : (
                <>
                  Aprovar diagrama
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>

      </main>
    </div>
  )
}
