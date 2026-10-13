import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** History-aware back: go back if there is in-app history, else replace with fallback. */
export function useBackNavigation() {
  const navigate = useNavigate();
  return useCallback(
    (fallback = '/') => {
      const idx = window.history.state?.idx;
      if (typeof idx === 'number' && idx > 0) navigate(-1);
      else navigate(fallback, { replace: true });
    },
    [navigate]
  );
}

let overlaySeq = 0;

/**
 * While `isOpen` is true, an extra history entry exists so the hardware/browser
 * back button closes the overlay instead of leaving the page.
 */
export function useOverlayBack(isOpen, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;
    const id = ++overlaySeq;
    let closedByPop = false;
    window.history.pushState({ ...(window.history.state || {}), nqOverlay: id }, '');

    const onPop = () => {
      closedByPop = true;
      closeRef.current?.();
    };
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);
      if (!closedByPop && window.history.state?.nqOverlay === id) {
        window.history.back();
      }
    };
  }, [isOpen]);
}

/** Sets document.title as "<title> — NeverQ". */
export function usePageTitle(title) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} — NeverQ` : 'NeverQ — Know when to leave';
    return () => {
      document.title = prev;
    };
  }, [title]);
}

export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
