import { assertLendable, todayISO, addDays, LOAN_DAYS } from './domain.js';

// SDK injection lets emulator tests exercise the exact same transactions as the browser.
export function createLibraryStore(db, sdk) {
  const { doc, collection, runTransaction, getDocFromServer } = sdk;
  return {
    async lend(studentId, bookIds) {
      const ids = [...bookIds];
      const studentRef = doc(db, 'students', studentId);
      const loanRefs = ids.map(() => doc(collection(db, 'loans')));
      const date = todayISO();
      await runTransaction(db, async tx => {
        const student = await tx.get(studentRef);
        assertLendable(student.exists() ? student.data() : null, ids);
        const books = await Promise.all(ids.map(id => tx.get(doc(db, 'books', id))));
        if (books.some(book => !book.exists())) throw new Error('未登録の本が含まれています。');
        // Read every document before writing; retries re-check the latest student state.
        loanRefs.forEach((ref, i) => tx.set(ref, {
          studentId, bookId: ids[i], loanDate: date,
          dueDate: addDays(date, LOAN_DAYS), returnDate: null
        }));
        tx.update(studentRef, { activeLoanIds: [...student.data().activeLoanIds, ...loanRefs.map(ref => ref.id)] });
      });
      return loanRefs.map(ref => ref.id);
    },
    async returnLoan(loanId) {
      const loanRef = doc(db, 'loans', loanId);
      try {
        return await runTransaction(db, async tx => {
          const loan = await tx.get(loanRef);
          if (!loan.exists()) throw new Error('貸出記録が見つかりません。');
          if (loan.data().returnDate !== null) return false;
          const studentRef = doc(db, 'students', loan.data().studentId);
          const student = await tx.get(studentRef);
          if (!student.exists() || !student.data().activeLoanIds?.includes(loanId)) {
            throw new Error('貸出情報の整合性を管理者に確認してください。');
          }
          tx.update(loanRef, { returnDate: todayISO() });
          tx.update(studentRef, { activeLoanIds: student.data().activeLoanIds.filter(id => id !== loanId) });
          return true;
        });
      } catch (error) {
        // A competing return can make strict rules reject our stale write before
        // the transaction is retried. Confirm the committed state on the server;
        // never turn an authorization failure into success from a cached record.
        if (error.code === 'permission-denied') {
          try {
            const latest = await getDocFromServer(loanRef);
            if (latest.exists() && latest.data().returnDate !== null) return false;
          } catch { /* Keep the original failure when access was revoked. */ }
        }
        throw error;
      }
    }
  };
}
