import { useState } from 'react'

// ── ErroTokenView ─────────────────────────────────────────────────────────────

export function ErroTokenView({ mensagem }) {
  return (
    <div className="min-h-screen bg-[#16253e] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 border border-red-200 max-w-md text-center shadow-sm w-full">
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">Link inválido</h2>
        <p className="text-sm text-slate-500">{mensagem ?? 'Este link de validação é inválido ou expirou.'}</p>
      </div>
    </div>
  )
}

// ── ProcessCard ───────────────────────────────────────────────────────────────

function ProcessCard({ processo, resposta, onChange }) {
  const acao = resposta?.acao ?? null

  const borderCls = acao === 'aprovado'
    ? 'border-l-4 border-l-green-500'
    : acao === 'contestado'
    ? 'border-l-4 border-l-red-500'
    : 'border-l-4 border-l-slate-200'

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${borderCls}`}>
      {/* Cabeçalho */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-bold text-slate-800 text-sm leading-snug">{processo.nome}</h3>
          {processo.driveUrl && (
            <a
              href={processo.driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 text-slate-400 hover:text-[#ecbf03] transition-colors"
              title="Abrir no Google Drive"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>

        {/* Iframe do diagrama */}
        {processo.embedUrl ? (
          <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 mb-4"
               style={{ height: 320 }}>
            <iframe
              src={processo.embedUrl}
              title={processo.nome}
              width="100%"
              height="100%"
              allow="autoplay"
              className="block"
              style={{ border: 'none' }}
            />
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center
                          justify-center mb-4" style={{ height: 200 }}>
            <p className="text-xs text-slate-400">Diagrama não disponível para visualização.</p>
          </div>
        )}

        {/* Botões de ação */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange({ acao: 'aprovado', comentario: '' })}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all
              ${acao === 'aprovado'
                ? 'bg-green-600 border-green-600 text-white shadow-sm'
                : 'border-green-300 text-green-700 hover:bg-green-50'}`}
          >
            Aprovar
          </button>
          <button
            type="button"
            onClick={() => onChange({ acao: 'contestado', comentario: '' })}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all
              ${acao === 'contestado'
                ? 'bg-red-600 border-red-600 text-white shadow-sm'
                : 'border-red-300 text-red-700 hover:bg-red-50'}`}
          >
            Contestar
          </button>
        </div>
      </div>

      {/* Textarea contestação */}
      {acao === 'contestado' && (
        <div className="px-5 pb-5 border-t border-slate-100 pt-3">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Motivo da contestação *
          </label>
          <textarea
            value={resposta?.comentario ?? ''}
            onChange={e => onChange({ acao: 'contestado', comentario: e.target.value })}
            placeholder="Descreva o que precisa ser corrigido…"
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700
              placeholder:text-slate-400 focus:outline-none focus:border-red-400 focus:ring-2
              focus:ring-red-100 resize-none transition-all"
          />
        </div>
      )}
    </div>
  )
}

// ── BpmnValidacaoSetorView ────────────────────────────────────────────────────

export default function BpmnValidacaoSetorView({ validacaoData }) {
  const {
    token,
    setorNome,
    clienteNome,
    jaRespondido: initialJaRespondido,
    processos = [],
  } = validacaoData

  const [jaRespondido]                = useState(initialJaRespondido)
  const [respostas, setRespostas]     = useState({}) // { [sipoc_id]: { acao, comentario } }
  const [comentarioGeral, setComentarioGeral] = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [sucesso, setSucesso]         = useState(false)

  const respondidos = processos.filter(p => respostas[p.id]?.acao)
  const todosRespondidos = respondidos.length === processos.length && processos.length > 0
  const algumContestado  = Object.values(respostas).some(r => r.acao === 'contestado')

  const contestacoesIncompletas = Object.values(respostas).some(
    r => r.acao === 'contestado' && !r.comentario?.trim()
  )

  const podeEnviar = todosRespondidos && !contestacoesIncompletas

  const handleResponder = (sipocId, resposta) => {
    setRespostas(prev => ({ ...prev, [sipocId]: resposta }))
  }

  const handleSubmit = async () => {
    if (!podeEnviar) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const resp = await fetch('/api/validar-bpmn/setor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          respostas: processos.map(p => ({
            sipoc_id:   p.id,
            acao:       respostas[p.id].acao,
            comentario: respostas[p.id].comentario || null,
          })),
          comentarioGeral: comentarioGeral.trim() || null,
        }),
      })
      const data = await resp.json()
      if (!data.ok) throw new Error(data.error ?? 'Erro ao enviar validação')
      setSucesso(true)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Tela: já respondido ────────────────────────────────────────────────────
  if (jaRespondido) {
    return (
      <div className="min-h-screen bg-[#16253e] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-10 max-w-md w-full text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">Já respondido</h2>
          <p className="text-sm text-slate-500">
            A validação para o setor <strong>{setorNome}</strong> já foi enviada.<br />
            Obrigado pela participação!
          </p>
        </div>
      </div>
    )
  }

  // ── Tela: sucesso após envio ───────────────────────────────────────────────
  if (sucesso) {
    const aprovadosCount   = Object.values(respostas).filter(r => r.acao === 'aprovado').length
    const contestadosCount = Object.values(respostas).filter(r => r.acao === 'contestado').length
    return (
      <div className="min-h-screen bg-[#16253e] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-10 max-w-md w-full text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-2">Validação enviada!</h2>
          <p className="text-sm text-slate-500 mb-4">
            Recebemos sua resposta para o setor <strong>{setorNome}</strong>.
          </p>
          <div className="flex justify-center gap-4 text-sm">
            {aprovadosCount > 0 && (
              <span className="bg-green-100 text-green-700 font-semibold px-3 py-1.5 rounded-full">
                {aprovadosCount} aprovado{aprovadosCount > 1 ? 's' : ''}
              </span>
            )}
            {contestadosCount > 0 && (
              <span className="bg-red-100 text-red-700 font-semibold px-3 py-1.5 rounded-full">
                {contestadosCount} contestado{contestadosCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Tela principal ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-slate-100 pb-40">

      {/* Header fixo */}
      <header className="bg-[#16253e] sticky top-0 z-40">
        <div className="max-w-[700px] mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo-mark.png" alt="P-Excellence" className="h-8 w-auto flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-tight truncate">{clienteNome}</p>
              <p className="text-[#ecbf03] text-xs font-semibold truncate">{setorNome}</p>
            </div>
          </div>
          <span className="flex-shrink-0 text-xs font-bold text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full">
            {respondidos.length}/{processos.length}
          </span>
        </div>
        {/* Barra de progresso */}
        <div className="h-1 bg-slate-700">
          <div
            className="h-full bg-[#ecbf03] transition-all duration-300"
            style={{ width: processos.length ? `${(respondidos.length / processos.length) * 100}%` : '0%' }}
          />
        </div>
      </header>

      {/* Conteúdo */}
      <main className="max-w-[700px] mx-auto px-4 pt-6 space-y-4">
        <div className="mb-2">
          <h1 className="text-lg font-black text-slate-800">Validação de Diagramas BPMN</h1>
          <p className="text-sm text-slate-500 mt-1">
            Revise cada diagrama abaixo e indique se aprova ou contesta. Contestações precisam de justificativa.
          </p>
        </div>

        {processos.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-sm">
            <p className="text-sm text-slate-400">Nenhum diagrama disponível para validação no momento.</p>
          </div>
        ) : (
          processos.map(p => (
            <ProcessCard
              key={p.id}
              processo={p}
              resposta={respostas[p.id] ?? null}
              onChange={r => handleResponder(p.id, r)}
            />
          ))
        )}
      </main>

      {/* Bottom bar fixo */}
      {processos.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-lg">
          <div className="max-w-[700px] mx-auto px-4 py-4 space-y-3">

            {/* Comentário geral — aparece quando todos respondidos */}
            {todosRespondidos && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Comentário geral (opcional)
                </label>
                <textarea
                  value={comentarioGeral}
                  onChange={e => setComentarioGeral(e.target.value)}
                  placeholder="Observações gerais sobre a validação…"
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700
                    placeholder:text-slate-400 focus:outline-none focus:border-[#ecbf03] focus:ring-2
                    focus:ring-[#ecbf03]/20 resize-none transition-all"
                />
              </div>
            )}

            {submitError && (
              <p className="text-xs text-red-600 font-semibold">{submitError}</p>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-400">
                {!todosRespondidos
                  ? `Responda todos os ${processos.length} diagrama${processos.length > 1 ? 's' : ''} para continuar`
                  : contestacoesIncompletas
                  ? 'Preencha o motivo das contestações'
                  : algumContestado
                  ? `${Object.values(respostas).filter(r => r.acao === 'aprovado').length} aprovado(s), ${Object.values(respostas).filter(r => r.acao === 'contestado').length} contestado(s)`
                  : `Todos os ${processos.length} diagrama${processos.length > 1 ? 's' : ''} aprovados`}
              </p>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!podeEnviar || submitting}
                className="px-6 py-2.5 rounded-xl bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] font-bold
                  text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm
                  shadow-[#ecbf03]/30 flex-shrink-0"
              >
                {submitting ? 'Enviando…' : 'Enviar validação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
