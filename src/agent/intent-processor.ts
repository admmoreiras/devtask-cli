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
      // Preparar funções para a API da OpenAI
      const functions = this.getFunctions();

      // Preparar mensagens para a API da OpenAI com tipagem correta
      const messages = [
        {
          role: "system" as const,
          content:
            "Você é um assistente que analisa mensagens do usuário e identifica suas intenções. " +
            "Você deve extrair a intenção principal, a ação desejada e quaisquer parâmetros relevantes. " +
            "Considere o contexto da conversa ao interpretar mensagens ambíguas ou curtas.",
        },
        ...context.map((msg) => ({
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content,
        })),
        { role: "user" as const, content: message },
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

      return intent;
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
