import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-inner">
        <div>
          <p className="eyebrow">VaultArt</p>
          <h1 className="title">One free ArtNFT, encrypted bidding built-in</h1>
          <p className="subtitle">
            Mint your piece, list it, and invite buyers to place sealed bids using Zama FHE.
          </p>
        </div>
        <div className="header-actions">
          <div className="network-pill">Sepolia</div>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
