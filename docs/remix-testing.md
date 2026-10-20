# Kiểm thử thủ công trên Remix VM

Bộ kiểm thử đầy đủ chạy bằng `npm test` (xem [test-results.md](test-results.md)). Tài liệu này hướng dẫn chạy tay một kịch bản ngắn trên Remix VM để chụp ảnh minh họa cho báo cáo. Không cần MetaMask hay tRBTC.

## 1. Chuẩn bị

1. Mở https://remix.ethereum.org, tạo file `BatchRegistry.sol` và dán nội dung [contracts/BatchRegistry.sol](../contracts/BatchRegistry.sol).
   - Hoặc chạy `npx @remix-project/remixd -s ./contracts --remix-ide https://remix.ethereum.org` ở thư mục repo, rồi chọn *Connect to localhost* trong Remix.
2. Tab **Solidity Compiler**: chọn compiler `0.8.19`. Mở *Advanced Configurations*, đặt **EVM version** là `paris`. Bấm *Compile*.
3. Tab **Deploy & Run Transactions**: Environment chọn **Remix VM**. Remix có sẵn nhiều account; quy ước dùng 5 account đầu:

| Account | Vai trò | Giá trị enum `Role` |
|---|---|---|
| #1 | Admin (ví deploy) | 1 |
| #2 | Manufacturer | 2 |
| #3 | Inspector | 3 |
| #4 | Importer | 4 |
| #5 | Receiver | 5 |

4. Chọn account #1, bấm **Deploy**.

Mỗi lần gọi hàm, đổi ô *Account* sang đúng ví của bước đó trước khi bấm nút. Giá trị enum `Status`: 1 Registered, 2 Tested, 3 Rejected, 4 Imported, 5 InTransfer, 6 Received, 7 Released, 8 Quarantined.

## 2. Dữ liệu mẫu

Hash hồ sơ dùng giá trị giả lập (trong DApp đây sẽ là SHA-256 của file thật):

| Hồ sơ | `docHash` |
|---|---|
| Hồ sơ pháp lý | `0x1111111111111111111111111111111111111111111111111111111111111111` |
| COA | `0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1` |
| Phiếu kiểm nghiệm | `0xf6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6` |
| Tờ khai hải quan | `0xc4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4` |
| Phiếu giao hàng | `0xd2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2` |
| Biên bản nhận hàng | `0xe8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8` |
| Phiếu kiểm tra tại nơi nhận | `0xb7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7` |

Ngày tháng nhập dạng Unix timestamp (giây):

| Ngày | Timestamp |
|---|---|
| 01/09/2026 (ngày sản xuất) | `1788220800` |
| 05/09/2026 (kiểm nghiệm) | `1788566400` |
| 15/09/2026 (nhập khẩu) | `1789430400` |
| 24/09/2026 (kiểm tra tại nơi nhận) | `1790208000` |
| 01/09/2029 (hạn dùng) | `1882915200` |

## 3. Kịch bản: lô Penicillin G potassium đi trọn quy trình

Copy địa chỉ của từng account bằng nút copy cạnh ô *Account*.

| # | Account | Hàm | Tham số | Kết quả mong đợi | Ứng với |
|---|---|---|---|---|---|
| 1 | #1 | `grantRole` | `<địa chỉ #2>`, `2`, `Công ty Hóa dược ABC`, `<hash pháp lý>` | Thành công, log có event `RoleGranted` | TC02 |
| 2 | #1 | `grantRole` | Lần lượt cho #3 (`3`, `Trung tâm kiểm nghiệm Beta`), #4 (`4`, `Công ty nhập khẩu Gamma`), #5 (`5`, `Nhà máy dược Delta`) | Thành công | |
| 3 | #3 | `registerBatch` | `PEN-K-20260901-001`, `Penicillin G potassium`, `1788220800`, `1882915200`, `Nơi khô mát, dưới 25 độ C`, `<địa chỉ #4>`, `<hash COA>` | **Bị từ chối**: `BR: wrong role` (Inspector không được đăng ký lô) | TC09 |
| 4 | #2 | `registerBatch` | Như bước 3 | Thành công, event `BatchRegistered` | TC08 |
| 5 | #2 | `registerBatch` | Như bước 3 (lặp lại) | **Bị từ chối**: `BR: batchNo used` | TC10 |
| 6 | (bất kỳ) | `getBatch` | `1` | `status` = 1, `holder` = địa chỉ #2 | |
| 7 | #3 | `recordTestResult` | `1`, `true`, `KN-0932`, `1788566400`, `<hash phiếu kiểm nghiệm>` | Thành công, `status` = 2 | TC15 |
| 8 | #3 | `recordTestResult` | Như bước 7 (lặp lại) | **Bị từ chối**: `BR: wrong status` (chỉ ghi một lần) | TC17 |
| 9 | #4 | `recordImport` | `1`, `Ấn Độ`, `105123456789`, `1789430400`, `<hash tờ khai>` | Thành công, `status` = 4, `holder` = #4 | TC19 |
| 10 | #4 | `initiateTransfer` | `1`, `<địa chỉ #3>`, `<hash phiếu giao hàng>` | **Bị từ chối**: `BR: not receiver` (#3 là Inspector) | TC23 |
| 11 | #4 | `initiateTransfer` | `1`, `<địa chỉ #5>`, `<hash phiếu giao hàng>` | Thành công, `status` = 5 | TC22 |
| 12 | #5 | `confirmTransfer` | `1`, `<hash biên bản nhận hàng>` | Thành công, `status` = 6, `holder` = #5 | TC24 |
| 13 | #5 | `recordReceivingInspection` | `1`, `true`, `QC-DELTA-0457`, `1790208000`, `<hash phiếu kiểm tra>` | Thành công, `status` = 7 (Released) | TC26 |
| 14 | (bất kỳ) | `getBatches` | `1`, `10` | Mảng 1 lô, `status` = 7 | TC34 |

Lý do bị từ chối hiện ở cửa sổ terminal phía dưới Remix, dòng `revert ... reason provided by the contract: "BR: ..."`.

## 4. Ảnh cần chụp cho báo cáo

- Tab Compiler: compiler 0.8.19, EVM version `paris`, biên dịch thành công.
- Bước 4: giao dịch `registerBatch` thành công, mở rộng log để thấy event `BatchRegistered`.
- Bước 5 hoặc bước 10: giao dịch bị từ chối kèm thông báo `BR: ...`.
- Bước 13: giao dịch `recordReceivingInspection` thành công.
- Bước 14: kết quả `getBatches` với trạng thái cuối của lô.

Lưu ảnh vào [docs/screenshots/](screenshots/).

## 5. Không làm được trên Remix VM

Remix VM không tua được thời gian, nên các ca về hạn dùng (TC29–TC31) chỉ kiểm tra bằng `npm test`. Khi demo trên RSK Testnet, có thể đăng ký một lô có hạn dùng cách hiện tại vài phút để thấy contract từ chối (`BR: expired`).
