# backpack-depth-indexer

A small perps matching engine and REST API built with Express and Bun.

## Getting started

This project uses [Bun](https://bun.com) (v1.3 or newer) as its runtime and package manager.

### 1. Install dependencies

```bash
bun install
```

### 2. Run the server locally

```bash
bun run dev
```

This starts the API on <http://localhost:3000> (the port is set in `src/index.ts`). The server keeps state in memory, so it starts with a clean slate on every run — markets `SOL` and `ETH` are seeded with no open orders.

### 3. Try it out

Create an account:

```bash
curl -X POST http://localhost:3000/signup \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"secret"}'
```

Sign in to get a session token, then fund the account:

```bash
curl -X POST http://localhost:3000/signin \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"secret"}'
# => {"token":"..."}

curl -X POST http://localhost:3000/onramp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"amount":1000}'
```

Authenticated requests send the token as a bearer token. To place an order:

```bash
curl -X POST http://localhost:3000/order \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"market":"SOL","type":"LONG","qty":1,"orderType":"limit","price":90,"margin":90}'
```

## Project layout

- `src/index.ts` — app entry point, mounts the routers
- `src/routes/` — auth, order and account route definitions
- `src/controllers/` — request handlers
- `src/engine.ts` — order matching logic
- `src/store.ts` — in-memory state (users, orderbooks, fills, sessions)

This project was created using `bun init` in bun v1.3.11. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
