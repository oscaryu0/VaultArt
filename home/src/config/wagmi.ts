import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'VaultArt',
  projectId: '3d6c5b2edc5b4394bbf6e1f2f1a6a8e1',
  chains: [sepolia],
  ssr: false,
});
