// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data) external returns (bytes4);
}

contract ArtNFT is ZamaEthereumConfig {
    using FHE for euint64;

    struct Listing {
        address seller;
        uint256 price;
        bool active;
    }

    struct ListingInfo {
        uint256 tokenId;
        address seller;
        uint256 price;
        bool active;
    }

    struct Bid {
        address bidder;
        euint64 price;
        uint64 timestamp;
    }

    string public name;
    string public symbol;

    uint256 private _nextTokenId = 1;
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    mapping(address => uint256[]) private _ownedTokens;
    mapping(uint256 => uint256) private _ownedTokensIndex;
    mapping(uint256 => string) private _tokenURIs;
    mapping(address => bool) public hasMinted;

    mapping(uint256 => Listing) private _listings;
    uint256[] private _listedTokenIds;
    mapping(uint256 => uint256) private _listedIndex;

    mapping(uint256 => Bid[]) private _bids;

    bool private _entered;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event ArtMinted(address indexed minter, uint256 indexed tokenId, string tokenURI);
    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event ListingCanceled(uint256 indexed tokenId);
    event ListingPurchased(uint256 indexed tokenId, address indexed buyer, uint256 price);
    event BidPlaced(uint256 indexed tokenId, address indexed bidder, euint64 price, uint64 timestamp);

    modifier nonReentrant() {
        require(!_entered, "ReentrancyGuard: reentrant call");
        _entered = true;
        _;
        _entered = false;
    }

    constructor() {
        name = "ArtNFT";
        symbol = "ART";
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x80ac58cd || interfaceId == 0x5b5e139f || interfaceId == 0x01ffc9a7;
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    function balanceOf(address owner) external view returns (uint256) {
        require(owner != address(0), "Zero address");
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address owner = _owners[tokenId];
        require(owner != address(0), "Nonexistent token");
        return owner;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(_exists(tokenId), "Nonexistent token");
        return _tokenURIs[tokenId];
    }

    function tokenOf(address account) external view returns (uint256) {
        uint256 length = _ownedTokens[account].length;
        if (length == 0) {
            return 0;
        }
        return _ownedTokens[account][0];
    }

    function getOwnedTokens(address account) external view returns (uint256[] memory) {
        return _ownedTokens[account];
    }

    function approve(address to, uint256 tokenId) external {
        address owner = ownerOf(tokenId);
        require(to != owner, "Approval to current owner");
        require(msg.sender == owner || isApprovedForAll(owner, msg.sender), "Not authorized");

        _tokenApprovals[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        require(_exists(tokenId), "Nonexistent token");
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external {
        require(operator != msg.sender, "Operator equals sender");
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address owner, address operator) public view returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Not approved nor owner");
        _transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Not approved nor owner");
        _safeTransfer(from, to, tokenId, data);
    }

    function mintArt(string calldata tokenURI_) external returns (uint256) {
        require(!hasMinted[msg.sender], "Already minted");

        uint256 tokenId = _nextTokenId;
        _nextTokenId = tokenId + 1;
        hasMinted[msg.sender] = true;

        _safeMint(msg.sender, tokenId);
        _tokenURIs[tokenId] = tokenURI_;

        emit ArtMinted(msg.sender, tokenId, tokenURI_);
        return tokenId;
    }

    function listToken(uint256 tokenId, uint256 price) external {
        require(price > 0, "Price is zero");
        require(_isApprovedOrOwner(msg.sender, tokenId), "Not approved nor owner");

        Listing storage listing = _listings[tokenId];
        listing.seller = ownerOf(tokenId);
        listing.price = price;
        if (!listing.active) {
            listing.active = true;
            _addListedToken(tokenId);
        }

        emit Listed(tokenId, listing.seller, price);
    }

    function cancelListing(uint256 tokenId) external {
        Listing memory listing = _listings[tokenId];
        require(listing.active, "Not listed");
        require(listing.seller == msg.sender, "Not seller");

        _clearListing(tokenId, true);
    }

    function buyListed(uint256 tokenId) external payable nonReentrant {
        Listing memory listing = _listings[tokenId];
        require(listing.active, "Not listed");
        require(listing.seller != address(0), "Invalid listing");
        require(msg.sender != listing.seller, "Seller cannot buy");
        require(ownerOf(tokenId) == listing.seller, "Seller not owner");
        require(msg.value >= listing.price, "Insufficient payment");

        _clearListing(tokenId, false);

        _transfer(listing.seller, msg.sender, tokenId);

        (bool sent, ) = payable(listing.seller).call{value: listing.price}("");
        require(sent, "Payment failed");

        if (msg.value > listing.price) {
            (bool refunded, ) = payable(msg.sender).call{value: msg.value - listing.price}("");
            require(refunded, "Refund failed");
        }

        emit ListingPurchased(tokenId, msg.sender, listing.price);
    }

    function getListing(uint256 tokenId) external view returns (Listing memory) {
        return _listings[tokenId];
    }

    function getActiveListings() external view returns (ListingInfo[] memory) {
        uint256 activeCount = _listedTokenIds.length;
        ListingInfo[] memory data = new ListingInfo[](activeCount);

        for (uint256 i = 0; i < activeCount; i++) {
            uint256 tokenId = _listedTokenIds[i];
            Listing memory listing = _listings[tokenId];
            data[i] = ListingInfo({tokenId: tokenId, seller: listing.seller, price: listing.price, active: listing.active});
        }

        return data;
    }

    function placeBid(uint256 tokenId, externalEuint64 encryptedPrice, bytes calldata inputProof) external {
        Listing memory listing = _listings[tokenId];
        require(listing.active, "Not listed");
        require(listing.seller != address(0), "Invalid listing");
        require(msg.sender != listing.seller, "Owner cannot bid");

        euint64 encryptedBid = FHE.fromExternal(encryptedPrice, inputProof);

        Bid memory newBid = Bid({bidder: msg.sender, price: encryptedBid, timestamp: uint64(block.timestamp)});

        _bids[tokenId].push(newBid);

        FHE.allow(encryptedBid, listing.seller);
        FHE.allowThis(encryptedBid);

        emit BidPlaced(tokenId, msg.sender, encryptedBid, uint64(block.timestamp));
    }

    function getBids(uint256 tokenId) external view returns (Bid[] memory) {
        return _bids[tokenId];
    }

    function getBidCount(uint256 tokenId) external view returns (uint256) {
        return _bids[tokenId].length;
    }

    function _exists(uint256 tokenId) internal view returns (bool) {
        return _owners[tokenId] != address(0);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address owner = _owners[tokenId];
        return owner != address(0) && (spender == owner || _tokenApprovals[tokenId] == spender || _operatorApprovals[owner][spender]);
    }

    function _safeTransfer(address from, address to, uint256 tokenId, bytes memory data) internal {
        _transfer(from, to, tokenId);
        require(_checkOnERC721Received(from, to, tokenId, data), "Non ERC721Receiver");
    }

    function _transfer(address from, address to, uint256 tokenId) internal {
        require(ownerOf(tokenId) == from, "Incorrect owner");
        require(to != address(0), "Zero address");

        if (_listings[tokenId].active) {
            _clearListing(tokenId, true);
        }

        _approve(address(0), tokenId);

        _balances[from] -= 1;
        _balances[to] += 1;
        _owners[tokenId] = to;

        _removeTokenFromOwnerEnumeration(from, tokenId);
        _addTokenToOwnerEnumeration(to, tokenId);

        emit Transfer(from, to, tokenId);
    }

    function _safeMint(address to, uint256 tokenId) internal {
        _mint(to, tokenId);

        require(_checkOnERC721Received(address(0), to, tokenId, ""), "Non ERC721Receiver");
    }

    function _mint(address to, uint256 tokenId) internal {
        require(to != address(0), "Zero address");
        require(!_exists(tokenId), "Token exists");

        _balances[to] += 1;
        _owners[tokenId] = to;

        _addTokenToOwnerEnumeration(to, tokenId);

        emit Transfer(address(0), to, tokenId);
    }

    function _approve(address to, uint256 tokenId) internal {
        _tokenApprovals[tokenId] = to;
        emit Approval(ownerOf(tokenId), to, tokenId);
    }

    function _addListedToken(uint256 tokenId) internal {
        _listedIndex[tokenId] = _listedTokenIds.length;
        _listedTokenIds.push(tokenId);
    }

    function _removeListedToken(uint256 tokenId) internal {
        uint256 length = _listedTokenIds.length;
        if (length == 0) {
            return;
        }

        uint256 index = _listedIndex[tokenId];
        uint256 lastTokenId = _listedTokenIds[length - 1];

        _listedTokenIds[index] = lastTokenId;
        _listedIndex[lastTokenId] = index;

        _listedTokenIds.pop();
        delete _listedIndex[tokenId];
    }

    function _clearListing(uint256 tokenId, bool emitCancelEvent) internal {
        Listing storage listing = _listings[tokenId];
        if (!listing.active) {
            return;
        }

        listing.active = false;
        listing.price = 0;
        listing.seller = address(0);
        _removeListedToken(tokenId);

        if (emitCancelEvent) {
            emit ListingCanceled(tokenId);
        }
    }

    function _addTokenToOwnerEnumeration(address to, uint256 tokenId) internal {
        _ownedTokensIndex[tokenId] = _ownedTokens[to].length;
        _ownedTokens[to].push(tokenId);
    }

    function _removeTokenFromOwnerEnumeration(address from, uint256 tokenId) internal {
        uint256 lastIndex = _ownedTokens[from].length - 1;
        uint256 tokenIndex = _ownedTokensIndex[tokenId];

        if (tokenIndex != lastIndex) {
            uint256 lastTokenId = _ownedTokens[from][lastIndex];
            _ownedTokens[from][tokenIndex] = lastTokenId;
            _ownedTokensIndex[lastTokenId] = tokenIndex;
        }

        _ownedTokens[from].pop();
        delete _ownedTokensIndex[tokenId];
    }

    function _checkOnERC721Received(address from, address to, uint256 tokenId, bytes memory data) private returns (bool) {
        if (to.code.length == 0) {
            return true;
        }

        try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) returns (bytes4 result) {
            return result == IERC721Receiver.onERC721Received.selector;
        } catch (bytes memory reason) {
            if (reason.length == 0) {
                revert("Non ERC721Receiver");
            }
            assembly {
                revert(add(32, reason), mload(reason))
            }
        }
    }
}
