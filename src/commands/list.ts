import chalk from "chalk";
import Table from "cli-table3";
import fs from "fs-extra";
import * as path from "path";
import { fetchGitHubIssues } from "../utils/github.js";

// Interface para as tarefas
interface Task {
  id: string;
  title: string;
  status: string;
  project?: string;
  milestone?: string;
  issue?: number;
  state?: string;
  github_issue_number?: number;
}

interface GitHubIssue {
  number: number;
  state: string;
}

export const listTasks = async (): Promise<void> => {
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

        tasks.push({
          id: taskData.id,
          title: taskData.title,
          status: taskData.status,
          project: taskData.project,
          milestone: taskData.milestone,
          issue: taskData.issue,
          state: taskData.state || "local",
          github_issue_number: taskData.github_issue_number,
        });
      } catch (error) {
        console.error(`Erro ao ler o arquivo de tarefa ${file}:`, error);
      }
    }

    // Obter issues do GitHub para atualizar estados
    const githubIssues = await fetchGitHubIssues();

    // Mapa de issue number para estado
    const issueStates = new Map<number, string>();
    githubIssues.forEach((issue: GitHubIssue) => {
      issueStates.set(issue.number, issue.state);
    });

    // Atualizar estado das tarefas locais com base nas issues do GitHub
    tasks.forEach((task) => {
      if (task.issue && issueStates.has(task.issue)) {
        task.state = issueStates.get(task.issue);
      }
    });

    // Preparar tabela para exibição - usando o mesmo estilo do comando sync
    const table = new Table({
      head: [
        chalk.cyan("Título"),
        chalk.cyan("Status"),
        chalk.cyan("Status GitHub"),
        chalk.cyan("Projeto"),
        chalk.cyan("Sprint"),
      ],
      wordWrap: true,
      wrapOnWordBoundary: true,
    });

    // Adicionar tarefas à tabela com cores
    tasks.forEach((task) => {
      // Usar github_issue_number se disponível, senão usar issue
      const issueNumber = task.github_issue_number || task.issue;
      const issuePrefix = issueNumber ? `#${issueNumber} - ` : "";
      const projectName = task.project && task.project.startsWith("@") ? task.project.substring(1) : task.project;

      // Determinar o status do GitHub
      let githubStatus = "N/A";
      if (task.state && task.state !== "local") {
        githubStatus = task.state === "open" ? "Aberta" : "Fechada";
      }

      table.push([
        chalk.green(`${issuePrefix}${task.title}`),
        getColoredStatus(task.status),
        githubStatus,
        projectName || "N/A",
        task.milestone || "N/A",
      ]);
    });

    console.log(chalk.bold("\nLista de Tarefas:"));
    console.log(table.toString());
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
