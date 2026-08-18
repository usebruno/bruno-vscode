import { jsonToDotenv } from '@usebruno/common/utils';
import type { DotEnvVariable } from '@bruno-types';
import { uuid } from 'utils/common';

/**
 * Mirrors dotenv's own LINE regex and unquoting, the parser @usebruno/lang runs on the
 * extension side. Reimplemented here because dotenv's entry point is node-only, and the two
 * must agree or a raw edit changes values on the way back to the table view.
 */
const DOTENV_LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;

export const variablesToRaw = (variables: DotEnvVariable[]): string => jsonToDotenv(variables);

export const rawToVariables = (rawContent: string): DotEnvVariable[] => {
  const variables: DotEnvVariable[] = [];
  const lines = (rawContent || '').replace(/\r\n?/mg, '\n');
  const lineMatcher = new RegExp(DOTENV_LINE.source, DOTENV_LINE.flags);

  let match = lineMatcher.exec(lines);
  while (match !== null) {
    let value = (match[2] || '').trim();
    const quote = value[0];

    value = value.replace(/^(['"`])([\s\S]*)\1$/mg, '$2');
    if (quote === '"') {
      value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
    }

    variables.push({ uid: uuid(), name: match[1], value, enabled: true, secret: false });
    match = lineMatcher.exec(lines);
  }

  return variables;
};
