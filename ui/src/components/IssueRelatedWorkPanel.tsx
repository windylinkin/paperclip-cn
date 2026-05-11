import type { IssueRelatedWorkItem, IssueRelatedWorkSummary } from "@penclipai/shared";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { IssueReferencePill } from "./IssueReferencePill";

type GroupedSource = {
  label: string;
  count: number;
  sampleMatchedText: string | null;
};

function sourceDisplayLabel(source: IssueRelatedWorkItem["sources"][number], t: TFunction): string {
  switch (source.kind) {
    case "title":
      return t("issueRelatedWork.source.title", { defaultValue: "title" });
    case "description":
      return t("issueRelatedWork.source.description", { defaultValue: "description" });
    case "comment":
      return t("issueRelatedWork.source.comment", { defaultValue: "comment" });
    case "document":
      return source.label === "document"
        ? t("issueRelatedWork.source.document", { defaultValue: "document" })
        : source.label;
    default:
      return source.label;
  }
}

function groupSourcesByLabel(sources: IssueRelatedWorkItem["sources"], t: TFunction): GroupedSource[] {
  const groups = new Map<string, GroupedSource>();
  for (const source of sources) {
    const key = `${source.kind}:${source.label}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, {
        label: sourceDisplayLabel(source, t),
        count: 1,
        sampleMatchedText: source.matchedText ?? null,
      });
    }
  }
  return Array.from(groups.values());
}

function Section({
  title,
  description,
  items,
  emptyLabel,
}: {
  title: string;
  description: string;
  items: IssueRelatedWorkItem[];
  emptyLabel: string;
}) {
  const { t } = useTranslation(undefined, { useSuspense: false });

  return (
    <section className="space-y-3 rounded-lg border border-border p-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="-mx-1 flex flex-col">
          {items.map((item) => {
            const groupedSources = groupSourcesByLabel(item.sources, t);
            const showTitle = item.issue.identifier !== item.issue.title;
            return (
              <li
                key={item.issue.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md px-1 py-1.5 hover:bg-accent/40"
              >
                <IssueReferencePill issue={item.issue} />
                {showTitle ? (
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {item.issue.title}
                  </span>
                ) : null}
                <div className="flex flex-wrap items-center gap-1.5">
                  {groupedSources.map((group) => (
                    <span
                      key={`${item.issue.id}:${group.label}`}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
                      title={group.sampleMatchedText ?? undefined}
                    >
                      <span>{group.label}</span>
                      {group.count > 1 ? (
                        <span className="tabular-nums text-[10px] font-medium opacity-80">×{group.count}</span>
                      ) : null}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function IssueRelatedWorkPanel({
  relatedWork,
}: {
  relatedWork?: IssueRelatedWorkSummary | null;
}) {
  const { t } = useTranslation(undefined, { useSuspense: false });
  const outbound = relatedWork?.outbound ?? [];
  const inbound = relatedWork?.inbound ?? [];

  return (
    <div className="space-y-3">
      <Section
        title={t("issueRelatedWork.references", { defaultValue: "References" })}
        description={t("issueRelatedWork.referencesDescription", {
          defaultValue: "Other tasks this issue currently points at in its title, description, comments, or documents.",
        })}
        items={outbound}
        emptyLabel={t("issueRelatedWork.noReferences", {
          defaultValue: "This issue does not reference any other tasks yet.",
        })}
      />
      <Section
        title={t("issueRelatedWork.referencedBy", { defaultValue: "Referenced by" })}
        description={t("issueRelatedWork.referencedByDescription", {
          defaultValue: "Other tasks that currently point at this issue.",
        })}
        items={inbound}
        emptyLabel={t("issueRelatedWork.noReferencedBy", {
          defaultValue: "No other tasks reference this issue yet.",
        })}
      />
    </div>
  );
}
