/**
 * Accessibility and failure-mode test.
 *
 * 1. prefers-reduced-motion: the prism must still render, must not drift while
 *    at rest (idle motion off), must still respond to scroll, and the scroll
 *    hint must not pulse.
 * 2. WebGL unavailable: the static fallback must render in place of the canvas
 *    on the dark background, with no uncaught errors.
 *
 * Usage: node qa/a11y-fallback-test.mjs [url]
 */

import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
import { measurePng } from './capture.mjs'

const URL = process.argv[2] || 'http://localhost:3000'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = path.join('qa', 'shots', 'a11y')

const GL_ARGS = [
  '--no-sandbox',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
]

fs.mkdirSync(OUT, { recursive: true })

const settle = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
function check(ok, label) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) failures++
}

async function reducedMotion() {
  console.log('── prefers-reduced-motion: reduce ──')
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: GL_ARGS,
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })

  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ])
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForSelector('canvas', { timeout: 120000 })

  const hintAnimation = await page.evaluate(
    () => getComputedStyle(document.querySelector('.scroll-hint')).animationName
  )

  // Measure the 3D scene only.
  await page.addStyleTag({ content: '.scroll-hint{display:none!important}' })
  await settle(9000)

  const topA = path.join(OUT, 'reduced_top_a.png')
  await page.screenshot({ path: topA })
  const a = measurePng(topA)

  // With idle motion off, two frames at rest a few seconds apart must match.
  await settle(3000)
  const topB = path.join(OUT, 'reduced_top_b.png')
  await page.screenshot({ path: topB })
  const b = measurePng(topB)

  const max = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight
  )
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(max * 0.6))
  await settle(1500)
  const midFile = path.join(OUT, 'reduced_mid.png')
  await page.screenshot({ path: midFile })
  const mid = measurePng(midFile)

  check(a.coverage > 2, `prism rendered at top (coverage ${a.coverage}%)`)
  check(
    Math.abs(a.coverage - b.coverage) < 0.05 &&
      Math.abs(a.meanLum - b.meanLum) < 1,
    `no idle drift at rest (coverage ${a.coverage} -> ${b.coverage}, lum ${a.meanLum} -> ${b.meanLum})`
  )
  check(
    Math.abs(mid.coverage - a.coverage) > 0.1 || Math.abs(mid.meanLum - a.meanLum) > 2,
    `scroll still drives the scene (top cov ${a.coverage} / lum ${a.meanLum}, 0.6 cov ${mid.coverage} / lum ${mid.meanLum})`
  )
  check(hintAnimation === 'none', `scroll hint pulse disabled (animation-name: ${hintAnimation})`)
  check(errors.length === 0, `no page errors (${errors.length}) ${errors.slice(0, 2).join(' | ')}`)

  await browser.close()
}

async function noWebGL() {
  console.log('── WebGL unavailable ──')
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-webgl', '--disable-3d-apis', '--disable-gpu'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })

  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await settle(6000)

  const state = await page.evaluate(() => ({
    fallback: Boolean(document.querySelector('.webgl-fallback')),
    canvas: Boolean(document.querySelector('canvas')),
    background: getComputedStyle(document.body).backgroundColor,
  }))
  await page.screenshot({ path: path.join(OUT, 'no_webgl.png') })

  check(
    state.fallback && !state.canvas,
    `fallback rendered instead of canvas (fallback=${state.fallback}, canvas=${state.canvas})`
  )
  check(state.background === 'rgb(15, 2, 31)', `dark background, no white page (${state.background})`)
  check(errors.length === 0, `no page errors (${errors.length}) ${errors.slice(0, 2).join(' | ')}`)

  await browser.close()
}

try {
  await reducedMotion()
  await noWebGL()
} catch (e) {
  console.error('A11Y/FALLBACK TEST CRASHED:', e.message)
  process.exit(1)
}

console.log(failures === 0 ? '\nA11Y/FALLBACK TEST PASSED' : `\nA11Y/FALLBACK TEST: ${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
