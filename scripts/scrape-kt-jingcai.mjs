import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const KT_JINGCAI_URL =
  "https://kt.xiaodianhuo.com//50/jingcai/result_RasPf.html?station_id=1161761&station_uuid=776e9nbt0usl8g1626932057&channel_type=sharelink&channel_sub_type=jczq&channel_sub_id=";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const domPath = path.resolve("data/kt-jingcai-dom.html");
const snapshotPath = path.resolve("data/kt-jingcai-current.json");
const outputTargets = [
  path.resolve("outputs/data/live-matches.json"),
  path.resolve("docs/data/live-matches.json")
];

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
      `胜平负赔率显示${favorite}方向相对更强。`,
      `让球胜平负盘口为 ${match.handicap.line}，需要按 90 分钟赛果结算。`
    ],
    marketOdds: {
      matchNo: match.matchNo,
      source: "kt.xiaodianhuo.com rendered page",
      kickoff: `${match.league} ${match.time}`,
      hda: match.hda,
      handicap: match.handicap,
      scoreOdds: {},
      totalGoals: {},
      halfFull: {}
    }
  };
}

function toLiveData(matches) {
  return {
    generatedAt: new Date().toISOString(),
    sourcePolicy: "Current football betting reference from user-provided kt.xiaodianhuo.com page. For analysis only; buy only through legal offline channels.",
    ktSourceUrl: KT_JINGCAI_URL,
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
        note: "单场不超过本金 5%，比分玩法只允许 C 仓，半全场默认禁用。"
      }
    ],
    upcoming: matches.map((match) => ({
      id: `kt-${match.matchNo}`,
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

const html = process.argv.includes("--from-file")
  ? await readFile(domPath, "utf8")
  : await dumpDom();
const matches = extractMatches(html);

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
