import { Heap } from "heap-js";

type ResourcedCallback<T, R> = (value: T) => Promise<R>;

/**
 * Given a pool of some resource type (T), as well as a partial ordering of some comparable entity
 * (C), `resourcePool` provides the caller with a `dispatch` function that schedules a provided
 * callback to execute as soon as a resource from the pool is available, in the priority order
 * specified by the partial ordering.
 *
 * Additionally, the resourcePool has support for aborting scheduled callbacks via a provided
 * AbortSignal. If no abort behavior is required, a null AbortSignal may be provided to avoid
 * EventTarget overhead.
 *
 * `remove` may be used to poison a resource in the pool such that it's no longer provided via
 * dispatch; if the resource is currently checked out the discard is deferred until it's released.
 * When a `remove` drains the pool, any waiters still in the queue will be rejected.
 */
export interface ResourcePool<T, C> {
  dispatch: <R>(
    abortSignal: AbortSignal | null,
    comparable: C,
    callback: ResourcedCallback<T, R>,
  ) => Promise<R>;
  remove: (resource: T) => void;
}

export const resourcePool = <T, C>(
  pool: Array<T>,
  compare: (entity1: C, entity2: C) => number = () => 0,
): ResourcePool<T, C> => {
  const queue = new Heap<C>(compare);
  const resolverMap = new Map<
    C,
    { resolve: (value: T) => void; reject: (reason: Error) => void }
  >();
  const removed = new Set<T>();
  let size = pool.length;

  const drain = () => {
    const err = new Error("Resource pool is exhausted");
    for (const [comparable, { reject }] of resolverMap) {
      resolverMap.delete(comparable);
      reject(err);
    }
  };

  // The queue may contain "dead" entries: callbacks whose abort listeners fired and removed them
  // from resolverMap without removing them from the queue. Dead entries are drained here: pop
  // until we find a live entry (still in the resolverMap) or empty the queue.
  const release = (resource: T) => {
    // If this resource was removed while checked out, discard it.
    if (removed.has(resource)) {
      removed.delete(resource);
      // If the pool is now fully depleted, reject all waiters.
      if (size === 0) {
        drain();
      }
      return;
    }
    while (queue.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const nextComparable = queue.pop()!;
      const entry = resolverMap.get(nextComparable);
      if (entry) {
        resolverMap.delete(nextComparable);
        entry.resolve(resource);
        return;
      }
    }
    pool.push(resource);
  };

  return {
    dispatch: <R>(
      abortSignal: AbortSignal | null,
      comparable: C,
      callback: ResourcedCallback<T, R>,
    ): Promise<R> => {
      if (abortSignal?.aborted) {
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }

      // No resources exist — all have been removed.
      if (size === 0) {
        return Promise.reject(new Error("Resource pool is exhausted"));
      }

      // Fast path: resource available, skip async machinery.
      if (pool.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const resource = pool.pop()!;
        return callback(resource).finally(() => {
          release(resource);
        });
      }

      // Slow path: wait for a resource.
      // If the same comparable is already queued, abort the previous dispatch.
      const existing = resolverMap.get(comparable);
      if (existing) {
        resolverMap.delete(comparable);
        existing.reject(new DOMException("Aborted", "AbortError"));
      }
      const { promise, resolve, reject } = Promise.withResolvers<T>();
      queue.push(comparable);
      resolverMap.set(comparable, { resolve, reject });
      if (abortSignal) {
        abortSignal.addEventListener(
          "abort",
          () => {
            // O(1): remove from resolverMap, leave dead entry in heap.
            // release() skips entries not in resolverMap. Guard against evicting a
            // later dispatch that reused this comparable after a dedup.
            if (resolverMap.get(comparable)?.reject === reject) {
              resolverMap.delete(comparable);
            }
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }
      return promise.then((resource) =>
        callback(resource).finally(() => {
          release(resource);
        }),
      );
    },

    remove: (resource: T) => {
      size--;
      // If it's in the pool (not checked out), remove it directly.
      const idx = pool.indexOf(resource);
      if (idx !== -1) {
        pool.splice(idx, 1);
        if (size === 0) {
          drain();
        }
        return;
      }
      // Otherwise it's checked out — mark it so release() discards it.
      removed.add(resource);
    },
  };
};

interface Stack<T> {
  readonly length: number;
  push(value: T): number;
  pop(): T;
}

/**
 * An unprioritized variant of `resourcePool` with O(1) rather than O(log n) overhead per callback.
 * Appropriate when all callbacks have equal priority.
 */
export const unprioritizedResourcePool = <T>(pool: Stack<T> | Array<T>) => {
  type Callback = (value: T) => Promise<unknown>;
  const stack: Array<Callback> = [];
  const resolverMap = new Map<Callback, (value: T) => void>();

  // The stack may contain "dead" entries: callbacks whose abort listeners fired and removed them
  // from resolverMap without removing them from the stack. Dead entries are drained here: pop
  // until we find a live entry (still in the resolverMap) or empty the stack.
  const release = (resource: T) => {
    while (stack.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const nextCallback = stack.pop()!;
      const next = resolverMap.get(nextCallback);
      if (next) {
        resolverMap.delete(nextCallback);
        next(resource);
        return;
      }
    }
    pool.push(resource);
  };

  return <R>(abortSignal: AbortSignal | null, callback: ResourcedCallback<T, R>): Promise<R> => {
    if (abortSignal?.aborted) {
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    }

    // Fast path: resource available, we can synchronously dispatch.
    if (pool.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const resource = pool.pop()!;
      return callback(resource).finally(() => {
        release(resource);
      });
    }

    // Slow path: wait for a resource.
    const { promise, resolve, reject } = Promise.withResolvers<T>();
    stack.push(callback);
    resolverMap.set(callback, resolve);
    if (abortSignal) {
      abortSignal.addEventListener(
        "abort",
        () => {
          // No need to clean up the stack: `release` drains dead entries.
          resolverMap.delete(callback);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    }
    return promise.then((resource) =>
      callback(resource).finally(() => {
        release(resource);
      }),
    );
  };
};

/**
 * A "Simplified" wrapper around unprioritizedResourcePool for cases where the resource is simply
 * a concurrency limit, abort behavior is not needed, and all callbacks have equal priority.
 */
export const sizedPool = (size: number) => {
  if (size < 1) {
    throw new Error(`Invalid pool size: ${String(size)}`);
  }
  let length = size;
  const exec = unprioritizedResourcePool<number>({
    get length() {
      return length;
    },
    push() {
      return ++length;
    },
    pop() {
      return --length;
    },
  });
  return <R>(callback: ResourcedCallback<number, R>) => exec(null, callback);
};
