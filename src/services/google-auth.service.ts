// src/services/google-auth.service.ts
//
// Đăng nhập Google trên mobile, đi vòng qua backend.
//
// Vì sao không dùng SDK Google chạy thẳng trong app: SDK đó buộc phải khai báo
// vân tay SHA-1 của keystore lên Google Console, mà mỗi máy lập trình viên có
// một keystore debug riêng — nghĩa là mỗi người phải tự vào Console khai báo.
// Nó cũng đòi prebuild, thứ mà AGENTS.md của repo này cấm.
//
// Vì sao không mở thẳng Google từ app: Google không chấp nhận địa chỉ quay về
// kiểu `exp://192.168.1.8:8081` của Expo Go.
//
// Cách làm ở đây tránh được cả hai: app mở trình duyệt trỏ vào backend, backend
// mới là bên nói chuyện với Google bằng đúng một địa chỉ cố định đã khai báo
// một lần cho cả đội. Địa chỉ quay về app do app tự sinh lúc chạy và chỉ gửi
// cho backend, Google không bao giờ nhìn thấy nó.
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { APP_CONFIG } from '../constants';

/**
 * Cho phép trình duyệt đóng lại sạch sẽ sau khi xác thực xong. Gọi một lần ở
 * mức module là đủ cho cả vòng đời ứng dụng.
 */
WebBrowser.maybeCompleteAuthSession();

export class GoogleSignInCancelled extends Error {
  constructor() {
    super('Bạn đã huỷ đăng nhập bằng Google');
    this.name = 'GoogleSignInCancelled';
  }
}

/** Địa chỉ backend, bỏ phần `/api/v1` để ghép lại cho rõ ràng. */
function apiOrigin(): string {
  return APP_CONFIG.API_BASE_URL.replace(/\/api\/v\d+\/?$/, '');
}

/**
 * Địa chỉ app muốn được đưa về.
 *
 * Trong Expo Go giá trị này là `exp://<IP-LAN>:8081/--/auth/google` nên khác
 * nhau theo từng máy — đó chính là lý do nó được sinh lúc chạy thay vì khai báo
 * cứng ở đâu đó. Backend kiểm nó theo danh sách tiền tố cho phép.
 */
export function buildAppRedirectUrl(): string {
  return Linking.createURL('auth/google');
}

/**
 * Mở trình duyệt hệ thống cho người dùng chọn tài khoản Google.
 *
 * Trả về mã bàn giao sống 60 giây. Mã này đi qua thanh địa chỉ nên backend cố ý
 * không đặt token thật ở đó; bước đổi mã lấy phiên nằm ở `auth.api.ts`.
 */
export async function startGoogleSignIn(): Promise<string> {
  const redirectUrl = buildAppRedirectUrl();
  const startUrl = `${apiOrigin()}/api/v1/auth/google/start?redirect=${encodeURIComponent(redirectUrl)}`;

  const result = await WebBrowser.openAuthSessionAsync(startUrl, redirectUrl);

  // Người dùng bấm quay lại hoặc vuốt đóng trình duyệt.
  if (result.type !== 'success' || !result.url) {
    throw new GoogleSignInCancelled();
  }

  const { queryParams } = Linking.parse(result.url);
  const error = queryParams?.error;
  if (typeof error === 'string' && error) {
    // Backend đẩy lý do thật vào đây — tài khoản bị khoá chẳng hạn — để thông
    // báo hiện trong app chứ không phải trong tab trình duyệt sắp đóng.
    throw new Error(
      error === 'access_denied' || error === 'missing_code'
        ? 'Bạn đã huỷ đăng nhập bằng Google'
        : error,
    );
  }

  const code = queryParams?.code;
  if (typeof code !== 'string' || !code) {
    throw new Error('Không nhận được mã đăng nhập từ máy chủ');
  }
  return code;
}
