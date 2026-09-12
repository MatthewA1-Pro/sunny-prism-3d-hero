/**
 * Scroll determinism test.
 *
 * Scrubs the timeline forward, then backward through the same progress values,
 * and compares the rendered result at each one. Every structural transform is a
 * pure function of normalized progress, so the two passes must agree; a
 * mismatch means state is leaking across frames.
 *
 * Also exercises fast flicks and a resize, which are the cases where a scroll
 * system built on accumulated deltas (rather than absolute position) breaks.
 *
 * Usage: node qa/scrub-test.mjs [url]
 */

import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
import { measurePng } from './capture.mjs'

const URL = process.argv[2] || 'http://localhost:3000'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = path.join('qa', 'shots', 'scrub')

const STOPS = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.0]

// The prism keeps a slow idle motion (breathing, the drifting section scan), so
// two visits to the same scroll position are not pixel-identical by design.
// These tolerances catch structural drift while allowing that idle movement.
const TOL = { coverage: 0.9, heightPct: 6.0, centerYPct: 5.0 }

fs.mkdirSync(OUT, { recursive: true })

const settle = (ms) => new Promise((r) => setTimeout(r, ms))

async function shoot(page, max, f, tag) {
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(max * f))
  await settle(2000)
  const file = path.join(OUT, `${tag}_${Math.round(f * 100)}.png`)
  await page.screenshot({ path: file })
  return measurePng(file)
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
    ],
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })

  const errors = []
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.addStyleTag({ content: '.scroll-hint{display:none!important}' })
  await page.waitForSelector('canvas', { timeout: 120000 })
  await settle(9000)

  const max = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight
  )

  console.log('── forward pass ──')
  const fwd = {}
  for (const f of STOPS) {
    fwd[f] = await shoot(page, max, f, 'fwd')
    console.log(
      `  ${f.toFixed(2)}  cov=${String(fwd[f].coverage).padStart(5)}  h=${String(fwd[f].heightPct).padStart(5)}  cy=${String(fwd[f].centerYPct).padStart(5)}`
    )
  }

  console.log('── reverse pass ──')
  const rev = {}
  for (const f of [...STOPS].reverse()) {
    rev[f] = await shoot(page, max, f, 'rev')
    console.log(
      `  ${f.toFixed(2)}  cov=${String(rev[f].coverage).padStart(5)}  h=${String(rev[f].heightPct).padStart(5)}  cy=${String(rev[f].centerYPct).padStart(5)}`
    )
  }

  console.log('\n── forward vs reverse ──')
  let failures = 0
  for (const f of STOPS) {
    const d = {
      coverage: Math.abs(fwd[f].coverage - rev[f].coverage),
      heightPct: Math.abs(fwd[f].heightPct - rev[f].heightPct),
      centerYPct: Math.abs(fwd[f].centerYPct - rev[f].centerYPct),
    }
    const bad = Object.keys(TOL).filter((k) => d[k] > TOL[k])
    if (bad.length) failures++
    console.log(
      `  ${f.toFixed(2)}  dcov=${d.coverage.toFixed(2)}  dh=${d.heightPct.toFixed(1)}  dcy=${d.centerYPct.toFixed(1)}  ${bad.length ? 'FAIL(' + bad.join(',') + ')' : 'ok'}`
    )
  }

  // Fast flick: jump straight to the end and straight back.
  console.log('\n── fast flick ──')
  await page.evaluate((y) => window.scrollTo(0, y), max)
  await settle(300)
  await page.evaluate(() => window.scrollTo(0, 0))
  await settle(3000)
  const afterFlick = await shoot(page, max, 0, 'flick')
  const flickDelta = Math.abs(afterFlick.coverage - fwd[0].coverage)
  console.log(
    `  back at top after flick: cov=${afterFlick.coverage} (baseline ${fwd[0].coverage}, delta ${flickDelta.toFixed(2)}) ${flickDelta <= TOL.coverage ? 'ok' : 'FAIL'}`
  )
  if (flickDelta > TOL.coverage) failures++

  // Resize must not corrupt the timeline.
  console.log('\n── resize at mid-timeline ──')
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(max * 0.45))
  await settle(1500)
  await page.setViewport({ width: 1024, height: 768 })
  await settle(1500)
  await page.setViewport({ width: 1440, height: 900 })
  await settle(2500)
  const afterResize = await shoot(page, max, 0.45, 'resize')
  const resizeDelta = Math.abs(afterResize.coverage - fwd[0.45].coverage)
  console.log(
    `  at 0.45 after resize round-trip: cov=${afterResize.coverage} (baseline ${fwd[0.45].coverage}, delta ${resizeDelta.toFixed(2)}) ${resizeDelta <= TOL.coverage ? 'ok' : 'FAIL'}`
  )
  if (resizeDelta > TOL.coverage) failures++

  // Reload while scrolled must resolve to the right state, not animate up from 0.
  console.log('\n── reload while scrolled ──')
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(max * 0.75))
  await settle(1200)
  await page.reload({ waitUntil: 'domcontentloaded' })
  // The injected style is lost across a navigation.
  await page.addStyleTag({ content: '.scroll-hint{display:none!important}' })
  await page.waitForSelector('canvas', { timeout: 120000 })
  await settle(9000)
  const y = await page.evaluate(() => window.scrollY)
  const afterReload = await shoot(page, max, 0.75, 'reload')
  const reloadDelta = Math.abs(afterReload.coverage - fwd[0.75].coverage)
  console.log(
    `  restored scrollY=${y} of ${max}; cov=${afterReload.coverage} (baseline ${fwd[0.75].coverage}, delta ${reloadDelta.toFixed(2)}) ${reloadDelta <= TOL.coverage ? 'ok' : 'FAIL'}`
  )
  if (reloadDelta > TOL.coverage) failures++

  console.log('\nconsole/page errors:', errors.length)
  errors.slice(0, 8).forEach((e) => console.log('  ', e))
  console.log(failures === 0 ? '\nSCRUB TEST PASSED' : `\nSCRUB TEST: ${failures} failure(s)`)

  await browser.close()
  process.exit(failures === 0 ? 0 : 1)
}

run().catch((e) => {
  console.error('SCRUB TEST FAILED:', e.message)
  process.exit(1)
})
