import { Octokit } from "@octokit/rest";
import chalk from "chalk";
import dotenv from "dotenv";
import fs from "fs-extra";
import inquirer from "inquirer";
import path from "path";
import { Task, fetchGitHubIssue, getTaskFilename, updateGitHubIssue } from "../utils/github.js";
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
        const issue = await fetchGitHubIssue(options.issueNumber);
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
    console.log(chalk.gray("Descrição:"));
    console.log(chalk.white(task.description || "Sem descrição"));
    console.log(chalk.blue(`Status atual: ${task.status || "Não definido"}`));

    // Perguntar o que fazer com a tarefa
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "O que você deseja fazer com esta tarefa?",
        choices: [
          { name: "Iniciar trabalho (mudar para 'In Progress')", value: "start" },
          { name: "Marcar como concluída (mudar para 'Done')", value: "complete" },
          { name: "Retornar para pendente (mudar para 'Todo')", value: "todo" },
          { name: "Adicionar comentário", value: "comment" },
          { name: "Cancelar", value: "cancel" },
        ],
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

      await addCommentToIssue(task.github_issue_number!, comment);
    }
  } catch (error) {
    console.error(chalk.red("❌ Erro ao executar tarefa:"), error);
  }
};

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

    // Atualizar timestamp de sincronização
    task.lastSyncAt = new Date().toISOString();

    // Salvar tarefa local
    const taskPath = path.join(".task", "issues", getTaskFilename(task));
    await fs.writeJSON(taskPath, task, { spaces: 2 });

    // Sincronizar com GitHub
    if (task.github_issue_number) {
      await updateGitHubIssue(task);
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

    console.log(chalk.green("✅ Comentário adicionado com sucesso!"));
  } catch (error) {
    console.error(chalk.red("❌ Erro ao adicionar comentário:"), error);
  }
}
