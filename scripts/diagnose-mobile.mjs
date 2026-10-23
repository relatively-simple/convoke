import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { build } from 'esbuild';

const root = resolve('.');
const out = resolve('work/browser-tests');
await mkdir(out, { recursive: true });

await build({
  entryPoints: ['scripts/browser-fixture.tsx'],
  outdir: out,
  bundle: true,
  format: 'esm',
  splitting: true,
  loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file' },
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
});

// Simple static file server
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <link rel="stylesheet" href="/browser-fixture.css">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/browser-fixture.js"></script>
</body>
</html>`);
      return;
    }
    const folder = path.startsWith('/runtime/') ? resolve(root, 'public') : out;
    const file = resolve(folder, '.' + path);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Content-Type',
      ({
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.wasm': 'application/wasm',
        '.css': 'text/css',
        '.json': 'application/json',
        '.woff2': 'font/woff2',
      })[extname(file)] || 'application/octet-stream'
    );
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage();

const viewports = [
  { name: 'iphone-se-320', width: 320, height: 568 },
  { name: 'small-360', width: 360, height: 740 },
  { name: 'iphone-375', width: 375, height: 667 },
  { name: 'iphone-390', width: 390, height: 844 },
];

for (const vp of viewports) {
  await page.setViewportSize({ width: vp.width, height: vp.height });

  // Mock API to return an active project with messages and artifact
  await page.route('**/api/workspace', async (route) => {
    const project = {
      id: 'test-mobile-proj',
      title: 'Thermodynamics of Heat Conduction in Metals',
      revision: 1,
      mode: 'build',
      updatedAt: new Date().toISOString(),
      brief: 'Demonstrate heat conduction across a multi-segment rod',
      messages: [
        {
          id: 'm1',
          role: 'user',
          text: 'Can you show me how heat flows across an iron rod with hot and cold ends?',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'm2',
          role: 'assistant',
          text: 'Here is an interactive thermal conduction profile. You can adjust the boundary temperatures and material thermal conductivities.',
          model: 'Gemini Flash',
          boardroomId: 'brd-1',
          cost: { label: '~320 tokens / free' },
          createdAt: new Date().toISOString(),
        },
      ],
      versions: [
        {
          id: 'v1',
          number: 1,
          title: 'Thermal Conduction Profile',
          html: '<h1>Simulation</h1>',
          createdAt: new Date().toISOString(),
          source: 'AI-generated',
          runtime: { status: 'passed', attempts: 0, issues: [] },
        },
      ],
    };
    await route.fulfill({
      json: {
        project,
        projects: [project],
        capabilities: { live: true, model: 'fixture', provider: 'Tri-Mesh', dailyLimit: null },
      },
    });
  });

  await page.goto(`${base}/?workspace&project=test-mobile-proj`);
  await page.waitForSelector('.workspace-main');
  await page.waitForTimeout(500);

  const debugState = await page.evaluate(() => {
    const btn = document.querySelector('.mobile-view-tabs button:last-child') || document.querySelector('.mobile-canvas-button');
    return {
      title: document.querySelector('.breadcrumb strong')?.textContent,
      canvasBtnDisabled: btn ? btn.disabled : null,
      canvasBtnVisible: btn ? window.getComputedStyle(btn).display : null,
    };
  });
  console.log('Debug state on load:', debugState);

  // Check visibility of key interactive elements
  const checks = await page.evaluate((viewportWidth) => {
    const issues = [];
    
    // Check Topbar elements
    const topbar = document.querySelector('.topbar');
    if (topbar) {
      const rect = topbar.getBoundingClientRect();
      if (rect.right > viewportWidth) issues.push(`Topbar overflows right (${rect.right} > ${viewportWidth})`);
    }

    // Check Breadcrumb title
    const title = document.querySelector('.breadcrumb strong');
    if (title) {
      const rect = title.getBoundingClientRect();
      if (rect.width <= 10) issues.push(`Project title in breadcrumb is squished to ${rect.width}px`);
    }

    // Check Composer elements
    const sendBtn = document.querySelector('button[aria-label="Send message"], button[aria-label="Stop request"]');
    if (sendBtn) {
      const rect = sendBtn.getBoundingClientRect();
      if (rect.right > viewportWidth) issues.push(`Send button is cut off on right (${rect.right} > ${viewportWidth})`);
      if (rect.width <= 10) issues.push(`Send button is collapsed to ${rect.width}px`);
    } else {
      issues.push('Send button not found');
    }

    const settingsBtn = document.querySelector('.controls-toggle-btn');
    if (settingsBtn) {
      const rect = settingsBtn.getBoundingClientRect();
      if (rect.right > viewportWidth) issues.push(`Settings toggle is cut off on right (${rect.right} > ${viewportWidth})`);
    }

    // Check Message headings and badges
    const boardroomPill = document.querySelector('.boardroom-pill');
    if (boardroomPill) {
      const rect = boardroomPill.getBoundingClientRect();
      if (rect.right > viewportWidth) issues.push(`Boardroom pill overflows right (${rect.right} > ${viewportWidth})`);
    }

    const costTag = document.querySelector('.cost-ledger-tag');
    if (costTag) {
      const rect = costTag.getBoundingClientRect();
      if (rect.right > viewportWidth) issues.push(`Cost ledger tag overflows right (${rect.right} > ${viewportWidth})`);
    }

    // Check any element overflowing
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > viewportWidth + 2) {
        issues.push(`Element <${el.tagName} class="${el.className}"> overflows: right=${Math.round(r.right)}px > ${viewportWidth}px (+${Math.round(r.right - viewportWidth)}px)`);
      }
    }

    return issues;
  }, vp.width);

  console.log(`\n=== Viewport ${vp.name} (${vp.width}x${vp.height}) with active chat ===`);
  if (checks.length === 0) {
    console.log('No overflow or visibility issues detected in initial view!');
  } else {
    for (const issue of checks.slice(0, 15)) {
      console.log('  ❌ ' + issue);
    }
  }

  await page.screenshot({ path: resolve(out, `active-chat-${vp.name}.png`) });

  // Test toggling canvas
  const mobileCanvasBtn = page.locator('.mobile-view-tabs button:last-child, .mobile-canvas-button');
  if (await mobileCanvasBtn.first().isVisible()) {
    const preClick = await page.evaluate(() => {
      const btn = document.querySelector('.mobile-view-tabs button:last-child') || document.querySelector('.mobile-canvas-button');
      return {
        btnExists: !!btn,
        disabled: btn ? btn.disabled : null,
        outerHTML: btn ? btn.outerHTML : null,
      };
    });
    console.log('Pre-click button info:', preClick);

    await mobileCanvasBtn.first().click();
    await page.waitForTimeout(600);

    const postClick = await page.evaluate(() => {
      const workArea = document.querySelector('.work-area');
      const canvas = document.querySelector('.canvas');
      return {
        workAreaClass: workArea?.className,
        canvasExists: !!canvas,
        canvasDisplay: canvas ? window.getComputedStyle(canvas).display : null,
      };
    });
    console.log('Post-click info:', postClick);

    const canvasIssues = await page.evaluate((viewportWidth) => {
      const issues = [];
      const canvas = document.querySelector('.canvas');
      if (!canvas) {
        issues.push('Canvas DOM element does not exist!');
      } else {
        const cs = window.getComputedStyle(canvas);
        if (cs.display === 'none') {
          issues.push('Canvas display is none!');
        }
        const r = canvas.getBoundingClientRect();
        if (r.right > viewportWidth + 2) {
          issues.push(`Canvas overflows right (${r.right} > ${viewportWidth})`);
        }
      }
      return issues;
    }, vp.width);

    console.log(`Canvas toggle test: ${canvasIssues.length === 0 ? 'Visible & within viewport' : canvasIssues.join(', ')}`);
    await page.screenshot({ path: resolve(out, `active-canvas-${vp.name}.png`) });

    // Test switching back to chat
    const backBtn = page.locator('.mobile-back-to-chat, .mobile-view-tabs button:first-child');
    if (await backBtn.first().isVisible()) {
      await backBtn.first().click();
      await page.waitForTimeout(400);
      const postBack = await page.evaluate(() => {
        const conv = document.querySelector('.conversation');
        return {
          convVisible: conv ? window.getComputedStyle(conv).display : null,
        };
      });
      console.log('Post-back to chat info:', postBack);
    }
  } else {
    console.log('Mobile canvas button is not visible!');
  }
}

await browser.close();
await new Promise((r) => server.close(r));
