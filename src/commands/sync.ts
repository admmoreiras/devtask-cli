import chalk from "chalk";
import fs from "fs-extra";
import inquirer from "inquirer";
import path from "path";
import {
  Task,
  createGitHubIssue,
  createLocalTaskFromIssue,
  fetchGitHubIssues,
  updateTaskWithGitHubInfo,
} from "../utils/github.js";

// Função para sincronizar tarefas locais com GitHub
export async function syncTasks() {
  try {
    // Verificar se existe diretório de tarefas
    const taskDir = path.join(".task/issues");
    await fs.ensureDir(taskDir);

    // Perguntar direção da sincronização
    const { direction } = await inquirer.prompt([
      {
        type: "list",
        name: "direction",
        message: "Qual direção de sincronização?",
        choices: [
          { name: "Local → GitHub (Enviar tasks locais para GitHub)", value: "push" },
          { name: "GitHub → Local (Buscar issues do GitHub)", value: "pull" },
          { name: "Ambos (Sincronização completa)", value: "both" },
        ],
      },
    ]);

    if (direction === "push" || direction === "both") {
      await pushToGitHub();
    }

    if (direction === "pull" || direction === "both") {
      await pullFromGitHub();
    }

    console.log(chalk.green("✅ Sincronização concluída!"));
  } catch (error) {
    console.error(chalk.red("❌ Erro durante a sincronização:"), error);
  }
}

// Função para enviar tarefas locais para o GitHub
async function pushToGitHub() {
  try {
    // Ler todas as tarefas locais
    const taskDir = path.join(".task/issues");
    const files = await fs.readdir(taskDir);

    if (files.length === 0) {
      console.log(chalk.yellow("⚠️ Nenhuma task local encontrada."));
      return;
    }

    console.log(chalk.blue(`🔄 Sincronizando ${files.length} tasks locais com GitHub...`));

    // Processar cada arquivo de task
    for (const file of files) {
      const taskPath = path.join(taskDir, file);
      const task = (await fs.readJSON(taskPath)) as Task;

      // Pular tasks já sincronizadas
      if (task.synced && task.github_issue_number) {
        console.log(chalk.gray(`- Task "${task.title}" já sincronizada (Issue #${task.github_issue_number})`));
        continue;
      }

      // Criar issue no GitHub
      console.log(chalk.blue(`- Enviando task "${task.title}" para GitHub...`));
      const issueNumber = await createGitHubIssue(task);

      if (issueNumber) {
        // Atualizar task local com informações do GitHub
        await updateTaskWithGitHubInfo(task, issueNumber);
        console.log(chalk.green(`  ✅ Task "${task.title}" sincronizada como Issue #${issueNumber}`));
      }
    }
  } catch (error) {
    console.error(chalk.red("❌ Erro ao enviar tasks para GitHub:"), error);
  }
}

// Função para buscar issues do GitHub
async function pullFromGitHub() {
  try {
    console.log(chalk.blue("🔄 Buscando issues do GitHub..."));

    // Buscar todas as issues
    const issues = await fetchGitHubIssues();

    if (issues.length === 0) {
      console.log(chalk.yellow("⚠️ Nenhuma issue encontrada no GitHub."));
      return;
    }

    console.log(chalk.blue(`Encontradas ${issues.length} issues no GitHub.`));

    // Processar cada issue
    for (const issue of issues) {
      console.log(chalk.blue(`- Processando issue #${issue.number}: ${issue.title}`));
      await createLocalTaskFromIssue(issue);
    }
  } catch (error) {
    console.error(chalk.red("❌ Erro ao buscar issues do GitHub:"), error);
  }
}
