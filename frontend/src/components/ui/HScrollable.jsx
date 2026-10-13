import React, { useRef, useCallback, useEffect, useState } from 'react';

/**
 * HScrollable — horizontal scroll container with:
 *  - Mouse-wheel forwarding (vertical wheel → horizontal scroll on desktop)
 *  - Left/right fade-edge masks that appear only when there's hidden content
 *  - Touch scroll (native, already works)
 *  - No visible scrollbar (`.no-scrollbar`)
 *  - All extra props passed through to the inner div
 */
export function HScrollable({ children, className = '', wrapperClassName = '', ...props }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      ro.disconnect();
    };
  }, [checkScroll]);

  const handleWheel = useCallback((e) => {
    const el = scrollRef.current;
    if (!el) return;
    const canH = el.scrollWidth > el.clientWidth;
    if (!canH) return;
    // Only hijack if the element can scroll horizontally
    e.preventDefault();
    el.scrollBy({ left: e.deltaY !== 0 ? e.deltaY * 1.2 : e.deltaX * 1.2, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  return (
    <div className={`relative ${wrapperClassName}`}>
      {/* Left fade mask */}
      {canScrollLeft && (
        <div
          className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 z-10"
          style={{
            background: 'linear-gradient(to right, var(--bg, var(--surface)) 10%, transparent)',
          }}
          aria-hidden="true"
        />
      )}

      {/* Scroll container */}
      <div
        ref={scrollRef}
        className={`overflow-x-auto no-scrollbar ${className}`}
        {...props}
      >
        {children}
      </div>

      {/* Right fade mask */}
      {canScrollRight && (
        <div
          className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 z-10"
          style={{
            background: 'linear-gradient(to left, var(--bg, var(--surface)) 10%, transparent)',
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
