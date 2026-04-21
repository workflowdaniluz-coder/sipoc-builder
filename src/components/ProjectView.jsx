import { useState } from 'react'
import { atualizarCliente } from '../lib/db'
import { STATUS_CONFIG } from '../lib/constants'

// ── helpers ──────────────────────────────────────────────────────

function formatarData(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatarCNPJ(v) {
  if (!v) return '—'
  const n = v.replace(/\D/g, '').slice(0, 14)
  if (n.length <= 2)  return n
  if (n.length <= 5)  return `${n.slice(0,2)}.${n.slice(2)}`
  if (n.length <= 8)  return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5)}`
  if (n.length <= 12) return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8)}`
  return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12)}`
}

const LBL = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
    {children}
  </label>
)
const INPUT = ({ id, ...props }) => (
  <input id={id} {...props}
    className={`w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none
      focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all
      placeholder:text-slate-400 ${props.className ?? ''}`} />
)
const TEXTAREA = ({ id, ...props }) => (
  <textarea id={id} {...props} rows={3}
    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none
      focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all
      placeholder:text-slate-400 resize-none" />
)

// ── componente principal ──────────────────────────────────────────

export default function ProjectView({ projeto, isLoading, onBack, onOpenTools, onRefresh }) {
  const [statusDropdown, setStatusDropdown] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [drawerOpen,     setDrawerOpen]     = useState(false)

  if (isLoading || !projeto) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="w-5 h-5 border-2 border-[#ecbf03] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Carregando projeto…</span>
        </div>
      </div>
    )
  }

  const status = projeto.statusProjeto ?? 'em_andamento'
  const sc     = STATUS_CONFIG[status] ?? STATUS_CONFIG.em_andamento

  const qtd        = projeto.quantidadeMapeamentos ?? 0
  const realizados = projeto.mapeamentosRealizados ?? 0
  const pct        = qtd > 0 ? Math.round((realizados / qtd) * 100) : 0

  const handleStatusChange = async (novoStatus) => {
    setStatusDropdown(false)
    setUpdatingStatus(true)
    try {
      await atualizarCliente(projeto.id, { statusProjeto: novoStatus })
      onRefresh()
    } catch (err) { alert('❌ ' + err.message) }
    finally { setUpdatingStatus(false) }
  }

  // ── Timeline ────────────────────────────────────
  const marcos = [
    {
      done: true,
      label: 'Projeto iniciado',
      detalhe: formatarData(projeto.criadoEm?.split('T')[0]),
    },
    {
      done: projeto.totalSetores > 0,
      label: projeto.totalSetores > 0
        ? `${projeto.totalSetores} setor${projeto.totalSetores !== 1 ? 'es' : ''} cadastrado${projeto.totalSetores !== 1 ? 's' : ''}`
        : 'Setores não cadastrados',
      detalhe: null,
    },
    {
      done: projeto.totalSipocs > 0,
      label: projeto.totalSipocs > 0
        ? `${realizados} de ${projeto.totalSipocs} processo${projeto.totalSipocs !== 1 ? 's' : ''} mapeado${projeto.totalSipocs !== 1 ? 's' : ''}`
        : 'Nenhum processo mapeado',
      detalhe: null,
    },
    {
      done: !!projeto.ultimoAcessoCliente,
      label: projeto.ultimoAcessoCliente
        ? 'Cliente acessou pela última vez'
        : 'Cliente ainda não acessou',
      detalhe: projeto.ultimoAcessoCliente
        ? formatarData(projeto.ultimoAcessoCliente.split('T')[0])
        : null,
    },
    {
      done: false,
      future: true,
      label: 'Encerramento previsto',
      detalhe: formatarData(projeto.dataFimProjeto),
    },
  ]

  return (
    <div className="max-w-screen-md mx-auto w-full px-6 py-8 space-y-6 flex-1">

      {/* ── Header da página ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-slate-800 truncate">{projeto.nome}</h1>
          {projeto.cnpj && (
            <p className="text-sm text-slate-400 mt-0.5 font-mono">{formatarCNPJ(projeto.cnpj)}</p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Status dropdown */}
          <div className="relative">
            <button
              onClick={() => setStatusDropdown(o => !o)}
              disabled={updatingStatus}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-all
                ${sc.cls} hover:opacity-80 disabled:opacity-50`}
            >
              {updatingStatus ? '…' : sc.label}
              <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {statusDropdown && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-30 min-w-[160px]">
                {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                  <button key={val} onClick={() => handleStatusChange(val)}
                    className={`w-full text-left px-4 py-2.5 text-sm font-semibold flex items-center gap-2
                      hover:bg-slate-50 transition-all ${val === status ? 'bg-slate-50' : ''}`}>
                    <span className={`inline-block w-2 h-2 rounded-full ${cfg.cls.replace('bg-','bg-').split(' ')[0]}`} />
                    {cfg.label}
                    {val === status && (
                      <svg className="w-3.5 h-3.5 text-[#ecbf03] ml-auto" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setDrawerOpen(true)}
            className="px-4 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold
                       text-slate-600 hover:bg-slate-50 transition-all">
            Editar informações
          </button>
        </div>
      </div>

      {/* ── Visão geral ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Visão geral</p>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1">Período</p>
            <p className="text-sm font-bold text-slate-700">
              {formatarData(projeto.dataContratacao)} → {formatarData(projeto.dataFimProjeto)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1">Mapeamentos</p>
            <p className="text-sm font-bold text-slate-700">
              {realizados} <span className="text-slate-400 font-normal">de</span> {qtd || '—'}
            </p>
            {qtd > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${pct >= 80 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold text-slate-500">{pct}%</span>
              </div>
            )}
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1">Setores</p>
            <p className="text-sm font-bold text-slate-700">
              {projeto.totalSetores} setor{projeto.totalSetores !== 1 ? 'es' : ''}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">{projeto.totalSipocs} processo{projeto.totalSipocs !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* ── Escopo + Contexto ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Escopo</p>
          {projeto.escopoTipo === 'areas_especificas' && projeto.areasEspecificas?.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {projeto.areasEspecificas.map((a, i) => (
                <span key={i} className="text-xs font-semibold bg-[#ecbf03]/10 text-[#16253e] border border-[#ecbf03]/30 px-2.5 py-1 rounded-lg">
                  {a}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              {projeto.escopoTipo === 'empresa_completa' ? 'Toda a estrutura da empresa' : '—'}
            </p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contexto</p>
          {projeto.expectativaCliente ? (
            <div>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-0.5">Expectativa</p>
              <p className="text-sm text-slate-600 leading-relaxed">{projeto.expectativaCliente}</p>
            </div>
          ) : null}
          {projeto.maioresDores ? (
            <div>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-0.5">Maiores dores</p>
              <p className="text-sm text-slate-600 leading-relaxed">{projeto.maioresDores}</p>
            </div>
          ) : null}
          {!projeto.expectativaCliente && !projeto.maioresDores && (
            <p className="text-sm text-slate-400 italic">Contexto não preenchido.</p>
          )}
        </div>
      </div>

      {/* ── Linha do tempo ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Linha do tempo</p>
        <div className="space-y-0">
          {marcos.map((m, i) => (
            <div key={i} className="flex items-start gap-3">
              {/* Linha vertical + dot */}
              <div className="flex flex-col items-center flex-shrink-0 w-5">
                <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 mt-1
                  ${m.future
                    ? 'border-slate-300 bg-white'
                    : m.done
                      ? 'border-[#ecbf03] bg-[#ecbf03]'
                      : 'border-slate-300 bg-slate-100'}`} />
                {i < marcos.length - 1 && (
                  <div className={`w-px flex-1 min-h-[20px] ${m.done && !m.future ? 'bg-[#ecbf03]/40' : 'bg-slate-200'}`} />
                )}
              </div>
              <div className="pb-4 min-w-0">
                <p className={`text-sm font-semibold ${m.future || !m.done ? 'text-slate-400' : 'text-slate-700'}`}>
                  {m.label}
                </p>
                {m.detalhe && (
                  <p className="text-xs text-slate-400 mt-0.5">{m.detalhe}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="flex justify-end">
        <button
          onClick={onOpenTools}
          className="bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] px-8 py-3 rounded-xl
                     font-bold text-sm transition-all shadow-sm shadow-[#ecbf03]/30
                     flex items-center gap-2">
          Abrir ferramentas
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>

      {/* ── Drawer: Editar informações ── */}
      {drawerOpen && (
        <EditDrawer
          projeto={projeto}
          onClose={() => setDrawerOpen(false)}
          onSaved={() => { setDrawerOpen(false); onRefresh() }}
        />
      )}
    </div>
  )
}

// ── Drawer de edição ─────────────────────────────────────────────

function EditDrawer({ projeto, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)

  const [nome,                 setNome]                 = useState(projeto.nome ?? '')
  const [cnpj,                 setCnpj]                 = useState(projeto.cnpj ?? '')
  const [dataContratacao,      setDataContratacao]      = useState(projeto.dataContratacao ?? '')
  const [dataFimProjeto,       setDataFimProjeto]       = useState(projeto.dataFimProjeto ?? '')
  const [quantidadeMapeamentos,setQuantidadeMapeamentos]= useState(projeto.quantidadeMapeamentos ?? '')
  const [escopoTipo,           setEscopoTipo]           = useState(projeto.escopoTipo ?? 'empresa_completa')
  const [areasEspecificas,     setAreasEspecificas]     = useState(projeto.areasEspecificas ?? [])
  const [areaInput,            setAreaInput]            = useState('')
  const [expectativaCliente,   setExpectativaCliente]   = useState(projeto.expectativaCliente ?? '')
  const [maioresDores,         setMaioresDores]         = useState(projeto.maioresDores ?? '')

  function formatarCNPJ(v) {
    const n = v.replace(/\D/g, '').slice(0, 14)
    if (n.length <= 2)  return n
    if (n.length <= 5)  return `${n.slice(0,2)}.${n.slice(2)}`
    if (n.length <= 8)  return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5)}`
    if (n.length <= 12) return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8)}`
    return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12)}`
  }

  const commitArea = (text) => {
    const t = text.trim()
    if (t && !areasEspecificas.includes(t)) setAreasEspecificas(prev => [...prev, t])
    setAreaInput('')
  }

  const handleSave = async () => {
    if (!nome.trim()) return
    setSaving(true)
    try {
      await atualizarCliente(projeto.id, {
        nome: nome.trim(),
        cnpj: cnpj.trim(),
        dataContratacao,
        dataFimProjeto,
        quantidadeMapeamentos,
        escopoTipo,
        areasEspecificas: escopoTipo === 'areas_especificas' ? areasEspecificas : [],
        expectativaCliente: expectativaCliente.trim(),
        maioresDores: maioresDores.trim(),
      })
      onSaved()
    } catch (err) {
      alert('❌ ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-slate-900/30 z-40" onClick={onClose} />

      {/* Painel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <h3 className="font-bold text-slate-800 text-lg">Editar informações</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          <section className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Identificação</p>
            <div>
              <LBL htmlFor="ed-nome">Nome da empresa</LBL>
              <INPUT id="ed-nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da empresa" />
            </div>
            <div>
              <LBL htmlFor="ed-cnpj">CNPJ</LBL>
              <INPUT id="ed-cnpj" value={cnpj} onChange={e => setCnpj(formatarCNPJ(e.target.value))} placeholder="00.000.000/0000-00" />
            </div>
          </section>

          <hr className="border-slate-100" />

          <section className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contrato</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <LBL htmlFor="ed-data-inicio">Data contratação</LBL>
                <INPUT id="ed-data-inicio" type="date" value={dataContratacao} onChange={e => setDataContratacao(e.target.value)} />
              </div>
              <div>
                <LBL htmlFor="ed-data-fim">Fim previsto</LBL>
                <INPUT id="ed-data-fim" type="date" value={dataFimProjeto} onChange={e => setDataFimProjeto(e.target.value)} />
              </div>
            </div>
            <div>
              <LBL htmlFor="ed-qtd">Mapeamentos contratados</LBL>
              <INPUT id="ed-qtd" type="number" min="1" value={quantidadeMapeamentos} onChange={e => setQuantidadeMapeamentos(e.target.value)} placeholder="Ex: 10" />
            </div>
          </section>

          <hr className="border-slate-100" />

          <section className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Escopo e contexto</p>
            <div>
              <LBL>Escopo</LBL>
              <div className="flex gap-2">
                {[
                  { value: 'empresa_completa',  label: 'Toda a empresa' },
                  { value: 'areas_especificas', label: 'Áreas específicas' },
                ].map(opt => (
                  <button key={opt.value} type="button" onClick={() => setEscopoTipo(opt.value)}
                    className={`flex-1 px-3 py-2 rounded-xl text-xs font-semibold border transition-all
                      ${escopoTipo === opt.value
                        ? 'bg-[#ecbf03]/10 border-[#ecbf03]/60 text-[#16253e]'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {escopoTipo === 'areas_especificas' && (
              <div>
                <LBL>Áreas</LBL>
                <div className="min-h-[42px] px-2.5 py-2 rounded-xl border flex flex-wrap gap-1.5
                  bg-white border-slate-200 focus-within:border-[#ecbf03] focus-within:ring-2 focus-within:ring-[#ecbf03]/20">
                  {areasEspecificas.map((a, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-md">
                      {a}
                      <button type="button" onClick={() => setAreasEspecificas(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-slate-400 hover:text-white leading-none">×</button>
                    </span>
                  ))}
                  <input value={areaInput} onChange={e => setAreaInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitArea(areaInput) }
                      else if (e.key === 'Backspace' && !areaInput && areasEspecificas.length > 0)
                        setAreasEspecificas(prev => prev.slice(0, -1))
                    }}
                    onBlur={() => { if (areaInput.trim()) commitArea(areaInput) }}
                    placeholder="Enter para adicionar…"
                    className="flex-1 bg-transparent outline-none text-sm min-w-[120px] text-slate-700 placeholder:text-slate-400" />
                </div>
              </div>
            )}

            <div>
              <LBL htmlFor="ed-expectativa">Expectativa do cliente</LBL>
              <TEXTAREA id="ed-expectativa" value={expectativaCliente} onChange={e => setExpectativaCliente(e.target.value)}
                placeholder="O que o cliente espera alcançar…" />
            </div>
            <div>
              <LBL htmlFor="ed-dores">Maiores dores</LBL>
              <TEXTAREA id="ed-dores" value={maioresDores} onChange={e => setMaioresDores(e.target.value)}
                placeholder="Principais problemas e gargalos…" />
            </div>
          </section>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold
                       text-slate-500 hover:bg-slate-50 transition-all">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !nome.trim()}
            className="flex-1 py-2.5 rounded-xl bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e]
                       font-bold text-sm transition-all disabled:opacity-50 shadow-sm shadow-[#ecbf03]/30">
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </>
  )
}
