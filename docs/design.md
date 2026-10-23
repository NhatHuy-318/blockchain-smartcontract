# Biên bản chốt thiết kế (T01)

Tài liệu này chốt các quyết định thiết kế trước khi viết contract và DApp. Nếu cần đổi một quyết định, sửa tại đây trước rồi mới sửa code.

Trạng thái: **bản nháp, chờ cả nhóm xác nhận.**

## 1. Tóm tắt các quyết định

| # | Vấn đề | Quyết định |
|---|---|---|
| D1 | Thứ tự kiểm nghiệm và nhập khẩu | Kiểm nghiệm trước, nhập khẩu sau. Chỉ lô `Tested` mới được nhập khẩu |
| D2 | Chỉ định Importer | Manufacturer chỉ định ví Importer ngay khi đăng ký lô (Bước 1) |
| D3 | Chỉ định Receiver | Importer chỉ định ví Receiver khi khởi tạo chuyển giao (Bước 4) |
| D4 | Inspector | Không chỉ định đích danh; ví nào có vai trò Inspector cũng ghi được |
| D5 | Hàm băm | SHA-256, tính trong trình duyệt bằng Web Crypto API, lưu dạng `bytes32` |
| D6 | Số hash mỗi bước | **Một hash mỗi bước.** Nếu một bước có nhiều giấy tờ, nhóm gộp thành một file PDF hoặc ZIP rồi mới băm |
| D7 | Ghi lại kết quả kiểm nghiệm | **Chỉ ghi một lần**, cả ở Bước 2 và Bước 6. Mục 3.4.2 của proposal cần sửa lại cho khớp trong báo cáo cuối kỳ |
| D8 | Hạn dùng | **Contract kiểm tra hạn dùng** (xem mục 5) |
| D9 | Phân quyền ví | **Mỗi ví giữ đúng một vai trò; Admin được thu hồi vai trò** |
| D10 | Admin | Ví deploy contract là Admin duy nhất. Không cấp thêm Admin, không tự thu hồi |
| D11 | Định danh lô | `batchId` là số tự tăng từ 1 do contract cấp; `batchNo` là số lô do nhà sản xuất đặt, không được trùng. `batchNo` chỉ gồm A–Z, 0–9 và `- _ / .`, tối đa 32 ký tự (T13); DApp tự đổi sang chữ hoa trước khi gửi |
| D12 | Ngày tháng | Unix timestamp tính bằng giây (`uint64`), DApp tự đổi sang ngày giờ Việt Nam khi hiển thị. Ngày do người dùng nhập (sản xuất, kiểm nghiệm, nhập khẩu, kiểm tra) phải khác 0 và không sau thời điểm ghi (T13) |
| D15 | Hủy chuyển giao | Importer đã khởi tạo được hủy chuyển giao đang `InTransfer`, lô quay về `Imported` và giao lại được (T14) |
| D13 | Trình biên dịch | Solidity `0.8.19`, EVM version `paris` (Rootstock chưa hỗ trợ opcode `PUSH0` mà bản 0.8.20 trở lên sinh ra) |
| D14 | Tên vai trò | Dùng `Receiver` thay cho "Distributor/Receiver" trong proposal |

## 2. Vai trò

```solidity
enum Role { None, Admin, Manufacturer, Inspector, Importer, Receiver }
```

- `grantRole` chỉ cấp cho ví đang ở `None`. Muốn đổi vai trò thì thu hồi trước rồi cấp lại.
- `grantRole` không cấp được `Admin`.
- Khi một ví bị thu hồi vai trò, mọi thao tác tiếp theo của ví đó đều bị từ chối, kể cả trên lô mà ví được chỉ định. Lô dừng ở trạng thái hiện tại; mô hình chưa có chức năng chỉ định lại ví khác, trừ trường hợp Receiver bị thu hồi khi lô đang `InTransfer`: Importer hủy chuyển giao rồi giao cho Receiver khác. Nếu Admin cấp lại đúng vai trò cũ cho chính ví đó, ví lại thao tác được trên các lô đã được chỉ định trước đây.
- Viewer không phải một vai trò trong contract: ai cũng đọc được dữ liệu trên chuỗi.

## 3. Trạng thái lô

```solidity
enum Status { None, Registered, Tested, Rejected, Imported, InTransfer, Received, Released, Quarantined }
```

| Từ | Sang | Hàm | Người gọi |
|---|---|---|---|
| (chưa có) | `Registered` | `registerBatch` | Manufacturer |
| `Registered` | `Tested` / `Rejected` | `recordTestResult` | Inspector bất kỳ |
| `Tested` | `Imported` | `recordImport` | Importer được chỉ định |
| `Imported` | `InTransfer` | `initiateTransfer` | Importer được chỉ định |
| `InTransfer` | `Received` | `confirmTransfer` | Receiver được chỉ định |
| `Received` | `Released` / `Quarantined` | `recordReceivingInspection` | Receiver được chỉ định |
| `InTransfer` | `Imported` | `cancelTransfer` (T14) | Importer được chỉ định |

`Rejected`, `Released`, `Quarantined` là trạng thái kết thúc.

**Người đang giữ lô** (`holder`): Manufacturer sau Bước 1, Importer sau Bước 3, Receiver sau Bước 5. Trong lúc `InTransfer`, holder vẫn là Importer.

## 4. Đặc tả hàm

Mọi hàm ghi phải thỏa: đúng vai trò, đúng trạng thái, `docHash` khác 0. Không thỏa thì `revert` và không ghi gì.

| Hàm | Tham số | Điều kiện riêng | Event |
|---|---|---|---|
| `grantRole` | `account`, `role`, `orgName`, `licenseHash` | Chỉ Admin; `account` đang ở `None`; `role` khác `None` và `Admin` | `RoleGranted` |
| `revokeRole` | `account` | Chỉ Admin; `account` có vai trò và không phải Admin | `RoleRevoked` |
| `registerBatch` | `batchNo`, `materialName`, `mfgDate`, `expiryDate`, `storageConditions`, `importer`, `docHash` | `batchNo` đúng định dạng (D11) và chưa dùng; `mfgDate < expiryDate`; `mfgDate` hợp lệ (D12); chưa hết hạn; `importer` có vai trò Importer | `BatchRegistered` |
| `recordTestResult` | `batchId`, `passed`, `reportNo`, `testDate`, `docHash` | Lô `Registered`; `testDate` hợp lệ; nếu `passed` thì lô chưa hết hạn | `BatchTested` |
| `recordImport` | `batchId`, `originCountry`, `customsDeclNo`, `importDate`, `docHash` | Lô `Tested`; người gọi là Importer được chỉ định; `importDate` hợp lệ; chưa hết hạn | `BatchImported` |
| `initiateTransfer` | `batchId`, `receiver`, `docHash` | Lô `Imported`; người gọi là Importer được chỉ định; `receiver` có vai trò Receiver; chưa hết hạn | `TransferInitiated` |
| `confirmTransfer` | `batchId`, `docHash` | Lô `InTransfer`; người gọi là Receiver được chỉ định | `TransferConfirmed` |
| `cancelTransfer` | `batchId`, `docHash` (hash biên bản hủy) | Lô `InTransfer`; người gọi là Importer được chỉ định. Lô về `Imported`, xóa Receiver | `TransferCancelled` |
| `recordReceivingInspection` | `batchId`, `passed`, `reportNo`, `inspectDate`, `docHash` | Lô `Received`; người gọi là Receiver được chỉ định; `inspectDate` hợp lệ; nếu `passed` thì lô chưa hết hạn | `ReceivingInspected` |
| `getBatch` | `batchId` | Đọc, không tốn phí | |
| `getBatchCount` | | Đọc, không tốn phí | |
| `getBatches` | `fromId`, `count` | Đọc một trang lô (tối đa `count` lô, bắt đầu từ `fromId`); trả mảng rỗng nếu `fromId` = 0 hoặc vượt số lô. DApp nên đọc khoảng 50 lô mỗi trang | |
| `getBatchIdByNo` | `batchNo` | Tra `batchId` theo số lô, trả 0 nếu chưa có. Số lô luôn là chữ hoa nên DApp đổi chuỗi tìm kiếm sang chữ hoa trước khi tra | |
| `isExpired` | `batchId` | Lô đã hết hạn hay chưa | |
| `getRole` | `account` | Đọc, DApp dùng để hiển thị vai trò | |

### Dữ liệu lưu trong storage

Chỉ những gì contract cần để kiểm tra điều kiện:

```solidity
struct Batch {
    uint256 id;
    string  batchNo;
    address manufacturer;
    address importer;
    address receiver;   // 0x0 cho tới Bước 4
    address holder;
    Status  status;
    uint64  expiryDate;
    uint64  createdAt;
}
```

Các thông tin còn lại (tên nguyên liệu, điều kiện bảo quản, số phiếu, nước xuất xứ, số tờ khai, ngày từng bước, hash hồ sơ) chỉ nằm trong event.

### Event

Mọi event có `batchId` (trừ hai event vai trò) và `docHash` ở dạng `indexed`, để DApp lọc được theo lô và tìm được lô từ một file (chức năng tìm theo hash). Mọi event có thêm trường `at` (thời điểm khối) để DApp không phải truy vấn khối.

## 5. Quy tắc hạn dùng

Lô **hết hạn** khi `block.timestamp > expiryDate`.

| Thao tác | Lô đã hết hạn |
|---|---|
| Đăng ký lô | Từ chối |
| Ghi kiểm nghiệm **Đạt** (Bước 2) | Từ chối |
| Ghi kiểm nghiệm **Không đạt** (Bước 2) | Cho phép, lô sang `Rejected` |
| Nhập khẩu, khởi tạo chuyển giao | Từ chối |
| Xác nhận tiếp nhận (Bước 5) | **Cho phép**, vì hàng đã đến nơi thật |
| Hủy chuyển giao | Cho phép |
| Kiểm tra tại nơi nhận **Đạt** (Bước 6) | Từ chối |
| Kiểm tra tại nơi nhận **Không đạt** (Bước 6) | Cho phép, lô sang `Quarantined` |

Lý do: chặn mọi bước đẩy lô tiến lên. Lô hết hạn ở `Registered` vẫn có lối ra `Rejected`, lô đang `InTransfer` hoặc `Received` có lối ra `Quarantined`.

Lô hết hạn khi đang ở `Tested` hoặc `Imported` thì **dừng tại chỗ**: không nhập khẩu, không giao đi được và không có trạng thái kết thúc riêng (rà soát ở T13). Nhóm chấp nhận điều này vì trên thực tế lô nằm lại kho và bị tiêu hủy ngoài hệ thống; DApp hiển thị nhãn "Đã hết hạn" để người xem biết lô không còn đi tiếp.

Khi demo, đặt `expiryDate` của một lô mẫu cách hiện tại vài phút để thấy contract từ chối.

## 6. Chia dữ liệu on-chain và off-chain

| Ở đâu | Nội dung |
|---|---|
| Storage contract | Struct `Batch`, vai trò của từng ví, bảng tra `batchNo` đã dùng |
| Event | Toàn bộ thông tin từng bước và hash hồ sơ |
| JSON Server | Siêu dữ liệu để tìm kiếm: `batchId`, `batchNo`, tên nguyên liệu, tên đơn vị, ghi chú, mã giao dịch. Chỉ ghi sau khi giao dịch thành công. Trạng thái lô luôn đọc lại từ chuỗi, không lưu ở đây |
| Máy của từng bên | File hồ sơ gốc (trong demo: thư mục `sample-docs/`) |

## 7. Thông báo lỗi

Contract dùng `require` với thông điệp ngắn bằng tiếng Anh, tiền tố `BR:` (ví dụ `BR: not inspector`, `BR: wrong status`, `BR: expired`). DApp đổi các thông điệp này sang câu tiếng Việt dễ hiểu (T26).

| Thông điệp | Ý nghĩa | Gợi ý câu hiển thị trên DApp |
|---|---|---|
| `BR: not admin` | Người gọi không phải Admin | Chỉ Admin được thực hiện thao tác này |
| `BR: wrong role` | Người gọi không có vai trò cần thiết | Ví của bạn không có quyền thực hiện bước này |
| `BR: zero address` | Địa chỉ ví bằng 0 | Địa chỉ ví không hợp lệ |
| `BR: invalid role` | Cấp vai trò `None` hoặc `Admin` | Vai trò không hợp lệ |
| `BR: account has role` | Ví đã có vai trò | Ví này đã có vai trò, cần thu hồi trước khi cấp vai trò mới |
| `BR: empty org name` | Tên đơn vị rỗng | Vui lòng nhập tên đơn vị |
| `BR: no role` | Thu hồi ví chưa có vai trò | Ví này chưa có vai trò nào |
| `BR: cannot revoke admin` | Thu hồi vai trò Admin | Không thể thu hồi vai trò Admin |
| `BR: zero hash` | Chưa chọn file hồ sơ hoặc hash bằng 0 | Vui lòng chọn file hồ sơ |
| `BR: batch not found` | Mã lô không tồn tại | Không tìm thấy lô |
| `BR: wrong status` | Lô không ở trạng thái cho phép bước này | Lô chưa đến bước này hoặc đã qua bước này |
| `BR: empty batchNo` | Số lô rỗng | Vui lòng nhập số lô |
| `BR: empty material` | Tên nguyên liệu rỗng | Vui lòng nhập tên nguyên liệu |
| `BR: batchNo used` | Số lô đã được đăng ký | Số lô này đã được đăng ký |
| `BR: invalid dates` | Ngày sản xuất không trước hạn dùng | Ngày sản xuất phải trước hạn dùng |
| `BR: expired` | Lô đã hết hạn | Lô đã hết hạn sử dụng |
| `BR: not importer` | Ví được chỉ định làm Importer không có vai trò Importer | Ví nhập khẩu được chọn không có vai trò Importer |
| `BR: empty reportNo` | Số phiếu kiểm nghiệm rỗng | Vui lòng nhập số phiếu kiểm nghiệm |
| `BR: not designated` | Người gọi không phải Importer/Receiver được chỉ định cho lô | Lô này không được chỉ định cho đơn vị của bạn |
| `BR: empty origin` | Nước xuất xứ rỗng | Vui lòng nhập nước xuất xứ |
| `BR: empty customsDeclNo` | Số tờ khai hải quan rỗng | Vui lòng nhập số tờ khai hải quan |
| `BR: not receiver` | Ví được chọn làm bên nhận không có vai trò Receiver | Ví bên nhận được chọn không có vai trò Receiver |
| `BR: invalid batchNo` | Số lô có ký tự ngoài A–Z, 0–9, `- _ / .` hoặc dài quá 32 ký tự | Số lô chỉ gồm chữ in hoa, số và các ký tự - _ / . (tối đa 32 ký tự) |
| `BR: invalid date` | Ngày nhập bằng 0 hoặc sau thời điểm ghi | Ngày không hợp lệ: không được để trống hoặc chọn ngày trong tương lai |

## 8. Việc cần làm sau khi chốt

- Cả nhóm đọc và xác nhận tài liệu này.
- Ca kiểm thử của T12 cần bao phủ thêm Bước 6, thu hồi vai trò và các quy tắc hạn dùng ở mục 5.
- Khi viết báo cáo cuối kỳ (T40): sửa mục 3.4.2 của proposal theo D7, thêm `revokeRole` và quy tắc hạn dùng vào phần thiết kế.
