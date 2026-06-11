# Implement Item 5: Owner & Controller Configuration Lock and Real-time Sync

- [x] Inspect and modify `src/screens/NewGameScreen.tsx` (Rules screen)
  - [x] Implement permission check using `useLive()` (check `isOriginalOwner` and `isCurrentController` if mirroring active)
  - [x] Set `isReadOnly` flag or disable appropriate elements
  - [x] Ensure all input components, sliders, select boxes are disabled/read-only for unauthorized users
- [x] Inspect and modify `src/screens/settings/TeamSection.tsx` (Home Settings configuration)
  - [x] Use `useLive()` permission checks
  - [x] Disable all text inputs, select lists, swap buttons, randomizers, clear/toggle history buttons for unauthorized users
  - [x] Apply visual cues (opacity-50, pointer-events-none, cursor-not-allowed) to disabled interactive elements
  - [x] Add strict guards at the start of settings event handlers to prevent direct calls if unauthorized
- [x] Inspect and modify `src/modules/game/GameContext.tsx` or settings sync mechanism
  - [x] Ensure any local changes to configuration elements instantly sync to Firestore (so other devices see them)
  - [x] Ensure when the Controller updates settings, observers receive and update their local React state correctly to prevent stale overwrites or inconsistent visual displays
- [x] Verify everything works perfectly and does not break local play
