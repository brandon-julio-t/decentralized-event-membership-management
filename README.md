# Sample Hardhat Project

## Tasks

- [x] Member/any wallet bisa register(), ada member tier, Regular, Gold, VIP dengan beda nominal Eth untuk register. Register langsung bayar registrationFee.
- [x] Membership active kalau sudah di approveRegistration() by admin, kalau di reject, Eth di refund.
- [x] Manager manage siapa aja yang merupakan membership admin dan event admin
- [x] Membership fee per tier bisa diubah oleh Manager dengan setFee() dan membership akan berlaku selama 1 bulan
- [x] Tambahin function isMember() buat cek status membership
- [x] Event admin bisa createEvent() dan cancelEvent() dengan kuota attendee.
- [x] Hanya member yang bisa registerEvent() dan hanya bisa selama ada kuota.
- [x] Mau lebih susah? 50% kuota untuk early access VIP (ada earlyAccessDuration di struct eventDetails). Kalau ada sisa dari 50% itu, bisa dibagi ke Regular dan Gold.

## Description

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.ts
```
