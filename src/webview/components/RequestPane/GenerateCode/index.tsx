import React, { useMemo, useState } from 'react';
import get from 'lodash/get';
import { HTTPSnippet } from 'httpsnippet';
import { IconCode, IconCopy, IconChevronDown } from '@tabler/icons';
import toast from 'react-hot-toast';
import Modal from 'components/Modal';
import CodeEditor from 'components/CodeEditor';
import { useTheme } from 'providers/Theme';
import { getLanguages } from 'utils/codegenerator/targets';
import { buildHarRequest } from 'utils/codegenerator/har';
import { getAuthHeaders } from 'utils/codegenerator/auth';
import { resolveInheritedAuth } from 'utils/auth';
import {
  getAllVariables,
  getTreePathFromCollectionToItem,
  mergeHeaders
} from 'utils/collections';
import { interpolateUrl, interpolateUrlPathParams } from 'utils/url';
import StyledWrapper from './StyledWrapper';

// Maps httpsnippet target keys to CodeMirror modes for readable syntax highlighting.
// Falls back to plain text for targets with no close CodeMirror equivalent.
const TARGET_TO_CM_MODE: Record<string, string> = {
  shell: 'shell',
  node: 'javascript',
  javascript: 'javascript',
  python: 'python',
  java: 'clike',
  csharp: 'clike',
  go: 'go',
  php: 'php',
  ruby: 'ruby',
  swift: 'clike',
  kotlin: 'clike',
  objc: 'clike'
};

interface GenerateCodeItemProps {
  item?: any;
  collection?: any;
}

const GenerateCodeItem = ({ item, collection }: GenerateCodeItemProps) => {
  const { theme, storedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [shouldInterpolate, setShouldInterpolate] = useState(false);

  const languages = useMemo(() => getLanguages(), []);

  // Groups the flat language list into { "Shell": [{target:'shell', client:'curl', ...}], "Node.js": [...] }
  // matching the desktop app's main-language + library-button pattern.
  const languageGroups = useMemo(() => {
    return languages.reduce((acc: Record<string, any[]>, lang: any) => {
      const mainLang = lang.name.split(' - ')[0];
      const libraryName = lang.name.split(' - ')[1] || 'default';
      if (!acc[mainLang]) acc[mainLang] = [];
      acc[mainLang].push({ ...lang, libraryName });
      return acc;
    }, {});
  }, [languages]);

  const mainLanguages = useMemo(() => Object.keys(languageGroups), [languageGroups]);

  const [mainLanguage, setMainLanguage] = useState(mainLanguages[0]);
  const availableLibraries = languageGroups[mainLanguage] || [];
  const [library, setLibrary] = useState(availableLibraries[0]?.libraryName);

  const activeLanguage = availableLibraries.find((l) => l.libraryName === library) || availableLibraries[0];

  const handleMainLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMainLang = e.target.value;
    setMainLanguage(newMainLang);
    setLibrary(languageGroups[newMainLang][0].libraryName);
  };

  const request = item.draft ? get(item, 'draft.request') : get(item, 'request');

  const snippet = useMemo(() => {
    if (!open || !request?.url || !activeLanguage) return '';

    try {
      // Auth inheritance: walks folder -> collection, same as the request runner.
      // NOTE: only handles collection/folder-level inheritance today; the desktop
      // app's resolver additionally understands OAuth2 credential records, which
      // this extension does not yet track locally.
      const resolvedRequest = resolveInheritedAuth(item, collection);

      // Header merging: collection root -> folders on the path -> request itself,
      // later entries override earlier ones by header name (case-sensitive).
      const requestTreePath = getTreePathFromCollectionToItem(collection, item);
      const mergedHeaders = mergeHeaders(collection, request, requestTreePath);

      const authHeaders = getAuthHeaders(undefined, resolvedRequest.auth);
      const headers = [...mergedHeaders, ...authHeaders];

      let url = request.url;
      if (shouldInterpolate) {
        const variables = getAllVariables(collection, item);
        url = interpolateUrl({ url, variables }) ?? url;
      }
      url = interpolateUrlPathParams(url, request.params || []);

      const harRequest = buildHarRequest({
        request: {
          url,
          method: request.method,
          body: request.body,
          params: request.params,
          auth: resolvedRequest.auth
        },
        headers
      });

      const httpSnippet = new HTTPSnippet(harRequest);
      return httpSnippet.convert(activeLanguage.target, activeLanguage.client) as string;
    } catch (error) {
      return `// Could not generate a snippet for this request.\n// ${(error as Error).message}`;
    }
  }, [open, activeLanguage, request, collection, item, shouldInterpolate]);

  const cmMode = activeLanguage ? TARGET_TO_CM_MODE[activeLanguage.target] : undefined;

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet);
    toast.success('Copied to clipboard');
  };

  if (!request) return null;

  return (
    <>
      <div
        title="Generate Code"
        className="infotip mr-3"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        data-testid="generate-code-icon">
            
        <IconCode
          color={theme.requestTabPanel.url.icon}
          strokeWidth={1.5}
          size={20}
          className="cursor-pointer"
        />
        <span className="infotiptext text-xs">Generate Code</span>
      </div>

      {open ? (
        <Modal
          size="lg"
          title="Generate Code"
          hideFooter
          handleCancel={() => setOpen(false)}
          dataTestId="generate-code-modal"
        >
          <StyledWrapper>
            <div className="toolbar">
              <div className="left-controls">
                <div className="select-wrapper">
                  <select className="native-select" value={mainLanguage} onChange={handleMainLanguageChange}>
                    {mainLanguages.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                  <IconChevronDown size={16} className="select-arrow" />
                </div>

                {availableLibraries.length > 1 && (
                  <div className="library-options">
                    {availableLibraries.map((lib) => (
                      <button
                        key={lib.libraryName}
                        className={`lib-btn ${library === lib.libraryName ? 'active' : ''}`}
                        onClick={() => setLibrary(lib.libraryName)}
                      >
                        {lib.libraryName}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="right-controls">
                <label className="interpolate-checkbox" title="Replace {{variables}} with their resolved values">
                  <input
                    type="checkbox"
                    checked={shouldInterpolate}
                    onChange={(e) => setShouldInterpolate(e.target.checked)}
                  />
                  <span>Interpolate Variables</span>
                </label>
                <div className="cursor-pointer flex items-center ml-3" onClick={handleCopy} title="Copy to clipboard">
                  <IconCopy color={theme.requestTabPanel.url.icon} strokeWidth={1.5} size={18} />
                </div>
              </div>
            </div>
            <div className="snippet-editor">
              <CodeEditor
                value={snippet}
                theme={storedTheme}
                mode={cmMode}
                readOnly
                enableBrunoVarInfo={false}
              />
            </div>
          </StyledWrapper>
        </Modal>
      ) : null}
    </>
  );
};

export default GenerateCodeItem;