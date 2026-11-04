import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { IconX, IconChevronDown, IconChevronRight, IconExternalLink } from '@tabler/icons';
import type { ScriptErrorContext, ScriptErrorPhase, ScriptType } from '@bruno-types';
import { SCRIPT_ERROR_PHASES, getScriptError } from '@bruno-types';
import ErrorBanner from 'ui/ErrorBanner';
import CodeSnippet from 'ui/CodeSnippet';
import { getTreePathFromCollectionToItem } from 'utils/collections';
import { normalizePath, getAbsoluteFilePath } from 'utils/common/path';
import { ipcRenderer } from 'utils/ipc';
import { updateRequestPaneTab, updateScriptPaneTab, setFocusErrorLine } from 'providers/ReduxStore/slices/tabs';
import { isTabForItemPresent } from 'selectors/tab';
import StyledWrapper from './StyledWrapper';

const SCRIPTABLE_REQUEST_TYPES = ['http-request', 'graphql-request'];

interface ScriptErrorProps {
  item?: Record<string, unknown>;
  collection?: Record<string, unknown>;
  onClose?: () => void;
}

interface ScriptErrorCardProps {
  title: string;
  message: string;
  errorContext: ScriptErrorContext;
  scriptPhase: ScriptType;
  item?: Record<string, unknown>;
  collection?: Record<string, unknown>;
  onClose?: () => void;
}

const PHASE_TITLES: Record<ScriptErrorPhase, string> = {
  preRequest: 'Pre-Request Script Error',
  postResponse: 'Post-Response Script Error',
  test: 'Test Script Error'
};

/** "echo json.bru" -> Request, "auth/folder.bru" -> "Folder: auth", "collection.bru" -> Collection.
 *  An unmatched folder falls back to a bare "Folder". */
const getErrorSource = (
  filePath: string,
  item?: Record<string, unknown>,
  collection?: Record<string, unknown>
): { sourceType: 'request' | 'folder' | 'collection'; label: string } => {
  const normalizedPath = normalizePath(filePath);

  // Before the collection case, so folder.yml is not mistaken for a collection file.
  if (/(?:^|\/)folder\.(?:bru|yml)$/.test(normalizedPath)) {
    const folderFileName = normalizedPath.split('/').pop();
    const collectionPathname = normalizePath((collection?.pathname as string) || '');
    const treePath = collection && item ? getTreePathFromCollectionToItem(collection, item) : null;

    for (const node of treePath || []) {
      if (node?.type !== 'folder') continue;

      const nodePath = normalizePath(node.pathname || '');
      const folderRelPath = nodePath && nodePath.startsWith(collectionPathname)
        ? `${nodePath.slice(collectionPathname.length).replace(/^\//, '')}/${folderFileName}`
        : folderFileName;

      if (folderRelPath === normalizedPath) {
        return { sourceType: 'folder', label: `Folder: ${node.name}` };
      }
    }

    return { sourceType: 'folder', label: 'Folder' };
  }

  if (normalizedPath === 'collection.bru' || /^opencollection\.ya?ml$/.test(normalizedPath)) {
    return { sourceType: 'collection', label: 'Collection' };
  }

  return { sourceType: 'request', label: 'Request' };
};

const ScriptErrorCard = ({ title, message, errorContext, scriptPhase, item, collection, onClose }: ScriptErrorCardProps) => {
  const dispatch = useDispatch();
  const [showStack, setShowStack] = useState(false);

  const filePath = errorContext.filePath ? normalizePath(errorContext.filePath) : null;
  const source = filePath ? getErrorSource(filePath, item, collection) : null;
  const errorLine = errorContext.errorLine;

  const hasRequestTab =useSelector(isTabForItemPresent({ itemUid: item?.uid as string }));
  const collectionPathname = normalizePath(collection?.pathname as string);
  const isInheritedSource = source?.sourceType === 'folder' || source?.sourceType === 'collection';
  const canNavigate = isInheritedSource
    ? !!collectionPathname
    : source?.sourceType === 'request'
      && typeof errorLine === 'number'
      && SCRIPTABLE_REQUEST_TYPES.includes(item?.type as string)
      && hasRequestTab;

  const revealInheritedSource = () => {
    ipcRenderer.invoke('renderer:reveal-script-error-source', {
      filePath: getAbsoluteFilePath(collectionPathname, filePath!),
      scriptPhase,
      line: typeof errorLine === 'number' ? errorLine : undefined
    });
  };

  const navigateToErrorLine = () => {
    if (!canNavigate) return;

    if (isInheritedSource) {
      revealInheritedSource();
      return;
    }

    const uid = item!.uid as string;
    if (scriptPhase === 'test') {
      dispatch(updateRequestPaneTab({ uid, requestPaneTab: 'tests' }));
    } else {
      dispatch(updateRequestPaneTab({ uid, requestPaneTab: 'script' }));
      dispatch(updateScriptPaneTab({ uid, scriptPaneTab: scriptPhase }));
    }
    dispatch(setFocusErrorLine({ uid, scriptPhase, line: errorLine, requestedAt: Date.now() }));
  };

  const onFilePathKeyDown = (e: React.KeyboardEvent) => {
    if (!canNavigate) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigateToErrorLine();
    }
  };

  return (
    <div className="script-error-card" data-testid="script-error-card">
      <div className="script-error-header">
        <div className="error-title" data-testid="script-error-title">{title}</div>
        {onClose && (
          <button className="close-button" data-testid="script-error-close" onClick={onClose} aria-label="Close error">
            <IconX size={16} strokeWidth={1.5} />
          </button>
        )}
      </div>
      {filePath && (
        <div className="script-error-source-label" data-testid="script-error-source-label">
          <span>{source!.label}</span>
          <span
            className={`script-error-file-path${canNavigate ? ' navigable' : ''}`}
            data-testid="script-error-file-path"
            role={canNavigate ? 'button' : undefined}
            tabIndex={canNavigate ? 0 : undefined}
            onClick={navigateToErrorLine}
            onKeyDown={onFilePathKeyDown}
            title={canNavigate
              ? (isInheritedSource ? `Open ${filePath}` : `Go to line ${errorLine} in ${filePath}`)
              : undefined}
          >
            <span>{filePath}</span>
            {canNavigate && <IconExternalLink size={12} className="flex-shrink-0" />}
          </span>
        </div>
      )}
      <CodeSnippet lines={errorContext.lines} />
      <div className="script-error-message" data-testid="script-error-message">
        {errorContext.errorType || 'Error'}: {message}
      </div>
      {errorContext.stack && (
        <div>
          <button
            className="script-error-stack-toggle"
            data-testid="script-error-stack-toggle"
            onClick={() => setShowStack(!showStack)}
            aria-expanded={showStack}
            aria-label={`${showStack ? 'Hide' : 'Show'} stack trace`}
          >
            {showStack ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            <span>{showStack ? 'Hide' : 'Show'} stack trace</span>
          </button>
          {showStack && (
            <pre className="script-error-stack" data-testid="script-error-stack">{errorContext.stack}</pre>
          )}
        </div>
      )}
    </div>
  );
};

const ScriptError = ({ item, collection, onClose }: ScriptErrorProps) => {
  const errors = SCRIPT_ERROR_PHASES
    .map(({ phase, scriptType }) => ({ phase, scriptType, title: PHASE_TITLES[phase], ...getScriptError(item, phase) }))
    .filter((e) => e.message);

  if (!errors.length) return null;

  if (!errors.some((e) => e.context)) {
    return <ErrorBanner errors={errors.map(({ title, message }) => ({ title, message }))} onClose={onClose} className="mt-4 mb-2" />;
  }

  return (
    <StyledWrapper className="mt-4 mb-2">
      {errors.map(({ phase, scriptType, title, message, context }) => (
        context
          ? <ScriptErrorCard
              key={phase}
              title={title}
              message={message as string}
              errorContext={context}
              scriptPhase={scriptType}
              item={item}
              collection={collection}
              onClose={onClose}
            />
          : <ErrorBanner key={phase} errors={[{ title, message }]} onClose={onClose} />
      ))}
    </StyledWrapper>
  );
};

export default ScriptError;
