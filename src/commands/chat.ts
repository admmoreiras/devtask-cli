import chalk from "chalk";
import inquirer from "inquirer";
import { executeCode } from "../utils/code-executor.js";
import { getHistory, saveToHistory } from "../utils/history.js";
import { checkOpenAIApiKey } from "../utils/openai.js";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatSession {
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// Interface para tipagem da resposta da OpenAI
interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// Função principal do chat
export async function startChat() {
  // Verificar se a API Key do OpenAI está configurada
  if (!checkOpenAIApiKey()) {
    console.error(chalk.red("❌ OPENAI_API_KEY não encontrada. Configure-a no arquivo .env"));
    return;
  }

  console.log(chalk.green("\n🤖 DevTask Chat - Assistente de Desenvolvimento"));
  console.log(chalk.blue("Digite suas perguntas ou comandos. Digite 'exit' para sair.\n"));

  // Opcionalmente carregar histórico anterior
  const useHistory = await inquirer.prompt([
    {
      type: "confirm",
      name: "loadHistory",
      message: "Deseja carregar conversas anteriores?",
      default: false,
    },
  ]);

  let currentSession: ChatSession = {
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (useHistory.loadHistory) {
    const history = await getHistory();
    if (history.sessions.length > 0) {
      const { selectedSession } = await inquirer.prompt([
        {
          type: "list",
          name: "selectedSession",
          message: "Selecione uma conversa para continuar:",
          choices: history.sessions.map((session, index) => ({
            name: `${new Date(session.createdAt).toLocaleString()} (${session.messages.length} mensagens)`,
            value: index,
          })),
        },
      ]);

      currentSession = history.sessions[selectedSession];

      // Mostrar últimas 3 mensagens da conversa ou todas se forem menos que 3
      const messagesToShow = currentSession.messages.slice(
        Math.max(0, currentSession.messages.length - 6),
        currentSession.messages.length
      );

      console.log(chalk.yellow("\nRetomando conversa anterior:"));
      messagesToShow.forEach((msg) => {
        const prefix = msg.role === "user" ? chalk.green("Você: ") : chalk.blue("Assistente: ");
        console.log(prefix + msg.content.split("\n")[0].substring(0, 100) + (msg.content.length > 100 ? "..." : ""));
      });
    } else {
      console.log(chalk.yellow("Nenhuma conversa anterior encontrada. Iniciando nova conversa."));
    }
  }

  // Função para processar a resposta contendo código
  const processResponseWithCode = async (response: string): Promise<string> => {
    // Verifica se tem blocos de código JavaScript/TypeScript
    const codeBlockRegex = /```(?:javascript|typescript|js|ts|)\n([\s\S]*?)```/g;
    const codeBlocks = [];
    let match;

    while ((match = codeBlockRegex.exec(response)) !== null) {
      codeBlocks.push(match[1]);
    }

    // Se tiver blocos de código, oferecer para executar
    if (codeBlocks.length > 0) {
      console.log(chalk.yellow(`\nEncontrados ${codeBlocks.length} blocos de código na resposta.`));

      for (let i = 0; i < codeBlocks.length; i++) {
        const codeBlock = codeBlocks[i];

        const { shouldExecute } = await inquirer.prompt([
          {
            type: "confirm",
            name: "shouldExecute",
            message: `Deseja executar o bloco de código ${i + 1}?`,
            default: false,
          },
        ]);

        if (shouldExecute) {
          console.log(chalk.blue("\nExecutando código:"));
          console.log(chalk.gray("----------------------------------------"));
          console.log(codeBlock);
          console.log(chalk.gray("----------------------------------------"));

          try {
            const result = await executeCode(codeBlock);
            console.log(chalk.green("\nResultado da execução:"));
            console.log(chalk.gray("----------------------------------------"));
            console.log(result);
            console.log(chalk.gray("----------------------------------------"));
          } catch (error) {
            console.error(chalk.red("\nErro na execução:"));
            console.error(error);
          }
        }
      }
    }

    return response;
  };

  // Função para enviar mensagem para a API do ChatGPT
  const sendMessageToChatGPT = async (userMessage: string, messages: ChatMessage[]): Promise<string> => {
    try {
      // Importar dinamicamente para compatibilidade com ESM
      const { default: axios } = await import("axios");

      const response = await axios.post<OpenAIResponse>(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-3.5-turbo",
          messages: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          temperature: 0.7,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error(chalk.red("❌ Erro ao comunicar com a API do ChatGPT:"), error);
      return "Desculpe, ocorreu um erro na comunicação com o ChatGPT.";
    }
  };

  // Loop principal do chat
  let chatting = true;
  while (chatting) {
    const { userInput } = await inquirer.prompt([
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

    // Adicionar mensagem do usuário à sessão
    currentSession.messages.push({
      role: "user",
      content: userInput,
    });

    // Exibir spinner de carregamento
    console.log(chalk.blue("Assistente está pensando..."));

    // Enviar para o ChatGPT
    const assistantResponse = await sendMessageToChatGPT(userInput, currentSession.messages);

    // Adicionar resposta do assistente à sessão
    currentSession.messages.push({
      role: "assistant",
      content: assistantResponse,
    });

    // Exibir resposta e processar código se houver
    console.log(chalk.blue("\nAssistente:"));
    console.log(assistantResponse);

    await processResponseWithCode(assistantResponse);

    // Atualizar timestamp da sessão
    currentSession.updatedAt = new Date().toISOString();

    // Salvar histórico a cada interação
    await saveToHistory(currentSession);
  }

  console.log(chalk.green("\n👋 Até a próxima!"));
}
