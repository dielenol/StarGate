import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

export interface CommittedRepositorySource {
  repositoryRoot: string;
  repositoryPath: string;
  projectPath: string;
  /** Immutable repository snapshot used by every Git lookup below. */
  headOid: string;
  commitSha: string;
  committedAt: Date;
}

export interface RepositorySourceInspection {
  source?: CommittedRepositorySource;
  /** Exact bytes inspected against HEAD; callers derive hashes from this snapshot. */
  content: Buffer;
  issues: string[];
}

function isInside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

function gitText(cwd: string, args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/**
 * Repository provenance may only point at immutable, reconstructable input.
 * The working file must be tracked and byte-identical to HEAD, and its locator
 * is pinned to the last commit that changed that path.
 */
export function inspectCommittedRepositorySource(
  file: string,
  options: { projectRoot: string; requiredRoot: string },
): RepositorySourceInspection {
  const absoluteFile = realpathSync(resolve(file));
  const projectRoot = realpathSync(resolve(options.projectRoot));
  const requiredRoot = realpathSync(resolve(options.requiredRoot));
  const contentBefore = readFileSync(absoluteFile);
  let inspectedContent = contentBefore;
  const issues: string[] = [];

  let repositoryRoot: string;
  try {
    repositoryRoot = gitText(projectRoot, ["rev-parse", "--show-toplevel"]);
  } catch {
    return { content: inspectedContent, issues: ["git_repository_unavailable"] };
  }

  if (!isInside(requiredRoot, absoluteFile)) {
    issues.push("outside_seed_payload_root");
  }
  if (!isInside(repositoryRoot, absoluteFile)) {
    issues.push("outside_git_repository");
    return { content: inspectedContent, issues };
  }

  const repositoryPath = relative(repositoryRoot, absoluteFile).split(sep).join("/");
  const projectPath = relative(projectRoot, absoluteFile).split(sep).join("/");
  let headOid = "";
  try {
    headOid = gitText(repositoryRoot, ["rev-parse", "HEAD"]);
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(headOid)) {
      issues.push("head_identity_unavailable");
    }
  } catch {
    issues.push("head_identity_unavailable");
  }

  if (headOid) {
    try {
      const headBytes = execFileSync(
        "git",
        ["-C", repositoryRoot, "show", `${headOid}:${repositoryPath}`],
        { encoding: "buffer", stdio: ["ignore", "pipe", "ignore"] },
      );
      inspectedContent = readFileSync(absoluteFile);
      if (!contentBefore.equals(inspectedContent)) {
        issues.push("source_changed_during_inspection");
      }
      if (!headBytes.equals(inspectedContent)) {
        issues.push("working_tree_differs_from_head");
      }
    } catch {
      issues.push("not_tracked_at_head");
    }
  }

  let commitSha = "";
  let committedAt: Date | undefined;
  try {
    commitSha = gitText(repositoryRoot, [
      "log",
      "-1",
      "--format=%H",
      headOid,
      "--",
      repositoryPath,
    ]);
    const committedAtText = gitText(repositoryRoot, [
      "show",
      "-s",
      "--format=%cI",
      commitSha,
    ]);
    committedAt = new Date(committedAtText);
    if (!commitSha || Number.isNaN(committedAt.getTime())) {
      issues.push("commit_identity_unavailable");
    }
  } catch {
    issues.push("commit_identity_unavailable");
  }

  return issues.length > 0 || !committedAt
    ? { content: inspectedContent, issues: [...new Set(issues)] }
    : {
        content: inspectedContent,
        issues: [],
        source: {
          repositoryRoot,
          repositoryPath,
          projectPath,
          headOid,
          commitSha,
          committedAt,
        },
      };
}

export function assertCommittedRepositorySource(
  file: string,
  options: { projectRoot: string; requiredRoot: string },
): CommittedRepositorySource {
  const inspected = inspectCommittedRepositorySource(file, options);
  if (!inspected.source) {
    throw new Error(
      `[repository-source] 커밋된 seed 원본만 WRITE할 수 있습니다: ${relative(
        options.projectRoot,
        file,
      )} (${inspected.issues.join(", ")})`,
    );
  }
  return inspected.source;
}
