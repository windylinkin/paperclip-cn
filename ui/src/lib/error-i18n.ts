import type { TFunction } from "i18next";
import { translateSystemGeneratedText } from "./system-generated-message-i18n";

export function translateRuntimeErrorMessage(
  t: TFunction,
  message: string | null | undefined,
): string | null | undefined {
  if (!message) return message;

  const systemGenerated = translateSystemGeneratedText(t, message);
  if (systemGenerated !== message) return systemGenerated;

  if (message === "Process adapter missing command") {
    return t("Process adapter missing command", {
      defaultValue: "Process adapter missing command",
    });
  }

  const timedOutMatch = /^Timed out after (\d+)s$/.exec(message);
  if (timedOutMatch) {
    return t("Timed out after {{seconds}}s", {
      seconds: timedOutMatch[1] ?? "0",
      defaultValue: `Timed out after ${timedOutMatch[1] ?? "0"}s`,
    });
  }

  const exitCodeMatch = /^Process exited with code (-?\d+)$/.exec(message);
  if (exitCodeMatch) {
    return t("Process exited with code {{code}}", {
      code: exitCodeMatch[1] ?? "-1",
      defaultValue: `Process exited with code ${exitCodeMatch[1] ?? "-1"}`,
    });
  }

  if (message === "Run exited with an error.") {
    return t("Run exited with an error.", {
      defaultValue: "Run exited with an error.",
    });
  }

  return message;
}
