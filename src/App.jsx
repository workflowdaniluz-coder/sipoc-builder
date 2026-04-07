import { useState, useMemo, useEffect } from 'react';

function App() {
  // ==========================================
  // 🔗 CONFIGURAÇÕES DE INTEGRAÇÃO (N8N)
  // ==========================================
  const N8N_BASE_URL = 'https://n8n.srv1496054.hstgr.cloud';
  
  // Endpoints
  const N8N_CRIAR_PROJETO_URL = `${N8N_BASE_URL}/webhook/criar-projeto`;
  const N8N_SALVAR_PROCESSO_URL = `${N8N_BASE_URL}/webhook-test/salvar-processo`;
  const N8N_LISTAR_PROJETOS_URL = `${N8N_BASE_URL}/webhook-test/listar-projetos`;

  // ==========================================
  // 🧠 ESTADOS GERAIS (Navegação)
  // ==========================================
  const [view, setView] = useState('dashboard'); // 'dashboard' ou 'builder'
  const [mode, setMode] = useState('consultant'); // 'consultant' ou 'client'
  const [activeTab, setActiveTab] = useState('sipoc');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncStatus, setSyncStatus] = useState({});
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // ==========================================
  // 🗂️ LÓGICA DOS PROJETOS (DASHBOARD)
  // ==========================================
  const [projetos, setProjetos] = useState(() => {
    const saved = localStorage.getItem('p_excellence_projects');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [activeProject, setActiveProject] = useState(null);

  useEffect(() => {
    localStorage.setItem('p_excellence_projects', JSON.stringify(projetos));
  }, [projetos]);

  // Carrega projetos do n8n ao iniciar
  const carregarProjetos = async () => {
    setIsLoadingProjects(true);
    try {
      const response = await fetch(N8N_LISTAR_PROJETOS_URL);
      if (!response.ok) throw new Error('Falha ao carregar projetos');
      const data = await response.json();
      
      if (data.success && data.projetos) {
        // Mescla com projetos locais (mantém spreadsheetId local se existir)
        const projetosAtualizados = data.projetos.map(p => {
          const local = projetos.find(lp => lp.empresa === p.empresa);
          return {
            id: p.id,
            empresa: p.empresa,
            spreadsheetId: local?.spreadsheetId || p.id, // Usa o ID da pasta como fallback
            spreadsheetUrl: p.folderUrl,
            dataCriacao: p.createdTime ? new Date(p.createdTime).toLocaleDateString() : 'N/A'
          };
        });
        setProjetos(projetosAtualizados);
      }
    } catch (err) {
      console.error('Erro ao carregar projetos:', err);
      // Mantém projetos locais se falhar
    } finally {
      setIsLoadingProjects(false);
    }
  };

  useEffect(() => {
    carregarProjetos();
  }, []);

  const criarNovoProjeto = async (e) => {
    e.preventDefault();
    const nomeEmpresa = e.target.empresa.value;
    if (!nomeEmpresa) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(N8N_CRIAR_PROJETO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa: nomeEmpresa })
      });
      
      if (!response.ok) throw new Error('Falha no Webhook de criação');
      const data = await response.json();
      
      if (!data.success) throw new Error(data.message || 'Erro ao criar projeto');
      
      const novoProjeto = {
        id: `proj_${Date.now()}`,
        empresa: data.empresa || nomeEmpresa,
        spreadsheetId: data.spreadsheetId,
        spreadsheetUrl: data.spreadsheetUrl,
        dataCriacao: new Date().toLocaleDateString()
      };

      setProjetos([...projetos, novoProjeto]);
      e.target.reset();
      alert(`✅ Projeto "${nomeEmpresa}" criado com sucesso!\n\nPlanilha: ${data.spreadsheetUrl}`);
    } catch (err) {
      console.error(err);
      alert("❌ Erro ao criar projeto. Verifique se o Workflow do n8n está ativo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==========================================
  // 📝 LÓGICA DO BUILDER (SIPOC & RASCI)
  // ==========================================
  const defaultProcess = {
    id: 'p1', setor: 'Geral', name: 'Processo Inicial',
    suppliers: [''], inputs: [''], outputs: [''], customers: [''],
    ferramentas: [], periodicidade: '', tipo: '', inputsPadronizados: '', outputsPadronizados: '', 
    geridoDados: '', tecnologia: '', maturidade: '', esforco: '', impacto: '', observacoes: '',
    rasci: { r: [], a: [], s: [], c: [], i: [] }
  };

  const [processes, setProcesses] = useState([]);
  const [activeProcessId, setActiveProcessId] = useState(null);

  const selecionarProjeto = (proj) => {
    setActiveProject(proj);
    // Tenta carregar processos guardados especificamente para ESTE projeto
    const savedProcesses = localStorage.getItem(`processes_${proj.id}`);
    
    if (savedProcesses) {
      setProcesses(JSON.parse(savedProcesses));
      setActiveProcessId(JSON.parse(savedProcesses)[0].id);
    } else {
      setProcesses([defaultProcess]);
      setActiveProcessId('p1');
    }
    setView('builder');
  };

  // Guarda os processos localmente sempre que há alterações (separado por projeto)
  useEffect(() => {
    if (activeProject && processes.length > 0) {
      localStorage.setItem(`processes_${activeProject.id}`, JSON.stringify(processes));
    }
  }, [processes, activeProject]);

  const activeProcessIndex = processes.findIndex(p => p.id === activeProcessId);
  const current = processes[activeProcessIndex] || defaultProcess;

  const processosPorSetor = useMemo(() => {
    return processes.reduce((acc, curr) => {
      if (!acc[curr.setor]) acc[curr.setor] = [];
      acc[curr.setor].push(curr);
      return acc;
    }, {});
  }, [processes]);

  const globalOutputs = useMemo(() => {
    return processes.flatMap(p => 
      p.outputs.filter(o => o.trim() !== '').map(out => ({ processo: p.name, output: out }))
    );
  }, [processes]);

  const camposObrigatoriosSIPOC = [
    'periodicidade', 'tipo', 'inputsPadronizados', 'outputsPadronizados', 
    'geridoDados', 'tecnologia', 'maturidade', 'esforco', 'impacto'
  ];

  const getProcessProgress = (proc) => {
    let filled = camposObrigatoriosSIPOC.filter(f => proc[f] !== '').length;
    if (proc.ferramentas && proc.ferramentas.length > 0) filled += 1;
    if (proc.rasci && proc.rasci.r.length > 0) filled += 1;
    return Math.round((filled / (camposObrigatoriosSIPOC.length + 2)) * 100);
  };

  const markAsDraft = () => {
    if (syncStatus[activeProcessId] === 'synced') {
      setSyncStatus(prev => ({ ...prev, [activeProcessId]: 'draft' }));
    }
  };

  const guardarProcessoN8N = async () => {
    if (getProcessProgress(current) < 100) {
      alert("⚠️ Preencha todos os campos obrigatórios (incluindo Responsável na RASCI) antes de guardar.");
      return;
    }
    if (!activeProject?.spreadsheetId) {
      alert("❌ Erro: ID da planilha não encontrado. O projeto foi criado corretamente?");
      return;
    }

    setIsSubmitting(true);

    // Payload ajustado para bater com as colunas da planilha
    const payload = {
      spreadsheetId: activeProject.spreadsheetId,
      processo: {
        "ID": current.id,
        "Supplier": current.suppliers.filter(s => s.trim()).join(' | '),
        "Input": current.inputs.filter(i => i.trim()).join(' | '),
        "Processos": current.name,
        "Output": current.outputs.filter(o => o.trim()).join(' | '),
        "Customer": current.customers.filter(c => c.trim()).join(' | '),
        "Área executora": current.setor,
        "Periodicidade": current.periodicidade,
        "Ferramentas": current.ferramentas.join(' | '),
        "Inputs padronizados?": current.inputsPadronizados,
        "Outputs padronizados?": current.outputsPadronizados,
        "Gerido através de dados?": current.geridoDados,
        "Classificação Técnologia": current.tecnologia,
        "Maturidade do processo": current.maturidade,
        "Volume e esforço": current.esforco,
        "Tipo": current.tipo,
        "Impacto no negócio": current.impacto,
        "Observações": current.observacoes,
        "Responsável": current.rasci.r.join(' | '),
        "Aprovador": current.rasci.a.join(' | '),
        "Suporte": current.rasci.s.join(' | '),
        "Consultado": current.rasci.c.join(' | '),
        "Informado": current.rasci.i.join(' | ')
      }
    };

    try {
      const response = await fetch(N8N_SALVAR_PROCESSO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) throw new Error('Falha ao comunicar com o n8n');
      
      const data = await response.json();
      if (!data.success) throw new Error(data.message || 'Erro ao salvar');
      
      setSyncStatus(prev => ({ ...prev, [current.id]: 'synced' }));
      alert('✅ Processo salvo na planilha!');
    } catch (error) {
      console.error(error);
      alert("❌ Erro ao guardar na base de dados. Verifique se o Workflow está ativo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Funções de Manipulação
  const updateProcessField = (field, value) => { markAsDraft(); const updated = [...processes]; updated[activeProcessIndex][field] = value; setProcesses(updated); };
  const updateRasciField = (letter, tags) => { markAsDraft(); const updated = [...processes]; updated[activeProcessIndex].rasci[letter] = tags; setProcesses(updated); };
  const updateArrayItem = (field, index, value) => { markAsDraft(); const updated = [...processes]; updated[activeProcessIndex][field][index] = value; setProcesses(updated); };
  const removeArrayItem = (field, index) => { markAsDraft(); const updated = [...processes]; if (updated[activeProcessIndex][field].length > 1) { updated[activeProcessIndex][field].splice(index, 1); setProcesses(updated); } };
  const addArrayItem = (field) => { markAsDraft(); const updated = [...processes]; updated[activeProcessIndex][field] = [...updated[activeProcessIndex][field], '']; setProcesses(updated); };

  // ==========================================
  // 🧩 COMPONENTES DE UI
  // ==========================================
  const TagsInput = ({ tags, onChange, placeholder, label, colorClass }) => {
    const [inputValue, setInputValue] = useState('');
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const newTag = inputValue.trim();
        if (newTag && !tags.includes(newTag)) { onChange([...tags, newTag]); setInputValue(''); }
      }
    };
    return (
      <div>
        <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">{label}</label>
        <div className={`mt-1 p-2 min-h-[42px] rounded-lg border border-slate-300 bg-white flex flex-wrap gap-2 focus-within:ring-1 transition-all ${colorClass || 'focus-within:border-blue-500 focus-within:ring-blue-500'}`}>
          {tags.map((tag, index) => (
            <span key={index} className="bg-slate-800 text-white text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1 shadow-sm">
              {tag} <button type="button" onClick={() => onChange(tags.filter((_, i) => i !== index))} className="text-slate-300 hover:text-white transition-colors ml-1">✕</button>
            </span>
          ))}
          <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={handleKeyDown} placeholder={tags.length === 0 ? placeholder : "Escreva e Enter..."} className="flex-1 bg-transparent outline-none text-sm min-w-[120px] text-slate-700" />
        </div>
      </div>
    );
  };

  const SIPOCColumn = ({ title, items, field, isInput }) => (
    <div className="flex flex-col h-full shadow-sm rounded-xl bg-white border border-slate-200 overflow-hidden">
      <div className="text-center py-2 bg-slate-800 text-white font-bold text-xs uppercase tracking-wider">{title}</div>
      <div className="flex-1 p-3 space-y-2 bg-slate-50 min-h-[250px]">
        {items.map((item, idx) => (
          <div key={idx} className="flex gap-1 group relative">
            {isInput ? (
              <div className="flex-1 relative">
                <input type="text" list="global-outputs-list" value={item} onChange={(e) => updateArrayItem(field, idx, e.target.value)} placeholder="Escreva..." className="w-full px-2 py-1.5 rounded border border-slate-300 text-sm focus:outline-none focus:border-blue-500 bg-white" />
                <datalist id="global-outputs-list">{globalOutputs.map((out, i) => <option key={i} value={out.output}>Saída de: {out.processo}</option>)}</datalist>
              </div>
            ) : (
              <input type="text" value={item} onChange={(e) => updateArrayItem(field, idx, e.target.value)} placeholder={`${title}...`} className="flex-1 px-2 py-1.5 rounded border border-slate-300 text-sm focus:outline-none focus:border-blue-500 bg-white" />
            )}
            {items.length > 1 && <button onClick={() => removeArrayItem(field, idx)} className="opacity-0 group-hover:opacity-100 px-2 text-red-500 hover:text-red-700 absolute right-0 top-1">✕</button>}
          </div>
        ))}
        <button onClick={() => addArrayItem(field)} className="w-full py-2 rounded border border-dashed border-slate-300 text-xs font-semibold text-slate-500 hover:bg-slate-100 mt-2">+ Adicionar</button>
      </div>
    </div>
  );

  const SelectField = ({ label, value, field, options }) => (
    <div>
      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">{label}</label>
      <select value={value} onChange={(e) => updateProcessField(field, e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-500 focus:ring-1 outline-none bg-white">
        <option value="">Selecione...</option>
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  );

  // ==========================================
  // 🖥️ RENDERIZAÇÃO DA PÁGINA
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800 flex flex-col">
      {/* HEADER */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold text-xl shadow-inner">P</div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">P-EXCELLENCE</h1>
              <p className="text-xs text-slate-400 font-medium tracking-wide">
                {view === 'dashboard' ? 'Painel do Consultor' : `CLIENTE: ${activeProject?.empresa}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {view === 'builder' && (
              <button onClick={() => setView('dashboard')} className="text-xs text-slate-300 hover:text-white font-medium underline">
                ← Voltar ao Dashboard
              </button>
            )}
            <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
              <button onClick={() => setMode('consultant')} className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${mode === 'consultant' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>Consultor</button>
              <button onClick={() => setMode('client')} className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${mode === 'client' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>Cliente</button>
            </div>
          </div>
        </div>
      </header>

      {/* VIEW: DASHBOARD */}
      {view === 'dashboard' && (
        <main className="max-w-5xl mx-auto w-full p-8 space-y-8 flex-1">
          <section className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-xl font-bold mb-6 text-slate-800 flex items-center gap-2">🚀 Iniciar Novo Projeto</h2>
            <form onSubmit={criarNovoProjeto} className="flex gap-4">
              <input name="empresa" placeholder="Nome da Empresa Cliente" className="flex-1 px-4 py-3 rounded-xl border border-slate-300 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" required />
              <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50">
                {isSubmitting ? 'Criando...' : 'Criar Projeto'}
              </button>
            </form>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Projetos em Andamento</h2>
              <button 
                onClick={carregarProjetos} 
                disabled={isLoadingProjects}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              >
                {isLoadingProjects ? '⏳ Carregando...' : '🔄 Atualizar lista'}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projetos.map(p => (
                <div key={p.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group" onClick={() => selecionarProjeto(p)}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-lg text-slate-800 group-hover:text-blue-600 transition-colors">{p.empresa}</h3>
                      <p className="text-xs text-slate-400 mt-1">Criado em: {p.dataCriacao}</p>
                    </div>
                    <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold border border-green-200">ATIVO</span>
                  </div>
                  <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded truncate border border-slate-100">
                    📊 ID: {p.spreadsheetId?.substring(0, 20)}...
                  </div>
                  {p.spreadsheetUrl && (
                    <a 
                      href={p.spreadsheetUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-blue-500 hover:text-blue-700 mt-2 inline-block"
                    >
                      🔗 Abrir Planilha
                    </a>
                  )}
                </div>
              ))}
              {projetos.length === 0 && (
                <div className="col-span-2 text-center p-10 border-2 border-dashed border-slate-300 rounded-2xl text-slate-400">
                  {isLoadingProjects ? '⏳ Carregando projetos...' : 'Nenhum projeto registado. Crie o seu primeiro cliente acima.'}
                </div>
              )}
            </div>
          </section>
        </main>
      )}

      {/* VIEW: BUILDER (SIPOC + RASCI) */}
      {view === 'builder' && (
        <div className="max-w-[1400px] mx-auto px-6 py-8 flex gap-6 flex-1 w-full h-full">
          {/* BARRA LATERAL */}
          <aside className="w-64 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-fit max-h-[80vh]">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Processos</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {Object.entries(processosPorSetor).map(([setor, procs]) => (
                <div key={setor}>
                  <div className="px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 rounded-md mb-2 flex items-center justify-between">
                    <span>{setor}</span>
                    <span className="text-slate-400 text-[10px]">{procs.length}</span>
                  </div>
                  <div className="space-y-1 ml-2 border-l-2 border-slate-100 pl-2">
                    {procs.map(p => {
                      const prog = getProcessProgress(p);
                      const isSynced = syncStatus[p.id] === 'synced';
                      return (
                        <button key={p.id} onClick={() => setActiveProcessId(p.id)} className={`w-full text-left px-3 py-2 rounded-md text-sm transition-all flex justify-between items-center ${activeProcessId === p.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
                          <span className="truncate pr-2">{p.name || 'Novo Processo'}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${isSynced ? 'bg-green-100 text-green-700' : (prog >= 100 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500')}`}>
                            {isSynced ? '✅' : `${Math.min(prog, 100)}%`}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              {mode === 'consultant' && (
                <button 
                  onClick={() => {
                    const newId = `p${Date.now()}`;
                    const novoSetor = prompt('Nome do Setor/Área:', 'Geral') || 'Geral';
                    setProcesses([...processes, { ...defaultProcess, id: newId, name: 'Novo Processo', setor: novoSetor }]);
                    setActiveProcessId(newId);
                  }} 
                  className="w-full py-2 rounded-lg border-2 border-dashed border-slate-200 text-xs font-bold text-slate-400 hover:text-blue-600 hover:border-blue-400 transition-all mt-4"
                >
                  + Adicionar Processo
                </button>
              )}
            </div>
          </aside>

          {/* ÁREA PRINCIPAL */}
          <main className="flex-1 flex flex-col">
            <div className="flex gap-2 mb-6">
              <button onClick={() => setActiveTab('sipoc')} className={`px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-sm ${activeTab === 'sipoc' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`}>📋 Mapeamento SIPOC</button>
              <button onClick={() => setActiveTab('rasci')} className={`px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-sm ${activeTab === 'rasci' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`}>👥 Matriz RASCI</button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 relative flex flex-col min-h-[600px]">
              <div className="mb-8 border-b border-slate-100 pb-6 flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Setor:</span>
                    {mode === 'consultant' ? (
                      <input 
                        type="text" 
                        value={current.setor} 
                        onChange={(e) => updateProcessField('setor', e.target.value)} 
                        className="text-xs font-bold text-blue-600 uppercase tracking-wider bg-blue-50 px-2 py-1 rounded border border-blue-200 focus:outline-none focus:border-blue-400"
                      />
                    ) : (
                      <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">{current.setor}</span>
                    )}
                  </div>
                  <input type="text" value={current.name} onChange={(e) => updateProcessField('name', e.target.value)} disabled={mode === 'client'} className="w-full text-3xl font-bold bg-transparent focus:outline-none focus:border-b-2 border-blue-500 transition-all text-slate-800 disabled:border-none py-1" />
                </div>
                
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 font-medium">
                    {syncStatus[current.id] === 'synced' ? '✅ Salvo na planilha' : '📝 Rascunho local'}
                  </span>
                  <button onClick={guardarProcessoN8N} disabled={isSubmitting || syncStatus[current.id] === 'synced'} className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center shadow-sm ${syncStatus[current.id] === 'synced' ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' : (getProcessProgress(current) >= 100 ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200' : 'bg-slate-800 text-white cursor-pointer')}`}>
                    {isSubmitting ? '⏳ Salvando...' : (syncStatus[current.id] === 'synced' ? '✅ Salvo' : '💾 Salvar')}
                  </button>
                </div>
              </div>

              {/* CONTEÚDO TAB: SIPOC */}
              {activeTab === 'sipoc' && (
                mode === 'consultant' ? (
                  <div className="grid grid-cols-5 gap-4">
                    <SIPOCColumn title="Suppliers" items={current.suppliers} field="suppliers" />
                    <SIPOCColumn title="Inputs" items={current.inputs} field="inputs" isInput={true} />
                    <div className="flex flex-col h-full shadow-sm rounded-xl bg-white border border-slate-200 overflow-hidden">
                      <div className="text-center py-2 bg-blue-700 text-white font-bold text-xs uppercase tracking-wider">Process</div>
                      <div className="flex-1 p-4 flex items-center justify-center bg-blue-50/50 min-h-[250px] text-center"><div className="font-bold text-blue-900">{current.name}</div></div>
                    </div>
                    <SIPOCColumn title="Outputs" items={current.outputs} field="outputs" />
                    <SIPOCColumn title="Customers" items={current.customers} field="customers" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-8 flex-1">
                    <div className="space-y-6">
                      <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
                        <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide border-b border-slate-200 pb-2">Informações Gerais</h3>
                        <SelectField label="Periodicidade" value={current.periodicidade} field="periodicidade" options={['Diário', 'Semanal', 'Quinzenal', 'Mensal', 'Semestral', 'Anual']} />
                        <SelectField label="Tipo do Processo" value={current.tipo} field="tipo" options={['Principal', 'Apoio', 'Gestão']} />
                        <TagsInput tags={current.ferramentas} onChange={(newTags) => updateProcessField('ferramentas', newTags)} placeholder="Ex: SAP, Trello..." label="Ferramentas (Sistemas, ERPs)" />
                      </div>
                      <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
                        <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide border-b border-slate-200 pb-2">Padronização</h3>
                        <SelectField label="Inputs padronizados?" value={current.inputsPadronizados} field="inputsPadronizados" options={['Sim', 'Não']} />
                        <SelectField label="Outputs padronizados?" value={current.outputsPadronizados} field="outputsPadronizados" options={['Sim', 'Não']} />
                        <SelectField label="Gerido através de dados?" value={current.geridoDados} field="geridoDados" options={['Sim', 'Não']} />
                      </div>
                    </div>
                    <div className="space-y-6">
                      <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
                        <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide border-b border-slate-200 pb-2">Maturidade & Impacto</h3>
                        <SelectField label="Classificação Tecnologia" value={current.tecnologia} field="tecnologia" options={['Manual', 'Semimanual', 'Automatizado']} />
                        <SelectField label="Maturidade do processo" value={current.maturidade} field="maturidade" options={['Baixo', 'Médio', 'Alto']} />
                        <SelectField label="Volume e esforço" value={current.esforco} field="esforco" options={['Baixo', 'Médio', 'Alto']} />
                        <SelectField label="Impacto no negócio" value={current.impacto} field="impacto" options={['Baixo', 'Médio', 'Alto']} />
                      </div>
                      <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
                        <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide border-b border-slate-200 pb-2">Observações (Gargalos e Dores)</h3>
                        <textarea value={current.observacoes} onChange={(e) => updateProcessField('observacoes', e.target.value)} placeholder="Adicione notas, gargalos ou detalhes adicionais..." className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-blue-500 outline-none bg-white resize-none h-24" />
                      </div>
                    </div>
                  </div>
                )
              )}

              {/* CONTEÚDO TAB: RASCI */}
              {activeTab === 'rasci' && (
                <div className="flex-1">
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-8">
                    <h3 className="font-bold text-blue-800 mb-2">Como preencher a Matriz RASCI?</h3>
                    <p className="text-sm text-blue-600 mb-4">Adicione os Cargos ou Áreas responsáveis por cada papel. Pressione Enter após escrever cada cargo.</p>
                    <div className="grid grid-cols-5 gap-4 text-xs">
                      <div className="bg-white p-3 rounded-lg shadow-sm border border-blue-100"><strong className="text-slate-800 text-base">R</strong><br/>esponsável (Executa)</div>
                      <div className="bg-white p-3 rounded-lg shadow-sm border border-blue-100"><strong className="text-slate-800 text-base">A</strong><br/>provador (Autoridade)</div>
                      <div className="bg-white p-3 rounded-lg shadow-sm border border-blue-100"><strong className="text-slate-800 text-base">S</strong><br/>uporte (Apoia)</div>
                      <div className="bg-white p-3 rounded-lg shadow-sm border border-blue-100"><strong className="text-slate-800 text-base">C</strong><br/>onsultado (Opina)</div>
                      <div className="bg-white p-3 rounded-lg shadow-sm border border-blue-100"><strong className="text-slate-800 text-base">I</strong><br/>nformado (Avisado)</div>
                    </div>
                  </div>
                  <div className="space-y-5 max-w-3xl">
                    <TagsInput label="R - Responsável (Executa)" tags={current.rasci.r} onChange={(tags) => updateRasciField('r', tags)} placeholder="Ex: Analista Financeiro" colorClass="focus-within:border-blue-500" />
                    <TagsInput label="A - Aprovador (Presta Contas)" tags={current.rasci.a} onChange={(tags) => updateRasciField('a', tags)} placeholder="Ex: Diretor Financeiro" colorClass="focus-within:border-purple-500" />
                    <TagsInput label="S - Suporte (Apoia na execução)" tags={current.rasci.s} onChange={(tags) => updateRasciField('s', tags)} placeholder="Ex: TI" colorClass="focus-within:border-green-500" />
                    <TagsInput label="C - Consultado (Dá opinião antes)" tags={current.rasci.c} onChange={(tags) => updateRasciField('c', tags)} placeholder="Ex: Jurídico" colorClass="focus-within:border-amber-500" />
                    <TagsInput label="I - Informado (Avisado depois)" tags={current.rasci.i} onChange={(tags) => updateRasciField('i', tags)} placeholder="Ex: Equipa Comercial" colorClass="focus-within:border-slate-500" />
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

export default App;