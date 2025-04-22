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
- Projeto
- Milestone/Sprint

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
- Pré-visualização antes de salvar
- Integração com o sistema existente de tarefas

### Chat interativo com IA

```bash
devtask chat
```

Inicia um prompt interativo para conversar com a IA para ajuda com desenvolvimento. Recursos:

- Interação em tempo real com o ChatGPT para dúvidas de programação
- Geração de código JavaScript/TypeScript sob demanda
- Execução direta de código gerado no terminal
- Histórico de conversas salvo localmente para continuar discussões anteriores
- **NOVO**: Exploração e análise de arquivos do projeto direto pelo chat

#### Comandos do explorador de arquivos no chat

Durante a sessão de chat, você pode usar os seguintes comandos para interagir com os arquivos do projeto:

- `!ls [caminho]` - Lista arquivos e diretórios no caminho especificado
- `!cat [arquivo]` - Mostra o conteúdo de um arquivo
- `!tree [caminho]` - Mostra a estrutura de diretórios em forma de árvore
- `!help` - Mostra a lista de comandos disponíveis

Além disso, você pode pedir ao assistente para analisar arquivos usando linguagem natural:

```
Você: analise o arquivo src/index.ts
Assistente: [exibe o conteúdo do arquivo e oferece análise]

Você: mostre o código em src/commands/create.ts
Assistente: [exibe o conteúdo do arquivo]
```

O sistema detecta automaticamente estas solicitações e exibe o conteúdo do arquivo para análise.

### Limpar histórico de conversas

```bash
devtask clear-history
```

Limpa o histórico de conversas salvo em `~/.devtask-cli/history.json`.

## Estrutura

Tasks são armazenadas localmente no diretório `.task/issues` em formato JSON com as seguintes informações:

```json
{
  "id": 1686868574312,
  "title": "Implementar login",
  "description": "Criar página de login com autenticação OAuth",
  "milestone": "Sprint 1",
  "project": "Frontend",
  "status": "todo",
  "synced": true,
  "github_issue_number": 42
}
```

Os templates são armazenados no diretório `.task/templates` em formato JSON com a seguinte estrutura:

```json
{
  "name": "default",
  "description": "Template padrão para geração de tarefas",
  "instructions": "Instruções detalhadas do projeto..."
}
```

As conversas com a IA são armazenadas em `~/.devtask-cli/history.json`.

Os arquivos de tarefas são nomeados seguindo o padrão:

- Para tasks não sincronizadas: `ID-titulo-da-task.json`
- Para tasks sincronizadas: `#NUMERO-ID-titulo-da-task.json`

Onde `NUMERO` é o número da issue no GitHub.

## Segurança no explorador de arquivos

O explorador de arquivos integrado inclui medidas de segurança para garantir que:

- Apenas arquivos dentro do diretório do projeto sejam acessíveis
- Arquivos e diretórios sensíveis (como `.env`, `.git`, `node_modules`) sejam bloqueados
- Informações sigilosas não sejam compartilhadas com a IA

## Desenvolvimento

```bash
# Executar em modo desenvolvimento
npm run dev -- [comando]

# Exemplo:
npm run dev -- create
npm run dev -- list
npm run dev -- sync
npm run dev -- init
npm run dev -- generate
npm run dev -- chat
```
