import type { ScriptErrorContext } from './scripts';

export const SCRIPT_ERROR_PHASES = [
  { phase: 'preRequest', scriptType: 'pre-request' },
  { phase: 'postResponse', scriptType: 'post-response' },
  { phase: 'test', scriptType: 'test' }
] as const;

export type ScriptErrorPhase = (typeof SCRIPT_ERROR_PHASES)[number]['phase'];

export type ScriptType = (typeof SCRIPT_ERROR_PHASES)[number]['scriptType'];

export const scriptErrorMessageField = (phase: ScriptErrorPhase): string => `${phase}ScriptErrorMessage`;

export const scriptErrorContextField = (phase: ScriptErrorPhase): string => `${phase}ScriptErrorContext`;

export const SCRIPT_ERROR_FIELDS = SCRIPT_ERROR_PHASES.flatMap(({ phase }) => [
  scriptErrorMessageField(phase),
  scriptErrorContextField(phase)
]);

export const getScriptError = (
  item: Record<string, unknown> | null | undefined,
  phase: ScriptErrorPhase
): { message?: string; context?: ScriptErrorContext } => ({
  message: item?.[scriptErrorMessageField(phase)] as string | undefined,
  context: item?.[scriptErrorContextField(phase)] as ScriptErrorContext | undefined
});

export const hasScriptError = (item: Record<string, unknown> | null | undefined): boolean =>
  SCRIPT_ERROR_PHASES.some(({ phase }) => Boolean(item?.[scriptErrorMessageField(phase)]));

export const isScriptSourcedError =(item: Record<string, unknown> | null | undefined): boolean =>
  item?.errorSource === 'script';
