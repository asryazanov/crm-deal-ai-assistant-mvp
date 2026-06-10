import fs from "node:fs";

const regions = ["Москва", "Северо-Запад", "Урал", "Сибирь и Дальний Восток", "Юг", "Поволжье"];
const partners = ["Softline", "КРОК", "ЛАНИТ", "Диалог ИТ", "Техносерв", "Инфосистемы Джет", "Ай-Теко", "IBS", "ГК Астра", "X-Com", "OCS", "Марвел", "Treolan", "НОРБИТ", "РТК-ЦОД", "ФОРС Дистрибуция", "Компьютел", "Систематика", "Т1 Интеграция", "ИнфоТеКС"];
const vendors = ["Группа Астра", "РЕД СОФТ", "Базис", "Кибер Бэкап", "Код Безопасности", "UserGate", "Positive Technologies", "InfoWatch", "СёрчИнформ", "МойОфис", "Postgres Professional", "Р7-Офис", "Аквариус", "YADRO", "Kaspersky", "Security Vision", "Гарда Технологии", "НТЦ ИТ РОСА"];
const pams = ["Морозова Т.И.", "Лебедева О.В.", "Зайцев П.Г.", "Волков С.Р.", "Кузнецова А.М.", "Соколова Е.В."];
const sdms = ["Орлова Т.Н.", "Фролов А.И.", "Петров Д.С.", "Иванова М.К.", "Смирнов Р.А."];
const sales = ["Алексеев В.Н.", "Громова Н.С.", "Никитин П.А.", "Романова Е.Д.", "Ковалёв И.С.", "Беляева М.П.", "Егоров А.В.", "Макарова Ю.Л."];
const products = ["Корпоративная платформа", "Инфраструктура", "Резервное копирование", "ИБ периметра", "DLP / контроль данных", "Офисный пакет", "СУБД", "Виртуализация", "Серверное оборудование", "SOC / мониторинг"];
const stages = ["Квалификация", "Интерес / Намерение", "Подготовка сделки / Presale", "Переговоры", "Коммерческое предложение", "Закрытие"];
const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
const monthWeights = {
  "2026-01": 5,
  "2026-02": 5,
  "2026-03": 6,
  "2026-04": 6,
  "2026-05": 7,
  "2026-06": 24,
  "2026-07": 8,
  "2026-08": 7,
  "2026-09": 8,
  "2026-10": 8,
  "2026-11": 8,
  "2026-12": 8
};
const monthPlanTotal = 600_000_000;
const salesMonthPlans = [90, 82, 78, 74, 72, 70, 68, 66].map((value) => value * 1_000_000);
const monthPlanRatio = {
  "2026-01": 0.62,
  "2026-02": 0.70,
  "2026-03": 0.78,
  "2026-04": 0.80,
  "2026-05": 0.86,
  "2026-06": 1.00,
  "2026-07": 0.92,
  "2026-08": 0.86,
  "2026-09": 1.05,
  "2026-10": 1.35,
  "2026-11": 1.45,
  "2026-12": 2.20
};

let seed = 42;
function random() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

function pick(items) {
  return items[Math.floor(random() * items.length)];
}

function weightedMonth() {
  const total = Object.values(monthWeights).reduce((acc, value) => acc + value, 0);
  let cursor = random() * total;
  for (const [month, weight] of Object.entries(monthWeights)) {
    cursor -= weight;
    if (cursor <= 0) return month;
  }
  return "2026-06";
}

function roundTo(value, step = 100_000) {
  return Math.round(value / step) * step;
}

function amountFor(month, index) {
  const isEnterprise = random() > 0.82;
  const isMid = random() > 0.42;
  let base = isEnterprise
    ? 75_000_000 + random() * 185_000_000
    : isMid
      ? 12_000_000 + random() * 55_000_000
      : 1_500_000 + random() * 10_000_000;
  if (month.startsWith("2026-10") || month.startsWith("2026-11") || month.startsWith("2026-12")) base *= 1.25;
  if (index % 13 === 0) base *= 1.8;
  return roundTo(base);
}

function statusFor(month, index) {
  if (month === "2026-04" || month === "2026-05") return random() < 0.58 ? "Выиграна" : random() < 0.78 ? "В работе" : random() < 0.9 ? "Проиграна" : "Отменена";
  if (month < "2026-06") return random() < 0.68 ? "Выиграна" : random() < 0.82 ? "Проиграна" : "Отменена";
  if (month === "2026-06") return random() < 0.34 ? "Выиграна" : random() < 0.78 ? "В работе" : random() < 0.9 ? "Проиграна" : "Отменена";
  return random() < 0.87 ? "В работе" : random() < 0.94 ? "Проиграна" : "Отменена";
}

function probabilityFor(status, stage, riskScore, transferCount, cpExpired, lastActivityDays) {
  if (status === "Выиграна") return 92 + Math.floor(random() * 7);
  if (status === "Проиграна") return 8 + Math.floor(random() * 18);
  if (status === "Отменена") return 5 + Math.floor(random() * 12);
  const stageBase = {
    "Квалификация": 22,
    "Интерес / Намерение": 32,
    "Подготовка сделки / Presale": 42,
    "Переговоры": 53,
    "Коммерческое предложение": 61,
    "Закрытие": 72
  }[stage] || 40;
  let score = stageBase + Math.round((random() - 0.45) * 18);
  score -= riskScore * 5;
  score -= transferCount * 4;
  if (cpExpired) score -= 9;
  if (lastActivityDays > 21) score -= 11;
  return Math.max(8, Math.min(86, score));
}

function risksFor({ status, transferCount, cpExpired, lastActivityDays, partnerConversion, amount }) {
  const risks = [];
  if (transferCount >= 3) risks.push("Системные переносы даты закрытия");
  if (cpExpired) risks.push("Истёк срок КП");
  if (lastActivityDays > 21) risks.push("Нет активности по сделке");
  if (partnerConversion < 38) risks.push("Низкая конверсия партнёра");
  if (amount > 60_000_000 && random() > 0.54) risks.push("Не подтверждён бюджет");
  if (status === "В работе" && random() > 0.72) risks.push("Нужна поддержка вендора");
  return risks.slice(0, 4);
}

function closeHistory(month, transferCount) {
  return Array.from({ length: transferCount }, (_, index) => {
    const fromMonth = months[Math.max(0, months.indexOf(month) - transferCount + index)];
    return {
      from: `${fromMonth}-25`,
      to: `${month}-25`,
      reason: ["Бюджет переносится", "Ожидаем решение заказчика", "Не готово КП", "Зависимость от вендора"][index % 4]
    };
  });
}

function healthFor(riskScore, probability, status) {
  if (status !== "В работе") return status === "Выиграна" ? "green" : "red";
  if (riskScore >= 4 || probability < 35) return "red";
  if (riskScore >= 2 || probability < 55) return "yellow";
  return "green";
}

function burnoutFor(riskScore, lastActivityDays, cpExpired, transferCount) {
  if (cpExpired || transferCount >= 3 || lastActivityDays > 24 || riskScore >= 4) return "Высокий";
  if (lastActivityDays > 10 || transferCount || riskScore >= 2) return "Средний";
  return "Низкий";
}

function closeMonthFor(status, month) {
  if (status === "В работе") return null;
  return month;
}

function deal(index) {
  const month = weightedMonth();
  const status = statusFor(month, index);
  const stage = status === "Выиграна"
    ? pick(["Коммерческое предложение", "Закрытие", "Переговоры"])
    : status === "В работе"
      ? pick(stages)
      : pick(["Квалификация", "Интерес / Намерение", "Подготовка сделки / Presale", "Переговоры", "Коммерческое предложение"]);
  const amount = amountFor(month, index);
  const partnerConversion = 28 + Math.floor(random() * 55);
  const transferCount = status === "В работе" ? Math.floor(random() * 5) : Math.floor(random() * 4);
  const lastActivityDays = status === "В работе" ? Math.floor(random() * 34) : 8 + Math.floor(random() * 55);
  const cpAgeDays = stage === "Квалификация" ? null : 4 + Math.floor(random() * 55);
  const cpValidDays = 30;
  const cpExpired = Boolean(cpAgeDays && cpAgeDays > cpValidDays);
  const roughRisks = risksFor({ status, transferCount, cpExpired, lastActivityDays, partnerConversion, amount });
  const riskScore = roughRisks.length;
  const probability = probabilityFor(status, stage, riskScore, transferCount, cpExpired, lastActivityDays);
  const aiForecast = status === "В работе" ? roundTo(amount * probability / 100) : 0;
  const managerProbability = status === "В работе"
    ? Math.min(95, probability + 8 + (random() > 0.72 ? 18 : Math.floor(random() * 10)))
    : probability;
  const managerForecast = status === "В работе" ? roundTo(amount * managerProbability / 100) : 0;
  const wonShipment = status === "Выиграна" ? roundTo(amount * (0.88 + random() * 0.18)) : 0;
  const health = healthFor(riskScore, probability, status);
  return {
    id: `VSD-${String(index).padStart(4, "0")}`,
    status,
    stage,
    region: pick(regions),
    partner: pick(partners),
    vendor: pick(vendors),
    pam: pick(pams),
    sdm: pick(sdms),
    sale: sales[index % sales.length],
    product: pick(products),
    amount,
    probability,
    health,
    risks: roughRisks,
    riskScore,
    transferCount,
    plannedMonth: month,
    closeMonth: closeMonthFor(status, month),
    closeDateHistory: closeHistory(month, transferCount),
    lastActivityDays,
    activityCount: status === "В работе" ? 2 + Math.floor(random() * 18) : 1 + Math.floor(random() * 14),
    cpAgeDays,
    cpValidDays,
    cpExpired,
    shipmentAmount: wonShipment,
    lastShipmentDays: wonShipment ? 3 + Math.floor(random() * 150) : null,
    partnerConversion,
    burnoutRisk: burnoutFor(riskScore, lastActivityDays, cpExpired, transferCount),
    aiForecast,
    managerForecast
  };
}

let deals = Array.from({ length: 100 }, (_, index) => deal(index + 1));

function calibrateJune() {
  const juneWon = deals.filter((item) => item.plannedMonth === "2026-06" && item.status === "Выиграна");
  const juneOpen = deals.filter((item) => item.plannedMonth === "2026-06" && item.status === "В работе");
  const wonTarget = 380_000_000;
  const aiTarget = 160_000_000;
  const pipelineTarget = 1_350_000_000;
  const managerTarget = 240_000_000;
  const wonSum = juneWon.reduce((acc, item) => acc + item.shipmentAmount, 0);
  const openAmountSum = juneOpen.reduce((acc, item) => acc + item.amount, 0);
  if (wonSum > 0) {
    const factor = wonTarget / wonSum;
    juneWon.forEach((item) => {
      item.amount = roundTo(item.amount * factor);
      item.shipmentAmount = roundTo(item.shipmentAmount * factor);
    });
  }
  if (openAmountSum > 0) {
    const amountFactor = pipelineTarget / openAmountSum;
    juneOpen.forEach((item) => {
      item.amount = roundTo(item.amount * amountFactor);
    });
    const adjustedAmount = juneOpen.reduce((acc, item) => acc + item.amount, 0);
    juneOpen.forEach((item) => {
      const share = item.amount / adjustedAmount;
      item.aiForecast = roundTo(aiTarget * share);
      item.managerForecast = roundTo(managerTarget * share);
      item.probability = Math.max(8, Math.min(38, Math.round(item.aiForecast / Math.max(item.amount, 1) * 100)));
      item.health = item.probability < 20 || item.riskScore >= 3 ? "red" : "yellow";
      item.burnoutRisk = "Высокий";
    });
  }
}

calibrateJune();

function calibrateWon(monthList, targetFact) {
  const rows = deals.filter((item) => monthList.includes(item.plannedMonth) && item.status === "Выиграна");
  const current = rows.reduce((acc, item) => acc + item.shipmentAmount, 0);
  if (!current) return;
  const factor = targetFact / current;
  rows.forEach((item) => {
    item.amount = roundTo(item.amount * factor);
    item.shipmentAmount = roundTo(item.shipmentAmount * factor);
  });
}

function calibrateOpen(monthList, targetPipeline, targetAi, targetManager) {
  const rows = deals.filter((item) => monthList.includes(item.plannedMonth) && item.status === "В работе");
  const current = rows.reduce((acc, item) => acc + item.amount, 0);
  if (!current) return;
  const factor = targetPipeline / current;
  rows.forEach((item) => {
    item.amount = roundTo(item.amount * factor);
  });
  const adjusted = rows.reduce((acc, item) => acc + item.amount, 0);
  rows.forEach((item) => {
    const share = item.amount / adjusted;
    item.aiForecast = roundTo(targetAi * share);
    item.managerForecast = roundTo(targetManager * share);
    item.probability = Math.max(8, Math.min(72, Math.round(item.aiForecast / Math.max(item.amount, 1) * 100)));
    item.health = healthFor(item.riskScore, item.probability, item.status);
    item.burnoutRisk = burnoutFor(item.riskScore, item.lastActivityDays, item.cpExpired, item.transferCount);
  });
}

calibrateWon(["2026-04", "2026-05"], 670_000_000);
calibrateOpen(["2026-04", "2026-05"], 700_000_000, 260_000_000, 330_000_000);
calibrateWon(["2026-01", "2026-02", "2026-03"], 2_270_000_000);
calibrateOpen(["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"], 7_000_000_000, 2_000_000_000, 2_800_000_000);

const plans = [];
sales.forEach((name, index) => {
  const monthPlan = salesMonthPlans[index];
  plans.push({ role: "Руководитель продаж", name, period: "month", plan: monthPlan });
  plans.push({ role: "Руководитель продаж", name, period: "quarter", plan: Math.round(monthPlan * 2.67) });
  plans.push({ role: "Руководитель продаж", name, period: "year", plan: monthPlan * 10 });
});
pams.forEach((name, index) => {
  const monthPlan = [98, 92, 88, 84, 80, 78][index] * 1_000_000;
  plans.push({ role: "PAM", name, period: "month", plan: monthPlan });
  plans.push({ role: "PAM", name, period: "quarter", plan: Math.round(monthPlan * 2.67) });
  plans.push({ role: "PAM", name, period: "year", plan: monthPlan * 10 });
});
sdms.forEach((name, index) => {
  const monthPlan = [92, 88, 84, 80, 76][index] * 1_000_000;
  plans.push({ role: "SDM", name, period: "month", plan: monthPlan });
  plans.push({ role: "SDM", name, period: "quarter", plan: Math.round(monthPlan * 2.67) });
  plans.push({ role: "SDM", name, period: "year", plan: monthPlan * 10 });
});
plans.push({ role: "Руководитель SDM", name: "Климова Р.С.", period: "month", plan: 420_000_000 });
plans.push({ role: "Руководитель SDM", name: "Климова Р.С.", period: "quarter", plan: 1_120_000_000 });
plans.push({ role: "Руководитель SDM", name: "Климова Р.С.", period: "year", plan: 4_200_000_000 });

const payload = {
  generatedAt: "2026-06-10",
  planningNotes: {
    currentMonth: "2026-06",
    currentQuarter: "2026-Q2",
    year: "2026",
    q4PlanShare: "50%",
    forecastRule: "Факт 1С + сумма открытых ВС × вероятность AI внутри выбранного периода"
  },
  regions,
  partners,
  vendors,
  pams,
  sdms,
  sales,
  deals,
  plans
};

fs.writeFileSync("data/v2-data.js", `window.V2_DEMO_DATA = ${JSON.stringify(payload, null, 2)};\n`);
