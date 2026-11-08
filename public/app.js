const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }); // change currency here
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let editingId = null;
let deletingId = null;
let searchTimer;

async function api(url, options = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(data?.error || 'Something went wrong. Try again.');
  return data;
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------- READ ----------
async function load() {
  const params = new URLSearchParams({ search: $('#search').value.trim(), category: $('#categoryFilter').value });
  const [items, stats] = await Promise.all([api(`/api/items?${params}`), api('/api/stats')]);
  renderStats(stats);
  renderRows(items);
}

function renderStats({ totals, categories, lowItems }) {
  $('#statItems').textContent = totals.items;
  $('#statUnits').textContent = totals.units.toLocaleString();
  $('#statValue').textContent = money.format(totals.value);
  $('#statLow').textContent = totals.low;

  // category filter + suggestions
  const select = $('#categoryFilter');
  const current = select.value;
  select.innerHTML = '<option value="">All categories</option>' +
    categories.map((c) => `<option value="${esc(c.category)}">${esc(c.category)}</option>`).join('');
  select.value = categories.some((c) => c.category === current) ? current : '';
  $('#categoryList').innerHTML = categories.map((c) => `<option value="${esc(c.category)}">`).join('');

  const max = Math.max(...categories.map((c) => c.value), 1);
  $('#categoryBars').innerHTML = categories.map((c) => `
    <li><div><span>${esc(c.category)}</span><strong>${money.format(c.value)}</strong></div>
    <div class="bar" style="width:${Math.max((c.value / max) * 100, 2)}%"></div></li>`).join('');

  $('#lowList').innerHTML = lowItems.length
    ? lowItems.map((i) => `<li><span>${esc(i.name)}</span><strong>${i.quantity} left</strong></li>`).join('')
    : '<li class="none">Everything is above its reorder level.</li>';
}

function renderRows(items) {
  $('#empty').hidden = items.length > 0;
  $('#rows').innerHTML = items.map((i) => {
    const isLow = i.quantity <= i.reorder_level;
    const pct = Math.min(100, (i.quantity / Math.max(i.reorder_level * 2, 1)) * 100);
    return `<tr>
      <td class="name">${esc(i.name)}</td>
      <td class="cat">${esc(i.category)}</td>
      <td><div class="gauge ${isLow ? 'low' : ''}" title="Reorder level: ${i.reorder_level}">
        <div class="track"><div class="fill" style="width:${pct}%"></div><span class="tick"></span></div>
        <span class="qty">${i.quantity}</span></div></td>
      <td class="r">${money.format(i.price)}</td>
      <td class="r">
        <button class="btn small" data-edit="${i.id}">Edit</button>
        <button class="btn small" data-delete="${i.id}">Delete</button>
      </td></tr>`;
  }).join('');
  $('#rows').dataset.items = JSON.stringify(items);
}

// ---------- CREATE / UPDATE ----------
function openForm(item) {
  editingId = item ? item.id : null;
  $('#formTitle').textContent = item ? 'Edit item' : 'Add item';
  const f = $('#itemForm');
  f.reset();
  f.name.value = item?.name ?? '';
  f.category.value = item?.category ?? '';
  f.quantity.value = item?.quantity ?? 0;
  f.price.value = item?.price ?? 0;
  f.reorder_level.value = item?.reorder_level ?? 5;
  $('#formError').hidden = true;
  $('#formDialog').showModal();
  f.name.focus();
}

$('#itemForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = JSON.stringify({
    name: f.name.value, category: f.category.value, quantity: f.quantity.value,
    price: f.price.value, reorder_level: f.reorder_level.value
  });
  try {
    if (editingId) await api(`/api/items/${editingId}`, { method: 'PUT', body });
    else await api('/api/items', { method: 'POST', body });
    $('#formDialog').close();
    toast(editingId ? 'Item saved' : 'Item added');
    load();
  } catch (err) {
    $('#formError').textContent = err.message;
    $('#formError').hidden = false;
  }
});

// ---------- DELETE ----------
$('#confirmDeleteBtn').addEventListener('click', async () => {
  try {
    await api(`/api/items/${deletingId}`, { method: 'DELETE' });
    $('#deleteDialog').close();
    toast('Item deleted');
    load();
  } catch (err) {
    $('#deleteDialog').close();
    toast(err.message);
  }
});

// ---------- Events ----------
$('#addBtn').addEventListener('click', () => openForm(null));
$('#cancelBtn').addEventListener('click', () => $('#formDialog').close());
$('#keepBtn').addEventListener('click', () => $('#deleteDialog').close());
$('#categoryFilter').addEventListener('change', load);
$('#search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(load, 200); });

$('#rows').addEventListener('click', (e) => {
  const items = JSON.parse($('#rows').dataset.items || '[]');
  const editId = e.target.dataset.edit;
  const delId = e.target.dataset.delete;
  if (editId) openForm(items.find((i) => i.id == editId));
  if (delId) {
    const item = items.find((i) => i.id == delId);
    deletingId = item.id;
    $('#deleteText').textContent = `“${item.name}” will be removed from your inventory. This can’t be undone.`;
    $('#deleteDialog').showModal();
  }
});

load().catch((err) => toast(err.message));
