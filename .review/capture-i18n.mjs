import { chromium } from '/tmp/i18n-browser/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const mode=process.argv[2];
const server=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1','--directory',`.review/site-${mode}`],{stdio:'ignore'});
const origin='http://127.0.0.1:8765',base=origin+'/payflow-frontend';
let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(base+'/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true});
  const report=[];
  await mkdir('.review/screenshots',{recursive:true});
  for(const [device,width] of [['desktop',1280],['mobile',375]])for(const locale of ['en','fr']) {
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
    await context.addInitScript(value=>{if(!localStorage.getItem('payflow.locale'))localStorage.setItem('payflow.locale',value);},locale);
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin===origin&&!url.pathname.startsWith('/api/'))return route.continue();
      if(url.pathname==='/api/plans'&&mode==='api')return route.fulfill({json:{plans:[{id:7,merchant:'merchant.fixture',name:'Example plan',amount:'12345678901',period:2592000,active:1,ledger:1,trial:259200,token:''}]},headers:{'Access-Control-Allow-Origin':'*'}});
      if(url.pathname==='/api/stats'&&mode==='api')return route.fulfill({json:{plans:1234,mandates:12,activeMandates:4,charges:9,lastIndexedLedger:123456},headers:{'Access-Control-Allow-Origin':'*'}});
      if(url.pathname==='/api/charges/recent'&&mode==='api')return route.fulfill({json:{charges:[]},headers:{'Access-Control-Allow-Origin':'*'}});
      // Offline contract-only screens must explain the unavailable source. No live wallet/RPC evidence is claimed.
      return route.abort();
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    for(const [route,slug,heading] of [
      ['/','overview',locale==='fr'?'Des paiements récurrents auparavant impossibles sur Stellar.':'Recurring payments that Stellar could not do before.'],
      ['/subscribe/','subscribe',locale==='fr'?'Offres disponibles':'Available plans'],
      ['/account/','account',locale==='fr'?'Mon compte':'My account'],
      ['/merchant/','merchant',locale==='fr'?'Tableau de bord marchand':'Merchant dashboard'],
    ]) {
      await page.goto(base+route,{waitUntil:'networkidle'});
      await page.getByRole('heading',{name:heading,exact:true}).waitFor();
      const picker=page.getByRole('combobox',{name:locale==='fr'?'Langue':'Language',exact:true});
      await picker.waitFor();
      assert.equal(await page.locator('html').getAttribute('lang'),locale);
      await picker.focus();
      assert(await picker.evaluate(el=>el===document.activeElement),'picker keyboard focus');
      if(width===375){
        await page.getByRole('button',{name:locale==='fr'?'Ouvrir le menu':'Open menu',exact:true}).click();
        await page.keyboard.press('Escape');
        assert.equal(await page.getByRole('button',{name:locale==='fr'?'Ouvrir le menu':'Open menu',exact:true}).getAttribute('aria-expanded'),'false');
      }
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${mode}/${locale}/${slug}/${device} overflows`);
      assert.deepEqual(errors,[],`runtime errors: ${slug}`);
      const text=await page.locator('main').innerText();
      if(locale==='fr')assert(!/No wallet connected|Connect wallet|Available plans|Publish a plan|The merchant publishes a plan/.test(text),'English application labels remain');
      if(slug==='subscribe'&&mode==='api') {
        await page.getByText('Example plan',{exact:true}).waitFor();
        assert(text.includes(locale==='fr'?'1\u202f234,5678':'1,234.5678'),'locale amount');
      }
      if(slug==='account'||slug==='merchant')assert(text.includes(locale==='fr'?'Aucun portefeuille connecté':'No wallet connected'));
      await page.screenshot({path:`.review/screenshots/${mode}-${locale}-${slug}-${device}.png`,fullPage:true});
      report.push({mode,locale,slug,width,lang:await page.locator('html').getAttribute('lang'),title:await page.title(),runtimeErrors:errors.length});
    }
    // A language change persists without route changes and survives a reload.
    await page.getByRole('combobox',{name:locale==='fr'?'Langue':'Language',exact:true}).selectOption(locale==='fr'?'en':'fr');
    assert.equal(await page.evaluate(()=>localStorage.getItem('payflow.locale')),locale==='fr'?'en':'fr');
    await page.reload({waitUntil:'networkidle'});
    await page.getByRole('combobox',{name:locale==='fr'?'Language':'Langue',exact:true}).waitFor();
    await context.close();
  }
  await writeFile(`.review/screenshots/report-${mode}.json`,JSON.stringify(report,null,2));
} finally { await browser?.close();server.kill(); }
