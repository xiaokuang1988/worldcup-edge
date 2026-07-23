import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const manualPath = path.resolve("data/manual-odds.json");
const outputTargets = [
  path.resolve("outputs/data/live-matches.json"),
  path.resolve("docs/data/live-matches.json")
];

function impliedTopScores(scoreOdds) {
  return Object.entries(scoreOdds)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 5)
    .map(([score, odds]) => ({
      score,
      odds,
      probability: Math.round((100 / odds) * 10) / 10
    }));
}

function hdaLean(hda) {
  const [side] = Object.entries(hda).sort((a, b) => a[1] - b[1])[0];
  return { home: "主胜", draw: "平局", away: "客胜" }[side];
}

function lowestTotal(totalGoals) {
  const [goals, odds] = Object.entries(totalGoals).sort((a, b) => a[1] - b[1])[0];
  return `总进球 ${goals} 球倾向 @${odds}`;
}

function confidenceFromMarket(match) {
  const odds = Object.values(match.hda);
  const spread = Math.max(...odds) - Math.min(...odds);
  const scoreDepth = Object.keys(match.scoreOdds || {}).length;
  return Math.max(58, Math.min(82, Math.round(60 + spread * 2 + scoreDepth / 4)));
}

function predictionFor(match) {
  const topScores = impliedTopScores(match.scoreOdds);
  const confidence = confidenceFromMarket(match);
  const favoriteOdds = Math.min(...Object.values(match.hda));
  const decision = confidence >= 76 && favoriteOdds >= 1.5 ? "BET" : confidence >= 68 ? "WATCH" : "PASS";

  return {
    score: topScores[0]?.score || "1-1",
    topScores,
    resultLean: hdaLean(match.hda),
    totalLabel: lowestTotal(match.totalGoals),
    decision,
    confidence,
    metrics: {
      official: 70,
      attack: Math.round(68 + confidence / 6),
      defense: Math.round(64 + (100 - favoriteOdds * 10) / 8),
      volatility: Math.round(35 + favoriteOdds * 8)
    },
    reasons: [
      "按中国体育彩票竞彩足球玩法建模：胜平负、让球胜平负、比分、总进球。",
      `赔率结构显示${hdaLean(match.hda)}方向最强，最低比分候选为 ${topScores[0]?.score || "待定"}。`,
      "默认只计算 90 分钟含伤停补时；加时和点球不进入结算。"
    ],
    marketOdds: {
      matchNo: match.matchNo,
      source: "user-provided China Sports Lottery odds snapshot",
      kickoff: match.kickoff,
      hda: match.hda,
      handicap: match.handicap,
      scoreOdds: match.scoreOdds,
      totalGoals: match.totalGoals,
      halfFull: match.halfFull
    }
  };
}

function toLiveMatch(match) {
  const [date, time] = match.kickoff.split(" ");
  return {
    id: `ticai-${match.matchNo}`,
    homeZh: match.homeZh,
    awayZh: match.awayZh,
    tournament: "中国体育彩票 竞彩足球",
    date,
    time,
    market: "胜平负 / 让球胜平负 / 比分 / 总进球",
    officialStatus: "赔率快照",
    officialUrl: "#legal",
    prediction: predictionFor(match)
  };
}

const manual = JSON.parse(await readFile(manualPath, "utf8"));
const liveData = {
  generatedAt: new Date().toISOString(),
  sourcePolicy: "China Sports Lottery football analysis snapshot. Manual odds snapshots are preserved for review.",
  manualOddsSnapshotAt: manual.snapshotAt,
  manualOddsSource: manual.source,
  unitStakeCny: 2,
  sources: [
    {
      type: "体彩官方",
      name: "中国体彩官方信息",
      url: "#legal",
      note: "官方网页可能返回 567 或打不开，使用时以票面、公告和实体销售点信息为准。"
    },
    {
      type: "竞彩规则",
      name: "中国体育彩票竞彩足球游戏",
      url: "#legal",
      note: "竞彩足球玩法、投注、开奖和兑奖规则说明。"
    },
    {
      type: "赔率快照",
      name: "用户提供的当前赔率截图",
      url: "#",
      note: "用于本地模型计算；所有赔率变化后应继续保留快照。"
    }
  ],
  upcoming: manual.matches.map(toLiveMatch),
  recentResults: []
};

for (const target of outputTargets) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(liveData, null, 2)}\n`);
}
