import chalk from "chalk";
import Table from "cli-table3";
import path from "path";
import { fetchIssueProjectInfo } from "../utils/github.js";
import { readAllFromDir } from "../utils/storage.js";

interface Task {
  id: number;
  title: string;
  description: string;
  milestone: string;
  project: string;
  status: string;
  github_issue_number?: number;
}

export async function listTasks() {
  try {
    const tasks = await readAllFromDir(path.join(".task/issues"));

    if (!tasks.length) {
      console.log("Nenhuma task encontrada.");
      return;
    }

    // Buscar informações de projeto do GitHub para cada task
    const tasksWithProjects = await Promise.all(
      tasks.map(async (task: Task) => {
        if (task.github_issue_number) {
          try {
            const projectInfo = await fetchIssueProjectInfo(task.github_issue_number);
            if (projectInfo) {
              task.project = projectInfo;
            }
          } catch (error) {
            // Silenciar erro
          }
        }
        return task;
      })
    );

    const table = new Table({
      head: [chalk.cyan("Título"), chalk.cyan("Status"), chalk.cyan("Projeto"), chalk.cyan("Sprint")],
      wordWrap: true,
      wrapOnWordBoundary: true,
    });

    tasksWithProjects.forEach((task: Task) => {
      const issuePrefix = task.github_issue_number ? `#${task.github_issue_number} - ` : "";
      // Remover '@' do nome do projeto se existir
      const projectName = task.project && task.project.startsWith("@") ? task.project.substring(1) : task.project;

      table.push([
        chalk.green(`${issuePrefix}${task.title}`),
        task.status || "N/A",
        projectName || "N/A",
        task.milestone || "N/A",
      ]);
    });

    console.log(table.toString());
  } catch (error) {
    console.error("Erro ao exibir lista de tasks:", error);
  }
}
