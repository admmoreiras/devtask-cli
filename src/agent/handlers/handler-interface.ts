// Interface para os manipuladores de intenção
import { ContextManager } from "../context-manager.js";
import { Intent } from "../intent-processor.js";

/**
 * Interface base para todos os manipuladores de intenção
 */
export interface Handler {
  /**
   * Processa uma intenção
   * @param intent Intenção a ser processada
   * @returns Resposta do manipulador
   */
  handle(intent: Intent): Promise<string>;
}

/**
 * Classe base abstrata para manipuladores
 */
export abstract class BaseHandler implements Handler {
  protected contextManager: ContextManager;

  constructor(contextManager: ContextManager) {
    this.contextManager = contextManager;
  }

  /**
   * Método abstrato para processar uma intenção
   * @param intent Intenção a ser processada
   */
  abstract handle(intent: Intent): Promise<string>;

  /**
   * Verifica se uma ação é suportada por este manipulador
   * @param action Ação a ser verificada
   * @param supportedActions Lista de ações suportadas
   * @returns true se a ação for suportada
   */
  protected isActionSupported(action: string, supportedActions: string[]): boolean {
    return supportedActions.includes(action);
  }

  /**
   * Gera uma resposta de erro para ações não suportadas
   * @param intent Intenção processada
   * @returns Mensagem de erro
   */
  protected getUnsupportedActionResponse(intent: Intent): string {
    // Criar uma resposta mais amigável e natural
    const acoesSuportadas = this.getSupportedActionsForType(intent.type);

    if (acoesSuportadas.length > 0) {
      return `Ainda não sei como ${intent.action} ${this.getEntityNameForType(
        intent.type
      )}. Posso te ajudar com outras ações como: ${acoesSuportadas.join(", ")}.`;
    }

    return `Ainda não sei como te ajudar com isso. Tente perguntar sobre tarefas, arquivos, código ou outras funcionalidades do projeto.`;
  }

  /**
   * Obtém o nome da entidade para um tipo de intenção
   */
  private getEntityNameForType(type: string): string {
    switch (type) {
      case "task":
        return "tarefas";
      case "github":
        return "repositórios no GitHub";
      case "file":
        return "arquivos";
      case "code":
        return "código";
      default:
        return "isso";
    }
  }

  /**
   * Obtém uma lista de ações suportadas para um tipo de intenção em linguagem natural
   */
  private getSupportedActionsForType(type: string): string[] {
    switch (type) {
      case "task":
        return ["criar tarefas", "listar tarefas", "atualizar tarefas"];
      case "github":
        return ["sincronizar com GitHub", "ver informações do GitHub"];
      case "file":
        return ["listar arquivos", "ler um arquivo", "visualizar a estrutura do projeto"];
      case "code":
        return ["gerar código", "explicar código", "executar código"];
      default:
        return [];
    }
  }
}
