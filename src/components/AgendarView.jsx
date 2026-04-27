import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const TIPO_LABELS = {
  sipoc: 'Mapeamento SIPOC',
  bpmn: 'Mapeamento BPMN',
  validacao_bpmn: 'Validação BPMN',
}

function fmtData(isoStr) {
  const d = new Date(isoStr)
  return d.toLocaleString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  })
}

export default function AgendarView({ token }) {
  const [estado, setEstado]         = useState('carregando') // carregando | disponivel | confirmado | invalido
  const [row, setRow]               = useState(null)
  const [selecionados, setSelecionados] = useState([])
  const [enviando, setEnviando]     = useState(false)
  const [erro, setErro]             = useState(null)
  const [confirmacao, setConfirmacao] = useState(null)

  useEffect(() => {
    if (!token) { setEstado('invalido'); return }

    supabase
      .from('tokens_agendamento')
      .select(`
        id, tipo, tipo_customizado, duracao_min, slots, qtd_escolha, expira_em, usado_em, revogado_em,
        clientes ( nome ),
        setores ( nome )
      `)
      .eq('token', token)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) { setEstado('invalido'); return }
        if (data.revogado_em) { setEstado('cancelado'); return }
        if (data.usado_em)    { setEstado('confirmado'); return }
        if (new Date(data.expira_em) < new Date()) { setEstado('expirado'); return }
        setRow(data)
        setEstado('disponivel')
      })
  }, [token])

  const toggleSlot = (start) => {
    setSelecionados(prev => {
      if (prev.includes(start)) return prev.filter(s => s !== start)
      if (prev.length >= row.qtd_escolha) return prev
      return [...prev, start]
    })
  }

  const handleConfirmar = async () => {
    if (selecionados.length !== row.qtd_escolha) return
    setEnviando(true)
    setErro(null)
    try {
      const res = await fetch('/api/agendamento/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, slots_escolhidos: selecionados }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setConfirmacao(json)
      setEstado('confirmado')
    } catch (err) {
      setErro(err.message)
    } finally {
      setEnviando(false)
    }
  }

  const tipoLabel = row ? (row.tipo === 'outra' ? row.tipo_customizado : TIPO_LABELS[row.tipo] ?? row.tipo) : ''

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#16253e] via-[#1e3257] to-[#0d1927] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-8">
          <img src="/logo-positive.png" alt="P-Excellence" className="h-10 w-auto" />
        </div>

        <div className="bg-white rounded-2xl shadow-2xl shadow-slate-900/40 overflow-hidden">

          {/* Carregando */}
          {estado === 'carregando' && (
            <div className="p-8 text-center">
              <p className="text-slate-400 text-sm">Carregando…</p>
            </div>
          )}

          {/* Inválido */}
          {(estado === 'invalido' || estado === 'expirado' || estado === 'cancelado') && (
            <div className="p-8 text-center">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">✕</div>
              <h2 className="font-bold text-slate-700 text-lg mb-2">
                {estado === 'expirado' ? 'Link expirado' :
                 estado === 'cancelado' ? 'Link cancelado' :
                 'Link inválido'}
              </h2>
              <p className="text-slate-400 text-sm">
                {estado === 'expirado' ? 'Este link de agendamento expirou. Peça um novo link ao consultor.' :
                 estado === 'cancelado' ? 'O consultor cancelou esta oferta de horários.' :
                 'Este link não é válido. Verifique o link recebido.'}
              </p>
            </div>
          )}

          {/* Já confirmado */}
          {estado === 'confirmado' && (
            <div className="p-8 text-center">
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
              <h2 className="font-bold text-slate-700 text-lg mb-2">Agendamento confirmado!</h2>
              {confirmacao?.slots_confirmados?.length > 0 ? (
                <div className="mt-4 text-left space-y-2">
                  {confirmacao.slots_confirmados.map((s, i) => (
                    <div key={i} className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                      <p className="text-sm font-semibold text-emerald-700">{fmtData(s)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-sm mt-2">Seu agendamento foi registrado. O consultor entrará em contato.</p>
              )}
            </div>
          )}

          {/* Disponível */}
          {estado === 'disponivel' && row && (
            <div>
              <div className="bg-[#16253e] px-6 py-5">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">P-Excellence</p>
                <h2 className="text-white font-bold text-lg">{tipoLabel}</h2>
                {row.setores?.nome && (
                  <p className="text-slate-400 text-sm mt-0.5">{row.clientes?.nome} · {row.setores.nome}</p>
                )}
                <p className="text-slate-400 text-xs mt-2">{row.duracao_min} minutos</p>
              </div>

              <div className="px-6 py-5">
                <p className="text-xs font-bold text-slate-500 mb-1">
                  Selecione {row.qtd_escolha === 1 ? 'um horário' : `${row.qtd_escolha} horários`}
                </p>
                <p className="text-xs text-slate-400 mb-4">
                  {selecionados.length}/{row.qtd_escolha} selecionado{row.qtd_escolha > 1 ? 's' : ''}
                </p>

                <div className="space-y-2 mb-6">
                  {(row.slots ?? []).map((s, i) => {
                    const sel = selecionados.includes(s.start)
                    const disabled = !sel && selecionados.length >= row.qtd_escolha
                    return (
                      <button
                        key={i}
                        onClick={() => !disabled && toggleSlot(s.start)}
                        disabled={disabled}
                        className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all
                          ${sel
                            ? 'border-[#ecbf03] bg-[#ecbf03]/10'
                            : disabled
                              ? 'border-slate-100 bg-slate-50 opacity-40 cursor-not-allowed'
                              : 'border-slate-200 hover:border-[#ecbf03]/50 hover:bg-slate-50'
                          }`}>
                        <p className={`text-sm font-semibold capitalize ${sel ? 'text-[#16253e]' : 'text-slate-700'}`}>
                          {fmtData(s.start)}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{row.duracao_min} min</p>
                      </button>
                    )
                  })}
                </div>

                {erro && (
                  <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <p className="text-red-600 text-sm">{erro}</p>
                  </div>
                )}

                <button
                  onClick={handleConfirmar}
                  disabled={selecionados.length !== row.qtd_escolha || enviando}
                  className="w-full bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  {enviando ? 'Confirmando…' : 'Confirmar agendamento'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
