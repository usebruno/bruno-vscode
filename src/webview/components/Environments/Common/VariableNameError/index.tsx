import React from 'react';
import type { FormikProps } from 'formik';
import { IconAlertCircle } from '@tabler/icons';
import { Tooltip } from 'react-tooltip';

interface VariableNameErrorProps {
  formik: Pick<FormikProps<{ name?: string | null }[]>, 'values' | 'getFieldMeta'>;
  name: string;
  index: number;
}

const VariableNameError = ({ formik, name, index }: VariableNameErrorProps) => {
  const meta = formik.getFieldMeta(name);
  const id = `error-${name}-${index}`;

  const isLastRow = index === formik.values.length - 1;
  const isTrailingEmptyRow = isLastRow && !formik.values[index]?.name?.trim();
  if (!meta.touched || !meta.error || isTrailingEmptyRow) {
    return null;
  }

  return (
    <span>
      <IconAlertCircle id={id} className="text-red-600 cursor-pointer" size={20} />
      <Tooltip className="tooltip-mod" anchorId={id} html={meta.error || ''} />
    </span>
  );
};

export default VariableNameError;
