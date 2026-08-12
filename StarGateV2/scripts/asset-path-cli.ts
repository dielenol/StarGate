import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import {
  buildStarGateV2AssetPath,
  PUBLIC_ASSET_FORMATS,
  type PublicAssetFormat,
  type StarGateV2AssetSpec,
} from "../lib/assets/spec.ts";

export interface AssetPathCliInput {
  category?: string;
  collection?: string;
  domain?: string;
  entitySlug?: string;
  format?: string;
  role?: string;
  section?: string;
  sessionSlug?: string;
  variant?: string;
}

export interface AssetDestination {
  filePath: `public/assets/${string}`;
  publicPath: `/assets/${string}`;
}

const DOMAINS = [
  "catalog",
  "character",
  "equipment-shop",
  "npc",
  "npc-collection",
  "research",
  "session-report",
  "shop",
  "wiki",
  "world-view",
] as const;

function requireValue(value: string | undefined, option: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${option} 옵션이 필요합니다.`);
  return normalized;
}

function selectValue<const Values extends readonly string[]>(
  value: string | undefined,
  values: Values,
  option: string,
): Values[number] {
  const normalized = requireValue(value, option);
  if (!values.includes(normalized)) {
    throw new Error(
      `${option} 값은 ${values.join(", ")} 중 하나여야 합니다: ${normalized}`,
    );
  }
  return normalized as Values[number];
}

function optionalFormat(
  value: string | undefined,
): PublicAssetFormat | undefined {
  if (!value) return undefined;
  return selectValue(value, PUBLIC_ASSET_FORMATS, "--format");
}

export function createAssetSpec(
  input: AssetPathCliInput,
): StarGateV2AssetSpec {
  const domain = selectValue(input.domain, DOMAINS, "--domain");
  const entitySlug = requireValue(input.entitySlug, "--entity-slug");
  const format = optionalFormat(input.format);

  switch (domain) {
    case "character":
      return {
        domain,
        entitySlug,
        role: selectValue(
          input.role,
          ["main-image", "pixel-character", "pixel-profile", "poster"],
          "--role",
        ),
        format: format
          ? selectValue(format, ["png", "webp"], "--format")
          : undefined,
      };
    case "npc": {
      const role = selectValue(
        input.role,
        ["main-image", "mood", "pixel-character", "pixel-profile", "profile"],
        "--role",
      );
      const npcFormat = format
        ? selectValue(format, ["png", "webp"], "--format")
        : undefined;
      return role === "mood"
        ? {
            domain,
            entitySlug,
            role,
            variant: requireValue(input.variant, "--variant"),
            format: npcFormat,
          }
        : { domain, entitySlug, role, format: npcFormat };
    }
    case "npc-collection":
      return {
        domain,
        entitySlug,
        collection: selectValue(
          input.collection,
          ["portraits", "relationship"],
          "--collection",
        ),
        variant: requireValue(input.variant, "--variant"),
        format: format
          ? selectValue(format, ["png", "webp"], "--format")
          : undefined,
      };
    case "catalog":
      return {
        domain,
        entitySlug,
        category: selectValue(
          input.category,
          ["consumables", "equipment", "samples", "special"],
          "--category",
        ),
        format,
      };
    case "shop":
      return {
        domain,
        entitySlug,
        section: selectValue(
          input.section,
          ["events", "hud", "items"],
          "--section",
        ),
        format: format
          ? selectValue(
              format,
              ["avif", "gif", "jpeg", "jpg", "png", "webp"],
              "--format",
            )
          : undefined,
      };
    case "equipment-shop":
      return {
        domain,
        entitySlug,
        section: selectValue(
          input.section,
          ["rooms", "simulator"],
          "--section",
        ),
        format: format
          ? selectValue(
              format,
              ["avif", "gif", "jpeg", "jpg", "png", "webp"],
              "--format",
            )
          : undefined,
      };
    case "research":
    case "world-view":
      return {
        domain,
        entitySlug,
        format: format
          ? selectValue(
              format,
              ["avif", "gif", "jpeg", "jpg", "png", "webp"],
              "--format",
            )
          : undefined,
      };
    case "session-report":
      return {
        domain,
        entitySlug,
        sessionSlug: requireValue(input.sessionSlug, "--session-slug"),
        format: format
          ? selectValue(
              format,
              ["avif", "gif", "jpeg", "jpg", "png", "webp"],
              "--format",
            )
          : undefined,
      };
    case "wiki":
      return {
        domain,
        entitySlug,
        section: selectValue(
          input.section,
          ["entities", "places"],
          "--section",
        ),
        format: format
          ? selectValue(
              format,
              ["avif", "gif", "jpeg", "jpg", "png", "webp"],
              "--format",
            )
          : undefined,
      };
  }
}

export function resolveAssetDestination(
  input: AssetPathCliInput,
): AssetDestination {
  const publicPath = buildStarGateV2AssetPath(createAssetSpec(input));
  return {
    publicPath,
    filePath: path.posix.join("public", publicPath) as `public/assets/${string}`,
  };
}

const USAGE = `사용법:
  pnpm asset:path -- --domain <domain> --entity-slug <slug> [domain options]

예시:
  pnpm asset:path -- --domain npc --entity-slug Irena-Vukovic-Suture --role mood --variant recovery
  pnpm asset:path -- --domain catalog --category equipment --entity-slug tactical-claymore --plain`;

function run(): void {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  const { values } = parseArgs({
    args,
    options: {
      category: { type: "string" },
      collection: { type: "string" },
      domain: { type: "string" },
      "entity-slug": { type: "string" },
      format: { type: "string" },
      help: { short: "h", type: "boolean" },
      plain: { type: "boolean" },
      role: { type: "string" },
      section: { type: "string" },
      "session-slug": { type: "string" },
      variant: { type: "string" },
    },
    strict: true,
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }

  const destination = resolveAssetDestination({
    category: values.category,
    collection: values.collection,
    domain: values.domain,
    entitySlug: values["entity-slug"],
    format: values.format,
    role: values.role,
    section: values.section,
    sessionSlug: values["session-slug"],
    variant: values.variant,
  });
  console.log(
    values.plain ? destination.filePath : JSON.stringify(destination, null, 2),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error(USAGE);
    process.exitCode = 1;
  }
}
