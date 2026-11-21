# Example: one state, specified well

**State: Working (scanning)**
- Trigger: the user picked or captured a photo while OpenCV is ready.
- Visual: the photo preview dims 20%. A floating glass status pill in a consistent place (bottom centre) shows a determinate 4-step progress: Finding page → Flattening → Cleaning up → Saving.
- Copy: "Finding the page…" (updates per step). Screen readers get `aria-live="polite"` with the same text.
- Actions: **Cancel** (stops the scan, restarts the worker, returns to Ready).
- Timeout (30 s): switches to the Error state, "This is taking longer than expected." with buttons [Try Again] [Cancel].
- Reduced motion: the bar fills without the shimmer animation.
