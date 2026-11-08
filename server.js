const path = require('path');
const express = require('express');
const { DatabaseSync } = require('node:sqlite'); // built into Node.js, nothing to compile

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Database ----------
const db = new DatabaseSync(path.join(__dirname, 'inventory.db'));
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    category      TEXT    NOT NULL,
    quantity      INTEGER NOT NULL DEFAULT 0,
    price         REAL    NOT NULL DEFAULT 0,
    reorder_level INTEGER NOT NULL DEFAULT 5,
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`);

// Sample data so the dashboard isn't empty on first run
if (db.prepare('SELECT COUNT(*) AS n FROM items').get().n === 0) {
  const seed = db.prepare(
    'INSERT INTO items (name, category, quantity, price, reorder_level) VALUES (?, ?, ?, ?, ?)'
  );
  const rows = [
    ['Ballpoint pen (black)', 'Stationery', 120, 12, 40],
    ['Spiral notebook A5', 'Stationery', 18, 45, 25],
    ['Printer paper (500 sheets)', 'Stationery', 9, 260, 10],
    ['USB-C cable 1m', 'Electronics', 34, 150, 15],
    ['Wireless mouse', 'Electronics', 6, 480, 8],
    ['Power bank 10,000 mAh', 'Electronics', 12, 890, 5],
    ['Instant coffee (200g)', 'Pantry', 40, 185, 20],
    ['Bottled water 500ml', 'Pantry', 3, 20, 48],
    ['Hand sanitizer 250ml', 'Cleaning', 22, 95, 12],
    ['Disinfectant spray', 'Cleaning', 15, 130, 10]
  ];
  db.exec('BEGIN');
  rows.forEach((r) => seed.run(...r));
  db.exec('COMMIT');
}

// ---------- Helpers ----------
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function validate(body) {
  const name = String(body.name ?? '').trim();
  const category = String(body.category ?? '').trim();
  const quantity = Number(body.quantity);
  const price = Number(body.price);
  const reorder = Number(body.reorder_level);

  if (!name) return { error: 'Item name is required.' };
  if (!category) return { error: 'Category is required.' };
  if (!Number.isInteger(quantity) || quantity < 0)
    return { error: 'Quantity must be a whole number, 0 or more.' };
  if (!Number.isFinite(price) || price < 0)
    return { error: 'Price must be a number, 0 or more.' };
  if (!Number.isInteger(reorder) || reorder < 0)
    return { error: 'Reorder level must be a whole number, 0 or more.' };

  return { value: { name, category, quantity, price, reorder_level: reorder } };
}

// ---------- API ----------

// READ (list, with optional search + category filter)
app.get('/api/items', (req, res) => {
  const { search = '', category = '' } = req.query;
  const rows = db
    .prepare(
      `SELECT * FROM items
       WHERE name LIKE @search AND (@category = '' OR category = @category)
       ORDER BY name COLLATE NOCASE`
    )
    .all({ search: `%${search}%`, category });
  res.json(rows);
});

// READ (dashboard numbers)
app.get('/api/stats', (req, res) => {
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS items,
              COALESCE(SUM(quantity), 0) AS units,
              COALESCE(SUM(quantity * price), 0) AS value,
              COALESCE(SUM(CASE WHEN quantity <= reorder_level THEN 1 ELSE 0 END), 0) AS low
       FROM items`
    )
    .get();
  const categories = db
    .prepare(
      `SELECT category, COUNT(*) AS items, SUM(quantity * price) AS value
       FROM items GROUP BY category ORDER BY value DESC`
    )
    .all();
  const lowItems = db
    .prepare(
      `SELECT id, name, quantity, reorder_level FROM items
       WHERE quantity <= reorder_level
       ORDER BY (quantity * 1.0 / MAX(reorder_level, 1)) ASC LIMIT 6`
    )
    .all();
  res.json({ totals, categories, lowItems });
});

// CREATE
app.post('/api/items', (req, res) => {
  const { error, value } = validate(req.body);
  if (error) return res.status(400).json({ error });
  const info = db
    .prepare(
      `INSERT INTO items (name, category, quantity, price, reorder_level)
       VALUES (@name, @category, @quantity, @price, @reorder_level)`
    )
    .run(value);
  res.status(201).json(db.prepare('SELECT * FROM items WHERE id = ?').get(info.lastInsertRowid));
});

// UPDATE
app.put('/api/items/:id', (req, res) => {
  const { error, value } = validate(req.body);
  if (error) return res.status(400).json({ error });
  const info = db
    .prepare(
      `UPDATE items
       SET name=@name, category=@category, quantity=@quantity, price=@price,
           reorder_level=@reorder_level, updated_at=datetime('now')
       WHERE id=@id`
    )
    .run({ ...value, id: req.params.id });
  if (info.changes === 0) return res.status(404).json({ error: 'Item not found.' });
  res.json(db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id));
});

// DELETE
app.delete('/api/items/:id', (req, res) => {
  const info = db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Item not found.' });
  res.status(204).end();
});

app.listen(PORT, () => console.log(`Stockroom running at http://localhost:${PORT}`));
