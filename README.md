# Wallet Watcher

The wallet watcher loads and ingests the contents of the [operations repository](https://github.com/api3dao/operations)
and based on the deployed beacons found in it monitors and tops up associated operational wallets.

If a wallet's balance is below the `lowBalance` configuration field in `config/walletConfig.json` the function will top
up the wallet with the amount specified in the `topUpAmount` field in the same file.

## Deployment

AWS credentials should be exported as environment variables and both `config/walletConfig.json` and `serverless.yml`
should be populated prior to running the following commands:

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
