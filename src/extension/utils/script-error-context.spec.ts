import { describe, test, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('vscode', () => ({}));

const { mergeScripts } = await import('./collection');
const { setUnsavedRoot, clearUnsavedRootForFile } = await import('../store/unsaved-roots');
const { ScriptRuntime, formatErrorWithContextV2 } = await import('@usebruno/js');

const COLLECTION_SCRIPT = 'const fromCollection = true;';
const REQUEST_SCRIPT = 'const a = 1;\nbru.setEnvVar("Bad Name", "x");\nconsole.log(a);';

const makeCollection = (collectionScript: string, pathname?: string) => ({
  pathname,
  root: { request: { script: { res: collectionScript, req: '' }, tests: '' } }
});

describe('mergeScripts records the request script segment', () => {
  test('offsets the request range past a collection-level script', () => {
    const request: any = { script: { req: '', res: REQUEST_SCRIPT }, tests: '' };
    mergeScripts(makeCollection(COLLECTION_SCRIPT) as never, request, [], 'sequential');

    // Collection segment wraps to 3 lines (1-3), blank separator on 4, request segment on 5-9.
    expect(request.script.resMetadata).toMatchObject({ requestStartLine: 5, requestEndLine: 9 });
    expect(request.script.resMetadata.requestScriptContent).toBe(REQUEST_SCRIPT);
  });

  test('starts at line 1 when only the request has a script', () => {
    const request: any = { script: { req: '', res: REQUEST_SCRIPT }, tests: '' };
    mergeScripts(makeCollection('') as never, request, [], 'sequential');

    expect(request.script.resMetadata).toMatchObject({ requestStartLine: 1, requestEndLine: 5 });
  });

  test('reports an empty range when the request has no script of its own', () => {
    const request: any = { script: { req: '', res: '' }, tests: '' };
    mergeScripts(makeCollection(COLLECTION_SCRIPT) as never, request, [], 'sequential');

    expect(request.script.resMetadata).toMatchObject({ requestStartLine: 0, requestEndLine: 0 });
  });

  test('puts the request segment first under sandwich flow', () => {
    const request: any = { script: { req: '', res: REQUEST_SCRIPT }, tests: '' };
    mergeScripts(makeCollection(COLLECTION_SCRIPT) as never, request, [], 'sandwich');

    expect(request.script.resMetadata).toMatchObject({ requestStartLine: 1, requestEndLine: 5 });
  });

  test('joins segments with \\n so line counts hold on every platform', () => {
    const request: any = { script: { req: '', res: REQUEST_SCRIPT }, tests: '' };
    mergeScripts(makeCollection(COLLECTION_SCRIPT) as never, request, [], 'sequential');

    expect(request.script.res).not.toContain('\r');
    expect(request.script.res.split('\n')).toHaveLength(9);
  });
});

describe('a failing script maps back to the line in the .bru file', () => {
  let collectionPath: string;
  let pathname: string;

  beforeAll(() => {
    collectionPath = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-script-error-'));
    pathname = path.join(collectionPath, 'Ping.bru');
    fs.writeFileSync(pathname, [
      'meta {', '  name: Ping', '  type: http', '  seq: 1', '}', '',
      'get {', '  url: http://localhost', '}', '',
      'script:post-response {',
      '  const a = 1;',
      '  bru.setEnvVar("Bad Name", "x");',
      '  console.log(a);',
      '}',
      ''
    ].join('\n'), 'utf8');
  });

  afterAll(() => {
    fs.rmSync(collectionPath, { recursive: true, force: true });
  });

  test('produces the snippet, error line and stack the response pane renders', async () => {
    const request: any = { pathname, url: 'http://localhost', method: 'GET', headers: {}, script: { req: '', res: REQUEST_SCRIPT }, tests: '' };
    mergeScripts(makeCollection(COLLECTION_SCRIPT) as never, request, [], 'sequential');

    const runtime = new ScriptRuntime({ runtime: 'nodevm' });

    let error: unknown = null;
    try {
      await runtime.runResponseScript(
        request.script.res,
        request,
        { status: 200, data: {}, headers: {} },
        {},
        {},
        collectionPath,
        () => {},
        {},
        { runtime: 'nodevm' }
      );
    } catch (e) {
      error = e;
    }

    expect((error as Error)?.message).toContain('contains invalid characters');

    const context = formatErrorWithContextV2(error, 'post-response', request.script.resMetadata, collectionPath);

    expect(context?.filePath).toBe('Ping.bru');
    expect(context?.errorLine).toBe(2);
    expect(context?.lines?.find((l) => l.isError)?.content).toContain('bru.setEnvVar("Bad Name", "x")');
    expect(context?.stack).toContain('Ping.bru');
  });
});

describe('an inherited script maps back to the file it was written in', () => {
  let collectionPath: string;
  let folderPath: string;

  const THROWING_SCRIPT = "const c = 1;\nthrow new Error('boom');";

  beforeAll(() => {
    collectionPath = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-script-segment-'));
    folderPath = path.join(collectionPath, 'sub');
    fs.mkdirSync(folderPath);

    fs.writeFileSync(path.join(collectionPath, 'bruno.json'),
      JSON.stringify({ version: '1', name: 'seg', type: 'collection' }), 'utf8');

    const scriptBlock = ['script:post-response {', '  const c = 1;', "  throw new Error('boom');", '}', ''];
    fs.writeFileSync(path.join(collectionPath, 'collection.bru'), scriptBlock.join('\n'), 'utf8');
    fs.writeFileSync(path.join(folderPath, 'folder.bru'),
      ['meta {', '  name: sub', '}', '', ...scriptBlock].join('\n'), 'utf8');
  });

  afterAll(() => {
    fs.rmSync(collectionPath, { recursive: true, force: true });
  });

  const runAndFormat = async (collectionScript: string, requestScript: string, tree: unknown[]) => {
    const request: any = {
      pathname: path.join(collectionPath, 'Boom.bru'),
      url: 'http://localhost',
      method: 'GET',
      headers: {},
      script: { req: '', res: requestScript },
      tests: ''
    };
    mergeScripts(makeCollection(collectionScript, collectionPath) as never, request, tree as never, 'sequential');

    const runtime = new ScriptRuntime({ runtime: 'nodevm' });
    try {
      await runtime.runResponseScript(
        request.script.res,
        request,
        { status: 200, data: {}, headers: {} },
        {},
        {},
        collectionPath,
        () => {},
        {},
        { runtime: 'nodevm' }
      );
    } catch (error) {
      return formatErrorWithContextV2(error, 'post-response', request.script.resMetadata, collectionPath);
    }

    throw new Error('expected the script to throw');
  };

  const requestItem = { type: 'http-request', uid: 'r1', name: 'Boom' } as const;

  test('attributes a collection-level failure to the collection file', async () => {
    const context = await runAndFormat(THROWING_SCRIPT, '', [requestItem]);

    expect(context?.filePath).toBe('collection.bru');
    expect(context?.errorLine).toBe(2);
  });

  test('still attributes a collection-level failure when the request has its own script', async () => {
    const context = await runAndFormat(THROWING_SCRIPT, 'const untouched = 1;', [requestItem]);

    expect(context?.filePath).toBe('collection.bru');
  });

  test('attributes a folder-level failure to the folder file', async () => {
    const folderItem = {
      type: 'folder',
      uid: 'f1',
      name: 'sub',
      pathname: folderPath,
      root: { request: { script: { res: THROWING_SCRIPT } } }
    };

    const context = await runAndFormat('', '', [folderItem, requestItem]);

    expect(context?.filePath).toBe('sub/folder.bru');
    expect(context?.errorLine).toBe(2);
  });
});

describe('a root left unsaved in another editor is what gets merged', () => {
  const collectionPath = path.join(os.tmpdir(), 'bruno-unsaved-root');
  const folderPath = path.join(collectionPath, 'sub');
  const folderFile = path.join(folderPath, 'folder.bru');
  const collectionFile = path.join(collectionPath, 'collection.bru');
  const DRAFT = "throw new Error('from the draft');";

  const collection = { pathname: collectionPath, root: {} };
  const tree = [
    { type: 'folder', uid: 'f1', name: 'sub', pathname: folderPath, root: {} },
    { type: 'http-request', uid: 'r1', name: 'Boom' }
  ];

  const merge = () => {
    const request: any = { script: { req: '', res: '' }, tests: '' };
    mergeScripts(collection as never, request, tree as never, 'sequential');
    return request;
  };

  afterEach(() => {
    clearUnsavedRootForFile(folderFile);
    clearUnsavedRootForFile(collectionFile);
  });

  test('runs an unsaved folder script and attributes it to the folder file', () => {
    setUnsavedRoot('folder', folderFile, { request: { script: { res: DRAFT } } });

    const request = merge();

    expect(request.script.res).toContain(DRAFT);
    expect(request.script.resMetadata.segments).toMatchObject([{ type: 'folder', displayPath: 'sub/folder.bru' }]);
  });

  test('runs an unsaved collection script and attributes it to the collection file', () => {
    setUnsavedRoot('collection', collectionFile, { request: { script: { res: DRAFT } } });

    const request = merge();

    expect(request.script.res).toContain(DRAFT);
    expect(request.script.resMetadata.segments).toMatchObject([{ type: 'collection', displayPath: 'collection.bru' }]);
  });

  test('goes back to the saved script once the draft is gone', () => {
    setUnsavedRoot('folder', folderFile, { request: { script: { res: DRAFT } } });
    clearUnsavedRootForFile(folderFile);

    expect(merge().script.res).toBe('');
  });
});
