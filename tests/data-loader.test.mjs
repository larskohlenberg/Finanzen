import assert from "node:assert/strict";
import { test } from "node:test";
import { parseJsonl } from "../app/data-loader.mjs";

test("parseJsonl parses non-empty lines and ignores blanks", () => {
  assert.deepEqual(parseJsonl('{"a":1}\n\n{"b":2}\n'), [{ a: 1 }, { b: 2 }]);
});

test("parseJsonl reports the source path and line number", () => {
  assert.throws(
    () => parseJsonl('{"a":1}\nkaputt\n', "data/master/test.jsonl"),
    /data\/master\/test\.jsonl:2:/,
  );
});
