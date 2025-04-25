import fs from "fs-extra";
import inquirer from "inquirer";
import path from "path";
import { generateTasksFromInstructions, readTemplate, TaskTemplate } from "../utils/openai.js";
import { getNextSequentialId, saveJson } from "../utils/storage.js";

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
  if (template.project) {
    console.log(`🔍 Projeto definido no template: "${template.project}"`);
  } else {
    console.log(`⚠️ Nenhum projeto definido no template. As tarefas receberão projetos variados.`);
  }
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
    if (template.project) {
      console.log(`📊 Todas as tarefas estão associadas ao projeto "${template.project}"`);
    }

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
        console.log(`🔺 Prioridade: ${task.priority}`);

        // Exibir dependências
        if (task.dependencies && task.dependencies.length > 0) {
          console.log(`🔗 Dependências: ${task.dependencies.join(", ")}`);
        } else {
          console.log(`🔗 Dependências: Nenhuma`);
        }

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

  console.log(`Salvando ${tasks.length} tarefas no diretório: ${issuesDir}`);

  // Primeiro, criar um mapeamento de índices para IDs reais
  const indexToIdMap = new Map<number, number>();

  // Gerar IDs sequenciais para todas as tarefas - UM POR UM em vez de em paralelo
  // para garantir que cada ID seja único e incremental
  const taskIds: number[] = [];
  for (let i = 0; i < tasks.length; i++) {
    // Obter ID sequencial - aguarda cada ID antes de obter o próximo
    const id = await getNextSequentialId();
    taskIds.push(id);
    indexToIdMap.set(i + 1, id); // Mapear índice (começando em 1) para o ID sequencial
  }

  const tasksWithIds = tasks.map((task, index) => {
    return { ...task, id: taskIds[index] };
  });

  const savePromises = tasksWithIds.map(async (task, index) => {
    const slug = task.title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "");

    // Converter as dependências de índices para IDs reais
    const realDependencies = task.dependencies
      ? (task.dependencies.map((depIndex) => indexToIdMap.get(depIndex)).filter((id) => id !== undefined) as number[])
      : [];

    const taskData = {
      id: task.id,
      title: task.title,
      description: task.description,
      milestone: task.milestone,
      project: task.project,
      status: task.status || "todo",
      priority: task.priority || "média",
      dependencies: realDependencies,
      lastSyncAt: new Date().toISOString(),
    };

    const filePath = path.join(issuesDir, `${task.id}-${slug}.json`);
    console.log(
      `Tarefa ${index + 1}: Salvando com ID #${task.id} (${filePath}), projeto: ${taskData.project}, prioridade: ${
        taskData.priority
      }`
    );

    await saveJson(filePath, taskData);
    return taskData;
  });

  return Promise.all(savePromises);
}
