#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_BASE_REF = "78dd3969";
const DEFAULT_HEAD_REF = "HEAD";
const HISTORY_DIRECTORY = "StarGateV2/docs/work-history";
const CANDIDATE_TYPES = new Set([
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "style",
]);
const PAGE_CODE_PREFIXES = [
  "StarGateV2/app/",
  "StarGateV2/components/",
  "StarGateV2/hooks/",
  "StarGateV2/lib/",
  "StarGateV2/styles/",
  "StarGateV2/types/",
];
const PAGE_CODE_FILES = new Set([
  "StarGateV2/next.config.ts",
  "StarGateV2/proxy.ts",
]);

export function parseConventionalType(subject) {
  return subject.match(/^([a-z][a-z0-9-]*)(?:\([^)]*\))?!?:\s+/)?.[1] ?? null;
}

export function isPageProductionPath(filePath) {
  if (
    !PAGE_CODE_FILES.has(filePath) &&
    !PAGE_CODE_PREFIXES.some((prefix) => filePath.startsWith(prefix))
  ) {
    return false;
  }

  if (filePath.startsWith("StarGateV2/app/api/vtt/")) {
    return false;
  }

  return !(
    /(?:^|\/)__tests__\//.test(filePath) ||
    /(?:^|\/)tests?\//.test(filePath) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(filePath) ||
    filePath.endsWith(".snap")
  );
}

export function extractReferencedHashes(markdown) {
  const hashes = new Set();

  for (const line of markdown.split(/\r?\n/)) {
    if (!/^-\s+관련\s+.*커밋\s*:/.test(line)) {
      continue;
    }

    for (const match of line.matchAll(/\b[0-9a-f]{7,40}\b/g)) {
      hashes.add(match[0]);
    }
  }

  return hashes;
}

function isReferenced(commitHash, referencedHashes) {
  return [...referencedHashes].some((hash) => commitHash.startsWith(hash));
}

export function findLikelyOmissions({
  commits,
  equivalentDocumentedHashes = new Set(),
  referencedHashes,
  integratedByMerge = new Map(),
  revertedHashes = new Set(),
}) {
  const candidates = commits.filter(
    (commit) =>
      CANDIDATE_TYPES.has(parseConventionalType(commit.subject)) &&
      commit.paths.some(isPageProductionPath),
  );
  const candidatesByHash = new Map(
    candidates.map((commit) => [commit.hash, commit]),
  );
  const branchCandidatesByMerge = new Map();

  for (const candidate of candidates) {
    const mergeHash = integratedByMerge.get(candidate.hash);
    if (!mergeHash) {
      continue;
    }

    const branchCandidates = branchCandidatesByMerge.get(mergeHash) ?? [];
    branchCandidates.push(candidate);
    branchCandidatesByMerge.set(mergeHash, branchCandidates);
  }

  const omissions = [];
  let directCount = 0;
  let equivalentCount = 0;
  let mergeIntegratedCount = 0;
  let revertedCount = 0;

  const hasDocumentedCoverage = (commitHash) =>
    isReferenced(commitHash, referencedHashes) ||
    equivalentDocumentedHashes.has(commitHash);

  for (const candidate of candidates) {
    if (isReferenced(candidate.hash, referencedHashes)) {
      directCount += 1;
      continue;
    }

    if (equivalentDocumentedHashes.has(candidate.hash)) {
      equivalentCount += 1;
      continue;
    }

    if (revertedHashes.has(candidate.hash)) {
      revertedCount += 1;
      continue;
    }

    const mergeHash = integratedByMerge.get(candidate.hash);
    if (mergeHash && candidatesByHash.has(mergeHash)) {
      mergeIntegratedCount += 1;
      continue;
    }

    if (candidate.parents.length > 1) {
      const branchCandidates = branchCandidatesByMerge.get(candidate.hash) ?? [];
      if (
        branchCandidates.some((commit) =>
          hasDocumentedCoverage(commit.hash),
        )
      ) {
        mergeIntegratedCount += 1;
        continue;
      }
    }

    omissions.push(candidate);
  }

  return {
    candidateCount: candidates.length,
    directCount,
    equivalentCount,
    mergeIntegratedCount,
    revertedCount,
    omissions,
  };
}

function git(repoRoot, args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function resolveCommit(repoRoot, ref) {
  return git(repoRoot, ["rev-parse", "--verify", `${ref}^{commit}`]);
}

function parseArguments(argv) {
  const options = {
    base: DEFAULT_BASE_REF,
    head: DEFAULT_HEAD_REF,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--base" || argument === "--head") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${argument} 뒤에 Git ref가 필요합니다.`);
      }
      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }

    if (argument === "--help") {
      options.help = true;
      continue;
    }

    throw new Error(`알 수 없는 인자: ${argument}`);
  }

  return options;
}

function readHistoryMarkdown(repoRoot, ref) {
  const result = spawnSync(
    "git",
    [
      "grep",
      "-h",
      "-E",
      "^-[[:space:]]+관련[[:space:]]+.*커밋[[:space:]]*:",
      ref,
      "--",
      HISTORY_DIRECTORY,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  if (result.status === 0) {
    return result.stdout;
  }
  if (result.status === 1) {
    return "";
  }

  throw new Error(result.stderr || "작업 이력 문서를 읽지 못했습니다.");
}

function loadCommits(repoRoot, range) {
  const recordSeparator = "\x1e";
  const fieldSeparator = "\x1f";
  const output = git(repoRoot, [
    "log",
    "--reverse",
    `--format=%H%x1f%P%x1f%s%x1f%B%x1e`,
    range,
  ]);

  if (!output) {
    return [];
  }

  return output
    .split(recordSeparator)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, parentsText, subject, ...bodyParts] = record.split(fieldSeparator);
      const parents = parentsText ? parentsText.split(" ") : [];
      const paths = parents.length > 0
        ? git(repoRoot, ["diff", "--name-only", parents[0], hash, "--"])
        : git(repoRoot, [
            "diff-tree",
            "--root",
            "--no-commit-id",
            "--name-only",
            "-r",
            hash,
          ]);

      return {
        body: bodyParts.join(fieldSeparator),
        hash,
        parents,
        paths: paths ? paths.split("\n") : [],
        subject,
      };
    });
}

function buildMergeIntegrationMap(repoRoot, commits) {
  const commitHashes = new Set(commits.map((commit) => commit.hash));
  const integratedByMerge = new Map();

  for (const commit of commits) {
    if (commit.parents.length < 2) {
      continue;
    }

    const [firstParent, ...branchParents] = commit.parents;
    for (const branchParent of branchParents) {
      const branchCommits = git(repoRoot, [
        "rev-list",
        `${firstParent}..${branchParent}`,
      ]);

      for (const branchHash of branchCommits.split("\n").filter(Boolean)) {
        if (commitHashes.has(branchHash) && !integratedByMerge.has(branchHash)) {
          integratedByMerge.set(branchHash, commit.hash);
        }
      }
    }
  }

  return integratedByMerge;
}

function patchId(repoRoot, commitHash) {
  const patch = execFileSync(
    "git",
    ["show", "--pretty=format:", "--no-ext-diff", commitHash],
    {
      cwd: repoRoot,
      encoding: "buffer",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const output = execFileSync("git", ["patch-id", "--stable"], {
    cwd: repoRoot,
    encoding: "utf8",
    input: patch,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();

  return output.split(/\s+/)[0] || null;
}

function findEquivalentDocumentedHashes(repoRoot, commits, referencedHashes) {
  const reachableCommitLines = git(repoRoot, [
    "log",
    "--all",
    "--format=%H%x1f%s",
  ]).split("\n");
  const documentedBySubject = new Map();

  for (const line of reachableCommitLines) {
    const [hash, subject] = line.split("\x1f");
    if (!hash || !isReferenced(hash, referencedHashes)) {
      continue;
    }

    const hashes = documentedBySubject.get(subject) ?? [];
    hashes.push(hash);
    documentedBySubject.set(subject, hashes);
  }

  const equivalentDocumentedHashes = new Set();
  const patchIds = new Map();
  const getPatchId = (hash) => {
    if (!patchIds.has(hash)) {
      patchIds.set(hash, patchId(repoRoot, hash));
    }
    return patchIds.get(hash);
  };

  for (const commit of commits) {
    if (
      commit.parents.length > 1 ||
      isReferenced(commit.hash, referencedHashes) ||
      !CANDIDATE_TYPES.has(parseConventionalType(commit.subject)) ||
      !commit.paths.some(isPageProductionPath)
    ) {
      continue;
    }

    const documentedHashes = documentedBySubject.get(commit.subject) ?? [];
    if (documentedHashes.length === 0) {
      continue;
    }

    const candidatePatchId = getPatchId(commit.hash);
    if (
      candidatePatchId &&
      documentedHashes.some(
        (documentedHash) => getPatchId(documentedHash) === candidatePatchId,
      )
    ) {
      equivalentDocumentedHashes.add(commit.hash);
    }
  }

  return equivalentDocumentedHashes;
}

function treesMatch(repoRoot, left, right) {
  const result = spawnSync("git", ["diff", "--quiet", left, right, "--"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status === 0) {
    return true;
  }
  if (result.status === 1) {
    return false;
  }

  throw new Error(result.stderr || "Git tree 비교에 실패했습니다.");
}

function findRevertedHashes(repoRoot, commits) {
  const commitsByHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const revertedHashes = new Set();

  for (const commit of commits) {
    if (parseConventionalType(commit.subject) !== "revert") {
      continue;
    }

    for (const match of commit.body.matchAll(
      /(?:This reverts commit|reverts? commit)\s+([0-9a-f]{7,40})/gi,
    )) {
      const target = commits.find((item) => item.hash.startsWith(match[1]));
      if (target) {
        revertedHashes.add(target.hash);
      }
    }

    const parent = commitsByHash.get(commit.parents[0]);
    const beforeParent = parent?.parents[0];
    if (parent && beforeParent && treesMatch(repoRoot, beforeParent, commit.hash)) {
      revertedHashes.add(parent.hash);
    }
  }

  return revertedHashes;
}

function escapeWorkflowCommand(value) {
  return value
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

function printHelp() {
  console.log(`Usage: node scripts/audit-page-work-history.mjs [options]

Options:
  --base <ref>  감사 범위의 기준 ref (기본값: ${DEFAULT_BASE_REF})
  --head <ref>  감사 범위의 끝 ref (기본값: ${DEFAULT_HEAD_REF})
  --help        도움말 출력`);
}

function printResult(result, baseHash, headHash) {
  console.log(
    `페이지 작업 이력 감사: ${baseHash.slice(0, 8)}..${headHash.slice(0, 8)}`,
  );
  console.log(
    `후보 ${result.candidateCount}건 · 직접 기록 ${result.directCount}건 · ` +
      `동일 patch 기록 ${result.equivalentCount}건 · ` +
      `merge 포함 ${result.mergeIntegratedCount}건 · 되돌림 ${result.revertedCount}건`,
  );

  if (result.omissions.length === 0) {
    console.log("누락 후보가 없습니다.");
    return;
  }

  for (const commit of result.omissions) {
    const path = commit.paths.find(isPageProductionPath) ?? HISTORY_DIRECTORY;
    const message = `${commit.hash.slice(0, 8)} ${commit.subject} (${path})`;
    console.warn(`경고: 페이지 작업 이력 누락 후보 — ${message}`);

    if (process.env.GITHUB_ACTIONS === "true") {
      console.log(
        `::warning file=${HISTORY_DIRECTORY}/README.md,title=페이지 작업 이력 누락 후보::${escapeWorkflowCommand(message)}`,
      );
    }
  }

  console.warn(
    "누락 후보는 휴리스틱 결과입니다. 이력 대상이면 route 문서에 기록하고, 아니면 경고를 검토만 하세요.",
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(scriptDirectory, "../..");
  const headHash = resolveCommit(repoRoot, options.head);
  const baseRef = /^0+$/.test(options.base) ? `${headHash}^` : options.base;
  const baseHash = resolveCommit(repoRoot, baseRef);
  const commits = loadCommits(repoRoot, `${baseHash}..${headHash}`);
  const referencedHashes = extractReferencedHashes(
    readHistoryMarkdown(repoRoot, headHash),
  );
  const result = findLikelyOmissions({
    commits,
    equivalentDocumentedHashes: findEquivalentDocumentedHashes(
      repoRoot,
      commits,
      referencedHashes,
    ),
    referencedHashes,
    integratedByMerge: buildMergeIntegrationMap(repoRoot, commits),
    revertedHashes: findRevertedHashes(repoRoot, commits),
  });

  printResult(result, baseHash, headHash);
}

const isMain =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((error) => {
    console.error(
      `페이지 작업 이력 감사를 실행하지 못했습니다: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  });
}
