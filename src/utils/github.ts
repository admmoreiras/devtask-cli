import dotenv from "dotenv";
import fs from "fs-extra";
import { Octokit } from "octokit";
import path from "path";

// Carregar variáveis de ambiente
dotenv.config();

// Verificar variáveis obrigatórias
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const GITHUB_OWNER = process.env.GITHUB_OWNER || "";
const GITHUB_REPO = process.env.GITHUB_REPO || "";

if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  console.error("Erro: Configure as variáveis de ambiente no arquivo .env");
  console.error("GITHUB_TOKEN, GITHUB_OWNER e GITHUB_REPO são obrigatórias");
  process.exit(1);
}

// Inicializar Octokit com o token
const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

// Interface para tasks
export interface Task {
  id: number;
  title: string;
  description: string;
  milestone: string;
  project: string;
  status: string;
  synced?: boolean;
  github_issue_number?: number;
}

// Função para criar issue no GitHub
export async function createGitHubIssue(task: Task): Promise<number | null> {
  try {
    const response = await octokit.rest.issues.create({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      title: task.title,
      body: task.description,
    });

    console.log(`✅ Issue criada no GitHub: #${response.data.number}`);
    return response.data.number;
  } catch (error) {
    console.error(`❌ Erro ao criar issue para "${task.title}":`, error);
    return null;
  }
}

// Função para buscar issues do GitHub
export async function fetchGitHubIssues(): Promise<any[]> {
  try {
    const response = await octokit.rest.issues.listForRepo({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      state: "all",
    });

    return response.data;
  } catch (error) {
    console.error("❌ Erro ao buscar issues do GitHub:", error);
    return [];
  }
}

// Função para atualizar task local com informações do GitHub
export async function updateTaskWithGitHubInfo(task: Task, issueNumber: number): Promise<void> {
  try {
    const taskPath = path.join(
      ".task/issues",
      `${task.id}-${task.title
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]/g, "")}.json`
    );

    // Atualizar propriedades
    task.synced = true;
    task.github_issue_number = issueNumber;

    // Salvar no arquivo
    await fs.writeJSON(taskPath, task, { spaces: 2 });
  } catch (error) {
    console.error(`❌ Erro ao atualizar task local "${task.title}":`, error);
  }
}

// Função para criar task local a partir de issue do GitHub
export async function createLocalTaskFromIssue(issue: any): Promise<void> {
  try {
    const id = Date.now();
    const slug = issue.title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "");

    const task: Task = {
      id,
      title: issue.title,
      description: issue.body || "",
      milestone: "", // GitHub não fornece milestone diretamente
      project: "", // GitHub não fornece projeto diretamente
      status: issue.state === "open" ? "todo" : "done",
      synced: true,
      github_issue_number: issue.number,
    };

    const taskPath = path.join(".task/issues", `${id}-${slug}.json`);

    // Verificar se já existe uma task com esse número de issue
    const existingTasks = await fs.readdir(path.join(".task/issues"));
    const taskFiles = await Promise.all(existingTasks.map((file) => fs.readJSON(path.join(".task/issues", file))));

    const taskExists = taskFiles.some((t) => (t as Task).github_issue_number === issue.number);

    if (!taskExists) {
      await fs.ensureDir(path.join(".task/issues"));
      await fs.writeJSON(taskPath, task, { spaces: 2 });
      console.log(`✅ Task local criada a partir da issue #${issue.number}`);
    }
  } catch (error) {
    console.error(`❌ Erro ao criar task local a partir da issue #${issue.number}:`, error);
  }
}
