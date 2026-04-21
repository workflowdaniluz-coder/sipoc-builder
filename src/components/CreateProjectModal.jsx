import { useState } from 'react'
import { criarProjeto } from '../lib/db'

function formatarCNPJ(v) {
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
  <input
    id={id}
    {...props}
    className={`w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none
      focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all
      placeholder:text-slate-400 ${props.className ?? ''}`}
  />
)

const TEXTAREA = ({ id, ...props }) => (
  <textarea
    id={id}
    {...props}
    rows={3}
    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none
      focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all
      placeholder:text-slate-400 resize-none"
  />
)

export default function CreateProjectModal({ onClose, onCreated }) {
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // Bloco 1 — Identificação
  const [nome,  setNome]  = useState('')
  const [cnpj,  setCnpj]  = useState('')

  // Bloco 2 — Contrato
  const [dataContratacao,       setDataContratacao]       = useState('')
  const [dataFimProjeto,        setDataFimProjeto]        = useState('')
  const [quantidadeMapeamentos, setQuantidadeMapeamentos] = useState('')

  // Bloco 3 — Escopo e contexto
  const [escopoTipo,         setEscopoTipo]         = useState('empresa_completa')
  const [areasEspecificas,   setAreasEspecificas]   = useState([])
  const [areaInput,          setAreaInput]          = useState('')
  const [expectativaCliente, setExpectativaCliente] = useState('')
  const [maioresDores,       setMaioresDores]       = useState('')

  const bloco12Valido = nome.trim() && cnpj.trim() && dataContratacao && dataFimProjeto && quantidadeMapeamentos

  const commitArea = (text) => {
    const t = text.trim()
    if (t && !areasEspecificas.includes(t)) setAreasEspecificas(prev => [...prev, t])
    setAreaInput('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!bloco12Valido) return
    setSaving(true)
    setError('')
    try {
      const p = await criarProjeto({
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
      onCreated(p)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4">
        <div className="px-7 pt-7 pb-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-xl">Novo projeto</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-7 py-6 space-y-7">

          {/* ── Bloco 1: Identificação ── */}
          <section className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Identificação
            </p>
            <div>
              <LBL htmlFor="cp-nome">Nome da empresa <span className="text-red-400">*</span></LBL>
              <INPUT
                id="cp-nome"
                autoFocus
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Ex: Empresa ABC"
                required
              />
            </div>
            <div>
              <LBL htmlFor="cp-cnpj">CNPJ <span className="text-red-400">*</span></LBL>
              <INPUT
                id="cp-cnpj"
                value={cnpj}
                onChange={e => setCnpj(formatarCNPJ(e.target.value))}
                placeholder="00.000.000/0000-00"
                required
              />
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* ── Bloco 2: Contrato ── */}
          <section className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Contrato
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <LBL htmlFor="cp-data-inicio">Data de contratação <span className="text-red-400">*</span></LBL>
                <INPUT
                  id="cp-data-inicio"
                  type="date"
                  value={dataContratacao}
                  onChange={e => setDataContratacao(e.target.value)}
                  required
                />
              </div>
              <div>
                <LBL htmlFor="cp-data-fim">Fim previsto <span className="text-red-400">*</span></LBL>
                <INPUT
                  id="cp-data-fim"
                  type="date"
                  value={dataFimProjeto}
                  onChange={e => setDataFimProjeto(e.target.value)}
                  required
                />
              </div>
            </div>
            <div>
              <LBL htmlFor="cp-qtd">Mapeamentos contratados <span className="text-red-400">*</span></LBL>
              <INPUT
                id="cp-qtd"
                type="number"
                min="1"
                value={quantidadeMapeamentos}
                onChange={e => setQuantidadeMapeamentos(e.target.value)}
                placeholder="Ex: 10"
                required
              />
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* ── Bloco 3: Escopo e contexto ── */}
          <section className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Escopo e contexto
            </p>

            <div>
              <LBL>Escopo</LBL>
              <div className="flex gap-3">
                {[
                  { value: 'empresa_completa',  label: 'Toda a estrutura da empresa' },
                  { value: 'areas_especificas', label: 'Áreas específicas' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEscopoTipo(opt.value)}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all
                      ${escopoTipo === opt.value
                        ? 'bg-[#ecbf03]/10 border-[#ecbf03]/60 text-[#16253e]'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {escopoTipo === 'areas_especificas' && (
              <div>
                <LBL>Áreas</LBL>
                <div className={`min-h-[42px] px-2.5 py-2 rounded-xl border flex flex-wrap gap-1.5 transition-all
                  bg-white border-slate-200 focus-within:border-[#ecbf03] focus-within:ring-2 focus-within:ring-[#ecbf03]/20`}>
                  {areasEspecificas.map((a, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-md">
                      {a}
                      <button type="button" onClick={() => setAreasEspecificas(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-slate-400 hover:text-white leading-none">×</button>
                    </span>
                  ))}
                  <input
                    value={areaInput}
                    onChange={e => setAreaInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitArea(areaInput) }
                      else if (e.key === 'Backspace' && !areaInput && areasEspecificas.length > 0)
                        setAreasEspecificas(prev => prev.slice(0, -1))
                    }}
                    onBlur={() => { if (areaInput.trim()) commitArea(areaInput) }}
                    placeholder={areasEspecificas.length === 0 ? 'Financeiro, RH… (Enter para adicionar)' : 'Enter para adicionar…'}
                    className="flex-1 bg-transparent outline-none text-sm min-w-[150px] text-slate-700 placeholder:text-slate-400"
                  />
                </div>
              </div>
            )}

            <div>
              <LBL htmlFor="cp-expectativa">Expectativa do cliente</LBL>
              <TEXTAREA
                id="cp-expectativa"
                value={expectativaCliente}
                onChange={e => setExpectativaCliente(e.target.value)}
                placeholder="O que o cliente espera alcançar com o projeto…"
              />
            </div>

            <div>
              <LBL htmlFor="cp-dores">Maiores dores</LBL>
              <TEXTAREA
                id="cp-dores"
                value={maioresDores}
                onChange={e => setMaioresDores(e.target.value)}
                placeholder="Principais problemas e gargalos identificados…"
              />
            </div>
          </section>

          {/* ── Erro inline ── */}
          {error && (
            <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          {/* ── Ações ── */}
          <div className="flex gap-3 pt-1 pb-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold
                         text-slate-500 hover:bg-slate-50 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !bloco12Valido}
              className="flex-1 py-2.5 rounded-xl bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e]
                         font-bold text-sm transition-all disabled:opacity-50 shadow-sm shadow-[#ecbf03]/30"
            >
              {saving ? 'Criando…' : 'Criar projeto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
