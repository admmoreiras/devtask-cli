import { exec } from "child_process";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Executa código JavaScript/TypeScript
 * @param code Código a ser executado
 * @returns Resultado da execução
 */
export async function executeCode(code: string): Promise<string> {
  // Criar diretório temporário para execução do código
  const tmpDir = path.join(os.tmpdir(), `devtask-code-${Date.now()}`);
  await fs.ensureDir(tmpDir);

  try {
    // Verificar se é TypeScript ou JavaScript
    const isTypeScript =
      code.includes("interface ") ||
      code.includes(": string") ||
      code.includes(": number") ||
      code.includes(": boolean") ||
      code.includes(": any");

    const fileExt = isTypeScript ? ".ts" : ".js";
    const tmpFile = path.join(tmpDir, `code${fileExt}`);

    // Adicionar tratamento de erros e log ao código
    let wrappedCode: string;

    if (isTypeScript) {
      // Para TypeScript, precisamos de um código que vai funcionar com tsx
      wrappedCode = `
try {
${code}
} catch (error) {
  console.error("Erro na execução:", error);
}
`;
    } else {
      // Para JavaScript, podemos adicionar tratamento de erros simples
      wrappedCode = `
try {
${code}
} catch (error) {
  console.error("Erro na execução:", error);
}
`;
    }

    // Escrever código no arquivo temporário
    await fs.writeFile(tmpFile, wrappedCode, "utf8");

    // Executar o código
    let result: string;

    if (isTypeScript) {
      // Usar tsx para executar TypeScript diretamente
      const { stdout, stderr } = await execAsync(`npx tsx "${tmpFile}"`);
      result = stdout || stderr;
    } else {
      // Usar Node.js para JavaScript
      const { stdout, stderr } = await execAsync(`node "${tmpFile}"`);
      result = stdout || stderr;
    }

    return result;
  } catch (error: any) {
    return `Erro: ${error.message}`;
  } finally {
    // Limpar arquivos temporários
    try {
      await fs.remove(tmpDir);
    } catch (error) {
      console.error("Erro ao remover arquivos temporários:", error);
    }
  }
}
