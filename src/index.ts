#!/usr/bin/env node
import { Command } from "commander";
import { startAgent } from "./agent/index.js"; // Importar o novo agente interativo
import { startChat } from "./commands/chat.js";
import { createTask } from "./commands/create.js";
import { generateTasks } from "./commands/generate.js";
import { showGitHubInfo } from "./commands/info.js";
import { initTemplate } from "./commands/init.js";
import { listTasks } from "./commands/list.js";
import { syncTasks } from "./commands/sync.js";
import { updateTemplate } from "./commands/update-template.js";
import { clearHistory } from "./utils/history.js";

const program = new Command();

program.name("devtask").description("CLI de gestão de tarefas local com IA").version("0.1.0");

program.command("create").description("Criar nova task").action(createTask);
program.command("list").description("Listar todas as tasks").action(listTasks);
program.command("sync").description("Sincronizar tasks com GitHub").action(syncTasks);
program.command("info").description("Mostrar informações do GitHub (milestones e projetos)").action(showGitHubInfo);
program.command("init").description("Criar ou editar template para geração de tasks").action(initTemplate);
program
  .command("update-template")
  .description("Atualizar um template com instruções do arquivo MD")
  .argument("[name]", "Nome do template (default se omitido)")
  .action(updateTemplate);
program.command("generate").description("Gerar tasks a partir do template usando IA").action(generateTasks);

// Comando para chat interativo com IA
program
  .command("chat")
  .description("Iniciar chat interativo com IA para consultas e geração de código")
  .action(startChat);

// Comando para limpar histórico de conversas
program.command("clear-history").description("Limpar histórico de conversas do chat").action(clearHistory);

// Novo comando para o agente interativo em linguagem natural
program.command("agent").description("Iniciar agente interativo em linguagem natural").action(startAgent);

program.parse();
