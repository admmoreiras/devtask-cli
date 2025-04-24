import fs from "fs-extra";
import path from "path";
import { Task } from "./types.js";

// Obter o nome do arquivo da task
export function getTaskFilename(task: Task): string {
  // Criar slug do título para o nome do arquivo
  const titleSlug = task.title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");

  // Formato: #ISSUE-ID-TITULO.json ou ID-TITULO.json se não tiver issue
  if (task.github_issue_number) {
    return `#${task.github_issue_number}-${task.id}-${titleSlug}.json`;
  } else {
    return `${task.id}-${titleSlug}.json`;
  }
}

// Atualizar task com informações do GitHub
export async function updateTaskWithGitHubInfo(task: Task, issueNumber: number): Promise<void> {
  try {
    console.log(`\n🔄 Atualizando task #${task.id} com informações da issue #${issueNumber}...`);

    task.github_issue_number = issueNumber;
    task.synced = true;
    task.lastSyncAt = new Date().toISOString();

    // Salvar a task atualizada
    const taskDir = path.join(process.cwd(), ".task/issues");
    await fs.ensureDir(taskDir);

    const taskFile = path.join(taskDir, getTaskFilename(task));
    await fs.writeJSON(taskFile, task, { spaces: 2 });

    console.log(`✅ Task #${task.id} atualizada com sucesso: ${taskFile}`);
  } catch (error) {
    console.error("❌ Erro ao atualizar task com informações do GitHub:", error);
  }
}

// Atualizar task local a partir de issue do GitHub
export async function updateLocalTaskFromIssue(task: Task, issue: any): Promise<boolean> {
  try {
    console.log(`\n🔄 Atualizando task local #${task.id} a partir da issue #${issue.number}...`);

    // Atualizar título se for diferente
    if (task.title !== issue.title) {
      console.log(`📝 Atualizando título: "${task.title}" → "${issue.title}"`);
      task.title = issue.title;
    }

    // Extrair campos da descrição
    let newStatus = task.status;
    let newProject = task.project;
    let newMilestone = task.milestone;

    // Extrair status
    const statusMatch = issue.body.match(/\*\*Status:\*\*\s*([^\n]+)/);
    if (statusMatch && statusMatch[1]) {
      newStatus = statusMatch[1].trim();
    }

    // Extrair projeto
    const projectMatch = issue.body.match(/\*\*Projeto:\*\*\s*([^\n]+)/);
    if (projectMatch && projectMatch[1]) {
      newProject = projectMatch[1].trim();
    }

    // Extrair milestone
    const milestoneMatch = issue.body.match(/\*\*Milestone:\*\*\s*([^\n]+)/);
    if (milestoneMatch && milestoneMatch[1]) {
      newMilestone = milestoneMatch[1].trim();
    }

    // Se a issue tem milestone atribuída, usar essa informação
    if (issue.milestone && issue.milestone.title) {
      newMilestone = issue.milestone.title;
    }

    // Atualizar campos se forem diferentes
    if (task.status !== newStatus) {
      console.log(`📝 Atualizando status: "${task.status}" → "${newStatus}"`);
      task.status = newStatus;
    }

    if (task.project !== newProject) {
      console.log(`📝 Atualizando projeto: "${task.project}" → "${newProject}"`);
      task.project = newProject;
    }

    if (task.milestone !== newMilestone) {
      console.log(`📝 Atualizando milestone: "${task.milestone}" → "${newMilestone}"`);
      task.milestone = newMilestone;
    }

    // Atualizar estado da issue (aberto/fechado)
    task.state = issue.state;

    // Limpar descrição da task para extrair apenas o conteúdo real
    let newDescription = issue.body;

    // Remover a seção de metadados
    const metadataIndex = newDescription.indexOf("\n\n---\n");
    if (metadataIndex !== -1) {
      newDescription = newDescription.substring(0, metadataIndex).trim();
    }

    // Atualizar descrição se for diferente
    if (task.description !== newDescription) {
      console.log(`📝 Atualizando descrição da task`);
      task.description = newDescription;
    }

    // Atualizar data de sincronização
    task.lastSyncAt = new Date().toISOString();

    // Salvar a task atualizada
    const taskDir = path.join(process.cwd(), ".task/issues");
    await fs.ensureDir(taskDir);

    const taskFile = path.join(taskDir, getTaskFilename(task));
    await fs.writeJSON(taskFile, task, { spaces: 2 });

    console.log(`✅ Task #${task.id} atualizada com sucesso a partir da issue #${issue.number}`);
    return true;
  } catch (error) {
    console.error("❌ Erro ao atualizar task local:", error);
    return false;
  }
}

// Criar nova task local a partir de issue
export async function createLocalTaskFromIssue(issue: any): Promise<void> {
  try {
    console.log(`\n🔄 Criando task local a partir da issue #${issue.number}...`);

    // Verificar se task já existe
    const taskDir = path.join(process.cwd(), ".task/issues");
    await fs.ensureDir(taskDir);

    // Verificar todos os arquivos para encontrar uma task com este número de issue
    const taskFiles = await fs.readdir(taskDir);
    for (const file of taskFiles) {
      if (file.includes(`#${issue.number}-`)) {
        try {
          const taskData = await fs.readJSON(path.join(taskDir, file));
          if (taskData.github_issue_number === issue.number) {
            console.log(`⚠️ Task para issue #${issue.number} já existe: ${file}`);
            // Atualizar a task existente
            await updateLocalTaskFromIssue(taskData, issue);
            return;
          }
        } catch (error) {
          console.error(`❌ Erro ao ler arquivo de task ${file}:`, error);
        }
      }
    }

    // Criar ID único baseado no timestamp
    const id = Date.now();

    // Extrair informações da issue
    let status = "todo";
    let project = "";
    let milestone = "";

    // Extrair status
    const statusMatch = issue.body?.match(/\*\*Status:\*\*\s*([^\n]+)/);
    if (statusMatch && statusMatch[1]) {
      status = statusMatch[1].trim();
    }

    // Extrair projeto
    const projectMatch = issue.body?.match(/\*\*Projeto:\*\*\s*([^\n]+)/);
    if (projectMatch && projectMatch[1]) {
      project = projectMatch[1].trim();
    }

    // Extrair milestone
    if (issue.milestone && issue.milestone.title) {
      milestone = issue.milestone.title;
    } else {
      const milestoneMatch = issue.body?.match(/\*\*Milestone:\*\*\s*([^\n]+)/);
      if (milestoneMatch && milestoneMatch[1]) {
        milestone = milestoneMatch[1].trim();
      }
    }

    // Limpar descrição da task para extrair apenas o conteúdo real
    let description = issue.body || "";

    // Remover a seção de metadados
    const metadataIndex = description.indexOf("\n\n---\n");
    if (metadataIndex !== -1) {
      description = description.substring(0, metadataIndex).trim();
    }

    // Criar nova task
    const newTask: Task = {
      id,
      title: issue.title,
      description,
      status,
      project,
      milestone,
      synced: true,
      github_issue_number: issue.number,
      state: issue.state,
      lastSyncAt: new Date().toISOString(),
    };

    // Salvar nova task
    const newTaskFile = path.join(taskDir, getTaskFilename(newTask));
    await fs.writeJSON(newTaskFile, newTask, { spaces: 2 });

    console.log(`✅ Task criada com sucesso: ${newTaskFile}`);
  } catch (error) {
    console.error("❌ Erro ao criar task a partir da issue:", error);
  }
}

export default {
  getTaskFilename,
  updateTaskWithGitHubInfo,
  updateLocalTaskFromIssue,
  createLocalTaskFromIssue,
};
