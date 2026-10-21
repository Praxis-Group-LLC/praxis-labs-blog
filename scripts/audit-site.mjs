// Local browser audit of the real built portfolio at desktop and mobile widths.
// Called in CI after astro build and static résumé PDF generation.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = '44322';
const ORIGIN = `http://127.0.0.1:${PORT}`;
const routes = [
  '/', '/work', '/writing', '/about', '/resume', '/projects',
  '/posts/distributed-dotnet-agent-platform',
  '/posts/modernizing-workflow-rules-with-ddd',
  '/posts/azure-modernization-without-big-bang-rewrite',
  '/posts/product-line-transition-system-design',
  '/projects/pathway', '/projects/theoria',
  '/projects/mollys-learning-arcade', '/projects/praxis-studio'
];
const architecturePages = [
  '/projects/pathway', '/projects/theoria',
  '/projects/mollys-learning-arcade', '/projects/praxis-studio',
  '/posts/modernizing-workflow-rules-with-ddd',
  '/posts/azure-modernization-without-big-bang-rewrite'
];

const preview = spawn('npm', ['run','preview','--','--host','127.0.0.1','--port',PORT], { stdio:['ignore','pipe','pipe'] });
preview.stdout.on('data', x=>process.stdout.write(x));
preview.stderr.on('data', x=>process.stderr.write(x));
let browser;
try {
  let ready = false;
  for(let i=0;i<50;i++){
    if(preview.exitCode!==null)throw new Error('Astro preview terminated');
    try{const x=await fetch(ORIGIN+'/');if(x.ok){ready=true;break}}catch{}
    await new Promise(r=>setTimeout(r,250));
  }
  if(!ready)throw new Error('Could not reach Astro preview');
  browser=await chromium.launch({headless:true});
  const configurations=[
    {name:'desktop',options:{viewport:{width:1440,height:900}}},
    {name:'mobile',options:{viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:2,hasTouch:true}}
  ];
  let total=0;
  for(const cfg of configurations){
    const ctx=await browser.newContext(cfg.options);
    for(const route of routes){
      const page=await ctx.newPage();
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      const response=await page.goto(ORIGIN+route,{waitUntil:'networkidle',timeout:30000});
      if(!response?.ok())throw new Error(`${cfg.name} ${route}: HTTP ${response?.status()}`);
      if(await page.locator('h1').count()===0)throw new Error(`${cfg.name} ${route}: Missing h1`);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
      if(overflow>10)throw new Error(`${cfg.name} ${route}: Horizontal overflow by ${overflow}px`);
      if(architecturePages.includes(route)){
        const svg=page.locator('.mermaid svg');
        await svg.first().waitFor({state:'visible',timeout:12000});
      }
      if(route.startsWith('/projects/')){
        const img=page.locator('.project-capture img');
        if(await img.count()){
          await img.first().evaluate(image=>image.decode());
          const width=await img.first().evaluate(image=>image.naturalWidth);
          if(width<200)throw new Error(`${cfg.name} ${route}: Missing/broken screenshot`);
        }
      }
      if(errors.length)throw new Error(`${cfg.name} ${route}: JavaScript error: ${errors.join('; ')}`);
      console.log(`PASS ${cfg.name} ${route}`);
      total++;
      await page.close();
    }
    const page=await ctx.newPage();
    await page.goto(ORIGIN+'/work');
    for(const slug of ['distributed-dotnet-agent-platform','modernizing-workflow-rules-with-ddd','azure-modernization-without-big-bang-rewrite','product-line-transition-system-design']){
      if(await page.locator(`a[href="/posts/${slug}"]`).count()===0)throw new Error(`Work page missing article link: ${slug}`);
    }
    await page.goto(ORIGIN+'/resume');
    if(await page.locator('a[href="/conor-brown-resume.pdf"]').count()===0)throw new Error('Resume page missing PDF download');
    const pdf=await page.request.get(ORIGIN+'/conor-brown-resume.pdf');
    if(!pdf.ok()||!(pdf.headers()['content-type']??'').includes('pdf'))throw new Error('PDF download failed');
    console.log(`PASS ${cfg.name} recruiter deep links and PDF`);
    await ctx.close();
  }
  console.log(`Audited ${total} routes with no page errors or horizontal overflow`);
} finally {
  if(browser)await browser.close();
  preview.kill('SIGTERM');
  preview.stdout.destroy();
  preview.stderr.destroy();
  preview.unref();
}
