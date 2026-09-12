/**
 * QA capture harness.
 *
 * Drives the running app in headless Chrome, scrubs the scroll timeline and
 * writes a screenshot per checkpoint, plus a contact sheet for side-by-side
 * comparison against the buyer reference frames.
 *
 * Usage:
 *   node qa/capture.mjs [url] [label] [width] [height]
 */

import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
import { PNG } from 'pngjs'

const URL = process.argv[2] || 'http://localhost:3000'
const LABEL = process.argv[3] || 'dev'
const WIDTH = Number(process.argv[4] || 1440)
const HEIGHT = Number(process.argv[5] || 900)

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = path.join('qa', 'shots', LABEL)

const CHECKPOINTS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]

fs.mkdirSync(OUT, { recursive: true })

/** Scene background, used to separate prism pixels from empty space. */
const BG = [15, 2, 31]

/**
 * Measure a rendered frame.
 *
 * Reads the saved PNG rather than the live canvas — a WebGL canvas without
 * preserveDrawingBuffer reads back empty, which is why the first pass reported
 * a meaningless 100% coverage everywhere.
 *
 * Returns how much of the frame the prism occupies and how bright/saturated it
 * is, so "does the material match the reference" can be checked numerically
 * against frames pulled from demo.mp4, not just by eye.
 */
export function measurePng(file) {
  const png = PNG.sync.read(fs.readFileSync(file))
  const { width, height, data } = png

  // Background luminance is ~6.9. A threshold of 35 separates the prism from
  // the background in our clean renders AND survives the H.264 compression
  // noise in frames pulled from demo.mp4 — a plain colour-distance test let
  // that noise register as prism and reported every reference frame as 100%
  // tall.
  const LUM_MIN = 35

  let lit = 0
  let lumSum = 0
  let lumMax = 0
  let satSum = 0

  const rowCount = new Uint32Array(height)
  const colCount = new Uint32Array(width)

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if (lum <= LUM_MIN) continue

    lit++
    const px = (i / 4) % width
    const py = Math.floor(i / 4 / width)
    rowCount[py]++
    colCount[px]++

    lumSum += lum
    if (lum > lumMax) lumMax = lum

    const mx = Math.max(r, g, b)
    const mn = Math.min(r, g, b)
    satSum += mx === 0 ? 0 : (mx - mn) / mx
  }

  // Reject isolated speckle: a row/column only counts as occupied once it
  // holds at least 0.4% of its length in lit pixels.
  const rowMin = Math.max(2, Math.round(width * 0.004))
  const colMin = Math.max(2, Math.round(height * 0.004))

  let minY = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    if (rowCount[y] >= rowMin) {
      if (minY < 0) minY = y
      maxY = y
    }
  }

  let minX = -1
  let maxX = -1
  for (let x = 0; x < width; x++) {
    if (colCount[x] >= colMin) {
      if (minX < 0) minX = x
      maxX = x
    }
  }

  const pct = (v) => +v.toFixed(1)

  return {
    coverage: +((lit / (width * height)) * 100).toFixed(2),
    heightPct: maxY >= 0 ? pct(((maxY - minY + 1) / height) * 100) : 0,
    widthPct: maxX >= 0 ? pct(((maxX - minX + 1) / width) * 100) : 0,
    centerYPct: maxY >= 0 ? pct((((minY + maxY) / 2) / height) * 100) : 0,
    meanLum: lit ? +(lumSum / lit).toFixed(1) : 0,
    maxLum: +lumMax.toFixed(0),
    meanSat: lit ? +(satSum / lit).toFixed(3) : 0,
  }
}

const run = async () => {
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
      `--window-size=${WIDTH},${HEIGHT}`,
    ],
  })

  const page = await browser.newPage()
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 })

  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

  // The dev server holds an HMR socket open, so networkidle never fires.
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.addStyleTag({ content: '.scroll-hint{display:none!important}' })
  await page.waitForSelector('canvas, .webgl-fallback', { timeout: 120000 })

  // Wait for the canvas to have a real backing store. On a cold dev server the
  // first capture otherwise lands while Turbopack is still compiling and
  // records an empty scene.
  await page.waitForFunction(
    () => {
      const c = document.querySelector('canvas')
      return c && c.width > 0 && c.height > 0
    },
    { timeout: 120000 }
  )

  // Let the texture load and the damped progress settle.
  await new Promise((r) => setTimeout(r, 9000))

  const max = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight
  )

  const report = []

  for (const f of CHECKPOINTS) {
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(max * f))
    // Generous settle so the damped value fully reaches the target.
    await new Promise((r) => setTimeout(r, 2200))

    const name = `p${String(Math.round(f * 100)).padStart(3, '0')}.png`
    await page.screenshot({ path: path.join(OUT, name) })

    const stats = measurePng(path.join(OUT, name))

    report.push({ progress: f, ...stats })
    console.log(
      `p=${f.toFixed(2)}  cov=${String(stats.coverage).padStart(5)}%  h=${String(stats.heightPct).padStart(5)}%  cy=${String(stats.centerYPct).padStart(5)}%  lum=${String(stats.meanLum).padStart(5)}  max=${String(stats.maxLum).padStart(3)}  sat=${stats.meanSat}`
    )
  }

  fs.writeFileSync(
    path.join(OUT, 'report.json'),
    JSON.stringify({ url: URL, width: WIDTH, height: HEIGHT, errors, report }, null, 2)
  )

  console.log('\nconsole errors:', errors.length)
  errors.slice(0, 10).forEach((e) => console.log('  ', e))

  await browser.close()
}

// Only drive the browser when this file is the entry point; the metric above
// is imported by qa/measure-reference.mjs.
if (process.argv[1] && process.argv[1].endsWith('capture.mjs')) {
  run().catch((e) => {
    console.error('CAPTURE FAILED:', e.message)
    process.exit(1)
  })
}
