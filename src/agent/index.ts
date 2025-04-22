// Ponto de entrada principal do agente interativo
import chalk from "chalk";
import inquirer from "inquirer";
import { checkOpenAIApiKey } from "../utils/openai.js";
import { ActionRouter } from "./action-router.js";
import { ContextManager } from "./context-manager.js";
import { IntentProcessor } from "./intent-processor.js";

/**
 * Classe principal do agente interativo
 */
export class DevTaskAgent {
  private intentProcessor: IntentProcessor;
  private actionRouter: ActionRouter;
  private contextManager: ContextManager;

  constructor() {
    this.contextManager = new ContextManager();
    this.intentProcessor = new IntentProcessor();
    this.actionRouter = new ActionRouter(this.contextManager);
  }

  /**
   * Inicia o agente interativo
   */
  async start(): Promise<void> {
    // Verificar se a API Key do OpenAI está configurada
    if (!checkOpenAIApiKey()) {
      console.error(chalk.red("❌ OPENAI_API_KEY não encontrada. Configure-a no arquivo .env"));
      return;
    }

    console.log(chalk.green("\n🤖 DevTask Agente Interativo"));
    console.log(chalk.blue("Agora você pode conversar naturalmente com o assistente. Digite 'sair' para encerrar.\n"));

    // Mensagem inicial do sistema para o contexto
    this.contextManager.initialize();

    let chatting = true;
    while (chatting) {
      const { userInput }: { userInput: string } = await inquirer.prompt([
        {
          type: "input",
          name: "userInput",
          message: chalk.green("Você:"),
          prefix: "",
        },
      ]);

      // Comando para sair
      if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "sair") {
        chatting = false;
        break;
      }

      console.log(chalk.blue("Processando..."));

      try {
        // Processar a entrada do usuário
        const response = await this.processMessage(userInput);

        console.log(chalk.blue("\nAssistente:"));
        console.log(response);
      } catch (error: any) {
        console.error(chalk.red("❌ Erro ao processar mensagem:"), error.message);
      }
    }

    console.log(chalk.green("\n👋 Até a próxima!"));
  }

  /**
   * Processa uma mensagem do usuário
   * @param message Mensagem do usuário
   * @returns Resposta do agente
   */
  async processMessage(message: string): Promise<string> {
    try {
      // Adicionar mensagem ao contexto
      this.contextManager.addUserMessage(message);

      // Determinar a intenção do usuário
      const intent = await this.intentProcessor.process(message, this.contextManager.getRecentMessages());

      // Executar a ação apropriada
      const response = await this.actionRouter.route(intent);

      // Adicionar resposta ao contexto
      this.contextManager.addAssistantMessage(response);

      return response;
    } catch (error: any) {
      console.error("Erro ao processar mensagem:", error);
      return `Desculpe, ocorreu um erro ao processar sua solicitação: ${error.message}`;
    }
  }
}

/**
 * Inicia o agente interativo
 */
export async function startAgent(): Promise<void> {
  const agent = new DevTaskAgent();
  await agent.start();
}
