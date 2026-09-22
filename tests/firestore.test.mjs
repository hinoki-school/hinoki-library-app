import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { createLibraryStore } from '../library-store.js';
import { seedDemo } from '../tools/seed-demo.js';
import { todayISO, addDays } from '../domain.js';

let env;
const books = ['9789999100007', '9789999223454', '9789999345675', '9789999467896'];
const student = { name: 'テスト生徒', grade: '3年', active: true, activeLoanIds: [] };
const dbFor = uid => env.authenticatedContext(uid).firestore();
const storeFor = uid => createLibraryStore(dbFor(uid), sdk);
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-hinoki-library', firestore: {
    host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8')
  } });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const batch = sdk.writeBatch(db);
    for (const uid of ['staff-a', 'staff-b', 'admin']) batch.set(sdk.doc(db, 'staff', uid), { active: true, role: uid === 'admin' ? 'admin' : 'staff' });
    batch.set(sdk.doc(db, 'students', 'S1'), student);
    batch.set(sdk.doc(db, 'students', 'S2'), student);
    for (const id of books) batch.set(sdk.doc(db, 'books', id), { title: 'テスト本', author: 'テスト著者' });
    await batch.commit();
  });
});

test('anonymous and unlisted users cannot read masters or loans, or write', async () => {
  for (const db of [env.unauthenticatedContext().firestore(), dbFor('outsider')]) {
    for (const name of ['students', 'books', 'loans']) {
      await assertFails(sdk.getDocs(sdk.collection(db, name)));
    }
    await assertFails(sdk.setDoc(sdk.doc(db, 'students', 'new'), student));
    await assertFails(sdk.setDoc(sdk.doc(db, 'staff', 'outsider'), { active: true, role: 'admin' }));
  }
});
test('staff roles are private and cannot be self-granted, even by client admins', async () => {
  for (const uid of ['staff-a', 'admin']) {
    const db = dbFor(uid);
    await assertSucceeds(sdk.getDoc(sdk.doc(db, 'staff', uid)));
    await assertFails(sdk.getDocs(sdk.collection(db, 'staff')));
    await assertFails(sdk.setDoc(sdk.doc(db, 'staff', uid), { active: true, role: 'admin' }));
  }
});
test('only admins may edit master fields; active loan indexes cannot be forged', async () => {
  const db = dbFor('staff-a');
  await assertFails(sdk.updateDoc(sdk.doc(db, 'students', 'S1'), { name: 'changed' }));
  await assertFails(sdk.setDoc(sdk.doc(db, 'books', books[0]), { title: 'changed', author: '' }));
  await assertSucceeds(sdk.updateDoc(sdk.doc(dbFor('admin'), 'students', 'S1'), { name: 'changed' }));
  await assertFails(sdk.updateDoc(sdk.doc(db, 'students', 'S1'), { activeLoanIds: ['missing'] }));
});
test('three-book atomic checkout succeeds; a fourth fails without partial writes', async () => {
  const ids = await storeFor('staff-a').lend('S1', books.slice(0, 3));
  assert.equal(ids.length, 3);
  await assert.rejects(storeFor('staff-a').lend('S1', [books[3]]), /3冊/);
  const db = dbFor('staff-a');
  assert.equal((await sdk.getDocs(sdk.collection(db, 'loans'))).size, 3);
  assert.deepEqual((await sdk.getDoc(sdk.doc(db, 'students', 'S1'))).data().activeLoanIds, ids);
  const loan = (await sdk.getDoc(sdk.doc(db, 'loans', ids[0]))).data();
  assert.equal(loan.loanDate, todayISO());
  assert.equal(loan.dueDate, addDays(todayISO(), 14));
});
test('two devices racing to lend two books cannot exceed the cap', async () => {
  const results = await Promise.allSettled([
    storeFor('staff-a').lend('S1', books.slice(0, 2)),
    storeFor('staff-b').lend('S1', books.slice(2, 4))
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await sdk.getDocs(sdk.collection(dbFor('staff-a'), 'loans'))).size, 2);
});
test('concurrent returns are idempotent and free exactly one slot', async () => {
  const [id] = await storeFor('staff-a').lend('S1', [books[0]]);
  const results = await Promise.all([storeFor('staff-a').returnLoan(id), storeFor('staff-b').returnLoan(id)]);
  assert.deepEqual(results.sort(), [false, true]);
  assert.deepEqual((await sdk.getDoc(sdk.doc(dbFor('staff-a'), 'students', 'S1'))).data().activeLoanIds, []);
  assert.equal((await sdk.getDoc(sdk.doc(dbFor('staff-a'), 'loans', id))).data().returnDate, todayISO());
});
test('rules reject a fourth checkout even with a hand-crafted batch', async () => {
  const ids = await storeFor('staff-a').lend('S1', books.slice(0, 3));
  const db = dbFor('staff-a'), batch = sdk.writeBatch(db);
  batch.set(sdk.doc(db, 'loans', 'fourth'), { studentId: 'S1', bookId: books[3], loanDate: todayISO(), dueDate: addDays(todayISO(), 14), returnDate: null });
  batch.update(sdk.doc(db, 'students', 'S1'), { activeLoanIds: [...ids, 'fourth'] });
  await assertFails(batch.commit());
});
test('cannot drop an active loan from the index or rewrite/delete history', async () => {
  const [id] = await storeFor('staff-a').lend('S1', [books[0]]);
  for (const uid of ['staff-a', 'admin']) {
    const db = dbFor(uid);
    await assertFails(sdk.updateDoc(sdk.doc(db, 'students', 'S1'), { activeLoanIds: [] }));
    await assertFails(sdk.updateDoc(sdk.doc(db, 'loans', id), { studentId: 'S2' }));
    await assertFails(sdk.updateDoc(sdk.doc(db, 'loans', id), { returnDate: todayISO() }));
    await assertFails(sdk.deleteDoc(sdk.doc(db, 'loans', id)));
  }
});
test('inactive student cannot borrow but can return an existing loan', async () => {
  const [id] = await storeFor('staff-a').lend('S1', [books[0]]);
  await sdk.updateDoc(sdk.doc(dbFor('admin'), 'students', 'S1'), { active: false });
  await assert.rejects(storeFor('staff-a').lend('S1', [books[1]]));
  await assertSucceeds(storeFor('staff-a').returnLoan(id));
});
test('unknown book causes no partial checkout', async () => {
  await assert.rejects(storeFor('staff-a').lend('S1', [books[0], '0000000000000']));
  assert.equal((await sdk.getDocs(sdk.collection(dbFor('staff-a'), 'loans'))).size, 0);
});
test('revoked staff loses read/write access', async () => {
  await env.withSecurityRulesDisabled(context => sdk.updateDoc(sdk.doc(context.firestore(), 'staff', 'staff-a'), { active: false }));
  await assertFails(sdk.getDocs(sdk.collection(dbFor('staff-a'), 'students')));
  await assertFails(storeFor('staff-a').lend('S1', [books[0]]));
});
test('demo seed is admin-only and repeat execution never overwrites existing data', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all(books.map(id => sdk.deleteDoc(sdk.doc(db, 'books', id))));
  });
  await assertFails(seedDemo(dbFor('staff-a'), sdk));
  await assertSucceeds(seedDemo(dbFor('admin'), sdk));
  await sdk.updateDoc(sdk.doc(dbFor('admin'), 'students', 'D-1001'), { name: '保護する変更' });
  await assert.rejects(seedDemo(dbFor('admin'), sdk), /存在/);
  assert.equal((await sdk.getDoc(sdk.doc(dbFor('admin'), 'students', 'D-1001'))).data().name, '保護する変更');
});
test('another device observes committed checkout through onSnapshot', async () => {
  const db = dbFor('staff-b');
  let stop;
  const observed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('snapshot timeout')), 10000);
    stop = sdk.onSnapshot(sdk.collection(db, 'loans'), snapshot => {
      if (snapshot.size === 1) { clearTimeout(timer); resolve(snapshot.docs[0].data()); }
    }, reject);
  });
  try {
    await storeFor('staff-a').lend('S1', [books[0]]);
    assert.equal((await observed).studentId, 'S1');
  } finally { stop?.(); }
});
