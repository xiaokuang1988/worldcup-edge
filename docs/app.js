const state = {
  data: { generatedAt: "", upcoming: [], sources: [] },
  currentPlan: []
};

const matchList = document.querySelector("#matchList");
const riskMode = document.querySelector("#riskMode");
const planBudget = document.querySelector("#planBudget");
const generatePlan = document.querySelector("#generatePlan");
const savePlan = document.querySelector("#savePlan");
const refreshData = document.querySelector("#refreshData");
const refreshDataHero = document.querySelector("#refreshDataHero");
const planOutput = document.querySelector("#planOutput");
const dataStatus = document.querySelector("#dataStatus");
const topPick = document.querySelector("#top-pick");
const saleStatus = document.querySelector("#saleStatus");
const settleSelect = document.querySelector("#settleSelect");
const returnInput = document.querySelector("#returnInput");
const settleWin = document.querySelector("#settleWin");
const settleLose = document.querySelector("#settleLose");
const ledgerSummary = document.querySelector("#ledgerSummary");
const monthlyBill = document.querySelector("#monthlyBill");
const reviewList = document.querySelector("#reviewList");
const exportBill = document.querySelector("#exportBill");
const dltBudget = document.querySelector("#dltBudget");
const dltMode = document.querySelector("#dltMode");
const dltAppend = document.querySelector("#dltAppend");
const generateDlt = document.querySelector("#generateDlt");
const saveDlt = document.querySelector("#saveDlt");
const dltOutput = document.querySelector("#dltOutput");
const dltCameraPhoto = document.querySelector("#dltCameraPhoto");
const dltGalleryPhoto = document.querySelector("#dltGalleryPhoto");
const dltPhotoPreview = document.querySelector("#dltPhotoPreview");
const ocrDltPhoto = document.querySelector("#ocrDltPhoto");
const dltImport = document.querySelector("#dltImport");
const importDlt = document.querySelector("#importDlt");
const sampleDlt = document.querySelector("#sampleDlt");
const dltDraw = document.querySelector("#dltDraw");
const settleDlt = document.querySelector("#settleDlt");
const dltHistory = document.querySelector("#dltHistory");
const dltNextDraw = document.querySelector("#dltNextDraw");
const dltCutoff = document.querySelector("#dltCutoff");
const dltReminderStatus = document.querySelector("#dltReminderStatus");

const LEDGER_KEY = "ticai-ledger-v2";
const DLT_KEY = "ticai-dlt-ledger-v1";
const DEFAULT_FRESHNESS_LIMIT_MINUTES = 90;
const MIN_PLAN_RETURN_MULTIPLE = 2;
const MIN_OPTION_SCORE = 58;
const DLT_SAMPLE_TICKET = `03 11 19 21 25 + 09 12
06 08 27 32 35 + 02 08
06 21 23 28 31 + 01 07
01 06 21 29 33 + 07 12
03 04 05 23 29 + 02 04`;
const DLT_DRAW_WEEKDAYS = [1, 3, 6];
const DLT_CUTOFF_HOUR_CN = 21;
const DLT_DRAW_HOUR_CN = 21;
const DLT_DRAW_MINUTE_CN = 25;
let dltPhotoObjectUrl = "";
let selectedDltPhotoFile = null;

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

function zonedParts(timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function saleWindow() {
  const cn = zonedParts("Asia/Shanghai");
  const jp = zonedParts("Asia/Tokyo");
  const weekdayZh = { Mon: "周一", Tue: "周二", Wed: "周三", Thu: "周四", Fri: "周五", Sat: "周六", Sun: "周日" };
  const weekend = cn.weekday === "Sat" || cn.weekday === "Sun";
  const closeHourCn = weekend ? 23 : 22;
  const hour = Number(cn.hour) % 24;
  const minute = Number(cn.minute);
  const minutes = hour * 60 + minute;
  const openMinutes = 11 * 60;
  const closeMinutes = closeHourCn * 60;
  const isOpen = minutes >= openMinutes && minutes < closeMinutes;
  return {
    isOpen,
    text: `${isOpen ? "开售中" : "停售中"}｜中国${weekdayZh[cn.weekday] || cn.weekday} ${cn.hour}:${cn.minute}，日本${weekdayZh[jp.weekday] || jp.weekday} ${jp.hour}:${jp.minute}｜开售 中国 11:00 / 日本 12:00，截止 ${weekend ? "中国 23:00 / 日本次日 00:00" : "中国 22:00 / 日本 23:00"}`
  };
}

function dateInTimeZone(timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour) % 24,
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

function chinaDateToUtcMs(year, month, day, hour, minute = 0, second = 0) {
  return Date.UTC(year, month - 1, day, hour - 8, minute, second);
}

function formatZoned(ms, timeZone) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(ms));
}

function compactDuration(ms) {
  if (ms <= 0) return "已到时间";
  const totalMinutes = Math.ceil(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}天${hours}小时${minutes}分钟`;
  if (hours) return `${hours}小时${minutes}分钟`;
  return `${minutes}分钟`;
}

function nextDltSchedule(nowMs = Date.now()) {
  const cnNow = dateInTimeZone("Asia/Shanghai");
  const todayUtc = chinaDateToUtcMs(cnNow.year, cnNow.month, cnNow.day, 0, 0, 0);
  for (let offset = 0; offset < 14; offset += 1) {
    const dayMs = todayUtc + offset * 86400000;
    const cnDay = new Date(dayMs + 8 * 3600000);
    const weekday = cnDay.getUTCDay();
    if (!DLT_DRAW_WEEKDAYS.includes(weekday)) continue;
    const year = cnDay.getUTCFullYear();
    const month = cnDay.getUTCMonth() + 1;
    const day = cnDay.getUTCDate();
    const cutoffMs = chinaDateToUtcMs(year, month, day, DLT_CUTOFF_HOUR_CN, 0, 0);
    const drawMs = chinaDateToUtcMs(year, month, day, DLT_DRAW_HOUR_CN, DLT_DRAW_MINUTE_CN, 0);
    if (drawMs > nowMs) {
      return {
        cutoffMs,
        drawMs,
        canBuy: nowMs < cutoffMs,
        hasCutoffPassed: nowMs >= cutoffMs,
        untilCutoff: cutoffMs - nowMs,
        untilDraw: drawMs - nowMs
      };
    }
  }
  return null;
}

function renderDltReminder() {
  const schedule = nextDltSchedule();
  if (!schedule || !dltNextDraw || !dltCutoff || !dltReminderStatus) return;
  dltNextDraw.textContent = `中国 ${formatZoned(schedule.drawMs, "Asia/Shanghai")} / 日本 ${formatZoned(schedule.drawMs, "Asia/Tokyo")}`;
  dltCutoff.textContent = `中国 ${formatZoned(schedule.cutoffMs, "Asia/Shanghai")} / 日本 ${formatZoned(schedule.cutoffMs, "Asia/Tokyo")}`;
  dltReminderStatus.textContent = schedule.canBuy
    ? `可买，距离停止购买 ${compactDuration(schedule.untilCutoff)}`
    : `已停止购买，距离开奖 ${compactDuration(schedule.untilDraw)}`;
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

function settledLedger() {
  return readLedger().filter((item) => item.status === "win" || item.status === "lose");
}

function categoryStats() {
  const stats = {};
  for (const item of settledLedger()) {
    const key = item.category || item.market || "unknown";
    if (!stats[key]) stats[key] = { total: 0, wins: 0 };
    stats[key].total += 1;
    if (item.status === "win") stats[key].wins += 1;
  }
  return stats;
}

function learnedScoreBoost(category) {
  const stat = categoryStats()[category];
  if (!stat || stat.total < 3) return 0;
  const rate = stat.wins / stat.total;
  if (rate >= 0.6) return 6;
  if (rate <= 0.34) return -10;
  return 0;
}

function writeLedger(ledger) {
  localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
}

function readDltLedger() {
  try {
    const ledger = JSON.parse(localStorage.getItem(DLT_KEY) || "[]");
    return Array.isArray(ledger) ? ledger : [];
  } catch {
    return [];
  }
}

function writeDltLedger(ledger) {
  localStorage.setItem(DLT_KEY, JSON.stringify(ledger));
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function rangeNumbers(max) {
  return Array.from({ length: max }, (_, index) => index + 1);
}

function parseDltLines(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => {
      let numbers = line.match(/\d{1,2}/g)?.map(Number).filter(Number.isFinite) || [];
      if (numbers.length >= 8 && numbers[0] >= 1 && numbers[0] <= 20) {
        const maybeFront = numbers.slice(1, 6);
        const maybeBack = numbers.slice(6, 8);
        if (maybeFront.every((n) => n >= 1 && n <= 35) && maybeBack.every((n) => n >= 1 && n <= 12)) {
          numbers = numbers.slice(1);
        }
      }
      const front = numbers.slice(0, 5).filter((n) => n >= 1 && n <= 35);
      const back = numbers.slice(5, 7).filter((n) => n >= 1 && n <= 12);
      if (new Set(front).size !== 5 || new Set(back).size !== 2) return null;
      return {
        front: [...new Set(front)].sort((a, b) => a - b),
        back: [...new Set(back)].sort((a, b) => a - b)
      };
    })
    .filter(Boolean);
}

function normalizeDltOcrText(text) {
  const cleanedLines = String(text || "")
    .split(/\n+/)
    .map((line) => line.replace(/[^\d+\s]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const parsed = [];
  const seen = new Set();
  for (const line of cleanedLines) {
    for (const ticketLine of parseDltLines(line)) {
      const formatted = formatDltLine(ticketLine);
      if (seen.has(formatted)) continue;
      seen.add(formatted);
      parsed.push(formatted);
    }
  }
  if (!parsed.length) {
    const numbers = String(text || "").match(/\d{1,2}/g)?.map(Number).filter(Number.isFinite) || [];
    for (let index = 0; index <= numbers.length - 7; index += 1) {
      const front = numbers.slice(index, index + 5);
      const back = numbers.slice(index + 5, index + 7);
      if (
        front.every((n) => n >= 1 && n <= 35) &&
        back.every((n) => n >= 1 && n <= 12) &&
        new Set(front).size === 5 &&
        new Set(back).size === 2
      ) {
        const formatted = formatDltLine({
          front: [...front].sort((a, b) => a - b),
          back: [...back].sort((a, b) => a - b)
        });
        if (!seen.has(formatted)) {
          seen.add(formatted);
          parsed.push(formatted);
        }
      }
    }
  }
  return parsed.length ? parsed.join("\n") : cleanedLines.join("\n");
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
}

async function preprocessDltPhoto(file) {
  const img = await fileToImage(file);
  const maxWidth = 1600;
  const scale = Math.min(3, Math.max(1.5, maxWidth / Math.max(img.width, 1)));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    sum += gray;
  }
  const avg = sum / (data.length / 4);
  const threshold = Math.max(118, Math.min(178, avg * 0.9));
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const boosted = gray < threshold ? 0 : 255;
    data[i] = boosted;
    data[i + 1] = boosted;
    data[i + 2] = boosted;
  }
  ctx.putImageData(imageData, 0, 0);

  return await new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob || file), "image/png");
  });
}

function renderDltPhotoPreview(file, message = "") {
  if (!dltPhotoPreview) return;
  selectedDltPhotoFile = file || null;
  if (dltPhotoObjectUrl) URL.revokeObjectURL(dltPhotoObjectUrl);
  dltPhotoObjectUrl = file ? URL.createObjectURL(file) : "";
  dltPhotoPreview.innerHTML = file
    ? `<img src="${dltPhotoObjectUrl}" alt="大乐透票据照片预览" /><span>${message || "照片已载入，点击“识别照片号码”。"}</span>`
    : `<span>${message || "选择或拍摄大乐透票据照片后，系统会先预览，再识别号码。"}</span>`;
}

async function recognizeDltPhoto() {
  const file = selectedDltPhotoFile || dltCameraPhoto?.files?.[0] || dltGalleryPhoto?.files?.[0];
  if (!file) {
    renderDltPhotoPreview(null, "请先选择或拍摄一张大乐透票据照片。");
    return;
  }
  if (!window.Tesseract?.recognize) {
    renderDltPhotoPreview(file, "OCR 组件未加载。可以先手动输入号码，或刷新页面后再识别。");
    return;
  }
  if (ocrDltPhoto) {
    ocrDltPhoto.disabled = true;
    ocrDltPhoto.dataset.originalText = ocrDltPhoto.textContent;
    ocrDltPhoto.textContent = "识别中";
  }
  try {
    if (ocrDltPhoto) ocrDltPhoto.textContent = "增强图片";
    const processedFile = await preprocessDltPhoto(file);
    if (ocrDltPhoto) ocrDltPhoto.textContent = "识别中";
    const result = await window.Tesseract.recognize(processedFile, "eng", {
      tessedit_char_whitelist: "0123456789+ ",
      tessedit_pageseg_mode: "6",
      logger: (progress) => {
        if (ocrDltPhoto && progress.status) {
          const pct = progress.progress ? ` ${Math.round(progress.progress * 100)}%` : "";
          ocrDltPhoto.textContent = `识别中${pct}`;
        }
      }
    });
    const normalized = normalizeDltOcrText(result?.data?.text || "");
    if (dltImport) dltImport.value = normalized;
    const lines = parseDltLines(normalized);
    renderDltPhotoPreview(file, lines.length ? `识别到 ${lines.length} 注，请核对后导入。` : "未识别到完整号码，请在下方手动校正。");
    if (lines.length) {
      const unitCost = dltAppend?.checked ? 3 : 2;
      const plan = { lines, unitCost, append: Boolean(dltAppend?.checked), amount: lines.length * unitCost };
      window.__currentDltPlan = plan;
      renderDltPlan(plan, "照片号码已识别，请核对无误后保存入库");
    }
  } catch (error) {
    console.error(error);
    renderDltPhotoPreview(file, "照片识别失败。请换一张更清晰的照片，或手动输入号码。");
  } finally {
    if (ocrDltPhoto) {
      ocrDltPhoto.disabled = false;
      ocrDltPhoto.textContent = ocrDltPhoto.dataset.originalText || "识别照片号码";
      delete ocrDltPhoto.dataset.originalText;
    }
  }
}

function formatDltLine(line) {
  return `${line.front.map(pad2).join(" ")} + ${line.back.map(pad2).join(" ")}`;
}

function dltFrequency() {
  const front = Object.fromEntries(rangeNumbers(35).map((n) => [n, 0]));
  const back = Object.fromEntries(rangeNumbers(12).map((n) => [n, 0]));
  for (const record of readDltLedger()) {
    for (const line of record.lines || []) {
      for (const n of line.front || []) front[n] += 1;
      for (const n of line.back || []) back[n] += 1;
    }
    if (record.draw) {
      for (const n of record.draw.front || []) front[n] += 2;
      for (const n of record.draw.back || []) back[n] += 2;
    }
  }
  return { front, back };
}

function weightedPick(pool, count, freq, mode) {
  const selected = [];
  const available = [...pool];
  while (selected.length < count && available.length) {
    const weights = available.map((n) => {
      const f = Number(freq[n] || 0);
      const base = mode === "hot" ? 1 + f : mode === "cold" ? 1 / (1 + f) : 1 + Math.min(f, 3) * 0.25;
      const balance = selected.length && selected.some((x) => Math.abs(x - n) <= 1) ? 0.55 : 1;
      return base * balance;
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = Math.random() * total;
    let index = 0;
    for (; index < available.length; index += 1) {
      cursor -= weights[index];
      if (cursor <= 0) break;
    }
    selected.push(available[index]);
    available.splice(index, 1);
  }
  return selected.sort((a, b) => a - b);
}

function balancedFrontPool() {
  return [
    ...rangeNumbers(12),
    ...rangeNumbers(12).map((n) => n + 12),
    ...rangeNumbers(11).map((n) => n + 24)
  ];
}

function generateDltLines() {
  const unitCost = dltAppend?.checked ? 3 : 2;
  const budget = Math.max(unitCost, Math.round(Number(dltBudget?.value || 10) / unitCost) * unitCost);
  const count = Math.max(1, Math.min(20, Math.floor(budget / unitCost)));
  if (dltBudget) dltBudget.value = String(count * unitCost);
  const mode = dltMode?.value || "balanced";
  const freq = dltFrequency();
  const lines = [];
  const seen = new Set();
  let guard = 0;
  while (lines.length < count && guard < 300) {
    guard += 1;
    const front = weightedPick(balancedFrontPool(), 5, freq.front, mode);
    const back = weightedPick(rangeNumbers(12), 2, freq.back, mode);
    const key = `${front.join("-")}+${back.join("-")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({ front, back });
  }
  return { lines, unitCost, append: Boolean(dltAppend?.checked), amount: lines.length * unitCost };
}

function dltHitLevel(line, draw) {
  const frontHits = line.front.filter((n) => draw.front.includes(n)).length;
  const backHits = line.back.filter((n) => draw.back.includes(n)).length;
  const key = `${frontHits}+${backHits}`;
  const levelMap = {
    "5+2": "一等奖",
    "5+1": "二等奖",
    "5+0": "三等奖",
    "4+2": "三等奖",
    "4+1": "四等奖",
    "3+2": "五等奖",
    "4+0": "五等奖",
    "3+1": "六等奖",
    "2+2": "六等奖",
    "3+0": "七等奖",
    "2+1": "七等奖",
    "1+2": "七等奖",
    "0+2": "七等奖"
  };
  return { frontHits, backHits, level: levelMap[key] || "未中" };
}

function renderDltPlan(plan, banner = "") {
  if (!dltOutput) return;
  if (!plan?.lines?.length) {
    dltOutput.innerHTML = `<div class="empty-state">没有可用大乐透方案。</div>`;
    return;
  }
  dltOutput.innerHTML = `
    ${banner ? `<div class="save-banner">${banner}</div>` : ""}
    <div class="plan-summary">
      <strong>${plan.lines.length} 注 / ${yen(plan.amount)}</strong>
      <span>${plan.append ? "含追加，每注 3 元" : "基本投注，每注 2 元"}。热冷只按本机已入库记录统计，不代表开奖概率会提高。</span>
    </div>
    ${plan.lines
      .map(
        (line, index) => `
          <article class="lotto-ticket">
            <span class="label">第 ${index + 1} 注</span>
            <div class="balls">
              ${line.front.map((n) => `<span class="ball front">${pad2(n)}</span>`).join("")}
              <b>+</b>
              ${line.back.map((n) => `<span class="ball back">${pad2(n)}</span>`).join("")}
            </div>
          </article>
        `
      )
      .join("")}
  `;
}

function renderDltHistory() {
  if (!dltHistory) return;
  const records = readDltLedger().slice(-8).reverse();
  dltHistory.innerHTML = records.length
    ? records
        .map((record) => {
          const result = record.result ? `｜${record.result.summary}` : "｜未开奖";
          return `
            <article class="source-item">
              <span>${record.createdAt}</span>
              <strong>${record.lines.length} 注 / ${yen(record.amount)}${record.append ? " / 追加" : ""}</strong>
              <p>${record.lines.map(formatDltLine).join("； ")}${result}</p>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state">还没有大乐透票据记录。</div>`;
}

function currentDltPlanFromOutput() {
  return window.__currentDltPlan || null;
}

function saveDltPlan(plan, banner = "已保存大乐透票据") {
  if (!plan?.lines?.length) return;
  const record = {
    id: `dlt-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: todayKey(),
    game: "超级大乐透",
    append: plan.append,
    amount: plan.amount,
    unitCost: plan.unitCost,
    lines: plan.lines,
    status: "pending"
  };
  writeDltLedger([...readDltLedger(), record]);
  renderDltPlan(plan, banner);
  renderDltHistory();
}

function settleDltTickets(draw) {
  const ledger = readDltLedger();
  let settledCount = 0;
  for (const record of ledger) {
    if (record.status !== "pending") continue;
    const hits = record.lines.map((line) => dltHitLevel(line, draw));
    const wins = hits.filter((hit) => hit.level !== "未中");
    record.status = "settled";
    record.settledAt = todayKey();
    record.draw = draw;
    record.result = {
      hits,
      summary: wins.length ? `${wins.length} 注命中：${wins.map((hit) => `${hit.level}(${hit.frontHits}+${hit.backHits})`).join("、")}` : "全部未中"
    };
    settledCount += 1;
  }
  writeDltLedger(ledger);
  renderDltHistory();
  if (dltOutput) {
    dltOutput.insertAdjacentHTML("afterbegin", `<div class="save-banner">已复盘 ${settledCount} 张大乐透票：${formatDltLine(draw)}</div>`);
  }
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

function applyLearning(options) {
  return options.map((item) => ({
    ...item,
    score: Math.max(0, item.score + learnedScoreBoost(item.category))
  }));
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

function planReturnMultiple(items) {
  const stake = items.reduce((sum, item) => sum + Number(item.stake || 0), 0);
  const maxReturn = items.reduce((sum, item) => sum + Number(item.stake || 0) * Number(item.odds || 0), 0);
  return stake ? maxReturn / stake : 0;
}

function selectTwoXPortfolio(candidates, budget, wanted, matchCount) {
  const maxPerMatch = Math.max(2, Math.ceil(wanted / matchCount));
  for (let count = wanted; count >= 1; count -= 1) {
    const selected = selectPortfolio(candidates, count, maxPerMatch);
    if (!selected.length) continue;
    const stakes = allocateWeightedBudget(budget, selected);
    const withStakes = selected.map((item, index) => ({ ...item, stake: stakes[index] }));
    if (planReturnMultiple(withStakes) >= MIN_PLAN_RETURN_MULTIPLE) return { selected, stakes };
  }
  return { selected: [], stakes: [] };
}

function buildPlan() {
  const sale = saleWindow();
  if (saleStatus) saleStatus.textContent = sale.text;
  if (!sale.isOpen) {
    state.currentPlan = [];
    planOutput.innerHTML = `<div class="empty-state">${sale.text}。为了避免日本时间和中国时间混淆，当前不生成买入方案。</div>`;
    topPick.textContent = "停售中";
    return;
  }

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
  const candidates = applyLearning((state.data.upcoming || []).flatMap(marketOptionsFor))
    .filter((item) => item.odds >= 1.75 && item.score >= MIN_OPTION_SCORE)
    .sort((a, b) => b.score - a.score);
  const matchCount = new Set((state.data.upcoming || []).map((match) => match.id)).size || 1;
  const { selected, stakes } = selectTwoXPortfolio(candidates, budget, wanted, matchCount);

  if (!selected.length) {
    state.currentPlan = [];
    planOutput.innerHTML = `<div class="empty-state">当前没有达到高胜率与 2 倍理论返还阈值的买入方案。建议 PASS，不要为了下注而下注。</div>`;
    topPick.textContent = "全部 PASS";
    return;
  }

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
    planOutput.innerHTML = `<div class="empty-state">输入预算后点击“生成买入方案”。</div>`;
    return;
  }

  const total = state.currentPlan.reduce((sum, item) => sum + item.stake, 0);
  const maxReturn = state.currentPlan.reduce((sum, item) => sum + item.stake * item.odds, 0);
  const multiple = total ? maxReturn / total : 0;
  topPick.textContent = `${state.currentPlan[0].match} ${state.currentPlan[0].market} ${state.currentPlan[0].pick}`;
  planOutput.innerHTML = `
    <div class="plan-summary">
      <strong>预算 ${yen(total)}</strong>
      <span>共 ${state.currentPlan.length} 单，理论最高返还 ${yen(maxReturn)}，返还倍数 ${multiple.toFixed(2)}x</span>
      <span>规则：只生成理论返还至少 2.00x 且评分达标的买入方案；达不到就 PASS。</span>
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
  const stat = categoryStats()[item.category || item.market || "unknown"];
  const statText = stat && stat.total >= 3 ? ` 当前玩法历史 ${stat.wins}/${stat.total}。` : "";
  if (item.status === "win") {
    return `${item.match} 命中 ${item.market} ${item.pick}，投入 ${yen(item.stake)}，返还 ${yen(item.returned)}。${statText}下次保持同等仓位，不加码追热。`;
  }
  return `${item.match} 未中 ${item.market} ${item.pick}，亏损 ${yen(item.stake)}。${statText}复盘重点：该玩法是否应降权，下一单降低同类玩法仓位。`;
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
      : `kt 快照过期：${safeDate(state.data.generatedAt)} 更新，${freshnessLabel()}，需后台重新抓取`;
  } catch (error) {
    dataStatus.textContent = "kt 当前页读取失败";
    console.error(error);
  }
  renderMatches();
  if (saleStatus) saleStatus.textContent = saleWindow().text;
  buildPlan();
  renderLedger();
}

async function refreshAllData() {
  const buttons = [refreshData, refreshDataHero].filter(Boolean);
  buttons.forEach((button) => {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.textContent = "刷新中";
  });
  if (dataStatus) dataStatus.textContent = "正在读取已发布快照";
  try {
    await loadData();
    renderDltReminder();
    renderDltHistory();
    if (planOutput) {
      planOutput.querySelector("[data-refresh-banner]")?.remove();
      planOutput.insertAdjacentHTML("afterbegin", `<div class="save-banner">已重新读取已发布快照。手机端按钮不能直接抓取 kt 实时页；足球实时更新需要后台任务先抓取并发布 live-matches.json。</div>`);
      planOutput.firstElementChild?.setAttribute("data-refresh-banner", "true");
    }
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
      button.textContent = button.dataset.originalText || "刷新快照";
      delete button.dataset.originalText;
    });
  }
}

generatePlan.addEventListener("click", buildPlan);
savePlan.addEventListener("click", saveCurrentPlan);
refreshData?.addEventListener("click", refreshAllData);
refreshDataHero?.addEventListener("click", refreshAllData);
dltCameraPhoto?.addEventListener("change", () => renderDltPhotoPreview(dltCameraPhoto.files?.[0] || null, "照片已载入，点击“识别照片号码”。"));
dltGalleryPhoto?.addEventListener("change", () => renderDltPhotoPreview(dltGalleryPhoto.files?.[0] || null, "照片已载入，点击“识别照片号码”。"));
ocrDltPhoto?.addEventListener("click", recognizeDltPhoto);
riskMode.addEventListener("change", buildPlan);
settleWin.addEventListener("click", () => settle("win"));
settleLose.addEventListener("click", () => settle("lose"));
exportBill.addEventListener("click", exportMonthlyBill);
generateDlt?.addEventListener("click", () => {
  const plan = generateDltLines();
  window.__currentDltPlan = plan;
  renderDltPlan(plan);
});
saveDlt?.addEventListener("click", () => {
  const plan = currentDltPlanFromOutput() || generateDltLines();
  window.__currentDltPlan = plan;
  saveDltPlan(plan);
});
dltMode?.addEventListener("change", () => {
  const plan = generateDltLines();
  window.__currentDltPlan = plan;
  renderDltPlan(plan);
});
dltAppend?.addEventListener("change", () => {
  const plan = generateDltLines();
  window.__currentDltPlan = plan;
  renderDltPlan(plan);
});
sampleDlt?.addEventListener("click", () => {
  dltImport.value = DLT_SAMPLE_TICKET;
});
importDlt?.addEventListener("click", () => {
  const lines = parseDltLines(dltImport.value);
  const unitCost = dltAppend?.checked ? 3 : 2;
  const plan = { lines, unitCost, append: Boolean(dltAppend?.checked), amount: lines.length * unitCost };
  window.__currentDltPlan = plan;
  renderDltPlan(plan, lines.length ? "已识别票据号码，可保存入库" : "没有识别到有效大乐透号码");
});
settleDlt?.addEventListener("click", () => {
  const [draw] = parseDltLines(dltDraw.value);
  if (!draw) {
    dltOutput?.insertAdjacentHTML("afterbegin", `<div class="empty-state">开奖号格式不正确，请输入 5 个前区 + 2 个后区。</div>`);
    return;
  }
  settleDltTickets(draw);
});

loadData();
renderDltHistory();
renderDltReminder();
setInterval(renderDltReminder, 60000);
