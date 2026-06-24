const MAX_INPUT_LENGTH = 500;
const MAX_SEGMENTS = 4;
const MAX_SETS_PER_SEGMENT = 20;
const MAX_DICE_PER_TERM = 100;
const MAX_SIDES = 1000;
const MAX_CHAIN_ROLLS_PER_DIE = 100;
const MAX_TOTAL_DICE_RESULTS = 1000;

export type DiceRollFlags = {
  simplified: boolean;
  hideResults: boolean;
  private: boolean;
  unsorted: boolean;
};

export type DiceRollDetail = {
  notation: string;
  values: string;
  total: number;
  mode: "sum" | "success" | "botch";
};

export type DiceRollSet = {
  expression: string;
  index: number;
  total: number;
  details: DiceRollDetail[];
};

export type DiceRollResult = {
  rawInput: string;
  comment: string | null;
  flags: DiceRollFlags;
  rolls: DiceRollSet[];
};

type Rng = () => number;

type DiceSides =
  | {
      kind: "number";
      value: number;
    }
  | {
      kind: "fudge";
    };

type DiceModifier = {
  explode?: {
    threshold: number | null;
    infinite: boolean;
  };
  reroll?: {
    threshold: number;
    infinite: boolean;
  };
  keepHighest?: number;
  keepLowest?: number;
  dropLowest?: number;
  targets: number[];
  failure?: number;
  botch?: number;
};

type DiceEntry = {
  value: number;
  rolls: number[];
  active: boolean;
  exploded: boolean;
  order: number;
};

type EvalValue = {
  value: number;
  details: DiceRollDetail[];
};

type RollOptions = {
  rng?: Rng;
};

export class DiceRollError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiceRollError";
  }
}

function createEmptyFlags(): DiceRollFlags {
  return {
    simplified: false,
    hideResults: false,
    private: false,
    unsorted: false,
  };
}

function mergeFlags(target: DiceRollFlags, source: Partial<DiceRollFlags>): void {
  target.simplified ||= source.simplified ?? false;
  target.hideResults ||= source.hideResults ?? false;
  target.private ||= source.private ?? false;
  target.unsorted ||= source.unsorted ?? false;
}

function splitComment(input: string): { body: string; comment: string | null } {
  const index = input.indexOf("!");
  if (index === -1) return { body: input, comment: null };
  const comment = input.slice(index + 1).trim();
  return {
    body: input.slice(0, index),
    comment: comment.length > 0 ? comment : null,
  };
}

function stripFlagTokens(segment: string): {
  expression: string;
  flags: Partial<DiceRollFlags>;
} {
  const flags: Partial<DiceRollFlags> = {};
  const kept: string[] = [];

  for (const token of segment.trim().split(/\s+/)) {
    const normalized = token.toLowerCase();
    if (normalized === "s") {
      flags.simplified = true;
      continue;
    }
    if (normalized === "nr") {
      flags.hideResults = true;
      continue;
    }
    if (normalized === "p") {
      flags.private = true;
      continue;
    }
    if (normalized === "ul") {
      flags.unsorted = true;
      continue;
    }
    kept.push(token);
  }

  return {
    expression: kept.join(" ").trim(),
    flags,
  };
}

function expandAlias(expression: string): string {
  const compact = expression.toLowerCase().replace(/\s+/g, "");
  const exactAliases = new Map<string, string>([
    ["+d20", "2d20 d1"],
    ["-d20", "2d20 kl1"],
    ["+d%", "((2d10kl1-1)*10)+1d10"],
    ["-d%", "((2d10k1-1)*10)+1d10"],
    ["dndstats", "6 4d6 k3"],
    ["sr6", "6d6 t5"],
    ["age", "2d6 + 1d6"],
  ]);

  const exact = exactAliases.get(compact);
  if (exact) return exact;

  const d20Alias = /^(attack|skill|save)([+-]\d+)?$/.exec(compact);
  if (d20Alias) {
    return `1d20${d20Alias[2] ?? ""}`;
  }

  return expression;
}

function extractRepeat(expression: string): {
  repeat: number;
  expression: string;
} {
  const repeatMatch = /^(\d+)\s+(.+)$/.exec(expression.trim());
  if (!repeatMatch) {
    return { repeat: 1, expression };
  }

  const repeat = Number(repeatMatch[1]);
  if (
    !Number.isInteger(repeat) ||
    repeat < 2 ||
    repeat > MAX_SETS_PER_SEGMENT
  ) {
    return { repeat: 1, expression };
  }

  return {
    repeat,
    expression: repeatMatch[2].trim(),
  };
}

function randomInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function rollOne(sides: DiceSides, rng: Rng): number {
  if (sides.kind === "fudge") return randomInt(rng, -1, 1);
  return randomInt(rng, 1, sides.value);
}

function maxSideValue(sides: DiceSides): number {
  return sides.kind === "fudge" ? 1 : sides.value;
}

function minSideValue(sides: DiceSides): number {
  return sides.kind === "fudge" ? -1 : 1;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

export function formatDiceTotal(value: number): string {
  return formatNumber(value);
}

function createModifier(): DiceModifier {
  return {
    targets: [],
  };
}

function validateDice(count: number, sides: DiceSides, modifier: DiceModifier): void {
  if (!Number.isInteger(count) || count < 1 || count > MAX_DICE_PER_TERM) {
    throw new DiceRollError(
      `주사위 개수는 1-${MAX_DICE_PER_TERM}개 사이여야 합니다.`,
    );
  }

  if (sides.kind === "number") {
    if (
      !Number.isInteger(sides.value) ||
      sides.value < 2 ||
      sides.value > MAX_SIDES
    ) {
      throw new DiceRollError(`주사위 면 수는 2-${MAX_SIDES} 사이여야 합니다.`);
    }
  }

  const maxValue = maxSideValue(sides);
  const minValue = minSideValue(sides);
  if (modifier.reroll?.infinite && modifier.reroll.threshold >= maxValue) {
    throw new DiceRollError("무한 리롤 조건이 모든 결과를 리롤하게 만듭니다.");
  }
  if (
    modifier.explode?.infinite &&
    (modifier.explode.threshold ?? maxValue) <= minValue
  ) {
    throw new DiceRollError("무한 폭발 조건이 모든 결과를 폭발하게 만듭니다.");
  }
}

function sortByLowest(entries: DiceEntry[]): DiceEntry[] {
  return [...entries].sort((a, b) => a.value - b.value || a.order - b.order);
}

function sortByHighest(entries: DiceEntry[]): DiceEntry[] {
  return [...entries].sort((a, b) => b.value - a.value || a.order - b.order);
}

function applySelection(entries: DiceEntry[], modifier: DiceModifier): void {
  if (modifier.dropLowest) {
    for (const entry of sortByLowest(entries.filter((entry) => entry.active)).slice(
      0,
      modifier.dropLowest,
    )) {
      entry.active = false;
    }
  }

  const activeEntries = entries.filter((entry) => entry.active);
  if (modifier.keepHighest) {
    const keep = new Set(
      sortByHighest(activeEntries)
        .slice(0, modifier.keepHighest)
        .map((entry) => entry.order),
    );
    for (const entry of activeEntries) {
      entry.active = keep.has(entry.order);
    }
  }

  if (modifier.keepLowest) {
    const keep = new Set(
      sortByLowest(entries.filter((entry) => entry.active))
        .slice(0, modifier.keepLowest)
        .map((entry) => entry.order),
    );
    for (const entry of entries) {
      if (entry.active) entry.active = keep.has(entry.order);
    }
  }
}

function displayEntry(entry: DiceEntry): string {
  const chain = entry.rolls.join("->");
  const suffix = entry.exploded ? "!" : "";
  const value = `${chain}${suffix}`;
  return entry.active ? value : `~~${value}~~`;
}

function calculateDiceTotal(
  entries: DiceEntry[],
  modifier: DiceModifier,
): { total: number; mode: DiceRollDetail["mode"] } {
  const activeValues = entries
    .filter((entry) => entry.active)
    .map((entry) => entry.value);

  if (modifier.targets.length > 0 || modifier.failure !== undefined) {
    const failure = modifier.failure;
    const botch = modifier.botch;
    const successes = activeValues.reduce((sum, value) => {
      return (
        sum +
        modifier.targets.reduce(
          (targetSum, target) => targetSum + (value >= target ? 1 : 0),
          0,
        )
      );
    }, 0);
    const failures =
      failure === undefined
        ? 0
        : activeValues.filter((value) => value <= failure).length;
    const botches =
      botch === undefined
        ? 0
        : activeValues.filter((value) => value <= botch).length;
    return {
      total: successes - failures - botches,
      mode: "success",
    };
  }

  if (modifier.botch !== undefined) {
    const botch = modifier.botch;
    return {
      total: activeValues.filter((value) => value <= botch).length,
      mode: "botch",
    };
  }

  return {
    total: activeValues.reduce((sum, value) => sum + value, 0),
    mode: "sum",
  };
}

function rollDiceTerm({
  count,
  sides,
  modifier,
  notation,
  flags,
  rng,
  totalResultCount,
}: {
  count: number;
  sides: DiceSides;
  modifier: DiceModifier;
  notation: string;
  flags: DiceRollFlags;
  rng: Rng;
  totalResultCount: { value: number };
}): EvalValue {
  validateDice(count, sides, modifier);

  const entries: DiceEntry[] = [];
  const maxValue = maxSideValue(sides);
  const explodeThreshold = modifier.explode?.threshold ?? maxValue;

  function pushEntry(
    value: number,
    rolls: number[],
    exploded: boolean,
  ): DiceEntry {
    totalResultCount.value += 1;
    if (totalResultCount.value > MAX_TOTAL_DICE_RESULTS) {
      throw new DiceRollError(
        `한 번에 표시할 수 있는 주사위 결과는 최대 ${MAX_TOTAL_DICE_RESULTS}개입니다.`,
      );
    }

    const entry = {
      value,
      rolls,
      active: true,
      exploded,
      order: entries.length,
    };
    entries.push(entry);
    return entry;
  }

  for (let i = 0; i < count; i += 1) {
    let value = rollOne(sides, rng);
    const rolls = [value];

    if (modifier.reroll) {
      if (modifier.reroll.infinite) {
        let guard = 0;
        while (value <= modifier.reroll.threshold) {
          guard += 1;
          if (guard > MAX_CHAIN_ROLLS_PER_DIE) break;
          value = rollOne(sides, rng);
          rolls.push(value);
        }
      } else if (value <= modifier.reroll.threshold) {
        value = rollOne(sides, rng);
        rolls.push(value);
      }
    }

    const entry = pushEntry(value, rolls, false);

    if (modifier.explode && value >= explodeThreshold) {
      if (modifier.explode.infinite) {
        let guard = 0;
        let current = entry;
        while (current.value >= explodeThreshold) {
          guard += 1;
          if (guard > MAX_CHAIN_ROLLS_PER_DIE) break;
          current.exploded = true;
          const next = rollOne(sides, rng);
          current = pushEntry(next, [next], false);
        }
      } else {
        entry.exploded = true;
        const next = rollOne(sides, rng);
        pushEntry(next, [next], false);
      }
    }
  }

  applySelection(entries, modifier);
  const { total, mode } = calculateDiceTotal(entries, modifier);
  const displayEntries = flags.unsorted ? entries : sortByLowest(entries);

  return {
    value: total,
    details: [
      {
        notation,
        values: flags.hideResults
          ? "(개별 결과 숨김)"
          : `[${displayEntries.map(displayEntry).join(", ")}]`,
        total,
        mode,
      },
    ],
  };
}

class ExpressionParser {
  private pos = 0;
  private readonly text: string;
  private readonly rng: Rng;
  private readonly flags: DiceRollFlags;
  private readonly totalResultCount: { value: number };

  constructor({
    expression,
    rng,
    flags,
    totalResultCount,
  }: {
    expression: string;
    rng: Rng;
    flags: DiceRollFlags;
    totalResultCount: { value: number };
  }) {
    this.text = expression.replace(/\s+/g, "");
    this.rng = rng;
    this.flags = flags;
    this.totalResultCount = totalResultCount;
  }

  parse(): EvalValue {
    if (this.text.length === 0) {
      throw new DiceRollError("굴릴 주사위 식을 입력해 주세요.");
    }

    const value = this.parseExpression();
    if (this.pos !== this.text.length) {
      throw new DiceRollError(
        `해석할 수 없는 문법입니다: '${this.text.slice(this.pos)}'`,
      );
    }
    if (value.details.length === 0) {
      throw new DiceRollError("식에는 최소 1개의 주사위가 포함되어야 합니다.");
    }
    return value;
  }

  private parseExpression(): EvalValue {
    let left = this.parseTerm();
    while (this.peek() === "+" || this.peek() === "-") {
      const op = this.consume();
      const right = this.parseTerm();
      left = {
        value: op === "+" ? left.value + right.value : left.value - right.value,
        details: [...left.details, ...right.details],
      };
    }
    return left;
  }

  private parseTerm(): EvalValue {
    let left = this.parseFactor();
    while (this.peek() === "*" || this.peek() === "/") {
      const op = this.consume();
      const right = this.parseFactor();
      if (op === "/" && right.value === 0) {
        throw new DiceRollError("0으로 나눌 수 없습니다.");
      }
      left = {
        value: op === "*" ? left.value * right.value : left.value / right.value,
        details: [...left.details, ...right.details],
      };
    }
    return left;
  }

  private parseFactor(): EvalValue {
    if (this.peek() === "+") {
      this.consume();
      return this.parseFactor();
    }
    if (this.peek() === "-") {
      this.consume();
      const value = this.parseFactor();
      return {
        value: -value.value,
        details: value.details,
      };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): EvalValue {
    if (this.peek() === "(") {
      this.consume();
      const value = this.parseExpression();
      if (this.peek() !== ")") {
        throw new DiceRollError("닫는 괄호가 없습니다.");
      }
      this.consume();
      return value;
    }

    const dice = this.tryParseDice();
    if (dice) return dice;

    const number = this.readNumber();
    if (number !== null) {
      return {
        value: number,
        details: [],
      };
    }

    throw new DiceRollError(`해석할 수 없는 토큰입니다: '${this.peek() ?? ""}'`);
  }

  private tryParseDice(): EvalValue | null {
    const start = this.pos;
    const countText = this.readDigits();

    if (this.peek()?.toLowerCase() !== "d") {
      this.pos = start;
      return null;
    }

    this.consume();
    const count = countText.length === 0 ? 1 : Number(countText);
    const sides = this.readSides();
    const modifier = this.readModifiers(sides);
    const notation = this.text.slice(start, this.pos);

    return rollDiceTerm({
      count,
      sides,
      modifier,
      notation,
      flags: this.flags,
      rng: this.rng,
      totalResultCount: this.totalResultCount,
    });
  }

  private readSides(): DiceSides {
    const current = this.peek();
    if (current === "%") {
      this.consume();
      return { kind: "number", value: 100 };
    }
    if (current?.toLowerCase() === "f") {
      this.consume();
      return { kind: "fudge" };
    }

    const digits = this.readDigits();
    if (digits.length === 0) {
      throw new DiceRollError("주사위 면 수를 입력해 주세요.");
    }
    return {
      kind: "number",
      value: Number(digits),
    };
  }

  private readModifiers(sides: DiceSides): DiceModifier {
    const modifier = createModifier();
    const defaultExplode = maxSideValue(sides);

    while (this.pos < this.text.length) {
      const rest = this.text.slice(this.pos).toLowerCase();
      if (rest.startsWith("ie")) {
        this.pos += 2;
        modifier.explode = {
          threshold: this.readOptionalPositiveInteger() ?? defaultExplode,
          infinite: true,
        };
        continue;
      }
      if (rest.startsWith("ir")) {
        this.pos += 2;
        modifier.reroll = {
          threshold: this.readRequiredPositiveInteger("ir"),
          infinite: true,
        };
        continue;
      }
      if (rest.startsWith("kl")) {
        this.pos += 2;
        modifier.keepLowest = this.readRequiredPositiveInteger("kl");
        continue;
      }
      if (rest.startsWith("k")) {
        this.pos += 1;
        modifier.keepHighest = this.readRequiredPositiveInteger("k");
        continue;
      }
      if (rest.startsWith("d")) {
        this.pos += 1;
        modifier.dropLowest = this.readRequiredPositiveInteger("d");
        continue;
      }
      if (rest.startsWith("e")) {
        this.pos += 1;
        modifier.explode = {
          threshold: this.readOptionalPositiveInteger() ?? defaultExplode,
          infinite: false,
        };
        continue;
      }
      if (rest.startsWith("r")) {
        this.pos += 1;
        modifier.reroll = {
          threshold: this.readRequiredPositiveInteger("r"),
          infinite: false,
        };
        continue;
      }
      if (rest.startsWith("t")) {
        this.pos += 1;
        modifier.targets.push(this.readRequiredPositiveInteger("t"));
        continue;
      }
      if (rest.startsWith("f")) {
        this.pos += 1;
        modifier.failure = this.readRequiredPositiveInteger("f");
        continue;
      }
      if (rest.startsWith("b")) {
        this.pos += 1;
        modifier.botch = this.readRequiredPositiveInteger("b");
        continue;
      }
      break;
    }

    return modifier;
  }

  private readRequiredPositiveInteger(label: string): number {
    const value = this.readOptionalPositiveInteger();
    if (value === null) {
      throw new DiceRollError(`'${label}' 뒤에는 숫자가 필요합니다.`);
    }
    return value;
  }

  private readOptionalPositiveInteger(): number | null {
    const digits = this.readDigits();
    if (digits.length === 0) return null;
    const value = Number(digits);
    if (!Number.isInteger(value) || value < 1) {
      throw new DiceRollError("옵션 숫자는 1 이상의 정수여야 합니다.");
    }
    return value;
  }

  private readNumber(): number | null {
    const start = this.pos;
    const digits = this.readDigits();
    if (digits.length === 0) return null;

    if (this.peek() === ".") {
      this.consume();
      const fraction = this.readDigits();
      if (fraction.length === 0) {
        throw new DiceRollError("소수점 뒤 숫자가 없습니다.");
      }
      return Number(`${digits}.${fraction}`);
    }

    if (this.peek()?.toLowerCase() === "d") {
      this.pos = start;
      return null;
    }

    return Number(digits);
  }

  private readDigits(): string {
    const start = this.pos;
    while (/\d/.test(this.peek() ?? "")) this.pos += 1;
    return this.text.slice(start, this.pos);
  }

  private consume(): string {
    const char = this.text[this.pos];
    this.pos += 1;
    return char;
  }

  private peek(): string | undefined {
    return this.text[this.pos];
  }
}

export function rollDiceExpression(
  input: string,
  options: RollOptions = {},
): DiceRollResult {
  const rawInput = input.trim();
  if (rawInput.length === 0) {
    throw new DiceRollError("굴릴 주사위 식을 입력해 주세요.");
  }
  if (rawInput.length > MAX_INPUT_LENGTH) {
    throw new DiceRollError(
      `주사위 식은 최대 ${MAX_INPUT_LENGTH}자까지 입력할 수 있습니다.`,
    );
  }

  const { body, comment } = splitComment(rawInput);
  const segments = body
    .split(";")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    throw new DiceRollError("굴릴 주사위 식을 입력해 주세요.");
  }
  if (segments.length > MAX_SEGMENTS) {
    throw new DiceRollError(`한 번에 처리할 식은 최대 ${MAX_SEGMENTS}개입니다.`);
  }

  const rng = options.rng ?? Math.random;
  const flags = createEmptyFlags();
  const preparedSegments: { expression: string; repeat: number }[] = [];
  const rolls: DiceRollSet[] = [];
  const totalResultCount = { value: 0 };

  for (const segment of segments) {
    const stripped = stripFlagTokens(segment);
    mergeFlags(flags, stripped.flags);

    const aliased = expandAlias(stripped.expression);
    const repeated = extractRepeat(aliased);
    if (repeated.expression.length === 0) {
      throw new DiceRollError("반복할 주사위 식을 입력해 주세요.");
    }

    preparedSegments.push(repeated);
  }

  for (const segment of preparedSegments) {
    for (let i = 0; i < segment.repeat; i += 1) {
      const parser = new ExpressionParser({
        expression: segment.expression,
        rng,
        flags,
        totalResultCount,
      });
      const result = parser.parse();
      rolls.push({
        expression: segment.expression,
        index: i + 1,
        total: result.value,
        details: result.details,
      });
    }
  }

  return {
    rawInput,
    comment,
    flags,
    rolls,
  };
}
