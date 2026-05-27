import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const outputDir = "outputs/finanzmodell-v1-startmappe";

export function releasePipelineSteps() {
  return [
    {
      id: "build_start_workbook",
      script: "workbook-build/build_finanzmodell_v1.mjs",
      produces: ["start_workbook"],
    },
    {
      id: "build_review_workbook",
      script: "workbook-build/build_proposal_review_workbook.mjs",
      produces: ["review_workbook"],
    },
    {
      id: "build_decision_plan",
      script: "workbook-build/build_review_decision_plan.mjs",
      produces: ["decision_plan"],
    },
    {
      id: "write_verified_workbook",
      script: "workbook-build/write_verified_finanzmodell_v1.mjs",
      produces: ["verified_workbook"],
    },
    {
      id: "apply_review_to_start_workbook",
      script: "workbook-build/apply_review_decision_plan_to_finance_copy.mjs",
      produces: ["start_apply_noop"],
    },
    {
      id: "apply_review_to_verified_workbook",
      script: "workbook-build/apply_review_decision_plan_to_verified_finance_copy.mjs",
      produces: ["verified_apply_noop"],
    },
    {
      id: "verify_start_workbook",
      script: "workbook-build/verify_finanzmodell_v1.mjs",
      produces: [],
    },
  ];
}

export function releaseArtifactPaths() {
  return [
    {
      id: "start_workbook",
      path: `${outputDir}/Finanzmodell_V1_Startmappe.xlsx`,
    },
    {
      id: "review_workbook",
      path: `${outputDir}/Finanzmodell_V1_Vorschlagsreview.xlsx`,
    },
    {
      id: "decision_plan",
      path: `${outputDir}/Finanzmodell_V1_Review_Entscheidungsplan.xlsx`,
    },
    {
      id: "verified_workbook",
      path: `${outputDir}/Finanzmodell_V1_Verifiziert.xlsx`,
    },
    {
      id: "start_apply_noop",
      path: `${outputDir}/Finanzmodell_V1_Applied_Review_NoOp.xlsx`,
    },
    {
      id: "verified_apply_noop",
      path: `${outputDir}/Finanzmodell_V1_Verifiziert_Applied_Review_NoOp.xlsx`,
    },
  ];
}

export function buildReleaseManifest({ status, steps, artifacts, generatedAt = new Date().toISOString() }) {
  return {
    manifestVersion: 1,
    generatedAt,
    status,
    steps,
    artifacts,
    handoffArtifactId: "verified_apply_noop",
    notes: [
      "Startmappe bleibt der rote Roh-Buildzustand.",
      "Verifizierte Apply-NoOp-Kopie ist der aktuelle Uebergabestand ohne angenommene Review-Entscheidungen.",
    ],
  };
}

async function fileSha256(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function collectReleaseArtifacts({ artifacts = releaseArtifactPaths() } = {}) {
  return Promise.all(
    artifacts.map(async (artifact) => {
      try {
        const stats = await fs.stat(artifact.path);
        return {
          ...artifact,
          exists: true,
          sizeBytes: stats.size,
          sha256: await fileSha256(artifact.path),
        };
      } catch (error) {
        if (error?.code === "ENOENT") {
          return { ...artifact, exists: false, sizeBytes: 0, sha256: null };
        }
        throw error;
      }
    }),
  );
}

function runNodeScript(script, { cwd = process.cwd() } = {}) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({
        status: code === 0 ? "ok" : "failed",
        exitCode: code,
        durationMs: Date.now() - startedAt,
        stdoutPreview: stdout.slice(-4000),
        stderrPreview: stderr.slice(-4000),
      });
    });
  });
}

export async function runReleasePipeline({
  cwd = process.cwd(),
  manifestPath = `${outputDir}/Finanzmodell_V1_Pipeline_Manifest.json`,
} = {}) {
  const steps = [];
  for (const step of releasePipelineSteps()) {
    const result = await runNodeScript(step.script, { cwd });
    steps.push({ ...step, ...result });
    if (result.status !== "ok") {
      const artifacts = await collectReleaseArtifacts();
      const manifest = buildReleaseManifest({ status: "failed", steps, artifacts });
      await fs.mkdir(path.dirname(manifestPath), { recursive: true });
      await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      return { manifestPath, manifest };
    }
  }

  const artifacts = await collectReleaseArtifacts();
  const status = artifacts.every((artifact) => artifact.exists) ? "ok" : "failed";
  const manifest = buildReleaseManifest({ status, steps, artifacts });
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifestPath, manifest };
}
