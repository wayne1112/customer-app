import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken,
  signInAnonymously,
  onAuthStateChanged
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  onSnapshot, 
  orderBy, 
  doc, 
  updateDoc,
  deleteDoc // 引入刪除功能
} from 'firebase/firestore';
import { 
  LayoutDashboard, 
  List, 
  Store, 
  Settings, 
  LogOut, 
  TrendingUp, 
  Lock, 
  PlusCircle,
  X,
  Plus,
  Trash2,
  Save,
  Package,
  MapPin,
  ChevronDown,
  ChevronUp,
  Edit,
  StopCircle,
  AlertTriangle,
  RefreshCw,
  User as UserIcon,
  Phone
} from 'lucide-react';

// --- 設定區 (請修改這裡) ---
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbzWLVF8ICXhskZimWBqlsSTOOFdo01sGcm5jMa3EGnDQGl2kclG4xRp0bd9YaScF6pCpw/exec";

// ⚠️ 請將下方的設定替換為您從 Firebase Console 複製的真實內容
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
  description: string;
  status: string;
  thresholdValue: number;
  currentValue: number;
  startTime: any;
  endTime: any;
  products: Product[];
}

interface CartItem {
  name: string;
  variantName: string;
  price: number;
  quantity: number;
}

interface Order {
  id: string;
  groupBuyTitle: string;
  items: CartItem[];
  totalAmount: number;
  status: string;
  shippingInfo: { name: string; phone: string; address: string };
  createdAt: any;
}

// --- 3. 輔助函式 ---

const syncGroupBuyToGoogleSheet = async (groupBuyData: any, action: 'create' | 'update' | 'delete') => {
  if (!GAS_API_URL || !GAS_API_URL.includes("script.google.com")) return;
  
  let type = 'group_buy';
  if (action === 'update') type = 'update_group_buy';
  if (action === 'delete') type = 'delete_group_buy';

  const variants = groupBuyData.products && groupBuyData.products[0] ? groupBuyData.products[0].variants : [];

  const payload = {
    type: type, 
    created_at: new Date().toISOString(),
    group_id: groupBuyData.id, 
    title: groupBuyData.title || '',
    description: groupBuyData.description || '',
    threshold: groupBuyData.thresholdValue || 0,
    end_time: groupBuyData.endTime ? new Date(groupBuyData.endTime).toLocaleString() : '',
    variants: variants
  };

  try {
    await fetch(GAS_API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) { 
    console.error("Sheet 同步失敗", err); 
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case '未出貨': return 'bg-amber-100 text-amber-700 border-amber-200';
    case '已出貨': return 'bg-blue-100 text-blue-700 border-blue-200';
    case '已完成': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case '已取消': return 'bg-red-100 text-red-700 border-red-200';
    default: return 'bg-slate-100 text-slate-500 border-slate-200';
  }
};

// --- 4. 輔助元件 ---

const LoginScreen = ({ onLogin }: { onLogin: () => void }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '8888') onLogin();
    else setError('密碼錯誤');
  };
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-sm text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-slate-800" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">老闆後台管理</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="password" placeholder="密碼 (預設: 8888)" className="w-full text-center border-b-2 border-slate-200 py-2 focus:outline-none focus:border-indigo-600 text-lg" value={password} onChange={e => setPassword(e.target.value)} autoFocus />
          {error && <p className="text-red-500 text-xs font-bold">{error}</p>}
          <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg">登入系統</button>
        </form>
      </div>
    </div>
  );
};

const CampaignModal = ({ isOpen, onClose, initialData = null }: { isOpen: boolean, onClose: () => void, initialData?: GroupBuy | null }) => {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [threshold, setThreshold] = useState(10);
  const [endDate, setEndDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [variants, setVariants] = useState([{ id: Date.now(), name: '', price: 0, stock: 0 }]);

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
      setDesc(initialData.description);
      setThreshold(initialData.thresholdValue);
      try {
        const d = initialData.endTime?.toDate ? initialData.endTime.toDate() : new Date(initialData.endTime);
        const tzOffset = d.getTimezoneOffset() * 60000; 
        const localISOTime = (new Date(d - tzOffset)).toISOString().slice(0, 16);
        setEndDate(localISOTime);
      } catch (e) { setEndDate(''); }
      
      if (initialData.products && initialData.products.length > 0) {
        const prod = initialData.products[0];
        if (prod.variants) {
          setVariants(prod.variants.map((v: any) => ({
            id: v.id || Date.now(),
            name: v.name,
            price: v.price,
            stock: v.stock
          })));
        }
      }
    } else {
      setTitle(''); setDesc(''); setThreshold(10); setEndDate('');
      setVariants([{ id: Date.now(), name: '', price: 0, stock: 0 }]);
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleAddVariant = () => setVariants([...variants, { id: Date.now(), name: '', price: 0, stock: 0 }]);
  const handleRemoveVariant = (id: number) => setVariants(variants.filter(v => v.id !== id));
  const handleVariantChange = (id: number, field: string, value: any) => setVariants(variants.map(v => v.id === id ? { ...v, [field]: value } : v));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (variants.length === 0) { alert("請至少新增一個商品規格"); return; }
    
    setIsSubmitting(true);
    try {
      const productData = {
        id: initialData ? initialData.products[0].id : `prod-${Date.now()}`,
        name: title,
        description: desc,
        imageUrl: 'https://images.unsplash.com/photo-1556740758-90de374c12ad',
        variants: variants.map(v => ({
          id: String(v.id).startsWith('var-') ? v.id : `var-${v.id}`, 
          name: v.name,
          price: Number(v.price),
          stock: Number(v.stock),
          sold: initialData ? (initialData.products[0].variants.find((oldV:any) => oldV.id === v.id)?.sold || 0) : 0
        }))
      };

      const campaignData = {
        title: title,
        description: desc,
        thresholdType: 'quantity',
        thresholdValue: Number(threshold),
        endTime: new Date(endDate),
        products: [productData],
        status: initialData ? initialData.status : 'open',
        currentValue: initialData ? initialData.currentValue : 0,
        startTime: initialData ? initialData.startTime : new Date(),
      };

      if (initialData) {
        await updateDoc(doc(db, 'groupBuys', initialData.id), campaignData);
        await syncGroupBuyToGoogleSheet({ ...campaignData, id: initialData.id }, 'update');
        alert("活動已更新！並同步至試算表。");
      } else {
        const docRef = await addDoc(collection(db, 'groupBuys'), campaignData);
        await syncGroupBuyToGoogleSheet({ ...campaignData, id: docRef.id }, 'create');
        alert("開團成功！");
      }
      onClose();
    } catch (error) {
      console.error(error);
      alert("儲存失敗，請檢查網路或稍後再試");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl relative z-10 p-8 animate-fade-in-up max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6 border-b pb-4">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            {initialData ? <Edit className="text-indigo-600"/> : <PlusCircle className="text-indigo-600"/>}
            {initialData ? '編輯團購活動' : '建立新團購活動'}
          </h2>
          <button onClick={onClose}><X className="w-6 h-6 text-gray-400 hover:text-gray-600" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-bold text-gray-700 mb-1">活動標題</label><input required value={title} onChange={e => setTitle(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2" /></div>
            <div><label className="block text-sm font-bold text-gray-700 mb-1">目標數量</label><input type="number" required value={threshold} onChange={e => setThreshold(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg p-2" /></div>
          </div>
          <div><label className="block text-sm font-bold text-gray-700 mb-1">活動描述</label><textarea required value={desc} onChange={e => setDesc(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-lg p-2" /></div>
          <div><label className="block text-sm font-bold text-gray-700 mb-1">截止時間</label><input type="datetime-local" required value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2" /></div>
          
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-700 text-sm">商品規格</h3>
              <button type="button" onClick={handleAddVariant} className="text-xs bg-white border border-indigo-200 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-50 flex items-center"><Plus className="w-3 h-3 mr-1"/>新增</button>
            </div>
            <div className="space-y-2">
              {variants.map((v, idx) => (
                <div key={v.id} className="flex gap-2 items-center">
                  <span className="text-xs text-gray-400 w-4">{idx+1}.</span>
                  <input required placeholder="規格名稱" value={v.name} onChange={e => handleVariantChange(v.id, 'name', e.target.value)} className="flex-1 border rounded p-1.5 text-sm" />
                  <input required type="number" placeholder="價格" value={v.price} onChange={e => handleVariantChange(v.id, 'price', e.target.value)} className="w-20 border rounded p-1.5 text-sm" />
                  <input required type="number" placeholder="庫存" value={v.stock} onChange={e => handleVariantChange(v.id, 'stock', e.target.value)} className="w-20 border rounded p-1.5 text-sm" />
                  {variants.length > 1 && <button type="button" onClick={() => handleRemoveVariant(v.id)} className="text-red-400 p-1"><Trash2 className="w-4 h-4"/></button>}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded-lg">取消</button>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-lg" disabled={isSubmitting}>
              <Save className="w-4 h-4 mr-2 inline" /> {isSubmitting ? '處理中...' : '儲存設定'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const Sidebar = ({ activePage, setActivePage, onLogout }: any) => {
  const menuItems = [
    { id: 'dashboard', label: '營運總覽', icon: LayoutDashboard },
    { id: 'orders', label: '訂單管理', icon: List },
    { id: 'campaigns', label: '活動管理', icon: Store },
  ];
  return (
    <div className="w-64 bg-slate-900 text-white min-h-screen fixed left-0 top-0 flex flex-col z-50 shadow-2xl">
      <div className="h-20 flex items-center px-6 bg-slate-800 shadow-md">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center mr-3 shadow-lg shadow-indigo-900/50"><Settings className="w-6 h-6 text-white" /></div>
        <div><span className="text-lg font-extrabold tracking-wider block">BOSS</span><span className="text-xs text-indigo-400 font-bold tracking-widest">ADMIN PANEL</span></div>
      </div>
      <div className="flex-1 py-8 px-4 space-y-3">
        {menuItems.map(item => (
          <button key={item.id} onClick={() => setActivePage(item.id)} className={`w-full flex items-center px-4 py-3.5 text-sm font-bold rounded-xl transition-all duration-200 ${activePage === item.id ? 'bg-indigo-600 text-white shadow-lg translate-x-2' : 'text-slate-400 hover:bg-slate-800 hover:text-white hover:translate-x-1'}`}>
            <item.icon className={`w-5 h-5 mr-3 ${activePage === item.id ? 'text-white' : 'text-slate-500'}`} />{item.label}
          </button>
        ))}
      </div>
      <div className="p-4 border-t border-slate-800"><button onClick={onLogout} className="flex items-center justify-center text-slate-400 hover:text-red-400 text-sm w-full px-4 py-3 rounded-xl hover:bg-slate-800 transition-all font-bold"><LogOut className="w-5 h-5 mr-2" /> 登出系統</button></div>
    </div>
  );
};

const OrderRow = ({ order, updateStatus }: { order: Order, updateStatus: (id: string, val: string) => void }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const items = order.items || [];

  return (
    <>
      <tr className={`hover:bg-slate-50 transition-colors border-b border-slate-100`}>
        <td className="px-6 py-4 font-mono text-slate-400 align-top pt-5 text-xs">#{order.id.slice(0,6)}</td>
        <td className="px-6 py-4 align-top w-64">
          <div className="font-bold text-slate-800 text-sm mb-2 line-clamp-2">{order.groupBuyTitle}</div>
          <div className="flex flex-col gap-1.5 text-xs text-slate-500 bg-white p-2 rounded border border-slate-200"><span className="flex items-center gap-2"><UserIcon className="w-3 h-3 text-indigo-400"/> {order.shippingInfo?.name || '無名氏'}</span><span className="flex items-center gap-2"><Phone className="w-3 h-3 text-indigo-400"/> {order.shippingInfo?.phone || '無電話'}</span></div>
        </td>
        <td className="px-6 py-4 align-top">
           <div className="space-y-1.5">
            {items.length === 0 && <span className="text-red-400 text-xs">⚠️ 無商品資料</span>}
            {items.slice(0, isExpanded ? items.length : 2).map((item, idx) => (
              <div key={idx} className="text-sm text-slate-700 bg-slate-50 border border-slate-100 px-3 py-2 rounded-md flex justify-between items-center shadow-sm">
                <div><span className="font-medium text-slate-900 block">{item.name}</span><span className="text-xs text-slate-500 block">{item.variantName}</span></div>
                <span className="font-mono text-indigo-600 font-bold ml-4">x{item.quantity}</span>
              </div>
            ))}
            {items.length > 2 && !isExpanded && (<button onClick={() => setIsExpanded(true)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center mt-1">還有 {items.length - 2} 項商品 <ChevronDown className="w-3 h-3 ml-1"/></button>)}
            {isExpanded && items.length > 2 && (<button onClick={() => setIsExpanded(false)} className="text-xs text-slate-400 hover:text-slate-600 flex items-center mt-1">收合 <ChevronUp className="w-3 h-3 ml-1"/></button>)}
          </div>
        </td>
        <td className="px-6 py-4 font-bold text-indigo-600 align-top pt-5 text-right whitespace-nowrap text-base">{new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 }).format(order.totalAmount)}</td>
        <td className="px-6 py-4 align-top pt-5 text-center"><span className={`px-2 py-1 rounded text-xs font-bold border ${getStatusColor(order.status)} block w-20 mx-auto`}>{order.status}</span></td>
        <td className="px-6 py-4 align-top pt-4">
          <select value={order.status} onChange={(e) => updateStatus(order.id, e.target.value)} className="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700 cursor-pointer hover:border-indigo-300 transition-all w-24">
            <option value="未出貨">未出貨</option><option value="已出貨">已出貨</option><option value="已完成">已完成</option><option value="已取消">已取消</option>
          </select>
        </td>
      </tr>
    </>
  );
};

// --- 4. 主程式 ---
export default function AdminApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activePage, setActivePage] = useState('dashboard');
  const [orders, setOrders] = useState<Order[]>([]);
  const [groupBuys, setGroupBuys] = useState<GroupBuy[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<GroupBuy | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      // 這裡改成匿名登入 (因為是後台，您可能之後會想改成 Email 登入)
      await signInAnonymously(auth);
    };
    initAuth();
  }, []);

  const fetchOrdersFromSheet = async () => {
    setLoadingOrders(true);
    try {
      const res = await fetch(`${GAS_API_URL}?action=getOrders`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setOrders(data);
      }
    } catch (err) {
      console.error("Fetch Orders from Sheet failed", err);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    
    // 預設先監聽 Firestore (路徑已簡化為 'orders')
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        fetchOrdersFromSheet();
      } else {
        setOrders(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
      }
    });

    // 監聽 GroupBuys (路徑已簡化為 'groupBuys')
    const unsubGroupBuys = onSnapshot(query(collection(db, 'groupBuys'), orderBy('endTime', 'desc')), (snap) => setGroupBuys(snap.docs.map(d => ({ id: d.id, ...d.data() } as GroupBuy))));
    
    return () => { unsubscribe(); unsubGroupBuys(); };
  }, [isAuthenticated]);

  const updateOrderStatus = async (oid: string, val: string) => { await updateDoc(doc(db, 'orders', oid), { status: val }); };

  const handleCloseCampaign = async (campaign: GroupBuy) => {
    if (confirm("確定要結單嗎？這將會清空庫存，更新狀態為 'closed'，並從試算表中移除該活動。")) {
      
      // Optimistic UI: 先移除
      setGroupBuys(prev => prev.map(gb => 
        gb.id === campaign.id ? { ...gb, status: 'closed' } : gb
      ));

      try {
        const updatedProducts = campaign.products.map(p => ({
          ...p,
          variants: p.variants.map(v => ({ ...v, stock: 0 }))
        }));
        
        await updateDoc(doc(db, 'groupBuys', campaign.id), { status: 'closed', products: updatedProducts });
        await syncGroupBuyToGoogleSheet({ id: campaign.id }, 'delete'); 
      } catch (err) {
        console.error(err);
        alert("結單失敗，請稍後再試。");
      }
    }
  };

  const handleEditCampaign = (campaign: GroupBuy) => {
    setEditingCampaign(campaign);
    setIsModalOpen(true);
  };

  const handleCreateCampaign = () => {
    setEditingCampaign(null);
    setIsModalOpen(true);
  }

  if (!isAuthenticated) return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;

  const totalRevenue = orders.reduce((sum, o) => sum + (o.status !== '已取消' ? o.totalAmount : 0), 0);
  const activeCount = groupBuys.filter(g => g.status === 'open').length;
  const formatMoney = (n: number) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 }).format(n);

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex">
      <Sidebar activePage={activePage} setActivePage={setActivePage} onLogout={() => setIsAuthenticated(false)} />
      <main className="flex-1 ml-64 p-8">
        {activePage === 'dashboard' && (
          <div className="animate-fade-in">
            <h2 className="text-3xl font-black text-slate-800 mb-8 tracking-tight">營運總覽</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow"><div className="flex items-center gap-4"><div className="p-4 bg-emerald-100 rounded-xl text-emerald-600"><TrendingUp className="w-8 h-8"/></div><div><p className="text-sm text-slate-500 font-bold mb-1">累積營收</p><p className="text-3xl font-black text-slate-800">{formatMoney(totalRevenue)}</p></div></div></div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow"><div className="flex items-center gap-4"><div className="p-4 bg-blue-100 rounded-xl text-blue-600"><Store className="w-8 h-8"/></div><div><p className="text-sm text-slate-500 font-bold mb-1">進行中活動</p><p className="text-3xl font-black text-slate-800">{activeCount}</p></div></div></div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow"><div className="flex items-center gap-4"><div className="p-4 bg-amber-100 rounded-xl text-amber-600"><List className="w-8 h-8"/></div><div><p className="text-sm text-slate-500 font-bold mb-1">總訂單數</p><p className="text-3xl font-black text-slate-800">{orders.length}</p></div></div></div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center"><h3 className="font-bold text-slate-700 text-lg">最新訂單</h3><button onClick={() => setActivePage('orders')} className="text-sm text-indigo-600 font-bold hover:text-indigo-800 hover:underline">查看全部 &rarr;</button></div>
              <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider"><tr><th className="px-6 py-4">ID</th><th className="px-6 py-4 w-64">活動/顧客</th><th className="px-6 py-4">下單內容</th><th className="px-6 py-4 text-right">金額</th><th className="px-6 py-4 text-center">狀態</th><th className="px-6 py-4">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{orders.slice(0, 5).map(o => (<OrderRow key={o.id} order={o} updateStatus={updateOrderStatus} />))}</tbody></table></div>
            </div>
          </div>
        )}
        {activePage === 'orders' && (
          <div className="animate-fade-in">
            <div className="flex justify-between items-center mb-8">
               <h2 className="text-3xl font-black text-slate-800 tracking-tight">訂單管理</h2>
               <button onClick={fetchOrdersFromSheet} className="text-sm bg-white border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 flex items-center gap-2 shadow-sm text-slate-600"><RefreshCw className={`w-4 h-4 ${loadingOrders ? 'animate-spin' : ''}`}/> 從 Sheet 更新</button>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
               <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold"><tr><th className="px-6 py-4 whitespace-nowrap">訂單編號</th><th className="px-6 py-4 w-64">活動 / 顧客資訊</th><th className="px-6 py-4">下單內容</th><th className="px-6 py-4 whitespace-nowrap text-right">總金額</th><th className="px-6 py-4 whitespace-nowrap text-center">狀態</th><th className="px-6 py-4 whitespace-nowrap">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{orders.map(o => (<OrderRow key={o.id} order={o} updateStatus={updateOrderStatus} />))}</tbody></table></div>
            </div>
          </div>
        )}
        {activePage === 'campaigns' && (
          <div className="animate-fade-in">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">團購活動管理</h2>
              <button onClick={handleCreateCampaign} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-500/30 flex items-center gap-2 transition-all hover:-translate-y-1"><PlusCircle className="w-5 h-5" /> 新增活動</button>
            </div>
            <div className="grid grid-cols-1 gap-6">
              {groupBuys.filter(gb => gb.status !== 'closed').map(gb => (
                <div key={gb.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center hover:shadow-lg transition-shadow duration-300 group">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                       <h3 className="text-xl font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{gb.title}</h3>
                       <span className={`px-2 py-0.5 rounded text-xs font-bold ${gb.status === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{gb.status === 'open' ? '進行中' : '已結束'}</span>
                    </div>
                    <div className="text-slate-500 text-sm mb-3 flex items-center gap-4"><span>目標: <b>{gb.thresholdValue}</b></span><span className="text-slate-300">|</span><span>目前: <b className="text-indigo-600">{gb.currentValue}</b></span></div>
                    <div className="text-xs text-slate-400 bg-slate-50 p-2 rounded-lg inline-block">包含規格: {gb.products[0]?.variants.map((v:any) => `${v.name} ($${v.price})`).join(', ')}</div>
                  </div>
                  <div className="flex gap-3 mt-4 md:mt-0">
                    <button onClick={() => handleEditCampaign(gb)} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-bold text-sm hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-1"><Edit className="w-4 h-4"/> 編輯</button>
                    {gb.status === 'open' && (
                      <button onClick={() => handleCloseCampaign(gb)} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-bold text-sm hover:bg-red-100 transition-all flex items-center gap-1"><StopCircle className="w-4 h-4"/> 結單</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      <CampaignModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} initialData={editingCampaign} />
    </div>
  );
}