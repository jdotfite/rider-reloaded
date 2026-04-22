import type { PortalColorTheme } from '../store/PortalTypes';

export interface PortalThemePalette {
  entry: string;
  exit: string;
  link: string;
  flash: string;
}

const PORTAL_THEME_PALETTES: Record<PortalColorTheme, PortalThemePalette> = {
  violet: {
    entry: '#6f6cff',
    exit: '#36d1ff',
    link: '#93a0d8',
    flash: '#66b4ff',
  },
  amber: {
    entry: '#ff9f43',
    exit: '#ffd166',
    link: '#e0b36a',
    flash: '#ffcf5f',
  },
  mint: {
    entry: '#16c79a',
    exit: '#7cf8c6',
    link: '#68d9b6',
    flash: '#79f0cf',
  },
};

export function getPortalThemePalette(theme: PortalColorTheme): PortalThemePalette {
  return PORTAL_THEME_PALETTES[theme] ?? PORTAL_THEME_PALETTES.violet;
}
