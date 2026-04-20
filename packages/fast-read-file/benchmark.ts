import * as fs from "node:fs";
import { promisify } from "node:util";

import Benchmark from "benchmark";
import gracefulFs from "graceful-fs";
import { fdir } from "fdir";

import { sizedPool } from "promisified-resource-pool";

import { readFile as rawReadFile } from "./read-file";
import { readFile } from "./throttled";

const pool = sizedPool(20);
const buffer = Buffer.allocUnsafe(64 * 1024);
const promisifiedReadFile = promisify(fs.readFile);

const nmPaths: Array<string> = await new fdir()
  .withBasePath()
  .crawl("../../node_modules")
  .withPromise();

await new Promise<void>((suiteResolver) => {
  new Benchmark.Suite()
    .add(`fs.readFileSync (mixed)`, {
      defer: true,
      fn: (deferred: Benchmark.Deferred) => {
        nmPaths.forEach((path) => {
          fs.readFileSync(path);
        });
        deferred.resolve();
      },
    })
    .add(`fast-read-file (mixed)`, {
      defer: true,
      fn: async (deferred: Benchmark.Deferred) => {
        await Promise.all(nmPaths.map((path) => readFile(path)));
        deferred.resolve();
      },
    })
    .add(`pooled fs.readFile (mixed)`, {
      defer: true,
      fn: async (deferred: Benchmark.Deferred) => {
        await Promise.all(
          nmPaths.map((path) =>
            pool(
              () =>
                new Promise((resolve) => {
                  fs.readFile(path, (_err, data) => {
                    resolve(data);
                  });
                }),
            ),
          ),
        );
        deferred.resolve();
      },
    })
    .add(`pooled promisified fs.readFile (mixed)`, {
      defer: true,
      fn: async (deferred: Benchmark.Deferred) => {
        await Promise.all(nmPaths.map((path) => pool(() => promisifiedReadFile(path))));
        deferred.resolve();
      },
    })
    .add(`pooled fs.promises.readFile (mixed)`, {
      defer: true,
      fn: async (deferred: Benchmark.Deferred) => {
        await Promise.all(nmPaths.map((path) => pool(() => fs.promises.readFile(path))));
        deferred.resolve();
      },
    })
    .add(`gracefulFs.readFile (mixed)`, {
      defer: true,
      fn: async (deferred: Benchmark.Deferred) => {
        await Promise.all(
          nmPaths.map(
            (path) =>
              new Promise((resolve) => {
                gracefulFs.readFile(path, (_err, data) => {
                  resolve(data);
                });
              }),
          ),
        );
        deferred.resolve();
      },
    })
    .on("cycle", function (event: Benchmark.Event) {
      // Benchmark.Target defines a custom toString, but @types/benchmark omits it.
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      console.log(String(event.target));
    })
    .on("complete", function (this: Benchmark.Suite) {
      const fastest = this.filter("fastest").map("name").join(",");
      console.log(`Fastest for mixed is ${fastest}\n`);
      suiteResolver();
    })
    .run();
});

for (const [size, path] of Object.entries({
  micro: "../../fixtures/micro.txt",
  small: "../../fixtures/small.txt",
  medium: "../../fixtures/medium.txt",
  large: "../../fixtures/large.txt",
  giant: "../../fixtures/giant.txt",
})) {
  await new Promise<void>((resolve) => {
    new Benchmark.Suite()
      .add(`fs.readFileSync (${size})`, {
        defer: true,
        fn: (deferred: Benchmark.Deferred) => {
          fs.readFileSync(path);
          deferred.resolve();
        },
      })
      .add(`fs.readFile (${size})`, {
        defer: true,
        fn: async (deferred: Benchmark.Deferred) => {
          await new Promise((resolve) => {
            fs.readFile(path, (_err, data) => {
              resolve(data);
            });
          });
          deferred.resolve();
        },
      })
      .add(`promisified fs.readFile (${size})`, {
        defer: true,
        fn: async (deferred: Benchmark.Deferred) => {
          await promisifiedReadFile(path);
          deferred.resolve();
        },
      })
      .add(`fs.promises.readFile (${size})`, {
        defer: true,
        fn: async (deferred: Benchmark.Deferred) => {
          await fs.promises.readFile(path);
          deferred.resolve();
        },
      })
      .add(`fast-read-file raw (${size})`, {
        defer: true,
        fn: async (deferred: Benchmark.Deferred) => {
          await rawReadFile(buffer, path);
          deferred.resolve();
        },
      })
      .add(`pooled fs.promises.readFile (${size})`, {
        defer: true,
        fn: async (deferred: Benchmark.Deferred) => {
          await pool(async () => fs.promises.readFile(path));
          deferred.resolve();
        },
      })
      .add(`gracefulFs.readFile (${size})`, {
        defer: true,
        fn: async (deferred: Benchmark.Deferred) => {
          await new Promise((resolve) => {
            gracefulFs.readFile(path, (_err, data) => {
              resolve(data);
            });
          });
          deferred.resolve();
        },
      })
      .add(`fast-read-file (${size})`, {
        defer: true,
        fn: async (deferred: Benchmark.Deferred) => {
          await readFile(path);
          deferred.resolve();
        },
      })
      .on("cycle", function (event: Benchmark.Event) {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        console.log(String(event.target));
      })
      .on("complete", function (this: Benchmark.Suite) {
        const fastest = this.filter("fastest").map("name").join(",");
        console.log(`Fastest for ${size} is ${fastest}\n`);
        resolve();
      })
      .run();
  });
}

new Benchmark.Suite()
  .add("Buffer.from", () => {
    Buffer.from(buffer.subarray(0, buffer.length));
  })
  .add("Buffer.copy", () => {
    const target = Buffer.allocUnsafe(buffer.length);
    buffer.copy(target, 0, 0, buffer.length);
  })
  .add("TypedArray.set", () => {
    const target = Buffer.allocUnsafe(buffer.length);
    target.set(buffer.subarray(0, target.length));
  })
  .add("Uint8Array.slice", () => {
    Uint8Array.prototype.slice.call(buffer, 0, buffer.length);
  })
  .add("Buffer.concat", () => {
    Buffer.concat([buffer.subarray(0, buffer.length)]);
  })
  .on("cycle", function (event: Benchmark.Event) {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    console.log(String(event.target));
  })
  .on("complete", function (this: Benchmark.Suite) {
    const fastest = this.filter("fastest").map("name").join(",");
    console.log(`Fastest for memcpy is ${fastest}\n`);
  })
  .run();
