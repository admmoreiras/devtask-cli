// Manipulador para operações relacionadas a código
import axios from "axios";
import { executeCode } from "../../utils/code-executor.js";
import { Intent } from "../intent-processor.js";
import { BaseHandler } from "./handler-interface.js";

// Interfaces para tipar a resposta da OpenAI
interface OpenAIMessage {
  role: string;
  content: string;
}

interface OpenAIChoice {
  message: OpenAIMessage;
  index: number;
  finish_reason: string;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Manipulador para intenções relacionadas a código
 */
export class CodeHandler extends BaseHandler {
  // Ações suportadas por este manipulador
  private supportedActions = [
    "generate", // Gerar código
    "execute", // Executar código
    "analyze", // Analisar código
    "explain", // Explicar código
    "optimize", // Otimizar código
    "debug", // Depurar código
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
        case "generate":
          return await this.handleGenerate(intent);

        case "execute":
          return await this.handleExecute(intent);

        case "analyze":
          return await this.handleAnalyze(intent);

        case "explain":
          return await this.handleExplain(intent);

        case "optimize":
          return await this.handleOptimize(intent);

        case "debug":
          return await this.handleDebug(intent);

        default:
          return `Operação de código não implementada: ${intent.action}`;
      }
    } catch (error: any) {
      return `Erro ao processar operação de código: ${error.message}`;
    }
  }

  /**
   * Processa a ação de gerar código
   */
  private async handleGenerate(intent: Intent): Promise<string> {
    const { language, description, requirements } = intent.parameters;

    if (!description) {
      return "Por favor, descreva o código que deseja gerar.";
    }

    try {
      // Criar uma solicitação para a API do OpenAI
      const prompt = `Gere código ${language || "JavaScript/TypeScript"} para: ${description}
${requirements ? `\nRequisitos adicionais: ${requirements}` : ""}`;

      // Obter mensagens recentes para contexto
      const messages = this.contextManager.getRecentMessages();

      // Enviar solicitação para a API do OpenAI
      const response = await axios.post<OpenAIResponse>(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content:
                "Você é um assistente especializado em gerar código de alta qualidade. Seu código deve ser limpo, bem documentado e seguir as melhores práticas.",
            },
            ...messages,
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
        }
      );

      // Verificar se a resposta contém o conteúdo esperado
      if (!response.data?.choices?.length || !response.data.choices[0]?.message?.content) {
        return "Não foi possível gerar o código. Resposta inesperada da API.";
      }

      const generatedCode = response.data.choices[0].message.content;

      // Retorna o código gerado
      return `Código gerado para: ${description}\n\n${generatedCode}\n\nVocê pode modificar este código conforme necessário ou pedir para executá-lo digitando "execute este código".`;
    } catch (error: any) {
      return `Erro ao gerar código: ${error.message}`;
    }
  }

  /**
   * Processa a ação de executar código
   */
  private async handleExecute(intent: Intent): Promise<string> {
    const { code } = intent.parameters;

    if (!code) {
      return "Por favor, forneça o código que deseja executar.";
    }

    try {
      // Extrair o código de um bloco de código se estiver presente
      const codeToExecute = this.extractCodeFromMarkdown(code);

      console.log("Executando código:\n");
      console.log(codeToExecute);

      // Executar o código
      const result = await executeCode(codeToExecute);

      return `Resultado da execução:\n\n\`\`\`\n${result}\n\`\`\``;
    } catch (error: any) {
      return `Erro ao executar código: ${error.message}`;
    }
  }

  /**
   * Processa a ação de analisar código
   */
  private async handleAnalyze(intent: Intent): Promise<string> {
    const { code } = intent.parameters;

    if (!code) {
      return "Por favor, forneça o código que deseja analisar.";
    }

    try {
      // Extrair o código de um bloco de código se estiver presente
      const codeToAnalyze = this.extractCodeFromMarkdown(code);

      // Criar uma solicitação para a API do OpenAI
      const prompt = `Analise o seguinte código e identifique possíveis problemas, melhorias e boas práticas:\n\n${codeToAnalyze}`;

      // Enviar solicitação para a API do OpenAI
      const response = await axios.post<OpenAIResponse>(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content:
                "Você é um revisor de código experiente. Analise o código fornecido e identifique problemas, potenciais bugs, oportunidades de melhoria e boas práticas que podem ser aplicadas.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
        }
      );

      // Verificar se a resposta contém o conteúdo esperado
      if (!response.data?.choices?.length || !response.data.choices[0]?.message?.content) {
        return "Não foi possível analisar o código. Resposta inesperada da API.";
      }

      const analysis = response.data.choices[0].message.content;

      // Retorna a análise
      return `Análise do código:\n\n${analysis}`;
    } catch (error: any) {
      return `Erro ao analisar código: ${error.message}`;
    }
  }

  /**
   * Processa a ação de explicar código
   */
  private async handleExplain(intent: Intent): Promise<string> {
    const { code } = intent.parameters;

    if (!code) {
      return "Por favor, forneça o código que deseja explicar.";
    }

    try {
      // Extrair o código de um bloco de código se estiver presente
      const codeToExplain = this.extractCodeFromMarkdown(code);

      // Criar uma solicitação para a API do OpenAI
      const prompt = `Explique o seguinte código de forma clara e detalhada:\n\n${codeToExplain}`;

      // Enviar solicitação para a API do OpenAI
      const response = await axios.post<OpenAIResponse>(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content:
                "Você é um professor de programação que explica código de forma clara e acessível. Explique o código fornecido linha por linha, destacando conceitos importantes e funcionalidades.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
        }
      );

      // Verificar se a resposta contém o conteúdo esperado
      if (!response.data?.choices?.length || !response.data.choices[0]?.message?.content) {
        return "Não foi possível explicar o código. Resposta inesperada da API.";
      }

      const explanation = response.data.choices[0].message.content;

      // Retorna a explicação
      return `Explicação do código:\n\n${explanation}`;
    } catch (error: any) {
      return `Erro ao explicar código: ${error.message}`;
    }
  }

  /**
   * Processa a ação de otimizar código
   */
  private async handleOptimize(intent: Intent): Promise<string> {
    const { code } = intent.parameters;

    if (!code) {
      return "Por favor, forneça o código que deseja otimizar.";
    }

    try {
      // Extrair o código de um bloco de código se estiver presente
      const codeToOptimize = this.extractCodeFromMarkdown(code);

      // Criar uma solicitação para a API do OpenAI
      const prompt = `Otimize o seguinte código para melhorar a performance, legibilidade e manutenção:\n\n${codeToOptimize}`;

      // Enviar solicitação para a API do OpenAI
      const response = await axios.post<OpenAIResponse>(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content:
                "Você é um especialista em otimização de código. Refatore o código fornecido para melhorar a performance, legibilidade e manutenção, explicando as melhorias feitas.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
        }
      );

      // Verificar se a resposta contém o conteúdo esperado
      if (!response.data?.choices?.length || !response.data.choices[0]?.message?.content) {
        return "Não foi possível otimizar o código. Resposta inesperada da API.";
      }

      const optimizedCode = response.data.choices[0].message.content;

      // Retorna o código otimizado
      return `Código otimizado:\n\n${optimizedCode}`;
    } catch (error: any) {
      return `Erro ao otimizar código: ${error.message}`;
    }
  }

  /**
   * Processa a ação de depurar código
   */
  private async handleDebug(intent: Intent): Promise<string> {
    const { code, error } = intent.parameters;

    if (!code) {
      return "Por favor, forneça o código que deseja depurar.";
    }

    try {
      // Extrair o código de um bloco de código se estiver presente
      const codeToDebug = this.extractCodeFromMarkdown(code);

      // Criar uma solicitação para a API do OpenAI
      const prompt = `Depure o seguinte código e corrija os problemas encontrados:
      
${codeToDebug}
      
${error ? `O erro relatado é: ${error}` : ""}`;

      // Enviar solicitação para a API do OpenAI
      const response = await axios.post<OpenAIResponse>(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content:
                "Você é um especialista em depuração de código. Identifique e corrija problemas no código fornecido, explicando o que estava errado e como foi corrigido.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
        }
      );

      // Verificar se a resposta contém o conteúdo esperado
      if (!response.data?.choices?.length || !response.data.choices[0]?.message?.content) {
        return "Não foi possível depurar o código. Resposta inesperada da API.";
      }

      const debugResult = response.data.choices[0].message.content;

      // Retorna o resultado da depuração
      return `Resultado da depuração:\n\n${debugResult}`;
    } catch (error: any) {
      return `Erro ao depurar código: ${error.message}`;
    }
  }

  /**
   * Extrai o código de um bloco de código markdown
   */
  private extractCodeFromMarkdown(code: string): string {
    // Verificar se o código está em um bloco de código markdown
    const codeBlockRegex = /```(?:javascript|typescript|js|ts)?\n([\s\S]*?)```/;
    const match = code.match(codeBlockRegex);

    if (match && match[1]) {
      return match[1];
    }

    return code;
  }
}
