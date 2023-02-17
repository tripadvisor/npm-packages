# `promisified-resource-pool`: A utility to manage promise concurrency

## Overview

While JavaScript provides some basic mechanisms (`Promise.all`, `Promise.race`, etc.) to manage promise execution concurrency, it lacks a utility to constrain Promise execution to a finite limit. This package implements this mechanism through a generalization of this problem by modeling a concept of a finite pool of resources which much be leased out to each promise execution. Alongside this, it provides a means of prioritizing and aborting enqueued work, enabling a variety of useful concurrency management practices.

## Usage

> **Warning**
> Callbacks provided to a sizedPool must have a unique object identity.

For cases where there is no resource to manage, and the only desire is for a concurrency limit there's a `sizedPool` helper:

```ts
import { sizedPool } from "promisified-resource-pool";

const enqueue = sizedPool(10);

// `enqueue` can be called as desired, but only 10 callbacks will ever execute simultaneously.
// Note that the `enqueue` function returned from `sizedPool` does not accept a prioritization and
// cannot be provided an AbortSignal.
await enqueue(async () => {
  /* ... */
});
```

For cases with an underlying set of object resources we need to restrict concurrent access to, the `resourcePool` export gives more control:

> **Warning**
> The second parameter provided to a resourcePool's `enqueue` function must have a unique object identity.

```ts
import { resourcePool } from "promisified-resource-pool";

// Create a resource pool
const enqueue = resourcePool(["resource1", "resource2"]);

// Enqueue a resource-consuming callback. The callback will be executed as soon as a resource is
// available for the callback.
const callback = async (resource) => {
  // Use the resource. The resource will be returned to the pool once the callback is complete.
};
await enqueue(null, callback, callback);
```

Prioritized callbacks:

```ts
import { resourcePool } from "promisified-resource-pool";

// When creating a pool, a comparator can be provided to evaluate the prioritization of enqueued
// callbacks. I've chosen to use a number here, but any stably comparable type will do.
const enqueue = resourcePool(["resource1", "resource2"], (a, b) => b.priority - a.priority);

// The priority here is specified with the second parameter to `enqueue`.
await Promise.all([
  // This callback (#1) will be immediately executed, as the pool has two resources.
  enqueue(null, { priority: 1 }, async (resource) => {
    /* ... */
  }),
  // This callback (#2) will also be immediately executed, but with the second resource.
  enqueue(null, { priority: 1 }, async (resource) => {
    /* ... */
  }),
  // This callback (#3) will be enqueued, as both resources are currently in use.
  enqueue(null, { priority: 1 }, async (resource) => {
    /* ... */
  }),
  // This callback (#4) will also be added to the queue, bit with a higher priority it will be
  // bumped ahead of callback #3 in eventual execution order.
  enqueue(null, { priority: 2 }, async (resource) => {
    /* ... */
  }),
]);
```

There's also the `semaphore` export, which constructs a "pool" that is useful in implementing pools like the `sizedPool` above, but in a more configurable way that's more efficient than an array:

```ts
import { resourcePool, semaphore } from "promisified-resource-pool";

// Here we can create a resource pool with a fixed size that retains prioritization capabilities.
const enqueue = resourcePool(semaphore(4), (a, b) => b.priority - a.priority);

await Promise.all([
  enqueue(null, { priority: 1 }, async () => {
    /* ... */
  }),
  enqueue(null, { priority: 2 }, async () => {
    /* ... */
  }),
]);
```

Abortable callbacks:

```ts
import { resourcePool } from "promisified-resource-pool";

const enqueue = resourcePool(["resource1", "resource2"]);

const abortController = new AbortController();

// To describe the behavior more succinctly I've avoided awaiting these `enqueue`s, but in practice
// It would be necessary to await them to avoid an unhandled promise rejection.

// This callback (#1) will be immediately executed, as the pool has two resources.
const callback1 = async (resource) => {
  /* ... */
};
enqueue(abortController.signal, callback1, callback1);
// This callback (#2) will also be immediately executed, as the pool has a remaining resource.
const callback2 = async (resource) => {
  /* ... */
};
enqueue(abortController.signal, callback2, callback2);
// This callback (#3) will be enqueued, as the resource pool is fully in use.
const callback3 = async (resource) => {
  /* ... */
};
enqueue(abortController.signal, callback3, callback3);

// This will cause callback #3 to be aborted and removed from the queue.
abortController.abort();

try {
  // Additional enqueued calls with this AbortSignal will immediately reject.
  const callback4 = async (resource) => {
    /* ... */
  };
  await enqueue(abortController.signal, callback4, callback4);
} catch (e) {
  // Here, we'll catch an `AbortError`.
}
```
