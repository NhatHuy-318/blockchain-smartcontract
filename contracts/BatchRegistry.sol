// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/// @title BatchRegistry: truy xuất nguồn gốc lô nguyên liệu dược phẩm
/// @notice Thiết kế chi tiết: docs/design.md
/// @dev Biên dịch với solc 0.8.19, EVM version "paris" (Rootstock chưa hỗ trợ PUSH0).
contract BatchRegistry {
    // ---------------------------------------------------------------------
    // Kiểu dữ liệu
    // ---------------------------------------------------------------------

    enum Role { None, Admin, Manufacturer, Inspector, Importer, Receiver }

    enum Status {
        None,
        Registered,
        Tested,
        Rejected,
        Imported,
        InTransfer,
        Received,
        Released,
        Quarantined
    }

    /// @dev Chỉ lưu những gì contract cần để kiểm tra điều kiện.
    ///      Thông tin chi tiết của từng bước nằm trong event.
    struct Batch {
        uint256 id;
        string batchNo;
        address manufacturer;
        address importer;
        address receiver; // 0x0 cho tới Bước 4
        address holder;
        Status status;
        uint64 expiryDate;
        uint64 createdAt;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    address public immutable admin;

    mapping(address => Role) private roles;

    /// @dev batchId tự tăng từ 1; batchId = 0 nghĩa là không tồn tại.
    mapping(uint256 => Batch) private batches;
    uint256 private batchCount;

    /// @dev keccak256(batchNo) => batchId, để chặn trùng số lô.
    mapping(bytes32 => uint256) private batchIdByNo;

    // ---------------------------------------------------------------------
    // Event
    // ---------------------------------------------------------------------

    event RoleGranted(address indexed account, Role indexed role, string orgName, bytes32 licenseHash, uint64 at);
    event RoleRevoked(address indexed account, Role indexed previousRole, uint64 at);

    // Bước 1 (T07)
    event BatchRegistered(
        uint256 indexed batchId,
        address indexed manufacturer,
        bytes32 indexed docHash,
        string batchNo,
        string materialName,
        uint64 mfgDate,
        uint64 expiryDate,
        string storageConditions,
        address importer,
        uint64 at
    );

    // Bước 2 (T08)
    event BatchTested(
        uint256 indexed batchId,
        address indexed inspector,
        bytes32 indexed docHash,
        bool passed,
        string reportNo,
        uint64 testDate,
        uint64 at
    );

    // Bước 3 (T09)
    event BatchImported(
        uint256 indexed batchId,
        address indexed importer,
        bytes32 indexed docHash,
        string originCountry,
        string customsDeclNo,
        uint64 importDate,
        uint64 at
    );

    // Bước 4 và 5 (T10), hủy chuyển giao (T14)
    event TransferInitiated(uint256 indexed batchId, address indexed from, bytes32 indexed docHash, address to, uint64 at);
    event TransferConfirmed(uint256 indexed batchId, address indexed receiver, bytes32 indexed docHash, uint64 at);
    event TransferCancelled(uint256 indexed batchId, address indexed importer, bytes32 indexed docHash, address previousReceiver, uint64 at);

    // Bước 6 (T44)
    event ReceivingInspected(
        uint256 indexed batchId,
        address indexed receiver,
        bytes32 indexed docHash,
        bool passed,
        string reportNo,
        uint64 inspectDate,
        uint64 at
    );

    // ---------------------------------------------------------------------
    // Modifier
    // ---------------------------------------------------------------------

    modifier onlyAdmin() {
        require(msg.sender == admin, "BR: not admin");
        _;
    }

    modifier onlyRole(Role role) {
        require(roles[msg.sender] == role, "BR: wrong role");
        _;
    }

    modifier batchExists(uint256 batchId) {
        require(batchId != 0 && batchId <= batchCount, "BR: batch not found");
        _;
    }

    modifier inStatus(uint256 batchId, Status status) {
        require(batches[batchId].status == status, "BR: wrong status");
        _;
    }

    modifier nonZeroHash(bytes32 docHash) {
        require(docHash != bytes32(0), "BR: zero hash");
        _;
    }

    // ---------------------------------------------------------------------
    // Khởi tạo
    // ---------------------------------------------------------------------

    constructor() {
        admin = msg.sender;
        roles[msg.sender] = Role.Admin;
        emit RoleGranted(msg.sender, Role.Admin, "Admin", bytes32(0), uint64(block.timestamp));
    }

    // ---------------------------------------------------------------------
    // Bước 0: phân quyền
    // ---------------------------------------------------------------------

    /// @notice Admin cấp vai trò cho một ví, kèm tên đơn vị và hash hồ sơ pháp lý.
    /// @dev Mỗi ví chỉ giữ một vai trò; muốn đổi vai trò thì thu hồi trước.
    function grantRole(address account, Role role, string calldata orgName, bytes32 licenseHash)
        external
        onlyAdmin
        nonZeroHash(licenseHash)
    {
        require(account != address(0), "BR: zero address");
        require(role != Role.None && role != Role.Admin, "BR: invalid role");
        require(roles[account] == Role.None, "BR: account has role");
        require(bytes(orgName).length > 0, "BR: empty org name");

        roles[account] = role;
        emit RoleGranted(account, role, orgName, licenseHash, uint64(block.timestamp));
    }

    /// @notice Admin thu hồi vai trò của một ví. Lô mà ví đang được chỉ định sẽ dừng ở trạng thái hiện tại.
    function revokeRole(address account) external onlyAdmin {
        Role previousRole = roles[account];
        require(previousRole != Role.None, "BR: no role");
        require(previousRole != Role.Admin, "BR: cannot revoke admin");

        roles[account] = Role.None;
        emit RoleRevoked(account, previousRole, uint64(block.timestamp));
    }

    // ---------------------------------------------------------------------
    // Bước 1: đăng ký lô
    // ---------------------------------------------------------------------

    /// @notice Manufacturer đăng ký lô mới và chỉ định Importer cho lô.
    /// @return batchId mã lô do contract cấp, tự tăng từ 1
    /// @dev Tham số chuỗi dùng `memory` thay cho `calldata`: mỗi chuỗi calldata chiếm 2 ô stack,
    ///      với 3 chuỗi và event 10 trường sẽ gây lỗi "Stack too deep" khi không bật viaIR.
    function registerBatch(
        string memory batchNo,
        string memory materialName,
        uint64 mfgDate,
        uint64 expiryDate,
        string memory storageConditions,
        address importer,
        bytes32 docHash
    ) external onlyRole(Role.Manufacturer) nonZeroHash(docHash) returns (uint256 batchId) {
        require(bytes(batchNo).length > 0, "BR: empty batchNo");
        _requireValidBatchNo(batchNo);
        require(bytes(materialName).length > 0, "BR: empty material");
        bytes32 noKey = keccak256(bytes(batchNo));
        require(batchIdByNo[noKey] == 0, "BR: batchNo used");
        require(mfgDate < expiryDate, "BR: invalid dates");
        _requireValidDate(mfgDate);
        require(block.timestamp <= expiryDate, "BR: expired");
        require(roles[importer] == Role.Importer, "BR: not importer");

        batchId = ++batchCount;
        batchIdByNo[noKey] = batchId;

        Batch storage b = batches[batchId];
        b.id = batchId;
        b.batchNo = batchNo;
        b.manufacturer = msg.sender;
        b.importer = importer;
        b.holder = msg.sender;
        b.status = Status.Registered;
        b.expiryDate = expiryDate;
        b.createdAt = uint64(block.timestamp);

        emit BatchRegistered(
            batchId,
            msg.sender,
            docHash,
            batchNo,
            materialName,
            mfgDate,
            expiryDate,
            storageConditions,
            importer,
            uint64(block.timestamp)
        );
    }

    // ---------------------------------------------------------------------
    // Bước 2: kiểm nghiệm
    // ---------------------------------------------------------------------

    /// @notice Inspector ghi kết quả kiểm nghiệm. Đạt thì lô sang Tested, không đạt thì sang Rejected (kết thúc).
    /// @dev Chỉ ghi một lần: sau khi ghi, lô không còn ở trạng thái Registered.
    ///      Lô hết hạn vẫn được ghi "không đạt" để có lối ra Rejected.
    function recordTestResult(
        uint256 batchId,
        bool passed,
        string calldata reportNo,
        uint64 testDate,
        bytes32 docHash
    )
        external
        onlyRole(Role.Inspector)
        batchExists(batchId)
        inStatus(batchId, Status.Registered)
        nonZeroHash(docHash)
    {
        require(bytes(reportNo).length > 0, "BR: empty reportNo");
        _requireValidDate(testDate);
        if (passed) {
            require(!_isExpired(batchId), "BR: expired");
        }

        batches[batchId].status = passed ? Status.Tested : Status.Rejected;
        emit BatchTested(batchId, msg.sender, docHash, passed, reportNo, testDate, uint64(block.timestamp));
    }

    // ---------------------------------------------------------------------
    // Bước 3: nhập khẩu
    // ---------------------------------------------------------------------

    /// @notice Importer được chỉ định ghi thông tin nhập khẩu; lô sang Imported và Importer trở thành người giữ lô.
    function recordImport(
        uint256 batchId,
        string calldata originCountry,
        string calldata customsDeclNo,
        uint64 importDate,
        bytes32 docHash
    )
        external
        onlyRole(Role.Importer)
        batchExists(batchId)
        inStatus(batchId, Status.Tested)
        nonZeroHash(docHash)
    {
        Batch storage b = batches[batchId];
        require(msg.sender == b.importer, "BR: not designated");
        require(bytes(originCountry).length > 0, "BR: empty origin");
        require(bytes(customsDeclNo).length > 0, "BR: empty customsDeclNo");
        _requireValidDate(importDate);
        require(!_isExpired(batchId), "BR: expired");

        b.status = Status.Imported;
        b.holder = msg.sender;
        emit BatchImported(batchId, msg.sender, docHash, originCountry, customsDeclNo, importDate, uint64(block.timestamp));
    }

    // ---------------------------------------------------------------------
    // Bước 4 và 5: chuyển giao hai chiều
    // ---------------------------------------------------------------------

    /// @notice Importer được chỉ định khởi tạo chuyển giao lô cho một Receiver đích danh.
    /// @dev Trong lúc InTransfer, Importer vẫn là người giữ lô cho tới khi Receiver xác nhận.
    function initiateTransfer(uint256 batchId, address receiver, bytes32 docHash)
        external
        onlyRole(Role.Importer)
        batchExists(batchId)
        inStatus(batchId, Status.Imported)
        nonZeroHash(docHash)
    {
        Batch storage b = batches[batchId];
        require(msg.sender == b.importer, "BR: not designated");
        require(roles[receiver] == Role.Receiver, "BR: not receiver");
        require(!_isExpired(batchId), "BR: expired");

        b.status = Status.InTransfer;
        b.receiver = receiver;
        emit TransferInitiated(batchId, msg.sender, docHash, receiver, uint64(block.timestamp));
    }

    /// @notice Receiver được chỉ định xác nhận đã nhận đúng và đủ lô; Receiver trở thành người giữ lô.
    /// @dev Không chặn lô hết hạn: hàng đã đến nơi thật, lô sẽ được xử lý ở Bước 6 (Quarantined).
    function confirmTransfer(uint256 batchId, bytes32 docHash)
        external
        onlyRole(Role.Receiver)
        batchExists(batchId)
        inStatus(batchId, Status.InTransfer)
        nonZeroHash(docHash)
    {
        Batch storage b = batches[batchId];
        require(msg.sender == b.receiver, "BR: not designated");

        b.status = Status.Received;
        b.holder = msg.sender;
        emit TransferConfirmed(batchId, msg.sender, docHash, uint64(block.timestamp));
    }

    /// @notice Importer đã khởi tạo hủy chuyển giao (ví dụ Receiver không xác nhận hoặc bị thu hồi vai trò).
    ///         Lô quay về Imported và có thể được giao lại cho Receiver khác.
    /// @param docHash hash biên bản hủy giao / văn bản nêu lý do hủy
    /// @dev Không chặn lô hết hạn: hủy là lối thoát khỏi InTransfer, không đẩy lô tiến lên.
    function cancelTransfer(uint256 batchId, bytes32 docHash)
        external
        onlyRole(Role.Importer)
        batchExists(batchId)
        inStatus(batchId, Status.InTransfer)
        nonZeroHash(docHash)
    {
        Batch storage b = batches[batchId];
        require(msg.sender == b.importer, "BR: not designated");

        address previousReceiver = b.receiver;
        b.status = Status.Imported;
        b.receiver = address(0);
        emit TransferCancelled(batchId, msg.sender, docHash, previousReceiver, uint64(block.timestamp));
    }

    // ---------------------------------------------------------------------
    // Bước 6: kiểm tra tại nơi nhận
    // ---------------------------------------------------------------------

    /// @notice Receiver được chỉ định ghi kết quả kiểm tra chất lượng tại nơi nhận.
    ///         Đạt thì lô sang Released (được đưa vào sử dụng), không đạt thì sang Quarantined (biệt trữ). Cả hai là trạng thái kết thúc.
    /// @dev Chỉ ghi một lần. Lô hết hạn vẫn được ghi "không đạt" để có lối ra Quarantined.
    function recordReceivingInspection(
        uint256 batchId,
        bool passed,
        string calldata reportNo,
        uint64 inspectDate,
        bytes32 docHash
    )
        external
        onlyRole(Role.Receiver)
        batchExists(batchId)
        inStatus(batchId, Status.Received)
        nonZeroHash(docHash)
    {
        require(msg.sender == batches[batchId].receiver, "BR: not designated");
        require(bytes(reportNo).length > 0, "BR: empty reportNo");
        _requireValidDate(inspectDate);
        if (passed) {
            require(!_isExpired(batchId), "BR: expired");
        }

        batches[batchId].status = passed ? Status.Released : Status.Quarantined;
        emit ReceivingInspected(batchId, msg.sender, docHash, passed, reportNo, inspectDate, uint64(block.timestamp));
    }

    // ---------------------------------------------------------------------
    // Hàm đọc
    // ---------------------------------------------------------------------

    function getRole(address account) external view returns (Role) {
        return roles[account];
    }

    function getBatch(uint256 batchId) external view batchExists(batchId) returns (Batch memory) {
        return batches[batchId];
    }

    function getBatchCount() external view returns (uint256) {
        return batchCount;
    }

    /// @notice Danh sách lô theo trang: tối đa `count` lô, bắt đầu từ `fromId` (tính từ 1).
    /// @dev Trả mảng rỗng nếu `fromId` = 0 hoặc lớn hơn số lô. Mỗi lô có chuỗi `batchNo`,
    ///      nên DApp nên đọc mỗi trang khoảng 50 lô để không vượt giới hạn gas của eth_call trên RPC công cộng.
    function getBatches(uint256 fromId, uint256 count) external view returns (Batch[] memory page) {
        if (fromId == 0 || fromId > batchCount || count == 0) {
            return new Batch[](0);
        }
        uint256 available = batchCount - fromId + 1;
        uint256 size = count < available ? count : available;
        page = new Batch[](size);
        for (uint256 i = 0; i < size; i++) {
            page[i] = batches[fromId + i];
        }
    }

    /// @notice Tra batchId theo số lô; trả về 0 nếu chưa đăng ký.
    function getBatchIdByNo(string calldata batchNo) external view returns (uint256) {
        return batchIdByNo[keccak256(bytes(batchNo))];
    }

    function isExpired(uint256 batchId) external view batchExists(batchId) returns (bool) {
        return _isExpired(batchId);
    }

    // ---------------------------------------------------------------------
    // Nội bộ
    // ---------------------------------------------------------------------

    function _isExpired(uint256 batchId) internal view returns (bool) {
        return block.timestamp > batches[batchId].expiryDate;
    }

    /// @dev Ngày do người dùng nhập phải khác 0 và không sau thời điểm ghi.
    function _requireValidDate(uint64 date) internal view {
        require(date != 0 && date <= block.timestamp, "BR: invalid date");
    }

    /// @dev Số lô chỉ gồm A-Z, 0-9 và - _ / . , tối đa 32 ký tự, để "PEN-001" và "pen-001"
    ///      không thành hai lô khác nhau. DApp tự đổi sang chữ hoa trước khi gửi.
    function _requireValidBatchNo(string memory batchNo) internal pure {
        bytes memory s = bytes(batchNo);
        require(s.length <= 32, "BR: invalid batchNo");
        for (uint256 i = 0; i < s.length; i++) {
            bytes1 c = s[i];
            bool ok = (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c == "-" || c == "_" || c == "/" || c == ".";
            require(ok, "BR: invalid batchNo");
        }
    }
}
