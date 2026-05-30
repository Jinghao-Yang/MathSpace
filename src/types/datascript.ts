export type EntityId = number;
export type Attribute = string;
export type Value = string | number | boolean | null | EntityId | Value[];

export interface Datom {
  e: EntityId;
  a: Attribute;
  v: Value;
  tx?: number;
  added?: boolean;
}

export type QueryResult = any[][];

export interface Database {
  [key: string]: any;
}

export interface Connection {
  [key: string]: any;
}

export interface TransactionReport {
  db_before: Database;
  db_after: Database;
  'tx-data': Datom[];
  tempids: Record<string, EntityId>;
}

export type TxData = Array<
  | [':db/add', EntityId, Attribute, Value]
  | [':db/retract', EntityId, Attribute, Value]
  | Record<string, any>
>;

export function isDatom(value: any): value is Datom {
  return (
    typeof value === 'object' &&
    value !== null &&
    'e' in value &&
    'a' in value &&
    'v' in value
  );
}

export function isQueryResult(value: any): value is QueryResult {
  return Array.isArray(value) && value.every(item => Array.isArray(item));
}

export function isDatabase(value: any): value is Database {
  return typeof value === 'object' && value !== null;
}

export function isConnection(value: any): value is Connection {
  return typeof value === 'object' && value !== null;
}
