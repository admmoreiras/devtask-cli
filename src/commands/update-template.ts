import fs from "fs-extra";
import path from "path";
import { readTemplate, saveTemplate } from "../utils/openai.js";

export async function updateTemplate(templateName = "default") {
  try {
    // Verificar se o template existe
    const template = await readTemplate(templateName);
    if (!template) {
      console.error(`❌ Template "${templateName}" não encontrado.`);
      console.log(`Execute 'npm run dev -- init' para criar um novo template.`);
      return;
    }

    // Caminho do arquivo de instruções
    const instructionsFile = path.join(".task", "templates", `${templateName}-instructions.md`);

    // Verificar se o arquivo de instruções existe
    if (!(await fs.pathExists(instructionsFile))) {
      console.error(`❌ Arquivo de instruções não encontrado: ${instructionsFile}`);
      console.log(`Execute 'npm run dev -- init' para criar um novo template com instruções.`);
      return;
    }

    // Ler o conteúdo do arquivo de instruções
    const instructions = await fs.readFile(instructionsFile, "utf8");

    // Atualizar o template com as novas instruções
    template.instructions = instructions;

    // Salvar o template atualizado
    const success = await saveTemplate(template, templateName);

    if (success) {
      console.log(`✅ Template "${templateName}" atualizado com sucesso!`);
      console.log(`\nAs instruções foram atualizadas a partir do arquivo:`);
      console.log(`   ${instructionsFile}`);
      console.log(`\nPara gerar tarefas usando este template, execute:`);
      console.log(`   npm run dev -- generate ${templateName !== "default" ? templateName : ""}`);
    } else {
      console.error(`❌ Erro ao atualizar o template "${templateName}".`);
    }
  } catch (error) {
    console.error(`❌ Erro ao processar o template:`, error);
  }
}
