# Test Coverage Plan

## Endpoints tested:
1. `POST /signup` - 5 tests ✅
2. `POST /signin` - 4 tests ✅
3. `POST /onramp` - 6 tests ✅
4. `POST /order` - 11 tests ✅
5. `DELETE /order` - 5 tests ✅
6. `GET /equity/available` - 3 tests ✅
7. `GET /positions/open/:marketId` - 3 tests ✅
8. `GET /positions/closed/:marketId` - 3 tests ✅
9. `GET /orders/open/:marketId` - 5 tests ✅
10. `GET /orders/:marketId` - 3 tests ✅
11. `GET /fills` - 4 tests ✅

## Additional test suites:
- Auth middleware: 5 tests ✅
- Engine (matchOrder): 11 tests ✅
- Utils (calPnl, calEquity, position, auth): 24 tests ✅

## Total: 93 tests, 204 assertions, all passing
