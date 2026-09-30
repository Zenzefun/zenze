// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IERC20Lock {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// Locks canonical $ZNZF. weight(account) is the locked balance. No reward is paid here.
contract ZenzeStake {
    IERC20Lock public immutable znzf;
    mapping(address => uint256) public staked;
    uint256 public totalStaked;

    error Zero();
    error Transfer();

    event Staked(address indexed account, uint256 amount, uint256 balance);
    event Unstaked(address indexed account, uint256 amount, uint256 balance);

    constructor(address znzf_) {
        if (znzf_ == address(0)) revert Zero();
        znzf = IERC20Lock(znzf_);
    }

    function stake(uint256 amount) external {
        if (amount == 0) revert Zero();
        if (!znzf.transferFrom(msg.sender, address(this), amount)) revert Transfer();
        staked[msg.sender] += amount;
        totalStaked += amount;
        emit Staked(msg.sender, amount, staked[msg.sender]);
    }

    function unstake(uint256 amount) external {
        if (amount == 0 || amount > staked[msg.sender]) revert Zero();
        staked[msg.sender] -= amount;
        totalStaked -= amount;
        if (!znzf.transfer(msg.sender, amount)) revert Transfer();
        emit Unstaked(msg.sender, amount, staked[msg.sender]);
    }

    function weight(address account) external view returns (uint256) {
        return staked[account];
    }
}
