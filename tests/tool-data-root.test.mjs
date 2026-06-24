import assert from "node:assert/strict";
import { test } from "node:test";
import { dataRootFromArg } from "../app/tools/data-root.mjs";

test("dataRootFromArg returns the fallback when no explicit root is given", () => {
  const fallback = new URL("../app/data/master/", import.meta.url);

  assert.equal(dataRootFromArg(undefined, fallback).href, fallback.href);
});

test("dataRootFromArg resolves app-relative demo root with a trailing slash", () => {
  const root = dataRootFromArg("app/data/demo", new URL("../app/data/master/", import.meta.url));

  assert.ok(root.href.endsWith("/app/data/demo/"));
});

test("dataRootFromArg resolves data/* roots relative to the app root", () => {
  const appRoot = new URL("../app/", import.meta.url);
  const root = dataRootFromArg("data/demo", new URL("../app/data/master/", import.meta.url), appRoot);

  assert.equal(root.href, new URL("data/demo/", appRoot).href);
});
