const state = {
  data: { generatedAt: "", upcoming: [], sources: [] },
  currentPlan: []
};

const matchList = document.querySelector("#matchList");
const riskMode = document.querySelector("#riskMode");
const planBudget = document.querySelector("#planBudget");
const generatePlan = document.querySelector("#generatePlan");
const savePlan = document.querySelector("#savePlan");
const planOutput = document.querySelector("#planOutput");
const dataStatus = document.querySelector("#dataStatus");
const topPick = document.querySelector("#top-pick");
const settleSelect = document.querySelector("#settleSelect");
const returnInput = document.querySelector("#returnInput");
const settleWin = document.querySelector("#settleWin");
const settleLose = document.querySelector("#settleLose");
const ledgerSummary = document.querySelector("#ledgerSummary");
const monthlyBill = document.querySelector("#monthlyBill");
const reviewList = document.querySelector("#reviewList");
const exportBill = document.querySelector("#exportBill");

const LEDGER_KEY = "ticai-ledger-v2";
const DEFAULT_FRESHNESS_LIMIT_MINUTES = 90;

function yen(value) {
  return `${Math.round((Number(value) || 0) * 100) / 100}元`;
}

function units(stake) {
  return Math.round((Number(stake) || 0) / 2);
}

function safeDate(isoString) {
  if (!isoString) return "未更新";
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

function dataAgeMinutes() {
  const generatedAt = Date.parse(state.data.generatedAt || "");
  if (!Number.isFinite(generatedAt)) return Infinity;
  return Math.max(0, Math.round((Date.now() - generatedAt) / 60000));
}

function freshnessLimit() {
  return Number(state.data.freshnessLimitMinutes || DEFAULT_FRESHNESS_LIMIT_MINUTES);
}

function isDataFresh() {
  return dataAgeMinutes() <= freshnessLimit();
}

function freshnessLabel() {
  const age = dataAgeMinutes();
  if (!Number.isFinite(age)) return "未取得";
  return age <= freshnessLimit() ? `${age} 分钟前` : `已过期 ${age} 分钟`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(dateText = todayKey()) {
  return dateText.slice(0, 7);
}

function readLedger() {
  try {
    const ledger = JSON.parse(localStorage.getItem(LEDGER_KEY) || "[]");
    return Array.isArray(ledger) ? ledger : [];
  } catch {
    return [];
  }
}

function writeLedger(ledger) {
  localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
}

function sideToPick(side) {
  return { 主胜: "主胜", 客胜: "客胜", 平局: "平" }[side] || "平";
}

function pickOdds(match, pick) {
  const hda = match.prediction?.marketOdds?.hda || {};
  if (pick === "主胜") return hda.home;
  if (pick === "客胜") return hda.away;
  return hda.draw;
}

function confidence(match) {
  return Number(match.prediction?.confidence || 0);
}

function oddsEntries(odds = {}) {
  return Object.entries(odds)
    .map(([pick, value]) => ({ pick, odds: Number(value) }))
    .filter((item) => item.pick && Number.isFinite(item.odds) && item.odds > 0)
    .sort((a, b) => a.odds - b.odds);
}

function bestEntry(odds = {}, predicate = () => true) {
  return oddsEntries(odds).find(predicate);
}

function makeOption(match, option) {
  return {
    matchId: match.id,
    matchNo: match.matchNo || match.id?.replace(/^kt-/, "") || "",
    match: `${match.homeZh} vs ${match.awayZh}`,
    league: match.tournament,
    time: match.time,
    ...option
  };
}

function recentLossStreak() {
  const settled = readLedger()
    .filter((item) => item.status !== "pending")
    .sort((a, b) => String(a.settledAt || a.createdAt).localeCompare(String(b.settledAt || b.createdAt)));
  let streak = 0;
  for (const item of settled.reverse()) {
    if (item.status === "win") break;
    if (item.status === "lose") streak += 1;
  }
  return streak;
}

function candidateFor(match) {
  const pick = sideToPick(match.prediction?.resultLean);
  const odds = pickOdds(match, pick);
  const line = match.prediction?.marketOdds?.handicap?.line || "0";
  const score = confidence(match);
  const penalty = Number(odds) < 1.5 ? 8 : 0;
  const hda = match.prediction?.marketOdds?.hda || {};
  return {
    matchId: match.id,
    matchNo: match.matchNo || match.id?.replace(/^kt-/, "") || "",
    match: `${match.homeZh} vs ${match.awayZh}`,
    league: match.tournament,
    time: match.time,
    market: "胜平负",
    pick,
    odds: Number(odds) || 0,
    hda,
    handicap: line,
    score: Math.max(0, score - penalty),
    reason: `事实依据：胜 ${hda.home || "-"} / 平 ${hda.draw || "-"} / 负 ${hda.away || "-"}，让球 ${line}。建议只来自赔率结构，不代表赛果事实。`
  };
}

function marketOptionsFor(match) {
  const marketOdds = match.prediction?.marketOdds || {};
  const hda = marketOdds.hda || {};
  const handicap = marketOdds.handicap || {};
  const score = confidence(match);
  const options = [];

  const hdaPick = sideToPick(match.prediction?.resultLean);
  const hdaOdds = pickOdds(match, hdaPick);
  if (hdaOdds >= 1.5) {
    options.push(
      makeOption(match, {
        category: "hda",
        market: "胜平负",
        pick: hdaPick,
        odds: Number(hdaOdds),
        hda,
        handicap: handicap.line || "0",
        score: Math.max(0, score - (hdaOdds < 1.5 ? 8 : 0)),
        riskWeight: 1,
        reason: `主市场事实：胜 ${hda.home || "-"} / 平 ${hda.draw || "-"} / 负 ${hda.away || "-"}。`
      })
    );
  }

  const handicapPick = bestEntry({ 让胜: handicap.home, 让平: handicap.draw, 让负: handicap.away }, (item) => item.odds >= 1.55 && item.odds <= 4.8);
  if (handicapPick) {
    options.push(
      makeOption(match, {
        category: "handicap",
        market: `让球胜平负 ${handicap.line || ""}`.trim(),
        pick: handicapPick.pick,
        odds: handicapPick.odds,
        hda,
        handicap: handicap.line || "0",
        score: Math.max(0, score - 4),
        riskWeight: 0.75,
        reason: `让球盘事实：让胜 ${handicap.home || "-"} / 让平 ${handicap.draw || "-"} / 让负 ${handicap.away || "-"}。`
      })
    );
  }

  const totalPick = bestEntry(marketOdds.totalGoals, (item) => item.odds >= 2.4 && item.odds <= 7.5);
  if (totalPick) {
    options.push(
      makeOption(match, {
        category: "totalGoals",
        market: "总进球数",
        pick: totalPick.pick,
        odds: totalPick.odds,
        hda,
        handicap: handicap.line || "0",
        score: Math.max(0, score - 8),
        riskWeight: 0.45,
        reason: `总进球事实赔率：${Object.entries(marketOdds.totalGoals || {}).map(([k, v]) => `${k} ${v}`).join(" / ")}。`
      })
    );
  }

  const scorePick = bestEntry(marketOdds.scoreOdds, (item) => item.odds >= 5 && item.odds <= 14 && !item.pick.includes("其他"));
  if (scorePick) {
    options.push(
      makeOption(match, {
        category: "score",
        market: "比分",
        pick: scorePick.pick,
        odds: scorePick.odds,
        hda,
        handicap: handicap.line || "0",
        score: Math.max(0, score - 16),
        riskWeight: 0.18,
        reason: "比分玩法波动最大，只能小仓位；这里仅取当前可见赔率中风险相对最低的比分。"
      })
    );
  }

  const halfPick = bestEntry(marketOdds.halfFull, (item) => item.odds >= 2 && item.odds <= 8.5);
  if (halfPick) {
    options.push(
      makeOption(match, {
        category: "halfFull",
        market: "半全场",
        pick: halfPick.pick,
        odds: halfPick.odds,
        hda,
        handicap: handicap.line || "0",
        score: Math.max(0, score - 12),
        riskWeight: 0.28,
        reason: "半全场对比赛节奏要求高，默认小仓位，只在赔率结构清楚时进入候选。"
      })
    );
  }

  return options;
}

function roundStake(value) {
  return Math.max(2, Math.round(value / 2) * 2);
}

function allocateBudget(budget, count) {
  const templates = {
    1: [1],
    2: [0.6, 0.4],
    3: [0.5, 0.3, 0.2],
    4: [0.4, 0.25, 0.2, 0.15]
  };
  const weights = templates[count] || templates[3];
  const stakes = weights.map((weight) => roundStake(budget * weight));
  const diff = budget - stakes.reduce((sum, stake) => sum + stake, 0);
  stakes[0] = Math.max(2, stakes[0] + diff);
  return stakes;
}

function allocateWeightedBudget(budget, candidates) {
  const totalWeight = candidates.reduce((sum, item) => sum + Number(item.riskWeight || 0.2), 0) || 1;
  const stakes = candidates.map((item) => roundStake((budget * Number(item.riskWeight || 0.2)) / totalWeight));
  const diff = budget - stakes.reduce((sum, stake) => sum + stake, 0);
  stakes[0] = Math.max(2, stakes[0] + diff);
  return stakes;
}

function selectPortfolio(options, wanted, maxPerMatch = 3) {
  const categoryOrder = ["hda", "handicap", "totalGoals", "score", "halfFull"];
  const selected = [];
  const used = new Set();
  const matchCounts = {};
  const canUse = (item) => Number(matchCounts[item.matchId] || 0) < maxPerMatch;
  const add = (item) => {
    selected.push(item);
    used.add(`${item.matchId}-${item.market}-${item.pick}`);
    matchCounts[item.matchId] = Number(matchCounts[item.matchId] || 0) + 1;
  };

  for (const category of categoryOrder) {
    const best = options.find((item) => item.category === category && canUse(item) && !used.has(`${item.matchId}-${item.market}-${item.pick}`));
    if (best) {
      add(best);
    }
    if (selected.length >= wanted) return selected;
  }

  for (const item of options) {
    const key = `${item.matchId}-${item.market}-${item.pick}`;
    if (used.has(key)) continue;
    if (!canUse(item)) continue;
    add(item);
    if (selected.length >= wanted) break;
  }

  return selected;
}

function buildPlan() {
  if (!isDataFresh()) {
    state.currentPlan = [];
    planOutput.innerHTML = `<div class="empty-state">数据快照${freshnessLabel()}，超过 ${freshnessLimit()} 分钟风控线。为避免旧场次误导，已停止生成下注方案；请先刷新 kt 数据。</div>`;
    topPick.textContent = "数据过期";
    return;
  }

  const budget = Math.max(2, roundStake(Number(planBudget.value || 200)));
  planBudget.value = String(budget);

  const lossStreak = recentLossStreak();
  if (lossStreak >= 3) {
    state.currentPlan = [];
    planOutput.innerHTML = `<div class="empty-state">最近已连续未中 ${lossStreak} 单，按风控规则今日停止下注。</div>`;
    topPick.textContent = "今日停止";
    return;
  }

  const mode = riskMode.value;
  const wanted = mode === "low" ? 4 : mode === "high" ? 8 : 6;
  const candidates = (state.data.upcoming || [])
    .flatMap(marketOptionsFor)
    .filter((item) => item.odds >= 1.5 && item.score >= 45)
    .sort((a, b) => b.score - a.score);
  const matchCount = new Set((state.data.upcoming || []).map((match) => match.id)).size || 1;
  const selected = selectPortfolio(candidates, wanted, Math.max(2, Math.ceil(wanted / matchCount)));

  if (!selected.length) {
    state.currentPlan = [];
    planOutput.innerHTML = `<div class="empty-state">当前没有达到下注阈值的比赛。建议 PASS，不要为了下注而下注。</div>`;
    topPick.textContent = "全部 PASS";
    return;
  }

  const stakes = allocateWeightedBudget(budget, selected);
  state.currentPlan = selected.map((item, index) => ({
    ...item,
    id: `bet-${Date.now()}-${index}`,
    createdAt: todayKey(),
    stake: stakes[index],
    units: units(stakes[index]),
    status: "pending",
    returned: 0
  }));

  renderPlan();
}

function renderPlan() {
  if (!state.currentPlan.length) {
    planOutput.innerHTML = `<div class="empty-state">输入预算后点击“生成方案”。</div>`;
    return;
  }

  const total = state.currentPlan.reduce((sum, item) => sum + item.stake, 0);
  const maxReturn = state.currentPlan.reduce((sum, item) => sum + item.stake * item.odds, 0);
  topPick.textContent = `${state.currentPlan[0].match} ${state.currentPlan[0].market} ${state.currentPlan[0].pick}`;
  planOutput.innerHTML = `
    <div class="plan-summary">
      <strong>预算 ${yen(total)}</strong>
      <span>共 ${state.currentPlan.length} 单，理论最高返还 ${yen(maxReturn)}</span>
    </div>
    ${state.currentPlan
      .map(
        (item, index) => `
          <article class="plan-card">
            <span class="label">第 ${index + 1} 单</span>
            <h3>${item.matchNo ? `${item.matchNo} ` : ""}${item.match}</h3>
            <p>${item.market}：<strong>${item.pick}</strong> @${item.odds}</p>
            <p>金额：<strong>${yen(item.stake)}</strong>，${item.units} 注</p>
            <p>赔率事实：胜 ${item.hda.home || "-"} / 平 ${item.hda.draw || "-"} / 负 ${item.hda.away || "-"}</p>
            <small>${item.reason}</small>
          </article>
        `
      )
      .join("")}
  `;
}

function saveCurrentPlan() {
  if (!state.currentPlan.length) buildPlan();
  if (!state.currentPlan.length) return;

  const ledger = readLedger();
  const saved = state.currentPlan.map((item) => ({
    ...item,
    id: `bet-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: todayKey(),
    sourceGeneratedAt: state.data.generatedAt
  }));
  writeLedger([...ledger, ...saved]);
  planOutput.insertAdjacentHTML("afterbegin", `<div class="save-banner">已入库 ${saved.length} 单，等待开奖结算。</div>`);
  renderLedger();
}

function settle(status) {
  const id = settleSelect.value;
  if (!id) return;
  const ledger = readLedger();
  const item = ledger.find((entry) => entry.id === id);
  if (!item) return;
  item.status = status;
  item.settledAt = todayKey();
  item.returned = status === "win" ? Number(returnInput.value || item.stake * item.odds || 0) : 0;
  item.profit = item.returned - item.stake;
  item.review = reviewFor(item);
  writeLedger(ledger);
  returnInput.value = "0";
  renderLedger();
}

function reviewFor(item) {
  if (item.status === "win") {
    return `${item.match} 命中 ${item.pick}，投入 ${yen(item.stake)}，返还 ${yen(item.returned)}。下次保持同等仓位，不加码追热。`;
  }
  return `${item.match} 未中 ${item.pick}，亏损 ${yen(item.stake)}。复盘重点：方向判断是否过度依赖赔率低位，下一单降低仓位。`;
}

function renderMatches() {
  const matches = state.data.upcoming || [];
  if (!matches.length) {
    matchList.innerHTML = `<div class="empty-state">暂无可用比赛。</div>`;
    return;
  }
  matchList.innerHTML = matches
    .map((match) => {
      const item = candidateFor(match);
      const marketOdds = match.prediction?.marketOdds || {};
      const coverage = [
        Object.keys(marketOdds.scoreOdds || {}).length ? "比分" : "",
        Object.keys(marketOdds.totalGoals || {}).length ? "总进球" : "",
        Object.keys(marketOdds.halfFull || {}).length ? "半全场" : ""
      ].filter(Boolean);
      return `
        <button class="match-card" type="button">
          <div>
            <p class="teams">${item.match}</p>
            <div class="match-meta">
              ${item.matchNo ? `<span>编号 ${item.matchNo}</span>` : ""}
              <span>${item.league}</span>
              <span>${item.time}</span>
              <span>${item.market}</span>
              ${coverage.map((label) => `<span>${label}已接入</span>`).join("")}
            </div>
            <div class="factors">
              <span>胜 ${item.hda.home || "-"}</span>
              <span>平 ${item.hda.draw || "-"}</span>
              <span>负 ${item.hda.away || "-"}</span>
              <span>让球 ${item.handicap}</span>
              <span>${isDataFresh() ? "快照有效" : "快照过期"}</span>
            </div>
          </div>
        </button>
      `;
    })
    .join("");
}

function renderLedger() {
  const ledger = readLedger();
  const pending = ledger.filter((item) => item.status === "pending");
  const settled = ledger.filter((item) => item.status !== "pending");
  const stake = ledger.reduce((sum, item) => sum + Number(item.stake || 0), 0);
  const returned = ledger.reduce((sum, item) => sum + Number(item.returned || 0), 0);
  const profit = returned - settled.reduce((sum, item) => sum + Number(item.stake || 0), 0);

  settleSelect.innerHTML = pending.length
    ? pending.map((item) => `<option value="${item.id}">${item.match} ${item.pick} ${yen(item.stake)}</option>`).join("")
    : `<option value="">没有未开奖记录</option>`;

  ledgerSummary.innerHTML = `
    已入库 <strong>${ledger.length}</strong> 单，
    未开奖 <strong>${pending.length}</strong>，
    总投入 <strong>${yen(stake)}</strong>，
    已返还 <strong>${yen(returned)}</strong>，
    已结算盈亏 <strong>${yen(profit)}</strong>。
  `;

  renderMonthlyBill();
  renderReviews();
}

function renderMonthlyBill() {
  const key = monthKey();
  const rows = readLedger().filter((item) => monthKey(item.createdAt) === key);
  const settled = rows.filter((item) => item.status !== "pending");
  const stake = rows.reduce((sum, item) => sum + Number(item.stake || 0), 0);
  const returned = rows.reduce((sum, item) => sum + Number(item.returned || 0), 0);
  const profit = returned - settled.reduce((sum, item) => sum + Number(item.stake || 0), 0);
  const wins = settled.filter((item) => item.status === "win").length;
  const hitRate = settled.length ? Math.round((wins / settled.length) * 100) : 0;

  monthlyBill.innerHTML = `
    <div class="bill-total">
      <strong>${key} 月账单</strong>
      <span>投注 ${rows.length} 单 / 已结算 ${settled.length} 单 / 命中率 ${hitRate}% / 盈亏 ${yen(profit)}</span>
    </div>
    <table>
      <thead><tr><th>日期</th><th>比赛</th><th>选择</th><th>投入</th><th>返还</th><th>状态</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (item) => `
              <tr>
                <td>${item.createdAt}</td>
                <td>${item.match}</td>
                <td>${item.pick}</td>
                <td>${yen(item.stake)}</td>
                <td>${yen(item.returned)}</td>
                <td>${item.status === "pending" ? "未开奖" : item.status === "win" ? "命中" : "未中"}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderReviews() {
  const reviews = readLedger()
    .filter((item) => item.status !== "pending")
    .slice(-12)
    .reverse();

  reviewList.innerHTML = reviews.length
    ? reviews
        .map(
          (item) => `
            <article class="source-item">
              <span>${item.settledAt}</span>
              <strong>${item.match}</strong>
              <p>${item.review || reviewFor(item)}</p>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state">还没有已结算记录。开奖后录入结果，这里会自动复盘。</div>`;
}

function exportMonthlyBill() {
  const key = monthKey();
  const rows = readLedger().filter((item) => monthKey(item.createdAt) === key);
  const header = ["date", "match", "market", "pick", "odds", "stake", "returned", "status", "review"];
  const csv = [
    header.join(","),
    ...rows.map((item) =>
      header
        .map((field) => `"${String(item[field] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ticai-bill-${key}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function loadData() {
  try {
    const response = await fetch(`./data/live-matches.json?ts=${Date.now()}`);
    if (!response.ok) throw new Error(`data returned ${response.status}`);
    state.data = await response.json();
    dataStatus.textContent = isDataFresh()
      ? `kt 快照：${safeDate(state.data.generatedAt)} 更新，${freshnessLabel()}`
      : `kt 快照过期：${safeDate(state.data.generatedAt)} 更新，${freshnessLabel()}`;
  } catch (error) {
    dataStatus.textContent = "kt 当前页读取失败";
    console.error(error);
  }
  renderMatches();
  buildPlan();
  renderLedger();
}

generatePlan.addEventListener("click", buildPlan);
savePlan.addEventListener("click", saveCurrentPlan);
riskMode.addEventListener("change", buildPlan);
settleWin.addEventListener("click", () => settle("win"));
settleLose.addEventListener("click", () => settle("lose"));
exportBill.addEventListener("click", exportMonthlyBill);

loadData();
