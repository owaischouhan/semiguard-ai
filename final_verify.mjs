#!/usr/bin/env node
/**
 * Final production verification script
 */
import { chromium, devices } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = "http://localhost:8000";
const APP = "http://localhost:5173";
const CSV_PATH = path.join(__dirname, "ai4i2020.csv");

const ROUTES = [
  { path: "/", label: "Executive" },
  { path: "/monitoring", label: "Monitoring" },
  { path: "/fault-detection", label: "Fault Detection" },
  { path: "/predictive-maintenance", label: "Predictive Maintenance" },
  { path: "/yield", label: "Yield" },
  { path: "/model-performance", label: "Model Performance" },
  { path: "/root-cause", label: "Root Cause" },
  { path: "/fab-map", label: "Fab Map" },
];

const results = [];
const bugs = [];
const blockers = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`[PASS] ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.log(`[FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function apiJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { res, json };
}

async function verifyServers() {
  try {
    const fe = await fetch(APP);
    if (fe.ok) pass("Frontend running", APP);
    else fail("Frontend running", String(fe.status));
  } catch (e) {
    fail("Frontend running", e.message);
    blockers.push("Frontend not reachable at localhost:5173");
  }

  try {
    const { res } = await apiJson(`${API}/status`);
    if (res.ok) pass("Backend running", API);
    else fail("Backend running", String(res.status));
  } catch (e) {
    fail("Backend running", e.message);
    blockers.push("Backend not reachable at localhost:8000");
  }
}

async function verifyUploadChangesDashboard() {
  const { json: before } = await apiJson(`${API}/dashboard-summary`);
  const beforeHealth = before?.fab_health;
  const beforeMachines = before?.total_machines;

  if (!fs.existsSync(CSV_PATH)) {
    fail("CSV upload", `Missing ${CSV_PATH}`);
    return;
  }

  const form = new FormData();
  const blob = new Blob([fs.readFileSync(CSV_PATH)], { type: "text/csv" });
  form.append("file", blob, "ai4i2020.csv");

  const t0 = Date.now();
  const uploadRes = await fetch(`${API}/upload-data`, { method: "POST", body: form });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  if (!uploadRes.ok) {
    fail("CSV upload", `${uploadRes.status} ${await uploadRes.text()}`);
    blockers.push("CSV upload failed");
    return;
  }

  const uploadBody = await uploadRes.json();
  pass("CSV upload", `${elapsed}s — ${uploadBody.records_inserted} records, ${uploadBody.anomalies_detected} anomalies`);

  const { json: after } = await apiJson(`${API}/dashboard-summary`);
  const changed =
    after?.fab_health !== beforeHealth ||
    after?.total_machines !== beforeMachines ||
    after?.current_yield !== before?.current_yield;

  if (changed) {
    pass(
      "Dashboard values changed after upload",
      `fab_health ${beforeHealth}→${after.fab_health}, machines ${beforeMachines}→${after.total_machines}`,
    );
  } else {
    fail("Dashboard values changed after upload", "No KPI delta detected");
    bugs.push("Dashboard KPIs did not change after CSV upload");
  }
}

async function verifyPdfExport() {
  const res = await fetch(`${API}/export-pdf`);
  const buf = await res.arrayBuffer();
  if (res.ok && buf.byteLength > 5000 && res.headers.get("content-type")?.includes("pdf")) {
    pass("Export PDF", `${buf.byteLength} bytes`);
  } else {
    fail("Export PDF", `status=${res.status} size=${buf.byteLength}`);
    bugs.push("PDF export endpoint failed or returned empty file");
  }
}

async function runBrowserChecks() {
  const browser = await chromium.launch({ headless: true });

  // Desktop: sidebar nav + system panel
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const consoleErrors = [];
  const failedRequests = [];

  desktop.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`[${msg.location().url}] ${msg.text()}`);
  });
  desktop.on("pageerror", (err) => consoleErrors.push(`[pageerror] ${err.message}`));
  desktop.on("requestfailed", (req) => {
    const url = req.url();
    if (url.includes("localhost:8000") || url.includes("localhost:5173")) {
      failedRequests.push(`${url} — ${req.failure()?.errorText || "failed"}`);
    }
  });

  await desktop.goto(APP, { waitUntil: "networkidle", timeout: 60_000 });
  await desktop.waitForTimeout(2000);

  // Sidebar links (desktop aside)
  for (const route of ROUTES) {
    const link = desktop.locator(`aside nav a[href="${route.path}"]`);
    if ((await link.count()) === 0) {
      fail(`Sidebar link ${route.label}`, "not found");
      bugs.push(`Sidebar link missing: ${route.path}`);
      continue;
    }
    await link.click();
    await desktop.waitForURL(`**${route.path === "/" ? "/" : route.path}`, { timeout: 15_000 });
    await desktop.waitForTimeout(1500);
    pass(`Sidebar navigation → ${route.label}`, desktop.url());
  }

  // System Control Panel — Refresh Dashboard
  await desktop.goto(APP, { waitUntil: "networkidle" });
  await desktop.getByRole("button", { name: /open system control panel/i }).first().click();
  await desktop.waitForSelector("text=System Control Panel", { timeout: 10_000 });

  const refreshBtn = desktop.getByRole("button", { name: /refresh dashboard/i });
  await refreshBtn.click();
  await desktop.waitForTimeout(2500);
  const refreshMsg = await desktop.locator("text=Dashboard data refreshed").count();
  if (refreshMsg > 0) pass("Refresh Dashboard", "success message shown");
  else {
    fail("Refresh Dashboard", "no success confirmation");
    bugs.push("Refresh Dashboard did not show success message");
  }

  // Export PDF via UI
  const pdfBtn = desktop.getByRole("button", { name: /export pdf/i });
  const [download] = await Promise.all([
    desktop.waitForEvent("download", { timeout: 30_000 }).catch(() => null),
    pdfBtn.click(),
  ]);
  if (download) {
    const tmp = path.join(__dirname, ".verify-report.pdf");
    await download.saveAs(tmp);
    const size = fs.statSync(tmp).size;
    fs.unlinkSync(tmp);
    if (size > 5000) pass("Export PDF (UI)", `${size} bytes downloaded`);
    else {
      fail("Export PDF (UI)", `too small: ${size}`);
      bugs.push("PDF download from UI was empty or too small");
    }
  } else {
    // Fallback: button may trigger fetch download without playwright event
    await desktop.waitForTimeout(2000);
    const exportMsg = await desktop.locator("text=PDF report downloaded").count();
    if (exportMsg > 0) pass("Export PDF (UI)", "success message shown");
    else {
      fail("Export PDF (UI)", "no download or success message");
      bugs.push("Export PDF button did not trigger download in browser");
    }
  }

  await desktop.close();

  // Mobile viewport
  const mobile = await browser.newPage({
    ...devices["iPhone 13"],
  });
  const mobileErrors = [];
  const mobileFails = [];
  mobile.on("console", (m) => {
    if (m.type() === "error") mobileErrors.push(m.text());
  });
  mobile.on("requestfailed", (r) => {
    if (r.url().includes("localhost")) mobileFails.push(r.url());
  });

  await mobile.goto(APP, { waitUntil: "networkidle", timeout: 60_000 });
  await mobile.waitForTimeout(1500);

  const bottomNav = mobile.locator("nav.fixed.bottom-0 a");
  const navCount = await bottomNav.count();
  if (navCount >= 8) pass("Mobile nav links", `${navCount} links visible`);
  else {
    fail("Mobile nav links", `expected 8, got ${navCount}`);
    bugs.push(`Mobile bottom nav has ${navCount} links, expected 8`);
  }

  // Tap through mobile nav
  for (let i = 0; i < Math.min(navCount, 8); i++) {
    await bottomNav.nth(i).click();
    await mobile.waitForTimeout(1200);
  }
  pass("Mobile navigation taps", "completed without crash");

  // Check layout doesn't overflow badly on mobile
  const hasHorizontalOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 20);
  if (!hasHorizontalOverflow) pass("Mobile responsiveness", "no horizontal overflow");
  else {
    fail("Mobile responsiveness", "horizontal overflow detected");
    bugs.push("Horizontal scroll overflow on mobile viewport");
  }

  await mobile.close();
  await browser.close();

  // Console / network summary (desktop session)
  const filteredConsole = consoleErrors.filter(
    (e) => !e.includes("favicon") && !e.includes("DevTools"),
  );
  if (filteredConsole.length === 0) pass("No console errors", "0 errors across navigation");
  else {
    fail("No console errors", `${filteredConsole.length} errors`);
    bugs.push(...filteredConsole.slice(0, 3).map((e) => `Console: ${e.slice(0, 120)}`));
  }

  if (failedRequests.length === 0) pass("No failed network requests", "0 failures");
  else {
    fail("No failed network requests", `${failedRequests.length} failures`);
    bugs.push(...failedRequests.slice(0, 3));
  }

  if (mobileErrors.length === 0) pass("Mobile console clean", "0 errors");
  else fail("Mobile console clean", `${mobileErrors.length} errors`);
}

async function verifyNoHardcodedKpis() {
  const srcDir = path.join(__dirname, "src", "routes");
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".tsx"));
  const badPatterns = [
    /value=\{94\./,
    /value=\{96\./,
    /value=\{78\./,
    /"4 Active"/,
    /from "@\/lib\/sim"/,
  ];
  let found = false;
  for (const file of files) {
    const content = fs.readFileSync(path.join(srcDir, file), "utf8");
    for (const pat of badPatterns) {
      if (pat.test(content)) {
        fail("No hardcoded KPIs", `${file} matches ${pat}`);
        bugs.push(`Hardcoded value in ${file}`);
        found = true;
      }
    }
  }
  if (!found) pass("No hardcoded KPIs", "route files clean");
}

async function main() {
  console.log("=== Final Production Verification ===\n");

  await verifyServers();
  if (blockers.length) {
    console.log("\nBLOCKED — servers not running. Start backend and frontend first.");
    process.exit(1);
  }

  await verifyNoHardcodedKpis();
  await verifyUploadChangesDashboard();
  await verifyPdfExport();
  await runBrowserChecks();

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  const pct = Math.round((passed / total) * 100);

  console.log("\n=== SUMMARY ===");
  console.log(`Checks: ${passed}/${total} passed (${pct}%)`);
  console.log(`Bugs: ${bugs.length}`);
  console.log(`Blockers: ${blockers.length}`);

  if (bugs.length) {
    console.log("\nRemaining bugs:");
    bugs.forEach((b) => console.log(`  - ${b}`));
  }

  const deploymentPct = Math.min(95, Math.round(pct * 0.85 + (blockers.length ? 0 : 15)));
  const go = blockers.length === 0 && bugs.length <= 2 && pct >= 90;

  console.log(`\nDeployment readiness: ${deploymentPct}%`);
  console.log(`Recommendation: ${go ? "GO" : "NO-GO"} for Vercel deployment`);
  if (!go) {
    console.log("Reason: unresolved bugs or failed verification checks");
  } else {
    console.log("Note: Set VITE_API_URL to production backend URL in Vercel env before deploy.");
  }

  process.exit(go ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
