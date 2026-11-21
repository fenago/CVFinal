# Storage quotas and eviction

Source: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria

- Best-effort (default) vs persistent (`navigator.storage.persist()`). Persistent data is evicted only if the user deletes it.
- `navigator.storage.estimate()` returns `{usage, quota}` estimates.
- Chrome/Chromium: up to **60% of total disk** per origin. Firefox best-effort: smaller of **10% of disk or 10 GiB**; persistent: up to **50%**. Safari 17+: about **60%** per origin (80% overall).
- Over quota → **`QuotaExceededError`**.
- Eviction is LRU by origin under storage pressure. Safari deletes script-written data for origins with no user interaction in the last **7 days** of browser use (when tracking prevention is on).
