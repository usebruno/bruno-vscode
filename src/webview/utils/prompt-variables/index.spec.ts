import { describe, it, expect } from 'vitest';
import { getPromptScannableBody, getPromptScannableParams } from './index';
import { extractPromptVariables } from '../../shims/bruno-common-utils';

const promptsIn = (body: any) => extractPromptVariables(getPromptScannableBody(body)).sort();

describe('getPromptScannableBody', () => {
  describe('json body', () => {
    it('ignores prompts on a commented out line', () => {
      const json = ['{', '  "title": "{{?Live}}",', '  // "draft": "{{?Commented}}"', '}'].join('\n');
      expect(promptsIn({ mode: 'json', json })).toEqual(['Live']);
    });

    it('ignores prompts inside a block comment', () => {
      const json = ['{', '  /*', '    "draft": "{{?Commented}}"', '  */', '  "title": "{{?Live}}"', '}'].join('\n');
      expect(promptsIn({ mode: 'json', json })).toEqual(['Live']);
    });

    it('keeps a prompt in a string that contains //', () => {
      const json = '{ "url": "https://example.com/{{?Path}}" }';
      expect(promptsIn({ mode: 'json', json })).toEqual(['Path']);
    });

    it('keeps a prompt after an escaped quote', () => {
      const json = '{ "quoted": "say \\"hi\\"", "title": "{{?Live}}" }';
      expect(promptsIn({ mode: 'json', json })).toEqual(['Live']);
    });

    it('keeps a prompt in a single quoted string that contains //', () => {
      const json = "{'url': 'https://example.com/{{?Path}}'}";
      expect(promptsIn({ mode: 'json', json })).toEqual(['Path']);
    });

    it('keeps prompts after an unterminated block comment rather than dropping them', () => {
      const json = ['{', '  "a": "x", /* never closed', '  "title": "{{?Live}}"', '}'].join('\n');
      expect(promptsIn({ mode: 'json', json })).toEqual(['Live']);
    });
  });

  describe('graphql body', () => {
    it('ignores prompts on a # commented line in the query', () => {
      const query = ['query {', '  user(id: "{{?Id}}") {', '    # name(alias: "{{?Commented}}")', '  }', '}'].join('\n');
      expect(promptsIn({ mode: 'graphql', graphql: { query, variables: '{}' } })).toEqual(['Id']);
    });

    it('ignores prompts commented out in the variables', () => {
      const variables = ['{', '  "id": "{{?Id}}"', '  // "old": "{{?Commented}}"', '}'].join('\n');
      expect(promptsIn({ mode: 'graphql', graphql: { query: 'query {}', variables } })).toEqual(['Id']);
    });
  });

  describe('disabled rows', () => {
    it('skips unchecked form url encoded fields', () => {
      const body = {
        mode: 'formUrlEncoded',
        formUrlEncoded: [
          { uid: '1', name: 'a', value: '{{?Live}}', enabled: true },
          { uid: '2', name: 'b', value: '{{?Unchecked}}', enabled: false }
        ]
      };
      expect(promptsIn(body)).toEqual(['Live']);
    });

    it('skips unchecked multipart fields', () => {
      const body = {
        mode: 'multipartForm',
        multipartForm: [
          { uid: '1', type: 'text', name: 'a', value: '{{?Live}}', enabled: true },
          { uid: '2', type: 'text', name: 'b', value: '{{?Unchecked}}', enabled: false }
        ]
      };
      expect(promptsIn(body)).toEqual(['Live']);
    });

    it('only scans the selected file body entry', () => {
      const body = {
        mode: 'file',
        file: [
          { uid: '1', filePath: '/tmp/{{?Unselected}}.json', selected: false },
          { uid: '2', filePath: '/tmp/{{?Selected}}.json', selected: true }
        ]
      };
      expect(promptsIn(body)).toEqual(['Selected']);
    });

    it('falls back to the first file entry when none is marked selected', () => {
      const body = { mode: 'file', file: [{ uid: '1', filePath: '/tmp/{{?First}}.json' }] };
      expect(promptsIn(body)).toEqual(['First']);
    });
  });

  it('only scans the active body mode', () => {
    const body = { mode: 'text', text: '{{?Live}}', json: '{ "old": "{{?Inactive}}" }' };
    expect(promptsIn(body)).toEqual(['Live']);
  });

  it('returns nothing for a body with no mode', () => {
    expect(getPromptScannableBody(undefined)).toBeUndefined();
    expect(getPromptScannableBody({ mode: 'none' } as any)).toBeUndefined();
  });
});

describe('getPromptScannableParams', () => {
  it('skips unchecked query params', () => {
    const params = [
      { uid: '1', name: 'a', value: '{{?Live}}', type: 'query', enabled: true },
      { uid: '2', name: 'b', value: '{{?Unchecked}}', type: 'query', enabled: false }
    ];
    expect(extractPromptVariables(getPromptScannableParams(params))).toEqual(['Live']);
  });

  it('keeps path params, which carry no enabled flag of their own', () => {
    const params = [{ uid: '1', name: 'id', value: '{{?PathId}}', type: 'path' }];
    expect(extractPromptVariables(getPromptScannableParams(params))).toEqual(['PathId']);
  });

  it('tolerates a missing params list', () => {
    expect(getPromptScannableParams(undefined)).toEqual([]);
  });
});
