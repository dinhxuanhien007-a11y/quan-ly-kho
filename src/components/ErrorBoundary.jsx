// src/components/ErrorBoundary.jsx
import React from 'react';
import * as Sentry from "@sentry/react"; // <-- THÊM DÒNG NÀY

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error: error };
  }

  componentDidCatch(error, errorInfo) {
    // Thay vì chỉ log ra console, chúng ta gửi lỗi đến Sentry
    console.error("Uncaught error:", error, errorInfo);
    Sentry.captureException(error, { extra: errorInfo }); // <-- THAY ĐỔI Ở ĐÂY
  }

  render() {
    if (this.state.hasError) {
      // Giao diện dự phòng khi có lỗi
      return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <h1>Rất tiếc, đã có lỗi xảy ra.</h1>
          <p>Đã có sự cố không mong muốn trong ứng dụng.</p>
          <p>Vui lòng thử tải lại trang hoặc liên hệ với quản trị viên.</p>
          <details style={{ whiteSpace: 'pre-wrap', marginTop: '20px' }}>
            <summary>Chi tiết lỗi (dành cho nhà phát triển)</summary>
            {this.state.error && this.state.error.toString()}
          </details>
        </div>
      );
    }

    // Nếu không có lỗi, render các component con bình thường
    return this.props.children;
  }
}

export default ErrorBoundary;