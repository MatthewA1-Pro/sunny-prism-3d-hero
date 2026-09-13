/**
 * Hero capture: full-page composition screenshots, scroll hint included.
 *
 * Unlike capture.mjs / quick.mjs (which hide the hint and measure the prism in
 * isolation) this records exactly what a visitor sees, for judging the hero as
 * a designed page. Also reports console errors and horizontal overflow.
 *
 * Usage: node qa/hero.mjs [url] [label] [width] [height] [stops]
 *   stops: comma-separated progress values, default 0
 */

import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'

const URL = process.argv[2] || 'http://localhost:3000'
const LABEL = process.argv[3] || 'hero'
const WIDTH = Number(process.argv[4] || 1440)
const HEIGHT = Number(process.argv[5] || 900)
const STOPS = (process.argv[6] || '0').split(',').map(Number)

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = path.join('qa', 'shots', LABEL)
fs.mkdirSync(OUT, { recursive: true })

const settle = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  // Headless software WebGL has no vsync and renders flat out, which can delay
  // DevTools calls by several seconds (see qa/diag-scroll.mjs). Not a page bug.
  protocolTimeout: 600000,
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--hide-scrollbars',
  ],
})

const page = await browser.newPage()
await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
// A renderer crash otherwise surfaces only as a 'detached Frame' error later.
page.on('error', (e) => console.log('PAGE CRASHED:', e.message))
page.on('close', () => console.log('PAGE CLOSED'))

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForFunction(
  () => {
    const c = document.querySelector('canvas')
    return (c && c.width > 0) || document.querySelector('.webgl-fallback')
  },
  { timeout: 120000 }
)
await settle(7000)

const info = await page.evaluate(() => ({
  max: document.documentElement.scrollHeight - window.innerHeight,
  overflowX: document.documentElement.scrollWidth - window.innerWidth,
  font: getComputedStyle(document.querySelector('.hero-title')).fontFamily,
}))
console.log(`${WIDTH}x${HEIGHT} track=${info.max}px overflowX=${info.overflowX}px font=${info.font}`)

for (const f of STOPS) {
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(info.max * f))
  await settle(f === 0 ? 500 : 2000)
  const file = path.join(OUT, `p${String(Math.round(f * 100)).padStart(3, '0')}.png`)
  await page.screenshot({ path: file })
  const state = await page.evaluate(() => {
    const copy = document.querySelector('.hero-copy')
    const hint = document.querySelector('.scroll-hint')
    return {
      copyOpacity: copy ? getComputedStyle(copy).opacity : null,
      hintOpacity: hint ? getComputedStyle(hint).opacity : null,
    }
  })
  console.log(`  p=${f.toFixed(2)} -> ${file}  copy=${state.copyOpacity} hint=${state.hintOpacity}`)
}

console.log('errors:', errors.length, errors.slice(0, 5).join(' | '))
await browser.close()
