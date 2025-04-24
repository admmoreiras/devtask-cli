import { GITHUB_OWNER, GITHUB_REPO, octokit } from "./auth.js";
import { createMilestone, fetchMilestones } from "./milestones.js";
import { addIssueToProject, updateProjectItemStatus } from "./projects-helpers.js";
import { Task } from "./types.js";

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

    // Criar issue
    console.log(`\n🔧 Criando issue "${task.title}"...`);

    const createIssueResponse = await octokit.rest.issues.create({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      title: task.title,
      body: taskBody,
      labels,
      milestone: milestoneId,
    });

    if (!createIssueResponse || !createIssueResponse.data || !createIssueResponse.data.number) {
      console.error("❌ Falha ao criar issue no GitHub");
      return null;
    }

    const issueNumber = createIssueResponse.data.number;
    console.log(`✅ Issue criada com sucesso: #${issueNumber}`);

    // Tentar adicionar ao projeto
    if (task.project) {
      console.log(`\n🔧 Adicionando issue ao projeto "${task.project}"...`);

      // Obter ID do nó da issue para GraphQL
      const issueData = await octokit.rest.issues.get({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        issue_number: issueNumber,
      });

      if (issueData.data.node_id) {
        const issueNodeId = issueData.data.node_id;

        // Adicionar a projetos (via importação do módulo projects-helpers)
        const projectNames = [task.project];
        await addIssueToProject(issueNodeId, task.project);
      }
    }

    return issueNumber;
  } catch (error) {
    console.error("❌ Erro ao criar issue no GitHub:", error);
    return null;
  }
}

// Função para buscar issues do GitHub
export const fetchGitHubIssues = async (): Promise<any[]> => {
  try {
    console.log(`\n🔍 Buscando issues do GitHub...`);

    // Mapa para armazenar issues por página
    const issues: any[] = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      console.log(`📃 Buscando página ${page}...`);

      const response = await octokit.rest.issues.listForRepo({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        state: "all", // Buscar issues abertas e fechadas
        per_page: 100,
        page: page,
      });

      if (response.data.length === 0) {
        hasMorePages = false;
      } else {
        // Filtrar apenas issues, não pull requests
        const filteredIssues = response.data.filter((issue: any) => !issue.pull_request);
        issues.push(...filteredIssues);
        page++;
      }
    }

    console.log(`✅ Total: ${issues.length} issues encontradas`);
    return issues;
  } catch (error) {
    console.error("❌ Erro ao buscar issues:", error);
    return [];
  }
};

// Função para buscar uma issue específica do GitHub
export async function fetchGitHubIssue(issueNumber: number): Promise<any | null> {
  try {
    console.log(`\n🔍 Buscando issue #${issueNumber}...`);

    const response = await octokit.rest.issues.get({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      issue_number: issueNumber,
    });

    if (!response || !response.data) {
      console.log(`❌ Issue #${issueNumber} não encontrada`);
      return null;
    }

    console.log(`✅ Issue #${issueNumber} encontrada: "${response.data.title}"`);
    return response.data;
  } catch (error: any) {
    if (error.status === 404) {
      console.log(`❌ Issue #${issueNumber} não encontrada`);
    } else {
      console.error(`❌ Erro ao buscar issue #${issueNumber}:`, error);
    }
    return null;
  }
}

// Função para extrair status de uma issue
export async function extractStatusFromIssue(issue: any): Promise<string> {
  // Tentar extrair do corpo da issue primeiro
  if (issue.body) {
    const statusMatch = issue.body.match(/\*\*Status:\*\*\s*([^\n]+)/);
    if (statusMatch && statusMatch[1]) {
      return statusMatch[1].trim();
    }
  }

  // Tentar extrair das labels
  if (issue.labels && issue.labels.length > 0) {
    for (const label of issue.labels) {
      if (typeof label === "object" && label.name && label.name.startsWith("status:")) {
        return label.name.substring(7).trim();
      }
    }
  }

  // Tentar buscar do projeto no GitHub
  const projectStatus = await fetchProjectStatus(issue.number);
  if (projectStatus) {
    return projectStatus;
  }

  // Status padrão baseado no estado da issue
  return issue.state === "closed" ? "done" : "todo";
}

// Função auxiliar para buscar status de um projeto
async function fetchProjectStatus(issueNumber: number): Promise<string | null> {
  try {
    // Primeiro obter o ID do nó da issue
    const issueData = await octokit.rest.issues.get({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      issue_number: issueNumber,
    });

    if (!issueData.data.node_id) {
      return null;
    }

    const issueNodeId = issueData.data.node_id;

    // Buscar status no projeto using GraphQL
    const query = `
      query {
        node(id: "${issueNodeId}") {
          ... on Issue {
            projectItems(first: 1) {
              nodes {
                fieldValues(first: 8) {
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

    const projectData = await octokit.graphql<any>(query);

    // Verificar se obteve dados do projeto
    if (
      projectData.node?.projectItems?.nodes &&
      projectData.node.projectItems.nodes.length > 0 &&
      projectData.node.projectItems.nodes[0].fieldValues?.nodes
    ) {
      // Procurar campo de status
      const fieldValues = projectData.node.projectItems.nodes[0].fieldValues.nodes;

      for (const fieldValue of fieldValues) {
        if (
          fieldValue.name &&
          fieldValue.field?.name &&
          (fieldValue.field.name.toLowerCase().includes("status") ||
            fieldValue.field.name.toLowerCase().includes("estado"))
        ) {
          console.log(`✅ Status encontrado no projeto: ${fieldValue.name}`);
          return fieldValue.name;
        }
      }
    }

    return null;
  } catch (error) {
    console.error("❌ Erro ao buscar status do projeto:", error);
    return null;
  }
}

// Função para atualizar issue no GitHub
export async function updateGitHubIssue(task: Task): Promise<boolean> {
  try {
    if (!task.github_issue_number) {
      console.error(`❌ Task #${task.id} não tem número de issue associado`);
      return false;
    }

    console.log(`\n🔄 Atualizando issue #${task.github_issue_number} no GitHub...`);

    // Obter issue atual para comparar
    const currentIssue = await fetchGitHubIssue(task.github_issue_number);
    if (!currentIssue) {
      console.error(`❌ Issue #${task.github_issue_number} não encontrada`);
      return false;
    }

    // Verificar se precisamos atualizar o milestone
    const milestones = await fetchMilestones();
    let milestoneId = null;

    if (task.milestone) {
      const milestone = Array.from(milestones.entries()).find(
        ([name]) => name.toLowerCase() === task.milestone.toLowerCase()
      );

      if (milestone) {
        milestoneId = milestone[1];
      } else {
        // Criar milestone se não existir
        milestoneId = await createMilestone(task.milestone);
      }
    }

    // Preparar corpo da issue
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

    // Preparar parâmetros para atualização
    const updateParams: any = {
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      issue_number: task.github_issue_number,
      title: task.title,
      body: taskBody,
    };

    // Adicionar milestone se definido
    if (milestoneId !== null) {
      updateParams.milestone = milestoneId;
    }

    // Mudar estado se necessário (open/closed)
    if (task.status === "done" || task.status.toLowerCase().includes("conclu")) {
      updateParams.state = "closed";
    } else {
      updateParams.state = "open";
    }

    // Atualizar issue
    const response = await octokit.rest.issues.update(updateParams);

    if (!response || !response.data) {
      console.error(`❌ Falha ao atualizar issue #${task.github_issue_number}`);
      return false;
    }

    console.log(`✅ Issue #${task.github_issue_number} atualizada com sucesso`);

    // Tentar atualizar o projeto se definido
    if (task.project) {
      console.log(`\n🔄 Verificando projeto para issue #${task.github_issue_number}...`);

      // Obter ID do nó da issue para GraphQL
      const issueNodeId = response.data.node_id;

      // Adicionar a projetos
      if (issueNodeId) {
        await addIssueToProject(issueNodeId, task.project);

        // Se houver um status definido, atualizar o status no projeto
        if (task.status) {
          console.log(`🔄 Atualizando status "${task.status}" no projeto "${task.project}"...`);
          await updateProjectItemStatus(issueNodeId, task.project, task.status);
        }
      }
    }

    return true;
  } catch (error) {
    console.error(`❌ Erro ao atualizar issue:`, error);
    return false;
  }
}

// Função para buscar informações do projeto associado a uma issue
export async function fetchIssueProjectInfo(issueNumber: number): Promise<string | null> {
  try {
    console.log(`\n🔍 Buscando projeto associado à issue #${issueNumber}...`);

    // Primeiro obter o ID do nó da issue
    const issueData = await octokit.rest.issues.get({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      issue_number: issueNumber,
    });

    if (!issueData.data.node_id) {
      console.log(`❌ Issue #${issueNumber} não tem ID de nó válido`);
      return null;
    }

    const issueNodeId = issueData.data.node_id;

    // Buscar projetos associados à issue usando GraphQL
    const query = `
      query {
        node(id: "${issueNodeId}") {
          ... on Issue {
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

    const projectData = await octokit.graphql<any>(query);

    // Verificar projetos V2
    if (projectData.node?.projectsV2?.nodes && projectData.node.projectsV2.nodes.length > 0) {
      const projectTitle = projectData.node.projectsV2.nodes[0].title;
      console.log(`✅ Projeto encontrado (V2): ${projectTitle}`);
      return projectTitle;
    }

    // Verificar projectItems (outro formato de resposta para projetos)
    if (
      projectData.node?.projectItems?.nodes &&
      projectData.node.projectItems.nodes.length > 0 &&
      projectData.node.projectItems.nodes[0].project?.title
    ) {
      const projectTitle = projectData.node.projectItems.nodes[0].project.title;
      console.log(`✅ Projeto encontrado: ${projectTitle}`);
      return projectTitle;
    }

    console.log(`❌ Nenhum projeto encontrado para issue #${issueNumber}`);
    return null;
  } catch (error) {
    console.error("❌ Erro ao buscar informações do projeto:", error);
    return null;
  }
}

export default {
  createGitHubIssue,
  fetchGitHubIssues,
  fetchGitHubIssue,
  extractStatusFromIssue,
  updateGitHubIssue,
  fetchIssueProjectInfo,
};
