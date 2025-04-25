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
  priority: string; // Prioridade da tarefa
  dependencies: number[]; // IDs das tarefas que esta tarefa depende
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
      ? `Com base nas seguintes instruções de projeto, crie uma lista estruturada de tarefas. Cada tarefa deve ter um título claro, descrição detalhada, e ser associada ao projeto "${template.project}" e milestone/sprint apropriados.

Avalie e atribua uma prioridade para cada tarefa com base na complexidade do desenvolvimento:
- "alta": para tarefas complexas e cruciais para o funcionamento do sistema
- "média": para tarefas de complexidade moderada
- "baixa": para tarefas simples e de menor impacto

Identifique dependências entre as tarefas. Uma tarefa depende de outra quando só pode ser iniciada após a conclusão da tarefa dependente. Liste as dependências pelo número de índice da tarefa (começando em 1, sendo a primeira tarefa o índice 1).

Instruções:
${template.instructions}

IMPORTANTE: Retorne apenas um objeto JSON com a seguinte estrutura:
{
  "tasks": [
    {
      "title": "string",
      "description": "string",
      "project": "${template.project}",
      "milestone": "string",
      "status": "todo",
      "priority": "alta|média|baixa",
      "dependencies": [1, 2, 3]
    },
    ...mais tarefas...
  ]
}`
      : `Com base nas seguintes instruções de projeto, crie uma lista estruturada de tarefas. Cada tarefa deve ter um título claro, descrição detalhada, e ser associada a um projeto/componente e milestone/sprint apropriados.

Avalie e atribua uma prioridade para cada tarefa com base na complexidade do desenvolvimento:
- "alta": para tarefas complexas e cruciais para o funcionamento do sistema
- "média": para tarefas de complexidade moderada 
- "baixa": para tarefas simples e de menor impacto

Identifique dependências entre as tarefas. Uma tarefa depende de outra quando só pode ser iniciada após a conclusão da tarefa dependente. Liste as dependências pelo número de índice da tarefa (começando em 1, sendo a primeira tarefa o índice 1).

Instruções:
${template.instructions}

IMPORTANTE: Retorne apenas um objeto JSON com a seguinte estrutura:
{
  "tasks": [
    {
      "title": "string",
      "description": "string",
      "project": "string",
      "milestone": "string",
      "status": "todo",
      "priority": "alta|média|baixa",
      "dependencies": [1, 2, 3]
    },
    ...mais tarefas...
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content:
            "Você é um assistente especializado em quebrar projetos em tarefas menores e bem definidas, identificando prioridades e dependências entre elas. SEMPRE RESPONDA APENAS COM JSON VÁLIDO, sem texto adicional.",
        },
        {
          role: "user",
          content: promptContent,
        },
      ],
      temperature: 0.3, // Temperatura mais baixa para respostas mais determinísticas
      response_format: { type: "json_object" }, // Força a resposta a ser um objeto JSON
      max_tokens: 3000,
    });

    const assistantResponse = response.choices[0].message.content || "";
    console.log("Resposta da API:");
    console.log(assistantResponse);

    // Tenta extrair o JSON da resposta usando diferentes abordagens
    let parsedTasks: TaskTemplate[] = [];
    try {
      // Quando usamos response_format: { type: "json_object" }, a API pode retornar um objeto que contém o array
      let jsonData;
      try {
        jsonData = JSON.parse(assistantResponse);

        // Verificar se a resposta é um objeto que contém o array de tarefas
        if (jsonData && typeof jsonData === "object") {
          // Caso 1: resposta é diretamente um array
          if (Array.isArray(jsonData)) {
            parsedTasks = jsonData as TaskTemplate[];
          }
          // Caso 2: resposta é um objeto que contém uma propriedade com o array
          else {
            let foundArray = false;
            // Procurar por uma propriedade que contenha um array
            for (const key in jsonData) {
              if (Array.isArray(jsonData[key])) {
                parsedTasks = jsonData[key] as TaskTemplate[];
                foundArray = true;
                break;
              }
            }

            // Se não encontrou um array em nenhuma propriedade
            if (!foundArray) {
              // Último recurso: colocar todas as propriedades em um array
              if (jsonData.title) {
                parsedTasks = [jsonData as unknown as TaskTemplate];
              } else {
                throw new Error("Não foi possível encontrar um array de tarefas na resposta");
              }
            }
          }
        } else {
          throw new Error("A resposta não é um objeto JSON válido");
        }
      } catch (jsonError) {
        // Se não conseguir fazer o parse como JSON diretamente, tenta outros métodos

        // Abordagem 1: Tenta extrair o array JSON diretamente
        if (assistantResponse.includes("[") && assistantResponse.includes("]")) {
          // Tenta encontrar o array JSON usando regex mais robusto
          const jsonMatch = assistantResponse.match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (jsonMatch) {
            parsedTasks = JSON.parse(jsonMatch[0]) as TaskTemplate[];
          } else {
            // Abordagem 2: Tenta extrair de dentro de blocos de código markdown
            const codeBlockMatch = assistantResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch) {
              const codeContent = codeBlockMatch[1].trim();
              parsedTasks = JSON.parse(codeContent) as TaskTemplate[];
            } else {
              // Abordagem 3: Tenta extrair qualquer conteúdo entre colchetes
              const arrayMatch = assistantResponse.match(/\[([\s\S]*?)\]/);
              if (arrayMatch) {
                parsedTasks = JSON.parse(arrayMatch[0]) as TaskTemplate[];
              } else {
                throw new Error("Não foi possível identificar um array JSON válido na resposta");
              }
            }
          }
        } else {
          throw new Error("A resposta não contém um array JSON");
        }
      }
    } catch (error) {
      console.error("Erro ao processar a resposta JSON:", error);
      console.error("Resposta completa da API:", assistantResponse);

      // Tentar limpar a resposta e tentar novamente como último recurso
      try {
        // Remover todos os caracteres que não são JSON válidos
        const cleanedResponse = assistantResponse.replace(/[^\[\]\{\}",:.\w\s-]/g, "");
        // Encontrar o primeiro '[' e o último ']'
        const startIdx = cleanedResponse.indexOf("[");
        const endIdx = cleanedResponse.lastIndexOf("]") + 1;

        if (startIdx >= 0 && endIdx > startIdx) {
          const jsonStr = cleanedResponse.substring(startIdx, endIdx);
          parsedTasks = JSON.parse(jsonStr) as TaskTemplate[];
          console.log("Recuperação de emergência do JSON bem-sucedida");
        } else {
          throw new Error("Falha na recuperação de emergência do JSON");
        }
      } catch (secondError) {
        console.error("Falha na tentativa de recuperação do JSON:", secondError);
        throw new Error(
          "Não foi possível extrair um JSON válido da resposta da API. Tente novamente ou revise as instruções do template."
        );
      }
    }

    // Garante que todas as tarefas tenham o projeto correto, se definido no template
    if (template.project) {
      console.log(`Forçando todas as tarefas a usarem o projeto: "${template.project}"`);
      parsedTasks.forEach((task) => {
        const projetoAnterior = task.project;
        task.project = template.project!;
        console.log(`Tarefa "${task.title}": projeto alterado de "${projetoAnterior}" para "${task.project}"`);
      });
    }

    // Validar e corrigir tarefas
    console.log("Validando e corrigindo tarefas...");
    parsedTasks = parsedTasks.map((task, index) => {
      // Garante que todos os campos obrigatórios existam
      if (!task.title) task.title = `Tarefa ${index + 1}`;
      if (!task.description) task.description = `Descrição da tarefa ${index + 1}`;
      if (!task.milestone) task.milestone = "Indefinido";
      if (!task.project) task.project = template.project || "Geral";
      if (!task.status) task.status = "todo";

      // Normaliza a prioridade
      if (!task.priority) {
        task.priority = "média";
      } else {
        // Normaliza para o formato esperado (acentuação correta)
        const prioridadeLower = task.priority.toLowerCase();
        if (prioridadeLower.includes("alt")) task.priority = "alta";
        else if (prioridadeLower.includes("med") || prioridadeLower.includes("méd")) task.priority = "média";
        else if (prioridadeLower.includes("baix")) task.priority = "baixa";
        else task.priority = "média"; // valor padrão
      }

      // Inicializa dependencies se não existir
      if (!task.dependencies) task.dependencies = [];

      // Garante que dependencies seja um array válido
      if (!Array.isArray(task.dependencies)) {
        console.warn(`Dependências inválidas para tarefa "${task.title}". Convertendo para array vazio.`);
        task.dependencies = [];
      }

      // Valida cada dependência (deve ser um número)
      task.dependencies = task.dependencies.filter((dep) => {
        const isValid = Number.isInteger(dep) && dep > 0;
        if (!isValid) {
          console.warn(`Dependência inválida '${dep}' na tarefa "${task.title}". Removendo.`);
        }
        return isValid;
      });

      console.log(
        `Tarefa validada: "${task.title}" (Prioridade: ${task.priority}, Dependências: ${task.dependencies.length})`
      );
      return task;
    });

    return parsedTasks;
  } catch (error) {
    console.error("Erro ao gerar tarefas com IA:", error);
    throw error;
  }
}
