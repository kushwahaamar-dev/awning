// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AwningMandate} from "../src/AwningMandate.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// Drives random but well-formed sequences of owner, agent, venue and time actions.
/// Ghost variables are updated from the handler's own inputs, not by reading the contract's
/// policy back, so the invariants check the contract against an independent record.
contract MandateHandler is Test {
    uint256 constant OWNERS = 3;
    uint256 constant START = 680 * 30 days;

    AwningMandate public mandate;
    MockUSDC public usdc;

    uint256[OWNERS] public ownerKeys = [uint256(0xA11CE), uint256(0xB0B), uint256(0xCA401)];
    address[OWNERS] public owners;
    address[OWNERS] public agents;
    address[2] public venues;

    /// handler's own record of the daily float cap currently set per owner
    uint96[OWNERS] public ghostCap;
    /// highest cap that was in force at any point during a given UTC day, per owner
    mapping(uint256 ownerIdx => mapping(uint256 day => uint256)) public ghostMaxCapOnDay;
    uint256 public ghostFloatSuccesses;
    uint256 public ghostHedgesOpened;
    uint256 public ghostHedgesClosed;
    uint256 public ghostBlocked;

    bytes32[] public openIds;
    uint256 nextId;

    constructor(AwningMandate mandate_, MockUSDC usdc_) {
        mandate = mandate_;
        usdc = usdc_;
        venues = [makeAddr("venueA"), makeAddr("venueB")];
        for (uint256 i; i < OWNERS; ++i) {
            owners[i] = vm.addr(ownerKeys[i]);
            agents[i] = makeAddr(string.concat("agent", vm.toString(i)));
            ghostCap[i] = 50e6;
            vm.startPrank(owners[i]);
            mandate.setPolicy(
                agents[i], uint64(block.timestamp + 90 days), 50e6, 100e6, 300e6, 25e6
            );
            mandate.setVenue(venues[0], true);
            vm.stopPrank();
            ghostMaxCapOnDay[i][block.timestamp / 1 days] = 50e6;
        }
        for (uint256 i; i < venues.length; ++i) {
            vm.prank(venues[i]);
            usdc.approve(address(mandate), type(uint256).max);
        }
    }

    function startDay() external pure returns (uint256) {
        return START / 1 days;
    }

    function _bumpCap(uint256 i) internal {
        uint256 day = block.timestamp / 1 days;
        if (ghostCap[i] > ghostMaxCapOnDay[i][day]) ghostMaxCapOnDay[i][day] = ghostCap[i];
    }

    function deposit(uint256 ownerSeed, uint256 amount) external {
        uint256 i = ownerSeed % OWNERS;
        amount = bound(amount, 1, 500e6);
        usdc.mint(owners[i], amount);
        vm.startPrank(owners[i]);
        usdc.approve(address(mandate), amount);
        mandate.deposit(amount);
        vm.stopPrank();
    }

    function withdraw(uint256 ownerSeed, uint256 amount) external {
        uint256 i = ownerSeed % OWNERS;
        uint256 bal = mandate.balanceOf(owners[i]);
        if (bal == 0) return;
        vm.prank(owners[i]);
        mandate.withdraw(bound(amount, 1, bal));
    }

    function setPolicy(
        uint256 ownerSeed,
        uint256 expiresIn,
        uint96 floatCap,
        uint96 perHedge,
        uint96 periodCap,
        uint96 threshold
    ) external {
        uint256 i = ownerSeed % OWNERS;
        ghostCap[i] = uint96(bound(floatCap, 0, 200e6));
        vm.prank(owners[i]);
        mandate.setPolicy(
            agents[i],
            uint64(block.timestamp + bound(expiresIn, 0, 90 days)),
            ghostCap[i],
            uint96(bound(perHedge, 0, 150e6)),
            uint96(bound(periodCap, 0, 400e6)),
            uint96(bound(threshold, 0, 100e6))
        );
        _bumpCap(i);
    }

    function setPaused(uint256 ownerSeed, bool paused) external {
        vm.prank(owners[ownerSeed % OWNERS]);
        mandate.setPaused(paused);
    }

    function setVenue(uint256 ownerSeed, uint256 venueSeed, bool allowed) external {
        vm.prank(owners[ownerSeed % OWNERS]);
        mandate.setVenue(venues[venueSeed % 2], allowed);
    }

    function warp(uint256 delta) external {
        vm.warp(block.timestamp + bound(delta, 0, 40 days));
        for (uint256 i; i < OWNERS; ++i) {
            _bumpCap(i);
        }
    }

    function drawFloat(uint256 ownerSeed, uint256 amount) external {
        uint256 i = ownerSeed % OWNERS;
        vm.prank(agents[i]);
        bool ok = mandate.drawFloat(owners[i], bound(amount, 1, 120e6), bytes32(nextId++));
        if (ok) ++ghostFloatSuccesses;
        else ++ghostBlocked;
    }

    function openHedge(
        uint256 ownerSeed,
        uint256 venueSeed,
        uint256 premium,
        uint256 payoutMultiple
    ) external {
        uint256 i = ownerSeed % OWNERS;
        premium = bound(premium, 1, 160e6);
        bool ok = _open(
            i,
            venues[venueSeed % 2],
            premium,
            premium * bound(payoutMultiple, 1, 5),
            bytes32(++nextId)
        );
        if (ok) {
            openIds.push(bytes32(nextId));
            ++ghostHedgesOpened;
        } else {
            ++ghostBlocked;
        }
    }

    /// Always attaches a valid owner signature; the contract only demands it above the threshold.
    function _open(uint256 i, address venue, uint256 premium, uint256 maxPayout, bytes32 id)
        internal
        returns (bool)
    {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = mandate.hashHedgeApproval(id, venue, premium, maxPayout, 0, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKeys[i], digest);
        vm.prank(agents[i]);
        return mandate.openHedge(
            owners[i], id, venue, premium, maxPayout, 0, deadline, abi.encodePacked(r, s, v)
        );
    }

    function closeHedge(uint256 idSeed, uint256 outcomeSeed, uint256 payoutSeed) external {
        if (openIds.length == 0) return;
        uint256 idx = idSeed % openIds.length;
        bytes32 id = openIds[idx];
        (, address venue, uint96 premium, uint96 maxPayout,,,) = mandate.hedges(id);

        uint256 pick = outcomeSeed % 3;
        AwningMandate.HedgeStatus outcome = AwningMandate.HedgeStatus(2 + pick);
        uint256 payout = pick == 1 ? 0 : bound(payoutSeed, 1, pick == 0 ? maxPayout : premium);

        usdc.mint(venue, payout); // the venue is solvent in this model
        vm.prank(venue);
        mandate.closeHedge(id, outcome, payout, bytes32(0));

        openIds[idx] = openIds[openIds.length - 1];
        openIds.pop();
        ++ghostHedgesClosed;
    }

    function ownersLength() external pure returns (uint256) {
        return OWNERS;
    }
}

contract AwningMandateInvariantTest is Test {
    MockUSDC usdc;
    AwningMandate mandate;
    MandateHandler handler;

    function setUp() public {
        vm.warp(680 * 30 days);
        usdc = new MockUSDC();
        mandate = new AwningMandate(usdc);
        handler = new MandateHandler(mandate, usdc);
        targetContract(address(handler));

        bytes4[] memory selectors = new bytes4[](9);
        selectors[0] = MandateHandler.deposit.selector;
        selectors[1] = MandateHandler.withdraw.selector;
        selectors[2] = MandateHandler.setPolicy.selector;
        selectors[3] = MandateHandler.setPaused.selector;
        selectors[4] = MandateHandler.setVenue.selector;
        selectors[5] = MandateHandler.warp.selector;
        selectors[6] = MandateHandler.drawFloat.selector;
        selectors[7] = MandateHandler.openHedge.selector;
        selectors[8] = MandateHandler.closeHedge.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    /// (a) every USDC held by the contract is accounted to exactly one owner's vault
    function invariant_contractBalanceEqualsSumOfVaults() public view {
        uint256 sum;
        uint256 n = handler.ownersLength();
        for (uint256 i; i < n; ++i) {
            sum += mandate.balanceOf(handler.owners(i));
        }
        assertEq(usdc.balanceOf(address(mandate)), sum);
    }

    /// (b) on every UTC day, an owner's float drawn is within the highest cap that was in force
    /// that day (the cap can be lowered mid-day but never bypassed)
    function invariant_floatDrawnNeverExceedsCapInForce() public view {
        uint256 first = handler.startDay();
        uint256 last = block.timestamp / 1 days;
        uint256 n = handler.ownersLength();
        for (uint256 i; i < n; ++i) {
            address o = handler.owners(i);
            for (uint256 d = first; d <= last; ++d) {
                uint256 drawn = mandate.floatDrawn(o, d);
                if (drawn == 0) continue;
                assertLe(drawn, handler.ghostMaxCapOnDay(i, d), "float drawn above cap in force");
            }
        }
    }

    /// agents hold exactly what they drew, so total agent holdings equal total float drawn
    function invariant_agentsHoldOnlyDrawnFloat() public view {
        uint256 first = handler.startDay();
        uint256 last = block.timestamp / 1 days;
        uint256 n = handler.ownersLength();
        uint256 drawnTotal;
        uint256 agentTotal;
        for (uint256 i; i < n; ++i) {
            address o = handler.owners(i);
            agentTotal += usdc.balanceOf(handler.agents(i));
            for (uint256 d = first; d <= last; ++d) {
                drawnTotal += mandate.floatDrawn(o, d);
            }
        }
        assertEq(agentTotal, drawnTotal);
    }
}
