# Kết quả kiểm thử smart contract (T12)

File này do `npm run test:report` tự sinh từ lần chạy thật; không sửa tay.

- Ngày chạy: 23/10/2026
- Trình biên dịch: 0.8.19+commit.7dd6d404.Emscripten.clang, EVM `paris`; bytecode runtime 20142 byte; không có opcode PUSH0
- Môi trường: chuỗi giả lập cục bộ Ganache, mỗi nhóm kiểm thử chạy trên một chuỗi mới
- Tổng cộng: **172/172** kiểm tra đạt; **37/37** ca kiểm thử đại diện đạt

## Ca kiểm thử đại diện

| Mã | Nhóm | Ca kiểm thử | Kết quả mong đợi | Kết quả |
|---|---|---|---|---|
| TC01 | Bước 0: Phân quyền | ví deploy là Admin và có vai trò Admin | Ví deploy contract là Admin | Đạt |
| TC02 | Bước 0: Phân quyền | Admin cấp vai trò Manufacturer, event RoleGranted có tên đơn vị và hash hồ sơ | Ví có vai trò Manufacturer; event RoleGranted đúng dữ liệu | Đạt |
| TC03 | Bước 0: Phân quyền | ví không phải Admin cấp vai trò | Từ chối: BR: not admin | Đạt |
| TC04 | Bước 0: Phân quyền | cấp vai trò thứ hai cho ví đã có vai trò | Từ chối: BR: account has role | Đạt |
| TC05 | Bước 0: Phân quyền | cấp vai trò Admin | Từ chối: BR: invalid role | Đạt |
| TC06 | Bước 0: Phân quyền | thu hồi vai trò: event RoleRevoked, ví về None | Ví về None; mọi thao tác sau đó bị từ chối (BR: wrong role) | Đạt |
| TC07 | Bước 0: Phân quyền | thu hồi vai trò Admin | Từ chối: BR: cannot revoke admin | Đạt |
| TC08 | Bước 1: Đăng ký lô | Manufacturer đăng ký lô hợp lệ: trạng thái Registered, người giữ là Manufacturer, event đủ 10 trường | batchId = 1; trạng thái Registered; event BatchRegistered đủ dữ liệu | Đạt |
| TC09 | Bước 1: Đăng ký lô | Inspector đăng ký lô | Từ chối: BR: wrong role | Đạt |
| TC10 | Bước 1: Đăng ký lô | trùng số lô | Từ chối: BR: batchNo used | Đạt |
| TC11 | Bước 1: Đăng ký lô | ngày sản xuất bằng hạn dùng | Từ chối: BR: invalid dates | Đạt |
| TC12 | Bước 1: Đăng ký lô | hạn dùng đã qua | Từ chối: BR: expired | Đạt |
| TC13 | Bước 1: Đăng ký lô | Importer chỉ định là ví Receiver | Từ chối: BR: not importer | Đạt |
| TC14 | Bước 1: Đăng ký lô | hash COA bằng 0 | Từ chối: BR: zero hash | Đạt |
| TC15 | Bước 2: Kiểm nghiệm | kiểm nghiệm Đạt: Registered sang Tested, event BatchTested đủ trường | Trạng thái Tested; event BatchTested đúng dữ liệu | Đạt |
| TC16 | Bước 2: Kiểm nghiệm | kiểm nghiệm Không đạt (Inspector khác): Registered sang Rejected | Trạng thái Rejected (kết thúc) | Đạt |
| TC17 | Bước 2: Kiểm nghiệm | ghi lại kết quả cho lô đã Tested | Từ chối: BR: wrong status | Đạt |
| TC18 | Bước 2: Kiểm nghiệm | Manufacturer ghi kết quả kiểm nghiệm | Từ chối: BR: wrong role | Đạt |
| TC19 | Bước 3: Nhập khẩu | Importer được chỉ định nhập khẩu lô Tested: sang Imported, người giữ là Importer | Trạng thái Imported; người giữ lô là Importer; event BatchImported đúng dữ liệu | Đạt |
| TC20 | Bước 3: Nhập khẩu | nhập khẩu lô chưa kiểm nghiệm (Registered) | Từ chối: BR: wrong status | Đạt |
| TC21 | Bước 3: Nhập khẩu | Importer khác không được chỉ định | Từ chối: BR: not designated | Đạt |
| TC22 | Bước 4–5: Chuyển giao | Importer khởi tạo chuyển giao: sang InTransfer, ghi Receiver, người giữ vẫn là Importer | Trạng thái InTransfer; Receiver được ghi nhận; event TransferInitiated | Đạt |
| TC23 | Bước 4–5: Chuyển giao | bên nhận là ví Importer | Từ chối: BR: not receiver | Đạt |
| TC24 | Bước 4–5: Chuyển giao | Receiver được chỉ định xác nhận: sang Received, người giữ là Receiver | Trạng thái Received; người giữ lô là Receiver; event TransferConfirmed | Đạt |
| TC25 | Bước 4–5: Chuyển giao | Receiver khác không được chỉ định | Từ chối: BR: not designated | Đạt |
| TC26 | Bước 6: Kiểm tra tại nơi nhận | kiểm tra tại nơi nhận Đạt: Received sang Released | Trạng thái Released (được đưa vào sử dụng); event ReceivingInspected | Đạt |
| TC27 | Bước 6: Kiểm tra tại nơi nhận | kiểm tra tại nơi nhận Không đạt: Received sang Quarantined | Trạng thái Quarantined (biệt trữ, kết thúc) | Đạt |
| TC28 | Bước 6: Kiểm tra tại nơi nhận | ghi lại kết quả cho lô đã Released | Từ chối: BR: wrong status | Đạt |
| TC29 | Quy tắc hạn dùng | lô hết hạn: không ghi được Đạt ở Bước 2, ghi Không đạt thì sang Rejected | Ghi Đạt bị từ chối (BR: expired); ghi Không đạt được, lô sang Rejected | Đạt |
| TC30 | Quy tắc hạn dùng | lô hết hạn: nhập khẩu | Nhập khẩu và khởi tạo chuyển giao bị từ chối (BR: expired) | Đạt |
| TC31 | Quy tắc hạn dùng | lô hết hạn khi đang vận chuyển: xác nhận tiếp nhận được, Bước 6 chỉ ghi được Không đạt (Quarantined) | Xác nhận tiếp nhận được; Bước 6 ghi Đạt bị từ chối, ghi Không đạt thì sang Quarantined | Đạt |
| TC32 | Truy xuất và hàm đọc | vòng đời lô PEN-K-20260901-001: đủ 6 event theo đúng thứ tự, mỗi event mang đúng hash hồ sơ của bước | 6 event từ BatchRegistered tới ReceivingInspected, đúng thứ tự và đúng hash | Đạt |
| TC33 | Truy xuất và hàm đọc | tìm theo hash tờ khai: ra đúng lô và đúng bước | Tìm thấy lô PEN-K-20260901-001 ở bước BatchImported | Đạt |
| TC34 | Truy xuất và hàm đọc | phân trang 4 + 4 + 1: các trang nối nhau, không trùng, không sót | 3 trang nối đủ 9 lô, không trùng, không sót | Đạt |
| TC35 | Bước 4–5: Chuyển giao | Receiver bị thu hồi, Importer hủy chuyển giao: lô về Imported, xóa Receiver, người giữ vẫn là Importer | Trạng thái quay về Imported; event TransferCancelled ghi Receiver cũ | Đạt |
| TC36 | Bước 1: Đăng ký lô | số lô có chữ thường | Từ chối: BR: invalid batchNo (chặn trùng lô khác nhau chỉ ở chữ hoa/thường) | Đạt |
| TC37 | Bước 1: Đăng ký lô | ngày sản xuất = 0 | Từ chối: BR: invalid date (ngày bằng 0 hoặc trong tương lai) | Đạt |

## Số kiểm tra theo nhóm

| Nhóm | Số kiểm tra | Đạt |
|---|---|---|
| Bước 0: Phân quyền | 16 | 16 |
| Bước 1: Đăng ký lô | 29 | 29 |
| Bước 2: Kiểm nghiệm | 19 | 19 |
| Bước 3: Nhập khẩu | 19 | 19 |
| Bước 4–5: Chuyển giao | 44 | 44 |
| Bước 6: Kiểm tra tại nơi nhận | 21 | 21 |
| Quy tắc hạn dùng | 10 | 10 |
| Truy xuất và hàm đọc | 14 | 14 |
