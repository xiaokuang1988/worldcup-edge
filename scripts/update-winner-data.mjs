import { mkdir, writeFile } from "node:fs/promises";

const ROOTS = ["outputs", "docs"];
const WINNER_TOP_URL =
  "https://store.toto-dream.com/dcs/subos/screen/pi31/spin049/PGSPIN04901InitWinnerTop.form";
const WINNER_RESULTS_URL =
  "https://sp.toto-dream.com/dcs/subos/screen/si40/ssin058/PGSSIN05801LnkCheckKujiResultSoccer.form?beforeTeamId=322";

const teamProfiles = {
  "ｱﾒﾘｶ": { zh: "美国", attack: 72, defense: 68, tempo: 70, volatility: 44 },
  "ﾊﾟﾗｸﾞｱ": { zh: "巴拉圭", attack: 64, defense: 70, tempo: 58, volatility: 47 },
  "ﾌﾞﾗｼﾞﾙ": { zh: "巴西", attack: 86, defense: 77, tempo: 82, volatility: 45 },
  "ﾓﾛｯｺ": { zh: "摩洛哥", attack: 72, defense: 76, tempo: 71, volatility: 43 },
  "ｶﾀｰﾙ": { zh: "卡塔尔", attack: 62, defense: 59, tempo: 61, volatility: 56 },
  "ｽｲｽ": { zh: "瑞士", attack: 72, defense: 77, tempo: 65, volatility: 40 },
  "ﾊｲﾁ": { zh: "海地", attack: 58, defense: 55, tempo: 67, volatility: 63 },
  "ｽｺｯﾄﾗﾝ": { zh: "苏格兰", attack: 68, defense: 72, tempo: 66, volatility: 48 },
  "ｵｰｽﾄﾗﾘ": { zh: "澳大利亚", attack: 68, defense: 70, tempo: 65, volatility: 46 },
  "ﾄﾙｺ": { zh: "土耳其", attack: 76, defense: 68, tempo: 77, volatility: 55 },
  "ｵﾗﾝﾀﾞ": { zh: "荷兰", attack: 82, defense: 78, tempo: 76, volatility: 42 },
  "日本": { zh: "日本", attack: 76, defense: 73, tempo: 82, volatility: 43 },
  "ｺｰﾄｼﾞﾎ": { zh: "科特迪瓦", attack: 74, defense: 69, tempo: 75, volatility: 53 },
  "ｴｸｱﾄﾞﾙ": { zh: "厄瓜多尔", attack: 70, defense: 73, tempo: 72, volatility: 45 },
  "ﾄﾞｲﾂ": { zh: "德国", attack: 82, defense: 74, tempo: 75, volatility: 46 },
  "ｷｭﾗｿｰ": { zh: "库拉索", attack: 57, defense: 54, tempo: 60, volatility: 66 },
  "ｽｳｪﾃﾞﾝ": { zh: "瑞典", attack: 70, defense: 74, tempo: 64, volatility: 42 },
  "ﾁｭﾆｼﾞｱ": { zh: "突尼斯", attack: 62, defense: 69, tempo: 58, volatility: 48 },
  "ｽﾍﾟｲﾝ": { zh: "西班牙", attack: 84, defense: 79, tempo: 74, volatility: 39 },
  "ｶｰﾎﾞﾍﾞ": { zh: "佛得角", attack: 63, defense: 66, tempo: 63, volatility: 52 },
  "ﾍﾞﾙｷﾞｰ": { zh: "比利时", attack: 81, defense: 74, tempo: 73, volatility: 47 },
  "ｴｼﾞﾌﾟﾄ": { zh: "埃及", attack: 72, defense: 69, tempo: 66, volatility: 50 },
  "ｻｳｼﾞ": { zh: "沙特", attack: 64, defense: 62, tempo: 67, volatility: 58 },
  "ｳﾙｸﾞｱｲ": { zh: "乌拉圭", attack: 80, defense: 78, tempo: 72, volatility: 41 },
  "ｲﾗﾝ": { zh: "伊朗", attack: 70, defense: 72, tempo: 65, volatility: 46 },
  "ﾆｭｰｼﾞｰ": { zh: "新西兰", attack: 59, defense: 61, tempo: 63, volatility: 55 },
  "ﾌﾗﾝｽ": { zh: "法国", attack: 87, defense: 80, tempo: 79, volatility: 39 },
  "ｾﾈｶﾞﾙ": { zh: "塞内加尔", attack: 74, defense: 74, tempo: 73, volatility: 46 },
  "ｲﾗｸ": { zh: "伊拉克", attack: 61, defense: 63, tempo: 64, volatility: 57 },
  "ﾉﾙｳｪｰ": { zh: "挪威", attack: 80, defense: 70, tempo: 71, volatility: 49 },
  "ｱﾙｾﾞﾝﾁ": { zh: "阿根廷", attack: 86, defense: 80, tempo: 76, volatility: 38 },
  "ｱﾙｼﾞｪﾘ": { zh: "阿尔及利亚", attack: 72, defense: 71, tempo: 70, volatility: 47 },
  "ｵｰｽﾄﾘｱ": { zh: "奥地利", attack: 74, defense: 73, tempo: 73, volatility: 44 },
  "ﾖﾙﾀﾞﾝ": { zh: "约旦", attack: 60, defense: 61, tempo: 64, volatility: 58 },
  "ｲﾝｸﾞﾗﾝ": { zh: "英格兰", attack: 84, defense: 79, tempo: 74, volatility: 42 },
  "ｸﾛｱﾁｱ": { zh: "克罗地亚", attack: 75, defense: 76, tempo: 67, volatility: 43 },
  "ﾎﾟﾙﾄｶﾞ": { zh: "葡萄牙", attack: 85, defense: 77, tempo: 77, volatility: 42 },
  "ｺﾝｺﾞ": { zh: "刚果", attack: 61, defense: 60, tempo: 68, volatility: 61 },
  "ｶﾅﾀﾞ": { zh: "加拿大", attack: 70, defense: 66, tempo: 76, volatility: 50 },
  "ﾎﾞｽﾆｱ": { zh: "波黑", attack: 66, defense: 64, tempo: 61, volatility: 53 },
  "ﾒｷｼｺ": { zh: "墨西哥", attack: 75, defense: 73, tempo: 74, volatility: 42 },
  "南ｱﾌﾘｶ": { zh: "南非", attack: 62, defense: 61, tempo: 69, volatility: 56 },
  "韓国": { zh: "韩国", attack: 74, defense: 69, tempo: 79, volatility: 49 },
  "ﾁｪｺ": { zh: "捷克", attack: 70, defense: 71, tempo: 63, volatility: 45 }
};

const sources = [
  {
    type: "WINNER 官方",
    name: "スポーツくじ WINNER",
    url: "https://www.toto-dream.com/winner/",
    note: "官方销售入口、比赛列表和规则。"
  },
  {
    type: "官方购买",
    name: "WINNER 購入ページ",
    url: WINNER_TOP_URL,
    note: "当前可购买或可预测的 WINNER 比赛列表。"
  },
  {
    type: "官方结果",
    name: "WINNER くじ結果一覧",
    url: WINNER_RESULTS_URL,
    note: "近期比分结果、开奖状态和当选金。"
  },
  {
    type: "赛事官方",
    name: "FIFA World Cup 2026",
    url: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026",
    note: "赛程、官方新闻和赛事基础信息。"
  },
  {
    type: "日本代表",
    name: "JFA 日本サッカー協会",
    url: "https://www.jfa.jp/",
    note: "日本队名单、新闻、比赛信息。"
  },
  {
    type: "本地资讯",
    name: "Yahoo!ニュース スポーツ",
    url: "https://news.yahoo.co.jp/categories/sports",
    note: "日本体育新闻聚合，用于赛前伤停和舆情核对。"
  }
];

function stripHtml(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "\n")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/&#45;/g, "-")
    .replace(/&#126;/g, "~")
    .replace(/\r/g, "\n");
}

function linesFromHtml(html) {
  return stripHtml(html)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function profileFor(name) {
  return teamProfiles[name] || { zh: name, attack: 65, defense: 65, tempo: 65, volatility: 55 };
}

function parseUpcoming(lines) {
  const matches = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i] !== "サッカーW杯") continue;

    const end = lines.indexOf("試合結果を予想する", i + 1);
    if (end === -1) continue;
    const block = lines.slice(i, end + 1);
    const homeMarker = block.indexOf("（ホーム）");
    const awayMarker = block.indexOf("（アウェイ）");
    const startMarker = block.indexOf("試合開始予定");
    if (homeMarker < 1 || awayMarker < 1 || startMarker === -1) continue;

    const home = block[homeMarker - 1];
    const away = block[awayMarker - 1];
    const date = block[startMarker + 1] || "";
    const time = block[startMarker + 2] || "";
    if (!home || !away || !date || !time) continue;

    matches.push({
      id: `${home}-${away}-${date}-${time}`
        .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
        .replace(/^-|-$/g, ""),
      tournament: "サッカーW杯",
      home,
      away,
      homeZh: profileFor(home).zh,
      awayZh: profileFor(away).zh,
      date,
      time,
      market: "WINNER サッカー 1試合予想",
      officialStatus: "試合結果を予想する",
      officialUrl: WINNER_TOP_URL
    });
  }
  return matches.slice(0, 10);
}

function parseRecentResults(lines) {
  const results = [];
  for (let i = 0; i < lines.length - 8; i += 1) {
    if (lines[i + 1] !== "vs") continue;
    const home = lines[i];
    const away = lines[i + 2];
    const scoreHome = Number(lines[i + 3]);
    const dash = lines[i + 4];
    const scoreAway = Number(lines[i + 5]);
    if (!Number.isInteger(scoreHome) || dash !== "-" || !Number.isInteger(scoreAway)) continue;
    results.push({
      home,
      away,
      homeZh: profileFor(home).zh,
      awayZh: profileFor(away).zh,
      score: `${scoreHome}-${scoreAway}`,
      officialUrl: WINNER_RESULTS_URL
    });
  }
  return results.slice(0, 12);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function factorial(value) {
  if (value <= 1) return 1;
  let total = 1;
  for (let i = 2; i <= value; i += 1) total *= i;
  return total;
}

function poisson(k, lambda) {
  return (Math.exp(-lambda) * lambda ** k) / factorial(k);
}

function topScoreCandidates(homeGoals, awayGoals) {
  const candidates = [];
  for (let home = 0; home <= 5; home += 1) {
    for (let away = 0; away <= 5; away += 1) {
      candidates.push({
        score: `${home}-${away}`,
        probability: poisson(home, homeGoals) * poisson(away, awayGoals)
      });
    }
  }
  const total = candidates.reduce((sum, item) => sum + item.probability, 0);
  return candidates
    .map((item) => ({
      ...item,
      probability: Math.round((item.probability / total) * 1000) / 10
    }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 3);
}

function scorePrediction(match) {
  const home = profileFor(match.home);
  const away = profileFor(match.away);
  const homeEdge = home.attack - away.defense + 5;
  const awayEdge = away.attack - home.defense;
  const tempo = (home.tempo + away.tempo) / 2;
  const volatility = (home.volatility + away.volatility) / 2;

  const homeGoals = clamp(Math.round((1.15 + homeEdge / 22 + (tempo - 65) / 55) * 10) / 10, 0.2, 3.6);
  const awayGoals = clamp(Math.round((0.95 + awayEdge / 24 + (tempo - 65) / 65) * 10) / 10, 0.1, 3.2);
  const roundedHome = clamp(Math.round(homeGoals), 0, 4);
  const roundedAway = clamp(Math.round(awayGoals), 0, 4);
  const confidence = clamp(
    Math.round(58 + Math.abs(homeGoals - awayGoals) * 10 + (100 - volatility) / 8),
    52,
    86
  );

  const total = homeGoals + awayGoals;
  const totalLabel = total >= 2.9 ? "偏大球" : total <= 2.1 ? "偏小球" : "2-3 球区间";
  const winnerLean = roundedHome > roundedAway ? `${match.homeZh}胜` : roundedHome < roundedAway ? `${match.awayZh}胜` : "平局保护";
  const topScores = topScoreCandidates(homeGoals, awayGoals);
  const score = topScores[0]?.score || `${roundedHome}-${roundedAway}`;
  const decision =
    confidence >= 74
      ? "可重点核对"
      : confidence >= 64
        ? "只做备选"
        : "建议跳过";

  return {
    expectedGoals: { home: homeGoals, away: awayGoals },
    score,
    topScores,
    confidence,
    winnerLean,
    totalLabel,
    decision,
    metrics: {
      official: 100,
      attack: Math.round((home.attack + away.attack) / 2),
      defense: Math.round((home.defense + away.defense) / 2),
      volatility: Math.round(volatility)
    },
    reasons: [
      `WINNER 官方当前列出 ${match.homeZh} vs ${match.awayZh} 的 1 比赛预测销售项。`,
      `模型按双方进攻/防守档位估算 xG：${match.homeZh} ${homeGoals}，${match.awayZh} ${awayGoals}。`,
      `节奏均值 ${Math.round(tempo)}，波动风险 ${Math.round(volatility)}，因此推荐比分不是结果承诺，只用于核对官方选项。`
    ]
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "WorldCupEdge/1.0 (+https://github.com/xiaokuang1988/worldcup-edge)"
    }
  });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.text();
}

async function main() {
  const [topHtml, resultsHtml] = await Promise.all([fetchText(WINNER_TOP_URL), fetchText(WINNER_RESULTS_URL)]);
  const upcoming = parseUpcoming(linesFromHtml(topHtml)).map((match) => ({
    ...match,
    prediction: scorePrediction(match),
    sourceUrls: [WINNER_TOP_URL, "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026"]
  }));
  const recentResults = parseRecentResults(linesFromHtml(resultsHtml));

  const payload = {
    generatedAt: new Date().toISOString(),
    sourcePolicy: "Official WINNER schedule/results plus reputable official/news sources. No unlicensed offshore betting links.",
    sources,
    upcoming,
    recentResults
  };

  for (const root of ROOTS) {
    await mkdir(`${root}/data`, { recursive: true });
    await writeFile(`${root}/data/live-matches.json`, `${JSON.stringify(payload, null, 2)}\n`);
  }
  console.log(`Wrote ${upcoming.length} upcoming matches and ${recentResults.length} recent results.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
