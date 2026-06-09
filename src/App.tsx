import React, { useState, useEffect, useRef } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from "firebase/auth";
import { auth, googleProvider, db } from "./lib/firebaseInit";
import { NotificationProvider, useNotifications } from "./components/NotificationToast";
import { Dashboard } from "./components/Dashboard";
import { ProjectsAdmin } from "./components/ProjectsAdmin";
import { ControlViews } from "./components/ControlViews";
import { ResourceMatrix } from "./components/ResourceMatrix";
import { collection, onSnapshot, query, where, getDocs, doc, updateDoc } from "firebase/firestore";
import { Projeto, Squad } from "./types";
import {
  FolderKanban,
  LayoutDashboard,
  Users,
  Compass,
  LogOut,
  Calendar,
  Lock,
  ChevronRight,
  Sparkles,
  Info,
  BellRing
} from "lucide-react";

// The outer layout wrapping Context
function PPMWorkspaceShell() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<"dashboard" | "projetos" | "controle" | "recursos">("dashboard");
  const [projectsList, setProjectsList] = useState<Projeto[]>([]);
  const [squadsList, setSquadsList] = useState<Squad[]>([]);
  const [filterSquadId, setFilterSquadId] = useState<string>("");
  const [filterProjectId, setFilterProjectId] = useState<string>("");
  const { addNotification } = useNotifications();
  const [showLoginErrorDetail, setShowLoginErrorDetail] = useState(false);
  const [loginErrorMessage, setLoginErrorMessage] = useState("");

  // Listen to Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // Listen to squads list to feed global dropdown filter
  useEffect(() => {
    if (!user) {
      setSquadsList([]);
      return;
    }
    const q = query(collection(db, "squads"), where("userId", "==", user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Squad[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Squad);
        });
        list.sort((a,b) => a.nome.localeCompare(b.nome));
        setSquadsList(list);
      },
      (error) => {
        console.warn("Transient snap validation in app squads:", error);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // If squad filter changes, reset project filter if the selected project is not in that squad
  useEffect(() => {
    if (filterSquadId && filterProjectId) {
      const selectedProj = projectsList.find(p => p.id === filterProjectId);
      if (selectedProj && selectedProj.squadId !== filterSquadId) {
        setFilterProjectId("");
      }
    }
  }, [filterSquadId, filterProjectId, projectsList]);

  const validatedProjectIdsRef = useRef<Set<string>>(new Set());

  // Self-healing: validate & align projects' Progresso Real when the app loads
  useEffect(() => {
    if (!user || projectsList.length === 0) return;

    const validateProjectProgress = async (p: Projeto) => {
      if (validatedProjectIdsRef.current.has(p.id)) return;

      try {
        // Query subcollection: 'marcos' (milestones)
        const milestonesSnap = await getDocs(collection(db, "projetos", p.id, "marcos"));
        const milestones: any[] = [];
        milestonesSnap.forEach((d) => {
          milestones.push(d.data());
        });

        // Query subcollection: 'ciclos' (cycles)
        const cyclesSnap = await getDocs(collection(db, "projetos", p.id, "ciclos"));
        const cycles: any[] = [];
        cyclesSnap.forEach((d) => {
          cycles.push(d.data());
        });

        let correctProgress = 0;

        if (milestones.length > 0) {
          // Rule A: if milestones exist, progress is percent of completed milestones
          const completed = milestones.filter((m) => m.concluido === true).length;
          correctProgress = Math.round((completed / milestones.length) * 100);
        } else if (cycles.length > 0) {
          // Rule B: if cycles exist, progress is based on the latest cycle (chronologically by dataReferencia)
          cycles.sort((a, b) => {
            const dateA = a.dataReferencia || "";
            const dateB = b.dataReferencia || "";
            return dateA.localeCompare(dateB);
          });
          correctProgress = cycles[cycles.length - 1].progresso || 0;
        } else {
          // Rule C: if neither milestones nor cycles exist, progress is strictly 0%
          correctProgress = 0;
        }

        const currentProg = p.progressoManual || 0;
        if (currentProg !== correctProgress) {
          console.log(
            `[Self-Healing] Corrigindo progresso do projeto "${p.nome}" (${p.id}): de ${currentProg}% para ${correctProgress}%`
          );
          await updateDoc(doc(db, "projetos", p.id), {
            progressoManual: correctProgress,
          });
        }
        
        // Add to set only after successful completion so if any read/write fails, it can retry
        validatedProjectIdsRef.current.add(p.id);
      } catch (err) {
        console.error(`Erro ao auto-corrigir progresso do projeto ${p.id}:`, err);
      }
    };

    projectsList.forEach((p) => {
      validateProjectProgress(p);
    });
  }, [projectsList, user]);

  // Listen to projects list to pipe shared properties to modular views like Resource Matrix
  useEffect(() => {
    if (!user) {
      setProjectsList([]);
      return;
    }
    const q = query(collection(db, "projetos"), where("userId", "==", user.uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Projeto[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Projeto);
        });
        list.sort((a,b) => a.nome.localeCompare(b.nome));
        setProjectsList(list);
      },
      (error) => {
        console.warn("Transient snap validation in app projects:", error);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // Auth Handler: Trigger Popup for security login with Google account
  const handleGoogleLogin = async () => {
    setShowLoginErrorDetail(false);
    setLoginErrorMessage("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      console.error("Popup de login com o Google interrompido:", e);
      setShowLoginErrorDetail(true);
      
      const isClosedByUser = e?.code === "auth/popup-closed-by-user" || 
                             e?.message?.includes("popup-closed-by-user") ||
                             e?.code === "auth/cancelled-popup-request";

      if (isClosedByUser) {
        setLoginErrorMessage("O pop-up de login foi fechado antes de concluir a autenticação.");
        addNotification(
          "Login Interrompido",
          "O pop-up do Google foi fechado antes do fim. Se persistir, abra o app em uma nova guia pelo botão no topo do AI Studio.",
          "warning"
        );
      } else {
        setLoginErrorMessage(e?.message || String(e));
        addNotification(
          "Erro de Autenticação",
          `Falha ao autenticar com o Google: ${e?.message || e}`,
          "error"
        );
      }
    }
  };

  // Auth Handler: Logout
  const handleLogout = async () => {
    if (window.confirm("Deseja realmente sair da sua conta?")) {
      await signOut(auth);
      setActiveTab("dashboard");
    }
  };

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center gap-3">
        <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-indigo-600 animate-spin" />
        <span className="text-xs text-slate-400 font-mono tracking-wider font-semibold uppercase">Iniciando SDK do PPM...</span>
      </div>
    );
  }

  // Not Logged In View - Sleek custom welcome card with no margin clutter, elegant design
  if (!user) {
    return (
      <div className="min-h-screen bg-[#F1F5F9] flex flex-col justify-center items-center px-4 relative overflow-hidden select-none font-sans">
        {/* Soft background light reflections */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-gradient-to-tr from-indigo-300/5 via-blue-200/0 to-transparent blur-3xl -z-10" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-gradient-to-br from-indigo-200/0 via-teal-300/5 to-transparent blur-3xl -z-10" />

        <div className="w-full max-w-md glass border border-slate-200/60 p-8 rounded-3xl shadow-xl flex flex-col items-center text-center gap-6">
          <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-md flex items-center justify-center bg-white p-1 border border-indigo-100 animate-pulse">
            <img src="/logo.png" alt="KIA Project Suite Logo" className="w-full h-full object-cover rounded-xl" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold font-display text-slate-900 tracking-tight">KIA Project Suite</h1>
            <p className="text-xs text-indigo-600 font-bold uppercase tracking-wider font-mono">Gestão de Portfólio Inteligente</p>
            <p className="text-sm text-slate-500 mt-2 max-w-xs leading-relaxed">
              O substituto definitivo de planilhas complexas para acompanhar orçamentos, cronogramas de marcos e alocações de equipes em tempo real.
            </p>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm rounded-xl inline-flex justify-center items-center gap-3 transition-all transform active:scale-98 shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          >
            {/* Google logo imitation */}
            <svg className="w-4 h-4 fill-white shrink-0" viewBox="0 0 24 24">
              <path d="M12.24 10.285V13.4h6.86c-.277 1.56-1.602 4.585-6.86 4.585-4.54 0-8.24-3.765-8.24-8.4s3.7-8.4 8.24-8.4c2.58 0 4.307 1.095 5.298 2.045l2.465-2.37C18.18 1.21 15.42 0 12.24 0 5.58 0 0 5.37 0 12s5.58 12 12.24 12c6.96 0 11.57-4.89 11.57-11.79 0-.795-.085-1.4-.195-1.925H12.24z"/>
            </svg>
            Entrar com Conta Google
          </button>

          {showLoginErrorDetail && (
            <div className="w-full text-left p-4 bg-amber-50/90 border border-amber-200 text-amber-900 rounded-xl space-y-2 animate-fade-in text-xs leading-relaxed max-w-sm">
              <span className="font-bold block text-amber-950">Aviso importante sobre o Login no Sandbox/Iframe:</span>
              <p className="text-slate-700">Desvios de comunicação em pop-ups do Firebase ocorrem devido às políticas de cookies e pop-ups do navegador dentro de iframes.</p>
              <div className="space-y-1 py-1">
                <span className="font-semibold text-amber-950 block">Como solucionar:</span>
                <ul className="list-disc pl-4 space-y-1 text-slate-700">
                  <li>Selecione <strong>Permitir sempre pop-ups</strong> se o navegador bloquear.</li>
                  <li>Clique no botão <strong>Abrir em nova aba</strong> <span className="inline-block px-1 bg-slate-200 border border-slate-300 rounded font-bold">↗</span> no topo do painel do AI Studio para contornar restrições de iframe.</li>
                </ul>
              </div>
              <p className="text-[10px] text-amber-800 italic">Detalhe do erro: {loginErrorMessage}</p>
            </div>
          )}

          <div className="flex items-center gap-2 text-[10px] text-slate-400 border-t border-slate-150 pt-5 w-full justify-center">
            <Lock className="w-3.5 h-3.5" />
            <span>Workspace Seguro e Autenticado via Firebase</span>
          </div>
        </div>
      </div>
    );
  }

  // Active Authenticated user Workspace
  return (
    <div className="min-h-screen bg-[#F1F5F9] flex flex-col font-sans">
      
      {/* 1. Header Navigation Cockpit from Sleek Theme */}
      <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-8 sticky top-0 z-40 shadow-xs select-none print:hidden">
        
        {/* Brand name */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden shadow-xs flex items-center justify-center bg-white p-0.5 border border-slate-200/80 shrink-0">
            <img src="/logo.png" alt="KIA Logo" className="w-full h-full object-cover rounded-lg" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm md:text-base font-bold text-slate-800 uppercase tracking-tight leading-none">
              KIA Project Suite
            </h1>
            <span className="text-[9px] md:text-xs text-slate-500 font-medium tracking-wide">
              GESTÃO DE PORTFÓLIO EXECUTIVO
            </span>
          </div>
        </div>

        {/* Tab options bar */}
        <nav className="hidden lg:flex items-center gap-1.5 bg-slate-150/80 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-all ${
              activeTab === "dashboard"
                ? "bg-white text-indigo-600 shadow-sm border border-slate-205"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard da Diretoria
          </button>
          
          <button
            onClick={() => setActiveTab("projetos")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-all ${
              activeTab === "projetos"
                ? "bg-white text-indigo-600 shadow-sm border border-slate-205"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <Compass className="w-4 h-4" />
            Projetos & Inputs
          </button>

          <button
            onClick={() => setActiveTab("controle")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-all ${
              activeTab === "controle"
                ? "bg-white text-indigo-600 shadow-sm border border-slate-205"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <Calendar className="w-4 h-4" />
            Visões de Controle (Gantt/Kanban)
          </button>

          <button
            onClick={() => setActiveTab("recursos")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-all ${
              activeTab === "recursos"
                ? "bg-white text-indigo-600 shadow-sm border border-slate-205"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <Users className="w-4 h-4" />
            Talentos & Alocação
          </button>
        </nav>

        {/* User context action options logout */}
        <div className="flex items-center gap-3">
          
          <div className="flex items-center gap-2.5">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || "Avatar"}
                className="w-8 h-8 rounded-full border border-slate-200 pointer-events-none"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center text-xs font-bold shadow-xs">
                GP
              </div>
            )}
            <div className="hidden sm:block text-left">
              <p className="text-xs font-bold leading-tight text-slate-800">{user.displayName || "Gerente de Projetos"}</p>
              <p className="text-[9px] text-slate-400">{user.email}</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-rose-500 transition-colors cursor-pointer border border-transparent hover:border-slate-200"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Responsive tabs for small screen devices */}
      <div className="lg:hidden bg-slate-900 border-b border-slate-800 sticky top-16 z-45 shadow flex justify-around p-2 text-[10px] font-bold uppercase select-none print:hidden">
        <button 
          onClick={() => setActiveTab("dashboard")}
          className={`px-3 py-1 rounded-md transition-colors ${activeTab === "dashboard" ? "bg-indigo-600 text-white" : "text-slate-400"}`}
        >
          Dashboard
        </button>
        <button 
          onClick={() => setActiveTab("projetos")}
          className={`px-3 py-1 rounded-md transition-colors ${activeTab === "projetos" ? "bg-indigo-600 text-white" : "text-slate-400"}`}
        >
          Inputs
        </button>
        <button 
          onClick={() => setActiveTab("controle")}
          className={`px-3 py-1 rounded-md transition-colors ${activeTab === "controle" ? "bg-indigo-600 text-white" : "text-slate-400"}`}
        >
          Controle
        </button>
        <button 
          onClick={() => setActiveTab("recursos")}
          className={`px-3 py-1 rounded-md transition-colors ${activeTab === "recursos" ? "bg-indigo-600 text-white" : "text-slate-400"}`}
        >
          Recursos
        </button>
      </div>

      {/* 2. Global Portfólio Filter Bar */}
      <div className="bg-slate-50 border-b border-slate-200 py-3 px-8 flex flex-col sm:flex-row items-center justify-between gap-4 select-none print:hidden">
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse shrink-0" />
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-700 block">Filtros Ativos</span>
            <span className="text-[10px] text-slate-400">Filtrar Squad e Projeto em todas as abas</span>
          </div>
        </div>

        <div className="flex flex-col xs:flex-row items-center gap-2.5 w-full sm:w-auto">
          {/* Squad Filter Dropdown */}
          <div className="flex items-center gap-1.5 w-full xs:w-48 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs hover:border-slate-300 transition-colors">
            <span className="text-[9px] font-bold text-indigo-700 uppercase tracking-wider shrink-0">Squad:</span>
            <select
              value={filterSquadId}
              onChange={(e) => setFilterSquadId(e.target.value)}
              className="w-full text-xs bg-transparent border-0 focus:ring-0 focus:outline-none font-semibold text-slate-600 cursor-pointer"
            >
              <option value="">Todas</option>
              {squadsList.map((sq) => (
                <option key={sq.id} value={sq.id}>
                  {sq.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Project Filter Dropdown */}
          <div className="flex items-center gap-1.5 w-full xs:w-56 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-2xs hover:border-slate-300 transition-colors">
            <span className="text-[9px] font-bold text-indigo-700 uppercase tracking-wider shrink-0">Projeto:</span>
            <select
              value={filterProjectId}
              onChange={(e) => setFilterProjectId(e.target.value)}
              className="w-full text-xs bg-transparent border-0 focus:ring-0 focus:outline-none font-semibold text-slate-600 cursor-pointer text-ellipsis overflow-hidden"
            >
              <option value="">Todos</option>
              {projectsList
                .filter((p) => !filterSquadId || p.squadId === filterSquadId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
            </select>
          </div>

          {/* Clear Filter Button */}
          {(filterSquadId || filterProjectId) && (
            <button
              onClick={() => {
                setFilterSquadId("");
                setFilterProjectId("");
              }}
              className="text-[10px] font-bold text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 rounded-lg px-2.5 py-1 transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* 3. Workspace container area */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
        {activeTab === "dashboard" && (
          <Dashboard 
            userId={user.uid} 
            filterSquadId={filterSquadId} 
            filterProjectId={filterProjectId} 
          />
        )}
        {activeTab === "projetos" && (
          <ProjectsAdmin 
            userId={user.uid} 
            userEmail={user.email || ""} 
            filterSquadId={filterSquadId} 
            filterProjectId={filterProjectId} 
          />
        )}
        {activeTab === "controle" && (
          <ControlViews 
            userId={user.uid} 
            filterSquadId={filterSquadId} 
            filterProjectId={filterProjectId} 
          />
        )}
        {activeTab === "recursos" && (
          <ResourceMatrix 
            userId={user.uid} 
            projects={projectsList} 
            filterSquadId={filterSquadId} 
            filterProjectId={filterProjectId} 
          />
        )}
      </main>

      {/* Footer styled as sleek bottom cockpit */}
      <footer className="h-10 bg-slate-900 text-[9px] flex items-center justify-between px-6 text-slate-400 select-none print:hidden mt-auto border-t border-slate-850">
        <div className="flex gap-4">
          <span>Sincronizado: Justo agora</span>
          <span>Firebase Status: <span className="text-emerald-400 font-semibold">Online</span></span>
        </div>
        <div className="flex items-center gap-1.5 font-bold">
          <span className="dot bg-indigo-500 w-2 h-2 animate-pulse" />
          <span>KIA PROJECT SUITE v1.0.4 - Executivo View</span>
        </div>
      </footer>
    </div>
  );
}

// Global wrap export
export default function App() {
  return (
    <NotificationProvider>
      <PPMWorkspaceShell />
    </NotificationProvider>
  );
}
