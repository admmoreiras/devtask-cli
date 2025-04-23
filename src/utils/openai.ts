import dotenv from "dotenv";
import fs from "fs-extra";
import OpenAI from "openai";
import path from "path";

dotenv.config();

// Interface para a estrutura de uma task
export interface TaskTemplate {
  title: string;
  description: string;
  milestone: string;
  project: string;
  status: string;
}

// Interface para a estrutura do template com instruções
export interface Template {
  name: string;
  description: string;
  instructions: string;
  project?: string; // Projeto padrão para todas as tarefas
  tasks?: TaskTemplate[];
}

// Cliente OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Verifica se a API Key da OpenAI existe
export function checkOpenAIApiKey(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// Lê o template especificado
export async function readTemplate(templateName: string = "default"): Promise<Template | null> {
  try {
    const templatePath = path.join(".task", "templates", `${templateName}.json`);
    if (await fs.pathExists(templatePath)) {
      return await fs.readJSON(templatePath);
    }
    return null;
  } catch (error) {
    console.error("Erro ao ler template:", error);
    return null;
  }
}

// Salva um template
export async function saveTemplate(template: Template, templateName: string = "default"): Promise<boolean> {
  try {
    const templatePath = path.join(".task", "templates", `${templateName}.json`);
    await fs.ensureDir(path.dirname(templatePath));

    console.log("Salvando template com os seguintes dados:");
    console.log(JSON.stringify(template, null, 2));

    await fs.writeJSON(templatePath, template, { spaces: 2 });

    // Verificar se foi salvo corretamente
    if (await fs.pathExists(templatePath)) {
      const savedTemplate = await fs.readJSON(templatePath);
      console.log("Template salvo verificado:");
      console.log(JSON.stringify(savedTemplate, null, 2));
      return true;
    }
    return false;
  } catch (error) {
    console.error("Erro ao salvar template:", error);
    return false;
  }
}

// Gera tasks a partir de instruções usando a OpenAI
export async function generateTasksFromInstructions(template: Template): Promise<TaskTemplate[]> {
  if (!checkOpenAIApiKey()) {
    throw new Error("OPENAI_API_KEY não encontrada. Configure-a no arquivo .env");
  }

  try {
    const promptContent = template.project
      ? `Com base nas seguintes instruções de projeto, crie uma lista estruturada de tarefas. Cada tarefa deve ter um título claro, descrição detalhada, e ser associada ao projeto "${template.project}" e milestone/sprint apropriados:\n\n${template.instructions}\n\nRetorne a resposta como um array JSON com objetos no seguinte formato: { "title": "string", "description": "string", "project": "${template.project}", "milestone": "string", "status": "todo" }`
      : `Com base nas seguintes instruções de projeto, crie uma lista estruturada de tarefas. Cada tarefa deve ter um título claro, descrição detalhada, e ser associada a um projeto/componente e milestone/sprint apropriados:\n\n${template.instructions}\n\nRetorne a resposta como um array JSON com objetos no seguinte formato: { "title": "string", "description": "string", "project": "string", "milestone": "string", "status": "todo" }`;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: "Você é um assistente especializado em quebrar projetos em tarefas menores e bem definidas.",
        },
        {
          role: "user",
          content: promptContent,
        },
      ],
      temperature: 0.7,
      max_tokens: 2500,
    });

    const assistantResponse = response.choices[0].message.content || "";

    // Extrai o JSON da resposta
    const jsonMatch = assistantResponse.match(/\[\s*\{.*\}\s*\]/s);
    if (!jsonMatch) {
      throw new Error("Formato de resposta inválido da API");
    }

    const parsedTasks = JSON.parse(jsonMatch[0]) as TaskTemplate[];

    // Garante que todas as tarefas tenham o projeto correto, se definido no template
    if (template.project) {
      console.log(`Forçando todas as tarefas a usarem o projeto: "${template.project}"`);
      parsedTasks.forEach((task) => {
        const projetoAnterior = task.project;
        task.project = template.project!;
        console.log(`Tarefa "${task.title}": projeto alterado de "${projetoAnterior}" para "${task.project}"`);
      });
    }

    return parsedTasks;
  } catch (error) {
    console.error("Erro ao gerar tarefas com IA:", error);
    throw error;
  }
}
