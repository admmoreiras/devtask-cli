import { GITHUB_OWNER, GITHUB_REPO, isUser, octokit } from "./auth.js";

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

// Função para criar projeto no GitHub
export async function createProject(
  title: string,
  description: string = "",
  silent: boolean = false
): Promise<string | null> {
  try {
    if (!silent) {
      console.log(`\n🔍 Verificando se projeto "${title}" já existe...`);
    }

    // Verificar se o projeto já existe
    const projects = await fetchProjects();
    const existingProject = Array.from(projects.entries()).find(([name]) => name.toLowerCase() === title.toLowerCase());

    if (existingProject) {
      if (!silent) {
        console.log(`✅ Projeto "${title}" já existe com ID ${existingProject[1]}`);
      }
      return existingProject[1];
    }

    if (!silent) {
      console.log(`🔧 Criando projeto "${title}"...`);
    }

    // Verificar se é usuário ou organização
    const isUserAccount = await isUser();

    // Primeiro, obter o ID do owner (usuário ou organização)
    let ownerId;
    try {
      const ownerQuery = isUserAccount
        ? `query { user(login: "${GITHUB_OWNER}") { id } }`
        : `query { organization(login: "${GITHUB_OWNER}") { id } }`;

      const ownerResponse = await octokit.graphql<any>(ownerQuery);
      ownerId = isUserAccount ? ownerResponse.user.id : ownerResponse.organization.id;

      if (!silent) {
        console.log(`✅ Obtido ID do ${isUserAccount ? "usuário" : "organização"}: ${ownerId}`);
      }
    } catch (error) {
      console.error(`❌ Erro ao obter ID do ${isUserAccount ? "usuário" : "organização"}:`, error);
      return null;
    }

    // Obter ID do repositório
    let repoId = null;
    try {
      const repoQuery = `query { repository(owner: "${GITHUB_OWNER}", name: "${GITHUB_REPO}") { id } }`;
      const repoResponse = await octokit.graphql<any>(repoQuery);
      repoId = repoResponse.repository.id;

      if (!silent) {
        console.log(`✅ Obtido ID do repositório: ${repoId}`);
      }
    } catch (error) {
      console.error("❌ Erro ao obter ID do repositório:", error);
      // Continuar mesmo sem o ID do repositório
    }

    // Criar novo projeto (API v2)
    const createProjectMutation = `
      mutation {
        createProjectV2(
          input: {
            ownerId: "${ownerId}",
            title: "${title}"
          }
        ) {
          projectV2 {
            id
            title
          }
        }
      }
    `;

    try {
      const response = await octokit.graphql<any>(createProjectMutation);

      if (!silent) {
        console.log(`✅ Projeto criado com sucesso: ${response.createProjectV2.projectV2.id}`);
      }

      // Se conseguimos o ID do repositório, tentar conectar o projeto ao repositório
      if (repoId && response.createProjectV2.projectV2.id) {
        const projectId = response.createProjectV2.projectV2.id;
        try {
          const linkToRepoMutation = `
            mutation {
              linkProjectV2ToRepository(input: {
                projectId: "${projectId}",
                repositoryId: "${repoId}"
              }) {
                repository {
                  url
                }
              }
            }
          `;

          await octokit.graphql<any>(linkToRepoMutation);
          if (!silent) {
            console.log(`✅ Projeto vinculado ao repositório com sucesso`);
          }
        } catch (linkError) {
          console.error("⚠️ Projeto criado, mas não foi possível vinculá-lo ao repositório:", linkError);
        }
      }

      return response.createProjectV2.projectV2.id;
    } catch (graphqlError: any) {
      console.error("❌ Erro ao criar projeto com GraphQL:", graphqlError.message);

      if (!silent) {
        console.log(`⚠️ Tentando criar projeto via REST API...`);
      }

      // Tentar com REST API (método alternativo para projetos V2)
      try {
        // Se for organização
        if (!isUserAccount) {
          const restResponse = await octokit.rest.projects.createForOrg({
            org: GITHUB_OWNER,
            name: title,
            body: description,
          });

          if (!silent) {
            console.log(`✅ Projeto criado com sucesso via REST: ${restResponse.data.id}`);
          }

          return String(restResponse.data.id);
        }
        // Se for usuário
        else {
          const restResponse = await octokit.rest.projects.create({
            owner: GITHUB_OWNER,
            name: title,
            body: description,
          });

          if (!silent) {
            console.log(`✅ Projeto criado com sucesso via REST: ${restResponse.data.id}`);
          }

          return String(restResponse.data.id);
        }
      } catch (restError: any) {
        console.error("❌ Erro ao criar projeto via REST:", restError.message);
        return null;
      }
    }
  } catch (error) {
    console.error("❌ Erro ao criar projeto:", error);
    return null;
  }
}

// Buscar opções de status de um projeto
export async function fetchProjectStatusOptions(projectId: string): Promise<string[] | null> {
  try {
    console.log(`\n🔍 Buscando opções de status para o projeto ${projectId}...`);

    const query = `
      query {
        node(id: "${projectId}") {
          ... on ProjectV2 {
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

    const response = await octokit.graphql<any>(query);

    const statusField = response.node?.fields?.nodes?.find(
      (field: any) =>
        field?.name?.toLowerCase().includes("status") || field?.name?.toLowerCase().includes("estado") || field?.options
    );

    if (statusField && statusField.options) {
      const statusOptions = statusField.options.map((option: any) => option.name);
      console.log(`✅ Opções de status encontradas: ${statusOptions.join(", ")}`);
      return statusOptions;
    } else {
      console.log("❌ Não foi possível encontrar um campo de status no projeto");
      return null;
    }
  } catch (error) {
    console.error("❌ Erro ao buscar opções de status:", error);
    return null;
  }
}

export default {
  fetchProjects,
  listProjects,
  createProject,
  fetchProjectStatusOptions,
};
