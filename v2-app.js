(() => {
  const data = window.V2_DEMO_DATA;
  if (!data) return;

  const state = {
    role: "salesLead",
    filters: {
      period: "month",
      region: "all",
      employee: "all",
      partner: "all",
      vendor: "all",
      status: "all",
      amount: "all",
      health: "all"
    },
    focusZone: "all",
    monthFocus: "all",
    stageFocus: "all",
    salesScenario: "plan",
    selectedManager: null,
    selectedObject: null,
    selectedDealId: null,
    tasks: loadTasks()
  };

  const roles = {
    salesLead: {
      label: "Руководитель продаж",
      note: "План-факт, выполнение команды, рисковые сделки, переносы и партнёры/вендоры без результата."
    },
    pam: {
      label: "PAM",
      note: "Партнёрская эффективность, конверсия, маржинальность и партнёры без результата."
    },
    sdm: {
      label: "SDM",
      note: "Вендорская воронка, сделки без движения, выгорание и точки роста."
    },
    sdmLead: {
      label: "Руководитель SDM",
      note: "Эффективность SDM-команды, вендорские направления, план-факт и проблемные зоны."
    },
    allDeals: {
      label: "Все сделки",
      note: "Операционный реестр возможных сделок с провалом в карточку."
    },
    currentDeals: {
      label: "Текущие ВС",
      note: "Сделки под управлением: спасаемые, надутый прогноз, мёртвые сделки и следующий шаг."
    },
    forecastAccuracy: {
      label: "Точность прогноза",
      note: "Расхождение прогноза и факта, причины недоверия и завышенные ожидания."
    },
    closedAnalysis: {
      label: "Анализ закрытых ВС",
      note: "Причины закрытия, факт реализации, потенциал реанимации и эффект."
    },
    dataQuality: {
      label: "Качество данных",
      note: "Готовность данных CRM и учётных систем к пилоту: планы, маржа, активности, переносы, КП и прогноз."
    }
  };

  const roleToPlan = {
    salesLead: "Руководитель продаж",
    pam: "PAM",
    sdm: "SDM",
    sdmLead: "Руководитель SDM"
  };

  const roleToPersonField = {
    pam: "pam",
    sdm: "sdm",
    salesLead: "sale",
    sdmLead: "sdm",
    currentDeals: "sale",
    forecastAccuracy: "sale",
    closedAnalysis: "sale",
    allDeals: "sale"
  };

  const healthLabels = { green: "Здоровая", yellow: "Требует внимания", red: "Критичная" };
  const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
  const number = new Intl.NumberFormat("ru-RU");
  const pilotData = createPilotData(data);
  const periodMonths = {
    month: ["2026-06"],
    quarter: ["2026-04", "2026-05", "2026-06"],
    year: ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]
  };

  function compactMoney(value) {
    if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(value >= 10_000_000_000 ? 0 : 1)} млрд ₽`;
    if (Math.abs(value) >= 1_000_000) return `${Math.round(value / 1_000_000)} млн ₽`;
    return money.format(value);
  }

  function appRoot() {
    let root = document.getElementById("v2RoleDashboards");
    if (!root) {
      root = document.createElement("main");
      root.id = "v2RoleDashboards";
      root.className = "v2-app";
      document.querySelector(".app-header").after(root);
    }
    return root;
  }

  function createPilotData(source) {
    const enrichedDeals = source.deals.map((deal, index) => enrichDeal(deal, index));
    source.deals = enrichedDeals;
    const activities = source.deals.map((deal) => ({
      id: `ACT-${deal.id}`,
      dealId: deal.id,
      owner: deal.sale,
      count: deal.activityCount,
      lastActivityDays: deal.lastActivityDays,
      type: deal.lastActivityDays > 21 ? "Нет свежей активности" : deal.lastActivityDays > 10 ? "Требует обновления" : "Активна"
    }));
    const shipments = source.deals
      .filter((deal) => deal.shipmentAmount > 0)
      .map((deal) => ({
        id: `SHP-${deal.id}`,
        dealId: deal.id,
        partner: deal.partner,
        vendor: deal.vendor,
        amount: deal.shipmentAmount,
        lastShipmentDays: deal.lastShipmentDays
      }));
    const transfers = source.deals.flatMap((deal) => deal.closeDateHistory.map((item, index) => ({
      id: `TRN-${deal.id}-${index + 1}`,
      dealId: deal.id,
      from: item.from,
      to: item.to,
      reason: item.reason
    })));
    return {
      deals: source.deals,
      plans: source.plans,
      activities,
      shipments,
      transfers,
      users: [...new Set(source.deals.flatMap((deal) => [deal.sale, deal.pam, deal.sdm]))]
    };
  }

  function enrichDeal(deal, index) {
    const idNumber = Number(deal.id.replace(/\D/g, "")) || index + 1;
    const status = deal.status === "Проиграна" && idNumber % 5 === 0 ? "Отменена" : deal.status;
    const createdAt = deal.createdAt || dateFromPlannedMonth(deal.plannedMonth, -45 - idNumber % 52);
    const closedAt = status === "В работе" ? null : deal.closedAt || dateFromPlannedMonth(deal.plannedMonth, -2 + idNumber % 8);
    const lossReason = status === "Выиграна"
      ? "Закрыта успешно"
      : deal.lossReason || closingReason(deal, idNumber, status);
    const pilotPresale = deal.pilotPresale ?? (deal.stage.includes("Presale") || deal.product.toLowerCase().includes("backup") || idNumber % 4 === 0);
    const revival = revivalScenario(deal, status, idNumber);
    return {
      ...deal,
      status,
      createdAt,
      closedAt,
      lossReason,
      closeReason: lossReason,
      pilotPresale,
      managerForecast: deal.managerForecast ?? Math.round(deal.amount * (deal.probability + 8) / 100),
      closeInPeriodProbability: closeInPeriodProbability(deal),
      transferFailureRisk: transferFailureRisk(deal),
      revivalHypothesis: revival.hypothesis,
      revivalProbability: revival.probability,
      revivalEffect: Math.round(deal.amount * revival.probability / 100)
    };
  }

  function dateFromPlannedMonth(month, offsetDays) {
    const date = new Date(`${month || "2026-03"}-15T12:00:00`);
    date.setDate(date.getDate() + offsetDays);
    return date.toISOString().slice(0, 10);
  }

  function closingReason(deal, idNumber, status) {
    if (status === "Отменена") return "Проект отменён заказчиком";
    if (deal.transferCount >= 3) return "Сроки проекта перенесены";
    if (deal.cpExpired) return "КП потеряло актуальность";
    if (!deal.shipmentAmount && idNumber % 3 === 0) return "Не подтверждён бюджет";
    if (deal.lastActivityDays > 21) return "Потерян контакт с партнёром";
    return ["Выбран другой поставщик", "Нет решения со стороны ЛПР", "Недостаточная поддержка вендора", "Цена выше ожиданий"][idNumber % 4];
  }

  function revivalScenario(deal, status, idNumber) {
    if (status === "Выиграна" || status === "В работе") return { hypothesis: "Не требуется", probability: 0 };
    if (deal.cpExpired) return { hypothesis: "Обновить КП и предложить коммерческую корректировку", probability: 24 };
    if (deal.transferCount >= 3) return { hypothesis: "Подключить руководителя и переквалифицировать проект", probability: 18 };
    if (!deal.shipmentAmount && idNumber % 2 === 0) return { hypothesis: "Вовремя подключить вендора / пресейл к защите решения", probability: 28 };
    if (deal.lastActivityDays > 21) return { hypothesis: "Вернуть контакт и подтвердить следующий шаг с партнёром", probability: 16 };
    return { hypothesis: "Проверить альтернативные условия и повторно согласовать бюджет", probability: 21 };
  }

  function filteredDeals() {
    return baseFilteredDeals().filter((deal) => {
      if (state.focusZone !== "all" && !focusMatch(deal, state.focusZone)) return false;
      if (state.monthFocus !== "all" && deal.plannedMonth !== state.monthFocus) return false;
      if (state.stageFocus !== "all" && deal.stage !== state.stageFocus) return false;
      return true;
    });
  }

  function baseFilteredDeals() {
    return data.deals.filter((deal) => {
      if (state.filters.region !== "all" && deal.region !== state.filters.region) return false;
      if (state.filters.partner !== "all" && deal.partner !== state.filters.partner) return false;
      if (state.filters.vendor !== "all" && deal.vendor !== state.filters.vendor) return false;
      if (state.filters.status !== "all" && deal.status !== state.filters.status) return false;
      if (state.filters.health !== "all" && deal.health !== state.filters.health) return false;
      if (state.filters.amount !== "all" && !amountMatch(deal.amount, state.filters.amount)) return false;
      if (!periodMatch(deal)) return false;
      if (state.filters.employee !== "all") {
        const field = roleToPersonField[state.role] || "sale";
        if (deal[field] !== state.filters.employee) return false;
      }
      return true;
    });
  }

  function focusMatch(deal, zone) {
    return {
      transfers: deal.transferCount >= 3,
      lowMargin: isLowMargin(deal),
      burnout: deal.burnoutRisk === "Высокий" || deal.cpExpired || deal.lastActivityDays > 21,
      lowConfidence: forecastConfidence(deal) < 45
    }[zone] || true;
  }

  function amountMatch(value, bucket) {
    return {
      lt5: value < 5_000_000,
      m5to10: value >= 5_000_000 && value < 10_000_000,
      m10to50: value >= 10_000_000 && value < 50_000_000,
      gte50: value >= 50_000_000
    }[bucket] || false;
  }

  function periodMatch(deal) {
    const months = periodMonths[state.filters.period] || periodMonths.month;
    const month = deal.status === "Выиграна" ? (deal.closeMonth || deal.plannedMonth) : deal.plannedMonth;
    return months.includes(month);
  }

  function sum(items, selector) {
    return items.reduce((acc, item) => acc + selector(item), 0);
  }

  function avg(items, selector) {
    return items.length ? Math.round(sum(items, selector) / items.length) : 0;
  }

  function planForCurrentRole() {
    const planRole = roleToPlan[state.role] || "Руководитель продаж";
    const person = state.filters.employee === "all"
      ? null
      : state.filters.employee;
    const plans = data.plans.filter((plan) => plan.role === planRole && plan.period === state.filters.period);
    if (person) return plans.find((plan) => plan.name === person)?.plan || sum(plans, (plan) => plan.plan);
    return sum(plans, (plan) => plan.plan);
  }

  function planForPerson(role, name) {
    return data.plans.find((plan) => plan.role === role && plan.name === name && plan.period === state.filters.period)?.plan || 0;
  }

  function factAmount(deals) {
    return sum(deals.filter((deal) => deal.status === "Выиграна"), (deal) => deal.shipmentAmount || deal.amount);
  }

  function marginPercent(deal) {
    return Number(((deal.marginAmount || 0) / Math.max(deal.amount || 0, 1) * 100).toFixed(1));
  }

  function isLowMargin(deal) {
    return marginPercent(deal) < 5;
  }

  function marginPlanAmount(plan) {
    return Math.round(plan * 0.09);
  }

  function factMarginAmount(deals) {
    return sum(deals.filter((deal) => deal.status === "Выиграна"), (deal) => {
      const realizedAmount = deal.shipmentAmount || deal.amount;
      return realizedAmount * marginPercent(deal) / 100;
    });
  }

  function forecastMarginAmount(deals) {
    return factMarginAmount(deals) + sum(deals.filter((deal) => deal.status === "В работе"), (deal) => deal.aiForecast * marginPercent(deal) / 100);
  }

  function humanForecastMarginAmount(deals) {
    return factMarginAmount(deals) + sum(deals.filter((deal) => deal.status === "В работе"), (deal) => deal.managerForecast * marginPercent(deal) / 100);
  }

  function averageMarginPercent(deals) {
    const amount = sum(deals, (deal) => deal.amount);
    return amount ? Number((sum(deals, (deal) => deal.marginAmount || 0) / amount * 100).toFixed(1)) : 0;
  }

  function formatMarginPercent(dealOrValue) {
    const value = typeof dealOrValue === "number" ? dealOrValue : marginPercent(dealOrValue);
    return `${Number(value).toFixed(1)}%`;
  }

  function forecastAmount(deals) {
    return sum(deals.filter((deal) => deal.status === "В работе"), (deal) => deal.aiForecast) + factAmount(deals);
  }

  function humanForecastAmount(deals) {
    return sum(deals.filter((deal) => deal.status === "В работе"), (deal) => deal.managerForecast) + factAmount(deals);
  }

  function forecastConfidence(deal) {
    if (deal.status === "Выиграна") return 96;
    if (deal.status === "Проиграна") return 12;
    if (deal.status === "Отменена") return 8;
    let score = 86;
    score -= deal.riskScore * 8;
    score -= deal.transferCount * 9;
    if (deal.transferCount >= 3) score -= 12;
    if (deal.lastActivityDays > 21) score -= 18;
    else if (deal.lastActivityDays > 10) score -= 8;
    if (deal.cpExpired) score -= 14;
    if (isLowMargin(deal)) score -= 8;
    if (isInflatedForecast(deal)) score -= 12;
    return Math.max(5, Math.min(98, Math.round(score)));
  }

  function isInflatedForecast(deal) {
    return deal.managerForecast > deal.aiForecast * 1.3;
  }

  function closeInPeriodProbability(deal) {
    if (deal.status === "Выиграна") return 100;
    if (deal.status !== "В работе") return 0;
    let score = deal.probability;
    if (deal.stage === "Закрытие") score += 16;
    if (deal.stage === "Коммерческое предложение") score += 9;
    if (deal.lastActivityDays <= 7) score += 8;
    if (deal.transferCount >= 3) score -= 24;
    if (deal.cpExpired) score -= 18;
    if (deal.burnoutRisk === "Высокий") score -= 14;
    return Math.max(3, Math.min(96, Math.round(score)));
  }

  function transferFailureRisk(deal) {
    if (deal.status === "Выиграна") return 8;
    if (deal.status === "Проиграна" || deal.status === "Отменена") return 82;
    let score = deal.transferCount * 18 + deal.riskScore * 7;
    if (deal.lastActivityDays > 21) score += 24;
    else if (deal.lastActivityDays > 10) score += 12;
    if (deal.cpExpired) score += 18;
    if (deal.burnoutRisk === "Высокий") score += 20;
    return Math.max(2, Math.min(98, Math.round(score)));
  }

  function dealClassification(deal) {
    const tags = [];
    if (deal.status === "В работе") {
      if (isInflatedForecast(deal)) tags.push({ label: "Надутый прогноз", color: "yellow" });
      if (deal.probability >= 35 && deal.probability <= 70 && (deal.health !== "green" || deal.transferFailureRisk >= 55)) tags.push({ label: "Спасаемая", color: "blue" });
      if (deal.probability < 30 && (deal.lastActivityDays > 21 || deal.cpExpired || deal.transferCount >= 3)) tags.push({ label: "Мёртвая", color: "red" });
      if (deal.lastActivityDays > 14) tags.push({ label: "Нет следующего шага", color: "yellow" });
      if (deal.amount >= 50_000_000 && (deal.health === "red" || deal.transferCount >= 2 || forecastConfidence(deal) < 55)) tags.push({ label: "Нужен руководитель", color: "red" });
      if (deal.risks.some((risk) => risk.toLowerCase().includes("вендор"))) tags.push({ label: "Нужен вендор / партнёр", color: "yellow" });
      if (isLowMargin(deal)) tags.push({ label: "Низкая маржа", color: "red" });
      if (deal.cpExpired || deal.risks.some((risk) => risk.toLowerCase().includes("бюджет"))) tags.push({ label: "Коммерческая корректировка", color: "blue" });
    } else {
      tags.push({ label: deal.status === "Выиграна" ? "Реализована" : "Закрыта", color: deal.status === "Выиграна" ? "green" : "red" });
      if (deal.revivalProbability > 0) tags.push({ label: "Потенциал реанимации", color: "blue" });
    }
    return tags.length ? tags : [{ label: "Рабочая", color: "green" }];
  }

  function confidenceLevel(score) {
    if (score < 45) return { label: "Низкое", color: "red" };
    if (score < 70) return { label: "Среднее", color: "yellow" };
    return { label: "Высокое", color: "green" };
  }

  function dashboardConfidence(deals) {
    return deals.length ? avg(deals, forecastConfidence) : 0;
  }

  function partnerHealthScore(rows) {
    const shipments = sum(rows, (deal) => deal.shipmentAmount);
    const conversion = avg(rows, (deal) => deal.partnerConversion);
    const stale = rows.filter((deal) => deal.lastActivityDays > 21).length;
    const transfers = sum(rows, (deal) => deal.transferCount);
    let score = 78 + conversion * 0.22;
    if (!shipments) score -= 22;
    if (rows.length >= 4 && conversion < 42) score -= 16;
    score -= stale * 4;
    score -= transfers * 2;
    return Math.max(5, Math.min(99, Math.round(score)));
  }

  function vendorHealthScore(rows) {
    const amount = sum(rows, (deal) => deal.amount);
    const shipments = sum(rows, (deal) => deal.shipmentAmount);
    const conversion = Math.round(rows.filter((deal) => deal.status === "Выиграна").length / Math.max(rows.length, 1) * 100);
    const stale = rows.filter((deal) => deal.lastActivityDays > 21).length;
    let score = 72 + conversion * 0.25;
    if (amount > 30_000_000 && shipments < 5_000_000) score -= 24;
    if (!shipments) score -= 16;
    score -= stale * 5;
    return Math.max(5, Math.min(99, Math.round(score)));
  }

  function periodLabel() {
    if (state.filters.period === "year") return "год";
    return state.filters.period === "quarter" ? "квартал" : "месяц";
  }

  function render() {
    const root = appRoot();
    const baseDeals = baseFilteredDeals();
    const deals = filteredDeals();
    root.innerHTML = `
      <section class="v2-shell">
        ${renderTopbar(deals)}
        ${state.selectedDealId ? renderDealDetail(deals) : renderRoleScreen(deals, baseDeals)}
      </section>
    `;
    wireEvents();
  }

  function renderTopbar(deals) {
    return `
      <section class="v2-topbar">
        <div class="v2-title-row">
          <div>
            <span class="v2-kicker">V2 · Ролевой AI-дашборд</span>
            <h1>${roles[state.role].label}</h1>
            <p>${roles[state.role].note}</p>
          </div>
          <span class="v2-badge blue">${deals.length} ВС · ${periodLabel()}</span>
        </div>
        <div class="v2-role-tabs">
          ${Object.entries(roles).map(([key, role]) => `<button class="v2-role-tab ${state.role === key ? "is-active" : ""}" data-v2-role="${key}">${role.label}</button>`).join("")}
        </div>
        <div class="v2-filter-row">
          ${selectField("period", "Период", [["month", "Месяц"], ["quarter", "Квартал"], ["year", "Год"]])}
          ${selectField("region", "Макрорегион", [["all", "Все"], ...data.regions.map((value) => [value, value])])}
          ${selectField("employee", "Сотрудник", [["all", "Все"], ...employeeOptions().map((value) => [value, value])])}
          ${selectField("partner", "Партнёр", [["all", "Все"], ...data.partners.map((value) => [value, value])])}
          ${selectField("vendor", "Вендор", [["all", "Все"], ...data.vendors.map((value) => [value, value])])}
          ${selectField("status", "Статус ВС", [["all", "Все"], ["В работе", "В работе"], ["Выиграна", "Выиграна"], ["Проиграна", "Проиграна"], ["Отменена", "Отменена"]])}
          ${selectField("amount", "Сумма", [["all", "Все"], ["lt5", "до 5 млн"], ["m5to10", "5-10 млн"], ["m10to50", "10-50 млн"], ["gte50", "от 50 млн"]])}
          ${selectField("health", "Здоровье", [["all", "Все"], ["green", "Здоровые"], ["yellow", "Жёлтые"], ["red", "Красные"]])}
        </div>
        ${renderPresetRow()}
        ${renderFocusStatus()}
      </section>
    `;
  }

  function renderPresetRow() {
    const presets = [
      ["burnout", "Выгорание"],
      ["transfers", "3+ переноса"],
      ["lowMargin", "Низкая маржа"],
      ["lowConfidence", "Низкое доверие"]
    ];
    return `<div class="v2-preset-row">
      <span>Быстрые сценарии</span>
      ${presets.map(([key, label]) => `<button class="${state.focusZone === key ? "is-active" : ""}" data-preset="${key}">${label}</button>`).join("")}
      <button data-reset-v2>Сбросить всё</button>
    </div>`;
  }

  function renderFocusStatus() {
    if (state.focusZone === "all" && state.monthFocus === "all" && state.stageFocus === "all") return "";
    const labels = {
      transfers: "3+ переноса",
      lowMargin: "низкая маржа",
      burnout: "выгорание",
      lowConfidence: "низкое доверие"
    };
    const parts = [];
    if (state.focusZone !== "all") parts.push(labels[state.focusZone]);
    if (state.monthFocus !== "all") parts.push(`месяц ${state.monthFocus.slice(5)}`);
    if (state.stageFocus !== "all") parts.push(`стадия: ${state.stageFocus}`);
    return `<div class="v2-focus-status"><span>Фокус: ${parts.join(" · ")}</span><button data-clear-focus>Снять фокус</button></div>`;
  }

  function employeeOptions() {
    if (state.role === "pam") return data.pams;
    if (state.role === "sdm" || state.role === "sdmLead") return data.sdms;
    if (["salesLead", "allDeals", "dataQuality", "currentDeals", "forecastAccuracy", "closedAnalysis"].includes(state.role)) return data.sales;
    return data.sales;
  }

  function selectField(key, label, options) {
    return `
      <label class="v2-field">
        <span>${label}</span>
        <select data-filter="${key}">
          ${options.map(([value, text]) => `<option value="${value}" ${state.filters[key] === value ? "selected" : ""}>${text}</option>`).join("")}
        </select>
      </label>
    `;
  }

  function renderRoleScreen(deals, baseDeals = deals) {
    if (state.role === "salesLead" && state.selectedManager) return renderSalesManagerDetail(baseDeals, state.selectedManager);
    if (state.selectedObject) return renderObjectDetail(baseDeals, state.selectedObject);
    if (state.role === "dataQuality") return renderDataQualityScreen(baseDeals);
    if (state.role === "currentDeals") return renderCurrentDealsScreen(deals);
    if (state.role === "forecastAccuracy") return renderForecastAccuracyScreen(deals);
    if (state.role === "closedAnalysis") return renderClosedAnalysisScreen(deals);
    if (state.role === "allDeals") return renderAllDeals(deals);
    if (state.role === "salesLead") return renderSalesLeadScreen(deals, baseDeals);
    return `
      ${renderKpis(deals)}
      ${renderExecutiveSummary(deals)}
      ${renderSalesCommandCenter(deals, baseDeals)}
      ${renderProblemHeatmap(baseDeals)}
      ${renderTodayActions(deals)}
      <section class="v2-dashboard">
        <div class="v2-panel">
          <div class="v2-panel-head"><h2>${mainTableTitle()}</h2><span>${deals.length} ВС в выборке</span></div>
          ${renderRoleMainTable(deals)}
        </div>
        <aside class="v2-panel">
          <div class="v2-panel-head"><h2>AI-рекомендации</h2><span>приоритет</span></div>
          <div class="v2-insight">${mainInsight(deals)}</div>
          ${renderAttentionList(deals)}
        </aside>
      </section>
      <section class="v2-two-col">
        <div class="v2-panel">
          <div class="v2-panel-head"><h2>Демо-задачи</h2><span>${state.tasks.length}</span></div>
          ${renderTasks()}
        </div>
        <div class="v2-panel">
          <div class="v2-panel-head"><h2>Сигналы качества</h2><span>AI-контроль</span></div>
          ${renderQualitySignals(deals)}
        </div>
      </section>
    `;
  }

  function renderKpis(deals) {
    const plan = planForCurrentRole();
    const fact = factAmount(deals);
    const forecast = forecastAmount(deals);
    const marginPlan = marginPlanAmount(plan);
    const marginFact = factMarginAmount(deals);
    const marginForecast = forecastMarginAmount(deals);
    const marginGap = Math.max(0, marginPlan - marginForecast);
    const confidence = dashboardConfidence(deals);
    const confidenceMeta = confidenceLevel(confidence);
    const gap = Math.max(0, plan - forecast);
    const red = deals.filter((deal) => deal.health === "red").length;
    const openPipeline = sum(deals.filter((deal) => deal.status === "В работе"), (deal) => deal.amount);
    return `
      <section class="v2-grid">
        ${kpi("План: оборот / маржа", compactMoney(plan), `маржа ${compactMoney(marginPlan)} · ${periodLabel()}`, "", money.format(plan))}
        ${kpi("Факт: оборот / маржа", compactMoney(fact), `маржа ${compactMoney(marginFact)} · ${Math.round((fact / Math.max(plan, 1)) * 100)}% оборота`, "", money.format(fact))}
        ${kpi("AI: оборот / маржа", compactMoney(forecast), `маржа ${compactMoney(marginForecast)} · GAP ${compactMoney(gap)}`, marginGap ? "is-warning" : "", money.format(forecast))}
        ${kpi("GAP маржи", compactMoney(marginGap), gap ? `GAP оборота ${compactMoney(gap)}` : "оборот закрывается", marginGap ? "is-danger" : "", money.format(marginGap))}
        ${kpi("Доверие к прогнозу", `${confidence}%`, confidenceMeta.label, confidenceMeta.color === "red" ? "is-danger" : confidenceMeta.color === "yellow" ? "is-warning" : "")}
        ${kpi("Pipeline / средняя маржа", compactMoney(openPipeline), `${formatMarginPercent(averageMarginPercent(deals))} · ${red} красных ВС`, red ? "is-danger" : "", money.format(openPipeline))}
      </section>
    `;
  }

  function renderExecutiveSummary(deals) {
    const plan = planForCurrentRole();
    const forecast = forecastAmount(deals);
    const gap = Math.max(0, plan - forecast);
    const riskDeals = deals.filter((deal) => deal.status === "В работе" && (deal.health === "red" || deal.burnoutRisk === "Высокий" || deal.transferCount >= 3 || forecastConfidence(deal) < 45));
    const riskAmount = sum(riskDeals, (deal) => deal.amount);
    const topStage = groupBy(riskDeals, (deal) => deal.stage)
      .map(({key, rows}) => ({ key, amount: sum(rows, (deal) => deal.amount), count: rows.length }))
      .sort((a, b) => b.amount - a.amount)[0];
    const lowMargin = deals.filter(isLowMargin);
    return `<section class="v2-summary">
      <article>
        <span>Состояние периода</span>
        <strong>${gap ? `Разрыв ${compactMoney(gap)}` : "План закрывается прогнозом"}</strong>
        <small>${gap ? "AI предлагает подтянуть сделки с высокой вероятностью и свежей активностью." : "Главная задача — удержать качество pipeline и не потерять сделки с рисками."}</small>
      </article>
      <article class="${riskAmount ? "is-danger" : ""}">
        <span>Сумма под риском</span>
        <strong>${compactMoney(riskAmount)}</strong>
        <small>${riskDeals.length} ВС: красные, выгорание, переносы или низкое доверие.</small>
      </article>
      <article>
        <span>Где смотреть первым</span>
        <strong>${topStage ? topStage.key : "Нет критичного фокуса"}</strong>
        <small>${topStage ? `${topStage.count} ВС на ${compactMoney(topStage.amount)}.` : "Срез выглядит управляемым."} ${lowMargin.length} ВС с маржей ниже 5%.</small>
      </article>
    </section>`;
  }

  function renderSalesLeadScreen(deals, baseDeals) {
    return `
      ${renderSalesMorningBrief(deals)}
      ${renderSalesScenarioTabs()}
      ${renderSalesScenarioContent(deals, baseDeals)}
    `;
  }

  function renderSalesMorningBrief(deals) {
    const plan = planForCurrentRole();
    const fact = factAmount(deals);
    const forecast = forecastAmount(deals);
    const marginPlan = marginPlanAmount(plan);
    const marginFact = factMarginAmount(deals);
    const marginForecast = forecastMarginAmount(deals);
    const gap = Math.max(0, plan - forecast);
    const marginGap = Math.max(0, marginPlan - marginForecast);
    const riskDeals = highRiskDeals(deals);
    const riskAmount = sum(riskDeals, (deal) => deal.amount);
    const inflated = deals.filter(isInflatedForecast);
    return `<section class="v2-leader-brief">
      <article class="${gap ? "is-danger" : ""}">
        <span>Выполняем ли план?</span>
        <strong>${gap ? `GAP ${compactMoney(gap)}` : "План закрывается"}</strong>
        <small>Оборот: факт ${compactMoney(fact)} · AI ${compactMoney(forecast)} · план ${compactMoney(plan)}</small>
      </article>
      <article class="${marginGap ? "is-danger" : ""}">
        <span>Что с маржей?</span>
        <strong>${marginGap ? `GAP ${compactMoney(marginGap)}` : "Маржа закрывается"}</strong>
        <small>Маржа: факт ${compactMoney(marginFact)} · AI ${compactMoney(marginForecast)} · план ${compactMoney(marginPlan)}</small>
      </article>
      <article class="${riskAmount ? "is-danger" : ""}">
        <span>Что сорвёт период?</span>
        <strong>${compactMoney(riskAmount)}</strong>
        <small>${riskDeals.length} ВС с выгоранием, переносами, красным здоровьем или низким доверием.</small>
      </article>
      <article class="${inflated.length ? "is-danger" : ""}">
        <span>Где прогноз завышен?</span>
        <strong>${inflated.length} ВС</strong>
        <small>${compactMoney(sum(inflated, (deal) => Math.max(0, deal.managerForecast - deal.aiForecast)))} превышения прогноза роли над AI.</small>
      </article>
    </section>`;
  }

  function renderSalesScenarioTabs() {
    const tabs = [
      ["plan", "Контроль плана"],
      ["team", "Команда"],
      ["risks", "Риски и выгорание"],
      ["forecast", "Прогноз vs факт"],
      ["meeting", "Планёрка"],
      ["lost", "Проигранные"]
    ];
    return `<section class="v2-scenario-tabs" aria-label="Сценарии руководителя продаж">
      ${tabs.map(([key, label]) => `<button class="${state.salesScenario === key ? "is-active" : ""}" data-sales-scenario="${key}">${label}</button>`).join("")}
    </section>`;
  }

  function renderSalesScenarioContent(deals, baseDeals) {
    if (state.salesScenario === "team") return renderSalesTeamScenario(deals);
    if (state.salesScenario === "risks") return renderSalesRiskScenario(deals, baseDeals);
    if (state.salesScenario === "forecast") return renderSalesForecastScenario(deals);
    if (state.salesScenario === "meeting") return renderSalesMeetingScenario(deals);
    if (state.salesScenario === "lost") return renderSalesLostScenario(deals);
    return renderSalesPlanScenario(deals, baseDeals);
  }

  function renderSalesPlanScenario(deals, baseDeals) {
    return `
      ${renderKpis(deals)}
      ${renderExecutiveSummary(deals)}
      ${renderSalesCommandCenter(deals, baseDeals)}
      ${renderTodayActions(deals)}
    `;
  }

  function renderSalesTeamScenario(deals) {
    return `<section class="v2-dashboard">
      <div class="v2-panel">
        <div class="v2-panel-head"><h2>Команда продаж</h2><span>клик по менеджеру открывает drill-down</span></div>
        ${renderSalesTeamTable(deals)}
      </div>
      <aside class="v2-panel">
        <div class="v2-panel-head"><h2>Где вмешаться</h2><span>AI-приоритет</span></div>
        ${renderManagerInterventionList(deals)}
      </aside>
    </section>`;
  }

  function renderSalesRiskScenario(deals, baseDeals) {
    const riskDeals = highRiskDeals(deals).slice(0, 14);
    return `
      ${renderProblemHeatmap(baseDeals)}
      <section class="v2-table-card">
        <div class="v2-panel-head"><h2>Top-risk сделки</h2><span>сначала сумма под риском</span></div>
        ${table(["ID","Менеджер","Партнёр","Вендор","Сумма","Здоровье","Риск","Следующее действие"], riskDeals.map((deal) => [
          `<button class="v2-object-link" data-open-deal="${deal.id}">${deal.id}</button>`,
          managerLink(deal.sale),
          deal.partner,
          deal.vendor,
          compactMoney(deal.amount),
          badge(healthLabels[deal.health], deal.health),
          `${deal.burnoutRisk} · ${deal.transferCount} перен.`,
          nextAction(deal)
        ]))}
      </section>`;
  }

  function renderSalesForecastScenario(deals) {
    return renderForecastAccuracyScreen(deals);
  }

  function renderSalesMeetingScenario(deals) {
    const rows = salesManagerRows(deals).filter((row) => row.gap > 0 || row.riskDeals || row.inflated).slice(0, 8);
    return `<section class="v2-table-card v2-meeting-board">
      <div class="v2-panel-head"><h2>Планёрка с командой</h2><span>менеджер → факт → GAP → что спросить</span></div>
      ${table(["Менеджер","План","Факт","GAP","Сумма под риском","Красные ВС","Что спросить"], rows.map((row) => [
        managerLink(row.name),
        compactMoney(row.plan),
        compactMoney(row.fact),
        row.gap ? `<strong class="v2-red-text">${compactMoney(row.gap)}</strong>` : "закрыто",
        compactMoney(row.riskAmount),
        row.riskDeals,
        row.meetingQuestion
      ]))}
    </section>
    <section class="v2-action-board">
      <div class="v2-panel-head"><h2>Повестка руководителя</h2><span>готово к встрече</span></div>
      <div class="v2-action-list">
        ${rows.slice(0, 4).map((row, index) => `<button class="v2-action-item ${row.riskAmount ? "red" : "yellow"}" data-open-manager="${encodeURIComponent(row.name)}">
          <em>${index + 1}</em>
          <span><strong>${row.name}</strong><small>${row.meetingQuestion}</small></span>
          <b>${row.gap ? "GAP" : "Риски"}</b>
        </button>`).join("") || `<div class="v2-empty">Нет явной повестки для планёрки.</div>`}
      </div>
    </section>`;
  }

  function renderSalesLostScenario(deals) {
    const lost = deals.filter((deal) => deal.status === "Проиграна" || deal.status === "Отменена");
    const reasonRows = groupBy(lost, (deal) => deal.lossReason)
      .map(({key, rows}) => ({ key, count: rows.length, amount: sum(rows, (deal) => deal.amount), effect: sum(rows, (deal) => deal.revivalEffect) }))
      .sort((a, b) => b.amount - a.amount);
    const managerRows = groupBy(lost, (deal) => deal.sale)
      .map(({key, rows}) => ({ key, count: rows.length, amount: sum(rows, (deal) => deal.amount), topReason: topGroup(rows, (deal) => deal.lossReason)?.key || "—" }))
      .sort((a, b) => b.amount - a.amount);
    return `<section class="v2-grid">
      ${kpi("Проиграно / отменено", lost.length, "закрытые без выигрыша", lost.length ? "is-danger" : "")}
      ${kpi("Сумма потерь", compactMoney(sum(lost, (deal) => deal.amount)), "pipeline закрыт без реализации", lost.length ? "is-danger" : "")}
      ${kpi("Потенциал реанимации", compactMoney(sum(lost, (deal) => deal.revivalEffect)), "расчётный эффект AI", lost.length ? "is-warning" : "")}
      ${kpi("Главная причина", reasonRows[0]?.key || "Нет данных", `${reasonRows[0]?.count || 0} ВС`)}
    </section>
    <section class="v2-two-col">
      <div class="v2-panel">
        <div class="v2-panel-head"><h2>Причины проигрыша</h2><span>сумма сначала</span></div>
        ${table(["Причина","ВС","Сумма","Потенциал"], reasonRows.map((row) => [row.key, row.count, compactMoney(row.amount), compactMoney(row.effect)]))}
      </div>
      <div class="v2-panel">
        <div class="v2-panel-head"><h2>Менеджеры и потери</h2><span>drill-down</span></div>
        ${table(["Менеджер","ВС","Сумма","Частая причина"], managerRows.map((row) => [managerLink(row.key), row.count, compactMoney(row.amount), row.topReason]))}
      </div>
    </section>
    <section class="v2-table-card">
      <div class="v2-panel-head"><h2>Проигранные сделки для разбора</h2><span>клик открывает карточку</span></div>
      ${table(["ID","Дата закрытия","Менеджер","Партнёр","Сумма","Причина","AI-гипотеза","Эффект"], lost.sort((a, b) => b.amount - a.amount).slice(0, 18).map((deal) => [
        `<button class="v2-object-link" data-open-deal="${deal.id}">${deal.id}</button>`,
        formatDate(deal.closedAt),
        managerLink(deal.sale),
        deal.partner,
        compactMoney(deal.amount),
        deal.lossReason,
        deal.revivalHypothesis,
        compactMoney(deal.revivalEffect)
      ]))}
    </section>`;
  }

  function kpi(label, value, note, mod = "", title = "") {
    return `<article class="v2-card ${mod}"><span>${label}</span><strong ${title ? `title="${title}"` : ""}>${value}</strong><small>${note}</small></article>`;
  }

  function renderTodayActions(deals) {
    const actions = buildTodayActions(deals).slice(0, 5);
    return `
      <section class="v2-action-board">
        <div class="v2-panel-head">
          <h2>AI: что сделать сегодня</h2>
          <div class="v2-head-actions">
            <span>${actions.length} приоритетных действий</span>
            <button class="v2-mini-button" data-create-bulk-tasks>Создать задачи</button>
          </div>
        </div>
        <div class="v2-action-list">
          ${actions.map((action, index) => `
            <button class="v2-action-item ${action.level}" ${action.dealId ? `data-open-deal="${action.dealId}"` : ""} ${action.filterKey ? `data-quick-filter="${action.filterKey}" data-quick-value="${action.filterValue}"` : ""} ${action.objectType ? `data-open-object="${action.objectType}" data-object-name="${encodeURIComponent(action.objectName)}"` : ""}>
              <em>${index + 1}</em>
              <span><strong>${action.title}</strong><small>${action.note}</small></span>
              <b>${action.badge}</b>
            </button>
          `).join("") || `<div class="v2-empty">На сегодня нет критичных действий.</div>`}
        </div>
      </section>
    `;
  }

  function renderSalesCommandCenter(deals, baseDeals) {
    return `<section class="v2-command-grid">
      ${renderForecastBridge(deals)}
      ${renderPipelineByStage(baseDeals)}
    </section>`;
  }

  function renderForecastBridge(deals) {
    const plan = planForCurrentRole();
    const fact = factAmount(deals);
    const ai = forecastAmount(deals);
    const marginPlan = marginPlanAmount(plan);
    const marginFact = factMarginAmount(deals);
    const marginAi = forecastMarginAmount(deals);
    const gap = Math.max(0, plan - ai);
    const factGap = Math.max(0, plan - fact);
    const marginGap = Math.max(0, marginPlan - marginAi);
    const marginFactGap = Math.max(0, marginPlan - marginFact);
    const factPercent = Math.round(fact / Math.max(plan, 1) * 100);
    const aiPercent = Math.round(ai / Math.max(plan, 1) * 100);
    const forecastAdd = Math.max(0, ai - fact);
    return `
      <section class="v2-forecast-board v2-bridge-board">
        <div class="v2-panel-head">
          <h2>План-факт-прогноз</h2>
          <span>план · факт · AI · GAP</span>
        </div>
        <div class="v2-forecast-metrics">
          ${forecastMetric("План", plan, "plan", "целевой объём периода")}
          ${forecastMetric("Факт", fact, "fact", `${factPercent}% выполнения`)}
          ${forecastMetric("AI-прогноз", ai, "ai", `+${compactMoney(forecastAdd)} к факту`)}
          ${forecastMetric("GAP", gap, gap ? "gap" : "closed", gap ? `не хватает до плана` : "план закрывается прогнозом")}
        </div>
        ${forecastProgress("Факт к плану", fact, plan, "fact", factGap ? `Осталось закрыть фактом ${compactMoney(factGap)}` : `Факт выше плана на ${compactMoney(fact - plan)}`)}
        ${forecastProgress("Прогноз к плану", ai, plan, gap ? "ai" : "closed", gap ? `GAP после AI-прогноза ${compactMoney(gap)}` : `Прогноз выше плана на ${compactMoney(ai - plan)}`)}
        ${forecastProgress("Маржа: факт к плану", marginFact, marginPlan, "fact", marginFactGap ? `Осталось добрать маржи ${compactMoney(marginFactGap)}` : `Факт маржи выше плана на ${compactMoney(marginFact - marginPlan)}`)}
        ${forecastProgress("Маржа: прогноз к плану", marginAi, marginPlan, marginGap ? "gap" : "closed", marginGap ? `GAP маржи после AI-прогноза ${compactMoney(marginGap)}` : `Маржа закрывается прогнозом`)}
        <div class="v2-insight">${mainInsight(deals)}</div>
      </section>
    `;
  }

  function forecastMetric(label, value, type, note) {
    return `<div class="v2-forecast-metric ${type}">
      <span>${label}</span>
      <strong title="${money.format(value)}">${compactMoney(value)}</strong>
      <small>${note}</small>
    </div>`;
  }

  function forecastProgress(label, value, plan, type, note) {
    const percent = Math.round(value / Math.max(plan, 1) * 100);
    const capped = Math.min(100, Math.max(0, percent));
    const overflow = Math.max(0, percent - 100);
    return `<div class="v2-forecast-progress ${type}">
      <div class="v2-forecast-progress-head">
        <span>${label}</span>
        <strong>${percent}%</strong>
      </div>
      <div class="v2-forecast-progress-track">
        <i style="width:${capped}%"></i>
        ${overflow ? `<em style="width:${Math.min(40, overflow)}%"></em>` : ""}
      </div>
      <small>${note}</small>
    </div>`;
  }

  function renderPipelineByStage(deals) {
    const openDeals = deals.filter((deal) => deal.status === "В работе");
    const stageOrder = ["Квалификация", "Интерес / Намерение", "Подготовка сделки / Presale", "Переговоры", "Коммерческое предложение", "Закрытие"];
    const rows = stageOrder
      .map((stage) => {
        const stageDeals = openDeals.filter((deal) => deal.stage === stage);
        const green = sum(stageDeals.filter((deal) => deal.health === "green"), (deal) => deal.amount);
        const yellow = sum(stageDeals.filter((deal) => deal.health === "yellow"), (deal) => deal.amount);
        const red = sum(stageDeals.filter((deal) => deal.health === "red"), (deal) => deal.amount);
        return { stage, green, yellow, red, total: green + yellow + red, count: stageDeals.length };
      })
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total);
    const max = Math.max(1, ...rows.map((row) => row.total));
    return `<section class="v2-pipeline-board">
      <div class="v2-panel-head">
        <h2>Pipeline по стадиям</h2>
        <span>сумма и качество ВС</span>
      </div>
      <div class="v2-pipeline-list">
        ${rows.map((row) => {
          const greenWidth = Math.round(row.green / row.total * 100);
          const yellowWidth = Math.round(row.yellow / row.total * 100);
          const redWidth = Math.round(row.red / row.total * 100);
          return `<button class="v2-pipeline-row ${state.stageFocus === row.stage ? "is-active" : ""}" data-stage-pick="${row.stage}">
            <span>${row.stage}<small>${row.count} ВС</small></span>
            <div class="v2-pipeline-track" style="max-width:${Math.max(24, Math.round(row.total / max * 100))}%">
              <i class="green" style="width:${greenWidth}%"></i>
              <i class="yellow" style="width:${yellowWidth}%"></i>
              <i class="red" style="width:${redWidth}%"></i>
            </div>
            <strong title="${money.format(row.total)}">${compactMoney(row.total)}</strong>
          </button>`;
        }).join("") || `<div class="v2-empty">Нет открытого pipeline в выборке.</div>`}
      </div>
      <div class="v2-legend"><span class="green">Здоровые</span><span class="yellow">Внимание</span><span class="red">Критичные</span></div>
    </section>`;
  }

  function renderTrend(deals) {
    const months = [...new Set(data.deals.map((deal) => deal.plannedMonth))].sort().slice(-6);
    const max = Math.max(1, ...months.map((month) => sum(deals.filter((deal) => deal.plannedMonth === month), (deal) => deal.amount)));
    return `<section class="v2-trend-board">
      <div class="v2-panel-head">
        <h2>Динамика pipeline</h2>
        <span>по плановому месяцу закрытия</span>
      </div>
      <div class="v2-trend-bars">
        ${months.map((month) => {
          const rows = deals.filter((deal) => deal.plannedMonth === month);
          const value = sum(rows, (deal) => deal.amount);
          const risk = rows.filter((deal) => deal.health === "red" || deal.burnoutRisk === "Высокий").length;
          return `<button class="v2-trend-bar ${state.monthFocus === month ? "is-active" : ""}" data-trend-month="${month}" title="${month}: ${money.format(value)}">
            <span>${month.slice(5)}</span>
            <i style="height:${Math.max(12, Math.round(value / max * 110))}px"></i>
            <strong title="${money.format(value)}">${compactMoney(value)}</strong>
            <small>${risk} риск.</small>
          </button>`;
        }).join("")}
      </div>
    </section>`;
  }

  function forecastBar(label, value, max, type) {
    const width = Math.max(4, Math.round(value / max * 100));
    return `<div class="v2-forecast-row">
      <span>${label}</span>
      <div class="v2-forecast-track"><em class="${type}" style="width:${width}%"></em></div>
      <strong>${money.format(value)}</strong>
    </div>`;
  }

  function buildTodayActions(deals) {
    const actions = [];
    const plan = planForCurrentRole();
    const forecast = forecastAmount(deals);
    const gap = Math.max(0, plan - forecast);
    if (gap > 0) {
      const candidates = deals.filter((deal) => deal.status === "В работе" && deal.probability >= 55).sort((a, b) => b.aiForecast - a.aiForecast).slice(0, 5);
      actions.push({
        title: `Закрыть разрыв до плана ${money.format(gap)}`,
        note: candidates.length ? `Проверьте ${candidates.length} сделок с высоким AI-прогнозом: ${candidates.map((deal) => deal.id).join(", ")}.` : "В выборке нет сделок с достаточной вероятностью.",
        badge: "План-факт",
        level: gap > plan * 0.18 ? "red" : "yellow"
      });
    }
    deals.filter((deal) => deal.burnoutRisk === "Высокий").sort((a, b) => b.amount - a.amount).slice(0, 2).forEach((deal) => actions.push({
      title: `Обновить сделку ${deal.id}`,
      note: `${deal.partner} · ${deal.vendor}: ${deal.risks[0] || "высокий риск выгорания"}, сумма ${money.format(deal.amount)}.`,
      badge: "Выгорание",
      level: "red",
      dealId: deal.id
    }));
    deals.filter((deal) => deal.cpExpired).sort((a, b) => b.amount - a.amount).slice(0, 1).forEach((deal) => actions.push({
      title: `Проверить КП по ${deal.id}`,
      note: `КП действует ${deal.cpValidDays} дней, возраст КП ${deal.cpAgeDays} дней. Нужно подтвердить актуальность условий.`,
      badge: "КП истёк",
      level: "red",
      dealId: deal.id
    }));
    const lowMarginPartner = groupBy(deals, (deal) => deal.partner)
      .map(({key, rows}) => ({ key, rows, amount: sum(rows, (deal) => deal.amount), lowMargin: rows.filter(isLowMargin), avgMargin: averageMarginPercent(rows) }))
      .filter((item) => item.lowMargin.length >= 2)
      .sort((a, b) => b.amount - a.amount)[0];
    if (lowMarginPartner) actions.push({
      title: `Проверить маржу партнёра ${lowMarginPartner.key}`,
      note: `${lowMarginPartner.lowMargin.length} ВС с маржей ниже 5%, средняя маржа портфеля ${formatMarginPercent(lowMarginPartner.avgMargin)}.`,
      badge: "Маржа",
      level: "yellow",
      objectType: "partner",
      objectName: lowMarginPartner.key
    });
    const lowMarginVendor = groupBy(deals, (deal) => deal.vendor)
      .map(({key, rows}) => ({ key, rows, amount: sum(rows, (deal) => deal.amount), lowMargin: rows.filter(isLowMargin), stale: rows.filter((deal) => deal.lastActivityDays > 21).length }))
      .filter((item) => item.lowMargin.length >= 2 && item.amount > 25_000_000)
      .sort((a, b) => b.amount - a.amount)[0];
    if (lowMarginVendor) actions.push({
      title: `Согласовать условия по вендору ${lowMarginVendor.key}`,
      note: `Pipeline ${money.format(lowMarginVendor.amount)}, ${lowMarginVendor.lowMargin.length} низкомаржинальных ВС, ${lowMarginVendor.stale} сделок без активности.`,
      badge: "Вендор",
      level: "yellow",
      objectType: "vendor",
      objectName: lowMarginVendor.key
    });
    deals.filter((deal) => deal.transferCount >= 3).sort((a, b) => b.transferCount - a.transferCount || b.amount - a.amount).slice(0, 1).forEach((deal) => actions.push({
      title: `Переквалифицировать ${deal.id}`,
      note: `${deal.transferCount} переносов даты закрытия. AI рекомендует закрыть, перевести в проект или снизить прогноз.`,
      badge: "Переносы",
      level: "red",
      dealId: deal.id
    }));
    return actions;
  }

  function mainTableTitle() {
    return {
      salesLead: "Командная таблица",
      pam: "Партнёры без результата",
      sdm: "Вендорская воронка",
      sdmLead: "Команда SDM"
    }[state.role] || "Таблица";
  }

  function renderRoleMainTable(deals) {
    if (state.role === "pam") return renderPartnerTable(deals);
    if (state.role === "sdm") return renderVendorTable(deals);
    if (state.role === "sdmLead") return renderSdmTeamTable(deals);
    return renderSalesTeamTable(deals);
  }

  function groupBy(items, keyFn) {
    const map = new Map();
    items.forEach((item) => {
      const key = keyFn(item);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return [...map.entries()].map(([key, rows]) => ({ key, rows }));
  }

  function topGroup(items, keyFn) {
    return groupBy(items, keyFn)
      .map(({key, rows}) => ({ key, rows, count: rows.length, amount: sum(rows, (deal) => deal.amount || 0) }))
      .sort((a, b) => b.count - a.count || b.amount - a.amount)[0];
  }

  function highRiskDeals(deals) {
    return [...deals]
      .filter((deal) => deal.status === "В работе" && (deal.health === "red" || deal.burnoutRisk === "Высокий" || deal.transferCount >= 3 || forecastConfidence(deal) < 45 || isInflatedForecast(deal) || isLowMargin(deal)))
      .sort((a, b) => b.amount - a.amount || riskRank(b) - riskRank(a));
  }

  function managerLink(name) {
    return `<button class="v2-object-link" data-open-manager="${encodeURIComponent(name)}">${name}</button>`;
  }

  function salesManagerRows(deals) {
    return groupBy(deals, (deal) => deal.sale).map(({key, rows}) => {
      const managerPlan = planForPerson("Руководитель продаж", key);
      const managerMarginPlan = marginPlanAmount(managerPlan);
      const fact = factAmount(rows);
      const forecast = forecastAmount(rows);
      const marginFact = factMarginAmount(rows);
      const marginForecast = forecastMarginAmount(rows);
      const riskRows = highRiskDeals(rows);
      const inflated = rows.filter(isInflatedForecast);
      const lost = rows.filter((deal) => deal.status === "Проиграна" || deal.status === "Отменена");
      const gap = Math.max(0, managerPlan - forecast);
      const marginGap = Math.max(0, managerMarginPlan - marginForecast);
      const lowMarginRows = rows.filter(isLowMargin);
      return {
        name: key,
        rows,
        plan: managerPlan,
        marginPlan: managerMarginPlan,
        fact,
        marginFact,
        forecast,
        marginForecast,
        gap,
        marginGap,
        avgMargin: averageMarginPercent(rows),
        completion: Math.round(fact / Math.max(managerPlan, 1) * 100),
        red: rows.filter((deal) => deal.health === "red").length,
        transfers: sum(rows, (deal) => deal.transferCount),
        lowMargin: lowMarginRows.length,
        lowMarginAmount: sum(lowMarginRows, (deal) => deal.amount),
        riskDeals: riskRows.length,
        riskAmount: sum(riskRows, (deal) => deal.amount),
        inflated: inflated.length,
        inflatedAmount: sum(inflated, (deal) => Math.max(0, deal.managerForecast - deal.aiForecast)),
        lost: lost.length,
        lostAmount: sum(lost, (deal) => deal.amount),
        meetingQuestion: managerMeetingQuestion(rows, gap, riskRows, inflated, lost)
      };
    }).sort((a, b) => b.riskAmount - a.riskAmount || b.gap - a.gap || b.inflatedAmount - a.inflatedAmount);
  }

  function managerMeetingQuestion(rows, gap, riskRows, inflated, lost) {
    if (gap > 0) return `Как закрываем GAP ${compactMoney(gap)} и какие 2 сделки реально подтянуть до конца периода?`;
    if (riskRows.length) return `Что делаем с ${riskRows.length} рисковыми ВС на ${compactMoney(sum(riskRows, (deal) => deal.amount))}?`;
    if (inflated.length) return `Почему прогноз выше AI по ${inflated.length} ВС и что подтверждает вероятность?`;
    if (lost.length) return `Какая повторяющаяся причина потерь и что меняем в работе с партнёрами?`;
    return "Какие сделки ускоряем и где нужна помощь руководителя?";
  }

  function renderSalesTeamTable(deals) {
    const rows = salesManagerRows(deals);
    return table(["Сотрудник","План","Факт","AI-прогноз","GAP","Маржа AI","GAP маржи","Ср. маржа","Риск, ₽","Низк. маржа","Надутый прогноз"], rows.map((row) => [
      managerLink(row.name),
      compactMoney(row.plan),
      compactMoney(row.fact),
      compactMoney(row.forecast),
      row.gap ? `<strong class="v2-red-text">${compactMoney(row.gap)}</strong>` : "закрыто",
      compactMoney(row.marginForecast),
      row.marginGap ? `<strong class="v2-red-text">${compactMoney(row.marginGap)}</strong>` : "закрыто",
      `<strong class="${row.avgMargin < 5 ? "v2-red-text" : "v2-green-text"}">${formatMarginPercent(row.avgMargin)}</strong>`,
      compactMoney(row.riskAmount),
      row.lowMargin,
      row.inflated,
    ]));
  }

  function renderManagerInterventionList(deals) {
    const rows = salesManagerRows(deals).slice(0, 6);
    return `<div class="v2-list">${rows.map((row) => `<button class="v2-list-item" data-open-manager="${encodeURIComponent(row.name)}">
      <span><strong>${row.name}</strong><span>${row.meetingQuestion}</span></span>
      <em class="v2-badge ${row.riskAmount || row.gap ? "red" : "green"}">${row.riskAmount ? compactMoney(row.riskAmount) : `${row.completion}%`}</em>
    </button>`).join("") || `<div class="v2-empty">Нет менеджеров с явными рисками.</div>`}</div>`;
  }

  function renderSalesManagerDetail(deals, managerName) {
    const managerDeals = deals.filter((deal) => deal.sale === managerName);
    const row = salesManagerRows(deals).find((item) => item.name === managerName) || salesManagerRows(managerDeals)[0];
    const riskDeals = highRiskDeals(managerDeals).slice(0, 10);
    const lowMarginDeals = managerDeals.filter(isLowMargin).sort((a, b) => marginPercent(a) - marginPercent(b) || b.amount - a.amount).slice(0, 8);
    const lostDeals = managerDeals.filter((deal) => deal.status === "Проиграна" || deal.status === "Отменена").sort((a, b) => b.amount - a.amount).slice(0, 8);
    return `<section class="v2-object-detail">
      <div class="v2-detail-head">
        <div>
          <span class="v2-kicker">Руководитель продаж · drill-down менеджера</span>
          <h2>${managerName}</h2>
          <p>${managerDeals.length} ВС · ${compactMoney(sum(managerDeals, (deal) => deal.amount))} pipeline · ${row ? row.meetingQuestion : "контроль портфеля"}</p>
        </div>
        <button class="v2-button secondary" data-back-manager>← Назад к руководителю</button>
      </div>
      <section class="v2-grid">
        ${kpi("Оборот: план", compactMoney(row?.plan || 0), periodLabel())}
        ${kpi("Оборот: факт", compactMoney(row?.fact || 0), `${row?.completion || 0}% выполнения`)}
        ${kpi("Оборот: AI / GAP", compactMoney(row?.forecast || 0), row?.gap ? `GAP ${compactMoney(row.gap)}` : "прогноз закрывает план", row?.gap ? "is-warning" : "")}
        ${kpi("Маржа: план", compactMoney(row?.marginPlan || 0), "9% от плана оборота")}
        ${kpi("Маржа: факт", compactMoney(row?.marginFact || 0), `средняя ${formatMarginPercent(row?.avgMargin || 0)}`)}
        ${kpi("Маржа: AI / GAP", compactMoney(row?.marginForecast || 0), row?.marginGap ? `GAP ${compactMoney(row.marginGap)}` : "маржа закрывается", row?.marginGap ? "is-danger" : "")}
        ${kpi("Сумма под риском", compactMoney(row?.riskAmount || 0), `${row?.riskDeals || 0} ВС`, row?.riskAmount ? "is-danger" : "")}
        ${kpi("Низкая маржа", row?.lowMargin || 0, compactMoney(row?.lowMarginAmount || 0), row?.lowMargin ? "is-danger" : "")}
      </section>
      <section class="v2-summary">
        <article class="${row?.gap ? "is-danger" : ""}">
          <span>Вопрос на планёрку</span>
          <strong>${row?.gap ? "Закрытие GAP" : "Контроль рисков"}</strong>
          <small>${row?.meetingQuestion || "Уточнить статус ключевых сделок."}</small>
        </article>
        <article>
          <span>Где смотреть первым</span>
          <strong>${riskDeals[0]?.id || "Нет критичного фокуса"}</strong>
          <small>${riskDeals[0] ? `${riskDeals[0].partner} · ${compactMoney(riskDeals[0].amount)} · ${nextAction(riskDeals[0])}` : "Портфель выглядит управляемым."}</small>
        </article>
        <article class="${lostDeals.length ? "is-danger" : ""}">
          <span>Проигранные</span>
          <strong>${lostDeals.length} ВС</strong>
          <small>${lostDeals[0] ? `Главная причина: ${topGroup(lostDeals, (deal) => deal.lossReason)?.key}.` : "Нет потерь в срезе."}</small>
        </article>
      </section>
      <section class="v2-two-col">
        <div class="v2-panel">
          <div class="v2-panel-head"><h2>Рисковые сделки менеджера</h2><span>клик открывает карточку</span></div>
          ${table(["ID","Партнёр","Оборот","Маржа","AI","Риск","Действие"], riskDeals.map((deal) => [
            `<button class="v2-object-link" data-open-deal="${deal.id}">${deal.id}</button>`,
            deal.partner,
            compactMoney(deal.amount),
            `${compactMoney(deal.marginAmount || 0)} · ${formatMarginPercent(deal)}`,
            `${deal.probability}%`,
            renderClassification(deal),
            nextAction(deal)
          ]))}
        </div>
        <div class="v2-panel">
          <div class="v2-panel-head"><h2>Сделки с низкой маржей</h2><span>${lowMarginDeals.length}</span></div>
          ${table(["ID","Статус","Партнёр","Оборот","Маржа","Действие"], lowMarginDeals.map((deal) => [
            `<button class="v2-object-link" data-open-deal="${deal.id}">${deal.id}</button>`,
            deal.status,
            deal.partner,
            compactMoney(deal.amount),
            `<strong class="v2-red-text">${compactMoney(deal.marginAmount || 0)} · ${formatMarginPercent(deal)}</strong>`,
            nextAction(deal)
          ]))}
        </div>
      </section>
    </section>`;
  }

  function renderPartnerTable(deals) {
    const rows = groupBy(deals, (deal) => deal.partner).map(({key, rows}) => {
      const shipments = sum(rows, (deal) => deal.shipmentAmount);
      const conversion = avg(rows, (deal) => deal.partnerConversion);
      const lowMargin = rows.filter(isLowMargin);
      return { name: key, count: rows.length, won: rows.filter((deal) => deal.status === "Выиграна").length, shipments, last: Math.min(...rows.map((deal) => deal.lastShipmentDays || 999)), activity: sum(rows, (deal) => deal.activityCount), conversion, health: partnerHealthScore(rows), avgMargin: averageMarginPercent(rows), lowMargin: lowMargin.length, waste: rows.length >= 4 && conversion < 42 && shipments < 5_000_000 };
    }).sort((a, b) => Number(b.waste) - Number(a.waste) || a.last - b.last);
    return table(["Партнёр","Health","ВС","Закрыто","Факт","Средняя маржа","Низк. маржа","Активности","Конверсия","Риск"], rows.slice(0, 14).map((row) => [
      objectLink("partner", row.name), scorePill(row.health), row.count, row.won, money.format(row.shipments), formatMarginPercent(row.avgMargin), row.lowMargin, row.activity, `${row.conversion}%`, row.waste ? badge("Тратит время", "red") : badge("Норма", "green")
    ]));
  }

  function renderVendorTable(deals) {
    const rows = groupBy(deals, (deal) => deal.vendor).map(({key, rows}) => {
      const amount = sum(rows, (deal) => deal.amount);
      const shipments = sum(rows, (deal) => deal.shipmentAmount);
      const lowMargin = rows.filter(isLowMargin);
      return { name: key, count: rows.length, won: rows.filter((deal) => deal.status === "Выиграна").length, amount, shipments, health: vendorHealthScore(rows), conversion: Math.round(rows.filter((deal) => deal.status === "Выиграна").length / rows.length * 100), avg: amount / rows.length, avgMargin: averageMarginPercent(rows), lowMargin: lowMargin.length, stale: rows.filter((deal) => deal.lastActivityDays > 21).length, risk: lowMargin.length >= 2 };
    }).sort((a, b) => Number(b.risk) - Number(a.risk) || b.amount - a.amount);
    return table(["Вендор","Health","ВС","Закрыто","Сумма ВС","Факт","Средняя маржа","Конверсия","Без активности","Риск"], rows.slice(0, 14).map((row) => [
      objectLink("vendor", row.name), scorePill(row.health), row.count, row.won, money.format(row.amount), money.format(row.shipments), formatMarginPercent(row.avgMargin), `${row.conversion}%`, row.stale, row.risk ? badge("Низкая маржа", "red") : badge("Норма", "green")
    ]));
  }

  function objectLink(type, name) {
    return `<button class="v2-object-link" data-open-object="${type}" data-object-name="${encodeURIComponent(name)}">${name}</button>`;
  }

  function renderSdmTeamTable(deals) {
    const rows = groupBy(deals, (deal) => deal.sdm).map(({key, rows}) => {
      const plan = data.plans.find((plan) => plan.role === "SDM" && plan.name === key && plan.period === state.filters.period)?.plan || 0;
      return { name: key, plan, fact: factAmount(rows), forecast: forecastAmount(rows), marginForecast: forecastMarginAmount(rows), count: rows.length, lowMargin: rows.filter(isLowMargin).length, risk: rows.filter((deal) => deal.health === "red").length };
    }).sort((a, b) => b.risk - a.risk || b.forecast - a.forecast);
    return table(["SDM","План","Факт","Прогноз","Маржа AI","ВС","Низк. маржа","Сделки под риском"], rows.map((row) => [
      row.name, money.format(row.plan), money.format(row.fact), money.format(row.forecast), compactMoney(row.marginForecast), row.count, row.lowMargin, row.risk
    ]));
  }

  function table(headers, rows) {
    return `<div class="v2-table-wrap"><table class="v2-table"><thead><tr>${headers.map((head) => `<th>${head}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, index) => `<td class="${index && String(cell).includes("₽") ? "v2-num" : ""}">${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function scorePill(score) {
    const color = score < 45 ? "red" : score < 70 ? "yellow" : "green";
    return `<span class="v2-score ${color}">${score}</span>`;
  }

  function badge(label, color) {
    return `<span class="v2-badge ${color}">${label}</span>`;
  }

  function mainInsight(deals) {
    const plan = planForCurrentRole();
    const forecast = forecastAmount(deals);
    const gap = Math.max(0, plan - forecast);
    const burnout = deals.filter((deal) => deal.burnoutRisk === "Высокий").length;
    const lowMargin = deals.filter(isLowMargin).length;
    if (gap > 0) return `До выполнения плана за ${periodLabel()} не хватает ${money.format(gap)}. AI рекомендует сфокусироваться на ${burnout} сделках с высоким риском выгорания и ${lowMargin} сделках с маржей ниже 5%.`;
    return `Прогноз AI выше плана на ${money.format(forecast - plan)}. Основной риск — удержать маржу и не потерять сделки с переносами и истёкшим КП.`;
  }

  function renderAttentionList(deals) {
    const items = [...deals].sort((a, b) => riskRank(b) - riskRank(a)).slice(0, 6);
    if (!items.length) return `<div class="v2-empty">Нет объектов для внимания.</div>`;
    return `<div class="v2-list">${items.map((deal) => `
      <button class="v2-list-item" data-open-deal="${deal.id}">
        <span><strong>${deal.id} · ${deal.partner}</strong><span>${deal.vendor} · ${money.format(deal.amount)} · ${deal.risks[0] || "без критичных рисков"}</span></span>
        <em class="v2-badge ${deal.health}">${deal.burnoutRisk}</em>
      </button>
    `).join("")}</div>`;
  }

  function riskRank(deal) {
    return deal.riskScore * 10 + deal.transferCount * 4 + (deal.burnoutRisk === "Высокий" ? 12 : 0) + (deal.cpExpired ? 8 : 0) + (isLowMargin(deal) ? 10 : 0);
  }

  function renderProblemZones(deals) {
    const transfers = deals.filter((deal) => deal.transferCount >= 3).length;
    const lowMargin = deals.filter(isLowMargin).length;
    const lowConfidence = deals.filter((deal) => forecastConfidence(deal) < 45).length;
    const burned = deals.filter((deal) => deal.burnoutRisk === "Высокий").length;
    const zones = [
      { key: "transfers", label: "3+ переноса", value: transfers, note: "сделки требуют переквалификации", level: transfers ? "red" : "green" },
      { key: "lowMargin", label: "Низкая маржа", value: lowMargin, note: "маржа ниже 5%", level: lowMargin ? "red" : "green" },
      { key: "burnout", label: "Высокое выгорание", value: burned, note: "нет активности / истёк КП", level: burned ? "red" : "green" },
      { key: "lowConfidence", label: "Низкое доверие", value: lowConfidence, note: "прогноз требует проверки", level: lowConfidence ? "yellow" : "green" }
    ];
    return `<section class="v2-zone-board">
      <div class="v2-panel-head"><h2>Проблемные зоны</h2><span>кликните, чтобы сфокусировать дашборд</span></div>
      <div class="v2-zone-grid">
        ${zones.map((zone) => `<button class="v2-zone-card ${zone.level} ${state.focusZone === zone.key ? "is-active" : ""}" data-focus-zone="${zone.key}">
          <span>${zone.label}</span>
          <strong>${zone.value}</strong>
          <small>${zone.note}</small>
        </button>`).join("")}
      </div>
    </section>`;
  }

  function renderProblemHeatmap(deals) {
    const dimension = heatmapDimension();
    const rows = groupBy(deals, (deal) => deal[dimension.field])
      .map(({key, rows}) => ({
        key,
        rows,
        amount: sum(rows, (deal) => deal.amount),
        transfers: rows.filter((deal) => deal.transferCount >= 3).length,
        lowMargin: rows.filter(isLowMargin).length,
        burnout: rows.filter((deal) => deal.burnoutRisk === "Высокий" || deal.cpExpired || deal.lastActivityDays > 21).length,
        lowConfidence: rows.filter((deal) => forecastConfidence(deal) < 45).length
      }))
      .sort((a, b) => b.burnout + b.transfers + b.lowMargin + b.lowConfidence - (a.burnout + a.transfers + a.lowMargin + a.lowConfidence) || b.amount - a.amount)
      .slice(0, 8);
    const columns = [
      ["transfers", "3+ переноса", "Сделки, у которых дата закрытия переносилась три и более раза."],
      ["lowMargin", "Низк. маржа", "Сделки с маржей ниже 5%; требуют проверки коммерческих условий."],
      ["burnout", "Выгорание", "Сделки без активности, с истёкшим КП или высоким риском потери."],
      ["lowConfidence", "Низк. доверие", "AI считает прогноз ненадёжным из-за рисков, переносов или расхождения с прогнозом менеджера."]
    ];
    return `<section class="v2-heatmap-board">
      <div class="v2-panel-head">
        <h2>Проблемные зоны</h2>
        <span>${dimension.label} × риск · клик фильтрует выборку</span>
      </div>
      <div class="v2-heatmap">
        <div class="v2-heatmap-head">
          <span>${dimension.label}</span>
          ${columns.map(([, label, tip]) => heatmapHead(label, tip)).join("")}
          ${heatmapHead("Pipeline", "Общая сумма сделок в выбранном срезе.")}
        </div>
        ${rows.map((row) => `<div class="v2-heatmap-row">
          <button class="v2-heatmap-name" ${dimension.objectType ? `data-open-object="${dimension.objectType}" data-object-name="${encodeURIComponent(row.key)}"` : `data-heatmap-filter="${dimension.filter}" data-heatmap-value="${encodeURIComponent(row.key)}"`}>
            ${row.key}<small>${row.rows.length} ВС</small>
          </button>
          ${columns.map(([key]) => heatmapCell(row[key], key, dimension, row.key)).join("")}
          <strong title="${money.format(row.amount)}">${compactMoney(row.amount)}</strong>
        </div>`).join("") || `<div class="v2-empty">Нет данных для heatmap.</div>`}
      </div>
    </section>`;
  }

  function heatmapDimension() {
    if (state.role === "pam") return { label: "Партнёр", field: "partner", filter: "partner", objectType: "partner" };
    if (state.role === "sdm") return { label: "Вендор", field: "vendor", filter: "vendor", objectType: "vendor" };
    if (state.role === "sdmLead") return { label: "SDM", field: "sdm", filter: "employee" };
    return { label: "Менеджер", field: "sale", filter: "employee" };
  }

  function heatmapHead(label, tip) {
    return `<span class="v2-heatmap-title">${label}<button class="v2-help" type="button" aria-label="${label}: ${tip}" data-tooltip="${tip}">?<em role="tooltip">${tip}</em></button></span>`;
  }

  function heatmapCell(value, zone, dimension, key) {
    const level = value >= 6 ? "high" : value >= 3 ? "mid" : value > 0 ? "low" : "zero";
    return `<button class="v2-heatmap-cell ${level} ${state.focusZone === zone ? "is-active" : ""}" data-focus-zone="${zone}" data-heatmap-filter="${dimension.filter}" data-heatmap-value="${encodeURIComponent(key)}">${value}</button>`;
  }

  function renderQualitySignals(deals) {
    const stale = deals.filter((deal) => deal.lastActivityDays > 21).length;
    const expiredCp = deals.filter((deal) => deal.cpExpired).length;
    const overForecast = deals.filter(isInflatedForecast).length;
    return `<div class="v2-list">
      <div class="v2-list-item"><span><strong>${stale} сделок без активности 21+ день</strong><span>AI снижает доверие и рекомендует обновить статус.</span></span>${badge(stale ? "контроль" : "норма", stale ? "red" : "green")}</div>
      <div class="v2-list-item"><span><strong>${expiredCp} сделок с истёкшим КП</strong><span>Нужно подтвердить актуальность условий и сроков.</span></span>${badge(expiredCp ? "риск" : "норма", expiredCp ? "red" : "green")}</div>
      <div class="v2-list-item"><span><strong>${overForecast} завышенных прогнозов роли</strong><span>Прогноз роли выше AI на 30%+.</span></span>${badge(overForecast ? "проверить" : "норма", overForecast ? "yellow" : "green")}</div>
    </div>`;
  }

  function qualityChecks(deals) {
    return [
      {
        key: "activity",
        title: "Нет свежей активности 21+ день",
        count: deals.filter((deal) => deal.lastActivityDays > 21).length,
        amount: sum(deals.filter((deal) => deal.lastActivityDays > 21), (deal) => deal.amount),
        severity: "critical",
        action: "Подтянуть звонки, письма, встречи и задачи из CRM."
      },
      {
        key: "lowMargin",
        title: "Низкая маржа <5%",
        count: deals.filter(isLowMargin).length,
        amount: sum(deals.filter(isLowMargin), (deal) => deal.amount),
        severity: "critical",
        action: "Проверить коммерческие условия, скидки и вендорскую поддержку."
      },
      {
        key: "transferReason",
        title: "Переносы без полноценной истории",
        count: deals.filter((deal) => deal.transferCount > deal.closeDateHistory.length || deal.closeDateHistory.some((item) => !item.reason)).length,
        amount: sum(deals.filter((deal) => deal.transferCount > deal.closeDateHistory.length || deal.closeDateHistory.some((item) => !item.reason)), (deal) => deal.amount),
        severity: "warning",
        action: "Сделать причину переноса обязательным полем."
      },
      {
        key: "expiredCp",
        title: "Истёк срок КП",
        count: deals.filter((deal) => deal.cpExpired).length,
        amount: sum(deals.filter((deal) => deal.cpExpired), (deal) => deal.amount),
        severity: "warning",
        action: "Хранить дату КП и срок действия, автоматически снижать доверие."
      },
      {
        key: "forecastMismatch",
        title: "Прогноз роли выше AI на 30%+",
        count: deals.filter(isInflatedForecast).length,
        amount: sum(deals.filter(isInflatedForecast), (deal) => deal.amount),
        severity: "warning",
        action: "Выводить расхождение руководителю и требовать комментарий."
      },
      {
        key: "roles",
        title: "Не заполнены роли Sale / PAM / SDM",
        count: deals.filter((deal) => !deal.sale || !deal.pam || !deal.sdm).length,
        amount: sum(deals.filter((deal) => !deal.sale || !deal.pam || !deal.sdm), (deal) => deal.amount),
        severity: "critical",
        action: "Сделать владельцев сделки обязательными для расчёта дашбордов."
      }
    ];
  }

  function renderDataQualityScreen(deals) {
    const checks = qualityChecks(deals);
    const critical = checks.filter((check) => check.severity === "critical").reduce((acc, check) => acc + check.count, 0);
    const warnings = checks.filter((check) => check.severity === "warning").reduce((acc, check) => acc + check.count, 0);
    const affectedAmount = sum(checks, (check) => check.amount);
    const readiness = Math.max(35, Math.min(96, 100 - critical * 0.7 - warnings * 0.25));
    return `
      <section class="v2-grid">
        ${kpi("Готовность к пилоту", `${Math.round(readiness)}%`, readiness < 65 ? "нужна чистка данных" : "можно идти в пилот", readiness < 65 ? "is-danger" : readiness < 82 ? "is-warning" : "")}
        ${kpi("Проверок качества", checks.length, "CRM + forecast + маржа")}
        ${kpi("Критичных разрывов", critical, "влияют на точность прогноза", critical ? "is-danger" : "")}
        ${kpi("Сумма под вопросом", compactMoney(affectedAmount), "по всем найденным проблемам", affectedAmount ? "is-warning" : "", money.format(affectedAmount))}
        ${kpi("API-сущностей", "5", "deals, plans, activities, facts, transfers")}
      </section>
      <section class="v2-summary">
        <article>
          <span>Что готово</span>
          <strong>Демо-модель нормализована</strong>
          <small>Фронт уже работает поверх сущностей, которые можно вынести в backend API.</small>
        </article>
        <article class="is-danger">
          <span>Главный риск пилота</span>
          <strong>Маржа и факт реализации</strong>
          <small>Без корректной маржи по сделкам управленческий прогноз будет неполным.</small>
        </article>
        <article>
          <span>Следующий шаг</span>
          <strong>Выгрузка 3-6 месяцев</strong>
          <small>Нужны реальные сделки, активности, переносы, планы, маржа и факт реализации.</small>
        </article>
      </section>
      <section class="v2-two-col">
        <div class="v2-panel">
          <div class="v2-panel-head"><h2>Нормализованные сущности</h2><span>API-like слой</span></div>
          ${renderEntityMap()}
        </div>
        <div class="v2-panel">
          <div class="v2-panel-head"><h2>Backlog интеграций</h2><span>пилот</span></div>
          ${renderPilotBacklog()}
        </div>
      </section>
      <section class="v2-table-card">
        <div class="v2-panel-head"><h2>Проверки качества данных</h2><span>${checks.length} правил</span></div>
        ${table(["Проверка","Найдено","Сумма","Влияние","Что сделать"], checks.map((check) => [
          check.title,
          check.count,
          compactMoney(check.amount),
          badge(check.severity === "critical" ? "Критично" : "Важно", check.severity === "critical" ? "red" : "yellow"),
          check.action
        ]))}
      </section>
      <section class="v2-table-card">
        <div class="v2-panel-head"><h2>Сделки, которые мешают точности</h2><span>top impact</span></div>
        ${renderDataQualityDeals(deals)}
      </section>
    `;
  }

  function renderEntityMap() {
    const entities = [
      ["deals", pilotData.deals.length, "CRM: возможные сделки, роли, стадии, суммы, прогнозы"],
      ["plans", pilotData.plans.length, "Планы по ролям, периодам, обороту и марже"],
      ["activities", pilotData.activities.length, "CRM/почта/календарь: последняя активность и число касаний"],
      ["facts", pilotData.shipments.length, "Факт реализации и дата последней реализации"],
      ["transfers", pilotData.transfers.length, "CRM: история изменения даты закрытия"]
    ];
    return `<div class="v2-entity-list">${entities.map(([name, count, note]) => `
      <div class="v2-entity-item"><strong>${name}</strong><span>${number.format(count)}</span><small>${note}</small></div>
    `).join("")}</div>`;
  }

  function renderPilotBacklog() {
    const items = [
      ["CRM API", "Получать сделки, роли, стадии, активности и историю изменений."],
      ["ERP API", "Получать планы, факт реализации и последнюю дату реализации партнёра/вендора."],
      ["Правила качества", "Фиксировать обязательные поля и причины переносов."],
      ["Task API", "Создавать задачи в CRM и отслеживать исполнение."],
      ["ML-калибровка", "После накопления истории сравнить rule-based прогноз с фактическими закрытиями."]
    ];
    return `<div class="v2-list">${items.map(([title, note], index) => `
      <div class="v2-list-item"><span><strong>${index + 1}. ${title}</strong><span>${note}</span></span>${badge(index < 2 ? "первым" : "позже", index < 2 ? "red" : "yellow")}</div>
    `).join("")}</div>`;
  }

  function renderDataQualityDeals(deals) {
    const rows = [...deals]
      .map((deal) => ({
        deal,
        issues: [
          deal.lastActivityDays > 21 ? "нет активности" : "",
          isLowMargin(deal) ? "низкая маржа" : "",
          deal.cpExpired ? "КП истёк" : "",
          isInflatedForecast(deal) ? "прогноз завышен" : "",
          deal.transferCount >= 3 ? "3+ переноса" : ""
        ].filter(Boolean)
      }))
      .filter((row) => row.issues.length)
      .sort((a, b) => b.issues.length - a.issues.length || b.deal.amount - a.deal.amount)
      .slice(0, 12);
    return table(["ID","Партнёр","Вендор","Сумма","Проблемы","Действие"], rows.map(({deal, issues}) => [
      `<button class="v2-object-link" data-open-deal="${deal.id}">${deal.id}</button>`,
      deal.partner,
      deal.vendor,
      compactMoney(deal.amount),
      issues.join(", "),
      "Проверить данные перед пилотом"
    ]));
  }

  function renderCurrentDealsScreen(deals) {
    const openDeals = deals.filter((deal) => deal.status === "В работе");
    const saveable = openDeals.filter((deal) => dealClassification(deal).some((tag) => tag.label === "Спасаемая"));
    const inflated = openDeals.filter(isInflatedForecast);
    const dead = openDeals.filter((deal) => dealClassification(deal).some((tag) => tag.label === "Мёртвая"));
    const noNextStep = openDeals.filter((deal) => deal.lastActivityDays > 14);
    const rows = [...openDeals].sort((a, b) => b.transferFailureRisk - a.transferFailureRisk || b.amount - a.amount);
    return `
      <section class="v2-grid">
        ${kpi("Открытые ВС", openDeals.length, "в выбранном срезе")}
        ${kpi("Спасаемые", saveable.length, "есть риск, но вмешательство может помочь", saveable.length ? "is-warning" : "")}
        ${kpi("Надутый прогноз", inflated.length, "прогноз роли выше AI на 30%+", inflated.length ? "is-danger" : "")}
        ${kpi("Без следующего шага", noNextStep.length, "14+ дней без свежего действия", noNextStep.length ? "is-warning" : "")}
        ${kpi("Мёртвые", dead.length, "лучше вывести из прогноза", dead.length ? "is-danger" : "")}
      </section>
      <section class="v2-summary">
        <article>
          <span>Управленческий фокус</span>
          <strong>${saveable.length ? "Спасаемые сделки" : "Контроль качества"}</strong>
          <small>${saveable.length ? `Потенциал в работе: ${compactMoney(sum(saveable, (deal) => deal.amount))}.` : "Критичных спасаемых сделок в выборке нет."}</small>
        </article>
        <article class="${inflated.length ? "is-danger" : ""}">
          <span>Где прогноз спорный</span>
          <strong>${compactMoney(sum(inflated, (deal) => deal.managerForecast - deal.aiForecast))}</strong>
          <small>Суммарное превышение прогноза роли над AI.</small>
        </article>
        <article>
          <span>Что делать сегодня</span>
          <strong>${noNextStep.length ? "Назначить следующий шаг" : "Удерживать ритм"}</strong>
          <small>${noNextStep.length} ВС требуют задачи, встречи или обновления статуса.</small>
        </article>
      </section>
      <section class="v2-table-card">
        <div class="v2-panel-head"><h2>Текущие ВС под управлением</h2><span>3 шкалы: выигрыш · закрытие в период · риск срыва</span></div>
        ${table(["ID","Дата создания","Партнёр","Оборот","Маржа","Вендор","Менеджер","Выигрыш","В период","Риск срыва","Классификация","Следующее действие"], rows.map((deal) => [
          `<button class="v2-object-link" data-open-deal="${deal.id}">${deal.id}</button>`,
          formatDate(deal.createdAt),
          deal.partner,
          compactMoney(deal.amount),
          `${compactMoney(deal.marginAmount || 0)} · ${formatMarginPercent(deal)}`,
          deal.vendor,
          deal.sale,
          `${deal.probability}%`,
          `${deal.closeInPeriodProbability}%`,
          scorePill(100 - deal.transferFailureRisk),
          renderClassification(deal),
          nextAction(deal)
        ]))}
      </section>
    `;
  }

  function renderClassification(deal) {
    return `<span class="v2-class-tags">${dealClassification(deal).slice(0, 3).map((tag) => badge(tag.label, tag.color)).join("")}</span>`;
  }

  function nextAction(deal) {
    if (isInflatedForecast(deal)) return "Проверить прогноз роли и зафиксировать основание";
    if (isLowMargin(deal)) return "Проверить маржу и коммерческие условия";
    if (deal.transferCount >= 3) return "Переквалифицировать или вывести из прогноза";
    if (deal.cpExpired) return "Обновить КП и условия";
    if (deal.lastActivityDays > 14) return "Назначить следующий контакт";
    return "Подтвердить следующий шаг";
  }

  function forecastMismatchReason(deal) {
    const reasons = [];
    if (isInflatedForecast(deal)) reasons.push("прогноз роли выше AI на 30%+");
    if (deal.transferCount >= 3) reasons.push("системные переносы");
    if (deal.lastActivityDays > 21) reasons.push("позднее обновление");
    if (isLowMargin(deal)) reasons.push("низкая маржа");
    if (deal.cpExpired) reasons.push("истёк КП");
    if (!reasons.length && deal.partnerConversion < 45) reasons.push("низкая конверсия партнёра");
    return reasons.join(", ") || "требует проверки";
  }

  function pilotPresaleConversion(deals) {
    const rows = deals.filter((deal) => deal.pilotPresale);
    if (!rows.length) return 0;
    return Math.round(rows.filter((deal) => deal.status === "Выиграна").length / rows.length * 100);
  }

  function formatDate(value) {
    if (!value) return "—";
    const [year, month, day] = value.split("-");
    return `${day}.${month}.${year}`;
  }

  function renderForecastAccuracyScreen(deals) {
    const plan = planForCurrentRole();
    const fact = factAmount(deals);
    const ai = forecastAmount(deals);
    const human = humanForecastAmount(deals);
    const marginPlan = marginPlanAmount(plan);
    const marginAi = forecastMarginAmount(deals);
    const marginHuman = humanForecastMarginAmount(deals);
    const inflated = deals.filter(isInflatedForecast);
    const lowMarginDeals = deals.filter(isLowMargin);
    const lateUpdates = deals.filter((deal) => deal.lastActivityDays > 21);
    const transferDeals = deals.filter((deal) => deal.transferCount >= 3);
    const mismatchRows = [...deals]
      .map((deal) => ({ deal, gap: deal.managerForecast - deal.aiForecast }))
      .filter((row) => row.gap > 0)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 18);
    return `
      <section class="v2-grid">
        ${kpi("План", compactMoney(plan), periodLabel(), "", money.format(plan))}
        ${kpi("Факт", compactMoney(fact), `${Math.round(fact / Math.max(plan, 1) * 100)}% плана`, "", money.format(fact))}
        ${kpi("Прогноз AI", compactMoney(ai), `GAP ${compactMoney(Math.max(0, plan - ai))}`, "", money.format(ai))}
        ${kpi("Маржа AI", compactMoney(marginAi), `план ${compactMoney(marginPlan)} · GAP ${compactMoney(Math.max(0, marginPlan - marginAi))}`, marginAi < marginPlan ? "is-danger" : "", money.format(marginAi))}
        ${kpi("Прогноз роли", compactMoney(human), `расхождение с AI ${compactMoney(human - ai)}`, human > ai * 1.12 ? "is-warning" : "", money.format(human))}
        ${kpi("Маржа роли", compactMoney(marginHuman), `расхождение с AI ${compactMoney(marginHuman - marginAi)}`, marginHuman > marginAi * 1.12 ? "is-warning" : "", money.format(marginHuman))}
      </section>
      ${renderForecastBridge(deals)}
      <section class="v2-summary">
        <article class="${transferDeals.length ? "is-danger" : ""}">
          <span>Системные переносы</span>
          <strong>${transferDeals.length} ВС</strong>
          <small>${compactMoney(sum(transferDeals, (deal) => deal.amount))} pipeline требует переквалификации.</small>
        </article>
        <article class="${lowMarginDeals.length ? "is-danger" : ""}">
          <span>Маржа под риском</span>
          <strong>${lowMarginDeals.length} ВС</strong>
          <small>${compactMoney(sum(lowMarginDeals, (deal) => deal.amount))} pipeline с маржей ниже 5%.</small>
        </article>
        <article class="${lateUpdates.length ? "is-danger" : ""}">
          <span>Поздние обновления</span>
          <strong>${lateUpdates.length} ВС</strong>
          <small>Нет свежей активности 21+ день, доверие к прогнозу падает.</small>
        </article>
      </section>
      <section class="v2-table-card">
        <div class="v2-panel-head"><h2>Расхождение прогноза</h2><span>top impact по сумме разрыва</span></div>
        ${table(["ID","Дата создания","Статус","Партнёр","Вендор","Прогноз роли","AI-прогноз","Разрыв","Причина недоверия"], mismatchRows.map(({deal, gap}) => [
          `<button class="v2-object-link" data-open-deal="${deal.id}">${deal.id}</button>`,
          formatDate(deal.createdAt),
          deal.status,
          deal.partner,
          deal.vendor,
          compactMoney(deal.managerForecast),
          compactMoney(deal.aiForecast),
          `<strong class="${isInflatedForecast(deal) ? "v2-red-text" : "v2-warn-text"}">${compactMoney(gap)}</strong>`,
          forecastMismatchReason(deal)
        ]))}
      </section>
    `;
  }

  function renderClosedAnalysisScreen(deals) {
    const closedDeals = deals.filter((deal) => deal.status !== "В работе");
    const realized = closedDeals.filter((deal) => deal.shipmentAmount > 0);
    const revivalCandidates = closedDeals.filter((deal) => deal.revivalProbability > 0).sort((a, b) => b.revivalEffect - a.revivalEffect);
    const reasonRows = groupBy(closedDeals, (deal) => deal.lossReason)
      .map(({key, rows}) => ({ key, count: rows.length, amount: sum(rows, (deal) => deal.amount), realized: sum(rows, (deal) => deal.shipmentAmount) }))
      .sort((a, b) => b.amount - a.amount);
    const stageLossRows = groupBy(closedDeals.filter((deal) => deal.status !== "Выиграна"), (deal) => deal.stage)
      .map(({key, rows}) => ({ key, count: rows.length, amount: sum(rows, (deal) => deal.amount) }))
      .sort((a, b) => b.count - a.count);
    return `
      <section class="v2-grid">
        ${kpi("Закрытые ВС", closedDeals.length, "выиграны, проиграны, отменены")}
        ${kpi("Реализованы фактом", realized.length, `${compactMoney(sum(realized, (deal) => deal.shipmentAmount))} оборот`, "", money.format(sum(realized, (deal) => deal.shipmentAmount)))}
        ${kpi("Факт маржи", compactMoney(factMarginAmount(closedDeals)), `средняя ${formatMarginPercent(averageMarginPercent(realized))}`, "", money.format(factMarginAmount(closedDeals)))}
        ${kpi("Потенциал реанимации", compactMoney(sum(revivalCandidates, (deal) => deal.revivalEffect)), `${revivalCandidates.length} ВС`, revivalCandidates.length ? "is-warning" : "")}
        ${kpi("Пилот / пресейл", `${pilotPresaleConversion(closedDeals)}%`, "конверсия в выигрыш")}
      </section>
      <section class="v2-two-col">
        <div class="v2-panel">
          <div class="v2-panel-head"><h2>Причины закрытия</h2><span>CRM поле</span></div>
          ${table(["Причина","ВС","Сумма ВС","Факт"], reasonRows.map((row) => [
            row.key,
            row.count,
            compactMoney(row.amount),
            compactMoney(row.realized)
          ]))}
        </div>
        <div class="v2-panel">
          <div class="v2-panel-head"><h2>Где теряем сделки</h2><span>по стадиям</span></div>
          ${table(["Стадия","Потеряно","Сумма"], stageLossRows.map((row) => [
            row.key,
            row.count,
            compactMoney(row.amount)
          ]))}
        </div>
      </section>
      <section class="v2-table-card">
        <div class="v2-panel-head"><h2>Потенциал реанимации</h2><span>гипотеза AI + ожидаемый эффект</span></div>
        ${table(["ID","Дата создания","Дата закрытия","Статус","Партнёр","Вендор","Причина","Гипотеза AI","Вероятность","Ожидаемый эффект"], revivalCandidates.slice(0, 18).map((deal) => [
          `<button class="v2-object-link" data-open-deal="${deal.id}">${deal.id}</button>`,
          formatDate(deal.createdAt),
          formatDate(deal.closedAt),
          deal.status,
          deal.partner,
          deal.vendor,
          deal.lossReason,
          deal.revivalHypothesis,
          `${deal.revivalProbability}%`,
          compactMoney(deal.revivalEffect)
        ]))}
      </section>
      <section class="v2-table-card">
        <div class="v2-panel-head"><h2>Закрытые ВС</h2><span>${closedDeals.length} в выборке</span></div>
        ${table(["ID","Дата создания","Дата закрытия","Статус","Партнёр","Оборот","Маржа","Вендор","Менеджер","Факт","Причина","Пилот / пресейл"], closedDeals.sort((a, b) => (b.closedAt || "").localeCompare(a.closedAt || "")).map((deal) => [
          `<button class="v2-object-link" data-open-deal="${deal.id}">${deal.id}</button>`,
          formatDate(deal.createdAt),
          formatDate(deal.closedAt),
          deal.status,
          deal.partner,
          compactMoney(deal.amount),
          `${compactMoney(deal.marginAmount || 0)} · ${formatMarginPercent(deal)}`,
          deal.vendor,
          deal.sale,
          deal.shipmentAmount ? compactMoney(deal.shipmentAmount) : "нет",
          deal.lossReason,
          deal.pilotPresale ? "да" : "нет"
        ]))}
      </section>
    `;
  }

  function renderAllDeals(deals) {
    const rows = [...deals].sort((a, b) => riskRank(b) - riskRank(a));
    return `
      ${renderKpis(deals)}
      ${renderExecutiveSummary(deals)}
      ${renderSalesCommandCenter(deals, baseFilteredDeals())}
      ${renderProblemHeatmap(baseFilteredDeals())}
      ${renderTrend(baseFilteredDeals())}
      ${renderTodayActions(deals)}
      <section class="v2-table-card">
        <div class="v2-panel-head"><h2>Все возможные сделки</h2><span>${rows.length} в выборке · клик открывает карточку</span></div>
        <div class="v2-table-wrap">
          <table class="v2-table">
            <thead><tr><th>ID</th><th>Статус / партнёр</th><th>Оборот</th><th>Маржа ₽</th><th>Маржа %</th><th>Вендор</th><th>PAM</th><th>SDM</th><th>Sale</th><th>Регион</th><th>AI</th><th>В период</th><th>Прогноз роли</th><th>Доверие</th><th>Здоровье</th><th>Класс</th><th>Переносы</th><th>Активность</th><th>КП</th><th>Выгорание</th></tr></thead>
            <tbody>${rows.map((deal) => {
              const confidence = forecastConfidence(deal);
              return `<tr class="v2-row-${deal.health}" data-open-deal="${deal.id}">
              <td><strong>${deal.id}</strong><small>${formatDate(deal.createdAt)}</small></td><td><strong>${deal.status}</strong><small>${deal.partner}</small></td><td class="v2-num v2-strong-money">${money.format(deal.amount)}</td><td class="v2-num v2-strong-money">${money.format(deal.marginAmount || 0)}</td><td class="v2-num ${isLowMargin(deal) ? "v2-red-text" : "v2-green-text"}"><strong>${formatMarginPercent(deal)}</strong></td><td>${deal.vendor}</td><td>${deal.pam}</td><td>${deal.sdm}</td><td>${deal.sale}</td><td>${deal.region}</td><td class="v2-num">${deal.probability}%</td><td class="v2-num">${deal.closeInPeriodProbability}%</td><td class="v2-num">${money.format(deal.managerForecast)}</td><td>${scorePill(confidence)}</td><td><span class="v2-badge ${deal.health}">${healthLabels[deal.health]}</span></td><td>${renderClassification(deal)}</td><td>${deal.transferCount}</td><td>${deal.lastActivityDays} дн.</td><td>${deal.cpExpired ? "Истёк" : deal.cpAgeDays ? `${deal.cpAgeDays} дн.` : "нет КП"}</td><td><span class="v2-badge ${deal.burnoutRisk === "Высокий" ? "red" : deal.burnoutRisk === "Средний" ? "yellow" : "green"}">${deal.burnoutRisk}</span></td>
            </tr>`;
            }).join("")}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderObjectDetail(deals, selectedObject) {
    const objectDeals = deals.filter((deal) => deal[selectedObject.type] === selectedObject.name);
    const title = selectedObject.type === "partner" ? "Партнёр" : "Вендор";
    const health = selectedObject.type === "partner" ? partnerHealthScore(objectDeals) : vendorHealthScore(objectDeals);
    const topRisks = [...objectDeals].sort((a, b) => riskRank(b) - riskRank(a)).slice(0, 6);
    return `<section class="v2-object-detail">
      <div class="v2-detail-head">
        <div>
          <span class="v2-kicker">${title} · детализация</span>
          <h2>${selectedObject.name}</h2>
          <p>${objectDeals.length} ВС · ${money.format(sum(objectDeals, (deal) => deal.amount))} pipeline · ${money.format(sum(objectDeals, (deal) => deal.marginAmount || 0))} маржа</p>
        </div>
        <button class="v2-button secondary" data-back-object>← Назад к дашборду</button>
      </div>
      <section class="v2-grid">
        ${kpi("Health", `${health}/100`, health < 45 ? "критично" : health < 70 ? "требует внимания" : "норма", health < 45 ? "is-danger" : health < 70 ? "is-warning" : "")}
        ${kpi("Конверсия", `${Math.round(objectDeals.filter((deal) => deal.status === "Выиграна").length / Math.max(objectDeals.length, 1) * 100)}%`, `${objectDeals.filter((deal) => deal.status === "Выиграна").length} закрыто`)}
        ${kpi("Без активности", objectDeals.filter((deal) => deal.lastActivityDays > 21).length, "21+ день без действия", objectDeals.some((deal) => deal.lastActivityDays > 21) ? "is-danger" : "")}
        ${kpi("Переносы", sum(objectDeals, (deal) => deal.transferCount), "суммарно по ВС", sum(objectDeals, (deal) => deal.transferCount) >= 3 ? "is-warning" : "")}
      </section>
      <section class="v2-two-col">
        <div class="v2-panel">
          <div class="v2-panel-head"><h2>Что проверить</h2><span>AI-приоритет</span></div>
          <div class="v2-list">
            ${topRisks.map((deal) => `<button class="v2-list-item" data-open-deal="${deal.id}">
              <span><strong>${deal.id} · ${deal.partner}</strong><span>${deal.vendor} · ${deal.status} · ${money.format(deal.amount)} · ${deal.risks[0] || "без критичных рисков"}</span></span>
              <em class="v2-badge ${deal.health}">${healthLabels[deal.health]}</em>
            </button>`).join("") || `<div class="v2-empty">Нет сделок для проверки.</div>`}
          </div>
        </div>
        <div class="v2-panel">
          <div class="v2-panel-head"><h2>Сделки объекта</h2><span>${objectDeals.length}</span></div>
          ${renderMiniDealsTable(objectDeals)}
        </div>
      </section>
    </section>`;
  }

  function renderMiniDealsTable(deals) {
    const rows = [...deals].sort((a, b) => riskRank(b) - riskRank(a)).slice(0, 10);
    return table(["ID","Статус","Оборот","Маржа","AI","Здоровье","Активность"], rows.map((deal) => [
      `<button class="v2-object-link" data-open-deal="${deal.id}">${deal.id}</button>`,
      deal.status,
      money.format(deal.amount),
      `${compactMoney(deal.marginAmount || 0)} · ${formatMarginPercent(deal)}`,
      `${deal.probability}%`,
      badge(healthLabels[deal.health], deal.health),
      `${deal.lastActivityDays} дн.`
    ]));
  }

  function renderDealDetail(deals) {
    const deal = data.deals.find((item) => item.id === state.selectedDealId);
    if (!deal) {
      state.selectedDealId = null;
      return renderRoleScreen(deals);
    }
    const confidence = forecastConfidence(deal);
    const confidenceMeta = confidenceLevel(confidence);
    return `
      <section class="v2-detail">
        <div class="v2-detail-head">
          <div>
            <span class="v2-kicker">Карточка возможной сделки · ${deal.id}</span>
            <h2>${deal.partner}</h2>
            <p>${deal.vendor} · ${deal.product} · ${deal.region}</p>
          </div>
          <div class="v2-actions">
            <button class="v2-button secondary" data-back-dashboard>← Назад к панели</button>
            <button class="v2-button" data-create-task="${deal.id}">Поставить задачу</button>
          </div>
        </div>
        <section class="v2-grid">
          ${kpi("Оборот ВС", money.format(deal.amount), `${deal.status} · ${deal.stage}`)}
          ${kpi("Маржа ВС", money.format(deal.marginAmount || 0), `${formatMarginPercent(deal)} от оборота`, isLowMargin(deal) ? "is-danger" : "")}
          ${kpi("Вероятность", `${deal.probability}%`, healthLabels[deal.health], deal.health === "red" ? "is-danger" : "")}
          ${kpi("Закрытие в период", `${deal.closeInPeriodProbability}%`, "вероятность закрытия в текущем месяце/квартале", deal.closeInPeriodProbability < 35 && deal.status === "В работе" ? "is-warning" : "")}
          ${kpi("Риск переноса / срыва", `${deal.transferFailureRisk}%`, deal.transferFailureRisk >= 70 ? "высокий риск" : "управляемый риск", deal.transferFailureRisk >= 70 ? "is-danger" : deal.transferFailureRisk >= 45 ? "is-warning" : "")}
          ${kpi("Доверие к прогнозу", `${confidence}%`, confidenceMeta.label, confidenceMeta.color === "red" ? "is-danger" : confidenceMeta.color === "yellow" ? "is-warning" : "")}
          ${kpi("Прогноз роли / AI", `${money.format(deal.managerForecast)} / ${money.format(deal.aiForecast)}`, `маржа AI ${compactMoney(deal.aiForecast * marginPercent(deal) / 100)}`, isInflatedForecast(deal) ? "is-warning" : "")}
          ${kpi("Переносы", deal.transferCount, deal.transferCount >= 3 ? "нужна переквалификация" : "в пределах контроля", deal.transferCount >= 3 ? "is-danger" : "")}
          ${kpi("Дата создания", formatDate(deal.createdAt), deal.closedAt ? `закрыта ${formatDate(deal.closedAt)}` : "сделка открыта")}
        </section>
        <section class="v2-summary">
          <article>
            <span>Классификация AI</span>
            <strong>${renderClassification(deal)}</strong>
            <small>${nextAction(deal)}</small>
          </article>
          <article class="${isInflatedForecast(deal) ? "is-danger" : ""}">
            <span>Прогноз роли vs AI</span>
            <strong>${isInflatedForecast(deal) ? "Надутый прогноз" : "Расхождение в норме"}</strong>
            <small>${forecastMismatchReason(deal)}</small>
          </article>
          <article class="${deal.revivalProbability ? "is-danger" : ""}">
            <span>Закрытие / реанимация</span>
            <strong>${deal.status === "В работе" ? "Пока в работе" : deal.lossReason}</strong>
            <small>${deal.revivalProbability ? `${deal.revivalHypothesis}. Эффект ${compactMoney(deal.revivalEffect)}.` : "Потенциал реанимации не требуется."}</small>
          </article>
        </section>
        <section class="v2-two-col">
          <div class="v2-panel">
            <div class="v2-panel-head"><h2>Риски и история</h2><span>${deal.risks.length}</span></div>
            <div class="v2-list">
              ${deal.risks.length ? deal.risks.map((risk) => `<div class="v2-list-item"><span><strong>${risk}</strong><span>AI учитывает риск в здоровье сделки и прогнозе выгорания.</span></span><em class="v2-badge red">риск</em></div>`).join("") : `<div class="v2-empty">Критичных рисков нет.</div>`}
              ${deal.closeDateHistory.length ? deal.closeDateHistory.map((item) => `<div class="v2-list-item"><span><strong>Перенос ${item.from} → ${item.to}</strong><span>${item.reason}</span></span><em class="v2-badge yellow">перенос</em></div>`).join("") : ""}
            </div>
          </div>
          <div class="v2-panel">
            <div class="v2-panel-head"><h2>AI-рекомендации и задачи</h2><span>${tasksForDeal(deal.id).length}</span></div>
            <div class="v2-insight">${deal.burnoutRisk === "Высокий" ? "Нужно обновить статус сделки сегодня: проверить актуальность КП, причину отсутствия активности и подтвердить следующий шаг с партнёром." : "Сделка в рабочем состоянии. Рекомендуется держать контакт и подтвердить следующий шаг до конца периода."}</div>
            ${renderScoreExplanation(deal, confidence)}
            ${renderTasks(deal.id)}
          </div>
        </section>
      </section>
    `;
  }

  function renderScoreExplanation(deal, confidence) {
    const factors = [
      ["Активность", deal.lastActivityDays > 21 ? "нет контакта больше 21 дня" : `${deal.lastActivityDays} дн. с последнего действия`, deal.lastActivityDays > 21 ? "red" : deal.lastActivityDays > 10 ? "yellow" : "green"],
      ["КП", deal.cpExpired ? `истёк срок КП: ${deal.cpAgeDays} дн.` : deal.cpAgeDays ? `КП актуально: ${deal.cpAgeDays} дн.` : "КП ещё не сформировано", deal.cpExpired ? "red" : "green"],
      ["Переносы", deal.transferCount ? `${deal.transferCount} переносов` : "переносов нет", deal.transferCount >= 3 ? "red" : deal.transferCount ? "yellow" : "green"],
      ["Маржа", `${money.format(deal.marginAmount || 0)} · ${formatMarginPercent(deal)}`, isLowMargin(deal) ? "red" : "green"],
      ["Прогноз", `роль выше AI на ${money.format(deal.managerForecast - deal.aiForecast)}`, isInflatedForecast(deal) ? "red" : "green"]
    ];
    return `<div class="v2-score-explain">
      <div class="v2-score-explain-head"><strong>Почему доверие ${confidence}%</strong><span>прозрачная логика AI</span></div>
      ${factors.map(([label, text, color]) => `<div class="v2-score-factor"><span>${label}</span><em class="${color}">${text}</em></div>`).join("")}
    </div>`;
  }

  function renderTasks(dealId = null) {
    const tasks = dealId ? tasksForDeal(dealId) : state.tasks.slice(0, 6);
    if (!tasks.length) return `<div class="v2-empty">Демо-задач пока нет. Откройте сделку и нажмите “Поставить задачу”.</div>`;
    return `<div class="v2-task-list">${tasks.map((task) => `<div class="v2-task"><strong>${task.title}</strong><span>${task.dealId} · ${task.assignee} · ${task.priority}</span></div>`).join("")}</div>`;
  }

  function tasksForDeal(dealId) {
    return state.tasks.filter((task) => task.dealId === dealId);
  }

  function createTask(dealId) {
    const deal = data.deals.find((item) => item.id === dealId);
    if (!deal) return;
    const title = deal.burnoutRisk === "Высокий"
      ? "Разобрать риск выгорания сделки"
      : deal.transferCount >= 3
        ? "Переквалифицировать сделку с переносами"
        : "Подтвердить следующий шаг по ВС";
    state.tasks.unshift({
      id: `V2-TASK-${String(Date.now()).slice(-6)}`,
      dealId,
      title,
      assignee: state.role === "sdm" || state.role === "sdmLead" ? deal.sdm : deal.pam,
      priority: deal.health === "red" ? "Критично" : deal.health === "yellow" ? "Важно" : "Норма"
    });
    saveTasks();
    render();
  }

  function createBulkTasks() {
    const deals = filteredDeals()
      .filter((deal) => deal.status === "В работе" && (deal.health === "red" || deal.burnoutRisk === "Высокий" || deal.transferCount >= 3 || forecastConfidence(deal) < 45))
      .sort((a, b) => riskRank(b) - riskRank(a))
      .slice(0, 5);
    deals.forEach((deal) => {
      const duplicate = state.tasks.some((task) => task.dealId === deal.id && task.title.includes("AI-план"));
      if (duplicate) return;
      state.tasks.unshift({
        id: `V2-TASK-${String(Date.now()).slice(-6)}-${deal.id}`,
        dealId: deal.id,
        title: `AI-план по рисковой ВС: ${deal.partner}`,
        assignee: state.role === "sdm" || state.role === "sdmLead" ? deal.sdm : deal.pam,
        priority: deal.health === "red" ? "Критично" : "Важно"
      });
    });
    saveTasks();
    render();
  }

  function loadTasks() {
    try {
      return JSON.parse(localStorage.getItem("v2Tasks") || "[]");
    } catch {
      return [];
    }
  }

  function saveTasks() {
    localStorage.setItem("v2Tasks", JSON.stringify(state.tasks));
  }

  function tooltipLayer() {
    let layer = document.getElementById("v2TooltipLayer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "v2TooltipLayer";
      layer.className = "v2-tooltip-layer";
      layer.setAttribute("role", "tooltip");
      document.body.appendChild(layer);
    }
    return layer;
  }

  function showTooltip(button) {
    const text = button.dataset.tooltip;
    if (!text) return;
    const layer = tooltipLayer();
    layer.textContent = text;
    layer.classList.add("is-visible");
    const rect = button.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    const top = Math.max(12, rect.top + window.scrollY - layerRect.height - 10);
    const left = Math.min(
      window.scrollX + window.innerWidth - layerRect.width - 12,
      Math.max(12, rect.left + window.scrollX + rect.width / 2 - layerRect.width / 2)
    );
    layer.style.top = `${top}px`;
    layer.style.left = `${left}px`;
  }

  function hideTooltip() {
    document.getElementById("v2TooltipLayer")?.classList.remove("is-visible");
  }

  function wireEvents() {
    document.querySelectorAll("[data-v2-role]").forEach((button) => {
      button.addEventListener("click", () => {
        state.role = button.dataset.v2Role;
        state.selectedDealId = null;
        state.selectedObject = null;
        state.selectedManager = null;
        state.focusZone = "all";
        state.monthFocus = "all";
        state.stageFocus = "all";
        state.filters.employee = "all";
        render();
      });
    });
    document.querySelectorAll("[data-filter]").forEach((input) => {
      input.addEventListener("change", () => {
        state.filters[input.dataset.filter] = input.value;
        state.selectedDealId = null;
        state.selectedObject = null;
        state.selectedManager = null;
        state.focusZone = "all";
        state.monthFocus = "all";
        state.stageFocus = "all";
        render();
      });
    });
    document.querySelectorAll("[data-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        state.focusZone = state.focusZone === button.dataset.preset ? "all" : button.dataset.preset;
        state.monthFocus = "all";
        state.stageFocus = "all";
        state.selectedDealId = null;
        state.selectedObject = null;
        state.selectedManager = null;
        render();
      });
    });
    document.querySelector("[data-reset-v2]")?.addEventListener("click", () => {
      state.filters = { period: "month", region: "all", employee: "all", partner: "all", vendor: "all", status: "all", amount: "all", health: "all" };
      state.focusZone = "all";
      state.monthFocus = "all";
      state.stageFocus = "all";
      state.selectedDealId = null;
      state.selectedObject = null;
      state.selectedManager = null;
      render();
    });
    document.querySelectorAll("[data-sales-scenario]").forEach((button) => {
      button.addEventListener("click", () => {
        state.salesScenario = button.dataset.salesScenario;
        state.selectedDealId = null;
        state.selectedObject = null;
        state.selectedManager = null;
        render();
      });
    });
    document.querySelectorAll("[data-focus-zone]").forEach((button) => {
      button.addEventListener("click", () => {
        const zone = button.dataset.focusZone;
        state.focusZone = state.focusZone === zone ? "all" : zone;
        if (button.dataset.heatmapFilter) {
          state.filters[button.dataset.heatmapFilter] = decodeURIComponent(button.dataset.heatmapValue);
        }
        state.monthFocus = "all";
        state.stageFocus = "all";
        state.selectedDealId = null;
        state.selectedObject = null;
        state.selectedManager = null;
        render();
      });
    });
    document.querySelectorAll("[data-open-deal]").forEach((row) => {
      row.addEventListener("click", () => {
        state.selectedDealId = row.dataset.openDeal;
        state.selectedObject = null;
        state.selectedManager = null;
        render();
        requestAnimationFrame(() => appRoot().scrollIntoView({ behavior: "smooth", block: "start" }));
      });
    });
    document.querySelector("[data-back-dashboard]")?.addEventListener("click", () => {
      state.selectedDealId = null;
      render();
    });
    document.querySelectorAll("[data-quick-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.filters[button.dataset.quickFilter] = button.dataset.quickValue;
        state.selectedDealId = null;
        state.selectedObject = null;
        state.selectedManager = null;
        state.monthFocus = "all";
        state.stageFocus = "all";
        render();
      });
    });
    document.querySelectorAll("[data-heatmap-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.focusZone) return;
        state.filters[button.dataset.heatmapFilter] = decodeURIComponent(button.dataset.heatmapValue);
        state.selectedDealId = null;
        state.selectedObject = null;
        state.selectedManager = null;
        render();
      });
    });
    document.querySelectorAll("[data-open-object]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        state.selectedObject = { type: button.dataset.openObject, name: decodeURIComponent(button.dataset.objectName) };
        state.selectedDealId = null;
        state.selectedManager = null;
        render();
        requestAnimationFrame(() => appRoot().scrollIntoView({ behavior: "smooth", block: "start" }));
      });
    });
    document.querySelectorAll("[data-open-manager]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        state.selectedManager = decodeURIComponent(button.dataset.openManager);
        state.selectedDealId = null;
        state.selectedObject = null;
        render();
        requestAnimationFrame(() => appRoot().scrollIntoView({ behavior: "smooth", block: "start" }));
      });
    });
    document.querySelector("[data-back-manager]")?.addEventListener("click", () => {
      state.selectedManager = null;
      render();
    });
    document.querySelector("[data-back-object]")?.addEventListener("click", () => {
      state.selectedObject = null;
      render();
    });
    document.querySelector("[data-clear-focus]")?.addEventListener("click", () => {
      state.focusZone = "all";
      state.monthFocus = "all";
      state.stageFocus = "all";
      state.selectedObject = null;
      state.selectedDealId = null;
      state.selectedManager = null;
      render();
    });
    document.querySelectorAll("[data-trend-month]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedObject = null;
        state.selectedDealId = null;
        state.selectedManager = null;
        state.monthFocus = state.monthFocus === button.dataset.trendMonth ? "all" : button.dataset.trendMonth;
        render();
      });
    });
    document.querySelectorAll("[data-stage-pick]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedObject = null;
        state.selectedDealId = null;
        state.selectedManager = null;
        state.stageFocus = state.stageFocus === button.dataset.stagePick ? "all" : button.dataset.stagePick;
        render();
      });
    });
    document.querySelectorAll("[data-tooltip]").forEach((button) => {
      button.addEventListener("mouseenter", () => showTooltip(button));
      button.addEventListener("focus", () => showTooltip(button));
      button.addEventListener("mouseleave", hideTooltip);
      button.addEventListener("blur", hideTooltip);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        showTooltip(button);
      });
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest("[data-tooltip]")) hideTooltip();
    });
    document.querySelector("[data-create-bulk-tasks]")?.addEventListener("click", createBulkTasks);
    document.querySelector("[data-create-task]")?.addEventListener("click", (event) => createTask(event.currentTarget.dataset.createTask));
  }

  document.addEventListener("DOMContentLoaded", render);
})();
