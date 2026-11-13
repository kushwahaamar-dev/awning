// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC usdc;
    uint256 aliceKey;
    address alice;
    address bob = makeAddr("bob");

    bytes32 constant NONCE = keccak256("random-nonce");

    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);

    function setUp() public {
        usdc = new MockUSDC();
        (alice, aliceKey) = makeAddrAndKey("alice");
        usdc.mint(alice, 100e6);
        vm.warp(1_000_000);
    }

    function _domain() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("USD Coin"),
                keccak256("2"),
                block.chainid,
                address(usdc)
            )
        );
    }

    function _auth(
        uint256 key,
        address from,
        address to,
        uint256 value,
        uint256 after_,
        uint256 before_,
        bytes32 nonce
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
                ),
                from,
                to,
                value,
                after_,
                before_,
                nonce
            )
        );
        (v, r, s) = vm.sign(key, keccak256(abi.encodePacked("\x19\x01", _domain(), structHash)));
    }

    function test_metadata() public view {
        assertEq(usdc.name(), "USD Coin");
        assertEq(usdc.symbol(), "USDC");
        assertEq(usdc.decimals(), 6);
        assertEq(usdc.DOMAIN_SEPARATOR(), _domain());
    }

    function test_typehashMatchesCircleFiatToken() public view {
        assertEq(
            usdc.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(),
            keccak256(
                "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
            )
        );
    }

    function test_transferWithAuthorization_movesFundsAndMarksNonce() public {
        (uint8 v, bytes32 r, bytes32 s) =
            _auth(aliceKey, alice, bob, 10e6, 0, block.timestamp + 60, NONCE);
        assertFalse(usdc.authorizationState(alice, NONCE));

        vm.expectEmit(true, true, false, false, address(usdc));
        emit AuthorizationUsed(alice, NONCE);
        vm.prank(makeAddr("facilitator")); // anyone can submit the signed authorization
        usdc.transferWithAuthorization(alice, bob, 10e6, 0, block.timestamp + 60, NONCE, v, r, s);

        assertEq(usdc.balanceOf(bob), 10e6);
        assertEq(usdc.balanceOf(alice), 90e6);
        assertTrue(usdc.authorizationState(alice, NONCE));
    }

    function test_transferWithAuthorization_replayReverts() public {
        (uint8 v, bytes32 r, bytes32 s) =
            _auth(aliceKey, alice, bob, 10e6, 0, block.timestamp + 60, NONCE);
        usdc.transferWithAuthorization(alice, bob, 10e6, 0, block.timestamp + 60, NONCE, v, r, s);
        vm.expectRevert(MockUSDC.AuthorizationAlreadyUsed.selector);
        usdc.transferWithAuthorization(alice, bob, 10e6, 0, block.timestamp + 60, NONCE, v, r, s);
    }

    function test_transferWithAuthorization_windowIsExclusive() public {
        uint256 t = block.timestamp;
        (uint8 v, bytes32 r, bytes32 s) = _auth(aliceKey, alice, bob, 1e6, t + 10, t + 20, NONCE);

        vm.expectRevert(MockUSDC.AuthorizationNotYetValid.selector);
        usdc.transferWithAuthorization(alice, bob, 1e6, t + 10, t + 20, NONCE, v, r, s);

        vm.warp(t + 10); // validAfter itself is still "not yet" (timestamp must be > validAfter)
        vm.expectRevert(MockUSDC.AuthorizationNotYetValid.selector);
        usdc.transferWithAuthorization(alice, bob, 1e6, t + 10, t + 20, NONCE, v, r, s);

        vm.warp(t + 20); // validBefore itself is already expired
        vm.expectRevert(MockUSDC.AuthorizationExpired.selector);
        usdc.transferWithAuthorization(alice, bob, 1e6, t + 10, t + 20, NONCE, v, r, s);

        vm.warp(t + 15);
        usdc.transferWithAuthorization(alice, bob, 1e6, t + 10, t + 20, NONCE, v, r, s);
        assertEq(usdc.balanceOf(bob), 1e6);
    }

    function test_transferWithAuthorization_wrongSignerOrTamperedFieldsRevert() public {
        (, uint256 mallory) = makeAddrAndKey("mallory");
        (uint8 v, bytes32 r, bytes32 s) =
            _auth(mallory, alice, bob, 10e6, 0, block.timestamp + 60, NONCE);
        vm.expectRevert(MockUSDC.InvalidAuthorizationSignature.selector);
        usdc.transferWithAuthorization(alice, bob, 10e6, 0, block.timestamp + 60, NONCE, v, r, s);

        (v, r, s) = _auth(aliceKey, alice, bob, 10e6, 0, block.timestamp + 60, NONCE);
        vm.expectRevert(MockUSDC.InvalidAuthorizationSignature.selector);
        usdc.transferWithAuthorization(alice, bob, 11e6, 0, block.timestamp + 60, NONCE, v, r, s);
        assertFalse(usdc.authorizationState(alice, NONCE));
    }

    function test_transferWithAuthorization_insufficientBalanceRevertsAndKeepsNonceFree() public {
        (uint8 v, bytes32 r, bytes32 s) =
            _auth(aliceKey, alice, bob, 500e6, 0, block.timestamp + 60, NONCE);
        vm.expectRevert();
        usdc.transferWithAuthorization(alice, bob, 500e6, 0, block.timestamp + 60, NONCE, v, r, s);
        assertFalse(usdc.authorizationState(alice, NONCE));
    }

    function test_permit_setsAllowanceUsingDomainVersion2() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                alice,
                bob,
                uint256(7e6),
                usdc.nonces(alice),
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(aliceKey, keccak256(abi.encodePacked("\x19\x01", _domain(), structHash)));
        usdc.permit(alice, bob, 7e6, deadline, v, r, s);
        assertEq(usdc.allowance(alice, bob), 7e6);
        assertEq(usdc.nonces(alice), 1);

        vm.expectRevert(); // nonce consumed
        usdc.permit(alice, bob, 7e6, deadline, v, r, s);
    }

    function test_permit_expiredAndWrongSignerRevert() public {
        uint256 deadline = block.timestamp + 1;
        (, uint256 mallory) = makeAddrAndKey("mallory");
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                alice,
                bob,
                uint256(1),
                uint256(0),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domain(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(mallory, digest);
        vm.expectRevert();
        usdc.permit(alice, bob, 1, deadline, v, r, s);

        (v, r, s) = vm.sign(aliceKey, digest);
        vm.warp(deadline + 1);
        vm.expectRevert(abi.encodeWithSelector(MockUSDC.ERC2612ExpiredSignature.selector, deadline));
        usdc.permit(alice, bob, 1, deadline, v, r, s);
    }

    function testFuzz_mintIsOpen(address to, uint96 amount) public {
        vm.assume(to != address(0));
        uint256 before = usdc.balanceOf(to);
        vm.prank(bob);
        usdc.mint(to, amount);
        assertEq(usdc.balanceOf(to), before + amount);
    }
}
