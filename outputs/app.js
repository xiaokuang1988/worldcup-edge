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

function recommendationFor(match, confidence) {
  const prediction = match.prediction;
  const topScores = prediction.topScores
    ?.map((item) => `${item.score}${item.odds ? ` @${item.odds}` : ` (${item.probability}%)`}`)
    .join(" / ");
  const base = `比分候选：${topScores || prediction.score}；方向：${prediction.winnerLean}，${prediction.totalLabel}。`;
  const official = `先打开 WINNER 官方，确认该场是否仍在销售、截止时间、可选比分和払戻倍率。`;
  const marketNote = prediction.marketOdds ? "已用你提供的当前赔率快照校准。" : "";

  if (confidence >= 74) {
    return `${prediction.decision}。${base} ${marketNote} 信心较高，但仍只适合作为赛前判断，不承诺命中。${official}`;
  }
  if (confidence >= 62) {
    return `${prediction.decision}。${base} ${marketNote} 属于可参考区间，建议等首发和伤停确认后再核对官方选项。${official}`;
  }
  return `${prediction.decision}。${base} ${marketNote} 模型波动较大，不建议为了追单继续加仓。${official}`;
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
          <span>${match.prediction.decision}</span>
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
    ${marketOddsMarkup}
    <strong>${recommendationFor(match, confidence)}</strong>
    <ul>
      ${prediction.reasons.map((reason) => `<li>${reason}</li>`).join("")}
    </ul>
  `;
  topPick.textContent = `${match.homeZh} vs ${match.awayZh}：${prediction.score}`;
  officialLink.href = match.officialUrl;

  metrics.innerHTML = "";
  const metricRows = [
    ["官方源", `${prediction.metrics.official}%`],
    ["进攻均值", prediction.metrics.attack],
    ["防守均值", prediction.metrics.defense],
    ["信心分", `${confidence}%`],
    ["操作建议", prediction.decision]
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
          result: resultMatch?.[1] || "未开奖"
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
  const units = bets.reduce((sum, bet) => sum + (Number.isFinite(bet.units) ? bet.units : 0), 0);
  const potential = bets.reduce((sum, bet) => {
    if (!Number.isFinite(bet.odds) || !Number.isFinite(bet.stake)) return sum;
    return sum + bet.stake * bet.odds;
  }, 0);
  const rate = settled.length ? Math.round((hit / settled.length) * 100) : 0;
  betSummary.innerHTML = `
    <strong>${bets.length}</strong> 条记录，
    合计 <strong>${units}</strong> 注，
    已开奖 <strong>${settled.length}</strong>，
    命中率 <strong>${rate}%</strong>，
    投入 <strong>${stake.toLocaleString()}円</strong>
    ${potential ? `，理论最高返还 <strong>${Math.round(potential).toLocaleString()}円</strong>` : ""}。
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

renderBetSummary();
loadData();
