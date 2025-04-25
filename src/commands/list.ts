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
  getSyncStatus,
} from "../utils/display.js";
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

interface ListOptions {
  offline?: boolean;
  compact?: boolean;
}

export const listTasks = async (options: ListOptions = { offline: false, compact: false }): Promise<void> => {
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

    // Verificar tamanho do terminal para ajustar automaticamente (versão compacta em terminais pequenos)
    const isCompactMode = options.compact || process.stdout.columns < 120;

    // Configuração da tabela baseada no modo (compacto ou normal)
    const tableConfig = isCompactMode
      ? {
          head: [
            chalk.cyan("ID"),
            chalk.cyan("Título"),
            chalk.cyan("Status"),
            chalk.cyan("Prior"),
            chalk.cyan("Dep"),
            chalk.cyan("Sync"),
          ],
          colWidths: [10, 38, 10, 6, 12, 5],
          truncate: "…",
          style: { "padding-left": 1, "padding-right": 1 },
          chars: {
            top: "─",
            "top-mid": "┬",
            "top-left": "┌",
            "top-right": "┐",
            bottom: "─",
            "bottom-mid": "┴",
            "bottom-left": "└",
            "bottom-right": "┘",
            left: "│",
            "left-mid": "├",
            mid: "─",
            "mid-mid": "┼",
            right: "│",
            "right-mid": "┤",
            middle: "│",
          },
        }
      : {
          head: [
            chalk.cyan("ID"),
            chalk.cyan("Título"),
            chalk.cyan("Status"),
            chalk.cyan("GitHub"),
            chalk.cyan("Prior"),
            chalk.cyan("Depend"),
            chalk.cyan("Projeto"),
            chalk.cyan("Sprint"),
            chalk.cyan("Sync"),
          ],
          colWidths: [10, 35, 12, 8, 7, 12, 10, 16, 5],
          truncate: "…",
          style: { "padding-left": 1, "padding-right": 1 },
          chars: {
            top: "─",
            "top-mid": "┬",
            "top-left": "┌",
            "top-right": "┐",
            bottom: "─",
            "bottom-mid": "┴",
            "bottom-left": "└",
            "bottom-right": "┘",
            left: "│",
            "left-mid": "├",
            mid: "─",
            "mid-mid": "┼",
            right: "│",
            "right-mid": "┤",
            middle: "│",
          },
        };

    // Preparar tabela para exibição
    const table = new Table({
      ...tableConfig,
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

      // Limitar o tamanho do título para caber na coluna
      const titleMaxLength = isCompactMode ? 43 : 36;
      const shortenedTitle =
        task.title.length > titleMaxLength ? task.title.substring(0, titleMaxLength - 1) + "…" : task.title;

      // Preparar ID com link caso tenha issue no GitHub
      let taskIdDisplay = `${task.id}`;
      if (issueNumber) {
        const githubUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${issueNumber}`;
        taskIdDisplay = `\u001b]8;;${githubUrl}\u0007#${task.id}\u001b]8;;\u0007`;
      }

      // Abreviar projeto se necessário
      const projectName = formatProjectName(task.project);
      const shortenedProject = projectName.length > 8 ? projectName.substring(0, 7) + "…" : projectName;

      // Abreviar milestone/sprint
      const shortenedMilestone =
        task.milestone && task.milestone.length > 14 ? task.milestone.substring(0, 13) + "…" : task.milestone || "N/A";

      // Determinar o status do GitHub
      let githubStatus = getGitHubStatus(task.state);
      if (isCompactMode && githubStatus === "Excluída") {
        githubStatus = chalk.red("Del");
      }

      // Determinar o status de sincronização
      const syncStatus = getSyncStatus(task);

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
      const titleDisplay = task.state === "deleted" ? chalk.gray(shortenedTitle) : chalk.green(shortenedTitle);

      // Adicionar linha à tabela com base no modo
      if (isCompactMode) {
        table.push([
          taskIdDisplay,
          titleDisplay,
          getColoredStatus(task.status, true),
          getPriorityWithColor(task.priority, true),
          formatDependencies(task.dependencies, tasksById, true),
          syncSymbol,
        ]);
      } else {
        table.push([
          taskIdDisplay,
          titleDisplay,
          getColoredStatus(task.status),
          githubStatus,
          getPriorityWithColor(task.priority),
          formatDependencies(task.dependencies, tasksById),
          shortenedProject || "N/A",
          shortenedMilestone,
          syncSymbol,
        ]);
      }
    });

    console.log(chalk.bold("\nLista de Tarefas:"));
    console.log(table.toString());

    // Adicionar legenda para os símbolos de sincronização
    console.log("\nLegenda:");
    console.log(`${chalk.green("✓")} - Sincronizado com GitHub`);
    console.log(`${chalk.red("✗")} - Não sincronizado`);
    console.log(`${chalk.yellow("!")} - Modificado localmente desde a última sincronização`);
    if (!isCompactMode) {
      console.log(`${chalk.red("Del")} - Issue removida do GitHub mas mantida localmente`);
      console.log(chalk.blue("Os IDs das tarefas são clicáveis e abrem diretamente no GitHub"));
    }
  } catch (error) {
    console.error(chalk.red("Erro ao listar tarefas:"), error);
  }
};
