// Polygon Amoy network configuration and helpers
export const amoyNetwork = {
  id: 80002,
  name: 'Polygon Amoy',
  network: 'polygon-amoy',
  nativeCurrency: {
    decimals: 18,
    name: 'Polygon',
    symbol: 'POL',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc-amoy.polygon.technology'],
    },
    public: {
      http: ['https://rpc-amoy.polygon.technology'],
    },
  },
  blockExplorers: {
    default: { name: 'Polygonscan', url: 'https://amoy.polygonscan.com' },
  },
  testnet: true,
};

export const supportedNetworks = [amoyNetwork];

export const isSupportedNetwork = (chainId: number): boolean => {
  return supportedNetworks.some((network) => network.id === chainId);
};

export const getNetworkSwitchParams = (network: typeof amoyNetwork) => {
  return {
    chainId: `0x${network.id.toString(16)}`,
    chainName: network.name,
    nativeCurrency: network.nativeCurrency,
    rpcUrls: network.rpcUrls.default.http,
    blockExplorerUrls: [network.blockExplorers.default.url],
  };
};
