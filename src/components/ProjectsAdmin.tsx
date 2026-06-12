import React, { useState, useEffect } from "react";
import { FolderPlus, Trash, Edit, Calendar, DollarSign, Brain, BarChart2, CheckCircle2, Bookmark, ArrowRight, Clock, Plus, Users, Layers, ShieldAlert, ListTodo, Play, Ban, AlertCircle, CheckSquare } from "lucide-react";
import { collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, query, where, getDocs, writeBatch } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebaseInit";
import { Projeto, CicloInput, Marco, Alocacao, Squad, Risco, Tarefa } from "../types";
import { useNotifications } from "./NotificationToast";
import { calculateExpectedProgress, getRAGDetails } from "./ControlViews";
import { getSquadColorClasses } from "../utils/squadColors";

interface ProjectsAdminProps {
  userId: string;
  userEmail: string;
  filterSquadId?: string;
  filterProjectId?: string;
}

export const ProjectsAdmin: React.FC<ProjectsAdminProps> = ({ userId, userEmail, filterSquadId = "", filterProjectId = "" }) => {
  const [projects, setProjects] = useState<Projeto[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"cadastros" | "ciclos" | "marcos" | "riscos" | "tarefas">("cadastros");
  const { addNotification } = useNotifications();

  // Filtered project list based on selected portfolio filters
  const filteredProjects = React.useMemo(() => {
    return projects.filter((p) => {
      const matchSquad = !filterSquadId || p.squadId === filterSquadId;
      const matchProject = !filterProjectId || p.id === filterProjectId;
      return matchSquad && matchProject;
    });
  }, [projects, filterSquadId, filterProjectId]);

  // Adjust current selection if it gets filtered out of view
  useEffect(() => {
    if (filteredProjects.length > 0) {
      if (!selectedProjectId || !filteredProjects.some((p) => p.id === selectedProjectId)) {
        setSelectedProjectId(filteredProjects[0].id);
      }
    } else {
      setSelectedProjectId("");
    }
  }, [filteredProjects, selectedProjectId]);

  // Project Creation/Edit State
  const [pNome, setPNome] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pInicio, setPInicio] = useState("");
  const [pFim, setPFim] = useState("");
  const [pEstagio, setPEstagio] = useState<Projeto["estagio"]>("Ideação");
  const [pSquadId, setPSquadId] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  // Squads State
  const [squads, setSquads] = useState<Squad[]>([]);

  // Active Project Data
  const [projectCycles, setProjectCycles] = useState<CicloInput[]>([]);
  const [projectMilestones, setProjectMilestones] = useState<Marco[]>([]);
  const [projectRisks, setProjectRisks] = useState<Risco[]>([]);
  const [projectTasks, setProjectTasks] = useState<Tarefa[]>([]);
  const [allocations, setAllocations] = useState<Alocacao[]>([]);

  // Risk Input State
  const [riskDesc, setRiskDesc] = useState("");
  const [riskIssue, setRiskIssue] = useState("");
  const [riskImpact, setRiskImpact] = useState<"Baixo" | "Médio" | "Alto" | "Crítico" | "Impeditivo">("Médio");
  const [riskStatus, setRiskStatus] = useState<"Análise" | "Pendente" | "Bloqueio" | "Mitigado" | "Cancelado" | "Concluído">("Análise");
  const [riskStatusDate, setRiskStatusDate] = useState(new Date().toISOString().split("T")[0]);
  const [riskOwner, setRiskOwner] = useState("");
  const [editingRiskId, setEditingRiskId] = useState<string | null>(null);

  // Task Input State
  const [taskDesc, setTaskDesc] = useState("");
  const [taskOwner, setTaskOwner] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskStatus, setTaskStatus] = useState<"Pendente" | "Bloqueado" | "Em Andamento" | "Concluído">("Pendente");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

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

  // Load All Allocations
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
        handleFirestoreError(error, OperationType.LIST, "alocacoes");
      }
    );
    return () => unsubscribe();
  }, [userId]);

  // Load Squads Realtime
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
        handleFirestoreError(error, OperationType.LIST, "squads");
      }
    );
    return () => unsubscribe();
  }, [userId]);

  // Load details (Cycles, Milestones, Risks and Tasks) for the selected project
  useEffect(() => {
    if (!selectedProjectId) {
      setProjectCycles([]);
      setProjectMilestones([]);
      setProjectRisks([]);
      setProjectTasks([]);
      return;
    }

    // Cycles snapshot
    const cyclesQuery = query(collection(db, "projetos", selectedProjectId, "ciclos"), where("userId", "==", userId));
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
        handleFirestoreError(error, OperationType.LIST, `projetos/${selectedProjectId}/ciclos`);
      }
    );

    // Milestones snapshot
    const milestonesQuery = query(collection(db, "projetos", selectedProjectId, "marcos"), where("userId", "==", userId));
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
        handleFirestoreError(error, OperationType.LIST, `projetos/${selectedProjectId}/marcos`);
      }
    );

    // Risks snapshot
    const risksQuery = query(collection(db, "projetos", selectedProjectId, "riscos"), where("userId", "==", userId));
    const unsubscribeRisks = onSnapshot(
      risksQuery,
      (snapshot) => {
        const list: Risco[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Risco);
        });
        // Sort chronologically by createdAt descending
        list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        setProjectRisks(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `projetos/${selectedProjectId}/riscos`);
      }
    );

    // Tasks snapshot
    const tasksQuery = query(collection(db, "projetos", selectedProjectId, "tarefas"), where("userId", "==", userId));
    const unsubscribeTasks = onSnapshot(
      tasksQuery,
      (snapshot) => {
        const list: Tarefa[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Tarefa);
        });
        // Sort chronologically by createdAt descending
        list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        setProjectTasks(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `projetos/${selectedProjectId}/tarefas`);
      }
    );

    return () => {
      unsubscribeCycles();
      unsubscribeMilestones();
      unsubscribeRisks();
      unsubscribeTasks();
    };
  }, [selectedProjectId, userId]);

  // Project submission
  const handleSubmitProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pNome.trim() || !pInicio || !pFim) return;

    const selectedSquad = squads.find((s) => s.id === pSquadId);
    const squadNomeVal = selectedSquad ? selectedSquad.nome : "";

    try {
      if (editingProjectId) {
        const ref = doc(db, "projetos", editingProjectId);
        await updateDoc(ref, {
          nome: pNome,
          descricao: pDesc,
          dataInicio: pInicio,
          dataFim: pFim,
          estagio: pEstagio,
          squadId: pSquadId,
          squadNome: squadNomeVal,
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
          squadId: pSquadId,
          squadNome: squadNomeVal,
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
      setPSquadId("");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "projetos");
    }
  };

  const handleDeleteProject = async (projId: string, name: string) => {
    if (!window.confirm(`AVISO CRÍTICO!\nExcluir o projeto "${name}" apagará permanentemente todos os seus marcos de entrega, alocações e históricos de ciclos. Deseja prosseguir de qualquer forma?`)) return;

    try {
      // 1. Delete associated child documents gracefully and individually so failure in one subset does not deadlock the main collection delete

      // Sub-step A: Delete associated cycles (ciclos)
      try {
        const cyclesSnap = await getDocs(collection(db, "projetos", projId, "ciclos"));
        for (const item of cyclesSnap.docs) {
          try {
            await deleteDoc(item.ref);
          } catch (e) {
            console.warn(`Falha não obstrutiva ao deletar ciclo ${item.id}:`, e);
          }
        }
      } catch (e) {
        console.warn("Falha ao listar ciclos para deleção:", e);
      }

      // Sub-step B: Delete associated milestones (marcos)
      try {
        const milestonesSnap = await getDocs(collection(db, "projetos", projId, "marcos"));
        for (const item of milestonesSnap.docs) {
          try {
            await deleteDoc(item.ref);
          } catch (e) {
            console.warn(`Falha não obstrutiva ao deletar marco ${item.id}:`, e);
          }
        }
      } catch (e) {
        console.warn("Falha ao listar marcos para deleção:", e);
      }

      // Sub-step C: Delete associated allocations (alocacoes)
      try {
        const allocsSnap = await getDocs(query(collection(db, "alocacoes"), where("projectId", "==", projId)));
        for (const item of allocsSnap.docs) {
          try {
            await deleteDoc(item.ref);
          } catch (e) {
            console.warn(`Falha não obstrutiva ao deletar alocação ${item.id}:`, e);
          }
        }
      } catch (e) {
        console.warn("Falha ao listar alocações para deleção:", e);
      }

      // 2. Delete the root project document itself securely
      await deleteDoc(doc(db, "projetos", projId));

      if (selectedProjectId === projId) {
        setSelectedProjectId("");
      }

      addNotification("Projeto Excluído", `O projeto ${name} e todos os dados correlacionados foram permanentemente expurgados.`, "info");
    } catch (err) {
      addNotification("Erro ao Excluir", "Ocorreu um erro ao excluir o projeto. Por favor, verifique suas permissões ou tente novamente.", "error");
      handleFirestoreError(err, OperationType.DELETE, `projetos/${projId}`);
    }
  };

  const handleEditProject = (proj: Projeto) => {
    setPNome(proj.nome);
    setPDesc(proj.descricao || "");
    setPInicio(proj.dataInicio);
    setPFim(proj.dataFim);
    setPEstagio(proj.estagio);
    setPSquadId(proj.squadId || "");
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

  const recalculateProjectProgress = async (projectId: string) => {
    try {
      const milestonesSnap = await getDocs(collection(db, "projetos", projectId, "marcos"));
      const cyclesSnap = await getDocs(collection(db, "projetos", projectId, "ciclos"));

      let percent = 0;

      if (milestonesSnap.size > 0) {
        // Enforce Milestones Rule: progress = completed / total
        let completed = 0;
        milestonesSnap.forEach((item) => {
          if (item.data() && item.data().concluido === true) {
            completed++;
          }
        });
        percent = Math.round((completed / milestonesSnap.size) * 100);
      } else if (cyclesSnap.size > 0) {
        // Enforce Cycles Rule: progress of the latest cycle (chronologically by dataReferencia)
        const cycles: any[] = [];
        cyclesSnap.forEach((item) => {
          cycles.push({ id: item.id, ...item.data() });
        });
        cycles.sort((a, b) => {
          const dateA = a.dataReferencia || "";
          const dateB = b.dataReferencia || "";
          return dateA.localeCompare(dateB);
        });
        percent = cycles[cycles.length - 1].progresso || 0;
      } else {
        // Rule: no milestones & no cycles = exactly 0%
        percent = 0;
      }

      await updateDoc(doc(db, "projetos", projectId), {
        progressoManual: percent,
      });
    } catch (err) {
      console.error("Erro ao recalcular progresso do projeto:", err);
    }
  };

  const handleDeleteCycle = async (cycleId: string, cycleName: string) => {
    if (!window.confirm(`Deseja apagar o ciclo consolidado "${cycleName}"?`)) return;

    try {
      await deleteDoc(doc(db, "projetos", selectedProjectId, "ciclos", cycleId));
      addNotification("Ciclo Deletado", `Ciclo "${cycleName}" removido do histórico.`, "info");
      
      // Recalculate progress after deleting a cycle
      await recalculateProjectProgress(selectedProjectId);
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

      // Recalculate progress
      await recalculateProjectProgress(selectedProjectId);
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

      // Recalculate progress
      await recalculateProjectProgress(selectedProjectId);
    } catch (err) {
      console.error("Erro ao alternar marco:", err);
    }
  };

  const handleDeleteMilestone = async (marcoId: string, testNome: string) => {
    try {
      await deleteDoc(doc(db, "projetos", selectedProjectId, "marcos", marcoId));
      addNotification("Marco Removido", `Marco "${testNome}" excluído das metas.`, "info");

      // Recalculate progress
      await recalculateProjectProgress(selectedProjectId);
    } catch (err) {
      console.error("Erro ao apagar marco:", err);
    }
  };

  // Submit or Edit Risk (Risco)
  const handleSubmitRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !riskDesc.trim() || !riskImpact || !riskStatus || !riskStatusDate) return;

    try {
      if (editingRiskId) {
        // Edit Mode
        await updateDoc(doc(db, "projetos", selectedProjectId, "riscos", editingRiskId), {
          descricao: riskDesc,
          numIssue: riskIssue,
          impacto: riskImpact,
          status: riskStatus,
          dataStatus: riskStatusDate,
          responsavel: riskOwner,
        });

        addNotification("Risco Atualizado 🛡️", `O risco foi atualizado com sucesso.`, "success");
        setEditingRiskId(null);
      } else {
        // Create Mode
        await addDoc(collection(db, "projetos", selectedProjectId, "riscos"), {
          descricao: riskDesc,
          numIssue: riskIssue,
          impacto: riskImpact,
          status: riskStatus,
          dataStatus: riskStatusDate,
          responsavel: riskOwner,
          userId,
          createdAt: new Date().toISOString(),
        });

        addNotification("Risco Adicionado 🛡️", `O risco foi registrado com sucesso no projeto.`, "success");
      }

      // Reset form states
      setRiskDesc("");
      setRiskIssue("");
      setRiskImpact("Médio");
      setRiskStatus("Análise");
      setRiskStatusDate(new Date().toISOString().split("T")[0]);
      setRiskOwner("");

    } catch (err) {
      console.error("Erro ao salvar risco:", err);
      addNotification("Erro", "Não foi possível salvar o risco.", "error");
    }
  };

  const handleEditRisk = (risk: Risco) => {
    setEditingRiskId(risk.id);
    setRiskDesc(risk.descricao);
    setRiskIssue(risk.numIssue || "");
    setRiskImpact(risk.impacto);
    setRiskStatus(risk.status);
    setRiskStatusDate(risk.dataStatus);
    setRiskOwner(risk.responsavel || "");
  };

  const handleCancelEditRisk = () => {
    setEditingRiskId(null);
    setRiskDesc("");
    setRiskIssue("");
    setRiskImpact("Médio");
    setRiskStatus("Análise");
    setRiskStatusDate(new Date().toISOString().split("T")[0]);
    setRiskOwner("");
  };

  const handleDeleteRisk = async (riskId: string) => {
    try {
      await deleteDoc(doc(db, "projetos", selectedProjectId, "riscos", riskId));
      addNotification("Risco Removido", `O risco foi excluído do projeto.`, "info");
      if (editingRiskId === riskId) {
        handleCancelEditRisk();
      }
    } catch (err) {
      console.error("Erro ao apagar risco:", err);
      addNotification("Erro", "Não foi possível remover o risco.", "error");
    }
  };

  // Tasks (Tarefas) CRUD
  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) return;
    if (!taskDesc.trim() || !taskOwner.trim() || !taskDueDate) {
      addNotification("Aviso", "Preencha todos os campos obrigatórios para a tarefa.", "warning");
      return;
    }

    try {
      if (editingTaskId) {
        // Edit Mode
        await updateDoc(doc(db, "projetos", selectedProjectId, "tarefas", editingTaskId), {
          descricao: taskDesc,
          responsavel: taskOwner,
          dataConclusao: taskDueDate,
          situacao: taskStatus,
          userId,
        });

        addNotification("Tarefa Atualizada ✅", `A tarefa foi atualizada com sucesso.`, "success");
        setEditingTaskId(null);
      } else {
        // Create Mode
        await addDoc(collection(db, "projetos", selectedProjectId, "tarefas"), {
          descricao: taskDesc,
          responsavel: taskOwner,
          dataConclusao: taskDueDate,
          situacao: taskStatus,
          userId,
          createdAt: new Date().toISOString(),
        });

        addNotification("Tarefa Adicionada ✅", `A tarefa foi criada com sucesso no projeto.`, "success");
      }

      // Reset form states
      setTaskDesc("");
      setTaskOwner("");
      setTaskDueDate("");
      setTaskStatus("Pendente");
    } catch (err) {
      console.error("Erro ao salvar tarefa:", err);
      addNotification("Erro", "Não foi possível salvar a tarefa.", "error");
    }
  };

  const handleEditTask = (task: Tarefa) => {
    setEditingTaskId(task.id);
    setTaskDesc(task.descricao);
    setTaskOwner(task.responsavel);
    setTaskDueDate(task.dataConclusao);
    setTaskStatus(task.situacao);
  };

  const handleCancelEditTask = () => {
    setEditingTaskId(null);
    setTaskDesc("");
    setTaskOwner("");
    setTaskDueDate("");
    setTaskStatus("Pendente");
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, "projetos", selectedProjectId, "tarefas", taskId));
      addNotification("Tarefa Removida", `A tarefa foi excluída do projeto.`, "info");
      if (editingTaskId === taskId) {
        handleCancelEditTask();
      }
    } catch (err) {
      console.error("Erro ao apagar tarefa:", err);
      addNotification("Erro", "Não foi possível remover a tarefa.", "error");
    }
  };

  const getImpactBadge = (impact: string) => {
    switch (impact) {
      case "Baixo":
        return "bg-emerald-50 text-emerald-700 border-emerald-200/60";
      case "Médio":
        return "bg-blue-50 text-blue-700 border-blue-200/60";
      case "Alto":
        return "bg-amber-50 text-amber-700 border-amber-200/60";
      case "Crítico":
        return "bg-orange-50 text-orange-700 border-orange-200/60";
      case "Impeditivo":
        return "bg-rose-50 text-rose-700 border-rose-200/60";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200/60";
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case "Análise":
        return "bg-slate-100 text-slate-700 border-slate-200";
      case "Pendente":
        return "bg-amber-50 text-amber-800 border-amber-200/60";
      case "Bloqueio":
        return "bg-red-50 text-red-800 border-red-200/60 font-semibold";
      case "Mitigado":
        return "bg-indigo-50 text-indigo-700 border-indigo-200/60";
      case "Cancelado":
        return "bg-zinc-100 text-zinc-500 border-zinc-200 line-through";
      case "Concluído":
        return "bg-emerald-50 text-emerald-800 border-emerald-200/60 font-semibold";
      default:
        return "bg-slate-50 text-slate-600 border-slate-200/60";
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

            <div>
              <label className="block font-semibold uppercase text-slate-500 mb-1">Squad Relacionada</label>
              <select
                value={pSquadId}
                onChange={(e) => setPSquadId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none"
              >
                <option value="">Nenhuma Squad relacionada</option>
                {squads.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
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
                    setPSquadId("");
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
            Seus Projetos Ativos ({filteredProjects.length})
          </h3>

          <div className="space-y-3 overflow-y-auto max-h-[450px] pr-1">
            {filteredProjects.map((p) => {
              const actual = p.progressoManual || 0;
              const pAllocations = allocations.filter((a) => a.projectId === p.id);

              const expected = calculateExpectedProgress(p.dataInicio, p.dataFim);
              const rag = getRAGDetails(actual, expected, p.dataFim);

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedProjectId(p.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer text-left transition-all ${
                    selectedProjectId === p.id
                      ? "bg-indigo-50/70 border-indigo-200 shadow-sm ring-1 ring-indigo-500/10"
                      : "bg-slate-50/40 border-slate-100 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-slate-900 text-sm leading-tight">{p.nome}</h4>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="text-[10px] px-2 py-0.5 inline-block bg-slate-200/70 text-slate-600 rounded-md font-medium">
                          {p.estagio}
                        </span>
                        {p.squadNome && (
                          <span className={`text-[10px] px-2 py-0.5 inline-flex items-center gap-1 border rounded-md font-bold ${getSquadColorClasses(p.squadNome)}`}>
                            <Layers className="w-2.5 h-2.5" />
                            {p.squadNome}
                          </span>
                        )}
                      </div>
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
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>Progresso Real:</span>
                    </div>
                    <span className="font-bold text-slate-700">{actual}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1 mt-1 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                      style={{ width: `${actual}%` }}
                    />
                  </div>

                  {/* Delivery Date & Status Indicators */}
                  <div className="mt-3 flex flex-wrap items-center justify-between text-[11px] gap-2 border-t border-slate-100/80 pt-2.5">
                    <div className="flex items-center gap-1 text-slate-500">
                      <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Entrega: <strong className="text-slate-700">{p.dataFim ? p.dataFim.split("-").reverse().join("/") : "Não def."}</strong></span>
                    </div>

                    <span className={`px-1.5 py-0.5 rounded-md font-bold text-[9px] uppercase tracking-wider border flex items-center gap-0.5 ${rag.textClass}`}>
                      {rag.emoji} {rag.label.split(" - ")[1] || rag.label}
                    </span>
                  </div>

                  {/* Allocated Collaborators */}
                  <div className="mt-2.5 space-y-1">
                    <div className="flex items-center gap-1 text-[9px] text-slate-400 uppercase font-semibold tracking-wider">
                      <Users className="w-3 h-3 text-slate-400" />
                      <span>Colaboradores ({pAllocations.length})</span>
                    </div>
                    {pAllocations.length === 0 ? (
                      <p className="text-[10px] text-slate-400 italic">Nenhum colaborador alocado</p>
                    ) : (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {pAllocations.map((alloc) => (
                          <span
                            key={alloc.id}
                            className="px-1.5 py-0.5 bg-slate-100 border border-slate-200/60 rounded-md text-[9px] text-slate-600 font-medium"
                            title={`${alloc.colaboradorNome} - ${alloc.colaboradorPapel} (${alloc.percentualDedication}%)`}
                          >
                            {alloc.colaboradorNome} <span className="text-slate-400 text-[8px]">({alloc.colaboradorPapel})</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
                <div className="flex flex-wrap items-center gap-3 mt-1">
                  <h1 className="text-2xl font-bold font-display text-slate-900 tracking-tight">{activeProject.nome}</h1>
                  {activeProject.squadNome && (
                    <span className={`text-xs px-2.5 py-1 inline-flex items-center gap-1.5 border rounded-md font-bold shadow-sm ${getSquadColorClasses(activeProject.squadNome)}`}>
                      <Layers className="w-3.5 h-3.5" />
                      Squad: {activeProject.squadNome}
                    </span>
                  )}
                </div>
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

              <button
                onClick={() => setActiveTab("riscos")}
                className={`flex-1 py-3.5 px-6 font-display font-semibold text-sm border-b-2 transition-all flex items-center justify-center gap-2 ${
                  activeTab === "riscos"
                    ? "border-indigo-600 text-indigo-600 bg-indigo-50/10"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50/50"
                }`}
              >
                <ShieldAlert className="w-4 h-4" />
                Gestão de Riscos
              </button>

              <button
                onClick={() => setActiveTab("tarefas")}
                className={`flex-1 py-3.5 px-6 font-display font-semibold text-sm border-b-2 transition-all flex items-center justify-center gap-2 ${
                  activeTab === "tarefas"
                    ? "border-indigo-600 text-indigo-600 bg-indigo-50/10"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50/50"
                }`}
              >
                <ListTodo className="w-4 h-4" />
                Tarefas do Projeto
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
                  <form onSubmit={handleSubmitMilestone} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-slate-50 p-4 rounded-xl border border-slate-150">
                    <div className="md:col-span-6">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                        Nome do Marco de Entrega Crítica
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

                    <div className="md:col-span-4">
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

                    <div className="md:col-span-2">
                      <button
                        type="submit"
                        className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow transition-all flex items-center justify-center gap-1 cursor-pointer"
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

              {/* TAB 3: RISK MANAGEMENT (GESTÃO DE RISCOS) */}
              {activeTab === "riscos" && (
                <div className="space-y-6 animate-fade-in font-display">
                  
                  {/* Warning / explanation banner */}
                  <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">Gestão de Riscos do Projeto</h4>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        Controle e monitore os riscos do projeto integrando status, nível de impacto e responsáveis. 
                        Facilite a tomada de decisões e garanta a segurança operacional de projetos críticos.
                      </p>
                    </div>
                  </div>

                  {/* Form Create / Edit Risk */}
                  <form onSubmit={handleSubmitRisk} className="bg-slate-50 p-5 rounded-2xl border border-slate-200/60 space-y-4">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      {editingRiskId ? "✏️ Editar Risco" : "➕ Registrar Novo Risco"}
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      {/* Descricao */}
                      <div className="md:col-span-8">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                          Descrição do Risco <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={riskDesc}
                          onChange={(e) => setRiskDesc(e.target.value)}
                          placeholder="Ex: Demora na homologação do ambiente de produção"
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          required
                        />
                      </div>

                      {/* Nº Issue */}
                      <div className="md:col-span-4">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                          Nº Issue
                        </label>
                        <input
                          type="text"
                          value={riskIssue}
                          onChange={(e) => setRiskIssue(e.target.value)}
                          placeholder="Ex: #405 ou PROJ-12"
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {/* Impacto */}
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                          Impacto <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={riskImpact}
                          onChange={(e) => setRiskImpact(e.target.value as any)}
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
                          required
                        >
                          <option value="Baixo">🟢 Baixo</option>
                          <option value="Médio">🔵 Médio</option>
                          <option value="Alto">🟡 Alto</option>
                          <option value="Crítico">🟠 Crítico</option>
                          <option value="Impeditivo">🔴 Impeditivo</option>
                        </select>
                      </div>

                      {/* Status */}
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                          Status <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={riskStatus}
                          onChange={(e) => setRiskStatus(e.target.value as any)}
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
                          required
                        >
                          <option value="Análise">⚙️ Análise</option>
                          <option value="Pendente">⏳ Pendente</option>
                          <option value="Bloqueio">🔒 Bloqueio</option>
                          <option value="Mitigado">🛡️ Mitigado</option>
                          <option value="Cancelado">🚫 Cancelado</option>
                          <option value="Concluído">✅ Concluído</option>
                        </select>
                      </div>

                      {/* Data do Status */}
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                          Data do Status <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={riskStatusDate}
                          onChange={(e) => setRiskStatusDate(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          required
                        />
                      </div>

                      {/* Responsável */}
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                          Responsável
                        </label>
                        <input
                          type="text"
                          value={riskOwner}
                          onChange={(e) => setRiskOwner(e.target.value)}
                          placeholder="Ex: Mariana Silva"
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      {editingRiskId && (
                        <button
                          type="button"
                          onClick={handleCancelEditRisk}
                          className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition-all"
                        >
                          Cancelar Edição
                        </button>
                      )}
                      <button
                        type="submit"
                        className="py-2 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        {editingRiskId ? "Atualizar Risco" : "Registrar Risco"}
                      </button>
                    </div>
                  </form>

                  {/* Risks List */}
                  <div className="space-y-3">
                    <h3 className="font-bold text-slate-900 font-display text-base uppercase tracking-wider">
                      Riscos Identificados ({projectRisks.length})
                    </h3>

                    {projectRisks.length === 0 ? (
                      <div className="border border-dashed border-slate-200 text-center py-12 text-slate-400 rounded-2xl text-xs">
                        Nenhum risco cadastrado ainda. Use o formulário acima para registrar novos riscos para o projeto.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {projectRisks.map((risk) => {
                          return (
                            <div
                              key={risk.id}
                              className="p-4 bg-white border border-slate-200 rounded-2xl hover:shadow-xs transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-fade-in"
                            >
                              <div className="space-y-2 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  {/* Impacto Badge */}
                                  <span className={`text-[10px] uppercase font-bold tracking-tight px-2 py-0.5 border rounded-md ${getImpactBadge(risk.impacto)}`}>
                                    Impacto: {risk.impacto}
                                  </span>

                                  {/* Status Badge */}
                                  <span className={`text-[10px] uppercase font-bold tracking-tight px-2 py-0.5 border rounded-md ${getStatusBadge(risk.status)}`}>
                                    Status: {risk.status}
                                  </span>

                                  {/* Data Status */}
                                  <span className="text-[10px] text-slate-500 font-mono bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5 flex items-center gap-1 font-semibold">
                                    <Calendar className="w-3 h-3" /> {risk.dataStatus}
                                  </span>

                                  {/* Issue Badge */}
                                  {risk.numIssue && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 border border-indigo-100 rounded text-indigo-700 font-mono">
                                      {risk.numIssue}
                                    </span>
                                  )}
                                </div>

                                <h4 className="text-sm font-semibold text-slate-900 pr-4">
                                  {risk.descricao}
                                </h4>

                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                  <span className="font-semibold text-slate-400 font-display">Responsável:</span>
                                  <span className="font-semibold text-slate-700 bg-slate-100/80 px-2 py-0.5 rounded text-[10px] font-display">
                                    {risk.responsavel || "Não atribuído"}
                                  </span>
                                </div>
                              </div>

                              {/* Actions CRUD */}
                              <div className="flex items-center gap-2 self-stretch md:self-auto justify-end md:justify-start border-t md:border-t-0 pt-2.5 md:pt-0 border-slate-100">
                                <button
                                  type="button"
                                  onClick={() => handleEditRisk(risk)}
                                  className="p-1 px-2.5 text-xs text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-200/55 rounded-lg transition-all flex items-center gap-1 font-semibold cursor-pointer"
                                  title="Editar Risco"
                                >
                                  <Edit className="w-3.5 h-3.5" /> Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRisk(risk.id)}
                                  className="p-1 px-2.5 text-xs text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200/55 rounded-lg transition-all flex items-center gap-1 font-semibold cursor-pointer"
                                  title="Excluir Risco"
                                >
                                  <Trash className="w-3.5 h-3.5" /> Excluir
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: TASK MANAGEMENT (GESTÃO DE TAREFAS) */}
              {activeTab === "tarefas" && (
                <div className="space-y-6 animate-fade-in font-display">
                  
                  {/* Warning / explanation banner */}
                  <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl flex items-start gap-3">
                    <ListTodo className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">Controle de Tarefas do Projeto</h4>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        Crie, atualize status e gerencie todas as tarefas pendentes, andamento, concluídas ou bloqueadas vinculadas a este projeto de forma ágil e centralizada.
                      </p>
                    </div>
                  </div>

                  {/* Form Create / Edit Task */}
                  <form onSubmit={handleSubmitTask} className="bg-slate-50 p-5 rounded-2xl border border-slate-200/60 space-y-4">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      {editingTaskId ? "✏️ Editar Tarefa" : "➕ Adicionar Nova Tarefa"}
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      {/* Descricao */}
                      <div className="col-span-12 md:col-span-4">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          Descrição da Tarefa <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={taskDesc}
                          onChange={(e) => setTaskDesc(e.target.value)}
                          placeholder="Ex: Realizar testes automatizados de integração"
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>

                      {/* Responsavel */}
                      <div className="col-span-12 md:col-span-3">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          Responsável (Colaborador) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={taskOwner}
                          onChange={(e) => setTaskOwner(e.target.value)}
                          placeholder="Ex: Carlos SM ou Nome do Colaborador"
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>

                      {/* Data para Conclusao */}
                      <div className="col-span-12 md:col-span-3">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          Data para Conclusão <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="date"
                          required
                          value={taskDueDate}
                          onChange={(e) => setTaskDueDate(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>

                      {/* Situacao */}
                      <div className="col-span-12 md:col-span-2">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          Situação <span className="text-rose-500">*</span>
                        </label>
                        <select
                          required
                          value={taskStatus}
                          onChange={(e) => setTaskStatus(e.target.value as any)}
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-semibold text-slate-700"
                        >
                          <option value="Pendente">⏳ Pendente</option>
                          <option value="Bloqueado">🚫 Bloqueado</option>
                          <option value="Em Andamento">⚡ Em Andamento</option>
                          <option value="Concluído">✅ Concluído</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      {editingTaskId && (
                        <button
                          type="button"
                          onClick={handleCancelEditTask}
                          className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold transition-all"
                        >
                          Cancelar Edição
                        </button>
                      )}
                      <button
                        type="submit"
                        className="py-2 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        {editingTaskId ? "Atualizar Tarefa" : "Salvar Tarefa"}
                      </button>
                    </div>
                  </form>

                  {/* Tasks List */}
                  <div className="space-y-3">
                    <h3 className="font-bold text-slate-900 font-display text-base uppercase tracking-wider">
                      Lista de Tarefas Cadastradas ({projectTasks.length})
                    </h3>

                    {projectTasks.length === 0 ? (
                      <div className="border border-dashed border-slate-200 text-center py-12 text-slate-400 rounded-2xl text-xs">
                        Nenhuma tarefa cadastrada para este projeto. Use o formulário acima para registrar novas tarefas.
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-slate-100/80 rounded-2xl shadow-xs bg-white">
                        <table className="w-full border-collapse bg-white text-left text-xs text-slate-500">
                          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-100">
                            <tr>
                              <th scope="col" className="px-6 py-4 font-semibold">Descrição da Tarefa</th>
                              <th scope="col" className="px-6 py-4 font-semibold">Responsável</th>
                              <th scope="col" className="px-6 py-4 font-semibold">Data Limite</th>
                              <th scope="col" className="px-6 py-4 font-semibold">Situação</th>
                              <th scope="col" className="px-6 py-4 font-semibold text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 border-t border-slate-100">
                            {projectTasks.map((task) => {
                              let statusColor = "";
                              let statusIcon = null;

                              if (task.situacao === "Pendente") {
                                statusColor = "bg-amber-50 text-amber-700 border-amber-200";
                                statusIcon = <Clock className="w-3.5 h-3.5 text-amber-500" />;
                              } else if (task.situacao === "Bloqueado") {
                                statusColor = "bg-rose-50 text-rose-700 border-rose-200";
                                statusIcon = <Ban className="w-3.5 h-3.5 text-rose-500" />;
                              } else if (task.situacao === "Em Andamento") {
                                statusColor = "bg-sky-50 text-sky-700 border-sky-200";
                                statusIcon = <Play className="w-3.5 h-3.5 text-sky-500 fill-current" />;
                              } else if (task.situacao === "Concluído") {
                                statusColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
                                statusIcon = <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />;
                              }

                              return (
                                <tr key={task.id} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="px-6 py-4 font-medium text-slate-900 max-w-sm whitespace-normal break-words">
                                    {task.descricao}
                                  </td>
                                  <td className="px-6 py-4 font-semibold text-slate-700">
                                    {task.responsavel}
                                  </td>
                                  <td className="px-6 py-4 font-mono text-slate-600 font-semibold whitespace-nowrap">
                                    {task.dataConclusao ? task.dataConclusao.split("-").reverse().join("/") : ""}
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 border rounded-lg text-xs font-bold leading-none ${statusColor}`}>
                                      {statusIcon}
                                      {task.situacao}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleEditTask(task)}
                                        className="p-1 px-2.5 text-xs text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-200/55 rounded-lg transition-all flex items-center gap-1 font-semibold cursor-pointer"
                                        title="Editar Tarefa"
                                      >
                                        <Edit className="w-3.5 h-3.5" /> Editar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteTask(task.id)}
                                        className="p-1 px-2.5 text-xs text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200/55 rounded-lg transition-all flex items-center gap-1 font-semibold cursor-pointer"
                                        title="Excluir Tarefa"
                                      >
                                        <Trash className="w-3.5 h-3.5" /> Excluir
                                      </button>
                                    </div>
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
