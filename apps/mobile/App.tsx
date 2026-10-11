import { StatusBar } from 'expo-status-bar';
import { Root } from './src/ui/screens';

// Terra Link Campo (P0-023): captura offline local. Sin sincronización todavía (P0-024).
export default function App() {
  return (
    <>
      <StatusBar style="light" />
      <Root />
    </>
  );
}
