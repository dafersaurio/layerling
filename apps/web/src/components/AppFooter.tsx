"use client";

import type { AppUpdateInfo } from "@/lib/appUpdate";

export const SOURCE_CODE_URL = "https://github.com/henmedia/layerling";

export function AppFooter(_props: {
  variant?: "dashboard" | "editor";
  version: string;
  updateInfo?: AppUpdateInfo | null;
  onBugReport?: () => void;
  onShowWelcome?: () => void;
}) {
  return null;
}
