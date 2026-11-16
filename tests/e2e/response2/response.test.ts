import { runSuites } from '../e2e-helper';

import * as verifyResponsePaneActions from './suites/response-actions';

runSuites('response lifecycle', [
  verifyResponsePaneActions,
]);
