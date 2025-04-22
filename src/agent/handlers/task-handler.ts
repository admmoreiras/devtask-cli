// Manipulador para operações relacionadas a tarefas
import fs from "fs-extra";
import path from "path";
import { Task } from "../../utils/github.js";
import { saveJson } from "../../utils/storage.js";
import { Intent } from "../intent-processor.js";
import { BaseHandler } from "./handler-interface.js";

/**
 * Manipulador para intenções relacionadas a tarefas
 */
export class TaskHandler extends BaseHandler {
  // Ações suportadas por este manipulador
  private supportedActions = [
    "create", // Criar uma nova tarefa
    "list", // Listar tarefas
    "update", // Atualizar uma tarefa existente
    "select", // Selecionar uma tarefa para trabalhar
    "delete", // Excluir uma tarefa
    "sync", // Sincronizar tarefas com GitHub
  ];

  /**
   * Processa uma intenção relacionada a tarefas
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
        case "create":
          return await this.handleCreate(intent);

        case "list":
          return await this.handleList();

        case "update":
          return await this.handleUpdate(intent);

        case "select":
          return await this.handleSelect(intent);

        case "delete":
          return await this.handleDelete(intent);

        case "sync":
          return await this.handleSync(intent);

        default:
          return `Operação de tarefa não implementada: ${intent.action}`;
      }
    } catch (error: any) {
      return `Erro ao processar operação de tarefa: ${error.message}`;
    }
  }

  /**
   * Processa a ação de criar uma nova tarefa
   */
  private async handleCreate(intent: Intent): Promise<string> {
    const { title, description, milestone, project, status } = intent.parameters;

    if (!title) {
      return "Por favor, forneça um título para a tarefa.";
    }

    try {
      // Gerar um slug a partir do título
      const slug = title
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]/g, "");

      // Gerar um ID único
      const id = Date.now();

      // Criar objeto da tarefa
      const task: Task = {
        id,
        title,
        description: description || "",
        milestone: milestone || "",
        project: project || "",
        status: status || "todo",
        lastSyncAt: new Date().toISOString(),
      };

      // Salvar a tarefa em arquivo
      await fs.ensureDir(path.join(process.cwd(), ".task/issues"));
      await saveJson(path.join(".task/issues", `${id}-${slug}.json`), task);

      return `✅ Tarefa "${title}" criada com sucesso!\n\nID: ${id}\nStatus: ${status || "todo"}\nMilestone: ${
        milestone || "Nenhuma"
      }\nProjeto: ${project || "Nenhum"}`;
    } catch (error: any) {
      return `Erro ao criar tarefa: ${error.message}`;
    }
  }

  /**
   * Processa a ação de listar tarefas
   */
  private async handleList(): Promise<string> {
    try {
      const tasksDir = path.join(process.cwd(), ".task", "issues");

      // Verificar se o diretório existe
      if (!fs.existsSync(tasksDir)) {
        return "Nenhuma tarefa encontrada.";
      }

      // Ler os arquivos de tarefas
      const taskFiles = fs.readdirSync(tasksDir);

      if (taskFiles.length === 0) {
        return "Nenhuma tarefa encontrada.";
      }

      // Obter as tarefas dos arquivos
      const tasks: Task[] = [];

      for (const file of taskFiles) {
        try {
          const taskPath = path.join(tasksDir, file);
          const taskData = fs.readJsonSync(taskPath);

          // Ignorar tarefas marcadas como excluídas
          if (taskData.deleted) continue;

          tasks.push(taskData);
        } catch (error) {
          console.error(`Erro ao ler o arquivo de tarefa ${file}:`, error);
        }
      }

      if (tasks.length === 0) {
        return "Nenhuma tarefa ativa encontrada.";
      }

      // Formatar a lista de tarefas
      const tasksFormatted = tasks
        .map((task) => {
          const issueNumber = task.github_issue_number ? `#${task.github_issue_number} - ` : "";
          return `- ${issueNumber}${task.title} (${task.status || "todo"})${
            task.milestone ? ` [Sprint: ${task.milestone}]` : ""
          }${task.project ? ` [Projeto: ${task.project}]` : ""}`;
        })
        .join("\n");

      return `Tarefas encontradas (${tasks.length}):\n\n${tasksFormatted}`;
    } catch (error: any) {
      return `Erro ao listar tarefas: ${error.message}`;
    }
  }

  /**
   * Processa a ação de atualizar uma tarefa existente
   */
  private async handleUpdate(intent: Intent): Promise<string> {
    const { id, taskId, title, description, milestone, project, status } = intent.parameters;

    // O ID pode ser fornecido como id ou taskId
    const taskIdToUpdate = id || taskId;

    if (!taskIdToUpdate) {
      return "Por favor, forneça o ID da tarefa que deseja atualizar.";
    }

    try {
      const tasksDir = path.join(process.cwd(), ".task", "issues");

      // Encontrar o arquivo da tarefa
      const files = await fs.readdir(tasksDir);
      const taskFile = files.find(
        (file) => file.includes(`${taskIdToUpdate}-`) || file.includes(`-${taskIdToUpdate}-`)
      );

      if (!taskFile) {
        return `Tarefa com ID ${taskIdToUpdate} não encontrada.`;
      }

      const taskPath = path.join(tasksDir, taskFile);
      const task: Task = await fs.readJson(taskPath);

      // Atualizar os campos fornecidos
      if (title) task.title = title;
      if (description) task.description = description;
      if (milestone !== undefined) task.milestone = milestone;
      if (project !== undefined) task.project = project;
      if (status) task.status = status;

      // Atualizar timestamp da última modificação
      task.lastSyncAt = new Date().toISOString();

      // Se o título foi alterado, precisamos atualizar o nome do arquivo
      if (title && title !== task.title) {
        // Remover o arquivo antigo
        await fs.remove(taskPath);

        // Criar novo slug
        const newSlug = title
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^\w-]/g, "");

        // Determinar novo nome de arquivo
        let newFileName;
        if (task.github_issue_number) {
          newFileName = `#${task.github_issue_number}-${task.id}-${newSlug}.json`;
        } else {
          newFileName = `${task.id}-${newSlug}.json`;
        }

        // Salvar com novo nome
        await saveJson(path.join(tasksDir, newFileName), task);
      } else {
        // Salvar no mesmo arquivo
        await saveJson(taskPath, task);
      }

      return `✅ Tarefa atualizada com sucesso!\n\nID: ${task.id}\nTítulo: ${task.title}\nStatus: ${
        task.status
      }\nMilestone: ${task.milestone || "Nenhuma"}\nProjeto: ${task.project || "Nenhum"}`;
    } catch (error: any) {
      return `Erro ao atualizar tarefa: ${error.message}`;
    }
  }

  /**
   * Processa a ação de selecionar uma tarefa
   */
  private async handleSelect(intent: Intent): Promise<string> {
    const { id, taskId } = intent.parameters;

    // O ID pode ser fornecido como id ou taskId
    const taskIdToSelect = id || taskId;

    if (!taskIdToSelect) {
      return "Por favor, forneça o ID da tarefa que deseja selecionar.";
    }

    try {
      const tasksDir = path.join(process.cwd(), ".task", "issues");

      // Encontrar o arquivo da tarefa
      const files = await fs.readdir(tasksDir);
      const taskFile = files.find(
        (file) => file.includes(`${taskIdToSelect}-`) || file.includes(`-${taskIdToSelect}-`)
      );

      if (!taskFile) {
        return `Tarefa com ID ${taskIdToSelect} não encontrada.`;
      }

      const taskPath = path.join(tasksDir, taskFile);
      const task: Task = await fs.readJson(taskPath);

      // Atualizar estado do contexto
      this.contextManager.updateState({
        type: "task",
        action: "select",
        parameters: { taskId: task.id },
        originalMessage: "",
      });

      return `✅ Tarefa selecionada: "${task.title}"\n\nID: ${task.id}\nStatus: ${task.status}\nMilestone: ${
        task.milestone || "Nenhuma"
      }\nProjeto: ${task.project || "Nenhum"}\nDescrição: ${task.description || "Nenhuma"}`;
    } catch (error: any) {
      return `Erro ao selecionar tarefa: ${error.message}`;
    }
  }

  /**
   * Processa a ação de excluir uma tarefa
   */
  private async handleDelete(intent: Intent): Promise<string> {
    const { id, taskId } = intent.parameters;

    // O ID pode ser fornecido como id ou taskId
    const taskIdToDelete = id || taskId;

    if (!taskIdToDelete) {
      return "Por favor, forneça o ID da tarefa que deseja excluir.";
    }

    try {
      const tasksDir = path.join(process.cwd(), ".task", "issues");

      // Encontrar o arquivo da tarefa
      const files = await fs.readdir(tasksDir);
      const taskFile = files.find(
        (file) => file.includes(`${taskIdToDelete}-`) || file.includes(`-${taskIdToDelete}-`)
      );

      if (!taskFile) {
        return `Tarefa com ID ${taskIdToDelete} não encontrada.`;
      }

      const taskPath = path.join(tasksDir, taskFile);

      // Ler a tarefa para mostrar informações
      const task: Task = await fs.readJson(taskPath);

      // Marcar como excluída ao invés de remover fisicamente
      task.deleted = true;
      await saveJson(taskPath, task);

      return `✅ Tarefa "${task.title}" (ID: ${task.id}) foi marcada como excluída.`;
    } catch (error: any) {
      return `Erro ao excluir tarefa: ${error.message}`;
    }
  }

  /**
   * Processa a ação de sincronizar tarefas com o GitHub
   */
  private async handleSync(intent: Intent): Promise<string> {
    const { direction } = intent.parameters;

    // Para uma experiência mais integrada, recomendamos usar o comando sync diretamente
    return `Para sincronizar tarefas com o GitHub, por favor use o comando 'devtask sync' diretamente no terminal.\n\nEsse comando oferece opções interativas para selecionar a direção da sincronização (Local → GitHub, GitHub → Local, ou ambos) e lida com casos complexos de sincronização.`;
  }
}
