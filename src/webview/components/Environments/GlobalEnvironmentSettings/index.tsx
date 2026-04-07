import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import CreateGlobalEnvironment from 'components/Environments/CreateGlobalEnvironment';
import EnvironmentList from '../EnvironmentSettings/EnvironmentList';
import StyledWrapper from '../EnvironmentSettings/StyledWrapper';
import { IconFileAlert } from '@tabler/icons';
import ImportEnvironmentModal from 'components/Environments/Common/ImportEnvironmentModal';
import ExportEnvironmentModal from 'components/Environments/Common/ExportEnvironmentModal';
import Button from 'ui/Button';

const DefaultTab = ({
  setTab
}: any) => (
  <div className="empty-state">
    <IconFileAlert size={48} strokeWidth={1.5} />
    <div className="title">No Global Environments</div>
    <div className="actions">
      <Button size="sm" color="secondary" onClick={() => setTab('create')}>
        Create Environment
      </Button>
      <Button size="sm" color="secondary" onClick={() => setTab('import')}>
        Import Environment
      </Button>
    </div>
  </div>
);

const GlobalEnvironmentSettings = () => {
  const [isModified, setIsModified] = useState(false);
  const globalEnvironments = useSelector((state: any) => state.globalEnvironments?.globalEnvironments || []);
  const activeGlobalEnvironmentUid = useSelector((state: any) => state.globalEnvironments?.activeGlobalEnvironmentUid);

  const [selectedEnvironment, setSelectedEnvironment] = useState(() => {
    if (!globalEnvironments.length) return null;
    return globalEnvironments.find((env: any) => env.uid === activeGlobalEnvironmentUid) || globalEnvironments[0];
  });
  const [tab, setTab] = useState('default');
  const [showExportModal, setShowExportModal] = useState(false);

  if (!globalEnvironments || !globalEnvironments.length) {
    return (
      <StyledWrapper>
        {tab === 'create' ? (
          <CreateGlobalEnvironment onClose={() => setTab('default')} />
        ) : tab === 'import' ? (
          <ImportEnvironmentModal type="global" onClose={() => setTab('default')} />
        ) : (
          <DefaultTab setTab={setTab} />
        )}
      </StyledWrapper>
    );
  }

  return (
    <StyledWrapper>
      <EnvironmentList
        environments={globalEnvironments}
        activeEnvironmentUid={activeGlobalEnvironmentUid}
        selectedEnvironment={selectedEnvironment}
        setSelectedEnvironment={setSelectedEnvironment}
        isModified={isModified}
        setIsModified={setIsModified}
        setShowExportModal={setShowExportModal}
        isGlobal={true}
      />
      {showExportModal && (
        <ExportEnvironmentModal
          onClose={() => setShowExportModal(false)}
          environments={globalEnvironments}
          environmentType="global"
        />
      )}
    </StyledWrapper>
  );
};

export default GlobalEnvironmentSettings;
