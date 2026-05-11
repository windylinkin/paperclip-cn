import { Navigate, Outlet, useLocation } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { accessApi } from "@/api/access";
import { authApi } from "@/api/auth";
import { healthApi } from "@/api/health";
import { queryKeys } from "@/lib/queryKeys";

function BootstrapPendingPage({
  hasActiveInvite = false,
  t,
}: {
  hasActiveInvite?: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">
          {t("Instance setup required", { defaultValue: "Instance setup required" })}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {hasActiveInvite
            ? t(
              "No instance admin exists yet. A bootstrap invite is already active. Check your Paperclip startup logs for the first admin invite URL, or run this command to rotate it:",
              {
                defaultValue:
                  "No instance admin exists yet. A bootstrap invite is already active. Check your Paperclip startup logs for the first admin invite URL, or run this command to rotate it:",
              },
            )
            : t(
              "No instance admin exists yet. Run this command in your Paperclip environment to generate the first admin invite URL:",
              {
                defaultValue:
                  "No instance admin exists yet. Run this command in your Paperclip environment to generate the first admin invite URL:",
              },
            )}
        </p>
        <pre className="mt-4 overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
{`pnpm penclip auth bootstrap-ceo`}
        </pre>
      </div>
    </div>
  );
}

function NoBoardAccessPage({ t }: { t: (key: string, options?: Record<string, unknown>) => string }) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">
          {t("No company access", { defaultValue: "No company access" })}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            "This account is signed in, but it does not have an active company membership or instance-admin access on this Paperclip instance.",
            {
              defaultValue:
                "This account is signed in, but it does not have an active company membership or instance-admin access on this Paperclip instance.",
            },
          )}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Use a company invite or sign in with an account that already belongs to this org.", {
            defaultValue: "Use a company invite or sign in with an account that already belongs to this org.",
          })}
        </p>
      </div>
    </div>
  );
}

export function CloudAccessGate() {
  const { t } = useTranslation();
  const location = useLocation();
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data as
        | { deploymentMode?: "local_trusted" | "authenticated"; bootstrapStatus?: "ready" | "bootstrap_pending" }
        | undefined;
      return data?.deploymentMode === "authenticated" && data.bootstrapStatus === "bootstrap_pending"
        ? 2000
        : false;
    },
    refetchIntervalInBackground: true,
  });

  const isAuthenticatedMode = healthQuery.data?.deploymentMode === "authenticated";
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    enabled: isAuthenticatedMode,
    retry: false,
  });

  const boardAccessQuery = useQuery({
    queryKey: queryKeys.access.currentBoardAccess,
    queryFn: () => accessApi.getCurrentBoardAccess(),
    enabled: isAuthenticatedMode && !!sessionQuery.data,
    retry: false,
  });

  if (
    healthQuery.isLoading ||
    (isAuthenticatedMode && sessionQuery.isLoading) ||
    (isAuthenticatedMode && !!sessionQuery.data && boardAccessQuery.isLoading)
  ) {
    return (
      <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">
        {t("Loading...", { defaultValue: "Loading..." })}
      </div>
    );
  }

  if (healthQuery.error || boardAccessQuery.error) {
    return (
      <div className="mx-auto max-w-xl py-10 text-sm text-destructive">
        {healthQuery.error instanceof Error
          ? healthQuery.error.message
          : boardAccessQuery.error instanceof Error
            ? boardAccessQuery.error.message
            : t("Failed to load app state", { defaultValue: "Failed to load app state" })}
      </div>
    );
  }

  if (isAuthenticatedMode && healthQuery.data?.bootstrapStatus === "bootstrap_pending") {
    return <BootstrapPendingPage hasActiveInvite={healthQuery.data.bootstrapInviteActive} t={t} />;
  }

  if (isAuthenticatedMode && !sessionQuery.data) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/auth?next=${next}`} replace />;
  }

  if (
    isAuthenticatedMode &&
    sessionQuery.data &&
    !boardAccessQuery.data?.isInstanceAdmin &&
    (boardAccessQuery.data?.companyIds.length ?? 0) === 0
  ) {
    return <NoBoardAccessPage t={t} />;
  }

  return <Outlet />;
}
