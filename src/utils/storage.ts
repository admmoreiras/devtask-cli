import fs from "fs-extra";
import path from "path";

export async function saveJson(filePath: string, data: any) {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJSON(filePath, data, { spaces: 2 });
}

export async function readAllFromDir(dirPath: string) {
  await fs.ensureDir(dirPath);
  const files = await fs.readdir(dirPath);
  return Promise.all(files.map((file: string) => fs.readJSON(path.join(dirPath, file))));
}

/**
 * Gera um novo ID sequencial para tasks
 * Os IDs começam em 1 e incrementam sequencialmente
 */
export async function getNextSequentialId(): Promise<number> {
  const issuesDir = path.join(".task", "issues");
  await fs.ensureDir(issuesDir);

  try {
    // Arquivo para armazenar o contador de IDs
    const counterPath = path.join(".task", "id_counter.json");

    // Se o arquivo não existir, criá-lo com contador inicial 0
    if (!(await fs.pathExists(counterPath))) {
      await fs.writeJSON(counterPath, { nextId: 1 }, { spaces: 2 });
      return 1;
    }

    // Ler o contador atual
    const counter = await fs.readJSON(counterPath);
    const nextId = counter.nextId || 1;

    // Incrementar e salvar
    counter.nextId = nextId + 1;
    await fs.writeJSON(counterPath, counter, { spaces: 2 });

    return nextId;
  } catch (error) {
    console.error("Erro ao gerar ID sequencial:", error);
    // Fallback para o método antigo em caso de erro
    return Date.now();
  }
}
