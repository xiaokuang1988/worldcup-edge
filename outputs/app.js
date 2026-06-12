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
  const base = `比分倾向：${match.homeZh} ${prediction.score} ${match.awayZh}；方向：${prediction.winnerLean}，${prediction.totalLabel}。`;
  const official = `先打开 WINNER 官方，确认该场是否仍在销售、截止时间、可选比分和払戻倍率。`;

  if (confidence >= 74) {
    return `${base} 信心较高，但仍只适合作为赛前判断，不承诺命中。${official}`;
  }
  if (confidence >= 62) {
    return `${base} 属于可参考区间，建议等首发和伤停确认后再核对官方选项。${official}`;
  }
  return `${base} 模型波动较大，建议跳过或小额观察。${official}`;
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
          <span>预测比分：${match.prediction.score}</span>
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

  selectedTitle.textContent = `${match.homeZh} vs ${match.awayZh}`;
  selectedBadge.textContent = `${match.date} ${match.time}`;
  scoreValue.textContent = prediction.score;
  scoreRing.style.background = `conic-gradient(var(--green) 0deg, var(--green) ${angle}deg, rgba(255, 255, 255, 0.1) ${angle}deg)`;
  recommendationText.innerHTML = `
    <strong>${recommendationFor(match, confidence)}</strong>
    <ul>
      ${prediction.reasons.map((reason) => `<li>${reason}</li>`).join("")}
    </ul>
  `;
  topPick.textContent = `${match.homeZh} vs ${match.awayZh}：${prediction.score}`;
  officialLink.href = match.officialUrl;

  metrics.innerHTML = "";
  [
    ["官方源", `${prediction.metrics.official}%`],
    ["进攻均值", prediction.metrics.attack],
    ["防守均值", prediction.metrics.defense],
    ["信心分", `${confidence}%`]
  ].forEach(([label, value]) => {
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

loadData();
