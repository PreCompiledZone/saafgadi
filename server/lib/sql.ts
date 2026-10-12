import { getTableName, sql, type Column, type SQL } from 'drizzle-orm';

/**
 * A fully qualified `table`.`column` reference. Drizzle leaves columns
 * unqualified in single-table queries, which silently breaks correlated
 * subqueries written with `sql` (the inner table's column wins).
 */
export function qualified(column: Column): SQL {
  return sql.raw(`\`${getTableName(column.table)}\`.\`${column.name}\``);
}
