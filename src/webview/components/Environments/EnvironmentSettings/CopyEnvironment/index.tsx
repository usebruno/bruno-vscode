import Modal from 'components/Modal/index';
import Portal from 'components/Portal/index';
import { useFormik } from 'formik';
import { copyEnvironment } from 'providers/ReduxStore/slices/collections/actions';
import { copyGlobalEnvironment } from 'providers/ReduxStore/slices/global-environments';
import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useDispatch } from 'react-redux';
import * as Yup from 'yup';

interface CopyEnvironmentProps {
  collection: unknown;
  environment: unknown;
  onClose?: (...args: unknown[]) => void;
  isGlobal?: boolean;
}


const CopyEnvironment = ({
  collection,
  environment,
  onClose,
  isGlobal
}: any) => {
  const dispatch = useDispatch();
  const inputRef = useRef<HTMLInputElement>(null);
  const formik = useFormik({
    enableReinitialize: true,
    initialValues: {
      name: environment.name + ' - Copy'
    },
    validationSchema: Yup.object({
      name: Yup.string()
        .min(1, 'must be at least 1 character')
        .max(50, 'must be 50 characters or less')
        .required('name is required')
    }),
    onSubmit: (values) => {
      const action = isGlobal
        ? copyGlobalEnvironment({ name: values.name, environmentUid: environment.uid })
        : copyEnvironment(values.name, environment.uid, collection.uid);

      (dispatch(action) as unknown as Promise<void>)
        .then(() => {
          toast.success(isGlobal ? 'Global environment copied' : 'Environment created in collection');
          onClose();
        })
        .catch(() => toast.error('An error occurred while copying the environment'));
    }
  });

  useEffect(() => {
    if (inputRef && inputRef.current) {
      inputRef.current.focus();
    }
  }, [inputRef]);

  const onSubmit = () => {
    formik.handleSubmit();
  };

  return (
    <Portal>
      <Modal size="sm" title="Copy Environment" confirmText="Copy" handleConfirm={onSubmit} handleCancel={onClose}>
        <form className="bruno-form" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label htmlFor="name" className="block font-medium">
              New Environment Name
            </label>
            <input
              id="environment-name"
              type="text"
              name="name"
              ref={inputRef}
              className="block textbox mt-2 w-full"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              onChange={formik.handleChange}
              value={formik.values.name || ''}
            />
            {formik.touched.name && formik.errors.name ? (
              <div className="text-red-500">{formik.errors.name}</div>
            ) : null}
          </div>
        </form>
      </Modal>
    </Portal>
  );
};

export default CopyEnvironment;
