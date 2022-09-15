import test from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";

import { readFile } from "./read-file";

await test("It should read smaller-than-buffer files the same as fs.readFile does", async () => {
  const filePath = "../../fixtures/small.txt";
  assert.equal(
    (await readFile(Buffer.allocUnsafe(32 * 1024), filePath)).toString("utf-8"),
    (await fs.promises.readFile(filePath)).toString("utf-8"),
  );
});

await test("It should read larger-than-buffer files the same as fs.readFile does", async () => {
  const filePath = "../../fixtures/large.txt";
  assert.equal(
    (await readFile(Buffer.allocUnsafe(32 * 1024), filePath)).toString("utf-8"),
    (await fs.promises.readFile(filePath)).toString("utf-8"),
  );
});

await test("It should read buffer-size files the same as fs.readFile does", async () => {
  const filePath = "../../fixtures/small.txt";
  assert.equal(
    (await readFile(Buffer.allocUnsafe(1003), filePath)).toString("utf-8"),
    (await fs.promises.readFile(filePath)).toString("utf-8"),
  );
});

const generateFile = async (filename: string) => {
  const alphabet = "qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM1234567890";
  const generateString = (length: number) => {
    let str = "";

    for (let i = 0; i < length; i++) {
      str += alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    return str;
  };

  const stream = fs.createWriteStream(filename);
  for (let i = 0; i < 10 * 1024; i++) {
    await new Promise<void>((resolve) => {
      stream.write(generateString(1024), () => {
        resolve();
      });
    });
  }
  return new Promise<void>((resolve) => {
    stream.close(() => resolve());
  });
};

await test("It should read gigantic files the same as fs.readFile does", async () => {
  const filePath = "../../fixtures/gigantic.txt";
  await generateFile(filePath);
  assert.equal(
    (await readFile(Buffer.allocUnsafe(32 * 1024), filePath)).toString("utf-8"),
    (await fs.promises.readFile(filePath)).toString("utf-8"),
  );
  await fs.promises.unlink(filePath);
});
