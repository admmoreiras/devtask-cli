import fs from "fs-extra";
import inquirer from "inquirer";
import path from "path";
import { Template, readTemplate, saveTemplate } from "../utils/openai.js";

// Template de exemplo com instruções e formato ideal
const TEMPLATE_EXEMPLO = `# Nome do Projeto

SUBSTITUA ESTE TEXTO pela descrição geral do seu projeto. Explique o que o sistema deve fazer, 
seu propósito e contexto. Quanto mais detalhada for a descrição, melhor será o resultado da IA.

## Tecnologias
- Frontend: React, TypeScript, TailwindCSS (substitua pelas tecnologias do seu projeto)
- Backend: Node.js, Express, MongoDB (substitua pelas tecnologias do seu projeto)
- Outras ferramentas: Docker, Jest, etc.

## Requisitos Funcionais
1. Autenticação de usuários (registro, login, recuperação de senha)
2. CRUD de entidades principais (detalhe quais são)
3. Listagem com filtros e ordenação
4. Relatórios e estatísticas
5. Integração com serviços externos (especifique quais)

## Milestones/Sprints
- Sprint 1: Setup inicial e autenticação
- Sprint 2: Funcionalidades básicas (CRUDs)
- Sprint 3: Funcionalidades avançadas
- Sprint 4: UI/UX e refinamentos

## Critérios de Aceite
- Responsividade em dispositivos móveis e desktop
- Testes unitários e de integração
- CI/CD configurado
- Documentação da API

IMPORTANTE: Substitua todas as informações acima pelas especificações reais do seu projeto. 
Quanto mais detalhado for este documento, melhores serão as tarefas geradas pela IA.`;

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

  // Coletar ou editar a descrição do template
  const { description } = await inquirer.prompt([
    {
      type: "input",
      name: "description",
      message: "Descrição do template:",
      default: template.description,
    },
  ]);

  // Atualizar a descrição do template
  template.description = description;

  // Para criar novo template ou resetar existente, usar o exemplo
  if (action === "create" || !template.instructions) {
    template.instructions = TEMPLATE_EXEMPLO;
  }

  // Salvar o template
  const success = await saveTemplate(template, templateName);

  if (success) {
    // Criar arquivo temporário com as instruções para edição
    const instructionsFile = path.join(".task", "templates", `${templateName}-instructions.md`);
    await fs.writeFile(instructionsFile, template.instructions);

    console.log(`✅ Template ${action === "create" ? "criado" : "atualizado"} com sucesso!`);
    console.log(`\n📝 Um arquivo com instruções de exemplo foi criado em:`);
    console.log(`   ${instructionsFile}`);
    console.log(`\n⚠️  IMPORTANTE: Edite este arquivo com as instruções do seu projeto,`);
    console.log(`   depois use o comando abaixo para atualizar o template com suas instruções:`);
    console.log(`\n   npm run dev -- update-template ${templateName}`);
    console.log(`\n   Após atualizar o template, use o comando abaixo para gerar tarefas:`);
    console.log(`   npm run dev -- generate ${templateName !== "default" ? templateName : ""}`);
  } else {
    console.error(`❌ Erro ao ${action === "create" ? "criar" : "atualizar"} o template.`);
  }
}
