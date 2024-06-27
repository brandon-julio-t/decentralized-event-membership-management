// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "hardhat/console.sol";

contract EventMembershipManagement {
    enum AdminType {
        Membership,
        Event
    }

    enum MembershipTier {
        Regular,
        Gold,
        Vip
    }

    struct MembershipData {
        MembershipTier tier;
        uint256 expiredAt;
        uint256 approvedAt;
    }

    address public owner;
    mapping(AdminType => mapping(address => bool)) adminMappings;
    mapping(MembershipTier => uint256) membershipPriceMappings;
    mapping(address => MembershipData) membershipDataMappings;

    event SetAdmin(AdminType adminType, address user, bool isActive);
    event SetFee(MembershipTier membershipTier, uint256 fee);
    event RegisterSuccess(
        MembershipTier tier,
        uint256 registrationFee,
        address member
    );

    constructor() {
        owner = msg.sender;

        membershipPriceMappings[MembershipTier.Regular] = 1;
        membershipPriceMappings[MembershipTier.Gold] = 2;
        membershipPriceMappings[MembershipTier.Vip] = 3;
    }

    function setAdmin(
        AdminType adminType,
        address user,
        bool isActive
    ) public onlyOwner {
        bool isAdminActive = adminMappings[adminType][user];

        require(
            isActive != isAdminActive,
            isAdminActive ? "Admin already active" : "Admin already inactive"
        );

        adminMappings[adminType][user] = isActive;

        emit SetAdmin(adminType, user, isActive);
    }

    function isAdmin(
        AdminType adminType,
        address user
    ) public view returns (bool) {
        return adminMappings[adminType][user];
    }

    function setFee(
        MembershipTier membershipTier,
        uint256 fee
    ) public onlyOwner {
        require(
            membershipPriceMappings[membershipTier] != fee,
            "New fee must be different from previous fee"
        );

        membershipPriceMappings[membershipTier] = fee;

        emit SetFee(membershipTier, fee);
    }

    function getFee(
        MembershipTier membershipTier
    ) public view returns (uint256) {
        return membershipPriceMappings[membershipTier];
    }

    function register(MembershipTier tier) public payable {
        uint256 registrationFee = membershipPriceMappings[tier];
        require(registrationFee == msg.value, "Incorrect registration fee");

        membershipDataMappings[msg.sender] = MembershipData({
            tier: tier,
            expiredAt: block.timestamp + 30 days,
            approvedAt: 0
        });

        emit RegisterSuccess(tier, registrationFee, msg.sender);
    }

    function isMember(address member) public view returns (bool) {
        MembershipData memory membershipData = membershipDataMappings[member];

        bool isAdminApproved = membershipData.approvedAt > 0;

        return isAdminApproved && block.timestamp <= membershipData.expiredAt;
    }

    function approveRegistration(address user) public onlyMemberAdmin {
        membershipDataMappings[user].approvedAt = block.timestamp;
    }

    function rejectRegistration(address user) public onlyMemberAdmin {
        membershipDataMappings[user].approvedAt = 0;

        MembershipTier tier = membershipDataMappings[user].tier;
        uint256 registrationFee = membershipPriceMappings[tier];

        (bool ok, ) = payable(user).call{value: registrationFee}("");
        require(ok, "Failed to reject registration");
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyMemberAdmin() {
        require(
            adminMappings[AdminType.Membership][msg.sender],
            "Not member admin"
        );
        _;
    }

    // Function to receive Ether. msg.data must be empty
    receive() external payable {}

    // Fallback function is called when msg.data is not empty
    fallback() external payable {}

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
}
