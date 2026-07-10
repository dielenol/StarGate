"use client";

import type { ReactNode } from "react";

import type { BreadcrumbItem } from "./Breadcrumb";
import { useSetPageHead } from "./PageHeadContext";

interface PageHeadRegistrarProps {
  breadcrumb?: ReactNode | BreadcrumbItem[];
  title: ReactNode;
}

export default function PageHeadRegistrar({
  breadcrumb,
  title,
}: PageHeadRegistrarProps) {
  useSetPageHead({ breadcrumb, title });
  return null;
}
