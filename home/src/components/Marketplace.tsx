import { useEffect, useMemo, useState } from 'react';
import { Contract, ethers } from 'ethers';
import { useAccount, useReadContract } from 'wagmi';
import { ART_NFT_ABI, ART_NFT_ADDRESS } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import '../styles/Marketplace.css';

type Listing = {
  tokenId: bigint;
  seller: string;
  price: bigint;
  active: boolean;
};

type Bid = {
  bidder: string;
  price: string;
  timestamp: bigint;
};

const formatEth = (value?: bigint) => {
  if (value === undefined) return '0.000';
  return Number(ethers.formatEther(value)).toFixed(3);
};

const shortAddress = (value: string) => (value.length < 10 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`);

const formatDate = (timestamp: bigint) => new Date(Number(timestamp) * 1000).toLocaleString();

export function Marketplace() {
  const { address, isConnected } = useAccount();
  const signer = useEthersSigner();
  const { instance, isLoading: encryptionLoading, error: encryptionError } = useZamaInstance();

  const [mintUri, setMintUri] = useState('ipfs://');
  const [listPrice, setListPrice] = useState('0.05');
  const [bidAmount, setBidAmount] = useState('0.02');
  const [status, setStatus] = useState('');
  const [selectedToken, setSelectedToken] = useState<bigint | null>(null);
  const [decryptedPrices, setDecryptedPrices] = useState<Record<string, string>>({});
  const [decryptingHandle, setDecryptingHandle] = useState<string | null>(null);

  const {
    data: ownedTokenId,
    refetch: refetchOwnedToken,
  } = useReadContract({
    address: ART_NFT_ADDRESS,
    abi: ART_NFT_ABI,
    functionName: 'tokenOf',
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
    },
  });

  const mintedTokenId = ownedTokenId && ownedTokenId > 0n ? ownedTokenId : null;

  const {
    data: listingData,
    refetch: refetchListing,
  } = useReadContract({
    address: ART_NFT_ADDRESS,
    abi: ART_NFT_ABI,
    functionName: 'getListing',
    args: mintedTokenId ? [mintedTokenId] : undefined,
    query: {
      enabled: Boolean(mintedTokenId),
    },
  });

  const {
    data: activeListingsData,
    refetch: refetchListings,
  } = useReadContract({
    address: ART_NFT_ADDRESS,
    abi: ART_NFT_ABI,
    functionName: 'getActiveListings',
  });

  const {
    data: bidsData,
    refetch: refetchBids,
  } = useReadContract({
    address: ART_NFT_ADDRESS,
    abi: ART_NFT_ABI,
    functionName: 'getBids',
    args: mintedTokenId ? [mintedTokenId] : undefined,
    query: {
      enabled: Boolean(mintedTokenId),
    },
  });

  const listing = useMemo(() => {
    if (!listingData) return null;
    const raw = listingData as any;
    return {
      seller: raw[0] as string,
      price: BigInt(raw[1]),
      active: Boolean(raw[2]),
    };
  }, [listingData]);

  const listings: Listing[] = useMemo(() => {
    if (!activeListingsData) return [];
    return (activeListingsData as any[]).map((item) => ({
      tokenId: BigInt(item[0]),
      seller: item[1] as string,
      price: BigInt(item[2]),
      active: Boolean(item[3]),
    }));
  }, [activeListingsData]);

  const bids: Bid[] = useMemo(() => {
    if (!bidsData) return [];
    return (bidsData as any[]).map((bid) => ({
      bidder: bid[0] as string,
      price: bid[1] as string,
      timestamp: BigInt(bid[2]),
    }));
  }, [bidsData]);

  useEffect(() => {
    if (mintedTokenId) {
      setSelectedToken(mintedTokenId);
    }
  }, [mintedTokenId]);

  useEffect(() => {
    if (selectedToken === null && listings.length > 0) {
      const first = listings.find((item) => item.seller.toLowerCase() !== (address ?? '').toLowerCase()) ?? listings[0];
      setSelectedToken(first.tokenId);
    }
  }, [listings, address, selectedToken]);

  const refreshData = async () => {
    await Promise.all([
      refetchListings?.(),
      refetchOwnedToken?.(),
      mintedTokenId ? refetchListing?.() : Promise.resolve(),
      mintedTokenId ? refetchBids?.() : Promise.resolve(),
    ]);
  };

  const getResolvedSigner = async () => {
    if (!signer) {
      throw new Error('Connect your wallet to continue');
    }
    const resolved = await signer;
    if (!resolved) {
      throw new Error('Connect your wallet to continue');
    }
    return resolved;
  };

  const handleMint = async () => {
    try {
      const resolvedSigner = await getResolvedSigner();
      const contract = new Contract(ART_NFT_ADDRESS, ART_NFT_ABI, resolvedSigner);
      setStatus('Minting your one-time ArtNFT...');
      const tx = await contract.mintArt(mintUri.trim());
      await tx.wait();
      setStatus('Minted! Fetching latest data...');
      await refreshData();
    } catch (error) {
      const message = (error as Error).message?.split('\n')[0] ?? 'Mint failed';
      setStatus(message);
    }
  };

  const handleList = async () => {
    if (!mintedTokenId) {
      setStatus('Mint your ArtNFT first.');
      return;
    }

    const priceWei = ethers.parseEther(listPrice || '0');
    if (priceWei <= 0) {
      setStatus('Listing price must be greater than 0.');
      return;
    }

    try {
      const resolvedSigner = await getResolvedSigner();
      const contract = new Contract(ART_NFT_ADDRESS, ART_NFT_ABI, resolvedSigner);
      setStatus('Publishing listing to the marketplace...');
      const tx = await contract.listToken(mintedTokenId, priceWei);
      await tx.wait();
      setStatus('Listing updated.');
      await refreshData();
    } catch (error) {
      setStatus((error as Error).message?.split('\n')[0] ?? 'Listing failed');
    }
  };

  const handleCancelListing = async () => {
    if (!mintedTokenId) {
      setStatus('No token to manage yet.');
      return;
    }
    if (!listing?.active) {
      setStatus('No active listing to cancel.');
      return;
    }

    try {
      const resolvedSigner = await getResolvedSigner();
      const contract = new Contract(ART_NFT_ADDRESS, ART_NFT_ABI, resolvedSigner);
      setStatus('Canceling listing...');
      const tx = await contract.cancelListing(mintedTokenId);
      await tx.wait();
      setStatus('Listing removed.');
      await refreshData();
    } catch (error) {
      setStatus((error as Error).message?.split('\n')[0] ?? 'Cancel failed');
    }
  };

  const handleBuy = async (selected: Listing) => {
    try {
      const resolvedSigner = await getResolvedSigner();
      const contract = new Contract(ART_NFT_ADDRESS, ART_NFT_ABI, resolvedSigner);
      setStatus('Sending purchase transaction...');
      const tx = await contract.buyListed(selected.tokenId, { value: selected.price });
      await tx.wait();
      setStatus(`You now own token #${selected.tokenId.toString()}.`);
      await refreshData();
    } catch (error) {
      setStatus((error as Error).message?.split('\n')[0] ?? 'Purchase failed');
    }
  };

  const handleBid = async (tokenId: bigint) => {
    if (!address) {
      setStatus('Connect your wallet to bid.');
      return;
    }
    if (!instance) {
      setStatus('Encryption is still loading.');
      return;
    }

    const bidWei = ethers.parseEther(bidAmount || '0');
    if (bidWei <= 0) {
      setStatus('Enter a bid above zero.');
      return;
    }
    if (bidWei >= 2n ** 64n) {
      setStatus('Bid is too large for euint64.');
      return;
    }

    try {
      const resolvedSigner = await getResolvedSigner();
      const contract = new Contract(ART_NFT_ADDRESS, ART_NFT_ABI, resolvedSigner);
      setStatus('Encrypting your bid with Zama FHE...');

      const buffer = instance.createEncryptedInput(ART_NFT_ADDRESS, address);
      buffer.add64(bidWei);
      const encrypted = await buffer.encrypt();

      const tx = await contract.placeBid(tokenId, encrypted.handles[0], encrypted.inputProof);
      await tx.wait();
      setStatus('Bid submitted privately.');
      await refreshData();
    } catch (error) {
      setStatus((error as Error).message?.split('\n')[0] ?? 'Bid failed');
    }
  };

  const handleDecrypt = async (handle: string) => {
    if (!instance || !address) {
      setStatus('Connect your wallet to decrypt bids.');
      return;
    }
    try {
      setDecryptingHandle(handle);
      const keypair = instance.generateKeypair();
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '3';

      const eip712 = instance.createEIP712(keypair.publicKey, [ART_NFT_ADDRESS], startTimeStamp, durationDays);
      const resolvedSigner = await getResolvedSigner();
      const signature = await resolvedSigner.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message
      );

      const result = await instance.userDecrypt(
        [{ handle, contractAddress: ART_NFT_ADDRESS }],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        [ART_NFT_ADDRESS],
        address,
        startTimeStamp,
        durationDays
      );

      const clearValue = BigInt(result[handle]);
      setDecryptedPrices((prev) => ({
        ...prev,
        [handle]: Number(ethers.formatEther(clearValue)).toFixed(4),
      }));
    } catch (error) {
      setStatus((error as Error).message?.split('\n')[0] ?? 'Decryption failed');
    } finally {
      setDecryptingHandle(null);
    }
  };

  return (
    <div className="marketplace">
      <section className="callout">
        <div>
          <p className="pill">Encrypted bids powered by Zama</p>
          <h2>Mint once for free. Trade with sealed offers.</h2>
          <p>
            Every address can mint a single ArtNFT. List it for sale, invite encrypted bids, and decrypt them only when
            you choose.
          </p>
        </div>
        <div className="callout-grid">
          <div>
            <span className="accent-number">1</span>
            <p>Free mint</p>
          </div>
          <div>
            <span className="accent-number">2</span>
            <p>List with a public price</p>
          </div>
          <div>
            <span className="accent-number">3</span>
            <p>Accept encrypted bids</p>
          </div>
        </div>
      </section>

      <div className="panel-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="pill">Step 1</p>
              <h3>Mint your ArtNFT</h3>
            </div>
            <div className="badge">{mintedTokenId ? `Token #${mintedTokenId.toString()}` : 'Not minted yet'}</div>
          </div>
          <p className="helper">One mint per wallet. Keep the URI empty if you just want an on-chain proof.</p>
          <label className="field-label">Token URI (optional)</label>
          <input
            value={mintUri}
            onChange={(e) => setMintUri(e.target.value)}
            placeholder="ipfs://your-artwork"
            className="field"
          />
          <button
            className="primary"
            onClick={handleMint}
            disabled={!isConnected || Boolean(mintedTokenId)}
          >
            {mintedTokenId ? 'Already minted' : 'Mint for free'}
          </button>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="pill">Step 2</p>
              <h3>Listing controls</h3>
            </div>
            {listing?.active ? <div className="badge badge-live">Live</div> : <div className="badge">Not listed</div>}
          </div>
          <p className="helper">Publish or cancel your listing any time. Funds transfer automatically on purchase.</p>
          <label className="field-label">Price (ETH)</label>
          <input
            value={listPrice}
            onChange={(e) => setListPrice(e.target.value)}
            type="number"
            min="0"
            step="0.001"
            className="field"
          />
          <div className="button-row">
            <button className="primary" onClick={handleList} disabled={!mintedTokenId}>
              {listing?.active ? 'Update price' : 'List for sale'}
            </button>
            <button className="ghost" onClick={handleCancelListing} disabled={!listing?.active}>
              Cancel listing
            </button>
          </div>
          {listing?.active && (
            <p className="helper">Current listing: {formatEth(listing.price)} ETH</p>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="pill">Step 3</p>
            <h3>Marketplace</h3>
            <p className="helper">Pick a listing, buy instantly, or send an encrypted bid.</p>
          </div>
          <div className="bid-bar">
            <div className="bid-meta">
              <span className="chip">Selected #{selectedToken ? selectedToken.toString() : '—'}</span>
            </div>
            <input
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              type="number"
              min="0"
              step="0.001"
              className="field small"
              placeholder="0.02"
            />
            <button
              className="primary"
              onClick={() => selectedToken && handleBid(selectedToken)}
              disabled={!selectedToken || encryptionLoading}
            >
              {encryptionLoading ? 'Preparing encryption...' : 'Send encrypted bid'}
            </button>
          </div>
        </div>
        <div className="listing-grid">
          {listings.length === 0 && <p className="helper">No active listings yet.</p>}
          {listings.map((item) => (
            <div
              key={item.tokenId.toString()}
              className={`listing-card ${selectedToken === item.tokenId ? 'selected' : ''}`}
            >
              <div className="listing-top">
                <div>
                  <p className="pill muted">Token #{item.tokenId.toString()}</p>
                  <h4>{formatEth(item.price)} ETH</h4>
                </div>
                <button className="ghost small" onClick={() => setSelectedToken(item.tokenId)}>
                  Select
                </button>
              </div>
              <p className="helper">Seller {shortAddress(item.seller)}</p>
              <div className="button-row">
                <button
                  className="primary"
                  onClick={() => handleBuy(item)}
                  disabled={!isConnected || item.seller.toLowerCase() === (address ?? '').toLowerCase()}
                >
                  Buy now
                </button>
                <button
                  className="ghost"
                  onClick={() => {
                    setSelectedToken(item.tokenId);
                    handleBid(item.tokenId);
                  }}
                  disabled={encryptionLoading}
                >
                  Encrypted bid
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {mintedTokenId && (
        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="pill">Encrypted bids</p>
              <h3>Bids for your listing</h3>
              <p className="helper">Only the seller can decrypt bid prices.</p>
            </div>
            <div className="badge">{bids.length} bids</div>
          </div>
          {bids.length === 0 && <p className="helper">No bids yet. Invite collectors to submit sealed offers.</p>}
          <div className="bids">
            {bids.map((bid, index) => {
              const decryptedValue = decryptedPrices[bid.price];
              return (
                <div key={`${bid.bidder}-${index}`} className="bid-row">
                  <div>
                    <p className="pill muted">Bidder {shortAddress(bid.bidder)}</p>
                    <p className="helper">{formatDate(bid.timestamp)}</p>
                  </div>
                  <div className="bid-actions">
                    {decryptedValue ? (
                      <div className="chip chip-strong">{decryptedValue} ETH</div>
                    ) : (
                      <button
                        className="primary"
                        onClick={() => handleDecrypt(bid.price)}
                        disabled={decryptingHandle === bid.price}
                      >
                        {decryptingHandle === bid.price ? 'Decrypting...' : 'Decrypt bid'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {status && <div className="status-banner">{status}</div>}
      {encryptionError && <div className="status-banner error">{encryptionError}</div>}
    </div>
  );
}
