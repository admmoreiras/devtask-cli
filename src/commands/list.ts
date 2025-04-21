import chalk from "chalk";
import Table from "cli-table3";
import path from "path";
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
  const tasks = await readAllFromDir(path.join(".task/issues"));
  if (!tasks.length) {
    console.log("Nenhuma task encontrada.");
    return;
  }

  const table = new Table({
    head: [chalk.cyan("Título"), chalk.cyan("Status"), chalk.cyan("Projeto"), chalk.cyan("Sprint")],
    wordWrap: true,
    wrapOnWordBoundary: true,
  });

  tasks.forEach((task: Task) => {
    const issuePrefix = task.github_issue_number ? `${task.github_issue_number} - ` : "";

    table.push([chalk.green(`${issuePrefix}${task.title}`), task.status, task.project, task.milestone]);
  });

  console.log(table.toString());
}
