type DatabaseErrorLike = {
  code?: unknown;
  constraint?: unknown;
  constraint_name?: unknown;
  message?: unknown;
  cause?: unknown;
};

type DatabaseErrorDetails = {
  code?: string;
  constraint?: string;
  constraintName?: string;
  message?: string;
};

const MAX_CAUSE_DEPTH = 8;

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readDatabaseErrorDetails(error: unknown): DatabaseErrorDetails | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as DatabaseErrorLike;
  const details = {
    code: readString(candidate.code),
    constraint: readString(candidate.constraint),
    constraintName: readString(candidate.constraint_name),
    message: readString(candidate.message),
  };
  return details.code || details.constraint || details.constraintName || details.message
    ? details
    : null;
}

function databaseErrorDetails(error: unknown): DatabaseErrorDetails[] {
  const details: DatabaseErrorDetails[] = [];
  const seen = new Set<object>();
  let current = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (!current || typeof current !== "object") break;
    if (seen.has(current)) break;
    seen.add(current);

    const currentDetails = readDatabaseErrorDetails(current);
    if (currentDetails) details.push(currentDetails);

    current = (current as DatabaseErrorLike).cause;
  }

  return details;
}

export function isDatabaseErrorCode(error: unknown, code: string): boolean {
  return databaseErrorDetails(error).some((details) => details.code === code);
}

export function isUniqueViolation(error: unknown, constraintNames?: string | readonly string[]): boolean {
  const constraints = constraintNames === undefined
    ? null
    : new Set(Array.isArray(constraintNames) ? constraintNames : [constraintNames]);

  for (const details of databaseErrorDetails(error)) {
    if (details.code !== "23505") continue;
    if (!constraints) return true;

    if (details.constraint && constraints.has(details.constraint)) return true;
    if (details.constraintName && constraints.has(details.constraintName)) return true;
    if (details.message && [...constraints].some((constraint) => details.message?.includes(constraint))) {
      return true;
    }
  }

  return false;
}
