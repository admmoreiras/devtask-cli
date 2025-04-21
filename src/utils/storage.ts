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
