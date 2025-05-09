// Manipulador para operações relacionadas a arquivos
import { fileAgent } from "../../utils/file-agent.js";
import { getFileStructure, isPathSafe, listDirectory, readFile } from "../../utils/file-explorer.js";
import { Intent } from "../intent-processor.js";
import { BaseHandler } from "./handler-interface.js";

/**
 * Manipulador para intenções relacionadas a arquivos
 */
export class FileHandler extends BaseHandler {
  // Ações suportadas por este manipulador
  private supportedActions = [
    "list", // Listar arquivos em um diretório
    "read", // Ler conteúdo de um arquivo
    "structure", // Mostrar estrutura de diretórios
    "create", // Propor criação de arquivo
    "modify", // Propor modificação de arquivo
    "delete", // Propor exclusão de arquivo
    "apply", // Aplicar alterações propostas
    "cancel", // Cancelar alterações propostas
    "changes", // Mostrar alterações pendentes
  ];

  /**
   * Processa uma intenção relacionada a arquivos
   * @param intent Intenção a ser processada
   * @returns Resposta do manipulador
   */
  async handle(intent: Intent): Promise<string> {
    // Verificar se a ação é suportada
    if (!this.isActionSupported(intent.action, this.supportedActions)) {
      return this.getUnsupportedActionResponse(intent);
    }

    // Processar a ação
    try {
      switch (intent.action) {
        case "list":
          return await this.handleList(intent);

        case "read":
          return await this.handleRead(intent);

        case "structure":
          return await this.handleStructure(intent);

        case "create":
          return await this.handleCreate(intent);

        case "modify":
          return await this.handleModify(intent);

        case "delete":
          return await this.handleDelete(intent);

        case "apply":
          return await this.handleApply();

        case "cancel":
          return await this.handleCancel();

        case "changes":
          return await this.handleShowChanges();

        default:
          return `Operação de arquivo não implementada: ${intent.action}`;
      }
    } catch (error: any) {
      return `Erro ao processar operação de arquivo: ${error.message}`;
    }
  }

  /**
   * Processa a ação de listar arquivos
   */
  private async handleList(intent: Intent): Promise<string> {
    const path = intent.parameters.path || this.contextManager.getState().currentDirectory || ".";

    if (!isPathSafe(path)) {
      return `⚠️ Acesso negado. O caminho "${path}" contém diretórios ou arquivos sensíveis.`;
    }

    try {
      const files = await listDirectory(path);

      // Atualizar o estado com o diretório atual
      this.contextManager.updateState({
        type: "file",
        action: "list",
        parameters: { path },
        originalMessage: "",
      });

      if (files.length === 0) {
        return `O diretório "${path}" está vazio.`;
      }

      // Formatar a lista de arquivos
      const fileList = files
        .map((file) => {
          const type = file.isDirectory ? "📁" : "📄";
          return `${type} ${file.name}`;
        })
        .join("\n");

      return `Arquivos em "${path}":\n\n${fileList}`;
    } catch (error: any) {
      if (error.message.includes("ENOENT")) {
        return `O diretório "${path}" não existe. Por favor, verifique se o caminho está correto.`;
      }
      return `Erro ao listar diretório "${path}": ${error.message}`;
    }
  }

  /**
   * Processa a ação de ler um arquivo
   */
  private async handleRead(intent: Intent): Promise<string> {
    const filePath = intent.parameters.path;

    if (!filePath) {
      // Verificar o estado para ver se temos um arquivo atual
      const currentFile = this.contextManager.getState().currentFile;
      if (currentFile) {
        return await this.readFileWithPath(currentFile);
      } else {
        return "Por favor, especifique o caminho do arquivo que deseja ler. Exemplo: 'ler src/index.ts'";
      }
    }

    return await this.readFileWithPath(filePath);
  }

  /**
   * Método auxiliar para ler um arquivo com o caminho fornecido
   */
  private async readFileWithPath(filePath: string): Promise<string> {
    if (!isPathSafe(filePath)) {
      return `⚠️ Acesso negado. O arquivo "${filePath}" é sensível ou está fora do projeto.`;
    }

    try {
      const content = await readFile(filePath);

      if (content === null) {
        return `Não consegui encontrar ou ler o arquivo "${filePath}". Por favor, verifique se o caminho está correto.`;
      }

      // Atualizar o estado com o arquivo atual
      this.contextManager.updateState({
        type: "file",
        action: "read",
        parameters: { path: filePath },
        originalMessage: "",
      });

      return `Conteúdo de "${filePath}":\n\n\`\`\`\n${content}\n\`\`\``;
    } catch (error: any) {
      return `Não foi possível ler o arquivo "${filePath}": ${error.message}`;
    }
  }

  /**
   * Processa a ação de mostrar a estrutura de diretórios
   */
  private async handleStructure(intent: Intent): Promise<string> {
    const path = intent.parameters.path || this.contextManager.getCurrentDirectory() || ".";
    const depth = intent.parameters.depth || 3;

    if (!isPathSafe(path)) {
      return `⚠️ Acesso negado. O caminho "${path}" contém diretórios ou arquivos sensíveis.`;
    }

    try {
      const structure = await getFileStructure(path, depth);

      // Atualizar o estado com o diretório atual
      this.contextManager.updateState({
        type: "file",
        action: "structure",
        parameters: { path },
        originalMessage: "",
      });

      return `Estrutura de diretórios para "${path}":\n\n\`\`\`\n${structure}\n\`\`\``;
    } catch (error: any) {
      if (error.message.includes("ENOENT")) {
        return `O diretório "${path}" não existe. Por favor, verifique se o caminho está correto.`;
      }
      return `Erro ao obter estrutura de diretórios: ${error.message}`;
    }
  }

  /**
   * Processa a ação de propor a criação de um arquivo
   */
  private async handleCreate(intent: Intent): Promise<string> {
    // Verificar se há alterações pendentes
    if (fileAgent.hasPendingChanges()) {
      return `⚠️ Já existem alterações pendentes. Use "aplicar alterações" para aplicá-las ou "cancelar alterações" para cancelá-las antes de propor novas alterações.`;
    }

    const filePath = intent.parameters.path;
    const content = intent.parameters.content;

    if (!filePath) {
      return "Por favor, especifique o caminho do arquivo que deseja criar.";
    }

    if (!content) {
      return "Por favor, forneça o conteúdo do arquivo que deseja criar.";
    }

    if (!isPathSafe(filePath)) {
      return `⚠️ Acesso negado. O caminho "${filePath}" contém diretórios ou arquivos sensíveis.`;
    }

    try {
      const success = await fileAgent.proposeCreate(filePath, content);

      if (success) {
        return `✅ Criação do arquivo "${filePath}" proposta com sucesso.\n\nPara ver as alterações pendentes, digite "mostrar alterações pendentes".\nPara aplicar as alterações, digite "aplicar alterações".\nPara cancelar, digite "cancelar alterações".`;
      } else {
        return `❌ Não foi possível propor a criação do arquivo "${filePath}".`;
      }
    } catch (error: any) {
      return `Erro ao propor criação de arquivo: ${error.message}`;
    }
  }

  /**
   * Processa a ação de propor a modificação de um arquivo
   */
  private async handleModify(intent: Intent): Promise<string> {
    // Verificar se há alterações pendentes
    if (fileAgent.hasPendingChanges()) {
      return `⚠️ Já existem alterações pendentes. Use "aplicar alterações" para aplicá-las ou "cancelar alterações" para cancelá-las antes de propor novas alterações.`;
    }

    const filePath = intent.parameters.path;
    const content = intent.parameters.content;

    if (!filePath) {
      // Verificar se temos um arquivo atual no contexto
      const currentFile = this.contextManager.getState().currentFile;
      if (currentFile) {
        if (!content) {
          return `Para modificar o arquivo "${currentFile}", preciso que você forneça o novo conteúdo. Por favor, digite o conteúdo completo que deseja usar.`;
        }
        return await this.modifyFileWithPath(currentFile, content);
      } else {
        return "Por favor, especifique o caminho do arquivo que deseja modificar.";
      }
    }

    if (!content) {
      return `Para modificar o arquivo "${filePath}", preciso que você forneça o novo conteúdo. Por favor, digite o conteúdo completo que deseja usar.`;
    }

    return await this.modifyFileWithPath(filePath, content);
  }

  /**
   * Método auxiliar para modificar um arquivo com o caminho e conteúdo fornecidos
   */
  private async modifyFileWithPath(filePath: string, content: string): Promise<string> {
    if (!isPathSafe(filePath)) {
      return `⚠️ Acesso negado. O caminho "${filePath}" contém diretórios ou arquivos sensíveis.`;
    }

    try {
      const success = await fileAgent.proposeModify(filePath, content);

      if (success) {
        return `✅ Propus a modificação do arquivo "${filePath}".\n\nPara ver como ficará a alteração, digite "mostrar alterações".\nPara aplicar, digite "aplicar alterações".\nPara cancelar, digite "cancelar alterações".`;
      } else {
        return `❌ Não foi possível propor a modificação do arquivo "${filePath}". O arquivo pode não existir ou não ser acessível.`;
      }
    } catch (error: any) {
      return `Erro ao propor modificação de arquivo: ${error.message}`;
    }
  }

  /**
   * Processa a ação de propor a exclusão de um arquivo
   */
  private async handleDelete(intent: Intent): Promise<string> {
    // Verificar se há alterações pendentes
    if (fileAgent.hasPendingChanges()) {
      return `⚠️ Já existem alterações pendentes. Use "aplicar alterações" para aplicá-las ou "cancelar alterações" para cancelá-las antes de propor novas alterações.`;
    }

    const filePath = intent.parameters.path;

    if (!filePath) {
      return "Por favor, especifique o caminho do arquivo que deseja excluir.";
    }

    if (!isPathSafe(filePath)) {
      return `⚠️ Acesso negado. O caminho "${filePath}" contém diretórios ou arquivos sensíveis.`;
    }

    try {
      const success = await fileAgent.proposeDelete(filePath);

      if (success) {
        return `✅ Exclusão do arquivo "${filePath}" proposta com sucesso.\n\nPara ver as alterações pendentes, digite "mostrar alterações pendentes".\nPara aplicar as alterações, digite "aplicar alterações".\nPara cancelar, digite "cancelar alterações".`;
      } else {
        return `❌ Não foi possível propor a exclusão do arquivo "${filePath}".`;
      }
    } catch (error: any) {
      return `Erro ao propor exclusão de arquivo: ${error.message}`;
    }
  }

  /**
   * Processa a ação de aplicar alterações pendentes
   */
  private async handleApply(): Promise<string> {
    try {
      const result = await fileAgent.applyChanges();
      return result.message;
    } catch (error: any) {
      return `Erro ao aplicar alterações: ${error.message}`;
    }
  }

  /**
   * Processa a ação de cancelar alterações pendentes
   */
  private async handleCancel(): Promise<string> {
    try {
      if (!fileAgent.hasPendingChanges()) {
        return `Não há alterações pendentes para cancelar.`;
      }

      fileAgent.clearPendingChanges();
      return `✅ Todas as alterações pendentes foram canceladas.`;
    } catch (error: any) {
      return `Erro ao cancelar alterações: ${error.message}`;
    }
  }

  /**
   * Processa a ação de mostrar alterações pendentes
   */
  private async handleShowChanges(): Promise<string> {
    try {
      // Remove cores ANSI do texto retornado pelo fileAgent
      const changes = await fileAgent.showPendingChanges();
      const cleanChanges = changes.replace(/\u001b\[\d+m/g, "");
      return cleanChanges;
    } catch (error: any) {
      return `Erro ao mostrar alterações pendentes: ${error.message}`;
    }
  }
}
