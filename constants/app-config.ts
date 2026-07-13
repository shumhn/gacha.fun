import { SolanaCluster } from '@wallet-ui/react-native-web3js'

export class AppConfig {
  static name = 'MATKA'
  static uri = 'https://matka.app'
  static networks: SolanaCluster[] = [
    {
      id: 'solana:devnet',
      label: 'Devnet',
      url: 'https://rpc.magicblock.app/devnet',
    },
  ]
}
