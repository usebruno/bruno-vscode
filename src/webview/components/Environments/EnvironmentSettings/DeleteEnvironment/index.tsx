import React from 'react';
import Portal from 'components/Portal/index';
import toast from 'react-hot-toast';
import Modal from 'components/Modal/index';
import { deleteEnvironment } from 'providers/ReduxStore/slices/collections/actions';
import { deleteGlobalEnvironment } from 'providers/ReduxStore/slices/global-environments';
import { useDispatch } from 'react-redux';
import StyledWrapper from './StyledWrapper';

interface DeleteEnvironmentProps {
  onClose?: (...args: unknown[]) => void;
  environment: unknown;
  collection: unknown;
  isGlobal?: boolean;
}


const DeleteEnvironment = ({
  onClose,
  environment,
  collection,
  isGlobal
}: any) => {
  const dispatch = useDispatch();
  const onConfirm = () => {
    const action = isGlobal
      ? deleteGlobalEnvironment({ environmentUid: environment.uid })
      : deleteEnvironment(environment.uid, collection.uid);

    (dispatch(action) as unknown as Promise<void>)
      .then(() => {
        toast.success('Environment deleted successfully');
        onClose();
      })
      .catch(() => toast.error('An error occurred while deleting the environment'));
  };

  return (
    <Portal>
      <StyledWrapper>
        <Modal
          size="sm"
          title="Delete Environment"
          confirmText="Delete"
          handleConfirm={onConfirm}
          handleCancel={onClose}
          confirmButtonColor="danger"
        >
          Are you sure you want to delete <span className="font-medium">{environment.name}</span> ?
        </Modal>
      </StyledWrapper>
    </Portal>
  );
};

export default DeleteEnvironment;
