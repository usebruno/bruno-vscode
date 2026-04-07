import MarkdownIt from 'markdown-it';
import * as MarkdownItReplaceLink from 'markdown-it-replace-link';
import DOMPurify from 'dompurify';
import StyledWrapper from './StyledWrapper';
import React from 'react';
import { isValidUrl } from 'utils/url/index';

interface MarkdownProps {
  collectionPath?: unknown;
  onDoubleClick?: (...args: unknown[]) => void;
  content?: unknown;
}


const Markdown = ({
  collectionPath,
  onDoubleClick,
  content
}: any) => {
  const markdownItOptions = {
    html: true,
    breaks: true,
    linkify: true,
    replaceLink: function (link: any, env: any) {
      return link.replace(/^\./, collectionPath);
    }
  };

  const handleOnClick = (event: any) => {
    const target = event.target;
    if (target.tagName === 'A') {
      event.preventDefault();
      const href = target.getAttribute('href');
      if (href && isValidUrl(href)) {
        window.open(href, '_blank');
        return;
      }
    }
  };

  const handleOnDoubleClick = (event: any) => {
    if (event.detail === 2) {
      onDoubleClick();
    }
  };

  // @ts-expect-error - markdownItOptions includes custom replaceLink option from markdown-it-replace-link plugin
  const md = new MarkdownIt(markdownItOptions).use(MarkdownItReplaceLink);

  const htmlFromMarkdown = md.render(content || '');
  const sanitizedHtml = DOMPurify.sanitize(htmlFromMarkdown, {
    ALLOWED_TAGS: ['a', 'ul', 'ol', 'li', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'em', 'code', 'pre', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'br', 'hr', 'img', 'del', 'ins', 'sup', 'sub', 'dl', 'dt', 'dd'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel', 'width', 'height']
  });

  return (
    <StyledWrapper>
      <div
        className="markdown-body"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        onClick={handleOnClick}
        onDoubleClick={handleOnDoubleClick}
      />
    </StyledWrapper>
  );
};

export default Markdown;
