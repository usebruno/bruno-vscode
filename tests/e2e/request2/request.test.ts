import { runSuites } from '../e2e-helper';

import * as saveDraftOnPrompt from './suites/save-draft-on-prompt';

runSuites('request lifecycle', [
  saveDraftOnPrompt,
]);
