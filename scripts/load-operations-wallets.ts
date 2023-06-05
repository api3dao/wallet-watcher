import fs from 'fs';
import path from 'path';

/**
 * TODO: Load top up wallets from the operations-database (which endpoint to cURL?)
 */
export const loadOperationsWallets = () => {
  fs.writeFileSync(path.join(__dirname, `../config/wallets-export.json`), JSON.stringify({}, null, 2));
};

loadOperationsWallets();
