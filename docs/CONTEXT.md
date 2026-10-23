# Context repo mobile — FixHome

> Cập nhật lần cuối: 2026-10-23 16:19 (UTC+7) · Người cập nhật (git): Hgnv11 · Nhánh: dev

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
- Tóm tắt AI cho thợ đã làm ở mục "Thợ xem việc trước khi nhận" dưới. Gọi thoại và trợ lý AI đã làm ở mục sau đó.

### Gọi thoại và trợ lý AI như web (18/10/2026, nhánh `feat/mobile-call-ai-chat`)

- PO 18/10/2026: đợt này mobile chỉ làm gọi thoại và trợ lý AI cho giống web, không đụng phần khác.
- Gọi thoại: nút gọi ở đầu `ChatThreadScreen` khi server cho nhắn (`canSend`); một `CallOverlay` gắn ở gốc `AppNavigator` khi đã đăng nhập, nên cuộc gọi không mất khi đổi màn. Trạng thái và câu hiển thị theo web (`store/call.store.ts`): đang gọi, đang đổ chuông, cuộc gọi đến, đang kết nối, đang nói chuyện kèm đồng hồ, kết thúc kèm lý do và nút Gọi lại khi được. Nút Micro, nút "Loa nhỏ"/"Loa to" (bắt đầu ở loa trong, chạm để chuyển loa ngoài, qua `react-native-incall-manager`), nút Kết thúc. Mỗi yêu cầu gửi server chờ tối đa 8 giây, không trả lời coi như bị từ chối.
- Âm thanh và WebRTC nạp lười (`services/call-native.ts`, `services/webrtc-call.service.ts`): Expo Go không có mã native nên nút gọi chỉ báo "Gọi thoại cần bản cài đặt FixHome đầy đủ (không chạy trong Expo Go).", mọi màn khác chạy như cũ. Android xin quyền micro trước khi gọi.
- Trợ lý AI (`CustomerAIChatScreen`, luật thuần ở `ai-chat-logic.ts`): câu trả lời hiện dần theo từ (tắt khi bật giảm chuyển động), nút trả lời nhanh Rồi/Chưa/Không rõ hoặc Có/Không/Không rõ cho câu hỏi có/không, "Đúng ý"/"Chưa đúng" kèm góp ý dưới câu trả lời mới nhất (`POST /ai/feedback`), dịch vụ chung chung không thay dịch vụ cụ thể đã tìm ra, nút "Đặt thợ" chỉ hiện khi trợ lý trả lời xong và chỉ nằm ở thanh ghim (thẻ chẩn đoán chỉ liệt kê dịch vụ gợi ý), gửi quá nhanh (429) có câu riêng.
- Ảnh và video trong trò chuyện với trợ lý (PO 18/10/2026): mỗi cuộc trò chuyện tối đa 3 ảnh và 2 video (bộ đếm "Ảnh x/3 · Video y/2", câu "Mỗi cuộc trò chuyện gửi được tối đa 3 ảnh và 2 video."); quay hoặc chọn video MP4/MOV/WebM tối đa 60 giây (dài hơn thì báo, máy không cắt được), video không gửi cho AI. Video được nén ngay khi chọn (`services/video-shrink.ts`, `react-native-compressor` 2.0.3 nạp lười: H.264 ≤ 1280 px ~1,2 Mbit/s; file dưới 5 MB, không nhỏ đi, lỗi hoặc treo quá 2 lần thời lượng + 15 giây thì gửi bản gốc), khi đó chọn được file gốc tới 600 MB; Expo Go không có module nén nên bản gốc phải ≤ 50 MB. Toạ độ GPS trong video do server xoá.
- Tải lên ở nền ngay khi gửi (`screens/customer/chat-upload-queue.ts`): ảnh trong chat (đổi sang JPEG) và video đã nén lên `POST /media/booking-photo-upload` và `POST /media/booking-video-upload` từng tệp một, có tiến độ (`onUploadProgress`), không timeout cố định (`services/upload-retry.ts`: đứng 45 giây không nhích mới bỏ, byte cuối đã đi thì chờ server trả lời tới 3 phút, thử lại 4 lần cách 2/5/10 giây); dưới tin có dòng "Đang nén video x%", "Đang gửi video cho thợ x%", "Video đã gửi kèm cho thợ", lỗi kèm "Thử lại". Bấm "Đặt thợ": còn tệp đang gửi thì hỏi "Chờ thêm" hay "Đặt thợ không kèm"; có tệp lỗi thì hỏi "Thử lại" hay "Đặt thợ không kèm"; mã đã tải xong đi theo `prefill.attachmentUploadIds` (ảnh trước, rồi video) qua màn mô tả tới form đặt lịch. Form ghi "Gửi kèm từ trò chuyện với trợ lý: N ảnh, M video" kèm nút Bỏ; khi gửi, ảnh của form đứng trước, ảnh từ chat chỉ thêm khi còn chỗ trong 5 ảnh, video tối đa 2 (`bookingMediaIds`).
- Unit test: `ai-chat-logic.test.ts`, `CustomerAIChatScreen.parity.test.tsx`, `chat-upload-queue.test.ts`, `video-shrink.test.ts`, `upload-retry.test.ts`, `CallOverlay.test.tsx`, `call.store.test.ts`, `chat-socket.calls.test.ts`, hai ca ở `CustomerBookingCreateScreen.test.tsx`. Cuộc gọi trên thiết bị thật, nén video trên máy thật, video thật và API thật CHƯA KIỂM CHỨNG.

### Thợ xem việc trước khi nhận (19/10/2026, nhánh `feat/technician-job-preview`)

- PO 18/10/2026, như web: lời mời `GET /invitations/my` có thêm `booking.description` (backend đã che số điện thoại và email gõ trong mô tả), `aiSummary`, `media[]`, `pricingMode`, `fixedUnitPrice`, `distanceBand {minKm, maxKm|null}`. `bookingsApi.getMyInvitations` chỉ giữ các trường này theo allowlist; `media` bỏ mục thiếu `id` hoặc `mimeType`, mục riêng tư không bao giờ mang `url`. Vẫn không có số điện thoại, địa chỉ cụ thể, toạ độ, ghi chú riêng.
- Thẻ lời mời hiện khu vực kèm dải khoảng cách ("Cách bạn dưới 1 km", "khoảng 3-5 km", "hơn 40 km"; không đo được thì ẩn) và hai dòng mô tả. Mở "Xem & quyết định" thì có thêm "Khách mô tả", giá ("Giá niêm yết ... × số lượng" hoặc "Báo giá sau khi kiểm tra tại nhà khách"), nút xem tóm tắt vấn đề từ AI (mở tại chỗ, kèm câu "gợi ý sơ bộ"), ảnh và video (`components/technician/InvitationJobDetails.tsx`, `BookingMediaViewer.tsx`).
- Ảnh riêng tư tải bằng `<Image>` kèm `Authorization` (`GET /bookings/:id/media/:mediaId/content`). Video phát bằng `expo-video` qua link ngắn hạn `GET /bookings/:id/media/:mediaId/stream` (`mediaApi.getBookingVideoLink`), chỉ xin link khi thợ chạm vào ô video, lỗi thì chạm để thử lại. Chạy của `expo-video` trong Expo Go CHƯA KIỂM CHỨNG.
- Test: `booking-contract.api.test.ts`, `invitation-view.test.ts`, `InvitationJobDetails.test.tsx`. Phát video và tải ảnh riêng tư trên thiết bị thật, và với backend thật, CHƯA KIỂM CHỨNG.

### Giá công trên thẻ dịch vụ (19/10/2026, nhánh `feat/catalog-price-summary`)

- Backend `dev` (#catalog V2) thêm `priceSummary {kind: fixed_range|inspection_reference|inspection_only, minLaborVnd, maxLaborVnd, suggestedLaborVnd?}` vào dịch vụ trong `/services`, `/categories` và chi tiết. Mobile đọc ở `ServiceItem.priceSummary`; danh sách chọn dịch vụ và khung dịch vụ đã chọn ở `CustomerBookingCreateScreen` ưu tiên `utils/service-price-summary.ts` (cùng câu chữ với web: khoảng giá công, "Tham khảo ...", "Khảo sát & báo giá"), thiếu trường thì giữ cách hiện cũ. Chỉ để xem, không dùng cho tổng tiền hay điều kiện đặt. Test `service-price-summary.test.ts`; runtime với backend bật Catalog V2 CHƯA KIỂM CHỨNG (DEV chung đang tắt).
- Đợt backend này không còn việc nào chưa làm trên mobile, trừ phần quản lý dịch vụ nhận linh kiện hoàn trả (chỉ có ở console web).

### Thông tin thiết bị và phạm vi tiền công khi đặt lịch (19/10/2026, nhánh `feat/booking-device-pricing`)

- P012 như web: với dịch vụ có mã Catalog V2 và không đi từ trợ lý AI, bước 1 của `CustomerBookingCreateScreen` hiện `ServiceDeviceDetails`. Màn gọi `GET /services/:id/catalog-v2-pricing` (`api/catalog-pricing.api.ts`), chỉ hỏi thông tin server còn thiếu (treo tường/âm trần, HP, cửa máy giặt, kg), cho chọn phạm vi khi server yêu cầu, và chỉ hiện giá cố định kèm tên phạm vi khi server trả `FIXED_PRICE`; khoảng giá chỉ mang nhãn "Giá tham khảo — thợ khảo sát và báo giá, khách duyệt". Mobile không tự tính hay chỉnh tiền.
- `POST /bookings` mang thêm `deviceAttributes` và `selectedVariantCode` (chỉ sau khi preview xác nhận `FIXED_PRICE`); server tự khoá phạm vi trong transaction. Đổi dịch vụ hoặc đổi thông tin thì xoá kết quả cũ ngay. Nút "Tiếp tục" bị chặn tới khi preview khớp dịch vụ (`isCatalogV2PreviewReady`); dịch vụ cũ và luồng AI không bị chặn.
- Dịch vụ cũ (không có mã Catalog V2) không hiện mục này và đặt lịch chạy như cũ (DEV chung đang tắt Catalog V2). Dịch vụ có mã V2 mà preview lỗi, kể cả 403/404/501/503, thì hiện "Chưa tải được thông tin giá" kèm Thử lại và chưa cho tiếp tục (giống web, không ẩn mục để tránh kẹt không lối ra). Test: `catalog-pricing.api.test.ts`, `ServiceDeviceDetails.test.tsx`, `customer-booking-review.test.ts`. Runtime với backend bật Catalog V2 và trên thiết bị CHƯA KIỂM CHỨNG.

### Thợ khai trả linh kiện FixHome (19/10/2026, nhánh `feat/technician-part-returns`)

- P1 như web (owner lock 19/10/2026): trong `technician-parts-section.tsx` (màn đơn của thợ), mỗi dòng linh kiện FixHome đã nhận qua QR có khối "Hoàn trả" đọc `GET /service-orders/:orderId/part-returns`: "Cấp / Dùng / Cần trả", dòng "Đang chờ quản lý xác nhận" hoặc "Đã nhận", và nút "Khai trả" chọn số lượng (nguyên, từ 1 tới phần còn phải trả chưa khai) rồi gửi `POST /part-requests/:requestId/items/:itemId/declare-return {quantity, expectedVersion, idempotencyKey}`. Khai trả chưa phải là đã trả xong; quản lý dịch vụ nhận thực tế ở console web.
- Lỗi 409 thì đọc lại số liệu trước khi gửi lại. Backend chưa bật custody (403/404/501/503) thì khối này ẩn và QR/đã dùng/hoàn trả cũ không đổi. Test: `part-returns.test.ts`, `technician-parts-returns.test.tsx`. Runtime với backend bật custody và trên thiết bị CHƯA KIỂM CHỨNG.

### Đồng bộ Backend + web 20/10/2026 (nhánh `feat/web-be-sync-20261021`)

- Thợ nhả đơn khi đơn trước chưa xong (BE #138, web #155): màn Công việc có thêm bộ lọc "Không kịp tới". Với mỗi đơn `ACCEPTED/EN_ROUTE` còn giữ, màn đọc `GET /service-orders/:id/overrun-release` (`{eligible, block, currentOrderCode, windowMinutes}`) và chỉ liệt kê đơn `eligible`; nút "Không kịp tới" hỏi xác nhận rồi `POST` cùng đường dẫn (không body). Không trừ điểm uy tín; ngưỡng do Backend quyết (`matching.overrun_release_window_minutes`, mặc định 180 phút, migration 047). Lỗi 4xx đọc `error.details.block` ra câu tiếng Việt. Không đọc được eligibility của một đơn thì báo "Chưa kiểm tra được N đơn", không coi là không đủ điều kiện. Logic ở `technician-overrun-release.ts`.
- Khách: thông báo `TECHNICIAN_RELEASED` (`referenceType: BOOKING`) mở chi tiết yêu cầu với `released: true`; khi yêu cầu đang `CLOSED` thì hiện "Thợ trước không kịp tới buổi hẹn. Bạn chọn thợ khác, giá và lịch hẹn giữ nguyên." và nút "Chọn lại kỹ thuật viên" mở `CustomerMatching` (cũng nhận `released: true` để hiện cùng câu đó). Booking đã `MATCHING` thì không hiện câu này. Mobile không suy "đang chờ thợ" từ `!order.technician` như web vì `order.technician` có thể là thợ cũ.
- Linh kiện dùng một phần (BE 77b59de, web 83b2d0b): dòng FixHome có bản ghi custody (`part-returns`) thay hai nút "Đã dùng/Hoàn trả" bằng "Ghi số lượng thực dùng": bước tăng/giảm từ số đã ghi tới `issuedQty - managerAcceptedQty`, gửi `PATCH /part-requests/:id/items/:itemId/usage {usageStatus, usedQty, expectedVersion, idempotencyKey}` (`usageStatus` = `used` nếu `usedQty > 0`, ngược lại `returned`). Hóa đơn mới chỉ tính số đã dùng; dòng không có custody giữ hai nút cũ. Lỗi (kể cả 409) thì đọc lại số liệu, không tự gửi lại. Màn OrderFlow `PartsLifecycleScreen` đã có bước này từ 22/10/2026 (xem mục quản lý linh kiện bên dưới); chỉ dòng không có bản ghi custody mới còn hai nút cả dòng.
- Nhiều ảnh trước sửa chữa (BE `deferAutoStart`, web CameraCapture nhiều ảnh): `BeforeEvidenceScreen` giữ tối đa 10 ảnh nháp (xem bằng `PhotoDraftGallery`: ảnh lớn, đếm, dải thumbnail), "Gửi N ảnh" gửi lần lượt qua `arrival-proof-controller`; mọi ảnh trừ ảnh cuối gửi `deferAutoStart=true` để đơn giá cố định còn `EN_ROUTE`, ảnh cuối không gửi cờ nên Backend tự bắt đầu sửa. Ảnh nào chưa được xác nhận (`phase !== resolved`) thì dừng hàng đợi và giữ các ảnh còn lại. `TechnicianOrderDetailScreen` (đường cũ) vẫn gửi từng ảnh không cờ.
- KYC `face_video` (BE #139): mobile vẫn gửi `face_photo`, Backend còn nhận; không đổi. Migration 046/047 phải chạy trên DB dùng chung trước khi thử. Runtime với Backend thật và trên thiết bị CHƯA KIỂM CHỨNG. Test: `technician-overrun-release.test.ts`, `technician-jobs-real-ui.test.tsx`, `CustomerBookingDetailScreen.test.tsx`, `customer-notification-target.test.ts`, `technician-parts-returns.test.tsx`, `BeforeEvidenceScreen.test.tsx`, `arrival-proof-controller.test.ts`, `orders-evidence-upload.api.test.ts`.

### Chat: ảnh, video, khoá khi đơn hoàn tất, mã đơn (19/10/2026, nhánh `feat/chat-parity-n4-n3`)

- PO 18/10/2026, như web. `ConversationItem` đọc thêm `orderCode` (hiện cạnh tên dịch vụ ở danh sách và đầu chat) và `closedReason`. Hội thoại khoá vì đơn hoàn tất (`canSend` false, `closedReason: order_completed`) hiện lý do: khách được dẫn tới "Gửi yêu cầu bảo hành" (`CustomerOrderDetail` tab bảo hành), thợ được báo chat mở lại khi khách gửi yêu cầu; gửi bị 409 `CONVERSATION_CLOSED` thì báo khoá và đọc lại hội thoại.
- Nút kẹp giấy gửi một ảnh (tối đa 10 MB, đổi sang JPEG) hoặc video (thư viện, chụp, quay; tối đa 60 giây, nén trước bằng `services/video-shrink.ts`, gửi tối đa 50 MB) qua `POST /conversations/:id/attachments` (multipart `file`, `content`, `clientMessageId`), tải có tiến độ và thử lại khi mạng yếu (`services/upload-retry.ts`). Bong bóng hiện ngay kèm "Đang nén…", "Đang gửi x%"; lỗi thì giữ bong bóng với "Thử lại" và "Bỏ" (gửi lại cùng `clientMessageId` nên không lưu hai lần). Logic ở `screens/chat/chat-attachment.ts`.
- Ảnh trong chat tải bằng `<Image>` kèm `Authorization` (`GET /messages/:id/attachment`); video phát bằng `expo-video` qua link ngắn hạn `GET /messages/:id/attachment/stream`, chỉ xin link khi chạm vào ô video (`ChatAttachmentView.tsx`). Test: `chat-attachments-and-lock.test.tsx`. Nén video và phát video trên máy thật CHƯA KIỂM CHỨNG (cần bản build có mã native, Expo Go gửi bản gốc).

### Realtime (19/10/2026, nhánh `feat/chat-parity-n4-n3`)

- Socket `/chat` nhận thêm `order:updated {serviceOrderId, bookingId, status, kinds?}`, `order:location`, `booking:updated`, `invitation:updated`, `notification:new`, `wallet:updated`, `realtime:resync` (`services/chat-socket.service.ts`, `onLiveUpdate`). Cơ chế như web nhưng gọn hơn: `hooks/useLiveRefresh.ts` chỉ chạy khi màn đang focus, gom sự kiện trong 150 ms thành một lần đọc và báo đủ `kinds` của cả đợt (`batch.kinds`; thiếu `kinds` hoặc `realtime:resync` hoặc vừa nối lại socket thì đọc lại tất cả). Màn cần theo kịp cả khi không có realtime truyền `pollMs`: chỉ poll lúc socket rớt (30-60 giây) và dừng khi socket nối lại.
- Đọc lại đúng phần bị đổi (`services/live-kinds.ts`, `orderPartsFor`): chi tiết đơn của khách và của thợ chỉ đọc lại thông tin đơn khi `order/status/assignment/quotation/arrival/warranty/cash` đổi, ảnh bằng chứng khi `evidence`, hoá đơn khi `invoice/cash`, chi phí phát sinh khi `additional_cost`, danh sách linh kiện của thợ khi `part` (`TechnicianPartsSection` nhận `refreshKey`). Danh sách và bộ đếm (`listsNeedRead`) chỉ đọc lại khi trạng thái hoặc người giữ đơn đổi, không đọc vì một tấm ảnh hay một món linh kiện.
- Đã nối: lời mời của thợ và số đếm trên tab (`invitation:updated`); danh sách đơn của khách, màn chính của khách (đơn đang theo dõi), danh sách việc và màn chính của thợ (`order:updated`, `booking:updated`, `invitation:updated`); số thông báo chưa đọc trên tab thợ và danh sách thông báo của khách và thợ (`notification:new`); ví và thu nhập của thợ (`wallet:updated`). `order:location` không có nơi dùng: mobile chưa có bản đồ vị trí thợ cho khách đã đăng nhập (chỉ có tra cứu đơn công khai). Số thông báo chưa đọc của khách chưa có huy hiệu để cập nhật. Test `useLiveRefresh.test.tsx`; chưa kiểm chứng với backend thật.

### Đối chiếu lịch chọn ngày rồi chọn giờ (19/10/2026)

- Web 18/10 đổi `BookingSessionPicker` thành chọn ngày (lưới tuần) rồi chọn giờ. Mobile đã có cùng luồng (dải ngày nhanh, lịch tháng, rồi chọn Sáng/Chiều, ngày kín bị loại) và gửi `urgency: NORMAL` nên không đổi gì.

### Home theo danh mục Catalog V2 (19/10/2026, nhánh `fix/home-catalog-v2`)

- `GET /services` trên backend đang dùng (`api.fixhome.sbs`) đã là Catalog V2: 32 dịch vụ mã `AC-01`, `WM-01`... và 13 nhóm `CAT_*`. Các ô dịch vụ nổi bật ở Home từng trỏ tới mã cũ (`VE_SINH_DIEU_HOA_1HP`, `SUA_MAY_GIAT`...) và nhóm cũ (`DIEN_LANH`, `KHAC`...) nên chạm vào chỉ mở danh sách trống. Nay Home hiện các danh mục lớn lấy từ `GET /categories` (13 nhóm `CAT_*`, đúng thứ tự và tên của server, `screens/customer/home-categories.ts`); xếp thành trang vuốt ngang, mỗi trang hai hàng (8 ô khi 4 cột, 4 ô khi 2 cột) kèm chấm trang, để 13 danh mục không đẩy phần còn lại của Home xuống thấp; chạm một danh mục thì mở danh sách dịch vụ con của nó (`CustomerServices` với `categoryCode`). Không tải được thì hiện dòng "Chưa tải được danh mục" kèm chạm để thử lại. Ảnh mỗi danh mục là ảnh của một dịch vụ tiêu biểu trong nhóm (`AC-02`, `WM-01`, `FR-01`, `RO-03`, `WH-01`, `KT-01`, `EL-02`, `LF-02`, `PI-01`, `PU-01`, `SA-02`, `TV-01`, `LK-02`); danh mục mới chưa có trong bảng này hiện hình trung tính. Không còn danh sách 8 dịch vụ nổi bật cố định trên Home. Ô "Không thấy dịch vụ bạn cần?" mở trợ lý AI vì V2 không còn nhóm "Khác".
- Màn bị ảnh hưởng và cách xử lý: Home (danh mục lớn vuốt ngang hai hàng, ô "Không thấy dịch vụ bạn cần?"); danh sách dịch vụ, chi tiết dịch vụ, thẻ dịch vụ đã chọn khi đặt lịch và màn xem lại (giá: trước đó cả 32 dịch vụ đều hiện "Cần khảo sát để xác định chi phí" vì V2 đều là `inspection_required` và giá nằm ở `priceSummary`; nay `service-catalog.ts` `resolveServicePrice`/`servicePricingLabel` ưu tiên `priceSummary`, chi tiết dịch vụ hiện thêm dòng giải thích và nhãn "Giá công đã duyệt theo thiết bị"); ảnh dịch vụ ở mọi nơi dùng `ServiceArtwork`; gợi ý mô tả sự cố (`customer-booking-create.ts`, thêm `AC-01`, `AC-02`, `PI-01`, `TV-01`). Không đổi: tên hiển thị (lấy từ API), nhóm (lấy từ API), trợ lý AI (mã dự phòng `DICH_VU_KHAC` giữ nguyên như web).
- Ảnh dịch vụ V2 (`constants/service-presentation.ts`): `v2Presentations` là 4 ảnh vẽ mới cho dịch vụ chưa có ảnh gần nghĩa (`AC-03` lắp đặt điều hòa, `AC-04` tháo/di dời điều hòa, `PU-01` sửa máy bơm, `PU-02` lắp đặt máy bơm; PNG RGBA 512 px nền trong suốt, cùng phong cách: thợ mũ, yếm và găng xanh, thiết bị trắng và thép); `V2_ARTWORK` mượn ảnh đã duyệt của dịch vụ cũ gần nhất. Mượn tạm, cần vẽ riêng: `WM-03` lắp đặt máy giặt, `WM-04` sửa máy sấy, `RO-01` và `RO-02` máy lọc nước, `LF-03` sửa quạt, `SA-03` thông tắc (cùng loại thiết bị nhưng khác công việc). `WM-02`, `WH-02`, `KT-02` mượn ảnh đúng thiết bị. Ảnh mới do công cụ tạo ảnh sinh ra rồi tách nền; nên để chủ sản phẩm duyệt như ảnh cũ trước khi phát hành.
- Đã kiểm ở danh mục và code, CHƯA chạy trên máy. Test: `CustomerHomeScreen.real-ui.test.tsx` (13 danh mục, chạm mở dịch vụ con, thử lại khi lỗi), `home-categories.test.ts`, `service-presentation-v2.test.ts` (mọi mã V2 có ảnh), `service-catalog-v2.test.ts` (giá), `customer-booking-create.test.ts` (gợi ý).

### Màn Khám phá dịch vụ làm lại (19/10/2026, nhánh `fix/home-catalog-v2`)

- `CustomerServicesScreen` bỏ lưới ô nhỏ không có giá. Mới: đầu trang là tên danh mục (hoặc "Khám phá dịch vụ") kèm số dịch vụ; ô tìm kiếm; một dải chip danh mục vuốt ngang (`CategoryPills`, có "Tất cả") luôn hiện ở cả chế độ duyệt và tìm kiếm; rồi danh sách thẻ dịch vụ (`components/customer/ServiceRowCard.tsx`: ảnh, tên, giá công theo `priceSummary` và dòng giải thích). Chọn một danh mục (từ chip hoặc từ ô danh mục ở Home) thì chỉ hiện dịch vụ của nó, không tiêu đề nhóm; "Tất cả" thì chia theo danh mục có tiêu đề và số dịch vụ. Hai nút "Xem tất cả danh mục" và "Xem trong nhóm" bỏ vì chip thay thế. Thẻ "Chưa biết bắt đầu từ đâu?" nằm đầu danh sách, ngay dưới dải chip.
- Thẻ đọc bởi trình đọc màn hình: nhãn là tên dịch vụ trong catalog, giá nằm ở `accessibilityValue`. Kết quả tìm kiếm dùng cùng thẻ. Logic tải, tìm kiếm, phân trang, thử lại, điều hướng giữ nguyên. Test `customer-service-real-ui.test.tsx` (cập nhật cho chip và thẻ), `ServiceRowCard.test.tsx`. CHƯA xem trên máy thật; chưa thử chữ cỡ lớn nhất và chế độ tối.

### Hoạt động: đơn sửa chữa và yêu cầu đặt lịch là hai tab (19/10/2026, nhánh `fix/home-catalog-v2`)

- Như web: tab Hoạt động (`CustomerBookingsScreen`) có hai tab "Đơn sửa chữa" và "Yêu cầu đặt lịch", mỗi tab có số đếm, mỗi lần chỉ hiện một danh sách để khỏi phải cuộn qua danh sách này mới tới danh sách kia. Đơn sửa chữa là đơn đã có thợ (gồm thẻ đang tìm thợ thay thế); yêu cầu đặt lịch là yêu cầu chưa thành đơn. Tab mở sẵn: "Yêu cầu đặt lịch" khi có yêu cầu cần khách xử lý (tab có số "cần bạn xử lý" và nhóm "Cần bạn xử lý" đứng đầu), nếu không thì "Đơn sửa chữa" khi có đơn, còn lại "Yêu cầu đặt lịch". Tab rỗng nói rõ và chỉ sang tab kia. Về kiểu dáng theo đúng mẫu đã có trong app: hai tab là thanh tab gạch chân (lựa chọn chính của trang), bộ lọc trạng thái là hàng chip vuốt ngang như màn Thông báo (không còn hai thanh phân đoạn xám xếp chồng), đúng bốn mục và thứ tự của web: Tất cả (kèm tổng số đơn và yêu cầu theo server, ẩn khi chưa tải xong hoặc đang lỗi), Đang xử lý, Hoàn tất, Đã hủy. Đã hủy tách khỏi Hoàn tất (trước đây gộp vào Lịch sử, còn đơn đã hủy chỉ thấy ở Tất cả); nhãn dùng "Đã hủy" như thẻ trạng thái của mobile. Thẻ đơn và thẻ yêu cầu dùng cùng ngôn ngữ với thẻ dịch vụ (viền mảnh thay bóng, góc 16, nhãn trạng thái dạng viên) và màu lấy từ token theme thay màu cứng nên đúng ở chế độ tối. Bộ lọc, tìm kiếm và cách gộp dữ liệu (`mergeHistory`) giữ nguyên và áp dụng cho cả hai tab. Chia hai tab theo việc có thợ đang phụ trách hay không (`isRepairCard`): đơn mất thợ và đang tìm thợ thay hoặc cần hỗ trợ (booking MATCHING hoặc CLOSED, đơn ACCEPTED hoặc EN_ROUTE) nằm ở Yêu cầu đặt lịch, không còn ở Đơn sửa chữa; đơn có thợ, hoàn tất và đã hủy giữ ở Đơn sửa chữa; các thẻ này vẫn thuộc bộ lọc Đang xử lý. Tab Yêu cầu đặt lịch có hàng chip riêng theo giai đoạn thay vì trạng thái đơn sửa chữa, mỗi chip kèm số đếm: Tất cả, Chưa có thợ (booking CLOSED hoặc đơn mất thợ), Đã gửi (SUBMITTED, MATCHING, MATCHED, PENDING, CONFIRMED) và Đã hủy (`requestStage`); tab Đơn sửa chữa giữ nguyên bốn chip cũ. Số đếm trên hai tab và mọi chip là số chính xác của server (`GET /bookings/my/activity-counts`, backend nhánh `feat/customer-activity-stages`), đọc lại sau mỗi lần làm mới danh sách, nên không tăng khi cuộn; chưa đọc được thì không hiện số. Backend cũng nhận `stage` ở `GET /bookings/my` và `GET /service-orders/my`, nhưng danh sách trên mobile CHƯA dùng `stage`: vẫn gộp phía máy rồi lọc chip, nên chip có số lớn mà danh sách đã tải còn ít thì tải thêm theo cuộn. Cuộn ở tab Đơn sửa chữa chỉ tải thêm các đơn, cuộn ở tab Yêu cầu tải thêm các booking trước rồi tới các đơn, nên hai tab không kéo dữ liệu của nhau. Tab Yêu cầu luôn đọc danh sách không lọc rồi lọc theo chip; không còn các nhóm tiêu đề, số cam trên tab vẫn đếm yêu cầu cần khách xử lý. Danh sách tự tải thêm khi cuộn gần cuối (còn khoảng 400 điểm) mỗi lần một trang (20 dòng), đặt lịch trước rồi tới đơn sửa chữa, không tải hết lịch sử một lúc; danh sách quá ngắn để cuộn (bộ lọc ít kết quả) chỉ được thêm một trang cho mỗi lần chọn bộ lọc hoặc tìm kiếm; không còn nút "Tải thêm", chỉ có dòng "Đang tải thêm…". Trang tải lỗi thì dừng tự tải tới khi khách bấm Thử lại; trang không thêm được dòng nào thì coi là hết danh sách để không lặp mãi. Test `CustomerBookingsScreen.test.tsx`. CHƯA xem trên máy thật.

### Thanh tab của khách bớt lệch (20/10/2026, nhánh `fix/home-catalog-v2`)

- `CustomerAnimatedBottomBar`: tab đang chọn từng là một vòng tròn xanh đặc cạnh nút "Đặt lịch" cũng xanh đặc và nhô lên, hai thứ giống nhau tranh nhau và nhìn lệch. Nay tab đang chọn là viên nền xanh nhạt (`primaryTint`) với biểu tượng xanh đậm (`primaryStrong`), chỉ nút "Đặt lịch" là xanh đặc; nút có viền ngoài màu nền (3 điểm, vẫn 56 điểm tổng) để trông gắn liền với thanh. Vị trí, vùng chạm và cách chuyển tab giữ nguyên. Thanh của kỹ thuật viên (`GlassTabBar`) chưa đổi. CHƯA xem trên máy thật.

### Đăng nhập Google

Mở `{origin}/api/v1/auth/google/start?redirect=<deep link auth/google>` bằng `WebBrowser.openAuthSessionAsync`, nhận mã sống 60 giây rồi đổi ở `/auth/google/exchange`. App không cần Google client id.

### Đối chiếu source SEP-132 trên nhánh integration

- `ordersApi.getMyOrdersPage` từ chối body không có mảng danh sách; mảng rỗng hợp lệ vẫn trả trang rỗng. Giữ `bookingMode`, `slot`, `customerNote`, `departAvailableAt` và parser tiền/status hiện hành.
- `GlassTabBar` giữ liquid glass tap/pan và indicator; `TechnicianNavigator` bật `technicianResponsive`, giữ năm tab với Thông báo ở vị trí thứ tư (huy hiệu số chưa đọc) và `useTechnicianLocationPing`. Ví mở từ Hồ sơ và Thu nhập; chuông Home vẫn mở Thông báo như màn riêng. Customer dùng `CustomerAnimatedBottomBar` với bốn tab và CTA đặt lịch nổi 56dp ở vùng giữa; năm vùng chạm tách khỏi nền tab clipping, lựa chọn đặt lịch thường/AI chỉ điều hướng, không tạo booking. Guest vẫn qua Auth handoff và Reduce Motion bỏ spring.
- Root giữ `TechnicianNotifications` sau guard kỹ thuật viên và `TechnicianServiceAreas`; không còn tab Notifications.
- SEP-135/136: splash logo chạy theo bootstrap thật. Không có phiên: first-run mở chọn vai trò; tiếp tục khách hàng hoặc bỏ qua mở Guest Home, lần sau mở Guest Home. Phiên hợp lệ mở Home đúng vai trò. Guest tái sử dụng `CustomerHomeScreen`, chỉ duyệt danh mục công khai; AI, đặt lịch và tab riêng mở Auth. Logout remount về Guest; Login Back giữ đường duyệt, Khám phá mở Guest. Handoff Login/Google/OTP chờ root đăng ký route đúng phiên và vai trò.
- Tích hợp Customer Booking Create/Detail/Matching/Order/Profile, địa chỉ chính xác, ảnh booking và recovery controller; giữ gia hạn matching và các mutation controller hiện hành. Tích hợp Technician Jobs, work-order, chat, Profile/KYC/onboarding, ví/thu nhập và test production. Các GET `getTechnicianJobs`, `getTechnicianJobsPage`, `getTechnicianOrder` dùng cùng endpoint hiện hành; history chỉ chiếu trường tóm tắt được phép, full order vẫn dùng parser tiền dev. Notifications chỉ cập nhật trạng thái đọc sau API xác nhận và chặn GET cũ ghi đè trạng thái mới. Không nhập developer preview hoặc thay dependency/Expo.

- SEP-139 redesign M1–M4 đã triển khai source: session/resource/journal, navigation native, Booking/lời mời/di chuyển/check-in/face/BEFORE và báo giá hai vai trò. Bản xem trước `OrderFlowDevPreview` chỉ mở trong `__DEV__` từ danh sách đơn, lấy vai trò từ phiên đăng nhập. Chi tiết, lịch sử, ảnh, phạm vi và hóa đơn mở riêng; footer ngoài vùng cuộn. Báo giá dùng editor chung, danh mục thật, tiền hợp lệ, xác nhận ở footer và phạm vi bảo hành đã được server lưu. M5 có controller/recovery và UI phát sinh/linh kiện: confirmation theo target, DTO/giá hợp lệ, QR camera và thao tác footer. Chọn ảnh đơn đã xác minh được hỗ trợ; chụp ảnh phát sinh mới chuyển tiếp sang M6 AFTER. Ghi chú kỹ thuật viên vẫn riêng trên thiết bị, tuần tự hóa ghi và bảo vệ bản nháp khi đổi phiên/đơn. M8: route gốc `CustomerOrderDetail` và `TechnicianOrderDetail` (giữ tên và `{serviceOrderId}`) đã trỏ sang OrderFlow qua `OrderDetailEntry`; vai trò lấy từ tên route và phải trùng vai trò phiên, sai thì hiện màn từ chối. Hai màn chi tiết cũ không còn được đăng ký, file còn trong repo để rollback. Preview Web đã đăng nhập và mở danh sách đơn rỗng hai vai trò ở 320/360/390/430px, không tràn ngang; chưa kiểm chứng màn công việc M5, thanh toán M6 hoặc native.

- M6 dùng controller/hooks production riêng trong `features/order-flow`, cùng provider/coordinator hiện có. Customer wallet HTTP có lớp `{success,statusCode,message,data}` do TransformInterceptor dù controller trả DTO trực tiếp; adapter đọc đúng lớp bọc. Cash giữ actor/timestamp để chặn confirmation cũ; journal không chứa signed URL, QR hay payload tài chính. Không có mutation khi Back/focus/resume; pending tài chính chỉ GET đối soát.

- M6 source: màn bàn giao/thanh toán ba phương thức, ví Customer riêng từ Tài khoản, AFTER và khai báo tiền mặt đã nối hooks frozen. Parser VND không đổi thập phân thành số tiền khác; ảnh gửi xác nhận không gửi lại draft, quay lại đề xuất giữ route/draft cũ. Web export thực đã kiểm chứng GET ví, nhập lỗi, mở/hủy xác nhận và footer ở 320/360/390/430px với dữ liệu QA thật, không POST thanh toán. Đơn QA rỗng; nghiệp vụ đơn, ảnh/native và gateway chưa runtime kiểm chứng.

### Ví khách theo kiểu ví thợ (20/10/2026, nhánh `fix/home-catalog-v2`)

- Chỉ đổi giao diện `CustomerWalletScreen`, không đổi logic nạp, rút, kiểm tra hay phân trang: đầu trang có nút Quay lại, dòng nhỏ "Ví của tôi", tiêu đề "Ví FixHome" và nút làm mới; thẻ số dư nền `#193E70` cỡ 32 như ví thợ (lỗi tải vẫn hiện "Chưa tải được số dư", không bao giờ hiện 0); hai nút Nạp tiền (đặc) và Rút tiền (viền) cao 48 bo 14; mỗi giao dịch là một thẻ viền mảnh bo 14; phân trang là "Trước, Trang n/tổng, Sau"; bỏ nút "Chi tiết" và mã tham chiếu thô (chuỗi UUID khách không dùng được) khỏi từng giao dịch. Kéo xuống để làm mới. Test `CustomerWalletScreen.test.tsx`. CHƯA xem trên máy thật.

### Đồng bộ web và backend 20/10/2026 (nhánh `feat/web-be-sync-20261020`, mốc web `54b2bff`, backend `7d8a116`)

- Ca tối: đặt lịch, đổi lịch, đặt lại có buổi `evening` (Tối 18:00 - 23:00) cạnh sáng và chiều (`utils/booking-session.ts`, `BookingSessionPicker`). Sáng và chiều đóng khi bắt đầu, ca tối còn mở tới 23:00 và khi đã bắt đầu thì khung đến tính từ giờ hiện tại (`isSessionOpen`, `sessionCloseAt`); nhãn `slot` `evening` của đơn, lời mời và booking hiển thị đúng.
- Hóa đơn 0 ₫: màn Thanh toán chỉ còn một lựa chọn "Xác nhận miễn phí" gọi `POST /invoices/:id/no-charge` (phương thức `no_charge`, thao tác `no-charge` trong nhật ký lệnh, vẫn đối chiếu lại hóa đơn, không tạo Payment hay ví). Lỗi `ORDER_INVALID_TRANSITION`, `EVIDENCE_REQUIRED_AFTER`, `VALIDATION_FAILED`, `CONFLICT`, `OWNERSHIP_DENIED`, `NOT_FOUND` là chưa xác nhận gì, được thử lại; lỗi khác giữ trạng thái chưa rõ. VNPay tắt khi hóa đơn dưới 5.000 ₫ (ví và tiền mặt vẫn dùng được).
- Linh kiện: loại yêu cầu `quotation` (phần thiếu theo báo giá đã duyệt) hiện nhãn "Theo báo giá"; dòng trả linh kiện đọc thêm `returnStatus`, `blocksNewWork`, `trackingOnly`, `usageRecorded` (hiện "Số lượng thực nhận lệch với khai báo", "Quản lý mới nhận một phần", dòng "chưa nhận được việc mới"); `partReturnsApi.getMine` (`GET /part-returns/mine`) đã có nhưng CHƯA có màn dùng. Cờ theo dõi trả linh kiện và Catalog V2 là cờ của backend, chưa kiểm chứng trên server thật.
- Màn tạo báo giá khảo sát T07 (`QuotationFormScreen` + `QuotationItemCards`, 22/10/2026, CHƯA KIỂM CHỨNG trên máy thật) làm lại: hai mục "Tiền công" và "Linh kiện", tạm tính cố định cạnh nút. Linh kiện chỉ là linh kiện FixHome: không còn nguồn `external`/`technician` hay bảo hành có phí trên giao diện; giá và bảo hành (ngày) đọc từ danh mục theo ID, hiển thị "Bảo hành N ngày theo FixHome", không sửa tay. Mục "Đã yêu cầu trước khi sửa" liệt kê dòng yêu cầu `pre_repair` còn sống (`requested/ready/delivering/received`, FixHome, chưa `returned`) của thợ: chạm để đưa nguyên dòng (đúng số lượng) vào báo giá, khớp luật `assertQuotationPartQuantities` của Backend; linh kiện mới chọn từ kho qua `PartPickerRow` trong bottom sheet. Read model `parts` giữ thêm `partCatalogId`/`partSource` của từng dòng. Backend và `ExtraProposalScreen` (chi phí phát sinh) chưa đổi và vẫn nhận nguồn ngoài.
- Khóa đánh giá/bảo hành (`customer-aftercare-controller`, 23/10/2026, CHƯA KIỂM CHỨNG trên máy thật): nhật ký lệnh khóa mọi lệnh mới của một đơn khi còn dấu vết chưa rõ kết quả (kể cả sau khi app khởi động lại, mọi dấu vết dở thành `unknown`). Với đơn `COMPLETED`, khi mở màn đánh giá hoặc bảo hành, các dấu vết của lệnh không thuộc aftercare (thanh toán, hủy, tải ảnh…) được đánh dấu `resolved` để không khóa đánh giá; dấu vết của chính đánh giá/bảo hành vẫn khóa cho tới khi đọc lại từ máy chủ.
- Quản lý linh kiện của thợ (`PartsLifecycleScreen`, `PartItemRow`, `usePartReturns`, 22/10/2026, CHƯA KIỂM CHỨNG trên máy thật): mỗi dòng có nhãn "Đã dùng / Đã trả lại / Chưa ghi dùng/trả" (chữ và tông màu). Dòng có bản ghi custody (`GET /service-orders/:id/part-returns`) hiển thị "Cấp · Dùng · Cần trả", cho ghi số lượng thực dùng (`PATCH .../usage {usageStatus, usedQty, expectedVersion, idempotencyKey}`, chỉ khi đơn `UNDER_REPAIR`) và khai trả (`POST .../declare-return`), mỗi lệnh một idempotency key, 409 thì đọc lại số liệu; không có bản ghi hoặc API trả 403/404/501/503 thì giữ hai nút cả dòng. Hai lệnh custody này gọi API trực tiếp, không đi qua journal lệnh của OrderFlow. Banner đầu màn và màn bàn giao (`CompletionRequestScreen`) dùng chung `partsBlockers` (yêu cầu chưa nhận + dòng đã nhận chưa ghi dùng/trả) để nêu số lượng đang chặn; màn bàn giao có nút "Mở quản lý linh kiện để xử lý". Luật chặn không đổi (Backend `requestCompletion` vẫn quyết định).
- Màn tổng "Quản lý đơn" (`TechnicianOrderHub`, 22/10/2026, CHƯA KIỂM CHỨNG trên máy thật): dưới nút bước hiện tại của T02, T03, T05, T06, T08 và thay danh sách lối tắt cũ của T09, thợ luôn thấy Linh kiện (vào `PartsLifecycle` để nhận bằng QR ở mọi bước; huy hiệu "N chờ nhận" đếm linh kiện lấy tại kho `ready` hoặc giao tận nơi `delivering`), Phạm vi và báo giá, Thông tin đơn, Ghi chú riêng, Tiến độ; nhóm "Bước sửa chữa" (phát sinh, ảnh sau, bàn giao, tiền mặt) chỉ hiện khi `UNDER_REPAIR`. Chỉ điều hướng: không đổi `order-task-resolver`, API, enum hay quyền; Backend vẫn quyết định mọi thao tác.
- Giao diện chuẩn bị linh kiện (`AcceptedPartsScreen`), đề xuất chi phí phát sinh (`ExtraProposalScreen`) và quản lý linh kiện (`PartsLifecycleScreen`) làm lại theo ui-ux-pro-max (CHƯA KIỂM CHỨNG trên máy thật): màn chuẩn bị dùng `PartPickerRow` (chọn danh mục, số lượng bấm +/−, ghi chú cho kho; ghi chú là `note`, không còn bị tên linh kiện ghi đè) thay cho `CostItemEditor`; `CatalogPicker` dùng chung tự tải danh mục khi mở hàng, có nút Tìm, phân trang "Xem thêm" thay cho khung cuộn lồng; `FulfillmentMethodPicker` có trạng thái chọn nhìn thấy được ở cả hai màn; `ConfirmSummary` liệt kê từng dòng trước khi gửi và thay form khi xác nhận; lỗi theo ô (`validateCostItemRows`) và lỗi lý do hiện ngay tại ô; `ReadOnlyNotice` có `tone` (lỗi là `alert`); `TaskScreenShell` có `summary` (tổng ước tính cố định cạnh nút) và footer chia hàng 1:2; ảnh bằng chứng dạng ảnh nhỏ; màn bổ sung có hai nút thêm riêng "linh kiện" và "tiền công"; mã QR nhận hàng mặc định ẩn, có nút "Hiện mã để kiểm tra". Không đổi API, enum hay quyền.
- Chưa làm: bảng tổng hợp thanh toán của đơn trên màn khách như web (`order-billing.ts`, gồm cảnh báo hóa đơn 0 ₫ lệch với báo giá; backend vẫn chặn bằng `CONFLICT`). CHƯA KIỂM CHỨNG với backend thật.

## 4. Kiến trúc và thư mục chính

- `src/features/order-flow/`: domain/runtime và shared/navigation cho redesign, một provider/reader mỗi phiên đơn. M3 có controller và task screens di chuyển/check-in/face/BEFORE, bằng chứng đúng ID/chủ ảnh và tracker chỉ bật tại màn di chuyển. M4 có controller/hook báo giá, editor và quyết định hai vai trò. M5 dùng controller/hook phát sinh và linh kiện, journal lưu ID trả về thật và kết quả sử dụng cần đối soát; không lưu QR hoặc payload nhạy cảm. Recovery ưu tiên intent chưa rõ, chỉ GET đúng phạm vi. Booking/lời mời phân biệt chắc chắn chưa gửi với POST chưa rõ. Preview vẫn chưa thay route production.
- `src/api/`: axios dùng chung (`client.ts`) và khoảng 20 module gọi API, có test.
- `src/navigation/`: App, Auth, Customer, Technician navigator. Tab khách: Trang chủ, Đơn của tôi, Thông báo, Hồ sơ (thêm nút trợ lý AI). Tab kỹ thuật viên: Trang chủ, Lời mời, Công việc, Thông báo, Hồ sơ. Ví mở từ Hồ sơ; chuông Home vẫn mở Thông báo.
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
- Video cho thợ: `POST /media/booking-video-upload` (khách hàng, MP4/MOV/WebM tối đa 50 MB) trả `uploadId` như ảnh; `photoUploadIds` của `POST /bookings` nhận tối đa 7 mã, trong đó tối đa 5 ảnh và 2 video. Hợp đồng này đã vào backend `dev` (#132).
- Ảnh đại diện phải tải lên `POST /media/upload` trước rồi mới gửi URL http(s) vào `PATCH /users/me`; `backend` từ chối đường dẫn ảnh trên máy.
- Biến môi trường (chỉ tên): `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_APP_NAME`. Mọi biến `EXPO_PUBLIC_*` đều công khai trong app.

- Wallet summary của Customer vẫn đọc pagination trong `data.meta`; transaction `amount` do Backend trả luôn dương và `balanceAfter` có thể bằng zero, nên giao diện xác định dấu tiền theo `type`. Withdrawal history là endpoint riêng: global HTTP envelope đặt array trong `data` và pagination trong top-level `meta`; không dùng chung adapter summary. Public tracking đặt kết quả trực tiếp trong global envelope `data`.
- C50 PR-C dùng quy tắc ngân hàng/rút tiền từ Backend; luồng thiết bị, xác nhận ngân hàng thật, API runtime và giao dịch tài chính CHƯA KIỂM CHỨNG. Không gửi lệnh rút thật.
- C45 Guest tracking đối chiếu Backend `963fc9f` và Web `aef0258`; 20 Jest mục tiêu, full Jest 285 suites/3412 tests, lint/typecheck/Expo check và Expo Web export đạt. Bundle web dùng fallback map, không có marker native. Native map thực trên thiết bị, 429 runtime và thao tác native clipboard CHƯA KIỂM CHỨNG.

- SEP-139 redesign lấy Backend dev `2c92d6d1a62302c3a2aaa697b05ef4a54f3fa255` làm target. Đã bổ sung contract `checkin_face`, uploaderId, order location, revise phát sinh và status-history; giữ completionNote/paidWarrantyItemIds. GET/readback quyết định trạng thái; POST timeout/401 hoặc GET xác minh lỗi giữ kết quả chưa rõ, không replay tự động.
- Phát sinh không có version: nhiều đề xuất độc lập có thể chờ duyệt, revision tạo ID mới. Đọc lại qua `GET /service-orders/:id/additional-costs` và đối soát ID đã nhận; mất ID không được đoán từ đề xuất mới nhất. Linh kiện dùng `GET /part-requests/:id`; nhận phải đúng pickup/ready hoặc delivery/delivering, sử dụng đúng yêu cầu received và item. Resource lỗi/thiếu không được coi là mảng rỗng cho phép ghi.

## 6. Chạy, kiểm thử và cổng chất lượng

- Node 22.13 trở lên (`.nvmrc` 22.15.0). `npm ci`, `npm start`, quét mã QR LAN bằng Expo Go. Backend cùng máy với Metro: để trống `EXPO_PUBLIC_API_BASE_URL` như `.env.example`. Backend máy khác, cổng khác hoặc Expo tunnel: cấu hình URL rõ ràng trong env cục bộ không theo dõi; coordinator khởi động lại Metro hiện có khi đổi env. Đăng nhập Google trên Android emulator cần `adb reverse tcp:3000 tcp:3000`.
- Cài thư viện native bằng `npx expo install`, không eject, không commit `android/` hay `ios/` (đã gitignore). Gọi thoại cần `react-native-webrtc` và `react-native-incall-manager` (plugin `@config-plugins/react-native-webrtc` trong `app.json` khai quyền micro), nén video cần `react-native-compressor` và `react-native-nitro-modules`, nên hai việc này chỉ chạy trên bản build có mã native: `npx expo run:android` sinh `android/` cục bộ rồi cài lên máy hoặc emulator. Expo Go vẫn chạy mọi màn khác (không gọi được, video gửi bản gốc).
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
- Chat có ảnh/video, khoá khi đơn hoàn tất và realtime đã làm ở các mục "Chat" và "Realtime" dưới (19/10/2026); chưa kiểm chứng trên thiết bị. Thông báo đẩy lên điện thoại và số chưa đọc của thông báo qua `notification:new` mobile chưa nối.
- SEP-136: một màn Lịch làm việc chứa editor khung giờ tuần theo ngày, preset/giờ chính xác, ngày nghỉ với chọn ngày và lịch đơn hiện có. Một màn Khu vực hoạt động chứa vị trí/bán kính và quận/huyện. Giữ payload lưu hiện hành, ngày tuần Sunday=0, khoảng giờ đã lưu, giới hạn 40 km, GPS/camera và tài chính. Bàn phím/safe area đã xử lý trong source; thiết bị còn CHƯA KIỂM CHỨNG.
- Chưa có push notification (`expo-notifications` đã cài nhưng chưa dùng); ảnh booking đã có upload adapter/controller nhưng runtime CHƯA KIỂM CHỨNG; khu vực phục vụ có màn chỉnh sau onboarding.
- Chưa có cấu hình EAS và bundle id. Root đã xử lý cold/warm return `fixhome://app/wallet` bằng đích an toàn cho Customer và GET-only refresh, bỏ mọi query payload; luồng Google/Technician giữ nguyên. OS delivery/native chưa kiểm chứng.
- Các hàm API chưa dùng trong UI production: `completeRepair`, `payInvoice`, `getWarranties`. `getStatusHistory` đã nối vào adapter redesign nhưng UI chưa cutover.
- Repo đang theo dõi `CLAUDE.md` và `.claude/settings.json` từ commit đầu; luật chung của nhóm không đưa cấu hình công cụ AI vào repo. Chờ PO quyết có gỡ hay không.
- Tài liệu audit ngày 23 và 24/09 trong `docs/` là ảnh chụp lịch sử, không phản ánh hiện trạng.

- SEC-01: Backend evidence GET vẫn trả face cho Customer đầy đủ quyền; Mobile lọc trước publish resource nhưng không thay thế phân quyền Backend. SEC-02/P6: upload support/warranty mới bị khóa theo quyết định owner. Không có API Customer/Technician đọc số ảnh tối thiểu; tách eligibility gửi completion để server kiểm tra khỏi readiness đã chứng minh, không gọi admin config.

## 9. Nhật ký cập nhật context

- 2026-10-23 16:19 (UTC+7) | Hgnv11 | dev | Các trang con của đơn (Thông tin đơn, Hóa đơn, Tiến độ, Ảnh và bằng chứng, Chi tiết yêu cầu hỗ trợ, Đơn hoàn thành) chia theo nhóm có tiêu đề như bên thợ; Hóa đơn tách Tiền công và Linh kiện và ghi Báo giá cần dùng so với Thực dùng theo sourceItemId của dòng hóa đơn; màn Hoạt động của khách không còn tự nhảy sang tab Yêu cầu đặt lịch
- 2026-10-23 14:51 (UTC+7) | Hgnv11 | dev | Màn Quản lý linh kiện của kỹ thuật viên: ghi Báo giá duyệt cạnh số lượng, sửa số đã dùng được cả giảm (backend cho phép trước khi hóa đơn được tạo), nút Khai trả X cái còn lại sau khi ghi số đã dùng, gộp các thông báo cần xử lý thành một khối, mục Linh kiện sửa chữa tự đọc lại không nháy
- 2026-10-23 06:16 (UTC+7) | Hgnv11 | dev | Màn Đề xuất (ProposalDetail) đổi thành Chi tiết báo giá hoặc Chi tiết chi phí phát sinh và dùng chung thẻ của OrderCostHistory (OrderCostHistory nhận onlyId): bỏ mã thô và câu nhắc M2, nút Xem đề xuất gốc đổi thành Xem chi tiết báo giá; chỉ đổi giao diện; chưa kiểm chứng trên máy thật
- 2026-10-23 06:08 (UTC+7) | Hgnv11 | dev | Làm lại màn Chờ duyệt báo giá của kỹ thuật viên: tiêu đề Báo giá lần N kèm nhãn Chờ duyệt báo giá, bỏ mã báo giá thô, giờ gửi theo giờ Việt Nam, khối Đang chờ khách hàng duyệt, tiền công và linh kiện căn phải, nút Xem chi tiết báo giá; chỉ đổi giao diện; chưa kiểm chứng trên máy thật
- 2026-10-23 06:05 (UTC+7) | Hgnv11 | dev | Gộp màn Phạm vi và báo giá (ScopeDetail) vào Thông tin đơn cho cả khách và kỹ thuật viên: Thông tin đơn thêm Giá đã chốt và Số lượng cho đơn giá cố định, các lối vào cũ trỏ về Thông tin đơn, bỏ route ScopeDetail và danh sách vật tư riêng (kỹ thuật viên vẫn có Linh kiện); chỉ đổi điều hướng và giao diện; chưa kiểm chứng trên máy thật
- 2026-10-23 05:48 (UTC+7) | Hgnv11 | dev | Làm lại giao diện thẻ báo giá chờ duyệt của khách (DecisionSummary): tiêu đề Báo giá lần N kèm nhãn trạng thái, bỏ mã báo giá thô, giờ gửi theo giờ Việt Nam, chia Tiền công và Linh kiện, thành tiền từng dòng căn phải, khối Ước tính nổi bật; chỉ đổi giao diện, không đổi API hay logic chọn bảo hành; chưa kiểm chứng trên máy thật
- 2026-10-23 05:30 (UTC+7) | Hgnv11 | dev | Gỡ kẹt "Chưa xác nhận được kết quả" ở Ảnh trước/khuôn mặt: gửi ảnh bị máy chủ trả 400/403/413/415/422 thì ghi failed-known để chụp và gửi lại được; lỗi mạng, 5xx, 409 vẫn giữ unknown (không suy đoán); chưa kiểm chứng trên máy thật
- 2026-10-23 04:50 (UTC+7) | Hgnv11 | feat/technician-order-hub | Màn Thông tin đơn liệt kê từng lần báo giá và chi phí phát sinh (OrderCostHistory), chi phí phát sinh đọc tiền dạng chuỗi bigint, màn Quản lý linh kiện nhóm theo nguồn và giới hạn số đã dùng theo báo giá đã duyệt, khai trả đủ thì tự ghi đã dùng 0 để bàn giao không chờ quản lý nhận, nhãn Đã trả lại chỉ khi kho đã nhận; chưa kiểm chứng trên máy thật
- 2026-10-23 03:12 (UTC+7) | Hgnv11 | feat/technician-order-hub | Màn đề xuất chi phí phát sinh làm lại theo kiểu màn báo giá (mục Tiền công và Linh kiện, chọn linh kiện FixHome từ kho qua bottom sheet, tick linh kiện còn lại sau báo giá, nguồn ngoài và thợ tự mang bị bỏ); Backend chỉ cấp phần thiếu so với số thợ đang giữ; chưa kiểm chứng trên máy thật
- 2026-10-23 00:39 (UTC+7) | Hgnv11 | feat/technician-order-hub | Làm gọn UI đặt lịch (bước Tình trạng cần sửa: tiêu đề mục đồng nhất, dấu * đỏ cho mục bắt buộc, thẻ Chi phí ước tính, thẻ thông tin thiết bị ẩn khi chỉ cần khảo sát) và gỡ nút lặp với Quản lý đơn ở T02/T03/T05/T06 của thợ; chỉ đổi giao diện, chưa kiểm chứng trên máy thật.
- 2026-10-23 00:31 (UTC+7) | Hgnv11 | feat/technician-order-hub | Đánh giá/bảo hành của khách không còn bị khóa bởi lệnh thanh toán, hủy hay tải ảnh chưa rõ kết quả còn sót trong nhật ký của đơn đã COMPLETED; chưa kiểm chứng trên máy thật.
- 2026-10-22 20:13 (UTC+7) | Hgnv11 | feat/technician-order-hub | Làm lại màn Quản lý linh kiện của thợ: dòng linh kiện có nhãn trạng thái, ghi số lượng thực dùng và khai trả theo custody như web, banner nêu rõ cái đang chặn bàn giao, màn bàn giao nêu số linh kiện chặn kèm nút mở quản lý; không đổi API; chưa chạy trên máy thật.
- 2026-10-22 19:50 (UTC+7) | Hgnv11 | feat/technician-order-hub | Làm lại màn tạo báo giá T07: bỏ linh kiện ngoài và bảo hành có phí, linh kiện chỉ của FixHome (bảo hành theo linh kiện), chọn lại được linh kiện đã yêu cầu trước; không đổi API; chưa chạy trên máy thật.
- 2026-10-22 19:31 (UTC+7) | Hgnv11 | feat/technician-order-hub | Thêm TechnicianOrderHub (Quản lý đơn) dưới bước hiện tại của thợ ở T02/T03/T05/T06/T08/T09 để vào Linh kiện (nhận QR, huy hiệu "N chờ nhận"), phạm vi, ghi chú, tiến độ; chỉ điều hướng, không đổi API/quyền/resolver; chưa chạy trên máy thật.
- 2026-10-21 08:12 (UTC+7) | Hgnv11 | feat/web-be-sync-20261021 | Đồng bộ BE+web 20/10: thợ nhả đơn (bộ lọc Không kịp tới) và thông báo TECHNICIAN_RELEASED cho khách, số lượng linh kiện dùng một phần, nhiều ảnh BEFORE với deferAutoStart; chưa kiểm chứng với Backend thật và thiết bị
- 2026-10-20 21:11 (UTC+7) | Hgnv11 | dev | Làm lại giao diện chuẩn bị linh kiện, chi phí phát sinh và quản lý linh kiện của thợ (PartPickerRow, CatalogPicker, ConfirmSummary, lỗi theo ô, tổng cố định, ảnh nhỏ); không đổi API; chưa chạy trên máy thật.
- 2026-10-20 20:39 (UTC+7) | Hgnv11 | dev | Tab thứ tư của kỹ thuật viên đổi từ Ví sang Thông báo (Ví vào qua Hồ sơ); màn Thông báo ẩn nút Quay lại khi nằm trong tab, tiêu đề 24/32 và màu nền/viền/cỡ chữ đồng bộ với Thông báo khách; thiết bị CHƯA KIỂM CHỨNG.
- 2026-10-20 20:09 (UTC+7) | Hgnv11 | feat/web-be-sync-20261020 | Báo giá, chi phí phát sinh, linh kiện đã nhận: danh sách linh kiện FixHome cuộn trong khung, hiện SKU và giá; chọn linh kiện luôn ghi tên vào Mô tả
- 2026-10-20 19:39 (UTC+7) | Hgnv11 | feat/web-be-sync-20261020 | Kỹ thuật viên: sheet Kỹ năng và dịch vụ nhận làm gọn lại, hàng phẳng, công tắc nhận làm, nút Lưu thay đổi chỉ hiện khi có chỉnh sửa
- 2026-10-20 16:40 (UTC+7) | Hgnv11 | feat/web-be-sync-20261020 | Đồng bộ web và backend: ca tối, hóa đơn 0 ₫ (no-charge) và VNPay từ 5.000 ₫, loại linh kiện theo báo giá, trạng thái trả linh kiện
- 2026-10-20 01:57 (UTC+7) | Hgnv11 | fix/activity-split | Hoạt động: số đếm hai tab và các chip lấy từ server (GET /bookings/my/activity-counts), không còn đếm theo số đã tải; mỗi tab chỉ tải dữ liệu của mình
- 2026-10-20 00:54 (UTC+7) | Hgnv11 | fix/home-catalog-v2 | Ví của khách làm lại theo kiểu ví của thợ: thẻ số dư xanh đậm, nút Nạp tiền và Rút tiền, giao dịch dạng thẻ, kéo để làm mới
- 2026-10-20 00:36 (UTC+7) | Hgnv11 | fix/home-catalog-v2 | Thanh tab khách: tab đang chọn là viên xanh nhạt, chỉ nút Đặt lịch xanh đặc có viền
- 2026-10-19 23:36 (UTC+7) | Hgnv11 | fix/home-catalog-v2 | Hoạt động có hai tab Đơn sửa chữa và Yêu cầu đặt lịch như web, mỗi tab một danh sách và số đếm
- 2026-10-19 23:12 (UTC+7) | Hgnv11 | fix/home-catalog-v2 | Làm lại màn Khám phá dịch vụ: thẻ dịch vụ có giá công, dải chip danh mục, danh mục chọn từ Home chỉ hiện dịch vụ con
- 2026-10-19 23:05 (UTC+7) | Hgnv11 | fix/home-catalog-v2 | Home gọn lại: danh mục lớn vuốt ngang hai hàng mỗi trang kèm chấm trang
- 2026-10-19 21:10 (UTC+7) | Hgnv11 | feat/realtime-full | Realtime đầy đủ: đọc lại đúng phần bị đổi theo kinds, thông báo, ví, thu nhập, màn chính, poll dự phòng khi socket rớt
- 2026-10-19 21:02 (UTC+7) | Hgnv11 | feat/chat-parity-n4-n3 | Chat gửi ảnh/video, khoá khi đơn hoàn tất, mã đơn; realtime nhẹ cho lời mời, đơn và danh sách việc như web
- 2026-10-19 20:52 (UTC+7) | Hgnv11 | feat/technician-part-returns | Thợ khai trả linh kiện FixHome như web (P1), ẩn khi backend chưa bật custody
- 2026-10-19 20:39 (UTC+7) | Hgnv11 | feat/booking-device-pricing | Đặt lịch hỏi thông tin thiết bị và hiện phạm vi tiền công do server xác nhận như web (P012)
- 2026-10-19 20:22 (UTC+7) | Hgnv11 | feat/catalog-price-summary | Thẻ dịch vụ đặt lịch hiện giá công theo priceSummary của backend như web
- 2026-10-19 13:27 (UTC+7) | Hgnv11 | feat/technician-job-preview | Thợ xem mô tả, giá, tóm tắt AI, ảnh, video và khoảng cách trong lời mời trước khi nhận như web
- 2026-10-18 12:59 (UTC+7) | ToanAltF4 | feat/mobile-call-ai-chat | Tải lên không gửi lại cả file khi byte cuối đã đi và đang chờ server trả lời
- 2026-10-18 12:20 (UTC+7) | ToanAltF4 | feat/mobile-call-ai-chat | Trợ lý AI: tối đa 3 ảnh + 2 video mỗi cuộc trò chuyện, nén video trên máy (react-native-compressor, bản gốc khi không nén được), tải lên ở nền có tiến độ, thử lại khi mạng yếu; Đặt thợ chờ, thử lại hoặc bỏ tệp chưa gửi xong
- 2026-10-18 04:09 (UTC+7) | ToanAltF4 | feat/mobile-call-ai-chat | Gọi thoại như web (nút gọi trong chat, màn cuộc gọi chung, nút Loa to/Loa nhỏ, cần bản build native) và trợ lý AI như web (trả lời nhanh, Đúng ý/Chưa đúng, video gửi kèm cho thợ không qua AI, ảnh và video theo sang form đặt lịch).
- 2026-10-17 23:40 (UTC+7) | foxonworld | feat/customer-symptom-chips-20261017 | Thêm chip triệu chứng theo dịch vụ/nhóm Web, thêm/bỏ giữ mô tả tự nhập/AI và 5.000 ký tự; hiển thị chỉ dẫn vuốt ngang dải ngày Booking. Giữ nguyên lịch 14 ngày, urgency và API.
- 2026-10-17 20:46 (UTC+7) | foxonworld | feat/technician-reputation-parity-20261017 | Thống nhất card uy tín compact hai vai trò, sheet quy định/lịch sử và cảnh báo server luôn hiện; giữ riêng chip Độ tin cậy, native visual/runtime CHƯA KIỂM CHỨNG.
- 2026-10-17 20:08 (UTC+7) | foxonworld | integration/mobile-c50-c45-reviewed-20261017 | Thu hẹp async act, bảo đảm cleanup và đặt timeout riêng 15 giây cho test radar Matching; CI Ubuntu sau sửa CHƯA KIỂM CHỨNG.
- 2026-10-17 18:20 (UTC+7) | foxonworld | integration/mobile-c50-c45-20261017 | Tích hợp lịch tháng và CTA với UI/clearance, lịch nhận việc và ký quỹ từ dev; giữ C50/C45, lịch sử hai nhánh và dọn cleanup test bộ lọc thông báo; runtime CHƯA KIỂM CHỨNG.
- 2026-10-17 17:48 (UTC+7) | foxonworld | feat/mobile-c50-c45-20261017 | Booking Customer giữ hai buổi sáng/chiều; lịch 14 ngày có lịch tháng, không chọn buổi ngầm và làm mới theo focus/app/time.

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
