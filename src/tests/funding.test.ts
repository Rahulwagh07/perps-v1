import { processFundingPayments } from '../utils/funding';
import { users } from '../store';

describe('Funding Payment Tests', () => {
  beforeEach(() => {
    users.length = 0; // Clear users
    // Set up test user
    const testUser = {
      userId: 1,
      username: 'testUser',
      password: 'testPass',
      collateral: { available: 100, locked: 50 },
      positions: [],
      orders: []
    };
    users.push(testUser);
  });

  test('should increase user collateral by funding payment', () => {
    const initialCollateral = users[0].collateral.available;
    processFundingPayments();
    expect(users[0].collateral.available).toBeGreaterThan(initialCollateral);
  });
});