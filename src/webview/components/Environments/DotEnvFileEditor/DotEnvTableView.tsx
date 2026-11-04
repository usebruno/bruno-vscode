import React from 'react';
import type { useFormik } from 'formik';
import type { DotEnvVariable } from '@bruno-types';
import { IconTrash } from '@tabler/icons';
import MultiLineEditor from 'components/MultiLineEditor/index';
import VariableNameError from 'components/Environments/Common/VariableNameError';

interface DotEnvTableViewProps {
  formik: ReturnType<typeof useFormik<DotEnvVariable[]>>;
  theme: 'dark' | 'light';
  onNameChange: (index: number, e: React.ChangeEvent<HTMLInputElement>) => void;
  onNameBlur: (index: number) => void;
  onNameKeyDown: (index: number, e: React.KeyboardEvent<HTMLInputElement>) => void;
  onRemoveVar: (uid: string) => void;
  onSave: () => void;
  onReset: () => void;
  isSaving: boolean;
}

const DotEnvTableView = ({
  formik,
  theme,
  onNameChange,
  onNameBlur,
  onNameKeyDown,
  onRemoveVar,
  onSave,
  onReset,
  isSaving
}: DotEnvTableViewProps) => (
  <>
    <div className="table-container overflow-y-auto rounded-lg">
      <table className="w-full border-collapse table-fixed text-[12px]">
        <thead>
          <tr>
            <td className="w-[35%] px-[10px] py-[5px]">Name</td>
            <td className="px-[10px] py-[5px]">Value</td>
            <td className="w-10 px-[10px] py-[5px]"></td>
          </tr>
        </thead>
        <tbody>
          {formik.values.map((variable, index) => {
            const isLastRow = index === formik.values.length - 1;
            const isEmptyRow = !variable.name || variable.name.trim() === '';
            const isLastEmptyRow = isLastRow && isEmptyRow;

            return (
              <tr key={variable.uid} data-testid={isLastEmptyRow ? 'dotenv-var-row-new' : `dotenv-var-row-${variable.name}`}>
                <td className="align-middle px-[10px] py-[2px]">
                  <div className="flex items-center">
                    <input
                      type="text"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      className="mousetrap w-full p-0 bg-transparent border border-transparent rounded !outline-none transition-all duration-150"
                      id={`${index}.name`}
                      name={`${index}.name`}
                      value={variable.name}
                      placeholder={isLastEmptyRow ? 'Name' : ''}
                      onChange={(e) => onNameChange(index, e)}
                      onBlur={() => onNameBlur(index)}
                      onKeyDown={(e) => onNameKeyDown(index, e)}
                    />
                    <VariableNameError formik={formik} name={`${index}.name`} index={index} />
                  </div>
                </td>
                <td className="flex flex-row flex-nowrap items-center px-[10px] py-[2px]">
                  <div className="overflow-hidden grow w-full relative">
                    <MultiLineEditor
                      theme={theme}
                      value={variable.value}
                      placeholder={isLastEmptyRow ? 'Value' : ''}
                      onChange={(newValue: string) => formik.setFieldValue(`${index}.value`, newValue, true)}
                      onSave={onSave}
                    />
                  </div>
                </td>
                <td className="w-10 px-1 py-[2px] align-middle text-center">
                  {!isLastEmptyRow && (
                    <button type="button" aria-label="Delete variable" onClick={() => onRemoveVar(variable.uid)}>
                      <IconTrash strokeWidth={1.5} size={18} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    <div className="button-container">
      <div className="flex items-center">
        <button type="button" className="submit" onClick={onSave} disabled={isSaving} data-testid="save-dotenv">
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" className="submit reset ml-2" onClick={onReset} disabled={isSaving} data-testid="reset-dotenv">
          Reset
        </button>
      </div>
    </div>
  </>
);

export default DotEnvTableView;
