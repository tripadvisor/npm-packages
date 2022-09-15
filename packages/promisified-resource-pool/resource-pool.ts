import { Heap } from "heap-js";

// It appears Node and Web are semi-standardizing on:
// https://developer.mozilla.org/en-US/docs/Web/API/DOMException#AbortError
// To represent the promise rejection state for aborted work.
//
// Sadly, that's not yet available in node, so I'm providing something analogous based on:
// https://github.com/nodejs/node/issues/36084
class AbortError extends Error {
  name = "AbortError";
  code = 20;

  constructor() {
    super("Aborted");
  }
}

interface Stack<T> {
  readonly length: number;
  push(value: T): number;
  pop(): T;
}

type ResourcedCallback<T, R> = (value: T) => Promise<R>;

/**
 * A basic implementation of the `pool` type consumed by the `resourcePool` that, in return for not
 * actually managing a _resource_ (only ensuring that the number of _resourced_ callbacks is below
 * the provided pool `size`) avoids meaningful operations on pool size.
 */
export const semaphore = (size: number): Stack<number> => {
  let length = size;
  return {
    get length() {
      return length;
    },
    push() {
      return ++length;
    },
    pop() {
      return --length;
    },
  };
};

/**
 * Given a pool of some resource type (T), as well as a partial ordering of some comparable entity
 * (C), `resourcePool` provides the caller with a function that schedules a provided callback to
 * execute as soon as a resource from the pool is available, in the priority order specified by the
 * partial ordering.
 *
 * Additionally, the resourcePool has support for aborting scheduled callbacks via a provided
 * AbortSignal. If no abort behavior is required, a null AbortSignal may be provided to avoid
 * EventTarget overhead.
 */
export const resourcePool = <T, R, C = ResourcedCallback<T, R>>(
  pool: Stack<T> | T[],
  compare: (entity1: C, entity2: C) => number = () => 0,
) => {
  const queue = new Heap<C>(compare);
  const resolverMap = new Map<C, (value: T) => void>();

  return async (
    abortSignal: AbortSignal | null,
    comparable: C,
    callback: ResourcedCallback<T, R>,
  ): Promise<R> => {
    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
    if (abortSignal && abortSignal.aborted) {
      throw new AbortError();
    }

    const resource =
      pool.length > 0
        ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          pool.pop()!
        : await new Promise<T>((resolve, reject) => {
            queue.push(comparable);
            resolverMap.set(comparable, resolve);
            if (abortSignal) {
              abortSignal.addEventListener(
                "abort",
                () => {
                  queue.remove(comparable);
                  resolverMap.delete(comparable);
                  reject(new AbortError());
                },
                { once: true },
              );
            }
          });

    try {
      return await callback(resource);
    } finally {
      if (queue.length > 0) {
        // We just asserted this as defined
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const nextComparable: C = queue.pop()!;
        // We hold this invariant manually
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const next: (value: T) => void = resolverMap.get(nextComparable)!;
        resolverMap.delete(nextComparable);

        // We defer a microtick here to avoid synchronously jumping between two consumers.
        // We don't need to await or catch on this invocation of `next` because it's a
        // resolver that cannot actually throw.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        Promise.resolve().then(() => next(resource));
      } else {
        pool.push(resource);
      }
    }
  };
};

/**
 * A "Simplified" wrapper around resourcePool for cases where the resource is simply a concurrency
 * limit, abort behavior is not needed, and all callbacks have equal priority.
 */
export const sizedPool = <R>(size: number) => {
  if (size < 1) {
    throw new Error(`Invalid pool size: ${size}`);
  }
  const exec = resourcePool<number, R>(semaphore(size), () => 0);
  return (callback: ResourcedCallback<number, R>) => exec(null, callback, callback);
};
