import { useState, useEffect, useRef, useCallback } from 'react'

// Formata hora HH:MM no fuso de SP
function fmtHora(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  })
}

// Renderiza texto com **negrito** simples
function TextoMensagem({ texto }) {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g)
  return (
    <span>
      {partes.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i}>{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </span>
  )
}

// Balão de mensagem individual
function Balao({ msg }) {
  const isAssistant = msg.role === 'assistant'
  return (
    <div className={`flex ${isAssistant ? 'justify-start' : 'justify-end'} gap-2`}>
      {isAssistant && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#16253e] flex items-center justify-center mt-0.5">
          <span className="text-white text-[10px] font-black">IA</span>
        </div>
      )}
      <div className="flex flex-col max-w-[85%]">
        <div className={`px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isAssistant
            ? 'bg-white border border-slate-200/80 rounded-tl-none rounded-tr-2xl rounded-b-2xl text-slate-700'
            : 'bg-[#16253e] text-white rounded-tr-none rounded-tl-2xl rounded-b-2xl'
        }`}>
          <TextoMensagem texto={msg.conteudo} />
        </div>
        {msg.criado_em && (
          <span className={`text-[11px] text-slate-400 mt-1 ${isAssistant ? 'text-left' : 'text-right'}`}>
            {fmtHora(msg.criado_em)}
          </span>
        )}
      </div>
    </div>
  )
}

// Indicador de digitação
function Digitando() {
  return (
    <div className="flex justify-start gap-2">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#16253e] flex items-center justify-center">
        <span className="text-white text-[10px] font-black">IA</span>
      </div>
      <div className="bg-white border border-slate-200/80 rounded-tl-none rounded-tr-2xl rounded-b-2xl px-4 py-3 flex items-center gap-1">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-1.5 h-1.5 bg-slate-400 rounded-full"
            style={{ animation: `levPulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>
    </div>
  )
}

export default function LevantamentoChat({ sipocId, token }) {
  const [estado, setEstado] = useState('carregando') // carregando | ativo | concluido | erro
  const [historico, setHistorico] = useState([])
  const [nomeProcesso, setNomeProcesso] = useState('')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [retomada, setRetomada] = useState(false)
  const [erroMsg, setErroMsg] = useState('')
  const fimRef = useRef(null)
  const textareaRef = useRef(null)

  const scrollToBottom = useCallback(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Carrega histórico inicial
  useEffect(() => {
    if (!sipocId || !token) { setEstado('erro'); setErroMsg('Dados insuficientes.'); return }

    fetch(`/api/levantamento-chat?token=${encodeURIComponent(token)}&sipocId=${encodeURIComponent(sipocId)}`)
      .then(r => r.json())
      .then(data => {
        if (!data.ok) { setEstado('erro'); setErroMsg(data.error ?? 'Erro ao carregar.'); return }
        setNomeProcesso(data.nomeProcesso)
        setHistorico(data.historico)
        if (data.status === 'concluido') {
          setEstado('concluido')
        } else {
          setEstado('ativo')
          if (data.historico.length > 1) setRetomada(true)
        }
      })
      .catch(() => { setEstado('erro'); setErroMsg('Não foi possível conectar ao servidor.') })
  }, [sipocId, token])

  // Scroll ao adicionar mensagem ou digitando
  useEffect(() => {
    scrollToBottom()
  }, [historico, enviando, scrollToBottom])

  // Scroll quando teclado virtual abre (mobile)
  useEffect(() => {
    if (!window.visualViewport) return
    const handle = () => scrollToBottom()
    window.visualViewport.addEventListener('resize', handle)
    return () => window.visualViewport.removeEventListener('resize', handle)
  }, [scrollToBottom])

  const enviarMensagem = useCallback(async () => {
    const msg = texto.trim()
    if (!msg || enviando || estado !== 'ativo') return

    // Adiciona mensagem do usuário otimisticamente
    const agora = new Date().toISOString()
    setHistorico(prev => [...prev, { role: 'user', conteudo: msg, criado_em: agora }])
    setTexto('')
    setEnviando(true)
    setErroMsg('')

    try {
      const res = await fetch('/api/levantamento-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, sipocId, mensagem: msg }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Erro desconhecido')

      setHistorico(prev => [...prev, {
        role: 'assistant',
        conteudo: data.resposta,
        criado_em: new Date().toISOString(),
      }])

      if (data.concluido) setEstado('concluido')
    } catch (err) {
      setErroMsg(err.message)
      // Remove mensagem otimista em caso de erro
      setHistorico(prev => prev.filter(h => !(h.role === 'user' && h.conteudo === msg && h.criado_em === agora)))
      setTexto(msg)
    } finally {
      setEnviando(false)
    }
  }, [texto, enviando, estado, token, sipocId])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviarMensagem()
    }
  }

  const autoResize = (e) => {
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px'
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Cabeçalho */}
      <div className="px-6 pt-5 pb-4 border-b border-slate-100">
        <h3 className="font-bold text-slate-800 text-base">Como seu processo funciona?</h3>
        <p className="text-slate-400 text-xs mt-1">
          Responda as perguntas do assistente para nos ajudar a entender o passo a passo do seu trabalho.
        </p>
      </div>

      {/* CSS de animação */}
      <style>{`
        @keyframes levPulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* Carregando */}
      {estado === 'carregando' && (
        <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
          Carregando conversa…
        </div>
      )}

      {/* Erro */}
      {estado === 'erro' && (
        <div className="flex items-center justify-center h-48 px-6">
          <p className="text-red-500 text-sm text-center">{erroMsg}</p>
        </div>
      )}

      {/* Chat ativo ou concluído */}
      {(estado === 'ativo' || estado === 'concluido') && (
        <div className="flex flex-col">
          {/* Área de mensagens */}
          <div
            className="px-4 py-4 space-y-4 overflow-y-auto bg-slate-50"
            style={{ height: 'clamp(300px, 60vh, 420px)' }}
          >
            {/* Banner de retomada */}
            {retomada && estado === 'ativo' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-center">
                <p className="text-xs text-amber-700">
                  Você já havia iniciado este levantamento. Continue de onde parou.
                </p>
              </div>
            )}

            {historico.map((msg, i) => <Balao key={i} msg={msg} />)}
            {enviando && <Digitando />}
            <div ref={fimRef} />
          </div>

          {/* Banner concluído */}
          {estado === 'concluido' && (
            <div className="mx-4 my-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-[11px]">✓</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800">Levantamento concluído!</p>
                <p className="text-xs text-green-600 mt-0.5">
                  Suas respostas foram registradas. O consultor irá analisar as informações.
                </p>
              </div>
            </div>
          )}

          {/* Input — apenas quando ativo */}
          {estado === 'ativo' && (
            <div className="border-t border-slate-100 px-4 py-3">
              {erroMsg && (
                <p className="text-red-500 text-xs mb-2">{erroMsg}</p>
              )}
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={texto}
                  onChange={e => { setTexto(e.target.value); autoResize(e) }}
                  onKeyDown={handleKeyDown}
                  placeholder="Digite sua resposta…"
                  rows={1}
                  disabled={enviando}
                  aria-label="Sua resposta"
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 pr-12
                             text-base text-slate-700 placeholder:text-slate-400 outline-none
                             focus-visible:ring-2 focus-visible:ring-[#ecbf03]/50 focus-visible:border-[#ecbf03]
                             disabled:opacity-50 transition-all"
                  style={{ fontSize: '16px', minHeight: '48px', maxHeight: '96px' }}
                />
                <button
                  onClick={enviarMensagem}
                  disabled={!texto.trim() || enviando}
                  aria-label="Enviar resposta"
                  className="absolute right-2.5 bottom-2.5 w-8 h-8 rounded-full bg-[#ecbf03] flex items-center justify-center
                             hover:bg-[#d4ab02] disabled:opacity-40 disabled:cursor-not-allowed transition-all
                             focus-visible:ring-2 focus-visible:ring-[#ecbf03]/50"
                  style={{ touchAction: 'manipulation', minWidth: '44px', minHeight: '44px', width: '44px', height: '44px', right: '4px', bottom: '4px' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16253e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">Enter para enviar · Shift+Enter para nova linha</p>
            </div>
          )}

          {/* Texto readonly quando concluído */}
          {estado === 'concluido' && (
            <p className="text-xs text-slate-400 text-center pb-4">Este levantamento já foi concluído.</p>
          )}
        </div>
      )}
    </div>
  )
}
