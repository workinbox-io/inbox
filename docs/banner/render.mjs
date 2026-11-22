// Renders docs/banner/banner.html to banner.png and banner-dark.png.
// Needs Playwright and a Chromium: npx -y -p playwright node docs/banner/render.mjs
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 560 }, deviceScaleFactor: 2 });
for (const theme of ["light", "dark"]) {
  await page.goto(new URL(`banner.html?theme=${theme}`, import.meta.url).href);
  await page.waitForTimeout(500);
  await page.screenshot({ path: new URL(`banner${theme === "dark" ? "-dark" : ""}.png`, import.meta.url).pathname });
}
await browser.close();
