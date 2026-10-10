const STORAGE_KEY = "budgetbuddy.data.v1";
const CURRENCIES = {
  INR: ["INR", "en-IN"],
  USD: ["USD", "en-US"],
  EUR: ["EUR", "de-DE"],
  GBP: ["GBP", "en-GB"],
  CAD: ["CAD", "en-CA"],
  AUD: ["AUD", "en-AU"],
};
const CATEGORIES = {
  expense: [
    "Food",
    "Travel",
    "Education",
    "Shopping",
    "Entertainment",
    "Other",
  ],
  income: [
    "Part-time job",
    "Scholarship",
    "Allowance",
    "Freelance",
    "Other income",
  ],
};
const CATEGORY_COLORS = [
  "#31856a",
  "#df9457",
  "#688aaa",
  "#cf7283",
  "#a18bc1",
  "#9da89d",
];
const CATEGORY_ICONS = {
  Food: "utensils",
  Travel: "bus",
  Education: "book-open",
  Shopping: "shopping-bag",
  Entertainment: "clapperboard",
  Other: "circle-ellipsis",
  "Part-time job": "briefcase-business",
  Scholarship: "graduation-cap",
  Allowance: "hand-coins",
  Freelance: "laptop",
  "Other income": "circle-plus",
};
const today = new Date();
const state = loadState();
let editingId = null;
let showingAll = false;
let toastTimer;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      transactions: Array.isArray(saved.transactions)
        ? saved.transactions.filter(isValidStoredTransaction)
        : [],
      budgets:
        saved.budgets &&
        typeof saved.budgets === "object" &&
        !Array.isArray(saved.budgets)
          ? saved.budgets
          : {},
      currency: CURRENCIES[saved.currency] ? saved.currency : "INR",
    };
  } catch {
    return { transactions: [], budgets: {}, currency: "INR" };
  }
}

function isValidStoredTransaction(item) {
  return (
    item &&
    typeof item.id === "string" &&
    typeof item.description === "string" &&
    Number.isFinite(item.amount) &&
    item.amount > 0 &&
    ["income", "expense"].includes(item.type) &&
    typeof item.category === "string" &&
    typeof item.date === "string"
  );
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    showToast("Could not save your changes. Check your browser storage.");
    return false;
  }
}

function money(value) {
  const [currency, locale] = CURRENCIES[state.currency];
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function shortMoney(value) {
  const [currency, locale] = CURRENCIES[state.currency];
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: Math.abs(value) >= 100000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKey(date = today) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonthTransactions() {
  return state.transactions.filter(
    (item) => item.date.slice(0, 7) === monthKey(),
  );
}

function formatDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: year === today.getFullYear() ? undefined : "numeric",
  }).format(new Date(year, month - 1, day));
}

function render() {
  const current = currentMonthTransactions();
  const income = current
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);
  const expenses = current
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);
  const balance = state.transactions.reduce(
    (sum, item) => sum + (item.type === "income" ? item.amount : -item.amount),
    0,
  );
  const budget = Number(state.budgets[monthKey()]) || 0;

  document.querySelector("#balance-total").textContent = money(balance);
  document.querySelector("#income-total").textContent = money(income);
  document.querySelector("#expense-total").textContent = money(expenses);
  document.querySelector("#remaining-total").textContent = money(
    budget > 0 ? budget - expenses : 0,
  );
  document.querySelector("#remaining-note").textContent =
    budget > 0
      ? expenses > budget
        ? "Over your monthly budget"
        : "Remaining in your monthly budget"
      : "Set a monthly budget to get started";
  document.querySelector("#today-label").textContent = new Intl.DateTimeFormat(
    undefined,
    { weekday: "short", month: "short", day: "numeric" },
  ).format(today);
  document.querySelector("#month-eyebrow").textContent =
    new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" })
      .format(today)
      .toUpperCase();
  document.querySelector("#spending-period").textContent =
    new Intl.DateTimeFormat(undefined, {
      month: "short",
      year: "numeric",
    }).format(today);
  document.querySelector("#budget-period").textContent =
    new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
    }).format(today);
  document.querySelector("#budget-spent").textContent = money(expenses);
  document.querySelector("#budget-limit").textContent = money(budget);
  document.querySelector("#budget-input").value = budget || "";

  const progress = budget > 0 ? (expenses / budget) * 100 : 0;
  const progressBar = document.querySelector("#budget-progress");
  progressBar.setAttribute(
    "aria-valuenow",
    String(Math.min(100, Math.round(progress))),
  );
  progressBar.classList.toggle("warning", progress >= 80 && progress <= 100);
  progressBar.classList.toggle("over", progress > 100);
  document.querySelector("#budget-progress-fill").style.width =
    `${Math.min(100, progress)}%`;
  document.querySelector("#budget-message").textContent =
    budget === 0
      ? "Add a monthly budget to track your spending."
      : progress > 100
        ? `You're ${money(expenses - budget)} over your budget. Take a look at your spending.`
        : progress >= 80
          ? `${Math.round(progress)}% used. You're getting close to your monthly limit.`
          : `${Math.round(progress)}% used. ${money(Math.max(0, budget - expenses))} left to spend this month.`;

  renderCategories(current.filter((item) => item.type === "expense"));
  renderTrend();
  renderTransactions();
}

function renderCategories(expenses) {
  const totals = new Map(CATEGORIES.expense.map((category) => [category, 0]));
  expenses.forEach((item) =>
    totals.set(
      CATEGORIES.expense.includes(item.category) ? item.category : "Other",
      (totals.get(
        CATEGORIES.expense.includes(item.category) ? item.category : "Other",
      ) || 0) + item.amount,
    ),
  );
  const sorted = [...totals.entries()]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, [, value]) => sum + value, 0);
  const body = document.querySelector("#spending-body");
  if (total === 0) {
    body.innerHTML = `<div class="donut-wrap"><div class="donut-chart"></div><div class="donut-center"><strong>${money(0)}</strong><span>THIS MONTH</span></div></div><div class="empty-chart-copy">Your category breakdown will appear after your first expense.</div>`;
    return;
  }
  let offset = 0;
  const segments = sorted.map(([, value], index) => {
    const end = offset + (value / total) * 100;
    const segment = `${CATEGORY_COLORS[CATEGORIES.expense.indexOf(sorted[index][0])]} ${offset}% ${end}%`;
    offset = end;
    return segment;
  });
  const rows = sorted
    .slice(0, 5)
    .map(
      ([category, value]) =>
        `<div class="category-row"><i class="category-dot" style="--category-color:${CATEGORY_COLORS[CATEGORIES.expense.indexOf(category)]}"></i><span class="category-name">${escapeHtml(category)}</span><span class="category-amount">${shortMoney(value)}</span></div>`,
    )
    .join("");
  body.innerHTML = `<div class="donut-wrap"><div class="donut-chart" style="background:conic-gradient(${segments.join(",")})"></div><div class="donut-center"><strong>${shortMoney(total)}</strong><span>THIS MONTH</span></div></div><div class="category-list">${rows}</div>`;
}

function monthTotals() {
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - 5 + index, 1);
    const key = monthKey(date);
    const total = state.transactions
      .filter(
        (item) => item.type === "expense" && item.date.slice(0, 7) === key,
      )
      .reduce((sum, item) => sum + item.amount, 0);
    return {
      label: new Intl.DateTimeFormat(undefined, { month: "short" }).format(
        date,
      ),
      total,
    };
  });
}

function renderTrend() {
  const canvas = document.querySelector("#trend-chart");
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  const months = monthTotals();
  const max = Math.max(...months.map((item) => item.total), 1);
  const pad = { top: 12, right: 9, bottom: 12, left: 9 };
  const graphWidth = width - pad.left - pad.right;
  const graphHeight = height - pad.top - pad.bottom;
  const points = months.map((item, index) => ({
    x: pad.left + (graphWidth * index) / (months.length - 1),
    y: pad.top + graphHeight - (item.total / max) * (graphHeight * 0.82 + 2),
  }));
  context.font = "9px 'DM Sans', sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  for (let line = 0; line < 3; line += 1) {
    const y = pad.top + (graphHeight * line) / 2;
    context.beginPath();
    context.strokeStyle = "#eef1ef";
    context.lineWidth = 1;
    context.moveTo(pad.left, y);
    context.lineTo(width - pad.right, y);
    context.stroke();
  }
  const gradient = context.createLinearGradient(
    0,
    pad.top,
    0,
    height - pad.bottom,
  );
  gradient.addColorStop(0, "#48a47d33");
  gradient.addColorStop(1, "#48a47d00");
  context.beginPath();
  context.moveTo(points[0].x, height - pad.bottom);
  points.forEach((point) => context.lineTo(point.x, point.y));
  context.lineTo(points[points.length - 1].x, height - pad.bottom);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();
  context.beginPath();
  points.forEach((point, index) =>
    index === 0
      ? context.moveTo(point.x, point.y)
      : context.lineTo(point.x, point.y),
  );
  context.strokeStyle = "#27815f";
  context.lineWidth = 2;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke();
  points.forEach((point) => {
    context.beginPath();
    context.arc(point.x, point.y, 3, 0, Math.PI * 2);
    context.fillStyle = "#fff";
    context.fill();
    context.strokeStyle = "#27815f";
    context.lineWidth = 1.5;
    context.stroke();
  });
  const labels = document.querySelector("#trend-labels");
  labels.replaceChildren(
    ...months.map((item) => {
      const element = document.createElement("span");
      element.textContent = item.label;
      return element;
    }),
  );
}

function renderTransactions() {
  const search = document
    .querySelector("#search-input")
    .value.trim()
    .toLocaleLowerCase();
  const category = document.querySelector("#category-filter").value;
  const type = document.querySelector("#type-filter").value;
  const filtered = [...state.transactions]
    .filter(
      (item) =>
        (category === "all" || item.category === category) &&
        (type === "all" || item.type === type) &&
        (!search ||
          `${item.description} ${item.category} ${item.type}`
            .toLocaleLowerCase()
            .includes(search)),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const shown = showingAll ? filtered : filtered.slice(0, 5);
  const list = document.querySelector("#transaction-list");
  list.innerHTML = shown
    .map((item) => {
      const sign = item.type === "income" ? "+" : "−";
      const icon = CATEGORY_ICONS[item.category] || "circle-ellipsis";
      return `<tr><td><div class="transaction-name"><span class="transaction-avatar"><i data-lucide="${icon}"></i></span><div><div class="transaction-title">${escapeHtml(item.description)}</div><div class="transaction-type">${item.type === "income" ? "Income" : "Expense"}</div></div></div></td><td><span class="category-badge">${escapeHtml(item.category)}</span></td><td>${formatDate(item.date)}</td><td class="amount-cell ${item.type === "income" ? "income-amount" : ""}">${sign}${money(item.amount)}</td><td><div class="row-actions"><button class="row-action" type="button" data-edit="${escapeHtml(item.id)}" aria-label="Edit ${escapeHtml(item.description)}" title="Edit"><i data-lucide="pencil"></i></button><button class="row-action delete" type="button" data-delete="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.description)}" title="Delete"><i data-lucide="trash-2"></i></button></div></td></tr>`;
    })
    .join("");
  const noTransactions = state.transactions.length === 0;
  document.querySelector("#empty-state").hidden = !noTransactions;
  document.querySelector(".table-wrap").hidden =
    noTransactions || filtered.length === 0;
  document.querySelector("#no-results").hidden =
    noTransactions || filtered.length > 0;
  document.querySelector(".transaction-tools").hidden = noTransactions;
  document.querySelector("#transaction-count").textContent =
    `${state.transactions.length} ${state.transactions.length === 1 ? "entry" : "entries"}`;
  const footer = document.querySelector("#table-footer");
  footer.hidden =
    noTransactions || filtered.length === 0 || filtered.length <= 5;
  document.querySelector("#result-count").textContent =
    `Showing ${shown.length} of ${filtered.length} transactions`;
  document.querySelector("#show-less-button").hidden = !showingAll;
  document.querySelector("#view-all-button").hidden =
    noTransactions || filtered.length <= 5;
  document.querySelector("#view-all-button").innerHTML = showingAll
    ? 'Show recent <i data-lucide="arrow-right"></i>'
    : 'View all <i data-lucide="arrow-right"></i>';
  if (window.lucide)
    window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

function populateCategoryOptions(type, selected = "") {
  const transactionSelect = document.querySelector("#transaction-category");
  transactionSelect.innerHTML = CATEGORIES[type]
    .map(
      (category) =>
        `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`,
    )
    .join("");
  if (selected && CATEGORIES[type].includes(selected))
    transactionSelect.value = selected;
  const filter = document.querySelector("#category-filter");
  const priorValue = filter.value || "all";
  filter.innerHTML = `<option value="all">All categories</option>${[...CATEGORIES.expense, ...CATEGORIES.income].map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}`;
  filter.value = [...CATEGORIES.expense, ...CATEGORIES.income].includes(
    priorValue,
  )
    ? priorValue
    : "all";
}

function openModal(transaction = null) {
  editingId = transaction?.id ?? null;
  const form = document.querySelector("#transaction-form");
  form.reset();
  const type = transaction?.type ?? "expense";
  form.elements.type.value = type;
  populateCategoryOptions(type, transaction?.category);
  form.elements.description.value = transaction?.description ?? "";
  form.elements.amount.value = transaction?.amount ?? "";
  form.elements.date.value = transaction?.date ?? localDateString(new Date());
  document
    .querySelectorAll(".type-option")
    .forEach((option) =>
      option.classList.toggle("selected", option.dataset.type === type),
    );
  document.querySelector("#modal-title").textContent = editingId
    ? "Edit transaction"
    : "Add a transaction";
  document.querySelector("#save-transaction-button").textContent = editingId
    ? "Save changes"
    : "Save transaction";
  document.querySelector("#amount-currency").textContent =
    new Intl.NumberFormat(CURRENCIES[state.currency][1], {
      style: "currency",
      currency: state.currency,
    })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? "₹";
  document.querySelector("#form-error").hidden = true;
  document.querySelector("#transaction-modal").hidden = false;
  document.querySelector("#description-input").focus();
}

function closeModal() {
  document.querySelector("#transaction-modal").hidden = true;
  editingId = null;
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function handleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const description = String(formData.get("description") || "").trim();
  const amount = Number(formData.get("amount"));
  const date = String(formData.get("date") || "");
  const type = String(formData.get("type"));
  const category = String(formData.get("category"));
  const error = document.querySelector("#form-error");
  if (
    !description ||
    description.length > 80 ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !CATEGORIES[type]?.includes(category)
  ) {
    error.textContent = !description
      ? "Add a description for this transaction."
      : !Number.isFinite(amount) || amount <= 0
        ? "Enter an amount greater than zero."
        : "Check the transaction details and try again.";
    error.hidden = false;
    return;
  }
  const entry = {
    id:
      editingId || (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
    description,
    amount: Math.round(amount * 100) / 100,
    date,
    type,
    category,
  };
  if (editingId)
    state.transactions = state.transactions.map((item) =>
      item.id === editingId ? entry : item,
    );
  else state.transactions.push(entry);
  if (!saveState()) return;
  closeModal();
  render();
  showToast(
    editingId
      ? "Transaction updated."
      : `${type === "income" ? "Income" : "Expense"} added.`,
  );
}

function handleBudgetSubmit(event) {
  event.preventDefault();
  const input = document.querySelector("#budget-input");
  const amount = Number(input.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    input.setCustomValidity("Enter a monthly budget greater than zero.");
    input.reportValidity();
    input.setCustomValidity("");
    return;
  }
  state.budgets[monthKey()] = Math.round(amount * 100) / 100;
  if (!saveState()) return;
  render();
  showToast("Monthly budget saved.");
}

function init() {
  document.querySelector("#currency-select").value = state.currency;
  populateCategoryOptions("expense");
  document
    .querySelector("#transaction-form")
    .addEventListener("submit", handleSubmit);
  document
    .querySelector("#budget-form")
    .addEventListener("submit", handleBudgetSubmit);
  document.querySelectorAll(".type-option").forEach((option) =>
    option.addEventListener("click", () => {
      document.querySelector("#transaction-form").elements.type.value =
        option.dataset.type;
      document
        .querySelectorAll(".type-option")
        .forEach((button) =>
          button.classList.toggle("selected", button === option),
        );
      populateCategoryOptions(option.dataset.type);
    }),
  );
  ["#add-button", "#header-add-button", "#empty-add-button"].forEach(
    (selector) =>
      document
        .querySelector(selector)
        .addEventListener("click", () => openModal()),
  );
  document
    .querySelectorAll(".close-modal,.cancel-modal")
    .forEach((button) => button.addEventListener("click", closeModal));
  document
    .querySelector("#transaction-modal")
    .addEventListener("click", (event) => {
      if (event.target === event.currentTarget) closeModal();
    });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
      document.querySelector("#sidebar").classList.remove("open");
    }
    if (
      event.key === "/" &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
    ) {
      event.preventDefault();
      document.querySelector("#search-input").focus();
    }
  });
  document.querySelector("#search-input").addEventListener("input", () => {
    showingAll = true;
    renderTransactions();
  });
  document.querySelector("#category-filter").addEventListener("change", () => {
    showingAll = true;
    renderTransactions();
  });
  document.querySelector("#type-filter").addEventListener("change", () => {
    showingAll = true;
    renderTransactions();
  });
  document.querySelector("#view-all-button").addEventListener("click", () => {
    showingAll = !showingAll;
    renderTransactions();
  });
  document.querySelector("#show-less-button").addEventListener("click", () => {
    showingAll = false;
    renderTransactions();
    document
      .querySelector("#transactions")
      .scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document
    .querySelector("#transaction-list")
    .addEventListener("click", (event) => {
      const editButton = event.target.closest("[data-edit]");
      const deleteButton = event.target.closest("[data-delete]");
      if (editButton)
        openModal(
          state.transactions.find(
            (item) => item.id === editButton.dataset.edit,
          ),
        );
      if (deleteButton) {
        const transaction = state.transactions.find(
          (item) => item.id === deleteButton.dataset.delete,
        );
        if (
          transaction &&
          window.confirm(
            `Delete "${transaction.description}"? This cannot be undone.`,
          )
        ) {
          state.transactions = state.transactions.filter(
            (item) => item.id !== transaction.id,
          );
          saveState();
          render();
          showToast("Transaction deleted.");
        }
      }
    });
  document
    .querySelector("#currency-select")
    .addEventListener("change", (event) => {
      state.currency = CURRENCIES[event.target.value]
        ? event.target.value
        : "INR";
      saveState();
      render();
    });
  document.querySelector("#menu-button").addEventListener("click", (event) => {
    const sidebar = document.querySelector("#sidebar");
    const isOpen = sidebar.classList.toggle("open");
    event.currentTarget.setAttribute("aria-expanded", String(isOpen));
  });
  document.querySelectorAll(".nav-link,.brand").forEach((link) =>
    link.addEventListener("click", () => {
      document
        .querySelectorAll(".nav-link")
        .forEach((nav) =>
          nav.classList.toggle(
            "active",
            nav.getAttribute("href") === link.getAttribute("href"),
          ),
        );
      document.querySelector("#sidebar").classList.remove("open");
      document
        .querySelector("#menu-button")
        .setAttribute("aria-expanded", "false");
    }),
  );
  window.addEventListener("resize", renderTrend);
  render();
  if (window.lucide)
    window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
}

init();
