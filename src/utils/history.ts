import fs from "fs-extra";
import os from "os";
import path from "path";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatSession {
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

interface ChatHistory {
  sessions: ChatSession[];
}

// Diretório padrão para histórico
const HISTORY_DIR = path.join(os.homedir(), ".devtask-cli");
const HISTORY_FILE = path.join(HISTORY_DIR, "history.json");

// Número máximo de sessões a manter no histórico
const MAX_SESSIONS = 10;

/**
 * Inicializa o sistema de histórico
 */
async function initHistory(): Promise<void> {
  try {
    await fs.ensureDir(HISTORY_DIR);

    // Criar arquivo de histórico se não existir
    if (!(await fs.pathExists(HISTORY_FILE))) {
      await fs.writeJSON(
        HISTORY_FILE,
        {
          sessions: [],
        },
        { spaces: 2 }
      );
    }
  } catch (error) {
    console.error("Erro ao inicializar histórico:", error);
  }
}

/**
 * Obtém o histórico de conversas
 * @returns Histórico de conversas
 */
export async function getHistory(): Promise<ChatHistory> {
  await initHistory();

  try {
    return await fs.readJSON(HISTORY_FILE);
  } catch (error) {
    console.error("Erro ao ler histórico:", error);
    return { sessions: [] };
  }
}

/**
 * Salva uma sessão no histórico
 * @param session Sessão a ser salva
 */
export async function saveToHistory(session: ChatSession): Promise<void> {
  await initHistory();

  try {
    // Ler histórico existente
    const history = await getHistory();

    // Verificar se a sessão já existe (comparando createdAt)
    const existingIndex = history.sessions.findIndex((s) => s.createdAt === session.createdAt);

    if (existingIndex >= 0) {
      // Atualizar sessão existente
      history.sessions[existingIndex] = session;
    } else {
      // Adicionar nova sessão
      history.sessions.push(session);

      // Manter apenas MAX_SESSIONS mais recentes
      if (history.sessions.length > MAX_SESSIONS) {
        history.sessions = history.sessions
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .slice(0, MAX_SESSIONS);
      }
    }

    // Salvar histórico atualizado
    await fs.writeJSON(HISTORY_FILE, history, { spaces: 2 });
  } catch (error) {
    console.error("Erro ao salvar histórico:", error);
  }
}

/**
 * Limpa todo o histórico de conversas
 */
export async function clearHistory(): Promise<void> {
  await initHistory();

  try {
    await fs.writeJSON(
      HISTORY_FILE,
      {
        sessions: [],
      },
      { spaces: 2 }
    );
    console.log("Histórico limpo com sucesso!");
  } catch (error) {
    console.error("Erro ao limpar histórico:", error);
  }
}
