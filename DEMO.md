# Logistika demo environment

The demo stack is isolated from projects using the default ports.

| Service | Demo port |
| --- | ---: |
| API and Django admin | `18083` |
| PostgreSQL | `15436` |
| Redis | `16383` |
| React Native Metro | `8083` |

## Start backend and fixtures

```bash
./scripts/demo_up.sh
```

The `seed_demo` command is deterministic and safe to run again. It restores the
known demo scenarios without duplicating records.

## Demo accounts

All accounts use password `demo12345`.

| Role | Phone | Expected start screen |
| --- | --- | --- |
| Administrator | `+998901000100` | Django admin |
| Client | `+998901000101` | Client dashboard with active tracking |
| Driver | `+998901000102` | Driver dashboard and available cargo |
| Dispatcher | `+998901000103` | Dispatcher monitoring |
| Updater | `+998901000104` | Operator/updater workspace |
| Client with unpaid fee | `+998901000105` | Required service-fee payment |
| Driver with unpaid fee | `+998901000106` | Required service-fee payment |

These password accounts exist only as local fixtures. Public registration stays
Telegram-only.

In a debug build, the login screen also shows one-tap buttons for every demo
role. This block is excluded from release builds.

## Start the mobile app

The debug build already points to API port `18083`.

```bash
cd mobile
npm start -- --port 8083
```

In another terminal, run iOS. The debug target is configured to use Metro on
`8083` in the simulator:

```bash
cd mobile
npm run ios
```

## Stop only this demo stack

```bash
COMPOSE_PROJECT_NAME=logistika_demo docker compose down
```
