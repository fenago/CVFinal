---
name: liquid-glass-styling
description: Apple Liquid Glass look for the web with CSS. Use when styling toolbars, sheets, status pills or buttons, choosing materials, colour tokens, light/dark mode, or adding reduced-transparency/contrast fallbacks.
---

# Liquid Glass on the web

HIG *Materials*: Liquid Glass "forms a distinct functional layer for controls and navigation… that floats above the content layer". **"Don't use Liquid Glass in the content layer."** "Use Liquid Glass effects sparingly." Regular variant for text-heavy controls. Clear variant over media, with a ~35% dimming layer behind it if the content is bright.

**CSS recipe (regular variant)**
```css
.glass {
  background: color-mix(in srgb, var(--glass-tint) 62%, transparent);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid var(--glass-stroke);
  box-shadow: inset 0 1px 0 var(--glass-highlight), 0 8px 32px rgb(0 0 0 / .18);
  border-radius: 22px;
}
@media (prefers-reduced-transparency: reduce) { .glass { background: var(--surface-solid); backdrop-filter: none; } }
@media (prefers-contrast: more) { .glass { border-color: CanvasText; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
```
- Tokens for light **and** dark (`prefers-color-scheme`). Use one accent (system blue `#0A84FF` dark / `#007AFF` light) sparingly. Destructive red is `#FF3B30`.
- Font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, system-ui, sans-serif`.
- Content (scan images, library cards) sits on solid surfaces.
