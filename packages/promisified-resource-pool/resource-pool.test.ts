import test from "node:test";
import assert from "node:assert";

import { resourcePool } from "./resource-pool";

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
  const pool = resourcePool(resources);

  let consumptions = 0;
  const consumer = async () => {
    consumptions++;
    await Promise.resolve();
  };

  await Promise.all([
    pool(null, () => consumer(), consumer),
    pool(null, () => consumer(), consumer),
    pool(null, () => consumer(), consumer),
  ]);

  assert.equal(consumptions, 3);
});

await test("It should enqueue callbacks without sufficient resources", async () => {
  const resources = ["foo", "bar"];
  // https://github.com/typescript-eslint/typescript-eslint/issues/3612
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  const pool = resourcePool<string, void, Fulfillable>(resources);

  const task1 = fulfillablePromise();
  const task2 = fulfillablePromise();
  const task3 = fulfillablePromise();

  const promises = [
    pool(null, task1, async () => {
      task1.resolve();
      await task1.promise;
    }),
    pool(null, task2, async () => {
      task2.resolve();
      await task2.promise;
    }),
    pool(null, task3, async () => {
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
  // https://github.com/typescript-eslint/typescript-eslint/issues/3612
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  const pool = resourcePool<string, void, Fulfillable>(
    resources,
    (c1, c2) => c2.priority - c1.priority,
  );

  const task1 = fulfillablePromise();
  const task2 = fulfillablePromise();
  const task3 = fulfillablePromise(1);

  const promises = [
    pool(null, task1, async () => {
      task1.resolve();
      await task1.promise;
    }),
    pool(null, task2, async () => {
      task2.resolve();
      await task2.promise;
    }),
    pool(null, task3, async () => {
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
  // https://github.com/typescript-eslint/typescript-eslint/issues/3612
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  const pool = resourcePool<string, void, Fulfillable>(resources);

  const task1 = fulfillablePromise();
  const task2 = fulfillablePromise();
  const task3 = fulfillablePromise();

  const abortController = new AbortController();

  const promises = [
    pool(abortController.signal, task1, async () => {
      task1.resolve();
      await task1.promise;
    }),
    pool(abortController.signal, task2, async () => {
      task2.resolve();
      await task2.promise;
    }),
  ];

  abortController.abort();

  assert(task1.isSettled(), "The initial task should be immediately settled");
  assert(!task2.isSettled(), "The second task should be pending");

  let caught = false;
  try {
    await pool(abortController.signal, task3, async () => {
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
  // https://github.com/typescript-eslint/typescript-eslint/issues/3612
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  const pool = resourcePool<string, void, Fulfillable>(
    resources,
    (c1, c2) => c2.priority - c1.priority,
  );

  const task1 = fulfillablePromise();
  const task2 = fulfillablePromise();
  const task3 = fulfillablePromise(1);

  const abortController = new AbortController();

  const promises = [
    pool(abortController.signal, task1, async () => {
      task1.resolve();
      await task1.promise;
    }),
    pool(abortController.signal, task2, async () => {
      task2.resolve();
      await task2.promise;
    }),
    pool(abortController.signal, task3, async () => {
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
