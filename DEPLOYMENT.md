# Deployment Script

To deploy the Escrow contract to Sepolia testnet:

```bash
npx hardhat ignition deploy --network sepolia ignition/modules/Escrow.ts --parameters "{\"arbitrator\": \"YOUR_ARBITRATOR_ADDRESS\"}"
```

Replace `YOUR_ARBITRATOR_ADDRESS` with your desired arbitrator wallet address.

Or if you want to set the parameter interactively:

```bash
npx hardhat ignition deploy --network sepolia ignition/modules/Escrow.ts
```

Then follow the prompts to enter the arbitrator address.

## Configuration

The Sepolia network is configured in `hardhat.config.ts` to use:
- RPC URL from `SEPOLIA_RPC_URL` environment variable
- Private key from `SEPOLIA_PRIVATE_KEY` environment variable

Make sure to set these environment variables in your `.env` file before deploying: