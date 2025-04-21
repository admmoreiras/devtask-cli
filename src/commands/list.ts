import chalk from "chalk";
import Table from "cli-table3";
import fs from "fs-extra";
import * as path from "path";
import {
  Task,
  extractStatusFromIssue,
  fetchGitHubIssue,
  fetchGitHubIssues,
  fetchIssueProjectInfo,
} from "../utils/github.js";

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

        tasks.push(taskData);
      } catch (error) {
        console.error(`Erro ao ler o arquivo de tarefa ${file}:`, error);
      }
    }

    // Obter issues do GitHub para atualizar estados e informações
    const githubIssues = await fetchGitHubIssues();

    // Mapa de issue number para estado
    const issueStates = new Map<number, string>();
    githubIssues.forEach((issue: GitHubIssue) => {
      issueStates.set(issue.number, issue.state);
    });

    // Atualizar estado das tarefas locais com base nas issues do GitHub
    // e buscar informações atualizadas de projeto e milestone
    console.log(chalk.blue("\n🔄 Atualizando informações das tasks do GitHub..."));

    for (const task of tasks) {
      if (task.github_issue_number) {
        // Atualizar estado se disponível no mapa
        if (issueStates.has(task.github_issue_number)) {
          task.state = issueStates.get(task.github_issue_number);
        }

        // Buscar informações detalhadas da issue para milestone atual
        try {
          const issue = await fetchGitHubIssue(task.github_issue_number);
          if (issue) {
            // Atualizar milestone com valor atual do GitHub
            task.milestone = issue.milestone?.title || "";

            // Buscar projeto atualizado
            const projectInfo = await fetchIssueProjectInfo(task.github_issue_number);
            if (projectInfo) {
              task.project = projectInfo;
            } else {
              task.project = "";
            }

            // Atualizar status com informações do projeto no GitHub
            const statusFromProject = await extractStatusFromIssue(issue);
            if (statusFromProject) {
              task.status = statusFromProject;
            }
          }
        } catch (error) {
          // Silenciar erro, manter dados locais
        }
      }
    }

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
      // Usar github_issue_number
      const issueNumber = task.github_issue_number;
      const issuePrefix = issueNumber ? `#${issueNumber} - ` : "";
      // Remover '@' do nome do projeto se existir e garantir N/A se vazio
      const projectName = task.project ? (task.project.startsWith("@") ? task.project.substring(1) : task.project) : "";

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
