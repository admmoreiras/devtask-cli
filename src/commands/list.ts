import chalk from "chalk";
import Table from "cli-table3";
import dotenv from "dotenv";
import fs from "fs-extra";
import * as path from "path";
import { Task } from "../utils/github/types.js";

// Carregar variáveis de ambiente
dotenv.config();

// Obter variáveis de ambiente para GitHub
const GITHUB_OWNER = process.env.GITHUB_OWNER || "";
const GITHUB_REPO = process.env.GITHUB_REPO || "";

interface GitHubIssue {
  number: number;
  state: string;
}

export const listTasks = async (options = { offline: false }): Promise<void> => {
  try {
    const tasksDir = path.join(process.cwd(), ".task", "issues");

    // Verificar se o diretório existe
    if (!fs.existsSync(tasksDir)) {
      console.log(chalk.yellow("Nenhuma tarefa encontrada."));
      return;
    }

    // Ler os arquivos de tarefas
    const taskFiles = fs.readdirSync(tasksDir);

    if (taskFiles.length === 0) {
      console.log(chalk.yellow("Nenhuma tarefa encontrada."));
      return;
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

    console.log(chalk.blue("\n📄 Exibindo informações armazenadas localmente."));
    console.log(chalk.gray("Para sincronizar com o GitHub, use: devtask sync"));

    // Preparar tabela para exibição
    const table = new Table({
      head: [
        chalk.cyan("Título"),
        chalk.cyan("Status"),
        chalk.cyan("Status GitHub"),
        chalk.cyan("Prioridade"),
        chalk.cyan("Dependências"),
        chalk.cyan("Projeto"),
        chalk.cyan("Sprint"),
        chalk.cyan("Sincronizado"),
      ],
      wordWrap: true,
      wrapOnWordBoundary: true,
    });

    // Criar mapa para referência rápida das tarefas pelo ID
    const tasksById = tasks.reduce((map, task) => {
      map.set(task.id, task);
      return map;
    }, new Map<number, Task>());

    // Adicionar tarefas à tabela com cores
    tasks.forEach((task) => {
      // Usar github_issue_number
      const issueNumber = task.github_issue_number;

      // Criar link para issue no GitHub, se tiver número
      let issueTitle = task.title;
      let issuePrefix = "";

      if (issueNumber) {
        // Construir URL para a issue no GitHub
        const githubUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${issueNumber}`;
        // Criar texto com link utilizando formatação de terminal hyperlink
        issuePrefix = `#${issueNumber} - `;
        // O formato \u001b]8;;URL\u0007TEXT\u001b]8;;\u0007 cria um hyperlink no terminal
        issueTitle = `\u001b]8;;${githubUrl}\u0007${task.title}\u001b]8;;\u0007`;
      }

      // Remover '@' do nome do projeto se existir e garantir N/A se vazio
      const projectName = task.project ? (task.project.startsWith("@") ? task.project.substring(1) : task.project) : "";

      // Determinar o status do GitHub
      let githubStatus = "N/A";
      if (task.state) {
        if (task.state === "deleted") {
          githubStatus = chalk.red("Excluída");
        } else {
          githubStatus = task.state === "open" ? "Aberta" : "Fechada";
        }
      }

      // Determinar o status de sincronização
      const syncStatus = task.synced ? chalk.green("✓") : chalk.red("✗");
      // Verificar modificação pelo timestamp de sincronização
      let modifiedSymbol = "";

      // Verificar se o arquivo foi modificado após a sincronização
      try {
        const taskPath = path.join(
          tasksDir,
          taskFiles.find((f) => f.includes(`${task.id}-`) || f.includes(`-${task.id}-`)) || ""
        );
        if (fs.existsSync(taskPath)) {
          const fileStats = fs.statSync(taskPath);
          const lastModifiedTime = new Date(fileStats.mtime).getTime();
          const lastSyncTime = task.lastSyncAt ? new Date(task.lastSyncAt).getTime() : 0;

          if (lastModifiedTime > lastSyncTime) {
            modifiedSymbol = chalk.yellow("!");
          }
        }
      } catch (error) {
        // Silenciar erro
      }

      const syncSymbol = `${syncStatus}${modifiedSymbol}`;

      // Destacar título em cinza para issues excluídas no GitHub
      const titleDisplay =
        task.state === "deleted"
          ? chalk.gray(`${issuePrefix}${issueTitle}`)
          : chalk.green(`${issuePrefix}${issueTitle}`);

      // Formatar dependências
      const dependenciesDisplay = formatDependencies(task.dependencies || [], tasksById);

      // Formatar prioridade com cores
      const priorityDisplay = getPriorityWithColor(task.priority || "");

      table.push([
        titleDisplay,
        getColoredStatus(task.status),
        githubStatus,
        priorityDisplay,
        dependenciesDisplay,
        projectName || "N/A",
        task.milestone || "N/A",
        syncSymbol,
      ]);
    });

    console.log(chalk.bold("\nLista de Tarefas:"));
    console.log(table.toString());

    // Adicionar legenda para os símbolos de sincronização
    console.log("\nLegenda:");
    console.log(`${chalk.green("✓")} - Sincronizado com GitHub`);
    console.log(`${chalk.red("✗")} - Não sincronizado`);
    console.log(`${chalk.yellow("!")} - Modificado localmente desde a última sincronização`);
    console.log(`${chalk.red("Excluída")} - Issue removida do GitHub mas mantida localmente`);
    console.log(chalk.blue("Os títulos das tarefas são clicáveis e abrem diretamente no GitHub"));
  } catch (error) {
    console.error(chalk.red("Erro ao listar tarefas:"), error);
  }
};

// Função para colorir o status
const getColoredStatus = (status: string): string => {
  switch (status.toLowerCase()) {
    case "todo":
      return chalk.blue(status);
    case "in progress":
    case "em andamento":
      return chalk.yellow(status);
    case "done":
    case "concluído":
    case "concluido":
      return chalk.green(status);
    case "blocked":
    case "bloqueado":
      return chalk.red(status);
    default:
      return status;
  }
};

// Função para colorir a prioridade
const getPriorityWithColor = (priority: string): string => {
  switch (priority.toLowerCase()) {
    case "alta":
      return chalk.red(priority);
    case "média":
    case "media":
      return chalk.yellow(priority);
    case "baixa":
      return chalk.green(priority);
    default:
      return priority || "N/A";
  }
};

// Função para formatar as dependências
const formatDependencies = (dependencies: number[], tasksById: Map<number, Task>): string => {
  if (!dependencies || dependencies.length === 0) {
    return "N/A";
  }

  return dependencies
    .map((depId) => {
      const depTask = tasksById.get(depId);
      if (!depTask) return `#${depId}`;

      // Verificar o status da dependência
      const isCompleted = ["done", "concluído", "concluido"].includes(depTask.status.toLowerCase());
      const symbol = isCompleted ? "✓" : "⏳";
      const color = isCompleted ? chalk.green : chalk.yellow;

      return color(`${symbol} #${depId}`);
    })
    .join(", ");
};
