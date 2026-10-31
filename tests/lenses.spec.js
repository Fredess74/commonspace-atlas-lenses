/* Atlas Lenses: lenses rank with reasons, trust is encoded and spelled out,
   connections reach the base map with their derived type labelled as inferred,
   dead ends offer alternatives, and the results work by keyboard alone.
   ?asof= pins "now" so freshness assertions don't drift with the calendar. */
const { test, expect, DATA, byId, waitForApp } = require("./helpers/atlas");

// the same undirected adjacency the page builds from `links`
const adj = new Map(DATA.map(d => [d.id, new Set()]));
DATA.forEach(d => (d.links || []).forEach(t => {
  if(t !== d.id && adj.has(t)){ adj.get(d.id).add(t); adj.get(t).add(d.id); }
}));
const loner = DATA.find(d => adj.get(d.id).size === 0);
const hub = byId.csail || DATA.find(d => adj.get(d.id).size > 0);

test("?lens=student&near=amherst ranks results and says why", async ({ page }) => {
  await page.goto("./?lens=student&near=amherst&r=50&asof=2026-10");
  await waitForApp(page);
  await expect(page.locator("#lensPanel")).toHaveClass(/\bon\b/);
  await expect(page.locator('.lens-chip[data-lens="student"]')).toHaveAttribute("aria-pressed", "true");
  const items = page.locator("#lpList .lp-item");
  await expect(items.first()).toBeVisible();
  await expect(items.first().locator(".lp-why")).toContainText("Why ranked:");
  await expect(items.first().locator(".lp-why")).toContainText("km from Amherst");
  // the live summary is computed, and names the lens and the place
  await expect(page.locator("#lpSum")).toContainText(/Student lens near Amherst: \d+ organization/);
  // every result links to its source
  const href = await items.first().locator('a.lp-act[target="_blank"]').getAttribute("href");
  expect(href).toMatch(/^https?:\/\//);
});

test("a thin area says it is a gap in the map and offers the nearest alternatives", async ({ page }) => {
  await page.goto("./?lens=founder&near=springfield&r=10&asof=2026-10");
  await waitForApp(page);
  await expect(page.locator("#lpGap")).toContainText("gap in the map, not proof there's no AI here");
  await expect(page.locator("#lpGap button")).toContainText("Suggest an entry");
  await expect(page.locator("#lpList .lp-beyond").first()).toContainText("Nearest beyond 10 km");
});

test("?entry= draws arcs and groups connections by derived type, marked inferred", async ({ page }) => {
  await page.goto(`./?entry=${hub.id}&asof=2026-10`);
  await expect(page.locator("#drawer")).toHaveClass(/\bopen\b/);
  const n = adj.get(hub.id).size;
  // one arc plus one endpoint dot per connection, on a layer outside the clusters
  expect(await page.evaluate(() => arcLayer.getLayers().length)).toBe(n * 2);
  await expect(page.locator("#drBody .conn-note")).toContainText("Type inferred from organization categories");
  await expect(page.locator("#drBody .conn-type").first()).toContainText("(inferred)");
  // each chip is a real deep link
  await expect(page.locator("#drBody .conn-group a.chip").first()).toHaveAttribute("href", /\?entry=/);
  // the six signals sit above the action buttons
  const order = await page.evaluate(() => {
    const body = document.getElementById("drBody");
    const s = body.querySelector(".sig-strip"), a = body.querySelector(".dr-actions");
    return !!(s && a && (s.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(order).toBe(true);
});

test("an entry with no connections says so instead of hiding the section", async ({ page }) => {
  test.skip(!loner, "every entry has a connection");
  await page.goto(`./?entry=${loner.id}`);
  await expect(page.locator("#drBody .conn-empty")).toContainText("No connections recorded yet");
  await expect(page.locator("#drBody .conn-empty a")).toContainText("Suggest a connection");
  await expect(page.locator('#drBody .sig[data-sig="links"]')).toContainText("No connections recorded");
});

test("trustOf maps months since lastVerified to the opacity steps", async ({ page }) => {
  await page.goto("./?asof=2026-10");
  await waitForApp(page);
  const steps = await page.evaluate(() =>
    ["2026-10", "2026-09", "2026-08", "2026-07", "2026-06", "2026-05", "2025-01"]
      .map(m => trustOf({ lastVerified: m }, "2026-10").opacity));
  expect(steps).toEqual([1, 1, 0.8, 0.6, 0.6, 0.45, 0.45]);
  // freshness is never opacity alone: the words travel with it
  expect(await page.evaluate(() => trustOf({ lastVerified: "2026-06" }, "2026-10").verified))
    .toBe("Verified Jun 2026 · 4 months ago");
});

test("derived link types follow the documented precedence", async ({ page }) => {
  await page.goto("./");
  await waitForApp(page);
  const types = await page.evaluate(() => {
    const first = cat => DATA.find(d => d.cat === cat).id;
    return [
      linkTypeOf(first("vc"), first("gov")),
      linkTypeOf(first("gov"), first("university")),
      linkTypeOf(first("university"), first("accel")),
      linkTypeOf(first("accel"), first("corporate")),
      linkTypeOf(first("corporate"), first("startup")),
      linkTypeOf(first("startup"), first("community")),
    ];
  });
  expect(types).toEqual(["capital", "public", "research", "program", "partnership", "community"]);
});

test("keyboard only: Tab reaches the results, arrows move, Enter selects, Escape clears", async ({ page }) => {
  await page.goto("./?lens=student&near=amherst&r=50&asof=2026-10");
  await waitForApp(page);
  // Tab from the near picker lands in the results before any map pin
  await page.locator("#netToggle").focus();
  let guard = 0;
  while(guard++ < 8 && !(await page.evaluate(() => !!document.activeElement.closest("#lensPanel")))) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement.closest("#lensPanel"))).toBe(true);
  await page.locator("#lpList .lp-main").first().focus();
  await page.keyboard.press("ArrowDown");
  const id = await page.evaluate(() => document.activeElement.dataset.id);
  expect(id).toBeTruthy();
  await page.keyboard.press("Enter");
  await expect(page.locator(`#lpList .lp-item[data-id="${id}"]`)).toHaveClass(/\bsel\b/);
  await expect(page.locator("#arcInfo")).toHaveClass(/\bon\b/);
  await page.keyboard.press("Escape");
  await expect(page.locator("#arcInfo")).not.toHaveClass(/\bon\b/);
});

test("the popup carries the six-signal strip, and approximate pins look approximate", async ({ page }) => {
  await page.goto("./?asof=2026-10");
  await waitForApp(page);
  const approx = DATA.find(d => d.approx);
  const html = await page.evaluate(id => markers[id].getPopup().getContent(), approx.id);
  expect(html).toContain("sig-strip");
  expect(html).toContain("Neighborhood-level location");
  const iconHtml = await page.evaluate(id => markers[id].options.icon.options.html, approx.id);
  expect(iconHtml).toContain("approx");
});
