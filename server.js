import fs from 'fs';
import path from 'path';

// Tải biến môi trường
dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const SETTINGS_FILE = path.join(process.cwd(), 'settings.json');

// Hàm lấy cấu hình (Ưu tiên file settings.json, sau đó mới đến .env)
const getPayOSConfig = () => {
  let config = {
    clientId: process.env.PAYOS_CLIENT_ID,
    apiKey: process.env.PAYOS_API_KEY,
    checksumKey: process.env.PAYOS_CHECKSUM_KEY
  };

  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const savedSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      if (savedSettings.payosClientId) config.clientId = savedSettings.payosClientId;
      if (savedSettings.payosApiKey) config.apiKey = savedSettings.payosApiKey;
      if (savedSettings.payosChecksumKey) config.checksumKey = savedSettings.payosChecksumKey;
    } catch (err) {
      console.error("Lỗi đọc file settings.json:", err);
    }
  }
  return config;
};

// Khởi tạo PayOS instance theo yêu cầu (để luôn cập nhật key mới)
const getPayOSInstance = () => {
  const config = getPayOSConfig();
  return new PayOS(config.clientId, config.apiKey, config.checksumKey);
};

// API lấy cấu hình hiện tại cho Frontend
app.get('/api/settings', (req, res) => {
  let settings = {
    shopName: "Cô Huệ Shop",
    shopAddress: "Ô 93, chợ Long Khánh, Đồng Nai.",
    shopPhone: "0342.035.370",
    payosClientId: process.env.PAYOS_CLIENT_ID || "",
    payosApiKey: process.env.PAYOS_API_KEY || "",
    payosChecksumKey: process.env.PAYOS_CHECKSUM_KEY || ""
  };

  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      settings = { ...settings, ...saved };
    } catch (err) {}
  }
  res.json(settings);
});

// API lưu cấu hình mới
app.post('/api/settings', (req, res) => {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(req.body, null, 2));
    res.json({ error: 0, message: "Đã lưu cài đặt thành công" });
  } catch (err) {
    res.status(500).json({ error: -1, message: "Lỗi khi lưu file" });
  }
});

app.post('/create-payment-link', async (req, res) => {
  const { amount, returnUrl, cancelUrl } = req.body;
  const payos = getPayOSInstance();
  
  // Tạo mã đơn hàng duy nhất (tối đa 53 bit nguyên dương, dùng Date.now() là an toàn)
  const orderCode = Number(String(Date.now()).slice(-6)); 

  const body = {
    orderCode: orderCode,
    amount: amount,
    description: 'Thanh toan don hang',
    returnUrl: returnUrl || 'http://localhost:5173',
    cancelUrl: cancelUrl || 'http://localhost:5173'
  };

  try {
    const paymentLinkRes = await payos.createPaymentLink(body);
    res.json({
      error: 0,
      message: "Success",
      data: {
        checkoutUrl: paymentLinkRes.checkoutUrl, // Link dẫn đến trang thanh toán của PayOS
        qrCode: paymentLinkRes.qrCode, // Text để tự gen mã QR nếu muốn
        orderCode: paymentLinkRes.orderCode
      }
    });
  } catch (error) {
    console.error("Lỗi khi tạo payment link:", error);
    res.status(500).json({
      error: -1,
      message: "fail",
      data: null
    });
  }
});

// Endpoint để PayOS gọi về khi khách thanh toán thành công
app.post('/payos-webhook', async (req, res) => {
  console.log("Nhận webhook từ PayOS:", req.body);
  const webhookData = req.body;
  
  try {
      // Xác thực dữ liệu webhook để đảm bảo đúng là PayOS gửi
      const data = payos.verifyPaymentWebhookData(webhookData);
      
      if (data.code === '00') {
          // THANH TOÁN THÀNH CÔNG!
          // Ở đây bạn có thể cập nhật trạng thái đơn hàng trong Firebase (Cần firebase-admin)
          // Hoặc thông báo cho Frontend qua Socket.io (Nâng cao)
          console.log(`Đã thanh toán thành công cho đơn hàng: ${data.orderCode}`);
      }
      res.json({ error: 0, message: "Ok", data: data });
  } catch (error) {
      console.error("Lỗi verify webhook:", error);
      res.json({ error: -1, message: "fail", data: null });
  }
});

const PORT = 3030;
app.listen(PORT, () => {
  console.log(`🚀 PayOS Backend đang chạy tại http://localhost:${PORT}`);
  console.log(`💡 Lưu ý: Hãy cập nhật các PAYOS_KEY trong file .env.local`);
});
