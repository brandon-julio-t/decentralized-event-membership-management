import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';
import { time } from '@nomicfoundation/hardhat-network-helpers';

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
- [x] Event admin bisa createEvent() dan cancelEvent() dengan kuota attendee.
- [x] Hanya member yang bisa registerEvent() dan hanya bisa selama ada kuota.
- [x] Mau lebih susah? 50% kuota untuk early access VIP (ada earlyAccessDuration di struct eventDetails). Kalau ada sisa dari 50% itu, bisa dibagi ke Regular dan Gold.
*/

describe('EventMembershipManagement', () => {
  const THREE_DAYS_IN_SECONDS = 3 * 24 * 3600;

  async function fixtureFn() {
    const [
      owner,
      membershipAdmin1,
      membershipAdmin2,
      eventAdmin1,
      eventAdmin2,
      member1,
      member2,
      member3,
      member4,
      ...restWalletClients
    ] = await hre.viem.getWalletClients();

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

    const eventMembershipManagementAsMember2 = await hre.viem.getContractAt(
      'EventMembershipManagement',
      eventMembershipManagement.address,
      { client: { wallet: member2 } }
    );

    const eventMembershipManagementAsMember3 = await hre.viem.getContractAt(
      'EventMembershipManagement',
      eventMembershipManagement.address,
      { client: { wallet: member3 } }
    );

    const eventMembershipManagementAsMember4 = await hre.viem.getContractAt(
      'EventMembershipManagement',
      eventMembershipManagement.address,
      { client: { wallet: member4 } }
    );

    const eventMembershipManagementAsMemberAdmin = await hre.viem.getContractAt(
      'EventMembershipManagement',
      eventMembershipManagement.address,
      { client: { wallet: membershipAdmin2 } }
    );

    const eventMembershipManagementAsEventAdmin = await hre.viem.getContractAt(
      'EventMembershipManagement',
      eventMembershipManagement.address,
      { client: { wallet: eventAdmin2 } }
    );

    await eventMembershipManagementAsMember2.write.register([MembershipTier.Regular], { value: 1n });
    await eventMembershipManagementAsMember3.write.register([MembershipTier.Vip], { value: 3n });
    await eventMembershipManagementAsMember4.write.register([MembershipTier.Vip], { value: 3n });

    await eventMembershipManagementAsMemberAdmin.write.approveRegistration([getAddress(member2.account.address)]);
    await eventMembershipManagementAsMemberAdmin.write.approveRegistration([getAddress(member3.account.address)]);
    await eventMembershipManagementAsMemberAdmin.write.approveRegistration([getAddress(member4.account.address)]);

    return {
      owner,
      eventMembershipManagement,
      eventMembershipManagementAsMember,
      eventMembershipManagementAsMemberAdmin,
      eventMembershipManagementAsEventAdmin,
      eventMembershipManagementAsMember2,
      eventMembershipManagementAsMember3,
      eventMembershipManagementAsMember4,
      publicClient,
      membershipAdmin1,
      membershipAdmin2,
      eventAdmin1,
      eventAdmin2,
      member1,
      member2,
      member3,
      member4,
      restWalletClients,
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

        const contractBalanceBefore = await publicClient.getBalance({
          address: eventMembershipManagementAsMember.address,
        });

        await eventMembershipManagementAsMember.write.register([tier], { value: registrationFee });

        expect(await eventMembershipManagementAsMember.read.isMember([getAddress(member1.account.address)])).to.be
          .false;

        const contractBalanceAfter = await publicClient.getBalance({
          address: eventMembershipManagementAsMember.address,
        });
        expect(contractBalanceAfter - contractBalanceBefore).to.equal(registrationFee);

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

    describe('Hanya member yang bisa registerEvent() dan hanya bisa selama ada kuota.', () => {
      it('non-VIP cannot register for event when still in early access', async () => {
        const { eventMembershipManagementAsEventAdmin, eventMembershipManagementAsMember2, publicClient } =
          await loadFixture(fixtureFn);

        const maxQuota = 100n;
        const eventId = 1n;

        {
          const hash = await eventMembershipManagementAsEventAdmin.write.createEvent([maxQuota]);
          await publicClient.waitForTransactionReceipt({ hash });
        }

        await expect(eventMembershipManagementAsMember2.write.registerEvent([eventId])).to.be.rejectedWith(
          'Early access is exclusive to VIP only'
        );
      });

      it('VIP can register for event when still in early access', async () => {
        const { eventMembershipManagementAsEventAdmin, eventMembershipManagementAsMember3, member3, publicClient } =
          await loadFixture(fixtureFn);

        const maxQuota = 100n;
        const eventId = 1n;

        {
          const hash = await eventMembershipManagementAsEventAdmin.write.createEvent([maxQuota]);
          await publicClient.waitForTransactionReceipt({ hash });
        }

        {
          const hash = await eventMembershipManagementAsMember3.write.registerEvent([eventId]);
          await publicClient.waitForTransactionReceipt({ hash });
        }

        const events = await eventMembershipManagementAsMember3.getEvents.RegisterEventSuccess();
        expect(events).to.have.lengthOf(1);
        expect(events[0].args.eventId).to.equals(1n);
        expect(events[0].args.member).to.equals(getAddress(member3.account.address));
      });

      it('non-VIP member can only register after early access', async () => {
        const { eventMembershipManagementAsEventAdmin, eventMembershipManagementAsMember2, member2, publicClient } =
          await loadFixture(fixtureFn);

        const maxQuota = 100n;
        const eventId = 1n;

        {
          const hash = await eventMembershipManagementAsEventAdmin.write.createEvent([maxQuota]);
          await publicClient.waitForTransactionReceipt({ hash });
        }

        await time.increase(THREE_DAYS_IN_SECONDS + 1);

        const registerEventPromise = eventMembershipManagementAsMember2.write.registerEvent([eventId]);

        await expect(registerEventPromise).not.to.be.rejectedWith('Early access is exclusive to VIP only');

        await registerEventPromise;

        const events = await eventMembershipManagementAsMember2.getEvents.RegisterEventSuccess();
        expect(events).to.have.lengthOf(1);
        expect(events[0].args.eventId).to.equals(1n);
        expect(events[0].args.member).to.equals(getAddress(member2.account.address));
      });

      it('cannot register if no more quota', async () => {
        const {
          eventMembershipManagementAsEventAdmin,
          eventMembershipManagementAsMember3,
          eventMembershipManagementAsMember4,
          publicClient,
        } = await loadFixture(fixtureFn);

        const maxQuota = 1n;
        const eventId = 1n;

        {
          const hash = await eventMembershipManagementAsEventAdmin.write.createEvent([maxQuota]);
          await publicClient.waitForTransactionReceipt({ hash });
        }

        {
          const hash = await eventMembershipManagementAsMember3.write.registerEvent([eventId]);
          await publicClient.waitForTransactionReceipt({ hash });
        }

        await expect(eventMembershipManagementAsMember4.write.registerEvent([eventId])).to.be.rejectedWith(
          'No more quota available'
        );
      });

      it('non-VIP cannot register if no more quota', async () => {
        const {
          restWalletClients,
          eventMembershipManagementAsMemberAdmin,
          eventMembershipManagementAsEventAdmin,
          publicClient,
          eventMembershipManagement,
          eventMembershipManagementAsMember2,
        } = await loadFixture(fixtureFn);

        const [vip1, vip2, vip3, vip4] = restWalletClients;

        // vip 1 until 4 takes up all the quota
        const maxQuota = 4n;
        const eventId = 1n;

        {
          const hash = await eventMembershipManagementAsEventAdmin.write.createEvent([maxQuota]);
          await publicClient.waitForTransactionReceipt({ hash });
        }

        await Promise.all(
          [vip1, vip2, vip3, vip4].map(async vip => {
            const contract = await hre.viem.getContractAt(
              'EventMembershipManagement',
              eventMembershipManagement.address,
              { client: { wallet: vip } }
            );

            await contract.write.register([MembershipTier.Vip], { value: 3n });
            await eventMembershipManagementAsMemberAdmin.write.approveRegistration([getAddress(vip.account.address)]);

            await contract.write.registerEvent([eventId]);
          })
        );

        await time.increase(THREE_DAYS_IN_SECONDS);

        await expect(eventMembershipManagementAsMember2.write.registerEvent([eventId])).to.be.rejectedWith(
          'No more quota available'
        );
      });

      it('non-VIP quota is only half of max quota', async () => {
        const {
          eventMembershipManagement,
          eventMembershipManagementAsMemberAdmin,
          eventMembershipManagementAsEventAdmin,
          publicClient,
          restWalletClients,
        } = await loadFixture(fixtureFn);

        const [gold1, gold2, gold3] = restWalletClients;

        // 2 quotas are reserves for VIP
        const maxQuota = 4n;
        const eventId = 1n;

        {
          const hash = await eventMembershipManagementAsEventAdmin.write.createEvent([maxQuota]);
          await publicClient.waitForTransactionReceipt({ hash });
        }

        await time.increase(THREE_DAYS_IN_SECONDS + 1);

        await Promise.all(
          [gold1, gold2, gold3].map(async (walletAccount, idx) => {
            const contract = await hre.viem.getContractAt(
              'EventMembershipManagement',
              eventMembershipManagement.address,
              { client: { wallet: walletAccount } }
            );

            await contract.write.register([MembershipTier.Gold], { value: 2n });
            await eventMembershipManagementAsMemberAdmin.write.approveRegistration([
              getAddress(walletAccount.account.address),
            ]);

            if (walletAccount === gold3) {
              // third non-VIP members is rejected
              // because max quota is 4
              // and non-VIP quota is half of it, which is 2
              await expect(contract.write.registerEvent([eventId])).to.be.rejectedWith('No more quota available');
            } else {
              // first 2 non-VIP members are allowed
              await expect(contract.write.registerEvent([eventId])).not.to.be.rejectedWith('No more quota available');
            }

            return contract;
          })
        );
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

        expect(await eventMembershipManagementAsMember.read.isMember([getAddress(member1.account.address)])).to.be
          .false;

        await eventMembershipManagementAsMemberAdmin.write.approveRegistration([getAddress(member1.account.address)]);

        await expect(
          eventMembershipManagementAsMember.write.approveRegistration([getAddress(member1.account.address)])
        ).to.be.rejectedWith('Not member admin');

        expect(await eventMembershipManagementAsMember.read.isMember([getAddress(member1.account.address)])).to.be.true;
      });
    });

    it('can reject registration', async () => {
      const { eventMembershipManagementAsMember, eventMembershipManagementAsMemberAdmin, member1, publicClient } =
        await loadFixture(fixtureFn);

      expect(await eventMembershipManagementAsMember.read.isMember([getAddress(member1.account.address)])).to.be.false;

      const tier = MembershipTier.Gold;
      const registrationFee = 2n;

      const contractBalanceBefore = await publicClient.getBalance({
        address: getAddress(eventMembershipManagementAsMemberAdmin.address),
      });

      await eventMembershipManagementAsMember.write.register([tier], { value: registrationFee });

      const contractBalanceAfter = await publicClient.getBalance({
        address: getAddress(eventMembershipManagementAsMemberAdmin.address),
      });

      expect(contractBalanceAfter - contractBalanceBefore).to.equal(registrationFee);

      expect(await eventMembershipManagementAsMember.read.isMember([getAddress(member1.account.address)])).to.be.false;

      expect(contractBalanceAfter - contractBalanceBefore).to.equal(registrationFee);
      await eventMembershipManagementAsMemberAdmin.write.rejectRegistration([getAddress(member1.account.address)]);

      expect(await eventMembershipManagementAsMember.read.isMember([getAddress(member1.account.address)])).to.be.false;

      expect(
        await publicClient.getBalance({
          address: getAddress(eventMembershipManagementAsMemberAdmin.address),
        })
      ).to.equal(contractBalanceBefore);
    });
  });

  describe('Admin Event', () => {
    describe('Event admin bisa createEvent() dan cancelEvent() dengan kuota attendee.', () => {
      it('can create & read event', async () => {
        const { eventMembershipManagementAsEventAdmin, publicClient } = await loadFixture(fixtureFn);

        const maxQuota = 100n;

        const hash = await eventMembershipManagementAsEventAdmin.write.createEvent([maxQuota]);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        const block = await publicClient.getBlock({ blockHash: receipt.blockHash });

        const events = await eventMembershipManagementAsEventAdmin.getEvents.CreateEvent();

        expect(events).to.have.lengthOf(1);
        expect(events[0].args.eventId).to.equals(1n);
        expect(events[0].args.maxQuota).to.equals(maxQuota);
        expect(events[0].args.earlyAccessEndsAt).to.equals(block.timestamp + BigInt(3 * 24 * 3600));

        const eventDetail = await eventMembershipManagementAsEventAdmin.read.getEvent([1n]);
        expect(events[0].args.maxQuota).to.equals(eventDetail.maxQuota);
        expect(events[0].args.earlyAccessEndsAt).to.equals(eventDetail.earlyAccessEndsAt);
        expect(eventDetail.cancelledAt).to.equals(0n);
      });

      it('can cancel event', async () => {
        const { eventMembershipManagementAsEventAdmin, publicClient } = await loadFixture(fixtureFn);

        const maxQuota = 100n;

        const createTxhash = await eventMembershipManagementAsEventAdmin.write.createEvent([maxQuota]);
        await publicClient.waitForTransactionReceipt({ hash: createTxhash });

        const cancelTxHash = await eventMembershipManagementAsEventAdmin.write.cancelEvent([1n]);
        const receipt = await publicClient.waitForTransactionReceipt({ hash: cancelTxHash });
        const block = await publicClient.getBlock({ blockHash: receipt.blockHash });

        const events = await eventMembershipManagementAsEventAdmin.getEvents.CancelEvent();

        expect(events).to.have.lengthOf(1);
        expect(events[0].args.eventId).to.equals(1n);
        expect(events[0].args.cancelledAt).to.equals(block.timestamp);

        const eventDetail = await eventMembershipManagementAsEventAdmin.read.getEvent([1n]);
        expect(eventDetail.cancelledAt).to.equals(block.timestamp);
      });
    });
  });
});
