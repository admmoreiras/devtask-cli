import dotenv from "dotenv";
import { Octokit } from "octokit";

// Carregar variáveis de ambiente
dotenv.config();

// Verificar variáveis obrigatórias
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
export const GITHUB_OWNER = process.env.GITHUB_OWNER || "";
export const GITHUB_REPO = process.env.GITHUB_REPO || "";

// Inicializar Octokit com o token
export const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

// Verifica se o owner é um usuário ou organização
export async function isUser(): Promise<boolean> {
  try {
    const query = `
      query {
        user(login: "${GITHUB_OWNER}") {
          id
        }
      }
    `;

    const response = await octokit.graphql<{ user: { id: string } | null }>(query);
    return response && response.user !== null;
  } catch (error) {
    return false;
  }
}

// Verificar configuração do GitHub
export function checkGitHubConfig(): boolean {
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    console.error("Erro: Configure as variáveis de ambiente no arquivo .env");
    console.error("GITHUB_TOKEN, GITHUB_OWNER e GITHUB_REPO são obrigatórias");
    return false;
  }
  return true;
}

export default {
  octokit,
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  isUser,
  checkGitHubConfig,
};
