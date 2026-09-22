import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import QRCode from 'qrcode';
const fake = await readFile(new URL('./fake-firebase.js', import.meta.url), 'utf8');
const jsQR = await readFile(new URL('../node_modules/jsqr/dist/jsQR.js', import.meta.url), 'utf8');

async function mockSDK(page, role = 'staff') {
  await page.addInitScript(role => { window.testRole = role; }, role);
  await page.route('**/firebase-client.js', route => route.fulfill({ contentType: 'text/javascript', body: fake }));
}
async function login(page) {
  await page.goto('/');
  await page.getByLabel('メールアドレス').fill('staff@example.test');
  await page.getByLabel('パスワード').fill('test-only');
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  // Keep UI tests independent of external CDNs. Separately verify live URLs.
  await page.route('https://fonts.**/*', route => route.abort());
  await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'text/javascript', body: jsQR }));
  await page.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ contentType: 'text/javascript', body: 'window.Quagga = { decodeSingle(options, callback) { callback({codeResult:{code:"9789999100007"}}); } };' }));
});

test('without config, shows setup message and never loads Firebase or masters', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/');
  await expect(page.getByRole('status').first()).toContainText('初期設定');
  await expect(page.locator('#appShell')).toBeHidden();
  await expect(page.locator('#loginForm')).toBeHidden();
  expect(requests.some(url => /gstatic|firestore|demo-data/.test(url))).toBe(false);
});
test('login failure clears password and keeps data hidden', async ({ page }) => {
  await mockSDK(page);
  await page.goto('/');
  await page.getByLabel('メールアドレス').fill('staff@example.test');
  await page.getByLabel('パスワード').fill('wrong');
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page.locator('#authMessage')).toContainText('ログインできません');
  await expect(page.getByLabel('パスワード')).toHaveValue('');
  await expect(page.locator('#appShell')).toBeHidden();
});
test('unlisted account never subscribes to student or book collections', async ({ page }) => {
  await mockSDK(page, 'outsider');
  await login(page);
  await expect(page.locator('#authMessage')).toContainText('利用権限がありません');
  expect(await page.evaluate(() => window.testBackend.observerCount())).toBe(0);
  await expect(page.locator('#appShell')).toBeHidden();
});
test('staff renders names as text, then logout erases data and subscriptions', async ({ page }) => {
  await mockSDK(page);
  await login(page);
  await expect(page.locator('#studentList')).toContainText('<img src=x');
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  await expect(page.locator('#studentList img')).toHaveCount(0);
  await expect(page.locator('#seedDemo')).toBeHidden();
  await page.getByRole('button', { name: 'ログアウト' }).click();
  await expect(page.locator('#loginForm')).toBeVisible();
  await expect(page.locator('#studentList')).toBeEmpty();
  await expect(page.locator('#currentStudentCard')).toBeEmpty();
  expect(await page.evaluate(() => window.testBackend.observerCount())).toBe(0);
});
test('revoked staff is immediately gated and private DOM cleared', async ({ page }) => {
  await mockSDK(page); await login(page);
  await expect(page.locator('#appShell')).toBeVisible();
  await page.evaluate(() => window.testBackend.revoke());
  await expect(page.locator('#authMessage')).toContainText('利用権限がありません');
  await expect(page.locator('#studentList')).toBeEmpty();
  expect(await page.evaluate(() => window.testBackend.observerCount())).toBe(0);
});
test('real jsQR decodes a camera frame; two ISBN confirmations lead to checkout and return', async ({ page }) => {
  await mockSDK(page);
  const qrData = await QRCode.toDataURL('S2', { margin: 4, width: 400, errorCorrectionLevel: 'H' });
  await page.addInitScript(qrData => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 400;
      const image = new Image(); image.src = qrData; await image.decode();
      canvas.getContext('2d').drawImage(image, 0, 0);
      const stream = canvas.captureStream(10);
      const timer = setInterval(() => canvas.getContext('2d').drawImage(image, 0, 0), 100);
      stream.getTracks()[0].addEventListener('ended', () => clearInterval(timer));
      return stream;
    };
  }, qrData);
  await login(page);
  await page.getByRole('button', { name: '📷 QRでスキャン' }).click();
  await expect(page.locator('#currentStudentCard')).toContainText('テスト 花子');
  await expect(page.locator('#camOverlay')).toBeHidden();
  await page.locator('#scanBookBtn').click();
  await expect(page.locator('#cartList')).toContainText('テスト本');
  await page.locator('#confirmLend').click();
  await expect(page.locator('#toast')).toContainText('1冊');
  await page.locator('[data-tab="return"]').click();
  await expect(page.locator('#loanList')).toContainText('テスト 花子');
  await page.locator('.return-btn').click();
  await expect(page.locator('#loanList')).toContainText('貸出中の本はありません');
});
test('phone layout fits viewport and QR cancel stops a late camera stream', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockSDK(page); await login(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.resolveCamera = resolve; });
  });
  await page.getByRole('button', { name: '📷 QRでスキャン' }).click();
  await page.getByRole('button', { name: 'キャンセル' }).click();
  await page.evaluate(() => { window.resolveCamera({ getTracks: () => [{ stop() { window.cameraStopped = true; } }] }); });
  await expect.poll(() => page.evaluate(() => window.cameraStopped)).toBe(true);
  await expect(page.locator('#camOverlay')).toBeHidden();
});
