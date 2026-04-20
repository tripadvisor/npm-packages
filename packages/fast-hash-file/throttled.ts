import { unprioritizedResourcePool } from "promisified-resource-pool";
import xxhashIntializer from "xxhash-wasm";

import { hashFile as rawHashFile } from "./hash-file";

// wasm pages are 64K, so it really only makes sense to bother with buffers on that scale.
const BUFFER_SIZE = 64 * 1024;

// Empirically, there seemed to be diminishing returns going beyond this, and it's already a fairly
// high default, so I've chosen to leave it here. In practice the ideal settings will be specific
// to the particular environment you're running in, and it may prove wise to configure your own
// pool accordingly.
const POOL_SIZE = 48;
const pool: Array<Buffer> = [];
while (pool.length < POOL_SIZE) {
  pool.push(Buffer.allocUnsafe(BUFFER_SIZE));
}
const exec = unprioritizedResourcePool<Buffer>(pool);
const xxhash = await xxhashIntializer();

export const hashFile = (filepath: string, seed?: bigint) => {
  const callback = (buffer: Buffer) => rawHashFile(buffer, filepath, xxhash, seed);
  return exec(null, callback);
};
