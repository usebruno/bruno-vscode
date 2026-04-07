import 'github-markdown-css/github-markdown.css';
import get from 'lodash/get';
import { updateFolderDocs } from 'providers/ReduxStore/slices/collections';
import { useTheme } from 'providers/Theme';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { saveFolderRoot } from 'providers/ReduxStore/slices/collections/actions';
import Markdown from 'components/MarkDown';
import CodeEditor from 'components/CodeEditor';
import Button from 'ui/Button';
import StyledWrapper from './StyledWrapper';

interface DocumentationProps {
  collection?: React.ReactNode;
  folder: unknown;
}


const Documentation = ({
  collection,
  folder
}: any) => {
  const dispatch = useDispatch();
  const { displayedTheme } = useTheme();
  const preferences = useSelector((state) => state.app.preferences);
  const [isEditing, setIsEditing] = useState(false);
  const docs = folder.draft ? get(folder, 'draft.root.docs', '') : get(folder, 'root.docs', '');

  const toggleViewMode = () => {
    setIsEditing((prev) => !prev);
  };

  const onEdit = (value: any) => {
    dispatch(
      updateFolderDocs({
        folderUid: folder.uid,
        collectionUid: collection.uid,
        docs: value
      })
    );
  };

  const onSave = () => dispatch(saveFolderRoot(collection.uid, folder.uid));

  if (!folder) {
    return null;
  }

  return (
    <StyledWrapper className="w-full relative flex flex-col">
      <div className="editing-mode flex justify-between items-center flex-shrink-0" role="tab" onClick={toggleViewMode}>
        {isEditing ? 'Preview' : 'Edit'}
      </div>

      {isEditing ? (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="mt-2 flex-1 overflow-auto min-h-0">
            <CodeEditor
              collection={collection}
              theme={displayedTheme}
              value={docs || ''}
              onEdit={onEdit}
              onSave={onSave}
              font={get(preferences, 'font.codeFont', 'default')}
              fontSize={get(preferences, 'font.codeFontSize')}
              mode="application/text"
            />
          </div>
          <div className="mt-6 flex-shrink-0">
            <Button type="submit" size="sm" onClick={onSave}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="h-full">
          <Markdown collectionPath={collection.pathname} onDoubleClick={toggleViewMode} content={docs} />
        </div>
      )}
    </StyledWrapper>
  );
};

export default Documentation;
