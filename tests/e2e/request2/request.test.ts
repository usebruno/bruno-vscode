import { runSuites } from '../e2e-helper';

import * as openInTextEditor from './suites/open-in-text-editor';

runSuites('request lifecycle', [
  openInTextEditor,
]);
