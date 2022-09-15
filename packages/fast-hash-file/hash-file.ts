import { open, read, close } from "node:fs";
import type { XXHash, XXHashAPI } from "xxhash-wasm";

/**
 * It turns out hashing files is a pretty important and performance sensitive operation.
 * Thus, it often makes sense for us to optimize a bit beyond the simplistic fs.promises.readFile
 * + crypto.hash. The approach here is to have a set of 64k (wasm page-size) buffers that we've
 * allocated ahead of time. Hash-File requests come in and are throttled both to allow for
 * availability of these buffers as well as to limit the number of open files we have at any point
 * in time.
 *
 * We'll assume the vast majority of files are < 64K, so it makes sense for us to optimize this case
 * (potentially even at the expense of the >64K case).
 */
export const hashFile = (buffer: Buffer, path: string, xxhash: XXHashAPI): Promise<bigint> =>
  new Promise((resolve, reject) => {
    const BUFFER_SIZE = buffer.length;
    // Using the raw callback APIs demonstrated a perf advantage over the fs.promises variants,
    // sadly, so we're stuck writing some pretty lengthy code here.
    open(path, "r", (openErr, fd) => {
      if (openErr) {
        reject(openErr);
        return;
      }

      // We use null as the offset here because, weirdly, this elides a parameter validation in fs
      // @ts-expect-error That said, Typescript doesn't know that null is a valid offset.
      read(fd, buffer, null, BUFFER_SIZE, -1, (readErr, bytesRead) => {
        if (readErr) {
          close(fd, () => {
            reject(readErr);
          });
          return;
        }

        // If we've fit the whole file into our buffer, it's more efficient to avoid the 3 wasm
        // calls and just do a one-time hash.
        if (bytesRead < BUFFER_SIZE) {
          close(fd, (closeErr) => {
            if (closeErr) {
              reject(closeErr);
              return;
            }
            resolve(result);
          });
          // This is wonky, but: the above callback is guaranteed to execute after this. That
          // enables us to parallelize the hashing-on-CPU-work with the filesystem IO to close.
          // We need to use a `var` here to ensure `result` is available for the above callback
          // closure—the alternative is a late-initialized `let` higher in the block scope.
          // eslint-disable-next-line no-var
          var result = xxhash.h64Raw(buffer.subarray(0, bytesRead));
          return;
        }

        // If we _haven't_ fit the whole file, we'll do an incremental hash.
        const hash: XXHash<bigint> = xxhash.create64();
        hash.update(buffer);

        function doRead() {
          // @ts-expect-error Typescript doesn't know that null is a valid offset.
          read(fd, buffer, null, BUFFER_SIZE, -1, (secondaryReadErr, secondaryBytesRead) => {
            if (secondaryReadErr) {
              close(fd, () => {
                reject(secondaryReadErr);
              });
              return;
            }

            if (secondaryBytesRead === BUFFER_SIZE) {
              hash.update(buffer);
              doRead();
            } else {
              hash.update(buffer.subarray(0, secondaryBytesRead));
              close(fd, (closeErr) => {
                if (closeErr) {
                  reject(closeErr);
                  return;
                }
                resolve(result);
              });
              // eslint-disable-next-line no-var
              var result = hash.digest();
            }
          });
        }
        doRead();
      });
    });
  });
