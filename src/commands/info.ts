import chalk from "chalk";
import github from "../utils/github/index.js";

export async function showGitHubInfo() {
  try {
    console.log(chalk.blue("🔍 Buscando informações do GitHub..."));

    // Listar milestones
    await github.listMilestones();

    // Listar projetos
    await github.listProjects();

    console.log("\n✅ Informações carregadas com sucesso!");
  } catch (error) {
    console.error(chalk.red("❌ Erro ao buscar informações do GitHub:"), error);
  }
}
