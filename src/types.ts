/**
 * Type declarations for the KIA Project Suite PPM System
 */

export interface Colaborador {
  id: string;
  nome: string;
  papel: string; // ex: Dev, SM, PO, Designer, QA, etc.
  custoHora?: number;
  squadId?: string;
  squadNome?: string;
  userId: string;
  createdAt: string;
}

export interface Squad {
  id: string;
  nome: string;
  tamanho: number;
  metaBugs: number;
  metaEficiencia: number;
  metaAtrasos: number;
  metaSla: number;
  userId: string;
  createdAt: string;
}

export interface Projeto {
  id: string;
  nome: string;
  descricao?: string;
  dataInicio: string; // YYYY-MM-DD
  dataFim: string; // YYYY-MM-DD
  estagio: "Ideação" | "Viabilidade" | "Em Execução" | "Validação/Homologação" | "Concluído";
  progressoManual?: number; // Optional manual progress percentage
  squadId?: string; // Linked Squad ID
  squadNome?: string; // Linked Squad Name
  userId: string;
  gpEmail: string;
  createdAt: string;
}

export interface FinanceiroCiclo {
  pessoasPlanejado: number;
  pessoasReal: number;
  infraPlanejado: number;
  infraReal: number;
  fornecedoresPlanejado: number;
  fornecedoresReal: number;
}

export interface CicloInput {
  id: string;
  nome: string; // ex: "Sprint 42", "Maio 2026"
  dataReferencia: string; // YYYY-MM-DD
  financeiro: FinanceiroCiclo;
  progresso: number; // 0 to 100
  pontosPlanejados: number;
  pontosEntregues: number;
  bugs: number;
  horasPrevistas: number;
  horasGastas: number;
  entregasCount: number;
  userId: string;
  createdAt: string;
}

export interface Alocacao {
  id: string; // colaboradorId + "_" + projectId
  colaboradorId: string;
  colaboradorNome: string;
  colaboradorPapel: string;
  projectId: string;
  projectNome: string;
  percentualDedication: number; // e.g. 50%
  userId: string;
  createdAt: string;
}

export interface Marco {
  id: string;
  nome: string; // ex: "Homologação do Módulo 1"
  dataLimite: string; // YYYY-MM-DD
  concluido: boolean;
  userId: string;
  createdAt: string;
}

export interface Notificacao {
  id: string;
  titulo: string;
  mensagem: string;
  lida: boolean;
  tipo: "info" | "warning" | "success" | "error";
  data: string;
}

export interface Risco {
  id: string;
  descricao: string;
  numIssue: string;
  impacto: "Baixo" | "Médio" | "Alto" | "Crítico" | "Impeditivo";
  status: "Análise" | "Pendente" | "Bloqueio" | "Mitigado" | "Cancelado" | "Concluído";
  dataStatus: string; // YYYY-MM-DD
  responsavel: string;
  userId: string;
  createdAt: string;
}

