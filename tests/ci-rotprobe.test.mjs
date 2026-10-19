import assert from "node:assert/strict";
import test from "node:test";

// Absichtlich rot: belegt, dass die CI fehlschlaegt. Wird nicht gemergt.
const erfundeneIban = "DE14123456780000004711";

test("Rotprobe", () => {
  assert.equal(erfundeneIban.length, 0);
});
