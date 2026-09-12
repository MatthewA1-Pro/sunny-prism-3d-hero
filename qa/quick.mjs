/**
 * Fast iteration capture: a handful of scroll stops at one viewport.
 *
 * Unlike capture.mjs it also reports `darkPct` — the share of the prism's
 * silhouette that renders near-black. The luminance threshold in measurePng()
 * treats black matcap regions as empty background, so a prism that is half
 * black card scored as well-lit. This closes that blind spot.
 *
 * Usage: node qa/quick.mjs [url] [label] [width] [height] [stops]
 *   stops: comma-separated progress values, default 0,0.25,0.5,0.75,1
 */

import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
import { PNG } from 'pngjs'
import { measurePng } from './capture.mjs'

const URL = process.argv[2] || 'http://localhost:3000'
const LABEL = process.argv[3] || 'quick'
const WIDTH = Number(process.argv[4] || 1440)
const HEIGHT = Number(process.argv[5] || 900)
const STOPS = (process.argv[6] || '0,0.25,0.5,0.75,1').split(',').map(Number)

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = path.join('qa', 'shots', LABEL)
fs.mkdirSync(OUT, { recursive: true })

const settle = (ms) => new Promise((r) => setTimeout(r, ms))

/** Share of non-background pixels that are near-black (lum <= 35). */
export function darkShare(file) {
  const { data } = PNG.sync.read(fs.readFileSync(file))
  let prism = 0
  let dark = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    // Background is (15, 2, 31); anything clearly off it belongs to the scene.
    const dist = Math.abs(r - 15) + Math.abs(g - 2) + Math.abs(b - 31)
    if (dist < 14) continue
    prism++
    if (0.2126 * r + 0.7152 * g + 0.0722 * b <= 35) dark++
  }
  return prism ? +((dark / prism) * 100).toFixed(1) : 0
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
  ],
})

const page = await browser.newPage()
await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.addStyleTag({ content: '.scroll-hint{display:none!important}' })
await page.waitForFunction(
  () => {
    const c = document.querySelector('canvas')
    return c && c.width > 0
  },
  { timeout: 120000 }
)
await settle(7000)

const max = await page.evaluate(
  () => document.documentElement.scrollHeight - window.innerHeight
)

for (const f of STOPS) {
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(max * f))
  await settle(1800)
  const file = path.join(OUT, `p${String(Math.round(f * 100)).padStart(3, '0')}.png`)
  await page.screenshot({ path: file })
  const m = measurePng(file)
  console.log(
    `p=${f.toFixed(2)} h=${m.heightPct}% w=${m.widthPct}% cy=${m.centerYPct}% lum=${m.meanLum} sat=${m.meanSat} dark=${darkShare(file)}%`
  )
}

console.log('errors:', errors.length, errors.slice(0, 5).join(' | '))
await browser.close()
