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

interface NTLMAuthProps {
  collection?: React.ReactNode;
}


const NTLMAuth = ({
  collection
}: any) => {
  const dispatch = useDispatch();
  const { storedTheme } = useTheme();

  const ntlmAuth = collection.draft?.root ? get(collection, 'draft.root.request.auth.ntlm', {}) : get(collection, 'root.request.auth.ntlm', {});
  const { isSensitive } = useDetectSensitiveField(collection);
  const { showWarning, warningMessage } = isSensitive(ntlmAuth?.password);

  const handleSave = () => dispatch(saveCollectionSettings(collection.uid));

  const handleUsernameChange = (username: any) => {
    dispatch(
      updateCollectionAuth({
        mode: 'ntlm',
        collectionUid: collection.uid,
        content: {
          username: username || '',
          password: ntlmAuth.password || '',
          domain: ntlmAuth.domain || ''

        }
      })
    );
  };

  const handlePasswordChange = (password: any) => {
    dispatch(
      updateCollectionAuth({
        mode: 'ntlm',
        collectionUid: collection.uid,
        content: {
          username: ntlmAuth.username || '',
          password: password || '',
          domain: ntlmAuth.domain || ''
        }
      })
    );
  };

  const handleDomainChange = (domain: any) => {
    dispatch(
      updateCollectionAuth({
        mode: 'ntlm',
        collectionUid: collection.uid,
        content: {
          username: ntlmAuth.username || '',
          password: ntlmAuth.password || '',
          domain: domain || ''
        }
      })
    );
  };

  return (
    <StyledWrapper className="mt-2 w-full">
      <label className="block mb-1">Username</label>
      <div className="single-line-editor-wrapper mb-3">
        <SingleLineEditor
          value={ntlmAuth.username || ''}
          theme={storedTheme}
          onSave={handleSave}
          onChange={(val: any) => handleUsernameChange(val)}
          collection={collection}
          isCompact
        />
      </div>

      <label className="block mb-1">Password</label>
      <div className="single-line-editor-wrapper mb-3 flex items-center">
        <SingleLineEditor
          value={ntlmAuth.password || ''}
          theme={storedTheme}
          onSave={handleSave}
          onChange={(val: any) => handlePasswordChange(val)}
          collection={collection}
          isSecret={true}
          isCompact
        />
        {showWarning && <SensitiveFieldWarning fieldName="ntlm-password" warningMessage={warningMessage} />}
      </div>

      <label className="block mb-1">Domain</label>
      <div className="single-line-editor-wrapper">
        <SingleLineEditor
          value={ntlmAuth.domain || ''}
          theme={storedTheme}
          onSave={handleSave}
          onChange={(val: any) => handleDomainChange(val)}
          collection={collection}
          isCompact
        />
      </div>
    </StyledWrapper>
  );
};

export default NTLMAuth;
