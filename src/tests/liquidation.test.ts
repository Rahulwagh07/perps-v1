import { checkLiquidations } from '../utils/liquidation';
import { users } from '../store';

describe('Liquidation Tests', () => {
  beforeEach(() => {
    users.length = 0; // Clear users
    // Set up test user with positions
    const testUser = {
      userId: 1,
      username: 'testUser',
      password: 'testPass',
      collateral: { available: 100, locked: 50 },
      positions: [
        { market: 'BTC', type: 'LONG', qty: 1, margin: 10, liquidationPrice: 50, averagePrice: 60, status: 'open' }
      ],
      orders: []
    };
    users.push(testUser);
  });

  test('should liquidate position when liquidation price is reached', () => {
    checkLiquidations();
    const testUser = users[0];
    const position = testUser.positions[0];
    expect(position.status).toBe('closed');
  });
});