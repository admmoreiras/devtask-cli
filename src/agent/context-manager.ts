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

// Histórico de referências para manter rastreamento de objetos citados
interface ReferenceHistory {
  files: {
    path: string;
    lastAccessed: Date;
    operation: string;
  }[];
  directories: {
    path: string;
    lastAccessed: Date;
  }[];
  tasks: {
    id: string;
    lastAccessed: Date;
  }[];
}

/**
 * Classe responsável por gerenciar o contexto da conversa
 */
export class ContextManager {
  private messages: Message[] = [];
  private interactions: Interaction[] = [];
  private currentState: Record<string, any> = {};
  private referenceHistory: ReferenceHistory = {
    files: [],
    directories: [],
    tasks: [],
  };

  // Número máximo de mensagens a manter no contexto
  private maxContextMessages = 12; // Aumentado para dar mais contexto

  /**
   * Inicializa o contexto com mensagem do sistema
   */
  initialize(): void {
    this.messages = [
      {
        role: "system",
        content:
          "Você é um assistente de desenvolvimento amigável integrado ao DevTask CLI. " +
          "Você deve interpretar comandos em linguagem natural e convertê-los em ações no sistema. " +
          "Você pode entender e responder a pedidos mesmo quando expressos em linguagem coloquial. " +
          "\n\n" +
          "Suas capacidades incluem:\n" +
          "- Gerenciar tarefas: criar, listar, atualizar ou excluir tarefas\n" +
          "- Trabalhar com GitHub: sincronizar tarefas com issues do GitHub\n" +
          "- Explorar arquivos: navegar, ler e modificar arquivos do projeto\n" +
          "- Gerar e modificar código: ajudar a escrever ou explicar código\n" +
          "\n" +
          "Exemplos de como os usuários podem te pedir coisas:\n" +
          "- 'Quero ver minhas tarefas' = listar tarefas\n" +
          "- 'Mostra o que tem na pasta src' = listar arquivos em src\n" +
          "- 'Cria uma tarefa para implementar autenticação' = criar nova tarefa\n" +
          "- 'O que tem no arquivo index.ts?' = ler conteúdo do arquivo\n" +
          "- 'Explique esse código' = explicar o último arquivo mostrado\n" +
          "- 'Modifique este arquivo' = modificar o último arquivo acessado\n" +
          "\n" +
          "MUITO IMPORTANTE: Você DEVE manter o contexto da conversa. Se um usuário pedir para:\n" +
          "1. 'Ler arquivo X' e depois\n" +
          "2. 'Explicar este código' ou 'explicar o código' ou apenas 'explique'\n" +
          "Você deve entender que o usuário está se referindo ao arquivo X que foi mostrado anteriormente.\n" +
          "\n" +
          "Sempre interprete o que o usuário quer, mesmo quando as instruções forem ambíguas, " +
          "e SEMPRE use o contexto da conversa para dar continuidade às interações.",
      },
    ];

    this.currentState = {
      currentDirectory: ".",
      currentFile: null,
      currentTask: null,
      lastOperation: null,
      pendingChanges: false,
      lastReference: null,
    };

    this.referenceHistory = {
      files: [],
      directories: [],
      tasks: [],
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

    // Analisar a resposta para extrair referências a arquivos
    this.extractReferencesFromResponse(content);
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
   * Atualiza o estado atual com base na intenção processada
   * @param intent Intenção processada
   */
  updateState(intent: Intent): void {
    // Atualizar último tipo de operação
    this.currentState.lastOperation = intent.type;
    this.currentState.lastAction = intent.action;

    // Atualizar informações específicas com base no tipo de intenção
    switch (intent.type) {
      case "file":
        if (intent.action === "list" && intent.parameters.path) {
          this.currentState.currentDirectory = intent.parameters.path;
          this.addDirectoryReference(intent.parameters.path);
        } else if (intent.action === "read" && intent.parameters.path) {
          this.currentState.currentFile = intent.parameters.path;
          this.currentState.lastReference = {
            type: "file",
            path: intent.parameters.path,
            operation: "read",
          };
          this.addFileReference(intent.parameters.path, "read");
        } else if (intent.action === "modify" && intent.parameters.path) {
          this.currentState.currentFile = intent.parameters.path;
          this.currentState.lastReference = {
            type: "file",
            path: intent.parameters.path,
            operation: "modify",
          };
          this.addFileReference(intent.parameters.path, "modify");
          this.currentState.pendingChanges = true;
        } else if (intent.action === "create" && intent.parameters.path) {
          this.currentState.lastReference = {
            type: "file",
            path: intent.parameters.path,
            operation: "create",
          };
          this.addFileReference(intent.parameters.path, "create");
          this.currentState.pendingChanges = true;
        } else if (intent.action === "delete" && intent.parameters.path) {
          this.addFileReference(intent.parameters.path, "delete");
          this.currentState.pendingChanges = true;
        } else if (intent.action === "structure" && intent.parameters.path) {
          this.currentState.currentDirectory = intent.parameters.path;
          this.addDirectoryReference(intent.parameters.path);
        } else if (intent.action === "apply") {
          this.currentState.pendingChanges = false;
        } else if (intent.action === "cancel") {
          this.currentState.pendingChanges = false;
        }
        break;

      case "task":
        if (intent.action === "list") {
          this.currentState.lastOperation = "task_list";
        } else if (intent.action === "create") {
          this.currentState.lastOperation = "task_create";
        } else if (intent.action === "select" && intent.parameters.taskId) {
          this.currentState.currentTask = intent.parameters.taskId;
          this.addTaskReference(intent.parameters.taskId);
        }
        break;

      case "code":
        if (intent.action === "explain") {
          // Se o parâmetro path foi fornecido, atualize o arquivo atual
          if (intent.parameters.path) {
            this.currentState.currentFile = intent.parameters.path;
            this.addFileReference(intent.parameters.path, "explain");
          }
          // Se não, a explicação provavelmente se refere ao último arquivo lido
        }
        break;

      // Adicionar outras atualizações de estado conforme necessário
    }
  }

  /**
   * Adiciona uma referência a um arquivo no histórico
   * @param path Caminho do arquivo
   * @param operation Operação realizada (read, modify, create, delete)
   */
  private addFileReference(path: string, operation: string): void {
    const now = new Date();

    // Verificar se o arquivo já existe no histórico
    const existingIndex = this.referenceHistory.files.findIndex((f) => f.path === path);

    if (existingIndex >= 0) {
      // Atualizar o arquivo existente
      this.referenceHistory.files[existingIndex] = {
        path,
        lastAccessed: now,
        operation,
      };

      // Mover para o topo (mais recente)
      const existingRef = this.referenceHistory.files.splice(existingIndex, 1)[0];
      this.referenceHistory.files.unshift(existingRef);
    } else {
      // Adicionar nova referência
      this.referenceHistory.files.unshift({
        path,
        lastAccessed: now,
        operation,
      });

      // Limitar o tamanho do histórico
      if (this.referenceHistory.files.length > 10) {
        this.referenceHistory.files.pop();
      }
    }
  }

  /**
   * Adiciona uma referência a um diretório no histórico
   * @param path Caminho do diretório
   */
  private addDirectoryReference(path: string): void {
    const now = new Date();

    // Verificar se o diretório já existe no histórico
    const existingIndex = this.referenceHistory.directories.findIndex((d) => d.path === path);

    if (existingIndex >= 0) {
      // Atualizar o diretório existente
      this.referenceHistory.directories[existingIndex].lastAccessed = now;

      // Mover para o topo (mais recente)
      const existingRef = this.referenceHistory.directories.splice(existingIndex, 1)[0];
      this.referenceHistory.directories.unshift(existingRef);
    } else {
      // Adicionar nova referência
      this.referenceHistory.directories.unshift({
        path,
        lastAccessed: now,
      });

      // Limitar o tamanho do histórico
      if (this.referenceHistory.directories.length > 10) {
        this.referenceHistory.directories.pop();
      }
    }
  }

  /**
   * Adiciona uma referência a uma tarefa no histórico
   * @param id ID da tarefa
   */
  private addTaskReference(id: string): void {
    const now = new Date();

    // Verificar se a tarefa já existe no histórico
    const existingIndex = this.referenceHistory.tasks.findIndex((t) => t.id === id);

    if (existingIndex >= 0) {
      // Atualizar a tarefa existente
      this.referenceHistory.tasks[existingIndex].lastAccessed = now;

      // Mover para o topo (mais recente)
      const existingRef = this.referenceHistory.tasks.splice(existingIndex, 1)[0];
      this.referenceHistory.tasks.unshift(existingRef);
    } else {
      // Adicionar nova referência
      this.referenceHistory.tasks.unshift({
        id,
        lastAccessed: now,
      });

      // Limitar o tamanho do histórico
      if (this.referenceHistory.tasks.length > 10) {
        this.referenceHistory.tasks.pop();
      }
    }
  }

  /**
   * Extrai referências a arquivos a partir de respostas do assistente
   * @param content Conteúdo da resposta
   */
  private extractReferencesFromResponse(content: string): void {
    // Padrão para detectar menções a arquivos na resposta
    const filePattern = /Conteúdo de "([^"]+)":/;
    const match = content.match(filePattern);

    if (match && match[1]) {
      const filePath = match[1];
      this.currentState.currentFile = filePath;
      this.currentState.lastReference = {
        type: "file",
        path: filePath,
        operation: "read",
      };
      this.addFileReference(filePath, "read");
    }

    // Padrão para detectar menções a diretórios
    const dirPattern = /Arquivos em "([^"]+)":/;
    const dirMatch = content.match(dirPattern);

    if (dirMatch && dirMatch[1]) {
      const dirPath = dirMatch[1];
      this.currentState.currentDirectory = dirPath;
      this.addDirectoryReference(dirPath);
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
   * Obtém o arquivo atual do contexto
   * @returns Caminho do arquivo atual ou null
   */
  getCurrentFile(): string | null {
    return this.currentState.currentFile;
  }

  /**
   * Obtém o diretório atual do contexto
   * @returns Caminho do diretório atual
   */
  getCurrentDirectory(): string {
    return this.currentState.currentDirectory;
  }

  /**
   * Obtém o arquivo mais recentemente acessado
   * @returns Caminho do arquivo mais recente ou null
   */
  getMostRecentFile(): string | null {
    if (this.referenceHistory.files.length > 0) {
      return this.referenceHistory.files[0].path;
    }
    return null;
  }

  /**
   * Obtém o diretório mais recentemente acessado
   * @returns Caminho do diretório mais recente ou "."
   */
  getMostRecentDirectory(): string {
    if (this.referenceHistory.directories.length > 0) {
      return this.referenceHistory.directories[0].path;
    }
    return ".";
  }

  /**
   * Obtém as referências de histórico
   * @returns As referências de arquivos, diretórios e tarefas
   */
  getReferenceHistory(): ReferenceHistory {
    return { ...this.referenceHistory };
  }

  /**
   * Fornece um resumo das capacidades do sistema em linguagem natural
   * @returns Uma string descrevendo as capacidades do sistema
   */
  getCapabilities(): string {
    return (
      "Posso te ajudar com:\n\n" +
      "🔹 Tarefas: criar, listar, atualizar ou excluir tarefas\n" +
      "🔹 GitHub: sincronizar tarefas com issues do GitHub\n" +
      "🔹 Arquivos: navegar, ler e modificar arquivos do projeto\n" +
      "🔹 Código: gerar código, explicar trechos ou executar comandos\n\n" +
      "Como posso te ajudar hoje?"
    );
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
