import { GITHUB_OWNER, GITHUB_REPO, octokit } from "./auth.js";

/**
 * Adiciona um responsável a uma issue do GitHub
 * @param issueNumber Número da issue
 * @param assignee Nome do usuário a ser atribuído (default: GITHUB_OWNER)
 * @returns true se bem sucedido, false caso contrário
 */
export async function addAssigneeToIssue(issueNumber: number, assignee: string = GITHUB_OWNER): Promise<boolean> {
  try {
    console.log(`🔄 Adicionando ${assignee} como responsável pela issue #${issueNumber}...`);

    // Usando a API REST para adicionar assignees
    const response = await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/assignees", {
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      issue_number: issueNumber,
      assignees: [assignee],
    });

    if (response.status >= 200 && response.status < 300) {
      console.log(`✅ Responsável ${assignee} adicionado com sucesso à issue #${issueNumber}`);
      return true;
    } else {
      console.error(`❌ Falha ao adicionar responsável à issue #${issueNumber} (status: ${response.status})`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Erro ao adicionar responsável à issue #${issueNumber}:`, error);
    return false;
  }
}

/**
 * Remove um responsável de uma issue do GitHub
 * @param issueNumber Número da issue
 * @param assignee Nome do usuário a ser removido
 * @returns true se bem sucedido, false caso contrário
 */
export async function removeAssigneeFromIssue(issueNumber: number, assignee: string): Promise<boolean> {
  try {
    console.log(`🔄 Removendo ${assignee} como responsável pela issue #${issueNumber}...`);

    // Usando a API REST para remover assignees
    const response = await octokit.request("DELETE /repos/{owner}/{repo}/issues/{issue_number}/assignees", {
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      issue_number: issueNumber,
      assignees: [assignee],
    });

    if (response.status >= 200 && response.status < 300) {
      console.log(`✅ Responsável ${assignee} removido com sucesso da issue #${issueNumber}`);
      return true;
    } else {
      console.error(`❌ Falha ao remover responsável da issue #${issueNumber} (status: ${response.status})`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Erro ao remover responsável da issue #${issueNumber}:`, error);
    return false;
  }
}

/**
 * Verifica e atualiza os responsáveis de uma issue
 * Mantém o GITHUB_OWNER como responsável
 * @param issueNumber Número da issue
 * @returns true se bem sucedido, false caso contrário
 */
export async function ensureOwnerAsAssignee(issueNumber: number): Promise<boolean> {
  try {
    // Obter issue atual
    const response = await octokit.request("GET /repos/{owner}/{repo}/issues/{issue_number}", {
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      issue_number: issueNumber,
    });

    const issue = response.data;

    // Verificar se o owner já está como assignee
    const hasOwnerAssigned = issue.assignees?.some((assignee: { login: string }) => assignee.login === GITHUB_OWNER);

    // Se o owner não estiver atribuído, adicionar
    if (!hasOwnerAssigned) {
      return await addAssigneeToIssue(issueNumber);
    }

    return true;
  } catch (error) {
    console.error(`❌ Erro ao verificar/atualizar responsáveis da issue #${issueNumber}:`, error);
    return false;
  }
}

export default {
  addAssigneeToIssue,
  removeAssigneeFromIssue,
  ensureOwnerAsAssignee,
};
