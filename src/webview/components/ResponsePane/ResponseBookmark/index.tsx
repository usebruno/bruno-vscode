import React from 'react';

interface ResponseBookmarkProps {
  children?: React.ReactNode;
}

// ResponseBookmark is deprecated - examples feature has been removed
const ResponseBookmark = React.forwardRef<unknown, ResponseBookmarkProps>(({ children }, ref) => {
  return children ?? null;
});

ResponseBookmark.displayName = 'ResponseBookmark';

export default ResponseBookmark;
