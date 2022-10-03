import fs from 'fs';
import path from 'path';
import { uniqBy } from 'lodash';
import { readOperationsRepository } from '@api3/operations/dist/utils/read-operations';
import { evm } from '@api3/operations-utilities';
import { determineWalletAddress } from '../src/wallet-watcher';
import { Wallet, Wallets, EvmAddress } from '../src/types';

type WalletWithMetadata = Wallet & {
  chainId: string;
  chainName: string;
  address: EvmAddress;
  providerXpub: string;
};

/**
 * Load top up wallets from the operations repository and save them into a file
 */
export const loadOperationsWallets = () => {
  const operations = readOperationsRepository();

  const duplicatedWallets = Object.entries(operations.apis)
    .flatMap(([apiName, api]) =>
      Object.entries(api.beacons).flatMap(([_beaconName, beaconValue]) =>
        Object.entries(beaconValue.chains).flatMap(([chainName, chain]) =>
          chain.topUpWallets.flatMap((wallet) => ({
            ...wallet,
            apiName,
            chainName,
            chainId: evm.resolveChainId(chainName, operations as any),
            providerXpub: api.apiMetadata.xpub,
            sponsor: chain.sponsor,
          }))
        )
      )
    )
    .map((wallet) => determineWalletAddress(wallet as WalletWithMetadata)) as WalletWithMetadata[];

  // There must be a chain in ops for this
  const walletsToAssess = uniqBy(
    duplicatedWallets,
    (item) => `${item.address}${item.chainName}${item.providerXpub}`
  ).filter((wallet) => Object.values(operations.chains).find((chain) => chain.name === wallet.chainName));

  const walletsGroupedByChain = walletsToAssess.reduce((acc: Wallets, wallet: WalletWithMetadata) => {
    const { chainName: _chainName, chainId, ...restWallet } = wallet;

    return { ...acc, [chainId]: [...(acc[chainId] ? acc[chainId] : []), restWallet] };
  }, {});

  fs.writeFileSync(
    path.join(__dirname, `../config/wallets-export.json`),
    JSON.stringify(walletsGroupedByChain, null, 2)
  );
};

loadOperationsWallets();
