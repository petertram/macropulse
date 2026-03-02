# MacroPulse - Monorepo


Welcome to the **MacroPulse** project. This repository contains the next-generation financial terminal application designed for premium UX and cutting-edge strategy analytics.

## 🏗️ Architecture overview

This project uses a standard **Monorepo** structure. The stack is strictly decoupled into distinct services to guarantee clean code and independent environments.

### 1. `frontend/` (⚛️ React + Vite + Tailwind 4)
The user interface is built on modern React. It provides a sleek, high-density, institutional-grade visual layout.

* **Tech Stack**: React 19, Tailwind Vite plugin, Recharts, Framer Motion
* **Role**: Visualizes signals, backtests, fund facts, and strategy data in a highly responsive manner.

### 2. `server/` (🟩 Node.js + Express)
The main API Gateway and lightweight data aggregator.

* **Tech Stack**: Node.js, Express, tsx
* **Role**: Serves data to the frontend, fetching external resources (e.g. FRED, Yahoo Finance) and securely processing backend credentials.

### 3. `backend/` (🐍 Python/FastAPI)
The heavy-lifting computational engine.

* **Role**: Processes historical data, caches SQLite quant data, and performs computationally expensive machine-learning/signal logic.

---

## 🚀 Getting Started

### Prerequisites
* Node.js (v20+ recommended)
* Python (for the backend logic)

### 1. Installation

Install all required Node dependencies across workspaces. Thanks to NPM workspaces, running the install command from root takes care of `frontend` and `server`:

```bash
npm install
```

### 2. Environment Variables

Create a `.env` file inside the `server/` directory and include the required API Keys. E.g:
```bash
GEMINI_API_KEY=your-api-key-here
FRED_API_KEY=your-fred-api-key
```

### 3. Run the Development Server

You can simultaneously spin up the `frontend/` (React/Vite) and the `server/` (Node/Express API) using the root script:

```bash
npm run dev
```

This uses `concurrently` to spin up both processes in your single terminal window.

* Frontend is accessible at: `http://localhost:5173` (or slightly higher ports if occupied)
* API Server is running at: `http://localhost:3000`

> Note: The Vite frontend is already configured to proxy `/api` traffic directly to the node backend on port 3000.

---

## 📂 Workspace Commands

Since this is an NPM Workspace, you can target specific sub-projects via the `-w` flag.

```bash
# Install a new dependency on the Frontend
npm install axios -w frontend

# Start only the API server
npm run dev -w server

# Build the frontend purely for production
npm run build -w frontend
```
