const matches = [
  {
    id: "jpn-ger",
    title: "日本 vs 德国",
    date: "2026-06-14",
    market: "WINNER 单场结果",
    baseConfidence: 68,
    pick: "日本不败方向",
    style: "高压反击 + 边路速度",
    factors: ["日本转换速度", "德国控球压迫", "定位球风险"],
    metrics: {
      attack: 76,
      defense: 71,
      form: 74,
      volatility: 42
    }
  },
  {
    id: "arg-fra",
    title: "阿根廷 vs 法国",
    date: "2026-06-16",
    market: "冠军/淘汰赛方向",
    baseConfidence: 63,
    pick: "小注观察，优先等首发",
    style: "中路创造力对抗纵深冲击",
    factors: ["巨星状态", "阵容年龄结构", "反击空间"],
    metrics: {
      attack: 84,
      defense: 78,
      form: 69,
      volatility: 61
    }
  },
  {
    id: "bra-eng",
    title: "巴西 vs 英格兰",
    date: "2026-06-18",
    market: "进球数/胜平负",
    baseConfidence: 71,
    pick: "总进球 2-3 区间",
    style: "边锋个人能力对抗中场控制",
    factors: ["巴西边路单点", "英格兰定位球", "节奏变化"],
    metrics: {
      attack: 82,
      defense: 75,
      form: 77,
      volatility: 48
    }
  },
  {
    id: "esp-por",
    title: "西班牙 vs 葡萄牙",
    date: "2026-06-20",
    market: "单场比分方向",
    baseConfidence: 66,
    pick: "平局保护",
    style: "控球耐心对抗禁区效率",
    factors: ["西班牙控球", "葡萄牙射门效率", "替补深度"],
    metrics: {
      attack: 79,
      defense: 76,
      form: 72,
      volatility: 53
    }
  }
];

const sources = [
  {
    type: "官方赛程",
    name: "FIFA World Cup 2026",
    url: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026",
    note: "赛事、赛程和官方新闻。"
  },
  {
    type: "日本代表",
    name: "JFA 日本サッカー協会",
    url: "https://www.jfa.jp/",
    note: "日本队新闻、名单、比赛信息。"
  },
  {
    type: "合规彩票",
    name: "スポーツくじ WINNER",
    url: "https://www.toto-dream.com/winner/index.html",
    note: "日本官方体育彩票入口。"
  },
  {
    type: "合规核验",
    name: "警察庁オンラインカジノ注意",
    url: "https://www.npa.go.jp/bureau/safetylife/hoan/onlinecasino/onlinecasino.html",
    note: "核对线上博彩与广告导流风险。"
  },
  {
    type: "实时资讯",
    name: "Yahoo!ニュース スポーツ",
    url: "https://news.yahoo.co.jp/categories/sports",
    note: "日本本地体育新闻聚合。"
  },
  {
    type: "赔率替代",
    name: "公开信息源待接入",
    url: "https://www.toto-dream.com/",
    note: "优先使用官方销售日程和公开结果，不采集灰站赔率。"
  }
];

const state = {
  selectedId: matches[0].id,
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

function adjustedConfidence(match) {
  const riskAdjustment = {
    low: -6,
    balanced: 0,
    high: 5
  }[state.riskMode];

  const volatilityPenalty = state.riskMode === "low" ? Math.round(match.metrics.volatility / 12) : 0;
  return Math.max(45, Math.min(92, match.baseConfidence + riskAdjustment - volatilityPenalty + state.wobble));
}

function recommendationFor(match, confidence) {
  if (confidence >= 72) {
    return `${match.pick}。信心较高，但仍建议控制仓位；先核对 WINNER 官方销售项、截止时间和最新首发。`;
  }

  if (confidence >= 62) {
    return `${match.pick}。适合作为观察型选择，不建议重仓；若临场伤停或赔率变化明显，降低投入。`;
  }

  return `模型信心不足，建议跳过或只做赛前观察。重点看 ${match.factors[0]} 与 ${match.factors[1]} 是否在临场信息中确认。`;
}

function renderMatches() {
  matchList.innerHTML = "";
  const visible = matches.filter((match) => adjustedConfidence(match) >= state.minConfidence);

  const list = visible.length ? visible : matches;
  list.forEach((match) => {
    const confidence = adjustedConfidence(match);
    const button = document.createElement("button");
    button.className = `match-card${match.id === state.selectedId ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <div>
        <p class="teams">${match.title}</p>
        <div class="match-meta">
          <span>${match.date}</span>
          <span>${match.market}</span>
          <span>${match.style}</span>
        </div>
        <div class="factors">
          ${match.factors.map((factor) => `<span>${factor}</span>`).join("")}
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
  const match = matches.find((item) => item.id === state.selectedId) || matches[0];
  const confidence = adjustedConfidence(match);
  const angle = Math.round((confidence / 100) * 360);

  selectedTitle.textContent = match.title;
  selectedBadge.textContent = match.market;
  scoreValue.textContent = confidence;
  scoreRing.style.background = `conic-gradient(var(--green) 0deg, var(--green) ${angle}deg, rgba(255, 255, 255, 0.1) ${angle}deg)`;
  recommendationText.textContent = recommendationFor(match, confidence);
  topPick.textContent = `${match.title}：${match.pick}`;

  metrics.innerHTML = "";
  [
    ["进攻效率", match.metrics.attack],
    ["防守稳定", match.metrics.defense],
    ["近期状态", match.metrics.form],
    ["波动风险", match.metrics.volatility]
  ].forEach(([label, value]) => {
    const item = document.createElement("div");
    item.innerHTML = `<dt>${label}</dt><dd>${value}</dd>`;
    metrics.appendChild(item);
  });
}

function renderSources() {
  sourceList.innerHTML = "";
  sources.forEach((source) => {
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
  state.wobble = Math.floor(Math.random() * 7) - 3;
  render();
});

copySources.addEventListener("click", async () => {
  const text = sources.map((source) => `${source.name}: ${source.url}`).join("\n");
  await navigator.clipboard.writeText(text);
  copySources.textContent = "已复制";
  window.setTimeout(() => {
    copySources.textContent = "复制数据源清单";
  }, 1400);
});

renderSources();
render();
