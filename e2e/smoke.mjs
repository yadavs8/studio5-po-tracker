// Every route, signed in, desktop and phone width: no page errors, no console errors on valid routes.
const SITE = '51111111-0000-0000-0000-000000000001';
const ROUTES = ['/dashboard/', '/upload/', '/documents/', '/master-data/', '/pis/', '/pos/', '/invoices/', '/payments/', '/reports/',
  `/site/?id=${SITE}`, `/site/statement/?id=${SITE}`, '/po/?id=a1111111-0000-0000-0000-00000000000a', `/documents/?site=${SITE}`, `/upload/?site=${SITE}`];

export async function signIn(page, BASE, user) {
  await page.goto(`${BASE}/login/`);
  await page.fill('input[type=email]', user.email);
  await page.fill('input[type=password]', user.password);
  await page.click('button[type=submit]');
  await page.waitForURL(/dashboard/, { timeout: 15000 });
}

export async function smoke({ browser, BASE, OWNER, fail }) {
  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    let route = '/login/';
    page.on('pageerror', (e) => fail(`[${vp.name}] ${route} page error: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') fail(`[${vp.name}] ${route} console error: ${m.text()}`); });
    await signIn(page, BASE, OWNER);
    for (route of ROUTES) {
      await page.goto(BASE + route);
      await page.waitForLoadState('networkidle').catch(() => {});
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 2) fail(`[${vp.name}] ${route} is ${overflow}px wider than the screen`);
    }
    await ctx.close();
  }
  console.log('ok   smoke');
}
