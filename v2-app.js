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

  function periodLabel() {
    return state.filters.period === "quarter" ? "квартал" : "месяц";
  }

  function render() {
    const root = appRoot();
    const deals = filteredDeals();
    root.innerHTML = `
      <section class="v2-shell">
        ${renderTopbar(deals)}
        ${state.selectedDealId ? renderDealDetail(deals) : renderRoleScreen(deals)}
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
      </section>
    `;
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

  function renderRoleScreen(deals) {
    if (state.role === "allDeals") return renderAllDeals(deals);
    return `
      ${renderKpis(deals)}
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
          <div class="v2-panel-head"><h2>Проблемные зоны</h2><span>переносы · выгорание</span></div>
          ${renderProblemZones(deals)}
        </div>
        <div class="v2-panel">
          <div class="v2-panel-head"><h2>Демо-задачи</h2><span>${state.tasks.length}</span></div>
          ${renderTasks()}
        </div>
      </section>
    `;
  }

  function renderKpis(deals) {
    const plan = planForCurrentRole();
    const fact = factAmount(deals);
    const forecast = forecastAmount(deals);
    const gap = Math.max(0, plan - forecast);
    const red = deals.filter((deal) => deal.health === "red").length;
    const transferAmount = sum(deals.filter((deal) => deal.transferCount > 0), (deal) => deal.amount);
    return `
      <section class="v2-grid">
        ${kpi("План из 1С", money.format(plan), `${periodLabel()} · выбранная роль`)}
        ${kpi("Факт", money.format(fact), `${Math.round((fact / Math.max(plan, 1)) * 100)}% выполнения`)}
        ${kpi("Прогноз AI", money.format(forecast), `разрыв ${money.format(gap)}`)}
        ${kpi("Красные / переносы", `${red} / ${deals.filter((deal) => deal.transferCount > 0).length}`, `перенесено ${money.format(transferAmount)}`, red ? "is-danger" : "")}
      </section>
    `;
  }

  function kpi(label, value, note, mod = "") {
    return `<article class="v2-card ${mod}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
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
      return { name: key, count: rows.length, won: rows.filter((deal) => deal.status === "Выиграна").length, shipments, last: Math.min(...rows.map((deal) => deal.lastShipmentDays || 999)), activity: sum(rows, (deal) => deal.activityCount), conversion: avg(rows, (deal) => deal.partnerConversion), waste: rows.length >= 4 && avg(rows, (deal) => deal.partnerConversion) < 42 && shipments < 5_000_000 };
    }).sort((a, b) => Number(b.waste) - Number(a.waste) || a.last - b.last);
    return table(["Партнёр","ВС","Закрыто","Отгрузка 1С","Последняя отгрузка","Активности","Конверсия","Риск"], rows.slice(0, 14).map((row) => [
      row.name, row.count, row.won, money.format(row.shipments), row.last > 300 ? "давно / нет" : `${row.last} дн.`, row.activity, `${row.conversion}%`, row.waste ? "Тратит время" : "Норма"
    ]));
  }

  function renderVendorTable(deals) {
    const rows = groupBy(deals, (deal) => deal.vendor).map(({key, rows}) => {
      const amount = sum(rows, (deal) => deal.amount);
      const shipments = sum(rows, (deal) => deal.shipmentAmount);
      return { name: key, count: rows.length, won: rows.filter((deal) => deal.status === "Выиграна").length, amount, shipments, conversion: Math.round(rows.filter((deal) => deal.status === "Выиграна").length / rows.length * 100), avg: amount / rows.length, stale: rows.filter((deal) => deal.lastActivityDays > 21).length, risk: amount > 30_000_000 && shipments < 5_000_000 };
    }).sort((a, b) => Number(b.risk) - Number(a.risk) || b.amount - a.amount);
    return table(["Вендор","ВС","Закрыто","Сумма ВС","Отгрузка 1С","Конверсия","Средний чек","Без активности","Риск"], rows.slice(0, 14).map((row) => [
      row.name, row.count, row.won, money.format(row.amount), money.format(row.shipments), `${row.conversion}%`, money.format(row.avg), row.stale, row.risk ? "Нет отгрузок" : "Норма"
    ]));
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
    const noPartnerShip = groupBy(deals, (deal) => deal.partner).filter((group) => group.rows.length >= 2 && sum(group.rows, (deal) => deal.shipmentAmount) === 0).length;
    const noVendorShip = groupBy(deals, (deal) => deal.vendor).filter((group) => group.rows.length >= 2 && sum(group.rows, (deal) => deal.shipmentAmount) === 0).length;
    const burned = deals.filter((deal) => deal.burnoutRisk === "Высокий").length;
    return `<div class="v2-grid">
      ${kpi("3+ переноса", transfers, "сделки требуют переквалификации", transfers ? "is-danger" : "")}
      ${kpi("Партнёры без отгрузок", noPartnerShip, "есть ВС, нет факта в 1С", noPartnerShip ? "is-danger" : "")}
      ${kpi("Вендоры без отгрузок", noVendorShip, "pipeline есть, факта нет", noVendorShip ? "is-danger" : "")}
      ${kpi("Высокое выгорание", burned, "нет активности / истёк КП", burned ? "is-danger" : "")}
    </div>`;
  }

  function renderAllDeals(deals) {
    const rows = [...deals].sort((a, b) => riskRank(b) - riskRank(a));
    return `
      ${renderKpis(deals)}
      <section class="v2-table-card">
        <div class="v2-panel-head"><h2>Все возможные сделки</h2><span>${rows.length} в выборке · клик открывает карточку</span></div>
        <div class="v2-table-wrap">
          <table class="v2-table">
            <thead><tr><th>ID</th><th>Статус</th><th>Партнёр</th><th>Вендор</th><th>PAM</th><th>SDM</th><th>Sale</th><th>Макрорегион</th><th>Сумма</th><th>Вероятность</th><th>Здоровье</th><th>Переносы</th><th>Активность</th><th>КП</th><th>Отгрузка 1С</th><th>Выгорание</th></tr></thead>
            <tbody>${rows.map((deal) => `<tr data-open-deal="${deal.id}">
              <td><strong>${deal.id}</strong></td><td>${deal.status}</td><td>${deal.partner}</td><td>${deal.vendor}</td><td>${deal.pam}</td><td>${deal.sdm}</td><td>${deal.sale}</td><td>${deal.region}</td><td class="v2-num">${money.format(deal.amount)}</td><td class="v2-num">${deal.probability}%</td><td><span class="v2-badge ${deal.health}">${healthLabels[deal.health]}</span></td><td>${deal.transferCount}</td><td>${deal.lastActivityDays} дн.</td><td>${deal.cpExpired ? "Истёк" : deal.cpAgeDays ? `${deal.cpAgeDays} дн.` : "нет КП"}</td><td>${deal.shipmentAmount ? money.format(deal.shipmentAmount) : "нет"}</td><td><span class="v2-badge ${deal.burnoutRisk === "Высокий" ? "red" : deal.burnoutRisk === "Средний" ? "yellow" : "green"}">${deal.burnoutRisk}</span></td>
            </tr>`).join("")}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderDealDetail(deals) {
    const deal = data.deals.find((item) => item.id === state.selectedDealId);
    if (!deal) {
      state.selectedDealId = null;
      return renderRoleScreen(deals);
    }
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
          ${kpi("Сумма ВС", money.format(deal.amount), `${deal.status} · ${deal.stage}`)}
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
            ${renderTasks(deal.id)}
          </div>
        </section>
      </section>
    `;
  }

  function renderTasks(dealId = null) {
    const tasks = dealId ? tasksForDeal(dealId) : state.tasks.slice(0, 6);
    if (!tasks.length) return `<div class="v2-empty">Демо-задач пока нет. Откройте сделку и нажмите “Поставить задачу”.</div>`;
    return `<div class="v2-task-list">${tasks.map((task) => `<div class="v2-task"><strong>${task.title}</strong><div class="v2-list-item span">${task.dealId} · ${task.assignee} · ${task.priority}</div></div>`).join("")}</div>`;
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
        state.filters.employee = "all";
        render();
      });
    });
    document.querySelectorAll("[data-filter]").forEach((input) => {
      input.addEventListener("change", () => {
        state.filters[input.dataset.filter] = input.value;
        state.selectedDealId = null;
        render();
      });
    });
    document.querySelectorAll("[data-open-deal]").forEach((row) => {
      row.addEventListener("click", () => {
        state.selectedDealId = row.dataset.openDeal;
        render();
        requestAnimationFrame(() => appRoot().scrollIntoView({ behavior: "smooth", block: "start" }));
      });
    });
    document.querySelector("[data-back-dashboard]")?.addEventListener("click", () => {
      state.selectedDealId = null;
      render();
    });
    document.querySelector("[data-create-task]")?.addEventListener("click", (event) => createTask(event.currentTarget.dataset.createTask));
  }

  document.addEventListener("DOMContentLoaded", render);
})();
