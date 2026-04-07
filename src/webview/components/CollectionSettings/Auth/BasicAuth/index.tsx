import React from 'react';
import SensitiveFieldWarning from 'components/SensitiveFieldWarning';
import { useDetectSensitiveField } from 'hooks/useDetectSensitiveField';
import get from 'lodash/get';
import { useTheme } from 'providers/Theme';
import { useDispatch } from 'react-redux';
import SingleLineEditor from 'components/SingleLineEditor';
import { updateCollectionAuth } from 'providers/ReduxStore/slices/collections';
import { saveCollectionSettings } from 'providers/ReduxStore/slices/collections/actions';
import StyledWrapper from './StyledWrapper';

interface BasicAuthProps {
  collection?: React.ReactNode;
}


const BasicAuth = ({
  collection
}: any) => {
  const dispatch = useDispatch();
  const { storedTheme } = useTheme();

  const basicAuth = collection.draft?.root ? get(collection, 'draft.root.request.auth.basic', {}) : get(collection, 'root.request.auth.basic', {});
  const { isSensitive } = useDetectSensitiveField(collection);
  const { showWarning, warningMessage } = isSensitive(basicAuth?.password);

  const handleSave = () => dispatch(saveCollectionSettings(collection.uid));

  const handleUsernameChange = (username: any) => {
    dispatch(
      updateCollectionAuth({
        mode: 'basic',
        collectionUid: collection.uid,
        content: {
          username: username || '',
          password: basicAuth.password || ''
        }
      })
    );
  };

  const handlePasswordChange = (password: any) => {
    dispatch(
      updateCollectionAuth({
        mode: 'basic',
        collectionUid: collection.uid,
        content: {
          username: basicAuth.username || '',
          password: password || ''
        }
      })
    );
  };

  return (
    <StyledWrapper className="mt-2 w-full">
      <label className="block mb-1">Username</label>
      <div className="single-line-editor-wrapper mb-3">
        <SingleLineEditor
          value={basicAuth.username || ''}
          theme={storedTheme}
          onSave={handleSave}
          onChange={(val: any) => handleUsernameChange(val)}
          collection={collection}
          isCompact
        />
      </div>

      <label className="block mb-1">Password</label>
      <div className="single-line-editor-wrapper flex items-center">
        <SingleLineEditor
          value={basicAuth.password || ''}
          theme={storedTheme}
          onSave={handleSave}
          onChange={(val: any) => handlePasswordChange(val)}
          collection={collection}
          isSecret={true}
          isCompact
        />
        {showWarning && <SensitiveFieldWarning fieldName="basic-password" warningMessage={warningMessage} />}
      </div>
    </StyledWrapper>
  );
};

export default BasicAuth;
