import { useEffect, useRef } from 'react';
import { useTheme } from '../../lib/theme.jsx';

export const OPENFREEMAP_STYLES = {
  liberty: import.meta.env.VITE_MAP_STYLE || 'https://tiles.openfreemap.org/styles/liberty',
  dark: import.meta.env.VITE_MAP_STYLE_DARK || 'https://tiles.openfreemap.org/styles/dark',
};

/**
 * Hook to apply OpenFreeMap styles smoothly across theme changes
 * without recreating the Map instance or thrashing WebGL contexts.
 */
export function useMapStyle(mapRef) {
  const { resolvedTheme } = useTheme();
  const currentThemeRef = useRef(resolvedTheme);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (currentThemeRef.current !== resolvedTheme) {
      currentThemeRef.current = resolvedTheme;
      const targetStyle = resolvedTheme === 'dark' ? OPENFREEMAP_STYLES.dark : OPENFREEMAP_STYLES.liberty;

      const safeApplyStyle = () => {
        try {
          if (mapRef.current && currentThemeRef.current === resolvedTheme) {
            mapRef.current.setStyle(targetStyle, { diff: false });
          }
        } catch (err) {
          console.warn('Map style switch handled:', err);
        }
      };

      if (map.isStyleLoaded()) {
        safeApplyStyle();
      } else {
        map.once('load', safeApplyStyle);
      }
    }
  }, [resolvedTheme, mapRef]);

  return {
    resolvedTheme,
    currentStyle: resolvedTheme === 'dark' ? OPENFREEMAP_STYLES.dark : OPENFREEMAP_STYLES.liberty,
    OPENFREEMAP_STYLES,
  };
}
