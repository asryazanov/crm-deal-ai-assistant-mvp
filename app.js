const FIELD = {
  id: "ID сделки",
  createdAt: "Дата создания",
  manager: "Менеджер Axoft",
  client: "Клиент",
  industry: "Отрасль",
  segment: "Сегмент клиента",
  vendor: "Вендор",
  product: "Продукт / Решение",
  partner: "Партнёр",
  stage: "Стадия воронки",
  amount: "Сумма сделки (руб.)",
  marginPercent: "Маржа (%)",
  ageDays: "Возраст сделки (дней)",
  vendorProtection: "Защита сделки (регистрация у вендора)",
  pilot: "Наличие пилота",
  presaleRequest: "Заявка на пресейл",
  decisionMaker: "Наличие ЛПР",
  budget: "Статус бюджета",
  silenceDays: "Дней без коммуникации",
  managerConfidence: "Уверенность менеджера",
  partnerMeetingDays: "Встреча с партнёром (дней назад)",
  partnerWinRate: "Win rate партнёра (%)",
  partnerRole: "Роль партнёра в сделке",
  partnerContact: "Контакт партнёра заполнен",
  bdm: "BDM в команде",
  bdmName: "Имя BDM",
  engineer: "Инженер / Presale в команде",
  engineerName: "Имя инженера",
  teamCount: "Кол-во участников команды",
  pairHistory: "История связки Партнёр-Клиент (% выигранных)",
  newClient: "Новый клиент",
  clientHistory: "История клиента с Axoft (млн руб.)",
  result: "Результат сделки",
  oldProbability: "Вероятность закрытия (%)",
  oldPriority: "Приоритет сделки",
  oldRecommendation: "Рекомендации ИИ"
};

const stageWeights = {
  "Интерес / Намерение": -8,
  "Квалификация": -4,
  "Подготовка сделки / Presale": 3,
  "Коммерческое предложение": 8,
  "Переговоры": 12,
  "Закрытие": 18
};

const segmentWeights = {
  "SMB": 0,
  "Mid-Market": 1,
  "Enterprise": 3,
  "EPG+": 5
};

const state = {
  deals: [],
  scored: [],
  selectedId: null,
  search: "",
  health: "all"
};

const formatRub = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0
});

const formatNumber = new Intl.NumberFormat("ru-RU");

function yes(value) {
  return String(value || "").trim().toLowerCase() === "да";
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function addFactor(factors, name, delta, group) {
  if (delta !== 0) {
    factors.push({ name, delta, group });
  }
}

function addRisk(risks, severity, title, detail) {
  risks.push({ severity, title, detail });
}

function amountWeight(amount) {
  if (amount >= 100000000) return 4;
  if (amount >= 50000000) return 3;
  if (amount >= 5000000) return 1;
  return 0;
}

function marginWeight(margin) {
  if (margin >= 8) return 2;
  if (margin < 6) return -2;
  return 0;
}

function ageWeight(days) {
  if (days > 180) return -8;
  if (days > 120) return -4;
  if (days > 60) return -2;
  return 0;
}

function communicationWeight(days) {
  if (days <= 7) return 6;
  if (days <= 14) return 1;
  if (days <= 21) return -10;
  return -18;
}

function partnerMeetingWeight(days) {
  if (days <= 14) return 3;
  if (days <= 30) return -3;
  return -7;
}

function winRateWeight(rate) {
  if (rate >= 75) return 10;
  if (rate >= 60) return 6;
  if (rate >= 40) return 0;
  if (rate >= 25) return -6;
  return -10;
}

function pairHistoryWeight(rate) {
  if (rate >= 70) return 13;
  if (rate >= 50) return 7;
  if (rate >= 25) return 0;
  if (rate > 0) return -5;
  return -8;
}

function clientHistoryWeight(amountMln) {
  if (amountMln >= 200) return 5;
  if (amountMln >= 50) return 3;
  return 0;
}

function scoreDeal(deal) {
  const factors = [];
  const risks = [];
  let score = 50;

  const stage = deal[FIELD.stage];
  const stageDelta = stageWeights[stage] ?? 0;
  addFactor(factors, `Стадия: ${stage}`, stageDelta, "Основные параметры");

  const segmentDelta = segmentWeights[deal[FIELD.segment]] ?? 0;
  addFactor(factors, `Сегмент клиента: ${deal[FIELD.segment]}`, segmentDelta, "Основные параметры");

  const amount = number(deal[FIELD.amount]);
  const amountDelta = amountWeight(amount);
  addFactor(factors, `Сумма сделки: ${formatRub.format(amount)}`, amountDelta, "Основные параметры");

  const marginDelta = marginWeight(number(deal[FIELD.marginPercent]));
  addFactor(factors, `Маржа: ${deal[FIELD.marginPercent]}%`, marginDelta, "Основные параметры");

  const ageDays = number(deal[FIELD.ageDays]);
  const ageDelta = ageWeight(ageDays);
  addFactor(factors, `Возраст сделки: ${ageDays} дн.`, ageDelta, "Основные параметры");
  if (ageDays > 180) addRisk(risks, "high", "Сделка слишком долго в воронке", `Возраст сделки ${ageDays} дней. Нужна проверка актуальности и следующего шага.`);

  const vendorProtectionDelta = yes(deal[FIELD.vendorProtection]) ? 8 : -8;
  addFactor(factors, "Регистрация у вендора", vendorProtectionDelta, "Основные параметры");
  if (!yes(deal[FIELD.vendorProtection])) addRisk(risks, "high", "Нет защиты сделки у вендора", "Сделка не зарегистрирована у вендора, ниже шанс на эксклюзивную поддержку и спецусловия.");

  const pilotDelta = yes(deal[FIELD.pilot]) ? 15 : -6;
  addFactor(factors, "Пилотный проект", pilotDelta, "Основные параметры");
  if (!yes(deal[FIELD.pilot])) addRisk(risks, "medium", "Нет пилота", "Для сложной или крупной сделки пилот снижает технические и закупочные риски.");

  const presaleDelta = yes(deal[FIELD.presaleRequest]) ? 7 : -5;
  addFactor(factors, "Заявка на пресейл", presaleDelta, "Основные параметры");
  if (!yes(deal[FIELD.presaleRequest])) addRisk(risks, "medium", "Нет заявки на пресейл", "Техническая проработка не подтверждена в CRM.");

  const decisionMakerDelta = yes(deal[FIELD.decisionMaker]) ? 12 : -16;
  addFactor(factors, "Контакт ЛПР", decisionMakerDelta, "Качество проработки");
  if (!yes(deal[FIELD.decisionMaker])) addRisk(risks, "critical", "Не зафиксирован ЛПР", "В карточке сделки нет контакта лица, принимающего решение.");

  const budget = deal[FIELD.budget];
  const budgetDelta = budget === "Документ" ? 12 : budget === "Устное" ? 5 : -14;
  addFactor(factors, `Бюджет: ${budget}`, budgetDelta, "Качество проработки");
  if (budget === "Нет") addRisk(risks, "critical", "Бюджет не подтвержден", "Нет подтверждения бюджета клиента.");

  const silenceDays = number(deal[FIELD.silenceDays]);
  const silenceDelta = communicationWeight(silenceDays);
  addFactor(factors, `Ритм коммуникаций: ${silenceDays} дн.`, silenceDelta, "Качество проработки");
  if (silenceDays > 21) addRisk(risks, "critical", "Критически нарушен ритм коммуникаций", `${silenceDays} дней без обновлений по сделке.`);
  else if (silenceDays > 14) addRisk(risks, "high", "Нарушен ритм коммуникаций", `${silenceDays} дней без обновлений по сделке.`);

  const confidenceDelta = yes(deal[FIELD.managerConfidence]) ? 6 : -5;
  addFactor(factors, "Уверенность менеджера", confidenceDelta, "Качество проработки");

  const partnerMeetingDays = number(deal[FIELD.partnerMeetingDays]);
  const partnerMeetingDelta = partnerMeetingWeight(partnerMeetingDays);
  addFactor(factors, `Встреча с партнером: ${partnerMeetingDays} дн.`, partnerMeetingDelta, "Качество проработки");
  if (partnerMeetingDays > 30) addRisk(risks, "medium", "Давно не было встречи с партнером", `Последняя встреча была ${partnerMeetingDays} дней назад.`);

  const partnerWinRate = number(deal[FIELD.partnerWinRate]);
  const winRateDelta = winRateWeight(partnerWinRate);
  addFactor(factors, `Win rate партнера: ${partnerWinRate}%`, winRateDelta, "Партнер");
  if (partnerWinRate < 40) addRisk(risks, "high", "Слабая историческая результативность партнера", `Win rate партнера ${partnerWinRate}%.`);

  const partnerRole = deal[FIELD.partnerRole];
  const partnerRoleDelta = partnerRole === "Активный" ? 5 : partnerRole === "Генерация Axoft" ? 2 : -5;
  addFactor(factors, `Роль партнера: ${partnerRole}`, partnerRoleDelta, "Партнер");
  if (partnerRole === "Цена") addRisk(risks, "medium", "Роль партнера сведена к цене", "Партнер может не вести активную работу с клиентом.");

  const partnerContactDelta = yes(deal[FIELD.partnerContact]) ? 2 : -4;
  addFactor(factors, "Контакт партнера", partnerContactDelta, "Партнер");
  if (!yes(deal[FIELD.partnerContact])) addRisk(risks, "medium", "Не заполнен контакт партнера", "Нет базового контактного лица со стороны партнера.");

  const bdmDelta = yes(deal[FIELD.bdm]) ? 9 : -8;
  addFactor(factors, "BDM в команде", bdmDelta, "Команда Axoft");
  if (!yes(deal[FIELD.bdm])) addRisk(risks, "high", "Нет BDM в команде", "Нет поддержки вендорского направления и стратегической проработки.");

  const engineerDelta = yes(deal[FIELD.engineer]) ? 8 : -7;
  addFactor(factors, "Инженер / Presale", engineerDelta, "Команда Axoft");
  if (!yes(deal[FIELD.engineer])) addRisk(risks, "high", "Нет инженера / presale", "Техническая проработка сделки не подтверждена участником команды.");

  const teamCount = number(deal[FIELD.teamCount]);
  const teamDelta = teamCount >= 4 ? 4 : teamCount === 3 ? 2 : teamCount === 1 ? -4 : 0;
  addFactor(factors, `Команда сделки: ${teamCount} участн.`, teamDelta, "Команда Axoft");

  const pairHistory = number(deal[FIELD.pairHistory]);
  const pairHistoryDelta = pairHistoryWeight(pairHistory);
  addFactor(factors, `История партнер-клиент: ${pairHistory}%`, pairHistoryDelta, "Клиент и история");
  if (pairHistory < 25) addRisk(risks, "high", "Слабая история связки партнер-клиент", `История успешных сделок связки ${pairHistory}%.`);

  const newClientDelta = yes(deal[FIELD.newClient]) ? -2 : 0;
  addFactor(factors, "Новый клиент", newClientDelta, "Клиент и история");

  const clientHistoryDelta = clientHistoryWeight(number(deal[FIELD.clientHistory]));
  addFactor(factors, `История клиента с Axoft: ${deal[FIELD.clientHistory]} млн руб.`, clientHistoryDelta, "Клиент и история");

  score += factors.reduce((sum, factor) => sum + factor.delta, 0);
  const probability = Math.round(clamp(score, 5, 95));
  const criticalCount = risks.filter((risk) => risk.severity === "critical").length;
  const highCount = risks.filter((risk) => risk.severity === "high").length;
  const health = getHealth(probability, criticalCount, highCount);
  const priority = probability >= 70 ? "Высокий" : probability >= 45 ? "Средний" : "Низкий";

  return {
    deal,
    probability,
    priority,
    health,
    risks,
    factors,
    managerActions: buildManagerActions(deal, risks),
    leaderActions: buildLeaderActions(deal, risks, probability)
  };
}

function getHealth(probability, criticalCount, highCount) {
  if (probability < 45 || criticalCount >= 2 || highCount >= 3) return "red";
  if (probability >= 70 && criticalCount === 0 && highCount <= 1) return "green";
  return "yellow";
}

function buildManagerActions(deal, risks) {
  const actions = [];
  const hasRisk = (title) => risks.some((risk) => risk.title === title);

  if (hasRisk("Критически нарушен ритм коммуникаций") || hasRisk("Нарушен ритм коммуникаций")) {
    actions.push("Сегодня обновить текущую ситуацию по проекту и зафиксировать следующий контакт с партнером или клиентом.");
  }
  if (hasRisk("Не зафиксирован ЛПР")) {
    actions.push("Попросить партнера подтвердить ЛПР клиента и внести контакт с ролью в CRM.");
  }
  if (hasRisk("Бюджет не подтвержден")) {
    actions.push("Уточнить статус бюджета: сумма, источник финансирования, срок и формат подтверждения.");
  }
  if (hasRisk("Нет инженера / presale")) {
    actions.push("Подключить инженера / presale и согласовать технический следующий шаг.");
  }
  if (hasRisk("Нет защиты сделки у вендора")) {
    actions.push("Проверить возможность регистрации сделки у вендора и подготовить данные для защиты.");
  }
  if (hasRisk("Нет пилота")) {
    actions.push("Оценить необходимость пилота и предложить клиенту короткий сценарий проверки решения.");
  }
  if (hasRisk("Давно не было встречи с партнером")) {
    actions.push("Назначить встречу с партнером и сверить план выхода на клиента.");
  }
  if (actions.length === 0) {
    actions.push("Поддерживать текущий темп, обновлять CRM после каждого значимого контакта и зафиксировать следующий шаг.");
  }
  return actions;
}

function buildLeaderActions(deal, risks, probability) {
  const actions = [];
  const highValue = number(deal[FIELD.amount]) >= 50000000;
  const criticalCount = risks.filter((risk) => risk.severity === "critical").length;

  if (!yes(deal[FIELD.bdm])) {
    actions.push("Назначить BDM или подтвердить, что сделка не требует вендорской поддержки.");
  }
  if (probability < 45 || criticalCount > 0) {
    actions.push("Провести короткий разбор сделки с менеджером: ЛПР, бюджет, следующий контакт, роль партнера.");
  }
  if (highValue && risks.length > 0) {
    actions.push("Взять сделку в управленческий контроль до снятия ключевых рисков.");
  }
  if (number(deal[FIELD.partnerWinRate]) < 40 || number(deal[FIELD.pairHistory]) < 25) {
    actions.push("Проверить, есть ли в экосистеме партнер с более сильной историей по этому клиенту или отрасли.");
  }
  if (!yes(deal[FIELD.engineer])) {
    actions.push("Согласовать доступность технического ресурса, если сделка находится в Presale, КП, переговорах или закрытии.");
  }
  if (actions.length === 0) {
    actions.push("Сделка выглядит управляемой. Контроль оставить на регулярном pipeline review.");
  }
  return actions;
}

function healthLabel(health) {
  return {
    green: "Здоровая",
    yellow: "Требует внимания",
    red: "Критичная"
  }[health];
}

function healthColor(health) {
  return {
    green: "var(--green)",
    yellow: "var(--yellow)",
    red: "var(--red)"
  }[health];
}

function riskSeverityLabel(severity) {
  return {
    critical: "Критический",
    high: "Высокий",
    medium: "Средний"
  }[severity];
}

function renderSummary() {
  const total = state.scored.length;
  const avg = Math.round(state.scored.reduce((sum, item) => sum + item.probability, 0) / total);
  const red = state.scored.filter((item) => item.health === "red").length;
  const green = state.scored.filter((item) => item.health === "green").length;

  document.getElementById("summaryGrid").innerHTML = [
    ["Сделок", formatNumber.format(total)],
    ["Средняя вероятность", `${avg}%`],
    ["Здоровые", formatNumber.format(green)],
    ["Красные", formatNumber.format(red)]
  ].map(([label, value]) => `
    <div class="metric">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
    </div>
  `).join("");
}

function getVisibleDeals() {
  const query = state.search.trim().toLowerCase();
  return state.scored.filter((item) => {
    if (state.health !== "all" && item.health !== state.health) return false;
    if (!query) return true;
    const deal = item.deal;
    return [
      deal[FIELD.id],
      deal[FIELD.client],
      deal[FIELD.partner],
      deal[FIELD.manager],
      deal[FIELD.vendor],
      deal[FIELD.product]
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });
}

function renderDealList() {
  const list = document.getElementById("dealList");
  const visible = getVisibleDeals();

  if (!visible.some((item) => item.deal[FIELD.id] === state.selectedId) && visible.length > 0) {
    state.selectedId = visible[0].deal[FIELD.id];
  }

  list.innerHTML = visible.map((item) => {
    const deal = item.deal;
    const selected = deal[FIELD.id] === state.selectedId ? " is-selected" : "";
    return `
      <button class="deal-item${selected}" data-id="${deal[FIELD.id]}">
        <div class="deal-item-title">
          <span>${deal[FIELD.id]}</span>
          <span class="badge ${item.health}">${item.probability}%</span>
        </div>
        <div class="deal-item-meta">${deal[FIELD.client]} · ${deal[FIELD.stage]}</div>
        <div class="deal-item-meta">${deal[FIELD.partner]} · ${formatRub.format(number(deal[FIELD.amount]))}</div>
      </button>
    `;
  }).join("");

  if (visible.length === 0) {
    list.innerHTML = `<div class="empty-state">Сделки по текущему фильтру не найдены.</div>`;
  }

  list.querySelectorAll(".deal-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.id;
      render();
    });
  });
}

function renderSelectedDeal() {
  const selected = state.scored.find((item) => item.deal[FIELD.id] === state.selectedId) || state.scored[0];
  if (!selected) return;
  state.selectedId = selected.deal[FIELD.id];

  const deal = selected.deal;
  const scoreColor = healthColor(selected.health);
  document.getElementById("dealCard").style.setProperty("--score", selected.probability);
  document.getElementById("dealCard").style.setProperty("--score-color", scoreColor);

  document.getElementById("dealCard").innerHTML = `
    <div class="deal-header">
      <div>
        <p class="eyebrow">${deal[FIELD.id]} · ${deal[FIELD.result]}</p>
        <h2 class="deal-title">${deal[FIELD.client]}</h2>
        <p class="deal-subtitle">${deal[FIELD.product]} · ${deal[FIELD.vendor]} · ${deal[FIELD.partner]}</p>
      </div>
      <div class="score-ring" aria-label="Вероятность закрытия ${selected.probability}%">
        <div class="score-ring-inner">
          <div class="score-value">${selected.probability}%</div>
          <div class="score-label">вероятность</div>
        </div>
      </div>
    </div>

    <div class="status-row">
      <span class="badge ${selected.health}">${healthLabel(selected.health)}</span>
      <span class="badge blue">Приоритет: ${selected.priority}</span>
      <span class="badge blue">Старая оценка: ${deal[FIELD.oldProbability]}%</span>
    </div>

    <div class="detail-grid">
      ${detail("Стадия", deal[FIELD.stage])}
      ${detail("Сумма", formatRub.format(number(deal[FIELD.amount])))}
      ${detail("Маржа", `${deal[FIELD.marginPercent]}%`)}
      ${detail("Менеджер", deal[FIELD.manager])}
      ${detail("Сегмент", deal[FIELD.segment])}
      ${detail("Отрасль", deal[FIELD.industry])}
      ${detail("BDM", yes(deal[FIELD.bdm]) ? deal[FIELD.bdmName] : "Не подключен")}
      ${detail("Инженер", yes(deal[FIELD.engineer]) ? deal[FIELD.engineerName] : "Не подключен")}
    </div>

    <div class="section">
      <h3>Ключевые риски</h3>
      ${renderRisks(selected.risks)}
    </div>

    <div class="section">
      <h3>План действий для менеджера</h3>
      ${renderActions(selected.managerActions)}
    </div>

    <div class="section">
      <h3>План действий для руководителя</h3>
      ${renderActions(selected.leaderActions)}
    </div>
  `;

  renderInsights(selected);
}

function detail(label, value) {
  return `
    <div class="detail">
      <span>${label}</span>
      <strong>${value || "Не указано"}</strong>
    </div>
  `;
}

function renderRisks(risks) {
  if (risks.length === 0) {
    return `<div class="empty-state">Критичных рисков не найдено. Сделку стоит поддерживать в текущем ритме.</div>`;
  }

  return `
    <ul class="risk-list">
      ${risks.map((risk) => `
        <li class="risk-item ${risk.severity}">
          <strong>${riskSeverityLabel(risk.severity)} · ${risk.title}</strong><br>
          <span class="muted">${risk.detail}</span>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderActions(actions) {
  return `
    <ul class="action-list">
      ${actions.map((action) => `<li class="action-item">${action}</li>`).join("")}
    </ul>
  `;
}

function renderInsights(selected) {
  const positive = selected.factors
    .filter((factor) => factor.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 7);
  const negative = selected.factors
    .filter((factor) => factor.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 7);

  document.getElementById("insightPanel").innerHTML = `
    <div>
      <p class="eyebrow">Объяснение оценки</p>
      <h3>Что повлияло на расчет</h3>
    </div>
    <div>
      <h3>Усиливает сделку</h3>
      ${renderFactors(positive)}
    </div>
    <div>
      <h3>Снижает вероятность</h3>
      ${renderFactors(negative)}
    </div>
    <div class="section">
      <h3>Методология</h3>
      <p class="muted">База 50%. Поправки применяются по блокам CRM: параметры сделки, качество проработки, партнер, команда Axoft, клиент и история. Итог ограничен диапазоном 5-95%.</p>
    </div>
  `;
}

function renderFactors(factors) {
  if (factors.length === 0) {
    return `<div class="empty-state">Нет выраженных факторов.</div>`;
  }
  return `
    <div class="factor-table">
      ${factors.map((factor) => `
        <div class="factor-row">
          <div class="factor-name">${factor.name}</div>
          <div class="factor-delta ${factor.delta > 0 ? "plus" : "minus"}">${factor.delta > 0 ? "+" : ""}${factor.delta}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function render() {
  renderSummary();
  renderDealList();
  renderSelectedDeal();
}

async function init() {
  const response = await fetch("data/deals.json");
  state.deals = await response.json();
  state.scored = state.deals.map(scoreDeal);
  state.selectedId = state.scored[0]?.deal[FIELD.id] || null;

  document.getElementById("searchInput").addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });

  document.querySelectorAll("[data-health]").forEach((button) => {
    button.addEventListener("click", () => {
      state.health = button.dataset.health;
      document.querySelectorAll("[data-health]").forEach((chip) => chip.classList.remove("is-active"));
      button.classList.add("is-active");
      render();
    });
  });

  render();
}

init().catch((error) => {
  document.body.innerHTML = `<pre>Не удалось загрузить MVP: ${error.message}</pre>`;
});
