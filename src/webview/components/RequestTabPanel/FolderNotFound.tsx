import React from 'react';

interface FolderNotFoundProps {
  folderUid?: string;
}

const FolderNotFound: React.FC<FolderNotFoundProps> = ({ folderUid }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="text-lg font-semibold mb-2">Folder not found</div>
      <div className="text-sm text-gray-500">
        This folder may have been deleted or moved.
      </div>
      {folderUid && (
        <div className="text-xs text-gray-400 mt-4 font-mono">
          Folder UID: {folderUid}
        </div>
      )}
    </div>
  );
};

export default FolderNotFound;
