import test from "node:test";
import assert from "node:assert/strict";
import { buildReleaseManifest, releaseArtifactPaths, releasePipelineSteps } from "../src/releasePipeline.mjs";

test("defines the release pipeline in dependency order", () => {
  assert.deepEqual(
    releasePipelineSteps().map((step) => step.id),
    [
      "build_start_workbook",
      "build_review_workbook",
      "build_decision_plan",
      "write_verified_workbook",
      "apply_review_to_start_workbook",
      "apply_review_to_verified_workbook",
      "verify_start_workbook",
    ],
  );
});

test("builds a release manifest with all expected workbook artifacts", () => {
  const manifest = buildReleaseManifest({
    status: "ok",
    steps: releasePipelineSteps().map((step) => ({
      ...step,
      status: "ok",
      durationMs: 12,
      stdoutPreview: "{}",
    })),
    artifacts: releaseArtifactPaths().map((artifact) => ({
      ...artifact,
      exists: true,
      sizeBytes: 100,
      sha256: `sha-${artifact.id}`,
    })),
  });

  assert.equal(manifest.status, "ok");
  assert.equal(manifest.steps.length, 7);
  assert.deepEqual(
    manifest.artifacts.map((artifact) => artifact.id),
    [
      "start_workbook",
      "review_workbook",
      "decision_plan",
      "verified_workbook",
      "start_apply_noop",
      "verified_apply_noop",
    ],
  );
  assert.equal(manifest.artifacts.every((artifact) => artifact.exists), true);
});
