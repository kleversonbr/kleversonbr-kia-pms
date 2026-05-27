import React, { useState, useEffect } from "react";
import { FolderPlus, Trash, Edit, Calendar, DollarSign, Brain, BarChart2, CheckCircle2, Bookmark, ArrowRight, Clock, Plus } from "lucide-react";
import { collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, query, where, getDocs, writeBatch } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebaseInit";
import { Projeto, CicloInput, Marco } from "../types";
import { useNotifications } from "./NotificationToast";

interface ProjectsAdminProps {
  userId: string;
  userEmail: string;
}

export const ProjectsAdmin: React.FC<ProjectsAdminProps> = ({ userId, userEmail }) => {
  const [projects, setProjects] = useState<Projeto[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"cadastros" | "ciclos" | "marcos">("cadastros");
  const { addNotification } = useNotifications();

  // Project Creation/Edit State
  const [pNome, setPNome] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pInicio, setPInicio] = useState("");
  const [pFim, setPFim] = useState("");
  const [pEstagio, setPEstagio] = useState<Projeto["estagio"]>("Ideação");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  // Active Project Data
  const [projectCycles, setProjectCycles] = useState<CicloInput[]>([]);
  const [projectMilestones, setProjectMilestones] = useState<Marco[]>([]);

  // Cycle Input State
  const [cyNome, setCyNome] = useState("");
  const [cyDataRef, setCyDataRef] = useState("");
  const [cyProgresso, setCyProgresso] = useState("50");
  // Finance
  const [fPesPl, setFPesPl] = useState("");
  const [fPesRe, setFPesRe] = useState("");
  const [fInfPl, setFInfPl] = useState("");
  const [fInfRe, setFInfRe] = useState("");
  const [fForPl, setFForPl] = useState("");
  const [fForRe, setFForRe] = useState("");
  // Agile Metrics
  const [apPtsPl, setApPtsPl] = useState("");
  const [apPtsDe, setApPtsDe] = useState("");
  const [apBugs, setApBugs] = useState("");
  const [apHrsPr, setApHrsPr] = useState("");
  const [apHrsGa, setApHrsGa] = useState("");
  const [apEntr, setApEntr] = useState("");

  // Milestone Creation State
  const [mNome, setMNome] = useState("");
  const [mDataLim, setMDataLim] = useState("");

  // Load Projects Realtime
  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, "projetos"), where("userId", "==", userId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Projeto[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Projeto);
        });
        setProjects(list);
        if (list.length > 0 && !selectedProjectId) {
          setSelectedProjectId(list[0].id);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "projetos");
      }
    );
    return () => unsubscribe();
  }, [userId]);

  // Load details (Cycles and Milestones) for the selected project
  useEffect(() => {
    if (!selectedProjectId) {
      setProjectCycles([]);
      setProjectMilestones([]);
      return;
    }

    // Cycles snapshot
    const cyclesQuery = collection(db, "projetos", selectedProjectId, "ciclos");
    const unsubscribeCycles = onSnapshot(
      cyclesQuery,
      (snapshot) => {
        const list: CicloInput[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as CicloInput);
        });
        // Sort chronologically by date
        list.sort((a, b) => a.dataReferencia.localeCompare(b.dataReferencia));
        setProjectCycles(list);
      },
      (error) => {
        console.error("Erro listando ciclos:", error);
      }
    );

    // Milestones snapshot
    const milestonesQuery = collection(db, "projetos", selectedProjectId, "marcos");
    const unsubscribeMilestones = onSnapshot(
      milestonesQuery,
      (snapshot) => {
        const list: Marco[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Marco);
        });
        // Sort by deadline
        list.sort((a, b) => a.dataLimite.localeCompare(b.dataLimite));
        setProjectMilestones(list);
      },
      (error) => {
        console.error("Erro listando marcos:", error);
      }
    );

    return () => {
      unsubscribeCycles();
      unsubscribeMilestones();
    };
  }, [selectedProjectId]);

  // Project submission
  const handleSubmitProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pNome.trim() || !pInicio || !pFim) return;

    try {
      if (editingProjectId) {
        const ref = doc(db, "projetos", editingProjectId);
        await updateDoc(ref, {
          nome: pNome,
          descricao: pDesc,
          dataInicio: pInicio,
          dataFim: pFim,
          estagio: pEstagio,
        });
        addNotification("Projeto Atualizado", `O projeto ${pNome} foi atualizado com sucesso.`, "success");
        setEditingProjectId(null);
      } else {
        const docRef = await addDoc(collection(db, "projetos"), {
          nome: pNome,
          descricao: pDesc,
          dataInicio: pInicio,
          dataFim: pFim,
          estagio: pEstagio,
          progressoManual: 0,
          userId,
          gpEmail: userEmail,
          createdAt: new Date().toISOString(),
        });
        setSelectedProjectId(docRef.id);
        addNotification("Projeto Criado", `O projeto ${pNome} foi inicializado no PPM.`, "success");
      }

      // Reset
      setPNome("");
      setPDesc("");
      setPInicio("");
      setPFim("");
      setPEstagio("Ideação");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "projetos");
    }
  };

  const handleDeleteProject = async (projId: string, name: string) => {
    if (!window.confirm(`AVISO CRÍTICO!\nExcluir o projeto "${name}" apagará permanentemente todos os seus marcos de entrega, alocações e históricos de ciclos. Deseja prosseguir de qualquer forma?`)) return;

    try {
      const batch = writeBatch(db);

      // Delete subcollections cycles
      const cyclesSnap = await getDocs(collection(db, "projetos", projId, "ciclos"));
      cyclesSnap.forEach(item => batch.delete(item.ref));

      // Delete subcollections milestones
      const milestonesSnap = await getDocs(collection(db, "projetos", projId, "marcos"));
      milestonesSnap.forEach(item => batch.delete(item.ref));

      // Query alocacoes for this project
      const allocsSnap = await getDocs(query(collection(db, "alocacoes"), where("projectId", "==", projId)));
      allocsSnap.forEach(item => batch.delete(item.ref));

      // Delete root project
      batch.delete(doc(db, "projetos", projId));

      await batch.commit();

      if (selectedProjectId === projId) {
        setSelectedProjectId("");
      }

      addNotification("Projeto Excluído", `O projeto ${name} e todos os dados correlacionados foram permanentemente expurgados.`, "info");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "projetos");
    }
  };

  const handleEditProject = (proj: Projeto) => {
    setPNome(proj.nome);
    setPDesc(proj.descricao || "");
    setPInicio(proj.dataInicio);
    setPFim(proj.dataFim);
    setPEstagio(proj.estagio);
    setEditingProjectId(proj.id);
    setActiveTab("cadastros");
  };

  // Submit Cycle Input
  const handleSubmitCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !cyNome.trim() || !cyDataRef) return;

    const progNum = parseInt(cyProgresso) || 0;

    try {
      // 1. Save input to subcollection "ciclos"
      await addDoc(collection(db, "projetos", selectedProjectId, "ciclos"), {
        nome: cyNome,
        dataReferencia: cyDataRef,
        progresso: progNum,
        financeiro: {
          pessoasPlanejado: fPesPl ? parseFloat(fPesPl) : 0,
          pessoasReal: fPesRe ? parseFloat(fPesRe) : 0,
          infraPlanejado: fInfPl ? parseFloat(fInfPl) : 0,
          infraReal: fInfRe ? parseFloat(fInfRe) : 0,
          fornecedoresPlanejado: fForPl ? parseFloat(fForPl) : 0,
          fornecedoresReal: fForRe ? parseFloat(fForRe) : 0,
        },
        pontosPlanejados: apPtsPl ? parseInt(apPtsPl) : 0,
        pontosEntregues: apPtsDe ? parseInt(apPtsDe) : 0,
        bugs: apBugs ? parseInt(apBugs) : 0,
        horasPrevistas: apHrsPr ? parseInt(apHrsPr) : 0,
        horasGastas: apHrsGa ? parseInt(apHrsGa) : 0,
        entregasCount: apEntr ? parseInt(apEntr) : 0,
        userId,
        createdAt: new Date().toISOString(),
      });

      // 2. Automatically update the root project's manual progress percentage to synchronize with the latest entered cycle!
      await updateDoc(doc(db, "projetos", selectedProjectId), {
        progressoManual: progNum,
      });

      addNotification("Ciclo Registrado", `Os dados financeiros e de métricas ágeis para "${cyNome}" foram consolidados.`, "success");

      // Reset fields
      setCyNome("");
      setCyDataRef("");
      setCyProgresso("50");
      setFPesPl(""); setFPesRe("");
      setFInfPl(""); setFInfRe("");
      setFForPl(""); setFForRe("");
      setApPtsPl(""); setApPtsDe("");
      setApBugs(""); setApHrsPr(""); setApHrsGa(""); setApEntr("");
    } catch (err) {
      console.error("Erro salvando ciclo:", err);
    }
  };

  const handleDeleteCycle = async (cycleId: string, cycleName: string) => {
    if (!window.confirm(`Deseja apagar o ciclo consolidado "${cycleName}"?`)) return;

    try {
      await deleteDoc(doc(db, "projetos", selectedProjectId, "ciclos", cycleId));
      addNotification("Ciclo Deletado", `Ciclo "${cycleName}" removido do histórico.`, "info");
    } catch (err) {
      console.error("Erro ao deletar ciclo:", err);
    }
  };

  // Submit Milestone (Marco)
  const handleSubmitMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !mNome.trim() || !mDataLim) return;

    try {
      await addDoc(collection(db, "projetos", selectedProjectId, "marcos"), {
        nome: mNome,
        dataLimite: mDataLim,
        concluido: false,
        userId,
        createdAt: new Date().toISOString(),
      });

      addNotification("Marco Adicionado 🎯", `O marco de entrega "${mNome}" foi programado com sucesso para ${mDataLim}.`, "success");

      setMNome("");
      setMDataLim("");
    } catch (err) {
      console.error("Erro de marcos:", err);
    }
  };

  const handleToggleMilestone = async (marcoId: string, currentStatus: boolean, testNome: string) => {
    try {
      await updateDoc(doc(db, "projetos", selectedProjectId, "marcos", marcoId), {
        concluido: !currentStatus,
      });
      addNotification(
        "Marco Atualizado", 
        `Marco "${testNome}" marcado como ${!currentStatus ? "CONCLUÍDO" : "EM ABERTO"}.`, 
        !currentStatus ? "success" : "info"
      );
    } catch (err) {
      console.error("Erro ao alternar marco:", err);
    }
  };

  const handleDeleteMilestone = async (marcoId: string, testNome: string) => {
    try {
      await deleteDoc(doc(db, "projetos", selectedProjectId, "marcos", marcoId));
      addNotification("Marco Removido", `Marco "${testNome}" excluído das metas.`, "info");
    } catch (err) {
      console.error("Erro ao apagar marco:", err);
    }
  };

  const activeProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 text-slate-800">
      
      {/* LEFT COMPONENT COLUMN (xl:col-span-4) - PROJECT LIST & REGISTER FORM */}
      <div className="xl:col-span-4 flex flex-col gap-6">
        
        {/* Project Form Register */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <h2 className="text-lg font-bold font-display text-slate-900 mb-4 flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-indigo-500" />
            {editingProjectId ? "Editar Detalhes do Projeto" : "Novo Cadastro de Projeto"}
          </h2>

          <form onSubmit={handleSubmitProject} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold uppercase text-slate-500 mb-1">Nome do Projeto</label>
              <input
                type="text"
                value={pNome}
                onChange={(e) => setPNome(e.target.value)}
                placeholder="Ex: Novo App KIA"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block font-semibold uppercase text-slate-500 mb-1">Descrição Breve</label>
              <textarea
                value={pDesc}
                onChange={(e) => setPDesc(e.target.value)}
                placeholder="Escopo resumido do projeto executivo..."
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 h-16 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold uppercase text-slate-500 mb-1">Data Início</label>
                <input
                  type="date"
                  value={pInicio}
                  onChange={(e) => setPInicio(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold uppercase text-slate-500 mb-1">Data Conclusão</label>
                <input
                  type="date"
                  value={pFim}
                  onChange={(e) => setPFim(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold uppercase text-slate-500 mb-1">Estágio Inicial / Pipeline</label>
              <select
                value={pEstagio}
                onChange={(e) => setPEstagio(e.target.value as Projeto["estagio"])}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none"
              >
                <option value="Ideação">Ideação</option>
                <option value="Viabilidade">Viabilidade</option>
                <option value="Em Execução">Em Execução</option>
                <option value="Validação/Homologação">Validação/Homologação</option>
                <option value="Concluído">Concluído</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors shadow-sm"
              >
                {editingProjectId ? "Salvar Alterações" : "Salvar Projeto"}
              </button>
              {editingProjectId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingProjectId(null);
                    setPNome("");
                    setPDesc("");
                    setPInicio("");
                    setPFim("");
                  }}
                  className="py-2 px-3 bg-slate-100 hover:bg-slate-250 font-medium rounded-lg"
                >
                  Sair
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Projects Dashboard list selection selector */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex-1">
          <h3 className="font-bold font-display text-slate-900 mb-3 text-sm uppercase tracking-wide">
            Seus Projetos Ativos ({projects.length})
          </h3>

          <div className="space-y-2 overflow-y-auto max-h-[300px] pr-1">
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => setSelectedProjectId(p.id)}
                className={`p-3 rounded-xl border cursor-pointer text-left transition-all ${
                  selectedProjectId === p.id
                    ? "bg-indigo-50/70 border-indigo-200 shadow-sm ring-1 ring-indigo-500/10"
                    : "bg-slate-50/40 border-slate-100 hover:bg-slate-50"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold text-slate-900 text-sm">{p.nome}</h4>
                    <span className="text-[10px] px-2 py-0.5 mt-1 inline-block bg-slate-200/70 text-slate-600 rounded-md font-medium">
                      {p.estagio}
                    </span>
                  </div>

                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleEditProject(p)}
                      className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-white rounded transition-colors"
                      title="Editar"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteProject(p.id, p.nome)}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-white rounded transition-colors"
                      title="Excluir"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span>Progresso:</span>
                  </div>
                  <span className="font-bold text-slate-700">{p.progressoManual}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1 mt-1 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${p.progressoManual}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT WORKBENCH COLUMN (xl:col-span-8) - ACTIVE PROJECT COCKPIT */}
      <div className="xl:col-span-8 flex flex-col">
        {!activeProject ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 my-auto shadow-sm flex flex-col justify-center items-center gap-3">
            <div className="p-4 bg-indigo-50 text-indigo-500 rounded-full">
              <Brain className="w-10 h-10" />
            </div>
            <h3 className="font-bold font-display text-slate-800 text-xl">Nenhum Projeto Ativo Encontrado</h3>
            <p className="text-slate-500 max-w-sm text-sm">
              Por favor, registre seu primeiro projeto no painel esquerdo para habilitar os controles mensais, financeiros e ágeis.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm flex-1 flex flex-col overflow-hidden">
            
            {/* Header project active */}
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Trabalhando no Projeto</span>
                <h1 className="text-2xl font-bold font-display text-slate-900 tracking-tight">{activeProject.nome}</h1>
                <p className="text-sm text-slate-500 mt-1 max-w-xl">{activeProject.descricao || "Sem escopo detalhado registrado."}</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right text-xs">
                  <p className="text-slate-400 font-semibold">PLANEJAMENTO</p>
                  <p className="font-bold text-slate-800 mt-0.5">{activeProject.dataInicio} até {activeProject.dataFim}</p>
                </div>
              </div>
            </div>

            {/* Navigation Tabs bar inside portfolio */}
            <div className="flex border-b border-slate-100 bg-white">
              <button
                onClick={() => setActiveTab("ciclos")}
                className={`flex-1 py-3.5 px-6 font-display font-semibold text-sm border-b-2 transition-all flex items-center justify-center gap-2 ${
                  activeTab === "ciclos"
                    ? "border-indigo-600 text-indigo-600 bg-indigo-50/10"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50/50"
                }`}
              >
                <DollarSign className="w-4 h-4" />
                Painel de Input (Mensal/Sprint)
              </button>

              <button
                onClick={() => setActiveTab("marcos")}
                className={`flex-1 py-3.5 px-6 font-display font-semibold text-sm border-b-2 transition-all flex items-center justify-center gap-2 ${
                  activeTab === "marcos"
                    ? "border-indigo-600 text-indigo-600 bg-indigo-50/10"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50/50"
                }`}
              >
                <Bookmark className="w-4 h-4" />
                Gestão de Marcos (Milestones)
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 max-h-[620px]">
              
              {/* TAB 1: CYCLES / INPUT MIGRATION CHART */}
              {activeTab === "ciclos" && (
                <div className="space-y-8 animate-fade-in">
                  
                  {/* Explanation card of Central Input */}
                  <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl flex items-start gap-3">
                    <BarChart2 className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">Central "Matadora" de Planilhas</h4>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        A cada fim de ciclo (Sprint ou Consolidação do Mês), insira os custos da macrocategoria do período e as métricas ágeis. 
                        O histórico é alimentado permitindo simular curvas reais de Burnup/Bugs e auditoria executiva.
                      </p>
                    </div>
                  </div>

                  {/* Form input cycle */}
                  <form onSubmit={handleSubmitCycle} className="space-y-6 text-sm">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                          Identificação do Período
                        </label>
                        <input
                          type="text"
                          value={cyNome}
                          onChange={(e) => setCyNome(e.target.value)}
                          placeholder="Ex: Sprint 12 ou Maio/2026"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                          Data de Referência
                        </label>
                        <input
                          type="date"
                          value={cyDataRef}
                          onChange={(e) => setCyDataRef(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none"
                          required
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                            % Concluído Acumulado
                          </label>
                          <span className="text-xs font-bold text-indigo-600">{cyProgresso}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={cyProgresso}
                          onChange={(e) => setCyProgresso(e.target.value)}
                          className="w-full text-indigo-600 accent-indigo-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Section: Financial macro categories column */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5 mb-3 flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5" /> A. Tabela Financeira do Período (Consolidado R$)
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Categoria 1: Pessoas */}
                        <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-xl space-y-2">
                          <span className="text-xs font-bold text-slate-800">1. Pessoas (Internos/Alocados)</span>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400">Planejado (PV)</span>
                              <input
                                type="number"
                                placeholder="R$ 40.000"
                                value={fPesPl}
                                onChange={(e) => setFPesPl(e.target.value)}
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded mt-0.5 font-mono text-xs"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400">Real (AC)</span>
                              <input
                                type="number"
                                placeholder="R$ 42.000"
                                value={fPesRe}
                                onChange={(e) => setFPesRe(e.target.value)}
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded mt-0.5 font-mono text-xs"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Categoria 2: Infraestrutura */}
                        <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-xl space-y-2">
                          <span className="text-xs font-bold text-slate-800">2. Infraestrutura (Clouder, SaaS)</span>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400">Planejado (PV)</span>
                              <input
                                type="number"
                                placeholder="R$ 5.000"
                                value={fInfPl}
                                onChange={(e) => setFInfPl(e.target.value)}
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded mt-0.5 font-mono text-xs"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400">Real (AC)</span>
                              <input
                                type="number"
                                placeholder="R$ 4.800"
                                value={fInfRe}
                                onChange={(e) => setFInfRe(e.target.value)}
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded mt-0.5 font-mono text-xs"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Categoria 3: Fornecedores */}
                        <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-xl space-y-2">
                          <span className="text-xs font-bold text-slate-800">3. Fornecedores / Fábricas</span>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400">Planejado (PV)</span>
                              <input
                                type="number"
                                placeholder="R$ 15.000"
                                value={fForPl}
                                onChange={(e) => setFForPl(e.target.value)}
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded mt-0.5 font-mono text-xs"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400">Real (AC)</span>
                              <input
                                type="number"
                                placeholder="R$ 15.000"
                                value={fForRe}
                                onChange={(e) => setFForRe(e.target.value)}
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded mt-0.5 font-mono text-xs"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section: Agile metrics */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5 mb-3 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> B. Evolução Física e Métricas Ágeis
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Pontos Plan.</label>
                          <input
                            type="number"
                            placeholder="30"
                            value={apPtsPl}
                            onChange={(e) => setApPtsPl(e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-slate-50/30"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Pontos Entr.</label>
                          <input
                            type="number"
                            placeholder="28"
                            value={apPtsDe}
                            onChange={(e) => setApPtsDe(e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-slate-50/30"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Defeitos (Bugs)</label>
                          <input
                            type="number"
                            placeholder="3"
                            value={apBugs}
                            onChange={(e) => setApBugs(e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-slate-50/30 text-rose-600 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Horas Previstas</label>
                          <input
                            type="number"
                            placeholder="120"
                            value={apHrsPr}
                            onChange={(e) => setApHrsPr(e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-slate-50/30"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Horas Gastas</label>
                          <input
                            type="number"
                            placeholder="132"
                            value={apHrsGa}
                            onChange={(e) => setApHrsGa(e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-slate-50/30"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Entregas (Deploy)</label>
                          <input
                            type="number"
                            placeholder="5"
                            value={apEntr}
                            onChange={(e) => setApEntr(e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-slate-50/30"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg font-display text-sm transition-all shadow hover:shadow-md cursor-pointer"
                    >
                      Consolidar e Armazenar Dados do Período (Atualiza KPIs)
                    </button>
                  </form>

                  {/* Historical Cycle Table List */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-900 font-display flex items-center gap-1.5">
                      Histórico do Consolidados ({projectCycles.length})
                    </h4>

                    {projectCycles.length === 0 ? (
                      <div className="border border-dashed border-slate-200 text-center py-6 text-slate-400 rounded-xl text-xs">
                        Nenhum ciclo histórico digitado neste projeto ainda.
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-slate-100 rounded-xl">
                        <table className="w-full text-left text-xs text-slate-700">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400">
                              <th className="py-2 px-3">Ciclo</th>
                              <th className="py-2 px-3">Data Ref.</th>
                              <th className="py-2 px-3 text-center">Progresso</th>
                              <th className="py-2 px-3 text-right">Planejado (PV)</th>
                              <th className="py-2 px-3 text-right">Real (AC)</th>
                              <th className="py-2 px-3 text-center">Pts Pr./De.</th>
                              <th className="py-2 px-3 text-center">Bugs</th>
                              <th className="py-2 px-3 text-right">Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {projectCycles.map((cy) => {
                              const pv = (cy.financeiro?.pessoasPlanejado || 0) + (cy.financeiro?.infraPlanejado || 0) + (cy.financeiro?.fornecedoresPlanejado || 0);
                              const ac = (cy.financeiro?.pessoasReal || 0) + (cy.financeiro?.infraReal || 0) + (cy.financeiro?.fornecedoresReal || 0);

                              return (
                                <tr key={cy.id} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="py-2 px-3 font-semibold text-slate-900">{cy.nome}</td>
                                  <td className="py-2 px-3">{cy.dataReferencia}</td>
                                  <td className="py-2 px-3 text-center font-bold text-indigo-600">{cy.progresso}%</td>
                                  <td className="py-2 px-3 text-right font-mono">R$ {pv.toLocaleString()}</td>
                                  <td className="py-2 px-3 text-right font-mono text-slate-900">R$ {ac.toLocaleString()}</td>
                                  <td className="py-2 px-3 text-center font-mono">{cy.pontosPlanejados}/{cy.pontosEntregues}</td>
                                  <td className="py-2 px-3 text-center font-mono font-bold text-rose-500">{cy.bugs}</td>
                                  <td className="py-2 px-3 text-right">
                                    <button
                                      onClick={() => handleDeleteCycle(cy.id, cy.nome)}
                                      className="p-1 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors text-slate-400"
                                      title="Apagar Período"
                                    >
                                      <Trash className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: MILESTONES (MARCOS) */}
              {activeTab === "marcos" && (
                <div className="space-y-6 animate-fade-in">
                  
                  {/* Create Milestone form */}
                  <form onSubmit={handleSubmitMilestone} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end bg-slate-50 p-4 rounded-xl border border-slate-150">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                        Nome do Marco de Entrega Critíca
                      </label>
                      <input
                        type="text"
                        value={mNome}
                        onChange={(e) => setMNome(e.target.value)}
                        placeholder="Ex: Entrega do Protótipo Funcional ou Homologação Inicial"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none"
                        required
                      />
                    </div>

                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                          Data Limite
                        </label>
                        <input
                          type="date"
                          value={mDataLim}
                          onChange={(e) => setMDataLim(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none"
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow transition-all flex items-center justify-center gap-1 flex-shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" /> Adicionar
                      </button>
                    </div>
                  </form>

                  {/* List of Milestones */}
                  <div className="space-y-3">
                    <h3 className="font-bold text-slate-900 font-display text-base uppercase tracking-wider">
                      Marcos Cadastrados ({projectMilestones.length})
                    </h3>

                    {projectMilestones.length === 0 ? (
                      <div className="border border-dashed border-slate-200 text-center py-10 text-slate-400 rounded-2xl text-xs">
                        Nenhum marco cadastrado para o projeto. Adicione um evento de entrega acima para visualizar no Gantt.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {projectMilestones.map((m) => {
                          const limitDate = new Date(m.dataLimite);
                          const today = new Date();
                          today.setHours(0,0,0,0);
                          const isOverdue = limitDate < today && !m.concluido;

                          return (
                            <div
                              key={m.id}
                              className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                                m.concluido
                                  ? "bg-slate-50 border-slate-200 opacity-75"
                                  : isOverdue
                                  ? "bg-rose-50 border-rose-200"
                                  : "bg-white border-slate-200 hover:shadow-xs"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => handleToggleMilestone(m.id, m.concluido, m.nome)}
                                  className={`p-1 rounded-full border transition-all ${
                                    m.concluido
                                      ? "bg-indigo-600 text-white border-indigo-600"
                                      : isOverdue
                                      ? "bg-white border-rose-400 text-rose-500 hover:bg-rose-100"
                                      : "bg-white border-slate-300 text-slate-400 hover:bg-slate-100"
                                  }`}
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>

                                <div>
                                  <p className={`text-sm font-semibold ${m.concluido ? "line-through text-slate-500" : "text-slate-900"}`}>
                                    {m.nome}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                                      <Calendar className="w-3 h-3" /> Data limite: {m.dataLimite}
                                    </span>
                                    {m.concluido ? (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                                        Concluído
                                      </span>
                                    ) : isOverdue ? (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 bg-rose-100 text-rose-700 animate-pulse rounded">
                                        💥 ATRASADO!
                                      </span>
                                    ) : (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">
                                        Ativo
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <button
                                onClick={() => handleDeleteMilestone(m.id, m.nome)}
                                className="p-1 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors text-slate-400"
                                title="Remover Marco"
                              >
                                <Trash className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
