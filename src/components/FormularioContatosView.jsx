import { useState } from 'react'

export default function FormularioContatosView({ clienteId, clienteNome, token }) {
  const [nome,         setNome]         = useState('')
  const [setor,        setSetor]        = useState('')
  const [cargo,        setCargo]        = useState('')
  const [gestaoDireta, setGestaoDireta] = useState('')
  const [email,        setEmail]        = useState('')
  const [submitting,   setSubmitting]   = useState(false)
  const [erro,         setErro]         = useState(null)
  const [sucesso,      setSucesso]      = useState(false)

  const podeEnviar = nome.trim() && setor.trim() && cargo.trim() && email.trim()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!podeEnviar) return
    setSubmitting(true)
    setErro(null)
    try {
      const resp = await fetch('/api/formulario-contatos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, clienteId, nome, setor, cargo, gestaoDireta, email }),
      })
      const data = await resp.json()
      if (!data.ok) throw new Error(data.error ?? 'Erro ao enviar')
      setSucesso(true)
    } catch (err) {
      setErro(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (sucesso) {
    return (
      <div className="min-h-screen bg-[#16253e] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-10 max-w-md w-full text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-2">Dados recebidos!</h2>
          <p className="text-sm text-slate-500">
            Obrigado, <strong>{nome}</strong>. Seus dados foram registrados com sucesso.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-slate-100 pb-24">

      {/* Header */}
      <header className="bg-[#16253e] sticky top-0 z-40">
        <div className="max-w-[600px] mx-auto px-6 h-16 flex items-center gap-3">
          <img src="/logo-mark.png" alt="P-Excellence" className="h-8 w-auto flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-tight truncate">{clienteNome}</p>
            <p className="text-[#ecbf03] text-xs font-semibold">Cadastro de participantes</p>
          </div>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="max-w-[600px] mx-auto px-4 pt-8">
        <div className="mb-6">
          <h1 className="text-xl font-black text-slate-800">Seus dados</h1>
          <p className="text-sm text-slate-500 mt-1">
            Preencha as informações abaixo para participar do projeto de mapeamento de processos.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">

            <div>
              <label htmlFor="fc-nome" className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Nome completo <span className="text-red-400">*</span>
              </label>
              <input id="fc-nome" type="text" required value={nome} onChange={e => setNome(e.target.value)}
                autoFocus placeholder="Seu nome completo"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm outline-none
                  focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all placeholder:text-slate-400" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="fc-setor" className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Setor <span className="text-red-400">*</span>
                </label>
                <input id="fc-setor" type="text" required value={setor} onChange={e => setSetor(e.target.value)}
                  placeholder="Ex: Financeiro"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm outline-none
                    focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all placeholder:text-slate-400" />
              </div>
              <div>
                <label htmlFor="fc-cargo" className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Cargo <span className="text-red-400">*</span>
                </label>
                <input id="fc-cargo" type="text" required value={cargo} onChange={e => setCargo(e.target.value)}
                  placeholder="Ex: Analista"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm outline-none
                    focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all placeholder:text-slate-400" />
              </div>
            </div>

            <div>
              <label htmlFor="fc-gestao" className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Gestão direta
                <span className="ml-1 text-slate-400 normal-case font-normal tracking-normal">opcional</span>
              </label>
              <input id="fc-gestao" type="text" value={gestaoDireta} onChange={e => setGestaoDireta(e.target.value)}
                placeholder="Nome do seu gestor direto"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm outline-none
                  focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all placeholder:text-slate-400" />
            </div>

            <div>
              <label htmlFor="fc-email" className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                E-mail <span className="text-red-400">*</span>
              </label>
              <input id="fc-email" type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm outline-none
                  focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all placeholder:text-slate-400" />
            </div>
          </div>

          {erro && (
            <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              {erro}
            </p>
          )}

          <button type="submit" disabled={!podeEnviar || submitting}
            className="w-full py-3.5 rounded-xl bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] font-bold
              text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-[#ecbf03]/30">
            {submitting ? 'Enviando…' : 'Enviar dados'}
          </button>
        </form>
      </main>
    </div>
  )
}
