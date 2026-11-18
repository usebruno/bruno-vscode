import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { expect, type Page } from '@playwright/test';
import type { Workspace } from '../../e2e-helper';

export const desc = 'Creating a collection adds a .gitignore with the default entries to its root folder';

const COLLECTION = `gitignore-collection-${Date.now()}`;

const DEFAULT_GITIGNORE = [
  '# Secrets',
  '.env*',
  '',
  '# Dependencies',
  'node_modules',
  '',
  '# OS files',
  '.DS_Store',
  'Thumbs.db',
].join('\n');

export const workspace: Workspace = {
  collections: [
    { name: COLLECTION, format: 'yml' },
  ],
};

export async function run(_page: Page) {
  const gitignorePath = fs.readdirSync(os.tmpdir())
    .map((entry) => path.join(os.tmpdir(), entry, COLLECTION, '.gitignore'))
    .find((file) => fs.existsSync(file));

  expect(gitignorePath, `.gitignore should be created in ${COLLECTION}`).toBeDefined();
  expect(fs.readFileSync(gitignorePath!, 'utf8')).toBe(DEFAULT_GITIGNORE);
}
