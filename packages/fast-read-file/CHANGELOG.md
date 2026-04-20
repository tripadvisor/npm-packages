# Changelog

## [2.0.0]

### Breaking

- `promisified-resource-pool` dependency bumped to 2.x; throttled `readFile` now uses `unprioritizedResourcePool` internally (no behavior change).
- Minimum Node version bumped to 22 (required by `promisified-resource-pool@2`).

## [1.0.2]

### Added

- Syntax annotations in readme

### Fixes

- Prevented bundling of workspace dependencies (`promisified-resource-pool`)

## [1.0.1]

### Added

- Added a changelog

### Fixes

- Fixed npm packaging, which previous excluded dist files on accident.

## [1.0.0]: Initial release
