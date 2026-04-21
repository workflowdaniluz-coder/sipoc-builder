import { useState, useEffect, useMemo } from 'react'
import {
  gerarTokenValidacaoBpmn,
  getTokenValidacaoBpmnBySetor,
  revogarTokenValidacaoBpmn,
} from '../lib/db'

const BPMN_STATUS_CFG = {
  concluido:         { label: 'Concluído',            cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  em_revisao:        { label: 'Em revisão',            cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  enviado_validacao: { label: 'Aguard. aprovação',     cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  validado:          { label: 'Aprovado',              cls: 'bg-green-100 text-green-700 border-green-200' },
  rejeitado:         { label: 'Rejeitado',             cls: 'bg-red-100 text-red-700 border-red-200' },
}

const BPMN_ELEGIVEL = new Set(['concluido', 'em_revisao', 'enviado_validacao', 'validado', 'rejeitado'])

// ── SetorValidacaoItem ────────────────────────────────────────────────────────

function SetorValidacaoItem({ setorNome, setorId, processos }) {
  const [token,      setToken]      = useState(undefined) // undefined=loading
  const [tokenLoad,  setTokenLoad]  = useState(true)
  const [generating, setGenerating] = useState(false)
  const [revoking,   setRevoking]   = useState(false)
  const [copied,     setCopied]     = useState(false)

  const emValidacao = processos.filter(p => p.bpmn_fase_atual === 'validacao').length

  useEffect(() => {
    if (!setorId) { setTokenLoad(false); setToken(null); return }
    getTokenValidacaoBpmnBySetor(setorId)
      .then(t => setToken(t ?? null))
      .catch(() => setToken(null))
      .finally(() => setTokenLoad(false))
  }, [setorId])

  const handleGerar = async () => {
    setGenerating(true)
    try {
      const t = await gerarTokenValidacaoBpmn(setorId)
      setToken(t)
      await navigator.clipboard.writeText(t.url)
      alert(`✅ Link gerado e copiado!\n\n${t.url}\n\nEnvie ao responsável do setor.`)
    } catch (err) { alert('❌ ' + err.message) }
    finally { setGenerating(false) }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(token.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRevogar = async () => {
    if (!window.confirm(`Revogar o link de validação do setor "${setorNome}"?`)) return
    setRevoking(true)
    try {
      await revogarTokenValidacaoBpmn(token.id)
      setToken(null)
    } catch (err) { alert('❌ ' + err.message) }
    finally { setRevoking(false) }
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      {/* Cabeçalho do setor */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-700 text-sm">{setorNome}</span>
          <span className="text-[10px] font-semibold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-full">
            {processos.length} {processos.length === 1 ? 'processo' : 'processos'}
          </span>
          {emValidacao > 0 && (
            <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
              {emValidacao} em validação
            </span>
          )}
        </div>
      </div>

      {/* Gestão de token de validação */}
      {emValidacao > 0 && (
        <div className="px-4 py-3 border-b border-slate-100 bg-amber-50">
          <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2">
            Link de validação por setor
          </p>
          {tokenLoad ? (
            <p className="text-xs text-slate-400">Verificando…</p>
          ) : token ? (
            <div className="space-y-2">
              <p className="font-mono text-[10px] text-slate-500 bg-white px-2.5 py-1.5 rounded-lg truncate border border-slate-200">
                {token.url}
              </p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-amber-700">
                  Expira {new Date(token.expira_em).toLocaleDateString('pt-BR')}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopy}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold
                      text-slate-600 hover:bg-slate-50 bg-white transition-all"
                  >
                    {copied ? '✅ Copiado' : 'Copiar'}
                  </button>
                  <button
                    onClick={handleRevogar}
                    disabled={revoking}
                    className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-semibold
                      text-red-500 hover:bg-red-50 bg-white transition-all disabled:opacity-50"
                  >
                    Revogar
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={handleGerar}
              disabled={generating || !setorId}
              className="w-full py-2.5 rounded-xl bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e]
                font-bold text-sm transition-all disabled:opacity-50 shadow-sm shadow-[#ecbf03]/30"
            >
              {generating ? 'Gerando…' : 'Gerar link de validação'}
            </button>
          )}
        </div>
      )}

      {/* Lista de processos */}
      <div className="divide-y divide-slate-100">
        {processos.map(p => {
          const sc = BPMN_STATUS_CFG[p.bpmn_status] ?? BPMN_STATUS_CFG.concluido
          return (
            <div key={p.supabase_id || p.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-700 truncate">{p.name}</p>
                {p.bpmn_status === 'validado' && p.bpmn_validado_por && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Aprovado por {p.bpmn_validado_por}
                    {p.bpmn_validado_em &&
                      ` em ${new Date(p.bpmn_validado_em).toLocaleDateString('pt-BR')}`}
                  </p>
                )}
                {p.bpmn_status === 'rejeitado' && p.bpmn_validacao_comentario && (
                  <p className="text-[10px] text-red-500 mt-0.5 italic truncate">
                    "{p.bpmn_validacao_comentario}"
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {p.bpmn_drive_url && (
                  <a
                    href={p.bpmn_drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir diagrama"
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
          )
        })}
      </div>
    </div>
  )
}

// ── BpmnAcessosPanel ──────────────────────────────────────────────────────────

export default function BpmnAcessosPanel({ processes }) {
  // Agrupar por setor, incluindo apenas processos elegíveis
  const bySetor = useMemo(() => {
    const elegíveis = (processes || []).filter(p =>
      p.bpmn_status && BPMN_ELEGIVEL.has(p.bpmn_status)
    )
    const map = new Map()
    for (const p of elegíveis) {
      const key = p.setor ?? 'Geral'
      if (!map.has(key)) map.set(key, { setorId: p.setor_id ?? null, processos: [] })
      map.get(key).processos.push(p)
    }
    return Array.from(map.entries())
  }, [processes])

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-4">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Validação BPMN
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Links de aprovação por setor. Um único link cobre todos os diagramas em validação do setor.
          </p>
        </div>

        {bySetor.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
            <p className="text-sm text-slate-400">Nenhum processo aprovado para validação ainda.</p>
            <p className="text-xs text-slate-400 mt-1">
              Conclua a revisão na aba BPMN para liberar os links.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {bySetor.map(([setorNome, { setorId, processos }]) => (
              <SetorValidacaoItem
                key={setorNome}
                setorNome={setorNome}
                setorId={setorId}
                processos={processos}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export { BPMN_ELEGIVEL }
