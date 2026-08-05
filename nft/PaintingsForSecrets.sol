// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @title PaintingsForSecrets
/// @notice The oldest economy, on-chain. Each token is a painting that holds a
///         secret. The artwork is a fully on-chain SVG assembled from the
///         painter's strokes — no IPFS, no platform, nothing to extract.
///         mint(): mint the current canvas as a 1-of-1 (fee to treasury).
///         giftMint(): mint sealed for a recipient; only they can claim() it.
///         The secret is sealed in the metadata until the first transfer
///         (or reveal()) — the secret travels with the painting.
///         EIP-2981 royalties (5%) flow to the treasury, feeding the mesh.
contract PaintingsForSecrets is ERC721, Ownable, IERC2981 {
    using Strings for uint256;

    uint256 public mintFee = 0.001 ether;
    uint256 public royaltyBps = 500; // 5%
    address public treasury;

    uint256 public nextTokenId = 1;

    struct Painting {
        string svgBody;    // SVG inner elements — the on-chain artwork
        string strokes;    // raw stroke seed (JSON) — the truth
        string title;
        string secret;     // sealed until reveal
        bool revealed;
        bool gifted;       // locked at address(this) until claimed
        address sealedFor; // intended recipient of a gift
    }

    mapping(uint256 => Painting) public paintings;

    event PaintingMinted(uint256 indexed tokenId, address indexed minter, string title, string secret);
    event Revealed(uint256 indexed tokenId);
    event GiftClaimed(uint256 indexed tokenId, address indexed recipient);

    constructor(address initialTreasury) ERC721("PaintingsForSecrets", "PFS") Ownable(msg.sender) {
        require(initialTreasury != address(0), "PaintingsForSecrets: zero treasury");
        treasury = initialTreasury;
    }

    receive() external payable {}

    /// Mint the current painting. The secret is sealed until the token's first
    /// transfer (or until the owner calls reveal()).
    function mint(
        string calldata svgBody,
        string calldata strokes,
        string calldata title,
        string calldata secret
    ) external payable returns (uint256 tokenId) {
        _requireFee();
        tokenId = nextTokenId++;
        _create(tokenId, svgBody, strokes, title, secret, false, address(0));
        _safeMint(msg.sender, tokenId);
        emit PaintingMinted(tokenId, msg.sender, title, secret);
    }

    /// Mint a painting sealed for a specific recipient. The token is locked at
    /// the contract; only `recipient` can claim() it, which reveals the secret.
    function giftMint(
        string calldata svgBody,
        string calldata strokes,
        string calldata title,
        string calldata secret,
        address recipient
    ) external payable returns (uint256 tokenId) {
        require(recipient != address(0), "PaintingsForSecrets: zero recipient");
        _requireFee();
        tokenId = nextTokenId++;
        _create(tokenId, svgBody, strokes, title, secret, true, recipient);
        _safeMint(address(this), tokenId);
        emit PaintingMinted(tokenId, msg.sender, title, secret);
    }

    /// The intended recipient of a gift takes custody. Reveals the secret.
    function claim(uint256 tokenId) external {
        Painting storage p = paintings[tokenId];
        require(p.gifted, "PaintingsForSecrets: not a gift");
        require(p.sealedFor == msg.sender, "PaintingsForSecrets: not the intended recipient");
        require(_ownerOf(tokenId) == address(this), "PaintingsForSecrets: already claimed");
        p.gifted = false;
        _update(msg.sender, tokenId, address(this));
        emit GiftClaimed(tokenId, msg.sender);
    }

    /// The owner reveals the secret early, before any transfer.
    function reveal(uint256 tokenId) external {
        address from = _ownerOf(tokenId);
        require(from != address(0), "PaintingsForSecrets: nonexistent token");
        require(_isAuthorized(from, msg.sender, tokenId), "PaintingsForSecrets: unauthorized");
        require(!paintings[tokenId].revealed, "PaintingsForSecrets: already revealed");
        paintings[tokenId].revealed = true;
        emit Revealed(tokenId);
    }

    // -- views ---------------------------------------------------------------

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "ERC721Metadata: URI query for nonexistent token");
        return _buildURI(tokenId, paintings[tokenId]);
    }

    function strokesOf(uint256 tokenId) external view returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "PaintingsForSecrets: nonexistent token");
        return paintings[tokenId].strokes;
    }

    function secretOf(uint256 tokenId) external view returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "PaintingsForSecrets: nonexistent token");
        require(paintings[tokenId].revealed, "PaintingsForSecrets: secret sealed");
        return paintings[tokenId].secret;
    }

    function royaltyInfo(uint256, uint256 salePrice) external view override returns (address receiver, uint256 royaltyAmount) {
        return (treasury, (salePrice * royaltyBps) / 10000);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, IERC165) returns (bool) {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }

    // -- admin ---------------------------------------------------------------

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "PaintingsForSecrets: zero treasury");
        treasury = newTreasury;
    }

    function setMintFee(uint256 newFee) external onlyOwner {
        require(newFee <= 0.1 ether, "PaintingsForSecrets: fee too high");
        mintFee = newFee;
    }

    function withdraw() external onlyOwner {
        (bool ok, ) = treasury.call{ value: address(this).balance }("");
        require(ok, "PaintingsForSecrets: withdraw failed");
    }

    // -- internals -----------------------------------------------------------

    function _create(
        uint256 tokenId,
        string calldata svgBody,
        string calldata strokes,
        string calldata title,
        string calldata secret,
        bool gifted_,
        address sealedFor
    ) internal {
        paintings[tokenId] = Painting({
            svgBody: svgBody,
            strokes: strokes,
            title: title,
            secret: secret,
            revealed: false,
            gifted: gifted_,
            sealedFor: sealedFor
        });
    }

    function _requireFee() internal view {
        require(msg.value >= mintFee, "PaintingsForSecrets: mint fee required");
    }

    /// A transfer of an existing token reveals its secret.
    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && !paintings[tokenId].revealed) {
            paintings[tokenId].revealed = true;
            emit Revealed(tokenId);
        }
        return super._update(to, tokenId, auth);
    }

    function _buildURI(uint256 tokenId, Painting storage p) internal view returns (string memory) {
        string memory svg = _buildSVG(p.svgBody);
        string memory attrs = _buildAttributes(tokenId, p);
        string memory secretField = p.revealed
            ? string(abi.encodePacked('"secret":"', p.secret, '",'))
            : "";
        string memory json = string(abi.encodePacked(
            '{"name":"PaintingsForSecrets #', tokenId.toString(),
            unicode" — ", p.title,
            unicode'","description":"The oldest economy · art for truth. A painting that holds a secret. Fully on-chain — the artwork is an SVG assembled from the painter\'s strokes, rendered by the chain alone.","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '",', secretField, '"attributes":[', attrs, ']}'
        ));
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    function _buildSVG(string memory svgBody) internal pure returns (string memory) {
        return string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="500" viewBox="0 0 600 500">',
            '<rect width="600" height="500" fill="#0a0410"/>',
            svgBody,
            '</svg>'
        ));
    }

    function _buildAttributes(uint256 tokenId, Painting storage p) internal view returns (string memory) {
        string memory gift = p.gifted ? "locked" : "no";
        string memory revealed = p.revealed ? "yes" : "no";
        return string(abi.encodePacked(
            '{"trait_type":"Token","value":"#', tokenId.toString(), '"},',
            '{"trait_type":"Title","value":"', p.title, '"},',
            '{"trait_type":"Gift","value":"', gift, '"},',
            '{"trait_type":"Secret Revealed","value":"', revealed, '"}'
        ));
    }
}
