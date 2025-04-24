import chalk from "chalk";
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
  state?: string; // Estado da issue no GitHub (open/closed)
  deleted?: boolean; // Indica se a task foi marcada como excluída
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
    response.data.forEach((milestone: any) => {
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
      response.data.forEach((milestone: any) => {
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
    // Verificar se a task tem projeto e milestone
    if (!task.project || !task.milestone) {
      console.error(`❌ Task deve ter projeto e milestone definidos.`);
      return null;
    }

    // Preparar labels
    const labels = [`status:${task.status}`];

    // Adicionar informação de status e synced no corpo da issue
    let taskBody = task.description || "";

    // Obter data/hora atual no formato ISO do GitHub
    const now = new Date().toISOString();

    // Adicionar metadados ao final da descrição
    taskBody += `\n\n---\n`;
    taskBody += `**Status:** ${task.status}\n`;
    taskBody += `**Projeto:** ${task.project}\n`;
    taskBody += `**Milestone:** ${task.milestone}\n`;
    taskBody += `**Sincronizado:** Sim\n`;
    taskBody += `**ID Local:** ${task.id}\n`;
    taskBody += `**Última Sincronização:** ${now}\n`;

    // Buscar ID da milestone
    const milestones = await fetchMilestones();
    const milestone = Array.from(milestones.entries()).find(
      ([name]) => name.toLowerCase() === task.milestone.toLowerCase()
    );

    let milestoneId = null;
    if (milestone) {
      milestoneId = milestone[1];
    } else {
      // Criar milestone se não existir
      milestoneId = await createMilestone(task.milestone);
      if (!milestoneId) {
        console.error(`❌ Não foi possível criar a milestone "${task.milestone}".`);
      }
    }

    // Criar a issue no GitHub
    const response = await octokit.rest.issues.create({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      title: task.title,
      body: taskBody,
      labels: labels,
      milestone: milestoneId,
      assignees: [GITHUB_OWNER],
    });

    if (!response.data.number) {
      console.error(`❌ Erro ao criar issue: Resposta sem número de issue`);
      return null;
    }

    const issueNumber = response.data.number;
    console.log(`✅ Issue #${issueNumber} criada com sucesso`);

    // Adicionar a issue ao projeto
    const projects = await fetchProjects();
    const projectId = projects.get(task.project);

    if (projectId) {
      const added = await addIssueToProject(response.data.node_id, projectId);
      if (added) {
        console.log(`✅ Issue adicionada ao projeto "${task.project}"`);

        // Novo: Atualizar o status no projeto
        try {
          console.log(`Tentando definir status da nova issue #${issueNumber} para "${task.status}" no projeto...`);

          // Buscar opções de status do projeto
          const statusOptions = await fetchProjectStatusOptions(projectId);

          if (statusOptions && statusOptions.includes(task.status.toLowerCase())) {
            console.log(`Status "${task.status}" encontrado nas opções do projeto, definindo...`);

            // Chamar a função de atualização de status no projeto
            const updated = await updateProjectItemStatus(response.data.node_id, projectId, task.status);

            if (updated) {
              console.log(`✅ Status definido no projeto para "${task.status}"`);
            } else {
              console.log(`⚠️ Falha ao definir status no projeto`);
            }
          } else {
            console.log(`⚠️ Status "${task.status}" não encontrado nas opções do projeto`);
          }
        } catch (error) {
          console.error(`❌ Erro ao tentar definir status no projeto:`, error);
          // Continuar mesmo com erro no update do projeto
        }
      } else {
        console.error(`❌ Erro ao adicionar issue ao projeto "${task.project}"`);
      }
    } else {
      console.error(`❌ Projeto "${task.project}" não encontrado`);
    }

    return issueNumber;
  } catch (error) {
    console.error(`❌ Erro ao criar issue: `, error);
    return null;
  }
}

/**
 * Busca issues do GitHub para um repositório específico
 */
export const fetchGitHubIssues = async (): Promise<any[]> => {
  try {
    // Verificar se as variáveis de ambiente estão definidas
    if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_OWNER || !process.env.GITHUB_REPO) {
      throw new Error("Variáveis de ambiente GITHUB_TOKEN, GITHUB_OWNER e GITHUB_REPO são necessárias.");
    }

    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;

    console.log(`\nBuscando issues no repositório ${owner}/${repo}...`);

    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });

    // Implementação com paginação para buscar todas as issues abertas
    console.log("Buscando issues abertas com paginação...");
    const openIssues: any[] = [];
    let pageOpen = 1;
    let hasMoreOpenIssues = true;

    while (hasMoreOpenIssues) {
      try {
        const response = await octokit.rest.issues.list({
          owner,
          repo,
          state: "open",
          per_page: 100,
          page: pageOpen,
        });

        if (response.data.length === 0) {
          hasMoreOpenIssues = false;
        } else {
          openIssues.push(...response.data);
          console.log(`  Página ${pageOpen}: encontradas ${response.data.length} issues abertas`);
          pageOpen++;
        }
      } catch (error: any) {
        console.error(`Erro ao buscar página ${pageOpen} de issues abertas:`, error.message);
        hasMoreOpenIssues = false;
      }
    }

    // Implementação com paginação para buscar todas as issues fechadas
    console.log("Buscando issues fechadas com paginação...");
    const closedIssues: any[] = [];
    let pageClosed = 1;
    let hasMoreClosedIssues = true;

    while (hasMoreClosedIssues) {
      try {
        const response = await octokit.rest.issues.list({
          owner,
          repo,
          state: "closed",
          per_page: 100,
          page: pageClosed,
        });

        if (response.data.length === 0) {
          hasMoreClosedIssues = false;
        } else {
          closedIssues.push(...response.data);
          console.log(`  Página ${pageClosed}: encontradas ${response.data.length} issues fechadas`);
          pageClosed++;
        }
      } catch (error: any) {
        console.error(`Erro ao buscar página ${pageClosed} de issues fechadas:`, error.message);
        hasMoreClosedIssues = false;
      }
    }

    // Buscar informações sobre o repositório para validação
    console.log("Verificando informações do repositório...");
    try {
      const repoInfo = await octokit.rest.repos.get({
        owner,
        repo,
      });
      console.log(`✅ Conectado ao repositório: ${repoInfo.data.full_name}`);
      console.log(`   Descrição: ${repoInfo.data.description || "Nenhuma"}`);
      console.log(`   Issues abertas (contagem do GitHub): ${repoInfo.data.open_issues_count}`);
    } catch (error: any) {
      console.error(`⚠️ Erro ao acessar o repositório: ${error.message}`);
      console.log(`⚠️ Verifique se as variáveis GITHUB_OWNER='${owner}' e GITHUB_REPO='${repo}' estão corretas`);

      if (error.status === 401) {
        console.error(
          `⚠️ Erro de autenticação (401). Verifique se o token GITHUB_TOKEN é válido e tem as permissões necessárias.`
        );
      } else if (error.status === 404) {
        console.error(
          `⚠️ Repositório não encontrado (404). Verifique se o proprietário e o nome do repositório estão corretos.`
        );
      }
    }

    // Combinar issues abertas e fechadas
    const allIssues = [...openIssues, ...closedIssues];

    // Filtrar pull requests, pois a API também retorna PRs como issues
    const issuesOnly = allIssues.filter((issue) => !issue.pull_request);

    // Verificar projetos associados ao repositório
    console.log("\nVerificando projetos associados ao repositório...");
    try {
      const projects = await fetchProjects();
      if (projects.size > 0) {
        console.log(`Encontrados ${projects.size} projetos associados:`);
        for (const [name, id] of projects.entries()) {
          console.log(`  - ${name} (ID: ${id.substring(0, 10)}...)`);
        }
      } else {
        console.log("Nenhum projeto encontrado associado ao repositório.");
      }
    } catch (error) {
      console.error("Erro ao buscar projetos:", error);
    }

    console.log(
      `\nTotal: ${issuesOnly.length} issues encontradas (${openIssues.length} abertas, ${closedIssues.length} fechadas)`
    );

    return issuesOnly;
  } catch (error) {
    console.error("Erro ao buscar issues do GitHub:", error);
    return [];
  }
};

// Função para gerar nome de arquivo da task
export function getTaskFilename(task: Task): string {
  const sanitizedTitle = task.title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");

  // Se tiver número de issue, incluir no nome do arquivo
  if (task.github_issue_number) {
    return `#${task.github_issue_number}-${task.id}-${sanitizedTitle}.json`;
  }

  // Se não tiver, usar o formato original
  return `${task.id}-${sanitizedTitle}.json`;
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
  } catch (error: any) {
    // Verifica se é um erro 404 (não encontrado)
    if (error.status === 404) {
      console.log(`⚠️ Issue #${issueNumber} não encontrada no GitHub, possivelmente foi excluída.`);
      return {
        number: issueNumber,
        state: "deleted",
        title: "Issue excluída no GitHub",
        body: "",
        labels: [],
        milestone: null,
        node_id: null,
      };
    }

    console.error(`❌ Erro ao buscar issue #${issueNumber} do GitHub:`, error);
    return null;
  }
}

// Função para extrair o status de uma issue do GitHub
export async function extractStatusFromIssue(issue: any): Promise<string> {
  try {
    // Verificar se a issue recebida é válida
    if (!issue) {
      console.log("Issue inválida recebida na função extractStatusFromIssue");
      return "todo";
    }

    // Verificar se a issue foi excluída
    if (issue.state === "deleted") {
      return "deleted";
    }

    // Verificar status nas labels
    if (issue.labels && Array.isArray(issue.labels)) {
      const statusLabel = issue.labels.find((label: any) => label && label.name && label.name.startsWith("status:"));
      if (statusLabel) {
        return statusLabel.name.replace("status:", "");
      }
    }

    // Verificar status no projeto
    try {
      if (issue.number) {
        const projectStatus = await fetchProjectStatus(issue.number);
        if (projectStatus) {
          return projectStatus;
        }
      }
    } catch (err) {
      console.log(`Erro ao buscar status de projeto para issue #${issue.number}`, err);
    }

    // Verificar estado da issue
    if (issue.state === "closed") {
      return "done";
    }

    // Valor padrão
    return "todo";
  } catch (error) {
    console.error(`Erro ao extrair status da issue:`, error);
    return "todo";
  }
}

// Função para buscar o status de uma issue no projeto do GitHub
async function fetchProjectStatus(issueNumber: number): Promise<string | null> {
  try {
    // Primeiro, obter o ID do nó da issue
    const issue = await octokit.rest.issues.get({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      issue_number: issueNumber,
    });

    if (!issue || !issue.data || !issue.data.node_id) {
      return null;
    }

    const issueNodeId = issue.data.node_id;

    // Consulta GraphQL para buscar status no projeto
    const query = `
      query {
        node(id: "${issueNodeId}") {
          ... on Issue {
            title
            projectItems(first: 10) {
              nodes {
                fieldValues(first: 10) {
                  nodes {
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field {
                        ... on ProjectV2SingleSelectField {
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    interface ProjectStatusResponse {
      node: {
        projectItems?: {
          nodes: Array<{
            fieldValues: {
              nodes: Array<{
                name?: string;
                field?: {
                  name?: string;
                };
              }>;
            };
          }>;
        };
      };
    }

    const response = await octokit.graphql<ProjectStatusResponse>(query);

    // Verificar se encontramos campos de status no projeto
    if (response.node.projectItems && response.node.projectItems.nodes.length > 0) {
      for (const projectItem of response.node.projectItems.nodes) {
        if (projectItem.fieldValues && projectItem.fieldValues.nodes) {
          for (const fieldValue of projectItem.fieldValues.nodes) {
            // Verificar se é um campo de status
            if (
              fieldValue.field &&
              fieldValue.name &&
              fieldValue.field.name &&
              (fieldValue.field.name === "Status" ||
                fieldValue.field.name.toLowerCase() === "status" ||
                fieldValue.field.name.toLowerCase().includes("status"))
            ) {
              return fieldValue.name.toLowerCase();
            }
          }
        }
      }
    }

    return null;
  } catch (error: any) {
    // Se for erro 404, simplesmente retorna null sem logar o erro
    if (error.status === 404) {
      return null;
    }
    console.error(`❌ Erro ao buscar status da issue #${issueNumber} no projeto:`, error);
    return null;
  }
}

// Função para atualizar task local a partir de uma issue do GitHub
export async function updateLocalTaskFromIssue(task: Task, issue: any): Promise<boolean> {
  try {
    console.log(`Atualizando task local com base na issue #${issue.number}...`);
    console.log(`Dados brutos da milestone recebida: ${JSON.stringify(issue.milestone || "Nenhuma")}`);

    // Extrair status da issue usando a função auxiliar
    const status = await extractStatusFromIssue(issue);

    // Extrair informações de milestone da issue
    const milestoneName = issue.milestone?.title || "";

    console.log(`Milestone extraída: "${milestoneName}"`);

    // Comparar valores atuais com os valores da issue do GitHub para log
    if (task.status !== status) {
      console.log(chalk.yellow(`  - Status atualizado: "${task.status || "Nenhum"}" → "${status || "Nenhum"}"`));
    }

    if (task.milestone !== milestoneName) {
      console.log(
        chalk.yellow(`  - Milestone atualizada: "${task.milestone || "Nenhuma"}" → "${milestoneName || "Nenhuma"}"`)
      );
    }

    // Calcular os nomes de arquivos antigos que precisamos verificar e remover
    // 1. Nome baseado apenas no ID (formato antigo)
    const sanitizedOldTitle = task.title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "");

    const oldFilePath = path.join(".task/issues", `${task.id}-${sanitizedOldTitle}.json`);

    // 2. Nome baseado no número da issue e ID
    let oldFileWithGithubPath = null;
    if (task.github_issue_number) {
      oldFileWithGithubPath = path.join(
        ".task/issues",
        `#${task.github_issue_number}-${task.id}-${sanitizedOldTitle}.json`
      );
    }

    // Remover arquivos antigos se existirem
    try {
      if (fs.existsSync(oldFilePath)) {
        console.log(`Removendo arquivo antigo: ${oldFilePath}`);
        await fs.remove(oldFilePath);
      }

      if (oldFileWithGithubPath && fs.existsSync(oldFileWithGithubPath)) {
        console.log(`Removendo arquivo antigo com GitHub: ${oldFileWithGithubPath}`);
        await fs.remove(oldFileWithGithubPath);
      }
    } catch (error) {
      console.log(`Erro ao remover arquivos antigos: ${error}`);
      // Continue mesmo se houver erros na remoção
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
      const projectMatch = issue.body.match(/\*\*Projeto:\*\*\s*(.*?)(\n|$)/);
      if (projectMatch && projectMatch[1]) {
        projectFromDesc = projectMatch[1].trim();
        if (projectFromDesc === "Nenhum") {
          projectFromDesc = "";
        }
      }
    }

    // Extrair milestone da descrição se existir (caso o objeto milestone esteja ausente)
    let milestoneFromDesc = "";
    if (issue.body && issue.body.includes("**Milestone:**")) {
      const milestoneMatch = issue.body.match(/\*\*Milestone:\*\*\s*(.*?)(\n|$)/);
      if (milestoneMatch && milestoneMatch[1]) {
        milestoneFromDesc = milestoneMatch[1].trim();
        if (milestoneFromDesc === "Nenhuma") {
          milestoneFromDesc = "";
        }
      }
    }

    // Determinar milestone final (prioridade: objeto milestone > descrição)
    const finalMilestoneName = milestoneName || milestoneFromDesc;
    console.log(`Milestone final a ser usado: "${finalMilestoneName}"`);

    // Atualizar propriedades da task local com base na issue do GitHub
    const originalValues = {
      milestone: task.milestone,
      status: task.status,
      project: task.project,
    };

    // Atualizar propriedades da task
    task.title = issue.title;
    task.description = issue.body ? issue.body.split("---")[0].trim() : "";
    task.status = status;
    task.milestone = finalMilestoneName; // Garantir que a milestone é atualizada
    task.synced = true;
    task.github_issue_number = issue.number;
    task.lastSyncAt = lastSyncAt;
    task.state = issue.state; // Armazenar o estado da issue (open/closed)

    // Inicializar o projeto como vazio por padrão
    task.project = projectFromDesc || "";

    // Buscar informações de projeto vinculado à issue (superior ao descrito no corpo)
    try {
      const projectInfo = await fetchIssueProjectInfo(issue.number);
      if (projectInfo) {
        if (task.project !== projectInfo) {
          console.log(chalk.yellow(`  - Projeto atualizado: "${task.project || "Nenhum"}" → "${projectInfo}"`));
        }
        task.project = projectInfo;
      }
    } catch (error) {
      console.log(`Erro ao buscar projeto: ${error}`);
    }

    // Gerar o nome de arquivo atualizado
    const newFileName = getTaskFilename(task);
    const taskPath = path.join(".task/issues", newFileName);

    console.log(`Salvando task atualizada em: ${taskPath}`);
    console.log(`Salvando milestone: "${task.milestone}" (era: "${originalValues.milestone}")`);

    // Criar uma cópia para verificação posterior
    const taskToSave = { ...task };

    // Salvar o JSON no arquivo
    await fs.writeJSON(taskPath, task, { spaces: 2 });

    // Verificar se o arquivo foi salvo corretamente
    try {
      if (!fs.existsSync(taskPath)) {
        console.log(chalk.red(`⚠️ ERRO: Arquivo não encontrado após o salvamento: ${taskPath}`));
        return false;
      }

      const savedTask = await fs.readJSON(taskPath);

      // Verificar se a milestone foi salva corretamente
      if (savedTask.milestone !== taskToSave.milestone) {
        console.log(
          chalk.red(
            `⚠️ ERRO: A milestone não foi salva corretamente. Esperado: "${taskToSave.milestone}", Atual: "${savedTask.milestone}"`
          )
        );

        // Tentar uma nova abordagem de salvamento
        console.log(chalk.yellow(`Tentando salvar milestone novamente com método alternativo...`));

        // Abordagem direta com fs.writeFileSync
        const taskData = JSON.stringify({ ...task, milestone: taskToSave.milestone }, null, 2);
        fs.writeFileSync(taskPath, taskData);

        // Verificar novamente
        const rereadTask = await fs.readJSON(taskPath);
        if (rereadTask.milestone !== taskToSave.milestone) {
          console.log(
            chalk.red(`⚠️ ERRO PERSISTENTE: A milestone ainda não foi salva corretamente após segunda tentativa.`)
          );
          return false;
        }

        console.log(chalk.green(`✅ Milestone salva corretamente após segunda tentativa!`));
      }

      // Verificar se o status foi salvo corretamente
      if (savedTask.status !== status) {
        console.log(
          chalk.red(`⚠️ ERRO: O status não foi salvo corretamente. Esperado: "${status}", Atual: "${savedTask.status}"`)
        );
        return false;
      }

      // Resumo das mudanças reais
      if (originalValues.milestone !== savedTask.milestone) {
        console.log(
          chalk.green(`✅ Milestone atualizada e verificada: "${originalValues.milestone}" → "${savedTask.milestone}"`)
        );
      }

      if (originalValues.status !== savedTask.status) {
        console.log(
          chalk.green(`✅ Status atualizado e verificado: "${originalValues.status}" → "${savedTask.status}"`)
        );
      }

      if (originalValues.project !== savedTask.project) {
        console.log(
          chalk.green(`✅ Projeto atualizado e verificado: "${originalValues.project}" → "${savedTask.project}"`)
        );
      }
    } catch (error) {
      console.error(`Erro ao verificar salvamento do arquivo: ${error}`);
      return false;
    }

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

    // Extrair o status da issue usando a função auxiliar
    const status = await extractStatusFromIssue(issue);

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

    // Obter a milestone da issue (ou string vazia se não existir)
    const milestoneName = issue.milestone?.title || "";

    const task: Task = {
      id,
      title: issue.title,
      description: issue.body ? issue.body.split("---")[0].trim() : "", // Remover metadados do corpo
      milestone: milestoneName,
      project: projectName, // Usar o projeto vinculado à issue
      status: status,
      synced: true,
      github_issue_number: issue.number,
      lastSyncAt: lastSyncAt, // Adicionar timestamp da última sincronização
      state: issue.state, // Armazenar o estado da issue (open/closed)
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

// Adicionar issue a vários projetos
async function addIssueToMultipleProjects(issueNodeId: string, projectNames: string[]): Promise<boolean> {
  try {
    // Buscar todos os projetos disponíveis
    const availableProjects = await fetchProjects();

    // Converter nomes para IDs de projetos
    const projectIds: string[] = [];

    for (const projectName of projectNames) {
      // Normalizar o nome do projeto para várias possibilidades (com/sem @)
      const nameWithAt = projectName.startsWith("@") ? projectName : `@${projectName}`;
      const nameWithoutAt = projectName.startsWith("@") ? projectName.substring(1) : projectName;

      // Procurar projeto pelo nome exato ou variações
      const projectId =
        availableProjects.get(projectName) || availableProjects.get(nameWithAt) || availableProjects.get(nameWithoutAt);

      if (projectId) {
        projectIds.push(projectId);
      } else {
        console.log(`⚠️ Projeto "${projectName}" não encontrado`);
      }
    }

    // Se não encontrou nenhum projeto, retornar false
    if (projectIds.length === 0) {
      console.log("❌ Nenhum projeto válido encontrado para adicionar a issue");
      return false;
    }

    // Adicionar a issue a cada projeto encontrado
    let success = true;
    for (const projectId of projectIds) {
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
        console.log(`✅ Issue adicionada ao projeto ID: ${projectId}`);
      } catch (error) {
        console.error(`❌ Erro ao adicionar issue ao projeto ${projectId}:`, error);
        success = false;
      }
    }

    return success;
  } catch (error) {
    console.error("❌ Erro ao adicionar issue aos projetos:", error);
    return false;
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
    const issue = await fetchGitHubIssue(task.github_issue_number);

    // Verificar se a issue foi excluída no GitHub (retorna null quando a issue não existe)
    if (!issue) {
      console.log(`⚠️ Issue #${task.github_issue_number} não foi encontrada no GitHub (provavelmente excluída).`);
      console.log(`📝 Atualizando status da task local para "deleted"`);

      // Atualizar status local para mostrar que a issue foi excluída no GitHub
      task.status = "deleted";
      task.state = "deleted";
      task.lastSyncAt = new Date().toISOString();

      // Salvar a task atualizada com o novo status
      const taskPath = path.join(".task/issues", getTaskFilename(task));
      await fs.writeJSON(taskPath, task, { spaces: 2 });

      return true;
    }

    // Verificar se a issue tem o estado "deleted" explícito
    if (issue.state === "deleted") {
      console.log(`⚠️ Issue #${task.github_issue_number} foi marcada como excluída no GitHub.`);
      console.log(`📝 Atualizando status da task local para "deleted"`);

      // Atualizar status local para mostrar que a issue foi excluída no GitHub
      task.status = "deleted";
      task.state = "deleted";
      task.lastSyncAt = new Date().toISOString();

      // Salvar a task atualizada com o novo status
      const taskPath = path.join(".task/issues", getTaskFilename(task));
      await fs.writeJSON(taskPath, task, { spaces: 2 });

      return true;
    }

    // Verificar se há mudanças no status
    const currentStatus = await extractStatusFromIssue(issue);
    const statusChanged = currentStatus !== task.status;
    if (statusChanged) {
      console.log(`Status mudou de "${currentStatus}" para "${task.status}"`);
    }

    // Buscar projetos atuais vinculados à issue
    const currentProjectInfo = await fetchIssueProjectInfo(task.github_issue_number);

    // Verificar se há mudanças no projeto
    const projectChanged = currentProjectInfo !== task.project;
    if (projectChanged) {
      console.log(`Projeto mudou de "${currentProjectInfo || "Nenhum"}" para "${task.project || "Nenhum"}"`);
    }

    // Verificar se há mudanças na milestone
    const currentMilestone = issue.milestone?.title || "";
    const milestoneChanged = currentMilestone !== task.milestone;

    if (milestoneChanged) {
      console.log(`Milestone mudou de "${currentMilestone || "Nenhuma"}" para "${task.milestone || "Nenhuma"}"`);
    }

    // Preparar labels - manter labels existentes exceto as de status
    const existingLabels = Array.isArray(issue.labels)
      ? issue.labels
          .filter((label: any) => label && label.name && !label.name.startsWith("status:"))
          .map((label: any) => label.name)
      : [];

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
    taskBody += `**Projeto:** ${task.project || "Nenhum"}\n`;
    taskBody += `**Milestone:** ${task.milestone || "Nenhuma"}\n`;
    taskBody += `**Sincronizado:** ${task.synced ? "Sim" : "Não"}\n`;
    taskBody += `**ID Local:** ${task.id}\n`;
    taskBody += `**Última Sincronização:** ${now}\n`;

    // Buscar o ID da milestone se foi alterada
    let milestoneNumber = undefined;
    if (milestoneChanged && task.milestone) {
      // Recarregar todas as milestones para garantir que temos as mais recentes
      const milestones = await fetchMilestones();
      console.log(`🔍 Verificando milestone "${task.milestone}"...`);

      // Verificar se já existe (de maneira case-insensitive)
      const existingMilestone = Array.from(milestones.entries()).find(
        ([name]) => name.toLowerCase() === task.milestone.toLowerCase()
      );

      if (existingMilestone) {
        milestoneNumber = existingMilestone[1];
        console.log(`✅ Milestone "${task.milestone}" já existe (ID: ${milestoneNumber})`);
      } else {
        console.log(`⚠️ Milestone "${task.milestone}" não encontrada no GitHub, tentando criar...`);
        try {
          milestoneNumber = await createMilestone(task.milestone);
          if (!milestoneNumber) {
            console.log(`❌ Não foi possível criar a milestone "${task.milestone}"`);
            console.log(`⚠️ A issue será atualizada sem milestone.`);
          } else {
            console.log(`✅ Milestone "${task.milestone}" criada com sucesso (ID: ${milestoneNumber})`);
          }
        } catch (error: any) {
          // Verificar se o erro é de "already exists"
          if (error.status === 422 && error.response?.data?.errors?.some((e: any) => e.code === "already_exists")) {
            console.log(`⚠️ Milestone "${task.milestone}" já existe, mas não foi encontrada inicialmente.`);
            console.log(`🔍 Buscando milestones novamente...`);

            // Recarregar as milestones para obter a recém-criada
            const refreshedMilestones = await fetchMilestones();
            const foundMilestone = Array.from(refreshedMilestones.entries()).find(
              ([name]) => name.toLowerCase() === task.milestone.toLowerCase()
            );

            if (foundMilestone) {
              milestoneNumber = foundMilestone[1];
              console.log(`✅ Milestone encontrada após nova busca (ID: ${milestoneNumber})`);
            } else {
              console.log(`❌ Não foi possível encontrar a milestone, mesmo após nova busca.`);
              console.log(`⚠️ A issue será atualizada sem milestone.`);
            }
          } else {
            console.error(`❌ Erro ao criar milestone:`, error);
            console.log(`⚠️ A issue será atualizada sem milestone.`);
          }
        }
      }
    }

    // Atualizar a issue
    await octokit.rest.issues.update({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      issue_number: task.github_issue_number,
      title: task.title,
      body: taskBody,
      state: task.status === "done" ? "closed" : "open",
      labels: labels,
      milestone: milestoneChanged ? milestoneNumber : undefined,
      assignees: [GITHUB_OWNER],
    });

    // Se o projeto foi alterado, vincular a issue aos projetos apropriados
    if (projectChanged && task.project && issue.node_id) {
      // Lista de projetos para adicionar a issue
      const projectsToAdd: string[] = [];

      // Adicionar o projeto principal da task
      projectsToAdd.push(task.project);

      // Adicionar também o projeto "Sistema de Gestão de Tarefas com Tags" se o nome incluir palavras-chave
      const isTaskRelated =
        task.title.toLowerCase().includes("tarefa") ||
        task.title.toLowerCase().includes("task") ||
        task.description?.toLowerCase().includes("tarefa") ||
        task.description?.toLowerCase().includes("task");

      if (isTaskRelated && !task.project.includes("Sistema de Gestão")) {
        projectsToAdd.push("Sistema de Gestão de Tarefas com Tags");
      }

      // Se o título contém "partner" ou "fornecedor", adicionar ao projeto "partners"
      const isPartnerRelated =
        task.title.toLowerCase().includes("partner") || task.title.toLowerCase().includes("fornecedor");

      if (isPartnerRelated && !task.project.includes("partners")) {
        projectsToAdd.push("partners");
      }

      console.log(`Vinculando issue #${task.github_issue_number} aos projetos: ${projectsToAdd.join(", ")}`);
      const added = await addIssueToMultipleProjects(issue.node_id, projectsToAdd);

      if (added) {
        console.log(`✅ Issue vinculada aos projetos com sucesso`);
      } else {
        console.error(`❌ Houve problemas ao vincular a issue aos projetos`);
      }
    }

    // Se o status mudou, tentar atualizar no projeto também
    if (statusChanged && task.project && issue.node_id) {
      try {
        // Buscar projetos existentes
        const projects = await fetchProjects();

        // Encontrar o ID do projeto da task
        const projectId = projects.get(task.project);

        if (projectId) {
          console.log(
            `Tentando atualizar status da issue #${task.github_issue_number} no projeto "${task.project}"...`
          );

          // Buscar opções de status do projeto
          const statusOptions = await fetchProjectStatusOptions(projectId);

          if (statusOptions && statusOptions.includes(task.status.toLowerCase())) {
            console.log(`Status "${task.status}" encontrado nas opções do projeto, atualizando...`);

            // Chamar a função de atualização de status no projeto
            const updated = await updateProjectItemStatus(issue.node_id, projectId, task.status);

            if (updated) {
              console.log(`✅ Status atualizado no projeto para "${task.status}"`);
            } else {
              console.log(`⚠️ Falha ao atualizar status no projeto`);
            }
          } else {
            console.log(`⚠️ Status "${task.status}" não encontrado nas opções do projeto`);
          }
        }
      } catch (error) {
        console.error(`❌ Erro ao tentar atualizar status no projeto:`, error);
        // Continuar mesmo com erro no update do projeto
      }
    }

    // Salvar a task atualizada com o novo timestamp
    const taskPath = path.join(".task/issues", getTaskFilename(task));
    await fs.writeJSON(taskPath, task, { spaces: 2 });

    console.log(`✅ Issue #${task.github_issue_number} atualizada com sucesso`);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao atualizar issue #${task.github_issue_number}:`, error);
    return false;
  }
}

// Função para buscar informações de projeto de uma issue específica
export async function fetchIssueProjectInfo(issueNumber: number): Promise<string | null> {
  try {
    console.log(`Buscando projetos vinculados à issue #${issueNumber}...`);

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

    // Consulta GraphQL para buscar projetos vinculados à issue (expandindo o limite para 20 projetos)
    const query = `
      query {
        node(id: "${issueNodeId}") {
          ... on Issue {
            title
            projectItems(first: 20) {
              nodes {
                project {
                  title
                }
              }
            }
            projectsV2(first: 20) {
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

    // Listar todos os projetos encontrados (para debugging)
    const projectsFound: string[] = [];

    // Verificar projetos clássicos
    if (response.node.projectItems && response.node.projectItems.nodes.length > 0) {
      response.node.projectItems.nodes.forEach((node) => {
        if (node.project && node.project.title) {
          projectsFound.push(node.project.title);
        }
      });
    }

    // Verificar projetos V2
    if (response.node.projectsV2 && response.node.projectsV2.nodes.length > 0) {
      response.node.projectsV2.nodes.forEach((node) => {
        if (node.title) {
          projectsFound.push(node.title);
        }
      });
    }

    // Se encontrou algum projeto, mostrar quais foram encontrados
    if (projectsFound.length > 0) {
      console.log(`Projetos encontrados para issue #${issueNumber}: ${projectsFound.join(", ")}`);

      // Primeiro, procurar pelo projeto "Sistema de Gestão de Tarefas com Tags" (preferencial)
      const sistemaTarefas = projectsFound.find(
        (title) => title.includes("Sistema de Gestão de Tarefas") || title.toLowerCase().includes("tarefas")
      );

      if (sistemaTarefas) {
        console.log(`Usando projeto prioritário: "${sistemaTarefas}"`);
        return sistemaTarefas.startsWith("@") ? sistemaTarefas.substring(1) : sistemaTarefas;
      }

      // Se não encontrar o Sistema de Tarefas, usar o primeiro projeto encontrado
      const firstProject = projectsFound[0];
      console.log(`Usando primeiro projeto encontrado: "${firstProject}"`);
      return firstProject.startsWith("@") ? firstProject.substring(1) : firstProject;
    }

    console.log(`Nenhum projeto encontrado para issue #${issueNumber}`);
    return null;
  } catch (error: any) {
    if (error.status === 404) {
      // Se a issue não existir, não mostrar erro completo, apenas indicar que não foi encontrada
      console.log(`⚠️ Não foi possível encontrar projetos para issue #${issueNumber}: Issue não encontrada`);
    } else {
      console.error(`❌ Erro ao buscar projetos da issue #${issueNumber}:`, error);
    }
    return null;
  }
}

// Função para criar uma milestone no GitHub
export async function createMilestone(
  title: string,
  description: string = "",
  silent: boolean = false
): Promise<number | null> {
  try {
    const response = await octokit.rest.issues.createMilestone({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      title: title,
      description: description,
      state: "open",
    });

    if (response.data.number) {
      if (!silent) {
        console.log(`✅ Milestone "${title}" criada com sucesso (ID: ${response.data.number})`);
      }
      return response.data.number;
    }
    return null;
  } catch (error) {
    console.error(`❌ Erro ao criar milestone "${title}":`, error);
    return null;
  }
}

// Função para criar um projeto no GitHub (ProjectV2)
export async function createProject(
  title: string,
  description: string = "",
  silent: boolean = false
): Promise<string | null> {
  try {
    if (!silent) {
      console.log(`\n🔍 Criando projeto "${title}" no GitHub...`);
    }

    // Se o título já tiver '@', vamos remover para padronizar
    const normalizedTitle = title.startsWith("@") ? title.substring(1) : title;

    // Primeiro, obter o ID do repositório para vincular depois
    const repoQuery = `
      query {
        repository(owner: "${GITHUB_OWNER}", name: "${GITHUB_REPO}") {
          id
        }
      }
    `;

    let repositoryId;
    try {
      const repoResponse: any = await octokit.graphql(repoQuery);
      repositoryId = repoResponse.repository.id;
      if (!silent) {
        console.log(`✅ Repositório encontrado (ID: ${repositoryId})`);
      }
    } catch (error) {
      console.error(`❌ Erro ao buscar ID do repositório:`, error);
      // Continuar mesmo sem o ID do repositório
    }

    // Vamos obter o ID do usuário ou organização
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
      if (!silent) {
        console.log(`✅ Projeto "${normalizedTitle}" criado com sucesso (ID: ${projectId})`);
      }

      // Vincular o projeto ao repositório se temos o ID do repositório
      if (repositoryId) {
        try {
          const linkQuery = `
            mutation {
              linkProjectV2ToRepository(input: {
                projectId: "${projectId}",
                repositoryId: "${repositoryId}"
              }) {
                repository {
                  name
                }
              }
            }
          `;

          const linkResponse: any = await octokit.graphql(linkQuery);
          if (!silent) {
            console.log(`✅ Projeto vinculado ao repositório ${GITHUB_REPO}`);
          }
        } catch (error) {
          console.error(`❌ Erro ao vincular projeto ao repositório:`, error);
          // Continuar mesmo com o erro de vinculação
        }
      }

      // Buscar projetos novamente para atualizar o cache
      if (!silent) {
        console.log(`🔄 Atualizando cache de projetos...`);
      }
      const projects = await fetchProjects();

      return projectId;
    }

    return null;
  } catch (error) {
    console.error(`❌ Erro ao criar projeto "${title}":`, error);
    return null;
  }
}

/**
 * Busca as opções de status disponíveis em um projeto
 * @param projectId ID do projeto no GitHub
 * @returns Lista de opções de status ou null se não encontrar
 */
export async function fetchProjectStatusOptions(projectId: string): Promise<string[] | null> {
  try {
    console.log(`\n🔍 Buscando opções de status do projeto...`);

    // Consulta GraphQL para buscar campos de status do projeto
    const query = `
      query {
        node(id: "${projectId}") {
          ... on ProjectV2 {
            fields(first: 20) {
              nodes {
                ... on ProjectV2SingleSelectField {
                  name
                  options {
                    name
                  }
                }
              }
            }
          }
        }
      }
    `;

    interface ProjectFieldsResponse {
      node: {
        fields?: {
          nodes: Array<{
            name?: string;
            options?: Array<{
              name: string;
            }>;
          }>;
        };
      };
    }

    const response = await octokit.graphql<ProjectFieldsResponse>(query);

    // Buscar campos do tipo status
    if (response.node.fields && response.node.fields.nodes) {
      for (const field of response.node.fields.nodes) {
        if (
          field.name &&
          field.options &&
          (field.name === "Status" ||
            field.name.toLowerCase() === "status" ||
            field.name.toLowerCase().includes("status"))
        ) {
          // Extrair e retornar as opções de status
          return field.options.map((option: any) => option.name.toLowerCase());
        }
      }
    }

    console.log(`❌ Nenhum campo de status encontrado no projeto`);
    return null;
  } catch (error) {
    console.error(`❌ Erro ao buscar opções de status do projeto:`, error);
    return null;
  }
}

// Função para atualizar manualmente uma milestone de uma task
export async function updateTaskMilestone(issueNumber: number, newMilestone: string): Promise<boolean> {
  try {
    console.log(`Atualizando manualmente a milestone da task #${issueNumber} para "${newMilestone}"...`);

    // Buscar todos os arquivos de tasks no diretório .task/issues
    const taskDir = path.join(".task/issues");
    const files = await fs.readdir(taskDir);

    // Encontrar o arquivo da task correspondente
    const taskFile = files.find((file) => file.includes(`#${issueNumber}-`));

    if (!taskFile) {
      console.log(chalk.red(`❌ Arquivo para issue #${issueNumber} não encontrado`));
      return false;
    }

    // Carregar a task do arquivo
    const taskPath = path.join(taskDir, taskFile);
    const task = (await fs.readJSON(taskPath)) as Task;

    // Exibir a milestone atual
    console.log(`Milestone atual: "${task.milestone || "Nenhuma"}"`);

    // Atualizar a milestone
    task.milestone = newMilestone;
    task.lastSyncAt = new Date().toISOString();

    // Salvar a task atualizada
    await fs.writeJSON(taskPath, task, { spaces: 2 });

    // Verificar se a alteração foi salva corretamente
    const updatedTask = (await fs.readJSON(taskPath)) as Task;
    if (updatedTask.milestone !== newMilestone) {
      console.log(
        chalk.red(`❌ Falha ao atualizar milestone para "${newMilestone}". Valor salvo: "${updatedTask.milestone}"`)
      );
      return false;
    }

    console.log(chalk.green(`✅ Milestone da task #${issueNumber} atualizada para "${newMilestone}"`));
    return true;
  } catch (error) {
    console.error(`❌ Erro ao atualizar milestone: ${error}`);
    return false;
  }
}

/**
 * Atualiza o status de um item em um projeto do GitHub
 * @param issueNodeId ID do nó da issue no GitHub
 * @param projectId ID do projeto no GitHub
 * @param statusValue Valor do status para atualizar
 * @returns boolean indicando se a operação foi bem-sucedida
 */
async function updateProjectItemStatus(issueNodeId: string, projectId: string, statusValue: string): Promise<boolean> {
  try {
    console.log(`\n🔄 Iniciando atualização de status no projeto...`);
    console.log(`🔹 Status desejado: "${statusValue}"`);
    console.log(`🔹 ID da issue: ${issueNodeId}`);
    console.log(`🔹 ID do projeto: ${projectId}`);

    // ETAPA 1: Verificar se podemos encontrar o projeto
    let projectV2Id = projectId;
    try {
      // Garantir que o ID do projeto está no formato correto
      if (!projectId.startsWith("projectV2_")) {
        const projectInfoQuery = `
          query {
            node(id: "${projectId}") {
              ... on ProjectV2 {
                id
                number
                title
                owner {
                  ... on Organization { login }
                  ... on User { login }
                }
              }
            }
          }
        `;

        const projectInfo = await octokit.graphql<any>(projectInfoQuery);
        if (!projectInfo.node) {
          console.log(`❌ Projeto não encontrado com ID: ${projectId}`);
          return false;
        }

        // Usar o ID do projeto retornado pela API
        projectV2Id = projectInfo.node.id;

        console.log(`✅ Projeto encontrado: "${projectInfo.node.title}" (${projectInfo.node.number})`);
        console.log(`   Proprietário: ${projectInfo.node.owner?.login || "Desconhecido"}`);
        console.log(`   ID atualizado: ${projectV2Id}`);
      }
    } catch (error: any) {
      console.error(`❌ Erro ao buscar informações do projeto:`, error.message);
      return false;
    }

    // ETAPA 2: Buscar todos os campos disponíveis no projeto
    let statusField: any = null;
    let statusOptions: any[] = [];
    let statusFieldId: string | null = null;
    let possibleStatusMappings: Record<string, string> = {};

    try {
      const fieldsQuery = `
        query {
          node(id: "${projectV2Id}") {
            ... on ProjectV2 {
              fields(first: 50) {
                nodes {
                  ... on ProjectV2Field {
                    id
                    name
                    dataType
                  }
                  ... on ProjectV2SingleSelectField {
                    id
                    name
                    dataType
                    options {
                      id
                      name
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const fieldsData = await octokit.graphql<any>(fieldsQuery);
      const fields = fieldsData.node?.fields?.nodes || [];

      console.log(`\n📋 Campos disponíveis no projeto (${fields.length}):`);

      // Registrar todos os campos para depuração
      for (const field of fields) {
        console.log(`   - ${field.name} (${field.dataType}) [${field.id}]`);
      }

      // Primeiro, tentar encontrar o campo exato "Status"
      for (const field of fields) {
        if (
          field.dataType === "SINGLE_SELECT" &&
          (field.name === "Status" || field.name === "Estado" || field.name === "State")
        ) {
          statusField = field;
          statusFieldId = field.id;
          statusOptions = field.options || [];
          console.log(`\n✅ Campo de status encontrado (correspondência exata): "${field.name}"`);
          break;
        }
      }

      // Se não encontrou, tentar correspondências mais amplas
      if (!statusField) {
        for (const field of fields) {
          const fieldNameLower = field.name.toLowerCase();
          if (
            field.dataType === "SINGLE_SELECT" &&
            (fieldNameLower === "status" ||
              fieldNameLower.includes("status") ||
              fieldNameLower === "state" ||
              fieldNameLower === "estado")
          ) {
            statusField = field;
            statusFieldId = field.id;
            statusOptions = field.options || [];
            console.log(`\n✅ Campo de status encontrado (correspondência parcial): "${field.name}"`);
            break;
          }
        }
      }

      // Se ainda não encontrou, pegar o primeiro campo SINGLE_SELECT
      if (!statusField) {
        for (const field of fields) {
          if (field.dataType === "SINGLE_SELECT") {
            statusField = field;
            statusFieldId = field.id;
            statusOptions = field.options || [];
            console.log(`\n⚠️ Usando o primeiro campo SINGLE_SELECT: "${field.name}"`);
            break;
          }
        }
      }

      if (!statusField) {
        console.log(`❌ Nenhum campo de status encontrado no projeto`);
        return false;
      }

      // Listar as opções disponíveis
      console.log(`   ID do campo: ${statusFieldId}`);
      if (statusOptions.length > 0) {
        console.log(`   Opções disponíveis:`);
        statusOptions.forEach((option, index) => {
          console.log(`     ${index + 1}. "${option.name}" (${option.id})`);

          // Criar mapeamentos possíveis - versão aprimorada
          possibleStatusMappings[option.name.toLowerCase().trim()] = option.id;

          // Mapeamentos exatos (case-insensitive)
          // Nome exato sem alterações de case
          possibleStatusMappings[option.name.trim()] = option.id;

          // Remover espaços extras e plurais
          const normalizedName = option.name.toLowerCase().trim().replace(/\s+/g, " ").replace(/s$/, "");
          possibleStatusMappings[normalizedName] = option.id;

          // Mapeamentos para "Todo"
          if (
            option.name === "Todo" ||
            option.name.toLowerCase() === "todo" ||
            normalizedName.includes("todo") ||
            normalizedName.includes("to do") ||
            normalizedName.includes("backlog") ||
            normalizedName === "new" ||
            normalizedName === "a fazer" ||
            normalizedName === "pendente"
          ) {
            possibleStatusMappings["todo"] = option.id;
            possibleStatusMappings["Todo"] = option.id;
          }

          // Mapeamentos para "In Progress"
          if (
            option.name === "In Progress" ||
            option.name.toLowerCase() === "in progress" ||
            normalizedName.includes("progress") ||
            normalizedName.includes("andamento") ||
            normalizedName.includes("doing") ||
            normalizedName.includes("em execução") ||
            normalizedName.includes("trabalhando")
          ) {
            possibleStatusMappings["in progress"] = option.id;
            possibleStatusMappings["In Progress"] = option.id;
            possibleStatusMappings["doing"] = option.id;
          }

          // Mapeamentos para "Done"
          if (
            option.name === "Done" ||
            option.name.toLowerCase() === "done" ||
            normalizedName.includes("done") ||
            normalizedName.includes("conclu") ||
            normalizedName.includes("finish") ||
            normalizedName.includes("complete") ||
            normalizedName.includes("feito") ||
            normalizedName.includes("pronto") ||
            normalizedName.includes("finalizado")
          ) {
            possibleStatusMappings["done"] = option.id;
            possibleStatusMappings["Done"] = option.id;
          }
        });
      } else {
        console.log(`   ⚠️ Nenhuma opção disponível para este campo`);
      }
    } catch (error: any) {
      console.error(`❌ Erro ao buscar campos do projeto:`, error.message);
      return false;
    }

    // ETAPA 3: Determinar o valor do status a ser definido
    console.log(`\n🔍 Tentando corresponder status "${statusValue}" com as opções disponíveis...`);

    let targetStatusOptionId: string | null = null;

    // NOVO: Registrar todas as chaves de mapeamento possíveis
    console.log(`   Mapeamentos disponíveis:`);
    Object.keys(possibleStatusMappings).forEach((key) => {
      console.log(`     - "${key}" => "${possibleStatusMappings[key]}"`);
    });

    // Método 1: Verificar correspondência direta primeiro (com nome exato, inclusive case)
    for (const option of statusOptions) {
      if (option.name === statusValue) {
        targetStatusOptionId = option.id;
        console.log(`✅ Correspondência exata encontrada (case sensitive): "${option.name}"`);
        break;
      }
    }

    // Método 2: Verificar correspondência direta (case-insensitive)
    if (!targetStatusOptionId) {
      const statusValueLower = statusValue.toLowerCase().trim();
      for (const option of statusOptions) {
        if (option.name.toLowerCase().trim() === statusValueLower) {
          targetStatusOptionId = option.id;
          console.log(`✅ Correspondência direta encontrada (case insensitive): "${option.name}"`);
          break;
        }
      }
    }

    // Método 3: Verificar mapeamentos específicos do GitHub
    if (!targetStatusOptionId) {
      // Primeiro tentar com o valor exato (preservando o case)
      if (possibleStatusMappings[statusValue]) {
        targetStatusOptionId = possibleStatusMappings[statusValue];
        console.log(`✅ Correspondência encontrada via mapeamento exato: "${statusValue}"`);
      }
      // Caso especial para status conhecidos do GitHub
      else if (statusValue.toLowerCase() === "todo" && possibleStatusMappings["Todo"]) {
        targetStatusOptionId = possibleStatusMappings["Todo"];
        console.log(`✅ Correspondência encontrada para "Todo"`);
      } else if (statusValue.toLowerCase() === "in progress" && possibleStatusMappings["In Progress"]) {
        targetStatusOptionId = possibleStatusMappings["In Progress"];
        console.log(`✅ Correspondência encontrada para "In Progress"`);
      } else if (statusValue.toLowerCase() === "done" && possibleStatusMappings["Done"]) {
        targetStatusOptionId = possibleStatusMappings["Done"];
        console.log(`✅ Correspondência encontrada para "Done"`);
      }
      // Tentar com a string lowercase
      else if (possibleStatusMappings[statusValue.toLowerCase()]) {
        targetStatusOptionId = possibleStatusMappings[statusValue.toLowerCase()];
        console.log(`✅ Correspondência encontrada via mapeamento lowercase: "${statusValue.toLowerCase()}"`);
      }
    }

    // Método 4: Correspondência parcial
    if (!targetStatusOptionId) {
      const statusValueLower = statusValue.toLowerCase().trim();
      for (const option of statusOptions) {
        const optionLower = option.name.toLowerCase().trim();
        if (optionLower.includes(statusValueLower) || statusValueLower.includes(optionLower)) {
          targetStatusOptionId = option.id;
          console.log(`✅ Correspondência parcial encontrada: "${option.name}"`);
          break;
        }
      }
    }

    // Método 5: Mapeamentos específicos para valores típicos de status
    if (!targetStatusOptionId) {
      const statusValueLower = statusValue.toLowerCase().trim();
      // Para status "todo"
      if (statusValueLower === "todo" || statusValueLower === "to do" || statusValueLower === "backlog") {
        // Buscar opção que parece ser um status inicial
        for (const option of statusOptions) {
          const optionLower = option.name.toLowerCase().trim();
          if (
            optionLower.includes("todo") ||
            optionLower.includes("to do") ||
            optionLower.includes("backlog") ||
            optionLower === "new" ||
            optionLower.includes("pendente") ||
            optionLower.includes("fazer")
          ) {
            targetStatusOptionId = option.id;
            console.log(`✅ Correspondência encontrada para status inicial: "${option.name}"`);
            break;
          }
        }
        // Se ainda não encontrou, usar o primeiro status
        if (!targetStatusOptionId && statusOptions.length > 0) {
          targetStatusOptionId = statusOptions[0].id;
          console.log(`⚠️ Usando o primeiro status disponível: "${statusOptions[0].name}" para "${statusValue}"`);
        }
      }
      // Para status "in progress"
      else if (
        statusValueLower === "in progress" ||
        statusValueLower === "doing" ||
        statusValueLower.includes("andamento")
      ) {
        // Buscar opção que parece ser um status de progresso
        for (const option of statusOptions) {
          const optionLower = option.name.toLowerCase().trim();
          if (
            optionLower.includes("progress") ||
            optionLower.includes("doing") ||
            optionLower.includes("andamento") ||
            optionLower.includes("execução") ||
            optionLower.includes("trabalhando")
          ) {
            targetStatusOptionId = option.id;
            console.log(`✅ Correspondência encontrada para status em andamento: "${option.name}"`);
            break;
          }
        }
        // Se ainda não encontrou e há pelo menos dois status, usar o segundo
        if (!targetStatusOptionId && statusOptions.length > 1) {
          targetStatusOptionId = statusOptions[1].id;
          console.log(`⚠️ Usando o segundo status disponível: "${statusOptions[1].name}" para "${statusValue}"`);
        }
      }
      // Para status "done"
      else if (statusValueLower === "done" || statusValueLower === "finished" || statusValueLower.includes("conclu")) {
        // Buscar opção que parece ser um status de conclusão
        for (const option of statusOptions) {
          const optionLower = option.name.toLowerCase().trim();
          if (
            optionLower.includes("done") ||
            optionLower.includes("finish") ||
            optionLower.includes("complet") ||
            optionLower.includes("conclu") ||
            optionLower.includes("pronto") ||
            optionLower.includes("feito")
          ) {
            targetStatusOptionId = option.id;
            console.log(`✅ Correspondência encontrada para status concluído: "${option.name}"`);
            break;
          }
        }
        // Se ainda não encontrou e há pelo menos três status, usar o último
        if (!targetStatusOptionId && statusOptions.length > 2) {
          targetStatusOptionId = statusOptions[statusOptions.length - 1].id;
          console.log(
            `⚠️ Usando o último status disponível: "${
              statusOptions[statusOptions.length - 1].name
            }" para "${statusValue}"`
          );
        }
      }
    }

    if (!targetStatusOptionId) {
      console.log(`❌ Não foi possível encontrar uma correspondência para o status "${statusValue}"`);
      return false;
    }

    // ETAPA 4: Encontrar o item do projeto associado à issue
    let projectItemId: string | null = null;

    try {
      const findItemQuery = `
        query {
          node(id: "${projectV2Id}") {
            ... on ProjectV2 {
              items(first: 100) {
                nodes {
                  id
                  content {
                    ... on Issue {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const itemsData = await octokit.graphql<any>(findItemQuery);
      const items = itemsData.node?.items?.nodes || [];

      console.log(`\n🔍 Procurando item do projeto associado à issue (encontrados ${items.length} itens)`);

      for (const item of items) {
        if (item.content?.id === issueNodeId) {
          projectItemId = item.id;
          console.log(`✅ Item encontrado: ${projectItemId}`);
          break;
        }
      }

      // Se não encontrou o item, tentar adicionar a issue ao projeto
      if (!projectItemId) {
        console.log(`⚠️ Item não encontrado, tentando adicionar issue ao projeto...`);

        try {
          const addItemMutation = `
            mutation {
              addProjectV2ItemById(input: {
                projectId: "${projectV2Id}"
                contentId: "${issueNodeId}"
              }) {
                item {
                  id
                }
              }
            }
          `;

          const addResult = await octokit.graphql<any>(addItemMutation);
          if (addResult.addProjectV2ItemById?.item?.id) {
            projectItemId = addResult.addProjectV2ItemById.item.id;
            console.log(`✅ Issue adicionada ao projeto: ${projectItemId}`);
          } else {
            console.log(`❌ Falha ao adicionar issue ao projeto`);
            return false;
          }
        } catch (error: any) {
          console.error(`❌ Erro ao adicionar issue ao projeto:`, error.message);
          // Continuar mesmo com erro, pois a issue pode já existir no projeto
        }
      }
    } catch (error: any) {
      console.error(`❌ Erro ao buscar itens do projeto:`, error.message);
      return false;
    }

    // ETAPA 5: Atualizar o status do item
    if (!projectItemId || !statusFieldId || !targetStatusOptionId) {
      console.log(`❌ Informações insuficientes para atualizar o status`);
      return false;
    }

    try {
      const updateMutation = `
        mutation {
          updateProjectV2ItemFieldValue(input: {
            projectId: "${projectV2Id}"
            itemId: "${projectItemId}"
            fieldId: "${statusFieldId}"
            value: { 
              singleSelectOptionId: "${targetStatusOptionId}"
            }
          }) {
            projectV2Item {
              id
            }
          }
        }
      `;

      const updateResult = await octokit.graphql<any>(updateMutation);
      if (updateResult.updateProjectV2ItemFieldValue?.projectV2Item?.id) {
        console.log(`\n✅ Status atualizado com sucesso!`);
        return true;
      } else {
        console.log(`\n❌ Falha ao atualizar o status, resposta invalida da API`);
        return false;
      }
    } catch (error: any) {
      console.error(`\n❌ Erro ao atualizar o status:`, error.message);

      // Verificar se o erro contém detalhes adicionais
      if (error.errors && error.errors.length > 0) {
        error.errors.forEach((err: any, index: number) => {
          console.error(`   Erro ${index + 1}: ${err.message}`);
          if (err.type) console.error(`   Tipo: ${err.type}`);
          if (err.path) console.error(`   Caminho: ${err.path.join(".")}`);
        });
      }

      return false;
    }
  } catch (error: any) {
    console.error(`\n❌ Erro não tratado durante atualização de status:`, error.message);
    return false;
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
  fetchProjectStatusOptions,
  updateTaskMilestone,
};
