# Changelog

## [2.0.0]

### Breaking

- `resourcePool` now returns `{ dispatch, remove }` instead of a bare dispatch function.
- `remove(resource)` retires a resource from the pool; queued waiters are rejected when the pool drains fully.
- Dispatching with a comparable that is already queued aborts the prior dispatch.
- Custom `AbortError` class replaced by `DOMException("Aborted", "AbortError")`.
- `resourcePool`'s `pool` parameter is now `T[]` only; the `Stack<T>` union and the `semaphore` export are gone. `sizedPool` uses a private counter internally and now executes queued callbacks LIFO instead of going through the priority heap.
- Minimum Node version bumped to 22 (uses `Promise.withResolvers`).

### Added

- `unprioritizedResourcePool(pool)` — O(1) stack-based pool for callers that don't need priority.
- O(1) abort path: aborted waiters are swept lazily on release rather than via `heap.remove`.

## [1.0.2]

### Added

- Syntax annotations in readme

## [1.0.1]

### Added

- Added a changelog

### Fixes

- Fixed npm packaging, which previous excluded dist files on accident.

## [1.0.0]: Initial release
