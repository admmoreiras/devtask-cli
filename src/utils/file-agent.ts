import chalk from "chalk";
import fs from "fs-extra";
import { diff as createDiff } from "jest-diff";
import path from "path";
import { isPathSafe, readFile } from "./file-explorer.js";

/**
 * Interface para representar uma alteração proposta em um arquivo
 */
interface FilePatch {
  type: "create" | "modify" | "delete";
  path: string;
  content?: string;
  originalContent?: string;
}

/**
 * Gerenciador de alterações de arquivos
 */
class FileAgent {
  private pendingChanges: Map<string, FilePatch> = new Map();

  /**
   * Propõe a criação de um novo arquivo
   * @param filePath Caminho do arquivo a ser criado
   * @param content Conteúdo do arquivo
   * @returns true se a operação foi proposta com sucesso
   */
  async proposeCreate(filePath: string, content: string): Promise<boolean> {
    try {
      // Verificar se o caminho é seguro
      if (!isPathSafe(filePath)) {
        throw new Error(`Caminho não seguro: ${filePath}`);
      }

      // Normalizar o caminho
      const normalizedPath = path.normalize(filePath);
      const fullPath = path.isAbsolute(normalizedPath) ? normalizedPath : path.join(process.cwd(), normalizedPath);

      // Verificar se o arquivo já existe
      if (await fs.pathExists(fullPath)) {
        throw new Error(`Arquivo já existe: ${filePath}`);
      }

      // Verificar se o diretório pai existe
      const parentDir = path.dirname(fullPath);
      if (!(await fs.pathExists(parentDir))) {
        // Notificar que o diretório pai será criado
        console.log(chalk.yellow(`O diretório ${path.dirname(filePath)} não existe e será criado.`));
      }

      // Adicionar a alteração pendente
      this.pendingChanges.set(filePath, {
        type: "create",
        path: filePath,
        content: content,
      });

      return true;
    } catch (error: any) {
      console.error(chalk.red(`Erro ao propor criação de arquivo: ${error.message}`));
      return false;
    }
  }

  /**
   * Propõe a modificação de um arquivo existente
   * @param filePath Caminho do arquivo a ser modificado
   * @param newContent Novo conteúdo do arquivo
   * @returns true se a operação foi proposta com sucesso
   */
  async proposeModify(filePath: string, newContent: string): Promise<boolean> {
    try {
      // Verificar se o caminho é seguro
      if (!isPathSafe(filePath)) {
        throw new Error(`Caminho não seguro: ${filePath}`);
      }

      // Ler o conteúdo atual do arquivo
      const currentContent = await readFile(filePath);
      if (currentContent === null) {
        throw new Error(`Arquivo não encontrado: ${filePath}`);
      }

      // Se o conteúdo não mudou, não fazer nada
      if (currentContent === newContent) {
        console.log(chalk.yellow(`O conteúdo de ${filePath} não mudou. Nenhuma alteração necessária.`));
        return false;
      }

      // Adicionar a alteração pendente
      this.pendingChanges.set(filePath, {
        type: "modify",
        path: filePath,
        content: newContent,
        originalContent: currentContent,
      });

      return true;
    } catch (error: any) {
      console.error(chalk.red(`Erro ao propor modificação de arquivo: ${error.message}`));
      return false;
    }
  }

  /**
   * Propõe a exclusão de um arquivo existente
   * @param filePath Caminho do arquivo a ser excluído
   * @returns true se a operação foi proposta com sucesso
   */
  async proposeDelete(filePath: string): Promise<boolean> {
    try {
      // Verificar se o caminho é seguro
      if (!isPathSafe(filePath)) {
        throw new Error(`Caminho não seguro: ${filePath}`);
      }

      // Ler o conteúdo atual do arquivo
      const currentContent = await readFile(filePath);
      if (currentContent === null) {
        throw new Error(`Arquivo não encontrado: ${filePath}`);
      }

      // Adicionar a alteração pendente
      this.pendingChanges.set(filePath, {
        type: "delete",
        path: filePath,
        originalContent: currentContent,
      });

      return true;
    } catch (error: any) {
      console.error(chalk.red(`Erro ao propor exclusão de arquivo: ${error.message}`));
      return false;
    }
  }

  /**
   * Obtém a lista de alterações pendentes
   * @returns Array com as alterações pendentes
   */
  getPendingChanges(): FilePatch[] {
    return Array.from(this.pendingChanges.values());
  }

  /**
   * Verifica se existem alterações pendentes
   * @returns true se existirem alterações pendentes
   */
  hasPendingChanges(): boolean {
    return this.pendingChanges.size > 0;
  }

  /**
   * Limpa todas as alterações pendentes
   */
  clearPendingChanges(): void {
    this.pendingChanges.clear();
  }

  /**
   * Exibe as alterações pendentes
   */
  async showPendingChanges(): Promise<string> {
    if (!this.hasPendingChanges()) {
      return "Não há alterações pendentes.";
    }

    let output = chalk.bold.blue("\n📝 Alterações Pendentes:\n");

    for (const change of this.pendingChanges.values()) {
      switch (change.type) {
        case "create":
          output += chalk.green(`\n✨ CRIAR: ${change.path}\n`);
          output += chalk.gray("----------------------------------------\n");
          output += chalk.green(change.content || "");
          output += "\n" + chalk.gray("----------------------------------------\n");
          break;

        case "modify":
          output += chalk.yellow(`\n📝 MODIFICAR: ${change.path}\n`);
          output += chalk.gray("----------------------------------------\n");

          // Exibir diff
          if (change.originalContent && change.content) {
            const diff = createDiff(change.originalContent, change.content, {
              expand: false,
              contextLines: 3,
              aAnnotation: "Remover",
              bAnnotation: "Adicionar",
            });

            // Verificar se diff não é null antes de usá-lo
            if (diff !== null) {
              // Formatação simplificada do diff
              output += diff
                .split("\n")
                .filter((line) => !line.startsWith("- Expect") && !line.startsWith("+ Received"))
                .map((line) => {
                  if (line.startsWith("-")) return chalk.red(line);
                  if (line.startsWith("+")) return chalk.green(line);
                  return chalk.gray(line);
                })
                .join("\n");
            } else {
              // Caso o diff seja null, mostrar uma mensagem simples
              output += chalk.yellow("Não foi possível gerar o diff para visualizar as mudanças.\n");
              output += chalk.yellow("Conteúdo original:\n");
              output += chalk.red(change.originalContent);
              output += chalk.yellow("\n\nNovo conteúdo:\n");
              output += chalk.green(change.content);
            }
          }

          output += "\n" + chalk.gray("----------------------------------------\n");
          break;

        case "delete":
          output += chalk.red(`\n❌ EXCLUIR: ${change.path}\n`);
          output += chalk.gray("----------------------------------------\n");
          output += chalk.red(change.originalContent || "");
          output += "\n" + chalk.gray("----------------------------------------\n");
          break;
      }
    }

    output += chalk.bold.cyan("\nPara aplicar essas alterações, digite: !apply\n");
    output += chalk.bold.red("Para descartar essas alterações, digite: !cancel\n");

    return output;
  }

  /**
   * Aplica todas as alterações pendentes
   * @returns objeto com resultado da operação
   */
  async applyChanges(): Promise<{ success: boolean; message: string }> {
    if (!this.hasPendingChanges()) {
      return { success: false, message: "Não há alterações pendentes para aplicar." };
    }

    try {
      let createdCount = 0;
      let modifiedCount = 0;
      let deletedCount = 0;

      // Processar todas as alterações pendentes
      for (const change of this.pendingChanges.values()) {
        const fullPath = path.isAbsolute(change.path) ? change.path : path.join(process.cwd(), change.path);

        switch (change.type) {
          case "create":
            // Garantir que o diretório pai exista
            await fs.ensureDir(path.dirname(fullPath));
            // Criar o arquivo
            await fs.writeFile(fullPath, change.content || "");
            createdCount++;
            break;

          case "modify":
            // Modificar o arquivo
            await fs.writeFile(fullPath, change.content || "");
            modifiedCount++;
            break;

          case "delete":
            // Excluir o arquivo
            await fs.remove(fullPath);
            deletedCount++;
            break;
        }
      }

      // Limpar alterações pendentes após aplicá-las
      this.clearPendingChanges();

      const message = `✅ Alterações aplicadas com sucesso: ${createdCount} arquivos criados, ${modifiedCount} modificados, ${deletedCount} excluídos.`;
      return { success: true, message };
    } catch (error: any) {
      return {
        success: false,
        message: `❌ Erro ao aplicar alterações: ${error.message}`,
      };
    }
  }
}

// Exportar uma instância única para o aplicativo
export const fileAgent = new FileAgent();
