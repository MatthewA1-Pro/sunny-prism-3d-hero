/**
 * Texture failure test.
 *
 * Blocks the matcap downloads, which makes the 3D scene throw while loading.
 * The hero must survive it: copy still on the page, the static prism fallback
 * shown in the prism slot, and no blank or crashed page.
 *
 * Usage: node qa/texture-failure-test.mjs [url]
 */

import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'

const URL = process.argv[2] || 'http://localhost:3000'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = path.join('qa', 'shots', 'texture-failure')
fs.mkdirSync(OUT, { recursive: true })

const settle = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
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
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })

const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))

await page.setRequestInterception(true)
page.on('request', (request) => {
  if (request.url().includes('/matcap')) request.abort()
  else request.continue()
})

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 })
await settle(10000)

const state = await page.evaluate(() => ({
  title: document.querySelector('.hero-title')?.textContent ?? null,
  copyOpacity: document.querySelector('.hero-copy')
    ? getComputedStyle(document.querySelector('.hero-copy')).opacity
    : null,
  fallback: Boolean(document.querySelector('.prism-slot .webgl-fallback')),
  canvas: Boolean(document.querySelector('canvas')),
  background: getComputedStyle(document.body).backgroundColor,
}))
await page.screenshot({ path: path.join(OUT, 'blocked-matcap.png') })

let failures = 0
const check = (ok, label) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) failures++
}

console.log('── matcap downloads blocked ──')
check(Boolean(state.title), `hero copy still rendered (title: ${state.title})`)
check(state.copyOpacity === '1', `copy fully visible (opacity ${state.copyOpacity})`)
check(state.fallback, 'static prism fallback shown in the slot')
check(!state.canvas, `failed canvas removed (canvas present: ${state.canvas})`)
check(state.background === 'rgb(15, 2, 31)', `dark background (${state.background})`)
console.log(`  (expected texture load errors reported by the page: ${pageErrors.length})`)

await browser.close()
console.log(failures === 0 ? '\nTEXTURE FAILURE TEST PASSED' : `\nTEXTURE FAILURE TEST: ${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
