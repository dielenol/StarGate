"use client";

import { signIn } from "next-auth/react";

import Button from "@/components/ui/Button/Button";

export default function DiscordLinkButton() {
  function handleClick() {
    signIn("discord", { callbackUrl: "/erp/profile" });
  }

  return (
    <Button type="button" variant="primary" onClick={handleClick}>
      Discord 연동
    </Button>
  );
}
