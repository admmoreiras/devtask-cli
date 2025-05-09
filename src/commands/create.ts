import inquirer from "inquirer";
import path from "path";
import github from "../utils/github/index.js";
import { getNextSequentialId, saveJson } from "../utils/storage.js";

export async function createTask() {
  // Buscar milestones e projetos existentes para verificação
  const milestones = await github.fetchMilestones();
  const projects = await github.fetchProjects();

  // Preparar lista de projetos para seleção
  const projectChoices = Array.from(projects.keys()).map((name: string) => ({
    name: name.startsWith("@") ? name.substring(1) : name, // Exibe sem @ na lista
    value: name, // Mantém o valor original para referência
  }));

  // Adicionar opção para criar novo projeto
  projectChoices.unshift({
    name: "➕ Criar novo projeto",
    value: "new_project",
  });

  // Preparar lista de milestones para seleção
  const milestoneChoices = Array.from(milestones.keys()).map((name: string) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1), // Capitalize o nome da milestone
    value: name,
  }));

  // Adicionar opção para criar nova milestone
  milestoneChoices.unshift({
    name: "➕ Criar nova milestone/sprint",
    value: "new_milestone",
  });

  // Adicionar opção para não usar milestone
  milestoneChoices.push({
    name: "Nenhuma milestone",
    value: "",
  });

  const { title, description, milestoneChoice, projectChoice } = await inquirer.prompt([
    { type: "input", name: "title", message: "Título da task:" },
    { type: "input", name: "description", message: "Descrição:" },
    {
      type: "list",
      name: "milestoneChoice",
      message: "Selecione a milestone/sprint:",
      choices: milestoneChoices,
      pageSize: 10, // Mostra até 10 milestones na lista
    },
    {
      type: "list",
      name: "projectChoice",
      message: "Selecione o projeto:",
      choices: projectChoices,
      pageSize: 10, // Mostra até 10 projetos na lista
    },
  ]);

  // Lidar com o caso de criar novo projeto
  let finalProject = "";
  let projectId = null;

  if (projectChoice === "new_project") {
    const { newProjectName } = await inquirer.prompt([
      { type: "input", name: "newProjectName", message: "Nome do novo projeto:" },
    ]);

    if (newProjectName && newProjectName.trim() !== "") {
      projectId = await github.createProject(newProjectName);
      if (projectId) {
        finalProject = newProjectName;
      } else {
        console.log("⚠️ Não foi possível criar o projeto. A task será criada sem projeto.");
      }
    }
  } else {
    finalProject = projectChoice;
    projectId = projects.get(projectChoice);
  }

  // Lidar com o caso de criar nova milestone
  let finalMilestone = "";
  if (milestoneChoice === "new_milestone") {
    const { newMilestoneName } = await inquirer.prompt([
      { type: "input", name: "newMilestoneName", message: "Nome da nova milestone/sprint:" },
    ]);

    if (newMilestoneName && newMilestoneName.trim() !== "") {
      const milestoneId = await github.createMilestone(newMilestoneName);
      if (milestoneId) {
        finalMilestone = newMilestoneName;
      } else {
        console.log("⚠️ Não foi possível criar a milestone. A task será criada sem milestone.");
      }
    }
  } else {
    finalMilestone = milestoneChoice;
  }

  // Obter opções de status do projeto
  let statusChoices = ["todo", "in progress", "done", "blocked"];

  if (projectId) {
    try {
      const projectStatusOptions = await github.fetchProjectStatusOptions(projectId);
      if (projectStatusOptions && projectStatusOptions.length > 0) {
        statusChoices = projectStatusOptions;
      }
    } catch (error) {
      // Silenciar erro, usar opções padrão
    }
  }

  // Perguntar qual o status inicial da task
  const { status } = await inquirer.prompt([
    {
      type: "list",
      name: "status",
      message: "Status inicial da task:",
      choices: statusChoices,
      default: "todo",
    },
  ]);

  const slug = title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");

  // Usar ID sequencial em vez de timestamp
  const id = await getNextSequentialId();

  const task = {
    id,
    title,
    description,
    milestone: finalMilestone,
    project: finalProject,
    status,
    lastSyncAt: new Date().toISOString(),
  };

  await saveJson(path.join(".task/issues", `${id}-${slug}.json`), task);

  console.log(`✅ Task criada com ID #${id}!`);
}
