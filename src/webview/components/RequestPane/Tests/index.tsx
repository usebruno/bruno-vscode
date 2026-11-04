import React, { useRef } from 'react';
import get from 'lodash/get';
import { useDispatch, useSelector } from 'react-redux';
import CodeEditor from 'components/CodeEditor';
import { updateRequestTests } from 'providers/ReduxStore/slices/collections';
import { sendRequest, saveRequest } from 'providers/ReduxStore/slices/collections/actions';
import { useTheme } from 'providers/Theme';
import useFocusErrorLine from 'hooks/useFocusErrorLine';
import StyledWrapper from './StyledWrapper';

interface TestsProps {
  item: unknown;
  collection?: React.ReactNode;
}


const Tests = ({
  item,
  collection
}: any) => {
  const dispatch = useDispatch();
  const editorRef = useRef(null);
  const tests = item.draft ? get(item, 'draft.request.tests') : get(item, 'request.tests');

  const { displayedTheme } = useTheme();
  const preferences = useSelector((state) => state.app.preferences);

  useFocusErrorLine({ uid: item.uid, editorRef, scriptPhase: 'test' });

  const onEdit = (value: any) => {
    dispatch(
      updateRequestTests({
        tests: value,
        itemUid: item.uid,
        collectionUid: collection.uid
      })
    );
  };

  const onRun = () => dispatch(sendRequest(item, collection.uid));
  const onSave = () => dispatch(saveRequest(item.uid, collection.uid));

  return (
    <StyledWrapper className="w-full h-full">
      <CodeEditor
        ref={editorRef}
        collection={collection}
        value={tests || ''}
        theme={displayedTheme}
        font={get(preferences, 'font.codeFont', 'default')}
        fontSize={get(preferences, 'font.codeFontSize')}
        onEdit={onEdit}
        mode="javascript"
        onRun={onRun}
        onSave={onSave}
        showHintsFor={['req', 'res', 'bru']}
      />
    </StyledWrapper>
  );
};

export default Tests;
