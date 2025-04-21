import inquirer from "inquirer";
import path from "path";
import { createMilestone, createProject, fetchMilestones, fetchProjects } from "../utils/github.js";
import { saveJson } from "../utils/storage.js";

export async function createTask() {
  // Buscar milestones e projetos existentes para verificação
  const milestones = await fetchMilestones();
  const projects = await fetchProjects();

  const { title, description, milestone, project } = await inquirer.prompt([
    { type: "input", name: "title", message: "Título da task:" },
    { type: "input", name: "description", message: "Descrição:" },
    { type: "input", name: "milestone", message: "Milestone (Sprint):" },
    { type: "input", name: "project", message: "Projeto:" },
  ]);

  let finalMilestone = milestone;
  let finalProject = project;

  // Verificar se a milestone existe no GitHub
  if (milestone && !milestones.has(milestone.toLowerCase())) {
    const { createNewMilestone } = await inquirer.prompt([
      {
        type: "confirm",
        name: "createNewMilestone",
        message: `A milestone "${milestone}" não existe no GitHub. Deseja criá-la?`,
        default: true,
      },
    ]);

    if (createNewMilestone) {
      const milestoneId = await createMilestone(milestone);
      if (!milestoneId) {
        console.log("⚠️ Não foi possível criar a milestone. A task será criada sem milestone.");
        finalMilestone = "";
      }
    } else {
      console.log("⚠️ A task será criada sem milestone.");
      finalMilestone = "";
    }
  }

  // Verificar se o projeto existe no GitHub
  if (project && !projects.has(project)) {
    const { createNewProject } = await inquirer.prompt([
      {
        type: "confirm",
        name: "createNewProject",
        message: `O projeto "${project}" não existe no GitHub. Deseja criá-lo?`,
        default: true,
      },
    ]);

    if (createNewProject) {
      const projectId = await createProject(project);
      if (!projectId) {
        console.log("⚠️ Não foi possível criar o projeto. A task será criada sem projeto.");
        finalProject = "";
      }
    } else {
      console.log("⚠️ A task será criada sem projeto.");
      finalProject = "";
    }
  }

  const slug = title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");
  const id = Date.now();
  const task = { id, title, description, milestone: finalMilestone, project: finalProject, status: "todo" };

  await saveJson(path.join(".task/issues", `${id}-${slug}.json`), task);

  console.log("✅ Task criada!");
}
