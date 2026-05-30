// @ts-ignore
import d from 'datascript';

export function getNextNumber(conn: any, type: string): number {
  const db = d.db(conn);
  const qRes = d.q(
    `[:find ?e ?v :where [?e "counter/id" "${type}"] [?e "counter/value" ?v]]`,
    db
  );

  let entId = null;
  let currentVal = 1;

  if (qRes && qRes.length > 0) {
    entId = qRes[0][0];
    currentVal = qRes[0][1];
  }

  const nextVal = currentVal + 1;

  if (entId !== null) {
    d.transact(conn, [
      [':db/add', entId, 'counter/value', nextVal]
    ]);
  } else {
    d.transact(conn, [
      {
        'counter/id': type,
        'counter/value': nextVal,
      }
    ]);
  }

  return currentVal;
}

export function resetCounters(conn: any) {
  const db = d.db(conn);
  const qRes = d.q(
    '[:find ?e :where [?e "counter/id" ?id]]',
    db
  );
  if (qRes && qRes.length > 0) {
    const txs = qRes.map(([e]: any) => [':db/retractEntity', e]);
    if (txs.length > 0) {
      d.transact(conn, txs);
    }
  }
}

export function initializeCounters(conn: any) {
  const types = ['theorem', 'lemma', 'proof', 'definition', 'corollary', 'proposition', 'remark'];
  const db = d.db(conn);
  const txs: any[] = [];

  types.forEach((t) => {
    const qRes = d.q(`[:find ?e :where [?e "counter/id" "${t}"]]`, db);
    if (!qRes || qRes.length === 0) {
      txs.push({
        'counter/id': t,
        'counter/value': 1,
      });
    }
  });

  if (txs.length > 0) {
    d.transact(conn, txs);
  }
}

export function reassignNumbers(conn: any) {
  try {
    const db = d.db(conn);
    const types = ['theorem', 'lemma', 'definition', 'corollary', 'proposition', 'remark'];

    types.forEach((t) => {
      const res = d.q(`[:find ?e :where [?e "block/type" "${t}"]]`, db);
      if (!res || res.length === 0) return;

      const list = res.map(([eid]: any) => {
        const pulled = d.pull(db, ['*', ':db/id'], eid);
        return {
          eid,
          num: pulled['block/number'],
        };
      });

      // Sort by entity ID to preserve creation order sequences
      list.sort((a, b) => a.eid - b.eid);

      const txs: any[] = [];
      list.forEach((item, index) => {
        const correctNum = index + 1;
        if (item.num !== correctNum) {
          txs.push({
            ':db/id': item.eid,
            'block/number': correctNum,
          });
        }
      });

      if (txs.length > 0) {
        d.transact(conn, txs);
      }
    });
  } catch (err) {
    console.error('Failed to reassign numbers', err);
  }
}
