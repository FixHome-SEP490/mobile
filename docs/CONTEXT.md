# Context repo mobile — FixHome

> Cập nhật lần cuối: 2026-10-08 23:43 (UTC+7) · Người cập nhật (git): ToanAltF4 · Nhánh: feat/technician-sessions

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

- Đặt lịch thường: Dịch vụ → Chi tiết dịch vụ → Tạo booking (địa chỉ đã lưu, ngày giờ) → `POST /bookings`.
- Đặt lịch có AI: màn chẩn đoán nhận mô tả và tối đa 3 ảnh, chuyển sang trò chuyện với AI; AI không tự đặt lịch mà điền sẵn dịch vụ, mô tả và `aiSessionId` vào màn tạo booking.
- Chọn đúng 2 kỹ thuật viên theo thứ tự ở màn tìm thợ.
- Đơn: duyệt báo giá và chi phí phát sinh, huỷ, xác nhận hoàn tất, hoá đơn, tiền mặt, mở VNPay, đánh giá, xem bằng chứng.
- Lịch sử sửa chữa, trung tâm bảo hành, hỗ trợ, chat với kỹ thuật viên, thông báo có phân trang, hồ sơ và địa chỉ có bản đồ, màn bảo mật (đổi mật khẩu bằng OTP).

### Kỹ thuật viên

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

### Đăng nhập Google

Mở `{origin}/api/v1/auth/google/start?redirect=<deep link auth/google>` bằng `WebBrowser.openAuthSessionAsync`, nhận mã sống 60 giây rồi đổi ở `/auth/google/exchange`. App không cần Google client id.

## 4. Kiến trúc và thư mục chính

- `src/api/`: axios dùng chung (`client.ts`) và khoảng 20 module gọi API, có test.
- `src/navigation/`: App, Auth, Customer, Technician navigator. Tab khách: Trang chủ, Đơn của tôi, Thông báo, Hồ sơ (thêm nút trợ lý AI). Tab kỹ thuật viên: Trang chủ, Lời mời, Công việc, Thông báo, Hồ sơ.
- `src/screens/`: `auth`, `chat`, `customer`, `technician`. Logic thuần đặt trong file `kebab-case.ts` cạnh màn hình, có `.test.ts` đi kèm.
- `src/services/`: `storage.service.ts` (SecureStore), `chat-socket.service.ts`, `google-auth.service.ts`, `image-for-ai.ts` (thu ảnh về 1280 px, base64).
- `src/store/`: Zustand `auth.store`, `badge.store`, `ui.store`.
- `src/constants/`: `config.ts` (đọc biến môi trường), `theme.ts` (`useAppTheme`).
- `src/utils/`: giờ Việt Nam (`vn-time`), định dạng, kiểm dữ liệu nhập, khung giờ booking.

## 5. Hợp đồng với repo khác

- REST tới `backend` qua `EXPO_PUBLIC_API_BASE_URL`; để trống thì dùng `http://10.0.2.2:3000/api/v1` trên Android emulator và `http://localhost:3000/api/v1` nơi khác. Token lưu bằng `expo-secure-store`, không dùng AsyncStorage cho thông tin đăng nhập.
- Gặp 401 thì gọi một lần `POST /auth/refresh` dùng chung; chỉ chạy lại yêu cầu GET, HEAD, OPTIONS, không tự chạy lại thao tác ghi.
- Danh sách gửi `page` và `pageSize` hoặc `limit` không quá 100; `status` viết thường đúng enum.
- Socket.IO tới `{origin}/chat` (origin là base URL bỏ `/api/v1`), chỉ dùng cho chat: gửi `conversation:join`, `typing`; nhận `message:*`, `conversation:updated`, `typing`; tự vào lại phòng khi kết nối lại.
- AI chỉ qua `/ai/diagnoses`, `/ai/chat/ask`, `/ai/chat/acknowledgements` của `backend`; mô tả tối đa 2000 ký tự, câu hỏi 1000, tối đa 3 ảnh. `aiApi` không bao giờ ném lỗi, trả câu dự phòng khi AI không có.
- Ảnh đại diện phải tải lên `POST /media/upload` trước rồi mới gửi URL http(s) vào `PATCH /users/me`; `backend` từ chối đường dẫn ảnh trên máy.
- Biến môi trường (chỉ tên): `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_APP_NAME`. Mọi biến `EXPO_PUBLIC_*` đều công khai trong app.

## 6. Chạy, kiểm thử và cổng chất lượng

- Node 22.13 trở lên (`.nvmrc` 22.15.0). `npm ci`, `npm start`, quét mã QR bằng Expo Go. Dùng backend trên máy khác trong mạng LAN: đặt `EXPO_PUBLIC_API_BASE_URL=http://<LAN-IP>:3000/api/v1` rồi khởi động lại Metro (thêm `--clear` nếu bundle cũ). Đăng nhập Google trên Android emulator cần `adb reverse tcp:3000 tcp:3000`.
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

## 8. Việc đang dở và rủi ro đã biết

- Thay đổi ngày 07/10/2026 mới chạy gate, CHƯA KIỂM CHỨNG trên thiết bị (ảnh đại diện kỹ thuật viên, nút gửi AI, ví).
- Mở lại app khi đã có token, khách có thể rơi vào màn đăng nhập vì nhánh không phải kỹ thuật viên bắt đầu ở `Auth`. CHƯA KIỂM CHỨNG trên thiết bị.
- Chưa có push notification (`expo-notifications` đã cài nhưng chưa dùng); booking thường chưa gửi kèm ảnh; khu vực phục vụ chỉ đặt được trong onboarding.
- Chưa có cấu hình EAS, bundle id, hay `linking` cho deep link ngoài luồng Google.
- Các hàm API chưa dùng: `completeRepair`, `payInvoice`, `getStatusHistory`, `getWarranties`.
- Repo đang theo dõi `CLAUDE.md` và `.claude/settings.json` từ commit đầu; luật chung của nhóm không đưa cấu hình công cụ AI vào repo. Chờ PO quyết có gỡ hay không.
- Tài liệu audit ngày 23 và 24/09 trong `docs/` là ảnh chụp lịch sử, không phản ánh hiện trạng.

## 9. Nhật ký cập nhật context

- 2026-10-08 23:43 (UTC+7) | ToanAltF4 | feat/technician-sessions | Thợ: lịch hẹn theo buổi, ghi chú khách, nút xuất phát theo giờ cho phép, gửi GPS mỗi 5 phút, bán kính 40 km.
- 2026-10-08 21:49 (UTC+7) | ToanAltF4 | feat/customer-extend-matching-and-tech-areas | Khách gia hạn thời gian chờ thợ; thợ sửa khu vực phục vụ sau onboarding.
- 2026-10-07 22:05 (UTC+7) | ToanAltF4 | fix/technician-quote-status-label | Trạng thái báo giá hiện bằng chữ ở màn của kỹ thuật viên, dùng chung utils/quote-status.ts.
- 2026-10-07 19:31 (UTC+7) | ToanAltF4 | fix/no-fake-data-and-po-decisions | Ghi việc gỡ dữ liệu giả, ảnh đại diện kỹ thuật viên, BRX-064 và thông báo mới; bỏ rủi ro ảnh file:// đã sửa
- 2026-10-07 14:43 (UTC+7) | ToanAltF4 | docs/repo-context | Tạo file context theo bộ quy tắc chung của bốn repo, ghi hiện trạng sau đợt sửa lỗi ngày 07/10/2026
