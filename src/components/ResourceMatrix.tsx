import React, { useState, useEffect } from "react";
import { UserPlus, Trash, AlertCircle, Edit, Users, FolderKanban, TrendingUp, DollarSign } from "lucide-react";
import { collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, query, where, writeBatch } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebaseInit";
import { Colaborador, Alocacao, Projeto } from "../types";
import { useNotifications } from "./NotificationToast";

interface ResourceMatrixProps {
  userId: string;
  projects: Projeto[];
}

export const ResourceMatrix: React.FC<ResourceMatrixProps> = ({ userId, projects }) => {
  const [collaborators, setCollaborators] = useState<Colaborador[]>([]);
  const [allocations, setAllocations] = useState<Alocacao[]>([]);
  const { addNotification } = useNotifications();

  // Dialog/Inputs State for Collaborator
  const [cNome, setCNome] = useState("");
  const [cPapel, setCPapel] = useState("Dev");
  const [cCusto, setCCusto] = useState("");
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

  // Handle addition or editing of Collaborator
  const handleSubmitCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cNome.trim()) return;

    try {
      if (editingCollaboratorId) {
        // Edit existing
        const ref = doc(db, "colaboradores", editingCollaboratorId);
        await updateDoc(ref, {
          nome: cNome,
          papel: cPapel,
          custoHora: cCusto ? parseFloat(cCusto) : 0,
        });
        addNotification("Colaborador Atualizado", `${cNome} foi atualizado com sucesso.`, "success");
        setEditingCollaboratorId(null);
      } else {
        // Create new
        await addDoc(collection(db, "colaboradores"), {
          nome: cNome,
          papel: cPapel,
          custoHora: cCusto ? parseFloat(cCusto) : 0,
          userId,
          createdAt: new Date().toISOString(),
        });
        addNotification("Novo Colaborador Cadastrado", `${cNome} foi adicionado ao banco de talentos.`, "success");
      }
      setCNome("");
      setCCusto("");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "colaboradores");
    }
  };

  const handleEditCollaborator = (colab: Colaborador) => {
    setCNome(colab.nome);
    setCPapel(colab.papel);
    setCCusto(colab.custoHora?.toString() || "");
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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-slate-800">
      
      {/* Col 1: Talent Database Creation & Display (Left Side) */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        
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
              Banco de Talentos ({collaborators.length})
            </h3>
          </div>

          {collaborators.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <p className="text-sm">Nenhum colaborador cadastrado no banco de talentos.</p>
              <p className="text-xs mt-1">Insira seu primeiro integrante para alocar em projetos.</p>
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto max-h-[380px] pr-1">
              {collaborators.map((c) => {
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
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800 text-sm">{c.nome}</span>
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-200 text-slate-700 rounded-md">
                            {c.papel}
                          </span>
                        </div>
                        {c.custoHora ? (
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
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

      {/* Col 2: Resource Allocation Matrix (Right Side) */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        
        {/* Allocation Form (Tying them together) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <FolderKanban className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold font-display tracking-tight text-slate-900">
              Vincular Colaborador ao Projeto (Matriz)
            </h2>
          </div>

          <form onSubmit={handleAddAllocation} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
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
                {collaborators.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} ({c.papel})
                  </option>
                ))}
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
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
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
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-md transition-all rounded-lg font-medium text-sm flex-shrink-0"
              >
                Alocar
              </button>
            </div>
          </form>
        </div>

        {/* Existing Allocations Grid list */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex-1">
          <h3 className="font-bold text-slate-900 font-display text-lg mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            Matriz de Alocações Ativas ({allocations.length})
          </h3>

          {allocations.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-sm">Nenhuma alocação registrada.</p>
              <p className="text-xs mt-1">Conecte seus talentos aos projetos usando o formulário acima.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-bold uppercase text-slate-400 bg-slate-50/50">
                    <th className="py-2.5 px-3">Colaborador</th>
                    <th className="py-2.5 px-3">Papel</th>
                    <th className="py-2.5 px-3">Projeto Destino</th>
                    <th className="py-2.5 px-3 text-center">Fração Dedicação</th>
                    <th className="py-2.5 px-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allocations.map((alloc) => (
                    <tr key={alloc.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-3 font-medium text-slate-900">{alloc.colaboradorNome}</td>
                      <td className="py-3 px-3">
                        <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">
                          {alloc.colaboradorPapel}
                        </span>
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
  );
};
