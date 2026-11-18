"use strict";

const items = document.querySelector("#items");
const itemTemplate = document.querySelector("#item-template");
const totalOutput = document.querySelector("#total");
const discountInput = document.querySelector("#discount");
const vatInput = document.querySelector("#vat");
const currencyInput = document.querySelector("#currency");
const moneyFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
let nextItemId = 0;
const draftKey = "smeta.draft.v1";
const draftFieldIds = ["sender", "recipient", "estimate-number", "estimate-date", "discount", "vat", "currency"];
const itemFieldNames = ["name", "quantity", "unit", "price"];
let replacingDraft = true;
let copyStatusTimer;

function parseNumber(value) {
  const normalized = value.trim().replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return 0;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${moneyFormatter.format(Object.is(safeValue, -0) ? 0 : safeValue).replace(/[\u00a0\u202f]/g, " ")} ${currencyInput.value}`;
}

function roundAmount(value) {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function showSummaryAmount(outputId, rowId, amount) {
  document.querySelector(outputId).textContent = formatMoney(amount);
  document.querySelector(rowId).hidden = amount === 0;
}

function recalculate() {
  let total = 0;
  for (const row of items.rows) {
    const quantity = parseNumber(row.querySelector(".item-quantity").value);
    const price = parseNumber(row.querySelector(".item-price").value);
    const product = quantity * price;
    const amount = roundAmount(product);
    row.querySelector(".item-amount").textContent = formatMoney(amount);
    const sum = total + amount;
    total = Number.isFinite(sum) ? sum : total;
  }
  const discount = roundAmount(total * (parseNumber(discountInput.value) / 100));
  const discounted = roundAmount(total - discount);
  const vat = roundAmount(discounted * (parseNumber(vatInput.value) / 100));
  document.querySelector("#subtotal").textContent = formatMoney(total);
  showSummaryAmount("#discount-amount", "#discount-row", discount);
  showSummaryAmount("#discounted-amount", "#discounted-row", discounted);
  showSummaryAmount("#vat-amount", "#vat-row", vat);
  totalOutput.textContent = formatMoney(roundAmount(discounted + vat));
  for (const symbol of document.querySelectorAll("[data-currency]")) {
    symbol.textContent = currencyInput.value;
  }
}

function addItem(focusName = true) {
  const row = itemTemplate.content.firstElementChild.cloneNode(true);
  const id = ++nextItemId;
  for (const field of row.querySelectorAll("input, select")) {
    field.id = `${field.className}-${id}`;
    const label = field.previousElementSibling;
    label.htmlFor = field.id;
  }
  row.querySelector(".remove-button").setAttribute("aria-label", `Удалить позицию ${id}`);
  items.append(row);
  recalculate();
  saveDraft();
  if (focusName) row.querySelector(".item-name").focus();
  return row;
}

document.querySelector("#add-item").addEventListener("click", () => addItem());
items.addEventListener("input", recalculate);
discountInput.addEventListener("input", recalculate);
vatInput.addEventListener("input", recalculate);
currencyInput.addEventListener("change", recalculate);

items.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-button");
  if (!button) return;
  const row = button.closest("tr");
  const nextRow = row.nextElementSibling || row.previousElementSibling;
  row.remove();
  const focusRow = nextRow || addItem(false);
  focusRow.querySelector(".item-name").focus();
  recalculate();
  saveDraft();
});

items.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing || event.repeat) return;
  if (!event.target.matches("input")) return;
  if (event.target.closest("tr") !== items.lastElementChild) return;
  event.preventDefault();
  addItem();
});

function todayValue() {
  const today = new Date();
  return [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
}

function readDraft() {
  const fields = {};
  for (const id of draftFieldIds) fields[id] = document.getElementById(id).value;
  const rows = Array.from(items.rows, (row) => {
    const values = {};
    for (const name of itemFieldNames) values[name] = row.querySelector(`.item-${name}`).value;
    return values;
  });
  return { version: 1, fields, rows };
}

function clearCopyFeedback() {
  clearTimeout(copyStatusTimer);
  document.querySelector("#copy-status").textContent = "";
  document.querySelector("#manual-copy").hidden = true;
}

function saveDraft() {
  if (replacingDraft) return;
  clearCopyFeedback();
  const status = document.querySelector("#storage-status");
  try {
    localStorage.setItem(draftKey, JSON.stringify(readDraft()));
    status.hidden = true;
  } catch {
    status.textContent = "Не удалось сохранить черновик в браузере. Скопируйте смету перед закрытием страницы.";
    status.hidden = false;
  }
}

function restoreDraft() {
  try {
    const saved = localStorage.getItem(draftKey);
    if (!saved) return false;
    const draft = JSON.parse(saved);
    if (!draft || draft.version !== 1 || !draft.fields || !Array.isArray(draft.rows) ||
        !draftFieldIds.every((id) => typeof draft.fields[id] === "string") ||
        !draft.rows.every((row) => row && itemFieldNames.every((name) => typeof row[name] === "string")) ||
        !["₸", "₽", "$", "€"].includes(draft.fields.currency) ||
        !draft.rows.every((row) => ["шт", "час", "услуга"].includes(row.unit))) {
      throw new Error("Invalid draft");
    }
    for (const id of draftFieldIds) document.getElementById(id).value = draft.fields[id];
    for (const values of draft.rows) {
      const row = addItem(false);
      for (const name of itemFieldNames) row.querySelector(`.item-${name}`).value = values[name];
    }
    if (!items.rows.length) addItem(false);
    recalculate();
    return true;
  } catch {
    const status = document.querySelector("#storage-status");
    status.textContent = "Не удалось восстановить черновик. Проверьте, разрешено ли браузеру сохранять данные сайта.";
    status.hidden = false;
    return false;
  }
}

function incrementEstimateNumber(value) {
  const match = value.trim().match(/^(.*?)(\d+)$/);
  if (!match) return "1";
  return match[1] + String(BigInt(match[2]) + 1n).padStart(match[2].length, "0");
}

function newEstimate() {
  if (!window.confirm("Создать новую смету? Текущий черновик будет очищен и заменён новой сметой.")) return;
  const nextNumber = incrementEstimateNumber(document.querySelector("#estimate-number").value);
  replacingDraft = true;
  for (const id of draftFieldIds) document.getElementById(id).value = "";
  document.querySelector("#estimate-number").value = nextNumber;
  document.querySelector("#estimate-date").value = todayValue();
  discountInput.value = "0";
  vatInput.value = "0";
  currencyInput.value = "₸";
  items.replaceChildren();
  addItem(false);
  replacingDraft = false;
  saveDraft();
  document.querySelector("#sender").focus();
}

function estimateText() {
  recalculate();
  const draft = readDraft();
  const date = draft.fields["estimate-date"].split("-").reverse().join(".") || "—";
  const lines = [`Смета № ${draft.fields["estimate-number"] || "—"} от ${date}`];
  if (draft.fields.sender) lines.push(`От кого: ${draft.fields.sender}`);
  if (draft.fields.recipient) lines.push(`Для кого: ${draft.fields.recipient}`);
  lines.push("");
  for (const row of items.rows) {
    const name = row.querySelector(".item-name").value.trim() || "Без наименования";
    const quantity = String(parseNumber(row.querySelector(".item-quantity").value)).replace(".", ",");
    const unit = row.querySelector(".item-unit").value;
    const price = formatMoney(parseNumber(row.querySelector(".item-price").value));
    lines.push(`• ${name} — ${quantity} ${unit} × ${price} = ${row.querySelector(".item-amount").textContent}`);
  }
  lines.push("", `Сумма: ${document.querySelector("#subtotal").textContent}`);
  if (!document.querySelector("#discount-row").hidden) {
    lines.push(`Скидка (${parseNumber(discountInput.value)} %): ${document.querySelector("#discount-amount").textContent}`);
    lines.push(`Сумма со скидкой: ${document.querySelector("#discounted-amount").textContent}`);
  }
  if (!document.querySelector("#vat-row").hidden) {
    lines.push(`НДС (${parseNumber(vatInput.value)} %): ${document.querySelector("#vat-amount").textContent}`);
  }
  lines.push(`Итого к оплате: ${totalOutput.textContent}`);
  return lines.join("\n");
}

async function copyEstimate() {
  clearCopyFeedback();
  const text = estimateText();
  try {
    await navigator.clipboard.writeText(text);
    document.querySelector("#copy-status").textContent = "Скопировано ✓";
    copyStatusTimer = setTimeout(() => {
      document.querySelector("#copy-status").textContent = "";
    }, 2000);
  } catch {
    const field = document.querySelector("#copy-text");
    field.value = text;
    document.querySelector("#manual-copy").hidden = false;
    field.focus();
    field.select();
  }
}

document.addEventListener("input", (event) => {
  if (event.target.matches("input, select")) saveDraft();
});
document.addEventListener("change", (event) => {
  if (event.target.matches("input, select")) saveDraft();
});
document.querySelector("#new-estimate").addEventListener("click", newEstimate);
document.querySelector("#copy-estimate").addEventListener("click", copyEstimate);

if (!restoreDraft()) {
  document.querySelector("#estimate-date").value = todayValue();
  addItem(false);
}
replacingDraft = false;
