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
    return `Desculpe, a ação "${intent.action}" não é suportada para intenções do tipo "${intent.type}".`;
  }
}
