import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { DIALOGUE_SOURCE_MANIFEST } from "./manifest.ts";
import type {
  DialogueEntry,
  DialogueSourceDefinition,
  DialogueSourceDiagnostic,
  ProtectedToken,
  ProtectedTokenKind,
} from "./types.ts";

const DEFAULT_MINIMUM_CHARACTERS = 12;
const KOREAN_PATTERN = /[가-힣]/u;

const NUMBER_PATTERN =
  /(?:[A-Za-z]{1,12}[- ]?)?\d+(?:[.,]\d+)*(?:\s*(?:%|퍼센트|밀리초|초|분|시간|라운드|턴|발|명|개|칸|박|단계|크레딧))?\+?/gu;
const PLACEHOLDER_PATTERN = /\$\{[^{}]+\}/gu;
const QUOTED_LABEL_PATTERNS = [
  /["“]([^"”\n]{1,40})["”]/gu,
  /['‘]([^'’\n]{1,40})['’]/gu,
  /「([^」\n]{1,40})」/gu,
  /『([^』\n]{1,40})』/gu,
  /`([^`\n]{1,40})`/gu,
] as const;

const PROJECT_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function normalizeDialogueText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function pushToken(
  tokens: ProtectedToken[],
  seen: Set<string>,
  kind: ProtectedTokenKind,
  value: string,
): void {
  const key = `${kind}\u0000${value}`;
  if (!value || seen.has(key)) return;
  seen.add(key);
  tokens.push({ kind, value });
}

export function extractProtectedTokens(
  text: string,
  allowedProperNouns: readonly string[] = [],
): ProtectedToken[] {
  const tokens: ProtectedToken[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    pushToken(tokens, seen, "placeholder", match[0]);
  }
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    pushToken(tokens, seen, "number", match[0]);
  }
  for (const pattern of QUOTED_LABEL_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      pushToken(tokens, seen, "quoted-label", match[0]);
    }
  }
  for (const properNoun of allowedProperNouns) {
    if (text.includes(properNoun)) {
      pushToken(tokens, seen, "proper-noun", properNoun);
    }
  }

  return tokens;
}

function templateExpressionText(
  node: ts.TemplateExpression,
  sourceFile: ts.SourceFile,
): string {
  let result = node.head.text;
  for (const span of node.templateSpans) {
    result += `\${${span.expression.getText(sourceFile)}}${span.literal.text}`;
  }
  return result;
}

function staticStringText(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    return templateExpressionText(node, sourceFile);
  }
  return null;
}

function propertyAssignmentName(node: ts.Node): string | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isPropertyAssignment(current)) {
      const { name } = current;
      if (
        ts.isIdentifier(name) ||
        ts.isStringLiteral(name) ||
        ts.isNumericLiteral(name)
      ) {
        return name.text;
      }
      return null;
    }
    if (
      ts.isVariableDeclaration(current) ||
      ts.isStatement(current) ||
      ts.isSourceFile(current)
    ) {
      return null;
    }
    current = current.parent;
  }
  return null;
}

function isSelectedProperty(
  source: DialogueSourceDefinition,
  node: ts.Node,
): boolean {
  if (!source.propertyNames || source.propertyNames.length === 0) return true;
  const propertyName = propertyAssignmentName(node);
  return propertyName !== null && source.propertyNames.includes(propertyName);
}

function variableDeclarationName(node: ts.Node): string | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isVariableDeclaration(current)) {
      return ts.isIdentifier(current.name) ? current.name.text : null;
    }
    if (ts.isSourceFile(current)) return null;
    current = current.parent;
  }
  return null;
}

function isSelectedVariable(
  source: DialogueSourceDefinition,
  node: ts.Node,
): boolean {
  if (!source.variableNames || source.variableNames.length === 0) return true;
  const variableName = variableDeclarationName(node);
  return variableName !== null && source.variableNames.includes(variableName);
}

export function extractDialogueEntriesFromText(
  source: DialogueSourceDefinition,
  sourceText: string,
): DialogueEntry[] {
  const sourceFile = ts.createSourceFile(
    source.relativePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    source.relativePath.endsWith(".tsx")
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS,
  );
  const minimumCharacters =
    source.minimumCharacters ?? DEFAULT_MINIMUM_CHARACTERS;
  const entries: DialogueEntry[] = [];

  function visit(node: ts.Node): void {
    const rawText = staticStringText(node, sourceFile);
    if (rawText !== null) {
      const text = normalizeDialogueText(rawText);
      if (
        isSelectedProperty(source, node) &&
        isSelectedVariable(source, node) &&
        KOREAN_PATTERN.test(text) &&
        text.length >= minimumCharacters
      ) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        entries.push({
          id: `${source.speakerId}:${source.relativePath}:${position.line + 1}:${position.character + 1}`,
          speakerId: source.speakerId,
          speakerName: source.displayName,
          voiceCard: source.voiceCard,
          allowedProperNouns: source.allowedProperNouns,
          sourcePath: source.relativePath,
          line: position.line + 1,
          column: position.character + 1,
          text,
          protectedTokens: extractProtectedTokens(
            text,
            source.allowedProperNouns,
          ),
        });
      }
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return entries;
}

export async function loadDialogueEntries(options?: {
  projectRoot?: string;
  manifest?: readonly DialogueSourceDefinition[];
}): Promise<{
  entries: DialogueEntry[];
  diagnostics: DialogueSourceDiagnostic[];
}> {
  const projectRoot = options?.projectRoot ?? PROJECT_ROOT;
  const manifest = options?.manifest ?? DIALOGUE_SOURCE_MANIFEST;
  const entries: DialogueEntry[] = [];
  const diagnostics: DialogueSourceDiagnostic[] = [];

  for (const source of manifest) {
    const absolutePath = resolve(projectRoot, source.relativePath);
    try {
      const sourceText = await readFile(absolutePath, "utf8");
      entries.push(...extractDialogueEntriesFromText(source, sourceText));
    } catch (error) {
      const errorCode =
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : null;
      const missing = errorCode === "ENOENT";
      diagnostics.push({
        speakerId: source.speakerId,
        sourcePath: source.relativePath,
        kind: missing ? "missing-source" : "read-error",
        message: missing
          ? `등록된 대사 소스가 없습니다: ${source.relativePath}`
          : `등록된 대사 소스를 읽지 못했습니다: ${source.relativePath}`,
      });
    }
  }

  return { entries, diagnostics };
}
