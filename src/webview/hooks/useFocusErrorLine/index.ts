import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import find from 'lodash/find';
import { useDispatch, useSelector } from 'react-redux';
import type { ScriptType } from '@bruno-types';
import { clearFocusErrorLine } from 'providers/ReduxStore/slices/tabs';
import { focusErrorLine } from 'utils/codemirror/focusErrorLine';

interface UseFocusErrorLineParams {
  uid: string;
  editorRef: RefObject<{ editor?: any } | null>;
  scriptPhase: ScriptType;
  isVisible?: boolean;
}

const useFocusErrorLine =({ uid, editorRef, scriptPhase, isVisible = true }: UseFocusErrorLineParams) => {
  const dispatch = useDispatch();
  const focusErrorLineState = useSelector((state: any) => {
    const tab = find(state.tabs.tabs, (t: any) => t.uid === uid);
    return tab?.focusErrorLine || null;
  });

  const disposeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!focusErrorLineState || !isVisible) return;
    if (focusErrorLineState.scriptPhase !== scriptPhase) return;

    const timer = setTimeout(() => {
      const editor = editorRef.current?.editor;
      if (editor) {
        disposeRef.current?.();
        disposeRef.current = focusErrorLine(editor, focusErrorLineState.line);
      }
      dispatch(clearFocusErrorLine({ uid }));
    }, 0);

    return () => clearTimeout(timer);
  }, [focusErrorLineState?.requestedAt, focusErrorLineState?.line, focusErrorLineState?.scriptPhase, isVisible, scriptPhase, uid]);

  useEffect(() => {
    return () => {
      disposeRef.current?.();
      disposeRef.current = null;
    };
  }, []);
};

export default useFocusErrorLine;
