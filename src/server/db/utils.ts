import { getTableColumns, SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

export const buildConflictUpdateColumns = <
  T extends PgTable,
  Q extends keyof T["_"]["columns"],
>(
  table: T,
  columns: Q[],
) => {
  const cls = getTableColumns(table);
  if (!cls) return {};
  return columns.reduce(
    (acc, column) => {
      const colName = cls[column]?.name;
      if (!colName) return acc;
      acc[column] = sql.raw(`excluded.${colName}`);
      return acc;
    },
    {} as Record<Q, SQL>,
  );
};
