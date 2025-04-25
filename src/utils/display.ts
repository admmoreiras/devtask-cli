import chalk from "chalk";
import { Task } from "./github/types.js";

/**
 * Formata o status da tarefa com cores apropriadas
 */
export const getColoredStatus = (status: string = "", isCompact: boolean = false): string => {
  let displayStatus = status;

  // Versão abreviada para modo compacto
  if (isCompact) {
    switch (status.toLowerCase()) {
      case "todo":
        displayStatus = "TODO";
        break;
      case "in progress":
        displayStatus = "PROG";
        break;
      case "em andamento":
        displayStatus = "PROG";
        break;
      case "done":
        displayStatus = "DONE";
        break;
      case "concluído":
      case "concluido":
        displayStatus = "DONE";
        break;
      case "blocked":
      case "bloqueado":
        displayStatus = "BLOCK";
        break;
    }
  }

  switch (status.toLowerCase()) {
    case "todo":
      return chalk.blue(displayStatus);
    case "in progress":
    case "em andamento":
      return chalk.yellow(displayStatus);
    case "done":
    case "concluído":
    case "concluido":
      return chalk.green(displayStatus);
    case "blocked":
    case "bloqueado":
      return chalk.red(displayStatus);
    default:
      return displayStatus || "todo";
  }
};

/**
 * Formata a prioridade da tarefa com cores apropriadas
 */
export const getPriorityWithColor = (priority: string = "", isCompact: boolean = false): string => {
  let displayPriority = priority;

  // Versão abreviada para modo compacto
  if (isCompact) {
    switch (priority.toLowerCase()) {
      case "alta":
        displayPriority = "ALT";
        break;
      case "média":
      case "media":
        displayPriority = "MED";
        break;
      case "baixa":
        displayPriority = "BAX";
        break;
      default:
        displayPriority = priority || "N/A";
    }
  }

  switch (priority.toLowerCase()) {
    case "alta":
      return chalk.red(displayPriority);
    case "média":
    case "media":
      return chalk.yellow(displayPriority);
    case "baixa":
      return chalk.green(displayPriority);
    default:
      return displayPriority || "N/A";
  }
};

/**
 * Formata as dependências da tarefa
 */
export const formatDependencies = (
  dependencies: number[] = [],
  tasksById: Map<number, Task> = new Map(),
  isCompact: boolean = false
): string => {
  if (!dependencies || dependencies.length === 0) {
    return "N/A";
  }

  // Mostrar todas as dependências como números, sem ícones
  return dependencies
    .map((depId) => {
      // Usar apenas o ID sem ícones
      return `${depId}`;
    })
    .join(", ");
};

/**
 * Formata o status do GitHub da tarefa
 */
export const getGitHubStatus = (state: string = ""): string => {
  if (!state) return "N/A";

  if (state === "deleted") {
    return chalk.red("Excluída");
  } else {
    return state === "open" ? "Aberta" : "Fechada";
  }
};

/**
 * Formata o status de sincronização da tarefa
 */
export const getSyncStatus = (task: Task): string => {
  return task.synced ? chalk.green("✓") : chalk.red("✗");
};

/**
 * Formata o nome do projeto removendo @ se necessário
 */
export const formatProjectName = (projectName: string = ""): string => {
  if (!projectName) return "N/A";
  return projectName.startsWith("@") ? projectName.substring(1) : projectName;
};
