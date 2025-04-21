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
  lastSyncAt?: string; // Data e hora da última sincronização com GitHub
}

// Interfaces para resposta GraphQL
interface ProjectNode {
  id: string;
  title: string;
}

interface ProjectsResponse {
  organization?: {
    projectsV2?: {
      nodes: ProjectNode[];
    };
  };
  user?: {
    projectsV2?: {
      nodes: ProjectNode[];
    };
  };
}

interface ProjectQueryResponse {
  node: {
    id: string;
  };
}

// Verifica se o owner é um usuário ou organização
async function isUser(): Promise<boolean> {
  try {
    const query = `
      query {
        user(login: "${GITHUB_OWNER}") {
          id
        }
      }
    `;

    interface UserResponse {
      user: { id: string } | null;
    }

    const response = await octokit.graphql<UserResponse>(query);
    return response && response.user !== null;
  } catch (error) {
    return false;
  }
}

// Função para buscar milestones do GitHub
export async function fetchMilestones(): Promise<Map<string, number>> {
  try {
    const response = await octokit.rest.issues.listMilestones({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      state: "open",
    });

    const milestoneMap = new Map<string, number>();
    response.data.forEach((milestone) => {
      if (milestone.title && milestone.number) {
        milestoneMap.set(milestone.title.toLowerCase(), milestone.number);
      }
    });

    return milestoneMap;
  } catch (error) {
    console.error("❌ Erro ao buscar milestones:", error);
    return new Map();
  }
}

// Função para listar milestones disponíveis
export async function listMilestones(): Promise<void> {
  try {
    console.log(`\nToken: ${GITHUB_TOKEN.substring(0, 5)}...`);
    console.log(`Owner: ${GITHUB_OWNER}`);
    console.log(`Repo: ${GITHUB_REPO}`);

    const response = await octokit.rest.issues.listMilestones({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      state: "open",
    });

    console.log("\nMilestones disponíveis:");
    if (response.data.length === 0) {
      console.log("  Nenhum milestone encontrado");
    } else {
      response.data.forEach((milestone) => {
        console.log(`  📅 ${milestone.title} (#${milestone.number})`);
      });
    }
  } catch (error) {
    console.error("❌ Erro ao buscar milestones:", error);
  }
}

// Função para buscar projetos do GitHub
export async function fetchProjects(): Promise<Map<string, string>> {
  const projectMap = new Map<string, string>();
  try {
    console.log("\n🔍 Buscando projetos no GitHub...");

    // Tentar com GraphQL para ProjectsV2
    const isUserAccount = await isUser();

    if (isUserAccount) {
      // Buscar projetos de usuário e verificar se estão associados ao repositório
      try {
        const userQuery = `
          query {
            user(login: "${GITHUB_OWNER}") {
              projectsV2(first: 100) {
                nodes {
                  id
                  title
                  repositories(first: 50) {
                    nodes {
                      name
                    }
                  }
                }
              }
            }
            repository(owner: "${GITHUB_OWNER}", name: "${GITHUB_REPO}") {
              projectsV2(first: 100) {
                nodes {
                  id
                  title
                }
              }
            }
          }
        `;

        const userResponse = await octokit.graphql<any>(userQuery);

        // Adicionar projetos diretamente ligados ao repositório
        if (userResponse.repository?.projectsV2?.nodes) {
          console.log(`\n📊 Projetos encontrados diretamente no repositório:`);
          userResponse.repository.projectsV2.nodes.forEach((project: any) => {
            console.log(`  - "${project.title}" (ID: ${project.id})`);
            projectMap.set(project.title, project.id);
          });
        }

        // Verificar projetos do usuário para ver se estão associados ao repositório
        if (userResponse.user?.projectsV2?.nodes) {
          console.log(`\n📊 Projetos do usuário associados ao repositório:`);
          userResponse.user.projectsV2.nodes.forEach((project: any) => {
            // Verificar se o projeto está associado ao repositório especificado
            if (project.repositories?.nodes) {
              const isAssociated = project.repositories.nodes.some((repo: any) => repo.name === GITHUB_REPO);

              if (isAssociated) {
                console.log(`  - "${project.title}" (ID: ${project.id})`);
                projectMap.set(project.title, project.id);
              }
            }
          });
        }
      } catch (graphqlError: any) {
        if (graphqlError.message && graphqlError.message.includes("Resource not accessible by personal access token")) {
          console.log("\n⚠️ Seu token não tem permissão para acessar projetos V2.");
          console.log("Para resolver, crie um novo token com os escopos: 'repo' e 'project'");
        }
      }
    } else {
      // Buscar projetos de organização e verificar se estão associados ao repositório
      try {
        const orgQuery = `
          query {
            organization(login: "${GITHUB_OWNER}") {
              projectsV2(first: 100) {
                nodes {
                  id
                  title
                  repositories(first: 50) {
                    nodes {
                      name
                    }
                  }
                }
              }
            }
            repository(owner: "${GITHUB_OWNER}", name: "${GITHUB_REPO}") {
              projectsV2(first: 100) {
                nodes {
                  id
                  title
                }
              }
            }
          }
        `;

        const response = await octokit.graphql<any>(orgQuery);

        // Adicionar projetos diretamente ligados ao repositório
        if (response.repository?.projectsV2?.nodes) {
          console.log(`\n📊 Projetos encontrados diretamente no repositório:`);
          response.repository.projectsV2.nodes.forEach((project: any) => {
            console.log(`  - "${project.title}" (ID: ${project.id})`);
            projectMap.set(project.title, project.id);
          });
        }

        // Verificar projetos da organização para ver se estão associados ao repositório
        if (response.organization?.projectsV2?.nodes) {
          console.log(`\n📊 Projetos da organização associados ao repositório:`);
          response.organization.projectsV2.nodes.forEach((project: any) => {
            // Verificar se o projeto está associado ao repositório especificado
            if (project.repositories?.nodes) {
              const isAssociated = project.repositories.nodes.some((repo: any) => repo.name === GITHUB_REPO);

              if (isAssociated) {
                console.log(`  - "${project.title}" (ID: ${project.id})`);
                projectMap.set(project.title, project.id);
              }
            }
          });
        }
      } catch (graphqlError: any) {
        if (graphqlError.message && graphqlError.message.includes("Resource not accessible by personal access token")) {
          console.log("\n⚠️ Seu token não tem permissão para acessar projetos V2.");
          console.log("Para resolver, crie um novo token com os escopos: 'repo' e 'project'");
        }
      }
    }

    console.log(`\n📊 Total de projetos encontrados: ${projectMap.size}`);

    return projectMap;
  } catch (error) {
    if ((error as any).message && (error as any).message.includes("Resource not accessible by personal access token")) {
      console.log("\n⚠️ Seu token não tem permissão para acessar projetos.");
      console.log("Para resolver, crie um novo token com os escopos: 'repo' e 'project'");
      return projectMap;
    }
    console.error("❌ Erro ao buscar projetos:", error);
    return projectMap;
  }
}

// Função para listar projetos disponíveis
export async function listProjects(): Promise<void> {
  try {
    console.log(`\nProjetos disponíveis do repositório "${GITHUB_REPO}":`);

    // Tentar com GraphQL (ProjectsV2)
    try {
      const projects = await fetchProjects();
      if (projects.size === 0) {
        console.log("  Nenhum projeto encontrado para este repositório");
        console.log("  Dica: Vincule um projeto ao repositório no GitHub para ele aparecer aqui");
      } else {
        for (const [name, id] of projects.entries()) {
          console.log(`  📊 ${name}`);
        }
      }
    } catch (error: any) {
      if (error.message && error.message.includes("Resource not accessible by personal access token")) {
        console.log("\n⚠️ Seu token não tem permissão para acessar projetos V2.");
        console.log("Para resolver, use um token clássico (não fine-grained) com os escopos: 'repo' e 'project'");
      } else {
        console.log("  Erro ao buscar projetos");
        console.error(error);
      }
    }

    console.log("\n🔑 Se não conseguir ver seus projetos:");
    console.log("1. Use 'Personal access tokens (classic)' e não 'Fine-grained tokens'");
    console.log("2. Verifique se o token tem os escopos corretos (repo, project)");
    console.log("3. Certifique-se que o projeto está vinculado ao repositório no GitHub");
  } catch (error) {
    console.error("❌ Erro ao listar projetos:", error);
  }
}

// Função para adicionar issue a um projeto
async function addIssueToProject(issueNodeId: string, projectId: string): Promise<boolean> {
  try {
    // Primeiro obter o ID do projeto
    const getProjectQuery = `
      query {
        node(id: "${projectId}") {
          ... on ProjectV2 {
            id
          }
        }
      }
    `;

    const projectResponse = await octokit.graphql<ProjectQueryResponse>(getProjectQuery);

    // Adicionar o item ao projeto
    const mutation = `
      mutation {
        addProjectV2ItemById(input: {
          projectId: "${projectResponse.node.id}",
          contentId: "${issueNodeId}"
        }) {
          item {
            id
          }
        }
      }
    `;

    await octokit.graphql(mutation);
    return true;
  } catch (error) {
    console.error("❌ Erro ao adicionar issue ao projeto:", error);
    return false;
  }
}

// Função para criar issue no GitHub
export async function createGitHubIssue(task: Task): Promise<number | null> {
  try {
    // Primeiro buscar milestones para mapear nome -> número
    const milestones = await fetchMilestones();
    let milestoneNumber = undefined;

    if (task.milestone) {
      milestoneNumber = milestones.get(task.milestone.toLowerCase());
    }

    // Preparar labels para status
    const labels = [];
    if (task.status) {
      labels.push(`status:${task.status}`);
    }

    // Adicionar informação de status e synced no corpo da issue
    let taskBody = task.description || "";

    // Adicionar metadados ao final da descrição
    taskBody += `\n\n---\n`;
    taskBody += `**Status:** ${task.status}\n`;
    taskBody += `**Sincronizado:** ${task.synced ? "Sim" : "Não"}\n`;
    taskBody += `**ID Local:** ${task.id}\n`;

    // Criar a issue
    const response = await octokit.rest.issues.create({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      title: task.title,
      body: taskBody,
      milestone: milestoneNumber,
      labels: labels,
      state: task.status === "done" ? "closed" : "open",
    });

    console.log(`✅ Issue criada no GitHub: #${response.data.number}`);

    // Se tiver um projeto definido, buscar projetos e adicionar a issue ao projeto
    if (task.project) {
      const projects = await fetchProjects();

      // Tentar encontrar o projeto pela correspondência exata
      const projectId = projects.get(task.project);

      if (projectId) {
        const added = await addIssueToProject(response.data.node_id, projectId);
        if (added) {
          console.log(`✅ Issue adicionada ao projeto "${task.project}"`);
        }
      }
    }

    return response.data.number;
  } catch (error) {
    console.error("❌ Erro ao criar issue no GitHub:", error);
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

// Função para gerar nome de arquivo da task
function getTaskFilename(task: Task): string {
  const slug = task.title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");

  // Se tiver número de issue, incluir no nome do arquivo
  if (task.github_issue_number) {
    return `#${task.github_issue_number}-${task.id}-${slug}.json`;
  }

  // Se não tiver, usar o formato original
  return `${task.id}-${slug}.json`;
}

// Função para atualizar task local com informações do GitHub
export async function updateTaskWithGitHubInfo(task: Task, issueNumber: number): Promise<void> {
  try {
    // Primeiro remover arquivo antigo se ele existir
    const oldFilePath = path.join(
      ".task/issues",
      `${task.id}-${task.title
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]/g, "")}.json`
    );

    // Atualizar propriedades
    task.synced = true;
    task.github_issue_number = issueNumber;
    task.lastSyncAt = new Date().toISOString(); // Adicionar timestamp de sincronização

    // Gerar novo nome de arquivo com o número da issue
    const taskPath = path.join(".task/issues", getTaskFilename(task));

    // Remover o arquivo antigo se existir
    try {
      await fs.remove(oldFilePath);
    } catch (error) {
      // Ignora erro se o arquivo não existir
    }

    // Salvar no arquivo com novo nome
    await fs.writeJSON(taskPath, task, { spaces: 2 });
  } catch (error) {
    console.error(`❌ Erro ao atualizar task local "${task.title}":`, error);
  }
}

// Função para buscar uma issue específica no GitHub
export async function fetchGitHubIssue(issueNumber: number): Promise<any | null> {
  try {
    const response = await octokit.rest.issues.get({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      issue_number: issueNumber,
    });

    return response.data;
  } catch (error) {
    console.error(`❌ Erro ao buscar issue #${issueNumber} do GitHub:`, error);
    return null;
  }
}

// Função para atualizar task local a partir de uma issue do GitHub
export async function updateLocalTaskFromIssue(task: Task, issue: any): Promise<boolean> {
  try {
    // Extrair status dos labels ou estado da issue
    let status = task.status; // Manter o status atual por padrão

    if (issue.state === "closed") {
      status = "done";
    } else if (issue.labels && issue.labels.length > 0) {
      // Procurar por um label de status
      const statusLabel = issue.labels.find((label: any) => label.name.startsWith("status:"));

      if (statusLabel) {
        status = statusLabel.name.replace("status:", "");
      } else {
        status = "todo"; // Estado padrão para issues abertas sem label de status
      }
    }

    // Primeiro remover arquivo antigo se ele existir
    const oldFilePath = path.join(
      ".task/issues",
      `${task.id}-${task.title
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]/g, "")}.json`
    );

    if (task.github_issue_number) {
      const oldFileWithGithub = path.join(
        ".task/issues",
        `#${task.github_issue_number}-${task.id}-${task.title
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^\w-]/g, "")}.json`
      );
      try {
        await fs.remove(oldFileWithGithub);
      } catch (error) {
        // Ignora erro se o arquivo não existir
      }
    }

    // Extrair timestamp da última atualização da issue
    let lastSyncAt: string;
    if (issue.updated_at) {
      // Usar o timestamp fornecido pelo GitHub
      lastSyncAt = new Date(issue.updated_at).toISOString();
    } else {
      // Fallback para o timestamp atual
      lastSyncAt = new Date().toISOString();
    }

    // Extrair informações de projeto se existirem na descrição
    let projectFromDesc = "";
    if (issue.body && issue.body.includes("**Projeto:**")) {
      const projectMatch = issue.body.match(/\*\*Projeto:\*\*\s*(.*?)$/m);
      if (projectMatch && projectMatch[1]) {
        projectFromDesc = projectMatch[1].trim();
      }
    }

    // Atualizar propriedades
    task.title = issue.title;
    task.description = issue.body ? issue.body.split("---")[0].trim() : "";
    task.status = status;
    task.milestone = issue.milestone?.title || task.milestone;
    task.synced = true;
    task.github_issue_number = issue.number;
    task.lastSyncAt = lastSyncAt;

    // Se encontramos um projeto na descrição, usar ele
    if (projectFromDesc) {
      task.project = projectFromDesc;
    }

    // Buscar informações de projeto vinculado à issue (superior ao descrito no corpo)
    try {
      const projectInfo = await fetchIssueProjectInfo(issue.number);
      if (projectInfo) {
        task.project = projectInfo;
      }
    } catch (error) {
      // Silenciar erro
    }

    // Remover o arquivo antigo se existir
    try {
      await fs.remove(oldFilePath);
    } catch (error) {
      // Ignora erro se o arquivo não existir
    }

    // Salvar as alterações com novo nome de arquivo
    const taskPath = path.join(".task/issues", getTaskFilename(task));
    await fs.writeJSON(taskPath, task, { spaces: 2 });

    console.log(`✅ Task local "${task.title}" atualizada a partir da issue #${issue.number}`);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao atualizar task local a partir da issue #${issue.number}:`, error);
    return false;
  }
}

// Função para criar task local a partir de issue do GitHub
export async function createLocalTaskFromIssue(issue: any): Promise<void> {
  try {
    // Verificar se já existe uma task com esse número de issue
    const existingTasks = await fs.readdir(path.join(".task/issues"));
    const taskFiles = await Promise.all(existingTasks.map((file) => fs.readJSON(path.join(".task/issues", file))));

    const existingTask = taskFiles.find((t) => (t as Task).github_issue_number === issue.number) as Task | undefined;

    if (existingTask) {
      // Atualizar a task existente em vez de criar uma nova
      await updateLocalTaskFromIssue(existingTask, issue);
      return;
    }

    // Criar nova task se não existir
    const id = Date.now();
    const slug = issue.title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "");

    // Extrair status do label ou do estado da issue
    let status = "todo";
    if (issue.state === "closed") {
      status = "done";
    } else if (issue.labels && issue.labels.length > 0) {
      // Procurar por um label de status
      const statusLabel = issue.labels.find((label: any) => label.name.startsWith("status:"));

      if (statusLabel) {
        status = statusLabel.name.replace("status:", "");
      }
    }

    // Extrair timestamp da última atualização da issue
    let lastSyncAt: string;
    if (issue.updated_at) {
      // Usar o timestamp fornecido pelo GitHub
      lastSyncAt = new Date(issue.updated_at).toISOString();
    } else {
      // Fallback para o timestamp atual
      lastSyncAt = new Date().toISOString();
    }

    // Buscar informações de projeto vinculado à issue
    let projectName = "";
    try {
      const projectInfo = await fetchIssueProjectInfo(issue.number);
      if (projectInfo) {
        projectName = projectInfo;
      }
    } catch (error) {
      // Silenciar erro
    }

    const task: Task = {
      id,
      title: issue.title,
      description: issue.body ? issue.body.split("---")[0].trim() : "", // Remover metadados do corpo
      milestone: issue.milestone?.title || "",
      project: projectName, // Usar o projeto vinculado à issue
      status: status,
      synced: true,
      github_issue_number: issue.number,
      lastSyncAt: lastSyncAt, // Adicionar timestamp da última sincronização
    };

    // Usar novo formato de nome com número da issue
    const taskPath = path.join(".task/issues", getTaskFilename(task));
    await fs.ensureDir(path.join(".task/issues"));
    await fs.writeJSON(taskPath, task, { spaces: 2 });
    console.log(`✅ Task local criada a partir da issue #${issue.number}`);
  } catch (error) {
    console.error(`❌ Erro ao criar task local a partir da issue #${issue.number}:`, error);
  }
}

// Função para atualizar um issue no GitHub com status de task local
export async function updateGitHubIssue(task: Task): Promise<boolean> {
  try {
    if (!task.github_issue_number) {
      console.error(`❌ Task "${task.title}" não tem número de issue associado.`);
      return false;
    }

    // Buscar a issue atual para comparar
    const currentIssue = await fetchGitHubIssue(task.github_issue_number);
    if (!currentIssue) {
      console.error(`❌ Issue #${task.github_issue_number} não encontrada.`);
      return false;
    }

    // Verificar se há mudanças no status
    const currentStatus =
      currentIssue.state === "closed"
        ? "done"
        : currentIssue.labels?.find((l: any) => l.name.startsWith("status:"))?.name.replace("status:", "") || "todo";

    const statusChanged = currentStatus !== task.status;
    if (statusChanged) {
      console.log(`Status mudou de "${currentStatus}" para "${task.status}"`);
    }

    // Verificar se há mudanças no projeto
    const projectInfo = await fetchIssueProjectInfo(task.github_issue_number);
    const projectChanged = projectInfo !== task.project;

    if (projectChanged) {
      console.log(`Projeto mudou de "${projectInfo || "Nenhum"}" para "${task.project || "Nenhum"}"`);
    }

    // Preparar labels - manter labels existentes exceto as de status
    const existingLabels = currentIssue.labels
      .filter((label: any) => !label.name.startsWith("status:"))
      .map((label: any) => label.name);

    const labels = [...existingLabels];

    // Adicionar label de status
    if (task.status) {
      labels.push(`status:${task.status}`);
    }

    // Adicionar informação de status e synced no corpo da issue
    let taskBody = task.description || "";

    // Obter data/hora atual no formato ISO do GitHub
    const now = new Date().toISOString();
    task.lastSyncAt = now;

    // Adicionar metadados ao final da descrição
    taskBody += `\n\n---\n`;
    taskBody += `**Status:** ${task.status}\n`;
    taskBody += `**Sincronizado:** ${task.synced ? "Sim" : "Não"}\n`;
    taskBody += `**ID Local:** ${task.id}\n`;
    taskBody += `**Última Sincronização:** ${now}\n`;

    // Atualizar a issue
    await octokit.rest.issues.update({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      issue_number: task.github_issue_number,
      title: task.title,
      body: taskBody,
      state: task.status === "done" ? "closed" : "open",
      labels: labels,
    });

    // Se o projeto foi alterado, vincular a issue ao novo projeto
    if (projectChanged && task.project) {
      const projects = await fetchProjects();

      // Normalizar o nome do projeto para várias possibilidades (com/sem @)
      const projectName = task.project;
      const projectNameWithAt = projectName.startsWith("@") ? projectName : `@${projectName}`;
      const projectNameWithoutAt = projectName.startsWith("@") ? projectName.substring(1) : projectName;

      // Procurar projeto pelo nome exato ou variações
      let projectId =
        projects.get(projectName) || projects.get(projectNameWithAt) || projects.get(projectNameWithoutAt);

      if (projectId) {
        console.log(`Vinculando issue #${task.github_issue_number} ao projeto "${task.project}"`);
        const added = await addIssueToProject(currentIssue.node_id, projectId);
        if (added) {
          console.log(`✅ Issue adicionada ao projeto "${task.project}"`);
        } else {
          console.error(`❌ Não foi possível adicionar a issue ao projeto "${task.project}"`);
        }
      } else {
        console.error(`❌ Projeto "${task.project}" não encontrado no GitHub`);
      }
    }

    // Salvar a task atualizada com o novo timestamp
    const taskPath = path.join(".task/issues", getTaskFilename(task));
    await fs.writeJSON(taskPath, task, { spaces: 2 });

    console.log(`✅ Issue #${task.github_issue_number} atualizada com status: ${task.status}`);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao atualizar issue #${task.github_issue_number}:`, error);
    return false;
  }
}

// Função para buscar informações de projeto de uma issue específica
export async function fetchIssueProjectInfo(issueNumber: number): Promise<string | null> {
  try {
    // Primeiro, precisamos obter o ID do nó da issue para usar no GraphQL
    const issue = await octokit.rest.issues.get({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      issue_number: issueNumber,
    });

    if (!issue || !issue.data || !issue.data.node_id) {
      return null;
    }

    const issueNodeId = issue.data.node_id;

    // Consulta GraphQL para buscar projetos vinculados à issue
    const query = `
      query {
        node(id: "${issueNodeId}") {
          ... on Issue {
            title
            projectItems(first: 10) {
              nodes {
                project {
                  title
                }
              }
            }
            projectsV2(first: 10) {
              nodes {
                title
              }
            }
          }
        }
      }
    `;

    interface ProjectResponse {
      node: {
        projectItems?: {
          nodes: Array<{
            project: {
              title: string;
            };
          }>;
        };
        projectsV2?: {
          nodes: Array<{
            title: string;
          }>;
        };
      };
    }

    const response = await octokit.graphql<ProjectResponse>(query);

    // Verificar se a issue está em algum projeto
    if (response.node.projectItems && response.node.projectItems.nodes.length > 0) {
      // Projetos clássicos
      const projectTitle = response.node.projectItems.nodes[0].project.title;
      return projectTitle.startsWith("@") ? projectTitle.substring(1) : projectTitle;
    } else if (response.node.projectsV2 && response.node.projectsV2.nodes.length > 0) {
      // Projetos v2
      const projectTitle = response.node.projectsV2.nodes[0].title;
      return projectTitle.startsWith("@") ? projectTitle.substring(1) : projectTitle;
    }

    return null;
  } catch (error) {
    console.error(`❌ Erro ao buscar projetos da issue #${issueNumber}:`, error);
    return null;
  }
}

// Função para criar uma milestone no GitHub
export async function createMilestone(title: string, description: string = ""): Promise<number | null> {
  try {
    const response = await octokit.rest.issues.createMilestone({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      title: title,
      description: description,
      state: "open",
    });

    if (response.data.number) {
      console.log(`✅ Milestone "${title}" criada com sucesso (ID: ${response.data.number})`);
      return response.data.number;
    }
    return null;
  } catch (error) {
    console.error(`❌ Erro ao criar milestone "${title}":`, error);
    return null;
  }
}

// Função para criar um projeto no GitHub (ProjectV2)
export async function createProject(title: string, description: string = ""): Promise<string | null> {
  try {
    console.log(`\n🔍 Criando projeto "${title}" no GitHub...`);

    // Se o título já tiver '@', vamos remover para padronizar
    const normalizedTitle = title.startsWith("@") ? title.substring(1) : title;

    // Vamos obter primeiro o ID do usuário ou organização
    let ownerId: string | null = null;
    const isUserAccount = await isUser();

    if (isUserAccount) {
      // Obter ID do usuário
      const userQuery = `
        query {
          user(login: "${GITHUB_OWNER}") {
            id
          }
        }
      `;
      const userResponse: any = await octokit.graphql(userQuery);
      ownerId = userResponse.user.id;
    } else {
      // Obter ID da organização
      const orgQuery = `
        query {
          organization(login: "${GITHUB_OWNER}") {
            id
          }
        }
      `;
      const orgResponse: any = await octokit.graphql(orgQuery);
      ownerId = orgResponse.organization.id;
    }

    if (!ownerId) {
      console.error(`❌ Não foi possível obter o ID do proprietário "${GITHUB_OWNER}"`);
      return null;
    }

    // Criar o projeto usando o ID do proprietário
    const createQuery = `
      mutation {
        createProjectV2(input: {
          ownerId: "${ownerId}",
          title: "${normalizedTitle}"
        }) {
          projectV2 {
            id
          }
        }
      }
    `;

    const response: any = await octokit.graphql(createQuery);

    if (response?.createProjectV2?.projectV2?.id) {
      const projectId = response.createProjectV2.projectV2.id;
      console.log(`✅ Projeto "${normalizedTitle}" criado com sucesso (ID: ${projectId})`);

      // Buscar projetos novamente para atualizar o cache
      console.log(`🔄 Atualizando cache de projetos...`);
      const projects = await fetchProjects();

      return projectId;
    }
    return null;
  } catch (error) {
    console.error(`❌ Erro ao criar projeto "${title}":`, error);
    return null;
  }
}

// Exportação padrão com todas as funções
export default {
  listMilestones,
  listProjects,
  fetchMilestones,
  fetchProjects,
  createGitHubIssue,
  fetchGitHubIssues,
  updateTaskWithGitHubInfo,
  fetchGitHubIssue,
  updateLocalTaskFromIssue,
  createLocalTaskFromIssue,
  updateGitHubIssue,
  fetchIssueProjectInfo,
  createMilestone,
  createProject,
};
