// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {AwningMandate} from "../src/AwningMandate.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// Minimal ERC-1271 account: valid iff the signature is from `signer` over the hash.
contract MockSmartAccount {
    address public immutable SIGNER;
    bool public rejectAll;

    constructor(address signer_) {
        SIGNER = signer_;
    }

    function setRejectAll(bool v) external {
        rejectAll = v;
    }

    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4) {
        if (rejectAll) return 0xffffffff;
        (address rec, ECDSA.RecoverError err,) = ECDSA.tryRecover(hash, sig);
        return err == ECDSA.RecoverError.NoError && rec == SIGNER
            ? bytes4(0x1626ba7e)
            : bytes4(0xffffffff);
    }
}

contract AwningMandateTest is Test {
    uint256 constant T0 = 680 * 30 days; // start of both a UTC day and a 30-day period
    uint256 constant DEPOSIT = 1_000e6;
    uint64 constant TTL = 90 days;
    uint96 constant FLOAT_CAP = 50e6;
    uint96 constant PER_HEDGE = 100e6;
    uint96 constant PERIOD_CAP = 300e6;
    uint96 constant THRESHOLD = 25e6;

    MockUSDC usdc;
    AwningMandate mandate;

    uint256 ownerKey;
    address owner;
    address agent = makeAddr("agent");
    address venue = makeAddr("venue");
    address attacker = makeAddr("attacker");

    bytes32 constant H1 = keccak256("hedge-1");
    bytes32 constant H2 = keccak256("hedge-2");
    bytes32 constant MARKET = keccak256("market");
    bytes32 constant PURPOSE = keccak256("x402:weather-feed");

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
        AwningMandate.HedgeStatus outcome,
        uint256 payout,
        bytes32 evidence
    );
    event Blocked(
        address indexed owner,
        address indexed agent,
        AwningMandate.Action action,
        AwningMandate.BlockReason reason,
        uint256 amount,
        address counterparty,
        bytes32 ref
    );

    function setUp() public {
        vm.warp(T0);
        usdc = new MockUSDC();
        mandate = new AwningMandate(usdc);
        (owner, ownerKey) = makeAddrAndKey("owner");
        _fund(owner, DEPOSIT);
        _configure(owner);
    }

    function _fund(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.startPrank(who);
        usdc.approve(address(mandate), type(uint256).max);
        mandate.deposit(amount);
        vm.stopPrank();
    }

    function _configure(address who) internal {
        vm.startPrank(who);
        mandate.setPolicy(
            agent, uint64(block.timestamp + TTL), FLOAT_CAP, PER_HEDGE, PERIOD_CAP, THRESHOLD
        );
        mandate.setVenue(venue, true);
        vm.stopPrank();
    }

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _approval(bytes32 id, uint256 premium, uint256 maxPayout, uint256 deadline)
        internal
        view
        returns (bytes32)
    {
        return mandate.hashHedgeApproval(id, venue, premium, maxPayout, MARKET, deadline);
    }

    function _open(bytes32 id, uint256 premium) internal returns (bool) {
        vm.prank(agent);
        return mandate.openHedge(owner, id, venue, premium, premium * 4, MARKET, 0, "");
    }

    function _openSigned(address who, uint256 key, bytes32 id, uint256 premium)
        internal
        returns (bool)
    {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(key, _approval(id, premium, premium * 4, deadline));
        vm.prank(agent);
        return mandate.openHedge(who, id, venue, premium, premium * 4, MARKET, deadline, sig);
    }

    function _expectBlocked(
        AwningMandate.Action action,
        AwningMandate.BlockReason reason,
        uint256 amount,
        address counterparty,
        bytes32 ref
    ) internal {
        vm.expectEmit(true, true, false, true, address(mandate));
        emit Blocked(owner, agent, action, reason, amount, counterparty, ref);
    }

    function _status(bytes32 id) internal view returns (AwningMandate.HedgeStatus st) {
        (,,,,, st,) = mandate.hedges(mandate.hedgeKey(owner, id));
    }

    function _assertNothingMoved(uint256 balBefore, uint256 usdcBefore) internal view {
        assertEq(mandate.balanceOf(owner), balBefore, "vault balance changed");
        assertEq(usdc.balanceOf(address(mandate)), usdcBefore, "contract usdc changed");
    }

    // ---------------------------------------------------------------- owner functions

    function test_deposit_creditsVaultAndPullsUsdc() public {
        usdc.mint(owner, 5e6);
        vm.expectEmit(true, false, false, true, address(mandate));
        emit Deposited(owner, 5e6);
        vm.prank(owner);
        mandate.deposit(5e6);
        assertEq(mandate.balanceOf(owner), DEPOSIT + 5e6);
        assertEq(usdc.balanceOf(address(mandate)), DEPOSIT + 5e6);
        assertEq(usdc.balanceOf(owner), 0);
    }

    function test_deposit_revertsOnZeroAndMissingAllowance() public {
        vm.prank(owner);
        vm.expectRevert(AwningMandate.ZeroAmount.selector);
        mandate.deposit(0);

        usdc.mint(attacker, 1e6);
        vm.prank(attacker); // never approved the mandate
        vm.expectRevert();
        mandate.deposit(1e6);
        assertEq(mandate.balanceOf(attacker), 0);
    }

    function test_withdraw_returnsUsdc() public {
        vm.expectEmit(true, false, false, true, address(mandate));
        emit Withdrawn(owner, 400e6);
        vm.prank(owner);
        mandate.withdraw(400e6);
        assertEq(usdc.balanceOf(owner), 400e6);
        assertEq(mandate.balanceOf(owner), DEPOSIT - 400e6);
    }

    function test_withdraw_revertsOnZeroOrOverBalance() public {
        vm.startPrank(owner);
        vm.expectRevert(AwningMandate.ZeroAmount.selector);
        mandate.withdraw(0);
        vm.expectRevert(AwningMandate.WithdrawExceedsBalance.selector);
        mandate.withdraw(DEPOSIT + 1);
        vm.stopPrank();
    }

    function test_withdraw_worksWhilePausedAndAfterExpiry() public {
        vm.prank(owner);
        mandate.setPaused(true);
        vm.warp(block.timestamp + TTL + 1);
        vm.prank(owner);
        mandate.withdraw(DEPOSIT);
        assertEq(usdc.balanceOf(owner), DEPOSIT);
    }

    function test_withdraw_cannotTouchAnotherOwnersBalance() public {
        vm.prank(attacker);
        vm.expectRevert(AwningMandate.WithdrawExceedsBalance.selector);
        mandate.withdraw(1);
    }

    function test_setPolicy_storesFieldsAndPreservesPaused() public {
        vm.prank(owner);
        mandate.setPaused(true);

        address newAgent = makeAddr("newAgent");
        vm.expectEmit(true, true, false, true, address(mandate));
        emit PolicySet(owner, newAgent, 123, 1, 2, 3, 4);
        vm.prank(owner);
        mandate.setPolicy(newAgent, 123, 1, 2, 3, 4);

        (address a, uint64 exp, bool paused, uint96 f, uint96 ph, uint96 pp, uint96 th) =
            mandate.policies(owner);
        assertEq(a, newAgent);
        assertEq(exp, 123);
        assertTrue(paused, "paused flag was reset by setPolicy");
        assertEq(f, 1);
        assertEq(ph, 2);
        assertEq(pp, 3);
        assertEq(th, 4);
    }

    function test_setPolicy_isPerOwner() public {
        vm.prank(attacker);
        mandate.setPolicy(attacker, uint64(block.timestamp + 1 days), 1, 1, 1, 1);
        (address a,,,,,,) = mandate.policies(owner);
        assertEq(a, agent);
    }

    function test_setVenue_togglesAndRejectsZero() public {
        address v2 = makeAddr("v2");
        vm.expectEmit(true, true, false, true, address(mandate));
        emit VenueSet(owner, v2, true);
        vm.prank(owner);
        mandate.setVenue(v2, true);
        assertTrue(mandate.venueAllowed(owner, v2));
        assertFalse(mandate.venueAllowed(attacker, v2), "allowlist leaked across owners");

        vm.prank(owner);
        mandate.setVenue(v2, false);
        assertFalse(mandate.venueAllowed(owner, v2));

        vm.prank(owner);
        vm.expectRevert(AwningMandate.ZeroAddress.selector);
        mandate.setVenue(address(0), true);
    }

    function test_setPaused_emitsAndToggles() public {
        vm.expectEmit(true, false, false, true, address(mandate));
        emit PausedSet(owner, true);
        vm.prank(owner);
        mandate.setPaused(true);
        (,, bool paused,,,,) = mandate.policies(owner);
        assertTrue(paused);
        vm.prank(owner);
        mandate.setPaused(false);
        (,, paused,,,,) = mandate.policies(owner);
        assertFalse(paused);
    }

    function test_constructor_rejectsZeroToken() public {
        vm.expectRevert(AwningMandate.ZeroAddress.selector);
        new AwningMandate(MockUSDC(address(0)));
    }

    // ---------------------------------------------------------------- drawFloat

    function test_drawFloat_movesUsdcToAgentAndEmits() public {
        vm.expectEmit(true, true, false, true, address(mandate));
        emit FloatDrawn(owner, agent, 20e6, PURPOSE, 20e6);
        vm.prank(agent);
        assertTrue(mandate.drawFloat(owner, 20e6, PURPOSE));

        vm.expectEmit(true, true, false, true, address(mandate));
        emit FloatDrawn(owner, agent, 30e6, PURPOSE, 50e6);
        vm.prank(agent);
        assertTrue(mandate.drawFloat(owner, 30e6, PURPOSE));

        assertEq(usdc.balanceOf(agent), 50e6);
        assertEq(mandate.balanceOf(owner), DEPOSIT - 50e6);
        assertEq(mandate.floatDrawn(owner, block.timestamp / 1 days), 50e6);
    }

    function test_drawFloat_revertsForStrangerOwnerAndUnsetAgent() public {
        vm.prank(attacker);
        vm.expectRevert(AwningMandate.NotAgent.selector);
        mandate.drawFloat(owner, 1e6, PURPOSE);

        vm.prank(owner); // the owner is not the agent either
        vm.expectRevert(AwningMandate.NotAgent.selector);
        mandate.drawFloat(owner, 1e6, PURPOSE);

        // an owner with no agent configured: address(0) must not pass the check
        vm.prank(address(0));
        vm.expectRevert(AwningMandate.NotAgent.selector);
        mandate.drawFloat(attacker, 1e6, PURPOSE);

        // the agent of owner A has no power over owner B
        address ownerB = makeAddr("ownerB");
        _fund(ownerB, 100e6);
        vm.prank(agent);
        vm.expectRevert(AwningMandate.NotAgent.selector);
        mandate.drawFloat(ownerB, 1e6, PURPOSE);
    }

    function test_drawFloat_strangerCannotSpamOwnerLog() public {
        vm.recordLogs();
        vm.prank(attacker);
        vm.expectRevert(AwningMandate.NotAgent.selector);
        mandate.drawFloat(owner, 1e6, PURPOSE);
        assertEq(vm.getRecordedLogs().length, 0);
    }

    function test_drawFloat_revertsOnZeroAmount() public {
        vm.prank(agent);
        vm.expectRevert(AwningMandate.ZeroAmount.selector);
        mandate.drawFloat(owner, 0, PURPOSE);
    }

    function test_drawFloat_blocked_paused() public {
        vm.prank(owner);
        mandate.setPaused(true);
        _expectBlocked(
            AwningMandate.Action.DrawFloat, AwningMandate.BlockReason.Paused, 1e6, agent, PURPOSE
        );
        vm.prank(agent);
        assertFalse(mandate.drawFloat(owner, 1e6, PURPOSE));
        assertEq(usdc.balanceOf(agent), 0);
        assertEq(mandate.balanceOf(owner), DEPOSIT);
    }

    function test_drawFloat_blocked_expired_atExactBoundary() public {
        (, uint64 exp,,,,,) = mandate.policies(owner);
        vm.warp(exp); // still valid on the expiry second
        vm.prank(agent);
        assertTrue(mandate.drawFloat(owner, 1e6, PURPOSE));

        vm.warp(uint256(exp) + 1);
        _expectBlocked(
            AwningMandate.Action.DrawFloat, AwningMandate.BlockReason.Expired, 1e6, agent, PURPOSE
        );
        vm.prank(agent);
        assertFalse(mandate.drawFloat(owner, 1e6, PURPOSE));
    }

    function test_drawFloat_blocked_whenNeverConfiguredExpiry() public {
        vm.prank(owner);
        mandate.setPolicy(agent, 0, FLOAT_CAP, PER_HEDGE, PERIOD_CAP, THRESHOLD);
        _expectBlocked(
            AwningMandate.Action.DrawFloat, AwningMandate.BlockReason.Expired, 1e6, agent, PURPOSE
        );
        vm.prank(agent);
        assertFalse(mandate.drawFloat(owner, 1e6, PURPOSE));
    }

    function test_drawFloat_blocked_overDailyFloat_andAccountingUntouched() public {
        vm.prank(agent);
        mandate.drawFloat(owner, 40e6, PURPOSE);
        uint256 bal = mandate.balanceOf(owner);
        uint256 held = usdc.balanceOf(address(mandate));

        _expectBlocked(
            AwningMandate.Action.DrawFloat,
            AwningMandate.BlockReason.OverDailyFloat,
            10e6 + 1,
            agent,
            PURPOSE
        );
        vm.prank(agent);
        assertFalse(mandate.drawFloat(owner, 10e6 + 1, PURPOSE));

        _assertNothingMoved(bal, held);
        assertEq(mandate.floatDrawn(owner, block.timestamp / 1 days), 40e6);
        assertEq(usdc.balanceOf(agent), 40e6);

        // exactly the remainder is still allowed
        vm.prank(agent);
        assertTrue(mandate.drawFloat(owner, 10e6, PURPOSE));
    }

    function test_drawFloat_blocked_hugeAmountDoesNotOverflow() public {
        _expectBlocked(
            AwningMandate.Action.DrawFloat,
            AwningMandate.BlockReason.OverDailyFloat,
            type(uint256).max,
            agent,
            PURPOSE
        );
        vm.prank(agent);
        assertFalse(mandate.drawFloat(owner, type(uint256).max, PURPOSE));
    }

    function test_drawFloat_blocked_insufficientBalance() public {
        vm.startPrank(owner);
        mandate.withdraw(DEPOSIT - 5e6);
        vm.stopPrank();
        _expectBlocked(
            AwningMandate.Action.DrawFloat,
            AwningMandate.BlockReason.InsufficientBalance,
            6e6,
            agent,
            PURPOSE
        );
        vm.prank(agent);
        assertFalse(mandate.drawFloat(owner, 6e6, PURPOSE));
        assertEq(mandate.balanceOf(owner), 5e6);
    }

    function test_drawFloat_checkOrder() public {
        // balance short, over cap, expired and paused all at once: paused wins
        vm.startPrank(owner);
        mandate.withdraw(DEPOSIT);
        mandate.setPaused(true);
        vm.stopPrank();
        vm.warp(block.timestamp + TTL + 1);
        _expectBlocked(
            AwningMandate.Action.DrawFloat, AwningMandate.BlockReason.Paused, 100e6, agent, PURPOSE
        );
        vm.prank(agent);
        mandate.drawFloat(owner, 100e6, PURPOSE);

        // unpause: expired wins over cap and balance
        vm.prank(owner);
        mandate.setPaused(false);
        _expectBlocked(
            AwningMandate.Action.DrawFloat, AwningMandate.BlockReason.Expired, 100e6, agent, PURPOSE
        );
        vm.prank(agent);
        mandate.drawFloat(owner, 100e6, PURPOSE);

        // extend expiry: daily cap wins over balance
        vm.prank(owner);
        mandate.setPolicy(
            agent, uint64(block.timestamp + 1 days), FLOAT_CAP, PER_HEDGE, PERIOD_CAP, THRESHOLD
        );
        _expectBlocked(
            AwningMandate.Action.DrawFloat,
            AwningMandate.BlockReason.OverDailyFloat,
            100e6,
            agent,
            PURPOSE
        );
        vm.prank(agent);
        mandate.drawFloat(owner, 100e6, PURPOSE);
    }

    function test_drawFloat_hijackedAgentTotalIsBoundedPerDay() public {
        // an attacker controlling the agent key hammers drawFloat all day
        uint256 stolen;
        for (uint256 i; i < 40; ++i) {
            vm.prank(agent);
            if (mandate.drawFloat(owner, 7e6, keccak256(abi.encode(i)))) stolen += 7e6;
        }
        assertEq(usdc.balanceOf(agent), stolen);
        assertEq(stolen, 49e6); // 7 draws of 7 = 49, the 8th would breach 50
        assertLe(stolen, FLOAT_CAP);
    }

    function test_drawFloat_dayRollover() public {
        vm.prank(agent);
        mandate.drawFloat(owner, FLOAT_CAP, PURPOSE);

        vm.warp(T0 + 1 days - 1); // last second of the same UTC day
        vm.prank(agent);
        assertFalse(mandate.drawFloat(owner, 1, PURPOSE));

        vm.warp(T0 + 1 days); // first second of the next day
        vm.prank(agent);
        assertTrue(mandate.drawFloat(owner, FLOAT_CAP, PURPOSE));
        assertEq(mandate.floatDrawn(owner, T0 / 1 days), FLOAT_CAP);
        assertEq(mandate.floatDrawn(owner, T0 / 1 days + 1), FLOAT_CAP);
    }

    function test_drawFloat_loweredCapAppliesToSpentToday() public {
        vm.prank(agent);
        mandate.drawFloat(owner, 40e6, PURPOSE);
        vm.prank(owner);
        mandate.setPolicy(
            agent, uint64(block.timestamp + TTL), 30e6, PER_HEDGE, PERIOD_CAP, THRESHOLD
        );

        (uint256 floatLeft,,) = mandate.limits(owner);
        assertEq(floatLeft, 0);
        _expectBlocked(
            AwningMandate.Action.DrawFloat,
            AwningMandate.BlockReason.OverDailyFloat,
            1,
            agent,
            PURPOSE
        );
        vm.prank(agent);
        assertFalse(mandate.drawFloat(owner, 1, PURPOSE));
    }

    // ---------------------------------------------------------------- openHedge: allowed paths

    function test_openHedge_unapprovedUnderThreshold() public {
        vm.expectEmit(true, true, true, true, address(mandate));
        emit HedgeOpened(H1, owner, venue, 20e6, 80e6, MARKET, false);
        vm.prank(agent);
        assertTrue(mandate.openHedge(owner, H1, venue, 20e6, 80e6, MARKET, 0, ""));

        assertEq(usdc.balanceOf(venue), 20e6);
        assertEq(mandate.balanceOf(owner), DEPOSIT - 20e6);
        assertEq(mandate.premiumSpent(owner, block.timestamp / 30 days), 20e6);
        (
            address o,
            address v,
            uint96 prem,
            uint96 maxP,
            uint64 at,
            AwningMandate.HedgeStatus st,
            bytes32 m
        ) = mandate.hedges(mandate.hedgeKey(owner, H1));
        assertEq(o, owner);
        assertEq(v, venue);
        assertEq(prem, 20e6);
        assertEq(maxP, 80e6);
        assertEq(at, block.timestamp);
        assertEq(uint8(st), uint8(AwningMandate.HedgeStatus.Open));
        assertEq(m, MARKET);
    }

    function test_openHedge_atExactThresholdNeedsNoSignature() public {
        assertTrue(_open(H1, THRESHOLD));
    }

    function test_openHedge_approvedAboveThreshold_realSignature() public {
        uint256 premium = 60e6;
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(ownerKey, _approval(H1, premium, 240e6, deadline));

        vm.expectEmit(true, true, true, true, address(mandate));
        emit HedgeOpened(H1, owner, venue, premium, 240e6, MARKET, true);
        vm.prank(agent);
        assertTrue(mandate.openHedge(owner, H1, venue, premium, 240e6, MARKET, deadline, sig));
        assertEq(usdc.balanceOf(venue), premium);
    }

    function test_openHedge_approvalValidOnExactDeadlineSecond() public {
        uint256 deadline = block.timestamp + 10;
        bytes memory sig = _sign(ownerKey, _approval(H1, 60e6, 240e6, deadline));
        vm.warp(deadline);
        vm.prank(agent);
        assertTrue(mandate.openHedge(owner, H1, venue, 60e6, 240e6, MARKET, deadline, sig));
    }

    function test_openHedge_approvedByErc1271Owner() public {
        (address signerAddr, uint256 signerKey) = makeAddrAndKey("accountSigner");
        MockSmartAccount account = new MockSmartAccount(signerAddr);
        address acct = address(account);
        _fund(acct, DEPOSIT);
        _configure(acct);

        assertTrue(_openSigned(acct, signerKey, H1, 60e6));
        assertEq(usdc.balanceOf(venue), 60e6);
        assertEq(mandate.balanceOf(acct), DEPOSIT - 60e6);
    }

    // ---------------------------------------------------------------- openHedge: reverts

    function test_openHedge_revertsForNonAgent() public {
        vm.prank(attacker);
        vm.expectRevert(AwningMandate.NotAgent.selector);
        mandate.openHedge(owner, H1, venue, 1e6, 2e6, MARKET, 0, "");
    }

    function test_openHedge_revertsOnMalformedInput() public {
        vm.startPrank(agent);
        vm.expectRevert(AwningMandate.ZeroAmount.selector);
        mandate.openHedge(owner, H1, venue, 0, 10e6, MARKET, 0, "");

        vm.expectRevert(AwningMandate.InvalidPayout.selector);
        mandate.openHedge(owner, H1, venue, 10e6, 10e6 - 1, MARKET, 0, "");

        vm.expectRevert(AwningMandate.AmountTooLarge.selector);
        mandate.openHedge(owner, H1, venue, 10e6, uint256(type(uint96).max) + 1, MARKET, 0, "");
        vm.stopPrank();
    }

    function test_openHedge_maxPayoutEqualToPremiumIsAllowed() public {
        vm.prank(agent);
        assertTrue(mandate.openHedge(owner, H1, venue, 10e6, 10e6, MARKET, 0, ""));
    }

    function test_openHedge_revertsOnDuplicateHedgeId_evenAfterClose() public {
        assertTrue(_open(H1, 10e6));
        vm.prank(agent);
        vm.expectRevert(AwningMandate.HedgeExists.selector);
        mandate.openHedge(owner, H1, venue, 10e6, 40e6, MARKET, 0, "");

        vm.prank(venue);
        mandate.closeHedge(owner, H1, AwningMandate.HedgeStatus.Expired, 0, bytes32(0));
        vm.prank(agent);
        vm.expectRevert(AwningMandate.HedgeExists.selector);
        mandate.openHedge(owner, H1, venue, 10e6, 40e6, MARKET, 0, "");
    }

    function _expectHedgeBlocked(AwningMandate.BlockReason reason, uint256 premium) internal {
        _expectBlocked(AwningMandate.Action.OpenHedge, reason, premium, venue, H1);
    }

    function test_openHedge_blocked_paused() public {
        vm.prank(owner);
        mandate.setPaused(true);
        uint256 held = usdc.balanceOf(address(mandate));
        _expectHedgeBlocked(AwningMandate.BlockReason.Paused, 10e6);
        assertFalse(_open(H1, 10e6));
        _assertNothingMoved(DEPOSIT, held);
        assertEq(uint8(_status(H1)), uint8(AwningMandate.HedgeStatus.None));
    }

    function test_openHedge_blocked_expired() public {
        vm.warp(block.timestamp + TTL + 1);
        _expectHedgeBlocked(AwningMandate.BlockReason.Expired, 10e6);
        assertFalse(_open(H1, 10e6));
    }

    function test_openHedge_blocked_venueNotAllowed_theHijackDemo() public {
        // prompt-injected agent tries to send the owner's money to an attacker address
        _expectBlocked(
            AwningMandate.Action.OpenHedge,
            AwningMandate.BlockReason.VenueNotAllowed,
            5e6,
            attacker,
            H1
        );
        vm.prank(agent);
        bool ok = mandate.openHedge(owner, H1, attacker, 5e6, 20e6, MARKET, 0, "");
        assertFalse(ok);
        assertEq(usdc.balanceOf(attacker), 0);
        assertEq(mandate.balanceOf(owner), DEPOSIT);
        assertEq(uint8(_status(H1)), uint8(AwningMandate.HedgeStatus.None));
    }

    function test_openHedge_blocked_venueRemovedByOwner() public {
        vm.prank(owner);
        mandate.setVenue(venue, false);
        _expectHedgeBlocked(AwningMandate.BlockReason.VenueNotAllowed, 5e6);
        assertFalse(_open(H1, 5e6));
    }

    function test_openHedge_blocked_overPerHedgeCap() public {
        _expectHedgeBlocked(AwningMandate.BlockReason.OverPerHedgeCap, PER_HEDGE + 1);
        assertFalse(_open(H1, PER_HEDGE + 1));
    }

    function test_openHedge_blocked_overPerHedgeCap_evenWithValidSignature() public {
        // owner signatures raise the approval threshold, never the caps
        _expectHedgeBlocked(AwningMandate.BlockReason.OverPerHedgeCap, PER_HEDGE + 1);
        assertFalse(_openSigned(owner, ownerKey, H1, PER_HEDGE + 1));
    }

    function test_openHedge_blocked_overPeriodCap() public {
        // PERIOD_CAP is 300, spend 3 x 100 with signatures, then even 1 more is blocked
        for (uint256 i; i < 3; ++i) {
            assertTrue(_openSigned(owner, ownerKey, keccak256(abi.encode("h", i)), 100e6));
        }
        _expectHedgeBlocked(AwningMandate.BlockReason.OverPeriodCap, 1);
        assertFalse(_open(H1, 1));
        assertEq(mandate.premiumSpent(owner, block.timestamp / 30 days), 300e6);
    }

    function test_openHedge_blocked_approvalRequired_emptySignature() public {
        _expectHedgeBlocked(AwningMandate.BlockReason.ApprovalRequired, THRESHOLD + 1);
        assertFalse(_open(H1, THRESHOLD + 1));
    }

    function test_openHedge_blocked_approvalRequired_wrongSigner() public {
        (, uint256 otherKey) = makeAddrAndKey("not-the-owner");
        _expectHedgeBlocked(AwningMandate.BlockReason.ApprovalRequired, 60e6);
        assertFalse(_openSigned(owner, otherKey, H1, 60e6));
        assertEq(usdc.balanceOf(venue), 0);
    }

    function test_openHedge_blocked_approvalRequired_garbageSignature() public {
        _expectHedgeBlocked(AwningMandate.BlockReason.ApprovalRequired, 60e6);
        vm.prank(agent);
        assertFalse(
            mandate.openHedge(
                owner, H1, venue, 60e6, 240e6, MARKET, block.timestamp + 1, hex"deadbeef"
            )
        );
    }

    function test_openHedge_blocked_approvalExpired() public {
        uint256 deadline = block.timestamp + 10;
        bytes memory sig = _sign(ownerKey, _approval(H1, 60e6, 240e6, deadline));
        vm.warp(deadline + 1);
        _expectHedgeBlocked(AwningMandate.BlockReason.ApprovalExpired, 60e6);
        vm.prank(agent);
        assertFalse(mandate.openHedge(owner, H1, venue, 60e6, 240e6, MARKET, deadline, sig));
    }

    function test_openHedge_blocked_signatureReplayedWithDifferentPremium() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(ownerKey, _approval(H1, 30e6, 120e6, deadline));
        // the agent got approval for 30 but tries to spend 90 with the same signature
        _expectHedgeBlocked(AwningMandate.BlockReason.ApprovalRequired, 90e6);
        vm.prank(agent);
        assertFalse(mandate.openHedge(owner, H1, venue, 90e6, 120e6, MARKET, deadline, sig));
        // and the original still works
        vm.prank(agent);
        assertTrue(mandate.openHedge(owner, H1, venue, 30e6, 120e6, MARKET, deadline, sig));
    }

    function test_openHedge_blocked_signatureBoundToEveryField() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(ownerKey, _approval(H1, 60e6, 240e6, deadline));
        address otherVenue = makeAddr("otherVenue");
        vm.prank(owner);
        mandate.setVenue(otherVenue, true);

        vm.startPrank(agent);
        // different venue
        assertFalse(mandate.openHedge(owner, H1, otherVenue, 60e6, 240e6, MARKET, deadline, sig));
        // different maxPayout
        assertFalse(mandate.openHedge(owner, H1, venue, 60e6, 241e6, MARKET, deadline, sig));
        // different market
        assertFalse(
            mandate.openHedge(owner, H1, venue, 60e6, 240e6, bytes32(uint256(1)), deadline, sig)
        );
        // different hedge id
        assertFalse(mandate.openHedge(owner, H2, venue, 60e6, 240e6, MARKET, deadline, sig));
        // different deadline
        assertFalse(mandate.openHedge(owner, H1, venue, 60e6, 240e6, MARKET, deadline + 1, sig));
        // the exact tuple passes
        assertTrue(mandate.openHedge(owner, H1, venue, 60e6, 240e6, MARKET, deadline, sig));
        vm.stopPrank();
    }

    function test_openHedge_blocked_signatureNotReusableOnAnotherOwner() public {
        address ownerB = makeAddr("ownerB");
        _fund(ownerB, DEPOSIT);
        _configure(ownerB);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(ownerKey, _approval(H1, 60e6, 240e6, deadline));
        vm.prank(agent);
        assertFalse(mandate.openHedge(ownerB, H1, venue, 60e6, 240e6, MARKET, deadline, sig));
    }

    function test_openHedge_blocked_erc1271Rejects() public {
        (address signerAddr, uint256 signerKey) = makeAddrAndKey("accountSigner");
        MockSmartAccount account = new MockSmartAccount(signerAddr);
        address acct = address(account);
        _fund(acct, DEPOSIT);
        _configure(acct);

        account.setRejectAll(true);
        assertFalse(_openSigned(acct, signerKey, H1, 60e6));
        assertEq(mandate.balanceOf(acct), DEPOSIT);

        // a signature from someone other than the account's signer is also refused
        account.setRejectAll(false);
        (, uint256 badKey) = makeAddrAndKey("bad");
        assertFalse(_openSigned(acct, badKey, H1, 60e6));
    }

    function test_openHedge_blocked_insufficientBalance() public {
        vm.prank(owner);
        mandate.withdraw(DEPOSIT - 5e6);
        _expectHedgeBlocked(AwningMandate.BlockReason.InsufficientBalance, 10e6);
        assertFalse(_open(H1, 10e6));
        assertEq(mandate.balanceOf(owner), 5e6);
    }

    function test_openHedge_blocked_insufficientBalance_withValidSignature() public {
        vm.prank(owner);
        mandate.withdraw(DEPOSIT - 50e6);
        _expectHedgeBlocked(AwningMandate.BlockReason.InsufficientBalance, 60e6);
        assertFalse(_openSigned(owner, ownerKey, H1, 60e6));
    }

    function test_openHedge_blockedAttemptCanBeRetriedWithSameId() public {
        assertFalse(_open(H1, THRESHOLD + 1)); // no signature
        assertTrue(_openSigned(owner, ownerKey, H1, THRESHOLD + 1));
    }

    function test_openHedge_checkOrder() public {
        // Construct a request that violates everything, then fix violations from the top.
        vm.startPrank(owner);
        mandate.withdraw(DEPOSIT); // balance 0
        mandate.setVenue(venue, false);
        mandate.setPolicy(agent, uint64(block.timestamp + TTL), FLOAT_CAP, 10e6, 5e6, 1e6);
        mandate.setPaused(true);
        vm.stopPrank();
        uint256 premium = 20e6; // > perHedge(10) > period(5) > threshold(1), bad sig, no balance
        vm.warp(block.timestamp + TTL + 1); // and expired

        _expectHedgeBlocked(AwningMandate.BlockReason.Paused, premium);
        assertFalse(_open(H1, premium));

        vm.prank(owner);
        mandate.setPaused(false);
        _expectHedgeBlocked(AwningMandate.BlockReason.Expired, premium);
        assertFalse(_open(H1, premium));

        vm.prank(owner);
        mandate.setPolicy(agent, uint64(block.timestamp + TTL), FLOAT_CAP, 10e6, 5e6, 1e6);
        _expectHedgeBlocked(AwningMandate.BlockReason.VenueNotAllowed, premium);
        assertFalse(_open(H1, premium));

        vm.prank(owner);
        mandate.setVenue(venue, true);
        _expectHedgeBlocked(AwningMandate.BlockReason.OverPerHedgeCap, premium);
        assertFalse(_open(H1, premium));

        vm.prank(owner);
        mandate.setPolicy(agent, uint64(block.timestamp + TTL), FLOAT_CAP, 30e6, 5e6, 1e6);
        _expectHedgeBlocked(AwningMandate.BlockReason.OverPeriodCap, premium);
        assertFalse(_open(H1, premium));

        vm.prank(owner);
        mandate.setPolicy(agent, uint64(block.timestamp + TTL), FLOAT_CAP, 30e6, 30e6, 1e6);
        _expectHedgeBlocked(AwningMandate.BlockReason.ApprovalRequired, premium);
        assertFalse(_open(H1, premium));

        // a good signature but still no money
        _expectHedgeBlocked(AwningMandate.BlockReason.InsufficientBalance, premium);
        assertFalse(_openSigned(owner, ownerKey, H1, premium));
    }

    // ---------------------------------------------------------------- closeHedge

    function _venueFundsAndApproves(uint256 amount) internal {
        usdc.mint(venue, amount);
        vm.prank(venue);
        usdc.approve(address(mandate), type(uint256).max);
    }

    function test_closeHedge_paid() public {
        _open(H1, 20e6); // maxPayout 80e6
        _venueFundsAndApproves(100e6);
        uint256 venueBefore = usdc.balanceOf(venue);

        vm.expectEmit(true, true, false, true, address(mandate));
        emit HedgeClosed(H1, owner, AwningMandate.HedgeStatus.Paid, 80e6, keccak256("fill"));
        vm.prank(venue);
        mandate.closeHedge(owner, H1, AwningMandate.HedgeStatus.Paid, 80e6, keccak256("fill"));

        assertEq(mandate.balanceOf(owner), DEPOSIT - 20e6 + 80e6);
        assertEq(usdc.balanceOf(venue), venueBefore - 80e6);
        assertEq(uint8(_status(H1)), uint8(AwningMandate.HedgeStatus.Paid));
    }

    function test_closeHedge_expiredPaysNothing() public {
        _open(H1, 20e6);
        vm.expectEmit(true, true, false, true, address(mandate));
        emit HedgeClosed(H1, owner, AwningMandate.HedgeStatus.Expired, 0, bytes32(0));
        vm.prank(venue);
        mandate.closeHedge(owner, H1, AwningMandate.HedgeStatus.Expired, 0, bytes32(0));
        assertEq(mandate.balanceOf(owner), DEPOSIT - 20e6);
        assertEq(uint8(_status(H1)), uint8(AwningMandate.HedgeStatus.Expired));
    }

    function test_closeHedge_refundedFullAndPartial() public {
        _open(H1, 20e6);
        _open(H2, 20e6);
        _venueFundsAndApproves(0);
        vm.startPrank(venue);
        mandate.closeHedge(owner, H1, AwningMandate.HedgeStatus.Refunded, 20e6, bytes32(0));
        mandate.closeHedge(owner, H2, AwningMandate.HedgeStatus.Refunded, 7e6, bytes32(0));
        vm.stopPrank();
        assertEq(mandate.balanceOf(owner), DEPOSIT - 20e6 + 7e6);
        assertEq(usdc.balanceOf(venue), 40e6 - 27e6);
    }

    function test_closeHedge_doesNotRestoreUsedPremiumAllowance() public {
        _open(H1, 20e6);
        vm.prank(venue);
        mandate.closeHedge(owner, H1, AwningMandate.HedgeStatus.Expired, 0, bytes32(0));
        assertEq(mandate.premiumSpent(owner, block.timestamp / 30 days), 20e6);
    }

    function test_closeHedge_revertsForNonVenueAndUnknownHedge() public {
        _open(H1, 20e6);
        vm.prank(attacker);
        vm.expectRevert(AwningMandate.NotVenue.selector);
        mandate.closeHedge(owner, H1, AwningMandate.HedgeStatus.Expired, 0, bytes32(0));

        vm.prank(agent);
        vm.expectRevert(AwningMandate.NotVenue.selector);
        mandate.closeHedge(owner, H1, AwningMandate.HedgeStatus.Expired, 0, bytes32(0));

        vm.prank(venue);
        vm.expectRevert(AwningMandate.NotVenue.selector);
        mandate.closeHedge(owner, H2, AwningMandate.HedgeStatus.Expired, 0, bytes32(0));

        vm.prank(address(0)); // unknown hedge has venue == 0; address(0) must not match
        vm.expectRevert(AwningMandate.NotVenue.selector);
        mandate.closeHedge(owner, H2, AwningMandate.HedgeStatus.Expired, 0, bytes32(0));
    }

    function test_closeHedge_revertsWhenNotOpen() public {
        _open(H1, 20e6);
        vm.startPrank(venue);
        mandate.closeHedge(owner, H1, AwningMandate.HedgeStatus.Expired, 0, bytes32(0));
        vm.expectRevert(AwningMandate.HedgeNotOpen.selector);
        mandate.closeHedge(owner, H1, AwningMandate.HedgeStatus.Expired, 0, bytes32(0));
        vm.stopPrank();
    }

    function test_closeHedge_revertsOnBadOutcome() public {
        _open(H1, 20e6);
        vm.startPrank(venue);
        vm.expectRevert(AwningMandate.InvalidOutcome.selector);
        mandate.closeHedge(owner, H1, AwningMandate.HedgeStatus.None, 0, bytes32(0));
        vm.expectRevert(AwningMandate.InvalidOutcome.selector);
        mandate.closeHedge(owner, H1, AwningMandate.HedgeStatus.Open, 0, bytes32(0));
        vm.stopPrank();
    }

    function test_closeHedge_paidCanIncludeUnspentPremium() public {
        _open(H1, 20e6); // premium 20, maxPayout 80
        _venueFundsAndApproves(1_000e6);
        uint256 before = mandate.balanceOf(owner);
        vm.prank(venue);
        mandate.closeHedge(owner, H1, AwningMandate.HedgeStatus.Paid, 80e6 + 20e6, bytes32(0));
        assertEq(mandate.balanceOf(owner), before + 100e6);
        assertEq(uint8(_status(H1)), uint8(AwningMandate.HedgeStatus.Paid));
    }

    function test_closeHedge_revertsOnBadPayout() public {
        _open(H1, 20e6); // premium 20, maxPayout 80
        _venueFundsAndApproves(1_000e6);
        vm.startPrank(venue);
        vm.expectRevert(AwningMandate.InvalidPayout.selector);
        mandate.closeHedge(owner, H1, AwningMandate.HedgeStatus.Paid, 0, bytes32(0));
        // winnings are capped at maxPayout, and at most the whole premium can come back with them
        vm.expectRevert(AwningMandate.InvalidPayout.selector);
        mandate.closeHedge(owner, H1, AwningMandate.HedgeStatus.Paid, 80e6 + 20e6 + 1, bytes32(0));
        vm.expectRevert(AwningMandate.InvalidPayout.selector);
        mandate.closeHedge(owner, H1, AwningMandate.HedgeStatus.Expired, 1, bytes32(0));
        vm.expectRevert(AwningMandate.InvalidPayout.selector);
        mandate.closeHedge(owner, H1, AwningMandate.HedgeStatus.Refunded, 0, bytes32(0));
        vm.expectRevert(AwningMandate.InvalidPayout.selector);
        mandate.closeHedge(owner, H1, AwningMandate.HedgeStatus.Refunded, 20e6 + 1, bytes32(0));
        vm.stopPrank();
        // all of the above left the hedge open
        assertEq(uint8(_status(H1)), uint8(AwningMandate.HedgeStatus.Open));
    }

    function test_hedgeIds_belongToTheirOwner() public {
        address other = makeAddr("other");
        usdc.mint(other, 100e6);
        vm.startPrank(other);
        usdc.approve(address(mandate), type(uint256).max);
        mandate.deposit(100e6);
        mandate.setPolicy(other, uint64(block.timestamp + TTL), 0, PER_HEDGE, PERIOD_CAP, PER_HEDGE);
        mandate.setVenue(venue, true);
        // someone else using an id first doesn't use it up for anyone but themselves
        assertTrue(mandate.openHedge(other, H1, venue, 5e6, 5e6, MARKET, 0, ""));
        vm.stopPrank();

        assertTrue(_open(H1, 20e6));
        (address o,, uint96 premium,,,,) = mandate.hedges(mandate.hedgeKey(owner, H1));
        assertEq(o, owner);
        assertEq(premium, 20e6);

        // and closing one owner's hedge leaves the other's open
        vm.prank(venue);
        mandate.closeHedge(other, H1, AwningMandate.HedgeStatus.Expired, 0, bytes32(0));
        assertEq(uint8(_status(H1)), uint8(AwningMandate.HedgeStatus.Open));
    }

    function test_closeHedge_revertsWhenVenueCannotPay() public {
        _open(H1, 20e6);
        // venue holds 20 and never approved the mandate
        vm.prank(venue);
        vm.expectRevert();
        mandate.closeHedge(owner, H1, AwningMandate.HedgeStatus.Refunded, 10e6, bytes32(0));
        assertEq(uint8(_status(H1)), uint8(AwningMandate.HedgeStatus.Open));
        assertEq(mandate.balanceOf(owner), DEPOSIT - 20e6);
    }

    function test_closeHedge_worksWhilePausedAndExpired() public {
        _open(H1, 20e6);
        vm.prank(owner);
        mandate.setPaused(true);
        vm.warp(block.timestamp + TTL + 1);
        _venueFundsAndApproves(100e6);
        vm.prank(venue);
        mandate.closeHedge(owner, H1, AwningMandate.HedgeStatus.Paid, 50e6, bytes32(0));
        assertEq(mandate.balanceOf(owner), DEPOSIT - 20e6 + 50e6);
    }

    // ---------------------------------------------------------------- rollover

    function test_premiumPeriodRollover() public {
        for (uint256 i; i < 3; ++i) {
            assertTrue(_openSigned(owner, ownerKey, keccak256(abi.encode("p", i)), 100e6));
        }
        vm.warp(T0 + 30 days - 1);
        assertFalse(_open(H1, 1));

        vm.warp(T0 + 30 days);
        (, uint256 premiumLeft,) = mandate.limits(owner);
        assertEq(premiumLeft, PERIOD_CAP);
        assertTrue(_openSigned(owner, ownerKey, H1, 100e6));
        assertEq(mandate.premiumSpent(owner, T0 / 30 days), 300e6);
        assertEq(mandate.premiumSpent(owner, T0 / 30 days + 1), 100e6);
    }

    function test_floatAndPremiumBudgetsAreIndependent() public {
        vm.prank(agent);
        mandate.drawFloat(owner, FLOAT_CAP, PURPOSE);
        assertTrue(_open(H1, 20e6));
        (uint256 f, uint256 p,) = mandate.limits(owner);
        assertEq(f, 0);
        assertEq(p, PERIOD_CAP - 20e6);
    }

    // ---------------------------------------------------------------- limits

    function test_limits_freshPolicy() public view {
        (uint256 f, uint256 p, uint256 u) = mandate.limits(owner);
        assertEq(f, FLOAT_CAP);
        assertEq(p, PERIOD_CAP);
        assertEq(u, THRESHOLD);
    }

    function test_limits_cappedByBalance() public {
        vm.prank(owner);
        mandate.withdraw(DEPOSIT - 10e6);
        (uint256 f, uint256 p,) = mandate.limits(owner);
        assertEq(f, 10e6);
        assertEq(p, 10e6);
    }

    function test_limits_zeroWhenPausedOrExpired_unapprovedCapStillReported() public {
        vm.prank(owner);
        mandate.setPaused(true);
        (uint256 f, uint256 p, uint256 u) = mandate.limits(owner);
        assertEq(f, 0);
        assertEq(p, 0);
        assertEq(u, THRESHOLD);

        vm.prank(owner);
        mandate.setPaused(false);
        vm.warp(block.timestamp + TTL + 1);
        (f, p, u) = mandate.limits(owner);
        assertEq(f, 0);
        assertEq(p, 0);
        assertEq(u, THRESHOLD);
    }

    function test_limits_unapprovedCapIsMinOfCapAndThreshold() public {
        vm.startPrank(owner);
        mandate.setPolicy(agent, uint64(block.timestamp + TTL), 1, 10e6, 1, 50e6);
        (,, uint256 u) = mandate.limits(owner);
        assertEq(u, 10e6);
        mandate.setPolicy(agent, uint64(block.timestamp + TTL), 1, 50e6, 1, 10e6);
        (,, u) = mandate.limits(owner);
        assertEq(u, 10e6);
        vm.stopPrank();
    }

    function test_limits_unknownOwnerIsAllZero() public view {
        (uint256 f, uint256 p, uint256 u) = mandate.limits(attacker);
        assertEq(f, 0);
        assertEq(p, 0);
        assertEq(u, 0);
    }

    function test_limits_afterLoweringCapBelowSpent() public {
        vm.prank(agent);
        mandate.drawFloat(owner, 40e6, PURPOSE);
        vm.prank(owner);
        mandate.setPolicy(agent, uint64(block.timestamp + TTL), 10e6, 1, 1, 1);
        (uint256 f,,) = mandate.limits(owner);
        assertEq(f, 0);
    }

    // ---------------------------------------------------------------- EIP-712

    function test_hashHedgeApproval_matchesIndependentComputation() public view {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "HedgeApproval(bytes32 hedgeId,address venue,uint256 premium,uint256 maxPayout,bytes32 marketRef,uint256 deadline)"
                ),
                H1,
                venue,
                uint256(60e6),
                uint256(240e6),
                MARKET,
                uint256(123456)
            )
        );
        bytes32 domain = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("AwningMandate"),
                keccak256("1"),
                block.chainid,
                address(mandate)
            )
        );
        bytes32 expected = keccak256(abi.encodePacked("\x19\x01", domain, structHash));
        assertEq(mandate.hashHedgeApproval(H1, venue, 60e6, 240e6, MARKET, 123456), expected);
    }

    function test_hashHedgeApproval_domainIsBoundToContractAndChain() public {
        bytes32 here = mandate.hashHedgeApproval(H1, venue, 1, 2, MARKET, 3);
        AwningMandate other = new AwningMandate(usdc);
        assertTrue(other.hashHedgeApproval(H1, venue, 1, 2, MARKET, 3) != here);

        vm.chainId(5042002);
        assertTrue(
            mandate.hashHedgeApproval(H1, venue, 1, 2, MARKET, 3) != here,
            "cached domain ignores chain fork"
        );
    }

    // ---------------------------------------------------------------- fuzz

    /// limits().floatRemainingToday is the exact answer to "how much can a hijacked agent take
    /// right now": a draw succeeds iff it is within it.
    function testFuzz_floatRemainingIsExact(
        uint96 cap,
        uint96 deposit,
        uint96 firstDraw,
        uint96 secondDraw
    ) public {
        cap = uint96(bound(cap, 1, 1_000_000e6));
        deposit = uint96(bound(deposit, 0, 2_000_000e6));
        address o = makeAddr("fuzzOwner");
        if (deposit > 0) _fund(o, deposit);
        vm.startPrank(o);
        mandate.setPolicy(agent, uint64(block.timestamp + 1 days), cap, 0, 0, 0);
        vm.stopPrank();

        firstDraw = uint96(bound(firstDraw, 1, 2_000_000e6));
        vm.prank(agent);
        mandate.drawFloat(o, firstDraw, PURPOSE);

        (uint256 remaining,,) = mandate.limits(o);
        uint256 drawnSoFar = usdc.balanceOf(agent);
        assertLe(drawnSoFar, cap);
        assertLe(remaining, cap - drawnSoFar);
        assertLe(remaining, mandate.balanceOf(o));

        uint256 amt = bound(secondDraw, 1, 4_000_000e6);
        uint256 heldBefore = usdc.balanceOf(address(mandate));
        vm.prank(agent);
        bool ok = mandate.drawFloat(o, amt, PURPOSE);
        assertEq(ok, amt <= remaining, "draw outcome disagrees with limits()");
        if (ok) {
            assertEq(usdc.balanceOf(address(mandate)), heldBefore - amt);
        } else {
            assertEq(usdc.balanceOf(address(mandate)), heldBefore);
        }
        // and whatever happened, total taken today never exceeds the cap
        assertLe(usdc.balanceOf(agent), cap);
    }

    function testFuzz_hijackedAgentCannotExceedDailyCap(uint96 cap, uint256[8] memory amounts)
        public
    {
        cap = uint96(bound(cap, 1, 500e6));
        vm.prank(owner);
        mandate.setPolicy(
            agent, uint64(block.timestamp + TTL), cap, PER_HEDGE, PERIOD_CAP, THRESHOLD
        );
        for (uint256 i; i < amounts.length; ++i) {
            uint256 a = bound(amounts[i], 1, 600e6);
            vm.prank(agent);
            mandate.drawFloat(owner, a, bytes32(i));
            assertLe(usdc.balanceOf(agent), cap);
        }
    }

    function testFuzz_unsignedHedgeSucceedsIffWithinEveryLimit(
        uint96 perHedge,
        uint96 periodCap,
        uint96 threshold,
        uint96 balance,
        uint96 premium
    ) public {
        perHedge = uint96(bound(perHedge, 0, 1_000_000e6));
        periodCap = uint96(bound(periodCap, 0, 1_000_000e6));
        threshold = uint96(bound(threshold, 0, 1_000_000e6));
        balance = uint96(bound(balance, 0, 1_000_000e6));
        premium = uint96(bound(premium, 1, 1_500_000e6));

        address o = makeAddr("fuzzOwner");
        if (balance > 0) _fund(o, balance);
        vm.startPrank(o);
        mandate.setPolicy(
            agent, uint64(block.timestamp + 1 days), 0, perHedge, periodCap, threshold
        );
        mandate.setVenue(venue, true);
        vm.stopPrank();

        bool expected = premium <= perHedge && premium <= periodCap && premium <= threshold
            && premium <= balance;

        vm.prank(agent);
        bool ok = mandate.openHedge(o, H1, venue, premium, uint256(premium) * 2, MARKET, 0, "");
        assertEq(ok, expected);
        assertEq(usdc.balanceOf(venue), ok ? premium : 0);
        assertEq(mandate.balanceOf(o), ok ? balance - premium : balance);

        (, uint256 premiumLeft, uint256 unapproved) = mandate.limits(o);
        assertEq(unapproved, perHedge < threshold ? perHedge : threshold);
        assertLe(premiumLeft, balance - (ok ? premium : 0));
    }

    function testFuzz_signedHedgeStillRespectsCaps(
        uint96 premium,
        uint96 perHedge,
        uint96 periodCap
    ) public {
        perHedge = uint96(bound(perHedge, 1, 500e6));
        periodCap = uint96(bound(periodCap, 1, 500e6));
        premium = uint96(bound(premium, 1, 600e6));
        vm.startPrank(owner);
        mandate.setPolicy(agent, uint64(block.timestamp + TTL), FLOAT_CAP, perHedge, periodCap, 0);
        vm.stopPrank();
        bool ok = _openSigned(owner, ownerKey, H1, premium);
        assertEq(ok, premium <= perHedge && premium <= periodCap);
    }

    function testFuzz_periodTotalNeverExceedsCap(uint96 cap, uint256[6] memory amounts) public {
        cap = uint96(bound(cap, 1, 400e6));
        vm.prank(owner);
        mandate.setPolicy(agent, uint64(block.timestamp + TTL), FLOAT_CAP, 400e6, cap, 400e6);
        uint256 spent;
        for (uint256 i; i < amounts.length; ++i) {
            uint256 p = bound(amounts[i], 1, 200e6);
            vm.prank(agent);
            bool ok = mandate.openHedge(owner, bytes32(i + 1), venue, p, p, MARKET, 0, "");
            if (ok) spent += p;
            assertLe(spent, cap);
        }
        assertEq(usdc.balanceOf(venue), spent);
    }

    function testFuzz_closeHedgeConservesFunds(uint96 premium, uint8 outcomeSeed, uint96 payoutSeed)
        public
    {
        premium = uint96(bound(premium, 1, THRESHOLD));
        uint256 maxPayout = uint256(premium) * 3;
        vm.prank(agent);
        mandate.openHedge(owner, H1, venue, premium, maxPayout, MARKET, 0, "");
        usdc.mint(venue, maxPayout);
        vm.prank(venue);
        usdc.approve(address(mandate), type(uint256).max);

        uint256 supplyHeld = usdc.balanceOf(address(mandate)) + usdc.balanceOf(venue);
        AwningMandate.HedgeStatus outcome = AwningMandate.HedgeStatus(bound(outcomeSeed, 2, 4));
        uint256 payout = outcome == AwningMandate.HedgeStatus.Expired
            ? 0
            : bound(payoutSeed, 1, outcome == AwningMandate.HedgeStatus.Paid ? maxPayout : premium);

        vm.prank(venue);
        mandate.closeHedge(owner, H1, outcome, payout, bytes32(0));

        assertEq(usdc.balanceOf(address(mandate)) + usdc.balanceOf(venue), supplyHeld);
        assertEq(mandate.balanceOf(owner), DEPOSIT - premium + payout);
        assertEq(usdc.balanceOf(address(mandate)), mandate.balanceOf(owner));
    }
}
