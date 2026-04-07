import React, { useCallback, useEffect } from 'react';
import get from 'lodash/get';
import { useDispatch } from 'react-redux';
import { addRequestTag, deleteRequestTag, updateCollectionTagsList } from 'providers/ReduxStore/slices/collections';
import { makeTabPermanent } from 'providers/ReduxStore/slices/tabs';
import TagList from 'components/TagList/index';
import { saveRequest } from 'providers/ReduxStore/slices/collections/actions';

interface TagsProps {
  item: unknown;
  collection: unknown;
}

const Tags = ({
  item,
  collection
}: any) => {
  const dispatch = useDispatch();
  // all tags in the collection
  const collectionTags = collection.allTags || [];

  const tags = item.draft ? get(item, 'draft.tags', []) : get(item, 'tags', []);

  const collectionTagsWithoutCurrentRequestTags = collectionTags?.filter((tag: any) => !tags.includes(tag)) || [];

  const handleAdd = useCallback((tag: any) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      dispatch(
        addRequestTag({
          tag: trimmedTag,
          itemUid: item.uid,
          collectionUid: collection.uid
        })
      );
      dispatch(makeTabPermanent({ uid: item.uid }));
    }
  }, [dispatch, tags, item.uid, collection.uid]);

  const handleRemove = useCallback((tag: any) => {
    dispatch(
      deleteRequestTag({
        tag,
        itemUid: item.uid,
        collectionUid: collection.uid
      })
    );
    dispatch(makeTabPermanent({ uid: item.uid }));
  }, [dispatch, item.uid, collection.uid]);

  const handleRequestSave = () => {
    dispatch(saveRequest(item.uid, collection.uid));
  };

  useEffect(() => {
    dispatch(updateCollectionTagsList({ collectionUid: collection.uid }));
  }, [collection.uid, dispatch]);

  return (
    <div className="flex flex-col">
      <TagList
        tagsHintList={collectionTagsWithoutCurrentRequestTags}
        handleAddTag={handleAdd}
        handleRemoveTag={handleRemove}
        tags={tags}
        onSave={handleRequestSave}
      />
    </div>
  );
};

export default Tags;
