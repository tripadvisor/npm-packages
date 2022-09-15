import { resourcePool } from "promisified-resource-pool";

import { readFile as rawReadFile } from "./read-file";

// The vast majority of files are less than 64K, so this buffer size gives us some good average-case
// performance. It also happens to be the case in testing that 64k is around where the cost of a
// memcpy surpasses the cost of an fstat call, making this a good general-purpose buffer size.
const BUFFER_SIZE = 64 * 1024;

// Empirically, there seemed to be diminishing returns going beyond this, and it's already a fairly
// high default, so I've chosen to leave it here. In practice the ideal settings will be specific
// to the particular environment you're running in, and it may prove wise to configure your own
// pool accordingly.
const POOL_SIZE = 24;
const pool: Buffer[] = [];
while (pool.length < POOL_SIZE) {
  pool.push(Buffer.allocUnsafe(BUFFER_SIZE));
}
const exec = resourcePool<Buffer, Buffer>(pool, () => 0);

/**
 * This throttling simultaneously ensures that we have a viable pool of working buffers for file
 * reads as well as prevents EMFILE errors via excessive concurrent reads.
 */
export const readFile = (filepath: string): Promise<Buffer> => {
  const callback = (buffer: Buffer) => rawReadFile(buffer, filepath);
  return exec(null, callback, callback);
};
