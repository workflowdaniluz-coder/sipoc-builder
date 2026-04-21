import { useState, useEffect } from 'react'
import { gerarTokenValidacao, getTokenValidacaoBySipoc, revogarTokenValidacao } from '../lib/db'

// Cores dos badges de status BPMN — consistente com a aba BPMN
const BPMN_STATUS_CFG = {
  concluido:          { label: 'Concluído',           cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  em_revisao:         { label: 'Em revisão',           cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  enviado_validacao:  { label: 'Aguardando aprovação', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  validado:           { label: 'Aprovado',             cls: 'bg-green-100 text-green-700 border-green-200' },
  rejeitado:          { label: 'Rejeitado',            cls: 'bg-red-100 text-red-700 border-red-200' },
}

const BPMN_ELEGIVEL = new Set(['concluido','em_revisao','enviado_validacao','validado','rejeitado'])

// ── ProcessoValidacaoItem ─────────────────────────────────────────────────────

function ProcessoValidacaoItem({ processo }) {
  const [token,       setToken]       = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [generating,  setGenerating]  = useState(false)
  const [copiedId,    setCopiedId]    = useState(false)
  const [revogando,   setRevogando]   = useState(false)

  const sipocId = processo.supabase_id || processo.id

  useEffect(() => {
    if (!sipocId || sipocId.startsWith('p')) { setLoading(false); return }
    getTokenValidacaoBySipoc(sipocId)
      .then(setToken)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [sipocId])

  const handleGerar = async () => {
    setGenerating(true)
    try {
      const t = await gerarTokenValidacao(sipocId)
      setToken(t)
      await navigator.clipboard.writeText(t.url)
      alert(`✅ Link gerado e copiado!\n\nLink: ${t.url}\n\nEnvie ao responsável do setor.`)
    } catch (err) { alert('❌ ' + err.message) }
    finally { setGenerating(false) }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(token.url)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  const handleRevogar = async () => {
    if (!window.confirm('Revogar este link de validação?')) return
    setRevogando(true)
    try {
      await revogarTokenValidacao(token.id)
      setToken(null)
    } catch (err) { alert('❌ ' + err.message) }
    finally { setRevogando(false) }
  }

  const sc = BPMN_STATUS_CFG[processo.bpmn_status] ?? BPMN_STATUS_CFG.concluido

  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
      {/* Header do processo */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 text-sm truncate">{processo.name}</p>
          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {processo.setor}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {processo.bpmn_drive_url && (
            <a
              href={processo.bpmn_drive_url}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir diagrama no Drive"
              className="text-slate-400 hover:text-[#ecbf03] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sc.cls}`}>
            {sc.label}
          </span>
        </div>
      </div>

      {/* Conteúdo condicional por status */}
      {(processo.bpmn_status === 'concluido' || processo.bpmn_status === 'em_revisao') && (
        <p className="text-xs text-slate-400 italic">
          Disponível após aprovação do consultor.
        </p>
      )}

      {processo.bpmn_status === 'enviado_validacao' && (
        loading ? (
          <p className="text-xs text-slate-400">Carregando…</p>
        ) : token ? (
          <div className="space-y-2">
            <p className="font-mono text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg truncate border border-slate-200">
              {token.url}
            </p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] text-slate-400">
                Expira em {new Date(token.expira_em).toLocaleDateString('pt-BR')}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold
                    text-slate-600 hover:bg-slate-50 transition-all"
                >
                  {copiedId ? '✅ Copiado' : 'Copiar link'}
                </button>
                <button
                  onClick={handleRevogar}
                  disabled={revogando}
                  className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-semibold
                    text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
                >
                  Revogar
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={handleGerar}
            disabled={generating || !sipocId || sipocId.startsWith('p')}
            className="w-full py-2.5 rounded-xl bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e]
              font-bold text-sm transition-all disabled:opacity-50 shadow-sm shadow-[#ecbf03]/30"
          >
            {generating ? 'Gerando…' : 'Gerar link de validação'}
          </button>
        )
      )}

      {processo.bpmn_status === 'validado' && (
        <div className="space-y-1">
          <p className="text-xs text-green-700 font-semibold">
            Aprovado por {processo.bpmn_validado_por}
            {processo.bpmn_validado_em &&
              ` em ${new Date(processo.bpmn_validado_em).toLocaleDateString('pt-BR')}`}
          </p>
          {processo.bpmn_validacao_comentario && (
            <p className="text-xs text-slate-500 italic">
              "{processo.bpmn_validacao_comentario}"
            </p>
          )}
        </div>
      )}

      {processo.bpmn_status === 'rejeitado' && (
        <div className="space-y-2">
          {processo.bpmn_validacao_comentario && (
            <p className="text-xs text-slate-500 italic">
              "{processo.bpmn_validacao_comentario}"
            </p>
          )}
          {loading ? (
            <p className="text-xs text-slate-400">Carregando…</p>
          ) : !token ? (
            <button
              onClick={handleGerar}
              disabled={generating || !sipocId || sipocId.startsWith('p')}
              className="w-full py-2 rounded-xl border border-[#ecbf03] text-[#16253e]
                font-bold text-sm hover:bg-[#ecbf03]/10 transition-all disabled:opacity-50"
            >
              {generating ? 'Gerando…' : 'Gerar novo link (após correção)'}
            </button>
          ) : (
            <div className="space-y-2">
              <p className="font-mono text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg truncate border border-slate-200">
                {token.url}
              </p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-slate-400">
                  Expira em {new Date(token.expira_em).toLocaleDateString('pt-BR')}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopy}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold
                      text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    {copiedId ? '✅ Copiado' : 'Copiar link'}
                  </button>
                  <button
                    onClick={handleRevogar}
                    disabled={revogando}
                    className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-semibold
                      text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
                  >
                    Revogar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── BpmnAcessosPanel ─────────────────────────────────────────────────────────

export default function BpmnAcessosPanel({ processes }) {
  const elegiveis = (processes || []).filter(p =>
    p.bpmn_status && BPMN_ELEGIVEL.has(p.bpmn_status)
  )

  return (
    <div className="space-y-6">

      {/* ── Seção 1: Acesso SIPOC ─────────────────────────────────── */}
      {/* Renderizado pelo TokenPanel no App.jsx — aqui só seção BPMN */}

      {/* ── Seção 2: Validação BPMN ───────────────────────────────── */}
      <div>
        <div className="mb-4">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Validação BPMN
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Links para aprovação dos diagramas pelo responsável do setor.
          </p>
        </div>

        {elegiveis.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
            <p className="text-sm text-slate-400">
              Nenhum processo aprovado para validação ainda.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Conclua a revisão na aba BPMN para liberar os links.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {elegiveis.map(p => (
              <ProcessoValidacaoItem key={p.supabase_id || p.id} processo={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export { BPMN_ELEGIVEL }
