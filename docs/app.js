const fallbackData = {
  generatedAt: "2026-06-13T00:00:00+09:00",
  sourcePolicy: "Official WINNER schedule/results plus reputable official/news sources. No unlicensed offshore betting links.",
  sources: [],
  upcoming: [],
  recentResults: []
};

const state = {
  data: fallbackData,
  selectedId: null,
  riskMode: "balanced",
  minConfidence: 62,
  wobble: 0
};

const matchList = document.querySelector("#matchList");
const riskMode = document.querySelector("#riskMode");
const confidenceRange = document.querySelector("#confidenceRange");
const confidenceValue = document.querySelector("#confidenceValue");
const selectedTitle = document.querySelector("#selectedTitle");
const selectedBadge = document.querySelector("#selectedBadge");
const scoreRing = document.querySelector("#scoreRing");
const scoreValue = document.querySelector("#scoreValue");
const metrics = document.querySelector("#metrics");
const recommendationText = document.querySelector("#recommendationText");
const topPick = document.querySelector("#top-pick");
const sourceList = document.querySelector("#sourceList");
const copySources = document.querySelector("#copySources");
const refreshAdvice = document.querySelector("#refreshAdvice");
const officialLink = document.querySelector("#officialLink");
const dataStatus = document.querySelector("#dataStatus");
const recentResults = document.querySelector("#recentResults");
const betImport = document.querySelector("#betImport");
const saveBets = document.querySelector("#saveBets");
const clearBets = document.querySelector("#clearBets");
const betSummary = document.querySelector("#betSummary");
const bankrollInput = document.querySelector("#bankrollInput");

function yen(value) {
  return `${Math.round(value || 0).toLocaleString()}円`;
}

function safeDate(isoString) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Tokyo"
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

async function loadData() {
  try {
    const response = await fetch(`./data/live-matches.json?ts=${Date.now()}`);
    if (!response.ok) throw new Error(`data returned ${response.status}`);
    state.data = await response.json();
    dataStatus.textContent = `官方数据：${safeDate(state.data.generatedAt)} 更新`;
  } catch (error) {
    dataStatus.textContent = "官方数据读取失败，请重新部署或刷新数据";
    console.error(error);
  }

  state.selectedId = state.data.upcoming[0]?.id || null;
  renderSources();
  renderRecentResults();
  render();
}

function adjustedConfidence(match) {
  const riskAdjustment = {
    low: -5,
    balanced: 0,
    high: 4
  }[state.riskMode];
  const volatilityPenalty = state.riskMode === "low" ? Math.round(match.prediction.metrics.volatility / 14) : 0;
  return Math.max(45, Math.min(90, match.prediction.confidence + riskAdjustment - volatilityPenalty + state.wobble));
}

function getBankroll() {
  const stored = Number(localStorage.getItem("bankroll") || 100000);
  return Number.isFinite(stored) && stored > 0 ? stored : 100000;
}

function outcomeFromScore(score) {
  const [home, away] = String(score).split("-").map(Number);
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

function hdaFavorite(odds) {
  if (!odds) return null;
  const entries = [
    ["home", odds.home],
    ["draw", odds.draw],
    ["away", odds.away]
  ].sort((a, b) => a[1] - b[1]);
  return entries[0][0];
}

function scoreV1(match) {
  const prediction = match.prediction;
  const market = prediction.marketOdds;
  const attackDefense = ((prediction.metrics.attack || 65) + (prediction.metrics.defense || 65)) / 2;
  const strengthForm = Math.max(0, Math.min(25, Math.round((attackDefense - 55) * 0.8)));
  const squadSchedule = market ? 11 : 7;
  const oddsStructure = market ? 18 : 6;
  const oddsMovement = market ? 14 : 3;
  const favorite = hdaFavorite(market?.hda);
  const scoreOutcome = outcomeFromScore(prediction.score);
  const marketAligned = market ? favorite === scoreOutcome : false;
  const marketAnomaly = market ? (marketAligned ? 13 : 9) : 5;
  const rawScore = strengthForm + squadSchedule + oddsStructure + oddsMovement + marketAnomaly;
  const completeness = market ? 75 : 45;
  const score = completeness < 50 ? Math.min(rawScore, 69) : rawScore;
  const decision = completeness < 50 ? "PASS" : score >= 80 ? "BET" : score >= 70 ? "WATCH" : "PASS";
  const bankroll = getBankroll();
  const singleCap = bankroll * 0.05;
  const position = decision === "BET" && score >= 84 ? "A" : decision === "BET" ? "B" : decision === "WATCH" ? "C" : "PASS";
  const positionRate = position === "A" ? 0.6 : position === "B" ? 0.25 : position === "C" ? 0.1 : 0;
  const maxStake = singleCap * positionRate;
  const primaryMarket =
    market && market.hda.home < 1.5 && favorite === "home"
      ? "胜平负赔率低于 1.50，不做主仓"
      : market
        ? "胜平负 / 总进球"
        : "数据不足";

  return {
    strengthForm,
    squadSchedule,
    oddsStructure,
    oddsMovement,
    marketAnomaly,
    completeness,
    score,
    decision,
    position,
    maxStake,
    primaryMarket,
    warnings: [
      completeness < 50 ? "数据完整度低于 50%，强制 PASS。" : "",
      market ? "" : "缺少当前赔率快照，最高只能观察。",
      "比分玩法只允许 C 仓；半全场默认禁用。",
      "单场总投入不得超过本金 5%。"
    ].filter(Boolean)
  };
}

function recommendationFor(match, confidence) {
  const prediction = match.prediction;
  const v1 = scoreV1(match);
  const topScores = prediction.topScores
    ?.map((item) => `${item.score}${item.odds ? ` @${item.odds}` : ` (${item.probability}%)`}`)
    .join(" / ");
  const base = `比分候选：${topScores || prediction.score}；方向：${prediction.winnerLean}，${prediction.totalLabel}。`;
  const official = `先打开 WINNER 官方，确认该场是否仍在销售、截止时间、可选比分和払戻倍率。`;
  const marketNote = prediction.marketOdds ? "已用你提供的当前赔率快照校准。" : "";
  const stakeNote = v1.maxStake ? `V1.0 输出 ${v1.decision}，${v1.position} 仓，单场建议上限 ${yen(v1.maxStake)}。` : `V1.0 输出 ${v1.decision}，不建议下注。`;

  if (confidence >= 74) {
    return `${prediction.decision}。${base} ${marketNote} ${stakeNote} 信心较高，但仍只适合作为赛前判断，不承诺命中。${official}`;
  }
  if (confidence >= 62) {
    return `${prediction.decision}。${base} ${marketNote} ${stakeNote} 属于可参考区间，建议等首发和伤停确认后再核对官方选项。${official}`;
  }
  return `${prediction.decision}。${base} ${marketNote} ${stakeNote} 模型波动较大，不建议为了追单继续加仓。${official}`;
}

function renderMatches() {
  matchList.innerHTML = "";
  const matches = state.data.upcoming || [];
  if (!matches.length) {
    matchList.innerHTML = `<div class="empty-state">没有读取到 WINNER 官方比赛数据。</div>`;
    return;
  }

  const visible = matches.filter((match) => adjustedConfidence(match) >= state.minConfidence);
  const list = visible.length ? visible : matches;
  list.forEach((match) => {
    const confidence = adjustedConfidence(match);
    const v1 = scoreV1(match);
    const button = document.createElement("button");
    button.className = `match-card${match.id === state.selectedId ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <div>
        <p class="teams">${match.homeZh} vs ${match.awayZh}</p>
        <div class="match-meta">
          <span>${match.tournament}</span>
          <span>${match.date} ${match.time}</span>
          <span>${match.market}</span>
        </div>
        <div class="factors">
          <span>官方状态：${match.officialStatus}</span>
          <span>首选比分：${match.prediction.score}</span>
          <span>${v1.decision}</span>
          <span>${v1.position}仓 ${yen(v1.maxStake)}</span>
          ${match.prediction.marketOdds ? `<span>赔率${match.prediction.marketOdds.matchNo}</span>` : ""}
          <span>${match.prediction.totalLabel}</span>
        </div>
      </div>
      <div class="confidence-pill">${confidence}%</div>
    `;
    button.addEventListener("click", () => {
      state.selectedId = match.id;
      render();
    });
    matchList.appendChild(button);
  });
}

function renderInsight() {
  const matches = state.data.upcoming || [];
  const match = matches.find((item) => item.id === state.selectedId) || matches[0];
  if (!match) {
    selectedTitle.textContent = "等待官方数据";
    selectedBadge.textContent = "WINNER";
    scoreValue.textContent = "--";
    recommendationText.textContent = "请先运行数据更新脚本，或等待 GitHub Pages 数据刷新。";
    topPick.textContent = "暂无";
    metrics.innerHTML = "";
    return;
  }

  const confidence = adjustedConfidence(match);
  const angle = Math.round((confidence / 100) * 360);
  const prediction = match.prediction;
  const v1 = scoreV1(match);
  const topScoreMarkup = (prediction.topScores || [])
    .map((item) => `<span>${item.score}<small>${item.odds ? `@${item.odds} / ${item.probability}%` : `${item.probability}%`}</small></span>`)
    .join("");
  const marketOddsMarkup = prediction.marketOdds
    ? `
      <div class="market-odds">
        <span class="label">赔率快照</span>
        <div class="odds-row">
          <span>胜 ${prediction.marketOdds.hda.home}</span>
          <span>平 ${prediction.marketOdds.hda.draw}</span>
          <span>负 ${prediction.marketOdds.hda.away}</span>
        </div>
        <div class="odds-row muted">
          <span>让球 ${prediction.marketOdds.handicap.line}</span>
          <span>${prediction.marketOdds.kickoff}</span>
          <span>${prediction.marketOdds.matchNo}</span>
        </div>
      </div>
    `
    : "";

  selectedTitle.textContent = `${match.homeZh} vs ${match.awayZh}`;
  selectedBadge.textContent = `${match.date} ${match.time}`;
  scoreValue.textContent = prediction.score;
  scoreRing.style.background = `conic-gradient(var(--green) 0deg, var(--green) ${angle}deg, rgba(255, 255, 255, 0.1) ${angle}deg)`;
  recommendationText.innerHTML = `
    <div class="score-candidates">${topScoreMarkup}</div>
    <div class="v1-panel">
      <span class="label">V1.0 决策</span>
      <div class="v1-grid">
        <span>${v1.decision}<small>decision</small></span>
        <span>${v1.score}<small>score</small></span>
        <span>${v1.position}<small>position</small></span>
        <span>${yen(v1.maxStake)}<small>max stake</small></span>
      </div>
    </div>
    ${marketOddsMarkup}
    <strong>${recommendationFor(match, confidence)}</strong>
    <ul>
      ${prediction.reasons.map((reason) => `<li>${reason}</li>`).join("")}
      ${v1.warnings.map((warning) => `<li>${warning}</li>`).join("")}
    </ul>
  `;
  topPick.textContent = `${match.homeZh} vs ${match.awayZh}：${prediction.score}`;
  officialLink.href = match.officialUrl;

  metrics.innerHTML = "";
  const metricRows = [
    ["官方源", `${prediction.metrics.official}%`],
    ["完整度", `${v1.completeness}%`],
    ["进攻均值", prediction.metrics.attack],
    ["防守均值", prediction.metrics.defense],
    ["信心分", `${confidence}%`],
    ["V1决策", v1.decision]
  ];
  if (prediction.marketOdds) {
    metricRows.splice(1, 0, ["赔率源", prediction.marketOdds.matchNo]);
  }
  metricRows.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.innerHTML = `<dt>${label}</dt><dd>${value}</dd>`;
    metrics.appendChild(item);
  });
}

function renderSources() {
  sourceList.innerHTML = "";
  (state.data.sources || []).forEach((source) => {
    const link = document.createElement("a");
    link.className = "source-item";
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.innerHTML = `
      <span>${source.type}</span>
      <strong>${source.name}</strong>
      <p>${source.note}</p>
    `;
    sourceList.appendChild(link);
  });
}

function renderRecentResults() {
  recentResults.innerHTML = "";
  const results = state.data.recentResults || [];
  if (!results.length) {
    recentResults.innerHTML = `<span>近期官方结果读取中</span>`;
    return;
  }

  results.forEach((result) => {
    const link = document.createElement("a");
    link.href = result.officialUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = `${result.homeZh} ${result.score} ${result.awayZh}`;
    recentResults.appendChild(link);
  });
}

function parseBetLines(text) {
  const unitPrice = 200;
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const normalized = line.replace(/\s+/g, " ");
      const scoreMatch = normalized.match(/(\d+)\s*[:：-]\s*(\d+)/);
      const allScores = [...normalized.matchAll(/(\d+)\s*[:：-]\s*(\d+)/g)];
      const resultScore = allScores[1] ? `${allScores[1][1]}-${allScores[1][2]}` : null;
      const unitMatch = normalized.match(/(\d+)\s*注/);
      const oddsMatch = normalized.match(/(?:赔率|払戻倍率|倍率)\s*[:：]?\s*([0-9.]+)/i);
      const resultMatch = normalized.match(/(未开奖|未発表|中|命中|当たり|当選|外れ|不中|ハズレ|lose|lost|win|hit)/i);

      if (scoreMatch && unitMatch) {
        const scoreStart = scoreMatch.index ?? 0;
        const match = normalized.slice(0, scoreStart).replace(/\s*vs\s*/i, " vs ").trim();
        const units = Number(unitMatch[1]);
        return {
          match,
          pick: `${scoreMatch[1]}-${scoreMatch[2]}`,
          units,
          stake: units * unitPrice,
          odds: oddsMatch ? Number(oddsMatch[1]) : null,
          resultScore,
          result: resultScore ? (resultScore === `${scoreMatch[1]}-${scoreMatch[2]}` ? "命中" : "不中") : resultMatch?.[1] || "未开奖"
        };
      }

      const parts = line.split(/[,，\t]/).map((part) => part.trim());
      const unitsFromPart = parts[2]?.match(/(\d+)\s*注/);
      const stake = unitsFromPart ? Number(unitsFromPart[1]) * unitPrice : Number(parts[2] || 0);
      return {
        match: parts[0] || "",
        pick: (parts[1] || "").replace(/[:：]/g, "-"),
        units: unitsFromPart ? Number(unitsFromPart[1]) : Math.round(stake / unitPrice),
        stake,
        odds: null,
        resultScore: parts[3]?.match(/(\d+)\s*[:：-]\s*(\d+)/)?.slice(1, 3).join("-") || null,
        result: parts[3] || "未开奖"
      };
    })
    .filter((item) => item.match && item.pick);
}

function renderBetSummary() {
  const raw = localStorage.getItem("winner-bets") || "";
  if (betImport) betImport.value = raw;
  const bets = parseBetLines(raw);
  if (!bets.length) {
    betSummary.innerHTML = "还没有导入购买记录。格式：比赛, 选择比分, 金额, 结果";
    return;
  }
  const settled = bets.filter((bet) => bet.result !== "未开奖");
  const hit = settled.filter((bet) => /中|当|hit|win/i.test(bet.result)).length;
  const stake = bets.reduce((sum, bet) => sum + (Number.isFinite(bet.stake) ? bet.stake : 0), 0);
  const returned = settled.reduce((sum, bet) => {
    const isHit = /中|当|hit|win/i.test(bet.result);
    return sum + (isHit && Number.isFinite(bet.odds) ? bet.stake * bet.odds : 0);
  }, 0);
  const units = bets.reduce((sum, bet) => sum + (Number.isFinite(bet.units) ? bet.units : 0), 0);
  const potential = bets.reduce((sum, bet) => {
    if (!Number.isFinite(bet.odds) || !Number.isFinite(bet.stake)) return sum;
    return sum + bet.stake * bet.odds;
  }, 0);
  const rate = settled.length ? Math.round((hit / settled.length) * 100) : 0;
  const profit = returned - settled.reduce((sum, bet) => sum + bet.stake, 0);
  const losingStreak = [...settled].reverse().findIndex((bet) => /中|当|hit|win/i.test(bet.result));
  const consecutiveLosses = losingStreak === -1 ? settled.length : losingStreak;
  const stopToday = consecutiveLosses >= 3;
  betSummary.innerHTML = `
    <strong>${bets.length}</strong> 条记录，
    合计 <strong>${units}</strong> 注，
    已开奖 <strong>${settled.length}</strong>，
    命中率 <strong>${rate}%</strong>，
    投入 <strong>${stake.toLocaleString()}円</strong>
    ${settled.length ? `，已结算返还 <strong>${yen(returned)}</strong>，盈亏 <strong>${yen(profit)}</strong>` : ""}
    ${potential ? `，理论最高返还 <strong>${Math.round(potential).toLocaleString()}円</strong>` : ""}。
    ${stopToday ? `<br><strong class="danger-text">连输 ${consecutiveLosses} 单，按 V1.0 规则今日停止下注。</strong>` : ""}
  `;
}

function render() {
  confidenceValue.textContent = `${state.minConfidence}%`;
  renderMatches();
  renderInsight();
}

riskMode.addEventListener("change", (event) => {
  state.riskMode = event.target.value;
  render();
});

confidenceRange.addEventListener("input", (event) => {
  state.minConfidence = Number(event.target.value);
  render();
});

refreshAdvice.addEventListener("click", () => {
  state.wobble = Math.floor(Math.random() * 5) - 2;
  render();
});

copySources.addEventListener("click", async () => {
  const text = (state.data.sources || []).map((source) => `${source.name}: ${source.url}`).join("\n");
  await navigator.clipboard.writeText(text);
  copySources.textContent = "已复制";
  window.setTimeout(() => {
    copySources.textContent = "复制数据源清单";
  }, 1400);
});

saveBets?.addEventListener("click", () => {
  localStorage.setItem("winner-bets", betImport.value);
  renderBetSummary();
});

clearBets?.addEventListener("click", () => {
  localStorage.removeItem("winner-bets");
  renderBetSummary();
});

bankrollInput?.addEventListener("change", () => {
  const value = Number(bankrollInput.value);
  if (Number.isFinite(value) && value > 0) {
    localStorage.setItem("bankroll", String(value));
    render();
  }
});

if (bankrollInput) bankrollInput.value = String(getBankroll());
renderBetSummary();
loadData();
