# Wallet Watcher

The wallet watcher loads and ingests the contents of the [operations repository](https://github.com/api3dao/operations)
and based on the deployed beacons found in it monitors and tops up associated operational wallets.

If a wallet's balance is below the `lowBalance` configuration field in `config/config.json` the function will top up the
wallet with the amount specified in the `topUpAmount` field in the same file.

## Deployment

AWS credentials should be exported as environment variables and both `config/config.json` and `serverless.yml` should be
populated prior to running the following commands:

```bash
# Test your installation with
yarn sls invoke local --function wallet-watcher
```

With this config in place you can deploy:

```bash
yarn sls:deploy
```

Be sure to watch the logs to make sure the applications are behaving as you expect.

## Important

As a safety feature the wallets handler does not top up wallets unless an env flag is set. This flag is called
`WALLET_ENABLE_SEND_FUNDS`. It can be set to `true` to enable this functionality.

The flag must be manually set by navigating through the AWS console (`lambda` > `functions` > `<walletHandler>` >
`configuration` > `Environment variables`). While it is possible to configure the flag in `serverless.yml`, the purpose
of the flag is to require that you explicitly enable this functionality and hopefully consider the consequences of doing
so. This is to prevent scenarios where dev code sends real funds to unrecoverable addresses.

## Configuration

### `config.json`

#### `chains`

- `chains.<chainId>.rpc`: The RPC provider URL.
- `chains.<chainId>.funderDepositoryLowBalanceWarn`: The FunderDepository contract balance below which an alert will be
  triggered. The value should be in full token units (i.e. in ethers or matics).
- `chains.<chainId>.topUpWalletLowBalanceWarn`: The top up wallet balance below which an alert will be triggered. The
  value should be in full token units (i.e. in ethers or matics).
- `chains.<chainId>.options`: The chain specific options used to get the gas price for top up transactions.

- `opsGenieConfig.apiKey`: The Ops Genie api key.
- `opsGenieConfig.responders[n].team` (optional): The Ops Genie responder type. If left undefined this will be inferred
  from the `Ops Genie api key`.
- `opsGenieConfig.responders[n].id` (optional): The Ops Genie responder id. If left undefined this will be inferred from
  the `Ops Genie api key`.

- `explorerUrls.<chainId>`: The explorer URL.

### `wallets.json`

- `<chainId>[]`: A list of wallets to check and top up for a chain.

- `<chainId>[n].walletType`: The type of wallet with the following options:
  - `Provider`: the value for the `address` field in the same object is used for top ups.
  - `API3`: the value for the `address` field in the same object is used for top ups.
  - `Provider-Sponsor`: the destination address is derived from the `sponsor` using the `providerXpub` and `PSP`
    protocol id.
  - `API3-Sponsor`: the destination address is derived from the `sponsor` using the `API3_XPUB` and PSP protocol id.
  - `Airseeker`: the destination address is derived from the `sponsor` using the `providerXpub` and `AIRSEEKER` protocol
    id.
- `<chainId>[n].address` (required only if `walletType` is `Provider` or `API3`): The destination wallet to be used
  directly without deriving from the sponsor wallet.
- `<chainId>[n].apiName` (optional): The name of the API provider.
- `<chainId>[n].providerXpub`: The extended public key of the sponsor address.
- `<chainId>[n].sponsor`: The sponsor address to derive the destination wallet.
- `<chainId>[n].topUpAmount`: The amount to top up in the native token. The value should be in full token units (i.e. in
  ethers or matics).
- `<chainId>[n].lowBalance`: The wallet balance value below which a top up is triggered. The value should be in full
  token units (i.e. in ethers or matics).
