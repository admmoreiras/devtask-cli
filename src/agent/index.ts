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
  private debugMode: boolean = false;

  constructor() {
    this.contextManager = new ContextManager();
    this.intentProcessor = new IntentProcessor();
    this.actionRouter = new ActionRouter(this.contextManager);

    // Ativar modo de debug se a variável de ambiente estiver definida
    this.debugMode = process.env.DEBUG_INTENT === "true";
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

    // Mostrar as capacidades do sistema
    console.log(chalk.yellow(this.contextManager.getCapabilities()));
    console.log("");

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

      // Comando de ajuda
      if (userInput.toLowerCase() === "ajuda" || userInput.toLowerCase() === "help") {
        console.log(chalk.yellow(this.contextManager.getCapabilities()));
        continue;
      }

      // Ativar/desativar modo de debug
      if (userInput.toLowerCase() === "debug on") {
        this.debugMode = true;
        console.log(chalk.magenta("Modo de debug ativado. As intenções detectadas serão exibidas."));
        continue;
      }

      if (userInput.toLowerCase() === "debug off") {
        this.debugMode = false;
        console.log(chalk.magenta("Modo de debug desativado."));
        continue;
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

      // Log de debug se o modo estiver ativado
      if (this.debugMode) {
        console.log(chalk.magenta("\n📝 Intenção detectada:"));
        console.log(chalk.magenta(`Tipo: ${intent.type}`));
        console.log(chalk.magenta(`Ação: ${intent.action}`));
        console.log(chalk.magenta(`Parâmetros: ${JSON.stringify(intent.parameters, null, 2)}`));
        console.log(chalk.magenta("-----------------------------------"));
      }

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
