import type { SVGProps } from "react";

import {
  IconArmory,
  IconArmoryAcheron,
  IconArmoryLab,
  IconArmoryStrategic,
  IconArmoryTowaski,
  IconArmoryTraining,
  IconArmoryWorkshop,
} from "@/components/icons";

export type ArmoryZoneIconKey =
  | "hub"
  | "lab"
  | "towaski"
  | "acheron"
  | "strategic"
  | "custom"
  | "simulator";

type ArmoryZoneIconProps = {
  zone: string | null | undefined;
} & SVGProps<SVGSVGElement>;

export function ArmoryZoneIcon({ zone, ...props }: ArmoryZoneIconProps) {
  switch (zone) {
    case "lab":
      return <IconArmoryLab {...props} />;
    case "towaski":
      return <IconArmoryTowaski {...props} />;
    case "acheron":
      return <IconArmoryAcheron {...props} />;
    case "strategic":
      return <IconArmoryStrategic {...props} />;
    case "custom":
      return <IconArmoryWorkshop {...props} />;
    case "simulator":
      return <IconArmoryTraining {...props} />;
    case "hub":
    default:
      return <IconArmory {...props} />;
  }
}
