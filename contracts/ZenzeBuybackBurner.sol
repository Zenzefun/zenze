// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IZnzf {
    function balanceOf(address account) external view returns (uint256);
    function burn(uint256 value) external;
}

interface IZenzeCurve {
    function buyFor(uint256 amount, uint256 minTokensOut) external payable;
    function token() external view returns (address);
    function quote() external view returns (address);
    function graduated() external view returns (bool);
}

/// Buys $ZNZF from the live Robinhood bonding curve and burns it in the same transaction.
/// Only the treasury owner can spend ETH. There is no off-chain "mark sent".
contract ZenzeBuybackBurner {
    address public owner;
    IZenzeCurve public immutable curve;
    IZnzf public immutable znzf;
    uint256 public totalBurned;
    uint256 private locked;

    error NotOwner();
    error Zero();
    error Graduated();
    error Quote();
    error Buy();
    error Reentrancy();
    error Eth();

    event OwnerSet(address indexed owner);
    event Buyback(address indexed caller, uint256 ethIn, uint256 burned);

    constructor(address curve_, address owner_) {
        if (curve_ == address(0) || owner_ == address(0)) revert Zero();
        curve = IZenzeCurve(curve_);
        if (curve.quote() != address(0)) revert Quote();
        znzf = IZnzf(curve.token());
        owner = owner_;
        emit OwnerSet(owner_);
    }

    receive() external payable {}

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier lock() {
        if (locked != 0) revert Reentrancy();
        locked = 1;
        _;
        locked = 0;
    }

    function setOwner(address next) external onlyOwner {
        if (next == address(0)) revert Zero();
        owner = next;
        emit OwnerSet(next);
    }

    /// Spend msg.value on the curve, then burn every $ZNZF this contract received.
    function buyback(uint256 minTokensOut) external payable onlyOwner lock {
        _buy(msg.value, minTokensOut);
    }

    /// Spend ETH already sitting on this contract (for example a vault sweep).
    function buybackHeld(uint256 minTokensOut) external onlyOwner lock {
        _buy(address(this).balance, minTokensOut);
    }

    function _buy(uint256 value, uint256 minTokensOut) private {
        if (value == 0) revert Zero();
        if (curve.graduated()) revert Graduated();
        uint256 beforeBal = znzf.balanceOf(address(this));
        curve.buyFor{value: value}(value, minTokensOut);
        uint256 got = znzf.balanceOf(address(this)) - beforeBal;
        if (got == 0) revert Buy();
        znzf.burn(got);
        totalBurned += got;
        emit Buyback(msg.sender, value, got);
    }

    function sweepEth(address to, uint256 amount) external onlyOwner {
        if (to == address(0) || amount == 0) revert Zero();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert Eth();
    }
}
