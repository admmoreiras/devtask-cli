// Gerenciador de contexto para manter o estado da conversa
import { Intent } from "./intent-processor.js";

// Tipo para os papéis das mensagens
type MessageRole = "system" | "user" | "assistant";

// Interface para representar uma mensagem
export interface Message {
  role: MessageRole;
  content: string;
}

// Interface para representar uma interação completa
interface Interaction {
  message: string;
  intent?: Intent;
  response: string;
  timestamp: Date;
}

/**
 * Classe responsável por gerenciar o contexto da conversa
 */
export class ContextManager {
  private messages: Message[] = [];
  private interactions: Interaction[] = [];
  private currentState: Record<string, any> = {};

  // Número máximo de mensagens a manter no contexto
  private maxContextMessages = 10;

  /**
   * Inicializa o contexto com mensagem do sistema
   */
  initialize(): void {
    this.messages = [
      {
        role: "system",
        content:
          "Você é um assistente de desenvolvimento integrado ao DevTask CLI. " +
          "Você pode ajudar com gerenciamento de tarefas, integração com GitHub, " +
          "exploração e modificação de arquivos, e geração de código. " +
          "Tente entender as solicitações em linguagem natural e ser útil mesmo " +
          "quando as instruções não são totalmente claras.",
      },
    ];

    this.currentState = {
      currentDirectory: ".",
      currentFile: null,
      currentTask: null,
      lastOperation: null,
      pendingChanges: false,
    };
  }

  /**
   * Adiciona uma mensagem do usuário ao contexto
   * @param content Conteúdo da mensagem
   */
  addUserMessage(content: string): void {
    this.messages.push({ role: "user", content });
    this.trimContext();
  }

  /**
   * Adiciona uma mensagem do assistente ao contexto
   * @param content Conteúdo da mensagem
   */
  addAssistantMessage(content: string): void {
    this.messages.push({ role: "assistant", content });
    this.trimContext();
  }

  /**
   * Adiciona um registro de interação completa
   * @param message Mensagem original do usuário
   * @param intent Intenção detectada
   * @param response Resposta gerada
   */
  addInteraction(message: string, intent: Intent, response: string): void {
    this.interactions.push({
      message,
      intent,
      response,
      timestamp: new Date(),
    });

    // Manter apenas as últimas 20 interações
    if (this.interactions.length > 20) {
      this.interactions.shift();
    }
  }

  /**
   * Obtém mensagens recentes para uso no processamento
   * @returns Array de mensagens recentes
   */
  getRecentMessages(): Message[] {
    return this.messages;
  }

  /**
   * Atualiza o estado atual com base na intenção e resultado
   * @param intent Intenção processada
   * @param result Resultado da operação
   */
  updateState(intent: Intent, result: any = null): void {
    // Atualizar último tipo de operação
    this.currentState.lastOperation = intent.type;

    // Atualizar informações específicas com base no tipo de intenção
    switch (intent.type) {
      case "file":
        if (intent.action === "list" && intent.parameters.path) {
          this.currentState.currentDirectory = intent.parameters.path;
        } else if (intent.action === "read" && intent.parameters.path) {
          this.currentState.currentFile = intent.parameters.path;
        } else if (["create", "modify", "delete"].includes(intent.action)) {
          this.currentState.pendingChanges = true;
        } else if (intent.action === "apply") {
          this.currentState.pendingChanges = false;
        }
        break;

      case "task":
        if (intent.action === "select" && intent.parameters.taskId) {
          this.currentState.currentTask = intent.parameters.taskId;
        }
        break;

      // Adicionar outras atualizações de estado conforme necessário
    }
  }

  /**
   * Obtém o estado atual
   * @returns O estado atual do contexto
   */
  getState(): Record<string, any> {
    return { ...this.currentState };
  }

  /**
   * Mantém o contexto dentro do limite de tamanho
   */
  private trimContext(): void {
    // Manter a mensagem do sistema e as últimas N mensagens
    if (this.messages.length > this.maxContextMessages + 1) {
      const systemMessage = this.messages[0];
      const recentMessages = this.messages.slice(-this.maxContextMessages);
      this.messages = [systemMessage, ...recentMessages];
    }
  }
}
