# `fast-hash-file`: A microoptimized file hasher

## Overview

`fast-hash-file` is a performant, concurrency-limited, non-cryptographic file hasher exposing a simple promise-based API. Every effort has been made to choose the "performance" option behind the top-level API. By default, `fast-hash-file` will allocate a pool of forty-eight 64K Buffers and an instance of [`xxhash-wasm`](https://github.com/jungomi/xxhash-wasm). Each request to `hashFile` will then wait for one of these Buffers to be available, and produce the hash without the need to read the entire file into memory.

## Benchmarks

From node 18.9.0 on a 2019 Intel MacBook Pro (2.4 GHz/32GB/1TB):

```
fs.readFileSync + node:crypto md5 x 2.03 ops/sec ±2.61% (15 runs sampled)
fast-hash-file x 7.65 ops/sec ±4.20% (41 runs sampled)
fast-read-file + xxhash-wasm x 6.15 ops/sec ±3.39% (35 runs sampled)
pooled fs.readFile + node:crypto md5 x 2.79 ops/sec ±1.18% (18 runs sampled)
pooled fs.readFile + node:crypto sha256 x 2.19 ops/sec ±0.83% (15 runs sampled)
pooled fs.readFile + node:crypto sha1 x 3.17 ops/sec ±0.95% (20 runs sampled)
pooled fs.readFile + xxhash-wasm x 5.38 ops/sec ±1.82% (30 runs sampled)
pooled fs.createReadStream + node:crypto sha1 x 1.60 ops/sec ±6.10% (13 runs sampled)
```

## Usage

Basic usage:

```
import { hashFile } from 'fast-hash-file';

await hashFile('./path/to/file.txt'); // Return a bigint hash of the file contents
```

If you'd like to customize the Buffer pool or sizes in use, the raw file hasher is available to offer no allocation overhead and full control. You'll additionally need to provide an instance of xxhash-wasm, which can and should be reused to avoid initializing new webassembly modules.

```
import { hashFile } from 'fast-hash-file/raw';
import xxhashInitializer from 'xxhash-wasm';

const workingBuffer = Buffer.allocUnsafe(64 * 1024);
const xxhash = await xxhashInitializer();

await hashFile(workingBuffer, './path/to/file.txt', xxhash); // Return a bigint hash of the file contents
```
