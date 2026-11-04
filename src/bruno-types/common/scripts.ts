export interface Script {
  req?: string | null;
  res?: string | null;
}

export interface ScriptErrorContextLine {
  lineNumber: number;
  content: string;
  isError?: boolean;
}

export interface ScriptErrorContext {
  errorType?: string;
  filePath?: string;
  errorLine?: number;
  lines?: ScriptErrorContextLine[];
  stack?: string;
}

/** Maps a line in the combined script back to a line in the file it was written in. */
export interface ScriptMetadata {
  requestStartLine: number;
  requestEndLine: number;
  requestScriptContent?: string;
  segments?: ScriptSegment[];
}

export interface ScriptSegment {
  startLine: number;
  endLine: number;
  type: 'collection' | 'folder';
  filePath: string;
  displayPath: string;
  scriptContent?: string;
}
