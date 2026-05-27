import React, { useState, useEffect } from "react";
import { DollarSign, ShieldAlert, TrendingDown, Users, Flame, Milestone, Sparkles, Printer, RefreshCw, AlertCircle, HelpCircle } from "lucide-react";
import { collection, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { db } from "../lib/firebaseInit";
import { Projeto, Colaborador, Alocacao, CicloInput, Marco } from "../types";
import { calculateExpectedProgress, getRAGDetails } from "./ControlViews";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface DashboardProps {
  userId: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ userId }) => {
  const [projects, setProjects] = useState<Projeto[]>([]);
  const [collaborators, setCollaborators] = useState<Colaborador[]>([]);
  const [allocations, setAllocations] = useState<Alocacao[]>([]);
  const [allCycles, setAllCycles] = useState<{ [projId: string]: CicloInput[] }>({});
  const [allMilestones, setAllMilestones] = useState<{ [projId: string]: Marco[] }>({});

  // Gemini AI Analysis State
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [loadingAi, setLoadingAi] = useState<boolean>(false);

  // Sync data in real-time
  useEffect(() => {
    if (!userId) return;

    // Projects
    const unsubscribeProjects = onSnapshot(
      query(collection(db, "projetos"), where("userId", "==", userId)),
      (snapshot) => {
        const list: Projeto[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Projeto);
        });
        setProjects(list);
      }
    );

    // Collaborators
    const unsubscribeColabs = onSnapshot(
      query(collection(db, "colaboradores"), where("userId", "==", userId)),
      (snapshot) => {
        const list: Colaborador[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Colaborador);
        });
        setCollaborators(list);
      }
    );

    // Allocations
    const unsubscribeAllocs = onSnapshot(
      query(collection(db, "alocacoes"), where("userId", "==", userId)),
      (snapshot) => {
        const list: Alocacao[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Alocacao);
        });
        setAllocations(list);
      }
    );

    return () => {
      unsubscribeProjects();
      unsubscribeColabs();
      unsubscribeAllocs();
    };
  }, [userId]);

  // Track subcollections Cycles and Milestones for ALL projects in simple triggers
  useEffect(() => {
    if (projects.length === 0) return;

    const unsubscribesCycles = projects.map((p) => {
      const q = collection(db, "projetos", p.id, "ciclos");
      return onSnapshot(q, (snapshot) => {
        const cycles: CicloInput[] = [];
        snapshot.forEach((doc) => {
          cycles.push({ id: doc.id, ...doc.data() } as CicloInput);
        });
        setAllCycles((prev) => ({ ...prev, [p.id]: cycles }));
      });
    });

    const unsubscribesMilestones = projects.map((p) => {
      const q = collection(db, "projetos", p.id, "marcos");
      return onSnapshot(q, (snapshot) => {
        const milestones: Marco[] = [];
        snapshot.forEach((doc) => {
          milestones.push({ id: doc.id, ...doc.data() } as Marco);
        });
        setAllMilestones((prev) => ({ ...prev, [p.id]: milestones }));
      });
    });

    return () => {
      unsubscribesCycles.forEach((unsub) => unsub());
      unsubscribesMilestones.forEach((unsub) => unsub());
    };
  }, [projects]);

  // ----------------------------------------------------
  // CALCULATIONS / DERIVED SUMMARY STATE FOR EXECUTIVE DASHBOARD
  // ----------------------------------------------------

  // 1. CPI Global (Pilar 5.1)
  const financialSummary = React.useMemo(() => {
    let globalPV = 0; // Planned Value
    let globalAC = 0; // Actual Cost

    (Object.values(allCycles) as CicloInput[][]).forEach((cyclesList) => {
      cyclesList.forEach((cy) => {
        const pv = (cy.financeiro?.pessoasPlanejado || 0) + (cy.financeiro?.infraPlanejado || 0) + (cy.financeiro?.fornecedoresPlanejado || 0);
        const ac = (cy.financeiro?.pessoasReal || 0) + (cy.financeiro?.infraReal || 0) + (cy.financeiro?.fornecedoresReal || 0);
        globalPV += pv;
        globalAC += ac;
      });
    });

    const cpi = globalAC > 0 ? parseFloat((globalPV / globalAC).toFixed(2)) : 0;
    return { globalPV, globalAC, cpi };
  }, [allCycles]);

  // 2. Timeline comparison progress vs esperados (Pilar 5.2)
  const projectsProgressData = React.useMemo(() => {
    return projects.map((p) => {
      const expected = calculateExpectedProgress(p.dataInicio, p.dataFim);
      return {
        name: p.nome,
        "Real (%)": p.progressoManual,
        "Esperado (%)": expected,
      };
    });
  }, [projects]);

  // 3. Planned Hours vs Gastas & Predictability Index (Pilar 5.3)
  const hoursAndPredictability = React.useMemo(() => {
    let totalPlannedPoints = 0;
    let totalDeliveredPoints = 0;
    const hoursData: { name: string; "Horas Previstas": number; "Horas Gastas": number }[] = [];

    projects.forEach((p) => {
      let projPlannedHours = 0;
      let projActualHours = 0;
      const cycles = allCycles[p.id] || [];

      cycles.forEach((cy) => {
        totalPlannedPoints += cy.pontosPlanejados || 0;
        totalDeliveredPoints += cy.pontosEntregues || 0;
        projPlannedHours += cy.horasPrevistas || 0;
        projActualHours += cy.horasGastas || 0;
      });

      hoursData.push({
        name: p.nome,
        "Horas Previstas": projPlannedHours,
        "Horas Gastas": projActualHours,
      });
    });

    const predictability = totalPlannedPoints > 0 ? Math.round((totalDeliveredPoints / totalPlannedPoints) * 100) : 0;

    return { hoursData, predictability };
  }, [projects, allCycles]);

  // 4. Team Resource Allocation (Pilar 5.4)
  const resourceAllocationChart = React.useMemo(() => {
    let totalAllocedPct = 0;
    const maxCapacity = (collaborators.length || 0) * 100;

    allocations.forEach((a) => {
      totalAllocedPct += a.percentualDedication || 0;
    });

    const activePct = maxCapacity > 0 ? Math.min(Math.round((totalAllocedPct / maxCapacity) * 100), 100) : 0;
    const availablePct = 100 - activePct;

    return [
      { name: "Alocado", value: activePct, color: "#4f46e5" },   // indigo
      { name: "Disponível", value: availablePct, color: "#e2e8f0" } // slate-200
    ];
  }, [collaborators, allocations]);

  // 5. Defect Density per module / project (Pilar 5.5)
  // Let's compute defect counts per project
  const defectsDensityData = React.useMemo(() => {
    return projects.map((p) => {
      let totalBugs = 0;
      let totalDeliveries = 0;
      const cycles = allCycles[p.id] || [];

      cycles.forEach((cy) => {
        totalBugs += cy.bugs || 0;
        totalDeliveries += cy.entregasCount || 0;
      });

      // Density is bugs per delivery milestone (or simple bug representations)
      return {
        name: p.nome,
        "Bugs Registrados": totalBugs,
        "Quantidade Entregas": totalDeliveries,
      };
    });
  }, [projects, allCycles]);

  // 6. Bug Trend over time (Pilar 5.3 line chart)
  const bugTrendData = React.useMemo(() => {
    const rawMap: { [dateStr: string]: number } = {};

    (Object.values(allCycles) as CicloInput[][]).forEach((cyclesList) => {
      cyclesList.forEach((cy) => {
        rawMap[cy.dataReferencia] = (rawMap[cy.dataReferencia] || 0) + (cy.bugs || 0);
      });
    });

    const sortedDates = Object.keys(rawMap).sort();
    return sortedDates.map((dateStr) => {
      // Human-friendly abbreviation like "27/Mai"
      const parts = dateStr.split("-");
      const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dateStr;

      return {
        date: label,
        "Total de Bugs": rawMap[dateStr],
      };
    });
  }, [allCycles]);

  // 7. Overdue active Critical milestones list tracker
  const criticalMilestones = React.useMemo(() => {
    const list: { project: string; name: string; date: string; delay: boolean }[] = [];
    const today = new Date();
    today.setHours(0,0,0,0);

    (Object.entries(allMilestones) as [string, Marco[]][]).forEach(([projId, milestones]) => {
      const proj = projects.find((p) => p.id === projId);
      const projName = proj ? proj.nome : "Ativo";

      milestones.forEach((m) => {
        const mDate = new Date(m.dataLimite);
        const overdue = mDate < today && !m.concluido;
        if (!m.concluido) {
          list.push({
            project: projName,
            name: m.nome,
            date: m.dataLimite,
            delay: overdue,
          });
        }
      });
    });

    // Sort by limit date close to current
    list.sort((a,b) => a.date.localeCompare(b.date));
    return list.slice(0, 5);
  }, [allMilestones, projects]);

  // Request portfolio strategic analysis with Gemini AI
  const handleTriggerGeminiAnalysis = async () => {
    setLoadingAi(true);
    setAiAnalysis("");
    try {
      // Package payload to send to Gemini API
      const pPayload = projects.map(p => {
        const expected = calculateExpectedProgress(p.dataInicio, p.dataFim);
        const cyList = allCycles[p.id] || [];
        const mList = allMilestones[p.id] || [];

        return {
          id: p.id,
          nome: p.nome,
          dataInicio: p.dataInicio,
          dataFim: p.dataFim,
          estagio: p.estagio,
          progressoManualPercentage: p.progressoManual,
          progressoEsperadoPercentage: expected,
          ciclosFinancesAgile: cyList,
          marcosMilestones: mList,
        };
      });

      const response = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projects: pPayload,
          collaborators,
          allocations,
        }),
      });

      const data = await response.json();
      if (data.analysis) {
        setAiAnalysis(data.analysis);
      } else if (data.error) {
        setAiAnalysis(`### Erro na Análise\n\n${data.error}`);
      }
    } catch (e: any) {
      setAiAnalysis(`### Erro na Rede\n\nFalha ao se conectar com a API do Gemini. Detalhes: ${e.message}`);
    } finally {
      setLoadingAi(false);
    }
  };

  // Printing trigger
  const handlePrintReport = () => {
    window.print();
  };

  // Color constants for charts
  const RAD_COLORS = ["#4f46e5", "#e2e8f0"];

  return (
    <div className="space-y-8 text-slate-800 animate-fade-in print:p-8 print:bg-white">
      
      {/* Upper Control Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-6 bg-white border border-slate-200 rounded-2xl shadow-sm gap-4 print:hidden">
        <div>
          <span className="text-xs text-indigo-600 font-extrabold uppercase tracking-widest font-mono">Conselho Administrativo</span>
          <h2 className="text-2xl font-bold font-display tracking-tight text-slate-900 mt-0.5">Dashboard Executivo PPM</h2>
          <p className="text-xs text-slate-500">Relatório consolidado de múltiplos projetos para apresentação direta à diretoria.</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handlePrintReport}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 border border-slate-200"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir Relatório
          </button>
          <button
            onClick={handleTriggerGeminiAnalysis}
            disabled={loadingAi || projects.length === 0}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-md text-xs font-semibold rounded-xl transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {loadingAi ? "Gerando IA..." : "Análise Inteligente Gemini"}
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center border border-slate-100 shadow-sm flex flex-col justify-center items-center gap-3">
          <div className="p-4 bg-indigo-50 text-indigo-500 rounded-full animate-bounce">
            <Sparkles className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-slate-800 text-lg font-display">Espere ou insira dados de iniciativa</h3>
          <p className="text-sm text-slate-500 max-w-sm">
            Nenhum projeto foi importado para renderizar o dashboard. Visite a aba "Projetos e Inputs" para introduzir os dados iniciais.
          </p>
        </div>
      ) : (
        <>
          {/* CORE KPIs Executive cards row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            {/* KPI 1: CPI CARD (Pilar 5.1) */}
            <div className="relative overflow-hidden glass p-6 rounded-2xl shadow-sm flex flex-col justify-between transition-transform duration-200 hover:scale-[1.01]">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-display">Saúde Financeira (CPI)</span>
                <span className={`p-1.5 rounded-lg text-xs font-bold ${financialSummary.cpi >= 1.0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                  {financialSummary.cpi >= 1.0 ? "🟢 Saudável" : "🔴 Estourado"}
                </span>
              </div>
              <div className="mt-4">
                <span className="text-3xl font-extrabold text-slate-900 tracking-tight font-display">{financialSummary.cpi || "0.0"}</span>
                <p className="text-[10px] text-slate-400 mt-1">CPI Global do Portfólio (Índice de Custo)</p>
              </div>

              {/* Warnings representation */}
              {financialSummary.cpi > 0 && financialSummary.cpi < 1.0 && (
                <div className="mt-3 p-2 bg-rose-50 border border-rose-100 rounded-lg text-[10px] text-rose-700 flex items-start gap-1.5 font-medium animate-pulse">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  <span>Déficit orçamentário detectado! Gastos reais superaram planejados.</span>
                </div>
              )}
            </div>

            {/* KPI 2: Allocations percentage index (Pilar 5.4) */}
            <div className="glass p-6 rounded-2xl shadow-sm flex flex-col justify-between transition-transform duration-200 hover:scale-[1.01]">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-display">Ocupação da Equipe</span>
                <Users className="w-5 h-5 text-indigo-500" />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900 tracking-tight font-display">
                  {resourceAllocationChart[0].value}%
                </span>
                <span className="text-xs text-slate-400">alocados</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Fração disponível: {resourceAllocationChart[1].value}% do time</p>
            </div>

            {/* KPI 3: Agile Predictability index (Pilar 5.3) */}
            <div className="glass p-6 rounded-2xl shadow-sm flex flex-col justify-between transition-transform duration-200 hover:scale-[1.01]">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-display">Previsibilidade Ágil</span>
                <TrendingDown className="w-5 h-5 text-blue-500" />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900 tracking-tight font-display">{hoursAndPredictability.predictability}%</span>
                <span className="text-xs text-slate-400">de eficácia</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Pontos entregues vs pontos planejados nas Sprints</p>
            </div>

            {/* KPI 4: Total active project counts */}
            <div className="glass p-6 rounded-2xl shadow-sm flex flex-col justify-between transition-transform duration-200 hover:scale-[1.01]">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-display">Iniciativas Ativas</span>
                <Flame className="w-5 h-5 text-amber-500" />
              </div>
              <div className="mt-4">
                <span className="text-3xl font-extrabold text-slate-900 tracking-tight font-display">{projects.length}</span>
                <p className="text-[10px] text-slate-400 mt-1">
                  Projetos sendo gerenciados no KIA PPM
                </p>
              </div>
            </div>
          </div>

          {/* GEMINI ADVISOR PANEL IF ACTIVE */}
          {loadingAi || aiAnalysis ? (
            <div className="bg-indigo-900 text-white rounded-3xl p-6 shadow-md space-y-4 border border-indigo-950">
              <div className="flex items-center justify-between border-b border-indigo-850 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-300 animate-spin" />
                  <span className="font-bold font-display tracking-tight text-lg text-indigo-100">KIA Project AI Auditor (Gemini Advisor)</span>
                </div>
                {loadingAi && (
                  <span className="text-xs font-mono text-indigo-300 animate-pulse bg-indigo-950 px-2 py-0.5 rounded-full">
                    Consultando modelo de auditoria...
                  </span>
                )}
              </div>

              {loadingAi ? (
                <div className="space-y-3 py-4">
                  <div className="h-3 bg-indigo-800/60 rounded animate-pulse w-3/4"></div>
                  <div className="h-3 bg-indigo-800/60 rounded animate-pulse w-5/6"></div>
                  <div className="h-3 bg-indigo-800/60 rounded animate-pulse w-2/3"></div>
                </div>
              ) : (
                <div className="text-indigo-100 text-sm leading-relaxed whitespace-pre-wrap font-sans space-y-2 prose prose-invert overflow-y-auto max-h-[350px]">
                  {aiAnalysis}
                </div>
              )}
            </div>
          ) : null}

          {/* CHARTS CONTAINER GRID ROW */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Chart 1: Deadlines timelines comparisons (Pilar 5.2 - Real vs esperado) */}
            <div className="lg:col-span-8 glass p-6 rounded-3xl shadow-sm flex flex-col gap-4">
              <div>
                <h3 className="font-bold text-slate-900 font-display text-sm uppercase tracking-wider">Visão Geral de Prazos (% Real vs % Esperado pelo Tempo)</h3>
                <p className="text-xs text-slate-400">Verifique os desvios de tempo. O esperado é medido em relação ao tempo corrido.</p>
              </div>

              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={projectsProgressData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} domain={[0, 100]} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Real (%)" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Esperado (%)" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Resource allocations chart (Pilar 5.4 - Pie Chart) */}
            <div className="lg:col-span-4 glass p-6 rounded-3xl shadow-sm flex flex-col gap-4">
              <div>
                <h3 className="font-bold text-slate-900 font-display text-sm uppercase tracking-wider">Ocupação Logística do Squad</h3>
                <p className="text-xs text-slate-400">Disponibilidade geral do banco de talentos.</p>
              </div>

              <div className="h-56 relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={resourceAllocationChart}
                      cx="55%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {resourceAllocationChart.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>

                <div className="absolute text-center" style={{ left: "calc(55% - 28px)" }}>
                  <span className="text-2xl font-extrabold text-slate-900">{resourceAllocationChart[0].value}%</span>
                  <p className="text-[9px] uppercase font-bold text-slate-400">Ocupado</p>
                </div>
              </div>

              <div className="flex justify-around items-center text-xs mt-2 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                  <span className="text-slate-600 font-medium">Alocado ({resourceAllocationChart[0].value}%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                  <span className="text-slate-600 font-medium">Livre ({resourceAllocationChart[1].value}%)</span>
                </div>
              </div>
            </div>
          </div>

          {/* LOWER ANALYSIS DETAIL GRID ROW */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Metrics column 1: Bugs history trend (Pilar 5.3) */}
            <div className="lg:col-span-4 glass p-6 rounded-3xl shadow-sm space-y-4">
              <div>
                <h3 className="font-bold text-slate-900 font-display text-sm uppercase tracking-wider">Tendência de Defeitos (Bugs)</h3>
                <p className="text-xs text-slate-400">Evolução de defeitos abertos no período.</p>
              </div>

              {bugTrendData.length === 0 ? (
                <div className="h-48 flex items-center justify-center border border-dashed border-slate-250 rounded-2xl text-xs text-slate-400 italic">
                  Complete lançamentos mensais para ver curvas.
                </div>
              ) : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={bugTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" stroke="#64748b" fontSize={9} />
                      <YAxis stroke="#64748b" fontSize={9} />
                      <Tooltip />
                      <Line type="monotone" dataKey="Total de Bugs" stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Metrics column 2: Planning vs Actual hours (Pilar 5.3) */}
            <div className="lg:col-span-4 glass p-6 rounded-3xl shadow-sm space-y-4">
              <div>
                <h3 className="font-bold text-slate-900 font-display text-sm uppercase tracking-wider">Horas Previstas vs Gastas</h3>
                <p className="text-xs text-slate-400">Verifique se o time precisa de horas extras.</p>
              </div>

              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hoursAndPredictability.hoursData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={9} />
                    <YAxis stroke="#64748b" fontSize={9} />
                    <Tooltip />
                    <Bar dataKey="Horas Previstas" fill="#94a3b8" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Horas Gastas" fill="#2563eb" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Metrics column 3: Defect density and Delivery indices (Pilar 5.5) */}
            <div className="lg:col-span-4 glass p-6 rounded-3xl shadow-sm space-y-4">
              <div>
                <h3 className="font-bold text-slate-900 font-display text-sm uppercase tracking-wider">Bugs vs Entregas por Módulo</h3>
                <p className="text-xs text-slate-400">Indicadores de qualidade de software por projeto.</p>
              </div>

              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={defectsDensityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={9} />
                    <YAxis stroke="#64748b" fontSize={9} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    <Bar dataKey="Bugs Registrados" fill="#ef4444" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Quantidade Entregas" fill="#10b981" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* LOWER MOST NOTIFICATIONS AND MILESTONE ALERTS WIDGETS ROW */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Milestone lists */}
            <div className="glass p-6 rounded-3xl shadow-sm flex flex-col justify-between">
              <div>
                <h4 className="font-extrabold text-slate-900 font-display text-xs uppercase tracking-wider mb-3 flex items-center gap-1.5 text-slate-400">
                  <Milestone className="w-3.5 h-3.5" /> Próximas Entregas Críticas no Horizonte
                </h4>

                {criticalMilestones.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-6 text-center">Nenhum marco de entrega em aberto catalogado.</p>
                ) : (
                  <div className="space-y-3">
                    {criticalMilestones.map((cm, idx) => (
                      <div 
                        key={idx} 
                        className={`p-3 rounded-xl border flex justify-between items-center ${
                          cm.delay ? "bg-rose-50 border-rose-150 animate-pulse" : "bg-slate-50/50 border-slate-100"
                        }`}
                      >
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">{cm.project}</span>
                          <span className="font-semibold text-slate-800 text-xs mt-0.5 block">{cm.name}</span>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] font-mono font-bold text-slate-600 block">{cm.date}</span>
                          {cm.delay ? (
                            <span className="text-[9px] font-bold text-rose-600 uppercase tracking-wider block mt-0.5">💥 Atrasado!</span>
                          ) : (
                            <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-wider block mt-0.5">Programado</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* QA Testing metrics insight explanation box */}
            <div className="bg-slate-50 border border-slate-200/50 p-6 rounded-3xl flex flex-col gap-3">
              <h4 className="font-extrabold font-display text-xs text-slate-400 uppercase tracking-wider">Práticas Recomendadas de Engenharia</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Mantenha seu <strong>PPM KIA Suite</strong> alimentado semanalmente. O índice de <strong>Previsibilidade Ágil (atual: {hoursAndPredictability.predictability}%)</strong> reflete a aderência dos squads ao escopo negociado.
              </p>
              
              <div className="grid grid-cols-2 gap-3 mt-1 text-xs">
                <div className="p-3 bg-white border border-slate-150 rounded-xl space-y-1">
                  <span className="font-bold text-slate-800 block">Densidade de Defeitos</span>
                  <span className="text-slate-500 text-[11px] block leading-relaxed">Taxas de bugs por entrega elevadas indicam a necessidade de robustecer testes unitários e homologações automatizadas.</span>
                </div>
                <div className="p-3 bg-white border border-slate-150 rounded-xl space-y-1">
                  <span className="font-bold text-slate-800 block">Gestão Logística</span>
                  <span className="text-slate-500 text-[11px] block leading-relaxed">Evite alocações em projetos múltiplos acima de 100% de dedicação para blindar seu time de estafa e queda de vazão.</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
