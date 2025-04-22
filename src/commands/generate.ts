import fs from "fs-extra";
import inquirer from "inquirer";
import path from "path";
import { generateTasksFromInstructions, readTemplate, TaskTemplate } from "../utils/openai.js";
import { saveJson } from "../utils/storage.js";

export async function generateTasks() {
  // Verificar templates disponíveis
  const templatesDir = path.join(".task", "templates");
  await fs.ensureDir(templatesDir);

  const files = await fs.readdir(templatesDir);
  const templates = files.filter((file) => file.endsWith(".json")).map((file) => path.basename(file, ".json"));

  if (templates.length === 0) {
    console.log("❌ Nenhum template encontrado.");
    console.log("Execute 'devtask init' para criar um template primeiro.");
    return;
  }

  // Selecionar template
  const { selectedTemplate } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedTemplate",
      message: "Selecione o template para gerar tarefas:",
      choices: templates,
    },
  ]);

  const template = await readTemplate(selectedTemplate);
  if (!template) {
    console.error(`❌ Erro ao ler o template '${selectedTemplate}'.`);
    return;
  }

  console.log(`📝 Gerando tarefas a partir do template '${template.name}'...`);
  console.log("🤖 Aguarde enquanto a IA processa as instruções...");

  try {
    // Gerar tarefas usando a IA
    const tasks = await generateTasksFromInstructions(template);

    // Verificar se tasks foram geradas
    if (!tasks || tasks.length === 0) {
      console.error("❌ Não foi possível gerar tarefas a partir das instruções fornecidas.");
      return;
    }

    // Confirmar geração
    console.log(`✅ ${tasks.length} tarefas geradas!`);

    const { showTasks } = await inquirer.prompt([
      {
        type: "confirm",
        name: "showTasks",
        message: "Deseja ver as tarefas geradas?",
        default: true,
      },
    ]);

    if (showTasks) {
      tasks.forEach((task, index) => {
        console.log(`\n--- Tarefa ${index + 1} ---`);
        console.log(`📌 Título: ${task.title}`);
        console.log(`📋 Projeto: ${task.project}`);
        console.log(`🏁 Milestone: ${task.milestone}`);
        console.log(`📝 Descrição: ${task.description.substring(0, 100)}${task.description.length > 100 ? "..." : ""}`);
      });
    }

    const { confirmSave } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmSave",
        message: "Deseja salvar estas tarefas?",
        default: true,
      },
    ]);

    if (confirmSave) {
      await saveTasks(tasks);
      console.log(`✅ ${tasks.length} tarefas salvas com sucesso!`);
      console.log("Use 'devtask list' para ver as tarefas criadas.");
      console.log("Use 'devtask sync' para sincronizar com o GitHub.");
    } else {
      console.log("⚠️ Operação cancelada. As tarefas não foram salvas.");
    }
  } catch (error) {
    console.error("❌ Erro ao gerar tarefas:", error);
  }
}

// Função para salvar as tarefas geradas
async function saveTasks(tasks: TaskTemplate[]) {
  const issuesDir = path.join(".task", "issues");
  await fs.ensureDir(issuesDir);

  const savePromises = tasks.map(async (task) => {
    const slug = task.title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "");

    const id = Date.now() + Math.floor(Math.random() * 1000); // Garante IDs únicos mesmo se criados ao mesmo tempo
    const taskData = {
      id,
      title: task.title,
      description: task.description,
      milestone: task.milestone,
      project: task.project,
      status: task.status || "todo",
      lastSyncAt: new Date().toISOString(),
    };

    await saveJson(path.join(issuesDir, `${id}-${slug}.json`), taskData);
    return taskData;
  });

  return Promise.all(savePromises);
}
