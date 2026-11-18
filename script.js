"use strict";

const items = document.querySelector("#items");
const itemTemplate = document.querySelector("#item-template");
const totalOutput = document.querySelector("#total");
const moneyFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
let nextItemId = 0;

function parseNumber(value) {
  const normalized = value.trim().replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return 0;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${moneyFormatter.format(Object.is(safeValue, -0) ? 0 : safeValue).replace(/[\u00a0\u202f]/g, " ")} ₸`;
}

function recalculate() {
  let total = 0;
  for (const row of items.rows) {
    const quantity = parseNumber(row.querySelector(".item-quantity").value);
    const price = parseNumber(row.querySelector(".item-price").value);
    const product = quantity * price;
    // Round each line to currency precision and guard against numeric overflow.
    const rounded = Math.round(product * 100) / 100;
    const amount = Number.isFinite(rounded) ? rounded : 0;
    row.querySelector(".item-amount").textContent = formatMoney(amount);
    const sum = total + amount;
    total = Number.isFinite(sum) ? sum : total;
  }
  totalOutput.textContent = formatMoney(total);
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
  if (focusName) row.querySelector(".item-name").focus();
  return row;
}

document.querySelector("#add-item").addEventListener("click", () => addItem());
items.addEventListener("input", recalculate);

items.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-button");
  if (!button) return;
  const row = button.closest("tr");
  const nextRow = row.nextElementSibling || row.previousElementSibling;
  row.remove();
  const focusRow = nextRow || addItem(false);
  focusRow.querySelector(".item-name").focus();
  recalculate();
});

items.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing || event.repeat) return;
  if (!event.target.matches("input")) return;
  if (event.target.closest("tr") !== items.lastElementChild) return;
  event.preventDefault();
  addItem();
});

const today = new Date();
document.querySelector("#estimate-date").value = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, "0"),
  String(today.getDate()).padStart(2, "0")
].join("-");

addItem(false);
