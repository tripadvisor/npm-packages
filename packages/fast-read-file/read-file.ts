import { open, read, close, fstat } from "node:fs";

/**
 * By providing a working buffer we're often able to elide an fstat call/extra read calls over a
 * naive implementation by optimistically assuming our files fit inside our buffer, and relying on a
 * more expensive fallback in the case where that assumption fails.
 */
export const readFile = (buffer: Buffer, path: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const BUFFER_SIZE = buffer.length;
    // Using the raw callback APIs demonstrated a perf advantage over the fs.promises variants,
    // sadly, so we're stuck writing some pretty lengthy code here.
    open(path, "r", (openErr, fd) => {
      if (openErr) {
        reject(openErr);
        return;
      }
      // We use null as the offset here because, weirdly, it elides a parameter validation in fs.
      // @ts-expect-error That said, Typescript doesn't know that null is a valid offset.
      read(fd, buffer, null, BUFFER_SIZE, -1, (readErr, bytesRead) => {
        if (readErr) {
          close(fd, () => {
            reject(readErr);
          });
          return;
        }

        // If the file fit in our buffer, we've hit the happy path and just need to memcpy it out.
        if (bytesRead < BUFFER_SIZE) {
          close(fd, (closeErr) => {
            if (closeErr) {
              reject(closeErr);
              return;
            }
            resolve(result);
          });
          // This is wonky, but: the above callback is guaranteed to execute after these calls.
          // Ordering it this way, then, parallelizes the async close call with our alloc/memcpy.
          // We need to use a `var` here to ensure `result` is available for the above callback
          // closure—the alternative is a late-initialized `let` higher in the block scope.
          // eslint-disable-next-line no-var
          var result = Buffer.allocUnsafe(bytesRead);
          buffer.copy(result, 0, 0, bytesRead);
          return;
        }

        // Otherwise, the buffer is known to be the first BUFFER_SIZE chunk of the file, but we
        // still have an unknown number of bytes remaining in the file and at this point it's
        // potentially likely that the file is quite large, so it makes sense for us to take the
        // time to do an fstat call to ensure we only need a single additional read.
        fstat(fd, (statErr, stat) => {
          if (statErr) {
            close(fd, () => {
              reject(statErr);
            });
            return;
          }

          const result = Buffer.allocUnsafe(stat.size);
          read(fd, result, bytesRead, stat.size - bytesRead, -1, (secondaryReadErr) => {
            if (secondaryReadErr) {
              close(fd, () => {
                reject(secondaryReadErr);
              });
              return;
            }
            close(fd, (closeErr) => {
              if (closeErr) {
                reject(closeErr);
                return;
              }
              resolve(result);
            });
          });

          // The ordering here follows the same pattern as above, we're just not able to do the
          // allocation late in this case as the buffer needs to be available for the read call.
          buffer.copy(result);
        });
      });
    });
  });
