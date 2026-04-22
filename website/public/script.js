const state = {
  products: [],
  customers: [],
  editingInvoiceId: null,
  backendReady: true,
};

const el = {
  invoiceNo: document.getElementById("invoiceNo"),
  invoiceDate: document.getElementById("invoiceDate"),
  creditBillDate: document.getElementById("creditBillDate"),
  vehicleNo: document.getElementById("vehicleNo"),
  customerName: document.getElementById("customerName"),
  customerAddress: document.getElementById("customerAddress"),
  customerGstin: document.getElementById("customerGstin"),
  itemsBody: document.getElementById("itemsBody"),
  subtotal: document.getElementById("subtotal"),
  cgstPercent: document.getElementById("cgstPercent"),
  sgstPercent: document.getElementById("sgstPercent"),
  igstPercent: document.getElementById("igstPercent"),
  cgstAmount: document.getElementById("cgstAmount"),
  sgstAmount: document.getElementById("sgstAmount"),
  igstAmount: document.getElementById("igstAmount"),
  grandTotal: document.getElementById("grandTotal"),
  invoiceList: document.getElementById("invoiceList"),
  productList: document.getElementById("productList"),
  customersDataList: document.getElementById("customersDataList"),
  searchInvoice: document.getElementById("searchInvoice"),
  productForm: document.getElementById("productForm"),
  productDescription: document.getElementById("productDescription"),
  productHsn: document.getElementById("productHsn"),
  productPrice: document.getElementById("productPrice"),
  saveBtn: document.getElementById("saveBtn"),
  updateBtn: document.getElementById("updateBtn"),
  amountWords: document.getElementById("amountWords"),
  backendStatus: document.getElementById("backendStatus"),
  customerSuggestions: document.getElementById("customerSuggestions"),
};

function amount(value) {
  return Number(value || 0).toFixed(2);
}

function numberToWordsIndian(num) {
  const units = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  if (num === 0) return "Zero";
  if (num > 999999999) return "Number too large";
  let words = "";
  if (num >= 10000000) {
    words += `${numberToWordsIndian(Math.floor(num / 10000000))} Crore `;
    num %= 10000000;
  }
  if (num >= 100000) {
    words += `${numberToWordsIndian(Math.floor(num / 100000))} Lakh `;
    num %= 100000;
  }
  if (num >= 1000) {
    words += `${numberToWordsIndian(Math.floor(num / 1000))} Thousand `;
    num %= 1000;
  }
  if (num >= 100) {
    words += `${numberToWordsIndian(Math.floor(num / 100))} Hundred `;
    num %= 100;
  }
  if (num > 0) {
    if (num < 20) {
      words += units[num];
    } else {
      words += tens[Math.floor(num / 10)];
      if (num % 10) {
        words += ` ${units[num % 10]}`;
      }
    }
  }
  return words.trim();
}

function setBackendStatus(message = "") {
  if (!message) {
    el.backendStatus.hidden = true;
    el.backendStatus.textContent = "";
    return;
  }
  el.backendStatus.hidden = false;
  el.backendStatus.textContent = message;
}

function rowTemplate(item = {}) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td></td>
    <td>
      <div class="suggestion-wrap">
        <input class="description" value="${item.description || ""}" autocomplete="off" />
        <div class="suggestions product-suggestions" hidden></div>
      </div>
    </td>
    <td><input class="hsnCode" value="${item.hsn_code || item.hsnCode || ""}" /></td>
    <td><input class="rate" type="number" min="0" step="0.01" value="${item.rate || 0}" /></td>
    <td><input class="qty" type="number" min="0" step="0.01" value="${item.qty || 1}" /></td>
    <td class="lineAmount">${amount(item.amount || 0)}</td>
    <td class="row-actions no-print"><button class="secondary deleteRowBtn">Delete</button></td>
  `;

  tr.querySelector(".deleteRowBtn").addEventListener("click", () => {
    tr.remove();
    recalc();
    updateSerial();
  });

  const descriptionInput = tr.querySelector(".description");
  const productSuggestionsEl = tr.querySelector(".product-suggestions");

  const hideProductSuggestions = () => {
    productSuggestionsEl.hidden = true;
    productSuggestionsEl.innerHTML = "";
  };

  const showProductSuggestions = (products) => {
    if (!products.length) {
      hideProductSuggestions();
      return;
    }
    productSuggestionsEl.innerHTML = products
      .slice(0, 8)
      .map(
        (p) =>
          `<div class="suggestion-item" data-id="${p.id}"><strong>${p.description}</strong><br/>HSN: ${p.hsn_code} | Rate: ${amount(
            p.price
          )}</div>`
      )
      .join("");
    productSuggestionsEl.hidden = false;
  };

  productSuggestionsEl.addEventListener("mousedown", (event) => {
    const target = event.target.closest(".suggestion-item");
    if (!target) return;
    const product = state.products.find((p) => String(p.id) === target.dataset.id);
    if (!product) return;
    descriptionInput.value = product.description;
    tr.querySelector(".hsnCode").value = product.hsn_code || "";
    tr.querySelector(".rate").value = Number(product.price || 0);
    hideProductSuggestions();
    recalc();
  });

  tr.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => {
      if (input.classList.contains("description")) {
        const query = input.value.trim().toLowerCase();
        const product = state.products.find((p) => p.description.toLowerCase() === query);
        if (product) {
          tr.querySelector(".hsnCode").value = product.hsn_code;
          tr.querySelector(".rate").value = product.price;
          hideProductSuggestions();
        } else {
          const filtered = state.products.filter((p) => p.description.toLowerCase().includes(query));
          showProductSuggestions(query ? filtered : []);
        }
      }
      recalc();
    });
  });

  descriptionInput.addEventListener("blur", () => {
    setTimeout(hideProductSuggestions, 150);
  });

  el.itemsBody.appendChild(tr);
  updateSerial();
  recalc();
}

function updateSerial() {
  Array.from(el.itemsBody.rows).forEach((row, index) => {
    row.cells[0].textContent = String(index + 1);
  });
}

function recalc() {
  let subtotal = 0;
  Array.from(el.itemsBody.rows).forEach((row) => {
    const qty = Number(row.querySelector(".qty").value || 0);
    const rate = Number(row.querySelector(".rate").value || 0);
    const line = qty * rate;
    row.querySelector(".lineAmount").textContent = amount(line);
    subtotal += line;
  });
  const cgst = subtotal * (Number(el.cgstPercent.value || 0) / 100);
  const sgst = subtotal * (Number(el.sgstPercent.value || 0) / 100);
  const igst = subtotal * (Number(el.igstPercent.value || 0) / 100);
  const grandTotal = subtotal + cgst + sgst + igst;

  el.subtotal.textContent = amount(subtotal);
  el.cgstAmount.textContent = amount(cgst);
  el.sgstAmount.textContent = amount(sgst);
  el.igstAmount.textContent = amount(igst);
  el.grandTotal.textContent = amount(grandTotal);
  el.amountWords.textContent = `${numberToWordsIndian(Math.round(grandTotal))} Only`;
}

function getPayload() {
  const items = Array.from(el.itemsBody.rows).map((row) => ({
    description: row.querySelector(".description").value.trim(),
    hsnCode: row.querySelector(".hsnCode").value.trim(),
    qty: Number(row.querySelector(".qty").value || 0),
    rate: Number(row.querySelector(".rate").value || 0),
    amount: Number(row.querySelector(".lineAmount").textContent || 0),
  }));

  return {
    invoiceNo: el.invoiceNo.value.trim(),
    invoiceDate: el.invoiceDate.value,
    creditBillDate: el.creditBillDate.value || null,
    vehicleNo: el.vehicleNo.value.trim(),
    customerName: el.customerName.value.trim(),
    customerAddress: el.customerAddress.value.trim(),
    customerGstin: el.customerGstin.value.trim(),
    subtotal: Number(el.subtotal.textContent || 0),
    cgstPercent: Number(el.cgstPercent.value || 0),
    sgstPercent: Number(el.sgstPercent.value || 0),
    igstPercent: Number(el.igstPercent.value || 0),
    cgstAmount: Number(el.cgstAmount.textContent || 0),
    sgstAmount: Number(el.sgstAmount.textContent || 0),
    igstAmount: Number(el.igstAmount.textContent || 0),
    grandTotal: Number(el.grandTotal.textContent || 0),
    items: items.filter((item) => item.description),
  };
}

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ? `${body.message || "Request failed"}: ${body.detail}` : body.message || "Request failed");
  }
  if (res.status === 204) return null;
  return res.json();
}

async function loadBootstrap() {
  const data = await request("/api/bootstrap");
  state.backendReady = true;
  setBackendStatus("");
  state.products = data.products;
  state.customers = data.customers;
  el.invoiceNo.value = data.nextInvoiceNo;
  el.invoiceDate.value = data.today;
  renderProducts();
  renderCustomerHints();
}

function renderCustomerHints() {
  el.customersDataList.innerHTML = state.customers
    .map((c) => `<option value="${c.name}"></option>`)
    .join("");
}

function hideCustomerSuggestions() {
  el.customerSuggestions.hidden = true;
  el.customerSuggestions.innerHTML = "";
}

function showCustomerSuggestions(customers) {
  if (!customers.length) {
    hideCustomerSuggestions();
    return;
  }
  el.customerSuggestions.innerHTML = customers
    .slice(0, 8)
    .map(
      (c) =>
        `<div class="suggestion-item" data-id="${c.id}">
          <strong>${c.name}</strong><br/>
          ${c.address || ""}${c.gstin ? ` | GSTIN: ${c.gstin}` : ""}
        </div>`
    )
    .join("");
  el.customerSuggestions.hidden = false;
}

function renderProducts() {
  const datalistId = document.getElementById("productDescriptions") || document.createElement("datalist");
  datalistId.id = "productDescriptions";
  datalistId.innerHTML = state.products
    .map((p) => `<option value="${p.description}"></option>`)
    .join("");
  if (!document.getElementById("productDescriptions")) {
    document.body.appendChild(datalistId);
  }

  el.productList.innerHTML = "";
  state.products.forEach((p) => {
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `<strong>${p.description}</strong><br/>HSN: ${p.hsn_code} | Price: ${amount(p.price)}`;
    el.productList.appendChild(div);
  });
}

async function loadInvoices(search = "") {
  const items = await request(`/api/invoices?q=${encodeURIComponent(search)}`);
  el.invoiceList.innerHTML = "";
  items.forEach((inv) => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `<strong>${inv.invoice_no}</strong><br/>${inv.customer_name} - ${inv.invoice_date}<br/>Rs. ${amount(
      inv.grand_total
    )}`;
    row.addEventListener("click", () => loadInvoice(inv.id));
    el.invoiceList.appendChild(row);
  });
}

async function loadInvoice(id) {
  const invoice = await request(`/api/invoices/${id}`);
  state.editingInvoiceId = invoice.id;
  el.updateBtn.disabled = false;
  el.saveBtn.disabled = true;

  el.invoiceNo.value = invoice.invoice_no;
  el.invoiceDate.value = invoice.invoice_date;
  el.creditBillDate.value = invoice.credit_bill_date || "";
  el.vehicleNo.value = invoice.vehicle_no || "";
  el.customerName.value = invoice.customer_name || "";
  el.customerAddress.value = invoice.customer_address || "";
  el.customerGstin.value = invoice.customer_gstin || "";
  el.cgstPercent.value = invoice.cgst_percent || 0;
  el.sgstPercent.value = invoice.sgst_percent || 0;
  el.igstPercent.value = invoice.igst_percent || 0;

  el.itemsBody.innerHTML = "";
  invoice.items.forEach((item) => rowTemplate(item));
  recalc();
}

function clearForm(nextInvoiceNo) {
  state.editingInvoiceId = null;
  el.updateBtn.disabled = true;
  el.saveBtn.disabled = false;
  el.invoiceNo.value = nextInvoiceNo;
  el.invoiceDate.value = new Date().toISOString().slice(0, 10);
  el.creditBillDate.value = "";
  el.vehicleNo.value = "";
  el.customerName.value = "";
  el.customerAddress.value = "";
  el.customerGstin.value = "";
  el.cgstPercent.value = "9";
  el.sgstPercent.value = "9";
  el.igstPercent.value = "0";
  el.itemsBody.innerHTML = "";
  rowTemplate();
}

document.getElementById("addRowBtn").addEventListener("click", () => rowTemplate());
[el.cgstPercent, el.sgstPercent, el.igstPercent].forEach((field) => field.addEventListener("input", recalc));

el.searchInvoice.addEventListener("input", () => loadInvoices(el.searchInvoice.value));

document.getElementById("newInvoiceBtn").addEventListener("click", async () => {
  try {
    const data = await request("/api/bootstrap");
    clearForm(data.nextInvoiceNo);
  } catch (error) {
    setBackendStatus(error.message);
  }
});

el.productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await request("/api/products", {
      method: "POST",
      body: JSON.stringify({
        description: el.productDescription.value,
        hsnCode: el.productHsn.value,
        price: Number(el.productPrice.value),
      }),
    });
    el.productForm.reset();
    await loadBootstrap();
  } catch (error) {
    setBackendStatus(error.message);
  }
});

el.saveBtn.addEventListener("click", async () => {
  const payload = getPayload();
  if (!payload.customerName || !payload.items.length) {
    alert("Customer and at least one item are required.");
    return;
  }
  try {
    await request("/api/invoices", { method: "POST", body: JSON.stringify(payload) });
    const data = await request("/api/bootstrap");
    clearForm(data.nextInvoiceNo);
    await loadInvoices();
    alert("Invoice saved.");
  } catch (error) {
    setBackendStatus(error.message);
  }
});

el.updateBtn.addEventListener("click", async () => {
  if (!state.editingInvoiceId) return;
  const payload = getPayload();
  try {
    await request(`/api/invoices/${state.editingInvoiceId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    await loadInvoices();
    alert("Invoice updated.");
  } catch (error) {
    setBackendStatus(error.message);
  }
});

el.customerName.addEventListener("input", () => {
  const query = el.customerName.value.trim().toLowerCase();
  const match = state.customers.find((c) => c.name.toLowerCase() === query);
  if (match) {
    el.customerAddress.value = match.address || "";
    el.customerGstin.value = match.gstin || "";
    hideCustomerSuggestions();
    return;
  }
  const filtered = state.customers.filter((c) => c.name.toLowerCase().includes(query));
  showCustomerSuggestions(query ? filtered : []);
});

el.customerSuggestions.addEventListener("mousedown", (event) => {
  const item = event.target.closest(".suggestion-item");
  if (!item) return;
  const selected = state.customers.find((c) => String(c.id) === item.dataset.id);
  if (!selected) return;
  el.customerName.value = selected.name || "";
  el.customerAddress.value = selected.address || "";
  el.customerGstin.value = selected.gstin || "";
  hideCustomerSuggestions();
});

el.customerName.addEventListener("blur", () => {
  setTimeout(hideCustomerSuggestions, 150);
});

async function init() {
  rowTemplate();
  try {
    await loadBootstrap();
    await loadInvoices();
  } catch (error) {
    const msg =
      "Backend disconnected. Add DATABASE_URL in Vercel settings, then redeploy. Error: " + error.message;
    setBackendStatus(msg);
  }
}

init();
