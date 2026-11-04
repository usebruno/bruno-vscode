import { runSuites } from '../e2e-helper';

import * as verifyInheritance from './suites/inheritance';
import * as verifyAuthModes from './suites/auth-modes';
import * as verifyNtlm from './suites/ntlm';
import * as verifyOAuth2 from './suites/oauth2';

runSuites('auth lifecycle', [
  verifyInheritance,
  verifyAuthModes,
  verifyNtlm,
  verifyOAuth2,
]);
