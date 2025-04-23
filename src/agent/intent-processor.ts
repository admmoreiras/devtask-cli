// Processador de intenções para analisar linguagem natural
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

// Cliente OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Tipos de intenção que o agente pode processar
export type IntentType = "task" | "github" | "file" | "code" | "chat";

// Interface para representar uma intenção
export interface Intent {
  type: IntentType;
  action: string;
  parameters: Record<string, any>;
  originalMessage: string;
}

/**
 * Classe responsável por processar a intenção do usuário
 */
export class IntentProcessor {
  /**
   * Processa uma mensagem para determinar a intenção
   * @param message Mensagem do usuário
   * @param context Mensagens recentes para contexto
   * @returns Intenção detectada
   */
  async process(message: string, context: Array<{ role: string; content: string }>): Promise<Intent> {
    try {
      // Realizar processamento preliminar para extrair caminhos de arquivos
      const preprocessedMessage = this.preprocessMessage(message);

      // Preparar funções para a API da OpenAI
      const functions = this.getFunctions();

      // Preparar mensagens para a API da OpenAI com tipagem correta
      const messages = [
        {
          role: "system" as const,
          content:
            "Você é um assistente inteligente especializado em entender comandos em linguagem natural para uma CLI de gerenciamento de tarefas de desenvolvimento. " +
            "Sua função é interpretar o que o usuário quer fazer, mesmo quando a linguagem usada é informal ou ambígua. " +
            "Você deve extrair a intenção principal, a ação desejada e quaisquer parâmetros relevantes. " +
            "Considere o contexto da conversa ao interpretar mensagens ambíguas ou curtas." +
            "\n\n" +
            "Tipos de intenção que você deve identificar:\n" +
            "- task: relacionada a tarefas de desenvolvimento (criar, listar, atualizar tarefas, etc.)\n" +
            "- github: relacionada a interações com o GitHub (sincronizar, obter informações)\n" +
            "- file: relacionada a arquivos e diretórios (listar, ler, mostrar estrutura)\n" +
            "- code: relacionada a código (gerar, explicar, executar)\n" +
            "- chat: conversas gerais, perguntas e respostas\n" +
            "\n" +
            "Exemplos de mapeamento para arquivos:\n" +
            "- 'mostrar minhas tarefas' → {type: 'task', action: 'list'}\n" +
            "- 'cria uma tarefa para implementar login' → {type: 'task', action: 'create', parameters: {title: 'Implementar login'}}\n" +
            "- 'sincronizar com o github' → {type: 'github', action: 'sync'}\n" +
            "- 'quais arquivos tem na pasta src' → {type: 'file', action: 'list', parameters: {path: 'src'}}\n" +
            "- 'listar o diretório src/utils' → {type: 'file', action: 'list', parameters: {path: 'src/utils'}}\n" +
            "- 'mostra o arquivo index.ts' → {type: 'file', action: 'read', parameters: {path: 'index.ts'}}\n" +
            "- 'ler o arquivo src/index.ts' → {type: 'file', action: 'read', parameters: {path: 'src/index.ts'}}\n" +
            "- 'mostra o conteúdo de src/commands/list.ts' → {type: 'file', action: 'read', parameters: {path: 'src/commands/list.ts'}}\n" +
            "- 'gera um componente react' → {type: 'code', action: 'generate', parameters: {type: 'react-component'}}\n" +
            "\n" +
            "IMPORTANTE:\n" +
            "1. Quando o usuário quer ler ou ver o conteúdo de um arquivo, a intenção é 'file' com ação 'read'.\n" +
            "2. Quando o usuário quer ver arquivos em um diretório, a intenção é 'file' com ação 'list'.\n" +
            "3. Sempre extraia o caminho do arquivo/diretório inteiro, incluindo extensões se presentes.\n" +
            "4. NUNCA omita o caminho completo mencionado pelo usuário nos parâmetros.\n" +
            "5. Preste muita atenção ao contexto da conversa. Se o usuário mencionar 'este arquivo' ou 'este diretório', \n" +
            "   refere-se provavelmente ao último arquivo ou diretório mencionado anteriormente na conversa.\n" +
            "\n" +
            "Seja flexível com a linguagem natural. Priorize o entendimento da intenção, mesmo quando o usuário não usa os termos exatos.",
        },
        ...context.map((msg) => ({
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content,
        })),
        { role: "user" as const, content: preprocessedMessage },
      ];

      // Chamar a API da OpenAI usando a biblioteca oficial
      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages,
        functions,
        function_call: { name: "extract_intent" },
        temperature: 0.1,
      });

      // Extrair a resposta
      const functionCall = response.choices[0].message?.function_call;

      if (!functionCall || !functionCall.arguments) {
        throw new Error("Falha ao extrair intenção");
      }

      // Analisar os argumentos da função
      const args = JSON.parse(functionCall.arguments);

      // Construir o objeto de intenção
      const intent: Intent = {
        type: args.intent_type,
        action: args.action,
        parameters: args.parameters || {},
        originalMessage: message,
      };

      // Aplicar correções adicionais se necessário
      return this.postProcessIntent(intent, message, context);
    } catch (error: any) {
      console.error("Erro ao processar intenção:", error);
      // Fallback para intenção de chat genérica
      return {
        type: "chat",
        action: "respond",
        parameters: {},
        originalMessage: message,
      };
    }
  }

  /**
   * Faz processamento preliminar da mensagem para extrair contextos especiais como caminhos
   */
  private preprocessMessage(message: string): string {
    // Adicionar informações de diagnóstico para ajudar a IA a extrair melhor os caminhos
    return message;
  }

  /**
   * Faz correções adicionais na intenção para casos que a IA não extrai corretamente
   * @param intent Intenção detectada
   * @param originalMessage Mensagem original do usuário
   * @param context Contexto da conversa
   * @returns Intenção corrigida
   */
  private postProcessIntent(
    intent: Intent,
    originalMessage: string,
    context: Array<{ role: string; content: string }>
  ): Intent {
    // Normalizar a mensagem para processamento
    const normalizedMessage = originalMessage.toLowerCase();

    // Tratamento especial para solicitações de estrutura de projeto
    if (
      normalizedMessage.includes("estrutura do projeto") ||
      normalizedMessage.includes("estrutura de arquivos") ||
      normalizedMessage.includes("mostrar estrutura") ||
      normalizedMessage.includes("ver estrutura") ||
      (normalizedMessage.includes("listar") && normalizedMessage.includes("estrutura")) ||
      (normalizedMessage.includes("mostrar") && normalizedMessage.includes("projeto"))
    ) {
      intent.type = "file";
      intent.action = "structure";
      intent.parameters.path = ".";
      return intent;
    }

    // Verificar referências a elementos no contexto (este arquivo, este diretório, etc.)
    if (
      normalizedMessage.includes("este arquivo") ||
      normalizedMessage.includes("esse arquivo") ||
      normalizedMessage.includes("o mesmo arquivo") ||
      normalizedMessage.includes("o arquivo") ||
      normalizedMessage.includes("modificar")
    ) {
      // Buscar arquivo mais recente no contexto
      const recentFile = this.findMostRecentFileReference(context);

      if (recentFile) {
        if (normalizedMessage.includes("modificar") || normalizedMessage.includes("editar")) {
          intent.type = "file";
          intent.action = "modify";
          intent.parameters.path = recentFile;
        } else if (
          normalizedMessage.includes("ler") ||
          normalizedMessage.includes("ver") ||
          normalizedMessage.includes("mostrar") ||
          normalizedMessage.includes("conteúdo")
        ) {
          intent.type = "file";
          intent.action = "read";
          intent.parameters.path = recentFile;
        } else if (
          normalizedMessage.includes("explicar") ||
          normalizedMessage.includes("analisar") ||
          normalizedMessage.includes("entender") ||
          normalizedMessage.includes("explicação de")
        ) {
          intent.type = "code";
          intent.action = "explain";
          intent.parameters.path = recentFile;
        }
      }
    }

    // Tratamento para comandos de listagem de diretórios sem caminho específico
    if (
      (normalizedMessage.includes("listar") ||
        normalizedMessage.includes("list") ||
        normalizedMessage.includes("ls") ||
        normalizedMessage.includes("mostrar arquivos") ||
        normalizedMessage.includes("mostrar diretórios") ||
        normalizedMessage.includes("ver arquivos") ||
        normalizedMessage.includes("ver diretórios")) &&
      !intent.parameters.path
    ) {
      intent.type = "file";
      intent.action = "list";

      // Se mencionar "este diretório" ou similar, usar o diretório atual do contexto
      if (
        normalizedMessage.includes("este diretório") ||
        normalizedMessage.includes("esse diretório") ||
        normalizedMessage.includes("esta pasta") ||
        normalizedMessage.includes("essa pasta") ||
        normalizedMessage.includes("atual") ||
        normalizedMessage.includes("aqui")
      ) {
        const recentDir = this.findMostRecentDirectoryReference(context);
        intent.parameters.path = recentDir || ".";
      } else {
        // Usar diretório raiz como padrão quando não há caminho específico
        intent.parameters.path = ".";
      }

      return intent;
    }

    // Tratamento para explicação de código sem especificar o arquivo
    if (
      (normalizedMessage.includes("explicar") ||
        normalizedMessage.includes("explique") ||
        normalizedMessage.includes("explicação do código") ||
        normalizedMessage.includes("analisar código") ||
        normalizedMessage.includes("explica")) &&
      (normalizedMessage.includes("código") || normalizedMessage.includes("code"))
    ) {
      const recentFile = this.findMostRecentFileReference(context);
      if (recentFile) {
        intent.type = "code";
        intent.action = "explain";
        intent.parameters.path = recentFile;
        return intent;
      }
    }

    // Tratamento especial para comandos de listagem de diretórios
    if (
      normalizedMessage.includes("listar") ||
      normalizedMessage.includes("mostrar") ||
      normalizedMessage.includes("exibir") ||
      normalizedMessage.includes("ver") ||
      normalizedMessage.includes("o que tem")
    ) {
      if (
        normalizedMessage.includes("pasta") ||
        normalizedMessage.includes("diretório") ||
        normalizedMessage.includes("diretorio") ||
        normalizedMessage.includes("arquivos")
      ) {
        // É provavelmente uma intenção de listagem de diretório
        intent.type = "file";
        intent.action = "list";

        // Se referir a "este diretório" ou similar, buscar no contexto
        if (
          normalizedMessage.includes("este diretório") ||
          normalizedMessage.includes("essa pasta") ||
          normalizedMessage.includes("essa diretório") ||
          normalizedMessage.includes("este pasta")
        ) {
          const recentDir = this.findMostRecentDirectoryReference(context);
          if (recentDir) {
            intent.parameters.path = recentDir;
            return intent;
          }
        }

        // Tentar extrair o caminho do diretório
        let directoryPath = this.extractDirectoryPath(normalizedMessage);
        if (directoryPath) {
          intent.parameters.path = directoryPath;
        } else if (!intent.parameters.path) {
          // Se não foi possível extrair um caminho e não temos um em parameters,
          // usar o diretório atual como padrão
          intent.parameters.path = ".";
        }

        return intent;
      }
    }

    // Tratamento especial para comandos de leitura de arquivos
    if (
      normalizedMessage.includes("ler") ||
      normalizedMessage.includes("mostrar") ||
      normalizedMessage.includes("conteúdo") ||
      normalizedMessage.includes("abrir") ||
      normalizedMessage.includes("cat")
    ) {
      if (normalizedMessage.includes("arquivo") || normalizedMessage.match(/\.[a-z]+\b/)) {
        // Contém extensão de arquivo

        // É provavelmente uma intenção de leitura de arquivo
        intent.type = "file";
        intent.action = "read";

        // Tentar extrair o caminho do arquivo
        let filePath = this.extractFilePath(normalizedMessage);
        if (filePath) {
          intent.parameters.path = filePath;
        }

        return intent;
      }
    }

    // Se é uma ação relacionada a arquivos, verificar se o caminho foi extraído corretamente
    if (intent.type === "file" && (intent.action === "read" || intent.action === "list")) {
      // Se não temos um caminho nos parâmetros, tentar extrair manualmente
      if (!intent.parameters.path) {
        let extractedPath = null;

        if (intent.action === "read") {
          extractedPath = this.extractFilePath(normalizedMessage);
        } else if (intent.action === "list") {
          extractedPath = this.extractDirectoryPath(normalizedMessage);
        }

        if (extractedPath) {
          intent.parameters.path = extractedPath;
        } else {
          // Se ainda não temos um caminho, usar o diretório atual
          intent.parameters.path = ".";
        }
      }
    }

    return intent;
  }

  /**
   * Encontra a referência ao arquivo mais recente no contexto da conversa
   * @param context Mensagens do contexto
   * @returns Caminho do arquivo ou null
   */
  private findMostRecentFileReference(context: Array<{ role: string; content: string }>): string | null {
    // Percorrer o contexto de trás para frente para encontrar a referência mais recente
    for (let i = context.length - 1; i >= 0; i--) {
      const message = context[i];

      // Buscamos por duas coisas:
      // 1. Uma mensagem do assistente que mostra o conteúdo de um arquivo
      if (message.role === "assistant" && message.content.includes("Conteúdo de")) {
        const match = message.content.match(/Conteúdo de "(.*?)"/i);
        if (match && match[1]) {
          return match[1];
        }
      }

      // 2. Uma intenção de leitura de arquivo na mensagem do usuário
      if (message.role === "user") {
        // Procurar por padrões que indicam que o usuário estava pedindo para ler um arquivo
        const filePatterns = [
          /ler\s+(?:o\s+)?(?:arquivo\s+)?(\S+\.[a-zA-Z0-9]+)/i,
          /ver\s+(?:o\s+)?(?:arquivo\s+)?(\S+\.[a-zA-Z0-9]+)/i,
          /mostrar\s+(?:o\s+)?(?:arquivo\s+)?(\S+\.[a-zA-Z0-9]+)/i,
          /conteúdo\s+(?:do\s+)?(?:arquivo\s+)?(\S+\.[a-zA-Z0-9]+)/i,
        ];

        for (const pattern of filePatterns) {
          const match = message.content.match(pattern);
          if (match && match[1]) {
            return match[1];
          }
        }

        // Verificar se tem algum caminho de arquivo com extensão na mensagem
        const filePathMatch = message.content.match(/\b(\S+\.[a-zA-Z0-9]+)\b/);
        if (filePathMatch && filePathMatch[1]) {
          return filePathMatch[1];
        }
      }
    }

    return null;
  }

  /**
   * Encontra a referência ao diretório mais recente no contexto da conversa
   * @param context Mensagens do contexto
   * @returns Caminho do diretório ou null
   */
  private findMostRecentDirectoryReference(context: Array<{ role: string; content: string }>): string | null {
    // Percorrer o contexto de trás para frente para encontrar a referência mais recente
    for (let i = context.length - 1; i >= 0; i--) {
      const message = context[i];

      // Buscamos por duas coisas:
      // 1. Uma mensagem do assistente que lista arquivos de um diretório
      if (message.role === "assistant" && message.content.includes("Arquivos em")) {
        const match = message.content.match(/Arquivos em "(.*?)"/i);
        if (match && match[1]) {
          return match[1];
        }
      }

      // 2. Uma intenção de listagem de diretório na mensagem do usuário
      if (message.role === "user") {
        // Procurar por padrões que indicam que o usuário estava pedindo para listar um diretório
        const dirPatterns = [
          /listar\s+(?:o\s+)?(?:diretório|pasta)\s+(\S+)/i,
          /ver\s+(?:o\s+)?(?:diretório|pasta)\s+(\S+)/i,
          /mostrar\s+(?:o\s+)?(?:diretório|pasta)\s+(\S+)/i,
          /arquivos\s+(?:do|da|de)\s+(\S+)/i,
        ];

        for (const pattern of dirPatterns) {
          const match = message.content.match(pattern);
          if (match && match[1]) {
            return match[1];
          }
        }

        // Verificar se há algum caminho de diretório na mensagem
        const dirPathMatch = message.content.match(/\b(\S+\/)\b/);
        if (dirPathMatch && dirPathMatch[1]) {
          return dirPathMatch[1];
        }
      }
    }

    return null;
  }

  /**
   * Extrai o caminho de um arquivo da mensagem
   */
  private extractFilePath(message: string): string | null {
    // Expressões regulares para encontrar padrões de caminho de arquivo
    const filePathPatterns = [
      // Padrão para "arquivo X" ou "o arquivo X" com artigos
      /(?:o\s+)?(?:arquivo|file)(?:\s+d[aoe])?(?:\s+a)?(?:\s+o)?\s+([a-zA-Z0-9_\-.\/]+)/i,

      // Padrão para "ler X" ou "ver X" ou "mostrar X" ou "conteúdo de X"
      /(?:ler|ver|mostrar|exibir|cat|abrir|conteúdo\s+d[aeo])\s+([a-zA-Z0-9_\-.\/]+)/i,

      // Padrão para qualquer coisa que pareça um caminho de arquivo com extensão
      /\b((?:\.{0,2}\/)?[a-zA-Z0-9_\-]+(?:\/[a-zA-Z0-9_\-]+)*\.[a-zA-Z0-9]+)\b/,

      // Padrão mais genérico para capturar diretórios e arquivos
      /\b((?:\.{0,2}\/)?[a-zA-Z0-9_\-]+(?:\/[a-zA-Z0-9_\-]+)+(?:\.[a-zA-Z0-9]+)?)\b/,

      // Padrão mais simples para arquivos na raiz
      /\b([a-zA-Z0-9_\-]+\.[a-zA-Z0-9]+)\b/,
    ];

    for (const pattern of filePathPatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Extrai o caminho de um diretório da mensagem
   */
  private extractDirectoryPath(message: string): string | null {
    // Limpar a mensagem de preposições para facilitar a extração
    const cleaned = message
      .replace(/no diretório/gi, "")
      .replace(/na pasta/gi, "")
      .replace(/do diretório/gi, "")
      .replace(/da pasta/gi, "")
      .replace(/em/gi, "")
      .replace(/de/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    // Expressões regulares para encontrar padrões de caminho de diretório
    const dirPathPatterns = [
      // Padrão para "diretório X" ou "pasta X" com artigos
      /(?:o\s+)?(?:diretório|diretorio|pasta|directory|dir|folder)(?:\s+d[aoe])?(?:\s+a)?(?:\s+o)?\s+([a-zA-Z0-9_\-.\/]+)/i,

      // Padrão para "listar X"
      /(?:listar|list|ls|exibir|mostrar|ver)\s+([a-zA-Z0-9_\-.\/]+)/i,

      // Padrão para "o que tem em X" ou "o que existe em X"
      /(?:o\s+que\s+(?:tem|existe|há)\s+(?:em|no|na|nos|nas)\s+)([a-zA-Z0-9_\-.\/]+)/i,

      // Padrão para qualquer coisa que pareça um caminho de diretório
      /\b((?:\.{0,2}\/)?[a-zA-Z0-9_\-]+(?:\/[a-zA-Z0-9_\-]+)+)\b/,

      // Padrão para diretórios simples
      /\b(src|dist|public|app|test|tests|docs|config|scripts|components|pages|utils|lib|node_modules)\b/i,
    ];

    for (const pattern of dirPathPatterns) {
      const match = cleaned.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    // Verificar por termos específicos no final da mensagem
    const terms = cleaned.split(/\s+/);
    const lastTerm = terms[terms.length - 1];

    if (lastTerm && !lastTerm.includes("arquivo") && !lastTerm.includes("diretório")) {
      // Verificar se o último termo parece um caminho
      if (lastTerm.includes("/") || lastTerm === "src" || lastTerm === "." || lastTerm === "..") {
        return lastTerm;
      }
    }

    return null;
  }

  /**
   * Obtém as definições de funções para a API da OpenAI
   */
  private getFunctions() {
    return [
      {
        name: "extract_intent",
        description: "Extrai a intenção do usuário a partir da mensagem",
        parameters: {
          type: "object",
          properties: {
            intent_type: {
              type: "string",
              enum: ["task", "github", "file", "code", "chat"],
              description: "O tipo de intenção identificada na mensagem do usuário",
            },
            action: {
              type: "string",
              description: "A ação específica que o usuário deseja realizar",
            },
            parameters: {
              type: "object",
              description: "Parâmetros extraídos da mensagem que são relevantes para a ação",
              additionalProperties: true,
            },
          },
          required: ["intent_type", "action"],
        },
      },
    ];
  }
}
