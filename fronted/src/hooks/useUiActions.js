import { useCallback } from 'react';

export function useUiActions({ inputElRef, setInputText, submitTextAuto, setHistorySort } = {}) {
  const focusInputEl = useCallback(() => {
    try {
      setTimeout(() => {
        if (inputElRef.current && typeof inputElRef.current.focus === 'function') {
          inputElRef.current.focus();
        }
      }, 0);
    } catch (_) {
      // ignore
    }
  }, [inputElRef]);

  const onPickHistoryQuestion = useCallback(
    (q) => {
      setInputText(q);
      focusInputEl();
    },
    [focusInputEl, setInputText]
  );

  const onQuickSummary = useCallback(() => submitTextAuto('请用30秒总结刚才的讲解', 'settings_quick'), [submitTextAuto]);
  const onChangeHistorySort = setHistorySort;

  return { focusInputEl, onPickHistoryQuestion, onQuickSummary, onChangeHistorySort };
}
