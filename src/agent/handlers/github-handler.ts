// Manipulador para operações relacionadas ao GitHub
import { fetchGitHubIssues, fetchMilestones, fetchProjects } from "../../utils/github.js";
import { Intent } from "../intent-processor.js";
import { BaseHandler } from "./handler-interface.js";

/**
 * Manipulador para intenções relacionadas ao GitHub
 */
export class GitHubHandler extends BaseHandler {
  // Ações suportadas por este manipulador
  private supportedActions = [
    "list_issues", // Listar issues do GitHub
    "list_milestones", // Listar milestones do GitHub
    "list_projects", // Listar projetos do GitHub
    "info", // Mostrar informações do GitHub
  ];

  /**
   * Processa uma intenção relacionada ao GitHub
   * @param intent Intenção a ser processada
   * @returns Resposta do manipulador
   */
  async handle(intent: Intent): Promise<string> {
    // Verificar se a ação é suportada
    if (!this.isActionSupported(intent.action, this.supportedActions)) {
      return this.getUnsupportedActionResponse(intent);
    }

    // Processar a ação
    try {
      switch (intent.action) {
        case "list_issues":
          return await this.handleListIssues();

        case "list_milestones":
          return await this.handleListMilestones();

        case "list_projects":
          return await this.handleListProjects();

        case "info":
          return await this.handleInfo();

        default:
          return `Operação do GitHub não implementada: ${intent.action}`;
      }
    } catch (error: any) {
      return `Erro ao processar operação do GitHub: ${error.message}`;
    }
  }

  /**
   * Processa a ação de listar issues do GitHub
   */
  private async handleListIssues(): Promise<string> {
    try {
      const issues = await fetchGitHubIssues();

      if (!issues || issues.length === 0) {
        return "Nenhuma issue encontrada no GitHub.";
      }

      // Formatar a lista de issues
      const issuesFormatted = issues
        .map((issue: any) => {
          return `- #${issue.number}: ${issue.title} (${issue.state})`;
        })
        .join("\n");

      return `Issues encontradas no GitHub (${issues.length}):\n\n${issuesFormatted}`;
    } catch (error: any) {
      return `Erro ao listar issues do GitHub: ${error.message}`;
    }
  }

  /**
   * Processa a ação de listar milestones do GitHub
   */
  private async handleListMilestones(): Promise<string> {
    try {
      const milestones = await fetchMilestones();

      if (!milestones || milestones.size === 0) {
        return "Nenhuma milestone encontrada no GitHub.";
      }

      // Formatar a lista de milestones
      const milestonesFormatted = Array.from(milestones.entries())
        .map(([name, id]) => {
          return `- ${name} (ID: ${id})`;
        })
        .join("\n");

      return `Milestones encontradas no GitHub (${milestones.size}):\n\n${milestonesFormatted}`;
    } catch (error: any) {
      return `Erro ao listar milestones do GitHub: ${error.message}`;
    }
  }

  /**
   * Processa a ação de listar projetos do GitHub
   */
  private async handleListProjects(): Promise<string> {
    try {
      const projects = await fetchProjects();

      if (!projects || projects.size === 0) {
        return "Nenhum projeto encontrado no GitHub.";
      }

      // Formatar a lista de projetos
      const projectsFormatted = Array.from(projects.entries())
        .map(([name, id]) => {
          return `- ${name} (ID: ${id})`;
        })
        .join("\n");

      return `Projetos encontrados no GitHub (${projects.size}):\n\n${projectsFormatted}`;
    } catch (error: any) {
      return `Erro ao listar projetos do GitHub: ${error.message}`;
    }
  }

  /**
   * Processa a ação de mostrar informações do GitHub
   */
  private async handleInfo(): Promise<string> {
    try {
      // Capturar a saída dos comandos de listagem
      let output = "# Informações do GitHub\n\n";

      // Capturar informações das variáveis de ambiente
      const githubToken = process.env.GITHUB_TOKEN ? "✅ Configurado" : "❌ Não configurado";
      const githubOwner = process.env.GITHUB_OWNER || "Não configurado";
      const githubRepo = process.env.GITHUB_REPO || "Não configurado";

      output += `## Configuração\n`;
      output += `- Token: ${githubToken}\n`;
      output += `- Proprietário: ${githubOwner}\n`;
      output += `- Repositório: ${githubRepo}\n\n`;

      // Buscar milestones
      try {
        const milestones = await fetchMilestones();
        output += `## Milestones (${milestones.size})\n`;

        if (milestones.size === 0) {
          output += "Nenhuma milestone encontrada.\n\n";
        } else {
          Array.from(milestones.entries()).forEach(([name, id]) => {
            output += `- ${name} (ID: ${id})\n`;
          });
          output += "\n";
        }
      } catch (error: any) {
        output += `Erro ao buscar milestones: ${error.message}\n\n`;
      }

      // Buscar projetos
      try {
        const projects = await fetchProjects();
        output += `## Projetos (${projects.size})\n`;

        if (projects.size === 0) {
          output += "Nenhum projeto encontrado.\n\n";
        } else {
          Array.from(projects.entries()).forEach(([name, id]) => {
            output += `- ${name} (ID: ${id})\n`;
          });
          output += "\n";
        }
      } catch (error: any) {
        output += `Erro ao buscar projetos: ${error.message}\n\n`;
      }

      output += `## Recomendações\n`;
      output += `- Use o comando 'devtask sync' para sincronizar tarefas com o GitHub\n`;
      output += `- Certifique-se de que seu token tem os escopos necessários (repo, project)\n`;

      return output;
    } catch (error: any) {
      return `Erro ao obter informações do GitHub: ${error.message}`;
    }
  }
}
