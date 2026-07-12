"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

const CommandK = dynamic(() => import("./CommandK"), {
  ssr: false,
});

interface CommandKDeferredProps {
  bypassPageLocks: boolean;
}

export default function CommandKDeferred({
  bypassPageLocks,
}: CommandKDeferredProps) {
  const [mounted, setMounted] = useState(false);

  const mount = useCallback(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handleOpenEvent() {
      mount();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        mount();
      }
    }

    window.addEventListener("no:cmdk-open", handleOpenEvent);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("no:cmdk-open", handleOpenEvent);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mount]);

  return mounted ? (
    <CommandK defaultOpen bypassPageLocks={bypassPageLocks} />
  ) : null;
}
