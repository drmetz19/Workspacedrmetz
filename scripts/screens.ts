import { chromium } from 'playwright-core'

/** Screenshot halaman untuk pemeriksaan visual. Pemakaian: tsx scripts/screens.ts <email> <path>... */
const BASE = process.env.SCREEN_BASE ?? 'http://localhost:3000'
async function main() {
  const [email, ...paths] = process.argv.slice(2)
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
  const page = await browser.newPage({ viewport: { width: Number(process.env.W ?? 1280), height: 860 } })
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  if (email && email !== '-') {
    await page.goto(`${BASE}/api/auth/google/start`)
    await page.fill('#dev_email', email)
    await page.click('button[type=submit]')
    await page.waitForLoadState('load'); await page.waitForTimeout(400)
  }
  for (const p of paths) {
    await page.goto(BASE + p)
    await page.waitForLoadState('load'); await page.waitForTimeout(400)
    const file = `.smoke/${p.replace(/[^a-z0-9]+/gi, '_') || 'root'}.png`
    await page.screenshot({ path: file, fullPage: true })
    console.log('saved', file)
  }
  if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'))
  await browser.close()
}
main()
