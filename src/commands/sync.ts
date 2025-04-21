import chalk from "chalk";
import Table from "cli-table3";
import fs from "fs-extra";
import inquirer from "inquirer";
import path from "path";
import {
  Task,
  createGitHubIssue,
  createLocalTaskFromIssue,
  createMilestone,
  createProject,
  fetchGitHubIssues,
  fetchIssueProjectInfo,
  fetchMilestones,
  fetchProjects,
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

    // Buscar informações de projeto do GitHub para cada task
    const tasksWithProjects = await Promise.all(
      tasks.map(async (task: Task) => {
        if (task.github_issue_number) {
          try {
            const projectInfo = await fetchIssueProjectInfo(task.github_issue_number);
            if (projectInfo) {
              task.project = projectInfo;
            }
          } catch (error) {
            // Silenciar erro
          }
        }
        return task;
      })
    );

    const table = new Table({
      head: [
        chalk.cyan("Título"),
        chalk.cyan("Status"),
        chalk.cyan("Status GitHub"),
        chalk.cyan("Projeto"),
        chalk.cyan("Sprint"),
      ],
      wordWrap: true,
      wrapOnWordBoundary: true,
    });

    tasksWithProjects.forEach((task: Task) => {
      const issuePrefix = task.github_issue_number ? `#${task.github_issue_number} - ` : "";
      // Remover '@' do nome do projeto se existir
      const projectName = task.project && task.project.startsWith("@") ? task.project.substring(1) : task.project;

      // Determinar o status do GitHub
      let githubStatus = "N/A";
      if (task.state) {
        githubStatus = task.state === "open" ? "Aberta" : "Fechada";
      }

      table.push([
        chalk.green(`${issuePrefix}${task.title}`),
        task.status || "N/A",
        githubStatus,
        projectName || "N/A",
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

    // Filtrar apenas os arquivos JSON
    const jsonFiles = files.filter((file) => file.endsWith(".json"));
    console.log(chalk.blue(`🔄 Encontradas ${jsonFiles.length} tasks locais`));

    // Buscar milestones e projetos existentes para verificação
    const milestones = await fetchMilestones();
    const projects = await fetchProjects();

    // Variáveis para estatísticas
    let totalTasksProcessed = 0;
    let tasksSkipped = 0;
    let tasksUpdated = 0;
    let tasksCreated = 0;

    // Processar cada arquivo de task
    for (const file of jsonFiles) {
      const taskPath = path.join(taskDir, file);

      // Obter informações do arquivo
      const fileStats = await fs.stat(taskPath);
      const fileModifiedTime = new Date(fileStats.mtime).getTime();

      const task = (await fs.readJSON(taskPath)) as Task;

      // Verificar se a task já foi sincronizada antes
      const taskSynced = task.synced && task.github_issue_number;

      // Verificar se a task foi modificada desde a última sincronização
      let modified = true; // Assume que foi modificada por padrão

      if (task.lastSyncAt) {
        const lastSyncTime = new Date(task.lastSyncAt).getTime();
        // Se a data da última sincronização for mais recente que a data de modificação do arquivo,
        // a task não foi modificada após a última sincronização
        if (lastSyncTime >= fileModifiedTime) {
          modified = false;
        }
      }

      // Pular tasks já sincronizadas e não modificadas
      if (taskSynced && !modified) {
        console.log(chalk.gray(`- Pulando task "${task.title}" (não modificada desde a última sincronização)`));
        tasksSkipped++;
        totalTasksProcessed++;
        continue;
      }

      // Verificar milestone antes de sincronizar
      if (task.milestone && !milestones.has(task.milestone.toLowerCase())) {
        const { createNewMilestone } = await inquirer.prompt([
          {
            type: "confirm",
            name: "createNewMilestone",
            message: `A milestone "${task.milestone}" não existe no GitHub. Deseja criá-la?`,
            default: true,
          },
        ]);

        if (createNewMilestone) {
          const milestoneId = await createMilestone(task.milestone);
          if (!milestoneId) {
            console.log(`⚠️ Não foi possível criar a milestone. A issue será criada sem milestone.`);
            task.milestone = "";
            // Atualizar o arquivo local
            await fs.writeJSON(taskPath, task, { spaces: 2 });
          }
        } else {
          console.log(`⚠️ A issue será criada sem milestone.`);
          task.milestone = "";
          // Atualizar o arquivo local
          await fs.writeJSON(taskPath, task, { spaces: 2 });
        }
      }

      // Verificar projeto antes de sincronizar
      if (task.project) {
        // Verificar variantes do nome do projeto (com e sem '@')
        const projectName = task.project;
        const projectNameWithAt = projectName.startsWith("@") ? projectName : `@${projectName}`;
        const projectNameWithoutAt = projectName.startsWith("@") ? projectName.substring(1) : projectName;

        // Imprimir informações para depuração
        console.log(`\nVerificando projeto: "${projectName}"`);

        // Verificar se existe o projeto em qualquer um dos formatos (case insensitive)
        let projectExists = false;
        let matchedProjectName = "";

        for (const [name, id] of projects.entries()) {
          const normalizedName = name.toLowerCase();
          if (
            normalizedName === projectName.toLowerCase() ||
            normalizedName === projectNameWithAt.toLowerCase() ||
            normalizedName === projectNameWithoutAt.toLowerCase()
          ) {
            projectExists = true;
            matchedProjectName = name;
            console.log(`✅ Projeto encontrado como "${matchedProjectName}"`);
            break;
          }
        }

        if (!projectExists) {
          console.log(`❌ Projeto não encontrado em nenhum formato`);
          const { createNewProject } = await inquirer.prompt([
            {
              type: "confirm",
              name: "createNewProject",
              message: `O projeto "${projectName}" não existe no GitHub. Deseja criá-lo?`,
              default: true,
            },
          ]);

          if (createNewProject) {
            const projectId = await createProject(projectName);
            if (!projectId) {
              console.log(`⚠️ Não foi possível criar o projeto. A issue será criada sem projeto.`);
              task.project = "";
              // Atualizar o arquivo local
              await fs.writeJSON(taskPath, task, { spaces: 2 });
            } else {
              // Atualizar o mapa de projetos para incluir o novo projeto
              projects.set(projectName, projectId);
            }
          } else {
            console.log(`⚠️ A issue será criada sem projeto.`);
            task.project = "";
            // Atualizar o arquivo local
            await fs.writeJSON(taskPath, task, { spaces: 2 });
          }
        } else {
          // Se o projeto existir, garantir que usamos o nome correto como está no GitHub
          console.log(`✅ Usando nome de projeto "${matchedProjectName}" como encontrado no GitHub`);
          task.project = matchedProjectName;
        }
      }

      // Verificar se a task já está sincronizada
      if (task.synced && task.github_issue_number) {
        console.log(chalk.blue(`- Atualizando task "${task.title}" (Issue #${task.github_issue_number})...`));

        // Atualizar a issue existente
        const updated = await updateGitHubIssue(task);
        if (updated) {
          console.log(chalk.green(`  ✅ Issue #${task.github_issue_number} atualizada com sucesso`));
          tasksUpdated++;
        }
      } else {
        // Criar issue no GitHub
        console.log(chalk.blue(`- Enviando nova task "${task.title}" para GitHub...`));
        const issueNumber = await createGitHubIssue(task);

        if (issueNumber) {
          // Atualizar task local com informações do GitHub
          await updateTaskWithGitHubInfo(task, issueNumber);
          console.log(chalk.green(`  ✅ Task "${task.title}" sincronizada como Issue #${issueNumber}`));
          tasksCreated++;
        }
      }

      totalTasksProcessed++;
    }

    // Exibir estatísticas
    console.log(chalk.blue(`\n📊 Resumo da sincronização:`));
    console.log(chalk.blue(`  - Tasks processadas: ${totalTasksProcessed}`));
    console.log(chalk.blue(`  - Tasks ignoradas (não modificadas): ${tasksSkipped}`));
    console.log(chalk.blue(`  - Tasks atualizadas: ${tasksUpdated}`));
    console.log(chalk.blue(`  - Novas issues criadas: ${tasksCreated}`));
  } catch (error) {
    console.error(chalk.red("❌ Erro ao enviar tasks para GitHub:"), error);
  }
}

// Função para buscar issues do GitHub
async function pullFromGitHub() {
  try {
    console.log(chalk.blue("🔄 Buscando issues do GitHub..."));

    // Buscar todas as issues
    const issues = (await fetchGitHubIssues()) || [];

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
