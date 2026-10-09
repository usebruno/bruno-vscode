/**
 * Runs once after the whole Playwright run.
 */
import { stopKeycloak } from './auth/oauth2/keycloak';

export default async function globalTeardown(): Promise<void> {
  await stopKeycloak();
}
