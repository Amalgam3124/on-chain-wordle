'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { ConnectButton } from '@rainbow-me/rainbowkit';

const WordleGame = dynamic(() => import('../components/WordleGame'), { ssr: false });

export default function Page() {
  useEffect(() => {
    const setVh = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    setVh();
    window.addEventListener('resize', setVh);
    window.addEventListener('orientationchange', setVh);
    return () => {
      window.removeEventListener('resize', setVh);
      window.removeEventListener('orientationchange', setVh);
    };
  }, []);
  return (
    <main className="flex min-h-screen flex-col items-center p-8 gap-6">
      <header className="w-full max-w-3xl flex items-center justify-between">
        <h1 className="text-2xl font-semibold">On-chain Wordle</h1>
        <ConnectButton />
      </header>
      <section className="w-full max-w-3xl">
        <WordleGame />
      </section>
    </main>
  );
}
