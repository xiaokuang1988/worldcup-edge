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
  return {
    matchId: match.id,
    match: `${match.homeZh} vs ${match.awayZh}`,
    league: match.tournament,
    time: match.time,
    market: "胜平负",
    pick,
    odds: Number(odds) || 0,
    handicap: line,
    score: Math.max(0, score - penalty),
    reason: `方向 ${pick}，赔率 ${odds || "-"}，让球 ${line}。`
  };
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

function buildPlan() {
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
  const wanted = mode === "low" ? 2 : mode === "high" ? 4 : 3;
  const candidates = (state.data.upcoming || [])
    .map(candidateFor)
    .filter((item) => item.odds >= 1.5 && item.score >= 62)
    .sort((a, b) => b.score - a.score)
    .slice(0, wanted);

  if (!candidates.length) {
    state.currentPlan = [];
    planOutput.innerHTML = `<div class="empty-state">当前没有达到下注阈值的比赛。建议 PASS，不要为了下注而下注。</div>`;
    topPick.textContent = "全部 PASS";
    return;
  }

  const stakes = allocateBudget(budget, candidates.length);
  state.currentPlan = candidates.map((item, index) => ({
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
  topPick.textContent = `${state.currentPlan[0].match} ${state.currentPlan[0].pick}`;
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
            <h3>${item.match}</h3>
            <p>${item.market}：<strong>${item.pick}</strong> @${item.odds}</p>
            <p>金额：<strong>${yen(item.stake)}</strong>，${item.units} 注</p>
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
      return `
        <button class="match-card" type="button">
          <div>
            <p class="teams">${item.match}</p>
            <div class="match-meta">
              <span>${item.league}</span>
              <span>${item.time}</span>
              <span>${item.market}</span>
            </div>
            <div class="factors">
              <span>${item.pick} @${item.odds}</span>
              <span>让球 ${item.handicap}</span>
              <span>评分 ${item.score}</span>
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
    dataStatus.textContent = `kt 当前页：${safeDate(state.data.generatedAt)} 更新`;
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
