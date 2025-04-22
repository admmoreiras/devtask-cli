import chalk from "chalk";
import inquirer from "inquirer";
import { executeCode } from "../utils/code-executor.js";
import { fileAgent } from "../utils/file-agent.js";
import { getFileStructure, isPathSafe, listDirectory, readFile } from "../utils/file-explorer.js";
import { getHistory, saveToHistory } from "../utils/history.js";
import { checkOpenAIApiKey } from "../utils/openai.js";

interface ChatMessage {
  role: "user" | "assistant" | "system";
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
  console.log(chalk.yellow("Comandos especiais:"));
  console.log(chalk.yellow("  !ls [caminho] - Lista arquivos e diretórios"));
  console.log(chalk.yellow("  !cat [arquivo] - Mostra o conteúdo de um arquivo"));
  console.log(chalk.yellow("  !tree [caminho] - Mostra a estrutura de diretórios"));
  console.log(chalk.yellow("  !propose [action] [path] - Propõe uma alteração em um arquivo"));
  console.log(chalk.yellow("  !apply - Aplica as alterações propostas"));
  console.log(chalk.yellow("  !cancel - Cancela as alterações propostas"));
  console.log(chalk.yellow("  !changes - Mostra as alterações propostas"));
  console.log(chalk.yellow("  !help - Mostra todos os comandos disponíveis\n"));

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

  // Adicionar mensagem do sistema para contextualizar sobre o projeto
  currentSession.messages.push({
    role: "system",
    content: `Você é um assistente de desenvolvimento avançado que pode analisar código e arquivos do projeto atual. 
Você também pode propor e aplicar alterações em arquivos.

Quando o usuário pedir para você fazer uma alteração, sugira o código completo e explique as mudanças.
Em seguida, ofereça aplicar a alteração usando os comandos !propose. Exemplos:

Para criar um arquivo:
!propose create caminho/do/arquivo
\`\`\`
conteúdo do arquivo
\`\`\`

Para modificar um arquivo:
!propose modify caminho/do/arquivo
\`\`\`
novo conteúdo completo do arquivo
\`\`\`

Para excluir um arquivo:
!propose delete caminho/do/arquivo

Após propor alterações, o usuário pode digitar !apply para aplicá-las ou !cancel para cancelá-las.
Tente ser o mais útil possível com base no código que você visualiza.`,
  });

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

      // Garantir que haja uma mensagem de sistema
      if (!currentSession.messages.some((msg) => msg.role === "system")) {
        currentSession.messages.unshift({
          role: "system",
          content:
            "Você é um assistente de desenvolvimento que pode analisar código e arquivos do projeto atual. O usuário pode pedir para você analisar arquivos específicos ou a estrutura do projeto. Tente ser o mais útil possível com base no código que você visualiza.",
        });
      }

      // Mostrar últimas mensagens da conversa ou todas se forem poucas
      const messagesToShow = currentSession.messages
        .filter((msg) => msg.role !== "system")
        .slice(Math.max(0, currentSession.messages.length - 6), currentSession.messages.length);

      console.log(chalk.yellow("\nRetomando conversa anterior:"));
      messagesToShow.forEach((msg) => {
        if (msg.role === "system") return; // Não mostrar mensagens do sistema
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

  // Função para processar comandos especiais
  const processSpecialCommand = async (command: string): Promise<string | null> => {
    // Dividir o comando em partes (comando e argumentos)
    const parts = command.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case "!help":
        return `
Comandos disponíveis:
- !ls [caminho] - Lista arquivos e diretórios
- !cat [arquivo] - Mostra o conteúdo de um arquivo
- !tree [caminho] - Mostra a estrutura de diretórios
- !propose create [caminho] - Propõe a criação de um arquivo (seguido pelo conteúdo)
- !propose modify [caminho] - Propõe a modificação de um arquivo (seguido pelo novo conteúdo)
- !propose delete [caminho] - Propõe a exclusão de um arquivo
- !changes - Mostra as alterações propostas pendentes
- !apply - Aplica as alterações propostas
- !cancel - Cancela as alterações propostas
- !help - Mostra esta ajuda`;

      case "!ls":
        try {
          const path = args.join(" ") || ".";
          if (!isPathSafe(path)) {
            return `⚠️ Acesso negado. O caminho "${path}" contém diretórios ou arquivos sensíveis.`;
          }

          const files = await listDirectory(path);

          // Formatar saída
          const fileList = files
            .map((file) => {
              const type = file.isDirectory ? "DIR" : "FILE";
              return `[${type}] ${file.name}`;
            })
            .join("\n");

          return `Arquivos em "${path}":\n${fileList}`;
        } catch (error: any) {
          return `Erro ao listar diretório: ${error.message}`;
        }

      case "!cat":
        try {
          const filePath = args.join(" ");
          if (!filePath) {
            return `Erro: Você precisa especificar um arquivo. Exemplo: !cat src/index.ts`;
          }

          if (!isPathSafe(filePath)) {
            return `⚠️ Acesso negado. O arquivo "${filePath}" é sensível ou está fora do projeto.`;
          }

          const content = await readFile(filePath);
          if (content === null) {
            return `Erro: Não foi possível ler o arquivo "${filePath}".`;
          }

          return `Conteúdo de "${filePath}":\n\n\`\`\`\n${content}\n\`\`\``;
        } catch (error: any) {
          return `Erro ao ler arquivo: ${error.message}`;
        }

      case "!tree":
        try {
          const path = args.join(" ") || ".";
          if (!isPathSafe(path)) {
            return `⚠️ Acesso negado. O caminho "${path}" contém diretórios ou arquivos sensíveis.`;
          }

          const structure = await getFileStructure(path);
          return `Estrutura de diretórios para "${path}":\n\n\`\`\`\n${structure}\n\`\`\``;
        } catch (error: any) {
          return `Erro ao obter estrutura de diretórios: ${error.message}`;
        }

      case "!propose":
        // Verificar se há alterações pendentes
        if (fileAgent.hasPendingChanges()) {
          return `⚠️ Já existem alterações pendentes. Use !apply para aplicá-las ou !cancel para cancelá-las antes de propor novas alterações.`;
        }

        // Verificar se a ação e o caminho foram especificados
        if (args.length < 2) {
          return `Erro: Uso incorreto do comando. Exemplos:\n!propose create arquivo.txt\n!propose modify arquivo.txt\n!propose delete arquivo.txt`;
        }

        const action = args[0].toLowerCase();
        const filePath = args.slice(1).join(" ");

        if (!isPathSafe(filePath)) {
          return `⚠️ Acesso negado. O caminho "${filePath}" contém diretórios ou arquivos sensíveis.`;
        }

        // Processar conforme a ação
        switch (action) {
          case "create":
            try {
              // Aguardar o próximo input do usuário para o conteúdo
              return `Por favor, digite o conteúdo do arquivo "${filePath}" a ser criado:\n(Digite '!endcontent' em uma linha separada quando terminar)`;
            } catch (error: any) {
              return `Erro ao propor criação de arquivo: ${error.message}`;
            }

          case "modify":
            try {
              // Aguardar o próximo input do usuário para o novo conteúdo
              return `Por favor, digite o novo conteúdo do arquivo "${filePath}":\n(Digite '!endcontent' em uma linha separada quando terminar)`;
            } catch (error: any) {
              return `Erro ao propor modificação de arquivo: ${error.message}`;
            }

          case "delete":
            try {
              const success = await fileAgent.proposeDelete(filePath);
              if (success) {
                return `✅ Exclusão do arquivo "${filePath}" proposta com sucesso.\nDigite !changes para ver as alterações pendentes.\nDigite !apply para aplicar ou !cancel para cancelar.`;
              } else {
                return `❌ Não foi possível propor a exclusão do arquivo "${filePath}".`;
              }
            } catch (error: any) {
              return `Erro ao propor exclusão de arquivo: ${error.message}`;
            }

          default:
            return `Ação inválida: ${action}. Use 'create', 'modify' ou 'delete'.`;
        }

      case "!changes":
        return await fileAgent.showPendingChanges();

      case "!apply":
        try {
          const result = await fileAgent.applyChanges();
          return result.message;
        } catch (error: any) {
          return `Erro ao aplicar alterações: ${error.message}`;
        }

      case "!cancel":
        try {
          if (!fileAgent.hasPendingChanges()) {
            return `Não há alterações pendentes para cancelar.`;
          }

          fileAgent.clearPendingChanges();
          return `✅ Todas as alterações pendentes foram canceladas.`;
        } catch (error: any) {
          return `Erro ao cancelar alterações: ${error.message}`;
        }

      default:
        return null; // Não é um comando especial
    }
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

  // Função para processar solicitação de análise de arquivo
  const processFileAnalysisRequest = async (userInput: string): Promise<string | null> => {
    // Expressões regulares para detectar solicitações de análise de arquivo
    const patterns = [
      /analis[ae]r?\s+o\s+(?:arquivo|código)\s+(?:em\s+)?['""]?([^'""\s]+)['""]?/i,
      /ver\s+o\s+(?:arquivo|código)\s+(?:em\s+)?['""]?([^'""\s]+)['""]?/i,
      /mostr[ae]r?\s+o\s+(?:arquivo|código)\s+(?:em\s+)?['""]?([^'""\s]+)['""]?/i,
      /examin[ae]r?\s+o\s+(?:arquivo|código)\s+(?:em\s+)?['""]?([^'""\s]+)['""]?/i,
      /le[ir]?\s+o\s+(?:arquivo|código)\s+(?:em\s+)?['""]?([^'""\s]+)['""]?/i,
    ];

    for (const pattern of patterns) {
      const match = userInput.match(pattern);
      if (match && match[1]) {
        const filePath = match[1];

        // Verificar caminho seguro
        if (!isPathSafe(filePath)) {
          return `⚠️ Acesso negado. O arquivo "${filePath}" é sensível ou está fora do projeto.`;
        }

        // Ler conteúdo do arquivo
        const content = await readFile(filePath);
        if (content === null) {
          return `Não consegui encontrar ou ler o arquivo "${filePath}". Verifique se o caminho está correto.`;
        }

        return `Conteúdo do arquivo "${filePath}":\n\n\`\`\`\n${content}\n\`\`\`\n\nVocê quer que eu analise este código?`;
      }
    }

    return null; // Não é uma solicitação de análise de arquivo
  };

  // Estado para controlar se está coletando conteúdo para uma operação de arquivo
  let collectingContent = false;
  let collectingFor: { action: "create" | "modify"; path: string } | null = null;
  let collectedContent = "";

  // Loop principal do chat
  let chatting = true;
  while (chatting) {
    const { userInput } = await inquirer.prompt([
      {
        type: "input",
        name: "userInput",
        message: collectingContent ? chalk.green(`Conteúdo para ${collectingFor?.path}:`) : chalk.green("Você:"),
        prefix: "",
      },
    ]);

    // Comando para sair
    if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "sair") {
      chatting = false;
      break;
    }

    // Se estiver coletando conteúdo para uma operação de arquivo
    if (collectingContent && collectingFor) {
      if (userInput === "!endcontent") {
        // Finalizar coleta de conteúdo
        collectingContent = false;

        let success = false;
        let message = "";

        if (collectingFor.action === "create") {
          success = await fileAgent.proposeCreate(collectingFor.path, collectedContent);
          message = success
            ? `✅ Criação do arquivo "${collectingFor.path}" proposta com sucesso.\nDigite !changes para ver as alterações pendentes.\nDigite !apply para aplicar ou !cancel para cancelar.`
            : `❌ Não foi possível propor a criação do arquivo "${collectingFor.path}".`;
        } else if (collectingFor.action === "modify") {
          success = await fileAgent.proposeModify(collectingFor.path, collectedContent);
          message = success
            ? `✅ Modificação do arquivo "${collectingFor.path}" proposta com sucesso.\nDigite !changes para ver as alterações pendentes.\nDigite !apply para aplicar ou !cancel para cancelar.`
            : `❌ Não foi possível propor a modificação do arquivo "${collectingFor.path}".`;
        }

        console.log(chalk.blue("\nSistema:"));
        console.log(message);

        // Limpar variáveis de coleta
        collectingFor = null;
        collectedContent = "";

        continue;
      } else {
        // Adicionar linha ao conteúdo coletado
        collectedContent += (collectedContent ? "\n" : "") + userInput;
        continue;
      }
    }

    // Verificar se é um comando especial
    if (userInput.startsWith("!")) {
      const commandResult = await processSpecialCommand(userInput);
      if (commandResult) {
        console.log(chalk.blue("\nSistema:"));
        console.log(commandResult);

        // Verificar se é um comando de proposta que requer coleta de conteúdo
        if (userInput.startsWith("!propose create")) {
          const parts = userInput.split(/\s+/);
          if (parts.length >= 3) {
            collectingContent = true;
            collectingFor = {
              action: "create",
              path: parts.slice(2).join(" "),
            };
            collectedContent = "";
          }
        } else if (userInput.startsWith("!propose modify")) {
          const parts = userInput.split(/\s+/);
          if (parts.length >= 3) {
            collectingContent = true;
            collectingFor = {
              action: "modify",
              path: parts.slice(2).join(" "),
            };
            collectedContent = "";
          }
        }

        continue; // Não enviar para o ChatGPT, continuar o loop
      }
    }

    // Verificar se é uma solicitação de análise de arquivo
    const fileAnalysisResult = await processFileAnalysisRequest(userInput);
    if (fileAnalysisResult) {
      // Adicionar mensagem do usuário à sessão
      currentSession.messages.push({
        role: "user",
        content: userInput,
      });

      // Adicionar conteúdo do arquivo como resposta do sistema
      currentSession.messages.push({
        role: "assistant",
        content: fileAnalysisResult,
      });

      console.log(chalk.blue("\nAssistente:"));
      console.log(fileAnalysisResult);

      // Atualizar timestamp da sessão
      currentSession.updatedAt = new Date().toISOString();

      // Salvar histórico
      await saveToHistory(currentSession);

      continue; // Continuar o loop
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
