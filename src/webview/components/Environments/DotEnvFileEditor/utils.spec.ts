import { describe, it, expect } from 'vitest';
import { rawToVariables, variablesToRaw } from './utils';

const { dotenvToJson } = require('@usebruno/lang');

const asObject = (content: string) =>
  Object.fromEntries(rawToVariables(content).map((variable) => [variable.name, variable.value]));

describe('dotenv raw/table conversion', () => {
  const samples = [
    'HOST=localhost',
    'HOST = localhost',
    'export HOST=localhost',
    'TOKEN=abc # inline comment',
    '# leading comment\nHOST=localhost\n\nPORT=8081',
    'QUOTED="a#b"',
    'LITERAL=\'a#b\'',
    'BACKTICK=`a\'b"c`',
    'MULTILINE="line1\\nline2"',
    'PADDED=\'  spaced  \'',
    'EMPTY=',
    'DUP=one\nDUP=two'
  ];

  it('parses raw content exactly like the parser the extension writes with', () => {
    samples.forEach((content) => {
      expect(asObject(content)).toEqual(dotenvToJson(content));
    });
  });

  it('round-trips through the table view without changing values', () => {
    samples.forEach((content) => {
      expect(asObject(variablesToRaw(rawToVariables(content)))).toEqual(dotenvToJson(content));
    });
  });
});
