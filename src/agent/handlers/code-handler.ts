// Manipulador para operações relacionadas a código
import dotenv from "dotenv";
import OpenAI from "openai";
import { isPathSafe, readFile } from "../../utils/file-explorer.js";
import { Intent } from "../intent-processor.js";
import { BaseHandler } from "./handler-interface.js";

dotenv.config();

// Cliente OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Manipulador para intenções relacionadas a código
 */
export class CodeHandler extends BaseHandler {
  // Ações suportadas por este manipulador
  private supportedActions = [
    "explain", // Explicar um trecho de código
    "generate", // Gerar código
    "execute", // Executar código
    "refactor", // Refatorar código
    "analyze", // Analisar código
  ];

  /**
   * Processa uma intenção relacionada a código
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
        case "explain":
          return await this.handleExplain(intent);

        case "generate":
          return await this.handleGenerate(intent);

        case "execute":
          return await this.handleExecute(intent);

        case "refactor":
          return await this.handleRefactor(intent);

        case "analyze":
          return await this.handleAnalyze(intent);

        default:
          return `Operação de código não implementada: ${intent.action}`;
      }
    } catch (error: any) {
      return `Erro ao processar operação de código: ${error.message}`;
    }
  }

  /**
   * Processa a ação de explicar código
   */
  private async handleExplain(intent: Intent): Promise<string> {
    let filePath = intent.parameters.path;
    let code = intent.parameters.code;

    // Se o código não foi fornecido diretamente e não temos um caminho,
    // verificar se temos um arquivo no contexto
    if (!code && !filePath) {
      const currentFile = this.contextManager.getCurrentFile();
      if (currentFile) {
        filePath = currentFile;
      } else {
        return "Por favor, especifique qual código você gostaria que eu explicasse. Você pode fornecer o código diretamente ou o caminho para um arquivo.";
      }
    }

    // Se temos um caminho, ler o arquivo
    if (filePath && !code) {
      if (!isPathSafe(filePath)) {
        return `⚠️ Acesso negado. O arquivo "${filePath}" é sensível ou está fora do projeto.`;
      }

      try {
        code = await readFile(filePath);
        if (code === null) {
          return `Não consegui encontrar ou ler o arquivo "${filePath}". Por favor, verifique se o caminho está correto.`;
        }
      } catch (error: any) {
        return `Não foi possível ler o arquivo "${filePath}": ${error.message}`;
      }
    }

    if (!code) {
      return "Não consegui identificar o código a ser explicado. Por favor, forneça o código ou especifique um arquivo válido.";
    }

    // Atualizar o estado com a operação atual
    this.contextManager.updateState({
      type: "code",
      action: "explain",
      parameters: { path: filePath },
      originalMessage: "",
    });

    // Preparar a explicação do código usando a API OpenAI
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content:
              "Você é um assistente especializado em explicar código. " +
              "Forneça explicações concisas, diretas e técnicas, focando na funcionalidade principal. " +
              "Mencione padrões de design relevantes, bibliotecas utilizadas e qualquer detalhe importante de implementação. " +
              "Seja objetivo e evite explicações desnecessariamente longas. Use linguagem técnica apropriada para desenvolvedores.",
          },
          {
            role: "user",
            content: `Explique o seguinte código de forma clara e concisa:\n\n\`\`\`\n${code}\n\`\`\``,
          },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      });

      return `📝 **Explicação do código${filePath ? ` em "${filePath}"` : ""}**:\n\n${
        response.choices[0].message.content
      }`;
    } catch (error: any) {
      console.error("Erro ao explicar código:", error);
      return `Ocorreu um erro ao explicar o código: ${error.message}`;
    }
  }

  /**
   * Processa a ação de gerar código
   */
  private async handleGenerate(intent: Intent): Promise<string> {
    const type = intent.parameters.type || "generic";
    const description = intent.parameters.description || intent.originalMessage;

    if (!description) {
      return "Por favor, forneça uma descrição do código que você gostaria que eu gerasse.";
    }

    // Atualizar o estado com a operação atual
    this.contextManager.updateState({
      type: "code",
      action: "generate",
      parameters: { type, description },
      originalMessage: "",
    });

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content:
              "Você é um assistente especializado em gerar código de alta qualidade. " +
              "Crie código que seja eficiente, bem estruturado e siga as melhores práticas. " +
              "Inclua comentários relevantes explicando partes complexas. " +
              "Se possível, forneça uma explicação breve sobre como o código funciona após gerá-lo.",
          },
          {
            role: "user",
            content: `Gere ${type !== "generic" ? `um ${type}` : "código"} que: ${description}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      });

      return `🧩 **Código Gerado**:\n\n${response.choices[0].message.content}`;
    } catch (error: any) {
      console.error("Erro ao gerar código:", error);
      return `Ocorreu um erro ao gerar o código: ${error.message}`;
    }
  }

  /**
   * Processo a ação de executar código (não implementado)
   */
  private async handleExecute(intent: Intent): Promise<string> {
    return "A execução direta de código não está disponível no momento. Considere usar a funcionalidade de modificação de arquivos e executar o código manualmente.";
  }

  /**
   * Processa a ação de refatorar código
   */
  private async handleRefactor(intent: Intent): Promise<string> {
    let filePath = intent.parameters.path;
    let code = intent.parameters.code;
    const instructions =
      intent.parameters.instructions || "Refatore o código para melhorar a legibilidade e eficiência.";

    // Se o código não foi fornecido diretamente e não temos um caminho,
    // verificar se temos um arquivo no contexto
    if (!code && !filePath) {
      const currentFile = this.contextManager.getCurrentFile();
      if (currentFile) {
        filePath = currentFile;
      } else {
        return "Por favor, especifique qual código você gostaria que eu refatorasse. Você pode fornecer o código diretamente ou o caminho para um arquivo.";
      }
    }

    // Se temos um caminho, ler o arquivo
    if (filePath && !code) {
      if (!isPathSafe(filePath)) {
        return `⚠️ Acesso negado. O arquivo "${filePath}" é sensível ou está fora do projeto.`;
      }

      try {
        code = await readFile(filePath);
        if (code === null) {
          return `Não consegui encontrar ou ler o arquivo "${filePath}". Por favor, verifique se o caminho está correto.`;
        }
      } catch (error: any) {
        return `Não foi possível ler o arquivo "${filePath}": ${error.message}`;
      }
    }

    if (!code) {
      return "Não consegui identificar o código a ser refatorado. Por favor, forneça o código ou especifique um arquivo válido.";
    }

    // Atualizar o estado com a operação atual
    this.contextManager.updateState({
      type: "code",
      action: "refactor",
      parameters: { path: filePath },
      originalMessage: "",
    });

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content:
              "Você é um assistente especializado em refatorar código. " +
              "Melhore a qualidade do código sem alterar sua funcionalidade. " +
              "Foque em melhorar a legibilidade, eliminar código duplicado, " +
              "aplicar padrões de design apropriados e otimizar performance quando possível.",
          },
          {
            role: "user",
            content: `Refatore o seguinte código com estas instruções: ${instructions}\n\n\`\`\`\n${code}\n\`\`\``,
          },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      });

      return `🔄 **Código Refatorado**:\n\n${response.choices[0].message.content}`;
    } catch (error: any) {
      console.error("Erro ao refatorar código:", error);
      return `Ocorreu um erro ao refatorar o código: ${error.message}`;
    }
  }

  /**
   * Processa a ação de analisar código
   */
  private async handleAnalyze(intent: Intent): Promise<string> {
    let filePath = intent.parameters.path;
    let code = intent.parameters.code;

    // Se o código não foi fornecido diretamente e não temos um caminho,
    // verificar se temos um arquivo no contexto
    if (!code && !filePath) {
      const currentFile = this.contextManager.getCurrentFile();
      if (currentFile) {
        filePath = currentFile;
      } else {
        return "Por favor, especifique qual código você gostaria que eu analisasse. Você pode fornecer o código diretamente ou o caminho para um arquivo.";
      }
    }

    // Se temos um caminho, ler o arquivo
    if (filePath && !code) {
      if (!isPathSafe(filePath)) {
        return `⚠️ Acesso negado. O arquivo "${filePath}" é sensível ou está fora do projeto.`;
      }

      try {
        code = await readFile(filePath);
        if (code === null) {
          return `Não consegui encontrar ou ler o arquivo "${filePath}". Por favor, verifique se o caminho está correto.`;
        }
      } catch (error: any) {
        return `Não foi possível ler o arquivo "${filePath}": ${error.message}`;
      }
    }

    if (!code) {
      return "Não consegui identificar o código a ser analisado. Por favor, forneça o código ou especifique um arquivo válido.";
    }

    // Atualizar o estado com a operação atual
    this.contextManager.updateState({
      type: "code",
      action: "analyze",
      parameters: { path: filePath },
      originalMessage: "",
    });

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content:
              "Você é um assistente especializado em analisar código. " +
              "Identifique possíveis problemas, bugs, vulnerabilidades de segurança " +
              "e padrões de código que podem ser melhorados. " +
              "Forneça uma análise técnica e objetiva, com recomendações práticas.",
          },
          {
            role: "user",
            content: `Analise o seguinte código e identifique potenciais problemas e melhorias:\n\n\`\`\`\n${code}\n\`\`\``,
          },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      });

      return `🔍 **Análise de Código${filePath ? ` em "${filePath}"` : ""}**:\n\n${
        response.choices[0].message.content
      }`;
    } catch (error: any) {
      console.error("Erro ao analisar código:", error);
      return `Ocorreu um erro ao analisar o código: ${error.message}`;
    }
  }
}
