import React, { useState, useRef, useEffect } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import Modal from 'components/Modal/index';
import { modifyCookie, addCookie, getParsedCookie, createCookieString } from 'providers/ReduxStore/slices/app';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import ToggleSwitch from 'components/ToggleSwitch/index';
import { IconInfoCircle } from '@tabler/icons';
import moment from 'moment';
import 'moment-timezone';
import { Tooltip } from 'react-tooltip';
import { isEmpty } from 'lodash';
import StyledWrapper from './StyledWrapper';

interface removeEmptyValuesProps {
  onClose?: (...args: unknown[]) => void;
  domain?: unknown;
  cookie: unknown;
}

const removeEmptyValues = (obj: any) => {
  return Object.fromEntries(Object.entries(obj).filter(([_, value]) => value !== null && value !== undefined));
};

const ModifyCookieModal = ({
  onClose,
  domain,
  cookie
}: any) => {
  const dispatch = useDispatch();
  const [isRawMode, setIsRawMode] = useState(false);
  const [cookieString, setCookieString] = useState('');
  const initialParseRef = useRef(false);

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: {
      ...(cookie ? cookie : {}),
      key: cookie?.key || '',
      value: cookie?.value || '',
      path: cookie?.path || '/',
      domain: cookie?.domain || domain || '',
      expires: cookie?.expires ? moment(cookie.expires).format(moment.HTML5_FMT.DATETIME_LOCAL) : '',
      secure: cookie?.secure || false,
      httpOnly: cookie?.httpOnly || false
    },
    validationSchema: Yup.object({
      key: Yup.string().required('Key is required'),
      value: Yup.string().required('Value is required'),
      domain: Yup.string().required('Domain is required'),
      secure: Yup.boolean(),
      httpOnly: Yup.boolean(),
      expires: Yup.mixed()
        .nullable()
        .transform((value) => {
          if (!value || value === '') return null;
          return moment(value).isValid() ? moment(value).toDate() : null;
        })
        .test('future-date', 'Expiration date must be in the future', (value) => {
          if (!value) return true;
          return moment(value).isAfter(moment());
        })
    }),
    onSubmit: (values) => {
      const modValues = removeEmptyValues({
        ...(cookie ? cookie : {}),
        ...values,
        expires: values.expires
          ? moment(values.expires).isValid()
            ? moment(values.expires).toDate()
            : Infinity
          : Infinity
      });

      handleCookieDispatch(cookie, domain, modValues, onClose);
    }
  });

  const title = cookie ? 'Modify Cookie' : 'Add Cookie';

  const handleCookieDispatch = (cookie: any, domain: any, modValues: any, onClose: any) => {
    if (cookie) {
      (dispatch(modifyCookie(domain, cookie, modValues)) as unknown as Promise<void>)
        .then(() => {
          toast.success('Cookie modified successfully');
          onClose();
        })
        .catch((err: any) => {
          toast.error('An error occurred while modifying cookie');
          console.error(err);
        });
    } else {
      (dispatch(addCookie(domain, modValues)) as unknown as Promise<void>)
        .then(() => {
          toast.success('Cookie added successfully');
          onClose();
        })
        .catch((err: any) => {
          toast.error('An error occurred while adding cookie');
          console.error(err);
        });
    }
  };

  const onSubmit = async () => {
    try {
      if (isRawMode) {
        const cookieObj = await (dispatch(getParsedCookie(cookieString)) as unknown as Promise<Record<string, unknown> | null>);

        const modifiedCookie = removeEmptyValues({
          ...formik.values,
          ...cookieObj,
          expires: (cookieObj as any)?.expires
            ? moment((cookieObj as any).expires).isValid()
              ? moment((cookieObj as any).expires).toDate()
              : Infinity
            : Infinity
        });

        if (!cookieObj) {
          toast.error('Please enter a valid cookie string');
          return;
        }

        const validationErrors = await formik.setValues(
          (values: any) => ({
            ...values,
            ...modifiedCookie,

            expires:
              modifiedCookie?.expires && moment(modifiedCookie.expires).isValid()
                ? moment(new Date(modifiedCookie.expires as string | number | Date)).format(moment.HTML5_FMT.DATETIME_LOCAL)
                : ''
          }),
          true
        );

        if (!isEmpty(validationErrors)) {
          toast.error(Object.values(validationErrors as Record<string, string>).join('\n'));
          return;
        }

        handleCookieDispatch(cookie, domain, modifiedCookie, onClose);
      } else {
        formik.handleSubmit();
      }
    } catch (error: unknown) {
      const errMsg = (error as Error).message || 'An error occurred while parsing cookie string';
      toast.error(errMsg);
    }
  };

  useEffect(() => {
    if (!isRawMode) return;
    const loadCookieString = async () => {
      if (cookie) {
        const str = await (dispatch(createCookieString(cookie)) as unknown as Promise<string>);
        setCookieString(str);
      }
      return '';
    };

    loadCookieString();
  }, [cookie, isRawMode]);

  useEffect(() => {
    if (isRawMode) {
      const createCookieStr = async () => {
        const str = await (dispatch(createCookieString(formik.values)) as unknown as Promise<string>);
        setCookieString(str);
      };

      createCookieStr();
    }
  }, [isRawMode, formik.values]);

  useEffect(() => {
    if (isRawMode) {
      initialParseRef.current = false;
      return;
    }

    const setParsedCookie = async () => {
      if (!isRawMode && cookieString && !initialParseRef.current) {
        initialParseRef.current = true;

        try {
          const cookieObj = await (dispatch(getParsedCookie(cookieString)) as unknown as Promise<Record<string, unknown> | null>);

          if (!cookieObj) return;

          formik.setValues(
            (values: any) => ({
              ...values,
              ...removeEmptyValues(cookieObj),

              expires:
                (cookieObj as any)?.expires && moment((cookieObj as any).expires).isValid()
                  ? moment(new Date((cookieObj as any).expires)).format(moment.HTML5_FMT.DATETIME_LOCAL)
                  : ''
            }),
            true
          );
        } catch (error: unknown) {
          const errMsg = (error as Error).message || 'An error occurred while parsing cookie string';
          toast.error(errMsg);
        }
      }
    };

    setParsedCookie();
  }, [isRawMode, cookieString, dispatch, formik]);

  return (
    <Modal
      size="lg"
      title={title}
      onClose={onClose}
      handleCancel={onClose}
      handleConfirm={onSubmit}
      customHeader={(
        <div className="flex items-center justify-between w-full">
          <h2 className="font-bold">{title}</h2>
          <div className="ml-auto flex items-center ">
            <ToggleSwitch
              className="mr-2"
              isOn={isRawMode}
              size="2xs"
              handleToggle={(e: any) => {
                setIsRawMode(e.target.checked);
              }}
            />
            <label className="font-normal mr-4 normal-case">Edit Raw</label>
          </div>
        </div>
      )}
    >
      <StyledWrapper>
        <form onSubmit={(e) => e.preventDefault()} className="px-2">
          {isRawMode ? (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="block">Set-Cookie String</label>
                <IconInfoCircle id="cookie-raw-info" size={16} strokeWidth={1.5} className="info-icon" />
                <Tooltip
                  anchorId="cookie-raw-info"
                  className="tooltip-mod"
                  html="Key, Path, and Domain are immutable properties and cannot be modified for existing cookies"
                />
              </div>
              <textarea
                value={cookieString}
                onChange={(e) => setCookieString(e.target.value)}
                className="block textbox w-full h-24"
                placeholder="key=value; key2=value2"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1">
                    Domain<span className="required-asterisk">*</span>{' '}
                  </label>
                  <input
                    type="text"
                    name="domain"
                    // Auto-focus if its add-new i.e. when domain prop is empty
                    autoFocus={!domain && !formik.values.domain}
                    value={formik.values.domain}
                    onChange={formik.handleChange}
                    className="block textbox non-passphrase-input w-full disabled:opacity-50"
                    disabled={!!cookie}
                  />
                  {formik.touched.domain && formik.errors.domain && (
                    <div className="error-message mt-1">{formik.errors.domain as string}</div>
                  )}
                </div>
                <div>
                  <label className="block mb-1">Path</label>
                  <input
                    type="text"
                    name="path"
                    value={formik.values.path}
                    onChange={formik.handleChange}
                    className="block textbox non-passphrase-input w-full disabled:opacity-50"
                    disabled={!!cookie}
                  />
                  {formik.touched.path && formik.errors.path && (
                    <div className="error-message mt-1">{formik.errors.path as string}</div>
                  )}
                </div>
                <div>
                  <label className="block mb-1">
                    Key<span className="required-asterisk">*</span>{' '}
                  </label>
                  <input
                    type="text"
                    name="key"
                    // Auto focus when add-for-domain i.e. if domain is already prefilled
                    autoFocus={!!domain && !formik.values.key}
                    value={formik.values.key}
                    onChange={formik.handleChange}
                    className="block textbox non-passphrase-input w-full disabled:opacity-50"
                    disabled={!!cookie}
                  />
                  {formik.touched.key && formik.errors.key && (
                    <div className="error-message mt-1">{formik.errors.key as string}</div>
                  )}
                </div>

                <div>
                  <label className="block mb-1">
                    Value<span className="required-asterisk">*</span>{' '}
                  </label>
                  <input
                    type="text"
                    name="value"
                    // Auto-focus when its in edit mode i.e. cookie prop is present
                    autoFocus={!!cookie}
                    value={formik.values.value}
                    onChange={formik.handleChange}
                    className="block textbox non-passphrase-input w-full"
                  />
                  {formik.touched.value && formik.errors.value && (
                    <div className="error-message mt-1">{formik.errors.value as string}</div>
                  )}
                </div>
              </div>

              <div className="w-full flex items-end">
                <div>
                  <label className="block mb-1">Expiration ({moment.tz.guess()})</label>
                  <input
                    type="datetime-local"
                    name="expires"
                    value={formik.values.expires}
                    onChange={(e) => {
                      formik.handleChange(e);
                    }}
                    className="block textbox non-passphrase-input w-full"
                    min={moment().format(moment.HTML5_FMT.DATETIME_LOCAL)}
                  />
                  {formik.touched.expires && formik.errors.expires && (
                    <div className="error-message mt-1">{formik.errors.expires as string}</div>
                  )}
                </div>

                <div className="flex space-x-4 ml-auto">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="secure"
                      checked={formik.values.secure}
                      onChange={formik.handleChange}
                      className="mr-2"
                    />
                    <span>Secure</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="httpOnly"
                      checked={formik.values.httpOnly}
                      onChange={formik.handleChange}
                      className="mr-2"
                    />
                    <span>HTTP Only</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </form>
      </StyledWrapper>
    </Modal>
  );
};

export default ModifyCookieModal;
