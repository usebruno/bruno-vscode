import React from 'react';
import Portal from 'components/Portal/index';
import Modal from 'components/Modal/index';
import StyledWrapper from './StyledWrapper';

interface DeleteDotEnvFileProps {
  onClose: () => void;
  onConfirm: () => void;
  filename: string;
}

const DeleteDotEnvFile = ({ onClose, onConfirm, filename }: DeleteDotEnvFileProps) => {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Portal>
      <StyledWrapper>
        <Modal
          size="sm"
          title={`Delete ${filename} File`}
          confirmText="Delete"
          handleConfirm={handleConfirm}
          handleCancel={onClose}
          confirmButtonColor="danger"
        >
          Are you sure you want to delete <span className="font-medium">{filename}</span> file?
        </Modal>
      </StyledWrapper>
    </Portal>
  );
};

export default DeleteDotEnvFile;
