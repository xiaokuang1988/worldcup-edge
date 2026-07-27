import { execFile, spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const KT_JINGCAI_URL =
  "https://kt.xiaodianhuo.com//50/jingcai/result_RasPf.html?station_id=1161761&station_uuid=776e9nbt0usl8g1626932057&channel_type=sharelink&channel_sub_type=jczq&channel_sub_id=";

const domPath = path.resolve("data/kt-jingcai-dom.html");
const snapshotPath = path.resolve("data/kt-jingcai-current.json");
const outputTargets = [
  path.resolve("outputs/data/live-matches.json"),
  path.resolve("docs/data/live-matches.json")
];

async function findChromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium"
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next common Chrome path.
    }
  }
  throw new Error("Chrome executable was not found. Set CHROME_PATH to the browser binary.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForProcessExit(process, timeoutMs = 2500) {
  if (process.exitCode !== null || process.signalCode) return;
  await Promise.race([
    new Promise((resolve) => process.once("exit", resolve)),
    sleep(timeoutMs)
  ]);
}

async function removeDirWithRetry(targetPath) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      await sleep(350);
    }
  }
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result || {});
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(payload);
    });
  }

  close() {
    this.ws?.close();
  }
}

async function waitForDevTools(port) {
  const url = `http://127.0.0.1:${port}/json`;
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const targets = await response.json();
        const pageTarget = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
        if (pageTarget) return pageTarget;
      }
    } catch {
      // Chrome is still starting.
    }
    await sleep(250);
  }
  throw new Error("Chrome DevTools endpoint did not start");
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result?.value;
}

async function waitForExpression(cdp, expression, timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(cdp, expression)) return true;
    await sleep(300);
  }
  return false;
}

function cleanText(html) {
  return html
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseMatchText(text) {
  const compact = text.replace(/^>\s*/, "");
  const main = compact.match(
    /^(\d{4})\s+(\S+)\s+(\d{1,2}:\d{2})\s+分析\s+(?:\[([^\]]*)\]\s+)?(.+?)\s+VS\s+(.+?)(?:\s+\[([^\]]*)\])?\s+0\s+胜\s+([0-9.]+)\s+平\s+([0-9.]+)\s+负\s+([0-9.]+)\s+单\s+([+-]\d+)\s+胜\s+([0-9.]+)\s+平\s+([0-9.]+)\s+负\s+([0-9.]+)/
  );

  if (!main) return null;

  return {
    matchNo: main[1],
    league: main[2],
    time: main[3],
    homeRank: main[4] || "",
    homeZh: main[5].trim(),
    awayZh: main[6].trim(),
    awayRank: main[7] || "",
    hda: {
      home: toNumber(main[8]),
      draw: toNumber(main[9]),
      away: toNumber(main[10])
    },
    handicap: {
      line: main[11],
      home: toNumber(main[12]),
      draw: toNumber(main[13]),
      away: toNumber(main[14])
    }
  };
}

function extractMatches(html) {
  return html
    .split('<div class="border_b flexbox matchitem"')
    .slice(1)
    .map((part) => cleanText(part.slice(0, 3200)))
    .map(parseMatchText)
    .filter(Boolean);
}

function favoriteFromHda(hda) {
  const [side] = Object.entries(hda)
    .filter(([, odds]) => Number.isFinite(odds))
    .sort((a, b) => a[1] - b[1])[0] || ["draw"];
  return { home: "主胜", draw: "平局", away: "客胜" }[side] || "平局";
}

function scoreCandidates(match) {
  const favorite = favoriteFromHda(match.hda);
  const awayFav = favorite === "客胜";
  const drawFav = favorite === "平局";
  const base = drawFav
    ? ["1-1", "0-0", "2-2", "1-0", "0-1"]
    : awayFav
      ? ["0-1", "1-2", "0-2", "1-1", "0-0"]
      : ["1-0", "2-1", "2-0", "1-1", "0-0"];

  return base.map((score, index) => ({
    score,
    odds: null,
    probability: Math.max(8, 24 - index * 4)
  }));
}

function confidenceFromOdds(match) {
  const odds = [match.hda.home, match.hda.draw, match.hda.away].filter(Number.isFinite);
  if (odds.length < 3) return 55;
  const min = Math.min(...odds);
  const max = Math.max(...odds);
  const spread = max - min;
  const favoritePenalty = min < 1.5 ? -6 : 0;
  return Math.max(58, Math.min(84, Math.round(62 + spread * 4 + favoritePenalty)));
}

function marketAvailable(odds) {
  return odds && Object.keys(odds).length > 0;
}

function impliedProbabilities(hda) {
  const entries = [
    ["主胜", hda.home],
    ["平", hda.draw],
    ["客胜", hda.away]
  ].filter(([, odds]) => Number.isFinite(odds) && odds > 0);
  const inverseTotal = entries.reduce((sum, [, odds]) => sum + 1 / odds, 0);
  return Object.fromEntries(
    entries.map(([label, odds]) => [label, Math.round(((1 / odds) / inverseTotal) * 1000) / 10])
  );
}

function predictionFor(match) {
  const topScores = scoreCandidates(match);
  const confidence = confidenceFromOdds(match);
  const favorite = favoriteFromHda(match.hda);
  const lowSingle = Math.min(match.hda.home, match.hda.draw, match.hda.away) < 1.5;
  const decision = lowSingle ? "WATCH" : confidence >= 78 ? "BET" : confidence >= 68 ? "WATCH" : "PASS";

  return {
    score: topScores[0].score,
    topScores,
    resultLean: favorite,
    totalLabel: favorite === "平局" ? "总进球 0-2 球倾向" : "总进球 1-3 球倾向",
    decision,
    confidence,
    metrics: {
      official: 76,
      attack: Math.round(66 + confidence / 6),
      defense: Math.round(66 + (90 - confidence) / 6),
      volatility: Math.round(45 + Math.abs(match.hda.home - match.hda.away) * 7)
    },
    reasons: [
      "已从你提供的 kt.xiaodianhuo.com 竞彩页面读取当前比赛和赔率。",
      `胜平负赔率显示${favorite}方向相对更强；这是赔率结构事实，不等于赛果保证。`,
      `让球胜平负盘口为 ${match.handicap.line}，需要按 90 分钟赛果结算。`
    ],
    marketOdds: {
      matchNo: match.matchNo,
      source: "kt.xiaodianhuo.com rendered page",
      kickoff: `${match.league} ${match.time}`,
      hda: match.hda,
      handicap: match.handicap,
      impliedProbabilities: impliedProbabilities(match.hda),
      scoreOdds: match.moreMarkets?.scoreOdds || {},
      totalGoals: match.moreMarkets?.totalGoals || {},
      halfFull: match.moreMarkets?.halfFull || {},
      moreMarketsStatus: match.moreMarkets?.status || "not_checked"
    }
  };
}

function toLiveData(matches) {
  return {
    generatedAt: new Date().toISOString(),
    sourcePolicy: "Fact-first snapshot from the user-provided kt.xiaodianhuo.com page. It stores visible match numbers, teams, kickoff times, hda odds, and handicap odds. It is not a direct official API and must not be treated as guaranteed realtime.",
    ktSourceUrl: KT_JINGCAI_URL,
    retrievalMethod: process.argv.includes("--from-file") ? "stored rendered DOM snapshot" : "local Chrome rendered DOM",
    freshnessLimitMinutes: 90,
    unitStakeCny: 2,
    sources: [
      {
        type: "下注参考页",
        name: "kt.xiaodianhuo.com 竞彩足球页面",
        url: KT_JINGCAI_URL,
        note: "当前比赛、胜平负和让球胜平负赔率。页面声明数据仅供参考，购买需到线下实体店。"
      },
      {
        type: "风控规则",
        name: "本地 V1.0 资金规则",
        url: "#risk",
        note: "覆盖胜平负、让球胜平负、总进球、比分、半全场；比分和半全场只允许小仓位。"
      }
    ],
    marketCoverage: {
      hda: true,
      handicap: true,
      scoreOdds: matches.some((match) => marketAvailable(match.moreMarkets?.scoreOdds)),
      totalGoals: matches.some((match) => marketAvailable(match.moreMarkets?.totalGoals)),
      halfFull: matches.some((match) => marketAvailable(match.moreMarkets?.halfFull))
    },
    upcoming: matches.map((match) => ({
      id: `kt-${match.matchNo}`,
      matchNo: match.matchNo,
      homeZh: match.homeZh,
      awayZh: match.awayZh,
      tournament: match.league,
      date: "当前竞彩",
      time: match.time,
      market: "胜平负 / 让球胜平负",
      officialStatus: "kt 当前页快照",
      officialUrl: KT_JINGCAI_URL,
      prediction: predictionFor(match)
    })),
    recentResults: []
  };
}

async function dumpDom() {
  const { stdout } = await execFileAsync(
    chromePath,
    [
      "--headless",
      "--disable-gpu",
      "--dump-dom",
      "--virtual-time-budget=12000",
      KT_JINGCAI_URL
    ],
    { maxBuffer: 20 * 1024 * 1024 }
  );
  await mkdir(path.dirname(domPath), { recursive: true });
  await writeFile(domPath, stdout);
  return stdout;
}

async function renderPageWithMoreMarkets() {
  const port = 29000 + Math.floor(Math.random() * 1000);
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "kt-jingcai-chrome-"));
  const chromePath = await findChromePath();
  const chrome = spawn(
    chromePath,
    [
      "--headless",
      "--disable-gpu",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      "--window-size=390,844",
      KT_JINGCAI_URL
    ],
    { stdio: "ignore" }
  );

  let cdp;
  try {
    const version = await waitForDevTools(port);
    cdp = new CdpClient(version.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await waitForExpression(cdp, "document.querySelectorAll('.matchitem').length > 0", 15000);
    await sleep(1200);

    const html = await evaluate(cdp, "document.documentElement.outerHTML");
    await mkdir(path.dirname(domPath), { recursive: true });
    await writeFile(domPath, html);

    const matchCount = await evaluate(cdp, "document.querySelectorAll('.matchitem').length");
    const moreMarkets = {};
    const moreMarketsByIndex = [];

    for (let index = 0; index < matchCount; index += 1) {
      const opened = await evaluate(
        cdp,
        `(() => {
          const buttons = document.querySelectorAll('.morebtn');
          if (!buttons[${index}]) return false;
          buttons[${index}].click();
          return true;
        })()`
      );
      if (!opened) continue;

      await waitForExpression(
        cdp,
        "Boolean([...document.querySelectorAll('.layerbox')].find((layer) => getComputedStyle(layer).display !== 'none' && layer.querySelector('.morediv')))",
        8000
      );
      await sleep(700);

      const details = await evaluate(
        cdp,
        `(() => {
          const visibleLayer = [...document.querySelectorAll('.layerbox')]
            .find((layer) => getComputedStyle(layer).display !== 'none' && layer.querySelector('.morediv'));
          const box = visibleLayer?.querySelector('.morediv');
          const parseOdds = (selector) => {
            const root = box?.querySelector(selector);
            if (!root) return {};
            if (/未受注/.test(root.innerText || '')) return {};
            const odds = {};
            root.querySelectorAll('.betbtn').forEach((button) => {
              const parts = [...button.querySelectorAll('span')]
                .map((node) => node.innerText.trim())
                .filter(Boolean);
              const value = Number(parts[1]);
              if (parts[0] && Number.isFinite(value)) odds[parts[0]] = value;
            });
            return odds;
          };
          const matchNoText = box?.querySelector('header p')?.innerText || '';
          const matchNo = matchNoText.match(/(\\d{3})$/)?.[1];
          return {
            matchNo: matchNo ? '1' + matchNo : '',
            title: box?.querySelector('h1')?.innerText || '',
            scoreOdds: parseOdds('.m_bif'),
            totalGoals: parseOdds('.m_zongjq'),
            halfFull: parseOdds('.m_half')
          };
        })()`
      );

      if (details?.matchNo) {
        moreMarkets[details.matchNo] = {
          status: "available",
          title: details.title,
          scoreOdds: details.scoreOdds || {},
          totalGoals: details.totalGoals || {},
          halfFull: details.halfFull || {}
        };
      }
      moreMarketsByIndex[index] = {
        status: "available",
        title: details?.title || "",
        scoreOdds: details?.scoreOdds || {},
        totalGoals: details?.totalGoals || {},
        halfFull: details?.halfFull || {}
      };

      await evaluate(
        cdp,
        `(() => {
          const visibleLayer = [...document.querySelectorAll('.layerbox')]
            .find((layer) => getComputedStyle(layer).display !== 'none' && layer.querySelector('.morediv'));
          const close = visibleLayer?.querySelector('.closeball2');
          if (close) close.click();
          return true;
        })()`
      );
      await sleep(350);
    }

    return { html, moreMarkets, moreMarketsByIndex };
  } finally {
    cdp?.close();
    if (!chrome.killed) chrome.kill("SIGTERM");
    await waitForProcessExit(chrome);
    await removeDirWithRetry(profileDir);
  }
}

const fromFile = process.argv.includes("--from-file");
const rendered = fromFile
  ? { html: await readFile(domPath, "utf8"), moreMarkets: {}, moreMarketsByIndex: [] }
  : await renderPageWithMoreMarkets();
const html = rendered.html;
const matches = extractMatches(html);

for (const [index, match] of matches.entries()) {
  match.moreMarkets = rendered.moreMarkets[match.matchNo] || rendered.moreMarketsByIndex[index] || {
    status: fromFile ? "not_checked_from_file" : "unavailable",
    scoreOdds: {},
    totalGoals: {},
    halfFull: {}
  };
}

if (!matches.length) {
  throw new Error("No kt jingcai matches parsed from rendered page");
}

const liveData = toLiveData(matches);
await writeFile(snapshotPath, `${JSON.stringify({ scrapedAt: liveData.generatedAt, sourceUrl: KT_JINGCAI_URL, matches }, null, 2)}\n`);

for (const target of outputTargets) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(liveData, null, 2)}\n`);
}

console.log(`Parsed ${matches.length} kt jingcai matches`);
for (const match of matches) {
  console.log(`${match.matchNo} ${match.league} ${match.time} ${match.homeZh} vs ${match.awayZh}`);
}
