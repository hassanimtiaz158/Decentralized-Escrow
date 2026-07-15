React-based Escrow Dashboard application
A comprehensive job management dashboard for the decentralized escrow platform.

## Overview

This application connects directly to the deployed Escrow contract on Sepolia testnet,
replacing all mock data with real blockchain interactions. Users can create jobs,
manage roles (Client, Freelancer, Arbitrator), and track job statuses through the
complete lifecycle from Funded to Released/Refunded/Resolved.

## Features

### Blockchain Integration
- ✅ Direct contract interaction via ethers.js
- ✅ MetaMask wallet connection
- ✅ Role-based access control based on contract state
- ✅ Real-time job status updates
- ✅ Gas-aware transaction handling
- ✅ Complete error handling and user feedback

### User Interface
- ✅ Responsive design (mobile/desktop optimized)
- ✅ Professional dashboard with timeline visualization
- ✅ Status indicators and color-coded states
- ✅ Role-aware action buttons
- ✅ Loading states and progress indicators
- ✅ Form validation and input sanitization

### Workflow Support
- Create jobs with client/freelancer addresses, deadlines, and amounts
- Fund and track jobs through their lifecycle
- Client actions: refund, release funds, raise disputes
- Freelancer actions: mark delivered, claim if unresponsive
- Arbitrator actions: resolve disputes with configurable splits

## Technology Stack

### Frontend
- **React 18** with Vite for rapid development
- **Ethers.js** for blockchain interaction
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **Date-fns** for date formatting
- **Headless UI** for accessible components

### Contract
- Hardhat + ethers.js project
- OpenZeppelin ReentrancyGuard
- Full access control patterns
- Checks-Effects-Interactions enforcement

## Project Structure

```
escrow-dashboard/
├── public/
│   └── index.html
├── src/
│   ├── App.jsx              # Main application component
│   ├── components/
│   │   ├── Dashboard.jsx    # Main dashboard layout
│   │   ├── JobCard.jsx      # Individual job display
│   │   ├── JobForm.jsx      # Job creation form
│   │   └── WalletConnect.jsx # Wallet connection component
│   ├── hooks/
│   │   └── useEscrow.js    # Custom hook for contract interactions
│   ├── utils/
│   │   └── formaters.js    # Utility functions
│   ├── context/
│   │   └── AppContext.jsx  # Application context
│   └── abi/Escrow.json     # Contract ABI
├── vite.config.js           # Vite configuration
├── tailwind.config.js       # Tailwind configuration
├── postcss.config.js        # PostCSS configuration
├── package.json            # Dependencies
├── README.md               # Documentation
└── .gitignore              # Git ignore patterns
```

## Getting Started

### Prerequisites

- Node.js 18+ installed
- MetaMask wallet (or other Web3 wallet)

### Installation

```bash
# Clone the repository
cd escrow-dashboard

# Install dependencies
npm install

# Create .env file with your contract details
# Copy from .env.example or create your own
# Example:
# VITE_APP_CONTRACT_ADDRESS=0xYOUR_CONTRACT_ADDRESS_ON_SEPOLIA
# VITE_APP_SEPOLIA_RPC_URL=https://sepolia.drc.org
# VITE_APP_ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY

# Start development server
npm run dev
```

### Build for Production

```bash
# Build for production
npm run build

# Deploy to your preferred hosting service
# (Vercel, Netlify, GitHub Pages, etc.)
```

### Environment Variables

Required environment variables for production:

- `VITE_APP_CONTRACT_ADDRESS`: Your deployed Escrow contract address on Sepolia
- `VITE_APP_SEPOLIA_RPC_URL`: RPC URL for Sepolia network (defaults to https://sepolia.drc.org)
- `VITE_APP_ETHERSCAN_API_KEY`: Etherscan API key for contract verification

Optional: `VITE_APP_CHAIN_ID`: Chain ID for network validation (defaults to 11155111 for Sepolia)

## Usage

### Connecting Wallet

1. Click the \"Connect Wallet\" button
2. Approve the connection request in MetaMask
3. Select your role (Client, Freelancer, or Arbitrator)

### Managing Jobs

#### Creating a Job

1. Click \"Create New Job\" button
2. Fill in:
   - Job title
   - Freelancer address
   - Deadline (YYYY-MM-DD format)
   - Amount (in ETH)
3. Click \"Fund & Create Job\"
4. Confirm transaction in MetaMask

#### Viewing Jobs

Your view depends on your selected role:

**As Client:**
- View jobs you created
- Actions: \"Release Funds\" (when delivered), \"Refund if Expired\" (when funded and expired), \"Raise Dispute\" (when delivered)

**As Freelancer:**
- View jobs where you are the freelancer
- Actions: \"Mark Delivered\" (when funded), \"Claim if Unresponsive\" (when delivered past grace period)

**As Arbitrator:**
- View all disputed jobs
- Actions: \"Resolve\" with configurable client/freelancer splits

### Status Indicators

The dashboard displays the complete job lifecycle with visual indicators:

- **Created**: Job creation initiated
- **Funded**: Job funded and active
- **Delivered**: Work completed by freelancer
- **Released**: Funds released to freelancer
- **Refunded**: Client refund after deadline
- **Disputed**: Dispute raised by client
- **Resolved**: Arbitrator resolved with split distribution

### Timeline Visualization

Each job displays a timeline showing the current stage and next steps:
- Green/colored icons for completed stages
- Yellow icon for current stage
- Gray icons for future stages

## Development Workflow

### Testing Contract Integration

To ensure your contract integration works correctly:

1. **Deploy the contract** to Sepolia using Hardhat Ignition:
   ```bash
   npx hardhat ignition deploy --network sepolia ignition/modules/Escrow.ts
   ```

2. **Update your .env file** with the contract address:
   ```env
   VITE_APP_CONTRACT_ADDRESS=0x[YOUR_DEPLOYED_ADDRESS]
   ```

3. **Test the connection** by opening the app in your browser and checking the console for any connection errors.

### Running Tests

The project includes comprehensive unit tests for React components:

```bash
npm test
```

Integration tests can be run with Hardhat:

```bash
npx hardhat test
```

## Contributing

### Development Guidelines

1. **Code Quality**: Follow ESLint and TypeScript linting rules
2. **Testing**: Write unit tests for all new components and hooks
3. **Accessibility**: Ensure all interactive elements are keyboard-navigable
4. **Performance**: Use React.memo and useMemo for expensive operations
5. **Error Handling**: Implement graceful error states and user feedback

### Building Features

1. **Add new job statuses**: Modify the contract constants and UI accordingly
2. **New roles**: Update access control logic in the contract and UI
3. **Additional features**: Implement new contract functions and corresponding UI

## Troubleshooting

### Common Issues

**MetaMask Not Detected**

- Ensure MetaMask is installed and enabled in your browser
- Install the MetaMask extension from https://metamask.io/
- Check that your browser allows third-party cookies

**Contract Not Found**

- Verify your contract address is correct
- Ensure the contract has been deployed to Sepolia
- Check that you have the correct network selected in MetaMask (Sepolia Test Network)

**Transaction Failures**

- Ensure you have sufficient ETH in your wallet for gas
- Check your account's permissions and balances
- Verify the contract has enough ETH to cover job amounts

**Connection Timeouts**

- Try using a different RPC endpoint
- Increase your Metamask network timeout settings
- Check your internet connection

### Debugging

Open your browser developer tools (F12) and check:

1. **Console** for JavaScript errors
2. **Network** tab for API calls
3. **Application** tab for local storage/local storage

### Getting Help

For issues specific to this application:

1. Check the README and documentation
2. Review the console for error messages
3. Consult the contract documentation
4. Visit the project's GitHub issues for known bugs
5. For blockchain-related issues, check Etherscan for transaction status

## Support

This project is part of the Hardhat + ethers.js sample project collection,
developed by the Nomic Foundation. Community contributions and feedback are welcome!

For general questions and discussions:
- Join the Hardhat 3 Telegram group: https://hardhat.org/hardhat3-telegram-group
- Report issues: https://github.com/NomicFoundation/hardhat/issues/new