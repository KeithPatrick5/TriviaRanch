# Android Emulator Spacing Cleanup Audit

Status: PASS

This pass was based on the live Pixel 6 emulator screenshots.

## Fixed

- Changed Android status bar handling from translucent to solid dark so app content no longer sits underneath the real Android status icons.
- Added a dedicated splash asset instead of relying on the app icon, which was being cropped into an awkward circle.
- Tightened home overlay typography so dynamic labels sit better on the blank home asset.
- Reduced home bottom-nav label size and raised labels slightly to stay off the Android gesture bar.
- Removed the survival-mode heart emoji from the timer ring and replaced it with a cleaner numeric lives display plus a small `LIVES` label.
- Widened game score/streak/best fields so values do not wrap vertically, especially four-digit best scores.
- Reduced and repositioned game question/answer text for better fit on Pixel 6.
- Changed generic result headline fallback from duplicate `ROUND COMPLETE` to `NICE RUN`, avoiding the double-title look.
- Added missing result CTA labels back over the blank result asset: View Round, Run It Back, Challenge Someone, and Home.
- Repositioned result headline, score, rank, and progress overlays to reduce crowding.

## Audit

- `python3 scripts/audit_project.py` passed.
- No `node_modules`, `package-lock.json`, or `tsconfig.tsbuildinfo` included.
- Dynamic asset-driven Home/Game/Result screens are still intact.
- Button hitboxes and wiring markers remain present.

## Next Android test focus

- Verify the app no longer shows the awkward cropped splash/icon screen.
- Verify Game screen stats no longer wrap, especially Best score.
- Verify Survival timer displays cleanly.
- Verify Result buttons have visible labels again.
- Verify Result headline does not duplicate `ROUND COMPLETE`.
