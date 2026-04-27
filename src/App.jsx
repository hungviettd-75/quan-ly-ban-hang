import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  History,
  Plus,
  Search,
  Trash2,
  Edit3,
  PlusCircle,
  MinusCircle,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  ChevronRight,
  User,
  LogOut,
  Phone,
  MapPin,
  MessageCircle,
  Filter,
  Heart,
  Wind,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import logo from './assets/logo.png';
import { db } from './firebase';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
  getDocs
} from 'firebase/firestore';

const CATEGORIES = ['Tất cả', 'Nón Nam', 'Nón Nữ', 'Túi xách', 'Khăn quàng', 'Phụ kiện'];

// Dữ liệu mẫu mặc định (chỉ dùng khi DB trống)
const DEFAULT_PRODUCTS = [
  { name: 'Nón Fedora Classic', category: 'Nón Nam', price: 350000, cost: 150000, stock: 15, image: '/fedora_iso.png' },
  { name: 'Nón Cói Đi Biển', category: 'Nón Nữ', price: 280000, cost: 120000, stock: 8, image: '/straw_iso.png' },
  { name: 'Túi Xách Da Cao Cấp', category: 'Túi xách', price: 850000, cost: 450000, stock: 5, image: '/handbag_iso.png' },
  { name: 'Ví Cầm Tay Mini', category: 'Phụ kiện', price: 150000, cost: 60000, stock: 20, image: '/wallet_iso.png' },
  { name: 'Nón Snapback Urban', category: 'Nón Nam', price: 220000, cost: 90000, stock: 3, image: '/snapback_iso.png' },
  { name: 'Khăn Lụa Họa Tiết', category: 'Khăn quàng', price: 180000, cost: 70000, stock: 12, image: '/scarf_iso.png' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('pos');
  const [userRole, setUserRole] = useState('customer');
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tất cả');
  const [showCart, setShowCart] = useState(false);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' or 'qr'
  const [zoomedProduct, setZoomedProduct] = useState(null);

  // Try-on State
  const [tryOnImage, setTryOnImage] = useState(null);
  const [selectedTryOnProduct, setSelectedTryOnProduct] = useState(null);
  const [tryOnScale, setTryOnScale] = useState(1);
  const [isScanning, setIsScanning] = useState(false);
  const [autoAligned, setAutoAligned] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [faceData, setFaceData] = useState(null);
  const [tryOnPos, setTryOnPos] = useState({ top: '15%', left: '25%', width: '50%' });
  const [expandedInsight, setExpandedInsight] = useState(null);
  const [expandedStat, setExpandedStat] = useState(null); // 'stock' | 'lowStock' | null
  const [isProcessingImage, setIsProcessingImage] = useState(false); // AI đang xử lý ảnh sản phẩm

  // Initialize MediaPipe
  useEffect(() => {
    const initAI = async () => {
      if (!window.vision) return;
      const vision = await window.vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      const faceLandmarker = await window.vision.FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        runningMode: "IMAGE",
        numFaces: 1
      });
      window.aiDetector = faceLandmarker;
    };
    initAI();
  }, []);

  // Firebase Data Sync
  useEffect(() => {
    // Sync Products
    const unsubProducts = onSnapshot(collection(db, "products"), (snapshot) => {
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(prods);

      // Khởi tạo dữ liệu mẫu nếu DB trống
      if (snapshot.empty) {
        DEFAULT_PRODUCTS.forEach(p => addDoc(collection(db, "products"), p));
      }
    });

    // Sync Orders
    const qOrders = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubProducts();
      unsubOrders();
    };
  }, []);

  // New Product Form State
  const [newProduct, setNewProduct] = useState({
    name: '',
    price: '',
    stock: '',
    category: 'Nón Nam',
    image: null
  });

  const compressImage = (base64Str, maxWidth = 800, maxHeight = 800) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
    });
  };

  // Chụp ảnh sản phẩm: Sử dụng ảnh gốc (đã được nén để tối ưu dung lượng)
  const handleImageCapture = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsProcessingImage(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const compressed = await compressImage(reader.result);
        setNewProduct(prev => ({ ...prev, image: compressed }));
      } catch (err) {
        console.error('Lỗi xử lý ảnh:', err);
      } finally {
        setIsProcessingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProduct = async () => {
    if (!newProduct.name || !newProduct.price) {
      alert('Vui lòng nhập tên và giá sản phẩm');
      return;
    }

    const productData = {
      name: newProduct.name,
      category: newProduct.category,
      price: Number(newProduct.price),
      cost: Math.round(Number(newProduct.price) * 0.4), // Giả định giá vốn
      stock: Number(newProduct.stock) || 0,
      image: newProduct.image || 'https://images.unsplash.com/photo-1576905063853-bc2e742e80bc?q=80&w=200',
      createdAt: serverTimestamp()
    };

    try {
      if (editingProduct) {
        await updateDoc(doc(db, "products", editingProduct.id), productData);
        alert('Đã cập nhật sản phẩm thành công!');
      } else {
        await addDoc(collection(db, "products"), productData);
        alert('Đã lưu sản phẩm vào hệ thống đám mây!');
      }
      setIsAddingProduct(false);
      setEditingProduct(null);
      setNewProduct({ name: '', price: '', stock: '', category: 'Nón Nam', image: null });
    } catch (err) {
      alert('Lỗi khi lưu sản phẩm: ' + err.message);
    }
  };

  const startEditProduct = (product) => {
    setEditingProduct(product);
    setNewProduct({
      name: product.name,
      price: product.price,
      stock: product.stock,
      category: product.category,
      image: product.image
    });
    setIsAddingProduct(true);
  };

  const deleteProduct = async (id) => {
    if (window.confirm('Bạn có chắc muốn xóa sản phẩm này?')) {
      try {
        await deleteDoc(doc(db, "products", id));
      } catch (err) {
        alert('Lỗi khi xóa: ' + err.message);
      }
    }
  };

  const handleVerifyPin = () => {
    if (pinInput === '0452') { // Simple PIN for demo
      setUserRole('manager');
      setActiveTab('dashboard');
      setShowPinModal(false);
      setPinInput('');
    } else {
      alert('Mã PIN không chính xác!');
      setPinInput('');
    }
  };

  const handleLogout = () => {
    setUserRole('customer');
    setActiveTab('pos');
    setCart([]);
  };

  const handleTryOnCapture = (e) => {
    const file = e.target.files[0];
    if (file) {
      setIsScanning(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const compressed = await compressImage(reader.result, 1080, 1440); // Nén nhẹ để giữ độ nét khi thử đồ
        setTryOnImage(compressed);

        // Detect Face with MediaPipe or fallback
        const img = new Image();
        img.src = compressed;
        img.onload = async () => {
          let detected = false;
          if (window.aiDetector) {
            try {
              const result = await window.aiDetector.detect(img);
              if (result.faceLandmarks && result.faceLandmarks.length > 0) {
                const lm = result.faceLandmarks[0];
                const xs = lm.map(l => l.x);
                const ys = lm.map(l => l.y);
                setFaceData({
                  width: Math.max(...xs) - Math.min(...xs),
                  centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
                  centerY: (Math.min(...ys) + Math.max(...ys)) / 2,
                  top: Math.min(...ys),
                  bottom: Math.max(...ys)
                });
                detected = true;
              }
            } catch (err) { console.log('AI fallback mode'); }
          }
          if (!detected) {
            // Fallback: assume portrait photo, face in center-upper area
            setFaceData({
              width: 0.35,
              centerX: 0.5,
              centerY: 0.35,
              top: 0.18,
              bottom: 0.52
            });
          }
          setIsScanning(false);
        };
      };
      reader.readAsDataURL(file);
    }
  };

  // AI Background Removal
  const removeBackground = (imgElement) => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = imgElement.width;
      canvas.height = imgElement.height;
      ctx.drawImage(imgElement, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      // Remove white/light background
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r > 220 && g > 220 && b > 220) {
          data[i + 3] = 0;
        } else if (r > 200 && g > 200 && b > 200) {
          data[i + 3] = Math.round(data[i + 3] * 0.3); // Semi-transparent for edges
        }
      }
      ctx.putImageData(imageData, 0, 0);

      // Feathering for smooth edges
      ctx.globalCompositeOperation = 'destination-in';
      ctx.filter = 'blur(0.5px)';
      ctx.drawImage(canvas, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.filter = 'none';

      resolve(canvas.toDataURL());
    });
  };

  // AI Smart Positioning per product type
  const getSmartPosition = (product) => {
    const cat = product.category;
    const face = faceData || { width: 0.35, centerX: 0.5, centerY: 0.35, top: 0.18, bottom: 0.52 };

    if (cat.includes('Nón')) {
      // Nón → đặt trên đỉnh đầu
      const hatW = face.width * 1.8;
      return {
        top: (face.top * 100 - 12) + '%',
        left: (face.centerX * 100 - (hatW * 100 / 2)) + '%',
        width: (hatW * 100) + '%'
      };
    } else if (cat.includes('Túi')) {
      // Túi xách → đặt bên hông, ngang eo
      const bagW = face.width * 1.5;
      return {
        top: (face.bottom * 100 + 8) + '%',
        left: (face.centerX * 100 + face.width * 40) + '%',
        width: (bagW * 100) + '%'
      };
    } else if (cat.includes('Khăn') || cat.includes('Kh\u0103n')) {
      // Khăn quàng → đặt vùng cổ (dưới cằm)
      const scarfW = face.width * 1.6;
      return {
        top: (face.bottom * 100 - 5) + '%',
        left: (face.centerX * 100 - (scarfW * 100 / 2)) + '%',
        width: (scarfW * 100) + '%'
      };
    } else {
      // Phụ kiện (ví, kính...) → ngang ngực/tay
      const accW = face.width * 1.2;
      return {
        top: (face.bottom * 100) + '%',
        left: (face.centerX * 100 - (accW * 100 / 2)) + '%',
        width: (accW * 100) + '%'
      };
    }
  };

  const handleAutoAlign = async (product) => {
    setIsScanning(true);
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = product.image;
    img.onload = async () => {
      const processedImage = await removeBackground(img);
      const pos = getSmartPosition(product);
      setTryOnPos(pos);
      setTryOnScale(1);

      setSelectedTryOnProduct({ ...product, processedImage });
      setAutoAligned(false);
      setIsScanning(false);

      setTimeout(() => setAutoAligned(true), 400);
    };
  };

  // Export Final Image (like CapCut)
  const exportTryOnImage = () => {
    if (!tryOnImage || !selectedTryOnProduct) return;

    const canvasEl = document.createElement('canvas');
    const ctx = canvasEl.getContext('2d');
    canvasEl.width = 1080;
    canvasEl.height = 1440; // 3:4 ratio

    const customerImg = new Image();
    customerImg.src = tryOnImage;
    customerImg.onload = () => {
      // Draw customer photo (fill canvas)
      const scale = Math.max(canvasEl.width / customerImg.width, canvasEl.height / customerImg.height);
      const x = (canvasEl.width - customerImg.width * scale) / 2;
      const y = (canvasEl.height - customerImg.height * scale) / 2;
      ctx.drawImage(customerImg, x, y, customerImg.width * scale, customerImg.height * scale);

      // Draw product on top
      const prodImg = new Image();
      prodImg.crossOrigin = "anonymous";
      prodImg.src = selectedTryOnProduct.processedImage || selectedTryOnProduct.image;
      prodImg.onload = () => {
        const pTop = parseFloat(tryOnPos.top) / 100 * canvasEl.height;
        const pLeft = parseFloat(tryOnPos.left) / 100 * canvasEl.width;
        const pWidth = (parseFloat(tryOnPos.width) / 100 * canvasEl.width) * tryOnScale;
        const pHeight = pWidth * (prodImg.height / prodImg.width);

        if (isFlipped) {
          ctx.save();
          ctx.translate(pLeft + pWidth / 2, pTop + pHeight / 2);
          ctx.scale(-1, 1);
          ctx.translate(-(pLeft + pWidth / 2), -(pTop + pHeight / 2));
        }

        // Apply shadow
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetY = 10;
        ctx.drawImage(prodImg, pLeft, pTop, pWidth, pHeight);
        ctx.shadowColor = 'transparent';
        if (isFlipped) ctx.restore();

        // Watermark / Branding
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, canvasEl.height - 70, canvasEl.width, 70);
        ctx.font = 'bold 28px Outfit, sans-serif';
        ctx.fillStyle = '#F59E0B';
        ctx.textAlign = 'center';
        ctx.fillText('C\u00f4 Hu\u1ec7 Shop \u2022 Th\u1eed \u0111\u1ed3 \u1ea3o AI', canvasEl.width / 2, canvasEl.height - 28);

        // Download
        const link = document.createElement('a');
        link.download = `CoHueShop_ThuDo_${Date.now()}.png`;
        link.href = canvasEl.toDataURL('image/png');
        link.click();
      };
    };
  };

  // Logic: POS Cart
  const addToCart = (product) => {
    if (product.stock <= 0) return;
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (id) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const updateCartQuantity = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const handleCheckout = () => {
    if (cart.length === 0) return;
    setShowCart(false);
    setShowPaymentModal(true);
  };

  const confirmPayment = async () => {
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const orderData = {
      createdAt: serverTimestamp(),
      date: new Date().toISOString().split('T')[0],
      items: cart.map(item => ({ productId: item.id, quantity: item.quantity, price: item.price })),
      total: total,
      method: paymentMethod
    };

    try {
      // 1. Lưu đơn hàng
      await addDoc(collection(db, "orders"), orderData);

      // 2. Cập nhật tồn kho cho từng sản phẩm
      for (const item of cart) {
        const productRef = doc(db, "products", item.id);
        const currentProd = products.find(p => p.id === item.id);
        if (currentProd) {
          await updateDoc(productRef, {
            stock: Math.max(0, currentProd.stock - item.quantity)
          });
        }
      }

      setCart([]);
      setShowPaymentModal(false);
      setShowCart(false);

      if (userRole === 'manager') {
        setActiveTab('orders');
      }

      alert(userRole === 'manager'
        ? `Thanh toán ${paymentMethod === 'cash' ? 'tiền mặt' : 'chuyển khoản'} thành công!`
        : 'Đã xác nhận đơn hàng thành công! Vui lòng cho chủ shop xem màn hình này.'
      );
    } catch (err) {
      alert('Lỗi khi xử lý thanh toán: ' + err.message);
    }
  };

  // Logic: Filters
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'Tất cả' || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayOrders = orders.filter(o => o.date === todayStr);
    const revenue = todayOrders.reduce((sum, o) => sum + o.total, 0);
    const lowStock = products.filter(p => p.stock < 5).length;
    const totalItems = products.reduce((sum, p) => sum + p.stock, 0);
    return { revenue, lowStock, totalItems };
  }, [orders, products]);

  const aiInsights = useMemo(() => {
    const recommendations = [];

    // 1. Phân tích hàng bán chạy
    const salesCount = {};
    orders.forEach(o => {
      o.items.forEach(item => {
        salesCount[item.productId] = (salesCount[item.productId] || 0) + item.quantity;
      });
    });

    const topSellingId = Object.entries(salesCount).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topProduct = products.find(p => p.id == topSellingId);

    if (topProduct && topProduct.stock < 10) {
      recommendations.push({
        type: 'trend',
        title: `Nhập thêm ${topProduct.name}`,
        desc: 'Bán chạy nhất tháng, kho sắp hết.',
        priority: 'high',
        reason: `Sản phẩm này đã bán được ${salesCount[topSellingId]} chiếc trong tháng, chiếm vị trí số 1 toàn shop. Hiện chỉ còn ${topProduct.stock} sản phẩm trong kho – nếu không nhập thêm sẽ hết hàng trong 3-5 ngày tới và mất doanh thu.`
      });
    }

    // 2. Phân tích lợi nhuận
    const highMarginProduct = [...products].sort((a, b) => (b.price - b.cost) - (a.price - a.cost))[0];
    if (highMarginProduct) {
      const margin = highMarginProduct.price - highMarginProduct.cost;
      const marginPercent = Math.round((margin / highMarginProduct.price) * 100);
      recommendations.push({
        type: 'profit',
        title: `Đẩy mạnh ${highMarginProduct.name}`,
        desc: 'Biên lợi nhuận tốt nhất, nên nhập thêm.',
        priority: 'medium',
        reason: `Mỗi sản phẩm bán ra lãi ${margin.toLocaleString()}đ (${marginPercent}% giá bán). Đây là mặt hàng có tỉ suất lợi nhuận cao nhất shop. Nhập thêm các mẫu tương tự sẽ giúp tăng lợi nhuận đáng kể.`
      });
    }

    // 3. Phân tích xu hướng mùa vụ (giả định)
    const month = new Date().getMonth() + 1;
    if (month >= 4 && month <= 8) {
      recommendations.push({
        type: 'seasonal',
        title: 'Nhập Nón Cói & Túi biển',
        desc: 'Mùa du lịch, nhu cầu tăng 40%.',
        priority: 'high',
        reason: `Tháng ${month} là cao điểm mùa du lịch hè. Theo xu hướng hàng năm, nhu cầu nón cói và túi đi biển thường tăng 40% so với các tháng khác. Nhập sớm để đón đầu nhu cầu và tránh hết hàng khi vào vụ.`
      });
    }

    return recommendations;
  }, [orders, products]);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="main-header">
        <div className="header-content">
          <div className="logo" onClick={() => setActiveTab('pos')}>
            <div className="logo-icon-wrapper">
              <img src={logo} alt="Logo" className="logo-img" />
            </div>
            <div className="logo-text">
              <h1 className="logo-name">Cô Huệ Shop</h1>
              <span className="logo-tagline">Premium Boutique</span>
            </div>
          </div>
          <div className="header-actions">
            {userRole === 'customer' ? (
              <button className="btn-login-manager" onClick={() => setShowPinModal(true)}>
                <User size={18} />
                <span>Quản lý</span>
              </button>
            ) : (
              <button className="btn-logout-manager" onClick={handleLogout}>
                <LogOut size={18} />
                <span>Thoát</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* PIN Verification Modal */}
      <AnimatePresence>
        {showPinModal && (
          <div className="modal-overlay" style={{ zIndex: 3000 }}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="pin-modal"
            >
              <h3>Xác thực Quản lý</h3>
              <p>Vui lòng nhập mã PIN để tiếp tục</p>
              <input
                type="password"
                placeholder="****"
                className="pin-input"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                autoFocus
              />
              <div className="form-actions">
                <button className="btn-cancel" onClick={() => setShowPinModal(false)}>Hủy</button>
                <button className="btn-submit" onClick={handleVerifyPin}>Xác nhận</button>
              </div>
              <p className="hint">Gợi ý: 1234</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
      <AnimatePresence>
        {showPaymentModal && (
          <div className="modal-overlay" style={{ zIndex: 3000 }}>
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="payment-modal glass-effect"
            >
              <h3>Phương thức thanh toán</h3>
              <p className="total-label">Tổng cộng: {cart.reduce((s, i) => s + (i.price * i.quantity), 0).toLocaleString()}đ</p>

              <div className="payment-options">
                <div
                  className={`pay-opt ${paymentMethod === 'cash' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('cash')}
                >
                  <ShoppingBag size={24} />
                  <span>Tiền mặt</span>
                </div>
                <div
                  className={`pay-opt ${paymentMethod === 'qr' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('qr')}
                >
                  <CheckCircle2 size={24} />
                  <span>Quét mã VietQR</span>
                </div>
              </div>

              {paymentMethod === 'qr' && (
                <div className="qr-container fade-in">
                  <img
                    src={`https://img.vietqr.io/image/970416-0123456789-compact.png?amount=${cart.reduce((s, i) => s + (i.price * i.quantity), 0)}&addInfo=Thanh+toan+Co+Hue+Shop`}
                    alt="VietQR"
                    className="qr-img"
                  />
                  <p className="qr-hint">Mã QR tự động tạo theo số tiền đơn hàng</p>
                </div>
              )}

              <div className="form-actions">
                <button className="btn-cancel" onClick={() => setShowPaymentModal(false)}>Hủy</button>
                <button className="btn-submit" onClick={confirmPayment}>Xác nhận thanh toán</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Zoom Product Modal */}
      <AnimatePresence>
        {zoomedProduct && (
          <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={() => setZoomedProduct(null)}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="zoom-modal glass-effect"
              onClick={(e) => e.stopPropagation()}
            >
              <button className="btn-close-zoom" onClick={() => setZoomedProduct(null)}>×</button>
              <img src={zoomedProduct.image} alt={zoomedProduct.name} className="zoomed-image" />
              <div className="zoom-info">
                <h3>{zoomedProduct.name}</h3>
                <p className="zoom-price">{zoomedProduct.price.toLocaleString()}đ</p>
                <button className="btn-buy-zoom" onClick={() => { addToCart(zoomedProduct); setZoomedProduct(null); }}>
                  <Plus size={18} /> Thêm vào giỏ
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="main-content">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="page dashboard-page"
            >
              <div className="dashboard-header" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>Tổng Quan Quản Lý</h2>
                <p style={{ color: '#f59e0b', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: '6px' }}>Hệ Thống Phân Tích Kinh Doanh</p>
              </div>

              <section className="stats-grid">
                <div className="stat-card" onClick={() => setExpandedStat(expandedStat === 'revenue' ? null : 'revenue')}>
                  <div className="stat-icon revenue" style={{ background: 'rgba(251, 191, 36, 0.1)', color: 'var(--primary)' }}>
                    <TrendingUp size={20} />
                  </div>
                  <div className="stat-info">
                    <span className="label">Doanh thu</span>
                    <span className="value">{stats.revenue.toLocaleString()}đ</span>
                  </div>
                </div>
                <div className="stat-card" onClick={() => setExpandedStat(expandedStat === 'stock' ? null : 'stock')}>
                  <div className="stat-icon stock" style={{ background: 'rgba(52, 211, 153, 0.1)', color: 'var(--secondary)' }}>
                    <Package size={20} />
                  </div>
                  <div className="stat-info">
                    <span className="label">Tồn kho</span>
                    <span className="value">{stats.totalItems} sp</span>
                  </div>
                </div>
              </section>

              {expandedStat && (
                <motion.section
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="stat-detail-list glass-effect"
                >
                  <h4>{
                    expandedStat === 'revenue' ? 'Sản phẩm đã bán hôm nay' :
                      expandedStat === 'stock' ? 'Tất cả sản phẩm tồn kho' :
                        'Sản phẩm sắp hết hàng'
                  }</h4>
                  <div className="stat-product-list">
                    {expandedStat === 'revenue' ? (
                      (() => {
                        const todayStr = new Date().toISOString().split('T')[0];
                        const tOrders = orders.filter(o => o.date === todayStr);
                        const sold = {};
                        tOrders.forEach(o => o.items.forEach(i => {
                          if (!sold[i.productId]) sold[i.productId] = { qty: 0, rev: 0 };
                          sold[i.productId].qty += i.quantity;
                          sold[i.productId].rev += i.price * i.quantity;
                        }));
                        const soldArray = Object.keys(sold).map(pid => {
                          const p = products.find(prod => prod.id === pid);
                          return p ? { ...p, qtySold: sold[pid].qty, rev: sold[pid].rev } : null;
                        }).filter(Boolean);

                        if (soldArray.length === 0) return <p className="text-muted" style={{ textAlign: 'center', padding: '1rem' }}>Chưa có sản phẩm nào bán ra hôm nay.</p>;

                        return soldArray.map(p => (
                          <div key={p.id} className="stat-product-item">
                            <img src={p.image} alt="" />
                            <div className="stat-p-info">
                              <span className="stat-p-name">{p.name}</span>
                              <span className="stat-p-cat">Đã bán: {p.qtySold} cái</span>
                            </div>
                            <span className="stat-p-qty" style={{ color: 'var(--primary)' }}>{p.rev.toLocaleString()}đ</span>
                          </div>
                        ));
                      })()
                    ) : (
                      (expandedStat === 'stock' ? products : products.filter(p => p.stock < 5)).map(p => (
                        <div key={p.id} className="stat-product-item">
                          <img src={p.image} alt="" />
                          <div className="stat-p-info">
                            <span className="stat-p-name">{p.name}</span>
                            <span className="stat-p-cat">{p.category}</span>
                          </div>
                          <span className={`stat-p-qty ${p.stock < 5 ? 'low' : ''}`}>{p.stock} sp</span>
                        </div>
                      ))
                    )}
                    {expandedStat === 'lowStock' && products.filter(p => p.stock < 5).length === 0 && (
                      <p className="text-muted" style={{ textAlign: 'center', padding: '1rem' }}>Không có sản phẩm nào sắp hết!</p>
                    )}
                  </div>
                </motion.section>
              )}

              <section className="quick-actions">
                <h3>Thao tác nhanh</h3>
                <div className="action-buttons">
                  <button onClick={() => setActiveTab('pos')} className="btn-action glass-effect">
                    <PlusCircle className="text-primary" />
                    <span>Bán hàng</span>
                  </button>
                  <button onClick={() => setActiveTab('products')} className="btn-action glass-effect">
                    <Package className="text-secondary" />
                    <span>Nhập hàng</span>
                  </button>
                </div>
              </section>

              <section className="ai-advisor">
                <div className="section-header">
                  <div className="ai-title">
                    <CheckCircle2 className="text-secondary" size={20} />
                    <h3 className="text-primary-gradient">AI Tư vấn chiến lược</h3>
                  </div>
                  <span className="ai-badge">SMART</span>
                </div>
                <div className="ai-cards">
                  {aiInsights.map((insight, idx) => (
                    <div
                      key={idx}
                      className={`ai-card glass-effect border-${insight.priority} ${expandedInsight === idx ? 'expanded' : ''}`}
                      onClick={() => setExpandedInsight(expandedInsight === idx ? null : idx)}
                    >
                      <div className="ai-card-header">
                        <div className="ai-card-content">
                          <h4>{insight.title}</h4>
                          <p>{insight.desc}</p>
                        </div>
                        <ChevronRight size={16} className={`ai-chevron ${expandedInsight === idx ? 'rotated' : ''}`} />
                      </div>
                      {expandedInsight === idx && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          className="ai-reason"
                        >
                          <p>{insight.reason}</p>
                        </motion.div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="recent-orders">
                <div className="section-header">
                  <h3>Đơn hàng gần đây</h3>
                  <button onClick={() => setActiveTab('orders')} className="btn-view-all">Xem tất cả</button>
                </div>
                <div className="order-list">
                  {orders.slice(0, 3).map(order => (
                    <div key={order.id} className="order-item glass-effect">
                      <div className="order-main">
                        <span className="order-id">HD-{order.id.slice(-6).toUpperCase()}</span>
                        <span className="order-date">{order.date}</span>
                      </div>
                      <span className="order-total">{order.total.toLocaleString()}đ</span>
                      <ChevronRight size={18} className="text-muted" />
                    </div>
                  ))}
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'pos' && (
            <motion.div
              key="pos"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="page pos-page"
            >
              <div className="pos-search">
                <div className="search-bar">
                  <Search size={18} className="text-muted search-icon" />
                  <input
                    placeholder="Tìm tên sản phẩm..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="category-scroll">
                {CATEGORIES.map(cat => {
                  const Icon = cat === 'Tất cả' ? Filter :
                    cat === 'Nón Nam' ? User :
                      cat === 'Nón Nữ' ? Heart :
                        cat === 'Túi xách' ? ShoppingBag :
                          cat === 'Khăn quàng' ? Wind :
                            cat === 'Phụ kiện' ? Layers : Package;
                  return (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      key={cat}
                      className={`cat-pill ${selectedCategory === cat ? 'active' : ''}`}
                      onClick={() => setSelectedCategory(cat)}
                    >
                      <Icon size={16} />
                      {cat}
                    </motion.button>
                  );
                })}
              </div>

              <div className="product-grid">
                {filteredProducts.map(product => (
                  <div key={product.id} className="product-card glass-effect" onClick={() => setZoomedProduct(product)}>
                    <div className="product-image">
                      <img src={product.image} alt={product.name} />
                      {product.stock <= 0 && <div className="out-of-stock">Hết hàng</div>}
                    </div>
                    <div className="product-details">
                      <div className="p-header">
                        <span className="p-cat">{product.category}</span>
                        {userRole === 'manager' && (
                          <span className={`p-stock ${product.stock < 5 ? 'low' : ''}`}>
                            <Package size={12} /> {product.stock}
                          </span>
                        )}
                      </div>
                      <h4 className="p-name">{product.name}</h4>
                      <div className="p-footer">
                        <span className="p-price">{product.price.toLocaleString()}đ</span>
                        <div className="p-add-icon" onClick={(e) => { e.stopPropagation(); addToCart(product); }}>
                          <Plus size={16} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Contact Info Card */}
              <div className="contact-info-card glass-effect">
                <h3><Phone size={20} /> Thông tin liên hệ Shop</h3>
                <div className="contact-details">
                  <div className="contact-item">
                    <MapPin size={18} className="text-primary" />
                    <span>Ô 93, chợ Long Khánh, Đồng Nai.</span>
                  </div>
                  <div className="contact-item">
                    <MessageCircle size={18} className="text-secondary" />
                    <span>SĐT/Zalo: 0342.035.370</span>
                  </div>
                </div>
              </div>

              {/* Cart Drawer Toggle */}
              {cart.length > 0 && (
                <motion.div
                  initial={{ y: 100 }}
                  animate={{ y: 0 }}
                  className="cart-summary-bar glass-effect"
                  onClick={() => setShowCart(true)}
                >
                  <div className="cart-info">
                    <span className="cart-count">{cart.reduce((s, i) => s + i.quantity, 0)} món</span>
                    <span className="cart-total">{cart.reduce((s, i) => s + (i.price * i.quantity), 0).toLocaleString()}đ</span>
                  </div>
                  <button className="btn-checkout-small">Xem giỏ</button>
                </motion.div>
              )}

              {/* Cart Drawer */}
              <AnimatePresence>
                {showCart && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="modal-overlay"
                      style={{ zIndex: 2040 }}
                      onClick={() => setShowCart(false)}
                    />
                    <motion.div
                      initial={{ y: '100%' }}
                      animate={{ y: 0 }}
                      exit={{ y: '100%' }}
                      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                      className="cart-drawer glass-effect"
                    >
                      <div className="drawer-header">
                        <h3>Giỏ hàng</h3>
                        <button onClick={() => setShowCart(false)} className="btn-close">×</button>
                      </div>
                      <div className="drawer-content">
                        {cart.map(item => (
                          <div key={item.id} className="cart-item">
                            <img src={item.image} alt="" />
                            <div className="item-info">
                              <h4>{item.name}</h4>
                              <span>{item.price.toLocaleString()}đ</span>
                            </div>
                            <div className="item-qty">
                              <button className="qty-btn" onClick={() => updateCartQuantity(item.id, -1)}>
                                <MinusCircle size={18} />
                              </button>
                              <span className="qty-num">{item.quantity}</span>
                              <button className="qty-btn" onClick={() => updateCartQuantity(item.id, 1)}>
                                <PlusCircle size={18} />
                              </button>
                            </div>
                            <button className="btn-remove" onClick={() => removeFromCart(item.id)}>
                              <Trash2 size={18} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="drawer-footer">
                        <div className="total-row">
                          <span>Tổng cộng</span>
                          <span className="total-price">{cart.reduce((s, i) => s + (i.price * i.quantity), 0).toLocaleString()}đ</span>
                        </div>
                        <button className="btn-checkout-full" onClick={handleCheckout}>
                          XÁC NHẬN THANH TOÁN
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activeTab === 'products' && userRole === 'manager' && (
            <motion.div
              key="products"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="page"
            >
              <div className="page-header">
                <h2>Kho hàng</h2>
                <button className="btn-add" onClick={() => setIsAddingProduct(true)}><Plus size={20} /> Thêm</button>
              </div>

              {/* Add Product Form Overlay */}
              <AnimatePresence>
                {isAddingProduct && (
                  <div className="modal-overlay" style={{ zIndex: 1100 }}>
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="add-product-form glass-effect"
                    >
                      <div className="page-header">
                        <h3>{editingProduct ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm mới'}</h3>
                      </div>
                      <div className="form-group">
                        <label>Hình ảnh sản phẩm</label>
                        <div className="camera-upload-zone" onClick={() => !isProcessingImage && document.getElementById('camera-input').click()}>
                          {isProcessingImage ? (
                            <div className="upload-placeholder" style={{ flexDirection: 'column', gap: '12px' }}>
                              <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                                style={{ width: 40, height: 40, border: '3px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%' }}
                              />
                              <span style={{ color: 'var(--primary)', fontWeight: 700 }}>Đang xử lý ảnh...</span>
                            </div>
                          ) : newProduct.image ? (
                            <img src={newProduct.image} alt="Preview" className="preview-img" />
                          ) : (
                            <div className="upload-placeholder">
                              <ShoppingBag size={32} className="text-muted" />
                              <span>Chụp ảnh mẫu mới</span>
                            </div>
                          )}
                          <input
                            id="camera-input"
                            type="file"
                            accept="image/*"
                            capture="environment"
                            hidden
                            onChange={handleImageCapture}
                          />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Tên sản phẩm</label>
                        <input
                          type="text"
                          placeholder="VD: Nón Snapback..."
                          value={newProduct.name}
                          onChange={(e) => setNewProduct(prev => ({ ...prev, name: e.target.value }))}
                        />
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Giá bán (đ)</label>
                          <input
                            type="number"
                            value={newProduct.price}
                            onChange={(e) => setNewProduct(prev => ({ ...prev, price: e.target.value }))}
                          />
                        </div>
                        <div className="form-group">
                          <label>Tồn kho</label>
                          <input
                            type="number"
                            value={newProduct.stock}
                            onChange={(e) => setNewProduct(prev => ({ ...prev, stock: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Danh mục</label>
                        <select
                          value={newProduct.category}
                          onChange={(e) => setNewProduct(prev => ({ ...prev, category: e.target.value }))}
                        >
                          {CATEGORIES.filter(c => c !== 'Tất cả').map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="form-actions">
                        <button className="btn-cancel" onClick={() => {
                          setIsAddingProduct(false);
                          setEditingProduct(null);
                          setNewProduct({ name: '', price: '', stock: '', category: 'Nón Nam', image: null });
                        }}>Hủy</button>
                        <button className="btn-submit" onClick={handleSaveProduct}>{editingProduct ? 'Cập nhật' : 'Lưu hệ thống'}</button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
              <div className="inventory-list">
                {products.map(p => (
                  <div key={p.id} className="inventory-item glass-effect">
                    <img src={p.image} alt="" className="inv-img" />
                    <div className="inv-info">
                      <h4>{p.name}</h4>
                      <span className="text-muted">{p.category}</span>
                      <div className="inv-meta">
                        <span>Giá: {p.price.toLocaleString()}đ</span>
                        <span className={p.stock < 5 ? 'text-accent' : ''}>Tồn: {p.stock}</span>
                      </div>
                    </div>
                    <div className="inv-actions">
                      <button className="btn-icon text-secondary" onClick={() => startEditProduct(p)}><Edit3 size={18} /></button>
                      <button className="btn-icon text-accent" onClick={() => deleteProduct(p.id)}><Trash2 size={18} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'orders' && userRole === 'manager' && (
            <motion.div
              key="orders"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="page"
            >
              <div className="page-header">
                <h2>Lịch sử bán</h2>
              </div>
              <div className="orders-timeline">
                {orders.map(order => (
                  <div key={order.id} className="order-detailed-card glass-effect">
                    <div className="od-header">
                      <span className="od-id">HD-{order.id.slice(-6).toUpperCase()}</span>
                      <div style={{ textAlign: 'right' }}>
                        <span className="od-date">{order.date}</span>
                        {order.createdAt?.toDate && (
                          <span className="od-time" style={{ display: 'block', fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600 }}>
                            {order.createdAt.toDate().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="od-items">
                      {order.items.map((item, idx) => {
                        const p = products.find(prod => prod.id === item.productId);
                        return (
                          <div key={idx} className="od-item">
                            <span>{p?.name} x{item.quantity}</span>
                            <span>{(item.price * item.quantity).toLocaleString()}đ</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="od-footer">
                      <span>Tổng cộng:</span>
                      <span className="od-total">{order.total.toLocaleString()}đ</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'tryon' && (
            <motion.div
              key="tryon"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="page tryon-page"
            >
              <div className="page-header">
                <h2>Thử đồ ảo AI</h2>
              </div>

              {!tryOnImage ? (
                <div className="tryon-setup glass-effect" onClick={() => document.getElementById('tryon-input').click()}>
                  <User size={64} className="text-muted" />
                  <h3>Chụp ảnh khách hàng</h3>
                  <p>Hoặc tải ảnh chân dung lên</p>
                  <input id="tryon-input" type="file" accept="image/*" onChange={handleTryOnCapture} hidden />
                </div>
              ) : (
                <div className="tryon-preview-container">
                  <div className="tryon-canvas glass-effect">
                    <img src={tryOnImage} alt="Customer" className="customer-photo" />

                    {isScanning && (
                      <motion.div
                        initial={{ top: 0 }}
                        animate={{ top: '100%' }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                        className="scan-line"
                      />
                    )}

                    {selectedTryOnProduct && (
                      <motion.img
                        drag
                        dragMomentum={false}
                        src={selectedTryOnProduct.processedImage || selectedTryOnProduct.image}
                        className={`tryon-product-overlay ${autoAligned ? 'aligned' : ''}`}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{
                          scale: tryOnScale,
                          top: autoAligned ? tryOnPos.top : '10%',
                          left: autoAligned ? tryOnPos.left : '25%',
                          width: tryOnPos.width,
                          opacity: 1,
                          rotateY: isFlipped ? 180 : 0
                        }}
                        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      />
                    )}
                  </div>

                  <div className="tryon-ai-status">
                    {isScanning ? (
                      <span className="text-primary pulse">AI đang phân tích và ghép ảnh...</span>
                    ) : (
                      <div className="tryon-actions fade-in">
                        {selectedTryOnProduct && (
                          <>
                            <button className="btn-export-tryon" onClick={exportTryOnImage}>
                              <CheckCircle2 size={20} />
                              Lưu ảnh thành phẩm
                            </button>
                            <button className="btn-buy-tryon" onClick={() => { addToCart(selectedTryOnProduct); alert('Đã thêm vào giỏ hàng!'); }}>
                              <ShoppingBag size={20} />
                              Mua ngay {selectedTryOnProduct.name}
                            </button>
                          </>
                        )}
                        <div className="tryon-sub-actions">
                          <button className="btn-reset-tryon" onClick={() => { setTryOnImage(null); setSelectedTryOnProduct(null); setIsFlipped(false); }}>Chụp ảnh khác</button>
                          {selectedTryOnProduct && (
                            <div className="scale-tools">
                              <button onClick={() => setIsFlipped(!isFlipped)} className={isFlipped ? 'active' : ''}>Lật</button>
                              <button onClick={() => setTryOnScale(s => s + 0.05)}>+</button>
                              <button onClick={() => setTryOnScale(s => Math.max(0.1, s - 0.05))}>-</button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="tryon-product-label">
                    <span>Chọn mẫu để thử:</span>
                  </div>
                  <div className="tryon-product-list">
                    {products.map(p => (
                      <div
                        key={p.id}
                        className={`tryon-p-card ${selectedTryOnProduct?.id === p.id ? 'active' : ''}`}
                        onClick={() => handleAutoAlign(p)}
                      >
                        <img src={p.image} alt="" className="ai-processed-thumb" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Bottom Navigation */}
      <nav className="bottom-nav">
        {userRole === 'manager' && (
          <button
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={22} />
            <span>Tổng quan</span>
          </button>
        )}
        <button
          className={`nav-item ${activeTab === 'pos' ? 'active' : ''}`}
          onClick={() => setActiveTab('pos')}
        >
          <ShoppingBag size={22} />
          <span>{userRole === 'manager' ? 'Bán hàng' : 'Sản phẩm'}</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'tryon' ? 'active' : ''}`}
          onClick={() => setActiveTab('tryon')}
        >
          <User size={22} />
          <span>Thử đồ</span>
        </button>
        {userRole === 'manager' && (
          <>
            <button
              className={`nav-item ${activeTab === 'products' ? 'active' : ''}`}
              onClick={() => setActiveTab('products')}
            >
              <Package size={22} />
              <span>Kho hàng</span>
            </button>
            <button
              className={`nav-item ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => setActiveTab('orders')}
            >
              <History size={22} />
              <span>Lịch sử</span>
            </button>
          </>
        )}
      </nav>

      <style>{`
        .app-container {
          width: 100%;
          min-height: 100vh;
          background: var(--bg-dark);
          padding-bottom: 90px;
          display: flex;
          flex-direction: column;
        }

        @media (min-width: 600px) {
          .app-container {
            max-width: 450px;
            margin: 0 auto;
            border-left: 1px solid var(--border);
            border-right: 1px solid var(--border);
          }
        }

        .main-header {
          position: sticky;
          top: 0;
          z-index: 100;
          padding: 1rem;
          border-bottom: 1px solid var(--border);
        }

        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .btn-login-manager {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
          padding: 0.5rem 1rem;
          border-radius: 9999px;
          font-weight: 800;
          font-size: 0.85rem;
          border: 1px solid rgba(245, 158, 11, 0.3);
          transition: all 0.2s;
          cursor: pointer;
        }
        .btn-login-manager:active { transform: scale(0.95); }

        .btn-logout-manager {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(236, 72, 153, 0.15);
          color: #ec4899;
          padding: 0.5rem 1rem;
          border-radius: 9999px;
          font-weight: 800;
          font-size: 0.85rem;
          border: 1px solid rgba(236, 72, 153, 0.3);
          transition: all 0.2s;
          cursor: pointer;
        }
        .btn-logout-manager:active { transform: scale(0.95); }

        .pin-modal {
          width: 100%;
          max-width: 320px;
          padding: 2rem;
          border-radius: var(--radius-lg);
          text-align: center;
          position: relative;
        }

        .pin-modal h3 { margin-bottom: 0.5rem; }
        .pin-modal p { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem; }
        .pin-input {
          text-align: center;
          font-size: 2rem;
          letter-spacing: 1rem;
          margin-bottom: 1.5rem;
          background: rgba(0,0,0,0.2);
        }

        .hint { margin-top: 1rem; font-size: 0.75rem !important; opacity: 0.5; }

        /* Payment Modal */
        .payment-modal {
          width: 100%;
          max-width: 380px;
          padding: 1.5rem;
          border-radius: var(--radius-lg);
          position: relative;
        }
        .total-label { font-size: 1.25rem; font-weight: 700; color: var(--primary); margin-bottom: 1.5rem; text-align: center; }
        
        .payment-options { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; }
        .pay-opt {
          padding: 1rem;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          color: var(--text-muted);
        }
        .pay-opt.active {
          border-color: var(--primary);
          background: rgba(245, 158, 11, 0.1);
          color: var(--primary);
        }

        .qr-container {
          text-align: center;
          margin-bottom: 1.5rem;
          padding: 1rem;
          background: white;
          border-radius: var(--radius-md);
        }
        .qr-img { width: 100%; max-width: 200px; height: auto; }
        .qr-hint { color: #666; font-size: 0.75rem; margin-top: 0.5rem; }

        /* AI Advisor */
        .ai-advisor {
          margin-top: 0.5rem;
        }
        .ai-title { display: flex; align-items: center; gap: 0.5rem; }
        .ai-badge { background: var(--primary); color: white; font-size: 0.65rem; padding: 0.2rem 0.5rem; border-radius: var(--radius-full); font-weight: 700; }
        
        .ai-cards { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.75rem; }
        .ai-card { 
          padding: 1rem; 
          border-radius: var(--radius-md); 
          display: flex; 
          flex-direction: column;
          gap: 0.5rem;
          border-left: 4px solid var(--border);
          cursor: pointer;
          transition: background 0.2s;
        }
        .ai-card:active { background: rgba(255,255,255,0.05); }
        .ai-card.expanded { background: rgba(255,255,255,0.03); }
        .ai-card.border-high { border-left-color: var(--accent); }
        .ai-card.border-medium { border-left-color: var(--primary); }
        
        .ai-card-header { display: flex; align-items: center; gap: 1rem; }
        .ai-card-content { flex: 1; }
        .ai-card-content h4 { font-size: 0.95rem; color: var(--text-main); margin-bottom: 0.25rem; }
        .ai-card-content p { font-size: 0.8rem; color: var(--text-muted); line-height: 1.3; }
        
        .ai-chevron { color: var(--text-muted); transition: transform 0.3s; flex-shrink: 0; }
        .ai-chevron.rotated { transform: rotate(90deg); color: var(--primary); }
        
        .ai-reason {
          padding: 0.75rem;
          background: rgba(245, 158, 11, 0.08);
          border-radius: var(--radius-sm);
          border: 1px solid rgba(245, 158, 11, 0.15);
          overflow: hidden;
        }
        .ai-reason p { font-size: 0.85rem; color: var(--text-main); line-height: 1.5; }

        /* Try-on */
        .tryon-setup {
          height: 300px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          border-radius: var(--radius-lg);
          border: 2px dashed var(--border);
        }

        .tryon-canvas {
          width: 100%;
          aspect-ratio: 3/4;
          position: relative;
          overflow: hidden;
          border-radius: var(--radius-lg);
          background: #000;
        }
        .customer-photo { width: 100%; height: 100%; object-fit: cover; opacity: 0.8; }
        
        .scan-line {
          position: absolute;
          left: 0;
          right: 0;
          height: 2px;
          background: var(--primary);
          box-shadow: 0 0 15px var(--primary);
          z-index: 5;
        }

        .tryon-product-overlay {
          position: absolute;
          z-index: 10;
          touch-action: none;
          filter: drop-shadow(0 8px 25px rgba(0,0,0,0.5)) brightness(1.05) contrast(1.1);
        }

        .tryon-product-overlay.aligned {
          /* AI Adjusted Shadow & Lighting */
          animation: ai-light-sync 2s infinite alternate;
        }

        @keyframes ai-light-sync {
          from { filter: drop-shadow(0 8px 25px rgba(0,0,0,0.4)) brightness(1); }
          to { filter: drop-shadow(0 12px 30px rgba(0,0,0,0.6)) brightness(1.1); }
        }

        .tryon-ai-status {
          margin: 1.5rem 0;
          text-align: center;
        }

        .tryon-actions { display: flex; flex-direction: column; gap: 0.75rem; }
        .btn-export-tryon {
          background: linear-gradient(135deg, #10B981, #059669);
          color: white;
          padding: 1rem;
          border-radius: var(--radius-md);
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
        }
        .btn-buy-tryon {
          background: var(--primary);
          color: white;
          padding: 0.85rem;
          border-radius: var(--radius-md);
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .tryon-product-label {
          margin-top: 0.5rem;
          font-size: 0.85rem;
          color: var(--text-muted);
        }

        .tryon-sub-actions { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
        .btn-reset-tryon { color: var(--text-muted); font-size: 0.85rem; text-decoration: underline; background: none; }
        
        .scale-tools { display: flex; gap: 0.5rem; background: var(--bg-card); padding: 0.25rem; border-radius: var(--radius-sm); border: 1px solid var(--border); }
        .scale-tools button { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; color: var(--text-main); font-weight: 700; }

        /* Contact Card Styles */
        .contact-info-card {
          margin-top: 1.5rem;
          padding: 1.5rem;
          border-radius: var(--radius-lg);
          border: 1px solid var(--border);
        }
        .contact-info-card h3 { 
          display: flex; 
          align-items: center; 
          gap: 0.5rem; 
          margin-bottom: 1rem; 
          font-size: 1.1rem;
          color: var(--primary);
        }
        .contact-details { display: flex; flex-direction: column; gap: 0.75rem; }
        .contact-item { display: flex; align-items: center; gap: 0.75rem; font-size: 0.95rem; }

        .shop-footer {
          margin-top: 2rem;
          padding: 1.5rem;
          text-align: center;
          border-radius: var(--radius-md) var(--radius-md) 0 0;
          border-bottom: none;
        }
        .footer-content p { margin-bottom: 0.25rem; font-size: 0.85rem; color: var(--text-muted); }

        .pulse { animation: pulse 1.5s infinite; }
        @keyframes pulse {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }

        .tryon-controls {
          margin-top: 1rem;
          padding: 1rem;
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .control-row { display: flex; align-items: center; justify-content: space-between; }
        .btn-reset { background: var(--bg-card); color: var(--text-muted); padding: 0.5rem; border-radius: var(--radius-sm); font-size: 0.8rem; }

        .tryon-product-list {
          display: flex;
          gap: 0.75rem;
          overflow-x: auto;
          padding: 1rem 0;
          scrollbar-width: none;
        }
        .tryon-p-card {
          min-width: 70px;
          height: 70px;
          border-radius: var(--radius-md);
          overflow: hidden;
          background: var(--bg-card);
          border: 2px solid transparent;
        }
        .tryon-p-card.active { border-color: var(--primary); }
        .tryon-p-card img { width: 100%; height: 100%; object-fit: cover; }

        .role-selector {
          background: var(--bg-card);
          border: 1px solid var(--border);
          color: var(--text-main);
          padding: 0.4rem 0.6rem;
          border-radius: var(--radius-sm);
          font-size: 0.8rem;
          width: auto;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 1rem;
          cursor: pointer;
          transition: transform 0.2s ease;
        }
        .logo:hover {
          transform: scale(1.02);
        }
        .logo-icon-wrapper {
          width: 44px;
          height: 44px;
          background: white;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 15px rgba(245, 158, 11, 0.4);
          position: relative;
          overflow: hidden;
          padding: 2px;
        }
        .logo-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .logo-icon-wrapper::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(45deg, transparent, rgba(255,255,255,0.2), transparent);
          transform: translateX(-100%);
          transition: transform 0.5s ease;
        }
        .logo:hover .logo-icon-wrapper::after {
          transform: translateX(100%);
        }
        .logo-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .logo-name {
          font-size: 1.5rem;
          font-weight: 900;
          line-height: 1;
          background: linear-gradient(to right, #fff, var(--primary));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: -0.03em;
          text-shadow: 0 10px 20px rgba(0,0,0,0.2);
        }
        .logo-tagline {
          font-size: 0.6rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.25em;
          font-weight: 700;
        }

        .main-content {
          padding: 1rem;
          flex: 1;
        }

        .page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        /* Stats */
        .stats-grid {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          width: 100%;
        }

        .stat-card {
          width: 100%;
          padding: 1.25rem;
          border-radius: 1.25rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          background: rgba(30, 41, 59, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          transition: transform 0.2s ease;
        }
        .stat-card:active { transform: scale(0.98); }

        .stat-icon {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .stat-icon.revenue { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
        .stat-icon.stock { background: rgba(52, 211, 153, 0.15); color: #34d399; }
        .stat-icon.alert { background: rgba(236, 72, 153, 0.15); color: #ec4899; }

        .stat-info { display: flex; flex-direction: column; flex: 1; }
        .stat-info .label { font-size: 0.8rem; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
        .stat-info .value { font-size: 1.3rem; font-weight: 900; display: block; color: #fff; }

        .stat-card.clickable { cursor: pointer; transition: border 0.2s, transform 0.1s; }
        .stat-card.clickable:active { transform: scale(0.97); }
        .stat-card.clickable.active { border: 1px solid var(--primary); }

        .stat-detail-list {
          margin-top: 0.75rem;
          padding: 1rem;
          border-radius: var(--radius-lg);
          border: 1px solid var(--border);
        }
        .stat-detail-list h4 { font-size: 0.95rem; margin-bottom: 0.75rem; color: var(--primary); }
        .stat-product-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .stat-product-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem;
          background: rgba(255,255,255,0.03);
          border-radius: var(--radius-sm);
        }
        .stat-product-item img { width: 40px; height: 40px; border-radius: var(--radius-sm); object-fit: cover; }
        .stat-p-info { flex: 1; }
        .stat-p-name { display: block; font-size: 0.85rem; font-weight: 600; }
        .stat-p-cat { font-size: 0.75rem; color: var(--text-muted); }
        .stat-p-qty { font-weight: 700; font-size: 0.9rem; white-space: nowrap; }
        .stat-p-qty.low { color: var(--accent); }

        /* Quick Actions */
        .action-buttons {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-top: 1rem;
        }

        .btn-action {
          padding: 1.5rem;
          border-radius: 1.25rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          font-weight: 800;
          font-size: 0.9rem;
          color: #fff;
          background: rgba(30, 41, 59, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          transition: transform 0.2s ease;
          cursor: pointer;
        }
        .btn-action:active { transform: scale(0.97); }

        /* POS Page */
        .pos-search {
          margin-bottom: 0.5rem;
        }
        .pos-search .search-bar {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.4rem 1.5rem;
          border-radius: 9999px;
          background: rgba(30, 41, 59, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .pos-search .search-bar:focus-within {
          border-color: #f59e0b;
          background: rgba(30, 41, 59, 0.95);
          box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.15), 0 4px 20px rgba(0,0,0,0.3);
          transform: translateY(-2px);
        }
        .pos-search .search-bar:focus-within .search-icon {
          color: #f59e0b;
        }
        .pos-search input {
          background: none;
          border: none;
          padding: 0.85rem 0;
          box-shadow: none;
          color: #fff;
          font-family: inherit;
          font-size: 0.95rem;
          width: 100%;
        }
        .pos-search input::placeholder {
          color: #64748b;
          font-weight: 500;
        }
        .pos-search input:focus {
          outline: none;
        }

        .category-scroll {
          display: flex;
          gap: 0.75rem;
          overflow-x: auto;
          padding: 0.5rem 0.25rem 1.25rem 0.25rem;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .category-scroll::-webkit-scrollbar { display: none; }

        .cat-pill {
          position: relative;
          white-space: nowrap;
          padding: 0.6rem 1.5rem;
          border-radius: var(--radius-full);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-muted);
          font-weight: 600;
          font-size: 0.875rem;
          border: 1px solid var(--border);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .cat-pill:hover {
          background: rgba(255, 255, 255, 0.08);
          color: var(--text-main);
          border-color: rgba(255, 255, 255, 0.2);
          transform: translateY(-2px);
        }

        .cat-pill.active {
          background: #f59e0b;
          color: white;
          border-color: rgba(255, 255, 255, 0.6);
          box-shadow: 0 4px 15px rgba(245, 158, 11, 0.4);
          transform: translateY(-2px);
        }

        .cat-pill.active::after {
          content: "";
          position: absolute;
          bottom: -8px;
          left: 50%;
          transform: translateX(-50%);
          width: 4px;
          height: 4px;
          background: var(--primary);
          border-radius: 50%;
          box-shadow: 0 0 10px var(--primary);
        }

        .product-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
          width: 100%;
        }

        .product-card {
          width: 100%;
          border-radius: var(--radius-lg);
          overflow: hidden;
          position: relative;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid var(--border);
          display: flex;
          flex-direction: column;
        }

        .product-card:hover {
          transform: translateY(-5px);
          border-color: rgba(245, 158, 11, 0.4);
          box-shadow: 0 12px 24px rgba(0,0,0,0.4);
        }

        .product-image {
          height: 140px;
          position: relative;
          overflow: hidden;
        }
        .product-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          background-color: rgba(255, 255, 255, 0.02);
          transition: transform 0.5s ease;
        }
        .product-card:hover .product-image img {
          transform: scale(1.05);
        }
        .out-of-stock {
          position: absolute;
          inset: 0;
          background: rgba(15, 23, 42, 0.8);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          color: white;
          z-index: 10;
          font-size: 0.9rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .product-details {
          padding: 1rem;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .p-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .p-cat { 
          font-size: 0.65rem; 
          color: var(--text-muted); 
          text-transform: uppercase; 
          font-weight: 700;
          letter-spacing: 0.05em;
        }

        .p-name { 
          font-size: 0.95rem; 
          margin: 0; 
          height: 2.6rem; 
          overflow: hidden; 
          display: -webkit-box; 
          -webkit-line-clamp: 2; 
          -webkit-box-orient: vertical; 
          line-height: 1.3;
          font-weight: 600;
        }

        .p-footer { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          margin-top: auto;
          padding-top: 0.5rem;
        }

        .p-price { 
          font-weight: 800; 
          color: #f59e0b; 
          font-size: 1.1rem; 
          letter-spacing: -0.01em;
        }

        .p-stock { 
          font-size: 0.7rem; 
          color: var(--text-muted); 
          background: rgba(255, 255, 255, 0.05);
          padding: 0.25rem 0.5rem;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-weight: 600;
        }
        .p-stock.low { 
          background: rgba(236, 72, 153, 0.1);
          color: var(--accent); 
        }

        .p-add-icon {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #f59e0b;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
        }
        .product-card:hover .p-add-icon {
          background: var(--primary);
          color: white;
          transform: rotate(90deg);
        }

        .cart-summary-bar {
          position: fixed;
          bottom: 90px;
          left: 1rem;
          right: 1rem;
          padding: 0.75rem 1.25rem;
          border-radius: var(--radius-full);
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
          z-index: 50;
          cursor: pointer;
        }

        .cart-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .cart-count {
          font-size: 0.85rem;
          color: var(--text-muted);
          background: rgba(255, 255, 255, 0.1);
          padding: 0.2rem 0.6rem;
          border-radius: var(--radius-full);
          white-space: nowrap;
        }

        .cart-total {
          font-weight: 700;
          font-size: 1.1rem;
          color: white;
          white-space: nowrap;
        }

        .btn-checkout-small {
          background: var(--primary);
          color: white;
          padding: 0.5rem 1.25rem;
          border-radius: var(--radius-full);
          font-weight: 700;
          font-size: 0.9rem;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.8);
          backdrop-filter: blur(8px);
          z-index: 2040;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }

        .cart-drawer {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 80vh;
          border-radius: 2rem 2rem 0 0;
          z-index: 2050;
          display: flex;
          flex-direction: column;
          padding: 1.5rem;
        }

        .drawer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        .btn-close { background: none; font-size: 2rem; color: var(--text-muted); }

        .drawer-content {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .cart-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem;
          background: rgba(255,255,255,0.05);
          border-radius: var(--radius-md);
        }
        .cart-item img { width: 50px; height: 50px; border-radius: var(--radius-sm); object-fit: cover; }
        .item-info { flex: 1; }
        
        .item-qty { 
          display: flex; 
          align-items: center; 
          gap: 0.5rem; 
          background: rgba(255, 255, 255, 0.05);
          padding: 0.25rem 0.4rem;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .qty-btn {
          background: none;
          color: var(--text-muted);
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          padding: 0.2rem;
        }
        .qty-btn:hover { color: #fff; transform: scale(1.1); }
        .qty-btn:active { transform: scale(0.9); }
        
        .qty-num {
          font-weight: 800;
          font-size: 0.95rem;
          min-width: 1.2rem;
          text-align: center;
          color: #fff;
        }

        .btn-remove { 
          background: rgba(236, 72, 153, 0.1); 
          color: var(--accent); 
          margin-left: 0.25rem; 
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(236, 72, 153, 0.2);
          transition: all 0.2s;
          cursor: pointer;
        }
        .btn-remove:hover {
          background: rgba(236, 72, 153, 0.2);
          transform: scale(1.05);
        }
        .btn-remove:active { transform: scale(0.95); }

        .drawer-footer {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border);
        }
        .total-row { display: flex; justify-content: space-between; font-size: 1.25rem; font-weight: 700; margin-bottom: 1.5rem; }
        .btn-checkout-full { width: 100%; background: var(--primary); color: white; padding: 1.25rem; border-radius: var(--radius-md); font-weight: 800; font-size: 1.1rem; }

        /* Add Product Form */
        .add-product-form {
          width: 100%;
          max-width: 380px;
          max-height: 85vh;
          overflow-y: auto;
          padding: 1.5rem;
          border-radius: var(--radius-lg);
          display: flex;
          flex-direction: column;
          gap: 1rem;
          position: relative;
        }

        .camera-upload-zone {
          width: 100%;
          height: 120px;
          border: 2px dashed var(--border);
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: rgba(255,255,255,0.02);
        }

        .upload-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          color: var(--text-muted);
        }

        .preview-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .form-group label { display: block; font-size: 0.85rem; font-weight: 700; color: #e2e8f0; margin-bottom: 0.5rem; }
        .form-group input, .form-group select {
          width: 100%;
          padding: 0.9rem 1rem;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: var(--radius-md);
          color: white;
          font-family: inherit;
          font-size: 0.95rem;
          transition: all 0.3s ease;
        }
        .form-group input:focus, .form-group select:focus {
          outline: none;
          border-color: var(--primary);
          background: rgba(15, 23, 42, 0.9);
          box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
        }
        .form-group select option { background: var(--bg-card); color: white; }
        
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .form-actions { display: flex; gap: 1rem; margin-top: 1.5rem; }
        .btn-cancel { flex: 1; background: rgba(255, 255, 255, 0.1); color: var(--text-main); padding: 0.85rem; border-radius: var(--radius-md); font-weight: 700; transition: all 0.2s; border: none; cursor: pointer; }
        .btn-cancel:active { transform: scale(0.96); }
        .btn-submit { flex: 1; background: var(--primary); color: #000; padding: 0.85rem; border-radius: var(--radius-md); font-weight: 800; transition: all 0.2s; border: none; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3); cursor: pointer; }
        .btn-submit:active { transform: scale(0.96); box-shadow: none; }

        /* Inventory */
        .inventory-item {
          display: flex;
          gap: 1rem;
          padding: 1rem;
          border-radius: var(--radius-md);
          margin-bottom: 0.75rem;
        }
        .inv-img { width: 60px; height: 60px; border-radius: var(--radius-sm); object-fit: cover; }
        .inv-info { flex: 1; }
        .inv-meta { display: flex; gap: 1rem; font-size: 0.85rem; margin-top: 0.25rem; }
        .inv-actions { display: flex; flex-direction: column; gap: 0.75rem; }
        .btn-icon { 
          background: rgba(255,255,255,0.05); 
          width: 36px; 
          height: 36px; 
          border-radius: var(--radius-sm); 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          color: var(--text-muted); 
          border: 1px solid var(--border);
        }
        .btn-icon.text-secondary { 
          color: var(--secondary); 
          border-color: rgba(16, 185, 129, 0.3);
          background: rgba(16, 185, 129, 0.1);
        }
        .btn-icon.text-accent { 
          color: var(--accent); 
          border-color: rgba(236, 72, 153, 0.3);
          background: rgba(236, 72, 153, 0.1);
        }
        .btn-icon:active { transform: scale(0.9); }

        /* Orders */
        .order-detailed-card {
          padding: 1rem;
          border-radius: var(--radius-md);
          margin-bottom: 1rem;
        }
        .od-header { display: flex; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 0.5rem; }
        .od-id { font-weight: 700; color: var(--primary); }
        .od-date { font-size: 0.85rem; color: var(--text-muted); }
        .od-items { font-size: 0.9rem; display: flex; flex-direction: column; gap: 0.25rem; }
        .od-item { display: flex; justify-content: space-between; }
        .od-footer { display: flex; justify-content: space-between; margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px dashed var(--border); font-weight: 700; }

        /* Bottom Nav */
        .bottom-nav {
          position: fixed;
          bottom: 1rem;
          left: 50%;
          transform: translateX(-50%);
          width: 85%;
          max-width: 360px;
          height: auto;
          display: flex;
          justify-content: space-around;
          align-items: center;
          padding: 0.5rem 0.5rem;
          border-radius: 9999px;
          background: rgba(15, 23, 42, 0.95);
          backdrop-filter: blur(30px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 15px 40px rgba(0,0,0,0.6);
          z-index: 2000;
        }

        .nav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          background: none;
          color: var(--text-muted);
          gap: 0.25rem;
          border: none;
          cursor: pointer;
        }
        .nav-item span { font-size: 0.65rem; font-weight: 800; }
        .nav-item.active { color: #f59e0b !important; filter: drop-shadow(0 0 6px rgba(245, 158, 11, 0.5)); }

        .text-primary { color: var(--primary); }
        .text-secondary { color: var(--secondary); }
        .text-accent { color: var(--accent); }
        .text-muted { color: var(--text-muted); }

        .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
        .btn-view-all {
          background: rgba(245, 158, 11, 0.1);
          color: #f59e0b;
          padding: 0.4rem 0.8rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 800;
          border: 1px solid rgba(245, 158, 11, 0.2);
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-view-all:active { transform: scale(0.95); }

        .page-header { display: flex; justify-content: space-between; align-items: center; }
        .btn-add { 
          background: var(--primary); 
          color: white; 
          padding: 0.6rem 1.25rem; 
          border-radius: var(--radius-md); 
          display: flex; 
          align-items: center; 
          gap: 0.5rem; 
          font-weight: 700;
          box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .btn-add:active { transform: translateY(2px); box-shadow: none; }
      `}</style>
    </div>
  );
}
