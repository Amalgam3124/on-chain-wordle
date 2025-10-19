import { useState, useEffect, useRef } from 'react';
import EthereumProvider from '@walletconnect/ethereum-provider';
import { amoyNetwork, getNetworkSwitchParams, isSupportedNetwork } from '../utils/networks';

interface WalletState {
  isConnected: boolean;
  account: string | null;
  chainId: number | null;
  isCorrectNetwork: boolean;
  isLoading: boolean;
  error: string | null;
}

export const useWallet = () => {
  const [walletState, setWalletState] = useState<WalletState>({
    isConnected: false,
    account: null,
    chainId: null,
    isCorrectNetwork: false,
    isLoading: true,
    error: null,
  });

  // Track selected external provider (e.g., WalletConnect)
  const externalProviderRef = useRef<any | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<'metamask' | 'walletconnect' | null>(null);

  // Target chain ID: prefer environment variable, otherwise fallback to Amoy
  const targetChainId =
    typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_CHAIN_ID
      ? Number(process.env.NEXT_PUBLIC_CHAIN_ID)
      : amoyNetwork.id;

  // Check wallet connection (WalletConnect-only)
  const checkWalletConnection = async () => {
    const ext = externalProviderRef.current;
    if (!ext) {
      // No provider yet — show Connect button without error
      setWalletState((prev) => ({
        ...prev,
        isLoading: false,
        isConnected: false,
        account: null,
        chainId: null,
        isCorrectNetwork: false,
        error: null,
      }));
      return;
    }

    try {
      const accounts = await ext.request({ method: 'eth_accounts' });
      const chainId = await ext.request({ method: 'eth_chainId' });
      const chainIdNumber = parseInt(chainId, 16);

      setWalletState({
        isConnected: accounts.length > 0,
        account: accounts[0] || null,
        chainId: chainIdNumber,
        isCorrectNetwork: chainIdNumber === targetChainId,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Failed to check WalletConnect connection:', error);
      setWalletState((prev) => ({
        ...prev,
        isLoading: false,
        error: 'Failed to check WalletConnect connection',
      }));
    }
  };

  // Connect wallet (alias to WalletConnect)
  const connectWallet = async () => {
    // Route all connections through WalletConnect
    await connectWalletConnect();
  };

  // Switch to target network (Amoy by default)
  const switchToAmoy = async () => {
    const provider = externalProviderRef.current;
    if (!provider) return;

    try {
      setWalletState((prev) => ({ ...prev, isLoading: true, error: null }));

      // Try switching to the target network
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${targetChainId.toString(16)}` }],
      });

      // Update state
      setWalletState((prev) => ({
        ...prev,
        chainId: targetChainId,
        isCorrectNetwork: true,
        isLoading: false,
      }));
    } catch (switchError: any) {
      // If network is not added, try adding it
      if (switchError.code === 4902) {
        try {
          const networkParams = getNetworkSwitchParams({ ...amoyNetwork, id: targetChainId } as any);
          if (networkParams) {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [networkParams],
            });

            setWalletState((prev) => ({
              ...prev,
              chainId: targetChainId,
              isCorrectNetwork: true,
              isLoading: false,
            }));
          }
        } catch (addError: any) {
          console.error('Failed to add network:', addError);
          setWalletState((prev) => ({
            ...prev,
            isLoading: false,
            error: 'Failed to add target network',
          }));
        }
      } else {
        console.error('Failed to switch network:', switchError);
        setWalletState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Failed to switch to target network',
        }));
      }
    }
  };

  // Listen for account and network changes (WalletConnect-only)
  useEffect(() => {
    const provider = externalProviderRef.current;
    if (provider) {
      const handleAccountsChanged = (accounts: string[]) => {
        setWalletState((prev) => ({
          ...prev,
          isConnected: accounts.length > 0,
          account: accounts[0] || null,
        }));
      };

      const handleChainChanged = (chainId: string) => {
        const chainIdNumber = parseInt(chainId, 16);
        setWalletState((prev) => ({
          ...prev,
          chainId: chainIdNumber,
          isCorrectNetwork: chainIdNumber === targetChainId,
        }));
      };

      provider.on && provider.on('accountsChanged', handleAccountsChanged);
      provider.on && provider.on('chainChanged', handleChainChanged);

      return () => {
        provider.removeListener && provider.removeListener('accountsChanged', handleAccountsChanged);
        provider.removeListener && provider.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, [targetChainId]);

  // Initial check
  useEffect(() => {
    checkWalletConnection();
  }, []);

  // WalletConnect quick connect
  const connectWalletConnect = async () => {
    try {
      setWalletState((prev) => ({ ...prev, isLoading: true, error: null }));
      const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
      if (!projectId) {
        setWalletState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'WalletConnect projectId is not set in .env.local',
        }));
        return;
      }

      // Prefer explicit RPC map to improve reliability on testnets
      const defaultRpc = process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc-amoy.polygon.technology';
      const wc = await EthereumProvider.init({
        projectId,
        chains: [targetChainId],
        rpcMap: { [targetChainId]: defaultRpc },
        showQrModal: true,
        metadata: {
          name: 'On-chain Wordle',
          description: 'Plaintext Wordle on Polygon Amoy',
          url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
          icons: ['https://polygon.technology/_next/static/media/polygon-logo.1f47adc9.svg'],
        },
      });
      await wc.enable();

      externalProviderRef.current = wc as any;
      setSelectedWallet('walletconnect');

      // Try getting accounts; if empty, request explicitly
      let accounts: string[] = await wc.request({ method: 'eth_accounts' });
      if (!accounts || accounts.length === 0) {
        try {
          accounts = await wc.request({ method: 'eth_requestAccounts' });
        } catch (reqErr) {
          console.warn('WalletConnect eth_requestAccounts failed:', reqErr);
        }
      }
      const chainIdHex: string = await wc.request({ method: 'eth_chainId' });
      const chainIdNumber = parseInt(chainIdHex, 16);

      setWalletState({
        isConnected: accounts.length > 0,
        account: accounts[0] || null,
        chainId: chainIdNumber,
        isCorrectNetwork: chainIdNumber === targetChainId,
        isLoading: false,
        error: null,
      });

      if (chainIdNumber !== targetChainId) {
        await switchToAmoy();
      }
    } catch (error: any) {
      console.error('WalletConnect connection failed:', error);
      setWalletState((prev) => ({
        ...prev,
        isLoading: false,
        error: error?.message || 'Failed to connect via WalletConnect',
      }));
    }
  };

  // Get currently selected EIP-1193 provider
  const getExternalProvider = () => {
    return externalProviderRef.current || null;
  };

  return {
    ...walletState,
    connectWallet,
    connectWalletConnect,
    switchToAmoy,
    checkWalletConnection,
    selectedWallet,
    getExternalProvider,
  };
};
