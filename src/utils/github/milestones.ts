import { GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN, octokit } from "./auth.js";

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

// Função para criar milestone no GitHub
export async function createMilestone(
  title: string,
  description: string = "",
  silent: boolean = false
): Promise<number | null> {
  try {
    if (!silent) {
      console.log(`\n🔍 Verificando se milestone "${title}" já existe...`);
    }

    // Verificar se milestone já existe
    const milestones = await fetchMilestones();
    const existingMilestone = Array.from(milestones.entries()).find(
      ([name]) => name.toLowerCase() === title.toLowerCase()
    );

    if (existingMilestone) {
      if (!silent) {
        console.log(`✅ Milestone "${title}" já existe com número #${existingMilestone[1]}`);
      }
      return existingMilestone[1];
    }

    if (!silent) {
      console.log(`🔧 Criando milestone "${title}"...`);
    }

    // Criar nova milestone
    const response = await octokit.rest.issues.createMilestone({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      title,
      description,
    });

    if (!silent) {
      console.log(`✅ Milestone criada com sucesso: #${response.data.number}`);
    }

    return response.data.number;
  } catch (error) {
    console.error("❌ Erro ao criar milestone:", error);
    return null;
  }
}

// Função para atualizar milestone de uma issue
export async function updateTaskMilestone(issueNumber: number, newMilestone: string): Promise<boolean> {
  try {
    console.log(`\n🔄 Atualizando milestone para issue #${issueNumber}...`);

    // Verificar se milestone existe
    const milestones = await fetchMilestones();
    const existingMilestone = Array.from(milestones.entries()).find(
      ([name]) => name.toLowerCase() === newMilestone.toLowerCase()
    );

    let milestoneNumber = null;
    if (existingMilestone) {
      console.log(`✅ Milestone "${newMilestone}" encontrada (#${existingMilestone[1]})`);
      milestoneNumber = existingMilestone[1];
    } else {
      // Criar milestone
      console.log(`🔍 Milestone "${newMilestone}" não encontrada, criando...`);
      milestoneNumber = await createMilestone(newMilestone);
      if (!milestoneNumber) {
        console.error(`❌ Falha ao criar milestone "${newMilestone}"`);
        return false;
      }
    }

    // Atualizar issue com a nova milestone
    await octokit.rest.issues.update({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      issue_number: issueNumber,
      milestone: milestoneNumber,
    });

    console.log(`✅ Milestone atualizada para "${newMilestone}" (#${milestoneNumber})`);
    return true;
  } catch (error) {
    console.error("❌ Erro ao atualizar milestone:", error);
    return false;
  }
}

export default {
  fetchMilestones,
  listMilestones,
  createMilestone,
  updateTaskMilestone,
};
