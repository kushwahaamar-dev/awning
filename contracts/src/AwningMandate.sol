// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @title AwningMandate
/// @notice Onchain spending mandate for an AI agent key. Each owner deposits USDC, sets a policy
/// and names one agent. The agent can only move the owner's funds in two ways, both bounded by the
/// policy: a daily float to its own address (for data purchases) and premiums to allowlisted
/// hedge venues. Violations by the agent key do not revert; they emit `Blocked` and return false.
contract AwningMandate is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Policy {
        address agent;
        uint64 expiresAt;
        bool paused;
        uint96 floatDailyCap;
        uint96 premiumPerHedgeCap;
        uint96 premiumPeriodCap;
        uint96 approvalThreshold;
    }

    enum HedgeStatus {
        None,
        Open,
        Paid,
        Expired,
        Refunded
    }

    struct Hedge {
        address owner;
        address venue;
        uint96 premium;
        uint96 maxPayout;
        uint64 openedAt;
        HedgeStatus status;
        bytes32 marketRef;
    }

    enum Action {
        DrawFloat,
        OpenHedge
    }

    enum BlockReason {
        Paused,
        Expired,
        VenueNotAllowed,
        OverPerHedgeCap,
        OverPeriodCap,
        OverDailyFloat,
        ApprovalRequired,
        ApprovalExpired,
        InsufficientBalance
    }

    struct HedgeRequest {
        bytes32 hedgeId;
        address venue;
        uint256 premium;
        uint256 maxPayout;
        bytes32 marketRef;
        uint256 deadline;
    }

    bytes32 public constant HEDGE_APPROVAL_TYPEHASH = keccak256(
        "HedgeApproval(bytes32 hedgeId,address venue,uint256 premium,uint256 maxPayout,bytes32 marketRef,uint256 deadline)"
    );

    // forge-lint: disable-next-line(screaming-snake-case-immutable)
    IERC20 public immutable usdc;

    mapping(address owner => Policy) public policies;
    mapping(address owner => uint256) public balanceOf;
    mapping(address owner => mapping(address venue => bool)) public venueAllowed;
    mapping(address owner => mapping(uint256 day => uint256)) public floatDrawn;
    mapping(address owner => mapping(uint256 period => uint256)) public premiumSpent;
    /// Keyed by `hedgeKey(owner, hedgeId)`: ids belong to an owner, so nobody else can use one up.
    mapping(bytes32 key => Hedge) public hedges;

    event Deposited(address indexed owner, uint256 amount);
    event Withdrawn(address indexed owner, uint256 amount);
    event PolicySet(
        address indexed owner,
        address indexed agent,
        uint64 expiresAt,
        uint96 floatDailyCap,
        uint96 premiumPerHedgeCap,
        uint96 premiumPeriodCap,
        uint96 approvalThreshold
    );
    event VenueSet(address indexed owner, address indexed venue, bool allowed);
    event PausedSet(address indexed owner, bool paused);
    event FloatDrawn(
        address indexed owner,
        address indexed agent,
        uint256 amount,
        bytes32 purpose,
        uint256 drawnToday
    );
    event HedgeOpened(
        bytes32 indexed hedgeId,
        address indexed owner,
        address indexed venue,
        uint256 premium,
        uint256 maxPayout,
        bytes32 marketRef,
        bool ownerApproved
    );
    event HedgeClosed(
        bytes32 indexed hedgeId,
        address indexed owner,
        HedgeStatus outcome,
        uint256 payout,
        bytes32 evidence
    );
    event Blocked(
        address indexed owner,
        address indexed agent,
        Action action,
        BlockReason reason,
        uint256 amount,
        address counterparty,
        bytes32 ref
    );

    error NotAgent();
    error NotVenue();
    error ZeroAddress();
    error ZeroAmount();
    error AmountTooLarge();
    error HedgeExists();
    error HedgeNotOpen();
    error InvalidPayout();
    error InvalidOutcome();
    error WithdrawExceedsBalance();

    constructor(IERC20 usdc_) EIP712("AwningMandate", "1") {
        if (address(usdc_) == address(0)) revert ZeroAddress();
        usdc = usdc_;
    }

    modifier onlyAgentOf(address owner) {
        _checkAgent(owner);
        _;
    }

    /// @notice Add USDC to your vault. Needs a prior ERC-20 approval to this contract.
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        balanceOf[msg.sender] += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    /// @notice Take USDC out of your vault. Always available, even while paused or expired.
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > balanceOf[msg.sender]) revert WithdrawExceedsBalance();
        balanceOf[msg.sender] -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Set who your agent is and what it may do. Keeps the current paused flag.
    /// An `expiresAt` in the past (or zero) leaves the agent unable to act. Lowering a cap
    /// applies immediately to amounts already used in the current day or period.
    function setPolicy(
        address agent,
        uint64 expiresAt,
        uint96 floatDailyCap,
        uint96 premiumPerHedgeCap,
        uint96 premiumPeriodCap,
        uint96 approvalThreshold
    ) external {
        Policy storage p = policies[msg.sender];
        p.agent = agent;
        p.expiresAt = expiresAt;
        p.floatDailyCap = floatDailyCap;
        p.premiumPerHedgeCap = premiumPerHedgeCap;
        p.premiumPeriodCap = premiumPeriodCap;
        p.approvalThreshold = approvalThreshold;
        emit PolicySet(
            msg.sender,
            agent,
            expiresAt,
            floatDailyCap,
            premiumPerHedgeCap,
            premiumPeriodCap,
            approvalThreshold
        );
    }

    /// @notice Allow or disallow a venue to receive hedge premiums from your vault.
    function setVenue(address venue, bool allowed) external {
        if (venue == address(0)) revert ZeroAddress();
        venueAllowed[msg.sender][venue] = allowed;
        emit VenueSet(msg.sender, venue, allowed);
    }

    /// @notice Kill switch. While paused the agent can do nothing; you can still withdraw.
    function setPaused(bool paused) external {
        policies[msg.sender].paused = paused;
        emit PausedSet(msg.sender, paused);
    }

    /// @notice Agent only. Move USDC from the owner's vault to the agent's own address, for
    /// per-request data purchases. Returns false and emits `Blocked` if the policy forbids it.
    function drawFloat(address owner, uint256 amount, bytes32 purpose)
        external
        onlyAgentOf(owner)
        nonReentrant
        returns (bool ok)
    {
        if (amount == 0) revert ZeroAmount();
        Policy storage p = policies[owner];

        BlockReason reason;
        uint256 day = block.timestamp / 1 days;
        uint256 drawn = floatDrawn[owner][day];
        if (p.paused) {
            reason = BlockReason.Paused;
        } else if (_expired(p)) {
            reason = BlockReason.Expired;
        } else if (amount > _remaining(p.floatDailyCap, drawn)) {
            reason = BlockReason.OverDailyFloat;
        } else if (amount > balanceOf[owner]) {
            reason = BlockReason.InsufficientBalance;
        } else {
            drawn += amount;
            floatDrawn[owner][day] = drawn;
            balanceOf[owner] -= amount;
            usdc.safeTransfer(msg.sender, amount);
            emit FloatDrawn(owner, msg.sender, amount, purpose, drawn);
            return true;
        }
        _emitBlocked(owner, Action.DrawFloat, reason, amount, msg.sender, purpose);
        return false;
    }

    /// @notice Agent only. Pay a hedge premium from the owner's vault to an allowlisted venue
    /// and record the hedge. Premiums above the owner's approval threshold need an EIP-712
    /// `HedgeApproval` signature from the owner (EOA or ERC-1271). Returns false and emits
    /// `Blocked` on a policy violation; malformed input reverts.
    function openHedge(
        address owner,
        bytes32 hedgeId,
        address venue,
        uint256 premium,
        uint256 maxPayout,
        bytes32 marketRef,
        uint256 deadline,
        bytes calldata ownerSignature
    ) external onlyAgentOf(owner) nonReentrant returns (bool ok) {
        if (premium == 0) revert ZeroAmount();
        if (maxPayout < premium) revert InvalidPayout();
        if (maxPayout > type(uint96).max) revert AmountTooLarge();
        if (hedges[hedgeKey(owner, hedgeId)].status != HedgeStatus.None) revert HedgeExists();

        HedgeRequest memory r = HedgeRequest({
            hedgeId: hedgeId,
            venue: venue,
            premium: premium,
            maxPayout: maxPayout,
            marketRef: marketRef,
            deadline: deadline
        });
        (bool allowed, BlockReason reason) = _checkHedge(owner, r, ownerSignature);
        if (!allowed) {
            _emitBlocked(owner, Action.OpenHedge, reason, r.premium, r.venue, r.hedgeId);
            return false;
        }
        _recordHedge(owner, r);
        return true;
    }

    /// @notice Where an owner's hedge is stored in `hedges`.
    function hedgeKey(address owner, bytes32 hedgeId) public pure returns (bytes32) {
        return keccak256(abi.encode(owner, hedgeId));
    }

    /// @notice Venue only. Settle an open hedge and return funds to the owner's vault. `Paid`
    /// pays 1..maxPayout plus whatever premium went unspent, so at most maxPayout + premium;
    /// `Expired` pays nothing; `Refunded` returns 1..premium. The venue must have approved
    /// this contract for `payout`. `evidence` is only emitted.
    /// @dev Nothing onchain checks the venue's claim of an outcome; see the README trust notes.
    function closeHedge(
        address owner,
        bytes32 hedgeId,
        HedgeStatus outcome,
        uint256 payout,
        bytes32 evidence
    ) external nonReentrant {
        Hedge storage h = hedges[hedgeKey(owner, hedgeId)];
        if (h.venue == address(0) || msg.sender != h.venue) revert NotVenue();
        if (h.status != HedgeStatus.Open) revert HedgeNotOpen();

        if (outcome == HedgeStatus.Paid) {
            // a basket whose winning leg filled while others didn't returns winnings and the unspent premium
            if (payout == 0 || payout > uint256(h.maxPayout) + h.premium) revert InvalidPayout();
        } else if (outcome == HedgeStatus.Expired) {
            if (payout != 0) revert InvalidPayout();
        } else if (outcome == HedgeStatus.Refunded) {
            if (payout == 0 || payout > h.premium) revert InvalidPayout();
        } else {
            revert InvalidOutcome();
        }

        h.status = outcome;
        balanceOf[owner] += payout;
        if (payout != 0) usdc.safeTransferFrom(msg.sender, address(this), payout);
        emit HedgeClosed(hedgeId, owner, outcome, payout, evidence);
    }

    /// @notice What the agent could still do right now, as the contract itself would enforce it.
    /// @return floatRemainingToday Most the agent could draw to itself today (0 if paused/expired).
    /// @return premiumRemainingThisPeriod Premium room left in the 30-day period (0 if paused/expired).
    /// @return unapprovedPremiumCap Largest single premium that needs no owner signature.
    function limits(address owner)
        external
        view
        returns (
            uint256 floatRemainingToday,
            uint256 premiumRemainingThisPeriod,
            uint256 unapprovedPremiumCap
        )
    {
        Policy storage p = policies[owner];
        unapprovedPremiumCap =
            p.premiumPerHedgeCap < p.approvalThreshold ? p.premiumPerHedgeCap : p.approvalThreshold;
        if (p.paused || _expired(p)) return (0, 0, unapprovedPremiumCap);

        uint256 bal = balanceOf[owner];
        floatRemainingToday =
            _min(_remaining(p.floatDailyCap, floatDrawn[owner][block.timestamp / 1 days]), bal);
        premiumRemainingThisPeriod = _min(
            _remaining(p.premiumPeriodCap, premiumSpent[owner][block.timestamp / 30 days]), bal
        );
    }

    /// @notice EIP-712 digest an owner signs to approve a specific hedge.
    function hashHedgeApproval(
        bytes32 hedgeId,
        address venue,
        uint256 premium,
        uint256 maxPayout,
        bytes32 marketRef,
        uint256 deadline
    ) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    HEDGE_APPROVAL_TYPEHASH, hedgeId, venue, premium, maxPayout, marketRef, deadline
                )
            )
        );
    }

    function _checkHedge(address owner, HedgeRequest memory r, bytes calldata sig)
        private
        view
        returns (bool allowed, BlockReason reason)
    {
        Policy storage p = policies[owner];
        if (p.paused) return (false, BlockReason.Paused);
        if (_expired(p)) return (false, BlockReason.Expired);
        if (!venueAllowed[owner][r.venue]) return (false, BlockReason.VenueNotAllowed);
        if (r.premium > p.premiumPerHedgeCap) return (false, BlockReason.OverPerHedgeCap);
        uint256 spent = premiumSpent[owner][block.timestamp / 30 days];
        if (r.premium > _remaining(p.premiumPeriodCap, spent)) {
            return (false, BlockReason.OverPeriodCap);
        }
        if (r.premium > p.approvalThreshold) {
            bytes32 digest = hashHedgeApproval(
                r.hedgeId, r.venue, r.premium, r.maxPayout, r.marketRef, r.deadline
            );
            if (!SignatureChecker.isValidSignatureNow(owner, digest, sig)) {
                return (false, BlockReason.ApprovalRequired);
            }
            if (block.timestamp > r.deadline) return (false, BlockReason.ApprovalExpired);
        }
        if (r.premium > balanceOf[owner]) return (false, BlockReason.InsufficientBalance);
        return (true, reason);
    }

    /// @dev Caller has checked premium <= premiumPerHedgeCap and maxPayout <= uint96 max.
    function _recordHedge(address owner, HedgeRequest memory r) private {
        premiumSpent[owner][block.timestamp / 30 days] += r.premium;
        balanceOf[owner] -= r.premium;
        hedges[hedgeKey(owner, r.hedgeId)] = Hedge({
            owner: owner,
            venue: r.venue,
            // forge-lint: disable-next-line(unsafe-typecast)
            premium: uint96(r.premium),
            // forge-lint: disable-next-line(unsafe-typecast)
            maxPayout: uint96(r.maxPayout),
            // forge-lint: disable-next-line(unsafe-typecast)
            openedAt: uint64(block.timestamp),
            status: HedgeStatus.Open,
            marketRef: r.marketRef
        });
        usdc.safeTransfer(r.venue, r.premium);
        emit HedgeOpened(
            r.hedgeId,
            owner,
            r.venue,
            r.premium,
            r.maxPayout,
            r.marketRef,
            r.premium > policies[owner].approvalThreshold
        );
    }

    function _checkAgent(address owner) private view {
        address agent = policies[owner].agent;
        if (agent == address(0) || msg.sender != agent) revert NotAgent();
    }

    function _emitBlocked(
        address owner,
        Action action,
        BlockReason reason,
        uint256 amount,
        address counterparty,
        bytes32 ref
    ) private {
        emit Blocked(owner, msg.sender, action, reason, amount, counterparty, ref);
    }

    function _expired(Policy storage p) private view returns (bool) {
        return block.timestamp > p.expiresAt;
    }

    function _remaining(uint256 cap, uint256 used) private pure returns (uint256) {
        return used >= cap ? 0 : cap - used;
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}
