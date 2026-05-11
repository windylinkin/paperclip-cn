import { Clock3, Pencil, RefreshCw, Trash2, Webhook, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { RoutineTrigger } from "@penclipai/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { describeSchedule } from "./ScheduleEditor";
import { timeAgo } from "../lib/timeAgo";
import { getCurrentLocale } from "../i18n";

interface TriggerListCardProps {
  trigger: RoutineTrigger;
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onRotateSecret?: () => void;
  togglePending?: boolean;
}

export function TriggerListCard({
  trigger,
  onEdit,
  onDelete,
  onToggleEnabled,
  onRotateSecret,
  togglePending,
}: TriggerListCardProps) {
  const { t } = useTranslation();
  const isSchedule = trigger.kind === "schedule";
  const isWebhook = trigger.kind === "webhook";
  const Icon = isSchedule ? Clock3 : isWebhook ? Webhook : Zap;

  const summary = isSchedule && trigger.cronExpression
    ? describeSchedule(trigger.cronExpression)
    : isWebhook
      ? `Webhook${trigger.publicId ? ` · ${trigger.publicId}` : ""}`
      : t("triggerList.apiTrigger", { defaultValue: "API trigger" });

  const nextRun = isSchedule && trigger.enabled && trigger.nextRunAt
    ? new Date(trigger.nextRunAt).toLocaleString(getCurrentLocale(), {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
    : trigger.enabled ? "—" : t("Disabled", { defaultValue: "Disabled" });

  const lastFired = trigger.lastFiredAt ? timeAgo(trigger.lastFiredAt) : t("Never", { defaultValue: "Never" });

  const resultIsError = typeof trigger.lastResult === "string" && /error|fail/i.test(trigger.lastResult);

  return (
    <div
      className={`rounded-lg border border-border p-3 transition-colors ${trigger.enabled ? "bg-card" : "bg-muted/40"}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className={`text-sm font-medium truncate flex-1 min-w-0 ${trigger.enabled ? "" : "text-muted-foreground"}`}>
          {trigger.label || (isSchedule
            ? t("Schedule", { defaultValue: "Schedule" })
            : isWebhook
              ? "Webhook"
              : t("Trigger", { defaultValue: "Trigger" }))}
        </span>
        <ToggleSwitch
          checked={trigger.enabled}
          onCheckedChange={onToggleEnabled}
          disabled={togglePending}
          aria-label={trigger.enabled
            ? t("triggerList.disableTrigger", { defaultValue: "Disable trigger" })
            : t("triggerList.enableTrigger", { defaultValue: "Enable trigger" })}
        />
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mt-2">
        <Badge variant="outline" className="text-[11px]">
          {trigger.kind}
        </Badge>
        {!trigger.enabled && (
          <Badge variant="secondary" className="text-[11px] text-muted-foreground">
            {t("status.paused", { defaultValue: "Paused" })}
          </Badge>
        )}
      </div>

      <div className="mt-2 text-sm break-words">{summary}</div>
      {isSchedule && trigger.cronExpression && (
        <div className="text-xs text-muted-foreground mt-1 font-mono break-all">
          {trigger.cronExpression}
          {trigger.timezone ? ` · ${trigger.timezone}` : ""}
        </div>
      )}

      <dl className="mt-3 space-y-2 text-xs">
        <div className="flex flex-col gap-0.5 min-w-0">
          <dt className="text-muted-foreground">{t("triggerList.nextRun", { defaultValue: "Next run" })}</dt>
          <dd className="break-words">{nextRun}</dd>
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <dt className="text-muted-foreground">{t("triggerList.lastFired", { defaultValue: "Last fired" })}</dt>
          <dd className="break-words">{lastFired}</dd>
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <dt className="text-muted-foreground">{t("triggerList.lastResult", { defaultValue: "Last result" })}</dt>
          <dd className="min-w-0">
            {trigger.lastResult ? (
              <span
                className={`inline-block rounded px-1.5 py-0.5 text-[11px] break-words ${
                  resultIsError
                    ? "bg-destructive/15 text-destructive"
                    : "bg-secondary text-secondary-foreground"
                }`}
                title={trigger.lastResult}
              >
                {trigger.lastResult}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center justify-end gap-1 border-t border-border pt-2">
        {isWebhook && onRotateSecret && (
          <Button variant="ghost" size="xs" onClick={onRotateSecret} title={t("Rotate secret", { defaultValue: "Rotate secret" })}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="xs" onClick={onEdit} title={t("Edit", { defaultValue: "Edit" })}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={onDelete}
          title={t("Delete", { defaultValue: "Delete" })}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
