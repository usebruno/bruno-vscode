import React, { useCallback, useRef, useMemo, useEffect, useState } from 'react';
import { useFormik } from 'formik';
import toast from 'react-hot-toast';
import type { DotEnvVariable } from '@bruno-types';
import { useTheme } from 'providers/Theme';
import { uuid } from 'utils/common';
import { variableNameRegex } from 'utils/common/regex';
import useDeferredLoading from 'hooks/useDeferredLoading';

import StyledWrapper from './StyledWrapper';
import DotEnvTableView from './DotEnvTableView';
import DotEnvRawView from './DotEnvRawView';
import { variablesToRaw, rawToVariables } from './utils';

interface DotEnvFileEditorProps {
  variables: DotEnvVariable[];
  content: string;
  onSave: (variables: DotEnvVariable[]) => Promise<unknown>;
  onSaveRaw: (content: string) => Promise<unknown>;
  setIsModified: (modified: boolean) => void;
  viewMode: 'table' | 'raw';
  collection?: any;
}

const emptyRow = (): DotEnvVariable => ({ uid: uuid(), name: '', value: '' });

const normalizeForComparison = (variables: DotEnvVariable[]) =>
  variables
    .filter((variable) => variable.name && variable.name.trim() !== '')
    .map(({ name, value }) => ({ name, value: value || '' }));

const DotEnvFileEditor = ({
  variables,
  content,
  onSave,
  onSaveRaw,
  setIsModified,
  viewMode,
  collection
}: DotEnvFileEditorProps) => {
  const { displayedTheme } = useTheme();
  const [rawValue, setRawValue] = useState(content);
  const [prevViewMode, setPrevViewMode] = useState(viewMode);
  const [isSaving, setIsSaving] = useState(false);
  const showSaving = useDeferredLoading(isSaving);

  const initialValues = useMemo(
    () => [...(variables || []).map((variable) => ({ ...variable, uid: variable.uid || uuid() })), emptyRow()],
    [variables]
  );

  const formik = useFormik<DotEnvVariable[]>({
    enableReinitialize: true,
    initialValues,
    validate: (values) => {
      const errors: Record<number, { name: string }> = {};
      values.forEach((variable, index) => {
        const isLastRow = index === values.length - 1;
        const isEmptyRow = !variable.name || variable.name.trim() === '';

        if (isLastRow && isEmptyRow) {
          return;
        }

        if (isEmptyRow) {
          errors[index] = { name: 'Name cannot be empty' };
        } else if (!variableNameRegex.test(variable.name)) {
          errors[index] = {
            name: 'Name contains invalid characters. Must only contain alphanumeric characters, "-", "_", "." and cannot start with a digit.'
          };
        }
      });
      return Object.keys(errors).length > 0 ? errors : {};
    },
    onSubmit: () => {}
  });

  const formikRef = useRef(formik);
  formikRef.current = formik;

  useEffect(() => {
    setRawValue(content);
  }, [content]);

  useEffect(() => {
    if (viewMode === prevViewMode) return;

    if (viewMode === 'raw') {
      const namedVars = formikRef.current.values.filter((variable) => variable.name && variable.name.trim() !== '');
      setRawValue(variablesToRaw(namedVars));
    } else {
      formikRef.current.setValues([...rawToVariables(rawValue), emptyRow()]);
    }
    setPrevViewMode(viewMode);
  }, [viewMode, prevViewMode, rawValue]);

  const savedValuesJson = useMemo(() => JSON.stringify(normalizeForComparison(variables || [])), [variables]);

  useEffect(() => {
    if (viewMode === 'raw') {
      setIsModified(rawValue !== content);
    } else {
      setIsModified(JSON.stringify(normalizeForComparison(formik.values)) !== savedValuesJson);
    }
  }, [formik.values, savedValuesJson, setIsModified, viewMode, rawValue, content]);

  const handleRemoveVar = useCallback((id: string) => {
    const currentValues = formikRef.current.values;
    if (!currentValues.length) return;

    const lastRow = currentValues[currentValues.length - 1];
    if (lastRow?.uid === id && (!lastRow.name || lastRow.name.trim() === '')) {
      return;
    }

    const filteredValues = currentValues.filter((variable) => variable.uid !== id);
    const lastFilteredRow = filteredValues[filteredValues.length - 1];
    const hasEmptyLastRow = filteredValues.length > 0 && (!lastFilteredRow.name || lastFilteredRow.name.trim() === '');

    formikRef.current.setValues(hasEmptyLastRow ? filteredValues : [...filteredValues, emptyRow()]);
  }, []);

  const handleNameChange = useCallback((index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    formikRef.current.handleChange(e);

    if (index !== formikRef.current.values.length - 1) return;

    const newVariable = emptyRow();
    setTimeout(() => {
      formikRef.current.setValues((prev) => {
        const lastRow = prev[prev.length - 1];
        return lastRow?.name?.trim() ? [...prev, newVariable] : prev;
      });
    }, 0);
  }, []);

  const handleNameBlur = useCallback((index: number) => {
    formikRef.current.setFieldTouched(`${index}.name`, true, true);
  }, []);

  const handleNameKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      formikRef.current.setFieldTouched(`${index}.name`, true, true);
    }
  }, []);

  const handleSave = useCallback(() => {
    if (isSaving) return;

    const variablesToSave = formikRef.current.values.filter((variable) => variable.name && variable.name.trim() !== '');
    const hasValidationErrors = variablesToSave.some((variable) => !variableNameRegex.test(variable.name));

    if (hasValidationErrors) {
      toast.error('Please fix validation errors before saving');
      return;
    }

    setIsSaving(true);
    onSave(variablesToSave)
      .then(() => {
        toast.success('Changes saved successfully');
        formikRef.current.resetForm({ values: [...variablesToSave, emptyRow()] });
        setIsModified(false);
      })
      .catch((error) => {
        console.error(error);
        toast.error('An error occurred while saving the changes');
      })
      .finally(() => setIsSaving(false));
  }, [isSaving, onSave, setIsModified]);

  const handleSaveRaw = useCallback(() => {
    if (isSaving) return;

    setIsSaving(true);
    onSaveRaw(rawValue)
      .then(() => {
        toast.success('Changes saved successfully');
        setIsModified(false);
      })
      .catch((error) => {
        console.error(error);
        toast.error('An error occurred while saving the changes');
      })
      .finally(() => setIsSaving(false));
  }, [isSaving, rawValue, onSaveRaw, setIsModified]);

  const handleReset = useCallback(() => {
    if (viewMode === 'raw') {
      setRawValue(content);
    } else {
      const originalVars = (variables || []).map((variable) => ({ ...variable, uid: variable.uid || uuid() }));
      formikRef.current.resetForm({ values: [...originalVars, emptyRow()] });
    }
    setIsModified(false);
  }, [viewMode, content, variables, setIsModified]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = viewMode === 'raw' ? handleSaveRaw : handleSave;

  useEffect(() => {
    const handleSaveEvent = () => handleSaveRef.current();

    window.addEventListener('dotenv-save', handleSaveEvent);
    return () => window.removeEventListener('dotenv-save', handleSaveEvent);
  }, []);

  if (viewMode === 'raw') {
    return (
      <StyledWrapper>
        <DotEnvRawView
          collection={collection}
          theme={displayedTheme}
          value={rawValue}
          onChange={setRawValue}
          onSave={handleSaveRaw}
          onReset={handleReset}
          isSaving={showSaving}
        />
      </StyledWrapper>
    );
  }

  return (
    <StyledWrapper>
      <DotEnvTableView
        formik={formik}
        theme={displayedTheme}
        onNameChange={handleNameChange}
        onNameBlur={handleNameBlur}
        onNameKeyDown={handleNameKeyDown}
        onRemoveVar={handleRemoveVar}
        onSave={handleSave}
        onReset={handleReset}
        isSaving={showSaving}
      />
    </StyledWrapper>
  );
};

export default DotEnvFileEditor;
