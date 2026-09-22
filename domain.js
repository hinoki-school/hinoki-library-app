export const MAX_BOOKS = 3;
export const LOAN_DAYS = 14;

export function todayISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addDays(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return todayISO(date);
}

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

export function assertLendable(student, bookIds) {
  if (!student || student.active !== true) throw new Error('この生徒は貸出対象ではありません。');
  if (!Array.isArray(student.activeLoanIds)) throw new Error('生徒の貸出情報を管理者に確認してください。');
  if (!bookIds.length || new Set(bookIds).size !== bookIds.length) throw new Error('借りる本を確認してください。');
  if (student.activeLoanIds.length + bookIds.length > MAX_BOOKS) throw new Error('別端末の更新を含め、貸出上限の3冊を超えます。');
}
