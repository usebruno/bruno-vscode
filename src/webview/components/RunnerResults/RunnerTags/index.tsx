import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { get, cloneDeep, find } from 'lodash';
import { updateCollectionTagsList, updateRunnerTagsDetails } from 'providers/ReduxStore/slices/collections';
import TagList from 'components/TagList';

interface RunnerTagsProps {
  collectionUid?: string;
  className?: string;
  tag?: unknown;
  to?: unknown;
  from?: unknown;
}

interface TagsFilter {
  include: string[];
  exclude: string[];
}

const RunnerTags = ({
  collectionUid,
  className = ''
}: any) => {
  const dispatch = useDispatch();
  const collections = useSelector((state) => state.collections.collections);
  const collection = cloneDeep(find(collections, (c) => c.uid === collectionUid));

  const tags: TagsFilter = get(collection, 'runnerTags', { include: [], exclude: [] }) as TagsFilter;

  const tagsEnabled = get(collection, 'runnerTagsEnabled', false);

  const availableTags = get(collection, 'allTags', []);
  const tagsHintList = availableTags.filter((t: any) => !tags.exclude.includes(t) && !tags.include.includes(t));

  useEffect(() => {
    dispatch(updateCollectionTagsList({ collectionUid }));
  }, [collection.uid, dispatch]);

  const handleValidation = (tag: any) => {
    const trimmedTag = tag.trim();
    if (!availableTags.includes(trimmedTag)) {
      return 'tag does not exist!';
    }
    if (tags.include.includes(trimmedTag)) {
      return 'tag already present in the include list!';
    }
    if (tags.exclude.includes(trimmedTag)) {
      return 'tag is present in the exclude list!';
    }
  };

  const handleAddTag = ({
    tag,
    to
  }: any) => {
    const trimmedTag = tag.trim();
    if (!trimmedTag) return;
    if (to === 'include') {
      if (tags.include.includes(trimmedTag) || tags.exclude.includes(trimmedTag)) return;
      if (!availableTags.includes(trimmedTag)) {
        return;
      }
      const newTags = { ...tags, include: [...tags.include, trimmedTag].sort() };
      setTags(newTags);
      return;
    }
    if (to === 'exclude') {
      if (tags.include.includes(trimmedTag) || tags.exclude.includes(trimmedTag)) return;
      if (!availableTags.includes(trimmedTag)) {
        return;
      }
      const newTags = { ...tags, exclude: [...tags.exclude, trimmedTag].sort() };
      setTags(newTags);
    }
  };

  const handleRemoveTag = ({
    tag,
    from
  }: any) => {
    const trimmedTag = tag.trim();
    if (!trimmedTag) return;
    if (from === 'include') {
      if (!tags.include.includes(trimmedTag)) return;
      const newTags = { ...tags, include: tags.include.filter((t: any) => t !== trimmedTag) };
      setTags(newTags);
      return;
    }
    if (from === 'exclude') {
      if (!tags.exclude.includes(trimmedTag)) return;
      const newTags = { ...tags, exclude: tags.exclude.filter((t: any) => t !== trimmedTag) };
      setTags(newTags);
    }
  };

  const setTags = (tags: any) => {
    dispatch(updateRunnerTagsDetails({ collectionUid: collection.uid, tags }));
  };

  const setTagsEnabled = (tagsEnabled: any) => {
    dispatch(updateRunnerTagsDetails({ collectionUid: collection.uid, tagsEnabled }));
  };

  return (
    <div className={`mt-6 flex flex-col ${className}`}>
      <div className="flex gap-2">
        <input
          className="cursor-pointer"
          id="filter-tags"
          type="radio"
          name="filterMode"
          checked={tagsEnabled}
          onChange={() => setTagsEnabled(!tagsEnabled)}
        />
        <label htmlFor="filter-tags" className="block font-medium">Filter requests with tags</label>
      </div>
      {tagsEnabled && (
        <div className="flex flex-row mt-4 gap-4 w-full">
          <div className="w-1/2 flex flex-col gap-2 max-w-[400px]">
            <span>Included tags:</span>
            <TagList
              tags={tags.include}
              handleAddTag={(tag: any) => handleAddTag({ tag, to: 'include' })}
              handleRemoveTag={(tag: any) => handleRemoveTag({ tag, from: 'include' })}
              tagsHintList={tagsHintList}
              handleValidation={handleValidation}
            />
          </div>
          <div className="w-1/2 flex flex-col gap-2 max-w-[400px]">
            <span>Excluded tags:</span>
            <TagList
              tags={tags.exclude}
              handleAddTag={(tag: any) => handleAddTag({ tag, to: 'exclude' })}
              handleRemoveTag={(tag: any) => handleRemoveTag({ tag, from: 'exclude' })}
              tagsHintList={tagsHintList}
              handleValidation={handleValidation}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default RunnerTags;
