import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-loaded Gemini initialization as required
let aiClient: GoogleGenAI | null = null;
function getGemini() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("A variável de ambiente GEMINI_API_KEY não está configurada.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// 1. API: Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// 2. API: Gemini AI Portfolio Analysis
app.post("/api/gemini/analyze", async (req, res) => {
  try {
    const { projects, collaborators, allocations } = req.body;

    if (!projects || !Array.isArray(projects)) {
      res.status(400).json({ error: "Projetos inválidos ou ausentes na requisição." });
      return;
    }

    // LGPD Compliance: Anonymize collaborator names, emails, and sensitive identifiers
    const colabNameMap: { [id: string]: string } = {};
    let colabCounter = 1;

    const anonymizedCollaborators = (collaborators || []).map((c: any) => {
      if (!c) return c;
      if (!colabNameMap[c.id]) {
        colabNameMap[c.id] = `Colaborador ${colabCounter++} (${c.papel || "Sem Função"})`;
      }
      return {
        id: c.id,
        papel: c.papel,
        custoHora: c.custoHora,
        nomeAnonimizado: colabNameMap[c.id]
      };
    });

    const anonymizedAllocations = (allocations || []).map((a: any) => {
      if (!a) return a;
      const anonName = colabNameMap[a.colaboradorId] || `Colaborador Anonimizado (${a.colaboradorPapel || "Sem Função"})`;
      return {
        id: a.id,
        colaboradorId: a.colaboradorId,
        colaboradorPapel: a.colaboradorPapel,
        projectId: a.projectId,
        projectNome: a.projectNome,
        percentualDedication: a.percentualDedication,
        colaboradorNomeAnonimizado: anonName
      };
    });

    // Anonymize project manager emails and other personal references
    const anonymizedProjects = (projects || []).map((p: any) => {
      if (!p) return p;
      return {
        id: p.id,
        nome: p.nome,
        dataInicio: p.dataInicio,
        dataFim: p.dataFim,
        estagio: p.estagio,
        progressoManualPercentage: p.progressoManualPercentage,
        progressoEsperadoPercentage: p.progressoEsperadoPercentage,
        ciclosFinancesAgile: p.ciclosFinancesAgile,
        marcosMilestones: p.marcosMilestones,
        squadId: p.squadId,
        squadNome: p.squadNome,
        gpEmail: "gp@empresa.com.br" // Anonymized/generic email
      };
    });

    const ai = getGemini();

    const prompt = `
Você é um Engenheiro de Software Full Stack Sênior, Gerente de Projetos Certificado (PMP) e Arquiteto de Soluções atuando como Auditor Executivo de Projetos.
Por favor, faça uma análise crítica detalhada e completa da gestão geral dos projetos para auxiliar o gestor do portfólio.
Sua análise deve trazer insights estratégicos valiosos, diagnósticos de anomalias/gargalos e sugestões de mitigação práticas de gestão de projetos.

DADOS DE PORTFÓLIO ANONIMIZADOS (CONFORME LGPD):
- Projetos ativos: ${JSON.stringify(anonymizedProjects, null, 2)}
- Banco de Talentos (Funções/Custos): ${JSON.stringify(anonymizedCollaborators, null, 2)}
- Matriz de Alocação (Dedicação): ${JSON.stringify(anonymizedAllocations, null, 2)}

ATENÇÃO CRÍTICA (NÃO ADICIONE CABEÇALHOS REDUNDANTES):
Não inclua nenhum cabeçalho formal, tais como:
- "# Relatório de Auditoria Executiva de Portfólio"
- "**Destinatário:** Diretoria Executiva"
- "**Emitido por:** Engenheiro de Software Principal, Arquiteto de Soluções & Diretor de Projetos (PMP)"
- "**Data de Referência:** Maio de 2026"
Inicie o seu relatório DIRETAMENTE com o primeiro tópico útil de análise (por exemplo, "Análise do Portfólio de Projetos" ou "Sumário de Gestão").

DIRETRIZES DO RELATÓRIO (Responda em formato Markdown bem estruturado, focado em insights e sugestões):
1. **Análise de Progresso e Saúde (RAG):** Diagnóstico da evolução física dos projetos. Avalie as disparidades de progresso esperado vs realizável. Indique gargalos de cronograma gerais sem comprometer identidades.
2. **Saúde Financeira e Orçamento:** Avalie o CPI global e de cada iniciativa aplicável, fornecendo insights sobre custos previstos versus custos consumidos.
3. **Logística e Capacidade do Squad:** Análise se há gargalos operacionais ou sobrecarga de alocação de squads (colaboradores acumulando mais de 100% de dedicação). Refira-se a eles usando suas representações anônimas (ex: "Colaborador 1 (Dev React)").
4. **Métricas de Qualidade de Engenharia:** Avalie as taxas de bugs por ciclo, indicadores de previsibilidade ágil e as melhores práticas que precisam ser reforçadas.
5. **Insights e Sugestões Práticas de Mitigação:** Sugira táticas concretas baseadas nas melhores práticas de gerenciamento de portfólios (renegociação de prazo, buffer de contingência, redistribuição de alocações, etc.) para reverter atrasos e riscos detectados.

Escreva o relatório em linguagem corporativa fluida, rica em insights estratégicos e altamente prática para tomada de decisões.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    let cleanedText = response.text || "";

    // Regular Expression sanitization fallback to remove any formal headers if the model accidentally produces them
    cleanedText = cleanedText
      .replace(/#\s*Relatório de Auditoria Executiva de Portfólio\s*/gi, "")
      .replace(/\*\*Destinatário:\*\*\s*[^\n]*\n?/gi, "")
      .replace(/\*\*Emitido por:\*\*\s*[^\n]*\n?/gi, "")
      .replace(/\*\*Data de Referência:\*\*\s*[^\n]*\n?/gi, "")
      .trim();

    res.json({ analysis: cleanedText });
  } catch (error: any) {
    console.error("Erro na análise do Gemini:", error);
    res.status(500).json({ 
      error: error.message || "Erro desconhecido durante a análise do portfólio com o Gemini AI. Verifique se a chave GEMINI_API_KEY está configurada corretamente."
    });
  }
});

// Configure Vite integration for dev vs prod environments
async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`KIA Project Suite server running on http://localhost:${PORT}`);
  });
}

bootstrap();
