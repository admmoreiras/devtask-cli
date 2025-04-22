import chalk from "chalk";
import fs from "fs-extra";
import path from "path";

// Interface para tipar corretamente os itens de arquivo/diretório
interface FileSystemItem {
  name: string;
  path: string;
  type: string;
  size: number;
  isDirectory: boolean;
  children: FileSystemItem[];
}

/**
 * Lista arquivos e diretórios em um caminho especificado
 * @param dirPath Caminho do diretório a ser listado (relativo à raiz do projeto)
 * @param recursive Se true, lista recursivamente todos os subdiretórios
 * @returns Array de objetos com informações sobre arquivos e diretórios
 */
export async function listDirectory(dirPath: string = ".", recursive: boolean = false): Promise<FileSystemItem[]> {
  try {
    // Normalizar o caminho
    const normalizedPath = path.normalize(dirPath);
    const fullPath = path.isAbsolute(normalizedPath) ? normalizedPath : path.join(process.cwd(), normalizedPath);

    // Verificar se o diretório existe
    if (!(await fs.pathExists(fullPath))) {
      throw new Error(`Diretório não encontrado: ${normalizedPath}`);
    }

    // Ler o conteúdo do diretório
    const items = await fs.readdir(fullPath);

    // Mapear itens para objetos com informações
    const results = await Promise.all(
      items.map(async (item) => {
        const itemPath = path.join(fullPath, item);
        const stats = await fs.stat(itemPath);
        const relativePath = path.relative(process.cwd(), itemPath);

        const isDirectory = stats.isDirectory();

        const result: FileSystemItem = {
          name: item,
          path: relativePath.replace(/\\/g, "/"), // Normalizar para barras forward
          type: isDirectory ? "directory" : "file",
          size: stats.size,
          isDirectory,
          children: [],
        };

        // Se for diretório e a opção recursive estiver habilitada
        if (isDirectory && recursive) {
          result.children = await listDirectory(relativePath, true);
        }

        return result;
      })
    );

    // Ordenar: primeiro diretórios, depois arquivos (ambos em ordem alfabética)
    return results.sort((a, b) => {
      if (a.isDirectory === b.isDirectory) {
        return a.name.localeCompare(b.name);
      }
      return a.isDirectory ? -1 : 1;
    });
  } catch (error: any) {
    console.error(chalk.red(`Erro ao listar diretório: ${error.message}`));
    return [];
  }
}

/**
 * Lê o conteúdo de um arquivo
 * @param filePath Caminho do arquivo a ser lido (relativo à raiz do projeto)
 * @returns Conteúdo do arquivo como string
 */
export async function readFile(filePath: string): Promise<string | null> {
  try {
    // Normalizar o caminho
    const normalizedPath = path.normalize(filePath);
    const fullPath = path.isAbsolute(normalizedPath) ? normalizedPath : path.join(process.cwd(), normalizedPath);

    // Verificar se o arquivo existe
    if (!(await fs.pathExists(fullPath))) {
      throw new Error(`Arquivo não encontrado: ${normalizedPath}`);
    }

    // Verificar se é um arquivo (não um diretório)
    const stats = await fs.stat(fullPath);
    if (!stats.isFile()) {
      throw new Error(`O caminho especificado não é um arquivo: ${normalizedPath}`);
    }

    // Ler o conteúdo do arquivo
    const content = await fs.readFile(fullPath, "utf8");
    return content;
  } catch (error: any) {
    console.error(chalk.red(`Erro ao ler arquivo: ${error.message}`));
    return null;
  }
}

/**
 * Obtém a estrutura de arquivos como texto formatado
 * @param dirPath Caminho do diretório raiz
 * @param depth Profundidade máxima (quantos níveis mostrar)
 * @returns Estrutura de arquivos formatada como string
 */
export async function getFileStructure(dirPath: string = ".", depth: number = 3): Promise<string> {
  try {
    const items = await listDirectory(dirPath, true);

    function formatStructure(items: FileSystemItem[], prefix: string = "", level: number = 0): string {
      if (level >= depth) {
        return prefix ? `${prefix}...\n` : "";
      }

      return items
        .map((item, index, array) => {
          const isLast = index === array.length - 1;
          const connector = isLast ? "└── " : "├── ";
          const childPrefix = isLast ? "    " : "│   ";

          let result = `${prefix}${connector}${item.name}\n`;

          if (item.isDirectory && item.children.length > 0) {
            result += formatStructure(item.children, `${prefix}${childPrefix}`, level + 1);
          }

          return result;
        })
        .join("");
    }

    return formatStructure(items);
  } catch (error: any) {
    return `Erro ao obter estrutura de arquivos: ${error.message}`;
  }
}

/**
 * Verifica se um caminho específico é seguro para acessar
 * Impede acesso a diretórios fora do projeto ou a arquivos sensíveis
 * @param filePath Caminho a ser verificado
 * @returns true se o caminho for seguro, false caso contrário
 */
export function isPathSafe(filePath: string): boolean {
  // Normalizar o caminho
  const normalizedPath = path.normalize(filePath);
  const fullPath = path.isAbsolute(normalizedPath) ? normalizedPath : path.join(process.cwd(), normalizedPath);

  // Garantir que o caminho esteja dentro do diretório do projeto
  const projectRoot = process.cwd();
  if (!fullPath.startsWith(projectRoot)) {
    return false;
  }

  // Lista de arquivos e diretórios sensíveis que não devem ser acessados
  const sensitivePatterns = [
    ".env",
    ".git",
    "node_modules",
    "package-lock.json",
    ".npmrc",
    ".DS_Store",
    "id_rsa",
    ".ssh",
    "config.json",
    "secrets",
  ];

  // Verificar contra cada padrão
  for (const pattern of sensitivePatterns) {
    if (
      normalizedPath.includes(`/${pattern}`) ||
      normalizedPath.includes(`\\${pattern}`) ||
      normalizedPath === pattern
    ) {
      return false;
    }
  }

  return true;
}
