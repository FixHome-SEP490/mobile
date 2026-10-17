# Context repo mobile — FixHome

> Cập nhật lần cuối: 2026-10-18 04:09 (UTC+7) · Người cập nhật (git): ToanAltF4 · Nhánh: feat/mobile-call-ai-chat

## 0. Quy tắc cập nhật file này (bắt buộc)

File này là nguồn ngữ cảnh chung của repo cho cả dev lẫn AI agent. Đọc trước khi làm bất kỳ việc gì trong repo. Bốn repo `ai-service`, `backend`, `web`, `mobile` dùng chung một bộ quy tắc này; test `src/context-doc.test.ts` kiểm tra định dạng mỗi lần chạy `npm test` và trong CI, sai quy tắc là CI đỏ.

### Khi nào phải cập nhật

Cập nhật trong cùng PR với thay đổi, không để PR sau. Bắt buộc khi PR làm thay đổi một trong các thứ sau:

1. Tính năng hoặc luồng nghiệp vụ người dùng thấy được.
2. API, sự kiện realtime, enum, schema gửi qua lại giữa các repo.
3. Biến môi trường, cổng, cách chạy, cổng kiểm thử (gate), CI, Docker.
4. Migration hoặc cấu trúc dữ liệu.
5. Quyết định của PO hoặc luật nghiệp vụ.
6. Việc đang dở, rủi ro mới phát hiện, hoặc một mục ở phần 8 đã xong.

Sửa lỗi không đổi hành vi bên ngoài thì không bắt buộc. Không chắc thì cập nhật.

### Cách cập nhật

1. Sửa nội dung mục 1 đến 8 cho đúng hiện trạng. Viết lại câu cũ cho đúng, không chồng thêm ghi chú lên câu đã sai.
2. Sửa dòng `> Cập nhật lần cuối:` ở đầu file theo đúng mẫu:
   `> Cập nhật lần cuối: YYYY-MM-DD HH:mm (UTC+7) · Người cập nhật (git): <git user.name> · Nhánh: <nhánh>`
   Giờ là giờ Việt Nam lúc sửa, lấy bằng lệnh dưới đây (chạy được trên Windows, macOS, Linux; đừng dùng `TZ=... date` vì Git Bash trên Windows lặng lẽ trả giờ UTC):
   `node -e "console.log(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()))"`
   hoặc `python -c "from datetime import datetime,timezone,timedelta;print(datetime.now(timezone(timedelta(hours=7))).strftime('%Y-%m-%d %H:%M'))"`.
   Tên lấy đúng chữ từ `git config user.name`. Nhánh lấy từ `git branch --show-current`.
3. Thêm một dòng lên đầu mục 9, cùng giờ và cùng tên với dòng đầu file:
   `- YYYY-MM-DD HH:mm (UTC+7) | <git user.name> | <nhánh hoặc PR #số> | <đã đổi gì trong context, một câu>`
4. Chạy `npx jest src/context-doc.test.ts` trước khi commit.

### Viết gì và không viết gì

- Chỉ ghi điều đã kiểm chứng trong code, PR hoặc lần chạy thật. Điều chưa kiểm chứng ghi rõ `CHƯA KIỂM CHỨNG`.
- Repo là public. Tuyệt đối không ghi mật khẩu, khoá API, token, chuỗi kết nối có mật khẩu, địa chỉ IP máy chủ hay máy GPU, dữ liệu khách hàng. Biến môi trường chỉ ghi tên, không ghi giá trị. Test chặn các mẫu này.
- Không ghi ý kiến cá nhân, việc vặt, nhật ký làm việc hằng ngày, hay chỗ trống kiểu "để sau". Việc chưa làm ghi ở mục 8 với tên việc cụ thể.
- Không chép lại tài liệu khác; dẫn đường dẫn tới file đó.
- Tiếng Việt, câu ngắn. Tên kỹ thuật, tên file, tên API giữ nguyên tiếng Anh, đặt trong backtick.
- Không đổi tên, không xoá, không đổi thứ tự mười tiêu đề `##` số 0 đến 9; nội dung con dùng `###`. Không thêm tiêu đề `##` khác.
- Mục 9 mới nhất ở trên cùng, giữ tối đa 40 dòng; dòng cũ hơn thì xoá, lịch sử đã có trong git.
- File dài tối đa 700 dòng. Dài hơn thì rút gọn và dẫn link.

### Khi thay đổi chạm nhiều repo

Hợp đồng giữa các repo (mục 2 và mục 5) phải khớp nhau. Đổi API ở `backend` thì cập nhật context của `web`, `mobile` (và `ai-service` nếu liên quan) trong PR của từng repo đó, cùng ngày. Mục 2 của bốn repo giống nhau; sửa ở một repo thì sửa cả bốn.

### Với AI agent

Đọc file này trước, rồi `AGENTS.md`, rồi `docs/AI-TECHNICAL-GUIDE.md`. Không tạo file ngữ cảnh khác thay cho file này. Khi kết thúc việc, áp dụng đúng mục "Cách cập nhật" ở trên với tên git của máy đang chạy.

## 1. Repo này là gì trong FixHome

`mobile` là ứng dụng Expo (SDK 57) / React Native 0.86 cho hai vai trò khách hàng và kỹ thuật viên. Quản lý dịch vụ và admin dùng `/console` của `web`. Mọi dữ liệu và nghiệp vụ đi qua `backend`; app không gọi thẳng `ai-service`, database hay cổng thanh toán. Giao diện chỉ có chế độ sáng, khoá màn hình dọc.

## 2. Liên kết với các repo khác

FixHome gồm năm repo trong tổ chức GitHub `FixHome-SEP490`. Bốn repo mã nguồn có file context cùng cấu trúc:

| Repo | Vai trò | Nhánh tích hợp | Context |
| --- | --- | --- | --- |
| `backend` | NestJS, nguồn sự thật về nghiệp vụ, quyền và dữ liệu | `dev` | `https://github.com/FixHome-SEP490/backend/blob/dev/docs/CONTEXT.md` |
| `web` | Vue cho cả bốn vai trò; khu `/console` cho quản lý dịch vụ và admin | `dev` | `https://github.com/FixHome-SEP490/web/blob/dev/docs/CONTEXT.md` |
| `mobile` | Expo / React Native cho khách hàng và kỹ thuật viên | `dev` | `https://github.com/FixHome-SEP490/mobile/blob/dev/docs/CONTEXT.md` |
| `ai-service` | FastAPI, chẩn đoán từ ảnh và mô tả, chatbot tư vấn; chỉ mang tính gợi ý | `main` | `https://github.com/FixHome-SEP490/ai-service/blob/main/docs/CONTEXT.md` |
| `docs` | Tài liệu dự án | — | — |

Luồng gọi giữa các repo:

```text
web  ──┐  REST /api/v1 + Socket.IO (JWT)
       ├──────────────────────────────▶ backend ──HTTP──▶ ai-service (/api/v1/diagnosis/analyze, /api/v1/chat/ask)
mobile ┘                                   │
                                           ├──▶ Supabase PostgreSQL (TypeORM, migration); Supabase Storage (riêng ảnh KYC)
                                           ├──▶ Cloudinary (ảnh đại diện, ảnh booking, ảnh bằng chứng sửa chữa)
                                           ├──▶ VNPay (thanh toán hoá đơn, nạp ví) và payOS (chi tiền rút ví)
                                           ├──▶ MapTiler (gợi ý địa chỉ, đổi toạ độ ra địa chỉ)
                                           └──▶ Google OAuth (đăng nhập Google), SMTP (gửi OTP)
```

`web` hiển thị bản đồ bằng MapTiler; `mobile` dùng `react-native-maps`. Chat và gọi thoại dùng chung Socket.IO namespace `/chat` của `backend`; thông báo hiện chỉ đọc qua REST (chưa có đẩy realtime hay push).

Ba điều không đổi giữa các repo:

1. `web` và `mobile` không gọi thẳng `ai-service`, database hay cổng thanh toán; mọi thứ đi qua `backend`.
2. `backend` là nơi quyết định nghiệp vụ và phân quyền; kiểm tra phía client chỉ để trải nghiệm.
3. `ai-service` chỉ gợi ý. AI hỏng hoặc chậm không được chặn luồng đặt lịch; `backend` trả kết quả dự phòng.

Luật nghiệp vụ gốc nằm ở tài liệu dự án (bản chính thức của nhóm). Mâu thuẫn giữa code và tài liệu thì ghi vào mục 8 và hỏi PO, không tự quyết.

## 3. Trạng thái hiện tại

### Khách hàng

SEP-137/139: editor địa chỉ Booking phân biệt ghim đã xác nhận với địa chỉ đủ điều kiện lưu; tỉnh/quận thiếu được chọn rõ ràng từ GET `/geo/provinces`, không tự gán khu vực. Giữ createAddress một lần và đối chiếu GET/owner trước khi dùng địa chỉ. Booking Create có hai bước nhập Tình trạng và Địa chỉ & thời gian, giữ bước review snapshot bất biến riêng; chỉ nút xác nhận cuối mới tải ảnh và POST Booking. Receipt sau gửi dùng chi tiết đã lưu trong snapshot, chưa phải ServiceOrder. Matching hiển thị toàn bộ candidate server trả; khách chọn một hoặc hai TECH user ID khác nhau theo thứ tự, Backend xử lý ưu tiên đầu PENDING và ưu tiên hai STANDBY. Radar chỉ hiển thị cho Booking thuộc khách đang đăng nhập, status Backend MATCHING và có invitation PENDING hợp lệ khi màn focus, app foreground, không lỗi/ACK chưa rõ/khóa; Reduce Motion chặn pulse. Customer Order detail hiển thị một section theo action/status hiện tại; progress sheet chỉ đọc, các controller giữ guard/readback riêng. Thanh hành động dưới scroll điều hướng đến section hiện hành, không thay thế các nút xác nhận trong section. Thiết bị và visual 320–430dp CHƯA KIỂM CHỨNG; không có POST Booking/matching thực trong kiểm thử.

- Home chọn dịch vụ phổ biến theo service code/alias cục bộ và category fallback có thật; danh mục tra cứu catalog động, không gửi text hint thành query Backend. Đặt lịch thường: Dịch vụ → Chi tiết dịch vụ → Tạo booking hai bước (địa chỉ đã lưu có GPS, chọn buổi sáng 8-12 hoặc chiều 13-18 trong 14 ngày tới, hoặc `Tới ngay`, ghi chú cho thợ tùy chọn) → review snapshot → xác nhận cuối mới tải tối đa 5 ảnh và `POST /bookings` gửi `mode`, `date`, `slot`, `customerNote` kèm cửa sổ giờ đã tính (`BookingSessionPicker`, `utils/booking-session.ts`); mô tả tối đa 5.000 ký tự, gợi ý là văn bản sửa được; không còn chọn giờ bắt đầu tự do.
- Đặt lịch có AI: màn chẩn đoán nhận mô tả và tối đa 3 ảnh, chuyển sang trò chuyện với AI; AI không tự đặt lịch mà điền sẵn dịch vụ, mô tả và `aiSessionId` vào màn tạo booking.
- Booking Create có chip gợi ý theo mã dịch vụ: vệ sinh máy lạnh, sửa máy lạnh, rò rỉ nước và lắp TV; mã khác dùng nhóm từ `service.categoryName` hoặc danh mục đã tải, rồi fallback nhóm mặc định như Web. Chạm thêm nguyên văn, chạm lại bỏ mục triệu chứng khớp toàn bộ không phân biệt hoa/thường; giữ nội dung tự nhập/AI, không cắt mô tả khi vượt 5.000 ký tự. Chip chọn có dấu kiểm và accessibility state; đổi dịch vụ chỉ tính lại gợi ý. Giữ mô tả bắt buộc, review snapshot, urgency `NORMAL`, lịch và payload hiện hành; không thêm điều chỉnh mức độ khẩn cấp theo quyết định owner. Visual/runtime và thiết bị CHƯA KIỂM CHỨNG.
- Có thể chọn 1 hoặc 2 TECH user ID khác nhau theo thứ tự ở màn tìm thợ; mọi candidate còn khả dụng do Backend trả đều hiển thị. Không gửi lời mời thứ hai song song.
- Đơn: duyệt báo giá và chi phí phát sinh, huỷ, xác nhận hoàn tất, hoá đơn, tiền mặt, mở VNPay, đánh giá, xem bằng chứng.
- Lịch sử sửa chữa, trung tâm bảo hành, hỗ trợ, chat với kỹ thuật viên, thông báo có phân trang, hồ sơ và địa chỉ có bản đồ, màn bảo mật (đổi mật khẩu bằng OTP).

- Polish Customer: chọn xem cả danh mục hoặc cả nhóm xóa shortcut đang lọc; tìm kiếm nhập tay được giữ khi đổi nhóm. Home ghi rõ TV cần giá treo sẵn. Shortcut vệ sinh máy lạnh nhận cả mã catalog gốc `VE_SINH_DIEU_HOA` nếu server trả về, giữ nhãn riêng vệ sinh/nạp gas và không thay giá hoặc phạm vi dịch vụ. Catalog dùng hai cột dưới 420dp hoặc chữ lớn, tên biến thể không cắt; thumbnail kết quả tìm kiếm không thêm nền riêng. CTA giữa nổi 8dp và toàn bộ nút 56dp nằm trong bounds của container nhận chạm; sheet uy tín Customer có nút đóng, tách accessibility cho nội dung và ghi quy định mặc định. Home dùng cutout catalog hiện có riêng cho vòi nước/rò rỉ, bỏ motif lavabo có nền trắng chung. Asset hero/catalog có alpha thật; mảng tường trắng thuộc minh họa hero vẫn giữ, không tạo/sửa asset hoặc dữ liệu dịch vụ.

### Ví khách hàng C50

`customerWalletApi.getSummary` giữ strict global HTTP envelope, integer-VND, phân trang và uniqueness của transaction ID; `amount` ledger phải dương, còn `balanceAfter` là số nguyên không âm và có thể bằng zero. Parser chấp nhận thêm `withdrawal` (tiền ra) và `withdrawal_refund` (tiền vào). Lịch sử hiển thị đủ bảy loại bằng nhãn riêng và dấu tiền theo loại ledger. `CustomerWalletScreen` dùng hero số dư xanh, cặp nút `Nạp tiền`/`Rút tiền`, form nạp thu gọn ban đầu và dòng giao dịch gọn; mã tham chiếu chỉ mở trong `Chi tiết`. Yêu cầu nạp, idempotency, VNPay và đối soát ACK chưa rõ không đổi.

### Xác minh khách hàng C50

`CustomerKycScreen` dùng `GET /customer/verification`, `POST /customer/verification/upload-url` (chỉ gửi MIME) và `POST /customer/verification`. Chỉ status Backend `none`, `pending`, `rejected`, `verified` được hiển thị; hồ sơ pending/verified không cho gửi lại. Form kiểm tra ngày thật theo ngày Việt Nam, năm sinh từ 1900, đủ 18 tuổi, CCCD 12 số, giới tính và địa chỉ. Hai mặt CCCD phải là hai tệp riêng, MIME/đuôi khớp JPEG/PNG/WEBP, 1–10 MB, đường dẫn dưới `kyc/<customerId>/`; PUT ảnh dùng native XHR trực tiếp tới signed URL, không gửi Backend JWT. URL mới chỉ được xin lại sau 401/403; lỗi mạng/timeout không tự replay. URI ảnh và dữ liệu hồ sơ chỉ ở bộ nhớ màn hình, được xóa khi rời màn hình hoặc ứng dụng chạy nền. UI trình bày rõ trạng thái none/pending/rejected/verified và hai thẻ ảnh mặt trước/mặt sau; chỉ hồ sơ verified có CTA sang rút tiền, không lộ thông tin hồ sơ trong trạng thái xác minh.

### Ngân hàng và rút tiền C50

`CustomerWithdrawScreen` đọc thông tin đủ điều kiện, ngân hàng, tài khoản nhận và lịch sử từ các route `/customer/wallet/*`; quy tắc KYC, số tiền tối thiểu/tối đa và khả năng rút do Backend cung cấp. UI có tiến trình xác minh danh tính → ngân hàng → rút tiền, hạn mức và thẻ nhập/xác nhận gọn; trạng thái sẵn sàng không đồng nghĩa lệnh rút thành công. Lưu tài khoản dùng `PUT /customer/wallet/bank-account` rồi GET đọc lại trước khi coi dữ liệu là hiện hành. Tạo lệnh gửi đúng một `POST /customer/wallet/withdrawals` với amount; ACK chưa rõ chỉ được đối soát qua GET và không gửi lại POST. Lịch sử `GET /customer/wallet/withdrawals` dùng `page`/`limit`; HTTP success envelope có mảng withdrawal ở top-level `data` và phân trang ở sibling top-level `meta`. Adapter yêu cầu cả hai trường, không nhận shape lồng cũ. Status giữ nguyên `PROCESSING`, `SUCCESS`, `FAILED`.

### Tra cứu đơn công khai C45

Guest và Customer Home đã đăng nhập đều có shortcut tới `PublicOrderTrackingScreen` dưới ô tìm dịch vụ; màn này gửi mã đơn và điện thoại đã đăng ký tới `POST /service-orders/public/track`, dùng cùng thông báo lỗi khi cặp thông tin không khớp. Adapter lấy `PublicTrackResult` trực tiếp từ `data` của global HTTP success envelope, không chờ thêm `data` lồng. Poll 15 giây chỉ chạy khi màn đang focus, ứng dụng foreground và status là `EN_ROUTE`/`UNDER_REPAIR`; manual và poll cùng dùng giới hạn client 5 request/60 giây, tôn trọng `Retry-After`, và dừng poll sau lỗi hoặc 429. Số điện thoại/mã chỉ nằm trong state màn hình; blur/background/query đổi sẽ xóa truy vấn, kết quả và tọa độ. Backend public DTO có thể trả cặp tọa độ đích; parser chỉ giữ cặp hợp lệ. Native map dùng marker thợ và điểm đến, chỉ hiện khi GPS thợ hợp lệ, mới không quá 2 phút, status đang hoạt động, màn focus và ứng dụng foreground; timer xóa map và mốc cập nhật khi GPS hết hạn. Tọa độ chỉ nằm trong state bộ nhớ tạm của map, không ghi lưu/analytics/log. Expo Web dùng module fallback riêng không import `react-native-maps`.

Production `OrderInformationScreen` chỉ cho Customer sao chép `order.code`; màn `CompletedOrderScreen` trong nhánh Customer C12 có nút sao chép đầy đủ mã đơn ngay cạnh `Mã đơn`, nhánh Technician không có nút này. `CustomerRepairHistoryScreen` chỉ sao chép `item.code` đầy đủ, nút copy không mở card. Mã thiếu hiển thị `Chưa có mã đơn`, không thay bằng UUID.

### Kỹ thuật viên

Lịch làm việc hiển thị bảy ngày dọc T2–CN từ GET, chỉ mở editor khi chọn ngày; hỗ trợ nhiều khung giờ và bản xem trước sao chép T2–T6, giữ T7/CN. Preset chỉ là gợi ý, mọi thay đổi lịch phải nhấn Lưu; tuần trống không tự thêm khung giờ. Khai báo nghỉ mở theo yêu cầu, chỉ dùng khoảng nghỉ trọn ngày theo API hiện tại. Trang tài khoản hai role dùng cùng nút Đăng xuất viền đỏ ở cuối nội dung cuộn, phía trên thanh tab; giữ menu riêng và logic đăng xuất hiện có. Visual QA 320–430dp và thiết bị CHƯA KIỂM CHỨNG.

Onboarding năm bước (thông tin, KYC tải lên URL ký sẵn, kỹ năng, địa chỉ và khu vực, gửi duyệt), lời mời, công việc (đi đến, check-in GPS có kiểm độ chính xác, ảnh trước và sau, báo giá, chi phí phát sinh, bắt đầu sửa, yêu cầu hoàn tất, tiền mặt, linh kiện có quét QR bằng camera), ví (nạp, tài khoản ngân hàng, rút), hồ sơ (nhận việc, lịch tuần, ngày nghỉ, giá công), thu nhập, đánh giá, ghi chú riêng theo đơn (lưu trên máy).

### Thay đổi 07/10/2026 (nhánh `fix/no-fake-data-and-po-decisions`)

- Bỏ dữ liệu giả: nút đăng nhập thử vai trò ở màn đăng nhập, cộng tiền DEMO ở ví, điểm 5.0★ và bán kính 10 km tự bịa, email giả ở hồ sơ khách.
- Đánh giá dùng chung `utils/rating.ts`: chưa có đánh giá thì hiện "Chưa có đánh giá" (backend trả `null`).
- Ảnh đại diện kỹ thuật viên tải lên như của khách qua `services/avatar-upload.ts` (`POST /media/upload` rồi `PATCH /users/me` với URL http(s)), cập nhật ngay trong store.
- Chẩn đoán và chat AI bắt buộc có mô tả (BRX-064, `screens/customer/ai-diagnosis-input.ts`).
- Thông báo `ORDER_DEPARTURE_WARNING` (đỏ) và `BOOKING_MATCHING_EXHAUSTED` (vàng) có biểu tượng riêng; thông báo đơn của kỹ thuật viên mở thẳng đơn.

### Nhãn trạng thái báo giá (07/10/2026, nhánh `fix/technician-quote-status-label`)

Trạng thái báo giá hiện bằng chữ ở cả màn đơn của khách và của kỹ thuật viên qua `utils/quote-status.ts` (màn của kỹ thuật viên trước đây hiện mã thô SENT/APPROVED). Có thêm nhãn cho báo giá bị thay bằng bản mới.

### Gia hạn tìm thợ, khu vực phục vụ (08/10/2026, nhánh `feat/customer-extend-matching-and-tech-areas`)

- Chi tiết booking của khách có nút "Gia hạn thời gian chờ thợ" (`POST /bookings/:id/matching/extend`) khi booking đang tìm thợ, còn lời mời chờ, chưa có đơn và khung giờ chưa qua (`canExtendMatching` trong `customer-booking-detail.ts`, cùng điều kiện với web). Chọn lại thợ khi hết ứng viên đã có từ trước (`bookingNextAction` trạng thái CLOSED).
- Kỹ thuật viên sửa khu vực phục vụ sau onboarding ở màn `TechnicianServiceAreasScreen` (hồ sơ → Khu vực phục vụ), `GET/PUT /technicians/me/service-areas`, dùng lại bộ chọn tỉnh và quận của onboarding.

### Phía kỹ thuật viên theo buổi (08/10/2026, nhánh `feat/technician-sessions`)

- `utils/booking-session.ts`: nhãn buổi (sáng 8-12, chiều 13-18, "Tới ngay") và `canDepartNow`. Màn đơn của thợ hiện lịch hẹn theo buổi, ghi chú của khách, nút Bắt đầu di chuyển chỉ bật từ `departAvailableAt` (1 giờ trước giờ hẹn).
- `hooks/useTechnicianLocationPing.ts` (gắn ở `TechnicianNavigator`): khi app đang mở và đã có quyền vị trí, gửi GPS mỗi 5 phút (`PATCH /technicians/me/location`) chỉ khi công tắc nhận việc (`isAvailable`) đang bật và bỏ fix có độ chính xác trên 1 km, không tự hỏi quyền. Bán kính 1-40 km.

### Các bước của thợ trong đơn (08/10/2026, nhánh `feat/technician-order-steps`)

- Màn đơn của thợ: check-in phải được xác minh GPS; ảnh trước/sau tải và đối chiếu theo server. `EN_ROUTE` đủ guard chỉ cho phép mở xác nhận; nút bắt đầu sửa gọi explicit `POST /service-orders/:id/start-repair` qua controller hiện có, sau đó đọc lại đơn. Kết quả chưa rõ giữ khóa đến GET xác minh; không tự chuyển trạng thái. Footer CTA nằm ngoài vùng cuộn; progress mở riêng; xem lại ảnh không có nút xóa. Ảnh đơn chỉ chụp bằng camera.
- Thẻ "Cần thay đổi thợ" sau check-in: nhập lý do, tạo support case `technician_replacement` (khẩn).

### Chứng chỉ khi đăng ký thợ (08/10/2026, nhánh `feat/technician-certificates`)

- Màn Xác minh danh tính (`TechnicianKycScreen`): phần "Chứng chỉ nghề" không bắt buộc, tối đa 5 ảnh, ghi chú "bản đã công chứng"; gửi kèm hồ sơ với `documentType: certificate`.
- Sau khi nộp và ở trạng thái chờ duyệt (cả màn onboarding): "Vui lòng đến trụ sở trong thời gian sớm nhất để tiến hành xác minh thông tin và bắt đầu công việc." (`OFFICE_VISIT_NOTE`); bỏ câu hứa duyệt trong 24 giờ.

### Nhóm B SEP-139: đối chiếu web (16/10/2026, nhánh `feat/sep139-group-b`)

- Lời mời: công tắc "Tự nhận việc" (`autoAcceptInvitations` qua `PATCH /technicians/me/profile`), "Ưu tiên số N", lịch hẹn theo buổi hoặc "Tới ngay" bằng `sessionLabel`.
- "Đặt lại thợ" (`RebookSheet`, `GET /bookings/:id/available-slots?previous=1`, `POST /bookings/:id/rebook`) ở Thông tin đơn (COMPLETED/CANCELLED) và booking đã hủy; thông báo "đã mời thợ cũ" hoặc "chọn thợ khác" qua param `rebooked`.
- Điểm uy tín (`GET /reputation/me`, `ReputationCard`) ở hồ sơ hai vai trò; Customer và Technician dùng một card compact chung (điểm 24px, thanh 4dp, nút thông tin 44dp); cảnh báo khóa/tạm ngưng lấy từ server luôn nằm ngoài sheet, phân biệt đặt lịch/nhận việc theo vai trò. Sheet có nút đóng, quy định mặc định đúng vai trò, ngoại lệ Technician báo “Cần thay đổi thợ” do quản lý dịch vụ xem xét và lịch sử thực từ API. Điểm uy tín dùng dữ liệu users.reputation_points, tách biệt chip xanh “Độ tin cậy” từ technician_profiles.reliability_score; không đổi chip hoặc điều hướng Technician. Native visual/runtime và Web runtime parity CHƯA KIỂM CHỨNG. API không trả policy động; ngày làm mới chỉ lấy từ `resetsAt`. Bảo hành mặc định (`PUT /technicians/me/warranty-default`, tối đa 365 ngày) ở hồ sơ thợ.
- Thu nhập theo kỳ ngày/tuần/tháng từ `GET /technicians/me/earnings` có phân trang (`EarningsPeriodPanel`); biểu đồ cũ vẫn là ước tính từ danh sách đơn. Lịch có lưới giờ một ngày (6–22h, khối đơn 2 giờ) với vạch giờ hiện tại.
- Báo giá của khách hiện số ngày bảo hành từng dòng; chi tiết booking hiện ghi chú và tự tải lại mỗi 5 giây khi đang chờ thợ; nhãn trạng thái, giá, thanh toán và vai trò tiếng Việt thay mã thô; `extractApiErrorMessage` dịch câu tiếng Anh đã biết của backend (`utils/api-error-messages.ts`), câu tiếng Anh lạ rơi về câu dự phòng của màn.
- `useScrollHideTabBar` bật lại thanh tab khi màn rời focus. Thiết bị và E2E CHƯA KIỂM CHỨNG.

### Đối chiếu web 17/10/2026 (nhánh `feat/web-parity-labels`)

- Bảo hành của khách: `GET /service-orders/:id/warranties` nay trả `itemType` và `itemDescription` (backend #130); nhãn "Công sửa · tên" hoặc "Linh kiện · tên", dòng "Bảo hành N ngày · đến dd/mm/yyyy · còn N ngày" (`warrantyCoverageLabel`, `warrantyCoverageTerm`).
- Thông báo của khách có chip Tất cả / Chưa đọc, chỉ lọc các trang đã tải như web (`GET /notifications` không có tham số lọc).
- Tổng quan thợ đọc `GET /technicians/me/availability` (`utils/availability.ts`, cùng năm câu với web: Đang nhận việc theo lịch tới giờ, Ngoài giờ làm, Tạm nghỉ, Đang nghỉ, Chưa đặt lịch). Bật nhận việc khi ví dưới mức ký quỹ (`eligibleForJobs` false) thì báo cần nạp thêm và không gọi `PATCH`; đọc ví lỗi thì để backend quyết.
- Màn Hủy đơn (`OrderExceptionScreen`) ghi "Hủy đơn có thể bị trừ điểm uy tín của bạn"; sửa nhãn nút hỏng font.
- Home khách (đã đăng nhập) có hai lối tắt "Ví của tôi" và "Bảo hành" như menu tài khoản web; Hồ sơ vẫn giữ cả hai. Hồ sơ thợ ở màn chọn thợ hiện "Giá công tham khảo: Theo báo giá" khi thợ chưa niêm yết giá; `reliabilityScore` vẫn không hiện cho khách (khác web, có test chặn).
- Khoảng cách theo lưới 4/8/12/16 của `FIXHOME-DESIGN-SYSTEM.md` mục 9: giá trị lẻ (3, 5, 7, 9, 10, 11, 13, 14, 18, 20) của padding, margin và gap ở 48 file màn hình đã đổi về lưới (padding làm tròn lên để giữ vùng chạm 44pt, margin và gap làm tròn xuống); chữ dưới 12 ở `TaskScreenShell` và màn Bảo mật nâng lên 12; Home khách bỏ hai dòng chú thích (AI, "Khác"). Sheet chọn địa chỉ (Home, form đặt lịch), sheet chọn cách đặt lịch, sheet xem lại yêu cầu và sheet chỉnh thông tin hồ sơ khách co theo nội dung (`enableDynamicSizing`, tối đa 78-80% màn) thay cho chiều cao cố định 42-62% để ít địa chỉ không để trống lớn; danh sách trong sheet dùng `BottomSheetFlatList` với tiêu đề nằm trong `ListHeaderComponent` để sheet đo đủ. Bố cục từng màn trên thiết bị CHƯA KIỂM CHỨNG.
- Khoảng cách theo lưới 4/8/12/16 của `FIXHOME-DESIGN-SYSTEM.md` mục 9: giá trị lẻ (3, 5, 7, 9, 10, 11, 13, 14, 18, 20) của padding, margin và gap ở 48 file màn hình đã đổi về lưới (padding làm tròn lên để giữ vùng chạm 44pt, margin và gap làm tròn xuống); chữ dưới 12 ở `TaskScreenShell` và màn Bảo mật nâng lên 12; Home khách bỏ hai dòng chú thích (AI, "Khác"). Tiêu đề màn thống nhất: màn có nút Quay lại dùng 18/24 đậm 700, màn gốc của tab (Đơn của tôi, Thông báo, Hồ sơ) dùng `pageTitle` 24/32 đậm 700 theo mục 6 của `FIXHOME-DESIGN-SYSTEM.md` (trước đây 16 đến 26, đậm 600 đến 800); `borderRadius` 13 đổi thành 14. 14 ô nhập còn thiếu `accessibilityLabel` đã có nhãn. Danh sách chat, lịch sử sửa chữa, bảo hành và ví thợ dùng khung xám (`CustomerSkeleton`) thay cho vòng xoay khi tải lần đầu. `OrderTaskScreen` khi đọc đơn lỗi (`order.status` là `error`) hiện "Chưa tải được thông tin đơn" kèm nút "Thử lại" (`refresh('manual')`, chỉ đọc) thay vì "Đang xác minh…" mãi; màn gửi lệnh (duyệt, thanh toán, huỷ) cố ý không có nút gửi lại tự động. Thanh tab nổi (`GlassTabBar`, `CustomerAnimatedBottomBar`) cao 64 cộng vùng an toàn dưới (tối thiểu 16); `hooks/useTabBarClearance` trả đúng phần đệm đó cộng 16 để dòng cuối cuộn ra khỏi thanh tab, dùng ở Trang chủ và Đơn của tôi của khách (trước đây chỉ chừa 56 và 16 nên bị che). Tab Hoạt động: booking `closed` hiện "Chưa có thợ nhận" ở danh sách, chi tiết và màn chọn thợ; giờ hẹn không còn giây; hàng "Tùy chọn yêu cầu" có đường kẻ trên để thẻ không kết thúc bằng một dải trống; mọi nút trên màn cùng cao tối thiểu 44, bo 14, chữ 14 đậm 600, hai nút Đổi lịch và Hủy yêu cầu chia đều chiều ngang, nút phụ rộng bằng nút chính; thẻ đã có hàng "Tùy chọn" không hiện thêm mũi tên phải ở đầu thẻ (mỗi thẻ một mũi tên). Chưa làm: màu hex viết cứng (nhiều nhất `CustomerOrderDetailScreen`) và gom bo góc 12/14 về một cỡ. Bố cục từng màn trên thiết bị CHƯA KIỂM CHỨNG.
- Chưa làm theo quyết định 17/10/2026: tóm tắt AI cho thợ. Gọi thoại và trợ lý AI đã làm ở mục dưới.

### Gọi thoại và trợ lý AI như web (18/10/2026, nhánh `feat/mobile-call-ai-chat`)

- PO 18/10/2026: đợt này mobile chỉ làm gọi thoại và trợ lý AI cho giống web, không đụng phần khác.
- Gọi thoại: nút gọi ở đầu `ChatThreadScreen` khi server cho nhắn (`canSend`); một `CallOverlay` gắn ở gốc `AppNavigator` khi đã đăng nhập, nên cuộc gọi không mất khi đổi màn. Trạng thái và câu hiển thị theo web (`store/call.store.ts`): đang gọi, đang đổ chuông, cuộc gọi đến, đang kết nối, đang nói chuyện kèm đồng hồ, kết thúc kèm lý do và nút Gọi lại khi được. Nút Micro, nút "Loa nhỏ"/"Loa to" (bắt đầu ở loa trong, chạm để chuyển loa ngoài, qua `react-native-incall-manager`), nút Kết thúc. Mỗi yêu cầu gửi server chờ tối đa 8 giây, không trả lời coi như bị từ chối.
- Âm thanh và WebRTC nạp lười (`services/call-native.ts`, `services/webrtc-call.service.ts`): Expo Go không có mã native nên nút gọi chỉ báo "Gọi thoại cần bản cài đặt FixHome đầy đủ (không chạy trong Expo Go).", mọi màn khác chạy như cũ. Android xin quyền micro trước khi gọi.
- Trợ lý AI (`CustomerAIChatScreen`, luật thuần ở `ai-chat-logic.ts`): câu trả lời hiện dần theo từ (tắt khi bật giảm chuyển động), nút trả lời nhanh Rồi/Chưa/Không rõ hoặc Có/Không/Không rõ cho câu hỏi có/không, "Đúng ý"/"Chưa đúng" kèm góp ý dưới câu trả lời mới nhất (`POST /ai/feedback`), dịch vụ chung chung không thay dịch vụ cụ thể đã tìm ra, nút "Đặt thợ" chỉ hiện khi trợ lý trả lời xong và chỉ nằm ở thanh ghim (thẻ chẩn đoán chỉ liệt kê dịch vụ gợi ý), gửi quá nhanh (429) có câu riêng.
- Video trong trò chuyện với trợ lý: quay hoặc chọn tối đa 2 video MP4/MOV/WebM, mỗi video tối đa 50 MB và 60 giây khi quay; video không gửi cho AI, chỉ hiện trong khung chat kèm câu "Video được gửi kèm cho kỹ thuật viên xem, trợ lý AI không xem video.".
- Bấm "Đặt thợ": ảnh khách chọn trong chat (đổi sang JPEG) và video được tải lên `POST /media/booking-photo-upload` và `POST /media/booking-video-upload`, mỗi file một lần, rồi đi theo `prefill.attachmentUploadIds` qua màn mô tả tới form đặt lịch. Form ghi "Gửi kèm từ trò chuyện với trợ lý: N ảnh, M video" kèm nút Bỏ; khi gửi, ảnh của form đứng trước, ảnh từ chat chỉ thêm khi còn chỗ trong 5 ảnh, video tối đa 2 (`bookingMediaIds`). Tải lỗi thì ở lại chat và báo, không mở form.
- Unit test: `ai-chat-logic.test.ts`, `CustomerAIChatScreen.parity.test.tsx`, `CallOverlay.test.tsx`, `call.store.test.ts`, `chat-socket.calls.test.ts`, thêm hai ca ở `CustomerBookingCreateScreen.test.tsx`. Cuộc gọi trên thiết bị thật, video thật và API thật CHƯA KIỂM CHỨNG.

### Đăng nhập Google

Mở `{origin}/api/v1/auth/google/start?redirect=<deep link auth/google>` bằng `WebBrowser.openAuthSessionAsync`, nhận mã sống 60 giây rồi đổi ở `/auth/google/exchange`. App không cần Google client id.

### Đối chiếu source SEP-132 trên nhánh integration

- `ordersApi.getMyOrdersPage` từ chối body không có mảng danh sách; mảng rỗng hợp lệ vẫn trả trang rỗng. Giữ `bookingMode`, `slot`, `customerNote`, `departAvailableAt` và parser tiền/status hiện hành.
- `GlassTabBar` giữ liquid glass tap/pan và indicator; `TechnicianNavigator` bật `technicianResponsive`, giữ năm tab với Ví ở vị trí thứ tư và `useTechnicianLocationPing`. Thông báo/badge mở từ chuông Home. Customer dùng `CustomerAnimatedBottomBar` với bốn tab và CTA đặt lịch nổi 56dp ở vùng giữa; năm vùng chạm tách khỏi nền tab clipping, lựa chọn đặt lịch thường/AI chỉ điều hướng, không tạo booking. Guest vẫn qua Auth handoff và Reduce Motion bỏ spring.
- Root giữ `TechnicianNotifications` sau guard kỹ thuật viên và `TechnicianServiceAreas`; không còn tab Notifications.
- SEP-135/136: splash logo chạy theo bootstrap thật. Không có phiên: first-run mở chọn vai trò; tiếp tục khách hàng hoặc bỏ qua mở Guest Home, lần sau mở Guest Home. Phiên hợp lệ mở Home đúng vai trò. Guest tái sử dụng `CustomerHomeScreen`, chỉ duyệt danh mục công khai; AI, đặt lịch và tab riêng mở Auth. Logout remount về Guest; Login Back giữ đường duyệt, Khám phá mở Guest. Handoff Login/Google/OTP chờ root đăng ký route đúng phiên và vai trò.
- Tích hợp Customer Booking Create/Detail/Matching/Order/Profile, địa chỉ chính xác, ảnh booking và recovery controller; giữ gia hạn matching và các mutation controller hiện hành. Tích hợp Technician Jobs, work-order, chat, Profile/KYC/onboarding, ví/thu nhập và test production. Các GET `getTechnicianJobs`, `getTechnicianJobsPage`, `getTechnicianOrder` dùng cùng endpoint hiện hành; history chỉ chiếu trường tóm tắt được phép, full order vẫn dùng parser tiền dev. Notifications chỉ cập nhật trạng thái đọc sau API xác nhận và chặn GET cũ ghi đè trạng thái mới. Không nhập developer preview hoặc thay dependency/Expo.

- SEP-139 redesign M1–M4 đã triển khai source: session/resource/journal, navigation native, Booking/lời mời/di chuyển/check-in/face/BEFORE và báo giá hai vai trò. Bản xem trước `OrderFlowDevPreview` chỉ mở trong `__DEV__` từ danh sách đơn, lấy vai trò từ phiên đăng nhập. Chi tiết, lịch sử, ảnh, phạm vi và hóa đơn mở riêng; footer ngoài vùng cuộn. Báo giá dùng editor chung, danh mục thật, tiền hợp lệ, xác nhận ở footer và phạm vi bảo hành đã được server lưu. M5 có controller/recovery và UI phát sinh/linh kiện: confirmation theo target, DTO/giá hợp lệ, QR camera và thao tác footer. Chọn ảnh đơn đã xác minh được hỗ trợ; chụp ảnh phát sinh mới chuyển tiếp sang M6 AFTER. Ghi chú kỹ thuật viên vẫn riêng trên thiết bị, tuần tự hóa ghi và bảo vệ bản nháp khi đổi phiên/đơn. M8: route gốc `CustomerOrderDetail` và `TechnicianOrderDetail` (giữ tên và `{serviceOrderId}`) đã trỏ sang OrderFlow qua `OrderDetailEntry`; vai trò lấy từ tên route và phải trùng vai trò phiên, sai thì hiện màn từ chối. Hai màn chi tiết cũ không còn được đăng ký, file còn trong repo để rollback. Preview Web đã đăng nhập và mở danh sách đơn rỗng hai vai trò ở 320/360/390/430px, không tràn ngang; chưa kiểm chứng màn công việc M5, thanh toán M6 hoặc native.

- M6 dùng controller/hooks production riêng trong `features/order-flow`, cùng provider/coordinator hiện có. Customer wallet HTTP có lớp `{success,statusCode,message,data}` do TransformInterceptor dù controller trả DTO trực tiếp; adapter đọc đúng lớp bọc. Cash giữ actor/timestamp để chặn confirmation cũ; journal không chứa signed URL, QR hay payload tài chính. Không có mutation khi Back/focus/resume; pending tài chính chỉ GET đối soát.

- M6 source: màn bàn giao/thanh toán ba phương thức, ví Customer riêng từ Tài khoản, AFTER và khai báo tiền mặt đã nối hooks frozen. Parser VND không đổi thập phân thành số tiền khác; ảnh gửi xác nhận không gửi lại draft, quay lại đề xuất giữ route/draft cũ. Web export thực đã kiểm chứng GET ví, nhập lỗi, mở/hủy xác nhận và footer ở 320/360/390/430px với dữ liệu QA thật, không POST thanh toán. Đơn QA rỗng; nghiệp vụ đơn, ảnh/native và gateway chưa runtime kiểm chứng.

## 4. Kiến trúc và thư mục chính

- `src/features/order-flow/`: domain/runtime và shared/navigation cho redesign, một provider/reader mỗi phiên đơn. M3 có controller và task screens di chuyển/check-in/face/BEFORE, bằng chứng đúng ID/chủ ảnh và tracker chỉ bật tại màn di chuyển. M4 có controller/hook báo giá, editor và quyết định hai vai trò. M5 dùng controller/hook phát sinh và linh kiện, journal lưu ID trả về thật và kết quả sử dụng cần đối soát; không lưu QR hoặc payload nhạy cảm. Recovery ưu tiên intent chưa rõ, chỉ GET đúng phạm vi. Booking/lời mời phân biệt chắc chắn chưa gửi với POST chưa rõ. Preview vẫn chưa thay route production.
- `src/api/`: axios dùng chung (`client.ts`) và khoảng 20 module gọi API, có test.
- `src/navigation/`: App, Auth, Customer, Technician navigator. Tab khách: Trang chủ, Đơn của tôi, Thông báo, Hồ sơ (thêm nút trợ lý AI). Tab kỹ thuật viên: Trang chủ, Lời mời, Công việc, Ví, Hồ sơ. Chuông Home mở Thông báo.
- `src/screens/`: `auth`, `chat`, `customer`, `technician`. Logic thuần đặt trong file `kebab-case.ts` cạnh màn hình, có `.test.ts` đi kèm.
- `src/services/`: `storage.service.ts` (SecureStore), `chat-socket.service.ts` (chat và tín hiệu gọi), `google-auth.service.ts`, `image-for-ai.ts` (thu ảnh về 1280 px, base64; chọn hoặc quay video; đổi ảnh sang JPEG để tải lên), `call-native.ts` (nạp lười WebRTC và loa), `webrtc-call.service.ts` (micro, kết nối WebRTC).
- `src/store/`: Zustand `auth.store`, `badge.store`, `ui.store`, `call.store` (vòng đời cuộc gọi).
- `src/components/call/CallOverlay.tsx`: màn cuộc gọi dùng chung cho cả hai vai trò.
- `src/constants/`: `config.ts` (đọc biến môi trường), `theme.ts` (`useAppTheme`).
- `src/utils/`: giờ Việt Nam (`vn-time`), định dạng, kiểm dữ liệu nhập, khung giờ booking.

## 5. Hợp đồng với repo khác

- REST tới `backend` qua `EXPO_PUBLIC_API_BASE_URL`; override rõ ràng luôn ưu tiên. Native development suy ra host LAN từ Expo/Metro và dùng cổng backend mặc định; Web giữ localhost, Android emulator với Metro loopback giữ bridge emulator. Không suy ra host từ tunnel hoặc ở production. Token vẫn lưu bằng `expo-secure-store`; session refresh không đổi.
- Gặp 401 thì gọi một lần `POST /auth/refresh` dùng chung; chỉ chạy lại yêu cầu GET, HEAD, OPTIONS, không tự chạy lại thao tác ghi.
- Danh sách gửi `page` và `pageSize` hoặc `limit` không quá 100; `status` viết thường đúng enum.
- Socket.IO tới `{origin}/chat` (origin là base URL bỏ `/api/v1`), dùng cho chat và gọi thoại: gửi `conversation:join`, `typing`; nhận `message:*`, `conversation:updated`, `typing`; tự vào lại phòng khi kết nối lại. Gọi thoại cùng hợp đồng với web: nhận `connect:ready` (danh sách `iceServers`), `call:incoming`, `call:ringing`, `call:accepted`, `call:missed`, `call:ended` (có `reason`), `call:offer`, `call:answer`, `call:ice`; gửi có chờ xác nhận `call:invite`, `call:accept`, `call:reject`, `call:cancel`, `call:end`; gửi không chờ `call:ringing`, `call:offer`, `call:answer`, `call:ice`.
- AI chỉ qua `/ai/diagnoses`, `/ai/chat/ask`, `/ai/chat/acknowledgements`, `/ai/feedback` của `backend`; mô tả tối đa 2000 ký tự, câu hỏi 1000, tối đa 3 ảnh. `aiApi` không bao giờ ném lỗi, trả câu dự phòng khi AI không có; 429 trả câu "nhắn hơi nhanh" riêng.
- Video cho thợ: `POST /media/booking-video-upload` (khách hàng, MP4/MOV/WebM tối đa 50 MB) trả `uploadId` như ảnh; `photoUploadIds` của `POST /bookings` nhận tối đa 7 mã, trong đó tối đa 5 ảnh và 2 video. Hợp đồng này nằm ở nhánh backend `feat/po-batch-2026-10-18`, chưa vào `dev`.
- Ảnh đại diện phải tải lên `POST /media/upload` trước rồi mới gửi URL http(s) vào `PATCH /users/me`; `backend` từ chối đường dẫn ảnh trên máy.
- Biến môi trường (chỉ tên): `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_APP_NAME`. Mọi biến `EXPO_PUBLIC_*` đều công khai trong app.

- Wallet summary của Customer vẫn đọc pagination trong `data.meta`; transaction `amount` do Backend trả luôn dương và `balanceAfter` có thể bằng zero, nên giao diện xác định dấu tiền theo `type`. Withdrawal history là endpoint riêng: global HTTP envelope đặt array trong `data` và pagination trong top-level `meta`; không dùng chung adapter summary. Public tracking đặt kết quả trực tiếp trong global envelope `data`.
- C50 PR-C dùng quy tắc ngân hàng/rút tiền từ Backend; luồng thiết bị, xác nhận ngân hàng thật, API runtime và giao dịch tài chính CHƯA KIỂM CHỨNG. Không gửi lệnh rút thật.
- C45 Guest tracking đối chiếu Backend `963fc9f` và Web `aef0258`; 20 Jest mục tiêu, full Jest 285 suites/3412 tests, lint/typecheck/Expo check và Expo Web export đạt. Bundle web dùng fallback map, không có marker native. Native map thực trên thiết bị, 429 runtime và thao tác native clipboard CHƯA KIỂM CHỨNG.

- SEP-139 redesign lấy Backend dev `2c92d6d1a62302c3a2aaa697b05ef4a54f3fa255` làm target. Đã bổ sung contract `checkin_face`, uploaderId, order location, revise phát sinh và status-history; giữ completionNote/paidWarrantyItemIds. GET/readback quyết định trạng thái; POST timeout/401 hoặc GET xác minh lỗi giữ kết quả chưa rõ, không replay tự động.
- Phát sinh không có version: nhiều đề xuất độc lập có thể chờ duyệt, revision tạo ID mới. Đọc lại qua `GET /service-orders/:id/additional-costs` và đối soát ID đã nhận; mất ID không được đoán từ đề xuất mới nhất. Linh kiện dùng `GET /part-requests/:id`; nhận phải đúng pickup/ready hoặc delivery/delivering, sử dụng đúng yêu cầu received và item. Resource lỗi/thiếu không được coi là mảng rỗng cho phép ghi.

## 6. Chạy, kiểm thử và cổng chất lượng

- Node 22.13 trở lên (`.nvmrc` 22.15.0). `npm ci`, `npm start`, quét mã QR LAN bằng Expo Go. Backend cùng máy với Metro: để trống `EXPO_PUBLIC_API_BASE_URL` như `.env.example`. Backend máy khác, cổng khác hoặc Expo tunnel: cấu hình URL rõ ràng trong env cục bộ không theo dõi; coordinator khởi động lại Metro hiện có khi đổi env. Đăng nhập Google trên Android emulator cần `adb reverse tcp:3000 tcp:3000`.
- Cài thư viện native bằng `npx expo install`, không eject, không commit `android/` hay `ios/` (đã gitignore). Gọi thoại cần `react-native-webrtc` và `react-native-incall-manager` (plugin `@config-plugins/react-native-webrtc` trong `app.json` khai quyền micro), nên chỉ chạy trên bản build có mã native: `npx expo run:android` sinh `android/` cục bộ rồi cài lên máy hoặc emulator. Expo Go vẫn chạy mọi màn khác.
- Gate trước mỗi commit: `npm run check:expo`, `npm run lint`, `npm run typecheck`, `npm test`. CI chạy đúng các bước này.
- Test radar lifecycle trong `CustomerMatchingScreen.test.tsx` dùng `act` đồng bộ cho focus/AppState, cleanup cả khi mount lỗi và timeout riêng 15 giây cho cold module loading; timeout Jest chung và các assertion giữ nguyên. GitHub Ubuntu sau sửa CHƯA KIỂM CHỨNG.
- Quy trình nhánh: tách nhánh từ `dev`, PR vào `dev`, CI xanh mới merge; không merge vào `main`.
- Tính năng mới hoặc sửa tính năng phải làm và kiểm tra trên cả `mobile` lẫn `web` khi vai trò đó có trên cả hai.

## 7. Quyết định đã chốt

- Khách chọn 1 đến 2 kỹ thuật viên; ví kỹ thuật viên tối thiểu 200.000 ₫ (PO xác nhận 07/10/2026).
- Hai luồng đặt lịch: thường và có AI; AI chỉ điền sẵn, khách tự bấm đặt.
- Khung lịch Customer giữ hai buổi 08:00–12:00 và 13:00–18:00 theo UTC+7; ngày hợp lệ tính 14 ngày từ giờ Việt Nam, chọn ngày chưa chọn buổi.
- Không có dữ liệu hay luồng giả (PO 07/10/2026): nạp ví chỉ qua VNPay, phản hồi không có `paymentUrl` là lỗi; nạp hay rút bị `backend` từ chối thì hiện đúng thông báo của server.
- Chẩn đoán AI bắt buộc có mô tả, ảnh không bắt buộc (BRX-064).
- Giao diện theo `FIXHOME-DESIGN-SYSTEM.md`: thuật ngữ tiếng Việt thống nhất, tiền dạng `1.250.000 ₫`, giờ theo UTC+7 qua `utils/vn-time`, không hiện mã lỗi cho người dùng.
- Quản lý dịch vụ và admin không có giao diện trên mobile.
- PO 18/10/2026: cuộc gọi bắt đầu ở loa trong, có nút chuyển "Loa to"/"Loa nhỏ"; video khách gửi trong trò chuyện với trợ lý không đưa cho AI phân tích, chỉ lưu kèm booking cho thợ xem.

- SEP-139 owner đã duyệt redesign toàn bộ hai role trên Backend dev mới: auto-start theo server, không bắt buộc khách nghiệm thu trước thanh toán, hỗ trợ Ví FixHome/VNPay/tiền mặt; invoice PAID khác order COMPLETED.
- Ảnh check-in khuôn mặt không được hiển thị cho Customer. Chặn upload ảnh hỗ trợ/bảo hành mới đến khi Backend có phương án riêng tư được duyệt; không dùng media public làm đường thay thế.

## 8. Việc đang dở và rủi ro đã biết

- UX1–UX5 visual: đã xem 13 ảnh AGY trước/sau Luna, nhưng AGY xác nhận cửa sổ resize chỉ đạt 502 CSS px với DPR 1.25, không chứng minh viewport 320/360/390/430dp. Cần chụp lại bằng device emulation và ghi kích thước thực. Customer đăng nhập, bàn phím, fontScale 1.3, Reduce Motion tương tác, native và Web runtime parity CHƯA KIỂM CHỨNG. Không đăng nhập live để chụp Booking/Matching vì GET có thể thay đổi trạng thái; chỉ dùng fixture chặn mạng trước bootstrap.

- C50 PR-A đã nhận diện ledger `withdrawal`/`withdrawal_refund`, chấp nhận `balanceAfter: 0`, và hiển thị chiều tiền theo Backend. C45 KYC API/UI/validation, C50 PR-C bank/rút tiền và Guest map có unit tests. Expo Web Guest Home/PublicOrderTracking đã kiểm tra ở 320/360/390/430dp: không tràn ngang, shortcut và route hiển thị, focus bàn phím và lỗi form rỗng hoạt động. Authenticated wallet/KYC/withdrawal trên browser, native safe-area/IME, native map thực, signed PUT, tài khoản Backend thật, payout/finance E2E và Web parity CHƯA KIỂM CHỨNG. Không có KYC hoặc giao dịch tài chính thật được gửi.
- Expo Web còn một React DOM console warning từ `MessageCircle` trong `CustomerHomeScreen` do thuộc tính `accessible={false}`; không thuộc thay đổi visual này.

- SEP-135/136 Auth được phép triển khai: first-run, session bootstrap và logout dùng root stack theo phiên/vai trò. Backend source xác nhận login `identifier` nhận email hoặc số điện thoại; UI phản ánh đúng contract. Không đổi token storage, interceptor refresh hoặc quyền Backend. Kiểm tra đăng nhập trên iPhone thật còn CHƯA KIỂM CHỨNG.
- FH-MAIN-01 HOLD Finance: `src/api/orders.api.ts` giữ `toMoney` dev; các test WIP yêu cầu từ chối null/invalid monetary fields trong `src/api/orders.api.test.ts` chưa nhập, cần Finance owner quyết định trước khi đổi parser. Test GET history/privacy và malformed page đã nhập. Glass giữ liquid glass, responsive opt-in và năm tab Technician; bổ sung prop nhãn tùy chọn, chưa bật trên Technician.
- SEP-139 redesign: source M1–M5 đã đạt gate scoped cho các chức năng hiện có; chụp ảnh phát sinh mới chuyển tiếp M6 AFTER, M6 logic AFTER/completion/ví/VNPay/tiền mặt và hooks production đã bàn giao với 9 suites/118 tests, typecheck/owned lint đạt; review tài chính độc lập phát hiện một lỗi HTTP400/422; OpenCode sửa scoped, lead kiểm chứng lại 33 tests và đóng M6 logic source gate. M6 UI/capture return/root wallet linking đã đạt source gate sau sửa scoped; còn M7–M8 aftercare/cutover và QA luồng thật. M6 request-completion chỉ mở retry cho lỗi 409/EVIDENCE_REQUIRED_AFTER đã chứng minh rollback, không áp dụng tiền mặt hoặc 409 khác. Route production đã thay ở M8; thiết bị, native và luồng thật CHƯA KIỂM CHỨNG. QA Backend riêng đúng target đã khởi động và seed/migration trên database mới; sau checkpoint server ngừng, đã khôi phục đúng sandbox trên tiến trình QA riêng sau khi owner mở Docker Desktop, không chạy lại migration/seed; runtime đơn, device/Web parity, bàn phím/safe area và payment sandbox CHƯA KIỂM CHỨNG. Target Backend auto-start; start-repair chỉ recovery có điều kiện, không thêm gate thủ công bình thường. Giữ giới hạn onboarding 40 km hiện có.
- SEP-139 M7 UI đã nối màn Customer đánh giá tùy chọn, bảo hành/yêu cầu/phản hồi, support theo đơn/booking, hủy đơn/booking và inbox/tác vụ bảo hành Technician với hook production đã khóa. Booking dùng bookingId riêng; claim warranty dùng claimId riêng; Support chỉ hiển thị số yêu cầu đang mở đã biết là lower bound; P6 tiếp tục chặn upload ảnh mới. Màn Thông tin đơn của OrderFlow có lối vào Nhắn tin (`ChatThread`) như màn cũ. `CustomerWarrantiesScreen.submitClaim` vẫn gọi trực tiếp `ordersApi.createWarrantyClaim` sau helper `isWarrantyCoverageClaimable`; đã bỏ ở M8: danh sách bảo hành chỉ điều hướng vào `CustomerWarranty` của OrderFlow (`CustomerOrderDetail` với `screen`), không còn POST trực tiếp. Backend runtime cổng 3000 đang thiếu meta mine theo cảnh báo 14/10; không nới validator hoặc đổi server, warranty runtime CHƯA KIỂM CHỨNG. Confirmation UI khóa toàn bộ bản nháp trong lúc xác minh, chờ xác nhận và gửi; người dùng phải chọn sửa để hủy DTO đã chuẩn bị. Khi đổi bookingId, coverageId hoặc claimId, màn hình xóa bản nháp cục bộ và confirmation cũ; thao tác chuẩn bị của Technician nằm ở footer cố định. Chưa kiểm chứng runtime hoặc thiết bị.
- FH-MAIN-01: Web parity, visual/runtime và thiết bị/E2E CHƯA KIỂM CHỨNG; coordinator làm QA cuối và Git. Không khởi động hoặc dừng Expo/backend. Giữ mapping asset tối ưu hiện có; không nhập hai ảnh onboarding legacy vì runtime đã dùng asset tương đương được theo dõi.

- Thay đổi ngày 07/10/2026 mới chạy gate, CHƯA KIỂM CHỨNG trên thiết bị (ảnh đại diện kỹ thuật viên, nút gửi AI, ví).
- Gọi thoại 18/10/2026: chưa build `npx expo run:android` lần nào, cuộc gọi thật giữa hai máy, loa trong/loa ngoài và quyền micro CHƯA KIỂM CHỨNG. `react-native-webrtc` ghim `~124.0.8` để khớp plugin `@config-plugins/react-native-webrtc` 15; chạy được với React Native 0.86 kiến trúc mới hay không CHƯA KIỂM CHỨNG. iOS chưa thử.
- Backend nhánh `feat/po-batch-2026-10-18` khoá chat khách và thợ khi đơn hoàn tất (gửi tin trả 409 `CONVERSATION_CLOSED`, hội thoại có `closedReason`), mở lại khi có yêu cầu bảo hành, gửi được ảnh hoặc video trong chat và phát `order:updated` khi đơn đổi. Mobile vẫn theo `canSend` nên hội thoại đã khoá hiện "Cuộc trò chuyện này chỉ còn xem lại được." và ẩn nút gọi, nhưng chưa đọc `closedReason` để nói lý do và dẫn tới bảo hành, chưa có nút gửi ảnh hoặc video trong chat, chưa nghe `order:updated` (đợt 18/10 chỉ làm gọi thoại và trợ lý AI); hội thoại bị khoá trong lúc đang mở màn thì lần gửi sau hiện câu lỗi chung. Màn booking hoặc đơn của mobile chưa có trình xem video, video thợ nhận được chỉ xem trên web.
- SEP-136: một màn Lịch làm việc chứa editor khung giờ tuần theo ngày, preset/giờ chính xác, ngày nghỉ với chọn ngày và lịch đơn hiện có. Một màn Khu vực hoạt động chứa vị trí/bán kính và quận/huyện. Giữ payload lưu hiện hành, ngày tuần Sunday=0, khoảng giờ đã lưu, giới hạn 40 km, GPS/camera và tài chính. Bàn phím/safe area đã xử lý trong source; thiết bị còn CHƯA KIỂM CHỨNG.
- Chưa có push notification (`expo-notifications` đã cài nhưng chưa dùng); ảnh booking đã có upload adapter/controller nhưng runtime CHƯA KIỂM CHỨNG; khu vực phục vụ có màn chỉnh sau onboarding.
- Chưa có cấu hình EAS và bundle id. Root đã xử lý cold/warm return `fixhome://app/wallet` bằng đích an toàn cho Customer và GET-only refresh, bỏ mọi query payload; luồng Google/Technician giữ nguyên. OS delivery/native chưa kiểm chứng.
- Các hàm API chưa dùng trong UI production: `completeRepair`, `payInvoice`, `getWarranties`. `getStatusHistory` đã nối vào adapter redesign nhưng UI chưa cutover.
- Repo đang theo dõi `CLAUDE.md` và `.claude/settings.json` từ commit đầu; luật chung của nhóm không đưa cấu hình công cụ AI vào repo. Chờ PO quyết có gỡ hay không.
- Tài liệu audit ngày 23 và 24/09 trong `docs/` là ảnh chụp lịch sử, không phản ánh hiện trạng.

- SEC-01: Backend evidence GET vẫn trả face cho Customer đầy đủ quyền; Mobile lọc trước publish resource nhưng không thay thế phân quyền Backend. SEC-02/P6: upload support/warranty mới bị khóa theo quyết định owner. Không có API Customer/Technician đọc số ảnh tối thiểu; tách eligibility gửi completion để server kiểm tra khỏi readiness đã chứng minh, không gọi admin config.

## 9. Nhật ký cập nhật context

- 2026-10-18 04:09 (UTC+7) | ToanAltF4 | feat/mobile-call-ai-chat | Gọi thoại như web (nút gọi trong chat, màn cuộc gọi chung, nút Loa to/Loa nhỏ, cần bản build native) và trợ lý AI như web (trả lời nhanh, Đúng ý/Chưa đúng, video gửi kèm cho thợ không qua AI, ảnh và video theo sang form đặt lịch).
- 2026-10-17 23:40 (UTC+7) | foxonworld | feat/customer-symptom-chips-20261017 | Thêm chip triệu chứng theo dịch vụ/nhóm Web, thêm/bỏ giữ mô tả tự nhập/AI và 5.000 ký tự; hiển thị chỉ dẫn vuốt ngang dải ngày Booking. Giữ nguyên lịch 14 ngày, urgency và API.
- 2026-10-17 20:46 (UTC+7) | foxonworld | feat/technician-reputation-parity-20261017 | Thống nhất card uy tín compact hai vai trò, sheet quy định/lịch sử và cảnh báo server luôn hiện; giữ riêng chip Độ tin cậy, native visual/runtime CHƯA KIỂM CHỨNG.
- 2026-10-17 20:08 (UTC+7) | foxonworld | integration/mobile-c50-c45-reviewed-20261017 | Thu hẹp async act, bảo đảm cleanup và đặt timeout riêng 15 giây cho test radar Matching; CI Ubuntu sau sửa CHƯA KIỂM CHỨNG.
- 2026-10-17 18:20 (UTC+7) | foxonworld | integration/mobile-c50-c45-20261017 | Tích hợp lịch tháng và CTA với UI/clearance, lịch nhận việc và ký quỹ từ dev; giữ C50/C45, lịch sử hai nhánh và dọn cleanup test bộ lọc thông báo; runtime CHƯA KIỂM CHỨNG.
- 2026-10-17 17:48 (UTC+7) | foxonworld | feat/mobile-c50-c45-20261017 | Booking Customer giữ hai buổi sáng/chiều; lịch 14 ngày có lịch tháng, không chọn buổi ngầm và làm mới theo focus/app/time.
- 2026-10-17 16:50 (UTC+7) | foxonworld | feat/mobile-c50-c45-20261017 | Polish Customer: reset shortcut, đủ mã vệ sinh catalog, nhãn TV đúng phạm vi, cutout plumbing riêng, catalog dễ đọc, CTA trong vùng chạm và sheet uy tín truy cập được; chờ AGY recapture viewport thật.
- 2026-10-17 16:39 (UTC+7) | Hgnv11 | feat/mobile-layout-polish | Nhãn booking đóng thành Chưa có thợ nhận, giờ hẹn bỏ giây, hàng tùy chọn của thẻ Hoạt động gọn lại, nút trên màn cùng kích cỡ; thiết bị CHƯA KIỂM CHỨNG.
- 2026-10-17 16:23 (UTC+7) | foxonworld | feat/mobile-c50-c45-20261017 | UX1–UX5: định tuyến catalog theo service code, booking hai bước/review riêng, receipt gọn, radar matching có điều kiện, reputation customer sheet và CTA giữa nổi; thiết bị/visual QA CHƯA KIỂM CHỨNG.
- 2026-10-17 16:18 (UTC+7) | Hgnv11 | feat/mobile-layout-polish | Trang chủ và Đơn của tôi của khách chừa đủ chỗ dưới đáy để thanh tab không che dòng cuối; thiết bị CHƯA KIỂM CHỨNG.
- 2026-10-17 15:19 (UTC+7) | Hgnv11 | feat/mobile-layout-polish | Nhãn truy cập cho 14 ô nhập, khung xám cho bốn danh sách, nút Thử lại khi đọc đơn lỗi ở OrderTaskScreen; thiết bị CHƯA KIỂM CHỨNG.
- 2026-10-17 15:10 (UTC+7) | Hgnv11 | feat/mobile-layout-polish | Thống nhất cỡ và độ đậm tiêu đề màn (18 có nút Quay lại, 24 màn gốc tab), bo góc 13 thành 14; thiết bị CHƯA KIỂM CHỨNG.
- 2026-10-17 14:53 (UTC+7) | Hgnv11 | feat/mobile-layout-polish | Năm bottom sheet (địa chỉ x2, cách đặt lịch, xem lại yêu cầu, sửa hồ sơ) co theo nội dung thay cho chiều cao cố định; thiết bị CHƯA KIỂM CHỨNG.
- 2026-10-17 14:41 (UTC+7) | Hgnv11 | feat/mobile-layout-polish | Chuẩn hóa khoảng cách về lưới 4/8/12/16 ở 48 màn, chữ tối thiểu 12, bỏ hai dòng chú thích ở Home khách; thiết bị CHƯA KIỂM CHỨNG.
- 2026-10-17 14:40 (UTC+7) | Hgnv11 | feat/mobile-layout-polish | Chuẩn hóa khoảng cách về lưới 4/8/12/16 ở 48 màn, chữ tối thiểu 12, bỏ hai dòng chú thích ở Home khách; thiết bị CHƯA KIỂM CHỨNG.
- 2026-10-17 14:24 (UTC+7) | Hgnv11 | feat/web-parity-home-candidates | Home khách có lối tắt Ví và Bảo hành, màn chọn thợ ghi Theo báo giá khi chưa có giá công; thiết bị CHƯA KIỂM CHỨNG.
- 2026-10-17 14:15 (UTC+7) | Hgnv11 | feat/web-parity-labels | Bảo hành nêu hạng mục và số ngày còn lại, lọc thông báo chưa đọc, trạng thái nhận việc theo lịch và chặn bật khi ví thiếu ký quỹ, cảnh báo trừ điểm khi hủy đơn; thiết bị CHƯA KIỂM CHỨNG.
- 2026-10-17 14:00 (UTC+7) | foxonworld | feat/mobile-c50-c45-20261017 | Thay acronym KYC hiển thị trong tiến trình rút tiền và thông báo lỗi bằng thuật ngữ “xác minh danh tính”; status/API giữ nguyên.
- 2026-10-17 13:51 (UTC+7) | foxonworld | feat/mobile-c50-c45-20261017 | C50/C45 owner visual polish: shortcut Guest/Customer, copy mã ở CompletedOrder Customer, wallet và Withdrawal/KYC; 12 suites/125 focused tests PASS, Expo Web guest viewport 320–430dp PASS; không gửi API KYC, ngân hàng hoặc rút tiền thật.
- 2026-10-17 02:11 (UTC+7) | foxonworld | feat/mobile-c50-c45-20261017 | Ổn định test AppState unresolved bằng GPS fixture tạo theo test, `Date.now` cố định và flush lifecycle qua `act`; serial lẫn regular Jest đều 285/3412 PASS, lint/typecheck/check:expo PASS.
- 2026-10-17 02:08 (UTC+7) | foxonworld | feat/mobile-c50-c45-20261017 | C45 map parity: 20 Jest mục tiêu, full Jest 285/3412, typecheck/lint/Expo check và web export đạt; native map runtime CHƯA KIỂM CHỨNG.
- 2026-10-17 02:04 (UTC+7) | foxonworld | feat/mobile-c50-c45-20261017 | Sửa C45 tracker đọc trực tiếp `data`, withdrawal history đọc top-level `data`/`meta`, và guard `stopPropagation`; full Jest 285/3411, focused 24/24, lint/typecheck/Expo check PASS.
- 2026-10-17 01:56 (UTC+7) | foxonworld | feat/mobile-c50-c45-20261017 | C45 xóa mốc GPS sau khi map hết hạn; Jest bao phủ GPS mới/thiếu/cũ, đơn kết thúc, blur và background; native runtime CHƯA KIỂM CHỨNG.
- 2026-10-17 01:53 (UTC+7) | foxonworld | feat/mobile-c50-c45-20261017 | C45 thêm map native marker GPS/địa chỉ đích có điều kiện freshness/lifecycle; Expo Web dùng fallback không tải `react-native-maps`.
- 2026-10-17 01:42 (UTC+7) | foxonworld | feat/mobile-c50-c45-20261017 | PR-D thêm tra cứu đơn Guest theo mã + điện thoại, giới hạn chung manual/poll 5/60 giây, 429 backoff, kiểm soát focus/background/stale GPS và copy đúng `order.code` ở hai màn Customer; focused 15 suites/124 tests, full Jest 285 suites/3402 tests, lint/typecheck/check:expo/diff check đạt; native/runtime CHƯA KIỂM CHỨNG.
- 2026-10-17 01:29 (UTC+7) | foxonworld | feat/mobile-c50-c45-20261017 | PR-C thêm quản lý ngân hàng, rút tiền một lần không replay khi ACK chưa rõ, đối soát GET và lịch sử phân trang với ba status thật; focused 3 suites/18 tests, API runtime/thiết bị/giao dịch tài chính CHƯA KIỂM CHỨNG.
- 2026-10-17 01:20 (UTC+7) | foxonworld | feat/mobile-c50-c45-20261017 | PR-B thêm KYC Customer với kiểm tra tuổi/ngày Việt Nam, hai ảnh CCCD riêng theo MIME/đuôi/owner path, signed XHR có timeout/abort và status; focused 4 suites/22 tests, lint/typecheck đạt; runtime Backend và thiết bị CHƯA KIỂM CHỨNG.
- 2026-10-17 01:09 (UTC+7) | foxonworld | feat/mobile-c50-c45-20261017 | PR-A chốt kiểm thử đủ bảy loại ledger, `amount` dương và `balanceAfter` không âm (kể cả zero), từ chối loại không biết hoặc giá trị malformed; focused Jest xanh, chưa có thao tác tài chính thật.
- 2026-10-17 00:56 (UTC+7) | foxonworld | feat/mobile-c50-c45-20261017 | PR-A mở rộng parser ví cho hai loại ledger rút tiền và trình bày đúng nhãn/chiều tiền; chưa có thao tác tài chính thật.
- 2026-10-16 11:21 (UTC+7) | Hgnv11 | feat/sep139-group-b | Tạo booking chọn buổi sáng/chiều hoặc Tới ngay và ghi chú cho thợ như web, bỏ chọn giờ bắt đầu tự do; thiết bị CHƯA KIỂM CHỨNG.
- 2026-10-16 11:06 (UTC+7) | Hgnv11 | feat/sep139-group-b | Nhóm B SEP-139 (tự nhận việc, đặt lại thợ, uy tín, bảo hành mặc định, thu nhập theo kỳ, lưới lịch) và nhãn/thông báo tiếng Việt theo web; thiết bị CHƯA KIỂM CHỨNG.
- 2026-10-15 14:41 (UTC+7) | Hgnv11 | feat/sep139-m8-cutover | Màn nhiệm vụ không bị gỡ khi đơn hoặc tài nguyên tải lại hay có lệnh chờ (ảnh khuôn mặt, ảnh trước/sau, link VNPay); VNPay mở tự động sau xác nhận và gửi header x-client-platform mobile để backend trả về fixhome://app/order-payment; dấu lệnh VNPay quá 15 phút mà hoá đơn chưa trả thì mở khoá; thư viện ảnh gọi ảnh khuôn mặt đúng tên; thiết bị và E2E CHƯA KIỂM CHỨNG
- 2026-10-15 10:04 (UTC+7) | Hgnv11 | feat/sep139-m8-cutover | Mọi header dùng một nút Quay lại chung `components/BackButton` (44pt, mũi tên Ionicons, về Home đúng vai trò khi không có màn trước); nút số lượng linh kiện 44pt; thiết bị CHƯA KIỂM CHỨNG.
- 2026-10-14 23:34 (UTC+7) | Hgnv11 | feat/sep139-m8-cutover | M8 chuyển route chi tiết đơn hai vai trò sang OrderFlow, bỏ POST claim trực tiếp, thêm lối vào Nhắn tin; thiết bị và E2E CHƯA KIỂM CHỨNG.
- 2026-10-14 21:14 (UTC+7) | foxonworld | foxonworld/sep139-order-flow-redesign | Khóa bản nháp sau prepare, thêm thao tác sửa confirmation, dọn state khi đổi mục tiêu Booking/claim và chuyển CTA Technician vào footer; kiểm thử source đạt, thiết bị/runtime CHƯA KIỂM CHỨNG.
- 2026-10-14 20:54 (UTC+7) | foxonworld | foxonworld/sep139-order-flow-redesign | Bổ sung UI hậu mãi M7 nối hook đã khóa và ghi rõ đường tạo claim trực tiếp cũ cần parity M8; runtime warranty chưa xác minh.
- 2026-10-14 14:23 (UTC+7) | foxonworld | foxonworld/sep139-order-flow-redesign | Đóng source M6 với các sửa tiền/return/capture/recovery, ghi render ví thật và giới hạn runtime; M7–M8 chưa triển khai, không publish.
- 2026-10-14 13:03 (UTC+7) | foxonworld | foxonworld/sep139-order-flow-redesign | Đóng M6 logic source gate sau review tài chính và sửa rollback ví HTTP422, lead xác minh 33 tests; M6 UI/root linking/capture return còn chờ.
- 2026-10-14 12:49 (UTC+7) | foxonworld | foxonworld/sep139-order-flow-redesign | Bàn giao M6 logic và gate 118 tests, ghi review tài chính đang chờ, sửa wallet HTTP envelope và cập nhật QA/render danh sách rỗng hai vai trò; UI/cutover/native/payment còn chưa kiểm chứng.
- 2026-10-14 05:55 (UTC+7) | foxonworld | foxonworld/sep139-order-flow-redesign | Đóng source gate UI M5, giữ capture mới chuyển tiếp M6 AFTER; QA sandbox đã khôi phục và Expo Web dev export thực đạt, native/render chưa kiểm chứng.

### Lịch sử giữ lại khi tích hợp

40 mục mới nhất ở trên; các mục cũ dưới đây được giữ nguyên từ hai nhánh để không mất lịch sử.

> - 2026-10-13 17:50 (UTC+7) | foxonworld | foxonworld/sep139-order-flow-redesign | SEP-139 sửa số tiền dạng chuỗi, tuần tự hóa ghi chú và thêm làm mới chi tiết; runtime và cutover chưa kiểm chứng.
> - 2026-10-13 17:30 (UTC+7) | foxonworld | foxonworld/sep139-order-flow-redesign | SEP-139 bổ sung preview native chỉ đọc theo role, chi tiết tải một lần và ghi chú bảo vệ phiên; UI production và runtime còn chưa cutover/kiểm chứng.
> - 2026-10-13 13:32 (UTC+7) | foxonworld | foxonworld/sep139-order-flow-redesign | SEP-139 thêm nền session/resolver/readback và journal, cập nhật contract Backend dev/privacy owner; UI cutover và runtime còn chưa kiểm chứng.
> - 2026-10-13 02:11 (UTC+7) | foxonworld | integration/mobile-v2-gate-review | SEP-139 Technician mở toàn bộ chi tiết thành scene riêng, Back khôi phục chính xác bước trước; thêm regression test, device QA còn chờ.
> - 2026-10-13 02:04 (UTC+7) | foxonworld | integration/mobile-v2-gate-review | SEP-139 nối explicit start-repair và readback, chuyển order detail sang stage/action hiện hành với progress sheet; full-details, thiết bị và review cuối còn CHƯA KIỂM CHỨNG.
> - 2026-10-13 00:48 (UTC+7) | foxonworld | integration/mobile-v2-gate-review | SEP-137 bổ sung hoàn thiện khu vực địa chỉ Booking, rút gọn Booking/Matching và timeline Customer Order theo dữ kiện GET, giữ toàn bộ chi tiết và safety controllers.
> - 2026-10-12 23:42 (UTC+7) | foxonworld | integration/mobile-v2-gate-review | SEP-136 đổi lịch tuần dọc, editor theo yêu cầu và sao chép bản nháp T2–T6; đồng bộ account shell và nút đăng xuất cuối scroll của hai role, giữ API và auth guards.
> - 2026-10-12 23:03 (UTC+7) | foxonworld | integration/mobile-v2-gate-review | SEP-135 sửa API native dev theo host Metro; SEP-136 triển khai first-run/Guest Home dùng chung, handoff auth, lịch/khu vực hợp nhất và tab Ví; giữ guard dev, thiết bị chờ QA.
> - 2026-10-12 21:52 (UTC+7) | foxonworld | integration/mobile-v2-gate-review | Tích hợp source production Customer và Technician, GET history an toàn, giữ guard dev và ghi hunk Auth/Finance/workflow HOLD cùng giới hạn QA.
> - 2026-10-12 21:10 (UTC+7) | foxonworld | integration/mobile-v2-gate-review | Port UI demo hai vai trò, giới thiệu/Guest qua Login và hai thanh tab, giữ API dev, role handoff, các gate Auth/Finance và thiết bị chưa kiểm chứng.
> - 2026-10-12 20:45 (UTC+7) | foxonworld | integration/mobile-v2-gate-review | Đối chiếu source SEP-132: page fail-closed, glass responsive opt-in, route thông báo thợ và các gate Auth/Finance còn chờ.
> - 2026-10-09 00:17 (UTC+7) | ToanAltF4 | feat/technician-certificates | Đăng ký thợ: chứng chỉ không bắt buộc (bản công chứng), câu nhắc đến trụ sở sau khi nộp hồ sơ.
> - 2026-10-09 00:08 (UTC+7) | ToanAltF4 | feat/technician-order-steps | Thợ: check-in mở camera chụp sản phẩm, bỏ nút bắt đầu sửa, hoàn thành kèm ảnh, chỉ dùng camera, nút cần thay đổi thợ.
> - 2026-10-08 23:43 (UTC+7) | ToanAltF4 | feat/technician-sessions | Thợ: lịch hẹn theo buổi, ghi chú khách, nút xuất phát theo giờ cho phép, gửi GPS mỗi 5 phút, bán kính 40 km.
> - 2026-10-08 21:49 (UTC+7) | ToanAltF4 | feat/customer-extend-matching-and-tech-areas | Khách gia hạn thời gian chờ thợ; thợ sửa khu vực phục vụ sau onboarding.
> - 2026-10-07 22:05 (UTC+7) | ToanAltF4 | fix/technician-quote-status-label | Trạng thái báo giá hiện bằng chữ ở màn của kỹ thuật viên, dùng chung utils/quote-status.ts.
> - 2026-10-07 19:31 (UTC+7) | ToanAltF4 | fix/no-fake-data-and-po-decisions | Ghi việc gỡ dữ liệu giả, ảnh đại diện kỹ thuật viên, BRX-064 và thông báo mới; bỏ rủi ro ảnh file:// đã sửa
> - 2026-10-07 14:43 (UTC+7) | ToanAltF4 | docs/repo-context | Tạo file context theo bộ quy tắc chung của bốn repo, ghi hiện trạng sau đợt sửa lỗi ngày 07/10/2026
