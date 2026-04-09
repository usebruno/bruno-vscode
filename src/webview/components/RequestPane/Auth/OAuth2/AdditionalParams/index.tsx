import { useDispatch } from 'react-redux';
import React, { useState } from 'react';
import get from 'lodash/get';
import { useTheme } from 'providers/Theme';
import { IconPlus, IconTrash, IconAdjustmentsHorizontal } from '@tabler/icons';
import { cloneDeep } from 'lodash';
import SingleLineEditor from 'components/SingleLineEditor/index';
import MultiLineEditor from 'components/MultiLineEditor/index';
import StyledWrapper from './StyledWrapper';
import Table from 'components/Table/index';

interface AdditionalParamsProps {
  updatedAdditionalParameters?: React.ReactNode;
  paramType?: unknown;
  key?: string;
  paramIndex?: number;
  value?: unknown;
}

const AdditionalParams = ({
  item = {},
  request,
  updateAuth,
  collection,
  handleSave
}: any) => {
  const dispatch = useDispatch();
  const { storedTheme } = useTheme();

  const oAuth = get(request, 'auth.oauth2', {});
  const {
    grantType,
    additionalParameters = {}
  } = oAuth;

  const [activeTab, setActiveTab] = useState(
    (grantType == 'authorization_code' || grantType == 'implicit') ? 'authorization' : 'token'
  );

  const isEmptyParam = (param: any) => {
    return !param.name.trim() && !param.value.trim();
  };

  const hasEmptyRow = () => {
    const tabParams = additionalParameters[activeTab] || [];
    return tabParams.some(isEmptyParam);
  };

  const updateAdditionalParameters = ({
    updatedAdditionalParameters
  }: any) => {
    const filteredParams = cloneDeep(updatedAdditionalParameters);

    Object.keys(filteredParams).forEach((paramType) => {
      if (filteredParams[paramType]?.length) {
        filteredParams[paramType] = filteredParams[paramType].filter((param: any) => param.name.trim() || param.value.trim()
        );

        if (filteredParams[paramType].length === 0) {
          delete filteredParams[paramType];
        }
      } else if (Array.isArray(filteredParams[paramType]) && filteredParams[paramType].length === 0) {
        delete filteredParams[paramType];
      }
    });

    dispatch(
      updateAuth({
        mode: 'oauth2',
        collectionUid: collection.uid,
        itemUid: item.uid,
        content: {
          ...oAuth,
          additionalParameters: Object.keys(filteredParams).length > 0 ? filteredParams : undefined
        }
      })
    );
  };

  const handleUpdateAdditionalParam = ({
    paramType,
    key,
    paramIndex,
    value
  }: any) => {
    const updatedAdditionalParameters = cloneDeep(additionalParameters);

    if (!updatedAdditionalParameters[paramType]) {
      updatedAdditionalParameters[paramType] = [];
    }

    if (!updatedAdditionalParameters[paramType][paramIndex]) {
      updatedAdditionalParameters[paramType][paramIndex] = {
        name: '',
        value: '',
        sendIn: 'headers',
        enabled: true
      };
    }

    updatedAdditionalParameters[paramType][paramIndex][key] = value;

    updateAdditionalParameters({ updatedAdditionalParameters });
  };

  const handleDeleteAdditionalParam = ({
    paramType,
    paramIndex
  }: any) => {
    const updatedAdditionalParameters = cloneDeep(additionalParameters);

    if (updatedAdditionalParameters[paramType]?.length) {
      updatedAdditionalParameters[paramType] = updatedAdditionalParameters[paramType].filter((_: any, index: any) => index !== paramIndex);

      // If the array is now empty, ensure we're not sending empty arrays
      if (updatedAdditionalParameters[paramType].length === 0) {
        delete updatedAdditionalParameters[paramType];
      }
    }

    updateAdditionalParameters({ updatedAdditionalParameters });
  };

  const handleAddNewAdditionalParam = () => {
    if (hasEmptyRow()) {
      return;
    }

    const paramType = activeTab;
    const localAdditionalParameters = cloneDeep(additionalParameters);

    if (!localAdditionalParameters[paramType]) {
      localAdditionalParameters[paramType] = [];
    }

    localAdditionalParameters[paramType] = [
      ...localAdditionalParameters[paramType],
      {
        name: '',
        value: '',
        sendIn: 'headers',
        enabled: true
      }
    ];

    // Don't filter here to allow the empty row to display in UI
    // But don't permanently store it in state until it has values
    dispatch(
      updateAuth({
        mode: 'oauth2',
        collectionUid: collection.uid,
        itemUid: item.uid,
        content: {
          ...oAuth,
          additionalParameters: localAdditionalParameters
        }
      })
    );
  };

  const addButtonDisabled = hasEmptyRow();

  const getAvailableTabs = (grantType: any) => {
    const tabConfig: Record<string, string[]> = {
      authorization_code: ['authorization', 'token', 'refresh'],
      implicit: ['authorization'],
      password: ['token', 'refresh'],
      client_credentials: ['token', 'refresh']
    };
    return tabConfig[grantType] || ['token', 'refresh'];
  };

  const availableTabs = getAvailableTabs(grantType);

  const renderTab = (tabKey: any, tabLabel: any) => (
    <div
      key={tabKey}
      className={`tab ${activeTab === tabKey ? 'active' : ''}`}
      onClick={() => setActiveTab(tabKey)}
    >
      {tabLabel}
    </div>
  );

  return (
    <StyledWrapper className="mt-4 oauth2-additional-params-wrapper">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="flex items-center px-2.5 py-1.5 oauth2-icon-container rounded-md">
          <IconAdjustmentsHorizontal size={14} className="oauth2-icon" />
        </div>
        <span className="oauth2-section-label">
          Additional Parameters
        </span>
      </div>

      <div className="tabs flex w-full gap-2 my-2">
        {availableTabs.includes('authorization') && renderTab('authorization', 'Authorization')}
        {availableTabs.includes('token') && renderTab('token', 'Token')}
        {availableTabs.includes('refresh') && renderTab('refresh', 'Refresh')}
      </div>
      <Table
        headers={[
          { name: 'Key', accessor: 'name', width: '30%' },
          { name: 'Value', accessor: 'value', width: '30%' },
          { name: 'Send In', accessor: 'sendIn', width: '150px' },
          { name: '', accessor: '', width: '15%' }
        ]}
      >
        <tbody>
          {(additionalParameters?.[activeTab] || []).map((param: any, index: any) => (
            <tr key={index}>
              <td className="flex relative">
                <SingleLineEditor
                  value={param?.name || ''}
                  theme={storedTheme}
                  onChange={(value: any) => handleUpdateAdditionalParam({
                    paramType: activeTab,
                    key: 'name',
                    paramIndex: index,
                    value
                  })}
                  collection={collection}
                  onSave={handleSave}
                  isCompact
                />
              </td>
              <td>
                <MultiLineEditor
                  value={param?.value || ''}
                  theme={storedTheme}
                  onChange={(value: any) => handleUpdateAdditionalParam({
                    paramType: activeTab,
                    key: 'value',
                    paramIndex: index,
                    value
                  })}
                  collection={collection}
                  onSave={handleSave}
                />
              </td>
              <td>
                <div className="w-full additional-parameter-sends-in-selector">
                  <select
                    value={param?.sendIn || 'headers'}
                    onChange={(e) => {
                      handleUpdateAdditionalParam({
                        paramType: activeTab,
                        key: 'sendIn',
                        paramIndex: index,
                        value: e.target.value
                      });
                    }}
                    className="mousetrap bg-transparent"
                  >
                    {(sendInOptionsMap[grantType || 'authorization_code']?.[activeTab] || ['headers', 'queryparams', 'body']).map((optionValue: any) => <option key={optionValue} value={optionValue}>
                      {optionValue}
                    </option>)}
                  </select>
                </div>
              </td>
              <td>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={param?.enabled ?? true}
                    tabIndex={-1}
                    className="mr-3 mousetrap"
                    onChange={(e) => {
                      handleUpdateAdditionalParam({
                        paramType: activeTab,
                        key: 'enabled',
                        paramIndex: index,
                        value: e.target.checked
                      });
                    }}
                  />
                  <button
                    tabIndex={-1}
                    onClick={() => {
                      handleDeleteAdditionalParam({
                        paramType: activeTab,
                        paramIndex: index
                      });
                    }}
                  >
                    <IconTrash strokeWidth={1.5} size={20} />
                  </button>
                </div>
              </td>
            </tr>
          )
          )}
        </tbody>
      </Table>
      <div
        className={`add-additional-param-actions w-fit flex items-center mt-2 ${addButtonDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        onClick={addButtonDisabled ? null : handleAddNewAdditionalParam}
      >
        <IconPlus size={16} strokeWidth={1.5} style={{ marginLeft: '2px' }} />
        <span className="ml-1 text-gray-500">Add Parameter</span>
      </div>
    </StyledWrapper>
  );
};

export default AdditionalParams;

const sendInOptionsMap: Record<string, Record<string, string[]>> = {
  authorization_code: {
    authorization: ['headers', 'queryparams'],
    token: ['headers', 'queryparams', 'body'],
    refresh: ['headers', 'queryparams', 'body']
  },
  password: {
    token: ['headers', 'queryparams', 'body'],
    refresh: ['headers', 'queryparams', 'body']
  },
  client_credentials: {
    token: ['headers', 'queryparams', 'body'],
    refresh: ['headers', 'queryparams', 'body']
  },
  implicit: {
    authorization: ['headers', 'queryparams']
  }
};
