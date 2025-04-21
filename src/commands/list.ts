import chalk from "chalk";
import path from "path";
import { readAllFromDir } from "../utils/storage.js";

interface Task {
  id: number;
  title: string;
  description: string;
  milestone: string;
  project: string;
  status: string;
}

export async function listTasks() {
  const tasks = await readAllFromDir(path.join(".task/issues"));
  if (!tasks.length) {
    console.log("Nenhuma task encontrada.");
    return;
  }

  tasks.forEach((task: Task) => {
    console.log(`${chalk.green(task.title)} [${task.status}]`);
    console.log(`🔗 Projeto: ${task.project} | 🧩 Sprint: ${task.milestone}`);
    console.log(`📝 ${task.description}`);
    console.log("---");
  });
}
