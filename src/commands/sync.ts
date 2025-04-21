import chalk from "chalk";
import Table from "cli-table3";
import fs from "fs-extra";
import inquirer from "inquirer";
import path from "path";
import {
  Task,
  createGitHubIssue,
  createLocalTaskFromIssue,
  fetchGitHubIssues,
  updateGitHubIssue,
  updateLocalTaskFromIssue,
  updateTaskWithGitHubInfo,
} from "../utils/github.js";
import { readAllFromDir } from "../utils/storage.js";

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

    // Mostrar tabela atualizada após sincronização
    await showTasksTable();
  } catch (error) {
    console.error(chalk.red("❌ Erro durante a sincronização:"), error);
  }
}

// Função para mostrar tabela de tarefas
async function showTasksTable() {
  try {
    console.log("\n📋 Processando dados para exibição de tarefas...");

    // Pequena pausa para garantir que os arquivos foram salvos
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const tasks = await readAllFromDir(path.join(".task/issues"));

    if (!tasks.length) {
      console.log("Nenhuma task encontrada.");
      return;
    }

    const table = new Table({
      head: [chalk.cyan("Título"), chalk.cyan("Status"), chalk.cyan("Projeto"), chalk.cyan("Sprint")],
      wordWrap: true,
      wrapOnWordBoundary: true,
    });

    tasks.forEach((task: Task) => {
      const issuePrefix = task.github_issue_number ? `${task.github_issue_number} - ` : "";
      table.push([
        chalk.green(`${issuePrefix}${task.title}`),
        task.status || "N/A",
        task.project || "N/A",
        task.milestone || "N/A",
      ]);
    });

    console.log(table.toString());
  } catch (error) {
    console.error("Erro ao mostrar tabela:", error);
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

      // Verificar se a task já está sincronizada
      if (task.synced && task.github_issue_number) {
        console.log(chalk.blue(`- Atualizando task "${task.title}" (Issue #${task.github_issue_number})...`));

        // Atualizar a issue existente
        const updated = await updateGitHubIssue(task);
        if (updated) {
          console.log(chalk.green(`  ✅ Issue #${task.github_issue_number} atualizada com sucesso`));
        }
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

    // Buscar tarefas locais existentes para comparar
    const taskDir = path.join(".task/issues");
    await fs.ensureDir(taskDir);
    const files = await fs.readdir(taskDir);
    const tasks = await Promise.all(files.map((file) => fs.readJSON(path.join(taskDir, file))));

    // Mapear número da issue para a task local correspondente
    const taskMap = new Map<number, Task>();
    tasks.forEach((task: Task) => {
      if (task.github_issue_number) {
        taskMap.set(task.github_issue_number, task);
      }
    });

    let updated = 0;
    let created = 0;

    // Processar cada issue
    for (const issue of issues) {
      if (taskMap.has(issue.number)) {
        // Atualizar task existente
        console.log(chalk.blue(`- Atualizando task para issue #${issue.number}: ${issue.title}`));
        const task = taskMap.get(issue.number)!;
        await updateLocalTaskFromIssue(task, issue);
        updated++;
      } else {
        // Criar nova task
        console.log(chalk.blue(`- Criando task para issue #${issue.number}: ${issue.title}`));
        await createLocalTaskFromIssue(issue);
        created++;
      }
    }

    console.log(chalk.green(`✅ Sincronização concluída: ${updated} tasks atualizadas, ${created} tasks criadas.`));
  } catch (error) {
    console.error(chalk.red("❌ Erro ao buscar issues do GitHub:"), error);
  }
}
