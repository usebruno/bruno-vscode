import React from 'react';
import { flattenItems } from 'utils/collections';
import { IconAlertTriangle } from '@tabler/icons';
import StyledWrapper from './StyledWrapper';
import { useDispatch, useSelector } from 'react-redux';
import { isItemARequest, itemIsOpenedInTabs } from 'utils/tabs/index';
import { getDefaultRequestPaneTab } from 'utils/collections/index';
import { addTab, focusTab } from 'providers/ReduxStore/slices/tabs';
import { RootState } from 'providers/ReduxStore';
import { isSidebarMode, openRequestInVSCodeEditor } from 'utils/webviewMode';

interface RequestsNotLoadedProps {
  collection: React.ReactNode;
}


const RequestsNotLoaded = ({
  collection
}: any) => {
  const dispatch = useDispatch();
  const tabs = useSelector((state: RootState) => state.tabs.tabs);
  const flattenedItems = flattenItems(collection.items);
  // `partial` is the normal lazy-load state, not a failure; only errored requests are "not loaded".
  const itemsFailedLoading = flattenedItems?.filter((item: any) => isItemARequest(item) && item?.error);

  if (!itemsFailedLoading?.length) {
    return null;
  }

  const handleRequestClick = (item: any) => (e: any) => {
    e.preventDefault();
    if (!isItemARequest(item)) {
      return;
    }

    if (isSidebarMode()) {
      openRequestInVSCodeEditor(item.pathname);
      return;
    }

    if (itemIsOpenedInTabs(item, tabs as any)) {
      dispatch(
        focusTab({
          uid: item.uid
        })
      );
      return;
    }
    dispatch(
      addTab({
        uid: item.uid,
        collectionUid: collection.uid,
        requestPaneTab: getDefaultRequestPaneTab(item)
      })
    );
  };

  return (
    <StyledWrapper className="w-full card my-2" data-testid="collection-requests-not-loaded">
      <div className="flex items-center gap-2 px-3 py-2 title">
        <IconAlertTriangle size={16} className="warning-icon" />
        <span className="font-medium">Following requests were not loaded</span>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="py-2 px-3 text-left font-medium">
              Pathname
            </th>
            <th className="py-2 px-3 text-left font-medium">
              Size
            </th>
          </tr>
        </thead>
        <tbody>
          {flattenedItems?.map((item: any, index: any) => (
            isItemARequest(item) && item?.error ? (
              <tr key={index} className="cursor-pointer" onClick={handleRequestClick(item)}>
                <td className="py-1.5 px-3">
                  {item?.pathname?.split(`${collection?.pathname}/`)?.[1]}
                </td>
                <td className="py-1.5 px-3">
                  {item?.size?.toFixed?.(2)}&nbsp;MB
                </td>
              </tr>
            ) : null
          ))}
        </tbody>
      </table>
    </StyledWrapper>
  );
};

export default RequestsNotLoaded;
