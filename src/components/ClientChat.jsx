import { useState, useEffect, useRef } from 'react'

export default function ClientChat({ token }) {
  const [estado, setEstado]       = useState('loading') // loading | ok | erro
  const [erroInicial, setErroInicial] = useState(null)
  const [setorNome, setSetorNome] = useState('')
  const [clienteNome, setClienteNome] = useState('')
  const [processos, setProcessos] = useState([])

  const [mensagens, setMensagens]   = useState([])
  const [input, setInput]           = useState('')
  const [enviando, setEnviando]     = useState(false)
  const [concluido, setConcluido]   = useState(false)
  const [erroEnvio, setErroEnvio]   = useState(null)
  const [iniciado, setIniciado]     = useState(false)

  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  // Load session on mount
  useEffect(() => {
    const carregar = async () => {
      try {
        const resp = await fetch(`/api/cliente-chat?token=${encodeURIComponent(token)}`)
        const data = await resp.json()
        if (!data.ok) { setErroInicial(data.error); setEstado('erro'); return }

        setSetorNome(data.setorNome)
        setClienteNome(data.clienteNome)
        setProcessos(data.processos ?? [])

        if (data.sessao?.mensagens?.length) {
          setMensagens(data.sessao.mensagens.map(m => ({ role: m.role, texto: m.texto })))
          setIniciado(true)
          if (data.sessao.concluido_em) setConcluido(true)
        }
        setEstado('ok')
      } catch (err) {
        setErroInicial(err.message)
        setEstado('erro')
      }
    }
    carregar()
  }, [token])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens, enviando])

  const enviarMensagem = async (texto) => {
    const txt = (texto ?? input).trim()
    if (!txt || enviando) return

    setInput('')
    setErroEnvio(null)
    setMensagens(prev => [...prev, { role: 'user', texto: txt }])
    setEnviando(true)

    try {
      const resp = await fetch('/api/cliente-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, mensagem: txt }),
      })
      const data = await resp.json()
      if (!data.ok) throw new Error(data.error ?? 'Erro desconhecido')

      setMensagens(prev => [...prev, { role: 'agent', texto: data.resposta }])
      if (data.concluido) setConcluido(true)
    } catch (err) {
      setErroEnvio(err.message)
      setMensagens(prev => prev.slice(0, -1))
    } finally {
      setEnviando(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  const iniciarConversa = async () => {
    setIniciado(true)
    await enviarMensagem('Olá, pode começar.')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensagem() }
  }

  // ── Loading ───────────────────────────────────────────────────────

  if (estado === 'loading') return (
    <div className="min-h-screen bg-[#16253e] flex items-center justify-center">
      <div className="flex items-center gap-3 text-slate-400">
        <div className="w-5 h-5 border-2 border-[#ecbf03] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-medium">Carregando...</span>
      </div>
    </div>
  )

  if (estado === 'erro') return (
    <div className="min-h-screen bg-[#16253e] flex items-center justify-center px-6">
      <div className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center">
        <p className="text-white font-semibold mb-2">Link inválido</p>
        <p className="text-slate-400 text-sm">{erroInicial}</p>
      </div>
    </div>
  )

  // ── Concluído ─────────────────────────────────────────────────────

  if (concluido) return (
    <div className="min-h-screen bg-[#16253e] flex flex-col items-center justify-center px-6 text-center">
      <img src="/logo-positive.png" alt="P-Excellence" className="h-10 w-auto mx-auto mb-10 opacity-90" />
      <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mx-auto mb-6">
        <svg className="w-9 h-9 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="text-3xl font-black text-white mb-3">Obrigada pelas informações!</h1>
      <p className="text-slate-300 text-base max-w-sm mx-auto leading-relaxed">
        Suas respostas foram registradas com sucesso e encaminhadas para a equipe P-Excellence.
      </p>
      <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 max-w-xs w-full mt-8">
        <p className="text-slate-400 text-xs leading-relaxed">
          Este link foi encerrado. Caso precise de suporte, entre em contato com o seu consultor.
        </p>
      </div>
    </div>
  )

  // ── Boas-vindas ───────────────────────────────────────────────────

  if (!iniciado) return (
    <div className="min-h-screen bg-[#16253e] flex flex-col items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <img src="/logo-positive.png" alt="P-Excellence" className="h-10 w-auto mx-auto mb-10 opacity-90" />
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 mb-6">
          <h1 className="text-2xl font-black text-white mb-2">Levantamento de Processos</h1>
          <p className="text-slate-300 text-sm mb-1">{clienteNome}</p>
          <p className="text-[#ecbf03] text-sm font-semibold mb-6">{setorNome}</p>
          <p className="text-slate-400 text-sm leading-relaxed mb-6">
            Vamos conversar sobre os processos do seu setor. É rápido — cerca de 10 a 15 minutos.
          </p>
          {processos.length > 0 && (
            <div className="text-left space-y-2 mb-8">
              {processos.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 text-sm text-slate-300">
                  <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-bold text-slate-400 flex-shrink-0">
                    {i + 1}
                  </span>
                  {p.name}
                </div>
              ))}
            </div>
          )}
          <button
            onClick={iniciarConversa}
            className="w-full bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] font-black py-3 rounded-xl text-sm transition-all shadow-lg shadow-[#ecbf03]/20"
          >
            Iniciar conversa
          </button>
        </div>
      </div>
    </div>
  )

  // ── Chat ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#16253e] flex flex-col">
      <header className="bg-[#16253e] border-b border-white/10 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <img src="/logo-positive.png" alt="P-Excellence" className="h-7 w-auto opacity-90" />
        <div className="ml-1">
          <p className="text-white text-xs font-bold leading-tight">{clienteNome}</p>
          <p className="text-[#ecbf03] text-[11px] font-medium">{setorNome}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 max-w-2xl mx-auto w-full">
        {mensagens.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'agent' && (
              <div className="w-7 h-7 rounded-full bg-[#ecbf03] flex items-center justify-center text-[#16253e] text-[11px] font-black flex-shrink-0 mr-2 mt-0.5">
                P
              </div>
            )}
            <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
              ${m.role === 'user'
                ? 'bg-[#ecbf03] text-[#16253e] font-medium rounded-br-sm'
                : 'bg-white/10 text-slate-100 rounded-bl-sm'}`}
            >
              {m.texto}
            </div>
          </div>
        ))}

        {enviando && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-[#ecbf03] flex items-center justify-center text-[#16253e] text-[11px] font-black flex-shrink-0 mr-2 mt-0.5">
              P
            </div>
            <div className="bg-white/10 px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {erroEnvio && (
          <div className="flex justify-center">
            <div className="bg-red-500/20 border border-red-500/30 text-red-300 text-xs px-4 py-2 rounded-xl">
              {erroEnvio} — tente enviar novamente.
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-white/10 bg-[#16253e] px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua resposta..."
            rows={1}
            disabled={enviando}
            className="flex-1 bg-white/10 border border-white/20 text-white placeholder:text-slate-500 text-sm
                       rounded-xl px-4 py-3 outline-none resize-none focus:border-[#ecbf03]/50 focus:ring-1
                       focus:ring-[#ecbf03]/30 transition-all disabled:opacity-50 leading-relaxed"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
            onInput={e => {
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
          />
          <button
            onClick={() => enviarMensagem()}
            disabled={!input.trim() || enviando}
            className="w-10 h-10 bg-[#ecbf03] hover:bg-[#d4ab02] disabled:opacity-30 disabled:cursor-not-allowed
                       text-[#16253e] rounded-xl flex items-center justify-center transition-all flex-shrink-0 mb-0.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.269 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
        <p className="text-center text-slate-600 text-[10px] mt-2">Enter para enviar · Shift+Enter para nova linha</p>
      </div>
    </div>
  )
}
