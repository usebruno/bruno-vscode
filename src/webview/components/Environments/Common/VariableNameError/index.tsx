import React from 'react';
import { IconAlertCircle } from '@tabler/icons';
import { Tooltip } from 'react-tooltip';

interface VariableNameErrorProps {
  formik: any;
  name: string;
  index: number;
}

const VariableNameError = ({ formik, name, index }: VariableNameErrorProps) => {
  const meta = formik.getFieldMeta(name);
  const id = `error-${name}-${index}`;

  const isLastRow = index === formik.values.length - 1;
  const variable = formik.values[index];
  const isEmptyRow = !variable?.name || variable.name.trim() === '';

  if ((isLastRow && isEmptyRow) || !meta.error || !meta.touched) {
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
