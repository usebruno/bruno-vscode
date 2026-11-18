import { runSuites } from '../e2e-helper';

import * as verifyGitignore from './suites/gitignore';

runSuites('collection lifecycle', [
  verifyGitignore,
]);
