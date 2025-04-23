// Roteador de ações para direcionar intenções para os manipuladores corretos
import { ContextManager } from "./context-manager.js";
import { ChatHandler } from "./handlers/chat-handler.js";
import { CodeHandler } from "./handlers/code-handler.js";
import { FileHandler } from "./handlers/file-handler.js";
import { GitHubHandler } from "./handlers/github-handler.js";
import { TaskHandler } from "./handlers/task-handler.js";
import { Intent } from "./intent-processor.js";

// Tipo de interface para um manipulador de intenções
export interface IntentHandler {
  handle(intent: Intent): Promise<string>;
}

/**
 * Classe responsável por rotear intenções para o manipulador correto
 */
export class ActionRouter {
  private fileHandler: FileHandler;
  private chatHandler: ChatHandler;
  private taskHandler: TaskHandler;
  private githubHandler: GitHubHandler;
  private codeHandler: CodeHandler;

  /**
   * Construtor
   * @param contextManager Gerenciador de contexto compartilhado
   */
  constructor(private contextManager: ContextManager) {
    // Inicializar os manipuladores
    this.fileHandler = new FileHandler(contextManager);
    this.chatHandler = new ChatHandler(contextManager);
    this.taskHandler = new TaskHandler(contextManager);
    this.githubHandler = new GitHubHandler(contextManager);
    this.codeHandler = new CodeHandler(contextManager);
  }

  /**
   * Roteia uma intenção para o manipulador apropriado
   * @param intent Intenção a ser processada
   * @returns Resposta do manipulador
   */
  async route(intent: Intent): Promise<string> {
    // Atualizar o contexto com a interação atual
    try {
      switch (intent.type) {
        case "file":
          // Rotear para o manipulador de arquivos
          return await this.fileHandler.handle(intent);

        case "chat":
          // Rotear para o manipulador de chat
          return await this.chatHandler.handle(intent);

        case "task":
          // Rotear para o manipulador de tarefas
          return await this.taskHandler.handle(intent);

        case "github":
          // Rotear para o manipulador do GitHub
          return await this.githubHandler.handle(intent);

        case "code":
          // Rotear para o manipulador de código
          return await this.codeHandler.handle(intent);

        default:
          return `Tipo de intenção não suportado: ${intent.type}`;
      }
    } catch (error: any) {
      console.error(`Erro ao processar a intenção ${intent.type}:${intent.action}:`, error);
      return `Ocorreu um erro ao processar sua solicitação: ${error.message}`;
    } finally {
      // Adicionar a interação ao histórico após o processamento
      this.contextManager.addInteraction(intent.originalMessage, intent, "");
    }
  }
}
