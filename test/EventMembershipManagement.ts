import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';
import { expect } from 'chai';
import hre from 'hardhat';
import { getAddress } from 'viem';

enum AdminType {
  Membership,
  Event,
}

enum MembershipTier {
  Regular,
  Gold,
  Vip,
}

/*
- [x] Member/any wallet bisa register(), ada member tier, Regular, Gold, VIP dengan beda nominal Eth untuk register. Register langsung bayar registrationFee.
- [x] Membership active kalau sudah di approveRegistration() by admin, kalau di reject, Eth di refund.
- [x] Manager manage siapa aja yang merupakan membership admin dan event admin
- [x] Membership fee per tier bisa diubah oleh Manager dengan setFee() dan membership akan berlaku selama 1 bulan
- [x] Tambahin function isMember() buat cek status membership
- [ ] Event admin bisa createEvent() dan cancelEvent() dengan kuota attendee.
- [ ] Hanya member yang bisa registerEvent() dan hanya bisa selama ada kuota.
- [ ] Mau lebih susah? 50% kuota untuk early access VIP (ada earlyAccessDuration di struct eventDetails). Kalau ada sisa dari 50% itu, bisa dibagi ke Regular dan Gold.
*/

describe('EventMembershipManagement', () => {
  async function fixtureFn() {
    const [owner, membershipAdmin1, membershipAdmin2, eventAdmin1, eventAdmin2, member1] =
      await hre.viem.getWalletClients();

    const eventMembershipManagement = await hre.viem.deployContract('EventMembershipManagement');

    const publicClient = await hre.viem.getPublicClient();

    await eventMembershipManagement.write.setAdmin([
      AdminType.Membership,
      getAddress(membershipAdmin2.account.address),
      true,
    ]);

    await eventMembershipManagement.write.setAdmin([AdminType.Event, getAddress(eventAdmin2.account.address), true]);

    const eventMembershipManagementAsMember = await hre.viem.getContractAt(
      'EventMembershipManagement',
      eventMembershipManagement.address,
      { client: { wallet: member1 } }
    );

    const eventMembershipManagementAsMemberAdmin = await hre.viem.getContractAt(
      'EventMembershipManagement',
      eventMembershipManagement.address,
      { client: { wallet: membershipAdmin2 } }
    );

    return {
      owner,
      eventMembershipManagement,
      eventMembershipManagementAsMember,
      eventMembershipManagementAsMemberAdmin,
      publicClient,
      membershipAdmin1,
      membershipAdmin2,
      eventAdmin1,
      eventAdmin2,
      member1,
    };
  }

  describe('Deployment', function () {
    it('should initiate data correctly', async function () {
      const { eventMembershipManagement, owner } = await loadFixture(fixtureFn);

      expect(await eventMembershipManagement.read.owner()).to.equal(getAddress(owner.account.address));

      expect(await eventMembershipManagement.read.getFee([MembershipTier.Regular])).to.equal(1n);
      expect(await eventMembershipManagement.read.getFee([MembershipTier.Gold])).to.equal(2n);
      expect(await eventMembershipManagement.read.getFee([MembershipTier.Vip])).to.equal(3n);
    });
  });

  describe('Manager (Owner)', () => {
    describe('Manager manage siapa aja yang merupakan membership admin dan event admin', () => {
      it('can add admin', async () => {
        const { eventMembershipManagement, membershipAdmin1, eventAdmin1 } = await loadFixture(fixtureFn);

        const dataset = [
          {
            adminAddr: membershipAdmin1,
            adminType: AdminType.Event,
          },
          {
            adminAddr: eventAdmin1,
            adminType: AdminType.Membership,
          },
        ];

        for (const { adminAddr, adminType } of dataset) {
          const address = getAddress(adminAddr.account.address);
          const isActive = true;

          expect(await eventMembershipManagement.read.isAdmin([adminType, address])).to.equal(!isActive);

          await eventMembershipManagement.write.setAdmin([adminType, address, isActive]);

          const setAdminEvents = await eventMembershipManagement.getEvents.SetAdmin();

          expect(await eventMembershipManagement.read.isAdmin([adminType, address])).to.equal(isActive);

          expect(setAdminEvents).to.have.lengthOf(1);
          expect(setAdminEvents[0].args.adminType).to.equal(adminType);
          expect(setAdminEvents[0].args.user).to.equal(address);
          expect(setAdminEvents[0].args.isActive).to.equal(isActive);
        }
      });

      it('cannot set admin 2x in a row', async () => {
        const { eventMembershipManagement, membershipAdmin1 } = await loadFixture(fixtureFn);

        const address = getAddress(membershipAdmin1.account.address);
        const isActive = true;

        await expect(eventMembershipManagement.write.setAdmin([AdminType.Membership, address, isActive])).not.to.be
          .rejected;

        await expect(
          eventMembershipManagement.write.setAdmin([AdminType.Membership, address, isActive])
        ).to.be.rejectedWith('Admin already active');

        await expect(eventMembershipManagement.write.setAdmin([AdminType.Membership, address, !isActive])).not.to.be
          .rejected;

        await expect(
          eventMembershipManagement.write.setAdmin([AdminType.Membership, address, !isActive])
        ).to.be.rejectedWith('Admin already inactive');
      });
    });

    describe('Membership fee per tier bisa diubah oleh Manager dengan setFee() dan membership akan berlaku selama 1 bulan', () => {
      it('allows manager to set fee', async () => {
        const { eventMembershipManagement } = await loadFixture(fixtureFn);

        const tier = MembershipTier.Gold;
        const newFee = 10n;

        await eventMembershipManagement.write.setFee([tier, newFee]);

        const events = await eventMembershipManagement.getEvents.SetFee();

        expect(await eventMembershipManagement.read.getFee([tier])).to.equal(newFee);

        expect(events).to.have.lengthOf(1);
        expect(events[0].args.fee).to.equal(newFee);
        expect(events[0].args.membershipTier).to.equal(tier);
      });

      it('rejects same fee', async () => {
        const { eventMembershipManagement } = await loadFixture(fixtureFn);

        const tier = MembershipTier.Gold;
        const newFee = 10n;

        await expect(eventMembershipManagement.write.setFee([tier, newFee])).not.to.be.rejected;
        await expect(eventMembershipManagement.write.setFee([tier, newFee])).to.be.rejectedWith(
          'New fee must be different from previous fee'
        );
      });
    });
  });

  describe('Member', () => {
    describe('Member/any wallet bisa register(), ada member tier, Regular, Gold, VIP dengan beda nominal Eth untuk register. Register langsung bayar registrationFee.', () => {
      it('can register properly and only once', async () => {
        const { eventMembershipManagement, member1, publicClient } = await loadFixture(fixtureFn);

        const eventMembershipManagementAsMember = await hre.viem.getContractAt(
          'EventMembershipManagement',
          eventMembershipManagement.address,
          { client: { wallet: member1 } }
        );

        expect(await eventMembershipManagementAsMember.read.isMember([getAddress(member1.account.address)])).to.be
          .false;

        const tier = MembershipTier.Gold;
        const registrationFee = 2n;

        await eventMembershipManagementAsMember.write.register([tier], { value: registrationFee });

        expect(await publicClient.getBalance({ address: eventMembershipManagementAsMember.address })).to.equal(
          registrationFee
        );

        const events = await eventMembershipManagementAsMember.getEvents.RegisterSuccess();
        expect(events).to.have.lengthOf(1);
        expect(events[0].args.registrationFee).to.equal(registrationFee);
        expect(events[0].args.tier).to.equal(tier);
      });

      it('rejects if registration fee is wrong', async () => {
        const { eventMembershipManagement, member1 } = await loadFixture(fixtureFn);

        const eventMembershipManagementAsMember = await hre.viem.getContractAt(
          'EventMembershipManagement',
          eventMembershipManagement.address,
          { client: { wallet: member1 } }
        );

        await expect(
          eventMembershipManagementAsMember.write.register([MembershipTier.Gold], { value: 0n })
        ).to.be.rejectedWith('Incorrect registration fee');
      });
    });
  });

  describe('Admin Membership', () => {
    describe('Membership active kalau sudah di approveRegistration() by admin, kalau di reject, Eth di refund.', () => {
      it('can approve registration', async () => {
        const { eventMembershipManagementAsMember, eventMembershipManagementAsMemberAdmin, member1 } =
          await loadFixture(fixtureFn);

        expect(await eventMembershipManagementAsMember.read.isMember([getAddress(member1.account.address)])).to.be
          .false;

        const tier = MembershipTier.Gold;
        const registrationFee = 2n;

        await eventMembershipManagementAsMember.write.register([tier], { value: registrationFee });

        await eventMembershipManagementAsMemberAdmin.write.approveRegistration([getAddress(member1.account.address)]);

        await expect(
          eventMembershipManagementAsMember.write.approveRegistration([getAddress(member1.account.address)])
        ).to.be.rejectedWith('Not member admin');

        expect(await eventMembershipManagementAsMember.read.isMember([getAddress(member1.account.address)])).to.be.true;
      });
    });
  });
});
