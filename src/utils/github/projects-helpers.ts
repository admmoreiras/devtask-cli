import { octokit } from "./auth.js";
import { fetchProjects } from "./projects.js";

// Função para adicionar issue a um projeto
export async function addIssueToProject(issueNodeId: string, projectName: string): Promise<boolean> {
  try {
    console.log(`\n🔧 Tentando adicionar issue ao projeto "${projectName}"...`);

    // Buscar projeto pelo nome
    const projects = await fetchProjects();
    const projectEntry = Array.from(projects.entries()).find(
      ([name]) => name.toLowerCase() === projectName.toLowerCase()
    );

    if (!projectEntry || !projectEntry[1]) {
      console.log(`❌ Projeto "${projectName}" não encontrado`);
      return false;
    }

    const projectId = projectEntry[1];

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

    const projectResponse = await octokit.graphql<{ node: { id: string } }>(getProjectQuery);

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

    const result = await octokit.graphql(mutation);
    console.log(`✅ Issue adicionada ao projeto "${projectName}"`);
    return true;
  } catch (error: any) {
    // Verificar se é um erro de item já existente no projeto
    if (error.message && error.message.includes("already exists")) {
      console.log(`ℹ️ Issue já está no projeto "${projectName}"`);
      return true;
    }

    console.error(`❌ Erro ao adicionar issue ao projeto:`, error.message || error);
    return false;
  }
}

// Função para adicionar issue a múltiplos projetos
export async function addIssueToMultipleProjects(issueNodeId: string, projectNames: string[]): Promise<boolean> {
  if (!projectNames || projectNames.length === 0) {
    return false;
  }

  let success = false;
  for (const projectName of projectNames) {
    const result = await addIssueToProject(issueNodeId, projectName);
    if (result) {
      success = true;
    }
  }

  return success;
}

// Função para atualizar status de um item em um projeto
export async function updateProjectItemStatus(
  issueNodeId: string,
  projectName: string,
  statusValue: string
): Promise<boolean> {
  try {
    console.log(`\n🔧 Atualizando status para "${statusValue}" no projeto "${projectName}"...`);

    // ETAPA 1: Buscar projeto pelo nome
    const projects = await fetchProjects();
    const projectEntry = Array.from(projects.entries()).find(
      ([name]) => name.toLowerCase() === projectName.toLowerCase()
    );

    if (!projectEntry || !projectEntry[1]) {
      console.log(`❌ Projeto "${projectName}" não encontrado`);
      return false;
    }

    const projectId = projectEntry[1];

    // ETAPA 2: Buscar detalhes do projeto incluindo ID real para GraphQL
    const getProjectQuery = `
      query {
        node(id: "${projectId}") {
          ... on ProjectV2 {
            id
            fields(first: 20) {
              nodes {
                ... on ProjectV2SingleSelectField {
                  id
                  name
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

    const projectResponse = await octokit.graphql<any>(getProjectQuery);
    const projectV2Id = projectResponse.node.id;

    // ETAPA 3: Buscar campo de status e suas opções
    let statusFieldId: string | null = null;
    let targetStatusOptionId: string | null = null;

    if (projectResponse.node?.fields?.nodes) {
      const statusField = projectResponse.node.fields.nodes.find(
        (field: any) =>
          field?.name?.toLowerCase().includes("status") ||
          field?.name?.toLowerCase().includes("estado") ||
          field?.options
      );

      if (statusField) {
        statusFieldId = statusField.id;
        console.log(`✅ Campo de status encontrado: "${statusField.name}"`);

        // Buscar a opção de status correspondente
        const statusValueLower = statusValue.toLowerCase().trim();
        const statusOptions = statusField.options || [];

        console.log(`🔍 Buscando correspondência para status "${statusValue}" entre ${statusOptions.length} opções...`);

        // Correspondência exata
        const exactMatch = statusOptions.find((option: any) => option.name.toLowerCase().trim() === statusValueLower);

        if (exactMatch) {
          targetStatusOptionId = exactMatch.id;
          console.log(`✅ Correspondência exata encontrada: "${exactMatch.name}"`);
        }
        // Correspondência parcial
        else {
          const partialMatch = statusOptions.find(
            (option: any) =>
              option.name.toLowerCase().includes(statusValueLower) ||
              statusValueLower.includes(option.name.toLowerCase())
          );

          if (partialMatch) {
            targetStatusOptionId = partialMatch.id;
            console.log(`✅ Correspondência parcial encontrada: "${partialMatch.name}"`);
          }
        }

        // Para status "todo", "backlog", "pending"
        if (
          !targetStatusOptionId &&
          (statusValueLower === "todo" ||
            statusValueLower === "backlog" ||
            statusValueLower === "pending" ||
            statusValueLower.includes("pendente") ||
            statusValueLower.includes("fazer"))
        ) {
          // Buscar opção que parece ser um status inicial
          for (const option of statusOptions) {
            const optionLower = option.name.toLowerCase().trim();
            if (
              optionLower.includes("todo") ||
              optionLower.includes("backlog") ||
              optionLower.includes("pending") ||
              optionLower.includes("pendente") ||
              optionLower.includes("fazer") ||
              optionLower.includes("new")
            ) {
              targetStatusOptionId = option.id;
              console.log(`✅ Correspondência encontrada para status todo: "${option.name}"`);
              break;
            }
          }
          // Se ainda não encontrou e há pelo menos um status, usar o primeiro
          if (!targetStatusOptionId && statusOptions.length > 0) {
            targetStatusOptionId = statusOptions[0].id;
            console.log(`⚠️ Usando o primeiro status disponível: "${statusOptions[0].name}" para "${statusValue}"`);
          }
        }
        // Para status "doing", "in progress", "wip"
        else if (
          !targetStatusOptionId &&
          (statusValueLower === "doing" ||
            statusValueLower === "in progress" ||
            statusValueLower === "wip" ||
            statusValueLower.includes("andamento") ||
            statusValueLower.includes("progress"))
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
        else if (
          !targetStatusOptionId &&
          (statusValueLower === "done" || statusValueLower === "finished" || statusValueLower.includes("conclu"))
        ) {
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
      return false;
    }
  } catch (error: any) {
    console.error(`\n❌ Erro não tratado durante atualização de status:`, error.message);
    return false;
  }
}

export default {
  addIssueToProject,
  addIssueToMultipleProjects,
  updateProjectItemStatus,
};
