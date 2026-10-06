"use client";

import { Stack } from "@mantine/core";
import { useTranslations } from "use-intl";
import { PageHeader } from "@/components/core/PageHeader";
import { HwpEditor } from "./HwpEditor";

export function HwpEditorTool() {
  const t = useTranslations("tools.hwp");
  return (
    <Stack gap="xl" data-hwp-editor-tool>
      <PageHeader title={t("title")} description={t("description")} />
      <HwpEditor
        labels={{
          label: t("title"),
          loading: t("loading"),
          error: t("error"),
          retry: t("retry"),
        }}
      />
    </Stack>
  );
}
