# Stockroom – Inventory Dashboard

A dashboard application with full CRUD, built with **Express.js** and **SQLite**.

## Features
- Dashboard summary: products, units in stock, total stock value, items needing reorder
- Create, read, update and delete products
- Search and filter by category
- Stock-level gauge per product (the black tick marks the reorder level)
- Stock value by category and a "Running low" list

## Run it
Requires Node.js 22.13 or newer (SQLite is built in, so there is nothing to compile).

```bash
npm install
npm start
```
Then open http://localhost:3000. The SQLite database (`inventory.db`) is created automatically with sample data.

## API
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/items?search=&category=` | List items |
| GET | `/api/stats` | Dashboard totals |
| POST | `/api/items` | Create item |
| PUT | `/api/items/:id` | Update item |
| DELETE | `/api/items/:id` | Delete item |
