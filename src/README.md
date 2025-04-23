# DevTask CLI

CLI para gerenciamento de tarefas de desenvolvimento com integração ao GitHub, geração automática de tarefas com IA e chat interativo para suporte ao desenvolvimento.

## Instalação

```bash
# Clonar o repositório
git clone https://github.com/seu-usuario/devtask-cli.git
cd devtask-cli

# Instalar dependências
npm install

# Compilar
npm run build

# Instalar globalmente (desenvolvimento)
npm link
```

## Configuração

Para a integração com GitHub e OpenAI, crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```
# GitHub Integration
GITHUB_TOKEN=seu_token_aqui
GITHUB_OWNER=seu_usuario_ou_organizacao
GITHUB_REPO=nome_do_repositorio

# OpenAI Integration
OPENAI_API_KEY=sua_api_key_aqui

# Debug Mode (opcional)
DEBUG_INTENT=true
```

Para criar um token do GitHub, acesse:

1. GitHub > Settings > Developer Settings > Personal Access Tokens
2. **IMPORTANTE**: Use "Generate new token (classic)" e NÃO "Fine-grained tokens"
3. Selecione os seguintes escopos:
   - `repo` (todas permissões)
   - `project` (necessário para integração com GitHub Projects)

Para obter uma chave da API da OpenAI, acesse:

1. [OpenAI Platform](https://platform.openai.com/)
2. Vá para "API Keys" e crie uma nova chave
3. Copie a chave e adicione ao seu arquivo `.env`

> **Nota**: A API do GitHub para projetos tem limitações com tokens refinados (fine-grained).
> Para total compatibilidade, especialmente com projetos, use tokens clássicos.

## Comandos
