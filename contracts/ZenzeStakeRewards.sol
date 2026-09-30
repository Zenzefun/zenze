// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IERC20Lock {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// Locks canonical $ZNZF and streams a $ZNZF reward funded by the owner.
/// weight(account) is the locked balance. claim() transfers the earned reward.
contract ZenzeStakeRewards {
    IERC20Lock public immutable znzf;
    address public owner;
    mapping(address => uint256) public staked;
    uint256 public totalStaked;
    uint256 public rewardRate;
    uint256 public lastUpdate;
    uint256 public periodFinish;
    uint256 public rewardPerTokenStored;
    mapping(address => uint256) public userPaid;
    mapping(address => uint256) public rewards;
    uint256 public constant DURATION = 30 days;

    error NotOwner();
    error Zero();
    error Transfer();

    event OwnerSet(address indexed owner);
    event Staked(address indexed account, uint256 amount, uint256 balance);
    event Unstaked(address indexed account, uint256 amount, uint256 balance);
    event Claimed(address indexed account, uint256 amount);
    event Funded(uint256 amount, uint256 finish);

    constructor(address znzf_, address owner_) {
        if (znzf_ == address(0) || owner_ == address(0)) revert Zero();
        znzf = IERC20Lock(znzf_);
        owner = owner_;
        emit OwnerSet(owner_);
    }

    function setOwner(address next) external {
        if (msg.sender != owner) revert NotOwner();
        if (next == address(0)) revert Zero();
        owner = next;
        emit OwnerSet(next);
    }

    function weight(address account) external view returns (uint256) {
        return staked[account];
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) return rewardPerTokenStored;
        uint256 end = block.timestamp < periodFinish ? block.timestamp : periodFinish;
        if (end <= lastUpdate) return rewardPerTokenStored;
        return rewardPerTokenStored + ((end - lastUpdate) * rewardRate * 1e18) / totalStaked;
    }

    function earned(address account) public view returns (uint256) {
        return (staked[account] * (rewardPerToken() - userPaid[account])) / 1e18 + rewards[account];
    }

    function stake(uint256 amount) external {
        if (amount == 0) revert Zero();
        _update(msg.sender);
        if (!IERC20Lock(address(znzf)).transferFrom(msg.sender, address(this), amount)) revert Transfer();
        staked[msg.sender] += amount;
        totalStaked += amount;
        emit Staked(msg.sender, amount, staked[msg.sender]);
    }

    function unstake(uint256 amount) external {
        if (amount == 0 || amount > staked[msg.sender]) revert Zero();
        _update(msg.sender);
        staked[msg.sender] -= amount;
        totalStaked -= amount;
        if (!znzf.transfer(msg.sender, amount)) revert Transfer();
        emit Unstaked(msg.sender, amount, staked[msg.sender]);
    }

    function claim() external {
        _update(msg.sender);
        uint256 pay = rewards[msg.sender];
        if (pay == 0) revert Zero();
        rewards[msg.sender] = 0;
        if (!znzf.transfer(msg.sender, pay)) revert Transfer();
        emit Claimed(msg.sender, pay);
    }

    /// Owner funds the next 30 days. Undistributed time is rolled in, not dropped.
    function fund(uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        if (amount == 0) revert Zero();
        _update(address(0));
        if (!IERC20Lock(address(znzf)).transferFrom(msg.sender, address(this), amount)) revert Transfer();
        uint256 remaining = periodFinish > block.timestamp ? (periodFinish - block.timestamp) * rewardRate : 0;
        rewardRate = (remaining + amount) / DURATION;
        lastUpdate = block.timestamp;
        periodFinish = block.timestamp + DURATION;
        emit Funded(amount, periodFinish);
    }

    function _update(address account) private {
        rewardPerTokenStored = rewardPerToken();
        uint256 end = block.timestamp < periodFinish ? block.timestamp : periodFinish;
        if (end > lastUpdate) lastUpdate = end;
        if (account != address(0)) {
            rewards[account] = earned(account);
            userPaid[account] = rewardPerTokenStored;
        }
    }
}
