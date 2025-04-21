import chalk from "chalk";
import { listMilestones, listProjects } from "../utils/github.js";

export async function showGitHubInfo() {
  try {
    console.log(chalk.blue("🔍 Buscando informações do GitHub..."));

    // Listar milestones
    await listMilestones();

    // Listar projetos
    await listProjects();

    console.log("\n✅ Informações carregadas com sucesso!");
  } catch (error) {
    console.error(chalk.red("❌ Erro ao buscar informações do GitHub:"), error);
  }
}
