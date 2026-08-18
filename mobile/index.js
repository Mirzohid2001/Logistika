import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {initSentry} from './src/config/sentry';

initSentry();

if (!appName) {
  console.error('App name is not defined in app.json');
}

AppRegistry.registerComponent(appName || 'Logistika', () => App);


