interface ScannableBody {
  mode?: string | null;
  json?: string | null;
  graphql?: { query?: string | null; variables?: string | null } | null;
  [key: string]: unknown;
}

interface EnabledRow {
  enabled?: boolean;
}

interface FileRow {
  filePath?: string | null;
  selected?: boolean;
}

const STRING_LITERAL = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/.source;
const JSON_COMMENT = new RegExp(`(${STRING_LITERAL})|//[^\\n]*|/\\*[\\s\\S]*?\\*/`, 'g');
const GRAPHQL_COMMENT = new RegExp(`(${STRING_LITERAL})|#[^\\n]*`, 'g');

// Unterminated comments and quotes match nothing, so ambiguous text is kept and over-prompts
// rather than losing a live token.
const stripComments = (text: string, pattern: RegExp): string =>
  text.replace(pattern, (_match, stringLiteral) => stringLiteral ?? '');

const enabledRows = (rows: unknown): unknown[] =>
  Array.isArray(rows) ? rows.filter((row: EnabledRow) => row?.enabled !== false) : [];

// Kept in step with getSelectedFileBodyEntry in the extension host, which the webview cannot import.
const selectedFile = (files: unknown): unknown[] => {
  if (!Array.isArray(files)) {
    return [];
  }
  const candidates = files.filter((file: FileRow) => file?.filePath?.trim());
  const entry = candidates.find((file: FileRow) => file?.selected) ?? candidates[0];
  return entry ? [entry] : [];
};

export const getPromptScannableParams = enabledRows;

export const getPromptScannableBody = (body?: unknown): unknown => {
  const scannable = body as ScannableBody | null | undefined;
  if (!scannable?.mode) {
    return undefined;
  }

  switch (scannable.mode) {
    case 'json':
      return stripComments(scannable.json ?? '', JSON_COMMENT);
    case 'graphql':
      return {
        query: stripComments(scannable.graphql?.query ?? '', GRAPHQL_COMMENT),
        variables: stripComments(scannable.graphql?.variables ?? '', JSON_COMMENT)
      };
    case 'formUrlEncoded':
      return enabledRows(scannable.formUrlEncoded);
    case 'multipartForm':
      return enabledRows(scannable.multipartForm);
    case 'file':
      return selectedFile(scannable.file);
    default:
      return scannable[scannable.mode];
  }
};
