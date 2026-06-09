import React, { useState, useEffect } from "react";
import { Kanban, Milestone, Calendar, ArrowLeft, ArrowRight, User, CheckCircle2, AlertTriangle, PlayCircle } from "lucide-react";
import { collection, onSnapshot, query, where, doc, updateDoc, writeBatch, getDocs } from "firebase/firestore";
import { db } from "../lib/firebaseInit";
import { Projeto, Marco } from "../types";
import { useNotifications } from "./NotificationToast";
import { getSquadColorClasses } from "../utils/squadColors";

interface ControlViewsProps {
  userId: string;
  filterSquadId?: string;
  filterProjectId?: string;
}

// Utility: Calculate expected progress % based on timeline
export function calculateExpectedProgress(startStr: string, endStr: string): number {
  const today = new Date();
  today.setHours(0,0,0,0);
  const start = new Date(startStr);
  const end = new Date(endStr);

  if (today > end) return 100;
  if (today < start) return 0;

  const total = end.getTime() - start.getTime();
  const elapsed = today.getTime() - start.getTime();
  if (total <= 0) return 0;

  return Math.round((elapsed / total) * 100);
}

// Utility: Calculate RAG Alert Farol
export function getRAGDetails(actual: number, expected: number, dataFim?: string) {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const todayStr = `${year}-${month}-${day}`;

  const isOverdue = dataFim ? (todayStr > dataFim && actual < 100) : false;

  if (isOverdue) {
    return { code: "red", label: "Vermelho - Atraso", emoji: "🔴", colorClass: "bg-rose-500", textClass: "text-rose-600 border-rose-200 bg-rose-50" };
  }

  const diff = expected - actual;
  if (diff > 0 && actual < 100) {
    return { code: "yellow", label: "Amarelo - Atenção", emoji: "🟡", colorClass: "bg-amber-500", textClass: "text-amber-600 border-amber-200 bg-amber-50" };
  }

  return { code: "green", label: "Verde - No Prazo", emoji: "🟢", colorClass: "bg-emerald-500", textClass: "text-emerald-600 border-emerald-200 bg-emerald-50" };
}

export const ControlViews: React.FC<ControlViewsProps> = ({ userId, filterSquadId = "", filterProjectId = "" }) => {
  const [projects, setProjects] = useState<Projeto[]>([]);
  const [activeLayout, setActiveLayout] = useState<"gantt" | "kanban">("gantt");
  const [allMilestones, setAllMilestones] = useState<{ [projectId: string]: Marco[] }>({});
  const { addNotification } = useNotifications();

  // Filtered project list based on selected portfolio context
  const filteredProjects = React.useMemo(() => {
    return projects.filter((p) => {
      const matchSquad = !filterSquadId || p.squadId === filterSquadId;
      const matchProject = !filterProjectId || p.id === filterProjectId;
      return matchSquad && matchProject;
    });
  }, [projects, filterSquadId, filterProjectId]);

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
        // Sort in alphabetical order
        list.sort((a,b) => a.nome.localeCompare(b.nome));
        setProjects(list);
      },
      (error) => {
        console.warn("Transient snap validation in control-view projects:", error);
      }
    );
    return () => unsubscribe();
  }, [userId]);

  // Load milestones for each project
  useEffect(() => {
    if (projects.length === 0) return;

    const unsubscribes = projects.map((p) => {
      const q = collection(db, "projetos", p.id, "marcos");
      return onSnapshot(
        q,
        (snapshot) => {
          const milestonesList: Marco[] = [];
          snapshot.forEach((doc) => {
            milestonesList.push({ id: doc.id, ...doc.data() } as Marco);
          });
          // Sort chronologically/by limit date
          milestonesList.sort((a,b) => a.dataLimite.localeCompare(b.dataLimite));

          setAllMilestones((prev) => ({
            ...prev,
            [p.id]: milestonesList,
          }));
        },
        (error) => {
          console.warn(`Transient snap validation in control-view marcos for ${p.id}:`, error);
        }
      );
    });

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [projects]);

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

  // Toggle milestone checkbox status on Gantt click
  const handleToggleMilestone = async (projectId: string, mId: string, currentStatus: boolean, name: string) => {
    try {
      await updateDoc(doc(db, "projetos", projectId, "marcos", mId), {
        concluido: !currentStatus,
      });
      addNotification("Meta Atualizada", `Marco "${name}" agora está ${!currentStatus ? "Concluído" : "Aberto"}.`, "success");
      
      // Recalculate progress percentage
      await recalculateProjectProgress(projectId);
    } catch (e) {
      console.error(e);
    }
  };

  // Drag and Drop imitation or direct arrow moving for Kanban Stage cards
  const handleMoveProjectStage = async (pId: string, currentStage: Projeto["estagio"], direction: "back" | "forward") => {
    const stages: Projeto["estagio"][] = ["Ideação", "Viabilidade", "Em Execução", "Validação/Homologação", "Concluído"];
    const idx = stages.indexOf(currentStage);
    let newIdx = idx;

    if (direction === "back" && idx > 0) newIdx--;
    if (direction === "forward" && idx < stages.length - 1) newIdx++;

    if (newIdx !== idx) {
      try {
        await updateDoc(doc(db, "projetos", pId), {
          estagio: stages[newIdx],
        });
        addNotification("Pipeline Atualizado", `Projeto movido para estágio "${stages[newIdx]}".`, "info");
      } catch (err) {
        console.error("Erro reposicionando estágio no pipeline:", err);
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 text-slate-800 animate-fade-in">
      
      {/* Switch Control Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-white border border-slate-200 shadow-sm rounded-2xl gap-4">
        <div>
          <h2 className="text-xl font-bold font-display tracking-tight text-slate-900">Visões de Controle Gerencial</h2>
          <p className="text-xs text-slate-500">Monitore os prazos e o progresso técnico do portfólio de iniciativas ativos.</p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveLayout("gantt")}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeLayout === "gantt"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Gantt & Marcos
          </button>
          <button
            onClick={() => setActiveLayout("kanban")}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeLayout === "kanban"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Kanban className="w-3.5 h-3.5" />
            Kanban Gerencial
          </button>
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-3">
          <div className="p-4 bg-amber-50 text-amber-500 rounded-full animate-pulse">
            <Milestone className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-slate-800 text-lg font-display">Sem Dados para Análise</h3>
          <p className="text-sm text-slate-500 max-w-sm">
            Cadastre ao menos um projeto e defina marcos na aba de "Projetos e Inputs" para desbloquear as visões de Gantt e Kanban.
          </p>
        </div>
      ) : activeLayout === "gantt" ? (
        
        /* ---------------------------------------------------- */
        /* PILLAR 4.A: CRONOGRAMA COM GRÁFICO DE GANTT & MARCOS */
        /* ---------------------------------------------------- */
        <div className="glass p-6 rounded-3xl shadow-sm space-y-6">
          <div>
            <h3 className="font-semibold text-slate-900 font-display text-lg">Cronograma Macroduração e Marcos de Entrega</h3>
            <p className="text-xs text-slate-500 mt-1">
              A barra cinza representa o período previsto do projeto. O diamante (◆) representa um marco de entrega crítico corporativo. 
              Ao passar da data hoje e não concluído, o diamante ficará <strong className="text-rose-500">vermelho</strong>. Clique no diamante para mudar o status de conclusão de forma ágil.
            </p>
          </div>

          <div className="space-y-8 pt-4">
            {filteredProjects.map((p) => {
              const expectedProg = calculateExpectedProgress(p.dataInicio, p.dataFim);
              const ragDetails = getRAGDetails(p.progressoManual || 0, expectedProg, p.dataFim);
              const milestones = allMilestones[p.id] || [];

              // Calculate current timeline elapsed percent for "Today Indicator" positioning
              const start = new Date(p.dataInicio).getTime();
              const end = new Date(p.dataFim).getTime();
              const totalDuration = end - start;
              const elapsed = Date.now() - start;
              const todayLinePct = totalDuration > 0 ? Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100) : 0;

              return (
                <div key={p.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center border-b border-slate-100 pb-6 last:border-b-0 last:pb-0">
                  
                  {/* Left Metadata col (md:col-span-3) */}
                  <div className="md:col-span-3">
                    <div className="flex items-center gap-2">
                       <span className={`w-2.5 h-2.5 rounded-full ${ragDetails.colorClass}`} title={ragDetails.label} />
                       <h4 className="font-bold text-slate-900 text-sm">{p.nome}</h4>
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono mt-1">
                      GP: {p.gpEmail.split("@")[0]} | {p.dataInicio} ~ {p.dataFim}
                    </p>
                    <div className="flex flex-wrap gap-2 items-center mt-2">
                      <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded font-medium text-slate-600 border border-slate-200">
                        {p.estagio}
                      </span>
                      {p.squadNome && (
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${getSquadColorClasses(p.squadNome)}`}>
                          {p.squadNome}
                        </span>
                      )}
                      <span className="text-[10px] text-indigo-600 font-bold font-mono">
                        Real: {p.progressoManual}%
                      </span>
                    </div>
                  </div>

                  {/* Timeline Bar col (md:col-span-9) */}
                  <div className="md:col-span-9 space-y-4">
                    
                    {/* Gantt Bar Stage Container line */}
                    <div className="relative h-9 bg-slate-100/70 border border-slate-200 rounded-xl flex items-center px-1 overflow-visible">
                      
                      {/* Percent expected progress range line shaded */}
                      <div 
                        className="absolute h-full top-0 left-0 bg-slate-250/20 border-r border-dashed border-slate-300 rounded-l-xl"
                        style={{ width: `${expectedProg}%` }}
                        title={`Progresso Esperado Pelo Tempo: ${expectedProg}%`}
                      />

                      {/* Real manual progress active fill */}
                      <div 
                        className="absolute h-2.5 top-3 left-2 bg-indigo-600 rounded-full shadow-xs transition-all duration-300"
                        style={{ width: `calc(${p.progressoManual}% - 16px)` }}
                      />

                      {/* Line marking the Date "Today" */}
                      {todayLinePct > 0 && todayLinePct < 100 && (
                        <div 
                          className="absolute h-10 w-[2px] bg-sky-500 z-10"
                          style={{ left: `${todayLinePct}%` }}
                        >
                          <div className="absolute -top-3.5 -left-4 text-[8px] font-bold text-sky-600 bg-white border border-sky-200 px-1 rounded shadow-xs uppercase tracking-wide">
                            Hoje
                          </div>
                        </div>
                      )}

                      {/* Markers for Milestones aligned by progress spacing */}
                      {milestones.map((m, idx) => {
                        // Position based on date ratio
                        const mDate = new Date(m.dataLimite).getTime();
                        let pct = 0;
                        if (totalDuration > 0) {
                          pct = ((mDate - start) / totalDuration) * 100;
                        }
                        pct = Math.min(Math.max(pct, 2), 98); // Bounds safety

                        const isPassed = new Date(m.dataLimite) < new Date();
                        const showRed = isPassed && !m.concluido;

                        return (
                          <div
                            key={m.id}
                            className="absolute -top-1.5 transform -translate-x-1/2 z-20 group cursor-pointer"
                            style={{ left: `${pct}%` }}
                            onClick={() => handleToggleMilestone(p.id, m.id, m.concluido, m.nome)}
                          >
                            {/* Diamonds color coding */}
                            <div
                              className={`w-4.5 h-4.5 rotate-45 border-2 transition-all shadow-xs ${
                                m.concluido
                                  ? "bg-emerald-500 border-white hover:scale-125"
                                  : showRed
                                  ? "bg-rose-600 border-rose-300 hover:scale-125 animate-pulse"
                                  : "bg-slate-300 border-white hover:bg-slate-400 group-hover:scale-110"
                              }`}
                            />

                            {/* Hover tooltip for Milestone deadlines */}
                            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 hidden group-hover:block bg-slate-900 text-white border border-slate-800 text-[10px] p-2 rounded-lg whitespace-nowrap shadow-xl z-50">
                              <p className="font-bold">{m.nome}</p>
                              <p className="text-[9px] text-slate-300 mt-0.5">Vencimento: {m.dataLimite}</p>
                              <p className={`text-[9px] font-bold mt-1 ${m.concluido ? "text-emerald-450" : showRed ? "text-rose-400" : "text-sky-300"}`}>
                                {m.concluido ? "Concluído (Clique para abrir)" : showRed ? "💥 ATRASADO (Clique para concluir)" : "Aberto (Clique para concluir)"}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Milestones status checklist mini badges below Gantt row */}
                    {milestones.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {milestones.map((m) => {
                          const isPassed = new Date(m.dataLimite) < new Date();
                          const overdue = isPassed && !m.concluido;

                          return (
                            <div 
                              key={m.id}
                              onClick={() => handleToggleMilestone(p.id, m.id, m.concluido, m.nome)}
                              className={`flex items-center gap-1.5 px-2 py-0.5 border text-[9px] rounded-md font-medium cursor-pointer transition-colors ${
                                m.concluido 
                                  ? "bg-emerald-50/50 border-emerald-150 text-emerald-700" 
                                  : overdue 
                                  ? "bg-rose-50 border-rose-150 text-rose-700 animate-pulse" 
                                  : "bg-slate-50 border-slate-150 text-slate-600 hover:bg-slate-100"
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${m.concluido ? "bg-emerald-500" : overdue ? "bg-rose-600" : "bg-slate-400"}`} />
                              <span>{m.nome} ({m.dataLimite.substring(5)})</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 italic">Nenhum marco programado para este projeto no Gantt.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        
        /* ---------------------------------------------------- */
        /* PILLAR 4.B: KANBAN GERENCIAL (FLUXO DE INICIATIVAS)  */
        /* ---------------------------------------------------- */
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 overflow-x-auto pb-4">
          
          {(["Ideação", "Viabilidade", "Em Execução", "Validação/Homologação", "Concluído"] as Projeto["estagio"][]).map((stage, sIdx) => {
            const listDocs = filteredProjects.filter((p) => p.estagio === stage);

            return (
              <div key={stage} className="glass border border-slate-200/60 p-4 rounded-2xl flex flex-col gap-3 min-w-[220px] max-h-[500px]">
                
                {/* Column stage Header */}
                <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                  <span className="font-extrabold font-display text-xs text-slate-700 uppercase tracking-wider">{stage}</span>
                  <span className="bg-slate-200 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {listDocs.length}
                  </span>
                </div>

                {/* Subcontainer scrollable cards list */}
                <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                  {listDocs.map((p) => {
                    const expected = calculateExpectedProgress(p.dataInicio, p.dataFim);
                    const rag = getRAGDetails(p.progressoManual || 0, expected, p.dataFim);
                    
                    // Find next milestone close to current time 
                    const mList = allMilestones[p.id] || [];
                    const activeMilestone = mList.find((m) => !m.concluido);

                    return (
                      <div 
                        key={p.id}
                        className="bg-white border border-slate-150 p-3 rounded-xl shadow-xs transition-shadow hover:shadow-md flex flex-col gap-2 relative group"
                      >
                        {/* Upper row */}
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-bold text-slate-900 text-xs tracking-tight line-clamp-1">{p.nome}</h4>
                            {p.squadNome && (
                              <span className={`text-[9px] px-1.5 py-0.5 mt-0.5 inline-block border rounded font-bold ${getSquadColorClasses(p.squadNome)}`}>
                                {p.squadNome}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Middle meta gp */}
                        <div className="flex items-center gap-1 text-[10px] text-slate-500">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>GP: {p.gpEmail.split("@")[0]}</span>
                        </div>

                        {/* RAG indication dynamic bar alert */}
                        <div className={`p-1.5 border border-dashed rounded-lg text-[9px] font-bold flex items-center justify-between ${rag.textClass}`}>
                          <span>Farol RAG:</span>
                          <span>{rag.emoji} {rag.label}</span>
                        </div>

                        {/* Next Milestone tracker diamonds representation */}
                        {activeMilestone ? (
                          <div className="mt-1 flex items-start gap-1 p-1 bg-sky-50 text-[10px] rounded text-sky-700 border border-sky-100 italic">
                            <span className="font-bold shrink-0">Prox Marco:</span>
                            <span className="line-clamp-1">{activeMilestone.nome} ({activeMilestone.dataLimite})</span>
                          </div>
                        ) : (
                          <div className="mt-1 text-[9px] text-slate-400 italic">Tudo entregue ou sem marcos ativos.</div>
                        )}

                        {/* Bottom line: progress tracker and Stage controllers */}
                        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-600 font-mono text-[10px]">Real: {p.progressoManual}%</span>

                          <div className="flex items-center gap-0.5">
                            {sIdx > 0 && (
                              <button
                                onClick={() => handleMoveProjectStage(p.id, p.estagio, "back")}
                                className="p-0.5 hover:bg-slate-100 text-slate-500 rounded"
                                title="Recuar Estágio"
                              >
                                <ArrowLeft className="w-3 h-3" />
                              </button>
                            )}
                            {sIdx < 4 && (
                              <button
                                onClick={() => handleMoveProjectStage(p.id, p.estagio, "forward")}
                                className="p-0.5 hover:bg-slate-100 text-slate-500 rounded"
                                title="Avançar Estágio"
                              >
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
