import { useEffect, RefObject } from 'react';

const useFocusTrap = (modalRef: RefObject<HTMLElement | null>): void => {
  // refer to this implementation for modal focus: https://stackoverflow.com/a/38865836
  const focusableSelector = 'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, *[tabindex]:not([tabindex="-1"]), *[contenteditable]';

  useEffect(() => {
    const modalElement = modalRef.current;
    if (!modalElement) return;

    const focusableElements = Array.from(document.querySelectorAll(focusableSelector));
    const modalFocusableElements = Array.from(modalElement.querySelectorAll(focusableSelector));
    const elementsToHide = focusableElements.filter((el) => !modalFocusableElements.includes(el));

    // Hide elements outside the modal
    elementsToHide.forEach((el) => {
      const originalTabIndex = el.getAttribute('tabindex');
      el.setAttribute('data-tabindex', originalTabIndex || 'inline');
      el.setAttribute('tabindex', '-1');
    });

    const firstElement = modalFocusableElements[0];
    const lastElement = modalFocusableElements[modalFocusableElements.length - 1];

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          (lastElement as HTMLElement)?.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          (firstElement as HTMLElement)?.focus();
        }
      }
    };

    modalElement.addEventListener('keydown', handleKeyDown);

    return () => {
      modalElement.removeEventListener('keydown', handleKeyDown);

      elementsToHide.forEach((el) => {
        const originalTabIndex = el.getAttribute('data-tabindex');
        el.setAttribute('tabindex', originalTabIndex === 'inline' ? '' : (originalTabIndex || ''));
      });
    };
  }, [modalRef]);
};

export default useFocusTrap;
