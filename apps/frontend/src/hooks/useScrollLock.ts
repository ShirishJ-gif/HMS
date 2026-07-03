import { useEffect } from 'react';

const SCROLL_LOCK_ROOT_SELECTOR = '[data-scroll-lock-root="true"]';

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const scrollRoot = document.querySelector<HTMLElement>(SCROLL_LOCK_ROOT_SELECTOR);
    const previousRootOverflow = scrollRoot?.style.overflow ?? '';
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    if (scrollRoot) {
      scrollRoot.style.overflow = 'hidden';
    }
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      if (scrollRoot) {
        scrollRoot.style.overflow = previousRootOverflow;
      }
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [active]);
}
