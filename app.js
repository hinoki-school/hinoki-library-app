import { MAX_BOOKS, todayISO, escapeHTML as esc } from './domain.js';
import { connectFirebase } from './firebase-client.js';
import { createLibraryStore } from './library-store.js';
let STUDENTS = [], BOOKS = [], loans = [];
let backend = null, store = null, ready = false, busy = false, epoch = 0;
let stops = [], role = null;
const byId = id => document.getElementById(id);

function fmt(iso){
  const [y,m,d] = iso.split("-");
  return `${m}/${d}`;
}
function studentById(id){ return STUDENTS.find(s=>s.id===id); }
function bookById(id){ return BOOKS.find(b=>b.id===id); }
function activeLoansFor(studentId){
  return loans.filter(l=>l.studentId===studentId && !l.returnDate);
}
function isOverdue(loan){
  return !loan.returnDate && loan.dueDate < todayISO();
}

/* ---------------- tabs ---------------- */
const tabs = document.querySelectorAll(".tab");
tabs.forEach(t=>t.addEventListener("click", ()=>{
  tabs.forEach(x=>x.setAttribute("aria-selected", x===t ? "true":"false"));
  ["lend","return","status"].forEach(name=>{
    document.getElementById("panel-"+name).hidden = (name !== t.dataset.tab);
  });
  if(t.dataset.tab==="return") renderReturnPanel();
  if(t.dataset.tab==="status") renderStatusPanel();
}));

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg){
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.classList.remove("show"), 2200);
}

/* ---------------- lending flow ---------------- */
let currentStudent = null;
let cart = []; // book ids

function renderStudentList(filter){
  const list = document.getElementById("studentList");
  const f = (filter||"").trim();
  const items = STUDENTS.filter(s=> s.active && (!f || s.name.includes(f) || s.id.includes(f)));
  list.innerHTML = items.map(s=>`
    <div class="student-row" data-id="${esc(s.id)}">
      <span class="grade-pill">${esc(s.grade)}</span>
      <span class="name">${esc(s.name)}</span>
      <span class="id mono">${esc(s.id)}</span>
    </div>`).join("") || `<div class="empty-state">該当する生徒がいません</div>`;
  list.querySelectorAll(".student-row").forEach(row=>{
    row.addEventListener("click", ()=> selectStudent(row.dataset.id));
  });
}
document.getElementById("studentSearch").addEventListener("input", e=>renderStudentList(e.target.value));

function selectStudent(id){
  const s = studentById(id);
  if(!ready || busy) return;
  if(!s || !s.active){ toast("この生徒IDは登録されていません: "+id); return; }
  currentStudent = s;
  cart = [];
  document.getElementById("lendPicker").hidden = true;
  document.getElementById("lendActive").hidden = false;
  renderCurrentStudent();
  renderCart();
}
function deselectStudent(){
  currentStudent = null; cart = [];
  document.getElementById("lendPicker").hidden = false;
  document.getElementById("lendActive").hidden = true;
  document.getElementById("studentSearch").value = "";
  renderStudentList();
}
function renderCurrentStudent(){
  const s = currentStudent;
  const already = activeLoansFor(s.id).length;
  document.getElementById("currentStudentCard").innerHTML = `
    <div class="avatar">${esc(s.name[0])}</div>
    <div class="info">
      <div class="name">${esc(s.name)}</div>
      <div class="meta">${esc(s.grade)} ・ 現在の貸出中: ${already}冊 ・ ID <span class="mono">${esc(s.id)}</span></div>
    </div>
    <button class="ghost-btn" id="switchStudent">生徒を変更</button>
  `;
  document.getElementById("switchStudent").addEventListener("click", deselectStudent);
}
function renderCart(){
  const already = activeLoansFor(currentStudent.id).length;
  const remaining = MAX_BOOKS - already;
  const list = document.getElementById("cartList");
  const empty = document.getElementById("cartEmpty");
  list.innerHTML = cart.map((bid,idx)=>{
    const b = bookById(bid);
    return `<div class="cart-item">
      <div><div class="title">${esc(b.title)}</div><div class="isbn mono">${esc(b.id)}</div></div>
      <button class="remove" data-idx="${idx}">取り消す</button>
    </div>`;
  }).join("");
  empty.hidden = cart.length>0;
  list.querySelectorAll(".remove").forEach(btn=>{
    btn.addEventListener("click", ()=>{ cart.splice(+btn.dataset.idx,1); renderCart(); });
  });
  const note = document.getElementById("limitNote");
  const total = already + cart.length;
  note.textContent = `1人3冊まで借りられます（現在 ${total} / 3）`;
  note.classList.toggle("full", total>=MAX_BOOKS);
  document.getElementById("confirmLend").disabled = !ready || busy || cart.length===0 || total>MAX_BOOKS;
  document.getElementById("scanBookBtn").disabled = !ready || busy || total>=MAX_BOOKS;
}

byId('confirmLend').addEventListener('click', async () => {
  if (!ready || busy || !currentStudent || !cart.length) return;
  const studentId = currentStudent.id, bookIds = [...cart];
  await mutate(async () => {
    await store.lend(studentId, bookIds);
    return bookIds.length + '冊の貸出を登録しました';
  }, deselectStudent);
});

/* ---------------- return flow ---------------- */
function renderReturnPanel(){
  const list = document.getElementById("loanList");
  const active = loans.filter(l=>!l.returnDate).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  if(active.length===0){
    list.innerHTML = `<div class="empty-state">現在、貸出中の本はありません</div>`;
    return;
  }
  list.innerHTML = active.map(l=>{
    const s = studentById(l.studentId), b = bookById(l.bookId);
    const overdue = isOverdue(l);
    return `<div class="loan-row" data-loan="${esc(l.loanId)}">
      <span class="who">${esc(s ? s.name : l.studentId)}</span>
      <span class="book">${esc(b ? b.title : l.bookId)}<span class="isbn mono">${esc(l.bookId)}</span></span>
      <span class="pill ${overdue?'overdue':'ok'}">${overdue?'延滞':'返却期限 '+fmt(l.dueDate)}</span>
      <button class="return-btn" data-loan="${esc(l.loanId)}">返却する</button>
    </div>`;
  }).join("");
  list.querySelectorAll(".return-btn").forEach(btn=>{
    btn.addEventListener("click", ()=> returnLoan(btn.dataset.loan));
  });
}
async function returnLoan(loanId){
  if (!ready || busy) return;
  await mutate(async () => (await store.returnLoan(loanId)) ? '返却を登録しました' : '別の端末ですでに返却されています');
}
function returnByBookId(bookId){
  const matches = loans.filter(x=>x.bookId===bookId && !x.returnDate);
  if (!matches.length) { toast('この本は現在貸出中ではありません: ' + bookId); return; }
  if (matches.length > 1) {
    document.querySelector('[data-tab="return"]').click();
    toast('同じISBNの貸出が複数あります。一覧から生徒を確認して返却してください。');
    return;
  }
  returnLoan(matches[0].loanId);
}

/* ---------------- status panel ---------------- */
function renderStatusPanel(){
  const active = loans.filter(l=>!l.returnDate);
  const overdue = active.filter(isOverdue);
  document.getElementById("statActive").textContent = active.length;
  document.getElementById("statOverdue").textContent = overdue.length;
  document.getElementById("statTotal").textContent = loans.length;

  const atbody = document.querySelector("#activeTable tbody");
  atbody.innerHTML = active.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).map(l=>{
    const s = studentById(l.studentId), b = bookById(l.bookId);
    const od = isOverdue(l);
    return `<tr>
      <td>${esc(s?s.name:l.studentId)}</td>
      <td>${esc(b?b.title:l.bookId)}</td>
      <td class="mono">${esc(fmt(l.loanDate))}</td>
      <td class="mono">${esc(fmt(l.dueDate))}</td>
      <td>${od ? '<span class="pill overdue">延滞</span>' : '<span class="pill ok">貸出中</span>'}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="5" style="color:var(--ink-soft); text-align:center;">貸出中の本はありません</td></tr>`;

  const stbody = document.querySelector("#studentTable tbody");
  stbody.innerHTML = STUDENTS.map(s=>{
    const count = loans.filter(l=>l.studentId===s.id).length;
    const milestone = count>0 && count % 10 === 0;
    return `<tr>
      <td>${esc(s.name)}</td>
      <td>${esc(s.grade)}</td>
      <td class="mono">${count}</td>
      <td>${milestone ? '<span class="milestone">★ 10冊達成</span>' : ''}</td>
    </tr>`;
  }).join("");
}
function updateActiveCountBadge(){
  const n = loans.filter(l=>!l.returnDate).length;
  const badge = document.getElementById("activeCount");
  badge.hidden = n===0;
  badge.textContent = n;
}

/* ---------------- camera / QR scan ---------------- */
let scannerGeneration = 0;
let camStream = null;
let camRAF = null;
let camMode = null; // 'student' | 'book' | 'return'

const camOverlay = document.getElementById("camOverlay");
const camVideo = document.getElementById("camVideo");
const camCanvas = document.getElementById("camCanvas");
const camErr = document.getElementById("camErr");
const camLabel = document.getElementById("camLabel");
const camDebug = document.getElementById("camDebug");
let frameCount = 0;

document.querySelectorAll("[data-scan]").forEach(btn=>{
  btn.addEventListener("click", ()=> openScanner(btn.dataset.scan));
});
document.getElementById("camCancel").addEventListener("click", closeScanner);

// 生徒カードはQR（jsQR）、本はISBNバーコード=EAN-13（Quagga）を読む。
// モードによって読み取りエンジンを切り替える。
const BARCODE_MODES = new Set(["book","return"]);
let scanBusy = false;
let scanStopped = false;

async function openScanner(mode){
  if (!ready || busy) return;
  const scannerEpoch = ++scannerGeneration;
  camMode = mode;
  camErr.hidden = true;
  scanStopped = false;
  camLabel.textContent = mode==="student" ? "生徒カードのQRを枠内に写してください"
                        : mode==="return" ? "返却する本の裏表紙のISBNバーコードを枠内に写してください"
                        : "本の裏表紙のISBNバーコードを枠内に写してください";
  document.querySelector(".cam-box").classList.toggle("wide", BARCODE_MODES.has(mode));
  camOverlay.hidden = false;
  frameCount = 0;
  lastBarcodeGuess = null;
  barcodeGuessStreak = 0;
  try{
    const stream = await navigator.mediaDevices.getUserMedia({
      video:{ facingMode:"environment", width:{ideal:1920}, height:{ideal:1080}, focusMode:"continuous" }
    });
    if (scannerEpoch !== scannerGeneration || !ready) { stream.getTracks().forEach(t=>t.stop()); return; }
    camStream = stream;
    camVideo.srcObject = camStream;
    await camVideo.play();
    if (scannerEpoch !== scannerGeneration || !ready) return;
    const track = camStream.getVideoTracks()[0];
    const settings = track ? track.getSettings() : {};
    camDebug.textContent = `解像度 ${settings.width||"?"}x${settings.height||"?"} / 判定中…`;
    if(BARCODE_MODES.has(mode)) tickScanBarcode(); else tickScanQR();
  }catch(err){
    if (scannerEpoch !== scannerGeneration) return;
    camErr.hidden = false;
    camErr.textContent = "カメラを起動できませんでした（権限が許可されているか、iPadのSafariで開いているか確認してください）: " + err.message;
  }
}
function closeScanner(){
  scannerGeneration++;
  camOverlay.hidden = true;
  scanStopped = true;
  if(camRAF) cancelAnimationFrame(camRAF);
  if(camStream){ camStream.getTracks().forEach(t=>t.stop()); camStream=null; }
  camVideo.srcObject = null;
}
function grabFrame(){
  camCanvas.width = camVideo.videoWidth;
  camCanvas.height = camVideo.videoHeight;
  const ctx = camCanvas.getContext("2d");
  ctx.drawImage(camVideo, 0, 0, camCanvas.width, camCanvas.height);
  return ctx;
}
function tickScanQR(){
  if(scanStopped) return;
  if(camVideo.readyState === camVideo.HAVE_ENOUGH_DATA){
    const ctx = grabFrame();
    const imgData = ctx.getImageData(0,0,camCanvas.width, camCanvas.height);
    const code = window.jsQR ? jsQR(imgData.data, imgData.width, imgData.height, {inversionAttempts:"attemptBoth"}) : null;
    frameCount++;
    if(frameCount % 15 === 0){
      camDebug.textContent = `解像度 ${camCanvas.width}x${camCanvas.height} / ${frameCount}フレーム処理済み / 未検出`;
    }
    if(code && code.data){
      handleScan(code.data.trim());
      return;
    }
  }
  camRAF = requestAnimationFrame(tickScanQR);
}
// EAN-13には誤り訂正がなく、印刷のにじみや手ブレで1桁だけ誤読することがある。
// 誤読でも別の登録済みISBNとたまたま一致すると気づかずに違う本が追加されてしまうため、
// 同じ値を連続2回読めてから確定する（1回だけの読み取りは採用しない）。
let lastBarcodeGuess = null;
let barcodeGuessStreak = 0;
const BARCODE_CONFIRM_STREAK = 2;

function tickScanBarcode(){
  if(scanStopped) return;
  if(!scanBusy && camVideo.readyState === camVideo.HAVE_ENOUGH_DATA && window.Quagga){
    scanBusy = true;
    const scannerEpoch = scannerGeneration;
    grabFrame();
    const dataUrl = camCanvas.toDataURL("image/png");
    Quagga.decodeSingle({
      decoder: { readers: ["ean_reader"] },
      locate: true,
      src: dataUrl,
    }, function(result){
      scanBusy = false;
      if(scanStopped || scannerEpoch !== scannerGeneration) return;
      const code = result && result.codeResult && result.codeResult.code ? result.codeResult.code.trim() : null;
      if(code){
        if(code === lastBarcodeGuess){
          barcodeGuessStreak++;
        } else {
          lastBarcodeGuess = code;
          barcodeGuessStreak = 1;
        }
        camDebug.textContent = `読み取り中: ${code}（確認 ${barcodeGuessStreak}/${BARCODE_CONFIRM_STREAK}）`;
        if(barcodeGuessStreak >= BARCODE_CONFIRM_STREAK){
          lastBarcodeGuess = null;
          barcodeGuessStreak = 0;
          handleScan(code);
          return;
        }
      } else {
        lastBarcodeGuess = null;
        barcodeGuessStreak = 0;
      }
      camRAF = requestAnimationFrame(tickScanBarcode);
    });
  } else {
    camRAF = requestAnimationFrame(tickScanBarcode);
  }
}
function handleScan(data){
  closeScanner();
  if (!ready || busy) return;
  if(camMode==="student"){
    if(!studentById(data)){ toast("未登録の生徒QRです: "+data); return; }
    selectStudent(data);
  } else if(camMode==="book"){
    if (!currentStudent) return;
    const already = activeLoansFor(currentStudent.id).length;
    const total = already + cart.length;
    if(!bookById(data)){ toast("未登録のISBNです: "+data); return; }
    if(total>=MAX_BOOKS){ toast("すでに上限の3冊です"); return; }
    if(cart.includes(data)){ toast("すでにカートに入っています"); return; }
    cart.push(data);
    renderCart();
    toast(bookById(data).title + " を追加しました");
  } else if(camMode==="return"){
    returnByBookId(data);
  }
}

/* ---------------- manual fallback for testing without camera ---------------- */
// All scan paths are gated by staff authorization.

/* ---------------- authenticated session ---------------- */
function message(text, showLogin = false) {
  byId('authMessage').textContent = text;
  byId('loginForm').hidden = !showLogin;
  byId('authPanel').hidden = false;
  byId('appShell').hidden = true;
}

function clearSession() {
  epoch++;
  stops.splice(0).forEach(stop => stop());
  ready = false; busy = false; role = null;
  closeScanner();
  STUDENTS = []; BOOKS = []; loans = []; cart = []; currentStudent = null;
  byId('appShell').hidden = true;
  byId('appShell').inert = true;
  byId('sessionControls').hidden = true;
  byId('seedDemo').hidden = true;
  byId('sessionStatus').textContent = '';
  byId('password').value = '';
  clearTimeout(toastTimer);
  byId('toast').textContent = '';
  byId('toast').classList.remove('show');
  ['currentStudentCard', 'cartList', 'studentList', 'loanList'].forEach(id => byId(id).replaceChildren());
  document.querySelectorAll('tbody').forEach(el => el.replaceChildren());
  ['statActive', 'statOverdue', 'statTotal', 'activeCount'].forEach(id => byId(id).textContent = '0');
  byId('studentSearch').value = '';
  byId('lendPicker').hidden = false;
  byId('lendActive').hidden = true;
}

function failSession(text) {
  clearSession();
  message(text);
  // Keep a way to sign out even after permissions have been revoked.
  byId('sessionControls').hidden = !backend?.auth.currentUser;
}

function renderAll() {
  renderStudentList(byId('studentSearch').value);
  renderReturnPanel(); renderStatusPanel(); updateActiveCountBadge();
  if (currentStudent) {
    currentStudent = studentById(currentStudent.id);
    if (!currentStudent?.active) deselectStudent();
    else {
      cart = cart.filter(id => bookById(id));
      renderCurrentStudent(); renderCart();
    }
  }
  byId('seedDemo').hidden = role !== 'admin' || STUDENTS.length > 0 || BOOKS.length > 0 || loans.length > 0;
  byId('seedDemo').disabled = busy || !ready;
  byId('appShell').inert = busy || !ready;
}

async function mutate(operation, after = () => {}) {
  if (!ready || busy) return;
  const started = epoch;
  busy = true; renderAll();
  byId('sessionStatus').textContent = '保存しています…';
  try {
    const result = await operation();
    if (started !== epoch) return;
    after();
    toast(result);
  } catch (error) {
    if (started !== epoch) return;
    if (error.code === 'permission-denied' || error.code === 'unauthenticated') {
      failSession('アクセス権を確認できません。ログアウトして管理者に確認してください。');
      return;
    }
    toast(error.code ? '保存できませんでした。接続を確認し、最新の一覧を確認してから再操作してください。' : error.message);
  } finally {
    if (started === epoch) {
      busy = false;
      byId('sessionStatus').textContent = ready ? '接続済み' : '接続を確認しています…';
      renderAll();
    }
  }
}

function watchUser(user) {
  clearSession();
  if (!user) { message('スタッフ用アカウントでログインしてください。', true); return; }
  const started = epoch;
  const { db, firestoreSDK: sdk } = backend;
  byId('sessionControls').hidden = false;
  message('スタッフのアクセス権を確認しています…');
  let subscribed = false;
  const serverReady = new Set();
  const failed = () => {
    if (started === epoch) failSession('データを読み込めません。接続とスタッフのアクセス権を確認してください。');
  };
  stops.push(sdk.onSnapshot(sdk.doc(db, 'staff', user.uid), { includeMetadataChanges: true }, snapshot => {
    if (started !== epoch) return;
    if (snapshot.metadata.fromCache) {
      serverReady.delete('staff');
      ready = false; closeScanner();
      message('サーバーとの接続を確認しています…');
      byId('seedDemo').hidden = true;
      return;
    }
    const staff = snapshot.data();
    if (!staff?.active || !['staff', 'admin'].includes(staff.role)) {
      failSession('このアカウントには利用権限がありません。管理者に確認してください。');
      return;
    }
    role = staff.role;
    serverReady.add('staff');
    if (subscribed) { updateReady(); return; }
    subscribed = true;
    for (const name of ['students', 'books', 'loans']) {
      stops.push(sdk.onSnapshot(sdk.collection(db, name), { includeMetadataChanges: true }, snapshot => {
        if (started !== epoch) return;
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
          serverReady.delete(name);
          updateReady();
          return;
        }
        const rows = snapshot.docs.map(doc => ({ ...doc.data(), [name === 'loans' ? 'loanId' : 'id']: doc.id }));
        if (name === 'students') STUDENTS = rows;
        if (name === 'books') BOOKS = rows;
        if (name === 'loans') loans = rows;
        serverReady.add(name);
        updateReady();
      }, failed));
    }
  }, failed));
  function updateReady() {
    ready = serverReady.size === 4 && navigator.onLine;
    if (!ready) {
      closeScanner();
      message('最新のデータを確認しています。接続が戻るまでお待ちください。');
      byId('seedDemo').hidden = true;
      byId('sessionStatus').textContent = '同期中';
      return;
    }
    byId('authPanel').hidden = true;
    byId('appShell').hidden = false;
    byId('sessionStatus').textContent = busy ? '保存しています…' : '接続済み';
    renderAll();
  }
}

byId('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!backend || byId('loginButton').disabled) return;
  byId('loginButton').disabled = true;
  byId('authMessage').textContent = 'ログインしています…';
  const password = byId('password').value;
  byId('password').value = '';
  try {
    await backend.authSDK.signInWithEmailAndPassword(backend.auth, byId('email').value.trim(), password);
  } catch {
    message('ログインできませんでした。メールアドレス・パスワードと接続を確認してください。', true);
  } finally { byId('loginButton').disabled = false; }
});

byId('logoutButton').addEventListener('click', async () => {
  clearSession();
  byId('email').value = '';
  message('ログアウトしています…');
  try {
    await backend.authSDK.signOut(backend.auth);
    // Discard the SDK's in-memory document cache as well as the application DOM.
    location.reload();
  }
  catch { failSession('ログアウトを完了できませんでした。このページを閉じてください。'); }
});

byId('seedDemo').addEventListener('click', async () => {
  if (!ready || busy || role !== 'admin') return;
  if (!window.confirm('架空の生徒12件と本10件を登録します。実データの投入前の動作確認専用です。続けますか？')) return;
  await mutate(async () => {
    const { seedDemo } = await import('./tools/seed-demo.js');
    await seedDemo(backend.db, backend.firestoreSDK);
    return 'ダミーデータを登録しました';
  });
});

window.addEventListener('offline', () => {
  if (backend?.auth.currentUser) {
    ready = false; closeScanner();
    message('通信が切れました。接続が戻ったら最新の一覧を読み込みます。');
    byId('seedDemo').hidden = true;
  }
});
window.addEventListener('online', () => {
  if (backend?.auth.currentUser && !busy) watchUser(backend.auth.currentUser);
});
window.addEventListener('pagehide', () => { clearSession(); });
window.addEventListener('pageshow', event => {
  if (event.persisted) location.reload();
});

try {
  backend = await connectFirebase();
  if (!backend) message('現在、初期設定を準備しています。管理者からの案内をお待ちください。');
  else {
    store = createLibraryStore(backend.db, backend.firestoreSDK);
    backend.authSDK.onAuthStateChanged(backend.auth, watchUser, () => failSession('ログイン状態を確認できません。ページを再読み込みしてください。'));
  }
} catch {
  message('接続設定または必要なファイルを読み込めませんでした。接続を確認して再読み込みしてください。');
}
