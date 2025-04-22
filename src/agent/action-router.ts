// Roteador de ações para direcionar intenções aos manipuladores corretos
import { ContextManager } from "./context-manager.js";
import { ChatHandler } from "./handlers/chat-handler.js";
import { CodeHandler } from "./handlers/code-handler.js";
import { FileHandler } from "./handlers/file-handler.js";
import { GitHubHandler } from "./handlers/github-handler.js";
import { TaskHandler } from "./handlers/task-handler.js";
import { Intent } from "./intent-processor.js";

/**
 * Classe responsável por rotear intenções para os manipuladores apropriados
 */
export class ActionRouter {
  private contextManager: ContextManager;
  private taskHandler: TaskHandler;
  private githubHandler: GitHubHandler;
  private fileHandler: FileHandler;
  private codeHandler: CodeHandler;
  private chatHandler: ChatHandler;

  constructor(contextManager: ContextManager) {
    this.contextManager = contextManager;

    // Inicializar os manipuladores
    this.taskHandler = new TaskHandler(contextManager);
    this.githubHandler = new GitHubHandler(contextManager);
    this.fileHandler = new FileHandler(contextManager);
    this.codeHandler = new CodeHandler(contextManager);
    this.chatHandler = new ChatHandler(contextManager);
  }

  /**
   * Roteia uma intenção para o manipulador correto
   * @param intent Intenção a ser processada
   * @returns Resposta do manipulador
   */
  async route(intent: Intent): Promise<string> {
    try {
      let response: string;

      // Rotear para o manipulador correto com base no tipo de intenção
      switch (intent.type) {
        case "task":
          response = await this.taskHandler.handle(intent);
          break;

        case "github":
          response = await this.githubHandler.handle(intent);
          break;

        case "file":
          response = await this.fileHandler.handle(intent);
          break;

        case "code":
          response = await this.codeHandler.handle(intent);
          break;

        case "chat":
        default:
          response = await this.chatHandler.handle(intent);
          break;
      }

      // Atualizar o estado do contexto
      this.contextManager.updateState(intent);

      // Adicionar interação ao histórico
      this.contextManager.addInteraction(intent.originalMessage, intent, response);

      return response;
    } catch (error: any) {
      console.error(`Erro ao processar intenção ${intent.type}:${intent.action}:`, error);
      return `Desculpe, ocorreu um erro ao processar sua solicitação: ${error.message}`;
    }
  }
}
