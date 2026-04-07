import React from 'react';
import classnames from 'classnames';
import StyledWrapper from './StyledWrapper';
import { IconExclamationCircle, IconChevronRight, IconInfoCircle, IconChevronDown, IconArrowUpRight, IconArrowDownLeft } from '@tabler/icons';
import CodeEditor from 'components/CodeEditor/index';
import { useTheme } from 'providers/Theme';
import { useState } from 'react';
import { useSelector } from 'react-redux';
import _ from 'lodash';
import { useRef } from 'react';
import { useEffect } from 'react';

interface getContentMetaProps {
  type?: React.ReactNode;
  message?: unknown;
  inFocus?: React.ReactNode;
  messages?: unknown[] | string;
}


const getContentMeta = (content: any) => {
  if (typeof content === 'object') {
    return {
      isJSON: true,
      content: JSON.stringify(content, null, 0)
    };
  }
  try {
    return {
      isJSON: true,
      content: JSON.stringify(JSON.parse(content), null, 0)
    };
  } catch {
    return {
      isJSON: false,
      content: content
    };
  }
};

const parseContent = (content: any) => {
  let contentMeta = getContentMeta(content);
  return {
    type: contentMeta.isJSON ? 'application/json' : 'text/plain',
    content: contentMeta.isJSON ? JSON.stringify(JSON.parse(contentMeta.content), null, 2) : contentMeta.content
  };
};

const getDataTypeText = (type: string) => {
  const textMap: Record<string, string> = {
    'text/plain': 'RAW',
    'application/json': 'JSON'
  };
  return textMap[type] ?? 'RAW';
};

/**
 *
 * @param {"incoming"|"outgoing"|"info"} type
 */
const TypeIcon = ({
  type
}: any) => {
  const commonProps = {
    size: 18
  };
  const iconMap: Record<string, React.ReactNode> = {
    incoming: <IconArrowDownLeft {...commonProps} />,
    outgoing: <IconArrowUpRight {...commonProps} />,
    info: <IconInfoCircle {...commonProps} />,
    error: <IconExclamationCircle {...commonProps} />
  };
  return iconMap[type];
};

const WSMessageItem = ({
  message,
  inFocus
}: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showHex, setShowHex] = useState(false);
  const preferences = useSelector((state) => state.app.preferences);
  const { displayedTheme } = useTheme();
  const [isNew, setIsNew] = useState(false);
  const notified = useRef(false);

  const isIncoming = message.type === 'incoming';
  const isInfo = message.type === 'info';
  const isError = message.type === 'error';
  const isOutgoing = message.type === 'outgoing';
  let contentHexdump = message.messageHexdump;
  let parsedContent = parseContent(message.message);
  const dataType = getDataTypeText(parsedContent.type);

  useEffect(() => {
    if (notified.current === true) return;
    const dateDiff = Date.now() - new Date(message.timestamp).getTime();
    if (dateDiff < 1000 * 10) {
      setIsNew(true);
      setTimeout(() => {
        notified.current = true;
        setIsNew(false);
      }, 2500);
    }
  }, [message]);

  const canOpenMessage = !isInfo && !isError;

  return (
    <div
      ref={(node) => {
        if (!node) return;
        if (inFocus) node.scrollIntoView();
      }}
      className={classnames('ws-message flex flex-col p-2', {
        'ws-incoming': isIncoming,
        'ws-outgoing': isOutgoing,
        'ws-info': isInfo,
        'ws-error': isError,
        'open': isOpen,
        'new': isNew
      })}
    >
      <div
        className={classnames('flex items-center justify-between', {
          'cursor-pointer': canOpenMessage,
          'cursor-not-allowed': !canOpenMessage
        })}
        onClick={(e) => {
          if (!canOpenMessage) return;
          setIsOpen(!isOpen);
        }}
      >
        <div className="flex min-w-0 shrink">
          <span className="message-type-icon">
            <TypeIcon type={message.type} />
          </span>
          <span className="ml-3 text-ellipsis max-w-full overflow-hidden text-nowrap message-content">{parsedContent.content}</span>
        </div>
        <div className="flex shrink-0 gap-2 items-center">
          {message.timestamp && (
            <span className="message-timestamp">{new Date(message.timestamp).toISOString()}</span>
          )}
          {canOpenMessage
            ? (
                <span className="chevron-icon">
                  {isOpen ? (
                    <IconChevronDown size={16} strokeWidth={1.5} />
                  ) : (
                    <IconChevronRight size={16} strokeWidth={1.5} />
                  )}
                </span>
              )
            : <span className="w-4"></span>}
        </div>
      </div>
      {isOpen && (
        <>
          <div className="mt-2 flex justify-end gap-2 text-xs ws-message-toolbar" role="tablist">
            <div
              className={classnames('select-none capitalize', {
                'active': showHex,
                'cursor-pointer': !showHex
              })}
              role="tab"
              onClick={() => setShowHex(true)}
            >
              hexdump
            </div>
            <div
              className={classnames('select-none capitalize', {
                'active': !showHex,
                'cursor-pointer': showHex
              })}
              role="tab"
              onClick={() => setShowHex(false)}
            >
              {dataType.toLowerCase()}
            </div>
          </div>
          <div className="mt-1 h-[300px] w-full">
            <CodeEditor
              mode={showHex ? 'text/plain' : parsedContent.type}
              theme={displayedTheme}
              enableLineWrapping={showHex ? false : true}
              font={(preferences as any).codeFont || 'default'}
              value={showHex ? contentHexdump : parsedContent.content}
            />
          </div>
        </>
      )}
    </div>
  );
};

const WSMessagesList = ({ messages = [] }: { messages?: any[] }) => {
  if (!messages.length) {
    return <StyledWrapper><div className="empty-state">No messages yet.</div></StyledWrapper>;
  }
  return (
    <StyledWrapper className="ws-messages-list flex flex-col">
      {messages.map((msg, idx, src) => {
        const inFocus = src.length - 1 === idx;
        return <WSMessageItem key={msg.timestamp} inFocus={inFocus} id={idx} message={msg} />;
      })}
    </StyledWrapper>
  );
};

export default WSMessagesList;
