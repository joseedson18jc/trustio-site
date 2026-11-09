const $ = (selector) => document.querySelector(selector);
const stages = [
  "A mapear",
  "Prospecção",
  "Qualificação",
  "Reunião",
  "Proposta",
  "Ganho",
  "Perdido",
];
const tags = [
  "B2C",
  "B2B",
  "Enterprise",
  "Antifraude",
  "Risco",
  "IA privada",
  "VoiceAI",
  "Parceiros",
];
const titles = {
  accounts: "Contas prioritárias",
  pipeline: "Pipeline comercial",
  calendar: "Calendário de follow-ups",
  activities: "Registro de atividades",
  templates: "Modelos de mensagens",
  metrics: "Métricas comerciais",
};
const starterTemplates = [
  [
    "Primeiro contato · PT-BR",
    "PT-BR",
    "Olá, {{nome}}. Sou {{responsavel}}, da Trustio. Gostaria de entender como a {{empresa}} trata {{desafio}} e avaliar se {{solucao}} faz sentido para o seu time. Podemos conversar por 20 minutos em {{data}}?",
  ],
  [
    "First contact · English",
    "EN",
    "Hi {{nome}}, I am {{responsavel}} from Trustio. I would like to learn how {{empresa}} handles {{desafio}} and see if {{solucao}} could help your team. Are you available for a 20-minute call on {{data}}?",
  ],
  [
    "Retomada · PT-BR",
    "PT-BR",
    "Olá, {{nome}}. Retomo nosso contato sobre {{solucao}}. Esse tema segue como prioridade para a {{empresa}}? Podemos alinhar o próximo passo em {{data}}?",
  ],
  [
    "Follow-up · English",
    "EN",
    "Hi {{nome}}, following up on our discussion about {{solucao}}. Is this still a priority for {{empresa}}? Can we agree on a next step on {{data}}?",
  ],
  [
    "Resumo de reunião · PT-BR",
    "PT-BR",
    "Olá, {{nome}}. Obrigado pela conversa. Registramos {{decisoes}}. O próximo passo será {{proximo_passo}}, com {{responsavel}}, até {{data}}. Pode confirmar se o resumo está correto?",
  ],
  [
    "Meeting recap · English",
    "EN",
    "Hi {{nome}}, thank you for your time. We agreed on {{decisoes}}. The next step is {{proximo_passo}}, owned by {{responsavel}}, by {{data}}. Please confirm that this summary is correct.",
  ],
  [
    "Parceria · PT-BR",
    "PT-BR",
    "Olá, {{nome}}. Gostaria de avaliar uma possível parceria entre a Trustio e a {{empresa}} em {{solucao}}. Podemos conversar sobre o público atendido, a forma de atuação e os critérios de sucesso?",
  ],
  [
    "Partnership · English",
    "EN",
    "Hi {{nome}}, I would like to explore a potential partnership between Trustio and {{empresa}} around {{solucao}}. Could we discuss the target audience, scope and success criteria?",
  ],
].map(([name, language, body], index) => ({
  id: `starter-${index}`,
  kind: "template",
  name,
  language,
  body,
}));
const authConfig = window.TRUSTIO_AUTH;
const database =
  authConfig && window.supabase
    ? window.supabase.createClient(authConfig.url, authConfig.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;
let staffRole = null;
let records = [];
let view = "pipeline";
let selectedTags = new Set();
let editing = null;
let ready = false;
let layout = "board";
let activityFilter = "pending";
let stageDraft = [];
let stageVersion = 0;
let month = new Date();
month = new Date(month.getFullYear(), month.getMonth(), 1);
const money = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const date = (value) =>
  value
    ? new Date(value + "T12:00:00").toLocaleDateString("pt-BR")
    : "Não informado";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const ofKind = (kind) => records.filter((item) => item.kind === kind);
const accounts = () => ofKind("account");
const contacts = () => ofKind("contact");
const activities = () => ofKind("activity");
const get = (id) => records.find((item) => item.id === id);
const settings = () => get("pipeline-settings");
const pipelineStages = () =>
  settings()?.stages ||
  stages
    .filter((stage) => !["Ganho", "Perdido"].includes(stage))
    .map((id) => ({ id, label: id }));
const stageLabel = (id) =>
  pipelineStages().find((stage) => stage.id === id)?.label || id;
const statusOf = (item) =>
  item.status ||
  (item.stage === "Ganho" ? "won" : item.stage === "Perdido" ? "lost" : "open");
const statusLabel = (status) =>
  ({ open: "Em aberto", won: "Ganho", lost: "Perdido" })[status];
// Keep opportunities entered through the previous account form visible.
const deals = () => [
  ...ofKind("deal"),
  ...accounts().filter(
    (item) =>
      (item.value !== "" && item.value != null) ||
      (item.stage && item.stage !== "A mapear") ||
      item.next ||
      item.followup,
  ),
];
function accountFor(item) {
  return item.kind === "account" ? item : get(item.account);
}
function tagsFor(item) {
  return [
    ...new Set([...(accountFor(item)?.tags || []), ...(item.tags || [])]),
  ];
}
function matches(item) {
  const account = accountFor(item);
  const person = get(item.contactId);
  const text = [
    item.name,
    item.contact,
    person?.name,
    item.owner,
    item.segment,
    account?.name,
  ]
    .join(" ")
    .toLocaleLowerCase();
  return (
    (!$("#ownerFilter").value || item.owner === $("#ownerFilter").value) &&
    [...selectedTags].every((tag) => tagsFor(item).includes(tag)) &&
    text.includes($("#search").value.toLocaleLowerCase())
  );
}
function filteredDeals() {
  return deals().filter(
    (item) =>
      matches(item) &&
      (!$("#stageFilter").value || item.stage === $("#stageFilter").value) &&
      (!$("#statusFilter").value ||
        statusOf(item) === $("#statusFilter").value),
  );
}
function filteredAccounts() {
  return accounts().filter(matches);
}
function filteredActivities() {
  const search = $("#search").value.toLocaleLowerCase();
  return activities().filter((item) => {
    const parent = get(item.deal) || accountFor(item);
    if (!parent) return false;
    const text = [
      item.subject,
      item.type,
      item.notes,
      item.owner,
      parent.name,
      accountFor(item)?.name,
    ]
      .join(" ")
      .toLocaleLowerCase();
    return (
      (!$("#ownerFilter").value || item.owner === $("#ownerFilter").value) &&
      [...selectedTags].every((tag) => tagsFor(parent).includes(tag)) &&
      (!$("#stageFilter").value || parent.stage === $("#stageFilter").value) &&
      (!$("#statusFilter").value ||
        statusOf(parent) === $("#statusFilter").value) &&
      text.includes(search)
    );
  });
}
function isDone(item) {
  return (
    item.state === "done" || (!item.state && item.date && item.date <= today())
  );
}
function nextActivity(item) {
  return activities()
    .filter(
      (activity) =>
        !isDone(activity) &&
        (activity.deal === item.id ||
          (!activity.deal &&
            activity.account ===
              (item.kind === "account" ? item.id : item.account))),
    )
    .sort((a, b) =>
      `${a.date || "9999"}${a.time || ""}`.localeCompare(
        `${b.date || "9999"}${b.time || ""}`,
      ),
    )[0];
}
function activityBadge(item) {
  const next = nextActivity(item);
  if (!next)
    return '<span class="activity-badge missing">○ Sem atividade agendada</span>';
  const overdue = next.date < today();
  return `<span class="activity-badge ${overdue ? "overdue" : ""}">${overdue ? "⚠ Atrasada" : next.date === today() ? "◷ Hoje" : "◷ " + date(next.date)} · ${escape(next.type)}</span>`;
}
function empty(text) {
  return `<div class="empty"><span class="pill">TRUSTIO CRM</span><h2>${text}</h2><p>Adicione dados confirmados para começar.</p></div>`;
}
async function load() {
  $("#refresh").disabled = true;
  try {
    if (!database) throw Error("A conexão com o CRM está indisponível.");
    const session = await database.auth.getSession();
    if (session.error) throw session.error;
    if (!session.data.session) {
      ready = false;
      records = [];
      render();
      $("#sync").textContent = "Entre com uma conta da equipe";
      $("#notice").innerHTML =
        'Acesso da equipe Trustio. <a href="/entrar.html?next=%2Fcrm%2Fnegocios.html">Entrar no CRM</a>';
      return;
    }
    const role = await database.rpc("meu_papel");
    if (role.error) throw role.error;
    staffRole = role.data;
    if (!["admin", "colaborador"].includes(staffRole))
      throw Error("Este CRM é exclusivo da equipe Trustio.");
    const loaded = [];
    let offset = 0;
    while (true) {
      const result = await database
        .from("crm_comercial_registros")
        .select("id,kind,data,version")
        .order("id")
        .range(offset, offset + 999);
      if (result.error) throw result.error;
      loaded.push(
        ...result.data.map((row) => ({
          ...row.data,
          id: row.id,
          kind: row.kind,
          version: row.version,
        })),
      );
      if (result.data.length < 1000) break;
      offset += 1000;
    }
    records = loaded;
    ready = true;
    $("#sync").textContent =
      "● Conectado · " +
      (staffRole === "admin" ? "Administrador" : "Colaborador");
    $("#notice").textContent = "";
    render();
  } catch (error) {
    ready = false;
    $("#notice").textContent =
      error.message || "Não foi possível carregar os dados.";
  } finally {
    $("#refresh").disabled = false;
    $("#create").disabled = !ready;
  }
}
async function persist(item, method = "PUT") {
  if (!ready || !database)
    throw Error("Entre com uma conta da equipe para salvar.");
  const { history, createdAt, updatedAt, closedAt, ...editable } = item;
  const result = await database.rpc("crm_comercial_salvar", {
    p_item: editable,
    p_delete: method === "DELETE",
  });
  if (result.error)
    throw Error(result.error.message || "Não foi possível salvar.");
  const saved = result.data;
  records = records.filter((row) => row.id !== item.id);
  if (method !== "DELETE") records.push(saved.item);
  $("#sync").textContent = "● Alterações salvas";
  render();
}
function options(rows, value, blank = "Não definido") {
  return `${blank === null ? "" : `<option value="">${escape(blank)}</option>`}${rows.map((row) => `<option value="${escape(row.id)}" ${row.id === value ? "selected" : ""}>${escape(row.label || row.name)}</option>`).join("")}`;
}
function render() {
  const labels = {
    ...titles,
    pipeline: "Negócios",
    contacts: "Pessoas e contatos",
  };
  $("#title").textContent = labels[view];
  $("#subtitle").textContent =
    view === "pipeline"
      ? "Mova negócios pelo funil e mantenha o próximo passo em dia."
      : "Dados, tarefas e histórico comercial em um só lugar.";
  $("#create").textContent =
    {
      accounts: "+ Nova conta",
      contacts: "+ Novo contato",
      activities: "+ Nova atividade",
      templates: "+ Novo modelo",
    }[view] || "+ Novo negócio";
  $("#create").hidden = view === "metrics";
  $("#filters").hidden = view === "templates";
  $("#stats").hidden = ["contacts", "templates"].includes(view);
  $("#stageFilter").hidden = $("#statusFilter").hidden = ![
    "pipeline",
    "metrics",
    "calendar",
    "activities",
  ].includes(view);
  const stage = $("#stageFilter").value;
  $("#stageFilter").innerHTML = options(
    pipelineStages(),
    stage,
    "Todas as etapas",
  );
  const owner = $("#ownerFilter").value;
  $("#ownerFilter").innerHTML = options(
    [...new Set(records.map((item) => item.owner).filter(Boolean))]
      .sort()
      .map((name) => ({ id: name, label: name })),
    owner,
    "Todos os responsáveis",
  );
  document
    .querySelectorAll("nav button")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.view === view),
    );
  $("#tags").innerHTML = tags
    .map(
      (tag) =>
        `<button data-tag="${tag}" aria-pressed="${selectedTags.has(tag)}" class="${selectedTags.has(tag) ? "selected" : ""}">${tag}</button>`,
    )
    .join("");
  const list = filteredDeals();
  const open = list.filter((item) => statusOf(item) === "open");
  const known = open.filter((item) => item.value !== "" && item.value != null);
  const pending = activities().filter((item) => !isDone(item));
  const overdue = pending.filter(
    (item) => item.date && item.date < today(),
  ).length;
  const dueToday = pending.filter((item) => item.date === today()).length;
  $("#reminders").innerHTML =
    `<button data-view="activities">${overdue ? "⚠" : "✓"} ${overdue} atividades atrasadas</button><button data-view="activities">◷ ${dueToday} para hoje</button><span>Lembretes no CRM · horário de Brasília</span>`;
  $("#stats").innerHTML = [
    ["Negócios em foco", list.length, "Conforme os filtros"],
    [
      "Valor em aberto",
      known.length
        ? money(known.reduce((sum, item) => sum + Number(item.value), 0))
        : "—",
      "Valores informados · BRL",
    ],
    [
      "Valor ponderado",
      known.some((item) => item.probability !== "" && item.probability != null)
        ? money(
            known.reduce(
              (sum, item) =>
                sum +
                (Number(item.value) * Number(item.probability || 0)) / 100,
              0,
            ),
          )
        : "—",
      "Valor × probabilidade",
    ],
    [
      "Sem próxima atividade",
      open.filter((item) => !nextActivity(item)).length,
      "Negócios em aberto",
    ],
  ]
    .map(
      ([label, value, note]) =>
        `<div class="stat"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`,
    )
    .join("");
  $("#toolbar").innerHTML =
    view === "pipeline"
      ? `<div class="segmented"><button data-layout="board" aria-pressed="${layout === "board"}">▥ Funil</button><button data-layout="list" aria-pressed="${layout === "list"}">☷ Lista</button></div><span>Arraste os cartões ou use o seletor de etapa.</span><button id="configureStages" ${ready ? "" : "disabled"}>⚙ Editar funil</button>`
      : view === "activities"
        ? `<div class="segmented">${[
            ["pending", "Pendentes"],
            ["overdue", "Atrasadas"],
            ["today", "Hoje"],
            ["done", "Concluídas"],
            ["all", "Todas"],
          ]
            .map(
              ([id, label]) =>
                `<button data-activity-filter="${id}" aria-pressed="${activityFilter === id}">${label}</button>`,
            )
            .join("")}</div>`
        : "";
  const renderers = {
    pipeline: renderPipeline,
    accounts: renderAccounts,
    contacts: renderContacts,
    activities: renderActivities,
    calendar: renderCalendar,
    templates: renderTemplates,
    metrics: renderMetrics,
  };
  renderers[view](list);
}
function dealCard(item) {
  return `<article class="card deal-card" draggable="true" data-drag="${escape(item.id)}"><div class="card-top"><button data-detail="${escape(item.id)}">${escape(item.name)}</button><span class="avatar" title="${escape(item.owner || "Sem responsável")}">${escape((item.owner || "?").slice(0, 2).toUpperCase())}</span></div><strong>${item.value === "" || item.value == null ? "Valor a definir" : money(item.value)}</strong><p>${escape(accountFor(item)?.name || "Conta a definir")}${item.kind === "account" ? " · Registro anterior" : ""}</p><div class="card-tags">${tagsFor(
    item,
  )
    .map((tag) => `<span>${escape(tag)}</span>`)
    .join(
      "",
    )}</div><button class="activity-action" data-new-activity="${escape(item.id)}">${activityBadge(item)}</button><select data-move="${escape(item.id)}" aria-label="Etapa de ${escape(item.name)}">${options(pipelineStages(), item.stage, null)}</select></article>`;
}
function renderPipeline(list) {
  if (layout === "list") {
    $("#content").innerHTML = list.length
      ? table(
          [
            "Negócio",
            "Conta",
            "Valor",
            "Etapa",
            "Situação",
            "Responsável",
            "Fechamento previsto",
            "Próxima atividade",
          ],
          list.map((item) => [
            `<button data-detail="${escape(item.id)}">${escape(item.name)}</button>`,
            escape(accountFor(item)?.name || "—"),
            item.value === "" || item.value == null ? "—" : money(item.value),
            escape(stageLabel(item.stage)),
            escape(statusLabel(statusOf(item))),
            escape(item.owner || "—"),
            date(item.closeDate),
            activityBadge(item),
          ]),
        )
      : empty("Seu próximo negócio começa aqui");
    return;
  }
  const lanes = [...pipelineStages()];
  // Legacy terminal stages remain visible when viewing all or closed deals.
  for (const id of new Set(list.map((item) => item.stage)))
    if (!lanes.some((stage) => stage.id === id)) lanes.push({ id, label: id });
  $("#content").innerHTML = `<div class="board">${lanes
    .map((stage) => {
      const rows = list.filter((item) => item.stage === stage.id);
      const total = rows
        .filter((item) => item.value !== "" && item.value != null)
        .reduce((sum, item) => sum + Number(item.value), 0);
      return `<section class="lane" data-drop="${escape(stage.id)}"><div class="lane-heading"><h3>${escape(stage.label)} <span>${rows.length}</span></h3><p>${money(total)}</p></div>${rows.map(dealCard).join("")}<button class="add-in-lane" data-add-stage="${escape(stage.id)}">+ Adicionar negócio</button></section>`;
    })
    .join(
      "",
    )}</div><div class="outcome-zones"><div data-outcome="won">✓ Marcar como ganho</div><div data-outcome="lost">✕ Marcar como perdido</div></div>`;
}
function table(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((label) => `<th>${label}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function safeLink(link) {
  try {
    const url = new URL(link);
    return ["http:", "https:"].includes(url.protocol)
      ? `<a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">Abrir ↗</a>`
      : "—";
  } catch {
    return "—";
  }
}
function renderAccounts() {
  const list = filteredAccounts();
  $("#content").innerHTML = list.length
    ? table(
        [
          "Conta / prioridade",
          "Contato / cargo",
          "Segmento / foco",
          "Responsável",
          "Última interação",
          "Próximo passo",
          "Follow-up",
          "Links",
        ],
        list.map((item) => [
          `<button data-edit="${escape(item.id)}">${escape(item.name)}</button><small>${escape(item.priority || "Sem prioridade")}</small>`,
          `${escape(item.contact || "—")}<small>${escape(item.role || "—")}</small>`,
          `${escape(item.segment || "—")}<small>${escape((item.tags || []).join(" · "))}</small>`,
          escape(item.owner || "—"),
          date(item.last),
          escape(item.next || "—"),
          date(item.followup),
          safeLink(item.link),
        ]),
      )
    : empty("Cadastre as contas que deseja prospectar");
}
function renderContacts() {
  const list = contacts().filter(matches);
  $("#content").innerHTML = list.length
    ? table(
        ["Pessoa", "Cargo", "Conta", "E-mail", "Telefone", "Responsável"],
        list.map((item) => [
          `<button data-edit="${escape(item.id)}">${escape(item.name)}</button>`,
          escape(item.role || "—"),
          escape(accountFor(item)?.name || "—"),
          escape(item.email || "—"),
          escape(item.phone || "—"),
          escape(item.owner || "—"),
        ]),
      )
    : empty("Reúna os contatos de cada conta");
}
function renderActivities() {
  const list = filteredActivities()
    .filter(
      (item) =>
        activityFilter === "all" ||
        (activityFilter === "done" && isDone(item)) ||
        (activityFilter === "pending" && !isDone(item)) ||
        (activityFilter === "overdue" &&
          !isDone(item) &&
          item.date < today()) ||
        (activityFilter === "today" && !isDone(item) && item.date === today()),
    )
    .sort((a, b) =>
      `${a.date || ""}${a.time || ""}`.localeCompare(
        `${b.date || ""}${b.time || ""}`,
      ),
    );
  $("#content").innerHTML = list.length
    ? `<div class="list">${list.map(activityRow).join("")}</div>`
    : empty("Nenhuma atividade neste filtro");
}
function activityRow(item) {
  return `<article class="panel activity-row"><button class="check-activity" data-complete="${escape(item.id)}" aria-label="${isDone(item) ? "Reabrir" : "Concluir"} atividade">${isDone(item) ? "✓" : "○"}</button><div class="activity-main"><span class="pill ${!isDone(item) && item.date < today() ? "overdue" : ""}">${escape(item.type)} · ${date(item.date)} ${escape(item.time || "")} · ${isDone(item) ? "Concluída" : "Pendente"}</span><h2>${escape(item.subject || item.type)}</h2><p>${escape(get(item.deal)?.name || accountFor(item)?.name || "Registro anterior")} · ${escape(item.owner || "Responsável a definir")}</p>${item.notes ? `<p>${escape(item.notes)}</p>` : ""}${[
    ["objections", "Objeções"],
    ["decisions", "Decisões"],
    ["result", "Resultado"],
  ]
    .filter(([key]) => item[key])
    .map(([key, label]) => `<p>${label} · ${escape(item[key])}</p>`)
    .join(
      "",
    )}</div><button data-edit="${escape(item.id)}">Editar</button></article>`;
}
function calendarEvents() {
  const logs = filteredActivities().map((item) => ({
    ...item,
    eventDate: item.date,
    label: `${isDone(item) ? "✓" : "○"} ${item.subject || item.type} · ${get(item.deal)?.name || accountFor(item)?.name || ""}`,
  }));
  const followups = filteredAccounts()
    .filter((item) => item.followup)
    .map((item) => ({
      ...item,
      eventDate: item.followup,
      label: `Follow-up · ${item.name}`,
    }));
  return [...logs, ...followups];
}
function renderCalendar() {
  const year = month.getFullYear(),
    m = month.getMonth(),
    offset = new Date(year, m, 1).getDay(),
    days = new Date(year, m + 1, 0).getDate();
  const events = calendarEvents();
  const cells = Array.from(
    { length: Math.ceil((offset + days) / 7) * 7 },
    (_, index) => {
      const day = index - offset + 1;
      if (day < 1 || day > days) return '<div class="day"></div>';
      const key = `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return `<div class="day ${key === today() ? "today" : ""}">${day}${events
        .filter((item) => item.eventDate === key)
        .map(
          (item) =>
            `<button data-edit="${escape(item.id)}">${escape(item.time || "")} ${escape(item.label)}</button>`,
        )
        .join("")}</div>`;
    },
  ).join("");
  $("#content").innerHTML =
    `<div class="panel"><div class="calendar-head"><button data-month="-1" aria-label="Mês anterior">←</button><h2>${month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2><button data-month="1" aria-label="Próximo mês">→</button></div><div class="calendar">${["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => `<div class="weekday">${day}</div>`).join("")}${cells}</div><p>Atividades agendadas e follow-ups · horário de Brasília.</p></div>`;
}
function allTemplates() {
  const custom = ofKind("template");
  return [
    ...starterTemplates.filter(
      (item) => !custom.some((row) => row.id === item.id),
    ),
    ...custom,
  ];
}
function renderTemplates() {
  $("#content").innerHTML =
    `<p>Substitua os campos entre {{chaves}} antes de enviar.</p><div class="list">${allTemplates()
      .map(
        (item) =>
          `<article class="panel"><div class="template-body"><span class="pill">${escape(item.language)}</span><h2>${escape(item.name)}</h2><p>${escape(item.body)}</p></div><div><button data-copy="${escape(item.id)}">Copiar</button> <button data-template="${escape(item.id)}">Editar</button></div></article>`,
      )
      .join("")}</div>`;
}
function renderMetrics(list) {
  const won = list.filter((item) => statusOf(item) === "won"),
    lost = list.filter((item) => statusOf(item) === "lost");
  const logs = filteredActivities();
  $("#content").innerHTML =
    `<div class="metrics-grid"><section class="panel"><h2>Distribuição no funil</h2>${pipelineStages()
      .map((stage) => {
        const count = list.filter((item) => item.stage === stage.id).length;
        return `<div class="bar-row">${escape(stage.label)} · ${count}<progress max="${Math.max(list.length, 1)}" value="${count}"></progress></div>`;
      })
      .join(
        "",
      )}</section><section class="panel"><h2>Resultados comerciais</h2><p>Taxa de ganho · <strong>${won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) + "%" : "—"}</strong></p><p>Ganhos ÷ (ganhos + perdidos)</p><p>Negócios ganhos · ${won.length}<br>Negócios perdidos · ${lost.length}<br>Valor ganho informado · ${money(won.reduce((sum, item) => sum + Number(item.value || 0), 0))}</p><p>Atividades concluídas · ${logs.filter(isDone).length}<br>Atividades pendentes · ${logs.filter((item) => !isDone(item)).length}<br>Reuniões realizadas · ${logs.filter((item) => item.type === "Reunião" && isDone(item)).length}</p><p>Para avaliar a conversão, selecione “Todos os negócios” no filtro de situação.</p></section></div>`;
}
const accountFields = [
  ["name", "Conta", "text", true],
  ["priority", "Prioridade", ["", "Alta", "Média", "Baixa"]],
  ["contact", "Contato anterior"],
  ["role", "Cargo"],
  ["email", "E-mail", "email"],
  ["phone", "Telefone", "tel"],
  ["segment", "Segmento"],
  ["owner", "Responsável"],
  ["last", "Última interação", "date"],
  ["next", "Próximo passo"],
  ["followup", "Data do follow-up", "date"],
  ["stage", "Etapa anterior", stages],
  ["probability", "Probabilidade (%)", "number"],
  ["value", "Valor potencial anterior (BRL)", "number"],
  ["link", "Link principal", "url"],
  ["links", "Outros links", "textarea"],
  ["notes", "Notas", "textarea"],
];
function field([key, label, type = "text", required = false], item) {
  const value = item[key] ?? "";
  let control;
  if (Array.isArray(type))
    control = `<select name="${key}" ${required ? "required" : ""}>${type.map((option) => `<option value="${escape(option)}" ${value === option ? "selected" : ""}>${escape(option || "Não definido")}</option>`).join("")}</select>`;
  else if (type === "textarea")
    control = `<textarea name="${key}" ${required ? "required" : ""}>${escape(value)}</textarea>`;
  else
    control = `<input name="${key}" type="${type}" value="${escape(value)}" ${required ? "required" : ""} ${type === "number" ? `min="0" ${key === "probability" ? 'max="100"' : ""} step="any"` : ""}>`;
  return `<label class="${type === "textarea" ? "wide" : ""}">${label}${required ? " *" : ""}${control}</label>`;
}
function relationField(key, label, rows, value, required = false) {
  return `<label>${label}${required ? " *" : ""}<select name="${key}" ${required ? "required" : ""}>${options(rows, value)}</select></label>`;
}
function openEditor(item) {
  if (!item || !ready) return;
  editing = { ...item };
  if ($("#details").open) $("#details").close();
  $("#editorTitle").textContent = {
    account: "Dados da conta",
    contact: "Dados do contato",
    deal: "Dados do negócio",
    activity: "Agendar ou registrar atividade",
    template: "Modelo de mensagem",
  }[item.kind];
  $("#formError").textContent = "";
  $("#remove").hidden = !item.version || staffRole !== "admin";
  let fields = accountFields;
  let relations = "";
  if (item.kind === "deal") {
    fields = [
      ["name", "Título do negócio", "text", true],
      ["owner", "Responsável"],
      ["stage", "Etapa", pipelineStages().map((stage) => stage.id)],
      ["status", "Situação", ["open", "won", "lost"]],
      ["value", "Valor potencial (BRL)", "number"],
      ["probability", "Probabilidade (%)", "number"],
      ["closeDate", "Fechamento previsto", "date"],
      ["lossReason", "Motivo de perda"],
      ["next", "Próximo passo"],
      ["link", "Link principal", "url"],
      ["notes", "Notas do negócio", "textarea"],
    ];
    relations =
      relationField("account", "Conta", accounts(), item.account, true) +
      relationField(
        "contactId",
        "Contato",
        contacts().filter(
          (person) => !item.account || person.account === item.account,
        ),
        item.contactId,
      );
  }
  if (item.kind === "contact") {
    fields = [
      ["name", "Nome", "text", true],
      ["role", "Cargo"],
      ["email", "E-mail", "email"],
      ["phone", "Telefone", "tel"],
      ["owner", "Responsável"],
      ["link", "LinkedIn ou site", "url"],
      ["notes", "Notas", "textarea"],
    ];
    relations = relationField("account", "Conta", accounts(), item.account);
  }
  if (item.kind === "activity") {
    fields = [
      ["subject", "Assunto", "text", true],
      [
        "type",
        "Tipo",
        [
          "Contato",
          "Ligação",
          "E-mail",
          "Reunião",
          "Follow-up",
          "Tarefa",
          "Decisão",
          "Resultado",
        ],
      ],
      ["date", "Prazo", "date", true],
      ["time", "Horário de Brasília", "time"],
      ["state", "Situação", ["pending", "done"]],
      ["owner", "Responsável"],
      ["notes", "Registro da conversa", "textarea"],
      ["objections", "Objeções", "textarea"],
      ["decisions", "Decisões", "textarea"],
      ["result", "Resultado", "textarea"],
    ];
    relations =
      relationField("account", "Conta", accounts(), item.account, true) +
      relationField(
        "deal",
        "Negócio",
        ofKind("deal").filter(
          (deal) => !item.account || deal.account === item.account,
        ),
        item.deal,
      );
  }
  if (item.kind === "template")
    fields = [
      ["name", "Nome", "text", true],
      ["language", "Idioma", ["PT-BR", "EN"]],
      ["body", "Mensagem", "textarea", true],
    ];
  $("#fields").innerHTML =
    relations + fields.map((entry) => field(entry, item)).join("");
  if (item.kind === "account") {
    const choices = [
      ...pipelineStages(),
      ...stages
        .filter((id) => !pipelineStages().some((stage) => stage.id === id))
        .map((id) => ({ id, label: id })),
    ];
    $('#fields select[name="stage"]').innerHTML = options(
      choices,
      item.stage,
      null,
    );
  }
  if (item.kind === "deal") {
    $('#fields select[name="stage"]').innerHTML = options(
      pipelineStages(),
      item.stage,
      null,
    );
    $('#fields select[name="status"]').innerHTML = options(
      ["open", "won", "lost"].map((id) => ({ id, label: statusLabel(id) })),
      item.status || "open",
      null,
    );
  }
  if (item.kind === "activity")
    $('#fields select[name="state"]').innerHTML = options(
      [
        { id: "pending", label: "Pendente" },
        { id: "done", label: "Concluída" },
      ],
      isDone(item) ? "done" : "pending",
      null,
    );
  if (["account", "deal"].includes(item.kind))
    $("#fields").insertAdjacentHTML(
      "beforeend",
      `<div class="wide"><p>Mercado e foco comercial</p><div class="checkgroup">${tags.map((tag) => `<label><input name="tags" type="checkbox" value="${tag}" ${(item.tags || []).includes(tag) ? "checked" : ""}>${tag}</label>`).join("")}</div></div>`,
    );
  $("#editor").showModal();
}
function newRecord(kind, values = {}) {
  if (!ready) return;
  if (["deal", "activity"].includes(kind) && !accounts().length) {
    $("#notice").textContent =
      "Cadastre uma conta antes de criar negócios e atividades.";
    view = "accounts";
    render();
    return;
  }
  openEditor({
    id: crypto.randomUUID(),
    kind,
    stage: pipelineStages()[0].id,
    status: "open",
    state: "pending",
    value: "",
    probability: "",
    date: today(),
    type: "Contato",
    language: "PT-BR",
    ...values,
  });
}
function showDetail(id) {
  const item = get(id);
  if (!item) return;
  const account = accountFor(item);
  const person = get(item.contactId);
  const logs = activities()
    .filter(
      (log) =>
        log.deal === item.id ||
        (!log.deal &&
          log.account === (item.kind === "account" ? item.id : item.account)),
    )
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  $("#detailContent").innerHTML =
    `<div class="dialog-head"><span class="pill">${escape(statusLabel(statusOf(item)))}</span><button data-close-detail aria-label="Fechar">✕</button></div><h2>${escape(item.name)}</h2><p>${escape(account?.name || "Conta a definir")} · ${escape(item.owner || "Responsável a definir")}</p><div class="detail-value">${item.value === "" || item.value == null ? "Valor a definir" : money(item.value)}</div><p>${escape(stageLabel(item.stage))} · ${item.probability === "" || item.probability == null ? "Probabilidade a definir" : escape(item.probability) + "%"} · Previsão ${date(item.closeDate)}</p><div class="detail-buttons"><button class="primary" data-edit="${escape(item.id)}">Editar</button><button data-new-activity="${escape(item.id)}">+ Atividade</button><button data-status="won" data-record="${escape(item.id)}">✓ Ganho</button><button data-status="lost" data-record="${escape(item.id)}">✕ Perdido</button><button data-status="open" data-record="${escape(item.id)}">Reabrir</button></div><section class="detail-section"><h3>Contato e próximo passo</h3><p>${escape(person?.name || item.contact || "Contato a definir")} · ${escape(person?.role || item.role || "")}<br>${escape(person?.email || item.email || "")}<br>${escape(person?.phone || item.phone || "")}</p><p>${escape(item.next || "Próximo passo a definir")}</p>${activityBadge(item)}<p>${safeLink(item.link)}</p>${item.notes ? `<p>${escape(item.notes)}</p>` : ""}${item.lossReason ? `<p>Motivo de perda · ${escape(item.lossReason)}</p>` : ""}</section><section class="detail-section"><h3>Atividades e conversas</h3><div class="list">${logs.length ? logs.map(activityRow).join("") : "<p>Nenhuma atividade registrada.</p>"}</div></section><section class="detail-section"><h3>Histórico do negócio</h3>${
      [...(item.history || [])]
        .reverse()
        .map(
          (entry) =>
            `<div class="timeline-entry"><small>${new Date(entry.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</small><p>${escape(entry.text)}</p></div>`,
        )
        .join("") || "<p>O histórico começa na próxima atualização.</p>"
    }</section>`;
  $("#details").showModal();
}
const pendingDealWrites = new Map();
function updateDeal(id, changes) {
  const previous = pendingDealWrites.get(id) || Promise.resolve();
  const next = previous.then(() => saveDealUpdate(id, changes));
  pendingDealWrites.set(id, next);
  next.finally(() => {
    if (pendingDealWrites.get(id) === next) pendingDealWrites.delete(id);
  });
  return next;
}
async function saveDealUpdate(id, changes) {
  const item = get(id);
  if (!item) return;
  if (changes.status === "lost") {
    const reason = prompt("Qual foi o motivo da perda?", item.lossReason || "");
    if (reason === null) return;
    if (!reason.trim()) {
      $("#notice").textContent = "Informe o motivo da perda.";
      return;
    }
    changes.lossReason = reason;
  }
  if (item.kind === "account" && changes.status && changes.status !== "open")
    changes.stage = changes.status === "won" ? "Ganho" : "Perdido";
  if (item.kind === "account" && changes.status === "open")
    changes.stage = pipelineStages()[0].id;
  try {
    await persist({ ...item, ...changes });
    if ($("#details").open) {
      $("#details").close();
      showDetail(id);
    }
  } catch (error) {
    $("#notice").textContent = error.message;
    render();
  }
}
function activityFor(id) {
  const item = get(id);
  if ($("#details").open) $("#details").close();
  newRecord("activity", {
    account: item.kind === "account" ? item.id : item.account,
    deal: item.kind === "deal" ? item.id : "",
    owner: item.owner || "",
  });
}
function renderStageRows() {
  $("#stageRows").innerHTML = stageDraft
    .map(
      (stage, index) =>
        `<div class="stage-row"><span>${index + 1}</span><input data-stage-name="${escape(stage.id)}" aria-label="Nome da etapa ${index + 1}" required maxlength="80" value="${escape(stage.label)}"><button type="button" data-stage-up="${index}" ${index === 0 ? "disabled" : ""} aria-label="Mover etapa para cima">↑</button><button type="button" data-stage-down="${index}" ${index === stageDraft.length - 1 ? "disabled" : ""} aria-label="Mover etapa para baixo">↓</button><button type="button" data-stage-remove="${index}" aria-label="Remover etapa" ${deals().some((item) => item.stage === stage.id) ? "disabled" : ""}>✕</button></div>`,
    )
    .join("");
}
function openStages() {
  stageDraft = pipelineStages().map((stage) => ({ ...stage }));
  stageVersion = settings()?.version || 0;
  $("#stageError").textContent = "";
  renderStageRows();
  $("#stageEditor").showModal();
}
$("#create").onclick = () =>
  newRecord(
    {
      accounts: "account",
      contacts: "contact",
      activities: "activity",
      templates: "template",
    }[view] || "deal",
  );
$("#refresh").onclick = load;
$("#close").onclick = $("#cancel").onclick = () => $("#editor").close();
$("#form").onsubmit = async (event) => {
  event.preventDefault();
  $("#save").disabled = true;
  $("#formError").textContent = "";
  const data = new FormData(event.currentTarget);
  const item = { ...editing, ...Object.fromEntries(data) };
  if (["account", "deal"].includes(item.kind)) item.tags = data.getAll("tags");
  try {
    await persist(item);
    $("#editor").close();
  } catch (error) {
    $("#formError").textContent = error.message;
  } finally {
    $("#save").disabled = false;
  }
};
$("#remove").onclick = async () => {
  if (!confirm("Excluir este registro?")) return;
  try {
    await persist(editing, "DELETE");
    $("#editor").close();
  } catch (error) {
    $("#formError").textContent = error.message;
  }
};
$("#closeStages").onclick = () => $("#stageEditor").close();
$("#addStage").onclick = () => {
  stageDraft.push({ id: crypto.randomUUID(), label: "Nova etapa" });
  renderStageRows();
};
$("#stageForm").onsubmit = async (event) => {
  event.preventDefault();
  $("#saveStages").disabled = true;
  try {
    await persist({
      id: "pipeline-settings",
      kind: "settings",
      version: stageVersion,
      stages: stageDraft,
    });
    $("#stageEditor").close();
  } catch (error) {
    $("#stageError").textContent = error.message;
  } finally {
    $("#saveStages").disabled = false;
  }
};
document.addEventListener("input", (event) => {
  if (event.target.dataset.stageName)
    stageDraft.find(
      (stage) => stage.id === event.target.dataset.stageName,
    ).label = event.target.value;
});
document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const data = button.dataset;
  if (data.view) {
    view = data.view;
    render();
  }
  if (data.layout) {
    layout = data.layout;
    render();
  }
  if (data.activityFilter) {
    activityFilter = data.activityFilter;
    render();
  }
  if (data.tag) {
    selectedTags.has(data.tag)
      ? selectedTags.delete(data.tag)
      : selectedTags.add(data.tag);
    render();
  }
  if (data.edit) openEditor(get(data.edit));
  if (data.detail) showDetail(data.detail);
  if ("closeDetail" in data) $("#details").close();
  if (data.newActivity) activityFor(data.newActivity);
  if (data.status) await updateDeal(data.record, { status: data.status });
  if (data.complete) {
    const item = get(data.complete);
    try {
      await persist({ ...item, state: isDone(item) ? "pending" : "done" });
      if ($("#details").open) {
        $("#details").close();
        showDetail(item.deal || item.account);
      }
    } catch (error) {
      $("#notice").textContent = error.message;
    }
  }
  if (data.addStage) newRecord("deal", { stage: data.addStage });
  if (button.id === "configureStages") openStages();
  if (data.stageUp !== undefined || data.stageDown !== undefined) {
    const index = Number(data.stageUp ?? data.stageDown),
      target = index + (data.stageUp !== undefined ? -1 : 1);
    if (target >= 0 && target < stageDraft.length)
      [stageDraft[index], stageDraft[target]] = [
        stageDraft[target],
        stageDraft[index],
      ];
    renderStageRows();
  }
  if (data.stageRemove !== undefined && stageDraft.length > 1) {
    stageDraft.splice(Number(data.stageRemove), 1);
    renderStageRows();
  }
  if (data.template)
    openEditor(allTemplates().find((item) => item.id === data.template));
  if (data.copy) {
    try {
      await navigator.clipboard.writeText(
        allTemplates().find((item) => item.id === data.copy).body,
      );
      button.textContent = "Copiado";
    } catch {
      $("#notice").textContent = "Selecione o texto do modelo para copiar.";
    }
  }
  if (data.month) {
    month = new Date(
      month.getFullYear(),
      month.getMonth() + Number(data.month),
      1,
    );
    render();
  }
});
document.addEventListener("change", async (event) => {
  if (event.target.dataset.move)
    await updateDeal(event.target.dataset.move, { stage: event.target.value });
  if (event.target.name === "account" && editing) {
    if (editing.kind === "deal")
      $('#fields select[name="contactId"]').innerHTML = options(
        contacts().filter((person) => person.account === event.target.value),
        "",
      );
    if (editing.kind === "activity")
      $('#fields select[name="deal"]').innerHTML = options(
        ofKind("deal").filter((deal) => deal.account === event.target.value),
        "",
      );
  }
});
document.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-drag]");
  if (!card || event.target.closest("select,button")) return;
  event.dataTransfer.setData("text/plain", card.dataset.drag);
  event.dataTransfer.effectAllowed = "move";
});
document.addEventListener("dragover", (event) => {
  if (event.target.closest("[data-drop],[data-outcome]"))
    event.preventDefault();
});
document.addEventListener("drop", async (event) => {
  const target = event.target.closest("[data-drop],[data-outcome]");
  if (!target) return;
  event.preventDefault();
  const id = event.dataTransfer.getData("text/plain");
  if (target.dataset.outcome)
    await updateDeal(id, { status: target.dataset.outcome });
  else await updateDeal(id, { stage: target.dataset.drop });
});
$("#search").oninput = render;
$("#stageFilter").onchange = render;
$("#ownerFilter").onchange = render;
$("#statusFilter").onchange = render;
$("#clear").onclick = () => {
  $("#search").value = "";
  $("#stageFilter").value = "";
  $("#ownerFilter").value = "";
  $("#statusFilter").value = "";
  selectedTags.clear();
  render();
};
function syncThemeButton() {
  const light = window.TrustioTema?.atual() === "light";
  $("#themeToggle").textContent = light ? "☾ Tema escuro" : "☀ Tema claro";
  $("#themeToggle").setAttribute("aria-pressed", String(light));
}
$("#themeToggle").onclick = () => {
  window.TrustioTema?.escolher(
    window.TrustioTema.atual() === "light" ? "dark" : "light",
  );
  syncThemeButton();
};
document.addEventListener("trustio:tema", syncThemeButton);
syncThemeButton();
$("#logout").onclick = async () => {
  if (!database) return;
  const result = await database.auth.signOut();
  if (result.error) {
    $("#notice").textContent = result.error.message;
    return;
  }
  location.assign("/entrar.html?next=%2Fcrm%2Fnegocios.html");
};
if (database)
  database.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      ready = false;
      records = [];
      staffRole = null;
      document
        .querySelectorAll("dialog[open]")
        .forEach((dialog) => dialog.close());
      render();
      $("#create").disabled = true;
      $("#notice").textContent =
        "Sua sessão terminou. Entre de novo para acessar o CRM.";
    }
  });
render();
load();
