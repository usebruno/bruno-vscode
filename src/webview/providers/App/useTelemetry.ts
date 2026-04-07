/**
 * Telemetry hook - disabled for VS Code extension
 * PostHog telemetry is not used in the VS Code extension.
 */

const useTelemetry = (_props: { version?: string }) => {
  // No-op: Telemetry is disabled for VS Code extension
};

export default useTelemetry;
