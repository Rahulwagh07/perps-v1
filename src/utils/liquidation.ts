import { users } from '../store';
import { Position } from '../types';

export function checkLiquidations() {
  for (const user of users) {
    for (const position of user.positions) {
      if (position.liquidationPrice > (user.collateral.available + user.collateral.locked)) {
        liquidatePosition(user, position);
      }
    }
  }
}

function liquidatePosition(user: typeof users[0], position: Position) {
  // liquidate logic: remove the position and handle collateral
  const liquidatedQty = position.qty;
  // More logic to handle user collateral and position removal
  position.status = 'closed'; // Marking the position as closed after liquidation
  console.log(`Liquidated position of userId: ${user.userId}, market: ${position.market}, qty: ${liquidatedQty}`);
}