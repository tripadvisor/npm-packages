# Tripadvisor Open Source NPM packages

This repository contains a variety of useful javascript-ecosystem packages that we've decided to contribute back to the community.

## Development

Packages in this repository rely on the `node:test` runner available in Node 18+, making that the required version for development, though packages may (and do) target older runtimes.

This repository uses NPM workspaces. After `npm install`, to build the entire repo you can use: `npm run prepublishOnly --workspaces`, or e.g. `npm run prepublishOnly --workspace=promisified-resource-pool` to build a specific package.

There are dependencies between packages in the repository, and NPM does not run scripts in topological order by default. For initial bootstrapping, always use the following build order:

```
npm install
npm run prepublishOnly --workspace=promisified-resource-pool
npm run prepublishOnly --workspace=fast-read-file
npm run prepublishOnly --workspace=fast-hash-file
```
