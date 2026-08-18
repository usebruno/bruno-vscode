import React, { useState } from 'react';
import { IconTrash } from '@tabler/icons';
import DeleteDotEnvFile from 'components/Environments/EnvironmentSettings/DeleteDotEnvFile';
import StyledWrapper from './StyledWrapper';

interface DotEnvFileDetailsProps {
  title: string;
  children: React.ReactNode;
  onDelete: () => void;
  viewMode: 'table' | 'raw';
  onViewModeChange: (mode: 'table' | 'raw') => void;
}

const DotEnvFileDetails = ({
  title,
  children,
  onDelete,
  viewMode,
  onViewModeChange
}: DotEnvFileDetailsProps) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  return (
    <StyledWrapper>
      <div className="header">
        <h3 className="title">{title}</h3>
        <div className="actions">
          <div className="view-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => onViewModeChange('table')}
              aria-pressed={viewMode === 'table'}
              data-testid="dotenv-view-table"
            >
              Table
            </button>
            <button
              type="button"
              className={`toggle-btn ${viewMode === 'raw' ? 'active' : ''}`}
              onClick={() => onViewModeChange('raw')}
              aria-pressed={viewMode === 'raw'}
              data-testid="dotenv-view-raw"
            >
              Raw
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            title="Delete .env file"
            className="action-btn delete-btn"
            data-testid="delete-dotenv-file"
          >
            <IconTrash size={15} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {showDeleteModal && (
        <DeleteDotEnvFile onClose={() => setShowDeleteModal(false)} onConfirm={onDelete} filename={title} />
      )}

      <div className="content">{children}</div>
    </StyledWrapper>
  );
};

export default DotEnvFileDetails;
