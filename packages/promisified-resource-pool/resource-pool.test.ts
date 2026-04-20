import test from "node:test";
import assert from "node:assert";

import { resourcePool, unprioritizedResourcePool, sizedPool } from "./resource-pool";

interface Fulfillable {
  priority: number;
  promise: Promise<void>;
  resolve: () => void;
  reject: () => void;
  isSettled: () => boolean;
}

const fulfillablePromise = (priority = 0): Fulfillable => {
  let isSettled = false;
  let resolve: () => void;
  let reject: () => void;
  return {
    priority,
    promise: new Promise<void>((resolver, rejecter) => {
      resolve = resolver;
      reject = rejecter;
    }),
    resolve: () => {
      isSettled = true;
      resolve();
    },
    reject: () => {
      isSettled = true;
      reject();
    },
    isSettled: () => isSettled,
  };
};

await test("It should execute all provided callbacks", async () => {
  const resources = ["foo", "bar"];
  const { dispatch } = resourcePool<string, unknown>(resources);

  let consumptions = 0;
  const consumer = async () => {
    consumptions++;
    await Promise.resolve();
  };

  await Promise.all([
    dispatch(null, {}, consumer),
    dispatch(null, {}, consumer),
    dispatch(null, {}, consumer),
  ]);

  assert.equal(consumptions, 3);
});

await test("It should enqueue callbacks without sufficient resources", async () => {
  const resources = ["foo", "bar"];
  const { dispatch } = resourcePool<string, Fulfillable>(resources);

  const task1 = fulfillablePromise();
  const task2 = fulfillablePromise();
  const task3 = fulfillablePromise();

  const promises = [
    dispatch(null, task1, async () => {
      task1.resolve();
      await task1.promise;
    }),
    dispatch(null, task2, async () => {
      task2.resolve();
      await task2.promise;
    }),
    dispatch(null, task3, async () => {
      task3.resolve();
      await task3.promise;
    }),
  ];

  assert(task1.isSettled(), "The initial task should be immediately settled");
  assert(task2.isSettled(), "The second task should also be immediately settled");
  assert(!task3.isSettled(), "After initially being enqueued, the task should not be settled.");
  await Promise.all(promises);
});

await test("It should prioritize callbacks according to the comparator", async () => {
  const resources = ["foo"];
  const { dispatch } = resourcePool<string, Fulfillable>(
    resources,
    (c1, c2) => c2.priority - c1.priority,
  );

  const task1 = fulfillablePromise();
  const task2 = fulfillablePromise();
  const task3 = fulfillablePromise(1);

  const promises = [
    dispatch(null, task1, async () => {
      task1.resolve();
      await task1.promise;
    }),
    dispatch(null, task2, async () => {
      task2.resolve();
      await task2.promise;
    }),
    dispatch(null, task3, async () => {
      task3.resolve();
      await task3.promise;
    }),
  ];

  assert(task1.isSettled(), "The initial task should be immediately settled");
  assert(!task2.isSettled(), "Task 2 should be enqueued");
  assert(!task3.isSettled(), "Task 3 should also be enqueued");

  await task3.promise;

  assert(!task2.isSettled(), "Task 2 should still be enqueued");

  await Promise.all(promises);
});

await test("It should abort callbacks when asked", async () => {
  const resources = ["foo"];
  const { dispatch } = resourcePool<string, Fulfillable>(resources);

  const task1 = fulfillablePromise();
  const task2 = fulfillablePromise();
  const task3 = fulfillablePromise();

  const abortController = new AbortController();

  const promises = [
    dispatch(abortController.signal, task1, async () => {
      task1.resolve();
      await task1.promise;
    }),
    dispatch(abortController.signal, task2, async () => {
      task2.resolve();
      await task2.promise;
    }),
  ];

  abortController.abort();

  assert(task1.isSettled(), "The initial task should be immediately settled");
  assert(!task2.isSettled(), "The second task should be pending");

  let caught = false;
  try {
    await dispatch(abortController.signal, task3, async () => {
      task3.resolve();
      await task3.promise;
    });
  } catch {
    caught = true;
  }
  assert(caught, "The pool immediately throws on a-priori aborted tasks");

  await Promise.allSettled(promises);
  assert(!task2.isSettled(), "The second task should never have run");
  assert(!task3.isSettled(), "The third task should never have run");
});

await test("It should abort callbacks when asked with prioritization", async () => {
  const resources = ["foo"];
  const { dispatch } = resourcePool<string, Fulfillable>(
    resources,
    (c1, c2) => c2.priority - c1.priority,
  );

  const task1 = fulfillablePromise();
  const task2 = fulfillablePromise();
  const task3 = fulfillablePromise(1);

  const abortController = new AbortController();

  const promises = [
    dispatch(abortController.signal, task1, async () => {
      task1.resolve();
      await task1.promise;
    }),
    dispatch(abortController.signal, task2, async () => {
      task2.resolve();
      await task2.promise;
    }),
    dispatch(abortController.signal, task3, async () => {
      task3.resolve();
      await task3.promise;
    }),
  ];

  assert(task1.isSettled(), "The initial task should be immediately settled");
  assert(!task2.isSettled(), "The second task should be pending");
  assert(!task3.isSettled(), "The third task should be pending");

  await task3.promise;
  abortController.abort();

  await Promise.allSettled(promises);

  assert(!task2.isSettled(), "The second task should never have run");
});

await test("It should abort a previously-queued dispatch when the same comparable is re-dispatched", async () => {
  const resources = ["foo"];
  const { dispatch } = resourcePool<string, string>(resources);

  const block = fulfillablePromise();
  const primary = dispatch(null, "held", async () => {
    await block.promise;
  });

  let firstRan = false;
  const first = dispatch(null, "shared", () => {
    firstRan = true;
    return Promise.resolve();
  });

  let secondRan = false;
  const second = dispatch(null, "shared", () => {
    secondRan = true;
    return Promise.resolve();
  });

  await assert.rejects(first, { name: "AbortError" });

  block.resolve();
  await primary;
  await second;

  assert(!firstRan, "The initial dispatch should have been aborted before running");
  assert(secondRan, "The replacement dispatch should have run");
});

await test("Aborting the signal of a deduped dispatch must not evict its replacement", async () => {
  const resources = ["foo"];
  const { dispatch } = resourcePool<string, string>(resources);

  const block = fulfillablePromise();
  const primary = dispatch(null, "held", async () => {
    await block.promise;
  });

  const controller = new AbortController();
  const first = dispatch(controller.signal, "shared", () => Promise.resolve());

  let replacementRan = false;
  const replacement = dispatch(null, "shared", () => {
    replacementRan = true;
    return Promise.resolve();
  });

  await assert.rejects(first, { name: "AbortError" });

  // The first dispatch's abort listener is still attached to `controller`.
  // Firing it here must not evict the replacement from the queue.
  controller.abort();

  block.resolve();
  await primary;
  await replacement;

  assert(replacementRan, "The replacement should have received the resource");
});

await test("remove() on an in-pool resource prevents it from being dispatched", async () => {
  const resources = ["foo", "bar"];
  const { dispatch, remove } = resourcePool<string, unknown>(resources);

  remove("foo");

  const seen: Array<string> = [];
  await Promise.all([
    dispatch(null, {}, (r) => {
      seen.push(r);
      return Promise.resolve();
    }),
    dispatch(null, {}, (r) => {
      seen.push(r);
      return Promise.resolve();
    }),
  ]);

  assert.deepEqual(
    seen.sort(),
    ["bar", "bar"],
    "Every dispatch should have received the non-removed resource",
  );
});

await test("remove() on the last pool resource rejects all queued waiters", async () => {
  const resources = ["foo"];
  const { dispatch, remove } = resourcePool<string, string>(resources);

  const block = fulfillablePromise();
  const held = dispatch(null, "held", async () => {
    await block.promise;
  });

  const waiter1 = dispatch(null, "one", () => Promise.resolve());
  const waiter2 = dispatch(null, "two", () => Promise.resolve());

  remove("foo");
  block.resolve();
  await held;

  await assert.rejects(waiter1, /exhausted/);
  await assert.rejects(waiter2, /exhausted/);
});

await test("dispatch into a fully-removed pool rejects synchronously", async () => {
  const { dispatch, remove } = resourcePool<string, unknown>(["foo"]);
  remove("foo");

  await assert.rejects(
    dispatch(null, {}, () => Promise.resolve()),
    /exhausted/,
  );
});

await test("unprioritizedResourcePool executes callbacks and reuses resources", async () => {
  const exec = unprioritizedResourcePool<string>(["foo"]);
  const results: Array<string> = [];
  await Promise.all([
    exec(null, (r) => {
      results.push(r);
      return Promise.resolve();
    }),
    exec(null, (r) => {
      results.push(r);
      return Promise.resolve();
    }),
    exec(null, (r) => {
      results.push(r);
      return Promise.resolve();
    }),
  ]);
  assert.deepEqual(results, ["foo", "foo", "foo"]);
});

await test("unprioritizedResourcePool aborts queued callbacks", async () => {
  const exec = unprioritizedResourcePool<string>(["foo"]);
  const block = fulfillablePromise();

  const primary = exec(null, async () => {
    await block.promise;
  });

  const controller = new AbortController();
  const aborted = exec(controller.signal, () => Promise.resolve());

  controller.abort();
  await assert.rejects(aborted, { name: "AbortError" });
  block.resolve();
  await primary;
});

await test("sizedPool limits concurrency", async () => {
  const exec = sizedPool(2);
  let active = 0;
  let maxActive = 0;

  await Promise.all(
    Array.from({ length: 8 }, () =>
      exec(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active--;
      }),
    ),
  );

  assert.equal(maxActive, 2);
});

await test("sizedPool rejects invalid sizes", () => {
  assert.throws(() => sizedPool(0), /Invalid pool size/);
});
