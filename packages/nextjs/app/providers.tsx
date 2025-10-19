'use client';

import '@rainbow-me/rainbowkit/styles.css';
import { RainbowKitProvider, getDefaultConfig, darkTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider, createConfig, http } from 'wagmi';
// import { sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useMemo } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID; // no demo fallback
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc-amoy.polygon.technology';

  // Define Polygon Amoy chain
  const amoy = {
    id: 80002,
    name: 'Polygon Amoy',
    network: 'polygon-amoy',
    nativeCurrency: { name: 'Polygon', symbol: 'POL', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] }, public: { http: [rpcUrl] } },
    blockExplorers: { default: { name: 'Polygonscan', url: 'https://amoy.polygonscan.com' } },
    testnet: true,
  } as const;

  const config = useMemo(() => {
    if (projectId && projectId.trim().length > 0) {
      return getDefaultConfig({
        appName: 'On-chain Wordle',
        projectId,
        chains: [amoy],
        transports: { [amoy.id]: http(rpcUrl) },
        ssr: false,
      });
    }
    // Graceful fallback: injected-only connectors when WalletConnect projectId is missing
    return createConfig({
      chains: [amoy],
      connectors: [injected()],
      transports: { [amoy.id]: http(rpcUrl) },
      ssr: false,
    });
  }, [projectId, rpcUrl]);

  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()}> {children} </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}