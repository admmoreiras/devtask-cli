import fs from "fs-extra";
import inquirer from "inquirer";
import path from "path";
import { Template, readTemplate, saveTemplate } from "../utils/openai.js";

export async function initTemplate() {
  const templatesDir = path.join(".task", "templates");
  await fs.ensureDir(templatesDir);

  // Verificar templates existentes
  const files = await fs.readdir(templatesDir);
  const templates = files.filter((file) => file.endsWith(".json")).map((file) => path.basename(file, ".json"));

  let action: string;
  let templateName: string;

  // Determinar ação - criar novo ou editar existente
  if (templates.length > 0) {
    templates.unshift("➕ Criar novo template");

    const { selectedAction } = await inquirer.prompt([
      {
        type: "list",
        name: "selectedAction",
        message: "O que você deseja fazer?",
        choices: [
          { name: "Criar novo template", value: "create" },
          { name: "Editar template existente", value: "edit" },
        ],
      },
    ]);

    action = selectedAction;

    if (action === "edit") {
      const { selected } = await inquirer.prompt([
        {
          type: "list",
          name: "selected",
          message: "Selecione o template para editar:",
          choices: templates,
        },
      ]);
      templateName = selected;
    } else {
      const { name } = await inquirer.prompt([
        {
          type: "input",
          name: "name",
          message: "Nome do novo template:",
          validate: (input: string) => {
            if (!input.trim()) return "O nome não pode estar vazio";
            if (templates.includes(input)) return "Este nome já existe";
            return true;
          },
        },
      ]);
      templateName = name;
    }
  } else {
    console.log("Nenhum template encontrado. Vamos criar um novo template.");
    action = "create";

    const { name } = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Nome do template:",
        default: "default",
        validate: (input: string) => (input.trim() ? true : "O nome não pode estar vazio"),
      },
    ]);
    templateName = name;
  }

  // Carregar template existente se estiver editando
  let template: Template = {
    name: templateName,
    description: "",
    instructions: "",
  };

  if (action === "edit") {
    const existingTemplate = await readTemplate(templateName);
    if (existingTemplate) {
      template = existingTemplate;
    }
  }

  // Coletar ou editar informações do template
  const { description, instructions } = await inquirer.prompt([
    {
      type: "input",
      name: "description",
      message: "Descrição do template:",
      default: template.description,
    },
    {
      type: "editor",
      name: "instructions",
      message: "Instruções detalhadas para geração de tarefas (será aberto um editor):",
      default: template.instructions,
    },
  ]);

  // Atualizar o template
  template.description = description;
  template.instructions = instructions;

  // Salvar o template
  const success = await saveTemplate(template, templateName);

  if (success) {
    console.log(`✅ Template ${action === "create" ? "criado" : "atualizado"} com sucesso!`);
    console.log(`Use 'devtask generate ${templateName !== "default" ? templateName : ""}' para gerar tarefas.`);
  } else {
    console.error(`❌ Erro ao ${action === "create" ? "criar" : "atualizar"} o template.`);
  }
}
