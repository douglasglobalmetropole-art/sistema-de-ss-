'use strict';

// Duas renderizações por instância. Cada relatório tem cookies e storage próprios.
const MAX_PAGES = 2;
const waiters = [];
let active = 0;
let pendingBrowser;
let idleTimer;

async function launch(isolatedContexts) {
  const chromium = require('@sparticuz/chromium');
  const puppeteer = require('puppeteer-core');
  const executablePath = await chromium.executablePath();
  return puppeteer.launch({
    executablePath,
    args: isolatedContexts ? chromium.args.filter(arg => arg !== '--single-process') : chromium.args,
    headless: true,
    defaultViewport: {width: 1280, height: 960, deviceScaleFactor: 1}
  });
}

function sharedBrowser() {
  if (!pendingBrowser) {
    const pending = launch(true);
    pendingBrowser = pending;
    const forget = () => { if (pendingBrowser === pending) pendingBrowser = undefined; };
    pending.then(browser => browser.once('disconnected', forget), forget);
  }
  return pendingBrowser;
}

async function withReportPage(render) {
  if (active < MAX_PAGES) active++;
  else await new Promise(resolve => waiters.push(resolve));
  clearTimeout(idleTimer);
  let context;
  let dedicatedBrowser;
  try {
    let page;
    try {
      const browser = await sharedBrowser();
      context = await browser.createBrowserContext();
      page = await context.newPage();
    } catch {
      if (context) await context.close().catch(() => {});
      context = undefined;
      // Compatibilidade com ambientes que só permitem Chromium em processo único.
      dedicatedBrowser = await launch(false);
      page = await dedicatedBrowser.newPage();
    }
    await page.setExtraHTTPHeaders({'Accept-Language': 'pt-BR,pt;q=0.9'});
    return await render(page);
  } finally {
    if (context) await context.close().catch(() => {});
    if (dedicatedBrowser) await dedicatedBrowser.close().catch(() => {});
    const next = waiters.shift();
    if (next) next();
    else if (--active === 0 && pendingBrowser) {
      idleTimer = setTimeout(() => {
        const browser = pendingBrowser;
        pendingBrowser = undefined;
        browser?.then(instance => instance.close()).catch(() => {});
      }, 15000);
      idleTimer.unref();
    }
  }
}

async function openReport(page, link, imageTimeout) {
  await page.goto(link, {waitUntil: 'domcontentloaded', timeout: 30000});
  await page.evaluate(async (timeout) => {
    const images = Array.from(document.images);
    await new Promise(resolve => {
      const timer = setTimeout(resolve, timeout);
      Promise.all(images.map(img => {
        if (img.loading === 'lazy') img.loading = 'eager';
        if (img.complete) return Promise.resolve();
        return new Promise(done => {
          img.addEventListener('load', done, {once: true});
          img.addEventListener('error', done, {once: true});
        });
      })).then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }, imageTimeout);
}

module.exports = {withReportPage, openReport};
