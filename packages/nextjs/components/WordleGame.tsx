'use client';

import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { ethers } from 'ethers';
// Avoid @web3modal/ethers react hooks due to valtio store issues; use EIP-1193 provider directly
import WordleABI from '../contracts/Wordle.json';

import DailyPuzzleNFTABI from '../contracts/DailyPuzzleNFT.json';
// Using wagmi instead of custom wallet hook
import { useAccount, useChainId } from 'wagmi';

// Contract address and ABI
const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0x24649cE96a63d1EDE9a7E458de04Aa92A744cb97').trim();
const NFT_ADDRESS = (process.env.NEXT_PUBLIC_NFT_ADDRESS || '').trim();
const CONTRACT_ABI = WordleABI as any;
const NFT_ABI = DailyPuzzleNFTABI as any;

// Calculate today's UTC calendar ID (YYYYMMDD)
const getTodayIdUTC = (): number => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const d = now.getUTCDate();
  return Number(`${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`);
};

// Rebuild on-chain game state from event logs (avoid calling non-existent getters)
const fetchGameStateFromLogs = async (
  c: ethers.Contract,
  player: string,
): Promise<GameState> => {
  try {
    const lower = player.toLowerCase();
    const provider: any = (c as any).runner?.provider || (c as any).provider;
    const latest: number | undefined = typeof provider?.getBlockNumber === 'function' ? await provider.getBlockNumber() : undefined;

    // Try to find the latest GameInitialized event for this player within progressively larger windows
    const filterInit = (c as any).filters.GameInitialized();
    const windows = [50000, 200000, 500000, 1000000];
    let lastInit: any | null = null;
    let fromBlock = 0;
    const toBlock: number | string = latest ?? 'latest';

    for (const win of windows) {
      const start = latest ? Math.max(latest - win, 0) : 0;
      try {
        const inits = (await c.queryFilter(filterInit, start, toBlock)) as any[];
        const initsForPlayer = inits.filter(
          (e: any) => ((e?.args?.player ?? e?.args?.[0])?.toLowerCase() === lower),
        );
        if (initsForPlayer.length > 0) {
          lastInit = initsForPlayer[initsForPlayer.length - 1];
          fromBlock = lastInit.blockNumber ?? start;
          break;
        }
      } catch (err: any) {
        // Provider may reject large ranges; continue with next (smaller) window
        continue;
      }
    }

    // If we still cannot find init event, treat as not initialized
    if (!lastInit) {
      return { initialized: false, guessCount: 0, completed: false, won: false };
    }

    // Helper: accumulate events in chunks to avoid RPC 'block range too large' errors
    const accumulateEvents = async (filter: any): Promise<any[]> => {
      const out: any[] = [];
      const end = latest ?? (typeof provider?.getBlockNumber === 'function' ? await provider.getBlockNumber() : fromBlock);
      const stepLarge = 100000;
      const stepSmall = 20000;
      let start = fromBlock;
      const safeEnd = typeof end === 'number' ? end : start;

      while (start <= safeEnd) {
        const chunkEnd = Math.min(start + stepLarge, safeEnd);
        try {
          const chunk = (await c.queryFilter(filter, start, chunkEnd)) as any[];
          out.push(...chunk);
        } catch (e) {
          // Fallback to smaller chunks
          let s = start;
          while (s <= chunkEnd) {
            const se = Math.min(s + stepSmall, chunkEnd);
            try {
              const ch = (await c.queryFilter(filter, s, se)) as any[];
              out.push(...ch);
            } catch {
              // swallow
            }
            s = se + 1;
          }
        }
        start = chunkEnd + 1;
      }
      return out;
    };

    const guessesFilter = (c as any).filters.GuessSubmitted();
    const completesFilter = (c as any).filters.GameCompleted();
    const resetsFilter = (c as any).filters.GameReset();
    const guesses = await accumulateEvents(guessesFilter);
    const completes = await accumulateEvents(completesFilter);
    const resets = await accumulateEvents(resetsFilter);

    const guessesForPlayer = guesses.filter(
      (e: any) => ((e?.args?.player ?? e?.args?.[0])?.toLowerCase() === lower),
    );
    const guessCount = guessesForPlayer.length;

    const completesForPlayer = completes.filter(
      (e: any) => ((e?.args?.player ?? e?.args?.[0])?.toLowerCase() === lower),
    );
    const completed = completesForPlayer.length > 0;
    const lastComplete = completesForPlayer[completesForPlayer.length - 1];
    const won = completed ? Boolean(lastComplete?.args?.won ?? lastComplete?.args?.[1]) : false;
// If a reset exists after the last initialization for this player, treat as not initialized
const resetsForPlayer = resets.filter(
  (e: any) => ((e?.args?.player ?? e?.args?.[0])?.toLowerCase() === lower),
);
// Fallback: if GameReset event does not include player address, consider the latest reset globally
const lastResetCandidate = resetsForPlayer.length > 0
  ? resetsForPlayer[resetsForPlayer.length - 1]
  : (resets[resets.length - 1] || null);
if (lastResetCandidate && lastInit && (lastResetCandidate.blockNumber ?? 0) >= (fromBlock ?? 0)) {
  return { initialized: false, guessCount: 0, completed: false, won: false };
}

    return { initialized: true, guessCount, completed, won };
  } catch (e) {
    console.warn('Failed to reconstruct game state from logs:', e);
    return { initialized: false, guessCount: 0, completed: false, won: false };
  }
};

// Game state interface
interface GameState {
  initialized: boolean;
  guessCount: number;
  completed: boolean;
  won: boolean;
}

// Keyboard layout
const KEYBOARD_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

const WordleGame = () => {
  const [walletProvider, setWalletProvider] = useState<any>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Wallet state & helpers (supports Injected + WalletConnect)
  // Wagmi account/chain state
  const { address: wagmiAddress, isConnected: wagmiConnected, connector } = useAccount();
  const wagmiChainId = useChainId();

  // Bridge wallet hook state into local vars used by component
  useEffect(() => {
    setAddress(wagmiAddress ?? null);
  }, [wagmiAddress]);

  useEffect(() => {
    setChainId(wagmiChainId ?? null);
  }, [wagmiChainId]);

  useEffect(() => {
    setIsConnected(Boolean(wagmiConnected));
  }, [wagmiConnected]);

  useEffect(() => {
    const resolveProvider = async () => {
      try {
        let prov: any = null;
        if (connector && (connector as any).getProvider) {
          prov = await (connector as any).getProvider();
        }
        const eth = typeof window !== 'undefined' ? (window as any).ethereum : null;
        setWalletProvider(prov || eth || null);
      } catch (e) {
        console.warn('Failed to resolve provider:', e);
        const eth = typeof window !== 'undefined' ? (window as any).ethereum : null;
        setWalletProvider(eth || null);
      }
    };
    resolveProvider();
  }, [connector, wagmiConnected]);

  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [nftContract, setNftContract] = useState<ethers.Contract | null>(null);
  const [gameState, setGameState] = useState<GameState>({
    initialized: false,
    guessCount: 0,
    completed: false,
    won: false,
  });
  const [hasMintedToday, setHasMintedToday] = useState<boolean>(false);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [results, setResults] = useState<number[][]>([]);
  const [currentGuess, setCurrentGuess] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingReason, setLoadingReason] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [keyStatuses, setKeyStatuses] = useState<Record<string, number>>({});

  // Whether on-chain game is already initialized (infer via hasNewDailyWord); null = unknown
  const [onChainInitialized, setOnChainInitialized] = useState<boolean | null>(null);

  // Initialize contract connection
  useEffect(() => {
    const initContract = async () => {
      try {
        if (isConnected && walletProvider && chainId === 80002) {
          const provider = new ethers.BrowserProvider(walletProvider as any);
          const signer = await provider.getSigner();
          const signerAddress = await signer.getAddress();

          // Extra check: whether contract address has code on current network
          const code = await provider.getCode(CONTRACT_ADDRESS);
          if (code === '0x') {
            setError(
              'Contract address is not deployed or unavailable on the current network. Please change to Sepolia network and reload the page.',
            );
            setContract(null);
            return;
          }

          const contractInstance = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
          setContract(contractInstance);
          try {
            const hasNew = await (contractInstance as any).hasNewDailyWord();
            setOnChainInitialized(!hasNew);
             if (!hasNew) {
               const reconstructed = await fetchGameStateFromLogs(contractInstance, signerAddress);

              // Even if event reconstruction fails, allow guessing (on-chain initialized)
              setGameState(reconstructed.initialized ? reconstructed : { ...reconstructed, initialized: true });
             } else {
               setGameState({ initialized: false, guessCount: 0, completed: false, won: false });
             }
           } catch (stErr) {
             console.warn('Failed to read initial state:', stErr);
            setOnChainInitialized(null);
             setGameState({ initialized: false, guessCount: 0, completed: false, won: false });
           }

          // Initialize NFT contract and check whether today's NFT has been minted
          if (NFT_ADDRESS) {
            const nftCode = await provider.getCode(NFT_ADDRESS);
            if (nftCode !== '0x') {
              const nftInstance = new ethers.Contract(NFT_ADDRESS, NFT_ABI, signer);
              setNftContract(nftInstance);
              try {
                const todayId = getTodayIdUTC();
                const minted = await nftInstance.minted(todayId, signerAddress);
                setHasMintedToday(Boolean(minted));
              } catch (e) {
                console.warn("Failed to read today's NFT mint status:", e);
              }
            } else {
              console.warn('NFT contract address is not deployed or unavailable on the current network:', NFT_ADDRESS);
            }
          } else {
            console.warn('NEXT_PUBLIC_NFT_ADDRESS is not set, skipping NFT checks');
          }
        } else {
          setContract(null);
        }
      } catch (err) {
        console.error('Failed to initialize contract:', err);
        setError('Failed to initialize contract');
      } finally {
        setLoading(false);
      }
    };

    if (walletProvider && isConnected && chainId) {
      const tid = setTimeout(() => {
        initContract();
      }, 0);
      return () => clearTimeout(tid);
    }
  }, [isConnected, chainId, walletProvider]);

  // Initialize game
  const initializeGame = async () => {
    try {
      if (!contract) {
        setError('Contract not connected. Please ensure your wallet is connected and you are on the correct network');
        return;
      }
      setLoading(true);
      setLoadingReason('initialize');
      setError('');

      // If today's NFT is already owned, prompt user to confirm continue
      if (hasMintedToday) {
        const ok = window.confirm("Detected that you already own today's solved NFT. Continue playing anyway?");
        if (!ok) {
          setLoading(false);
          setLoadingReason(null);
          return;
        }
      }

      // Pre-check: whether there is a new daily word today
      const hasNew = await (contract as any).hasNewDailyWord();
      if (!hasNew) {

        // Reconstruct state from event logs; also mark on-chain as initialized
        setOnChainInitialized(true);
        const reconstructed = await fetchGameStateFromLogs(contract as ethers.Contract, address!);
        setGameState(reconstructed.initialized ? reconstructed : { ...reconstructed, initialized: true });
         setError('Already initialized today. You can start guessing directly or click "Reset Game".');
         setLoading(false);
         return;
      }

      // Extra check: whether calldata is correctly encoded
      try {
        const dataHex = (contract as any).interface?.encodeFunctionData?.(
          'initializeDailyGame',
          [],
        );
        if (!dataHex || dataHex === '0x' || dataHex.length < 10) {
          console.error('Init transaction encoding error, calldata is empty or too short:', dataHex);
          setError('Transaction encoding error: init transaction calldata is empty. Please ensure frontend ABI matches the deployed contract');
          setLoading(false);
          return;
        }
      } catch (popErr) {
        console.error('Failed to encode init transaction:', popErr);
        setError('Failed to encode init transaction. Please verify ABI and contract address');
        setLoading(false);
        return;
      }

      // Pre-check: use staticCall (ethers v6) to capture potential revert reasons
      try {
        await (contract as any).getFunction('initializeDailyGame').staticCall();
      } catch (preErr: any) {
        console.error('Init pre-check failed:', preErr);
        setError('On-chain initialization pre-check failed: ' + (preErr?.reason || preErr?.message || 'Unknown error'));
        setLoading(false);
        return;
      }

      // Only call on-chain daily word initialization with gas estimation + buffer
      const fn = (contract as any).getFunction('initializeDailyGame');
      let estimated: bigint | null = null;
      try {
        estimated = await fn.estimateGas();
      } catch (gasErr) {
        console.warn('estimateGas failed, using fallback gas limit:', gasErr);
      }
      const gasLimit = estimated ? (estimated + estimated / 5n) : 1500000n; // add ~20% buffer or fallback
      const tx = await fn({ gasLimit });
      await tx.wait();

      // After successful init, set default initial state directly (no getter calls)
      setGameState({ initialized: true, guessCount: 0, completed: false, won: false });

      // Reset local input and keyboard state (do not use local wordlist)
      setGuesses([]);
      setResults([]);
      setCurrentGuess('');
      setKeyStatuses({});
    } catch (err) {
      console.error('Failed to initialize game:', err);
      setError('Failed to initialize on-chain game. Please confirm network and contract address are correct');
    } finally {
      setLoading(false);
      setLoadingReason(null);
    }
  };

  // Switch network using EIP-1193 provider
  const switchToAmoyW3m = async () => {
    try {
      if (!walletProvider) throw new Error('Wallet provider unavailable');
      await (walletProvider as any).request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x13882' }],
      });
      setChainId(80002);
    } catch (e) {
      console.warn('Failed to switch network to Polygon Amoy:', e);
      setError('Failed to switch network to Polygon Amoy');
    }
  };

  // Submit guess
  const submitGuess = async () => {
    if (currentGuess.length !== 5) {
      setError('Please enter a 5-letter word');
      return;
    }

    if (!gameState.initialized && !onChainInitialized) {
      setError('Please click "Start Game" first');
      return;
    }
    if (gameState.completed) {
      setError('This game is completed. Click "Reset Game" to start a new one');
      return;
    }
    if (gameState.guessCount >= 6) {
      setError('Maximum number of guesses reached (6). Please reset the game');
      return;
    }
  
    try {
      setLoading(true);
      setLoadingReason('submit');
      setError('');

      if (!contract) {
        setError('Contract not connected. Please ensure your wallet is connected and you are on the correct network');
        setLoading(false);
        return;
      }

      const guessUpper = currentGuess.toUpperCase();

      // Pre-check using staticCall to catch potential reverts with reason
      let returned: any;
      try {
        returned = await (contract as any).getFunction('submitGuess').staticCall(guessUpper);
      } catch (preErr: any) {
        console.error('Pre-check before submitting guess failed:', preErr);
        try {
          const data: string | Uint8Array | undefined = preErr?.data;
          if (data) {
            const hex = typeof data === 'string' ? data : ethers.hexlify(data as any);
            const selector = hex.slice(0, 10).toLowerCase();
            if (selector === '0x08c379a0') {
              try {
                const iface = new ethers.Interface(['error Error(string)']);
                const parsed = iface.parseError(hex);
                setError('On-chain submit pre-check failed: ' + String(parsed?.args?.[0] || 'Unknown error'));
              } catch (e) {
                setError('On-chain submit pre-check failed: execution reverted (Error(string))');
              }
            } else {
              setError('On-chain submit pre-check failed: execution reverted (unknown custom error)');
            }
          } else {
            setError('On-chain submit pre-check failed: ' + (preErr?.reason || preErr?.shortMessage || preErr?.message || 'Unknown error'));
          }
        } catch {
          setError('On-chain submit pre-check failed: ' + (preErr?.reason || preErr?.shortMessage || preErr?.message || 'Unknown error'));
        }
        setLoading(false);
        return;
      }

      const tx = await (contract as any).submitGuess(guessUpper);
      await tx.wait();

      // Convert returned Result/array-like to number[]
      const res: number[] = Array.from(returned).map((x: any) => Number(x));

      const updatedGuessCount = gameState.guessCount + 1;
      const won = res.every((v) => v === 2);

      setGuesses((prev) => [...prev, guessUpper]);
      setResults((prev) => [...prev, res]);
      setCurrentGuess('');

      setKeyStatuses((prev) => {
        const next = { ...prev } as Record<string, number>;
        guessUpper.split('').forEach((ch, i) => {
          const status = res![i];
          const prevStatus = next[ch];
          next[ch] = Math.max(prevStatus ?? -1, status);
        });
        return next;
      });

      setGameState({
        initialized: true,
        guessCount: updatedGuessCount,
        completed: won || updatedGuessCount >= 6,
        won,
      });

      // Try minting today's NFT after winning (if not minted yet)
      try {
        if (won && NFT_ADDRESS) {
          const todayId = getTodayIdUTC();
          const already = await nftContract.minted(todayId, address!);
          if (!already) {
            const ok = window.confirm("Congratulations! Mint today's solved NFT?");
            if (!ok) {
              // User canceled minting
              return;
            }
            const txMint = await nftContract.mintSolved(todayId);
            await txMint.wait();
            setHasMintedToday(true);
          }
        }
      } catch (e) {
        console.warn('Mint NFT after winning failed (ignored):', e);
      }
    } catch (err) {
      console.error('Failed to submit guess:', err);
      setError('Failed to submit guess');
    } finally {
      setLoading(false);
      setLoadingReason(null);
    }
  };

  // Reset game
  const resetGame = async () => {
    try {
      setLoading(true);
      setLoadingReason('reset');
      setError('');

      // Detect whether the deployed contract has resetGame in the ABI
      let hasOnChainReset = false;
      try {
        const dataHex = (contract as any)?.interface?.encodeFunctionData?.('resetGame', []);
        hasOnChainReset = Boolean(dataHex && dataHex !== '0x' && dataHex.length >= 10);
      } catch {
        hasOnChainReset = false;
      }

      if (hasOnChainReset && contract) {
        // Pre-check via staticCall
        try {
-          await (contract as any).resetGame.staticCall();
+          await (contract as any).getFunction('resetGame').staticCall();
        } catch (preErr: any) {
          console.error('On-chain reset pre-check failed:', preErr);
          setError('On-chain reset pre-check failed: ' + (preErr?.reason || preErr?.message || 'Unknown error'));
          return;
        }

        // Execute on-chain reset
        const tx = await (contract as any).resetGame();
        await tx.wait();

        // Clear local state and mark as not initialized
        setGuesses([]);
        setResults([]);
        setCurrentGuess('');
        setKeyStatuses({});
        setOnChainInitialized(null);
        setGameState({ initialized: false, guessCount: 0, completed: false, won: false });
        setError('Game has been reset on-chain. Click "Start Game" to start today\'s game again.');
      } else {
        // Fallback: local UI reset only
        setGuesses([]);
        setResults([]);
        setCurrentGuess('');
        setKeyStatuses({});
        setOnChainInitialized(null);
        setGameState({ initialized: false, guessCount: 0, completed: false, won: false });
        setError('On-chain reset is not available with this contract build. Please wait for a new day and click Initialize to start a new daily challenge.');
      }
    } catch (err) {
      console.error('Failed to reset game:', err);
      setError('Failed to reset game');
    } finally {
      setLoading(false);
      setLoadingReason(null);
    }
  };

  // Sync state from chain events
  const syncState = async () => {
    try {
      if (!contract || !address) {
        setError('Contract not connected or wallet not ready');
        return;
      }
      setLoading(true);
      setLoadingReason('sync');
      setError('');

      const reconstructed = await fetchGameStateFromLogs(contract as ethers.Contract, address!);
      // If events don't show initialization but hasNewDailyWord earlier indicated no new word (on-chain initialized), still show initialized
      const initialized = reconstructed.initialized || Boolean(onChainInitialized);
      setGameState({
        initialized,
        guessCount: reconstructed.guessCount,
        completed: reconstructed.completed,
        won: reconstructed.won,
      });
    } catch (e) {
      console.error('Failed to sync state from logs:', e);
      setError('Failed to sync state from chain events');
    } finally {
      setLoading(false);
      setLoadingReason(null);
    }
  };

  // Handle keyboard input
  const handleKeyPress = (key: string) => {
    if (loading || gameState.completed) return;

    if (key === 'ENTER') {
      submitGuess();
    } else if (key === 'BACKSPACE') {
      setCurrentGuess((prev) => prev.slice(0, -1));
    } else if (key.length === 1 && currentGuess.length < 5) {
      setCurrentGuess((prev) => prev + key);
    }
  };

  // Render game grid
  const renderGrid = () => {
    const rows = [] as JSX.Element[];

    // Guessed rows
    for (let i = 0; i < guesses.length; i++) {
      const guess = guesses[i];
      const result = results[i] || [];

      rows.push(
        <div key={i} className="wordle-grid-row">
          {Array.from({ length: 5 }).map((_, j) => (
            <div
              key={j}
              className={`wordle-cell ${result[j] === 2 ? 'correct' : result[j] === 1 ? 'present' : result[j] === 0 ? 'absent' : ''}`}
            >
              {guess[j] || ''}
            </div>
          ))}
        </div>,
      );
    }

    // Current input row
    if (!gameState.completed && guesses.length < 6) {
      rows.push(
        <div key="current" className="wordle-grid-row">
          {Array.from({ length: 5 }).map((_, j) => (
            <div key={j} className="wordle-cell">
              {currentGuess[j] || ''}
            </div>
          ))}
        </div>,
      );
    }

    // Empty rows
    const remainingRows = 6 - rows.length;
    for (let i = 0; i < remainingRows; i++) {
      rows.push(
        <div key={`empty-${i}`} className="wordle-grid-row">
          {Array.from({ length: 5 }).map((_, j) => (
            <div key={j} className="wordle-cell" />
          ))}
        </div>,
      );
    }

    return rows;
  };

  // Keyboard (card style)
  const renderKeyboard = () => {
    return (
      <div className="wordle-kb">
        {KEYBOARD_ROWS.map((row, rowIndex) => {
          const rowClass = rowIndex === 0 ? 'row-10' : rowIndex === 1 ? 'row-9' : 'row-10-balanced';
          return (
            <div key={rowIndex} className={`wordle-kb-row ${rowClass}`}>
              {rowIndex === 2 && (
                <button
                  onClick={() => handleKeyPress('ENTER')}
                  disabled={loading || gameState.completed}
                  className={`key large ${loading || gameState.completed ? 'opacity-50' : ''}`}
                >

                  <AutoFitText text={loading && loadingReason === 'submit' ? 'VERIFYING' : 'SUBMIT'} />
                </button>
              )}
              {row.split('').map((key) => {
                const status = keyStatuses[key];
                const stateCls =
                  status === 2 ? 'correct' : status === 1 ? 'present' : status === 0 ? 'absent' : '';
                return (
                  <button
                    key={key}
                    onClick={() => handleKeyPress(key)}
                    disabled={loading || gameState.completed}
                    className={`key ${stateCls} ${loading || gameState.completed ? 'opacity-50' : ''}`}
                  >
                    {key}
                  </button>
                );
              })}
              {rowIndex === 2 && (
                <button
                  onClick={() => handleKeyPress('BACKSPACE')}
                  disabled={loading || gameState.completed}
                  className={`key large ${loading || gameState.completed ? 'opacity-50' : ''}`}
                >
                  <AutoFitText text="BS" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="wordle-root min-h-screen text-white">
      <div className="wordle-card">
        <h1 className="text-4xl font-bold mb-4">On-chain Wordle</h1>


        <div className="text-sm mb-4">
          <p>Account: <span className="break-all">{address || '-'}</span></p>
          <p>Guesses: {gameState.guessCount}/6</p>
          <p>Contract: <span className="break-all">{CONTRACT_ADDRESS}</span></p>
        </div>

        <div className="mb-4">
          {/* Connection handled by RainbowKit ConnectButton in page header */}
          {!isConnected && (
            <div className="text-sm text-gray-400 mb-2">Please connect wallet using the button above.</div>
          )}

          {isConnected && chainId !== 80002 && (
            <button
              onClick={switchToAmoyW3m}
              disabled={loading}
              className="btn btn-primary px-5 py-2 disabled:opacity-50 mr-2"
            >
              {loading ? 'Switching...' : 'Switch to Amoy'}
            </button>
          )}

          {!(gameState.initialized || onChainInitialized) && (
            <button
              onClick={initializeGame}
              disabled={loading || !isConnected || chainId !== 80002}
              className="btn btn-primary px-5 py-2 disabled:opacity-50"
            >
              {loading && loadingReason === 'initialize' ? 'Initializing...' : 'Start Game'}
            </button>
          )}

          {(gameState.initialized || onChainInitialized) && (
            <button
              onClick={resetGame}
              disabled={loading}
              className="btn btn-primary px-5 py-2 disabled:opacity-50"
            >
              {loading
                ? loadingReason === 'reset'
                  ? 'Resetting...'
                  : loadingReason === 'submit'
                  ? 'VERIFYING...'
                  : 'Processing...'
                : 'Reset Game'}
            </button>
          )}

          {isConnected && chainId === 80002 && contract && (
            <button
              onClick={syncState}
              disabled={loading}
              className="btn btn-primary px-5 py-2 disabled:opacity-50 ml-2"
            >
              Sync State
            </button>
          )}

          {error && <div className="text-red-500 text-sm mb-2">{error}</div>}
        </div>

        <div className="mb-4">{renderGrid()}</div>

        {(gameState.initialized || onChainInitialized) && renderKeyboard()}

        <div className="wordle-text-muted text-sm mt-6">
          <p>This is a demo of On-chain Wordle on Polygon Amoy</p>
          <p>Green = correct position, Yellow = wrong position, Gray = not in the word</p>
        </div>
      </div>
    </div>
  );
};

export default WordleGame;

function AutoFitText({ text, minScale = 0.45, maxScale = 1 }: { text: string; minScale?: number; maxScale?: number }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [scale, setScale] = useState(1);

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const span = textRef.current;
    if (!wrap || !span) return;
    const wrapWidth = wrap.clientWidth;
    const spanWidth = span.scrollWidth;
    if (wrapWidth > 0 && spanWidth > 0) {
      const ratio = wrapWidth / spanWidth;
      const next = Math.max(minScale, Math.min(maxScale, ratio));
      setScale(next);
    }
  }, [minScale, maxScale, text]);

  useLayoutEffect(() => {
    measure();
  }, [measure, text]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(measure);
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span ref={textRef} style={{ display: 'inline-block', transform: `scale(${scale})`, transformOrigin: 'center', whiteSpace: 'nowrap', lineHeight: 1 }}>{text}</span>
    </div>
  );
}
