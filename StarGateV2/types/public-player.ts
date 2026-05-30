export interface PublicAgentSheet {
  codename: string;
  name: string;
  mainImage: string;
  quote: string;
  gender: string;
  age: string;
  height: string;
  weight: string;
  appearance: string;
  personality: string;
  background: string;
  className: string;
  hp: number;
  san: number;
  def: number;
  atk: number;
  abilityType: string;
  credit: number | string;
  weaponTraining: string;
  skillTraining: string;
  equipment: {
    name: string;
    price: number | string;
    damage: string;
    description: string;
  }[];
  abilities: {
    code: string;
    name: string;
    description: string;
    effect: string;
  }[];
}

export interface PublicAgentSummary {
  id: string;
  codename: string;
  role: string;
  previewImage: string;
  pixelCharacterImage: string;
  warningVideo?: string;
}

export interface PublicAgentDetail extends PublicAgentSummary {
  sheet: PublicAgentSheet;
}
