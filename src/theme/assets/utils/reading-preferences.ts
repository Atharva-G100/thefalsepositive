export interface ReadingPreferences {
  font: 'theme' | 'system' | 'serif';
  size: number;
  lineHeight: number;
  measure: 'auto' | '60ch' | '72ch' | '84ch';
  justify: boolean;
}

export const readingDefaults: ReadingPreferences = {
  font: 'theme', size: 16, lineHeight: 1.75, measure: 'auto', justify: false,
};

const storageKey = 'valak-reading-preferences';
const fonts = {
  theme: 'var(--ny-font-ui)',
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
};

export function normalizeReadingPreferences(value: unknown): ReadingPreferences {
  const saved = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    font: saved.font === 'system' || saved.font === 'serif' ? saved.font : 'theme',
    size: typeof saved.size === 'number' && Number.isFinite(saved.size)
      ? Math.min(22, Math.max(14, Math.round(saved.size))) : readingDefaults.size,
    lineHeight: typeof saved.lineHeight === 'number' && Number.isFinite(saved.lineHeight)
      ? Math.round(Math.min(2.2, Math.max(1.4, saved.lineHeight)) * 20) / 20 : readingDefaults.lineHeight,
    measure: saved.measure === '60ch' || saved.measure === '72ch' || saved.measure === '84ch' ? saved.measure : 'auto',
    justify: saved.justify === true,
  };
}

export function loadReadingPreferences(): ReadingPreferences {
  try {
    return normalizeReadingPreferences(JSON.parse(localStorage.getItem(storageKey) || 'null'));
  } catch {
    return { ...readingDefaults };
  }
}

export function saveReadingPreferences(preferences: ReadingPreferences) {
  try { localStorage.setItem(storageKey, JSON.stringify(preferences)); } catch {}
}

export function applyReadingPreferences(preferences: ReadingPreferences) {
  const style = document.documentElement.style;
  style.setProperty('--reader-font', fonts[preferences.font]);
  style.setProperty('--reader-size', `${preferences.size}px`);
  style.setProperty('--reader-line-height', String(preferences.lineHeight));
  style.setProperty('--reader-measure', preferences.measure === 'auto' ? '100%' : preferences.measure);
  style.setProperty('--reader-align', preferences.justify ? 'justify' : 'start');
}
