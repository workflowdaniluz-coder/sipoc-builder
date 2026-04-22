import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { listarSipocs, salvarRespostaCliente, finalizarRespostaCliente, salvarLevantamento } from '../lib/db';
import LevantamentoForm from './LevantamentoForm';

// ── Helpers ──────────────────────────────────────────────────────

function buildEmptyResposta(processo) {
  const inputs = {};
  const outputs = {};
  (processo.inputs || []).filter(s => s.trim()).forEach(name => {
    inputs[name] = { padronizado: '', ferramentas: [], observacoes: '' };
  });
  (processo.outputs || []).filter(s => s.trim()).forEach(name => {
    outputs[name] = { padronizado: '', ferramentas: [], observacoes: '' };
  });
  return {
    inputs,
    outputs,
    processo: {
      periodicidade: '',
      volume_esforco: '',
      observacoes_gerais: '',
      rasci: { Responsável: [], Aprovador: [], Suporte: [], Consultado: [], Informado: [] },
    },
  };
}

function loadDraft(sipocId) {
  try {
    const raw = localStorage.getItem(`sipoc_draft_${sipocId}`);
    if (!raw) return null;
    return JSON.parse(raw).data;
  } catch { return null; }
}

// ── Base components ───────────────────────────────────────────────

function MultiChipSelect({ options = [], value = [], onChange }) {
  const valid = options.filter(o => o.trim());
  if (valid.length === 0) return <p className="text-xs text-slate-400 py-1">Nenhum cadastrado pelo consultor.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {valid.map(opt => {
        const sel = value.includes(opt);
        return (
          <button key={opt} type="button"
            onClick={() => onChange(sel ? value.filter(v => v !== opt) : [...value, opt])}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5
              ${sel ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50'}`}>
            {opt}
            {sel && <span className="opacity-50 leading-none">×</span>}
          </button>
        );
      })}
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
      {children}
    </label>
  );
}

function ChipsInput({ value = [], onChange, placeholder }) {
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef(null);

  const addChip = useCallback((text) => {
    const trimmed = text.replace(/,+$/, '').trim();
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setInputVal('');
  }, [value, onChange]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addChip(inputVal);
    } else if (e.key === 'Backspace' && !inputVal && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div
      className="min-h-[42px] px-2.5 py-2 rounded-xl border border-slate-200 bg-white flex flex-wrap gap-1.5
                 cursor-text focus-within:border-[#ecbf03] focus-within:ring-2 focus-within:ring-[#ecbf03]/20 transition-all"
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((chip, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 bg-slate-800 text-white text-xs font-medium px-2.5 py-1 rounded-lg">
          {chip}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(value.filter((_, idx) => idx !== i)); }}
            className="text-slate-400 hover:text-white transition-colors w-3 h-3 flex items-center justify-center leading-none"
          >×</button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (inputVal.trim()) addChip(inputVal); }}
        placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 bg-transparent outline-none text-sm min-w-[120px] text-slate-700 placeholder:text-slate-400"
      />
    </div>
  );
}

const PADRONIZADO_OPTIONS = [
  { value: 'sim',     label: 'Sim',     cls: 'bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-200' },
  { value: 'parcial', label: 'Parcial', cls: 'bg-amber-500 border-amber-500 text-white shadow-sm shadow-amber-200' },
  { value: 'nao',     label: 'Não',     cls: 'bg-red-500 border-red-500 text-white shadow-sm shadow-red-200' },
];

function PillSelect({ value, onChange }) {
  return (
    <div className="flex gap-2">
      {PADRONIZADO_OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(value === opt.value ? '' : opt.value)}
          className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
            value === opt.value
              ? opt.cls
              : 'border-slate-200 text-slate-500 bg-white hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ExpandableCard({ isExpanded, onToggle, badge, title, children }) {
  return (
    <div className={`rounded-xl border transition-all duration-150 ${isExpanded ? 'border-slate-300 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          {badge}
          <span className="font-semibold text-slate-700 text-sm truncate">{title}</span>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isExpanded && (
        <div className="px-5 pb-5 pt-4 space-y-4 border-t border-slate-100">
          {children}
        </div>
      )}
    </div>
  );
}

function SectionCard({ icon, title, subtitle, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-100">
        <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-base flex-shrink-0">
          {icon}
        </div>
        <div>
          <h3 className="font-bold text-slate-800 text-sm leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function EmptySlot({ message }) {
  return (
    <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}

function validarFormularioCliente(respostas, processo) {
  const pendentes = [];
  const inputNames  = (processo.inputs  || []).filter(s => s.trim());
  const outputNames = (processo.outputs || []).filter(s => s.trim());

  inputNames.forEach(name => {
    const d = respostas?.inputs?.[name];
    if (!d?.padronizado) pendentes.push(`Entrada "${name}" — padronizado`);
  });
  outputNames.forEach(name => {
    const d = respostas?.outputs?.[name];
    if (!d?.padronizado) pendentes.push(`Saída "${name}" — padronizado`);
  });
  if (!respostas?.processo?.periodicidade)  pendentes.push('Periodicidade');
  if (!respostas?.processo?.volume_esforco) pendentes.push('Volume e esforço');

  return { valido: pendentes.length === 0, pendentes };
}

// ── Main component ────────────────────────────────────────────────

export default function ClientView({ clientData }) {
  const { tokenId, setorId, setorNome, clienteNome } = clientData;

  const [processos, setProcessos]             = useState([]);
  const [activeProcessoId, setActiveProcessoId] = useState(null);
  const [respostas, setRespostas]             = useState({});
  const [savedIds, setSavedIds]               = useState(new Set());
  const [expandedInputs, setExpandedInputs]   = useState({});
  const [expandedOutputs, setExpandedOutputs] = useState({});
  const [isLoading, setIsLoading]             = useState(true);
  const [isSaving, setIsSaving]               = useState(false);
  const [saveStatus, setSaveStatus]           = useState(null); // 'success' | 'error' | 'finalizado' | null
  const [saveError, setSaveError]             = useState('');
  const [loadError, setLoadError]             = useState(null);
  const [finalizadoIds, setFinalizadoIds]     = useState(new Set());
  const [isFinalizando, setIsFinalizando]     = useState(false);
  const [finalizarError, setFinalizarError]   = useState('');
  const [tentouFinalizar, setTentouFinalizar] = useState(false);
  const [showThanks, setShowThanks]           = useState(false);

  const levantamentoRef = useRef(null);
  const draftTimersRef = useRef({});

  const persistDraft = useCallback((sipocId, data) => {
    clearTimeout(draftTimersRef.current[sipocId]);
    draftTimersRef.current[sipocId] = setTimeout(() => {
      try {
        localStorage.setItem(`sipoc_draft_${sipocId}`, JSON.stringify({
          data,
          savedAt: new Date().toISOString(),
        }));
      } catch {}
    }, 1000);
  }, []);

  // Load processos
  useEffect(() => {
    const carregar = async () => {
      try {
        const data = await listarSipocs(setorId);
        setProcessos(data);

        const initialRespostas    = {};
        const alreadySaved        = new Set();
        const finalizadoSet       = new Set();
        const initExpInputs       = {};
        const initExpOutputs      = {};

        data.forEach(p => {
          const empty     = buildEmptyResposta(p);
          const fromDB    = p.respostas_cliente && Object.keys(p.respostas_cliente).length > 0 ? p.respostas_cliente : null;
          const fromLocal = loadDraft(p.id);

          // Merge: empty base → DB → local draft (local has priority)
          const merged = { ...empty };
          if (fromDB) {
            merged.inputs   = { ...empty.inputs,   ...(fromDB.inputs   || {}) };
            merged.outputs  = { ...empty.outputs,  ...(fromDB.outputs  || {}) };
            merged.processo = { ...empty.processo, ...(fromDB.processo || {}) };
            if (fromDB.processo?.rasci) {
              merged.processo.rasci = { ...empty.processo.rasci, ...fromDB.processo.rasci };
            }
          }
          if (fromLocal) {
            merged.inputs   = { ...merged.inputs,   ...(fromLocal.inputs   || {}) };
            merged.outputs  = { ...merged.outputs,  ...(fromLocal.outputs  || {}) };
            merged.processo = { ...merged.processo, ...(fromLocal.processo || {}) };
            if (fromLocal.processo?.rasci) {
              merged.processo.rasci = { ...merged.processo.rasci, ...fromLocal.processo.rasci };
            }
          }

          initialRespostas[p.id] = merged;
          if (fromDB) alreadySaved.add(p.id);
          if (p.status === 'em_revisao') finalizadoSet.add(p.id);

          // Expand first item by default
          const inputKeys  = Object.keys(merged.inputs);
          const outputKeys = Object.keys(merged.outputs);
          initExpInputs[p.id]  = inputKeys.length  > 0 ? { [inputKeys[0]]: true }  : {};
          initExpOutputs[p.id] = outputKeys.length > 0 ? { [outputKeys[0]]: true } : {};
        });

        setRespostas(initialRespostas);
        setSavedIds(alreadySaved);
        setFinalizadoIds(finalizadoSet);
        setExpandedInputs(initExpInputs);
        setExpandedOutputs(initExpOutputs);
        if (data.length > 0) setActiveProcessoId(data[0].id);
      } catch (err) {
        setLoadError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    carregar();
  }, [setorId]);

  // Updaters
  const updateInput = (inputName, field, value) => {
    setRespostas(prev => {
      const next = {
        ...prev,
        [activeProcessoId]: {
          ...prev[activeProcessoId],
          inputs: {
            ...prev[activeProcessoId].inputs,
            [inputName]: { ...prev[activeProcessoId].inputs[inputName], [field]: value },
          },
        },
      };
      persistDraft(activeProcessoId, next[activeProcessoId]);
      return next;
    });
  };

  const updateOutput = (outputName, field, value) => {
    setRespostas(prev => {
      const next = {
        ...prev,
        [activeProcessoId]: {
          ...prev[activeProcessoId],
          outputs: {
            ...prev[activeProcessoId].outputs,
            [outputName]: { ...prev[activeProcessoId].outputs[outputName], [field]: value },
          },
        },
      };
      persistDraft(activeProcessoId, next[activeProcessoId]);
      return next;
    });
  };

  const updateProcesso = (field, value) => {
    setRespostas(prev => {
      const next = {
        ...prev,
        [activeProcessoId]: {
          ...prev[activeProcessoId],
          processo: { ...prev[activeProcessoId].processo, [field]: value },
        },
      };
      persistDraft(activeProcessoId, next[activeProcessoId]);
      return next;
    });
  };

  const updateRasci = (papel, tags) => {
    setRespostas(prev => {
      const next = {
        ...prev,
        [activeProcessoId]: {
          ...prev[activeProcessoId],
          processo: {
            ...prev[activeProcessoId].processo,
            rasci: { ...prev[activeProcessoId].processo.rasci, [papel]: tags },
          },
        },
      };
      persistDraft(activeProcessoId, next[activeProcessoId]);
      return next;
    });
  };

  const toggleInput  = (name) => setExpandedInputs(prev => ({
    ...prev,
    [activeProcessoId]: { ...prev[activeProcessoId], [name]: !prev[activeProcessoId]?.[name] },
  }));
  const toggleOutput = (name) => setExpandedOutputs(prev => ({
    ...prev,
    [activeProcessoId]: { ...prev[activeProcessoId], [name]: !prev[activeProcessoId]?.[name] },
  }));

  const salvar = async () => {
    if (!activeProcessoId) return;
    setIsSaving(true);
    setSaveStatus(null);
    try {
      await salvarRespostaCliente(tokenId, activeProcessoId, respostas[activeProcessoId]);
      setSavedIds(prev => new Set([...prev, activeProcessoId]));
      localStorage.removeItem(`sipoc_draft_${activeProcessoId}`);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      setSaveError(err.message);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinalizar = async () => {
    setTentouFinalizar(true);
    if (!activeProcessoId) return;
    const v = validarFormularioCliente(respostas[activeProcessoId], activeProcesso);
    const levOk = levantamentoRef.current?.validate() ?? true;
    if (!v.valido || !levOk) return;
    setIsFinalizando(true);
    setFinalizarError('');
    try {
      const levData = levantamentoRef.current?.getValue();
      await Promise.all([
        finalizarRespostaCliente(tokenId, activeProcessoId, respostas[activeProcessoId]),
        levData ? salvarLevantamento(activeProcessoId, levData) : Promise.resolve(),
      ]);
      setFinalizadoIds(prev => new Set([...prev, activeProcessoId]));
      setSavedIds(prev => new Set([...prev, activeProcessoId]));
      localStorage.removeItem(`sipoc_draft_${activeProcessoId}`);
      setShowThanks(true);
    } catch (err) {
      setFinalizarError(err.message);
    } finally {
      setIsFinalizando(false);
    }
  };

  // Computed
  const processosPreenchidos = processos.filter(p => savedIds.has(p.id)).length;
  const activeProcesso = processos.find(p => p.id === activeProcessoId);
  const activeResposta = respostas[activeProcessoId];

  const validacao = useMemo(() => {
    if (!activeProcesso || !activeResposta) return { valido: true, pendentes: [] };
    return validarFormularioCliente(activeResposta, activeProcesso);
  }, [activeResposta, activeProcesso]);

  // ── States ──────────────────────────────────────────────────────

  if (showThanks) return (
    <div className="min-h-screen bg-[#16253e] flex flex-col items-center justify-center px-6 text-center">
      <div className="mb-8">
        <img src="/logo-positive.png" alt="P-Excellence" className="h-10 w-auto mx-auto mb-10 opacity-90" />
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mx-auto mb-6">
          <svg className="w-9 h-9 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-3xl font-black text-white mb-3 leading-tight">
          Obrigada pelas informações!
        </h1>
        <p className="text-slate-300 text-base max-w-sm mx-auto leading-relaxed">
          Suas respostas foram enviadas com sucesso para a equipe P-Excellence.<br />
          Em breve entraremos em contato.
        </p>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 max-w-xs w-full">
        <p className="text-slate-400 text-xs leading-relaxed">
          Este link foi encerrado e não pode mais ser utilizado.<br />
          Caso precise de suporte, entre em contato com o seu consultor.
        </p>
      </div>
    </div>
  );

  if (isLoading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex items-center gap-3 text-slate-400">
        <div className="w-5 h-5 border-2 border-[#ecbf03] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-medium">Carregando processos...</span>
      </div>
    </div>
  );

  if (loadError) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 border border-red-200 max-w-md text-center shadow-sm">
        <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-xl">⚠️</div>
        <p className="text-red-600 font-semibold mb-2">Não foi possível carregar os processos</p>
        <p className="text-slate-500 text-sm">{loadError}</p>
        <p className="text-slate-400 text-xs mt-3">Verifique se o link é válido ou contacte o consultor.</p>
      </div>
    </div>
  );

  const inputNames  = activeProcesso ? (activeProcesso.inputs  || []).filter(s => s.trim()) : [];
  const outputNames = activeProcesso ? (activeProcesso.outputs || []).filter(s => s.trim()) : [];

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col">

      {/* Header */}
      <header className="bg-[#16253e] sticky top-0 z-40">
        <div className="max-w-[1100px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/logo-positive.png" alt="P-Excellence" className="h-8 w-auto" />
            <p className="text-[11px] text-slate-400 font-medium tracking-wide">{clienteNome} — {setorNome}</p>
          </div>
          <div className="bg-slate-800 rounded-xl px-4 py-2 border border-slate-700 flex items-center gap-3">
            <span className="text-xs text-slate-300 font-medium whitespace-nowrap">
              {processosPreenchidos}/{processos.length} preenchido{processosPreenchidos !== 1 ? 's' : ''}
            </span>
            <div className="w-20 bg-slate-700 rounded-full h-1.5">
              <div
                className="bg-[#ecbf03] h-1.5 rounded-full transition-all duration-500"
                style={{ width: processos.length ? `${(processosPreenchidos / processos.length) * 100}%` : '0%' }}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1100px] mx-auto px-6 py-8 flex gap-6 flex-1 w-full">

        {/* Sidebar */}
        <aside className="w-58 flex-shrink-0" style={{ width: '220px' }}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden sticky top-24">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Processos</p>
            </div>
            <div className="p-2 space-y-0.5 max-h-[calc(100vh-160px)] overflow-y-auto">
              {processos.map(p => {
                const isFinalizado = finalizadoIds.has(p.id);
                const isSaved      = savedIds.has(p.id);
                const isActive     = activeProcessoId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => { setActiveProcessoId(p.id); setSaveStatus(null); setTentouFinalizar(false); }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center justify-between gap-2
                      ${isActive ? 'bg-[#ecbf03] text-[#16253e] font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-bold
                      ${isActive ? 'bg-[#ecbf03]/30 text-[#16253e]'
                        : isFinalizado ? 'bg-emerald-500 text-white'
                        : isSaved ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-400'}`}>
                      {isFinalizado ? '✓✓' : isSaved ? '✓' : '—'}
                    </span>
                  </button>
                );
              })}
              {processos.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">Nenhum processo disponível.</p>
              )}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {activeProcesso && activeResposta ? (
            <div className="space-y-4">

              {/* Process header */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-8 py-6">
                <p className="text-[11px] font-bold text-[#ecbf03] uppercase tracking-widest mb-1">{setorNome}</p>
                <h2 className="text-2xl font-black text-slate-900 leading-tight">{activeProcesso.name}</h2>
                <p className="text-sm text-slate-400 mt-1.5">
                  Preencha as informações abaixo sobre como este processo funciona na sua organização.
                </p>
              </div>

              {/* ── Section 1: Inputs ── */}
              <SectionCard icon="📥" title="Entradas do processo" subtitle="Como cada input chega até a equipe">
                {inputNames.length === 0 ? (
                  <EmptySlot message="Nenhuma entrada cadastrada pelo consultor ainda." />
                ) : (
                  <div className="space-y-2">
                    {inputNames.map(name => (
                      <ExpandableCard
                        key={name}
                        isExpanded={!!expandedInputs[activeProcessoId]?.[name]}
                        onToggle={() => toggleInput(name)}
                        badge={
                          <span className="text-[10px] font-bold bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full border border-sky-200 flex-shrink-0">
                            Input
                          </span>
                        }
                        title={name}
                      >
                        <div>
                          <FieldLabel>Padronizado?</FieldLabel>
                          <PillSelect
                            value={activeResposta.inputs[name]?.padronizado || ''}
                            onChange={v => updateInput(name, 'padronizado', v)}
                          />
                        </div>
                        <div>
                          <FieldLabel>Ferramentas que geram este input</FieldLabel>
                          <ChipsInput
                            value={activeResposta.inputs[name]?.ferramentas || []}
                            onChange={v => updateInput(name, 'ferramentas', v)}
                            placeholder="Ex: SAP, Excel… (Enter para adicionar)"
                          />
                        </div>
                        <div>
                          <FieldLabel>Observações</FieldLabel>
                          <textarea
                            value={activeResposta.inputs[name]?.observacoes || ''}
                            onChange={e => updateInput(name, 'observacoes', e.target.value)}
                            placeholder="Algo relevante sobre esta entrada..."
                            rows={3}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 outline-none
                                       focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all resize-none placeholder:text-slate-400"
                          />
                        </div>
                      </ExpandableCard>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* ── Section 2: Outputs ── */}
              <SectionCard icon="📤" title="Saídas do processo" subtitle="O que este processo entrega e para quem">
                {outputNames.length === 0 ? (
                  <EmptySlot message="Nenhuma saída cadastrada pelo consultor ainda." />
                ) : (
                  <div className="space-y-2">
                    {outputNames.map(name => (
                      <ExpandableCard
                        key={name}
                        isExpanded={!!expandedOutputs[activeProcessoId]?.[name]}
                        onToggle={() => toggleOutput(name)}
                        badge={
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 flex-shrink-0">
                            Output
                          </span>
                        }
                        title={name}
                      >
                        <div>
                          <FieldLabel>Padronizado?</FieldLabel>
                          <PillSelect
                            value={activeResposta.outputs[name]?.padronizado || ''}
                            onChange={v => updateOutput(name, 'padronizado', v)}
                          />
                        </div>
                        <div>
                          <FieldLabel>Ferramentas que consomem este output</FieldLabel>
                          <ChipsInput
                            value={activeResposta.outputs[name]?.ferramentas || []}
                            onChange={v => updateOutput(name, 'ferramentas', v)}
                            placeholder="Ex: Tableau, Power BI… (Enter para adicionar)"
                          />
                        </div>
                        <div>
                          <FieldLabel>Observações</FieldLabel>
                          <textarea
                            value={activeResposta.outputs[name]?.observacoes || ''}
                            onChange={e => updateOutput(name, 'observacoes', e.target.value)}
                            placeholder="Algo relevante sobre esta saída..."
                            rows={3}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 outline-none
                                       focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all resize-none placeholder:text-slate-400"
                          />
                        </div>
                      </ExpandableCard>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* ── Section 3: Process info ── */}
              <SectionCard icon="⚙️" title="Informações gerais" subtitle="Frequência, volume e contexto do processo">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <FieldLabel>Periodicidade</FieldLabel>
                    <select
                      value={activeResposta.processo.periodicidade}
                      onChange={e => updateProcesso('periodicidade', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 outline-none
                                 focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all"
                    >
                      <option value="">— selecione —</option>
                      {['Diária','Semanal','Quinzenal','Mensal','Trimestral','Semestral','Anual','Sob demanda'].map(o => (
                        <option key={o} value={o.toLowerCase()}>{o}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Volume e esforço</FieldLabel>
                    <select
                      value={activeResposta.processo.volume_esforco}
                      onChange={e => updateProcesso('volume_esforco', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 outline-none
                                 focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all"
                    >
                      <option value="">— selecione —</option>
                      {[['1','1 — Muito baixo'],['2','2 — Baixo'],['3','3 — Médio'],['4','4 — Alto'],['5','5 — Muito alto']].map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <FieldLabel>Observações gerais</FieldLabel>
                  <textarea
                    value={activeResposta.processo.observacoes_gerais}
                    onChange={e => updateProcesso('observacoes_gerais', e.target.value)}
                    placeholder="Gargalos, dores, pontos de atenção, contexto relevante..."
                    rows={5}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 outline-none
                               focus:border-[#ecbf03] focus:ring-2 focus:ring-[#ecbf03]/20 transition-all resize-none placeholder:text-slate-400"
                  />
                </div>
              </SectionCard>

              {/* ── Section 4: Levantamento de processo ── */}
              <LevantamentoForm ref={levantamentoRef} processo={activeProcesso} />

              {/* ── Save bar ── */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-8 py-5 mb-8 space-y-4">

                {/* Status messages */}
                {saveStatus === 'finalizado' && (
                  <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm">
                    <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-white text-[11px]">✓</div>
                    Respostas enviadas para o consultor.
                  </div>
                )}
                {saveStatus === 'success' && (
                  <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm">
                    <div className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center text-[11px]">✓</div>
                    Respostas salvas com sucesso!
                  </div>
                )}
                {saveStatus === 'error' && (
                  <div className="flex items-center gap-2 text-red-500 font-semibold text-sm">
                    <div className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center text-[11px]">✕</div>
                    {saveError}
                  </div>
                )}
                {finalizarError && (
                  <div className="flex items-center gap-2 text-red-500 font-semibold text-sm">
                    <div className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center text-[11px]">✕</div>
                    {finalizarError}
                  </div>
                )}
                {!saveStatus && !finalizarError && savedIds.has(activeProcessoId) && !finalizadoIds.has(activeProcessoId) && (
                  <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    <span className="w-4 h-4 bg-slate-100 rounded-full flex items-center justify-center text-[10px]">✓</span>
                    Salvo anteriormente
                  </span>
                )}
                {!saveStatus && !finalizarError && !savedIds.has(activeProcessoId) && (
                  <span className="text-xs text-slate-400">Preencha os campos e salve quando terminar.</span>
                )}

                {/* Validation errors (shown after first Finalizar attempt) */}
                {tentouFinalizar && !validacao.valido && !finalizadoIds.has(activeProcessoId) && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <p className="text-xs font-bold text-amber-700 mb-1.5">Campos obrigatórios para finalizar:</p>
                    <ul className="space-y-0.5">
                      {validacao.pendentes.map(p => (
                        <li key={p} className="text-xs text-amber-600 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full flex-shrink-0" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Buttons */}
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={salvar}
                    disabled={isSaving || finalizadoIds.has(activeProcessoId)}
                    className="bg-[#ecbf03] hover:bg-[#d4ab02] text-[#16253e] px-6 py-2.5 rounded-xl font-bold text-sm
                               transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-[#ecbf03]/30
                               flex items-center gap-2 whitespace-nowrap"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-[#16253e] border-t-transparent rounded-full animate-spin" />
                        Salvando...
                      </>
                    ) : 'Salvar respostas'}
                  </button>

                  {finalizadoIds.has(activeProcessoId) ? (
                    <div className="flex items-center gap-2 text-emerald-600 text-sm font-semibold">
                      <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-white text-[11px]">✓</div>
                      Enviado ao consultor
                    </div>
                  ) : (
                    <button
                      onClick={handleFinalizar}
                      disabled={isFinalizando}
                      className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 whitespace-nowrap
                        ${validacao.valido
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-200 disabled:opacity-60'
                          : 'bg-slate-100 text-slate-400 cursor-default hover:bg-slate-200'}`}
                    >
                      {isFinalizando ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Finalizando...
                        </>
                      ) : (
                        <>
                          {validacao.valido
                            ? <span className="text-[13px] leading-none">✓</span>
                            : <span className="text-[13px] leading-none">○</span>}
                          Finalizar preenchimento
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-xl">📋</div>
              <p className="font-medium text-sm text-slate-400">Selecione um processo na barra lateral para começar.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
