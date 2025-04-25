import chalk from "chalk";
import Table from "cli-table3";
import dotenv from "dotenv";
import fs from "fs-extra";
import * as path from "path";
import {
  formatDependencies,
  formatProjectName,
  getColoredStatus,
  getGitHubStatus,
  getPriorityWithColor,
} from "../utils/display.js";
import github from "../utils/github/index.js";
import { Task } from "../utils/github/types.js";
import { readAllFromDir } from "../utils/storage.js";
import { executeTask as runTaskExecution } from "./execute.js";

// Carregar variáveis de ambiente
dotenv.config();

// Obter variáveis de ambiente para GitHub
const GITHUB_OWNER = process.env.GITHUB_OWNER || "";
const GITHUB_REPO = process.env.GITHUB_REPO || "";

interface MilestoneStatus {
  name: string;
  total: number;
  completed: number;
  pending: number;
  tasks: Task[];
}

export const nextTasks = async (options = { execute: false }): Promise<void> => {
  try {
    console.log(chalk.blue("\n🔍 Buscando próxima sprint ativa..."));

    // Verificar se o diretório existe
    const tasksDir = path.join(process.cwd(), ".task", "issues");
    if (!fs.existsSync(tasksDir)) {
      console.log(chalk.yellow("Nenhuma tarefa encontrada. Execute 'devtask sync' primeiro."));
      return;
    }

    // Ler todos os arquivos de tarefas
    const tasks = await readAllFromDir(path.join(".task/issues"));

    if (!tasks.length) {
      console.log(chalk.yellow("Nenhuma tarefa encontrada. Execute 'devtask sync' primeiro."));
      return;
    }

    // Atualizar status das tarefas do GitHub para garantir informações atualizadas
    console.log(chalk.blue("Atualizando status das tarefas do GitHub..."));
    await updateTasksFromGitHub(tasks);

    // Agrupar tarefas por milestone e calcular status
    const milestonesMap = groupTasksByMilestone(tasks);

    // Ordenar milestones por sequência numérica (Sprint 1, Sprint 2, etc.)
    const orderedMilestones = sortMilestonesBySequence(milestonesMap);

    // Encontrar a primeira milestone não concluída
    const nextMilestone = findNextActiveMilestone(orderedMilestones);

    if (!nextMilestone) {
      console.log(chalk.green("🎉 Todas as sprints estão concluídas! Nenhuma tarefa pendente."));
      return;
    }

    // Exibir informações da próxima sprint
    displayNextSprint(nextMilestone);

    // Se a opção de execução estiver ativada, gerar prompt para a primeira tarefa
    if (options.execute) {
      const firstPendingTask = findFirstPendingTask(nextMilestone.tasks);
      if (firstPendingTask) {
        await executeTask(firstPendingTask);
      } else {
        console.log(chalk.yellow("Não foi possível identificar uma tarefa pendente para execução."));
      }
    }
  } catch (error) {
    console.error(chalk.red("Erro ao listar próximas tarefas:"), error);
  }
};

// Atualiza o status das tarefas do GitHub
async function updateTasksFromGitHub(tasks: Task[]): Promise<void> {
  for (const task of tasks) {
    if (task.github_issue_number) {
      try {
        const issue = await github.fetchGitHubIssue(task.github_issue_number);
        if (issue && issue.state !== "deleted") {
          await github.updateLocalTaskFromIssue(task, issue);
        }
      } catch (error) {
        // Continuar mesmo se houver erro em uma tarefa específica
        console.log(chalk.yellow(`Não foi possível atualizar a tarefa #${task.github_issue_number}`));
      }
    }
  }
}

// Agrupa tarefas por milestone e calcula estatísticas
function groupTasksByMilestone(tasks: Task[]): Map<string, MilestoneStatus> {
  const milestonesMap = new Map<string, MilestoneStatus>();

  for (const task of tasks) {
    // Ignorar tarefas sem milestone ou marcadas como excluídas
    if (!task.milestone || task.state === "deleted" || task.deleted) {
      continue;
    }

    // Verificar se a milestone já existe no mapa
    if (!milestonesMap.has(task.milestone)) {
      milestonesMap.set(task.milestone, {
        name: task.milestone,
        total: 0,
        completed: 0,
        pending: 0,
        tasks: [],
      });
    }

    // Obter o objeto da milestone
    const milestoneStatus = milestonesMap.get(task.milestone)!;

    // Incrementar contadores
    milestoneStatus.total++;

    // Verificar se a tarefa está concluída
    const isDone =
      task.status?.toLowerCase() === "done" ||
      task.status?.toLowerCase() === "concluído" ||
      task.status?.toLowerCase() === "concluido" ||
      task.state === "closed";

    if (isDone) {
      milestoneStatus.completed++;
    } else {
      milestoneStatus.pending++;
    }

    // Adicionar tarefa ao array de tarefas da milestone
    milestoneStatus.tasks.push(task);
  }

  return milestonesMap;
}

// Ordena milestones por sequência numérica (Sprint 1, Sprint 2, etc.)
function sortMilestonesBySequence(milestonesMap: Map<string, MilestoneStatus>): MilestoneStatus[] {
  const milestones = Array.from(milestonesMap.values());

  return milestones.sort((a, b) => {
    // Função para extrair número de uma string (ex: "Sprint 1" -> 1)
    const extractNumber = (text: string): number => {
      const match = text.match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    };

    const numA = extractNumber(a.name);
    const numB = extractNumber(b.name);

    return numA - numB;
  });
}

// Encontra a primeira milestone não concluída
function findNextActiveMilestone(milestones: MilestoneStatus[]): MilestoneStatus | null {
  for (const milestone of milestones) {
    if (milestone.pending > 0) {
      return milestone;
    }
  }
  return null;
}

// Encontra a primeira tarefa pendente de uma milestone
function findFirstPendingTask(tasks: Task[]): Task | null {
  // Ordenar por número de issue (do menor para o maior)
  const sortedTasks = [...tasks].sort((a, b) => {
    const numA = a.github_issue_number || Infinity;
    const numB = b.github_issue_number || Infinity;
    return numA - numB;
  });

  // Filtrar apenas tarefas não concluídas
  return (
    sortedTasks.find((task) => {
      const isDone =
        task.status?.toLowerCase() === "done" ||
        task.status?.toLowerCase() === "concluído" ||
        task.status?.toLowerCase() === "concluido" ||
        task.state === "closed";

      return !isDone;
    }) || null
  );
}

// Exibe informações da próxima sprint
function displayNextSprint(milestone: MilestoneStatus): void {
  console.log(chalk.green(`\n🏃‍♂️ Próxima Sprint: ${milestone.name}`));
  console.log(
    chalk.blue(`Status: ${milestone.completed}/${milestone.total} tarefas concluídas (${milestone.pending} pendentes)`)
  );

  // Ordenar tarefas por status e número da issue
  const sortedTasks = [...milestone.tasks].sort((a, b) => {
    // Primeiro por status (não concluído primeiro)
    const isDoneA = a.status?.toLowerCase() === "done" || a.state === "closed";
    const isDoneB = b.status?.toLowerCase() === "done" || b.state === "closed";

    if (isDoneA !== isDoneB) {
      return isDoneA ? 1 : -1;
    }

    // Depois por número da issue
    const numA = a.github_issue_number || Infinity;
    const numB = b.github_issue_number || Infinity;
    return numA - numB;
  });

  // Criar tabela
  const table = new Table({
    head: [
      chalk.cyan("ID"),
      chalk.cyan("Título"),
      chalk.cyan("Status"),
      chalk.cyan("GitHub"),
      chalk.cyan("Prior"),
      chalk.cyan("Depend"),
      chalk.cyan("Projeto"),
      chalk.cyan("Sprint"),
    ],
    wordWrap: true,
    wrapOnWordBoundary: true,
    colWidths: [8, 35, 12, 10, 7, 12, 10, 15],
  });

  // Criar mapa para referência rápida das tarefas pelo ID
  const tasksById = sortedTasks.reduce((map, task) => {
    map.set(task.id, task);
    return map;
  }, new Map<number, Task>());

  // Adicionar tarefas à tabela
  sortedTasks.forEach((task) => {
    const issueNumber = task.github_issue_number;

    // Não criar mais link para o título, apenas exibir o texto normal
    let issueTitle = task.title;

    // Destacar título em cinza para issues excluídas no GitHub
    const titleDisplay = task.state === "deleted" ? chalk.gray(issueTitle) : chalk.green(issueTitle);

    // Preparar ID com link caso tenha issue no GitHub
    let taskIdDisplay = task.id ? `#${task.id}` : "N/A";
    if (issueNumber) {
      const githubUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${issueNumber}`;
      taskIdDisplay = `\u001b]8;;${githubUrl}\u0007${taskIdDisplay}\u001b]8;;\u0007`;
    } else if (!task.id && issueNumber) {
      // Se não tiver ID mas tiver número de issue, usar número de issue
      const githubUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${issueNumber}`;
      taskIdDisplay = `\u001b]8;;${githubUrl}\u0007#${issueNumber}\u001b]8;;\u0007`;
    }

    table.push([
      taskIdDisplay,
      titleDisplay,
      getColoredStatus(task.status),
      getGitHubStatus(task.state),
      getPriorityWithColor(task.priority),
      formatDependencies(task.dependencies, tasksById),
      formatProjectName(task.project),
      task.milestone || milestone.name || "N/A",
    ]);
  });

  console.log(table.toString());
  console.log(chalk.blue("Os IDs das tarefas são clicáveis e abrem diretamente no GitHub"));
}

// Função para executar uma tarefa (será implementada posteriormente)
async function executeTask(task: Task): Promise<void> {
  await runTaskExecution({ issueNumber: task.github_issue_number || 0, auto: false });
}
