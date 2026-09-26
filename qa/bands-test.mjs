/**
 * Chapters 4-6 check: the shadow's bands, their labels and the ribbon stack.
 *
 * Screenshots say whether it looks right; this says whether it is right. At
 * each stop it reads the four band labels straight out of the page and asserts:
 *
 *   - the scroll track is CHAPTER_COUNT viewports long, so the last chapter has
 *     room of its own to play in (the `.chapter-tail`);
 *   - the labels are hidden before the bands are cut apart;
 *   - once cut, every label is visible AND fully inside the viewport;
 *   - at the end they form the ribbon stack's column: aligned in x, ordered
 *     top-to-bottom in y.
 *
 * Usage: node qa/bands-test.mjs [url] [width] [height]
 */

import puppeteer from 'puppeteer-core'

const URL = process.argv[2] || 'http://localhost:3000'
const WIDTH = Number(process.argv[3] || 1440)
const HEIGHT = Number(process.argv[4] || 900)
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const CHAPTERS = 7

const settle = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, message) => {
  if (!ok) failures.push(message)
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${message}`)
}

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
await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForFunction(() => document.querySelector('canvas')?.width > 0, {
  timeout: 120000,
})
await settle(7000)

const track = await page.evaluate(
  () => document.documentElement.scrollHeight - window.innerHeight
)
console.log(`${WIDTH}x${HEIGHT} track=${track}px (${(track / HEIGHT).toFixed(2)} viewports)`)
check(
  Math.abs(track / HEIGHT - CHAPTERS) < 0.25,
  `track is ${CHAPTERS} viewports (chapters + tail), got ${(track / HEIGHT).toFixed(2)}`
)

const readLabels = () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-band-label]')).map((el) => {
      const r = el.getBoundingClientRect()
      return {
        text: el.textContent,
        opacity: Number(getComputedStyle(el).opacity),
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
      }
    })
  )

const at = async (p) => {
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(track * p))
  await settle(2200)
  return readLabels()
}

// Chapter units: p * CHAPTERS. Stops are placed inside the chapter they test.
const stops = {
  grid: 3.5 / CHAPTERS, // before the shadow: nothing labelled yet
  shadow: 4.5 / CHAPTERS, // shadow cast, bands still joined
  bands: 5.5 / CHAPTERS, // cut apart and labelled
  converged: 5.85 / CHAPTERS, // second triangle met
  sliver: 6.3 / CHAPTERS, // standing up
  ribbons: 1, // the stack
}

console.log('\n-- chapter 3 (grid): labels not yet shown')
const grid = await at(stops.grid)
check(
  grid.every((l) => l.opacity < 0.02),
  'all four labels hidden before the shadow is cut'
)

console.log('\n-- chapter 4 (shadow): cast, bands still joined')
const shadow = await at(stops.shadow)
check(
  shadow.every((l) => l.opacity < 0.35),
  'labels stay quiet while the shadow is still one triangle'
)

for (const [name, p] of [
  ['chapter 5 (bands)', stops.bands],
  ['chapter 5 (converged)', stops.converged],
  ['chapter 6 (ribbons)', stops.ribbons],
]) {
  console.log(`\n-- ${name}`)
  const labels = await at(p)
  labels.forEach((l) =>
    console.log(
      `     ${l.text.padEnd(12)} opacity=${l.opacity.toFixed(2)} x=${l.cx.toFixed(0)} y=${l.cy.toFixed(0)}`
    )
  )
  check(
    labels.every((l) => l.opacity > 0.5),
    `${name}: every band is labelled`
  )
  check(
    labels.every(
      (l) => l.left >= 0 && l.right <= WIDTH && l.top >= 0 && l.bottom <= HEIGHT
    ),
    `${name}: every label is fully inside the viewport`
  )
}

console.log('\n-- ribbon stack geometry')
const stack = await readLabels()
const xs = stack.map((l) => l.cx)
const spread = Math.max(...xs) - Math.min(...xs)
check(spread < 24, `labels line up in a column (x spread ${spread.toFixed(1)}px < 24)`)
const ys = stack.map((l) => l.cy)
check(
  ys.every((y, i) => i === 0 || y > ys[i - 1] + 8),
  `labels are stacked top to bottom (${ys.map((y) => y.toFixed(0)).join(' < ')})`
)

console.log(`\nconsole errors: ${errors.length}${errors.length ? ' | ' + errors.slice(0, 3).join(' | ') : ''}`)
if (errors.length) failures.push(`${errors.length} console errors`)

console.log(failures.length ? `\nFAILURES (${failures.length}):\n- ${failures.join('\n- ')}` : '\nALL CHECKS PASSED')
await browser.close()
process.exit(failures.length ? 1 : 0)
