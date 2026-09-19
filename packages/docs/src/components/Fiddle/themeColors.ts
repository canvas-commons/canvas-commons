const COLOR_VARS = [
  '--cc-base',
  '--cc-mantle',
  '--cc-crust',
  '--cc-surface0',
  '--cc-surface1',
  '--cc-surface2',
  '--cc-overlay0',
  '--cc-overlay1',
  '--cc-overlay2',
  '--cc-text',
  '--cc-subtext1',
  '--cc-subtext0',
  '--cc-blue',
  '--cc-mauve',
  '--cc-teal',
  '--cc-green',
  '--cc-peach',
  '--cc-yellow',
  '--cc-red',
  '--cc-lavender',
  '--cc-sky',
] as const;

/**
 * Read the Catppuccin semantic color variables off the document root. Scenes
 * read them through `useScene().variables`, so a theme switch recolors a
 * running preview without recompiling.
 */
export function getThemeColors(): Record<string, string> {
  if (typeof document === 'undefined') {
    return {};
  }
  const style = getComputedStyle(document.documentElement);
  const colors: Record<string, string> = {};
  for (const name of COLOR_VARS) {
    const value = style.getPropertyValue(name).trim();
    if (value) {
      colors[name] = value;
    }
  }
  return colors;
}

/** Run `onChange` when the Docusaurus `data-theme` attribute changes. */
export function observeTheme(onChange: () => void): () => void {
  if (typeof document === 'undefined') {
    return () => {};
  }
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => observer.disconnect();
}
