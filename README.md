# DevTask CLI

CLI para gerenciamento de tarefas de desenvolvimento com integração ao GitHub, geração automática de tarefas com IA e chat interativo para suporte ao desenvolvimento.

## Instalação

### Opção 1: Instalação via NPM

```bash
# Instalar globalmente via NPM
npm i devtask-cli

# Executar usando NPX
npx devtask [comando]

# Exemplo:
npx devtask list
npx devtask execute -n 1
```

### Opção 2: Instalação a partir do repositório

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

### Criar uma nova task

```bash
devtask create
```

A criação de tasks agora oferece:

- Seleção de projetos existentes a partir de uma lista
- Seleção de milestones/sprints a partir de uma lista
- Opção para criar novos projetos ou milestones caso não existam

### Listar todas as tasks

```bash
devtask list
```

Exibe uma tabela formatada com:

- Número de issue do GitHub (com prefixo #)
- Título da task
- Status
- Prioridade (alta, média, baixa)
- Dependências (IDs de tarefas que precisam ser concluídas antes)
- Projeto
- Milestone/Sprint

Opções disponíveis:

```bash
# Exibir em modo compacto para melhor visualização em telas pequenas
devtask list --compact
# ou
devtask list -c
```

O modo compacto mostra as informações essenciais em formato mais condensado, ideal para trabalhar em terminais menores ou com muitas tarefas.

### Sincronizar com GitHub

```bash
devtask sync
```

O comando `sync` oferece três opções:

- **Local → GitHub**: Envia suas tasks locais para o GitHub como issues
- **GitHub → Local**: Baixa issues do GitHub como tasks locais
- **Ambos**: Sincronização bidirecional

A sincronização agora oferece:

- Detecção inteligente de projetos (ignorando prefixo '@')
- Detecção case-insensitive de projetos e milestones
- Logs detalhados do processo de sincronização
- Arquivos de tasks renomeados com prefixo do número da issue (#)
- Atualização automática de status em projetos GitHub

### Próximas tarefas e execução

```bash
devtask next
```

Lista as próximas tarefas a serem executadas, organizadas por sprint:

- Organização automática de sprints por sequência numérica
- Exibição de progresso (tarefas concluídas vs. pendentes)
- Links clicáveis para as issues no GitHub

```bash
devtask execute [número-da-issue]
```

Permite selecionar uma tarefa para execução e alterar seu status:

- Iniciar trabalho (mudar para 'In Progress')
- Marcar como concluída (mudar para 'Done')
- Retornar para pendente (mudar para 'Todo')
- Adicionar comentários diretamente nas issues

### Informações do GitHub

```bash
devtask info
```

Lista milestones e projetos disponíveis no GitHub para facilitar a sincronização.

### Criar ou editar template

```bash
devtask init
```

Permite criar ou editar templates que serão usados para geração automática de tarefas. Recursos:

- Gestão de múltiplos templates
- Editor de texto integrado para instruções detalhadas
- Fácil atualização de templates existentes

### Gerar tarefas a partir de template

```bash
devtask generate
```

Gera tarefas automaticamente com base nas instruções do template selecionado usando IA. Recursos:

- Análise de instruções de projeto detalhadas
- Geração inteligente de tarefas organizadas
- Classificação automática de prioridades (alta, média, baixa) baseada na complexidade
- Identificação de dependências entre tarefas para gerenciar a ordem de desenvolvimento
- Pré-visualização antes de salvar
- Integração com o sistema existente de tarefas

A ferramenta identifica automaticamente:

- Quais tarefas são mais críticas (prioridade alta)
- Quais tarefas dependem da conclusão de outras
- Organização ideal em sprints/milestones

### Chat interativo com IA e File Agent

```bash
devtask chat
```

Inicia um prompt interativo para conversar com a IA para ajuda com desenvolvimento. Recursos:

- Interação em tempo real com o ChatGPT para dúvidas de programação
- Geração de código JavaScript/TypeScript sob demanda
- Execução direta de código gerado no terminal
- Histórico de conversas salvo localmente para continuar discussões anteriores
- Exploração e análise de arquivos do projeto direto pelo chat
- **NOVO**: Agente de arquivos que pode propor e aplicar mudanças em seu projeto

#### Comandos do File Agent

Durante a sessão de chat, além de explorar arquivos, você pode usar os comandos do File Agent para propor e aplicar mudanças no seu projeto:

- `!propose create [caminho]` - Propõe a criação de um novo arquivo
- `!propose modify [caminho]` - Propõe a modificação de um arquivo existente
- `!propose delete [caminho]` - Propõe a exclusão de um arquivo
- `!changes` - Mostra todas as alterações propostas pendentes
- `!apply` - Aplica todas as alterações propostas ao sistema de arquivos
- `!cancel` - Cancela todas as alterações propostas

Ao usar os comandos `!propose create` ou `!propose modify`, o sistema pedirá o conteúdo do arquivo. Digite o conteúdo e finalize com `!endcontent` em uma linha separada.

#### Exemplo de uso do File Agent

```
Você: Crie um arquivo de configuração básico para o ESLint

Assistente: [análise e sugere uma configuração]
Para criar esta configuração, você pode usar o seguinte comando:

!propose create .eslintrc.json
```

{
"env": {
"browser": true,
"es2021": true,
"node": true
},
"extends": [
"eslint:recommended",
"plugin:@typescript-eslint/recommended"
],
"parser": "@typescript-eslint/parser",
"parserOptions": {
"ecmaVersion": "latest",
"sourceType": "module"
},
"plugins": [
"@typescript-eslint"
],
"rules": {
"indent": ["error", 2],
"quotes": ["error", "double"],
"semi": ["error", "always"]
}
}

```

Você: !changes

Sistema:
📝 Alterações Pendentes:

✨ CRIAR: .eslintrc.json
----------------------------------------
{
  "env": {
    "browser": true,
    "es2021": true,
    "node": true
  },
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module"
  },
  "plugins": [
    "@typescript-eslint"
  ],
  "rules": {
    "indent": ["error", 2],
    "quotes": ["error", "double"],
    "semi": ["error", "always"]
  }
}
----------------------------------------

Para aplicar essas alterações, digite: !apply
Para descartar essas alterações, digite: !cancel

Você: !apply

Sistema: ✅ Alterações aplicadas com sucesso: 1 arquivos criados, 0 modificados, 0 excluídos.
```

#### Comandos do explorador de arquivos no chat

Você também pode continuar usando os comandos originais para navegar e explorar arquivos:

- `!ls [caminho]` - Lista arquivos e diretórios no caminho especificado
- `!cat [arquivo]` - Mostra o conteúdo de um arquivo
- `!tree [caminho]` - Mostra a estrutura de diretórios em forma de árvore
- `!help` - Mostra a lista de comandos disponíveis

### Limpar histórico de conversas

```bash
devtask clear-history
```

Limpa o histórico de conversas salvo em `~/.devtask-cli/history.json`.

### Agente interativo em linguagem natural

```bash
devtask agent
```

Inicia um agente interativo que permite interagir com o sistema usando linguagem natural. Diferente do comando `chat`, o agente processa suas solicitações e realiza ações automaticamente dentro do sistema:

- Conversação totalmente em linguagem natural, sem necessidade de comandos específicos
- Interpretação inteligente de solicitações mesmo em linguagem coloquial
- Suporte para todas as funcionalidades do sistema através de linguagem humana
- Detecção automática de intenções para tarefas, GitHub, arquivos e código
- **NOVO**: Melhor compreensão do contexto da conversa para referências a arquivos e diretórios

Para sair, basta digitar `sair` ou `exit`. Para ver a lista de capacidades, digite `ajuda` ou `help`.

#### Modo de Debug

O agente interativo possui um modo de debug que permite visualizar como ele está interpretando suas solicitações. Para usar:

- Ative globalmente: Adicione `DEBUG_INTENT=true` no seu arquivo `.env`
- Ative durante a sessão: Digite `debug on` durante a conversa
- Desative durante a sessão: Digite `debug off`

## Estrutura do Projeto

### Arquivos de Tasks

Tasks são armazenadas localmente no diretório `.task/issues` em formato JSON com as seguintes informações:

```json
{
  "id": 1686868574312,
  "title": "Implementar login",
  "description": "Criar página de login com autenticação OAuth",
  "milestone": "Sprint 1",
  "project": "Frontend",
  "status": "todo",
  "priority": "alta",
  "dependencies": [1686868574310, 1686868574311],
  "synced": true,
  "github_issue_number": 42,
  "lastSyncAt": "2023-07-01T12:00:00Z",
  "state": "open"
}
```

A estrutura de dependências permite gerenciar o fluxo de trabalho, garantindo que tarefas dependentes só sejam iniciadas após a conclusão das tarefas necessárias. A prioridade ajuda a identificar quais tarefas devem ser priorizadas com base na complexidade e importância para o projeto.

Os arquivos de tarefas são nomeados seguindo o padrão:

- Para tasks não sincronizadas: `ID-titulo-da-task.json`
- Para tasks sincronizadas: `#NUMERO-ID-titulo-da-task.json`

Onde `NUMERO` é o número da issue no GitHub.

### Arquitetura Modular

A CLI utiliza uma arquitetura modular para facilitar a manutenção:

- **src/utils/github/**

  - **index.js**: Ponto de entrada centralizado
  - **auth.js**: Autenticação e configuração
  - **issues.js**: Gestão de issues
  - **milestones.js**: Gestão de milestones
  - **projects.js**: Gestão de projetos
  - **tasks.js**: Conversão entre tasks locais e issues
  - **types.js**: Definições de tipos
  - **projects-helpers.js**: Funções auxiliares para projetos

- **src/commands/**: Implementação dos comandos da CLI
- **src/agent/**: Sistema de agente de linguagem natural
- **src/types/**: Definições de tipos adicionais

## Desenvolvimento

```bash
# Executar em modo desenvolvimento
npm run dev -- [comando]

# Exemplo:
npm run dev -- create
npm run dev -- list
npm run dev -- sync
npm run dev -- next
npm run dev -- execute
npm run dev -- init
npm run dev -- generate
npm run dev -- chat
npm run dev -- agent
```
