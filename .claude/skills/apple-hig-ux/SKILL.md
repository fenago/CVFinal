---
name: apple-hig-ux
description: Apple Human Interface Guidelines applied to a web app: flows, progress feedback, alerts, destructive confirmations and accessibility. Use when designing or reviewing any screen, state, copy, button or interaction.
---

# Apple HIG for this app

- **Progress** (HIG *Progress indicators*): "Progress indicators let people know that your app isn't stalled." Prefer determinate when you can (scan stages: Finding page → Flattening → Cleaning → Saving). Keep it moving, show a short description, keep it in a consistent place, and let people cancel when feasible.
- **Alerts** (HIG *Alerts*): use sparingly. Write a specific title. Use verb buttons ("Reset", "Delete"), not Yes/No. Always label the cancel button "Cancel". Use the destructive style for destructive actions. Confirm uncommon destructive actions that can't be undone (Reset app data). Don't confirm common undoable ones.
- **Accessibility** (HIG *Accessibility*): contrast 4.5:1 for text up to 17 pt, 3:1 for 18 pt+ or bold. Hit targets ≥ 44×44 pt. Text can grow to 200%. Honour Reduce Motion. Label everything for VoiceOver (aria-label, aria-live for status). Never use colour alone.
- **Typography:** system font. Body ≈ 17 px, minimum 11 px. Build hierarchy with weight and size. Few typefaces.
- **States every screen needs:** empty, loading, working, success, error (with a next step), blocked/offline.
