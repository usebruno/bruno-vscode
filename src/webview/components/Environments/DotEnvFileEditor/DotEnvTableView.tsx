import React from 'react';
import { IconTrash } from '@tabler/icons';
import MultiLineEditor from 'components/MultiLineEditor/index';
import VariableNameError from 'components/Environments/Common/VariableNameError';

interface DotEnvTableViewProps {
  formik: any;
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
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <td>Name</td>
            <td>Value</td>
            <td className="delete-col"></td>
          </tr>
        </thead>
        <tbody>
          {formik.values.map((variable: any, index: number) => {
            const isLastRow = index === formik.values.length - 1;
            const isEmptyRow = !variable.name || variable.name.trim() === '';
            const isLastEmptyRow = isLastRow && isEmptyRow;

            return (
              <tr key={variable.uid} data-testid={`dotenv-var-row-${variable.name}`}>
                <td>
                  <div className="flex items-center">
                    <input
                      type="text"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      className="mousetrap"
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
                <td className="flex flex-row flex-nowrap items-center">
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
                <td className="delete-col">
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
