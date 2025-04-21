import inquirer from "inquirer";
import path from "path";
import { saveJson } from "../utils/storage.js";

export async function createTask() {
  const { title, description, milestone, project } = await inquirer.prompt([
    { type: "input", name: "title", message: "Título da task:" },
    { type: "input", name: "description", message: "Descrição:" },
    { type: "input", name: "milestone", message: "Milestone (Sprint):" },
    { type: "input", name: "project", message: "Projeto:" },
  ]);

  const slug = title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");
  const id = Date.now();
  const task = { id, title, description, milestone, project, status: "todo" };

  await saveJson(path.join(".task/issues", `${id}-${slug}.json`), task);

  console.log("✅ Task criada!");
}
