// src/pages/TestPage.jsx
import React, { useState } from 'react';
// Chúng ta vẫn cần hàm này để định dạng
import { formatExpiryDate } from '../utils/dateUtils';

const TestPage = () => {
  const [testDate, setTestDate] = useState('');

  // HÀM MỚI: Chỉ định dạng khi người dùng rời khỏi ô input
  const handleBlurFormat = (e) => {
    const formattedValue = formatExpiryDate(e.target.value);
    setTestDate(formattedValue);
  };

  return (
    <div style={{ padding: '40px' }}>
      <h1>Trang Kiểm Tra Lỗi HSD (Giải Pháp Mới)</h1>
      <p>
        Hãy thử gõ một chuỗi số vào ô bên dưới (ví dụ: 12122025), sau đó bấm phím Tab hoặc click chuột ra ngoài ô.
      </p>

      <div style={{ marginTop: '20px' }}>
        <label htmlFor="test-input" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          Ô Input Test HSD (dd/mm/yyyy)
        </label>
        <input
          id="test-input"
          type="text"
          value={testDate}
          // HÀM CŨ: Giờ chỉ cập nhật giá trị thô, không định dạng
          onChange={(e) => setTestDate(e.target.value)}
          // HÀM MỚI: Kích hoạt định dạng khi rời đi
          onBlur={handleBlurFormat}
          placeholder="dd/mm/yyyy"
          style={{ padding: '10px', fontSize: '16px', width: '300px' }}
        />
      </div>

      <div style={{ marginTop: '20px' }}>
        <strong>Giá trị hiện tại của state:</strong> {testDate}
      </div>
    </div>
  );
};

export default TestPage;