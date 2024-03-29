# Wallet Watcher

The wallet watcher loads addresses defined in wallets.json and checks that their balances are not below a defined
threshold. If they are then an alert will be sent to OpsGenie.

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

## Configuration

### `config.json`

#### `chains`

- `chains.<chainId>.rpc`: The RPC provider URL.

- `opsGenieConfig.apiKey`: The Ops Genie api key.
- `opsGenieConfig.responders[n].team` (optional): The Ops Genie responder type. If left undefined this will be inferred
  from the `Ops Genie api key`.
- `opsGenieConfig.responders[n].id` (optional): The Ops Genie responder id. If left undefined this will be inferred from
  the `Ops Genie api key`.

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
- `<chainId>[n].name` (optional): The name of the API provider or wallet.
- `<chainId>[n].providerXpub`: The extended public key of the sponsor address.
- `<chainId>[n].sponsor`: The sponsor address to derive the destination wallet.
- `<chainId>[n].lowThreshold.value`: The value used to send an alert if wallet balance is below it.
- `<chainId>[n].lowThreshold.unit`: The token units used to parse the `lowThreshold.value` for balance check (i.e.
  ether, wei, etc).
- `<chainId>[n].lowThreshold.criticalValue`: The value used to send a _critical_ alert if wallet balance is below it.
  This value must be below the `lowThreshold.value` value.
