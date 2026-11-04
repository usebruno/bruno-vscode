import React, { useEffect, useCallback, useRef } from 'react';
import get from 'lodash/get';
import isEqual from 'lodash/isEqual';
import debounce from 'lodash/debounce';
import { useFormik } from 'formik';
import { useSelector, useDispatch } from 'react-redux';
import { savePreferences } from 'providers/ReduxStore/slices/app';
import { browseFiles } from 'providers/ReduxStore/slices/collections/actions';
import StyledWrapper from './StyledWrapper';
import SettingCheckbox from '../SettingCheckbox';
import * as Yup from 'yup';
import toast from 'react-hot-toast';
import path from 'utils/common/path';
import { IconFileCertificate, IconTrash } from '@tabler/icons';

const General = () => {
  const preferences = useSelector((state: any) => state.app.preferences);
  const dispatch = useDispatch();

  const preferencesSchema = Yup.object().shape({
    sslVerification: Yup.boolean(),
    customCaCertificate: Yup.object({
      enabled: Yup.boolean(),
      filePath: Yup.string().nullable()
    }),
    keepDefaultCaCertificates: Yup.object({
      enabled: Yup.boolean()
    }),
    storeCookies: Yup.boolean(),
    sendCookies: Yup.boolean(),
    timeout: Yup.mixed()
      .transform((value, originalValue) => {
        return originalValue === '' ? undefined : value;
      })
      .nullable()
      .test('isNumber', 'Request Timeout must be a number', (value) => {
        return value === undefined || !isNaN(value);
      })
      .test('isValidTimeout', 'Request Timeout must be equal or greater than 0', (value) => {
        return value === undefined || Number(value) >= 0;
      }),
    autoSave: Yup.object({
      enabled: Yup.boolean(),
      interval: Yup.mixed()
        .transform((value, originalValue) => {
          return originalValue === '' ? undefined : value;
        })
        .test('isNumber', 'Save Delay must be a number', (value) => {
          return value === undefined || !isNaN(value);
        })
        .test('isValidInterval', 'Save Delay must be at least 100ms', (value) => {
          return value === undefined || Number(value) >= 100;
        })
    }).test('intervalRequired', 'Save Delay is required when Auto Save is enabled', (value) => {
      // If autosave is enabled, interval must be provided
      if (value.enabled && (value.interval === undefined || value.interval === '')) {
        return false;
      }
      return true;
    })
  });

  const formik = useFormik({
    initialValues: {
      sslVerification: preferences.request.sslVerification,
      customCaCertificate: {
        enabled: get(preferences, 'request.customCaCertificate.enabled', false),
        filePath: get(preferences, 'request.customCaCertificate.filePath', null)
      },
      keepDefaultCaCertificates: {
        enabled: get(preferences, 'request.keepDefaultCaCertificates.enabled', true)
      },
      timeout: preferences.request.timeout,
      storeCookies: get(preferences, 'request.storeCookies', true),
      sendCookies: get(preferences, 'request.sendCookies', true),
      autoSave: {
        enabled: get(preferences, 'autoSave.enabled', false),
        interval: get(preferences, 'autoSave.interval', 1000)
      }
    },
    validationSchema: preferencesSchema,
    onSubmit: async (values) => {
      try {
        const newPreferences = await preferencesSchema.validate(values, { abortEarly: true });
        handleSave(newPreferences);
      } catch (error) {
        console.error('Preferences validation error:', error.message);
      }
    }
  });

  const handleSave = useCallback((newPreferences: any) => {
    return (dispatch(
      savePreferences({
        ...preferences,
        request: {
          sslVerification: newPreferences.sslVerification,
          customCaCertificate: {
            enabled: newPreferences.customCaCertificate.enabled,
            filePath: newPreferences.customCaCertificate.filePath
          },
          keepDefaultCaCertificates: {
            enabled: newPreferences.keepDefaultCaCertificates.enabled
          },
          timeout: newPreferences.timeout,
          storeCookies: newPreferences.storeCookies,
          sendCookies: newPreferences.sendCookies,
          oauth2: get(preferences, 'request.oauth2', { useSystemBrowser: true })
        },
        autoSave: {
          enabled: newPreferences.autoSave.enabled,
          interval: newPreferences.autoSave.interval
        },
        general: get(preferences, 'general', { defaultCollectionLocation: '' })
      })) as unknown as Promise<void>)
      .then(() => true)
      .catch((err: any) => {
        toast.error('Failed to update preferences');
        return false;
      });
  }, [dispatch, preferences]);

  const lastSavedValues = useRef(formik.initialValues);

  const debouncedSave = useCallback(
    debounce((values) => {
      preferencesSchema.validate(values, { abortEarly: true })
        .then((validatedValues) => {
          // Record before saving: the save updates the store (re-running the effect below) before it resolves.
          const previous = lastSavedValues.current;
          lastSavedValues.current = values;
          return handleSave(validatedValues).then((saved) => {
            if (!saved) {
              lastSavedValues.current = previous;
            }
          });
        })
        .catch((error) => {
        });
    }, 500),
    [handleSave]
  );

  useEffect(() => {
    if (formik.isValid && !isEqual(formik.values, lastSavedValues.current)) {
      debouncedSave(formik.values);
    }
    return () => {
      debouncedSave.cancel();
    };
  }, [formik.values, formik.isValid, debouncedSave]);

  const addCaCertificate = () => {
    (dispatch(browseFiles([], ['openFile'])) as unknown as Promise<string[]>)
      .then((filePaths) => {
        const filePath = filePaths?.[0];
        if (filePath) {
          formik.setFieldValue('customCaCertificate.filePath', filePath);
        }
      })
      .catch((error: any) => console.error(error));
  };

  const deleteCaCertificate = () => {
    formik.setFieldValue('customCaCertificate.filePath', null);
  };

  const caEnabled = formik.values.customCaCertificate.enabled;
  const caFilePath = formik.values.customCaCertificate.filePath;
  const canKeepDefaultCas = caEnabled && !!caFilePath;
  const autoSaveError =
    (typeof formik.errors.autoSave === 'string' && formik.errors.autoSave)
    || (formik.errors.autoSave as any)?.interval;

  return (
    <StyledWrapper className="w-full">
      <form className="bruno-form" onSubmit={formik.handleSubmit}>
        <div className="settings-section">
          <div className="section-title">Requests</div>
          <SettingCheckbox
            id="sslVerification"
            name="sslVerification"
            label="SSL/TLS Certificate Verification"
            description="Verify server certificates when sending HTTPS requests."
            checked={formik.values.sslVerification}
            onChange={formik.handleChange}
          />
          <div className="setting">
            <label className="setting-label" htmlFor="timeout">Request Timeout (ms)</label>
            <div className="setting-description">Maximum time to wait for a response. Use 0 for no timeout.</div>
            <div className="setting-control">
              <input
                id="timeout"
                type="text"
                name="timeout"
                className={`form-input input-sm ${formik.errors.timeout ? 'error' : ''}`}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                value={formik.values.timeout}
              />
            </div>
            {formik.touched.timeout && formik.errors.timeout ? (
              <div className="form-error">{formik.errors.timeout as string}</div>
            ) : null}
          </div>
        </div>

        <div className="settings-section">
          <div className="section-title">Certificates</div>
          <SettingCheckbox
            id="customCaCertificateEnabled"
            name="customCaCertificate.enabled"
            label="Use Custom CA Certificate"
            description="Trust an additional certificate authority, e.g. for internal or self-signed servers."
            checked={caEnabled}
            onChange={formik.handleChange}
          />
          <div className={`setting setting-nested ${caEnabled ? '' : 'disabled'}`}>
            <div className="setting-control">
              {caFilePath ? (
                <span className="file-chip" title={caFilePath}>
                  <span className="file-name">{path.basename(caFilePath)}</span>
                  <button
                    type="button"
                    aria-label="Remove CA certificate"
                    disabled={!caEnabled}
                    onClick={deleteCaCertificate}
                  >
                    <IconTrash strokeWidth={1.5} size={14} />
                  </button>
                </span>
              ) : (
                <button type="button" className="btn-secondary" disabled={!caEnabled} onClick={addCaCertificate}>
                  <IconFileCertificate size={16} strokeWidth={1.5} />
                  Select Certificate File
                </button>
              )}
            </div>
          </div>
          <SettingCheckbox
            id="keepDefaultCaCertificatesEnabled"
            name="keepDefaultCaCertificates.enabled"
            label="Keep Default CA Certificates"
            description="Continue trusting the system CA certificates alongside the custom one."
            checked={formik.values.keepDefaultCaCertificates.enabled}
            disabled={!canKeepDefaultCas}
            onChange={formik.handleChange}
          />
        </div>

        <div className="settings-section">
          <div className="section-title">Cookies</div>
          <SettingCheckbox
            id="storeCookies"
            name="storeCookies"
            label="Store Cookies Automatically"
            description="Save cookies received in responses."
            checked={formik.values.storeCookies}
            onChange={formik.handleChange}
          />
          <SettingCheckbox
            id="sendCookies"
            name="sendCookies"
            label="Send Cookies Automatically"
            description="Attach stored cookies to matching requests."
            checked={formik.values.sendCookies}
            onChange={formik.handleChange}
          />
        </div>

        <div className="settings-section">
          <div className="section-title">Auto Save</div>
          <SettingCheckbox
            id="autoSaveEnabled"
            name="autoSave.enabled"
            label="Enable Auto Save"
            description="Save request changes automatically after you stop editing."
            checked={formik.values.autoSave.enabled}
            onChange={formik.handleChange}
          />
          <div className={`setting setting-nested ${formik.values.autoSave.enabled ? '' : 'disabled'}`}>
            <label className="setting-label" htmlFor="autoSaveInterval">Save Delay (ms)</label>
            <div className="setting-description">How long to wait after the last change before saving.</div>
            <div className="setting-control">
              <input
                type="text"
                name="autoSave.interval"
                id="autoSaveInterval"
                className={`form-input input-sm ${autoSaveError ? 'error' : ''}`}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                value={formik.values.autoSave.interval}
                disabled={!formik.values.autoSave.enabled}
              />
            </div>
            {formik.touched.autoSave && autoSaveError ? (
              <div className="form-error">{autoSaveError as string}</div>
            ) : null}
          </div>
        </div>

      </form>
    </StyledWrapper>
  );
};

export default General;
