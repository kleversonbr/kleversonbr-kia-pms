import React, { useState, useEffect } from "react";
import { UserPlus, Trash, AlertCircle, Edit, Users, FolderKanban, TrendingUp, DollarSign } from "lucide-react";
import { collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, query, where, writeBatch } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebaseInit";
import { Colaborador, Alocacao, Projeto, Squad } from "../types";
import { useNotifications } from "./NotificationToast";
import { Layers } from "lucide-react";
import { getSquadColorClasses } from "../utils/squadColors";

interface ResourceMatrixProps {
  userId: string;
  projects: Projeto[];
  filterSquadId?: string;
  filterProjectId?: string;
}

export const ResourceMatrix: React.FC<ResourceMatrixProps> = ({ userId, projects, filterSquadId = "", filterProjectId = "" }) => {
  const [collaborators, setCollaborators] = useState<Colaborador[]>([]);
  const [allocations, setAllocations] = useState<Alocacao[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const { addNotification } = useNotifications();

  // Filtered definitions for modular viewing
  const filteredProjects = React.useMemo(() => {
    return projects.filter((p) => {
      const matchSquad = !filterSquadId || p.squadId === filterSquadId;
      const matchProject = !filterProjectId || p.id === filterProjectId;
      return matchSquad && matchProject;
    });
  }, [projects, filterSquadId, filterProjectId]);

  const filteredSquads = React.useMemo(() => {
    return squads.filter((s) => !filterSquadId || s.id === filterSquadId);
  }, [squads, filterSquadId]);

  const filteredCollaborators = React.useMemo(() => {
    return collaborators.filter((c) => {
      return !filterSquadId || c.squadId === filterSquadId;
    });
  }, [collaborators, filterSquadId]);

  const filteredAllocations = React.useMemo(() => {
    return allocations.filter((a) => {
      const colMatches = !filterSquadId || collaborators.some(c => c.id === a.colaboradorId && c.squadId === filterSquadId);
      const projMatches = filteredProjects.some(p => p.id === a.projectId);
      return colMatches && projMatches;
    });
  }, [allocations, filterSquadId, collaborators, filteredProjects]);

  // Dialog/Inputs State for Squad
  const [sNome, setSNome] = useState("");
  const [sTamanho, setSTamanho] = useState("");
  const [sMetaBugs, setSMetaBugs] = useState("");
  const [sMetaEficiencia, setSMetaEficiencia] = useState("");
  const [sMetaAtrasos, setSMetaAtrasos] = useState("");
  const [sMetaSla, setSMetaSla] = useState("");
  const [editingSquadId, setEditingSquadId] = useState<string | null>(null);

  // Dialog/Inputs State for Collaborator
  const [cNome, setCNome] = useState("");
  const [cPapel, setCPapel] = useState("Dev");
  const [cCusto, setCCusto] = useState("");
  const [cSquadId, setCSquadId] = useState("");
  const [editingCollaboratorId, setEditingCollaboratorId] = useState<string | null>(null);

  // Dialog/Inputs State for Allocation
  const [selectedColabId, setSelectedColabId] = useState("");
  const [selectedProjId, setSelectedProjId] = useState("");
  const [dedicationPct, setDedicationPct] = useState("100");

  // Load collaborators in real-time
  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, "colaboradores"), where("userId", "==", userId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Colaborador[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Colaborador);
        });
        // Sort alphabetically
        list.sort((a, b) => a.nome.localeCompare(b.nome));
        setCollaborators(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "colaboradores");
      }
    );
    return () => unsubscribe();
  }, [userId]);

  // Load squads in real-time
  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, "squads"), where("userId", "==", userId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Squad[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Squad);
        });
        // Sort alphabetically
        list.sort((a, b) => a.nome.localeCompare(b.nome));
        setSquads(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "squads");
      }
    );
    return () => unsubscribe();
  }, [userId]);

  // Load allocations in real-time
  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, "alocacoes"), where("userId", "==", userId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Alocacao[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Alocacao);
        });
        setAllocations(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, "alocacoes");
      }
    );
    return () => unsubscribe();
  }, [userId]);

  // Calculate allocation totals per collaborator to check overallocation
  const allocationSumMap = React.useMemo(() => {
    const map: { [colabId: string]: number } = {};
    allocations.forEach((alloc) => {
      map[alloc.colaboradorId] = (map[alloc.colaboradorId] || 0) + alloc.percentualDedication;
    });
    return map;
  }, [allocations]);

  // Check overallocation and send alert notifications
  useEffect(() => {
    collaborators.forEach((colab) => {
      const totalAllocSum = allocationSumMap[colab.id] || 0;
      if (totalAllocSum > 100) {
        addNotification(
          "Alerta de Sobrealocação! ⚠️",
          `${colab.nome} está alocado(a) a ${totalAllocSum}% – ajuste sua matriz para evitar sobrecarregá-lo(a).`,
          "warning"
        );
      }
    });
  }, [allocationSumMap, collaborators]);

  // Handle addition or editing of Squad
  const handleSubmitSquad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sNome.trim()) return;

    const tamanhoNum = sTamanho ? parseInt(sTamanho) : 0;
    const mb = sMetaBugs ? parseFloat(sMetaBugs) : 0;
    const me = sMetaEficiencia ? parseFloat(sMetaEficiencia) : 0;
    const ma = sMetaAtrasos ? parseFloat(sMetaAtrasos) : 0;
    const ms = sMetaSla ? parseFloat(sMetaSla) : 0;

    try {
      if (editingSquadId) {
        // Edit existing
        const ref = doc(db, "squads", editingSquadId);
        await updateDoc(ref, {
          nome: sNome,
          tamanho: tamanhoNum,
          metaBugs: mb,
          metaEficiencia: me,
          metaAtrasos: ma,
          metaSla: ms,
        });
        addNotification("Squad Atualizada", `${sNome} foi atualizada com sucesso.`, "success");
        setEditingSquadId(null);
      } else {
        // Create new
        await addDoc(collection(db, "squads"), {
          nome: sNome,
          tamanho: tamanhoNum,
          metaBugs: mb,
          metaEficiencia: me,
          metaAtrasos: ma,
          metaSla: ms,
          userId,
          createdAt: new Date().toISOString(),
        });
        addNotification("Nova Squad Cadastrada", `${sNome} foi cadastrada com sucesso.`, "success");
      }
      setSNome("");
      setSTamanho("");
      setSMetaBugs("");
      setSMetaEficiencia("");
      setSMetaAtrasos("");
      setSMetaSla("");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "squads");
    }
  };

  const handleEditSquad = (squad: Squad) => {
    setSNome(squad.nome);
    setSTamanho(squad.tamanho.toString());
    setSMetaBugs(squad.metaBugs.toString());
    setSMetaEficiencia(squad.metaEficiencia.toString());
    setSMetaAtrasos(squad.metaAtrasos.toString());
    setSMetaSla(squad.metaSla.toString());
    setEditingSquadId(squad.id);
  };

  const handleDeleteSquad = async (squadId: string, name: string) => {
    if (!window.confirm(`Deseja realmente excluir a squad ${name}? Todos os colaboradores vinculados a ela serão desvinculados.`)) return;

    try {
      const affectedColabs = collaborators.filter(c => c.squadId === squadId);
      const batch = writeBatch(db);
      
      affectedColabs.forEach(c => {
        batch.update(doc(db, "colaboradores", c.id), {
          squadId: "",
          squadNome: "",
        });
      });
      
      batch.delete(doc(db, "squads", squadId));
      await batch.commit();

      addNotification("Squad Removida", `${name} foi removida com sucesso.`, "success");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "squads");
    }
  };

  // Handle addition or editing of Collaborator
  const handleSubmitCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cNome.trim()) return;

    const selectedSquad = squads.find((s) => s.id === cSquadId);
    const squadNomeStr = selectedSquad ? selectedSquad.nome : "";

    try {
      if (editingCollaboratorId) {
        // Edit existing
        const ref = doc(db, "colaboradores", editingCollaboratorId);
        await updateDoc(ref, {
          nome: cNome,
          papel: cPapel,
          custoHora: cCusto ? parseFloat(cCusto) : 0,
          squadId: cSquadId,
          squadNome: squadNomeStr,
        });
        addNotification("Colaborador Atualizado", `${cNome} foi atualizado com sucesso.`, "success");
        setEditingCollaboratorId(null);
      } else {
        // Create new
        await addDoc(collection(db, "colaboradores"), {
          nome: cNome,
          papel: cPapel,
          custoHora: cCusto ? parseFloat(cCusto) : 0,
          squadId: cSquadId,
          squadNome: squadNomeStr,
          userId,
          createdAt: new Date().toISOString(),
        });
        addNotification("Novo Colaborador Cadastrado", `${cNome} foi adicionado ao banco de talentos.`, "success");
      }
      setCNome("");
      setCCusto("");
      setCSquadId("");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "colaboradores");
    }
  };

  const handleEditCollaborator = (colab: Colaborador) => {
    setCNome(colab.nome);
    setCPapel(colab.papel);
    setCCusto(colab.custoHora?.toString() || "");
    setCSquadId(colab.squadId || "");
    setEditingCollaboratorId(colab.id);
  };

  const handleDeleteCollaborator = async (colabId: string, name: string) => {
    if (!window.confirm(`Deseja realmente excluir o colaborador ${name}? Todas as alocações ligadas a ele serão removidas.`)) return;

    try {
      // Delete associated allocations first
      const associatedAlloc = allocations.filter(a => a.colaboradorId === colabId);
      const batch = writeBatch(db);
      associatedAlloc.forEach(alloc => {
        batch.delete(doc(db, "alocacoes", alloc.id));
      });
      batch.delete(doc(db, "colaboradores", colabId));
      await batch.commit();

      addNotification("Colaborador Removido", `${name} foi removido(a) bem como suas alocações.`, "success");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "colaboradores");
    }
  };

  // Handle adding allocation link
  const handleAddAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedColabId || !selectedProjId || !dedicationPct) return;

    const colab = collaborators.find((c) => c.id === selectedColabId);
    const proj = projects.find((p) => p.id === selectedProjId);

    if (!colab || !proj) return;

    // Check if link already exists
    const exists = allocations.find((a) => a.colaboradorId === selectedColabId && a.projectId === selectedProjId);
    if (exists) {
      alert("Este colaborador já está alocado neste projeto. Exclua a alocação existente para refazer com novo percentual.");
      return;
    }

    const pct = parseInt(dedicationPct);
    if (isNaN(pct) || pct < 1 || pct > 150) {
      alert("Defina um percentual válido de dedicação (1 a 150).");
      return;
    }

    try {
      const allocId = `${selectedColabId}_${selectedProjId}`;
      await addDoc(collection(db, "alocacoes"), {
        colaboradorId: selectedColabId,
        colaboradorNome: colab.nome,
        colaboradorPapel: colab.papel,
        projectId: selectedProjId,
        projectNome: proj.nome,
        percentualDedication: pct,
        userId,
        createdAt: new Date().toISOString(),
      });
      addNotification(`Alocação de Recurso Realizada`, `${colab.nome} foi alocado(a) no projeto ${proj.nome} com ${pct}% de dedicação.`, "success");

      // Reset selection
      setSelectedColabId("");
      setSelectedProjId("");
      setDedicationPct("100");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "alocacoes");
    }
  };

  const handleDeleteAllocation = async (allocId: string, colabNome: string, projNome: string) => {
    try {
      await deleteDoc(doc(db, "alocacoes", allocId));
      addNotification("Alocação Excluída", `Alocação de ${colabNome} em ${projNome} foi removida.`, "info");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "alocacoes");
    }
  };

  return (
    <div className="space-y-8 text-slate-800">
      
      {/* Row 1: Squads & Collaborators Management */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Col 1: Squad CRUD (lg:col-span-6) */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          {/* Squad Form */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-50 text-indigo-100 rounded-lg text-indigo-600">
                <Layers className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold font-display tracking-tight text-slate-900">
                {editingSquadId ? "Editar Squad" : "Cadastro de Squad"}
              </h2>
            </div>

            <form onSubmit={handleSubmitSquad} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Nome da Squad
                </label>
                <input
                  type="text"
                  value={sNome}
                  onChange={(e) => setSNome(e.target.value)}
                  placeholder="Ex: Alfa, Beta, Squad 1"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Tamanho (Colaboradores)
                  </label>
                  <input
                    type="number"
                    value={sTamanho}
                    onChange={(e) => setSTamanho(e.target.value)}
                    placeholder="Ex: 8"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Meta de Bugs (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={sMetaBugs}
                    onChange={(e) => setSMetaBugs(e.target.value)}
                    placeholder="Ex: 10"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Meta de Eficiência (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={sMetaEficiencia}
                    onChange={(e) => setSMetaEficiencia(e.target.value)}
                    placeholder="Ex: 90"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Meta de Atrasos (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={sMetaAtrasos}
                    onChange={(e) => setSMetaAtrasos(e.target.value)}
                    placeholder="Ex: 5"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Meta de SLA (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={sMetaSla}
                    onChange={(e) => setSMetaSla(e.target.value)}
                    placeholder="Ex: 95"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-lg shadow-sm transition-all focus:ring-2 focus:ring-indigo-500/20"
                >
                  {editingSquadId ? "Salvar Alterações" : "Cadastrar Squad"}
                </button>
                {editingSquadId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSquadId(null);
                      setSNome("");
                      setSTamanho("");
                      setSMetaBugs("");
                      setSMetaEficiencia("");
                      setSMetaAtrasos("");
                      setSMetaSla("");
                    }}
                    className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Squads List */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex-1">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 font-display text-lg flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-400" />
                Squads Cadastradas ({filteredSquads.length})
              </h3>
            </div>

            {filteredSquads.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <p className="text-sm">Nenhuma squad cadastrada.</p>
                <p className="text-xs mt-1">Crie sua primeira squad utilizando o formulário acima.</p>
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto max-h-[380px] pr-1">
                {filteredSquads.map((s) => (
                  <div key={s.id} className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl hover:bg-slate-50 transition-all">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-2 py-0.5 text-[10px] font-bold border rounded-md inline-flex items-center gap-1 ${getSquadColorClasses(s.nome)}`}>
                            <Layers className="w-2.5 h-2.5" />
                            {s.nome}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500 block mt-1.5">
                          Tamanho: <span className="font-bold text-slate-700">{s.tamanho} colabs</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditSquad(s)}
                          className="p-1 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all text-slate-400"
                          title="Editar Squad"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteSquad(s.id, s.nome)}
                          className="p-1 hover:text-rose-600 hover:bg-rose-50 rounded transition-all text-slate-400"
                          title="Excluir Squad"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {/* Performance metrics display */}
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2.5 pt-2.5 border-t border-slate-100 text-[10px] text-slate-500">
                      <div>Meta Bugs: <span className="font-bold text-slate-700">{s.metaBugs}%</span></div>
                      <div>Meta Eficiência: <span className="font-bold text-slate-700">{s.metaEficiencia}%</span></div>
                      <div>Meta Atrasos: <span className="font-bold text-slate-700">{s.metaAtrasos}%</span></div>
                      <div>Meta SLA: <span className="font-bold text-slate-700">{s.metaSla}%</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Col 2: Collaborator CRUD (lg:col-span-6) */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          {/* Collaborator Form */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Users className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold font-display tracking-tight text-slate-900">
                {editingCollaboratorId ? "Editar Colaborador" : "Cadastro de Colaborador"}
              </h2>
            </div>

            <form onSubmit={handleSubmitCollaborator} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Nome do Colaborador
                </label>
                <input
                  type="text"
                  value={cNome}
                  onChange={(e) => setCNome(e.target.value)}
                  placeholder="Ex: João da Silva"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Cargo / Papel
                  </label>
                  <select
                    value={cPapel}
                    onChange={(e) => setCPapel(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="PO">Product Owner (PO)</option>
                    <option value="SM">Scrum Master (SM)</option>
                    <option value="PO/SM">PO & SM</option>
                    <option value="Dev">Developer (Dev)</option>
                    <option value="Designer">UX/UI Designer</option>
                    <option value="QA">Quality Analyst (QA)</option>
                    <option value="Arquiteto">Arquiteto de Software</option>
                    <option value="Geral">Generalista</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Custo / Hora (R$)
                  </label>
                  <input
                    type="number"
                    value={cCusto}
                    onChange={(e) => setCCusto(e.target.value)}
                    placeholder="Ex: 85"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Squad Pertencente
                </label>
                <select
                  value={cSquadId}
                  onChange={(e) => setCSquadId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="">Sem Squad</option>
                  {squads.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-lg shadow-sm transition-all focus:ring-2 focus:ring-indigo-500/20"
                >
                  {editingCollaboratorId ? "Salvar Alterações" : "Cadastrar Colaborador"}
                </button>
                {editingCollaboratorId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCollaboratorId(null);
                      setCNome("");
                      setCCusto("");
                      setCSquadId("");
                    }}
                    className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Talent List and Allocation status */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex-1">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 font-display text-lg flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                Banco de Talentos ({filteredCollaborators.length})
              </h3>
            </div>

            {filteredCollaborators.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <p className="text-sm">Nenhum colaborador cadastrado no banco de talentos.</p>
                <p className="text-xs mt-1">Insira seu primeiro integrante para alocar em projetos.</p>
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto max-h-[380px] pr-1">
                {filteredCollaborators.map((c) => {
                  const totalAlloc = allocationSumMap[c.id] || 0;
                  const isOver = totalAlloc > 100;

                  return (
                    <div
                      key={c.id}
                      className={`p-3 rounded-xl border flex flex-col gap-2 transition-all ${
                        isOver ? "bg-rose-50/50 border-rose-200" : "bg-slate-50/70 border-slate-100 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-800 text-sm">{c.nome}</span>
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-200 text-slate-700 rounded-md">
                              {c.papel}
                            </span>
                            {/* Squad Badge */}
                            {(() => {
                              const foundSquad = squads.find(s => s.id === c.squadId);
                              const squadName = foundSquad ? foundSquad.nome : (c.squadNome || "");
                              return squadName ? (
                                <span className={`px-1.5 py-0.5 text-[9px] font-bold border rounded flex items-center gap-1 ${getSquadColorClasses(squadName)}`}>
                                  <Layers className="w-2.5 h-2.5" />
                                  {squadName}
                                </span>
                              ) : null;
                            })()}
                          </div>
                          {c.custoHora ? (
                            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                              <DollarSign className="w-3 h-3 text-slate-400" /> Custo de R$ {c.custoHora}/h
                            </div>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleEditCollaborator(c)}
                            className="p-1 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all text-slate-400"
                            title="Editar"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteCollaborator(c.id, c.nome)}
                            className="p-1 hover:text-rose-600 hover:bg-rose-50 rounded transition-all text-slate-400"
                            title="Excluir"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Progress representation of dedication */}
                      <div className="space-y-1 mt-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-500">Dedicação Total</span>
                          <span className={`font-bold ${isOver ? "text-rose-600" : "text-slate-700"}`}>
                            {totalAlloc}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${isOver ? "bg-rose-500" : "bg-indigo-600"}`}
                            style={{ width: `${Math.min(totalAlloc, 100)}%` }}
                          />
                        </div>
                        {isOver && (
                          <span className="text-[10px] text-rose-500 flex items-center gap-1 font-semibold mt-1">
                            <AlertCircle className="w-3 h-3" /> Sobrealocado! Reduza participações.
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Row 2: Resource Allocation Matrix (Full Width) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Allocation Form (lg:col-span-4) */}
        <div className="lg:col-span-4 flex flex-col">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm h-full">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <FolderKanban className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold font-display tracking-tight text-slate-900">
                Alocar Recurso
              </h2>
            </div>

            <form onSubmit={handleAddAllocation} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Colaborador (Talento)
                </label>
                <select
                  value={selectedColabId}
                  onChange={(e) => setSelectedColabId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  required
                >
                  <option value="">Selecione...</option>
                  {filteredCollaborators.map((c) => {
                    const foundSquad = squads.find(s => s.id === c.squadId);
                    const squadLabel = foundSquad ? ` [${foundSquad.nome}]` : (c.squadNome ? ` [${c.squadNome}]` : "");
                    return (
                      <option key={c.id} value={c.id}>
                        {c.nome} ({c.papel}){squadLabel}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Selecione o Projeto
                </label>
                <select
                  value={selectedProjId}
                  onChange={(e) => setSelectedProjId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  required
                >
                  <option value="">Selecione...</option>
                  {filteredProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Dedicação (%)
                </label>
                <input
                  type="number"
                  min="5"
                  max="150"
                  value={dedicationPct}
                  onChange={(e) => setDedicationPct(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm rounded-lg hover:shadow-md transition-all flex items-center justify-center gap-2"
              >
                Vincular ao Projeto
              </button>
            </form>
          </div>
        </div>

        {/* Existing Allocations Grid list Table (lg:col-span-8) */}
        <div className="lg:col-span-8 flex flex-col">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex-1">
            <h3 className="font-bold text-slate-900 font-display text-lg mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-400" />
              Matriz de Alocações Ativas ({filteredAllocations.length})
            </h3>

            {filteredAllocations.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-sm">Nenhuma alocação registrada.</p>
                <p className="text-xs mt-1">Conecte seus talentos aos projetos usando o formulário ao lado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-700">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs font-bold uppercase text-slate-400 bg-slate-50/50">
                      <th className="py-2.5 px-3">Colaborador</th>
                      <th className="py-2.5 px-3">Papel</th>
                      <th className="py-2.5 px-3">Squad</th>
                      <th className="py-2.5 px-3">Projeto Destino</th>
                      <th className="py-2.5 px-3 text-center">Fração Dedicação</th>
                      <th className="py-2.5 px-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-101">
                    {filteredAllocations.map((alloc) => (
                      <tr key={alloc.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-3 font-medium text-slate-900">{alloc.colaboradorNome}</td>
                        <td className="py-3 px-3">
                          <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">
                            {alloc.colaboradorPapel}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {(() => {
                            const colab = collaborators.find(c => c.id === alloc.colaboradorId);
                            const colabSquad = colab ? squads.find(s => s.id === colab.squadId) : null;
                            const squadName = colabSquad ? colabSquad.nome : (colab?.squadNome || "—");
                            return squadName && squadName !== "—" ? (
                              <span className={`text-xs px-2 py-0.5 border rounded font-bold inline-flex items-center gap-1 ${getSquadColorClasses(squadName)}`}>
                                <Layers className="w-2.5 h-2.5" />
                                {squadName}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            );
                          })()}
                        </td>
                        <td className="py-3 px-3 text-slate-600">{alloc.projectNome}</td>
                        <td className="py-3 px-3 text-center">
                          <span className="font-bold text-slate-800 text-sm">
                            {alloc.percentualDedication}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => handleDeleteAllocation(alloc.id, alloc.colaboradorNome, alloc.projectNome)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all"
                            title="Remover Alocação"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
