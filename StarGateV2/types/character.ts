import type { ObjectId } from "mongodb";

/* ── Sheet 공통 필드 ── */

export interface SheetBase {
  codename: string;
  name: string;
  mainImage: string;
  quote: string;
  gender: string;
  age: string;
  height: string;
  appearance: string;
  personality: string;
  background: string;
}

/* ── Agent 전용 Sheet ── */

export interface Equipment {
  name: string;
  price: number | string;
  damage: string;
  description: string;
}

export interface Ability {
  code: string;
  name: string;
  description: string;
  effect: string;
}

export interface AgentSheet extends SheetBase {
  weight: string;
  className: string;
  hp: number;
  san: number;
  def: number;
  atk: number;
  abilityType: string;
  credit: number | string;
  weaponTraining: string;
  skillTraining: string;
  equipment: Equipment[];
  abilities: Ability[];
}

/* ── NPC 전용 Sheet ── */

export interface NpcSheet extends SheetBase {
  nameEn: string;
  roleDetail: string;
  notes: string;
}

/* ── Character 문서 (MongoDB) ── */

export type CharacterType = "AGENT" | "NPC";

interface CharacterBase {
  _id?: ObjectId;
  codename: string;
  type: CharacterType;
  role: string;
  previewImage: string;
  pixelCharacterImage?: string;
  warningVideo?: string;
  ownerId: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentCharacter extends CharacterBase {
  type: "AGENT";
  sheet: AgentSheet;
}

export interface NpcCharacter extends CharacterBase {
  type: "NPC";
  sheet: NpcSheet;
}

export type Character = AgentCharacter | NpcCharacter;

/* ── 생성 입력 ── */

export type CreateCharacterInput = Omit<
  Character,
  "_id" | "createdAt" | "updatedAt"
>;

/* ── 공개 조회용 (ownerId 제외) ── */

export type CharacterPublic = Omit<Character, "ownerId">;
