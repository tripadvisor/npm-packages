import * as fs from "node:fs";
import * as crypto from "node:crypto";

import Benchmark from "benchmark";
import { fdir, PathsOutput } from "fdir";
import xxhashIntializer from "xxhash-wasm";

import { sizedPool } from "promisified-resource-pool";
import { readFile } from "fast-read-file";

import { hashFile } from "./throttled";

const xxhash = await xxhashIntializer();

const pool = sizedPool(20);

const nmPaths = (await new fdir()
  .withBasePath()
  .crawl("../../node_modules")
  .withPromise()) as PathsOutput;

await new Promise<void>((suiteResolver) => {
  new Benchmark.Suite()
    .add(`fs.readFileSync + node:crypto md5`, {
      defer: true,
      fn: (deferred: Benchmark.Deferred) => {
        nmPaths.forEach((path) => {
          const hash = crypto.createHash("md5");
          hash.update(fs.readFileSync(path));
          hash.digest("hex");
        });
        deferred.resolve();
      },
    })
    .add(`fast-hash-file`, {
      defer: true,
      fn: async (deferred: Benchmark.Deferred) => {
        await Promise.all(nmPaths.map((path) => hashFile(path)));
        deferred.resolve();
      },
    })
    .add(`fast-read-file + xxhash-wasm`, {
      defer: true,
      fn: async (deferred: Benchmark.Deferred) => {
        await Promise.all(nmPaths.map(async (path) => xxhash.h64Raw(await readFile(path))));
        deferred.resolve();
      },
    })
    .add(`pooled fs.readFile + node:crypto md5`, {
      defer: true,
      fn: async (deferred: Benchmark.Deferred) => {
        await Promise.all(
          nmPaths.map((path) =>
            pool(
              () =>
                new Promise((resolve) => {
                  fs.readFile(path, (err, data) => {
                    const hash = crypto.createHash("md5");
                    hash.update(data);
                    resolve(hash.digest("hex"));
                  });
                }),
            ),
          ),
        );
        deferred.resolve();
      },
    })
    .add(`pooled fs.readFile + node:crypto sha256`, {
      defer: true,
      fn: async (deferred: Benchmark.Deferred) => {
        await Promise.all(
          nmPaths.map((path) =>
            pool(
              () =>
                new Promise((resolve) => {
                  fs.readFile(path, (err, data) => {
                    const hash = crypto.createHash("sha256");
                    hash.update(data);
                    resolve(hash.digest("hex"));
                  });
                }),
            ),
          ),
        );
        deferred.resolve();
      },
    })
    .add(`pooled fs.readFile + node:crypto sha1`, {
      defer: true,
      fn: async (deferred: Benchmark.Deferred) => {
        await Promise.all(
          nmPaths.map((path) =>
            pool(
              () =>
                new Promise((resolve) => {
                  fs.readFile(path, (err, data) => {
                    const hash = crypto.createHash("sha1");
                    hash.update(data);
                    resolve(hash.digest("hex"));
                  });
                }),
            ),
          ),
        );
        deferred.resolve();
      },
    })
    .add(`pooled fs.readFile + xxhash-wasm`, {
      defer: true,
      fn: async (deferred: Benchmark.Deferred) => {
        await Promise.all(
          nmPaths.map((path) =>
            pool(
              () =>
                new Promise((resolve) => {
                  fs.readFile(path, (err, data) => {
                    resolve(xxhash.h64Raw(data));
                  });
                }),
            ),
          ),
        );
        deferred.resolve();
      },
    })
    .add(`pooled fs.createReadStream + node:crypto sha1`, {
      defer: true,
      fn: async (deferred: Benchmark.Deferred) => {
        await Promise.all(
          nmPaths.map((path) =>
            pool(
              () =>
                new Promise((resolve) => {
                  const hash = crypto.createHash("sha1").setEncoding("hex");
                  fs.createReadStream(path)
                    .pipe(hash)
                    .once("finish", () => resolve(hash.read()));
                }),
            ),
          ),
        );
        deferred.resolve();
      },
    })
    .on("cycle", function (event: Benchmark.Event) {
      console.log(String(event.target));
    })
    .on("complete", function (this: Benchmark.Suite) {
      console.log(`Fastest is ${this.filter("fastest").map("name").toString()}\n`);
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
      .add(`fs.createReadStream + sha1 (${size})`, {
        defer: true,
        fn: async (deferred: Benchmark.Deferred) => {
          await new Promise((resolve) => {
            const hash = crypto.createHash("sha1").setEncoding("hex");
            fs.createReadStream(path)
              .pipe(hash)
              .once("finish", () => resolve(hash.read()));
          });
          deferred.resolve();
        },
      })
      .add(`fs.readFile + sha1 (${size})`, {
        defer: true,
        fn: async (deferred: Benchmark.Deferred) => {
          await new Promise((resolve) => {
            fs.readFile(path, (err, data) => {
              const hash = crypto.createHash("sha1");
              hash.update(data);
              resolve(hash.digest("hex"));
            });
          });
          deferred.resolve();
        },
      })
      .add(`fast-read-file + xxhash-wasm (${size})`, {
        defer: true,
        fn: async (deferred: Benchmark.Deferred) => {
          xxhash.h64Raw(await readFile(path));
          deferred.resolve();
        },
      })
      .add(`fast-hash-file (${size})`, {
        defer: true,
        fn: async (deferred: Benchmark.Deferred) => {
          await hashFile(path);
          deferred.resolve();
        },
      })
      .on("cycle", function (event: Benchmark.Event) {
        console.log(String(event.target));
      })
      .on("complete", function (this: Benchmark.Suite) {
        console.log(`Fastest for ${size} is ${this.filter("fastest").map("name").toString()}\n`);
        resolve();
      })
      .run();
  });
}

const buffer = Buffer.allocUnsafe(64 * 1024);
new Benchmark.Suite()
  .add("Buffer.subarray", () => {
    buffer.subarray(0, buffer.length);
  })
  .add("Buffer.from", () => {
    Buffer.from(buffer.buffer, 0, buffer.length);
  })
  .on("cycle", function (event: Benchmark.Event) {
    console.log(String(event.target));
  })
  .on("complete", function (this: Benchmark.Suite) {
    console.log(`Fastest for memory view is ${this.filter("fastest").map("name").toString()}\n`);
  })
  .run();
