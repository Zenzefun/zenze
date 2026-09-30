// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IERC20Drop {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// Holds the published $ZNZF drop.
/// The owner signs a wallet's total. claim pays only the unpaid difference.
contract ZenzeDrop {
    IERC20Drop public immutable znzf;
    address public owner;
    bool public paused;
    mapping(address => uint256) public claimed;
    uint256 public totalClaimed;

    error NotOwner();
    error Paused();
    error Expired();
    error Sig();
    error Nothing();
    error Transfer();

    event OwnerSet(address indexed owner);
    event PausedSet(bool paused);
    event Claimed(address indexed account, uint256 paid, uint256 total);
    event Swept(address indexed to, uint256 amount);

    constructor(address znzf_, address owner_) {
        if (znzf_ == address(0) || owner_ == address(0)) revert Nothing();
        znzf = IERC20Drop(znzf_);
        owner = owner_;
        emit OwnerSet(owner_);
    }

    function setOwner(address next) external {
        if (msg.sender != owner) revert NotOwner();
        if (next == address(0)) revert Nothing();
        owner = next;
        emit OwnerSet(next);
    }

    function setPaused(bool next) external {
        if (msg.sender != owner) revert NotOwner();
        paused = next;
        emit PausedSet(next);
    }

    function claim(uint256 total, uint256 deadline, bytes calldata signature) external {
        if (paused) revert Paused();
        if (block.timestamp > deadline) revert Expired();
        bytes32 inner = keccak256(abi.encodePacked(block.chainid, address(this), msg.sender, total, deadline));
        bytes32 hash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", inner));
        if (_recover(hash, signature) != owner) revert Sig();
        uint256 already = claimed[msg.sender];
        if (total <= already) revert Nothing();
        uint256 pay = total - already;
        claimed[msg.sender] = total;
        totalClaimed += pay;
        if (!znzf.transfer(msg.sender, pay)) revert Transfer();
        emit Claimed(msg.sender, pay, total);
    }

    function sweep(address to, uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        if (to == address(0) || amount == 0) revert Nothing();
        if (!znzf.transfer(to, amount)) revert Transfer();
        emit Swept(to, amount);
    }

    function _recover(bytes32 hash, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        return ecrecover(hash, v, r, s);
    }
}
