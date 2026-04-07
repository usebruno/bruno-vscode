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

interface AwsV4AuthProps {
  collection?: React.ReactNode;
}


const AwsV4Auth = ({
  collection
}: any) => {
  const dispatch = useDispatch();
  const { storedTheme } = useTheme();

  const awsv4Auth = collection.draft?.root ? get(collection, 'draft.root.request.auth.awsv4', {}) : get(collection, 'root.request.auth.awsv4', {});
  const { isSensitive } = useDetectSensitiveField(collection);
  const { showWarning, warningMessage } = isSensitive(awsv4Auth?.secretAccessKey);

  const handleSave = () => dispatch(saveCollectionSettings(collection.uid));

  const handleAccessKeyIdChange = (accessKeyId: any) => {
    dispatch(
      updateCollectionAuth({
        mode: 'awsv4',
        collectionUid: collection.uid,
        content: {
          accessKeyId: accessKeyId || '',
          secretAccessKey: awsv4Auth.secretAccessKey || '',
          sessionToken: awsv4Auth.sessionToken || '',
          service: awsv4Auth.service || '',
          region: awsv4Auth.region || '',
          profileName: awsv4Auth.profileName || ''
        }
      })
    );
  };

  const handleSecretAccessKeyChange = (secretAccessKey: any) => {
    dispatch(
      updateCollectionAuth({
        mode: 'awsv4',
        collectionUid: collection.uid,
        content: {
          accessKeyId: awsv4Auth.accessKeyId || '',
          secretAccessKey: secretAccessKey || '',
          sessionToken: awsv4Auth.sessionToken || '',
          service: awsv4Auth.service || '',
          region: awsv4Auth.region || '',
          profileName: awsv4Auth.profileName || ''
        }
      })
    );
  };

  const handleSessionTokenChange = (sessionToken: any) => {
    dispatch(
      updateCollectionAuth({
        mode: 'awsv4',
        collectionUid: collection.uid,
        content: {
          accessKeyId: awsv4Auth.accessKeyId || '',
          secretAccessKey: awsv4Auth.secretAccessKey || '',
          sessionToken: sessionToken || '',
          service: awsv4Auth.service || '',
          region: awsv4Auth.region || '',
          profileName: awsv4Auth.profileName || ''
        }
      })
    );
  };

  const handleServiceChange = (service: any) => {
    dispatch(
      updateCollectionAuth({
        mode: 'awsv4',
        collectionUid: collection.uid,
        content: {
          accessKeyId: awsv4Auth.accessKeyId || '',
          secretAccessKey: awsv4Auth.secretAccessKey || '',
          sessionToken: awsv4Auth.sessionToken || '',
          service: service || '',
          region: awsv4Auth.region || '',
          profileName: awsv4Auth.profileName || ''
        }
      })
    );
  };

  const handleRegionChange = (region: any) => {
    dispatch(
      updateCollectionAuth({
        mode: 'awsv4',
        collectionUid: collection.uid,
        content: {
          accessKeyId: awsv4Auth.accessKeyId || '',
          secretAccessKey: awsv4Auth.secretAccessKey || '',
          sessionToken: awsv4Auth.sessionToken || '',
          service: awsv4Auth.service || '',
          region: region || '',
          profileName: awsv4Auth.profileName || ''
        }
      })
    );
  };

  const handleProfileNameChange = (profileName: any) => {
    dispatch(
      updateCollectionAuth({
        mode: 'awsv4',
        collectionUid: collection.uid,
        content: {
          accessKeyId: awsv4Auth.accessKeyId || '',
          secretAccessKey: awsv4Auth.secretAccessKey || '',
          sessionToken: awsv4Auth.sessionToken || '',
          service: awsv4Auth.service || '',
          region: awsv4Auth.region || '',
          profileName: profileName || ''
        }
      })
    );
  };

  return (
    <StyledWrapper className="mt-2 w-full">
      <label className="block mb-1">Access Key ID</label>
      <div className="single-line-editor-wrapper mb-3">
        <SingleLineEditor
          value={awsv4Auth.accessKeyId || ''}
          theme={storedTheme}
          onSave={handleSave}
          onChange={(val: any) => handleAccessKeyIdChange(val)}
          collection={collection}
          isCompact
        />
      </div>

      <label className="block mb-1">Secret Access Key</label>
      <div className="single-line-editor-wrapper mb-3 flex items-center">
        <SingleLineEditor
          value={awsv4Auth.secretAccessKey || ''}
          theme={storedTheme}
          onSave={handleSave}
          onChange={(val: any) => handleSecretAccessKeyChange(val)}
          collection={collection}
          isSecret={true}
          isCompact
        />
        {showWarning && <SensitiveFieldWarning fieldName="awsv4-secret-access-key" warningMessage={warningMessage} />}
      </div>

      <label className="block mb-1">Session Token</label>
      <div className="single-line-editor-wrapper mb-3">
        <SingleLineEditor
          value={awsv4Auth.sessionToken || ''}
          theme={storedTheme}
          onSave={handleSave}
          onChange={(val: any) => handleSessionTokenChange(val)}
          collection={collection}
          isCompact
        />
      </div>

      <label className="block mb-1">Service</label>
      <div className="single-line-editor-wrapper mb-3">
        <SingleLineEditor
          value={awsv4Auth.service || ''}
          theme={storedTheme}
          onSave={handleSave}
          onChange={(val: any) => handleServiceChange(val)}
          collection={collection}
          isCompact
        />
      </div>

      <label className="block mb-1">Region</label>
      <div className="single-line-editor-wrapper mb-3">
        <SingleLineEditor
          value={awsv4Auth.region || ''}
          theme={storedTheme}
          onSave={handleSave}
          onChange={(val: any) => handleRegionChange(val)}
          collection={collection}
          isCompact
        />
      </div>

      <label className="block mb-1">Profile Name</label>
      <div className="single-line-editor-wrapper">
        <SingleLineEditor
          value={awsv4Auth.profileName || ''}
          theme={storedTheme}
          onSave={handleSave}
          onChange={(val: any) => handleProfileNameChange(val)}
          collection={collection}
          isCompact
        />
      </div>
    </StyledWrapper>
  );
};

export default AwsV4Auth;
