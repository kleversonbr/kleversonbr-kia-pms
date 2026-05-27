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

    const ai = getGemini();

    const prompt = `
Você é um Engenheiro de Software Full Stack Sênior, Gerente de Projetos Certificado (PMP) e Arquiteto de Soluções atuando como Auditor Executivo.
Por favor, faça uma análise crítica e inteligente do seguinte portfólio de projetos para a diretoria. 
O seu relatório deve ser profissional, direto ao ponto, em português brasileiro (PT-BR), focado na saúde financeira, prazos (faróis de alerta RAG), alocação de recursos (over-allocation) e qualidade técnica.

DADOS DE ENTRADA:
- Projetos cadastrados: ${JSON.stringify(projects, null, 2)}
- Banco de Talentos (Recursos): ${JSON.stringify(collaborators || [], null, 2)}
- Matriz de Alocação de Recursos: ${JSON.stringify(allocations || [], null, 2)}

DIRETRIZES DE RETORNO (Responda em formato Markdown estruturado):
1. **Sumário Executivo (Executive Overview):** Um resumo de alto impacto sobre a saúde geral do portfólio. Avalie o CPI global e diga se estamos estourando o orçamento geral ou entregando com lucro.
2. **Prazos e Alertas (RAG Analysis):** Diagnóstico rápido dos projetos em Vermelho (🔴) ou Amarelo (🟡), explicando os possíveis motivos com base nos dados fornecidos e estimando o desvio em relação ao tempo teoricamente decorrido.
3. **Eficiência e Alocação:** Comente sobre a alocação do time (se há sobrecarga com colaboradores acima de 100% de dedicação). Cite nomes.
4. **Métricas Ágeis & Qualidade:** Avalie tendências de bugs, se a previsibilidade das sprints está boa (entregues/planejados) e se a densidade de defeitos está aceitável.
5. **Recomendações Práticas (Plano de Ação):** 3 ou 4 ações imediatas e práticas de mitigação de riscos que o gerente de projetos deve tomar para reverter desvios de custo ou cronograma.

Escreva o relatório em linguagem corporativa elegante, sóbria e pragmática, sem enfeites desnecessários.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    res.json({ analysis: response.text });
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
