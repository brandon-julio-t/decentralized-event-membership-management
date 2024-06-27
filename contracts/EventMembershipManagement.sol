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
        bool hasRegister;
    }

    struct Event {
        uint256 usedQuota;
        uint256 maxQuota;
        uint256 earlyAccessEndsAt;
        uint256 cancelledAt;
    }

    address public owner;

    mapping(AdminType => mapping(address => bool)) adminMappings;
    mapping(MembershipTier => uint256) membershipPriceMappings;
    mapping(address => MembershipData) membershipDataMappings;

    uint256 latestEventId = 1;
    mapping(uint256 => Event) eventMappings;

    event SetAdmin(AdminType adminType, address user, bool isActive);
    event SetFee(MembershipTier membershipTier, uint256 fee);
    event RegisterSuccess(
        MembershipTier tier,
        uint256 registrationFee,
        address member
    );
    event ApproveRegistration(address user);
    event RejectRegistration(address user);
    event CreateEvent(
        uint256 eventId,
        uint256 maxQuota,
        uint256 earlyAccessEndsAt
    );
    event CancelEvent(uint256 eventId, uint256 cancelledAt);
    event RegisterEventSuccess(uint256 eventId, address member);

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
            expiredAt: 0,
            approvedAt: 0,
            hasRegister: true
        });

        emit RegisterSuccess(tier, registrationFee, msg.sender);
    }

    function isMember(address member) public view returns (bool) {
        MembershipData memory membershipData = membershipDataMappings[member];

        bool isAdminApproved = membershipData.approvedAt > 0;

        return isAdminApproved && block.timestamp <= membershipData.expiredAt;
    }

    function approveRegistration(address user) public onlyMemberAdmin {
        require(
            membershipDataMappings[user].hasRegister,
            "User is not registered yet"
        );

        membershipDataMappings[user].approvedAt = block.timestamp;
        membershipDataMappings[user].expiredAt = block.timestamp + 30 days;

        emit ApproveRegistration(user);
    }

    function rejectRegistration(address user) public onlyMemberAdmin {
        membershipDataMappings[user].approvedAt = 0;

        MembershipTier tier = membershipDataMappings[user].tier;
        uint256 registrationFee = membershipPriceMappings[tier];

        (bool ok, ) = payable(user).call{value: registrationFee}("");
        require(ok, "Failed to reject registration");

        emit RejectRegistration(user);
    }

    function getEvent(uint256 eventId) public view returns (Event memory) {
        return eventMappings[eventId];
    }

    function createEvent(uint256 maxQuota) public onlyEventAdmin {
        uint256 earlyAccessEndsAt = block.timestamp + 3 days;

        eventMappings[latestEventId] = Event({
            usedQuota: 0,
            maxQuota: maxQuota,
            earlyAccessEndsAt: earlyAccessEndsAt,
            cancelledAt: 0
        });

        emit CreateEvent(latestEventId, maxQuota, earlyAccessEndsAt);

        latestEventId++;
    }

    function cancelEvent(uint256 eventId) public onlyEventAdmin {
        uint256 cancelledAt = block.timestamp;

        eventMappings[eventId].cancelledAt = cancelledAt;

        emit CancelEvent(eventId, cancelledAt);
    }

    function registerEvent(uint256 eventId) public onlyActiveMember {
        Event memory eventData = eventMappings[eventId];
        MembershipData memory membershipData = membershipDataMappings[
            msg.sender
        ];

        bool isEarlyAccess = block.timestamp <= eventData.earlyAccessEndsAt;
        MembershipTier memberTier = membershipData.tier;

        if (isEarlyAccess) {
            require(
                memberTier == MembershipTier.Vip,
                "Early access is exclusive to VIP only"
            );
        }

        uint256 maxQuotaDivisor = membershipData.tier == MembershipTier.Vip
            ? 1
            : 2;
        uint256 actualMaxQuota = eventData.maxQuota / maxQuotaDivisor;

        eventMappings[eventId].usedQuota += 1;

        require(
            eventMappings[eventId].usedQuota <= actualMaxQuota,
            "No more quota available"
        );

        emit RegisterEventSuccess(eventId, msg.sender);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyActiveMember() {
        require(isMember(msg.sender), "Not active member");
        _;
    }

    modifier onlyMemberAdmin() {
        require(
            adminMappings[AdminType.Membership][msg.sender],
            "Not member admin"
        );
        _;
    }

    modifier onlyEventAdmin() {
        require(adminMappings[AdminType.Event][msg.sender], "Not Event admin");
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
