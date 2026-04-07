import React, { useCallback } from 'react';
import get from 'lodash/get';
import { useDispatch } from 'react-redux';
import { useTheme } from 'providers/Theme';
import { moveAssertion, setRequestAssertions } from 'providers/ReduxStore/slices/collections';
import { sendRequest, saveRequest } from 'providers/ReduxStore/slices/collections/actions';
import SingleLineEditor from 'components/SingleLineEditor';
import AssertionOperator from './AssertionOperator';
import EditableTable from 'components/EditableTable';
import StyledWrapper from './StyledWrapper';
import { variableNameRegex } from 'utils/common/regex';

interface unaryOperatorsProps {
  item?: React.ReactNode;
  collection?: React.ReactNode;
}


const unaryOperators = [
  'isEmpty',
  'isNotEmpty',
  'isNull',
  'isUndefined',
  'isDefined',
  'isTruthy',
  'isFalsy',
  'isJson',
  'isNumber',
  'isString',
  'isBoolean',
  'isArray'
];

const parseAssertionOperator = (str = '') => {
  if (!str || typeof str !== 'string' || !str.length) {
    return { operator: 'eq', value: str };
  }

  const operators = [
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'notIn',
    'contains', 'notContains', 'length', 'matches', 'notMatches',
    'startsWith', 'endsWith', 'between', ...unaryOperators
  ];

  const [operator, ...rest] = str.split(' ');
  const value = rest.join(' ');

  if (unaryOperators.includes(operator)) {
    return { operator, value: '' };
  }

  if (operators.includes(operator)) {
    return { operator, value };
  }

  return { operator: 'eq', value: str };
};

const isUnaryOperator = (operator: any) => unaryOperators.includes(operator);

const Assertions = ({
  item,
  collection
}: any) => {
  const dispatch = useDispatch();
  const { storedTheme } = useTheme();
  const assertions = item.draft ? get(item, 'draft.request.assertions') : get(item, 'request.assertions');

  const onSave = () => dispatch(saveRequest(item.uid, collection.uid));
  const handleRun = () => dispatch(sendRequest(item, collection.uid));

  const handleAssertionsChange = useCallback((updatedAssertions: any) => {
    dispatch(setRequestAssertions({
      collectionUid: collection.uid,
      itemUid: item.uid,
      assertions: updatedAssertions
    }));
  }, [dispatch, collection.uid, item.uid]);

  const handleAssertionDrag = useCallback(({
    updateReorderedItem
  }: any) => {
    dispatch(moveAssertion({
      collectionUid: collection.uid,
      itemUid: item.uid,
      updateReorderedItem
    }));
  }, [dispatch, collection.uid, item.uid]);

  const getRowError = useCallback((row: any, index: any, key: any) => {
    if (key !== 'name') return null;
    if (!row.name || row.name.trim() === '') return null;
    if (!variableNameRegex.test(row.name)) {
      return 'Expression contains invalid characters. Must only contain alphanumeric characters, "-", "_", "."';
    }
    return null;
  }, []);

  const columns = [
    {
      key: 'name',
      name: 'Expr',
      isKeyField: true,
      placeholder: 'Expr',
      width: '30%'
    },
    {
      key: 'operator',
      name: 'Operator',
      width: '120px',
      getValue: (row: any) => parseAssertionOperator(row.value).operator,
      render: ({
        row,
        rowIndex,
        isLastEmptyRow
      }: any) => {
        const { operator } = parseAssertionOperator(row.value);
        const assertionValue = parseAssertionOperator(row.value).value;

        const handleOperatorChange = (newOperator: any) => {
          const currentAssertions = assertions || [];
          const existingAssertion = currentAssertions.find((a: any) => a.uid === row.uid);
          const newValue = isUnaryOperator(newOperator) ? newOperator : `${newOperator} ${assertionValue}`;

          if (existingAssertion) {
            const updatedAssertions = currentAssertions.map((assertion: any) => {
              if (assertion.uid === row.uid) {
                return {
                  ...assertion,
                  value: newValue
                };
              }
              return assertion;
            });
            handleAssertionsChange(updatedAssertions);
          } else {
            handleAssertionsChange([...currentAssertions, { ...row, value: newValue }]);
          }
        };

        return (
          <AssertionOperator
            operator={operator}
            onChange={handleOperatorChange}
          />
        );
      }
    },
    {
      key: 'value',
      name: 'Value',
      width: '30%',
      render: ({
        row,
        value,
        onChange,
        isLastEmptyRow
      }: any) => {
        const { operator, value: assertionValue } = parseAssertionOperator(value);

        if (isUnaryOperator(operator)) {
          return <input type="text" className="cursor-default" disabled />;
        }

        return (
          <SingleLineEditor
            value={assertionValue}
            theme={storedTheme}
            onSave={onSave}
            onChange={(newValue: any) => onChange(`${operator} ${newValue}`)}
            onRun={handleRun}
            collection={collection}
            item={item}
            placeholder={isLastEmptyRow ? 'Value' : ''}
          />
        );
      }
    }
  ];

  const defaultRow = {
    name: '',
    value: 'eq ',
    operator: 'eq'
  };

  return (
    <StyledWrapper className="w-full">
      <EditableTable
        columns={columns}
        rows={assertions || []}
        onChange={handleAssertionsChange}
        defaultRow={defaultRow}
        getRowError={getRowError}
        reorderable={true}
        onReorder={handleAssertionDrag}
        testId="assertions-table"
      />
    </StyledWrapper>
  );
};

export default Assertions;
