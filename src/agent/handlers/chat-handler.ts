// Manipulador para conversas gerais com o assistente
import OpenAI from "openai";
import { Intent } from "../intent-processor.js";
import { BaseHandler } from "./handler-interface.js";

/**
 * Manipulador para intenções de chat geral
 */
export class ChatHandler extends BaseHandler {
  // Cliente OpenAI
  private openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Ações suportadas por este manipulador
  private supportedActions = [
    "respond", // Responder a uma pergunta ou comentário
    "explain", // Explicar um conceito
    "help", // Fornecer ajuda sobre o sistema
  ];

  /**
   * Processa uma intenção de chat
   * @param intent Intenção a ser processada
   * @returns Resposta do manipulador
   */
  async handle(intent: Intent): Promise<string> {
    try {
      // Para chat, vamos sempre responder mesmo que a ação específica não esteja na lista
      // porque o chat é nosso fallback geral

      // Se a ação for help, fornecemos ajuda específica sobre o sistema
      if (intent.action === "help") {
        return this.getHelpMessage();
      }

      // Para outras ações de chat, usamos a API do OpenAI para gerar uma resposta contextual
      return await this.getChatResponse(intent);
    } catch (error: any) {
      return `Desculpe, ocorreu um erro ao processar sua mensagem: ${error.message}`;
    }
  }

  /**
   * Obtém uma resposta da API do OpenAI para chat geral
   */
  private async getChatResponse(intent: Intent): Promise<string> {
    try {
      // Obter mensagens recentes para contexto
      const messages = this.contextManager.getRecentMessages();

      // Estado atual que pode ser útil para o contexto
      const state = this.contextManager.getState();

      // Criar sistema de mensagem com informações contextuais
      const systemMessage = {
        role: "system" as const,
        content: `Você é um assistente de desenvolvimento que faz parte do DevTask CLI.
Você pode ajudar com gerenciamento de tarefas, integração com GitHub, exploração e modificação de arquivos, e geração de código.

Informações contextuais atuais:
- Diretório atual: ${state.currentDirectory || "."}
${state.currentFile ? `- Arquivo atual: ${state.currentFile}` : ""}
${state.currentTask ? `- Tarefa atual selecionada: ${state.currentTask}` : ""}
${state.pendingChanges ? "- Há alterações pendentes que precisam ser aplicadas ou canceladas." : ""}

Funções disponíveis:
1. Gerenciamento de tarefas: criar, listar, atualizar, excluir tarefas
2. Operações de arquivo: listar, ler, criar, modificar, excluir arquivos
3. Ajuda com código: analisar, explicar e sugerir melhorias
4. Integração com GitHub: sincronizar tarefas

Responda de forma clara, concisa e útil em português brasileiro. Se você não sabe a resposta para algo específico, sugira alternativas úteis.`,
      };

      // Usar a biblioteca oficial do OpenAI
      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL!,
        messages: [systemMessage, ...messages],
        temperature: 0.7,
        max_tokens: 1000,
      });

      return response.choices[0].message.content || "Não foi possível gerar uma resposta.";
    } catch (error: any) {
      console.error("Erro ao obter resposta do ChatGPT:", error);
      return "Desculpe, estou tendo dificuldades para processar essa solicitação no momento. Você pode tentar novamente ou reformular sua pergunta?";
    }
  }

  /**
   * Retorna uma mensagem de ajuda sobre o sistema
   */
  private getHelpMessage(): string {
    return `# Ajuda do DevTask Agent

O DevTask Agent é um assistente interativo em linguagem natural para o DevTask CLI. Ele permite que você execute comandos e obtenha ajuda usando linguagem natural, sem precisar memorizar comandos específicos.

## O que você pode fazer:

### Gerenciamento de Tarefas
- Criar tarefas: "Crie uma nova tarefa para implementar login de usuários"
- Listar tarefas: "Mostre minhas tarefas pendentes"
- Atualizar tarefas: "Atualize a tarefa 123 para status 'em andamento'"
- Selecionar uma tarefa: "Selecione a tarefa 123"

### Exploração de Arquivos
- Listar arquivos: "Mostre os arquivos na pasta src"
- Ler arquivos: "Mostre o conteúdo do arquivo package.json"
- Ver estrutura: "Mostre a estrutura de diretórios do projeto"

### Manipulação de Arquivos
- Criar arquivos: "Crie um novo arquivo chamado util.ts com funções para formatação de data"
- Modificar arquivos: "Modifique o arquivo index.ts para adicionar tratamento de erros"
- Excluir arquivos: "Delete o arquivo temp.log"
- Gerenciar alterações: "Mostre as alterações pendentes", "Aplique as alterações", "Cancele as alterações"

### Desenvolvimento
- Obter ajuda com código: "Como posso implementar autenticação JWT neste projeto?"
- Gerar código: "Crie uma função para validar e-mails"
- Analisar código: "Analise este trecho de código e sugira melhorias"

### Integração com GitHub
- "Como sincronizo minhas tarefas com o GitHub?"
- "Quais projetos estão disponíveis no GitHub?"

### Outras Funcionalidades
- Você pode pedir explicações sobre qualquer aspecto do sistema
- Fazer perguntas gerais sobre desenvolvimento
- Obter recomendações e boas práticas

## Dicas:
- Seja específico em suas solicitações
- Você pode se referir a arquivos, tarefas e diretórios pelo nome
- Para operações complexas, o agente pode sugerir usar comandos CLI diretamente

Digite "sair" para encerrar o agente interativo.`;
  }
}
