# `fast-read-file`: A microoptimized file reader

## Overview

`fast-read-file` is a performant, `EMFILE`-safe file reader exposing a simple promise-based API. Surprisingly, the built-in `node:fs` read file APIs ([to various degrees](https://github.com/nodejs/node/issues/37583)) leave a fair amount of performance on the table. Every effort has been made to choose the "performance" option behind the top-level API of this library. By default, `fast-read-file` will allocate a pool of twenty-four 64K Buffers. Each request to `readFile` will then wait for one of these Buffers to be available, and optimistically attempt to read the file into that buffer, resorting to an additional sized file read operation if required. Accordingly, this library is—by default—tuned to read large numbers of <64k files, but via the `rawReadFile` API, tuning to a particular usecase can be achieved.

## Benchmarks

From node 18.9.0 on a 2019 Intel MacBook Pro (2.4 GHz/32GB/1TB):

```
fs.readFileSync (mixed) x 3.44 ops/sec ±2.76% (21 runs sampled)
fast-read-file (mixed) x 7.65 ops/sec ±2.93% (41 runs sampled)
pooled fs.readFile (mixed) x 6.40 ops/sec ±3.00% (35 runs sampled)
pooled promisified fs.readFile (mixed) x 6.57 ops/sec ±3.55% (36 runs sampled)
pooled fs.promises.readFile (mixed) x 4.29 ops/sec ±1.49% (25 runs sampled)
gracefulFs.readFile (mixed) x 6.24 ops/sec ±2.04% (34 runs sampled)
```

## Usage

Basic usage:

```
import { readFile } from 'fast-read-file';

await readFile('./path/to/file.txt'); // Return a Buffer of the file
```

If you'd like to customize the working Buffer pool or sizes in use, the raw file reader is available to offer no allocation overhead and full control. For optimal performance, you'll want to avoid small (<4K) buffers. 64K provides a reasonable starting point for most filesystem reads.

```
import { readFile } from 'fast-read-file/raw';

const workingBuffer = Buffer.allocUnsafe(64 * 1024);

await readFile(workingBuffer, './path/to/file.txt'); // Return a Buffer of the file
```
