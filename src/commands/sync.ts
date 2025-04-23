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
  extractStatusFromIssue,
  fetchGitHubIssue,
  fetchGitHubIssues,
  fetchIssueProjectInfo,
  fetchMilestones,
  fetchProjects,
  getTaskFilename,
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

// Função para colorir o status baseado no valor
function getColoredStatus(status: string): string {
  switch (status.toLowerCase()) {
    case "todo":
      return chalk.blue(status);
    case "in progress":
    case "em andamento":
      return chalk.yellow(status);
    case "done":
    case "concluído":
    case "concluido":
      return chalk.green(status);
    case "blocked":
    case "bloqueado":
      return chalk.red(status);
    default:
      return status;
  }
}

// Função para mostrar tabela de tarefas
async function showTasksTable() {
  try {
    console.log("\n📋 Processando dados para exibição de tarefas...");

    // Obter variáveis de ambiente para GitHub
    const GITHUB_OWNER = process.env.GITHUB_OWNER || "";
    const GITHUB_REPO = process.env.GITHUB_REPO || "";

    // Pequena pausa para garantir que os arquivos foram salvos
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const tasks = await readAllFromDir(path.join(".task/issues"));

    if (!tasks.length) {
      console.log("Nenhuma task encontrada.");
      return;
    }

    // Buscar informações atualizadas para cada task
    const updatedTasks = await Promise.all(
      tasks.map(async (task: Task) => {
        if (task.github_issue_number) {
          try {
            // Buscar issue para obter status atual do projeto
            const issue = await fetchGitHubIssue(task.github_issue_number);
            if (issue) {
              // Atualizar estado da issue (open/closed/deleted)
              task.state = issue.state;

              // Se a issue foi excluída, não tentar buscar informações adicionais
              if (issue.state !== "deleted") {
                // Buscar projeto atualizado
                const projectInfo = await fetchIssueProjectInfo(task.github_issue_number);
                if (projectInfo) {
                  task.project = projectInfo;
                }

                // Atualizar status com informações do projeto
                const statusFromProject = await extractStatusFromIssue(issue);
                if (statusFromProject) {
                  task.status = statusFromProject;
                }
              }

              // Salvar a task atualizada no arquivo JSON local
              const filename = `#${task.github_issue_number}-${task.id}-${task.title
                .toLowerCase()
                .replace(/\s+/g, "-")
                .replace(/[^\w-]/g, "")}.json`;

              await fs.writeJSON(path.join(".task/issues", filename), task, { spaces: 2 });
              console.log(`✅ Arquivo JSON atualizado para task #${task.github_issue_number}`);
            }
          } catch (error) {
            console.error(`Erro ao atualizar task #${task.github_issue_number}:`, error);
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

    updatedTasks.forEach((task: Task) => {
      // Criar link para issue no GitHub, se tiver número
      let issueTitle = task.title;
      let issuePrefix = "";

      if (task.github_issue_number) {
        // Construir URL para a issue no GitHub
        const githubUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${task.github_issue_number}`;
        // Criar texto com link utilizando formatação de terminal hyperlink
        issuePrefix = `#${task.github_issue_number} - `;
        // O formato \u001b]8;;URL\u0007TEXT\u001b]8;;\u0007 cria um hyperlink no terminal
        issueTitle = `\u001b]8;;${githubUrl}\u0007${task.title}\u001b]8;;\u0007`;
      }

      const projectName = task.project ? (task.project.startsWith("@") ? task.project.substring(1) : task.project) : "";

      let githubStatus = "N/A";
      if (task.state) {
        if (task.state === "deleted") {
          githubStatus = chalk.red("Excluída");
        } else {
          githubStatus = task.state === "open" ? "Aberta" : "Fechada";
        }
      }

      // Destacar título em cinza para issues excluídas no GitHub
      const titleDisplay =
        task.state === "deleted"
          ? chalk.gray(`${issuePrefix}${issueTitle}`)
          : chalk.green(`${issuePrefix}${issueTitle}`);

      table.push([
        titleDisplay,
        getColoredStatus(task.status || "N/A"),
        githubStatus,
        projectName || "N/A",
        task.milestone || "N/A",
      ]);
    });

    console.log(table.toString());

    // Adicionar legenda para o status "Excluída"
    console.log(
      `\n${chalk.gray("Títulos em cinza")} e ${chalk.red(
        "Excluída"
      )} indicam issues removidas do GitHub mas mantidas localmente.`
    );
    console.log(chalk.blue("Os títulos das tarefas são clicáveis e abrem diretamente no GitHub"));
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

      // Flags para controlar se podemos prosseguir
      let canProceed = true;

      // 1. Primeiro verificar e criar o projeto se necessário
      if (!task.project || task.project.trim() === "") {
        console.log(chalk.yellow(`⚠️ A task "${task.title}" não tem projeto definido. Um projeto é obrigatório.`));
        canProceed = false;
      } else {
        // Verificar variantes do nome do projeto (com e sem '@')
        const projectName = task.project;
        const projectNameWithAt = projectName.startsWith("@") ? projectName : `@${projectName}`;
        const projectNameWithoutAt = projectName.startsWith("@") ? projectName.substring(1) : projectName;

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
            console.log(`✅ Projeto "${projectName}" encontrado como "${matchedProjectName}"`);
            break;
          }
        }

        if (!projectExists) {
          console.log(`⚠️ O projeto "${projectName}" não existe no GitHub. Tentando criar automaticamente...`);

          const projectId = await createProject(projectName, "", true);
          if (!projectId) {
            console.log(
              chalk.red(`❌ Não foi possível criar o projeto "${projectName}". A tarefa não será sincronizada.`)
            );
            canProceed = false;
          } else {
            console.log(`✅ Projeto "${projectName}" criado com sucesso (ID: ${projectId})`);
            // Atualizar o mapa de projetos para incluir o novo projeto
            projects.set(projectName, projectId);
            // Se o projeto existir, garantir que usamos o nome correto
            task.project = projectName;
          }
        } else {
          // Se o projeto existir, garantir que usamos o nome correto como está no GitHub
          console.log(`✅ Usando nome de projeto "${matchedProjectName}" como encontrado no GitHub`);
          task.project = matchedProjectName;
        }
      }

      // 2. Verificar e criar a milestone se necessário (apenas se o projeto foi resolvido)
      if (canProceed) {
        if (!task.milestone || task.milestone.trim() === "") {
          console.log(
            chalk.yellow(`⚠️ A task "${task.title}" não tem milestone definida. Uma milestone é obrigatória.`)
          );
          canProceed = false;
        } else if (!milestones.has(task.milestone.toLowerCase())) {
          console.log(`⚠️ A milestone "${task.milestone}" não existe no GitHub. Tentando criar automaticamente...`);

          const milestoneId = await createMilestone(task.milestone, "", true);
          if (!milestoneId) {
            console.log(
              chalk.red(`❌ Não foi possível criar a milestone "${task.milestone}". A tarefa não será sincronizada.`)
            );
            canProceed = false;
          } else {
            console.log(`✅ Milestone "${task.milestone}" criada com sucesso (ID: ${milestoneId})`);
            // Atualizar lista de milestones para futuras verificações
            milestones.set(task.milestone.toLowerCase(), milestoneId);
          }
        } else {
          console.log(`✅ Milestone "${task.milestone}" já existe no GitHub`);
        }
      }

      // 3. Se não pudermos prosseguir, pular esta tarefa
      if (!canProceed) {
        console.log(chalk.yellow(`⚠️ A tarefa "${task.title}" não será sincronizada devido aos erros acima.`));
        tasksSkipped++;
        totalTasksProcessed++;
        continue;
      }

      // Atualizar o arquivo local com quaisquer alterações feitas
      await fs.writeJSON(taskPath, task, { spaces: 2 });

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
    // Rastrear números de issues para verificar excluídas
    const localIssueNumbers = new Set<number>();

    tasks.forEach((task: Task) => {
      if (task.github_issue_number) {
        taskMap.set(task.github_issue_number, task);
        localIssueNumbers.add(task.github_issue_number);
      }
    });

    // Mapear issues do GitHub por número para verificar excluídas
    const githubIssueNumbers = new Set<number>();
    issues.forEach((issue) => {
      githubIssueNumbers.add(issue.number);
    });

    let updated = 0;
    let created = 0;
    let failed = 0;
    let deleted = 0;

    // Verificar issues locais que não existem mais no GitHub (possivelmente excluídas)
    for (const issueNumber of localIssueNumbers) {
      if (!githubIssueNumbers.has(issueNumber)) {
        console.log(chalk.yellow(`⚠️ Issue #${issueNumber} não encontrada no GitHub (possivelmente excluída).`));

        // Obter a task local
        const task = taskMap.get(issueNumber)!;

        // Atualizar status local para mostrar que a issue foi excluída
        task.status = "deleted";
        task.state = "deleted";
        task.lastSyncAt = new Date().toISOString();

        // Salvar a task atualizada com o novo status
        const taskPath = path.join(".task/issues", getTaskFilename(task));
        await fs.writeJSON(taskPath, task, { spaces: 2 });

        console.log(chalk.green(`✅ Task local atualizada para status "deleted"`));
        deleted++;
      }
    }

    // Processar cada issue
    for (const issue of issues) {
      if (taskMap.has(issue.number)) {
        // Atualizar task existente
        console.log(chalk.blue(`- Atualizando task para issue #${issue.number}: ${issue.title}`));

        // Obter a task local existente
        const currentTask = taskMap.get(issue.number)!;

        // Armazenar valores originais para verificação
        const originalValues = {
          milestone: currentTask.milestone || "",
          status: currentTask.status || "",
          project: currentTask.project || "",
        };

        // Valores esperados do GitHub
        const expectedValues = {
          milestone: issue.milestone?.title || "",
          status: await extractStatusFromIssue(issue),
          project: (await fetchIssueProjectInfo(issue.number)) || "",
        };

        // Atualizar a task local com os dados do GitHub
        const wasUpdated = await updateLocalTaskFromIssue(currentTask, issue);

        if (wasUpdated) {
          // Verificar se a atualização realmente aconteceu
          const taskPath = path.join(taskDir, files.find((f) => f.includes(`#${issue.number}-`)) || "");

          if (fs.existsSync(taskPath)) {
            const updatedTask = await fs.readJSON(taskPath);

            // Verificar se os valores foram atualizados corretamente
            const milestoneUpdated =
              originalValues.milestone !== expectedValues.milestone
                ? updatedTask.milestone === expectedValues.milestone
                : true;

            const statusUpdated =
              originalValues.status !== expectedValues.status ? updatedTask.status === expectedValues.status : true;

            if (!milestoneUpdated) {
              console.log(
                chalk.red(
                  `⚠️ ERRO: Milestone não foi atualizada! Esperado: "${expectedValues.milestone}", Atual: "${updatedTask.milestone}"`
                )
              );
              failed++;
            } else if (originalValues.milestone !== updatedTask.milestone) {
              console.log(
                chalk.green(
                  `  ✅ Milestone atualizada com sucesso: "${originalValues.milestone}" → "${updatedTask.milestone}"`
                )
              );
            }

            if (!statusUpdated) {
              console.log(
                chalk.red(
                  `⚠️ ERRO: Status não foi atualizado! Esperado: "${expectedValues.status}", Atual: "${updatedTask.status}"`
                )
              );
              failed++;
            }

            // Se tudo estiver correto, incrementar contador
            if (milestoneUpdated && statusUpdated) {
              console.log(chalk.green(`  ✅ Task #${issue.number} sincronizada com sucesso!`));
              updated++;
            }
          } else {
            console.log(chalk.red(`⚠️ ERRO: Arquivo da task não encontrado após atualização: ${taskPath}`));
            failed++;
          }
        } else {
          console.log(chalk.red(`⚠️ ERRO: Falha ao atualizar task #${issue.number}`));
          failed++;
        }
      } else {
        // Criar nova task
        console.log(chalk.blue(`- Criando task para issue #${issue.number}: ${issue.title}`));
        await createLocalTaskFromIssue(issue);
        created++;
      }
    }

    console.log(
      chalk.green(
        `✅ Sincronização concluída: ${updated} tasks atualizadas, ${created} tasks criadas, ${deleted} tasks marcadas como excluídas, ${failed} falhas.`
      )
    );
  } catch (error) {
    console.error(chalk.red("❌ Erro ao buscar issues do GitHub:"), error);
  }
}
