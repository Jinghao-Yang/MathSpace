// @ts-ignore
import d from 'datascript';
import { get, set } from 'idb-keyval';
import { schema } from './schema';
import { initializeCounters, reassignNumbers } from './counters';

const DB_STORAGE_KEY = 'mathematician-whiteboard-datascript';

let conn: any = null;

interface TransactionRecord {
  txData: any[];
}

const undoStack: TransactionRecord[] = [];
const redoStack: TransactionRecord[] = [];
let isApplyingHistory = false;

const changeListeners = new Set<(db: any) => void>();

export async function initDatabase() {
  if (conn) return conn;

  let savedData: any = null;
  try {
    savedData = await get(DB_STORAGE_KEY);
  } catch (err) {
    console.error('Failed to load DataScript from IndexedDB', err);
  }

  const empty = d.empty_db(schema);
  if (savedData && Array.isArray(savedData)) {
    console.log('Restoring DataScript database from IndexedDB with ' + savedData.length + ' datoms');
    const txs = savedData.map(function(datoms) {
      var e = datoms[0];
      var a = datoms[1];
      var v = datoms[2];
      return [':db/add', e, a, v];
    });
    try {
      const restoredDb = d.db_with(empty, txs);
      conn = d.conn_from_db(restoredDb);
    } catch (txErr) {
      console.error('Error rebuilding database from saved datoms, starting fresh', txErr);
      conn = d.conn_from_db(empty);
    }
  } else {
    console.log('Initializing a fresh DataScript database');
    conn = d.conn_from_db(empty);
  }

  try {
    initializeCounters(conn);
  } catch (initCounterErr) {
    console.error('Failed to initialize counters', initCounterErr);
  }

  try {
    const currentDb = d.db(conn);
    const pages = d.q('[:find ?e :where [?e "block/type" "page"]]', currentDb);
    if (!pages || pages.length === 0) {
      console.log('No pages found, creating default Home page');
      const defaultPageId = 'block-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
      d.transact(conn, [
        {
          'block/id': defaultPageId,
          'block/type': 'page',
          'block/title': 'Home',
          'block/content': '',
          'block/order': 0
        }
      ]);
    }
  } catch (pageErr) {
    console.error('Failed to create default Home page', pageErr);
  }

  d.listen(conn, 'global-listener', function(report) {
    const dbAfter = report.db_after;
    
    saveDatabase(dbAfter);

    if (!isApplyingHistory) {
      try {
        reassignNumbers(conn);
      } catch (numErr) {
        console.error('Failed to auto-number mathematical environments', numErr);
      }

      if (report['tx-data'] && report['tx-data'].length > 0) {
        undoStack.push({
          txData: [].concat(report['tx-data'])
        });
        
        if (undoStack.length > 50) {
          undoStack.shift();
        }
        
        redoStack.length = 0;
      }
    }

    changeListeners.forEach(function(listener) {
      listener(dbAfter);
    });
  });

  return conn;
}

export function getConn() {
  if (!conn) {
    throw new Error('Database not initialized! Call initDatabase() first.');
  }
  return conn;
}

export function getDb() {
  return d.db(getConn());
}

export async function saveDatabase(db) {
  try {
    const datoms = d.q('[:find ?e ?a ?v :where [?e ?a ?v]]', db);
    await set(DB_STORAGE_KEY, datoms);
  } catch (err) {
    console.error('Failed to save DataScript to IndexedDB', err);
  }
}

export function subscribeToDb(listener) {
  changeListeners.add(listener);
  return function() {
    changeListeners.delete(listener);
  };
}

function invertTxData(txData) {
  return txData.map(function(datom) {
    var e = datom[0];
    var a = datom[1];
    var v = datom[2];
    var added = datom[3];
    return [e, a, v, !added];
  });
}

function applyTxData(txData) {
  const txs = txData.map(function(datom) {
    var e = datom[0];
    var a = datom[1];
    var v = datom[2];
    var added = datom[3];
    return added ? [':db/add', e, a, v] : [':db/retract', e, a, v];
  });
  d.transact(getConn(), txs);
}

export function undo() {
  if (undoStack.length === 0) {
    console.log('Nothing to undo');
    return false;
  }

  isApplyingHistory = true;
  const txRecord = undoStack.pop();
  redoStack.push(txRecord);

  try {
    console.log('Performing Undo, applying inverse transaction');
    applyTxData(invertTxData(txRecord.txData));
    isApplyingHistory = false;
    return true;
  } catch (err) {
    console.error('Failed executing undo', err);
    isApplyingHistory = false;
    return false;
  }
}

export function redo() {
  if (redoStack.length === 0) {
    console.log('Nothing to redo');
    return false;
  }

  isApplyingHistory = true;
  const txRecord = redoStack.pop();
  undoStack.push(txRecord);

  try {
    console.log('Performing Redo, re-applying transaction');
    applyTxData(txRecord.txData);
    isApplyingHistory = false;
    return true;
  } catch (err) {
    console.error('Failed executing redo', err);
    isApplyingHistory = false;
    return false;
  }
}
