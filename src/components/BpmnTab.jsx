import { useState, useEffect, useMemo } from 'react'
import {
  getSipocsByCliente,
  getAllFasesHistorico,
  iniciarFase,
  pausarFase,
  retomarFase,
  concluirFase,
  avancarFase,
  salvarParecerRevisao,
  atualizarBpmnCampos,
  gerarTokenValidacaoBpmn,
  getTokenValidacaoBpmnBySetor,
  revogarTokenValidacaoBpmn,
  getContestacoesPendentes,
  decidirContestacao,
  avancarFaseParaRetrabalho,
} from '../lib/db'

// ── Configuração de fases ─────────────────────────────────────────────────────

const FASE_CFG = {
  mapeamento_as_is: { label: 'BPMN As-Is',    cor: 'bg-sky-100 text-sky-700 border-sky-200',         hasTimer: true  },
  revisao:          { label: 'Em Revisão',     cor: 'bg-violet-100 text-violet-700 border-violet-200', hasTimer: true  },
  validacao:        { label: 'Em Validação',   cor: 'bg-amber-100 text-amber-700 border-amber-200',   hasTimer: false },
  retrabalho:       { label: 'Retrabalho',     cor: 'bg-orange-100 text-orange-700 border-orange-200', hasTimer: true  },
  concluido:        { label: 'Concluído',      cor: 'bg-green-100 text-green-700 border-green-200',   hasTimer: false },
}

const FASE_ORDER = ['mapeamento_as_is', 'revisao', 'retrabalho', 'validacao', 'concluido']

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTempo(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function getFaseAtiva(rows) {
  return (rows ?? []).find(r => r.status === 'em_andamento' || r.status === 'pausado') ?? null
}

// ── Modal Parecer ─────────────────────────────────────────────────────────────

function ModalParecer({ sipoc, onSave, onClose }) {
  const existing = sipoc.bpmn_revisao_parecer
  const [resultado,   setResultado]   = useState(existing?.resultado ?? '')
  const [observacoes, setObservacoes] = useState(existing?.observacoes ?? '')
  const [saving,      setSaving]      = useState(false)

  const handleSave = async () => {
    if (!resultado) return
    setSaving(true)
    try { await onSave(sipoc.id, { resultado, observacoes: observacoes.trim() || null }) }
    catch (err) { alert('Erro: ' + err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4"
         onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Parecer de Revisão</p>
          <h3 className="font-bold text-slate-800 text-base leading-tight">{sipoc.nome_processo}</h3>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Resultado <span className="text-red-400">*</span>
          </label>
          <div className="space-y-1.5">
            {[
              { value: 'aprovado',             label: 'Aprovado',                      cls: 'border-green-300 bg-green-50 text-green-800' },
              { value: 'aprovado_com_ajustes', label: 'Aprovado com ajustes',           cls: 'border-amber-300 bg-amber-50 text-amber-800' },
              { value: 'reprovado',            label: 'Reprovado — requer retrabalho', cls: 'border-red-300 bg-red-50 text-red-800' },
            ].map(opt => (
              <label key={opt.value}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all
                  ${resultado === opt.value ? opt.cls + ' border-2' : 'border-slate-200 hover:border-slate-300'}`}>
                <input type="radio" name="resultado" value={opt.value}
                  checked={resultado === opt.value} onChange={() => setResultado(opt.value)}
                  className="accent-[#16253e]" />
                <span className="text-sm font-semibold">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Observações</label>
          <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={3}
            placeholder="Pontos de atenção, ajustes necessários…"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none
              focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all placeholder:text-slate-400 resize-none" />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-all">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !resultado}
            className="flex-1 py-2.5 rounded-xl bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] font-bold text-sm transition-all disabled:opacity-50 shadow-sm shadow-[#ecbf03]/30">
            {saving ? 'Salvando…' : 'Salvar parecer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal Histórico ───────────────────────────────────────────────────────────

const STATUS_HIST_LABEL = { planejado: 'Planejado', em_andamento: 'Em andamento', pausado: 'Pausado', concluido: 'Concluído' }
const STATUS_HIST_CLS   = {
  planejado: 'text-slate-500 bg-slate-100', em_andamento: 'text-green-700 bg-green-100',
  pausado: 'text-amber-700 bg-amber-100',   concluido: 'text-blue-700 bg-blue-100',
}

function ModalHistorico({ sipoc, rows, onClose }) {
  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4"
         onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[80vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Histórico de fases</p>
            <h3 className="font-bold text-slate-800 text-base leading-tight">{sipoc.nome_processo}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 space-y-3">
          {rows.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-slate-400">Nenhum registro de fase ainda.</p>
            </div>
          ) : rows.map(row => {
            const cfg = FASE_CFG[row.fase] ?? FASE_CFG.mapeamento_as_is
            return (
              <div key={row.id} className="border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.cor}`}>{cfg.label}</span>
                    {row.ciclo > 1 && (
                      <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        Ciclo {row.ciclo}
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_HIST_CLS[row.status]}`}>
                    {STATUS_HIST_LABEL[row.status]}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                  {row.iniciado_em && (
                    <div><span className="font-semibold">Início: </span>
                      {new Date(row.iniciado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                  {row.encerrado_em && (
                    <div><span className="font-semibold">Fim: </span>
                      {new Date(row.encerrado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
                {row.duracao_segundos > 0 && (
                  <p className="text-xs text-slate-500">
                    <span className="font-semibold">Tempo total: </span>{formatTempo(row.duracao_segundos)}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── ProcessCard ───────────────────────────────────────────────────────────────

function ProcessCard({ sipoc, setorNome, faseRows, consultorId, onFaseUpdate, onSipocUpdate, onParecer, onHistorico }) {
  const faseAtual  = sipoc.bpmn_fase_atual ?? 'mapeamento_as_is'
  const faseCfg    = FASE_CFG[faseAtual] ?? FASE_CFG.mapeamento_as_is

  // Only look at rows for the current phase
  const currentFaseRows = (faseRows ?? []).filter(r => r.fase === faseAtual)
  const faseAtiva  = getFaseAtiva(currentFaseRows)
  const isRunning  = faseAtiva?.status === 'em_andamento'
  const isPaused   = faseAtiva?.status === 'pausado'
  const temConcluido = currentFaseRows.some(r => r.status === 'concluido')

  const [loading,     setLoading]     = useState(false)
  const [showFields,  setShowFields]  = useState(false)
  const [driveUrl,    setDriveUrl]    = useState(sipoc.bpmn_drive_url ?? '')
  const [dataPrev,    setDataPrev]    = useState(sipoc.bpmn_data_prevista ?? '')
  const [responsavel, setResponsavel] = useState(sipoc.bpmn_responsavel ?? '')
  const [savedOk,     setSavedOk]     = useState(false)

  const wrap = async (fn) => {
    setLoading(true)
    try { await fn() } catch (err) { alert('Erro: ' + err.message) }
    finally { setLoading(false) }
  }

  const handleIniciar = () => wrap(async () => {
    const row = await iniciarFase(sipoc.id, faseAtual, consultorId)
    onFaseUpdate(sipoc.id, row)
  })

  const handlePausar = () => wrap(async () => {
    const row = await pausarFase(faseAtiva.id)
    onFaseUpdate(sipoc.id, row)
  })

  const handleRetomar = () => wrap(async () => {
    const row = await retomarFase(faseAtiva.id)
    onFaseUpdate(sipoc.id, row)
  })

  // Só para o timer — usado na fase de revisão (com timer ativo)
  const handleConcluirFase = () => wrap(async () => {
    const row = await concluirFase(faseAtiva.id)
    onFaseUpdate(sipoc.id, row)
  })

  // Marca revisão como concluída sem timer ativo (inicia e conclui imediatamente para registrar)
  const handleConcluirSemTimer = () => wrap(async () => {
    const startRow = await iniciarFase(sipoc.id, faseAtual, consultorId)
    const endRow = await concluirFase(startRow.id)
    onFaseUpdate(sipoc.id, endRow)
  })

  // Para o timer E avança para a próxima fase — usado em mapeamento_as_is e retrabalho
  const handleConcluirEAvancar = (destino) => wrap(async () => {
    if (faseAtiva && (isRunning || isPaused)) {
      await concluirFase(faseAtiva.id)
    }
    const row = await avancarFase(sipoc.id, destino, consultorId)
    onSipocUpdate(sipoc.id, { bpmn_fase_atual: destino }, row)
  })

  // Usado nos botões manuais de validação (Rejeitar/Aprovar pelo consultor)
  const handleAvancarValidacao = (destino) => wrap(async () => {
    if (faseAtiva && (isRunning || isPaused)) await concluirFase(faseAtiva.id)
    const row = await avancarFase(sipoc.id, destino, consultorId)
    onSipocUpdate(sipoc.id, { bpmn_fase_atual: destino }, row)
  })

  const handleSalvarCampos = async () => {
    try {
      await atualizarBpmnCampos(sipoc.id, { bpmn_drive_url: driveUrl, bpmn_data_prevista: dataPrev, bpmn_responsavel: responsavel })
      onSipocUpdate(sipoc.id, { bpmn_drive_url: driveUrl, bpmn_data_prevista: dataPrev || null, bpmn_responsavel: responsavel })
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2000)
    } catch (err) { alert('Erro: ' + err.message) }
  }

  // Badge de status
  const badgeLabel = isRunning ? 'Em andamento' : isPaused ? 'Pausado' : temConcluido ? 'Concluído' : 'Não iniciado'
  const badgeCls   = isRunning
    ? 'bg-green-100 text-green-700'
    : isPaused
    ? 'bg-amber-100 text-amber-700'
    : temConcluido
    ? 'bg-blue-100 text-blue-700'
    : 'bg-slate-200 text-slate-500'

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 text-sm leading-tight truncate">{sipoc.nome_processo}</p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {setorNome && (
              <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {setorNome}
              </span>
            )}
            {sipoc.bpmn_data_prevista && (
              <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                📅 {new Date(sipoc.bpmn_data_prevista + 'T00:00:00').toLocaleDateString('pt-BR')}
              </span>
            )}
            {sipoc.bpmn_responsavel && (
              <span className="text-[10px] text-slate-400">• {sipoc.bpmn_responsavel}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {sipoc.bpmn_drive_url && (
            <a href={sipoc.bpmn_drive_url} target="_blank" rel="noopener noreferrer"
               title="Abrir diagrama no Drive"
               className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-[#ecbf03] hover:bg-slate-50 transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
          <button onClick={() => setShowFields(v => !v)} title="Editar informações"
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all
              ${showFields ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Campos editáveis */}
      {showFields && (
        <div className="border border-slate-100 rounded-xl p-3 space-y-3 bg-slate-50">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Data prevista</label>
              <input type="date" value={dataPrev} onChange={e => setDataPrev(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white outline-none focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Responsável</label>
              <input type="text" value={responsavel} onChange={e => setResponsavel(e.target.value)} placeholder="Consultor responsável"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white outline-none focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all placeholder:text-slate-400" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Link do diagrama (Google Drive)</label>
            <input type="url" value={driveUrl} onChange={e => setDriveUrl(e.target.value)} placeholder="https://drive.google.com/…"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white outline-none focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all placeholder:text-slate-400" />
          </div>
          <button onClick={handleSalvarCampos}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all">
            {savedOk ? '✓ Salvo' : 'Salvar'}
          </button>
        </div>
      )}

      {/* Controles de timer — fases com hasTimer */}
      {faseCfg.hasTimer && (
        <div className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-4 py-3">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badgeCls}`}>
            {badgeLabel}
          </span>
          <div className="flex items-center gap-2">

            {/* Iniciar — quando não há fase ativa e não concluído ainda */}
            {!faseAtiva && !temConcluido && (
              <button onClick={handleIniciar} disabled={loading}
                className="px-3 py-1.5 rounded-xl bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] text-xs font-bold transition-all disabled:opacity-50 shadow-sm shadow-[#ecbf03]/30">
                Iniciar
              </button>
            )}

            {/* Pausar — quando rodando */}
            {isRunning && (
              <button onClick={handlePausar} disabled={loading}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all disabled:opacity-50">
                Pausar
              </button>
            )}

            {/* Retomar — quando pausado */}
            {isPaused && (
              <button onClick={handleRetomar} disabled={loading}
                className="px-3 py-1.5 rounded-xl bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] text-xs font-bold transition-all disabled:opacity-50 shadow-sm shadow-[#ecbf03]/30">
                Retomar
              </button>
            )}

            {/* Concluído — comportamento diferente por fase */}
            {(isRunning || isPaused) && (
              <>
                {faseAtual === 'mapeamento_as_is' && (
                  <button onClick={() => handleConcluirEAvancar('revisao')} disabled={loading}
                    className="px-3 py-1.5 rounded-xl bg-[#16253e] hover:bg-[#0d1a2b] text-white text-xs font-bold transition-all disabled:opacity-50">
                    Concluído
                  </button>
                )}
                {faseAtual === 'revisao' && (
                  <button onClick={handleConcluirFase} disabled={loading}
                    className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-all disabled:opacity-50">
                    Concluído
                  </button>
                )}
                {faseAtual === 'retrabalho' && (
                  <button onClick={() => handleConcluirEAvancar('concluido')} disabled={loading}
                    className="px-3 py-1.5 rounded-xl bg-[#16253e] hover:bg-[#0d1a2b] text-white text-xs font-bold transition-all disabled:opacity-50">
                    Concluído
                  </button>
                )}
              </>
            )}

            {/* Se não iniciado mas em mapeamento_as_is — permite avançar direto (sem timer) */}
            {!faseAtiva && temConcluido && faseAtual === 'mapeamento_as_is' && (
              <button onClick={() => handleConcluirEAvancar('revisao')} disabled={loading}
                className="px-3 py-1.5 rounded-xl bg-[#16253e] hover:bg-[#0d1a2b] text-white text-xs font-bold transition-all disabled:opacity-50">
                Avançar para revisão →
              </button>
            )}

            {/* Em revisão sem timer ativo — permite concluir sem iniciar o timer */}
            {faseAtual === 'revisao' && !faseAtiva && !temConcluido && (
              <button onClick={handleConcluirSemTimer} disabled={loading}
                className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-all disabled:opacity-50">
                Concluído
              </button>
            )}
          </div>
        </div>
      )}

      {/* Aguardando validação */}
      {faseAtual === 'validacao' && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-700">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Aguardando aprovação do cliente via link de validação.</span>
        </div>
      )}

      {/* Concluído */}
      {faseAtual === 'concluido' && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 text-xs text-green-700">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className="font-semibold">Processo BPMN concluído.</span>
          {sipoc.bpmn_validado_por && <span>Aprovado por {sipoc.bpmn_validado_por}.</span>}
        </div>
      )}

      {/* Parecer de revisão */}
      {(faseAtual === 'revisao' || faseAtual === 'retrabalho') && sipoc.bpmn_revisao_parecer?.resultado && (
        <div className={`px-3 py-2 rounded-xl border text-xs font-medium
          ${sipoc.bpmn_revisao_parecer.resultado === 'aprovado' ? 'bg-green-50 border-green-200 text-green-700'
            : sipoc.bpmn_revisao_parecer.resultado === 'reprovado' ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
          Parecer: {
            sipoc.bpmn_revisao_parecer.resultado === 'aprovado' ? 'Aprovado' :
            sipoc.bpmn_revisao_parecer.resultado === 'reprovado' ? 'Reprovado' : 'Aprovado com ajustes'
          }
          {sipoc.bpmn_revisao_parecer.observacoes && (
            <span className="opacity-75"> — {sipoc.bpmn_revisao_parecer.observacoes}</span>
          )}
        </div>
      )}

      {/* Rodapé — histórico, parecer, ações de validação */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
        <div className="flex gap-2">
          <button onClick={() => onHistorico(sipoc)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-all flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Histórico
          </button>
          {(faseAtual === 'revisao' || faseAtual === 'retrabalho') && (
            <button onClick={() => onParecer(sipoc)}
              className="px-3 py-1.5 rounded-lg border border-violet-200 text-xs font-semibold text-violet-600 hover:bg-violet-50 transition-all flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Parecer
            </button>
          )}
        </div>
        {/* Ações manuais na fase de validação (consultor decide após contestação) */}
        {faseAtual === 'validacao' && (
          <div className="flex gap-2">
            <button onClick={() => handleAvancarValidacao('retrabalho')} disabled={loading}
              className="px-3 py-1.5 rounded-xl border border-red-200 text-xs font-bold text-red-600 hover:bg-red-50 transition-all disabled:opacity-50">
              Rejeitar
            </button>
            <button onClick={() => handleAvancarValidacao('concluido')} disabled={loading}
              className="px-3 py-1.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-bold transition-all disabled:opacity-50">
              Aprovar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── ContestacaoCard ───────────────────────────────────────────────────────────

function ContestacaoCard({ contestacao, consultorId, onDecidido }) {
  const [loading, setLoading] = useState(false)
  const sipocNome = contestacao.sipocs?.nome_processo ?? '—'
  const setorNome = contestacao.sipocs?.setores?.nome ?? '—'
  const dataStr   = contestacao.criado_em ? new Date(contestacao.criado_em).toLocaleDateString('pt-BR') : ''

  const handleDecidir = async (decisao) => {
    if (!window.confirm(
      decisao === 'aceito'
        ? 'Aceitar contestação? O processo voltará para Retrabalho.'
        : 'Manter validação? O diagrama será considerado aprovado mesmo com a contestação.'
    )) return
    setLoading(true)
    try {
      await decidirContestacao(contestacao.id, decisao, consultorId)
      let novaFaseRow = null
      if (decisao === 'aceito') novaFaseRow = await avancarFaseParaRetrabalho(contestacao.sipoc_id, consultorId)
      onDecidido(contestacao.id, decisao, novaFaseRow)
    } catch (err) { alert('❌ ' + err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="bg-white rounded-2xl border-l-4 border-l-red-500 border border-slate-200 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 text-sm truncate">{sipocNome}</p>
          <p className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full inline-block mt-0.5">{setorNome}</p>
        </div>
        {dataStr && <p className="text-[10px] text-slate-400 flex-shrink-0">{dataStr}</p>}
      </div>
      {contestacao.comentario && (
        <p className="text-xs text-slate-600 italic bg-red-50 px-3 py-2 rounded-lg mb-3 border border-red-100">
          "{contestacao.comentario}"
        </p>
      )}
      <div className="flex gap-2">
        <button onClick={() => handleDecidir('aceito')} disabled={loading}
          className="flex-1 py-2 rounded-xl border border-red-300 text-red-700 text-xs font-bold hover:bg-red-50 transition-all disabled:opacity-50">
          Aceitar contestação
        </button>
        <button onClick={() => handleDecidir('rejeitado')} disabled={loading}
          className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition-all disabled:opacity-50">
          Manter validado
        </button>
      </div>
    </div>
  )
}

// ── ValidacaoSetorPanel ───────────────────────────────────────────────────────

function ValidacaoSetorPanel({ setorNome, setorId }) {
  const [token,      setToken]      = useState(undefined)
  const [tokenLoad,  setTokenLoad]  = useState(true)
  const [generating, setGenerating] = useState(false)
  const [revoking,   setRevoking]   = useState(false)
  const [copied,     setCopied]     = useState(false)

  useEffect(() => {
    if (!setorId) { setTokenLoad(false); setToken(null); return }
    getTokenValidacaoBpmnBySetor(setorId)
      .then(t => setToken(t ?? null)).catch(() => setToken(null)).finally(() => setTokenLoad(false))
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
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const handleRevogar = async () => {
    if (!window.confirm(`Revogar o link de validação do setor "${setorNome}"?`)) return
    setRevoking(true)
    try { await revogarTokenValidacaoBpmn(token.id); setToken(null) }
    catch (err) { alert('❌ ' + err.message) }
    finally { setRevoking(false) }
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
      <p className="text-xs text-slate-500 font-medium">Link de validação para o cliente</p>
      <div className="flex items-center gap-2">
        {tokenLoad ? (
          <span className="text-[10px] text-slate-400">Verificando…</span>
        ) : token ? (
          <>
            <span className="text-[10px] text-amber-600 font-semibold">
              Ativo · expira {new Date(token.expira_em).toLocaleDateString('pt-BR')}
            </span>
            <button onClick={handleCopy}
              className="px-2.5 py-1 rounded-lg border border-slate-200 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 bg-white transition-all">
              {copied ? '✅ Copiado' : 'Copiar'}
            </button>
            <button onClick={handleRevogar} disabled={revoking}
              className="px-2.5 py-1 rounded-lg border border-red-200 text-[10px] font-semibold text-red-500 hover:bg-red-50 bg-white transition-all disabled:opacity-50">
              Revogar
            </button>
          </>
        ) : setorId ? (
          <button onClick={handleGerar} disabled={generating}
            className="px-3 py-1.5 rounded-lg bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] font-bold text-[10px] transition-all disabled:opacity-50">
            {generating ? 'Gerando…' : 'Gerar link de validação'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

// ── RevisaoSetorGroup ─────────────────────────────────────────────────────────

function RevisaoSetorGroup({ setorNome, setorId, processos, fasesMap, consultorId, onFaseUpdate, onSipocUpdate, onParecer, onHistorico }) {
  const [sending, setSending] = useState(false)

  const concluidos = processos.filter(s =>
    (fasesMap[s.id] ?? []).some(r => r.fase === 'revisao' && r.status === 'concluido')
  ).length
  const total = processos.length
  const podeEnviar = concluidos === total && total > 0

  const handleSeguirValidacao = async () => {
    if (!window.confirm(`Enviar ${total} processo${total > 1 ? 's' : ''} do setor "${setorNome}" para validação do cliente?`)) return
    setSending(true)
    try {
      for (const sipoc of processos) {
        const row = await avancarFase(sipoc.id, 'validacao', consultorId)
        onSipocUpdate(sipoc.id, { bpmn_fase_atual: 'validacao', bpmn_status: 'enviado_validacao' }, row)
      }
      const tokenObj = await gerarTokenValidacaoBpmn(setorId)
      await navigator.clipboard.writeText(tokenObj.url)
      alert(`✅ Enviado para validação!\n\nLink copiado:\n${tokenObj.url}`)
    } catch (err) { alert('❌ ' + err.message) }
    finally { setSending(false) }
  }

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      {/* Cabeçalho do setor */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">{setorNome}</span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full
          ${podeEnviar ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
          {concluidos}/{total} revisados
        </span>
      </div>

      {/* Processos */}
      <div className="p-3 space-y-2.5 bg-white">
        {processos.map(sipoc => (
          <ProcessCard
            key={sipoc.id}
            sipoc={sipoc}
            setorNome={null}
            faseRows={fasesMap[sipoc.id] ?? []}
            consultorId={consultorId}
            onFaseUpdate={onFaseUpdate}
            onSipocUpdate={onSipocUpdate}
            onParecer={onParecer}
            onHistorico={onHistorico}
          />
        ))}
      </div>

      {/* Rodapé — botão "Seguir para Validação" */}
      {podeEnviar && (
        <div className="px-4 py-3 bg-green-50 border-t border-green-200">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-green-700 font-medium">
              Todos os processos revisados — pronto para validação do cliente
            </p>
            <button onClick={handleSeguirValidacao} disabled={sending}
              className="px-4 py-2 rounded-xl bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] font-bold text-xs
                transition-all disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0 shadow-sm shadow-[#ecbf03]/30">
              {sending ? 'Enviando…' : 'Seguir para Validação'}
              {!sending && (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── FaseSection ───────────────────────────────────────────────────────────────

function FaseSection({ fase, processos, fasesMap, consultorId, onFaseUpdate, onSipocUpdate, onParecer, onHistorico }) {
  const faseCfg  = FASE_CFG[fase] ?? FASE_CFG.mapeamento_as_is
  const [expanded, setExpanded] = useState(fase !== 'concluido')

  if (processos.length === 0) return null

  // Agrupa por setor nas fases revisao e validacao
  const setorGroups = (fase === 'revisao' || fase === 'validacao')
    ? Object.entries(
        processos.reduce((acc, p) => {
          const k = p.setor_nome ?? 'Geral'
          if (!acc[k]) acc[k] = { setorId: p.setor_id ?? null, processos: [] }
          acc[k].processos.push(p)
          return acc
        }, {})
      )
    : null

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header da seção */}
      <button type="button" onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 bg-slate-50 hover:bg-slate-100 transition-all text-left">
        <div className="flex items-center gap-3">
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${faseCfg.cor}`}>
            {faseCfg.label}
          </span>
          <span className="text-[10px] font-semibold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-full">
            {processos.length} {processos.length === 1 ? 'processo' : 'processos'}
          </span>
        </div>
        <svg className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Conteúdo */}
      {expanded && (
        <div className="p-4 space-y-4 bg-white">
          {setorGroups ? (
            setorGroups.map(([setorNome, { setorId, processos: setorProcs }]) => (
              fase === 'revisao' ? (
                <RevisaoSetorGroup
                  key={setorNome}
                  setorNome={setorNome}
                  setorId={setorId}
                  processos={setorProcs}
                  fasesMap={fasesMap}
                  consultorId={consultorId}
                  onFaseUpdate={onFaseUpdate}
                  onSipocUpdate={onSipocUpdate}
                  onParecer={onParecer}
                  onHistorico={onHistorico}
                />
              ) : (
                <div key={setorNome} className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                    <span className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">{setorNome}</span>
                  </div>
                  <div className="p-3 space-y-2.5 bg-white">
                    {setorProcs.map(sipoc => (
                      <ProcessCard key={sipoc.id} sipoc={sipoc} setorNome={null}
                        faseRows={fasesMap[sipoc.id] ?? []} consultorId={consultorId}
                        onFaseUpdate={onFaseUpdate} onSipocUpdate={onSipocUpdate}
                        onParecer={onParecer} onHistorico={onHistorico} />
                    ))}
                    <ValidacaoSetorPanel setorNome={setorNome} setorId={setorId} />
                  </div>
                </div>
              )
            ))
          ) : (
            processos.map(sipoc => (
              <ProcessCard key={sipoc.id} sipoc={sipoc} setorNome={sipoc.setor_nome ?? ''}
                faseRows={fasesMap[sipoc.id] ?? []} consultorId={consultorId}
                onFaseUpdate={onFaseUpdate} onSipocUpdate={onSipocUpdate}
                onParecer={onParecer} onHistorico={onHistorico} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── BpmnTab ───────────────────────────────────────────────────────────────────

export default function BpmnTab({ clienteId, consultorId }) {
  const [sipocs,         setSipocs]         = useState([])
  const [fasesMap,       setFasesMap]       = useState({})
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState(null)
  const [parecerModal,   setParecerModal]   = useState(null)
  const [historicoModal, setHistoricoModal] = useState(null)
  const [contestacoes,   setContestacoes]   = useState([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true); setError(null)
      try {
        const s = await getSipocsByCliente(clienteId)
        if (cancelled) return
        setSipocs(s)
        if (s.length) {
          const fm = await getAllFasesHistorico(s.map(x => x.id))
          if (!cancelled) setFasesMap(fm)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [clienteId])

  useEffect(() => {
    if (!clienteId) return
    getContestacoesPendentes(clienteId)
      .then(data => setContestacoes(data)).catch(() => {})
  }, [clienteId])

  const handleFaseUpdate = (sipocId, updatedRow) => {
    setFasesMap(prev => {
      const existing = prev[sipocId] ?? []
      const idx = existing.findIndex(r => r.id === updatedRow.id)
      if (idx >= 0) {
        const rows = [...existing]; rows[idx] = updatedRow
        return { ...prev, [sipocId]: rows }
      }
      return { ...prev, [sipocId]: [updatedRow, ...existing] }
    })
  }

  const handleSipocUpdate = (sipocId, newFields, newFaseRow) => {
    setSipocs(prev => prev.map(s => s.id === sipocId ? { ...s, ...newFields } : s))
    if (newFaseRow) {
      setFasesMap(prev => ({ ...prev, [sipocId]: [newFaseRow, ...(prev[sipocId] ?? [])] }))
    }
  }

  const handleSalvarParecer = async (sipocId, parecer) => {
    await salvarParecerRevisao(sipocId, parecer)
    setSipocs(prev => prev.map(s =>
      s.id === sipocId ? { ...s, bpmn_revisao_parecer: parecer, bpmn_revisao_em: new Date().toISOString() } : s
    ))
    setParecerModal(null)
  }

  const byFase = useMemo(() => {
    const map = {}
    for (const s of sipocs) {
      const fase = s.bpmn_fase_atual ?? 'mapeamento_as_is'
      if (!map[fase]) map[fase] = []
      map[fase].push(s)
    }
    return map
  }, [sipocs])

  if (loading) return (
    <div className="p-8 flex items-center justify-center flex-1">
      <div className="text-center space-y-2">
        <div className="w-8 h-8 border-2 border-[#ecbf03] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-slate-400">Carregando processos…</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="p-8 flex-1">
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
        Erro ao carregar: {error}
      </div>
    </div>
  )

  return (
    <div className="p-8 space-y-6 overflow-y-auto flex-1">

      {/* Contestações pendentes */}
      {contestacoes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <p className="text-xs font-black text-slate-700 uppercase tracking-widest">
              Contestações pendentes ({contestacoes.length})
            </p>
          </div>
          {contestacoes.map(c => (
            <ContestacaoCard key={c.id} contestacao={c} consultorId={consultorId}
              onDecidido={(id, decisao, novaFaseRow) => {
                setContestacoes(prev => prev.filter(x => x.id !== id))
                if (decisao === 'aceito' && novaFaseRow) {
                  const sipocId = c.sipoc_id
                  setSipocs(prev => prev.map(s =>
                    s.id === sipocId ? { ...s, bpmn_fase_atual: 'retrabalho', bpmn_status: 'rejeitado' } : s
                  ))
                  setFasesMap(prev => ({ ...prev, [sipocId]: [novaFaseRow, ...(prev[sipocId] ?? [])] }))
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Seções por fase */}
      {sipocs.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
          <p className="text-sm text-slate-400">Nenhum processo cadastrado neste projeto.</p>
          <p className="text-xs text-slate-400 mt-1">Crie processos na aba Mapeamento SIPOC.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {FASE_ORDER.map(fase => (
            <FaseSection key={fase} fase={fase} processos={byFase[fase] ?? []}
              fasesMap={fasesMap} consultorId={consultorId}
              onFaseUpdate={handleFaseUpdate} onSipocUpdate={handleSipocUpdate}
              onParecer={setParecerModal} onHistorico={setHistoricoModal} />
          ))}
        </div>
      )}

      {parecerModal && (
        <ModalParecer sipoc={parecerModal} onSave={handleSalvarParecer} onClose={() => setParecerModal(null)} />
      )}
      {historicoModal && (
        <ModalHistorico sipoc={historicoModal} rows={fasesMap[historicoModal.id] ?? []}
          onClose={() => setHistoricoModal(null)} />
      )}
    </div>
  )
}
