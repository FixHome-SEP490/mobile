# Context repo mobile — FixHome

> Cập nhật lần cuối: 2026-10-14 14:23 (UTC+7) · Người cập nhật (git): foxonworld · Nhánh: foxonworld/sep139-order-flow-redesign

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

SEP-137/139: editor địa chỉ Booking phân biệt ghim đã xác nhận với địa chỉ đủ điều kiện lưu; tỉnh/quận thiếu được chọn rõ ràng từ GET `/geo/provinces`, không tự gán khu vực. Giữ createAddress một lần và đối chiếu GET/owner trước khi dùng địa chỉ. Booking review giữ snapshot bất biến; success hiển thị “Đã gửi yêu cầu”, chưa phải ServiceOrder. Matching giữ tối đa hai ưu tiên và lời mời tuần tự theo server. Customer Order detail hiển thị một section theo action/status hiện tại; progress sheet chỉ đọc, các controller giữ guard/readback riêng. Thanh hành động dưới scroll điều hướng đến section hiện hành, không thay thế các nút xác nhận trong section. Thiết bị và visual 320–430dp CHƯA KIỂM CHỨNG; không có POST thực trong kiểm thử.

- Đặt lịch thường: Dịch vụ → Chi tiết dịch vụ → Tạo booking (địa chỉ đã lưu, ngày giờ) → `POST /bookings`.
- Đặt lịch có AI: màn chẩn đoán nhận mô tả và tối đa 3 ảnh, chuyển sang trò chuyện với AI; AI không tự đặt lịch mà điền sẵn dịch vụ, mô tả và `aiSessionId` vào màn tạo booking.
- Chọn đúng 2 kỹ thuật viên theo thứ tự ở màn tìm thợ.
- Đơn: duyệt báo giá và chi phí phát sinh, huỷ, xác nhận hoàn tất, hoá đơn, tiền mặt, mở VNPay, đánh giá, xem bằng chứng.
- Lịch sử sửa chữa, trung tâm bảo hành, hỗ trợ, chat với kỹ thuật viên, thông báo có phân trang, hồ sơ và địa chỉ có bản đồ, màn bảo mật (đổi mật khẩu bằng OTP).

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
- `hooks/useTechnicianLocationPing.ts` (gắn ở `TechnicianNavigator`): khi app đang mở và đã có quyền vị trí, gửi GPS mỗi 5 phút (`PATCH /technicians/me/location`), không tự hỏi quyền. Bán kính 1-40 km.

### Các bước của thợ trong đơn (08/10/2026, nhánh `feat/technician-order-steps`)

- Màn đơn của thợ: check-in phải được xác minh GPS; ảnh trước/sau tải và đối chiếu theo server. `EN_ROUTE` đủ guard chỉ cho phép mở xác nhận; nút bắt đầu sửa gọi explicit `POST /service-orders/:id/start-repair` qua controller hiện có, sau đó đọc lại đơn. Kết quả chưa rõ giữ khóa đến GET xác minh; không tự chuyển trạng thái. Footer CTA nằm ngoài vùng cuộn; progress mở riêng; xem lại ảnh không có nút xóa. Ảnh đơn chỉ chụp bằng camera.
- Thẻ "Cần thay đổi thợ" sau check-in: nhập lý do, tạo support case `technician_replacement` (khẩn).

### Chứng chỉ khi đăng ký thợ (08/10/2026, nhánh `feat/technician-certificates`)

- Màn Xác minh danh tính (`TechnicianKycScreen`): phần "Chứng chỉ nghề" không bắt buộc, tối đa 5 ảnh, ghi chú "bản đã công chứng"; gửi kèm hồ sơ với `documentType: certificate`.
- Sau khi nộp và ở trạng thái chờ duyệt (cả màn onboarding): "Vui lòng đến trụ sở trong thời gian sớm nhất để tiến hành xác minh thông tin và bắt đầu công việc." (`OFFICE_VISIT_NOTE`); bỏ câu hứa duyệt trong 24 giờ.

### Đăng nhập Google

Mở `{origin}/api/v1/auth/google/start?redirect=<deep link auth/google>` bằng `WebBrowser.openAuthSessionAsync`, nhận mã sống 60 giây rồi đổi ở `/auth/google/exchange`. App không cần Google client id.

### Đối chiếu source SEP-132 trên nhánh integration

- `ordersApi.getMyOrdersPage` từ chối body không có mảng danh sách; mảng rỗng hợp lệ vẫn trả trang rỗng. Giữ `bookingMode`, `slot`, `customerNote`, `departAvailableAt` và parser tiền/status hiện hành.
- `GlassTabBar` giữ liquid glass tap/pan và indicator; `TechnicianNavigator` bật `technicianResponsive`, giữ năm tab với Ví ở vị trí thứ tư và `useTechnicianLocationPing`. Thông báo/badge mở từ chuông Home. Customer dùng `CustomerAnimatedBottomBar` với bốn tab và lựa chọn đặt lịch thường/AI; lựa chọn chỉ điều hướng, không tạo booking.
- Root giữ `TechnicianNotifications` sau guard kỹ thuật viên và `TechnicianServiceAreas`; không còn tab Notifications.
- SEP-135/136: splash logo chạy theo bootstrap thật. Không có phiên: first-run mở chọn vai trò; tiếp tục khách hàng hoặc bỏ qua mở Guest Home, lần sau mở Guest Home. Phiên hợp lệ mở Home đúng vai trò. Guest tái sử dụng `CustomerHomeScreen`, chỉ duyệt danh mục công khai; AI, đặt lịch và tab riêng mở Auth. Logout remount về Guest; Login Back giữ đường duyệt, Khám phá mở Guest. Handoff Login/Google/OTP chờ root đăng ký route đúng phiên và vai trò.
- Tích hợp Customer Booking Create/Detail/Matching/Order/Profile, địa chỉ chính xác, ảnh booking và recovery controller; giữ gia hạn matching và các mutation controller hiện hành. Tích hợp Technician Jobs, work-order, chat, Profile/KYC/onboarding, ví/thu nhập và test production. Các GET `getTechnicianJobs`, `getTechnicianJobsPage`, `getTechnicianOrder` dùng cùng endpoint hiện hành; history chỉ chiếu trường tóm tắt được phép, full order vẫn dùng parser tiền dev. Notifications chỉ cập nhật trạng thái đọc sau API xác nhận và chặn GET cũ ghi đè trạng thái mới. Không nhập developer preview hoặc thay dependency/Expo.

- SEP-139 redesign M1–M4 đã triển khai source: session/resource/journal, navigation native, Booking/lời mời/di chuyển/check-in/face/BEFORE và báo giá hai vai trò. Bản xem trước `OrderFlowDevPreview` chỉ mở trong `__DEV__` từ danh sách đơn, lấy vai trò từ phiên đăng nhập. Chi tiết, lịch sử, ảnh, phạm vi và hóa đơn mở riêng; footer ngoài vùng cuộn. Báo giá dùng editor chung, danh mục thật, tiền hợp lệ, xác nhận ở footer và phạm vi bảo hành đã được server lưu. M5 có controller/recovery và UI phát sinh/linh kiện: confirmation theo target, DTO/giá hợp lệ, QR camera và thao tác footer. Chọn ảnh đơn đã xác minh được hỗ trợ; chụp ảnh phát sinh mới chuyển tiếp sang M6 AFTER. Ghi chú kỹ thuật viên vẫn riêng trên thiết bị, tuần tự hóa ghi và bảo vệ bản nháp khi đổi phiên/đơn. UI production chưa cutover; hai màn chi tiết cũ còn giữ đến M8. Preview Web đã đăng nhập và mở danh sách đơn rỗng hai vai trò ở 320/360/390/430px, không tràn ngang; chưa kiểm chứng màn công việc M5, thanh toán M6 hoặc native.

- M6 dùng controller/hooks production riêng trong `features/order-flow`, cùng provider/coordinator hiện có. Customer wallet HTTP có lớp `{success,statusCode,message,data}` do TransformInterceptor dù controller trả DTO trực tiếp; adapter đọc đúng lớp bọc. Cash giữ actor/timestamp để chặn confirmation cũ; journal không chứa signed URL, QR hay payload tài chính. Không có mutation khi Back/focus/resume; pending tài chính chỉ GET đối soát.

- M6 source: màn bàn giao/thanh toán ba phương thức, ví Customer riêng từ Tài khoản, AFTER và khai báo tiền mặt đã nối hooks frozen. Parser VND không đổi thập phân thành số tiền khác; ảnh gửi xác nhận không gửi lại draft, quay lại đề xuất giữ route/draft cũ. Web export thực đã kiểm chứng GET ví, nhập lỗi, mở/hủy xác nhận và footer ở 320/360/390/430px với dữ liệu QA thật, không POST thanh toán. Đơn QA rỗng; nghiệp vụ đơn, ảnh/native và gateway chưa runtime kiểm chứng.

## 4. Kiến trúc và thư mục chính

- `src/features/order-flow/`: domain/runtime và shared/navigation cho redesign, một provider/reader mỗi phiên đơn. M3 có controller và task screens di chuyển/check-in/face/BEFORE, bằng chứng đúng ID/chủ ảnh và tracker chỉ bật tại màn di chuyển. M4 có controller/hook báo giá, editor và quyết định hai vai trò. M5 dùng controller/hook phát sinh và linh kiện, journal lưu ID trả về thật và kết quả sử dụng cần đối soát; không lưu QR hoặc payload nhạy cảm. Recovery ưu tiên intent chưa rõ, chỉ GET đúng phạm vi. Booking/lời mời phân biệt chắc chắn chưa gửi với POST chưa rõ. Preview vẫn chưa thay route production.
- `src/api/`: axios dùng chung (`client.ts`) và khoảng 20 module gọi API, có test.
- `src/navigation/`: App, Auth, Customer, Technician navigator. Tab khách: Trang chủ, Đơn của tôi, Thông báo, Hồ sơ (thêm nút trợ lý AI). Tab kỹ thuật viên: Trang chủ, Lời mời, Công việc, Ví, Hồ sơ. Chuông Home mở Thông báo.
- `src/screens/`: `auth`, `chat`, `customer`, `technician`. Logic thuần đặt trong file `kebab-case.ts` cạnh màn hình, có `.test.ts` đi kèm.
- `src/services/`: `storage.service.ts` (SecureStore), `chat-socket.service.ts`, `google-auth.service.ts`, `image-for-ai.ts` (thu ảnh về 1280 px, base64).
- `src/store/`: Zustand `auth.store`, `badge.store`, `ui.store`.
- `src/constants/`: `config.ts` (đọc biến môi trường), `theme.ts` (`useAppTheme`).
- `src/utils/`: giờ Việt Nam (`vn-time`), định dạng, kiểm dữ liệu nhập, khung giờ booking.

## 5. Hợp đồng với repo khác

- REST tới `backend` qua `EXPO_PUBLIC_API_BASE_URL`; override rõ ràng luôn ưu tiên. Native development suy ra host LAN từ Expo/Metro và dùng cổng backend mặc định; Web giữ localhost, Android emulator với Metro loopback giữ bridge emulator. Không suy ra host từ tunnel hoặc ở production. Token vẫn lưu bằng `expo-secure-store`; session refresh không đổi.
- Gặp 401 thì gọi một lần `POST /auth/refresh` dùng chung; chỉ chạy lại yêu cầu GET, HEAD, OPTIONS, không tự chạy lại thao tác ghi.
- Danh sách gửi `page` và `pageSize` hoặc `limit` không quá 100; `status` viết thường đúng enum.
- Socket.IO tới `{origin}/chat` (origin là base URL bỏ `/api/v1`), chỉ dùng cho chat: gửi `conversation:join`, `typing`; nhận `message:*`, `conversation:updated`, `typing`; tự vào lại phòng khi kết nối lại.
- AI chỉ qua `/ai/diagnoses`, `/ai/chat/ask`, `/ai/chat/acknowledgements` của `backend`; mô tả tối đa 2000 ký tự, câu hỏi 1000, tối đa 3 ảnh. `aiApi` không bao giờ ném lỗi, trả câu dự phòng khi AI không có.
- Ảnh đại diện phải tải lên `POST /media/upload` trước rồi mới gửi URL http(s) vào `PATCH /users/me`; `backend` từ chối đường dẫn ảnh trên máy.
- Biến môi trường (chỉ tên): `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_APP_NAME`. Mọi biến `EXPO_PUBLIC_*` đều công khai trong app.

- SEP-139 redesign lấy Backend dev `2c92d6d1a62302c3a2aaa697b05ef4a54f3fa255` làm target. Đã bổ sung contract `checkin_face`, uploaderId, order location, revise phát sinh và status-history; giữ completionNote/paidWarrantyItemIds. GET/readback quyết định trạng thái; POST timeout/401 hoặc GET xác minh lỗi giữ kết quả chưa rõ, không replay tự động.
- Phát sinh không có version: nhiều đề xuất độc lập có thể chờ duyệt, revision tạo ID mới. Đọc lại qua `GET /service-orders/:id/additional-costs` và đối soát ID đã nhận; mất ID không được đoán từ đề xuất mới nhất. Linh kiện dùng `GET /part-requests/:id`; nhận phải đúng pickup/ready hoặc delivery/delivering, sử dụng đúng yêu cầu received và item. Resource lỗi/thiếu không được coi là mảng rỗng cho phép ghi.

## 6. Chạy, kiểm thử và cổng chất lượng

- Node 22.13 trở lên (`.nvmrc` 22.15.0). `npm ci`, `npm start`, quét mã QR LAN bằng Expo Go. Backend cùng máy với Metro: để trống `EXPO_PUBLIC_API_BASE_URL` như `.env.example`. Backend máy khác, cổng khác hoặc Expo tunnel: cấu hình URL rõ ràng trong env cục bộ không theo dõi; coordinator khởi động lại Metro hiện có khi đổi env. Đăng nhập Google trên Android emulator cần `adb reverse tcp:3000 tcp:3000`.
- Cài thư viện native bằng `npx expo install`, không eject hay prebuild.
- Gate trước mỗi commit: `npm run check:expo`, `npm run lint`, `npm run typecheck`, `npm test`. CI chạy đúng các bước này.
- Quy trình nhánh: tách nhánh từ `dev`, PR vào `dev`, CI xanh mới merge; không merge vào `main`.
- Tính năng mới hoặc sửa tính năng phải làm và kiểm tra trên cả `mobile` lẫn `web` khi vai trò đó có trên cả hai.

## 7. Quyết định đã chốt

- Khách chọn 1 đến 2 kỹ thuật viên (app hiện bắt chọn đúng 2); ví kỹ thuật viên tối thiểu 200.000 ₫ (PO xác nhận 07/10/2026).
- Hai luồng đặt lịch: thường và có AI; AI chỉ điền sẵn, khách tự bấm đặt.
- Không có dữ liệu hay luồng giả (PO 07/10/2026): nạp ví chỉ qua VNPay, phản hồi không có `paymentUrl` là lỗi; nạp hay rút bị `backend` từ chối thì hiện đúng thông báo của server.
- Chẩn đoán AI bắt buộc có mô tả, ảnh không bắt buộc (BRX-064).
- Giao diện theo `FIXHOME-DESIGN-SYSTEM.md`: thuật ngữ tiếng Việt thống nhất, tiền dạng `1.250.000 ₫`, giờ theo UTC+7 qua `utils/vn-time`, không hiện mã lỗi cho người dùng.
- Quản lý dịch vụ và admin không có giao diện trên mobile.

- SEP-139 owner đã duyệt redesign toàn bộ hai role trên Backend dev mới: auto-start theo server, không bắt buộc khách nghiệm thu trước thanh toán, hỗ trợ Ví FixHome/VNPay/tiền mặt; invoice PAID khác order COMPLETED.
- Ảnh check-in khuôn mặt không được hiển thị cho Customer. Chặn upload ảnh hỗ trợ/bảo hành mới đến khi Backend có phương án riêng tư được duyệt; không dùng media public làm đường thay thế.

## 8. Việc đang dở và rủi ro đã biết

- SEP-135/136 Auth được phép triển khai: first-run, session bootstrap và logout dùng root stack theo phiên/vai trò. Backend source xác nhận login `identifier` nhận email hoặc số điện thoại; UI phản ánh đúng contract. Không đổi token storage, interceptor refresh hoặc quyền Backend. Kiểm tra đăng nhập trên iPhone thật còn CHƯA KIỂM CHỨNG.
- FH-MAIN-01 HOLD Finance: `src/api/orders.api.ts` giữ `toMoney` dev; các test WIP yêu cầu từ chối null/invalid monetary fields trong `src/api/orders.api.test.ts` chưa nhập, cần Finance owner quyết định trước khi đổi parser. Test GET history/privacy và malformed page đã nhập. Glass giữ liquid glass, responsive opt-in và năm tab Technician; bổ sung prop nhãn tùy chọn, chưa bật trên Technician.
- SEP-139 redesign: source M1–M5 đã đạt gate scoped cho các chức năng hiện có; chụp ảnh phát sinh mới chuyển tiếp M6 AFTER, M6 logic AFTER/completion/ví/VNPay/tiền mặt và hooks production đã bàn giao với 9 suites/118 tests, typecheck/owned lint đạt; review tài chính độc lập phát hiện một lỗi HTTP400/422; OpenCode sửa scoped, lead kiểm chứng lại 33 tests và đóng M6 logic source gate. M6 UI/capture return/root wallet linking đã đạt source gate sau sửa scoped; còn M7–M8 aftercare/cutover và QA luồng thật. M6 request-completion chỉ mở retry cho lỗi 409/EVIDENCE_REQUIRED_AFTER đã chứng minh rollback, không áp dụng tiền mặt hoặc 409 khác. Route production chưa thay. QA Backend riêng đúng target đã khởi động và seed/migration trên database mới; sau checkpoint server ngừng, đã khôi phục đúng sandbox trên tiến trình QA riêng sau khi owner mở Docker Desktop, không chạy lại migration/seed; runtime đơn, device/Web parity, bàn phím/safe area và payment sandbox CHƯA KIỂM CHỨNG. Target Backend auto-start; start-repair chỉ recovery có điều kiện, không thêm gate thủ công bình thường. Giữ giới hạn onboarding 40 km hiện có.
- FH-MAIN-01: Web parity, visual/runtime và thiết bị/E2E CHƯA KIỂM CHỨNG; coordinator làm QA cuối và Git. Không khởi động hoặc dừng Expo/backend. Giữ mapping asset tối ưu hiện có; không nhập hai ảnh onboarding legacy vì runtime đã dùng asset tương đương được theo dõi.

- Thay đổi ngày 07/10/2026 mới chạy gate, CHƯA KIỂM CHỨNG trên thiết bị (ảnh đại diện kỹ thuật viên, nút gửi AI, ví).
- SEP-136: một màn Lịch làm việc chứa editor khung giờ tuần theo ngày, preset/giờ chính xác, ngày nghỉ với chọn ngày và lịch đơn hiện có. Một màn Khu vực hoạt động chứa vị trí/bán kính và quận/huyện. Giữ payload lưu hiện hành, ngày tuần Sunday=0, khoảng giờ đã lưu, giới hạn 40 km, GPS/camera và tài chính. Bàn phím/safe area đã xử lý trong source; thiết bị còn CHƯA KIỂM CHỨNG.
- Chưa có push notification (`expo-notifications` đã cài nhưng chưa dùng); ảnh booking đã có upload adapter/controller nhưng runtime CHƯA KIỂM CHỨNG; khu vực phục vụ có màn chỉnh sau onboarding.
- Chưa có cấu hình EAS và bundle id. Root đã xử lý cold/warm return `fixhome://app/wallet` bằng đích an toàn cho Customer và GET-only refresh, bỏ mọi query payload; luồng Google/Technician giữ nguyên. OS delivery/native chưa kiểm chứng.
- Các hàm API chưa dùng trong UI production: `completeRepair`, `payInvoice`, `getWarranties`. `getStatusHistory` đã nối vào adapter redesign nhưng UI chưa cutover.
- Repo đang theo dõi `CLAUDE.md` và `.claude/settings.json` từ commit đầu; luật chung của nhóm không đưa cấu hình công cụ AI vào repo. Chờ PO quyết có gỡ hay không.
- Tài liệu audit ngày 23 và 24/09 trong `docs/` là ảnh chụp lịch sử, không phản ánh hiện trạng.

- SEC-01: Backend evidence GET vẫn trả face cho Customer đầy đủ quyền; Mobile lọc trước publish resource nhưng không thay thế phân quyền Backend. SEC-02/P6: upload support/warranty mới bị khóa theo quyết định owner. Không có API Customer/Technician đọc số ảnh tối thiểu; tách eligibility gửi completion để server kiểm tra khỏi readiness đã chứng minh, không gọi admin config.

## 9. Nhật ký cập nhật context

- 2026-10-14 14:23 (UTC+7) | foxonworld | foxonworld/sep139-order-flow-redesign | Đóng source M6 với các sửa tiền/return/capture/recovery, ghi render ví thật và giới hạn runtime; M7–M8 chưa triển khai, không publish.

- 2026-10-14 13:03 (UTC+7) | foxonworld | foxonworld/sep139-order-flow-redesign | Đóng M6 logic source gate sau review tài chính và sửa rollback ví HTTP422, lead xác minh 33 tests; M6 UI/root linking/capture return còn chờ.

- 2026-10-14 12:49 (UTC+7) | foxonworld | foxonworld/sep139-order-flow-redesign | Bàn giao M6 logic và gate 118 tests, ghi review tài chính đang chờ, sửa wallet HTTP envelope và cập nhật QA/render danh sách rỗng hai vai trò; UI/cutover/native/payment còn chưa kiểm chứng.

- 2026-10-14 05:55 (UTC+7) | foxonworld | foxonworld/sep139-order-flow-redesign | Đóng source gate UI M5, giữ capture mới chuyển tiếp M6 AFTER; QA sandbox đã khôi phục và Expo Web dev export thực đạt, native/render chưa kiểm chứng.

- 2026-10-14 04:23 (UTC+7) | foxonworld | foxonworld/sep139-order-flow-redesign | Cập nhật source M3–M4, controller/recovery M5 và gate UI/runtime còn chờ; sửa guard phát sinh độc lập, dữ liệu thiếu và nhận linh kiện sau storage; ghi QA sandbox ngừng chạy.

- 2026-10-13 22:30 (UTC+7) | foxonworld | foxonworld/sep139-order-flow-redesign | SEP-139 đóng ba bản sửa logic M3 về booking/lời mời chưa gửi và departure bị từ chối trước ghi; UI M3, thiết bị và cutover còn chưa hoàn tất.

- 2026-10-13 17:50 (UTC+7) | foxonworld | foxonworld/sep139-order-flow-redesign | SEP-139 sửa số tiền dạng chuỗi, tuần tự hóa ghi chú và thêm làm mới chi tiết; runtime và cutover chưa kiểm chứng.

- 2026-10-13 17:30 (UTC+7) | foxonworld | foxonworld/sep139-order-flow-redesign | SEP-139 bổ sung preview native chỉ đọc theo role, chi tiết tải một lần và ghi chú bảo vệ phiên; UI production và runtime còn chưa cutover/kiểm chứng.

- 2026-10-13 13:32 (UTC+7) | foxonworld | foxonworld/sep139-order-flow-redesign | SEP-139 thêm nền session/resolver/readback và journal, cập nhật contract Backend dev/privacy owner; UI cutover và runtime còn chưa kiểm chứng.

- 2026-10-13 02:11 (UTC+7) | foxonworld | integration/mobile-v2-gate-review | SEP-139 Technician mở toàn bộ chi tiết thành scene riêng, Back khôi phục chính xác bước trước; thêm regression test, device QA còn chờ.

- 2026-10-13 02:04 (UTC+7) | foxonworld | integration/mobile-v2-gate-review | SEP-139 nối explicit start-repair và readback, chuyển order detail sang stage/action hiện hành với progress sheet; full-details, thiết bị và review cuối còn CHƯA KIỂM CHỨNG.

- 2026-10-13 00:48 (UTC+7) | foxonworld | integration/mobile-v2-gate-review | SEP-137 bổ sung hoàn thiện khu vực địa chỉ Booking, rút gọn Booking/Matching và timeline Customer Order theo dữ kiện GET, giữ toàn bộ chi tiết và safety controllers.

- 2026-10-12 23:42 (UTC+7) | foxonworld | integration/mobile-v2-gate-review | SEP-136 đổi lịch tuần dọc, editor theo yêu cầu và sao chép bản nháp T2–T6; đồng bộ account shell và nút đăng xuất cuối scroll của hai role, giữ API và auth guards.

- 2026-10-12 23:03 (UTC+7) | foxonworld | integration/mobile-v2-gate-review | SEP-135 sửa API native dev theo host Metro; SEP-136 triển khai first-run/Guest Home dùng chung, handoff auth, lịch/khu vực hợp nhất và tab Ví; giữ guard dev, thiết bị chờ QA.

- 2026-10-12 21:52 (UTC+7) | foxonworld | integration/mobile-v2-gate-review | Tích hợp source production Customer và Technician, GET history an toàn, giữ guard dev và ghi hunk Auth/Finance/workflow HOLD cùng giới hạn QA.

- 2026-10-12 21:10 (UTC+7) | foxonworld | integration/mobile-v2-gate-review | Port UI demo hai vai trò, giới thiệu/Guest qua Login và hai thanh tab, giữ API dev, role handoff, các gate Auth/Finance và thiết bị chưa kiểm chứng.
- 2026-10-12 20:45 (UTC+7) | foxonworld | integration/mobile-v2-gate-review | Đối chiếu source SEP-132: page fail-closed, glass responsive opt-in, route thông báo thợ và các gate Auth/Finance còn chờ.

- 2026-10-09 00:17 (UTC+7) | ToanAltF4 | feat/technician-certificates | Đăng ký thợ: chứng chỉ không bắt buộc (bản công chứng), câu nhắc đến trụ sở sau khi nộp hồ sơ.
- 2026-10-09 00:08 (UTC+7) | ToanAltF4 | feat/technician-order-steps | Thợ: check-in mở camera chụp sản phẩm, bỏ nút bắt đầu sửa, hoàn thành kèm ảnh, chỉ dùng camera, nút cần thay đổi thợ.
- 2026-10-08 23:43 (UTC+7) | ToanAltF4 | feat/technician-sessions | Thợ: lịch hẹn theo buổi, ghi chú khách, nút xuất phát theo giờ cho phép, gửi GPS mỗi 5 phút, bán kính 40 km.
- 2026-10-08 21:49 (UTC+7) | ToanAltF4 | feat/customer-extend-matching-and-tech-areas | Khách gia hạn thời gian chờ thợ; thợ sửa khu vực phục vụ sau onboarding.
- 2026-10-07 22:05 (UTC+7) | ToanAltF4 | fix/technician-quote-status-label | Trạng thái báo giá hiện bằng chữ ở màn của kỹ thuật viên, dùng chung utils/quote-status.ts.
- 2026-10-07 19:31 (UTC+7) | ToanAltF4 | fix/no-fake-data-and-po-decisions | Ghi việc gỡ dữ liệu giả, ảnh đại diện kỹ thuật viên, BRX-064 và thông báo mới; bỏ rủi ro ảnh file:// đã sửa
- 2026-10-07 14:43 (UTC+7) | ToanAltF4 | docs/repo-context | Tạo file context theo bộ quy tắc chung của bốn repo, ghi hiện trạng sau đợt sửa lỗi ngày 07/10/2026
