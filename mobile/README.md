# Logistika Mobile App

React Native mobile application for the Logistika cargo transportation aggregator.

## Features

- Authentication (Login, Register, SMS Verification)
- Client features:
  - View advertisements
  - Create advertisements
  - Manage bids
  - Track orders
- Driver features:
  - View available advertisements
  - Create bids
  - Manage orders
  - Track location
  - View earnings

## Setup

1. Install dependencies:
```bash
npm install
# or
yarn install
```

2. For iOS:
```bash
cd ios && pod install && cd ..
```

3. Run the app:
```bash
npm run ios
# or
npm run android
```

## Project Structure

```
mobile/
├── src/
│   ├── screens/          # Screen components
│   │   ├── auth/         # Authentication screens
│   │   ├── client/       # Client screens
│   │   └── driver/       # Driver screens
│   ├── navigation/       # Navigation configuration
│   ├── services/         # API services
│   ├── components/      # Reusable components
│   ├── context/         # Context providers
│   ├── utils/           # Utility functions
│   └── types/           # TypeScript types
├── App.tsx              # Main app component
└── package.json
```

## API Configuration

Update the API base URL in `src/services/api.ts`:

```typescript
const API_BASE_URL = __DEV__
  ? 'http://localhost:8000/api'
  : 'https://your-production-api.com/api';
```

For Android emulator, use `http://10.0.2.2:8000/api` instead of `localhost`.

## Environment

- React Native 0.72.6
- TypeScript
- React Navigation 6
- Axios for API calls
- AsyncStorage for local storage


