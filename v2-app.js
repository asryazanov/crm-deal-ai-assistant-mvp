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
      note: "Партнёрская эффективность, конверсия, отгрузки из 1С и партнёры без результата."
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
    allDeals: "sale"
  };

  const healthLabels = { green: "Здоровая", yellow: "Требует внимания", red: "Критичная" };
  const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
  const number = new Intl.NumberFormat("ru-RU");

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

  function filteredDeals() {
    return baseFilteredDeals().filter((deal) => {
      if (state.focusZone !== "all" && !focusMatch(deal, state.focusZone)) return false;
      if (state.monthFocus !== "all" && deal.plannedMonth !== state.monthFocus) return false;
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
      noShipment: deal.status !== "Проиграна" && !deal.shipmentAmount,
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

  function factAmount(deals) {
    return sum(deals.filter((deal) => deal.status === "Выиграна"), (deal) => deal.shipmentAmount || deal.amount);
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
    let score = 86;
    score -= deal.riskScore * 8;
    score -= deal.transferCount * 9;
    if (deal.transferCount >= 3) score -= 12;
    if (deal.lastActivityDays > 21) score -= 18;
    else if (deal.lastActivityDays > 10) score -= 8;
    if (deal.cpExpired) score -= 14;
    if (!deal.shipmentAmount) score -= 7;
    if (deal.managerForecast - deal.aiForecast > deal.amount * 0.22) score -= 10;
    return Math.max(5, Math.min(98, Math.round(score)));
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
          ${selectField("period", "Период", [["month", "Месяц"], ["quarter", "Квартал"]])}
          ${selectField("region", "Макрорегион", [["all", "Все"], ...data.regions.map((value) => [value, value])])}
          ${selectField("employee", "Сотрудник", [["all", "Все"], ...employeeOptions().map((value) => [value, value])])}
          ${selectField("partner", "Партнёр", [["all", "Все"], ...data.partners.map((value) => [value, value])])}
          ${selectField("vendor", "Вендор", [["all", "Все"], ...data.vendors.map((value) => [value, value])])}
          ${selectField("status", "Статус ВС", [["all", "Все"], ["В работе", "В работе"], ["Выиграна", "Выиграна"], ["Проиграна", "Проиграна"]])}
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
      ["noShipment", "Нет отгрузок"],
      ["lowConfidence", "Низкое доверие"]
    ];
    return `<div class="v2-preset-row">
      <span>Быстрые сценарии</span>
      ${presets.map(([key, label]) => `<button class="${state.focusZone === key ? "is-active" : ""}" data-preset="${key}">${label}</button>`).join("")}
      <button data-reset-v2>Сбросить всё</button>
    </div>`;
  }

  function renderFocusStatus() {
    if (state.focusZone === "all" && state.monthFocus === "all") return "";
    const labels = {
      transfers: "3+ переноса",
      noShipment: "нет отгрузки в 1С",
      burnout: "выгорание",
      lowConfidence: "низкое доверие"
    };
    const parts = [];
    if (state.focusZone !== "all") parts.push(labels[state.focusZone]);
    if (state.monthFocus !== "all") parts.push(`месяц ${state.monthFocus.slice(5)}`);
    return `<div class="v2-focus-status"><span>Фокус: ${parts.join(" · ")}</span><button data-clear-focus>Снять фокус</button></div>`;
  }

  function employeeOptions() {
    if (state.role === "pam") return data.pams;
    if (state.role === "sdm" || state.role === "sdmLead") return data.sdms;
    if (state.role === "salesLead" || state.role === "allDeals") return data.sales;
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
    if (state.selectedObject) return renderObjectDetail(baseDeals, state.selectedObject);
    if (state.role === "allDeals") return renderAllDeals(deals);
    return `
      ${renderKpis(deals)}
      ${renderProblemZones(baseDeals)}
      ${renderForecastVisual(deals)}
      ${renderTrend(baseDeals)}
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
    const humanForecast = humanForecastAmount(deals);
    const confidence = dashboardConfidence(deals);
    const confidenceMeta = confidenceLevel(confidence);
    const gap = Math.max(0, plan - forecast);
    const red = deals.filter((deal) => deal.health === "red").length;
    const transferAmount = sum(deals.filter((deal) => deal.transferCount > 0), (deal) => deal.amount);
    return `
      <section class="v2-grid">
        ${kpi("План из 1С", money.format(plan), `${periodLabel()} · выбранная роль`)}
        ${kpi("Факт", money.format(fact), `${Math.round((fact / Math.max(plan, 1)) * 100)}% выполнения`)}
        ${kpi("Прогноз AI", money.format(forecast), `разрыв ${money.format(gap)}`)}
        ${kpi("Прогноз роли", money.format(humanForecast), `расхождение с AI ${money.format(humanForecast - forecast)}`, humanForecast - forecast > plan * 0.12 ? "is-warning" : "")}
        ${kpi("Доверие к прогнозу", `${confidence}%`, confidenceMeta.label, confidenceMeta.color === "red" ? "is-danger" : confidenceMeta.color === "yellow" ? "is-warning" : "")}
        ${kpi("Красные / переносы", `${red} / ${deals.filter((deal) => deal.transferCount > 0).length}`, `перенесено ${money.format(transferAmount)}`, red ? "is-danger" : "")}
      </section>
    `;
  }

  function kpi(label, value, note, mod = "") {
    return `<article class="v2-card ${mod}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
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

  function renderForecastVisual(deals) {
    const plan = planForCurrentRole();
    const fact = factAmount(deals);
    const ai = forecastAmount(deals);
    const human = humanForecastAmount(deals);
    const max = Math.max(plan, fact, ai, human, 1);
    return `
      <section class="v2-forecast-board">
        <div class="v2-panel-head">
          <h2>План-факт и доверие к прогнозу</h2>
          <span>AI vs прогноз роли</span>
        </div>
        ${forecastBar("План из 1С", plan, max, "plan")}
        ${forecastBar("Факт", fact, max, "fact")}
        ${forecastBar("Прогноз AI", ai, max, "ai")}
        ${forecastBar("Прогноз роли", human, max, "human")}
      </section>
    `;
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
            <strong>${money.format(value)}</strong>
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
    const noShipPartner = groupBy(deals, (deal) => deal.partner)
      .map(({key, rows}) => ({ key, rows, amount: sum(rows, (deal) => deal.amount), shipments: sum(rows, (deal) => deal.shipmentAmount), conversion: avg(rows, (deal) => deal.partnerConversion) }))
      .filter((item) => item.rows.length >= 3 && item.shipments < 1_000_000)
      .sort((a, b) => b.amount - a.amount)[0];
    if (noShipPartner) actions.push({
      title: `Разобрать партнёра ${noShipPartner.key}`,
      note: `${noShipPartner.rows.length} ВС на ${money.format(noShipPartner.amount)}, отгрузок почти нет, конверсия ${noShipPartner.conversion}%.`,
      badge: "Партнёр",
      level: "yellow",
      objectType: "partner",
      objectName: noShipPartner.key
    });
    const noShipVendor = groupBy(deals, (deal) => deal.vendor)
      .map(({key, rows}) => ({ key, rows, amount: sum(rows, (deal) => deal.amount), shipments: sum(rows, (deal) => deal.shipmentAmount), stale: rows.filter((deal) => deal.lastActivityDays > 21).length }))
      .filter((item) => item.rows.length >= 3 && item.amount > 25_000_000 && item.shipments < 2_000_000)
      .sort((a, b) => b.amount - a.amount)[0];
    if (noShipVendor) actions.push({
      title: `Эскалировать вендора ${noShipVendor.key}`,
      note: `Pipeline ${money.format(noShipVendor.amount)}, отгрузок нет, ${noShipVendor.stale} сделок без активности.`,
      badge: "Вендор",
      level: "yellow",
      objectType: "vendor",
      objectName: noShipVendor.key
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

  function renderSalesTeamTable(deals) {
    const rows = groupBy(deals, (deal) => deal.sale).map(({key, rows}) => {
      const plan = data.plans.find((plan) => plan.role === "Руководитель продаж" && plan.period === state.filters.period)?.plan / data.sales.length || 0;
      const fact = factAmount(rows);
      const forecast = forecastAmount(rows);
      return { name: key, plan, fact, forecast, red: rows.filter((deal) => deal.health === "red").length, transfers: sum(rows, (deal) => deal.transferCount), risk: sum(rows.filter((deal) => deal.health === "red"), (deal) => deal.amount) };
    }).sort((a, b) => b.risk - a.risk);
    return table(["Сотрудник","План","Факт","Прогноз","Вып.","Красные","Переносы","Сумма под риском"], rows.map((row) => [
      row.name, money.format(row.plan), money.format(row.fact), money.format(row.forecast), `${Math.round(row.fact / Math.max(row.plan, 1) * 100)}%`, row.red, row.transfers, money.format(row.risk)
    ]));
  }

  function renderPartnerTable(deals) {
    const rows = groupBy(deals, (deal) => deal.partner).map(({key, rows}) => {
      const shipments = sum(rows, (deal) => deal.shipmentAmount);
      const conversion = avg(rows, (deal) => deal.partnerConversion);
      return { name: key, count: rows.length, won: rows.filter((deal) => deal.status === "Выиграна").length, shipments, last: Math.min(...rows.map((deal) => deal.lastShipmentDays || 999)), activity: sum(rows, (deal) => deal.activityCount), conversion, health: partnerHealthScore(rows), waste: rows.length >= 4 && conversion < 42 && shipments < 5_000_000 };
    }).sort((a, b) => Number(b.waste) - Number(a.waste) || a.last - b.last);
    return table(["Партнёр","Health","ВС","Закрыто","Отгрузка 1С","Последняя отгрузка","Активности","Конверсия","Риск"], rows.slice(0, 14).map((row) => [
      objectLink("partner", row.name), scorePill(row.health), row.count, row.won, money.format(row.shipments), row.last > 300 ? "давно / нет" : `${row.last} дн.`, row.activity, `${row.conversion}%`, row.waste ? badge("Тратит время", "red") : badge("Норма", "green")
    ]));
  }

  function renderVendorTable(deals) {
    const rows = groupBy(deals, (deal) => deal.vendor).map(({key, rows}) => {
      const amount = sum(rows, (deal) => deal.amount);
      const shipments = sum(rows, (deal) => deal.shipmentAmount);
      return { name: key, count: rows.length, won: rows.filter((deal) => deal.status === "Выиграна").length, amount, shipments, health: vendorHealthScore(rows), conversion: Math.round(rows.filter((deal) => deal.status === "Выиграна").length / rows.length * 100), avg: amount / rows.length, stale: rows.filter((deal) => deal.lastActivityDays > 21).length, risk: amount > 30_000_000 && shipments < 5_000_000 };
    }).sort((a, b) => Number(b.risk) - Number(a.risk) || b.amount - a.amount);
    return table(["Вендор","Health","ВС","Закрыто","Сумма ВС","Отгрузка 1С","Конверсия","Средний чек","Без активности","Риск"], rows.slice(0, 14).map((row) => [
      objectLink("vendor", row.name), scorePill(row.health), row.count, row.won, money.format(row.amount), money.format(row.shipments), `${row.conversion}%`, money.format(row.avg), row.stale, row.risk ? badge("Нет отгрузок", "red") : badge("Норма", "green")
    ]));
  }

  function objectLink(type, name) {
    return `<button class="v2-object-link" data-open-object="${type}" data-object-name="${encodeURIComponent(name)}">${name}</button>`;
  }

  function renderSdmTeamTable(deals) {
    const rows = groupBy(deals, (deal) => deal.sdm).map(({key, rows}) => {
      const plan = data.plans.find((plan) => plan.role === "SDM" && plan.name === key && plan.period === state.filters.period)?.plan || 0;
      return { name: key, plan, fact: factAmount(rows), forecast: forecastAmount(rows), count: rows.length, noShipVendors: groupBy(rows, (deal) => deal.vendor).filter((group) => sum(group.rows, (deal) => deal.shipmentAmount) === 0).length, risk: rows.filter((deal) => deal.health === "red").length };
    }).sort((a, b) => b.risk - a.risk || b.forecast - a.forecast);
    return table(["SDM","План","Факт","Прогноз","ВС","Вендоры без отгрузок","Сделки под риском"], rows.map((row) => [
      row.name, money.format(row.plan), money.format(row.fact), money.format(row.forecast), row.count, row.noShipVendors, row.risk
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
    const noShipment = deals.filter((deal) => deal.status !== "Проиграна" && !deal.shipmentAmount).length;
    if (gap > 0) return `До выполнения плана за ${periodLabel()} не хватает ${money.format(gap)}. AI рекомендует сфокусироваться на ${burnout} сделках с высоким риском выгорания и ${noShipment} сделках без отгрузки в 1С.`;
    return `Прогноз AI выше плана на ${money.format(forecast - plan)}. Основной риск — не потерять сделки с переносами и истёкшим КП.`;
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
    return deal.riskScore * 10 + deal.transferCount * 4 + (deal.burnoutRisk === "Высокий" ? 12 : 0) + (deal.cpExpired ? 8 : 0);
  }

  function renderProblemZones(deals) {
    const transfers = deals.filter((deal) => deal.transferCount >= 3).length;
    const noShipment = deals.filter((deal) => deal.status !== "Проиграна" && !deal.shipmentAmount).length;
    const lowConfidence = deals.filter((deal) => forecastConfidence(deal) < 45).length;
    const burned = deals.filter((deal) => deal.burnoutRisk === "Высокий").length;
    const zones = [
      { key: "transfers", label: "3+ переноса", value: transfers, note: "сделки требуют переквалификации", level: transfers ? "red" : "green" },
      { key: "noShipment", label: "Нет отгрузки в 1С", value: noShipment, note: "есть ВС, нет факта или факт давно", level: noShipment ? "red" : "green" },
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

  function renderQualitySignals(deals) {
    const stale = deals.filter((deal) => deal.lastActivityDays > 21).length;
    const expiredCp = deals.filter((deal) => deal.cpExpired).length;
    const overForecast = deals.filter((deal) => deal.managerForecast - deal.aiForecast > deal.amount * 0.22).length;
    return `<div class="v2-list">
      <div class="v2-list-item"><span><strong>${stale} сделок без активности 21+ день</strong><span>AI снижает доверие и рекомендует обновить статус.</span></span>${badge(stale ? "контроль" : "норма", stale ? "red" : "green")}</div>
      <div class="v2-list-item"><span><strong>${expiredCp} сделок с истёкшим КП</strong><span>Нужно подтвердить актуальность условий и сроков.</span></span>${badge(expiredCp ? "риск" : "норма", expiredCp ? "red" : "green")}</div>
      <div class="v2-list-item"><span><strong>${overForecast} завышенных прогнозов роли</strong><span>Расхождение с AI больше 22% от суммы сделки.</span></span>${badge(overForecast ? "проверить" : "норма", overForecast ? "yellow" : "green")}</div>
    </div>`;
  }

  function renderAllDeals(deals) {
    const rows = [...deals].sort((a, b) => riskRank(b) - riskRank(a));
    return `
      ${renderKpis(deals)}
      ${renderProblemZones(baseFilteredDeals())}
      ${renderForecastVisual(deals)}
      ${renderTrend(baseFilteredDeals())}
      ${renderTodayActions(deals)}
      <section class="v2-table-card">
        <div class="v2-panel-head"><h2>Все возможные сделки</h2><span>${rows.length} в выборке · клик открывает карточку</span></div>
        <div class="v2-table-wrap">
          <table class="v2-table">
            <thead><tr><th>ID</th><th>Статус</th><th>Партнёр</th><th>Вендор</th><th>PAM</th><th>SDM</th><th>Sale</th><th>Макрорегион</th><th>Сумма</th><th>AI</th><th>Прогноз роли</th><th>Доверие</th><th>Здоровье</th><th>Переносы</th><th>Активность</th><th>КП</th><th>Отгрузка 1С</th><th>Выгорание</th></tr></thead>
            <tbody>${rows.map((deal) => {
              const confidence = forecastConfidence(deal);
              return `<tr class="v2-row-${deal.health}" data-open-deal="${deal.id}">
              <td><strong>${deal.id}</strong></td><td>${deal.status}</td><td>${deal.partner}</td><td>${deal.vendor}</td><td>${deal.pam}</td><td>${deal.sdm}</td><td>${deal.sale}</td><td>${deal.region}</td><td class="v2-num">${money.format(deal.amount)}</td><td class="v2-num">${deal.probability}%</td><td class="v2-num">${money.format(deal.managerForecast)}</td><td>${scorePill(confidence)}</td><td><span class="v2-badge ${deal.health}">${healthLabels[deal.health]}</span></td><td>${deal.transferCount}</td><td>${deal.lastActivityDays} дн.</td><td>${deal.cpExpired ? "Истёк" : deal.cpAgeDays ? `${deal.cpAgeDays} дн.` : "нет КП"}</td><td>${deal.shipmentAmount ? money.format(deal.shipmentAmount) : "нет"}</td><td><span class="v2-badge ${deal.burnoutRisk === "Высокий" ? "red" : deal.burnoutRisk === "Средний" ? "yellow" : "green"}">${deal.burnoutRisk}</span></td>
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
          <p>${objectDeals.length} ВС · ${money.format(sum(objectDeals, (deal) => deal.amount))} pipeline · ${money.format(sum(objectDeals, (deal) => deal.shipmentAmount))} факт 1С</p>
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
    return table(["ID","Статус","Сумма","AI","Здоровье","Активность"], rows.map((deal) => [
      `<button class="v2-object-link" data-open-deal="${deal.id}">${deal.id}</button>`,
      deal.status,
      money.format(deal.amount),
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
          ${kpi("Вероятность", `${deal.probability}%`, healthLabels[deal.health], deal.health === "red" ? "is-danger" : "")}
          ${kpi("Доверие к прогнозу", `${confidence}%`, confidenceMeta.label, confidenceMeta.color === "red" ? "is-danger" : confidenceMeta.color === "yellow" ? "is-warning" : "")}
          ${kpi("Сумма ВС", money.format(deal.amount), `${deal.status} · ${deal.stage}`)}
          ${kpi("Прогноз роли / AI", `${money.format(deal.managerForecast)} / ${money.format(deal.aiForecast)}`, `расхождение ${money.format(deal.managerForecast - deal.aiForecast)}`, deal.managerForecast - deal.aiForecast > deal.amount * 0.22 ? "is-warning" : "")}
          ${kpi("Переносы", deal.transferCount, deal.transferCount >= 3 ? "нужна переквалификация" : "в пределах контроля", deal.transferCount >= 3 ? "is-danger" : "")}
          ${kpi("Связь с 1С", deal.shipmentAmount ? money.format(deal.shipmentAmount) : "нет отгрузки", deal.lastShipmentDays ? `последняя ${deal.lastShipmentDays} дн.` : "факт не найден", !deal.shipmentAmount ? "is-danger" : "")}
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
      ["1С", deal.shipmentAmount ? `отгрузка ${money.format(deal.shipmentAmount)}` : "отгрузка не найдена", deal.shipmentAmount ? "green" : "yellow"],
      ["Прогноз", `роль выше AI на ${money.format(deal.managerForecast - deal.aiForecast)}`, deal.managerForecast - deal.aiForecast > deal.amount * 0.22 ? "red" : "green"]
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

  function wireEvents() {
    document.querySelectorAll("[data-v2-role]").forEach((button) => {
      button.addEventListener("click", () => {
        state.role = button.dataset.v2Role;
        state.selectedDealId = null;
        state.selectedObject = null;
        state.focusZone = "all";
        state.monthFocus = "all";
        state.filters.employee = "all";
        render();
      });
    });
    document.querySelectorAll("[data-filter]").forEach((input) => {
      input.addEventListener("change", () => {
        state.filters[input.dataset.filter] = input.value;
        state.selectedDealId = null;
        state.selectedObject = null;
        state.focusZone = "all";
        state.monthFocus = "all";
        render();
      });
    });
    document.querySelectorAll("[data-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        state.focusZone = state.focusZone === button.dataset.preset ? "all" : button.dataset.preset;
        state.monthFocus = "all";
        state.selectedDealId = null;
        state.selectedObject = null;
        render();
      });
    });
    document.querySelector("[data-reset-v2]")?.addEventListener("click", () => {
      state.filters = { period: "month", region: "all", employee: "all", partner: "all", vendor: "all", status: "all", amount: "all", health: "all" };
      state.focusZone = "all";
      state.monthFocus = "all";
      state.selectedDealId = null;
      state.selectedObject = null;
      render();
    });
    document.querySelectorAll("[data-focus-zone]").forEach((button) => {
      button.addEventListener("click", () => {
        const zone = button.dataset.focusZone;
        state.focusZone = state.focusZone === zone ? "all" : zone;
        state.monthFocus = "all";
        state.selectedDealId = null;
        state.selectedObject = null;
        render();
      });
    });
    document.querySelectorAll("[data-open-deal]").forEach((row) => {
      row.addEventListener("click", () => {
        state.selectedDealId = row.dataset.openDeal;
        state.selectedObject = null;
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
        state.monthFocus = "all";
        render();
      });
    });
    document.querySelectorAll("[data-open-object]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        state.selectedObject = { type: button.dataset.openObject, name: decodeURIComponent(button.dataset.objectName) };
        state.selectedDealId = null;
        render();
        requestAnimationFrame(() => appRoot().scrollIntoView({ behavior: "smooth", block: "start" }));
      });
    });
    document.querySelector("[data-back-object]")?.addEventListener("click", () => {
      state.selectedObject = null;
      render();
    });
    document.querySelector("[data-clear-focus]")?.addEventListener("click", () => {
      state.focusZone = "all";
      state.monthFocus = "all";
      state.selectedObject = null;
      state.selectedDealId = null;
      render();
    });
    document.querySelectorAll("[data-trend-month]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedObject = null;
        state.selectedDealId = null;
        state.monthFocus = state.monthFocus === button.dataset.trendMonth ? "all" : button.dataset.trendMonth;
        render();
      });
    });
    document.querySelector("[data-create-bulk-tasks]")?.addEventListener("click", createBulkTasks);
    document.querySelector("[data-create-task]")?.addEventListener("click", (event) => createTask(event.currentTarget.dataset.createTask));
  }

  document.addEventListener("DOMContentLoaded", render);
})();
