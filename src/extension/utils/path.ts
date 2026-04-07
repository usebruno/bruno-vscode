import * as path from 'path';
import * as fs from 'fs';

export function findCollectionRoot(filePath: string): string | null {
  let currentDir = path.dirname(filePath);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const brunoJsonPath = path.join(currentDir, 'bruno.json');
    const ocYmlPath = path.join(currentDir, 'opencollection.yml');

    if (fs.existsSync(brunoJsonPath) || fs.existsSync(ocYmlPath)) {
      return currentDir;
    }

    currentDir = path.dirname(currentDir);
  }

  return null;
}

export function isCollectionRoot(dirPath: string): boolean {
  const brunoJsonPath = path.join(dirPath, 'bruno.json');
  const ocYmlPath = path.join(dirPath, 'opencollection.yml');
  return fs.existsSync(brunoJsonPath) || fs.existsSync(ocYmlPath);
}

export function getCollectionName(collectionRoot: string): string {
  try {
    const brunoJsonPath = path.join(collectionRoot, 'bruno.json');
    if (fs.existsSync(brunoJsonPath)) {
      const config = JSON.parse(fs.readFileSync(brunoJsonPath, 'utf8'));
      return config.name || path.basename(collectionRoot);
    }

    const ocYmlPath = path.join(collectionRoot, 'opencollection.yml');
    if (fs.existsSync(ocYmlPath)) {
      const content = fs.readFileSync(ocYmlPath, 'utf8');
      // Simple regex to extract name from YAML info block
      const nameMatch = content.match(/info\s*:[\s\S]*?name\s*:\s*['"]?(.+?)['"]?\s*$/m);
      if (nameMatch) {
        return nameMatch[1].trim();
      }
    }
  } catch {
  }
  return path.basename(collectionRoot);
}
