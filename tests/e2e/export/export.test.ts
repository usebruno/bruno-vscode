import { runSuites } from '../e2e-helper';

import * as verifyPostmanExport from './suites/postman';

runSuites('export lifecycle', [
  verifyPostmanExport,
]);
