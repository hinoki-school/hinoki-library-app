import { STUDENTS, BOOKS } from './demo-data.js';

// Rules require an admin. Read all target documents before writing, then abort
// on any existing record: safe to retry, never overwrite a master or its loans.
export async function seedDemo(db, { doc, runTransaction }) {
  const records = [
    ...STUDENTS.map(({ id, ...data }) => ({ ref: doc(db, 'students', id), data: { ...data, active: true, activeLoanIds: [] } })),
    ...BOOKS.map(({ id, ...data }) => ({ ref: doc(db, 'books', id), data }))
  ];
  await runTransaction(db, async tx => {
    const existing = await Promise.all(records.map(({ ref }) => tx.get(ref)));
    if (existing.some(snapshot => snapshot.exists())) throw new Error('同じIDのデータが存在するため、初期登録を中止しました。');
    records.forEach(({ ref, data }) => tx.set(ref, data));
  });
}
