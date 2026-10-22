// AsyncStorage no existe fuera del teléfono: en las pruebas se usa su simulación oficial.
// (El walkthrough guarda en AsyncStorage y lo importan el Inicio y el visor, hito 3.)
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
