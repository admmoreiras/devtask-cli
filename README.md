# DevTask CLI

CLI para gerenciamento de tarefas de desenvolvimento com integração ao GitHub.

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

Para a integração com GitHub, crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```
GITHUB_TOKEN=seu_token_aqui
GITHUB_OWNER=seu_usuario_ou_organizacao
GITHUB_REPO=nome_do_repositorio
```

Para criar um token do GitHub, acesse:

1. GitHub > Settings > Developer Settings > Personal Access Tokens
2. **IMPORTANTE**: Use "Generate new token (classic)" e NÃO "Fine-grained tokens"
3. Selecione os seguintes escopos:
   - `repo` (todas permissões)
   - `project` (necessário para integração com GitHub Projects)

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

Os arquivos são nomeados seguindo o padrão:

- Para tasks não sincronizadas: `ID-titulo-da-task.json`
- Para tasks sincronizadas: `#NUMERO-ID-titulo-da-task.json`

Onde `NUMERO` é o número da issue no GitHub.

## Desenvolvimento

```bash
# Executar em modo desenvolvimento
npm run dev -- [comando]

# Exemplo:
npm run dev -- create
npm run dev -- list
npm run dev -- sync
```
