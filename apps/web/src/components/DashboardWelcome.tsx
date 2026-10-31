"use client";

import { useCallback, useState } from "react";

export function useWelcomeHidden() {
  const [hidden] = useState<boolean>(true);
  const hide = useCallback(() => {}, []);
  const show = useCallback(() => {}, []);
  return { hidden, hide, show };
}

export function DashboardWelcome(_props: { open?: boolean; offline?: boolean; onHide?: () => void }) {
  return null;
}
