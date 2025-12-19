import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'firebase/auth';
// 分開匯入型別，避免 TypeScript 報錯
import type { User } from 'firebase/auth'; 

import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  onSnapshot, 
  orderBy, 
  doc, 
  serverTimestamp,
  where,
  runTransaction
} from 'firebase/firestore';
import { 
  ShoppingBag, 
  Package, 
  Clock, 
  Trash2, 
  Menu, 
  X,
  List,
  LogOut,
  User as UserIcon,
  LogIn,
  UserPlus,
  CheckCircle,
  AlertCircle,
  Info,
  Phone,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';

// --- 設定區 ---
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbzWLVF8ICXhskZimWBqlsSTOOFdo01sGcm5jMa3EGnDQGl2kclG4xRp0bd9YaScF6pCpw/exec";

// ⚠️ 使用您提供的 Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyA45rRqOyIgKeLXS8NPvp9CfYjpAOmuwIU",
  authDomain: "group-buy-app-f55a4.firebaseapp.com",
  projectId: "group-buy-app-f55a4",
  storageBucket: "group-buy-app-f55a4.firebasestorage.app",
  messagingSenderId: "66185441804",
  appId: "1:66185441804:web:c5435fedf8c0c55f82f429",
  measurementId: "G-5PJGE41TMK"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 2. 型別定義 ---
interface ProductVariant {
  id: string;
  name: string;
  price: number;
  stock: number;
  sold: number;
}

interface Product {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  variants: ProductVariant[];
}

interface GroupBuy {
  id: string;
  title: string;
  status: 'draft' | 'open' | 'success' | 'failed' | 'closed';
  thresholdType: 'quantity' | 'amount';
  thresholdValue: number;
  currentValue: number;
  startTime: any;
  endTime: any;
  products: Product[];
  description: string;
}

interface CartItem {
  groupBuyId: string;
  productId: string;
  variantId: string;
  name: string;
  variantName: string;
  price: number;
  quantity: number;
  maxStock: number;
  groupBuyTitle: string;
}

interface Order {
  id: string;
  userId: string;
  groupBuyTitle: string;
  items: CartItem[];
  totalAmount: number;
  status: string;
  shippingInfo: { name: string; phone: string };
  createdAt: any;
}

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

// --- 3. 輔助函式 ---
const formatCurrency = (amount: number) => 
  new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 }).format(amount);

// GAS: 同步會員
const syncUserToGoogleSheet = async (user: User, displayName: string, phone: string, emailOverride?: string) => {
  if (!GAS_API_URL || !GAS_API_URL.includes("script.google.com")) return;
  if (!user || !user.uid) return;
  try {
    await fetch(GAS_API_URL, {
      method: 'POST',
      mode: 'no-cors', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'register', uid: user.uid, name: displayName || user.email || '未命名', email: emailOverride || user.email || '', phone: phone || '', created_at: new Date().toISOString() })
    });
  } catch (error) { console.error("Sync failed:", error); }
};

// GAS: 同步訂單
const syncOrderToGoogleSheet = async (orderId: string, orderData: any) => {
  if (!GAS_API_URL) return;
  try {
    const itemsSummary = orderData.items.map((i: any) => ({ name: i.name, variant: i.variantName, quantity: i.quantity }));
    await fetch(GAS_API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'order', created_at: new Date().toISOString(), order_id: orderId, buyer_name: orderData.shippingInfo.name, buyer_phone: orderData.shippingInfo.phone, total_amount: orderData.totalAmount, status: '未出貨', items: itemsSummary })
    });
  } catch (err) { console.error("Order sync failed", err); }
};

// --- 4. UI 元件 ---
const Toast = ({ show, message, type, onClose }: ToastState & { onClose: () => void }) => {
  useEffect(() => { if (show) { const timer = setTimeout(onClose, 3000); return () => clearTimeout(timer); } }, [show, onClose]);
  if (!show) return null;
  const bgColors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500' };
  return (<div className={`fixed top-4 right-4 z-[70] flex items-center p-4 rounded-lg shadow-lg text-white ${bgColors[type]} transition-all animate-bounce-in`}><div className="font-medium">{message}</div><button onClick={onClose} className="ml-4 hover:bg-white/20 rounded-full p-1"><X className="w-4 h-4" /></button></div>);
};

// 保留此元件以供重複使用，但在此特定案例中，我們會使用客製化的訪客確認視窗
const ConfirmDialog = ({ isOpen, onClose, onConfirm, title, message, confirmText = "確認", cancelText = "取消", isProcessing = false }: any) => {
  if (!isOpen) return null;
  return (<div className="fixed inset-0 z-[60] flex items-center justify-center p-4"><div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose}></div><div className="bg-white rounded-xl shadow-2xl w-full max-w-sm relative z-10 p-6 animate-fade-in-up"><h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3><p className="text-gray-600 mb-6">{message}</p><div className="flex justify-end gap-3"><button onClick={onClose} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg" disabled={isProcessing}>{cancelText}</button><button onClick={onConfirm} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md disabled:opacity-50" disabled={isProcessing}>{isProcessing ? '處理中...' : confirmText}</button></div></div></div>);
};

const CountdownTimer = ({ targetDate }: { targetDate: any }) => {
  const [timeLeft, setTimeLeft] = useState<{days: number, hours: number, minutes: number, seconds: number} | null>(null);
  useEffect(() => {
    const calculate = () => {
      if (!targetDate) return null;
      const target = targetDate instanceof Date ? targetDate : (targetDate.toDate ? targetDate.toDate() : new Date(targetDate));
      const diff = +target - +new Date();
      if (diff > 0) return { days: Math.floor(diff / (1000 * 60 * 60 * 24)), hours: Math.floor((diff / (1000 * 60 * 60)) % 24), minutes: Math.floor((diff / 1000 / 60) % 60), seconds: Math.floor((diff / 1000) % 60) };
      return null;
    };
    const timer = setInterval(() => setTimeLeft(calculate()), 1000);
    setTimeLeft(calculate());
    return () => clearInterval(timer);
  }, [targetDate]);
  if (!timeLeft) return <span className="text-red-500 font-bold text-xs bg-red-50 px-2 py-1 rounded">已截止</span>;
  return (<div className="flex space-x-1 text-xs font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded"><Clock className="w-3 h-3 mt-0.5 mr-1" /><span>{timeLeft.days}天</span><span>{String(timeLeft.hours).padStart(2, '0')}時</span><span>{String(timeLeft.minutes).padStart(2, '0')}分</span><span>{String(timeLeft.seconds).padStart(2, '0')}秒</span></div>);
};

const AuthModal = ({ isOpen, onClose, initialMode = 'login', showToast }: { isOpen: boolean, onClose: () => void, initialMode?: 'login' | 'register', showToast: (type: 'success'|'error', msg: string) => void }) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState(''); 
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (isOpen) { setMode(initialMode); setError(''); setEmail(''); setPassword(''); setConfirmPassword(''); setDisplayName(''); setPhone(''); } }, [isOpen, initialMode]);
  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      if (mode === 'register') {
        if (password !== confirmPassword) throw new Error("兩次輸入的密碼不一致");
        if (password.length < 6) throw new Error("密碼長度至少需 6 個字元");
        if (!phone) throw new Error("請輸入電話號碼"); 
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        if (displayName) await updateProfile(user, { displayName });
        await syncUserToGoogleSheet(user, displayName, phone, email);
        showToast('success', "註冊成功！歡迎加入會員");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        showToast('success', "登入成功！");
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      let msg = "發生錯誤，請稍後再試";
      if (err.code === 'auth/operation-not-allowed') {
        if (mode === 'register') {
          try {
            if (auth.currentUser) {
              await updateProfile(auth.currentUser, { displayName: displayName || email.split('@')[0] });
              await syncUserToGoogleSheet(auth.currentUser, displayName || email.split('@')[0], phone, email);
              showToast('success', "預覽模式：已模擬註冊並同步資料！"); onClose(); return;
            }
          } catch (mockErr) { console.error(mockErr); }
        } else { msg = "無法登入：請確認您的 Firebase Console 已啟用 Email/Password 登入功能。"; }
      } else if (err.message) { msg = err.message; }
      setError(msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose}></div><div className="bg-white rounded-2xl overflow-hidden shadow-2xl w-full max-w-sm relative z-10 p-8 animate-fade-in-up max-h-[90vh] overflow-y-auto"><button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button><div className="text-center mb-6"><h2 className="text-2xl font-bold text-gray-900">{mode === 'login' ? '會員登入' : '註冊新帳號'}</h2></div><form onSubmit={handleSubmit} className="space-y-4">{mode === 'register' && (<><div><label className="block text-sm font-medium text-gray-700 mb-1">您的暱稱</label><input type="text" required className="w-full pl-3 py-2 border border-gray-300 rounded-lg" placeholder="例如：王小明" value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">手機號碼</label><input type="tel" required className="w-full pl-3 py-2 border border-gray-300 rounded-lg" placeholder="0912345678" value={phone} onChange={(e) => setPhone(e.target.value)} /></div></>)}<div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label><input type="email" required className="w-full pl-3 py-2 border border-gray-300 rounded-lg" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">密碼</label><input type="password" required className="w-full pl-3 py-2 border border-gray-300 rounded-lg" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} /></div>{mode === 'register' && (<div><label className="block text-sm font-medium text-gray-700 mb-1">確認密碼</label><input type="password" required className="w-full pl-3 py-2 border border-gray-300 rounded-lg" placeholder="再次輸入密碼" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>)}{error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>}<button type="submit" disabled={loading} className="w-full py-2.5 rounded-lg font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md">{loading ? '處理中...' : (mode === 'login' ? '立即登入' : '註冊帳號')}</button></form><div className="mt-6 text-center text-sm text-gray-500">{mode === 'login' ? (<>還沒有帳號嗎？ <button onClick={() => setMode('register')} className="text-indigo-600 font-bold hover:underline ml-1">免費註冊</button></>) : (<>已經有帳號了？ <button onClick={() => setMode('login')} className="text-indigo-600 font-bold hover:underline ml-1">返回登入</button></>)}</div></div></div>
  );
};

const Navbar = ({ user, cartCount, onToggleCart, activeTab, setActiveTab, onOpenAuth, onLogout }: any) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  return (
    <nav className="bg-white shadow-sm sticky top-0 z-40 border-b border-indigo-100"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><div className="flex justify-between h-16"><div className="flex items-center cursor-pointer" onClick={() => setActiveTab('home')}><div className="bg-indigo-600 p-1.5 rounded-lg mr-2"><ShoppingBag className="h-5 w-5 text-white" /></div><span className="text-xl font-bold text-gray-800">愛團購 <span className="text-indigo-600 text-sm font-normal">顧客商城</span></span></div><div className="hidden md:flex items-center space-x-6"><button onClick={() => setActiveTab('home')} className={`text-sm font-medium ${activeTab === 'home' ? 'text-indigo-600 font-bold' : 'text-gray-500'}`}>熱門開團</button><button onClick={() => setActiveTab('orders')} className={`text-sm font-medium ${activeTab === 'orders' ? 'text-indigo-600 font-bold' : 'text-gray-500'}`}>我的訂單</button><div className="h-6 border-l border-gray-200 mx-2"></div>{(!user || user.isAnonymous) ? (<div className="flex items-center space-x-2"><button onClick={() => onOpenAuth('login')} className="text-gray-600 hover:text-indigo-600 text-sm font-medium px-3 py-1.5"><LogIn className="w-4 h-4 mr-1.5" /> 登入</button><button onClick={() => onOpenAuth('register')} className="bg-indigo-600 text-white text-sm font-bold px-4 py-1.5 rounded-full"><UserPlus className="w-4 h-4 mr-1.5" /> 註冊</button></div>) : (<div className="flex items-center space-x-4"><div className="flex items-center text-gray-700 text-sm font-medium"><div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 mr-2"><UserIcon className="w-4 h-4" /></div><span>{user.displayName || user.email}</span></div><button onClick={onLogout} className="text-gray-400 hover:text-red-500 p-1"><LogOut className="w-5 h-5" /></button></div>)}<div className="relative cursor-pointer group ml-2" onClick={onToggleCart}><div className="p-2 rounded-full group-hover:bg-gray-100"><Package className="h-6 w-6 text-gray-600" /></div>{cartCount > 0 && <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">{cartCount}</span>}</div></div><div className="md:hidden flex items-center gap-4"><div className="relative cursor-pointer" onClick={onToggleCart}><Package className="h-6 w-6 text-gray-600" />{cartCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">{cartCount}</span>}</div><button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-gray-600"><Menu className="h-6 w-6" /></button></div></div></div>{isMenuOpen && (<div className="md:hidden bg-white border-t px-4 py-2 space-y-2"><button onClick={() => { setActiveTab('home'); setIsMenuOpen(false); }} className="block w-full text-left py-3 border-b">熱門開團</button><button onClick={() => { setActiveTab('orders'); setIsMenuOpen(false); }} className="block w-full text-left py-3 border-b">我的訂單</button>{(!user || user.isAnonymous) ? (<div className="grid grid-cols-2 gap-4 py-2"><button onClick={() => onOpenAuth('login')} className="border border-gray-300 rounded-lg py-2">登入</button><button onClick={() => onOpenAuth('register')} className="bg-indigo-600 text-white rounded-lg py-2">註冊</button></div>) : (<div className="py-2 flex justify-between items-center"><span className="text-sm text-gray-600">Hi, {user.displayName}</span><button onClick={onLogout} className="text-red-500 border border-red-200 px-3 py-1 rounded">登出</button></div>)}</div>)}</nav>
  );
};

const GroupBuyCard = ({ groupBuy, onAddToCart }: { groupBuy: GroupBuy, onAddToCart: (gb: GroupBuy, p: Product, v: ProductVariant, qty: number) => void }) => {
  if (!groupBuy || !groupBuy.products || groupBuy.products.length === 0) return (<div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center h-32"><p className="text-gray-400">載入中...</p></div>);
  
  const isSuccess = groupBuy.currentValue >= groupBuy.thresholdValue;
  const [selectedProduct, setSelectedProduct] = useState<Product>(groupBuy.products[0]);
  const initialVariant = groupBuy.products[0]?.variants?.[0] || null;
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(initialVariant);
  const [buyQuantity, setBuyQuantity] = useState(1);

  useEffect(() => {
    if (selectedVariant) {
        const currentProd = groupBuy.products.find(p => p.id === selectedProduct.id);
        const currentVar = currentProd?.variants.find(v => v.id === selectedVariant.id);
        if (currentVar) setSelectedVariant(currentVar);
    }
  }, [groupBuy]);

  const handleProductChange = (pId: string) => {
    const prod = groupBuy.products.find(p => p.id === pId);
    if (prod && prod.variants && prod.variants.length > 0) { setSelectedProduct(prod); setSelectedVariant(prod.variants[0]); setBuyQuantity(1); }
  };
  
  const currentStock = selectedVariant ? (selectedVariant.stock - selectedVariant.sold) : 0;
  const incrementQty = () => setBuyQuantity(prev => Math.min(prev + 1, currentStock));
  const decrementQty = () => setBuyQuantity(prev => Math.max(prev - 1, 1));

  return (
    <div className="bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all border border-gray-100 overflow-hidden flex flex-col h-full group">
      {/* 移除圖片區塊 */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 h-2"></div>
      
      <div className="p-5 flex flex-col flex-1">
        <div className="mb-4">
          <div className="flex justify-between items-start mb-2">
             <h3 className="text-lg font-bold text-gray-900 line-clamp-2 flex-1 mr-2">{groupBuy.title}</h3>
             <span className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap ${isSuccess ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
               {isSuccess ? '🎉 已成團' : '🔥 搶購中'}
             </span>
          </div>
          <p className="text-sm text-gray-500 line-clamp-3 mb-4">{groupBuy.description}</p>
        </div>
        
        <div className="space-y-4 mt-auto border-t pt-4 border-gray-100">
          {groupBuy.products.length > 1 && (<select className="block w-full text-sm border-gray-200 rounded-lg py-2.5" value={selectedProduct.id} onChange={(e) => handleProductChange(e.target.value)}>{groupBuy.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>)}
          <div className="relative"><select className="block w-full text-sm border-gray-200 rounded-lg bg-white py-2.5 pr-8 appearance-none" value={selectedVariant?.id || ''} onChange={(e) => { const v = selectedProduct.variants.find(v => v.id === e.target.value); if (v) { setSelectedVariant(v); setBuyQuantity(1); } }}>{selectedProduct.variants.map(v => { const stock = v.stock - v.sold; return (<option key={v.id} value={v.id} disabled={stock <= 0}>{v.name} - {formatCurrency(v.price)} {stock <= 0 ? '(售完)' : `(剩 ${stock})`}</option>) })}</select></div>
          <div className="flex items-center justify-between gap-3"><div className="flex items-center border border-gray-300 rounded-lg"><button onClick={decrementQty} className="px-3 py-1 text-gray-600 hover:bg-gray-100 rounded-l-lg disabled:opacity-50" disabled={buyQuantity <= 1}>-</button><span className="px-2 text-sm font-bold w-8 text-center">{buyQuantity}</span><button onClick={incrementQty} className="px-3 py-1 text-gray-600 hover:bg-gray-100 rounded-r-lg disabled:opacity-50" disabled={buyQuantity >= currentStock}>+</button></div><button disabled={!selectedVariant || currentStock <= 0} onClick={() => selectedVariant && onAddToCart(groupBuy, selectedProduct, selectedVariant, buyQuantity)} className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold shadow-md hover:shadow-lg transition-all active:scale-95 ${!selectedVariant || currentStock <= 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>{currentStock <= 0 ? '已售完' : '加入購物車'}</button></div>
          <div className="pt-2 flex justify-center"><CountdownTimer targetDate={groupBuy.endTime} /></div></div></div></div>
  );
};

const CartDrawer = ({ isOpen, onClose, cart, onRemove, onCheckout }: any) => { if (!isOpen) return null; const total = cart.reduce((sum: number, item: CartItem) => sum + (item.price * item.quantity), 0); return (<div className="fixed inset-0 z-50 overflow-hidden"><div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose}></div><div className="fixed inset-y-0 right-0 max-w-full flex"><div className="w-screen max-w-md bg-white shadow-2xl flex flex-col h-full animate-slide-in-right"><div className="flex items-center justify-between px-6 py-4 border-b border-gray-100"><h2 className="text-lg font-bold flex items-center gap-2"><ShoppingBag className="w-5 h-5 text-indigo-600"/> 購物車</h2><button onClick={onClose}><X className="h-5 w-5 text-gray-500" /></button></div><div className="flex-1 py-6 overflow-y-auto px-6">{cart.length === 0 ? (<div className="text-center text-gray-400 mt-20"><ShoppingBag className="h-8 w-8 mx-auto mb-4 text-gray-300" /><p>購物車是空的</p></div>) : (<ul className="divide-y divide-gray-100">{cart.map((item: CartItem, index: number) => (<li key={`${item.variantId}-${index}`} className="py-5 flex gap-4"><div className="flex-1"><div className="flex justify-between font-bold text-gray-900"><h3>{item.name}</h3><p>{formatCurrency(item.price * item.quantity)}</p></div><p className="text-sm text-gray-500">{item.variantName} x {item.quantity}</p><div className="flex items-center justify-between"><span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded">{item.groupBuyTitle}</span><button onClick={() => onRemove(index)} className="text-red-400 text-sm flex items-center gap-1"><Trash2 className="w-3 h-3"/>移除</button></div></div></li>))}</ul>)}</div><div className="border-t border-gray-200 px-6 py-6 bg-gray-50"><div className="flex justify-between text-base font-bold mb-4"><p>總計金額</p><p className="text-xl text-indigo-600">{formatCurrency(total)}</p></div><button onClick={onCheckout} disabled={cart.length === 0} className="w-full py-3.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg disabled:bg-gray-300">前往結帳</button></div></div></div></div>); };
const CheckoutModal = ({ isOpen, onClose, onSubmit }: any) => { if (!isOpen) return null; const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); const fd = new FormData(e.target as HTMLFormElement); onSubmit({ name: fd.get('name'), phone: fd.get('phone') }); }; return (<div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose}></div><div className="bg-white rounded-2xl overflow-hidden shadow-2xl w-full max-w-md relative z-10"><div className="bg-indigo-600 px-6 py-4 flex justify-between items-center"><h3 className="text-lg font-bold text-white">收件資訊</h3><button onClick={onClose}><X className="w-5 h-5 text-indigo-100 hover:text-white"/></button></div><form onSubmit={handleSubmit} className="p-6 space-y-5"><div><label className="text-sm font-bold text-gray-700 block mb-1">姓名</label><input required name="name" className="block w-full border border-gray-300 rounded-lg py-2.5 px-3" /></div><div><label className="text-sm font-bold text-gray-700 block mb-1">電話</label><input required name="phone" className="block w-full border border-gray-300 rounded-lg py-2.5 px-3" /></div><button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 shadow-lg">確認下單</button></form></div></div>); };

// --- 5. 主程式 ---
export default function CustomerApp() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('home');
  const [groupBuys, setGroupBuys] = useState<GroupBuy[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'info' });
  const [isGuestConfirmOpen, setIsGuestConfirmOpen] = useState(false);
  const [pendingShippingInfo, setPendingShippingInfo] = useState<any>(null);
  const [loadingGroupBuys, setLoadingGroupBuys] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      // @ts-ignore: 全域變數在本地開發時可能不存在
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        // @ts-ignore
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  // --- 從 Google Sheet 取得團購資料 ---
  const fetchGroupBuys = async () => {
    setLoadingGroupBuys(true);
    if (!GAS_API_URL) {
       const q = query(collection(db, 'groupBuys'), orderBy('endTime', 'asc'));
       onSnapshot(q, (snapshot) => {
         setGroupBuys(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GroupBuy)));
         setLoadingGroupBuys(false);
       });
       return;
    }

    try {
      const res = await fetch(`${GAS_API_URL}?action=getGroupBuys`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setGroupBuys(data);
      } else {
        console.error("Format error from GAS", data);
      }
    } catch (err) {
      console.error("Fetch GAS failed", err);
    } finally {
      setLoadingGroupBuys(false);
    }
  };

  useEffect(() => {
    fetchGroupBuys();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'orders'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
    });
  }, [user]);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => { setToast({ show: true, message, type }); };

  const handleAddToCart = (gb: GroupBuy, p: Product, v: ProductVariant, qty: number) => {
    setCart(prev => {
      const existing = prev.find(item => item.variantId === v.id);
      if (existing) { showToast('success', '已更新購物車數量'); return prev.map(item => item.variantId === v.id ? { ...item, quantity: item.quantity + qty } : item); }
      showToast('success', '已加入購物車'); return [...prev, { groupBuyId: gb.id, productId: p.id, variantId: v.id, name: p.name, variantName: v.name, price: v.price, quantity: qty, maxStock: v.stock, groupBuyTitle: gb.title }];
    });
  };

  const processOrder = async (shippingInfo: any) => {
    try {
      const groups = new Set(cart.map(i => i.groupBuyId));
      for (const gid of groups) {
        const items = cart.filter(i => i.groupBuyId === gid);
        const groupBuy = groupBuys.find(g => g.id === gid);
        const totalAmount = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        
        await runTransaction(db, async (transaction) => {
            const gbRef = doc(db, 'groupBuys', gid);
            const gbDoc = await transaction.get(gbRef);
            if (!gbDoc.exists()) {
                // 如果是 GAS 來的資料，Firestore 可能沒有這筆文件，這裡需要斟酌處理
                // 在此範例中，我們假設若無文件則跳過庫存檢查（或直接下單）
                return; 
            }
            const gbData = gbDoc.data() as GroupBuy;
            const newProducts = [...gbData.products];
            for (const item of items) {
                const pIndex = newProducts.findIndex(p => p.id === item.productId);
                if (pIndex === -1) continue;
                const vIndex = newProducts[pIndex].variants.findIndex(v => v.id === item.variantId);
                if (vIndex === -1) continue;
                if ((newProducts[pIndex].variants[vIndex].stock - newProducts[pIndex].variants[vIndex].sold) < item.quantity) {
                    throw new Error(`商品 ${item.name} 庫存不足`);
                }
                newProducts[pIndex].variants[vIndex].sold += item.quantity;
            }
            transaction.update(gbRef, { products: newProducts });
        });

        // 訂單狀態預設為 '未出貨'
        const orderData = { 
          userId: user?.uid, 
          groupBuyId: gid, 
          groupBuyTitle: groupBuy?.title || 'Unknown', 
          items: items, 
          totalAmount: totalAmount, 
          status: '未出貨',
          shippingInfo: shippingInfo, 
          createdAt: serverTimestamp() 
        };
        const docRef = await addDoc(collection(db, 'orders'), orderData);
        await syncOrderToGoogleSheet(docRef.id, orderData);
      }
      setCart([]); setIsCheckoutOpen(false); setIsCartOpen(false); setActiveTab('orders'); showToast('success', "下單成功！");
    } catch (error: any) { console.error(error); showToast('error', error.message || "下單失敗"); }
  };

  const handleCheckoutSubmit = (shippingInfo: any) => { if (!user) return; if (user.isAnonymous) { setPendingShippingInfo(shippingInfo); setIsGuestConfirmOpen(true); setIsCheckoutOpen(false); } else { processOrder(shippingInfo); } };
  const handleGuestContinue = () => { setIsGuestConfirmOpen(false); if (pendingShippingInfo) { processOrder(pendingShippingInfo); setPendingShippingInfo(null); } };
  const handleGuestToLogin = () => { setIsGuestConfirmOpen(false); setAuthMode('register'); setIsAuthModalOpen(true); };
  const openAuth = (mode: 'login' | 'register') => { setAuthMode(mode); setIsAuthModalOpen(true); };
  const handleLogout = () => { signOut(auth).then(() => { showToast('info', '已成功登出'); signInAnonymously(auth); }); }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* 補上自定義動畫樣式，確保 UI 正常顯示 */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes bounceIn { 0% { transform: scale(0.8); opacity: 0; } 50% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }
        .animate-fade-in { animation: fadeIn 0.5s ease-out; }
        .animate-fade-in-up { animation: fadeInUp 0.5s ease-out; }
        .animate-slide-in-right { animation: slideInRight 0.3s ease-out; }
        .animate-bounce-in { animation: bounceIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
      `}</style>

      <Toast {...toast} onClose={() => setToast(prev => ({ ...prev, show: false }))} />
      <Navbar user={user} cartCount={cart.length} onToggleCart={() => setIsCartOpen(true)} activeTab={activeTab} setActiveTab={setActiveTab} onOpenAuth={openAuth} onLogout={handleLogout} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'home' && (
          <div className="animate-fade-in">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">🔥 熱門開團 (資料來源: Google Sheet)</h2>
                <button onClick={fetchGroupBuys} className="text-sm bg-white border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 flex items-center gap-2"><RefreshCw className={`w-4 h-4 ${loadingGroupBuys ? 'animate-spin' : ''}`}/> 重新整理</button>
             </div>
             {loadingGroupBuys ? (
                <div className="text-center py-20"><p className="text-gray-500">正在從 Google Sheet 讀取最新團購資訊...</p></div>
             ) : groupBuys.length === 0 ? (
                <div className="text-center py-24 bg-white rounded-3xl shadow-sm border border-gray-100"><div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><Package className="w-8 h-8 text-gray-400" /></div><h3 className="text-lg font-bold text-gray-900">目前沒有進行中的活動</h3></div>
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                 {/* [修改] 過濾掉狀態為 closed 的活動 */}
                 {groupBuys.filter(gb => {
                   if (gb.status === 'closed') return false;
                   const now = new Date();
                   const endDate = gb.endTime?.toDate ? gb.endTime.toDate() : new Date(gb.endTime);
                   if (!isNaN(endDate.getTime()) && now > endDate) return false;
                   const hasStock = gb.products.some(p => p.variants && p.variants.some(v => (v.stock - v.sold) > 0));
                   if (gb.products.length > 0 && gb.products[0].variants.length > 0 && !hasStock) return false;
                   return true;
                 }).map(gb => <GroupBuyCard key={gb.id} groupBuy={gb} onAddToCart={handleAddToCart} />)}
               </div>
             )}
          </div>
        )}
        {activeTab === 'orders' && (<div className="max-w-4xl mx-auto"><h2 className="text-2xl font-bold mb-6 flex items-center"><List className="mr-2 text-indigo-600" /> 我的訂單記錄</h2><div className="space-y-4">{(!user || user.isAnonymous) && orders.length === 0 ? (<div className="bg-white p-12 rounded-2xl text-center shadow-sm border border-gray-100"><p className="text-gray-500 font-medium mb-4">您目前是訪客身份</p><button onClick={() => openAuth('login')} className="bg-indigo-600 text-white px-6 py-2 rounded-full font-bold shadow hover:bg-indigo-700 transition-colors">登入以查看歷史訂單</button></div>) : orders.length === 0 ? (<div className="bg-white p-12 rounded-2xl text-center shadow-sm border border-gray-100"><p className="text-gray-500 font-medium">您還沒有任何訂單</p><button onClick={() => setActiveTab('home')} className="mt-4 text-indigo-600 font-bold hover:underline">去逛逛</button></div>) : orders.map(order => (<div key={order.id} className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6"><div className="flex justify-between items-start mb-4 pb-4 border-b border-gray-100"><div><div className="text-xs text-gray-400 mb-1">訂單編號 #{order.id.slice(0,6)}</div><h3 className="font-bold text-lg">{order.groupBuyTitle}</h3></div><div className="text-right"><div className="text-xl font-bold text-indigo-600">{formatCurrency(order.totalAmount)}</div><div className={`text-xs font-bold px-2 py-1 rounded-full inline-block mt-1 text-gray-600 ${order.status === '未出貨' ? 'bg-yellow-100 text-yellow-800' : order.status === '已出貨' ? 'bg-blue-100 text-blue-800' : order.status === '已完成' ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>{order.status}</div></div></div><ul className="space-y-2">{order.items.map((item, i) => (<li key={i} className="flex justify-between text-sm text-gray-700"><span>{item.name} ({item.variantName}) x {item.quantity}</span><span>{formatCurrency(item.price * item.quantity)}</span></li>))}</ul></div>))}</div></div>)}
      </main>
      
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} initialMode={authMode} showToast={showToast} />
      
      {/* 修正：移除多餘的 ConfirmDialog，只保留下方的手動實作區塊，避免重複 */}
      
      {isGuestConfirmOpen && (<div className="fixed inset-0 z-[60] flex items-center justify-center p-4"><div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setIsGuestConfirmOpen(false)}></div><div className="bg-white rounded-xl shadow-2xl w-full max-w-sm relative z-10 p-6 animate-fade-in-up"><h3 className="text-xl font-bold text-gray-900 mb-2">訪客結帳確認</h3><p className="text-gray-600 mb-6">建議您先註冊會員，以便日後查詢訂單。若選擇訪客結帳，請自行記錄訂單編號。</p><div className="flex flex-col gap-3"><button onClick={handleGuestToLogin} className="w-full py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md">免費註冊 (推薦)</button><button onClick={handleGuestContinue} className="w-full py-2.5 bg-white border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 rounded-lg">以訪客身份結帳</button></div></div></div>)}
      
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} cart={cart} onRemove={(idx: number) => setCart(p => p.filter((_, i) => i !== idx))} onCheckout={() => setIsCheckoutOpen(true)} />
      <CheckoutModal isOpen={isCheckoutOpen} onClose={() => setIsCheckoutOpen(false)} onSubmit={handleCheckoutSubmit} />
    </div>
  );
}