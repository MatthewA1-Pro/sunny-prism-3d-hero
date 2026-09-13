/**
 * Scroll responsiveness diagnostic.
 *
 * Scrolls in small steps and times each step, while counting ResizeObserver
 * callbacks and animation frames. A main-thread stall (layout feedback loop,
 * runaway observer) shows up as a slow step or an exploding callback count,
 * instead of an opaque protocol timeout.
 *
 * Usage: node qa/diag-scroll.mjs [url] [width] [height]
 */

import puppeteer from 'puppeteer-core'

const URL = process.argv[2] || 'http://localhost:3000'
const WIDTH = Number(process.argv[3] || 390)
const HEIGHT = Number(process.argv[4] || 844)
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const settle = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 45000,
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
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))

await page.evaluateOnNewDocument(() => {
  window.__ro = 0
  window.__frames = 0
  const Native = window.ResizeObserver
  window.ResizeObserver = class extends Native {
    constructor(cb) {
      super((entries, obs) => {
        window.__ro++
        cb(entries, obs)
      })
    }
  }
  const tick = () => {
    window.__frames++
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForFunction(() => document.querySelector('canvas')?.width > 0, {
  timeout: 120000,
})
await settle(6000)

const sample = async (label) => {
  const a = await page.evaluate(() => ({ ro: window.__ro, frames: window.__frames }))
  await settle(1000)
  const b = await page.evaluate(() => ({
    ro: window.__ro,
    frames: window.__frames,
    stageH: document.querySelector('.prism-stage')?.getBoundingClientRect().height,
    slotH: document.querySelector('.prism-slot')?.getBoundingClientRect().height,
  }))
  console.log(
    `${label.padEnd(12)} fps=${b.frames - a.frames}  roCallbacks/s=${b.ro - a.ro}  roTotal=${b.ro}  stageH=${b.stageH}  slotH=${b.slotH}`
  )
}

await sample('at rest')
const max = await page.evaluate(
  () => document.documentElement.scrollHeight - window.innerHeight
)

for (const f of [0.02, 0.05, 0.1, 0.2, 0.35, 0.5]) {
  const t0 = Date.now()
  try {
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(max * f))
    console.log(`scrollTo ${f.toFixed(2)} returned in ${Date.now() - t0}ms`)
    await sample(`p=${f.toFixed(2)}`)
  } catch (e) {
    console.log(`scrollTo ${f.toFixed(2)} FAILED after ${Date.now() - t0}ms: ${e.message.split('\n')[0]}`)
    break
  }
}

await browser.close()
