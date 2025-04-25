#!/usr/bin/env node

import chalk from "chalk";
import dotenv from "dotenv";
import { Octokit } from "octokit";

// Carregar variáveis de ambiente
dotenv.config();

console.log(chalk.blue("🔍 Verificando configuração GitHub..."));

// Verificar variáveis de ambiente
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const GITHUB_OWNER = process.env.GITHUB_OWNER || "";
const GITHUB_REPO = process.env.GITHUB_REPO || "";

// Tabela para exibir resultados
console.log("\n---------------------------------------");
console.log("| Variável      | Status             |");
console.log("|---------------|-------------------- |");
console.log(
  `| GITHUB_TOKEN  | ${GITHUB_TOKEN ? chalk.green("✅ Configurado") : chalk.red("❌ Não encontrado")} ${
    GITHUB_TOKEN ? `(${GITHUB_TOKEN.slice(0, 3)}...${GITHUB_TOKEN.slice(-3)})` : ""
  } |`
);
console.log(
  `| GITHUB_OWNER  | ${GITHUB_OWNER ? chalk.green("✅ Configurado") : chalk.red("❌ Não encontrado")} ${
    GITHUB_OWNER || ""
  } |`
);
console.log(
  `| GITHUB_REPO   | ${GITHUB_REPO ? chalk.green("✅ Configurado") : chalk.red("❌ Não encontrado")} ${
    GITHUB_REPO || ""
  } |`
);
console.log("---------------------------------------\n");

// Verificar token apenas se estiver configurado
if (!GITHUB_TOKEN) {
  console.log(chalk.red("❌ Token não configurado. Configure o token no arquivo .env"));
  console.log("Exemplo:");
  console.log("GITHUB_TOKEN=ghp_seu_token_aqui");
  process.exit(1);
}

// Verificar owner e repo
if (!GITHUB_OWNER || !GITHUB_REPO) {
  console.log(chalk.red("❌ GITHUB_OWNER ou GITHUB_REPO não configurados. Configure no arquivo .env"));
  console.log("Exemplo:");
  console.log("GITHUB_OWNER=seu_usuario_ou_organizacao");
  console.log("GITHUB_REPO=nome_do_repositorio");
  process.exit(1);
}

// Inicializar Octokit
const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

// Função principal
async function checkConfig() {
  try {
    // Verificar token
    console.log(chalk.blue("🔒 Verificando permissões do token..."));

    const { data: user } = await octokit.rest.users.getAuthenticated();
    console.log(chalk.green(`✅ Token válido! Autenticado como: ${user.login}`));

    // Verificar tipo de conta
    console.log(chalk.blue(`\n👤 Verificando tipo de conta para ${GITHUB_OWNER}...`));

    try {
      const { data: owner } = await octokit.rest.users.getByUsername({
        username: GITHUB_OWNER,
      });
      console.log(chalk.green(`✅ ${GITHUB_OWNER} é uma conta de usuário`));
    } catch (error) {
      try {
        const { data: org } = await octokit.rest.orgs.get({
          org: GITHUB_OWNER,
        });
        console.log(chalk.green(`✅ ${GITHUB_OWNER} é uma organização`));
      } catch (orgError) {
        console.log(chalk.red(`❌ ${GITHUB_OWNER} não é um usuário ou organização válido!`));
        process.exit(1);
      }
    }

    // Verificar repositório
    console.log(chalk.blue(`\n📁 Verificando repositório ${GITHUB_OWNER}/${GITHUB_REPO}...`));

    try {
      const { data: repo } = await octokit.rest.repos.get({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
      });
      console.log(chalk.green(`✅ Repositório encontrado! (${repo.html_url})`));
    } catch (error) {
      console.log(chalk.red(`❌ Repositório não encontrado ou sem acesso!`));
      console.log("Verifique:");
      console.log("1. Se o repositório existe");
      console.log("2. Se você tem acesso a ele");
      console.log("3. Se o token tem as permissões necessárias");
      process.exit(1);
    }

    // Verificar permissões para projetos
    console.log(chalk.blue("\n📊 Verificando acesso a projetos..."));

    try {
      // Tentar buscar um projeto para testar o acesso
      // Como nem sempre há projetos, vamos tentar com GraphQL para verificar permissões
      const query = `
        query {
          viewer {
            login
          }
        }
      `;

      await octokit.graphql(query);
      console.log(chalk.green("✅ Acesso à API GraphQL está funcionando!"));

      // Verificar se o token tem os escopos corretos
      // Nota: Essa verificação é aproximada, pois o octokit não expõe facilmente os escopos
      console.log(chalk.blue("\n🛡️ Informações do token:"));

      let hasProjectAccess = false;

      try {
        // Tentar uma operação que requer escopo de projeto
        const projectQuery = `
          query {
            viewer {
              projectsV2(first: 1) {
                totalCount
              }
            }
          }
        `;

        const projectResponse = await octokit.graphql(projectQuery);
        hasProjectAccess = true;
        console.log(chalk.green("✅ Token tem acesso a Projetos V2!"));
      } catch (projectError) {
        console.log(chalk.red("❌ Token parece não ter permissões para Projetos V2!"));
        console.log("Recomendação: Use um Personal Access Token (Classic) com escopos:");
        console.log("- repo (acesso completo)");
        console.log("- project (acesso completo)");
        console.log("\nNOTA: Fine-grained tokens podem ter limitações com GraphQL e Projetos V2");
      }

      console.log(chalk.blue("\n🏁 Verificação concluída!"));

      if (hasProjectAccess) {
        console.log(chalk.green("✨ Sua configuração parece correta para usar os recursos de projetos!"));
      } else {
        console.log(
          chalk.yellow("⚠️ Sua configuração está parcialmente correta, mas pode haver problemas com projetos.")
        );
      }
    } catch (error) {
      console.log(chalk.red("❌ Erro ao verificar permissões de projetos:"));
      console.log(error.message);
      process.exit(1);
    }
  } catch (error) {
    console.log(chalk.red("❌ Erro ao verificar configuração:"));
    console.log(error.message);
    process.exit(1);
  }
}

// Executar verificação
checkConfig();
