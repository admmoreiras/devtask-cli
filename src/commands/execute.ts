import { Octokit } from "@octokit/rest";
import chalk from "chalk";
import Table from "cli-table3";
import dotenv from "dotenv";
import fs from "fs-extra";
import inquirer from "inquirer";
import path from "path";
import {
  formatDependencies,
  formatProjectName,
  getColoredStatus,
  getGitHubStatus,
  getPriorityWithColor,
  getSyncStatus,
} from "../utils/display.js";
import github from "../utils/github/index.js";
import { Task } from "../utils/github/types.js";
import { nextTasks } from "./next.js";

// Carregar variáveis de ambiente
dotenv.config();

// Verificar variáveis obrigatórias
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const GITHUB_OWNER = process.env.GITHUB_OWNER || "";
const GITHUB_REPO = process.env.GITHUB_REPO || "";

// Inicializar Octokit com o token
const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

export const executeTask = async (options = { issueNumber: 0, auto: false }): Promise<void> => {
  try {
    console.log(chalk.blue("\n🔧 Modo de execução de tarefas"));

    // Se não tiver um número de issue específico, buscar a próxima tarefa
    if (!options.issueNumber) {
      console.log(chalk.blue("Buscando próxima tarefa pendente..."));

      // Usar a função nextTasks para identificar a próxima tarefa
      let taskToExecute: Task | null = null;

      // Buscar todas as tarefas para encontrar a próxima
      const tasksDir = path.join(process.cwd(), ".task", "issues");
      if (!fs.existsSync(tasksDir)) {
        console.log(chalk.yellow("Nenhuma tarefa encontrada. Execute 'devtask sync' primeiro."));
        return;
      }

      // Ler os arquivos de tarefas
      const taskFiles = fs.readdirSync(tasksDir);
      if (taskFiles.length === 0) {
        console.log(chalk.yellow("Nenhuma tarefa encontrada."));
        return;
      }

      // Identificar a próxima tarefa através da função next
      await nextTasks({ execute: false });

      if (!options.auto) {
        // Solicitar ao usuário que selecione uma tarefa para executar
        const { selectedIssueNumber } = await inquirer.prompt([
          {
            type: "input",
            name: "selectedIssueNumber",
            message: "Digite o número da issue que deseja executar:",
            validate: (input) => {
              const num = parseInt(input, 10);
              return !isNaN(num) && num > 0 ? true : "Por favor, digite um número válido.";
            },
            filter: (input) => parseInt(input, 10),
          },
        ]);

        options.issueNumber = selectedIssueNumber;
      }
    }

    // Buscar a tarefa pelo número da issue
    const taskFiles = fs.readdirSync(path.join(".task", "issues"));
    let taskFile = taskFiles.find((file) => file.includes(`#${options.issueNumber}-`));

    if (!taskFile) {
      console.log(chalk.yellow(`⚠️ Tarefa #${options.issueNumber} não encontrada localmente.`));
      console.log(chalk.blue("Tentando buscar do GitHub..."));

      try {
        const issue = await github.fetchGitHubIssue(options.issueNumber);
        if (!issue) {
          console.log(chalk.red(`❌ Issue #${options.issueNumber} não encontrada no GitHub.`));
          return;
        }

        // Todo: Implementar lógica para baixar a issue e criar localmente se necessário
        console.log(chalk.yellow(`Por favor, execute 'devtask sync' para baixar esta issue do GitHub.`));
        return;
      } catch (error) {
        console.error(chalk.red(`❌ Erro ao buscar issue #${options.issueNumber} do GitHub:`), error);
        return;
      }
    }

    // Carregar a tarefa
    const taskPath = path.join(".task", "issues", taskFile);
    const task: Task = await fs.readJSON(taskPath);

    console.log(chalk.green(`\n📋 Tarefa selecionada: #${task.github_issue_number} - ${task.title}`));

    // Exibir detalhes da tarefa usando tabela similar à list.ts
    displayTaskDetails(task);

    console.log(chalk.gray("Descrição:"));
    console.log(chalk.white(task.description || "Sem descrição"));

    // Mostrar comentários anteriores, se houver
    if (task.comments && task.comments.length > 0) {
      console.log(chalk.gray("\nComentários anteriores:"));
      task.comments.forEach((comment, index) => {
        console.log(chalk.white(`${index + 1}. ${comment.date}: ${comment.text}`));
      });
    }

    // Determinar opções baseadas no status atual
    const statusOptions = [];

    if (task.status?.toLowerCase() !== "in progress") {
      statusOptions.push({ name: "Iniciar trabalho (mudar para 'In Progress')", value: "start" });
    }

    if (task.status?.toLowerCase() !== "done") {
      statusOptions.push({ name: "Marcar como concluída (mudar para 'Done')", value: "complete" });
    }

    if (task.status?.toLowerCase() !== "todo") {
      statusOptions.push({ name: "Retornar para pendente (mudar para 'Todo')", value: "todo" });
    }

    statusOptions.push({ name: "Adicionar comentário", value: "comment" }, { name: "Cancelar", value: "cancel" });

    // Perguntar o que fazer com a tarefa
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "O que você deseja fazer com esta tarefa?",
        choices: statusOptions,
      },
    ]);

    if (action === "cancel") {
      console.log(chalk.blue("Operação cancelada."));
      return;
    }

    if (action === "start") {
      // Mudar status para "In Progress"
      await changeTaskStatus(task, "in progress");
    } else if (action === "complete") {
      // Mudar status para "Done" e adicionar comentário
      const { comment } = await inquirer.prompt([
        {
          type: "input",
          name: "comment",
          message: "Digite um comentário sobre o trabalho realizado (opcional):",
        },
      ]);

      if (comment?.trim()) {
        await addCommentToTask(task, comment);
        await addCommentToIssue(task.github_issue_number!, comment);
      }

      await changeTaskStatus(task, "done");
    } else if (action === "todo") {
      // Mudar status para "Todo"
      await changeTaskStatus(task, "todo");
    } else if (action === "comment") {
      // Apenas adicionar comentário
      const { comment } = await inquirer.prompt([
        {
          type: "input",
          name: "comment",
          message: "Digite seu comentário:",
          validate: (input) => (input.trim() ? true : "O comentário não pode estar vazio."),
        },
      ]);

      await addCommentToTask(task, comment);
      await addCommentToIssue(task.github_issue_number!, comment);
    }
  } catch (error) {
    console.error(chalk.red("❌ Erro ao executar tarefa:"), error);
  }
};

// Função para exibir detalhes da tarefa em formato de tabela
function displayTaskDetails(task: Task): void {
  const table = new Table({
    head: [
      chalk.cyan("ID"),
      chalk.cyan("Status"),
      chalk.cyan("GitHub"),
      chalk.cyan("Prior"),
      chalk.cyan("Depend"),
      chalk.cyan("Projeto"),
      chalk.cyan("Sprint"),
      chalk.cyan("Sync"),
    ],
    colWidths: [10, 12, 10, 10, 12, 12, 16, 10],
    style: { "padding-left": 1, "padding-right": 1 },
  });

  // Preparar ID com link caso tenha issue no GitHub
  let taskIdDisplay = `#${task.id}`;
  if (task.github_issue_number) {
    const githubUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${task.github_issue_number}`;
    taskIdDisplay = `\u001b]8;;${githubUrl}\u0007#${task.id}\u001b]8;;\u0007`;
  }

  // Adicionar linha à tabela
  table.push([
    taskIdDisplay,
    getColoredStatus(task.status),
    getGitHubStatus(task.state),
    getPriorityWithColor(task.priority),
    formatDependencies(task.dependencies),
    formatProjectName(task.project),
    task.milestone || "N/A",
    getSyncStatus(task),
  ]);

  console.log(table.toString());

  // Adicionar informação sobre links clicáveis
  if (task.github_issue_number) {
    console.log(chalk.blue("O ID da tarefa é clicável e abre diretamente no GitHub"));
  }
}

// Função para adicionar comentário a uma tarefa localmente
async function addCommentToTask(task: Task, comment: string): Promise<void> {
  try {
    console.log(chalk.blue(`Adicionando comentário à tarefa #${task.id}...`));

    // Inicializar o array de comentários se não existir
    if (!task.comments) {
      task.comments = [];
    }

    // Adicionar novo comentário
    task.comments.push({
      text: comment,
      date: new Date().toISOString(),
      author: "local-user",
    });

    // Atualizar timestamp de sincronização
    task.lastSyncAt = new Date().toISOString();

    // Salvar tarefa local
    const taskPath = path.join(".task", "issues", github.getTaskFilename(task));
    await fs.writeJSON(taskPath, task, { spaces: 2 });

    console.log(chalk.green("✅ Comentário adicionado localmente com sucesso!"));
  } catch (error) {
    console.error(chalk.red("❌ Erro ao adicionar comentário à tarefa local:"), error);
  }
}

// Função para mudar o status de uma tarefa
async function changeTaskStatus(task: Task, newStatus: string): Promise<void> {
  try {
    console.log(chalk.blue(`Alterando status de "${task.status || "Não definido"}" para "${newStatus}"...`));

    // Atualizar status localmente
    const oldStatus = task.status;
    task.status = newStatus;

    // Se o status for "done", também deve fechar a issue no GitHub
    if (newStatus.toLowerCase() === "done") {
      task.state = "closed";
    } else if (oldStatus?.toLowerCase() === "done" && newStatus.toLowerCase() !== "done") {
      // Se estava "done" e agora não está, reabrir
      task.state = "open";
    }

    // Adicionar comentário de mudança de status
    if (!task.comments) {
      task.comments = [];
    }

    task.comments.push({
      text: `Status alterado de "${oldStatus || "Não definido"}" para "${newStatus}"`,
      date: new Date().toISOString(),
      author: "system",
      type: "status-change",
    });

    // Atualizar timestamp de sincronização
    task.lastSyncAt = new Date().toISOString();

    // Salvar tarefa local
    const taskPath = path.join(".task", "issues", github.getTaskFilename(task));
    await fs.writeJSON(taskPath, task, { spaces: 2 });

    // Sincronizar com GitHub
    if (task.github_issue_number) {
      await github.updateGitHubIssue(task);
      console.log(chalk.green(`✅ Status atualizado com sucesso para "${newStatus}"`));

      // Verificar se os projetos no GitHub têm um campo de status
      try {
        // Verificar se existe projeto para a tarefa
        if (task.project) {
          console.log(chalk.blue(`Verificando configurações do projeto "${task.project}"...`));

          // Atualizar status no projeto viria aqui se necessário
          // Mas como já estamos atualizando a issue com o status, o projeto deve refletir isso
          console.log(chalk.blue(`Status no projeto será atualizado na próxima sincronização`));
        }
      } catch (error) {
        console.error(chalk.yellow(`⚠️ Aviso: Não foi possível atualizar o status no projeto:`), error);
      }
    } else {
      console.log(chalk.yellow("⚠️ Tarefa não está sincronizada com o GitHub. Use 'devtask sync' para sincronizar."));
    }
  } catch (error) {
    console.error(chalk.red("❌ Erro ao mudar status da tarefa:"), error);
  }
}

// Função para adicionar comentário a uma issue
async function addCommentToIssue(issueNumber: number, comment: string): Promise<void> {
  try {
    console.log(chalk.blue(`Adicionando comentário à issue #${issueNumber}...`));

    await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      issue_number: issueNumber,
      body: comment,
    });

    console.log(chalk.green("✅ Comentário adicionado ao GitHub com sucesso!"));
  } catch (error) {
    console.error(chalk.red("❌ Erro ao adicionar comentário ao GitHub:"), error);
  }
}
