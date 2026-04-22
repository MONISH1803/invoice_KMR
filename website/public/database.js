const state = {
  customers: [],
  products: [],
  editingCustomerId: null,
  editingProductId: null,
  customerSearch: "",
  productSearch: "",
  productHsnFilter: "",
};

const el = {
  dbStatus: document.getElementById("dbStatus"),
  customerForm: document.getElementById("customerForm"),
  customerNameInput: document.getElementById("customerNameInput"),
  customerGstinInput: document.getElementById("customerGstinInput"),
  customerPhoneInput: document.getElementById("customerPhoneInput"),
  customerAddressInput: document.getElementById("customerAddressInput"),
  customerSaveBtn: document.getElementById("customerSaveBtn"),
  customerCancelBtn: document.getElementById("customerCancelBtn"),
  customerSearchInput: document.getElementById("customerSearchInput"),
  customerTable: document.getElementById("customerTable"),
  productForm: document.getElementById("productForm"),
  productDescriptionInput: document.getElementById("productDescriptionInput"),
  productHsnInput: document.getElementById("productHsnInput"),
  productPriceInput: document.getElementById("productPriceInput"),
  productSaveBtn: document.getElementById("productSaveBtn"),
  productCancelBtn: document.getElementById("productCancelBtn"),
  productSearchInput: document.getElementById("productSearchInput"),
  productHsnFilterInput: document.getElementById("productHsnFilterInput"),
  productTable: document.getElementById("productTable"),
};

function setStatus(message = "") {
  if (!message) {
    el.dbStatus.hidden = true;
    el.dbStatus.textContent = "";
    return;
  }
  el.dbStatus.hidden = false;
  el.dbStatus.textContent = message;
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

function renderCustomers() {
  const query = state.customerSearch.trim().toLowerCase();
  const filteredCustomers = state.customers.filter((customer) => {
    if (!query) return true;
    const haystack = `${customer.name || ""} ${customer.gstin || ""} ${customer.phone || ""} ${customer.address || ""}`.toLowerCase();
    return haystack.includes(query);
  });

  const rows = filteredCustomers
    .map(
      (customer) => `<tr>
      <td>${escapeHtml(customer.name || "")}</td>
      <td>${escapeHtml(customer.gstin || "")}</td>
      <td>${escapeHtml(customer.phone || "")}</td>
      <td>${escapeHtml(customer.address || "")}</td>
      <td class="db-cell-actions">
        <button class="secondary customer-edit" data-id="${customer.id}">Edit</button>
        <button class="secondary customer-delete" data-id="${customer.id}">Delete</button>
      </td>
    </tr>`
    )
    .join("");

  el.customerTable.innerHTML = `<table>
    <thead>
      <tr>
        <th>Name</th>
        <th>GSTIN</th>
        <th>Phone</th>
        <th>Address</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="5">No matching customers.</td></tr>'}</tbody>
  </table>`;
}

function renderProducts() {
  const query = state.productSearch.trim().toLowerCase();
  const hsnFilter = state.productHsnFilter.trim().toLowerCase();
  const filteredProducts = state.products.filter((product) => {
    if (hsnFilter && !(product.hsn_code || "").toLowerCase().includes(hsnFilter)) return false;
    if (!query) return true;
    const haystack = `${product.description || ""} ${product.hsn_code || ""} ${Number(product.price || 0).toFixed(2)}`.toLowerCase();
    return haystack.includes(query);
  });

  const rows = filteredProducts
    .map(
      (product) => `<tr>
      <td>${escapeHtml(product.description || "")}</td>
      <td>${escapeHtml(product.hsn_code || "")}</td>
      <td>${Number(product.price || 0).toFixed(2)}</td>
      <td class="db-cell-actions">
        <button class="secondary product-edit" data-id="${product.id}">Edit</button>
        <button class="secondary product-delete" data-id="${product.id}">Delete</button>
      </td>
    </tr>`
    )
    .join("");

  el.productTable.innerHTML = `<table>
    <thead>
      <tr>
        <th>Description</th>
        <th>HSN</th>
        <th>Rate</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="4">No matching products.</td></tr>'}</tbody>
  </table>`;
}

function resetCustomerForm() {
  state.editingCustomerId = null;
  el.customerSaveBtn.textContent = "Add Customer";
  el.customerCancelBtn.hidden = true;
  el.customerForm.reset();
}

function resetProductForm() {
  state.editingProductId = null;
  el.productSaveBtn.textContent = "Add Product";
  el.productCancelBtn.hidden = true;
  el.productForm.reset();
}

async function loadData() {
  const [customers, products] = await Promise.all([request("/api/customers"), request("/api/products")]);
  state.customers = customers;
  state.products = products;
  renderCustomers();
  renderProducts();
}

el.customerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    name: el.customerNameInput.value.trim(),
    gstin: el.customerGstinInput.value.trim(),
    phone: el.customerPhoneInput.value.trim(),
    address: el.customerAddressInput.value.trim(),
  };
  if (!payload.name) return;
  try {
    if (state.editingCustomerId) {
      await request(`/api/customers/${state.editingCustomerId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } else {
      await request("/api/customers", { method: "POST", body: JSON.stringify(payload) });
    }
    await loadData();
    resetCustomerForm();
    setStatus("");
  } catch (error) {
    setStatus(error.message);
  }
});

el.productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    description: el.productDescriptionInput.value.trim(),
    hsnCode: el.productHsnInput.value.trim(),
    price: Number(el.productPriceInput.value || 0),
  };
  if (!payload.description) return;
  try {
    if (state.editingProductId) {
      await request(`/api/products/${state.editingProductId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } else {
      await request("/api/products", { method: "POST", body: JSON.stringify(payload) });
    }
    await loadData();
    resetProductForm();
    setStatus("");
  } catch (error) {
    setStatus(error.message);
  }
});

el.customerCancelBtn.addEventListener("click", resetCustomerForm);
el.productCancelBtn.addEventListener("click", resetProductForm);
el.customerSearchInput.addEventListener("input", () => {
  state.customerSearch = el.customerSearchInput.value || "";
  renderCustomers();
});
el.productSearchInput.addEventListener("input", () => {
  state.productSearch = el.productSearchInput.value || "";
  renderProducts();
});
el.productHsnFilterInput.addEventListener("input", () => {
  state.productHsnFilter = el.productHsnFilterInput.value || "";
  renderProducts();
});

el.customerTable.addEventListener("click", async (event) => {
  const editBtn = event.target.closest(".customer-edit");
  const deleteBtn = event.target.closest(".customer-delete");
  if (editBtn) {
    const customer = state.customers.find((item) => String(item.id) === editBtn.dataset.id);
    if (!customer) return;
    state.editingCustomerId = customer.id;
    el.customerNameInput.value = customer.name || "";
    el.customerGstinInput.value = customer.gstin || "";
    el.customerPhoneInput.value = customer.phone || "";
    el.customerAddressInput.value = customer.address || "";
    el.customerSaveBtn.textContent = "Update Customer";
    el.customerCancelBtn.hidden = false;
    return;
  }
  if (deleteBtn) {
    const id = deleteBtn.dataset.id;
    if (!window.confirm("Delete this customer?")) return;
    try {
      await request(`/api/customers/${id}`, { method: "DELETE" });
      await loadData();
      if (String(state.editingCustomerId) === id) resetCustomerForm();
      setStatus("");
    } catch (error) {
      setStatus(error.message);
    }
  }
});

el.productTable.addEventListener("click", async (event) => {
  const editBtn = event.target.closest(".product-edit");
  const deleteBtn = event.target.closest(".product-delete");
  if (editBtn) {
    const product = state.products.find((item) => String(item.id) === editBtn.dataset.id);
    if (!product) return;
    state.editingProductId = product.id;
    el.productDescriptionInput.value = product.description || "";
    el.productHsnInput.value = product.hsn_code || "";
    el.productPriceInput.value = Number(product.price || 0);
    el.productSaveBtn.textContent = "Update Product";
    el.productCancelBtn.hidden = false;
    return;
  }
  if (deleteBtn) {
    const id = deleteBtn.dataset.id;
    if (!window.confirm("Delete this product?")) return;
    try {
      await request(`/api/products/${id}`, { method: "DELETE" });
      await loadData();
      if (String(state.editingProductId) === id) resetProductForm();
      setStatus("");
    } catch (error) {
      setStatus(error.message);
    }
  }
});

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function init() {
  try {
    await loadData();
  } catch (error) {
    setStatus(error.message);
  }
}

init();
