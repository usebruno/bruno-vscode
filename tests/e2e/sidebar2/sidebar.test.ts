import { runSuites } from '../e2e-helper';

import * as reorder from './suites/reorder';

// These suites run in order in one VS Code launch. To add a case, create a suite in ./suites and list it here.
runSuites('sidebar lifecycle', [
  reorder,
]);
