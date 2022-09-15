import test from "node:test";
import assert from "node:assert";
import { hashFile } from "./hash-file";
import xxhashIntializer from "xxhash-wasm";

const xxhash = await xxhashIntializer();

await test("It should hash files' contents the same as xxhash does", async () => {
  const filePath = "../../fixtures/micro.txt";
  assert.equal(
    await hashFile(Buffer.allocUnsafe(1024), filePath, xxhash),
    xxhash.h64("hello world"),
  );
});

await test("It should hash files' contents the same as xxhsum does with an oversized buffer", async () => {
  const filePath = "../../fixtures/small.txt";
  assert.equal(
    await hashFile(Buffer.allocUnsafe(1024), filePath, xxhash),
    0x29eea1ad1ba99d57n, // xxhsum -H64 fixtures/small.txt
  );
});

await test("It should hash files' contents the same as xxhsum does with a precisely sized buffer", async () => {
  const filePath = "../../fixtures/small.txt";
  assert.equal(
    await hashFile(Buffer.allocUnsafe(1003), filePath, xxhash),
    0x29eea1ad1ba99d57n, // xxhsum -H64 fixtures/small.txt
  );
});

await test("It should hash files' contents the same as xxhsum does with an undersized buffer", async () => {
  const filePath = "../../fixtures/small.txt";
  assert.equal(
    await hashFile(Buffer.allocUnsafe(1000), filePath, xxhash),
    0x29eea1ad1ba99d57n, // xxhsum -H64 fixtures/small.txt
  );
});

await test("It should hash large files' contents the same as xxhsum does", async () => {
  const filePath = "../../fixtures/large.txt";
  assert.equal(
    await hashFile(Buffer.allocUnsafe(64 * 1024), filePath, xxhash),
    0xb4f85e7e4844d8c2n, // xxhsum -H64 fixtures/large.txt
  );
});
